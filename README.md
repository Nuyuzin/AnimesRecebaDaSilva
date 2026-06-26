# Animes Online Stremio Addon

Este é um addon para o Stremio que permite assistir conteúdos do site `animesonline.io`.

## Como hospedar no Render

1. Crie um novo repositório no GitHub.
2. Envie os arquivos deste projeto para o repositório.
3. No [Render](https://render.com/), crie um novo **Web Service**.
4. Conecte seu repositório do GitHub.
5. Configure o ambiente:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
6. Após o deploy, o Render fornecerá uma URL (ex: `https://meu-addon.onrender.com`).
7. No Stremio, vá em Addons -> Add local addon e cole a URL: `https://meu-addon.onrender.com/manifest.json`.

## Funcionalidades

- Catálogos de Populares, Recentes e Dublados.
- Organização correta de episódios para séries.
- Busca funcional.
- Suporte a Filmes e Séries (Animes).
