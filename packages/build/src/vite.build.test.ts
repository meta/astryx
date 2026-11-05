// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Runs REAL Vite production builds of fixture apps and asserts on the
 * stylesheets they emit.
 *
 * The unit tests in vite.test.ts check the plugin's wiring, and they passed
 * while the build shipped a version that wrapped every StyleX rule — Astryx's
 * and the app's alike — in the library layer. That inverts the bug rather than
 * fixing it: product styles are supposed to outrank a theme, and wrapped in
 * `astryx-base` they lose to one. Only the built artifact shows it, so this
 * builds one.
 *
 * Three shapes, because StyleX emits through two different paths and merges
 * all entries into one stylesheet:
 *
 *   `layer-split`           the app imports a stylesheet, so the bundle has a
 *                           CSS asset and StyleX appends in `generateBundle`
 *   `layer-split-nocss`     the app imports none, so StyleX writes its own file
 *                           in `writeBundle`, outside Rollup's graph
 *   `layer-split-multipage` two entries own distinct authored CSS, while both
 *                           must load the one shared StyleX result
 *
 * The no-CSS shape was originally missing, which hid two defects: the split did
 * not run there at all, and the file StyleX writes was not linked by any page.
 * The multi-page shape protects against linking StyleX from only one entry or
 * cross-loading that entry's authored CSS into every page.
 *
 * What none of this can prove is which declaration actually paints — that is a
 * cascade fact, and it lives in .github/scripts/theme-layer-cascade.js.
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {build, createLogger} from 'vite';
import react from '@vitejs/plugin-react';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {astryxStylex} from './vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FIXTURES = path.resolve(__dirname, '../__fixtures__');
const CORE_SRC = path.join(REPO_ROOT, 'packages/core/src');
const CORE_PACKAGE = path.join(REPO_ROOT, 'packages/core');

/** The class prefixes @astryxdesign/build/babel assigns per origin. */
const LIBRARY_CLASS = /\.astryx[a-z0-9]{5,}/g;
const PRODUCT_CLASS = /\.x[a-z0-9]{5,}/g;

type Built = {
  css: string;
  cssName: string;
  cssByName: Record<string, string>;
  html: string;
  htmlByName: Record<string, string>;
  outDir: string;
};

async function buildFixture(
  name: string,
  htmlNames: string[] = ['index.html'],
  {
    libraryPattern = 'packages/core/',
    zeroConfig = false,
    stylexOverrides,
    warnings = [],
  }: {
    /** Which source paths land in the library layer. */
    libraryPattern?: string;
    /** Use `astryxStylex({...})` instead of the legacy `{stylexOptions}` form. */
    zeroConfig?: boolean;
    /** Zero-config form only: `stylexOverrides`. */
    stylexOverrides?: Record<string, unknown>;
    /** Receives every warning the build logs. */
    warnings?: string[];
  } = {},
): Promise<Built> {
  const root = path.join(FIXTURES, name);
  const outDir = mkdtempSync(path.join(tmpdir(), `astryx-${name}-`));
  try {
    await build({
      root,
      logLevel: 'error',
      customLogger: {
        ...createLogger('error'),
        warn: (message: string) => void warnings.push(message),
        warnOnce: (message: string) => void warnings.push(message),
      },
      build: {
        outDir,
        emptyOutDir: true,
        ...(htmlNames.length > 1 && {
          rollupOptions: {
            input: Object.fromEntries(
              htmlNames.map(file => [
                path.basename(file, '.html'),
                path.join(root, file),
              ]),
            ),
          },
        }),
      },
      resolve: {alias: {'@astryxdesign/core': CORE_SRC}},
      plugins: [
        react(),
        ...(zeroConfig
          ? astryxStylex({
              dev: false,
              rootDir: REPO_ROOT,
              libraryPattern,
              stylexOverrides,
            })
          : astryxStylex({
              stylexOptions: {
                dev: false,
                unstable_moduleResolution: {
                  type: 'commonJS',
                  rootDir: REPO_ROOT,
                },
                aliases: {
                  '@astryxdesign/core/*': [path.join(CORE_SRC, '*')],
                  '@astryxdesign/core': [CORE_SRC],
                },
              },
              libraryPattern,
            })),
      ],
    });
  } catch (error) {
    rmSync(outDir, {recursive: true, force: true});
    throw error;
  }

  const assets = path.join(outDir, 'assets');
  const cssNames = readdirSync(assets).filter(f => f.endsWith('.css'));
  const cssByName = Object.fromEntries(
    cssNames.map(file => [
      file,
      readFileSync(path.join(assets, file), 'utf-8'),
    ]),
  );
  const cssName = cssNames.find(f => f.startsWith('astryx-stylex-'));
  if (!cssName)
    throw new Error(`no shared StyleX stylesheet emitted into ${assets}`);
  const htmlByName = Object.fromEntries(
    htmlNames.map(file => [
      file,
      readFileSync(path.join(outDir, file), 'utf-8'),
    ]),
  );
  return {
    css: cssByName[cssName],
    cssName,
    cssByName,
    html: htmlByName['index.html'],
    htmlByName,
    outDir,
  };
}

