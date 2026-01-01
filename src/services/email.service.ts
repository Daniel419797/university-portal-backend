import { getEmailTransporter } from '../config/email';
import logger from '../config/logger';
import { EmailOptions } from '../types';

export class EmailService {
  private transporter = getEmailTransporter();

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

      await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${options.to}: ${options.subject}`);
      return true;
    } catch (error) {
      logger.error('Failed to send email:', error);
      return false;
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<boolean> {
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
    const html = `
      <h1>Email Verification</h1>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `;

    return this.sendEmail({
      to: email,
      subject: 'Verify your email - University Portal',
      html,
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    const html = `
      <h1>Password Reset Request</h1>
      <p>You requested to reset your password. Click the link below to proceed:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    return this.sendEmail({
      to: email,
      subject: 'Password Reset - University Portal',
      html,
    });
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
    const html = `
      <h1>Welcome to University Portal!</h1>
      <p>Hello ${firstName},</p>
      <p>Your account has been successfully created. You can now access the portal.</p>
      <p>Thank you for joining us!</p>
    `;

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
    const html = `
      <h1>Assignment Reminder</h1>
      <p>This is a reminder that your assignment "${assignmentTitle}" is due soon.</p>
      <p><strong>Due Date:</strong> ${dueDate.toLocaleString()}</p>
      <p>Please ensure you submit before the deadline.</p>
    `;

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
    const html = `
      <h1>Results Published</h1>
      <p>Your results for ${courseName} have been published.</p>
      <p>Login to the portal to view your results.</p>
    `;

    return this.sendEmail({
      to: email,
      subject: `Results Published - ${courseName}`,
      html,
    });
  }
}

const emailService = new EmailService();
export default emailService;
