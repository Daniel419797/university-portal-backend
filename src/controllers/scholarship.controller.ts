import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import notificationService from '../services/notification.service';

type UserLike = { userId?: string; _id?: string; id?: string; role?: string };
const resolveUserId = (reqUser: UserLike | undefined): string | undefined => {
  if (!reqUser) return undefined;
  return reqUser.userId || reqUser._id?.toString() || reqUser.id;
};

interface ScholarshipRow {
  id: string;
  name: string;
  description?: string | null;
  amount: number;
  eligibility_criteria?: {
    minCGPA?: number;
    levels?: string[];
    departments?: string[];
  } | null;
  available_slots: number;
  filled_slots: number;
  application_deadline: string;
  academic_year: string;
  status: string; // 'active' | 'inactive'
  is_active: boolean;
  created_by?: string | null;
}

// No explicit application row interface required for now (avoid explicit any)

async function computeCgpa(studentId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: results, error } = await db
    .from('results')
    .select('total_score, grade_points, courses:courses(credits)')
    .eq('student_id', studentId)
    .eq('is_published', true);
  if (error) throw ApiError.internal(`Failed to fetch results for CGPA: ${error.message}`);
  if (!results || results.length === 0) return 0;
  const typedResults = (results || []) as Array<{ grade_points: number; courses?: { credits?: number } }>;
  const totalGradePoints = typedResults.reduce((sum, r) => sum + (r.grade_points || 0), 0);
  const totalCredits = typedResults.reduce((sum, r) => sum + (r.courses?.credits || 0), 0);
  return totalCredits > 0 ? totalGradePoints / totalCredits : 0;
}

export const getAvailableScholarships = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = resolveUserId(req.user as UserLike);
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: user, error: userErr } = await db
    .from('profiles')
    .select('id, department_id, level')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) throw ApiError.internal(`Failed to fetch user profile: ${userErr.message}`);
  if (!user) throw ApiError.notFound('User not found');

  const cgpa = await computeCgpa(userId);

  const { data: scholarships, error: schErr } = await db
    .from('scholarships')
    .select('*')
    .eq('status', 'active')
    .eq('is_active', true)
    .gte('application_deadline', new Date().toISOString());
  if (schErr) throw ApiError.internal(`Failed to fetch scholarships: ${schErr.message}`);

  const eligibleScholarships = (scholarships || []).filter((s) => {
    const criteria = (s as ScholarshipRow).eligibility_criteria || {};
    if (criteria.minCGPA !== undefined && cgpa < (criteria.minCGPA || 0)) return false;
    if (criteria.levels && criteria.levels.length > 0 && user.level && !criteria.levels.includes(user.level)) return false;
    if (criteria.departments && criteria.departments.length > 0 && user.department_id && !criteria.departments.includes(user.department_id)) return false;
    return true;
  });

  const { data: existingApps, error: appErr } = await db
    .from('scholarship_applications')
    .select('scholarship_id')
    .eq('student_id', userId);
  if (appErr) throw ApiError.internal(`Failed to fetch applications: ${appErr.message}`);
  const appliedIds = new Set((existingApps || []).map((a) => a.scholarship_id));

  const scholarshipsWithStatus = eligibleScholarships.map((sch) => {
    const s = sch as ScholarshipRow;
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      amount: s.amount,
      eligibilityCriteria: s.eligibility_criteria || {},
      availableSlots: s.available_slots,
      filledSlots: s.filled_slots,
      applicationDeadline: s.application_deadline,
      academicYear: s.academic_year,
      hasApplied: appliedIds.has(s.id),
    };
  });

  res.json(
    ApiResponse.success('Scholarships fetched successfully', {
      scholarships: scholarshipsWithStatus,
      studentCGPA: parseFloat(cgpa.toFixed(2)),
    })
  );
});

