export const RICH_MENU_CANVAS_WIDTH = 2500
export const RICH_MENU_CANVAS_HEIGHT = 1686
export const RICH_MENU_SNAP_SIZE = 50
export const RICH_MENU_MIN_AREA_WIDTH = 250
export const RICH_MENU_MIN_AREA_HEIGHT = 169
export const RICH_MENU_MAX_CUSTOM_AREAS = 6

export interface RichMenuBounds {
  x: number
  y: number
  width: number
  height: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function snapRichMenuValue(value: number) {
  return Math.round(value / RICH_MENU_SNAP_SIZE) * RICH_MENU_SNAP_SIZE
}

export function clampRichMenuBounds(bounds: RichMenuBounds): RichMenuBounds {
  const width = clamp(
    snapRichMenuValue(bounds.width),
    RICH_MENU_MIN_AREA_WIDTH,
    RICH_MENU_CANVAS_WIDTH,
  )
  const height = clamp(
    snapRichMenuValue(bounds.height),
    RICH_MENU_MIN_AREA_HEIGHT,
    RICH_MENU_CANVAS_HEIGHT,
  )
  const x = clamp(
    snapRichMenuValue(bounds.x),
    0,
    RICH_MENU_CANVAS_WIDTH - width,
  )
  const y = clamp(
    snapRichMenuValue(bounds.y),
    0,
    RICH_MENU_CANVAS_HEIGHT - height,
  )

  return { x, y, width, height }
}

export function moveRichMenuBounds(
  original: RichMenuBounds,
  deltaX: number,
  deltaY: number,
) {
  return {
    ...original,
    x: clamp(
      snapRichMenuValue(original.x + deltaX),
      0,
      RICH_MENU_CANVAS_WIDTH - original.width,
    ),
    y: clamp(
      snapRichMenuValue(original.y + deltaY),
      0,
      RICH_MENU_CANVAS_HEIGHT - original.height,
    ),
  }
}

export function resizeRichMenuBounds(
  original: RichMenuBounds,
  deltaX: number,
  deltaY: number,
) {
  return {
    ...original,
    width: clamp(
      snapRichMenuValue(original.width + deltaX),
      RICH_MENU_MIN_AREA_WIDTH,
      RICH_MENU_CANVAS_WIDTH - original.x,
    ),
    height: clamp(
      snapRichMenuValue(original.height + deltaY),
      RICH_MENU_MIN_AREA_HEIGHT,
      RICH_MENU_CANVAS_HEIGHT - original.y,
    ),
  }
}

export function richMenuBoundsOverlap(left: RichMenuBounds, right: RichMenuBounds) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

export function isRichMenuBoundsAvailable<T extends RichMenuBounds & { areaKey: string }>(
  candidate: RichMenuBounds,
  areas: T[],
  activeAreaKey: string,
) {
  return areas.every(area => (
    area.areaKey === activeAreaKey || !richMenuBoundsOverlap(candidate, area)
  ))
}

export function findRichMenuInsertionBounds<T extends RichMenuBounds>(
  pointX: number,
  pointY: number,
  areas: T[],
): RichMenuBounds | null {
  const x = clamp(pointX, 0, RICH_MENU_CANVAS_WIDTH - 1)
  const y = clamp(pointY, 0, RICH_MENU_CANVAS_HEIGHT - 1)

  if (areas.some(area => (
    x >= area.x
    && x < area.x + area.width
    && y >= area.y
    && y < area.y + area.height
  ))) return null

  const xBoundaries = Array.from(new Set([
    0,
    RICH_MENU_CANVAS_WIDTH,
    ...areas.flatMap(area => [area.x, area.x + area.width]),
  ])).sort((left, right) => left - right)
  const yBoundaries = Array.from(new Set([
    0,
    RICH_MENU_CANVAS_HEIGHT,
    ...areas.flatMap(area => [area.y, area.y + area.height]),
  ])).sort((top, bottom) => top - bottom)
  const left = xBoundaries.filter(boundary => boundary <= x).at(-1) ?? 0
  const right = xBoundaries.find(boundary => boundary > x) ?? RICH_MENU_CANVAS_WIDTH
  const top = yBoundaries.filter(boundary => boundary <= y).at(-1) ?? 0
  const bottom = yBoundaries.find(boundary => boundary > y) ?? RICH_MENU_CANVAS_HEIGHT
  const candidate = { x: left, y: top, width: right - left, height: bottom - top }

  if (candidate.width < RICH_MENU_MIN_AREA_WIDTH
    || candidate.height < RICH_MENU_MIN_AREA_HEIGHT
    || areas.some(area => richMenuBoundsOverlap(candidate, area))) return null

  return candidate
}

export function areRichMenuAreasValid<T extends RichMenuBounds>(areas: T[]) {
  if (areas.length < 1 || areas.length > RICH_MENU_MAX_CUSTOM_AREAS) return false

  return areas.every((area, index) => {
    const integers = [area.x, area.y, area.width, area.height]
      .every(value => Number.isInteger(value))
    const insideCanvas = area.x >= 0
      && area.y >= 0
      && area.width >= 1
      && area.height >= 1
      && area.x + area.width <= RICH_MENU_CANVAS_WIDTH
      && area.y + area.height <= RICH_MENU_CANVAS_HEIGHT
    const hasNoOverlap = areas.every((other, otherIndex) => (
      index === otherIndex || !richMenuBoundsOverlap(area, other)
    ))

    return integers && insideCanvas && hasNoOverlap
  })
}
