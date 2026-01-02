import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '..');
const routesDir = path.join(rootDir, 'src', 'routes', 'v1');
const indexPath = path.join(routesDir, 'index.ts');
const outputPath = path.join(rootDir, 'swagger.generated.json');
const baseSpecPath = path.join(rootDir, 'swagger.base.json');

type BaseMappings = Map<string, string>;

type Endpoint = {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  fullPath: string;
  source: string;
};

type Components = {
  securitySchemes?: Record<string, unknown>;
  [key: string]: unknown;
};

type SwaggerSpec = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: Array<{ url: string; description?: string }>;
  components: Components;
  security: Array<Record<string, unknown>>;
  paths: Record<string, Record<string, unknown>>;
  tags?: Array<{ name: string; description?: string }>;
};

function getRouteBaseMappings(indexContent: string): BaseMappings {
  const importRegex = /import\s+(\w+)\s+from\s+'\.\/([\w.-]+)';/g;
  const imports = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(indexContent)) !== null) {
    const identifier = match[1];
    const fileName = match[2];
    imports.set(identifier, fileName);
  }

  const baseRegex = /router\.use\(\s*(['"])([^'"\n]+)\1\s*,\s*(\w+)\s*\)/g;
  const baseMappings = new Map<string, string>();
  while ((match = baseRegex.exec(indexContent)) !== null) {
    const basePath = match[2];
    const identifier = match[3];
    const fileName = imports.get(identifier);
    if (fileName) {
      baseMappings.set(fileName, basePath);
    }
  }

  return baseMappings;
}

function normalizeExpressPath(routePath: string): string {
  if (!routePath) {
    return '/';
  }
  let result = routePath.trim();
  if (!result.startsWith('/')) {
    result = `/${result}`;
  }
  result = result.replace(/\/{2,}/g, '/');
  if (result.length > 1 && result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

function toOpenApiPath(fullPath: string): string {
  const normalized = normalizeExpressPath(fullPath);
  return normalized.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function extractPathParams(fullPath: string): Array<{
  name: string;
  in: 'path';
  required: true;
  schema: { type: 'string' };
}> {
  const params: Array<{ name: string; in: 'path'; required: true; schema: { type: 'string' } }> = [];
  const regex = /:([A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fullPath)) !== null) {
    params.push({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  }
  return params;
}

function joinPaths(basePath: string, relativePath: string): string {
  const base = basePath === '/' ? '' : normalizeExpressPath(basePath);
  const relative = relativePath === '/' ? '' : normalizeExpressPath(relativePath);
  return normalizeExpressPath(`${base}${relative}` || '/');
}

function collectEndpoints(baseMappings: BaseMappings): Endpoint[] {
  const endpoints: Endpoint[] = [];
  for (const [fileName, basePath] of baseMappings.entries()) {
    const filePath = path.join(routesDir, `${fileName}.ts`);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');

    const routeRegex = /router\.(get|post|put|delete|patch)\(\s*(["'`])([^"'`]+)\2/gi;
    let match: RegExpExecArray | null;
    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1].toLowerCase() as Endpoint['method'];
      const relativePath = match[3];
      const fullPath = joinPaths(basePath, relativePath);
      endpoints.push({ method, fullPath, source: `${fileName}.ts` });
    }

    const chainRegex = /router\s*\.\s*route\(\s*(["'`])([^"'`]+)\1\)([\s\S]*?);/gi;
    while ((match = chainRegex.exec(content)) !== null) {
      const relativePath = match[2];
      const chainBody = match[3];
      const methodRegex = /\.(get|post|put|delete|patch)\s*\(/gi;
      let methodMatch: RegExpExecArray | null;
      while ((methodMatch = methodRegex.exec(chainBody)) !== null) {
        const method = methodMatch[1].toLowerCase() as Endpoint['method'];
        const fullPath = joinPaths(basePath, relativePath);
        endpoints.push({ method, fullPath, source: `${fileName}.ts` });
      }
    }
  }
  return endpoints;
}

function tagFromPath(pathname: string): string {
  const parts = normalizeExpressPath(pathname).split('/').filter(Boolean);
  if (!parts.length) return 'root';
  return parts[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildSwaggerSpec(endpoints: Endpoint[]): SwaggerSpec {
  const paths: Record<string, Record<string, unknown>> = {};

  endpoints.forEach(({ method, fullPath, source }) => {
    const openPath = toOpenApiPath(fullPath);
    const params = extractPathParams(fullPath);
    const tag = tagFromPath(fullPath);

    if (!paths[openPath]) {
      paths[openPath] = {};
    }

    paths[openPath][method] = {
      tags: [tag],
      summary: `Auto-generated for ${method.toUpperCase()} ${fullPath}`,
      operationId: `${method}-${fullPath.replace(/\W+/g, '-')}`.replace(/-+/g, '-'),
      parameters: params,
      responses: {
        200: {
          description: 'Success',
        },
      },
      'x-source': source,
    };
  });

  const swaggerSpec: SwaggerSpec = {
    openapi: '3.0.0',
    info: {
      title: 'University Portal API (Auto-generated)',
      version: '1.0.0',
      description: 'This spec is generated from Express routes to reflect currently implemented endpoints.',
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === 'production'
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
    paths,
  };

  return swaggerSpec;
}

function loadBaseSpec(): SwaggerSpec | null {
  if (!fs.existsSync(baseSpecPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(baseSpecPath, 'utf8');
    return JSON.parse(raw) as SwaggerSpec;
  } catch (_error) {
    return null;
  }
}

function mergeComponents(generatedComponents: Components, baseComponents?: Components | null): Components {
  const merged: Components = { ...generatedComponents };
  if (!baseComponents) return merged;

  Object.entries(baseComponents).forEach(([section, value]) => {
    if (typeof value !== 'object' || Array.isArray(value)) {
      (merged as Record<string, unknown>)[section] = value;
      return;
    }
    (merged as Record<string, unknown>)[section] = {
      ...((generatedComponents as Record<string, unknown>)?.[section] || {}),
      ...value,
    };
  });

  return merged;
}

function mergePaths(
  generatedPaths: Record<string, Record<string, unknown>>,
  basePaths?: Record<string, Record<string, unknown>> | null
): Record<string, Record<string, unknown>> {
  const merged: Record<string, Record<string, unknown>> = { ...(basePaths || {}) };

  Object.entries(generatedPaths).forEach(([pathKey, methods]) => {
    if (!merged[pathKey]) {
      merged[pathKey] = methods;
      return;
    }

    Object.entries(methods).forEach(([method, operation]) => {
      if (!merged[pathKey][method]) {
        merged[pathKey][method] = operation;
      }
    });
  });

  return merged;
}

function main() {
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const baseMappings = getRouteBaseMappings(indexContent);
  const endpoints = collectEndpoints(baseMappings);
  const deduped = new Map<string, Endpoint>();

  endpoints.forEach((ep) => {
    const key = `${ep.method} ${ep.fullPath}`;
    if (!deduped.has(key)) {
      deduped.set(key, ep);
    }
  });

  const swaggerSpec = buildSwaggerSpec(Array.from(deduped.values()));
  const baseSpec = loadBaseSpec();

  const mergedSpec: SwaggerSpec = {
    openapi: baseSpec?.openapi || swaggerSpec.openapi,
    info: baseSpec?.info || swaggerSpec.info,
    servers: baseSpec?.servers || swaggerSpec.servers,
    components: mergeComponents(swaggerSpec.components, baseSpec?.components as Components),
    security: (baseSpec?.security as Array<Record<string, unknown>>) || swaggerSpec.security,
    paths: mergePaths(swaggerSpec.paths, baseSpec?.paths as Record<string, Record<string, unknown>>),
    tags: baseSpec?.tags || swaggerSpec.tags,
  };

  fs.writeFileSync(outputPath, JSON.stringify(mergedSpec, null, 2));
  // eslint-disable-next-line no-console
  console.log(`Generated Swagger spec with ${deduped.size} endpoints -> ${path.relative(rootDir, outputPath)}`);
}

main();
