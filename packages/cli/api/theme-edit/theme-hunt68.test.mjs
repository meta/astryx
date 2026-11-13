// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt68: `editor how` scope and semantics: a fill made lighter or
 * darker from the part's own fill at rest; "except" keeps every excepted
 * part's value now; sub-parts and catalog parts named in words;
 * comparisons copy the other part's value onto the subject only; each
 * clause keeps its own variant; a bare size in a text list; every heading
 * level scaled from its own size; a font stack kept whole; padding sides;
 * a part named with a state word; a typed theme name near one keeps the
 * question.
 *
 * @position api/theme-edit — tests
 */

import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {exactFactor, shiftKeepAlpha} from './_how-question.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt68-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
  await themeEditNew('brand', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The first answer with a change: its commands (all, in a sequence) and text. @param {string} q */
const top = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'q'});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    all: (r ? (r.sequence ? r.commands : [r.commands[0]]) : [])
      .map(c => c.replace(/^.* editor /, ''))
      .join('\n'),
    text: r?.text ?? '',
    every: (data.results ?? []).map(x => x.text).join('\n'),
  };
};

const T = 120_000;

describe('hunt68 lighter or darker fills', () => {
  it(
    'a button starts from its fill at rest, not the pressed overlay',
    async () => {
      const r = await top('make the button background a bit lighter');
      expect(r.text).toMatch(/background on button, from --color-accent/);
    },
    T,
  );
  it('a see-through fill stays see-through, and lighter is fainter ink', () => {
    expect(shiftKeepAlpha('#0000000f', 0.12)).toMatch(/^#000000[0-9a-f]{2}$/);
    expect(
      parseInt(String(shiftKeepAlpha('#0000000f', 0.12)).slice(7), 16),
    ).toBeLessThan(0x0f);
    expect(
      parseInt(String(shiftKeepAlpha('#ffffff1a', 0.12)).slice(7), 16),
    ).toBeGreaterThan(0x1a);
  });
});

describe('hunt68 except', () => {
  it(
    'the excepted dialog keeps its shadow',
    async () => {
      const r = await top('remove shadows everywhere except dialogs');
      expect(r.all).toMatch(/box-shadow '.+' --on dialog/);
      expect(r.all).not.toMatch(/box-shadow none --on dialog/);
    },
    T,
  );
  it(
    'headings are not pinned lighter',
    async () => {
      const r = await top('make everything bolder except headings');
      expect(r.all).not.toMatch(/font-weight 400 --on heading/);
    },
    T,
  );
  it(
    'two excepted parts in one answer',
    async () => {
      const r = await top('make everything rounder except buttons and cards');
      expect(r.all).toMatch(/--on button/);
      expect(r.all).toMatch(/--on card/);
    },
    T,
  );
  it(
    'an excepted variant',
    async () => {
      const r = await top('make all buttons except primary ones rounder');
      expect(r.all).toMatch(/--on button --when variant:primary/);
    },
    T,
  );
  it(
    'a place is said, not dropped',
    async () => {
      const {data} = await themeEditHow('make links red except in the nav', {
        cwd,
        theme: 'q',
      });
      expect(data.results.map(x => x.text).join('\n')).toContain(
        'names no part the editor can keep apart',
      );
    },
    T,
  );
});

describe('hunt68 parts named in words', () => {
  it.each(
    /** @type {Array<[string, RegExp]>} */ ([
      ['dialog header gray', /--on dialog-header$/],
      ['dialog title bigger', /--on dialog-header-title-block$/],
      ['text inputs rounder', /--on text-input/],
      ['date pickers rounder', /--on date-input/],
      ['toggle buttons bold', /--on toggle-button$/],
      ['code block header bold', /--on code-block-header$/],
      ['select boxes rounder', /--on selector/],
      ['hover card background gray', /--on hover-card$/],
    ]),
  )(
    '%s',
    async (q, want) => {
      expect((await top(q)).all).toMatch(want);
    },
    T,
  );
  it(
    'dialog header and footer stay the dialog',
    async () => {
      expect((await top('dialog header and footer gray')).all).not.toMatch(
        /layout-footer/,
      );
    },
    T,
  );
  it(
    'a sub-part Core lacks says so',
    async () => {
      const r = await top('card header background gray');
      expect(r.text).toContain('Core has no card header part of its own');
    },
    T,
  );
  it(
    'switches is the switch',
    async () => {
      const r = await themeEditHow('switches rounder', {cwd, theme: 'q'});
      expect(JSON.stringify(r.data)).toContain('switch');
      expect(JSON.stringify(r.data)).not.toContain('no part is called');
    },
    T,
  );
});

describe('hunt68 comparisons', () => {
  it(
    'as round as: the subject only takes the other part value',
    async () => {
      const r = await top('cards as round as buttons');
      expect(r.all).toMatch(/^set q border-radius .+ --on card$/);
    },
    T,
  );
  it(
    'the same padding: padding, never a gap',
    async () => {
      const r = await top('card padding the same as button padding');
      expect(r.all).toMatch(/^set q padding .+ --on card$/);
    },
    T,
  );
});

describe('hunt68: lists, levels, stacks, sides', () => {
  it(
    'each clause keeps its own variant',
    async () => {
      const r = await top('make primary buttons red and the secondary blue');
      expect(r.all).toMatch(/--when variant:secondary/);
    },
    T,
  );
  it(
    'a bare size in a text list',
    async () => {
      const r = await top('make buttons bold, uppercase and 14px');
      expect(r.all).toMatch(/font-size 14px --on button/);
    },
    T,
  );
  it(
    'every heading level from its own size',
    async () => {
      const r = await top('make headings 20% bigger');
      expect(r.all).toMatch(/--text-heading-1-size/);
      expect(r.all).toMatch(/--text-heading-2-size/);
    },
    T,
  );
  it(
    'a font stack whole on the part',
    async () => {
      const r = await top('card font Inter, sans-serif');
      expect(r.all).toBe("set q font-family 'Inter, sans-serif' --on card");
    },
    T,
  );
  it(
    'card text lighter and dialog text twice as big',
    async () => {
      expect((await top('make the card text lighter')).all).toMatch(
        /color .+ --on card/,
      );
      expect((await top('make the dialog text twice as big')).all).toMatch(
        /font-size .+ --on dialog/,
      );
    },
    T,
  );
  it(
    'padding sides',
    async () => {
      expect((await top('padding top 12px on cards')).all).toBe(
        'set q padding-top 12px --on card',
      );
      expect((await top('horizontal padding 20px on buttons')).all).toBe(
        'set q padding-inline 20px --on button',
      );
    },
    T,
  );
});

describe('padding sides are read outside part names', () => {
  it(
    'code block padding is all sides of the code block',
    async () => {
      expect((await top('code block padding 12px')).all).toBe(
        'set q padding 12px --on code-block',
      );
    },
    T,
  );
  it(
    'top nav padding is all sides of the top nav',
    async () => {
      expect((await top('top nav padding 20px')).all).toBe(
        'set q padding 20px --on top-nav',
      );
    },
    T,
  );
});

describe('inline and block name a side only beside the padding', () => {
  it(
    'inline code and block quote padding are all sides of those parts',
    async () => {
      expect((await top('inline code padding 4px')).all).toBe(
        'set q padding 4px --on code',
      );
      expect((await top('block quote padding 8px')).all).toBe(
        'set q padding 8px --on blockquote',
      );
      expect((await top('code block padding 12px')).all).toBe(
        'set q padding 12px --on code-block',
      );
    },
    T,
  );
  it(
    'inline or vertical beside padding is the side',
    async () => {
      expect((await top('inline padding 10px on cards')).all).toBe(
        'set q padding-inline 10px --on card',
      );
      expect((await top('padding 8px vertical on cards')).all).toBe(
        'set q padding-block 8px --on card',
      );
    },
    T,
  );
});

describe('bigger or smaller than another part', () => {
  it(
    'is a step past the other part value, never a copy',
    async () => {
      const r = await top(
        'I would like card padding bigger than button padding',
      );
      expect(r.all).toMatch(/^set q padding \S+ --on card$/);
      expect(r.text).toContain("a step past button's");
      const under = await top('card padding smaller than button padding');
      expect(under.text).toContain("a step under button's");
    },
    T,
  );
});

describe('a dimension pair is a size', () => {
  it('16 x 16 is not sixteen times', () => {
    expect(exactFactor('icons 16 x 16')).toBeNull();
    expect(exactFactor('24x24px icons')).toBeNull();
    expect(exactFactor('2x bigger')).toBe(2);
  });
});

describe('hunt68: a second part with an ask of its own', () => {
  it(
    'keeps its own ask, not the first part',
    async () => {
      const r = await top('make the text bigger on buttons and cards red');
      expect(r.all).toMatch(/--on button/);
      expect(r.all).toMatch(/background '#dc2626' --on card/);
    },
    T,
  );
});

describe('hunt68 a theme name near the typed one', () => {
  it(
    'suggests the same question with the right name',
    () => {
      const r = spawnSync(
        process.execPath,
        [
          path.resolve(import.meta.dirname, '../../clients/cli/bin/astryx.mjs'),
          'experimental',
          'theme',
          'editor',
          'how',
          'buttons rounder',
          '--theme',
          'brnad',
        ],
        {cwd, encoding: 'utf8'},
      );
      expect(r.stdout + r.stderr).toContain(
        "how 'buttons rounder' --theme brand",
      );
    },
    T,
  );
});
