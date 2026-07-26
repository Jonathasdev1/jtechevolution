const STORAGE_KEYS = {
    promo: "jtechPromoProduct",
    catalog: "jtechProductCatalog",
    adminSession: "jtechAdminSession",
    adminPassword: "jtechAdminPassword"
};

const CATALOG_API_URL = getApiUrl("/api/catalog");

document.addEventListener("DOMContentLoaded", async () => {
    if (!hasAdminSession()) {
        window.location.href = "/admin/login/";
        return;
    }

    const productListWrap = document.getElementById("productListWrap");
    const productListCount = document.getElementById("productListCount");
    const productListSearch = document.getElementById("productListSearch");
    const productListSection = document.getElementById("productListSection");
    const clearListFiltersButton = document.getElementById("clearListFilters");

    if (!productListWrap || !productListCount) {
        return;
    }

    const state = {
        catalog: [],
        promoId: "",
        filters: {
            search: "",
            section: "all"
        }
    };

    const refresh = () => {
        renderProductList(state.catalog, productListWrap, productListCount, state.filters);
    };

    const payload = await loadCatalogPayload();
    state.catalog = payload.catalog;
    state.promoId = payload.promoId;
    refresh();

    if (productListSearch) {
        productListSearch.addEventListener("input", () => {
            state.filters.search = productListSearch.value.trim().toLowerCase();
            refresh();
        });
    }

    if (productListSection) {
        productListSection.addEventListener("change", () => {
            state.filters.section = productListSection.value || "all";
            refresh();
        });
    }

    if (clearListFiltersButton) {
        clearListFiltersButton.addEventListener("click", () => {
            state.filters.search = "";
            state.filters.section = "all";
            if (productListSearch) {
                productListSearch.value = "";
            }
            if (productListSection) {
                productListSection.value = "all";
            }
            refresh();
        });
    }

    productListWrap.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-list-action]");
        if (!actionButton) {
            return;
        }

        const productId = actionButton.dataset.productId;
        const action = actionButton.dataset.listAction;
        if (!productId || !action) {
            return;
        }

        if (action === "edit") {
            window.location.href = `/admin/cadastro/?edit=${encodeURIComponent(productId)}`;
            return;
        }

        if (action === "delete") {
            const selected = state.catalog.find((item) => item.id === productId);
            if (!selected) {
                showToast("Produto nao encontrado.");
                return;
            }

            const confirmed = window.confirm(`Excluir o produto \"${selected.title}\"?`);
            if (!confirmed) {
                return;
            }

            state.catalog = state.catalog.filter((item) => item.id !== productId);
            if (!(await saveCatalogPayload(state.catalog, state.promoId))) {
                return;
            }

            if (state.promoId === productId) {
                const fallback = state.catalog.find((item) => item.section === "promocoes") || state.catalog[0] || null;
                state.promoId = fallback ? fallback.id : "";
                localStorage.setItem(STORAGE_KEYS.promo, fallback ? JSON.stringify(fallback) : "");
                await saveCatalogPayload(state.catalog, state.promoId);
            }

            refresh();
            showToast("Produto excluido com sucesso.");
        }
    });
});

function hasAdminSession() {
    return sessionStorage.getItem(STORAGE_KEYS.adminSession) === "ok" && Boolean(sessionStorage.getItem(STORAGE_KEYS.adminPassword));
}

function getApiUrl(path) {
    const baseUrl = typeof window.JTECH_API_BASE_URL === "string" ? window.JTECH_API_BASE_URL.trim().replace(/\/+$/, "") : "";
    return baseUrl ? `${baseUrl}${path}` : path;
}

async function loadCatalogPayload() {
    if (!CATALOG_API_URL) {
        return loadLocalPayload();
    }

    try {
        const response = await fetch(CATALOG_API_URL, {
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            return loadLocalPayload();
        }

        const parsed = await response.json();
        const sourceCatalog = Array.isArray(parsed) ? parsed : Array.isArray(parsed.catalog) ? parsed.catalog : [];
        const sourcePromoId = parsed && typeof parsed.promoId === "string" ? parsed.promoId : "";

        return {
            catalog: sourceCatalog,
            promoId: sourcePromoId
        };
    } catch {
        return loadLocalPayload();
    }
}

function loadLocalPayload() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.catalog);
        const catalog = raw ? JSON.parse(raw) : [];
        const promoRaw = localStorage.getItem(STORAGE_KEYS.promo);
        const promo = promoRaw ? JSON.parse(promoRaw) : null;
        return {
            catalog: Array.isArray(catalog) ? catalog : [],
            promoId: promo && promo.id ? promo.id : ""
        };
    } catch {
        return { catalog: [], promoId: "" };
    }
}

