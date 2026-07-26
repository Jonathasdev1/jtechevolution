const { Pool } = require("pg");
const fs = require("fs/promises");
const path = require("path");

let pool = null;
let databaseUnavailable = false;
const databaseDir = path.join(__dirname, "..", "banco");
const LOCAL_CATALOG_FILE = path.join(databaseDir, ".catalog-local.json");
const SEED_FILE = path.join(databaseDir, "catalog-seed.json");

function getPool() {
    if (pool) {
        return pool;
    }

    const connectionString = process.env.DATABASE_URL || "";
    if (!connectionString) {
        throw new Error("Missing DATABASE_URL environment variable.");
    }

    // Railway PostgreSQL usually requires SSL in production environments.
    pool = new Pool({
        connectionString,
        ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false
    });

    return pool;
}

function shouldUseSsl() {
    const forceDisable = String(process.env.PGSSL_DISABLE || "").toLowerCase() === "true";
    return !forceDisable;
}

async function ensureCatalogTable() {
    if (!hasDatabaseConnection()) {
        return;
    }

    const client = await getPool().connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS jtech_catalog_state (
                id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                catalog JSONB NOT NULL DEFAULT '[]'::jsonb,
                promo_id TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
    } finally {
        client.release();
    }
}

async function readCatalogPayload() {
    if (!hasDatabaseConnection()) {
        return readLocalCatalogPayload();
    }

    try {
        await ensureCatalogTable();
        const client = await getPool().connect();
        try {
            const result = await client.query(
                "SELECT catalog, promo_id FROM jtech_catalog_state WHERE id = 1 LIMIT 1"
            );

            if (!result.rows.length) {
                return { catalog: [], promoId: "" };
            }

            const row = result.rows[0] || {};
            const catalog = Array.isArray(row.catalog) ? row.catalog : [];
            const promoId = typeof row.promo_id === "string" ? row.promo_id : "";

            return { catalog, promoId };
        } finally {
            client.release();
        }
    } catch (error) {
        markDatabaseUnavailable(error);
        return readLocalCatalogPayload();
    }
}

async function writeCatalogPayload(payload) {
    if (!hasDatabaseConnection()) {
        return writeLocalCatalogPayload(payload);
    }

    const catalog = Array.isArray(payload.catalog) ? payload.catalog : [];
    const promoId = typeof payload.promoId === "string" ? payload.promoId : "";

    try {
        await ensureCatalogTable();
        const client = await getPool().connect();
        try {
            await client.query(
                `
                INSERT INTO jtech_catalog_state (id, catalog, promo_id, updated_at)
                VALUES (1, $1::jsonb, $2, NOW())
                ON CONFLICT (id)
                DO UPDATE SET
                    catalog = EXCLUDED.catalog,
                    promo_id = EXCLUDED.promo_id,
                    updated_at = NOW()
                `,
                [JSON.stringify(catalog), promoId]
            );
        } finally {
            client.release();
        }
    } catch (error) {
        markDatabaseUnavailable(error);
        return writeLocalCatalogPayload(payload);
    }

    return { ok: true, catalogCount: catalog.length };
}

function hasDatabaseConnection() {
    return Boolean(process.env.DATABASE_URL) && !databaseUnavailable;
}

function markDatabaseUnavailable(error) {
    databaseUnavailable = true;
    console.warn("J-TECH database unavailable; using local catalog file fallback.", error.message);
}

async function readLocalCatalogPayload() {
    try {
        const raw = await fs.readFile(LOCAL_CATALOG_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.catalog)) {
            return { catalog: [], promoId: "" };
        }

        return {
            catalog: parsed.catalog,
            promoId: typeof parsed.promoId === "string" ? parsed.promoId : ""
        };
    } catch {
        return { catalog: [], promoId: "" };
    }
}

async function writeLocalCatalogPayload(payload) {
    const catalog = Array.isArray(payload.catalog) ? payload.catalog : [];
    const promoId = typeof payload.promoId === "string" ? payload.promoId : "";

    // Local preview fallback: keeps the API usable before Railway is configured.
    await fs.writeFile(
        LOCAL_CATALOG_FILE,
        JSON.stringify({ catalog, promoId, updatedAt: new Date().toISOString() }, null, 2),
        "utf8"
    );

    return { ok: true, catalogCount: catalog.length };
}

async function seedCatalogIfEmpty() {
    try {
        const raw = await fs.readFile(SEED_FILE, "utf8");
        const parsed = JSON.parse(raw);
        const seedCatalog = Array.isArray(parsed.catalog) ? parsed.catalog : (Array.isArray(parsed) ? parsed : []);
        if (!seedCatalog.length) {
            return;
        }

        const existing = await readCatalogPayload();
        if (existing.catalog.length > 0) {
            console.log(`J-TECH seed skipped: catalog already has ${existing.catalog.length} product(s).`);
            return;
        }

        const promoId = typeof parsed.promoId === "string" ? parsed.promoId : "";
        await writeCatalogPayload({ catalog: seedCatalog, promoId });
        console.log(`J-TECH seed applied: ${seedCatalog.length} product(s) loaded from catalog-seed.json.`);
    } catch (err) {
        if (err.code !== "ENOENT") {
            console.warn("J-TECH seed warning:", err.message);
        }
        // ENOENT = arquivo nao existe, comportamento normal sem seed
    }
}

module.exports = {
    readCatalogPayload,
    writeCatalogPayload,
    ensureCatalogTable,
    seedCatalogIfEmpty
};
