// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Direct-API tests for init(). These call the function straight (no CLI
 * harness) against a throwaway cwd, asserting the receipt, the on-disk effects,
 * cwd honoring, silence-by-default, and the exact lines emitted through the
 * injected logger (the CLI's byte-for-byte source). Command-level behavior
 * (flag parsing, exit codes) is covered by cli/commands/init.behavior.test.mjs.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import {init, getNextSteps} from './init.mjs';
import {logger} from '../logger.mjs';
import {inspectAgentDocs} from '../../foundation/agent-docs/agent-docs.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const MARKER_START = '<!-- ASTRYX:START -->';

let tmpDir;

beforeEach(() => {
  // Outside any package: init writes agent docs at the nearest package.json.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-init-api-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(tmpDir, rel), 'utf8');

/**
 * Make tmpDir a project that declares Astryx: a folder that declares nothing
 * is outside a project, where init prints no getting-started steps (spec
 * AST-081 FR3).
 */
function asProject() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*'}}),
  );
}
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(tmpDir, rel));

function writeIntegration() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default {integrations: ['@acme/widgets']};\n`,
  );
  const packageDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(packageDir, {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets'}),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    `export default {agentDocs: {
      append: ['Run acme verify before finishing.'],
    }};\n`,
  );
}

describe('init() — receipts + side effects', () => {
  it('default mode installs AGENTS.md and returns an init.run receipt', async () => {
    asProject();
    const res = await init({}, {cwd: tmpDir});
    expect(res.type).toBe('init.run');
    if (res.type !== 'init.run') return;
    expect(res.data.mode).toBe('default');
    expect(res.data.nextSteps).toBe(true);
    expect(res.data.docsWritten).toContain('AGENTS.md');
    expect(res.data.docsError).toBeNull();
    expect(exists('AGENTS.md')).toBe(true);
    expect(read('AGENTS.md')).toContain(MARKER_START);
  });

  it('renders configured integration guidance into the real init block', async () => {
    writeIntegration();

    const res = await init({features: 'agents'}, {cwd: tmpDir});

    expect(res.type).toBe('init.run');
    if (res.type !== 'init.run') return;
    expect(res.data.docsError).toBeNull();
    const content = read('AGENTS.md');
    expect(content).toContain(
      '- `@acme/widgets`: Run acme verify before finishing.',
    );
    expect(
      content.indexOf('Run acme verify before finishing.'),
    ).toBeGreaterThan(content.indexOf('MORE CLI:'));
  });

  it('leaves existing agent docs unchanged when integration agentDocs is invalid', async () => {
    writeIntegration();
    fs.writeFileSync(
      path.join(
        tmpDir,
        'node_modules',
        '@acme',
        'widgets',
        'astryx.integration.mjs',
      ),
      `export default {agentDocs: {append: [' invalid']}};\n`,
    );
    const before = '# Agents\n\nKeep this byte-for-byte.\n';
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), before);

    const res = await init({features: 'agents'}, {cwd: tmpDir});

    expect(res.type).toBe('init.run');
    if (res.type !== 'init.run') return;
    expect(res.data.docsWritten).toEqual([]);
    expect(res.data.docsError).toMatchObject({kind: 'install-failed'});
    expect(read('AGENTS.md')).toBe(before);
  });

  it('writes to the cwd param, not process.cwd() (no chdir)', async () => {
    // Regression guard: the fixture lives in tmpDir while process.cwd() stays
    // the repo root. A cwd-honoring API must land AGENTS.md in tmpDir.
    const before = process.cwd();
    const res = await init({features: 'agents'}, {cwd: tmpDir});
    expect(process.cwd()).toBe(before);
    expect(exists('AGENTS.md')).toBe(true);
    expect(res.type === 'init.run' && res.data.docsWritten).toContain('AGENTS.md');
  });

  it('--features theme writes the annotated template and reports it on the receipt', async () => {
    const res = await init({features: 'theme'}, {cwd: tmpDir});
    expect(res.type).toBe('init.run');
    if (res.type !== 'init.run') return;
    expect(res.data.theme).toBe(true);
    expect(res.data.themeTemplate).toBe('created');
    expect(res.data.themeTemplatePath).toBe('theme.template.ts');
    expect(res.data.docsWritten).toEqual([]);
    expect(fs.readdirSync(tmpDir)).toEqual(['theme.template.ts']);
    // The consumer's copy is their file: it must not carry our repo header,
    // which their own lint would flag.
    const written = fs.readFileSync(path.join(tmpDir, 'theme.template.ts'), 'utf-8');
    expect(written).not.toMatch(/Copyright \(c\) Meta Platforms/);
    expect(written.startsWith('/**')).toBe(true);
  });

  it('--features theme reports `skipped` rather than overwriting an existing template', async () => {
    fs.writeFileSync(path.join(tmpDir, 'theme.template.ts'), '// mine\n');
    const res = await init({features: 'theme'}, {cwd: tmpDir});
    expect(res.type).toBe('init.run');
    if (res.type !== 'init.run') return;
    expect(res.data.themeTemplate).toBe('skipped');
    expect(res.data.themeTemplatePath).toBe(null);
    expect(fs.readFileSync(path.join(tmpDir, 'theme.template.ts'), 'utf-8')).toBe('// mine\n');
  });

  it('--features template returns the workflow (or skipped) outcome, no crash', async () => {
    const res = await init({features: 'template'}, {cwd: tmpDir});
    expect(res.type).toBe('init.run');
    if (res.type !== 'init.run') return;
    expect(['workflow', 'skipped']).toContain(res.data.template);
  });

  it('--all runs every feature', async () => {
    const res = await init({all: true}, {cwd: tmpDir});
    expect(res.type).toBe('init.run');
    if (res.type !== 'init.run') return;
    expect(res.data.features).toEqual(['agents', 'theme', 'template']);
    expect(exists('AGENTS.md')).toBe(true);
    expect(res.data.theme).toBe(true);
  });

  it('--agent claude targets .claude/CLAUDE.md', async () => {
    await init({agent: 'claude'}, {cwd: tmpDir});
    expect(exists('.claude/CLAUDE.md')).toBe(true);
    expect(read('.claude/CLAUDE.md')).toContain(MARKER_START);
  });

  it('--remove-agents returns an init.remove receipt and deletes the block', async () => {
    await init({features: 'agents'}, {cwd: tmpDir});
    expect(exists('AGENTS.md')).toBe(true);
    const res = await init({removeAgents: true}, {cwd: tmpDir});
    expect(res.type).toBe('init.remove');
    expect(res.data).toEqual({removed: true, from: ['agents-md'], skills: [], user: null});
    expect(exists('AGENTS.md')).toBe(false);
  });
});

describe('init() — errors', () => {
  it('throws AstryxError(ERR_UNKNOWN_FEATURE) for an invalid feature', async () => {
    await expect(init({features: 'bogus'}, {cwd: tmpDir})).rejects.toMatchObject({
      code: ERROR_CODES.ERR_UNKNOWN_FEATURE,
    });
    // Nothing written on rejection.
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it('the thrown error is an AstryxError with a helpful message', async () => {
    let caught;
    try {
      await init({features: 'nope,agents'}, {cwd: tmpDir});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AstryxError);
    expect(caught.message).toMatch(/Unknown features: nope/);
    expect(caught.message).toMatch(/agents, theme, template/);
  });
});

describe('init() — logger', () => {
  it('is silent by default (noop logger — no console output)', async () => {
    const out = [];
    const err = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => out.push(a.join(' ')));
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => err.push(a.join(' ')));
    try {
      await init({features: 'theme'}, {cwd: tmpDir});
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it('emits the install line + full next-steps through the shared logger', async () => {
    asProject();
    /** @type {string[]} */
    const lines = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')));
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => lines.push(`ERR:${a.join(' ')}`));
    logger.setSilent(false);
    try {
      await init({}, {cwd: tmpDir});
    } finally {
      logger.setSilent(true);
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
    const text = lines.join('\n');
    expect(text).toContain('[ok] AI agent docs: AGENTS.md created (Astryx ');
    expect(text).toContain('  Next steps:');
    // The exact next-steps block the CLI prints comes from getNextSteps().
    expect(text).toContain(getNextSteps('npx astryx', tmpDir)[2].slice(0, 20));
  });
});

describe('init() — ASCII output', () => {
  it('prints only ASCII on the default, all-features, re-run, template, and remove paths', async () => {
    /** @type {string[]} */
    const lines = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')));
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => lines.push(a.join(' ')));
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-init-remove-'));
    logger.setSilent(false);
    try {
      await init({}, {cwd: tmpDir});
      await init({all: true}, {cwd: tmpDir});
      await init({all: true}, {cwd: tmpDir});
      await init({features: 'template', templateName: 'blank'}, {cwd: tmpDir});
      await init({removeAgents: true}, {cwd: tmpDir});
      await init({removeAgents: true}, {cwd: empty});
    } finally {
      logger.setSilent(true);
      logSpy.mockRestore();
      errSpy.mockRestore();
      fs.rmSync(empty, {recursive: true, force: true});
    }
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some(line => line.startsWith('[ok] Removed'))).toBe(true);
    expect(lines.filter(line => /[\u0080-\uFFFF]/.test(line))).toEqual([]);
  });
});

describe('init() — write-path safety', () => {
  it('template scaffold refuses to clobber an existing page.tsx', async () => {
    const dest = path.join(tmpDir, 'src', 'pages', 'blank');
    fs.mkdirSync(dest, {recursive: true});
    fs.writeFileSync(path.join(dest, 'page.tsx'), 'MY EXISTING FILE');
    await expect(
      init({features: 'template', templateName: 'blank'}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: ERROR_CODES.ERR_FILE_EXISTS});
    // user's file is untouched
    expect(fs.readFileSync(path.join(dest, 'page.tsx'), 'utf8')).toBe('MY EXISTING FILE');
  });

  it('throws ERR_UNKNOWN_AGENT for an unknown --agent value', async () => {
    await expect(
      init({features: 'agents', agent: 'claud'}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: ERROR_CODES.ERR_UNKNOWN_AGENT});
  });

  it('rejects a traversal templateName before any write (ERR_UNKNOWN_TEMPLATE)', async () => {
    await expect(
      init({features: 'template', templateName: '../../etc/evil'}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: ERROR_CODES.ERR_UNKNOWN_TEMPLATE});
  });

  it('refuses a template write that a symlinked src would carry outside cwd (ERR_PATH_TRAVERSAL)', async () => {
    const outside = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-init-outside-'));
    try {
      fs.symlinkSync(outside, path.join(tmpDir, 'src'), 'dir');
      await expect(
        init({features: 'template', templateName: 'blank'}, {cwd: tmpDir}),
      ).rejects.toMatchObject({code: ERROR_CODES.ERR_PATH_TRAVERSAL});
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});

describe('init() — what changed in each agent-doc file', () => {
  /**
   * Run init with the logger captured.
   * @param {import('./init.type.mjs').InitOptions} options
   */
  async function runInit(options) {
    /** @type {string[]} */
    const lines = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')));
    logger.setSilent(false);
    try {
      const receipt = await init(options, {cwd: tmpDir});
      return {receipt, text: lines.join('\n')};
    } finally {
      logger.setSilent(true);
      logSpy.mockRestore();
    }
  }
  const agentsOnly = {features: 'agents', agentDocsPath: ['AGENTS.md']};

  it('says a new file was added, then that a second run changed nothing', async () => {
    asProject();
    const first = await runInit(agentsOnly);
    const [added] = first.receipt.data.docsChanges;
    expect(added).toMatchObject({path: 'AGENTS.md', change: 'created', from: null});
    expect(added.to).toMatch(/^\d+\.\d+\.\d+/);
    expect(first.text).toContain(`[ok] AI agent docs: AGENTS.md created (Astryx ${added.to})`);

    const second = await runInit(agentsOnly);
    expect(second.receipt.data.docsChanges).toEqual([
      {path: 'AGENTS.md', change: 'unchanged', from: added.to, to: added.to},
    ]);
    expect(second.text).toContain(
      `[ok] AI agent docs: AGENTS.md already current (Astryx ${added.to}), nothing changed`,
    );
  });

  it('names the old and new version when it refreshes an older block', async () => {
    asProject();
    const {receipt} = await runInit(agentsOnly);
    const current = receipt.data.docsChanges[0].to;
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      read('AGENTS.md').replace(`Astryx v${current}`, 'Astryx v0.0.1'),
    );
    const refresh = await runInit(agentsOnly);
    expect(refresh.receipt.data.docsChanges).toEqual([
      {path: 'AGENTS.md', change: 'updated', from: '0.0.1', to: current},
    ]);
    expect(refresh.text).toContain(`[ok] AI agent docs: AGENTS.md updated (Astryx 0.0.1 -> ${current})`);
  });

  it('reports an import of AGENTS.md without a version', async () => {
    asProject();
    const {receipt} = await runInit({});
    const gemini = receipt.data.docsChanges.find(c => c.path === 'GEMINI.md');
    expect(gemini).toEqual({path: 'GEMINI.md', change: 'created', from: null, to: null});
  });

  it('reads the version from the block, not from a version the project text mentions', async () => {
    asProject();
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# AGENTS.md\n\nWe moved from Astryx v0.6.0 last quarter.\n',
    );
    const first = await runInit(agentsOnly);
    const [change] = first.receipt.data.docsChanges;
    expect(change).toMatchObject({path: 'AGENTS.md', change: 'updated', from: null});
    expect(change.to).not.toBe('0.6.0');
    const second = await runInit(agentsOnly);
    expect(second.receipt.data.docsChanges).toEqual([
      {path: 'AGENTS.md', change: 'unchanged', from: change.to, to: change.to},
    ]);
    expect(second.text).toContain(`AGENTS.md already current (Astryx ${change.to}), nothing changed`);
    // upgrade's staleness check reads the block the same way.
    expect(inspectAgentDocs(tmpDir, change.to).status).toBe('current');
  });

  it('says a block was removed when another Claude Code file now holds it', async () => {
    asProject();
    execFileSync('git', ['init', '-q'], {cwd: tmpDir});
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), '');
    await runInit({});
    expect(read('.claude/CLAUDE.md')).toContain(MARKER_START);
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# CLAUDE.md\n');
    const {receipt, text} = await runInit({});
    const removed = receipt.data.docsChanges.find(c => c.path === '.claude/CLAUDE.md');
    expect(removed).toMatchObject({change: 'removed', to: null});
    expect(text).toContain('[ok] AI agent docs: .claude/CLAUDE.md: Astryx block removed, another agent file holds it');
  });

  it('names each file from the project root, even when init runs below it', async () => {
    asProject();
    const sub = path.join(tmpDir, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});
    const receipt = await init({}, {cwd: sub});
    expect(receipt.data.docsWritten).toContain('../../AGENTS.md');
    const paths = receipt.data.docsChanges.map(c => c.path);
    expect(paths).toContain('AGENTS.md');
    expect(paths.every(p => !path.isAbsolute(p) && !p.startsWith('..'))).toBe(true);
  });

  it('names an --agent-docs-path file from the project root when init runs below it', async () => {
    asProject();
    const sub = path.join(tmpDir, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});
    const receipt = await init({features: 'agents', agentDocsPath: ['NOTES.md']}, {cwd: sub});
    expect(receipt.data.docsWritten).toEqual(['NOTES.md']);
    expect(receipt.data.docsChanges.map(c => c.path)).toEqual(['src/app/NOTES.md']);
  });

  it('keeps every field of the earlier receipt, with the same values', async () => {
    asProject();
    const {receipt} = await runInit(agentsOnly);
    expect(receipt.type).toBe('init.run');
    expect(receipt.data).toMatchObject({
      mode: 'features',
      features: ['agents'],
      docsWritten: ['AGENTS.md'],
      docsError: null,
      theme: false,
      themeTemplate: null,
      themeTemplatePath: null,
      template: null,
      templatePath: null,
      nextSteps: false,
    });
    // New fields are only added: docsChanges, which lines up with
    // docsWritten, agentDocsStatus, and the skill places (to, skills, user).
    expect(Object.keys(receipt.data).sort()).toEqual(
      [
        'mode', 'features', 'docsWritten', 'agentDocsStatus', 'docsChanges', 'docsError', 'theme',
        'themeTemplate', 'themeTemplatePath', 'template', 'templatePath', 'nextSteps',
        'to', 'once', 'skills', 'user',
      ].sort(),
    );
    expect(receipt.data).toMatchObject({to: ['agents-md'], once: false, skills: [], user: null});
    expect(receipt.data.docsChanges.map(c => c.path)).toEqual(receipt.data.docsWritten);
  });
});

describe('init() — an app that is already set up', () => {
  it('prints the build and search commands on a re-run, not the install steps', async () => {
    asProject();
    await init({}, {cwd: tmpDir});
    /** @type {string[]} */
    const lines = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')));
    logger.setSilent(false);
    let receipt;
    try {
      receipt = await init({}, {cwd: tmpDir});
    } finally {
      logger.setSilent(true);
      logSpy.mockRestore();
    }
    const text = lines.join('\n');
    expect(receipt.data.nextSteps).toBe(false);
    expect(receipt.data.agentDocsStatus).toBe('current');
    expect(text).toContain('Astryx is already set up here. To build UI:');
    expect(text).not.toContain('Next steps:');
  });

  it('refreshes an outdated block and still prints the install steps', async () => {
    asProject();
    await init({}, {cwd: tmpDir});
    const agents = read('AGENTS.md');
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), agents.replace(/Astryx v\S+/u, 'Astryx v0.0.1'));
    const receipt = await init({}, {cwd: tmpDir});
    expect(receipt.data.agentDocsStatus).toBe('stale');
    expect(receipt.data.nextSteps).toBe(true);
    expect(read('AGENTS.md')).not.toContain('Astryx v0.0.1');
  });

  it('runs explicit features in a set-up app as before', async () => {
    asProject();
    await init({}, {cwd: tmpDir});
    const receipt = await init({features: 'agents'}, {cwd: tmpDir});
    expect(receipt.data.mode).toBe('features');
    expect(receipt.data.agentDocsStatus).toBe('current');
    expect(receipt.data.nextSteps).toBe(false);
  });

  it('judges --agent-docs-path runs by the files they name', async () => {
    asProject();
    await init({}, {cwd: tmpDir});
    // AGENTS.md is current, but AI.md does not exist yet.
    const first = await init({agentDocsPath: ['AI.md']}, {cwd: tmpDir});
    expect(first.data.agentDocsStatus).toBe('missing');
    expect(first.data.nextSteps).toBe(true);
    const again = await init({agentDocsPath: ['AI.md']}, {cwd: tmpDir});
    expect(again.data.agentDocsStatus).toBe('current');
    expect(again.data.nextSteps).toBe(false);
  });

  it("judges an --agent run by the preset's own files", async () => {
    asProject();
    await init({}, {cwd: tmpDir});
    await init({agent: 'claude'}, {cwd: tmpDir});
    // A stale file the claude preset never writes does not matter to it.
    fs.writeFileSync(
      path.join(tmpDir, '.cursorrules'),
      read('AGENTS.md').replace(/Astryx v\S+/u, 'Astryx v0.0.1'),
    );
    const first = await init({agent: 'claude'}, {cwd: tmpDir});
    expect(first.data.agentDocsStatus).toBe('current');
    expect(first.data.nextSteps).toBe(false);
    // The cursor preset writes .cursorrules, which is stale.
    const cursor = await init({agent: 'cursor'}, {cwd: tmpDir});
    expect(cursor.data.agentDocsStatus).toBe('stale');
    expect(cursor.data.nextSteps).toBe(true);
    const again = await init({agent: 'cursor'}, {cwd: tmpDir});
    expect(again.data.agentDocsStatus).toBe('current');
    expect(again.data.nextSteps).toBe(false);
  });

  it('says a claude run that creates its file is not set up yet', async () => {
    asProject();
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# AGENTS.md\n');
    const first = await init({agent: 'claude'}, {cwd: tmpDir});
    expect(first.data.agentDocsStatus).toBe('missing');
    expect(first.data.nextSteps).toBe(true);
  });

  it('reports no status when the write fails', async () => {
    asProject();
    await init({}, {cwd: tmpDir});
    const failed = await init({agentDocsPath: ['../outside.md']}, {cwd: tmpDir});
    expect(failed.data.docsError?.kind).toBe('path-safety');
    expect(failed.data.agentDocsStatus).toBeNull();
    expect(failed.data.nextSteps).toBe(true);
  });

  it('still prints the install steps the first time', async () => {
    asProject();
    const receipt = await init({}, {cwd: tmpDir});
    expect(receipt.data.nextSteps).toBe(true);
    expect(receipt.data.agentDocsStatus).toBe('missing');
  });
});
