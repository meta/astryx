// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `init({user})` and `astryx init --user`: the `init.user` receipt, the
 * install warning, the refused combinations, and that it touches nothing in
 * the folder it runs in. Every test uses a temporary home folder and search
 * path.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {init} from '../init.mjs';
import {user} from './user.mjs';
import {runWithCliDoor} from '../../../foundation/env/cli-command.mjs';
import {renderComputerAgentText} from '../../../foundation/agent-docs/computer-agent-text.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {MARKER_END, MARKER_START} from '../../../foundation/agent-docs/agent-doc-state.mjs';
import {settingsFile} from '../../../foundation/env/user-settings.mjs';
import {readGlobalState} from '../../../foundation/release/global-state.mjs';
import {cliVersion} from '../../../foundation/release/run-context.mjs';

/** @type {string[]} */
const dirs = [];
/** @param {string} label */
function tmp(label) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `astryx-init-user-${label}-`),
  );
  dirs.push(dir);
  return dir;
}

let home = '';
let emptyPath = '';
beforeEach(() => {
  home = tmp('home');
  emptyPath = tmp('path');
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('PATH', emptyPath);
  // The settings file and the cache live under this home folder too.
  vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'));
  vi.stubEnv('XDG_CACHE_HOME', path.join(home, '.cache'));
  vi.stubEnv('APPDATA', path.join(home, 'AppData', 'Roaming'));
  vi.stubEnv('LOCALAPPDATA', path.join(home, 'AppData', 'Local'));
});

/** The settings file under the temporary home folder. */
const settings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return null;
  }
};
afterEach(() => {
  vi.unstubAllEnvs();
  while (dirs.length) {
    fs.rmSync(/** @type {string} */ (dirs.pop()), {
      recursive: true,
      force: true,
    });
  }
});

const FILE = path.join('.agents', 'skills', 'astryx', 'SKILL.md');
const CLAUDE = path.join('.claude', 'skills', 'astryx');

/** Put a linked Astryx CLI first on the search path. */
function installCliOnPath() {
  const prefix = tmp('prefix');
  const pkg = path.join(prefix, 'lib', 'node_modules', '@astryxdesign', 'cli');
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    '{"name":"@astryxdesign/cli"}',
  );
  fs.writeFileSync(path.join(pkg, 'bin.mjs'), '#!/usr/bin/env node\n');
  fs.chmodSync(path.join(pkg, 'bin.mjs'), 0o755);
  fs.mkdirSync(path.join(prefix, 'bin'));
  fs.symlinkSync(path.join(pkg, 'bin.mjs'), path.join(prefix, 'bin', 'astryx'));
  vi.stubEnv('PATH', path.join(prefix, 'bin'));
}

