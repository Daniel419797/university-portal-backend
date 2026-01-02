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
// 
// Original backup: c:\Users\HP\Desktop\university-portal-backend\backup-mongodb-20260102-062910\quiz.controller.ts
// =============================================================================
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import notificationService from '../services/notification.service';
import { USER_ROLES } from '../utils/constants';

// Typed rows
interface QuizQuestion {
  question: string;
  options?: string[];
  correctAnswer: string;
  marks: number;
}

interface QuizRow {
  id: string;
  course_id: string;
  title: string;
  description?: string | null;
  duration: number; // minutes
  total_marks: number;
  start_date: string; // ISO
  end_date: string; // ISO
  questions: QuizQuestion[];
  created_by: string;
  is_active: boolean;
}

interface QuizAttemptRow {
  id: string;
  quiz_id: string;
  student_id: string;
  total_marks: number;
  duration: number;
  started_at: string;
  answers?: Array<{ questionIndex: number; answer: string; isCorrect: boolean; marksAwarded: number }> | null;
  score?: number | null;
  percentage?: number | null;
  submitted_at?: string | null;
  is_completed: boolean;
}

/**
 * @desc    Create new quiz
 * @route   POST /api/v1/quizzes
 * @access  Private (Lecturer, Admin)
 */
export const createQuiz = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { course, title, description, duration, totalMarks, startDate, endDate, questions } =
    req.body as {
      course: string;
      title: string;
      description?: string;
      duration: number;
      totalMarks: number;
      startDate: string;
      endDate: string;
      questions: QuizQuestion[];
    };

  if (!userId) throw ApiError.unauthorized('User not authenticated');
  if (!course || !title || !duration || !totalMarks || !startDate || !endDate || !questions)
    throw ApiError.badRequest('Missing required fields');

  // Verify course exists and ownership
  const { data: courseRow, error: courseErr } = await db
    .from('courses')
    .select('id, name, lecturer_id')
    .eq('id', course)
    .maybeSingle();
  if (courseErr) throw ApiError.internal(`Failed to fetch course: ${courseErr.message}`);
  if (!courseRow) throw ApiError.notFound('Course not found');
  if (req.user?.role !== USER_ROLES.ADMIN && courseRow.lecturer_id !== userId) {
    throw ApiError.forbidden('You are not authorized to create quizzes for this course');
  }

  // Validate total marks
  const calculatedTotal = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
  if (calculatedTotal !== totalMarks) {
    throw ApiError.badRequest(
      `Total marks (${totalMarks}) must match sum of question marks (${calculatedTotal})`
    );
  }

  // Insert quiz
  const { data: quiz, error } = await db
    .from('quizzes')
    .insert({
      course_id: course,
      title,
      description: description || null,
      duration,
      total_marks: totalMarks,
      start_date: startDate,
      end_date: endDate,
      questions,
      created_by: userId,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to create quiz: ${error.message}`);

  // Notify enrolled students
  const { data: enrollments } = await db
    .from('enrollments')
    .select('student_id')
    .eq('course_id', course)
    .eq('status', 'active');
  const studentIds = (enrollments || []).map((e) => e.student_id);
  if (studentIds.length > 0) {
    await notificationService.createBulkNotifications(
      studentIds,
      'info',
      'New Quiz Available',
      `New quiz "${title}" is available for ${courseRow.name}. Duration: ${duration} minutes`
    );
  }

  res.status(201).json(ApiResponse.success('Quiz created successfully', quiz));
});

/**
 * @desc    Get all quizzes (with filtering)
 * @route   GET /api/v1/quizzes
 * @access  Private
 */
export const getQuizzes = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { course, page = 1, limit = 20, active } = req.query;

  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 20;
  const skip = (pageNum - 1) * limitNum;

  let query = db.from('quizzes').select('*', { count: 'exact' });
  if (course) query = query.eq('course_id', course as string);
  if (active !== undefined) query = query.eq('is_active', String(active) === 'true');

  // If student, only show quizzes for enrolled courses
  if (req.user?.role === USER_ROLES.STUDENT) {
    const { data: enrollments } = await db
      .from('enrollments')
      .select('course_id')
      .eq('student_id', userId)
      .eq('status', 'active');
    const courseIds = (enrollments || []).map((e) => e.course_id);
    if (courseIds.length === 0) {
      res.json(
        ApiResponse.success('Data retrieved successfully', {
          quizzes: [],
          pagination: { total: 0, page: pageNum, pages: 0, limit: limitNum },
        })
      );
      return;
    }
    query = query.in('course_id', courseIds);
  }

  const { data, error, count } = await query
    .order('start_date', { ascending: false })
    .range(skip, skip + limitNum - 1);
  if (error) throw ApiError.internal(`Failed to fetch quizzes: ${error.message}`);

  const items = (data || []) as QuizRow[];
  // Hide correctAnswer in response
  const safeQuizzes = items.map((qz) => ({
    ...qz,
    questions: (qz.questions || []).map((q) => {
      const { question, options, marks } = q as QuizQuestion;
      return { question, options, marks };
    }),
  }));

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      quizzes: safeQuizzes,
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
 * @desc    Get single quiz by ID
 * @route   GET /api/v1/quizzes/:id
 * @access  Private
 */
export const getQuizById = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;

  const { data: quiz, error } = await db
    .from('quizzes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch quiz: ${error.message}`);
  if (!quiz) throw ApiError.notFound('Quiz not found');

  const row = quiz as QuizRow;
  if (req.user?.role === USER_ROLES.STUDENT) {
    const safe = {
      ...row,
      questions: (row.questions || []).map((q) => {
        const { question, options, marks } = q as QuizQuestion;
        return { question, options, marks };
      }),
    };
    res.json(ApiResponse.success('Data retrieved successfully', safe));
    return;
  }

  res.json(ApiResponse.success('Data retrieved successfully', row));
});

