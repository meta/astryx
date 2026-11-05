// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Provider-identity conflicts proved against the repository's real
 * integration packages instead of hand-written fixtures: the Lab package as it
 * ships, beside a copy of Charts whose manifest also claims Lab's provider ID.
 *
 * Fixtures live under a repo-local temp dir, not /tmp, because Vite refuses to
 * dynamically import a module from outside the project root.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Project} from '../config/project.mjs';
import {doctor} from '../../api/doctor/doctor.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const CHARTS = path.join(REPO, 'packages', 'charts');
const SLOW = 60_000;

/** Both packages are named; Lab is named as the one used, Charts as set aside. */
const WINNER_NAMED =
  /@astryxdesign\/charts@\S+ and @astryxdesign\/lab@\S+ both claim provider ID "@astryxdesign\/lab"\. @astryxdesign\/lab@\S+ loads first and is used; @astryxdesign\/charts@\S+ contributes nothing/u;

let consumer;
let chartsManifest;

beforeEach(() => {
  consumer = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-provider-conflict-'),
  );
  const scope = path.join(consumer, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(
    path.join(REPO, 'packages', 'lab'),
    path.join(scope, 'lab'),
    'dir',
  );

  const charts = path.join(scope, 'charts');
  fs.cpSync(CHARTS, charts, {
    recursive: true,
    filter: source => {
      const [top] = path.relative(CHARTS, source).split(path.sep);
      return top !== 'node_modules' && top !== 'dist';
    },
  });
  chartsManifest = path.join(charts, 'astryx.integration.mjs');
  const shipped = fs.readFileSync(chartsManifest, 'utf8');
  const claimed = shipped.replace(
    'export default {',
    "export default {\n  providerId: '@astryxdesign/lab',",
  );
  expect(claimed).not.toBe(shipped);
  fs.writeFileSync(chartsManifest, claimed);

  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({name: 'consumer', private: true}),
  );
  fs.writeFileSync(
    path.join(consumer, 'astryx.config.mjs'),
    "export default {integrations: ['@astryxdesign/lab', '@astryxdesign/charts']};\n",
  );
});

afterEach(() => {
  fs.rmSync(consumer, {recursive: true, force: true});
});

describe('provider identity conflicts in the real integration packages', () => {
  it('keeps Lab, sets Charts aside, and names both on every surface', async () => {
    const project = await Project.load(consumer, {fresh: true});
    const components = await project.components();
    expect(
      components.filter(component => component.package === '@astryxdesign/lab')
        .length,
    ).toBeGreaterThan(0);
    expect(
      components.some(component => component.package === '@astryxdesign/charts'),
    ).toBe(false);
    const conflicts = (await project.issues()).filter(
      issue => issue.code === 'duplicate_provider',
    );
    expect(conflicts).toEqual([
      expect.objectContaining({
        package: expect.stringMatching(/^@astryxdesign\/charts@\S+$/u),
        severity: 'warning',
        message: expect.stringMatching(WINNER_NAMED),
      }),
    ]);

    const report = await doctor({cwd: consumer});
    const check = report.data.checks.find(
      candidate => candidate.id === 'provider-identity',
    );
    expect(check?.status).toBe('warn');
    expect(check?.message).toMatch(WINNER_NAMED);

    const cli = await runCli(['component', '--list'], consumer);
    expect(cli.status).toBe(0);
    expect(cli.stderr).toMatch(WINNER_NAMED);
  }, SLOW);

  it('loads both real packages without an issue once their IDs differ', async () => {
    fs.copyFileSync(path.join(CHARTS, 'astryx.integration.mjs'), chartsManifest);

    const project = await Project.load(consumer, {fresh: true});
    const components = await project.components();
    expect(
      components.some(component => component.package === '@astryxdesign/charts'),
    ).toBe(true);
    expect(
      (await project.issues()).filter(
        issue => issue.code === 'duplicate_provider',
      ),
    ).toEqual([]);
  }, SLOW);
});