describe('init({user: true})', () => {
  it('writes the file, links Claude Code to it, and returns the init.user receipt, warning when no astryx runs the CLI', async () => {
    const r = await init({user: true}, {cwd: tmp('cwd')});
    expect(r.type).toBe('init.user');
    if (r.type !== 'init.user') return;
    expect(r.data.files).toEqual([
      {path: path.join(home, FILE), action: 'written'},
      {path: path.join(home, CLAUDE), action: 'linked'},
    ]);
    expect(r.data.command).toBe('astryx');
    expect(r.data.warnings).toHaveLength(1);
    expect(r.data.warnings[0]).toContain('npm i -g @astryxdesign/cli');
    expect(fs.readFileSync(path.join(home, FILE), 'utf8')).toBe(
      renderComputerAgentText({command: 'astryx'}),
    );
    expect(fs.readFileSync(path.join(home, CLAUDE, 'SKILL.md'), 'utf8')).toBe(
      renderComputerAgentText({command: 'astryx'}),
    );
  });

  it.skipIf(process.platform === 'win32')(
    'does not warn when the astryx on the search path is the Astryx CLI',
    async () => {
      installCliOnPath();
      const r = await user();
      expect(r.data.warnings).toEqual([]);
    },
  );

  it("names the host's door and does not ask for a global install", async () => {
    const r = await runWithCliDoor('acme astryx', () => user());
    expect(r.data.command).toBe('acme astryx');
    expect(r.data.warnings).toEqual([]);
    expect(fs.readFileSync(path.join(home, FILE), 'utf8')).toContain(
      "`acme astryx search '<what you need>'`",
    );
  });

  it('works inside a project and writes nothing in it', async () => {
    const dir = tmp('project');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      '{"name":"app","dependencies":{"@astryxdesign/core":"*"}}',
    );
    const before = fs.readdirSync(dir).sort();
    const r = await init({user: true}, {cwd: dir});
    expect(r.type).toBe('init.user');
    expect(fs.readdirSync(dir).sort()).toEqual(before);
  });

  it('records the links it made, and the release that wrote the text', async () => {
    await init({user: true});
    expect(settings()).toEqual({
      computerAgentText: {install: true, links: [path.join(home, CLAUDE)]},
    });
    expect(readGlobalState().agentText).toEqual({writtenBy: cliVersion()});
  });

  it('keeps every other setting when it records the choice', async () => {
    fs.mkdirSync(path.dirname(settingsFile()), {recursive: true});
    fs.writeFileSync(settingsFile(), '{"other": 1}');
    await init({user: true, removeAgents: true});
    expect(settings()).toEqual({
      other: 1,
      computerAgentText: {install: false, links: []},
    });
  });

  it('with removeAgents removes the file and the links it made, and records that the text is not wanted', async () => {
    await init({user: true});
    const r = await init({user: true, removeAgents: true});
    expect(r.type).toBe('init.user');
    if (r.type !== 'init.user') return;
    expect(r.data.files).toEqual([
      {path: path.join(home, FILE), action: 'removed'},
      {path: path.join(home, CLAUDE), action: 'removed'},
    ]);
    expect(r.data.warnings).toEqual([]);
    expect(fs.existsSync(path.join(home, FILE))).toBe(false);
    expect(fs.existsSync(path.join(home, CLAUDE))).toBe(false);
    expect(settings()).toEqual({
      computerAgentText: {install: false, links: []},
    });
  });

  it.each([
    [{features: 'agents'}, '--features'],
    [{all: true}, '--all'],
    [{agentDocsPath: 'X.md'}, '--agent-docs-path'],
    [{agent: 'claude'}, '--agent'],
    [{removeAgents: true, agent: 'claude'}, '--agent'],
  ])(
    'refuses %o with ERR_INVALID_ARGUMENT and writes nothing',
    async (extra, flag) => {
      await expect(init({user: true, ...extra})).rejects.toMatchObject({
        code: 'ERR_INVALID_ARGUMENT',
        message: expect.stringContaining(flag),
      });
      expect(fs.existsSync(path.join(home, '.agents'))).toBe(false);
      expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
    },
  );
});

