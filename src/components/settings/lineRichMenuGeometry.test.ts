import { describe, expect, it } from 'vitest'
import {
  areRichMenuAreasValid,
  clampRichMenuBounds,
  findRichMenuInsertionBounds,
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

  it('移動預設三格版型時保留原始尺寸', () => {
    expect(moveRichMenuBounds(
      { x: 0, y: 0, width: 834, height: 1686 },
      100,
      0,
    )).toEqual({ x: 100, y: 0, width: 834, height: 1686 })
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

  it('可在畫布空白區建立不重疊格子', () => {
    expect(findRichMenuInsertionBounds(1_000, 1_200, [
      { x: 0, y: 0, width: 2500, height: 843 },
    ])).toEqual({ x: 0, y: 843, width: 2500, height: 843 })
  })

  it('點在既有格子或過小空隙時不新增', () => {
    expect(findRichMenuInsertionBounds(500, 500, [
      { x: 0, y: 0, width: 1250, height: 1686 },
    ])).toBeNull()
    expect(findRichMenuInsertionBounds(1_300, 500, [
      { x: 0, y: 0, width: 1250, height: 1686 },
      { x: 1400, y: 0, width: 1100, height: 1686 },
    ])).toBeNull()
  })

  it('修正超出畫布的數值', () => {
    expect(clampRichMenuBounds({ x: -20, y: -20, width: 2600, height: 1800 }))
      .toEqual({ x: 0, y: 0, width: 2500, height: 1686 })
  })
})
