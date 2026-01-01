import { Router } from 'express';
import {
  getMessages,
  getMessageThread,
  sendMessage,
  markMessageAsRead,
  deleteMessage,
  getUnreadCount
} from '../../controllers/message.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get unread count (must be before /:id route)
router.get('/unread/count', getUnreadCount);

// Get all messages (inbox/sent)
router.get('/', getMessages);

// Send a message
router.post('/', sendMessage);

// Get message thread
router.get('/:id', getMessageThread);

// Mark message as read
router.put('/:id/read', markMessageAsRead);

// Delete message
router.delete('/:id', deleteMessage);

export default router;
