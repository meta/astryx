// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {Command} from 'commander';
import {registerUpgrade} from './upgrade.mjs';
import {
  generateCompressedIndex,
  renderAgentDocsBlock,
} from '../../../foundation/agent-docs/agent-docs.mjs';

let tmpDir;
let originalCwd;
let logCalls;
let stdoutCalls;
let exitCode;
let previousProcessExitCode;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-upgrade-test-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  logCalls = [];
  stdoutCalls = [];
  exitCode = undefined;
  previousProcessExitCode = process.exitCode;
  process.exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logCalls.push(args.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Some human logs are written straight to process.stdout — capture that too.
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutCalls.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  });
  // jsonError() calls process.exit(1) directly. Trap it so tests can assert.
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    exitCode = code;
    throw new Error(`__exit ${code}`);
  });
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
  process.exitCode = previousProcessExitCode;
  vi.restoreAllMocks();
});

function createProgram() {
  const program = new Command();
  program.exitOverride();
  // Mirror the global --json flag from src/index.mjs so program.opts().json
  // resolves the same way in tests.
  program.option('--json', 'Output as typed JSON');
  registerUpgrade(program);
  return program;
}

function writePkg(deps = {}) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'fixture', dependencies: deps}, null, 2),
  );
}

function writeInstalledCore(version, packageName = '@astryxdesign/core') {
  const parts = packageName.split('/');
  const dir = path.join(tmpDir, 'node_modules', ...parts);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: packageName, version}, null, 2),
  );
}

function writeSourceFile() {
  fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
  fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'const x = 1;\n');
}

/** Run a command and capture the parsed JSON response (last printed JSON line). */
async function runJson(args) {
  const program = createProgram();
  try {
    await program.parseAsync(['node', 'astryx', ...args]);
  } catch (err) {
    if (!String(err?.message || '').startsWith('__exit')) throw err;
  }
  // Find the most recent stringified JSON envelope in console.log output.
  for (let i = logCalls.length - 1; i >= 0; i--) {
    const line = logCalls[i];
    if (line.startsWith('{')) {
      try {
        return JSON.parse(line);
      } catch {
        // not JSON, keep looking
      }
    }
  }
  return null;
}

describe('upgrade gate (semver comparison)', () => {
  it('does NOT block an upgrade from 0.0.9 to installed 0.0.10 (regression)', async () => {
    // The original bug: string compare said '0.0.9' >= '0.0.10', so the
    // gate told users "Already up to date" without --force.
    writePkg();
    writeInstalledCore('0.0.10');
    writeSourceFile();

    const result = await runJson(['--json', 'upgrade', '--from', '0.0.9', '--path', 'src']);
    expect(result).not.toBeNull();
    expect(result.type === 'upgrade.run' || result.error || logCalls.some(l => l.includes('No codemods'))).toBeTruthy();
  });

  it('blocks when --from >= installed target by semver (e.g. 0.0.10 → 0.0.9)', async () => {
    writePkg();
    writeInstalledCore('0.0.9');
    const program = createProgram();
    await program.parseAsync(['node', 'astryx', 'upgrade', '--from', '0.0.10']);
    const output = stdoutCalls.join('') + logCalls.join('\n');
    expect(output).toMatch(/up to date|Already/i);
  });
});

describe('upgrade argument validation', () => {
  it('requires --from for upgrade runs', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    const result = await runJson(['--json', 'upgrade']);
    expect(result).not.toBeNull();
    expect(result.error).toMatch(/Missing required --from/);
    expect(exitCode).toBe(1);
  });

  it('allows receipt-only upgrades without --from', async () => {
    writeSourceFile();
    const result = await runJson([
      '--json',
      'upgrade',
      '--registry',
      '--path',
      'src',
    ]);

    expect(result).toMatchObject({
      type: 'upgrade.registry',
      data: {found: 0, applied: false},
    });
    expect(exitCode).toBeUndefined();
  });

  it('exits 1 while preserving the receipt for unresolved registry items', async () => {
    writeInstalledCore('0.6.0');
    fs.mkdirSync(path.join(tmpDir, 'src', '.astryx'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'src', '.astryx', 'broken.json'), '{}');

    const result = await runJson([
      '--json',
      'upgrade',
      '--registry',
      '--path',
      'src',
    ]);

    expect(result).toMatchObject({
      type: 'upgrade.registry',
      data: {ok: false, invalid: 1},
    });
    expect(process.exitCode).toBe(1);
  });

  it('rejects bogus --from values', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    const result = await runJson(['--json', 'upgrade', '--from', 'not-a-version']);
    expect(result).not.toBeNull();
    expect(result.error).toMatch(/Invalid --from/);
    expect(exitCode).toBe(1);
  });

  it('detects the installed target version from @astryxdesign/core', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    writeSourceFile();
    const result = await runJson(['--json', 'upgrade', '--from', '0.0.14', '--path', 'src']);
    expect(result?.error || '').not.toMatch(/Could not find installed/);
  });
});

describe('upgrade --list dedup', () => {
  it('lists each codemod exactly once', async () => {
    const result = await runJson(['--json', 'upgrade', '--list']);
    expect(result).not.toBeNull();
    expect(result.type).toBe('upgrade.list');
    const names = result.data.map((c) => c.name);
    const unique = new Set(names);
    // The bug: 31 unique codemods printed 9× → 201 entries.
    expect(names.length).toBe(unique.size);
  });
});

