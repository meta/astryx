#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * CLI JSON smoke test — validates --json output for every supported command.
 *
 * Auto-discovers components and doc topics (same as cli-smoke-test.mjs)
 * then runs every command with --json and validates:
 * 1. Output is valid JSON
 * 2. Success responses have `apiVersion` (=== 1), `type` (string) and `data`
 * 3. Error responses have `apiVersion` (=== 1) and `error` (string) field
 * 4. `type` values follow the dot-separated naming pattern
 * 5. Envelope shape is consistent across all commands (allowed success keys:
 *    apiVersion, type, data, and optional sidecar meta)
 *
 * No hardcoded type allowlist — validates shape, not specific strings.
 * The .d.ts type declarations are the source of truth for valid types.
 *
 * Usage: node .github/scripts/cli-json-smoke-test.mjs
 */

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'packages/cli/clients/cli/bin/astryx.mjs');

let passed = 0;
let failed = 0;
const failures = [];
const seenTypes = new Set();

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

function runJson(args) {
  return run(['--json', ...args]);
}

function checkJson(label, args, {expectError = false, expectType = null} = {}) {
  const {stdout, status} = runJson(args);

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    console.log(`  FAIL  ${label}  (invalid JSON)`);
    if (stdout.trim()) console.log(`        ${stdout.trim().split('\n')[0].slice(0, 80)}`);
    failures.push({label, reason: 'invalid JSON'});
    failed++;
    return;
  }

  if (expectError) {
    if (!parsed.error) {
      console.log(`  FAIL  ${label}  (expected error, got type="${parsed.type}")`);
      failures.push({label, reason: 'expected error response'});
      failed++;
      return;
    }
    if (typeof parsed.error !== 'string') {
      console.log(`  FAIL  ${label}  (error field is not a string)`);
      failures.push({label, reason: 'error field not a string'});
      failed++;
      return;
    }
    if (parsed.apiVersion !== 1) {
      console.log(`  FAIL  ${label}  (error envelope missing apiVersion === 1, got ${parsed.apiVersion})`);
      failures.push({label, reason: `error envelope apiVersion !== 1 (${parsed.apiVersion})`});
      failed++;
      return;
    }
    console.log(`  ok    ${label}  (error: "${parsed.error.slice(0, 60)}")`);
    passed++;
    return;
  }

  // Error responses
  if (parsed.error) {
    if (typeof parsed.error !== 'string') {
      console.log(`  FAIL  ${label}  (error field is not a string)`);
      failures.push({label, reason: 'error field not a string'});
      failed++;
      return;
    }
    if (parsed.apiVersion !== 1) {
      console.log(`  FAIL  ${label}  (error envelope missing apiVersion === 1, got ${parsed.apiVersion})`);
      failures.push({label, reason: `error envelope apiVersion !== 1 (${parsed.apiVersion})`});
      failed++;
      return;
    }
    if (status !== 1) {
      console.log(`  FAIL  ${label}  (error without exit code 1)`);
      failures.push({label, reason: 'error without exit code 1'});
      failed++;
      return;
    }
    console.log(`  ok    ${label}  (error: "${parsed.error.slice(0, 60)}")`);
    passed++;
    return;
  }

  // Success responses must have apiVersion + type + data
  if (parsed.apiVersion !== 1) {
    console.log(`  FAIL  ${label}  (missing apiVersion === 1, got ${parsed.apiVersion})`);
    failures.push({label, reason: `apiVersion !== 1 (${parsed.apiVersion})`});
    failed++;
    return;
  }

  if (typeof parsed.type !== 'string') {
    console.log(`  FAIL  ${label}  (missing or non-string type field)`);
    failures.push({label, reason: 'missing type field'});
    failed++;
    return;
  }

  if (!('data' in parsed)) {
    console.log(`  FAIL  ${label}  (missing data field)`);
    failures.push({label, reason: 'missing data field'});
    failed++;
    return;
  }

  // Type discriminators must follow the dot-separated pattern
  if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/.test(parsed.type)) {
    console.log(`  FAIL  ${label}  (type "${parsed.type}" doesn't match naming pattern)`);
    failures.push({label, reason: `invalid type format "${parsed.type}"`});
    failed++;
    return;
  }

  // Envelope success keys are limited to the contract's fields: the
  // apiVersion stamp, the type discriminator, the optional `package` that
  // owns what the result is about (cli-surface INV28), the data payload, and
  // an optional sidecar `meta` (emitted as a sibling of data, never merged in).
  const allowedKeys = new Set(['apiVersion', 'type', 'package', 'data', 'meta']);
  const extraKeys = Object.keys(parsed).filter(k => !allowedKeys.has(k));
  if (extraKeys.length > 0) {
    console.log(`  FAIL  ${label}  (extra fields in envelope: ${extraKeys.join(', ')})`);
    failures.push({label, reason: `extra envelope fields: ${extraKeys.join(', ')}`});
    failed++;
    return;
  }

  if ('package' in parsed && (typeof parsed.package !== 'string' || !parsed.package)) {
    console.log(`  FAIL  ${label}  (envelope package is not a package name)`);
    failures.push({label, reason: 'envelope package is not a package name'});
    failed++;
    return;
  }

  if (expectType && parsed.type !== expectType) {
    console.log(`  FAIL  ${label}  (expected type "${expectType}", got "${parsed.type}")`);
    failures.push({label, reason: `expected type "${expectType}"`});
    failed++;
    return;
  }

  seenTypes.add(parsed.type);
  console.log(`  ok    ${label}  (type: ${parsed.type})`);
  passed++;
}

