import { Request, Response } from 'express';
import Assignment from '../models/Assignment.model';
import Submission from '../models/Submission.model';
import Course from '../models/Course.model';
import Enrollment from '../models/Enrollment.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import uploadService from '../services/upload.service';
import notificationService from '../services/notification.service';
import { USER_ROLES } from '../utils/constants';

/**
 * @desc    Create new assignment
 * @route   POST /api/v1/assignments
 * @access  Private (Lecturer, Admin)
 */
export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { course, title, description, dueDate, totalMarks, allowLateSubmission, latePenalty } =
    req.body;

  // Verify course exists
  const courseExists = await Course.findById(course);
  if (!courseExists) {
    throw ApiError.notFound('Course not found');
  }

  // Verify user is lecturer of this course or admin
  if (
    (req as any).user.role !== USER_ROLES.ADMIN &&
    courseExists.lecturer.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to create assignments for this course');
  }

  // Handle file attachments if any
  let attachments: { url: string; name: string; size: number }[] = [];
  if (req.files && Array.isArray(req.files)) {
    const uploadResults = await uploadService.uploadMultipleFiles(req.files, 'assignments');
    const filesArray = req.files as Express.Multer.File[];
    attachments = uploadResults.map((result: any, index: number) => ({
      url: result.url,
      name: filesArray[index].originalname,
      size: result.size,
    }));
  }

  const assignment = await Assignment.create({
    course,
    title,
    description,
    dueDate,
    totalMarks,
    attachments,
    allowLateSubmission: allowLateSubmission || false,
    latePenalty: latePenalty || 0,
    createdBy: (req as any).user._id,
  });

  // Notify enrolled students
  const enrollments = await Enrollment.find({ course, status: 'active' }).select('student');
  const studentIds = enrollments.map((e: any) => e.student);

  if (studentIds.length > 0) {
    await notificationService.createBulkNotifications(
      studentIds,
      'info',
      'New Assignment Posted',
      `New assignment "${title}" has been posted for ${(courseExists as any).name}. Due date: ${new Date(
        dueDate
      ).toLocaleDateString()}`
    );
  }

  res
    .status(201)
    .json(ApiResponse.success('Assignment created successfully', assignment));
});

/**
 * @desc    Get all assignments (with filtering)
 * @route   GET /api/v1/assignments
 * @access  Private
 */
export const getAssignments = asyncHandler(async (req: Request, res: Response) => {
  const { course, page = 1, limit = 20 } = req.query;

  const query: Record<string, unknown> = {};

  // Filter by course
  if (course) {
    query.course = course;
  }

  // If student, only show assignments for enrolled courses
  if ((req as any).user.role === USER_ROLES.STUDENT) {
    const enrollments = await Enrollment.find({
      student: (req as any).user._id,
      status: 'active',
    }).select('course');
    const courseIds = enrollments.map((e: any) => e.course);
    query.course = { $in: courseIds };
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [assignments, total] = await Promise.all([
    Assignment.find(query)
      .populate('course', 'name code')
      .populate('createdBy', 'firstName lastName')
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(limitNum),
    Assignment.countDocuments(query),
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      assignments,
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
 * @desc    Get single assignment by ID
 * @route   GET /api/v1/assignments/:id
 * @access  Private
 */
export const getAssignmentById = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await Assignment.findById(req.params.id)
    .populate('course', 'name code')
    .populate('createdBy', 'firstName lastName email');

  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  res.json(ApiResponse.success('Data retrieved successfully', assignment));
});

/**
 * @desc    Update assignment
 * @route   PUT /api/v1/assignments/:id
 * @access  Private (Lecturer who created it, Admin)
 */
export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await Assignment.findById(req.params.id);

  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  // Check authorization
  if (
    (req as any).user.role !== USER_ROLES.ADMIN &&
    assignment.createdBy.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to update this assignment');
  }

  const { title, description, dueDate, totalMarks, allowLateSubmission, latePenalty } = req.body;

  if (title) assignment.title = title;
  if (description) assignment.description = description;
  if (dueDate) assignment.dueDate = dueDate;
  if (totalMarks) assignment.totalMarks = totalMarks;
  if (typeof allowLateSubmission !== 'undefined')
    assignment.allowLateSubmission = allowLateSubmission;
  if (typeof latePenalty !== 'undefined') assignment.latePenalty = latePenalty;

  await assignment.save();

  res.json(ApiResponse.success('Assignment updated successfully', assignment));
});

/**
 * @desc    Delete assignment
 * @route   DELETE /api/v1/assignments/:id
 * @access  Private (Lecturer who created it, Admin)
 */
export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await Assignment.findById(req.params.id);

  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  // Check authorization
  if (
    (req as any).user.role !== USER_ROLES.ADMIN &&
    assignment.createdBy.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to delete this assignment');
  }

  await assignment.deleteOne();

  res.json(ApiResponse.success('Assignment deleted successfully', null));
});

