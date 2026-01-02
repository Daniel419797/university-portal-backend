import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
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
  const db = supabaseAdmin();
  const { course, title, description, dueDate, totalMarks, attachmentUrl } = req.body;
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  // Verify course exists
  const { data: courseExists, error: courseError } = await db
    .from('courses')
    .select('lecturer_id')
    .eq('id', course)
    .maybeSingle();

  if (courseError) throw ApiError.internal(`Failed to fetch course: ${courseError.message}`);
  if (!courseExists) throw ApiError.notFound('Course not found');

  // Verify user is lecturer of this course or admin
  if (
    req.user?.role !== USER_ROLES.ADMIN &&
    courseExists.lecturer_id !== userId
  ) {
    throw ApiError.forbidden('You are not authorized to create assignments for this course');
  }

  // Handle file attachments if provided
  let attachment = attachmentUrl;
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    const uploadResults = await uploadService.uploadMultipleFiles(req.files, 'assignments');
    attachment = uploadResults[0]?.url;
  }

  const { data: assignment, error } = await db
    .from('assignments')
    .insert({
      course_id: course,
      lecturer_id: userId,
      title,
      description,
      due_date: dueDate,
      total_marks: totalMarks,
      attachment_url: attachment,
      is_published: true,
    })
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to create assignment: ${error.message}`);

  // Notify enrolled students
  const { data: enrollments } = await db
    .from('enrollments')
    .select('student_id')
    .eq('course_id', course)
    .eq('status', 'active');

  if (enrollments && enrollments.length > 0) {
    const studentIds = enrollments.map((e) => e.student_id);
    await notificationService.createBulkNotifications(
      studentIds,
      'info',
      'New Assignment Posted',
      `New assignment "${title}" has been posted. Due date: ${new Date(dueDate).toLocaleDateString()}`
    );
  }

  res.status(201).json(ApiResponse.success('Assignment created successfully', assignment));
});

/**
 * @desc    Get all assignments (with filtering)
 * @route   GET /api/v1/assignments
 * @access  Private
 */
export const getAssignments = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { course, page = 1, limit = 20 } = req.query;
  const userId = req.user?.userId || req.user?._id?.toString();

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  let query = db
    .from('assignments')
    .select('*, courses(title, code), lecturer:profiles!assignments_lecturer_id_fkey(first_name, last_name)', { count: 'exact' });

  // Filter by course
  if (course) {
    query = query.eq('course_id', course);
  }

  // If student, only show assignments for enrolled courses
  if (req.user?.role === USER_ROLES.STUDENT) {
    const { data: enrollments } = await db
      .from('enrollments')
      .select('course_id')
      .eq('student_id', userId)
      .eq('status', 'active');

    if (enrollments && enrollments.length > 0) {
      const courseIds = enrollments.map((e) => e.course_id);
      query = query.in('course_id', courseIds);
    } else {
      // No enrollments, return empty
      return res.json(
        ApiResponse.success('Data retrieved successfully', {
          assignments: [],
          pagination: { total: 0, page: pageNum, pages: 0, limit: limitNum },
        })
      );
    }
  }

  const { data, error, count } = await query
    .order('due_date', { ascending: true })
    .range(skip, skip + limitNum - 1);

  if (error) throw ApiError.internal(`Failed to fetch assignments: ${error.message}`);

  return res.json(
    ApiResponse.success('Data retrieved successfully', {
      assignments: data,
      pagination: {
        total: count || 0,
        page: pageNum,
        pages: Math.ceil((count || 0) / limitNum),
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
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('assignments')
    .select('*, courses(title, code), lecturer:profiles!assignments_lecturer_id_fkey(first_name, last_name, email)')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw ApiError.internal(`Failed to fetch assignment: ${error.message}`);
  if (!data) throw ApiError.notFound('Assignment not found');

  res.json(ApiResponse.success('Data retrieved successfully', data));
});

/**
 * @desc    Update assignment
 * @route   PUT /api/v1/assignments/:id
 * @access  Private (Lecturer who created it, Admin)
 */
export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  const { data: assignment, error: fetchError } = await db
    .from('assignments')
    .select('lecturer_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) throw ApiError.internal(`Failed to fetch assignment: ${fetchError.message}`);
  if (!assignment) throw ApiError.notFound('Assignment not found');

  // Check authorization
  if (req.user?.role !== USER_ROLES.ADMIN && assignment.lecturer_id !== userId) {
    throw ApiError.forbidden('You are not authorized to update this assignment');
  }

  const { title, description, dueDate, totalMarks } = req.body;
  const patch: Record<string, unknown> = {};
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (dueDate !== undefined) patch.due_date = dueDate;
  if (totalMarks !== undefined) patch.total_marks = totalMarks;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from('assignments')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to update assignment: ${error.message}`);

  res.json(ApiResponse.success('Assignment updated successfully', data));
});

