// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Path-safety regression tests for agent-doc writes.
 *
 * `installAgentDocs(targetDir, {paths})` previously joined each path
 * onto `targetDir` with no validation, so:
 *   - `../OUT.md` wrote outside `targetDir`
 *   - `/tmp/x.md` was silently re-rooted under `targetDir`
 *
 * Auto-detected and preset files were never checked at all, so a `CLAUDE.md`
 * or `.claude/` symlinked out of the project had the block written through
 * it. Every case now throws PathSafetyError before any file is touched. A file
 * only the current layout writes (GEMINI.md) that links outside is skipped and
 * reported instead, and the rest is written, so init keeps 0.7.0's exit code.
 *
 * `removeAgentDocs` (`init --remove-agents`) stripped or deleted a block
 * through the same kind of link and reported success. It now refuses with
 * `ERR_PATH_TRAVERSAL` before any file is touched.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {spawnSync} from 'node:child_process';
import {
  installAgentDocs,
  removeAgentDocs,
  removeXdsBlock,
} from './agent-docs.mjs';
import {PathSafetyError} from '../fs/path-safety.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {doc as initDoc} from '../../clients/cli/commands/init.doc.mjs';

const BLOCK = '<!-- ASTRYX:START -->\nmanaged\n<!-- ASTRYX:END -->';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-agent-docs-paths-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** A project dir plus a sibling dir outside it. */
function layout() {
  const project = path.join(tmpDir, 'project');
  const outside = path.join(tmpDir, 'outside');
  fs.mkdirSync(project, {recursive: true});
  fs.mkdirSync(outside, {recursive: true});
  return {project, outside};
}

/**
 * @param {() => unknown} fn
 * @returns {unknown} what `fn` threw
 */
function thrownBy(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected a throw');
}

describe('installAgentDocs path safety', () => {
  it('rejects --agent-docs-path that escapes the target directory', () => {
    const target = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(target, {recursive: true});
    fs.mkdirSync(outside, {recursive: true});

    expect(() => installAgentDocs(target, {paths: ['../OUT.md']})).toThrow(
      PathSafetyError,
    );

    expect(fs.existsSync(path.join(tmpDir, 'OUT.md'))).toBe(false);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('rejects an absolute --agent-docs-path with a clear error', () => {
    const target = path.join(tmpDir, 'project');
    fs.mkdirSync(target, {recursive: true});
    const absPath = path.join(tmpDir, 'absolute.md');

    expect(() => installAgentDocs(target, {paths: [absPath]})).toThrow(
      /absolute paths are not allowed/i,
    );

    expect(fs.existsSync(absPath)).toBe(false);
  });

  it('rejects deeper traversal segments', () => {
    const target = path.join(tmpDir, 'a', 'b', 'c');
    fs.mkdirSync(target, {recursive: true});

    expect(() =>
      installAgentDocs(target, {paths: ['../../../escaped.md']}),
    ).toThrow(PathSafetyError);

    expect(fs.existsSync(path.join(tmpDir, 'escaped.md'))).toBe(false);
  });
});

describe('installAgentDocs never writes through a symlink out of the project', () => {
  it('refuses an auto-detected file that links outside', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(() => installAgentDocs(project, {renderedBlock: BLOCK})).toThrow(
      /outside the project root/,
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
    expect(fs.readdirSync(project)).toEqual(['CLAUDE.md']);
  });

  it('skips a GEMINI.md that links outside, reports it, and writes the rest', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'GEMINI.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'GEMINI.md'));
    /** @type {Array<[string, string]>} */
    const skipped = [];

    expect(
      installAgentDocs(project, {
        renderedBlock: BLOCK,
        onSkipped: (rel, reason) => skipped.push([rel, reason]),
      }),
    ).toEqual(['AGENTS.md']);
    expect(skipped).toEqual([
      ['GEMINI.md', expect.stringMatching(/outside the project root/)],
    ]);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  });

  it('leaves a .claude folder that links outside alone when root CLAUDE.md holds the copy', () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Claude\n');
    fs.symlinkSync(outside, path.join(project, '.claude'));

    expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readdirSync(outside)).toEqual([]);

    // A CLAUDE.md in the linked folder with no block is not written either.
    fs.writeFileSync(path.join(outside, 'CLAUDE.md'), '# Shared\n');
    expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
      '# Shared\n',
    );
  });

  it('refuses a preset file reached through a symlinked directory', () => {
    const {project, outside} = layout();
    fs.symlinkSync(outside, path.join(project, '.claude'));

    expect(() =>
      installAgentDocs(project, {agent: 'claude', renderedBlock: BLOCK}),
    ).toThrow(PathSafetyError);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('refuses an existing preset file that links outside', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'rules');
    fs.writeFileSync(shared, 'rules\n');
    fs.symlinkSync(shared, path.join(project, '.cursorrules'));

    expect(() =>
      installAgentDocs(project, {agent: 'cursor', renderedBlock: BLOCK}),
    ).toThrow(PathSafetyError);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('rules\n');
  });

  it('writes nothing when any file of the set escapes', () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Agents\n');
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(() => installAgentDocs(project, {renderedBlock: BLOCK})).toThrow(
      PathSafetyError,
    );
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      '# Agents\n',
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  });

  it('refuses to refresh a managed block that lives outside', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(
      shared,
      `# Shared\n\n${BLOCK.replace('managed', 'old')}\n`,
    );
    const before = fs.readFileSync(shared, 'utf-8');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(() =>
      installAgentDocs(project, {onlyReplace: true, renderedBlock: BLOCK}),
    ).toThrow(PathSafetyError);
    expect(fs.readFileSync(shared, 'utf-8')).toBe(before);
  });

  it('refuses to strip a duplicate block from a wrapper that links outside', () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'AGENTS.md'), `# Agents\n\n${BLOCK}\n`);
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, `@AGENTS.md\n\n${BLOCK}\n`);
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(() => installAgentDocs(project, {renderedBlock: BLOCK})).toThrow(
      PathSafetyError,
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe(`@AGENTS.md\n\n${BLOCK}\n`);
  });

  it('still refreshes in-project blocks beside an unmarked outside link it skips', () => {
    const {project, outside} = layout();
    fs.writeFileSync(
      path.join(project, 'AGENTS.md'),
      `# Agents\n\n${BLOCK.replace('managed', 'old')}\n`,
    );
    const shared = path.join(outside, 'rules');
    fs.writeFileSync(shared, 'rules\n');
    fs.symlinkSync(shared, path.join(project, '.cursorrules'));

    expect(
      installAgentDocs(project, {onlyReplace: true, renderedBlock: BLOCK}),
    ).toEqual(['AGENTS.md']);
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toContain(
      'managed',
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe('rules\n');
  });

  it('writes through a symlink that stays inside the project', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Agents\n');
    fs.symlinkSync('AGENTS.md', path.join(project, 'CLAUDE.md'));

    // CLAUDE.md is AGENTS.md under another name, so it already has the block.
    expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
      'AGENTS.md',
      'GEMINI.md',
    ]);
    const content = fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8');
    expect(content.split('<!-- ASTRYX:START -->')).toHaveLength(2);
  });
});

