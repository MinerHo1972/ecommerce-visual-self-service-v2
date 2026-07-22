-- S6: Add partial unique index for is_selected per root_generated_image_id
-- Ensures only one image can be selected (is_selected = true) per root version chain
CREATE UNIQUE INDEX IF NOT EXISTS "generated_images_one_selected_per_root"
ON "generated_images"("root_generated_image_id")
WHERE "is_selected" = true AND "deleted_at" IS NULL;