/** The slice of a stylesheet inside a given top-level layer block. */
function layerBlock(css: string, name: string): string {
  const start = css.indexOf(`@layer ${name} {`);
  expect(
    start,
    `@layer ${name} is not in the emitted stylesheet`,
  ).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`@layer ${name} is unterminated`);
}

/** Both shapes must satisfy the same contract, so both run the same checks. */
function itSplitsCorrectly(get: () => Built) {
  it('declares the layer order the split depends on', () => {
    expect(get().html).toContain(
      '@layer reset, astryx-base, astryx-theme, product;',
    );
  });

  it("puts Astryx's own rules in the library layer", () => {
    const library = layerBlock(get().css, 'astryx-base');
    expect(library.match(LIBRARY_CLASS)?.length ?? 0).toBeGreaterThan(50);
    // The fixture's Button pulls in real component CSS, so a token it styles
    // with is a fact about this block rather than about class-name shape.
    expect(library).toContain('--radius-element');
  });

  // The regression this file exists for. The wrapped-not-split version put the
  // app's own StyleX in astryx-base, below `astryx-theme`, so a theme could
  // silently restyle code the theme has no business reaching.
  it("puts the app's own rules in the product layer, not the library one", () => {
    const {css} = get();
    const product = layerBlock(css, 'product');
    const library = layerBlock(css, 'astryx-base');

    expect(product).toContain('11px');
    expect(library).not.toContain('11px');

    expect(product.match(LIBRARY_CLASS)).toBeNull();
    expect(library.match(PRODUCT_CLASS)).toBeNull();
  });

  it('keeps nested pseudo-elements and keyframes in the product layer', () => {
    const product = layerBlock(get().css, 'product');
    expect(product).toContain(':after');
    expect(product).toContain('#010203');
    expect(product).toContain('@keyframes');
    expect(product).toContain('.717s');
  });

  it('leaves no StyleX rule outside the two layers', () => {
    const {css} = get();
    const outside = css
      .replace(layerBlock(css, 'astryx-base'), '')
      .replace(layerBlock(css, 'product'), '');
    expect(outside).not.toContain('@layer priority');
  });

  // StyleX runs its CSS through lightningcss before emitting it. Replacing that
  // output means running the same pass, or the build quietly loses the prefixes
  // the original had.
  it('keeps the vendor prefixing StyleX applies', () => {
    // `-webkit-box-orient` is authored in source, so only a prefix the pass
    // adds shows that it ran.
    expect(get().css).toContain('-webkit-user-select');
  });

  // Source-built tokens must stay native at the same browser floor Astryx
  // documents. Lowering `light-dark()` here rewrites root variables through
  // mode helpers that exist only on Theme wrappers, so inherited data colors
  // become invalid before a theme can use them.
  it('preserves native light-dark() token values', () => {
    const {css} = get();
    expect(css).toContain('light-dark(');
    expect(css).not.toContain('--lightningcss-light');
    expect(css).not.toContain('--lightningcss-dark');
  });

  it('links the stylesheet from the page', () => {
    const {html, cssName} = get();
    expect(html).toContain(cssName);
    expect(html.split(cssName).length - 1, 'linked more than once').toBe(1);
  });
}

