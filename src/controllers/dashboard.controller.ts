import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import User from '../models/User.model';
import Course from '../models/Course.model';
import Enrollment from '../models/Enrollment.model';
import Assignment from '../models/Assignment.model';
import Submission from '../models/Submission.model';
import Quiz from '../models/Quiz.model';
import Result from '../models/Result.model';
import Payment from '../models/Payment.model';
import Hostel from '../models/Hostel.model';
import HostelApplication from '../models/HostelApplication.model';
import Notification from '../models/Notification.model';
import Clearance from '../models/Clearance.model';

// @desc    Get Student Dashboard
// @route   GET /api/v1/students/dashboard
// @access  Private (Student)
export const getStudentDashboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  // Get enrolled courses count
  const enrolledCourses = await Enrollment.countDocuments({
    student: userId,
    status: 'active'
  });

  // Get pending assignments
  const activeEnrollments = await Enrollment.find({
    student: userId,
    status: 'active'
  }).select('course');

  const courseIds = activeEnrollments.map(e => e.course);

  const assignments = await Assignment.find({
    course: { $in: courseIds },
    dueDate: { $gte: new Date() }
  });

  const submittedAssignmentIds = await Submission.find({
    student: userId,
    assignment: { $in: assignments.map(a => a._id) }
  }).distinct('assignment');

  const pendingAssignments = assignments.filter(
    a => !submittedAssignmentIds.includes(a._id.toString() as any)
  ).length;

  // Get CGPA
  const results = await Result.find({
    student: userId,
    isPublished: true
  }).populate('course', 'credits');

  let cgpa = 0;
  if (results.length > 0) {
    const totalGradePoints = results.reduce((sum, r) => sum + (r.gradePoints || 0), 0);
    const totalCredits = results.reduce((sum, r) => sum + (((r.course as any)?.credits) || 0), 0);
    cgpa = totalCredits > 0 ? totalGradePoints / totalCredits : 0;
  }

  // Get payment status
  const latestPayment = await Payment.findOne({
    student: userId,
    status: 'verified'
  }).sort({ createdAt: -1 });

  const paymentStatus = latestPayment ? 'Verified' : 'Pending';

  // Get recent courses
  const recentCourses = await Enrollment.find({
    student: userId,
    status: 'active'
  })
    .populate('course', 'title code credits')
    .limit(5)
    .sort({ createdAt: -1 });

  // Get recent assignments
  const recentAssignments = await Assignment.find({
    course: { $in: courseIds }
  })
    .populate('course', 'title code')
    .limit(5)
    .sort({ createdAt: -1 });

  // Get unread notifications count
  const unreadNotifications = await Notification.countDocuments({
    user: userId,
    isRead: false
  });

  res.json(
    ApiResponse.success('Dashboard data fetched successfully', {
      enrolledCourses,
      pendingAssignments,
      cgpa: parseFloat(cgpa.toFixed(2)),
      paymentStatus,
      recentCourses: recentCourses.map(e => ({
        id: (e.course as any)._id,
        title: (e.course as any).title,
        code: (e.course as any).code,
        credits: (e.course as any).credits
      })),
      recentAssignments: recentAssignments.map(a => ({
        id: a._id,
        title: a.title,
        course: {
          title: (a.course as any).title,
          code: (a.course as any).code
        },
        deadline: a.dueDate,
        totalMarks: a.totalMarks
      })),
      unreadNotifications
    })
  );
});

