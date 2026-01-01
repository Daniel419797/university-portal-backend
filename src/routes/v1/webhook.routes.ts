import { Router } from 'express';
import { handlePaymentWebhook, handleEmailWebhook } from '../../controllers/webhook.controller';

const router = Router();

router.post('/webhooks/payment', handlePaymentWebhook);
router.post('/webhooks/email', handleEmailWebhook);

export default router;
