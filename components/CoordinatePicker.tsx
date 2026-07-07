"use client";

import type { LayerTemplateJson, Rect, TemplateLayer } from "@/lib/types";

type CoordinatePickerProps = {
  template: LayerTemplateJson;
  targetLayerId: string;
  points: Array<{ x: number; y: number }>;
  onPick: (point: { x: number; y: number }) => void;
};

function getLayerArea(layer: TemplateLayer): Rect | null {
  if ("area" in layer) return layer.area;
  return null;
}

function rectFromPoints(points: Array<{ x: number; y: number }>): Rect | null {
  if (points.length < 2) return null;
  const [a, b] = points;
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}

function toPercent(rect: Rect, canvas: { width: number; height: number }) {
  return {
    left: `${(rect.x / canvas.width) * 100}%`,
    top: `${(rect.y / canvas.height) * 100}%`,
    width: `${(rect.width / canvas.width) * 100}%`,
    height: `${(rect.height / canvas.height) * 100}%`
  };
}

export function CoordinatePicker({ template, targetLayerId, points, onPick }: CoordinatePickerProps) {
  const draftRect = rectFromPoints(points);

  return (
    <div
      className="coordinate-canvas"
      style={{ aspectRatio: `${template.canvas.width} / ${template.canvas.height}` }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = Math.round(((event.clientX - bounds.left) / bounds.width) * template.canvas.width);
        const y = Math.round(((event.clientY - bounds.top) / bounds.height) * template.canvas.height);
        onPick({ x, y });
      }}
    >
      {template.layers.map((layer) => {
        const area = getLayerArea(layer);
        if (!area) return null;
        const isTarget = layer.id === targetLayerId;
        return (
          <div
            aria-label={layer.id}
            className={`coordinate-layer ${isTarget ? "target" : ""}`}
            key={layer.id}
            style={toPercent(area, template.canvas)}
          >
            <span>{layer.id}</span>
          </div>
        );
      })}
      {draftRect && <div className="coordinate-draft" style={toPercent(draftRect, template.canvas)} />}
      {points.map((point, index) => (
        <span
          className="point-marker"
          key={`${point.x}-${point.y}-${index}`}
          style={{ left: `${(point.x / template.canvas.width) * 100}%`, top: `${(point.y / template.canvas.height) * 100}%` }}
        >
          {index + 1}
        </span>
      ))}
    </div>
  );
}
