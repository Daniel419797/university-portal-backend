import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import connectDatabase from './config/database';
import connectRedis from './config/redis';
import initializeCloudinary from './config/cloudinary';
import initializeEmail from './config/email';
import logger from './config/logger';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Initialize Redis (optional)
    connectRedis();

    // Initialize Cloudinary
    initializeCloudinary();

    // Initialize Email
    initializeEmail();

    // Start Express server
    const server = app.listen(PORT, () => {
      logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`API documentation: http://localhost:${PORT}/docs`);
    });

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Shutting down gracefully...');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err: Error) => {
      logger.error('Unhandled Promise Rejection:', err);
      gracefulShutdown();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err: Error) => {
      logger.error('Uncaught Exception:', err);
      gracefulShutdown();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