export const applyForScholarship = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = resolveUserId(req.user as UserLike);
  if (!userId) throw ApiError.unauthorized('User not authenticated');
  const { scholarshipId, reason, documents, financialInfo } = req.body as {
    scholarshipId: string; reason?: string; documents?: unknown; financialInfo?: unknown;
  };

  const { data: scholarship, error: schErr } = await db
    .from('scholarships')
    .select('*')
    .eq('id', scholarshipId)
    .maybeSingle();
  if (schErr) throw ApiError.internal(`Failed to fetch scholarship: ${schErr.message}`);
  if (!scholarship) throw ApiError.notFound('Scholarship not found');
  if (scholarship.status !== 'active' || !scholarship.is_active) throw ApiError.badRequest('This scholarship is no longer accepting applications');
  if (new Date().toISOString() > scholarship.application_deadline) throw ApiError.badRequest('Application deadline has passed');
  if (scholarship.filled_slots >= scholarship.available_slots) throw ApiError.badRequest('All scholarship slots are filled');

  const { data: existing, error: existErr } = await db
    .from('scholarship_applications')
    .select('id')
    .eq('scholarship_id', scholarshipId)
    .eq('student_id', userId)
    .maybeSingle();
  if (existErr) throw ApiError.internal(`Failed to check existing application: ${existErr.message}`);
  if (existing) throw ApiError.badRequest('You have already applied for this scholarship');

  const { data: application, error: appErr } = await db
    .from('scholarship_applications')
    .insert({
      scholarship_id: scholarshipId,
      student_id: userId,
      reason: reason || null,
      documents: documents || [],
      financial_info: financialInfo || null,
      status: 'pending',
      disbursed: false,
    })
    .select()
    .single();
  if (appErr) throw ApiError.internal(`Failed to create application: ${appErr.message}`);

  const { data: populated, error: popErr } = await db
    .from('scholarship_applications')
    .select('*, scholarship:scholarships(name, amount)')
    .eq('id', application.id)
    .maybeSingle();
  if (popErr) throw ApiError.internal(`Failed to fetch application details: ${popErr.message}`);

  res.status(201).json(ApiResponse.success('Scholarship application submitted successfully', populated));
});

export const getStudentApplications = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = resolveUserId(req.user as UserLike);
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: applications, error } = await db
    .from('scholarship_applications')
    .select('id, status, approved_amount, disbursed, review_comment, created_at, reviewed_at, scholarship:scholarships(name, amount)')
    .eq('student_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw ApiError.internal(`Failed to fetch applications: ${error.message}`);

  const apps = (applications || []).map((app) => {
    const sch = Array.isArray(app.scholarship) ? app.scholarship[0] : app.scholarship;
    return {
      id: app.id,
      scholarship: { name: sch?.name, amount: sch?.amount },
      status: app.status,
      approvedAmount: app.approved_amount,
      disbursed: app.disbursed,
      reviewComment: app.review_comment,
      appliedAt: app.created_at,
      reviewedAt: app.reviewed_at,
    };
  });

  res.json(ApiResponse.success('Applications fetched successfully', { applications: apps, total: apps.length }));
});

export const getAllApplications = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { status, scholarshipId, page = 1, limit = 20 } = req.query as {
    status?: string; scholarshipId?: string; page?: number | string; limit?: number | string;
  };

  const pageNum = parseInt(String(page)) || 1;
  const limitNum = parseInt(String(limit)) || 20;
  const skip = (pageNum - 1) * limitNum;

  let query = db
    .from('scholarship_applications')
    .select('*, scholarship:scholarships(name, amount), student:profiles(id, first_name, last_name, email, student_id, department_id, level)');
  if (status) query = query.eq('status', status);
  if (scholarshipId) query = query.eq('scholarship_id', scholarshipId);

  const { data, error } = await query.order('created_at', { ascending: false }).range(skip, skip + limitNum - 1);
  if (error) throw ApiError.internal(`Failed to fetch applications: ${error.message}`);
  let countQuery = db.from('scholarship_applications').select('id', { count: 'exact', head: true });
  if (status) countQuery = countQuery.eq('status', status);
  if (scholarshipId) countQuery = countQuery.eq('scholarship_id', scholarshipId);
  const { count, error: countErr } = await countQuery;
  if (countErr) throw ApiError.internal(`Failed to count applications: ${countErr.message}`);

  const applications = (data || []).map((app) => {
    const sch = Array.isArray(app.scholarship) ? app.scholarship[0] : app.scholarship;
    return {
      id: app.id,
      scholarship: { name: sch?.name, amount: sch?.amount },
      student: {
      id: app.student?.id,
      name: `${app.student?.first_name} ${app.student?.last_name}`,
      email: app.student?.email,
      matricNumber: app.student?.student_id,
      department: app.student?.department_id,
      level: app.student?.level,
      },
      reason: app.reason,
      financialInfo: app.financial_info,
      documents: app.documents,
      status: app.status,
      reviewComment: app.review_comment,
      appliedAt: app.created_at,
    };
  });

  res.json(
    ApiResponse.success('Applications fetched successfully', {
      applications,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
    })
  );
});

