#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Repo check: package.json `scripts` must run on Windows (cmd.exe), not only
 * on a POSIX shell.
 *
 * Two Windows-hostile idioms keep coming back. Both were fixed in
 * packages/core by #3305 (bbd7a59), then copy-pasted verbatim into the newer
 * packages/lab and packages/charts, which regressed both (#3637):
 *
 *   1. `rm -rf dist` — cmd.exe has no `rm`, so the build dies at the first
 *      step. Use the repo's Node cleanup helper, which is portable and does not
 *      depend on a package-local binary.
 *   2. Single-quoted args (`--extensions '.ts,.tsx'`) — cmd.exe does not strip
 *      single quotes, so babel receives them as LITERAL characters, matches
 *      zero files, exits 0, and leaves dist/ empty. Use double quotes, which
 *      sh and cmd.exe both strip.
 *
 * Idiom 2 is why this is a check and not a code comment: it fails *silently*,
 * publishing an empty package off a green build.
 *
 * A third rule covers the half-fix: a script may only call `rimraf` if its own
 * package declares it. pnpm does not hoist, so an undeclared `rimraf` is a
 * "command not found" build break on every platform.
 *
 * Not checked: inline env assignment (`FOO=1 cmd`), which cmd.exe also
 * rejects. Root-only dev scripts (`lint:strict`, `dev:sandbox`) use it and
 * removing it needs a cross-env dependency — a separate change from the build
 * regression this guards.
 *
 * Usage: node scripts/check-portable-scripts.mjs
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** POSIX-only binaries with no cmd.exe equivalent. */
const POSIX_ONLY = ['rm', 'cp', 'mv', 'mkdir -p', 'touch', 'cat', 'ln -s'];

/** Split a script body on the shell separators (&&, ||, |, ;) into commands. */
function commandsOf(script) {
  return script
    .split(/&&|\|\||[|;]/)
    .map(part => part.trim())
    .filter(Boolean);
}

/** True when `command` invokes `binary` — `rimraf dist` is not an `rm`. */
function invokes(command, binary) {
  return command === binary || command.startsWith(`${binary} `);
}

/**
 * Strip double-quoted spans. Single quotes *inside* a double-quoted arg reach
 * the program intact on both shells (`node -e "console.log('x')"`), so only
 * the quotes still standing after this are the portability bug.
 */
function withoutDoubleQuotedSpans(script) {
  return script.replace(/"[^"]*"/g, '');
}

/**
 * Windows portability offences in one package's `scripts` block.
 *
 * @param {Record<string, string>} [scripts] the package's `scripts`
 * @param {Record<string, string>} [deps] its declared deps, of any kind
 * @returns {{name: string, detail: string}[]}
 */
export function findOffences(scripts = {}, deps = {}) {
  const offences = [];

  for (const [name, script] of Object.entries(scripts)) {
    for (const command of commandsOf(script)) {
      const binary = POSIX_ONLY.find(posix => invokes(command, posix));
      if (binary) {
        offences.push({
          name,
          detail: `POSIX-only command \`${binary}\` — cmd.exe has no such binary; use the shared Node cleanup script`,
        });
      }
      if (invokes(command, 'rimraf') && !('rimraf' in deps)) {
        offences.push({
          name,
          detail: 'calls `rimraf` without declaring it as a devDependency',
        });
      }
    }

    if (/'[^']*'/.test(withoutDoubleQuotedSpans(script))) {
      offences.push({
        name,
        detail:
          'single-quoted arg — cmd.exe passes the quotes through literally, so the glob matches nothing and the step silently no-ops',
      });
    }
  }

  return offences;
}

/** Every tracked package.json, excluding installed ones. */
export function trackedPackageJsonFiles() {
  return execFileSync('git', ['ls-files', '--', '*package.json'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
    .split('\n')
    .filter(Boolean)
    .filter(file => !file.includes('node_modules/'));
}

function main() {
  const errors = [];
  let checked = 0;

  // Every *tracked* package.json is scanned, so a brand-new package cannot
  // reintroduce either idiom without tripping this check.
  for (const file of trackedPackageJsonFiles()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf-8'));
    checked += Object.keys(pkg.scripts ?? {}).length;

    const deps = {...pkg.dependencies, ...pkg.devDependencies};
    for (const offence of findOffences(pkg.scripts, deps)) {
      errors.push({file, ...offence});
    }
  }

  if (errors.length > 0) {
    console.error('❌ package.json scripts that break on Windows:\n');
    for (const {file, name, detail} of errors) {
      console.error(`  ${file} → scripts.${name}`);
      console.error(`    ${detail}`);
    }
    console.error(
      `\n${errors.length} error(s). Fix: replace \`rm -rf\` with the shared Node cleanup script, and single quotes with double quotes.`,
    );
    process.exit(1);
  }

  console.log(`✅ ${checked} package.json script(s) checked — all portable.`);
}

// Run as a script, but stay importable for unit tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
