import { Request, Response } from 'express';
import logger from '../config/logger';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

type CourseRow = { id: string; title: string; code: string; credits?: number; created_at?: string };
type EnrollmentRow = {
  id: string;
  created_at?: string;
  student_id?: string;
  status?: string;
  course_id?: string;
};
type AssignmentRow = {
  id: string;
  title: string;
  total_marks?: number;
  due_date?: string;
  course_id?: string;
};
type SubmissionRow = {
  id?: string;
  assignment_id?: string;
  student_id?: string;
  grade?: number | null;
};
type ResultRow = {
  id: string;
  grade?: string | null;
  total_score?: number | null;
  course_id?: string;
  credits?: number;
};
type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  role?: string;
  department?: string | null;
  is_active?: boolean;
  created_at?: string;
};
type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  type?: string;
  created_at?: string;
};
type QuizRow = { id: string; title?: string; course_id?: string };

// Helper: safe exact count with detailed logging
const getExactCount = async (queryBuilder: unknown, label: string): Promise<number> => {
  try {
    
    const qb = queryBuilder as any;
    const { count, error } = await qb.select('*', { count: 'exact', head: true });
    if (error) {
      logger.error(`Count query failed [${label}]`, { error });
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    logger.error(`Unexpected error in count query [${label}]`, { err });
    return 0;
  }
};

// Helper: safe data fetch
const getRows = async <T>(queryBuilder: unknown, label: string): Promise<T[]> => {
  try {
   
    const qb = queryBuilder as any;
    const { data, error } = await qb;
    if (error) {
      logger.error(`Data query failed [${label}]`, { error });
      return [];
    }
    return data ?? [];
  } catch (err) {
    logger.error(`Unexpected error in data query [${label}]`, { err });
    return [];
  }
};

// @desc    Get Student Dashboard
export const getStudentDashboard = asyncHandler(async (req: Request, res: Response) => {
  
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Authentication required');

  // Enrolled courses count
  const enrolledCourses = await getExactCount(
    db.from('enrollments').eq('student_id', userId).eq('status', 'active'),
    'student_enrolled_courses'
  );

  // Active enrollments with course details
  const activeEnrollments = await getRows<EnrollmentRow & { course: CourseRow }>(
    db
      .from('enrollments')
      .select('id, course:courses(id,title,code,credits)')
      .eq('student_id', userId)
      .eq('status', 'active'),
    'student_active_enrollments'
  );

  const courseIds = activeEnrollments
    .map((e) => e.course?.id)
    .filter((id): id is string => Boolean(id));

  // Upcoming assignments
  const assignments = courseIds.length
    ? await getRows<AssignmentRow & { course: CourseRow }>(
        db
          .from('assignments')
          .select('id,title,total_marks,due_date,course:courses(id,title,code)')
          .in('course_id', courseIds)
          .gte('due_date', new Date().toISOString()),
        'student_upcoming_assignments'
      )
    : [];

  // Submitted assignments
  const submitted = assignments.length
    ? await getRows<SubmissionRow>(
        db
          .from('submissions')
          .select('assignment_id')
          .eq('student_id', userId)
          .in('assignment_id', assignments.map((a) => a.id)),
        'student_submitted_assignments'
      )
    : [];

  const submittedIds = new Set(submitted.map((s) => s.assignment_id).filter(Boolean));
  const pendingAssignments = assignments.filter((a) => !submittedIds.has(a.id)).length;

  // Results for CGPA
  const results = await getRows<ResultRow & { course: { credits?: number } }>(
    db
      .from('results')
      .select('grade, course:courses(credits)')
      .eq('student_id', userId)
      .eq('status', 'approved'),
    'student_results'
  );

  const gradeToPoints = (grade: string | null | undefined): number => {
    if (!grade) return 0;
    const g = grade.toUpperCase();
    return { A: 4.0, B: 3.0, C: 2.0, D: 1.0 }[g] ?? 0;
  };

  let cgpa = 0;
  if (results.length > 0) {
    const totalPoints = results.reduce(
      (sum, r) => sum + gradeToPoints(r.grade) * (r.course?.credits ?? 1),
      0
    );
    const totalCredits = results.reduce((sum, r) => sum + (r.course?.credits ?? 1), 0);
    cgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
  }

  // Payment status
  const latestPayments = await getRows<PaymentRow>(
    db
      .from('payments')
      .select('status')
      .eq('student_id', userId)
      .eq('status', 'verified')
      .order('created_at', { ascending: false })
      .limit(1),
    'student_latest_payment'
  );
  const paymentStatus = latestPayments.length > 0 ? 'Successful' : 'Pending';

  // Recent items
  const recentCourses = activeEnrollments.slice(0, 5).map((e) => e.course!);
  const recentAssignments = assignments.slice(0, 5);

  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'student_unread_notifications'
  );

  res.json(
    ApiResponse.success('Dashboard data fetched successfully', {
      enrolledCourses,
      pendingAssignments,
      cgpa: parseFloat(cgpa.toFixed(2)),
      paymentStatus,
      recentCourses,
      recentAssignments: recentAssignments.map((a) => ({
        id: a.id,
        title: a.title,
        course: { title: a.course.title, code: a.course.code },
        deadline: a.due_date,
        totalMarks: a.total_marks,
      })),
      unreadNotifications,
    })
  );
});

