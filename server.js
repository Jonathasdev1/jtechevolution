const express = require("express");
const path = require("path");
const { readCatalogPayload, writeCatalogPayload, ensureCatalogTable, seedCatalogIfEmpty } = require("./catalog-store");

const app = express();
const port = Number(process.env.PORT || 3000);

// Allow larger JSON payloads because product images can be stored as base64.
app.use(express.json({ limit: "25mb" }));

// Serve all static files (HTML, CSS, JS, images) from the project root.
app.use(express.static(__dirname));

app.get("/api/catalog", async (_req, res) => {
    try {
        const payload = await readCatalogPayload();
        res.status(200).json(payload);
    } catch (error) {
        console.error("GET /api/catalog failed", error);
        res.status(500).json({ error: "Failed to load catalog" });
    }
});

app.post("/api/catalog", async (req, res) => {
    try {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const payload = {
            catalog: Array.isArray(body.catalog) ? body.catalog : [],
            promoId: typeof body.promoId === "string" ? body.promoId : ""
        };

        const result = await writeCatalogPayload(payload);
        res.status(200).json(result);
    } catch (error) {
        console.error("POST /api/catalog failed", error);
        res.status(500).json({ error: "Failed to save catalog" });
    }
});

app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
});

// Keep the same entry page behavior used before in static hosting.
app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "j-tech.html"));
});

async function start() {
    try {
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

start();
