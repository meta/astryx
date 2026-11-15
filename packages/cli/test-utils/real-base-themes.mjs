// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The bundled themes, installed in a linked fixture as an app that
 *   installs them has them.
 * @input A linked fixture's path and the bundled theme names it needs.
 * @output An empty string, or why a theme could not be installed.
 * @position Test support. A checkout that built only Core has no theme
 *   `dist`: the theme is then built as its package build's theme step does,
 *   from its own source with its own installed packages.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
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
      const out = `node_modules/.astryx-test-built/${process.pid}`;
      await themeBuild(
        `src/${like}Theme.ts`,
        {out: `${out}/dist/theme.css`, iconsSpecifier: './icons.mjs'},
        {cwd: own},
      );
      fs.mkdirSync(link, {recursive: true});
      fs.copyFileSync(
        path.join(own, 'package.json'),
        path.join(link, 'package.json'),
      );
      fs.cpSync(path.join(own, out, 'dist'), path.join(link, 'dist'), {
        recursive: true,
      });
      fs.rmSync(path.join(own, out), {recursive: true, force: true});
      // The icon registry the module imports is a separate package step;
      // these tests never read it, so an empty one stands in.
      const js = fs.readFileSync(path.join(link, 'dist', `${like}.js`), 'utf8');
      const icons = /import \{\s*(\w+)\s*\} from ["']\.\/icons\.mjs["']/.exec(
        js,
      )?.[1];
      if (icons)
        fs.writeFileSync(
          path.join(link, 'dist', 'icons.mjs'),
          `export const ${icons} = {};\n`,
        );
    } catch (e) {
      return `the ${like} theme could not be built here: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return '';
}
