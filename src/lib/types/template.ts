// D5 §2.1 Layer Template Types — S5b enhanced

export interface LayerTemplateConfig {
  canvas: {
    width: number
    height: number
    background?: string
    dpi?: number
  }
  layers: Layer[]
}

export interface Layer {
  id: string
  type: 'product' | 'background' | 'text' | 'logo' | 'decoration'
  name: string
  zIndex: number
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  opacity?: number
  slot?: SlotDef
  fitMode?: 'contain' | 'cover'
  focusArea?: { x: number; y: number; w: number; h: number }
  style?: TextStyle
  fill?: string
  imageUrl?: string
}

export interface SlotDef {
  id: string
  inputKey: string
  required: boolean
  label: string
}

export interface TextStyle {
  fontFamily: string
  fontSize: number
  fontWeight?: 'normal' | 'bold'
  color: string
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
  letterSpacing?: number
}

// ─── Quality Check (S5b enhanced) ───

export interface QualityCheckResult {
  passed: boolean
  overflows: TextOverflow[]
  issues: QualityIssue[]
}

export interface TextOverflow {
  type: 'text_overflow'
  layerId: string
  layerName: string
  actualWidth: number
  slotWidth: number
  neededLines: number
  maxLines: number
  overflowPx: number
  message: string
}

export interface QualityIssue {
  type:
    | 'missing_asset'
    | 'invalid_focus_area'
    | 'layer_out_of_canvas'
    | 'unsupported_layer'
    | 'font_unavailable'
    | 'render_warning'
  layerId?: string
  layerName?: string
  severity: 'warning' | 'error'
  message: string
}

// ─── Font registration ───

export interface FontRegisterResult {
  ok: boolean
  family: string
  loadedFrom?: string
  error?: string
}

// ─── Render metadata ───

export interface RenderMeta {
  template_id?: string
  template_source: 'db' | 'config_json'
  duration_ms: number
  output_bytes: number
  canvas: { width: number; height: number }
  font: { ok: boolean; family: string; loadedFrom?: string; error?: string }
}

// ─── Render I/O ───

export interface RenderInput {
  config: LayerTemplateConfig
  productImageBuffer: Buffer | null
  variables: Record<string, string>
  assets?: Record<string, Buffer>
}

export interface RenderResult {
  imageBuffer: Buffer
  qualityCheck: QualityCheckResult
  renderMeta?: RenderMeta
}
