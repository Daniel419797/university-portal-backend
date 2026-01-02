import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import notificationService from '../services/notification.service';

const DEFAULT_DEPARTMENTS: DepartmentEntry[] = [
  {
    name: 'Library',
    description: 'Ensure all borrowed books are returned and fines cleared',
    status: 'pending',
    required: true,
  },
  {
    name: 'Bursary',
    description: 'Confirm all outstanding fees have been paid',
    status: 'pending',
    required: true,
  },
  {
    name: 'Department',
    description: 'Departmental clearance from HOD',
    status: 'pending',
    required: true,
  },
  {
    name: 'Hostel',
    description: 'Hostel clearance (if applicable)',
    status: 'pending',
    required: false,
  },
  {
    name: 'Security',
    description: 'Security clearance and ID card return',
    status: 'pending',
    required: true,
  },
];

const getCurrentAcademicYear = () => '2024/2025';

type DepartmentEntry = {
  name: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  required: boolean;
  comment?: string;
  approved_by?: string;
  approved_at?: string;
};

type DocumentRequest = {
  documentType: string;
  purpose: string;
  deliveryMethod: string;
  urgency: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
};

type ClearanceRecord = {
  id: string;
  student: string;
  academic_year: string;
  semester: string;
  departments: DepartmentEntry[];
  document_requests: DocumentRequest[];
  overall_status?: 'in-progress' | 'completed' | 'rejected';
  completed_at?: string | null;
};

const ensureClearanceRecord = async (studentId: string): Promise<ClearanceRecord> => {
  const db = supabaseAdmin();
  const { data: existing, error } = await db
    .from('clearance')
    .select('id, student, academic_year, semester, departments, document_requests, overall_status, completed_at')
    .eq('student', studentId)
    .eq('academic_year', getCurrentAcademicYear())
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to read clearance: ${error.message}`);
  if (existing) return existing as ClearanceRecord;

  const initialDepartments: DepartmentEntry[] = DEFAULT_DEPARTMENTS.map((d) => ({ ...d }));
  const { data: inserted, error: insertErr } = await db
    .from('clearance')
    .insert({
      student: studentId,
      academic_year: getCurrentAcademicYear(),
      semester: 'Second Semester',
      departments: initialDepartments,
      document_requests: [],
      overall_status: 'in-progress',
      completed_at: null,
    })
    .select()
    .single();
  if (insertErr) throw ApiError.internal(`Unable to initialize clearance record: ${insertErr.message}`);
  return inserted as ClearanceRecord;
};

const recomputeOverallStatus = (clearance: ClearanceRecord) => {
  const deptStatuses = clearance.departments.map((dept) => dept.status);
  if (deptStatuses.every((status) => status === 'approved')) {
    clearance.overall_status = 'completed';
    clearance.completed_at = new Date().toISOString();
  } else if (deptStatuses.includes('rejected')) {
    clearance.overall_status = 'rejected';
    clearance.completed_at = null;
  } else {
    clearance.overall_status = 'in-progress';
    clearance.completed_at = null;
  }
};

// @desc    Get student clearance status
// @route   GET /api/v1/students/clearance
// @access  Private (Student)
export const getStudentClearance = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) throw ApiError.unauthorized('User not authenticated');
  const clearance = await ensureClearanceRecord(userId);

  res.json(
    ApiResponse.success('Clearance status fetched successfully', clearance)
  );
});

// @desc    Request clearance document
// @route   POST /api/v1/students/clearance/documents/request
// @access  Private (Student)
export const requestClearanceDocument = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { documentType, purpose, deliveryMethod, urgency } = req.body;

  if (!userId) throw ApiError.unauthorized('User not authenticated');
  const clearance = await ensureClearanceRecord(userId);

  const newRequest: DocumentRequest = {
    documentType,
    purpose,
    deliveryMethod,
    urgency: urgency || 'normal',
    status: 'pending',
    requestedAt: new Date().toISOString(),
  };

  const nextRequests = [...(clearance.document_requests || []), newRequest];
  const db = supabaseAdmin();
  const { error } = await db
    .from('clearance')
    .update({ document_requests: nextRequests })
    .eq('id', clearance.id);
  if (error) throw ApiError.internal(`Failed to update clearance: ${error.message}`);

  res.status(201).json(ApiResponse.success('Document request submitted successfully', newRequest));
});

// @desc    Get all clearance requests (Admin)
// @route   GET /api/v1/admin/clearance
// @access  Private (Admin)
export const getAllClearanceRequests = asyncHandler(async (req: Request, res: Response) => {
  const { status, department, page = 1, limit = 20 } = req.query;

  const db = supabaseAdmin();
  const pageNum = Number(page) || 1;
  const limitNum = Math.min(Number(limit) || 20, 100);
  const from = (pageNum - 1) * limitNum;
  const to = from + limitNum - 1;

  let query = db.from('clearance').select('id, student, academic_year, semester, departments, overall_status, completed_at');
  if (status) query = query.eq('overall_status', String(status));
  if (department) query = query.contains('departments', [{ name: String(department) }]);
  query = query.order('academic_year', { ascending: false }).range(from, to);

  const [{ data: clearances, error }, totalResp] = await Promise.all([
    query,
    db.from('clearance').select('id', { count: 'exact', head: true }).match(
      department ? { overall_status: String(status), departments: [{ name: String(department) }] } : status ? { overall_status: String(status) } : {}
    ),
  ]);
  if (error) throw ApiError.internal(`Failed to fetch clearance requests: ${error.message}`);

  res.json(
    ApiResponse.success('Clearance requests fetched successfully', {
      requests: clearances || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalResp.count || 0,
        totalPages: Math.ceil((totalResp.count || 0) / limitNum),
      }
    })
  );
});

// @desc    Get clearance request details (Admin)
// @route   GET /api/v1/admin/clearance/:id
// @access  Private (Admin)
export const getClearanceDetails = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const db = supabaseAdmin();
  const { data: clearance, error } = await db
    .from('clearance')
    .select('id, student, academic_year, semester, departments, document_requests, overall_status, completed_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch clearance: ${error.message}`);
  if (!clearance) throw ApiError.notFound('Clearance request not found');
  res.json(ApiResponse.success('Clearance details fetched successfully', clearance));
});

