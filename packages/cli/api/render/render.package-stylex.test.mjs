// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A package that ships StyleX source, not compiled StyleX, exports as
 * it builds in an app: its styles compile with the page's own class-name
 * prefix, in the server render and in the page's script. Its keyframes
 * animation reaches the stylesheet, and neither render throws StyleX's
 * runtime error. The package comes from node_modules or from a workspace
 * folder linked into it. A file of such a package that only the browser
 * loads carries its styles too: a lazy import of another file of the
 * package, and a package the first paint never uses that a click loads,
 * directly, through a file that re-exports it, through a page module, or
 * through the package's own lazy import. A package that ships compiled
 * StyleX stays as it ships: its classes keep their names and add no rule to
 * the page.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {JSDOM} from 'jsdom';
import postcss from 'postcss';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {ROOT_ID} from '../../foundation/render/client-bundle.mjs';
import {requiredClasses} from '../../foundation/render/css-cut.mjs';
import {pageDom} from '../../test-utils/page-dom.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

/** A marquee whose text scrolls by a keyframes animation, as a package ships its source. */
const MARQUEE = `import * as stylex from '@stylexjs/stylex';

const scroll = stylex.keyframes({
  from: {transform: 'translateX(100%)'},
  to: {transform: 'translateX(-100%)'},
});

const styles = stylex.create({
  track: {overflow: 'hidden', whiteSpace: 'nowrap'},
  text: {
    display: 'inline-block',
    animationName: scroll,
    animationDuration: '8s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
});

export function Marquee({children}: {children: string}) {
  return (
    <div data-part="marquee" {...stylex.props(styles.track)}>
      <span data-part="marquee-text" {...stylex.props(styles.text)}>{children}</span>
    </div>
  );
}
`;

/** A badge that pulses, in a second file of the same package, loaded lazily. */
const BADGE = `import * as stylex from '@stylexjs/stylex';

const pulse = stylex.keyframes({
  '0%': {opacity: 1},
  '50%': {opacity: 0.4},
  '100%': {opacity: 1},
});

const styles = stylex.create({
  badge: {
    color: stylex.firstThatWorks('light-dark(#b00, #f66)', '#b00'),
    animationName: pulse,
    animationDuration: '1s',
    animationIterationCount: 'infinite',
  },
});

export default function NewBadge() {
  return <strong data-part="badge" {...stylex.props(styles.badge)}>NEW!</strong>;
}
`;

/** A package that ships compiled StyleX: plain class names and its own stylesheet. */
const COMPILED = `import * as stylex from '@stylexjs/stylex';
import {jsx} from 'react/jsx-runtime';

const styles = {chip: {kq7rw2: 'kq7rw2', $$css: true}};

export function Chip({label}) {
  return jsx('span', {'data-part': 'chip', ...stylex.props(styles.chip), children: label});
}
`;

const PAGE = (kit, lazyKit) => `import '@astryxdesign/core/astryx.css';
import {Suspense, lazy, useEffect, useState} from 'react';
import {Marquee} from '${kit}';
import {Chip} from 'compiled-kit';

const NewBadge = lazy(() => import('${lazyKit}/badge'));

export default function Page() {
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(true), []);
  return (
    <main>
      <Marquee>Breaking news</Marquee>
      <Chip label="Plain" />
      {shown ? <Suspense fallback={null}><NewBadge /></Suspense> : null}
    </main>
  );
}
`;

/** @type {string} */
let home;
/** @type {string} */
let root;
/** A workspace package's folder, outside the project and outside node_modules. @type {string} */
let workspace;

