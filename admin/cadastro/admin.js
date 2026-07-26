const STORAGE_KEYS = {
    promo: "jtechPromoProduct",
    catalog: "jtechProductCatalog",
    adminSession: "jtechAdminSession",
    adminPassword: "jtechAdminPassword"
};

const IMAGE_MIN_WIDTH = 800;
const IMAGE_MIN_HEIGHT = 800;
const LOCAL_IMAGE_TOKEN = "[imagem local salva]";
const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.95;
const CATALOG_SEED_KEY = "jtechCatalogSeeded";
// The admin writes to the shared API in production and uses browser storage only while developing locally.
const CATALOG_API_URL = resolveCatalogApiUrl();

document.addEventListener("DOMContentLoaded", async () => {
    // Block the admin screen before loading editable catalog data.
    const isAuthorized = await ensureAdminAccess();
    if (!isAuthorized) {
        window.location.href = "/admin/login/";
        return;
    }

    const form = document.getElementById("adminPromoForm");
    const resetButton = document.getElementById("resetPromo");
    const modeNew = document.getElementById("modeNew");
    const modeEdit = document.getElementById("modeEdit");
    const existingWrap = document.getElementById("existingWrap");
    const existingSelect = document.getElementById("existingProductSelect");
    const deleteButton = document.getElementById("deleteProduct");
    const featuredSelect = document.getElementById("featuredProductSelect");
    const applyFeaturedButton = document.getElementById("applyFeatured");
    const clearCatalogButton = document.getElementById("clearCatalog");
    const exportCatalogButton = document.getElementById("exportCatalog");
    const exportSeedButton = document.getElementById("exportSeed");
    const importCatalogButton = document.getElementById("importCatalog");
    const importCatalogFileInput = document.getElementById("importCatalogFile");
    const productListWrap = document.getElementById("productListWrap");
    const productListCount = document.getElementById("productListCount");
    const productListSearch = document.getElementById("productListSearch");
    const productListSection = document.getElementById("productListSection");
    const clearListFiltersButton = document.getElementById("clearListFilters");
    const imageTextInputs = ["image1", "image2", "image3"]
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    const imageFileInputs = ["image1File", "image2File", "image3File"]
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    if (!form || !modeNew || !modeEdit || !existingWrap || !existingSelect || !deleteButton || !featuredSelect || !applyFeaturedButton || !clearCatalogButton) {
        return;
    }

    let catalog = await getCatalog();
    let editingId = "";
    const listFilters = {
        search: "",
        section: "all"
    };

    const applyListFilters = () => {
        renderProductList(catalog, productListWrap, productListCount, listFilters);
    };

    refreshSelectOptions(existingSelect, catalog);
    refreshFeaturedOptions(featuredSelect, catalog);
    setMode("new", existingWrap, form);
    setupImageInputBehavior(imageTextInputs, imageFileInputs);
    setupImagePreview(imageTextInputs, imageFileInputs);
    syncFeaturedSelection(featuredSelect);
    updateDeleteButtonState(deleteButton, false);
    applyListFilters();
    applyEditFromUrl(modeEdit, existingWrap, existingSelect, deleteButton, form, catalog);

    if (productListSearch) {
        productListSearch.addEventListener("input", () => {
            listFilters.search = productListSearch.value.trim().toLowerCase();
            applyListFilters();
        });
    }

    if (productListSection) {
        productListSection.addEventListener("change", () => {
            listFilters.section = productListSection.value || "all";
            applyListFilters();
        });
    }

    if (clearListFiltersButton) {
        clearListFiltersButton.addEventListener("click", () => {
            listFilters.search = "";
            listFilters.section = "all";
            if (productListSearch) {
                productListSearch.value = "";
            }
            if (productListSection) {
                productListSection.value = "all";
            }
            applyListFilters();
        });
    }

    const deleteProductById = async (productId) => {
        const selected = catalog.find((item) => item.id === productId);
        if (!selected) {
            showToast("Produto nao encontrado.");
            return false;
        }

        const confirmed = window.confirm(`Excluir o produto \"${selected.title}\"?`);
        if (!confirmed) {
            return false;
        }

        catalog = catalog.filter((item) => item.id !== productId);
        if (!(await persistCatalog(catalog))) {
            return false;
        }

        syncPromoAfterDeletion(catalog, productId);
        refreshSelectOptions(existingSelect, catalog);
        refreshFeaturedOptions(featuredSelect, catalog);
        applyListFilters();

        if (editingId === productId) {
            editingId = "";
            existingSelect.value = "";
            form.reset();
            clearStoredImageCache();
            setDefaultFormValues();
            updateDeleteButtonState(deleteButton, false);
        }

        syncFeaturedSelection(featuredSelect);
        showToast("Produto excluido com sucesso.");
        return true;
    };

    modeNew.addEventListener("change", () => {
        if (!modeNew.checked) {
            return;
        }
        editingId = "";
        setMode("new", existingWrap, form);
        updateDeleteButtonState(deleteButton, false);
    });

    modeEdit.addEventListener("change", () => {
        if (!modeEdit.checked) {
            return;
        }
        setMode("edit", existingWrap, form);
        if (catalog.length) {
            existingSelect.value = catalog[0].id;
            editingId = catalog[0].id;
            fillForm(catalog[0]);
            updateDeleteButtonState(deleteButton, true);
        }
    });

    existingSelect.addEventListener("change", () => {
        const selected = catalog.find((item) => item.id === existingSelect.value);
        editingId = selected ? selected.id : "";
        if (selected) {
            fillForm(selected);
        }
        updateDeleteButtonState(deleteButton, Boolean(selected));
    });

    if (productListWrap) {
        productListWrap.addEventListener("click", (event) => {
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
                const selected = catalog.find((item) => item.id === productId);
                if (!selected) {
                    showToast("Produto nao encontrado.");
                    return;
                }

                modeEdit.checked = true;
                setMode("edit", existingWrap, form);
                editingId = productId;
                existingSelect.value = productId;
                fillForm(selected);
                updateDeleteButtonState(deleteButton, true);
                showToast("Produto carregado para edicao.");
                return;
            }

            if (action === "delete") {
                void deleteProductById(productId);
            }
        });
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = await getPayloadFromForm(form);
        if (!payload) {
            return;
        }

        if (modeEdit.checked) {
            if (!editingId) {
                showToast("Selecione um produto para editar.");
                return;
            }
            const updatedItem = { ...payload, id: editingId };
            catalog = catalog.map((item) => (item.id === editingId ? updatedItem : item));
            if (!(await persistCatalog(catalog))) {
                return;
            }
            syncPromoProduct(catalog, updatedItem);
            refreshSelectOptions(existingSelect, catalog);
            refreshFeaturedOptions(featuredSelect, catalog);
            applyListFilters();
            existingSelect.value = editingId;
            syncFeaturedSelection(featuredSelect);
            showToast("Produto atualizado com sucesso.");
            return;
        }

        const newItem = { ...payload, id: createProductId() };
        catalog.unshift(newItem);
        if (!(await persistCatalog(catalog))) {
            return;
        }
        syncPromoProduct(catalog, newItem);
        refreshSelectOptions(existingSelect, catalog);
        refreshFeaturedOptions(featuredSelect, catalog);
        applyListFilters();
        syncFeaturedSelection(featuredSelect);
        form.reset();
        clearStoredImageCache();
        setDefaultFormValues();
        showToast(`Novo card criado na secao ${getSectionLabel(newItem.section)}.`);
    });

    deleteButton.addEventListener("click", () => {
        if (!modeEdit.checked || !editingId) {
            showToast("Selecione um produto em modo de edicao.");
            return;
        }

        void deleteProductById(editingId);
    });

    applyFeaturedButton.addEventListener("click", () => {
        const featuredId = featuredSelect.value;
        if (!featuredId) {
            showToast("Selecione um produto para destacar.");
            return;
        }

        const selected = catalog.find((item) => item.id === featuredId);
        if (!selected) {
            showToast("Produto selecionado nao encontrado.");
            return;
        }

        localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(selected));
        showToast(`Destaque principal definido: ${selected.title}.`);
    });

    clearCatalogButton.addEventListener("click", async () => {
        const confirmation = window.prompt("Digite LIMPAR para apagar todo o catalogo:");
        if (confirmation !== "LIMPAR") {
            showToast("Limpeza cancelada.");
            return;
        }

        catalog = [];
        if (!(await persistCatalog(catalog))) {
            return;
        }
        localStorage.setItem(CATALOG_SEED_KEY, "ok");
        localStorage.removeItem(STORAGE_KEYS.promo);
        refreshSelectOptions(existingSelect, catalog);
        refreshFeaturedOptions(featuredSelect, catalog);
        applyListFilters();
        existingSelect.value = "";
        featuredSelect.value = "";
        editingId = "";
        form.reset();
        clearStoredImageCache();
        setDefaultFormValues();
        updateDeleteButtonState(deleteButton, false);
        modeNew.checked = true;
        setMode("new", existingWrap, form);
        showToast("Catalogo limpo com sucesso.");
    });

    if (exportCatalogButton) {
        exportCatalogButton.addEventListener("click", () => {
            exportCatalogSnapshot(catalog);
        });
    }

    if (exportSeedButton) {
        exportSeedButton.addEventListener("click", () => {
            exportSeedFile(catalog);
        });
    }

    if (importCatalogButton && importCatalogFileInput) {
        importCatalogButton.addEventListener("click", () => {
            importCatalogFileInput.click();
        });

        importCatalogFileInput.addEventListener("change", async () => {
            const file = importCatalogFileInput.files && importCatalogFileInput.files[0]
                ? importCatalogFileInput.files[0]
                : null;

            if (!file) {
                return;
            }

            const imported = await parseCatalogFile(file);
            importCatalogFileInput.value = "";
            if (!imported) {
                return;
            }

            const normalizedCatalog = imported.catalog
                .map((item) => normalizeCatalogItem(item))
                .filter((item) => item.id && item.title);

            if (!normalizedCatalog.length) {
                showToast("Arquivo sem produtos validos.");
                return;
            }

            catalog = normalizedCatalog;
            if (!(await persistCatalog(catalog))) {
                return;
            }

            localStorage.setItem(CATALOG_SEED_KEY, "ok");

            const nextPromo = resolveImportedPromo(catalog, imported.promoId);
            if (nextPromo) {
                localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(nextPromo));
            } else {
                localStorage.removeItem(STORAGE_KEYS.promo);
            }

            refreshSelectOptions(existingSelect, catalog);
            refreshFeaturedOptions(featuredSelect, catalog);
            applyListFilters();
            syncFeaturedSelection(featuredSelect);
            editingId = "";
            existingSelect.value = "";
            modeNew.checked = true;
            setMode("new", existingWrap, form);
            updateDeleteButtonState(deleteButton, false);
            showToast(`Catalogo importado com ${catalog.length} produto${catalog.length === 1 ? "" : "s"}.`);
        });
    }

    if (resetButton) {
        resetButton.addEventListener("click", () => {
            if (modeEdit.checked && editingId) {
                const selected = catalog.find((item) => item.id === editingId);
                fillForm(selected || getDefaultProduct());
                showToast("Campos restaurados para o produto selecionado.");
                return;
            }
            form.reset();
            clearStoredImageCache();
            setDefaultFormValues();
            showToast("Formulario limpo para novo cadastro.");
        });
    }
});

