import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';

/**
 * @desc    Get all notifications for current user
 * @route   GET /api/v1/notifications
 * @access  Private
 */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const { page = 1, limit = 20, read } = req.query;
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  let query = db
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  // Filter by read status
  if (read !== undefined) {
    query = query.is('read_at', read === 'true' ? 'not.null' : 'null');
  }

  const [result, unreadResult] = await Promise.all([
    query.order('created_at', { ascending: false }).range(skip, skip + limitNum - 1),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
  ]);

  if (result.error) throw ApiError.internal(`Failed to fetch notifications: ${result.error.message}`);

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      notifications: result.data,
      unreadCount: unreadResult.count || 0,
      pagination: {
        total: result.count || 0,
        page: pageNum,
        pages: Math.ceil((result.count || 0) / limitNum),
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
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: notification, error } = await db
    .from('notifications')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw ApiError.internal(`Failed to fetch notification: ${error.message}`);
  if (!notification) throw ApiError.notFound('Notification not found');

  // Users can only view their own notifications
  if (notification.user_id !== userId) {
    throw ApiError.forbidden('You are not authorized to view this notification');
  }

  // Mark as read when viewed
  if (!notification.read_at) {
    const { error: updateError } = await db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (!updateError) {
      notification.read_at = new Date().toISOString();
    }
  }

  res.json(ApiResponse.success('Data retrieved successfully', notification));
});

/**
 * @desc    Mark notification as read
 * @route   PUT /api/v1/notifications/:id/read
 * @access  Private
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: notification, error: fetchError } = await db
    .from('notifications')
    .select('user_id, read_at')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) throw ApiError.internal(`Failed to fetch notification: ${fetchError.message}`);
  if (!notification) throw ApiError.notFound('Notification not found');

  // Users can only mark their own notifications
  if (notification.user_id !== userId) {
    throw ApiError.forbidden('You are not authorized to modify this notification');
  }

  const { data, error } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) throw ApiError.internal(`Failed to update notification: ${error.message}`);

  res.json(ApiResponse.success('Notification marked as read', data));
});

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/v1/notifications/read-all
 * @access  Private
 */
export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { error } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw ApiError.internal(`Failed to update notifications: ${error.message}`);

  // Get count of affected rows
  const { count } = await db
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('read_at', 'is', null);

  res.json(
    ApiResponse.success('All notifications marked as read', { modifiedCount: count || 0 })
  );
});

/**
 * @desc    Delete notification
 * @route   DELETE /api/v1/notifications/:id
 * @access  Private
 */
export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { data: notification, error: fetchError } = await db
    .from('notifications')
    .select('user_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchError) throw ApiError.internal(`Failed to fetch notification: ${fetchError.message}`);
  if (!notification) throw ApiError.notFound('Notification not found');

  // Users can only delete their own notifications
  if (notification.user_id !== userId) {
    throw ApiError.forbidden('You are not authorized to delete this notification');
  }

  const { error } = await db.from('notifications').delete().eq('id', req.params.id);

  if (error) throw ApiError.internal(`Failed to delete notification: ${error.message}`);

  res.json(ApiResponse.success('Notification deleted successfully', null));
});

/**
 * @desc    Delete all read notifications
 * @route   DELETE /api/v1/notifications/clear-read
 * @access  Private
 */
export const clearReadNotifications = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  // Get count before deletion
  const { count: deleteCount } = await db
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('read_at', 'is', null);

  const { error } = await db
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .not('read_at', 'is', null);

  if (error) throw ApiError.internal(`Failed to delete notifications: ${error.message}`);

  res.json(
    ApiResponse.success('Read notifications cleared', { deletedCount: deleteCount || 0 })
  );
});

/**
 * @desc    Get unread notification count
 * @route   GET /api/v1/notifications/unread/count
 * @access  Private
 */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const { count, error } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw ApiError.internal(`Failed to count notifications: ${error.message}`);

  res.json(ApiResponse.success('Data retrieved successfully', { count: count || 0 }));
});

/**
 * @desc    Get recent notifications (last 10)
 * @route   GET /api/v1/notifications/recent
 * @access  Private
 */
export const getRecentNotifications = asyncHandler(async (req: Request, res: Response) => {
  const db = supabaseAdmin();
  const userId = req.user?.userId || req.user?._id?.toString();

  if (!userId) throw ApiError.unauthorized('User not authenticated');

  const [notificationsResult, unreadResult] = await Promise.all([
    db
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null),
  ]);

  if (notificationsResult.error) {
    throw ApiError.internal(`Failed to fetch notifications: ${notificationsResult.error.message}`);
  }

  res.json(
    ApiResponse.success('Data retrieved successfully', {
      notifications: notificationsResult.data,
      unreadCount: unreadResult.count || 0,
    })
  );
});
