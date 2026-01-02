import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '..');
const apiDocPath = path.join(rootDir, 'API_DOCUMENTATION.md');
const routesDir = path.join(rootDir, 'src', 'routes', 'v1');
const indexPath = path.join(routesDir, 'index.ts');

function normalizePath(routePath: string): string {
  if (!routePath) {
    return '/';
  }
  let result = routePath.trim();
  if (!result.startsWith('/')) {
    result = `/${result}`;
  }
  result = result.replace(/\/{2,}/g, '/');
  result = result.replace(/:([A-Za-z0-9_]+)/g, ':param');
  if (result.length > 1 && result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

function joinPaths(basePath: string, relativePath: string): string {
  const base = basePath === '/' ? '' : normalizePath(basePath);
  const relative = relativePath === '/' ? '' : normalizePath(relativePath);
  const combined = `${base}${relative}`;
  return combined ? normalizePath(combined) : '/';
}

function extractDocumentedEndpoints(docContent: string): Set<string> {
  const documented = new Set<string>();
  const regex = /####\s+(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(docContent)) !== null) {
    const method = match[1].toUpperCase();
    const endpoint = normalizePath(match[2]);
    documented.add(`${method} ${endpoint}`);
  }
  return documented;
}

function getRouteBaseMappings(indexContent: string): Map<string, string> {
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

function extractImplementedEndpoints(baseMappings: Map<string, string>): Set<string> {
  const implemented = new Set<string>();
  for (const [fileName, basePath] of baseMappings.entries()) {
    const filePath = path.join(routesDir, `${fileName}.ts`);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const routeRegex = /router\.(get|post|put|delete|patch)\(\s*(["'`])([^"'`]+)\2/gi;
    let match: RegExpExecArray | null;
    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const relativePath = match[3];
      const fullPath = joinPaths(basePath, relativePath);
      implemented.add(`${method} ${fullPath}`);
    }

    const chainRegex = /router\s*\.\s*route\(\s*(["'`])([^"'`]+)\1\)([\s\S]*?);/gi;
    while ((match = chainRegex.exec(content)) !== null) {
      const relativePath = match[2];
      const chainBody = match[3];
      const methodRegex = /\.(get|post|put|delete|patch)\s*\(/gi;
      let methodMatch: RegExpExecArray | null;
      while ((methodMatch = methodRegex.exec(chainBody)) !== null) {
        const method = methodMatch[1].toUpperCase();
        const fullPath = joinPaths(basePath, relativePath);
        implemented.add(`${method} ${fullPath}`);
      }
    }
  }
  return implemented;
}

function main() {
  const apiDocContent = fs.readFileSync(apiDocPath, 'utf8');
  const documented = extractDocumentedEndpoints(apiDocContent);
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const baseMappings = getRouteBaseMappings(indexContent);
  const implemented = extractImplementedEndpoints(baseMappings);

  const missing: string[] = [];
  for (const endpoint of documented) {
    if (!implemented.has(endpoint)) {
      missing.push(endpoint);
    }
  }

  missing.sort();

  // eslint-disable-next-line no-console
  console.log('Documented endpoints:', documented.size);
  // eslint-disable-next-line no-console
  console.log('Implemented endpoints:', implemented.size);
  // eslint-disable-next-line no-console
  console.log('Missing endpoints:', missing.length);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.log('\nMissing list:');
    for (const ep of missing) {
      // eslint-disable-next-line no-console
      console.log(`- ${ep}`);
    }
  }
}

main();