// ---------------------------------------------------------------------------
// 1. Auto-discover components from astryx component --list (text mode)
// ---------------------------------------------------------------------------
const listResult = run(['component', '--list']);
const componentNames = listResult.stdout
  .split('\n')
  .filter(line => /^\s+[A-Z]/.test(line))
  .map(line => line.trim().split(/\s{2,}/)[0]);

console.log(`\ndiscovered ${componentNames.length} components`);

// Pick a sample component for detail tests
const sampleComponent = componentNames.includes('Button') ? 'Button' : componentNames[0];

// ---------------------------------------------------------------------------
// 2. Auto-discover doc topics from astryx docs (text mode)
// ---------------------------------------------------------------------------
const docsResult = run(['docs']);
const docTopics = docsResult.stdout
  .split('\n')
  .filter(line => /^\s{2}\w+\s{2,}/.test(line))
  .map(line => line.trim().split(/\s{2,}/)[0]);

console.log(`discovered ${docTopics.length} doc topics: ${docTopics.join(', ')}`);

// ---------------------------------------------------------------------------
// 3. Run all checks
// ---------------------------------------------------------------------------

// ── Component ────────────────────────────────────────────────────────
console.log('\ncomponent --json');
checkJson('component --list', ['component', '--list'], {expectType: 'component.list'});

// Pick a sample category from the JSON output
const catResult = runJson(['component', '--list']);
try {
  const catData = JSON.parse(catResult.stdout);
  const firstCategory = Object.keys(catData.data.components)[0];
  if (firstCategory) {
    checkJson(`component --category ${firstCategory}`, ['component', '--category', firstCategory], {expectType: 'component.list'});
  }
} catch { /* skip if parse fails */ }

if (sampleComponent) {
  checkJson(`component ${sampleComponent}`, ['component', sampleComponent], {expectType: 'component.detail'});
  checkJson(`component ${sampleComponent} --props`, ['component', sampleComponent, '--props'], {expectType: 'component.detail.props'});
  checkJson(`component ${sampleComponent} --source`, ['component', sampleComponent, '--source'], {expectType: 'component.detail.source'});
}
checkJson('component (not found)', ['component', 'NotARealComponentName99'], {expectError: true});

// ── Docs ─────────────────────────────────────────────────────────────
console.log('\ndocs --json');
checkJson('docs (list)', ['docs'], {expectType: 'docs.list'});
if (docTopics.length > 0) {
  checkJson(`docs ${docTopics[0]}`, ['docs', docTopics[0]], {expectType: 'docs.detail'});
}
checkJson('docs (not found)', ['docs', 'nonexistent_topic_xyz'], {expectError: true});

// ── Template ─────────────────────────────────────────────────────────
console.log('\ntemplate --json');
checkJson('template --list', ['template', '--list'], {expectType: 'template.list'});
checkJson('template (not found)', ['template', 'nonexistent_template_xyz'], {expectError: true});

// ── Swizzle ──────────────────────────────────────────────────────────
console.log('\nswizzle --json');
checkJson('swizzle --list', ['swizzle', '--list'], {expectType: 'swizzle.list'});
checkJson('swizzle (not found)', ['swizzle', 'NonexistentComponent99'], {expectError: true});

// ── Gap reports ─────────────────────────────────────────────────────
console.log('\ngap-report --json');
checkJson('gap-report --list-categories', ['gap-report', '--list-categories'], {
  expectType: 'gap-report.categories',
});

// ── Build ────────────────────────────────────────────────────────────
console.log('\nbuild --json');
checkJson('build (playbook)', ['build'], {expectType: 'build.help'});
checkJson('build dashboard', ['build', 'dashboard'], {expectType: 'build.kit'});

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
console.log(`types seen: ${[...seenTypes].sort().join(', ')}`);

if (failed > 0) {
  console.log('\nFailed:');
  for (const f of failures) {
    console.log(`  - ${f.label}: ${f.reason}`);
  }
  process.exit(1);
}
