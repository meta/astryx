#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.


/**
 * @description Asserts every documented public component var is settable from a theme
 * @input --storybook-dir <path> [--port <n>]
 * @output One line per var; exit 1 if any var cannot be reached from @layer astryx-theme
 *
 * A public var is a promise: set it on the component's theme target and the
 * component changes. Nothing in the unit suite can check that promise. jsdom
 * resolves no cascade, so the TreeList and Spinner theme tests assert on the
 * generated CSS text instead — which says the declaration was emitted, not that
 * it wins. A var can be documented, read, and emitted and still be beaten to
 * the element by a rule the theme cannot outrank.
 *
 * So this reproduces what a themer does. `Theme` injects component overrides as
 * `@layer astryx-theme { <selector> { … } }` (packages/core/src/theme/Theme.tsx),
 * and that is the exact shape written here, against the documented target class
 * — not against the element, which would prove a cascade a theme has no
 * selector for. Three ways to fail, all of them shipped at least once:
 *
 *   1. nothing declares the var          — no component reads it (#5012)
 *   2. the declaring element carries no documented target class
 *                                        — a theme has nothing to select
 *   3. the theme rule loses               — an inline write or an unlayered
 *                                           declaration outranks it (#4530)
 *
 * A var the component reads with a fallback and never declares is an inherited
 * seam: no element has a value until a container or a theme sets one. When no
 * story declares such a var, the page's CSS must read it, and the theme rule on
 * a rendered target element must arrive there.
 *
 * What it does NOT prove is the pixel: it stops at the value arriving on the
 * element. What the component then paints with it is that component's own test.
 */

const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {pathToFileURL} = require('node:url');

const args = process.argv.slice(2);
const getArg = name => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const storybookDir = getArg('storybook-dir') || 'apps/storybook/dist';
const port = Number(getArg('port') || 6011);

/** Distinctive enough that a coincidental match is not a concern. */
const SENTINEL = '9987px';

/**
 * Stories tried per component before the var is reported unrenderable. A var
 * only some states declare (`--button-icon-only-aspect` needs `isIconOnly`)
 * is not reachable from the first story, so the sweep runs until one declares
 * it — the common case still exits on the first. The cap only bounds a
 * component with an unusually long story list.
 */
const STORY_BUDGET = 30;

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function createServer(dir, listenPort) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const filePath = path
        .join(dir, req.url === '/' ? 'index.html' : req.url)
        .split('?')[0];

      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(dir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(resolved, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': CONTENT_TYPES[path.extname(resolved)] || 'text/plain',
        });
        res.end(data);
      });
    });

    server.listen(listenPort, () => resolve(server));
  });
}

/**
 * The public vars and the target classes their component documents, read from
 * the same enumeration `theme targets` and `theme build` read — so a var added
 * to a doc is guarded here without anyone remembering to add it.
 */
async function documentedVars(repoRoot) {
  const discovery = path.join(
    repoRoot,
    'packages/cli/foundation/discovery/theming-targets.mjs',
  );
  const {collectThemingVars, collectThemingTargets} = await import(
    pathToFileURL(discovery).href
  );
  const coreSrc = path.join(repoRoot, 'packages/core/src');
  const [vars, targets] = await Promise.all([
    collectThemingVars(coreSrc),
    collectThemingTargets(coreSrc),
  ]);
  return vars.map(v => ({
    ...v,
    classNames: targets
      .filter(t => t.component === v.component)
      .map(t => t.className),
  }));
}

/** Story ids for a component, in declaration order. */
function storiesFor(index, component) {
  return Object.values(index.entries || {})
    .filter(e => e.type === 'story' && e.title.split('/').pop() === component)
    .map(e => e.id);
}

/**
 * In the page: find the element that declares `name`, check it carries one of
 * the component's documented target classes, then override through that class
 * from `@layer astryx-theme` and read the value back.
 */
