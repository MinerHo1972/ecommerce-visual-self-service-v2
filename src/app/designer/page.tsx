'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'

interface UserInfo {
  id: string
  name: string
  email: string
  role: string
}

interface Template {
  id: string
  name: string
  description: string | null
  status: string
  width: number
  height: number
  created_at: string
  updated_at: string
}

interface AssetItem {
  id: string
  type: string
  filename: string
  width: number | null
  height: number | null
}

const SAMPLE_CONFIG = JSON.stringify({
  canvas: { width: 800, height: 800, background: '#FFFFFF', dpi: 72 },
  layers: [
    { id: 'layer-bg', type: 'background', name: '背景', zIndex: 0, x: 0, y: 0, width: 800, height: 800, fill: '#F5F5F5' },
    { id: 'layer-product', type: 'product', name: '商品图', zIndex: 1, x: 100, y: 50, width: 600, height: 500, fitMode: 'cover', focusArea: { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }, slot: { id: 'slot-product', inputKey: 'productImage', required: true, label: '商品图' } },
    { id: 'layer-price-bg', type: 'decoration', name: '价格底色条', zIndex: 2, x: 100, y: 570, width: 600, height: 60, fill: '#FF4444', opacity: 0.85 },
    { id: 'layer-price', type: 'text', name: '价格', zIndex: 3, x: 100, y: 575, width: 600, height: 50, style: { fontFamily: 'NotoSansSC', fontSize: 36, fontWeight: 'bold', color: '#FFFFFF', align: 'center', lineHeight: 1.2 }, slot: { id: 'slot-price', inputKey: 'price', required: true, label: '价格' } },
    { id: 'layer-title', type: 'text', name: '标题文字', zIndex: 4, x: 100, y: 660, width: 600, height: 80, style: { fontFamily: 'NotoSansSC', fontSize: 28, fontWeight: 'bold', color: '#333333', align: 'center', lineHeight: 1.2 }, slot: { id: 'slot-title', inputKey: 'title', required: true, label: '标题' } },
    { id: 'layer-deco', type: 'decoration', name: '旋转装饰', zIndex: 5, x: 50, y: 680, width: 100, height: 100, fill: '#FFD700', rotation: -15, opacity: 0.6 },
  ],
}, null, 2)

