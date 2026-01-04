import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';

type CourseRow = { id: string; title: string; code: string; credits?: number; created_at?: string };
type EnrollmentRow = {
  id: string;
  created_at?: string;
  student?: string;
  student_id?: string;
  status?: string;
  course?: CourseRow;
  course_id?: string;
};
type AssignmentRow = {
  id: string;
  title: string;
  total_marks?: number;
  due_date?: string;
  course?: CourseRow;
  course_id?: string;
};
type SubmissionRow = {
  id?: string;
  assignment?: string;
  assignment_id?: string;
  student?: string;
  student_id?: string;
  grade?: number | null;
};
type ResultRow = { id: string; grade?: string | null; total_score?: number | null; course?: { id: string; credits?: number }; course_id?: string };
type ProfileRow = { id: string; first_name: string; last_name: string; email?: string; role?: string; department?: string; is_active?: boolean; created_at?: string };
type PaymentRow = { id: string; amount: number; status: string; type?: string; created_at?: string; student?: ProfileRow };
type QuizRow = { id: string; title?: string; course?: string };

const getExactCount = async (
  query: unknown
): Promise<number> => {
  try {
    const result = await (query as any);
    if (!result) return 0;
    const { count, error } = result as any;
    if (error) throw new Error('Supabase error: ' + JSON.stringify(error));
    return count ?? 0;
  } catch (e) {
    const serialized = e && typeof e === 'object' ? JSON.stringify(e, Object.getOwnPropertyNames(e)) : String(e);
    throw new Error(`getExactCount failed: ${serialized}`);
  }
};

const getRows = async <T>(
  query: unknown
): Promise<T[]> => {
  try {
    const result = await (query as any);
    if (!result) return [];
    const { data, error } = result as any;
    if (error) throw new Error('Supabase error: ' + JSON.stringify(error));
    return data ?? [];
  } catch (e) {
    const serialized = e && typeof e === 'object' ? JSON.stringify(e, Object.getOwnPropertyNames(e)) : String(e);
    throw new Error(`getRows failed: ${serialized}`);
  }
};

// @desc    Get Student Dashboard
// @route   GET /api/v1/students/dashboard
// @access  Private (Student)
export const getStudentDashboard = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw new Error('Unauthorized');

  const enrolledCourses = await getExactCount(
    db
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', userId)
      .eq('status', 'active')
  );

  const activeEnrollments = await getRows<EnrollmentRow>(
    db
      .from('enrollments')
      .select('id, course:course_id(id,title,code,credits)')
      .eq('student_id', userId)
      .eq('status', 'active')
  );

  const courseIds = Array.from(
    new Set((activeEnrollments || []).map((e) => e.course?.id).filter((v): v is string => Boolean(v)))
  );

  const assignments = courseIds.length
    ? await getRows<AssignmentRow>(
        db
          .from('assignments')
          .select('id,title,total_marks,due_date,course:course_id(id,title,code)')
          .in('course_id', courseIds)
          .gte('due_date', new Date().toISOString())
      )
    : [];

  const submitted = assignments.length
    ? await getRows<SubmissionRow>(
        db
          .from('submissions')
          .select('assignment_id')
          .eq('student_id', userId)
          .in('assignment_id', assignments.map((a) => a.id))
      )
    : [];
  const submittedAssignmentIds = Array.from(new Set(submitted.map((s) => s.assignment_id))).filter(Boolean);

  const pendingAssignments = assignments.filter(a => !submittedAssignmentIds.includes(a.id)).length;

  const results = await getRows<ResultRow>(
    db
      .from('results')
      .select('id, grade, total_score, course:course_id(id,credits)')
      .eq('student_id', userId)
      .eq('status', 'approved')
  );

  // Convert letter grades to grade points (4.0 scale)
  const gradeToPoints = (grade: string | null | undefined): number => {
    if (!grade) return 0;
    const g = grade.toUpperCase();
    if (g === 'A') return 4.0;
    if (g === 'B') return 3.0;
    if (g === 'C') return 2.0;
    if (g === 'D') return 1.0;
    return 0.0; // F or other
  };

  let cgpa = 0;
  if (results.length > 0) {
    const totalGradePoints = results.reduce((sum, r) => sum + (gradeToPoints(r.grade) * (r.course?.credits || 0)), 0);
    const totalCredits = results.reduce((sum, r) => sum + (r.course?.credits || 0), 0);
    cgpa = totalCredits > 0 ? totalGradePoints / totalCredits : 0;
  }

  const latestPaymentRows = await getRows(
    db
      .from('payments')
      .select('id,status,created_at')
      .eq('student_id', userId)
      .eq('status', 'successful')
      .order('created_at', { ascending: false })
      .limit(1)
  );
  const paymentStatus = latestPaymentRows.length > 0 ? 'Successful' : 'Pending';

  const recentCourses = await getRows<EnrollmentRow>(
    db
      .from('enrollments')
      .select('course:course_id(id,title,code,credits)')
      .eq('student_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5)
  );

  const recentAssignments = courseIds.length
    ? await getRows<AssignmentRow>(
        db
          .from('assignments')
          .select('id,title,total_marks,due_date,course:course_id(id,title,code)')
          .in('course_id', courseIds)
          .order('created_at', { ascending: false })
          .limit(5)
      )
    : [];

  const unreadNotifications = await getExactCount(
    db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
  );

  res.json(
    ApiResponse.success('Dashboard data fetched successfully', {
      enrolledCourses,
      pendingAssignments,
      cgpa: parseFloat(cgpa.toFixed(2)),
      paymentStatus,
      recentCourses: recentCourses.map((e) => ({
        id: e.course?.id,
        title: e.course?.title,
        code: e.course?.code,
        credits: e.course?.credits
      })),
      recentAssignments: recentAssignments.map((a) => ({
        id: a.id,
        title: a.title,
        course: {
          title: a.course?.title,
          code: a.course?.code
        },
        deadline: a.due_date,
        totalMarks: a.total_marks
      })),
      unreadNotifications
    })
  );
});

