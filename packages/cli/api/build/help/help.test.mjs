// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The playbook's theme rule names the exact wiring: the import and the
 * value `<Theme>` takes, for the project's generated module, its installed
 * theme, or the starter theme. An open value gets guessed as a theme name,
 * which crashes on hydrate.
 */

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {buildHelp, themeRule} from './help.mjs';
import {STARTER_THEME} from '../../../foundation/discovery/theme-discovery.mjs';

const THEME_IMPORT = "import {Theme} from '@astryxdesign/core/theme'";
const VALUE = '<Theme theme={themes[defaultThemeSlug]}';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

describe('build playbook theme rule', () => {
  it('wires the generated module by its path, with the value to pass', () => {
    const rule = themeRule({
      state: 'wired',
      modulePath: 'src/astryx-themes.ts',
      hasModes: false,
    });
    expect(rule).toContain(`${VALUE}>`);
    expect(rule).toContain(THEME_IMPORT);
    expect(rule).toContain(
      '{themes, defaultThemeSlug} from the generated src/astryx-themes.ts',
    );
    expect(rule).toContain('never a name');
  });

  it("passes the module's mode when it records one", () => {
    const rule = themeRule({
      state: 'wired',
      modulePath: 'src/astryx-themes.ts',
      hasModes: true,
    });
    expect(rule).toContain(
      `${VALUE} mode={themeModes[defaultThemeSlug] ?? 'system'}>`,
    );
    expect(rule).toContain('{themes, defaultThemeSlug, themeModes}');
  });

  it('adds an installed theme before wiring it', () => {
    const rule = themeRule({state: 'installed', slug: 'stone'});
    expect(rule).toMatch(/^Run `theme add stone` /);
    expect(rule).toContain(`${VALUE}>`);
    expect(rule).toContain(THEME_IMPORT);
  });

  it('names the starter theme in a project with no theme', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-help-'));
    dirs.push(dir);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'app', version: '1.0.0'}),
    );
    const {data} = await buildHelp({cwd: dir});
    const rule = data.rules.find(r => r.includes('<Theme'));
    expect(rule).toBe(
      themeRule({
        state: 'none',
        slug: STARTER_THEME.slug,
        package: STARTER_THEME.package,
      }),
    );
    expect(rule).toMatch(
      new RegExp(
        `^Install ${STARTER_THEME.package} and run \`theme add ${STARTER_THEME.slug}\`, `,
      ),
    );
    expect(rule).toContain(`${VALUE}>`);
    expect(rule).toContain(THEME_IMPORT);
  });
});
