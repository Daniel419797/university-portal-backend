import fs from 'fs';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'University Portal API',
      version: '1.0.0',
      description: 'Production-ready backend API for University Portal system',
      contact: {
        name: 'API Support',
        email: 'support@university.edu',
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.university.edu' 
          : `http://localhost:${process.env.PORT || 5000}`,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/**/*.ts', './src/models/**/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

function loadGeneratedSpec() {
  const generatedPath = path.join(process.cwd(), 'swagger.generated.json');
  if (!fs.existsSync(generatedPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(generatedPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    // Fall back to jsdoc spec if generated file is not valid JSON
    return null;
  }
}

const resolvedSpec = loadGeneratedSpec() || swaggerSpec;

export const setupSwagger = (app: Express): void => {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(resolvedSpec));
  app.get('/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(resolvedSpec);
  });
};

export default resolvedSpec;
