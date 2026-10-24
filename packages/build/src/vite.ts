// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Plugin, UserConfig} from 'vite';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import stylex from '@stylexjs/unplugin';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LIBRARY_PATTERN = 'node_modules/@astryxdesign/';
const STYLEX_CSS_PATH = '/virtual:stylex.css';

/**
 * Browser targets matching Astryx's native `light-dark()` support floor.
 *
 * These are the source-build default so Lightning CSS preserves
 * `light-dark()` instead of lowering it into helper variables. Consumers may
 * supply a stricter supported floor when their product requires one.
 */
export const LIGHTNINGCSS_TARGETS = {
  chrome: 123 << 16,
  firefox: 120 << 16,
  safari: (17 << 16) | (5 << 8),
};

/**
 * Legacy options shape — kept for backward compatibility.
 * Prefer the zero-config form: astryxStylex()
 */
export interface AstryxVitePluginLegacyOptions {
  stylexOptions: Parameters<typeof stylex.vite>[0];
  libraryPattern?: string;
  /** StyleX atomic class-name prefix for Astryx library styles. @default 'astryx' */
  stylexPrefix?: string;
  layers?: {
    library?: string;
    product?: string;
  };

  /**
   * What the build does when its StyleX stylesheet reads a generated custom
   * property (`--<prefix><hash>`) that nothing declares, a declaration every
   * browser drops: `'warn'` reports the variable and the rule that reads it;
   * `'error'` fails the build.
   *
   * @default 'warn'
   */
  undefinedVariables?: 'warn' | 'error';
}

export interface AstryxVitePluginOptions {
  /**
   * Whether to enable dev mode for StyleX.
   * @default process.env.NODE_ENV !== 'production'
   */
  dev?: boolean;

  /**
   * Root directory for module resolution.
   * @default process.cwd()
   */
  rootDir?: string;

  /**
   * Pattern to identify Astryx library files vs product files.
   * @default 'node_modules/@astryxdesign/'
   */
  libraryPattern?: string;

  /**
   * CSS layer names for the split output.
   */
  layers?: {
    /** Layer name for Astryx library styles @default 'astryx-base' */
    library?: string;
    /** Layer name for product styles @default 'product' */
    product?: string;
  };

  /**
   * Lightning CSS browser targets.
   *
   * Defaults to Astryx's native `light-dark()` support floor. Older targets
   * may lower `light-dark()` and are outside the supported theme contract.
   *
   * @default LIGHTNINGCSS_TARGETS
   */
  lightningcssTargets?: Record<string, number>;

  /**
   * StyleX atomic class-name prefix for Astryx *library* styles. The product
   * build uses a distinct prefix so library and product atoms never collide
   * across layers.
   *
   * Configurable if a consumer needs a custom library atom prefix.
   * Defaults to `astryx`.
   *
   * @default 'astryx'
   */
  stylexPrefix?: string;

  /**
   * Extra StyleX options to merge.
   */
  stylexOverrides?: Record<string, unknown>;

  /**
   * What the build does when its StyleX stylesheet reads a generated custom
   * property (`--<prefix><hash>`) that nothing declares, a declaration every
   * browser drops: `'warn'` reports the variable and the rule that reads it;
   * `'error'` fails the build.
   *
   * @default 'warn'
   */
  undefinedVariables?: 'warn' | 'error';
}

/**
 * Astryx Vite plugin for source builds.
 *
 * Provides sensible defaults for StyleX compilation with Astryx.
 * Just spread into your plugins array:
 *
 *   plugins: [...astryxStylex(), react()]
 *
 * Handles:
 * - StyleX compilation with correct settings
 * - CSS layer ordering (reset < astryx-base < astryx-theme < product)
 * - resolve.alias for @astryxdesign/core source
 * - optimizeDeps.exclude to prevent Vite pre-bundling Astryx
 *
 * @param options — optional overrides
 */
