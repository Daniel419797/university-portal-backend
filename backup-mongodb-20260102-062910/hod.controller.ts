import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Department from '../models/Department.model';
import User from '../models/User.model';
import Course from '../models/Course.model';
import Enrollment from '../models/Enrollment.model';
import Result from '../models/Result.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { calculateGPA } from '../utils/helpers';

const ensureDepartmentForHod = async (hodId: string) => {
  const department = await Department.findOne({ hod: hodId });
  if (!department) {
    throw ApiError.forbidden('You are not assigned to any department');
  }
  return department;
};

const normalizeQueryValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
};

const getPagination = (pageValue: unknown, limitValue: unknown) => {
  const pageNum = Math.max(parseInt(normalizeQueryValue(pageValue) ?? '1', 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(normalizeQueryValue(limitValue) ?? '20', 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;
  return { page: pageNum, limit: limitNum, skip };
};

export const getHodStudents = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const level = normalizeQueryValue(req.query.level);
  const search = normalizeQueryValue(req.query.search);

  const filter: Record<string, any> = {
    role: 'student',
    department: department._id,
  };

  if (level) {
    filter.level = level;
  }

  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { studentId: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const [students, total] = await Promise.all([
    User.find(filter)
      .select('firstName lastName email studentId level phoneNumber isActive createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.json(
    ApiResponse.success('Students retrieved successfully', {
      students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  );
});

export const getHodStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const student = await User.findOne({
    _id: req.params.id,
    role: 'student',
    department: department._id,
  }).select('-password');

  if (!student) {
    throw ApiError.notFound('Student not found in your department');
  }

  const [enrollments, results] = await Promise.all([
    Enrollment.find({ student: student._id })
      .populate('course', 'title code credits lecturer')
      .populate('session', 'name startDate endDate')
      .sort({ createdAt: -1 }),
    Result.find({ student: student._id })
      .populate('course', 'title code credits department')
      .sort({ createdAt: -1 }),
  ]);

  const gpa = calculateGPA(
    results.map((result: any) => ({
      totalScore: result.totalScore,
      gradePoints: result.gradePoints,
      credits: result.course?.credits ?? 0,
    }))
  );

  res.json(
    ApiResponse.success('Student profile retrieved successfully', {
      student,
      enrollments,
      results,
      summary: {
        totalCourses: enrollments.length,
        activeCourses: enrollments.filter((enrollment) => enrollment.status === 'active').length,
        publishedResults: results.filter((result) => result.isPublished).length,
        gpa,
      },
    })
  );
});

export const getHodStaff = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const { page, limit, skip } = getPagination(req.query.page, req.query.limit);
  const search = normalizeQueryValue(req.query.search);

  const filter: Record<string, any> = {
    role: 'lecturer',
    department: department._id,
  };

  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const [staff, total] = await Promise.all([
    User.find(filter)
      .select('firstName lastName email phoneNumber isActive createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.json(
    ApiResponse.success('Staff retrieved successfully', {
      staff,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  );
});

export const getHodStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const staffMember = await User.findOne({
    _id: req.params.id,
    role: 'lecturer',
    department: department._id,
  }).select('-password');

  if (!staffMember) {
    throw ApiError.notFound('Staff member not found in your department');
  }

  const courses = await Course.find({
    lecturer: staffMember._id,
    department: department._id,
  })
    .select('code title level semester credits schedule')
    .sort({ createdAt: -1 });

  const courseIds = courses.map((course) => course._id);

  const activeStudents = courseIds.length
    ? await Enrollment.countDocuments({ course: { $in: courseIds }, status: 'active' })
    : 0;
  const pendingResults = courseIds.length
    ? await Result.countDocuments({ course: { $in: courseIds }, approvedByHOD: false })
    : 0;

  res.json(
    ApiResponse.success('Staff profile retrieved successfully', {
      staff: staffMember,
      courses,
      stats: {
        totalCourses: courses.length,
        activeStudents,
        pendingResults,
      },
    })
  );
});

export const assignCoursesToStaff = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const staffId = req.params.id;
  const { courseIds } = req.body as { courseIds: string[] };

  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw ApiError.badRequest('courseIds array is required');
  }

  if (!courseIds.every((id) => mongoose.Types.ObjectId.isValid(id))) {
    throw ApiError.badRequest('Invalid course identifier supplied');
  }

  const staffMember = await User.findOne({
    _id: staffId,
    role: 'lecturer',
    department: department._id,
  });

  if (!staffMember) {
    throw ApiError.notFound('Staff member not found in your department');
  }

  const courses = await Course.find({
    _id: { $in: courseIds },
    department: department._id,
  }).select('title code');

  if (courses.length !== courseIds.length) {
    throw ApiError.badRequest('One or more courses do not belong to your department');
  }

  await Course.updateMany(
    { _id: { $in: courseIds } },
    { lecturer: staffMember._id }
  );

  res.json(
    ApiResponse.success('Courses assigned successfully', {
      staff: {
        id: staffMember._id,
        name: `${staffMember.firstName} ${staffMember.lastName}`,
      },
      assignedCourses: courses,
    })
  );
});

export const getHodDepartmentProfile = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  return res.json(ApiResponse.success('Department retrieved successfully', department));
});

