export class ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };

  constructor(success: boolean, message: string, data?: T, meta?: any) {
    this.success = success;
    this.message = message;
    if (data !== undefined) {
      this.data = data;
    }
    if (meta) {
      this.meta = meta;
    }
  }

  static success<T>(message: string, data?: T, meta?: any): ApiResponse<T> {
    return new ApiResponse<T>(true, message, data, meta);
  }

  static error(message: string): ApiResponse {
    return new ApiResponse(false, message);
  }
}
