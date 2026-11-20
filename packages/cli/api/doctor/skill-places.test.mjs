// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor and the skill places: the `skill-places` check (current,
 * missing or stale, kept, copies that differ, doubled or saved both, a
 * project skill named `astryx`, a project at the home folder), its
 * absence in a project that keeps only the AGENTS.md block, and the
 * agent-docs check of a project that keeps its guidance as a skill.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {checkSkillPlaces, runChecks} from './doctor.mjs';
import {init} from '../init/init.mjs';

/** @type {string[]} */
const dirs = [];
/** @param {string} label */
const tmp = label => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astryx-doctor-skills-${label}-`));
  dirs.push(dir);
  return dir;
};

let project = '';
beforeEach(() => {
  const home = tmp('home');
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'));
  vi.stubEnv('XDG_CACHE_HOME', path.join(home, '.cache'));
  project = tmp('app');
  fs.mkdirSync(path.join(project, '.git'));
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*'}}),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  while (dirs.length) fs.rmSync(/** @type {string} */ (dirs.pop()), {recursive: true, force: true});
});

/** @param {string} id */
async function check(id) {
  const report = await runChecks({cwd: project});
  return report.checks.find(each => each.id === id) ?? null;
}

const SHARED = '.agents/skills/astryx-project/SKILL.md';

describe('the skill-places check', () => {
  it('is left out of a project that keeps only the AGENTS.md block', async () => {
    await init({}, {cwd: project});
    expect(await check('skill-places')).toBeNull();
  });

  it("never reads the computer-level skill through a project's .claude linked to the home folder's", async () => {
    await init({}, {cwd: project});
    await init({user: true}, {cwd: project});
    fs.symlinkSync(path.join(os.homedir(), '.claude'), path.join(project, '.claude'), 'dir');
    // A block-only project: no skill-places finding about `.claude/skills/astryx`.
    const result = await check('skill-places');
    expect(result?.message ?? '').not.toContain('.claude/skills/astryx');
  });

  it('passes when every saved file holds this release, and agent-docs points at it', async () => {
    await init({to: 'skills'}, {cwd: project});
    expect(await check('skill-places')).toMatchObject({status: 'pass'});
    expect((await check('agent-docs'))?.message).toContain('skills.to');
  });

  it('warns about a missing copy and names the command that writes it', async () => {
    await init({to: 'skills'}, {cwd: project});
    fs.rmSync(path.join(project, SHARED));
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'warn'});
    expect(result?.message).toContain(`missing from ${SHARED}`);
    expect(result?.fix).toContain('init');
  });

  it('warns when the block and the skill are both there', async () => {
    await init({}, {cwd: project});
    await init({to: './team'}, {cwd: project});
    await init({to: 'agents-md'}, {cwd: project});
    fs.mkdirSync(path.dirname(path.join(project, SHARED)), {recursive: true});
    fs.copyFileSync(path.join(project, 'AGENTS.md'), path.join(project, SHARED));
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'warn'});
    expect(result?.message).toContain('twice');
    expect(result?.fix).toContain(`delete ${SHARED}`);
  });

  it('notes, without warning, a block and a skill the project saves both of', async () => {
    await init({to: 'agents-md,skills'}, {cwd: project});
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'pass'});
    expect(result?.message).toContain('saves both');
  });

  it('calls a deleted copy beside an edited one a split place, not a missing file init would write', async () => {
    await init({to: 'skills'}, {cwd: project});
    fs.appendFileSync(path.join(project, SHARED), 'my note\n');
    fs.rmSync(path.join(project, '.claude', 'skills', 'astryx-project', 'SKILL.md'));
    const result = await check('skill-places');
    expect(result?.message).toContain('copies of skills differ');
    expect(result?.message).toContain('missing');
  });

  it('counts a saved project folder beside the block as the guidance twice', async () => {
    await init({}, {cwd: project});
    const block = fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8');
    await init({to: './team'}, {cwd: project});
    // A stray block left beside the saved folder place.
    fs.writeFileSync(path.join(project, 'AGENTS.md'), block);
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'warn'});
    expect(result?.message).toContain('team/astryx-project/SKILL.md');
  });

  it('names a saved place linked out of the project, not checked, with a fix init can follow', async () => {
    await init({to: 'skills'}, {cwd: project});
    fs.rmSync(path.join(project, '.claude'), {recursive: true});
    fs.symlinkSync(tmp('linked'), path.join(project, '.claude'), 'dir');
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'warn'});
    expect(result?.message).toContain('Not checked');
    expect(result?.fix).toContain('real folder');
  });

  it('says nothing about Codex for a project that saves only a folder place', async () => {
    await init({to: 'user'}, {cwd: project});
    await init({to: './team'}, {cwd: project});
    expect((await check('skill-places'))?.message).not.toContain('Codex');
  });

  it('warns when the two copies of a place differ', async () => {
    await init({to: 'skills'}, {cwd: project});
    fs.appendFileSync(path.join(project, SHARED), 'my note\n');
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'warn'});
    expect(result?.message).toContain('copies of skills differ');
  });

  it('never calls the computer-level skill a project skill in a project at the home folder', async () => {
    const home = /** @type {string} */ (process.env.HOME);
    await init({user: true}, {cwd: project});
    fs.writeFileSync(
      path.join(home, 'package.json'),
      JSON.stringify({name: 'home', dependencies: {'@astryxdesign/core': '*'}}),
    );
    const core = path.join(home, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.0.15'}));
    const report = await runChecks({cwd: home});
    expect(report.checks.find(each => each.id === 'skill-places')).toBeUndefined();
  });

  it('warns about a project skill named astryx', async () => {
    await init({to: 'skills'}, {cwd: project});
    const plain = path.join(project, '.claude', 'skills', 'astryx');
    fs.mkdirSync(plain, {recursive: true});
    fs.writeFileSync(path.join(plain, 'SKILL.md'), '---\nname: astryx\ndescription: "x"\n---\n');
    const result = await check('skill-places');
    expect(result).toMatchObject({status: 'warn'});
    expect(result?.message).toContain('.claude/skills/astryx');
  });

  it('reports kept files without failing', () => {
    const result = checkSkillPlaces(
      /** @type {any} */ ({
        cwd: project,
        skillPlaces: {
          places: ['skills'],
          files: [
            {path: SHARED, place: 'skills', state: 'edited'},
            {path: '.claude/skills/astryx-project/SKILL.md', place: 'skills', state: 'edited'},
          ],
          renderError: null,
          linkedOut: [],
          skillProblems: [],
          leftovers: [],
          blockFiles: [],
          skillFiles: [SHARED],
          skillsFolderFiles: [SHARED],
          plainNamed: [],
          computerSkill: true,
        },
      }),
    );
    expect(result).toMatchObject({status: 'info'});
    expect(result?.message).toContain('Kept as they are');
    expect(result?.message).toContain('Codex lists both');
  });

  it('names the saved computer folders when the computer-level text is turned off', async () => {
    await init({to: 'user'}, {cwd: project});
    await init({user: true, removeAgents: true}, {cwd: project});
    await init({to: '~/team-skills'}, {cwd: project});
    const outside = tmp('outside');
    const report = await runChecks({cwd: outside});
    const agentText = report.checks.find(each => each.id === 'computer-agent-text');
    expect(agentText?.message).toContain('turned off');
    expect(agentText?.message).toContain('~/team-skills');
  });
});
