import { Request, Response } from 'express';
import Enrollment from '../models/Enrollment.model';
import User from '../models/User.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import Course from '../models/Course.model';

const getAuthStudentId = (req: Request): string => {
  const authUser = (req as any).user;
  return authUser?._id?.toString() || authUser?.userId;
};

export const getStudentTimetable = asyncHandler(async (req: Request, res: Response) => {
  const studentId = (req as any).user._id;

  const enrollments = await Enrollment.find({
    student: studentId,
    status: 'active',
  })
    .populate({ path: 'course', select: 'code title lecturer schedule department', populate: { path: 'lecturer', select: 'firstName lastName email' } })
    .populate('session', 'name');

  const timetableEntries = enrollments.flatMap((enrollment: any) => {
    const course = enrollment.course;
    if (!course) return [];

    return (course.schedule || []).map((slot: any) => ({
      courseId: course._id,
      courseCode: course.code,
      courseTitle: course.title,
      lecturer: course.lecturer
        ? `${course.lecturer.firstName} ${course.lecturer.lastName}`
        : 'TBD',
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      venue: slot.venue,
      session: enrollment.session?.name,
    }));
  });

  const groupedByDay = timetableEntries.reduce<Record<string, any[]>>((acc, entry) => {
    if (!acc[entry.day]) {
      acc[entry.day] = [];
    }
    acc[entry.day].push(entry);
    return acc;
  }, {});

  Object.values(groupedByDay).forEach((entries) => {
    entries.sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  res.json(
    ApiResponse.success('Timetable retrieved successfully', {
      timetable: groupedByDay,
      totalCourses: enrollments.length,
    })
  );
});

export const getStudentIdCard = asyncHandler(async (req: Request, res: Response) => {
  const studentId = (req as any).user._id;

  const student = await User.findById(studentId).populate('department', 'name code faculty');
  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  if (student.role !== 'student') {
    throw ApiError.forbidden('ID cards are only available to students');
  }

  const qrPayload = {
    studentId: student.studentId,
    name: `${student.firstName} ${student.lastName}`,
    issuedAt: new Date().toISOString(),
  };

  const idCard = {
    fullName: `${student.firstName} ${student.lastName}`,
    studentId: student.studentId,
    level: student.level,
    department: (student.department as any)?.name,
    departmentCode: (student.department as any)?.code,
    faculty: (student.department as any)?.faculty,
    avatar: student.avatar,
    issuedAt: new Date(),
    qrCode: Buffer.from(JSON.stringify(qrPayload)).toString('base64'),
  };

  res.json(ApiResponse.success('ID card generated successfully', idCard));
});

export const getAvailableEnrollmentCourses = asyncHandler(async (req: Request, res: Response) => {
  const studentId = getAuthStudentId(req);
  const { semester, level, department } = req.query;

  if (!studentId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  const activeEnrollments = await Enrollment.find({
    student: studentId,
    status: 'active',
  }).select('course');

  const enrolledCourseIds = activeEnrollments.map((enrollment: any) => enrollment.course);

  const filters: any = {
    isActive: true,
    _id: { $nin: enrolledCourseIds },
  };

  if (semester) filters.semester = semester;
  if (level) filters.level = level;
  if (department) filters.department = department;

  const courses = await Course.find(filters)
    .populate('department', 'name code')
    .populate('lecturer', 'firstName lastName email');

  res.json(
    ApiResponse.success('Available courses retrieved successfully', {
      courses,
      total: courses.length,
    })
  );
});

export const enrollInCourses = asyncHandler(async (req: Request, res: Response) => {
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
    const course = await Course.findById(courseId);

    if (!course) {
      results.push({ courseId, status: 'skipped', reason: 'Course not found' });
      continue;
    }

    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      course: courseId,
      status: 'active',
    });

    if (existingEnrollment) {
      results.push({ courseId, status: 'skipped', reason: 'Already enrolled' });
      continue;
    }

    await Enrollment.create({
      student: studentId,
      course: courseId,
      session: course.session,
      semester: course.semester,
      status: 'active',
    });

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
  const studentId = getAuthStudentId(req);
  const { courseId } = req.params;

  if (!studentId) {
    throw ApiError.unauthorized('Unable to determine authenticated user');
  }

  const enrollment = await Enrollment.findOneAndUpdate(
    { student: studentId, course: courseId, status: 'active' },
    { status: 'dropped' },
    { new: true }
  );

  if (!enrollment) {
    throw ApiError.notFound('Active enrollment not found for this course');
  }

  res.json(ApiResponse.success('Course dropped successfully', enrollment));
});
