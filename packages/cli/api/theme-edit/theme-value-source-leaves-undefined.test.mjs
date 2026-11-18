// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A value the theme's own source leaves undefined is not set
 * wherever it is (a token on the page, in onDark or an adaptation rule, a
 * part, a style key, a property), as Core builds it: the editor takes it
 * and the build writes nothing for it. A part given null is refused at its
 * line, never a crash.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-value-source-leaves-undefined-',
    FIXTURE_PACKAGES,
  );
  // A base that styles the parts, so a part's values merge over the
  // base's, as the real neutral theme's do.
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * A new theme on neutral whose own source gives these lines after its name.
 * @param {string} slug @param {string} lines
 */
const withOwn = async (slug, lines) => {
  await themeEditNew(slug, {cwd, like: 'neutral'});
  const ts = path.join(cwd, 'themes', slug, `${slug}.theme.ts`);
  fs.writeFileSync(
    ts,
    fs
      .readFileSync(ts, 'utf8')
      .replace(`name: '${slug}',`, `name: '${slug}',\n${lines}`),
  );
};

/** @param {string} slug */
const compile = slug =>
  runCli(
    ['experimental', 'theme', 'compile', `themes/${slug}/${slug}.theme.ts`],
    {cwd},
  );

/** The theme's built stylesheet. @param {string} slug */
const css = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

describe('undefined is not set', () => {
  it('takes an undefined token in onDark and in an adaptation rule', async () => {
    await withOwn(
      'ud',
      "  onDark: {tokens: {'--color-accent': undefined}},\n  adaptations: {rules: [{when: {pointer: 'coarse'}, value: {tokens: {'--spacing-4': undefined, '--spacing-2': '3px'}}}]},",
    );
    const c = await compile('ud');
    expect(c.status, c.stdout + c.stderr).toBe(0);
    await themeEditShow('ud', {cwd});
    expect(css('ud')).not.toMatch(/:\s*undefined;/);
    expect(css('ud')).toMatch(/--spacing-2:\s*3px;/);
  }, 240_000);

  it('takes an undefined part, style key and property, and builds nothing for them', async () => {
    await withOwn(
      'up',
      "  components: {card: undefined, button: {selected: undefined, base: {backgroundColor: undefined, color: 'red'}}} as any,",
    );
    const c = await compile('up');
    expect(c.status, c.stdout + c.stderr).toBe(0);
    expect(c.stdout + c.stderr).not.toMatch(/TypeError|Cannot convert/);
    await themeEditShow('up', {cwd});
    expect(css('up')).not.toMatch(/:\s*undefined;/);
    expect(css('up')).toMatch(/color:\s*red;/);
  }, 240_000);

  it('refuses a part given null at its line, at the root and in onDark', async () => {
    for (const [slug, lines, label] of /** @type {const} */ ([
      ['na', '  components: {button: null} as any,', 'components button'],
      [
        'nb',
        '  onDark: {components: {card: null}} as any,',
        'onDark\\.components card',
      ],
    ])) {
      await withOwn(slug, lines);
      const c = await compile(slug);
      expect(c.status).toBe(1);
      const what = new RegExp(
        `${label} \\(line \\d+\\): \\w+ holds null, which the build cannot read as a part's style keys`,
      );
      expect(c.stdout + c.stderr).toMatch(what);
      expect(c.stdout + c.stderr).not.toMatch(/ERR_UNKNOWN|TypeError/);
      const s = await refusal(() => themeEditShow(slug, {cwd}));
      expect(s.message).toMatch(what);
    }
  }, 240_000);
});
