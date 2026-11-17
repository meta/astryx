// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fixture installs a complete base theme even when the checkout has
 *   only the theme compiler's output, without the separate icon build.
 * @input A theme package with a built module and no icon registry.
 * @output A fixture whose built theme imports, without changing the package.
 * @position Regression coverage for the real base theme fixture helper.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, expect, it, vi} from 'vitest';
import {installRealBaseThemes} from './real-base-themes.mjs';

const {root} = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  return {
    root: fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-real-base-themes-')),
  };
});

vi.mock('node:url', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    fileURLToPath: (url, ...args) =>
      String(url).endsWith('/test-utils/real-base-themes.mjs')
        ? path.join(root, 'packages/cli/test-utils/real-base-themes.mjs')
        : original.fileURLToPath(url, ...args),
  };
});

vi.mock('../api/theme/build/build.mjs', () => ({
  themeBuild: async (_source, {out}, {cwd}) => {
    const dist = path.dirname(path.resolve(cwd, out));
    fs.mkdirSync(dist, {recursive: true});
    fs.writeFileSync(path.join(dist, 'fixture.js'), moduleSource);
    fs.writeFileSync(path.join(dist, 'theme.css'), ':root {}\n');
  },
}));

const moduleSource =
  'import {fixtureIcons} from "./icons.mjs";\n' +
  'export const fixtureTheme = {name: "fixture", icons: fixtureIcons};\n';

const own = path.join(root, 'packages/themes/fixture');
const cwd = path.join(root, 'app/project');

fs.mkdirSync(path.join(own, 'dist'), {recursive: true});
fs.mkdirSync(path.join(root, 'app/node_modules/@astryxdesign'), {
  recursive: true,
});
fs.mkdirSync(cwd);
fs.writeFileSync(
  path.join(own, 'package.json'),
  JSON.stringify({
    type: 'module',
    exports: {'./built': './dist/fixture.js'},
  }),
);
fs.writeFileSync(path.join(own, 'dist/fixture.js'), moduleSource);

afterAll(() => fs.rmSync(root, {recursive: true, force: true}));

it("installs an importable theme without using the checkout's partial dist", async () => {
  expect(await installRealBaseThemes(cwd, ['fixture'])).toBe('');
  const installed = path.join(
    root,
    'app/node_modules/@astryxdesign/theme-fixture',
  );
  const built = await import(
    pathToFileURL(path.join(installed, 'dist/fixture.js')).href
  );
  expect(built.fixtureTheme).toEqual({name: 'fixture', icons: {}});
  expect(fs.readFileSync(path.join(installed, 'dist/theme.css'), 'utf8')).toBe(
    ':root {}\n',
  );
  expect(fs.existsSync(path.join(own, 'dist/icons.mjs'))).toBe(false);
  expect(fs.readFileSync(path.join(own, 'dist/fixture.js'), 'utf8')).toBe(
    moduleSource,
  );
});