describe('init --features agents with an agent doc linked outside the project', () => {
  it('writes nothing outside, reports path-safety, and exits 1 in both modes', async () => {
    const project = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(project, {recursive: true});
    fs.mkdirSync(outside, {recursive: true});
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    const json = await runCli(
      ['init', '--features', 'agents', '--json'],
      project,
    );
    expect(json.status).toBe(1);
    const env = JSON.parse(json.stdout);
    expect(env.type).toBe('init.run');
    expect(env.data.docsError).toMatchObject({kind: 'path-safety'});

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(1);

    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  }, 30_000);

  it('a GEMINI.md linked outside is skipped and reported, and init exits 0', async () => {
    const project = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(project, {recursive: true});
    fs.mkdirSync(outside, {recursive: true});
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'GEMINI.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'GEMINI.md'));

    const json = await runCli(
      ['init', '--features', 'agents', '--json'],
      project,
    );
    expect(json.status).toBe(0);
    const env = JSON.parse(json.stdout);
    expect(env.data.docsWritten).toEqual(['AGENTS.md']);
    expect(env.data.docsError).toEqual({
      kind: 'install-failed',
      message: expect.stringMatching(
        /^Left as it is: GEMINI\.md \(.*outside the project root/,
      ),
    });

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(0);
    expect(text.stderr).toMatch(/^Note: Left as it is: GEMINI\.md/m);
    expect(text.stderr).not.toMatch(/Error:/);

    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  }, 30_000);
});

describe('removeAgentDocs never changes a file out of the project', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses to strip a block from a file that links outside', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, `# Shared\n\n${BLOCK}\n`);
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    const err = thrownBy(() => removeAgentDocs(project));
    expect(err).toBeInstanceOf(PathSafetyError);
    expect(err).toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    expect(fs.readFileSync(shared, 'utf-8')).toBe(`# Shared\n\n${BLOCK}\n`);
  });

  it('refuses to delete a file reached through a symlinked directory', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    const content = `# CLAUDE\n\nProject-specific guidance for AI coding agents.\n\n${BLOCK}\n`;
    fs.writeFileSync(shared, content);
    fs.symlinkSync(outside, path.join(project, '.claude'));

    expect(thrownBy(() => removeAgentDocs(project))).toMatchObject({
      code: 'ERR_PATH_TRAVERSAL',
    });
    expect(fs.readFileSync(shared, 'utf-8')).toBe(content);
  });

  it('changes nothing when any file of the set escapes', () => {
    const {project, outside} = layout();
    const agents = `# Agents\n\nkeep\n\n${BLOCK}\n`;
    fs.writeFileSync(path.join(project, 'AGENTS.md'), agents);
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, `# Shared\n\n${BLOCK}\n`);
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(thrownBy(() => removeAgentDocs(project))).toBeInstanceOf(
      PathSafetyError,
    );
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      agents,
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe(`# Shared\n\n${BLOCK}\n`);
  });

  it('still strips in-project blocks beside an unmarked outside link it skips', () => {
    const {project, outside} = layout();
    fs.writeFileSync(
      path.join(project, 'AGENTS.md'),
      `# Agents\n\nkeep\n\n${BLOCK}\n`,
    );
    const shared = path.join(outside, 'rules');
    fs.writeFileSync(shared, 'rules\n');
    fs.symlinkSync(shared, path.join(project, '.cursorrules'));

    removeAgentDocs(project);
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      '# Agents\n\nkeep\n',
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe('rules\n');
  });

  it('strips through a symlink that stays inside the project', () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, 'AGENTS.md'),
      `# Agents\n\nkeep\n\n${BLOCK}\n`,
    );
    fs.symlinkSync('AGENTS.md', path.join(project, 'CLAUDE.md'));

    removeAgentDocs(project);
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      '# Agents\n\nkeep\n',
    );
  });
});

describe('init --remove-agents with an agent doc linked outside the project', () => {
  it('changes nothing outside, fails with ERR_PATH_TRAVERSAL, and exits 1 in both modes', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'CLAUDE.md');
    const content = `# Shared\n\n${BLOCK}\n`;
    fs.writeFileSync(shared, content);
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    const json = await runCli(['init', '--remove-agents', '--json'], project);
    expect(json.status).toBe(1);
    const env = JSON.parse(json.stdout);
    expect(env).toMatchObject({apiVersion: 1, code: 'ERR_PATH_TRAVERSAL'});
    expect(env.error).toMatch(
      /"CLAUDE\.md": resolves outside the project root/,
    );
    expect(env).not.toHaveProperty('data');

    const text = await runCli(['init', '--remove-agents'], project);
    expect(text.status).toBe(1);
    expect(text.stderr).toMatch(
      /^Error: .*"CLAUDE\.md": resolves outside the project root/m,
    );
    expect(text.stdout).not.toMatch(/removed/i);

    expect(fs.readFileSync(shared, 'utf-8')).toBe(content);
  }, 30_000);
});

