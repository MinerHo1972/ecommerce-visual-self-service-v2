import type { ImageQualityReview, ImageQualityReviewInput, QualityReviewSource } from "../types";
import { getRuntimeConfig } from "../config";
import { getQualityWorkflowAdapter } from "../services/coze-quality-workflow";
import { rdsImageQualityReviewRepository } from "./rds-image-quality-reviews";

export type ImageQualityReviewRepository = {
  createPendingReview(input: ImageQualityReviewInput, reviewSource?: QualityReviewSource): Promise<number>;
  createMockSidecarReview(input: ImageQualityReviewInput): Promise<ImageQualityReview | null>;
  rerunReview(input: ImageQualityReviewInput): Promise<ImageQualityReview | null>;
  getLatestByImage(imageId: number): Promise<ImageQualityReview | null>;
  getLatestByImageIds(imageIds: number[]): Promise<Map<number, ImageQualityReview>>;
  listByWorkflowRun(workflowRunId: string): Promise<ImageQualityReview[]>;
};

const mockReviewStore: ImageQualityReview[] = [];
let nextMockReviewId = 1;

function runDetached(task: () => Promise<void>, context: Record<string, unknown>): void {
  setTimeout(() => {
    task().catch((error) => {
      console.warn("[quality-review] detached sidecar failed", {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, 0);
}

function updateMockReview(reviewId: number, patch: Partial<ImageQualityReview>): ImageQualityReview | null {
  const index = mockReviewStore.findIndex((review) => review.id === reviewId);
  if (index < 0) return null;
  const updated: ImageQualityReview = {
    ...mockReviewStore[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  mockReviewStore[index] = updated;
  return updated;
}

async function processMockReview(reviewId: number, input: ImageQualityReviewInput): Promise<void> {
  updateMockReview(reviewId, { reviewStatus: "running", startedAt: new Date().toISOString() });
  const adapter = getQualityWorkflowAdapter();
  const result = await adapter.reviewImage(input);
  updateMockReview(reviewId, { ...result, reviewSource: "mock" });
}

export const mockImageQualityReviewRepository: ImageQualityReviewRepository = {
  async createPendingReview(input, reviewSource = "mock") {
    const now = new Date().toISOString();
    const review: ImageQualityReview = {
      ...input,
      id: nextMockReviewId++,
      reviewSource,
      reviewStatus: "pending",
      rejectReasons: [],
      retryCount: 0,
      updatedAt: now,
    };
    mockReviewStore.push(review);
    return review.id;
  },

  async createMockSidecarReview(input) {
    const reviewId = await this.createPendingReview(input, "mock");
    const pending = mockReviewStore.find((review) => review.id === reviewId) ?? null;
    runDetached(() => processMockReview(reviewId, input), { reviewId, imageId: input.imageId });
    return pending;
  },

  async rerunReview(input) {
    const reviewId = await this.createPendingReview(input, "mock");
    const pending = mockReviewStore.find((review) => review.id === reviewId) ?? null;
    runDetached(() => processMockReview(reviewId, input), { reviewId, imageId: input.imageId, rerun: true });
    return pending;
  },

  async getLatestByImage(imageId) {
    return mockReviewStore
      .filter((review) => review.imageId === imageId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0] ?? null;
  },

  async getLatestByImageIds(imageIds) {
    const idSet = new Set(imageIds);
    const result = new Map<number, ImageQualityReview>();
    for (const review of mockReviewStore) {
      if (!idSet.has(review.imageId)) continue;
      const existing = result.get(review.imageId);
      if (!existing || review.createdAt.localeCompare(existing.createdAt) > 0 || (review.createdAt === existing.createdAt && review.id > existing.id)) {
        result.set(review.imageId, review);
      }
    }
    return result;
  },

  async listByWorkflowRun(workflowRunId) {
    return mockReviewStore
      .filter((review) => review.workflowRunId === workflowRunId)
      .sort((a, b) => a.imageId - b.imageId || b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  },
};

export const rdsQualityReviewRepository: ImageQualityReviewRepository = {
  async createPendingReview(input, reviewSource = "coze_workflow") {
    return rdsImageQualityReviewRepository.createPendingReview(input, reviewSource);
  },

  async createMockSidecarReview(input) {
    try {
      const reviewId = await rdsImageQualityReviewRepository.createPendingReview(input, "mock");
      const pending = await rdsImageQualityReviewRepository.getById(reviewId);
      runDetached(async () => {
        await rdsImageQualityReviewRepository.markRunning(reviewId);
        const adapter = getQualityWorkflowAdapter();
        const result = await adapter.reviewImage(input);
        await rdsImageQualityReviewRepository.markSucceeded(reviewId, result);
      }, { reviewId, imageId: input.imageId });
      return pending;
    } catch (error) {
      console.warn("[quality-review] rds sidecar unavailable", error instanceof Error ? error.message : String(error));
      return null;
    }
  },

  async rerunReview(input) {
    try {
      const reviewId = await rdsImageQualityReviewRepository.createPendingReview(input, "coze_workflow");
      const pending = await rdsImageQualityReviewRepository.getById(reviewId);
      runDetached(async () => {
        await rdsImageQualityReviewRepository.markRunning(reviewId);
        const adapter = getQualityWorkflowAdapter();
        const result = await adapter.reviewImage(input);
        if (result.reviewStatus === "succeeded") {
          await rdsImageQualityReviewRepository.markSucceeded(reviewId, result);
        } else {
          await rdsImageQualityReviewRepository.markFailed(reviewId, {
            status: result.reviewStatus === "timeout" || result.reviewStatus === "skipped" ? result.reviewStatus : "failed",
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            finishedAt: result.finishedAt,
          });
        }
      }, { reviewId, imageId: input.imageId, rerun: true });
      return pending;
    } catch (error) {
      console.warn("[quality-review] rerun unavailable", {
        imageId: input.imageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async getLatestByImage(imageId) {
    try {
      return await rdsImageQualityReviewRepository.getLatestByImage(imageId);
    } catch (error) {
      console.warn("[quality-review] latest review unavailable", {
        imageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async getLatestByImageIds(imageIds) {
    if (imageIds.length === 0) return new Map();
    try {
      return await rdsImageQualityReviewRepository.getLatestByImageIds(imageIds);
    } catch (error) {
      console.warn("[quality-review] batch latest reviews unavailable", {
        count: imageIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map();
    }
  },

  async listByWorkflowRun(workflowRunId) {
    try {
      return await rdsImageQualityReviewRepository.listByWorkflowRun(workflowRunId);
    } catch (error) {
      console.warn("[quality-review] workflow reviews unavailable", {
        workflowRunId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  },
};

export function getImageQualityReviewRepository(): ImageQualityReviewRepository {
  const config = getRuntimeConfig();
  return config.generationJobRepositoryMode === "rds" ? rdsQualityReviewRepository : mockImageQualityReviewRepository;
}
