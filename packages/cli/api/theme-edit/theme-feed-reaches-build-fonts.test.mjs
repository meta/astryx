// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What the settings feed reaches the build, and fonts load as the
 * theme shows them: a source whose components replace the settings' is
 * refused by name, as one whose tokens do; italic text loads the installed
 * package's italic faces; the Linux and Android interface fonts are system
 * fonts of their platforms; a heading weight with no type scale is offered
 * the line that changes only that weight, never a scale that resizes all
 * text.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {fontPackageSheets} from './_preview.mjs';
import {openProject} from './_project.mjs';
import {oneSystemOf} from './_tables.mjs';
import {splitCommand} from './_vet.mjs';
import {fontShorthandStyle} from '../theme/build/font-warning.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;
const COMPILE = ['experimental', 'theme', 'compile'];

/** @type {string} */
let cwd;
/** @type {string} */
let dir;
/** @type {string} */
let fresh;
/** @type {string} */
let kept;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-feed-reaches-build-fonts-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  dir = path.join(cwd, 'themes/t');
  fresh = fs.readFileSync(path.join(dir, 't.theme.ts'), 'utf8');
  kept = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-theme-feed-reaches-build-fonts-kept-'),
  );
  fs.cpSync(dir, path.join(kept, 'themes'), {recursive: true});
  fs.cpSync(path.join(cwd, 'src/themes/t'), path.join(kept, 'src'), {
    recursive: true,
  });
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
  if (kept) fs.rmSync(kept, {recursive: true, force: true});
});

/** Put the theme source back as the editor wrote it, and build it. */
const restore = async () => {
  fs.writeFileSync(path.join(dir, 't.theme.ts'), fresh);
  await runCli([...COMPILE, 'themes/t/t.theme.ts'], cwd);
};

/** Put the theme back as new made it: its folder and its app copy. */
const reset = () => {
  for (const [from, to] of [
    ['themes', dir],
    ['src', path.join(cwd, 'src/themes/t')],
  ]) {
    fs.rmSync(to, {recursive: true, force: true});
    fs.cpSync(path.join(kept, from), to, {recursive: true});
  }
};

