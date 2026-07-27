const express = require("express");
const path = require("path");
const {
    readCatalogPayload,
    writeCatalogPayload,
    ensureCatalogTable,
    seedCatalogIfEmpty
} = require("./catalog-store");

// Base Express setup used by Railway and by local previews.
const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const defaultLocalAdminPassword = "JTECH@2026";
const projectRoot = path.join(__dirname, "..");
const frontendDir = path.join(__dirname, "..", "frontend");
const adminDir = path.join(__dirname, "..", "admin");
const imagesDir = path.join(__dirname, "..", "imagens");

// Small security defaults for a public storefront.
app.disable("x-powered-by");
app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
});

app.use((req, res, next) => {
    const allowedOrigin = resolveCorsOrigin(req);
    if (allowedOrigin) {
        res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept,X-Admin-Password");
    if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
    }
    next();
});

// Product images can be stored as optimized base64 payloads.
app.use(express.json({ limit: "25mb" }));

// Public catalog read endpoint used by storefront pages.
app.get("/api/catalog", async (_req, res) => {
    try {
        const payload = await readCatalogPayload();
        res.status(200).json(payload);
    } catch (error) {
        console.error("GET /api/catalog failed", error);
        res.status(500).json({ error: "Failed to load catalog" });
    }
});

// Admin login endpoint keeps the real password on the server.
app.post("/api/admin/login", (req, res) => {
    const password = String((req.body && req.body.password) || "");
    if (!getAdminPassword()) {
        res.status(500).json({ error: "ADMIN_PASSWORD is not configured" });
        return;
    }

    if (password !== getAdminPassword()) {
        res.status(401).json({ error: "Invalid admin password" });
        return;
    }

    res.status(200).json({ ok: true });
});

// Catalog writes are protected so visitors cannot change products.
app.post("/api/catalog", requireAdminPassword, async (req, res) => {
    try {
        const payload = normalizeCatalogPayload(req.body);
        const result = await writeCatalogPayload(payload);
        res.status(200).json(result);
    } catch (error) {
        console.error("POST /api/catalog failed", error);
        res.status(500).json({ error: "Failed to save catalog" });
    }
});

// Railway can use this route as a health check.
app.get("/api/health", (_req, res) => {
    res.status(200).json({
        ok: true,
        database: Boolean(process.env.DATABASE_URL),
        adminPassword: Boolean(getAdminPassword()),
        storage: process.env.DATABASE_URL ? "postgres" : "local-file"
    });
});

app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
});

// Static files live in the frontend folder.
app.get("/jtech-config.js", (_req, res) => {
    res.type("application/javascript");
    res.sendFile(path.join(projectRoot, "jtech-config.js"));
});

app.use("/img", express.static(imagesDir, {
    maxAge: isProduction ? "1h" : 0
}));

app.use(express.static(frontendDir, {
    extensions: ["html"],
    maxAge: isProduction ? "1h" : 0
}));

app.use("/admin", express.static(adminDir, {
    extensions: ["html"],
    maxAge: isProduction ? "1h" : 0
}));

app.use(express.static(adminDir, {
    extensions: ["html"],
    maxAge: isProduction ? "1h" : 0
}));

app.get("/admin.html", (_req, res) => {
    res.redirect(302, "/admin/login/");
});

app.get("/admin", (_req, res) => {
    res.redirect(302, "/admin/login/");
});

// Keep the same entry page behavior used before in static hosting.
app.get("/", (_req, res) => {
    res.sendFile(path.join(frontendDir, "j-tech.html"));
});

// One central password resolver keeps local development simple and production explicit.
function getAdminPassword() {
    const configured = String(process.env.ADMIN_PASSWORD || "").trim();
    if (configured) {
        return configured;
    }

    return isProduction ? "" : defaultLocalAdminPassword;
}

// Middleware used only on routes that change server data.
function requireAdminPassword(req, res, next) {
    const expectedPassword = getAdminPassword();
    const receivedPassword = String(req.get("X-Admin-Password") || "");

    if (!expectedPassword) {
        res.status(500).json({ error: "ADMIN_PASSWORD is not configured" });
        return;
    }

    if (receivedPassword !== expectedPassword) {
        res.status(401).json({ error: "Unauthorized catalog update" });
        return;
    }

    next();
}

function resolveCorsOrigin(req) {
    const origin = String(req.get("Origin") || "").trim();
    const configuredOrigins = String(process.env.CORS_ORIGIN || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    if (!origin) {
        return "";
    }

    if (!configuredOrigins.length || configuredOrigins.includes("*")) {
        return "*";
    }

    return configuredOrigins.includes(origin) ? origin : "";
}

// Normalize the write payload before it reaches the storage layer.
function normalizeCatalogPayload(body) {
    const source = body && typeof body === "object" ? body : {};
    return {
        catalog: Array.isArray(source.catalog) ? source.catalog : [],
        promoId: typeof source.promoId === "string" ? source.promoId : ""
    };
}

// Startup prepares storage first, then opens the web server.
async function start() {
    warnAboutRuntimeConfig();

    app.listen(port, "0.0.0.0", () => {
        console.log(`J-TECH server running on 0.0.0.0:${port}`);
    });

    // Keep Railway healthcheck responsive even when database bootstrapping is slow.
    try {
        await ensureCatalogTable();
        await seedCatalogIfEmpty();
    } catch (error) {
        console.error("J-TECH startup storage warning", error);
    }
}

function warnAboutRuntimeConfig() {
    // Keep the storefront online while Railway variables are being configured.
    if (isProduction && !process.env.DATABASE_URL) {
        console.warn("DATABASE_URL is not configured. Catalog changes will use local file storage and may not survive redeploys.");
    }

    if (!getAdminPassword()) {
        console.warn("ADMIN_PASSWORD is not configured. The admin panel login and catalog writes will be blocked.");
    }
}

start();
