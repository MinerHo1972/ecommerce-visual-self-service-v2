/**
 * Grsai gpt-image-2 图像生成服务。
 *
 * 文档: https://grsai.ai/zh/dashboard/documents/gpt-image
 * 国内直连: https://grsai.dakka.com.cn
 * 海外: https://grsaiapi.com
 *
 * API 流程: POST /v1/draw/completions 提交 → POST /v1/draw/result 轮询
 */

const GRSAI_BASE_URL = process.env.GRSAI_BASE_URL ?? "https://grsai.dakka.com.cn";
const GRSAI_API_KEY = process.env.GRSAI_API_KEY ?? "";
const GRSAI_IMAGE_MODEL = process.env.GRSAI_IMAGE_MODEL ?? "gpt-image-2";

// --- types ---

type GrsaiSubmitResponse = {
  data?: { id: string };
  error?: { message: string };
};

type GrsaiPollResponse = {
  data?: {
    status: "pending" | "processing" | "running" | "succeeded" | "failed";
    results?: Array<{ url: string }>;
    error?: string;
  };
};

// --- public API ---

export async function generateImages(
  prompt: string,
  options?: { aspectRatio?: string; n?: number; urls?: string[] }
): Promise<string[]> {
  if (!GRSAI_API_KEY) throw new Error("GRSAI_API_KEY not configured");

  const aspectRatio = options?.aspectRatio ?? "800x800";
  const n = options?.n ?? 1;
  const urls = options?.urls?.filter(Boolean) ?? [];

  // Step 1: submit
  const submitUrl = `${GRSAI_BASE_URL}/v1/draw/completions`;
  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GRSAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: GRSAI_IMAGE_MODEL,
      prompt,
      aspectRatio,
      n,
      ...(urls.length > 0 ? { urls } : {}),
      webHook: "-1", // async mode: return task id
    }),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`grsai submit ${submitRes.status}: ${body}`);
  }

  const submitJson: GrsaiSubmitResponse = await submitRes.json();
  const taskId = submitJson.data?.id;
  if (!taskId) throw new Error(`grsai: no task id in response`);

  // Step 2: poll (max 300s)
  const pollUrl = `${GRSAI_BASE_URL}/v1/draw/result`;
  let lastPollStatus = "not-started";
  for (let i = 0; i < 60; i++) {
    await sleep(5000);

    const pollRes = await fetch(pollUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GRSAI_API_KEY}`,
      },
      body: JSON.stringify({ id: taskId }),
    });

    if (!pollRes.ok) {
      lastPollStatus = `http ${pollRes.status}: ${await pollRes.text()}`;
      continue;
    }

    const pollJson: GrsaiPollResponse = await pollRes.json();
    const data = pollJson.data;
    if (!data) {
      lastPollStatus = JSON.stringify(pollJson);
      continue;
    }

    lastPollStatus = data.status;
    if (data.status === "succeeded" && data.results) {
      return data.results.map((r) => r.url);
    }
    if (data.status === "failed") {
      throw new Error(`grsai generation failed: ${data.error ?? "unknown"}`);
    }
  }

  throw new Error(`grsai generation timed out for task ${taskId}; last status: ${lastPollStatus}`);
}

export function isGrsaiAvailable(): boolean {
  return Boolean(GRSAI_API_KEY);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
