# AI Assistant

React, Vite, and a small Node.js API server. Chat requests are sent through the server to an OpenAI-compatible API; the provider key is never included in the browser bundle.

## Run locally

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`. You can also set `OPENAI_BASE_URL` and `OPENAI_MODEL` for an OpenAI-compatible provider.
2. In one terminal run `npm run server`.
3. In another terminal run `npm run dev`, then open the URL Vite prints.

The Vite development server proxies `/api` requests to the local Node server on port 3001. The frontend works without an API key, but chat will return a clear configuration message until one is set.

## Deploy on Render

This repository includes a Render Blueprint in `render.yaml`. Push the project to a Git provider, then in Render choose **New → Blueprint**, select that repository, and confirm the `ai-assistant` web service. Set the secret `OPENAI_API_KEY` in the Render service environment (do not commit it or paste it into frontend code). Adjust `OPENAI_BASE_URL` and `OPENAI_MODEL` there when using another OpenAI-compatible provider.

Render builds the Vite frontend and serves it and `/api` from the same Node service. Health checks use `/api/health`.
