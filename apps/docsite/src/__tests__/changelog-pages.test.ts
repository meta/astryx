// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the changelog's packages, release pages and page URLs.
 *
 * Run: pnpm -F @astryxdesign/docsite test changelog-pages
 */

import {describe, expect, it} from 'vitest';
import {
  RELEASES_PER_PAGE,
  changelogPackages,
  changelogPage,
  changelogPageList,
  changelogPagePath,
  changelogSlugFromPath,
  defaultChangelogSlug,
  splitReleases,
} from '../lib/changelogPages';

/** A changelog with `count` releases, newest first: 0.0.<count> … 0.0.1. */
function changelog(name: string, count: number): string {
  const releases = Array.from(
    {length: count},
    (_, index) => `# 0.0.${count - index}\n\n- ${name} change ${count - index}`,
  );
  return `# ${name}\n\n${releases.join('\n\n---\n\n')}\n`;
}

const entries = [
  {pkg: '@astryxdesign/richtext', content: changelog('richtext', 2)},
  {pkg: '@astryxdesign/cli', content: changelog('cli', RELEASES_PER_PAGE)},
  {
    pkg: '@astryxdesign/theme-neutral',
    content: changelog('neutral', 3),
  },
  {
    pkg: '@astryxdesign/core',
    content: changelog('core', 2 * RELEASES_PER_PAGE + 1),
  },
];

describe('splitReleases', () => {
  it('returns one entry for each release, newest first, without the title or the separators', () => {
    expect(splitReleases(changelog('core', 3))).toEqual([
      '# 0.0.3\n\n- core change 3',
      '# 0.0.2\n\n- core change 2',
      '# 0.0.1\n\n- core change 1',
    ]);
  });

  it('keeps a release that has only its version heading', () => {
    expect(splitReleases('# pkg\n\n# 0.1.9\n\n---\n\n# 0.1.8\n')).toEqual([
      '# 0.1.9',
      '# 0.1.8',
    ]);
  });

  it('keeps a rule inside release notes with its release', () => {
    expect(
      splitReleases(
        '# pkg\n\n# 0.2.0\n\nBefore\n\n---\n\nAfter\n\n---\n\n# 0.1.0\n\nOld',
      ),
    ).toEqual(['# 0.2.0\n\nBefore\n\n---\n\nAfter', '# 0.1.0\n\nOld']);
  });
});

describe('changelogPackages', () => {
  it('orders core first and the CLI second, keeps the remaining order, and hides theme packages', () => {
    expect(changelogPackages(entries).map(pkg => pkg.name)).toEqual([
      '@astryxdesign/core',
      '@astryxdesign/cli',
      '@astryxdesign/richtext',
    ]);
  });

  it('gives the default package /changelog and each other package its own path', () => {
    expect(changelogPackages(entries).map(pkg => pkg.href)).toEqual([
      '/changelog',
      '/changelog/cli',
      '/changelog/richtext',
    ]);
  });

  it('counts pages of releases, with one page for a package that fits', () => {
    expect(changelogPackages(entries).map(pkg => pkg.pageCount)).toEqual([
      3, 1, 1,
    ]);
  });

  it('defaults to the first package when core has no changelog', () => {
    const withoutCore = entries.filter(e => e.pkg !== '@astryxdesign/core');
    expect(defaultChangelogSlug(withoutCore)).toBe('cli');
    expect(changelogPackages(withoutCore)[0]?.href).toBe('/changelog');
  });
});

describe('changelog page URLs', () => {
  it('names the page from the second page on', () => {
    expect(changelogPagePath('core', 1, 'core')).toBe('/changelog');
    expect(changelogPagePath('core', 2, 'core')).toBe('/changelog/core/2');
    expect(changelogPagePath('cli', 1, 'core')).toBe('/changelog/cli');
    expect(changelogPagePath('cli', 3, 'core')).toBe('/changelog/cli/3');
  });

  it('reads the package back from a changelog URL', () => {
    expect(changelogSlugFromPath('/changelog')).toBeNull();
    expect(changelogSlugFromPath('/changelog/cli')).toBe('cli');
    expect(changelogSlugFromPath('/changelog/core/2')).toBe('core');
    expect(changelogSlugFromPath('/docs/cli')).toBeNull();
  });

  it('lists every page of every displayed package', () => {
    expect(changelogPageList(entries)).toEqual([
      {slug: 'core', page: 1},
      {slug: 'core', page: 2},
      {slug: 'core', page: 3},
      {slug: 'cli', page: 1},
      {slug: 'richtext', page: 1},
    ]);
  });
});

describe('changelogPage', () => {
  it('holds only the newest releases on the first page', () => {
    const page = changelogPage(entries, [], 'core', 1);
    expect(page?.package.name).toBe('@astryxdesign/core');
    expect(page?.markdown).toContain('core change 11');
    expect(page?.markdown).toContain('core change 7');
    expect(page?.markdown).not.toContain('core change 6');
    expect(page?.markdown.match(/^# 0\.0\.\d+$/gm)).toHaveLength(
      RELEASES_PER_PAGE,
    );
  });

  it('continues on the next page where the page before stopped', () => {
    expect(changelogPage(entries, [], 'core', 2)?.markdown).toMatch(
      /^# 0\.0\.6\n/,
    );
    expect(changelogPage(entries, [], 'core', 3)?.markdown).toBe(
      '# 0.0.1\n\n- core change 1',
    );
  });

  it('shows every release exactly once across the pages', () => {
    const shown = [1, 2, 3].flatMap(
      page =>
        changelogPage(entries, [], 'core', page)?.markdown.match(
          /^# 0\.0\.\d+$/gm,
        ) ?? [],
    );
    expect(shown).toEqual(
      Array.from({length: 11}, (_, index) => `# 0.0.${11 - index}`),
    );
  });

  it('has no page for an unknown package, a theme package, or a page out of range', () => {
    expect(changelogPage(entries, [], 'nope', 1)).toBeNull();
    expect(changelogPage(entries, [], 'theme-neutral', 1)).toBeNull();
    expect(changelogPage(entries, [], 'core', 0)).toBeNull();
    expect(changelogPage(entries, [], 'core', 4)).toBeNull();
    expect(changelogPage(entries, [], 'core', 1.5)).toBeNull();
  });

  it('notes a release that has no changes, and links pull requests and components', () => {
    const page = changelogPage(
      [
        {
          pkg: '@astryxdesign/core',
          content:
            '# core\n\n# 0.1.9\n\n---\n\n# 0.1.8\n\n- Button: fixed (#123)\n',
        },
      ],
      ['Button'],
      'core',
      1,
    );
    expect(page?.markdown).toContain('_No changes in this release._');
    expect(page?.markdown).toContain('/pull/123');
    expect(page?.markdown).toContain('/components/Button');
  });
});
