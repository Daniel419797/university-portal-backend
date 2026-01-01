import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { generalLimiter } from './middleware/rateLimit.middleware';
import { setupSwagger } from './config/swagger';
import logger from './config/logger';

const app: Express = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(mongoSanitize());
app.use(hpp());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// Rate limiting
app.use('/api', generalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// API version info
app.get('/api/v1', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'University Portal API v1',
    version: '1.0.0',
    documentation: '/docs',
  });
});

// Swagger documentation
setupSwagger(app);

// API routes - will be added
// app.use('/api/v1/auth', authRoutes);
// app.use('/api/v1/users', userRoutes);
// etc.

logger.info('Express app configured successfully');

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