// @desc    Get Lecturer Dashboard
// @route   GET /api/v1/lecturers/dashboard
// @access  Private (Lecturer)
export const getLecturerDashboard = asyncHandler(async (req: Request, res: Response) => {
  try {
    const db = supabaseAdmin();
    const userId = req.user?.userId;
    if (!userId) throw new Error('Unauthorized');

  const assignedCourses = await getExactCount(
    db.from('courses').select('id', { count: 'exact', head: true }).eq('lecturer', userId)
  );

  const courses = await getRows<CourseRow>(
    db.from('courses').select('id,title,code').eq('lecturer', userId)
  );
  const courseIds = (courses || []).map((c) => c.id);

  const totalStudents = await getExactCount(
    db
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .in('course', courseIds.length ? courseIds : ['__none__'])
      .eq('status', 'active')
  );

  const assignments = await getRows<AssignmentRow>(
    db
      .from('assignments')
      .select('id, title, course')
      .in('course', courseIds.length ? courseIds : ['__none__'])
  );

  const assignmentIds = assignments.map((a) => a.id);

  const pendingSubmissions = await getExactCount(
    db
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .in('assignment', assignmentIds.length ? assignmentIds : ['__none__'])
      .is('grade', null)
  );

  const quizzes = await getRows<QuizRow>(
    db
      .from('quizzes')
      .select('id, title, course')
      .in('course', courseIds.length ? courseIds : ['__none__'])
  );

  const recentCourses = await getRows<CourseRow>(
    db
      .from('courses')
      .select('id,title,code,created_at')
      .eq('lecturer', userId)
      .order('created_at', { ascending: false })
      .limit(5)
  );

  const recentCoursesWithStats = await Promise.all(
    recentCourses.map(async (course) => {
      const studentCount = await getExactCount(
        db
          .from('enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('course', course.id)
          .eq('status', 'active')
      );
      return {
        id: course.id,
        title: course.title,
        code: course.code,
        studentCount
      };
    })
  );

  const recentAssignments = await getRows<AssignmentRow>(
    db
      .from('assignments')
      .select('id,title,total_marks,due_date,course:course(id,title,code)')
      .in('course', courseIds.length ? courseIds : ['__none__'])
      .order('created_at', { ascending: false })
      .limit(5)
  );

  const unreadNotifications = await getExactCount(
    db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user', userId)
      .eq('is_read', false)
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
        course: {
          title: a.course?.title,
          code: a.course?.code
        },
        deadline: a.due_date,
        totalMarks: a.total_marks
      })),
      unreadNotifications
    })
  );
  } catch (err) {
    // Log full error for debugging in production
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const logger = require('../config/logger').default;
      logger.error('getLecturerDashboard failed', { error: err instanceof Error ? err.stack : err });
      // Also print to stdout
      // eslint-disable-next-line no-console
      console.error('getLecturerDashboard failed', err instanceof Error ? err.stack : err);
    } catch (e) {
      // ignore logging failures
    }
    throw err;
  }
});

