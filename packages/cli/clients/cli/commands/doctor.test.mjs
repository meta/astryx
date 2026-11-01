// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';

import {registerDoctor} from './doctor.mjs';
import {
  runChecks,
  doctor as doctorApi,
  checkNodeVersion,
  checkCoreInstalled,
  checkVersionAlignment,
  checkConfig,
  checkAgentDocs,
  checkPeerDeps,
  checkPackageManager,
} from '../../../api/doctor/doctor.mjs';
import {MIN_NODE_VERSION} from '../../../foundation/env/node-version.mjs';
import {CLI_VERSION, linkThisCliAsProjectCli} from '../../../test-utils/release-fixtures.mjs';

let tmpDir;
let logCalls;
let exitCode;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doctor-test-'));
  logCalls = [];
  exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logCalls.push(args.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
  vi.restoreAllMocks();
  delete process.env.ASTRYX_THEME;
});

/** Make a minimal node_modules/@astryxdesign/core in tmpDir with the given version. */
function installCore(version = '0.0.14', peerDependencies) {
  const coreDir = path.join(tmpDir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(coreDir, {recursive: true});
  const pkg = {name: '@astryxdesign/core', version};
  if (peerDependencies) pkg.peerDependencies = peerDependencies;
  fs.writeFileSync(path.join(coreDir, 'package.json'), JSON.stringify(pkg));
  return coreDir;
}

function installPkg(name, version = '1.0.0') {
  const dir = path.join(tmpDir, 'node_modules', ...name.split('/'));
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name, version, main: 'index.js'}),
  );
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};');
  return dir;
}

function find(checks, id) {
  return checks.find(c => c.id === id);
}

