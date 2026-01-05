export type ApiMeta = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

export class ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: ApiMeta;

  constructor(success: boolean, message: string, data?: T, meta?: ApiMeta) {
    this.success = success;
    this.message = message;
    if (data !== undefined) {
      this.data = data;
    }
    if (meta) {
      this.meta = meta;
    }
  }

  static success<T>(message: string, data?: T, meta?: ApiMeta): ApiResponse<T> {
    return new ApiResponse<T>(true, message, data, meta);
  }

  static error(message: string): ApiResponse {
    return new ApiResponse(false, message);
  }
}
