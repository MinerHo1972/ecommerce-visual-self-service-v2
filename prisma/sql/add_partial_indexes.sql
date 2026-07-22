-- is_selected 唯一性约束：同一 root 下最多一个 is_selected = true（且未软删除）
CREATE UNIQUE INDEX IF NOT EXISTS generated_images_one_selected_per_root
  ON generated_images (root_generated_image_id)
  WHERE is_selected = true AND deleted_at IS NULL;
