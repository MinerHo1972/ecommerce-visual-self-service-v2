export type ApiError = {
  code: string;
  message: string;
  details?: unknown[];
};

export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  request_id: string;
};

export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null, request_id: createRequestId() };
}

export function fail(code: string, message: string, details: unknown[] = []): ApiResponse<never> {
  return { success: false, data: null, error: { code, message, details }, request_id: createRequestId() };
}
