import { Router } from 'express';
import {
	getStudentTimetable,
	getStudentIdCard,
	getAvailableEnrollmentCourses,
	enrollInCourses,
	dropCourseEnrollment,
} from '../../controllers/student.controller';
import { createInstallmentPlan, getStudentInstallmentPlans } from '../../controllers/installment.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { listCourses, getCourse } from '../../controllers/course.controller';
import { getCourseMaterials, downloadCourseMaterial } from '../../controllers/material.controller';
import {
	getAssignments,
	getAssignmentById,
	submitAssignment,
	getAssignmentSubmissionForStudent,
} from '../../controllers/assignment.controller';
import { uploadSubmission } from '../../middleware/upload.middleware';
import {
	getQuizzes,
	getQuizById,
	startQuiz,
	submitQuiz,
	getMyQuizAttempt,
} from '../../controllers/quiz.controller';
import { getResults, getMyTranscript } from '../../controllers/result.controller';
import {
	getPayments,
	getPaymentById,
	getPaymentReceipt,
	initializePayment,
} from '../../controllers/payment.controller';
import { getHostels, applyForHostel, getMyHostelApplication } from '../../controllers/hostel.controller';
import { getMessages, sendMessage, getMessageThread } from '../../controllers/message.controller';
import {
	getNotifications,
	markAsRead,
	markAllAsRead,
	deleteNotification,
} from '../../controllers/notification.controller';

const router = Router();

router.use(authenticate, authorizeRoles('student'));

// Courses & materials
router.get('/students/courses', listCourses);
router.get('/students/courses/:id', getCourse);
router.get('/students/courses/:id/materials', getCourseMaterials);
router.post('/students/courses/:id/materials/:materialId/download', downloadCourseMaterial);

// Enrollment
router.get('/students/enrollment/available-courses', getAvailableEnrollmentCourses);
router.post('/students/enrollment', enrollInCourses);
router.delete('/students/enrollment/:courseId', dropCourseEnrollment);

// Assignments
router.get('/students/assignments', getAssignments);
router.get('/students/assignments/:id', getAssignmentById);
router.post('/students/assignments/:id/submit', uploadSubmission, submitAssignment);
router.get('/students/assignments/:id/submission', getAssignmentSubmissionForStudent);

// Quizzes
router.get('/students/quizzes', getQuizzes);
router.get('/students/quizzes/:id', getQuizById);
router.post('/students/quizzes/:id/start', startQuiz);
router.post('/students/quizzes/:id/submit', submitQuiz);
router.get('/students/quizzes/:id/results', getMyQuizAttempt);

// Results
router.get('/students/results', getResults);
router.get('/students/results/transcript', getMyTranscript);

// Payments
router.get('/students/payments', getPayments);
router.get('/students/payments/:id/receipt', getPaymentReceipt);
router.get('/students/payments/:id', getPaymentById);
router.post('/students/payments', initializePayment);

// Hostel
router.get('/students/hostel', getHostels);
router.post('/students/hostel/apply', applyForHostel);
router.get('/students/hostel/application', getMyHostelApplication);

// Messages
router.get('/students/messages', getMessages);
router.post('/students/messages', sendMessage);
router.get('/students/messages/:id', getMessageThread);

// Notifications
router.get('/students/notifications', getNotifications);
router.put('/students/notifications/:id/read', markAsRead);
router.put('/students/notifications/read-all', markAllAsRead);
router.delete('/students/notifications/:id', deleteNotification);

// Specialty endpoints
router.get('/students/timetable', getStudentTimetable);
router.get('/students/id-card', getStudentIdCard);
router.get('/students/payments/installments', getStudentInstallmentPlans);
router.post('/students/payments/installments', createInstallmentPlan);

export default router;
