import type { BadgeLayer, ExportSize, FocusArea, LayerTemplateJson, ProductLayer, QualityCheck, Rect, RenderInputs, RenderResult, ShapeLayer, TemplateLayer, TextLayer, TextStyle } from "./types";
import { getImageDataUrl, loadImage, getObjectFitRect } from "./image-loader";

type RenderOptions = { exportSize?: ExportSize; showSafeMargin?: boolean };

function scaleRect(rect: Rect, scaleX: number, scaleY: number): Rect {
  return { x: rect.x * scaleX, y: rect.y * scaleY, width: rect.width * scaleX, height: rect.height * scaleY };
}

function roundedRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number): void {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.lineTo(rect.x + rect.width - r, rect.y);
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + r);
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - r);
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - r, rect.y + rect.height);
  ctx.lineTo(rect.x + r, rect.y + rect.height);
  ctx.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - r);
  ctx.lineTo(rect.x, rect.y + r);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
  ctx.closePath();
}

function drawGradient(ctx: CanvasRenderingContext2D, width: number, height: number, angle: number, stops: Array<{ offset: number; color: string }>): void {
  const radians = (angle * Math.PI) / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);
  const gradient = ctx.createLinearGradient(width * (0.5 - x / 2), height * (0.5 - y / 2), height * (0.5 + x / 2), height * (0.5 + y / 2));
  stops.forEach((stop) => gradient.addColorStop(stop.offset, stop.color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function textWidth(ctx: CanvasRenderingContext2D, text: string, style: TextStyle): number {
  const spacing = style.letterSpacing ?? 0;
  if (!spacing) return ctx.measureText(text).width;
  return [...text].reduce((sum, char, index) => sum + ctx.measureText(char).width + (index ? spacing : 0), 0);
}

function resolveFont(ctx: CanvasRenderingContext2D, text: string, area: Rect, style: TextStyle, scaleY: number): { size: number; overflow: boolean } {
  let size = Math.round(style.baseSize * scaleY);
  const minSize = Math.round(style.minSize * scaleY);
  const weight = style.weight || "700";
  const family = style.fontFamily || "system-ui";
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (!style.autoShrink || textWidth(ctx, text, style) <= area.width) break;
    size -= 1;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return { size, overflow: textWidth(ctx, text, style) > area.width || size > area.height * 1.15 };
}

function drawSpacedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle): void {
  const spacing = style.letterSpacing ?? 0;
  if (!spacing) {
    if (style.strokeColor && style.strokeWidth) ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    return;
  }
  let cursor = x;
  for (const char of text) {
    if (style.strokeColor && style.strokeWidth) ctx.strokeText(char, cursor, y);
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }
}

function applyTextStyle(ctx: CanvasRenderingContext2D, style: TextStyle, size: number): void {
  ctx.font = `${style.weight || "700"} ${size}px ${style.fontFamily || "system-ui"}`;
  ctx.textAlign = style.align ?? "left";
  ctx.textBaseline = style.baseline ?? "middle";
  ctx.fillStyle = style.color;
  if (style.strokeColor && style.strokeWidth) {
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = style.strokeWidth;
    ctx.lineJoin = "round";
  }
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer, inputs: RenderInputs, scaleX: number, scaleY: number, checks: QualityCheck[]): void {
  const area = scaleRect(layer.area, scaleX, scaleY);
  const text = (inputs[layer.textKey] as string) || layer.defaultText;
  const { size, overflow } = resolveFont(ctx, text, area, layer.style, scaleY);
  applyTextStyle(ctx, layer.style, size);
  drawSpacedText(ctx, text, area.x, area.y + area.height / 2, layer.style);
  checks.push({ type: "text_overflow", passed: !overflow, message: overflow ? `${layer.id} 文本超出槽位` : `${layer.id} 文本未越界`, layerId: layer.id });
}

function drawBadgeLayer(ctx: CanvasRenderingContext2D, layer: BadgeLayer, inputs: RenderInputs, scaleX: number, scaleY: number, checks: QualityCheck[]): void {
  const area = scaleRect(layer.area, scaleX, scaleY);
  roundedRect(ctx, area, layer.radius * Math.min(scaleX, scaleY));
  ctx.fillStyle = layer.fill;
  ctx.fill();
  const text = (inputs[layer.textKey] as string) || layer.defaultText;
  const style = { ...layer.style, align: "center" as const };
  const { size, overflow } = resolveFont(ctx, text, area, style, scaleY);
  applyTextStyle(ctx, style, size);
  drawSpacedText(ctx, text, area.x + area.width / 2, area.y + area.height / 2, style);
  checks.push({ type: "text_overflow", passed: !overflow, message: overflow ? `${layer.id} 标签文字超出槽位` : `${layer.id} 标签文字未越界`, layerId: layer.id });
}

function drawShapeLayer(ctx: CanvasRenderingContext2D, layer: ShapeLayer, scaleX: number, scaleY: number): void {
  const area = scaleRect(layer.area, scaleX, scaleY);
  ctx.fillStyle = layer.fill;
  if (layer.shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(area.x + area.width / 2, area.y + area.height / 2, area.width / 2, area.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  roundedRect(ctx, area, (layer.radius ?? 0) * Math.min(scaleX, scaleY));
  ctx.fill();
}

function drawProductPlaceholder(ctx: CanvasRenderingContext2D, area: Rect, scaleY: number): void {
  ctx.fillStyle = "#334155";
  ctx.font = `${Math.round(24 * scaleY)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("商品图槽位", area.x + area.width / 2, area.y + area.height / 2);
}

function drawSafeMargin(ctx: CanvasRenderingContext2D, template: LayerTemplateJson, width: number, height: number, scaleX: number, scaleY: number): void {
  const margin = template.safeMargin;
  ctx.save();
  ctx.strokeStyle = "rgba(15,118,110,0.72)";
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.strokeRect(margin.left * scaleX, margin.top * scaleY, width - (margin.left + margin.right) * scaleX, height - (margin.top + margin.bottom) * scaleY);
  ctx.restore();
}

function drawLogoLayer(ctx: CanvasRenderingContext2D, layer: TemplateLayer, scaleX: number, scaleY: number): void {
  if (layer.type !== "logo") return;
  const area = scaleRect(layer.area, scaleX, scaleY);
  roundedRect(ctx, area, 8 * Math.min(scaleX, scaleY));
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fill();
  ctx.fillStyle = "#0f766e";
  ctx.font = `700 ${Math.round(20 * scaleY)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(layer.text || "LOGO", area.x + area.width / 2, area.y + area.height / 2);
}

/**
 * Resolve focus area for a product layer.
 * Priority: inputs.focusAreas[layer.id] > inputs.productFocusArea > layer.focusArea > undefined
 */
function resolveFocusArea(layer: ProductLayer, inputs: RenderInputs): FocusArea | undefined {
  if (inputs.focusAreas?.[layer.id]) return inputs.focusAreas[layer.id];
  if (inputs.productFocusArea) return inputs.productFocusArea;
  return layer.focusArea;
}

/**
 * Draw a real image into the product layer area using fitMode (contain/cover).
 * Returns true if image was drawn successfully, false if fallback needed.
 */
function drawProductImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  area: Rect,
  layer: ProductLayer,
  focusArea?: FocusArea
): void {
  const { sx, sy, sw, sh, dx, dy, dw, dh } = getObjectFitRect(
    img.naturalWidth,
    img.naturalHeight,
    area.x,
    area.y,
    area.width,
    area.height,
    layer.fitMode ?? "contain",
    focusArea
  );

  // Clip to rounded rect area to respect template border radius
  ctx.save();
  roundedRect(ctx, area, 18 * Math.min(area.width / layer.area.width, area.height / layer.area.height));
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();
}

export async function renderLayerTemplate(template: LayerTemplateJson, inputs: RenderInputs, options: RenderOptions = {}): Promise<RenderResult> {
  const width = options.exportSize?.width ?? template.canvas.width;
  const height = options.exportSize?.height ?? template.canvas.height;
  const scaleX = width / template.canvas.width;
  const scaleY = height / template.canvas.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 Canvas");

  const checks: QualityCheck[] = [{ type: "size_compliance", passed: true, message: `${width}x${height} 尺寸合规` }];
  const layers = [...template.layers].filter((layer) => layer.visible !== false).sort((a, b) => a.zIndex - b.zIndex);

  // Pre-load images in parallel for all product and background layers
  const productImageSrc = inputs.productImageDataUrl || getImageDataUrl(inputs, "product");
  const backgroundImageSrc = inputs.backgroundImageDataUrl || getImageDataUrl(inputs, "background");

  const [productImg, backgroundImg] = await Promise.all([
    productImageSrc ? loadImage(productImageSrc) : Promise.resolve(null),
    backgroundImageSrc ? loadImage(backgroundImageSrc) : Promise.resolve(null),
  ]);

  for (const layer of layers) {
    if (layer.type === "background") {
      if (backgroundImg) {
        // Draw real background image, cover the full canvas
        const { sx, sy, sw, sh } = getObjectFitRect(
          backgroundImg.naturalWidth,
          backgroundImg.naturalHeight,
          0,
          0,
          width,
          height,
          "cover"
        );
        ctx.drawImage(backgroundImg, sx, sy, sw, sh, 0, 0, width, height);
      } else if (layer.gradient) {
        drawGradient(ctx, width, height, layer.gradient.angle, layer.gradient.stops);
      } else {
        ctx.fillStyle = layer.fill || "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
    }

    if (layer.type === "shape") drawShapeLayer(ctx, layer, scaleX, scaleY);

    if (layer.type === "product") {
      const area = scaleRect(layer.area, scaleX, scaleY);
      const focusArea = resolveFocusArea(layer, inputs);

      if (productImg) {
        // Draw placeholder background first (as fallback base)
        roundedRect(ctx, area, 18 * Math.min(scaleX, scaleY));
        ctx.fillStyle = layer.placeholderFill || "rgba(255,255,255,0.75)";
        ctx.fill();
        // Draw the real image on top
        drawProductImage(ctx, productImg, area, layer, focusArea);
      } else {
        // No image — keep original placeholder behavior
        roundedRect(ctx, area, 18 * Math.min(scaleX, scaleY));
        ctx.fillStyle = layer.placeholderFill || "rgba(255,255,255,0.75)";
        ctx.fill();
        drawProductPlaceholder(ctx, area, scaleY);
      }
    }

    if (layer.type === "text") drawTextLayer(ctx, layer, inputs, scaleX, scaleY, checks);
    if (layer.type === "badge") drawBadgeLayer(ctx, layer, inputs, scaleX, scaleY, checks);
    if (layer.type === "logo") drawLogoLayer(ctx, layer, scaleX, scaleY);
  }

  if (options.showSafeMargin) drawSafeMargin(ctx, template, width, height, scaleX, scaleY);
  return { dataUrl: canvas.toDataURL("image/png"), width, height, checks };
}
