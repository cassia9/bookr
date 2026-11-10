import { describe, expect, it } from 'vitest'
import {
  areRichMenuAreasValid,
  clampRichMenuBounds,
  isRichMenuBoundsAvailable,
  moveRichMenuBounds,
  resizeRichMenuBounds,
  richMenuBoundsOverlap,
} from './lineRichMenuGeometry'

describe('LINE 圖文選單自訂格子幾何規則', () => {
  it('移動時會吸附並留在畫布內', () => {
    expect(moveRichMenuBounds(
      { x: 100, y: 100, width: 500, height: 350 },
      2_400,
      1_600,
    )).toEqual({ x: 2000, y: 1336, width: 500, height: 350 })
  })

  it('縮放時會套用最小尺寸與畫布邊界', () => {
    expect(resizeRichMenuBounds(
      { x: 2_000, y: 1_300, width: 500, height: 386 },
      -450,
      900,
    )).toEqual({ x: 2000, y: 1300, width: 250, height: 386 })
  })

  it('相鄰格子不視為重疊', () => {
    const left = { x: 0, y: 0, width: 1250, height: 1686 }
    const right = { x: 1250, y: 0, width: 1250, height: 1686 }

    expect(richMenuBoundsOverlap(left, right)).toBe(false)
    expect(areRichMenuAreasValid([left, right])).toBe(true)
  })

  it('拒絕與其他格子重疊的新位置', () => {
    const areas = [
      { areaKey: 'a', x: 0, y: 0, width: 1250, height: 1686 },
      { areaKey: 'b', x: 1250, y: 0, width: 1250, height: 1686 },
    ]

    expect(isRichMenuBoundsAvailable(
      { x: 1000, y: 0, width: 1250, height: 1686 },
      areas,
      'a',
    )).toBe(false)
  })

  it('修正超出畫布的數值', () => {
    expect(clampRichMenuBounds({ x: -20, y: -20, width: 2600, height: 1800 }))
      .toEqual({ x: 0, y: 0, width: 2500, height: 1686 })
  })
})
