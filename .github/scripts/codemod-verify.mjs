// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod verification script
 *
 * Verifies that codemods in a PR can reproduce the callsite changes.
 * This enforces the process: "never hand-edit callsites for breaking changes,
 * always use the codemod."
 *
 * Algorithm:
 * 1. Detect which codemod version(s) were added/modified in this PR
 * 2. Find consumer directories that were also changed (apps/, e2e/)
 * 3. For each consumer dir: revert to base, run codemods, diff against PR
 * 4. Report mismatches
 *
 * Exit 0 if codemods reproduce changes (or no consumer files changed).
 * Exit 1 if there are mismatches — callsites were hand-edited — unless the
 * pull request carries the `allow-manual-edit` label: an owner exception that
 * a maintainer applies (ALLOW_MANUAL_EDIT=true). It still lists every mismatch.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {getTransformsBetween} from '../../packages/cli/assets/codemods/registry.mjs';
import {runCodemods} from '../../packages/cli/assets/codemods/runner.mjs';

// Consumer directories whose changes should be reproducible by codemods
const CONSUMER_DIRS = ['apps/storybook', 'apps/sandbox', 'e2e'];

/**
 * Runs a command with its arguments as given. No shell reads them, so a path
 * with any characters (a space, parentheses, `$`, a backtick) passes through.
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd?: string}} [options]
 */
function run(command, args, {cwd} = {}) {
  return execFileSync(command, args, {encoding: 'utf-8', cwd}).trim();
}

/**
 * The files the branch changed since `base`, read NUL-separated so git
 * neither quotes nor escapes a path.
 * @param {string} base
 * @param {{cwd?: string}} [options]
 */
export function changedFiles(base, options = {}) {
  return run('git', ['diff', '--name-only', '-z', base, 'HEAD'], options)
    .split('\0')
    .filter(Boolean);
}

/**
 * A file's content at `base`, or null when the file is new since then.
 * @param {string} base
 * @param {string} file
 * @param {{cwd?: string}} [options]
 */
export function baseVersion(base, file, options = {}) {
  try {
    return execFileSync('git', ['show', `${base}:${file}`], {
      encoding: 'utf-8',
      cwd: options.cwd,
    });
  } catch {
    return null;
  }
}

/**
 * Formats files in place with the workspace's Prettier. Node starts
 * Prettier's own bin, because `npx` starts it again through a shell, which
 * expands braces and brackets in a path.
 * @param {string[]} files
 * @param {{cwd?: string}} [options]
 */
export function formatFiles(files, options = {}) {
  const manifest = createRequire(import.meta.url).resolve(
    'prettier/package.json',
  );
  const {bin} = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const script = path.join(
    path.dirname(manifest),
    typeof bin === 'string' ? bin : bin.prettier,
  );
  run(process.execPath, [script, '--write', ...files], options);
}

function getChangedFiles() {
  const base = run('git', ['merge-base', 'HEAD', 'origin/main']);
  return {base, files: changedFiles(base)};
}

function getCodemodTargets(changedFiles) {
  const versionPattern =
    /^packages\/cli\/assets\/codemods\/transforms\/v([\d.]+)\//;
  const targets = new Set();
  for (const file of changedFiles) {
    const match = file.match(versionPattern);
    if (match) {
      targets.add(match[1]);
      continue;
    }
    if (file.startsWith('packages/cli/assets/codemods/transforms/next/')) {
      targets.add('next');
    }
  }
  return [...targets].sort((a, b) => {
    if (a === 'next') return 1;
    if (b === 'next') return -1;
    return a.localeCompare(b, undefined, {numeric: true});
  });
}

async function getManifestsForTargets(targets, fromVersion, latestVersion) {
  if (targets.includes('next')) {
    const manifest =
      await import('../../packages/cli/assets/codemods/transforms/next/index.mjs');
    const manifests = [{version: 'next', transforms: manifest.default}];
    const releasedTargets = targets.filter(target => target !== 'next');
    if (releasedTargets.length === 0) return manifests;
    return [
      ...(await getTransformsBetween(fromVersion, latestVersion)),
      ...manifests,
    ];
  }
  return getTransformsBetween(fromVersion, latestVersion);
}

function getChangedConsumerFiles(changedFiles) {
  return changedFiles.filter(f =>
    CONSUMER_DIRS.some(
      dir => f.startsWith(dir + '/') && /\.(tsx?|jsx?)$/.test(f),
    ),
  );
}

