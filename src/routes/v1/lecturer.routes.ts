import { Router } from 'express';
import {
  getLecturerAnalytics,
  getLecturerStudentProfile,
  getLecturerStudents,
  importLecturerResults,
  getLecturerCoursesList,
  getLecturerCourseDetail,
  getLecturerCourseStudents,
} from '../../controllers/lecturer.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  getAssignmentSubmissions,
  gradeSubmission,
} from '../../controllers/assignment.controller';
import { uploadDocuments, uploadAny } from '../../middleware/upload.middleware';
import {
  uploadCourseMaterial,
  deleteCourseMaterial,
} from '../../controllers/material.controller';
import {
  createQuiz,
  getQuizzes,
  getQuizById,
  updateQuiz,
  deleteQuiz,
  getQuizAttempts,
} from '../../controllers/quiz.controller';
import {
  getResults,
  createResult,
  updateResult,
} from '../../controllers/result.controller';
import { getMessages, sendMessage, getMessageThread } from '../../controllers/message.controller';

const router = Router();

router.use(authenticate, authorizeRoles('lecturer'));

// Courses
router.get('/courses', getLecturerCoursesList);
router.get('/courses/:id', getLecturerCourseDetail);
router.get('/courses/:id/students', getLecturerCourseStudents);
router.post('/courses/:id/materials', uploadAny, uploadCourseMaterial);
router.delete('/courses/:id/materials/:materialId', deleteCourseMaterial);

// Assignments
router
  .route('/assignments')
  .get(getAssignments)
  .post(uploadDocuments, createAssignment);

router
  .route('/assignments/:id')
  .get(getAssignmentById)
  .put(updateAssignment)
  .delete(deleteAssignment);

router.get('/assignments/:id/submissions', getAssignmentSubmissions);
router.post('/assignments/:id/submissions/:submissionId/grade', gradeSubmission);

// Quizzes
router
  .route('/quizzes')
  .get(getQuizzes)
  .post(createQuiz);

router
  .route('/quizzes/:id')
  .get(getQuizById)
  .put(updateQuiz)
  .delete(deleteQuiz);

router.get('/quizzes/:id/responses', getQuizAttempts);

// Results
router.get('/results', getResults);
router.post('/results', createResult);
router.put('/results/:id', updateResult);

// Messages
router.get('/messages', getMessages);
router.post('/messages', sendMessage);
router.get('/messages/:id', getMessageThread);

router.get('/students', getLecturerStudents);
router.get('/students/:id', getLecturerStudentProfile);
router.post('/results/import', importLecturerResults);
router.get('/analytics', getLecturerAnalytics);

export default router;
