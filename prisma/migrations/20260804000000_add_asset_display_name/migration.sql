ALTER TABLE "assets" ADD COLUMN "display_name" TEXT;

UPDATE "assets"
SET "display_name" = LEFT(
  COALESCE(
    NULLIF(BTRIM(REGEXP_REPLACE(BTRIM("filename"), '\.[^.]+$', '')), ''),
    NULLIF(BTRIM("filename"), ''),
    '未命名素材'
  ),
  100
)
WHERE "display_name" IS NULL;
