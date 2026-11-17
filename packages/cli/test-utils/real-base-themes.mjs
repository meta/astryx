// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The bundled themes, installed in a linked fixture as an app that
 *   installs them has them.
 * @input A linked fixture's path and the bundled theme names it needs.
 * @output An empty string, or why a theme could not be installed.
 * @position Test support. A checkout that built only Core has no theme
 *   `dist`: the theme is then built as its package build's theme step does,
 *   from its own source with its own installed packages, once for the run
 *   (in the run's folder the node project's global setup provides,
 *   `astryxBaseThemesDir`), and every fixture links that build. Out of a
 *   run of the node project, each fixture builds its own.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inject} from 'vitest';
import {themeBuild} from '../api/theme/build/build.mjs';

const THEMES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../themes',
);

/**
 * Install the bundled themes `likes` in the fixture at `cwd`.
 * @param {string} cwd a fixture from makeLinkedFixture
 * @param {string[]} likes bundled theme names, such as 'neutral'
 * @returns {Promise<string>} why a theme could not be built here, or ''
 */
export async function installRealBaseThemes(cwd, likes) {
  for (const like of likes) {
    const own = path.join(THEMES, like);
    const link = path.join(
      path.dirname(cwd),
      'node_modules/@astryxdesign',
      `theme-${like}`,
    );
    fs.rmSync(link, {recursive: true, force: true});
    if (fs.existsSync(path.join(own, 'dist', `${like}.js`))) {
      fs.symlinkSync(own, link, 'dir');
      continue;
    }
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
  const out = `node_modules/.astryx-test-built/${process.pid}`;
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
  fs.rmSync(path.join(own, out), {recursive: true, force: true});
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
