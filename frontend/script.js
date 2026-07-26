const STORAGE_KEYS = {
    promo: "jtechPromoProduct",
    catalog: "jtechProductCatalog",
    cartItems: "jtechCartItems",
    favoriteIds: "jtechFavoriteIds"
};

const CATALOG_SEED_KEY = "jtechCatalogSeeded";
// Production uses the shared API route; local development still falls back to browser storage.
const CATALOG_API_URL = resolveCatalogApiUrl();
const IMAGE_FALLBACK_BASE_URL = "https://raw.githubusercontent.com/Jonathasdev1/jtechevolution/master/";

const SECTION_MAP = {
    promocoes: "Promocoes",
    masculina: "Masculina",
    feminina: "Feminina",
    eletronicos: "Eletronicos",
    utensilios: "Utensilios"
};

document.addEventListener("DOMContentLoaded", () => {
    setupImageFallback();
    setupCarousel();

    setupCartUI([]);
    initializeCounters();
    bindDynamicCardEvents();
    void refreshStoreFromStorage();

    // Keep the storefront aligned with admin changes from another tab/window.
    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEYS.catalog || event.key === STORAGE_KEYS.promo) {
            void refreshStoreFromStorage();
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            void refreshStoreFromStorage();
        }
    });
});

let currentCatalog = [];

function setupImageFallback() {
    // Railway/Linux returns 404 when static images are missing from the deploy.
    // In that case, load the same tracked asset directly from the GitHub repository.
    document.addEventListener(
        "error",
        (event) => {
            const image = event.target;
            if (!(image instanceof HTMLImageElement)) {
                return;
            }

            applyImageFallback(image);
        },
        true
    );

    document.querySelectorAll("img").forEach((image) => {
        applyImageFallback(image);
    });
}

function applyImageFallback(image) {
    if (!image || image.dataset.fallbackApplied === "true") {
        return;
    }

    const fallbackUrl = getImageFallbackUrl(image.getAttribute("src") || image.src || "");
    if (!fallbackUrl) {
        return;
    }

    if (image.complete && image.naturalWidth > 0) {
        return;
    }

    image.dataset.fallbackApplied = "true";
    image.src = fallbackUrl;
}

function getImageFallbackUrl(src) {
    const imagePath = getLocalImagePath(src);
    if (!imagePath) {
        return "";
    }

    return `${IMAGE_FALLBACK_BASE_URL}${imagePath
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`;
}

function getLocalImagePath(src) {
    const value = String(src || "").trim();
    if (!value || value.startsWith("data:") || value.startsWith("blob:")) {
        return "";
    }

    if (value.startsWith("img/")) {
        return value;
    }

    if (value.startsWith("/img/")) {
        return value.slice(1);
    }

    try {
        const parsed = new URL(value, window.location.href);
        const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
        return path.startsWith("img/") ? path : "";
    } catch {
        return "";
    }
}

async function refreshStoreFromStorage() {
    currentCatalog = await getCatalog();
    renderPromoCard(getPromoProduct(currentCatalog));
    renderHomeSections(currentCatalog);
    renderSectionPage(currentCatalog);
    renderCartItems(currentCatalog);
    updateCartCounters();
}

function setupCarousel() {
    const carouselElement = document.getElementById("jtechCarousel");
    if (carouselElement && window.bootstrap) {
        new bootstrap.Carousel(carouselElement, {
            interval: 4500,
            pause: "hover",
            touch: true,
            ride: "carousel"
        });
    }
}

async function getCatalog() {
    const template = getCatalogTemplate();
    const defaults = getDefaultCatalog()
        .map((item) => normalizeProduct(item, template))
        .filter((item) => item.id && item.title);

    if (CATALOG_API_URL) {
        const remoteCatalog = await loadRemoteCatalog(template);
        if (remoteCatalog.length) {
            return remoteCatalog;
        }

        if (isLocalDevelopment()) {
            const localCatalog = loadLocalCatalog(template);
            if (localCatalog.length) {
                return localCatalog;
            }
        }

        return initializeCatalogIfNeeded(defaults);
    }

    const localCatalog = loadLocalCatalog(template);
    if (localCatalog.length) {
        return localCatalog;
    }

    return initializeCatalogIfNeeded(defaults);
}

