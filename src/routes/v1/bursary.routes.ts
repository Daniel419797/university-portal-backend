import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { getBursaryReports, generateBursaryReport } from '../../controllers/bursary.controller';
import { getBursaryDashboard } from '../../controllers/dashboard.controller';
import {
	getPayments,
	getPaymentById,
	manuallyVerifyPayment,
	rejectPayment,
} from '../../controllers/payment.controller';

const router = Router();

router.use(authenticate, authorizeRoles('bursary'));

router.get('/reports', getBursaryReports);
router.post('/reports/generate', generateBursaryReport);
router.get('/payments', getPayments);
router.get('/payments/:id', getPaymentById);
router.post('/payments/:id/verify', manuallyVerifyPayment);
router.post('/payments/:id/reject', rejectPayment);

// Bursary dashboard
router.get('/dashboard', getBursaryDashboard);

export default router;
