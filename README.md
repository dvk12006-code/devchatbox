# AI Assistant

React, Vite, and a small Node.js API server. Chat and recorded-voice transcription are sent through the server to an OpenAI-compatible API; the provider key is never included in the browser bundle.

## Run locally

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`. You can also set `OPENAI_BASE_URL` and `OPENAI_MODEL` for an OpenAI-compatible provider.
2. In one terminal run `npm run server`.
3. In another terminal run `npm run dev`, then open the URL Vite prints.

The Vite development server proxies `/api` requests to the local Node server on port 3001. Chat and recorded-voice transcription require `OPENAI_API_KEY`. Browser-native speech recognition works where the browser supports it.

The Task Center stores tasks in the current browser. Research searches for sourced instant answers and provides a link to full web results. Text, Markdown, CSV, JSON, log, HTML, and source-code files can be attached to a chat prompt.

## Deploy on Render

This repository includes a Render Blueprint in `render.yaml`. Push the project to a Git provider, then in Render choose **New → Blueprint**, select that repository, and confirm the `ai-assistant` web service. Set the secret `OPENAI_API_KEY` in the Render service environment (do not commit it or paste it into frontend code). Adjust `OPENAI_BASE_URL` and `OPENAI_MODEL` there when using another OpenAI-compatible provider.

Render builds the Vite frontend and serves it and `/api` from the same free-tier Node service. Health checks use `/api/health`. Add `OPENAI_API_KEY` to the Render service environment for chat and server-based voice transcription.