/**
 * @desc    Submit assignment
 * @route   POST /api/v1/assignments/:id/submit
 * @access  Private (Student)
 */
export const submitAssignment = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await Assignment.findById(req.params.id);

  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  // Check if student is enrolled in the course
  const enrollment = await Enrollment.findOne({
    student: (req as any).user._id,
    course: assignment.course,
    status: 'active',
  });

  if (!enrollment) {
    throw ApiError.forbidden('You are not enrolled in this course');
  }

  // Check if already submitted
  const existingSubmission = await Submission.findOne({
    assignment: assignment._id,
    student: (req as any).user._id,
  });

  if (existingSubmission) {
    throw ApiError.badRequest('You have already submitted this assignment');
  }

  // Check if due date passed
  const now = new Date();
  const isLate = now > assignment.dueDate;

  if (isLate && !assignment.allowLateSubmission) {
    throw ApiError.badRequest('Assignment submission deadline has passed');
  }

  // Upload files
  if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
    throw ApiError.badRequest('Please upload at least one file');
  }

  const uploadResults = await uploadService.uploadMultipleFiles(
    req.files as Express.Multer.File[],
    'submissions'
  );

  const filesArray = req.files as Express.Multer.File[];
  const files = uploadResults.map((result: any, index: number) => ({
    url: result.url,
    name: filesArray[index].originalname,
    size: result.size,
    cloudinaryId: result.publicId,
  }));

  const submission = await Submission.create({
    assignment: assignment._id,
    student: (req as any).user._id,
    files,
    comment: req.body.comment,
    isLate,
  });

  res
    .status(201)
    .json(ApiResponse.success('Assignment submitted successfully', submission));
});

/**
 * @desc    Get submissions for an assignment
 * @route   GET /api/v1/assignments/:id/submissions
 * @access  Private (Lecturer of course, Admin)
 */
export const getAssignmentSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await Assignment.findById(req.params.id).populate('course');

  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  // Check authorization
  const course = assignment.course as any;
  if (
    (req as any).user.role !== USER_ROLES.ADMIN &&
    course.lecturer.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to view submissions for this assignment');
  }

  const submissions = await Submission.find({ assignment: assignment._id })
    .populate('student', 'firstName lastName email studentId')
    .populate('gradedBy', 'firstName lastName')
    .sort({ submittedAt: -1 });

  res.json(ApiResponse.success('Data retrieved successfully', submissions));
});

/**
 * @desc    Grade a submission
 * @route   PUT /api/v1/assignments/:assignmentId/submissions/:submissionId/grade
 * @access  Private (Lecturer of course, Admin)
 */
export const gradeSubmission = asyncHandler(async (req: Request, res: Response) => {
  const { assignmentId, submissionId } = req.params;
  const { grade, feedback } = req.body;

  const assignment = await Assignment.findById(assignmentId).populate('course');
  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  // Check authorization
  const course = assignment.course as any;
  if (
    (req as any).user.role !== USER_ROLES.ADMIN &&
    course.lecturer.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to grade submissions for this assignment');
  }

  const submission = await Submission.findOne({
    _id: submissionId,
    assignment: assignmentId,
  });

  if (!submission) {
    throw ApiError.notFound('Submission not found');
  }

  // Validate grade
  if (grade < 0 || grade > assignment.totalMarks) {
    throw ApiError.badRequest(
      `Grade must be between 0 and ${assignment.totalMarks}`
    );
  }

  // Apply late penalty if applicable
  let finalGrade = grade;
  if (submission.isLate && assignment.latePenalty > 0) {
    finalGrade = grade * (1 - assignment.latePenalty / 100);
  }

  submission.grade = finalGrade;
  submission.feedback = feedback;
  submission.gradedBy = (req as any).user._id;
  submission.gradedAt = new Date();

  await submission.save();

  // Notify student
  await notificationService.createNotification(
    submission.student.toString(),
    'success',
    'Assignment Graded',
    `Your submission for "${assignment.title}" has been graded. Score: ${finalGrade}/${assignment.totalMarks}`
  );

  res.json(ApiResponse.success('Submission graded successfully', submission));
});

/**
 * @desc    Get current student's submission for an assignment
 * @route   GET /api/v1/students/assignments/:id/submission
 * @access  Private (Student)
 */
export const getAssignmentSubmissionForStudent = asyncHandler(async (req: Request, res: Response) => {
  const studentId = (req as any).user._id;
  const { id: assignmentId } = req.params;

  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  const submission = await Submission.findOne({
    assignment: assignmentId,
    student: studentId,
  })
    .populate('gradedBy', 'firstName lastName email')
    .populate('assignment', 'title dueDate totalMarks');

  if (!submission) {
    throw ApiError.notFound('Submission not found');
  }

  res.json(ApiResponse.success('Data retrieved successfully', submission));
});