export const getApplicationDetails = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;

  const { data: application, error } = await db
    .from('scholarship_applications')
    .select('*, scholarship:scholarships(name, amount, eligibility_criteria), student:profiles(id, first_name, last_name, email, student_id, department_id, level, phone_number), reviewedBy:profiles(first_name, last_name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch application: ${error.message}`);
  if (!application) throw ApiError.notFound('Application not found');

  const studentId = application.student?.id as string;
  const cgpa = await computeCgpa(studentId);

  res.json(
    ApiResponse.success('Application details fetched successfully', {
      applicationInfo: {
        id: application.id,
        reason: application.reason,
        documents: application.documents,
        status: application.status,
        reviewComment: application.review_comment,
        appliedAt: application.created_at,
      },
      scholarshipInfo: {
        name: application.scholarship?.name,
        amount: application.scholarship?.amount,
        eligibilityCriteria: application.scholarship?.eligibility_criteria,
      },
      studentInfo: {
        name: `${application.student?.first_name} ${application.student?.last_name}`,
        email: application.student?.email,
        matricNumber: application.student?.student_id,
        department: application.student?.department_id,
        level: application.student?.level,
        phone: application.student?.phone_number,
      },
      financialInfo: application.financial_info,
      academicInfo: {
        cgpa: parseFloat(cgpa.toFixed(2)),
        totalCourses: undefined,
      },
      reviewInfo: application.reviewedBy
        ? { reviewedBy: `${application.reviewedBy?.first_name} ${application.reviewedBy?.last_name}`, reviewedAt: application.reviewed_at }
        : null,
    })
  );
});

export const approveApplication = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = resolveUserId(req.user as UserLike);
  if (!userId) throw ApiError.unauthorized('User not authenticated');
  const { id } = req.params;
  const { amount, notes } = req.body as { amount?: number; notes?: string };

  const { data: application, error } = await db
    .from('scholarship_applications')
    .select('*, scholarship:scholarships(id, name, amount, available_slots, filled_slots)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch application: ${error.message}`);
  if (!application) throw ApiError.notFound('Application not found');
  if (application.status !== 'pending') throw ApiError.badRequest('This application has already been reviewed');

  const scholarship = application.scholarship as { id: string; name: string; amount: number; available_slots: number; filled_slots: number };
  if ((scholarship?.filled_slots || 0) >= (scholarship?.available_slots || 0))
    throw ApiError.badRequest('All scholarship slots are filled');

  const approvedAmount = amount ?? scholarship.amount;

  const { error: updErr } = await db
    .from('scholarship_applications')
    .update({ status: 'approved', reviewed_by: userId, reviewed_at: new Date().toISOString(), review_comment: notes || null, approved_amount: approvedAmount })
    .eq('id', id)
    .select()
    .single();
  if (updErr) throw ApiError.internal(`Failed to update application: ${updErr.message}`);

  const { error: slotErr } = await db
    .from('scholarships')
    .update({ filled_slots: (scholarship.filled_slots || 0) + 1 })
    .eq('id', scholarship.id);
  if (slotErr) throw ApiError.internal(`Failed to update scholarship slots: ${slotErr.message}`);

  await notificationService.createNotification(
    application.student_id,
    'success',
    'Scholarship Approved',
    `Your application for ${scholarship.name} has been approved with an amount of ₦${approvedAmount.toLocaleString()}`,
    `/scholarships/applications/${id}`
  );

  res.json(ApiResponse.success('Scholarship application approved successfully', { id, status: 'approved', approvedAmount }));
});

export const rejectApplication = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = resolveUserId(req.user as UserLike);
  if (!userId) throw ApiError.unauthorized('User not authenticated');
  const { id } = req.params;
  const { reason } = req.body as { reason?: string };

  const { data: application, error } = await db
    .from('scholarship_applications')
    .select('*, scholarship:scholarships(name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch application: ${error.message}`);
  if (!application) throw ApiError.notFound('Application not found');
  if (application.status !== 'pending') throw ApiError.badRequest('This application has already been reviewed');

  const { error: updErr } = await db
    .from('scholarship_applications')
    .update({ status: 'rejected', reviewed_by: userId, reviewed_at: new Date().toISOString(), review_comment: reason || null })
    .eq('id', id);
  if (updErr) throw ApiError.internal(`Failed to update application: ${updErr.message}`);

  await notificationService.createNotification(
    application.student_id,
    'warning',
    'Scholarship Application Update',
    `Your application for ${application.scholarship?.name} was not successful.${reason ? ` ${reason}` : ''}`,
    `/scholarships/applications/${id}`
  );

  res.json(ApiResponse.success('Scholarship application rejected', { id, status: 'rejected' }));
});

export const createScholarship = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = resolveUserId(req.user as UserLike);
  if (!userId) throw ApiError.unauthorized('User not authenticated');
  const { name, description, amount, eligibilityCriteria, availableSlots, applicationDeadline, academicYear } = req.body as {
    name: string; description?: string; amount: number; eligibilityCriteria?: unknown; availableSlots: number; applicationDeadline: string; academicYear?: string;
  };

  const { data: scholarship, error } = await db
    .from('scholarships')
    .insert({
      name,
      description: description || null,
      amount,
      eligibility_criteria: eligibilityCriteria || {},
      available_slots: availableSlots,
      application_deadline: applicationDeadline,
      academic_year: academicYear || '2024/2025',
      status: 'active',
      is_active: true,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to create scholarship: ${error.message}`);

  res.status(201).json(ApiResponse.success('Scholarship created successfully', scholarship));
});

