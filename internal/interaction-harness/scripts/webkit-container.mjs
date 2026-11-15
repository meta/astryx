#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Runs the interaction proofs' WebKit project inside the official Playwright
 * container image, for hosts where WebKit cannot launch (Playwright's Linux
 * WebKit build needs newer system libraries than some distributions ship).
 *
 *   node internal/interaction-harness/scripts/webkit-container.mjs [playwright test args…]
 *
 * The repository is mounted at the same path, so node_modules, the built
 * Storybook and the evidence directory are the host's own. The image tag
 * matches the installed playwright, so its browsers match the client.
 * Uses podman when present, else docker. `--network=host` lets the specs'
 * local Storybook server and the browser reach each other. Under a rootful
 * docker daemon the container runs as the invoking user (rootless podman and
 * rootless docker already map it), so the `test-results/` it writes into the
 * mounted checkout stay the host user's and the next host run can clear them.
 *
 * WebKit composites through Mesa's software GL in the image, which compiles
 * each shader variant the first time a page draws it: 450–700 ms for the
 * first frame of a blurred or newly animated layer, long enough for a short
 * animation to end before it is ever presented. Mesa caches what it compiles,
 * and the cache is kept on the host (`~/.cache/astryx-webkit-shaders/<image>`,
 * or `ASTRYX_WEBKIT_SHADER_CACHE`), so a run starts with every shader an
 * earlier run compiled instead of paying for them in its first tests.
 *
 * With `CI` set, the container gets CI's four CPUs (`ASTRYX_WEBKIT_CPUS` sets
 * another count). On Linux it runs only on the CPUs this script may use.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const require = createRequire(path.join(root, 'package.json'));
const {version} = JSON.parse(
  fs.readFileSync(require.resolve('playwright/package.json'), 'utf8'),
);
const image =
  process.env.PLAYWRIGHT_IMAGE ??
  `mcr.microsoft.com/playwright:v${version}-noble`;
const engine = ['podman', 'docker'].find(
  cmd => spawnSync(cmd, ['--version'], {stdio: 'ignore'}).status === 0,
);
if (engine == null) {
  console.error('webkit-container: neither podman nor docker is installed');
  process.exit(1);
}
const args = process.argv.slice(2);
// CI's WebKit legs run on four-CPU runners, so with `CI` set the container
// gets four CPUs as a quota; `ASTRYX_WEBKIT_CPUS` sets another count.
const cpusSetting =
  process.env.ASTRYX_WEBKIT_CPUS || ((process.env.CI ?? '') !== '' ? '4' : '');
const cpus = cpusSetting === '' ? null : Number(cpusSetting);
if (cpus != null && (!Number.isInteger(cpus) || cpus < 1)) {
  console.error(
    `webkit-container: ASTRYX_WEBKIT_CPUS must be a positive integer, got "${cpusSetting}"`,
  );
  process.exit(1);
}
// A container starts on every CPU, whatever the caller's affinity. On Linux it
// keeps the CPUs this script may run on, so `taskset` limits it too.
const cpuset = (() => {
  try {
    const allowed = /^Cpus_allowed_list:\s*(\S+)/m.exec(
      fs.readFileSync('/proc/self/status', 'utf8'),
    )?.[1];
    const online = fs
      .readFileSync('/sys/devices/system/cpu/online', 'utf8')
      .trim();
    return allowed != null && allowed !== online ? allowed : null;
  } catch {
    return null;
  }
})();
const cpuLimits = [
  // llvmpipe sizes its thread pool from the CPUs it may run on, not from the
  // quota. So it gets the same count, as in CI's WebKit step.
  ...(cpus == null ? [] : [`--cpus=${cpus}`, '-e', `LP_NUM_THREADS=${cpus}`]),
  ...(cpuset == null ? [] : [`--cpuset-cpus=${cpuset}`]),
];
// Where the container sees the host's shader cache (see the header).
const containerShaderCache = '/astryx-shader-cache';
// Resolved to an absolute path: a bare relative value would be mounted as a
// named volume rather than a host directory. An empty value means the default.
const shaderCache = process.env.ASTRYX_WEBKIT_SHADER_CACHE
  ? path.resolve(process.env.ASTRYX_WEBKIT_SHADER_CACHE)
  : path.join(
      os.homedir(),
      '.cache',
      'astryx-webkit-shaders',
      image.replace(/[^\w.-]+/g, '_'),
    );
fs.mkdirSync(shaderCache, {recursive: true});
// The harness self-test reads this marker inside the container.
fs.writeFileSync(path.join(shaderCache, 'ASTRYX-SHADER-CACHE'), `${image}\n`);
const env = [
  'ASTRYX_STORYBOOK_DIR',
  'ASTRYX_INTERACTION_EVIDENCE',
  'INTERACTION_WORKERS',
  'CI',
]
  .filter(name => process.env[name] != null)
  .flatMap(name => ['-e', `${name}=${process.env[name]}`]);
// A rootful Docker daemon runs the image as root unless told otherwise; the
// files it writes into the bind mount would then be root's. Rootless Docker
// maps the container's root to the invoking user (as podman does), and any
// other container uid to a subordinate host uid that cannot write the
// checkout, so it gets no `--user`.
const rootlessDocker =
  engine === 'docker' &&
  /name=rootless/.test(
    spawnSync('docker', ['info', '--format', '{{json .SecurityOptions}}'], {
      encoding: 'utf8',
    }).stdout ?? '',
  );
const user =
  engine === 'docker' && !rootlessDocker && typeof process.getuid === 'function'
    ? [
        '--user',
        `${process.getuid()}:${process.getgid?.() ?? process.getuid()}`,
        '-e',
        'HOME=/tmp',
      ]
    : [];
const command = [
  'run',
  '--rm',
  ...user,
  '--network=host',
  '--ipc=host',
  // Podman caps a container at 2,048 processes, threads included. Every
  // worker's browser and the tests' own child processes run in this one, and
  // at eight workers WebKit could not start a page's process: `newPage` (a
  // frame decode's scratch page) waited out the test.
  '--pids-limit=-1',
  ...cpuLimits,
  '-v',
  `${root}:${root}`,
  '-v',
  `${shaderCache}:${containerShaderCache}`,
  '-e',
  `MESA_SHADER_CACHE_DIR=${containerShaderCache}`,
  // Only this script sets it: the harness self-test then requires the
  // host-kept cache above.
  '-e',
  'ASTRYX_WEBKIT_CONTAINER=1',
  '-w',
  root,
  ...env,
  image,
  'node',
  path.join(root, 'node_modules/@playwright/test/cli.js'),
  'test',
  '--config',
  'playwright.interaction.config.ts',
  // One token: a bare `--project` would take the spec paths after it as more
  // project names.
  '--project=webkit',
  ...args,
];
console.log(`${engine} ${command.join(' ')}`);
const result = spawnSync(engine, command, {stdio: 'inherit'});
process.exit(result.status ?? 1);
