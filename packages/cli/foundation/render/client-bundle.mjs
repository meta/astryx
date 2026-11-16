// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page's script for an interactive render: the page's modules and
 * the modules they use, bundled by esbuild (an optional peer, loaded only
 * here) into one script that draws the page in the browser over its server
 * markup, so state, effects and event handlers work. No network, no `eval`,
 * no other file.
 * @input The page's entry file, esbuild, and how the server compiled and
 *   resolved the page's modules
 * @output One script's text, safe inside an HTML `<script>` element
 * @position foundation/render — used by page-worker.mjs
 */

import * as path from 'node:path';
import vm from 'node:vm';

/** The id of the element that holds the page's markup in an interactive file. */
export const ROOT_ID = 'astryx-render-root';

/** Files a package may import for their address; the page's own are inlined before esbuild sees them. */
const ASSET_LOADERS = Object.fromEntries(
  [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.avif',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.mp3',
    '.mp4',
    '.webm',
  ].map(ext => [ext, /** @type {const} */ ('dataurl')]),
);

/**
 * Why the page's script cannot run in one file.
 */
export class BundleError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [detail]
   */
  constructor(message, detail = {}) {
    super(message);
    this.detail = detail;
  }
}

/**
 * Text that runs the same as `code` and cannot end its `<script>` element or
 * be read as the render's embedded source. `</script` and `<!--` only appear
 * in strings, template literals and regular expressions, where `\x3C` is the
 * same `<`.
 * @param {string} code
 */
export function scriptSafe(code) {
  return code
    .replace(/<(?=\/script)/gi, '\\x3C')
    .replace(/<!--/g, '\\x3C!--')
    .replace(/x-astryx-source/g, 'x-astryx\\x2dsource');
}

/**
 * Build the page's script.
 * @param {{
 *   esbuild: any,
 *   entry: string,
 *   source: (file: string) => {contents: string, loader: 'tsx' | 'ts' | 'jsx'} | null,
 *   isPageFile: (file: string) => boolean,
 *   resolveFile: (name: string, dir: string) => string | null,
 *   packageDir: (name: string, importerDir: string) => string | null,
 *   builtin: (name: string) => boolean,
 *   describe: (file: string) => string,
 * }} options
 *   `source` compiles one of the page's own files as the server compiled it
 *   (null for any other file, which esbuild loads); `isPageFile` tells
 *   those files; `resolveFile` finds a relative import of one of them with
 *   the extensions the server tries; `packageDir`
 *   names the folder a package import resolves from when it must come from
 *   the copy the server loaded (React outside a project), else null;
 *   `builtin` tells a Node built-in; `describe` names a file for a message.
 * @returns {Promise<{code: string, modules: number}>}
 */
export async function bundleForBrowser({
  esbuild,
  entry,
  source,
  isPageFile,
  resolveFile,
  packageDir,
  builtin,
  describe,
}) {
  const mount =
    `import {createElement} from 'react';import {createRoot} from 'react-dom/client';import Page from ${JSON.stringify(entry)};` +
    `createRoot(document.getElementById(${JSON.stringify(ROOT_ID)})).render(createElement(Page));`;
  /** @type {any} */
  const plugin = {
    name: 'astryx-page',
    setup(/** @type {any} */ build) {
      build.onResolve({filter: /.*/}, async (/** @type {any} */ args) => {
        if (args.pluginData?.astryx || args.kind === 'entry-point')
          return undefined;
        const name = args.path.split('?')[0];
        if (builtin(name)) {
          return {
            errors: [
              {
                text: `${describe(args.importer || entry)} loads ${name}, which is part of Node and not of a browser.`,
              },
            ],
          };
        }
        if (name.startsWith('.') || path.isAbsolute(name)) {
          // A package's own imports resolve as esbuild resolves them, which
          // keeps what its package.json says (`sideEffects`, `browser`), so
          // the modules the page does not use are left out.
          if (args.importer && !isPageFile(args.importer)) return undefined;
          const file = resolveFile(name, args.resolveDir);
          return file ? {path: file} : undefined;
        }
        const resolveDir = packageDir(name, args.resolveDir) ?? args.resolveDir;
        const found = await build.resolve(name, {
          kind: args.kind,
          resolveDir,
          pluginData: {astryx: true},
        });
        return found.errors.length > 0 ? {errors: found.errors} : found;
      });
      // Stylesheets are already in the page.
      build.onLoad({filter: /\.(css|scss|sass|less)$/i}, () => ({
        contents: '',
        loader: 'js',
      }));
      build.onLoad(
        {filter: /\.[cm]?[jt]sx?$/},
        (/** @type {any} */ args) => source(args.path) ?? undefined,
      );
    },
  };
  /** @type {any} */
  let result;
  try {
    result = await esbuild.build({
      stdin: {
        contents: mount,
        resolveDir: path.dirname(entry),
        sourcefile: 'astryx-mount.js',
        loader: 'js',
      },
      bundle: true,
      write: false,
      metafile: true,
      format: 'iife',
      platform: 'browser',
      minify: true,
      charset: 'ascii',
      legalComments: 'eof',
      jsx: 'automatic',
      define: {'process.env.NODE_ENV': '"production"'},
      loader: ASSET_LOADERS,
      logLevel: 'silent',
      plugins: [plugin],
    });
  } catch (e) {
    const first = /** @type {any} */ (e)?.errors?.[0];
    if (!first) throw e;
    const where = first.location?.file
      ? `${describe(path.resolve(first.location.file))}:${first.location.line}: `
      : '';
    throw new BundleError(
      `The page's script cannot be built for the browser: ${where}${first.text}`,
      {
        ...(first.location?.file
          ? {
              module: describe(path.resolve(first.location.file)),
              line: first.location.line,
            }
          : {}),
      },
    );
  } finally {
    esbuild.stop?.();
  }
  const code = scriptSafe(result.outputFiles[0].text);
  try {
    // Parsed here, so a script that would not run never reaches the file.
    new vm.Script(code, {filename: 'page-script.js'});
  } catch (e) {
    throw new BundleError(
      `The page's script could not be written safely into the file: ${/** @type {Error} */ (e).message}`,
    );
  }
  // The modules the script holds: those esbuild kept any of.
  const output = Object.values(result.metafile?.outputs ?? {})[0];
  const modules = Object.values(output?.inputs ?? {}).filter(
    (/** @type {any} */ input) => input.bytesInOutput > 0,
  ).length;
  return {code, modules};
}