/**
 * @desc    Update quiz
 * @route   PUT /api/v1/quizzes/:id
 * @access  Private (Lecturer who created it, Admin)
 */
export const updateQuiz = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  const { data: quiz, error: fetchErr } = await db
    .from('quizzes')
    .select('id, created_by')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch quiz: ${fetchErr.message}`);
  if (!quiz) throw ApiError.notFound('Quiz not found');

  if (req.user?.role !== USER_ROLES.ADMIN && quiz.created_by !== userId) {
    throw ApiError.forbidden('You are not authorized to update this quiz');
  }

  const { count: attemptCount, error: countErr } = await db
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', id);
  if (countErr) throw ApiError.internal(`Failed to count attempts: ${countErr.message}`);
  if ((attemptCount || 0) > 0) throw ApiError.badRequest('Cannot update quiz that has already been attempted');

  const { title, description, duration, totalMarks, startDate, endDate, questions, isActive } =
    req.body as Partial<{
      title: string;
      description: string;
      duration: number;
      totalMarks: number;
      startDate: string;
      endDate: string;
      questions: QuizQuestion[];
      isActive: boolean;
    }>;

  const patch: Record<string, unknown> = {};
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (duration !== undefined) patch.duration = duration;
  if (totalMarks !== undefined) patch.total_marks = totalMarks;
  if (startDate !== undefined) patch.start_date = startDate;
  if (endDate !== undefined) patch.end_date = endDate;
  if (questions !== undefined) patch.questions = questions;
  if (typeof isActive !== 'undefined') patch.is_active = isActive;

  const { data: updated, error } = await db
    .from('quizzes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw ApiError.internal(`Failed to update quiz: ${error.message}`);

  res.json(ApiResponse.success('Quiz updated successfully', updated));
});

/**
 * @desc    Delete quiz
 * @route   DELETE /api/v1/quizzes/:id
 * @access  Private (Lecturer who created it, Admin)
 */
export const deleteQuiz = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  const { data: quiz, error: fetchErr } = await db
    .from('quizzes')
    .select('id, created_by')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) throw ApiError.internal(`Failed to fetch quiz: ${fetchErr.message}`);
  if (!quiz) throw ApiError.notFound('Quiz not found');

  if (req.user?.role !== USER_ROLES.ADMIN && quiz.created_by !== userId) {
    throw ApiError.forbidden('You are not authorized to delete this quiz');
  }

  const { error: delErr } = await db.from('quizzes').delete().eq('id', id);
  if (delErr) throw ApiError.internal(`Failed to delete quiz: ${delErr.message}`);

  res.json(ApiResponse.success('Quiz deleted successfully', null));
});

/**
 * @desc    Start quiz attempt
 * @route   POST /api/v1/quizzes/:id/start
 * @access  Private (Student)
 */
export const startQuiz = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: quiz, error: quizErr } = await db
    .from('quizzes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (quizErr) throw ApiError.internal(`Failed to fetch quiz: ${quizErr.message}`);
  if (!quiz) throw ApiError.notFound('Quiz not found');
  const q = quiz as QuizRow;

  if (!q.is_active) throw ApiError.badRequest('Quiz is not active');

  const now = new Date();
  if (now < new Date(q.start_date)) throw ApiError.badRequest('Quiz has not started yet');
  if (now > new Date(q.end_date)) throw ApiError.badRequest('Quiz has ended');

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', userId)
    .eq('course_id', q.course_id)
    .eq('status', 'active')
    .maybeSingle();
  if (!enrollment) throw ApiError.forbidden('You are not enrolled in this course');

  const { data: existingAttempt } = await db
    .from('quiz_attempts')
    .select('id')
    .eq('quiz_id', q.id)
    .eq('student_id', userId)
    .maybeSingle();
  if (existingAttempt) throw ApiError.badRequest('You have already attempted this quiz');

  const { data: attempt, error: attemptErr } = await db
    .from('quiz_attempts')
    .insert({
      quiz_id: q.id,
      student_id: userId,
      total_marks: q.total_marks,
      duration: q.duration,
      started_at: new Date().toISOString(),
      is_completed: false,
    })
    .select()
    .single();
  if (attemptErr) throw ApiError.internal(`Failed to start attempt: ${attemptErr.message}`);

  const quizSafe = {
    ...q,
    questions: (q.questions || []).map((qq) => {
      const { question, options, marks } = qq as QuizQuestion;
      return { question, options, marks };
    }),
  };

  res.status(201).json(
    ApiResponse.success('Quiz started successfully', { attemptId: attempt.id, quiz: quizSafe })
  );
});

/**
 * @desc    Submit quiz attempt
 * @route   POST /api/v1/quizzes/:id/submit
 * @access  Private (Student)
 */
export const submitQuiz = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;
  const { answers } = req.body as { answers: Array<{ questionIndex: number; answer: string }> };

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: quiz, error: quizErr } = await db
    .from('quizzes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (quizErr) throw ApiError.internal(`Failed to fetch quiz: ${quizErr.message}`);
  if (!quiz) throw ApiError.notFound('Quiz not found');
  const q = quiz as QuizRow;

  const { data: attempt, error: attemptErr } = await db
    .from('quiz_attempts')
    .select('*')
    .eq('quiz_id', q.id)
    .eq('student_id', userId)
    .maybeSingle();
  if (attemptErr) throw ApiError.internal(`Failed to fetch attempt: ${attemptErr.message}`);
  if (!attempt) throw ApiError.notFound('Quiz attempt not found');
  const a = attempt as QuizAttemptRow;
  if (a.is_completed) throw ApiError.badRequest('Quiz has already been submitted');

  const elapsedMinutes = (Date.now() - new Date(a.started_at).getTime()) / 60000;
  if (elapsedMinutes > q.duration + 5) throw ApiError.badRequest('Time limit exceeded');

  const gradedAnswers = answers.map((ans) => {
    const question = (q.questions || [])[ans.questionIndex];
    const isCorrect =
      !!question && ans.answer.toLowerCase().trim() === String(question.correctAnswer).toLowerCase().trim();
    return {
      questionIndex: ans.questionIndex,
      answer: ans.answer,
      isCorrect,
      marksAwarded: isCorrect ? (question?.marks || 0) : 0,
    };
  });

  const score = gradedAnswers.reduce((sum, ans) => sum + (ans.marksAwarded || 0), 0);
  const percentage = q.total_marks > 0 ? (score / q.total_marks) * 100 : 0;

  const { data: updated, error: updateErr } = await db
    .from('quiz_attempts')
    .update({
      answers: gradedAnswers,
      score,
      percentage,
      submitted_at: new Date().toISOString(),
      is_completed: true,
    })
    .eq('id', a.id)
    .select()
    .single();
  if (updateErr) throw ApiError.internal(`Failed to submit attempt: ${updateErr.message}`);

  await notificationService.createNotification(
    userId,
    'success',
    'Quiz Submitted',
    `You scored ${score}/${q.total_marks} (${percentage.toFixed(1)}%) on "${q.title}"`
  );

  res.json(ApiResponse.success('Quiz submitted successfully', updated));
});

/**
 * @desc    Get quiz attempts
 * @route   GET /api/v1/quizzes/:id/attempts
 * @access  Private (Lecturer, Admin)
 */
export const getQuizAttempts = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  const { data: quiz, error: quizErr } = await db
    .from('quizzes')
    .select('id, course_id')
    .eq('id', id)
    .maybeSingle();
  if (quizErr) throw ApiError.internal(`Failed to fetch quiz: ${quizErr.message}`);
  if (!quiz) throw ApiError.notFound('Quiz not found');

  const { data: course, error: courseErr } = await db
    .from('courses')
    .select('lecturer_id')
    .eq('id', quiz.course_id)
    .maybeSingle();
  if (courseErr) throw ApiError.internal(`Failed to fetch course: ${courseErr.message}`);
  if (!course) throw ApiError.notFound('Course not found');

  if (req.user?.role !== USER_ROLES.ADMIN && course.lecturer_id !== userId) {
    throw ApiError.forbidden('You are not authorized to view attempts for this quiz');
  }

  const { data: attempts, error } = await db
    .from('quiz_attempts')
    .select('*')
    .eq('quiz_id', quiz.id)
    .eq('is_completed', true)
    .order('submitted_at', { ascending: false });
  if (error) throw ApiError.internal(`Failed to fetch attempts: ${error.message}`);

  const rows = (attempts || []) as QuizAttemptRow[];
  const stats = {
    totalAttempts: rows.length,
    averageScore: rows.length > 0 ? rows.reduce((sum, a) => sum + (a.score || 0), 0) / rows.length : 0,
    highestScore: rows.length > 0 ? Math.max(...rows.map((a) => a.score || 0)) : 0,
    lowestScore: rows.length > 0 ? Math.min(...rows.map((a) => a.score || 0)) : 0,
    averagePercentage: rows.length > 0 ? rows.reduce((sum, a) => sum + (a.percentage || 0), 0) / rows.length : 0,
  };

  res.json(ApiResponse.success('Data retrieved successfully', { stats, attempts: rows }));
});

/**
 * @desc    Get student's quiz attempt
 * @route   GET /api/v1/quizzes/:id/my-attempt
 * @access  Private (Student)
 */
export const getMyQuizAttempt = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();
  const { id } = req.params;

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: attempt, error } = await db
    .from('quiz_attempts')
    .select('*')
    .eq('quiz_id', id)
    .eq('student_id', userId)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch attempt: ${error.message}`);
  if (!attempt) throw ApiError.notFound('You have not attempted this quiz');

  res.json(ApiResponse.success('Data retrieved successfully', attempt));
});

