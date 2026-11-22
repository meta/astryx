// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A docs route that skips a level. When the typed route reaches a
 * namespace and the rest names exactly one page further down, by its last
 * route segment or its title, that page is suggested right after a child the
 * route names, or first, and the namespace's children follow, all of them.
 *
 * @input routes into the built-in docs tree
 * @output assertions on the docs() not-found error
 * @position api/docs/ beside the docs dispatcher tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {withPageBelow} from './_adapter.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-docs-page-below-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'bare'}),
  );
});

afterEach(() => fs.rmSync(tmpDir, {recursive: true, force: true}));

/** @param {string} route */
const miss = route => docs(route, undefined, {cwd: tmpDir}).catch(e => e);

describe('a route that skips a level', () => {
  it(
    'suggests the one page further down first, then every child',
    async () => {
      const children = (await miss('authoring/zz-nothing-here')).suggestions;
      const error = await miss('authoring/define-the-theme');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(error.suggestions[0].name).toBe(
        'authoring/building-blocks/themes/define-the-theme',
      );
      expect(
        error.suggestions
          .slice(1)
          .map(s => s.name)
          .sort(),
      ).toEqual(children.map(s => s.name).sort());
    },
    SLOW,
  );

  it(
    'keeps a child the route names first, and the page further down second',
    async () => {
      const error = await miss('authoring/building-blocks/add-a-component');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(error.suggestions[0].name).toBe(
        'authoring/building-blocks/components',
      );
      expect(error.suggestions[1].name).toBe(
        'authoring/building-blocks/components/add-a-component',
      );
    },
    SLOW,
  );

  it(
    'lists a child once, first, when the route names it and the rest names it too',
    async () => {
      const error = await miss('authoring/ship/check-an-integration');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(error.suggestions[0].name).toBe('authoring/ship/checks');
      const names = error.suggestions.map(s => s.name);
      expect(new Set(names).size).toBe(names.length);
    },
    SLOW,
  );

  it(
    'never suggests an experimental page this way',
    async () => {
      const error = await miss('cli/share-a-page');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(
        error.suggestions.some(s => s.name.startsWith('cli/experimental/')),
      ).toBe(false);
    },
    SLOW,
  );

  it(
    'adds nothing when no page further down has the name',
    async () => {
      const error = await miss('authoring/zz-nothing-here');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(
        error.suggestions.every(
          s =>
            s.name.split('/').length === 2 && s.name.startsWith('authoring/'),
        ),
      ).toBe(true);
    },
    SLOW,
  );
});

describe('withPageBelow', () => {
  const page = {name: 'kit/zorb/guide-zorb'};

  it('puts the page first when the route-order lead is not named, even if a named child leads by title', () => {
    const byRoute = [{name: 'kit/alpha'}, {name: 'kit/guide'}];
    const ordered = [{name: 'kit/guide'}, {name: 'kit/alpha'}];
    expect(
      withPageBelow('kit/guide-zorb', byRoute, ordered, [page]).map(
        e => e.name,
      ),
    ).toEqual(['kit/zorb/guide-zorb', 'kit/guide', 'kit/alpha']);
  });

  it('keeps a named route-order lead first, the page second', () => {
    const byRoute = [{name: 'kit/guide'}, {name: 'kit/alpha'}];
    expect(
      withPageBelow('kit/guide-zorb', byRoute, byRoute, [page]).map(
        e => e.name,
      ),
    ).toEqual(['kit/guide', 'kit/zorb/guide-zorb', 'kit/alpha']);
  });
});
