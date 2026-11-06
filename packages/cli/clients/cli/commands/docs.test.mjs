// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {Command} from 'commander';
import {formatBlock, registerDocs} from './docs.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {displayWidth} from '../formatters/index.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-docs-test-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
  vi.restoreAllMocks();
});

function createProgram() {
  const program = new Command();
  program.exitOverride(); // Throw instead of calling process.exit
  registerDocs(program);
  return program;
}

describe('registerDocs', () => {
  it('lists available topics when no topic given', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'astryx', 'docs']);

    const output = console.log.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('principles');
    expect(output).toContain('tokens');
    expect(output).not.toContain('shadcn-compatibility');
  });

  it('errors for unknown topic', async () => {
    const program = createProgram();
    vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`exit ${code}`);
    });

    await expect(
      program.parseAsync(['node', 'astryx', 'docs', 'nonexistent']),
    ).rejects.toThrow('exit 1');

    const errorOutput = console.error.mock.calls.map(c => c[0]).join('\n');
    expect(errorOutput).toContain('Unknown topic');
  });
});

describe('hyphenated doc filenames', () => {
  it('lists hyphenated topics like getting-started', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'astryx', 'docs']);

    const output = console.log.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('getting-started');
  });

  it('loads a hyphenated topic by name', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'astryx', 'docs', 'getting-started']);

    const output = console.log.mock.calls.map(c => c[0]).join('\n');
    expect(output.length).toBeGreaterThan(0);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('returns docs.detail via API for hyphenated topic', async () => {
    const {docs: docsApi} = await import('../../../api/docs/docs.mjs');
    const result = await docsApi('getting-started', undefined, {full: true});
    expect(result.type).toBe('docs.detail');
    expect(result.data).toBeDefined();
    expect(result.data.description).toBeDefined();
  });
});

describe('migration docs', () => {
  it('lists the migration topic', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'astryx', 'docs']);

    const output = console.log.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('migration');
    expect(output).toContain('Tailwind');
  });

  it('loads migration docs by topic name', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'astryx', 'docs', 'migration']);

    const output = console.log.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Migration');
    expect(output).toContain('migration');
  });
});