export const updateHodDepartmentProfile = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const allowedFields = ['name', 'description', 'faculty', 'isActive'];
  const updates: Record<string, any> = {};

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  if (Object.keys(updates).length === 0) {
    throw ApiError.badRequest('No valid fields supplied');
  }

  const updated = await Department.findByIdAndUpdate(department._id, { $set: updates }, { new: true });

  return res.json(ApiResponse.success('Department updated successfully', updated));
});

const collectDepartmentStats = async (departmentId: mongoose.Types.ObjectId) => {
  const [studentCount, staffCount, courseSummary] = await Promise.all([
    User.countDocuments({ role: 'student', department: departmentId }),
    User.countDocuments({ role: 'lecturer', department: departmentId }),
    Course.find({ department: departmentId }).select('_id'),
  ]);

  const courseIds = courseSummary.map((course) => course._id);

  const [activeEnrollments, pendingResults] = await Promise.all([
    courseIds.length
      ? Enrollment.countDocuments({ course: { $in: courseIds }, status: 'active' })
      : 0,
    courseIds.length
      ? Result.countDocuments({ course: { $in: courseIds }, approvedByHOD: false })
      : 0,
  ]);

  return {
    studentCount,
    staffCount,
    courseCount: courseIds.length,
    activeEnrollments,
    pendingResults,
  };
};

export const getHodDepartmentStatistics = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const stats = await collectDepartmentStats(department._id as mongoose.Types.ObjectId);
  return res.json(ApiResponse.success('Department statistics retrieved successfully', stats));
});

export const getHodPendingResults = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const courses = await Course.find({ department: department._id }).select('_id');
  const courseIds = courses.map((course) => course._id);

  if (!courseIds.length) {
    return res.json(ApiResponse.success('No pending results', []));
  }

  const results = await Result.find({ course: { $in: courseIds }, approvedByHOD: false })
    .populate('student', 'firstName lastName studentId level')
    .populate('course', 'title code credits')
    .populate('enteredBy', 'firstName lastName')
    .sort({ createdAt: -1 });

  return res.json(ApiResponse.success('Pending results retrieved successfully', results));
});

export const getHodResultDetail = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const result = await Result.findById(req.params.id)
    .populate('student', 'firstName lastName email studentId level')
    .populate('course', 'title code credits department')
    .populate('enteredBy', 'firstName lastName')
    .populate('hodApprovedBy', 'firstName lastName');

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  const courseDepartment = (result.course as any)?.department?.toString();
  if (!courseDepartment || courseDepartment !== department._id.toString()) {
    throw ApiError.forbidden('You are not authorized to view this result');
  }

  return res.json(ApiResponse.success('Result retrieved successfully', result));
});

export const getHodAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const department = await ensureDepartmentForHod((req as any).user._id);
  const stats = await collectDepartmentStats(department._id as mongoose.Types.ObjectId);
  const courses = await Course.find({ department: department._id }).select('_id');
  const courseIds = courses.map((course) => course._id);

  if (!courseIds.length) {
    return res.json(
      ApiResponse.success('Analytics retrieved successfully', {
        ...stats,
        passRate: 0,
        publishedResults: 0,
      })
    );
  }

  const [publishedResults, passedResults] = await Promise.all([
    Result.countDocuments({ course: { $in: courseIds }, isPublished: true }),
    Result.countDocuments({ course: { $in: courseIds }, isPublished: true, grade: { $ne: 'F' } }),
  ]);

  const passRate = publishedResults
    ? parseFloat(((passedResults / publishedResults) * 100).toFixed(1))
    : 0;

  return res.json(
    ApiResponse.success('Analytics retrieved successfully', {
      ...stats,
      publishedResults,
      passRate,
      averageClassSize:
        stats.courseCount > 0 ? parseFloat((stats.activeEnrollments / stats.courseCount).toFixed(1)) : 0,
    })
  );
});

