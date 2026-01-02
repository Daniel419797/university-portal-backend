import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
// Removed mongoose; using Supabase exclusively
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { calculateGrade } from '../utils/helpers';

type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

interface CourseRow {
  id: string;
  title: string;
  code: string;
  credits: number;
  level?: string | number;
  semester?: string;
  lecturer_id: string;
  department_id?: string;
  is_active?: boolean;
}

// Note: EnrollmentRow interface omitted since not directly used

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  student_id: string;
  level?: string | number;
  department_id?: string;
  phone_number?: string;
}

// Note: AssignmentRow interface omitted since not directly used

interface ResultRow {
  id: string;
  student_id: string;
  course_id: string;
  session_id: string;
  semester: string;
  ca_score: number;
  exam_score: number;
  total_score: number;
  grade: GradeLetter;
  grade_points: number;
  entered_by: string;
  is_published?: boolean;
}

// Note: AttendanceRow interface omitted since not directly used

const gradePoints: Record<string, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
  F: 0,
};

const resolveLecturerId = (req: Request): string => {
  const authUser = req.user!;
  return authUser.userId;
};

export const getLecturerCoursesList = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const lecturerId = resolveLecturerId(req);
  const { semester, level } = req.query;

  let q = db
    .from('courses')
    .select('id,title,code,credits,level,semester,department_id,is_active')
    .eq('lecturer_id', lecturerId);
  if (semester) q = q.eq('semester', String(semester));
  if (level) q = q.eq('level', String(level));

  const { data, error } = await q;
  if (error) throw ApiError.internal(`Failed to fetch courses: ${error.message}`);

  res.json(ApiResponse.success('Courses retrieved successfully', (data ?? []) as CourseRow[]));
});