function loadLocalCatalog(template) {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.catalog);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        if (parsed.length === 0) {
            return [];
        }

        const normalized = parsed
            .map((item) => normalizeProduct(item, template))
            .filter((item) => item.id && item.title);

        localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify(normalized));
        return normalized;
    } catch {
        return [];
    }
}

function initializeCatalogIfNeeded(defaults) {
    const safeDefaults = Array.isArray(defaults) ? defaults : [];
    const seeded = localStorage.getItem(CATALOG_SEED_KEY) === "ok";

    // Only write the demo catalog on localhost; production can still render it as a fallback
    // while Railway/PostgreSQL is being configured.
    if (!seeded && safeDefaults.length && isLocalDevelopment()) {
        localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify(safeDefaults));
        localStorage.setItem(CATALOG_SEED_KEY, "ok");
        return safeDefaults;
    }

    return safeDefaults;
}

function resolveCatalogApiUrl() {
    const meta = document.querySelector('meta[name="jtech-catalog-api"]');
    const metaUrl = meta ? meta.getAttribute("content") || "" : "";
    const configuredUrl = typeof window.JTECH_CATALOG_API_URL === "string" ? window.JTECH_CATALOG_API_URL : "";
    if (!configuredUrl && !metaUrl && window.location.protocol === "file:") {
        return "";
    }
    const defaultUrl = "/api/catalog";
    return (configuredUrl || metaUrl || defaultUrl).trim();
}

function isLocalDevelopment() {
    return window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

async function loadRemoteCatalog(template) {
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
        const normalized = sourceCatalog
            .map((item) => normalizeProduct(item, template))
            .filter((item) => item.id && item.title);

        if (normalized.length) {
            localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify(normalized));
        }

        return normalized;
    } catch {
        return [];
    }
}

function getCatalogTemplate() {
    return {
        id: "",
        section: "promocoes",
        badge: "PROMOCOES",
        title: "",
        subtitle: "",
        oldPrice: "",
        newPrice: "",
        off: "",
        shipping: "",
        affiliateLink: "#",
        images: ["img/logo.jpeg"],
        features: []
    };
}

function normalizeProduct(item, base) {
    const safeBase = base || {};
    return {
        ...safeBase,
        ...item,
        id: item.id || safeBase.id,
        section: item.section || safeBase.section || "promocoes",
        badge: item.badge || safeBase.badge || SECTION_MAP[item.section] || "J-TECH",
        images: Array.isArray(item.images) && item.images.length ? item.images : (safeBase.images || []),
        features: Array.isArray(item.features) && item.features.length ? item.features : (safeBase.features || [])
    };
}

