// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.boundary.test.ts
 * @input The source of motion/animatedLayout.ts, the core entry points and
 *   every core source file that imports the module
 * @output The source boundary check `architecture:react-component-runtime`
 *   INV12 asks for: the module animates no layout property, its walk reaches
 *   elements only through parentElement / nextElementSibling (and
 *   firstElementChild under `display: contents`), the reporting functions are
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

  it('walks only through parentElement and nextElementSibling, entering display: contents alone', () => {
    const body = code(moduleSource);
    for (const forbidden of [
      'TreeWalker',
      'createTreeWalker',
      'querySelector',
      'getElementsBy',
      '.children',
      'childNodes',
      'lastElementChild',
      'previousElementSibling',
    ]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
    // Every descent is a `display: contents` branch: the follower walk's and
    // the exit's search for the next box.
    const descents = body.match(/firstElementChild/g) ?? [];
    expect(descents).toHaveLength(2);
    const contentsDescents =
      body.match(
        /display === 'contents'\)\s*\{\s*for\s*\(\s*let child = \w+\.firstElementChild/g,
      ) ?? [];
    expect(contentsDescents).toHaveLength(2);
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
      ]) {
        expect(
          source,
          `${relative(coreSrc, entry)} exports ${name}`,
        ).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
    }
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
    // The hook and the components that adopt the handle join this list as
    // they adopt it.
    expect(users).toEqual([]);
  });
});