async function ensureAdminAccess() {
    // The password is confirmed by the server before any catalog write is allowed.
    if (sessionStorage.getItem(STORAGE_KEYS.adminSession) === "ok" && getAdminPassword()) {
        return true;
    }

    const enteredPassword = window.prompt("Acesso restrito. Digite a senha do admin:");
    if (!enteredPassword) {
        return false;
    }

    const authorized = await verifyAdminPassword(enteredPassword);
    if (authorized) {
        sessionStorage.setItem(STORAGE_KEYS.adminSession, "ok");
        sessionStorage.setItem(STORAGE_KEYS.adminPassword, enteredPassword);
        return true;
    }

    window.alert("Senha incorreta ou ADMIN_PASSWORD nao configurada no servidor.");
    return false;
}

async function verifyAdminPassword(password) {
    if (!CATALOG_API_URL) {
        return password === "JTECH@2026";
    }

    try {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({ password })
        });

        if (!response.ok && isLocalDevelopment() && response.status === 404) {
            return password === "JTECH@2026";
        }

        return response.ok;
    } catch {
        return isLocalDevelopment() && password === "JTECH@2026";
    }
}

function getAdminPassword() {
    return sessionStorage.getItem(STORAGE_KEYS.adminPassword) || "";
}

function clearAdminSession() {
    sessionStorage.removeItem(STORAGE_KEYS.adminSession);
    sessionStorage.removeItem(STORAGE_KEYS.adminPassword);
}

