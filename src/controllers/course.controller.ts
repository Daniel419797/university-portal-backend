import { Request, Response } from 'express';
import Course from '../models/Course.model';
import Enrollment from '../models/Enrollment.model';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../utils/constants';

// List courses
export const listCourses = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const { department, level, semester, search } = req.query;

  const filter: any = { isActive: true };
  if (department) filter.department = department;
  if (level) filter.level = level;
  if (semester) filter.semester = semester;
  if (search) {
    filter.$or = [
      { code: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  const total = await Course.countDocuments(filter);
  const courses = await Course.find(filter)
    .populate('department', 'name code')
    .populate('lecturer', 'firstName lastName email')
    .limit(limit)
    .skip(skip)
    .lean();

  res.status(200).json(
    ApiResponse.success('Courses retrieved successfully', courses, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  );
});

// Get course by ID
export const getCourse = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const course = await Course.findById(id)
    .populate('department', 'name code')
    .populate('lecturer', 'firstName lastName email')
    .populate('prerequisites', 'code title');

  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  res.status(200).json(ApiResponse.success('Course retrieved successfully', course));
});

// Create course
export const createCourse = asyncHandler(async (req: Request, res: Response) => {
  const courseData = req.body;

  const existingCourse = await Course.findOne({ code: courseData.code });
  if (existingCourse) {
    throw ApiError.conflict('Course code already exists');
  }

  const course = await Course.create(courseData);

  res.status(201).json(ApiResponse.success('Course created successfully', course));
});

// Update course
export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  const course = await Course.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });

  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  res.status(200).json(ApiResponse.success('Course updated successfully', course));
});

// Delete course
export const deleteCourse = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const course = await Course.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );

  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  res.status(200).json(ApiResponse.success('Course deleted successfully'));
});

// Enroll in course
export const enrollCourse = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user?.userId;

  const course = await Course.findById(id);
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  const existingEnrollment = await Enrollment.findOne({
    student: userId,
    course: id,
    status: 'active',
  });

  if (existingEnrollment) {
    throw ApiError.conflict('Already enrolled in this course');
  }

  const enrollment = await Enrollment.create({
    student: userId,
    course: id,
    session: course.session,
    semester: course.semester,
    status: 'active',
  });

  res.status(201).json(ApiResponse.success('Enrolled successfully', enrollment));
});

// Unenroll from course
export const unenrollCourse = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).user?.userId;

  const enrollment = await Enrollment.findOneAndUpdate(
    { student: userId, course: id, status: 'active' },
    { status: 'dropped' },
    { new: true }
  );

  if (!enrollment) {
    throw ApiError.notFound('Enrollment not found');
  }

  res.status(200).json(ApiResponse.success('Unenrolled successfully'));
});

// Get enrolled students
export const getEnrolledStudents = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const enrollments = await Enrollment.find({ course: id, status: 'active' })
    .populate('student', 'firstName lastName email studentId')
    .lean();

  res.status(200).json(
    ApiResponse.success('Enrolled students retrieved successfully', enrollments)
  );
});
