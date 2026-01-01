import { Request, Response } from 'express';
import Result from '../models/Result.model';
import Course from '../models/Course.model';
import Session from '../models/Session.model';
import User from '../models/User.model';
import Enrollment from '../models/Enrollment.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import notificationService from '../services/notification.service';
import { USER_ROLES, GRADE_POINTS } from '../utils/constants';
import { calculateGrade, calculateGPA } from '../utils/helpers';

const resolveUserId = (reqUser: any): string | undefined => {
  if (!reqUser) return undefined;
  if (reqUser._id) return reqUser._id.toString();
  return reqUser.userId;
};

const buildTranscriptPayload = async (requester: any, studentId?: string) => {
  if (!studentId) {
    throw ApiError.badRequest('Student ID is required');
  }

  const requesterId = resolveUserId(requester);

  if (requester?.role === USER_ROLES.STUDENT && requesterId !== studentId) {
    throw ApiError.forbidden('You can only access your own transcript');
  }

  const student = await User.findById(studentId);
  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  const results = await Result.find({
    student: studentId,
    isPublished: true,
  })
    .populate('course', 'name code credits')
    .populate('session', 'name')
    .sort({ session: 1, semester: 1 });

  const groupedResults: Record<string, any> = {};
  results.forEach((result: any) => {
    const key = `${result.session.name}-${result.semester}`;
    if (!groupedResults[key]) {
      groupedResults[key] = {
        session: result.session.name,
        semester: result.semester,
        results: [],
      };
    }
    groupedResults[key].results.push(result);
  });

  Object.keys(groupedResults).forEach((key) => {
    const group = groupedResults[key];
    const gpa = calculateGPA(
      group.results.map((r: any) => ({
        totalScore: r.totalScore,
        gradePoints: r.gradePoints,
        credits: r.course.credits,
      }))
    );
    group.gpa = gpa;
  });

  const allResults = results.map((r: any) => ({
    totalScore: r.totalScore,
    gradePoints: r.gradePoints,
    credits: r.course.credits,
  }));
  const cgpa = calculateGPA(allResults);

  return {
    student: {
      id: student._id,
      name: `${student.firstName} ${student.lastName}`,
      email: student.email,
      studentId: student.studentId,
    },
    grouped: Object.values(groupedResults),
    cgpa,
    totalCourses: results.length,
    totalCredits: results.reduce((sum: number, r: any) => sum + r.course.credits, 0),
  };
};

/**
 * @desc    Create/Enter result
 * @route   POST /api/v1/results
 * @access  Private (Lecturer, Admin)
 */
export const createResult = asyncHandler(async (req: Request, res: Response) => {
  const { student, course, session, semester, caScore, examScore } = req.body;

  // Verify all references exist
  const [studentExists, courseExists, sessionExists] = await Promise.all([
    User.findById(student),
    Course.findById(course),
    Session.findById(session),
  ]);

  if (!studentExists) throw ApiError.notFound('Student not found');
  if (!courseExists) throw ApiError.notFound('Course not found');
  if (!sessionExists) throw ApiError.notFound('Session not found');

  // Verify student is enrolled in course
  const enrollment = await Enrollment.findOne({
    student,
    course,
    status: 'active',
  });

  if (!enrollment) {
    throw ApiError.badRequest('Student is not enrolled in this course');
  }

  // Check if result already exists
  const existingResult = await Result.findOne({
    student,
    course,
    session,
    semester,
  });

  if (existingResult) {
    throw ApiError.badRequest('Result already exists for this student, course, and session');
  }

  // Calculate total score and grade
  const totalScore = caScore + examScore;
  const grade = calculateGrade(totalScore);
  const gradePoints = GRADE_POINTS[grade];

  const result = await Result.create({
    student,
    course,
    session,
    semester,
    caScore,
    examScore,
    totalScore,
    grade,
    gradePoints,
    enteredBy: (req as any).user._id,
    approvedByHOD: false,
    approvedByAdmin: false,
    isPublished: false,
  });

  res.status(201).json(ApiResponse.success('Result created successfully', result));
});

/**
 * @desc    Get all results (with filtering)
 * @route   GET /api/v1/results
 * @access  Private
 */