// Issue #4168 — `upgrade` must refresh the managed agent-docs block after a
// version bump, on EVERY path (the block documents the installed library, not
// the codemod outcome), and must NOT write during a dry run.
describe('upgrade agent-docs refresh (#4168)', () => {
  /** Write an agent-doc file with a managed block generated for `version`. */
  function writeAgentBlock(rel, version) {
    const filePath = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, `# Doc\n\n${generateCompressedIndex(version)}\n`);
  }

  it('refreshes a stale block with --apply, even when there are no codemods (up-to-date path)', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    writeAgentBlock('AGENTS.md', '0.0.1');

    // --from == installed → up-to-date short-circuit: no codemods run, yet the
    // stale block must still be brought current. This is the exact gap in #4168.
    const result = await runJson(['--json', 'upgrade', '--from', '0.0.15', '--apply']);

    expect(result.type).toBe('upgrade.status');
    expect(result.data.status).toBe('up_to_date');
    expect(result.data.agentDocs.status).toBe('stale');
    expect(result.data.agentDocs.action).toBe('refreshed');
    expect(result.data.agentDocs.refreshed).toBe(true);
    expect(result.data.agentDocs.fromVersions).toEqual(['0.0.1']);
    expect(result.data.agentDocs.files).toContain('AGENTS.md');

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toMatch(/Astryx v0\.0\.15 ·/);
    expect(content).not.toMatch(/Astryx v0\.0\.1 ·/);
  });

  it('reports a stale block on a dry run WITHOUT writing', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    writeAgentBlock('AGENTS.md', '0.0.1');
    const before = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');

    const result = await runJson(['--json', 'upgrade', '--from', '0.0.15']); // no --apply

    expect(result.data.agentDocs.status).toBe('stale');
    expect(result.data.agentDocs.action).toBe('would-refresh');
    expect(result.data.agentDocs.refreshed).toBe(false);
    // The file must be untouched by a dry run.
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(before);
  });

  it('refreshes a stale block on the no-codemods path (--apply)', async () => {
    writePkg();
    writeInstalledCore('0.0.11'); // (0.0.10, 0.0.11] has no registered codemods
    writeSourceFile();
    writeAgentBlock('CLAUDE.md', '0.0.1');

    const result = await runJson(['--json', 'upgrade', '--from', '0.0.10', '--apply', '--path', 'src']);

    expect(result.type).toBe('upgrade.status');
    expect(result.data.status).toBe('no_codemods');
    expect(result.data.agentDocs.refreshed).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')).toMatch(/Astryx v0\.0\.11 ·/);
  });

  it('nudges to run init when core is installed but no managed block exists', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    // No agent-doc files at all.

    const result = await runJson(['--json', 'upgrade', '--from', '0.0.15', '--apply']);

    expect(result.data.agentDocs.status).toBe('missing');
    expect(result.data.agentDocs.action).toBe('nudge-init');
    expect(result.data.agentDocs.refreshed).toBe(false);
    // Must NOT silently create docs during an upgrade.
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'CLAUDE.md'))).toBe(false);
  });

  it('treats an agent file without our markers as "never initialized" (missing)', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n\nHand-written, no astryx block.\n');
    const before = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');

    const result = await runJson(['--json', 'upgrade', '--from', '0.0.15', '--apply']);

    expect(result.data.agentDocs.status).toBe('missing');
    expect(result.data.agentDocs.action).toBe('nudge-init');
    // An unmarked file is left exactly as-is.
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(before);
  });

  it('does not silently no-op a stale block with malformed markers (START without END)', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    // A corrupted block: START + version header but no matching END marker, so
    // the writer can't safely splice it. This must not crash, corrupt the file,
    // or falsely claim success — it should surface an error and nudge re-init.
    const corrupted =
      '# A\n\n<!-- ASTRYX:START -->\nAstryx v0.0.1 · 9 components\nguidance, but no end marker\n';
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), corrupted);

    const result = await runJson(['--json', 'upgrade', '--from', '0.0.15', '--apply']);

    expect(result.data.agentDocs.status).toBe('stale');
    expect(result.data.agentDocs.action).toBe('error');
    expect(result.data.agentDocs.refreshed).toBe(false);
    // File left byte-for-byte intact — never corrupted.
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(corrupted);
  });

  it('stays silent when the block matches the fully rendered project state', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    const expected = await renderAgentDocsBlock(tmpDir, {
      installedVersion: '0.0.15',
    });
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `# Doc\n\n${expected}\n`);

    const result = await runJson(['--json', 'upgrade', '--from', '0.0.15', '--apply']);

    expect(result.data.agentDocs.status).toBe('current');
    expect(result.data.agentDocs.action).toBe('none');
    expect(result.data.agentDocs.refreshed).toBe(false);
  });

  it('migrates a legacy XDS block to the current Astryx block (--apply)', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      '# Claude\n\n<!-- XDS:START -->\nlegacy index\n<!-- XDS:END -->\n\nMore rules.\n',
    );

    const result = await runJson(['--json', 'upgrade', '--from', '0.0.15', '--apply']);

    expect(result.data.agentDocs.status).toBe('stale');
    expect(result.data.agentDocs.refreshed).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('<!-- ASTRYX:START -->');
    expect(content).toMatch(/Astryx v0\.0\.15 ·/);
    expect(content).not.toContain('legacy index');
    expect(content).toContain('More rules.');
  });

  it('surfaces agentDocs in the human output on the up-to-date path', async () => {
    writePkg();
    writeInstalledCore('0.0.15');
    writeAgentBlock('AGENTS.md', '0.0.1');

    const program = createProgram();
    await program.parseAsync(['node', 'astryx', 'upgrade', '--from', '0.0.15', '--apply']);
    const output = stdoutCalls.join('') + logCalls.join('\n');
    expect(output).toMatch(/Agent docs refreshed/i);
  });
});
