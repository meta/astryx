// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards shipped templates and blocks against native browser dialogs.
 * @input Every page template and block source under assets/templates.
 * @output Assertions that no source calls alert(), confirm() or prompt().
 * @position Template contract test. A page shared in a sandboxed frame
 *   without modal permission ignores native dialogs, so a demo action that
 *   calls one does nothing there. Demo actions show a "Demo: …" toast.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const templatesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/templates',
);

function sourceFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx|ts|jsx|js)$/.test(entry.name) ? [full] : [];
  });
}

// A bare or window-qualified call. A method of another object, such as
// `speech.prompt(`, is not a native dialog.
const NATIVE_DIALOG_CALL =
  /(?<![\w$.])(?:window\.|globalThis\.)?(alert|confirm|prompt)\s*\(/g;

describe('templates and blocks', () => {
  const files = ['pages', 'blocks'].flatMap(dir =>
    sourceFiles(path.join(templatesRoot, dir)),
  );

  it('finds the template and block sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('never call a native browser dialog', () => {
    const calls = files.flatMap(file =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          [...line.matchAll(NATIVE_DIALOG_CALL)].map(
            match =>
              `${path.relative(templatesRoot, file)}:${index + 1} ${match[1]}()`,
          ),
        ),
    );
    expect(calls).toEqual([]);
  });
});