function getDefaultProduct() {
    return {
        section: "promocoes",
        title: "Caixa de Som Bluetooth Portatil",
        subtitle: "Potencia e qualidade para qualquer ambiente.",
        oldPrice: "R$ 204,90",
        newPrice: "R$ 103",
        off: "49% OFF",
        shipping: "Chegara gratis amanha",
        affiliateLink: "https://exemplo-afiliado.com",
        images: ["img/caixa1.jpeg", "img/fone1.jpeg", "img/tvbox1.jpeg"],
        features: ["Bluetooth 5.3 com conexao estavel", "Bateria de longa duracao", "Som potente com graves reforcados"]
    };
}

async function getCatalog() {
    if (CATALOG_API_URL) {
        const remoteCatalog = await loadRemoteCatalog();
        if (remoteCatalog.length) {
            return remoteCatalog;
        }

        if (isLocalDevelopment()) {
            return loadLocalCatalog();
        }

        return [];
    }

    return loadLocalCatalog();
}

function loadLocalCatalog() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.catalog);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        if (!parsed.length) {
            return [];
        }
        return parsed.map((item) => ({
            ...getDefaultProduct(),
            ...item,
            id: item.id || createProductId(),
            section: item.section || "promocoes",
            badge: item.badge || getSectionLabel(item.section || "promocoes").toUpperCase(),
            images: Array.isArray(item.images) && item.images.length ? item.images : getDefaultProduct().images,
            features: Array.isArray(item.features) && item.features.length ? item.features : getDefaultProduct().features
        }));
    } catch {
        return [];
    }
}

