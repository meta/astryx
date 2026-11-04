// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression coverage for icon registry preservation in theme builds.
 * @input Real themeBuild calls, imported React icon registries, and source or
 *   built themes supplied to defineTheme's extends option.
 * @output Checks generated ESM with Node's native loader, retained React
 *   elements, inherited paths and precedence, TypeScript binding provenance,
 *   and rejection before output writes.
 * @position Direct API regression suite for the icon import bug in #5058.
 *   The node project's global setup supplies the compiled core package.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeBuild} from './build.mjs';

let tmpDir;
beforeEach(() => {
  // Keeping fixtures under the CLI package makes real core/React imports
  // resolve in both the theme loader and the native Node artifact check.
  tmpDir = fs.mkdtempSync(
    path.resolve(import.meta.dirname, '../../..', '.tmp-icon-preservation-'),
  );
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

function write(file, source) {
  fs.writeFileSync(path.join(tmpDir, file), source);
}

function writeRegistry(file, exportName, icons) {
  write(
    file,
    `import {createElement} from 'react';
const registry = {
${Object.entries(icons)
  .map(
    ([key, label]) =>
      `  ${JSON.stringify(key)}: createElement('svg', {'data-icon': ${JSON.stringify(label)}}, createElement('path', {d: 'M0 0h1'})),`,
  )
  .join('\n')}
};
${exportName === 'default' ? 'export default registry;' : `export {registry as ${exportName}};`}
`,
  );
}

/**
 * Load the artifact with native Node, without jiti/Vite resolving nonexistent
 * imports or transforming its syntax. Valid React elements prove symbols and
 * element contents survived, which JSON-only registry assertions cannot do.
 */
function readBuiltIcons(name, registryExport) {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import assert from 'node:assert/strict';
import {isValidElement} from 'react';
const mod = await import(${JSON.stringify(`./${name}.js`)});
const theme = Object.values(mod).find(value => value?.name === ${JSON.stringify(name)});
assert.ok(theme?.icons, 'generated theme must retain its icons');
${registryExport ? `assert.equal(mod[${JSON.stringify(registryExport)}], theme.icons, 'registry re-export must match the theme');` : ''}
const icons = Object.fromEntries(Object.entries(theme.icons).map(([key, icon]) => {
  assert.ok(isValidElement(icon), key + ' must remain a React element');
  assert.equal(icon.type, 'svg');
  assert.ok(isValidElement(icon.props.children));
  assert.equal(icon.props.children.props.d, 'M0 0h1');
  return [key, icon.props['data-icon']];
}));
process.stdout.write(JSON.stringify(icons));`,
    ],
    {cwd: tmpDir, encoding: 'utf8', timeout: 10000},
  );
  return JSON.parse(output);
}

async function buildAndCheck(file) {
  const built = await themeBuild(file, {}, {cwd: tmpDir});
  expect(built?.type).toBe('theme.build');
  const checked = await themeBuild(file, {check: true}, {cwd: tmpDir});
  expect(checked?.type).toBe('theme.build.check');
  expect(checked?.data.upToDate).toBe(true);
  expect(checked?.data.stale).toEqual([]);
}

describe('themeBuild() — actual icon imports', () => {
  it.each([
    ['named', 'liveIcons', "import {liveIcons} from './icons.mjs';"],
    ['default', 'default', "import liveIcons from './icons.mjs';"],
    [
      'aliased named',
      'originalIcons',
      "import {originalIcons as liveIcons} from './icons.mjs';",
    ],
  ])(
    'preserves a %s registry import and its re-export',
    async (_label, exportName, statement) => {
      writeRegistry('icons.mjs', exportName, {close: 'close'});
      write(
        'live.mjs',
        `${statement}
export default {name: 'live', tokens: {'--color-bg': '#fff'}, icons: liveIcons};
`,
      );

      await buildAndCheck('live.mjs');

      expect(readBuiltIcons('live', 'liveIcons')).toEqual({close: 'close'});
      if (exportName === 'liveIcons') {
        const generated = fs.readFileSync(path.join(tmpDir, 'live.js'), 'utf8');
        expect(generated).toContain("import { liveIcons } from './icons.mjs';");
        expect(generated).toContain('icons: liveIcons,');
        expect(generated).toContain('export { liveIcons };');
      }
    },
  );

  it('preserves a namespace used directly as the icon registry', async () => {
    write(
      'icons.mjs',
      `import {createElement} from 'react';
export const close = createElement('svg', {'data-icon': 'close'}, createElement('path', {d: 'M0 0h1'}));
`,
    );
    write(
      'live.mjs',
      `import * as liveIcons from './icons.mjs';
export default {name: 'live', tokens: {'--color-bg': '#fff'}, icons: liveIcons};
`,
    );

    await buildAndCheck('live.mjs');

    expect(readBuiltIcons('live', 'liveIcons')).toEqual({close: 'close'});
  });

  it('uses the selected export instead of an unrelated earlier icons field', async () => {
    writeRegistry('icons.mjs', 'liveIcons', {close: 'selected'});
    write(
      'selected.mjs',
      `import {liveIcons} from './icons.mjs';
const inlineIcons = {close: 'unrelated'};
const metadata = {icons: inlineIcons};
export const otherTheme = {name: 'other', tokens: {}, icons: inlineIcons};
export default {name: 'selected', tokens: {'--color-bg': '#fff'}, icons: liveIcons};
`,
    );

    await buildAndCheck('selected.mjs');

    expect(readBuiltIcons('selected', 'liveIcons')).toEqual({
      close: 'selected',
    });
    expect(fs.existsSync(path.join(tmpDir, 'other.js'))).toBe(false);
  });

  it('rejects the selected inline registry even when another theme imports icons', async () => {
    writeRegistry('icons.mjs', 'liveIcons', {close: 'unselected'});
    write(
      'selected.mjs',
      `import {liveIcons} from './icons.mjs';
export const otherTheme = {name: 'other', tokens: {}, icons: liveIcons};
const inlineIcons = {close: 'selected'};
export default {name: 'selected', tokens: {'--color-bg': '#fff'}, icons: inlineIcons};
`,
    );

    await expect(
      themeBuild('selected.mjs', {}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
    expect(fs.readdirSync(tmpDir).sort()).toEqual([
      'icons.mjs',
      'selected.mjs',
    ]);
  });

  it('unwraps TypeScript assertions around an aliased defineTheme call', async () => {
    writeRegistry('icons.mjs', 'liveIcons', {close: 'wrapped-close'});
    write(
      'wrapped.ts',
      `import {defineTheme as createTheme} from '@astryxdesign/core/theme';
import {liveIcons} from './icons.mjs';
export default createTheme(({
  name: 'wrapped', tokens: {'--color-bg': '#fff'}, icons: liveIcons,
} as const) satisfies Parameters<typeof createTheme>[0]);
`,
    );

    await buildAndCheck('wrapped.ts');

    expect(readBuiltIcons('wrapped', 'liveIcons')).toEqual({
      close: 'wrapped-close',
    });
  });

  it('ignores an icons field mentioned only in a string', async () => {
    write(
      'plain.mjs',
      `const note = 'icons: retired';
export default {name: 'plain', tokens: {'--color-bg': '#fff'}};
`,
    );

    await buildAndCheck('plain.mjs');

    const generated = fs.readFileSync(path.join(tmpDir, 'plain.js'), 'utf8');
    expect(generated).not.toMatch(/^import /m);
    expect(generated).not.toContain('icons:');
  });

  it('avoids collisions between the icon binding and the generated theme export', async () => {
    writeRegistry('icons.mjs', 'collisionTheme', {close: 'collision-close'});
    write(
      'collision.mjs',
      `import {collisionTheme} from './icons.mjs';
export default {name: 'collision', tokens: {'--color-bg': '#fff'}, icons: collisionTheme};
`,
    );

    await buildAndCheck('collision.mjs');

    expect(readBuiltIcons('collision')).toEqual({close: 'collision-close'});
  });

  it('does not treat a type-only import as a runtime icon binding', async () => {
    writeRegistry('icons.mjs', 'inlineIcons', {close: 'type-only'});
    write(
      'inline.ts',
      `import type {inlineIcons} from './icons.mjs';
const inlineIcons = {close: 'inline'};
export default {name: 'inline', tokens: {'--color-bg': '#fff'}, icons: inlineIcons};
`,
    );

    for (const check of [false, true]) {
      await expect(
        themeBuild('inline.ts', {check}, {cwd: tmpDir}),
      ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
    }
    expect(fs.readdirSync(tmpDir).sort()).toEqual(['icons.mjs', 'inline.ts']);
  });

  it.each([
    ['an empty object', '{}'],
    ['only empty spreads', '{...null, ...undefined}'],
  ])(
    'builds a root theme whose registry is %s without an icon import or field',
    async (_label, registry) => {
      write(
        'empty.mjs',
        `import {defineTheme} from '@astryxdesign/core/theme';
export default defineTheme({
  name: 'empty', tokens: {'--color-bg': '#fff'}, icons: ${registry},
});
`,
      );

      const fresh = await themeBuild('empty.mjs', {check: true}, {cwd: tmpDir});
      expect(fresh?.data.upToDate).toBe(false);
      await buildAndCheck('empty.mjs');

      const generated = fs.readFileSync(path.join(tmpDir, 'empty.js'), 'utf8');
      expect(generated).not.toMatch(/^import /m);
      expect(generated).not.toContain('icons');
      expect(
        fs.readFileSync(path.join(tmpDir, 'empty.d.ts'), 'utf8'),
      ).not.toContain('IconRegistry');
    },
  );
});

describe.each([false, true])('fake icon imports (check: %s)', check => {
  it.each([
    [
      'string',
      `const note = "import { inlineIcons } from './ghost-icons.mjs'";`,
    ],
    [
      'template',
      "const note = `import { inlineIcons } from './ghost-icons.mjs'`;",
    ],
    [
      'regular expression',
      "const note = /import { inlineIcons } from 'ghost-icons.mjs'/;",
    ],
  ])(
    'rejects an import inside a %s before creating or replacing outputs',
    async (_label, decoy) => {
      write(
        'inline.mjs',
        `${decoy}
const inlineIcons = {close: 'inline'};
export default {name: 'inline', tokens: {'--color-bg': '#fff'}, icons: inlineIcons};
`,
      );
      const originalFiles = fs.readdirSync(tmpDir);
      await expect(
        themeBuild(
          'inline.mjs',
          {check, out: 'dist/inline.css'},
          {cwd: tmpDir},
        ),
      ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
      expect(fs.readdirSync(tmpDir)).toEqual(originalFiles);

      fs.mkdirSync(path.join(tmpDir, 'dist'));
      const outputs = ['inline.css', 'inline.js', 'inline.d.ts'];
      for (const file of outputs) write(`dist/${file}`, `previous ${file}\n`);
      await expect(
        themeBuild(
          'inline.mjs',
          {check, out: 'dist/inline.css'},
          {cwd: tmpDir},
        ),
      ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
      expect(fs.readdirSync(path.join(tmpDir, 'dist')).sort()).toEqual(
        outputs.sort(),
      );
      for (const file of outputs) {
        expect(fs.readFileSync(path.join(tmpDir, 'dist', file), 'utf8')).toBe(
          `previous ${file}\n`,
        );
      }
    },
  );
});

describe.each(['source', 'built'])(
  'icons inherited from an imported %s base',
  baseKind => {
    async function writeBase() {
      writeRegistry('base-icons.mjs', 'baseIcons', {
        close: 'base-close',
        check: 'base-check',
      });
      write(
        'base.mjs',
        `import {defineTheme} from '@astryxdesign/core/theme';
import {baseIcons} from './base-icons.mjs';
export const baseTheme = defineTheme({
  name: 'base', tokens: {'--color-bg': '#fff'}, icons: baseIcons,
});
`,
      );
      if (baseKind === 'built') await buildAndCheck('base.mjs');
      return `./base.${baseKind === 'built' ? 'js' : 'mjs'}`;
    }

    it('retains all base icons when the child has no local registry', async () => {
      const baseSpecifier = await writeBase();
      write(
        'child.mjs',
        `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '${baseSpecifier}';
export default defineTheme({name: 'child', extends: baseTheme, tokens: {}});
`,
      );

      await buildAndCheck('child.mjs');

      expect(readBuiltIcons('child')).toEqual({
        close: 'base-close',
        check: 'base-check',
      });
    });

    it('keeps all base icons when the child sets an empty registry', async () => {
      const baseSpecifier = await writeBase();
      write(
        'child.mjs',
        `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '${baseSpecifier}';
export default defineTheme({
  name: 'child', extends: baseTheme, tokens: {}, icons: {},
});
`,
      );

      const fresh = await themeBuild('child.mjs', {check: true}, {cwd: tmpDir});
      expect(fresh?.data.upToDate).toBe(false);
      await buildAndCheck('child.mjs');

      expect(readBuiltIcons('child')).toEqual({
        close: 'base-close',
        check: 'base-check',
      });
    });

    it('merges imported child icons over the base without dropping untouched keys', async () => {
      const baseSpecifier = await writeBase();
      writeRegistry('child-icons.mjs', 'childIcons', {
        close: 'child-close',
        add: 'child-add',
      });
      write(
        'child.mjs',
        `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '${baseSpecifier}';
import {childIcons} from './child-icons.mjs';
export default defineTheme({
  name: 'child', extends: baseTheme, tokens: {}, icons: childIcons,
});
`,
      );

      await buildAndCheck('child.mjs');

      expect(readBuiltIcons('child')).toEqual({
        close: 'child-close',
        check: 'base-check',
        add: 'child-add',
      });
    });
  },
);

describe('themeBuild() — inherited icon module resolution', () => {
  it.each(['named', 'namespace'])(
    'redirects only the child registry when %s imports share a module',
    async importKind => {
      writeRegistry('base-icons.mjs', 'baseIcons', {
        close: 'base-close',
        check: 'base-check',
      });
      writeRegistry('child-icons.mjs', 'childIcons', {
        close: 'child-close',
        add: 'child-add',
      });
      write(
        'icons.mjs',
        `export {baseIcons} from './base-icons.mjs';
export {childIcons} from './child-icons.mjs';
`,
      );
      // The emitted child sidecar deliberately has no baseIcons export.
      writeRegistry('built-icons.mjs', 'childIcons', {
        close: 'child-close',
        add: 'child-add',
      });
      write(
        'child.mjs',
        `import {defineTheme} from '@astryxdesign/core/theme';
${importKind === 'named' ? "import {baseIcons, childIcons} from './icons.mjs';" : "import * as registries from './icons.mjs';"}
const baseTheme = defineTheme({
  name: 'base', tokens: {'--color-bg': '#fff'}, icons: ${importKind === 'named' ? 'baseIcons' : 'registries.baseIcons'},
});
export default defineTheme({
  name: 'child', extends: baseTheme, tokens: {}, icons: ${importKind === 'named' ? 'childIcons' : 'registries.childIcons'},
});
`,
      );

      const options = {iconsSpecifier: './built-icons.mjs'};
      const built = await themeBuild('child.mjs', options, {cwd: tmpDir});
      expect(built?.type).toBe('theme.build');
      const checked = await themeBuild(
        'child.mjs',
        {...options, check: true},
        {cwd: tmpDir},
      );
      expect(checked?.data.upToDate).toBe(true);
      expect(readBuiltIcons('child')).toEqual({
        close: 'child-close',
        check: 'base-check',
        add: 'child-add',
      });
    },
  );

  it('rebases a source base registry from its subdirectory to the child output', async () => {
    fs.mkdirSync(path.join(tmpDir, 'brand'));
    writeRegistry('brand/icons.mjs', 'brandIcons', {close: 'brand-close'});
    write(
      'brand/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {brandIcons} from './icons.mjs';
export const brandTheme = defineTheme({
  name: 'brand', tokens: {'--color-bg': '#fff'}, icons: brandIcons,
});
`,
    );
    write(
      'child.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {brandTheme} from './brand/source.mjs';
export default defineTheme({name: 'child', extends: brandTheme, tokens: {}});
`,
    );

    await buildAndCheck('child.mjs');

    expect(readBuiltIcons('child')).toEqual({close: 'brand-close'});
  });

  it('resolves an extensionless TypeScript base before its generated JS sibling', async () => {
    writeRegistry('icons.mjs', 'brandIcons', {close: 'source-close'});
    write(
      'base.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {brandIcons} from './icons.mjs';
export const brandTheme = defineTheme({
  name: 'base', tokens: {'--color-bg': '#fff'}, icons: brandIcons,
});
`,
    );
    // The generated sibling exports baseTheme, while the source's public
    // export is brandTheme. Selecting base.js would erase the child base.
    await buildAndCheck('base.ts');
    write(
      'child.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {brandTheme} from './base';
export default defineTheme({name: 'child', extends: brandTheme, tokens: {}});
`,
    );

    await buildAndCheck('child.ts');

    expect(readBuiltIcons('child')).toEqual({close: 'source-close'});
  });
});

describe.each([false, true])(
  'unsupported icon provenance (check: %s)',
  check => {
    it('fails to load a missing registry import instead of dropping its icons', async () => {
      write(
        'missing.mjs',
        `import {defineTheme} from '@astryxdesign/core/theme';
import {missingIcons} from './missing-icons.mjs';
export default defineTheme({
  name: 'missing', tokens: {'--color-bg': '#fff'}, icons: missingIcons,
});
`,
      );

      await expect(
        themeBuild(
          'missing.mjs',
          {check, out: 'dist/missing.css'},
          {cwd: tmpDir},
        ),
      ).rejects.toMatchObject({code: 'ERR_THEME_LOAD'});
      expect(fs.readdirSync(tmpDir)).toEqual(['missing.mjs']);
    });

    it('rejects a registry mutated through a destructured theme alias before writing', async () => {
      writeRegistry('icons.mjs', 'importedIcons', {
        close: 'original-close',
        check: 'retained-check',
      });
      write(
        'mutated.mjs',
        `import {importedIcons} from './icons.mjs';
const config = {
  name: 'mutated', tokens: {'--color-bg': '#fff'}, icons: importedIcons,
};
const {icons} = config;
delete icons.close;
export default config;
`,
      );

      await expect(
        themeBuild(
          'mutated.mjs',
          {check, out: 'dist/mutated.css'},
          {cwd: tmpDir},
        ),
      ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
      expect(fs.readdirSync(tmpDir).sort()).toEqual([
        'icons.mjs',
        'mutated.mjs',
      ]);
    });

    it.each([
      [
        'a defineTheme argument',
        `import {defineTheme} from '@astryxdesign/core/theme';
import {config} from '@fixture/raw-theme';
export default defineTheme(config);
`,
      ],
      [
        'the selected re-export',
        `export {config as default} from '@fixture/raw-theme';
`,
      ],
    ])(
      'rejects an opaque package raw config used as %s before writing',
      async (_label, source) => {
        const packageDirectory = 'node_modules/@fixture/raw-theme';
        fs.mkdirSync(path.join(tmpDir, packageDirectory), {recursive: true});
        write(
          `${packageDirectory}/package.json`,
          JSON.stringify({
            name: '@fixture/raw-theme',
            type: 'module',
            exports: './index.mjs',
          }),
        );
        writeRegistry(`${packageDirectory}/icons.mjs`, 'baseIcons', {
          close: 'inherited-close',
        });
        write(
          `${packageDirectory}/index.mjs`,
          `import {defineTheme} from '@astryxdesign/core/theme';
import {baseIcons} from './icons.mjs';
const baseTheme = defineTheme({
  name: 'package-base', tokens: {'--color-bg': '#fff'}, icons: baseIcons,
});
export const config = {name: 'raw-package', extends: baseTheme, tokens: {}};
`,
        );
        write('package-config.mjs', source);

        await expect(
          themeBuild(
            'package-config.mjs',
            {check, out: 'dist/raw-package.css'},
            {cwd: tmpDir},
          ),
        ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
        expect(fs.readdirSync(tmpDir).sort()).toEqual([
          'node_modules',
          'package-config.mjs',
        ]);
      },
    );
  },
);
