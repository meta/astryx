// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Direct API tests for `upgrade()` — the programmatic surface (`@astryxdesign/cli/api`).
 *
 * The CLI suites (cli/commands/upgrade*.test.mjs) drive `registerUpgrade` and
 * cover behavior end-to-end; these assert the API contract you get when calling
 * `upgrade()` in code: the typed receipt shape, thrown AstryxError codes, that
 * it honors the `cwd` option for detection/agent-docs, and that it stays SILENT
 * under the default noopLogger (no console spam for a scripted caller).
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {upgrade} from './upgrade.mjs';
import {logger} from '../logger.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {generateCompressedIndex} from '../../foundation/agent-docs/agent-docs.mjs';
import {
  createRegistryReceipt,
  registryReceiptTarget,
  serializeRegistryReceipt,
} from '../../authoring/shadcn/receipt.mjs';

vi.setConfig({testTimeout: 30000});

let tmpDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-upgrade-api-'));
  originalCwd = process.cwd();
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  logger.setSilent(true);
});

function writePkg(dir, deps = {}) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'fixture', dependencies: deps}, null, 2),
  );
}

function writeInstalledCore(dir, version) {
  const d = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(d, {recursive: true});
  fs.writeFileSync(
    path.join(d, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version}, null, 2),
  );
}

function writeAgentBlock(dir, rel, version) {
  fs.writeFileSync(
    path.join(dir, rel),
    `# Doc\n\n${generateCompressedIndex(version)}\n`,
  );
}

function writeRegistryFixture(
  dir,
  {base = 'old\n', latest = 'new\n', version = '0.6.0'} = {},
) {
  const sourceTarget = 'components/astryx/examples/Example.tsx';
  const registryPath = 'registry/example-button-basic/Example.tsx';
  const receiptTarget = registryReceiptTarget(
    sourceTarget,
    'example-button-basic',
  );
  const installedReceipt = createRegistryReceipt({
    item: {
      name: 'example-button-basic',
      path: 'examples/button/basic',
      aliases: [],
      kind: 'example',
    },
    sourceVersion: '0.5.0',
    receiptTarget,
    files: [
      {
        id: 'primary',
        target: sourceTarget,
        registryPath,
        content: base,
      },
    ],
  });
  const latestReceipt = createRegistryReceipt({
    item: installedReceipt.item,
    sourceVersion: version,
    receiptTarget,
    files: [
      {
        id: 'primary',
        target: sourceTarget,
        registryPath,
        content: latest,
      },
    ],
  });
  const sourcePath = path.join(dir, 'src', sourceTarget);
  const receiptPath = path.join(dir, 'src', receiptTarget);
  fs.mkdirSync(path.dirname(sourcePath), {recursive: true});
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  fs.writeFileSync(sourcePath, base);
  fs.writeFileSync(receiptPath, serializeRegistryReceipt(installedReceipt));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new globalThis.Response(
          JSON.stringify({
            name: latestReceipt.item.name,
            type: 'registry:block',
            files: [
              {
                path: registryPath,
                type: 'registry:block',
                target: sourceTarget,
                content: latest,
              },
              {
                path: 'registry/example-button-basic/astryx-receipt.json',
                type: 'registry:file',
                target: receiptTarget,
                content: serializeRegistryReceipt(latestReceipt),
              },
            ],
          }),
          {status: 200},
        ),
    ),
  );
  return {sourcePath};
}

