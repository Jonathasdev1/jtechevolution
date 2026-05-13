# 📋 GUIA COMPLETO: PAINEL ADMIN J-TECH

## 🔐 1. AUTENTICAÇÃO (Entrada no Admin)

**Localização:** `admin.js` linha 374-392

**Como funciona:**
- Ao acessar `http://localhost:3000/admin.html`, o sistema pede uma senha
- Senha: `JTECH@2026`
- A autenticação fica salva na `sessionStorage` da aba atual
- Se fechar o navegador, precisa autenticar novamente

```javascript
function ensureAdminAccess() {
    const sessionKey = "jtechAdminSession";
    const expectedPassword = "JTECH@2026";  // ← SENHA DO ADMIN
    
    if (sessionStorage.getItem(sessionKey) === "ok") {
        return true;  // Já autenticado
    }
    
    const enteredPassword = window.prompt("Acesso restrito. Digite a senha do admin:");
    if (enteredPassword === expectedPassword) {
        sessionStorage.setItem(sessionKey, "ok");
        return true;
    }
    return false;
}
```

---

## 📝 2. CRIAR NOVO PRODUTO

**Localização:** `admin.js` linha 72-77 (modo novo/editar)

**Passos:**
1. Seleciona "Novo produto" (padrão)
2. Preenche os campos:
   - **Título:** nome do produto
   - **Seção:** categoria (Promoções, Masculina, Feminina, Eletrônicos, Utensílios)
   - **Desconto:** ex: "49% OFF"
   - **Subtítulo:** descrição curta
   - **Preço antigo e atual:** com símbolo R$
   - **Texto frete:** "Chegará grátis amanhã"
   - **Link afiliado:** URL para compra
   - **Imagens:** 1 a 3 (podem ser URLs ou upload local)
   - **Características:** lista (uma por linha)
3. Clica em "Salvar produto"
4. O produto é adicionado ao início da lista

**Fluxo de salvamento:**
```
Formulário → getPayloadFromForm() → persistCatalog(catalog)
                ↓
        API em /api/catalog (POST)
                ↓
        Armazenado em .catalog-local.json (sem DATABASE_URL)
                ↓
        Produto aparece na loja automaticamente
```

---

## ✏️ 3. EDITAR PRODUTO EXISTENTE

**Localização:** `admin.js` linha 78-81 (modo editar)

**Como:**
1. Seleciona "Editar existente"
2. Abre uma lista com todos os produtos
3. Escolhe qual produto quer modificar
4. Os campos do formulário já carregam os dados do produto
5. Modifica o que precisa
6. Clica em "Salvar produto"

**Resultado:**
- O produto é atualizado na lista
- A loja é recarregada automaticamente com a versão nova

---

## 🗑️ 4. DELETAR PRODUTO

**Localização:** `admin.js` linha 96-130 (função `deleteProductById`)

**Como:**
1. Em modo "Editar existente", escolha um produto
2. Clique em "Excluir produto selecionado"
3. Confirme a exclusão
4. O produto é removido da lista e da loja

**O que acontece automaticamente:**
- Se esse produto era o destaque principal, a loja escolhe outro automaticamente
- A lista de produtos e o seletor são atualizados
- O armazenamento é sincronizado

---

## ⭐ 5. DEFINIR DESTAQUE PRINCIPAL

**Localização:** `admin.js` linha 269-280

**Como funciona:**
- Seção separada: "Destaque principal da loja"
- Escolhe um produto da lista
- Clica em "Definir como destaque"
- Esse produto aparece no card grande da home

**Armazenamento:**
```javascript
localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(selected));
// Chave: "jtechPromoProduct"
// Valor: { id, title, price, images, etc... }
```

---

## 📤 6. EXPORTAR CATÁLOGO (JSON)

**Localização:** `admin.js` linha 281-298 (`exportCatalogSnapshot`)

**O que é:**
- Baixa um arquivo `.json` com todos os produtos e configurações
- Nome do arquivo: `jtech-catalogo-2026-05-13.json`

**Conteúdo do JSON:**
```json
{
  "version": 1,
  "exportedAt": "2026-05-13T18:17:56.583Z",
  "promoId": "prod_teste_local",
  "catalog": [
    {
      "id": "prod_teste_local",
      "section": "promocoes",
      "title": "Produto Teste Local",
      "subtitle": "Validacao antes do Railway",
      "oldPrice": "R$ 100,00",
      "newPrice": "R$ 80,00",
      "off": "20% OFF",
      "shipping": "Teste local",
      "affiliateLink": "https://exemplo.com",
      "images": ["img/caixa1.jpeg"],
      "features": ["Teste 1", "Teste 2"],
      "badge": "OFERTA IMPERDIVEL"
    }
  ]
}
```

**Uso:**
- Fazer backup dos produtos
- Migrar catálogo entre domínios
- Compartilhar catálogo com outro admin

---

## 📥 7. IMPORTAR CATÁLOGO (JSON)

**Localização:** `admin.js` linha 299-346 (`parseCatalogFile`)

**Como:**
1. Clica em "Importar catálogo (JSON)"
2. Seleciona um arquivo `.json` que foi exportado antes
3. O sistema:
   - Valida o JSON
   - Normaliza os produtos
   - Substitui todo o catálogo atual
   - Sincroniza com a API se disponível

