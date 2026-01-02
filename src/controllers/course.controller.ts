import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../utils/constants';

// List courses
export const listCourses = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const { department, level, semester, search } = req.query;

  let query = db
    .from('courses')
    .select('*, departments(name, code), lecturer:profiles!courses_lecturer_id_fkey(first_name, last_name, email)', { count: 'exact' })
    .eq('is_active', true);

  if (department) query = query.eq('department_id', department);
  if (level) query = query.eq('level', level);
  if (semester) query = query.eq('semester', semester);
  if (search) {
    query = query.or(`code.ilike.%${search}%,title.ilike.%${search}%`);
  }

  const skip = (page - 1) * limit;
  const { data, error, count } = await query.range(skip, skip + limit - 1);

  if (error) throw ApiError.internal(`Failed to fetch courses: ${error.message}`);

  res.status(200).json(
    ApiResponse.success('Courses retrieved successfully', data, {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    })
  );
});

// Get course by ID
export const getCourse = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;

  const { data, error } = await db
    .from('courses')
    .select('*, departments(name, code), lecturer:profiles!courses_lecturer_id_fkey(first_name, last_name, email)')
    .eq('id', id)
    .maybeSingle();

  if (error) throw ApiError.internal(`Failed to fetch course: ${error.message}`);
  if (!data) throw ApiError.notFound('Course not found');

  // Fetch prerequisites if any
  if (data.prerequisites && (data.prerequisites as string[]).length > 0) {
    const { data: prereqs } = await db
      .from('courses')
      .select('id, code, title')
      .in('id', data.prerequisites as string[]);
    const result = { ...data, prerequisiteDetails: prereqs } as Record<string, unknown>;
    res.status(200).json(ApiResponse.success('Course retrieved successfully', result));
    return;
  }

  res.status(200).json(ApiResponse.success('Course retrieved successfully', data));
});

// Create course
export const createCourse = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const courseData = req.body;

  // Check for existing course code
  const { data: existing } = await db
    .from('courses')
    .select('id')
    .eq('code', courseData.code)
    .maybeSingle();

  if (existing) {
    throw ApiError.conflict('Course code already exists');
  }

  const { data, error } = await db
    .from('courses')
    .insert({
      code: courseData.code,
      title: courseData.title,
      description: courseData.description,
      credits: courseData.credits,
      level: courseData.level,
      semester: courseData.semester,
      department_id: courseData.department || courseData.departmentId,
      lecturer_id: courseData.lecturer || courseData.lecturerId,
      prerequisites: courseData.prerequisites || [],
      schedule: courseData.schedule || [],
      capacity: courseData.capacity || 100,
      session_id: courseData.session || courseData.sessionId,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to create course: ${error.message}`);

  res.status(201).json(ApiResponse.success('Course created successfully', data));
});

// Update course
export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;
  const updates = req.body;

  const patch: Record<string, unknown> = {};
  if (updates.code !== undefined) patch.code = updates.code;
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.credits !== undefined) patch.credits = updates.credits;
  if (updates.level !== undefined) patch.level = updates.level;
  if (updates.semester !== undefined) patch.semester = updates.semester;
  if (updates.department !== undefined) patch.department_id = updates.department;
  if (updates.departmentId !== undefined) patch.department_id = updates.departmentId;
  if (updates.lecturer !== undefined) patch.lecturer_id = updates.lecturer;
  if (updates.lecturerId !== undefined) patch.lecturer_id = updates.lecturerId;
  if (updates.prerequisites !== undefined) patch.prerequisites = updates.prerequisites;
  if (updates.schedule !== undefined) patch.schedule = updates.schedule;
  if (updates.capacity !== undefined) patch.capacity = updates.capacity;
  if (updates.session !== undefined) patch.session_id = updates.session;
  if (updates.sessionId !== undefined) patch.session_id = updates.sessionId;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from('courses')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to update course: ${error.message}`);
  if (!data) throw ApiError.notFound('Course not found');

  res.status(200).json(ApiResponse.success('Course updated successfully', data));
});

// Delete course
export const deleteCourse = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;

  const { data, error } = await db
    .from('courses')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to delete course: ${error.message}`);
  if (!data) throw ApiError.notFound('Course not found');

  res.status(200).json(ApiResponse.success('Course deleted successfully'));
});

// Enroll in course
export const enrollCourse = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) {
    throw ApiError.unauthorized('User not authenticated');
  }

  // Check if course exists
  const { data: course, error: courseError } = await db
    .from('courses')
    .select('session_id, semester')
    .eq('id', id)
    .maybeSingle();

  if (courseError) throw ApiError.internal(`Failed to fetch course: ${courseError.message}`);
  if (!course) throw ApiError.notFound('Course not found');

  // Check for existing enrollment
  const { data: existing } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', userId)
    .eq('course_id', id)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    throw ApiError.conflict('Already enrolled in this course');
  }

  // Create enrollment
  const { data: enrollment, error } = await db
    .from('enrollments')
    .insert({
      student_id: userId,
      course_id: id,
      session_id: course.session_id,
      semester: course.semester,
      status: 'active',
    })
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to enroll: ${error.message}`);

  res.status(201).json(ApiResponse.success('Enrolled successfully', enrollment));
});

// Unenroll from course
export const unenrollCourse = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) {
    throw ApiError.unauthorized('User not authenticated');
  }

  const { data, error } = await db
    .from('enrollments')
    .update({ status: 'dropped', updated_at: new Date().toISOString() })
    .eq('student_id', userId)
    .eq('course_id', id)
    .eq('status', 'active')
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to unenroll: ${error.message}`);
  if (!data) throw ApiError.notFound('Enrollment not found');

  res.status(200).json(ApiResponse.success('Unenrolled successfully'));
});

// Get enrolled students
export const getEnrolledStudents = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { id } = req.params;

  const { data, error } = await db
    .from('enrollments')
    .select('*, student:profiles!enrollments_student_id_fkey(first_name, last_name, email, student_id)')
    .eq('course_id', id)
    .eq('status', 'active');

  if (error) throw ApiError.internal(`Failed to fetch enrolled students: ${error.message}`);

  res.status(200).json(
    ApiResponse.success('Enrolled students retrieved successfully', data)
  );
});