function getDefaultCatalog() {
    return [
        {
            id: "prod_promo_box",
            section: "promocoes",
            badge: "OFERTA IMPERDIVEL",
            title: "Caixa de Som Bluetooth Portatil",
            subtitle: "Potencia e qualidade para qualquer ambiente.",
            oldPrice: "R$ 204,90",
            newPrice: "R$ 103",
            off: "49% OFF",
            shipping: "Chegara gratis amanha",
            affiliateLink: "https://exemplo-afiliado.com",
            images: ["img/caixa1.jpeg", "img/fone1.jpeg", "img/tvbox1.jpeg"],
            features: ["Bluetooth 5.3", "Bateria de longa duracao", "Som potente com graves reforcados"]
        },
        {
            id: "prod_promo_audio",
            section: "promocoes",
            badge: "PROMOCOES",
            title: "Audio Profissional",
            subtitle: "Fones com graves definidos e isolamento eficiente.",
            oldPrice: "R$ 129,00",
            newPrice: "R$ 89,00",
            off: "31% OFF",
            shipping: "Envio nacional rapido",
            affiliateLink: "https://exemplo-afiliado.com",
            images: ["img/Fone2.jpeg", "img/fone1.jpeg", "img/caixa1.jpeg"],
            features: ["Audio equilibrado", "Conforto prolongado", "Boa autonomia"]
        },
        {
            id: "prod_masc_1",
            section: "masculina",
            badge: "MASCULINA",
            title: "Relogio Executive Black",
            subtitle: "Visual premium com pulseira resistente.",
            oldPrice: "R$ 189,00",
            newPrice: "R$ 129,00",
            off: "32% OFF",
            shipping: "Frete nacional rapido",
            affiliateLink: "https://exemplo-afiliado.com",
            images: ["img/Relogio2.jpeg", "img/Relogio4.jpeg", "img/Relogio5.jpeg"],
            features: ["Pulseira resistente", "Design premium", "Ideal para uso diario"]
        },
        {
            id: "prod_fem_1",
            section: "feminina",
            badge: "FEMININA",
            title: "Relogio Elegance Rose",
            subtitle: "Fino, sofisticado e muito confortavel.",
            oldPrice: "R$ 169,00",
            newPrice: "R$ 119,00",
            off: "29% OFF",
            shipping: "Entrega com rastreio",
            affiliateLink: "https://exemplo-afiliado.com",
            images: ["img/Relogio1.jpeg", "img/Relogio3.jpeg", "img/Fone2.jpeg"],
            features: ["Acabamento delicado", "Visual elegante", "Leve e confortavel"]
        },
        {
            id: "prod_ele_1",
            section: "eletronicos",
            badge: "ELETRONICOS",
            title: "TV Box Smart 4K",
            subtitle: "Streaming rapido e interface intuitiva.",
            oldPrice: "R$ 249,00",
            newPrice: "R$ 199,00",
            off: "20% OFF",
            shipping: "Pronto para envio",
            affiliateLink: "https://exemplo-afiliado.com",
            images: ["img/tvbox1.jpeg", "img/caixa1.jpeg", "img/fone1.jpeg"],
            features: ["Resolucao 4K", "Sistema rapido", "Conexao estavel"]
        },
        {
            id: "prod_ute_1",
            section: "utensilios",
            badge: "UTENSILIOS",
            title: "Suporte Multiuso",
            subtitle: "Organizacao pratica para escritorio e home office.",
            oldPrice: "R$ 79,00",
            newPrice: "R$ 59,00",
            off: "25% OFF",
            shipping: "Chega em poucos dias",
            affiliateLink: "https://exemplo-afiliado.com",
            images: ["img/PlanodeFundo.jpeg", "img/logo.jpeg", "img/caixa1.jpeg"],
            features: ["Compacto", "Versatil", "Facil de montar"]
        }
    ];
}

function getPromoProduct(catalog) {
    const fallback = catalog.find((item) => item.section === "promocoes") || catalog[0];
    if (!fallback) {
        localStorage.removeItem(STORAGE_KEYS.promo);
        return null;
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEYS.promo);
        if (!raw) {
            return fallback;
        }

        const parsed = JSON.parse(raw);
        const sameCatalogItem = catalog.find((item) => item.id === parsed.id);
        if (sameCatalogItem) {
            return sameCatalogItem;
        }

        // If saved promo no longer exists in catalog, reset to a valid fallback.
        localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(fallback));
        return fallback;
    } catch {
        localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(fallback));
        return fallback;
    }
}

function renderPromoCard(product) {
    const promoImageLink = document.getElementById("promoImageLink");
    if (!promoImageLink) {
        return;
    }

    if (!product) {
        setText("promoTitle", "Nenhum destaque definido");
        setText("promoSubtitle", "Cadastre produtos no admin e escolha um destaque principal.");
        setText("promoOldPrice", "");
        setText("promoNewPrice", "Sem produto");
        setText("promoOff", "");
        setText("promoShipping", "Catalogo vazio no momento");
        setLink("promoImageLink", "#");
        renderThumbGroup("promoThumbList", "promoMainImage", ["img/logo.jpeg"], "Sem destaque");
        renderFeaturesList("promoFeatures", ["Cadastre um produto no admin", "Defina o destaque principal", "Atualize a loja para visualizar"]);
        const favoriteButton = document.getElementById("btnFavorite");
        const cartButton = document.getElementById("btnAddCart");
        if (favoriteButton) {
            favoriteButton.disabled = true;
        }
        if (cartButton) {
            cartButton.disabled = true;
        }
        return;
    }

    setText("promoTitle", product.title);
    setText("promoSubtitle", product.subtitle);
    setText("promoOldPrice", product.oldPrice);
    setText("promoNewPrice", product.newPrice);
    setText("promoOff", product.off);
    setText("promoShipping", product.shipping);
    setLink("promoImageLink", product.affiliateLink);
    setLink("promoBuyLink", product.affiliateLink);
    renderThumbGroup("promoThumbList", "promoMainImage", product.images, product.title);
    renderFeaturesList("promoFeatures", product.features);

    const favoriteButton = document.getElementById("btnFavorite");
    const cartButton = document.getElementById("btnAddCart");
    if (favoriteButton) {
        favoriteButton.disabled = false;
        favoriteButton.dataset.favoriteId = product.id;
        setFavoriteVisual(favoriteButton, isFavorite(product.id));
    }
    if (cartButton) {
        cartButton.disabled = false;
        cartButton.dataset.cartId = product.id;
    }
}

