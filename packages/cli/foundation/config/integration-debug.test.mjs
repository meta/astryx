// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Loading a project registers the handlers that will receive the run.
 *
 * The unit tests beside the recorder cover the fan-out. These cover the wiring
 * that gets there from real files on disk: an integration's `debug` named
 * export reaching the recorder through `Project.load`, an app's own `debug`
 * surviving alongside it, and the one way an app can refuse an inherited
 * handler.
 *
 * @position packages/cli/foundation/config — behaviour coverage
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {Project} from './project.mjs';
import {begin, finish, setCommand, resetRecorder} from '../debug/recorder.mjs';

/** Where handlers loaded from disk report themselves. */
const SINK = '__astryxIntegrationDebugTestSink';

let tmpDir = '';

/** @returns {string[]} the handlers that fired, in order. */
function fired() {
  return /** @type {any} */ (globalThis)[SINK] ?? [];
}

/**
 * A manifest module that reports itself when its handler is called.
 * @param {string} name
 * @param {{throws?: boolean, handler?: boolean}} [options]
 */
function integration(name, {throws = false, handler = true} = {}) {
  const dir = path.join(tmpDir, 'node_modules', name);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name, version: '1.0.0'}),
  );
  const body = throws
    ? `export const debug = () => { throw new Error('${name} exploded'); };\n`
    : handler
      ? `export const debug = () => { (globalThis.${SINK} ??= []).push('${name}'); };\n`
      : '';
  fs.writeFileSync(
    path.join(dir, 'astryx.integration.mjs'),
    `${body}export default {};\n`,
  );
}

/** @param {string[]} integrations @param {boolean} [ownHandler] */
function config(integrations, ownHandler = false) {
  const own = ownHandler
    ? `  debug: () => { (globalThis.${SINK} ??= []).push('app'); },\n`
    : '';
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default {\n  integrations: ${JSON.stringify(integrations)},\n${own}};\n`,
  );
}

/**
 * @param {Record<string, unknown>} [astryx]
 * @param {Record<string, string>} [dependencies]
 */
function packageJson(astryx, dependencies) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      ...(dependencies ? {dependencies} : {}),
      ...(astryx ? {astryx} : {}),
    }),
  );
}

/** Drive one complete invocation through the recorder. */
async function runOneCommand() {
  begin({argv: ['docs']});
  setCommand('docs');
  await Project.load(tmpDir);
  return finish({exitCode: 0});
}

beforeEach(() => {
  resetRecorder();
  /** @type {any} */ (globalThis)[SINK] = [];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-int-debug-'));
  packageJson();
});

afterEach(() => {
  resetRecorder();
  delete (/** @type {any} */ (globalThis)[SINK]);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('installing an integration is enough', () => {
  it('records the run with no `debug` anywhere in the app config', async () => {
    integration('reporting-integration');
    config(['reporting-integration']);
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.config.mjs'), 'utf-8'),
    ).not.toMatch(/debug/);

    expect(await runOneCommand()).toBe(true);
    expect(fired()).toEqual(['reporting-integration']);
  });

  it('records nothing when the integration exports no handler', async () => {
    integration('plain-integration', {handler: false});
    config(['plain-integration']);

    expect(await runOneCommand()).toBe(false);
    expect(fired()).toEqual([]);
  });

  it('gives every integration its own events', async () => {
    integration('first-integration');
    integration('second-integration');
    config(['first-integration', 'second-integration']);

    await runOneCommand();

    expect(fired()).toEqual(['first-integration', 'second-integration']);
  });
});

describe('the app config does not displace them, and they do not displace it', () => {
  it('calls the app handler and the integration handler, app first', async () => {
    integration('reporting-integration');
    config(['reporting-integration'], true);

    await runOneCommand();

    expect(fired()).toEqual(['app', 'reporting-integration']);
  });

  it('keeps the others when one integration handler throws', async () => {
    integration('exploding-integration', {throws: true});
    integration('working-integration');
    config(['exploding-integration', 'working-integration'], true);

    expect(await runOneCommand()).toBe(true);
    expect(fired()).toEqual(['app', 'working-integration']);
  });
});

describe('an app can refuse an inherited handler', () => {
  it('drops integration handlers under astryx.inheritDebug false', async () => {
    packageJson({inheritDebug: false});
    integration('reporting-integration');
    config(['reporting-integration'], true);

    await runOneCommand();

    expect(fired()).toEqual(['app']);
  });

  it('keeps them under an explicit true', async () => {
    packageJson({inheritDebug: true});
    integration('reporting-integration');
    config(['reporting-integration']);

    await runOneCommand();

    expect(fired()).toEqual(['reporting-integration']);
  });

  it('keeps them when package.json says nothing about astryx', async () => {
    integration('reporting-integration');
    config(['reporting-integration']);

    await runOneCommand();

    expect(fired()).toEqual(['reporting-integration']);
  });

  it('keeps an autolinked handler in a project with no astryx.config', async () => {
    packageJson(undefined, {'reporting-integration': '1.0.0'});
    integration('reporting-integration');

    await runOneCommand();

    expect(fired()).toEqual(['reporting-integration']);
  });

  it('drops an autolinked handler under astryx.inheritDebug false with no astryx.config', async () => {
    packageJson({inheritDebug: false}, {'reporting-integration': '1.0.0'});
    integration('reporting-integration');

    await runOneCommand();

    expect(fired()).toEqual([]);
  });
});

describe('loading the project twice delivers once', () => {
  // The CLI does load twice for most commands: once before Commander parses,
  // so `--help` and parse errors are recorded, and again when the command
  // reads the project for its own reasons.
  it('does not double-deliver across two Project.loads', async () => {
    integration('reporting-integration');
    config(['reporting-integration'], true);

    begin({argv: ['docs']});
    setCommand('docs');
    await Project.load(tmpDir);
    await Project.load(tmpDir);
    finish({exitCode: 0});

    expect(fired()).toEqual(['app', 'reporting-integration']);
  });
});