// @desc    Get Lecturer Dashboard
export const getLecturerDashboard = asyncHandler(async (req: Request, res: Response) => {
  
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Authentication required');

  // Assigned courses
  const assignedCourses = await getExactCount(
    db.from('courses').eq('lecturer_id', userId).eq('is_active', true),
    'lecturer_assigned_courses'
  );

  const courses = await getRows<CourseRow>(
    db.from('courses').select('id,title,code').eq('lecturer_id', userId),
    'lecturer_courses'
  );
  const courseIds = courses.map((c) => c.id);

  // Total active students across lecturer's courses
  const totalStudents = courseIds.length
    ? await getExactCount(
        db.from('enrollments').in('course_id', courseIds).eq('status', 'active'),
        'lecturer_total_students'
      )
    : 0;

  // Assignments & pending grading
  const assignments = courseIds.length
    ? await getRows<AssignmentRow>(
        db.from('assignments').select('id,title,course_id').in('course_id', courseIds),
        'lecturer_assignments'
      )
    : [];

  const assignmentIds = assignments.map((a) => a.id);
  const pendingSubmissions = assignmentIds.length
    ? await getExactCount(
        db.from('submissions').in('assignment_id', assignmentIds).is('grade', null),
        'lecturer_pending_submissions'
      )
    : 0;

  // Quizzes count
  const quizzes = courseIds.length
    ? await getRows<QuizRow>(
        db.from('quizzes').select('id').in('course_id', courseIds),
        'lecturer_quizzes'
      )
    : [];

  // Recent courses with student count
  const recentCoursesRaw = await getRows<CourseRow>(
    db
      .from('courses')
      .select('id,title,code')
      .eq('lecturer_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    'lecturer_recent_courses'
  );

  const recentCoursesWithStats = await Promise.all(
    recentCoursesRaw.map(async (course) => ({
      id: course.id,
      title: course.title,
      code: course.code,
      studentCount: await getExactCount(
        db.from('enrollments').eq('course_id', course.id).eq('status', 'active'),
        `lecturer_recent_course_${course.id}_students`
      ),
    }))
  );

  // Recent assignments
  const recentAssignments = courseIds.length
    ? await getRows<AssignmentRow & { course: CourseRow }>(
        db
          .from('assignments')
          .select('id,title,total_marks,due_date,course:courses(id,title,code)')
          .in('course_id', courseIds)
          .order('created_at', { ascending: false })
          .limit(5),
        'lecturer_recent_assignments'
      )
    : [];

  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'lecturer_unread_notifications'
  );

  res.json(
    ApiResponse.success('Dashboard data fetched successfully', {
      assignedCourses,
      totalStudents,
      pendingSubmissions,
      pendingQuizzes: quizzes.length,
      recentCourses: recentCoursesWithStats,
      recentAssignments: recentAssignments.map((a) => ({
        id: a.id,
        title: a.title,
        course: { title: a.course.title, code: a.course.code },
        deadline: a.due_date,
        totalMarks: a.total_marks,
      })),
      unreadNotifications,
    })
  );
});

