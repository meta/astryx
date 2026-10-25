// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Adapter-free Vite build for Sandbox, with a physical HTML export per route.
 * @input Generated templates, authored pages, optional SANDBOX_BASE_PATH.
 * @output out/ with trailing-slash deep links and base-path-correct assets.
 * @position Replaces the Next static-export build, not the deployment wiring.
 */

import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {astryxStylex} from '@astryxdesign/build/vite';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import stylexResolution from '../../scripts/stylex-module-resolution.cjs';
import {categories} from './src/app/sandboxPages';
import {
  discoverRoutes,
  exportedHtmlPath,
  templateAssetBase,
} from './scripts/route-manifest.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const basePath = (process.env.SANDBOX_BASE_PATH || '').replace(/\/$/, '');
if (basePath && !/^\/(?:[a-zA-Z0-9_-]+\/?)+$/.test(basePath)) {
  throw new Error(`Invalid SANDBOX_BASE_PATH: ${basePath}`);
}
const base = `${basePath}/`;
let routes = discoverRoutes(
  path.join(appDir, 'src/app'),
  categories.map(category => category.slug),
);

function staticRoutes(): Plugin {
  const id = '\0virtual:sandbox-routes';
  let failed = false;
  let exported = false;
  let isBuild = false;
  return {
    name: 'sandbox-static-routes',
    enforce: 'post',
    configResolved(config) {
      isBuild = config.command === 'build' && !config.build.ssr;
    },
    configureServer(server) {
      // sync-templates --watch recreates the generated wrappers. Refresh the
      // virtual manifest once after the batch, including newly added routes.
      let pending: ReturnType<typeof setTimeout> | undefined;
      const refresh = (file: string) => {
        if (!file.includes('/src/app/') || !file.endsWith('/page.tsx')) return;
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => {
          routes = discoverRoutes(
            path.join(appDir, 'src/app'),
            categories.map(category => category.slug),
          );
          const module = server.moduleGraph.getModuleById(id);
          if (module) server.moduleGraph.invalidateModule(module);
          server.ws.send({type: 'full-reload'});
        }, 500);
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
      // Vite's MPA mode refuses unknown URLs instead of serving an SPA
      // catch-all. During development, serve the entry only for the exact
      // generated routes (production has physical HTML for each one).
      server.middlewares.use((req, _res, next) => {
        const request = new URL(req.url || '/', 'http://localhost');
        if (basePath && !request.pathname.startsWith(`${basePath}/`)) {
          return next();
        }
        const pathname = basePath
          ? request.pathname.slice(basePath.length)
          : request.pathname;
        const route = pathname.endsWith('/') ? pathname : `${pathname}/`;
        if (routes.some(entry => entry.route === route)) {
          req.url = `${base}index.html${request.search}`;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      // Vite's MPA preview returns an empty 404 by default. Serve the same
      // document that a static host serves for an unknown deep link.
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        if (!pathname.startsWith(base)) return next();
        const output = path.join(appDir, 'out');
        const file = path.resolve(output, pathname.slice(base.length));
        if (file !== output && !file.startsWith(`${output}${path.sep}`)) {
          return next();
        }
        if (fs.existsSync(file)) {
          const stat = fs.statSync(file);
          if (
            stat.isFile() ||
            (stat.isDirectory() && fs.existsSync(path.join(file, 'index.html')))
          ) {
            return next();
          }
        }
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        res.end(fs.readFileSync(path.join(output, '404.html')));
      });
    },
    buildEnd(error) {
      if (error) failed = true;
    },
    resolveId(source) {
      if (source === 'virtual:sandbox-routes') return id;
    },
    load(source) {
      if (source !== id) return;
      return `export const routes = [\n${routes
        .map(
          ({route, group, file, slug}) =>
            `{route:${JSON.stringify(route)},group:${JSON.stringify(group)},${slug ? `slug:${JSON.stringify(slug)},` : ''}load:()=>import(${JSON.stringify(file)})}`,
        )
        .join(',\n')}\n];`;
    },
    closeBundle() {
      if (!isBuild || failed || exported) return;
      const output = path.join(appDir, 'out');
      const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
      if (!index.includes('<div id="root"></div>')) {
        throw new Error(
          'Refusing to export routes from a stale/non-Vite index.html',
        );
      }
      exported = true;
      for (const {route} of routes) {
        if (route === '/') continue;
        const destination = path.join(output, exportedHtmlPath(route));
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.writeFileSync(destination, index);
      }
      // GitHub Pages serves this on unknown paths with HTTP 404; no unknown
      // route is exported and there is no catch-all to turn failures into 200s.
      const notFound = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>404: Page not found</title></head><body><h1>Page not found</h1><a href="${base}">Sandbox home</a></body></html>`;
      fs.writeFileSync(path.join(output, '404.html'), notFound);
      fs.mkdirSync(path.join(output, '404'), {recursive: true});
      fs.writeFileSync(path.join(output, '404/index.html'), notFound);
      console.log(
        `Exported ${routes.length} Sandbox HTML routes plus /404/ (${base})`,
      );
    },
  };
}

// Lexical's source export contains declare fields; use the built ESM entry
// for browser builds while preserving its environment-selecting wrapper.
const require = createRequire(import.meta.url);
function lexicalDist(): string | undefined {
  try {
    let directory = path.dirname(require.resolve('lexical'));
    while (path.basename(directory) !== 'lexical') {
      const parent = path.dirname(directory);
      if (parent === directory) return;
      directory = parent;
    }
    return path.join(directory, 'dist/Lexical.mjs');
  } catch {
    return;
  }
}

export default defineConfig({
  base,
  appType: 'mpa',
  plugins: [
    ...astryxStylex({
      // Use built Astryx packages, as the Next export did: library CSS already
      // carries its compiled atoms and theme layers. Compile only Sandbox and
      // template source with StyleX; don't alias package CSS/locales into src/.
      stylexOptions: {
        dev: process.env.NODE_ENV !== 'production',
        runtimeInjection: false,
        treeshakeCompensation: true,
        classNamePrefix: 'p',
        aliases: {
          '@astryxdesign/core/theme/tokens.stylex': [
            path.join(
              appDir,
              'node_modules/@astryxdesign/core/src/theme/tokens.stylex.ts',
            ),
          ],
        },
        unstable_moduleResolution: stylexResolution.stylexModuleResolution,
      },
      stylexPrefix: 'x',
    }),
    react({
      babel: {
        // Never inherit the app's old Next Babel preset while Vite is
        // compiling templates and built packages.
        babelrc: false,
        configFile: false,
        plugins: [
          [
            path.join(appDir, 'scripts/rewrite-template-asset-paths.cjs'),
            {
              basePath: templateAssetBase(
                basePath,
                process.env.SANDBOX_TEMPLATE_ASSETS_BASE_PATH,
              ),
            },
          ],
        ],
      },
    }),
    staticRoutes(),
  ],
  resolve: {
    ...(process.env.ASTRYX_SOURCE === '1' ? {conditions: ['source']} : {}),
    alias: {
      '@': path.join(appDir, 'src'),
      // The app owns the Babel helpers emitted while compiling its template
      // modules; pnpm does not hoist them to each sibling workspace package.
      '@babel/runtime': path.join(appDir, 'node_modules/@babel/runtime'),
      ...(lexicalDist() ? {lexical: lexicalDist()} : {}),
    },
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    cssCodeSplit: false,
  },
});
