import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Course from '../models/Course.model';
import Enrollment from '../models/Enrollment.model';
import User from '../models/User.model';
import Attendance from '../models/Attendance.model';
import Assignment from '../models/Assignment.model';
import Submission from '../models/Submission.model';
import Result from '../models/Result.model';
import Session from '../models/Session.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { calculateGrade } from '../utils/helpers';

const gradePoints: Record<string, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
  F: 0,
};

const resolveLecturerId = (req: Request): string => {
  const authUser = (req as any).user;
  return authUser?._id?.toString() || authUser?.userId;
};

export const getLecturerCoursesList = asyncHandler(async (req: Request, res: Response) => {
  const lecturerId = resolveLecturerId(req);
  const { semester, level } = req.query;

  const filter: Record<string, unknown> = { lecturer: lecturerId };
  if (semester) filter.semester = semester;
  if (level) filter.level = level;

  const courses = await Course.find(filter)
    .populate('department', 'name code')
    .select('title code credits level semester department isActive');

  res.json(ApiResponse.success('Courses retrieved successfully', courses));
});

export const getLecturerCourseDetail = asyncHandler(async (req: Request, res: Response) => {
  const lecturerId = resolveLecturerId(req);
  const course = await Course.findOne({ _id: req.params.id, lecturer: lecturerId })
    .populate('department', 'name code faculty')
    .populate('prerequisites', 'code title credits')
    .populate('lecturer', 'firstName lastName email');

  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  res.json(ApiResponse.success('Course retrieved successfully', course));
});

export const getLecturerCourseStudents = asyncHandler(async (req: Request, res: Response) => {
  const lecturerId = resolveLecturerId(req);
  const course = await Course.findOne({ _id: req.params.id, lecturer: lecturerId });

  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  const enrollments = await Enrollment.find({ course: course._id, status: 'active' })
    .populate('student', 'firstName lastName email studentId level gender phoneNumber')
    .sort({ createdAt: -1 });

  res.json(
    ApiResponse.success('Students retrieved successfully', {
      course: {
        id: course._id,
        title: course.title,
        code: course.code,
      },
      students: enrollments.map((enrollment: any) => enrollment.student),
      total: enrollments.length,
    })
  );
});

export const getLecturerStudents = asyncHandler(async (req: Request, res: Response) => {
  const lecturerId = (req as any).user._id;
  const { courseId, search } = req.query;

  const courseQuery: Record<string, unknown> = { lecturer: lecturerId };
  if (courseId) {
    courseQuery._id = courseId;
  }

  const courses = await Course.find(courseQuery).select('title code');
  const courseIds = courses.map((course) => course._id);

  if (!courseIds.length) {
    return res.json(ApiResponse.success('No students found', { students: [], total: 0 }));
  }

  const enrollmentFilter: Record<string, unknown> = {
    course: { $in: courseIds },
    status: 'active',
  };

  const enrollments = await Enrollment.find(enrollmentFilter)
    .populate('student', 'firstName lastName email studentId level department gender phoneNumber')
    .populate('course', 'title code');

  const studentsMap = new Map<string, any>();

  enrollments.forEach((enrollment: any) => {
    const student = enrollment.student;
    if (!student) return;

    if (search) {
      const term = (search as string).toLowerCase();
      const haystack = `${student.firstName} ${student.lastName} ${student.studentId}`.toLowerCase();
      if (!haystack.includes(term)) {
        return;
      }
    }

    if (!studentsMap.has(student._id.toString())) {
      studentsMap.set(student._id.toString(), {
        student: {
          id: student._id,
          name: `${student.firstName} ${student.lastName}`,
          email: student.email,
          studentId: student.studentId,
          level: student.level,
          department: student.department,
          phoneNumber: student.phoneNumber,
        },
        courses: [],
      });
    }

    studentsMap.get(student._id.toString()).courses.push({
      id: enrollment.course._id,
      title: enrollment.course.title,
      code: enrollment.course.code,
    });
  });

  return res.json(
    ApiResponse.success('Students retrieved successfully', {
      students: Array.from(studentsMap.values()),
      total: studentsMap.size,
    })
  );
});

export const getLecturerStudentProfile = asyncHandler(async (req: Request, res: Response) => {
  const lecturerId = (req as any).user._id;
  const { id: studentId } = req.params;

  const courses = await Course.find({ lecturer: lecturerId }).select('_id title code');
  const courseIds = courses.map((course) => course._id);

  if (!courseIds.length) {
    throw ApiError.forbidden('You do not currently teach any courses');
  }

  const enrollment = await Enrollment.findOne({
    student: studentId,
    course: { $in: courseIds },
    status: 'active',
  });

  if (!enrollment) {
    throw ApiError.forbidden('Student is not enrolled in your courses');
  }

  const student = await User.findById(studentId).select('firstName lastName email studentId level department phoneNumber address');
  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  const studentEnrollments = await Enrollment.find({
    student: studentId,
    course: { $in: courseIds },
  }).populate('course', 'title code credits');

  const attendanceRecords = await Attendance.countDocuments({
    course: { $in: courseIds },
    attendees: studentId,
  });

  const totalAttendanceSessions = await Attendance.countDocuments({ course: { $in: courseIds } });

  const assignmentIds = await Assignment.find({ course: { $in: courseIds } }).distinct('_id');

  const submissions = await Submission.countDocuments({
    student: studentId,
    assignment: { $in: assignmentIds },
  });

  const results = await Result.find({
    student: studentId,
    course: { $in: courseIds },
    isPublished: true,
  }).select('course grade totalScore');

  return res.json(
    ApiResponse.success('Student profile retrieved successfully', {
      student,
      courses: studentEnrollments.map((enrollment: any) => ({
        id: enrollment.course._id,
        title: enrollment.course.title,
        code: enrollment.course.code,
        credits: enrollment.course.credits,
      })),
      performance: {
        attendanceRate: totalAttendanceSessions
          ? parseFloat(((attendanceRecords / totalAttendanceSessions) * 100).toFixed(1))
          : 0,
        submissions,
        results,
      },
    })
  );
});

