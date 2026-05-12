// packages/shared/src/types/api.ts
// Standard API response shapes used by every endpoint

// All successful responses are wrapped in this shape
export interface ApiSuccess<T> {
  success: true
  data: T
}

// All error responses use this shape
export interface ApiError {
  success: false
  error: {
    message: string
    code: string         // e.g. 'NOT_FOUND', 'UNAUTHORIZED', 'VALIDATION_ERROR'
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// Type guard — use this to check which variant you have:
// if (isApiSuccess(response)) { ... response.data ... }
export function isApiSuccess<T>(res: ApiResponse<T>): res is ApiSuccess<T> {
  return res.success === true
}
