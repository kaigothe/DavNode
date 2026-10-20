import type { DataSource } from '@davnode/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { createAdminRouter } from './router.js';

const specPath = fileURLToPath(
  new URL('../../../docs/admin-api.openapi.yaml', import.meta.url),
);
const spec = parse(readFileSync(specPath, 'utf8')) as {
  paths: Record<string, Record<string, { operationId?: string }>>;
};

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** `METHOD /path/{param}` for every route the router registers. */
function registeredRoutes(): string[] {
  const router = createAdminRouter({} as DataSource, {
    metrics: { contentType: 'text/plain', render: async () => '' },
    contentView: true,
  });
  const out: string[] = [];
  for (const layer of (router as unknown as { stack: Layer[] }).stack) {
    if (!layer.route) {
      continue;
    }
    const path = layer.route.path.replace(/:(\w+)/g, '{$1}');
    for (const method of Object.keys(layer.route.methods)) {
      out.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return out.sort();
}

/** Every operation of the OpenAPI document, in the same notation. */
function documentedRoutes(): string[] {
  const out: string[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (item[method]) {
        out.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return out.sort();
}

describe('docs/admin-api.openapi.yaml', () => {
  it('documents exactly the routes the admin router registers', () => {
    expect(documentedRoutes()).toEqual(registeredRoutes());
  });

  it('gives every operation a unique operationId', () => {
    const ids = Object.values(spec.paths).flatMap((item) =>
      Object.values(item)
        .map((operation) => operation.operationId)
        .filter(Boolean),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