/** @param {string} name @param {string} content */
const put = (name, content) => {
  const file = path.isAbsolute(name) ? name : path.join(root, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
};

/**
 * A package that ships StyleX source: the marquee from its entry, the badge
 * from `./badge`, the badge re-exported from `./barrel` (a file with no
 * StyleX of its own), and from `./loader` a component that loads the badge
 * through the package's own `import()`.
 * @param {string} dir
 * @param {string} name
 */
const sourcePackage = (dir, name) => {
  put(
    `${dir}/package.json`,
    JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': './src/index.ts',
        './badge': './src/NewBadge.tsx',
        './barrel': './src/barrel.ts',
        './loader': './src/Loader.tsx',
      },
      peerDependencies: {'@stylexjs/stylex': '*', react: '*'},
    }),
  );
  put(`${dir}/src/index.ts`, "export {Marquee} from './Marquee';\n");
  put(`${dir}/src/Marquee.tsx`, MARQUEE);
  put(`${dir}/src/NewBadge.tsx`, BADGE);
  put(
    `${dir}/src/barrel.ts`,
    "export {default as NewBadge} from './NewBadge';\n",
  );
  put(
    `${dir}/src/Loader.tsx`,
    `import {Suspense, lazy} from 'react';

const NewBadge = lazy(() => import('./NewBadge'));

export function Loader() {
  return <Suspense fallback={null}><NewBadge /></Suspense>;
}
`,
  );
};

/**
 * The file's stylesheet: each keyframes name, and the animation names each
 * class's rules set.
 * @param {string} html
 */
function sheetOf(html) {
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
    .map(m => m[1])
    .join('\n');
  /** @type {Set<string>} */
  const keyframes = new Set();
  /** @type {Map<string, string>} */
  const animations = new Map();
  /** @type {Set<string>} */
  const classes = new Set();
  const parsed = postcss.parse(css);
  parsed.walkAtRules(/keyframes$/, at => {
    keyframes.add(at.params.trim());
  });
  parsed.walkRules(rule => {
    if (
      rule.parent?.type === 'atrule' &&
      /keyframes$/.test(/** @type {any} */ (rule.parent).name)
    )
      return;
    for (const c of requiredClasses(rule.selector)) {
      classes.add(c);
      rule.walkDecls('animation-name', d => {
        animations.set(c, d.value);
      });
    }
  });
  return {keyframes, animations, classes};
}

/**
 * Collects each error the page raises, from before its script runs.
 * @param {string[]} errors
 * @returns {(window: any) => void}
 */
const collectErrors = errors => window => {
  window.addEventListener('error', (/** @type {any} */ e) =>
    errors.push(String(e.message)),
  );
};

/**
 * Runs the file's script in a DOM and gives the page after it draws, with
 * every error the page raised.
 * @param {string} html
 */
async function runScript(html) {
  const errors = /** @type {string[]} */ ([]);
  const dom = await pageDom(html, {beforeParse: collectErrors(errors)});
  const realError = dom.window.console.error;
  dom.window.console.error = (...args) => {
    errors.push(args.map(String).join(' '));
    realError(...args);
  };
  for (
    let i = 0;
    i < 20 && !dom.window.document.querySelector('[data-part="badge"]');
    i++
  ) {
    await new Promise(resolve => dom.window.setTimeout(resolve, 50));
  }
  return {dom, errors};
}

/**
 * A class or keyframes name the page's own StyleX prefix makes: `p` and a
 * hash. Core's sheet, which the page imports, uses other prefixes.
 * @param {string} name
 */
const isPageName = name =>
  /^p[a-z0-9]{5,}(?:-B)?$/.test(name) && /\d/.test(name);

/**
 * Asserts that an element's classes give it a keyframes animation the
 * stylesheet defines, under the page's own prefix.
 * @param {ReturnType<typeof sheetOf>} sheet
 * @param {Element | null} el
 */
function expectAnimated(sheet, el) {
  expect(el).not.toBeNull();
  const own = [...(el?.classList ?? [])];
  const named = own.map(c => sheet.animations.get(c)).filter(Boolean);
  expect(named.length).toBe(1);
  expect(sheet.keyframes.has(/** @type {string} */ (named[0]))).toBe(true);
  for (const c of own) expect(c.startsWith('p')).toBe(true);
}

