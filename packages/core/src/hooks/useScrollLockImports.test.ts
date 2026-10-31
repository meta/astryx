// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollLockImports.test.ts
 * @input useScrollLock.ts and the core modules it imports at runtime
 * @output Fails when the scroll lock's import, or that of an overlay taking
 *   it (Dialog, AlertDialog, BottomSheet, Drawer, Lightbox), reaches the
 *   gesture host or its arena
 * @position Keeps the scroll lock's touch half small: Dialog, BottomSheet,
 *   Drawer and Lightbox all take the lock, so whatever it imports ships with
 *   every overlay (architecture:component-style-authoring INV6). The page
 *   hold asks the document's gesture host only if one exists, so the host
 *   stays out of the overlays' bundles.
 *
 * SYNC: When modified, update useScrollLock.ts and gestures/pageHold.ts.
 */

import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = resolve(__dirname, '..');

const IMPORT =
  /(?:^|[\s;])(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const BARE = /(?:^|[\s;])import\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function resolveModule(from: string, specifier: string): string | null {
  const base = join(dirname(from), specifier).replace(/\.js$/, '');
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** The modules `file` loads at runtime; type-only imports load nothing. */
function runtimeImports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const found: string[] = [];
  for (const [, typeOnly, clause = '', specifier = ''] of text.matchAll(
    IMPORT,
  )) {
    const named = /^\{([\s\S]*)\}$/.exec(clause.trim());
    const allTypes =
      named != null &&
      (named[1] ?? '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .every(part => part.startsWith('type '));
    if (typeOnly == null && !allTypes) {
      const target = resolveModule(file, specifier);
      if (target != null) {
        found.push(target);
      }
    }
  }
  for (const [, specifier = ''] of text.matchAll(BARE)) {
    const target = resolveModule(file, specifier);
    if (target != null) {
      found.push(target);
    }
  }
  return found;
}

/** Every core module importing `entry` loads, relative to src. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [resolve(SRC, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    const key = relative(SRC, file);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    queue.push(...runtimeImports(file));
  }
  return seen;
}

describe('useScrollLock imports', () => {
  // The lock itself, and the overlays that take it: whatever the lock pulls
  // in ships with each of them.
  it.each([
    'hooks/useScrollLock.ts',
    'Dialog/Dialog.tsx',
    'AlertDialog/AlertDialog.tsx',
    'BottomSheet/BottomSheet.tsx',
    'Drawer/Drawer.tsx',
    'Lightbox/Lightbox.tsx',
  ])('%s reaches neither the gesture host nor its arena', entry => {
    const reached = reachableFrom(entry);
    const gestures = [...reached].filter(path => path.startsWith('gestures/'));
    expect(gestures).not.toContain('gestures/GestureHost.ts');
    expect(gestures).not.toContain('gestures/GestureArena.ts');
  });
});
