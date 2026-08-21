const LINE_ID_TOKEN_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify"
const lineUserIdPattern = /^U[0-9a-f]{32}$/i
const lineChannelIdPattern = /^[0-9]{5,32}$/

export interface VerifiedLineIdentity {
  providerAccountId: string
  providerUserId: string
  displayName: string
  pictureUrl: string | null
}

interface LineIdTokenVerifyResponse {
  iss?: unknown
  sub?: unknown
  aud?: unknown
  exp?: unknown
  name?: unknown
  picture?: unknown
}

export class LineIdentityError extends Error {
  readonly code:
    | "INVALID_LINE_TOKEN"
    | "LINE_TOKEN_REJECTED"
    | "LINE_VERIFY_UNAVAILABLE"

  constructor(
    code:
      | "INVALID_LINE_TOKEN"
      | "LINE_TOKEN_REJECTED"
      | "LINE_VERIFY_UNAVAILABLE",
    message: string,
  ) {
    super(message)
    this.name = "LineIdentityError"
    this.code = code
  }
}

function normalizedPictureUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null

  const pictureUrl = value.trim()
  if (pictureUrl.length > 2048 || !pictureUrl.startsWith("https://")) {
    return null
  }

  return pictureUrl
}

export async function verifyLineIdToken(
  idToken: string,
  expectedChannelId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifiedLineIdentity> {
  const normalizedToken = idToken.trim()
  const normalizedChannelId = expectedChannelId.trim()

  if (
    !normalizedToken
    || normalizedToken.length > 4096
    || !lineChannelIdPattern.test(normalizedChannelId)
  ) {
    throw new LineIdentityError("INVALID_LINE_TOKEN", "LINE token input is invalid")
  }

  const body = new URLSearchParams({
    id_token: normalizedToken,
    client_id: normalizedChannelId,
  })

  let response: Response
  try {
    response = await fetchImpl(LINE_ID_TOKEN_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new LineIdentityError(
      "LINE_VERIFY_UNAVAILABLE",
      "LINE identity verification is temporarily unavailable",
    )
  }

  if (!response.ok) {
    throw new LineIdentityError("LINE_TOKEN_REJECTED", "LINE rejected the ID token")
  }

  let payload: LineIdTokenVerifyResponse
  try {
    payload = await response.json() as LineIdTokenVerifyResponse
  } catch {
    throw new LineIdentityError(
      "LINE_VERIFY_UNAVAILABLE",
      "LINE returned an invalid verification response",
    )
  }

  const displayName = typeof payload.name === "string" ? payload.name.trim() : ""
  const providerUserId = typeof payload.sub === "string" ? payload.sub.trim() : ""
  const audience = typeof payload.aud === "string" ? payload.aud.trim() : ""
  const issuer = typeof payload.iss === "string" ? payload.iss.trim() : ""
  const expiresAt = typeof payload.exp === "number" ? payload.exp : Number(payload.exp)

  if (
    audience !== normalizedChannelId
    || issuer !== "https://access.line.me"
    || !lineUserIdPattern.test(providerUserId)
    || !displayName
    || displayName.length > 100
    || !Number.isFinite(expiresAt)
    || expiresAt * 1000 <= Date.now()
  ) {
    throw new LineIdentityError(
      "LINE_TOKEN_REJECTED",
      "LINE verification claims are invalid",
    )
  }

  return {
    providerAccountId: normalizedChannelId,
    providerUserId,
    displayName,
    pictureUrl: normalizedPictureUrl(payload.picture),
  }
}