// @desc    Get HOD Dashboard
// @route   GET /api/v1/hod/dashboard
// @access  Private (HOD)
export const getHODDashboard = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw new Error('Unauthorized');
  const userRows = await getRows<ProfileRow>(db.from('profiles').select('id,department').eq('id', userId).limit(1));
  const user = userRows[0];

  if (!user || !user.department) {
    res.status(400);
    throw new Error('Department not found for user');
  }

  const totalStudents = await getExactCount(
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('department', user.department)
  );

  const totalStaff = await getExactCount(
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'lecturer').eq('department', user.department)
  );

  const totalCourses = await getExactCount(
    db.from('courses').select('id', { count: 'exact', head: true }).eq('department', user.department)
  );

  const activeLecturers = await getExactCount(
    db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'lecturer')
      .eq('department', user.department)
      .eq('is_active', true)
  );

  const pendingResults = await getExactCount(
    db
      .from('results')
      .select('id', { count: 'exact', head: true })
      .eq('approved_by_hod', false)
      .eq('is_published', false)
  );

  const pendingClearances = await getExactCount(
    db.from('clearance').select('id', { count: 'exact', head: true }).eq('overall_status', 'in-progress')
  );

  const departmentCourses = await getRows<CourseRow>(
    db.from('courses').select('id').eq('department', user.department)
  );
  const departmentCourseIds = departmentCourses.map((c) => c.id);

  const recentEnrollments = await getRows<EnrollmentRow & { student?: ProfileRow; course?: CourseRow }>(
    db
      .from('enrollments')
      .select('id, created_at, student:profiles(id,first_name,last_name), course:courses(id,code,title)')
      .in('course', departmentCourseIds.length ? departmentCourseIds : ['__none__'])
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10)
  );

  const unreadNotifications = await getExactCount(
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('user', userId).eq('is_read', false)
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
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw new Error('Unauthorized');

  const totalPayments = await getExactCount(db.from('payments').select('id', { count: 'exact', head: true }));

  const verifiedPayments = await getExactCount(db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'verified'));

  const pendingPayments = await getExactCount(db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'));

  const failedPayments = await getExactCount(db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'failed'));

  const verifiedRows = await getRows<{ amount: number }>(db.from('payments').select('amount').eq('status', 'verified'));
  const paidAmount = verifiedRows.reduce((sum: number, p) => sum + (Number(p.amount) || 0), 0);

  const totalStudents = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'));
  const expectedRevenue = totalStudents * 150000; // Assuming 150,000 per student
  const pendingAmount = expectedRevenue - paidAmount;

  const recentPayments = await getRows<PaymentRow>(
    db
      .from('payments')
      .select('id,amount,status,type,created_at, student:profiles(id,first_name,last_name,email)')
      .order('created_at', { ascending: false })
      .limit(10)
  );

  // Get scholarship statistics (placeholder for now)
  const totalScholarships = 0;
  const pendingScholarships = 0;

  const unreadNotifications = await getExactCount(
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('user', userId).eq('is_read', false)
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
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  if (!userId) throw new Error('Unauthorized');

  // Get user statistics
  const totalUsers = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }));
  const totalStudents = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'));
  const totalLecturers = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'lecturer'));
  const totalAdmins = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'));
  const activeUsers = await getExactCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true));

  // Get course statistics
  const totalCourses = await getExactCount(db.from('courses').select('id', { count: 'exact', head: true }));
  const activeCourses = await getExactCount(db.from('courses').select('id', { count: 'exact', head: true }).eq('is_active', true));

  // Get enrollment statistics
  const totalEnrollments = await getExactCount(db.from('enrollments').select('id', { count: 'exact', head: true }));
  const activeEnrollments = await getExactCount(db.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'active'));

  // Get payment statistics
  const paymentRows = await getRows<PaymentRow>(db.from('payments').select('status,amount'));
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
  const totalHostels = await getExactCount(db.from('hostels').select('id', { count: 'exact', head: true }));
  const totalHostelApplications = await getExactCount(db.from('hostel_applications').select('id', { count: 'exact', head: true }));
  const approvedApplications = await getExactCount(db.from('hostel_applications').select('id', { count: 'exact', head: true }).eq('status', 'approved'));

  // Get assignment and quiz statistics
  const totalAssignments = await getExactCount(db.from('assignments').select('id', { count: 'exact', head: true }));
  const totalQuizzes = await getExactCount(db.from('quizzes').select('id', { count: 'exact', head: true }));
  const totalSubmissions = await getExactCount(db.from('submissions').select('id', { count: 'exact', head: true }));

  // Get recent activities
  const recentUsers = await getRows<ProfileRow>(
    db
      .from('profiles')
      .select('id,first_name,last_name,email,role,created_at')
      .order('created_at', { ascending: false })
      .limit(5)
  );

  const recentPayments = await getRows<PaymentRow>(
    db
      .from('payments')
      .select('id,amount,status,created_at, student:profiles(id,first_name,last_name)')
      .order('created_at', { ascending: false })
      .limit(5)
  );

  // Get unread notifications
  const unreadNotifications = await getExactCount(
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('user', userId).eq('is_read', false)
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

