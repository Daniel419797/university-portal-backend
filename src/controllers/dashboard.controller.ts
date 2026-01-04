import { Request, Response } from 'express';
import logger from '../config/logger';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

interface CourseRow {
  id: string;
  title: string;
  code: string;
  credits?: number;
}

interface EnrollmentRow {
  id?: string;
  course_id?: string;
  status?: string;
  created_at?: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  total_marks?: number;
  due_date?: string;
  course_id?: string;
}

interface SubmissionRow {
  assignment_id?: string;
  grade?: number | null;
}

interface ResultRow {
  grade?: string | null;
  course?: {
    credits?: number;
  };
}

interface PaymentRow {
  id?: string;
  status?: string;
  created_at?: string;
  amount?: number;
  student_id?: string;
  type?: string;
}

interface ProfileRow {
  id: string;
  department?: string;
  role?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  created_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe count helper — accepts a query builder (NOT a promise)
// ─────────────────────────────────────────────────────────────────────────────
const getExactCount = async (builder: any, label: string): Promise<number> => {
  try {
    const { count, error } = await builder.select('*', { count: 'exact', head: true });
    if (error) {
      logger.error(`Count query failed [${label}]`, { message: error.message, details: error });
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    logger.error(`Unexpected error in count query [${label}]`, { err });
    return 0;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Safe rows helper — accepts a query builder (NOT a promise)
// ─────────────────────────────────────────────────────────────────────────────
const getRows = async <T>(builder: any, label: string): Promise<T[]> => {
  try {
    const { data, error } = await builder;
    if (error) {
      logger.error(`Data query failed [${label}]`, { message: error.message, details: error });
      return [];
    }
    return data ?? [];
  } catch (err) {
    logger.error(`Unexpected error in data query [${label}]`, { err });
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Student Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getStudentDashboard = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;

  if (!userId) {
    throw ApiError.unauthorized('Authentication required');
  }

  // 1. Enrolled courses count
  const enrolledCourses = await getExactCount(
    db.from('enrollments').eq('student_id', userId).eq('status', 'active'),
    'student_enrolled_courses'
  );

  // 2. Active enrollments with course details
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

  // 3. Upcoming assignments
  const assignments = courseIds.length > 0
    ? await getRows<AssignmentRow & { course: CourseRow }>(
        db
          .from('assignments')
          .select('id,title,total_marks,due_date,course:courses(id,title,code)')
          .in('course_id', courseIds)
          .gte('due_date', new Date().toISOString()),
        'student_upcoming_assignments'
      )
    : [];

  // 4. Submitted assignments
  const submitted = assignments.length > 0
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

  // 5. Results for CGPA
  const results = await getRows<ResultRow>(
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

  // 6. Payment status
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

  // 7. Recent items
  const recentCourses = activeEnrollments.slice(0, 5).map((e) => e.course!);
  const recentAssignments = assignments.slice(0, 5);

  // 8. Unread notifications
  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'student_unread_notifications'
  );

  res.json(
    ApiResponse.success('Student dashboard loaded successfully', {
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

// ─────────────────────────────────────────────────────────────────────────────
// Lecturer Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getLecturerDashboard = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;

  if (!userId) {
    throw ApiError.unauthorized('Authentication required');
  }

  // 1. Number of courses assigned to this lecturer
  const assignedCourses = await getExactCount(
    db.from('courses').eq('lecturer_id', userId).eq('is_active', true),
    'lecturer_assigned_courses'
  );

  // 2. Fetch course IDs for further queries
  const courses = await getRows<CourseRow>(
    db.from('courses').select('id').eq('lecturer_id', userId),
    'lecturer_course_ids'
  );

  const courseIds = courses.map((c) => c.id);

  // 3. Total active students in lecturer's courses
  const totalStudents = courseIds.length > 0
    ? await getExactCount(
        db.from('enrollments').in('course_id', courseIds).eq('status', 'active'),
        'lecturer_total_students'
      )
    : 0;

  // 4. Assignments created by lecturer
  const assignments = courseIds.length > 0
    ? await getRows<AssignmentRow>(
        db.from('assignments').select('id').in('course_id', courseIds),
        'lecturer_assignments'
      )
    : [];

  const assignmentIds = assignments.map((a) => a.id);

  // 5. Pending submissions to grade
  const pendingSubmissions = assignmentIds.length > 0
    ? await getExactCount(
        db.from('submissions').in('assignment_id', assignmentIds).is('grade', null),
        'lecturer_pending_submissions'
      )
    : 0;

  // 6. Total quizzes
  const pendingQuizzes = courseIds.length > 0
    ? await getExactCount(
        db.from('quizzes').in('course_id', courseIds),
        'lecturer_quizzes'
      )
    : 0;

  // 7. Recent courses with enrollment stats
  const recentCoursesRaw = await getRows<CourseRow>(
    db
      .from('courses')
      .select('id, title, code')
      .eq('lecturer_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    'lecturer_recent_courses_raw'
  );

  const recentCoursesWithStats = await Promise.all(
    recentCoursesRaw.map(async (course) => {
      const studentCount = await getExactCount(
        db.from('enrollments').eq('course_id', course.id).eq('status', 'active'),
        `lecturer_recent_course_${course.id}_students`
      );
      return {
        id: course.id,
        title: course.title,
        code: course.code,
        studentCount,
      };
    })
  );

  // 8. Recent assignments
  const recentAssignments = courseIds.length > 0
    ? await getRows<any>(
        db
          .from('assignments')
          .select('id, title, total_marks, due_date, course:courses(title, code)')
          .in('course_id', courseIds)
          .order('created_at', { ascending: false })
          .limit(5),
        'lecturer_recent_assignments'
      )
    : [];

  // 9. Unread notifications
  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'lecturer_unread_notifications'
  );

  res.json(
    ApiResponse.success('Lecturer dashboard loaded successfully', {
      assignedCourses,
      totalStudents,
      pendingSubmissions,
      pendingQuizzes,
      recentCourses: recentCoursesWithStats,
      recentAssignments: recentAssignments.map((a: any) => ({
        id: a.id,
        title: a.title,
        course: {
          title: a.course?.title,
          code: a.course?.code,
        },
        deadline: a.due_date,
        totalMarks: a.total_marks,
      })),
      unreadNotifications,
    })
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// HOD Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getHODDashboard = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;

  if (!userId) {
    throw ApiError.unauthorized('Authentication required');
  }

  // 1. Get user's department
  const userRows = await getRows<ProfileRow>(
    db.from('profiles').select('id,department').eq('id', userId).limit(1),
    'hod_user_department'
  );
  const user = userRows[0];
  if (!user || !user.department) {
    throw ApiError.badRequest('Department not found for user');
  }

  // 2. Department statistics
  const totalStudents = await getExactCount(
    db.from('profiles').eq('role', 'student').eq('department', user.department),
    'hod_total_students'
  );

  const totalStaff = await getExactCount(
    db.from('profiles').eq('role', 'lecturer').eq('department', user.department),
    'hod_total_staff'
  );

  const totalCourses = await getExactCount(
    db.from('courses').eq('department', user.department),
    'hod_total_courses'
  );

  const activeLecturers = await getExactCount(
    db.from('profiles')
      .eq('role', 'lecturer')
      .eq('department', user.department)
      .eq('is_active', true),
    'hod_active_lecturers'
  );

  // 3. Pending approvals
  const pendingResults = await getExactCount(
    db.from('results')
      .eq('approved_by_hod', false)
      .eq('is_published', false),
    'hod_pending_results'
  );

  const pendingClearances = await getExactCount(
    db.from('clearance').eq('overall_status', 'in-progress'),
    'hod_pending_clearances'
  );

  // 4. Recent enrollments
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

  // 5. Unread notifications
  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'hod_unread_notifications'
  );

  res.json(
    ApiResponse.success('HOD dashboard loaded successfully', {
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

// ─────────────────────────────────────────────────────────────────────────────
// Bursary Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getBursaryDashboard = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;

  if (!userId) {
    throw ApiError.unauthorized('Authentication required');
  }

  // 1. Payment statistics
  const totalPayments = await getExactCount(db.from('payments'), 'bursary_total_payments');

  const verifiedPayments = await getExactCount(
    db.from('payments').eq('status', 'verified'),
    'bursary_verified_payments'
  );

  const pendingPayments = await getExactCount(
    db.from('payments').eq('status', 'pending'),
    'bursary_pending_payments'
  );

  const failedPayments = await getExactCount(
    db.from('payments').eq('status', 'failed'),
    'bursary_failed_payments'
  );

  // 2. Revenue calculations
  const verifiedRows = await getRows<{ amount: number }>(
    db.from('payments').select('amount').eq('status', 'verified'),
    'bursary_verified_amounts'
  );
  const paidAmount = verifiedRows.reduce((sum: number, p) => sum + (Number(p.amount) || 0), 0);

  const totalStudents = await getExactCount(
    db.from('profiles').eq('role', 'student'),
    'bursary_total_students'
  );
  const expectedRevenue = totalStudents * 150000; // Assuming 150,000 per student
  const pendingAmount = expectedRevenue - paidAmount;

  // 3. Recent payments
  const recentPayments = await getRows<PaymentRow & { student?: { id: string; first_name: string; last_name: string; email?: string } }>(
    db
      .from('payments')
      .select('id,amount,status,type,created_at, student:profiles(id,first_name,last_name,email)')
      .order('created_at', { ascending: false })
      .limit(10),
    'bursary_recent_payments'
  );

  // 4. Scholarship statistics (placeholder)
  const totalScholarships = 0;
  const pendingScholarships = 0;

  // 5. Unread notifications
  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'bursary_unread_notifications'
  );

  res.json(
    ApiResponse.success('Bursary dashboard loaded successfully', {
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

// ─────────────────────────────────────────────────────────────────────────────
// Admin Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminDashboard = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin() as any;
  const userId = req.user?.userId;

  if (!userId) {
    throw ApiError.unauthorized('Authentication required');
  }

  // 1. User statistics
  const totalUsers = await getExactCount(db.from('profiles'), 'admin_total_users');
  const totalStudents = await getExactCount(db.from('profiles').eq('role', 'student'), 'admin_total_students');
  const totalLecturers = await getExactCount(db.from('profiles').eq('role', 'lecturer'), 'admin_total_lecturers');
  const totalAdmins = await getExactCount(db.from('profiles').eq('role', 'admin'), 'admin_total_admins');
  const activeUsers = await getExactCount(db.from('profiles').eq('is_active', true), 'admin_active_users');

  // 2. Course statistics
  const totalCourses = await getExactCount(db.from('courses'), 'admin_total_courses');
  const activeCourses = await getExactCount(db.from('courses').eq('is_active', true), 'admin_active_courses');

  // 3. Enrollment statistics
  const totalEnrollments = await getExactCount(db.from('enrollments'), 'admin_total_enrollments');
  const activeEnrollments = await getExactCount(db.from('enrollments').eq('status', 'active'), 'admin_active_enrollments');

  // 4. Payment statistics
  const paymentRows = await getRows<PaymentRow>(
    db.from('payments').select('status,amount'),
    'admin_payment_rows'
  );
  const paymentStatsMap: Record<string, { count: number; totalAmount: number }> = {};
  for (const p of paymentRows) {
    const key = p.status ?? 'unknown';
    if (!paymentStatsMap[key]) paymentStatsMap[key] = { count: 0, totalAmount: 0 };
    paymentStatsMap[key].count += 1;
    paymentStatsMap[key].totalAmount += Number(p.amount) || 0;
  }
  const verifiedPaymentStat = paymentStatsMap['verified'] || { count: 0, totalAmount: 0 };
  const pendingPaymentStat = paymentStatsMap['pending'] || { count: 0, totalAmount: 0 };

  // 5. Hostel statistics
  const totalHostels = await getExactCount(db.from('hostels'), 'admin_total_hostels');
  const totalHostelApplications = await getExactCount(db.from('hostel_applications'), 'admin_total_hostel_applications');
  const approvedApplications = await getExactCount(db.from('hostel_applications').eq('status', 'approved'), 'admin_approved_applications');

  // 6. Academic statistics
  const totalAssignments = await getExactCount(db.from('assignments'), 'admin_total_assignments');
  const totalQuizzes = await getExactCount(db.from('quizzes'), 'admin_total_quizzes');
  const totalSubmissions = await getExactCount(db.from('submissions'), 'admin_total_submissions');

  // 7. Recent activities
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

  // 8. Unread notifications
  const unreadNotifications = await getExactCount(
    db.from('notifications').eq('user_id', userId).is('read_at', null),
    'admin_unread_notifications'
  );

  res.json(
    ApiResponse.success('Admin dashboard loaded successfully', {
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

