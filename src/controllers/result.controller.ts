// =============================================================================
// MIGRATION STATUS: AUTO-CONVERTED - REQUIRES MANUAL REVIEW
// =============================================================================
// This file has been automatically migrated from MongoDB to Supabase.
// Search for /* MIGRATE: */ comments to find areas needing manual completion.
// 
// Key changes needed:
// 1. Complete query conversions (findById, find, create, etc.)
// 2. Add error handling for Supabase queries
// 3. Convert .populate() to JOIN syntax
// 4. Update field names (camelCase -> snake_case)
// 5. Test all endpoints
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import notificationService from '../services/notification.service';
import { USER_ROLES, GRADE_POINTS } from '../utils/constants';
import { calculateGrade, calculateGPA } from '../utils/helpers';

interface CourseRow { id: string; name: string; credits: number }
interface SessionRow { id: string; name: string }
interface ResultRow {
  id: string;
  student_id: string;
  course_id: string;
  session_id: string;
  semester: string;
  ca_score: number;
  exam_score: number;
  total_score: number;
  grade: string;
  grade_points: number;
  entered_by: string;
  approved_by_hod: boolean;
  approved_by_admin: boolean;
  status?: string;
  hod_approved_by?: string | null;
  hod_approved_at?: string | null;
  admin_approved_by?: string | null;
  admin_approved_at?: string | null;
  published_at?: string | null;
  courses?: CourseRow;
  sessions?: SessionRow;
}
const resolveUserId = (reqUser: UserLike | undefined): string | undefined => {
  if (!reqUser) return undefined;
  return reqUser.userId || reqUser._id?.toString() || reqUser.id;
};

const buildTranscriptPayload = async (requester: UserLike | undefined, studentId?: string) => {
  const db = supabaseAdmin();
  if (!studentId) throw ApiError.badRequest('Student ID is required');
  const requesterId = resolveUserId(requester);
  if (requester?.role === USER_ROLES.STUDENT && requesterId !== studentId)
    throw ApiError.forbidden('You can only access your own transcript');

  const { data: student, error: studentErr } = await db
    .from('profiles')
    .select('id, first_name, last_name, email, student_id')
    .eq('id', studentId)
    .maybeSingle();
  if (studentErr) throw ApiError.internal(`Failed to fetch student: ${studentErr.message}`);
  if (!student) throw ApiError.notFound('Student not found');

  const { data: results, error: resErr } = await db
    .from('results')
    .select('*, courses:courses(credits, name), sessions:sessions(name)')
    .eq('student_id', studentId)
    .eq('approved_by_hod', true)
    .eq('approved_by_admin', true)
    .eq('status', 'approved');
  if (resErr) throw ApiError.internal(`Failed to fetch results: ${resErr.message}`);

  const grouped: Record<string, { session: string; semester: string; results: ResultRow[]; gpa?: number }> = {};
  (results || []).forEach((rr) => {
    const r = rr as ResultRow;
    const sessionName = r.sessions?.name || '';
    const key = `${sessionName}-${r.semester}`;
    if (!grouped[key]) grouped[key] = { session: sessionName, semester: r.semester, results: [] };
    grouped[key].results.push(r);
  });
  Object.keys(grouped).forEach((key) => {
    const g = grouped[key];
    g.gpa = calculateGPA(g.results.map((r) => ({ totalScore: r.total_score, gradePoints: r.grade_points, credits: r.courses?.credits || 0 })));
  });

  const cgpa = calculateGPA((results || []).map((rr) => {
    const r = rr as ResultRow;
    return { totalScore: r.total_score, gradePoints: r.grade_points, credits: r.courses?.credits || 0 };
  }));

  return {
    student: { id: student.id, name: `${student.first_name} ${student.last_name}`, email: student.email, student_id: student.student_id || '' },
    grouped: Object.values(grouped),
    cgpa,
    totalCourses: (results || []).length,
    totalCredits: (results || []).reduce((sum, rr) => sum + ((rr as ResultRow).courses?.credits || 0), 0),
  };
};

