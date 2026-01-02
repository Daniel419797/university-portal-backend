import fs from 'fs';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

function normalizeBaseUrl(url: string): string {
  // Swagger joins paths onto `servers[0].url`; a trailing slash causes `//path`.
  return url.trim().replace(/\/+$/, '');
}

function computeServerUrl(): string {
  const explicit = process.env.SWAGGER_SERVER_URL;
  if (explicit) return normalizeBaseUrl(explicit);

  // Common PaaS env vars (best-effort fallbacks)
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return normalizeBaseUrl(`https://${railwayDomain}`);

  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderExternalUrl) return normalizeBaseUrl(renderExternalUrl);

  const appUrl = process.env.APP_URL;
  if (appUrl) return normalizeBaseUrl(appUrl);

  // Local/dev fallback
  return `http://localhost:${process.env.PORT || 5000}`;
}

const serverUrl = computeServerUrl();

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
        url: serverUrl,
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
  apis: ['./src/routes/**/*.ts'],
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

// Ensure the server URL override applies even when loading swagger.generated.json
if (serverUrl) {
  (resolvedSpec as { servers?: Array<{ url: string; description?: string }> }).servers = [
    {
      url: serverUrl,
      description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
    },
  ];
}

export const setupSwagger = (app: Express): void => {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(resolvedSpec));
  app.get('/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(resolvedSpec);
  });
};

export default resolvedSpec;
