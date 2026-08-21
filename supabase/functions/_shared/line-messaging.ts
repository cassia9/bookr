const LINE_BOT_INFO_URL = "https://api.line.me/v2/bot/info"
const LINE_PUSH_MESSAGE_URL = "https://api.line.me/v2/bot/message/push"
const lineUserIdPattern = /^U[0-9a-f]{32}$/i
const lineChannelIdPattern = /^[0-9]{5,32}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LINE_TEMPLATE_VARIABLES = [
  "customer_name",
  "service_name",
  "practitioner_name",
  "start_time",
  "store_name",
] as const

type LineTemplateVariable = typeof LINE_TEMPLATE_VARIABLES[number]

export interface LineBotInfo {
  botUserId: string
  basicId: string | null
  displayName: string
}

export interface LinePushResult {
  requestId: string | null
}

export interface LineTemplateValues {
  customer_name: string
  service_name: string
  practitioner_name: string
  start_time: string
  store_name: string
}

interface LineBotInfoResponse {
  userId?: unknown
  basicId?: unknown
  displayName?: unknown
}

export class LineMessagingError extends Error {
  readonly code:
    | "INVALID_LINE_CONFIGURATION"
    | "LINE_AUTH_REJECTED"
    | "LINE_RATE_LIMITED"
    | "LINE_RECIPIENT_REJECTED"
    | "LINE_API_REJECTED"
    | "LINE_API_UNAVAILABLE"
  readonly retryable: boolean
  readonly httpStatus: number | null
  readonly retryAfterSeconds: number | null

  constructor(
    code: LineMessagingError["code"],
    message: string,
    options: {
      retryable?: boolean
      httpStatus?: number | null
      retryAfterSeconds?: number | null
    } = {},
  ) {
    super(message)
    this.name = "LineMessagingError"
    this.code = code
    this.retryable = options.retryable ?? false
    this.httpStatus = options.httpStatus ?? null
    this.retryAfterSeconds = options.retryAfterSeconds ?? null
  }
}

function normalizedAccessToken(value: string) {
  const token = value.trim()
  if (token.length < 20 || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new LineMessagingError(
      "INVALID_LINE_CONFIGURATION",
      "LINE access token is invalid",
    )
  }
  return token
}

function normalizedLineUserId(value: string) {
  const userId = value.trim()
  if (!lineUserIdPattern.test(userId)) {
    throw new LineMessagingError(
      "LINE_RECIPIENT_REJECTED",
      "LINE recipient is invalid",
      { httpStatus: 400 },
    )
  }
  return userId
}

function parseRetryAfter(response: Response) {
  const value = response.headers.get("retry-after")
  if (!value) return null

  const seconds = Number(value)
  if (Number.isInteger(seconds) && seconds > 0 && seconds <= 86_400) {
    return seconds
  }

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null

  return Math.max(1, Math.min(86_400, Math.ceil((timestamp - Date.now()) / 1000)))
}

function lineHttpError(response: Response) {
  const status = response.status

  if (status === 401 || status === 403) {
    return new LineMessagingError(
      "LINE_AUTH_REJECTED",
      "LINE rejected the channel access token",
      { httpStatus: status },
    )
  }

  if (status === 429) {
    return new LineMessagingError(
      "LINE_RATE_LIMITED",
      "LINE rate limit reached",
      {
        retryable: true,
        httpStatus: status,
        retryAfterSeconds: parseRetryAfter(response),
      },
    )
  }

  if (status >= 500) {
    return new LineMessagingError(
      "LINE_API_UNAVAILABLE",
      "LINE Messaging API is temporarily unavailable",
      { retryable: true, httpStatus: status },
    )
  }

  if (status === 400 || status === 404) {
    return new LineMessagingError(
      "LINE_RECIPIENT_REJECTED",
      "LINE rejected the recipient or message",
      { httpStatus: status },
    )
  }

  return new LineMessagingError(
    "LINE_API_REJECTED",
    "LINE rejected the request",
    { httpStatus: status },
  )
}