function renderHomeSections(catalog) {
    const promo = getPromoProduct(catalog);
    renderCardGrid("promocoesList", catalog.filter((item) => item.section === "promocoes" && (!promo || item.id !== promo.id)));
    renderCardGrid("masculinaCards", catalog.filter((item) => item.section === "masculina"));
    renderCardGrid("femininaCards", catalog.filter((item) => item.section === "feminina"));
    renderCardGrid("eletronicosCards", catalog.filter((item) => item.section === "eletronicos"));
    renderCardGrid("utensiliosCards", catalog.filter((item) => item.section === "utensilios"));
}

function renderSectionPage(catalog) {
    const pageSection = document.body.dataset.pageSection;
    if (!pageSection) {
        return;
    }
    renderCardGrid("pageSectionCards", catalog.filter((item) => item.section === pageSection));
}

function renderCardGrid(containerId, products) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    if (!products.length) {
        container.innerHTML = '<div class="col-12"><div class="empty-state">Nenhum produto cadastrado nesta secao ainda.</div></div>';
        return;
    }

    container.innerHTML = products.map((product) => createCardMarkup(product)).join("");
    products.forEach((product) => {
        renderThumbGroup(`thumbs-${product.id}`, `main-${product.id}`, product.images, product.title);
        renderFeaturesList(`features-${product.id}`, product.features);
        const favoriteButton = container.querySelector(`[data-favorite-id="${product.id}"]`);
        if (favoriteButton) {
            setFavoriteVisual(favoriteButton, isFavorite(product.id));
        }
    });
}

function createCardMarkup(product) {
    const safeId = escapeAttr(product.id);
    return `
        <div class="col-12 col-md-6 col-xl-4">
            <article class="promo-card catalog-card" data-product-id="${safeId}">
                <span class="promo-badge">${escapeHtml(product.badge || SECTION_MAP[product.section] || "J-TECH")}</span>
                <a class="promo-image-link" href="${escapeAttr(product.affiliateLink)}" target="_blank" rel="noopener">
                    <img id="main-${safeId}" src="${escapeAttr(product.images[0])}" alt="${escapeAttr(product.title)}">
                </a>
                <div class="thumb-list card-thumb-list" id="thumbs-${safeId}"></div>
                <h4>${escapeHtml(product.title)}</h4>
                <p class="promo-subtitle">${escapeHtml(product.subtitle)}</p>
                <div class="price-line"><span class="old-price">${escapeHtml(product.oldPrice)}</span></div>
                <div class="price-line strong">
                    <span class="new-price">${escapeHtml(product.newPrice)}</span>
                    <span class="off-pill">${escapeHtml(product.off)}</span>
                </div>
                <p class="shipping-pill">${escapeHtml(product.shipping)}</p>
                <div class="promo-actions">
                    <button type="button" class="btn-favorite" data-favorite-id="${safeId}" aria-label="Favoritar produto">
                        <i class="fa-regular fa-heart"></i>
                    </button>
                    <button type="button" class="btn-cart" data-cart-id="${safeId}">
                        <i class="fa-solid fa-cart-plus"></i> Inserir no carrinho
                    </button>
                </div>
                <button class="btn-details" type="button" data-bs-toggle="collapse" data-bs-target="#features-${safeId}" aria-expanded="false" aria-controls="features-${safeId}">Ver caracteristicas</button>
                <ul class="collapse feature-list" id="features-${safeId}"></ul>
            </article>
        </div>
    `;
}

