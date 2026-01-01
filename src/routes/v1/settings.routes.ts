import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { getUserSettings, updateUserSettings } from '../../controllers/settings.controller';

const router = Router();

router.use(authenticate);

router.get('/settings', getUserSettings);
router.put('/settings', updateUserSettings);

export default router;
