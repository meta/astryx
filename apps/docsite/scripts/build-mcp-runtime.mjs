#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Builds the folder the docs site's MCP endpoint runs `astryx mcp
 * --docs-only` in (src/lib/mcpBridge.mjs).
 *
 * The endpoint runs the CLI as a child process, so the deployed function must
 * carry the CLI and its dependencies as plain files: the tracer follows no
 * child process, and it skips the links of the workspace's node_modules. This
 * packs the workspace CLI as it publishes and installs it with npm, beside the
 * Core the site documents: the published release on `latest`, the workspace on
 * `canary` (scripts/resolve-content-root.mjs). The folder is then a project as
 * a reader has one. next.config.mjs traces it into the /mcp function.
 *
 * It installs outside the repository and then copies the folder in place: npm
 * refuses to run under the root manifest's `devEngines`. Before that, it calls
 * every tool the folder's server lists, and fails unless each one answers for
 * the documented Core.
 *
 * @input the workspace CLI; the documented Core; the npm registry
 * @output apps/docsite/.mcp-runtime
 * @position docsite build — run by `pnpm build` before `next build`
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {askMcpServer, RUNTIME_DIR} from '../src/lib/mcpBridge.mjs';
import {resolveContentRoot} from './resolve-content-root.mjs';

const DOCSITE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const REPO_ROOT = path.resolve(DOCSITE_ROOT, '..', '..');
const OUT = path.join(DOCSITE_ROOT, RUNTIME_DIR);

/**
 * The one file a pack wrote into `dir`.
 * @param {string} dir
 * @param {string} prefix
 * @returns {string}
 */
function packed(dir, prefix) {
  const file = fs
    .readdirSync(dir)
    .find(name => name.startsWith(prefix) && name.endsWith('.tgz'));
  if (!file) throw new Error(`No ${prefix}*.tgz in ${dir}`);
  return path.join(dir, file);
}

/**
 * The bytes of every file under a folder.
 * @param {string} dir
 * @returns {number}
 */
function folderBytes(dir) {
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) bytes += folderBytes(full);
    else if (entry.isFile()) bytes += fs.statSync(full).size;
  }
  return bytes;
}

/**
 * One call for each tool the server lists. A docs-only command added to the
 * CLI needs a call here before the build passes.
 * @type {Record<string, Record<string, unknown>>}
 */
const SAMPLE_CALLS = {
  search: {query: ['dialog']},
  build: {query: 'settings page'},
  component: {names: ['Button']},
  hook: {list: true},
  docs: {topic: 'theme', index: true},
  template: {name: 'settings'},
  discover: {available: true},
  theme_list: {},
  theme_targets: {},
};

/**
 * Call every tool the folder's server lists, one at a time, and fail unless
 * each one answers without an error and for the documented Core.
 * @param {import('../src/lib/mcpBridge.mjs').McpRuntime} runtime
 * @param {string} coreVersion
 * @returns {Promise<{cli: string, core: string}>} who answered
 */
async function checkEveryTool(runtime, coreVersion) {
  const listed = JSON.parse(
    await askMcpServer(runtime, {jsonrpc: '2.0', id: 0, method: 'tools/list'}),
  );
  const names = (listed.result?.tools ?? []).map(tool => tool.name);
  const missing = names.filter(name => !(name in SAMPLE_CALLS));
  if (names.length === 0 || missing.length > 0) {
    throw new Error(
      `The MCP folder lists tools with no sample call: ${missing.join(', ') || '(none listed)'}`,
    );
  }
  /** @type {{cli: string, core: string} | null} */
  let answeredBy = null;
  // The server takes one message at a time, as the endpoint sends them.
  for (const [index, name] of names.entries()) {
    const reply = JSON.parse(
      await askMcpServer(runtime, {
        jsonrpc: '2.0',
        id: index + 1,
        method: 'tools/call',
        params: {name, arguments: SAMPLE_CALLS[name]},
      }),
    );
    const text = reply.result?.content?.[0]?.text ?? '';
    if (reply.result?.isError !== false) {
      throw new Error(
        `The MCP tool ${name} failed: ${JSON.stringify(reply).slice(0, 500)}`,
      );
    }
    const meta = JSON.parse(text).meta?.answeredBy;
    if (meta && meta.core !== coreVersion) {
      throw new Error(
        `The MCP tool ${name} answered for Core ${meta.core}, not ${coreVersion}`,
      );
    }
    answeredBy ??= meta ?? null;
  }
  if (!answeredBy) throw new Error('No MCP tool said which release answered');
  return answeredBy;
}

/** Build the folder, check it, and move it into place. */
async function main() {
  const {target, contentRoot} = resolveContentRoot();
  const coreDir = path.join(contentRoot, 'packages', 'core');
  const coreVersion = JSON.parse(
    fs.readFileSync(path.join(coreDir, 'package.json'), 'utf8'),
  ).version;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-docs-mcp-'));
  try {
    const packs = path.join(work, 'packs');
    const project = path.join(work, 'project');
    fs.mkdirSync(packs);
    fs.mkdirSync(project);

    execFileSync('pnpm', ['pack', '--pack-destination', packs], {
      cwd: path.join(REPO_ROOT, 'packages', 'cli'),
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    execFileSync(
      'npm',
      [
        'pack',
        coreDir,
        '--ignore-scripts',
        '--loglevel=error',
        '--pack-destination',
        packs,
      ],
      {
        cwd: work,
        stdio: ['ignore', 'ignore', 'inherit'],
      },
    );

    fs.writeFileSync(
      path.join(project, 'package.json'),
      `${JSON.stringify({name: 'astryx-docs-mcp', private: true}, null, 2)}\n`,
    );
    execFileSync(
      'npm',
      [
        'install',
        packed(packs, 'astryxdesign-cli-'),
        packed(packs, 'astryxdesign-core-'),
        '--omit=dev',
        // Core's React peers serve components, not the docs it ships.
        '--legacy-peer-deps',
        '--ignore-scripts',
        '--loglevel=error',
        '--no-bin-links',
        '--no-package-lock',
        '--no-audit',
        '--no-fund',
      ],
      {cwd: project, stdio: ['ignore', 'ignore', 'inherit']},
    );

    // The commands a docs-only server runs read Core's docs and sources, never
    // its build, so the function does not carry the build.
    fs.rmSync(
      path.join(project, 'node_modules', '@astryxdesign', 'core', 'dist'),
      {
        recursive: true,
        force: true,
      },
    );

    const answeredBy = await checkEveryTool(
      {
        bin: path.join(
          project,
          'node_modules',
          '@astryxdesign',
          'cli',
          'clients',
          'cli',
          'bin',
          'astryx.mjs',
        ),
        cwd: project,
      },
      coreVersion,
    );

    fs.rmSync(OUT, {recursive: true, force: true});
    fs.cpSync(project, OUT, {recursive: true});
    console.log(
      `MCP folder (${target}): CLI ${answeredBy.cli}, Core ${answeredBy.core}, ` +
        `${(folderBytes(OUT) / 1e6).toFixed(1)} MB in ${path.relative(REPO_ROOT, OUT)}`,
    );
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
}

await main();
