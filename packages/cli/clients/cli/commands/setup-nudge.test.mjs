// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guardrail tests — the centralized setup check + enforcement layer 3.
 *
 * Unit: isAstryxInitialized() detects the Astryx marker across EVERY agent-doc
 * location (including the previously-missed Hermes files) and legacy XDS blocks.
 *
 * Integration: the CLI reminds (stderr) after a successful command, at most
 * once a day per project, when the project hasn't run init. Quiet in --json,
 * under CI, after a failure, once set up, outside a project, and for the
 * installer command itself.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {
  isAstryxInitialized,
  isAstryxPromptInReach,
} from '../../../foundation/agent-docs/agent-docs.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

/** This source checkout: the tests run the CLI from it. */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/** Is `dir` inside a git repository? The temp folder normally is not. */
function insideRepository(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return true;
    if (path.dirname(d) === d) return false;
  }
}

const MARKER = '<!-- ASTRYX:START -->';
const NUDGE = /finish setup and install the Astryx agent prompt/;

let tmp;
/** The per-user folder that records when the reminder last printed. */
let stateHome;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-setup-nudge-'));
  stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-setup-state-'));
  vi.stubEnv('XDG_CONFIG_HOME', stateHome);
  vi.stubEnv('APPDATA', stateHome);
  vi.stubEnv('CI', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmp, {recursive: true, force: true});
  fs.rmSync(stateHome, {recursive: true, force: true});
});

/** The per-user state file the reminder records its day in. */
const stateFile = () => path.join(stateHome, 'astryx', 'state.json');

function write(rel, body) {
  const p = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, body);
}

describe('isAstryxInitialized — centralized setup check (one place)', () => {
  it('is false in an empty project', () => {
    expect(isAstryxInitialized(tmp)).toBe(false);
  });

  // Covers EVERY location a preset can write — .hermes.md/HERMES.md were the gap.
  it.each(['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.cursorrules', '.hermes.md', 'HERMES.md'])(
    'detects the marker in %s',
    file => {
      write(file, `# doc\n${MARKER}\nbody`);
      expect(isAstryxInitialized(tmp)).toBe(true);
    },
  );

  it('detects the legacy XDS marker for back-compat', () => {
    write('AGENTS.md', '<!-- XDS:START -->');
    expect(isAstryxInitialized(tmp)).toBe(true);
  });

  it('is false when a doc file exists WITHOUT the marker', () => {
    write('AGENTS.md', 'project notes, no astryx block');
    expect(isAstryxInitialized(tmp)).toBe(false);
  });
});

// Agents read the agent docs between the repository root and the folder they
// work in, so a monorepo initialized at its root is set up in every package.
describe('isAstryxPromptInReach — up to the repository root', () => {
  it('finds init\'s block at the repository root from a workspace package', () => {
    fs.mkdirSync(path.join(tmp, '.git'));
    write('AGENTS.md', MARKER);
    write('packages/app/package.json', '{"name":"app"}');
    expect(isAstryxPromptInReach(path.join(tmp, 'packages/app'))).toBe(true);
  });

  it('treats a worktree .git file as the repository root', () => {
    write('.git', 'gitdir: /elsewhere\n');
    write('CLAUDE.md', MARKER);
    write('packages/app/package.json', '{"name":"app"}');
    expect(isAstryxPromptInReach(path.join(tmp, 'packages/app'))).toBe(true);
  });

  it('does not look above the repository root', () => {
    write('AGENTS.md', MARKER);
    fs.mkdirSync(path.join(tmp, 'repo/.git'), {recursive: true});
    write('repo/pkg/package.json', '{"name":"pkg"}');
    expect(isAstryxPromptInReach(path.join(tmp, 'repo/pkg'))).toBe(false);
  });

  it.skipIf(insideRepository(os.tmpdir()))(
    'checks only the folder itself outside a repository',
    () => {
      write('AGENTS.md', MARKER);
      write('pkg/package.json', '{"name":"pkg"}');
      expect(isAstryxPromptInReach(tmp)).toBe(true);
      expect(isAstryxPromptInReach(path.join(tmp, 'pkg'))).toBe(false);
    },
  );
});

