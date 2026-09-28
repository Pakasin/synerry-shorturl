export type ApiError = { error: { code: string; message: string; details?: unknown } };

export function apiError(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}