describe('a production build resolves generated locale modules', () => {
  it('loads a generated string map through the standard Astryx Vite aliases', async () => {
    const root = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'astryx-locale-import-')),
    );
    const packageDir = path.join(root, 'node_modules/@astryxdesign');
    const outDir = path.join(root, 'dist');
    mkdirSync(packageDir, {recursive: true});
    symlinkSync(CORE_PACKAGE, path.join(packageDir, 'core'), 'dir');
    writeFileSync(
      path.join(root, 'index.html'),
      '<script type="module" src="/main.ts"></script>',
    );
    writeFileSync(
      path.join(root, 'main.ts'),
      `import frFR from '@astryxdesign/core/locales/fr-FR.generated.js';\ndocument.body.textContent = frFR['@astryx.pagination.next'];\n`,
    );

    try {
      await build({
        root,
        logLevel: 'error',
        build: {outDir, emptyOutDir: true, minify: false},
        plugins: [...astryxStylex({rootDir: root})],
      });
      const assets = path.join(outDir, 'assets');
      const jsName = readdirSync(assets).find(file => file.endsWith('.js'));
      expect(jsName).toBeTruthy();
      expect(readFileSync(path.join(assets, jsName!), 'utf8')).toContain(
        'Aller à la page suivante',
      );
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  }, 180_000);
});

describe('a production build separates Astryx and product styles by layer', () => {
  describe('when the app imports a stylesheet of its own', () => {
    let built: Built;
    beforeAll(async () => {
      built = await buildFixture('layer-split');
    }, 180_000);
    afterAll(
      () => built && rmSync(built.outDir, {recursive: true, force: true}),
    );

    itSplitsCorrectly(() => built);
  });

  // StyleX has no bundle asset to append to here, so it writes its own file in
  // `writeBundle` — outside Rollup's graph, which is why Vite emits no `<link>`
  // for it. Every assertion below failed before this case was handled: the
  // stylesheet was unsplit AND the page loaded no styles at all.
  describe('when the app imports no stylesheet at all', () => {
    let built: Built;
    beforeAll(async () => {
      built = await buildFixture('layer-split-nocss');
    }, 180_000);
    afterAll(
      () => built && rmSync(built.outDir, {recursive: true, force: true}),
    );

    itSplitsCorrectly(() => built);
  });

  describe('when the app has multiple HTML entries', () => {
    let built: Built;
    beforeAll(async () => {
      built = await buildFixture('layer-split-multipage', [
        'index.html',
        'setup.html',
      ]);
    }, 180_000);
    afterAll(
      () => built && rmSync(built.outDir, {recursive: true, force: true}),
    );

    it('links the shared StyleX stylesheet from every page exactly once', () => {
      for (const html of Object.values(built.htmlByName)) {
        expect(html).toContain(built.cssName);
        expect(
          html.split(built.cssName).length - 1,
          'stylesheet is not linked exactly once',
        ).toBe(1);
      }
    });

    it('keeps entry-owned CSS on its own page', () => {
      const mainCss = Object.entries(built.cssByName).find(([, css]) =>
        css.includes('--multipage-main-only'),
      );
      const setupCss = Object.entries(built.cssByName).find(([, css]) =>
        css.includes('--multipage-setup-only'),
      );
      expect(mainCss).toBeDefined();
      expect(setupCss).toBeDefined();

      const [mainCssName] = mainCss!;
      const [setupCssName] = setupCss!;
      expect(built.htmlByName['index.html']).toContain(mainCssName);
      expect(built.htmlByName['index.html']).not.toContain(setupCssName);
      expect(built.htmlByName['setup.html']).toContain(setupCssName);
      expect(built.htmlByName['setup.html']).not.toContain(mainCssName);
      expect(built.css).not.toContain('--multipage-main-only');
      expect(built.css).not.toContain('--multipage-setup-only');
    });
  });
});

