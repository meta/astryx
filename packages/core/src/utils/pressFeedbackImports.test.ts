// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressFeedbackImports.test.ts
 * @input The source of utils/pressFeedback.ts and every module it imports
 * @output The press feedback controller's import graph reaches no module
 *   under gestures/: a page whose only touch work is press feedback carries
 *   none of the gesture system (`spec:AST-094` FR24: pointer queries live
 *   with the environment queries)
 * @position Source boundary test of packages/core/src/utils/pressFeedback.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

describe('the press feedback controller', () => {
  it('imports nothing from the gesture system', () => {
    const utils = path.resolve(__dirname);
    const seen = new Set<string>();
    const queue = [path.join(utils, 'pressFeedback.ts')];
    const statement =
      /^\s*(import|export)\s+(type\s+)?([^'";]*?\s+from\s+)?'([^']+)';/gms;
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      for (const match of fs.readFileSync(file, 'utf8').matchAll(statement)) {
        const [, , isTypeOnly, , specifier] = match;
        if (isTypeOnly != null || !specifier.startsWith('.')) {
          continue;
        }
        const base = path.resolve(path.dirname(file), specifier);
        const resolved = [
          `${base}.ts`,
          `${base}.tsx`,
          path.join(base, 'index.ts'),
        ].find(candidate => fs.existsSync(candidate));
        if (resolved == null) {
          throw new Error(`cannot resolve ${specifier} from ${file}`);
        }
        queue.push(resolved);
      }
    }
    const modules = [...seen].map(file =>
      path.relative(path.resolve(utils, '..'), file),
    );
    expect(modules).toContain(path.join('utils', 'pressFeedback.ts'));
    expect(
      modules.filter(module => module.startsWith(`gestures${path.sep}`)),
    ).toEqual([]);
  });
});
