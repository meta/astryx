// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressableCoverage.test.ts
 * @input Every non-test source file under packages/core/src
 * @output A guard that every file which paints a press is reachable by the
 *   touch press controller
 * @position Testing; the structural half of the touch press model's contract
 *
 * The touch press controller (utils/pressFeedback.ts) can only paint what
 * carries `data-astryx-pressable`, and under a coarse pointer the `:active`
 * arm is dropped, so a surface that paints a press without the marker would
 * press on a mouse and stay dead under a finger. This test enumerates the
 * pressable set from the source itself — never from a hand-kept list — and
 * holds it equal to the marked set:
 *
 *  - A file paints a press when its StyleX carries an `':active` key, a
 *    `[data-astryx-press` arm, or composes `interactionOverlayStyles`.
 *  - A file is marked when it calls `usePressFeedback(`.
 *  - A file whose press arms are read off an ancestor scope marker
 *    (`stylex.when.ancestor(':active', someScope)`, the way an indicator
 *    reads its owner row) is covered when every file that applies that scope
 *    marker is marked, since the controller writes `data-astryx-press` on the
 *    element carrying the scope.
 *  - A styles-only module (`*.stylex.ts`) is covered when every file that
 *    imports it is marked.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(__dirname, '..');

/** The utility and the controller define the model; they are not surfaces. */
const MODEL_FILES = new Set([
  'utils/interactionOverlay.stylex.ts',
  'utils/pressFeedback.ts',
  'utils/pressGesture.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        continue;
      }
      walk(full, out);
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.(test|stories|spec)\./.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC);
const source = new Map(
  files.map(file => [path.relative(SRC, file), fs.readFileSync(file, 'utf8')]),
);

const PRESS_ARM = /':active|'\[data-astryx-press=|interactionOverlayStyles\./;
const ANCESTOR_ARM =
  /stylex\.when\.ancestor\(\s*'(?::active|\[data-astryx-press=[^)]*)',\s*(\w+)\s*\)/g;

function isMarked(file: string): boolean {
  return (source.get(file) ?? '').includes('usePressFeedback(');
}

/** Files (other than `except`) that apply the scope marker `name` to an element. */
function referrers(name: string, except: string): string[] {
  const pattern = new RegExp(`\\b${name}\\b`);
  return [...source.entries()]
    .filter(([file, text]) => {
      if (file === except || file.endsWith('.markers.stylex.ts')) {
        return false;
      }
      // Mentioning the marker is not applying it: a reader names it inside
      // `stylex.when.*()`, an index re-exports it, a doc comment describes it.
      const applied = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/import[\s\S]*?from\s+'[^']+';/g, '')
        .replace(/export\s*(?:type\s*)?\{[\s\S]*?\}\s*from\s+'[^']+';/g, '')
        .replace(/stylex\.when\.\w+\([^)]*\)/g, '');
      return pattern.test(applied);
    })
    .map(([file]) => file);
}

/** Files that import the module at `file` (by its relative specifier). */
function importers(file: string): string[] {
  const stem = file.replace(/\.tsx?$/, '');
  return [...source.entries()]
    .filter(([other, text]) => {
      if (other === file) {
        return false;
      }
      const dir = path.dirname(other);
      const specifiers = [...text.matchAll(/from\s+'([^']+)'/g)].map(m =>
        path.normalize(path.join(dir, m[1])),
      );
      return specifiers.includes(stem);
    })
    .map(([other]) => other);
}

const pressArmFiles = [...source.entries()]
  .filter(([file, text]) => !MODEL_FILES.has(file) && PRESS_ARM.test(text))
  .map(([file]) => file)
  .sort();

describe('every surface that paints a press is reachable by the touch press controller', () => {
  it('finds the pressable set from the source (a sanity floor, not a list)', () => {
    // Button, Item, the eight components of the first press PR and the ~20
    // composers of the overlay utility: well above this floor, and a regex
    // that stopped matching would fall below it.
    expect(pressArmFiles.length).toBeGreaterThan(25);
  });

  it.each(pressArmFiles)(
    '%s carries the marker, or its scope owners do',
    file => {
      const text = source.get(file) ?? '';
      if (isMarked(file)) {
        return;
      }

      const problems: string[] = [];

      if (file.endsWith('.stylex.ts')) {
        // A styles-only module: its arms land on whichever component composes
        // it, so each importer must be a marked surface.
        const users = importers(file);
        expect(users, `${file} is imported by nobody`).not.toHaveLength(0);
        for (const user of users) {
          if (!isMarked(user)) {
            problems.push(`${user} composes ${file} unmarked`);
          }
        }
      } else {
        // A component whose arms read an ancestor scope marker: the owners that
        // apply the marker are the pressables, and each must be marked.
        const scopes = [...text.matchAll(ANCESTOR_ARM)].map(m => m[1]);
        expect(
          scopes,
          `${file} paints a press without usePressFeedback() and without an ancestor scope`,
        ).not.toHaveLength(0);
        for (const scope of new Set(scopes)) {
          const owners = referrers(scope, file);
          expect(owners, `${scope} is applied by nobody`).not.toHaveLength(0);
          for (const owner of owners) {
            if (!isMarked(owner)) {
              problems.push(`${owner} applies ${scope} unmarked`);
            }
          }
        }
      }

      expect(problems).toEqual([]);
    },
  );

  it('marks nothing that does not paint a press', () => {
    // The converse: a marker with no arm would ask the controller to write an
    // attribute nothing reads. Every marked file must paint a press itself or
    // apply a scope an indicator reads.
    const marked = [...source.entries()]
      .filter(([, text]) => text.includes('usePressFeedback('))
      .map(([file]) => file)
      .filter(file => file !== 'hooks/usePressFeedback.ts');
    const scopeNames = new Set(
      [...source.values()].flatMap(text =>
        [...text.matchAll(ANCESTOR_ARM)].map(m => m[1]),
      ),
    );
    const unexplained = marked.filter(file => {
      const text = source.get(file) ?? '';
      if (PRESS_ARM.test(text)) {
        return false;
      }
      return ![...scopeNames].some(scope =>
        new RegExp(`\\b${scope}\\b`).test(text),
      );
    });
    expect(unexplained).toEqual([]);
  });
});