async function persistCatalog(catalog) {
    if (CATALOG_API_URL) {
        const synced = await saveRemoteCatalog(catalog);
        if (synced) {
            return true;
        }

        if (isLocalDevelopment()) {
            return persistLocalCatalog(catalog);
        }

        return false;
    }

    return persistLocalCatalog(catalog);
}

function persistLocalCatalog(catalog) {
    try {
        localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify(catalog));
        return true;
    } catch {
        showToast("Nao foi possivel salvar. Tente imagens menores ou menos produtos.");
        return false;
    }
}

function exportCatalogSnapshot(catalog) {
    const safeCatalog = Array.isArray(catalog) ? catalog : [];
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        promoId: (getStoredPromo() && getStoredPromo().id) || "",
        catalog: safeCatalog
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const dateStamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `jtech-catalogo-${dateStamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast(`Backup exportado (${safeCatalog.length} produto${safeCatalog.length === 1 ? "" : "s"}).`);
}

function exportSeedFile(catalog) {
    const safeCatalog = Array.isArray(catalog) ? catalog : [];
    if (!safeCatalog.length) {
        showToast("Nenhum produto para salvar como seed.");
        return;
    }

    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        promoId: (getStoredPromo() && getStoredPromo().id) || "",
        catalog: safeCatalog
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "catalog-seed.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast(`Seed de deploy salvo com ${safeCatalog.length} produto${safeCatalog.length === 1 ? "" : "s"}. Coloque o arquivo na pasta do projeto antes do deploy!`);
}

async function parseCatalogFile(file) {
    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (Array.isArray(parsed)) {
            return {
                promoId: "",
                catalog: parsed
            };
        }

        if (!parsed || !Array.isArray(parsed.catalog)) {
            showToast("JSON invalido para importacao.");
            return null;
        }

        return {
            promoId: typeof parsed.promoId === "string" ? parsed.promoId : "",
            catalog: parsed.catalog
        };
    } catch {
        showToast("Nao foi possivel ler o arquivo JSON.");
        return null;
    }
}

function normalizeCatalogItem(item) {
    const base = getDefaultProduct();
    const source = item && typeof item === "object" ? item : {};
    const section = source.section || "promocoes";

    return {
        ...base,
        ...source,
        id: source.id || createProductId(),
        section,
        badge: source.badge || (section === "promocoes" ? "OFERTA IMPERDIVEL" : getSectionLabel(section).toUpperCase()),
        images: Array.isArray(source.images) && source.images.length ? source.images.filter(Boolean).slice(0, 3) : base.images,
        features: Array.isArray(source.features) && source.features.length ? source.features.filter(Boolean) : base.features
    };
}

function resolveImportedPromo(catalog, promoId) {
    if (!Array.isArray(catalog) || !catalog.length) {
        return null;
    }

    const fromFile = promoId ? catalog.find((item) => item.id === promoId) : null;
    if (fromFile) {
        return fromFile;
    }

    return catalog.find((item) => item.section === "promocoes") || catalog[0];
}

function syncPromoProduct(catalog, product) {
    const currentPromo = getStoredPromo();
    if (product.section === "promocoes") {
        localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(product));
        return;
    }

    if (currentPromo && currentPromo.id === product.id) {
        const nextPromo = catalog.find((item) => item.section === "promocoes") || catalog[0];
        localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(nextPromo));
        return;
    }

    if (!currentPromo) {
        const nextPromo = catalog.find((item) => item.section === "promocoes") || catalog[0];
        if (nextPromo) {
            localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(nextPromo));
        }
    }
}

function syncPromoAfterDeletion(catalog, deletedId) {
    const currentPromo = getStoredPromo();
    if (!currentPromo) {
        return;
    }

    if (currentPromo.id !== deletedId) {
        return;
    }

    const nextPromo = catalog.find((item) => item.section === "promocoes") || catalog[0];
    if (nextPromo) {
        localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(nextPromo));
        return;
    }

    localStorage.removeItem(STORAGE_KEYS.promo);
}

function getStoredPromo() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.promo);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function resolveCatalogApiUrl() {
    const meta = document.querySelector('meta[name="jtech-catalog-api"]');
    const metaUrl = meta ? meta.getAttribute("content") || "" : "";
    const configuredUrl = typeof window.JTECH_CATALOG_API_URL === "string" ? window.JTECH_CATALOG_API_URL : "";
    if (!configuredUrl && !metaUrl && window.location.protocol === "file:") {
        return "";
    }
    // Railway and Vercel can both expose this route on the same domain.
    const defaultUrl = "/api/catalog";
    return (configuredUrl || metaUrl || defaultUrl).trim();
}

function isLocalDevelopment() {
    return window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

async function loadRemoteCatalog() {
    try {
        const response = await fetch(CATALOG_API_URL, {
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            return [];
        }

        const parsed = await response.json();
        const sourceCatalog = Array.isArray(parsed) ? parsed : Array.isArray(parsed.catalog) ? parsed.catalog : [];
        return sourceCatalog
            .map((item) => normalizeCatalogItem(item))
            .filter((item) => item.id && item.title);
    } catch {
        return [];
    }
}

async function saveRemoteCatalog(catalog) {
    try {
        // The shared storage lives behind the API, so both admin and storefront see the same snapshot.
        const response = await fetch(CATALOG_API_URL, {
            method: "POST",
            headers: {
                "X-Admin-Password": getAdminPassword(),
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                catalog,
                promoId: (getStoredPromo() && getStoredPromo().id) || ""
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                clearAdminSession();
                showToast("Sessao expirada. Reabra o admin e informe a senha.");
                return false;
            }
            showToast("Nao foi possivel sincronizar com a origem compartilhada.");
            return false;
        }

        return true;
    } catch {
        showToast("Nao foi possivel sincronizar com a origem compartilhada.");
        return false;
    }
}

async function getPayloadFromForm(form) {
    const formData = new FormData(form);
    const section = String(formData.get("section") || "promocoes").trim();
    let images = null;
    try {
        images = await getImageSources(form);
    } catch {
        showToast("Falha ao processar imagens locais.");
        return null;
    }

    if (!images || !images.length) {
        showToast("Informe pelo menos a Imagem 1 por caminho ou upload local.");
        return null;
    }

    return {
        section,
        badge: section === "promocoes" ? "OFERTA IMPERDIVEL" : getSectionLabel(section).toUpperCase(),
        title: String(formData.get("title") || "").trim(),
        subtitle: String(formData.get("subtitle") || "").trim(),
        oldPrice: String(formData.get("oldPrice") || "").trim(),
        newPrice: String(formData.get("newPrice") || "").trim(),
        off: String(formData.get("off") || "").trim(),
        shipping: String(formData.get("shipping") || "").trim(),
        affiliateLink: String(formData.get("affiliateLink") || "").trim(),
        images,
        features: String(formData.get("features") || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
    };
}

function fillForm(data) {
    setInput("section", data.section || "promocoes");
    setInput("title", data.title);
    setInput("subtitle", data.subtitle);
    setInput("oldPrice", data.oldPrice);
    setInput("newPrice", data.newPrice);
    setInput("off", data.off);
    setInput("shipping", data.shipping);
    setInput("affiliateLink", data.affiliateLink);
    setImageInputValue("image1", data.images[0] || "");
    setImageInputValue("image2", data.images[1] || "");
    setImageInputValue("image3", data.images[2] || "");
    setInput("features", data.features.join("\n"));
}

function setMode(mode, existingWrap, form) {
    existingWrap.hidden = mode !== "edit";
    if (mode === "new") {
        form.reset();
        clearStoredImageCache();
        setDefaultFormValues();
    }
}

function setDefaultFormValues() {
    const base = getDefaultProduct();
    setInput("section", base.section);
    setInput("off", base.off);
    setInput("shipping", base.shipping);
}

function refreshSelectOptions(selectElement, catalog) {
    selectElement.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione um produto";
    selectElement.appendChild(placeholder);

    catalog.forEach((item, index) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${index + 1}. ${item.title} (${getSectionLabel(item.section)})`;
        selectElement.appendChild(option);
    });
}

