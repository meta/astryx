// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file runCli runs take turns, and a run that outlives its test gives the
 * process back before the next test starts.
 */

import {afterAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {REPO_ROOT} from './repo-root.mjs';
import {runCli} from './run-cli.mjs';

/** @type {string[]} */
const made = [];

afterAll(() => {
  for (const dir of made) fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * A project in the repository that contributes one component.
 * @param {string} component
 * @returns {Promise<string>}
 */
async function projectWith(component) {
  const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-run-cli-turns-'));
  made.push(dir);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({
      name: `@acme/${component.toLowerCase()}`,
      version: '1.0.0',
      files: [],
    })}\n`,
  );
  const added = await runCli(
    ['integration', 'add', 'component', component, '--json'],
    dir,
  );
  expect(added.status).toBe(0);
  return dir;
}

/**
 * The component names that a `component --list --json` run printed.
 * @param {{stdout: string}} result
 * @returns {string[]}
 */
function listed(result) {
  const {data} = JSON.parse(result.stdout.trim());
  return Object.values(data.components)
    .flat()
    .map(component => component.name);
}

describe('runCli', () => {
  it('two runs at once each read their own folder', async () => {
    const alpha = await projectWith('AlphaWidget');
    const beta = await projectWith('BetaWidget');
    const [inAlpha, inBeta] = await Promise.all([
      runCli(['component', '--list', '--json'], alpha),
      runCli(['component', '--list', '--json'], beta),
    ]);
    expect(listed(inAlpha)).toContain('AlphaWidget');
    expect(listed(inAlpha)).not.toContain('BetaWidget');
    expect(listed(inBeta)).toContain('BetaWidget');
    expect(listed(inBeta)).not.toContain('AlphaWidget');
  });

  /** @type {Promise<unknown> | undefined} */
  let leftBehind;

  it('a test can end while its run still holds the process', async () => {
    const dir = await projectWith('GammaWidget');
    // The test ends without awaiting the run, as a test that timed out does.
    leftBehind = runCli(['component', '--list', '--json'], dir);
  });

  it('the next test starts with the process back in the repository', async () => {
    const seen = new Set([process.cwd()]);
    const sampler = setInterval(() => seen.add(process.cwd()), 1);
    await leftBehind;
    clearInterval(sampler);
    seen.add(process.cwd());
    expect([...seen]).toEqual([REPO_ROOT]);
  });
});
