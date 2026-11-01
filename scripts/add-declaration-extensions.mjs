#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Build step: make every relative specifier in the emitted declarations
 * fully specified.
 *
 * `tsc --emitDeclarationOnly` copies source specifiers into the emitted .d.ts
 * files unchanged, so './Selector' and '../Button' reach consumers without an
 * extension. Bundler resolution tolerates that, but strict NodeNext consumers
 * reject them (TS2834/TS2835) and lose the types behind them (#7702). This
 * applies the rule babel-plugin-add-extensions.cjs applies to the runtime
 * files, resolved against the emitted declarations instead of the source:
 *
 *   '.' / '..'                  → './index.js' / '../index.js'
 *   './x'  (x.d.ts exists)      → './x.js'
 *   './x'  (x/index.d.ts exists) → './x/index.js'
 *
 * A file wins over a directory of the same name, as in TypeScript's own
 * lookup. Specifiers that already carry an extension, and specifiers that
 * resolve to nothing, are left alone; check-fully-specified.mjs reports the
 * latter. Comment lines are skipped, like the check, so JSDoc examples keep
 * their wording.
 *
 * Usage: node <repo-root>/scripts/add-declaration-extensions.mjs   (run from
 * a package root, right after `tsc --project tsconfig.build.json`)
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const FULLY_SPECIFIED = /\.(?:js|mjs|cjs|json|css)$/;

// from './x' | import './x' | import('./x') — the specifier homes in a .d.ts.
const SPECIFIER =
  /(\bfrom\s*|\bimport\s+|\bimport\(\s*)(["'])(\.\.?(?:\/[^"']*)?)\2/g;

const COMMENT_LINE = /^\s*(?:\*|\/\/|\/\*)/;

/**
 * Return the fully specified form of `specifier`, as written in a
 * declaration file inside `dir`, or the specifier itself when no
 * declaration target exists.
 */
export function resolveSpecifier(specifier, dir) {
  if (FULLY_SPECIFIED.test(specifier)) return specifier;
  if (specifier === '.' || specifier === '..') {
    return fs.existsSync(path.join(dir, specifier, 'index.d.ts'))
      ? `${specifier}/index.js`
      : specifier;
  }
  if (fs.existsSync(path.join(dir, `${specifier}.d.ts`))) {
    return `${specifier}.js`;
  }
  if (fs.existsSync(path.join(dir, specifier, 'index.d.ts'))) {
    return `${specifier}/index.js`;
  }
  return specifier;
}

/** Rewrite the relative specifiers in one declaration file's source. */
export function rewriteSource(source, dir) {
  return source
    .split('\n')
    .map(line =>
      COMMENT_LINE.test(line)
        ? line
        : line.replace(
            SPECIFIER,
            (match, prefix, quote, specifier) =>
              `${prefix}${quote}${resolveSpecifier(specifier, dir)}${quote}`,
          ),
    )
    .join('\n');
}

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else if (entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

/** Rewrite every declaration file under `distDir`; return the count changed. */
export function addDeclarationExtensions(distDir) {
  let changed = 0;
  for (const file of walk(distDir)) {
    const source = fs.readFileSync(file, 'utf-8');
    const rewritten = rewriteSource(source, path.dirname(file));
    if (rewritten !== source) {
      fs.writeFileSync(file, rewritten);
      changed++;
    }
  }
  return changed;
}

// Run as a script, but stay importable for unit tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const distDir = path.resolve(process.cwd(), 'dist');
  const changed = addDeclarationExtensions(distDir);
  console.log(
    `✅ ${changed} declaration file(s) now use fully specified relative specifiers.`,
  );
}