function refreshFeaturedOptions(selectElement, catalog) {
    selectElement.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione um produto";
    selectElement.appendChild(placeholder);

    catalog.forEach((item, index) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${index + 1}. ${item.title} (${getSectionLabel(item.section)})`;
        selectElement.appendChild(option);
    });
}

function syncFeaturedSelection(selectElement) {
    const currentPromo = getStoredPromo();
    selectElement.value = currentPromo ? currentPromo.id : "";
}

function updateDeleteButtonState(button, enabled) {
    button.disabled = !enabled;
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

function setupImageInputBehavior(textInputs, fileInputs) {
    // Keep text paths and local uploads from fighting for the same image slot.
    textInputs.forEach((input) => {
        input.addEventListener("input", () => {
            if (input.value.trim() !== LOCAL_IMAGE_TOKEN) {
                delete input.dataset.storedImage;
            }
        });
    });

    fileInputs.forEach((fileInput, index) => {
        fileInput.addEventListener("change", () => {
            if (!fileInput.files || !fileInput.files[0]) {
                return;
            }
            const textInput = textInputs[index];
            if (textInput) {
                textInput.value = LOCAL_IMAGE_TOKEN;
            }
        });
    });
}

function setupImagePreview(textInputs, fileInputs) {
    // Preview makes it obvious whether the selected image is sharp enough before saving.
    const updatePreview = async (slotIndex) => {
        const textInput = textInputs[slotIndex];
        const fileInput = fileInputs[slotIndex];
        const preview = document.querySelector(`[data-image-preview="${slotIndex + 1}"]`);
        if (!textInput || !preview) {
            return;
        }

        const selectedFile = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        if (preview.dataset.objectUrl) {
            URL.revokeObjectURL(preview.dataset.objectUrl);
            delete preview.dataset.objectUrl;
        }

        if (selectedFile) {
            const objectUrl = URL.createObjectURL(selectedFile);
            preview.innerHTML = `<img src="${escapeAttr(objectUrl)}" alt="Previa da imagem ${slotIndex + 1}">`;
            preview.dataset.objectUrl = objectUrl;
            return;
        }

        const typedValue = textInput.value.trim();
        if (typedValue && typedValue !== LOCAL_IMAGE_TOKEN) {
            preview.innerHTML = `<img src="${escapeAttr(typedValue)}" alt="Previa da imagem ${slotIndex + 1}">`;
            return;
        }

        preview.innerHTML = '<span>Sem imagem</span>';
    };

    textInputs.forEach((input, index) => {
        input.addEventListener("input", () => {
            void updatePreview(index);
        });
        void updatePreview(index);
    });

    fileInputs.forEach((input, index) => {
        input.addEventListener("change", () => {
            void updatePreview(index);
        });
    });
}

async function getImageSources(form) {
    const result = [];
    for (let slot = 1; slot <= 3; slot += 1) {
        const source = await resolveImageSlot(form, slot);
        if (source === null) {
            return null;
        }
        if (source) {
            result.push(source);
        }
    }
    return result;
}

async function resolveImageSlot(form, slotIndex) {
    const textInput = form.querySelector(`#image${slotIndex}`);
    const fileInput = form.querySelector(`#image${slotIndex}File`);

    if (!textInput) {
        return "";
    }

    const selectedFile = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (selectedFile) {
        const hasEnoughResolution = await validateImageResolution(selectedFile, slotIndex);
        if (!hasEnoughResolution) {
            return null;
        }
        let dataUrl = "";
        try {
            dataUrl = await compressImageToDataUrl(selectedFile);
        } catch {
            showToast(`Imagem ${slotIndex}: falha ao ler arquivo local.`);
            return null;
        }
        textInput.dataset.storedImage = dataUrl;
        textInput.value = LOCAL_IMAGE_TOKEN;
        return dataUrl;
    }

    const typedValue = textInput.value.trim();
    if (typedValue === LOCAL_IMAGE_TOKEN && textInput.dataset.storedImage) {
        return textInput.dataset.storedImage;
    }

    if (typedValue) {
        return typedValue;
    }

    return "";
}

function validateImageResolution(file, slotIndex) {
    return new Promise((resolve) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);

        image.onload = () => {
            const ok = image.naturalWidth >= IMAGE_MIN_WIDTH && image.naturalHeight >= IMAGE_MIN_HEIGHT;
            URL.revokeObjectURL(objectUrl);
            if (!ok) {
                showToast(`Imagem ${slotIndex} menor que ${IMAGE_MIN_WIDTH}x${IMAGE_MIN_HEIGHT}.`);
            }
            resolve(ok);
        };

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            showToast(`Imagem ${slotIndex} invalida. Tente outro arquivo.`);
            resolve(false);
        };

        image.src = objectUrl;
    });
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Falha ao ler imagem local."));
        reader.readAsDataURL(file);
    });
}

function compressImageToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            const largestSide = Math.max(width, height);
            const scale = largestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largestSide : 1;

            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));

            const context = canvas.getContext("2d");
            if (!context) {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Canvas indisponivel para compressao."));
                return;
            }

            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
            URL.revokeObjectURL(objectUrl);
            resolve(dataUrl);
        };

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Falha ao carregar imagem para compressao."));
        };

        image.src = objectUrl;
    });
}

function setImageInputValue(id, value) {
    const element = document.getElementById(id);
    if (!element) {
        return;
    }

    if (typeof value === "string" && value.startsWith("data:image")) {
        element.dataset.storedImage = value;
        element.value = LOCAL_IMAGE_TOKEN;
        return;
    }

    delete element.dataset.storedImage;
    element.value = value || "";
}

function clearStoredImageCache() {
    ["image1", "image2", "image3"].forEach((id) => {
        const element = document.getElementById(id);
        if (!element) {
            return;
        }
        delete element.dataset.storedImage;
        if (element.value.trim() === LOCAL_IMAGE_TOKEN) {
            element.value = "";
        }
    });
}

function renderProductList(catalog, wrapElement, countElement, filters = null) {
    if (!wrapElement || !countElement) {
        return;
    }

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

function setInput(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
    }
}

function createProductId() {
    return `prod_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function applyEditFromUrl(modeEdit, existingWrap, existingSelect, deleteButton, form, catalog) {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit") || "";
    if (!editId) {
        return;
    }

    const selected = catalog.find((item) => item.id === editId);
    if (!selected) {
        showToast("Produto do link nao encontrado.");
        return;
    }

    modeEdit.checked = true;
    setMode("edit", existingWrap, form);
    existingSelect.value = selected.id;
    fillForm(selected);
    updateDeleteButtonState(deleteButton, true);
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
