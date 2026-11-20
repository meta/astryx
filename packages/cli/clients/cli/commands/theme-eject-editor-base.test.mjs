// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The theme editor line after `theme eject` starts from the ejected theme
 * only when the editor can build on it (its own check: a built-in base,
 * installed), read from real eject results.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {editorBaseFor} from './theme.mjs';
import {themeEject} from '../../../api/theme/eject/eject.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-eject-editor-base-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['butter']);
  // A theme package of another publisher, as an integration ships one,
  // which the app lists.
  const app = JSON.parse(
    fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'),
  );
  app.dependencies = {...app.dependencies, '@acme/themes': '^1.0.0'};
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify(app, null, 2),
  );
  const pkg = path.join(cwd, 'node_modules', '@acme', 'themes');
  const theme = path.join(pkg, 'themes', 'ocean');
  fs.mkdirSync(theme, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name: '@acme/themes', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
  fs.writeFileSync(
    path.join(theme, 'oceanTheme.doc.mjs'),
    "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'An integration theme.', maintained: true};\n",
  );
  fs.writeFileSync(
    path.join(theme, 'oceanTheme.ts'),
    'export const oceanTheme = {};\n',
  );
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the theme editor line after theme eject', () => {
  it('starts from an ejected built-in theme the editor can build on', async ctx => {
    if (unbuilt) return ctx.skip();
    const result = await themeEject('butter', {cwd});
    // Bundled themes report the CLI as their package; the editor's own check
    // decides.
    expect(await editorBaseFor(result.data, cwd)).toBe('butter');
  }, 120_000);

  it('starts from neutral for a theme of another package', async () => {
    const result = await themeEject('ocean', {cwd, package: '@acme/themes'});
    expect(await editorBaseFor(result.data, cwd)).toBe('neutral');
  }, 120_000);

  it('starts from neutral for a built-in theme that is not installed', async () => {
    expect(await editorBaseFor({slug: 'y2k'}, cwd)).toBe('neutral');
  });
});
