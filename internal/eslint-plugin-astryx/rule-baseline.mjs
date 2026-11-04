// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rule-baseline.mjs
 * @description Writes (or, with --check, verifies) a rule's baseline: the
 * violations, per repo-relative file, that existed when the repository config
 * began enforcing it. The rule takes the baseline as `{baseline, root}` and
 * reports only what it does not list. Shared by each rule's
 * `<rule>.baseline.mjs` so the write and `--check` flows stay one, and by the
 * rules that spend a counted baseline (`baselineAllowance`).
 */

import fs from 'node:fs';
import path from 'node:path';
import {ESLint} from 'eslint';

/**
 * The allowance a baselined rule spends as it reports, for the file being
 * linted. The rule's options are `{baseline, root}`: `baseline` maps a file,
 * relative to `root` (the repository root; default: the directory ESLint runs
 * from), to its entries. Each entry allows as many reports as it is listed;
 * the next one is reported. Returns `isAllowed(entry)`, which spends one
 * allowance when one is left. Shared by every rule that takes a counted
 * baseline, so matching stays one implementation.
 *
 * @param {import('eslint').Rule.RuleContext} context
 * @returns {(entry: string) => boolean}
 */
export function baselineAllowance(context) {
  const options = context.options[0] ?? {};
  const root = options.root ?? context.cwd;
  const filename = context.filename ?? context.getFilename();
  const relative = path.relative(root, filename).split(path.sep).join('/');
  const left = new Map();
  for (const entry of options.baseline?.[relative] ?? []) {
    left.set(entry, (left.get(entry) ?? 0) + 1);
  }
  return entry => {
    const count = left.get(entry) ?? 0;
    if (count === 0) {
      return false;
    }
    left.set(entry, count - 1);
    return true;
  };
}

/**
 * Lint `targets` with the repository config and an empty baseline, so every
 * violation in `scope` is reported, then write or check `baselineFile`.
 *
 * `entryFromMessage` turns a report into its baseline entry. With `unique`,
 * an entry is listed once per file; without it, once per report, so the rule
 * can allow exactly that many.
 */
export async function runRuleBaseline({
  ruleId,
  scope,
  targets,
  baselineFile,
  entryFromMessage,
  unique,
  noun,
  argv = process.argv,
}) {
  const root = path.resolve(import.meta.dirname, '../..');
  const name = ruleId.replace(/^@astryx\//, '');
  const eslint = new ESLint({
    cwd: root,
    // Some packages' sources are ignored by the repo config entirely.
    errorOnUnmatchedPattern: false,
    ruleFilter: ({ruleId: id}) => id === ruleId,
    overrideConfig: [
      {
        files: scope.files,
        ignores: scope.ignores,
        rules: {[ruleId]: ['error', {baseline: {}, root}]},
      },
    ],
  });
  const results = await eslint.lintFiles(targets);

  const found = new Map();
  for (const result of results) {
    for (const message of result.messages) {
      if (message.ruleId !== ruleId) {
        continue;
      }
      const entry = entryFromMessage(message.message);
      if (entry == null) {
        continue;
      }
      const file = path
        .relative(root, result.filePath)
        .split(path.sep)
        .join('/');
      if (!found.has(file)) {
        found.set(file, []);
      }
      found.get(file).push(entry);
    }
  }
  const baseline = Object.fromEntries(
    [...found.keys()]
      .sort()
      .map(file => [
        file,
        (unique ? [...new Set(found.get(file))] : found.get(file)).sort(),
      ]),
  );

  if (argv.includes('--check')) {
    const current = fs.readFileSync(baselineFile, 'utf8');
    if (JSON.stringify(JSON.parse(current)) !== JSON.stringify(baseline)) {
      console.error(
        `${name} baseline is out of date; run this script without --check.`,
      );
      process.exit(1);
    }
    console.log(`${name} baseline is up to date.`);
    return;
  }
  fs.writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
  const count = Object.values(baseline).reduce((n, list) => n + list.length, 0);
  console.log(
    `Wrote ${count} ${noun} in ${found.size} files to ${path.relative(root, baselineFile)}.`,
  );
}
