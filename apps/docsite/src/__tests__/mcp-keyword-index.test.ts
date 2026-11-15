// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mcp-keyword-index.test.ts
 * @input The MCP route's keyword index (app/mcp/keywordIndex.ts) and fixture
 *   docs whose keywords include names that a plain object inherits
 * @output Checks that each keyword is its own entry and resolves to its
 *   component
 * @position Docsite tests; run with `pnpm -F @astryxdesign/docsite test`
 */

import {describe, expect, it} from 'vitest';
import {buildKeywordIndex, resolveKeywords} from '../app/mcp/keywordIndex';

const docs = [
  {name: 'Builder', keywords: ['constructor', 'factory']},
  {name: 'Prototype', keywords: ['__proto__']},
  {name: 'Printer', keywords: ['toString', 'factory']},
];

describe('MCP keyword index over keywords a plain object inherits', () => {
  it('indexes each keyword as its own entry', () => {
    const index = buildKeywordIndex(docs);
    expect(index.get('constructor')).toEqual(['Builder']);
    expect(index.get('__proto__')).toEqual(['Prototype']);
    expect(index.get('tostring')).toEqual(['Printer']);
    expect(index.get('factory')).toEqual(['Builder', 'Printer']);
    expect(index.get('valueof')).toBeUndefined();
  });

  it('resolves a query that names one of them to its component', () => {
    const index = buildKeywordIndex(docs);
    expect(resolveKeywords(index, 'Constructor')).toEqual(['Builder']);
    expect(resolveKeywords(index, '__proto__')).toEqual(['Prototype']);
    expect(resolveKeywords(index, 'a factory')).toEqual(['Builder', 'Printer']);
    expect(resolveKeywords(index, 'hasOwnProperty')).toEqual([]);
  });
});
