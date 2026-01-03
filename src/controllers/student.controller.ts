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
// Original backup: c:\Users\HP\Desktop\university-portal-backend\backup-mongodb-20260102-062910\student.controller.ts
// =============================================================================
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

type Nullable<T> = T | null;

interface TimetableSlot {
  day: string;
  startTime: string;
  endTime: string;
  venue?: string | null;
}

interface LecturerLike {
  id?: string;
  first_name?: string;
  last_name?: string;
}

interface CourseLike {
  id: string;
  code?: string;
  title?: string;
  schedule?: Array<Partial<{
    day: string;
    startTime: string;
    start_time: string;
    endTime: string;
    end_time: string;
    venue?: string | null;
  }>> | null;
  lecturer?: LecturerLike | LecturerLike[] | null;
}

interface SessionLike {
  id?: string;
  name?: string;
}

interface DepartmentLike {
  id?: string;
  name?: string;
  code?: string;
  faculty?: string;
}

interface TimetableEntry {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  lecturer: string;
  day: string;
  startTime: string;
  endTime: string;
  venue?: string | null;
  session?: string | null;
}

interface EnrollmentWithJoins {
  id: string;
  status: string;
  semester?: string | null;
  course?: CourseLike | CourseLike[] | null;
  session?: SessionLike | SessionLike[] | null;
}

const getAuthStudentId = (req: Request): string => {
  const authUser = req.user as unknown as { id?: string; userId?: string } | undefined;
  return authUser?.id || authUser?.userId || '';
};

const toSingle = <T>(val: T | T[] | null | undefined): Nullable<T> => {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
};

const mapSlot = (
  raw: Partial<{
    day: string;
    startTime: string;
    start_time: string;
    endTime: string;
    end_time: string;
    venue?: string | null;
  }> | null | undefined
): TimetableSlot => ({
  day: raw?.day ?? 'UNKNOWN',
  startTime: raw?.startTime ?? raw?.start_time ?? '00:00',
  endTime: raw?.endTime ?? raw?.end_time ?? '00:00',
  venue: raw?.venue ?? null,
});

