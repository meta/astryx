// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `doctor integration validate` warns about a folder under the themes
 * root that holds modules but is not read as a theme, and both branches of
 * its fix leave nothing to warn about.
 *
 * @input a local integration package with a themes root
 * @output the unread_theme_folder warnings validation reports
 * @position packages/cli/api/integration — validation regression tests
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {validateLocalIntegration} from './validate-integration.mjs';
import {integrationAddTheme} from './add-theme.mjs';
import {formatCliCommand} from '../../foundation/env/package-manager.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-unread-theme-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {Record<string, string>} files paths under themes/ */
function writeThemes(files) {
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(tmpDir, 'themes', file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, contents);
  }
}

const OCEAN = {
  'ocean/oceanTheme.doc.mjs':
    "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Blue.', maintained: true};\n",
  'ocean/oceanTheme.ts':
    "import {blue} from '@acme/kit/themes/shared/palette';\nexport const oceanTheme = {blue};\n",
  'shared/palette.ts': 'export const blue = 1;\n',
};

async function unread() {
  const {issues} = await validateLocalIntegration(tmpDir);
  return issues.filter(issue => issue.code === 'unread_theme_folder');
}

describe('unread theme folders', () => {
  it('warns about each folder that looks like a theme but is not read as one', async () => {
    writeThemes({
      ...OCEAN,
      'sand/sand.ts': 'export const sand = {};\n',
      'sand/sand.doc.ts': "export default {type: 'theme', name: 'sand'};\n",
      'reef/index.ts': 'export const reefTheme = {};\n',
      'Tide_Pool/index.ts': 'export const tide = {};\n',
      'fonts/inter.woff2': 'x',
      'utils/format.ts': 'export const format = String;\n',
      '.cache/index.ts': 'export {};\n',
    });
    const issues = await unread();
    expect(issues.map(issue => issue.severity)).toEqual([
      'warning',
      'warning',
      'warning',
    ]);
    expect(issues.map(issue => issue.message)).toEqual([
      'Folder "themes/Tide_Pool/" holds modules but no <name>Theme source or .doc.mjs descriptor, so Astryx does not read it as a theme. Fix: rename it to .Tide_Pool so Astryx skips it; a theme folder needs a lower-kebab name.',
      `Folder "themes/reef/" holds modules but no <name>Theme source or .doc.mjs descriptor, so Astryx does not read it as a theme. Fix: if it is a theme, add reefTheme.ts and reefTheme.doc.mjs to it (\`${formatCliCommand('integration add theme reef', tmpDir)}\` writes both) and move its code into reefTheme.ts; if not, rename it to .reef so Astryx skips it.`,
      `Folder "themes/sand/" holds modules but no <name>Theme source or .doc.mjs descriptor, so Astryx does not read it as a theme. Fix: if it is a theme, add sandTheme.ts and sandTheme.doc.mjs to it (\`${formatCliCommand('integration add theme sand', tmpDir)}\` writes both) and move its code into sandTheme.ts; if not, rename it to .sand so Astryx skips it.`,
    ]);
  });

  it('does not warn about a helper folder a module imports by a relative path', async () => {
    writeThemes({
      ...OCEAN,
      'index.ts':
        "export * from './ocean/oceanTheme';\nexport * from './util';\n",
      'util/index.ts': 'export const util = 1;\n',
    });
    expect(await unread()).toEqual([]);
  });

  it('holds when either branch of the fix is followed', async () => {
    writeThemes({
      ...OCEAN,
      'sand/sand.ts': 'export const sand = {};\n',
      'reef/index.ts': 'export const reefTheme = {};\n',
      'Tide_Pool/index.ts': 'export const tide = {};\n',
    });
    await integrationAddTheme('sand', {cwd: tmpDir});
    await integrationAddTheme('reef', {cwd: tmpDir});
    fs.renameSync(
      path.join(tmpDir, 'themes', 'Tide_Pool'),
      path.join(tmpDir, 'themes', '.Tide_Pool'),
    );
    const {issues} = await validateLocalIntegration(tmpDir);
    expect(issues).toEqual([]);
  });
});
