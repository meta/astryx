// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A page template's weak keywords are read from its syntax only when a
 * term could match one of them. The bound that decides it never changes a
 * score or a ranking.
 *
 * @input the repository's page templates, and small sources for the edges
 * @output equal scores and rankings with and without the bound; parse counts
 * @position packages/cli/api/search — the template gatherer
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {
  componentNameBound,
  componentsInSource,
} from '../../foundation/discovery/template-adapter.mjs';
import {gatherTemplates} from './_gather-templates.mjs';
import {scoreCandidate} from './_candidate-score.mjs';
import {rankLexical} from './_lexical.mjs';
import {wordsOf} from './_words.mjs';

const REPO = fs.realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
);
const babel = createRequire(import.meta.url)('@babel/parser');

/** @type {any[]} */
let templates;
/** @type {any[]} */
let pages;

beforeAll(async () => {
  templates = await gatherTemplates(REPO);
  pages = templates.filter(t => t._kind === 'page');
});

afterEach(() => vi.restoreAllMocks());

/**
 * The same page with its weak keywords read up front and no bound.
 * @param {any} page
 */
function unbounded(page) {
  const {weakKeywordBound: _bound, ...rest} = page;
  return {...rest, weakKeywords: [...page.weakKeywords]};
}

/** Terms that match the pages' derived names, nearly match them, or miss. */
function termsFor() {
  const words = new Set(['zzqqxx', 'quokka', 'button', 'buttons', 'table']);
  for (const word of ['chart', 'dashboard', 'settings', 'list', 'card']) {
    words.add(word);
  }
  for (const page of pages.slice(0, 12)) {
    for (const name of page.weakKeywords) {
      for (const word of wordsOf(name)) {
        words.add(word);
        words.add(`${word}s`);
        if (word.length > 5) words.add(word.slice(0, 5));
      }
    }
  }
  return [...words];
}

describe('the weak-keyword bound of a page template', () => {
  it('lets the gather and a term no page renders skip the parse', async () => {
    const parse = vi.spyOn(babel, 'parse');
    const gathered = await gatherTemplates(REPO);
    const gatheredPages = gathered.filter(t => t._kind === 'page');
    expect(gatheredPages.length).toBeGreaterThan(20);
    expect(parse).not.toHaveBeenCalled();
    for (const page of gatheredPages) scoreCandidate('zzqqxx', page);
    // Only a page whose source defeats the bound (an escape) is parsed.
    const unboundedPages = gatheredPages.filter(p => !p.weakKeywordBound);
    expect(parse).toHaveBeenCalledTimes(unboundedPages.length);
    expect(unboundedPages.length).toBeLessThan(gatheredPages.length / 4);
  });

  it('holds every derived name of every page', () => {
    for (const page of pages) {
      if (!page.weakKeywordBound) continue;
      for (const name of page.weakKeywords) {
        expect(page.weakKeywordBound, page.name).toContain(name);
      }
    }
  });

  it('gives every term the same score as reading the names up front', () => {
    const terms = termsFor();
    expect(terms.length).toBeGreaterThan(40);
    for (const page of pages) {
      const plain = unbounded(page);
      for (const term of terms) {
        expect(scoreCandidate(term, page), `${page.name}: ${term}`).toEqual(
          scoreCandidate(term, plain),
        );
      }
    }
  });

  it('ranks templates the same as reading the names up front', () => {
    const plain = templates.map(t => (t._kind === 'page' ? unbounded(t) : t));
    const catalog = /** @param {any[]} all */ all => ({
      all,
      components: [],
      searchedComponents: false,
      outside: false,
      coreSkipped: null,
    });
    for (const query of [
      'settings page with tabs',
      'data table with filters',
      'kanban board',
      'buttons',
      'zzqqxx',
      'chat',
    ]) {
      const options = {cwd: REPO, type: 'template', limit: 50};
      expect(rankLexical(query, options, catalog(templates)), query).toEqual(
        rankLexical(query, options, catalog(plain)),
      );
    }
  });
});

describe('componentNameBound', () => {
  /** @param {string} src */
  const expectBound = src => {
    const bound = componentNameBound(src);
    expect(bound).not.toBeNull();
    for (const name of componentsInSource(src)) expect(bound).toContain(name);
    return bound;
  };

  it('holds the names of a page with no Astryx import', () => {
    expectBound(
      "import {Foo as Bar} from 'other';\nexport default () => <Bar><Baz /></Bar>;",
    );
  });

  it('holds the imported name a renamed import gives a tag', () => {
    const bound = expectBound(
      "import {Avatar as Av} from '@astryxdesign/core';\nexport default () => <Av />;",
    );
    expect(bound).toContain('Avatar');
  });

  it('reads a name imported as a string, and comments between the words', () => {
    expect(
      expectBound(
        "import {'Avatar' as Av} from '@astryxdesign/core';\nexport default () => <Av />;",
      ),
    ).toContain('Avatar');
    expect(
      expectBound(
        "import {Tokenizer /* a */ as // b\n Tok} from '@astryxdesign/core';\nexport default () => <Tok />;",
      ),
    ).toContain('Tokenizer');
  });

  it('reads a renamed import after a comment in an earlier import', () => {
    expect(
      expectBound(
        [
          "import {Card /* card */} from '@astryxdesign/core';",
          "import {Avatar /* user */ as Av} from '@astryxdesign/core';",
          'export default () => (',
          '  <Card>',
          '    <Av />',
          '  </Card>',
          ');',
        ].join('\n'),
      ),
    ).toContain('Avatar');
  });

  it('steps past a pair that starts with an astral letter', () => {
    expect(
      expectBound(
        [
          "import {Beta} from '@astryxdesign/core';",
          '// 𝐀 as Beta',
          'export default () => <Beta />;',
        ].join('\n'),
      ),
    ).toContain('Beta');
  });

  it('reads a run of line comments that hold links in one pass', () => {
    const links = Array.from(
      {length: 40},
      (_, i) => `// See https://example.com/notes/${i} for more.`,
    );
    expect(
      expectBound(
        [
          "import {Card} from '@astryxdesign/core';",
          'const label = title',
          ...links,
          'export default () => <Card />;',
        ].join('\n'),
      ),
    ).toContain('Card');
  });

  it('leaves a source with a very long run of comments to the parse', () => {
    const notes = Array.from(
      {length: 1000},
      (_, i) => `// note ${i} about thing`,
    );
    const src = [
      "import {Card} from '@astryxdesign/core';",
      'const label = title',
      ...notes,
      'export default () => <Card />;',
    ].join('\n');
    expect(componentNameBound(src)).toBeNull();
  });

  it('reads a renamed import after an "as /*" in a comment', () => {
    expect(
      expectBound(
        [
          '// Shown as /* in the docs.',
          "import {Avatar as Av} from '@astryxdesign/core';",
          '/** A later doc comment. */',
          'export default () => <Av />;',
        ].join('\n'),
      ),
    ).toContain('Avatar');
  });

  it('keeps a name the parse drops as page-local', () => {
    expect(
      expectBound(
        'function TimelineSection() {\n  return null;\n}\nexport default () => <TimelineSection />;',
      ),
    ).toContain('Timeline');
  });

  it('is null for a source with an escape it cannot read', () => {
    expect(
      componentNameBound(
        "import {\\u0041vatar as Av} from '@astryxdesign/core';\nexport default () => <Av />;",
      ),
    ).toBeNull();
    expect(
      componentNameBound(
        "import {'Av\\x61tar' as Av} from '@astryxdesign/core';\nexport default () => <Av />;",
      ),
    ).toBeNull();
  });
});