describe('the managed block is written whatever ignore rules or generated markers say (INV31)', () => {
  /** @param {string} project @param {object} [options] */
  const run = (project, options = {}) => {
    /** @type {Array<[string, string]>} */
    const skipped = [];
    const written = installAgentDocs(project, {
      renderedBlock: BLOCK,
      onSkipped: (rel, reason) => skipped.push([rel, reason]),
      ...options,
    });
    return {written, skipped};
  };
  const OLD_BLOCK = '<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->';

  it('creates AGENTS.md and the GEMINI.md import even when ignore rules cover them', () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, '.gitignore'),
      'AGENTS.md\nGEMINI.md\n',
    );

    const {written, skipped} = run(project);

    expect(written).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(skipped).toEqual([]);
    expect(fs.readFileSync(path.join(project, 'GEMINI.md'), 'utf-8')).toContain(
      '@./AGENTS.md',
    );
  });

  it('adds the import to an ignored GEMINI.md and keeps its text', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), 'GEMINI.md\n');
    fs.writeFileSync(path.join(project, 'GEMINI.md'), '# My Gemini notes\n');

    const {written, skipped} = run(project);

    expect(written).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(skipped).toEqual([]);
    const gemini = fs.readFileSync(path.join(project, 'GEMINI.md'), 'utf-8');
    expect(gemini).toMatch(/^# My Gemini notes\n/u);
    expect(gemini).toContain('@./AGENTS.md');
  });

  it('adds the import to a GEMINI.md marked generated and keeps the marker', () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, 'GEMINI.md'),
      '<!-- @generated by tool -->\n# Gemini\n',
    );

    const {written} = run(project);

    expect(written).toEqual(['AGENTS.md', 'GEMINI.md']);
    const gemini = fs.readFileSync(path.join(project, 'GEMINI.md'), 'utf-8');
    expect(gemini).toMatch(/^<!-- @generated by tool -->\n# Gemini\n/u);
    expect(gemini).toContain('@./AGENTS.md');
  });

  it("writes the copy into an ignored .claude/CLAUDE.md beside the user's text", () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '.claude/\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const claude = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(claude, `# Mine\n\n${OLD_BLOCK}\n\nMore.\n`);

    const {written, skipped} = run(project);

    expect(written).toEqual(['AGENTS.md', '.claude/CLAUDE.md', 'GEMINI.md']);
    expect(skipped).toEqual([]);
    expect(fs.readFileSync(claude, 'utf-8')).toBe(
      `# Mine\n\n${BLOCK}\n\nMore.\n`,
    );
    expect(fs.readdirSync(path.join(project, '.claude'))).toEqual([
      'CLAUDE.md',
    ]);
  });

  it('still refuses a .claude/CLAUDE.md linked outside the project (INV10)', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, `${OLD_BLOCK}\n`);
    fs.mkdirSync(path.join(project, '.claude'));
    fs.symlinkSync(shared, path.join(project, '.claude', 'CLAUDE.md'));

    expect(() => run(project)).toThrow(/outside the project root/u);
    expect(fs.readFileSync(shared, 'utf-8')).toBe(`${OLD_BLOCK}\n`);
  });

  it('--agent claude creates .claude/CLAUDE.md as its option says, even in an ignored .claude', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '.claude/\n');

    const {written, skipped} = run(project, {agent: 'claude'});

    expect(written).toEqual(['.claude/CLAUDE.md']);
    expect(skipped).toEqual([]);
    expect(
      fs.readFileSync(path.join(project, '.claude', 'CLAUDE.md'), 'utf-8'),
    ).toContain(BLOCK);
  });

  it('creates the .claude folder for --agent claude in a plain project', () => {
    const {project} = layout();

    expect(
      installAgentDocs(project, {agent: 'claude', renderedBlock: BLOCK}),
    ).toEqual(['.claude/CLAUDE.md']);
    expect(fs.existsSync(path.join(project, '.claude', 'CLAUDE.md'))).toBe(
      true,
    );
  });
});

describe('a project with its own layout (INV31)', () => {
  it('gives a standalone GEMINI.md that imports no agent file a copy', () => {
    const {project} = layout();
    // AGENTS.md imports CLAUDE.md, so the project keeps its own layout.
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '@CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Claude\n');
    fs.writeFileSync(path.join(project, 'GEMINI.md'), '# Gemini\n');

    const written = installAgentDocs(project, {renderedBlock: BLOCK});

    expect(written).toContain('GEMINI.md');
    expect(fs.readFileSync(path.join(project, 'GEMINI.md'), 'utf-8')).toContain(
      BLOCK,
    );
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      '@CLAUDE.md\n',
    );
  });
});

describe('a GEMINI.md linked outside in its own layout, and an ignored root CLAUDE.md', () => {
  it('skips a GEMINI.md linked outside in a project with its own layout, and writes the rest', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    // AGENTS.md imports CLAUDE.md, so the project keeps its own layout.
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '@CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Claude\n');
    const shared = path.join(outside, 'GEMINI.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'GEMINI.md'));

    /** @type {Array<[string, string]>} */
    const skipped = [];
    const written = installAgentDocs(project, {
      renderedBlock: BLOCK,
      onSkipped: (rel, reason) => skipped.push([rel, reason]),
    });
    expect(written).toEqual(['CLAUDE.md']);
    expect(skipped).toEqual([
      ['GEMINI.md', expect.stringMatching(/outside the project root/u)],
    ]);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(0);
    expect(text.stderr).toMatch(/^Note: Left as it is: GEMINI\.md/mu);
    expect(text.stderr).not.toMatch(/Error:/u);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  }, 30_000);

  it('keeps, and refreshes, the committed .claude/CLAUDE.md copy while root CLAUDE.md is ignored', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(
      path.join(project, 'CLAUDE.md'),
      '# CLAUDE\n\nProject-specific guidance for AI coding agents.\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n',
    );
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(
      copy,
      '# Team\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n',
    );

    const written = installAgentDocs(project, {renderedBlock: BLOCK});

    expect(written).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toContain(
      BLOCK,
    );

    // The same with the user's own text in the ignored root CLAUDE.md.
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    installAgentDocs(project, {renderedBlock: BLOCK});
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toBe(
      `# Mine\n\n${BLOCK}\n`,
    );
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);

    // --agent claude keeps it too.
    installAgentDocs(project, {agent: 'claude', renderedBlock: BLOCK});
    expect(fs.readFileSync(copy, 'utf-8')).toContain(BLOCK);
  });
});

