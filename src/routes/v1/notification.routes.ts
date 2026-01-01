import { Router } from 'express';
import {
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  getUnreadCount,
  getRecentNotifications,
} from '../../controllers/notification.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get recent notifications
router.get('/recent', getRecentNotifications);

// Get unread count
router.get('/unread/count', getUnreadCount);
router.get('/unread-count', getUnreadCount);

// Mark all as read
router.put('/read-all', markAllAsRead);

// Clear read notifications
router.delete('/clear-read', clearReadNotifications);

// Notification routes
router.get('/', getNotifications);
router.get('/:id', getNotificationById);
router.put('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

export default router;
