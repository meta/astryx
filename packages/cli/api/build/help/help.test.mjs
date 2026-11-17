// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The playbook's theme rule names the exact wiring: the import and the
 * value `<Theme>` takes (or the provider an installed package names), for
 * the project's generated module, its installed theme, or the starter theme.
 * A project with no theme added gets a step whose command adds one. An open
 * value gets guessed as a theme name, which crashes on hydrate.
 */

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {buildHelp, themeRule, themeStep} from './help.mjs';
import {themeAdd} from '../../theme/add/add.mjs';
import {providerLine} from '../../theme/_app-provider.mjs';
import {STARTER_THEME} from '../../../foundation/discovery/theme-discovery.mjs';
import {CLI_VERSION} from '../../../test-utils/release-fixtures.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

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
    const wiring = {
      state: /** @type {const} */ ('wired'),
      modulePath: 'src/astryx-themes.ts',
      hasModes: false,
      provider: null,
    };
    const rule = themeRule(wiring);
    expect(rule).toContain(`${VALUE}>`);
    expect(rule).toContain(THEME_IMPORT);
    expect(rule).toContain(
      '{themes, defaultThemeSlug} from the generated src/astryx-themes.ts',
    );
    expect(rule).toContain('never a name');
    expect(themeStep(wiring)).toBeNull();
  });

  it("passes the module's mode when it records one", () => {
    const rule = themeRule({
      state: 'wired',
      modulePath: 'src/astryx-themes.ts',
      hasModes: true,
      provider: null,
    });
    expect(rule).toContain(
      `${VALUE} mode={themeModes[defaultThemeSlug] ?? 'system'}>`,
    );
    expect(rule).toContain('{themes, defaultThemeSlug, themeModes}');
  });

  it('prints the provider line the theme add receipt builds, and imports themeModes only when it passes a mode', () => {
    const brand = {
      export: 'BrandProvider',
      from: '@acme/brand',
      themeProp: 'theme',
      modeProp: 'colorMode',
    };
    const line = providerLine(brand, true);
    expect(line).toBe(
      '<BrandProvider theme={themes[defaultThemeSlug]} colorMode={themeModes[defaultThemeSlug]}>',
    );
    const rule = themeRule({
      state: 'wired',
      modulePath: 'src/astryx-themes.ts',
      hasModes: true,
      provider: {export: brand.export, from: brand.from, line},
    });
    expect(rule).toContain(line);
    expect(rule).toContain("import {BrandProvider} from '@acme/brand'");
    expect(rule).toContain('{themes, defaultThemeSlug, themeModes}');
    expect(rule).not.toContain('<Theme ');

    const noMode = providerLine({...brand, modeProp: undefined}, true);
    const plain = themeRule({
      state: 'wired',
      modulePath: 'src/astryx-themes.ts',
      hasModes: true,
      provider: {export: brand.export, from: brand.from, line: noMode},
    });
    expect(plain).toContain('<BrandProvider theme={themes[defaultThemeSlug]}>');
    expect(plain).toContain('{themes, defaultThemeSlug} from');
  });

  it('adds an installed theme with a command step before wiring it', () => {
    const wiring = {
      state: /** @type {const} */ ('installed'),
      slug: 'stone',
      hasModes: false,
      provider: null,
    };
    expect(themeStep(wiring)?.commands).toEqual([
      {
        command: 'theme add stone',
        purpose:
          'write the astryx-themes module the app root takes its theme from',
      },
    ]);
    const rule = themeRule(wiring);
    expect(rule).toContain(`${VALUE}>`);
    expect(rule).toContain(THEME_IMPORT);
    expect(rule).not.toMatch(/theme add/);
  });

  it("passes an installed theme's one color mode before it is added, as theme add will", () => {
    const rule = themeRule({
      state: 'installed',
      slug: 'midnight',
      hasModes: true,
      provider: null,
    });
    expect(rule).toContain(
      `${VALUE} mode={themeModes[defaultThemeSlug] ?? 'system'}>`,
    );
    expect(rule).toContain('{themes, defaultThemeSlug, themeModes}');
  });

  it('names the starter theme in a project with no theme', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-help-'));
    dirs.push(dir);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'app', version: '1.0.0'}),
    );
    const {data} = await buildHelp({cwd: dir});
    const wiring = {
      state: /** @type {const} */ ('none'),
      slug: STARTER_THEME.slug,
      package: STARTER_THEME.package,
      provider: null,
    };
    expect(data.rules).toContain(themeRule(wiring));
    expect(data.steps.at(-1)).toEqual(themeStep(wiring));
    expect(data.steps.at(-1)?.title).toContain(STARTER_THEME.package);
    expect(data.steps.at(-1)?.commands[0].command).toBe(
      `theme add ${STARTER_THEME.slug}`,
    );
  });

  it.each([
    ['with', 'colorMode'],
    ['without', undefined],
  ])(
    'names the provider an installed integration declares %s a mode prop, the same before and after theme add',
    async (_label, modeProp) => {
      const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-build-help-'));
      dirs.push(dir);
      /** @param {string} rel @param {string} text */
      const write = (rel, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
        fs.writeFileSync(path.join(dir, rel), text);
      };
      write(
        'package.json',
        JSON.stringify({
          name: 'provider-app',
          private: true,
          dependencies: {
            '@acme/ui': '1.0.0',
            '@astryxdesign/core': CLI_VERSION,
          },
        }),
      );
      write(
        'node_modules/@astryxdesign/core/package.json',
        JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
      );
      write(
        'node_modules/@acme/ui/package.json',
        JSON.stringify({
          name: '@acme/ui',
          version: '1.0.0',
          type: 'module',
          exports: {
            './theme': './dist/theme.js',
            './themes/brand': './dist/brand.js',
            './themes/brand.css': './dist/brand.css',
          },
        }),
      );
      write(
        'node_modules/@acme/ui/astryx.integration.mjs',
        `export default {themes: './themes', themeProvider: ${JSON.stringify({
          export: 'AcmeThemeProvider',
          from: '@acme/ui/theme',
          themeProp: 'theme',
          ...(modeProp ? {modeProp} : {}),
        })}};\n`,
      );
      write(
        'node_modules/@acme/ui/themes/brand/brandTheme.doc.mjs',
        "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'brand', displayName: 'brand', description: 'brand theme.', maintained: true};\n",
      );
      write(
        'node_modules/@acme/ui/themes/brand/brandTheme.ts',
        "export const brandTheme = {name: 'brand', tokens: {}};\n",
      );
      write(
        'node_modules/@acme/ui/dist/brand.js',
        "export const brandTheme = {name: 'brand', tokens: {}};\nexport const colorModes = ['dark'];\n",
      );
      write('node_modules/@acme/ui/dist/brand.css', '');
      write(
        'node_modules/@acme/ui/dist/theme.js',
        'export function AcmeThemeProvider({children}) { return children; }\n',
      );

      const before = await buildHelp({cwd: dir});
      const rule = before.data.rules.find(r => r.includes('AcmeThemeProvider'));
      const line = modeProp
        ? `<AcmeThemeProvider theme={themes[defaultThemeSlug]} ${modeProp}={themeModes[defaultThemeSlug]}>`
        : '<AcmeThemeProvider theme={themes[defaultThemeSlug]}>';
      expect(rule).toContain(line);
      expect(rule).toContain(
        "import {AcmeThemeProvider} from '@acme/ui/theme'",
      );
      // The module's names it imports are the ones the line uses.
      expect(rule).toContain(
        modeProp
          ? '{themes, defaultThemeSlug, themeModes}'
          : '{themes, defaultThemeSlug} from',
      );
      expect(rule).not.toContain('<Theme ');
      expect(before.data.steps.at(-1)?.commands[0].command).toBe(
        'theme add brand',
      );

      // The wiring theme add then prints is the wiring the playbook named.
      const added = await themeAdd('brand', {cwd: dir, package: '@acme/ui'});
      expect(added.data.appProvider?.line).toBe(line);
      const after = await buildHelp({cwd: dir});
      expect(after.data.rules).toContain(
        /** @type {string} */ (rule).replace(
          'the astryx-themes module the theme step writes',
          `the generated ${added.data.modulePath}`,
        ),
      );
      expect(after.data.steps.at(-1)?.commands[0].command).not.toMatch(
        /^theme add/,
      );
    },
  );
});