beforeAll(() => {
  home = makeLinkedFixture('astryx-render-package-stylex-', [
    '@astryxdesign',
    '@stylexjs',
    'react',
    'react-dom',
  ]);
  root = path.dirname(home);
  sourcePackage('node_modules/marquee-kit', 'marquee-kit');
  for (const name of ['lazy-kit', 'barrel-kit', 'panel-kit', 'loader-kit']) {
    sourcePackage(`node_modules/${name}`, name);
  }
  // A workspace package: its source lives outside the project and outside
  // node_modules, linked in as a package manager links a workspace.
  workspace = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-ws-kit-')),
  );
  sourcePackage(workspace, 'ws-kit');
  for (const name of ['@stylexjs', 'react', 'react-dom']) {
    fs.mkdirSync(path.join(workspace, 'node_modules'), {recursive: true});
    fs.symlinkSync(
      fs.realpathSync(path.join(root, 'node_modules', name)),
      path.join(workspace, 'node_modules', name),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
  fs.symlinkSync(
    workspace,
    path.join(root, 'node_modules/ws-kit'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  put(
    'node_modules/compiled-kit/package.json',
    JSON.stringify({
      name: 'compiled-kit',
      version: '1.0.0',
      type: 'module',
      main: './index.js',
      peerDependencies: {'@stylexjs/stylex': '*', react: '*'},
    }),
  );
  put('node_modules/compiled-kit/index.js', COMPILED);
  fs.writeFileSync(
    path.join(home, 'from-modules.tsx'),
    PAGE('marquee-kit', 'marquee-kit'),
  );
  fs.writeFileSync(
    path.join(home, 'from-workspace.tsx'),
    PAGE('ws-kit', 'ws-kit'),
  );
});

afterAll(() => {
  removeLinkedFixture(home);
  fs.rmSync(workspace, {recursive: true, force: true});
});

describe.each([
  ['node_modules', 'from-modules'],
  ['a linked workspace folder', 'from-workspace'],
])('a package that ships StyleX source, from %s', (_where, page) => {
  /** @type {string} */
  let html;

  beforeAll(async () => {
    await render(`${page}.tsx`, {cwd: home, out: `${page}.html`});
    html = fs.readFileSync(path.join(home, `${page}.html`), 'utf8');
  }, 120_000);

  it('renders on the server with its keyframes animation in the stylesheet', () => {
    const sheet = sheetOf(html);
    const markup = new JSDOM(html).window.document;
    expect(
      markup.querySelector('[data-part="marquee-text"]')?.textContent,
    ).toBe('Breaking news');
    expectAnimated(sheet, markup.querySelector('[data-part="marquee-text"]'));
  });

  it('runs in a browser without a StyleX runtime error, and its lazy file carries its styles', async () => {
    const sheet = sheetOf(html);
    const {dom, errors} = await runScript(html);
    const doc = dom.window.document;
    const page = /** @type {HTMLElement} */ (doc.getElementById(ROOT_ID));
    expect(errors.filter(e => /stylex|at runtime/i.test(e))).toEqual([]);
    expect(errors).toEqual([]);
    expectAnimated(sheet, page.querySelector('[data-part="marquee-text"]'));
    expectAnimated(sheet, page.querySelector('[data-part="badge"]'));
    dom.window.close();
  });

  it('leaves a package that ships compiled StyleX as it ships', () => {
    const sheet = sheetOf(html);
    const chip = new JSDOM(html).window.document.querySelector(
      '[data-part="chip"]',
    );
    expect(chip?.className).toBe('kq7rw2');
    expect(sheet.classes.has('kq7rw2')).toBe(false);
  });
});

describe('a package that ships StyleX source that only a click loads', () => {
  it.each([
    [
      'its file, imported directly',
      "import('lazy-kit/badge').then(m => m.default)",
    ],
    [
      'a file that re-exports it',
      "import('barrel-kit/barrel').then(m => m.NewBadge)",
    ],
    [
      'a page module that imports it',
      "import('./panel/Panel').then(m => m.default)",
    ],
    [
      'a file of the package that imports it lazily',
      "import('loader-kit/loader').then(m => m.Loader)",
    ],
  ])(
    'carries its styles when the click loads %s',
    async (_how, load) => {
      const name = `on-click-${load.match(/'([^']+)'/)?.[1].replace(/[^a-z]+/g, '-')}`;
      fs.mkdirSync(path.join(home, 'panel'), {recursive: true});
      fs.writeFileSync(
        path.join(home, 'panel/Panel.tsx'),
        "import NewBadge from 'panel-kit/badge';\n\nexport default function Panel() {\n  return <NewBadge />;\n}\n",
      );
      fs.writeFileSync(
        path.join(home, `${name}.tsx`),
        `import '@astryxdesign/core/astryx.css';
import {useState, type ComponentType} from 'react';

export default function Page() {
  const [Badge, setBadge] = useState<ComponentType | null>(null);
  return (
    <main>
      <button onClick={() => ${load}.then(C => setBadge(() => C))}>Show</button>
      {Badge ? <Badge /> : null}
    </main>
  );
}
`,
      );
      await render(`${name}.tsx`, {cwd: home, out: `${name}.html`});
      const html = fs.readFileSync(path.join(home, `${name}.html`), 'utf8');
      const sheet = sheetOf(html);
      const errors = /** @type {string[]} */ ([]);
      const dom = await pageDom(html, {beforeParse: collectErrors(errors)});
      const doc = dom.window.document;
      const settle = () =>
        new Promise(resolve => dom.window.setTimeout(resolve, 50));
      await settle();
      expect(doc.querySelector('[data-part="badge"]')).toBeNull();
      /** @type {HTMLButtonElement} */ (doc.querySelector('button')).click();
      for (let i = 0; i < 20 && !doc.querySelector('[data-part="badge"]'); i++)
        await settle();
      expectAnimated(sheet, doc.querySelector('[data-part="badge"]'));
      expect(errors).toEqual([]);
      dom.window.close();
    },
    120_000,
  );
});

describe('a package that ships StyleX markers, variables and a theme', () => {
  it('compiles each: the page exports, its script runs, and its styles apply', async () => {
    put(
      'node_modules/token-kit/package.json',
      JSON.stringify({
        name: 'token-kit',
        version: '1.0.0',
        type: 'module',
        exports: {'.': './src/index.ts'},
      }),
    );
    put(
      'node_modules/token-kit/src/markers.stylex.ts',
      "import * as stylex from '@stylexjs/stylex';\n\nexport const cardMarker = stylex.defineMarker();\n",
    );
    put(
      'node_modules/token-kit/src/tokens.stylex.ts',
      `import * as stylex from '@stylexjs/stylex';

export const colors = stylex.defineVars({accent: 'rgb(1, 2, 3)'});
`,
    );
    put(
      'node_modules/token-kit/src/index.ts',
      `import * as stylex from '@stylexjs/stylex';
import {jsx, jsxs} from 'react/jsx-runtime';
import {cardMarker} from './markers.stylex';
import {colors} from './tokens.stylex';

const dark = stylex.createTheme(colors, {accent: 'rgb(4, 5, 6)'});

const styles = stylex.create({
  swatch: {
    color: colors.accent,
    opacity: {default: 1, [stylex.when.ancestor(':hover', cardMarker)]: 0.5},
  },
});

export function HoverCard({label}: {label: string}) {
  return jsxs('div', {
    'data-part': 'card',
    ...stylex.props(cardMarker, stylex.defaultMarker(), dark),
    children: [jsx('span', {'data-part': 'swatch', ...stylex.props(styles.swatch), children: label})],
  });
}
`,
    );
    fs.writeFileSync(
      path.join(home, 'tokens.tsx'),
      `import '@astryxdesign/core/astryx.css';
import {HoverCard} from 'token-kit';

export default function Page() {
  return <main><HoverCard label="Swatch" /></main>;
}
`,
    );
    await render('tokens.tsx', {cwd: home, out: 'tokens.html'});
    const html = fs.readFileSync(path.join(home, 'tokens.html'), 'utf8');
    const {dom, errors} = await runScript(html);
    const doc = dom.window.document;
    expect(errors).toEqual([]);
    const swatch = doc.querySelector('[data-part="swatch"]');
    expect(swatch?.textContent).toBe('Swatch');
    const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
      .map(m => m[1])
      .join('\n');
    const color = [...(swatch?.classList ?? [])].some(c =>
      new RegExp(`\\.${c}[^{]*\\{[^}]*color:var\\(--`).test(css),
    );
    expect(color).toBe(true);
    // The variables' values and the theme's override both reach the sheet.
    expect(css.replace(/\s/g, '')).toContain('rgb(1,2,3)');
    expect(css.replace(/\s/g, '')).toContain('rgb(4,5,6)');
    dom.window.close();
  }, 120_000);
});

describe('a package that maps a file away from the browser', () => {
  it('exports: the script leaves the file it maps to false unread', async () => {
    put(
      'node_modules/mapped-kit/package.json',
      JSON.stringify({
        name: 'mapped-kit',
        version: '1.0.0',
        type: 'module',
        main: './index.js',
        browser: {'./server-only.js': false},
      }),
    );
    put(
      'node_modules/mapped-kit/server-only.js',
      "export default {side: 'server'};\n",
    );
    put(
      'node_modules/mapped-kit/index.js',
      "import server from './server-only.js';\nexport const side = server ? 'server' : 'browser';\n",
    );
    fs.writeFileSync(
      path.join(home, 'mapped.tsx'),
      `import '@astryxdesign/core/astryx.css';
import {Marquee} from 'marquee-kit';
import {side} from 'mapped-kit';

export default function Page() {
  return <main><Marquee>{side}</Marquee></main>;
}
`,
    );
    await render('mapped.tsx', {cwd: home, out: 'mapped.html'});
    const html = fs.readFileSync(path.join(home, 'mapped.html'), 'utf8');
    const sheet = sheetOf(html);
    const {dom, errors} = await runScript(html);
    expectAnimated(
      sheet,
      dom.window.document.querySelector('[data-part="marquee-text"]'),
    );
    expect(errors).toEqual([]);
    dom.window.close();
  }, 120_000);
});

describe('a page whose packages all ship compiled StyleX', () => {
  it('compiles no package file: the page adds no rule and its script no StyleX compile', async () => {
    fs.writeFileSync(
      path.join(home, 'compiled-only.tsx'),
      `import '@astryxdesign/core/astryx.css';\nimport {Chip} from 'compiled-kit';\nexport default function Page() {\n  return <main><Chip label="Plain" /></main>;\n}\n`,
    );
    await render('compiled-only.tsx', {cwd: home, out: 'compiled-only.html'});
    const html = fs.readFileSync(path.join(home, 'compiled-only.html'), 'utf8');
    const sheet = sheetOf(html);
    expect([...sheet.keyframes].filter(isPageName)).toEqual([]);
    expect([...sheet.classes].filter(isPageName)).toEqual([]);
    const {dom, errors} = await runScript(html);
    expect(
      dom.window.document.querySelector('[data-part="chip"]')?.className,
    ).toBe('kq7rw2');
    expect(errors).toEqual([]);
    dom.window.close();
  }, 120_000);

  it('leaves one the page loads only through import() as it ships', async () => {
    fs.writeFileSync(
      path.join(home, 'compiled-lazy.tsx'),
      `import '@astryxdesign/core/astryx.css';
import {useState, type ComponentType} from 'react';

export default function Page() {
  const [Chip, setChip] = useState<ComponentType<{label: string}> | null>(null);
  return (
    <main>
      <button onClick={() => import('compiled-kit').then(m => setChip(() => m.Chip))}>Show</button>
      {Chip ? <Chip label="Plain" /> : null}
    </main>
  );
}
`,
    );
    await render('compiled-lazy.tsx', {cwd: home, out: 'compiled-lazy.html'});
    const html = fs.readFileSync(path.join(home, 'compiled-lazy.html'), 'utf8');
    expect([...sheetOf(html).classes].filter(isPageName)).toEqual([]);
    const {dom, errors} = await runScript(html);
    const doc = dom.window.document;
    /** @type {HTMLButtonElement} */ (doc.querySelector('button')).click();
    for (let i = 0; i < 20 && !doc.querySelector('[data-part="chip"]'); i++) {
      await new Promise(resolve => dom.window.setTimeout(resolve, 50));
    }
    expect(doc.querySelector('[data-part="chip"]')?.className).toBe('kq7rw2');
    expect(errors).toEqual([]);
    dom.window.close();
  }, 120_000);
});
