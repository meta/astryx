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
 *    `[data-astryx-press` arm, or composes `interactionOverlayStyles` or the
 *    press owner's ready-made paint (`indicatorPressPaintStyles`,
 *    `rowPressPaintStyles`).
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

/**
 * The utility, the list row's press layer, the press attribute's owner
 * module (the selector a themed press uses) and the controller define the
 * model; they are not surfaces.
 */
const MODEL_FILES = new Set([
  'utils/interactionOverlay.stylex.ts',
  'privateAttributes/press.stylex.ts',
  'privateAttributes/press.ts',
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

// A press arm keys on `:active` or on the attribute the controller writes, as
// a bare attribute selector or inside `:is(…)`. The press attribute's owner
// module writes some arms for a component, which composes them ready-made.
const PRESS_ARM =
  /':active|'(?::is\()?\[data-astryx-press=|interactionOverlayStyles\.|indicatorPressPaintStyles\.|rowPressPaintStyles\./;
const ANCESTOR_ARM =
  /stylex\.when\.ancestor\(\s*'(?::active|\[data-astryx-press=[^)]*)',\s*(\w+)\s*,?\s*\)/g;

/** Whether `text` renders a ListItem or Item with an `interactiveRef` prop. */
function delegatesToItem(text: string): boolean {
  for (const match of text.matchAll(/<(?:List)?Item\b/g)) {
    // The opening tag ends at the first `>` outside braces.
    let depth = 0;
    for (let i = match.index + match[0].length; i < text.length; i++) {
      if (text[i] === '{') {
        depth++;
      } else if (text[i] === '}') {
        depth--;
      } else if (text[i] === '>' && depth === 0) {
        if (text.slice(match.index, i).includes('interactiveRef=')) {
          return true;
        }
        break;
      }
    }
  }
  return false;
}

/**
 * Whether a file marks its pressable: it calls `usePressFeedback`, or it
 * hands a ListItem or Item an `interactiveRef`, which Item marks itself.
 */
function isMarked(file: string): boolean {
  const text = source.get(file) ?? '';
  return text.includes('usePressFeedback(') || delegatesToItem(text);
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

  it('counts a ListItem or Item handed an interactiveRef as marked', () => {
    expect(delegatesToItem('<ListItem label="a" interactiveRef={ref} />')).toBe(
      true,
    );
    expect(
      delegatesToItem('<Item\n  interactiveRef={on ? ref : undefined}\n/>'),
    ).toBe(true);
    expect(delegatesToItem('<ListItem onClick={() => {}} />')).toBe(false);
    expect(delegatesToItem('<ListItem label={<b>x</b>} />')).toBe(false);
    expect(delegatesToItem('<CheckboxListItem interactiveRef={ref} />')).toBe(
      false,
    );
  });

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
