// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.boundary.test.ts
 * @input The source of motion/animatedLayout.ts, the core entry points and
 *   every core source file that imports the module
 * @output The source boundary check `architecture:react-component-runtime`
 *   INV12 asks for: the module animates no layout property, its walk reaches
 *   elements only through parentElement and the element siblings on either
 *   side (and firstElementChild under `display: contents`), stopping at the
 *   band around the visible part, the reporting functions are
 *   not public, and only the hook and the adopting components use it
 * @position Testing; the real-browser half of INV12's verification is in
 *   __tests__/animatedLayout.interaction.browser.spec.ts
 */

import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const coreSrc = join(here, '..');
const moduleSource = readFileSync(join(here, 'animatedLayout.ts'), 'utf8');

/** The source with its comments removed, so prose cannot pass or fail it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') {
        out.push(...sourceFiles(path));
      }
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec)\.(ts|tsx)$/.test(name)
    ) {
      out.push(path);
    }
  }
  return out;
}

describe('architecture:react-component-runtime INV12 source boundary', () => {
  it('animates no layout property: only translate, opacity and the entrance clip', () => {
    const body = code(moduleSource);
    // No keyframe or style object names a box property.
    expect(body).not.toMatch(
      /(?:^|[{,])\s*(height|width|top|left|right|bottom|margin\w*|padding\w*|inset\w*)\s*:/m,
    );
    const animated = [
      ...body.matchAll(/[{,\s](translate|opacity|clipPath)\s*:/g),
    ]
      .map(match => match[1])
      .sort();
    expect([...new Set(animated)]).toEqual([
      'clipPath',
      'opacity',
      'translate',
    ]);
  });

  it('walks only through parentElement and the element siblings on either side, entering display: contents alone, and stops at the band', () => {
    const body = code(moduleSource);
    for (const forbidden of [
      'TreeWalker',
      'createTreeWalker',
      'querySelector',
      'getElementsBy',
      '.children',
      'childNodes',
    ]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
    // Every descent is a `display: contents` branch: the walk's (in its own
    // direction, first child or last) and the exit's search for the next box.
    const descents = body.match(/(first|last)ElementChild/g) ?? [];
    expect(descents).toHaveLength(3);
    const contentsDescents =
      body.match(
        /(?:display|part) === 'contents'\)\s*\{\s*for\s*\(\s*let child =[^;]*\.(first|last)ElementChild/g,
      ) ?? [];
    expect(contentsDescents).toHaveLength(2);
    // Each level's sibling walk ends at the first sibling past the band.
    expect(body).toMatch(
      /sibling != null && take\(sibling, true\);\s*sibling = sibling\.nextElementSibling/,
    );
    expect(body).toMatch(
      /sibling != null && take\(sibling, false\);\s*sibling = sibling\.previousElementSibling/,
    );
  });

  it('keeps the reporting functions out of every public entry point', () => {
    const entries = [
      join(coreSrc, 'index.ts'),
      join(coreSrc, 'hooks', 'index.ts'),
      join(coreSrc, 'motion', 'index.ts'),
    ];
    for (const entry of entries) {
      if (!existsSync(entry)) {
        continue;
      }
      const source = readFileSync(entry, 'utf8');
      for (const name of [
        'reportLayoutChange',
        'playLayoutChange',
        'applyLayoutChangeTransition',
        'createAnimatedLayout',
        'holdLayoutSwap',
        'playLayoutSwap',
        'playLayoutFrames',
      ]) {
        expect(
          source,
          `${relative(coreSrc, entry)} exports ${name}`,
        ).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
    }
  });

  it("keeps the swap's copy mechanism private to the module", () => {
    const users = sourceFiles(coreSrc)
      .filter(path =>
        /from '[./]+(motion\/)?transientCopy'/.test(readFileSync(path, 'utf8')),
      )
      .map(path => relative(coreSrc, path))
      .sort();
    expect(users).toEqual(['motion/animatedLayout.ts']);
  });

  it('is used only by the hook and the components that adopt it', () => {
    const users = sourceFiles(coreSrc)
      .filter(path => path !== join(here, 'animatedLayout.ts'))
      .filter(path =>
        /from '[./]+(motion\/)?animatedLayout'/.test(
          readFileSync(path, 'utf8'),
        ),
      )
      .map(path => relative(coreSrc, path))
      .sort();
    expect(users).toEqual([
      'AppShell/AppShell.tsx',
      'Collapsible/Collapsible.tsx',
      'SideNav/railMotion.ts',
      'Table/plugins/rowExpansion/useTableRowExpansion.tsx',
      'TreeList/TreeList.tsx',
      'hooks/useAnimatedLayout.ts',
    ]);
  });
});