describe('doctor — individual checks', () => {
  it('node-version: PASS uses the real CLI threshold', () => {
    const ok = checkNodeVersion({nodeVersion: '99.0.0'});
    expect(ok.status).toBe('pass');
    expect(ok.message).toContain(MIN_NODE_VERSION);

    const bad = checkNodeVersion({nodeVersion: '18.0.0'});
    expect(bad.status).toBe('fail');
    expect(bad.fix).toContain(MIN_NODE_VERSION);
  });

  it('core-installed: FAIL when @astryxdesign/core is missing, PASS when present', () => {
    const missing = checkCoreInstalled({cwd: tmpDir, coreDir: null});
    expect(missing.status).toBe('fail');
    expect(missing.fix).toBeTruthy();

    const coreDir = installCore('0.0.14');
    const present = checkCoreInstalled({cwd: tmpDir, coreDir});
    expect(present.status).toBe('pass');
    expect(present.message).toContain('0.0.14');
  });

  it('version-alignment: WARN on major/minor drift', () => {
    const coreDir = installCore('9.9.0');
    const drift = checkVersionAlignment({cwd: tmpDir, coreDir});
    expect(drift.status).toBe('warn');
    expect(drift.fix).toBeTruthy();
  });

  it('version-alignment: INFO when core is not installed', () => {
    const res = checkVersionAlignment({cwd: tmpDir, coreDir: null});
    expect(res.status).toBe('info');
  });

  it('app themes: reports unmanaged state as one INFO check', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app","dependencies":{"@astryxdesign/core":"*"}}\n');
    const result = await runChecks({cwd: tmpDir});
    const themeChecks = result.checks.filter(check =>
      check.id.startsWith('theme-'),
    );
    expect(themeChecks).toEqual([
      expect.objectContaining({id: 'theme-management', status: 'info'}),
    ]);
  });

  it('config: INFO when no astryx.config.mjs', async () => {
    const res = await checkConfig({cwd: tmpDir, configPath: null});
    expect(res.status).toBe('info');
  });

  it('config: PASS when a valid astryx.config.mjs loads', async () => {
    // Vitest intercepts dynamic import() through Vite's resolver, which can't
    // serve a file written to an arbitrary tmp path at runtime. Write the
    // fixture inside the package tree so Vite can resolve it, then clean up.
    const fixtureDir = fs.mkdtempSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '__doctor_cfg_'),
    );
    const configPath = path.join(fixtureDir, 'astryx.config.mjs');
    try {
      fs.writeFileSync(configPath, 'export default { integrations: [] };');
      const res = await checkConfig({cwd: fixtureDir, configPath});
      if (res.status !== 'pass') {
        throw new Error(`expected pass, got ${res.status}: ${res.message}`);
      }
      expect(res.status).toBe('pass');
    } finally {
      fs.rmSync(fixtureDir, {recursive: true, force: true});
    }
  });

  it('config: FAIL when astryx.config.mjs throws on import', async () => {
    const fixtureDir = fs.mkdtempSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '__doctor_cfg_'),
    );
    const configPath = path.join(fixtureDir, 'astryx.config.mjs');
    try {
      fs.writeFileSync(configPath, 'throw new Error("boom");\nexport default {};');
      const res = await checkConfig({cwd: fixtureDir, configPath});
      expect(res.status).toBe('fail');
      expect(res.fix).toBeTruthy();
    } finally {
      fs.rmSync(fixtureDir, {recursive: true, force: true});
    }
  });

  it('config: FAIL when default export is not an object', async () => {
    const fixtureDir = fs.mkdtempSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '__doctor_cfg_'),
    );
    const configPath = path.join(fixtureDir, 'astryx.config.mjs');
    try {
      fs.writeFileSync(configPath, 'export default 123;');
      const res = await checkConfig({cwd: fixtureDir, configPath});
      expect(res.status).toBe('fail');
    } finally {
      fs.rmSync(fixtureDir, {recursive: true, force: true});
    }
  });

  it('agent-docs: INFO when no docs present', () => {
    const res = checkAgentDocs({cwd: tmpDir});
    expect(res.status).toBe('info');
    expect(res.fix).toContain('init --features agents');
  });

  // The npm package named `astryx` is not this CLI: a project without the
  // `astryx` bin gets the scoped package in the fix, one with it keeps the bin.
  it('agent-docs: the fix names the scoped package when the project has no local CLI', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    const res = checkAgentDocs({cwd: tmpDir});
    expect(res.fix).toContain(
      `\`npx @astryxdesign/cli@${CLI_VERSION} init --features agents\``,
    );
  });

  it('agent-docs: the fix keeps `npx astryx` when the project has a local CLI', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'node_modules', '.bin'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'node_modules', '.bin', 'astryx'), '');
    linkThisCliAsProjectCli(tmpDir);
    const res = checkAgentDocs({cwd: tmpDir});
    expect(res.fix).toContain('`npx astryx init --features agents`');
  });

  it('agent-docs: at the top of a home settings folder, the fix moves the project or edits by hand, never init', () => {
    const saved = {HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE};
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
    try {
      const project = path.join(tmpDir, '.dotfiles');
      fs.mkdirSync(project);
      fs.writeFileSync(path.join(project, 'package.json'), '{"name":"dots"}');
      for (const content of [null, '# Agents\nno markers here\n']) {
        if (content != null) fs.writeFileSync(path.join(project, 'AGENTS.md'), content);
        const res = checkAgentDocs({cwd: project});
        expect(res.fix).toContain('Agent docs are not written into the home folder');
        expect(res.fix).toContain(
          'Move the project into a folder of its own, or edit the Astryx block in its agent file by hand.',
        );
        expect(res.fix).not.toContain('init --features agents');
      }
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('agent-docs: WARN when docs exist without XDS markers', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# AGENTS\nno markers here');
    const res = checkAgentDocs({cwd: tmpDir});
    expect(res.status).toBe('warn');
  });

  it('agent-docs: PASS when XDS markers present', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# AGENTS\n<!-- XDS:START -->\nstuff\n<!-- XDS:END -->\n',
    );
    const res = checkAgentDocs({cwd: tmpDir});
    expect(res.status).toBe('pass');
  });

  it('agent-docs: PASS from a subfolder, reading the project root', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app"}');
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '<!-- ASTRYX:START -->\nstuff\n<!-- ASTRYX:END -->\n',
    );
    const src = path.join(tmpDir, 'src');
    fs.mkdirSync(src);
    const res = checkAgentDocs({cwd: src});
    expect(res.status).toBe('pass');
    expect(res.message).toBe(
      `Astryx agent docs section present in ${path.join('..', 'AGENTS.md')}.`,
    );
  });

  it('agent-docs: PASS from a nested package, reading the root that declares Astryx', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({dependencies: {'@astryxdesign/core': '0.7.0'}}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '<!-- ASTRYX:START -->\nstuff\n<!-- ASTRYX:END -->\n',
    );
    const functions = path.join(tmpDir, 'functions');
    fs.mkdirSync(path.join(functions, 'src'), {recursive: true});
    fs.writeFileSync(path.join(functions, 'package.json'), '{"name":"functions"}');

    expect(checkAgentDocs({cwd: path.join(functions, 'src')})).toMatchObject({
      status: 'pass',
      message: `Astryx agent docs section present in ${path.join('..', '..', 'AGENTS.md')}.`,
    });
  });

  it('agent-docs: reads every file init can write, Hermes included', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'HERMES.md'),
      '<!-- ASTRYX:START -->\nstuff\n<!-- ASTRYX:END -->\n',
    );
    expect(checkAgentDocs({cwd: tmpDir})).toMatchObject({
      status: 'pass',
      message: 'Astryx agent docs section present in HERMES.md.',
    });
  });

  it('agent-docs: FAIL when GEMINI.md imports an AGENTS.md that holds no block', () => {
    const geminiImport = '<!-- ASTRYX:START -->\n@./AGENTS.md\n<!-- ASTRYX:END -->\n';
    fs.writeFileSync(path.join(tmpDir, 'GEMINI.md'), geminiImport);
    expect(checkAgentDocs({cwd: tmpDir})).toMatchObject({
      status: 'fail',
      message: expect.stringMatching(/^GEMINI\.md imports AGENTS\.md, which holds no Astryx block/),
      fix: expect.stringMatching(/init --features agents/),
    });

    // A copy elsewhere does not mend it: Codex and Gemini CLI still get none.
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '<!-- ASTRYX:START -->\nstuff\n<!-- ASTRYX:END -->\n');
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    expect(checkAgentDocs({cwd: tmpDir}).status).toBe('fail');

    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '<!-- ASTRYX:START -->\nstuff\n<!-- ASTRYX:END -->\n');
    expect(checkAgentDocs({cwd: tmpDir})).toMatchObject({
      status: 'pass',
      message: 'Astryx agent docs section present in AGENTS.md, CLAUDE.md.',
    });
  });

  it('agent-docs: INFO names what it looked for and where', () => {
    const res = checkAgentDocs({cwd: tmpDir});
    expect(res.status).toBe('info');
    expect(res.message).toContain('AGENTS.md, CLAUDE.md');
    expect(res.message).toContain('HERMES.md');
  });

  it('peer-deps: INFO when core not installed', () => {
    const res = checkPeerDeps({cwd: tmpDir, coreDir: null});
    expect(res.status).toBe('info');
  });

  it('peer-deps: WARN when a peer is missing', () => {
    const coreDir = installCore('0.0.14', {react: '>=19.0.0'});
    const res = checkPeerDeps({cwd: tmpDir, coreDir});
    expect(res.status).toBe('warn');
    expect(res.message).toContain('react');
  });

  it('peer-deps: PASS when peers are installed', () => {
    const coreDir = installCore('0.0.14', {react: '>=19.0.0'});
    installPkg('react', '19.0.0');
    const res = checkPeerDeps({cwd: tmpDir, coreDir});
    expect(res.status).toBe('pass');
  });

  it('peer-deps: fix names a scoped missing peer (no empty install command)', () => {
    const coreDir = installCore('0.0.14', {'@stylexjs/stylex': '^0.19.0'});
    const res = checkPeerDeps({cwd: tmpDir, coreDir});
    expect(res.status).toBe('warn');
    // The scope must survive version-stripping — `split('@')[0]` used to drop it,
    // leaving a bare `npm install ` with no package name.
    expect(res.fix).toContain('npm install @stylexjs/stylex');
    expect(res.fix).not.toMatch(/npm install\s*`/);
  });

  it('peer-deps: WARN when an installed peer is out of the declared range', () => {
    const coreDir = installCore('0.0.14', {'@stylexjs/stylex': '^0.19.0'});
    // Present, but a stale range resolved an incompatible version.
    installPkg('@stylexjs/stylex', '0.10.1');
    const res = checkPeerDeps({cwd: tmpDir, coreDir});
    expect(res.status).toBe('warn');
    expect(res.message).toContain('0.10.1');
    expect(res.message).toContain('^0.19.0');
    // The fix pins the required range so it overrides the stale one.
    expect(res.fix).toContain('@stylexjs/stylex@^0.19.0');
  });

  it('peer-deps: PASS when an installed peer satisfies the range', () => {
    const coreDir = installCore('0.0.14', {'@stylexjs/stylex': '^0.19.0'});
    installPkg('@stylexjs/stylex', '0.19.2');
    const res = checkPeerDeps({cwd: tmpDir, coreDir});
    expect(res.status).toBe('pass');
  });

  it('package-manager: INFO, reports yarn from lockfile', () => {
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '');
    const res = checkPackageManager({cwd: tmpDir});
    expect(res.status).toBe('info');
    expect(res.message.toLowerCase()).toContain('yarn');
  });
});

describe('doctor — runChecks / report', () => {
  it('returns checks + a summary with per-status counts', async () => {
    const report = await runChecks({cwd: tmpDir});
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBeGreaterThan(0);
    const {pass, warn, fail, info} = report.summary;
    const total = pass + warn + fail + info;
    expect(total).toBe(report.checks.length);
  });

  it('reports a FAIL for core in a project that declares Core but installs none', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app","dependencies":{"@astryxdesign/core":"*"}}\n');
    const report = await runChecks({cwd: tmpDir});
    expect(find(report.checks, 'core-installed').status).toBe('fail');
    expect(report.summary.fail).toBeGreaterThan(0);
  });

  it('api doctor() returns the {type, data} envelope', async () => {
    const res = await doctorApi({cwd: tmpDir});
    expect(res.type).toBe('doctor');
    expect(res.data.checks).toBeTruthy();
    expect(res.data.summary).toBeTruthy();
  });
});

function createProgram() {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'Output as typed JSON');
  registerDoctor(program);
  return program;
}

describe('doctor — command', () => {
  it('--json emits a doctor envelope', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'astryx', '--json', 'doctor']);
    const out = logCalls.join('\n');
    const parsed = JSON.parse(out);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.type).toBe('doctor');
    expect(Array.isArray(parsed.data.checks)).toBe(true);
    expect(parsed.data.summary).toHaveProperty('fail');
  });

  it('exit code stays 0 when there are no failures', async () => {
    // Run against the monorepo (where @astryxdesign/core resolves) → no FAIL.
    const prevExit = process.exitCode;
    process.exitCode = undefined;
    const program = createProgram();
    await program.parseAsync(['node', 'astryx', 'doctor']);
    // In the repo, core resolves, so no failures → exitCode untouched.
    expect(process.exitCode).toBeUndefined();
    process.exitCode = prevExit;
  });

  it('sets exit code 1 when a check FAILs (Core declared, not installed)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app","dependencies":{"@astryxdesign/core":"*"}}\n');
    const prevCwd = process.cwd();
    const prevExit = process.exitCode;
    process.exitCode = undefined;
    process.chdir(tmpDir);
    try {
      const program = createProgram();
      await program.parseAsync(['node', 'astryx', 'doctor']);
      expect(process.exitCode).toBe(1);
    } finally {
      process.chdir(prevCwd);
      process.exitCode = prevExit;
    }
  });
});

describe('doctor — text output mirrors the JSON', () => {
  /** @param {string} line */
  const field = line => /^(\w+):\s+(.*)$/.exec(line)?.slice(1) ?? [line, ''];

  it('prints every check and summary field under its JSON key', async () => {
    const prevCwd = process.cwd();
    const prevExit = process.exitCode;
    process.chdir(tmpDir);
    try {
      await createProgram().parseAsync(['node', 'astryx', '--json', 'doctor']);
      const {checks, summary} = JSON.parse(logCalls.join('\n')).data;
      logCalls = [];
      await createProgram().parseAsync(['node', 'astryx', 'doctor']);
      const blocks = logCalls
        .join('\n')
        .split(/\n{2,}/)
        .map(block => block.split('\n').map(field));

      for (const check of checks) {
        const block = blocks.find(fields =>
          fields.some(([key, value]) => key === 'id' && value === check.id),
        );
        expect(block, `no text record for check ${check.id}`).toBeDefined();
        expect(
          /** @type {string[][]} */ (block).map(([key]) => key).sort(),
        ).toEqual(Object.keys(check).sort());
      }

      const heading = blocks.findIndex(
        fields => fields.length === 1 && fields[0][0] === 'summary',
      );
      expect(heading, 'no summary section').toBeGreaterThan(-1);
      expect(blocks[heading + 1]).toEqual(
        Object.entries(summary).map(([key, count]) => [key, String(count)]),
      );
    } finally {
      process.chdir(prevCwd);
      process.exitCode = prevExit;
    }
  }, 60_000);
});

describe('doctor — a configured integration that cannot load', () => {
  it('sets exit code 1 and reports it in the JSON', async () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-doctor-exit-'));
    const prevCwd = process.cwd();
    const prevExit = process.exitCode;
    process.exitCode = undefined;
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}');
      fs.writeFileSync(
        path.join(dir, 'astryx.config.mjs'),
        "export default { integrations: ['@acme/missing'] };\n",
      );
      const coreDir = path.join(dir, 'node_modules', '@astryxdesign', 'core');
      fs.mkdirSync(coreDir, {recursive: true});
      fs.writeFileSync(
        path.join(coreDir, 'package.json'),
        JSON.stringify({name: '@astryxdesign/core', version: '0.6.3'}),
      );
      process.chdir(dir);
      await createProgram().parseAsync(['node', 'astryx', '--json', 'doctor']);
      expect(process.exitCode).toBe(1);
      const {data} = JSON.parse(logCalls.join('\n'));
      expect(
        data.checks.find(c => c.id === 'configured-integrations'),
      ).toMatchObject({status: 'fail'});
    } finally {
      process.chdir(prevCwd);
      process.exitCode = prevExit;
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);
});