const SAMPLE_VAR_SCHEMA = JSON.stringify([
  { key: 'title', label: '商品标题', type: 'text', required: true, maxLength: 30 },
  { key: 'price', label: '价格', type: 'text', required: true, maxLength: 20 },
], null, 2)
export default function DesignerPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formConfig, setFormConfig] = useState(SAMPLE_CONFIG)
  const [formVarSchema, setFormVarSchema] = useState(SAMPLE_VAR_SCHEMA)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [previewTemplateId, setPreviewTemplateId] = useState('')
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [previewVars, setPreviewVars] = useState('{"title":"限时特价优惠只要¥9999元包邮到家","price":"¥129"}')
  const [previewImage, setPreviewImage] = useState('')
  const [previewCheck, setPreviewCheck] = useState<any>(null)
  const [previewMeta, setPreviewMeta] = useState<any>(null)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then((res) => res.json()).then((data) => {
      if (data.data?.user) { setUser(data.data.user) } else { router.push('/login') }
    })
  }, [router])

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/layer-templates?page_size=100')
      if (res.ok) { const json = await res.json(); setTemplates(json.data?.items || []) }
    } catch {}
    setLoading(false)
  }, [])

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch('/api/assets?page_size=100')
      if (res.ok) { const json = await res.json(); setAssets(json.data?.items || []) }
    } catch {}
  }, [])

  useEffect(() => { if (user) { fetchTemplates(); fetchAssets() } }, [user, fetchTemplates, fetchAssets])

  const handleCreate = () => {
    setEditingId(null); setFormName(''); setFormDesc(''); setFormConfig(SAMPLE_CONFIG); setFormVarSchema(SAMPLE_VAR_SCHEMA); setErrorMsg(''); setShowEditor(true)
  }

  const handleSample = () => {
    setEditingId(null); setFormName('S5b 示例模板'); setFormDesc('含 focusArea cover、rotation 装饰层、NotoSansSC 字体、价格底色条')
    setFormConfig(SAMPLE_CONFIG); setFormVarSchema(SAMPLE_VAR_SCHEMA); setErrorMsg(''); setShowEditor(true)
  }

  const handleEdit = (tpl: Template) => {
    setEditingId(tpl.id); setErrorMsg('')
    fetch(`/api/layer-templates/${tpl.id}`).then((res) => res.json()).then((json) => {
      if (json.data) {
        setFormName(json.data.name || ''); setFormDesc(json.data.description || '')
        setFormConfig(JSON.stringify(json.data.config_json, null, 2))
        setFormVarSchema(JSON.stringify(json.data.variables_schema, null, 2))
        setShowEditor(true)
      }
    })
  }

  const handleSave = async () => {
    setErrorMsg(''); setSuccessMsg('')
    let configJson, varSchema
    try { configJson = JSON.parse(formConfig); varSchema = JSON.parse(formVarSchema) }
    catch { setErrorMsg('JSON 格式错误'); return }
    const payload = { name: formName, description: formDesc, config_json: configJson, variables_schema: varSchema }
    try {
      let res
      if (editingId) { res = await fetch(`/api/layer-templates/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) }
      else { res = await fetch('/api/layer-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) }
      const json = await res.json()
      if (res.ok) { setSuccessMsg(editingId ? '模板已更新' : '模板已创建'); setShowEditor(false); fetchTemplates() }
      else { setErrorMsg(json.error?.message || '保存失败') }
    } catch { setErrorMsg('网络错误') }
  }

  const handleStatusChange = async (id: string, status: string) => {
    setErrorMsg('')
    try {
      const res = await fetch(`/api/layer-templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      const json = await res.json()
      if (res.ok) { fetchTemplates() } else { setErrorMsg(json.error?.message || '操作失败') }
    } catch { setErrorMsg('网络错误') }
  }

  const handleArchive = async (id: string) => { if (!confirm('确认归档？')) return; await fetch(`/api/layer-templates/${id}`, { method: 'DELETE' }); fetchTemplates() }

  const handlePreview = async () => {
    if (!previewTemplateId) { setErrorMsg('请选择模板'); return }
    setPreviewing(true); setErrorMsg(''); setPreviewImage(''); setPreviewCheck(null); setPreviewMeta(null)
    try {
      const res = await fetch('/api/layer-templates/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: previewTemplateId, product_image_asset_id: selectedAssetId || undefined, variables: JSON.parse(previewVars || '{}'), debug: true }),
      })
      const json = await res.json()
      if (res.ok && json.data) { setPreviewImage(json.data.preview_url); setPreviewCheck(json.data.quality_check); setPreviewMeta(json.data.render_meta) }
      else { setErrorMsg(json.error?.message || '预览失败') }
    } catch { setErrorMsg('预览请求失败') }
    setPreviewing(false)
  }

  const statusLabel = (s: string) => ({ draft: '草稿', active: '已发布', archived: '已归档' }[s] || s)

  if (!user) return <div className="min-h-screen flex items-center justify-center">加载中...</div>

  const rowStatusColor = (s: string) => ({ draft: 'muted', active: 'ok', archived: 'danger' }[s] || 'muted')

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">电商生图工作台 <span className="muted font-normal">— 设计师</span></h1>
            <span className="eyebrow">V2 · P0 精装版</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm muted">欢迎，{user.name}（设计师）</span>
            <button onClick={() => { fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.href = '/login') }} className="button">退出登录</button>
          </div>
        </div>
      </header>

      <main className="page">
        {errorMsg && <div className="mb-4 p-3 rounded text-sm" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{errorMsg}</div>}
        {successMsg && <div className="mb-4 p-3 rounded text-sm" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>{successMsg}</div>}

        <div className="panel mb-6">
          <div className="panel-head">
            <h2 className="panel-title">模板管理</h2>
            <div className="flex gap-2">
              <button onClick={handleSample} className="button">填充示例模板</button>
              <button onClick={handleCreate} className="button primary">新建模板</button>
            </div>
          </div>
          <div className="p-4">
          {loading ? <p className="text-sm muted">加载中...</p> : templates.length === 0 ? (
            <p className="text-sm muted">暂无模板，点击"新建模板"或"填充示例模板"</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left muted" style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="py-2 font-medium">名称</th><th className="py-2 font-medium">状态</th><th className="py-2 font-medium">尺寸</th><th className="py-2 font-medium">更新时间</th><th className="py-2 font-medium">操作</th>
              </tr></thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr key={tpl.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2">{tpl.name}<br /><span className="text-xs muted">{tpl.description}</span></td>
                    <td className={`py-2 text-${rowStatusColor(tpl.status)}`}>{statusLabel(tpl.status)}</td>
                    <td className="py-2 muted">{tpl.width}×{tpl.height}</td>
                    <td className="py-2 muted">{new Date(tpl.updated_at).toLocaleString('zh-CN')}</td>
                    <td className="py-2">
                      <div className="flex gap-3 text-xs">
                        <button onClick={() => handleEdit(tpl)} className="text-[var(--primary)] hover:underline">编辑</button>
                        {tpl.status === 'draft' && <button onClick={() => handleStatusChange(tpl.id, 'active')} className="text-[var(--ok)] hover:underline">发布</button>}
                        {tpl.status === 'active' && <button onClick={() => handleStatusChange(tpl.id, 'draft')} className="muted hover:underline">下线</button>}
                        <button onClick={() => handleArchive(tpl.id)} className="text-[var(--danger)] hover:underline">归档</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>

        {showEditor && (
          <div className="template-picker-overlay">
            <div className="template-picker-modal" style={{ maxWidth: 720 }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{editingId ? '编辑模板' : '新建模板'}</h3>
                <button onClick={() => setShowEditor(false)} className="icon-button">✕</button>
              </div>
              <div style={{ display: 'grid', gap: 14 }}>
                <Field label="模板名称">
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="如：800×800 商品主图模板" />
                </Field>
                <Field label="描述（可选）">
                  <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="模板说明" />
                </Field>
                <Field label="config_json">
                  <Textarea value={formConfig} onChange={(e) => setFormConfig(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, minHeight: 240 }} spellCheck={false} />
                </Field>
                <Field label="variables_schema">
                  <Textarea value={formVarSchema} onChange={(e) => setFormVarSchema(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, minHeight: 120 }} spellCheck={false} />
                </Field>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setShowEditor(false)} className="button">取消</button>
                <button onClick={handleSave} className="button primary">保存</button>
              </div>
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-head"><h2 className="panel-title">模板预览</h2></div>
          <div className="p-4">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field label="选择模板">
              <Select value={previewTemplateId} onChange={(e) => setPreviewTemplateId(e.target.value)}>
                <option value="">— 选择模板 —</option>
                {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name} ({statusLabel(tpl.status)})</option>)}
              </Select>
            </Field>
            <Field label="商品图资产">
              <Select value={selectedAssetId} onChange={(e) => setSelectedAssetId(e.target.value)}>
                <option value="">— 选择资产 —</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.filename} ({a.width}×{a.height})</option>)}
              </Select>
            </Field>
          </div>
          <Field label="变量 JSON" hint='键值对，例如 {"title":"商品标题"}' className="mb-3">
            <Textarea value={previewVars} onChange={(e) => setPreviewVars(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, minHeight: 80 }} spellCheck={false} placeholder='{"title":"商品标题","price":"¥99"}' />
          </Field>
          <button onClick={handlePreview} disabled={previewing} className="button primary" style={{ opacity: previewing ? 0.5 : 1 }}>{previewing ? '渲染中...' : '预览'}</button>

          {previewImage && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium mb-2">预览结果</p>
                <img src={previewImage} alt="preview" style={{ border: '1px solid var(--border)', borderRadius: 6, maxWidth: 400, width: '100%' }} />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">质检结果 {previewCheck && (
                  <span style={{ color: previewCheck.passed ? 'var(--ok)' : 'var(--danger)' }}>
                    {previewCheck.passed ? '✅ 通过' : '❌ 未通过'}
                  </span>
                )}</p>
                {previewCheck && previewCheck.overflows && previewCheck.overflows.length > 0 && (
                  <div className="mb-2 p-2 rounded text-xs" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: 'var(--danger)' }}>
                    <p className="font-medium mb-1">文字越界</p>
                    {previewCheck.overflows.map((o: any, i: number) => (
                      <div key={i} className="mb-1">[{o.layerName}] 需要{o.neededLines}行，最多{o.maxLines}行，宽度{o.actualWidth}px&gt;区域{o.slotWidth}px，超出{o.overflowPx}px</div>
                    ))}
                  </div>
                )}
                {previewCheck && previewCheck.issues && previewCheck.issues.length > 0 && (
                  <div className="mb-2 p-2 rounded text-xs" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                    <p className="font-medium mb-1">其他问题</p>
                    {previewCheck.issues.map((iss: any, i: number) => (
                      <div key={i} className={`mb-1`} style={{ color: iss.severity === 'error' ? 'var(--danger)' : '#92400e' }}>
                        [{iss.severity}] {iss.type}: {iss.message}
                      </div>
                    ))}
                  </div>
                )}
                {previewCheck && previewCheck.passed && previewCheck.overflows?.length === 0 && previewCheck.issues?.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--ok)' }}>质检全部通过</p>
                )}
                {previewMeta && (
                  <div className="mt-2 p-2 rounded text-xs" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
                    <p className="font-medium muted mb-1">渲染元数据</p>
                    <div className="muted">来源: {previewMeta.template_source} | 耗时: {previewMeta.duration_ms}ms | 输出: {(previewMeta.output_bytes / 1024).toFixed(1)}KB</div>
                    <div className="muted">画布: {previewMeta.canvas?.width}×{previewMeta.canvas?.height}</div>
                    <div className="muted">字体: {previewMeta.font?.ok ? '✅' : '❌'} {previewMeta.font?.family} ({previewMeta.font?.loadedFrom || 'N/A'})</div>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </main>
    </div>
  )
}