describe('third astracat round: first-run copy beside an ignored root, escapes below the root', () => {
  it('puts the copy in a committed .claude/CLAUDE.md on the first run while root CLAUDE.md is ignored', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(copy, '# Team\n');

    const written = installAgentDocs(project, {renderedBlock: BLOCK});

    expect(written).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
  });

  it('gives .claude/CLAUDE.md no copy on the first run when it is ignored too', () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, '.gitignore'),
      '/CLAUDE.md\n.claude/\n',
    );
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(copy, '# Team\n');

    expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readFileSync(copy, 'utf-8')).toBe('# Team\n');
  });

  it('--agent all writes .claude/CLAUDE.md beside an ignored root CLAUDE.md', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(copy, '# Team\n');

    const written = installAgentDocs(project, {
      agent: 'all',
      renderedBlock: BLOCK,
    });

    expect(written).toEqual(
      expect.arrayContaining(['CLAUDE.md', '.claude/CLAUDE.md']),
    );
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
  });

  it('run from a subfolder, skips a root CLAUDE.md linked outside with a note and exits 0', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));
    const sub = path.join(project, 'src');
    fs.mkdirSync(sub);

    const json = await runCli(['init', '--features', 'agents', '--json'], sub);
    expect(json.status).toBe(0);
    const {data} = JSON.parse(json.stdout);
    expect(data.docsWritten).toEqual(['../AGENTS.md', '../GEMINI.md']);
    expect(data.docsError).toEqual({
      kind: 'install-failed',
      message: expect.stringMatching(
        /^Left as it is: CLAUDE\.md \(.*outside the project root/u,
      ),
    });

    const text = await runCli(['init', '--features', 'agents'], sub);
    expect(text.status).toBe(0);
    expect(text.stderr).toMatch(/^Note: Left as it is: CLAUDE\.md/mu);
    expect(text.stderr).not.toMatch(/Error:/u);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');

    // Run at the root, where 0.7.1 wrote it too, the escape still exits 1.
    const atRoot = await runCli(['init', '--features', 'agents'], project);
    expect(atRoot.status).toBe(1);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  }, 60_000);
});

describe('a monorepo package whose CLAUDE.md the repository root ignores', () => {
  it.skipIf(spawnSync('git', ['--version']).status !== 0)(
    'keeps and refreshes the committed .claude/CLAUDE.md copy',
    () => {
      const repo = path.join(tmpDir, 'repo');
      const project = path.join(repo, 'apps', 'web');
      fs.mkdirSync(repo, {recursive: true});
      spawnSync('git', ['init', '-q'], {cwd: repo});
      fs.mkdirSync(path.join(project, '.claude'), {recursive: true});
      fs.writeFileSync(path.join(repo, '.gitignore'), 'apps/web/CLAUDE.md\n');
      fs.writeFileSync(path.join(project, 'package.json'), '{"name":"web"}\n');
      fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
      const copy = path.join(project, '.claude', 'CLAUDE.md');
      fs.writeFileSync(
        copy,
        '# Team\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n',
      );

      const written = installAgentDocs(project, {renderedBlock: BLOCK});

      expect(written).toEqual([
        'AGENTS.md',
        'CLAUDE.md',
        '.claude/CLAUDE.md',
        'GEMINI.md',
      ]);
      expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);

      // Without the repository-root rule, the copy moves to root CLAUDE.md.
      fs.writeFileSync(path.join(repo, '.gitignore'), '');
      installAgentDocs(project, {renderedBlock: BLOCK});
      expect(fs.readFileSync(copy, 'utf-8')).toBe('# Team\n');
    },
  );
});

describe('a Mercurial monorepo whose root .hgignore excludes the package CLAUDE.md', () => {
  for (const [label, rules] of [
    ['glob syntax', 'syntax: glob\napps/web/CLAUDE.md\n'],
    ['regexp syntax', '^apps/web/CLAUDE\\.md$\n'],
  ]) {
    it(`keeps the committed .claude/CLAUDE.md copy (${label})`, () => {
      const repo = path.join(tmpDir, 'hgrepo');
      const project = path.join(repo, 'apps', 'web');
      fs.mkdirSync(path.join(repo, '.hg'), {recursive: true});
      fs.mkdirSync(path.join(project, '.claude'), {recursive: true});
      fs.writeFileSync(path.join(repo, '.hgignore'), rules);
      fs.writeFileSync(path.join(project, 'package.json'), '{"name":"web"}\n');
      fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
      const copy = path.join(project, '.claude', 'CLAUDE.md');
      fs.writeFileSync(copy, '# Team\n');

      const written = installAgentDocs(project, {renderedBlock: BLOCK});

      expect(written).toEqual([
        'AGENTS.md',
        'CLAUDE.md',
        '.claude/CLAUDE.md',
        'GEMINI.md',
      ]);
      expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
    });
  }

  /**
   * Run `fn` with a search path holding only `tools`: name to the shell
   * script body that stands in for it, or null for a real command found on
   * the current search path. A tool left out cannot be found.
   * @param {Record<string, string | null>} tools
   * @param {() => void} fn
   */
  function withTools(tools, fn) {
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-tools-'));
    const saved = process.env.PATH;
    try {
      for (const [name, body] of Object.entries(tools)) {
        const file = path.join(bin, name);
        if (body == null) {
          const real = spawnSync('sh', ['-c', `command -v ${name}`], {
            encoding: 'utf-8',
          }).stdout.trim();
          fs.symlinkSync(real, file);
        } else {
          fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, {mode: 0o755});
        }
      }
      process.env.PATH = bin;
      fn();
    } finally {
      process.env.PATH = saved;
      fs.rmSync(bin, {recursive: true, force: true});
    }
  }

  /** A Mercurial monorepo whose package keeps a committed .claude copy. */
  function hgProject() {
    const repo = fs.mkdtempSync(path.join(tmpDir, 'hgrepo-'));
    const project = path.join(repo, 'apps', 'web');
    fs.mkdirSync(path.join(repo, '.hg'), {recursive: true});
    fs.mkdirSync(path.join(project, '.claude'), {recursive: true});
    fs.writeFileSync(
      path.join(repo, '.hgignore'),
      'syntax: glob\napps/web/CLAUDE.md\n',
    );
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"web"}\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(
      copy,
      '# Team\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n',
    );
    return {project, copy};
  }

  it.skipIf(process.platform === 'win32').each([
    ['hg is not installed', {}],
    ['hg fails', {hg: 'exit 255'}],
    ['hg exits with a code it does not document', {hg: 'exit 2'}],
  ])(
    'keeps the copy when the repository cannot answer: %s (fails closed)',
    (_label, tools) => {
      const {project, copy} = hgProject();
      withTools(tools, () => installAgentDocs(project, {renderedBlock: BLOCK}));
      expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'follows the repository when it answers: a root CLAUDE.md it does not list as ignored moves the copy',
    () => {
      const {project, copy} = hgProject();
      // hg answers, and lists nothing as untracked and ignored.
      withTools({hg: 'exit 0'}, () =>
        installAgentDocs(project, {renderedBlock: BLOCK}),
      );
      expect(fs.readFileSync(copy, 'utf-8').trimEnd()).toBe('# Team');
    },
  );
});

