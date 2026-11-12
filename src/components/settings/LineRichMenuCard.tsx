import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  BarChart3,
  Check,
  ExternalLink,
  ImagePlus,
  LayoutGrid,
  Maximize2,
  MessageSquareText,
  Move,
  PencilRuler,
  Plus,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Alert from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import IconButton from '@/components/ui/IconButton'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Snackbar'
import {
  RICH_MENU_CANVAS_HEIGHT,
  RICH_MENU_CANVAS_WIDTH,
  RICH_MENU_MAX_CUSTOM_AREAS,
  areRichMenuAreasValid,
  findRichMenuInsertionBounds,
  isRichMenuBoundsAvailable,
  moveRichMenuBounds,
  resizeRichMenuBounds,
  type RichMenuBounds,
} from './lineRichMenuGeometry'
import type {
  Json,
  LineRichMenuDailyMetric,
  LineRichMenuSet,
} from '@/types/database'

type RichMenuActionType =
  | 'booking'
  | 'customer_center'
  | 'uri'
  | 'message'
  | 'page_switch'
  | 'none'

interface RichMenuAction {
  type: RichMenuActionType
  value: string
}

interface RichMenuArea {
  areaKey: string
  x: number
  y: number
  width: number
  height: number
  action: RichMenuAction
}

interface RichMenuPage {
  pageKey: string
  name: string
  layoutKey: `layout_${1 | 2 | 3 | 4 | 5 | 6}` | 'layout_custom'
  imagePath: string
  areas: RichMenuArea[]
}

interface RichMenuConfig {
  chatBarText: string
  pages: RichMenuPage[]
}

interface FunctionResponse {
  ok?: boolean
  error?: string
  code?: string
  syncedRows?: number
  pendingPages?: number
  privacyLimitedPages?: number
}

interface Props {
  storeId: string
  isAdmin: boolean
  messagingReady: boolean
}

const MAX_IMAGE_BYTES = 1_048_576

interface AreaDragState {
  pageKey: string
  areaKey: string
  mode: 'move' | 'resize'
  startClientX: number
  startClientY: number
  original: RichMenuBounds
}

const ACTION_OPTIONS = [
  { value: 'booking', label: '開啟預約頁' },
  { value: 'customer_center', label: '開啟客戶中心' },
  { value: 'uri', label: '開啟外部網址' },
  { value: 'message', label: '傳送文字訊息' },
  { value: 'page_switch', label: '切換選單分頁' },
  { value: 'none', label: '暫不設定' },
]

const STATUS_META: Record<LineRichMenuSet['status'], {
  label: string
  variant: 'slate' | 'amber' | 'green' | 'red'
}> = {
  draft: { label: '草稿', variant: 'slate' },
  publishing: { label: '發布中', variant: 'amber' },
  published: { label: '已發布', variant: 'green' },
  failed: { label: '發布失敗', variant: 'red' },
}

function areaBounds(layout: number) {
  const thirdWidths = [834, 833, 833]
  const thirdXs = [0, 834, 1667]

  if (layout === 1) return [[0, 0, 2500, 1686]]
  if (layout === 2) return [[0, 0, 1250, 1686], [1250, 0, 1250, 1686]]
  if (layout === 3) {
    return thirdWidths.map((width, index) => [thirdXs[index], 0, width, 1686])
  }
  if (layout === 4) {
    return [
      [0, 0, 1250, 843], [1250, 0, 1250, 843],
      [0, 843, 1250, 843], [1250, 843, 1250, 843],
    ]
  }
  if (layout === 5) {
    return [
      [0, 0, 1250, 843], [1250, 0, 1250, 843],
      ...thirdWidths.map((width, index) => [thirdXs[index], 843, width, 843]),
    ]
  }
  return [0, 1].flatMap(row => thirdWidths.map((width, index) => [
    thirdXs[index], row * 843, width, 843,
  ]))
}

function createAreas(pageKey: string, layout: number): RichMenuArea[] {
  return areaBounds(layout).map(([x, y, width, height], index) => ({
    areaKey: `${pageKey}-area-${index + 1}`,
    x,
    y,
    width,
    height,
    action: { type: 'none', value: '' },
  }))
}

function createPage(index = 0): RichMenuPage {
  const pageKey = index === 0 ? 'page-main' : `page-${Date.now().toString(36)}-${index + 1}`
  return {
    pageKey,
    name: index === 0 ? '主選單' : `分頁 ${index + 1}`,
    layoutKey: 'layout_2',
    imagePath: '',
    areas: createAreas(pageKey, 2),
  }
}

