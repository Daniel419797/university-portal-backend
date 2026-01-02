import { Request, Response } from 'express';
import Quiz from '../models/Quiz.model';
import QuizAttempt from '../models/QuizAttempt.model';
import Course from '../models/Course.model';
import Enrollment from '../models/Enrollment.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import notificationService from '../services/notification.service';
import { USER_ROLES } from '../utils/constants';

/**
 * @desc    Create new quiz
 * @route   POST /api/v1/quizzes
 * @access  Private (Lecturer, Admin)
 */
export const createQuiz = asyncHandler(async (req: Request, res: Response) => {
  const { course, title, description, duration, totalMarks, startDate, endDate, questions } =
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
    throw ApiError.forbidden('You are not authorized to create quizzes for this course');
  }

  // Validate total marks match sum of question marks
  const calculatedTotal = questions.reduce((sum: number, q: any) => sum + q.marks, 0);
  if (calculatedTotal !== totalMarks) {
    throw ApiError.badRequest(
      `Total marks (${totalMarks}) must match sum of question marks (${calculatedTotal})`
    );
  }

  const quiz = await Quiz.create({
    course,
    title,
    description,
    duration,
    totalMarks,
    startDate,
    endDate,
    questions,
    createdBy: (req as any).user._id,
    isActive: true,
  });

  // Notify enrolled students
  const enrollments = await Enrollment.find({ course, status: 'active' }).select('student');
  const studentIds = enrollments.map((e: any) => e.student);

  if (studentIds.length > 0) {
    await notificationService.createBulkNotifications(
      studentIds,
      'info',
      'New Quiz Available',
      `New quiz "${title}" is available for ${(courseExists as any).name}. Duration: ${duration} minutes`
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
  const { course, page = 1, limit = 20, active } = req.query;

  const query: Record<string, unknown> = {};

  if (course) query.course = course;
  if (active !== undefined) query.isActive = active === 'true';

  // If student, only show quizzes for enrolled courses
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

  const [quizzes, total] = await Promise.all([
    Quiz.find(query)
      .populate('course', 'name code')
      .populate('createdBy', 'firstName lastName')
      .select('-questions.correctAnswer') // Hide correct answers from list
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limitNum),
    Quiz.countDocuments(query),
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      quizzes,
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
 * @desc    Get single quiz by ID
 * @route   GET /api/v1/quizzes/:id
 * @access  Private
 */
export const getQuizById = asyncHandler(async (req: Request, res: Response) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate('course', 'name code')
    .populate('createdBy', 'firstName lastName');

  if (!quiz) {
    throw ApiError.notFound('Quiz not found');
  }

  // Hide correct answers from students
  if ((req as any).user.role === USER_ROLES.STUDENT) {
    const quizObj = quiz.toObject();
    quizObj.questions = quizObj.questions.map((q: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { correctAnswer, ...rest } = q;
      return rest;
    });
    res.json(ApiResponse.success('Data retrieved successfully', quizObj));
    return;
  }

  res.json(ApiResponse.success('Data retrieved successfully', quiz));
});

/**
 * @desc    Update quiz
 * @route   PUT /api/v1/quizzes/:id
 * @access  Private (Lecturer who created it, Admin)
 */
export const updateQuiz = asyncHandler(async (req: Request, res: Response) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    throw ApiError.notFound('Quiz not found');
  }

  // Check authorization
  if (
    (req as any).user.role !== USER_ROLES.ADMIN &&
    quiz.createdBy.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to update this quiz');
  }

  // Check if quiz has been attempted
  const attempts = await QuizAttempt.countDocuments({ quiz: quiz._id });
  if (attempts > 0) {
    throw ApiError.badRequest('Cannot update quiz that has already been attempted');
  }

  const { title, description, duration, totalMarks, startDate, endDate, questions, isActive } =
    req.body;

  if (title) quiz.title = title;
  if (description) quiz.description = description;
  if (duration) quiz.duration = duration;
  if (totalMarks) quiz.totalMarks = totalMarks;
  if (startDate) quiz.startDate = startDate;
  if (endDate) quiz.endDate = endDate;
  if (questions) quiz.questions = questions;
  if (typeof isActive !== 'undefined') quiz.isActive = isActive;

  await quiz.save();

  res.json(ApiResponse.success('Quiz updated successfully', quiz));
});

/**
 * @desc    Delete quiz
 * @route   DELETE /api/v1/quizzes/:id
 * @access  Private (Lecturer who created it, Admin)
 */
export const deleteQuiz = asyncHandler(async (req: Request, res: Response) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    throw ApiError.notFound('Quiz not found');
  }

  // Check authorization
  if (
    (req as any).user.role !== USER_ROLES.ADMIN &&
    quiz.createdBy.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to delete this quiz');
  }

  await quiz.deleteOne();

  res.json(ApiResponse.success('Quiz deleted successfully', null));
});

/**
 * @desc    Start quiz attempt
 * @route   POST /api/v1/quizzes/:id/start
 * @access  Private (Student)
 */