describe('below the project root, an AGENTS.md left as it is', () => {
  it('skips the GEMINI.md import of it too (no import for doctor to fail on) and names both in one note', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'AGENTS.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'AGENTS.md'));
    const sub = path.join(project, 'src');
    fs.mkdirSync(sub);

    const json = await runCli(['init', '--features', 'agents', '--json'], sub);
    expect(json.status).toBe(0);
    const {data} = JSON.parse(json.stdout);
    expect(data.docsWritten).toEqual([]);
    expect(data.docsError.message).toMatch(
      /^Left as they are: AGENTS\.md \(.*outside the project root.*\); GEMINI\.md \(its import of AGENTS\.md/u,
    );
    expect(fs.existsSync(path.join(project, 'GEMINI.md'))).toBe(false);

    const text = await runCli(['init', '--features', 'agents'], sub);
    expect(text.status).toBe(0);
    expect(text.stderr.split('\n').filter(Boolean)).toEqual([
      expect.stringMatching(
        /^Note: Left as they are: AGENTS\.md .*; GEMINI\.md /u,
      ),
    ]);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  }, 60_000);
});

describe('round 6: an ignored .claude/CLAUDE.md follows the usual rule; --agent claude refreshes a kept copy', () => {
  const OLD = '<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->';

  it('strips the block from an ignored .claude/CLAUDE.md once the ignored root CLAUDE.md holds it', () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, '.gitignore'),
      '/CLAUDE.md\n.claude/\n',
    );
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(copy, `# Team\n\n${OLD}\n`);

    const written = installAgentDocs(project, {renderedBlock: BLOCK});

    expect(written).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readFileSync(copy, 'utf-8').trimEnd()).toBe('# Team');
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toContain(
      BLOCK,
    );

    // --agent claude follows the same rule.
    fs.writeFileSync(copy, `# Team\n\n${OLD}\n`);
    installAgentDocs(project, {agent: 'claude', renderedBlock: BLOCK});
    expect(fs.readFileSync(copy, 'utf-8').trimEnd()).toBe('# Team');
  });

  it('keeps and refreshes a committed .claude/CLAUDE.md block with --agent claude beside an ignored root', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(copy, `# Team\n\n${OLD}\n`);

    const written = installAgentDocs(project, {
      agent: 'claude',
      renderedBlock: BLOCK,
    });

    expect(written).toEqual(['CLAUDE.md', '.claude/CLAUDE.md']);
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toBe(
      `# Mine\n\n${BLOCK}\n`,
    );
  });

  it('--agent claude writes the committed .claude/CLAUDE.md copy on a first run beside an ignored root', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(copy, '# Team\n');

    const written = installAgentDocs(project, {
      agent: 'claude',
      renderedBlock: BLOCK,
    });

    expect(written).toEqual(['CLAUDE.md', '.claude/CLAUDE.md']);
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
  });

  it('--agent claude creates no .claude/CLAUDE.md beside an ignored root when there is none', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');

    expect(
      installAgentDocs(project, {agent: 'claude', renderedBlock: BLOCK}),
    ).toEqual(['CLAUDE.md']);
    expect(fs.existsSync(path.join(project, '.claude'))).toBe(false);
  });
});

