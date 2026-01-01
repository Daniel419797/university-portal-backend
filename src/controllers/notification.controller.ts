import { Request, Response } from 'express';
import Notification from '../models/Notification.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';

/**
 * @desc    Get all notifications for current user
 * @route   GET /api/v1/notifications
 * @access  Private
 */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 20, read } = req.query;

  const query: Record<string, unknown> = {
    user: (req as any).user._id,
  };

  // Filter by read status
  if (read !== undefined) {
    query.isRead = read === 'true';
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Notification.countDocuments(query),
    Notification.countDocuments({ user: (req as any).user._id, isRead: false }),
  ]);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      notifications,
      unreadCount,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    })
  );
});

/**
 * @desc    Get single notification by ID
 * @route   GET /api/v1/notifications/:id
 * @access  Private
 */
export const getNotificationById = asyncHandler(async (req: Request, res: Response) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  // Users can only view their own notifications
  if (notification.user.toString() !== (req as any).user._id.toString()) {
    throw ApiError.forbidden('You are not authorized to view this notification');
  }

  // Mark as read when viewed
  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  res.json(ApiResponse.success('Data retrieved successfully', notification));
});

/**
 * @desc    Mark notification as read
 * @route   PUT /api/v1/notifications/:id/read
 * @access  Private
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  // Users can only mark their own notifications
  if (notification.user.toString() !== (req as any).user._id.toString()) {
    throw ApiError.forbidden('You are not authorized to modify this notification');
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  res.json(ApiResponse.success('Notification marked as read', notification));
});

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/v1/notifications/read-all
 * @access  Private
 */
export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await Notification.updateMany(
    { user: (req as any).user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  res.json(
    ApiResponse.success('All notifications marked as read', { modifiedCount: result.modifiedCount })
  );
});

/**
 * @desc    Delete notification
 * @route   DELETE /api/v1/notifications/:id
 * @access  Private
 */
export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  // Users can only delete their own notifications
  if (notification.user.toString() !== (req as any).user._id.toString()) {
    throw ApiError.forbidden('You are not authorized to delete this notification');
  }

  await notification.deleteOne();

  res.json(ApiResponse.success('Notification deleted successfully', null));
});

/**
 * @desc    Delete all read notifications
 * @route   DELETE /api/v1/notifications/clear-read
 * @access  Private
 */
export const clearReadNotifications = asyncHandler(async (req: Request, res: Response) => {
  const result = await Notification.deleteMany({
    user: (req as any).user._id,
    isRead: true,
  });

  res.json(
    ApiResponse.success('Read notifications cleared', { deletedCount: result.deletedCount })
  );
});

/**
 * @desc    Get unread notification count
 * @route   GET /api/v1/notifications/unread/count
 * @access  Private
 */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const count = await Notification.countDocuments({
    user: (req as any).user._id,
    isRead: false,
  });

  res.json(ApiResponse.success('Data retrieved successfully', { count }));
});

/**
 * @desc    Get recent notifications (last 10)
 * @route   GET /api/v1/notifications/recent
 * @access  Private
 */
export const getRecentNotifications = asyncHandler(async (req: Request, res: Response) => {
  const notifications = await Notification.find({
    user: (req as any).user._id,
  })
    .sort({ createdAt: -1 })
    .limit(10);

  const unreadCount = await Notification.countDocuments({
    user: (req as any).user._id,
    isRead: false,
  });

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      notifications,
      unreadCount,
    })
  );
});