export const getLecturerAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const lecturerId = (req as any).user._id;

  const courses = await Course.find({ lecturer: lecturerId }).select('_id title code');
  const courseIds = courses.map((course) => course._id);
  const assignmentIds = await Assignment.find({ course: { $in: courseIds } }).distinct('_id');

  const [activeStudents, assignments, attendanceSessions, submissions, publishedResults] = await Promise.all([
    Enrollment.countDocuments({ course: { $in: courseIds }, status: 'active' }),
    Assignment.countDocuments({ course: { $in: courseIds } }),
    Attendance.countDocuments({ course: { $in: courseIds } }),
    Submission.countDocuments({ assignment: { $in: assignmentIds } }),
    Result.countDocuments({ course: { $in: courseIds }, isPublished: true }),
  ]);

  return res.json(
    ApiResponse.success('Analytics retrieved successfully', {
      courses: courses.length,
      activeStudents,
      assignments,
      attendanceSessions,
      submissions,
      publishedResults,
    })
  );
});

export const importLecturerResults = asyncHandler(async (req: Request, res: Response) => {
  const lecturerId = (req as any).user._id;
  const { results } = req.body as { results: Array<Record<string, any>> };

  if (!Array.isArray(results) || results.length === 0) {
    throw ApiError.badRequest('Results payload is required');
  }

  const lecturerCourses = await Course.find({ lecturer: lecturerId }).select('_id');
  const allowedCourseIds = new Set(lecturerCourses.map((course) => course._id.toString()));

  if (!allowedCourseIds.size) {
    throw ApiError.badRequest('You do not have any assigned courses');
  }

  const sessionIdSet = new Set<string>();
  results.forEach((entry) => {
    const sessionIdentifier = String(entry.sessionId);
    if (!sessionIdentifier || !mongoose.Types.ObjectId.isValid(sessionIdentifier)) {
      throw ApiError.badRequest('Invalid session identifier');
    }
    sessionIdSet.add(sessionIdentifier);
  });

  const sessionIds = await Session.find({ _id: { $in: Array.from(sessionIdSet) } }).distinct('_id');
  const validSessionIds = new Set(sessionIds.map((id) => id.toString()));

  if (validSessionIds.size !== sessionIdSet.size) {
    throw ApiError.badRequest('One or more sessions could not be found');
  }

  const payload = [];

  for (const entry of results) {
    const { studentId, courseId, sessionId, semester, caScore, examScore } = entry;
    const normalizedStudentId = String(studentId);
    const normalizedCourseId = String(courseId);
    const normalizedSessionId = String(sessionId);

    if (!normalizedStudentId || !normalizedCourseId || !normalizedSessionId || !semester) {
      throw ApiError.badRequest('Each result must include studentId, courseId, sessionId and semester');
    }

    if (!mongoose.Types.ObjectId.isValid(normalizedStudentId) || !mongoose.Types.ObjectId.isValid(normalizedCourseId)) {
      throw ApiError.badRequest('Invalid identifiers supplied');
    }

    if (!allowedCourseIds.has(normalizedCourseId)) {
      throw ApiError.forbidden('You cannot upload results for courses you do not teach');
    }

    const studentObjectId = new mongoose.Types.ObjectId(normalizedStudentId);
    const courseObjectId = new mongoose.Types.ObjectId(normalizedCourseId);
    const sessionObjectId = new mongoose.Types.ObjectId(normalizedSessionId);

    const enrollmentExists = await Enrollment.exists({ student: studentObjectId, course: courseObjectId });
    if (!enrollmentExists) {
      throw ApiError.badRequest('Student is not enrolled in this course');
    }

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
    const grade = calculateGrade(totalScore);

    payload.push({
      student: studentObjectId,
      course: courseObjectId,
      session: sessionObjectId,
      semester,
      caScore: parsedCa,
      examScore: parsedExam,
      totalScore,
      grade,
      gradePoints: gradePoints[grade] ?? 0,
      enteredBy: lecturerId,
    });
  }

  const bulkOperations = payload.map((doc) => ({
    updateOne: {
      filter: { student: doc.student, course: doc.course, session: doc.session },
      update: { $set: doc },
      upsert: true,
    },
  }));

  await Result.bulkWrite(bulkOperations);

  return res.status(201).json(ApiResponse.success('Results imported successfully', { count: payload.length }));
});
