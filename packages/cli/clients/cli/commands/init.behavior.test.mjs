// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Behavior coverage for `astryx init`.
 *
 * init.next-steps.test.mjs covers the pure getNextSteps() copy; this file
 * covers what the COMMAND actually does — the file writes, feature flags,
 * agent presets, idempotency, and error exits — by driving the real program
 * in-process (test-utils/run-cli.mjs) against a throwaway cwd. init reads
 * process.cwd(), which the harness sets to the temp dir per run.
 *
 * These lock the non-interactive contract: `astryx init` never prompts, is
 * safe to re-run, writes the tool-agnostic AGENTS.md by default, and fails
 * loudly (non-zero) only on bad input.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';

const MARKER_START = '<!-- ASTRYX:START -->';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-init-behavior-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(tmpDir, rel), 'utf8');
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(tmpDir, rel));

describe('astryx init — default (no flags)', () => {
  it('installs the tool-agnostic AGENTS.md cheat sheet and prints next steps', async () => {
    // Inside a project; outside one the steps are left out (outside-project.test.mjs).
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      '{"name":"app","dependencies":{"@astryxdesign/core":"*"}}',
    );
    const {status, stdout} = await runCli(['init'], {cwd: tmpDir});
    expect(status).toBe(0);
    expect(exists('AGENTS.md')).toBe(true);
    expect(read('AGENTS.md')).toContain(MARKER_START);
    // The non-interactive default always emits the getting-started guidance.
    expect(stdout).toMatch(/Next steps:/);
  });

  it('is non-interactive: exits cleanly with no TTY and no prompt text', async () => {
    const {status, stdout, stderr} = await runCli(['init'], {cwd: tmpDir});
    expect(status).toBe(0);
    // A prompt would ask a question; the non-interactive contract forbids it.
    expect(stdout).not.toMatch(/\?\s*$/m);
    expect(stderr).not.toMatch(/prompt|inquirer/i);
  });

  it('is idempotent: re-running keeps a single Astryx block (no duplication)', async () => {
    await runCli(['init'], {cwd: tmpDir});
    await runCli(['init'], {cwd: tmpDir});
    const contents = read('AGENTS.md');
    const blocks = contents.split(MARKER_START).length - 1;
    expect(blocks).toBe(1);
  });
});

