// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input Workspace source entries, Storybook's Vite config, Astryx StyleX plugin.
 * @output Storybook config with Vite and StyleX aliases from one package table.
 * @position Storybook configuration; keeps workspace packages usable unbuilt.
 */

import type {StorybookConfig} from '@storybook/react-vite';
// Source, not the `@astryxdesign/build/vite` export: Storybook evaluates this
// file with Node's ESM resolver before any alias below it applies, and that
// export map points at `dist/vite.mjs`, which does not exist until
// `@astryxdesign/build` is built. Importing the source keeps `pnpm install &&
// pnpm dev` working from a cold clone (#5128) and matches what this app's
// tsconfig already resolves for typecheck.
import {astryxStylex} from '../../../packages/build/src/vite.ts';
import path from 'node:path';
import stylexResolution from '../../../scripts/stylex-module-resolution.cjs';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

interface WorkspaceAlias {
  pkg: string;
  src: string;
  stylex: 'both' | 'wildcard' | 'none';
  vite?: string;
}

// Every runtime workspace dependency belongs here. Themes expose authored
// source.ts to Vite, while StyleX only needs their token-module subpaths.
export const workspaceAliases: WorkspaceAlias[] = [
  {
    pkg: '@astryxdesign/core',
    src: 'packages/core/src',
    stylex: 'both',
  },
  {
    pkg: '@astryxdesign/lab',
    src: 'packages/lab/src',
    stylex: 'both',
  },
  {
    pkg: '@astryxdesign/charts',
    src: 'packages/charts/src',
    stylex: 'both',
  },
  {
    pkg: '@astryxdesign/richtext',
    src: 'packages/richtext/src',
    stylex: 'both',
  },
  {
    pkg: '@astryxdesign/theme-butter',
    src: 'packages/themes/butter/src',
    stylex: 'wildcard',
    vite: 'packages/themes/butter/src/source.ts',
  },
  {
    pkg: '@astryxdesign/theme-chocolate',
    src: 'packages/themes/chocolate/src',
    stylex: 'wildcard',
    vite: 'packages/themes/chocolate/src/source.ts',
  },
  {
    pkg: '@astryxdesign/theme-gothic',
    src: 'packages/themes/gothic/src',
    stylex: 'wildcard',
    vite: 'packages/themes/gothic/src/source.ts',
  },
  {
    pkg: '@astryxdesign/theme-matcha',
    src: 'packages/themes/matcha/src',
    stylex: 'wildcard',
    vite: 'packages/themes/matcha/src/source.ts',
  },
  {
    pkg: '@astryxdesign/theme-neutral',
    src: 'packages/themes/neutral/src',
    stylex: 'wildcard',
    vite: 'packages/themes/neutral/src/source.ts',
  },
  {
    pkg: '@astryxdesign/theme-probe',
    src: 'packages/themes/probe/src',
    stylex: 'wildcard',
    vite: 'packages/themes/probe/src/source.ts',
  },
  {
    pkg: '@astryxdesign/theme-stone',
    src: 'packages/themes/stone/src',
    stylex: 'wildcard',
    vite: 'packages/themes/stone/src/source.ts',
  },
  {
    pkg: '@astryxdesign/theme-y2k',
    src: 'packages/themes/y2k/src',
    stylex: 'wildcard',
    vite: 'packages/themes/y2k/src/source.ts',
  },
  {
    pkg: '@astryxdesign/vega',
    src: 'packages/vega/src',
    // Vega has no StyleX imports.
    stylex: 'none',
  },
];

const stylexAliases: Record<string, string[]> = {};
const viteAliases: Record<string, string> = {};
for (const {pkg, src, stylex, vite} of workspaceAliases) {
  const source = path.resolve(rootDir, src);
  viteAliases[pkg] = vite ? path.resolve(rootDir, vite) : source;
  if (stylex !== 'none') {
    stylexAliases[`${pkg}/*`] = [path.join(source, '*')];
  }
  if (stylex === 'both') {
    stylexAliases[pkg] = [source];
  }
}

const lightningcssTargets = {
  chrome: 123 << 16,
  firefox: 120 << 16,
  safari: (17 << 16) | (5 << 8),
};

const viteBuildTargets = ['chrome123', 'firefox120', 'safari17.5'];

const config: StorybookConfig = {
  stories: [
    '../stories/**/*.mdx',
    '../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: ['@storybook/addon-links', '@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {defaultName: 'Docs'},
  viteFinal: async config => {
    const filteredPlugins =
      config.plugins?.filter(
        plugin =>
          !(
            plugin &&
            typeof plugin === 'object' &&
            'name' in plugin &&
            typeof plugin.name === 'string' &&
            plugin.name.includes('stylex')
          ),
      ) || [];

    return {
      ...config,
      build: {
        ...config.build,
        // esbuild will not downlevel syntax such as destructuring — target modern
        // browsers only.
        target: viteBuildTargets,
      },
      optimizeDeps: {
        ...config.optimizeDeps,
        // Vite waits for all module transforms to finish before committing
        // pre-bundled deps. The StyleX Babel plugin stalls on some Astryx core
        // components, so the crawl never completes and deps are never served.
        holdUntilCrawlEnd: false,
        esbuildOptions: {
          ...config.optimizeDeps?.esbuildOptions,
          // esbuild will not downlevel syntax such as destructuring — target modern
          // browsers only.
          target: viteBuildTargets,
        },
      },
      plugins: [
        {
          name: 'astryx-color-scheme',
          transformIndexHtml() {
            return [
              {
                tag: 'style',
                children: ':root { color-scheme: light; }',
                injectTo: 'head-prepend',
              },
            ];
          },
        },
        ...filteredPlugins,
        ...astryxStylex({
          stylexOptions: {
            dev: false,
            styleResolution: 'application-order',
            aliases: stylexAliases,
            unstable_moduleResolution: stylexResolution.stylexModuleResolution,
            lightningcssOptions: {
              targets: lightningcssTargets,
            },
          },
          libraryPattern: 'packages/',
        }),
      ],
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          ...viteAliases,
        },
      },
      css: {
        transformer: 'lightningcss',
        lightningcss: {
          targets: lightningcssTargets,
        },
      },
    };
  },
};

export default config;
