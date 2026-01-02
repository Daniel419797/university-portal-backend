import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import notificationService from '../services/notification.service';

type CourseRow = { id: string; code: string; title: string };
type AttendanceHistoryRow = {
  id: string;
  course_id: string;
  date: string;
  topic: string;
  attendees: string[];
  absentees: string[];
  late: string[];
  total_students: number;
};

// @desc    Get student attendance records
// @route   GET /api/v1/students/attendance
// @access  Private (Student)
export const getStudentAttendance = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  const { courseId } = req.query as Record<string, string | undefined>;
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  let enrollQuery = db.from('enrollments').select('course_id').eq('student_id', userId).eq('status', 'active');
  if (courseId) enrollQuery = enrollQuery.eq('course_id', courseId);
  const { data: enrollments, error: enrollError } = await enrollQuery;
  if (enrollError) throw ApiError.internal(`Failed to fetch enrollments: ${enrollError.message}`);

  const courseIds = (enrollments || []).map((e: { course_id: string }) => e.course_id);
  const { data: courses } = await db.from('courses').select('id, code, title').in('id', courseIds);
  const courseMap = new Map((courses || []).map((c: { id: string; code: string; title: string }) => [c.id, c]));

  const courseStats = await Promise.all(
    (courseIds || []).map(async (cId) => {
      const totalResp = await db.from('attendance').select('id', { count: 'exact', head: true }).eq('course_id', cId);
      const attendedResp = await db
        .from('attendance')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', cId)
        .contains('attendees', [userId]);
      const lateResp = await db
        .from('attendance')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', cId)
        .contains('late', [userId]);

      const totalClasses = totalResp.count || 0;
      const attended = attendedResp.count || 0;
      const late = lateResp.count || 0;
      const percentage = totalClasses > 0 ? (attended / totalClasses) * 100 : 0;

      let status = 'Good';
      if (percentage < 75) status = 'Warning';
      if (percentage < 60) status = 'Critical';

      const course = courseMap.get(cId) || { id: cId, code: '', title: '' };
      return {
        course: { id: cId, code: course.code, title: course.title },
        totalClasses,
        attended,
        late,
        absent: Math.max(0, totalClasses - attended - late),
        percentage: parseFloat(percentage.toFixed(1)),
        status,
      };
    })
  );

  res.json(ApiResponse.success('Attendance records fetched successfully', { courses: courseStats }));
});

// @desc    Get lecturer attendance overview
// @route   GET /api/v1/lecturers/attendance
// @access  Private (Lecturer)
export const getLecturerAttendance = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  const { courseId } = req.query as Record<string, string | undefined>;
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  let coursesQuery = db.from('courses').select('id, code, title').eq('lecturer_id', userId);
  if (courseId) coursesQuery = coursesQuery.eq('id', courseId);
  const { data: courses, error: courseErr } = await coursesQuery;
  if (courseErr) throw ApiError.internal(`Failed to fetch courses: ${courseErr.message}`);

  const courseIds = (courses || []).map((c) => c.id);
  const { data: attendanceRecords } = await db
    .from('attendance')
    .select('id, course_id, date, topic, attendees, absentees, late, total_students, attendance_percentage')
    .in('course_id', courseIds)
    .order('date', { ascending: false })
    .limit(50);

  const courseStats = await Promise.all(
    (courses || []).map(async (course) => {
      const totalResp = await db.from('attendance').select('id', { count: 'exact', head: true }).eq('course_id', course.id);
      const recordsForCourse = (attendanceRecords || []).filter((r) => r.course_id === course.id);
      const avg = recordsForCourse.length
        ?
            parseFloat(
              (
                recordsForCourse.reduce((sum, rec) => {
                  const pct = rec.total_students > 0 ? (rec.attendees.length / rec.total_students) * 100 : 0;
                  return sum + pct;
                }, 0) / recordsForCourse.length
              ).toFixed(1)
            )
        : 0;
      return { course: { id: course.id, code: course.code, title: course.title }, totalRecords: totalResp.count || 0, averageAttendance: avg };
    })
  );

  const courseMap = new Map((courses || []).map((c) => [c.id, c]));
  const recentRecords = (attendanceRecords || []).map((record) => {
    const course = courseMap.get(record.course_id) || { code: '', title: '' };
    const percentage = record.total_students > 0 ? parseFloat(((record.attendees.length / record.total_students) * 100).toFixed(1)) : 0;
    return {
      id: record.id,
      course: { code: course.code, title: course.title },
      date: record.date,
      topic: record.topic,
      attendees: record.attendees.length,
      absentees: record.absentees.length,
      percentage,
    };
  });

  res.json(ApiResponse.success('Attendance overview fetched successfully', { courseStats, recentRecords }));
});

