// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file uikitTabBar.test.ts
 * @input vitest, uikitTabBar.ts and its source text
 * @output Checks that every value of TabBar's UIKit table names an allowed
 *   source. A measurement names its iOS version and date, and a guess names
 *   an open measurement task. No value ships its source.
 * @position Testing; validates uikitTabBar.ts without a browser, by the rules
 *   Core's UIKit table follows
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {tabBar} from './uikitTabBar';

const FILE = 'uikitTabBar.ts';
const TEXT = fs.readFileSync(path.resolve(__dirname, FILE), 'utf8');
// Where a number comes from is documentation: a value that carried it would
// ship it in every bundle that reads the value.
const PROVENANCE_KEYS = new Set(['source', 'guess', 'measure']);
/** A measurement names its subject, the iOS version it ran on and its date. */
const MEASURED =
  /^@source measured: .*iOS \d.*(\b20\d\d-\d\d-\d\d\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? 20\d\d\b)/;
const SOURCE_KINDS =
  /^@source (apple-docs https:\/\/developer\.apple\.com\/|wwdc \d{4}-\d+ |webkit Source\/|measured: .*iOS \d|GUESS — )/;

interface Leaf {
  key: string;
  doc: string;
}

/** A JSDoc line without its comment markers. */
const bare = (line: string) => line.trim().replace(/^\/?\*+\/?\s?/, '');

/**
 * Every leaf of the exported table with the JSDoc block right above it. A
 * line ending in `{` opens a group (no source of its own); any other
 * `key: value,` line is a leaf.
 */
function leaves(): Leaf[] {
  const lines = TEXT.split('\n');
  const start = lines.findIndex(line =>
    /^export const tabBar = \{$/.test(line),
  );
  expect(start, 'the table').toBeGreaterThan(-1);
  const found: Leaf[] = [];
  let doc = '';
  let inDoc = false;
  const groupLeafCount: number[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('/**')) {
      inDoc = true;
      doc = '';
    }
    if (inDoc) {
      doc += bare(trimmed) + '\n';
      if (trimmed.endsWith('*/')) {
        inDoc = false;
      }
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('//')) {
      continue;
    }
    if (/^(\w+): \{$/.test(trimmed)) {
      groupLeafCount.push(0);
      doc = '';
      continue;
    }
    if (/^\},?$/.test(trimmed)) {
      expect(groupLeafCount.pop(), 'an empty group').toBeGreaterThan(0);
      continue;
    }
    if (trimmed.startsWith('} as const')) {
      break;
    }
    const leaf = /^(\w+): .+,$/.exec(trimmed);
    expect(leaf, `unexpected line ${JSON.stringify(trimmed)}`).not.toBeNull();
    if (leaf) {
      found.push({key: leaf[1], doc});
      groupLeafCount.forEach((count, index) => {
        groupLeafCount[index] = count + 1;
      });
    }
    doc = '';
  }
  return found;
}

/** The open measurement tasks the file lists above the table. */
const OPEN = new Set(
  TEXT.slice(0, TEXT.indexOf('export const tabBar'))
    .split('\n')
    .map(line => /^\s*\*\s+- (M-[A-Z0-9]+),/.exec(line)?.[1])
    .filter((id): id is string => id != null),
);

/** The JSDoc rules every sourced value follows. */
function expectSourced(key: string, doc: string) {
  // Each tag with its continuation lines folded onto it.
  const tags = doc
    .split(/\n(?=@)/)
    .map(tag => tag.replace(/\s*\n\s*/g, ' ').trim())
    .filter(tag => tag.startsWith('@'));
  const sources = tags.filter(tag => tag.startsWith('@source '));
  expect(sources.length, `${key} has no @source`).toBeGreaterThan(0);
  for (const source of sources) {
    expect(source, `${key}: unknown source kind`).toMatch(SOURCE_KINDS);
    if (source.startsWith('@source measured: ')) {
      expect(source, `${key}: a measurement needs its date`).toMatch(MEASURED);
    }
  }
  const measures = tags.filter(tag => tag.startsWith('@measure '));
  if (sources.some(source => /^@source (GUESS|webkit)/.test(source))) {
    expect(
      measures.length,
      `${key} is unconfirmed but names no @measure task`,
    ).toBeGreaterThan(0);
  }
  for (const measure of measures) {
    const id = /^@measure (M-[A-Z0-9]+)$/.exec(measure)?.[1];
    expect(id, `${key}: malformed ${measure}`).toBeDefined();
    expect(
      OPEN.has(id ?? ''),
      `${id} is not listed as an open measurement`,
    ).toBe(true);
  }
}

describe('TabBar UIKit table: every value is sourced', () => {
  const found = leaves();

  it('finds the table entries', () => {
    expect(found.length).toBeGreaterThan(20);
    expect(found.map(leaf => leaf.key)).toEqual(
      expect.arrayContaining(['barHeight', 'lensTravel', 'lensTrack']),
    );
    expect(Object.keys(tabBar)).toEqual(
      expect.arrayContaining(['barHeight', 'lensTravel', 'lensTrack']),
    );
  });

  it('lists only open measurements a value names', () => {
    for (const id of OPEN) {
      expect(TEXT, `${id} names no value`).toMatch(
        new RegExp(`@measure ${id}\\n`),
      );
    }
  });

  for (const {key, doc} of found) {
    it(key, () => {
      expect(
        PROVENANCE_KEYS.has(key),
        `${key}: a source belongs in the JSDoc, not in the value`,
      ).toBe(false);
      expectSourced(key, doc);
    });
  }

  it('ships no source in a value', () => {
    const code = TEXT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\b(source|guess|measure)\s*:/);
  });
});
