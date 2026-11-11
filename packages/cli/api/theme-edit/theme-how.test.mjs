// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for `experimental theme editor how`: a fixed set of plain-words
 * questions, each checked for what it understood, its top command, and what
 * that command changes when `set` runs it in a theme; every suggested
 * command is accepted, safe to paste and changes the theme; and the lookups
 * (parts, tokens, lists, pictures, --at) are bounded and honest.
 * Every check runs against the Core this repository builds.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {parsePoints} from './_adapter.mjs';
import {checkSetting} from './_check.mjs';
import {context} from './_context.mjs';
import {howTheme} from './_how-commands.mjs';
import {compileTheme, keyOf} from './_settings.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * The error a call throws: its code, message and suggested commands.
 * @param {() => Promise<unknown>} fn
 */
async function refusal(fn) {
  try {
    await fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      code: err.code,
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

/** A command without the CLI prefix: `set q corners more --on button`. @param {string} c */
const bare = c => c.replace(/^.*? experimental theme (editor )?/, '');

/** The words of a command, as a shell splits them. @param {string} c */
const words = c =>
  [...c.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map(m =>
    m[1] != null ? m[1].replace(/\\(.)/g, '$1') : m[2],
  );

/** Every line of a compiled theme, as `path=value`. @param {any} o @returns {string[]} */
function flat(o, p = '', out = /** @type {string[]} */ ([])) {
  for (const [k, v] of Object.entries(o ?? {})) {
    const at = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object') flat(v, at, out);
    else out.push(`${at}=${v}`);
  }
  return out;
}

/**
 * Run `set` commands on theme q in memory, through the same check and
 * compile `set` uses, and give the compiled lines they add.
 * @param {string[]} commands
 */
async function effect(commands) {
  const ctx = await context(cwd);
  const env = await howTheme(ctx, cwd, 'q');
  const before = new Set(flat(compileTheme(ctx, env.data, env.base)));
  /** @type {any} */
  const d = JSON.parse(JSON.stringify(env.data));
  for (const c of commands) {
    const [verb, theme, thing, ...rest] = words(bare(c));
    expect(verb).toBe('set');
    expect(theme).toBe('q');
    const fi = rest.findIndex(w => /^--(on|when|state|mode)$/.test(w));
    const value = (fi < 0 ? rest : rest.slice(0, fi)).join(' ');
    /** @type {Record<string, string>} */
    const flags = {};
    for (let i = fi < 0 ? rest.length : fi; i < rest.length; i += 2)
      flags[rest[i].slice(2)] = rest[i + 1];
    const s = checkSetting(ctx, 'q', d, thing, value, flags);
    if (s.thing === 'mode') {
      d.mode = s.value;
      continue;
    }
    const i = d.settings.findIndex(
      (/** @type {any} */ x) => keyOf(x) === keyOf(s),
    );
    if (i >= 0) d.settings[i] = s;
    else d.settings.push(s);
  }
  return [
    ...flat(compileTheme(ctx, d, env.base)).filter(x => !before.has(x)),
    ...(d.mode !== env.data.mode ? [`mode=${d.mode}`] : []),
  ].join('\n');
}

/**
 * A question, what it must understand (parts and aspects, each a subset),
 * its top command (without the prefix), and what running that command adds
 * to the compiled theme. `top: null` means no command fits, and the answer
 * must say why.
 * @type {Array<[string, {parts?: string[], aspects?: string[], top: RegExp | null, adds?: RegExp}]>}
 */
const QUESTIONS = [
  // colors
  [
    'make the primary button purple',
    {
      parts: ['button'],
      aspects: ['background'],
      top: /^set q background "#7c3aed" --on button --when variant:primary$/,
      adds: /button\.variant:primary\.background=#7c3aed/,
    },
  ],
  [
    'change the brand color to #ff6600',
    {
      aspects: ['colors'],
      top: /^set q accent "#ff6600"$/,
      adds: /--color-accent(\.0)?=#ff6600/,
    },
  ],
  [
    'use our brand orange',
    {top: /^set q accent "#f97316"$/, adds: /--color-accent(\.0)?=#f97316/},
  ],
  [
    'make the error red darker',
    {
      top: /^set q danger "#[0-9a-f]{6}"$/,
      adds: /--color-error(\.0)?=#[0-9a-f]{6}/,
    },
  ],
  [
    'success green should be more minty',
    {top: /^set q success "#34d399"$/, adds: /--color-success(\.0)?=#34d399/},
  ],
  [
    // The fixture theme's colors are grays: nothing to take out.
    'make everything less saturated',
    {aspects: ['colors'], top: null},
  ],
  [
    // A gray theme has no color to saturate, and none is picked for it.
    'more colorful please',
    {aspects: ['colors'], top: null},
  ],
  [
    'warm gray neutrals',
    {top: /^set q neutral "#78716c"$/, adds: /--color-background-surface/},
  ],
  [
    'make the page background white',
    {
      top: /^set q --color-background-body "#ffffff"$/,
      adds: /--color-background-body=#ffffff/,
    },
  ],
  [
    'card background light gray',
    {
      parts: ['card'],
      top: /^set q background "#e5e7eb" --on card$/,
      adds: /card\.base\.background=#e5e7eb/,
    },
  ],
  [
    'header background navy',
    {
      parts: ['app-shell-header'],
      top: /^set q background "#1e3a8a" --on app-shell-header$/,
      adds: /app-shell-header\.base\.background=#1e3a8a/,
    },
  ],
  [
    'white text in the header',
    {
      parts: ['app-shell-header'],
      aspects: ['text'],
      top: /^set q color "#ffffff" --on app-shell-header$/,
      adds: /app-shell-header\.base\.color=#ffffff/,
    },
  ],
  [
    'links should be accent colored',
    {
      parts: ['link'],
      top: /^set q color "var\(--color-text-accent\)" --on link$/,
      adds: /link\.base\.color=var\(--color-text-accent\)/,
    },
  ],
  [
    // Black on white and white on black already have the most contrast.
    'make the text darker',
    {aspects: ['text'], top: null},
  ],
  [
    "secondary text is too light, can't read it",
    {
      top: /^set q --color-text-secondary "#[0-9a-f]{6}" --mode light && set q --color-text-secondary "#[0-9a-f]{6}" --mode dark$/,
      adds: /--color-text-secondary/,
    },
  ],
  [
    'change the focus ring color to orange',
    {
      top: /^set q --focus-outline-color "#f97316"$/,
      adds: /--focus-outline-color=#f97316/,
    },
  ],
  [
    'selected tab underline should be the brand color',
    {
      parts: ['tab-indicator'],
      top: /--on tab-indicator --state selected$/,
      adds: /tab-indicator\.selected\.background=var\(--color-accent\)/,
    },
  ],
  [
    'make the toggle switch blue when on',
    {
      parts: ['switch'],
      top: /^set q background "#2563eb" --on switch --state checked$/,
      adds: /switch\.checked\.background=#2563eb/,
    },
  ],
  [
    'checkbox checked color pink',
    {
      parts: ['checks'],
      top: /--on checks --state checked$/,
      adds: /checkbox-indicator\.checked\.background=#db2777/,
    },
  ],
  [
    'progress bar fill should be green',
    {
      top: /--on progress-bar-fill$/,
      adds: /progress-bar-fill\.base\.background=#16a34a/,
    },
  ],
  [
    'dark mode background should be pure black',
    {
      top: /^set q --color-background-body "#000000" --mode dark$/,
      adds: /--color-background-body\.1=#000000/,
    },
  ],
  [
    'in dark mode make cards slightly lighter',
    {
      parts: ['card'],
      top: /--on card --mode dark$/,
      adds: /card\.base\.background=light-dark\(/,
    },
  ],
  [
    'tooltip black with white text',
    {
      parts: ['tooltip'],
      top: /background "#000000" --on tooltip && set q color "#ffffff" --on tooltip$/,
      adds: /tooltip\.base\.color=#ffffff/,
    },
  ],
  [
    'disabled buttons look too faded',
    {
      top: /^set q opacity 0\.8 --on button --state disabled$/,
      adds: /button\.base\.:disabled\.opacity=0\.8/,
    },
  ],
  [
    'hover color for buttons a bit darker',
    {top: /--on button --state hover$/, adds: /button\.base\.:hover\./},
  ],
  ['table rows striped', {parts: ['table-row'], top: null}],
  [
    'table header gray background',
    {
      parts: ['table-header-cell'],
      top: /--on table-header-cell$/,
      adds: /table-header-cell\.base\.background=/,
    },
  ],
  [
    'danger button should be orange not red',
    {
      top: /^set q background "#f97316" --on button --when variant:destructive$/,
      adds: /button\.variant:destructive\.background=#f97316/,
    },
  ],
  [
    'glossy gradient header',
    {
      top: /^set q background "linear-gradient\(.*\)" --on app-shell-header$/,
      adds: /app-shell-header\.base\.background=linear-gradient/,
    },
  ],
  // borders
  [
    'add a border to cards',
    {
      aspects: ['border'],
      top: /^set q border "1px solid var\(--color-border\)" --on card$/,
      adds: /card\.base\.border=1px solid/,
    },
  ],
  [
    'thicker borders on inputs',
    {
      top: /^set q border-width 2px --on inputs$/,
      adds: /text-input\.base\.borderWidth=2px/,
    },
  ],
  [
    'no borders on cards',
    {top: /^set q border none --on card$/, adds: /card\.base\.border=none/},
  ],
  [
    'border color of inputs should be gray',
    {
      top: /^set q border-color "#9ca3af" --on inputs$/,
      adds: /text-input\.base\.borderColor=#9ca3af/,
    },
  ],
  [
    'dashed border around the banner',
    {
      top: /^set q border "1px dashed var\(--color-border\)" --on banner$/,
      adds: /banner\.base\.border=1px dashed/,
    },
  ],
  [
    'remove the outline on buttons',
    {top: /^set q border none --on button$/, adds: /button\.base\.border=none/},
  ],
  [
    '2px border on the dialog',
    {
      top: /^set q border-width 2px --on dialog$/,
      adds: /dialog\.base\.borderWidth=2px/,
    },
  ],
  [
    'input border turns blue on focus',
    {
      top: /^set q border-color "#2563eb" --on inputs --state focus-within$/,
      adds: /:focus-within\.borderColor=#2563eb/,
    },
  ],
  [
    'invalid input red border',
    {
      top: /--on inputs --when status:error$/,
      adds: /text-input\.status:error\.borderColor=#dc2626/,
    },
  ],
  // shadows
  [
    'no shadow',
    {
      aspects: ['shadow'],
      top: /^set q --shadow-low none && set q --shadow-med none && set q --shadow-high none$/,
      adds: /--shadow-med=none/,
    },
  ],
  [
    'remove shadows from cards',
    {
      top: /^set q box-shadow none --on card$/,
      adds: /card\.base\.boxShadow=none/,
    },
  ],
  [
    'stronger shadow on dialogs',
    {
      top: /^set q box-shadow "var\(--shadow-high\)" --on dialog$/,
      adds: /dialog\.base\.boxShadow=var\(--shadow-high\)/,
    },
  ],
  [
    'subtle shadow on buttons',
    {
      top: /box-shadow "var\(--shadow-low\)" --on button$/,
      adds: /button\.base\.boxShadow=var\(--shadow-low\)/,
    },
  ],
  [
    'flat design, no shadows anywhere',
    {top: /surfaces flat/, adds: /--shadow-|surfaces|boxShadow=none/},
  ],
  [
    'bevel the buttons',
    {
      top: /box-shadow "inset .*" --on button$/,
      adds: /button\.base\.boxShadow=inset/,
    },
  ],
  [
    'shadow on hover for cards',
    {top: /--on card --state hover$/, adds: /card\.base\.:hover\.boxShadow=/},
  ],
  [
    'make shadows softer',
    {
      top: /^set q --shadow-low "[^"]+" && set q --shadow-med/,
      adds: /--shadow-low=/,
    },
  ],
  [
    'box-shadow: 0 0 10px red on button',
    {
      top: /^set q box-shadow "0 0 10px red" --on button$/,
      adds: /button\.base\.boxShadow=0 0 10px red/,
    },
  ],
  // corners
  [
    'a bit rounder',
    {
      aspects: ['corners'],
      top: /^set q corners more$/,
      adds: /--radius-element=12px/,
    },
  ],
  [
    'make the buttons a bit rounder',
    {
      top: /^set q corners more --on button$/,
      adds: /button\.base\.borderRadius=12px/,
    },
  ],
  [
    'pill shaped buttons',
    {
      top: /^set q corners pill --on button$/,
      adds: /button\.base\.borderRadius=9999px/,
    },
  ],
  [
    'square corners everywhere',
    {top: /^set q corners square$/, adds: /--radius-element=0px/},
  ],
  [
    'no rounded corners',
    {top: /^set q corners square$/, adds: /--radius-element=0px/},
  ],
  [
    'less rounded cards',
    {
      top: /^set q corners less --on card$/,
      adds: /card\.base\.borderRadius=8px/,
    },
  ],
  [
    'inputs with 4px radius',
    {
      top: /^set q border-radius 4px --on inputs$/,
      adds: /text-input\.base\.borderRadius=4px/,
    },
  ],
  [
    'small buttons 6px, large stay pill',
    {
      top: /border-radius 6px --on button --when size:sm && set q corners pill --on button --when size:lg$/,
      adds: /button\.size:sm\.borderRadius=6px/,
    },
  ],
  [
    'round the avatars',
    {
      parts: ['avatar'],
      top: /--on avatar$/,
      adds: /avatar\.base\.borderRadius=/,
    },
  ],
  ['corners: 12', {top: /^set q corners 12px$/, adds: /--radius-element=12px/}],
  [
    'rounder corners but not on inputs',
    {
      top: /^set q corners more && set q border-radius \S+ --on inputs$/,
      adds: /text-input\.base\.borderRadius=/,
    },
  ],
  [
    'make badges circular',
    {
      top: /^set q corners pill --on badge$/,
      adds: /badge\.base\.borderRadius=9999px/,
    },
  ],
  [
    'cards: 8px radius; buttons: 4px radius; inputs: 2px',
    {
      top: /--on card && set q border-radius 4px --on button && set q border-radius 2px --on inputs$/,
      adds: /button\.base\.borderRadius=4px/,
    },
  ],
  // spacing
  [
    'more padding in cards',
    {top: /^set q spacing more --on card$/, adds: /card\.base\.--spacing-/},
  ],
  [
    'make everything more compact',
    {top: /^set q spacing less$/, adds: /--spacing-1=/},
  ],
  [
    'tighter table rows',
    {
      top: /^set q spacing less --on table-row$/,
      adds: /table-row\.base\.--spacing-/,
    },
  ],
  [
    'buttons are too cramped',
    {top: /^set q spacing more --on button$/, adds: /button\.base\.--spacing-/},
  ],
  [
    '16px padding inside the banner',
    {
      top: /^set q padding 16px --on banner$/,
      adds: /banner\.base\.padding=16px/,
    },
  ],
  ['airy layout', {top: /^set q spacing more$/, adds: /--spacing-1=/}],
  [
    'less gap in side nav',
    {
      top: /^set q spacing less --on side-nav$/,
      adds: /side-nav\.base\.--spacing-/,
    },
  ],
  // type
  [
    'bold headings',
    {top: /^set q headings bold$/, adds: /--text-heading-1-weight=700/},
  ],
  [
    'lighter headings',
    {top: /^set q headings light$/, adds: /--text-heading-1-weight=300/},
  ],
  [
    'use a serif font for headings',
    {
      top: /^set q font serif --on heading$/,
      adds: /typography\.heading\.family=Georgia/,
    },
  ],
  ['use Inter everywhere', {top: /^set q font inter$/, adds: /family=Inter/}],
  ['bigger text', {top: /^set q text-size more$/, adds: /scale\.base=15/}],
  [
    'uppercase button labels',
    {
      top: /^set q text-transform uppercase --on button$/,
      adds: /button\.base\.textTransform=uppercase/,
    },
  ],
  [
    'italic links',
    {
      top: /^set q font-style italic --on link$/,
      adds: /link\.base\.fontStyle=italic/,
    },
  ],
  [
    'monospace code font',
    {
      top: /^set q font mono --on code$/,
      adds: /typography\.code\.family=ui-monospace/,
    },
  ],
  [
    'make the h1 bigger',
    {
      top: /^set q font-size \S+rem --on heading --when level:1$/,
      adds: /heading\.level:1\.fontSize=/,
    },
  ],
  [
    "don't make the buttons bold",
    {
      top: /^set q font-weight 400 --on button$/,
      adds: /button\.base\.fontWeight=400/,
    },
  ],
  [
    'font size 18px for body',
    {top: /^set q text-size 18$/, adds: /scale\.base=18/},
  ],
  // states, modes and sizes
  [
    'focus ring thicker',
    {
      top: /^set q --focus-outline-width 3px$/,
      adds: /--focus-outline-width=3px/,
    },
  ],
  [
    'pressed button scales down',
    {
      top: /^set q transform "scale\(0\.97\)" --on button --state active$/,
      adds: /:active\.transform=scale/,
    },
  ],
  ['selected table row light blue', {parts: ['table-row'], top: null}],
  ['dark mode only', {top: /^set q mode dark-only$/, adds: /mode=dark-only/}],
  [
    'make dark mode text less bright',
    {
      top: /--color-text-primary "#[0-9a-f]{6}" --mode dark$/,
      adds: /--color-text-primary\.1=/,
    },
  ],
  [
    'dark mode accent lighter',
    {
      top: /--color-accent "#[0-9a-f]{6}" --mode dark$/,
      adds: /--color-accent\.1=/,
    },
  ],
  [
    'dialog wider',
    {
      top: /^set q width "min\(720px, 100%\)" --on dialog$/,
      adds: /dialog\.base\.width=/,
    },
  ],
  [
    'make the tabs underline thicker',
    {
      top: /^set q height 3px --on tab-indicator$/,
      adds: /tab-indicator\.base\.height=3px/,
    },
  ],
  // several at once, typos, case, other languages
  [
    'rounded cards with a soft shadow and no border',
    {
      top: /--on card && set q box-shadow "var\(--shadow-low\)" --on card && set q border none --on card$/,
      adds: /card\.base\.border=none/,
    },
  ],
  [
    'make the header dark with white text and a bottom border',
    {
      top: /background "#1f2937" --on app-shell-header && set q color "#ffffff"/,
      adds: /borderBottom=/,
    },
  ],
  [
    'not blue, make the accent green',
    {top: /^set q accent "#16a34a"$/, adds: /--color-accent(\.0)?=#16a34a/},
  ],
  [
    'make the buttns rounder',
    {
      parts: ['button'],
      top: /^set q corners more --on button$/,
      adds: /button\.base\.borderRadius=/,
    },
  ],
  [
    'shaddow on cardz',
    {parts: ['card'], top: /--on card$/, adds: /card\.base\.boxShadow=/},
  ],
  [
    'Make The Buttons ROUNDER',
    {
      top: /^set q corners more --on button$/,
      adds: /button\.base\.borderRadius=/,
    },
  ],
  [
    'botones más redondeados',
    {
      parts: ['button'],
      top: /--on button$/,
      adds: /button\.base\.borderRadius=/,
    },
  ],
  [
    '让按钮更圆',
    {
      parts: ['button'],
      top: /--on button$/,
      adds: /button\.base\.borderRadius=/,
    },
  ],
  [
    'Schatten auf Karten entfernen',
    {
      top: /^set q box-shadow none --on card$/,
      adds: /card\.base\.boxShadow=none/,
    },
  ],
  [
    'кнопки синие',
    {
      top: /^set q background "#2563eb" --on button$/,
      adds: /button\.base\.background=#2563eb/,
    },
  ],
  [
    'set button background to rgb(255 0 0)',
    {
      top: /^set q background "rgb\(255 0 0\)" --on button$/,
      adds: /button\.base\.background=rgb\(255 0 0\)/,
    },
  ],
  [
    'use #123 for borders',
    {top: /^set q --color-border "#123"$/, adds: /--color-border=#123/},
  ],
  [
    'make primary button 10px radius',
    {
      top: /^set q border-radius 10px --on button --when variant:primary$/,
      adds: /button\.variant:primary\.borderRadius=10px/,
    },
  ],
  ['modern', {top: null}],
];

describe('how answers plain-words questions', () => {
  for (const [question, want] of QUESTIONS)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      expect(data.kind).toBe('question');
      for (const p of want.parts ?? [])
        expect(data.understood.parts).toContain(p);
      for (const a of want.aspects ?? [])
        expect(data.understood.aspects).toContain(a);
      /** @type {Array<{commands: string[], sequence?: boolean}>} */
      const results = data.results;
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want.top === null) {
        expect(changes).toEqual([]);
        // An empty answer says why, in JSON as in text.
        expect(data.hint ?? results[0]?.text).toBeTruthy();
        return;
      }
      const top = changes[0];
      expect(top).toBeTruthy();
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want.top);
      if (want.adds) expect(await effect(commands)).toMatch(want.adds);
    });

  it('every command it suggests is safe to paste, names the theme, and is accepted', async () => {
    for (const [question] of QUESTIONS.slice(0, 40)) {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      for (const r of data.results)
        for (const c of r.commands) {
          expect(c).not.toMatch(/[<>]|\s#\s|\bset my\b|<theme>/);
          if (/ editor set /.test(c)) {
            expect(words(bare(c))[1]).toBe('q');
            if (!r.sequence) expect(await effect([c])).not.toBe('');
          }
        }
    }
  }, 120_000);
});

describe('how commands, run by set', () => {
  /** @param {string} slug */
  const css = slug =>
    fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

  it('the top command, pasted into set, writes the CSS the question asked for', async () => {
    await themeEditNew('e2e', {cwd, like: 'neutral'});
    for (const [question, want] of /** @type {Array<[string, RegExp]>} */ ([
      [
        'remove shadows from cards',
        /\.astryx-card[^{]*\{[^}]*box-shadow:\s*none/,
      ],
      [
        'make the toggle switch blue when on',
        /switch[^{]*\{[^}]*background:\s*#2563eb/,
      ],
      ['change the brand color to #ff6600', /--color-accent:[^;]*#ff6600/i],
    ])) {
      const {data} = await themeEditHow(question, {cwd, theme: 'e2e'});
      const top = data.results.find((/** @type {any} */ r) =>
        r.commands.some((/** @type {string} */ c) => / editor set /.test(c)),
      );
      const [, theme, thing, ...rest] = words(bare(top.commands[0]));
      const fi = rest.findIndex(
        w => w.startsWith('--') && /^--(on|when|state|mode)$/.test(w),
      );
      /** @type {Record<string, string>} */
      const flags = {};
      for (let i = fi < 0 ? rest.length : fi; i < rest.length; i += 2)
        flags[rest[i].slice(2)] = rest[i + 1];
      const before = css('e2e');
      await themeEditSet(
        theme,
        thing,
        (fi < 0 ? rest : rest.slice(0, fi)).join(' '),
        {cwd, ...flags},
      );
      const after = css('e2e');
      expect(before).not.toMatch(want);
      expect(after).toMatch(want);
    }
  }, 180_000);

  it('set refuses a placeholder or a shell comment as a value, and writes nothing', async () => {
    const file = path.join(cwd, 'themes', 'q', 'q.settings.json');
    const before = fs.readFileSync(file, 'utf8');
    for (const value of [
      '1px solid <color>',
      '1px solid #ccc # direct: always works',
    ])
      expect(
        (
          await refusal(() =>
            themeEditSet('q', 'border', value, {cwd, on: 'card'}),
          )
        ).code,
      ).toBe('ERR_THEME_BAD_VALUE');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
});

describe('how commands are for the theme in the app', () => {
  it('refuses an empty --theme, and a --theme that does not exist for a picture or a list too', async () => {
    expect(
      (await refusal(() => themeEditHow('card', {cwd, theme: ''}))).code,
    ).toBe('ERR_INVALID_ARGUMENT');
    expect(
      (
        await refusal(() =>
          themeEditHow('', {cwd, list: 'tokens', theme: 'nope'}),
        )
      ).code,
    ).toBe('ERR_UNKNOWN_THEME');
    const r = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'editor',
        'how',
        'rounder buttons',
        '--theme',
        'q',
        '--theme',
        'q',
      ],
      {cwd},
    );
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).code).toBe('ERR_INVALID_ARGUMENT');
  }, 60_000);

  it('picks the theme an editor command changed last, not the newest settings file, and says how it chose', async () => {
    const {data} = await themeEditHow('rounder buttons', {cwd});
    expect(['last-changed', 'only']).toContain(data.themeChosenBy);
    const other = fs
      .readdirSync(path.join(cwd, 'themes'))
      .find(
        d =>
          d !== data.theme &&
          fs.existsSync(path.join(cwd, 'themes', d, `${d}.settings.json`)),
      );
    if (!other) return;
    // A checkout or touch of another theme's settings file does not move it.
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(
      path.join(cwd, 'themes', other, `${other}.settings.json`),
      later,
      later,
    );
    expect((await themeEditHow('rounder buttons', {cwd})).data.theme).toBe(
      data.theme,
    );
    expect(
      (await themeEditHow('rounder buttons', {cwd, theme: 'q'})).data
        .themeChosenBy,
    ).toBe('named');
  });

  it('prints each command on a line of its own, never wrapped, and a sequence as one line', async () => {
    const r = await runCli(
      ['experimental', 'theme', 'editor', 'how', 'no shadow', '--theme', 'q'],
      {cwd},
    );
    const lines = r.stdout.split('\n').filter(l => / editor set /.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0].trim().split(' && ')).toHaveLength(3);
    for (const c of lines[0].trim().split(' && '))
      expect(c).toMatch(
        /^\S.* experimental theme editor set q --shadow-(low|med|high) none$/,
      );
    const one = await runCli(
      [
        'experimental',
        'theme',
        'editor',
        'how',
        'less rounded cards',
        '--theme',
        'q',
      ],
      {cwd},
    );
    expect(one.stdout).toMatch(
      /^ {2}\S+.* experimental theme editor set q corners less --on card$/m,
    );
  }, 60_000);

  it('with no theme, names my-theme and makes it first', async () => {
    const bare2 = makeLinkedFixture('astryx-theme-how-none-', FIXTURE_PACKAGES);
    try {
      writeFixtureBaseTheme(bare2, 'neutral');
      const {data} = await themeEditHow('rounder buttons', {cwd: bare2});
      expect(data.theme).toBe('my-theme');
      expect(bare(data.results[0].commands[0])).toBe(
        'new my-theme --like neutral',
      );
      expect(bare(data.results[1].commands[0])).toBe(
        'set my-theme corners more --on button',
      );
      // A lookup in an app with no themes leaves no themes folder.
      expect(fs.existsSync(path.join(bare2, 'themes'))).toBe(false);
    } finally {
      removeLinkedFixture(bare2);
    }
  }, 120_000);

  it('with several themes, names the one changed last and says how to pick another', async () => {
    const {data} = await themeEditHow('rounder buttons', {cwd});
    expect(data.themeNote).toMatch(/--theme picks another of: /);
    const r = await themeEditHow('rounder buttons', {cwd, theme: 'q'});
    expect(r.data.themeNote).toBeUndefined();
    expect(bare(r.data.results[0].commands[0])).toBe(
      'set q corners more --on button',
    );
    expect(
      (await refusal(() => themeEditHow('card', {cwd, theme: 'nope'}))).code,
    ).toBe('ERR_UNKNOWN_THEME');
  });

  it('a dial lookup gives its examples for the theme, each accepted', async () => {
    const {data} = await themeEditHow('corners', {cwd, theme: 'q'});
    const all = data.results.flatMap((/** @type {any} */ r) => r.commands);
    expect(all.map(bare)).toContain('set q corners pill');
    expect(all.join('\n')).not.toMatch(/set my |<theme>|<value>/);
  });

  it('a whole-theme question that set would refuse on a gray theme says why, and picks no color', async () => {
    for (const q of ['more colorful please', 'make it pop']) {
      const {data} = await themeEditHow(q, {cwd, theme: 'q'});
      const all = data.results.flatMap((/** @type {any} */ r) => r.commands);
      expect(all.join('\n'), q).not.toMatch(/ editor set /);
      expect(data.results[0].text, q).toMatch(/is a gray/);
    }
  });
});

/**
 * Pass-2 questions: common phrasings of negation and "too", typed values,
 * modes, parts and properties that were wrong, typos, and lookups phrased as
 * questions. Same shape as {@link QUESTIONS}.
 * @type {Array<[string, {parts?: string[], aspects?: string[], top: RegExp | null, adds?: RegExp, text?: RegExp}]>}
 */
const QUESTIONS_2 = [
  // negation and "too"
  [
    "cards shouldn't have a border",
    {top: /^set q border none --on card$/, adds: /card\.base\.border=none/},
  ],
  [
    'turn off the shadow on hover for cards',
    {
      top: /^set q box-shadow none --on card --state hover$/,
      adds: /card\.base\.:hover\.boxShadow=none/,
    },
  ],
  [
    'never use pure black for text',
    {
      top: /^set q --color-text-primary "#1f2937" --mode light$/,
      adds: /--color-text-primary.*#1f2937/,
    },
  ],
  [
    'design feedback: corners feel too sharp',
    {top: /^set q corners more$/, adds: /--radius-element=12px/},
  ],
  [
    'PM says the buttons feel too heavy',
    {
      top: /^set q font-weight 400 --on button$/,
      adds: /button\.base\.fontWeight=400/,
    },
  ],
  [
    'shadows on everything except buttons',
    {
      top: /&& set q box-shadow none --on button$/,
      adds: /button\.base\.boxShadow=none/,
    },
  ],
  [
    'compact spacing except in dialogs',
    {
      top: /^set q spacing less && set q spacing medium --on dialog$/,
      adds: /dialog\.base\.--spacing-/,
    },
  ],
  [
    'bold text but not in the header',
    {
      top: /^set q --text-body-weight 700 && set q font-weight \d+ --on app-shell-header$/,
      adds: /--text-body-weight=700/,
    },
  ],
  [
    'all buttons blue except the danger one',
    {
      top: /--on button && set q background "var\(--color-error\)" --on button --when variant:destructive$/,
      adds: /variant:destructive\.background=var\(--color-error\)/,
    },
  ],
  [
    'кнопки без тени',
    {
      top: /^set q box-shadow none --on button$/,
      adds: /button\.base\.boxShadow=none/,
    },
  ],
  [
    'cartes sans bordure',
    {top: /^set q border none --on card$/, adds: /card\.base\.border=none/},
  ],
  [
    'unbold the headings',
    {top: /^set q headings regular$/, adds: /--text-heading-1-weight=400/},
  ],
  [
    'stop rounding the cards',
    {
      top: /^set q corners square --on card$/,
      adds: /card\.base\.borderRadius=0px/,
    },
  ],
  // typed values
  [
    'the client wants their brand blue, #0057ff',
    {top: /^set q accent "#0057ff"$/, adds: /--color-accent(\.0)?=#0057ff/},
  ],
  [
    'like Linear: dark only, purple accent #5e6ad2',
    {
      top: /^set q mode dark-only && set q accent "#5e6ad2"$/,
      adds: /mode=dark-only/,
    },
  ],
  [
    'gray text color #555',
    {
      top: /^set q --color-text-primary "#555"$/,
      adds: /--color-text-primary=#555/,
    },
  ],
  ['accent #12345', {top: null, text: /"#12345" is not a color/}],
  [
    'primary #5E6AD2, radius 6px, font Inter',
    {
      top: /^set q accent "#5e6ad2" && set q corners 6px && set q font inter$/,
      adds: /--radius-element=6px/,
    },
  ],
  [
    '{"accent":"#3b82f6","radius":"8px"}',
    {
      top: /^set q accent "#3b82f6" && set q corners 8px$/,
      adds: /--radius-element=8px/,
    },
  ],
  ['radius -4px on cards', {top: null, text: /cannot be negative/}],
  [
    'headings are 600 weight and -0.02em tracking',
    {
      top: /^set q headings semibold && set q letter-spacing -0\.02em --on heading$/,
      adds: /--text-heading-1-weight=600/,
    },
  ],
  [
    'disabled buttons should be 40% opacity',
    {
      top: /^set q opacity 0\.4 --on button --state disabled$/,
      adds: /:disabled\.opacity=0\.4/,
    },
  ],
  [
    'button padding 12px 20px',
    {
      top: /^set q padding "12px 20px" --on button$/,
      adds: /button\.base\.padding=12px 20px/,
    },
  ],
  [
    'card shadow: 0 1px 3px rgb(0 0 0 / 0.1)',
    {
      top: /^set q box-shadow "0 1px 3px rgb\(0 0 0 \/ 0\.1\)" --on card$/,
      adds: /card\.base\.boxShadow=0 1px 3px/,
    },
  ],
  [
    'buttons in the mock are 40px tall with 8px radius',
    {
      top: /^set q min-height 40px --on button && set q border-radius 8px --on button$/,
      adds: /button\.base\.minHeight=40px/,
    },
  ],
  [
    'per the brand guide, headings use Georgia',
    {
      top: /^set q font georgia --on heading$/,
      adds: /typography\.heading\.family=Georgia/,
    },
  ],
  // modes
  [
    'in dark mode, cards should be #1c1c1e',
    {
      top: /^set q background "#1c1c1e" --on card --mode dark$/,
      adds: /card\.base\.background=light-dark\(/,
    },
  ],
  [
    'only in dark mode make the buttons pill',
    {top: null, text: /same in light and dark/},
  ],
  [
    'make dark mode borders subtler',
    {
      top: /^set q --color-border "#[0-9a-f]{6,8}" --mode dark$/,
      adds: /--color-border\.1=/,
    },
  ],
  // parts and properties
  [
    'selected side nav item has accent background',
    {
      top: /--on side-nav-item --state selected$/,
      adds: /side-nav-item\.selected\.background=/,
    },
  ],
  [
    'the sidebar is #111827 and nav items are #9ca3af',
    {
      top: /--on side-nav && set q background "#9ca3af" --on side-nav-item$/,
      adds: /side-nav-item\.base\.background=#9ca3af/,
    },
  ],
  [
    'focus-visible ring on buttons orange',
    {
      top: /^set q outline-color "#f97316" --on button --state focus-visible$/,
      adds: /:focus-visible\.outlineColor=#f97316/,
    },
  ],
  [
    'tabs: selected tab has a 2px #6366f1 underline',
    {
      top: /^set q background "#6366f1" --on tab-indicator --state selected && set q height 2px --on tab-indicator$/,
      adds: /tab-indicator\.selected\.background=#6366f1/,
    },
  ],
  [
    'cards lift on hover',
    {
      top: /^set q box-shadow "var\(--shadow-high\)" --on card --state hover$/,
      adds: /card\.base\.:hover\.boxShadow/,
    },
  ],
  [
    'disabled inputs with a dashed border',
    {
      top: /^set q border-style dashed --on inputs --state disabled$/,
      adds: /text-input\.disabled\.borderStyle=dashed/,
    },
  ],
  [
    'buttons 48px tall',
    {
      top: /^set q min-height 48px --on button$/,
      adds: /button\.base\.minHeight=48px/,
    },
  ],
  [
    'icons should be the accent color',
    {
      top: /^set q --color-icon-primary "var\(--color-accent\)"$/,
      adds: /--color-icon-primary=var\(--color-accent\)/,
    },
  ],
  [
    'darker borders',
    {
      top: /^set q --color-border "#[0-9a-f]+" --mode light && set q --color-border "#[0-9a-f]+" --mode dark$/,
      adds: /--color-border/,
    },
  ],
  [
    'lighter font weight for body',
    {top: /^set q --text-body-weight 300$/, adds: /--text-body-weight=300/},
  ],
  [
    'transparent header',
    {
      top: /^set q background transparent --on app-shell-header$/,
      adds: /app-shell-header\.base\.background=transparent/,
    },
  ],
  [
    'make the modal overlay darker',
    {
      top: /^set q --color-overlay "#[0-9a-f]+" --mode light && set q --color-overlay "#[0-9a-f]+" --mode dark$/,
      adds: /--color-overlay/,
    },
  ],
  [
    'make the progress bar thicker',
    {
      top: /^set q height 8px --on progress-bar-track$/,
      adds: /progress-bar-track\.base\.height=8px/,
    },
  ],
  [
    'smaller headings',
    {top: /^set q type compact$/, adds: /--text-heading-1-weight=600/},
  ],
  [
    'links underline on hover',
    {
      top: /^set q text-decoration underline --on link --state hover$/,
      adds: /link\.base\.:hover\.textDecoration=underline/,
    },
  ],
  [
    'line height 1.6 for body text',
    {top: /^set q --text-body-leading 1\.6$/, adds: /--text-body-leading=1\.6/},
  ],
  [
    'make the app feel warmer',
    {top: /^set q neutral "#78716c"$/, adds: /--color-background-surface/},
  ],
  [
    'swap the accent and the danger colors',
    {
      top: /^set q accent "#[0-9a-f]{6}" && set q danger "#[0-9a-f]{6}"$/i,
      adds: /--color-accent/,
    },
  ],
  // typos and languages
  [
    'make the buttnos roudner',
    {
      top: /^set q corners more --on button$/,
      adds: /button\.base\.borderRadius=12px/,
    },
  ],
  [
    'remvoe shaodws',
    {
      top: /^set q --shadow-low none && set q --shadow-med none && set q --shadow-high none$/,
      adds: /--shadow-med=none/,
    },
  ],
  [
    'acent color #ff6600',
    {top: /^set q accent "#ff6600"$/, adds: /--color-accent(\.0)?=#ff6600/},
  ],
  [
    'rounder crads',
    {top: /^set q corners more --on card$/, adds: /card\.base\.borderRadius/},
  ],
  [
    'bttn pill',
    {
      top: /^set q corners pill --on button$/,
      adds: /button\.base\.borderRadius=9999px/,
    },
  ],
  [
    'dialgo shadow stronger',
    {
      top: /^set q box-shadow "var\(--shadow-high\)" --on dialog$/,
      adds: /dialog\.base\.boxShadow/,
    },
  ],
  [
    'botões mais arredondados',
    {
      top: /^set q corners more --on button$/,
      adds: /button\.base\.borderRadius/,
    },
  ],
  [
    'pulsanti arrotondati',
    {top: /--on button$/, adds: /button\.base\.borderRadius/},
  ],
  ['버튼을 둥글게', {top: /--on button$/, adds: /button\.base\.borderRadius/}],
  [
    'ボタンを青く',
    {
      top: /^set q background "#2563eb" --on button$/,
      adds: /button\.base\.background=#2563eb/,
    },
  ],
  // contradictions and repeats
  ['rounder but square corners', {top: null, text: /contradict/}],
  ['make the cards red and blue', {top: null, text: /contradict/}],
  [
    'pill buttons and pill buttons',
    {
      top: /^set q corners pill --on button$/,
      adds: /button\.base\.borderRadius=9999px/,
    },
  ],
];

describe('how answers pass-2 questions', () => {
  for (const [question, want] of QUESTIONS_2)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      expect(data.kind).toBe('question');
      for (const p of want.parts ?? [])
        expect(data.understood.parts).toContain(p);
      for (const a of want.aspects ?? [])
        expect(data.understood.aspects).toContain(a);
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results;
      const all = results.map(r => r.text).join('\n') + (data.hint ?? '');
      if (want.text) expect(all).toMatch(want.text);
      // A contradiction is offered as choices, never as a sequence.
      if (/contradict/.test(String(want.text))) {
        expect(results[0].sequence).toBeFalsy();
        expect(results[0].commands.length).toBe(2);
        return;
      }
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want.top === null) {
        expect(changes).toEqual([]);
        return;
      }
      // The change comes before any lookup.
      expect(results[0]).toBe(changes[0]);
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want.top);
      if (want.adds) expect(await effect(commands)).toMatch(want.adds);
    });

  it('a lookup phrased as a question gets the lookup, not a change', async () => {
    const token = (
      await themeEditHow('what does --color-accent do', {cwd, theme: 'q'})
    ).data;
    expect(token).toMatchObject({
      kind: 'setting',
      source: 'token',
      subject: 'what does --color-accent do',
    });
    const part = (
      await themeEditHow("What's the CSS variable for card padding?", {
        cwd,
        theme: 'q',
      })
    ).data;
    const all = part.results.flatMap((/** @type {any} */ r) => r.commands);
    expect(all.join('\n')).not.toMatch(/ editor set /);
    expect(part.results[0].text).toMatch(/^card reads --/);
  });

  it('a long question with many changes runs at most 12 steps, and says so', async () => {
    const q = Array(40)
      .fill('rounder buttons and no shadow on cards and bold headings')
      .join(' and ');
    const {data} = await themeEditHow(q, {cwd, theme: 'q'});
    const seq = data.results.find((/** @type {any} */ r) => r.sequence);
    // Repeats are dropped, so the three changes are left once each.
    expect(seq.commands.length).toBeLessThanOrEqual(12);
    expect(new Set(seq.commands).size).toBe(seq.commands.length);
  });

  it('undo and reset point to the commands that do them', async () => {
    // q has no history yet: nothing to undo, so no undo command.
    const none = (await themeEditHow('undo the last change', {cwd, theme: 'q'}))
      .data;
    expect(none.results[0].text).toMatch(/q has no change to undo yet/);
    expect(none.results[0].commands.map(bare)).not.toContain('undo q');
    await themeEditNew('hist', {cwd, like: 'neutral'});
    await themeEditSet('hist', 'corners', 'more', {cwd});
    const undo = (
      await themeEditHow('undo the last change', {cwd, theme: 'hist'})
    ).data;
    expect(undo.results[0].commands.map(bare)).toContain('undo hist');
    const reset = (
      await themeEditHow('reset everything to default', {cwd, theme: 'q'})
    ).data;
    expect(reset.results[0].commands.map(bare)).toContain('show q');
  }, 120_000);

  it('a dark-mode ask on a light-only theme says it has no dark mode, and changes nothing', async () => {
    await themeEditNew('lo', {
      cwd,
      like: 'neutral',
      settings: {mode: 'light-only'},
    });
    const {data} = await themeEditHow('dark mode accent #a78bfa', {
      cwd,
      theme: 'lo',
    });
    expect(data.results[0].text).toMatch(/lo has only a light mode/);
    expect(
      data.results.flatMap((/** @type {any} */ r) => r.commands).join('\n'),
    ).not.toMatch(/ editor set /);
  }, 120_000);

  it('runs pass-2 answers through set and checks the built CSS', async () => {
    await themeEditNew('p2', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'themes', 'p2');
    const keep = path.join(cwd, 'p2-pristine');
    fs.cpSync(dir, keep, {recursive: true});
    const css = () => fs.readFileSync(path.join(dir, 'p2.css'), 'utf8');
    for (const [question, want] of /** @type {Array<[string, RegExp]>} */ ([
      [
        "cards shouldn't have a border",
        /\.astryx-card[^{]*\{[^}]*border:\s*none/,
      ],
      [
        'the client wants their brand blue, #0057ff',
        /--color-accent:[^;]*#0057ff/i,
      ],
      [
        'in dark mode, cards should be #1c1c1e',
        /card[^{]*\{[^}]*background:\s*light-dark\(.*#1c1c1e/,
      ],
      ['button padding 12px 20px', /button[^{]*\{[^}]*padding:\s*12px 20px/],
      [
        'focus-visible ring on buttons orange',
        /button[^{]*:focus-visible[^{]*\{[^}]*outline-color:\s*#f97316/,
      ],
      ['compact spacing except in dialogs', /dialog[^{]*\{[^}]*--spacing-4:/],
    ])) {
      fs.rmSync(dir, {recursive: true, force: true});
      fs.cpSync(keep, dir, {recursive: true});
      const {data} = await themeEditHow(question, {cwd, theme: 'p2'});
      const top = data.results.find((/** @type {any} */ r) =>
        r.commands.some((/** @type {string} */ c) => / editor set /.test(c)),
      );
      const commands = top.sequence ? top.commands : [top.commands[0]];
      const before = css();
      for (const c of commands) {
        const [, theme, thing, ...rest] = words(bare(c));
        const fi = rest.findIndex(w => /^--(on|when|state|mode)$/.test(w));
        /** @type {Record<string, string>} */
        const flags = {};
        for (let i = fi < 0 ? rest.length : fi; i < rest.length; i += 2)
          flags[rest[i].slice(2)] = rest[i + 1];
        await themeEditSet(
          theme,
          thing,
          (fi < 0 ? rest : rest.slice(0, fi)).join(' '),
          {cwd, ...flags},
        );
      }
      expect(before, question).not.toMatch(want);
      expect(css(), question).toMatch(want);
    }
    fs.rmSync(keep, {recursive: true, force: true});
  }, 300_000);
});

/**
 * Pass-3 questions: lists, several colors in one ask, colors worked out
 * per mode, CSS property names, typed values kept, other languages.
 * @type {Array<[string, {parts?: string[], aspects?: string[], top: RegExp | null, adds?: RegExp, text?: RegExp}]>}
 */
const QUESTIONS_3 = [
  // each line of a list is its own ask, and a "no" stays on its line
  [
    '- rounder buttons\n- no shadow on cards',
    {
      top: /^set q corners more --on button && set q box-shadow none --on card$/,
      adds: /button\.base\.borderRadius=12px[\s\S]*card\.base\.boxShadow=none/,
    },
  ],
  [
    'no borders\nbold headings',
    {
      top: /^set q --border-width 0px && set q headings bold$/,
      adds: /--border-width=0px/,
    },
  ],
  // several colors, each kept, with the hex before or after its word
  [
    'accent #0ea5e9; danger #ef4444; success #22c55e',
    {
      top: /^set q accent "#0ea5e9" && set q danger "#ef4444" && set q success "#22c55e"$/,
      adds: /--color-accent[^\n]*=#0ea5e9[\s\S]*--color-error[^\n]*=#ef4444[\s\S]*--color-success[^\n]*=#22c55e|--color-success[^\n]*=#22c55e/,
    },
  ],
  [
    'like Bootstrap 5: #0d6efd primary, 6px radius',
    {
      top: /^set q accent "#0d6efd" && set q corners 6px$/,
      adds: /--color-accent[^\n]*=#0d6efd/,
    },
  ],
  [
    'make it look like Google: Roboto font, accent #1a73e8',
    {
      top: /^set q font roboto && set q accent "#1a73e8"$/,
      adds: /--color-accent[^\n]*=#1a73e8/,
    },
  ],
  [
    'brand colors: primary #ff5a1f, secondary #1f2937',
    {
      top: /^set q accent "#ff5a1f" && set q background "#1f2937" --on button --when variant:secondary$/,
      adds: /--color-accent[^\n]*=#ff5a1f/,
    },
  ],
  [
    'colors: bg=#fff text=#000 accent=#ff0080',
    {
      top: /^set q --color-background-body "#fff" && set q --color-text-primary "#000" && set q accent "#ff0080"$/,
      adds: /--color-background-body=#fff/,
    },
  ],
  [
    'hex values in the mock: #FAFAFA bg, #171717 text, #E5E5E5 border, #0070F3 accent',
    {
      top: /^set q --color-background-body "#fafafa" && set q --color-text-primary "#171717" && set q --color-border "#e5e5e5" && set q accent "#0070f3"$/,
      adds: /--color-border=#e5e5e5/,
    },
  ],
  [
    'LGTM except the accent, make it #6d28d9',
    {top: /^set q accent "#6d28d9"$/, adds: /--color-accent[^\n]*=#6d28d9/},
  ],
  [
    'not a fan of the purple, can we go back to blue?',
    {top: /^set q accent "#2563eb"$/},
  ],
  [
    'Airbnb: accent #ff385c, rounded 12px cards, Circular font',
    {
      top: /^set q accent "#ff385c" && set q border-radius 12px --on card && set q font Circular$/,
    },
  ],
  // colors how works out are per mode
  [
    'more contrast',
    {
      top: /^set q --color-text-secondary "#[0-9a-f]+" --mode light && set q --color-text-secondary "#[0-9a-f]+" --mode dark && set q --color-border "#[0-9a-f]+" --mode light && set q --color-border "#[0-9a-f]+" --mode dark$/,
      text: /in light and in dark mode/,
    },
  ],
  [
    'a11y audit: secondary text fails contrast on white',
    {
      top: /^set q --color-text-secondary "#[0-9a-f]{6}" --mode light && set q --color-text-secondary "#[0-9a-f]{6}" --mode dark$/,
    },
  ],
  [
    'make the page background lighter',
    {
      top: /--mode light && set q --color-background-body "#[0-9a-f]+" --mode dark$/,
    },
  ],
  // CSS property names
  [
    'buttons have letter-spacing 0.02em and font-weight 500',
    {
      top: /^set q letter-spacing 0\.02em --on button && set q font-weight 500 --on button$/,
      adds: /button\.base\.letterSpacing=0\.02em/,
    },
  ],
  [
    'headings are tight: letter-spacing -0.025em, line-height 1.2',
    {
      top: /^set q letter-spacing -0\.025em --on heading && set q line-height 1\.2 --on heading$/,
      adds: /heading\.base\.lineHeight=1\.2/,
    },
  ],
  [
    'font-size 14px on buttons',
    {
      top: /^set q font-size 14px --on button$/,
      adds: /button\.base\.fontSize=14px/,
    },
  ],
  // what was meant
  [
    'drop shadow: x 0, y 4, blur 6, spread -1, rgba(0,0,0,0.1)',
    {
      top: /^set q --shadow-med "0 4px 6px -1px rgba\(0,0,0,0\.1\)"$/,
      adds: /--shadow-med=0 4px 6px -1px/,
    },
  ],
  [
    "let's ditch the borders on inputs",
    {top: /^set q border none --on inputs$/, adds: /\.border=none/},
  ],
  ['swap Inter for Manrope everywhere', {top: /^set q font manrope$/}],
  [
    'all radius values are 0, it is very sharp',
    {top: /^set q corners square$/, adds: /--radius-element=0px/},
  ],
  [
    'the card corners are about 12 pixels',
    {
      top: /^set q border-radius 12px --on card$/,
      adds: /card\.base\.borderRadius=12px/,
    },
  ],
  [
    'Can you please make the tooltip darker? Thanks!',
    {
      top: /^set q filter "brightness\(0\.85\)" --on tooltip$/,
      adds: /tooltip\.base\.filter/,
    },
  ],
  [
    'make inputs taller (44px)',
    {top: /^set q min-height 44px --on inputs$/, adds: /minHeight=44px/},
  ],
  [
    'stakeholders think the grays are too warm',
    {top: /^set q neutral "#64748b"$/},
  ],
  // typed values kept
  [
    'cards have a gradient background from #ffffff to #f8fafc',
    {
      top: /^set q background "linear-gradient\(#ffffff, #f8fafc\)" --on card$/,
      adds: /card\.base\.background=linear-gradient\(#ffffff, #f8fafc\)/,
    },
  ],
  [
    'shadow on dialogs is 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    {
      top: /^set q box-shadow "0 20px 25px -5px rgb\(0 0 0 \/ 0\.1\), 0 8px 10px -6px rgb\(0 0 0 \/ 0\.1\)" --on dialog$/,
    },
  ],
  [
    'shadows are very soft and large, like 0 10px 40px rgba(0,0,0,0.05)',
    {top: /^set q --shadow-med "0 10px 40px rgba\(0,0,0,0\.05\)"$/},
  ],
  [
    'headings use "Playfair Display", body uses "Source Sans 3"',
    {
      top: /^set q font "Playfair Display" --on heading && set q --font-family-body /,
    },
  ],
  [
    'border width is 2px everywhere, color #000',
    {top: /^set q --border-width 2px && set q --color-border "#000"$/},
  ],
  // parts
  [
    'the table has zebra rows #f9fafb and a header #f3f4f6',
    {top: /^set q background "#f3f4f6" --on table-header-cell$/},
  ],
  [
    'the error banner is #fef2f2 with #991b1b text',
    {
      top: /^set q background "#fef2f2" --on banner --when status:error && set q color "#991b1b" --on banner --when status:error$/,
    },
  ],
  ['button color #fff', {top: /^set q color "#fff" --on button$/}],
  [
    'accent #ff0000 */ body{display:none} /*',
    {top: /^set q accent "#ff0000"$/},
  ],
  // other languages
  ['pulsanti senza ombra', {top: /^set q box-shadow none --on button$/}],
  ['цвет акцента #00aa55', {top: /^set q accent "#00aa55"$/}],
  ['카드 그림자 없애줘', {top: /^set q box-shadow none --on card$/}],
  ['الأزرار مستديرة', {top: /^set q corners round --on button$/}],
  ['बटन गोल करो', {top: /^set q corners round --on button$/}],
  [
    'cards sin sombra y botones azules',
    {
      top: /^set q box-shadow none --on card && set q background "#2563eb" --on button$/,
    },
  ],
  // a refusal says why
  [
    'the eng lead wants square corners on tables only',
    {top: null, text: /no command does it on q: .+/},
  ],
];

describe('how answers pass-3 questions', () => {
  for (const [question, want] of QUESTIONS_3)
    it(question.replace(/\n/g, ' / '), async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      expect(data.kind).toBe('question');
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results;
      const all = results.map(r => r.text).join('\n') + (data.hint ?? '');
      if (want.text) expect(all).toMatch(want.text);
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want.top === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want.top);
      // A step is given once.
      expect(new Set(commands).size).toBe(commands.length);
      if (want.adds) expect(await effect(commands)).toMatch(want.adds);
    });

  it('a color how works out never lands on both modes, and dark text stays light', async () => {
    const {data} = await themeEditHow('secondary text is too light', {
      cwd,
      theme: 'q',
    });
    const cmds = data.results[0].commands.map(bare);
    expect(cmds.join(' ')).toMatch(/--mode light/);
    const dark = cmds.join(' ').match(/"(#[0-9a-f]{6})" --mode dark/)?.[1];
    expect(dark).toBeTruthy();
    // Light text on the dark page: every channel above the middle.
    for (const i of [1, 3, 5])
      expect(parseInt(String(dark).slice(i, i + 2), 16)).toBeGreaterThan(128);
  });

  it('a body font change asks for the body token when set font --on body also moves headings', async () => {
    const {data} = await themeEditHow('serif body text', {cwd, theme: 'q'});
    const font = (await themeEditHow('font', {cwd, theme: 'q'})).data;
    const top = data.results[0].commands.map(bare)[0];
    if (/also sets the heading font/.test(font.results[0].text))
      expect(top).toMatch(/^set q --font-family-body /);
    else expect(top).toBe('set q font serif --on body');
  });

  it('runs pass-3 answers through set and checks the built CSS', async () => {
    await themeEditNew('p3', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'themes', 'p3');
    const keep = path.join(cwd, 'p3-pristine');
    fs.cpSync(dir, keep, {recursive: true});
    const css = () => fs.readFileSync(path.join(dir, 'p3.css'), 'utf8');
    for (const [question, want] of /** @type {Array<[string, RegExp[]]>} */ ([
      [
        'accent #0ea5e9; danger #ef4444; success #22c55e',
        [
          /--color-accent:[^;]*#0ea5e9/i,
          /--color-error:[^;]*#ef4444/i,
          /--color-success:[^;]*#22c55e/i,
        ],
      ],
      [
        '- rounder buttons\n- no shadow on cards',
        [/card[^{]*\{[^}]*box-shadow:\s*none/],
      ],
      [
        'buttons have letter-spacing 0.02em and font-weight 500',
        [/button[^{]*\{[^}]*letter-spacing:\s*0\.02em/],
      ],
      [
        'a11y audit: secondary text fails contrast on white',
        [
          /--color-text-secondary:\s*light-dark\(#[0-9a-f]{6},\s*#[0-9a-f]{6}\)/i,
        ],
      ],
      [
        'cards have a gradient background from #ffffff to #f8fafc',
        [/card[^{]*\{[^}]*background:\s*linear-gradient\(#ffffff, #f8fafc\)/],
      ],
      [
        'drop shadow: x 0, y 4, blur 6, spread -1, rgba(0,0,0,0.1)',
        [/--shadow-med:\s*0 4px 6px -1px rgba\(0,0,0,0\.1\)/],
      ],
    ])) {
      fs.rmSync(dir, {recursive: true, force: true});
      fs.cpSync(keep, dir, {recursive: true});
      const {data} = await themeEditHow(question, {cwd, theme: 'p3'});
      const top = data.results.find((/** @type {any} */ r) =>
        r.commands.some((/** @type {string} */ c) => / editor set /.test(c)),
      );
      const commands = top.sequence ? top.commands : [top.commands[0]];
      const before = css();
      for (const c of commands) {
        const [, theme, thing, ...rest] = words(bare(c));
        const fi = rest.findIndex(w => /^--(on|when|state|mode)$/.test(w));
        /** @type {Record<string, string>} */
        const flags = {};
        for (let i = fi < 0 ? rest.length : fi; i < rest.length; i += 2)
          flags[rest[i].slice(2)] = rest[i + 1];
        await themeEditSet(
          theme,
          thing,
          (fi < 0 ? rest : rest.slice(0, fi)).join(' '),
          {cwd, ...flags},
        );
      }
      for (const w of want) {
        expect(before, question).not.toMatch(w);
        expect(css(), question).toMatch(w);
      }
    }
    fs.rmSync(keep, {recursive: true, force: true});
  }, 300_000);
});

describe('how lookups', () => {
  it('maps what a part reads under to the flags set takes, or says why none does', async () => {
    const button = (await themeEditHow('button', {cwd, theme: 'q'})).data;
    const when = button.reads.background.flatMap(
      (/** @type {any} */ r) => r.when,
    );
    expect(when).toContain('--when variant:ghost --state active');
    expect(when.find((/** @type {string} */ w) => /::before/.test(w))).toMatch(
      /not settable: /,
    );
    expect(when).not.toContain('');
    expect(button.states).toEqual(
      expect.arrayContaining(['hover', 'disabled']),
    );
    const tab = (await themeEditHow('tab', {cwd, theme: 'q'})).data;
    expect(JSON.stringify(tab.reads)).toContain('--state selected');
    const card = (await themeEditHow('card', {cwd, theme: 'q'})).data;
    expect(JSON.stringify(card.reads)).not.toMatch(/"selected=true"/);
  });

  it('a part the part data does not have says so, with commands that apply', async () => {
    const {data} = await themeEditHow('tooltip', {cwd, theme: 'q'});
    expect(data.recorded).toBe(false);
    expect(data.unrecorded.reason).toMatch(/what tooltip reads is unknown/);
    expect(data.unrecorded.examples.map(bare)).toContain(
      'set q background "#f3f4f6" --on tooltip',
    );
  });

  it('a token no part reads says whether Core still uses it, and suggests only accepted commands', async () => {
    const ctx = await context(cwd);
    const unread = Object.keys(ctx.project.core.tokenDefaults).find(
      k => /^--text-heading-[56]-size$/.test(k) && !ctx.C.anyReader(k).length,
    );
    if (!unread) return;
    const {data} = await themeEditHow(unread, {cwd, theme: 'q'});
    expect(data.readBy).toEqual([]);
    expect(data.readByNote).toMatch(/readBy is incomplete|does not use it/);
    for (const c of data.examples) expect(await effect([c])).not.toBe('');
  });

  it('reads a subject in any case, singular or plural, with or without dashes', async () => {
    expect((await themeEditHow('Button', {cwd})).data.kind).toBe('part');
    expect((await themeEditHow('Cards', {cwd})).data.kind).toBe('part');
    expect((await themeEditHow('Palette', {cwd})).data.kind).toBe('aspect');
    expect((await themeEditHow('colors?', {cwd})).data.kind).toBe('aspect');
    expect((await themeEditHow('shadows', {cwd})).data.kind).toBe('aspect');
    expect((await themeEditHow('color-accent', {cwd})).data.subject).toBe(
      'color-accent',
    );
    expect((await themeEditHow('-color-accent', {cwd})).data.source).toBe(
      'token',
    );
    for (const word of [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
    ])
      expect((await themeEditHow(word, {cwd})).data.kind).toBe('question');
  });

  it('lists in every common form, and refuses a kind it does not list with the closest first', async () => {
    expect((await themeEditHow('', {cwd, list: 'Parts'})).data.list).toBe(
      'parts',
    );
    expect((await themeEditHow('', {cwd, list: 'token'})).data.list).toBe(
      'tokens',
    );
    expect((await themeEditHow('', {cwd, list: 'kinds'})).data.list).toBe(
      'kinds',
    );
    expect((await themeEditHow('dials', {cwd})).data).toMatchObject({
      kind: 'list',
      list: 'dials',
    });
    const r = await refusal(() => themeEditHow('', {cwd, list: 'tokns'}));
    expect(r.run[0]).toContain('--list tokens');
    const parts = (await themeEditHow('', {cwd, list: 'parts'})).data.items;
    const names = parts.map((/** @type {any} */ x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('the command takes the list kind anywhere, a -- filter, --list=, and refuses --list twice', async () => {
    /** @param {string[]} args */
    const how = async args => {
      const r = await runCli(
        ['--json', 'experimental', 'theme', 'editor', 'how', ...args],
        {cwd},
      );
      return {status: r.status, out: JSON.parse(r.stdout)};
    };
    expect((await how(['accent', '--list', 'tokens'])).out.data).toMatchObject({
      list: 'tokens',
      subject: 'accent',
    });
    expect((await how(['--list=tokens', 'accent'])).out.data.list).toBe(
      'tokens',
    );
    expect(
      (await how(['--list', 'tokens', '--color-text'])).out.data.items.length,
    ).toBeGreaterThan(0);
    const twice = await how(['--list', 'tokens', '--list', 'parts']);
    expect(twice.status).toBe(1);
    expect(twice.out.code).toBe('ERR_INVALID_ARGUMENT');
  }, 60_000);

  it('text and JSON name the same commands, and text escapes control characters', async () => {
    const q = 'remove shadows from cards';
    const json = await runCli(
      ['--json', 'experimental', 'theme', 'editor', 'how', q, '--theme', 'q'],
      {cwd},
    );
    const text = await runCli(
      ['experimental', 'theme', 'editor', 'how', q, '--theme', 'q'],
      {cwd},
    );
    const cmd = JSON.parse(json.stdout).data.results[0].commands[0];
    expect(text.stdout).toContain(cmd);
    const esc = await runCli(
      ['experimental', 'theme', 'editor', 'how', '\u001b]0;x\u0007red buttons'],
      {cwd},
    );
    expect(esc.stdout).not.toContain('\u001b');
    expect(esc.stdout).toContain('\\x1b');
  }, 60_000);

  it('an empty answer carries the hint and the next commands in JSON too', async () => {
    const {data} = await themeEditHow('make it look like Apple', {cwd});
    expect(data.results).toEqual([]);
    expect(data.hint).toMatch(/No match/);
    expect(data.run[0]).toContain('--list parts');
  });
});

describe('how reads pictures within bounds', () => {
  /**
   * A PNG from a header and raw scanlines.
   * @param {{w: number, h: number, depth?: number, type?: number, ihdr?: Buffer, rows?: Buffer, extra?: Buffer[]}} o
   */
  function png({w, h, depth = 8, type = 6, ihdr, rows, extra = []}) {
    /** @param {string} t @param {Buffer} body */
    const chunk = (t, body) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(body.length);
      return Buffer.concat([
        len,
        Buffer.from(t, 'latin1'),
        body,
        Buffer.alloc(4),
      ]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(w, 0);
    header.writeUInt32BE(h, 4);
    header[8] = depth;
    header[9] = type;
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr ?? header),
      ...extra,
      chunk('IDAT', zlib.deflateSync(rows ?? Buffer.alloc(10))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
  /** @param {string} name @param {Buffer} bytes */
  const put = (name, bytes) => fs.writeFileSync(path.join(cwd, name), bytes);

  it('refuses a huge header before taking memory, and pixel data shorter than the header says', async () => {
    put('huge.png', png({w: 100_000, h: 100_000}));
    put('wide.png', png({w: 4_000_000_000, h: 1}));
    put('short.png', png({w: 3000, h: 3000}));
    for (const [f, why] of [
      ['huge.png', /more than 40 million pixels/],
      ['wide.png', /more than 40 million pixels/],
      ['short.png', /cut off/],
    ]) {
      const started = Date.now();
      const r = await refusal(() =>
        themeEditHow(/** @type {string} */ (f), {cwd}),
      );
      expect(r.code).toBe('ERR_INVALID_ARGUMENT');
      expect(r.message).toMatch(why);
      expect(Date.now() - started).toBeLessThan(5000);
    }
  });

  it('refuses damaged files: a bad filter, no palette, a bad depth, a short header', async () => {
    put(
      'filter.png',
      png({w: 1, h: 1, type: 2, rows: Buffer.from([9, 255, 0, 0])}),
    );
    put('nopal.png', png({w: 1, h: 1, type: 3, rows: Buffer.from([0, 0])}));
    put(
      'depth.png',
      png({w: 1, h: 1, type: 2, depth: 1, rows: Buffer.from([0, 255])}),
    );
    put('ihdr.png', png({w: 1, h: 1, ihdr: Buffer.alloc(8)}));
    for (const f of ['filter.png', 'nopal.png', 'depth.png', 'ihdr.png'])
      expect((await refusal(() => themeEditHow(f, {cwd}))).code).toBe(
        'ERR_INVALID_ARGUMENT',
      );
  });

  it('skips see-through pixels in the main colors and gives alpha at points', async () => {
    put(
      'alpha.png',
      png({w: 2, h: 1, rows: Buffer.from([0, 0, 0, 0, 0, 255, 0, 0, 255])}),
    );
    const main = (await themeEditHow('alpha.png', {cwd})).data;
    expect(main.colors.map((/** @type {any} */ c) => c.color)).not.toContain(
      '#000000',
    );
    const at = (await themeEditHow('alpha.png', {cwd, at: ['0,0;1,0']})).data;
    expect(at.points).toEqual([
      {at: '0,0', color: '#000000', alpha: 0},
      {at: '1,0', color: '#ff0000', alpha: 1},
    ]);
  });

  it('reads a picture by any name, and refuses other formats by their bytes', async () => {
    put(
      'shot.image',
      png({w: 1, h: 1, type: 2, rows: Buffer.from([0, 255, 0, 0])}),
    );
    expect((await themeEditHow('shot.image', {cwd})).data.kind).toBe('picture');
    put('photo.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));
    const r = await refusal(() => themeEditHow('photo.jpg', {cwd}));
    expect(r.message).toMatch(/JPEG picture; how reads PNG only/);
    expect((await refusal(() => themeEditHow('missing.png', {cwd}))).code).toBe(
      'ERR_FILE_NOT_FOUND',
    );
  });

  it('refuses --at points it cannot read exactly, and a count beside --at', async () => {
    put('rgb.png', png({w: 4, h: 3, type: 2, rows: Buffer.alloc(39)}));
    for (const at of ['-1,2', '1.5,2.5', 'abc', '', '１,２', '1e2,1', '4,0'])
      expect(
        (await refusal(() => themeEditHow('rgb.png', {cwd, at: [at]}))).code,
      ).toBe('ERR_INVALID_ARGUMENT');
    expect(
      (
        await refusal(() =>
          themeEditHow('rgb.png', {cwd, at: ['1,1'], count: 3}),
        )
      ).code,
    ).toBe('ERR_INVALID_ARGUMENT');
    expect(parsePoints(['1,2;3,4', '5,6 7,8,9,10'])).toHaveLength(5);
  });

  it('reads every pixel of a small picture, honors tRNS for RGB, and names a 0x0 size', async () => {
    // White at x=0, blue at x=1: the blue line is not skipped.
    put(
      'two.png',
      png({
        w: 2,
        h: 1,
        type: 2,
        rows: Buffer.from([0, 255, 255, 255, 0, 0, 255]),
      }),
    );
    const two = (await themeEditHow('two.png', {cwd})).data;
    expect(two.colors.map((/** @type {any} */ c) => c.color).sort()).toEqual([
      '#0000ff',
      '#ffffff',
    ]);
    // tRNS names white as see-through, so only red is left.
    const trns = Buffer.concat([
      Buffer.from([0, 0, 0, 6]),
      Buffer.from('tRNS', 'latin1'),
      Buffer.from([0, 255, 0, 255, 0, 255]),
      Buffer.alloc(4),
    ]);
    put(
      'key.png',
      png({
        w: 2,
        h: 1,
        type: 2,
        rows: Buffer.from([0, 255, 255, 255, 255, 0, 0]),
        extra: [trns],
      }),
    );
    const key = (await themeEditHow('key.png', {cwd})).data;
    expect(key.colors.map((/** @type {any} */ c) => c.color)).toEqual([
      '#ff0000',
    ]);
    put('empty.png', png({w: 0, h: 5}));
    expect(
      (await refusal(() => themeEditHow('empty.png', {cwd}))).message,
    ).toMatch(/0x5 pixels/);
    // A 16-bit picture is capped lower: it takes twice the memory.
    put('deep.png', png({w: 5000, h: 5000, depth: 16, type: 6}));
    expect(
      (await refusal(() => themeEditHow('deep.png', {cwd}))).message,
    ).toMatch(/16 bits per channel/);
  });

  it('the command refuses a count that is not a positive whole number', async () => {
    for (const n of ['-3', '2.5', 'abc']) {
      const r = await runCli(
        ['--json', 'experimental', 'theme', 'editor', 'how', 'rgb.png', n],
        {cwd},
      );
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).code).toBe('ERR_INVALID_ARGUMENT');
    }
  }, 60_000);
});

describe('the part data cache', () => {
  it('a cache file with the wrong shape is built again', async () => {
    const ctx = await context(cwd);
    const file = path.join(ctx.project.cacheDir, 'parts.json');
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({...d, map: null, pairs: null}));
    const {data} = await themeEditHow('card', {cwd});
    expect(data.kind).toBe('part');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).map).toBeTruthy();
  }, 120_000);
});
