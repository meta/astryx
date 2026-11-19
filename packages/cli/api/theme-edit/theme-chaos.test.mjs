// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Seeded chaos test for `astryx experimental theme`. One fixed seed
 *   drives 80 random but plausible commands (200 with THEME_EDIT_SLOW=1) through the real CLI
 *   program: valid values, near misses, edge values, undo chains, a damaged
 *   settings file. After every step it checks that an accepted command takes
 *   effect, that a refused command writes nothing and carries a documented
 *   error code, that no file appears outside the project, and that nothing
 *   crashes. The seed is printed; change SEED to explore another sequence.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {SLOW} from '../../test-utils/theme-render-stub.mjs';

const SEED = 20261110;
// The first 80 steps of the seeded sequence run by default, as a sample;
// THEME_EDIT_SLOW=1 runs all 200.
const STEPS = SLOW ? 200 : 80;

/** @param {number} a */
function prng(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(SEED);
/** @template T @param {T[]} a @returns {T} */
const pick = a => a[Math.floor(rand() * a.length)];
/** @param {number} p */
const chance = p => rand() < p;

const THEMES = ['a', 'c1', 'zz'];
const DIALS = {
  corners: [
    ['square', 'small', 'round', 'pill', 'more', 'less', '6px'],
    ['-4px', '6pt', 'roundest', ''],
  ],
  spacing: [
    ['tight', 'compact', 'medium', 'roomy', 'spacious', 'more'],
    ['huge', '2', ''],
  ],
  font: [
    [
      'inter',
      'system',
      'serif',
      'Georgia',
      '"Helvetica Neue", Arial, sans-serif',
    ],
    ['', '   '],
  ],
  headings: [
    ['light', 'bold', 'heavy', 'tight', 'wide'],
    ['boldest', '700'],
  ],
  surfaces: [['flat', 'outlined', 'raised', 'glass'], ['glossy']],
  buttons: [['solid', 'outline', 'soft', 'caps'], ['ghost']],
  type: [['compact', 'standard', 'editorial', 'display'], ['big']],
  'text-size': [
    ['small', 'large', 'larger', '16'],
    ['0', '-3', '16px', 'NaN'],
  ],
  vibrancy: [
    ['0', '30', '75', '100', 'more', 'less'],
    ['101', '-1', '50%', 'abc'],
  ],
};
const COLORS = [
  '#7c3aed',
  '#e11d48',
  'teal',
  'rgb(10 120 30)',
  'rgba(255, 0, 0, 0.5)',
  '#ff000080',
  'oklch(0.6 0.2 30)',
  'white',
  'black',
];
const BAD_COLORS = [
  '#ggg',
  '#12345',
  'reed',
  '',
  'currentColor',
  'red}body{color:blue',
  '12px',
  'ü',
];
const TOKENS = [
  ['--color-accent', 'color'],
  ['--color-background-card', 'color'],
  ['--color-text-primary', 'color'],
  ['--radius-element', 'size'],
  ['--spacing-4', 'size'],
  ['--font-family-body', 'font'],
];
const PARTS = [
  'button',
  'card',
  'badge',
  'text-input',
  'inputs',
  'containers',
  'app-shell-header',
];
const PROPS = [
  'background',
  'color',
  'border-radius',
  'padding',
  'box-shadow',
  'font-weight',
  'letter-spacing',
  'border',
];
const PROP_VALUES = [
  'red',
  '#123456',
  'linear-gradient(90deg, red, blue)',
  '12px',
  '0',
  'bold',
  '1px solid red',
  'red;}body{color:blue',
  '',
  'nonsense',
];

/** @param {string} type */
function tokenValue(type) {
  if (type === 'color') return chance(0.75) ? pick(COLORS) : pick(BAD_COLORS);
  if (type === 'size')
    return chance(0.75)
      ? pick(['8px', '0', '1.5rem'])
      : pick(['red', 'abc', '']);
  return chance(0.75) ? pick(['Georgia', 'system-ui']) : '';
}

/** One random step: the arguments after `experimental theme`. */
function nextStep() {
  const theme = chance(0.92) ? pick(THEMES) : pick(['nope', 'Bad', '../x', '']);
  const kind = chance(0.03)
    ? 'damage'
    : pick([
        'dial',
        'dial',
        'color',
        'token',
        'prop',
        'prop',
        'undo',
        'undo',
        'how',
        'new',
        'list',
      ]);
  if (kind === 'dial') {
    const dial = /** @type {keyof typeof DIALS} */ (pick(Object.keys(DIALS)));
    const [ok, bad] = DIALS[dial];
    return ['editor', 'set', theme, dial, chance(0.8) ? pick(ok) : pick(bad)];
  }
  if (kind === 'color')
    return [
      'editor',
      'set',
      theme,
      pick(['accent', 'neutral', 'danger', 'info']),
      chance(0.8) ? pick(COLORS) : pick(BAD_COLORS),
    ];
  if (kind === 'token') {
    const [name, type] = chance(0.9)
      ? pick(TOKENS)
      : ['--color-acent', 'color'];
    return [
      'editor',
      'set',
      theme,
      name,
      tokenValue(type),
      ...(type === 'color' && chance(0.3)
        ? ['--mode', pick(['light', 'dark'])]
        : []),
    ];
  }
  if (kind === 'prop') {
    const args = [
      'editor',
      'set',
      theme,
      chance(0.9) ? pick(PROPS) : 'backgrund',
      pick(PROP_VALUES),
      '--on',
      chance(0.9) ? pick(PARTS) : 'buton',
    ];
    if (chance(0.15)) args.push('--state', pick(['hover', 'disabled', 'hovr']));
    if (chance(0.1))
      args.push('--when', pick(['variant:primary', 'variant:nope']));
    return args;
  }
  if (kind === 'undo')
    return chance(0.65)
      ? ['editor', 'undo', theme]
      : [
          'editor',
          'undo',
          theme,
          pick([
            'corners',
            'accent',
            'spacing',
            '--color-accent',
            'background',
          ]),
        ];
  if (kind === 'how')
    return pick([
      ['editor', 'how', pick(PARTS)],
      ['editor', 'how', 'corners'],
      ['editor', 'how', '--list', pick(['dials', 'groups', 'kinds'])],
      ['editor', 'how', 'make', 'the', 'header', 'bold'],
    ]);
  if (kind === 'new')
    return [
      'editor',
      'new',
      pick([...THEMES, 'Bad']),
      ...(chance(0.5) ? ['--like', pick(['neutral', 'bogus'])] : []),
    ];
  if (kind === 'list')
    return pick([
      ['preview', 'list'],
      ['targets', pick(['button', 'zzz'])],
      ['list'],
    ]);
  return ['damage', pick(THEMES)];
}

/** @type {string} */
let cwd;
/** @type {string} */
let root;

/** Every file under the project and beside it, with a hash, skipping node_modules. */
function snapshot(dir = root, rel = '', out = new Map()) {
  for (const e of fs.readdirSync(path.join(dir, rel), {withFileTypes: true})) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.name === 'node_modules') continue;
    const abs = path.join(dir, r);
    if (e.isDirectory()) {
      out.set(`${r}/`, 'dir');
      snapshot(dir, r, out);
    } else if (e.isFile())
      out.set(
        r,
        crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex'),
      );
  }
  return out;
}
/** @param {Map<string, string>} a @param {Map<string, string>} b @param {(k: string) => boolean} [keep] */
function changes(a, b, keep = () => true) {
  const d = [];
  for (const [k, v] of a)
    if (keep(k) && b.get(k) !== v) d.push(b.has(k) ? `~${k}` : `-${k}`);
  for (const k of b.keys()) if (keep(k) && !a.has(k)) d.push(`+${k}`);
  return d;
}
/** Custom property declarations of a stylesheet, by name. @param {string | null} css */
function declarations(css) {
  /** @type {Map<string, string[]>} */
  const m = new Map();
  for (const x of (css ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;{}]*);/g))
    m.set(x[1], [...(m.get(x[1]) ?? []), x[2].trim()]);
  return new Map([...m].map(([k, v]) => [k, v.sort().join(' | ')]));
}
/** @param {string} rel */
const readMaybe = rel => {
  try {
    return fs.readFileSync(path.join(cwd, rel), 'utf8');
  } catch {
    return null;
  }
};