export const getLecturerCourseDetail = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const lecturerId = resolveLecturerId(req);
  const { data, error } = await db
    .from('courses')
    .select('id,title,code,credits,level,semester,department_id,is_active')
    .eq('id', req.params.id)
    .eq('lecturer_id', lecturerId)
    .maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch course: ${error.message}`);
  if (!data) throw ApiError.notFound('Course not found');
  res.json(ApiResponse.success('Course retrieved successfully', data));
});

export const getLecturerCourseStudents = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const lecturerId = resolveLecturerId(req);
  const { data: course, error: courseErr } = await db
    .from('courses')
    .select('id,title,code')
    .eq('id', req.params.id)
    .eq('lecturer_id', lecturerId)
    .maybeSingle();
  if (courseErr) throw ApiError.internal(`Failed to fetch course: ${courseErr.message}`);

  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  const { data: enrollments, error: enrErr } = await db
    .from('enrollments')
    .select('student_id')
    .eq('course_id', course.id)
    .eq('status', 'active');
  if (enrErr) throw ApiError.internal(`Failed to fetch enrollments: ${enrErr.message}`);

  const studentIds = (enrollments ?? []).map((e) => e.student_id);
  const { data: students, error: stuErr } = await db
    .from('profiles')
    .select('id,first_name,last_name,email,student_id,level,department_id,phone_number')
    .in('id', studentIds);
  if (stuErr) throw ApiError.internal(`Failed to fetch students: ${stuErr.message}`);

  res.json(
    ApiResponse.success('Students retrieved successfully', {
      course: {
        id: course.id,
        title: course.title,
        code: course.code,
      },
      students: (students ?? []) as ProfileRow[],
      total: studentIds.length,
    })
  );
});

export const getLecturerStudents = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const lecturerId = req.user!.userId as string;
  const { courseId, search } = req.query;

  let cq = db.from('courses').select('id,title,code').eq('lecturer_id', lecturerId);
  if (courseId) cq = cq.eq('id', String(courseId));
  const { data: courses, error: courseErr } = await cq;
  if (courseErr) throw ApiError.internal(`Failed to fetch courses: ${courseErr.message}`);
  const courseIds = (courses ?? []).map((c) => c.id as string);

  if (!courseIds.length) {
    return res.json(ApiResponse.success('No students found', { students: [], total: 0 }));
  }

  const { data: enrollments, error: enrErr } = await db
    .from('enrollments')
    .select('student_id,course_id')
    .in('course_id', courseIds)
    .eq('status', 'active');
  if (enrErr) throw ApiError.internal(`Failed to fetch enrollments: ${enrErr.message}`);

  const studentsMap = new Map<string, { student: { id: string; name: string; email: string; student_id: string; level?: string | number; department_id?: string; phone_number?: string }; courses: Array<{ id: string; title: string; code: string }> }>();

  const studentIds = Array.from(new Set((enrollments ?? []).map((e) => e.student_id)));
  const { data: studentRows, error: stuErr } = await db
    .from('profiles')
    .select('id,first_name,last_name,email,student_id,level,department_id,phone_number')
    .in('id', studentIds);
  if (stuErr) throw ApiError.internal(`Failed to fetch students: ${stuErr.message}`);
  const studentsById = new Map<string, ProfileRow>((studentRows ?? []).map((s) => [s.id, s as ProfileRow]));

  const term = search ? String(search).toLowerCase() : '';

  (enrollments ?? []).forEach((enr) => {
    const student = studentsById.get(enr.student_id);
    if (!student) return;

    if (term) {
      const haystack = `${student.first_name} ${student.last_name} ${student.student_id}`.toLowerCase();
      if (!haystack.includes(term)) return;
    }

    if (!studentsMap.has(student.id)) {
      studentsMap.set(student.id, {
        student: {
          id: student.id,
          name: `${student.first_name} ${student.last_name}`,
          email: student.email,
          student_id: student.student_id,
          level: student.level,
          department_id: student.department_id,
          phone_number: student.phone_number,
        },
        courses: [],
      });
    }

    const course = (courses ?? []).find((c) => c.id === enr.course_id);
    const entry = studentsMap.get(student.id);
    if (course && entry) {
      entry.courses.push({ id: course.id, title: course.title, code: course.code });
    }
  });

  return res.json(
    ApiResponse.success('Students retrieved successfully', {
      students: Array.from(studentsMap.values()),
      total: studentsMap.size,
    })
  );
});

export const getLecturerStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const lecturerId = req.user!.userId as string;
  const { id: studentId } = req.params;

  const { data: courses, error: courseErr } = await db
    .from('courses')
    .select('id,title,code,credits')
    .eq('lecturer_id', lecturerId);
  if (courseErr) throw ApiError.internal(`Failed to fetch courses: ${courseErr.message}`);
  const courseIds = (courses ?? []).map((c) => c.id as string);

  if (!courseIds.length) {
    throw ApiError.forbidden('You do not currently teach any courses');
  }

  const { data: enrCheck, error: enrErr } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .in('course_id', courseIds)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (enrErr) throw ApiError.internal(`Failed to verify enrollment: ${enrErr.message}`);
  if (!enrCheck) throw ApiError.forbidden('Student is not enrolled in your courses');

  const { data: student, error: stuErr } = await db
    .from('profiles')
    .select('id,first_name,last_name,email,student_id,level,department_id,phone_number,address')
    .eq('id', studentId)
    .maybeSingle();
  if (stuErr) throw ApiError.internal(`Failed to fetch student: ${stuErr.message}`);
  if (!student) throw ApiError.notFound('Student not found');

  const { data: studentEnrollments, error: seErr } = await db
    .from('enrollments')
    .select('course_id')
    .eq('student_id', studentId)
    .in('course_id', courseIds);
  if (seErr) throw ApiError.internal(`Failed to fetch enrollments: ${seErr.message}`);

  const { count: attendedCount, error: attErr } = await db
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .in('course_id', courseIds)
    .contains('attendees', [studentId]);
  if (attErr) throw ApiError.internal(`Failed to fetch attendance records: ${attErr.message}`);

  const { count: totalSessions, error: totalAttErr } = await db
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .in('course_id', courseIds);
  if (totalAttErr) throw ApiError.internal(`Failed to fetch total attendance sessions: ${totalAttErr.message}`);

  const { data: assignments, error: assErr } = await db
    .from('assignments')
    .select('id')
    .in('course_id', courseIds);
  if (assErr) throw ApiError.internal(`Failed to fetch assignments: ${assErr.message}`);
  const assignmentIds = (assignments ?? []).map((a) => a.id as string);

  const { count: submissions, error: subErr } = await db
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .in('assignment_id', assignmentIds);
  if (subErr) throw ApiError.internal(`Failed to fetch submissions: ${subErr.message}`);

  const { data: results, error: resErr } = await db
    .from('results')
    .select('course_id,grade,total_score')
    .eq('student_id', studentId)
    .in('course_id', courseIds)
    .eq('is_published', true);
  if (resErr) throw ApiError.internal(`Failed to fetch results: ${resErr.message}`);

  return res.json(
    ApiResponse.success('Student profile retrieved successfully', {
      student,
      courses: (studentEnrollments ?? []).map((enr) => {
        const course = (courses ?? []).find((c) => c.id === enr.course_id);
        return {
          id: course?.id,
          title: course?.title,
          code: course?.code,
          credits: course?.credits,
        };
      }),
      performance: {
        attendanceRate: totalSessions
          ? parseFloat((((attendedCount ?? 0) / (totalSessions ?? 0)) * 100).toFixed(1))
          : 0,
        submissions,
        results,
      },
    })
  );
});

export const getLecturerAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const lecturerId = req.user!.userId as string;

  const { data: courses, error: courseErr } = await db
    .from('courses')
    .select('id,title,code')
    .eq('lecturer_id', lecturerId);
  if (courseErr) throw ApiError.internal(`Failed to fetch courses: ${courseErr.message}`);
  const courseIds = (courses ?? []).map((c) => c.id as string);
  const { data: assignmentsRows, error: assErr } = await db
    .from('assignments')
    .select('id')
    .in('course_id', courseIds);
  if (assErr) throw ApiError.internal(`Failed to fetch assignments: ${assErr.message}`);
  const assignmentIds = (assignmentsRows ?? []).map((a) => a.id as string);

  const [activeStudents, assignments, attendanceSessions, submissions, publishedResults] = await Promise.all([
    db.from('enrollments').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('status', 'active'),
    db.from('assignments').select('id', { count: 'exact', head: true }).in('course_id', courseIds),
    db.from('attendance').select('id', { count: 'exact', head: true }).in('course_id', courseIds),
    db.from('submissions').select('id', { count: 'exact', head: true }).in('assignment_id', assignmentIds),
    db.from('results').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('is_published', true),
  ]);

  return res.json(
    ApiResponse.success('Analytics retrieved successfully', {
      courses: (courses ?? []).length,
      activeStudents: activeStudents.count ?? 0,
      assignments: assignments.count ?? 0,
      attendanceSessions: attendanceSessions.count ?? 0,
      submissions: submissions.count ?? 0,
      publishedResults: publishedResults.count ?? 0,
    })
  );
});

export const importLecturerResults = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const lecturerId = req.user!.userId as string;
  const { results } = req.body as { results: Array<{ studentId: string; courseId: string; sessionId: string; semester: string; caScore: number | string; examScore: number | string }> };

  if (!Array.isArray(results) || results.length === 0) {
    throw ApiError.badRequest('Results payload is required');
  }

  const { data: lecturerCourses, error: courseErr } = await db
    .from('courses')
    .select('id')
    .eq('lecturer_id', lecturerId);
  if (courseErr) throw ApiError.internal(`Failed to fetch lecturer courses: ${courseErr.message}`);
  const allowedCourseIds = new Set((lecturerCourses ?? []).map((c) => c.id as string));

  if (!allowedCourseIds.size) {
    throw ApiError.badRequest('You do not have any assigned courses');
  }

  const sessionIdSet = new Set<string>();
  results.forEach((entry) => {
    const sessionIdentifier = String(entry.sessionId);
    if (!sessionIdentifier) {
      throw ApiError.badRequest('Invalid session identifier');
    }
    sessionIdSet.add(sessionIdentifier);
  });

  const { data: sessionsRows, error: sessErr } = await db
    .from('sessions')
    .select('id')
    .in('id', Array.from(sessionIdSet));
  if (sessErr) throw ApiError.internal(`Failed to fetch sessions: ${sessErr.message}`);
  const validSessionIds = new Set((sessionsRows ?? []).map((s) => s.id as string));

  if (validSessionIds.size !== sessionIdSet.size) {
    throw ApiError.badRequest('One or more sessions could not be found');
  }

  const payload: Omit<ResultRow, 'id'>[] = [];

  for (const entry of results) {
    const { studentId, courseId, sessionId, semester, caScore, examScore } = entry;
    const normalizedStudentId = String(studentId);
    const normalizedCourseId = String(courseId);
    const normalizedSessionId = String(sessionId);

    if (!normalizedStudentId || !normalizedCourseId || !normalizedSessionId || !semester) {
      throw ApiError.badRequest('Each result must include studentId, courseId, sessionId and semester');
    }

    if (!allowedCourseIds.has(normalizedCourseId)) {
      throw ApiError.forbidden('You cannot upload results for courses you do not teach');
    }

    const { data: enr, error: enrErr } = await db
      .from('enrollments')
      .select('id')
      .eq('student_id', normalizedStudentId)
      .eq('course_id', normalizedCourseId)
      .limit(1)
      .maybeSingle();
    if (enrErr) throw ApiError.internal(`Failed to verify enrollment: ${enrErr.message}`);
    if (!enr) throw ApiError.badRequest('Student is not enrolled in this course');

    const parsedCa = Number(caScore);
    const parsedExam = Number(examScore);

    if (Number.isNaN(parsedCa) || Number.isNaN(parsedExam)) {
      throw ApiError.badRequest('Scores must be numeric');
    }

    if (parsedCa < 0 || parsedCa > 30) {
      throw ApiError.badRequest('CA score must be between 0 and 30');
    }

    if (parsedExam < 0 || parsedExam > 70) {
      throw ApiError.badRequest('Exam score must be between 0 and 70');
    }

    const totalScore = parsedCa + parsedExam;
    const grade = calculateGrade(totalScore) as GradeLetter;

    payload.push({
      student_id: normalizedStudentId,
      course_id: normalizedCourseId,
      session_id: normalizedSessionId,
      semester,
      ca_score: parsedCa,
      exam_score: parsedExam,
      total_score: totalScore,
      grade,
      grade_points: gradePoints[grade] ?? 0,
      entered_by: lecturerId,
      is_published: false,
    });
  }

  const { error } = await db
    .from('results')
    .upsert(payload, { onConflict: 'student_id,course_id,session_id' });
  if (error) throw ApiError.internal(`Failed to import results: ${error.message}`);

  return res.status(201).json(ApiResponse.success('Results imported successfully', { count: payload.length }));
});

