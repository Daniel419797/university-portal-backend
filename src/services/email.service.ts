import { getEmailTransporter } from '../config/email';
import logger from '../config/logger';
import { EmailOptions } from '../types';

export class EmailService {
  private transporter = getEmailTransporter();

  isConfigured(): boolean {
    return Boolean(this.transporter);
  }

  private buildTemplate(title: string, content: string): string {
    return `
      <div style="font-family: Arial, sans-serif; background: #f5f7fb; padding: 24px;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827; margin-top: 0;">${title}</h2>
          <div style="color: #4b5563; line-height: 1.6;">${content}</div>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">If you did not request this action, you can safely ignore this email.</p>
        </div>
      </div>
    `;
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      logger.warn('Email transporter not configured. Email not sent.');
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'University Portal <noreply@university.edu>',
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${options.to}: ${options.subject} (messageId=${info.messageId}, response=${info.response || 'n/a'})`);
      return true;
    } catch (error) {
      logger.error('Failed to send email:', error);
      return false;
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<boolean> {
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
    const html = this.buildTemplate(
      'Email Verification',
      `
        <p>Please verify your email address by clicking the button below:</p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${verificationUrl}" style="background:#2563eb; color:#ffffff; padding:12px 20px; border-radius:6px; text-decoration:none; display:inline-block;">Verify Email</a>
        </p>
        <p style="word-break: break-all;">If the button does not work, copy and paste this link into your browser:<br>${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
      `
    );

    return this.sendEmail({
      to: email,
      subject: 'Verify your email - University Portal',
      html,
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    const html = this.buildTemplate(
      'Password Reset Request',
      `
        <p>You requested to reset your password. Click the button below to proceed:</p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${resetUrl}" style="background:#2563eb; color:#ffffff; padding:12px 20px; border-radius:6px; text-decoration:none; display:inline-block;">Reset Password</a>
        </p>
        <p style="word-break: break-all;">If the button does not work, copy and paste this link into your browser:<br>${resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
      `
    );

    return this.sendEmail({
      to: email,
      subject: 'Password Reset - University Portal',
      html,
    });
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
    const html = this.buildTemplate(
      'Welcome to University Portal',
      `
        <p>Hello ${firstName},</p>
        <p>Your account has been successfully created. You can now access the portal.</p>
        <p>Thank you for joining us!</p>
      `
    );

    return this.sendEmail({
      to: email,
      subject: 'Welcome to University Portal',
      html,
    });
  }

  async sendAssignmentReminderEmail(
    email: string,
    assignmentTitle: string,
    dueDate: Date
  ): Promise<boolean> {
    const html = this.buildTemplate(
      'Assignment Reminder',
      `
        <p>This is a reminder that your assignment "${assignmentTitle}" is due soon.</p>
        <p><strong>Due Date:</strong> ${dueDate.toLocaleString()}</p>
        <p>Please ensure you submit before the deadline.</p>
      `
    );

    return this.sendEmail({
      to: email,
      subject: `Assignment Reminder: ${assignmentTitle}`,
      html,
    });
  }

  async sendResultPublishedEmail(
    email: string,
    courseName: string
  ): Promise<boolean> {
    const html = this.buildTemplate(
      'Results Published',
      `
        <p>Your results for ${courseName} have been published.</p>
        <p>Login to the portal to view your results.</p>
      `
    );

    return this.sendEmail({
      to: email,
      subject: `Results Published - ${courseName}`,
      html,
    });
  }
}

const emailService = new EmailService();
export default emailService;