export const getResults = asyncHandler(async (req: Request, res: Response) => {
  const { student, course, session, semester, published, page = 1, limit = 20 } = req.query;

  const query: any = {};

  // Role-based filtering
  if ((req as any).user.role === USER_ROLES.STUDENT) {
    query.student = (req as any).user._id;
    query.isPublished = true; // Students can only see published results
  } else {
    if (student) query.student = student;
    if (published !== undefined) query.isPublished = published === 'true';
  }

  if (course) query.course = course;
  if (session) query.session = session;
  if (semester) query.semester = semester;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [results, total] = await Promise.all([
    Result.find(query)
      .populate('student', 'firstName lastName email studentId')
      .populate('course', 'name code credits')
      .populate('session', 'name startDate endDate')
      .populate('enteredBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Result.countDocuments(query),
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      results,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    })
  );
});

/**
 * @desc    Get single result by ID
 * @route   GET /api/v1/results/:id
 * @access  Private
 */
export const getResultById = asyncHandler(async (req: Request, res: Response) => {
  const result = await Result.findById(req.params.id)
    .populate('student', 'firstName lastName email studentId')
    .populate('course', 'name code credits')
    .populate('session', 'name')
    .populate('enteredBy', 'firstName lastName')
    .populate('hodApprovedBy', 'firstName lastName')
    .populate('adminApprovedBy', 'firstName lastName');

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  // Students can only view their own published results
  if (
    (req as any).user.role === USER_ROLES.STUDENT &&
    (result.student.toString() !== (req as any).user._id.toString() || !result.isPublished)
  ) {
    throw ApiError.forbidden('You are not authorized to view this result');
  }

  res.json(ApiResponse.success('Data retrieved successfully', result));
});

/**
 * @desc    Update result
 * @route   PUT /api/v1/results/:id
 * @access  Private (Lecturer who entered it, Admin)
 */
export const updateResult = asyncHandler(async (req: Request, res: Response) => {
  const result = await Result.findById(req.params.id);

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  // Check if result is already approved
  if (result.approvedByHOD || result.approvedByAdmin) {
    throw ApiError.badRequest('Cannot update approved results');
  }

  // Check authorization
  if (
    (req as any).user.role !== USER_ROLES.ADMIN &&
    result.enteredBy.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to update this result');
  }

  const { caScore, examScore } = req.body;

  if (caScore !== undefined) {
    result.caScore = caScore;
  }
  if (examScore !== undefined) {
    result.examScore = examScore;
  }

  // Recalculate
  result.totalScore = result.caScore + result.examScore;
  result.grade = calculateGrade(result.totalScore);
  result.gradePoints = GRADE_POINTS[result.grade];

  await result.save();

  res.json(ApiResponse.success('Result updated successfully', result));
});

/**
 * @desc    Delete result
 * @route   DELETE /api/v1/results/:id
 * @access  Private (Admin only)
 */
export const deleteResult = asyncHandler(async (req: Request, res: Response) => {
  const result = await Result.findById(req.params.id);

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  if (result.isPublished) {
    throw ApiError.badRequest('Cannot delete published results');
  }

  await result.deleteOne();

  res.json(ApiResponse.success('Result deleted successfully', null));
});

/**
 * @desc    Approve result by HOD
 * @route   PUT /api/v1/results/:id/approve-hod
 * @access  Private (HOD)
 */
export const approveResultByHOD = asyncHandler(async (req: Request, res: Response) => {
  const result = await Result.findById(req.params.id).populate('course');

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  if (result.approvedByHOD) {
    throw ApiError.badRequest('Result already approved by HOD');
  }

  result.approvedByHOD = true;
  result.hodApprovedBy = (req as any).user._id;
  result.hodApprovedAt = new Date();

  await result.save();

  res.json(ApiResponse.success('Result approved by HOD successfully', result));
});

export const rejectResultByHOD = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body;
  const result = await Result.findById(req.params.id);

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  if (result.approvedByHOD) {
    throw ApiError.badRequest('Approved results cannot be rejected');
  }

  result.hodRejectionReason = reason || 'No reason provided';
  result.hodRejectedBy = (req as any).user._id;
  result.hodRejectedAt = new Date();

  await result.save();

  res.json(ApiResponse.success('Result rejected by HOD successfully', result));
});