export function astryxStylex(
  options: AstryxVitePluginOptions | AstryxVitePluginLegacyOptions = {},
): Plugin[] {
  // Detect legacy API: astryxStylex({stylexOptions: {...}})
  if ('stylexOptions' in options && options.stylexOptions) {
    return astryxStylexLegacy(options as AstryxVitePluginLegacyOptions);
  }

  const opts = options as AstryxVitePluginOptions;
  const {
    dev = process.env.NODE_ENV !== 'production',
    rootDir = process.cwd(),
    libraryPattern = LIBRARY_PATTERN,
    layers = {},
    lightningcssTargets = LIGHTNINGCSS_TARGETS,
    stylexPrefix = 'astryx',
    stylexOverrides = {},
    undefinedVariables = 'warn',
  } = opts;

  const libraryLayer = layers.library ?? 'astryx-base';
  const productLayer = layers.product ?? 'product';

  const overrideLightningcssOptions = (
    stylexOverrides as {lightningcssOptions?: Record<string, unknown>}
  ).lightningcssOptions;

  // Build StyleX options with sensible defaults. Merge Lightning CSS options
  // separately so an unrelated override cannot silently discard the browser
  // floor that keeps theme values native.
  const stylexOptions: Record<string, unknown> = {
    dev,
    runtimeInjection: false,
    propertyValidationMode: 'throw',
    treeshakeCompensation: true,
    unstable_moduleResolution: {
      type: 'commonJS',
      rootDir,
    },
    ...stylexOverrides,
    lightningcssOptions: {
      targets: lightningcssTargets,
      ...overrideLightningcssOptions,
    },
  };

  // Inject our babel wrapper as a user plugin — it runs before the
  // unplugin's hardcoded StyleX instance and handles prefix routing.
  const astryxBabelPlugin = path.resolve(__dirname, 'babel.js');

  const basePlugin = stylex.vite({
    ...(stylexOptions as any),
    useCSSLayers: true,
    babelConfig: {
      plugins: [
        [
          astryxBabelPlugin,
          {
            ...stylexOptions,
            libraryPrefix: stylexPrefix,
            babelConfig: undefined,
          },
        ],
      ],
    },
  });

  // Layer order declaration plugin
  const layerOrderPlugin: Plugin = {
    name: 'astryx-css-layer-order',
    transformIndexHtml() {
      return [
        {
          tag: 'style',
          children: `@layer reset, ${libraryLayer}, astryx-theme, ${productLayer};`,
          injectTo: 'head-prepend',
        },
      ];
    },
  };

  // Config plugin — injects resolve.alias and optimizeDeps
  const configPlugin: Plugin = {
    name: 'astryx-config',
    config(): UserConfig {
      // Discover all @astryxdesign/* packages to exclude from pre-bundling.
      // Astryx ships as source that must be compiled by StyleX — pre-bundling
      // strips stylex.create/defineVars calls and causes runtime errors.
      let xdsPackages: string[] = ['@astryxdesign/core'];
      try {
        const xdsDir = path.resolve(rootDir, 'node_modules/@astryxdesign');
        if (fs.existsSync(xdsDir)) {
          xdsPackages = fs
            .readdirSync(xdsDir)
            .filter(name => !name.startsWith('.'))
            .map(name => `@astryxdesign/${name}`);
        }
      } catch {
        // Fallback to just @astryxdesign/core if discovery fails
      }

      const corePackageDir = path.resolve(
        rootDir,
        'node_modules/@astryxdesign/core',
      );
      const coreSourceDir = path.join(corePackageDir, 'src');

      return {
        resolve: {
          alias: [
            {
              find: /^@astryxdesign\/core\/locales\/(.+)\.generated\.js$/,
              replacement: path.join(
                coreSourceDir,
                'i18n/generated-locales/$1.generated.ts',
              ),
            },
            {
              find: /^@astryxdesign\/core\/locales\/(.+)\.json$/,
              replacement: path.join(corePackageDir, 'locales/$1.json'),
            },
            {
              find: '@astryxdesign/core/theme/tokens.stylex',
              replacement: path.join(coreSourceDir, 'theme/tokens.stylex.ts'),
            },
            {
              find: '@astryxdesign/core',
              replacement: coreSourceDir,
            },
          ],
        },
        optimizeDeps: {
          exclude: xdsPackages,
        },
      };
    },
  };

  // Split-layer interceptor plugin (dev server only)
  const splitLayerPlugin: Plugin = {
    name: 'astryx-split-layers',
    configureServer(server) {
      let stylexPlugin: any = null;

      return () => {
        for (const p of server.config.plugins.flat()) {
          if ((p as any)?.__stylexGetSharedStore) {
            stylexPlugin = p;
            break;
          }
        }

        server.middlewares.stack.unshift({
          route: '',
          handle: (req: any, res: any, next: any) => {
            if (!req.url?.startsWith(STYLEX_CSS_PATH)) {
              return next();
            }

            const rulesById =
              stylexPlugin?.__stylexGetSharedStore?.()?.rulesById;

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/css');
            res.setHeader('Cache-Control', 'no-store');
            res.end(
              renderSplitLayers(rulesById, {
                libraryPattern,
                libraryLayer,
                productLayer,
              }),
            );
          },
        });
      };
    },
  };

  return [
    configPlugin,
    layerOrderPlugin,
    basePlugin,
    splitLayerPlugin,
    buildLayerSplitPlugin(basePlugin, {
      libraryPattern,
      libraryLayer,
      productLayer,
      lightningcssOptions: stylexOptions.lightningcssOptions,
      classNamePrefixes: [stylexPrefix, 'x'],
      undefinedVariables,
    }),
  ];
}