async function saveCatalogPayload(catalog, promoId) {
    if (!CATALOG_API_URL) {
        return saveLocalPayload(catalog, promoId);
    }

    try {
        const response = await fetch(CATALOG_API_URL, {
            method: "POST",
            headers: {
                "X-Admin-Password": sessionStorage.getItem(STORAGE_KEYS.adminPassword) || "",
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                catalog,
                promoId: promoId || ""
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                sessionStorage.removeItem(STORAGE_KEYS.adminSession);
                sessionStorage.removeItem(STORAGE_KEYS.adminPassword);
                showToast("Sessao expirada. Faca login novamente.");
                window.location.href = "/admin/login/";
                return false;
            }
            showToast("Nao foi possivel sincronizar alteracoes.");
            return false;
        }

        return true;
    } catch {
        return saveLocalPayload(catalog, promoId);
    }
}

function saveLocalPayload(catalog, promoId) {
    try {
        localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify(catalog));
        if (promoId) {
            const promo = catalog.find((item) => item.id === promoId);
            if (promo) {
                localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(promo));
            }
        }
        return true;
    } catch {
        showToast("Nao foi possivel salvar localmente.");
        return false;
    }
}

function renderProductList(catalog, wrapElement, countElement, filters = null) {
    const source = Array.isArray(catalog) ? catalog : [];
    const filtered = filterCatalogItems(source, filters);
    const total = source.length;
    const hasActiveFilter = Boolean(filters && (filters.search || (filters.section && filters.section !== "all")));

    countElement.textContent = hasActiveFilter
        ? `${filtered.length} de ${total} produto${total === 1 ? "" : "s"}`
        : `${total} produto${total === 1 ? "" : "s"}`;

    if (!total) {
        wrapElement.innerHTML = '<p class="admin-hint mb-0">Nenhum produto cadastrado.</p>';
        return;
    }

    if (!filtered.length) {
        wrapElement.innerHTML = '<p class="admin-hint mb-0">Nenhum produto encontrado com os filtros atuais.</p>';
        return;
    }

    wrapElement.innerHTML = `
        <div class="admin-product-list">
            ${filtered
                .map(
                    (item, index) => `
                <div class="admin-product-item">
                    <div class="admin-product-main">
                        <span class="admin-product-index">${index + 1}</span>
                        <div>
                            <p class="admin-product-title mb-1">${escapeHtml(item.title || "Sem titulo")}</p>
                            <p class="admin-product-meta mb-0">${escapeHtml(getSectionLabel(item.section))} | ${escapeHtml(item.newPrice || "Sem preco")}</p>
                        </div>
                    </div>
                    <div class="admin-product-actions">
                        <button type="button" class="btn btn-sm btn-outline-primary" data-list-action="edit" data-product-id="${escapeAttr(item.id || "")}">Editar</button>
                        <button type="button" class="btn btn-sm btn-outline-danger" data-list-action="delete" data-product-id="${escapeAttr(item.id || "")}">Excluir</button>
                    </div>
                </div>
            `
                )
                .join("")}
        </div>
    `;
}

function filterCatalogItems(catalog, filters) {
    if (!filters) {
        return catalog;
    }

    return catalog.filter((item) => {
        const itemTitle = String(item.title || "").toLowerCase();
        const searchOk = !filters.search || itemTitle.includes(filters.search);
        const sectionOk = !filters.section || filters.section === "all" || item.section === filters.section;
        return searchOk && sectionOk;
    });
}

function getSectionLabel(section) {
    const labels = {
        promocoes: "Promocoes",
        masculina: "Masculina",
        feminina: "Feminina",
        eletronicos: "Eletronicos",
        utensilios: "Utensilios"
    };
    return labels[section] || "Promocoes";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
    return escapeHtml(value);
}

function showToast(message) {
    const toast = document.getElementById("miniToast");
    if (!toast) {
        return;
    }
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}
