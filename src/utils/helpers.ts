import crypto from 'crypto';

export const generateRandomToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const generateOTP = (length = 6): string => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

export const calculateGrade = (score: number): string => {
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 45) return 'D';
  if (score >= 40) return 'E';
  return 'F';
};

export const calculateGPA = (
  results: Array<{ totalScore: number; gradePoints: number; credits: number }>
): number => {
  if (results.length === 0) return 0;
  const totalPoints = results.reduce(
    (sum, result) => sum + result.gradePoints * result.credits,
    0
  );
  const totalCredits = results.reduce((sum, result) => sum + result.credits, 0);
  return totalCredits > 0 ? parseFloat((totalPoints / totalCredits).toFixed(2)) : 0;
};

export const generateStudentId = (departmentCode: string, year: number): string => {
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `${departmentCode}${year}${random}`;
};

export const generateReference = (prefix: string): string => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `${prefix}-${timestamp}-${random}`;
};

export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