async function main() {
  console.log('🔍 Codemod Verification\n');

  const {base, files: changedFiles} = getChangedFiles();
  const codemodTargets = getCodemodTargets(changedFiles);
  const consumerFiles = getChangedConsumerFiles(changedFiles);

  console.log(
    `Codemod targets modified: ${codemodTargets.join(', ') || 'none'}`,
  );
  console.log(`Consumer files changed: ${consumerFiles.length}`);

  if (codemodTargets.length === 0) {
    console.log('\n✅ No codemod changes — nothing to verify.');
    process.exit(0);
  }

  if (consumerFiles.length === 0) {
    console.log('\n✅ No consumer file changes — codemod-only PR.');
    console.log(
      '⚠️  Note: If this codemod has breaking changes, consumer files should also be updated via the codemod.',
    );
    process.exit(0);
  }

  console.log(
    `\nConsumer files to verify:\n${consumerFiles.map(f => `  ${f}`).join('\n')}\n`,
  );

  // Save the PR version of each consumer file
  const prVersions = {};
  for (const file of consumerFiles) {
    prVersions[file] = fs.readFileSync(file, 'utf-8');
  }

  // Revert consumer files to base branch state
  let revertedFiles = [];
  for (const file of consumerFiles) {
    const baseContent = baseVersion(base, file);
    if (baseContent == null) {
      console.log(`  ⏭  ${file} — new in this PR, skipping`);
      continue;
    }
    fs.writeFileSync(file, baseContent);
    revertedFiles.push(file);
  }
  console.log(
    `Reverted ${revertedFiles.length} files to base (${base.slice(0, 8)})\n`,
  );

  if (revertedFiles.length === 0) {
    console.log('✅ All consumer files are new — nothing to verify.');
    for (const file of consumerFiles) {
      fs.writeFileSync(file, prVersions[file]);
    }
    process.exit(0);
  }

  // Determine the version range for codemods
  // Only run the new versions added in this PR — the base branch already
  // has earlier codemod changes applied to consumer files.
  const releasedTargets = codemodTargets.filter(target => target !== 'next');
  const earliestVersion = releasedTargets[0] ?? 'next';
  const latestVersion = releasedTargets[releasedTargets.length - 1] ?? 'next';

  // Find the version just before the earliest modified one
  const {versions: allVersions, latestVersion: latestRegisteredVersion} =
    await import('../../packages/cli/assets/codemods/registry.mjs');
  const earliestIdx = allVersions.indexOf(earliestVersion);
  const fromVersion =
    earliestVersion === 'next'
      ? latestRegisteredVersion
      : earliestIdx > 0
        ? allVersions[earliestIdx - 1]
        : '0.0.0';

  // Save the base versions to detect which files the codemod actually modified
  const baseVersions = {};
  for (const file of revertedFiles) {
    baseVersions[file] = fs.readFileSync(file, 'utf-8');
  }

  // Run codemods on each affected consumer directory
  const affectedDirs = [
    ...new Set(
      revertedFiles
        .map(f => CONSUMER_DIRS.find(dir => f.startsWith(dir + '/')))
        .filter(Boolean),
    ),
  ];

  for (const dir of affectedDirs) {
    console.log(
      `Running codemods (${fromVersion} → ${latestVersion}) on ${dir}/...`,
    );
    const manifests = await getManifestsForTargets(
      codemodTargets,
      fromVersion,
      latestVersion,
    );
    if (manifests.length === 0) {
      console.log('  No applicable codemods found.');
      continue;
    }

    // Suppress codemod log output during verification
    const origLog = console.log;
    const origErr = console.error;
    await runCodemods(manifests, {
      apply: true,
      path: dir,
      codemod: undefined,
    });
  }

  // Filter to only files the codemod actually modified.
  // Files unchanged by the codemod have unrelated edits in this PR — skip them.
  const codemodModifiedFiles = revertedFiles.filter(file => {
    try {
      return fs.readFileSync(file, 'utf-8') !== baseVersions[file];
    } catch {
      return false;
    }
  });
  const skippedFiles = revertedFiles.filter(
    f => !codemodModifiedFiles.includes(f),
  );

  if (codemodModifiedFiles.length === 0) {
    console.log(
      '\n✅ Codemod made no changes to consumer files — nothing to verify.',
    );
    for (const file of consumerFiles) {
      fs.writeFileSync(file, prVersions[file]);
    }
    process.exit(0);
  }

  if (skippedFiles.length > 0) {
    console.log(
      `\nSkipping ${skippedFiles.length} file(s) not modified by codemod:`,
    );
    for (const file of skippedFiles) {
      console.log(`  ⏭  ${file}`);
    }
  }

  // Format codemod output with prettier to normalize style differences
  // (jscodeshift's toSource() may change quotes, spacing, etc.)
  console.log('\nFormatting codemod output with prettier...');
  try {
    formatFiles(codemodModifiedFiles);
  } catch (e) {
    console.log('  ⚠️  Prettier formatting failed, comparing raw output');
  }

  // Also format the expected (PR) versions for a fair comparison
  const formattedExpected = {};
  for (const file of codemodModifiedFiles) {
    // Use the original file extension so prettier can infer the parser
    const ext = path.extname(file);
    const tmpFile = file.replace(ext, `.expected${ext}`);
    fs.writeFileSync(tmpFile, prVersions[file]);
    try {
      formatFiles([tmpFile]);
      formattedExpected[file] = fs.readFileSync(tmpFile, 'utf-8');
    } catch {
      formattedExpected[file] = prVersions[file];
    }
    fs.unlinkSync(tmpFile);
  }

  // Compare codemod changes against PR versions.
  // Instead of requiring exact file match, we verify that every line the
  // codemod REMOVED from base is also absent in the PR, and every line it
  // ADDED is present in the PR. This allows the PR to contain additional
  // changes from stacked commits that are beyond the codemod's scope.
  let matches = 0;
  const mismatchDetails = [];

  for (const file of codemodModifiedFiles) {
    const expected = formattedExpected[file] || prVersions[file];
    let actual;
    try {
      actual = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    if (actual === expected) {
      matches++;
      console.log(`  ✅ ${file}`);
    } else {
      // Check if the codemod's changes are a subset of the PR's changes.
      // The codemod transforms base → actual. The PR transforms base → expected.
      // We verify that lines removed by codemod are also removed in PR,
      // and lines added by codemod are present in PR.
      const baseLines = (baseVersions[file] || '').split('\n');
      const codemodLines = actual.split('\n');
      const prLines = expected.split('\n');

      // Find lines removed by codemod (in base but not in codemod output)
      const codemodRemovedFromBase = baseLines.filter(
        l => !codemodLines.includes(l),
      );
      // Find lines added by codemod (in codemod output but not in base)
      const codemodAddedToBase = codemodLines.filter(
        l => !baseLines.includes(l),
      );

      // Check: removed lines should also be absent from PR
      const missingRemovals = codemodRemovedFromBase.filter(
        l => l.trim() && prLines.includes(l),
      );
      // Check: added lines should be present in PR
      const missingAdditions = codemodAddedToBase.filter(
        l => l.trim() && !prLines.includes(l),
      );

      if (missingRemovals.length === 0 && missingAdditions.length === 0) {
        matches++;
        console.log(
          `  ✅ ${file} (superset — PR includes codemod changes + additional edits)`,
        );
      } else {
        const issues = [];
        if (missingRemovals.length > 0) {
          issues.push(
            `${missingRemovals.length} line(s) codemod removed still present in PR`,
          );
        }
        if (missingAdditions.length > 0) {
          issues.push(
            `${missingAdditions.length} line(s) codemod added missing from PR`,
          );
        }
        mismatchDetails.push({
          file,
          diffLines: missingRemovals.length + missingAdditions.length,
          issues: issues.join('; '),
        });
        console.log(`  ❌ ${file} (${issues.join('; ')})`);
      }
    }
  }

  // Restore PR versions
  for (const file of consumerFiles) {
    if (prVersions[file]) {
      fs.writeFileSync(file, prVersions[file]);
    }
  }

  return report({
    matches,
    mismatchDetails,
    allowed: process.env.ALLOW_MANUAL_EDIT === 'true',
  });
}

/** The label a maintainer applies for an owner exception. */
export const ALLOW_LABEL = 'allow-manual-edit';

/**
 * Prints the results and returns the exit code: 1 when the codemods did not
 * reproduce every consumer change, 0 when they did or when `allowed`.
 * @param {{matches: number, mismatchDetails: {file: string, diffLines: number, issues?: string}[], allowed: boolean, log?: (line: string) => void}} options
 * @returns {0 | 1}
 */
export function report({matches, mismatchDetails, allowed, log = console.log}) {
  const mismatches = mismatchDetails.length;
  log(`\n${'='.repeat(60)}`);
  log('Codemod Verification Results');
  log('='.repeat(60));
  log(`  Files verified: ${matches + mismatches}`);
  log(`  ✅ Reproducible: ${matches}`);
  log(`  ❌ Mismatches:   ${mismatches}`);

  if (mismatches > 0) {
    log('\nMismatched files (codemod changes not fully reflected in PR):');
    for (const {file, diffLines, issues} of mismatchDetails) {
      log(`  ❌ ${file} (${issues || diffLines + ' lines differ'})`);
    }
    log('\n⚠️  The codemod did not reproduce the committed consumer changes.');
    log('This means either:');
    log('  1. Callsites were hand-edited instead of using the codemod');
    log('  2. The codemod is incomplete (add missing transforms)');
    log(
      `  3. Changes are intentionally beyond codemod scope (a maintainer adds the ${ALLOW_LABEL} label; it takes effect on the next push or a draft-and-ready toggle)`,
    );
    if (allowed) {
      log(`\n✅ Mismatches allowed by ${ALLOW_LABEL} (owner exception).`);
      return 0;
    }
    return 1;
  }

  log('\n✅ All consumer changes are reproducible by codemods.');
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(
    code => process.exit(code),
    err => {
      console.error('Codemod verification failed:', err);
      process.exit(1);
    },
  );
}
