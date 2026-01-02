import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import Attendance from '../models/Attendance.model';
import Course from '../models/Course.model';
import Enrollment from '../models/Enrollment.model';
import notificationService from '../services/notification.service';

// @desc    Get student attendance records
// @route   GET /api/v1/students/attendance
// @access  Private (Student)
export const getStudentAttendance = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { courseId } = req.query;

  // Get enrolled courses
  let enrollmentQuery: any = {
    student: userId,
    status: 'active'
  };

  if (courseId) {
    enrollmentQuery.course = courseId;
  }

  const enrollments = await Enrollment.find(enrollmentQuery)
    .populate('course', 'title code credits');

  // Calculate attendance statistics per course
  const courseStats = await Promise.all(
    enrollments.map(async (enrollment) => {
      const courseId = (enrollment.course as any)._id;
      
      const totalClasses = await Attendance.countDocuments({
        course: courseId
      });

      const attended = await Attendance.countDocuments({
        course: courseId,
        attendees: userId
      });

      const late = await Attendance.countDocuments({
        course: courseId,
        'late.student': userId
      });

      const percentage = totalClasses > 0 ? (attended / totalClasses) * 100 : 0;
      
      let status = 'Good';
      if (percentage < 75) {
        status = 'Warning';
      }
      if (percentage < 60) {
        status = 'Critical';
      }

      return {
        course: {
          id: courseId,
          code: (enrollment.course as any).code,
          title: (enrollment.course as any).title
        },
        totalClasses,
        attended,
        late,
        absent: totalClasses - attended - late,
        percentage: parseFloat(percentage.toFixed(1)),
        status
      };
    })
  );

  res.json(
    ApiResponse.success('Attendance records fetched successfully', {
      courses: courseStats
    })
  );
});

// @desc    Get lecturer attendance overview
// @route   GET /api/v1/lecturers/attendance
// @access  Private (Lecturer)
export const getLecturerAttendance = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { courseId } = req.query;

  // Get courses taught by lecturer
  let courseQuery: any = { lecturer: userId };
  if (courseId) {
    courseQuery._id = courseId;
  }

  const courses = await Course.find(courseQuery).select('_id title code');

  // Get attendance records
  const attendanceRecords = await Attendance.find({
    course: { $in: courses.map(c => c._id) }
  })
    .populate('course', 'title code')
    .sort({ date: -1 })
    .limit(50);

  // Calculate statistics per course
  const courseStats = await Promise.all(
    courses.map(async (course) => {
      const totalRecords = await Attendance.countDocuments({
        course: course._id
      });

      const avgAttendance = await Attendance.aggregate([
        { $match: { course: course._id } },
        {
          $group: {
            _id: null,
            avgPercentage: { $avg: '$attendancePercentage' }
          }
        }
      ]);

      return {
        course: {
          id: course._id,
          code: course.code,
          title: course.title
        },
        totalRecords,
        averageAttendance: avgAttendance.length > 0
          ? parseFloat(avgAttendance[0].avgPercentage.toFixed(1))
          : 0
      };
    })
  );

  res.json(
    ApiResponse.success('Attendance overview fetched successfully', {
      courseStats,
      recentRecords: attendanceRecords.map(record => ({
        id: record._id,
        course: {
          code: (record.course as any).code,
          title: (record.course as any).title
        },
        date: record.date,
        topic: record.topic,
        attendees: record.attendees.length,
        absentees: record.absentees.length,
        percentage: record.attendancePercentage
      }))
    })
  );
});

// @desc    Record attendance
// @route   POST /api/v1/lecturers/attendance
// @access  Private (Lecturer)
export const recordAttendance = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { courseId, date, topic, attendees, absentees, late } = req.body;

  // Verify course and authorization
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (course.lecturer.toString() !== userId) {
    res.status(403);
    throw new Error('Not authorized to record attendance for this course');
  }

  // Get total enrolled students
  const totalStudents = await Enrollment.countDocuments({
    course: courseId,
    status: 'active'
  });

  // Create attendance record
  const attendance = await Attendance.create({
    course: courseId,
    lecturer: userId,
    date: date || new Date(),
    topic,
    attendees: attendees || [],
    absentees: absentees || [],
    late: late || [],
    totalStudents
  });

  // Send notifications to absentees
  if (absentees && absentees.length > 0) {
    for (const studentId of absentees) {
      await notificationService.createNotification(
        studentId,
        'warning',
        'Attendance Alert',
        `You were marked absent for ${course.code} - ${course.title} on ${new Date(attendance.date).toDateString()}`,
        `/courses/${courseId}/attendance`
      );
    }
  }

  const populatedAttendance = await Attendance.findById(attendance._id)
    .populate('course', 'title code')
    .populate('attendees', 'firstName lastName matricNumber')
    .populate('absentees', 'firstName lastName matricNumber');

  res.status(201).json(
    ApiResponse.success('Attendance recorded successfully', populatedAttendance)
  );
});

// @desc    Get attendance history
// @route   GET /api/v1/lecturers/attendance/history
// @access  Private (Lecturer)
export const getAttendanceHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { courseId, page = 1, limit = 20 } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  let query: any = { lecturer: userId };
  if (courseId) {
    query.course = courseId;
  }

  const attendanceRecords = await Attendance.find(query)
    .populate('course', 'title code')
    .sort({ date: -1 })
    .skip(skip)
    .limit(Number(limit));

  const total = await Attendance.countDocuments(query);

  res.json(
    ApiResponse.success('Attendance history fetched successfully', {
      records: attendanceRecords.map(record => ({
        id: record._id,
        course: {
          id: (record.course as any)._id,
          code: (record.course as any).code,
          title: (record.course as any).title
        },
        date: record.date,
        topic: record.topic,
        attendees: record.attendees.length,
        absentees: record.absentees.length,
        late: record.late.length,
        totalStudents: record.totalStudents,
        percentage: record.attendancePercentage
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    })
  );
});

// @desc    Update attendance record
// @route   PUT /api/v1/lecturers/attendance/:id
// @access  Private (Lecturer)
export const updateAttendance = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { topic, attendees, absentees, late } = req.body;

  const attendance = await Attendance.findById(id);

  if (!attendance) {
    res.status(404);
    throw new Error('Attendance record not found');
  }

  // Check authorization
  if (attendance.lecturer.toString() !== userId) {
    res.status(403);
    throw new Error('Not authorized to update this attendance record');
  }

  // Update fields
  if (topic !== undefined) attendance.topic = topic;
  if (attendees !== undefined) attendance.attendees = attendees;
  if (absentees !== undefined) attendance.absentees = absentees;
  if (late !== undefined) attendance.late = late;

  await attendance.save();

  const updatedAttendance = await Attendance.findById(id)
    .populate('course', 'title code')
    .populate('attendees', 'firstName lastName matricNumber')
    .populate('absentees', 'firstName lastName matricNumber');

  res.json(
    ApiResponse.success('Attendance updated successfully', updatedAttendance)
  );
});

// @desc    Delete attendance record
// @route   DELETE /api/v1/lecturers/attendance/:id
// @access  Private (Lecturer)
export const deleteAttendance = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  const attendance = await Attendance.findById(id);

  if (!attendance) {
    res.status(404);
    throw new Error('Attendance record not found');
  }

  // Check authorization
  if (attendance.lecturer.toString() !== userId) {
    res.status(403);
    throw new Error('Not authorized to delete this attendance record');
  }

  await attendance.deleteOne();

  res.json(
    ApiResponse.success('Attendance record deleted successfully', null)
  );
});

