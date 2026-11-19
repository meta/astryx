// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `init --once` (a copy saved nowhere) and `init --remove` (every saved
 * place, or the places `--to` names, removed and dropped from what is saved;
 * `--remove-agents` is the same option). Every test uses a temporary home
 * folder.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {init} from './init.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {settingsFile} from '../../foundation/env/user-settings.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

const SHARED = '.agents/skills/astryx-project/SKILL.md';
const CLAUDE = '.claude/skills/astryx-project/SKILL.md';

/** @type {string[]} */
const dirs = [];
/** @param {string} label */
const tmp = label => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astryx-init-once-${label}-`));
  dirs.push(dir);
  return dir;
};

let home = '';
let project = '';
beforeEach(() => {
  home = tmp('home');
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('PATH', tmp('path'));
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

/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(project, rel));
const settings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
};

/** @param {() => Promise<unknown>} fn */
async function refusal(fn) {
  const err = await fn().then(() => null, e => e);
  expect(err).toBeInstanceOf(AstryxError);
  return /** @type {AstryxError} */ (err);
}

describe('init --once', () => {
  it('writes the copy and saves nothing, in the project or the settings file', async () => {
    const outside = path.join(tmp('bundle'), 'out');
    const res = await init({to: `./bundle,${outside}`, once: true}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(res.data.once).toBe(true);
    expect(exists('bundle/astryx-project/SKILL.md')).toBe(true);
    expect(fs.existsSync(path.join(outside, 'astryx', 'SKILL.md'))).toBe(true);
    expect(exists('astryx.config.mjs')).toBe(false);
    expect(settings().skills).toBeUndefined();
  });

  it.each([
    [{all: true}, ['agents', 'theme', 'template']],
    [{features: 'agents'}, ['agents']],
  ])('--once composes with %o', async (extra, features) => {
    const res = await init({to: './bundle', once: true, ...extra}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(res.data.once).toBe(true);
    expect(res.data.features).toEqual(features);
    expect(exists('bundle/astryx-project/SKILL.md')).toBe(true);
    expect(exists('astryx.config.mjs')).toBe(false);
  });

  it('moves the project off nothing', async () => {
    await init({}, {cwd: project});
    await init({to: './bundle', once: true}, {cwd: project});
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('bundle/astryx-project/SKILL.md')).toBe(true);
  });

  it.each([
    [{once: true}, 'needs `--to`'],
    [{to: 'user', once: true}, '--to user'],
    [{user: true, once: true}, '--user'],
    [{to: 'skills', once: true, remove: true}, '--once'],
    [{to: 'agents-md', once: true}, 'agents-md'],
  ])('refuses %o', async (options, named) => {
    const err = await refusal(() => init(options, {cwd: project}));
    expect(err.code).toBe(ERROR_CODES.ERR_INVALID_ARGUMENT);
    expect(err.message).toContain(named);
  });

  it('refuses a place the project or this computer already saves, and writes nothing', async () => {
    await init({to: 'skills'}, {cwd: project});
    await init({to: '~/team-skills'}, {cwd: project});
    const before = fs.readFileSync(path.join(project, SHARED), 'utf8');
    for (const to of ['skills', '~/team-skills']) {
      const err = await refusal(() => init({to, once: true}, {cwd: project}));
      expect(err.code).toBe(ERROR_CODES.ERR_INVALID_ARGUMENT);
      expect(err.message).toContain(to);
    }
    expect(fs.readFileSync(path.join(project, SHARED), 'utf8')).toBe(before);
  });
});

describe('init --remove', () => {
  it('removes every saved place and drops what was saved', async () => {
    await init({to: 'skills,./team'}, {cwd: project});
    const res = await init({remove: true}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.from).toEqual(['skills', './team']);
    expect(res.data.removed).toBe(true);
    expect(res.data.skills.map(row => [row.path, row.action])).toEqual([
      [SHARED, 'removed'],
      [CLAUDE, 'removed'],
      ['team/astryx-project/SKILL.md', 'removed'],
    ]);
    expect(exists('.agents')).toBe(false);
    // The folder a place names stays: it may be a person's.
    expect(exists('team/astryx')).toBe(false);
    expect(exists('team')).toBe(true);
    expect(exists('astryx.config.mjs')).toBe(false);
  });

  it('--remove-agents is the same option', async () => {
    await init({to: 'skills'}, {cwd: project});
    const res = await init({removeAgents: true}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills.map(row => row.action)).toEqual(['removed', 'removed']);
  });

  it('with --to, removes only the places named and keeps the rest saved', async () => {
    await init({to: 'agents-md,skills'}, {cwd: project});
    const res = await init({remove: true, to: 'skills'}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.from).toEqual(['skills']);
    expect(exists(SHARED)).toBe(false);
    expect(exists('AGENTS.md')).toBe(true);
    // agents-md alone is the default, so nothing is left to save.
    expect(exists('astryx.config.mjs')).toBe(false);
  });

  it('removes a folder outside the project and drops it from the settings file', async () => {
    await init({to: '~/team-skills'}, {cwd: project});
    expect(settings().skills.to).toEqual(['~/team-skills']);
    await init({remove: true, to: '~/team-skills'}, {cwd: project});
    expect(fs.existsSync(path.join(home, 'team-skills', 'astryx'))).toBe(false);
    expect(fs.existsSync(path.join(home, 'team-skills'))).toBe(true);
    expect(settings().skills.to).toEqual([]);
  });

  it('--remove --to user is --user --remove-agents', async () => {
    await init({to: 'user'}, {cwd: project});
    const res = await init({remove: true, to: 'user'}, {cwd: project});
    expect(res.type).toBe('init.user');
    expect(fs.existsSync(path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md'))).toBe(false);
    expect(settings().computerAgentText.install).toBe(false);
  });

  it('never removes the computer-level skill through a saved folder that is ~/.agents/skills', async () => {
    await init({to: 'user'}, {cwd: project});
    const skill = path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md');
    await init({to: '~/.agents/skills'}, {cwd: project});
    const res = await init({remove: true, to: '~/.agents/skills'}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills[0]).toMatchObject({action: 'kept', reason: 'computer-skill'});
    expect(fs.existsSync(skill)).toBe(true);
  });

  it("never removes the computer-level skill's managed copy through a saved folder (Continue)", async () => {
    fs.mkdirSync(path.join(home, '.continue'));
    await init({to: 'user'}, {cwd: project});
    const copy = path.join(home, '.continue', 'skills', 'astryx', 'SKILL.md');
    expect(fs.existsSync(copy)).toBe(true);
    await init({to: '~/.continue/skills'}, {cwd: project});
    const res = await init({remove: true, to: '~/.continue/skills'}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills[0]).toMatchObject({action: 'kept', reason: 'computer-skill'});
    expect(fs.existsSync(copy)).toBe(true);
  });

  it("never removes the computer-level text's copy kept where a link could not be made", async () => {
    await init({to: 'user'}, {cwd: project});
    const link = path.join(home, '.claude', 'skills', 'astryx');
    // A computer where links cannot be made gets a managed copy instead.
    fs.rmSync(link);
    fs.mkdirSync(link);
    fs.copyFileSync(path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md'), path.join(link, 'SKILL.md'));
    await init({to: '~/.claude/skills'}, {cwd: project});
    const res = await init({remove: true, to: '~/.claude/skills'}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills[0]).toMatchObject({action: 'kept', reason: 'computer-skill'});
    expect(fs.existsSync(path.join(link, 'SKILL.md'))).toBe(true);
  });

  it("a folder at an agent's skills path is the saved folder's own when --user never ran", async () => {
    await init({to: '~/.claude/skills'}, {cwd: project});
    const file = path.join(home, '.claude', 'skills', 'astryx', 'SKILL.md');
    expect(fs.existsSync(file)).toBe(true);
    const again = await init({to: '~/.claude/skills'}, {cwd: project});
    if (again.type !== 'init.run') throw new Error(again.type);
    expect(again.data.skills[0]).toMatchObject({action: 'unchanged'});
    const res = await init({remove: true, to: '~/.claude/skills'}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills[0]).toMatchObject({action: 'removed'});
    expect(fs.existsSync(file)).toBe(false);
    expect(settings().skills.to).toEqual([]);
  });

  it('writes and removes the project skill through .claude/skills linked to .agents/skills inside the project', async () => {
    fs.mkdirSync(path.join(project, '.agents', 'skills', 'astryx-project'), {recursive: true});
    fs.mkdirSync(path.join(project, '.claude', 'skills'), {recursive: true});
    fs.symlinkSync(
      path.join('..', '..', '.agents', 'skills', 'astryx-project'),
      path.join(project, '.claude', 'skills', 'astryx-project'),
      'dir',
    );
    const res = await init({to: 'skills'}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(exists(SHARED)).toBe(true);
    expect(res.data.skills.every(row => row.action !== 'kept')).toBe(true);
    await init({remove: true}, {cwd: project});
    expect(exists(SHARED)).toBe(false);
  });

  it('--remove-agents --to removes the places named, as --remove --to does', async () => {
    await init({to: 'agents-md,skills'}, {cwd: project});
    const res = await init({removeAgents: true, to: 'skills'}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.from).toEqual(['skills']);
    expect(exists(SHARED)).toBe(false);
    expect(exists('AGENTS.md')).toBe(true);
  });

  it('--user --remove removes the computer-level text, as --user --remove-agents does', async () => {
    await init({user: true}, {cwd: project});
    const res = await init({user: true, remove: true}, {cwd: project});
    expect(res.type).toBe('init.user');
    expect(fs.existsSync(path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md'))).toBe(false);
    expect(settings().computerAgentText.install).toBe(false);
  });

  it('never removes the computer-level skill through a folder its link points into', async () => {
    await init({to: 'user'}, {cwd: project});
    const skill = path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md');
    expect(fs.lstatSync(path.join(home, '.claude', 'skills', 'astryx')).isSymbolicLink()).toBe(true);
    await init({to: '~/.claude/skills'}, {cwd: project});
    const res = await init({remove: true, to: '~/.claude/skills'}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills[0]).toMatchObject({action: 'kept', reason: 'computer-skill'});
    expect(fs.existsSync(skill)).toBe(true);
  });

  it('keeps an edited skill file and says so', async () => {
    await init({to: 'skills'}, {cwd: project});
    fs.appendFileSync(path.join(project, SHARED), 'mine\n');
    const res = await init({remove: true}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills[0]).toEqual({path: SHARED, place: 'skills', action: 'kept', reason: 'edited'});
  });

  it('--once with --agent names the block options as ones --once never writes', async () => {
    const err = await init({to: './bundle', once: true, agent: 'claude'}, {cwd: project}).catch(e => e);
    expect(err.code).toBe('ERR_INVALID_ARGUMENT');
    expect(err.message).toContain('which `--once` never writes');
    expect(err.message).not.toContain('astryx.config');
  });

  it('outside a project, --to with --agent asks for agents-md in --to, not a saved place', async () => {
    const outside = tmp('outside');
    const err = await init({to: path.join(home, 'team-skills'), agent: 'claude'}, {cwd: outside}).catch(e => e);
    expect(err.code).toBe('ERR_INVALID_ARGUMENT');
    expect(err.message).toContain('add agents-md to `--to`');
    expect(err.message).not.toContain('astryx.config');
  });

  it('says so when the saved skill files are already gone', async () => {
    await init({to: 'skills'}, {cwd: project});
    fs.rmSync(path.join(project, '.agents'), {recursive: true});
    fs.rmSync(path.join(project, '.claude'), {recursive: true});
    const r = await runCli(['init', '--remove'], project);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[ok] Nothing to remove: no Astryx skill file in skills; skills is no longer saved.');
  });

  it('names a place that was never saved as such', async () => {
    await init({to: path.join(home, 'team-skills')}, {cwd: project});
    const r = await runCli(['init', '--remove', '--to', '~/team-skill'], project);
    expect(r.stdout).toContain('~/team-skill was not saved');
    expect(r.stdout).not.toContain('no longer saved');
  });

  it('--remove-agents prints byte for byte what it printed before in a project that saves nothing', async () => {
    await runCli(['init'], project);
    const r = await runCli(['init', '--remove-agents'], project);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(
      '[ok] Removed empty AGENTS.md\n[ok] Removed empty GEMINI.md\n[ok] AI agent docs removed.\n',
    );
    expect(r.stderr).toBe('');
    const again = await runCli(['init', '--remove-agents'], project);
    expect(again.stdout).toBe('[ok] Nothing to remove: no Astryx agent-docs block was found.\n');
    expect(again.stderr).toBe('');
  });

  it('without --to, keeps folders outside the project and says how to remove them', async () => {
    await init({to: 'skills,~/hs'}, {cwd: project});
    const r = await runCli(['init', '--remove'], project);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('Kept the Astryx skill in ~/hs');
    expect(r.stderr).toContain('init --remove --to ~/hs');
    expect(fs.existsSync(path.join(home, 'hs', 'astryx', 'SKILL.md'))).toBe(true);
  });
});
