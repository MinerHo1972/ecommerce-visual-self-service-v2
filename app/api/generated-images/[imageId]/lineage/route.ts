import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";
import { getImageQualityReviewRepository } from "@/lib/repositories/image-quality-reviews";
import type { GeneratedImage, WorkflowLineageNode, WorkflowLineageRole, WorkflowLineageSection } from "@/lib/types";

type RawLineageNode = {
  image: GeneratedImage;
  role: WorkflowLineageRole;
};

const roleLabels: Record<WorkflowLineageRole, string> = {
  parent: "上一步输入",
  current: "当前产物",
  sibling: "同批候选",
  child: "后续分支",
};

function readNumericInput(image: GeneratedImage, key: string): number | null {
  if (key === "parentImageId" && image.parentImageId) return image.parentImageId;
  const value = image.inputsSnapshot?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getModeLabel(image: GeneratedImage): string {
  if (image.workflowType === "partial_repaint") return "局部重绘";
  if (image.workflowType === "template_text_edit") return "模板改文字";
  if (image.workflowType === "template_replace") return image.workflowStep === "human_selected_iteration" ? "继续优化" : "模板换产品";
  const mode = image.inputsSnapshot?.mode;
  if (mode === "partial_repaint") return "局部重绘";
  if (mode === "template_text_edit") return "模板改文字";
  if (mode === "template_replace") return "模板换产品";
  return "标准生成";
}

function getSourceLabel(image: GeneratedImage): string {
  if (image.operationTrace?.workflowType) return image.operationTrace.workflowType;
  if (image.workflowType === "partial_repaint") return "局部重绘";
  if (image.workflowType === "template_text_edit") return "文字修改";
  if (image.workflowType === "template_replace") return image.workflowStep === "human_selected_iteration" ? "历史生成继续优化" : "商品图套模板";

  const mode = typeof image.inputsSnapshot?.mode === "string" ? image.inputsSnapshot.mode : null;
  if (image.tags.includes("partial_repaint") || mode === "partial_repaint") return "局部重绘";
  if (image.tags.includes("template_text_edit") || mode === "template_text_edit") return "文字修改";
  if (image.tags.includes("iteration") || image.tags.some((tag) => tag.startsWith("parent:")) || image.inputsSnapshot?.parentImageId) return "历史生成继续优化";
  if (image.tags.includes("template_replace") || image.templateName) return "商品图套模板";
  return "历史生成";
}

function getFeedback(image: GeneratedImage): string | null {
  return image.tags.find((tag) => tag.startsWith("feedback:"))?.replace("feedback:", "") ?? null;
}

function normalizeNode(node: RawLineageNode): WorkflowLineageNode {
  return {
    ...node,
    roleLabel: roleLabels[node.role],
    modeLabel: getModeLabel(node.image),
    sourceLabel: getSourceLabel(node.image),
    feedback: getFeedback(node.image),
    parentImageId: readNumericInput(node.image, "parentImageId"),
  };
}

function buildSections(nodes: WorkflowLineageNode[]): WorkflowLineageSection[] {
  const byRole = (role: WorkflowLineageRole) => nodes.filter((node) => node.role === role);
  return [
    {
      key: "parent",
      title: "上一步输入",
      description: "这张图如果来自继续优化或局部重绘，这里展示被引用的父图。",
      emptyText: "没有上一步输入，这是一次首轮生成或旧数据未记录父图。",
      nodes: byRole("parent"),
    },
    {
      key: "current",
      title: "当前产物",
      description: "当前正在查看的图片，是这次运行路径的中心节点。",
      emptyText: "当前产物不存在。",
      nodes: byRole("current"),
    },
    {
      key: "siblings",
      title: "同批候选",
      description: "同一个生成任务里一起抽出的其他候选图。",
      emptyText: "没有同批候选，可能这次只生成了 1 张图。",
      nodes: byRole("sibling"),
    },
    {
      key: "children",
      title: "后续分支",
      description: "基于当前图继续优化、局部重绘或改文字产生的新图。",
      emptyText: "暂时没有后续分支。",
      nodes: byRole("child"),
    },
  ];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const id = Number(imageId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "imageId must be a positive number"),
        { status: 400 }
      );
    }

    const repository = getGenerationJobRepository();
    const current = await repository.getGeneratedImage(id);
    if (!current) {
      return NextResponse.json(
        fail("NOT_FOUND", `Generated image ${imageId} not found`),
        { status: 404 }
      );
    }

    const currentJob = await repository.getJob(current.jobId);
    const parentImageId = readNumericInput(current, "parentImageId");
    const parent = parentImageId ? await repository.getGeneratedImage(parentImageId) : null;
    const recentImages = await repository.listGeneratedImages({ page: 1, pageSize: 100 });
    const children = recentImages.items.filter((image) => readNumericInput(image, "parentImageId") === current.id);
    const siblings = (currentJob?.images ?? []).filter((image) => image.id !== current.id);

    const nodes: RawLineageNode[] = [
      ...(parent ? [{ image: parent, role: "parent" as const }] : []),
      { image: current, role: "current" },
      ...siblings.map((image) => ({ image, role: "sibling" as const })),
      ...children.map((image) => ({ image, role: "child" as const })),
    ];

    const normalizedNodes = nodes.map(normalizeNode);
    const sections = buildSections(normalizedNodes);
    const emptySections = sections.filter((section) => section.nodes.length === 0).map((section) => section.key);
    const job = currentJob?.job ?? null;
    const qualityReview = await getImageQualityReviewRepository().getLatestByImage(current.id);

    return NextResponse.json(ok({
      currentImageId: current.id,
      job,
      qualityReview,
      run: {
        workflowRunId: current.workflowRunId ?? current.jobId ?? null,
        workflowType: current.workflowType ?? current.operationTrace?.workflowType ?? null,
        workflowStep: current.workflowStep ?? null,
        summaryText: `${getModeLabel(current)} · ${getSourceLabel(current)}`,
      },
      sections,
      nodes: normalizedNodes,
      summary: {
        hasParent: Boolean(parent),
        siblingCount: siblings.length,
        childCount: children.length,
        emptySections,
      },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to get image lineage"),
      { status: 500 }
    );
  }
}
