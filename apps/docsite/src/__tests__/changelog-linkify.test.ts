// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for the changelog markdown linkifiers.
 *
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {describe, it, expect} from 'vitest';
import {
  linkifyPRs,
  linkifyContributors,
  linkifyComponents,
  addEmptyReleasePlaceholders,
  stripTitle,
} from '../components/changelogLinkify';

describe('linkifyPRs', () => {
  it('links bare PR references', () => {
    expect(linkifyPRs('Fix spinner (#2717)')).toBe(
      'Fix spinner ([#2717](https://github.com/meta/astryx/pull/2717))',
    );
  });

  it('leaves already-linked references untouched', () => {
    const already = '[#2717](https://github.com/meta/astryx/pull/2717)';
    expect(linkifyPRs(already)).toBe(already);
  });
});

describe('linkifyContributors', () => {
  it('links standalone contributor bullets to GitHub profiles', () => {
    const input = ['- @cixzhang', '- @marie-lucas', '- @nynexman4464'].join(
      '\n',
    );
    expect(linkifyContributors(input)).toBe(
      [
        '- [@cixzhang](https://github.com/cixzhang)',
        '- [@marie-lucas](https://github.com/marie-lucas)',
        '- [@nynexman4464](https://github.com/nynexman4464)',
      ].join('\n'),
    );
  });

  it('does not touch scoped package-name bullets', () => {
    const input = '- @astryxdesign/core';
    expect(linkifyContributors(input)).toBe(input);
  });

  it('does not touch inline @ mentions inside prose', () => {
    const input = '- Thanks to @cixzhang for the fix';
    expect(linkifyContributors(input)).toBe(input);
  });

  it('handles handles with hyphens but not leading/trailing ones', () => {
    expect(linkifyContributors('- @marie-lucas')).toBe(
      '- [@marie-lucas](https://github.com/marie-lucas)',
    );
  });

  it('preserves the blank line separating the contributor list from the next block', () => {
    const input = ['- @cixzhang', '', '---', '', '# 0.1.0'].join('\n');
    expect(linkifyContributors(input)).toBe(
      [
        '- [@cixzhang](https://github.com/cixzhang)',
        '',
        '---',
        '',
        '# 0.1.0',
      ].join('\n'),
    );
  });
});

describe('linkifyComponents', () => {
  it('links bare and XDS-prefixed component names', () => {
    const names = ['Button'];
    expect(linkifyComponents('Use Button here', names)).toBe(
      'Use [Button](/components/Button) here',
    );
    expect(linkifyComponents('Use XDSButton here', names)).toBe(
      'Use [XDSButton](/components/Button) here',
    );
  });

  it('does not link inside code spans or existing links', () => {
    const names = ['Button'];
    expect(linkifyComponents('`Button`', names)).toBe('`Button`');
    expect(linkifyComponents('[Button](/x)', names)).toBe('[Button](/x)');
  });

  it('skips a name anywhere inside a code span, not just against the ticks', () => {
    const names = ['Theme', 'Button'];
    expect(linkifyComponents('Wrap your app in `<Theme>`.', names)).toBe(
      'Wrap your app in `<Theme>`.',
    );
    expect(linkifyComponents("`import {Button} from 'x'`", names)).toBe(
      "`import {Button} from 'x'`",
    );
  });

  it('skips a name anywhere inside an existing link, not just against the brackets', () => {
    const names = ['Button'];
    const codeLabel = '[`<Button>`](/components/Button)';
    expect(linkifyComponents(codeLabel, names)).toBe(codeLabel);
    const inHref = '[the docs](/components/Button)';
    expect(linkifyComponents(inHref, names)).toBe(inHref);
  });

  it('skips names inside fenced code blocks', () => {
    const names = ['Button'];
    const md = ['```tsx', '<Button label="Save" />', '```'].join('\n');
    expect(linkifyComponents(md, names)).toBe(md);
  });

  it('still links the prose around a skipped span', () => {
    const names = ['Button', 'Card'];
    expect(linkifyComponents('A Card wraps `<Button>` here', names)).toBe(
      'A [Card](/components/Card) wraps `<Button>` here',
    );
  });

  it('emits a monospace label when asked, and a plain one by default', () => {
    const names = ['Button'];
    expect(linkifyComponents('Use Button', names, {monospace: true})).toBe(
      'Use [`Button`](/components/Button)',
    );
    expect(linkifyComponents('Use Button', names)).toBe(
      'Use [Button](/components/Button)',
    );
  });
});

describe('addEmptyReleasePlaceholders', () => {
  it('labels an empty release without hiding populated releases', () => {
    const input = [
      '# 0.4.5',
      '',
      '---',
      '',
      '# 0.4.4',
      '',
      '#### Fixes',
      '',
      '- Fixed the CLI.',
    ].join('\n');

    expect(addEmptyReleasePlaceholders(input)).toBe(
      [
        '# 0.4.5',
        '',
        '_No changes in this release._',
        '',
        '---',
        '',
        '# 0.4.4',
        '',
        '#### Fixes',
        '',
        '- Fixed the CLI.',
      ].join('\n'),
    );
  });

  it('fills the final empty release when there is no trailing separator', () => {
    expect(addEmptyReleasePlaceholders('# 0.4.2')).toBe(
      '# 0.4.2\n\n_No changes in this release._',
    );
  });

  it('leaves a populated release unchanged', () => {
    const input = [
      '# 0.4.3',
      '',
      '#### Fixes',
      '',
      '- A real fix.',
      '',
      '---',
      '',
      '# 0.4.2',
      '',
      '#### Fixes',
      '',
      '- Another real fix.',
    ].join('\n');

    expect(addEmptyReleasePlaceholders(input)).toBe(input);
  });
});

describe('stripTitle', () => {
  it('removes the leading h1 title line', () => {
    expect(stripTitle('# @astryxdesign/core\n\n# 0.1.1\n')).toBe('# 0.1.1\n');
  });
});

describe('full changelog pipeline', () => {
  it('linkifies contributors without mangling package bullets or PRs', () => {
    const md = [
      '#### Fixes',
      '',
      '- Fix Button spinner (#2717)',
      '- @astryxdesign/core import note',
      '',
      '#### Contributors',
      '',
      '- @cixzhang',
      '- @ejhammond',
    ].join('\n');

    const out = linkifyContributors(linkifyPRs(md));
    expect(out).toContain(
      '[#2717](https://github.com/meta/astryx/pull/2717)',
    );
    expect(out).toContain('[@cixzhang](https://github.com/cixzhang)');
    expect(out).toContain('[@ejhammond](https://github.com/ejhammond)');
    // Scoped package bullet must remain a plain bullet.
    expect(out).toContain('- @astryxdesign/core import note');
    expect(out).not.toContain('[@astryxdesign');
  });
});
