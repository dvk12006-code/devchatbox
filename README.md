# AI Assistant

React, Vite, and a small Node.js API server. Chat and recorded-voice transcription are sent through the server to an OpenAI-compatible API; the provider key is never included in the browser bundle. Supabase Auth protects accounts, and chat history, tasks, and preferences are stored in a row-level-secured Supabase table.

## Run locally

1. Create a Supabase project, run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor, and enable email/password sign-in in Authentication.
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` (the project's public anon/publishable key). For local server-side session verification, also set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to those same project values. You can also set `OPENAI_BASE_URL` and `OPENAI_MODEL` for an OpenAI-compatible provider.
3. In one terminal run `npm run server`.
4. In another terminal run `npm run dev`, then open the URL Vite prints.

The Vite development server proxies `/api` requests to the local Node server on port 3001. Supabase credentials are required for sign-in and account data. Chat and recorded-voice transcription separately require `OPENAI_API_KEY`. Browser-native speech recognition works where the browser supports it.

The Task Center stores tasks in the signed-in account. Research searches for sourced instant answers and provides a link to full web results. Text, Markdown, CSV, JSON, log, HTML, and source-code files can be attached to a chat prompt.

## Deploy on Render

This repository includes a Render Blueprint in `render.yaml`. Push the project to a Git provider, then in Render choose **New → Blueprint**, select that repository, and confirm the `ai-assistant` web service. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the frontend and `SUPABASE_URL` and `SUPABASE_ANON_KEY` for server-side session verification (the same project URL and public anon/publishable key), then run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor. Enable email/password sign-in and set the Supabase Authentication Site URL to your Render service URL. The anon key is intended for browser use; row-level security restricts account data to its owner. The chat and voice endpoints verify the signed-in user's session before accessing the AI provider.

Render builds the Vite frontend and serves it and `/api` from the same free-tier Node service. Health checks use `/api/health`. Chat and server-based voice transcription also need a valid `OPENAI_API_KEY` in Render → your service → Environment; Supabase does not replace this AI-provider key. Do not store it in a browser-visible Supabase table or frontend variable. After changing any `VITE_` variable, redeploy so the frontend is rebuilt.