describe('astryx init --features', () => {
  it('--features agents writes AGENTS.md and the GEMINI.md import of it', async () => {
    const {status} = await runCli(['init', '--features', 'agents'], {cwd: tmpDir});
    expect(status).toBe(0);
    expect(exists('AGENTS.md')).toBe(true);
    expect(read('GEMINI.md')).toBe(`${MARKER_START}\n@./AGENTS.md\n<!-- ASTRYX:END -->\n`);
    expect(exists('theme.template.ts')).toBe(false);
  });

  it('--features theme writes the annotated theme template', async () => {
    const {status, stdout} = await runCli(['init', '--features', 'theme'], {cwd: tmpDir});
    expect(status).toBe(0);
    expect(exists('theme.template.ts')).toBe(true);
    expect(read('theme.template.ts')).toMatch(/defineTheme/);
    expect(read('theme.template.ts')).not.toMatch(/Copyright \(c\) Meta Platforms/);
    expect(stdout).toMatch(/theme/i);
  });

  it('--features theme never clobbers an existing theme.template.ts', async () => {
    // Someone's edited copy outranks ours; re-running init must be safe.
    fs.writeFileSync(path.join(tmpDir, 'theme.template.ts'), '// mine\n');
    const {status, stdout} = await runCli(['init', '--features', 'theme'], {cwd: tmpDir});
    expect(status).toBe(0);
    expect(read('theme.template.ts')).toBe('// mine\n');
    expect(stdout).toMatch(/already exists/);
  });

  it('rejects an unknown feature with exit 1 and a helpful message', async () => {
    const {status, stderr} = await runCli(['init', '--features', 'bogus'], {cwd: tmpDir});
    expect(status).toBe(1);
    expect(stderr).toMatch(/Unknown features: bogus/);
    expect(stderr).toMatch(/agents, theme, template/);
    // A rejected run must not have written anything.
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it('--all installs every feature (AGENTS.md present, exit 0)', async () => {
    const {status} = await runCli(['init', '--all'], {cwd: tmpDir});
    expect(status).toBe(0);
    expect(exists('AGENTS.md')).toBe(true);
  });
});

describe('astryx init --agent <preset>', () => {
  it('--agent claude targets .claude/CLAUDE.md', async () => {
    const {status} = await runCli(['init', '--agent', 'claude'], {cwd: tmpDir});
    expect(status).toBe(0);
    expect(exists('.claude/CLAUDE.md')).toBe(true);
    expect(read('.claude/CLAUDE.md')).toContain(MARKER_START);
  });

  it('--agent all creates both the AGENTS.md and Claude defaults', async () => {
    const {status} = await runCli(['init', '--agent', 'all'], {cwd: tmpDir});
    expect(status).toBe(0);
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('.claude/CLAUDE.md')).toBe(true);
  });
});

describe('astryx init from a subfolder', () => {
  /** @param {string} dir */
  const astryxProject = dir =>
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.7.0'}}),
    );

  it('writes the agent docs at the project root and reports them from where it ran', async () => {
    astryxProject(tmpDir);
    const sub = path.join(tmpDir, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});

    const json = await runCli(['init', '--json'], {cwd: sub});
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout).data.docsWritten).toEqual([
      '../../AGENTS.md',
      '../../GEMINI.md',
    ]);
    expect(read('AGENTS.md')).toContain(MARKER_START);
    expect(fs.readdirSync(sub)).toEqual([]);
  });

  it('keeps --agent-docs-path relative to where it ran', async () => {
    astryxProject(tmpDir);
    const sub = path.join(tmpDir, 'docs');
    fs.mkdirSync(sub);

    const json = await runCli(['init', '--agent-docs-path', 'AI.md', '--json'], {cwd: sub});
    expect(JSON.parse(json.stdout).data.docsWritten).toEqual(['AI.md']);
    expect(fs.readFileSync(path.join(sub, 'AI.md'), 'utf8')).toContain(MARKER_START);
    expect(exists('AGENTS.md')).toBe(false);
  });
});

