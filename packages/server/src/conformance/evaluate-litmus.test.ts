import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/conformance/evaluate-litmus.mjs',
);

/** One litmus suite block in the format litmus prints (each result line twice, names and dots). */
function suite(name: string, tests: Record<string, string>): string {
  const entries = Object.entries(tests);
  const lines = entries.map(
    ([test, status], index) =>
      ` ${index}. ${test}....  ${index}. ${test}.... ${status}`,
  );
  const passed = entries.filter(([, status]) => status === 'pass').length;
  return [
    `-> running \`${name}':`,
    ...lines,
    `<- summary for \`${name}': of ${entries.length} tests run: ${passed} passed, ${entries.length - passed} failed. ${((passed / entries.length) * 100).toFixed(1)}%`,
  ].join('\n');
}

const passing = (count: number, prefix = 't') =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`${prefix}${i}`, 'pass']),
  );

/** A whole healthy litmus run, optionally with overridden results in a suite. */
function litmusLog(overrides: Record<string, Record<string, string>> = {}) {
  return ['basic', 'copymove', 'props', 'locks', 'http']
    .map((name) => suite(name, { ...passing(25), ...overrides[name] }))
    .join('\n');
}

function evaluate(log: string, expected = '') {
  const dir = mkdtempSync(path.join(tmpdir(), 'litmus-eval-'));
  writeFileSync(path.join(dir, 'litmus.log'), log);
  writeFileSync(path.join(dir, 'expected.txt'), expected);
  const result = spawnSync(
    process.execPath,
    [SCRIPT, path.join(dir, 'litmus.log'), path.join(dir, 'expected.txt')],
    { encoding: 'utf8' },
  );
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
}

describe('evaluate-litmus.mjs', () => {
  it('passes a run in which everything passes, warnings included', () => {
    const result = evaluate(
      litmusLog({ basic: { t3: 'WARNING: DELETE removed it' } }),
    );

    expect(result.status).toBe(0);
    expect(result.output).toContain('1 warnings');
  });

  it('fails when a test regresses, naming it', () => {
    const result = evaluate(
      litmusLog({ props: { t7: 'FAIL (PROPFIND got 500)' } }),
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain('UNEXPECTED FAIL: props/t7');
  });

  it('counts a SKIPPED test as a failure, since an earlier one must have failed', () => {
    const result = evaluate(litmusLog({ locks: { t2: 'SKIPPED' } }));

    expect(result.status).toBe(1);
    expect(result.output).toContain('locks/t2');
  });

  it('tolerates a failure listed as expected, and still catches any other', () => {
    const expected = '# ordered collections\nlocks/t2   # not implemented\n';

    expect(
      evaluate(litmusLog({ locks: { t2: 'FAIL (x)' } }), expected).status,
    ).toBe(0);
    expect(
      evaluate(
        litmusLog({ locks: { t2: 'FAIL (x)', t5: 'FAIL (y)' } }),
        expected,
      ).status,
    ).toBe(1);
  });

  it('points out an expected failure that now passes, without failing', () => {
    const result = evaluate(litmusLog(), 'locks/t2\n');

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      'locks/t2 is listed as an expected failure but now passes',
    );
  });

  it('fails when litmus did not really run (server down, crash)', () => {
    expect(evaluate('').status).toBe(1);
    const partial = suite('basic', passing(16));
    const result = evaluate(partial);
    expect(result.status).toBe(1);
    expect(result.output).toContain('produced no summary');
  });

  it('fails when too few tests ran even if all suites reported', () => {
    const tiny = ['basic', 'copymove', 'props', 'locks', 'http']
      .map((name) => suite(name, passing(2)))
      .join('\n');

    const result = evaluate(tiny);

    expect(result.status).toBe(1);
    expect(result.output).toContain('only 10 tests ran');
  });

  it('understands the real litmus output captured from DavNode', () => {
    const real = [
      "-> running `locks':",
      ' 0. init.................. pass',
      '20. fail_complex_cond_put. 20. fail_complex_cond_put. FAIL (PUT with complex bogus conditional should fail with 412: 204 No Content)',
      '    ...................... 23. lock_shared........... pass',
      "<- summary for `locks': of 2 tests run: 1 passed, 1 failed. 50.0%",
    ].join('\n');

    const result = evaluate(real);

    expect(result.output).toContain(
      'UNEXPECTED FAIL: locks/fail_complex_cond_put',
    );
  });
});
