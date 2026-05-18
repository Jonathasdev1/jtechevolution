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

// Small security defaults for a public storefront.
app.disable("x-powered-by");
app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
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
        adminPassword: Boolean(getAdminPassword())
    });
});

// Static files live in the project root.
app.use(express.static(__dirname, {
    extensions: ["html"],
    maxAge: isProduction ? "1h" : 0
}));

// Keep the same entry page behavior used before in static hosting.
app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "j-tech.html"));
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
    try {
        validateRuntimeConfig();
        await ensureCatalogTable();
        await seedCatalogIfEmpty();
        app.listen(port, () => {
            console.log(`J-TECH server running on port ${port}`);
        });
    } catch (error) {
        console.error("Failed to start server", error);
        process.exit(1);
    }
}

function validateRuntimeConfig() {
    // Railway production should not silently fall back to temporary local files.
    if (isProduction && !process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required in production.");
    }

    if (!getAdminPassword()) {
        throw new Error("ADMIN_PASSWORD is required in production.");
    }
}

start();