/**
 * @desc    Delete assignment
 * @route   DELETE /api/v1/assignments/:id
 * @access  Private (Lecturer who created it, Admin)
 */
export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  const { data: assignment, error: fetchError } = await db
    .from('assignments')
    .select('lecturer_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) throw ApiError.internal(`Failed to fetch assignment: ${fetchError.message}`);
  if (!assignment) throw ApiError.notFound('Assignment not found');

  // Check authorization
  if (req.user?.role !== USER_ROLES.ADMIN && assignment.lecturer_id !== userId) {
    throw ApiError.forbidden('You are not authorized to delete this assignment');
  }

  const { error } = await db.from('assignments').delete().eq('id', req.params.id);

  if (error) throw ApiError.internal(`Failed to delete assignment: ${error.message}`);

  res.json(ApiResponse.success('Assignment deleted successfully', null));
});

/**
 * @desc    Submit assignment
 * @route   POST /api/v1/assignments/:id/submit
 * @access  Private (Student)
 */
export const submitAssignment = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: assignment, error: assignmentError } = await db
    .from('assignments')
    .select('course_id, due_date, total_marks')
    .eq('id', req.params.id)
    .maybeSingle();

  if (assignmentError) throw ApiError.internal(`Failed to fetch assignment: ${assignmentError.message}`);
  if (!assignment) throw ApiError.notFound('Assignment not found');

  // Check if student is enrolled in the course
  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', userId)
    .eq('course_id', assignment.course_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!enrollment) {
    throw ApiError.forbidden('You are not enrolled in this course');
  }

  // Check if already submitted
  const { data: existingSubmission } = await db
    .from('submissions')
    .select('id')
    .eq('assignment_id', req.params.id)
    .eq('student_id', userId)
    .maybeSingle();

  if (existingSubmission) {
    throw ApiError.badRequest('You have already submitted this assignment');
  }

  // Upload files
  if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
    throw ApiError.badRequest('Please upload at least one file');
  }

  const uploadResults = await uploadService.uploadMultipleFiles(
    req.files as Express.Multer.File[],
    'submissions'
  );

  const { data: submission, error } = await db
    .from('submissions')
    .insert({
      assignment_id: req.params.id,
      student_id: userId,
      content: req.body.comment || '',
      file_url: uploadResults[0]?.url || null,
    })
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to submit assignment: ${error.message}`);

  res.status(201).json(ApiResponse.success('Assignment submitted successfully', submission));
});

/**
 * @desc    Get submissions for an assignment
 * @route   GET /api/v1/assignments/:id/submissions
 * @access  Private (Lecturer of course, Admin)
 */
export const getAssignmentSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  const { data: assignment, error: assignmentError } = await db
    .from('assignments')
    .select('course_id, courses!inner(lecturer_id)')
    .eq('id', req.params.id)
    .maybeSingle();

  if (assignmentError) throw ApiError.internal(`Failed to fetch assignment: ${assignmentError.message}`);
  if (!assignment) throw ApiError.notFound('Assignment not found');

  // Check authorization
  const course = (assignment as { courses?: Array<{ lecturer_id: string }> }).courses?.[0];
  if (req.user?.role !== USER_ROLES.ADMIN && (!course || course.lecturer_id !== userId)) {
    throw ApiError.forbidden('You are not authorized to view submissions for this assignment');
  }

  const { data, error } = await db
    .from('submissions')
    .select('*, student:profiles!submissions_student_id_fkey(first_name, last_name, email, student_id), grader:profiles!submissions_graded_by_fkey(first_name, last_name)')
    .eq('assignment_id', req.params.id)
    .order('submitted_at', { ascending: false });

  if (error) throw ApiError.internal(`Failed to fetch submissions: ${error.message}`);

  res.json(ApiResponse.success('Data retrieved successfully', data));
});

/**
 * @desc    Grade a submission
 * @route   PUT /api/v1/assignments/:assignmentId/submissions/:submissionId/grade
 * @access  Private (Lecturer of course, Admin)
 */
export const gradeSubmission = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { assignmentId, submissionId } = req.params;
  const { grade, feedback } = req.body;
  const userId = req.user?.userId || req.user?._id?.toString();

  const { data: assignment, error: assignmentError } = await db
    .from('assignments')
    .select('total_marks, courses!inner(lecturer_id)')
    .eq('id', assignmentId)
    .maybeSingle();

  if (assignmentError) throw ApiError.internal(`Failed to fetch assignment: ${assignmentError.message}`);
  if (!assignment) throw ApiError.notFound('Assignment not found');

  // Check authorization
  const course = (assignment as { courses?: Array<{ lecturer_id: string }> }).courses?.[0];
  if (req.user?.role !== USER_ROLES.ADMIN && (!course || course.lecturer_id !== userId)) {
    throw ApiError.forbidden('You are not authorized to grade submissions for this assignment');
  }

  const { data: submission, error: submissionFetchError } = await db
    .from('submissions')
    .select('student_id')
    .eq('id', submissionId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (submissionFetchError) throw ApiError.internal(`Failed to fetch submission: ${submissionFetchError.message}`);
  if (!submission) throw ApiError.notFound('Submission not found');

  // Validate grade
  if (grade < 0 || grade > assignment.total_marks) {
    throw ApiError.badRequest(`Grade must be between 0 and ${assignment.total_marks}`);
  }

  const { data: updated, error } = await db
    .from('submissions')
    .update({
      score: grade,
      feedback,
      graded_by: userId,
      graded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to grade submission: ${error.message}`);

  // Notify student
  await notificationService.createNotification(
    submission.student_id,
    'success',
    'Assignment Graded',
    `Your submission has been graded. Score: ${grade}/${assignment.total_marks}`
  );

  res.json(ApiResponse.success('Submission graded successfully', updated));
});

/**
 * @desc    Get current student's submission for an assignment
 * @route   GET /api/v1/students/assignments/:id/submission
 * @access  Private (Student)
 */
export const getAssignmentSubmissionForStudent = asyncHandler(
  async (req: Request, res: Response) => {
    const db = supabaseAdmin();
    const studentId = req.user?.userId || req.user?._id?.toString();
    const { id: assignmentId } = req.params;

    if (!studentId) throw ApiError.unauthorized('User not authenticated');

    const { data: assignment } = await db
      .from('assignments')
      .select('id')
      .eq('id', assignmentId)
      .maybeSingle();

    if (!assignment) throw ApiError.notFound('Assignment not found');

    const { data: submission, error } = await db
      .from('submissions')
      .select(
        '*, grader:profiles!submissions_graded_by_fkey(first_name, last_name, email), assignment:assignments(title, due_date, total_marks)'
      )
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (error) throw ApiError.internal(`Failed to fetch submission: ${error.message}`);
    if (!submission) throw ApiError.notFound('Submission not found');

    res.json(ApiResponse.success('Data retrieved successfully', submission));
  }
);