export const startQuiz = asyncHandler(async (req: Request, res: Response) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    throw ApiError.notFound('Quiz not found');
  }

  if (!quiz.isActive) {
    throw ApiError.badRequest('Quiz is not active');
  }

  // Check if quiz is available
  const now = new Date();
  if (now < quiz.startDate) {
    throw ApiError.badRequest('Quiz has not started yet');
  }
  if (now > quiz.endDate) {
    throw ApiError.badRequest('Quiz has ended');
  }

  // Check if student is enrolled
  const enrollment = await Enrollment.findOne({
    student: (req as any).user._id,
    course: quiz.course,
    status: 'active',
  });

  if (!enrollment) {
    throw ApiError.forbidden('You are not enrolled in this course');
  }

  // Check if already attempted
  const existingAttempt = await QuizAttempt.findOne({
    quiz: quiz._id,
    student: (req as any).user._id,
  });

  if (existingAttempt) {
    throw ApiError.badRequest('You have already attempted this quiz');
  }

  // Create quiz attempt
  const attempt = await QuizAttempt.create({
    quiz: quiz._id,
    student: (req as any).user._id,
    totalMarks: quiz.totalMarks,
    duration: quiz.duration,
    startedAt: new Date(),
  });

  // Return quiz without correct answers
  const quizObj = quiz.toObject();
  quizObj.questions = quizObj.questions.map((q: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { correctAnswer, ...rest } = q;
    return rest;
  });

  res.status(201).json(
    ApiResponse.success('Quiz started successfully', { attemptId: attempt._id, quiz: quizObj })
  );
});

/**
 * @desc    Submit quiz attempt
 * @route   POST /api/v1/quizzes/:id/submit
 * @access  Private (Student)
 */
export const submitQuiz = asyncHandler(async (req: Request, res: Response) => {
  const { answers } = req.body;

  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) {
    throw ApiError.notFound('Quiz not found');
  }

  const attempt = await QuizAttempt.findOne({
    quiz: quiz._id,
    student: (req as any).user._id,
  });

  if (!attempt) {
    throw ApiError.notFound('Quiz attempt not found');
  }

  if (attempt.isCompleted) {
    throw ApiError.badRequest('Quiz has already been submitted');
  }

  // Check if time limit exceeded
  const elapsedMinutes = (Date.now() - attempt.startedAt.getTime()) / 60000;
  if (elapsedMinutes > quiz.duration + 5) {
    // 5 min grace period
    throw ApiError.badRequest('Time limit exceeded');
  }

  // Grade the quiz
  const gradedAnswers = answers.map((ans: any) => {
    const question = quiz.questions[ans.questionIndex];
    const isCorrect = ans.answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
    return {
      questionIndex: ans.questionIndex,
      answer: ans.answer,
      isCorrect,
      marksAwarded: isCorrect ? question.marks : 0,
    };
  });

  const score = gradedAnswers.reduce((sum: number, ans: any) => sum + ans.marksAwarded, 0);
  const percentage = (score / quiz.totalMarks) * 100;

  attempt.answers = gradedAnswers;
  attempt.score = score;
  attempt.percentage = percentage;
  attempt.submittedAt = new Date();
  attempt.isCompleted = true;

  await attempt.save();

  // Notify student
  await notificationService.createNotification(
    (req as any).user._id,
    'success',
    'Quiz Submitted',
    `You scored ${score}/${quiz.totalMarks} (${percentage.toFixed(1)}%) on "${quiz.title}"`
  );

  res.json(ApiResponse.success('Quiz submitted successfully', attempt));
});

/**
 * @desc    Get quiz attempts
 * @route   GET /api/v1/quizzes/:id/attempts
 * @access  Private (Lecturer, Admin)
 */
export const getQuizAttempts = asyncHandler(async (req: Request, res: Response) => {
  const quiz = await Quiz.findById(req.params.id).populate('course');

  if (!quiz) {
    throw ApiError.notFound('Quiz not found');
  }

  // Check authorization
  const course = quiz.course as any;
  if (
    (req as any).user.role !== USER_ROLES.ADMIN &&
    course.lecturer.toString() !== (req as any).user._id.toString()
  ) {
    throw ApiError.forbidden('You are not authorized to view attempts for this quiz');
  }

  const attempts = await QuizAttempt.find({ quiz: quiz._id, isCompleted: true })
    .populate('student', 'firstName lastName email studentId')
    .sort({ score: -1 });

  // Calculate statistics
  const stats = {
    totalAttempts: attempts.length,
    averageScore:
      attempts.length > 0
        ? attempts.reduce((sum: number, a: any) => sum + a.score, 0) / attempts.length
        : 0,
    highestScore: attempts.length > 0 ? Math.max(...attempts.map((a: any) => a.score)) : 0,
    lowestScore: attempts.length > 0 ? Math.min(...attempts.map((a: any) => a.score)) : 0,
    averagePercentage:
      attempts.length > 0
        ? attempts.reduce((sum: number, a: any) => sum + a.percentage, 0) / attempts.length
        : 0,
  };

  res.json(ApiResponse.success('Data retrieved successfully', { stats, attempts }));
});

/**
 * @desc    Get student's quiz attempt
 * @route   GET /api/v1/quizzes/:id/my-attempt
 * @access  Private (Student)
 */
export const getMyQuizAttempt = asyncHandler(async (req: Request, res: Response) => {
  const attempt = await QuizAttempt.findOne({
    quiz: req.params.id,
    student: (req as any).user._id,
  }).populate('quiz', 'title totalMarks');

  if (!attempt) {
    throw ApiError.notFound('You have not attempted this quiz');
  }

  res.json(ApiResponse.success('Data retrieved successfully', attempt));
});

