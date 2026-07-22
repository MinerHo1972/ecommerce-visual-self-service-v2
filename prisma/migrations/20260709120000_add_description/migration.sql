-- S5a: Add description column to layer_templates
ALTER TABLE "layer_templates" ADD COLUMN IF NOT EXISTS "description" TEXT;
