import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

interface Operation {
  method: string;
  pathTemplate: string;
  pattern: RegExp;
  params: number;
}

type Json = Record<string, unknown>;

/**
 * The UI's tests fake the Admin API. To keep that fake honest, every
 * response a fake sends and every request body the UI sends is checked
 * against the OpenAPI document the real API is held to (docs/admin-api.
 * openapi.yaml, which CI keeps in step with the routes).
 */
const specPath = path.resolve(
  import.meta.dirname,
  '../../../../docs/admin-api.openapi.yaml',
);
const spec = parse(readFileSync(specPath, 'utf8')) as {
  paths: Record<string, Record<string, Json>>;
  components: Json;
};

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(spec, 'spec');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const operations: Operation[] = Object.keys(spec.paths).flatMap((template) =>
  METHODS.filter((method) => spec.paths[template]?.[method]).map((method) => ({
    method: method.toUpperCase(),
    pathTemplate: template,
    pattern: new RegExp(
      `^${template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`,
    ),
    params: (template.match(/\{/g) ?? []).length,
  })),
);

/** The documented operation for a request, preferring literal path segments over parameters. */
function find(method: string, path: string): Operation | undefined {
  return operations
    .filter((op) => op.method === method && op.pattern.test(path))
    .sort((a, b) => a.params - b.params)[0];
}

const pointerEscape = (text: string) =>
  text.replace(/~/g, '~0').replace(/\//g, '~1');
const validators = new Map<string, ValidateFunction>();

function validator(pointer: string): ValidateFunction | undefined {
  let validate = validators.get(pointer);
  if (!validate) {
    try {
      validate = ajv.compile({ $ref: `spec#${pointer}` });
    } catch {
      return undefined;
    }
    validators.set(pointer, validate);
  }
  return validate;
}

function check(pointer: string, body: unknown, what: string): string[] {
  const validate = validator(pointer);
  if (!validate) {
    return [];
  }
  return validate(body)
    ? []
    : (validate.errors ?? []).map(
        (e) =>
          `${what}: ${e.instancePath || '(body)'} ${e.message ?? 'is invalid'}`,
      );
}

/** The JSON pointer of a response's JSON schema, following a `$ref` to a shared response. */
function responseSchemaPointer(
  op: Operation,
  status: number,
): string | undefined {
  const base = `/paths/${pointerEscape(op.pathTemplate)}/${op.method.toLowerCase()}/responses/${status}`;
  const response = spec.paths[op.pathTemplate]?.[op.method.toLowerCase()]?.[
    'responses'
  ] as Record<string, Json> | undefined;
  const entry = response?.[String(status)];
  if (!entry) {
    return undefined;
  }
  const target =
    typeof entry['$ref'] === 'string'
      ? (entry['$ref'] as string).replace(/^#/, '')
      : base;
  const resolved =
    typeof entry['$ref'] === 'string'
      ? ((spec.components['responses'] as Record<string, Json>)[
          target.split('/').pop() ?? ''
        ] ?? undefined)
      : entry;
  const content = resolved?.['content'] as Record<string, Json> | undefined;
  return content?.['application/json']
    ? `${target}/content/application~1json/schema`
    : undefined;
}

/**
 * Differences between a fake's answer and the document, as readable
 * messages; empty when they agree. Unknown routes and undocumented error
 * statuses are not judged, a documented success status with a body that
 * does not fit is.
 */
export function responseViolations(
  method: string,
  path: string,
  status: number,
  body: unknown,
): string[] {
  const op = find(method, path);
  if (!op) {
    return [];
  }
  const operation = spec.paths[op.pathTemplate]?.[method.toLowerCase()] as {
    responses: Record<string, unknown>;
  };
  const label = `${method} ${op.pathTemplate} -> ${status}`;
  if (!(String(status) in operation.responses)) {
    return status >= 200 && status < 300
      ? [`${label}: this status is not documented`]
      : [];
  }
  const pointer = responseSchemaPointer(op, status);
  return pointer && body !== undefined ? check(pointer, body, label) : [];
}

/** Differences between a request body the UI sent and the document. */
export function requestViolations(
  method: string,
  path: string,
  body: unknown,
): string[] {
  const op = find(method, path);
  if (!op) {
    return [];
  }
  const operation = spec.paths[op.pathTemplate]?.[method.toLowerCase()] as
    { requestBody?: { content?: Record<string, unknown> } } | undefined;
  if (!operation?.requestBody?.content?.['application/json']) {
    return [];
  }
  const pointer = `/paths/${pointerEscape(op.pathTemplate)}/${method.toLowerCase()}/requestBody/content/application~1json/schema`;
  return check(pointer, body ?? {}, `${method} ${op.pathTemplate} request`);
}

const found: string[] = [];

/** Remembers violations so the test run can fail on them. */
export function recordViolations(violations: string[]): void {
  found.push(...violations);
}

/** Returns and forgets what was recorded since the last call. */
export function takeViolations(): string[] {
  return found.splice(0);
}
