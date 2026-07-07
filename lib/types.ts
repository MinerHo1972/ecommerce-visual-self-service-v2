export type AssetStatus = "draft" | "active" | "inactive" | "archived";

export type LayerType = "background" | "product" | "text" | "badge" | "logo" | "shape";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SafeMargin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ExportSize = {
  name: string;
  width: number;
  height: number;
  mode: "rerender";
  crop?: "focus_area" | "center";
};

export type TextStyle = {
  fontFamily: string;
  baseSize: number;
  minSize: number;
  weight?: string;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  letterSpacing?: number;
  autoShrink?: boolean;
  maxChars?: number;
};

type BaseLayer = {
  id: string;
  type: LayerType;
  zIndex: number;
  editable?: boolean;
  visible?: boolean;
};

export type BackgroundLayer = BaseLayer & {
  type: "background";
  fill?: string;
  gradient?: {
    angle: number;
    stops: Array<{ offset: number; color: string }>;
  };
  imageOssKey?: string;
};

export type ProductLayer = BaseLayer & {
  type: "product";
  area: Rect;
  fitMode: "contain" | "cover";
  placeholderFill?: string;
  shadow?: { blur: number; color: string; offsetX: number; offsetY: number };
  focusArea?: FocusArea;
};

export type TextLayer = BaseLayer & {
  type: "text";
  area: Rect;
  textKey: string;
  defaultText: string;
  style: TextStyle;
};

export type BadgeLayer = BaseLayer & {
  type: "badge";
  area: Rect;
  textKey: string;
  defaultText: string;
  fill: string;
  radius: number;
  style: TextStyle;
};

export type LogoLayer = BaseLayer & {
  type: "logo";
  area: Rect;
  text?: string;
  imageOssKey?: string;
};

export type ShapeLayer = BaseLayer & {
  type: "shape";
  shape: "rect" | "circle";
  area: Rect;
  fill: string;
  radius?: number;
};

export type TemplateLayer =
  | BackgroundLayer
  | ProductLayer
  | TextLayer
  | BadgeLayer
  | LogoLayer
  | ShapeLayer;

export type LayerTemplateJson = {
  canvas: { width: number; height: number };
  focusArea: Rect & { layerId?: string };
  safeMargin: SafeMargin;
  exportSizes: ExportSize[];
  layers: TemplateLayer[];
};

export type PromptTemplate = {
  id: number;
  name: string;
  scene: string;
  platform?: string;
  promptSkeleton: string;
  variables: Array<{ key: string; label: string; type: "text" | "select"; default?: string; required?: boolean }>;
  tags: string[];
  status: AssetStatus;
};

export type LayerTemplate = {
  id: number;
  name: string;
  category: string;
  canvasWidth: number;
  canvasHeight: number;
  templateJson: LayerTemplateJson;
  tags: string[];
  status: AssetStatus;
  version: number;
};

export type RenderInputs = {
  [key: string]: string | FocusArea | Record<string, FocusArea> | undefined;
  productImageDataUrl?: string;
  backgroundImageDataUrl?: string;
  productFocusArea?: FocusArea;
  focusAreas?: Record<string, FocusArea>;
};

export type QualityCheck = {
  type: "text_overflow" | "size_compliance";
  passed: boolean;
  message: string;
  layerId?: string;
};

export type RenderResult = {
  dataUrl: string;
  width: number;
  height: number;
  checks: QualityCheck[];
};

export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "archived" | "deleted";

export type GenerationJob = {
  id: string;
  status: GenerationStatus;
  templateId: number;
  candidateCount: number;
  createdAt: string;
};

export type CreateGenerationJobPayload = {
  templateId: number;
  templateName: string;
  inputs: Record<string, unknown>;
  exportSize?: { name: string; width: number; height: number };
  candidateCount?: number;
};

export type GenerationOperationTrace = {
  provider: "grsai" | "mock" | "unknown";
  operationMode: string;
  workflowType: string;
  constraintPreset: string;
  prompt: string;
  referenceUrls: string[];
  referenceImageHashes: string[];
  size: string;
  count: number;
  parentImageId?: number | string | null;
  createdAt: string;
};

