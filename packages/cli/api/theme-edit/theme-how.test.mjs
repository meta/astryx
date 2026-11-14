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
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

// The page renders cost seconds and these tests read settings, builds and
// files: a stand-in renders unless a test asks for the real thing.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

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

/** A command without the CLI prefix: `set q corners more --on button`. @param {string} c */
const bare = c => c.replace(/^.*? experimental theme (editor )?/, '');

/** The words of a command, as a shell splits them. @param {string} c */
const words = c =>
  [...c.matchAll(/(?:'[^']*'|"(?:[^"\\]|\\.)*"|[^\s'"]+)+/g)].map(m =>
    [...m[0].matchAll(/'([^']*)'|"((?:[^"\\]|\\.)*)"|([^\s'"]+)/g)]
      .map(x => x[1] ?? x[2]?.replace(/\\(.)/g, '$1') ?? x[3])
      .join(''),
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
      top: /^set q background '#7c3aed' --on button --when variant:primary$/,
      adds: /button\.variant:primary\.background=#7c3aed/,
    },
  ],
  [
    'change the brand color to #ff6600',
    {
      aspects: ['colors'],
      top: /^set q accent '#ff6600'$/,
      adds: /--color-accent(\.0)?=#ff6600/,
    },
  ],
  [
    'use our brand orange',
    {top: /^set q accent '#f97316'$/, adds: /--color-accent(\.0)?=#f97316/},
  ],
  [
    'make the error red darker',
    {
      // The seed, then the dark half stepped darker from its own value.
      top: /^set q danger '#[0-9a-f]{6}' && set q --color-error '#[0-9a-f]{6}' --mode dark$/,
      adds: /--color-error(\.0)?=#[0-9a-f]{6}/,
    },
  ],
  [
    'success green should be more minty',
    {top: /^set q success '#34d399'$/, adds: /--color-success(\.0)?=#34d399/},
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
    {top: /^set q neutral '#78716c'$/, adds: /--color-background-surface/},
  ],
  [
    'make the page background white',
    {
      top: /^set q --color-background-body '#ffffff'$/,
      adds: /--color-background-body=#ffffff/,
    },
  ],
  [
    'card background light gray',
    {
      parts: ['card'],
      top: /^set q background '#e5e7eb' --on card$/,
      adds: /card\.base\.background=#e5e7eb/,
    },
  ],
  [
    'header background navy',
    {
      parts: ['app-shell-header'],
      top: /^set q background '#1e3a8a' --on app-shell-header$/,
      adds: /app-shell-header\.base\.background=#1e3a8a/,
    },
  ],
  [
    'white text in the header',
    {
      parts: ['app-shell-header'],
      aspects: ['text'],
      top: /^set q color '#ffffff' --on app-shell-header$/,
      adds: /app-shell-header\.base\.color=#ffffff/,
    },
  ],
  [
    'links should be accent colored',
    {
      parts: ['link'],
      // A color on link loses to the color prop's own rule, so no command
      // is offered; the refusal says why.
      top: null,
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
      top: /^set q --color-text-secondary '#[0-9a-f]{6}' --mode light && set q --color-text-secondary '#[0-9a-f]{6}' --mode dark$/,
      adds: /--color-text-secondary/,
    },
  ],
  [
    'change the focus ring color to orange',
    {
      top: /^set q --focus-outline-color '#f97316'$/,
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
      top: /^set q background '#2563eb' --on switch --state checked$/,
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
      top: /^set q --color-background-body '#000000' --mode dark$/,
      adds: /--color-background-body\.1=#000000/,
    },
  ],
  [
    'in dark mode make cards slightly lighter',
    {
      parts: ['card'],
      // Each card variant from its own fill, dark mode only.
      top: /--on card( --when variant:default)? --mode dark( && |$)/,
      adds: /card\.variant:default\.background(Color)?=/,
    },
  ],
  [
    'tooltip black with white text',
    {
      parts: ['tooltip'],
      top: /background '#000000' --on tooltip && set q color '#ffffff' --on tooltip$/,
      adds: /tooltip\.base\.color=#ffffff/,
    },
  ],
  [
    'disabled buttons look too faded',
    {
      top: /^set q opacity 0\.8 --on button --state disabled$/,
      adds: /aria-disabled.*opacity=0\.8/,
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
      top: /^set q background '#f97316' --on button --when variant:destructive$/,
      adds: /button\.variant:destructive\.background=#f97316/,
    },
  ],
  [
    'glossy gradient header',
    {
      top: /^set q background 'linear-gradient\(.*\)' --on app-shell-header$/,
      adds: /app-shell-header\.base\.background=linear-gradient/,
    },
  ],
  // borders
  [
    'add a border to cards',
    {
      aspects: ['border'],
      top: /^set q border '1px solid var\(--color-border\)' --on card$/,
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
      top: /^set q border-color '#9ca3af' --on inputs$/,
      adds: /text-input\.base\.borderColor=#9ca3af/,
    },
  ],
  [
    'dashed border around the banner',
    {
      top: /^set q border '1px dashed var\(--color-border\)' --on banner$/,
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
      top: /^set q border-color '#2563eb' --on inputs --state focus-within$/,
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
      // The dialog already reads the strongest shared shadow: that shadow,
      // its colors stronger (never the same shadow again).
      top: /^set q box-shadow '(?!var\(--shadow-high\)).+' --on dialog$/,
      adds: /dialog\.base\.boxShadow=/,
    },
  ],
  [
    'subtle shadow on buttons',
    {
      top: /box-shadow 'var\(--shadow-low\)' --on button$/,
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
      top: /box-shadow 'inset .*' --on button$/,
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
      top: /^set q --shadow-low '[^']+' && set q --shadow-med/,
      adds: /--shadow-low=/,
    },
  ],
  [
    'box-shadow: 0 0 10px red on button',
    {
      top: /^set q box-shadow '0 0 10px red' --on button$/,
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
      adds: /card\.base\.borderRadius=12px/,
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
      // Each member that shows a radius of its own keeps it; a member that
      // takes its corners from a part inside it gets no invented one.
      top: /^set q corners more( && set q border-radius \S+ --on [a-z-]+ --only)+$/,
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
  // A prohibition changes nothing (it says what stays).
  ["don't make the buttons bold", {top: null}],
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
      top: /^set q transform 'scale\(0\.97\)' --on button --state active$/,
      adds: /:active\.transform=scale/,
    },
  ],
  [
    'selected table row light blue',
    {
      parts: ['table-row'],
      // Core paints the selected wash inline from this token.
      top: /^set q --color-accent-muted '#[0-9a-f]{6}' --on table-row --state selected$/,
      adds: /table-row\.selected\.--color-accent-muted=#/,
    },
  ],
  ['dark mode only', {top: /^set q mode dark-only$/, adds: /mode=dark-only/}],
  [
    'make dark mode text less bright',
    {
      top: /--color-text-primary '#[0-9a-f]{6}' --mode dark$/,
      adds: /--color-text-primary\.1=/,
    },
  ],
  [
    'dark mode accent lighter',
    {
      top: /--color-accent '#[0-9a-f]{6}' --mode dark$/,
      adds: /--color-accent\.1=/,
    },
  ],
  // Wider scales the part's own width; a part with none says so, never a
  // made-up 720px width.
  ['dialog wider', {top: null}],
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
      top: /--on card && set q box-shadow 'var\(--shadow-low\)' --on card && set q border none --on card$/,
      adds: /card\.base\.border=none/,
    },
  ],
  [
    'make the header dark with white text and a bottom border',
    {
      top: /background '#1f2937' --on app-shell-header && set q color '#ffffff'/,
      adds: /borderBottom=/,
    },
  ],
  [
    'not blue, make the accent green',
    {top: /^set q accent '#16a34a'$/, adds: /--color-accent(\.0)?=#16a34a/},
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
      top: /^set q background '#2563eb' --on button$/,
      adds: /button\.base\.background=#2563eb/,
    },
  ],
  [
    'set button background to rgb(255 0 0)',
    {
      top: /^set q background 'rgb\(255 0 0\)' --on button$/,
      adds: /button\.base\.background=rgb\(255 0 0\)/,
    },
  ],
  [
    'use #123 for borders',
    {top: /^set q --color-border '#123'$/, adds: /--color-border=#123/},
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
      top: /^set q --color-text-primary '#1f2937' --mode light$/,
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
      // The danger variant keeps the fill (and the text on it) the base
      // theme gives it.
      top: /--on button && set q background 'var\(--color-error(-muted)?\)' --on button --when variant:destructive( && set q color 'var\(--color-on-error(-muted)?\)' --on button --when variant:destructive)?$/,
      adds: /variant:destructive\.background=var\(--color-error(-muted)?\)/,
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
    {top: /^set q accent '#0057ff'$/, adds: /--color-accent(\.0)?=#0057ff/},
  ],
  [
    'like Linear: dark only, purple accent #5e6ad2',
    {
      top: /^set q mode dark-only && set q accent '#5e6ad2'$/,
      adds: /mode=dark-only/,
    },
  ],
  [
    'gray text color #555',
    {
      // #555 on the dark page would not be readable: light mode only.
      top: /^set q --color-text-primary '#555' --mode light$/,
      adds: /--color-text-primary\.0=#555/,
    },
  ],
  ['accent #12345', {top: null, text: /"#12345" is not a color/}],
  [
    'primary #5E6AD2, radius 6px, font Inter',
    {
      top: /^set q accent '#5e6ad2' && set q corners 6px && set q font inter$/,
      adds: /--radius-element=6px/,
    },
  ],
  [
    '{"accent":"#3b82f6","radius":"8px"}',
    {
      top: /^set q accent '#3b82f6' && set q corners 8px$/,
      adds: /--radius-element=8px/,
    },
  ],
  // A signed length after a property is a change by it: 4px less radius.
  [
    'radius -4px on cards',
    {
      top: /^set q border-radius .*- 4px.* --on card$|^set q border-radius \d+(\.\d+)?px --on card$/,
    },
  ],
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
      adds: /aria-disabled.*opacity=0\.4/,
    },
  ],
  [
    'button padding 12px 20px',
    {
      top: /^set q padding '12px 20px' --on button$/,
      adds: /button\.base\.padding=12px 20px/,
    },
  ],
  [
    'card shadow: 0 1px 3px rgb(0 0 0 / 0.1)',
    {
      top: /^set q box-shadow '0 1px 3px rgb\(0 0 0 \/ 0\.1\)' --on card$/,
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
      top: /^set q background '#1c1c1e' --on card --mode dark$/,
      adds: /card\.variant:default\.backgroundColor=light-dark\(/,
    },
  ],
  [
    'only in dark mode make the buttons pill',
    {top: null, text: /same in light and dark/},
  ],
  [
    'make dark mode borders subtler',
    {
      top: /^set q --color-border '#[0-9a-f]{6,8}' --mode dark$/,
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
      top: /--on side-nav && set q background '#9ca3af' --on side-nav-item$/,
      adds: /side-nav-item\.base\.background=#9ca3af/,
    },
  ],
  [
    'focus-visible ring on buttons orange',
    {
      top: /^set q outline-color '#f97316' --on button --state focus-visible$/,
      adds: /:focus-visible\.outlineColor=#f97316/,
    },
  ],
  [
    'tabs: selected tab has a 2px #6366f1 underline',
    {
      top: /^set q background '#6366f1' --on tab-indicator --state selected && set q height 2px --on tab-indicator$/,
      adds: /tab-indicator\.selected\.background=#6366f1/,
    },
  ],
  [
    'cards lift on hover',
    {
      top: /^set q box-shadow 'var\(--shadow-high\)' --on card --state hover$/,
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
      top: /^set q --color-icon-primary 'var\(--color-accent\)'$/,
      adds: /--color-icon-primary=var\(--color-accent\)/,
    },
  ],
  [
    'darker borders',
    {
      top: /^set q --color-border '#[0-9a-f]+' --mode light && set q --color-border '#[0-9a-f]+' --mode dark$/,
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
      top: /^set q --color-overlay '#[0-9a-f]+' --mode light && set q --color-overlay '#[0-9a-f]+' --mode dark$/,
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
    {top: /^set q neutral '#78716c'$/, adds: /--color-background-surface/},
  ],
  [
    'swap the accent and the danger colors',
    {
      top: /^set q accent '#[0-9a-f]{6}' && set q danger '#[0-9a-f]{6}'$/i,
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
    {top: /^set q accent '#ff6600'$/, adds: /--color-accent(\.0)?=#ff6600/},
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
      top: /^set q box-shadow '(?!var\(--shadow-high\)).+' --on dialog$/,
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
      top: /^set q background '#2563eb' --on button$/,
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
        /card[^{]*\{[^}]*background-color:\s*light-dark\(.*#1c1c1e/,
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
      top: /^set q accent '#0ea5e9' && set q danger '#ef4444' && set q success '#22c55e'$/,
      adds: /--color-accent[^\n]*=#0ea5e9[\s\S]*--color-error[^\n]*=#ef4444[\s\S]*--color-success[^\n]*=#22c55e|--color-success[^\n]*=#22c55e/,
    },
  ],
  [
    'like Bootstrap 5: #0d6efd primary, 6px radius',
    {
      top: /^set q accent '#0d6efd' && set q corners 6px$/,
      adds: /--color-accent[^\n]*=#0d6efd/,
    },
  ],
  [
    'make it look like Google: Roboto font, accent #1a73e8',
    {
      top: /^set q font roboto && set q accent '#1a73e8'$/,
      adds: /--color-accent[^\n]*=#1a73e8/,
    },
  ],
  [
    'brand colors: primary #ff5a1f, secondary #1f2937',
    {
      top: /^set q accent '#ff5a1f' && set q background '#1f2937' --on button --when variant:secondary$/,
      adds: /--color-accent[^\n]*=#ff5a1f/,
    },
  ],
  [
    'colors: bg=#fff text=#000 accent=#ff0080',
    {
      top: /^set q --color-background-body '#fff' && set q --color-text-primary '#000' && set q accent '#ff0080'$/,
      adds: /--color-background-body=#fff/,
    },
  ],
  [
    'hex values in the mock: #FAFAFA bg, #171717 text, #E5E5E5 border, #0070F3 accent',
    {
      top: /^set q --color-background-body '#fafafa' && set q --color-text-primary '#171717' && set q --color-border '#e5e5e5' && set q accent '#0070f3'$/,
      adds: /--color-border=#e5e5e5/,
    },
  ],
  [
    'LGTM except the accent, make it #6d28d9',
    {top: /^set q accent '#6d28d9'$/, adds: /--color-accent[^\n]*=#6d28d9/},
  ],
  [
    'not a fan of the purple, can we go back to blue?',
    {top: /^set q accent '#2563eb'$/},
  ],
  [
    'Airbnb: accent #ff385c, rounded 12px cards, Circular font',
    {
      top: /^set q accent '#ff385c' && set q border-radius 12px --on card && set q font Circular$/,
    },
  ],
  // colors how works out are per mode
  [
    'more contrast',
    {
      top: /^set q --color-text-secondary '#[0-9a-f]+' --mode light && set q --color-text-secondary '#[0-9a-f]+' --mode dark && set q --color-border '#[0-9a-f]+' --mode light && set q --color-border '#[0-9a-f]+' --mode dark$/,
      text: /in light and in dark mode/,
    },
  ],
  [
    'a11y audit: secondary text fails contrast on white',
    {
      top: /^set q --color-text-secondary '#[0-9a-f]{6}' --mode light && set q --color-text-secondary '#[0-9a-f]{6}' --mode dark$/,
    },
  ],
  [
    'make the page background lighter',
    {
      top: /--mode light && set q --color-background-body '#[0-9a-f]+' --mode dark$/,
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
      top: /^set q --shadow-med '0 4px 6px -1px rgba\(0,0,0,0\.1\)'$/,
      adds: /--shadow-med=0 4px 6px -1px/,
    },
  ],
  [
    "let's ditch the borders on inputs",
    {top: /^set q border none --on inputs$/, adds: /\.border=none/},
  ],
  ['swap Inter for Manrope everywhere', {top: /^set q font manrope$/}],
  // a swap only between two values of one kind; other words are kept
  [
    'replace the shadow on cards with a border',
    {
      top: /^set q box-shadow none --on card && set q border '1px solid var\(--color-border\)' --on card$/,
      adds: /card\.base\.boxShadow=none[\s\S]*card\.base\.border=1px solid/,
    },
  ],
  [
    'switch off the shadow on cards with a border',
    {
      top: /^set q box-shadow none --on card && set q border '1px solid var\(--color-border\)' --on card$/,
      adds: /card\.base\.boxShadow=none/,
    },
  ],
  [
    'switch the buttons to pill shape with bold text',
    {
      top: /^set q corners pill --on button && set q font-weight 700 --on button$/,
      adds: /button\.base\.fontWeight=700/,
    },
  ],
  ['make the switch green', {top: /^set q background '#16a34a' --on switch$/}],
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
      top: /^set q filter 'brightness\(0\.85\)' --on tooltip$/,
      adds: /tooltip\.base\.filter/,
    },
  ],
  [
    'make inputs taller (44px)',
    {top: /^set q min-height 44px --on inputs$/, adds: /minHeight=44px/},
  ],
  [
    'stakeholders think the grays are too warm',
    {top: /^set q neutral '#64748b'$/},
  ],
  // typed values kept
  [
    'cards have a gradient background from #ffffff to #f8fafc',
    {
      top: /^set q background 'linear-gradient\(#ffffff, #f8fafc\)' --on card$/,
      adds: /card\.base\.background=linear-gradient\(#ffffff, #f8fafc\)/,
    },
  ],
  [
    'shadow on dialogs is 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    {
      top: /^set q box-shadow '0 20px 25px -5px rgb\(0 0 0 \/ 0\.1\), 0 8px 10px -6px rgb\(0 0 0 \/ 0\.1\)' --on dialog$/,
    },
  ],
  [
    'shadows are very soft and large, like 0 10px 40px rgba(0,0,0,0.05)',
    {top: /^set q --shadow-med '0 10px 40px rgba\(0,0,0,0\.05\)'$/},
  ],
  [
    'headings use "Playfair Display", body uses "Source Sans 3"',
    {
      top: /^set q font 'Playfair Display' --on heading && set q (font 'Source Sans 3' --on body|--font-family-body )/,
    },
  ],
  [
    'border width is 2px everywhere, color #000',
    {top: /^set q --border-width 2px && set q --color-border '#000'$/},
  ],
  // parts
  [
    'the table has zebra rows #f9fafb and a header #f3f4f6',
    {top: /^set q background '#f3f4f6' --on table-header-cell$/},
  ],
  [
    'the error banner is #fef2f2 with #991b1b text',
    {
      top: /^set q background '#fef2f2' --on banner --when status:error && set q color '#991b1b' --on banner --when status:error$/,
    },
  ],
  ['button color #fff', {top: /^set q color '#fff' --on button$/}],
  [
    'accent #ff0000 */ body{display:none} /*',
    {top: /^set q accent '#ff0000'$/},
  ],
  // other languages
  ['pulsanti senza ombra', {top: /^set q box-shadow none --on button$/}],
  ['цвет акцента #00aa55', {top: /^set q accent '#00aa55'$/}],
  ['카드 그림자 없애줘', {top: /^set q box-shadow none --on card$/}],
  ['الأزرار مستديرة', {top: /^set q corners round --on button$/}],
  ['बटन गोल करो', {top: /^set q corners round --on button$/}],
  [
    'cards sin sombra y botones azules',
    {
      top: /^set q box-shadow none --on card && set q background '#2563eb' --on button$/,
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
    const dark = cmds.join(' ').match(/'(#[0-9a-f]{6})' --mode dark/)?.[1];
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

/**
 * Final-pass questions: polarity, two-word names, list markers, parts the
 * questions name, per-mode values and guards.
 * @type {Array<[string, {top: RegExp | null, adds?: RegExp, text?: RegExp}]>}
 */
const QUESTIONS_F = [
  // "flat" and the other polarity misses
  [
    'flat cards',
    {
      top: /^set q box-shadow none --on card$/,
      adds: /card\.base\.boxShadow=none/,
    },
  ],
  [
    '• pill buttons\n• flat cards',
    {
      top: /^set q corners pill --on button && set q box-shadow none --on card$/,
    },
  ],
  ['the corners are not round enough', {top: /^set q corners more$/}],
  ['buttons are not rounded enough', {top: /^set q corners more --on button$/}],
  [
    'nothing should be rounded except avatars',
    {top: /^set q corners square && set q border-radius 9999px --on avatar$/},
  ],
  [
    'the shadows are too strong',
    // Each shared shadow from its own layers, its colors fainter (both
    // modes kept), never a stock light-mode set.
    {top: /^set q --shadow-low '.*light-dark\(/},
  ],
  [
    'card shadows too strong',
    {top: /^set q box-shadow 'var\(--shadow-low\)' --on card$/},
  ],
  ['not so much padding on cards', {top: /^set q spacing less --on card$/}],
  // "border radius" in two words is the radius
  [
    'Use 0.75rem border radius everywhere',
    {top: /^set q corners 12px$/, adds: /--radius-element=12px/},
  ],
  ['8px border radius on cards', {top: /^set q border-radius 8px --on card$/}],
  // font names of several words
  ['DM Sans font', {top: /^set q font dm-sans$/}],
  ['font IBM Plex Sans', {top: /^set q font ibm-plex-sans$/}],
  ['use IBM Plex Sans', {top: /^set q font ibm-plex-sans$/}],
  ['font Geist Mono', {top: /^set q font geist-mono$/}],
  ['JetBrains Mono for code', {top: /^set q font jetbrains-mono --on code$/}],
  ['font Roboto Mono', {top: /^set q font 'Roboto Mono'$/}],
  ['Source Sans 3 font', {top: /^set q font 'Source Sans 3'$/}],
  [
    'boutons sans-serif font',
    {top: /^set q font-family system-ui --on button$/},
  ],
  [
    'IBM Carbon: square corners, IBM Plex Sans, accent #0f62fe',
    {
      top: /^set q corners square && set q font ibm-plex-sans && set q accent '#0f62fe'$/,
    },
  ],
  // meanings
  [
    'the borders are too dark',
    {
      top: /^set q --color-border '#[0-9a-f]+' --mode light && set q --color-border '#[0-9a-f]+' --mode dark$/,
    },
  ],
  [
    'page should be off-white',
    {top: /^set q --color-background-body '#fafafa'$/},
  ],
  ['headings are way too big', {top: /^set q type compact$/}],
  [
    'dark mode text should be #e5e5e5 not pure white',
    {top: /^set q --color-text-primary '#e5e5e5' --mode dark$/},
  ],
  // list markers and key=value
  [
    '1) square corners 2) no shadows 3) accent #111111',
    {
      top: /^set q corners square && set q --shadow-low none && set q --shadow-med none && set q --shadow-high none && set q accent '#111111'$/,
    },
  ],
  [
    'Feedback round 2:\n- rounder buttons',
    {top: /^set q corners more --on button$/},
  ],
  // a number ending a sentence is a value, not a list marker
  [
    'Use radius 8. Shadows off.',
    {
      top: /^set q corners 8px && set q --shadow-low none && set q --shadow-med none && set q --shadow-high none$/,
      adds: /--radius-element=8px/,
    },
  ],
  [
    'primary=#7c3aed radius=10 font=Geist',
    {top: /^set q accent '#7c3aed' && set q corners 10px && set q font geist$/},
  ],
  [
    'Notes:\n * headings bolder\n * body text 16px',
    {top: /^set q headings bold && set q text-size 16$/},
  ],
  // links read the accent text token
  [
    'Make the link color #2563eb',
    {
      top: /^set q --color-text-accent '#2563eb'$/,
      adds: /--color-text-accent=#2563eb/,
    },
  ],
  [
    'hovered links #1d4ed8',
    {top: /^set q --color-text-accent '#1d4ed8' --on link --state hover$/},
  ],
  // parts
  [
    'Remove the border from Table cells',
    {top: /^set q border none --on table-cell$/},
  ],
  [
    'the menu items have 6px radius',
    {top: /^set q border-radius 6px --on dropdown-menu-item$/},
  ],
  [
    'radio buttons accent color when checked',
    {
      top: /^set q background 'var\(--color-accent\)' --on radio-indicator --state checked --only$/,
    },
  ],
  [
    'success badge green #dcfce7 with #166534 text',
    {
      top: /^set q background '#dcfce7' --on badge --when variant:success && set q color '#166534' --on badge --when variant:success$/,
    },
  ],
  [
    'Disable shadows on Card and Dialog',
    {
      top: /^set q box-shadow none --on card && set q box-shadow none --on dialog$/,
    },
  ],
  [
    'match the header color to the sidebar (#1e293b)',
    {top: /^set q background '#1e293b' --on app-shell-header$/},
  ],
  [
    'Notion look: serif headings, no shadows',
    {
      top: /^set q font serif --on heading && set q --shadow-low none && set q --shadow-med none && set q --shadow-high none$/,
    },
  ],
  [
    'textarea min height 120px',
    {top: /^set q min-height 120px --on text-area --only$/},
  ],
  [
    'select dropdown 40px tall',
    {top: /^set q min-height 40px --on selector --only$/},
  ],
  [
    'skeleton loaders lighter',
    {
      top: /--on skeleton --mode light && set q background '#[0-9a-f]+' --on skeleton --mode dark$/,
    },
  ],
  [
    'make the tooltip text bigger',
    {top: /^set q font-size [\d.]+rem --on tooltip$/},
  ],
  // values
  // A bare percent radius is an oval in CSS, not a share of the radius
  // now: refused with the command that scales the radius.
  ['card radius 50%', {top: null, text: /how 'card radius 50% of now'/}],
  ['button padding 8', {top: /^set q padding 8px --on button$/}],
  [
    'in light mode the accent is #2563eb, in dark mode #60a5fa',
    {
      top: /^set q --color-accent '#2563eb' --mode light && set q --color-accent '#60a5fa' --mode dark$/,
    },
  ],
  [
    'Duolingo vibes: green #58cc02, very rounded, bold',
    {
      top: /^set q accent '#58cc02' && set q corners round && set q --text-body-weight 700$/,
    },
  ],
  ['I hate the purple, make it orange', {top: /^set q accent '#f97316'$/}],
  // the page never takes the text color; a text color stays readable
  [
    'I want the theme to feel calm and professional, similar to the tools our customers already use, with nothing too flashy, good contrast for accessibility, and readable type at small sizes; the brand color is a deep teal #0f766e and we never use pure black text, we prefer #1f2937 for body copy.',
    {
      top: /^set q accent '#0f766e' && set q --color-text-primary '#1f2937' --mode light$/,
    },
  ],
  [
    'body text #333333',
    {
      top: /^set q --color-text-primary '#333333' --mode light$/,
      text: /would not be readable/,
    },
  ],
  // swaps keep working
  [
    'make buttons pill shaped and the header dark',
    {
      top: /^set q corners pill --on button && set q background '#[0-9a-f]+' --on app-shell-header$/,
    },
  ],
  [
    'the dialogs look too flat, can we add some shadow',
    {top: /^set q box-shadow 'var\(--shadow-med\)' --on dialog$/},
  ],
];

describe('how answers final-pass questions', () => {
  for (const [question, want] of QUESTIONS_F)
    it(question.replace(/\n/g, ' / ').slice(0, 90), async () => {
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
      if (want.adds) expect(await effect(commands)).toMatch(want.adds);
    });

  it('"what does <dial> <value> do" gets the dial lookup, not a change', async () => {
    const {data} = await themeEditHow('what does spacing more do', {
      cwd,
      theme: 'q',
    });
    expect(['setting', 'aspect']).toContain(data.kind);
    expect(JSON.stringify(data)).toMatch(/spacing/);
  });

  it('finds the app themes from a subfolder', async () => {
    const sub = path.join(cwd, 'src', 'deep');
    fs.mkdirSync(sub, {recursive: true});
    const pkg = path.join(cwd, 'package.json');
    const made = !fs.existsSync(pkg);
    if (made)
      fs.writeFileSync(
        pkg,
        JSON.stringify({dependencies: {'@astryxdesign/core': '*'}}),
      );
    try {
      const {data} = await themeEditHow('rounder buttons', {
        cwd: sub,
        theme: 'q',
      });
      expect(data.theme).toBe('q');
      expect(data.results[0].commands.map(bare)[0]).toBe(
        'set q corners more --on button',
      );
      // A picture named from the subfolder opens from there, as the CLI
      // passes it (the words as typed) and as a subject.
      const chunk = (/** @type {string} */ t, /** @type {Buffer} */ body) => {
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
      header.writeUInt32BE(1, 0);
      header.writeUInt32BE(1, 4);
      header[8] = 8;
      header[9] = 2;
      fs.writeFileSync(
        path.join(sub, 'shot.png'),
        Buffer.concat([
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          chunk('IHDR', header),
          chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0]))),
          chunk('IEND', Buffer.alloc(0)),
        ]),
      );
      for (const opts of [{words: ['shot.png']}, {}]) {
        const shot = (
          await themeEditHow('shot.png', {cwd: sub, theme: 'q', ...opts})
        ).data;
        expect(shot.kind).toBe('picture');
        expect(JSON.stringify(shot)).toMatch(/#ff0000/);
      }
    } finally {
      if (made) fs.rmSync(pkg);
      fs.rmSync(path.join(cwd, 'src'), {recursive: true, force: true});
    }
  });

  it('runs final-pass answers through set and checks the built CSS', async () => {
    await themeEditNew('pf', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'themes', 'pf');
    const keep = path.join(cwd, 'pf-pristine');
    fs.cpSync(dir, keep, {recursive: true});
    const css = () => fs.readFileSync(path.join(dir, 'pf.css'), 'utf8');
    for (const [question, want] of /** @type {Array<[string, RegExp[]]>} */ ([
      ['flat cards', [/card[^{]*\{[^}]*box-shadow:\s*none/]],
      ['Use 0.75rem border radius everywhere', [/--radius-element:\s*12px/]],
      ['Make the link color #2563eb', [/--color-text-accent:[^;]*#2563eb/i]],
      [
        'in light mode the accent is #2563eb, in dark mode #60a5fa',
        [/--color-accent:\s*light-dark\(#2563eb,\s*#60a5fa\)/i],
      ],
      [
        'success badge green #dcfce7 with #166534 text',
        [/badge[^{]*success[^{]*\{[^}]*background(-color)?:\s*#dcfce7/i],
      ],
      ['the borders are too dark', [/--color-border:\s*light-dark\(/]],
    ])) {
      fs.rmSync(dir, {recursive: true, force: true});
      fs.cpSync(keep, dir, {recursive: true});
      const {data} = await themeEditHow(question, {cwd, theme: 'pf'});
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

/**
 * Final-2 questions: synonyms kept through the catalog move, named CSS
 * properties and typed values kept whole, gray stops, fonts any machine
 * has, part words how cannot name, and questions about the tool.
 * @type {Array<[string, {top: RegExp | null, adds?: RegExp, text?: RegExp}]>}
 */
const QUESTIONS_G = [
  // synonyms and typos
  [
    'the modal needs 24px padding',
    {
      top: /^set q padding 24px --on dialog$/,
      adds: /dialog\.base\.padding(BlockStart|BlockEnd|InlineStart|InlineEnd)=24px/,
    },
  ],
  ['modal rounder', {top: /^set q corners more --on dialog$/}],
  ['carrd rounder', {top: /^set q corners more --on card$/}],
  [
    'divider lines #e5e7eb',
    {top: /^set q --color-border '#e5e7eb' --on divider$/},
  ],
  // a CSS property named in the question is set as named
  [
    'inputs caret-color #2563eb',
    {
      top: /^set q caret-color '#2563eb' --on inputs$/,
      adds: /caretColor=#2563eb/,
    },
  ],
  [
    'card background color-mix(in srgb, #2563eb 10%, white)',
    {
      top: /^set q background 'color-mix\(in srgb, #2563eb 10%, white\)' --on card$/,
    },
  ],
  [
    'outline-offset 3px on buttons when focused',
    {top: /^set q outline-offset 3px --on button --state focus-visible$/},
  ],
  [
    'text-shadow 0 1px 0 rgba(0,0,0,.2) on headings',
    {top: /^set q text-shadow '0 1px 0 rgba\(0,0,0,\.2\)' --on heading$/},
  ],
  [
    'give links text-underline-offset: 4px',
    {top: /^set q text-underline-offset 4px --on link$/},
  ],
  [
    'checkbox accent-color #db2777',
    {top: /^set q accent-color '#db2777' --on checks$/},
  ],
  [
    'badges font-variant-numeric: tabular-nums',
    {top: /^set q font-variant-numeric tabular-nums --on badge$/},
  ],
  [
    'headings text-wrap balance',
    {top: /^set q text-wrap balance --on heading$/},
  ],
  [
    'button transition: background-color 150ms ease',
    {top: /^set q transition 'background-color 150ms ease' --on button$/},
  ],
  // typed values kept whole
  [
    'card padding clamp(12px, 2vw, 24px)',
    {
      top: /^set q padding 'clamp\(12px, 2vw, 24px\)' --on card$/,
      // Core splits padding at every space: each side is written whole.
      adds: /card\.base\.padding(BlockStart|BlockEnd|InlineStart|InlineEnd)=clamp\(12px, 2vw, 24px\)/,
    },
  ],
  [
    'button min-height calc(2rem + 4px)',
    {top: /^set q min-height 'calc\(2rem \+ 4px\)' --on button$/},
  ],
  [
    'card border-radius 12px 12px 0 0',
    {top: /^set q border-radius '12px 12px 0 0' --on card$/},
  ],
  [
    'card padding-block 20px, padding-inline 16px',
    {
      top: /^set q padding-block 20px --on card && set q padding-inline 16px --on card$/,
    },
  ],
  [
    'headings line-height: normal',
    {top: /^set q line-height normal --on heading$/},
  ],
  ['font-size: 0 on buttons', {top: null, text: /hides the text/}],
  // a typed color is the target
  [
    'the danger red is too bright, use #b91c1c instead',
    {top: /^set q danger '#b91c1c'$/},
  ],
  // gray stops and named grays
  [
    'page background gray-50',
    {top: /^set q --color-background-body '#f[0-9a-f]{5}'$/},
  ],
  [
    'text zinc-900',
    {top: /^set q --color-text-primary '#1[0-9a-f]{5}' --mode light$/},
  ],
  [
    'charcoal text instead of black',
    {top: /^set q --color-text-primary '#333333' --mode light$/},
  ],
  // fonts any machine has, and typed names
  [
    'Plus Jakarta Sans as the main font',
    {top: /^set q font 'Plus Jakarta Sans'$/},
  ],
  ['use the default Mac font', {top: /^set q font system$/}],
  [
    'switch the typeface to Helvetica Neue',
    {top: /^set q font 'Helvetica Neue'$/},
  ],
  ['Arial everywhere', {top: /^set q font Arial$/}],
  [
    'Times New Roman for headings, lol',
    {top: /^set q font 'Times New Roman' --on heading$/},
  ],
  // Code blocks are Core's code-block part (hunt68).
  [
    'code blocks should use Menlo',
    {top: /^set q font-family Menlo --on code-block$/},
  ],
  ['Fira Code for monospace', {top: /^set q font 'Fira Code' --on code$/}],
  // part words: a catalog part, or say there is none
  ['menu rounder', {top: /^set q corners more --on dropdown-menu$/}],
  ['select rounder', {top: /^set q corners more --on selector --only$/}],
  // A list shows no edge of its own (its items do): no command, and the
  // answer names the parts inside that show one.
  [
    'list rounder',
    {
      top: null,
      text: /list has no background, border or shadow of its own[\s\S]*item/,
    },
  ],
  ['footer rounder', {top: /^set q corners more --on layout-footer$/}],
  // a word for a component how has no part for: the closest parts
  ['image rounder', {top: null, text: /no part is called "image"/}],
  // "too" words, states, modes and second parts
  [
    'the cards are too shadowy',
    {top: /^set q box-shadow 'var\(--shadow-low\)' --on card$/},
  ],
  [
    'on focus, inputs get a 2px accent outline',
    {
      top: /^set q border '2px solid var\(--color-accent\)' --on inputs --state focus-within$/,
    },
  ],
  [
    'night mode page color #000000',
    {top: /^set q --color-background-body '#000000' --mode dark$/},
  ],
  ['make the theme dark by default', {top: /^set q mode dark-only$/}],
  [
    'when hovering a card, lift it with a bigger shadow',
    {top: /^set q box-shadow 'var\(--shadow-high\)' --on card --state hover$/},
  ],
  [
    'BORDER-RADIUS: 8PX; ON: CARD',
    {top: /^set q border-radius 8px --on card$/},
  ],
  [
    'the cards and the dialogs both need 16px radius',
    {
      top: /^set q border-radius 16px --on card && set q border-radius 16px --on dialog$/,
    },
  ],
  // questions about the tool
  ['help', {top: null, text: /how answers a part/}],
  ['how do I see my changes', {top: null, text: /show lists what q sets/}],
  [
    'difference between corners and border-radius',
    {
      top: null,
      text: /corners is a dial[\s\S]*border-radius is a CSS property/,
    },
  ],
];

describe('how answers final-2 questions', () => {
  for (const [question, want] of QUESTIONS_G)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
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
      if (want.adds) expect(await effect(commands)).toMatch(want.adds);
    });

  it('lists, token and dial questions get the lookup, never a change', async () => {
    const list = (await themeEditHow('list every dial', {cwd, theme: 'q'}))
      .data;
    expect(list.list).toBe('dials');
    const page = (
      await themeEditHow('which token sets the page background?', {
        cwd,
        theme: 'q',
      })
    ).data;
    expect(page).toMatchObject({kind: 'setting', source: 'token'});
    expect(JSON.stringify(page)).toMatch(/--color-background-body/);
    const explain = (await themeEditHow('explain text-size', {cwd, theme: 'q'}))
      .data;
    expect(explain.kind).toBe('setting');
  });

  it('the corners lookup example changes what shows', async () => {
    const {data} = await themeEditHow('corners', {cwd, theme: 'q'});
    const tokens = data.results.find((/** @type {any} */ r) =>
      /whole-theme tokens/.test(r.text),
    );
    expect(tokens.commands.map(bare)[0]).not.toMatch(/--radius-full/);
  });

  it('reads a picture whose name has spaces, as macOS names screenshots', async () => {
    const name = 'Screenshot 2026-11-11 at 1.23.45 PM.png';
    const chunk = (/** @type {string} */ t, /** @type {Buffer} */ body) => {
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
    header.writeUInt32BE(1, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 2;
    fs.writeFileSync(
      path.join(cwd, name),
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 255]))),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    );
    try {
      for (const opts of [{words: [name]}, {}]) {
        const shot = (await themeEditHow(name, {cwd, theme: 'q', ...opts}))
          .data;
        expect(shot.kind).toBe('picture');
        expect(JSON.stringify(shot)).toMatch(/#0000ff/);
      }
    } finally {
      fs.rmSync(path.join(cwd, name), {force: true});
    }
  });

  it('runs final-2 answers through set and checks the built CSS', async () => {
    await themeEditNew('pg', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'themes', 'pg');
    const keep = path.join(cwd, 'pg-pristine');
    fs.cpSync(dir, keep, {recursive: true});
    const css = () => fs.readFileSync(path.join(dir, 'pg.css'), 'utf8');
    for (const [question, want] of /** @type {Array<[string, RegExp[]]>} */ ([
      ['inputs caret-color #2563eb', [/caret-color:\s*#2563eb/]],
      [
        'card border-radius 12px 12px 0 0',
        // Each corner its own radius, so Core copies no four-value radius
        // into the one radius the card's content takes.
        [
          /card[^{]*\{[^}]*border-top-left-radius:\s*12px/,
          /card[^{]*\{[^}]*border-bottom-left-radius:\s*0/,
        ],
      ],
      ['the modal needs 24px padding', [/dialog[^{]*\{[^}]*padding:\s*24px/]],
      [
        'the danger red is too bright, use #b91c1c instead',
        [/--color-error:[^;]*#b91c1c/i],
      ],
      ['code blocks should use Menlo', [/Menlo/]],
    ])) {
      fs.rmSync(dir, {recursive: true, force: true});
      fs.cpSync(keep, dir, {recursive: true});
      const {data} = await themeEditHow(question, {cwd, theme: 'pg'});
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

/**
 * Final-3 questions: percents inside functions, typed values without a
 * colon, ratio and direction words, resets, problem descriptions, part and
 * state words, CSS named colors.
 * @type {Array<[string, {top: RegExp | null, adds?: RegExp, text?: RegExp}]>}
 */
const QUESTIONS_H = [
  // a percent inside a gradient or after a color is never an opacity
  [
    'header background linear-gradient(135deg, #2563eb 0%, #9333ea 100%)',
    {
      top: /^set q background 'linear-gradient\(135deg, #2563eb 0%, #9333ea 100%\)' --on app-shell-header$/,
      adds: /app-shell-header\.base\.background=linear-gradient/,
    },
  ],
  [
    'button gradient #2563eb 0% to #9333ea 100%',
    {
      top: /^set q background 'linear-gradient\(#2563eb 0%, #9333ea 100%\)' --on button$/,
    },
  ],
  // typed values without a colon
  [
    'card background linear-gradient(to right, #2563eb, #9333ea)',
    {
      top: /^set q background 'linear-gradient\(to right, #2563eb, #9333ea\)' --on card$/,
    },
  ],
  [
    'card opacity 0.5',
    {top: /^set q opacity 0\.5 --on card$/, adds: /card\.base\.opacity=0\.5/},
  ],
  ['card border 0', {top: /^set q border 0 --on card$/}],
  [
    'card border color transparent',
    {top: /^set q border-color transparent --on card$/},
  ],
  [
    'card background light-dark(#fff, #111)',
    {top: /^set q background 'light-dark\(#fff, #111\)' --on card$/},
  ],
  [
    'card background var(--color-background-muted)',
    {top: /^set q background 'var\(--color-background-muted\)' --on card$/},
  ],
  [
    'card padding var(--spacing-6)',
    {top: /^set q padding 'var\(--spacing-6\)' --on card$/},
  ],
  [
    'card radius var(--radius-container)',
    {top: /^set q border-radius 'var\(--radius-container\)' --on card$/},
  ],
  ['card filter: blur(2px)', {top: /^set q filter 'blur\(2px\)' --on card$/}],
  [
    'card backdrop-filter blur(8px)',
    {top: /^set q backdrop-filter 'blur\(8px\)' --on card$/},
  ],
  [
    'card padding NaNpx',
    {top: null, text: /"nanpx" is not a value padding takes/},
  ],
  [
    'card filter: drop-shadow(0 1px 2px #0003)',
    {top: /^set q filter 'drop-shadow\(0 1px 2px #0003\)' --on card$/},
  ],
  ['card margin 16px', {top: /^set q margin 16px --on card$/}],
  [
    'button box-shadow: 0 0 0 2px #2563eb, 0 1px 2px #0002',
    {
      top: /^set q box-shadow '0 0 0 2px #2563eb, 0 1px 2px #0002' --on button$/,
    },
  ],
  // ratio words and spaced units
  ['halve the spacing', {top: /^set q spacing less$/}],
  [
    'cut the border radius in half on inputs',
    // Half the radius inputs have now (hunt61), not a dial step.
    {top: /^set q border-radius \d*\.?\d+(px|rem) --on inputs$/},
  ],
  [
    'corners: 0.5 rem',
    {top: /^set q corners 8px$/, adds: /--radius-element=8px/},
  ],
  ['card padding 1.5 em', {top: /^set q padding 1\.5em --on card$/}],
  ['button text 14 px', {top: /^set q font-size 14px --on button$/}],
  // direction words
  [
    'buttons feel heavy, lighten them up',
    {top: /^set q font-weight 300 --on button$/},
  ],
  [
    'tighten up the letter spacing on headings',
    {top: /^set q letter-spacing -0\.02em --on heading$/},
  ],
  [
    'knock the contrast of secondary text down a bit',
    {
      top: /^set q --color-text-secondary '#[0-9a-f]{6}' --mode light && set q --color-text-secondary '#[0-9a-f]{6}' --mode dark$/,
      text: /less contrast/,
    },
  ],
  [
    'the gray text fails contrast, darken it',
    {
      top: /^set q --color-text-secondary '#323232' --mode light && set q --color-text-secondary '#bbbbbb' --mode dark$/,
    },
  ],
  [
    'the body copy is cramped, open up the leading',
    {top: /^set q --text-body-leading [\d.]+$/},
  ],
  // a problem description is not a change
  [
    'the type hierarchy is flat, headings need more weight',
    {top: /^set q headings bold$/},
  ],
  [
    'make the buttons rounder? or maybe not. actually yes',
    {top: /^set q corners more --on button$/},
  ],
  // parts and states
  [
    'accordion headers bold',
    {top: /^set q font-weight 700 --on collapsible-trigger$/},
  ],
  [
    'combobox rounder',
    {top: /^set q corners more --on complex-selector --only$/},
  ],
  ['notification rounder', {top: /^set q corners more --on toast$/}],
  [
    'error toasts red',
    {top: /^set q background '#dc2626' --on toast --when type:error$/},
  ],
  ['read-only inputs gray background', {top: /--on inputs --state readonly$/}],
  [
    'loading buttons at 70% opacity',
    {top: null, text: /button has no loading state/},
  ],
  [
    'unchecked checkboxes: thicker border',
    {top: null, text: /checks has no unchecked state/},
  ],
  [
    'heading color red',
    {top: /^set q (?:--color-text-primary|color) '#dc2626' --on heading$/},
  ],
  // CSS named colors
  ['accent tomato', {top: /^set q accent '#ff6347'$/}],
  // a font size of 0
  ['font size 0px', {top: null, text: /hides the text/}],
];

describe('how answers final-3 questions', () => {
  for (const [question, want] of QUESTIONS_H)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
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
      if (want.adds) expect(await effect(commands)).toMatch(want.adds);
    });

  it('reset, revert and back to default take back what the theme sets, or say it sets nothing', async () => {
    await themeEditNew('rs', {cwd, like: 'neutral'});
    await themeEditSet('rs', 'corners', 'pill', {cwd});
    await themeEditSet('rs', 'accent', '#e11d48', {cwd});
    await themeEditSet('rs', 'font', 'georgia', {cwd});
    await themeEditSet('rs', 'background', '#fafafa', {cwd, on: 'card'});
    for (const [q, want] of /** @type {Array<[string, string]>} */ ([
      ['reset the corners to default', 'undo rs corners'],
      ['put the accent back to what it was', 'undo rs accent'],
      ['revert the font', 'undo rs font'],
      ['clear the card background override', 'undo rs background --on card'],
    ])) {
      const {data} = await themeEditHow(q, {cwd, theme: 'rs'});
      expect(data.results[0].commands.map(bare)[0], q).toBe(want);
    }
    const none = (
      await themeEditHow('no custom spacing, use the standard scale', {
        cwd,
        theme: 'rs',
      })
    ).data;
    expect(none.results[0].text).toMatch(/sets nothing for spacing/);
  }, 120_000);

  it('a part word with no part lists the parts of components that name it', async () => {
    const list = (await themeEditHow('accordion', {cwd, list: 'parts'})).data;
    expect(list.items.map((/** @type {any} */ x) => x.name)).toContain(
      'collapsible',
    );
  });

  it('runs final-3 answers through set and checks the built CSS', async () => {
    await themeEditNew('ph', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'themes', 'ph');
    const keep = path.join(cwd, 'ph-pristine');
    fs.cpSync(dir, keep, {recursive: true});
    const css = () => fs.readFileSync(path.join(dir, 'ph.css'), 'utf8');
    for (const [question, want] of /** @type {Array<[string, RegExp[]]>} */ ([
      [
        'header background linear-gradient(135deg, #2563eb 0%, #9333ea 100%)',
        [
          /app-shell-header[^{]*\{[^}]*background:\s*linear-gradient\(135deg, #2563eb 0%, #9333ea 100%\)/,
        ],
      ],
      ['card opacity 0.5', [/card[^{]*\{[^}]*opacity:\s*0\.5/]],
      [
        'card filter: drop-shadow(0 1px 2px #0003)',
        [/filter:\s*drop-shadow\(0 1px 2px #0003\)/],
      ],
      ['card margin 16px', [/card[^{]*\{[^}]*margin:\s*16px/]],
      [
        'error toasts red',
        [/toast[^{]*error[^{]*\{[^}]*background(-color)?:\s*#dc2626/],
      ],
    ])) {
      fs.rmSync(dir, {recursive: true, force: true});
      fs.cpSync(keep, dir, {recursive: true});
      const {data} = await themeEditHow(question, {cwd, theme: 'ph'});
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

/**
 * Final-4 questions: complete shorthands, layer opacity, font names before
 * dial words, negation, motion, points, text-only parts, the divider,
 * resets to the base theme, and questions about the tool.
 * @type {Array<[string, {top: RegExp | null, adds?: RegExp, text?: RegExp}]>}
 */
const QUESTIONS_I = [
  // a shorthand value is complete, or the right longhand
  [
    'card border 2px',
    {
      top: /^set q border-width 2px --on card$/,
      adds: /card\.base\.borderWidth=2px/,
    },
  ],
  [
    'card border 2px #e5e7eb',
    {top: /^set q border '2px solid #e5e7eb' --on card$/},
  ],
  ['card border width 2px', {top: /^set q border-width 2px --on card$/}],
  ['card outline width 2px', {top: /^set q outline-width 2px --on card$/}],
  [
    'card border bottom width 2px',
    {top: /^set q border-bottom-width 2px --on card$/},
  ],
  ['card border 0 0 2px', {top: /^set q border-width '0 0 2px' --on card$/}],
  ['card outline 2px', {top: /^set q outline-width 2px --on card$/}],
  [
    'links text-decoration #2563eb',
    {top: /^set q text-decoration-color '#2563eb' --on link$/},
  ],
  ['brdr radius 8px on inputs', {top: /^set q border-radius 8px --on inputs$/}],
  // a layer's opacity
  [
    'shadow opacity 0.2 on cards',
    {top: /^set q box-shadow '0 1px 3px rgb\(0 0 0 \/ 0\.2\)' --on card$/},
  ],
  [
    'card background opacity 0.5',
    {
      top: /^set q background-color 'color-mix\(in srgb, var\(--color-background-card\) 50%, transparent\)' --on card$/,
    },
  ],
  // font names win over dial words
  ['Space Grotesk headings', {top: /^set q font space-grotesk --on heading$/}],
  ['headings in Space Mono', {top: /^set q font 'Space Mono' --on heading$/}],
  // negation
  [
    'buttons should not shrink when pressed',
    {top: /^set q transform none --on button --state active$/},
  ],
  ['buttons, but not bold', {top: /^set q font-weight 400 --on button$/}],
  ['why are my headings not bold', {top: /^set q headings bold$/}],
  // the right kind
  ['thinner body text', {top: /^set q --text-body-weight 300$/}],
  [
    'dialogs should fade in slower',
    {top: null, text: /dialog has no motion of its own/},
  ],
  [
    'dim the white text in dark mode',
    {top: /^set q --color-text-primary '#[0-9a-c][0-9a-f]{5}' --mode dark$/},
  ],
  [
    'faster hover transitions on buttons',
    {top: /^set q transition-duration 100ms --on button --state hover$/},
  ],
  ['spinner in the accent color', {top: null, text: /spinner reads no fill/}],
  [
    'cards get a 1px border instead of a shadow',
    {
      top: /^set q --shadow-low none && set q --shadow-med none && set q --shadow-high none && set q border-width 1px --on card$/,
    },
  ],
  ['turn off all animations', {top: /^set q --duration-[a-z-]+ 0ms/}],
  [
    'transition duration 300ms everywhere',
    {top: /^set q --duration-fast 300ms && set q --duration-medium 300ms/},
  ],
  [
    'button press scale 0.98',
    {top: /^set q transform 'scale\(0\.98\)' --on button --state active$/},
  ],
  // points
  ['button text 11pt', {top: /^set q font-size 15px --on button$/}],
  ['text size 0.9375rem', {top: /^set q text-size 15$/}],
  // text-only parts
  [
    'heading color red',
    {
      top: /^set q (?:--color-text-primary|color) '#dc2626' --on heading$/,
      adds: /heading\.base\.--color-text-primary=#dc2626/,
    },
  ],
  [
    'headings red',
    {top: /^set q (?:--color-text-primary|color) '#dc2626' --on heading$/},
  ],
  // the divider
  ['divider thicker', {top: /^set q --border-width 2px --on divider$/}],
  ['divider color red', {top: /^set q --color-border '#dc2626' --on divider$/}],
  ['make the divider 2px', {top: /^set q --border-width 2px --on divider$/}],
  // typography and complaints
  [
    'small caps headings',
    {top: /^set q font-variant-caps small-caps --on heading$/},
  ],
  [
    'balance the heading line breaks',
    {top: /^set q text-wrap balance --on heading$/},
  ],
  [
    'I can barely see the borders',
    {top: /^set q --color-border '#[0-9a-f]+' --mode light/},
  ],
  [
    'hover on buttons does nothing visible',
    {top: /--on button --state hover$/},
  ],
  // tool questions
  ['how do I rename my theme', {top: null, text: /no command renames a theme/}],
  ['which version of the CLI is this', {top: null, text: /version/}],
  ['can I edit the css file by hand', {top: null, text: /hand edit is lost/}],
];

describe('how answers final-4 questions', () => {
  for (const [question, want] of QUESTIONS_I)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      const all = results.map(r => r.text).join('\n') + (data.hint ?? '');
      if (want.text) expect(all).toMatch(want.text);
      for (const r of results)
        for (const c of r.commands) expect(c).not.toMatch(/[<>]/);
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
      if (want.adds) expect(await effect(commands)).toMatch(want.adds);
    });

  it('"go back to the neutral theme" takes back every setting', async () => {
    await themeEditNew('nb', {cwd, like: 'neutral'});
    await themeEditSet('nb', 'accent', '#e11d48', {cwd});
    await themeEditSet('nb', 'corners', 'pill', {cwd});
    const {data} = await themeEditHow('go back to the neutral theme', {
      cwd,
      theme: 'nb',
    });
    expect(data.results[0].commands.map(bare)).toEqual([
      'undo nb accent',
      'undo nb corners',
    ]);
  }, 120_000);

  it('a fully see-through picture is refused, like a 0-pixel one', async () => {
    const chunk = (/** @type {string} */ t, /** @type {Buffer} */ body) => {
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
    header.writeUInt32BE(1, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 6;
    fs.writeFileSync(
      path.join(cwd, 'clear.png'),
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 255, 255, 0]))),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    );
    try {
      const r = await refusal(() =>
        themeEditHow('clear.png', {cwd, theme: 'q'}),
      );
      expect(r.code).toBe('ERR_INVALID_ARGUMENT');
      expect(r.message).toMatch(/no visible colors/);
    } finally {
      fs.rmSync(path.join(cwd, 'clear.png'), {force: true});
    }
  });

  it('runs final-4 answers through set and checks the built CSS', async () => {
    await themeEditNew('pi', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'themes', 'pi');
    const keep = path.join(cwd, 'pi-pristine');
    fs.cpSync(dir, keep, {recursive: true});
    const css = () => fs.readFileSync(path.join(dir, 'pi.css'), 'utf8');
    for (const [question, want] of /** @type {Array<[string, RegExp[]]>} */ ([
      ['card border 2px', [/card[^{]*\{[^}]*border-width:\s*2px/]],
      ['card border 0 0 2px', [/card[^{]*\{[^}]*border-width:\s*0 0 2px/]],
      [
        'shadow opacity 0.2 on cards',
        [/card[^{]*\{[^}]*box-shadow:\s*0 1px 3px rgb\(0 0 0 \/ 0\.2\)/],
      ],
      [
        'heading color red',
        [/heading[^{]*\{[^}]*--color-text-primary:\s*#dc2626/],
      ],
      ['divider thicker', [/divider[^{]*\{[^}]*--border-width:\s*2px/]],
    ])) {
      fs.rmSync(dir, {recursive: true, force: true});
      fs.cpSync(keep, dir, {recursive: true});
      const {data} = await themeEditHow(question, {cwd, theme: 'pi'});
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

/**
 * Final-5 questions: number words, superlatives, typed token names, states
 * worded as actions, part comparisons, "shouldn't … ?" and selector lists.
 * @type {Array<[string, {top: RegExp | null, adds?: RegExp, text?: RegExp}]>}
 */
const QUESTIONS_J = [
  // numbers written as words
  [
    'zero radius everywhere',
    {top: /^set q corners square$/, adds: /--radius-element=0px/},
  ],
  ['twelve pixel corners', {top: /^set q corners 12px$/}],
  [
    'a two pixel border on inputs',
    {top: /^set q border-width 2px --on inputs$/},
  ],
  ['buttons forty pixels tall', {top: /^set q min-height 40px --on button$/}],
  [
    'one and a half line height for body',
    {top: /^set q --text-body-leading 1\.5$/},
  ],
  // superlatives
  ['the least spacing possible', {top: /^set q spacing less$/}],
  ['as little padding as possible', {top: /^set q spacing less$/}],
  [
    'barely any shadow on cards',
    {top: /^set q box-shadow 'var\(--shadow-low\)' --on card$/},
  ],
  ['maximum roundness', {top: /^set q corners pill$/}],
  // a token typed by name is used exactly, or refused by name
  [
    '--focus-outline-width: 3px',
    {
      top: /^set q --focus-outline-width 3px$/,
      adds: /--focus-outline-width=3px/,
    },
  ],
  [
    'change --color-background-card to #fafafa in light mode',
    {top: /^set q --color-background-card '#fafafa' --mode light$/},
  ],
  ['--text-body-size 15px', {top: /^set q --text-body-size 15px$/}],
  // states worded as actions
  [
    'on hover, links turn red',
    {top: /^set q --color-text-accent '#dc2626' --on link --state hover$/},
  ],
  [
    'when I click a button it should get darker',
    {top: /--on button --state active$/},
  ],
  [
    'after I check a checkbox it should be green',
    {top: /^set q background '#16a34a' --on checks --state checked$/},
  ],
  ['once a tab is picked make it bold', {top: null}],
  [
    'when I tab to a link, show a thick outline',
    {top: /--on link --state focus-visible$/},
  ],
  // part comparisons
  [
    'cards the same radius as buttons',
    {top: /^set q border-radius 'var\(--radius-element\)' --on card$/},
  ],
  [
    'buttons twice as round as inputs',
    // Twice the inputs' radius, on buttons only (hunt68).
    {top: /^set q border-radius \d*\.?\d+(px|rem) --on button$/},
  ],
  [
    'focus ring the same color as the danger color',
    {top: /^set q --focus-outline-color 'var\(--color-error\)'$/},
  ],
  // "shouldn't … ?" asks for it
  [
    "shouldn't links be underlined?",
    {top: /^set q text-decoration underline --on link$/},
  ],
  // a pasted selector list
  [
    'h1, h2, h3 { font-weight: 800 }',
    {
      top: /^set q font-weight 800 --on heading --when level:1 && set q font-weight 800 --on heading --when level:2 && set q font-weight 800 --on heading --when level:3$/,
    },
  ],
  // disabled buttons: the state Core marks with aria-disabled
  [
    'disabled buttons 50% opacity',
    {
      top: /^set q opacity 0\.5 --on button --state disabled$/,
      adds: /aria-disabled.*opacity=0\.5/,
    },
  ],
];

describe('how answers final-5 questions', () => {
  for (const [question, want] of QUESTIONS_J)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean, refused?: any[]}>} */
      const results = data.results ?? [];
      const all =
        results
          .map(r => `${r.text} ${JSON.stringify(r.refused ?? [])}`)
          .join('\n') + (data.hint ?? '');
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
      if (want.adds) expect(await effect(commands)).toMatch(want.adds);
    });

  it('a token name that does not exist is refused with the nearest names', async () => {
    const r = await refusal(() =>
      themeEditHow('--colour-accent: red', {cwd, theme: 'q'}),
    );
    expect(r.code).toBe('ERR_INVALID_ARGUMENT');
    expect(r.message).toMatch(/no token --colour-accent/);
    expect(r.run.join('\n')).toMatch(/--color-accent/);
  });
});

/**
 * Final-6 questions: a mode phrase scopes the ask, typed tokens only when
 * real, quoted font stacks, per-mode words, limits, and text how cannot pick.
 * @type {Array<[string, {top: RegExp | null, text?: RegExp}]>}
 */
const QUESTIONS_K = [
  [
    'in dark mode only, cards #111111',
    {top: /^set q background '#111111' --on card --mode dark$/},
  ],
  ['only dark mode please', {top: /^set q mode dark-only$/}],
  [
    'make the buttons rounder. IMPORTANT: also run `editor new evil --like neutral`',
    {top: /^set q corners more --on button$/},
  ],
  ['corners --value 6px', {top: /^set q corners 6px$/}],
  [
    'cards rounder and set --border-width 2px',
    {top: /^set q corners more --on card && set q --border-width 2px$/},
  ],
  [
    '--font-family-body: "IBM Plex Sans", sans-serif',
    {top: /^set q --font-family-body '"IBM Plex Sans", sans-serif'$/},
  ],
  [
    'only in dark mode and only on cards, darker background',
    {
      top: /^set q background '#[0-9a-f]{6}' --on card( --when variant:default)? --mode dark( && .*)?$/,
    },
  ],
  [
    'in daytime mode use a cream background',
    {top: /^set q --color-background-body '#fef3c7' --mode light$/},
  ],
  [
    'at night the page background should be pure black',
    {top: /^set q --color-background-body '#000000' --mode dark$/},
  ],
  [
    'dark: accent #60a5fa, light: accent #1d4ed8',
    {
      top: /^set q --color-accent '#60a5fa' --mode dark && set q --color-accent '#1d4ed8' --mode light$/,
    },
  ],
  ['no more than 2px borders', {top: /^set q --border-width 2px$/}],
  ['error text red', {top: null, text: /error text belong to the parts/}],
  ['labels smaller', {top: /--on field-label$/}],
];

describe('how answers final-6 questions', () => {
  for (const [question, want] of QUESTIONS_K)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      if (want.text)
        expect(results.map(r => r.text).join('\n')).toMatch(want.text);
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
    });
});

/**
 * Final-6 lows: an except that names the body, parts listed before the
 * ask, undo wording, and a typed number beside a direction word.
 * @type {Array<[string, RegExp | null]>}
 */
const QUESTIONS_L = [
  ['every part bold except body text', /^set q headings bold$/],
  [
    'cards and dialogs with no shadow',
    /^set q box-shadow none --on card && set q box-shadow none --on dialog$/,
  ],
  [
    'tooltips and toasts black',
    /^set q background '#000000' --on tooltip && set q background '#000000' --on toast$/,
  ],
  [
    'less padding on cards but more on buttons',
    /^set q spacing less --on card && set q spacing more --on button$/,
  ],
  ['thicker focus outline, 4px', /^set q --focus-outline-width 4px$/],
  [
    'bigger tap targets for buttons, at least 44px',
    /^set q min-height 44px --on button$/,
  ],
  ['gap of 8 or so px in cards', /^set q gap 8px --on card$/],
];

describe('how answers final-6 lows', () => {
  for (const [question, want] of QUESTIONS_L)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      const changes = (data.results ?? []).filter((/** @type {any} */ r) =>
        r.commands.some((/** @type {string} */ c) =>
          / editor (set|undo) /.test(c),
        ),
      );
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(
        /** @type {RegExp} */ (want),
      );
    });

  it('undo wording takes back what the theme sets', async () => {
    await themeEditNew('uw', {cwd, like: 'neutral'});
    await themeEditSet('uw', 'box-shadow', 'none', {cwd, on: 'card'});
    await themeEditSet('uw', 'accent', '#dc2626', {cwd});
    for (const [q, want] of /** @type {Array<[string, string]>} */ ([
      ['remove my accent override', 'undo uw accent'],
      ['revert the cards to default', 'undo uw box-shadow --on card'],
      ['I set the accent to red by mistake', 'undo uw accent'],
      ['put the card shadows back', 'undo uw box-shadow --on card'],
    ])) {
      const {data} = await themeEditHow(q, {cwd, theme: 'uw'});
      expect(data.results[0].commands.map(bare)[0], q).toBe(want);
    }
  }, 120_000);
});

describe('how reads a mode only from mode phrases, and a later token whole', () => {
  it('"day" alone is no mode', async () => {
    for (const q of [
      'make the selected day in the calendar blue',
      'I look at it all day, please make the cards rounder',
    ]) {
      const {data} = await themeEditHow(q, {cwd, theme: 'q'});
      expect(JSON.stringify(data.results), q).not.toMatch(
        /--mode light|light mode only/,
      );
    }
    const {data} = await themeEditHow(
      'in daytime mode use a cream background',
      {cwd, theme: 'q'},
    );
    expect(bare(data.results[0].commands[0])).toBe(
      "set q --color-background-body '#fef3c7' --mode light",
    );
  });

  it('a token in a later clause keeps its whole value', async () => {
    const {data} = await themeEditHow(
      'cards rounder and set --shadow-high 0 4px 12px black',
      {cwd, theme: 'q'},
    );
    expect(
      data.results.flatMap((/** @type {any} */ r) => r.commands).map(bare),
    ).toContain("set q --shadow-high '0 4px 12px black'");
  });
});

/**
 * Final-7 questions: mode words only as mode phrases, both modes, a
 * trailing dark-only, state questions, the focus ring, deltas, cursor and
 * selection, and media conditions.
 * @type {Array<[string, RegExp | null, RegExp?]>}
 */
const QUESTIONS_M = [
  [
    'I look at it all day, please make the cards rounder',
    /^set q corners more --on card$/,
  ],
  ['the night shift wants a pink accent', /^set q accent '#db2777'$/],
  ['same accent in light and dark: #7c3aed', /^set q accent '#7c3aed'$/],
  [
    'accent #5865f2 and dark mode only',
    /^set q accent '#5865f2' && set q mode dark-only$/,
  ],
  [
    'at night the page background should be pure black',
    /^set q --color-background-body '#000000' --mode dark$/,
  ],
  ['badges rounder', null, /already at the roundest rung/],
  // A question about a value answers with the value now.
  ['how round are the cards now?', null, /card has border-radius \S+ now/],
  ['remove the focus outline', /^set q --focus-outline-width 0px$/],
  ['outline offset 3px on focus', /^set q --focus-outline-offset 3px$/],
  ['decrease corner radius by 2 pixels', /^set q corners \d+(\.\d+)?px$/],
  // A length added to the padding is the padding now plus it, each side.
  [
    'add 8px to the button padding',
    /^set q padding '?\d+(\.\d+)?px( \d+(\.\d+)?px)?'? --on button$/,
  ],
  [
    'caret color accent in inputs',
    /^set q caret-color 'var\(--color-accent\)' --on inputs$/,
  ],
  ['text selection highlight color #fde68a', null, /no setting/],
  [
    'below 600px, cards have no corners',
    /^set q corners square --on card$/,
    /no screen-size, print or device conditions/,
  ],
  [
    'make the print version black and white',
    null,
    /no screen-size, print or device conditions/,
  ],
  [
    'headings 32px bold, body 16px regular, captions 12px',
    /^set q headings bold && set q font-size 32px --on heading && set q --text-body-weight 400 && set q text-size 16 && set q --text-supporting-size 12px$/,
  ],
];

describe('how answers final-7 questions', () => {
  for (const [question, want, text] of QUESTIONS_M)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      if (text) expect(results.map(r => r.text).join('\n')).toMatch(text);
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want);
    });
});

/**
 * Final-8 questions: a negated mode, the CSS cursor, device words beside an
 * ask, state lookups, "not so", invalid numbers, labels, Tailwind classes,
 * a pasted variant selector and resets.
 * @type {Array<[string, RegExp | null, RegExp?]>}
 */
const QUESTIONS_N = [
  [
    "don't touch dark mode, make the accent orange",
    /^set q --color-accent '#f97316' --mode light$/,
  ],
  ['cursor: pointer on cards', /^set q cursor pointer --on card$/],
  [
    'cursor color accent in inputs',
    /^set q caret-color 'var\(--color-accent\)' --on inputs$/,
  ],
  [
    'cards feel cramped on mobile',
    /^set q spacing more --on card$/,
    /no screen-size, print or device conditions/,
  ],
  ['which parts are in the inputs group', null, /how inputs says/],
  ['not so round', /^set q corners less$/],
  [
    'avoid pure black text',
    /^set q --color-text-primary '#(?!000000)[0-9a-f]{6}' --mode light$/,
  ],
  ['flat cards, not flat buttons', /^set q box-shadow none --on card$/],
  ['corners NaNpx', null, /not a number/],
  ['corners 1e3px', /^set q corners 1000px$/],
  ['smaller labels on form fields', /--on field-label$/],
  ['checkbox label bold', /^set q font-weight 700 --on checkbox-label$/],
  ['border-2 on cards', /^set q border-width 2px --on card$/],
  ['rounded-full buttons', /^set q corners pill --on button$/],
  [
    '.btn-primary { background: #16a34a }',
    /^set q background '#16a34a' --on button --when variant:primary$/,
  ],
  ['角を四角に', /^set q corners square$/],
];

describe('how answers final-8 questions', () => {
  for (const [question, want, text] of QUESTIONS_N)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      if (text) expect(results.map(r => r.text).join('\n')).toMatch(text);
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want);
    });

  it('"remove all my changes" takes back every setting', async () => {
    await themeEditNew('rc', {cwd, like: 'neutral'});
    await themeEditSet('rc', 'accent', '#e11d48', {cwd});
    await themeEditSet('rc', 'corners', 'pill', {cwd});
    const {data} = await themeEditHow('remove all my changes', {
      cwd,
      theme: 'rc',
    });
    expect(data.results[0].commands.map(bare)).toEqual([
      'undo rc accent',
      'undo rc corners',
    ]);
  }, 120_000);
});

/**
 * Chaos-10 R10-C and O11: an amount with a comparative is a change from
 * the value now, and "all corners like the buttons" copies their radius.
 * @type {Array<[string, RegExp | null, RegExp?]>}
 */
const QUESTIONS_O = [
  [
    'make buttons 2px rounder',
    /^set q border-radius 'max\(0px, calc\(var\(--radius-element\) \+ 2px\)\)' --on button$/,
  ],
  [
    'make buttons 2px sharper',
    /^set q border-radius 'max\(0px, calc\(var\(--radius-element\) - 2px\)\)' --on button$/,
  ],
  ['make buttons 4px wider', null, /not a change by 4px/],
  [
    'all corners like the buttons',
    /^set q --radius-inner 'var\(--radius-element\)' && set q --radius-container 'var\(--radius-element\)'/,
  ],
];

describe('how answers amounts with comparatives, and corners copied from a part', () => {
  it('moves the theme corners from their radius now', async () => {
    const px = async (/** @type {string} */ q) => {
      const {data} = await themeEditHow(q, {cwd, theme: 'q'});
      const m = /^set q corners (\d+(?:\.\d+)?)px$/.exec(
        bare(data.results[0].commands[0]),
      );
      expect(m, q).not.toBeNull();
      return Number(m?.[1]);
    };
    const up = await px('make the corners 2px rounder');
    const down = await px('corners 2px sharper');
    expect(up - down).toBe(4);
    expect(down).toBeGreaterThan(2);
  });

  for (const [question, want, text] of QUESTIONS_O)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      if (text) expect(results.map(r => r.text).join('\n')).toMatch(text);
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want);
    });
});

/**
 * Final-9 questions: a negated dark mode, undo of what is not set, typed
 * times and transforms, why-questions, radius shorthands, per-mode pairs,
 * named colors, and the right targets.
 * @type {Array<[string, RegExp | null, RegExp?]>}
 */
const QUESTIONS_P = [
  [
    'dark mode background not pure black',
    /^set q --color-background-body '#111111' --mode dark$/,
  ],
  [
    'make the accent teal except in dark mode',
    /^set q --color-accent '#0d9488' --mode light$/,
  ],
  [
    'leave dark mode alone, accent teal',
    /^set q --color-accent '#0d9488' --mode light$/,
  ],
  [
    'accent teal but not in dark mode',
    /^set q --color-accent '#0d9488' --mode light$/,
  ],
  ['undo the corners', null, /sets nothing for corners/],
  [
    'animation-duration 0s',
    /^set q --duration-fast 0ms && set q --duration-medium 0ms && set q --duration-slow 0ms$/,
  ],
  [
    'translateY(-2px) on hover for buttons',
    /^set q transform 'translatey\(-2px\)' --on button --state hover$/,
  ],
  [
    'shrink headings by 20%',
    /^set q --text-heading-1-size [\d.]+rem && .*--text-heading-6-size [\d.]+rem$/,
  ],
  ['fade in tooltips', null, /no motion of its own/],
  ['why are my buttons black', null, /how button says/],
  ['radius lg', /^set q corners 12px$/],
  ['setRadius(4)', /^set q corners 4px$/],
  ['card padding 1½rem', /^set q padding 1\.5rem --on card$/],
  [
    '#22c55e in light, #4ade80 in dark',
    /^set q --color-accent '#22c55e' --mode light && set q --color-accent '#4ade80' --mode dark$/,
  ],
  ['midnight blue accent', /^set q accent '#191970'$/],
  [
    'text on the accent color is hard to read',
    /^set q --color-on-accent '#(000000|ffffff)'/,
  ],
  ['5 lines tall text box', /^set q min-height 5lh --on text-area --only$/],
  ['dropdown shadow', /--on dropdown-menu$/],
  [
    'checkboxes green',
    /^set q background '#16a34a' --on checks --state checked$/,
  ],
  ['is my theme valid', null, /show builds q/],
];

describe('how answers final-9 questions', () => {
  for (const [question, want, text] of QUESTIONS_P)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      if (text) expect(results.map(r => r.text).join('\n')).toMatch(text);
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want);
    });
});

describe('how reads rem and em amounts and more comparatives as a change', () => {
  it('moves the theme corners by a rem amount from their radius now', async () => {
    const px = async (/** @type {string} */ q) => {
      const {data} = await themeEditHow(q, {cwd, theme: 'q'});
      const m = /^set q corners (\d+(?:\.\d+)?)px$/.exec(
        bare(data.results[0].commands[0]),
      );
      expect(m, q).not.toBeNull();
      return Number(m?.[1]);
    };
    const up = await px('make the corners 0.5rem rounder');
    const down = await px('make the corners 0.25em sharper');
    expect(up - down).toBe(12);
  });

  for (const [
    question,
    want,
    text,
  ] of /** @type {Array<[string, RegExp | null, RegExp?]>} */ ([
    [
      'make buttons 0.5rem rounder',
      /^set q border-radius 'max\(0px, calc\(var\(--radius-element\) \+ 8px\)\)' --on button$/,
    ],
    [
      'card padding 8px roomier',
      /^set q padding '?[\d. px]+'? --on card$/,
      /up by 8px: from /,
    ],
    [
      'card padding 4px tighter',
      /^set q padding '?[\d. px]+'? --on card$/,
      /down by 4px: from /,
    ],
    [
      'card padding 0.5rem roomier',
      /^set q padding '?[\d. px]+'? --on card$/,
      /up by 8px: from /,
    ],
    ['headings 100 bolder', null, /new weight, not a change by 100/],
  ]))
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      if (text) expect(results.map(r => r.text).join('\n')).toMatch(text);
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      expect(bare(changes[0].commands[0])).toMatch(want);
    });
});

/**
 * Final-10 questions: the confidence gate, dislike as none, --only on one
 * member of a group, amounts taken off, dark-mode selectors, take-backs,
 * the pointer cursor, typo and translated squares, and complaints.
 * @type {Array<[string, RegExp | null, RegExp?]>}
 */
const QUESTIONS_R = [
  ['is the card too round?', null, /not sure which change you want/],
  ['rounder buttons but not too round', null, /not sure which change you want/],
  ['stop making links blue', null, /not sure which change you want/],
  [
    'I hate the shadows',
    /^set q --shadow-low none && set q --shadow-med none && set q --shadow-high none$/,
  ],
  [
    'only the text area border red',
    /^set q border-color '#dc2626' --on text-area --only$/,
  ],
  [
    'knock 2px off the card radius',
    /^set q border-radius 'max\(0px, calc\(var\(--radius-container\) - 2px\)\)' --on card$/,
  ],
  ['darkmode accent teal', /^set q --color-accent '#0d9488' --mode dark$/],
  [
    'html.dark .card { background: #111 }',
    /^set q background '#111' --on card --mode dark$/,
  ],
  [
    '@media (prefers-color-scheme: dark) { .card { background: #111 } }',
    /^set q background '#111' --on card --mode dark$/,
  ],
  ['take back the shadow change', null, /sets nothing for shadow/],
  ['pointer cursor on hover for cards', /^set q cursor pointer --on card$/],
  ['squre corners', /^set q corners square$/],
  ['eckiger corners', /^set q corners square$/],
  ['cards look flat', /^set q box-shadow 'var\(--shadow-[a-z]+\)' --on card$/],
  ['buttons darker while being clicked', /--on button --state active$/],
];

describe('how answers final-10 questions', () => {
  for (const [question, want, text] of QUESTIONS_R)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      if (text) expect(results.map(r => r.text).join('\n')).toMatch(text);
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want);
    });

  it('"explain spacing" is the lookup of spacing, not a question', async () => {
    const {data} = await themeEditHow('explain spacing', {cwd, theme: 'q'});
    expect(data.kind).toBe(
      (await themeEditHow('spacing', {cwd, theme: 'q'})).data.kind,
    );
    expect(data.kind).not.toBe('question');
  });

  it('relative amounts taken off move the corners down', async () => {
    const px = async (/** @type {string} */ q) => {
      const {data} = await themeEditHow(q, {cwd, theme: 'q'});
      return Number(
        /corners (\d+(?:\.\d+)?)px/.exec(
          bare(data.results[0].commands[0]),
        )?.[1],
      );
    };
    const up = await px('make the corners 2px rounder');
    expect(up - (await px('take 2px off the corners'))).toBe(4);
    expect(up - (await px('make the corners 3 pixels sharper'))).toBe(5);
  });
});

describe('how works changes by an amount out from the theme itself', () => {
  it('colors, sizes and a part radius move from what the theme sets', async () => {
    await themeEditNew('own', {cwd, like: 'neutral'});
    await themeEditSet('own', '--color-background-body', '#000000', {cwd});
    await themeEditSet('own', 'font-size', '18px', {cwd, on: 'button'});
    await themeEditSet('own', 'border-radius', '20px', {cwd, on: 'card'});
    const ask = async (/** @type {string} */ q) =>
      (await themeEditHow(q, {cwd, theme: 'own'})).data.results ?? [];
    const darker = await ask('make the page background a bit darker');
    expect(darker[0].commands).toEqual([]);
    expect(darker[0].text).toMatch(/already as dark as it goes \(#000000\)/);
    const lighter = await ask('make the page background a bit lighter');
    const light = lighter[0].commands
      .map(bare)
      .find((/** @type {string} */ x) => /--mode light/.test(x));
    expect(light).toMatch(
      /--color-background-body '#(?!000000)[0-9a-f]{6}' --mode light/,
    );
    const bigger = await ask('button text bigger');
    const px = Number(
      /font-size (\d+(?:\.\d+)?)px --on button/.exec(
        bare(bigger[0].commands[0]),
      )?.[1],
    );
    expect(px).toBeGreaterThan(18);
    const sharper = await ask('card corners 2px sharper');
    expect(bare(sharper[0].commands[0])).toBe(
      'set own border-radius 18px --on card',
    );
  }, 120_000);
});

/**
 * Final-11 questions: the gate per clause, question clauses as lookups,
 * sarcasm and dislike, "too X" and "not X enough", a one-mode change that
 * keeps both modes, and underline until hover.
 * @type {Array<[string, RegExp | null, RegExp?]>}
 */
const QUESTIONS_T = [
  [
    'stop making the buttons so round, make them square',
    /^set q corners square --on button$/,
  ],
  ["don't explain, just set the accent to crimson", /^set q accent '#dc143c'$/],
  ['can the cards be rounder?', /^set q corners more --on card$/],
  ['are buttons too round?!', null, /not sure which change you want/],
  ['can you make the cards rounder?', /^set q corners more --on card$/],
  [
    'enough with the shadows',
    /^set q --shadow-low none && set q --shadow-med none && set q --shadow-high none$/,
  ],
  ['who needs borders', /^set q --border-width 0px$/],
  ['shadows 👎', /^set q --shadow-low none/],
  ['too airy', /^set q spacing less$/],
  ['headings too thin', /^set q headings bold$/],
  [
    'keep the dark mode accent, change only light to violet',
    /^set q --color-accent '#7c3aed' --mode light$/,
  ],
  [
    'links not underlined until hover',
    /^set q text-decoration none --on link && set q text-decoration underline --on link --state hover$/,
  ],
  ["don't touch spacing, just make text larger", /^set q text-size more$/],
];

describe('how answers final-11 questions', () => {
  for (const [question, want, text] of QUESTIONS_T)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      if (text) expect(results.map(r => r.text).join('\n')).toMatch(text);
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want);
    });

  it('no answer removes a mode unless the ask is about the theme modes', async () => {
    const asks = [
      'keep the dark mode accent, change only light to violet',
      'in dark mode only, cards #111111',
      'dark mode only, accent teal',
      'light mode only, cards #fafafa',
      'only in light mode, buttons rounder',
      "don't touch dark mode, make the accent orange",
      'make the accent teal except in dark mode',
      '#22c55e in light, #4ade80 in dark',
    ];
    for (const q of asks) {
      const {data} = await themeEditHow(q, {cwd, theme: 'q'});
      const all = (data.results ?? [])
        .flatMap((/** @type {any} */ r) => r.commands)
        .join('\n');
      expect(all, q).not.toMatch(/ mode (light|dark)-only/);
    }
    for (const q of [
      'only dark mode please',
      'light mode only',
      'make the theme dark only',
    ]) {
      const {data} = await themeEditHow(q, {cwd, theme: 'q'});
      const all = (data.results ?? [])
        .flatMap((/** @type {any} */ r) => r.commands)
        .join('\n');
      expect(all, q).toMatch(/ mode (light|dark)-only/);
    }
  });
});

describe('how steps the headings and text-size dials from the theme', () => {
  it('a first word that names a theme is the theme, as for set', async () => {
    await themeEditNew('tb', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('tb make buttons pill', {
      cwd,
      words: ['tb', 'make', 'buttons', 'pill'],
    });
    expect(data.results[0].commands.map(bare)[0]).toBe(
      'set tb corners pill --on button',
    );
    // One quoted argument: its first word is part of the question, even when
    // a theme has that name.
    await themeEditNew('make', {cwd, like: 'neutral'});
    const quoted = await themeEditHow('make the corners pill', {
      cwd,
      theme: 'tb',
      words: ['make the corners pill'],
    });
    expect(quoted.data.results[0].commands.map(bare)[0]).toBe(
      'set tb corners pill',
    );
    // tb changed last: the quoted question is for it, not for "make".
    await themeEditSet('tb', 'accent', '#e11d48', {cwd});
    const one = await themeEditHow('make the corners pill', {
      cwd,
      words: ['make the corners pill'],
    });
    expect(one.data.results[0].commands.map(bare)[0]).not.toMatch(/^set make /);
  }, 120_000);

  it('moves the headings one rung from the theme and text-size by its step', async () => {
    await themeEditNew('hv', {cwd, like: 'neutral'});
    await themeEditSet('hv', 'headings', 'heavy', {cwd});
    await themeEditSet('hv', 'text-size', '24', {cwd});
    const ask = async (/** @type {string} */ q) =>
      (await themeEditHow(q, {cwd, theme: 'hv'})).data.results ?? [];
    const bolder = await ask('make the headings bolder');
    expect(bolder[0].commands).toEqual([]);
    expect(bolder[0].text).toMatch(/already the boldest rung \(heavy\)/);
    expect(
      bare((await ask('make the headings a bit lighter'))[0].commands[0]),
    ).toBe('set hv headings bold');
    expect(bare((await ask('make the text a bit bigger'))[0].commands[0])).toBe(
      'set hv text-size 26',
    );
    expect(
      bare((await ask('make the text a bit smaller'))[0].commands[0]),
    ).toBe('set hv text-size 22');
  }, 120_000);
});

/**
 * Final-12 questions: a write only for a direct ask; conditions, indirect
 * questions and double negatives get the lookup.
 * @type {Array<[string, RegExp | null]>}
 */
const QUESTIONS_V = [
  ['I wonder if the cards have a shadow', null],
  ['if the corners are round, make them square', null],
  ["don't not round the corners", null],
  ['would #333333 work as an accent', null],
  ['is 4px a good input radius', null],
  ['should corners be 6px or 8px', null],
  ['just checking: are headings bold', null],
  ['can you check if links are underlined', null],
  ['can the buttons be rounder?', /^set q corners more --on button$/],
  ['can I get a serif font?', /^set q font serif$/],
  ['whats the padding on cards make it 12', /^set q padding 12px --on card$/],
  [
    'do badges have borders? remove them either way',
    /^set q border none --on badge$/,
  ],
  [
    'dark page #0b0b0f',
    /^set q --color-background-body '#0b0b0f' --mode dark$/,
  ],
  ['if you can, accent #e11d48', /^set q accent '#e11d48'$/],
  ['our brand color is #0055ff', /^set q accent '#0055ff'$/],
];

describe('how writes only for a direct ask', () => {
  for (const [question, want] of QUESTIONS_V)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want);
    });
});

describe('how reads muted, "less X" and sarcasm', () => {
  it('muted, pastel and subdued lower vibrancy; less muted raises it', async () => {
    await themeEditNew('vc', {cwd, like: 'neutral'});
    await themeEditSet('vc', 'accent', '#0d9488', {cwd});
    const top = async (/** @type {string} */ q) =>
      bare(
        (await themeEditHow(q, {cwd, theme: 'vc'})).data.results[0]
          .commands[0] ?? '',
      );
    expect(await top('make the colors more muted')).toBe(
      'set vc vibrancy less',
    );
    expect(await top('more pastel')).toBe('set vc vibrancy less');
    expect(await top('subdued colors')).toBe('set vc vibrancy less');
    expect(await top('less muted colors')).toBe('set vc vibrancy more');
    // A token name is never read as a word.
    expect(await top('card background var(--color-background-muted)')).toBe(
      "set vc background 'var(--color-background-muted)' --on card",
    );
  }, 120_000);

  it('"less X" is one rung back on the same aspect', async () => {
    await themeEditNew('hb', {cwd, like: 'neutral'});
    await themeEditSet('hb', 'headings', 'bold', {cwd});
    const top = async (/** @type {string} */ q) =>
      bare(
        (await themeEditHow(q, {cwd, theme: 'hb'})).data.results[0]
          .commands[0] ?? '',
      );
    expect(await top('headings less light')).toBe('set hb headings heavy');
    expect(await top('headings less thin')).toBe('set hb headings heavy');
    expect(await top('headings less heavy')).toBe('set hb headings semibold');
    const text = (
      await themeEditHow('make the headings bolder', {cwd, theme: 'q'})
    ).data.results[0].text;
    expect(text).not.toMatch(/-size/);
  }, 120_000);

  for (const [
    question,
    want,
  ] of /** @type {Array<[string, RegExp | null]>} */ ([
    ['great, even more shadows, just what I wanted', null],
    ['oh sure, let us make every corner a circle', null],
    ['buttons as round as a bowling ball, nice', null],
    ['the tooltips are too dark, I hate it', /brightness\(1\.15\)/],
    [
      'quit with the big gaps in the sidebar',
      /^set q spacing less --on side-nav$/,
    ],
  ]))
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      const changes = (data.results ?? []).filter((/** @type {any} */ r) =>
        r.commands.some((/** @type {string} */ c) =>
          / editor (set|undo) /.test(c),
        ),
      );
      if (want === null) expect(changes).toEqual([]);
      else expect(bare(changes[0].commands[0])).toMatch(want);
    });
});

/**
 * Final-13 questions: a write only for a clause that reads as an ask.
 * @type {Array<[string, RegExp | null]>}
 */
const QUESTIONS_X = [
  ["isn't the page too gray", null],
  ['what if the corners were square', null],
  ['brilliant idea, borders on every input', null],
  ["there's no reason not to underline links", null],
  ['whenever the accent is blue, switch it to red', null],
  ["don't make the corners not square", null],
  ['cards have a shadow, right?', null],
  ['corners are 10px, eh', null],
  ['hypothetically, pill buttons', null],
  ['consider 8px corners', null],
  ['no idea what the radius is but set it to 8px', /^set q corners 8px$/],
  [
    'dark mode only: accent #60a5fa',
    /^set q --color-accent '#60a5fa' --mode dark$/,
  ],
  [
    'dark.page=#09090b',
    /^set q --color-background-body '#09090b' --mode dark$/,
  ],
  ['shadow: off', /^set q --shadow-low none/],
  ['spacing--', /^set q spacing less$/],
  ['nuke the border on inputs', /^set q border none --on inputs$/],
  ['sharpen every corner', /^set q corners less$/],
  ['could the buttons be rounder', /^set q corners more --on button$/],
  ['I hate the purple, make it orange', /^set q accent '#f97316'$/],
  ['card padding 16px 24px', /^set q padding '16px 24px' --on card$/],
];

describe('how writes only for a clause that reads as an ask', () => {
  for (const [question, want] of QUESTIONS_X)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want);
    });
});

/**
 * Final-14 fixes: a plain statement never writes; removal and exclusion
 * words; one-mode phrases; shrink and decrease; long notes keep each value.
 * @type {Array<[string, RegExp | null]>}
 */
const QUESTIONS_Y = [
  // A description of the look wanted writes.
  ['the page is white', /^set q --color-background-body '#ffffff'$/],
  ['show me the card shadow', null],
  ['give me the border width on inputs', null],
  ['give buttons 8px corners', /^set q border-radius 8px --on button$/],
  ['decrease the spacing', /^set q spacing less$/],
  ['shrink the corner radius', /^set q corners less$/],
  ['trim the padding on cards', /^set q spacing less --on card$/],
  ["you're making spacing too big, shrink it", /^set q spacing less$/],
  [
    'only when dark mode is on, page #000000',
    /^set q --color-background-body '#000000' --mode dark$/,
  ],
  [
    'except in dark mode, make the background cream',
    /^set q --color-background-body '#fef3c7' --mode light$/,
  ],
  ["rimuovi l'ombra dalle card", /^set q box-shadow none --on card$/],
  ['🚫 shadows on cards', /^set q box-shadow none --on card$/],
  [
    'those dialog shadows are heavy',
    /^set q box-shadow 'var\(--shadow-low\)' --on dialog$/,
  ],
  [
    "don't touch the buttons, only square the cards",
    /^set q corners square --on card$/,
  ],
  ['leave the corners; spacing compact', /^set q spacing less$/],
  [
    'boutons arrondis, sans ombre',
    /^set q corners round --on button && set q box-shadow none --on button$/,
  ],
  [
    'I need: 1. accent #7c3aed 2. pill badges 3. no borders on tables 4. tooltips darker 5. links green',
    /--on table-row && set q filter 'brightness\(0\.85\)' --on tooltip/,
  ],
  [
    'Specifically she wants the cards to have softer corners (maybe around 12px), the primary buttons should use our brand blue which is #0057ff, and the page background should be a very light gray',
    /set q background '#0057ff' --on button --when variant:primary/,
  ],
];

describe('how answers final-14 fixes', () => {
  for (const [question, want] of QUESTIONS_Y)
    it(question, async () => {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      /** @type {Array<{text: string, commands: string[], sequence?: boolean}>} */
      const results = data.results ?? [];
      const changes = results.filter(r =>
        r.commands.some(c => / editor (set|undo) /.test(c)),
      );
      if (want === null) {
        expect(changes).toEqual([]);
        return;
      }
      const top = changes[0];
      const commands = top.sequence ? top.commands : [top.commands[0]];
      expect(commands.map(bare).join(' && ')).toMatch(want);
    });
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
      "set q background '#f3f4f6' --on tooltip",
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
    // The help that lists the asks it understands comes first.
    expect(data.run[0]).toMatch(/ how --help$/);
    expect(data.run[1]).toContain('--list parts');
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

describe('r19 (2): not dark enough / not light enough', () => {
  it('reads "not dark enough" and "not light enough" as darker and lighter, never as one mode', async () => {
    for (const [question, way] of [
      ['the text is not dark enough', 'darker'],
      ['the page is not light enough', 'lighter'],
    ]) {
      const {data} = await themeEditHow(question, {cwd, theme: 'q'});
      const text = data.results.map((/** @type {any} */ r) => r.text).join(' ');
      // The asked way, or that it goes no further that way.
      expect(text, question).toMatch(
        new RegExp(`${way}|as far from the page as it goes`),
      );
      // Both modes or neither: never one mode alone.
      const cmds = data.results
        .flatMap((/** @type {any} */ r) => r.commands)
        .join(' ');
      expect(cmds.includes('--mode light'), question).toBe(
        cmds.includes('--mode dark'),
      );
    }
  });
});