// `defineConsts` values are compiled into the reading file as placeholders,
// `var(--<prefix><hash>)`, and the defining file contributes the values; the
// final CSS pass substitutes one for the other. Both halves must reach that
// pass. Storybook builds through the legacy `{stylexOptions}` form, whose
// StyleX instance ran without `treeshakeCompensation`: once `stylex.create`
// was compiled, nothing used the import at runtime, the TypeScript transform
// dropped it, and the defining module was never loaded. A media-query key was
// left as `var(--x…){…}` and failed the build ("Invalid empty selector"); a
// value shipped as a custom property nothing defines. And a constant defined
// on one side of the layer split and read on the other was substituted only
// within its own side, and one an Astryx package defines (compiled with the
// library class-name prefix) never matched an app file's placeholder (written
// with the product prefix).
describe('a production build resolves defineConsts imported across files', () => {
  /** A constant reference StyleX left unsubstituted. */
  const PLACEHOLDER = /var\(--(?:astryx|x)[a-z0-9]{4,}\)/;

  for (const zeroConfig of [false, true]) {
    describe(
      zeroConfig ? 'zero-config form' : 'legacy stylexOptions form (Storybook)',
      () => {
        let built: Built;
        beforeAll(async () => {
          built = await buildFixture('stylex-consts', ['index.html'], {
            libraryPattern: '__fixtures__/stylex-consts/library/',
            zeroConfig,
          });
        }, 180_000);
        afterAll(
          () => built && rmSync(built.outDir, {recursive: true, force: true}),
        );

        it('substitutes a constant read as a value', () => {
          expect(built.css).toMatch(/min-height:\s*52px/);
        });

        it('substitutes a constant read as a media-query key', () => {
          expect(built.css).toMatch(
            /@media \((?:max-width: ?599px|width ?<= ?599px)\)\s*\{[^}]*transition-property:\s*none/,
          );
        });

        it('substitutes a library-side constant read from the product side', () => {
          expect(built.css).toMatch(/padding-top:\s*13px/);
          expect(built.css).toMatch(
            /@media \((?:min-width: ?900px|width ?>= ?900px)\)\s*\{[^}]*max-width:\s*640px/,
          );
        });

        it('substitutes a constant an Astryx package defines under the library prefix', () => {
          expect(built.css).toMatch(/padding-bottom:\s*17px/);
        });

        it('leaves no constant placeholder behind', () => {
          expect(built.css).not.toMatch(PLACEHOLDER);
        });
      },
    );
  }
});

describe('a production build checks the custom properties its stylesheet reads', () => {
  const MESSAGE =
    /reads 1 generated custom property that no stylesheet in the build declares[\s\S]*--x[a-z0-9]+, read by: [^\n]*row-gap/;

  it('warns, naming the variable and the rule that reads it', async () => {
    const warnings: string[] = [];
    const built = await buildFixture('stylex-undefined-var', ['index.html'], {
      warnings,
    });
    rmSync(built.outDir, {recursive: true, force: true});
    expect(warnings.join('\n')).toMatch(MESSAGE);
  }, 180_000);

  it('checks the product prefix a zero-config build sets in stylexOverrides', async () => {
    const warnings: string[] = [];
    const built = await buildFixture('stylex-undefined-var', ['index.html'], {
      zeroConfig: true,
      stylexOverrides: {classNamePrefix: 'app'},
      warnings,
    });
    rmSync(built.outDir, {recursive: true, force: true});
    expect(warnings.join('\n')).toMatch(
      /reads 1 generated custom property that no stylesheet in the build declares[\s\S]*--app[a-z0-9]+, read by: [^\n]*row-gap/,
    );
  }, 180_000);

  it("never reports an app's own custom properties, declared in its own CSS", async () => {
    const warnings: string[] = [];
    const built = await buildFixture('stylex-app-vars', ['index.html'], {
      warnings,
    });
    rmSync(built.outDir, {recursive: true, force: true});
    expect(warnings.join('\n')).not.toMatch(
      /no stylesheet in the build declares/,
    );
  }, 180_000);
});

describe('a production build validates StyleX declarations', () => {
  it('fails with longhand guidance instead of dropping a border shorthand', async () => {
    await expect(buildFixture('invalid-border')).rejects.toThrow(
      /borderTop is not supported.*borderTopWidth.*borderTopStyle.*borderTopColor/s,
    );
  }, 180_000);
});
