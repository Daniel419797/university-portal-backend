export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface QueryFilter {
  [key: string]: any;
}

export type UserRole = 'student' | 'lecturer' | 'admin' | 'hod' | 'bursary';
export type PaymentType = 'tuition' | 'hostel' | 'library' | 'medical' | 'sports' | 'exam' | 'late_registration';
export type PaymentStatus = 'pending' | 'verified' | 'rejected' | 'processing';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'allocated';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type TwoFactorMethod = 'totp' | 'email';
export type Semester = 'first' | 'second';
export type Gender = 'male' | 'female' | 'mixed';

export interface FileUpload {
  url: string;
  name: string;
  size: number;
  cloudinaryId?: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: any[];
}