/** @param {string[]} args @param {boolean} [json] */
async function run(args, json = true) {
  const r = await runCli(
    [...(json ? ['--json'] : []), 'experimental', 'theme', ...args],
    {cwd},
  );
  /** @type {any} */
  let body = null;
  if (json)
    try {
      body = JSON.parse(r.stdout);
    } catch {
      body = null;
    }
  return {...r, body};
}

/** @type {Array<{invariant: string, step: number, args: string[], detail: string}>} */
const violations = [];
const counts = {
  steps: 0,
  accepted: 0,
  refused: 0,
  undoChecks: 0,
  textChecks: 0,
};

beforeAll(async () => {
  console.log(`theme chaos seed ${SEED}, ${STEPS} steps`);
  cwd = makeLinkedFixture('astryx-theme-chaos-', [
    ...FIXTURE_PACKAGES,
    '@types/react',
    '@types/react-dom',
  ]);
  root = path.dirname(cwd);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({name: 'app', private: true, type: 'module', dependencies: {'@astryxdesign/core': '*'}})}\n`,
  );
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  // A routes folder has a root layout, which loads Core's stylesheet.
  if (!fs.existsSync(path.join(cwd, 'src/app/layout.tsx')))
    fs.writeFileSync(
      path.join(cwd, 'src/app/layout.tsx'),
      "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
    );
  for (const t of THEMES) await run(['editor', 'new', t]);

  /** Snapshots of each theme folder from before each accepted set, newest last. */
  /** @type {Map<string, Array<Map<string, string>>>} */
  const undoStack = new Map(THEMES.map(t => [t, []]));
  const themeFiles = (/** @type {string} */ t) => {
    const all = snapshot();
    return new Map(
      [...all].filter(([k]) => k.startsWith(`project/themes/${t}/`)),
    );
  };
  /** @param {string} invariant @param {number} step @param {string[]} args @param {string} detail */
  const flag = (invariant, step, args, detail) =>
    violations.push({invariant, step, args, detail});

  for (let i = 0; i < STEPS; i++) {
    const args = nextStep();
    counts.steps++;
    if (args[0] === 'damage') {
      // A damaged settings file: the documented recovery is a step back.
      const f = path.join(cwd, 'themes', args[1], `${args[1]}.settings.json`);
      if (fs.existsSync(f)) fs.writeFileSync(f, '{"settings": [');
      if (undoStack.has(args[1])) undoStack.set(args[1], []);
      continue;
    }
    const t = args[0] === 'editor' ? args[2] : '';
    const owned = THEMES.includes(t);
    const before = snapshot();
    const cssBefore = owned ? readMaybe(`themes/${t}/${t}.css`) : null;
    const settingsBefore = owned
      ? readMaybe(`themes/${t}/${t}.settings.json`)
      : null;
    const r = await run(args);
    const after = snapshot();
    const out = `${r.stdout}\n${r.stderr}`;

    // Invariant 7: no crash, no unknown error, no stack trace.
    if (/^\s+at .+:\d+:\d+\)?$/m.test(out))
      flag('7 stack trace', i, args, out.slice(0, 300));
    if (r.body?.code === 'ERR_UNKNOWN')
      flag('7 ERR_UNKNOWN', i, args, r.body.error);
    // Invariant 1: exit 0 is ok, exit 1 is a documented code and writes nothing.
    if (!r.body) {
      flag('1 not one JSON document', i, args, out.slice(0, 300));
      continue;
    }
    const refused = typeof r.body.error === 'string';
    if ((r.status === 0) === refused)
      flag(
        '1 exit code and envelope disagree',
        i,
        args,
        `exit ${r.status}: ${r.stdout.slice(0, 200)}`,
      );
    if (refused) {
      counts.refused++;
      if (!(r.body.code in ERROR_CODES))
        flag('1 undocumented code', i, args, String(r.body.code));
      const d = changes(before, after);
      if (d.length)
        flag(
          '1 a refusal wrote files',
          i,
          args,
          `${r.body.code}: ${d.join(' ')}`,
        );
      // Invariant 3, sampled: the text form says the same refusal.
      if (chance(0.25)) {
        counts.textChecks++;
        const text = await run(args, false);
        const said = `${text.stdout}\n${text.stderr}`;
        if (
          text.status !== r.status ||
          !said.includes(r.body.error.slice(0, 60))
        )
          flag('3 text and JSON refusals differ', i, args, said.slice(0, 200));
        const d2 = changes(after, snapshot());
        if (d2.length)
          flag(
            '1 a refusal wrote files',
            i,
            args,
            `text form: ${d2.join(' ')}`,
          );
      }
    } else counts.accepted++;
    // Invariant 4: nothing beside the project, no temporary files left.
    for (const k of after.keys()) {
      if (!k.startsWith('project/') && !before.has(k) && k !== 'project/')
        flag('4 a file outside the project', i, args, k);
      if (/\.astryx-render|\.load[-.]|\.tmp$/.test(k))
        flag('4 a temporary file left', i, args, k);
    }

    if (refused || !owned) continue;
    const sub = args[1];
    if (sub === 'new') undoStack.set(t, []);
    if (sub !== 'set' && sub !== 'undo') continue;
    const data = r.body.data;
    if (sub === 'undo' && args.length === 3) {
      // Invariant 2: a step back restores the files from before the change.
      const want = undoStack.get(t)?.pop();
      if (want) {
        counts.undoChecks++;
        const d = changes(
          want,
          themeFiles(t),
          k => !/\.history\.json$|sheet\.html$/.test(k),
        );
        if (d.length)
          flag('2 undo does not restore the files', i, args, d.join(' '));
      }
      continue;
    }
    // A change that changes nothing adds no undo step.
    const noChange = String(data.notes?.[0] ?? '').startsWith('no change');
    if (!noChange)
      undoStack
        .get(t)
        ?.push(
          new Map(
            [...before].filter(([k]) => k.startsWith(`project/themes/${t}/`)),
          ),
        );
    // Invariant 2: a reported token change is in the built CSS or module.
    const css = readMaybe(`themes/${t}/${t}.css`);
    const a = declarations(cssBefore);
    const b = declarations(css);
    for (const line of data.changedTokens ?? []) {
      const m = /^(--[\w-]+)(?: \((?:light|dark)\))?: (.*) -> (.*)$/s.exec(
        line,
      );
      if (!m) flag('2 changedTokens entry is malformed', i, args, line);
      else if (m[2] === m[3])
        flag('2 changedTokens lists an unchanged token', i, args, line);
      else if (
        a.has(m[1]) &&
        a.get(m[1]) === b.get(m[1]) &&
        changes(before, after, k => k.endsWith(`${t}.js`)).length === 0
      )
        flag('2 a reported change is not in the build', i, args, line);
    }
    // Invariant 2: an accepted change that changes the settings changes the build.
    const settings = readMaybe(`themes/${t}/${t}.settings.json`);
    const built = changes(
      before,
      after,
      k => k.endsWith(`/${t}.css`) || k.endsWith(`/${t}.js`),
    );
    if (settingsBefore && settings && !built.length) {
      const was = JSON.parse(settingsBefore);
      const now = JSON.parse(settings);
      if (JSON.stringify(was.settings) !== JSON.stringify(now.settings))
        flag(
          '2 an accepted change has no effect on the build',
          i,
          args,
          `changedTokens ${data.changedTokens?.length ?? 0}, styled ${data.styled?.length ?? 0}`,
        );
    }
  }
}, 900_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Violations that a known finding below explains, with its name. The loop
 * reports only the others, so a new failure stands out.
 * @type {Array<[string, (v: (typeof violations)[number]) => boolean]>}
 */
const KNOWN = [
  [
    'F10',
    v =>
      v.invariant.startsWith('2 an accepted change has no effect') &&
      v.args[3] === 'vibrancy',
  ],
];
/** @param {string} prefix */
const of = prefix =>
  violations
    .filter(
      v =>
        v.invariant.startsWith(prefix) && !KNOWN.some(([, known]) => known(v)),
    )
    .map(v => `#${v.step} ${v.args.join(' ')} :: ${v.invariant}: ${v.detail}`);

describe(`theme chaos, seed ${SEED}`, () => {
  it('ran the sequence with accepted and refused steps', () => {
    console.log(`theme chaos seed ${SEED}: ${JSON.stringify(counts)}`);
    for (const v of violations) {
      const known = KNOWN.find(([, k]) => k(v));
      if (known)
        console.log(
          `known ${known[0]}: #${v.step} ${v.args.join(' ')} :: ${v.invariant}`,
        );
    }
    expect(counts.steps).toBe(STEPS);
    expect(counts.accepted).toBeGreaterThan(STEPS / 10);
    expect(counts.refused).toBeGreaterThan(STEPS / 10);
  });
  it('1: exit 0 is ok; a refusal has a documented code and writes nothing', () => {
    expect(of('1')).toEqual([]);
  });
  it('2: an accepted change takes effect as reported, and undo restores it', () => {
    expect(of('2')).toEqual([]);
  });
  it('3: the text form of a refusal says what the JSON form says', () => {
    expect(of('3')).toEqual([]);
  });
  it('4: nothing is written outside the project and no temporary file is left', () => {
    expect(of('4')).toEqual([]);
  });
  it('7: no crash, no ERR_UNKNOWN, no stack trace', () => {
    expect(of('7')).toEqual([]);
  });
});

// Known findings of the chaos run, each reduced to its shortest repro. Each
// test fails today; when a fix lands, its test passes and must lose `.fails`.
describe('known chaos findings', () => {
  /** @param {string[]} args */
  const step = async args => {
    const before = snapshot();
    const r = await run(args);
    return {r, changed: changes(before, snapshot())};
  };
  /** A result that is accepted, or refused with a documented code and nothing written. @param {{r: any, changed: string[]}} x */
  const clean = x =>
    x.r.status === 0 ||
    (x.r.status === 1 &&
      x.r.body?.code !== 'ERR_UNKNOWN' &&
      x.r.body?.code in ERROR_CODES &&
      x.changed.length === 0);

  it('F1: a refused undo keeps the theme folder', async () => {
    await run(['editor', 'new', 'kd']);
    await run(['editor', 'set', 'kd', 'corners', 'pill']);
    fs.appendFileSync(path.join(cwd, 'themes/kd/kd.theme.ts'), 'oops(\n');
    fs.writeFileSync(path.join(cwd, 'themes/kd/kd.settings.json'), '');
    await run(['editor', 'undo', 'kd']);
    expect(fs.existsSync(path.join(cwd, 'themes/kd/kd.theme.ts'))).toBe(true);
  }, 120_000);

  it('F5: a preview page with an empty template name is refused', async () => {
    const x = await step(['preview', 'add', '--template', '']);
    try {
      expect(x.r.status).toBe(1);
    } finally {
      fs.rmSync(path.join(cwd, 'src/app/theme-preview'), {
        recursive: true,
        force: true,
      });
    }
  }, 120_000);

  it('F3: a theme name with a dash before a digit is made (b-2)', async () => {
    const x = await step(['editor', 'new', 'k-2']);
    expect(x.r.body?.error ?? null).toBeNull();
  }, 120_000);

  it('F4: a damaged history file is refused cleanly by set', async () => {
    await run(['editor', 'new', 'kh']);
    await run(['editor', 'set', 'kh', 'corners', 'pill']);
    fs.writeFileSync(path.join(cwd, 'themes/kh/kh.history.json'), '{not json');
    expect(clean(await step(['editor', 'set', 'kh', 'spacing', 'roomy']))).toBe(
      true,
    );
  }, 120_000);

  it('F4: a damaged history file is refused cleanly by undo', async () => {
    await run(['editor', 'new', 'ku']);
    await run(['editor', 'set', 'ku', 'corners', 'pill']);
    fs.writeFileSync(path.join(cwd, 'themes/ku/ku.history.json'), '["{\\"name');
    expect(clean(await step(['editor', 'undo', 'ku']))).toBe(true);
  }, 120_000);

  it('F8: a settings file of the wrong shape is refused with a theme code', async () => {
    await run(['editor', 'new', 'ks']);
    fs.writeFileSync(
      path.join(cwd, 'themes/ks/ks.settings.json'),
      '{"settings": 5}',
    );
    expect(clean(await step(['editor', 'show', 'ks']))).toBe(true);
  }, 120_000);

  it('F8: a preview data file of the wrong shape is refused with a code', async () => {
    fs.mkdirSync(path.join(cwd, 'src/app/theme-preview'), {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'src/app/theme-preview/theme-preview.json'),
      '{"pages": "x", "files": 7}',
    );
    try {
      expect(clean(await step(['preview', 'list']))).toBe(true);
    } finally {
      fs.rmSync(path.join(cwd, 'src/app/theme-preview'), {
        recursive: true,
        force: true,
      });
    }
  }, 120_000);

  it('F14: an option with its value missing is refused with a parse code, not ERR_UNKNOWN', async () => {
    const x = await step(['editor', 'set', 'a', 'corners', 'pill', '--on']);
    expect(x.r.body?.code).toBe('ERR_MISSING_ARGUMENT');
  }, 120_000);

  it('F6 (now one-mode by <Theme mode>): mode dark-only says where the mode goes and keeps the colors', async () => {
    // Core has no mode inside a theme: the theme keeps both halves of its
    // colors and the app's <Theme> is given mode="dark".
    await run(['editor', 'new', 'km', '--accent', '#e11d48']);
    const x = await step(['editor', 'set', 'km', 'mode', 'dark-only']);
    expect(JSON.stringify(x.r.body)).toContain('mode=\\"dark\\"');
  }, 120_000);

  it('F9: undo after a color restores the palette files exactly', async () => {
    await run(['editor', 'new', 'kp', '--accent', '#e11d48']);
    const before = snapshot();
    await run(['editor', 'set', 'kp', 'warning', '#FFF']);
    await run(['editor', 'undo', 'kp']);
    expect(
      changes(
        before,
        snapshot(),
        k => k.includes('/themes/kp/') && !k.endsWith('.history.json'),
      ),
    ).toEqual([]);
  }, 120_000);

  it('F10: vibrancy is refused when the only color is a gray', async () => {
    await run(['editor', 'new', 'kv', '--accent', 'black']);
    const x = await step(['editor', 'set', 'kv', 'vibrancy', '75']);
    expect(x.r.status === 1 || x.changed.some(k => k.endsWith('/kv.css'))).toBe(
      true,
    );
  }, 120_000);

  it('F7: a color change refused by a failed build leaves the palette files as they were', async () => {
    await run(['editor', 'new', 'kr', '--accent', 'red']);
    fs.writeFileSync(
      path.join(cwd, 'themes/kr/kr.theme.ts'),
      'export const broken = ;\n',
    );
    const x = await step(['editor', 'set', 'kr', 'danger', 'white']);
    expect(x.r.status).toBe(1);
    expect(x.changed).toEqual([]);
  }, 120_000);
});