export const createResult = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { student, course, session, semester, caScore, examScore } = req.body as {
    student: string; course: string; session: string; semester: string; caScore: number; examScore: number;
  };
  const userId = resolveUserId(req.user);
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const [studentExists, courseExists, sessionExists] = await Promise.all([
    db.from('profiles').select('id').eq('id', student).maybeSingle(),
    db.from('courses').select('id').eq('id', course).maybeSingle(),
    db.from('sessions').select('id').eq('id', session).maybeSingle(),
  ]);
  if (!studentExists.data) throw ApiError.notFound('Student not found');
  if (!courseExists.data) throw ApiError.notFound('Course not found');
  if (!sessionExists.data) throw ApiError.notFound('Session not found');

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', student)
    .eq('course_id', course)
    .eq('status', 'active')
    .maybeSingle();
  if (!enrollment) throw ApiError.badRequest('Student is not enrolled in this course');

  const { data: existing } = await db
    .from('results')
    .select('id')
    .eq('student_id', student)
    .eq('course_id', course)
    .eq('session_id', session)
    .eq('semester', semester)
    .maybeSingle();
  if (existing) throw ApiError.badRequest('Result already exists for this student, course, and session');

  const total = caScore + examScore;
  const grade = calculateGrade(total);
  const gradePoints = GRADE_POINTS[grade];

  const { data: result, error } = await db
    .from('results')
    .insert({
      student_id: student,
      course_id: course,
      session_id: session,
      semester,
      ca_score: caScore,
      exam_score: examScore,
      total_score: total,
      grade,
      grade_points: gradePoints,
      entered_by: userId,
      approved_by_hod: false,
      approved_by_admin: false,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to create result: ${error.message}`);
  res.status(201).json(ApiResponse.success('Result created successfully', result));
});

export const getResults = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { student, course, session, semester, published, page = 1, limit = 20, status } = req.query;
  if (!req.user) throw ApiError.unauthorized('User not authenticated');

  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 20;
  const skip = (pageNum - 1) * limitNum;

  let query = db.from('results').select('*', { count: 'exact' });
  if (req.user.role === USER_ROLES.STUDENT) {
    query = query
      .eq('student_id', resolveUserId(req.user) as string)
      .eq('approved_by_hod', true)
      .eq('approved_by_admin', true)
      .eq('status', 'approved');
  } else {
    if (student) query = query.eq('student_id', student as string);
    if (published !== undefined) query = query.eq('status', String(published) === 'true' ? 'approved' : 'pending');
    if (status) query = query.eq('status', status as string);
  }
  if (course) query = query.eq('course_id', course as string);
  if (session) query = query.eq('session_id', session as string);
  if (semester) query = query.eq('semester', semester as string);

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(skip, skip + limitNum - 1);
  if (error) throw ApiError.internal(`Failed to fetch results: ${error.message}`);
  res.json(ApiResponse.success('Data retrieved successfully', {
    results: data || [],
    pagination: { total: count || 0, page: pageNum, pages: Math.ceil((count || 0) / limitNum), limit: limitNum },
  }));
});

export const getResultById = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;
  const { data: result, error } = await db.from('results').select('*').eq('id', id).maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch result: ${error.message}`);
  if (!result) throw ApiError.notFound('Result not found');
  if (
    req.user &&
    req.user.role === USER_ROLES.STUDENT &&
    (result.student_id !== resolveUserId(req.user) || result.status !== 'approved' || !result.approved_by_hod || !result.approved_by_admin)
  )
    throw ApiError.forbidden('You are not authorized to view this result');
  res.json(ApiResponse.success('Data retrieved successfully', result));
});

export const updateResult = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;
  const userId = resolveUserId(req.user);
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: result, error: fetchErr } = await db
    .from('results')
    .select('id, entered_by, approved_by_hod, approved_by_admin, ca_score, exam_score')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch result: ${fetchErr.message}`);
  if (!result) throw ApiError.notFound('Result not found');
  if (result.approved_by_hod || result.approved_by_admin) throw ApiError.badRequest('Cannot update approved results');
  if (req.user!.role !== USER_ROLES.ADMIN && result.entered_by !== userId)
    throw ApiError.forbidden('You are not authorized to update this result');

  const { caScore, examScore } = req.body as { caScore?: number; examScore?: number };
  const ca = caScore !== undefined ? caScore : result.ca_score;
  const ex = examScore !== undefined ? examScore : result.exam_score;
  const total = ca + ex;
  const grade = calculateGrade(total);
  const gradePoints = GRADE_POINTS[grade];

  const { data: updated, error } = await db
    .from('results')
    .update({ ca_score: ca, exam_score: ex, total_score: total, grade, grade_points: gradePoints })
    .eq('id', id)
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to update result: ${error.message}`);
  res.json(ApiResponse.success('Result updated successfully', updated));
});

