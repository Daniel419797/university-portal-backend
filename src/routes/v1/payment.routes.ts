import { Router } from 'express';
import {
  initializePayment,
  verifyPayment,
  getPayments,
  getPaymentById,
  manuallyVerifyPayment,
  rejectPayment,
  getPaymentReceipt,
  getPaymentStats,
  getStudentPayments,
} from '../../controllers/payment.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorizeRoles } from '../../middleware/role.middleware';
import { USER_ROLES } from '../../utils/constants';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Payment initialization and verification
router.post('/initialize', authorizeRoles(USER_ROLES.STUDENT), initializePayment);
router.get('/verify/:reference', verifyPayment);

// Payment management
router.get('/', getPayments);
router.get('/:id', getPaymentById);

// Manual verification (Bursary/Admin)
router.put(
  '/:id/verify',
  authorizeRoles(USER_ROLES.BURSARY, USER_ROLES.ADMIN),
  manuallyVerifyPayment
);

router.put(
  '/:id/reject',
  authorizeRoles(USER_ROLES.BURSARY, USER_ROLES.ADMIN),
  rejectPayment
);

// Receipt and stats
router.get('/:id/receipt', getPaymentReceipt);

router.get(
  '/stats/overview',
  authorizeRoles(USER_ROLES.BURSARY, USER_ROLES.ADMIN),
  getPaymentStats
);

router.get('/student/:studentId', getStudentPayments);

export default router;
