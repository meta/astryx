// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next-app.mjs
 * @input __fixtures__/next-turbopack and the workspace packages
 * @output Scratch copies of the Next.js fixture app, and helpers to build and
 *   serve one. Core is linked, and a registry's layout installs the others.
 * @position Shared by the Turbopack end-to-end test (src/next.turbopack.test.mjs)
 *   and the speed figures (scripts/turbopack-speed.mjs)
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

export const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const repoRoot = path.resolve(packageDir, '../..');
export const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  TURBOPACK: undefined,
  NODE_PATH: undefined,
};

export const nextBin = dir => path.join(dir, 'node_modules/next/dist/bin/next');

function symlink(target, name, into) {
  const at = path.join(into, 'node_modules', name);
  fs.mkdirSync(path.dirname(at), {recursive: true});
  fs.symlinkSync(target, at, 'junction');
}

/** Copy a package's published files, as a registry install lays them out. */
function install(name, to) {
  const from = path.join(repoRoot, 'packages', name);
  const {files} = JSON.parse(fs.readFileSync(`${from}/package.json`, 'utf8'));
  for (const entry of ['package.json', ...files]) {
    if (!fs.existsSync(path.join(from, entry))) continue;
    fs.cpSync(path.join(from, entry), path.join(to, entry), {
      recursive: true,
      filter: file => !/[\\/]__tests__$|\.test\.tsx?$/.test(file),
    });
  }
}

/** Each package's prebuilt stylesheet, under its `dist`. */
export const PREBUILT = {
  core: 'astryx.css',
  lab: 'lab.css',
  charts: 'charts.css',
  richtext: 'richtext.css',
};

/** The dependencies a package resolves from its own directory. */
const DEPENDENCIES = {
  core: ['intl-messageformat'],
  lab: ['d3-array', 'd3-scale', 'd3-shape'],
  charts: ['d3-array', 'd3-scale', 'd3-shape'],
  richtext: [
    'lexical',
    ...[
      'code',
      'extension',
      'headless',
      'html',
      'link',
      'list',
      'markdown',
      'react',
      'rich-text',
      'selection',
      'table',
      'utils',
    ].map(name => `@lexical/${name}`),
  ],
};

/**
 * A scratch copy of the fixture app, in `dir`, with Core linked and `packages`
 * installed. It deletes every installed prebuilt package stylesheet, except
 * those of `keepPrebuilt`. A stand-in rule replaces one the copy lacks.
 */
export function scratchApp({
  packages = ['lab', 'charts', 'richtext'],
  keepPrebuilt = [],
} = {}) {
  // Inside the repository (an ignored scratch directory), so Turbopack's
  // workspace root covers the linked package's real path.
  const dir = fs.mkdtempSync(path.join(packageDir, '.astryx-next-turbopack-'));
  const app = path.join(dir, 'app');
  fs.cpSync(path.join(packageDir, '__fixtures__/next-turbopack'), app, {
    recursive: true,
  });
  const dependencies = {
    [packageDir]: ['next', '@babel/core', '@stylexjs/babel-plugin'],
    [repoRoot]: ['react', 'react-dom', 'typescript', '@types/react'],
  };
  dependencies[packageDir].push('@stylexjs/postcss-plugin', '@stylexjs/stylex');
  dependencies[repoRoot].push('@types/node');
  for (const [from, names] of Object.entries(dependencies)) {
    for (const name of names) {
      symlink(
        fs.realpathSync(path.join(from, 'node_modules', name)),
        name,
        app,
      );
    }
  }
  symlink(packageDir, '@astryxdesign/build', app);
  // Core linked from a workspace (`file:`, `pnpm link`, a monorepo package),
  // the others as registry installs: real directories under node_modules.
  const installed = {core: path.join(dir, 'core')};
  for (const name of packages) {
    installed[name] = path.join(app, 'node_modules/@astryxdesign', name);
  }
  for (const [name, to] of Object.entries(installed)) {
    install(name, to);
    for (const dependency of DEPENDENCIES[name]) {
      const from = `${repoRoot}/packages/${name}/node_modules/${dependency}`;
      symlink(fs.realpathSync(from), dependency, to);
    }
    const sheet = path.join(to, 'dist', PREBUILT[name]);
    if (!keepPrebuilt.includes(name)) {
      fs.rmSync(sheet, {force: true});
    } else if (!fs.existsSync(sheet)) {
      fs.mkdirSync(path.dirname(sheet), {recursive: true});
      fs.writeFileSync(sheet, '.x1{color:red}\n');
    }
  }
  symlink(installed.core, '@astryxdesign/core', app);
  return {dir, app, installed};
}

/**
 * The page a just-started `next` server serves at `origin`. It waits out only
 * "not listening yet", up to `timeout`. Its first answer must be the page.
 * Every other outcome fails and names the command.
 */
async function servedPage(origin, child, command, timeout = 300_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (child.exitCode != null || child.signalCode != null) {
      throw new Error(
        `${command} exited (${child.exitCode ?? child.signalCode}) before listening on ${origin}`,
      );
    }
    const response = await fetch(origin).catch(error => {
      if (error.cause?.code === 'ECONNREFUSED') return null;
      throw error;
    });
    if (response != null) {
      if (!response.ok) {
        throw new Error(
          `${command} answered ${origin} with ${response.status}`,
        );
      }
      return response.text();
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `${command} never listened on ${origin} within ${timeout / 1000} s`,
      );
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

/**
 * Run `next <command>` in `dir` on a free port until `use(origin, page)`
 * settles, `page` being the first page it serves.
 */
export async function serving(dir, command, use) {
  const port = await new Promise(resolve => {
    const server = net.createServer().listen(0, () => {
      const {port: free} = server.address();
      server.close(() => resolve(free));
    });
  });
  const args = [nextBin(dir), command, '-p', String(port)];
  const child = spawn(process.execPath, args, {
    cwd: dir,
    env,
    detached: true,
    stdio: 'ignore',
  });
  try {
    const origin = `http://localhost:${port}`;
    const label = `${[process.execPath, ...args].join(' ')} (in ${dir})`;
    return await use(origin, await servedPage(origin, child, label));
  } finally {
    process.kill(-child.pid, 'SIGKILL');
  }
}
