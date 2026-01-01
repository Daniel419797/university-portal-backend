import { Router } from 'express';
import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollCourse,
  unenrollCourse,
  getEnrolledStudents,
} from '../../controllers/course.controller';
import {
  uploadCourseMaterial,
  getCourseMaterials,
  downloadCourseMaterial,
  deleteCourseMaterial
} from '../../controllers/material.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { uploadAny } from '../../middleware/upload.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/courses:
 *   get:
 *     tags: [Courses]
 *     summary: List all courses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *       - in: query
 *         name: semester
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Courses retrieved successfully
 */
router.get('/', authenticate, listCourses);

/**
 * @swagger
 * /api/v1/courses/{id}:
 *   get:
 *     tags: [Courses]
 *     summary: Get course by ID
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Course retrieved successfully
 */
router.get('/:id', authenticate, getCourse);

/**
 * @swagger
 * /api/v1/courses:
 *   post:
 *     tags: [Courses]
 *     summary: Create a new course (Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Course created successfully
 */
router.post('/', authenticate, authorizeRoles('admin'), createCourse);

/**
 * @swagger
 * /api/v1/courses/{id}:
 *   put:
 *     tags: [Courses]
 *     summary: Update course
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Course updated successfully
 */
router.put('/:id', authenticate, authorizeRoles('admin', 'lecturer'), updateCourse);

/**
 * @swagger
 * /api/v1/courses/{id}:
 *   delete:
 *     tags: [Courses]
 *     summary: Delete course (Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Course deleted successfully
 */
router.delete('/:id', authenticate, authorizeRoles('admin'), deleteCourse);

/**
 * @swagger
 * /api/v1/courses/{id}/enroll:
 *   post:
 *     tags: [Courses]
 *     summary: Enroll in course (Student)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Enrolled successfully
 */
router.post('/:id/enroll', authenticate, authorizeRoles('student'), enrollCourse);

/**
 * @swagger
 * /api/v1/courses/{id}/unenroll:
 *   delete:
 *     tags: [Courses]
 *     summary: Unenroll from course (Student)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unenrolled successfully
 */
router.delete('/:id/unenroll', authenticate, authorizeRoles('student'), unenrollCourse);

/**
 * @swagger
 * /api/v1/courses/{id}/students:
 *   get:
 *     tags: [Courses]
 *     summary: Get enrolled students
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Students retrieved successfully
 */
router.get('/:id/students', authenticate, authorizeRoles('lecturer', 'admin'), getEnrolledStudents);

// Course Materials Routes
router.post(
  '/:id/materials',
  authenticate,
  authorizeRoles('lecturer'),
  uploadAny,
  uploadCourseMaterial
);

router.get('/:id/materials', authenticate, getCourseMaterials);

router.post(
  '/:id/materials/:materialId/download',
  authenticate,
  authorizeRoles('student'),
  downloadCourseMaterial
);

router.delete(
  '/:id/materials/:materialId',
  authenticate,
  authorizeRoles('lecturer'),
  deleteCourseMaterial
);

export default router;
