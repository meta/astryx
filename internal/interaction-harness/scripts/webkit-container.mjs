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
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
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
  '-v',
  `${root}:${root}`,
  '-w',
  root,
  ...env,
  image,
  'node',
  path.join(root, 'node_modules/@playwright/test/cli.js'),
  'test',
  '--config',
  'playwright.interaction.config.ts',
  '--project',
  'webkit',
  ...args,
];
console.log(`${engine} ${command.join(' ')}`);
const result = spawnSync(engine, command, {stdio: 'inherit'});
process.exit(result.status ?? 1);
