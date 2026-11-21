// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's agent-docs check in a project that keeps its Astryx
 * guidance as a skill (`init --to skills`): the saved skill files count as
 * the project's agent docs, judged by their state, and the setup check
 * counts them.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {init} from './init.mjs';
import {runChecks} from '../doctor/doctor.mjs';
import {isAstryxInitialized} from '../../foundation/agent-docs/agent-doc-state.mjs';
import * as coreLeaf from '../../../core/scripts/agent-doc-state.mjs';

let home = '';
let project = '';
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-to-doctor-home-'));
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'));
  vi.stubEnv('XDG_CACHE_HOME', path.join(home, '.cache'));
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-to-doctor-app-'));
  fs.mkdirSync(path.join(project, '.git'));
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*'}}),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(home, {recursive: true, force: true});
  fs.rmSync(project, {recursive: true, force: true});
});

it('passes agent-docs on the saved skill files, and points at skill-places', async () => {
  await init({to: 'skills'}, {cwd: project});
  const report = await runChecks({cwd: project});
  const check = report.checks.find(each => each.id === 'agent-docs');
  expect(check).toMatchObject({status: 'pass'});
  expect(check?.message).toContain('.agents/skills/astryx-project/SKILL.md');
  expect(check?.message).toContain('skill-places');
});

it('passes when the project keeps its own AGENTS.md text beside the skill', async () => {
  fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Our rules\n\nBe kind.\n');
  await init({to: 'skills'}, {cwd: project});
  const report = await runChecks({cwd: project});
  expect(report.checks.find(each => each.id === 'agent-docs')).toMatchObject({status: 'pass'});
});

it('leaves the verdict to skill-places when the saved skill files are gone', async () => {
  await init({to: 'skills'}, {cwd: project});
  fs.rmSync(path.join(project, '.agents'), {recursive: true});
  fs.rmSync(path.join(project, '.claude'), {recursive: true});
  const report = await runChecks({cwd: project});
  expect(report.checks.find(each => each.id === 'agent-docs')).toMatchObject({status: 'info'});
  const places = report.checks.find(each => each.id === 'skill-places');
  expect(places).toMatchObject({status: 'warn'});
  expect(places?.fix).toContain('init');
});

it('a skill file without the Astryx markers does not count', async () => {
  await init({to: 'skills'}, {cwd: project});
  for (const folder of ['.agents', '.claude']) {
    fs.writeFileSync(path.join(project, folder, 'skills', 'astryx-project', 'SKILL.md'), '# mine\n');
  }
  const report = await runChecks({cwd: project});
  expect(report.checks.find(each => each.id === 'agent-docs')).toMatchObject({status: 'info'});
});

it('the setup check counts the project skill', async () => {
  await init({to: 'skills'}, {cwd: project});
  expect(isAstryxInitialized(project)).toBe(true);
});

it.each(['./team-skills', '.', './'])(
  'the setup check counts the project skill in the saved project folder %s, and Core\'s copy agrees',
  async to => {
    await init({to}, {cwd: project});
    expect(isAstryxInitialized(project)).toBe(true);
    expect(coreLeaf.isAstryxInitialized(project)).toBe(true);
  },
);

it('a folder string in the config counts only where Astryx wrote a project skill', async () => {
  fs.writeFileSync(path.join(project, 'astryx.config.mjs'), "export default {themes: ['./themes/a']};\n");
  fs.mkdirSync(path.join(project, 'themes', 'a', 'astryx-project'), {recursive: true});
  fs.writeFileSync(path.join(project, 'themes', 'a', 'astryx-project', 'SKILL.md'), '# mine\n');
  expect(isAstryxInitialized(project)).toBe(false);
});
