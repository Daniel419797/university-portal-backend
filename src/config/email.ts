import nodemailer, { Transporter } from 'nodemailer';
import logger from './logger';

let transporter: Transporter | null = null;

const initializeEmail = (): void => {
  const emailHost = process.env.EMAIL_HOST;
  const emailPort = parseInt(process.env.EMAIL_PORT || '587');
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;

  if (!emailHost || !emailUser || !emailPassword) {
    const missing = [
      !emailHost ? 'EMAIL_HOST' : null,
      !process.env.EMAIL_PORT ? 'EMAIL_PORT' : null,
      !emailUser ? 'EMAIL_USER' : null,
      !emailPassword ? 'EMAIL_PASSWORD' : null,
    ].filter(Boolean);
    logger.warn(`Email credentials not configured, email sending will be disabled (missing: ${missing.join(', ')})`);
    return;
  }

  const secure = emailPort === 465;
  logger.info(`Initializing email transporter host=${emailHost} port=${emailPort} secure=${secure}`);

  transporter = nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure,
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
    // Help make STARTTLS more deterministic on some hosts when using port 587
    ...(secure ? {} : { requireTLS: true }),
    tls: {
      servername: emailHost,
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
  });

  transporter.verify((error) => {
    if (error) {
      // Keep transporter instance so /health/email can surface the real verify error.
      logger.error('Email configuration error (verify failed):', error);
    } else {
      logger.info('Email transporter initialized successfully');
    }
  });
};

export const getEmailTransporter = (): Transporter | null => {
  return transporter;
};

export default initializeEmail;