export const getStudentTimetable = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const studentId = getAuthStudentId(req);

  if (!studentId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  const { data: enrollments, error: enrErr } = await db
    .from('enrollments')
    .select(
      `id, status, semester,
       session:sessions(name),
       course:courses(
         id, code, title, schedule,
         lecturer:profiles(id, first_name, last_name)
       )`
    )
    .eq('student_id', studentId)
    .eq('status', 'active');

  if (enrErr) {
    throw ApiError.internal(`Failed to fetch enrollments: ${enrErr.message}`);
  }

  const timetableEntries = (enrollments ?? []).flatMap((en: EnrollmentWithJoins) => {
    const course = toSingle<CourseLike>(en.course);
    if (!course) return [];

    const lecturer = toSingle<LecturerLike>(course.lecturer);
    const lecturerName = lecturer?.first_name && lecturer?.last_name
      ? `${lecturer.first_name} ${lecturer.last_name}`
      : 'TBD';

    const slots = Array.isArray(course.schedule) ? course.schedule : [];
    const session = toSingle<SessionLike>(en.session);

    return slots.map((slot) => ({
      courseId: course.id,
      courseCode: course.code ?? '',
      courseTitle: course.title ?? '',
      lecturer: lecturerName,
      ...mapSlot(slot),
      session: session?.name ?? null,
    }));
  });

  const groupedByDay = timetableEntries.reduce<Record<string, TimetableEntry[]>>((acc, entry) => {
    const key = entry.day ?? 'UNKNOWN';
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  Object.values(groupedByDay).forEach((entries) => {
    entries.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
  });

  res.json(
    ApiResponse.success('Timetable retrieved successfully', {
      timetable: groupedByDay,
      totalCourses: (enrollments ?? []).length,
    })
  );
});

export const getStudentIdCard = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const studentId = getAuthStudentId(req);

  if (!studentId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  const { data: student, error: stErr } = await db
    .from('profiles')
    .select(
      `id, role, student_id, first_name, last_name, level, avatar,
       department:departments!profiles_department_fk(id, name, code, faculty)`
    )
    .eq('id', studentId)
    .maybeSingle();

  if (stErr) {
    throw ApiError.internal(`Failed to fetch student: ${stErr.message}`);
  }
  if (!student) {
    throw ApiError.notFound('Student not found');
  }
  if (student.role !== 'student') {
    throw ApiError.forbidden('ID cards are only available to students');
  }

  const fullName = `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim();
  const qrPayload = {
    student_id: student.student_id,
    name: fullName,
    issuedAt: new Date().toISOString(),
  };

  const dept = toSingle<DepartmentLike>(student.department);
  const idCard = {
    fullName,
    student_id: student.student_id,
    level: student.level,
    department: dept?.name ?? null,
    departmentCode: dept?.code ?? null,
    faculty: dept?.faculty ?? null,
    avatar: student.avatar ?? null,
    issuedAt: new Date(),
    qrCode: Buffer.from(JSON.stringify(qrPayload)).toString('base64'),
  };

  res.json(ApiResponse.success('ID card generated successfully', idCard));
});

export const getAvailableEnrollmentCourses = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const studentId = getAuthStudentId(req);
  const { semester, level, department } = req.query as Record<string, string | undefined>;

  if (!studentId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  const { data: activeEnrollments, error: enrErr } = await db
    .from('enrollments')
    .select('course_id')
    .eq('student_id', studentId)
    .eq('status', 'active');

  if (enrErr) {
    throw ApiError.internal(`Failed to fetch enrollments: ${enrErr.message}`);
  }

  type EnrollmentCourseId = { course_id: string | null };
  const enrolledCourseIds = (activeEnrollments ?? [])
    .map((e: EnrollmentCourseId) => e.course_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  let query = db
    .from('courses')
    .select('id, code, title, level, semester, department_id, is_active')
    .eq('is_active', true);

  if (enrolledCourseIds.length > 0) {
    // Supabase not-in via .not('id','in','(a,b,c)')
    query = query.not('id', 'in', `(${enrolledCourseIds.join(',')})`);
  }
  if (semester) query = query.eq('semester', String(semester));
  if (level) query = query.eq('level', String(level));
  if (department) query = query.eq('department_id', String(department));

  const { data: courses, error: cErr } = await query.order('code', { ascending: true });
  if (cErr) {
    throw ApiError.internal(`Failed to fetch available courses: ${cErr.message}`);
  }

  res.json(
    ApiResponse.success('Available courses retrieved successfully', {
      courses: courses ?? [],
      total: (courses ?? []).length,
    })
  );
});

export const enrollInCourses = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const studentId = getAuthStudentId(req);
  const { courseIds } = req.body as { courseIds?: string[] };

  if (!studentId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }
  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw ApiError.badRequest('courseIds array is required');
  }

  const results: Array<{ courseId: string; status: 'enrolled' | 'skipped'; reason?: string }> = [];
  const uniqueCourseIds = Array.from(new Set(courseIds));

  for (const courseId of uniqueCourseIds) {
    const { data: course, error: cErr } = await db
      .from('courses')
      .select('id, session_id, semester')
      .eq('id', courseId)
      .maybeSingle();

    if (cErr) {
      results.push({ courseId, status: 'skipped', reason: `DB error: ${cErr.message}` });
      continue;
    }
    if (!course) {
      results.push({ courseId, status: 'skipped', reason: 'Course not found' });
      continue;
    }

    const { data: existing } = await db
      .from('enrollments')
      .select('id')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      results.push({ courseId, status: 'skipped', reason: 'Already enrolled' });
      continue;
    }

    const { error: insErr } = await db.from('enrollments').insert({
      student_id: studentId,
      course_id: courseId,
      session_id: course.session_id,
      semester: course.semester,
      status: 'active',
    });

    if (insErr) {
      results.push({ courseId, status: 'skipped', reason: `Insert failed: ${insErr.message}` });
      continue;
    }

    results.push({ courseId, status: 'enrolled' });
  }

  res.status(201).json(
    ApiResponse.success('Enrollment processed successfully', {
      results,
      enrolled: results.filter((entry) => entry.status === 'enrolled').length,
      skipped: results.filter((entry) => entry.status === 'skipped').length,
    })
  );
});

export const dropCourseEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const studentId = getAuthStudentId(req);
  const { courseId } = req.params as { courseId: string };

  if (!studentId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  const { data: rows, error: updErr } = await db
    .from('enrollments')
    .update({ status: 'dropped' })
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .eq('status', 'active')
    .select('id, status');

  if (updErr) {
    throw ApiError.internal(`Failed to drop enrollment: ${updErr.message}`);
  }
  if (!rows || rows.length === 0) {
    throw ApiError.notFound('Active enrollment not found for this course');
  }

  res.json(ApiResponse.success('Course dropped successfully', rows[0]));
});