// @desc    Get Lecturer Dashboard
// @route   GET /api/v1/lecturers/dashboard
// @access  Private (Lecturer)
export const getLecturerDashboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  // Get assigned courses
   const assignedCourses = await Course.countDocuments({
     lecturer: userId
   });

  // Get total students across all courses
   const courses = await Course.find({ lecturer: userId }).select('_id');
  const courseIds = courses.map(c => c._id);

  const totalStudents = await Enrollment.countDocuments({
    course: { $in: courseIds },
    status: 'active'
  });

  // Get pending submissions
   const assignments = await Assignment.find({
     course: { $in: courseIds }
   }).select('_id');

  const assignmentIds = assignments.map(a => a._id);

   const pendingSubmissions = await Submission.countDocuments({
     assignment: { $in: assignmentIds },
     grade: { $exists: false }
   });

  // Get pending quiz grading
  const quizzes = await Quiz.find({
    course: { $in: courseIds }
  }).select('_id');

  // Get recent courses with student count
   const recentCourses = await Course.find({ lecturer: userId })
    .limit(5)
    .sort({ createdAt: -1 })
    .lean();

  const recentCoursesWithStats = await Promise.all(
    recentCourses.map(async (course) => {
      const studentCount = await Enrollment.countDocuments({
        course: course._id,
        status: 'active'
      });
      return {
        id: course._id,
        title: course.title,
        code: course.code,
        studentCount
      };
    })
  );

  // Get recent assignments
  const recentAssignments = await Assignment.find({
    course: { $in: courseIds }
  })
    .populate('course', 'title code')
    .limit(5)
    .sort({ createdAt: -1 });

  // Get unread notifications
   const unreadNotifications = await Notification.countDocuments({
     user: userId,
     isRead: false
   });

  res.json(
    ApiResponse.success('Dashboard data fetched successfully', {
      assignedCourses,
      totalStudents,
      pendingSubmissions,
      pendingQuizzes: quizzes.length,
      recentCourses: recentCoursesWithStats,
      recentAssignments: recentAssignments.map(a => ({
        id: a._id,
        title: a.title,
        course: {
          title: (a.course as any).title,
          code: (a.course as any).code
        },
        deadline: a.dueDate,
        totalMarks: a.totalMarks
      })),
      unreadNotifications
    })
  );
});

// @desc    Get HOD Dashboard
// @route   GET /api/v1/hod/dashboard
// @access  Private (HOD)
export const getHODDashboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const user = await User.findById(userId);

  if (!user || !user.department) {
    res.status(400);
    throw new Error('Department not found for user');
  }

  // Get department statistics
  const totalStudents = await User.countDocuments({
    role: 'student',
    department: user.department
  });

  const totalStaff = await User.countDocuments({
    role: 'lecturer',
    department: user.department
  });

  const totalCourses = await Course.countDocuments({
    department: user.department
  });

  const activeLecturers = await User.countDocuments({
    role: 'lecturer',
    department: user.department,
    isActive: true
  });

  // Get pending approvals
  const pendingResults = await Result.countDocuments({
    approvedByHOD: false,
    isPublished: false
  });

  const pendingClearances = await Clearance.countDocuments({
    overallStatus: 'in-progress'
  });

  // Get recent activities (course registrations, etc.)
  const departmentCourseIds = await Course.find({ department: user.department }).distinct('_id');

  const recentEnrollments = await Enrollment.find({
    status: 'active',
    course: { $in: departmentCourseIds }
  })
    .populate('student', 'firstName lastName')
    .populate('course', 'title code')
    .limit(10)
    .sort({ createdAt: -1 });

  // Get unread notifications
  const unreadNotifications = await Notification.countDocuments({
    user: userId,
    isRead: false
  });

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
      recentActivities: recentEnrollments.map(e => ({
        id: e._id,
        type: 'enrollment',
        student: (e.student as any).firstName + ' ' + (e.student as any).lastName,
        course: (e.course as any).code + ' - ' + (e.course as any).title,
        date: e.createdAt
      })),
      unreadNotifications
    })
  );
});