/** Write the theme source with these fields beside extends and name. @param {string} fields */
const source = fields =>
  fs.writeFileSync(
    path.join(dir, 't.theme.ts'),
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {tSettings} from './t.settings';\nexport const tTheme = defineTheme({extends: tSettings, name: 't', ${fields}});\n`,
  );

/** The saved settings. */
const saved = () =>
  JSON.parse(fs.readFileSync(path.join(dir, 't.settings.json'), 'utf8'))
    .settings;

describe("a source whose components replace the settings'", () => {
  it(
    'is refused by name, and nothing is saved',
    async () => {
      fs.writeFileSync(
        path.join(dir, 't.theme.ts'),
        "import {defineTheme} from '@astryxdesign/core/theme';\nimport {tSettings} from './t.settings';\nexport const tTheme = {...defineTheme({extends: tSettings, name: 't'}), components: {}};\n",
      );
      try {
        const e = await refusal(() =>
          themeEditSet('t', 'background-color', '#ff0000', {cwd, on: 'card'}),
        );
        expect(e.message).toMatch(
          /^t\.theme\.ts replaces the components of tSettings: \d+ of the \d+ components the settings set \(.*\) do not reach the theme it exports, so settings cannot take effect\. Give your own components inside defineTheme\(/,
        );
        expect(saved()).toEqual([]);
      } finally {
        await restore();
      }
    },
    T,
  );

  it(
    'a source that adds its own components inside defineTheme is taken',
    async () => {
      source("components: {card: {base: {borderWidth: '2px'}}}");
      try {
        await themeEditSet('t', 'background-color', '#ff0000', {
          cwd,
          on: 'card',
        });
        expect(fs.readFileSync(path.join(dir, 't.css'), 'utf8')).toContain(
          '#ff0000',
        );
      } finally {
        reset();
      }
    },
    T,
  );
});

describe('italic text', () => {
  it("a font shorthand's style is read", () => {
    expect(fontShorthandStyle('italic 400 14px Pacifico, cursive')).toBe(
      'italic',
    );
    expect(fontShorthandStyle('oblique bold 1rem Lora')).toBe('oblique');
    expect(fontShorthandStyle('400 14px Pacifico')).toBeNull();
    // A family named Italic is no style.
    expect(fontShorthandStyle('14px Italic Sans')).toBeNull();
  });

  it(
    "loads the installed package's italic face of each weight it shows",
    async () => {
      const pkg = path.join(cwd, 'node_modules/@fontsource/pacifico');
      fs.mkdirSync(pkg, {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({name: '@fontsource/pacifico', version: '5.0.0'}),
      );
      const face = (/** @type {string} */ style) =>
        `@font-face {\n  font-family: 'Pacifico';\n  font-style: ${style};\n  src: url(./f.woff2);\n}\n`;
      fs.writeFileSync(path.join(pkg, 'index.css'), face('normal'));
      fs.writeFileSync(path.join(pkg, '400.css'), face('normal'));
      fs.writeFileSync(path.join(pkg, '400-italic.css'), face('italic'));
      try {
        const project = await openProject(cwd);
        const ctx = /** @type {any} */ ({project});
        source(
          "components: {button: {base: {font: 'italic 400 14px Pacifico, cursive'}}}",
        );
        await runCli([...COMPILE, 'themes/t/t.theme.ts'], cwd);
        expect(fontPackageSheets(ctx, 't', '@fontsource/pacifico')).toEqual([
          '@fontsource/pacifico/400.css',
          '@fontsource/pacifico/400-italic.css',
        ]);
        expect(
          fs.readFileSync(path.join(cwd, 'src/themes/t/t.fonts.css'), 'utf8'),
        ).toContain('@fontsource/pacifico/400-italic.css');
        // Upright text loads no italic face.
        source(
          "components: {button: {base: {font: '400 14px Pacifico, cursive'}}}",
        );
        await runCli([...COMPILE, 'themes/t/t.theme.ts'], cwd);
        expect(fontPackageSheets(ctx, 't', '@fontsource/pacifico')).toEqual([
          '@fontsource/pacifico/400.css',
        ]);
      } finally {
        fs.rmSync(pkg, {recursive: true, force: true});
        await restore();
      }
    },
    T,
  );
});

describe('the Linux and Android interface fonts', () => {
  it('are system fonts of their platforms', () => {
    expect(oneSystemOf('Noto Sans')).toBe('Android, ChromeOS and Linux');
    expect(oneSystemOf('Cantarell')).toBe('Linux');
    expect(oneSystemOf('Ubuntu')).toBe('Linux');
  });

  it(
    'a system stack naming Noto Sans needs no package',
    async () => {
      try {
        const r = await themeEditSet(
          't',
          'font',
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
          {cwd},
        );
        const said = JSON.stringify(r.data);
        expect(said).not.toContain('is not a system font');
        expect(said).not.toContain('@fontsource/noto-sans');
      } finally {
        reset();
      }
    },
    T,
  );
});

describe('a heading weight with no type scale', () => {
  it(
    'is offered the headings line, which changes only the heading weight',
    async () => {
      const size = () =>
        /--_scaled-font-size-base: ([^;]*)/.exec(
          fs.readFileSync(path.join(dir, 't.css'), 'utf8'),
        )?.[1];
      const before = size();
      source("typography: {heading: {weight: '700'}}");
      try {
        const r = JSON.parse(
          (await runCli([...COMPILE, 'themes/t/t.theme.ts', '--json'], cwd))
            .stdout,
        );
        expect(r.error).toContain('a type scale would also resize all text');
        expect(r.error).not.toContain('add scale');
        const line = r.suggestions.find((/** @type {any} */ x) =>
          x.name.includes(' editor set t headings '),
        );
        expect(line.name).toMatch(/editor set t headings bold$/);
        expect(line.reason).toBe(
          'then this, once typography.heading.weight is taken out of themes/t/t.theme.ts',
        );
        await restore();
        const args = splitCommand(
          line.name.slice(line.name.indexOf('experimental ')),
        );
        expect((await runCli(/** @type {string[]} */ (args), cwd)).status).toBe(
          0,
        );
        expect(saved()).toContainEqual(
          expect.objectContaining({thing: 'headings', value: 'bold'}),
        );
        // The text sizes stay the base's own.
        expect(size()).toBe(before);
      } finally {
        reset();
      }
    },
    T,
  );

  it(
    'a weight number outside 1 to 1000 is never the example',
    async () => {
      source(
        'typography: {scale: {base: 16, ratio: 1.2}, heading: {weight: 1001 as any}}',
      );
      try {
        const r = JSON.parse(
          (await runCli([...COMPILE, 'themes/t/t.theme.ts', '--json'], cwd))
            .stdout,
        );
        expect(r.error).toContain("write '600'");
        expect(r.error).not.toContain("'1001'");
      } finally {
        await restore();
      }
    },
    T,
  );
});