describe('round 8: refreshing a committed .claude copy that imports AGENTS.md; a linked .claude with --agent claude', () => {
  it('refreshes a committed .claude/CLAUDE.md that imports AGENTS.md beside an ignored root', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(copy, '@../AGENTS.md\n');
    const OLD = '<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->';

    installAgentDocs(project, {renderedBlock: OLD});
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`@../AGENTS.md\n\n${OLD}\n`);

    // An upgrade's refresh, twice: the copy follows the installed release.
    for (let round = 0; round < 2; round++) {
      const written = installAgentDocs(project, {
        onlyReplace: true,
        renderedBlock: BLOCK,
      });
      if (round === 0) expect(written).toContain('.claude/CLAUDE.md');
      expect(fs.readFileSync(copy, 'utf-8')).toBe(
        `@../AGENTS.md\n\n${BLOCK}\n`,
      );
    }
  });

  it('refreshes a kept .claude/CLAUDE.md copy in a project with its own layout', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    // AGENTS.md imports CLAUDE.md, so the project keeps its own layout.
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '@CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(
      copy,
      '@../CLAUDE.md\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n',
    );

    installAgentDocs(project, {renderedBlock: BLOCK});
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`@../CLAUDE.md\n\n${BLOCK}\n`);
  });

  it('skips a linked-outside block-less import of an existing AGENTS.md (the shape 0.7.x left alone), with a note, exit 0', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Agents\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.writeFileSync(path.join(outside, 'CLAUDE.md'), '@../AGENTS.md\n');
    fs.symlinkSync(outside, path.join(project, '.claude'), 'dir');

    /** @type {Array<[string, string]>} */
    const skipped = [];
    const written = installAgentDocs(project, {
      renderedBlock: BLOCK,
      onSkipped: (rel, reason) => skipped.push([rel, reason]),
    });
    expect(written).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
    expect(skipped).toEqual([
      ['.claude/CLAUDE.md', expect.stringMatching(/outside the project root/u)],
    ]);
    expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
      '@../AGENTS.md\n',
    );

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(0);
    expect(text.stderr).toMatch(/^Note: Left as it is: \.claude\/CLAUDE\.md/mu);
    expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
      '@../AGENTS.md\n',
    );
  }, 30_000);

  for (const [label, contents, withAgents] of [
    ['plain text', '# Shared\n', true],
    ['a block', '<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n', true],
    ['an import made before AGENTS.md exists', '@../AGENTS.md\n', false],
  ]) {
    it(`still refuses a linked-outside .claude/CLAUDE.md that 0.7.x wrote (${label}): exit 1, nothing written`, async () => {
      const {project, outside} = layout();
      fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
      fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
      if (withAgents)
        fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Agents\n');
      fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
      fs.writeFileSync(path.join(outside, 'CLAUDE.md'), contents);
      fs.symlinkSync(outside, path.join(project, '.claude'), 'dir');
      const before = fs.readdirSync(project).sort();

      const r = await runCli(
        ['init', '--features', 'agents', '--json'],
        project,
      );
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).data.docsError.kind).toBe('path-safety');
      expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
        contents,
      );
      expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toBe(
        '# Mine\n',
      );
      expect(fs.readdirSync(project).sort()).toEqual(before);
    }, 30_000);
  }

  it('--agent claude skips a .claude linked outside beside an ignored root, with a note, and writes CLAUDE.md', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.writeFileSync(path.join(outside, 'CLAUDE.md'), '# Shared\n');
    fs.symlinkSync(outside, path.join(project, '.claude'), 'dir');

    /** @type {Array<[string, string]>} */
    const skipped = [];
    const written = installAgentDocs(project, {
      agent: 'claude',
      renderedBlock: BLOCK,
      onSkipped: (rel, reason) => skipped.push([rel, reason]),
    });
    expect(written).toEqual(['CLAUDE.md']);
    expect(skipped).toEqual([
      ['.claude/CLAUDE.md', expect.stringMatching(/outside the project root/u)],
    ]);
    expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
      '# Shared\n',
    );

    const text = await runCli(
      ['init', '--features', 'agents', '--agent', 'claude'],
      project,
    );
    expect(text.status).toBe(0);
    expect(text.stderr).toMatch(/^Note: Left as it is: \.claude\/CLAUDE\.md/mu);
    expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
      '# Shared\n',
    );
  }, 30_000);
});

describe('--agent claude beside a committed CLAUDE.md, with .claude linked outside and holding a block', () => {
  it('writes CLAUDE.md, skips the .claude/CLAUDE.md block removal with a note, and exits 0, as 0.7.1 did', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    const body = '# Team\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n';
    fs.writeFileSync(path.join(outside, 'CLAUDE.md'), body);
    fs.symlinkSync(outside, path.join(project, '.claude'), 'dir');

    const r = await runCli(
      ['init', '--features', 'agents', '--agent', 'claude', '--json'],
      project,
    );
    expect(r.status).toBe(0);
    const {data} = JSON.parse(r.stdout);
    expect(data.docsWritten).toEqual(['CLAUDE.md']);
    expect(data.docsError.message).toMatch(
      /^Left as it is: \.claude\/CLAUDE\.md \(.*outside the project root/u,
    );
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toContain(
      BLOCK.split('\n')[0],
    );
    expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
      body,
    );
  }, 30_000);
});

describe('a .claude folder linked outside the project: exit parity with 0.7.1 at the project root', () => {
  // Each row: preset, root CLAUDE.md (none, committed, or ignored), what the
  // linked .claude/CLAUDE.md holds (plain text, a block, or a block-less import
  // of AGENTS.md), and the exit (1 = the run refused, nothing written). Each
  // matches 0.7.1, checked across every preset, layout, root state, linked
  // .claude, AGENTS.md and GEMINI.md combination, except the three rows marked
  // `0.7.1: 1`: there 0.7.1 wrote the linked .claude/CLAUDE.md and refused,
  // while root CLAUDE.md now holds the copy and .claude/CLAUDE.md gets none, so
  // nothing is written outside and nothing is refused.
  const OLD = '<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->';
  const BODY = {
    plain: '# Team\n',
    block: `# Team\n\n${OLD}\n`,
    import: '@../AGENTS.md\n',
  };
  for (const [preset, root, dir, exit] of /** @type {const} */ ([
    ['default', 'none', 'plain', 1],
    ['default', 'none', 'block', 1],
    ['default', 'none', 'import', 0],
    ['default', 'committed', 'plain', 0] /* 0.7.1: 1 */,
    ['default', 'committed', 'block', 1],
    ['default', 'committed', 'import', 0],
    ['default', 'ignored', 'plain', 1],
    ['default', 'ignored', 'block', 1],
    ['default', 'ignored', 'import', 0],
    ['claude', 'none', 'plain', 1],
    ['claude', 'none', 'block', 1],
    ['claude', 'none', 'import', 1],
    ['claude', 'committed', 'plain', 0],
    ['claude', 'committed', 'block', 0],
    ['claude', 'committed', 'import', 0],
    ['claude', 'ignored', 'plain', 0],
    ['claude', 'ignored', 'block', 0],
    ['claude', 'ignored', 'import', 0],
    ['all', 'none', 'plain', 1],
    ['all', 'none', 'block', 1],
    ['all', 'none', 'import', 1],
    ['all', 'committed', 'plain', 0] /* 0.7.1: 1 */,
    ['all', 'committed', 'block', 1],
    ['all', 'committed', 'import', 0] /* 0.7.1: 1 */,
    ['all', 'ignored', 'plain', 1],
    ['all', 'ignored', 'block', 1],
    ['all', 'ignored', 'import', 1],
  ])) {
    it(`${preset}, root ${root}, .claude holds ${dir}: exit ${exit}`, () => {
      const {project, outside} = layout();
      fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Agents\n');
      if (root !== 'none')
        fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
      if (root === 'ignored')
        fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
      fs.writeFileSync(path.join(outside, 'CLAUDE.md'), BODY[dir]);
      fs.symlinkSync(outside, path.join(project, '.claude'), 'dir');

      const run = () =>
        installAgentDocs(project, {
          agent: preset === 'default' ? undefined : preset,
          renderedBlock: BLOCK,
          onSkipped: () => {},
        });
      if (exit === 1) {
        expect(run).toThrow(PathSafetyError);
        expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
          '# Agents\n',
        );
      } else {
        expect(run).not.toThrow();
      }
      expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
        BODY[dir],
      );
    });
  }
});