// @desc    Record attendance
// @route   POST /api/v1/lecturers/attendance
// @access  Private (Lecturer)
export const recordAttendance = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  const { courseId, date, topic, attendees, absentees, late } = req.body as {
    courseId: string;
    date?: string;
    topic?: string;
    attendees?: string[];
    absentees?: string[];
    late?: string[];
  };
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: course, error: courseErr } = await db.from('courses').select('id, code, title, lecturer_id').eq('id', courseId).maybeSingle();
  if (courseErr) throw ApiError.internal(`Failed to fetch course: ${courseErr.message}`);
  if (!course) throw ApiError.notFound('Course not found');
  if (course.lecturer_id !== userId) throw ApiError.forbidden('Not authorized to record attendance for this course');

  const totalResp = await db.from('enrollments').select('id', { count: 'exact', head: true }).eq('course_id', courseId).eq('status', 'active');
  const totalStudents = totalResp.count || 0;
  const att = attendees || [];
  const percentage = totalStudents > 0 ? parseFloat(((att.length / totalStudents) * 100).toFixed(1)) : 0;

  const { data: inserted, error: insertErr } = await db
    .from('attendance')
    .insert({
      course_id: courseId,
      lecturer_id: userId,
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      topic: topic || null,
      attendees: att,
      absentees: absentees || [],
      late: late || [],
      total_students: totalStudents,
      attendance_percentage: percentage,
    })
    .select()
    .single();
  if (insertErr) throw ApiError.internal(`Failed to record attendance: ${insertErr.message}`);

  if (absentees && absentees.length > 0) {
    for (const studentId of absentees) {
      await notificationService.createNotification(
        studentId,
        'warning',
        'Attendance Alert',
        `You were marked absent for ${course.code} - ${course.title} on ${new Date(inserted.date).toDateString()}`,
        `/courses/${courseId}/attendance`
      );
    }
  }

  res.status(201).json(ApiResponse.success('Attendance recorded successfully', inserted));
});

// @desc    Get attendance history
// @route   GET /api/v1/lecturers/attendance/history
// @access  Private (Lecturer)
export const getAttendanceHistory = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  const { courseId, page = 1, limit = 20 } = req.query as Record<string, string>;
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const pageNum = Number(page) || 1;
  const limitNum = Math.min(Number(limit) || 20, 100);
  const from = (pageNum - 1) * limitNum;
  const to = from + limitNum - 1;

  let query = db.from('attendance').select('id, course_id, date, topic, attendees, absentees, late, total_students');
  query = query.eq('lecturer_id', userId);
  if (courseId) query = query.eq('course_id', courseId);
  query = query.order('date', { ascending: false }).range(from, to);

  const [{ data: records, error }, totalResp, coursesResp] = await Promise.all([
    query,
    db.from('attendance').select('id', { count: 'exact', head: true }).eq('lecturer_id', userId).match(courseId ? { course_id: courseId } : {}),
    db.from('courses').select('id, code, title'),
  ]);
  if (error) throw ApiError.internal(`Failed to fetch attendance history: ${error.message}`);

  const courseMap = new Map<string, CourseRow>(((coursesResp.data as CourseRow[]) || []).map((c) => [c.id, c]));
  const formatted = ((records as AttendanceHistoryRow[]) || []).map((record) => {
    const course = courseMap.get(record.course_id) || { id: record.course_id, code: '', title: '' };
    const percentage = record.total_students > 0 ? parseFloat(((record.attendees.length / record.total_students) * 100).toFixed(1)) : 0;
    return {
      id: record.id,
      course: { id: course.id, code: course.code, title: course.title },
      date: record.date,
      topic: record.topic,
      attendees: record.attendees.length,
      absentees: record.absentees.length,
      late: record.late.length,
      totalStudents: record.total_students,
      percentage,
    };
  });

  res.json(
    ApiResponse.success('Attendance history fetched successfully', {
      records: formatted,
      pagination: { page: pageNum, limit: limitNum, total: totalResp.count || 0, totalPages: Math.ceil((totalResp.count || 0) / limitNum) },
    })
  );
});

// @desc    Update attendance record
// @route   PUT /api/v1/lecturers/attendance/:id
// @access  Private (Lecturer)
export const updateAttendance = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  const { id } = req.params;
  const { topic, attendees, absentees, late } = req.body as { topic?: string; attendees?: string[]; absentees?: string[]; late?: string[] };
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: attendance, error } = await db.from('attendance').select('id, lecturer_id, total_students').eq('id', id).maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch attendance: ${error.message}`);
  if (!attendance) throw ApiError.notFound('Attendance record not found');
  const attRow = attendance as { id: string; lecturer_id: string; total_students: number };
  if (attRow.lecturer_id !== userId) throw ApiError.forbidden('Not authorized to update this attendance record');

  const att = attendees ?? [];
  const percentage = attendance.total_students > 0 ? parseFloat(((att.length / attendance.total_students) * 100).toFixed(1)) : undefined;

  const { data: updated, error: updateErr } = await db
    .from('attendance')
    .update({
      ...(topic !== undefined ? { topic } : {}),
      ...(attendees !== undefined ? { attendees } : {}),
      ...(absentees !== undefined ? { absentees } : {}),
      ...(late !== undefined ? { late } : {}),
      ...(percentage !== undefined ? { attendance_percentage: percentage } : {}),
    })
    .eq('id', id)
    .select()
    .single();
  if (updateErr) throw ApiError.internal(`Failed to update attendance: ${updateErr.message}`);

  res.json(ApiResponse.success('Attendance updated successfully', updated));
});

// @desc    Delete attendance record
// @route   DELETE /api/v1/lecturers/attendance/:id
// @access  Private (Lecturer)
export const deleteAttendance = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId;
  const { id } = req.params;
  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: attendance, error } = await db.from('attendance').select('id, lecturer_id').eq('id', id).maybeSingle();
  if (error) throw ApiError.internal(`Failed to fetch attendance: ${error.message}`);
  if (!attendance) throw ApiError.notFound('Attendance record not found');
  const attDelRow = attendance as { id: string; lecturer_id: string };
  if (attDelRow.lecturer_id !== userId) throw ApiError.forbidden('Not authorized to delete this attendance record');

  const { error: delErr } = await db.from('attendance').delete().eq('id', id);
  if (delErr) throw ApiError.internal(`Failed to delete attendance: ${delErr.message}`);

  res.json(ApiResponse.success('Attendance record deleted successfully', null));
});

