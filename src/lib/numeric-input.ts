/**
 * 將表單中的整數文字轉為安全整數。
 *
 * 輸入期間保持原始字串，只有在使用者送出時才呼叫此函式驗證，
 * 避免刪除或改寫數字時被即時轉換成 0 或其他預設值。
 */
export function parseIntegerInput(raw: string): number | null {
  const value = raw.trim()
  if (!/^\d+$/.test(value)) return null

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}
