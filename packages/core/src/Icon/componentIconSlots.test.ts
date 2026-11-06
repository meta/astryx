// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @file componentIconSlots.test.ts
 * @input The `ComponentIconSlotMap` declaration in Icon/index.ts, the Core
 *   sources that render a slot, and every Core `*.doc.mjs`
 * @output Vitest failures naming each slot that is declared, rendered, or
 *   documented without the other two, or named outside its component
 * @position Guards the component icon slot inventory: a declared slot has one
 *   owning component, which renders it and lists it in its doc's
 *   `theming.componentIcons`
 */

import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {basename, dirname, join, relative} from 'node:path';

const CORE_SRC_DIR = join(__dirname, '..');

function walk(dir: string, accept: (file: string) => boolean): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : walk(path, accept);
    }
    return accept(path) ? [path] : [];
  });
}

/** The slot names `ComponentIconSlotMap` declares in the public module. */
function declaredSlots(): string[] {
  const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
  const body = /export interface ComponentIconSlotMap \{([\s\S]*?)\n\}/.exec(
    source,
  )?.[1];
  return [...(body ?? '').matchAll(/^ {2}'([^']+)'\??:/gm)].map(m => m[1]);
}

/**
 * The files that render each slot: a `slot` attribute on `ComponentIcon`, or
 * the first argument of `useComponentIcon` or `resolveComponentIcon`.
 */
function renderedSlots(): Map<string, string[]> {
  const sites = new Map<string, string[]>();
  const sources = walk(
    CORE_SRC_DIR,
    file =>
      /\.tsx?$/.test(file) &&
      !/\.(test|stories)\.tsx?$/.test(file) &&
      dirname(file) !== __dirname,
  );
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    const pattern =
      /<ComponentIcon\b[^>]*?\bslot="([^"]+)"|\b(?:useComponentIcon|resolveComponentIcon)\(\s*'([^']+)'/g;
    for (const match of text.matchAll(pattern)) {
      const slot = match[1] ?? match[2];
      sites.set(slot, [...(sites.get(slot) ?? []), file]);
    }
  }
  return sites;
}

interface SlotDoc {
  slot: string;
  description?: string;
  fallback?: string;
  whenNull?: string;
}

/** Each documented slot, with the doc file that lists it. */
function documentedSlots(): {doc: string; entry: SlotDoc}[] {
  return walk(CORE_SRC_DIR, file => file.endsWith('.doc.mjs')).flatMap(doc => {
    const mod = require(doc) as {
      docs?: {theming?: {componentIcons?: SlotDoc[]}};
    };
    return (mod.docs?.theming?.componentIcons ?? []).map(entry => ({
      doc,
      entry,
    }));
  });
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

describe('component icon slot inventory', () => {
  const declared = declaredSlots();
  const rendered = renderedSlots();
  const documented = documentedSlots();

  it('declares at least one slot', () => {
    expect(declared.length).toBeGreaterThan(0);
  });

  it.each(declared)(
    '%s is rendered by one component and documented by it',
    slot => {
      const sites = rendered.get(slot) ?? [];
      expect(sites, `${slot} has no render site`).not.toEqual([]);
      const docs = documented.filter(({entry}) => entry.slot === slot);
      expect(
        docs.map(({doc}) => relative(CORE_SRC_DIR, doc)),
        `${slot} must be listed in exactly one theming.componentIcons`,
      ).toHaveLength(1);
      const [{doc, entry}] = docs;
      for (const site of sites) {
        expect(
          relative(dirname(doc), site).startsWith('..'),
          `${relative(CORE_SRC_DIR, site)} renders ${slot}, which ${relative(CORE_SRC_DIR, doc)} owns`,
        ).toBe(false);
      }
      // `<component-kebab>-<semantic-role>`, by the owning component folder.
      expect(slot.startsWith(`${kebab(basename(dirname(doc)))}-`)).toBe(true);
      expect([entry.description, entry.fallback, entry.whenNull]).not.toContain(
        undefined,
      );
    },
  );

  it('documents and renders only declared slots', () => {
    const undeclared = [
      ...documented.map(({entry}) => entry.slot),
      ...rendered.keys(),
    ].filter(slot => !declared.includes(slot));
    expect(undeclared).toEqual([]);
  });
});