describe('upgrade() — receipts', () => {
  it('returns upgrade.list without touching cwd', async () => {
    const res = await upgrade({list: true});
    expect(res.type).toBe('upgrade.list');
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);
    // The public list entry is the stripped shape (no `pr`).
    for (const entry of res.data) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('title');
      expect(entry).toHaveProperty('version');
      expect(entry).not.toHaveProperty('pr');
    }
  });

  it('runs registry-only mode without --from', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});

    const res = await upgrade({registry: true, apply: false}, {cwd: tmpDir});

    expect(res).toMatchObject({
      type: 'upgrade.registry',
      data: {applied: false, found: 0, conflicts: 0, failed: 0},
    });
  });

  it('requires installed Astryx packages when receipts exist', async () => {
    writeRegistryFixture(tmpDir);

    await expect(
      upgrade({registry: true, apply: true}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: ERROR_CODES.ERR_VERSION_DETECT});
  });

  it('rejects combining --list with registry-only mode', async () => {
    await expect(
      upgrade({list: true, registry: true}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: ERROR_CODES.ERR_INVALID_ARGUMENT});
  });

  it('checks receipts on the up-to-date short circuit', async () => {
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.6.0');
    const {sourcePath} = writeRegistryFixture(tmpDir);

    const res = await upgrade({from: '0.6.0', apply: true}, {cwd: tmpDir});

    expect(res).toMatchObject({
      type: 'upgrade.status',
      data: {
        status: 'up_to_date',
        registryCompositions: {found: 1, updated: 1, conflicts: 0},
      },
    });
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('new\n');
  });

  it('checks receipts on the no-codemods short circuit', async () => {
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '99.0.0');
    const {sourcePath} = writeRegistryFixture(tmpDir, {version: '99.0.0'});

    const res = await upgrade({from: '98.0.0', apply: false}, {cwd: tmpDir});

    expect(res).toMatchObject({
      type: 'upgrade.status',
      data: {
        status: 'no_codemods',
        registryCompositions: {found: 1, wouldUpdate: 1},
      },
    });
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('old\n');
  });

  it('rejects migration flags in registry-only mode', async () => {
    await expect(
      upgrade({registry: true, from: '0.5.0', apply: true}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: ERROR_CODES.ERR_INVALID_ARGUMENT});
  });

  it('honors cwd: refreshes a stale agent-docs block on the up-to-date path (--apply)', async () => {
    // from == installed → up_to_date short-circuit (returns before the codemod
    // runner), so this exercises detection + agent-docs purely via the cwd
    // option, with NO process.chdir.
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    writeAgentBlock(tmpDir, 'AGENTS.md', '0.0.1');

    const res = await upgrade({from: '0.0.15', apply: true}, {cwd: tmpDir});

    expect(res.type).toBe('upgrade.status');
    expect(res.data.status).toBe('up_to_date');
    expect(res.data.from).toBe('0.0.15');
    expect(res.data.to).toBe('0.0.15');
    expect(res.data.agentDocs.action).toBe('refreshed');
    expect(res.data.agentDocs.refreshed).toBe(true);
    expect(res.data.agentDocs.files).toContain('AGENTS.md');
    // The file at the *cwd* fixture was rewritten to the installed version.
    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toMatch(/Astryx v0\.0\.15 ·/);
    expect(content).not.toMatch(/Astryx v0\.0\.1 ·/);
  });

  it('leaves the block of a project at the top of a home settings folder, saying why and not pointing at init', async () => {
    const saved = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
    };
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
    const warned = [];
    const warn = vi
      .spyOn(console, 'error')
      .mockImplementation((...a) => warned.push(a.join(' ')));
    logger.setSilent(false);
    try {
      const project = path.join(tmpDir, '.dotfiles');
      fs.mkdirSync(project, {recursive: true});
      writePkg(project, {'@astryxdesign/core': '0.0.15'});
      writeInstalledCore(project, '0.0.15');
      writeAgentBlock(project, 'AGENTS.md', '0.0.1');

      const res = await upgrade({from: '0.0.15', apply: true}, {cwd: project});

      expect(res.data.agentDocs.action).toBe('error');
      expect(res.data.agentDocs.refreshed).toBe(false);
      expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toMatch(
        /Astryx v0\.0\.1 ·/,
      );
      const text = warned.join('\n');
      expect(text).toContain(
        `Agent docs not refreshed: ${fs.realpathSync(project)} is the home folder or a settings folder in it, which every project's agents read. To keep agent docs, move the project into a folder of its own; otherwise update or remove the Astryx block there by hand.`,
      );
      expect(text).not.toContain('init --features agents');
    } finally {
      logger.setSilent(true);
      warn.mockRestore();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('with no block, in a project at the top of a home settings folder, says why instead of pointing at init', async () => {
    const saved = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
    };
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
    const warned = [];
    const warn = vi
      .spyOn(console, 'error')
      .mockImplementation((...a) => warned.push(a.join(' ')));
    logger.setSilent(false);
    try {
      const project = path.join(tmpDir, '.dotfiles');
      fs.mkdirSync(project, {recursive: true});
      writePkg(project, {'@astryxdesign/core': '0.0.15'});
      writeInstalledCore(project, '0.0.15');

      const res = await upgrade({from: '0.0.15'}, {cwd: project});

      expect(res.data.agentDocs.action).toBe('error');
      const text = warned.join('\n');
      expect(text).toContain(
        `Agent docs not installed: ${fs.realpathSync(project)} is the home folder or a settings folder in it, which every project's agents read. To have agent docs, move the project into a folder of its own, or add the Astryx block to its agent file by hand.`,
      );
      expect(text).not.toContain('init --features agents');
    } finally {
      logger.setSilent(true);
      warn.mockRestore();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('a dry run in a project at the top of a home settings folder reports the refusal, not a refresh to apply', async () => {
    const saved = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
    };
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
    const warned = [];
    const warn = vi
      .spyOn(console, 'error')
      .mockImplementation((...a) => warned.push(a.join(' ')));
    logger.setSilent(false);
    try {
      const project = path.join(tmpDir, '.dotfiles');
      fs.mkdirSync(project, {recursive: true});
      writePkg(project, {'@astryxdesign/core': '0.0.15'});
      writeInstalledCore(project, '0.0.15');
      writeAgentBlock(project, 'AGENTS.md', '0.0.1');

      const res = await upgrade({from: '0.0.15'}, {cwd: project});

      expect(res.data.agentDocs.action).toBe('error');
      expect(res.data.agentDocs.refreshed).toBe(false);
      const text = warned.join('\n');
      expect(text).toContain(
        `Agent docs not refreshed: ${fs.realpathSync(project)} is the home folder or a settings folder in it`,
      );
      expect(text).not.toContain('--apply to refresh');
      expect(text).not.toContain('init --features agents');
    } finally {
      logger.setSilent(true);
      warn.mockRestore();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('refreshes the agent docs of a project in an agent worktree inside a home settings folder', async () => {
    const saved = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
    };
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
    try {
      const project = path.join(tmpDir, '.codex', 'worktrees', 'a1b2c3', 'web');
      fs.mkdirSync(project, {recursive: true});
      writePkg(project, {'@astryxdesign/core': '0.0.15'});
      writeInstalledCore(project, '0.0.15');
      writeAgentBlock(project, 'AGENTS.md', '0.0.1');

      const res = await upgrade({from: '0.0.15', apply: true}, {cwd: project});

      expect(res.data.agentDocs.action).toBe('refreshed');
      expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toMatch(
        /Astryx v0\.0\.15 ·/,
      );
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('refreshes the managed block in an ignored .claude/CLAUDE.md and keeps the text around it (INV31)', async () => {
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    writeAgentBlock(tmpDir, 'AGENTS.md', '0.0.1');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    writeAgentBlock(tmpDir, '.claude/CLAUDE.md', '0.0.1');
    const claude = path.join(tmpDir, '.claude', 'CLAUDE.md');
    fs.writeFileSync(
      claude,
      `# Team notes\n\n${fs.readFileSync(claude, 'utf-8')}\nMore notes.\n`,
    );
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.claude/\n');

    const res = await upgrade({from: '0.0.15', apply: true}, {cwd: tmpDir});

    expect(res.data.agentDocs.action).toBe('refreshed');
    expect(res.data.agentDocs.files).toEqual([
      'AGENTS.md',
      '.claude/CLAUDE.md',
    ]);
    expect(res.data.agentDocs).not.toHaveProperty('protectedFiles');
    const content = fs.readFileSync(claude, 'utf-8');
    expect(content).toMatch(/^# Team notes\n/u);
    expect(content).toMatch(/Astryx v0\.0\.15 ·/u);
    expect(content).toMatch(/More notes\.\n$/u);
  });

  it('refreshes a committed .claude/CLAUDE.md that imports AGENTS.md and keeps a copy beside an ignored root CLAUDE.md', async () => {
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    writeAgentBlock(tmpDir, 'AGENTS.md', '0.0.1');
    writeAgentBlock(tmpDir, 'CLAUDE.md', '0.0.1');
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '/CLAUDE.md\n');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const copy = path.join(tmpDir, '.claude', 'CLAUDE.md');
    fs.writeFileSync(
      copy,
      `@../AGENTS.md\n\n${generateCompressedIndex('0.0.1')}\n`,
    );

    for (let round = 0; round < 2; round++) {
      await upgrade({from: '0.0.15', apply: true}, {cwd: tmpDir});
      const content = fs.readFileSync(copy, 'utf-8');
      expect(content, `round ${round}`).toMatch(/^@\.\.\/AGENTS\.md\n/u);
      expect(content, `round ${round}`).toMatch(/Astryx v0\.0\.15 ·/u);
    }
    const dry = await upgrade({from: '0.0.15'}, {cwd: tmpDir});
    expect(dry.data.agentDocs.status).toBe('current');
  });

  it('reports would-refresh on a dry run without writing (honors cwd)', async () => {
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    writeAgentBlock(tmpDir, 'AGENTS.md', '0.0.1');
    const before = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');

    const res = await upgrade({from: '0.0.15'}, {cwd: tmpDir});

    expect(res.data.status).toBe('up_to_date');
    expect(res.data.agentDocs.action).toBe('would-refresh');
    expect(res.data.agentDocs.refreshed).toBe(false);
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(
      before,
    );
  });

  it('returns upgrade.run for an applicable range', async () => {
    // Codemod scanning is process.cwd()-relative, so chdir into the fixture.
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'const x = 1;\n');
    process.chdir(tmpDir);

    const res = await upgrade(
      {from: '0.0.1', apply: false, path: 'src'},
      {cwd: tmpDir},
    );

    expect(res.type).toBe('upgrade.run');
    expect(res.data.from).toBe('0.0.1');
    expect(res.data.to).toBe('0.0.15');
    expect(typeof res.data.codemods).toBe('number');
    expect(res.data.agentDocs).toBeDefined();
  });

  it('checks receipts on a normal codemod run', async () => {
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    const {sourcePath} = writeRegistryFixture(tmpDir, {
      base: "export const value = 'old';\n",
      latest: "export const value = 'new';\n",
      version: '0.0.15',
    });

    const res = await upgrade(
      {from: '0.0.1', apply: false, path: 'src'},
      {cwd: tmpDir},
    );

    expect(res).toMatchObject({
      type: 'upgrade.run',
      data: {registryCompositions: {found: 1, wouldUpdate: 1}},
    });
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(
      "export const value = 'old';\n",
    );
  });
});

describe('upgrade() — honors cwd for codemod scanning (no chdir)', () => {
  it('scans the cwd source tree, not process.cwd()', async () => {
    // Fixture lives in tmpDir; process.cwd() stays the repo root (NO chdir).
    // The codemod runner resolves --path against the API cwd, so it must scan
    // tmpDir/src — regression guard for the earlier process.cwd()-relative bug.
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'const x = 1;\n');

    // Capture stdout: the runner logs the directory it scans. Enabling the
    // shared logger keeps the runner non-silent so its scan line is emitted.
    const out = [];
    vi.spyOn(console, 'log').mockImplementation((...a) =>
      out.push(a.join(' ')),
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(c => {
      out.push(typeof c === 'string' ? c : c.toString());
      return true;
    });
    logger.setSilent(false);

    const res = await upgrade(
      {from: '0.0.1', apply: false, path: 'src'},
      {cwd: tmpDir},
    );

    const joined = out.join('\n');
    expect(res.type).toBe('upgrade.run');
    // Scanned the cwd tree…
    expect(joined).toContain(path.join(tmpDir, 'src'));
    // …and did NOT report the path missing (which is what the old,
    // process.cwd()-relative resolution produced here).
    expect(joined).not.toMatch(/Source path not found/);
  });
});

describe('upgrade() — errors throw AstryxError', () => {
  it('missing --from → ERR_INVALID_ARGUMENT', async () => {
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    await expect(upgrade({}, {cwd: tmpDir})).rejects.toMatchObject({
      name: 'AstryxError',
      code: ERROR_CODES.ERR_INVALID_ARGUMENT,
    });
    await expect(upgrade({}, {cwd: tmpDir})).rejects.toThrow(
      /Missing required --from/,
    );
  });

  it('invalid --from → ERR_INVALID_VERSION', async () => {
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    await expect(
      upgrade({from: 'not-a-version'}, {cwd: tmpDir}),
    ).rejects.toMatchObject({
      code: ERROR_CODES.ERR_INVALID_VERSION,
    });
  });

  it('no installed core → ERR_VERSION_DETECT (uses the cwd option to look)', async () => {
    // Empty cwd (no node_modules/@astryxdesign/core) — detection must fail here,
    // proving the cwd option routes version detection.
    writePkg(tmpDir);
    const err = await upgrade({from: '0.0.1'}, {cwd: tmpDir}).catch(e => e);
    expect(err).toBeInstanceOf(AstryxError);
    expect(err.code).toBe(ERROR_CODES.ERR_VERSION_DETECT);
  });
});

describe('upgrade() — silent by default (noopLogger)', () => {
  it('prints nothing to stdout when called programmatically', async () => {
    writePkg(tmpDir);
    writeInstalledCore(tmpDir, '0.0.15');
    writeAgentBlock(tmpDir, 'AGENTS.md', '0.0.1');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const outSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    const res = await upgrade({from: '0.0.15', apply: true}, {cwd: tmpDir});

    // The receipt still comes back…
    expect(res.data.agentDocs.action).toBe('refreshed');
    // …but a scripted caller sees zero human output (default noopLogger).
    expect(logSpy).not.toHaveBeenCalled();
    expect(outSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });
});
