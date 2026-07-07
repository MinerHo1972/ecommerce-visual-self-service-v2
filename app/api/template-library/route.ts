import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getMysqlPool } from "@/lib/db/mysql";
import { getRuntimeConfig } from "@/lib/config";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";

function toHttpsUrl(url: string): string {
  return url.replace(/^http:\/\//, "https://");
}

function getAliOssClient() {
  const config = getRuntimeConfig();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OSS = require("ali-oss");
  return new OSS({
    region: config.oss.region,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucket,
    authorization: "signature",
  });
}

type TemplateTextLayer = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  align: "left" | "center" | "right";
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  backgroundColor?: string;
  backgroundRadius?: number;
};

type TemplateExtractionDraft = {
  originalText: string;
  eraseMode: "mask" | "inpaint_needed";
  confidence: "low" | "medium" | "high";
  notes: string;
};

type TemplateRow = {
  id: number;
  name: string;
  tags: string | string[] | null;
  oss_key: string;
  thumbnail_url: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function parseTags(value: string | string[] | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
}

function textLayerToTag(layer: TemplateTextLayer): string {
  return `text_layer:${Buffer.from(JSON.stringify(layer), "utf8").toString("base64url")}`;
}

function extractionDraftToTag(draft: TemplateExtractionDraft): string {
  return `text_extract:${Buffer.from(JSON.stringify(draft), "utf8").toString("base64url")}`;
}

function parseTextLayer(tags: string[]): TemplateTextLayer | null {
  const tag = tags.find((item) => item.startsWith("text_layer:"));
  if (!tag) return null;
  try {
    const parsed = JSON.parse(Buffer.from(tag.slice("text_layer:".length), "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      x: Number(parsed.x) || 0,
      y: Number(parsed.y) || 0,
      width: Number(parsed.width) || 800,
      height: Number(parsed.height) || 120,
      fontSize: Number(parsed.fontSize) || 72,
      fontFamily: typeof parsed.fontFamily === "string" ? parsed.fontFamily : "Arial, sans-serif",
      fontWeight: typeof parsed.fontWeight === "string" ? parsed.fontWeight : "700",
      color: typeof parsed.color === "string" ? parsed.color : "#ffffff",
      align: parsed.align === "left" || parsed.align === "right" ? parsed.align : "center",
      strokeColor: typeof parsed.strokeColor === "string" ? parsed.strokeColor : undefined,
      strokeWidth: Number(parsed.strokeWidth) || 0,
      shadowColor: typeof parsed.shadowColor === "string" ? parsed.shadowColor : undefined,
      shadowBlur: Number(parsed.shadowBlur) || 0,
      shadowOffsetX: Number(parsed.shadowOffsetX) || 0,
      shadowOffsetY: Number(parsed.shadowOffsetY) || 0,
      backgroundColor: typeof parsed.backgroundColor === "string" ? parsed.backgroundColor : undefined,
      backgroundRadius: Number(parsed.backgroundRadius) || 0,
    };
  } catch {
    return null;
  }
}

function parseExtractionDraft(tags: string[]): TemplateExtractionDraft | null {
  const tag = tags.find((item) => item.startsWith("text_extract:"));
  if (!tag) return null;
  try {
    const parsed = JSON.parse(Buffer.from(tag.slice("text_extract:".length), "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return {
      originalText: typeof parsed.originalText === "string" ? parsed.originalText : "",
      eraseMode: parsed.eraseMode === "inpaint_needed" ? "inpaint_needed" : "mask",
      confidence: parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low",
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };
  } catch {
    return null;
  }
}

function tagsWithoutInternalTextTags(tags: string[]): string[] {
  return tags.filter((tag) => !tag.startsWith("text_layer:") && !tag.startsWith("text_extract:"));
}

function guessContentType(url: string, response: Response): string {
  const responseType = response.headers.get("content-type");
  if (responseType?.startsWith("image/")) return responseType.split(";")[0];
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  return "image/png";
}

async function persistTemplateFromUrl(sourceUrl: string, ossKey: string): Promise<string> {
  const config = getRuntimeConfig();
  if (config.oss.uploadTokenMode !== "aliyun") return sourceUrl;

  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`下载改字模板失败: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const client = getAliOssClient();
  await client.put(ossKey, buffer, { headers: { "Content-Type": guessContentType(sourceUrl, response) } });
  return toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));
}

async function persistTemplateBuffer(buffer: Buffer, ossKey: string, contentType: string): Promise<string> {
  const config = getRuntimeConfig();
  if (config.oss.uploadTokenMode !== "aliyun") return `data:${contentType};base64,${buffer.toString("base64")}`;

  const client = getAliOssClient();
  await client.put(ossKey, buffer, { headers: { "Content-Type": contentType } });
  return toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function imageUrlToDataUri(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`下载模板底图失败: ${response.status}`);
  const contentType = guessContentType(imageUrl, response);
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function buildTextLayerSvg(baseImageDataUri: string, layer: TemplateTextLayer, text: string): Buffer {
  const canvasWidth = 800;
  const canvasHeight = 800;
  const anchor = layer.align === "left" ? "start" : layer.align === "right" ? "end" : "middle";
  const x = layer.align === "left" ? layer.x : layer.align === "right" ? layer.x + layer.width : layer.x + layer.width / 2;
  const y = layer.y + layer.height / 2 + layer.fontSize * 0.35;
  const stroke = layer.strokeColor && layer.strokeWidth
    ? `stroke="${escapeXml(layer.strokeColor)}" stroke-width="${layer.strokeWidth}" paint-order="stroke fill"`
    : "";
  const filterId = layer.shadowColor && layer.shadowBlur ? "textShadow" : "";
  const filter = filterId
    ? `<defs><filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="${layer.shadowOffsetX ?? 0}" dy="${layer.shadowOffsetY ?? 0}" stdDeviation="${layer.shadowBlur}" flood-color="${escapeXml(layer.shadowColor ?? "#000000")}"/></filter></defs>`
    : "";
  const background = layer.backgroundColor
    ? `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.backgroundRadius ?? 0}" fill="${escapeXml(layer.backgroundColor)}"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">${filter}<image href="${baseImageDataUri}" x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" preserveAspectRatio="xMidYMid slice"/>${background}<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${escapeXml(layer.fontFamily)}" font-size="${layer.fontSize}" font-weight="${escapeXml(layer.fontWeight)}" fill="${escapeXml(layer.color)}" ${stroke} ${filterId ? 'filter="url(#textShadow)"' : ""}>${escapeXml(text)}</text></svg>`;
  return Buffer.from(svg, "utf8");
}

export async function GET() {
  try {
    const pool = await getMysqlPool();
    const [rows] = await pool.query<TemplateRow[]>(
      "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM template_library WHERE status = 'active' ORDER BY updated_at DESC"
    );
    const config = getRuntimeConfig();
    let client: ReturnType<typeof getAliOssClient> | null = null;
    if (config.oss.uploadTokenMode === "aliyun") {
      client = getAliOssClient();
    }
    const templates = rows.map((r) => {
      // Regenerate fresh signed URL from oss_key instead of using expired thumbnail_url
      let thumbnailUrl = toHttpsUrl(r.thumbnail_url);
      if (client && r.oss_key) {
        try {
          thumbnailUrl = toHttpsUrl(client.signatureUrl(r.oss_key, { method: "GET", expires: 3600 }));
        } catch { /* fallback to stored URL */ }
      }
      const tags = parseTags(r.tags);
      return {
        id: r.id,
        name: r.name,
        tags: tagsWithoutInternalTextTags(tags),
        textLayer: parseTextLayer(tags),
        extractionDraft: parseExtractionDraft(tags),
        ossKey: r.oss_key,
        thumbnailUrl,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
    return NextResponse.json(ok({ templates }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "获取模板列表失败"),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const { action, templateId, originalText, replacementText, editInstruction, sourceUrl, sourceOssKey, sourceName, name, tags: saveTags } = body as {
      action?: string;
      templateId?: number;
      originalText?: string;
      replacementText?: string;
      editInstruction?: string;
      sourceUrl?: string;
      sourceOssKey?: string;
      sourceName?: string;
      name?: string;
      tags?: string[];
    };

    if (action === "save_from_url") {
      if (!sourceUrl?.trim()) {
        return NextResponse.json(fail("VALIDATION_ERROR", "sourceUrl is required"), { status: 400 });
      }
      try {
        const timestamp = Date.now();
        const safeName = name?.trim() || "保存的模板图";
        const safeSource = safeName.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 24) || "template";
        const ossKey = `templates/saved/${timestamp}_${safeSource}.png`;
        const thumbnailUrl = await persistTemplateFromUrl(sourceUrl.trim(), ossKey);
        const pool = await getMysqlPool();
        const templateTags = JSON.stringify(Array.isArray(saveTags) ? saveTags.map(String).filter(Boolean) : ["saved_from_generated"]);
        const [result] = await pool.execute<{ insertId: number }>(
          "INSERT INTO template_library (name, tags, oss_key, thumbnail_url) VALUES (:name, :tags, :ossKey, :thumbnailUrl)",
          { name: safeName, tags: templateTags, ossKey, thumbnailUrl }
        );

        return NextResponse.json(ok({
          template: {
            id: result.insertId,
            name: safeName,
            tags: JSON.parse(templateTags),
            textLayer: null,
            extractionDraft: null,
            ossKey,
            thumbnailUrl,
            status: "active",
          },
        }));
      } catch (err) {
        return NextResponse.json(
          fail("SAVE_FROM_URL_ERROR", err instanceof Error ? err.message : "保存到模板库失败"),
          { status: 500 }
        );
      }
    }

    if (action !== "text_edit") {
      return NextResponse.json(fail("VALIDATION_ERROR", "unsupported action"), { status: 400 });
    }
    if (!originalText?.trim() || !replacementText?.trim()) {
      return NextResponse.json(fail("VALIDATION_ERROR", "originalText and replacementText are required"), { status: 400 });
    }
    if (!templateId && !sourceOssKey) {
      return NextResponse.json(fail("VALIDATION_ERROR", "templateId or sourceOssKey is required"), { status: 400 });
    }

    try {
      const pool = await getMysqlPool();
      const config = getRuntimeConfig();

      // Resolve source image: either from template_library (by templateId) or directly from ossKey
      let templateImageUrl: string;
      let sourceTemplateName: string;
      let sourceTagsParsed: string[] = [];
      let sourceTextLayer: ReturnType<typeof parseTextLayer> = null;
      let effectiveTemplateId: number = templateId ?? 0;

      if (templateId) {
        const [rows] = await pool.query<TemplateRow[]>(
          "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM template_library WHERE id = :id AND status = 'active' LIMIT 1",
          { id: templateId }
        );
        const sourceTemplate = rows[0];
      if (!sourceTemplate) {
        return NextResponse.json(fail("NOT_FOUND", "模板不存在或已移入回收站"), { status: 404 });
      }

      templateImageUrl = toHttpsUrl(sourceTemplate.thumbnail_url);
      if (config.oss.uploadTokenMode === "aliyun" && sourceTemplate.oss_key) {
        try {
          templateImageUrl = toHttpsUrl(getAliOssClient().signatureUrl(sourceTemplate.oss_key, { method: "GET", expires: 3600 }));
        } catch { /* fallback to stored URL */ }
      }
      sourceTemplateName = sourceTemplate.name;
      sourceTagsParsed = parseTags(sourceTemplate.tags);
      sourceTextLayer = parseTextLayer(sourceTagsParsed);
      } else {
        // Direct image from library via ossKey
        if (config.oss.uploadTokenMode === "aliyun" && sourceOssKey) {
          try {
            templateImageUrl = toHttpsUrl(getAliOssClient().signatureUrl(sourceOssKey, { method: "GET", expires: 3600 }));
          } catch {
            templateImageUrl = sourceUrl ? toHttpsUrl(sourceUrl) : "";
          }
        } else {
          templateImageUrl = sourceUrl ? toHttpsUrl(sourceUrl) : "";
        }
        sourceTemplateName = sourceName || "图库图片";
      }

      const timestamp = Date.now();
      const safeOriginal = originalText.trim().replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 18) || "text";
      const safeReplacement = replacementText.trim().replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 18) || "new";
      const sourceTags = sourceTagsParsed;
      const templateName = `${sourceTemplateName}｜${originalText.trim()}改${replacementText.trim()}`;

      if (sourceTextLayer) {
        const nextLayer = { ...sourceTextLayer, text: replacementText.trim() };
        const baseImageDataUri = await imageUrlToDataUri(templateImageUrl);
        const svgBuffer = buildTextLayerSvg(baseImageDataUri, nextLayer, replacementText.trim());
        const ossKey = `templates/text-edits/${timestamp}_${effectiveTemplateId}_${safeOriginal}_to_${safeReplacement}.svg`;
        const thumbnailUrl = await persistTemplateBuffer(svgBuffer, ossKey, "image/svg+xml");
        const tags = JSON.stringify([
          ...tagsWithoutInternalTextTags(sourceTags),
          textLayerToTag(nextLayer),
          "text_edit",
          "deterministic_text_layer",
          `from_template:${effectiveTemplateId}`,
          `replace:${originalText.trim()}=>${replacementText.trim()}`,
        ]);

        const [insertResult] = await pool.execute<{ insertId: number }>(
          "INSERT INTO template_library (name, tags, oss_key, thumbnail_url) VALUES (:name, :tags, :ossKey, :thumbnailUrl)",
          { name: templateName, tags, ossKey, thumbnailUrl }
        );

        return NextResponse.json(ok({
          template: {
            id: insertResult.insertId,
            name: templateName,
            tags: JSON.parse(tags),
            textLayer: nextLayer,
            ossKey,
            thumbnailUrl,
            status: "active",
          },
          renderMode: "deterministic_text_layer",
        }));
      }

      const result = await getGenerationJobRepository().createJob({
        templateId: effectiveTemplateId,
        templateName: `${sourceTemplateName} 改字`,
        candidateCount: 1,
        exportSize: { name: "template_square", width: 800, height: 800 },
        inputs: {
          mode: "template_text_edit",
          templateImageUrl,
          originalText: originalText.trim(),
          replacementText: replacementText.trim(),
          editInstruction: editInstruction?.trim() ?? "",
          sourceTemplateId: effectiveTemplateId,
        },
      });
      const generated = result.images[0];
      if (!generated?.thumbnailUrl) {
        throw new Error("未生成可用模板图");
      }

      const ossKey = `templates/text-edits/${timestamp}_${effectiveTemplateId}_${safeOriginal}_to_${safeReplacement}.png`;
      const thumbnailUrl = await persistTemplateFromUrl(generated.thumbnailUrl, ossKey);
      const tags = JSON.stringify([
        ...sourceTags,
        "text_edit",
        `from_template:${effectiveTemplateId}`,
        `replace:${originalText.trim()}=>${replacementText.trim()}`,
      ]);

      const [insertResult] = await pool.execute<{ insertId: number }>(
        "INSERT INTO template_library (name, tags, oss_key, thumbnail_url) VALUES (:name, :tags, :ossKey, :thumbnailUrl)",
        { name: templateName, tags, ossKey, thumbnailUrl }
      );

      return NextResponse.json(ok({
        template: {
          id: insertResult.insertId,
          name: templateName,
          tags: JSON.parse(tags),
          ossKey,
          thumbnailUrl,
          status: "active",
        },
        job: result.job,
        generatedImage: generated,
        renderMode: "ai_image_edit",
      }));
    } catch (err) {
      return NextResponse.json(
        fail("TEXT_EDIT_ERROR", err instanceof Error ? err.message : "文字修改失败"),
        { status: 500 }
      );
    }
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const name = formData.get("name") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json(fail("VALIDATION_ERROR", "file is required"), { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(fail("VALIDATION_ERROR", "只支持图片文件"), { status: 400 });
  }

  const config = getRuntimeConfig();
  const timestamp = Date.now();
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ossKey = `templates/${timestamp}_${sanitized}`;

  try {
    let thumbnailUrl = "";

    if (config.oss.uploadTokenMode === "aliyun") {
      const client = getAliOssClient();
      const buffer = Buffer.from(await file.arrayBuffer());
      await client.put(ossKey, buffer, { headers: { "Content-Type": file.type } });
      thumbnailUrl = toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));
    }

    const pool = await getMysqlPool();
    const templateName = name || sanitized.replace(/\.[^.]+$/, "");
    const [result] = await pool.execute<{ insertId: number }>(
      "INSERT INTO template_library (name, oss_key, thumbnail_url) VALUES (:name, :ossKey, :thumbnailUrl)",
      { name: templateName, ossKey, thumbnailUrl }
    );

    return NextResponse.json(ok({
      template: {
        id: result.insertId,
        name: templateName,
        ossKey,
        thumbnailUrl,
        status: "active",
      },
    }));
  } catch (err) {
    return NextResponse.json(
      fail("UPLOAD_ERROR", err instanceof Error ? err.message : "上传模板失败"),
      { status: 500 }
    );
  }
}

function buildDefaultTextLayerFromDraft(draft: TemplateExtractionDraft): TemplateTextLayer {
  return {
    text: draft.originalText.trim() || "主标题",
    x: 80,
    y: 120,
    width: 640,
    height: 120,
    fontSize: 72,
    fontFamily: "Arial, sans-serif",
    fontWeight: "700",
    color: "#ffffff",
    align: "center",
    strokeColor: "#000000",
    strokeWidth: 0,
    shadowColor: "#000000",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    backgroundColor: draft.eraseMode === "mask" ? "#ffffff" : undefined,
    backgroundRadius: 0,
  };
}

function normalizeExtractionDraft(draft: TemplateExtractionDraft | undefined): TemplateExtractionDraft {
  return {
    originalText: draft?.originalText?.trim() || "主标题",
    eraseMode: draft?.eraseMode === "inpaint_needed" ? "inpaint_needed" : "mask",
    confidence: draft?.confidence === "high" || draft?.confidence === "medium" ? draft.confidence : "low",
    notes: draft?.notes?.trim() || "先生成文字层草案；复杂背景建议后续做局部擦除/修复。",
  };
}

function normalizeTextLayer(layer: TemplateTextLayer | undefined): TemplateTextLayer {
  return {
    text: layer?.text?.trim() || "主标题",
    x: Math.max(0, Number(layer?.x) || 80),
    y: Math.max(0, Number(layer?.y) || 120),
    width: Math.max(20, Number(layer?.width) || 640),
    height: Math.max(20, Number(layer?.height) || 120),
    fontSize: Math.max(8, Number(layer?.fontSize) || 72),
    fontFamily: layer?.fontFamily?.trim() || "Arial, sans-serif",
    fontWeight: layer?.fontWeight?.trim() || "700",
    color: layer?.color?.trim() || "#ffffff",
    align: layer?.align === "left" || layer?.align === "right" ? layer.align : "center",
    strokeColor: layer?.strokeColor?.trim() || undefined,
    strokeWidth: Math.max(0, Number(layer?.strokeWidth) || 0),
    shadowColor: layer?.shadowColor?.trim() || undefined,
    shadowBlur: Math.max(0, Number(layer?.shadowBlur) || 0),
    shadowOffsetX: Number(layer?.shadowOffsetX) || 0,
    shadowOffsetY: Number(layer?.shadowOffsetY) || 0,
    backgroundColor: layer?.backgroundColor?.trim() || undefined,
    backgroundRadius: Math.max(0, Number(layer?.backgroundRadius) || 0),
  };
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, name, status, textLayer, clearTextLayer, extractionDraft, createTextLayerFromExtraction } = body as {
    id: number;
    name?: string;
    status?: string;
    textLayer?: TemplateTextLayer;
    clearTextLayer?: boolean;
    extractionDraft?: TemplateExtractionDraft;
    createTextLayerFromExtraction?: boolean;
  };

  if (!id) {
    return NextResponse.json(fail("VALIDATION_ERROR", "id is required"), { status: 400 });
  }

  try {
    const pool = await getMysqlPool();
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (name !== undefined) { sets.push("name = :name"); params.name = name; }
    if (status !== undefined) { sets.push("status = :status"); params.status = status; }

    if (textLayer !== undefined || clearTextLayer || extractionDraft !== undefined || createTextLayerFromExtraction) {
      const [rows] = await pool.query<TemplateRow[]>(
        "SELECT tags FROM template_library WHERE id = :id LIMIT 1",
        { id }
      );
      const parsedTags = parseTags(rows[0]?.tags ?? null);
      let nextTags = tagsWithoutInternalTextTags(parsedTags);

      const nextExtractionDraft = extractionDraft !== undefined
        ? normalizeExtractionDraft(extractionDraft)
        : parseExtractionDraft(parsedTags);
      const nextTextLayer = createTextLayerFromExtraction && nextExtractionDraft
        ? buildDefaultTextLayerFromDraft(nextExtractionDraft)
        : textLayer;

      if (!clearTextLayer) {
        if (nextTextLayer) nextTags = [...nextTags, textLayerToTag(normalizeTextLayer(nextTextLayer))];
        if (nextExtractionDraft && !createTextLayerFromExtraction) nextTags = [...nextTags, extractionDraftToTag(nextExtractionDraft)];
      }

      sets.push("tags = :tags");
      params.tags = JSON.stringify(nextTags);
    }

    if (sets.length === 0) {
      return NextResponse.json(fail("VALIDATION_ERROR", "nothing to update"), { status: 400 });
    }

    await pool.execute(`UPDATE template_library SET ${sets.join(", ")} WHERE id = :id`, params);
    return NextResponse.json(ok({ updated: true }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "更新失败"),
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(fail("VALIDATION_ERROR", "id is required"), { status: 400 });
  }

  try {
    const pool = await getMysqlPool();
    // Soft delete
    await pool.execute("UPDATE template_library SET status = 'archived' WHERE id = :id", { id: Number(id) });
    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "删除失败"),
      { status: 500 }
    );
  }
}
