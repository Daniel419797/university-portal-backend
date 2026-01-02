import { supabaseAdmin } from '../config/supabase';
import { NotificationType } from '../types';
import logger from '../config/logger';

export class NotificationService {
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    link?: string
  ): Promise<void> {
    try {
      const db = supabaseAdmin();
      await db.from('notifications').insert({
        user_id: userId,
        type,
        title,
        message,
        data: link ? { link } : null,
      });

      logger.info(`Notification created for user ${userId}: ${title}`);

      // TODO: Emit Socket.io event for real-time notification
    } catch (error) {
      logger.error('Failed to create notification:', error);
    }
  }

  async createBulkNotifications(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    link?: string
  ): Promise<void> {
    try {
      const db = supabaseAdmin();
      const notifications = userIds.map((userId) => ({
        user_id: userId,
        type,
        title,
        message,
        data: link ? { link } : null,
      }));

      await db.from('notifications').insert(notifications);

      logger.info(`Bulk notifications created for ${userIds.length} users`);

      // TODO: Emit Socket.io events for real-time notifications
    } catch (error) {
      logger.error('Failed to create bulk notifications:', error);
    }
  }

  async notifyAssignmentCreated(
    studentIds: string[],
    assignmentTitle: string,
    courseCode: string
  ): Promise<void> {
    await this.createBulkNotifications(
      studentIds,
      'info',
      'New Assignment',
      `A new assignment "${assignmentTitle}" has been posted for ${courseCode}`,
      `/assignments`
    );
  }

  async notifyResultPublished(
    studentId: string,
    courseName: string
  ): Promise<void> {
    await this.createNotification(
      studentId,
      'success',
      'Results Published',
      `Your results for ${courseName} have been published`,
      `/results`
    );
  }

  async notifyPaymentVerified(
    studentId: string,
    paymentType: string,
    amount: number
  ): Promise<void> {
    await this.createNotification(
      studentId,
      'success',
      'Payment Verified',
      `Your ${paymentType} payment of ₦${amount.toLocaleString()} has been verified`,
      `/payments`
    );
  }

  async notifyDeadlineApproaching(
    studentId: string,
    assignmentTitle: string,
    hoursLeft: number
  ): Promise<void> {
    await this.createNotification(
      studentId,
      'warning',
      'Deadline Approaching',
      `Assignment "${assignmentTitle}" is due in ${hoursLeft} hours`,
      `/assignments`
    );
  }
}

const notificationService = new NotificationService();
export default notificationService;
