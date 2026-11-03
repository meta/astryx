// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MCP server tests.
 *
 * Validates the keyword-based search resolution and branding for the
 * MCP server route handler. Uses the same generated registries and keyword
 * index as the actual server.
 *
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {describe, it, expect} from 'vitest';
import {components} from '../generated/componentRegistry';
import {docTopics} from '../generated/docsRegistry';
import {templates} from '../generated/templateRegistry';
import {blocks} from '../generated/blockRegistry';
import {
  DEMO_CONTENT_MODULE,
  replaceDemoContent,
} from '../../../../packages/cli/foundation/discovery/template-adapter.mjs';

import type {ComponentEntry} from '../generated/componentRegistry';
import {buildKeywordIndex, resolveKeywords} from '../app/mcp/keywordIndex';

// ── Replicate MCP server logic for testing ─────────────────────────────
// The keyword index and its resolution are the route's own (keywordIndex.ts).
// The scoring below mirrors the runtime logic in
// apps/docsite/src/app/mcp/route.ts without importing the Next.js route
// handler directly.

const allComponents: ComponentEntry[] = Object.values(components).flat();
const visibleComponents = allComponents.filter(c => !c.hidden);

const keywordIndex = buildKeywordIndex(visibleComponents);

function score(text: string, query: string): number {
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  if (lower === queryLower) {
    return 100;
  }
  if (lower.startsWith(queryLower)) {
    return 90;
  }
  if (lower.includes(queryLower)) {
    return 85;
  }
  const words = queryLower.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) {
    return 0;
  }
  let matched = 0;
  for (const word of words) {
    if (lower.includes(word)) {
      matched++;
    }
  }
  const ratio = matched / words.length;
  if (ratio === 1) {
    return 75;
  }
  if (ratio >= 0.5) {
    return 50;
  }
  if (ratio > 0) {
    return 30;
  }
  return 0;
}

