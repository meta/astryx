// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The bundled themes, installed in a linked fixture as an app that
 *   installs them has them.
 * @input A linked fixture's path and the bundled theme names it needs.
 * @output An empty string, or why a theme could not be installed.
 * @position Test support. A checkout that built only Core has no theme
 *   `dist`, a package build that is still running has a module without
 *   its icon registry, and a build older than the theme's source shows the
 *   theme as it was: the theme is then built as its package build's theme
 *   step does, from its own source with its own installed packages, once for
 *   the run (in the run's folder the node project's global setup provides,
 *   `astryxBaseThemesDir`), and every fixture links that build. Out of a run
 *   of the node project, each fixture builds its own. Parallel workers
 *   install at once, so nothing is written in a theme package's `dist` or in
 *   a scope folder that another fixture shares.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inject} from 'vitest';
import {themeBuild} from '../api/theme/build/build.mjs';
import {coreBuildIsStale} from '../clients/cli/commands/ensure-core-built.mjs';

const THEMES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../themes',
);

/**
 * The fixture's own `@astryxdesign` folder. A fixture that links the whole
 * scope links the CLI's folder, which every such fixture shares: it gets a
 * folder of its own that links each package the shared one holds.
 * @param {string} cwd
 * @returns {string}
 */
function ownScope(cwd) {
  const scope = path.join(path.dirname(cwd), 'node_modules/@astryxdesign');
  if (!fs.lstatSync(scope, {throwIfNoEntry: false})?.isSymbolicLink()) {
    fs.mkdirSync(scope, {recursive: true});
    return scope;
  }
  const shared = fs.realpathSync(scope);
  fs.unlinkSync(scope);
  fs.mkdirSync(scope);
  for (const entry of fs.readdirSync(shared)) {
    fs.symlinkSync(
      fs.realpathSync(path.join(shared, entry)),
      path.join(scope, entry),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
  return scope;
}

/**
 * Whether the theme package's build is complete and current: its module,
 * the icon registry the module imports (a later build step writes it), and
 * no source file newer than the module. A build older than its source
 * shows the theme as it was, so the theme is built again from its source.
 * @param {string} own
 * @param {string} like
 */
function builtWhole(own, like) {
  const module = path.join(own, 'dist', `${like}.js`);
  if (!fs.existsSync(module)) return false;
  if (coreBuildIsStale(module, [path.join(own, 'src')])) return false;
  return (
    !/from ["']\.\/icons\.mjs["']/.test(fs.readFileSync(module, 'utf8')) ||
    fs.existsSync(path.join(own, 'dist', 'icons.mjs'))
  );
}

/**
 * Install the bundled themes `likes` in the fixture at `cwd`.
 * @param {string} cwd a fixture from makeLinkedFixture
 * @param {string[]} likes bundled theme names, such as 'neutral'
 * @param {{themes?: string}} [options] the folder that holds the theme
 *   packages (the repository's by default)
 * @returns {Promise<string>} why a theme could not be built here, or ''
 */
export async function installRealBaseThemes(
  cwd,
  likes,
  {themes = THEMES} = {},
) {
  const scope = ownScope(cwd);
  for (const like of likes) {
    const own = path.join(themes, like);
    const link = path.join(scope, `theme-${like}`);
    fs.rmSync(link, {recursive: true, force: true});
    if (builtWhole(own, like)) {
      fs.symlinkSync(own, link, 'dir');
      continue;
    }
    if (!fs.existsSync(path.join(own, 'package.json')))
      return `the ${like} theme could not be built here: no package at ${own}`;
    try {
      const shared = await sharedBuild(own, like);
      if (shared) fs.symlinkSync(shared, link, 'dir');
      else await buildTheme(own, like, link);
    } catch (e) {
      return `the ${like} theme could not be built here: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return '';
}

/**
 * Build the bundled theme `like` from its source into `dest`, as a package
 * install has it: its package.json and its dist.
 * @param {string} own the theme's package folder
 * @param {string} like
 * @param {string} dest
 */
async function buildTheme(own, like, dest) {
  // Each build uses a folder of its own: two builds at once in one worker
  // must not share one.
  const built = path.join(own, 'node_modules/.astryx-test-built');
  fs.mkdirSync(built, {recursive: true});
  const out = path.relative(
    own,
    fs.mkdtempSync(path.join(built, `${process.pid}-`)),
  );
  try {
    await themeBuild(
      `src/${like}Theme.ts`,
      {out: `${out}/dist/theme.css`, iconsSpecifier: './icons.mjs'},
      {cwd: own},
    );
    fs.mkdirSync(dest, {recursive: true});
    fs.copyFileSync(
      path.join(own, 'package.json'),
      path.join(dest, 'package.json'),
    );
    fs.cpSync(path.join(own, out, 'dist'), path.join(dest, 'dist'), {
      recursive: true,
    });
  } finally {
    fs.rmSync(path.join(own, out), {recursive: true, force: true});
  }
  // The icon registry the module imports is a separate package step;
  // these tests never read it, so an empty one stands in.
  const js = fs.readFileSync(path.join(dest, 'dist', `${like}.js`), 'utf8');
  const icons = /import \{\s*(\w+)\s*\} from ["']\.\/icons\.mjs["']/.exec(
    js,
  )?.[1];
  if (icons)
    fs.writeFileSync(
      path.join(dest, 'dist', 'icons.mjs'),
      `export const ${icons} = {};\n`,
    );
}

/** How long a worker waits for another to finish a shared build. */
const SHARED_WAIT_MS = 120_000;

/**
 * The run's one build of the bundled theme `like`, made by the first
 * worker that needs it (the others wait for it); null out of a run of the
 * node project, or when the build another worker began did not finish, so
 * the caller builds its own.
 * @param {string} own
 * @param {string} like
 * @returns {Promise<string | null>}
 */
async function sharedBuild(own, like) {
  /** @type {unknown} */
  let dir;
  try {
    dir = inject('astryxBaseThemesDir');
  } catch {
    return null;
  }
  if (typeof dir !== 'string' || !fs.existsSync(dir)) return null;
  const dest = path.join(dir, `theme-${like}`);
  const done = path.join(dir, `theme-${like}.built`);
  if (fs.existsSync(done)) return dest;
  const lock = path.join(dir, `theme-${like}.lock`);
  try {
    fs.mkdirSync(lock);
  } catch {
    // Another worker builds it: wait for its mark.
    const until = Date.now() + SHARED_WAIT_MS;
    while (!fs.existsSync(done) && fs.existsSync(lock) && Date.now() < until)
      await new Promise(r => setTimeout(r, 100));
    return fs.existsSync(done) ? dest : null;
  }
  try {
    await buildTheme(own, like, dest);
    fs.writeFileSync(done, '');
    return dest;
  } finally {
    fs.rmSync(lock, {recursive: true, force: true});
  }
}
