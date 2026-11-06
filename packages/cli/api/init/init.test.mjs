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
import * as os from 'node:os';
import * as path from 'node:path';
import {init, getNextSteps} from './init.mjs';
import {logger} from '../logger.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

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
    expect(res.data).toEqual({removed: true});
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
    expect(text).toContain('[ok] AI agent docs installed -> AGENTS.md');
    expect(text).toContain('  Next steps:');
    // The exact next-steps block the CLI prints comes from getNextSteps().
    expect(text).toContain(getNextSteps('npx astryx')[2].slice(0, 20));
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
    const outside = fs.mkdtempSync(path.join(process.cwd(), '.astryx-init-outside-'));
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