describe('a root CLAUDE.md linked outside the project that only imports AGENTS.md (0.7.1 left it alone)', () => {
  it('is skipped with a note and init exits 0 at the project root; the rest is written', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Agents\n');
    fs.writeFileSync(path.join(outside, 'CLAUDE.md'), '@AGENTS.md\n');
    fs.symlinkSync(
      path.join(outside, 'CLAUDE.md'),
      path.join(project, 'CLAUDE.md'),
    );

    const r = await runCli(['init', '--features', 'agents', '--json'], project);
    expect(r.status).toBe(0);
    const {data} = JSON.parse(r.stdout);
    expect(data.docsWritten).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(data.docsError.message).toMatch(
      /^Left as it is: CLAUDE\.md \(.*outside the project root/u,
    );
    expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
      '@AGENTS.md\n',
    );
  }, 30_000);
});

describe('a tracked .claude/CLAUDE.md is committed, whatever the ignore files say (INV31)', () => {
  /** @param {string} cwd @param {...string} args */
  const git = (cwd, ...args) => {
    const r = spawnSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@e', ...args],
      {
        cwd,
        encoding: 'utf-8',
      },
    );
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  };

  it.skipIf(spawnSync('git', ['--version']).status !== 0)(
    'keeps the copy in a tracked .claude/CLAUDE.md when an unanchored CLAUDE.md rule ignores both',
    () => {
      const {project} = layout();
      git(project, 'init', '-q');
      fs.writeFileSync(path.join(project, '.gitignore'), 'CLAUDE.md\n');
      fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
      fs.mkdirSync(path.join(project, '.claude'));
      const copy = path.join(project, '.claude', 'CLAUDE.md');
      fs.writeFileSync(copy, '# Team\n');
      // Tracked despite the rule, as `git add -f` leaves it.
      git(project, 'add', '-f', '.gitignore', '.claude/CLAUDE.md');
      git(project, 'commit', '-q', '-m', 'team claude file');

      expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
        'AGENTS.md',
        'CLAUDE.md',
        '.claude/CLAUDE.md',
        'GEMINI.md',
      ]);
      expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
      // --agent claude keeps it too.
      installAgentDocs(project, {agent: 'claude', renderedBlock: BLOCK});
      expect(fs.readFileSync(copy, 'utf-8')).toContain(BLOCK);
    },
  );

  it.skipIf(spawnSync('git', ['--version']).status !== 0)(
    'strips the block from an untracked .claude/CLAUDE.md the same rule ignores',
    () => {
      const {project} = layout();
      git(project, 'init', '-q');
      fs.writeFileSync(path.join(project, '.gitignore'), 'CLAUDE.md\n');
      fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
      fs.mkdirSync(path.join(project, '.claude'));
      const copy = path.join(project, '.claude', 'CLAUDE.md');
      fs.writeFileSync(
        copy,
        '# Team\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n',
      );

      installAgentDocs(project, {renderedBlock: BLOCK});
      expect(fs.readFileSync(copy, 'utf-8').trimEnd()).toBe('# Team');
    },
  );

  for (const [label, setUp] of [
    [
      "the repository's local exclude file",
      (/** @type {string} */ project) =>
        fs.appendFileSync(
          path.join(project, '.git', 'info', 'exclude'),
          '/CLAUDE.md\n',
        ),
    ],
    [
      'a configured excludes file',
      (/** @type {string} */ project) => {
        const excludes = path.join(project, '..', 'global-excludes');
        fs.writeFileSync(excludes, 'CLAUDE.md\n');
        git(project, 'config', 'core.excludesFile', excludes);
      },
    ],
  ]) {
    it.skipIf(spawnSync('git', ['--version']).status !== 0)(
      `keeps the copy in a tracked .claude/CLAUDE.md while ${label} ignores an untracked root CLAUDE.md`,
      () => {
        const {project} = layout();
        git(project, 'init', '-q');
        setUp(project);
        fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
        fs.mkdirSync(path.join(project, '.claude'));
        const copy = path.join(project, '.claude', 'CLAUDE.md');
        fs.writeFileSync(copy, '# Team\n');
        git(project, 'add', '-f', '.claude/CLAUDE.md');
        git(project, 'commit', '-q', '-m', 'team claude file');

        expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
          'AGENTS.md',
          'CLAUDE.md',
          '.claude/CLAUDE.md',
          'GEMINI.md',
        ]);
        expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
      },
    );
  }

  it('keeps the copy when the repository cannot say what it ignores or tracks (fails closed)', () => {
    const {project} = layout();
    // A .git that git cannot read.
    fs.writeFileSync(path.join(project, '.git'), 'gitdir: /nowhere/.git\n');
    fs.writeFileSync(path.join(project, '.gitignore'), 'CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(copy, '# Team\n');

    installAgentDocs(project, {renderedBlock: BLOCK});
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`# Team\n\n${BLOCK}\n`);
  });
});