// @desc    Update department clearance status
// @route   POST /api/v1/admin/clearance/:id/departments
// @access  Private (Admin)
export const updateDepartmentStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const { departmentName, status, comment } = req.body;

  if (!userId) throw ApiError.unauthorized('User not authenticated');
  const db = supabaseAdmin();
  const { data: clearance, error } = await db
    .from('clearance')
    .select('id, student, departments, overall_status, completed_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch clearance: ${error.message}`);
  if (!clearance) throw ApiError.notFound('Clearance request not found');

  const department = (clearance.departments as DepartmentEntry[]).find((dept) => dept.name === departmentName);
  if (!department) throw ApiError.badRequest('Department not found in clearance workflow');

  department.status = status;
  department.comment = comment;
  department.approved_by = userId;
  department.approved_at = new Date().toISOString();

  const next: ClearanceRecord = { ...(clearance as ClearanceRecord), departments: clearance.departments as DepartmentEntry[] };
  recomputeOverallStatus(next);
  const { error: updErr } = await db
    .from('clearance')
    .update({ departments: next.departments, overall_status: next.overall_status, completed_at: next.completed_at })
    .eq('id', next.id);
  if (updErr) throw ApiError.internal(`Failed to update clearance: ${updErr.message}`);

  await notificationService.createNotification(
    (clearance as ClearanceRecord).student,
    'info',
    'Clearance Update',
    `${departmentName} department ${status === 'approved' ? 'approved' : 'updated'} your clearance status`,
    `/clearance/${(clearance as ClearanceRecord).id}`
  );

  res.json(
    ApiResponse.success('Department status updated successfully', next)
  );
});

// @desc    Approve clearance request (overall)
// @route   POST /api/v1/admin/clearance/:id/approve
// @access  Private (Admin)
export const approveClearance = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const { comment } = req.body;

  if (!userId) throw ApiError.unauthorized('User not authenticated');
  const db = supabaseAdmin();
  const { data: clearance, error } = await db.from('clearance').select('id, student, departments').eq('id', id).maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch clearance: ${error.message}`);
  if (!clearance) throw ApiError.notFound('Clearance request not found');

  const departments = (clearance.departments as DepartmentEntry[]).map((dept) => ({
    ...dept,
    status: 'approved',
    comment: comment || dept.comment,
    approved_by: userId,
    approved_at: new Date().toISOString(),
  }));

  const { error: updErr } = await db
    .from('clearance')
    .update({ departments, overall_status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', (clearance as ClearanceRecord).id);
  if (updErr) throw ApiError.internal(`Failed to approve clearance: ${updErr.message}`);

  await notificationService.createNotification(
    (clearance as ClearanceRecord).student,
    'success',
    'Clearance Completed',
    'Congratulations! Your clearance process has been completed successfully.',
    `/clearance/${(clearance as ClearanceRecord).id}`
  );

  res.json(
    ApiResponse.success('Clearance approved successfully', { id: (clearance as ClearanceRecord).id, departments, overall_status: 'completed' })
  );
});

// @desc    Reject clearance request (overall)
// @route   POST /api/v1/admin/clearance/:id/reject
// @access  Private (Admin)
export const rejectClearance = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const { reason, departmentName } = req.body;

  if (!userId) throw ApiError.unauthorized('User not authenticated');
  const db = supabaseAdmin();
  const { data: clearance, error } = await db.from('clearance').select('id, student, departments').eq('id', id).maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch clearance: ${error.message}`);
  if (!clearance) throw ApiError.notFound('Clearance request not found');

  let departments = clearance.departments as DepartmentEntry[];
  if (departmentName) {
    departments = departments.map((dept) =>
      dept.name === departmentName
        ? { ...dept, status: 'rejected', comment: reason, approved_by: userId, approved_at: new Date().toISOString() }
        : dept
    );
  }

  const { error: updErr } = await db
    .from('clearance')
    .update({ departments, overall_status: 'rejected', completed_at: null })
    .eq('id', (clearance as ClearanceRecord).id);
  if (updErr) throw ApiError.internal(`Failed to reject clearance: ${updErr.message}`);

  await notificationService.createNotification(
    (clearance as ClearanceRecord).student,
    'warning',
    'Clearance Update',
    `Your clearance request was rejected${reason ? `: ${reason}` : ''}`,
    `/clearance/${(clearance as ClearanceRecord).id}`
  );

  res.json(
    ApiResponse.success('Clearance rejected successfully', { id: (clearance as ClearanceRecord).id, departments, overall_status: 'rejected' })
  );
});

