// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `init --to`: each place (the AGENTS.md block, the project skills
 * folders, the computer, a folder), the saved choice in astryx.config and the
 * settings file, moving a project off a place, the refusals, and the CLI
 * flag. Every test uses a temporary home folder, so `--to user` and computer
 * folders start from a fresh home.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {init, getNextSteps} from './init.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {settingsFile} from '../../foundation/env/user-settings.mjs';
import {
  PROJECT_SKILL_DESCRIPTION,
  VALID_PLACES_HINT,
} from '../../foundation/agent-docs/skill-places.mjs';
import {renderComputerAgentText} from '../../foundation/agent-docs/computer-agent-text.mjs';

const MARKER_START = '<!-- ASTRYX:START -->';
const MARKER_END = '<!-- ASTRYX:END -->';
const SHARED = '.agents/skills/astryx-project/SKILL.md';
const CLAUDE = '.claude/skills/astryx-project/SKILL.md';

/** @type {string[]} */
const dirs = [];
/** @param {string} label */
function tmp(label) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `astryx-init-to-${label}-`),
  );
  dirs.push(dir);
  return dir;
}

let home = '';
let project = '';
beforeEach(() => {
  home = tmp('home');
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('PATH', tmp('path'));
  vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'));
  vi.stubEnv('XDG_CACHE_HOME', path.join(home, '.cache'));
  vi.stubEnv('APPDATA', path.join(home, 'AppData', 'Roaming'));
  vi.stubEnv('LOCALAPPDATA', path.join(home, 'AppData', 'Local'));
  project = makeProject('app');
});
afterEach(() => {
  vi.unstubAllEnvs();
  while (dirs.length) {
    fs.rmSync(/** @type {string} */ (dirs.pop()), {
      recursive: true,
      force: true,
    });
  }
});

/** @param {string} label */
function makeProject(label) {
  const dir = tmp(label);
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: label, dependencies: {'@astryxdesign/core': '*'}}),
  );
  return dir;
}

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(project, rel), 'utf8');
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(project, rel));
const config = () => read('astryx.config.mjs');
const settings = () => JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));

/** @param {string} text */
function block(text) {
  return text.slice(
    text.indexOf(MARKER_START),
    text.indexOf(MARKER_END) + MARKER_END.length,
  );
}

/**
 * @param {Parameters<typeof init>[0]} options
 * @param {string} [cwd]
 */
async function run(options, cwd = project) {
  const res = await init(options, {cwd});
  if (res.type !== 'init.run')
    throw new Error(`expected init.run, got ${res.type}`);
  return res.data;
}

/** @param {() => Promise<unknown>} fn */
async function refusal(fn) {
  const err = await fn().then(
    () => null,
    e => e,
  );
  expect(err).toBeInstanceOf(AstryxError);
  return /** @type {AstryxError} */ (err);
}

describe('init with no --to and nothing saved', () => {
  it('writes and prints exactly what it did before --to existed', async () => {
    const r = await runCli(['init'], project);
    expect(r.status).toBe(0);
    const lines = r.stdout.split('\n');
    const tip = lines.find(line => line.includes('init --all'));
    const invocation = /`(.+) init --all`/u.exec(tip ?? '')?.[1] ?? '';
    expect(invocation).not.toBe('');
    const version = /AGENTS\.md created \(Astryx (.+)\)/u.exec(r.stdout)?.[1];
    expect(r.stdout).toBe(
      [
        `[ok] AI agent docs: AGENTS.md created (Astryx ${version})`,
        '[ok] AI agent docs: GEMINI.md created',
        '',
        `  Tip: \`${invocation} init --all\` also points you to the theme and page-building workflows.`,
        ...getNextSteps(invocation, project),
      ].join('\n') + '\n',
    );
    expect(fs.readdirSync(project).sort()).toEqual(['.git', 'AGENTS.md', 'GEMINI.md', 'package.json']);
  });
});

