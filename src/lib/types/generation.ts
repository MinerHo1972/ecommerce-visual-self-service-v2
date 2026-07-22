// S6 生成任务业务类型定义

/** 创建生图任务的输入 */
export interface CreateTaskInput {
  task_type: 'generate' | 'edit'
  // generate 专属
  prompt_template_id?: string
  layer_template_id?: string
  input_assets?: {
    product_image_asset_id?: string
  }
  variables?: Record<string, string>
  params?: {
    count?: number
    width?: number
    height?: number
    provider?: string
    [key: string]: unknown
  }
  // edit 专属
  source_generated_image_id?: string
  edit_instruction_text?: string
  /** P1 多区域编辑：基础图（asset）id；若提供则优先于 source_generated_image_id 作为原图来源 */
  base_asset_id?: string
}

/** 任务详情（返回前端） */
export interface TaskDetail {
  id: string
  task_no: string
  task_type: string
  status: string
  user_id: string
  error_code: string | null
  error_message_safe: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

/** 任务列表项 */
export interface TaskListItem {
  id: string
  task_no: string
  task_type: string
  status: string
  created_at: string
  finished_at: string | null
}

/** 候选图（返回前端） */
export interface GeneratedImageItem {
  id: string
  version_no: number
  variant_index: number
  is_selected: boolean
  root_generated_image_id: string | null
  parent_generated_image_id: string | null
  preview_url: string
  quality_check_json: unknown
}
