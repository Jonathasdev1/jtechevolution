# Deploy J-TECH no Railway

## Estrutura pronta

- `server.js`: servidor Express que entrega a loja, o admin e a API.
- `catalog-store.js`: camada de dados com PostgreSQL em producao e JSON local em desenvolvimento.
- `admin.html` + `admin.js`: painel protegido por senha de servidor para salvar catalogo.
- `railway.json`: comando de start e health check para o Railway.

## Variaveis obrigatorias

Configure no Railway:

```env
DATABASE_URL=postgresql://...
ADMIN_PASSWORD=uma-senha-forte
NODE_ENV=production
```

O Railway preenche `PORT` automaticamente. Nao crie uma variavel `PORT` manualmente.

## Banco de dados

1. Crie um projeto no Railway.
2. Adicione um plugin PostgreSQL.
3. Conecte o servico Node ao PostgreSQL.
4. Garanta que `DATABASE_URL` esteja disponivel no servico da aplicacao.

O servidor cria a tabela `jtech_catalog_state` automaticamente no primeiro start.

## Seed inicial

Se quiser subir produtos iniciais:

1. No admin local, clique em `Salvar Seed de Deploy`.
2. Coloque o arquivo baixado como `catalog-seed.json` na raiz do projeto.
3. Suba o projeto para o Railway.

O seed so e aplicado se o banco ainda estiver vazio.

## Rotas importantes

- `/`: loja J-TECH.
- `/admin.html`: painel admin.
- `/api/catalog`: leitura publica e gravacao protegida.
- `/api/health`: health check do Railway.

## Checklist antes de publicar

- Trocar `ADMIN_PASSWORD`.
- Confirmar `DATABASE_URL`.
- Rodar `npm start` localmente.
- Abrir `/admin.html`, cadastrar um produto e conferir na loja.