describe("init's exit-code help names every soft exit-0 case these tests pin", () => {
  const exit0 = initDoc.exitCodes.find(entry => entry.code === 0)?.when ?? '';
  it.each([
    ['the home or a settings folder', /home folder, or in a settings folder/u],
    [
      'a GEMINI.md that resolves outside the project',
      /a GEMINI\.md that resolves outside the project/u,
    ],
    [
      'a project-root file below the root',
      /below the project root, a project-root agent file/u,
    ],
    [
      "the project's Claude Code file that only imports an existing AGENTS.md",
      /Claude Code file \(root CLAUDE\.md, or \.claude\/CLAUDE\.md when there is no root one\)[^;]*block-less import of an existing AGENTS\.md/u,
    ],
    [
      'beside an ignored CLAUDE.md, the copy --agent claude adds or a block-less import',
      /beside a CLAUDE\.md the project ignores, the one --agent claude adds or a block-less import of an existing AGENTS\.md/u,
    ],
    [
      '--agent claude removing a block beside a CLAUDE.md',
      /with --agent claude beside a CLAUDE\.md, one whose block it would remove/u,
    ],
  ])('%s', (_label, pattern) => {
    expect(exit0).toMatch(pattern);
  });
});

describe('init exit codes and output', () => {
  it('an ignored GEMINI.md with notes: written through, exit 0, nothing on stderr', async () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    fs.writeFileSync(path.join(project, '.gitignore'), 'GEMINI.md\n');
    fs.writeFileSync(path.join(project, 'GEMINI.md'), '# My Gemini notes\n');

    const json = await runCli(
      ['init', '--features', 'agents', '--json'],
      project,
    );
    expect(json.status).toBe(0);
    const {data} = JSON.parse(json.stdout);
    expect(data.docsWritten).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(data.docsError).toBeNull();

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(0);
    expect(text.stderr).toBe('');
  }, 30_000);

  it('a path that escapes the project still exits 1, as in 0.7.1', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(1);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  }, 30_000);
});

describe("the sandbox app's postinstall stays quiet", () => {
  // apps/sandbox runs `astryx init --features agents` on every install, and its
  // .gitignore lists the files init writes there.
  const sandboxIgnore = fs.readFileSync(
    new URL('../../../../apps/sandbox/.gitignore', import.meta.url),
    'utf-8',
  );

  it('prints nothing on stderr on a fresh install, a second install, or with an old .claude/CLAUDE.md init wrote', async () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, 'package.json'),
      '{"name":"sandbox"}\n',
    );
    fs.writeFileSync(path.join(project, '.gitignore'), sandboxIgnore);

    for (let round = 0; round < 2; round++) {
      const r = await runCli(['init', '--features', 'agents'], project);
      expect(r.status, `round ${round}`).toBe(0);
      expect(r.stderr, `round ${round}`).toBe('');
    }

    // A dev machine where an older init created .claude/CLAUDE.md.
    fs.mkdirSync(path.join(project, '.claude'), {recursive: true});
    const claude = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(
      claude,
      '# CLAUDE\n\nProject-specific guidance for AI coding agents.\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n',
    );
    const r = await runCli(['init', '--features', 'agents'], project);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    expect(fs.readFileSync(claude, 'utf-8')).not.toContain('\nold\n');
  }, 60_000);
});

describe('removing the copy in .claude/CLAUDE.md', () => {
  it('removes only the managed block, keeps the user text, and only once root CLAUDE.md holds the same block', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Claude\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const dirFile = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(
      dirFile,
      `# My notes\nKeep this guidance.\n\n${BLOCK}\n\nAnd this.\n`,
    );

    expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readFileSync(dirFile, 'utf-8').trimEnd()).toBe(
      '# My notes\nKeep this guidance.\n\nAnd this.',
    );
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toContain(
      BLOCK,
    );
  });

  it('keeps the copy when root CLAUDE.md does not end up holding the same block', () => {
    const {project} = layout();
    // A root CLAUDE.md with a malformed block is refused before any write, so
    // the copy in .claude/CLAUDE.md stays where it is.
    fs.writeFileSync(
      path.join(project, 'CLAUDE.md'),
      '<!-- ASTRYX:START -->\nbroken\n',
    );
    fs.mkdirSync(path.join(project, '.claude'));
    const dirFile = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(dirFile, `${BLOCK}\n`);

    expect(() => installAgentDocs(project, {renderedBlock: BLOCK})).toThrow(
      /Malformed/u,
    );
    expect(fs.readFileSync(dirFile, 'utf-8')).toBe(`${BLOCK}\n`);
  });

  it('deletes .claude/CLAUDE.md only when nothing but whitespace is left', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Claude\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const dirFile = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(dirFile, `\n\n${BLOCK}\n  \n`);

    installAgentDocs(project, {renderedBlock: BLOCK});

    expect(fs.existsSync(dirFile)).toBe(false);
  });
});

describe('removeXdsBlock deletes only a file init created', () => {
  it('keeps a file whose own text mentions guidance (the 0.7.0 heading match deleted it)', () => {
    const {project} = layout();
    const file = path.join(project, 'AGENTS.md');
    fs.writeFileSync(
      file,
      `# Team rules\nOur guidance for reviewers.\n\n${BLOCK}\n`,
    );

    expect(removeXdsBlock(file, {deleteIfEmpty: true})).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toBe(
      '# Team rules\nOur guidance for reviewers.\n',
    );
  });

  it('deletes a file that holds only the heading init writes', () => {
    const {project} = layout();
    const file = path.join(project, 'AGENTS.md');
    fs.writeFileSync(
      file,
      `# AGENTS.md\n\nProject-specific guidance for AI coding agents.\n\n${BLOCK}\n`,
    );

    expect(removeXdsBlock(file, {deleteIfEmpty: true})).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });
});