describe('progressive reads', () => {
  const SLOW = 60_000;
  /** @param {string} out */
  const widest = out => Math.max(...out.split('\n').map(line => line.length));

  it('lists every topic on one line each', async () => {
    const {status, stdout} = await runCli(['docs']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^principles +\S/m);
    expect(widest(stdout)).toBeLessThanOrEqual(120);
    // The repo root has no `astryx` bin, so the CLI names the scoped package.
    expect(stdout).toMatch(/Usage: \S+(?: dlx)? (?:astryx|@astryxdesign\/cli(?:@\S+)?) docs <topic>/);
  }, SLOW);

  it("prints a topic's section index with the keys to read by", async () => {
    const {status, stdout} = await runCli(['docs', 'theme', '--index']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^quick-start +Wrap your app in a theme/m);
    expect(stdout).toContain('docs theme <section>');
    expect(stdout).toMatch(/Read everything: +\S.* docs theme --full$/m);
    expect(widest(stdout)).toBeLessThanOrEqual(120);
  }, SLOW);

  it('prints one section by its key', async () => {
    const {status, stdout} = await runCli(['docs', 'theme', 'quick-start']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^## Wrap your app in a theme/m);
  }, SLOW);

  it("lists a topic's sections by default; --full prints the whole topic", async () => {
    const index = await runCli(['docs', 'theme', '--index']);
    expect((await runCli(['docs', 'theme'])).stdout).toBe(index.stdout);
    const full = await runCli(['docs', 'theme', '--full']);
    expect(full.status).toBe(0);
    expect(full.stdout).toMatch(/^## Wrap your app in a theme/m);
    expect(full.stdout.length).toBeGreaterThan(index.stdout.length);
    expect((await runCli(['--detail', 'full', 'docs', 'theme', '--full'])).stdout).toBe(
      full.stdout,
    );
  }, SLOW);

  it('returns the matching envelopes as JSON', async () => {
    const envelope = async args => JSON.parse((await runCli([...args, '--json'])).stdout);
    // JSON keeps docs(): a bare read is the whole topic.
    expect((await envelope(['docs', 'theme'])).type).toBe('docs.detail');
    expect((await envelope(['docs', 'theme', '--full'])).type).toBe('docs.detail');
    expect((await envelope(['docs', 'theme', '--index'])).type).toBe(
      'docs.index',
    );
    expect((await envelope(['docs', 'theme', 'quick-start'])).type).toBe(
      'docs.detail.section',
    );
  }, SLOW);
});

describe('blocks as text', () => {
  const SLOW = 60_000;

  it('prints a code label above the fence, never inside it', () => {
    for (const lang of ['bash', 'css', 'json', 'html', 'text', 'tsx']) {
      expect(
        formatBlock({type: 'code', lang, label: 'Terminal', code: 'x'}, 'full'),
      ).toBe(`Terminal:\n\`\`\`${lang}\nx\n\`\`\``);
    }
    expect(formatBlock({type: 'code', lang: 'bash', code: 'x'}, 'full')).toBe(
      '```bash\nx\n```',
    );
    // A label that already ends in a colon does not get a second one.
    expect(
      formatBlock({type: 'code', lang: 'css', label: 'globals.css:', code: 'x'}, 'full'),
    ).toBe('globals.css:\n```css\nx\n```');
  });

  it('escapes pipes in table cells, so a union type stays one column', () => {
    const table = {
      type: /** @type {const} */ ('table'),
      headers: ['Prop', 'Type', 'Default'],
      rows: [
        ['mode', "'system' | 'light' | 'dark'", "'system'"],
        ['theme', 'DefinedTheme', '-'],
      ],
    };
    const lines = /** @type {string} */ (formatBlock(table, 'full')).split('\n');
    expect(lines).toHaveLength(4);
    // Every line has exactly two column separators, all at the same place.
    for (const line of lines) expect(line.split(' | ')).toHaveLength(3);
    expect(new Set(lines.map(line => line.indexOf(' | '))).size).toBe(1);
    expect(lines[2]).toContain("'system' \\| 'light' \\| 'dark'");
    expect(formatBlock(table, 'brief')).toBe(
      "mode='system' \\| 'light' \\| 'dark' | theme=DefinedTheme",
    );
  });

  it('prints the labels of a real section above their fences', async () => {
    const {status, stdout} = await runCli(['docs', 'theme', 'quick-start']);
    expect(status).toBe(0);
    expect(stdout).toContain('Wire the generated module once:\n```tsx\nimport {Theme}');
  }, SLOW);
});

describe('the docs tree, one level at a time', () => {
  const SLOW = 60_000;
  /** @param {string} out */
  const widest = out => Math.max(...out.split('\n').map(line => line.length));

  it('lists the docs tree first, under its own heading, then the topics', async () => {
    const {status, stdout} = await runCli(['docs']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^Docs tree$/m);
    expect(stdout).toMatch(/^Topics$/m);
    expect(stdout).toMatch(/^cli +Commands, programmatic APIs/m);
    expect(stdout.indexOf('\ncli ')).toBeLessThan(stdout.indexOf('\nprinciples '));
    expect(stdout).not.toMatch(/^cli-integrations /m);
  }, SLOW);

  it("shows a child's own name when its route name does not spell it", async () => {
    const {status, stdout} = await runCli(['docs', 'cli/api/functions']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^assert-response +assertResponse\(\): \S/m);
    expect(stdout).toMatch(/^search +search\(\): Unified ranked search/m);
  }, SLOW);

  it('wraps namespace summaries without discarding searchable words', async () => {
    const {status, stdout} = await runCli([
      'docs',
      'authoring/building-blocks/templates',
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^start-a-template +Help others build apps faster/m);
    expect(stdout).not.toMatch(/^start-a-template +Start a template:/m);
    expect(stdout).toMatch(/full page or page\s+section\./);
    expect(widest(stdout)).toBeLessThanOrEqual(120);
  }, SLOW);

  it('prints a namespace: each slot, its children, and how to go down and up', async () => {
    const {status, stdout} = await runCli(['docs', 'cli/api']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^API$/m);
    expect(stdout).toMatch(/^Reference$/m);
    expect(stdout).toMatch(/^functions +Every function/m);
    expect(stdout).toMatch(/^schemas +/m);
    expect(stdout).toMatch(/^enums +/m);
    // One level only: no function is listed on the api page.
    expect(stdout).not.toMatch(/^search +/m);
    expect(stdout).toMatch(/Open one: .*docs cli\/api\/<name>$/m);
    expect(stdout).toMatch(/Up: .*docs cli$/m);
    expect(widest(stdout)).toBeLessThanOrEqual(120);
  }, SLOW);

  it('prints a typed doc and the way back up', async () => {
    const {status, stdout} = await runCli(['docs', 'cli/api/functions/search']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^## search\(\)/m);
    expect(stdout).toMatch(/Read it with `.+ docs cli\/commands\/search`\./);
    expect(stdout).toMatch(/Up: .*docs cli\/api\/functions$/m);
  }, SLOW);

  it('reads the dense variant whole, asked with --dense or with --lang dense', async () => {
    for (const args of [['--dense', 'docs', 'theme'], ['--lang', 'dense', 'docs', 'theme']]) {
      const {status, stdout} = await runCli(args);
      expect(status).toBe(0);
      expect(stdout).not.toContain('Read one section:');
    }
  }, SLOW);

  it('refuses --index with --full', async () => {
    const both = await runCli(['docs', 'theme', '--index', '--full', '--json']);
    expect(both.status).toBe(1);
    expect(JSON.parse(both.stdout).code).toBe('ERR_INVALID_ARGUMENT');
  }, SLOW);

  it('reads the integration guides by their routes, and not by the old name', async () => {
    // authoring is a namespace: one level, its guides by slot.
    const level = await runCli(['docs', 'authoring']);
    expect(level.status).toBe(0);
    expect(level.stdout).toMatch(
      /^quick-start +Create a new integration package/m,
    );
    expect(level.stdout).toMatch(/^building-blocks +/m);
    const guide = await runCli([
      'docs',
      'authoring/building-blocks/codemods',
      '--index',
    ]);
    expect(guide.status).toBe(0);
    expect(guide.stdout).toMatch(
      /Read one section: .*docs authoring\/building-blocks\/codemods <section>/,
    );
    // A bare read is one level too: the sections, and how to read it all.
    const bare = await runCli([
      'docs',
      'authoring/building-blocks/codemods',
    ]);
    expect(bare.status).toBe(0);
    expect(bare.stdout).toBe(guide.stdout);
    expect(bare.stdout).toMatch(
      /Read everything: +.*docs authoring\/building-blocks\/codemods --full$/m,
    );
    const one = await runCli([
      'docs',
      'authoring/building-blocks/codemods',
      'which-codemods-run',
    ]);
    expect(one.status).toBe(0);
    expect(one.stdout).toMatch(/^## Choose when a codemod runs$/m);
    expect(one.stdout).toMatch(
      /^Up: .*docs authoring\/building-blocks\/codemods --index$/m,
    );
    expect(one.stdout).toMatch(
      /^Previous: .*docs authoring\/building-blocks\/codemods write-the-transform$/m,
    );
    expect(one.stdout).toMatch(
      /^Next: .*docs authoring\/building-blocks\/codemods run-codemods-in-an-app$/m,
    );
    const full = await runCli([
      'docs',
      'authoring/building-blocks/codemods',
      '--full',
    ]);
    expect(full.status).toBe(0);
    expect(full.stdout).toMatch(/^## Add a codemod$/m);
    expect(full.stdout.length).toBeGreaterThan(bare.stdout.length * 2);
    const old = await runCli(['docs', 'cli-integrations']);
    expect(old.status).toBe(1);
    expect(old.stderr).toContain('Unknown topic "cli-integrations"');
  }, SLOW);

  it('returns docs.node as JSON, and reads a section of a namespace from its guide', async () => {
    const node = JSON.parse((await runCli(['docs', 'cli', '--json'])).stdout);
    expect(node).toMatchObject({
      type: 'docs.node',
      data: {route: 'cli', kind: 'namespace', breadcrumb: []},
    });
    expect(node.data.slots.map(slot => slot.name)).toEqual(['guides', 'reference']);
    const section = JSON.parse(
      (await runCli(['docs', 'layout', 'side-panels', '--json'])).stdout,
    );
    expect(section).toMatchObject({
      type: 'docs.detail.section',
      data: {id: 'side-panels', title: 'Side panels'},
    });
    const missing = await runCli(['docs', 'authoring', 'zzzz-nope', '--json']);
    expect(missing.status).toBe(1);
    const error = JSON.parse(missing.stdout);
    expect(error).toMatchObject({code: 'ERR_UNKNOWN_SECTION'});
    expect(error.suggestions.map(s => s.name)).toContain('authoring/quick-start');
  }, SLOW);
});

describe('text width in every language', () => {
  const SLOW = 60_000;
  /** Widest line outside code blocks, in terminal columns. */
  const widest = out => {
    let inCode = false;
    let max = 0;
    for (const line of out.split('\n')) {
      if (/^\s*```/.test(line)) {
        inCode = !inCode;
        continue;
      }
      // A single unbreakable token (a long URL) cannot wrap without breaking it.
      const oneToken = !/\s/.test(line.trim());
      if (!inCode && !line.startsWith('#') && !oneToken) {
        max = Math.max(max, displayWidth(line));
      }
    }
    return max;
  };

  it('keeps the additive section index within 120 columns', async () => {
    const {status, stdout} = await runCli([
      'docs',
      'theme',
      '--index',
      '--lang',
      'zh',
    ]);
    expect(status).toBe(0);
    expect(widest(stdout)).toBeLessThanOrEqual(120);
  }, SLOW);
});
