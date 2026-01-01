const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const routesDir = path.join(rootDir, 'src', 'routes', 'v1');
const indexPath = path.join(routesDir, 'index.ts');
const outputPath = path.join(rootDir, 'swagger.generated.json');
const baseSpecPath = path.join(rootDir, 'swagger.base.json');

function getRouteBaseMappings(indexContent) {
  const importRegex = /import\s+(\w+)\s+from\s+'\.\/([\w.-]+)';/g;
  const imports = new Map();
  let match;
  while ((match = importRegex.exec(indexContent)) !== null) {
    const identifier = match[1];
    const fileName = match[2];
    imports.set(identifier, fileName);
  }

  const baseRegex = /router\.use\(\s*(['"])([^'"\n]+)\1\s*,\s*(\w+)\s*\)/g;
  const baseMappings = new Map();
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

function normalizeExpressPath(routePath) {
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

function toOpenApiPath(fullPath) {
  const normalized = normalizeExpressPath(fullPath);
  return normalized.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function extractPathParams(fullPath) {
  const params = [];
  const regex = /:([A-Za-z0-9_]+)/g;
  let match;
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

function joinPaths(basePath, relativePath) {
  const base = basePath === '/' ? '' : normalizeExpressPath(basePath);
  const relative = relativePath === '/' ? '' : normalizeExpressPath(relativePath);
  return normalizeExpressPath(`${base}${relative}` || '/');
}

function collectEndpoints(baseMappings) {
  const endpoints = [];
  for (const [fileName, basePath] of baseMappings.entries()) {
    const filePath = path.join(routesDir, `${fileName}.ts`);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');

    const routeRegex = /router\.(get|post|put|delete|patch)\(\s*(["'`])([^"'`]+)\2/gi;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1].toLowerCase();
      const relativePath = match[3];
      const fullPath = joinPaths(basePath, relativePath);
      endpoints.push({ method, fullPath, source: `${fileName}.ts` });
    }

    const chainRegex = /router\s*\.\s*route\(\s*(["'`])([^"'`]+)\1\)([\s\S]*?);/gi;
    while ((match = chainRegex.exec(content)) !== null) {
      const relativePath = match[2];
      const chainBody = match[3];
      const methodRegex = /\.(get|post|put|delete|patch)\s*\(/gi;
      let methodMatch;
      while ((methodMatch = methodRegex.exec(chainBody)) !== null) {
        const method = methodMatch[1].toLowerCase();
        const fullPath = joinPaths(basePath, relativePath);
        endpoints.push({ method, fullPath, source: `${fileName}.ts` });
      }
    }
  }
  return endpoints;
}

function tagFromPath(pathname) {
  const parts = normalizeExpressPath(pathname).split('/').filter(Boolean);
  if (!parts.length) return 'root';
  return parts[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildSwaggerSpec(endpoints) {
  const paths = {};

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

  const swaggerSpec = {
    openapi: '3.0.0',
    info: {
      title: 'University Portal API (Auto-generated)',
      version: '1.0.0',
      description: 'This spec is generated from Express routes to reflect currently implemented endpoints.',
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
    paths,
  };

  return swaggerSpec;
}

function loadBaseSpec() {
  if (!fs.existsSync(baseSpecPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(baseSpecPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function mergeComponents(generatedComponents, baseComponents) {
  const merged = { ...generatedComponents };
  if (!baseComponents) return merged;

  Object.entries(baseComponents).forEach(([section, value]) => {
    if (typeof value !== 'object' || Array.isArray(value)) {
      merged[section] = value;
      return;
    }
    merged[section] = {
      ...(generatedComponents?.[section] || {}),
      ...value,
    };
  });

  return merged;
}

function mergePaths(generatedPaths, basePaths) {
  const merged = { ...(basePaths || {}) };

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
  const deduped = new Map();

  endpoints.forEach((ep) => {
    const key = `${ep.method} ${ep.fullPath}`;
    if (!deduped.has(key)) {
      deduped.set(key, ep);
    }
  });

  const swaggerSpec = buildSwaggerSpec(Array.from(deduped.values()));
  const baseSpec = loadBaseSpec();

  const mergedSpec = {
    openapi: baseSpec?.openapi || swaggerSpec.openapi,
    info: baseSpec?.info || swaggerSpec.info,
    servers: baseSpec?.servers || swaggerSpec.servers,
    components: mergeComponents(swaggerSpec.components, baseSpec?.components),
    security: baseSpec?.security || swaggerSpec.security,
    paths: mergePaths(swaggerSpec.paths, baseSpec?.paths),
    tags: baseSpec?.tags || swaggerSpec.tags,
  };

  fs.writeFileSync(outputPath, JSON.stringify(mergedSpec, null, 2));
  console.log(`Generated Swagger spec with ${deduped.size} endpoints -> ${path.relative(rootDir, outputPath)}`);
}

main();
