import { Router } from 'express';
import authRoutes from './auth.routes';
import courseRoutes from './course.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/courses', courseRoutes);

export default router;
