// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file unicodePropertyEscapes.source-build.test.mjs
 * @input Every Core source module a bundler compiles (tests and stories
 *   excluded)
 * @output Fails when a module writes a Unicode property escape (`\p{…}` or
 *   `\P{…}`) as a regular expression literal
 * @position Guard for source builds: for targets without property escapes, or
 *   with no browserslist, Babel rewrites such a literal, and the copy bundled
 *   with Next.js lacks the Unicode data to do it, so the build fails with
 *   "Unknown property". Modules build these expressions at runtime instead,
 *   as NumberInput/numberParser.ts does.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseSync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const SKIPPED = /\.(test|stories)\.tsx?$|\.d\.ts$/;

function sourceFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(file);
    }
    return /\.tsx?$/.test(entry.name) && !SKIPPED.test(entry.name)
      ? [file]
      : [];
  });
}

/** Every regular expression literal in a parsed tree. */
function regexLiterals(node, found = []) {
  if (node == null || typeof node !== 'object') return found;
  if (node.type === 'RegExpLiteral') found.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'extra') regexLiterals(value, found);
  }
  return found;
}

describe('Core regular expressions in source builds', () => {
  it('writes no Unicode property escape as a regex literal', () => {
    const offenders = [];
    for (const file of sourceFiles(SRC)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!/\\[pP]\{/.test(source)) continue;
      const ast = parseSync(source, {
        filename: file,
        babelrc: false,
        configFile: false,
        parserOpts: {plugins: ['typescript', 'jsx']},
      });
      for (const literal of regexLiterals(ast)) {
        if (/\\[pP]\{/.test(literal.pattern)) {
          offenders.push(
            `${path.relative(SRC, file)}:${literal.loc.start.line} /${literal.pattern}/${literal.flags}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
