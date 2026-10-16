#!/usr/bin/env node
// Evaluates a litmus log differentially (M11,
// milestones/M11-client-compatibility/06-conformance-suite-ci/01-litmus-ci-integration.md):
// neither "everything must pass" nor "ignore the result".
//
//   - a test that FAILED (or was SKIPPED, which means an earlier one failed)
//     and is not listed in the expected-failures file fails the run;
//   - a listed test that now passes is reported, so the list shrinks;
//   - a run that did not execute the five suites with a plausible number of
//     tests (server down, litmus crashed) fails too.
//
// Usage: evaluate-litmus.mjs <litmus.log> [expected-failures.txt]
// Expected-failures lines: "<suite>/<test>   # reason"; "#" starts a comment.
import console from 'node:console';
import { readFileSync, existsSync } from 'node:fs';
import process from 'node:process';

const SUITES = ['basic', 'copymove', 'props', 'locks', 'http'];
const MIN_TESTS = 100;

/**
 * @param {string} log     the litmus output
 * @param {Set<string>} expected  "<suite>/<test>" names allowed to fail
 */
export function evaluate(log, expected) {
  const seenSuites = new Set();
  const failures = [];
  const warnings = [];
  const passed = new Set();
  let suite = null;
  let total = 0;

  for (const line of log.split(/\r?\n/)) {
    const running = /^-> running `(\w+)':/.exec(line);
    if (running) {
      suite = running[1];
      continue;
    }
    const summary = /^<- summary for `(\w+)': of (\d+) tests? run/.exec(line);
    if (summary) {
      seenSuites.add(summary[1]);
      total += Number(summary[2]);
      continue;
    }
    // litmus prints each result line twice on one line ("name.... name.... pass").
    const results = [
      ...line.matchAll(/(\d+)\.\s+(\w+)\.+\s+(pass|FAIL|SKIPPED|WARNING)/g),
    ];
    const last = results[results.length - 1];
    if (!last || !suite) continue;
    const name = `${suite}/${last[2]}`;
    if (last[3] === 'pass') passed.add(name);
    else if (last[3] === 'WARNING') warnings.push(name);
    else failures.push({ name, status: last[3], detail: line.trim() });
  }

  const problems = [];
  for (const wanted of SUITES) {
    if (!seenSuites.has(wanted))
      problems.push(`suite "${wanted}" produced no summary`);
  }
  if (total < MIN_TESTS) {
    problems.push(`only ${total} tests ran (expected at least ${MIN_TESTS})`);
  }
  const unexpected = failures.filter((failure) => !expected.has(failure.name));
  const fixed = [...expected].filter((name) => passed.has(name));
  return { problems, unexpected, fixed, warnings, total, failures };
}

export function readExpected(path) {
  if (!path || !existsSync(path)) return new Set();
  return new Set(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, '').trim())
      .filter(Boolean),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [logPath, expectedPath] = process.argv.slice(2);
  if (!logPath) {
    console.error(
      'usage: evaluate-litmus.mjs <litmus.log> [expected-failures.txt]',
    );
    process.exit(2);
  }
  const result = evaluate(
    readFileSync(logPath, 'utf8'),
    readExpected(expectedPath),
  );
  console.log(
    `litmus: ${result.total} tests, ${result.failures.length} failed, ${result.warnings.length} warnings.`,
  );
  for (const name of result.warnings) console.log(`  warning: ${name}`);
  for (const name of result.fixed)
    console.log(
      `  notice: ${name} is listed as an expected failure but now passes — remove it from the list.`,
    );
  for (const problem of result.problems) console.error(`  PROBLEM: ${problem}`);
  for (const failure of result.unexpected)
    console.error(
      `  UNEXPECTED ${failure.status}: ${failure.name}\n    ${failure.detail}`,
    );
  process.exit(result.problems.length || result.unexpected.length ? 1 : 0);
}