function reachInPage([name, classNames, sentinel]) {
  const themeSets = (element, target) => {
    const before = getComputedStyle(element).getPropertyValue(name).trim();
    const style = document.createElement('style');
    style.textContent = `@layer astryx-theme { .${target} { ${name}: ${sentinel}; } }`;
    document.head.appendChild(style);
    const after = getComputedStyle(element).getPropertyValue(name).trim();
    style.remove();
    return {
      status: after === sentinel ? 'reaches' : 'inert',
      target,
      before,
      after,
    };
  };

  const declaring = [...document.querySelectorAll('*')].find(el => {
    if (!getComputedStyle(el).getPropertyValue(name).trim()) return false;
    const parent = el.parentElement;
    return (
      !parent || !getComputedStyle(parent).getPropertyValue(name).trim()
    );
  });
  if (!declaring) return {status: 'undeclared', inherited: inheritedSeam()};

  const target = classNames.find(c => declaring.classList.contains(c));
  if (!target) {
    return {
      status: 'unselectable',
      classes: [...declaring.classList].filter(c => c.startsWith('astryx-')),
    };
  }

  return themeSets(declaring, target);

  /**
   * A var the component reads with a fallback and never declares, so an
   * ancestor's value reaches it (Link's `--link-hover-color`). No element has
   * a value until a container or a theme sets one, so no element declares it.
   * It is a seam only when the page's CSS reads it and declares it nowhere; a
   * var some rule declares stays on the declaring-element path above.
   */
  function inheritedSeam() {
    const rules = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) rules.push(rule.cssText);
      } catch {
        // A cross-origin sheet hides its rules; Core's CSS is same-origin.
      }
    }
    if (!rules.some(text => text.includes(`var(${name}`))) return null;
    if (rules.some(text => text.includes(`${name}:`))) return null;
    for (const target of classNames) {
      const element = document.querySelector(`.${target}`);
      if (element) return themeSets(element, target);
    }
    return null;
  }
}

async function probe(context, entry, index) {
  const ids = storiesFor(index, entry.component).slice(0, STORY_BUDGET);
  if (ids.length === 0) {
    return {status: 'nostory'};
  }
  let last = {status: 'undeclared'};
  let inherited = null;
  for (const id of ids) {
    const page = await context.newPage();
    try {
      await page.goto(
        `http://localhost:${port}/iframe.html?id=${id}&viewMode=story`,
        {waitUntil: 'networkidle', timeout: 30000},
      );
      const result = await page.evaluate(reachInPage, [
        entry.name,
        entry.classNames,
        SENTINEL,
      ]);
      if (result.status !== 'undeclared') return {...result, story: id};
      last = {...result, story: id};
      if (!inherited && result.inherited) {
        inherited = {...result.inherited, story: id};
      }
    } finally {
      await page.close();
    }
  }
  // Only once no story declares the var: a declaring element, when one
  // renders, is where an unlayered declaration can outrank the theme.
  return inherited || last;
}

async function run() {
  const repoRoot = process.cwd();
  const dir = path.resolve(repoRoot, storybookDir);
  if (!fs.existsSync(dir)) {
    console.error(`Storybook build not found at ${dir}`);
    return 1;
  }
  const indexPath = path.join(dir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error(`Storybook index not found at ${indexPath}`);
    return 1;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

  const entries = await documentedVars(repoRoot);
  if (entries.length === 0) {
    console.error(
      'No public component vars were enumerated. The docs cannot have lost ' +
        'all of them at once — the enumeration is broken.',
    );
    return 1;
  }

  const server = await createServer(dir, port);
  const browser = await chromium.launch();
  const failures = [];

  try {
    const context = await browser.newContext({
      viewport: {width: 900, height: 700},
    });

    for (const entry of entries) {
      const r = await probe(context, entry, index);
      const where = `${entry.component} ${entry.name}`;
      if (r.status === 'reaches') {
        console.log(`✓ ${where} — .${r.target} sets it (${r.before} → ${r.after})`);
        continue;
      }
      failures.push(where);
      if (r.status === 'nostory') {
        console.error(`✗ ${where}: no story renders ${entry.component}`);
      } else if (r.status === 'undeclared') {
        console.error(
          `✗ ${where}: nothing declares it — no element in any ${entry.component} story has a value (#5012)`,
        );
      } else if (r.status === 'unselectable') {
        console.error(
          `✗ ${where}: declared on an element carrying no documented target class ` +
            `(has ${r.classes.join(', ') || 'none'}) — a theme has no selector for it`,
        );
      } else {
        console.error(
          `✗ ${where}: .${r.target} in @layer astryx-theme did not win — stayed ${r.after} (#4530)`,
        );
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length > 0) {
    console.error(
      `\nFailing: ${failures.length} documented public var(s) a theme cannot set — ` +
        `${failures.join(', ')}. A var an author reads about and cannot use is ` +
        `worse than no var.`,
    );
    return 1;
  }
  console.log(`\nAll ${entries.length} public component vars are settable from a theme.`);
  return 0;
}

run()
  .then(code => {
    process.exitCode = code;
  })
  .catch(e => {
    console.error('Theme var reachability guard failed:', e);
    process.exit(1);
  });