/**
 * Partition StyleX's collected rules by the source file that authored them and
 * render each half into its cascade layer: Astryx's own styles into the library
 * layer (below `astryx-theme`, so a theme can override them), product styles
 * into the product layer (above it, so an app always wins).
 *
 * The split output is written to one dedicated shared stylesheet. Keeping the
 * collected rules out of an entry-owned CSS asset lets every HTML entry load
 * the same StyleX output without also importing another page's authored CSS.
 *
 * This is the one implementation. The dev middleware and the build hook differ
 * only in when they run and what they do with the string — the partition itself
 * must not diverge, because it did: the build shipped a version that wrapped
 * everything in the library layer, which put product styles UNDER a theme.
 *
 * `rulesById` is keyed by absolute source path, which is the only place the
 * distinction survives — by the time the CSS is text, the origin is gone.
 */
function renderSplitLayers(
  rulesById: Map<string, unknown[]> | undefined,
  options: {
    libraryPattern: string;
    libraryLayer: string;
    productLayer: string;
  },
): string {
  if (!rulesById || rulesById.size === 0) return '';

  const libraryRules: unknown[] = [];
  const productRules: unknown[] = [];
  // `defineConsts` values. A file that reads a constant compiles it to a
  // placeholder, `var(--<prefix><hash>)`, and `processStylexRules` substitutes
  // the value from the defining file's rules, but only among the rules it is
  // given. The defining file and the reading one can sit on opposite sides of
  // the split, so every layer gets every constant. Constant rules emit no CSS
  // of their own, so repeating them adds nothing to the output.
  const constantRules: unknown[] = [];

  for (const [filePath, rules] of rulesById.entries()) {
    const own = filePath.includes(options.libraryPattern)
      ? libraryRules
      : productRules;
    for (const rule of rules) {
      if (isConstantRule(rule)) {
        constantRules.push(rule);
      } else {
        own.push(rule);
      }
    }
  }

  const render = (rules: unknown[], layer: string) =>
    rules.length
      ? `@layer ${layer} {\n${stylexBabelPlugin.processStylexRules([...constantRules, ...rules] as never, {useLayers: true})}\n}`
      : '';

  return [
    render(libraryRules, options.libraryLayer),
    render(productRules, options.productLayer),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The StyleX-generated custom properties `css` reads that it never declares.
 *
 * StyleX names the variables it generates `--<prefix><hash>` (a theme
 * variable, or a constant waiting for its value). One that is read but never
 * declared is a value that compiled to a variable nothing sets, so browsers
 * drop the declaration or take its fallback: a constant whose defining module
 * never reached the build, or a plain export read from a `.stylex.ts` file as
 * if it were a token. The dynamic-style variables StyleX sets inline
 * (`--<prefix>-<property>`) and component variables with a dash after the
 * prefix are not generated names and are never reported.
 *
 * SYNC: scripts/build-css.mjs `undefinedStyleXVariables` is the same check
 * for the prebuilt package stylesheets.
 */
export function undefinedGeneratedVariables(
  css: string,
  prefixes: readonly string[],
): string[] {
  const names = prefixes
    .map(prefix => prefix.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .join('|');
  const declared = new Set(
    [...css.matchAll(new RegExp(`(--(?:${names})[a-z0-9]+)\\s*:`, 'g'))].map(
      match => match[1],
    ),
  );
  const read = new Set(
    [
      ...css.matchAll(
        new RegExp(`var\\(\\s*(--(?:${names})[a-z0-9]+)\\s*[,)]`, 'g'),
      ),
    ].map(match => match[1]),
  );
  return [...read].filter(name => !declared.has(name)).sort();
}

/** A `defineConsts` value as StyleX collects it: a rule with `constKey`/`constVal`. */
function isConstantRule(rule: unknown): boolean {
  const body = Array.isArray(rule)
    ? (rule[1] as {constKey?: unknown; constVal?: unknown} | undefined)
    : undefined;
  return body?.constKey != null && body?.constVal != null;
}

/**
 * The build half of the split. StyleX appends one merged block of CSS to the
 * build's stylesheet, in its own top-level `@layer priority1…priorityN` — which
 * is declared after `@layer reset, astryx-base, astryx-theme, product;` and so
 * outranks every one of them. On the dev server `astryx-split-layers` re-serves
 * the same rules already partitioned; a build had no equivalent, so a theme's
 * component overrides were silently dropped in the built app while working in
 * dev.
 *
 * This removes that merged block from the entry-owned stylesheet, writes the
 * partitioned pair to a dedicated shared stylesheet, and links it from every
 * built HTML page. It runs in `writeBundle` because StyleX emits through two
 * different paths depending on whether the bundle already has a stylesheet to
 * append to (`generateBundle`) or has to write its own file (`writeBundle`) —
 * on disk, after both, there is one case instead of two.
 *
 * The block is located by an exact match against StyleX's own collector rather
 * than by looking for `@layer priority1`: a wrong guess about where the block
 * starts silently moves rules between layers, which is the failure this exists
 * to prevent. If the rules exist and the block cannot be found, the build
 * fails.
 */
function buildLayerSplitPlugin(
  basePlugin: unknown,
  options: {
    libraryPattern: string;
    libraryLayer: string;
    productLayer: string;
    lightningcssOptions?: unknown;
    /** The StyleX class-name prefixes in play: library, then product. */
    classNamePrefixes: readonly string[];
    /** Warn about, or fail on, generated variables nothing declares. */
    undefinedVariables: 'warn' | 'error';
  },
): Plugin {
  const stylex = basePlugin as {
    __stylexGetSharedStore?: () => {rulesById: Map<string, unknown[]>};
    __stylexCollectCss?: () => string;
  };
  let base = '/';

  return {
    name: 'astryx-build-layer-split',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      base = config.base ?? '/';
    },
    writeBundle(outputOptions) {
      const rulesById = stylex.__stylexGetSharedStore?.().rulesById;
      if (!rulesById || rulesById.size === 0) return;

      const merged = stylex.__stylexCollectCss?.();
      if (!merged) return;

      const split = postProcessCss(
        renderSplitLayers(rulesById, options),
        options.lightningcssOptions,
      );

      const undeclared = undefinedGeneratedVariables(
        split,
        options.classNamePrefixes,
      );
      if (undeclared.length > 0) {
        const report = (
          options.undefinedVariables === 'error' ? this.error : this.warn
        ).bind(this);
        report(
          'astryx-build-layer-split: the StyleX stylesheet reads ' +
            `${undeclared.length} generated custom ` +
            `propert${undeclared.length === 1 ? 'y' : 'ies'} ` +
            'that nothing declares, so those declarations would be dropped ' +
            'in every browser:\n' +
            undeclared
              .map(
                name =>
                  `  ${name}, read by: ${rulesReading(split, name).join(' ') || '(rule not found)'}`,
              )
              .join('\n') +
            '\nA `.stylex.ts` export read in a style must be a ' +
            '`defineVars`/`defineConsts` value whose module reaches the build.',
        );
      }

      const outDir = outputOptions.dir
        ? outputOptions.dir
        : outputOptions.file
          ? path.dirname(outputOptions.file)
          : null;
      // `write: false` builds keep everything in memory; there is nothing to
      // patch and nothing was shipped, so this is not a failure.
      if (!outDir || !fs.existsSync(outDir)) return;

      const containingFiles: Array<{file: string; css: string; at: number}> =
        [];
      for (const file of listCssFiles(outDir)) {
        const css = fs.readFileSync(file, 'utf-8');
        const at = css.lastIndexOf(merged);
        if (at === -1) continue;
        containingFiles.push({file, css, at});
      }

      if (containingFiles.length === 0) {
        this.error(
          'astryx-build-layer-split: StyleX emitted rules but its CSS block ' +
            `was not found in any stylesheet under ${outDir}, so Astryx and ` +
            'product styles could not be separated into their cascade layers. ' +
            'Leaving the build unsplit would let product styles lose to a ' +
            'theme. This usually means the StyleX plugin version changed how ' +
            'it emits CSS.',
        );
        return;
      }

      if (listHtmlFiles(outDir).length === 0) {
        for (const {file, css, at} of containingFiles) {
          fs.writeFileSync(
            file,
            css.slice(0, at) + split + css.slice(at + merged.length),
          );
        }
        return;
      }

      for (const {file, css, at} of containingFiles) {
        fs.writeFileSync(
          file,
          css.slice(0, at) + css.slice(at + merged.length),
        );
      }

      const hash = createHash('sha256').update(split).digest('hex').slice(0, 8);
      const sharedStylesheet = path.join(
        path.dirname(containingFiles[0].file),
        `astryx-stylex-${hash}.css`,
      );
      fs.writeFileSync(sharedStylesheet, split);
      linkStylesheetsForEveryPage(outDir, [sharedStylesheet], base);
    },
  };
}

/** The rules of `css` that read `name`, for the failure message. */
function rulesReading(css: string, name: string): string[] {
  return [...css.matchAll(/[^{}]+\{[^{}]*\}/g)]
    .map(match => match[0].trim().replace(/\s+/g, ' '))
    .filter(rule => rule.includes(`var(${name}`))
    .slice(0, 3);
}

/** Every `.css` file under a directory, recursively. */
function listCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listCssFiles(full));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

/** Every `.html` file under a directory, recursively. */
function listHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listHtmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Ensure every built page loads the stylesheet containing StyleX's rules.
 *
 * When an app imports no CSS of its own, StyleX has no bundle asset to append
 * to, so it writes `assets/stylex.css` itself — outside Rollup's graph, which
 * means Vite's HTML plugin never learns about it and emits no `<link>`. In a
 * multi-page build, Vite can also attach the one merged StyleX stylesheet to
 * only one entry. The other pages then ship valid compiled classes but load no
 * rules for them.
 *
 * Check each page independently. A stylesheet already referenced by that page
 * is left alone; a missing reference is inserted exactly once. A build with no
 * HTML at all — library mode — is left alone because its consumer imports the
 * CSS themselves.
 */
function linkStylesheetsForEveryPage(
  outDir: string,
  cssFiles: string[],
  base: string,
): void {
  const pages = listHtmlFiles(outDir);
  if (pages.length === 0) return;

  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf-8');
    if (!html.includes('</head>')) continue;

    const missing = cssFiles.filter(css => !html.includes(path.basename(css)));
    if (missing.length === 0) continue;

    const links = missing
      .map(css => {
        const href =
          base.replace(/\/$/, '') +
          '/' +
          path.relative(outDir, css).split(path.sep).join('/');
        return `<link rel="stylesheet" crossorigin href="${href}">`;
      })
      .join('\n    ');

    fs.writeFileSync(page, html.replace('</head>', `  ${links}\n  </head>`));
  }
}

