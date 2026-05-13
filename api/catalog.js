const { readCatalogPayload, writeCatalogPayload } = require("../catalog-store");

// This route stores the full catalog in a shared key/value backend.
// The storefront and admin both call it, so every device reads the same data.
module.exports = async function catalogHandler(req, res) {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (req.method === "GET") {
        const payload = await readCatalogPayload();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(payload));
        return;
    }

    if (req.method === "POST") {
        const body = await readRequestBody(req);
        const catalog = Array.isArray(body.catalog) ? body.catalog : [];
        const promoId = typeof body.promoId === "string" ? body.promoId : "";

        // Persist the latest catalog snapshot so the site can load it on any device.
        await writeCatalogPayload({ catalog, promoId });

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: true, catalogCount: catalog.length }));
        return;
    }

    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
};

function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => {
            chunks.push(chunk);
        });
        req.on("end", () => {
            try {
                const text = Buffer.concat(chunks).toString("utf8");
                resolve(text ? JSON.parse(text) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}
