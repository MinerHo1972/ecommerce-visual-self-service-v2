import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type RuntimeSettings = {
  qualityReviewEnabled?: boolean;
};

const SETTINGS_PATH = join(process.cwd(), ".runtime-settings.json");

export function getRuntimeSettings(): RuntimeSettings {
  if (!existsSync(SETTINGS_PATH)) return {};

  try {
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    const settings = JSON.parse(raw) as RuntimeSettings;
    return {
      qualityReviewEnabled: typeof settings.qualityReviewEnabled === "boolean" ? settings.qualityReviewEnabled : undefined,
    };
  } catch {
    return {};
  }
}

export function updateRuntimeSettings(next: RuntimeSettings): RuntimeSettings {
  const current = getRuntimeSettings();
  const settings: RuntimeSettings = {
    ...current,
    ...next,
  };

  writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settings;
}
