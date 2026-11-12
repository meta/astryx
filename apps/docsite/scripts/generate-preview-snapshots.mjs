#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Render the decorative homepage previews to static HTML once per build.
 * @input The preview elements in src/app/(site)/_landing/previewSnapshotSources.tsx,
 *   compiled with the docsite's own StyleX Babel plugins.
 * @output src/generated/previewSnapshots.ts: one HTML string per preview id.
 * @position Last step of `pnpm generate`, before `next build` and `next dev`.
 *   FrozenPreview injects each string; no preview code ships to the browser.
 *
 * Run: node scripts/generate-preview-snapshots.mjs
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {transformAsync} from '@babel/core';
import {
  ICON_SET_SETTING,
  rewriteTemplatePreview,
} from './template-icon-loader.mjs';
import {optimizeTemplateImages} from './template-image-loader.mjs';
import {finishSnapshotHtml} from './lib/preview-snapshot-html.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCES = resolve(ROOT, 'src/app/(site)/_landing/previewSnapshotSources.tsx');
const OUT = resolve(ROOT, 'src/generated/previewSnapshots.ts');
const require = createRequire(import.meta.url);
const {plugins: babelPlugins} = require('../babel.config.js');
const PUBLIC_DIR = resolve(ROOT, 'public');
// The same source sets that next.config.mjs gives to the icon and image loaders.
const TEMPLATE_SOURCE =
  /packages[\\/]cli[\\/]assets[\\/]templates[\\/](?:pages|blocks)[\\/].+\.tsx$/u;
const PAGE_TEMPLATE_SOURCE =
  /packages[\\/]cli[\\/]assets[\\/]templates[\\/]pages[\\/].+\.tsx$/u;
const previewIconSet = process.env[ICON_SET_SETTING]?.trim() ?? '';

// Compile StyleX the same way the Next build does, so the class names in the
// snapshot are the ones in the page's style sheet.
const stylexPlugin = {
  name: 'docsite-stylex',
  setup(builder) {
    builder.onLoad({filter: /\.[cm]?[jt]sx?$/}, async args => {
      if (/[\\/]node_modules[\\/]/u.test(args.path)) {
        return undefined;
      }
      let source = readFileSync(args.path, 'utf8');
      if (PAGE_TEMPLATE_SOURCE.test(args.path)) {
        source = optimizeTemplateImages(source, path =>
          existsSync(join(PUBLIC_DIR, path)),
        );
      }
      if (previewIconSet && TEMPLATE_SOURCE.test(args.path)) {
        source = await rewriteTemplatePreview(source, args.path, {
          iconSet: previewIconSet,
          projectDir: ROOT,
        });
      }
      const loader = /** @type {'js' | 'jsx' | 'ts' | 'tsx'} */ (
        args.path.split('.').pop().replace(/^[cm]/u, '')
      );
      if (!source.includes('@stylexjs/stylex')) {
        return {contents: source, loader};
      }
      const result = await transformAsync(source, {
        filename: args.path,
        cwd: ROOT,
        babelrc: false,
        configFile: false,
        parserOpts: {plugins: ['typescript', 'jsx']},
        plugins: babelPlugins,
      });
      return {contents: result?.code ?? source, loader};
    });
  },
};

async function main() {
  const ENTRY = `
  import {prerenderToNodeStream} from 'react-dom/static';
  import {PREVIEW_SNAPSHOT_SOURCES} from ${JSON.stringify(SOURCES)};
  export async function renderSnapshots() {
    const snapshots = {};
    for (const [id, element] of Object.entries(PREVIEW_SNAPSHOT_SOURCES)) {
      const {prelude} = await prerenderToNodeStream(element, {identifierPrefix: 'preview-' + id + '-'});
      let html = '';
      for await (const chunk of prelude) html += chunk;
      snapshots[id] = html;
    }
    return snapshots;
  }
  `;

  const bundle = await build({
    stdin: {contents: ENTRY, resolveDir: ROOT, loader: 'js', sourcefile: 'preview-snapshots-entry.mjs'},
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    jsx: 'automatic',
    tsconfig: resolve(ROOT, 'tsconfig.json'),
    define: {'process.env.NODE_ENV': '"production"'},
    loader: {'.css': 'empty'},
    logLevel: 'error',
    // Bundled CommonJS packages call require() for Node built-ins.
    banner: {js: "import {createRequire as createRequireForBundle} from 'node:module'; const require = createRequireForBundle(import.meta.url);"},
    plugins: [stylexPlugin],
  });

  const workDir = mkdtempSync(join(tmpdir(), 'docsite-preview-snapshots-'));
  let snapshots;
  try {
    const file = join(workDir, 'render.mjs');
    writeFileSync(file, bundle.outputFiles[0].text);
    const {renderSnapshots} = await import(pathToFileURL(file).href);
    snapshots = await renderSnapshots();
  } finally {
    rmSync(workDir, {recursive: true, force: true});
  }

  const finished = Object.fromEntries(
    Object.entries(snapshots).map(([id, html]) => [id, finishSnapshotHtml(html)]),
  );
  mkdirSync(dirname(OUT), {recursive: true});
  writeFileSync(
    OUT,
    [
      '// Copyright (c) Meta Platforms, Inc. and affiliates.',
      '',
      '// @generated by scripts/generate-preview-snapshots.mjs — do not edit manually',
      '',
      `export const PREVIEW_SNAPSHOTS: Readonly<Record<string, string>> = ${JSON.stringify(finished, null, 2)};`,
      '',
    ].join('\n'),
  );
  const kb = Math.round(Object.values(finished).join('').length / 1024);
  console.log(`generate-preview-snapshots: wrote ${Object.keys(finished).length} previews (${kb} KB)`);
}

await main();