describe('astryx init --user', () => {
  it('prints the file, the link, and the install warning in text mode', async () => {
    const r = await runCli(['init', '--user'], tmp('cwd'));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Wrote ~${path.sep}${FILE}`);
    expect(r.stdout).toContain(`Linked ~${path.sep}${CLAUDE}`);
    expect(r.stderr).toContain('npm i -g @astryxdesign/cli');
  });

  it('emits the init.user envelope under --json', async () => {
    const r = await runCli(['--json', 'init', '--user'], tmp('cwd'));
    expect(r.status).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.type).toBe('init.user');
    expect(
      env.data.files.map((/** @type {{action: string}} */ f) => f.action),
    ).toEqual(['written', 'linked']);
    expect(env.data.command).toBe('astryx');
  });

  it('names a file a person edited as kept, and why', async () => {
    await runCli(['init', '--user'], tmp('cwd'));
    const file = path.join(home, FILE);
    fs.appendFileSync(file, 'my note\n');
    const r = await runCli(['init', '--user'], tmp('cwd'));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      `Kept (edited since Astryx wrote it; delete it to get the current text): ~${path.sep}${FILE}`,
    );
    expect(fs.readFileSync(file, 'utf8')).toMatch(/my note\n$/u);
  });

  it('exits 1 with ERR_INVALID_ARGUMENT when combined with --all or --agent', async () => {
    for (const extra of [['--all'], ['--agent', 'claude']]) {
      const r = await runCli(
        ['--json', 'init', '--user', ...extra],
        tmp('cwd'),
      );
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).code).toBe('ERR_INVALID_ARGUMENT');
    }
  });
});

describe('a computer-level folder the user cannot write', () => {
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'refuses with ERR_WRITE_FAILED, the path, and what to change',
    async () => {
      const skills = path.join(home, '.agents', 'skills');
      fs.mkdirSync(skills, {recursive: true});
      fs.chmodSync(skills, 0o555);
      try {
        await expect(init({user: true}, {cwd: tmp('cwd')})).rejects.toMatchObject({
          code: 'ERR_WRITE_FAILED',
          message: expect.stringContaining('~/.agents/skills/astryx: EACCES (no permission)'),
        });
        const r = await runCli(['--json', 'init', '--user'], tmp('cli'));
        expect(r.status).toBe(1);
        expect(JSON.parse(r.stdout)).toMatchObject({code: 'ERR_WRITE_FAILED'});
        expect(r.stdout).toContain('astryx init --user');
      } finally {
        fs.chmodSync(skills, 0o755);
      }
    },
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'names the nearest folder that exists when the refused folder does not yet',
    async () => {
      const agents = path.join(home, '.agents');
      fs.mkdirSync(agents);
      fs.chmodSync(agents, 0o555);
      try {
        await expect(init({user: true}, {cwd: tmp('cwd')})).rejects.toMatchObject({
          code: 'ERR_WRITE_FAILED',
          message: expect.stringContaining('Give yourself write access to ~/.agents,'),
        });
      } finally {
        fs.chmodSync(agents, 0o755);
      }
    },
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'an old copy it cannot clear is kept, and the skill file is still written',
    async () => {
      await init({user: true}, {cwd: tmp('cwd')});
      const link = path.join(home, '.claude', 'skills', 'astryx');
      const skill = path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md');
      // An old managed copy in a folder the user cannot write.
      fs.rmSync(link);
      fs.mkdirSync(link);
      fs.copyFileSync(skill, path.join(link, 'SKILL.md'));
      fs.rmSync(skill);
      fs.chmodSync(link, 0o555);
      try {
        const res = await init({user: true}, {cwd: tmp('cwd')});
        if (res.type !== 'init.user') throw new Error(res.type);
        expect(fs.existsSync(skill)).toBe(true);
        expect(res.data.files.find(file => file.path === link)).toMatchObject({action: 'kept'});
      } finally {
        fs.chmodSync(link, 0o755);
      }
    },
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'names the skill file itself when an older one exists and cannot be written',
    async () => {
      const skill = path.join(home, '.agents', 'skills', 'astryx', 'SKILL.md');
      fs.mkdirSync(path.dirname(skill), {recursive: true});
      // An unedited file an older release wrote.
      const START = MARKER_START;
      const body = `---\nname: astryx\n---\n\n${START}\nold\n${MARKER_END}\n`;
      const hash = createHash('sha256').update(body).digest('hex');
      fs.writeFileSync(skill, body.replace(`${START}\n`, `${START}\n<!-- astryx-managed sha256:${hash} -->\n`));
      fs.chmodSync(skill, 0o444);
      try {
        await expect(init({user: true}, {cwd: tmp('cwd')})).rejects.toMatchObject({
          code: 'ERR_WRITE_FAILED',
          message: expect.stringContaining('Give yourself write access to ~/.agents/skills/astryx/SKILL.md,'),
        });
      } finally {
        fs.chmodSync(skill, 0o644);
      }
    },
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'with another place first, the message is about the computer-level text only',
    async () => {
      const skills = path.join(home, '.agents', 'skills');
      fs.mkdirSync(skills, {recursive: true});
      fs.chmodSync(skills, 0o555);
      const project = tmp('project');
      fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*'}}));
      fs.mkdirSync(path.join(project, '.git'));
      try {
        const err = await init({to: 'agents-md,user'}, {cwd: project}).catch(e => e);
        expect(err.code).toBe('ERR_WRITE_FAILED');
        expect(err.message).toContain('The computer-level agent text was not written.');
        expect(err.message).not.toContain('Nothing was written');
      } finally {
        fs.chmodSync(skills, 0o755);
      }
    },
  );

  it('names a file standing where a folder belongs, with the step that fixes it', async () => {
    fs.writeFileSync(path.join(home, '.agents'), 'not a folder\n');
    await expect(init({user: true}, {cwd: tmp('cwd')})).rejects.toMatchObject({
      code: 'ERR_WRITE_FAILED',
      message: expect.stringContaining('A file stands where a folder belongs'),
    });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a removal the skill folder refuses removes nothing, links included, and says so',
    async () => {
      await init({user: true}, {cwd: tmp('cwd')});
      const folder = path.join(home, '.agents', 'skills', 'astryx');
      const link = path.join(home, '.claude', 'skills', 'astryx');
      fs.chmodSync(folder, 0o555);
      try {
        await expect(
          init({user: true, removeAgents: true}, {cwd: tmp('cwd')}),
        ).rejects.toMatchObject({
          code: 'ERR_WRITE_FAILED',
          message: expect.stringContaining('The computer-level agent text was not removed.'),
        });
        expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      } finally {
        fs.chmodSync(folder, 0o755);
      }
    },
  );
});
