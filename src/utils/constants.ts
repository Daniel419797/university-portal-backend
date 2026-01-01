export const USER_ROLES = {
  STUDENT: 'student',
  LECTURER: 'lecturer',
  ADMIN: 'admin',
  HOD: 'hod',
  BURSARY: 'bursary',
} as const;

export const PAYMENT_TYPES = {
  TUITION: 'tuition',
  HOSTEL: 'hostel',
  LIBRARY: 'library',
  MEDICAL: 'medical',
  SPORTS: 'sports',
  EXAM: 'exam',
  LATE_REGISTRATION: 'late_registration',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  PROCESSING: 'processing',
} as const;

export const NOTIFICATION_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

export const APPLICATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ALLOCATED: 'allocated',
} as const;

export const SEMESTERS = {
  FIRST: 'first',
  SECOND: 'second',
} as const;

export const TWO_FACTOR_METHODS = {
  TOTP: 'totp',
  EMAIL: 'email',
} as const;

export const GRADE_POINTS: { [key: string]: number } = {
  A: 5.0,
  B: 4.0,
  C: 3.0,
  D: 2.0,
  E: 1.0,
  F: 0.0,
};

export const SALT_ROUNDS = 12;
export const MAX_LOGIN_ATTEMPTS = 5;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';
export const PASSWORD_RESET_EXPIRY = 3600000; // 1 hour in ms
export const EMAIL_VERIFICATION_EXPIRY = 86400000; // 24 hours in ms
export const OTP_EXPIRY = 300; // 5 minutes in seconds