describe('init --to skills', () => {
  it('writes the block as a skill in both project skills folders and saves the place', async () => {
    const data = await run({to: 'skills'});
    expect(data.to).toEqual(['skills']);
    expect(data.skills).toEqual([
      {path: SHARED, place: 'skills', action: 'created'},
      {path: CLAUDE, place: 'skills', action: 'created'},
    ]);
    expect(data.docsWritten).toEqual([]);
    expect(exists('AGENTS.md')).toBe(false);
    expect(read(SHARED)).toBe(read(CLAUDE));
    expect(read(SHARED)).toMatch(
      new RegExp(
        `^---\\nname: astryx-project\\ndescription: ${JSON.stringify(PROJECT_SKILL_DESCRIPTION).replace(/[.()]/gu, '\\$&')}\\n---\\n\\n${MARKER_START}\\n`,
        'u',
      ),
    );
    expect(config()).toBe(
      "export default {\n  skills: {\n    to: 'skills',\n  },\n};\n",
    );
  });

  it('holds the same block, byte for byte, that the AGENTS.md place writes', async () => {
    await run({to: 'skills'});
    const twin = makeProject('twin');
    await run({}, twin);
    const agents = fs.readFileSync(path.join(twin, 'AGENTS.md'), 'utf8');
    const skill = read(SHARED).replace(
      /^<!-- astryx-managed sha256:[0-9a-f]{64} -->\n/mu,
      '',
    );
    expect(block(skill)).toBe(block(agents));
  });

  it('a later plain init writes the saved place, not the AGENTS.md block', async () => {
    await run({to: 'skills'});
    const data = await run({});
    expect(data.to).toEqual(['skills']);
    expect(data.skills.map(row => row.action)).toEqual([
      'unchanged',
      'unchanged',
    ]);
    expect(exists('AGENTS.md')).toBe(false);
  });

  it('is named apart from the computer-level skill, so neither hides the other', async () => {
    await init({to: 'user'}, {cwd: project});
    await run({to: 'skills'});
    expect(read(SHARED)).toMatch(/^---\nname: astryx-project\n/u);
    const computer = fs.readFileSync(path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md'), 'utf8');
    expect(computer).toMatch(/^---\nname: astryx\n/u);
  });

  it("writes neither copy when one is a person's own, and says why", async () => {
    fs.mkdirSync(path.dirname(path.join(project, SHARED)), {recursive: true});
    fs.writeFileSync(path.join(project, SHARED), '---\nname: astryx-project\ndescription: "mine"\n---\n');
    const data = await run({to: 'skills'});
    expect(data.skills).toEqual([
      {path: SHARED, place: 'skills', action: 'kept', reason: 'not-astryx'},
      {path: CLAUDE, place: 'skills', action: 'kept', reason: 'pair-kept'},
    ]);
    expect(exists(CLAUDE)).toBe(false);
  });

  it('keeps the block when every new place is a person\'s own', async () => {
    await run({});
    fs.mkdirSync(path.dirname(path.join(project, SHARED)), {recursive: true});
    fs.writeFileSync(path.join(project, SHARED), '# mine\n');
    const data = await run({to: 'skills'});
    expect(data.skills.map(row => row.action)).toEqual(['kept', 'kept']);
    expect(exists('AGENTS.md')).toBe(true);
    expect(data.docsChanges.filter(c => c.change === 'removed')).toEqual([]);
  });

  it('keeps the old skill place, and what is saved, when the new folder place is a person\'s own', async () => {
    await run({to: 'skills'});
    const own = path.join(project, 'team', 'astryx-project', 'SKILL.md');
    fs.mkdirSync(path.dirname(own), {recursive: true});
    fs.writeFileSync(own, '# mine\n');
    await run({to: './team'});
    expect(exists(SHARED)).toBe(true);
    expect(fs.readFileSync(own, 'utf8')).toBe('# mine\n');
    expect(read('astryx.config.mjs')).toContain("'skills'");
    expect(read('astryx.config.mjs')).not.toContain('./team');
  });

  it('keeps a skill file a person edited, and one Astryx did not write', async () => {
    await run({to: 'skills'});
    fs.appendFileSync(path.join(project, SHARED), 'my note\n');
    fs.writeFileSync(path.join(project, CLAUDE), '# my own skill\n');
    const data = await run({});
    expect(data.skills).toEqual([
      {path: SHARED, place: 'skills', action: 'kept', reason: 'edited'},
      {path: CLAUDE, place: 'skills', action: 'kept', reason: 'not-astryx'},
    ]);
    expect(read(SHARED)).toMatch(/my note\n$/u);
    expect(read(CLAUDE)).toBe('# my own skill\n');
  });

  it('runs from a subfolder against the project root', async () => {
    const sub = path.join(project, 'src', 'pages');
    fs.mkdirSync(sub, {recursive: true});
    await run({to: 'skills'}, sub);
    expect(exists(SHARED)).toBe(true);
    expect(fs.existsSync(path.join(sub, '.agents'))).toBe(false);
  });
});

describe('moving a project between places', () => {
  it('moving off agents-md removes the block and reports it', async () => {
    await run({});
    expect(exists('AGENTS.md')).toBe(true);
    const data = await run({to: 'skills'});
    expect(exists('AGENTS.md')).toBe(false);
    expect(exists('GEMINI.md')).toBe(false);
    expect(data.docsChanges).toEqual([
      {
        path: 'AGENTS.md',
        change: 'removed',
        from: expect.any(String),
        to: null,
      },
      {path: 'GEMINI.md', change: 'removed', from: null, to: null},
    ]);
  });

  it('moving back to agents-md removes the skill files, their empty folders, and the config key', async () => {
    fs.mkdirSync(path.join(project, '.claude'));
    fs.writeFileSync(path.join(project, '.claude', 'settings.json'), '{}\n');
    await run({to: 'skills'});
    const data = await run({to: 'agents-md'});
    expect(data.skills).toEqual([
      {path: SHARED, place: 'skills', action: 'removed'},
      {path: CLAUDE, place: 'skills', action: 'removed'},
    ]);
    expect(exists('.agents')).toBe(false);
    expect(exists('.claude/skills')).toBe(false);
    expect(read('.claude/settings.json')).toBe('{}\n');
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('astryx.config.mjs')).toBe(false);
  });

  it('keeps a config that holds anything else when the place key goes', async () => {
    fs.writeFileSync(path.join(project, 'astryx.config.mjs'), 'export default {integrations: []};\n');
    await run({to: 'skills'});
    await run({to: 'agents-md'});
    expect(config()).not.toContain('skills');
    expect(config()).toContain('integrations');
  });

  it('saves a list, and a folder in the project as ./ and its path', async () => {
    const data = await run({to: 'agents-md,./docs/skills'});
    expect(data.to).toEqual(['agents-md', './docs/skills']);
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('docs/skills/astryx-project/SKILL.md')).toBe(true);
    expect(config()).toContain("to: ['agents-md', './docs/skills']");
    const again = await run({});
    expect(again.to).toEqual(['agents-md', './docs/skills']);
  });

  it('a place named twice is written once', async () => {
    const data = await run({to: ['skills', 'skills']});
    expect(data.to).toEqual(['skills']);
  });

  it('naming only computer places leaves the project places as they are', async () => {
    await run({to: 'skills'});
    await run({to: path.join(home, 'team-skills')});
    expect(exists(SHARED)).toBe(true);
    expect(config()).toContain("to: 'skills'");
  });

  it('a protected config stops the run before any place changes', async () => {
    await run({});
    fs.writeFileSync(
      path.join(project, 'astryx.config.mjs'),
      'const make = () => ({});\nexport default make();\n',
    );
    const err = await refusal(() => run({to: 'skills'}));
    expect(err.message).toContain('skills.to');
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists(SHARED)).toBe(false);
  });
});