describe('astryx init in the home folder', () => {
  const saved = {HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE};
  const personal = '# My notes\n\nAlways use tabs.\n';

  beforeEach(() => {
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.claude'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), personal);
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('writes no agent docs, says why, and keeps the soft-failure exit code', async () => {
    const json = await runCli(['init', '--json'], {cwd: tmpDir});
    expect(json.status).toBe(0);
    const env = JSON.parse(json.stdout);
    expect(env.data.docsWritten).toEqual([]);
    expect(env.data.docsError).toEqual({
      kind: 'install-failed',
      message: expect.stringMatching(/not written into the home folder/),
    });

    const text = await runCli(['init'], {cwd: tmpDir});
    expect(text.status).toBe(0);
    expect(text.stderr).toMatch(/not written into the home folder/);
    expect(text.stderr).not.toMatch(/Error:/);

    expect(read('.claude/CLAUDE.md')).toBe(personal);
    expect(fs.readdirSync(tmpDir)).toEqual(['.claude']);
  });

  it('does not let a package.json in the home folder pull the docs there', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({dependencies: {'@astryxdesign/core': '0.7.0'}}),
    );
    const scratch = path.join(tmpDir, 'scratch');
    fs.mkdirSync(scratch);

    const json = await runCli(['init', '--json'], {cwd: scratch});
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout).data.docsWritten).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.existsSync(path.join(scratch, 'AGENTS.md'))).toBe(true);
    expect(exists('AGENTS.md')).toBe(false);
    expect(read('.claude/CLAUDE.md')).toBe(personal);
  });

  it('--remove-agents in a folder in home never reaches the home folder', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'CLAUDE.md'),
      `${personal}\n<!-- ASTRYX:START -->\nAstryx v0.7.0\n<!-- ASTRYX:END -->\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({dependencies: {'@astryxdesign/core': '0.7.0'}}),
    );
    const scratch = path.join(tmpDir, 'scratch');
    fs.mkdirSync(scratch);

    const json = await runCli(['init', '--remove-agents', '--json'], {cwd: scratch});
    expect(JSON.parse(json.stdout).data.removed).toBe(false);
    expect(read('.claude/CLAUDE.md')).toContain('<!-- ASTRYX:START -->');

    // Run in the home folder itself, it still removes the block there.
    const home = await runCli(['init', '--remove-agents', '--json'], {cwd: tmpDir});
    expect(JSON.parse(home.stdout).data.removed).toBe(true);
    expect(read('.claude/CLAUDE.md')).toBe(personal);
  });

  it.each(['.gemini', '.claude'])('refuses the settings folder ~/%s', async folder => {
    const dir = path.join(tmpDir, folder);
    fs.mkdirSync(dir, {recursive: true});
    const before = fs.readdirSync(dir);

    const json = await runCli(['init', '--json'], {cwd: dir});
    expect(json.status).toBe(0);
    const env = JSON.parse(json.stdout);
    expect(env.data.docsWritten).toEqual([]);
    expect(env.data.docsError.message).toMatch(/settings folder in it outside a project/);
    expect(fs.readdirSync(dir)).toEqual(before);
    expect(read('.claude/CLAUDE.md')).toBe(personal);
  });
});

describe('astryx init in an agent worktree inside a home settings folder', () => {
  const saved = {HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE};

  beforeEach(() => {
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it.each([
    ['Codex', path.join('.codex', 'worktrees', 'a1b2c3', 'web')],
    ['Cursor', path.join('.cursor', 'worktrees', 'web', 'x9y8')],
  ])('writes at the project root of a %s worktree', async (_tool, rel) => {
    const project = path.join(tmpDir, rel);
    fs.mkdirSync(path.join(project, 'src'), {recursive: true});
    fs.writeFileSync(path.join(project, '.git'), 'gitdir: /elsewhere/.git/worktrees/web\n');
    fs.writeFileSync(
      path.join(project, 'package.json'),
      JSON.stringify({name: 'web', dependencies: {'@astryxdesign/core': '0.7.0'}}),
    );

    const json = await runCli(['init', '--json'], {cwd: path.join(project, 'src')});
    expect(json.status).toBe(0);
    const env = JSON.parse(json.stdout);
    expect(env.data.docsWritten).toEqual(['../AGENTS.md', '../GEMINI.md']);
    expect(env.data.docsError).toBeNull();

    const explicit = await runCli(['init', '--agent-docs-path', 'AI.md', '--json'], {
      cwd: path.join(project, 'src'),
    });
    expect(JSON.parse(explicit.stdout).data.docsWritten).toEqual(['AI.md']);

    // Nothing reaches the settings folder itself.
    const settings = path.join(tmpDir, rel.split(path.sep)[0]);
    expect(fs.readdirSync(settings)).toEqual(['worktrees']);
  });
});

describe('astryx init and the project root', () => {
  it('writes where it runs when no folder above has a package.json, as before', async () => {
    const notes = path.join(tmpDir, 'notes');
    fs.mkdirSync(notes);

    const json = await runCli(['init', '--json'], {cwd: notes});
    expect(json.status).toBe(0);
    const env = JSON.parse(json.stdout);
    expect(env.data.docsWritten).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(env.data.docsError).toBeNull();
    expect(fs.readdirSync(notes).sort()).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.readdirSync(tmpDir)).toEqual(['notes']);
  });

  it('writes at the project root that declares Astryx, past a nested package that does not', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.7.0'}}),
    );
    const functions = path.join(tmpDir, 'functions');
    fs.mkdirSync(path.join(functions, 'src'), {recursive: true});
    fs.writeFileSync(path.join(functions, 'package.json'), '{"name":"functions"}\n');

    const json = await runCli(['init', '--json'], {cwd: path.join(functions, 'src')});
    expect(JSON.parse(json.stdout).data.docsWritten).toEqual([
      '../../AGENTS.md',
      '../../GEMINI.md',
    ]);
    expect(fs.readdirSync(functions).sort()).toEqual(['package.json', 'src']);
  });
});

describe('astryx init --remove-agents', () => {
  it('run in a subfolder, removes what init wrote at the project root, with the same JSON shape', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.7.0'}}),
    );
    const sub = path.join(tmpDir, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});
    await runCli(['init'], {cwd: sub});
    expect(exists('AGENTS.md')).toBe(true);

    const text = await runCli(['init', '--remove-agents'], {cwd: sub});
    expect(text.status).toBe(0);
    expect(text.stdout).toMatch(/Removed empty \.\.\/\.\.\/AGENTS\.md/);
    expect(exists('AGENTS.md')).toBe(false);
    expect(exists('GEMINI.md')).toBe(false);

    await runCli(['init'], {cwd: sub});
    const json = await runCli(['init', '--remove-agents', '--json'], {cwd: sub});
    expect(json.status).toBe(0);
    // meta.answeredBy names the release that answered (spec AST-081).
    expect(JSON.parse(json.stdout)).toEqual({
      apiVersion: 1,
      type: 'init.remove',
      data: {removed: true},
      meta: {answeredBy: expect.any(Object)},
    });
  });

  it('removes the Astryx section it previously installed', async () => {
    await runCli(['init', '--features', 'agents'], {cwd: tmpDir});
    expect(exists('AGENTS.md')).toBe(true);

    const {status, stdout} = await runCli(['init', '--remove-agents'], {cwd: tmpDir});
    expect(status).toBe(0);
    expect(stdout).toMatch(/removed/i);
    // AGENTS.md was created solely by us and is now empty → deleted.
    expect(exists('AGENTS.md')).toBe(false);
  });
});

describe('astryx init --json', () => {
  it('emits the install receipt as an envelope', async () => {
    const {status, stdout} = await runCli(['init', '--json'], {cwd: tmpDir});
    expect(status).toBe(0);

    const env = JSON.parse(stdout);
    expect(env.type).toBe('init.run');
    expect(env.data.mode).toBe('default');
    expect(env.data.docsWritten).toContain('AGENTS.md');
    expect(env.data.docsError).toBe(null);
  });

  it('still does the work', async () => {
    await runCli(['init', '--json'], {cwd: tmpDir});
    expect(exists('AGENTS.md')).toBe(true);
    expect(read('AGENTS.md')).toContain(MARKER_START);
  });

  it('keeps stdout a single envelope — no guidance text leaks in', async () => {
    const {stdout} = await runCli(['init', '--json'], {cwd: tmpDir});
    // The human path prints a "Next steps:" block; under --json the whole of
    // stdout has to parse, so any of it leaking would fail here.
    expect(() => JSON.parse(stdout)).not.toThrow();
    expect(stdout).not.toMatch(/Next steps:/);
  });

  it('reports the features it ran with --all', async () => {
    const {stdout} = await runCli(['init', '--all', '--json'], {cwd: tmpDir});
    const env = JSON.parse(stdout);
    expect(env.data.mode).toBe('features');
    expect(env.data.features).toEqual(
      expect.arrayContaining(['agents', 'theme']),
    );
  });

  it('emits init.remove for --remove-agents', async () => {
    await runCli(['init'], {cwd: tmpDir});
    const {stdout} = await runCli(['init', '--remove-agents', '--json'], {
      cwd: tmpDir,
    });
    const env = JSON.parse(stdout);
    expect(env.type).toBe('init.remove');
    expect(env.data.removed).toBe(true);
  });

  it('reports a bad --agent as an error envelope, not a receipt', async () => {
    const {status, stdout} = await runCli(
      ['init', '--agent', 'bogus', '--json'],
      {cwd: tmpDir},
    );
    expect(status).toBe(1);
    const env = JSON.parse(stdout);
    expect(env.code).toBe('ERR_UNKNOWN_AGENT');
    expect(env.type).toBeUndefined();
  });

  it('agrees with human mode on the exit code', async () => {
    const human = await runCli(['init', '--agent', 'bogus'], {cwd: tmpDir});
    const json = await runCli(['init', '--agent', 'bogus', '--json'], {
      cwd: tmpDir,
    });
    expect(json.status).toBe(human.status);
  });
});