describe('enforcement layer 3 — per-command setup nudge', () => {
  const asProject = () =>
    write('package.json', '{"name":"t","dependencies":{"@astryxdesign/core":"*"}}');

  it('nudges on stderr after a command when not set up', async () => {
    asProject();
    const r = await runCli(['docs', 'tokens'], tmp);
    expect(r.stderr).toMatch(NUDGE);
  });

  it.each([
    ['in the home folder', ''],
    ['at the top of a settings folder in it', '.dotfiles'],
  ])('stays quiet %s, where init writes no agent docs', async (_label, rel) => {
    const saved = {HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE};
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    try {
      write(path.join(rel, 'package.json'), '{"name":"t"}');
      const r = await runCli(['docs', 'tokens'], path.join(tmp, rel));
      expect(r.stderr).not.toMatch(NUDGE);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("in a project with only Core of another release, names adding the CLI at Core's version first, as the daily hint does", async () => {
    write(
      'package.json',
      '{"name":"t","dependencies":{"@astryxdesign/core":"0.0.1"}}',
    );
    write(
      'node_modules/@astryxdesign/core/package.json',
      '{"name":"@astryxdesign/core","version":"0.0.1"}',
    );
    write('package-lock.json', '{}');
    const r = await runCli(['docs', 'tokens'], tmp);
    expect(r.stderr).toContain(
      'Next step: run `npm install @astryxdesign/cli@0.0.1`, then `npx astryx init` to finish setup and install the Astryx agent prompt.',
    );
  });

  it('is suppressed in --json (machine mode stays clean), stdout valid JSON', async () => {
    asProject();
    const r = await runCli(['--json', 'docs', 'tokens'], tmp);
    // --json is machine output with a clean stdout+stderr contract; the human
    // nudge must NOT leak into it (json-shim: error envelopes have empty stderr).
    expect(r.stderr).not.toMatch(NUDGE);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  // An agent that leaves `init` to its person must not see the reminder
  // before every command: once a day per project, after a command that
  // succeeds.
  it('prints once a day per project: a second command the same day prints none', async () => {
    asProject();
    const first = await runCli(['docs', 'tokens'], tmp);
    expect(first.stderr).toMatch(NUDGE);
    // After the command's own output, never before it.
    expect(first.stderr.trimEnd().endsWith('install the Astryx agent prompt.')).toBe(true);
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).not.toMatch(NUDGE);
    expect((await runCli(['component', '--list'], tmp)).stderr).not.toMatch(NUDGE);
  });

  it('prints once again the next day', async () => {
    asProject();
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).toMatch(NUDGE);
    const state = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const key = Object.keys(state.notifiedAt).find(k => k.startsWith('setup:'));
    expect(key).toBeDefined();
    state.notifiedAt[key] = Date.now() - 25 * 60 * 60 * 1000;
    fs.writeFileSync(stateFile(), JSON.stringify(state));
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).toMatch(NUDGE);
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).not.toMatch(NUDGE);
  });

  it('prints none under CI, and records nothing', async () => {
    asProject();
    vi.stubEnv('CI', 'true');
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).not.toMatch(NUDGE);
    vi.stubEnv('CI', '');
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).toMatch(NUDGE);
  });

  it('prints none after a command that fails', async () => {
    asProject();
    const r = await runCli(['component', 'NoSuchComponentAnywhere'], tmp);
    expect(r.status).not.toBe(0);
    expect(r.stderr).not.toMatch(NUDGE);
    // The day is not used up: the next command that succeeds prints it.
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).toMatch(NUDGE);
  });

  it('doctor reports the missing setup in its own check, every time', async () => {
    asProject();
    for (let i = 0; i < 2; i++) {
      const r = await runCli(['--json', 'doctor'], tmp);
      const check = JSON.parse(r.stdout).data.checks.find(
        (/** @type {any} */ c) => c.id === 'agent-docs',
      );
      expect(check.message).toMatch(/^No agent docs found/u);
      expect(check.fix).toMatch(/init --features agents/u);
    }
  });

  it('is quiet once set up (marker present)', async () => {
    asProject();
    write('AGENTS.md', MARKER);
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).not.toMatch(NUDGE);
  });

  it('is quiet outside a project (no package.json)', async () => {
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).not.toMatch(NUDGE);
  });

  it('is quiet outside a project (a package.json that declares no Astryx package)', async () => {
    write('package.json', '{"name":"t"}');
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).not.toMatch(NUDGE);
  });

  it('is quiet in an integration package, which is not an app', async () => {
    asProject();
    write('astryx.integration.mjs', 'export default {};\n');
    expect((await runCli(['docs', 'tokens'], tmp)).stderr).not.toMatch(NUDGE);
  });

  it('is quiet in a nested package once init has written the docs at the project root', async () => {
    // init run in functions/ writes at the root that declares Astryx.
    write('package.json', JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.7.0'}}));
    write('AGENTS.md', MARKER);
    write('functions/package.json', '{"name":"functions"}');
    const r = await runCli(['docs', 'tokens'], path.join(tmp, 'functions'));
    expect(r.stderr).not.toMatch(NUDGE);
  });

  it('nudges in a nested package while the project root has no docs', async () => {
    write('package.json', JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.7.0'}}));
    write('functions/package.json', '{"name":"functions"}');
    const r = await runCli(['docs', 'tokens'], path.join(tmp, 'functions'));
    expect(r.stderr).toMatch(NUDGE);
  });

  // A nested package.json that is not the project's (spec AST-040 FR9): the
  // reminder sends the person to the project's folder, never adds the CLI to
  // the nested package.json (spec AST-081 FR2).
  it("in a nested package whose package.json is not the project's, says to run from the project's folder", async () => {
    write('package.json', JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.7.0'}}));
    write('package-lock.json', '{}');
    write('functions/package.json', '{"name":"functions"}');
    const r = await runCli(['docs', 'tokens'], path.join(tmp, 'functions'));
    // Only `cd` comes first, so the app has no CLI of its own yet: the
    // command is the scoped package at the project's release, never the bare
    // `astryx` name a package runner would fetch from the registry.
    expect(r.stderr.trim()).toBe(
      `Next step: run \`cd ${tmp}\`, then \`npx @astryxdesign/cli@0.7.0 init\` to finish setup and install the Astryx agent prompt.`,
    );
  });

  // A tool folder that installs its own Core: the command runs in the
  // project's folder at the project's release, never at the Core the tool
  // installs.
  it("in a tool folder with its own Core, names the project's Core, not the tool's", async () => {
    write('package.json', JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '^0.7.0'}}));
    write('package-lock.json', '{}');
    write('node_modules/@astryxdesign/core/package.json', JSON.stringify({name: '@astryxdesign/core', version: '0.7.3'}));
    write('tools/codegen/package.json', '{"name":"codegen"}');
    write('tools/codegen/node_modules/@astryxdesign/core/package.json', JSON.stringify({name: '@astryxdesign/core', version: '0.7.4'}));
    const r = await runCli(['docs', 'tokens'], path.join(tmp, 'tools', 'codegen'));
    expect(r.stderr.trim()).toBe(
      `Next step: run \`cd ${tmp}\`, then \`npx @astryxdesign/cli@0.7.3 init\` to finish setup and install the Astryx agent prompt.`,
    );
  });

  // Inside a git repository the project-root check above adds nothing to the
  // walk up to the repository root: the same outcomes as without it.
  it('inside a repository, is quiet in a nested package once init has written the docs at the project root', async () => {
    fs.mkdirSync(path.join(tmp, '.git'));
    write('package.json', JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.7.0'}}));
    write('AGENTS.md', MARKER);
    write('functions/package.json', '{"name":"functions"}');
    const r = await runCli(['docs', 'tokens'], path.join(tmp, 'functions'));
    expect(r.stderr).not.toMatch(NUDGE);
  });

  it('inside a repository, still nudges when the only docs lie above the repository root', async () => {
    write('package.json', JSON.stringify({name: 'outer', dependencies: {'@astryxdesign/core': '0.7.0'}}));
    write('AGENTS.md', MARKER);
    fs.mkdirSync(path.join(tmp, 'repo', '.git'), {recursive: true});
    write('repo/package.json', '{"name":"repo"}');
    // It declares Astryx: a folder that declares nothing is outside a
    // project, where no reminder prints (spec AST-081 FR3).
    write(
      'repo/functions/package.json',
      JSON.stringify({name: 'functions', dependencies: {'@astryxdesign/core': '0.7.0'}}),
    );
    const r = await runCli(['docs', 'tokens'], path.join(tmp, 'repo', 'functions'));
    expect(r.stderr).toMatch(NUDGE);
  });

  it('does not nudge for the installer command itself', async () => {
    asProject();
    expect((await runCli(['init'], tmp)).stderr).not.toMatch(NUDGE);
  });

  it('is quiet in a workspace package when init\'s block is at the repository root', async () => {
    fs.mkdirSync(path.join(tmp, '.git'));
    write('AGENTS.md', MARKER);
    write('packages/app/package.json', '{"name":"app","dependencies":{"@astryxdesign/core":"*"}}');
    const r = await runCli(['docs', 'tokens'], path.join(tmp, 'packages/app'));
    expect(r.stderr).not.toMatch(NUDGE);
  });

  it('still nudges in a workspace package with no block up to the repository root', async () => {
    fs.mkdirSync(path.join(tmp, '.git'));
    write('AGENTS.md', 'project notes, no astryx block');
    write('packages/app/package.json', '{"name":"app","dependencies":{"@astryxdesign/core":"*"}}');
    const r = await runCli(['docs', 'tokens'], path.join(tmp, 'packages/app'));
    expect(r.stderr).toMatch(NUDGE);
  });

  // The tests run the CLI from this checkout, so a project inside it is the
  // contributor flow. The same project in the temp folder nudges (above).
  it('is quiet inside the source checkout the CLI runs from', async () => {
    const inside = fs.mkdtempSync(path.join(REPO, '.astryx-setup-nudge-'));
    try {
      fs.writeFileSync(path.join(inside, 'package.json'), '{"name":"t","dependencies":{"@astryxdesign/core":"*"}}');
      expect((await runCli(['docs', 'tokens'], inside)).stderr).not.toMatch(NUDGE);
    } finally {
      fs.rmSync(inside, {recursive: true, force: true});
    }
  });
});
