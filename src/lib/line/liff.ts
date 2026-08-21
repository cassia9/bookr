import liff from '@line/liff'

export type LineBookingStatus = 'idle' | 'initializing' | 'connected' | 'failed'

export interface LineBookingSession {
  status: 'connected'
  idToken: string
  displayName: string
  pictureUrl: string | null
}

type LineBookingInitResult =
  | LineBookingSession
  | { status: 'idle' | 'initializing' | 'failed' }

function hasLineRedirectMarker(url: URL) {
  return [
    'liff.state',
    'liffClientId',
    'liffRedirectUri',
    'liff.referrer',
  ].some(key => url.searchParams.has(key))
}

/**
 * 初始化 LIFF，但不讓一般預約網址強制跳出 LINE 登入。
 * LINE user ID 只留在 LIFF SDK 內，不回傳給頁面或直接送到後端。
 */
export async function initializeLineBooking(liffId: string): Promise<LineBookingInitResult> {
  const normalizedLiffId = liffId.trim()
  if (!normalizedLiffId) return { status: 'idle' }

  try {
    await liff.init({ liffId: normalizedLiffId })

    const url = new URL(window.location.href)
    const enteredFromLine = liff.isInClient()
      || Boolean(liff.getContext())
      || hasLineRedirectMarker(url)
      || /\bLine\//i.test(navigator.userAgent)

    if (!enteredFromLine) return { status: 'idle' }

    if (!liff.isLoggedIn()) {
      liff.login()
      return { status: 'initializing' }
    }

    const [profile, idToken] = await Promise.all([
      liff.getProfile(),
      Promise.resolve(liff.getIDToken()),
    ])

    if (!idToken) return { status: 'failed' }

    return {
      status: 'connected',
      idToken,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl ?? null,
    }
  } catch {
    return { status: 'failed' }
  }
}

/** 送出前重新向 LIFF SDK 取得目前 token，避免長時間填表後使用過期快照。 */
export function getCurrentLineIdToken() {
  if (!liff.isLoggedIn()) return null
  return liff.getIDToken()
}
