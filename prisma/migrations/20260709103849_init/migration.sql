-- EVSS V2 Init Migration
-- Creates all 9 tables with enums, indexes, and constraints

-- Enums
CREATE TYPE "Role" AS ENUM ('operator', 'designer', 'admin');
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');
CREATE TYPE "AssetType" AS ENUM ('product_image', 'reference_image', 'template_material', 'generated_image');
CREATE TYPE "AssetVisibility" AS ENUM ('private', 'public');
CREATE TYPE "TemplateStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "TemplateType" AS ENUM ('prompt', 'layer');
CREATE TYPE "TaskType" AS ENUM ('generate', 'edit');
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'canceled');
CREATE TYPE "AnnotationKind" AS ENUM ('text', 'box', 'arrow', 'draw', 'circle');

-- users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'operator',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- assets
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT NOT NULL,
    "visibility" "AssetVisibility" NOT NULL DEFAULT 'private',
    "tos_bucket" TEXT NOT NULL,
    "tos_key" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assets_owner_id_idx" ON "assets"("owner_id");
CREATE INDEX "assets_type_deleted_at_idx" ON "assets"("type", "deleted_at");
CREATE INDEX "assets_tos_bucket_tos_key_idx" ON "assets"("tos_bucket", "tos_key");
CREATE INDEX "assets_deleted_at_idx" ON "assets"("deleted_at");

-- prompt_templates
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "variable_definitions_json" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TemplateStatus" NOT NULL DEFAULT 'draft',
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prompt_templates_status_scene_platform_idx" ON "prompt_templates"("status", "scene", "platform");
CREATE INDEX "prompt_templates_created_by_idx" ON "prompt_templates"("created_by");

-- layer_templates
CREATE TABLE "layer_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "variable_definitions_json" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TemplateStatus" NOT NULL DEFAULT 'draft',
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "layer_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "layer_templates_status_scene_platform_idx" ON "layer_templates"("status", "scene", "platform");
CREATE INDEX "layer_templates_created_by_idx" ON "layer_templates"("created_by");

-- template_versions
CREATE TABLE "template_versions" (
    "id" TEXT NOT NULL,
    "template_type" "TemplateType" NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "template_versions_template_type_template_id_version_key" ON "template_versions"("template_type", "template_id", "version");
CREATE INDEX "template_versions_template_type_template_id_idx" ON "template_versions"("template_type", "template_id");

-- generation_tasks
CREATE TABLE "generation_tasks" (
    "id" TEXT NOT NULL,
    "task_no" TEXT NOT NULL,
    "task_type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "user_id" TEXT NOT NULL,
    "source_generated_image_id" TEXT,
    "prompt_template_id" TEXT,
    "layer_template_id" TEXT,
    "input_assets_json" JSONB NOT NULL DEFAULT '{}',
    "variables_json" JSONB NOT NULL DEFAULT '{}',
    "params_json" JSONB NOT NULL DEFAULT '{}',
    "input_snapshot_json" JSONB NOT NULL DEFAULT '{}',
    "edit_instruction_text" TEXT,
    "edit_instruction_json" JSONB,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "provider" TEXT,
    "provider_task_id" TEXT,
    "error_code" TEXT,
    "error_message_safe" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "generation_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "generation_tasks_task_no_key" ON "generation_tasks"("task_no");
CREATE INDEX "generation_tasks_status_created_at_idx" ON "generation_tasks"("status", "created_at");
CREATE INDEX "generation_tasks_user_id_idx" ON "generation_tasks"("user_id");
CREATE INDEX "generation_tasks_task_type_status_idx" ON "generation_tasks"("task_type", "status");
CREATE INDEX "generation_tasks_provider_task_id_idx" ON "generation_tasks"("provider_task_id");

-- generated_images
CREATE TABLE "generated_images" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "root_generated_image_id" TEXT,
    "parent_generated_image_id" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "variant_index" INTEGER NOT NULL DEFAULT 1,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "edit_instruction_json" JSONB,
    "quality_check_json" JSONB,
    "generation_params_json" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generated_images_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "generated_images_task_id_idx" ON "generated_images"("task_id");
CREATE INDEX "generated_images_root_generated_image_id_idx" ON "generated_images"("root_generated_image_id");
CREATE INDEX "generated_images_parent_generated_image_id_idx" ON "generated_images"("parent_generated_image_id");
CREATE INDEX "generated_images_asset_id_idx" ON "generated_images"("asset_id");
CREATE INDEX "generated_images_deleted_at_idx" ON "generated_images"("deleted_at");

-- annotations
CREATE TABLE "annotations" (
    "id" TEXT NOT NULL,
    "generated_image_id" TEXT NOT NULL,
    "kind" "AnnotationKind" NOT NULL,
    "region_text" TEXT,
    "geometry_json" JSONB,
    "text" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "annotations_generated_image_id_idx" ON "annotations"("generated_image_id");

-- audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "detail_json" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- Foreign keys
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "layer_templates" ADD CONSTRAINT "layer_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "prompt_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "template_versions" ADD CONSTRAINT "tv_layer_fk" FOREIGN KEY ("template_id") REFERENCES "layer_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_prompt_template_id_fkey" FOREIGN KEY ("prompt_template_id") REFERENCES "prompt_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_layer_template_id_fkey" FOREIGN KEY ("layer_template_id") REFERENCES "layer_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "generation_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_root_generated_image_id_fkey" FOREIGN KEY ("root_generated_image_id") REFERENCES "generated_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_parent_generated_image_id_fkey" FOREIGN KEY ("parent_generated_image_id") REFERENCES "generated_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_generated_image_id_fkey" FOREIGN KEY ("generated_image_id") REFERENCES "generated_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Generated images unique index
CREATE UNIQUE INDEX "generated_images_one_selected_per_root"
    ON "generated_images" ("root_generated_image_id")
    WHERE is_selected = true AND deleted_at IS NULL;