export type GeneratedImage = {
  id: number;
  jobId: string;
  templateId: number;
  templateName: string;
  title: string;
  scene: string;
  platform: string;
  ossKey: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  status: GenerationStatus;
  selected: boolean;
  tags: string[];
  createdAt: string;
  workflowType?: string | null;
  workflowRunId?: string | null;
  workflowStep?: string | null;
  parentImageId?: number | null;
  parentAssetType?: string | null;
  humanDecision?: string | null;
  /** Snapshot of the original inputs used when creating this image. */
  inputsSnapshot?: Record<string, unknown>;
  /** Snapshot of the final generation request sent to the image provider. */
  operationTrace?: GenerationOperationTrace;
};

export type QualityReviewSource = "coze_workflow" | "manual" | "mock" | "offline_batch";

export type QualityReviewStatus = "pending" | "running" | "succeeded" | "failed" | "timeout" | "skipped";

export type QualityStatus = "pass" | "fail" | "review";

export type QualitySuggestedAction = "accept" | "retry" | "manual_review";

export type QualityHumanDecision = "accepted" | "rejected" | "overridden" | "ignored";

export type QualityRejectReason =
  | "product_shape_changed"
  | "product_count_mismatch"
  | "template_layout_drift"
  | "template_text_drift"
  | "brand_style_mismatch"
  | "visual_artifact"
  | "low_confidence"
  | "missing_trace"
  | "unreadable_image";

export type QualityVlmScores = {
  productFidelity: number;
  brandCompliance: number;
  templateFidelity: number;
  visualQuality: number;
  productCount: number;
};

export type ImageQualityReviewInput = {
  imageId: number;
  candidateImageUrl: string;
  workflowRunId?: string | null;
  workflowType?: string | null;
  workflowStep?: string | null;
  promptTrace?: GenerationOperationTrace | null;
  referenceImages: string[];
  referenceImageHashes: string[];
  constraintPreset?: string | null;
  inputsSnapshot?: Record<string, unknown>;
  createdAt: string;
};

export type ImageQualityReviewResult = {
  imageId: number;
  reviewStatus: QualityReviewStatus;
  qualityStatus?: QualityStatus;
  confidence?: number;
  vlmScores?: QualityVlmScores;
  rejectReasons: QualityRejectReason[];
  suggestedAction?: QualitySuggestedAction;
  cozeWorkflowRunId?: string | null;
  rawTraceUrl?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string;
  finishedAt?: string;
};

export type ImageQualityReview = ImageQualityReviewInput & ImageQualityReviewResult & {
  id: number;
  reviewSource: QualityReviewSource;
  humanDecision?: QualityHumanDecision | null;
  humanRejectReason?: string | null;
  humanReviewer?: string | null;
  retryCount: number;
  updatedAt: string;
};

export type QualityWorkflowAdapter = {
  reviewImage(input: ImageQualityReviewInput): Promise<ImageQualityReviewResult>;
};

/** Compact quality status for display on history cards. */
export type QualityBadge = {
  reviewStatus: QualityReviewStatus;
  qualityStatus?: QualityStatus;
  confidence?: number;
  suggestedAction?: QualitySuggestedAction;
  reviewSource: QualityReviewSource;
};

export type WorkflowLineageRole = "parent" | "current" | "sibling" | "child";

export type WorkflowLineageNode = {
  image: GeneratedImage;
  role: WorkflowLineageRole;
  roleLabel: string;
  modeLabel: string;
  sourceLabel: string;
  feedback: string | null;
  parentImageId: number | null;
};

export type WorkflowLineageSection = {
  key: "parent" | "current" | "siblings" | "children";
  title: string;
  description: string;
  emptyText: string;
  nodes: WorkflowLineageNode[];
};

export type WorkflowLineageViewModel = {
  currentImageId: number;
  job: Pick<GenerationJob, "id" | "status" | "templateId" | "candidateCount" | "createdAt"> | null;
  run: {
    workflowRunId: string | null;
    workflowType: string | null;
    workflowStep: string | null;
    summaryText: string;
  };
  qualityReview?: ImageQualityReview | null;
  sections: WorkflowLineageSection[];
  summary: {
    hasParent: boolean;
    siblingCount: number;
    childCount: number;
    emptySections: Array<WorkflowLineageSection["key"]>;
  };
};

/** Normalized focus area (0-1) relative to source image dimensions. */
export type FocusArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};