**O que acontece:**
- Todos os produtos anteriores são descartados
- Os novos produtos aparecem na lista
- A loja é recarregada automaticamente
- O destaque principal é recuperado se existir no novo catálogo

---

## 🧹 8. LIMPAR CATÁLOGO INTEIRO

**Localização:** `admin.js` linha 262-290

**Como:**
1. Clica em "Limpar catálogo inteiro"
2. Escreve a palavra `LIMPAR` para confirmar
3. Todos os produtos são deletados

**Resultado:**
- Lista fica vazia
- Loja mostra "Nenhum destaque definido"
- Armazenamento é sincronizado

---

## 🔄 9. SINCRONIZAÇÃO COM API (/api/catalog)

**Localização:** 
- `admin.js` linha 414-427 (getCatalog)
- `admin.js` linha 443-472 (persistCatalog)
- `admin.js` linha 615-675 (loadRemoteCatalog / saveRemoteCatalog)

**Fluxo:**

### 📖 LER catálogo (GET):
```
Admin carrega
    ↓
CATALOG_API_URL = "/api/catalog"
    ↓
loadRemoteCatalog() → fetch(GET)
    ↓
/api/catalog responde com { catalog: [...], promoId: "..." }
    ↓
Admin renderiza a lista
```

### 📝 ESCREVER catálogo (POST):
```
Admin clica "Salvar"
    ↓
persistCatalog(catalog)
    ↓
saveRemoteCatalog() → fetch(POST)
    ↓
POST /api/catalog com { catalog: [...], promoId: "..." }
    ↓
Backend salva em .catalog-local.json
    ↓
Resposta: { ok: true, catalogCount: 1 }
    ↓
Admin mostra "Produto salvo com sucesso"
```

---

## 🌍 10. FALLBACK LOCAL (sem Railway)

**Localização:** `admin.js` linha 415-427

**Como funciona:**
```javascript
async function getCatalog() {
    if (CATALOG_API_URL) {  // Se tiver API configurada
        const remoteCatalog = await loadRemoteCatalog();
        if (remoteCatalog.length) {
            return remoteCatalog;  // Usa dados da API
        }
    
        if (isLocalDevelopment()) {  // Se for localhost
            return loadLocalCatalog();  // Usa localStorage
        }
    }
    
    return loadLocalCatalog();  // Fallback local
}
```

**Resultado:**
- Em produção (Railway): usa API + PostgreSQL
- Em desenvolvimento (localhost): usa localStorage como backup
- A loja sempre funciona, nunca fica em branco

---

## 📊 FLUXO VISUAL COMPLETO

```
┌─────────────────────┐
│   Admin Carrega     │
└──────────┬──────────┘
           │
           ├─→ Lê catálogo (GET /api/catalog)
           │   └─→ .catalog-local.json
           │
           └─→ Renderiza lista de produtos
               ├─→ Novo produto
               ├─→ Editar produto
               ├─→ Deletar produto
               └─→ Definir destaque
                   │
                   ├─→ Salva (POST /api/catalog)
                   │   └─→ .catalog-local.json
                   │
                   └─→ Loja carrega automaticamente
                       ├─→ GET /api/catalog
                       ├─→ Renderiza home
                       └─→ Mostra produtos em tempo real
```

---

## 💾 EXEMPLO DE FLUXO COMPLETO

**1. Usuário cadastra produto:**
```
Admin → "Novo produto" → Preenche campos → Clica "Salvar"
```

**2. Backend processa:**
```
POST /api/catalog com payload JSON
→ Valida dados
→ Salva em .catalog-local.json
→ Retorna { ok: true, catalogCount: 1 }
```

**3. Frontend atualiza:**
```
Admin mostra "Produto salvo com sucesso"
→ Recarrega lista
→ Loja sincroniza automaticamente
```

**4. Loja exibe:**
```
GET /api/catalog
→ Retorna { catalog: [...], promoId: "..." }
→ Renderiza card principal
→ Exibe em todas as categorias
```

**5. Outro dispositivo acessa:**
```
GET /api/catalog (mesma URL)
→ Retorna mesmos dados
→ Mostra mesmo produto
✅ Funcionando em qualquer lugar!
```

---

## 🚀 QUANDO SUBIR PARA RAILWAY

O painel continuará funcionando igual, mas:
- Troca `.catalog-local.json` por **PostgreSQL**
- Troca por `DATABASE_URL` do Railway
- Sem mudar nenhuma linha de código do frontend
- Continua usando `/api/catalog`

```javascript
// Sem mudança no código:
if (CATALOG_API_URL) {
    const remoteCatalog = await loadRemoteCatalog();  // ← mesma coisa
    if (remoteCatalog.length) return remoteCatalog;
}
// Railway automaticamente persiste em PostgreSQL
```

---

## 📱 TESTE LOCAL (você pode fazer agora)

1. **Admin:** http://localhost:3000/admin.html
   - Senha: `JTECH@2026`
   - Cadastre um produto
   
2. **Loja:** http://localhost:3000/j-tech.html
   - Atualize a página
   - Produto aparece automaticamente
   
3. **Outro navegador/aba:**
   - Abra a loja novamente
   - Mesmo produto está lá
   - ✅ Sincronização funciona!
