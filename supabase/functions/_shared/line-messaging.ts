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

export type LineBookingNotificationType =
  | "booking_received"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "reminder"

export interface LineFlexMessage {
  type: "flex"
  altText: string
  contents: Record<string, unknown>
}

export interface LineTemplateValues {
  customer_name: string
  service_name: string
  practitioner_name: string
  start_time: string
  store_name: string
}

const bookingCardStyles: Record<LineBookingNotificationType, {
  title: string
  status: string
  accent: string
  headerText: string
  softBackground: string
  footerText: string
  footer: string
}> = {
  booking_received: {
    title: "預約申請已收到",
    status: "等待確認",
    accent: "#D8C8A8",
    headerText: "#3F382C",
    softBackground: "#F8F3E9",
    footerText: "#796A50",
    footer: "確認完成後，我們會再傳送通知。",
  },
  booking_confirmed: {
    title: "預約已確認",
    status: "已確認",
    accent: "#8DBA45",
    headerText: "#263514",
    softBackground: "#F2F8E7",
    footerText: "#58752E",
    footer: "請依預約時間抵達，如需調整請聯絡店家。",
  },
  booking_cancelled: {
    title: "預約已取消",
    status: "已取消",
    accent: "#C2414B",
    headerText: "#FFFFFF",
    softBackground: "#FFF0F1",
    footerText: "#C2414B",
    footer: "如需重新安排，歡迎再次使用預約連結。",
  },
  booking_rescheduled: {
    title: "預約時間已更新",
    status: "已更新",
    accent: "#5B5BD6",
    headerText: "#FFFFFF",
    softBackground: "#F1F0FF",
    footerText: "#5B5BD6",
    footer: "請留意新的預約時間。",
  },
  reminder: {
    title: "預約提醒",
    status: "即將開始",
    accent: "#2563A6",
    headerText: "#FFFFFF",
    softBackground: "#EDF6FF",
    footerText: "#2563A6",
    footer: "我們期待您的到來。",
  },
}

function bookingDetailRow(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "md",
    contents: [
      {
        type: "text",
        text: label,
        size: "sm",
        color: "#7A8494",
        flex: 2,
      },
      {
        type: "text",
        text: value || "—",
        size: "sm",
        color: "#18212F",
        weight: "bold",
        wrap: true,
        flex: 5,
      },
    ],
  }
}

function bookingCardIntro(renderedText: string) {
  const detailLinePattern = /^(課程|老師|時間|原預約時間|新時間)\s*[：:]/
  return renderedText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !detailLinePattern.test(line))
    .join("\n")
    .slice(0, 1_500)
}

export function buildLineBookingFlexMessage(
  eventType: LineBookingNotificationType,
  renderedText: string,
  values: LineTemplateValues,
): LineFlexMessage {
  const style = bookingCardStyles[eventType]
  const altText = renderedText.trim().slice(0, 1_500)
  const intro = bookingCardIntro(renderedText)

  if (!altText) {
    throw new LineMessagingError(
      "INVALID_LINE_CONFIGURATION",
      "LINE Flex Message alternative text is invalid",
    )
  }

  const contents: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: style.accent,
      paddingAll: "20px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: "BOOKR · 預約通知",
              size: "xs",
              color: style.headerText,
              weight: "bold",
              flex: 1,
            },
            {
              type: "text",
              text: style.status,
              size: "xs",
              color: style.headerText,
              weight: "bold",
              align: "end",
            },
          ],
        },
        {
          type: "text",
          text: style.title,
          size: "xl",
          color: style.headerText,
          weight: "bold",
          wrap: true,
          margin: "md",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: [
        ...(intro
          ? [{
            type: "text",
            text: intro,
            size: "sm",
            color: "#455264",
            wrap: true,
          }]
          : []),
        {
          type: "separator",
          color: "#E5E9EF",
          margin: intro ? "xl" : "none",
        },
        bookingDetailRow("課程", values.service_name),
        bookingDetailRow("老師", values.practitioner_name),
        bookingDetailRow(
          eventType === "booking_rescheduled" ? "新時間" : "時間",
          values.start_time,
        ),
        bookingDetailRow("店家", values.store_name),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      backgroundColor: style.softBackground,
      paddingAll: "16px",
      contents: [{
        type: "text",
        text: style.footer,
        size: "xs",
        color: style.footerText,
        wrap: true,
        align: "center",
      }],
    },
  }

  if (new TextEncoder().encode(JSON.stringify(contents)).length > 30_000) {
    throw new LineMessagingError(
      "INVALID_LINE_CONFIGURATION",
      "LINE Flex Message bubble is too large",
    )
  }

  return { type: "flex", altText, contents }
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

  let signatureBytes: Uint8Array
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
    message: string | LineFlexMessage
    retryKey: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<LinePushResult> {
  const token = normalizedAccessToken(options.channelAccessToken)
  const recipient = normalizedLineUserId(options.to)
  const message = typeof options.message === "string"
    ? { type: "text" as const, text: options.message.trim() }
    : options.message

  const invalidText = message.type === "text"
    && (!message.text || message.text.length > 5_000)
  const invalidFlex = message.type === "flex"
    && (
      !message.altText
      || message.altText.length > 1_500
      || !message.contents
      || new TextEncoder().encode(JSON.stringify(message.contents)).length > 30_000
    )

  if (invalidText || invalidFlex || !uuidPattern.test(options.retryKey)) {
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
        messages: [message],
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