export async function fetchLineBotInfo(
  channelAccessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LineBotInfo> {
  const token = normalizedAccessToken(channelAccessToken)

  let response: Response
  try {
    response = await fetchImpl(LINE_BOT_INFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new LineMessagingError(
      "LINE_API_UNAVAILABLE",
      "LINE bot verification is temporarily unavailable",
      { retryable: true },
    )
  }

  if (!response.ok) throw lineHttpError(response)

  let payload: LineBotInfoResponse
  try {
    payload = await response.json() as LineBotInfoResponse
  } catch {
    throw new LineMessagingError(
      "LINE_API_UNAVAILABLE",
      "LINE returned an invalid bot response",
      { retryable: true, httpStatus: response.status },
    )
  }

  const botUserId = typeof payload.userId === "string" ? payload.userId.trim() : ""
  const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : ""
  const basicId = typeof payload.basicId === "string" ? payload.basicId.trim() : ""

  if (
    !lineUserIdPattern.test(botUserId)
    || !displayName
    || displayName.length > 100
    || (basicId && !/^@[A-Za-z0-9._-]{5,100}$/.test(basicId))
  ) {
    throw new LineMessagingError(
      "LINE_API_UNAVAILABLE",
      "LINE bot metadata is invalid",
      { retryable: true, httpStatus: response.status },
    )
  }

  return { botUserId, basicId: basicId || null, displayName }
}

export function validateLineMessageTemplate(template: string) {
  // 舊版 migration 以字面 `\\n` 儲存換行；統一轉為真正換行，
  // 避免推播內容顯示反斜線與字母 n。
  const normalizedTemplate = template.trim().replace(/\\n/g, "\n")
  if (!normalizedTemplate || normalizedTemplate.length > 4_500) {
    throw new LineMessagingError(
      "INVALID_LINE_CONFIGURATION",
      "LINE message template length is invalid",
    )
  }

  const allowedVariables = new Set<string>(LINE_TEMPLATE_VARIABLES)
  const variablePattern = /{{\s*([a-z_]+)\s*}}/g
  const unknownVariables = new Set<string>()

  for (const match of normalizedTemplate.matchAll(variablePattern)) {
    if (!allowedVariables.has(match[1])) unknownVariables.add(match[1])
  }

  const unmatchedSyntax = normalizedTemplate
    .replace(variablePattern, "")
    .includes("{{")
    || normalizedTemplate.replace(variablePattern, "").includes("}}")

  if (unknownVariables.size > 0 || unmatchedSyntax) {
    throw new LineMessagingError(
      "INVALID_LINE_CONFIGURATION",
      "LINE message template contains unsupported variables",
    )
  }

  return normalizedTemplate
}

export function renderLineMessageTemplate(
  template: string,
  values: LineTemplateValues,
) {
  let message = validateLineMessageTemplate(template)

  for (const variable of LINE_TEMPLATE_VARIABLES) {
    const safeValue = String(values[variable as LineTemplateVariable] ?? "").trim()
    message = message.replace(
      new RegExp(`{{\\s*${variable}\\s*}}`, "g"),
      safeValue,
    )
  }

  if (!message || message.length > 5_000) {
    throw new LineMessagingError(
      "INVALID_LINE_CONFIGURATION",
      "Rendered LINE message length is invalid",
    )
  }

  return message
}

export function formatLineBookingTime(
  startTime: string | Date,
  timeZone = "Asia/Taipei",
) {
  const date = startTime instanceof Date ? startTime : new Date(startTime)
  if (Number.isNaN(date.getTime())) {
    throw new LineMessagingError(
      "INVALID_LINE_CONFIGURATION",
      "Booking start time is invalid",
    )
  }

  try {
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  } catch {
    throw new LineMessagingError(
      "INVALID_LINE_CONFIGURATION",
      "Store timezone is invalid",
    )
  }
}

export async function verifyLineWebhookSignature(
  rawBody: string,
  signature: string,
  channelSecret: string,
) {
  const normalizedSignature = signature.trim()
  const normalizedSecret = channelSecret.trim()
  if (!rawBody || !normalizedSignature || normalizedSecret.length < 20) return false

  let signatureBytes: Uint8Array<ArrayBuffer>
  try {
    const binary = atob(normalizedSignature)
    const decodedBytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    signatureBytes = new Uint8Array(decodedBytes.length)
    signatureBytes.set(decodedBytes)
  } catch {
    return false
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(normalizedSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    )

    return await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(rawBody),
    )
  } catch {
    return false
  }
}

export async function sendLinePushMessage(
  options: {
    channelAccessToken: string
    to: string
    message: string
    retryKey: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<LinePushResult> {
  const token = normalizedAccessToken(options.channelAccessToken)
  const recipient = normalizedLineUserId(options.to)
  const message = options.message.trim()

  if (!message || message.length > 5_000 || !uuidPattern.test(options.retryKey)) {
    throw new LineMessagingError(
      "INVALID_LINE_CONFIGURATION",
      "LINE message or retry key is invalid",
    )
  }

  let response: Response
  try {
    response = await fetchImpl(LINE_PUSH_MESSAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": options.retryKey,
      },
      body: JSON.stringify({
        to: recipient,
        messages: [{ type: "text", text: message }],
      }),
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw new LineMessagingError(
      "LINE_API_UNAVAILABLE",
      "LINE push request is temporarily unavailable",
      { retryable: true },
    )
  }

  if (!response.ok) throw lineHttpError(response)

  return {
    requestId: response.headers.get("x-line-request-id")?.slice(0, 255) || null,
  }
}

export function calculateLineRetryDelay(
  attemptCount: number,
  retryAfterSeconds: number | null = null,
) {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Math.min(86_400, Math.max(1, Math.round(retryAfterSeconds)))
  }

  const normalizedAttempt = Math.min(10, Math.max(1, Math.floor(attemptCount)))
  return Math.min(3_600, 30 * (2 ** (normalizedAttempt - 1)))
}