export const deleteResult = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;
  const userId = resolveUserId(req.user);
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: result, error: fetchErr } = await db
    .from('results')
    .select('id, entered_by, status')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch result: ${fetchErr.message}`);
  if (!result) throw ApiError.notFound('Result not found');
  if (result.status === 'approved') throw ApiError.badRequest('Cannot delete approved/published results');
  if (req.user!.role !== USER_ROLES.ADMIN && result.entered_by !== userId)
    throw ApiError.forbidden('You are not authorized to delete this result');

  const { error: delErr } = await db.from('results').delete().eq('id', id);
  if (delErr) throw ApiError.internal(`Failed to delete result: ${delErr.message}`);
  res.json(ApiResponse.success('Result deleted successfully', null));
});

export const approveResultByHOD = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;
  const userId = resolveUserId(req.user);
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: result, error: fetchErr } = await db.from('results').select('id, approved_by_hod').eq('id', id).maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch result: ${fetchErr.message}`);
  if (!result) throw ApiError.notFound('Result not found');
  if (result.approved_by_hod) throw ApiError.badRequest('Result already approved by HOD');

  const { data: updated, error } = await db
    .from('results')
    .update({ approved_by_hod: true, hod_approved_by: userId, hod_approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to approve result: ${error.message}`);
  res.json(ApiResponse.success('Result approved by HOD successfully', updated));
});

export const approveResultByAdmin = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;
  const userId = resolveUserId(req.user);

  const { data: result, error: fetchErr } = await db
    .from('results')
    .select('id, approved_by_hod, approved_by_admin')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch result: ${fetchErr.message}`);
  if (!result) throw ApiError.notFound('Result not found');
  if (!result.approved_by_hod) throw ApiError.badRequest('Result must be approved by HOD first');
  if (result.approved_by_admin) throw ApiError.badRequest('Result already approved by Admin');

  const { data: updated, error } = await db
    .from('results')
    .update({ approved_by_admin: true, admin_approved_by: userId, admin_approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to approve result: ${error.message}`);
  res.json(ApiResponse.success('Result approved by Admin successfully', updated));
});

export const publishResults = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { session, semester } = req.body as { session?: string; semester?: string };
  if (!session || !semester) throw ApiError.badRequest('Session and semester are required');

  const { count: candidateCount, error: countErr } = await db
    .from('results')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session)
    .eq('semester', semester)
    .eq('approved_by_hod', true)
    .eq('approved_by_admin', true)
    .eq('status', 'pending');
  if (countErr) throw ApiError.internal(`Failed to count results: ${countErr.message}`);

  const { error: pubErr } = await db
    .from('results')
    .update({ status: 'approved', published_at: new Date().toISOString() })
    .eq('session_id', session)
    .eq('semester', semester)
    .eq('approved_by_hod', true)
    .eq('approved_by_admin', true)
    .eq('status', 'pending');
  if (pubErr) throw ApiError.internal(`Failed to publish results: ${pubErr.message}`);

  const { data: rows, error: selErr } = await db
    .from('results')
    .select('student_id')
    .eq('session_id', session)
    .eq('semester', semester)
    .eq('status', 'approved');
  if (selErr) throw ApiError.internal(`Failed to fetch published results: ${selErr.message}`);
  const studentIds = Array.from(new Set((rows || []).map((r) => r.student_id)));
  if (studentIds.length > 0) {
    await notificationService.createBulkNotifications(
      studentIds,
      'success',
      'Results Published',
      `Your results for ${semester} semester have been published. Check your portal to view.`
    );
  }
  res.json(ApiResponse.success('Results published successfully', { modifiedCount: candidateCount || 0 }));
});

export const getTranscript = asyncHandler(async (req: Request, res: Response) => {
  const payload = await buildTranscriptPayload(req.user as UserLike, req.params.studentId as string | undefined);
  res.json(ApiResponse.success('Data retrieved successfully', payload));
});

export const getMyTranscript = asyncHandler(async (req: Request, res: Response) => {
  const payload = await buildTranscriptPayload(req.user, resolveUserId(req.user));
  res.json(ApiResponse.success('Data retrieved successfully', payload));
});

export const getResultsSummary = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { studentId } = req.params as { studentId: string };
  const { session, semester } = req.query;
  if (!req.user) throw ApiError.unauthorized('User not authenticated');
  if (req.user.role === USER_ROLES.STUDENT && resolveUserId(req.user) !== studentId)
    throw ApiError.forbidden('You can only access your own results');

  let query = db
    .from('results')
    .select('*, courses:courses(credits)')
    .eq('student_id', studentId)
    .eq('approved_by_hod', true)
    .eq('approved_by_admin', true)
    .eq('status', 'approved');
  if (session) query = query.eq('session_id', session as string);
  if (semester) query = query.eq('semester', semester as string);

  const { data: results, error } = await query;
  if (error) throw ApiError.internal(`Failed to fetch results: ${error.message}`);
  if (!results || results.length === 0) {
    res.json(ApiResponse.success('Data retrieved successfully', { message: 'No results found' }));
    return;
  }

  const gpa = calculateGPA((results as ResultRow[]).map((r) => ({ totalScore: r.total_score, gradePoints: r.grade_points, credits: r.courses?.credits || 0 })));
  const summary = {
    totalCourses: results.length,
    totalCredits: (results as ResultRow[]).reduce((sum, r) => sum + (r.courses?.credits || 0), 0),
    gpa,
    gradeDistribution: {
      A: (results as ResultRow[]).filter((r) => r.grade === 'A').length,
      B: (results as ResultRow[]).filter((r) => r.grade === 'B').length,
      C: (results as ResultRow[]).filter((r) => r.grade === 'C').length,
      D: (results as ResultRow[]).filter((r) => r.grade === 'D').length,
      E: (results as ResultRow[]).filter((r) => r.grade === 'E').length,
      F: (results as ResultRow[]).filter((r) => r.grade === 'F').length,
    },
    results,
  };
  res.json(ApiResponse.success('Data retrieved successfully', summary));
});