// @desc    Get Bursary Dashboard
// @route   GET /api/v1/bursary/dashboard
// @access  Private (Bursary)
export const getBursaryDashboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  // Get payment statistics
  const totalPayments = await Payment.countDocuments({});

  const verifiedPayments = await Payment.countDocuments({
    status: 'verified'
  });

  const pendingPayments = await Payment.countDocuments({
    status: 'pending'
  });

  const failedPayments = await Payment.countDocuments({
    status: 'failed'
  });

  // Get revenue statistics
  const revenueAggregation = await Payment.aggregate([
    { $match: { status: 'verified' } },
    {
      $group: {
        _id: null,
        paidAmount: { $sum: '$amount' }
      }
    }
  ]);

  const paidAmount = revenueAggregation.length > 0 ? revenueAggregation[0].paidAmount : 0;

  // Calculate expected total (all students should pay)
  const totalStudents = await User.countDocuments({ role: 'student' });
  const expectedRevenue = totalStudents * 150000; // Assuming 150,000 per student
  const pendingAmount = expectedRevenue - paidAmount;

  // Get recent payments
  const recentPayments = await Payment.find({})
    .populate('student', 'firstName lastName email')
    .populate('session', 'name')
    .limit(10)
    .sort({ createdAt: -1 });

  // Get scholarship statistics (placeholder for now)
  const totalScholarships = 0;
  const pendingScholarships = 0;

  // Get unread notifications
  const unreadNotifications = await Notification.countDocuments({
    user: userId,
    isRead: false
  });

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
      recentPayments: recentPayments.map(p => ({
        id: p._id,
        student: {
          name: (p.student as any).firstName + ' ' + (p.student as any).lastName,
          email: (p.student as any).email
        },
        amount: p.amount,
        status: p.status,
        paymentType: p.type,
        date: p.createdAt
      })),
      unreadNotifications
    })
  );
});

// @desc    Get Admin Dashboard
// @route   GET /api/v1/admin/dashboard
// @access  Private (Admin)
export const getAdminDashboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  // Get user statistics
  const totalUsers = await User.countDocuments({});
  const totalStudents = await User.countDocuments({ role: 'student' });
  const totalLecturers = await User.countDocuments({ role: 'lecturer' });
  const totalAdmins = await User.countDocuments({ role: 'admin' });
  const activeUsers = await User.countDocuments({ isActive: true });

  // Get course statistics
  const totalCourses = await Course.countDocuments({});
  const activeCourses = await Course.countDocuments({ isActive: true });

  // Get enrollment statistics
  const totalEnrollments = await Enrollment.countDocuments({});
  const activeEnrollments = await Enrollment.countDocuments({ status: 'active' });

  // Get payment statistics
  const paymentStats = await Payment.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  const verifiedPaymentStat = paymentStats.find(p => p._id === 'verified') || { count: 0, totalAmount: 0 };
  const pendingPaymentStat = paymentStats.find(p => p._id === 'pending') || { count: 0, totalAmount: 0 };

  // Get hostel statistics
  const totalHostels = await Hostel.countDocuments({});
  const totalHostelApplications = await HostelApplication.countDocuments({});
  const approvedApplications = await HostelApplication.countDocuments({ status: 'approved' });

  // Get assignment and quiz statistics
  const totalAssignments = await Assignment.countDocuments({});
  const totalQuizzes = await Quiz.countDocuments({});
  const totalSubmissions = await Submission.countDocuments({});

  // Get recent activities
  const recentUsers = await User.find({})
    .select('firstName lastName email role createdAt')
    .limit(5)
    .sort({ createdAt: -1 });

  const recentPayments = await Payment.find({})
    .populate('student', 'firstName lastName')
    .limit(5)
    .sort({ createdAt: -1 });

  // Get unread notifications
  const unreadNotifications = await Notification.countDocuments({
    user: userId,
    isRead: false
  });

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
      recentUsers: recentUsers.map(u => ({
        id: u._id,
        name: u.firstName + ' ' + u.lastName,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt
      })),
      recentPayments: recentPayments.map(p => ({
        id: p._id,
        student: (p.student as any)?.firstName + ' ' + (p.student as any)?.lastName,
        amount: p.amount,
        status: p.status,
        createdAt: p.createdAt
      })),
      unreadNotifications
    })
  );
});