const DEFAULT_CONFIG: RichMenuConfig = {
  chatBarText: '開啟選單',
  pages: [createPage()],
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseConfig(value: Json): RichMenuConfig | null {
  const root = objectValue(value)
  if (!root || !Array.isArray(root.pages) || root.pages.length < 1) return null

  const pages = root.pages.map((rawPage): RichMenuPage | null => {
    const page = objectValue(rawPage)
    if (!page || !Array.isArray(page.areas)) return null
    const layoutKey = String(page.layoutKey)
    if (!/^layout_(?:[1-6]|custom)$/.test(layoutKey)) return null

    const areas = page.areas.map((rawArea): RichMenuArea | null => {
      const area = objectValue(rawArea)
      const action = objectValue(area?.action)
      if (!area || !action) return null
      const type = String(action.type) as RichMenuActionType
      if (!ACTION_OPTIONS.some(option => option.value === type)) return null
      return {
        areaKey: String(area.areaKey),
        x: Number(area.x),
        y: Number(area.y),
        width: Number(area.width),
        height: Number(area.height),
        action: { type, value: String(action.value ?? '') },
      }
    })
    if (areas.some(area => !area) || !areRichMenuAreasValid(areas as RichMenuArea[])) return null

    return {
      pageKey: String(page.pageKey),
      name: String(page.name),
      layoutKey: layoutKey as RichMenuPage['layoutKey'],
      imagePath: typeof page.imagePath === 'string' ? page.imagePath : '',
      areas: areas as RichMenuArea[],
    }
  })
  if (pages.some(page => !page)) return null

  return {
    chatBarText: typeof root.chatBarText === 'string' ? root.chatBarText : '開啟選單',
    pages: pages as RichMenuPage[],
  }
}

function actionLabel(action: RichMenuAction) {
  return ACTION_OPTIONS.find(option => option.value === action.type)?.label ?? '暫不設定'
}

function statusTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function configError(config: RichMenuConfig, name: string, requireImages: boolean) {
  if (!name.trim() || name.trim().length > 80) return '選單名稱請輸入 1～80 個字元'
  if (!config.chatBarText.trim() || config.chatBarText.trim().length > 14) {
    return '聊天列文字請輸入 1～14 個字元'
  }

  for (const page of config.pages) {
    if (!page.name.trim() || page.name.trim().length > 40) return '每個分頁都需要名稱'
    if (requireImages && !page.imagePath) return `「${page.name}」尚未上傳背景圖片`
    if (!areRichMenuAreasValid(page.areas)) {
      return `「${page.name}」有格子超出圖片範圍或彼此重疊`
    }
    for (const area of page.areas) {
      if (area.action.type === 'uri' && !/^https:\/\//.test(area.action.value.trim())) {
        return `「${page.name}」有外部網址不是 https:// 開頭`
      }
      if (area.action.type === 'message' && !area.action.value.trim()) {
        return `「${page.name}」有文字訊息尚未填寫`
      }
      if (area.action.type === 'page_switch' && !config.pages.some(item => item.pageKey === area.action.value)) {
        return `「${page.name}」有切換分頁尚未指定目標`
      }
    }
  }
  return null
}

export default function LineRichMenuCard({ storeId, isAdmin, messagingReady }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [syncingMetrics, setSyncingMetrics] = useState(false)
  const [uploadingPageKey, setUploadingPageKey] = useState<string | null>(null)
  const [menuSet, setMenuSet] = useState<LineRichMenuSet | null>(null)
  const [menuName, setMenuName] = useState('LINE 圖文選單')
  const [config, setConfig] = useState<RichMenuConfig>(DEFAULT_CONFIG)
  const [activePageKey, setActivePageKey] = useState(DEFAULT_CONFIG.pages[0].pageKey)
  const [activeAreaKey, setActiveAreaKey] = useState(DEFAULT_CONFIG.pages[0].areas[0].areaKey)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [metrics, setMetrics] = useState<LineRichMenuDailyMetric[]>([])
  const localPreviewUrls = useRef(new Map<string, string>())
  const imageInputRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLDivElement>(null)
  const [areaDrag, setAreaDrag] = useState<AreaDragState | null>(null)

  const activePage = config.pages.find(page => page.pageKey === activePageKey) ?? config.pages[0]
  const activeArea = activePage?.areas.find(area => area.areaKey === activeAreaKey)
  const isCustomLayout = activePage?.layoutKey === 'layout_custom'

  const metricSummary = useMemo(() => metrics.reduce((summary, row) => ({
    impressions: summary.impressions + row.impressions,
    clicks: summary.clicks + row.clicks,
  }), { impressions: 0, clicks: 0 }), [metrics])

  const latestMetricSync = useMemo(() => (
    metrics.reduce<string | null>((latest, row) => (
      !latest || row.synced_at > latest ? row.synced_at : latest
    ), null)
  ), [metrics])

  const releaseLocalPreview = useCallback((pageKey?: string) => {
    if (pageKey) {
      const url = localPreviewUrls.current.get(pageKey)
      if (url) URL.revokeObjectURL(url)
      localPreviewUrls.current.delete(pageKey)
      return
    }
    localPreviewUrls.current.forEach(url => URL.revokeObjectURL(url))
    localPreviewUrls.current.clear()
  }, [])

  const loadMetrics = useCallback(async (publicationId: string) => {
    const metricFrom = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000))
      .toISOString()
      .slice(0, 10)
    const { data, error } = await supabase
      .from('line_rich_menu_daily_metrics')
      .select('*')
      .eq('publication_id', publicationId)
      .gte('metric_date', metricFrom)
      .order('metric_date', { ascending: false })
      .limit(1000)

    if (error) {
      toast.error('載入圖文選單成效失敗', error.message)
      return
    }
    setMetrics((data ?? []) as LineRichMenuDailyMetric[])
  }, [])

  const loadMenu = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('line_rich_menu_sets')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle()

    if (error) {
      toast.error('載入圖文選單失敗', error.message)
      setLoading(false)
      return
    }

    const loadedSet = data as LineRichMenuSet | null
    setMenuSet(loadedSet)
    if (!loadedSet) {
      const initial = { ...DEFAULT_CONFIG, pages: [createPage()] }
      setConfig(initial)
      setActivePageKey(initial.pages[0].pageKey)
      setActiveAreaKey(initial.pages[0].areas[0].areaKey)
      releaseLocalPreview()
      setPreviewUrls({})
      setMetrics([])
      setLoading(false)
      return
    }

    const loadedConfig = parseConfig(loadedSet.draft_config)
    if (!loadedConfig) {
      toast.error('圖文選單草稿格式異常', '請聯絡系統管理員協助檢查')
      setLoading(false)
      return
    }

    setMenuName(loadedSet.name)
    setConfig(loadedConfig)
    setActivePageKey(loadedConfig.pages[0].pageKey)
    setActiveAreaKey(loadedConfig.pages[0].areas[0].areaKey)

    const signedEntries = await Promise.all(loadedConfig.pages.map(async page => {
      if (!page.imagePath) return [page.pageKey, ''] as const
      const { data: signed } = await supabase.storage
        .from('line-rich-menu-images')
        .createSignedUrl(page.imagePath, 3600)
      return [page.pageKey, signed?.signedUrl ?? ''] as const
    }))
    releaseLocalPreview()
    setPreviewUrls(Object.fromEntries(signedEntries))

    if (loadedSet.active_publication_id) {
      await loadMetrics(loadedSet.active_publication_id)
    } else {
      setMetrics([])
    }
    setLoading(false)
  }, [loadMetrics, releaseLocalPreview, storeId])

  useEffect(() => {
    // Supabase 是外部資料源；loadMenu 僅在查詢完成後同步編輯器狀態。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMenu()
  }, [loadMenu])

  useEffect(() => () => releaseLocalPreview(), [releaseLocalPreview])

  useEffect(() => {
    if (!areaDrag) return

    function handlePointerMove(event: PointerEvent) {
      const canvas = previewCanvasRef.current
      if (!canvas) return
      const canvasRect = canvas.getBoundingClientRect()
      const deltaX = ((event.clientX - areaDrag.startClientX) / canvasRect.width)
        * RICH_MENU_CANVAS_WIDTH
      const deltaY = ((event.clientY - areaDrag.startClientY) / canvasRect.height)
        * RICH_MENU_CANVAS_HEIGHT
      const candidate = areaDrag.mode === 'move'
        ? moveRichMenuBounds(areaDrag.original, deltaX, deltaY)
        : resizeRichMenuBounds(areaDrag.original, deltaX, deltaY)

      setConfig(current => ({
        ...current,
        pages: current.pages.map(page => {
          if (page.pageKey !== areaDrag.pageKey) return page
          if (!isRichMenuBoundsAvailable(candidate, page.areas, areaDrag.areaKey)) return page
          return {
            ...page,
            areas: page.areas.map(area => area.areaKey === areaDrag.areaKey
              ? { ...area, ...candidate }
              : area),
          }
        }),
      }))
    }

    function handlePointerUp() {
      setAreaDrag(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    window.addEventListener('pointercancel', handlePointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [areaDrag])

  function updatePage(pageKey: string, updater: (page: RichMenuPage) => RichMenuPage) {
    setConfig(current => ({
      ...current,
      pages: current.pages.map(page => page.pageKey === pageKey ? updater(page) : page),
    }))
  }

  function changeLayout(layout: number) {
    if (!activePage) return
    const layoutKey = `layout_${layout}` as RichMenuPage['layoutKey']
    updatePage(activePage.pageKey, page => ({
      ...page,
      layoutKey,
      areas: createAreas(page.pageKey, layout),
    }))
    setActiveAreaKey(`${activePage.pageKey}-area-1`)
  }

  function enableCustomLayout() {
    if (!activePage) return
    updatePage(activePage.pageKey, page => ({ ...page, layoutKey: 'layout_custom' }))
    setActiveAreaKey(activePage.areas[0].areaKey)
  }

  function addCustomArea() {
    if (!activePage || activePage.areas.length >= RICH_MENU_MAX_CUSTOM_AREAS) return
    const splittable = [...activePage.areas]
      .sort((left, right) => (right.width * right.height) - (left.width * left.height))
      .find(area => area.width >= 500 || area.height >= 338)

    if (!splittable) {
      toast.info('目前沒有足夠空間', '請先縮小其中一格，再新增格子')
      return
    }

    const splitVertically = splittable.width >= 500
      && (splittable.width >= splittable.height || splittable.height < 338)
    const firstSize = splitVertically
      ? Math.floor(splittable.width / 2)
      : Math.floor(splittable.height / 2)
    const newAreaKey = `${activePage.pageKey}-area-${Date.now().toString(36)}`
    const nextArea: RichMenuArea = {
      areaKey: newAreaKey,
      x: splitVertically ? splittable.x + firstSize : splittable.x,
      y: splitVertically ? splittable.y : splittable.y + firstSize,
      width: splitVertically ? splittable.width - firstSize : splittable.width,
      height: splitVertically ? splittable.height : splittable.height - firstSize,
      action: { type: 'none', value: '' },
    }

    updatePage(activePage.pageKey, page => ({
      ...page,
      areas: [
        ...page.areas.map(area => area.areaKey === splittable.areaKey
          ? {
              ...area,
              width: splitVertically ? firstSize : area.width,
              height: splitVertically ? area.height : firstSize,
            }
          : area),
        nextArea,
      ],
    }))
    setActiveAreaKey(newAreaKey)
  }

  function addCustomAreaAtPointer(event: ReactMouseEvent<HTMLDivElement>) {
    if (!activePage || !isAdmin || !isCustomLayout
      || activePage.areas.length >= RICH_MENU_MAX_CUSTOM_AREAS) return
    if ((event.target as HTMLElement).closest('[data-rich-menu-area]')) return

    const canvas = event.currentTarget.getBoundingClientRect()
    const bounds = findRichMenuInsertionBounds(
      ((event.clientX - canvas.left) / canvas.width) * RICH_MENU_CANVAS_WIDTH,
      ((event.clientY - canvas.top) / canvas.height) * RICH_MENU_CANVAS_HEIGHT,
      activePage.areas,
    )
    if (!bounds) {
      toast.info('這裡的空間不足', '請先縮小或移動附近格子，再點空白處新增')
      return
    }

    const newAreaKey = `${activePage.pageKey}-area-${Date.now().toString(36)}`
    updatePage(activePage.pageKey, page => ({
      ...page,
      areas: [
        ...page.areas,
        { ...bounds, areaKey: newAreaKey, action: { type: 'none', value: '' } },
      ],
    }))
    setActiveAreaKey(newAreaKey)
  }

  function removeCustomArea(areaKey = activeArea?.areaKey) {
    if (!activePage || !areaKey || activePage.areas.length <= 1) return
    const remaining = activePage.areas.filter(area => area.areaKey !== areaKey)
    updatePage(activePage.pageKey, page => ({ ...page, areas: remaining }))
    setActiveAreaKey(remaining[0].areaKey)
  }

  function startAreaDrag(
    event: ReactPointerEvent,
    area: RichMenuArea,
    mode: AreaDragState['mode'],
  ) {
    if (!isAdmin || !isCustomLayout) return
    event.preventDefault()
    event.stopPropagation()
    setActiveAreaKey(area.areaKey)
    setAreaDrag({
      pageKey: activePage.pageKey,
      areaKey: area.areaKey,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      original: {
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
      },
    })
  }

  function commitAreaBounds(field: keyof RichMenuBounds, rawValue: string) {
    if (!activePage || !activeArea) return
    const parsed = Number(rawValue)
    if (!Number.isInteger(parsed)) {
      toast.error('格子位置格式不正確', '請輸入整數')
      return
    }

    const candidate = field === 'x'
      ? moveRichMenuBounds(activeArea, parsed - activeArea.x, 0)
      : field === 'y'
        ? moveRichMenuBounds(activeArea, 0, parsed - activeArea.y)
        : field === 'width'
          ? resizeRichMenuBounds(activeArea, parsed - activeArea.width, 0)
          : resizeRichMenuBounds(activeArea, 0, parsed - activeArea.height)
    if (!isRichMenuBoundsAvailable(candidate, activePage.areas, activeArea.areaKey)) {
      toast.error('格子不能重疊', '請調整位置或尺寸後再試')
      return
    }

    updatePage(activePage.pageKey, page => ({
      ...page,
      areas: page.areas.map(area => area.areaKey === activeArea.areaKey
        ? { ...area, ...candidate }
        : area),
    }))
  }

  function addPage() {
    if (config.pages.length >= 3) return
    const page = createPage(config.pages.length)
    setConfig(current => ({ ...current, pages: [...current.pages, page] }))
    setActivePageKey(page.pageKey)
    setActiveAreaKey(page.areas[0].areaKey)
  }

  function removePage(pageKey: string) {
    if (config.pages.length === 1) return
    const remaining = config.pages.filter(page => page.pageKey !== pageKey)
    const cleaned = remaining.map(page => ({
      ...page,
      areas: page.areas.map(area => area.action.type === 'page_switch' && area.action.value === pageKey
        ? { ...area, action: { type: 'none' as const, value: '' } }
        : area),
    }))
    setConfig(current => ({ ...current, pages: cleaned }))
    setActivePageKey(cleaned[0].pageKey)
    setActiveAreaKey(cleaned[0].areas[0].areaKey)
    releaseLocalPreview(pageKey)
    setPreviewUrls(current => {
      const next = { ...current }
      delete next[pageKey]
      return next
    })
  }

  function updateAction(type: RichMenuActionType, value = '') {
    if (!activePage || !activeArea) return
    updatePage(activePage.pageKey, page => ({
      ...page,
      areas: page.areas.map(area => area.areaKey === activeArea.areaKey
        ? { ...area, action: { type, value } }
        : area),
    }))
  }

  async function uploadImage(file: File) {
    if (!activePage) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('圖片格式不支援', '請上傳 PNG 或 JPG')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('圖片超過 1 MB', '請壓縮後重新上傳')
      return
    }

    const localUrl = URL.createObjectURL(file)
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = reject
      image.src = localUrl
    }).catch(() => null)

    if (!dimensions
      || dimensions.width !== RICH_MENU_CANVAS_WIDTH
      || dimensions.height !== RICH_MENU_CANVAS_HEIGHT) {
      URL.revokeObjectURL(localUrl)
      toast.error('圖片尺寸不符合', 'Phase 1 請使用 2500 × 1686 像素圖片')
      return
    }

    setUploadingPageKey(activePage.pageKey)
    const extension = file.type === 'image/png' ? 'png' : 'jpg'
    const path = `${storeId}/draft/${activePage.pageKey}-${Date.now()}.${extension}`
    const { error } = await supabase.storage
      .from('line-rich-menu-images')
      .upload(path, file, { contentType: file.type, upsert: false })
    setUploadingPageKey(null)

    if (error) {
      URL.revokeObjectURL(localUrl)
      toast.error('圖片上傳失敗', error.message)
      return
    }

    releaseLocalPreview(activePage.pageKey)
    localPreviewUrls.current.set(activePage.pageKey, localUrl)
    setPreviewUrls(current => ({ ...current, [activePage.pageKey]: localUrl }))
    updatePage(activePage.pageKey, page => ({ ...page, imagePath: path }))
    toast.success('背景圖片已上傳', '儲存草稿後才會保留此版設定')
  }

  function removeBackgroundImage() {
    if (!activePage) return
    const pageKey = activePage.pageKey

    updatePage(pageKey, page => ({ ...page, imagePath: '' }))
    setPreviewUrls(current => {
      const next = { ...current }
      delete next[pageKey]
      return next
    })
    releaseLocalPreview(pageKey)
    if (imageInputRef.current) imageInputRef.current.value = ''
    toast.success('底圖已從此分頁移除', '儲存草稿後生效；分頁、格子與動作設定都會保留')
  }

  async function saveDraft(showSuccess = true) {
    const validationError = configError(config, menuName, false)
    if (validationError) {
      toast.error('草稿尚未完成', validationError)
      return null
    }

    setSaving(true)
    const { data, error } = await supabase.rpc('save_line_rich_menu_draft', {
      p_name: menuName.trim(),
      p_config: config as unknown as Json,
    })
    setSaving(false)

    if (error) {
      toast.error('儲存草稿失敗', error.message)
      return null
    }
    const result = objectValue(data)
    if (!result?.ok || typeof result.id !== 'string') {
      toast.error('儲存草稿失敗', String(result?.error ?? '請稍後再試'))
      return null
    }
    if (showSuccess) toast.success('圖文選單草稿已儲存')
    return result.id
  }

  async function publishMenu() {
    const validationError = configError(config, menuName, true)
    if (validationError) {
      toast.error('無法發布', validationError)
      return
    }
    if (!messagingReady) {
      toast.error('Messaging API 尚未啟用', '請先到「LINE 串接」分頁完成憑證驗證')
      return
    }

    setPublishing(true)
    const setId = await saveDraft(false)
    if (!setId) {
      setPublishing(false)
      return
    }

    const { data: queuedData, error: queueError } = await supabase.rpc(
      'queue_line_rich_menu_publication',
      { p_set_id: setId },
    )
    const queued = objectValue(queuedData)
    if (queueError || !queued?.ok || typeof queued.publication_id !== 'string') {
      setPublishing(false)
      toast.error('無法建立發布版本', queueError?.message ?? String(queued?.error ?? '請稍後再試'))
      return
    }

    const { data, error } = await supabase.functions.invoke<FunctionResponse>('line-rich-menu', {
      body: { publicationId: queued.publication_id },
    })
    setPublishing(false)
    if (error || !data?.ok) {
      toast.error('LINE 圖文選單發布失敗', data?.error ?? error?.message ?? '請稍後再試')
      await loadMenu()
      return
    }

    toast.success('LINE 圖文選單已發布', '客戶下次開啟聊天時會看到新選單')
    await loadMenu()
  }

  async function syncMetrics() {
    const publicationId = menuSet?.active_publication_id
    if (!publicationId || !isAdmin) return

    setSyncingMetrics(true)
    const { data, error } = await supabase.functions.invoke<FunctionResponse>(
      'line-rich-menu-insights',
      { body: { publicationId } },
    )
    setSyncingMetrics(false)

    if (error || !data?.ok) {
      const description = data?.code === 'LINE_RATE_LIMITED'
        ? 'LINE 暫時限制查詢頻率，請稍後再試'
        : data?.error ?? error?.message ?? '請稍後再試'
      toast.error('同步 LINE 數據失敗', description)
      return
    }

    await loadMetrics(publicationId)
    if ((data.syncedRows ?? 0) > 0) {
      toast.success('LINE 成效已同步', `已更新 ${data.syncedRows} 筆每日資料`)
    } else if ((data.privacyLimitedPages ?? 0) > 0) {
      toast.info('目前沒有可顯示的明細', 'LINE 為保護隱私，點擊人數不足門檻時不提供統計')
    } else {
      toast.info('LINE 尚未完成統計', '新選單的數據通常會在隔天完成彙整')
    }
  }

  if (loading) {
    return <div className="flex h-52 items-center justify-center"><Spinner size="md" /></div>
  }

  const statusMeta = menuSet ? STATUS_META[menuSet.status] : STATUS_META.draft
  const hasMetrics = metrics.length > 0
  const ctr = hasMetrics && metricSummary.impressions > 0
    ? ((metricSummary.clicks / metricSummary.impressions) * 100).toFixed(1)
    : null

  return (
    <div className="space-y-5">
      {!isAdmin && (
        <Alert variant="info" title="僅管理員可編輯">
          你可以查看目前設定與成效，修改與發布需由店家管理員操作。
        </Alert>
      )}

      {!messagingReady && (
        <Alert variant="warning" title="發布前需完成 Messaging API 串接">
          可以先設計並儲存草稿；正式發布前，請到「LINE 串接」分頁完成憑證驗證。
        </Alert>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-white to-indigo-50/50 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#06C755] text-white shadow-lg shadow-emerald-200/70">
              <LayoutGrid size={21} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">圖文選單工作區</h3>
                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                可使用 1～6 格快速版型，或進入自訂模式拖拉、縮放格子。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              loading={saving}
              disabled={!isAdmin || publishing}
              onClick={() => void saveDraft()}
            >
              <Save size={15} />
              儲存草稿
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={publishing}
              disabled={!isAdmin || !messagingReady || saving}
              onClick={() => void publishMenu()}
            >
              <Send size={15} />
              發布到 LINE
            </Button>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <div className="space-y-6 border-b border-slate-100 p-5 sm:p-6 xl:border-b-0 xl:border-r">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="選單名稱" required hint="僅供後台辨識">
                <Input
                  value={menuName}
                  onChange={event => setMenuName(event.target.value)}
                  maxLength={80}
                  disabled={!isAdmin}
                />
              </FormField>
              <FormField label="聊天列文字" required hint="最多 14 個字">
                <Input
                  value={config.chatBarText}
                  onChange={event => setConfig(current => ({
                    ...current,
                    chatBarText: event.target.value,
                  }))}
                  maxLength={14}
                  disabled={!isAdmin}
                />
              </FormField>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">選單分頁</p>
                  <p className="mt-0.5 text-xs text-slate-400">最多 3 頁，可用格子動作互相切換</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!isAdmin || config.pages.length >= 3}
                  onClick={addPage}
                >
                  <Plus size={14} />
                  新增分頁
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {config.pages.map((page, index) => (
                  <Button
                    key={page.pageKey}
                    type="button"
                    variant={page.pageKey === activePage.pageKey ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      setActivePageKey(page.pageKey)
                      setActiveAreaKey(page.areas[0].areaKey)
                    }}
                    className="shrink-0"
                  >
                    {index + 1}. {page.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <FormField label="分頁名稱" required>
                <Input
                  value={activePage.name}
                  onChange={event => updatePage(activePage.pageKey, page => ({
                    ...page,
                    name: event.target.value,
                  }))}
                  maxLength={40}
                  disabled={!isAdmin}
                />
              </FormField>
              {config.pages.length > 1 && (
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                    disabled={!isAdmin}
                    onClick={() => removePage(activePage.pageKey)}
                  >
                    <Trash2 size={15} />
                    刪除此頁
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">版型</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  預設版型會重設動作；自訂模式會沿用目前格子與設定
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {[1, 2, 3, 4, 5, 6].map(layout => (
                  <Button
                    key={layout}
                    type="button"
                    variant={activePage.layoutKey === `layout_${layout}` ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => changeLayout(layout)}
                    disabled={!isAdmin}
                    className="min-h-12 flex-col gap-0.5"
                  >
                    <span className="text-base font-bold">{layout}</span>
                    <span className="text-[10px] opacity-70">格</span>
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={isCustomLayout ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={enableCustomLayout}
                  disabled={!isAdmin}
                  className="min-h-12 flex-col gap-0.5"
                >
                  <PencilRuler size={16} />
                  <span className="text-[10px] opacity-70">自訂</span>
                </Button>
              </div>
              {isCustomLayout && (
                <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2 text-xs leading-5 text-indigo-700">
                    <Move size={15} className="mt-0.5 shrink-0" />
                    <span>點預覽空白處新增格子；選取後可拖曳、縮放，或點右上角 × 刪除。</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!isAdmin || activePage.areas.length >= RICH_MENU_MAX_CUSTOM_AREAS}
                      onClick={addCustomArea}
                    >
                      <Plus size={14} />
                      新增格子
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      disabled={!isAdmin || activePage.areas.length <= 1}
                      onClick={() => removeCustomArea()}
                    >
                      <Trash2 size={14} />
                      刪除此格
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <FormField
              label="背景圖片"
              required
              hint="PNG／JPG，2500 × 1686 像素，1 MB 內"
            >
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
                    <ImagePlus size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {activePage.imagePath ? '已上傳圖片' : '尚未上傳圖片'}
                    </p>
                    <p className="mt-0.5 max-w-[280px] truncate text-xs text-slate-400">
                      {activePage.imagePath || '發布前每個分頁都必須有圖片'}
                    </p>
                  </div>
                </div>
                <div className="hidden">
                  <Input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    disabled={!isAdmin || uploadingPageKey === activePage.pageKey}
                    onChange={event => {
                      const file = event.target.files?.[0]
                      if (file) void uploadImage(file)
                      event.target.value = ''
                    }}
                  />
                </div>
                <div className="flex w-full shrink-0 flex-col gap-2 2xl:w-auto 2xl:items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={uploadingPageKey === activePage.pageKey}
                    disabled={!isAdmin}
                    className="w-full bg-white 2xl:w-auto"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <ImagePlus size={16} />
                    {activePage.imagePath ? '更換背景圖片' : '上傳背景圖片'}
                  </Button>
                  {activePage.imagePath && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!isAdmin || uploadingPageKey === activePage.pageKey}
                      className="w-full text-red-500 hover:bg-red-50 hover:text-red-600 2xl:w-auto"
                      onClick={removeBackgroundImage}
                    >
                      <Trash2 size={14} />
                      移除底圖
                    </Button>
                  )}
                </div>
              </div>
            </FormField>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">格子動作</p>
                <p className="mt-0.5 text-xs text-slate-400">點右側預覽格子，或直接選擇下方編號</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {activePage.areas.map((area, index) => (
                  <Button
                    key={area.areaKey}
                    type="button"
                    variant={activeArea?.areaKey === area.areaKey ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setActiveAreaKey(area.areaKey)}
                  >
                    格 {index + 1}
                    {area.action.type !== 'none' && <Check size={12} />}
                  </Button>
                ))}
              </div>

              {activeArea && (
                <div className="grid gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 sm:grid-cols-2">
                  <FormField label="點擊後執行">
                    <Select
                      value={activeArea.action.type}
                      onChange={value => updateAction(value as RichMenuActionType)}
                      options={ACTION_OPTIONS}
                      disabled={!isAdmin}
                    />
                  </FormField>

                  {isCustomLayout && (
                    <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
                      {([
                        ['x', '水平位置'],
                        ['y', '垂直位置'],
                        ['width', '寬度'],
                        ['height', '高度'],
                      ] as const).map(([field, label]) => (
                        <FormField key={field} label={label} hint="px">
                          <Input
                            key={`${activeArea.areaKey}-${field}-${activeArea[field]}`}
                            type="number"
                            min={0}
                            defaultValue={activeArea[field]}
                            disabled={!isAdmin}
                            onKeyDown={event => {
                              if (event.key === 'Enter') event.currentTarget.blur()
                            }}
                            onBlur={event => commitAreaBounds(field, event.target.value)}
                          />
                        </FormField>
                      ))}
                    </div>
                  )}

                  {activeArea.action.type === 'uri' && (
                    <FormField label="外部網址" required>
                      <Input
                        value={activeArea.action.value}
                        onChange={event => updateAction('uri', event.target.value)}
                        placeholder="https://example.com"
                        disabled={!isAdmin}
                      />
                    </FormField>
                  )}
                  {activeArea.action.type === 'message' && (
                    <FormField label="傳送文字" required hint="最多 300 字">
                      <Input
                        value={activeArea.action.value}
                        onChange={event => updateAction('message', event.target.value)}
                        maxLength={300}
                        placeholder="輸入客戶點擊後要傳送的文字"
                        disabled={!isAdmin}
                      />
                    </FormField>
                  )}
                  {activeArea.action.type === 'page_switch' && (
                    <FormField label="切換到分頁" required>
                      <Select
                        value={activeArea.action.value}
                        onChange={value => updateAction('page_switch', value)}
                        options={config.pages.map(page => ({
                          value: page.pageKey,
                          label: page.name,
                        }))}
                        placeholder="選擇目標分頁"
                        disabled={!isAdmin}
                      />
                    </FormField>
                  )}
                  {['booking', 'customer_center', 'none'].includes(activeArea.action.type) && (
                    <div className="flex items-center rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-slate-500">
                      {activeArea.action.type === 'booking' && '系統會自動帶入此店家的公開預約網址。'}
                      {activeArea.action.type === 'customer_center' && '客戶會進入自己的預約與商品券頁面。'}
                      {activeArea.action.type === 'none' && '此格會保留，但點擊時不執行業務動作。'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="bg-slate-50/70 p-5 sm:p-6">
            <div className="sticky top-6 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Smartphone size={16} className="text-slate-500" />
                  <p className="text-sm font-semibold text-slate-800">即時預覽</p>
                </div>
                <span className="text-xs text-slate-400">LINE 顯示比例</span>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
                <div
                  ref={previewCanvasRef}
                  className={`relative aspect-[2500/1686] overflow-hidden rounded-[20px] bg-gradient-to-br from-slate-800 via-slate-700 to-indigo-900 ${
                    isCustomLayout && isAdmin
                      && activePage.areas.length < RICH_MENU_MAX_CUSTOM_AREAS
                      ? 'cursor-copy'
                      : ''
                  }`}
                  onClick={addCustomAreaAtPointer}
                  style={previewUrls[activePage.pageKey] ? {
                    backgroundImage: `url(${previewUrls[activePage.pageKey]})`,
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                  } : undefined}
                >
                  {!previewUrls[activePage.pageKey] && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center text-white/80">
                      <ImagePlus size={28} />
                      <p className="mt-2 text-xs font-semibold">上傳圖片後在此預覽</p>
                    </div>
                  )}
                  {isCustomLayout && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-[1] opacity-30"
                      style={{
                        backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
                        backgroundSize: '10% 10%',
                      }}
                    />
                  )}
                  {activePage.areas.map((area, index) => (
                    <div
                      key={area.areaKey}
                      data-rich-menu-area
                      className="absolute z-[2]"
                      style={{
                        left: `${(area.x / RICH_MENU_CANVAS_WIDTH) * 100}%`,
                        top: `${(area.y / RICH_MENU_CANVAS_HEIGHT) * 100}%`,
                        width: `${(area.width / RICH_MENU_CANVAS_WIDTH) * 100}%`,
                        height: `${(area.height / RICH_MENU_CANVAS_HEIGHT) * 100}%`,
                      }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setActiveAreaKey(area.areaKey)}
                        onPointerDown={event => startAreaDrag(event, area, 'move')}
                        className={`absolute inset-0 !h-full !w-full !touch-none !rounded-[10px] !p-1 text-[10px] leading-3 ${
                          isCustomLayout && isAdmin ? 'cursor-move' : ''
                        } ${
                          activeArea?.areaKey === area.areaKey
                            ? 'border-2 border-white bg-indigo-600/80 text-white shadow-lg'
                            : 'border border-white/70 bg-slate-950/35 text-white hover:bg-slate-950/50'
                        }`}
                      >
                        <span className="line-clamp-2">{index + 1}. {actionLabel(area.action)}</span>
                      </Button>
                      {isCustomLayout && isAdmin && activeArea?.areaKey === area.areaKey && (
                        <>
                          {activePage.areas.length > 1 && (
                            <IconButton
                              icon={X}
                              label={`刪除格子 ${index + 1}`}
                              variant="danger"
                              size="sm"
                              className="absolute -right-2 -top-2 z-20 border-2 border-white bg-white text-red-500 shadow-lg"
                              onPointerDown={event => event.stopPropagation()}
                              onClick={event => {
                                event.stopPropagation()
                                removeCustomArea(area.areaKey)
                              }}
                            />
                          )}
                          <div
                            aria-hidden="true"
                            className="absolute -bottom-1.5 -right-1.5 z-10 flex h-6 w-6 touch-none cursor-se-resize items-center justify-center rounded-md border-2 border-white bg-indigo-600 text-white shadow-lg"
                            onPointerDown={event => startAreaDrag(event, area, 'resize')}
                          >
                            <Maximize2 size={12} />
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">聊天列</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-700">{config.chatBarText || '開啟選單'}</p>
                  </div>
                  <MessageSquareText size={18} className="text-[#06C755]" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={16} className="text-slate-500" />
                    <p className="text-sm font-semibold text-slate-800">點擊成效</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {menuSet?.active_publication_id && <Badge variant="teal">已啟用追蹤</Badge>}
                    {menuSet?.active_publication_id && isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={syncingMetrics}
                        disabled={publishing}
                        onClick={() => void syncMetrics()}
                      >
                        <RefreshCw size={13} />
                        同步數據
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Metric
                    label="曝光"
                    value={hasMetrics ? metricSummary.impressions.toLocaleString('zh-TW') : '—'}
                  />
                  <Metric
                    label="點擊"
                    value={hasMetrics ? metricSummary.clicks.toLocaleString('zh-TW') : '—'}
                  />
                  <Metric label="點擊率" value={ctr ? `${ctr}%` : '—'} />
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-400">
                  {menuSet?.active_publication_id
                    ? metrics.length > 0
                      ? `顯示目前發布版本最近 30 天資料${latestMetricSync ? `；最後同步 ${statusTime(latestMetricSync)}` : ''}。`
                      : '圖文選單已發布；可手動同步，LINE 通常會在隔天完成彙整。點擊人數不足隱私門檻時不會提供統計。'
                    : '完成第一次發布後，這裡會顯示曝光與點擊。'}
                </p>
              </div>

              {menuSet && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
                  <div className="flex items-center justify-between gap-3">
                    <span>最近更新</span>
                    <span className="font-medium text-slate-700">{statusTime(menuSet.updated_at)}</span>
                  </div>
                  {menuSet.last_error_message && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-red-600">
                      <ExternalLink size={13} className="mt-0.5 shrink-0" />
                      <span>{menuSet.last_error_message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
      <p className="text-[10px] font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-800">{value}</p>
    </div>
  )
}
