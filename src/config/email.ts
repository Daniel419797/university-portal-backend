import nodemailer, { Transporter } from 'nodemailer';
import logger from './logger';

let transporter: Transporter | null = null;

const initializeEmail = (): void => {
  const emailHost = process.env.EMAIL_HOST;
  const emailPort = parseInt(process.env.EMAIL_PORT || '587');
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;

  if (!emailHost || !emailUser || !emailPassword) {
    logger.warn('Email credentials not configured, email sending will be disabled');
    return;
  }

  transporter = nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
  });

  transporter.verify((error) => {
    if (error) {
      logger.error('Email configuration error:', error);
      transporter = null;
    } else {
      logger.info('Email transporter initialized successfully');
    }
  });
};

export const getEmailTransporter = (): Transporter | null => {
  return transporter;
};

export default initializeEmail;
