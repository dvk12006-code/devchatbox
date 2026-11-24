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
const maxBodyBytes = 8 * 1024 * 1024
const maxAudioBytes = 5 * 1024 * 1024
const maxMessages = 20
const maxMessageLength = 6000
const maxChatCharacters = 30_000
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

async function requireAuthenticatedUser(request, response) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    sendJson(response, 503, {
      error: 'Authentication is not configured. Set the Supabase URL and anon key in the service environment.',
    })
    return false
  }

  const authorization = request.headers.authorization || ''
  const token = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1]
  if (!token) {
    sendJson(response, 401, { error: 'Sign in to use this service.' })
    return false
  }

  let upstream
  try {
    upstream = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    console.error('Supabase authentication request failed:', error instanceof Error ? error.message : 'Unknown error')
    sendJson(response, 502, { error: 'Could not verify your account. Please try again.' })
    return false
  }

  if (upstream.status === 401 || upstream.status === 403) {
    sendJson(response, 401, { error: 'Your session has expired. Sign in again.' })
    return false
  }
  if (!upstream.ok) {
    console.error('Supabase authentication returned HTTP', upstream.status)
    sendJson(response, 502, { error: 'Could not verify your account. Please try again.' })
    return false
  }
  return true
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
    if (totalLength > maxChatCharacters) return null
    messages.push({ role: message.role, content: message.content })
  }
  if (messages[messages.length - 1].role !== 'user') return null
  return messages
}

async function handleChat(request, response) {
  if (!(await requireAuthenticatedUser(request, response))) return
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

async function handleTranscription(request, response) {
  if (!(await requireAuthenticatedUser(request, response))) return
  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 503, {
      error: 'AI is not configured. Add OPENAI_API_KEY to the service environment.',
      code: 'AI_NOT_CONFIGURED',
    })
    return
  }

  const body = await readJson(request)
  const supportedTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg']
  if (
    typeof body?.audio !== 'string' ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio) ||
    typeof body?.mimeType !== 'string' ||
    !supportedTypes.includes(body.mimeType)
  ) {
    sendJson(response, 400, { error: 'Provide a supported audio recording.' })
    return
  }

  const audio = Buffer.from(body.audio, 'base64')
  if (audio.length === 0 || audio.length > maxAudioBytes) {
    sendJson(response, 413, { error: 'Voice recordings must be smaller than 5 MB.' })
    return
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const form = new FormData()
  form.append('file', new Blob([audio], { type: body.mimeType }), `voice.${body.mimeType.split('/')[1]}`)
  form.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1')

  let upstream
  try {
    upstream = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    console.error('Audio transcription request failed:', error instanceof Error ? error.message : 'Unknown error')
    sendJson(response, 502, { error: 'Could not reach the transcription provider. Please try again.' })
    return
  }

  if (!upstream.ok) {
    console.error('Audio transcription provider returned HTTP', upstream.status)
    sendJson(response, upstream.status === 429 ? 429 : 502, {
      error: upstream.status === 429
        ? 'The transcription provider is rate-limiting requests. Please try again shortly.'
        : 'The transcription provider could not process this recording. Check your provider settings.',
    })
    return
  }

  let result
  try {
    result = await upstream.json()
  } catch {
    sendJson(response, 502, { error: 'The transcription provider returned an invalid response.' })
    return
  }
  if (typeof result?.text !== 'string' || !result.text.trim()) {
    sendJson(response, 502, { error: 'No speech was detected in that recording.' })
    return
  }
  sendJson(response, 200, { transcript: result.text })
}

async function handleResearch(url, response) {
  const query = url.searchParams.get('q')?.trim()
  if (!query || query.length > 200) {
    sendJson(response, 400, { error: 'Enter a search query of up to 200 characters.' })
    return
  }

  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
  const endpoint = new URL('https://api.duckduckgo.com/')
  endpoint.searchParams.set('q', query)
  endpoint.searchParams.set('format', 'json')
  endpoint.searchParams.set('no_html', '1')
  endpoint.searchParams.set('skip_disambig', '1')

  let upstream
  try {
    upstream = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'User-Agent': 'AI-Assistant/1.0' },
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    console.error('Research provider request failed:', error instanceof Error ? error.message : 'Unknown error')
    sendJson(response, 502, { error: 'Could not reach the research provider. Try web search instead.', searchUrl })
    return
  }
  if (!upstream.ok) {
    sendJson(response, 502, { error: 'The research provider is temporarily unavailable.', searchUrl })
    return
  }

  let result
  try {
    result = await upstream.json()
  } catch {
    sendJson(response, 502, { error: 'The research provider returned an invalid response.', searchUrl })
    return
  }

  const results = []
  if (result.AbstractText && result.AbstractURL) {
    results.push({
      title: result.Heading || query,
      summary: result.AbstractText,
      url: result.AbstractURL,
    })
  }

  const topicQueue = [...(Array.isArray(result.RelatedTopics) ? result.RelatedTopics : [])]
  while (topicQueue.length && results.length < 6) {
    const topic = topicQueue.shift()
    if (Array.isArray(topic?.Topics)) {
      topicQueue.unshift(...topic.Topics)
      continue
    }
    if (typeof topic?.Text !== 'string' || typeof topic?.FirstURL !== 'string') continue
    const separator = topic.Text.indexOf(' - ')
    results.push({
      title: separator < 0 ? topic.Text : topic.Text.slice(0, separator),
      summary: separator < 0 ? topic.Text : topic.Text.slice(separator + 3),
      url: topic.FirstURL,
    })
  }

  sendJson(response, 200, { query, results, searchUrl })
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
    if (url.pathname === '/api/transcribe' && request.method === 'POST') {
      await handleTranscription(request, response)
      return
    }
    if (url.pathname === '/api/research' && request.method === 'GET') {
      await handleResearch(url, response)
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
