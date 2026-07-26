# Guia do Painel Admin J-TECH

## 1. Autenticacao

O painel pede senha ao abrir `/admin/login/`.
Depois do login, use:

- `/admin/cadastro/` para criar/editar produtos.
- `/admin/produtos/` para listar, buscar, filtrar e excluir.

Em desenvolvimento local, a senha padrao e `JTECH@2026`. Em producao no Railway, configure uma senha forte na variavel:

```env
ADMIN_PASSWORD=uma-senha-forte
```

O navegador guarda apenas a sessao da aba atual. A gravacao do catalogo tambem e validada no backend por `X-Admin-Password`, entao visitantes nao conseguem salvar produtos chamando a API sem senha.

## 2. Criar Produto

1. Selecione `Novo produto`.
2. Preencha titulo, secao, desconto, subtitulo, precos, frete e link de afiliado.
3. Informe imagens por caminho, URL ou upload local.
4. Cadastre caracteristicas, uma por linha.
5. Clique em `Salvar produto`.

O painel valida uploads locais com resolucao minima de 800x800 e cria previews para conferencia visual.

## 3. Editar Produto

1. Selecione `Editar existente`.
2. Escolha um produto na lista.
3. Ajuste os campos.
4. Clique em `Salvar produto`.

O produto e atualizado no catalogo compartilhado. Se ele for o destaque atual, a loja passa a exibir a versao nova.

## 4. Destaque Principal

Use a area `Destaque principal` para escolher qual produto aparece primeiro na vitrine de promocoes.

## 5. Backup e Seed

- `Exportar catalogo`: baixa um JSON de backup.
- `Importar catalogo`: carrega um JSON exportado antes.
- `Salvar Seed de Deploy`: baixa `catalog-seed.json` para iniciar um deploy novo com produtos.

Para Railway, coloque `banco/catalog-seed.json` antes do primeiro deploy. O seed so e aplicado se o banco estiver vazio.

## 6. Backend

Rotas principais:

- `GET /api/catalog`: leitura publica do catalogo.
- `POST /api/catalog`: gravacao protegida por senha.
- `POST /api/admin/login`: validacao da senha do admin.
- `GET /api/health`: health check do Railway.

Em desenvolvimento sem `DATABASE_URL`, o servidor salva em `banco/.catalog-local.json`. Em producao com `NODE_ENV=production`, `DATABASE_URL` e `ADMIN_PASSWORD` sao obrigatorios.

## 7. Deploy Railway

Leia tambem `RAILWAY_DEPLOY.md`.

Checklist rapido:

1. Criar PostgreSQL no Railway.
2. Configurar `DATABASE_URL`, `ADMIN_PASSWORD` e `NODE_ENV=production`.
3. Fazer deploy do repositorio.
4. Abrir `/api/health`.
5. Acessar `/admin/login/`, entrar e cadastrar um produto.
