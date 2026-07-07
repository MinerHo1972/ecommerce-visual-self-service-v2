ALTER TABLE generated_images
  ADD COLUMN workflow_type VARCHAR(64) NULL AFTER operation_trace,
  ADD COLUMN workflow_run_id VARCHAR(64) NULL AFTER workflow_type,
  ADD COLUMN workflow_step VARCHAR(64) NULL AFTER workflow_run_id,
  ADD COLUMN parent_image_id BIGINT NULL AFTER workflow_step,
  ADD COLUMN parent_asset_type VARCHAR(32) NULL AFTER parent_image_id,
  ADD COLUMN human_decision VARCHAR(32) NULL AFTER parent_asset_type,
  ADD INDEX idx_generated_workflow_run (workflow_run_id),
  ADD INDEX idx_generated_parent_image (parent_image_id),
  ADD INDEX idx_generated_workflow_type (workflow_type);