function simulateSearch(query: string, limit = 8) {
  const keywordMatches = resolveKeywords(keywordIndex, query);
  const scored: Array<{name: string; score: number; type: string}> = [];

  for (const comp of visibleComponents) {
    const nameScore = score(comp.name, query);
    const descScore = score(comp.description, query);
    const kwTextScore = Math.max(...comp.keywords.map(k => score(k, query)), 0);
    const kwBoost = keywordMatches.includes(comp.name) ? 90 : 0;
    let best = Math.max(nameScore, descScore, kwTextScore, kwBoost);

    // Demote sub-components so parent entries surface first
    if (best > 0 && comp.parentDoc && comp.name !== comp.parentDoc) {
      best = Math.min(best, best - 1);
    }

    if (best > 0) {
      scored.push({name: comp.name, score: best, type: 'component'});
    }
  }

  for (const doc of docTopics) {
    const best = Math.max(
      score(doc.topic, query),
      score(doc.title, query),
      score(doc.description, query),
      ...doc.sections.map(s => score(s.title, query) * 0.8),
      0,
    );
    if (best > 0) {
      scored.push({name: doc.topic, score: best, type: 'doc'});
    }
  }

  for (const t of templates) {
    const best = Math.max(score(t.name, query), score(t.description, query));
    if (best > 0) {
      scored.push({name: t.name, score: best, type: 'template'});
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('MCP keyword index', () => {
  it('builds a non-empty keyword index from component docs', () => {
    expect(keywordIndex.size).toBeGreaterThan(50);
  });

  it('Toast is indexed under "snackbar"', () => {
    expect(keywordIndex.get('snackbar')).toBeDefined();
    expect(keywordIndex.get('snackbar')).toContain('Toast');
  });

  it('Selector is indexed under "dropdown"', () => {
    expect(keywordIndex.get('dropdown')).toBeDefined();
    expect(keywordIndex.get('dropdown')).toContain('Selector');
  });

  it('Dialog is indexed under "modal"', () => {
    expect(keywordIndex.get('modal')).toBeDefined();
    expect(keywordIndex.get('modal')).toContain('Dialog');
  });

  it('no duplicate component names within a keyword entry', () => {
    for (const names of keywordIndex.values()) {
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('hidden components are excluded from the index', () => {
    const hiddenNames = allComponents.filter(c => c.hidden).map(c => c.name);
    const indexedNames = new Set([...keywordIndex.values()].flat());
    for (const name of hiddenNames) {
      expect(indexedNames.has(name)).toBe(false);
    }
  });
});

describe('MCP keyword resolution', () => {
  it('resolves "snackbar" to Toast', () => {
    const results = resolveKeywords(keywordIndex, 'snackbar');
    expect(results).toContain('Toast');
  });

  it('resolves "dropdown" to Selector', () => {
    const results = resolveKeywords(keywordIndex, 'dropdown');
    expect(results).toContain('Selector');
  });

  it('resolves "modal" to Dialog', () => {
    const results = resolveKeywords(keywordIndex, 'modal');
    expect(results).toContain('Dialog');
  });

  it('resolves multi-word queries by substring matching', () => {
    const results = resolveKeywords(keywordIndex, 'toast notification');
    expect(results).toContain('Toast');
  });

  it('returns empty for nonsense queries', () => {
    const results = resolveKeywords(keywordIndex, 'xyzzy12345');
    expect(results).toEqual([]);
  });

  it('deduplicates results', () => {
    // A query that matches multiple keywords for the same component
    const results = resolveKeywords(keywordIndex, 'select dropdown');
    const selectorCount = results.filter(r => r === 'Selector').length;
    expect(selectorCount).toBeLessThanOrEqual(1);
  });
});

describe('MCP search simulation', () => {
  it('finds Button by exact name', () => {
    const results = simulateSearch('Button');
    expect(results[0].name).toBe('Button');
    expect(results[0].score).toBe(100);
  });

  it('finds Toast via "snackbar" keyword', () => {
    const results = simulateSearch('snackbar');
    const toast = results.find(r => r.name === 'Toast');
    expect(toast).toBeDefined();
    // "snackbar" is an exact keyword on Toast → score("snackbar","snackbar") = 100
    expect(toast!.score).toBe(100);
  });

  it('finds Dialog via "modal"', () => {
    const results = simulateSearch('modal');
    const dialog = results.find(r => r.name === 'Dialog');
    expect(dialog).toBeDefined();
    // "modal" is an exact keyword on Dialog → score("modal","modal") = 100
    expect(dialog!.score).toBe(100);
  });

  it('ranks parent components above sub-components for keyword matches', () => {
    const results = simulateSearch('modal');
    const dialog = results.find(r => r.name === 'Dialog');
    const dialogHeader = results.find(r => r.name === 'DialogHeader');
    expect(dialog).toBeDefined();
    if (dialogHeader) {
      expect(dialog!.score).toBeGreaterThan(dialogHeader.score);
    }
  });

  it('finds doc topics by name', () => {
    const results = simulateSearch('spacing');
    const spacingDoc = results.find(
      r => r.type === 'doc' && r.name === 'spacing',
    );
    expect(spacingDoc).toBeDefined();
    expect(spacingDoc!.score).toBe(100);
  });

  it('returns results sorted by score descending', () => {
    const results = simulateSearch('button');
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('respects limit parameter', () => {
    const results = simulateSearch('button', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns empty for nonsense queries', () => {
    const results = simulateSearch('xyzzy12345nonsense');
    expect(results).toEqual([]);
  });
});

describe('MCP branding', () => {
  it('route file uses Astryx (XDS) in tool descriptions', async () => {
    const fs = await import('node:fs');
    const routePath = new URL('../app/mcp/route.ts', import.meta.url);
    const source = fs.readFileSync(routePath, 'utf-8');
    expect(source).toContain('Search Astryx (XDS) design system');
    expect(source).toContain('Astryx (XDS) component');
    expect(source).toContain("name: 'astryx'");
    // Should NOT have bare "XDS design system" in tool descriptions
    expect(source).not.toMatch(/`Search XDS design system/);
  });

  it('route file does not contain hardcoded ALIASES map', async () => {
    const fs = await import('node:fs');
    const routePath = new URL('../app/mcp/route.ts', import.meta.url);
    const source = fs.readFileSync(routePath, 'utf-8');
    expect(source).not.toContain('const ALIASES');
    expect(source).toContain('keywordIndex');
  });
});

describe('MCP get() example source (spec:AST-033 FR23)', () => {
  // get() returns `source` from these registries: a component's showcase and
  // one more example, and a template's examples or else its page source.
  it('hands out each block and template after the demo-content replacement', () => {
    const sources = [
      ...blocks.map(block => block.source),
      ...templates.map(template => template.source),
    ];
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source).not.toContain(DEMO_CONTENT_MODULE);
      expect(replaceDemoContent(source)).toEqual({
        source,
        demoContentReplaced: 0,
      });
    }
  });
});