function bindDynamicCardEvents() {
    document.addEventListener("click", (event) => {
        const favoriteButton = event.target.closest("[data-favorite-id]");
        if (favoriteButton) {
            toggleFavorite(favoriteButton.dataset.favoriteId, favoriteButton);
            return;
        }

        const cartButton = event.target.closest("[data-cart-id]");
        if (cartButton) {
            addToCart(cartButton.dataset.cartId, currentCatalog);
            return;
        }

        const cartTrigger = event.target.closest("[data-open-cart='true']");
        if (cartTrigger) {
            event.preventDefault();
            openCartModal(currentCatalog);
            return;
        }

        const actionButton = event.target.closest("[data-cart-action]");
        if (actionButton) {
            handleCartItemAction(actionButton.dataset.cartAction, actionButton.dataset.productId, currentCatalog);
            return;
        }

        const checkoutButton = event.target.closest("[data-cart-checkout='true']");
        if (checkoutButton) {
            handleCartCheckout(currentCatalog);
        }
    });
}

function renderThumbGroup(containerId, imageId, images, title) {
    const container = document.getElementById(containerId);
    const mainImage = document.getElementById(imageId);
    if (!container || !mainImage) {
        return;
    }

    const validImages = images.filter(Boolean);
    mainImage.src = validImages[0] || mainImage.src;
    mainImage.alt = title;
    container.innerHTML = "";

    validImages.forEach((src, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `thumb-btn ${index === 0 ? "active" : ""}`;
        button.setAttribute("aria-label", `Selecionar imagem ${index + 1}`);
        button.innerHTML = `<img src="${escapeAttr(src)}" alt="Miniatura do produto">`;
        button.addEventListener("click", () => {
            mainImage.src = src;
            [...container.children].forEach((child) => child.classList.remove("active"));
            button.classList.add("active");
        });
        container.appendChild(button);
    });
}

function renderFeaturesList(listId, features) {
    const list = document.getElementById(listId);
    if (!list) {
        return;
    }
    list.innerHTML = features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("");
}

function addToCart(productId, catalog) {
    const items = getCartItems();
    const found = items.find((item) => item.id === productId);
    if (found) {
        found.qty += 1;
    } else {
        items.push({ id: productId, qty: 1 });
    }
    saveCartItems(items);
    updateCartCounters();
    showToast("Produto adicionado ao carrinho");
    renderCartItems(catalog);
}

function toggleFavorite(productId, button) {
    const favoriteIds = getFavoriteIds();
    const exists = favoriteIds.includes(productId);
    const nextFavorites = exists
        ? favoriteIds.filter((id) => id !== productId)
        : [...favoriteIds, productId];

    localStorage.setItem(STORAGE_KEYS.favoriteIds, JSON.stringify(nextFavorites));
    setFavoriteVisual(button, !exists);
    updateCounter("favCount", nextFavorites.length);
    showToast(!exists ? "Produto favoritado" : "Favorito removido");
}

function getFavoriteIds() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.favoriteIds);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function isFavorite(productId) {
    return getFavoriteIds().includes(productId);
}

function setFavoriteVisual(button, isActive) {
    button.classList.toggle("is-favorite", isActive);
    button.innerHTML = isActive ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
}

function initializeCounters() {
    updateCartCounters();
    updateCounter("favCount", getFavoriteIds().length);
}

function setupCartUI(catalog) {
    ensureCartModal();
    ensureFloatingCartAccess();
    renderCartItems(catalog);
}

