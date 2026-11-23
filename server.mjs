import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
try {
  const environment = await readFile(resolve(root, '.env'), 'utf8')
  for (const line of environment.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
const dist = resolve(root, 'dist')
const port = Number(process.env.PORT || 3001)
const maxBodyBytes = 64 * 1024
const maxMessages = 20
const maxMessageLength = 6000
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

async function readJson(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > maxBodyBytes) {
      const error = new Error('Request body is too large.')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Request body must be valid JSON.')
    error.status = 400
    throw error
  }
}

function validateMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxMessages) {
    return null
  }

  const messages = []
  let totalLength = 0
  for (const message of value) {
    if (
      !message ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      !message.content.trim() ||
      message.content.length > maxMessageLength
    ) {
      return null
    }
    totalLength += message.content.length
    if (totalLength > maxBodyBytes / 2) return null
    messages.push({ role: message.role, content: message.content })
  }
  if (messages[messages.length - 1].role !== 'user') return null
  return messages
}

async function handleChat(request, response) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 503, {
      error: 'AI is not configured. Add OPENAI_API_KEY to the service environment.',
      code: 'AI_NOT_CONFIGURED',
    })
    return
  }

  const body = await readJson(request)
  const messages = validateMessages(body?.messages)
  if (!messages) {
    sendJson(response, 400, { error: 'Provide up to 20 valid chat messages.' })
    return
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  let upstream
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful, clear, and honest AI assistant.' },
          ...messages,
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    console.error('AI provider request failed:', error instanceof Error ? error.message : 'Unknown error')
    sendJson(response, 502, { error: 'Could not reach the AI provider. Please try again.' })
    return
  }

  if (!upstream.ok) {
    console.error('AI provider returned HTTP', upstream.status)
    sendJson(response, upstream.status === 429 ? 429 : 502, {
      error: upstream.status === 429
        ? 'The AI provider is rate-limiting requests. Please try again shortly.'
        : 'The AI provider could not complete this request. Check the server configuration and try again.',
    })
    return
  }

  let result
  try {
    result = await upstream.json()
  } catch {
    sendJson(response, 502, { error: 'The AI provider returned an invalid response.' })
    return
  }

  const content = result?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    sendJson(response, 502, { error: 'The AI provider returned no answer.' })
    return
  }
  sendJson(response, 200, { answer: content })
}

async function serveStatic(request, response, pathname) {
  let requestedPath
  try {
    requestedPath = decodeURIComponent(pathname)
  } catch {
    sendJson(response, 400, { error: 'Invalid URL path.' })
    return
  }

  const candidate = resolve(dist, `.${requestedPath}`)
  if (candidate !== dist && !candidate.startsWith(`${dist}${sep}`)) {
    sendJson(response, 404, { error: 'Not found.' })
    return
  }

  let filePath = candidate
  try {
    if (!(await stat(filePath)).isFile()) filePath = resolve(dist, 'index.html')
  } catch {
    filePath = resolve(dist, 'index.html')
  }

  try {
    const content = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    response.end(request.method === 'HEAD' ? undefined : content)
  } catch {
    sendJson(response, 503, { error: 'Frontend files are missing. Run npm run build first.' })
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')
  try {
    if (url.pathname === '/api/health' && request.method === 'GET') {
      sendJson(response, 200, {
        status: 'ok',
        aiConfigured: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      })
      return
    }
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      await handleChat(request, response)
      return
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'API route not found.' })
      return
    }
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      sendJson(response, 405, { error: 'Method not allowed.' })
      return
    }
    await serveStatic(request, response, url.pathname)
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500
    if (status === 500) {
      console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error')
    }
    sendJson(response, status, { error: status === 500 ? 'Unexpected server error.' : error.message })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`AI Assistant server listening on port ${port}`)
})