describe('computer places', () => {
  it('--to user alone is --user, in a fresh home folder', async () => {
    const res = await init({to: 'user'}, {cwd: project});
    expect(res.type).toBe('init.user');
    expect(
      fs.existsSync(path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md')),
    ).toBe(true);
    expect(
      fs
        .lstatSync(path.join(home, '.claude', 'skills', 'astryx'))
        .isSymbolicLink(),
    ).toBe(true);
    expect(settings().computerAgentText.install).toBe(true);
    expect(exists('AGENTS.md')).toBe(false);
  });

  it('--to user writes, prints, and reports exactly what --user does', async () => {
    const viaUser = await runCli(['--json', 'init', '--user'], project);
    const firstHome = home;
    home = tmp('home2');
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'));
    vi.stubEnv('XDG_CACHE_HOME', path.join(home, '.cache'));
    const viaTo = await runCli(['--json', 'init', '--to', 'user'], project);
    expect(viaTo.status).toBe(viaUser.status);
    expect(viaTo.stdout.replaceAll(home, '<home>')).toBe(viaUser.stdout.replaceAll(firstHome, '<home>'));
    expect(
      fs.readFileSync(path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md'), 'utf8'),
    ).toBe(fs.readFileSync(path.join(firstHome, '.agents', 'skills', 'astryx', 'SKILL.md'), 'utf8'));
  });

  it('a folder outside the project gets the computer-level skill, saved in the settings file', async () => {
    const team = path.join(home, 'team-skills');
    const data = await run({to: `skills,${team}`});
    const file = path.join(team, 'astryx', 'SKILL.md');
    expect(fs.readFileSync(file, 'utf8')).toBe(
      renderComputerAgentText({command: 'astryx'}),
    );
    expect(data.skills.at(-1)).toEqual({
      path: file,
      place: '~/team-skills',
      action: 'created',
    });
    expect(settings().skills.to).toEqual(['~/team-skills']);
    expect(config()).toContain("to: 'skills'");
    await run({to: path.join(home, 'other')});
    expect(settings().skills.to).toEqual(['~/team-skills', '~/other']);
  });

  it('writes through a linked skill folder, then refreshes and removes what it wrote there', async () => {
    const target = tmp('target');
    fs.mkdirSync(path.join(home, 'hs'));
    fs.symlinkSync(target, path.join(home, 'hs', 'astryx'), 'dir');
    await run({to: path.join(home, 'hs')});
    expect(fs.existsSync(path.join(target, 'SKILL.md'))).toBe(true);
    expect(settings().skills.to).toEqual(['~/hs']);
    const again = await run({to: path.join(home, 'hs')});
    expect(again.skills.at(-1)).toMatchObject({action: 'unchanged'});
    await init({remove: true, to: path.join(home, 'hs')}, {cwd: project});
    expect(fs.existsSync(path.join(target, 'SKILL.md'))).toBe(false);
    expect(settings().skills?.to ?? []).toEqual([]);
  });

  it("keeps a file a linked skill folder already holds, and does not save a folder nothing reached", async () => {
    const target = tmp('target');
    fs.writeFileSync(path.join(target, 'SKILL.md'), 'theirs\n');
    fs.mkdirSync(path.join(home, 'hs'));
    fs.symlinkSync(target, path.join(home, 'hs', 'astryx'), 'dir');
    const data = await run({to: path.join(home, 'hs')});
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')).toBe('theirs\n');
    expect(data.skills.at(-1)).toMatchObject({action: 'kept', reason: 'not-astryx'});
    expect(fs.existsSync(settingsFile()) ? settings().skills?.to : undefined).toBeUndefined();
  });

  it('user with a project place reports both', async () => {
    const data = await run({to: 'user,skills'});
    expect(data.to).toEqual(['user', 'skills']);
    expect(data.user?.files[0]?.action).toBe('written');
    expect(exists(SHARED)).toBe(true);
  });

  it('outside a project, a folder works and skills is refused', async () => {
    const outside = tmp('outside');
    const data = await run({to: './skills-out'}, outside);
    expect(
      fs.existsSync(path.join(outside, 'skills-out', 'astryx', 'SKILL.md')),
    ).toBe(true);
    expect(data.to).toEqual([path.join(outside, 'skills-out')]);
    const err = await refusal(() => run({to: 'skills'}, outside));
    expect(err.code).toBe(ERROR_CODES.ERR_INVALID_ARGUMENT);
    expect(err.message).toContain('not in a project');
  });
});

describe('refusals', () => {
  it('an unknown place names the valid places and writes nothing', async () => {
    const err = await refusal(() => run({to: 'skils'}));
    expect(err.code).toBe(ERROR_CODES.ERR_INVALID_ARGUMENT);
    expect(err.message).toBe(`Unknown place "skils". ${VALID_PLACES_HINT}`);
    expect(fs.readdirSync(project).sort()).toEqual(['.git', 'package.json']);
  });

  it.each([
    [{to: 'skills', agent: 'claude'}, '--agent'],
    [{to: 'skills', agentDocsPath: 'X.md'}, '--agent-docs-path'],
    [{to: '~/team-skills', agent: 'claude'}, '--agent'],
    [{to: '~/team-skills', agentDocsPath: 'docs/AI.md'}, '--agent-docs-path'],
    [{to: 'user,~/team', agent: 'claude'}, '--agent'],
    [{to: 'skills', features: 'theme'}, '--features'],
    [{to: 'user', user: true}, '--user'],
    [{to: ''}, 'needs a place'],
  ])('refuses %o', async (options, named) => {
    const err = await refusal(() => init(options, {cwd: project}));
    expect(err.code).toBe(ERROR_CODES.ERR_INVALID_ARGUMENT);
    expect(err.message).toContain(named);
  });
});

describe('refusals that keep every file where it is', () => {
  it('refuses a project skills folder linked out of the project, before the config or any file changes', async () => {
    await run({});
    fs.mkdirSync(path.join(home, '.claude'));
    fs.symlinkSync(path.join(home, '.claude'), path.join(project, '.claude'), 'dir');
    const err = await refusal(() => run({to: 'skills'}));
    expect(err.code).toBe(ERROR_CODES.ERR_PATH_TRAVERSAL);
    expect(fs.existsSync(path.join(home, '.claude', 'skills'))).toBe(false);
    expect(exists('astryx.config.mjs')).toBe(false);
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('.agents')).toBe(false);
  });

  it.each([
    [{to: 'user', all: true}, '--all'],
    [{to: 'user', features: 'agents'}, '--features'],
    [{to: 'user', agent: 'claude'}, '--agent'],
  ])('refuses %o as --user does', async (options, named) => {
    const err = await refusal(() => init(options, {cwd: project}));
    expect(err.code).toBe(ERROR_CODES.ERR_INVALID_ARGUMENT);
    expect(err.message).toContain(`\`--to user\` cannot be combined with ${named}`);
  });

  it('names an unknown feature with the same code as without --to', async () => {
    const err = await refusal(() => init({to: 'skills', features: 'bogus'}, {cwd: project}));
    expect(err.code).toBe(ERROR_CODES.ERR_UNKNOWN_FEATURE);
    const both = await refusal(() => init({to: 'skills', features: 'agents', all: true}, {cwd: project}));
    expect(both.code).toBe(ERROR_CODES.ERR_INVALID_ARGUMENT);
  });
});

describe('option pairs that compose with --to', () => {
  it('--to agents-md --agent claude writes the Claude Code file', async () => {
    const data = await run({to: 'agents-md', agent: 'claude'});
    expect(data.docsWritten).toEqual(['.claude/CLAUDE.md']);
    expect(exists('AGENTS.md')).toBe(false);
  });

  it('--to agents-md --agent-docs-path writes that file', async () => {
    const data = await run({to: 'agents-md', agentDocsPath: 'docs/AI.md'});
    expect(data.docsWritten).toEqual(['docs/AI.md']);
    expect(read('docs/AI.md')).toContain(MARKER_START);
  });

  it('--to skills --all writes the skill and runs every feature', async () => {
    const data = await run({to: 'skills', all: true});
    expect(data.features).toEqual(['agents', 'theme', 'template']);
    expect(exists(SHARED)).toBe(true);
    expect(data.themeTemplate).toBe('created');
    expect(exists('AGENTS.md')).toBe(false);
  });

  it('--to skills --features agents,theme writes the skill and the theme template', async () => {
    const data = await run({to: 'skills', features: 'agents,theme'});
    expect(data.features).toEqual(['agents', 'theme']);
    expect(exists(SHARED)).toBe(true);
    expect(data.themeTemplate).toBe('created');
  });
});

describe('the agent options in a project saved on a skill place', () => {
  it.each([
    [{agent: 'claude'}, 'ERR_INVALID_ARGUMENT', '--agent'],
    [{agentDocsPath: 'docs/AI.md'}, 'ERR_INVALID_ARGUMENT', '--agent-docs-path'],
    [{agent: 'bogus'}, 'ERR_UNKNOWN_AGENT', 'bogus'],
  ])('plain init %o is refused, not ignored', async (options, code, named) => {
    await run({to: 'skills'});
    const err = await refusal(() => run(options));
    expect(err.code).toBe(ERROR_CODES[/** @type {keyof typeof ERROR_CODES} */ (code)]);
    expect(err.message).toContain(named);
    expect(exists('docs/AI.md')).toBe(false);
    expect(exists('.claude/CLAUDE.md')).toBe(false);
  });
});

describe('a project root in a settings folder of the home folder', () => {
  it('takes no project place: nothing is saved or written there, as plain init', async () => {
    const settingsDir = path.join(home, '.claude');
    fs.mkdirSync(settingsDir, {recursive: true});
    fs.writeFileSync(path.join(settingsDir, 'package.json'), JSON.stringify({name: 'claude-settings'}));
    const data = await run({to: './skills'}, settingsDir);
    expect(data.docsError?.kind).toBe('install-failed');
    expect(fs.readdirSync(settingsDir)).toEqual(['package.json']);
    const plain = await run({}, settingsDir);
    expect(plain.docsError?.kind).toBe('install-failed');
  });
});

describe('a project that keeps its guidance as a skill', () => {
  it('is set up once its skill files are current: init prints the build and search commands, not the setup steps', async () => {
    const first = await run({to: 'skills'});
    expect(first.agentDocsStatus).toBe('missing');
    expect(first.nextSteps).toBe(true);
    const again = await run({});
    expect(again.agentDocsStatus).toBe('current');
    expect(again.nextSteps).toBe(false);
  });

  it('checks the places before any feature writes: a linked-out skills folder stops the run first', async () => {
    fs.mkdirSync(path.join(home, '.claude'));
    fs.symlinkSync(path.join(home, '.claude'), path.join(project, '.claude'), 'dir');
    const err = await refusal(() => run({to: 'skills', features: 'theme,agents'}));
    expect(err.code).toBe(ERROR_CODES.ERR_PATH_TRAVERSAL);
    expect(fs.readdirSync(project).sort()).toEqual(['.claude', '.git', 'package.json']);
  });

  it('keeps the skill places, and what is saved, when the block it moves to fails to write', async () => {
    await run({to: 'skills'});
    fs.symlinkSync(path.join(home, 'elsewhere.md'), path.join(project, 'AGENTS.md'));
    const data = await run({to: 'agents-md'});
    expect(data.docsError?.kind).toBe('path-safety');
    expect(exists(SHARED)).toBe(true);
    expect(read('astryx.config.mjs')).toContain("'skills'");
  });

  it('a set-up project moved to the skills folders prints no getting-started steps', async () => {
    await run({});
    const data = await run({to: 'skills'});
    expect(data.nextSteps).toBe(false);
  });

  it('a linked-out GEMINI.md it leaves as it is does not stop the move to the block', async () => {
    await run({to: 'skills'});
    fs.symlinkSync(path.join(home, 'gemini.md'), path.join(project, 'GEMINI.md'));
    const data = await run({to: 'agents-md'});
    expect(data.docsError?.kind).toBe('install-failed');
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists(SHARED)).toBe(false);
    expect(exists('astryx.config.mjs')).toBe(false);
  });

  it('a set-up project is still set up after init writes only a folder outside it', async () => {
    await run({});
    const data = await run({to: path.join(home, 'team')});
    expect(data.nextSteps).toBe(false);
  });
});

describe('astryx init --to (CLI)', () => {
  it('writes the place and prints one line per file', async () => {
    const r = await runCli(['init', '--to', 'skills'], project);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`[ok] Astryx skill: ${SHARED} created`);
    expect(r.stdout).toContain(`[ok] Astryx skill: ${CLAUDE} created`);
  });

  it('exits 1 with ERR_INVALID_ARGUMENT for an unknown place', async () => {
    const r = await runCli(['--json', 'init', '--to', 'nowhere'], project);
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toContain('ERR_INVALID_ARGUMENT');
  });
});
