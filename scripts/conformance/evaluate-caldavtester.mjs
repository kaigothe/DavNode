#!/usr/bin/env node
// Judges a CalDAVTester/CardDAVTester run (M11,
// milestones/M11-client-compatibility/06-conformance-suite-ci/
// 02-caldavtester-cardavtester-ci-integration.md).
//
// The suites were written against CalendarServer and assert many of its
// specifics, so DavNode does not pass all of them. Instead of "everything
// must pass" (never true) or "ignore the result" (useless), the gate is a
// baseline: the list of individual tests that pass today
// (caldavtester-baseline.txt). A baseline test that stops passing fails
// the run; every other test is a known gap (see docs/conformance.md) that is
// only counted, and a test that starts passing is reported so it can be
// added.
//
// Usage:
//   evaluate-caldavtester.mjs <logs-dir> <baseline.txt>
//   evaluate-caldavtester.mjs <logs-dir> <baseline.txt> --write-baseline
// <logs-dir> holds one runner log per test file (the default "log" observer
// output). Test ids are "<file>::<suite>::<test>", for example
// "CardDAV/get.xml::GET on resource::1".
import console from 'node:console';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Extracts every test result from one runner log.
 *
 * @returns {Array<{id: string, status: string}>} status is OK, FAILED,
 * IGNORED or ERROR; a file that failed to run at all yields one ERROR for
 * "<file>::<file>::<file>"-style id "<file>::*::*".
 */
export function parseLog(log) {
  const results = [];
  let file = null;
  let suite = null;
  for (const line of log.split(/\r?\n/)) {
    const fileMatch =
      /^scripts\.tests\.([^\s/]+?)\s*(\[(OK|ERROR|FAILED|IGNORED)\])?\s*$/.exec(
        line,
      );
    if (fileMatch) {
      const name = fileMatch[1];
      const slash = name.indexOf('.');
      file = `${name.slice(0, slash)}/${name.slice(slash + 1)}.xml`;
      suite = null;
      if (fileMatch[3] === 'ERROR')
        results.push({ id: `${file}::*::*`, status: 'ERROR' });
      continue;
    }
    const suiteMatch = /^ {2}Suite: (.*?)\s*(\[(IGNORED)\])?\s*$/.exec(line);
    if (suiteMatch && file) {
      suite = suiteMatch[1];
      continue;
    }
    const testMatch =
      /^ {4}Test: (.*?)\s+\[(OK|FAILED|IGNORED|ERROR)\]\s*$/.exec(line);
    if (testMatch && file && suite !== null) {
      results.push({
        id: `${file}::${suite}::${testMatch[1]}`,
        status: testMatch[2],
      });
    }
  }
  return results;
}

export function readBaseline(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);
}

/**
 * @param {Array<{id: string, status: string}>} results
 * @param {string[]} baseline  ids that must pass
 */
export function evaluate(results, baseline) {
  const status = new Map(results.map((result) => [result.id, result.status]));
  const regressions = baseline
    .filter((id) => status.get(id) !== 'OK')
    .map((id) => ({ id, status: status.get(id) ?? 'not run' }));
  const known = new Set(baseline);
  const passing = results.filter((result) => result.status === 'OK');
  return {
    regressions,
    newlyPassing: passing
      .filter((result) => !known.has(result.id))
      .map((r) => r.id),
    passing: passing.length,
    gaps: results.filter((r) => r.status === 'FAILED' || r.status === 'ERROR')
      .length,
    ignored: results.filter((r) => r.status === 'IGNORED').length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [logsDir, baselinePath, flag] = process.argv.slice(2);
  if (!logsDir || !baselinePath) {
    console.error(
      'usage: evaluate-caldavtester.mjs <logs-dir> <baseline.txt> [--write-baseline]',
    );
    process.exit(2);
  }
  const results = readdirSync(logsDir)
    .filter((name) => name.endsWith('.log'))
    .flatMap((name) =>
      parseLog(readFileSync(path.join(logsDir, name), 'utf8')),
    );

  if (flag === '--write-baseline') {
    const ids = results
      .filter((r) => r.status === 'OK')
      .map((r) => r.id)
      .sort();
    writeFileSync(
      baselinePath,
      `# Tests of Apple's CalDAVTester/CardDAVTester that pass against DavNode.\n` +
        `# A test listed here must keep passing (the CI gate); regenerate with\n` +
        `#   CALDAVTESTER_SURVEY=1 scripts/conformance/run-caldavtester.sh\n` +
        `#   node scripts/conformance/evaluate-caldavtester.mjs .conformance/caldavtester-logs ${path.basename(baselinePath)} --write-baseline\n` +
        `# after improving DavNode. Format: <file>::<suite>::<test>.\n` +
        ids.join('\n') +
        '\n',
    );
    console.log(`wrote ${ids.length} tests to ${baselinePath}`);
    process.exit(0);
  }

  const baseline = readBaseline(baselinePath);
  const outcome = evaluate(results, baseline);
  console.log(
    `caldavtester: ${outcome.passing} tests pass (${baseline.length} in the baseline), ${outcome.gaps} known gaps, ${outcome.ignored} ignored (feature not offered).`,
  );
  if (outcome.newlyPassing.length > 0) {
    console.log(
      `  notice: ${outcome.newlyPassing.length} tests pass that are not in the baseline yet; regenerate it with --write-baseline.`,
    );
    for (const id of outcome.newlyPassing.slice(0, 20)) {
      console.log(`    ${id}`);
    }
  }
  for (const regression of outcome.regressions) {
    console.error(`  REGRESSION (${regression.status}): ${regression.id}`);
  }
  process.exit(outcome.regressions.length > 0 || results.length === 0 ? 1 : 0);
}
