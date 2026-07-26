const STORAGE_KEYS = {
    adminSession: "jtechAdminSession",
    adminPassword: "jtechAdminPassword"
};

document.addEventListener("DOMContentLoaded", () => {
    if (sessionStorage.getItem(STORAGE_KEYS.adminSession) === "ok" && sessionStorage.getItem(STORAGE_KEYS.adminPassword)) {
        window.location.href = "/admin/cadastro/";
        return;
    }

    const form = document.getElementById("adminLoginForm");
    const passwordInput = document.getElementById("adminPassword");
    if (!form || !passwordInput) {
        return;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = String(passwordInput.value || "").trim();
        if (!password) {
            showToast("Informe a senha do admin.");
            return;
        }

        const ok = await verifyAdminPassword(password);
        if (!ok) {
            showToast("Senha incorreta ou ADMIN_PASSWORD nao configurada.");
            return;
        }

        sessionStorage.setItem(STORAGE_KEYS.adminSession, "ok");
        sessionStorage.setItem(STORAGE_KEYS.adminPassword, password);
        window.location.href = "/admin/cadastro/";
    });
});

async function verifyAdminPassword(password) {
    try {
        const response = await fetch(getApiUrl("/api/admin/login"), {
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

function getApiUrl(path) {
    const baseUrl = typeof window.JTECH_API_BASE_URL === "string" ? window.JTECH_API_BASE_URL.trim().replace(/\/+$/, "") : "";
    return baseUrl ? `${baseUrl}${path}` : path;
}

function isLocalDevelopment() {
    return window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
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
