import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { uploadAny } from '../../middleware/upload.middleware';
import { deleteFileAsset, getFileAsset, uploadFileAsset } from '../../controllers/file.controller';

const router = Router();

router.post('/files/upload', authenticate, uploadAny, uploadFileAsset);
router.get('/files/:id', authenticate, getFileAsset);
router.delete('/files/:id', authenticate, deleteFileAsset);

export default router;