// @desc    Get HOD Dashboard
// @route   GET /api/v1/hod/dashboard
// @access  Private (HOD)
export const getHODDashboard = asyncHandler(async (req: Request, res: Response) => {
  
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Authentication required');
  const userRows = await getRows<ProfileRow>(db.from('profiles').select('id,department').eq('id', userId).limit(1), 'hod_user');
  const user = userRows[0];

  if (!user || !user.department) {
    throw ApiError.badRequest('Department not found for user');
  }

  const totalStudents = await getExactCount(
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('department', user.department),
    'hod_total_students'
  );

  const totalStaff = await getExactCount(
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'lecturer').eq('department', user.department),
    'hod_total_staff'
  );

  const totalCourses = await getExactCount(
    db.from('courses').select('id', { count: 'exact', head: true }).eq('department', user.department),
    'hod_total_courses'
  );

  const activeLecturers = await getExactCount(
    db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'lecturer')
      .eq('department', user.department)
      .eq('is_active', true),
    'hod_active_lecturers'
  );

  const pendingResults = await getExactCount(
    db
      .from('results')
      .select('id', { count: 'exact', head: true })
      .eq('approved_by_hod', false)
      .eq('is_published', false),
    'hod_pending_results'
  );

  const pendingClearances = await getExactCount(
    db.from('clearance').select('id', { count: 'exact', head: true }).eq('overall_status', 'in-progress'),
    'hod_pending_clearances'
  );

  const departmentCourses = await getRows<CourseRow>(
    db.from('courses').select('id').eq('department', user.department),
    'hod_department_courses'
  );
  const departmentCourseIds = departmentCourses.map((c) => c.id);

  const recentEnrollments = await getRows<EnrollmentRow & { student?: ProfileRow; course?: CourseRow }>(
    db
      .from('enrollments')
      .select('id, created_at, student:profiles(id,first_name,last_name), course:courses(id,code,title)')
      .in('course_id', departmentCourseIds.length ? departmentCourseIds : ['__none__'])
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10),
    'hod_recent_enrollments'
  );

  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'hod_unread_notifications'
  );

  res.json(
    ApiResponse.success('Dashboard data fetched successfully', {
      departmentStats: {
        totalStudents,
        totalStaff,
        totalCourses,
        activeLecturers
      },
      pendingApprovals: {
        results: pendingResults,
        clearances: pendingClearances,
        courseRegistrations: 0
      },
      recentActivities: recentEnrollments.map((e) => ({
        id: e.id,
        type: 'enrollment',
        student: e.student?.first_name + ' ' + e.student?.last_name,
        course: e.course?.code + ' - ' + e.course?.title,
        date: e.created_at
      })),
      unreadNotifications
    })
  );
});

// @desc    Get Bursary Dashboard
// @route   GET /api/v1/bursary/dashboard
// @access  Private (Bursary)
export const getBursaryDashboard = asyncHandler(async (req: Request, res: Response) => {
  
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Authentication required');

  const totalPayments = await getExactCount(db.from('payments').select('id', { count: 'exact', head: true }), 'bursary_total_payments');

  const verifiedPayments = await getExactCount(db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'verified'), 'bursary_verified_payments');

  const pendingPayments = await getExactCount(db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'), 'bursary_pending_payments');

  const failedPayments = await getExactCount(db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'failed'), 'bursary_failed_payments');

  const verifiedRows = await getRows<{ amount: number }>(db.from('payments').select('amount').eq('status', 'verified'), 'bursary_verified_amounts');
  const paidAmount = verifiedRows.reduce((sum: number, p) => sum + (Number(p.amount) || 0), 0);

  const totalStudents = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'), 'bursary_total_students');
  const expectedRevenue = totalStudents * 150000; // Assuming 150,000 per student
  const pendingAmount = expectedRevenue - paidAmount;

  const recentPayments = await getRows<PaymentRow & { student?: { id: string; first_name: string; last_name: string; email?: string } }>(
    db
      .from('payments')
      .select('id,amount,status,type,created_at, student:profiles(id,first_name,last_name,email)')
      .order('created_at', { ascending: false })
      .limit(10),
    'bursary_recent_payments'
  );

  // Get scholarship statistics (placeholder for now)
  const totalScholarships = 0;
  const pendingScholarships = 0;

  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'bursary_unread_notifications'
  );

  res.json(
    ApiResponse.success('Dashboard data fetched successfully', {
      paymentStats: {
        total: totalPayments,
        verified: verifiedPayments,
        pending: pendingPayments,
        failed: failedPayments
      },
      revenue: {
        total: expectedRevenue,
        paid: paidAmount,
        pending: pendingAmount
      },
      scholarships: {
        total: totalScholarships,
        pending: pendingScholarships
      },
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        student: {
          name: p.student?.first_name + ' ' + p.student?.last_name,
          email: p.student?.email
        },
        amount: p.amount,
        status: p.status,
        paymentType: p.type,
        date: p.created_at
      })),
      unreadNotifications
    })
  );
});

