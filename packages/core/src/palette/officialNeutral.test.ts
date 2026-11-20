// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file officialNeutral.test.ts
 * @input The official Neutral theme's source and the palette mapping's
 *   table of its stops
 * @output Proof that the mapping's table equals the stops and lifted parts
 *   the Neutral theme writes
 * @position Drift guard for OFFICIAL_NEUTRAL_STOPS and OFFICIAL_NEUTRAL_LIFTED
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseSync} from '@babel/core';
import {expect, it} from 'vitest';
import {OFFICIAL_NEUTRAL_LIFTED, OFFICIAL_NEUTRAL_STOPS} from './mapping';

type Node = {type?: string; [key: string]: unknown};
type Stop = {stop: number; alpha?: string};

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  path.resolve(here, '../../../themes/neutral/src/neutralTheme.ts'),
  'utf8',
);

/** A palette reference, `<family>.<mode>[N]` or `withAlpha(…, 'aa')`. */
function stopOf(node: Node | undefined): Stop | null {
  if (
    node?.type === 'CallExpression' &&
    (node.callee as Node).name === 'withAlpha'
  ) {
    const [inner, alpha] = node.arguments as Node[];
    const stop = stopOf(inner);
    return stop && typeof alpha.value === 'string'
      ? {...stop, alpha: alpha.value.toLowerCase()}
      : null;
  }
  const property = node?.property as Node | undefined;
  const object = node?.object as Node | undefined;
  return node?.type === 'MemberExpression' &&
    node.computed === true &&
    property?.type === 'NumericLiteral' &&
    ['light', 'dark'].includes(String((object?.property as Node)?.name))
    ? {stop: property.value as number}
    : null;
}

it('equals the stops and lifted parts the official Neutral theme writes', () => {
  const stops: Record<string, Stop[]> = {};
  const lifted: [string, string][] = [];
  const visit = (node: unknown, keys: string[]): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const n = node as Node;
    if (n.type === 'ObjectProperty') {
      const raw = (n.key as Node).name ?? (n.key as Node).value;
      const key =
        typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
      const value = n.value as Node;
      if (keys.at(-1) === 'tokens' && value.type === 'ArrayExpression') {
        const pair = (value.elements as Node[]).map(stopOf);
        if (pair.length === 2 && pair.every(Boolean)) {
          stops[key] = pair as Stop[];
        }
      } else if (keys.at(-1) === 'tokens') {
        const one = stopOf(value);
        if (one) {
          stops[key] = [one, one];
        }
      }
      if (keys.at(-3) === 'components' && key === '--color-text-secondary') {
        lifted.push([keys.at(-2) ?? '', keys.at(-1) ?? '']);
      }
      visit(value, [...keys, key]);
      return;
    }
    for (const [k, v] of Object.entries(n)) {
      if (k !== 'loc' && k !== 'start' && k !== 'end') {
        for (const x of Array.isArray(v) ? v : [v]) {
          visit(x, keys);
        }
      }
    }
  };
  const ast = parseSync(source, {
    babelrc: false,
    configFile: false,
    filename: 'neutralTheme.ts',
    parserOpts: {sourceType: 'module', plugins: ['typescript']},
  });
  visit(ast?.program, []);
  for (const [token, pair] of Object.entries(OFFICIAL_NEUTRAL_STOPS)) {
    expect(stops[token], token).toEqual(pair);
  }
  expect(lifted).toEqual(OFFICIAL_NEUTRAL_LIFTED.map(([a, b]) => [a, b]));
});
