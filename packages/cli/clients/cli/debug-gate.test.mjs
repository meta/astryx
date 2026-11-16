// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The debug preload gate and integrations no config lists. An
 * installed dependency that ships an integration manifest loads whatever
 * astryx.config says, so a `debug` handler it exports receives every run,
 * parse errors and `--version` included, with or without a config. A config
 * that names neither `debug` nor `integrations` then prints no warning about
 * a missed handler. The real bin runs in a child process, since the gate
 * runs before the command parser.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {writeIconSetProject} from '../../test-utils/icon-set-fixture.mjs';

const BIN = fileURLToPath(new URL('./bin/astryx.mjs', import.meta.url));

/** @type {string} */
let tmp;
/** @type {string} */
let app;
/** @type {string} */
let events;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-debug-gate-'));
  app = writeIconSetProject(tmp);
  events = path.join(tmp, 'events.txt');
  // The installed integration exports a handler that writes one line per run.
  fs.writeFileSync(
    path.join(app, 'node_modules', '@acme', 'glyphs', 'astryx.integration.mjs'),
    [
      "import * as fs from 'node:fs';",
      "export default {experimental: {iconSets: './icon-sets'}};",
      'export function debug(event) {',
      `  fs.appendFileSync(${JSON.stringify(events)}, String(event.exitCode) + '\\n');`,
      '}',
      '',
    ].join('\n'),
  );
});

afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args */
function run(args) {
  const res = spawnSync(process.execPath, [BIN, ...args], {
    cwd: app,
    encoding: 'utf8',
    timeout: 30_000,
    env: {...process.env, FORCE_COLOR: '0', CI: '1', NO_UPDATE_NOTIFIER: '1'},
  });
  return {status: res.status, stderr: res.stderr || ''};
}

/** The runs the handler received, by exit code. */
const received = () =>
  fs.existsSync(events)
    ? fs.readFileSync(events, 'utf8').trim().split('\n')
    : [];

describe('the debug preload gate with an autolinked integration', () => {
  it('records --version and a parse error with no config', () => {
    expect(run(['--version']).status).toBe(0);
    expect(run(['no-such-command']).status).not.toBe(0);
    expect(received()).toHaveLength(2);
  });

  it('records every run and warns of nothing when the config names neither word', () => {
    fs.writeFileSync(
      path.join(app, 'astryx.config.mjs'),
      "export default {experimental: {iconSet: 'glyphs'}};\n",
    );
    for (const args of [['--version'], ['experimental', 'icon', 'trash']]) {
      const res = run(args);
      expect(res.status).toBe(0);
      expect(res.stderr).not.toContain('a debug handler was registered');
    }
    expect(received()).toHaveLength(2);
  });
});
