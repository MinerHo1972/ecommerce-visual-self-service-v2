import type { LayerTemplateJson, QualityCheck } from "./types";

export function validateLayerTemplateJson(template: LayerTemplateJson): QualityCheck[] {
  const checks: QualityCheck[] = [];

  const fail = (message: string): void => {
    checks.push({ type: "size_compliance", passed: false, message });
  };

  if (!template.canvas?.width || !template.canvas?.height) {
    fail("画布尺寸缺失");
  }

  if (!template.focusArea) {
    fail("focus_area 缺失");
  } else {
    const { x, y, width, height } = template.focusArea;
    if (x < 0 || y < 0 || width <= 0 || height <= 0) fail("focus_area 尺寸不合法");
    if (x + width > template.canvas.width || y + height > template.canvas.height) fail("focus_area 超出画布");
  }

  if (!Array.isArray(template.exportSizes) || template.exportSizes.length === 0) {
    fail("导出尺寸缺失");
  } else {
    template.exportSizes.forEach((size) => {
      if (size.mode !== "rerender") fail(`${size.name} 必须使用 rerender 模式`);
      if (size.width <= 0 || size.height <= 0) fail(`${size.name} 尺寸不合法`);
    });
  }

  if (!Array.isArray(template.layers) || template.layers.length === 0) {
    fail("图层缺失");
  } else {
    const hasProduct = template.layers.some((layer) => layer.type === "product");
    const hasText = template.layers.some((layer) => layer.type === "text" || layer.type === "badge");
    if (!hasProduct) fail("至少需要一个商品槽位");
    if (!hasText) fail("至少需要一个文本或标签槽位");
  }

  if (checks.length === 0) {
    checks.push({ type: "size_compliance", passed: true, message: "模板结构校验通过" });
  }

  return checks;
}
