import liff from '@line/liff'

export type LineBookingStatus = 'idle' | 'initializing' | 'connected' | 'failed'
export type LineFriendStatus = 'friend' | 'not_friend' | 'unknown'

export interface LineBookingSession {
  status: 'connected'
  idToken: string
  displayName: string
  pictureUrl: string | null
  friendStatus: LineFriendStatus
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

    const [profile, idToken, friendship] = await Promise.all([
      liff.getProfile(),
      Promise.resolve(liff.getIDToken()),
      liff.getFriendship().catch(() => null),
    ])

    if (!idToken) return { status: 'failed' }

    return {
      status: 'connected',
      idToken,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl ?? null,
      friendStatus: friendship === null
        ? 'unknown'
        : friendship.friendFlag
          ? 'friend'
          : 'not_friend',
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

/**
 * 顯示 LINE 官方的加好友／解除封鎖視窗。
 * 查詢或提示失敗時只回傳 false，不影響客戶繼續完成預約。
 */
export async function requestLineFriendship() {
  if (!liff.isLoggedIn()) return false

  try {
    const current = await liff.getFriendship()
    if (current.friendFlag) return true

    await liff.requestFriendship()
    const updated = await liff.getFriendship()
    return updated.friendFlag
  } catch {
    return false
  }
}
