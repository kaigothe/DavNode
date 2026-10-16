import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/conformance/evaluate-caldavtester.mjs',
);

/** One runner log in the format of the default "log" observer. */
function log(
  name: string,
  suites: Record<string, Record<string, string>>,
  fileStatus = '',
): string {
  const lines = [`scripts.tests.${name}${fileStatus ? `  ${fileStatus}` : ''}`];
  for (const [suite, tests] of Object.entries(suites)) {
    lines.push(`  Suite: ${suite}`);
    for (const [test, status] of Object.entries(tests)) {
      lines.push(`    Test: ${test}${' '.repeat(40)}[${status}]`);
    }
  }
  return lines.join('\n');
}

function run(
  logs: Record<string, string>,
  baseline: string,
  extra: string[] = [],
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cdt-eval-'));
  const logsDir = path.join(dir, 'logs');
  mkdirSync(logsDir);
  for (const [file, content] of Object.entries(logs)) {
    writeFileSync(path.join(logsDir, `${file}.log`), content);
  }
  const baselinePath = path.join(dir, 'baseline.txt');
  writeFileSync(baselinePath, baseline);
  const result = spawnSync(
    process.execPath,
    [SCRIPT, logsDir, baselinePath, ...extra],
    {
      encoding: 'utf8',
    },
  );
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    baselinePath,
  };
}

const getLog = log('CardDAV.get', {
  'GET on resource': { '1': 'OK', '2': 'FAILED', '3': 'IGNORED' },
  'GET on home': { '1': 'OK' },
});

describe('evaluate-caldavtester.mjs', () => {
  it('passes when every baseline test still passes, whatever else fails', () => {
    const result = run(
      { a: getLog },
      'CardDAV/get.xml::GET on resource::1\nCardDAV/get.xml::GET on home::1\n',
    );

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      '2 tests pass (2 in the baseline), 1 known gaps, 1 ignored',
    );
  });

  it('fails when a baseline test regresses, naming it and its new state', () => {
    const result = run({ a: getLog }, 'CardDAV/get.xml::GET on resource::2\n');

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      'REGRESSION (FAILED): CardDAV/get.xml::GET on resource::2',
    );
  });

  it('fails for a baseline test that is not in any log, e.g. a file that was not run', () => {
    const result = run({ a: getLog }, 'CalDAV/put.xml::PUT VEVENT::1\n');

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      'REGRESSION (not run): CalDAV/put.xml::PUT VEVENT::1',
    );
  });

  it('counts a file that failed to run at all as a failure of its baseline tests', () => {
    const broken = log('CalDAV.ctag', {}, '[ERROR]');

    const result = run({ a: broken }, 'CalDAV/ctag.xml::Basic::1\n');

    expect(result.status).toBe(1);
  });

  it('reports tests that pass without being in the baseline, without failing', () => {
    const result = run({ a: getLog }, '# nothing yet\n');

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      '2 tests pass that are not in the baseline yet',
    );
    expect(result.output).toContain('CardDAV/get.xml::GET on resource::1');
  });

  it('fails when there are no logs at all (the runner never ran)', () => {
    expect(run({}, 'CardDAV/get.xml::GET on resource::1\n').status).toBe(1);
  });

  it('writes a baseline of exactly the passing tests with --write-baseline', () => {
    const result = run({ a: getLog }, '', ['--write-baseline']);

    expect(result.status).toBe(0);
    const written = readFileSync(result.baselinePath, 'utf8');
    expect(written).toContain('CardDAV/get.xml::GET on home::1');
    expect(written).toContain('CardDAV/get.xml::GET on resource::1');
    expect(written).not.toContain('::2');
    expect(written).not.toContain('::3');
  });

  it('keeps a baseline it wrote usable for the next run', () => {
    const first = run({ a: getLog }, '', ['--write-baseline']);
    const baseline = readFileSync(first.baselinePath, 'utf8');

    expect(run({ a: getLog }, baseline).status).toBe(0);
  });
});