/**
 * StyleX runs its collected CSS through lightningcss before emitting it, so
 * anything replacing that output has to run the same pass or the build quietly
 * loses the vendor prefixes and lowering the original had.
 *
 * lightningcss ships with both Vite and the StyleX plugin, either of which must
 * be installed for this plugin to run at all. If it somehow is not resolvable,
 * the unprocessed CSS is correct — just less compatible — so this degrades
 * rather than failing the build.
 */
function postProcessCss(css: string, lightningcssOptions: unknown): string {
  if (!css) return css;
  try {
    const require_ = createRequire(import.meta.url);
    const {transform, browserslistToTargets} = require_('lightningcss');
    const browserslist = require_('browserslist');
    const {code} = transform({
      targets: browserslistToTargets(browserslist()),
      ...(lightningcssOptions as object),
      filename: 'stylex.css',
      code: Buffer.from(css),
    });
    return code.toString();
  } catch {
    return css;
  }
}

/**
 * Legacy implementation — handles the old astryxStylex({stylexOptions: {...}}) API.
 * Used by Storybook and other existing configs.
 */
function astryxStylexLegacy(options: AstryxVitePluginLegacyOptions): Plugin[] {
  const {
    stylexOptions,
    libraryPattern = LIBRARY_PATTERN,
    stylexPrefix = 'astryx',
    layers = {},
    undefinedVariables = 'warn',
  } = options;

  const libraryLayer = layers.library ?? 'astryx-base';
  const productLayer = layers.product ?? 'product';

  const legacyLightningcssOptions = (
    stylexOptions as {lightningcssOptions?: Record<string, unknown>}
  ).lightningcssOptions;
  const validatedStylexOptions = {
    propertyValidationMode: 'throw',
    // The unplugin applies its Vite default (true) only to its own StyleX
    // instance, which runs after the babel wrapper below has already compiled
    // every StyleX call. Without it here, a file that reads only `defineConsts`
    // from a `.stylex.ts` module loses that import once `stylex.create` is
    // compiled (the TypeScript transform drops it as unused), the module is
    // never loaded, and its constants never reach the CSS: a media-query key
    // fails the build and a value ships as an undefined custom property.
    treeshakeCompensation: true,
    ...(stylexOptions as any),
    lightningcssOptions: {
      targets: LIGHTNINGCSS_TARGETS,
      ...legacyLightningcssOptions,
    },
  };
  const astryxBabelPlugin = path.resolve(__dirname, 'babel.js');
  const existingPlugins = validatedStylexOptions.babelConfig?.plugins ?? [];

  const basePlugin = stylex.vite({
    ...validatedStylexOptions,
    useCSSLayers: true,
    babelConfig: {
      ...validatedStylexOptions.babelConfig,
      plugins: [
        [
          astryxBabelPlugin,
          {
            ...validatedStylexOptions,
            libraryPrefix: stylexPrefix,
            babelConfig: undefined,
          },
        ],
        ...existingPlugins,
      ],
    },
  });

  const layerOrderPlugin: Plugin = {
    name: 'astryx-css-layer-order',
    transformIndexHtml() {
      return [
        {
          tag: 'style',
          children: `@layer reset, ${libraryLayer}, astryx-theme, ${productLayer};`,
          injectTo: 'head-prepend',
        },
      ];
    },
  };

  const splitLayerPlugin: Plugin = {
    name: 'astryx-split-layers',
    configureServer(server) {
      let stylexPlugin: any = null;

      return () => {
        for (const p of server.config.plugins.flat()) {
          if ((p as any)?.__stylexGetSharedStore) {
            stylexPlugin = p;
            break;
          }
        }

        server.middlewares.stack.unshift({
          route: '',
          handle: (req: any, res: any, next: any) => {
            if (!req.url?.startsWith(STYLEX_CSS_PATH)) {
              return next();
            }

            const rulesById =
              stylexPlugin?.__stylexGetSharedStore?.()?.rulesById;

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/css');
            res.setHeader('Cache-Control', 'no-store');
            res.end(
              renderSplitLayers(rulesById, {
                libraryPattern,
                libraryLayer,
                productLayer,
              }),
            );
          },
        });
      };
    },
  };

  return [
    layerOrderPlugin,
    basePlugin,
    splitLayerPlugin,
    buildLayerSplitPlugin(basePlugin, {
      libraryPattern,
      libraryLayer,
      productLayer,
      lightningcssOptions: (
        validatedStylexOptions as {lightningcssOptions?: unknown}
      ).lightningcssOptions,
      classNamePrefixes: [
        stylexPrefix,
        (validatedStylexOptions as {classNamePrefix?: string})
          .classNamePrefix ?? 'x',
      ],
      undefinedVariables,
    }),
  ];
}