/**
 * @desc    Approve result by Admin
 * @route   PUT /api/v1/results/:id/approve-admin
 * @access  Private (Admin)
 */
export const approveResultByAdmin = asyncHandler(async (req: Request, res: Response) => {
  const result = await Result.findById(req.params.id);

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  if (!result.approvedByHOD) {
    throw ApiError.badRequest('Result must be approved by HOD first');
  }

  if (result.approvedByAdmin) {
    throw ApiError.badRequest('Result already approved by Admin');
  }

  result.approvedByAdmin = true;
  result.adminApprovedBy = (req as any).user._id;
  result.adminApprovedAt = new Date();

  await result.save();

  res.json(ApiResponse.success('Result approved by Admin successfully', result));
});

/**
 * @desc    Publish results (make visible to students)
 * @route   PUT /api/v1/results/publish
 * @access  Private (Admin)
 */
export const publishResults = asyncHandler(async (req: Request, res: Response) => {
  const { session, semester } = req.body;

  if (!session || !semester) {
    throw ApiError.badRequest('Session and semester are required');
  }

  // Only publish fully approved results
  const results = await Result.updateMany(
    {
      session,
      semester,
      approvedByHOD: true,
      approvedByAdmin: true,
      isPublished: false,
    },
    {
      isPublished: true,
      publishedAt: new Date(),
    }
  );

  // Notify affected students
  const publishedResults = await Result.find({
    session,
    semester,
    isPublished: true,
  }).distinct('student');

  if (publishedResults.length > 0) {
    await notificationService.createBulkNotifications(
      publishedResults.map((id: any) => id.toString()),
      'success',
      'Results Published',
      `Your results for ${semester} semester have been published. Check your portal to view.`
    );
  }

  res.json(
    ApiResponse.success('Results published successfully', { modifiedCount: results.modifiedCount })
  );
});

/**
 * @desc    Get student transcript (all results)
 * @route   GET /api/v1/results/transcript/:studentId
 * @access  Private
 */
export const getTranscript = asyncHandler(async (req: Request, res: Response) => {
  const payload = await buildTranscriptPayload((req as any).user, req.params.studentId);
  res.json(ApiResponse.success('Data retrieved successfully', payload));
});

export const getMyTranscript = asyncHandler(async (req: Request, res: Response) => {
  const payload = await buildTranscriptPayload((req as any).user, resolveUserId((req as any).user));
  res.json(ApiResponse.success('Data retrieved successfully', payload));
});

/**
 * @desc    Get semester results summary
 * @route   GET /api/v1/results/summary/:studentId
 * @access  Private
 */
export const getResultsSummary = asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { session, semester } = req.query;

  // Students can only access their own summary
  if ((req as any).user.role === USER_ROLES.STUDENT && (req as any).user._id.toString() !== studentId) {
    throw ApiError.forbidden('You can only access your own results');
  }

  const query: any = {
    student: studentId,
    isPublished: true,
  };

  if (session) query.session = session;
  if (semester) query.semester = semester;

  const results = await Result.find(query).populate('course', 'name code credits');

  if (results.length === 0) {
    res.json(ApiResponse.success('Data retrieved successfully', { message: 'No results found' }));
    return;
  }

  const gpa = calculateGPA(
    results.map((r: any) => ({
      totalScore: r.totalScore,
      gradePoints: r.gradePoints,
      credits: r.course.credits,
    }))
  );

  const summary = {
    totalCourses: results.length,
    totalCredits: results.reduce((sum: number, r: any) => sum + r.course.credits, 0),
    gpa,
    gradeDistribution: {
      A: results.filter((r: any) => r.grade === 'A').length,
      B: results.filter((r: any) => r.grade === 'B').length,
      C: results.filter((r: any) => r.grade === 'C').length,
      D: results.filter((r: any) => r.grade === 'D').length,
      E: results.filter((r: any) => r.grade === 'E').length,
      F: results.filter((r: any) => r.grade === 'F').length,
    },
    results,
  };

  res.json(ApiResponse.success('Data retrieved successfully', summary));
});