function ensureCartModal() {
    if (document.getElementById("cartModal")) {
        return;
    }

    const modalMarkup = `
        <div class="modal fade" id="cartModal" tabindex="-1" aria-labelledby="cartModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-scrollable modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="cartModalLabel">Seu carrinho</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">
                        <div id="cartItemsWrap"></div>
                    </div>
                    <div class="modal-footer justify-content-between">
                        <div class="cart-total-wrap">Total: <strong id="cartTotalValue">R$ 0,00</strong></div>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Continuar comprando</button>
                            <button type="button" class="btn btn-dark" data-cart-checkout="true" id="cartCheckoutButton">Comprar agora</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalMarkup);
}

function ensureFloatingCartAccess() {
    const existingTrigger = document.querySelector("[data-open-cart='true']");
    if (existingTrigger) {
        return;
    }

    const floatButton = document.createElement("button");
    floatButton.type = "button";
    floatButton.className = "cart-float";
    floatButton.setAttribute("data-open-cart", "true");
    floatButton.setAttribute("aria-label", "Abrir carrinho");
    floatButton.innerHTML = '<i class="fa-solid fa-cart-shopping"></i><span id="cartCount">0</span>';
    document.body.appendChild(floatButton);
}

function openCartModal(catalog) {
    renderCartItems(catalog);
    const modalEl = document.getElementById("cartModal");
    if (!modalEl || !window.bootstrap) {
        return;
    }
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function handleCartItemAction(action, productId, catalog) {
    const items = getCartItems();
    const found = items.find((item) => item.id === productId);
    if (!found) {
        return;
    }

    if (action === "inc") {
        found.qty += 1;
    }

    if (action === "dec") {
        found.qty -= 1;
    }

    let nextItems = items.filter((item) => item.qty > 0);
    if (action === "remove") {
        nextItems = items.filter((item) => item.id !== productId);
    }

    saveCartItems(nextItems);
    updateCartCounters();
    renderCartItems(catalog);
}

function renderCartItems(catalog) {
    const wrap = document.getElementById("cartItemsWrap");
    const totalElement = document.getElementById("cartTotalValue");
    const checkoutButton = document.getElementById("cartCheckoutButton");
    if (!wrap || !totalElement) {
        return;
    }

    const items = getCartItems();
    if (!items.length) {
        wrap.innerHTML = '<div class="empty-state">Seu carrinho esta vazio.</div>';
        totalElement.textContent = formatMoney(0);
        if (checkoutButton) {
            checkoutButton.disabled = true;
        }
        return;
    }

    if (checkoutButton) {
        checkoutButton.disabled = false;
    }

    let total = 0;
    const rows = items.map((item) => {
        const product = catalog.find((entry) => entry.id === item.id);
        if (!product) {
            return "";
        }
        const unit = parsePrice(product.newPrice);
        const subtotal = unit * item.qty;
        total += subtotal;

        return `
            <div class="cart-item-row">
                <img src="${escapeAttr(product.images[0])}" alt="${escapeAttr(product.title)}">
                <div class="cart-item-info">
                    <h6>${escapeHtml(product.title)}</h6>
                    <p>Unitario: ${formatMoney(unit)}</p>
                    <div class="cart-item-actions">
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-cart-action="dec" data-product-id="${escapeAttr(product.id)}">-</button>
                        <span>${item.qty}</span>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-cart-action="inc" data-product-id="${escapeAttr(product.id)}">+</button>
                        <button type="button" class="btn btn-sm btn-outline-danger" data-cart-action="remove" data-product-id="${escapeAttr(product.id)}">Excluir item</button>
                    </div>
                </div>
                <strong>${formatMoney(subtotal)}</strong>
            </div>
        `;
    }).join("");

    wrap.innerHTML = rows || '<div class="empty-state">Seu carrinho esta vazio.</div>';
    totalElement.textContent = formatMoney(total);
}

function handleCartCheckout(catalog) {
    const items = getCartItems();
    if (!items.length) {
        showToast("Seu carrinho esta vazio.");
        return;
    }

    const firstProductId = items[0].id;
    const product = catalog.find((entry) => entry.id === firstProductId);
    if (!product || !product.affiliateLink) {
        showToast("Link de afiliado nao encontrado para este item.");
        return;
    }

    window.location.href = product.affiliateLink;
}

function getCartItems() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.cartItems);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((item) => ({ id: String(item.id || ""), qty: Number(item.qty || 0) }))
            .filter((item) => item.id && item.qty > 0);
    } catch {
        return [];
    }
}

function saveCartItems(items) {
    localStorage.setItem(STORAGE_KEYS.cartItems, JSON.stringify(items));
}

function updateCartCounters() {
    const count = getCartItems().reduce((sum, item) => sum + item.qty, 0);
    updateCounter("cartCount", count);
}

function parsePrice(value) {
    const normalized = String(value || "0")
        .replace(/[^\d,\.]/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(value);
}

function updateCounter(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = String(value);
    }
}

function setText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    }
}

function setLink(id, href) {
    const element = document.getElementById(id);
    if (element) {
        element.href = href;
    }
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
    }, 1800);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
    return escapeHtml(value);
}
