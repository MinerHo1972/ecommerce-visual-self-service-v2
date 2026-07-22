/**
 * Template validation utilities — S5a + S5b enhanced.
 * S5a: config_json, variables_schema, slot consistency, variables.
 * S5b: focusArea, rotation, opacity, fitMode, text style, geometry checks.
 */

interface ValidationResult {
  valid: boolean
  errors: string[]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v) && Number.isFinite(v)
}

// ─── config_json validation ───

const VALID_LAYER_TYPES = ['product', 'background', 'text', 'logo', 'decoration']
const VALID_ALIGNS = ['left', 'center', 'right']
const VALID_FIT_MODES = ['contain', 'cover']

export function validateConfigJson(config: unknown): ValidationResult {
  const errors: string[] = []

  if (!isObject(config)) {
    return { valid: false, errors: ['config_json 必须是对象'] }
  }

  const canvas = config.canvas
  if (!isObject(canvas)) {
    return { valid: false, errors: ['canvas 必须是对象'] }
  }
  if (!isNumber(canvas.width) || !isNumber(canvas.height)) {
    errors.push('canvas.width 和 canvas.height 必须是数字')
  } else {
    if (canvas.width < 1 || canvas.width > 4096) errors.push(`canvas.width=${canvas.width} 超出范围 (1-4096)`)
    if (canvas.height < 1 || canvas.height > 4096) errors.push(`canvas.height=${canvas.height} 超出范围 (1-4096)`)
  }

  const layers = config.layers
  if (!Array.isArray(layers) || layers.length === 0) {
    return { valid: false, errors: ['layers 必须是非空数组'] }
  }

  const layerIds = new Set<string>()

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]
    const prefix = `layers[${i}]`
    if (!isObject(layer)) { errors.push(`${prefix} 必须是对象`); continue }

    for (const field of ['id', 'type', 'name', 'zIndex', 'x', 'y', 'width', 'height']) {
      if (layer[field] === undefined || layer[field] === null) errors.push(`${prefix} 缺少必填字段: ${field}`)
    }
    if (typeof layer.id === 'string') {
      if (layerIds.has(layer.id)) errors.push(`${prefix} id="${layer.id}" 重复`)
      layerIds.add(layer.id)
    }
    if (typeof layer.type === 'string' && !VALID_LAYER_TYPES.includes(layer.type)) {
      errors.push(`${prefix} type="${layer.type}" 无效`)
    }

    // ── Geometry checks (S5b §7.7, §7.8) ──
    for (const field of ['x', 'y', 'width', 'height']) {
      if (layer[field] !== undefined && !isNumber(layer[field])) errors.push(`${prefix}.${field} 必须是有限数字`)
    }
    if (isNumber(layer.width) && layer.width <= 0) errors.push(`${prefix}.width 必须 > 0`)
    if (isNumber(layer.height) && layer.height <= 0) errors.push(`${prefix}.height 必须 > 0`)
    if (layer.zIndex !== undefined && !isNumber(layer.zIndex)) errors.push(`${prefix}.zIndex 必须是数字`)

    // ── rotation check (S5b §7.2) ──
    if (layer.rotation !== undefined && layer.rotation !== null) {
      if (!isNumber(layer.rotation)) {
        errors.push(`${prefix}.rotation 必须是数字`)
      } else if (layer.rotation < -360 || layer.rotation > 360) {
        errors.push(`${prefix}.rotation=${layer.rotation} 超出范围 (-360 ~ 360)`)
      }
    }

    // ── opacity check (S5b §7.3) ──
    if (layer.opacity !== undefined && layer.opacity !== null) {
      if (!isNumber(layer.opacity)) {
        errors.push(`${prefix}.opacity 必须是数字`)
      } else if (layer.opacity < 0 || layer.opacity > 1) {
        errors.push(`${prefix}.opacity=${layer.opacity} 超出范围 (0-1)`)
      }
    }

    // ── fitMode check (S5b §7.4) ──
    if (layer.fitMode !== undefined && layer.fitMode !== null) {
      if (typeof layer.fitMode !== 'string' || !VALID_FIT_MODES.includes(layer.fitMode)) {
        errors.push(`${prefix}.fitMode="${layer.fitMode}" 无效，必须是 ${VALID_FIT_MODES.join(', ')} 之一`)
      }
    }

    // ── focusArea check (S5b §7.1, §4.3) ──
    if (layer.focusArea !== undefined && layer.focusArea !== null) {
      if (!isObject(layer.focusArea)) {
        errors.push(`${prefix}.focusArea 必须是对象`)
      } else {
        const fa = layer.focusArea
        for (const faField of ['x', 'y', 'w', 'h']) {
          if (!isNumber(fa[faField])) {
            errors.push(`${prefix}.focusArea.${faField} 必须是数字`)
          } else if (fa[faField] < 0 || fa[faField] > 1) {
            errors.push(`${prefix}.focusArea.${faField}=${fa[faField]} 超出范围 (0-1)`)
          }
        }
        if (isNumber(fa.w) && fa.w <= 0) errors.push(`${prefix}.focusArea.w 必须 > 0`)
        if (isNumber(fa.h) && fa.h <= 0) errors.push(`${prefix}.focusArea.h 必须 > 0`)
      }
    }

    // ── text layer style checks (S5b §7.5) ──
    if (layer.type === 'text') {
      const style = layer.style
      if (!isObject(style)) {
        errors.push(`${prefix} text layer 必须有 style 对象`)
      } else {
        if (typeof style.fontFamily !== 'string' || !style.fontFamily) errors.push(`${prefix}.style.fontFamily 必须是非空字符串`)
        if (!isNumber(style.fontSize)) errors.push(`${prefix}.style.fontSize 必须是数字`)
        if (typeof style.color !== 'string') errors.push(`${prefix}.style.color 必须是字符串`)
        if (typeof style.align !== 'string' || !VALID_ALIGNS.includes(style.align)) errors.push(`${prefix}.style.align 必须是 ${VALID_ALIGNS.join(', ')} 之一`)
        if (style.lineHeight !== undefined && !isNumber(style.lineHeight)) errors.push(`${prefix}.style.lineHeight 必须是数字`)
        if (style.letterSpacing !== undefined && !isNumber(style.letterSpacing)) errors.push(`${prefix}.style.letterSpacing 必须是数字`)
      }
    }

    // ── slot check ──
    if (layer.slot !== undefined && layer.slot !== null) {
      if (!isObject(layer.slot)) { errors.push(`${prefix}.slot 必须是对象`) }
      else if (typeof layer.slot.inputKey !== 'string' || !layer.slot.inputKey) errors.push(`${prefix}.slot.inputKey 必须是非空字符串`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── variables_schema validation ───

const VALID_VAR_TYPES = ['text', 'number', 'select']
const KEY_REGEX = /^[a-zA-Z0-9_]+$/

export function validateVariablesSchema(schema: unknown): ValidationResult {
  const errors: string[] = []

  if (!Array.isArray(schema)) return { valid: false, errors: ['variables_schema 必须是数组'] }

  const keys = new Set<string>()

  for (let i = 0; i < schema.length; i++) {
    const item = schema[i]
    const prefix = `variables_schema[${i}]`
    if (!isObject(item)) { errors.push(`${prefix} 必须是对象`); continue }

    for (const field of ['key', 'label', 'type', 'required']) {
      if (item[field] === undefined || item[field] === null) errors.push(`${prefix} 缺少必填字段: ${field}`)
    }
    if (typeof item.key === 'string') {
      if (!KEY_REGEX.test(item.key)) errors.push(`${prefix}.key="${item.key}" 只能包含字母、数字、下划线`)
      if (keys.has(item.key)) errors.push(`${prefix}.key="${item.key}" 重复`)
      keys.add(item.key)
    }
    if (typeof item.type === 'string' && !VALID_VAR_TYPES.includes(item.type)) errors.push(`${prefix}.type="${item.type}" 无效`)
    if (item.required !== undefined && typeof item.required !== 'boolean') errors.push(`${prefix}.required 必须是布尔值`)
    if (item.type === 'select') {
      if (!Array.isArray(item.options) || item.options.length === 0) errors.push(`${prefix} type=select 必须有非空 options`)
    }
    if (item.type === 'number') {
      if (item.min !== undefined && !isNumber(item.min)) errors.push(`${prefix}.min 必须是数字`)
      if (item.max !== undefined && !isNumber(item.max)) errors.push(`${prefix}.max 必须是数字`)
      if (isNumber(item.min) && isNumber(item.max) && item.min > item.max) errors.push(`${prefix}.min 不能大于 max`)
    }
    if (item.type === 'text' && item.maxLength !== undefined) {
      if (!Number.isInteger(item.maxLength) || (item.maxLength as number) <= 0) errors.push(`${prefix}.maxLength 必须是正整数`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── slot ↔ variable consistency ───

export function validateSlotConsistency(config: unknown, varSchema: unknown): ValidationResult {
  const errors: string[] = []
  if (!isObject(config) || !Array.isArray(config.layers)) return { valid: true, errors: [] }

  const varKeys = new Set<string>()
  if (Array.isArray(varSchema)) {
    for (const v of varSchema) { if (isObject(v) && typeof v.key === 'string') varKeys.add(v.key) }
  }

  for (let i = 0; i < config.layers.length; i++) {
    const layer = config.layers[i]
    if (!isObject(layer)) continue
    if (layer.slot && isObject(layer.slot) && typeof layer.slot.inputKey === 'string') {
      if (layer.slot.inputKey === 'productImage') continue
      if (!varKeys.has(layer.slot.inputKey)) errors.push(`layers[${i}] slot.inputKey="${layer.slot.inputKey}" 在 variables_schema 中未定义`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── submitted variables validation ───

export function validateVariables(vars: Record<string, unknown>, varSchema: unknown): ValidationResult {
  const errors: string[] = []
  if (!Array.isArray(varSchema)) return { valid: true, errors: [] }

  for (const def of varSchema) {
    if (!isObject(def)) continue
    const key = def.key as string
    const value = vars[key]
    const required = def.required === true

    if (value === undefined || value === null || value === '') {
      if (required) errors.push(`必填变量 "${key}" 未提供`)
      continue
    }

    switch (def.type) {
      case 'text':
        if (typeof value !== 'string') errors.push(`变量 "${key}" 必须是文本`)
        else if (isNumber(def.maxLength) && value.length > def.maxLength) errors.push(`变量 "${key}" 超过最大长度 ${def.maxLength}`)
        break
      case 'number': {
        const num = Number(value)
        if (Number.isNaN(num)) errors.push(`变量 "${key}" 必须是数字`)
        else {
          if (isNumber(def.min) && num < def.min) errors.push(`变量 "${key}" 不能小于 ${def.min}`)
          if (isNumber(def.max) && num > def.max) errors.push(`变量 "${key}" 不能大于 ${def.max}`)
        }
        break
      }
      case 'select':
        if (Array.isArray(def.options) && !def.options.includes(value)) errors.push(`变量 "${key}" 值 "${value}" 不在允许选项中`)
        break
    }
  }

  return { valid: errors.length === 0, errors }
}