// @desc    Get Admin Dashboard
// @route   GET /api/v1/admin/dashboard
// @access  Private (Admin)
export const getAdminDashboard = asyncHandler(async (req: Request, res: Response) => {
  
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;
  if (!userId) throw ApiError.unauthorized('Authentication required');

  // Get user statistics
  const totalUsers = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }), 'admin_total_users');
  const totalStudents = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'), 'admin_total_students');
  const totalLecturers = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'lecturer'), 'admin_total_lecturers');
  const totalAdmins = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'), 'admin_total_admins');
  const activeUsers = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true), 'admin_active_users');

  // Get course statistics
  const totalCourses = await getExactCount(db.from('courses').select('id', { count: 'exact', head: true }), 'admin_total_courses');
  const activeCourses = await getExactCount(db.from('courses').select('id', { count: 'exact', head: true }).eq('is_active', true), 'admin_active_courses');

  // Get enrollment statistics
  const totalEnrollments = await getExactCount(db.from('enrollments').select('id', { count: 'exact', head: true }), 'admin_total_enrollments');
  const activeEnrollments = await getExactCount(db.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'active'), 'admin_active_enrollments');

  // Get payment statistics
  const paymentRows = await getRows<PaymentRow>(db.from('payments').select('status,amount'), 'admin_payment_rows');
  const paymentStatsMap: Record<string, { count: number; totalAmount: number }> = {};
  for (const p of paymentRows) {
    const key = p.status ?? 'unknown';
    if (!paymentStatsMap[key]) paymentStatsMap[key] = { count: 0, totalAmount: 0 };
    paymentStatsMap[key].count += 1;
    paymentStatsMap[key].totalAmount += Number(p.amount) || 0;
  }
  const verifiedPaymentStat = paymentStatsMap['verified'] || { count: 0, totalAmount: 0 };
  const pendingPaymentStat = paymentStatsMap['pending'] || { count: 0, totalAmount: 0 };

  // Get hostel statistics
  const totalHostels = await getExactCount(db.from('hostels').select('id', { count: 'exact', head: true }), 'admin_total_hostels');
  const totalHostelApplications = await getExactCount(db.from('hostel_applications').select('id', { count: 'exact', head: true }), 'admin_total_hostel_applications');
  const approvedApplications = await getExactCount(db.from('hostel_applications').select('id', { count: 'exact', head: true }).eq('status', 'approved'), 'admin_approved_applications');

  // Get assignment and quiz statistics
  const totalAssignments = await getExactCount(db.from('assignments').select('id', { count: 'exact', head: true }), 'admin_total_assignments');
  const totalQuizzes = await getExactCount(db.from('quizzes').select('id', { count: 'exact', head: true }), 'admin_total_quizzes');
  const totalSubmissions = await getExactCount(db.from('submissions').select('id', { count: 'exact', head: true }), 'admin_total_submissions');

  // Get recent activities
  const recentUsers = await getRows<ProfileRow>(
    db
      .from('profiles')
      .select('id,first_name,last_name,email,role,created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    'admin_recent_users'
  );

  const recentPayments = await getRows<PaymentRow & { student?: { id: string; first_name: string; last_name: string } }>(
    db
      .from('payments')
      .select('id,amount,status,created_at, student:profiles(id,first_name,last_name)')
      .order('created_at', { ascending: false })
      .limit(5),
    'admin_recent_payments'
  );

  // Get unread notifications
  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'admin_unread_notifications'
  );

  res.json(
    ApiResponse.success('Dashboard data fetched successfully', {
      users: {
        total: totalUsers,
        students: totalStudents,
        lecturers: totalLecturers,
        admins: totalAdmins,
        active: activeUsers
      },
      courses: {
        total: totalCourses,
        active: activeCourses
      },
      enrollments: {
        total: totalEnrollments,
        active: activeEnrollments
      },
      payments: {
        verified: {
          count: verifiedPaymentStat.count,
          amount: verifiedPaymentStat.totalAmount
        },
        pending: {
          count: pendingPaymentStat.count,
          amount: pendingPaymentStat.totalAmount
        }
      },
      hostels: {
        total: totalHostels,
        applications: totalHostelApplications,
        approved: approvedApplications
      },
      academic: {
        assignments: totalAssignments,
        quizzes: totalQuizzes,
        submissions: totalSubmissions
      },
      recentUsers: recentUsers.map((u) => ({
        id: u.id,
        name: u.first_name + ' ' + u.last_name,
        email: u.email,
        role: u.role,
        created_at: u.created_at
      })),
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        student: p.student?.first_name + ' ' + p.student?.last_name,
        amount: p.amount,
        status: p.status,
        created_at: p.created_at
      })),
      unreadNotifications
    })
  );
});

