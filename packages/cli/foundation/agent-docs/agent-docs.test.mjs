// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {renderComputerAgentText} from './computer-agent-text.mjs';
import {
  generateCompressedIndex,
  projectHasBuiltCheck,
  detectStylingSystem,
  getXdsVersion,
  installAgentDocs,
  injectAgentsMd,
  injectClaudeMd,
  injectXdsBlock,
  removeAgentDocs,
  removeXdsBlock,
  discoverAgentDocs,
  resolveAgentPaths,
  parseBlockVersion,
  renderAgentDocsBlock,
  inspectAgentDocs,
  isAstryxInitialized,
  AgentDocsHomeError,
  resolveAgentDocsRoot,
} from './agent-docs.mjs';

let tmpDir;

/** The managed import of AGENTS.md the default writes to GEMINI.md. */
const GEMINI_IMPORT = '<!-- ASTRYX:START -->\n@./AGENTS.md\n<!-- ASTRYX:END -->\n';
/** The heading of a .claude/CLAUDE.md the default creates. */
const CLAUDE_HEADING = '# CLAUDE\n\nProject-specific guidance for AI coding agents.\n\n';

/** Every file the default layout can write. */
const LAYOUT_FILES = ['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', 'GEMINI.md'];

/**
 * How many full managed blocks the files hold, by the header every block
 * starts with. An import of AGENTS.md carries no header.
 * @param {string} dir
 * @param {string[]} files
 */
function countBlocks(dir, files) {
  return files
    .filter(f => fs.existsSync(path.join(dir, f)))
    .map(f => fs.readFileSync(path.join(dir, f), 'utf-8').split(/Astryx v\d/).length - 1)
    .reduce((a, b) => a + b, 0);
}

/**
 * Full blocks in the files each agent reads at the project root, as measured:
 * Codex reads AGENTS.md; Copilot CLI reads AGENTS.md, CLAUDE.md and GEMINI.md
 * and does not expand an import in GEMINI.md; Claude Code reads CLAUDE.md and
 * .claude/CLAUDE.md, or AGENTS.md when neither exists; Gemini CLI reads
 * GEMINI.md and expands its import of AGENTS.md.
 * @param {string} dir
 */
function blocksSeen(dir) {
  const claudeFiles = ['CLAUDE.md', '.claude/CLAUDE.md'].filter(f =>
    fs.existsSync(path.join(dir, f)),
  );
  const gemini = fs.existsSync(path.join(dir, 'GEMINI.md'))
    ? fs.readFileSync(path.join(dir, 'GEMINI.md'), 'utf-8')
    : null;
  return {
    claude: countBlocks(dir, claudeFiles.length > 0 ? claudeFiles : ['AGENTS.md']),
    codex: countBlocks(dir, ['AGENTS.md']),
    gemini:
      gemini == null
        ? 0
        : countBlocks(dir, ['GEMINI.md']) +
          (/(^|\s)@(\.\/)?AGENTS\.md(\s|$)/.test(gemini) ? countBlocks(dir, ['AGENTS.md']) : 0),
    copilot: countBlocks(dir, ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']),
  };
}
/** Every agent reads one copy. */
const ONCE_EACH = {claude: 1, codex: 1, gemini: 1, copilot: 1};
/** Copilot CLI reads AGENTS.md and a root CLAUDE.md together: the accepted duplicate. */
const COPILOT_TWICE = {claude: 1, codex: 1, gemini: 1, copilot: 2};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-agent-docs-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
  vi.restoreAllMocks();
});

describe('generateCompressedIndex', () => {
  it('includes the version number', () => {
    const result = generateCompressedIndex('1.2.3');
    expect(result).toContain('Astryx v1.2.3');
    expect(result).toContain('<!-- ASTRYX:START -->');
    expect(result).toContain('<!-- ASTRYX:END -->');
  });

  it('tells agents to check a build with doctor --built; the computer-level skill does not', () => {
    const line =
      "Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.";
    expect(generateCompressedIndex('0.7.4', {builtCheck: true})).toContain(line);
    expect(generateCompressedIndex('0.7.4')).not.toContain('doctor --built');
    expect(renderComputerAgentText({command: 'astryx'})).not.toContain(
      'doctor --built',
    );
  });

  describe('projectHasBuiltCheck reads the CLI the project installs', () => {
    /**
     * @param {string | null} cliVersion the installed CLI, or none
     * @param {{workspace?: boolean}} [options] install it at a workspace root
     */
    const project = (cliVersion, {workspace = false} = {}) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-built-check-'));
      const app = workspace ? path.join(root, 'apps', 'web') : root;
      fs.mkdirSync(app, {recursive: true});
      if (workspace) {
        fs.writeFileSync(
          path.join(root, 'package.json'),
          JSON.stringify({name: 'repo', private: true, workspaces: ['apps/*'], devDependencies: {'@astryxdesign/cli': cliVersion ?? '0.7.3'}}),
        );
      }
      fs.writeFileSync(
        path.join(app, 'package.json'),
        JSON.stringify({name: 'web', dependencies: {'@astryxdesign/core': '0.7.4'}}),
      );
      if (cliVersion) {
        const cliDir = path.join(root, 'node_modules', '@astryxdesign', 'cli');
        fs.mkdirSync(cliDir, {recursive: true});
        fs.writeFileSync(
          path.join(cliDir, 'package.json'),
          JSON.stringify({name: '@astryxdesign/cli', version: cliVersion}),
        );
      }
      return {root, app};
    };
    it.each([
      ['an installed CLI 0.7.4', '0.7.4', {}, true],
      ['an installed CLI 0.8.0', '0.8.0', {}, true],
      ['an installed CLI 0.7.3', '0.7.3', {}, false],
      ['an installed 0.7.4 canary', '0.7.4-canary.b25f95e', {}, false],
      ['no installed CLI (before install, or Core only)', null, {}, false],
      ['a workspace root that installs CLI 0.7.3', '0.7.3', {workspace: true}, false],
      ['a workspace root that installs CLI 0.7.4', '0.7.4', {workspace: true}, true],
    ])('%s', (_label, cliVersion, options, expected) => {
      const {root, app} = project(cliVersion, options);
      try {
        expect(projectHasBuiltCheck(app)).toBe(expected);
      } finally {
        fs.rmSync(root, {recursive: true, force: true});
      }
    });
  });



  it('includes theme nudge rule', () => {
    const result = generateCompressedIndex('1.0.0');
    expect(result).toMatch(/astryx docs theme/);
    expect(result).toMatch(/never :root/);
  });

  it('sends frame choice to the layout doc rather than naming a shell', () => {
    const result = generateCompressedIndex('1.0.0');
    const frameRule = result.split('\n').find(l => l.includes('astryx docs layout'));
    expect(frameRule).toBeDefined();
    expect(result).not.toMatch(/AppShell/);
    expect(frameRule).not.toMatch(/https?:/);
  });

  it('starts every page from a template before any component', () => {
    const lines = generateCompressedIndex('1.0.0').split('\n');
    const workflow = lines.findIndex(l => l.startsWith('WORKFLOW'));
    expect(lines[workflow]).toMatch(/start every page from a template/);
    expect(lines[workflow + 1]).toMatch(/^1\. `astryx build /);
    expect(lines[workflow + 2]).toMatch(/^2\. .*keep its frame, gap and padding/);
    expect(lines.join('\n')).not.toMatch(/reference code/);
  });

  it('includes the post-generation self-check rule', () => {
    const result = generateCompressedIndex('1.0.0');
    expect(result).toContain('SELF-CHECK');
    expect(result).toMatch(/re-read the file/);
    expect(result).toMatch(/component or a token/);
  });

  it('tailors the self-check to the styling system (xstyle for StyleX, not className for Tailwind)', () => {
    const stylex = generateCompressedIndex('1.0.0', {stylingSystem: 'stylex'});
    const stylexSelfCheck = stylex.split('\n').find(l => l.includes('SELF-CHECK'));
    expect(stylexSelfCheck).toMatch(/xstyle/);
    expect(stylexSelfCheck).toMatch(/className=/);
    const tailwind = generateCompressedIndex('1.0.0', {stylingSystem: 'tailwind'});
    const tailwindSelfCheck = tailwind.split('\n').find(l => l.includes('SELF-CHECK'));
    expect(tailwindSelfCheck).toBeDefined();
    expect(tailwindSelfCheck).not.toMatch(/className=/);
  });

  it('defaults to the CSS-variable styling path (no compiler)', () => {
    const result = generateCompressedIndex('1.0.0');
    expect(result).toMatch(/tokens.*var\(--color-/);
    // Must NOT push xstyle when no StyleX compiler is present.
    expect(result).not.toMatch(/xstyle prop/);
    // Must warn that no compiler is present.
    expect(result).toMatch(/No StyleX\/Tailwind compiler/);
    // Must acknowledge that some templates use StyleX and point at the doc.
    expect(result).toMatch(/templates.*StyleX/i);
    expect(result).toMatch(/styling-overview/);
  });

  it('recommends xstyle when StyleX is configured', () => {
    const result = generateCompressedIndex('1.0.0', {stylingSystem: 'stylex'});
    expect(result).toMatch(/xstyle prop \/ StyleX tokens/);
  });

  it('recommends Tailwind utilities when Tailwind is configured', () => {
    const result = generateCompressedIndex('1.0.0', {stylingSystem: 'tailwind'});
    expect(result).toMatch(/Tailwind utilities/);
  });

  it('includes upgrade command and migration rule', () => {
    const result = generateCompressedIndex('1.0.0');
    // `upgrade --apply` alone stops with "Missing required --from".
    expect(result).toContain('upgrade --from <old version> --apply');
    expect(result).toMatch(/after a dependency bump/);
  });

  it('points agents at discover for integrations they could add', () => {
    const result = generateCompressedIndex('1.0.0');
    // Without this line no surface an agent reads names `discover`, and agents
    // look for a theme in the package registry instead.
    expect(result).toMatch(/^ {2}discover <words> {3}integrations you could add$/m);
    expect(result).toMatch(/^ {2}search "<query>"/m);
  });

  it('states the invocation once in the CLI header (yarn)', () => {
    const result = generateCompressedIndex('1.0.0', {invocation: 'yarn astryx'});
    expect(result).toContain('yarn astryx <cmd>');
    expect(result).not.toContain('npx astryx');
  });

  it('uses the pnpm exec invocation', () => {
    const result = generateCompressedIndex('1.0.0', {invocation: 'pnpm exec astryx'});
    expect(result).toContain('pnpm exec astryx <cmd>');
    expect(result).not.toContain('npx astryx');
  });

  it('uses the scoped package for one-off (uninstalled) runs so agents never hit the bare name', () => {
    const result = generateCompressedIndex('1.0.0', {invocation: 'npx @astryxdesign/cli'});
    expect(result).toContain('npx @astryxdesign/cli <cmd>');
    // The header defines the mapping; the bare "run every command as `npx astryx`" footgun must be absent.
    expect(result).not.toContain('npx astryx <cmd>');
  });

  /** The `docs <topic>  a, b, c` line of the block. */
  function topicLine(block) {
    return (
      block.split('\n').find(line => line.trimStart().startsWith('docs <topic>')) ?? ''
    );
  }

  it('keeps hyphenated key topics visible and points at astryx docs for the rest', () => {
    // The compact block shows key topics inline; the full list is via
    // `astryx docs`. `getting-started` is a hyphenated key topic that the old
    // \w+ scan used to drop — it must stay visible.
    const line = topicLine(generateCompressedIndex('1.0.0'));
    expect(line).toContain('getting-started');
    expect(line).toContain('principles');
    expect(line).toContain('astryx docs');
  });

  it('points to the CLI docs and the authoring docs on lines of their own', () => {
    // The integration guides live under `authoring` in the docs tree, so the
    // topic line does not name them; the tree's entry points do.
    const block = generateCompressedIndex('1.0.0');
    expect(block).toContain('  docs cli           commands and API reference');
    expect(block).toContain(
      '  docs authoring     build an integration package, and every field it holds',
    );
    expect(topicLine(block)).not.toContain('cli-integrations');
  });

  it('shows key topics from the given list and points at astryx docs for the rest', () => {
    const line = topicLine(
      generateCompressedIndex('1.0.0', {topics: ['tokens', 'deploying']}),
    );
    // 'tokens' is a key topic present in the given list, so it appears inline.
    expect(line).toContain('tokens');
    // The project's catalog replaces the built-in scan: a built-in topic not
    // in the given list must not appear.
    expect(line).not.toContain('typography');
    // Agents reach the full list via 'astryx docs'.
    expect(line).toContain('astryx docs');
  });

  it('omits the line entirely when the project has no topics', () => {
    expect(topicLine(generateCompressedIndex('1.0.0', {topics: []}))).toBe('');
  });

  it('is byte-identical when integrations contribute no lines', () => {
    const options = {
      invocation: 'npx @astryxdesign/cli',
      stylingSystem: 'css',
      topics: ['tokens', 'working-with-ai'],
    };
    expect(generateCompressedIndex('1.0.0', {...options, agentDocs: []})).toBe(
      generateCompressedIndex('1.0.0', options),
    );
  });

  it('appends package-labeled lines after core guidance in config order', () => {
    const result = generateCompressedIndex('1.0.0', {
      topics: [],
      agentDocs: [
        {
          package: '@acme/second',
          append: ['second one', 'second two'],
        },
        {
          package: '@acme/first',
          append: ['first one'],
        },
      ],
    });

    expect(result.indexOf('upgrade --from <old version> --apply')).toBeLessThan(
      result.indexOf('INTEGRATIONS:'),
    );
    expect(result.indexOf('INTEGRATIONS:')).toBeLessThan(
      result.indexOf('<!-- ASTRYX:END -->'),
    );
    expect(result).toContain(
      'INTEGRATIONS:\n' +
        '- `@acme/second`: second one\n' +
        '- `@acme/second`: second two\n' +
        '- `@acme/first`: first one',
    );
  });

  it('caps the configured project at 32 integration lines', () => {
    const agentDocs = Array.from({length: 5}, (_, packageIndex) => ({
      package: `@acme/package-${packageIndex}`,
      append: Array.from(
        {length: packageIndex === 4 ? 1 : 8},
        (_, lineIndex) => `line ${lineIndex}`,
      ),
    }));
    expect(() => generateCompressedIndex('1.0.0', {agentDocs})).toThrow(
      /32-line project limit/,
    );
  });
});

describe('renderAgentDocsBlock', () => {
  it('produces repeatable target bytes from configured manifests', async () => {
    const projectDir = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-agent-doc-render-'),
    );
    try {
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({name: 'consumer'}),
      );
      fs.writeFileSync(
        path.join(projectDir, 'astryx.config.mjs'),
        `export default {integrations: ['@acme/second', '@acme/first']};\n`,
      );
      const coreDir = path.join(
        projectDir,
        'node_modules',
        '@astryxdesign',
        'core',
      );
      fs.mkdirSync(coreDir, {recursive: true});
      fs.writeFileSync(
        path.join(coreDir, 'package.json'),
        JSON.stringify({name: '@astryxdesign/core', version: '1.0.0'}),
      );
      for (const [name, agentDocs] of [
        ['@acme/second', {append: ['second one', 'second two']}],
        ['@acme/first', {append: ['first one']}],
      ]) {
        const packageDir = path.join(
          projectDir,
          'node_modules',
          ...name.split('/'),
        );
        fs.mkdirSync(packageDir, {recursive: true});
        fs.writeFileSync(
          path.join(packageDir, 'package.json'),
          JSON.stringify({name}),
        );
        fs.writeFileSync(
          path.join(packageDir, 'astryx.integration.mjs'),
          `export default {agentDocs: ${JSON.stringify(agentDocs)}};\n`,
        );
      }
      fs.writeFileSync(path.join(projectDir, 'AGENTS.md'), '# Agents\n');
      fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Claude\n');

      const renderedBlock = await renderAgentDocsBlock(projectDir);
      expect(renderedBlock.indexOf('second one')).toBeLessThan(
        renderedBlock.indexOf('second two'),
      );
      expect(renderedBlock.indexOf('second two')).toBeLessThan(
        renderedBlock.indexOf('first one'),
      );

      installAgentDocs(projectDir, {renderedBlock});
      const firstAgents = fs.readFileSync(
        path.join(projectDir, 'AGENTS.md'),
        'utf-8',
      );
      const firstClaude = fs.readFileSync(
        path.join(projectDir, 'CLAUDE.md'),
        'utf-8',
      );
      expect(firstAgents).toContain(renderedBlock);
      expect(firstClaude).toBe(`# Claude\n\n${renderedBlock}\n`);
      expect(fs.existsSync(path.join(projectDir, '.claude'))).toBe(false);

      installAgentDocs(projectDir, {renderedBlock});
      expect(fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf-8')).toBe(
        firstAgents,
      );
      expect(fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8')).toBe(
        firstClaude,
      );
    } finally {
      fs.rmSync(projectDir, {recursive: true, force: true});
    }
  });
  it('renders doc tokens in an integration line for the project', async () => {
    const projectDir = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-agent-doc-tokens-'),
    );
    try {
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({name: 'consumer'}),
      );
      fs.writeFileSync(path.join(projectDir, 'bun.lock'), '{}\n');
      fs.writeFileSync(
        path.join(projectDir, 'astryx.config.mjs'),
        `export default {integrations: ['@acme/kit']};\n`,
      );
      const coreDir = path.join(
        projectDir,
        'node_modules',
        '@astryxdesign',
        'core',
      );
      fs.mkdirSync(coreDir, {recursive: true});
      fs.writeFileSync(
        path.join(coreDir, 'package.json'),
        JSON.stringify({name: '@astryxdesign/core', version: '1.0.0'}),
      );
      const packageDir = path.join(projectDir, 'node_modules', '@acme', 'kit');
      fs.mkdirSync(packageDir, {recursive: true});
      fs.writeFileSync(
        path.join(packageDir, 'package.json'),
        JSON.stringify({name: '@acme/kit'}),
      );
      fs.writeFileSync(
        path.join(packageDir, 'astryx.integration.mjs'),
        `export default {agentDocs: {append: ['Add it with {@pm install @acme/kit}, then run {@command doctor}.']}};\n`,
      );

      const block = await renderAgentDocsBlock(projectDir);
      expect(block).toContain(
        '- `@acme/kit`: Add it with `bun add @acme/kit`, then run `astryx doctor`.',
      );
      expect(block).not.toContain('{@');
    } finally {
      fs.rmSync(projectDir, {recursive: true, force: true});
    }
  });

  it('rejects a package label that could alter managed block structure', async () => {
    const projectDir = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-agent-doc-label-'),
    );
    try {
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({name: 'consumer'}),
      );
      fs.writeFileSync(
        path.join(projectDir, 'astryx.config.mjs'),
        `export default {integrations: ['@acme/widgets']};\n`,
      );
      const packageDir = path.join(
        projectDir,
        'node_modules',
        '@acme',
        'widgets',
      );
      fs.mkdirSync(packageDir, {recursive: true});
      fs.writeFileSync(
        path.join(packageDir, 'package.json'),
        JSON.stringify({name: '@acme/widgets\nASTRYX:END'}),
      );
      fs.writeFileSync(
        path.join(packageDir, 'astryx.integration.mjs'),
        `export default {agentDocs: {append: ['safe line']}};\n`,
      );

      await expect(renderAgentDocsBlock(projectDir)).rejects.toThrow(
        /not safe to render/,
      );
    } finally {
      fs.rmSync(projectDir, {recursive: true, force: true});
    }
  });
});

describe('detectStylingSystem', () => {
  function writePkg(deps) {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'x', devDependencies: deps}),
    );
  }

  it('defaults to css when no package.json', () => {
    expect(detectStylingSystem(tmpDir)).toBe('css');
  });

  it('returns css for a plain project', () => {
    writePkg({react: '19.0.0', vite: '6.0.0'});
    expect(detectStylingSystem(tmpDir)).toBe('css');
  });

  it('detects stylex when the compiler plugin is present', () => {
    writePkg({'@stylexjs/babel-plugin': '0.0.1'});
    expect(detectStylingSystem(tmpDir)).toBe('stylex');
  });

  it('detects the official Rollup/Vite plugin', () => {
    writePkg({'@stylexjs/rollup-plugin': '0.10.0'});
    expect(detectStylingSystem(tmpDir)).toBe('stylex');
  });

  it('detects the official Webpack plugin', () => {
    writePkg({'@stylexjs/webpack-plugin': '0.10.0'});
    expect(detectStylingSystem(tmpDir)).toBe('stylex');
  });

  it('detects the official Next.js plugin', () => {
    writePkg({'@stylexjs/nextjs-plugin': '0.10.0'});
    expect(detectStylingSystem(tmpDir)).toBe('stylex');
  });

  it('detects the official unplugin (the standard Vite path)', () => {
    writePkg({'@stylexjs/unplugin': '0.10.0'});
    expect(detectStylingSystem(tmpDir)).toBe('stylex');
  });

  it('detects tailwind when tailwindcss is present', () => {
    writePkg({tailwindcss: '4.0.0'});
    expect(detectStylingSystem(tmpDir)).toBe('tailwind');
  });

  it('does NOT treat the StyleX runtime alone as a compiler', () => {
    // Only the runtime, no compiler plugin → must stay on the safe css path.
    writePkg({'@stylexjs/stylex': '0.0.1'});
    expect(detectStylingSystem(tmpDir)).toBe('css');
  });

  it('prefers stylex over tailwind when both are configured', () => {
    writePkg({'@stylexjs/babel-plugin': '0.0.1', tailwindcss: '4.0.0'});
    expect(detectStylingSystem(tmpDir)).toBe('stylex');
  });
});

describe('getXdsVersion', () => {
  it('reads version from core package.json', () => {
    const coreDir = path.join(tmpDir, 'core');
    fs.mkdirSync(coreDir, {recursive: true});
    fs.writeFileSync(
      path.join(coreDir, 'package.json'),
      JSON.stringify({version: '3.4.5'}),
    );

    expect(getXdsVersion(coreDir)).toBe('3.4.5');
  });
});

describe('injectXdsBlock', () => {
  it('injects into an existing file without markers', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '# Existing content\n');

    const result = injectXdsBlock(filePath, '<!-- ASTRYX:START -->\nnew\n<!-- ASTRYX:END -->');

    expect(result).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Existing content');
    expect(content).toContain('<!-- ASTRYX:START -->');
  });

  it('replaces existing markers', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, 'before\n<!-- XDS:START -->\nold\n<!-- XDS:END -->\nafter\n');

    injectXdsBlock(filePath, '<!-- ASTRYX:START -->\nnew\n<!-- ASTRYX:END -->');

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('new');
    expect(content).not.toContain('old');
    expect(content).toContain('before');
    expect(content).toContain('after');
  });

  it('returns false and does not create file when createIfMissing is false', () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = injectXdsBlock(filePath, '<!-- ASTRYX:START -->\ncontent\n<!-- ASTRYX:END -->');

    expect(result).toBe(false);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('skips files without markers when onlyReplace is true', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '# Existing content\n\nNo XDS markers here.\n');

    const result = injectXdsBlock(filePath, '<!-- ASTRYX:START -->\nnew\n<!-- ASTRYX:END -->', {onlyReplace: true});

    expect(result).toBe(false);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('<!-- ASTRYX:START -->');
    expect(content).toBe('# Existing content\n\nNo XDS markers here.\n');
  });

  it('replaces existing markers even when onlyReplace is true', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, 'before\n<!-- XDS:START -->\nold\n<!-- XDS:END -->\nafter\n');

    const result = injectXdsBlock(filePath, '<!-- ASTRYX:START -->\nnew\n<!-- ASTRYX:END -->', {onlyReplace: true});

    expect(result).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('new');
    expect(content).not.toContain('old');
  });

  it('creates file when createIfMissing is true', () => {
    const filePath = path.join(tmpDir, 'new.md');

    const result = injectXdsBlock(filePath, '<!-- ASTRYX:START -->\ncontent\n<!-- ASTRYX:END -->', {
      createIfMissing: true,
      header: '# Header',
    });

    expect(result).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Header');
    expect(content).toContain('<!-- ASTRYX:START -->');
  });
});

describe('injectAgentsMd', () => {
  it('creates new AGENTS.md when none exists', () => {
    injectAgentsMd(tmpDir, '1.0.0');

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('# AGENTS.md');
    expect(content).toContain('<!-- ASTRYX:START -->');
    expect(content).toContain('Astryx v1.0.0');
    expect(content).toContain('<!-- ASTRYX:END -->');
  });

  it('updates existing AGENTS.md by replacing XDS markers', () => {
    const existing = `# My Project

Some content.

<!-- XDS:START -->
old content
<!-- XDS:END -->

More stuff.
`;
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), existing);

    injectAgentsMd(tmpDir, '2.0.0');

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('Astryx v2.0.0');
    expect(content).not.toContain('old content');
    expect(content).toContain('Some content.');
    expect(content).toContain('More stuff.');
  });

  it('appends to existing AGENTS.md without markers', () => {
    const existing = `# My Project

Existing agent docs.
`;
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), existing);

    injectAgentsMd(tmpDir, '1.0.0');

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('Existing agent docs.');
    expect(content).toContain('<!-- ASTRYX:START -->');
    expect(content).toContain('Astryx v1.0.0');
  });
});

describe('injectClaudeMd', () => {
  it('injects into existing CLAUDE.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude Config\n\nExisting rules.\n');

    const result = injectClaudeMd(tmpDir, '1.0.0');

    expect(result).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# Claude Config');
    expect(content).toContain('Existing rules.');
    expect(content).toContain('<!-- ASTRYX:START -->');
    expect(content).toContain('Astryx v1.0.0');
  });

  it('does not create CLAUDE.md when it does not exist', () => {
    const result = injectClaudeMd(tmpDir, '1.0.0');

    expect(result).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(false);
  });

  it('updates existing markers in CLAUDE.md', () => {
    const existing = `# Claude Config

<!-- XDS:START -->
old content
<!-- XDS:END -->

Other rules.
`;
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), existing);

    injectClaudeMd(tmpDir, '2.0.0');

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('Astryx v2.0.0');
    expect(content).not.toContain('old content');
    expect(content).toContain('Other rules.');
  });
});

describe('removeAgentDocs', () => {
  it('removes XDS section from AGENTS.md', () => {
    const content = `# My Project

Custom content here.

<!-- XDS:START -->
XDS index stuff
<!-- XDS:END -->

More custom content.
`;
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), content);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    removeAgentDocs(tmpDir);

    const result = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(result).toContain('Custom content here.');
    expect(result).toContain('More custom content.');
    expect(result).not.toContain('<!-- XDS:START -->');
    expect(result).not.toContain('XDS index stuff');
  });

  it('removes the file entirely when only XDS content remains', () => {
    const content = `# AGENTS.md

Project-specific guidance for AI coding agents.

<!-- XDS:START -->
XDS index stuff
<!-- XDS:END -->
`;
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), content);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    removeAgentDocs(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
  });

  it('removes XDS section from CLAUDE.md when present', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# AGENTS.md\n\n<!-- XDS:START -->\nstuff\n<!-- XDS:END -->\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      '# Claude\n\nRules.\n\n<!-- XDS:START -->\nstuff\n<!-- XDS:END -->\n\nMore rules.\n',
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});

    removeAgentDocs(tmpDir);

    const claudeContent = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeContent).toContain('Rules.');
    expect(claudeContent).toContain('More rules.');
    expect(claudeContent).not.toContain('<!-- XDS:START -->');
  });
});

describe('installAgentDocs', () => {
  function setupCorePackage(dir, version = '1.0.0') {
    // Create a minimal @astryxdesign/core so getXdsVersion works
    const coreDir = path.join(dir, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(coreDir, {recursive: true});
    fs.writeFileSync(
      path.join(coreDir, 'package.json'),
      JSON.stringify({version}),
    );
  }

  it('creates AGENTS.md, plus the GEMINI.md import, when no agent docs exist', () => {
    setupCorePackage(tmpDir);

    const written = installAgentDocs(tmpDir);

    expect(written).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
    // Claude Code reads AGENTS.md when the project has no CLAUDE.md, so no
    // Claude file is created.
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'CLAUDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(false);
    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('# AGENTS.md');
    expect(content).toContain('<!-- ASTRYX:START -->');
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(GEMINI_IMPORT);
  });

  it('defaults to AGENTS.md but writes .claude/CLAUDE.md only when --agent claude is explicit', () => {
    // Default (no agent): tool-agnostic AGENTS.md, never the Claude file.
    setupCorePackage(tmpDir);
    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'CLAUDE.md'))).toBe(false);

    // Explicit Claude: the Claude-specific file, in a fresh project.
    const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-agent-docs-claude-'));
    setupCorePackage(claudeDir);
    try {
      expect(installAgentDocs(claudeDir, {agent: 'claude'})).toEqual(['.claude/CLAUDE.md']);
      expect(fs.existsSync(path.join(claudeDir, 'AGENTS.md'))).toBe(false);
    } finally {
      fs.rmSync(claudeDir, {recursive: true, force: true});
    }
  });

  it('writes the block to AGENTS.md and to root CLAUDE.md when the project has only CLAUDE.md', () => {
    // Codex reads only AGENTS.md, and Claude Code skips AGENTS.md beside a
    // CLAUDE.md. The copy goes in the committed root CLAUDE.md; init creates
    // no .claude/ folder.
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n\nProject rules.\n');

    const written = installAgentDocs(tmpDir);

    expect(written).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
    expect(
      fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8').startsWith(
        '# Claude\n\nProject rules.\n\n<!-- ASTRYX:START -->',
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(false);
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(GEMINI_IMPORT);
    expect(blocksSeen(tmpDir)).toEqual(COPILOT_TWICE);
  });

  it('keeps the block in root CLAUDE.md when AGENTS.md and CLAUDE.md both exist', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n\nAgent rules.\n');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n\nClaude rules.\n');

    const written = installAgentDocs(tmpDir);

    expect(written).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
    const agentsContent = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(agentsContent).toContain('Agent rules.');
    expect(agentsContent).toContain('<!-- ASTRYX:START -->');
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')).toContain(
      'Claude rules.',
    );
    expect(blocksSeen(tmpDir)).toEqual(COPILOT_TWICE);
  });

  it('refreshes a block an older run wrote into CLAUDE.md and adds one to AGENTS.md', () => {
    setupCorePackage(tmpDir, '2.0.0');
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      '# Claude\n\nRules.\n\n<!-- ASTRYX:START -->\nAstryx v1.0.0 · old\n<!-- ASTRYX:END -->\n\nMore rules.\n',
    );

    const written = installAgentDocs(tmpDir);

    expect(written).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
    const claude = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(claude).toContain('Astryx v2.0.0');
    expect(claude).not.toContain('Astryx v1.0.0');
    expect(claude).toContain('More rules.');
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toContain(
      'Astryx v2.0.0',
    );
    expect(blocksSeen(tmpDir)).toEqual(COPILOT_TWICE);
  });

  it('gives Claude Code one copy when CLAUDE.md and .claude/CLAUDE.md both exist', () => {
    // The copy goes in root CLAUDE.md, which projects commit even when they
    // ignore .claude/; a block an older run left in .claude/CLAUDE.md goes.
    setupCorePackage(tmpDir, '2.0.0');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'CLAUDE.md'),
      '# Local\n\n<!-- ASTRYX:START -->\nAstryx v1.0.0 · old\n<!-- ASTRYX:END -->\n',
    );

    const written = installAgentDocs(tmpDir);

    expect(written).toEqual(['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', 'GEMINI.md']);
    expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
      '# Local\n',
    );
    expect(blocksSeen(tmpDir)).toEqual(COPILOT_TWICE);
  });

  it('writes the same bytes when run again', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');
    installAgentDocs(tmpDir);
    const files = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'];
    const first = files.map(f => fs.readFileSync(path.join(tmpDir, f), 'utf-8'));

    expect(installAgentDocs(tmpDir)).toEqual(files);
    expect(files.map(f => fs.readFileSync(path.join(tmpDir, f), 'utf-8'))).toEqual(first);
  });

  it('adds no import when GEMINI.md already imports AGENTS.md inline', () => {
    setupCorePackage(tmpDir);
    const gemini = '# Gemini\n\nFollow @./AGENTS.md always.\n';
    fs.writeFileSync(path.join(tmpDir, 'GEMINI.md'), gemini);

    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(gemini);
    expect(blocksSeen(tmpDir)).toEqual(ONCE_EACH);
  });

  it('removes its own import when GEMINI.md also imports AGENTS.md', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, 'GEMINI.md'),
      `# Gemini\n\nSee @AGENTS.md first.\n\n${GEMINI_IMPORT}`,
    );

    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(
      '# Gemini\n\nSee @AGENTS.md first.\n',
    );
  });

  it('adds the import when GEMINI.md mentions AGENTS.md only in code or not as an import', () => {
    setupCorePackage(tmpDir);
    // Gemini CLI follows no `@` inside backticks, none glued to a word, and
    // none whose path does not name AGENTS.md exactly.
    const gemini = 'Write `@./AGENTS.md` to import.\nmail@AGENTS.md\nRead @./AGENTS.md.\n';
    fs.writeFileSync(path.join(tmpDir, 'GEMINI.md'), gemini);

    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(
      `${gemini}\n${GEMINI_IMPORT}`,
    );
  });

  it.each([
    ['a list', '{"context": {"fileName": ["AGENTS.md", "GEMINI.md"]}}'],
    ['a name', '{"context": {"fileName": "AGENTS.md"}}'],
    ['comments', '{\n  // Gemini reads AGENTS.md\n  "context": {/* both */ "fileName": ["AGENTS.md", "GEMINI.md"]}\n}\n'],
    ['another file', '{"context": {"fileName": "GEMINI.md"}}'],
  ])('writes the GEMINI.md import whatever the project Gemini settings read (%s)', (_label, settings) => {
    // Gemini loads project settings only when it starts at the project root;
    // started in a subfolder, the import is its only copy.
    setupCorePackage(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.gemini'));
    fs.writeFileSync(path.join(tmpDir, '.gemini', 'settings.json'), settings);

    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(GEMINI_IMPORT);
  });

  it('keeps its GEMINI.md import when the project Gemini settings read AGENTS.md', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'GEMINI.md'), `# Gemini\n\n${GEMINI_IMPORT}`);
    fs.mkdirSync(path.join(tmpDir, '.gemini'));
    fs.writeFileSync(
      path.join(tmpDir, '.gemini', 'settings.json'),
      '{"context": {"fileName": ["AGENTS.md", "GEMINI.md"]}}',
    );

    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(
      `# Gemini\n\n${GEMINI_IMPORT}`,
    );
  });

  it('leaves a file that is AGENTS.md under another name alone', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    fs.symlinkSync('AGENTS.md', path.join(tmpDir, 'CLAUDE.md'));

    // Claude Code reads the block through CLAUDE.md, so no copy is added.
    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'CLAUDE.md'))).toBe(false);
    expect(countBlocks(tmpDir, ['AGENTS.md'])).toBe(1);
  });

  it('keeps an existing GEMINI.md and adds the import to it', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'GEMINI.md'), '# Gemini\n\nUse tabs.\n');

    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(
      `# Gemini\n\nUse tabs.\n\n${GEMINI_IMPORT}`,
    );
  });

  it('preserves import wrappers while initializing standalone files', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    const wrapperPath = path.join(tmpDir, '.hermes.md');
    const wrapper = '@AGENTS.md\n';
    fs.writeFileSync(wrapperPath, wrapper);
    fs.writeFileSync(path.join(tmpDir, '.cursorrules'), 'Cursor rules.\n');

    const written = installAgentDocs(tmpDir);

    expect(written).toEqual(['AGENTS.md', 'GEMINI.md', '.cursorrules']);
    expect(fs.readFileSync(wrapperPath, 'utf-8')).toBe(wrapper);
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toContain(
      '<!-- ASTRYX:START -->',
    );
    expect(fs.readFileSync(path.join(tmpDir, '.cursorrules'), 'utf-8')).toContain(
      '<!-- ASTRYX:START -->',
    );
  });

  it('treats cyclic imports as standalone files', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '@CLAUDE.md\n');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '@AGENTS.md\n');
    fs.writeFileSync(path.join(tmpDir, '.cursorrules'), 'Cursor rules.\n');

    const written = installAgentDocs(tmpDir);

    expect(written).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursorrules']);
    for (const rel of ['AGENTS.md', 'CLAUDE.md', '.cursorrules']) {
      expect(countBlocks(tmpDir, [rel])).toBe(1);
    }
  });

  it('keeps the per-file layout when a wrapper imports a file other than AGENTS.md', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '@CLAUDE.md\n');

    expect(installAgentDocs(tmpDir)).toEqual(['CLAUDE.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe('@CLAUDE.md\n');
    expect(countBlocks(tmpDir, ['CLAUDE.md'])).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, 'GEMINI.md'))).toBe(false);
  });

  it('removes a managed block previously expanded into an import wrapper', () => {
    setupCorePackage(tmpDir);
    installAgentDocs(tmpDir, {agent: 'codex'});
    const wrapperPath = path.join(tmpDir, '.hermes.md');
    const wrapper = '@AGENTS.md\n';
    fs.writeFileSync(wrapperPath, wrapper);
    installAgentDocs(tmpDir, {agent: 'hermes'});
    expect(fs.readFileSync(wrapperPath, 'utf-8')).toContain(
      '<!-- ASTRYX:START -->',
    );

    const written = installAgentDocs(tmpDir, {onlyReplace: true});

    expect(written).toContain('AGENTS.md');
    expect(written).toContain('.hermes.md');
    expect(fs.readFileSync(wrapperPath, 'utf-8')).toBe(wrapper);
  });

  it('refuses a malformed managed block inside an import wrapper', () => {
    setupCorePackage(tmpDir);
    installAgentDocs(tmpDir, {agent: 'codex'});
    fs.mkdirSync(path.join(tmpDir, '.claude'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'CLAUDE.md'),
      '@../AGENTS.md\n<!-- ASTRYX:START -->\nincomplete\n',
    );

    expect(() => installAgentDocs(tmpDir)).toThrow(/malformed|no matching/i);
  });

  it('adds the block to an existing .claude/CLAUDE.md and to AGENTS.md', () => {
    setupCorePackage(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.claude'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), '# Project\n\nExisting content.\n');

    const written = installAgentDocs(tmpDir);

    expect(written).toEqual(['AGENTS.md', '.claude/CLAUDE.md', 'GEMINI.md']);
    const content = fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8');
    expect(content.startsWith('# Project\n\nExisting content.\n\n<!-- ASTRYX:START -->')).toBe(
      true,
    );
    expect(blocksSeen(tmpDir)).toEqual(ONCE_EACH);
  });

  it('gives a root CLAUDE.md that imports AGENTS.md a copy too', () => {
    // Claude Code does not follow an import of a file above the folder it
    // starts in, so a session in a subfolder reads only the copy.
    setupCorePackage(tmpDir);
    const claude = '# Claude\n\n@AGENTS.md\n';
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), claude);

    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content.startsWith(`${claude}\n<!-- ASTRYX:START -->`)).toBe(true);
    expect(countBlocks(tmpDir, ['AGENTS.md', 'CLAUDE.md'])).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(false);

    // Running again keeps the copy where it is.
    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')).toBe(content);
  });

  it('keeps the copy in root CLAUDE.md, not .claude/CLAUDE.md, when root CLAUDE.md imports AGENTS.md', () => {
    // Root CLAUDE.md is committed even where .claude/ is ignored, so a fresh
    // clone still gives a session in a subfolder its copy.
    setupCorePackage(tmpDir, '2.0.0');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n\n@AGENTS.md\n');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'CLAUDE.md'),
      '# Local\n\n<!-- ASTRYX:START -->\nAstryx v1.0.0 · old\n<!-- ASTRYX:END -->\n',
    );

    expect(installAgentDocs(tmpDir)).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(countBlocks(tmpDir, ['CLAUDE.md'])).toBe(1);
    expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
      '# Local\n',
    );
  });

  it('gives a .claude/CLAUDE.md that imports AGENTS.md a copy when there is no root CLAUDE.md', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), '@../AGENTS.md\n');

    expect(installAgentDocs(tmpDir)).toEqual(['AGENTS.md', '.claude/CLAUDE.md', 'GEMINI.md']);
    const content = fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8');
    expect(content.startsWith('@../AGENTS.md\n\n<!-- ASTRYX:START -->')).toBe(true);
  });

  it('onlyReplace: refreshes the copy in a Claude file that imports AGENTS.md instead of removing it', () => {
    setupCorePackage(tmpDir, '1.0.0');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n\n@AGENTS.md\n');
    installAgentDocs(tmpDir);
    setupCorePackage(tmpDir, '2.0.0');

    expect(installAgentDocs(tmpDir, {onlyReplace: true})).toEqual(['AGENTS.md', 'CLAUDE.md']);
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('@AGENTS.md');
    expect(content).toContain('Astryx v2.0.0');
    expect(content).not.toContain('Astryx v1.0.0');
  });

  it('--agent all after the default keeps the GEMINI.md import and one Claude copy', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), '# Local\n');
    installAgentDocs(tmpDir);

    expect(installAgentDocs(tmpDir, {agent: 'all'})).toEqual(['AGENTS.md', 'CLAUDE.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(GEMINI_IMPORT);
    expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
      '# Local\n',
    );
    expect(blocksSeen(tmpDir)).toEqual(COPILOT_TWICE);
  });

  it('--agent claude writes CLAUDE.md and removes a block from .claude/CLAUDE.md', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'CLAUDE.md'),
      '# Local\n\n<!-- ASTRYX:START -->\nAstryx v1.0.0 · old\n<!-- ASTRYX:END -->\n',
    );
    installAgentDocs(tmpDir);

    expect(installAgentDocs(tmpDir, {agent: 'claude'})).toEqual(['CLAUDE.md']);
    expect(installAgentDocs(tmpDir, {agent: 'all'})).toEqual(['AGENTS.md', 'CLAUDE.md']);
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'CLAUDE.md'),
      '# Local\n\n<!-- ASTRYX:START -->\nAstryx v1.0.0 · old\n<!-- ASTRYX:END -->\n',
    );
    expect(installAgentDocs(tmpDir, {agent: 'claude'})).toEqual(['CLAUDE.md', '.claude/CLAUDE.md']);
    expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
      '# Local\n',
    );
    expect(blocksSeen(tmpDir).claude).toBe(1);
  });

  it('respects --agent claude preset: finds existing CLAUDE.md', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n\nRules.\n');

    const written = installAgentDocs(tmpDir, {agent: 'claude'});

    expect(written).toEqual(['CLAUDE.md']);
  });

  it('respects --agent claude preset: creates .claude/CLAUDE.md when nothing exists', () => {
    setupCorePackage(tmpDir);

    const written = installAgentDocs(tmpDir, {agent: 'claude'});

    expect(written).toEqual(['.claude/CLAUDE.md']);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'CLAUDE.md'))).toBe(true);
  });

  it('respects --agent codex preset: creates AGENTS.md', () => {
    setupCorePackage(tmpDir);

    const written = installAgentDocs(tmpDir, {agent: 'codex'});

    expect(written).toEqual(['AGENTS.md']);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
  });

  it('respects --agent hermes preset: creates AGENTS.md', () => {
    setupCorePackage(tmpDir);

    const written = installAgentDocs(tmpDir, {agent: 'hermes'});

    expect(written).toEqual(['AGENTS.md']);
    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('<!-- ASTRYX:START -->');
    expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(false);
  });

  it('respects --agent muse preset: creates AGENTS.md', () => {
    setupCorePackage(tmpDir);

    const written = installAgentDocs(tmpDir, {agent: 'muse'});

    expect(written).toEqual(['AGENTS.md']);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
  });

  it('respects explicit --paths', () => {
    setupCorePackage(tmpDir);

    const written = installAgentDocs(tmpDir, {paths: ['custom/AGENT.md']});

    expect(written).toEqual(['custom/AGENT.md']);
    expect(fs.existsSync(path.join(tmpDir, 'custom', 'AGENT.md'))).toBe(true);
  });

  it('onlyReplace: skips files without XDS markers', () => {
    setupCorePackage(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n\nProject rules only.\n');

    const written = installAgentDocs(tmpDir, {onlyReplace: true});

    expect(written).toEqual([]);
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).not.toContain('<!-- ASTRYX:START -->');
    expect(content).toBe('# Claude\n\nProject rules only.\n');
  });

  it('onlyReplace: updates files that have XDS markers', () => {
    setupCorePackage(tmpDir, '2.0.0');
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      '# Claude\n\n<!-- XDS:START -->\nPLACEHOLDER_STALE_CONTENT\n<!-- XDS:END -->\n\nOther rules.\n',
    );

    const written = installAgentDocs(tmpDir, {onlyReplace: true});

    expect(written).toEqual(['CLAUDE.md']);
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('Astryx v2.0.0');
    expect(content).not.toContain('PLACEHOLDER_STALE_CONTENT');
    expect(content).toContain('Other rules.');
  });

  it('onlyReplace: refreshes both copies of the block and leaves the GEMINI.md import alone', () => {
    setupCorePackage(tmpDir, '1.0.0');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');
    installAgentDocs(tmpDir);
    setupCorePackage(tmpDir, '2.0.0');

    expect(installAgentDocs(tmpDir, {onlyReplace: true})).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    for (const rel of ['AGENTS.md', 'CLAUDE.md']) {
      const content = fs.readFileSync(path.join(tmpDir, rel), 'utf-8');
      expect(content).toContain('Astryx v2.0.0');
      expect(content).not.toContain('Astryx v1.0.0');
    }
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(GEMINI_IMPORT);
    expect(blocksSeen(tmpDir)).toEqual(COPILOT_TWICE);
  });

  it('onlyReplace: refreshes a block beside an import of a missing AGENTS.md', () => {
    setupCorePackage(tmpDir, '2.0.0');
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      '@AGENTS.md\n\n<!-- ASTRYX:START -->\nAstryx v1.0.0\n<!-- ASTRYX:END -->\n',
    );

    expect(installAgentDocs(tmpDir, {onlyReplace: true})).toEqual(['CLAUDE.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')).toContain(
      'Astryx v2.0.0',
    );
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
  });

  it('onlyReplace: does not create the default AGENTS.md when nothing exists', () => {
    setupCorePackage(tmpDir);

    const written = installAgentDocs(tmpDir, {onlyReplace: true});

    expect(written).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'CLAUDE.md'))).toBe(false);
  });
});

describe('discoverAgentDocs', () => {
  it('finds AGENTS.md and CLAUDE.md at root', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '');

    const found = discoverAgentDocs(tmpDir);

    expect(found).toContain('AGENTS.md');
    expect(found).toContain('CLAUDE.md');
  });

  it('finds .claude/CLAUDE.md', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), '');

    const found = discoverAgentDocs(tmpDir);

    expect(found).toContain('.claude/CLAUDE.md');
  });

  it('returns empty when nothing exists', () => {
    expect(discoverAgentDocs(tmpDir)).toEqual([]);
  });
});

describe('resolveAgentPaths', () => {
  it('claude preset finds existing CLAUDE.md at root', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '');
    const result = resolveAgentPaths(tmpDir, 'claude');
    expect(result).toEqual({inject: ['CLAUDE.md'], create: []});
  });

  it('claude preset falls back to .claude/CLAUDE.md', () => {
    const result = resolveAgentPaths(tmpDir, 'claude');
    expect(result).toEqual({inject: [], create: ['.claude/CLAUDE.md']});
  });

  it('all preset discovers existing files', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '');
    const result = resolveAgentPaths(tmpDir, 'all');
    expect(result.inject).toContain('AGENTS.md');
    expect(result.inject).toContain('CLAUDE.md');
    expect(result.create).toEqual([]);
  });

  it('all preset creates defaults when nothing exists', () => {
    const result = resolveAgentPaths(tmpDir, 'all');
    expect(result.inject).toEqual([]);
    expect(result.create).toContain('AGENTS.md');
    expect(result.create).toContain('.claude/CLAUDE.md');
  });

  it('hermes preset creates AGENTS.md when nothing exists', () => {
    const result = resolveAgentPaths(tmpDir, 'hermes');
    expect(result).toEqual({inject: [], create: ['AGENTS.md']});
  });

  it('hermes preset finds existing .hermes.md', () => {
    fs.writeFileSync(path.join(tmpDir, '.hermes.md'), '');
    const result = resolveAgentPaths(tmpDir, 'hermes');
    expect(result).toEqual({inject: ['.hermes.md'], create: []});
  });

  it('hermes preset finds existing HERMES.md when no .hermes.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'HERMES.md'), '');
    const result = resolveAgentPaths(tmpDir, 'hermes');
    expect(result).toEqual({inject: ['HERMES.md'], create: []});
  });

  it('muse preset creates AGENTS.md when nothing exists', () => {
    const result = resolveAgentPaths(tmpDir, 'muse');
    expect(result).toEqual({inject: [], create: ['AGENTS.md']});
  });

  it('claude preset still creates .claude/CLAUDE.md when nothing exists (hermes is additive)', () => {
    const result = resolveAgentPaths(tmpDir, 'claude');
    expect(result).toEqual({inject: [], create: ['.claude/CLAUDE.md']});
  });
});

describe('parseBlockVersion', () => {
  it('reads the version from the header of a generated block', () => {
    expect(parseBlockVersion(generateCompressedIndex('1.2.3'))).toBe('1.2.3');
  });

  it('reads prerelease versions', () => {
    expect(parseBlockVersion('Astryx v1.2.3-beta.4 · 10 components')).toBe(
      '1.2.3-beta.4',
    );
  });

  it('returns null when no versioned header is present', () => {
    expect(parseBlockVersion('<!-- XDS:START -->\nold\n<!-- XDS:END -->')).toBeNull();
    expect(parseBlockVersion('')).toBeNull();
    expect(parseBlockVersion(undefined)).toBeNull();
  });
});

describe('inspectAgentDocs', () => {
  function writeBlock(rel, version) {
    const filePath = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, `# Doc\n\n${generateCompressedIndex(version)}\n`);
  }

  it('reports missing when no agent docs exist at all', () => {
    const res = inspectAgentDocs(tmpDir, '1.0.0');
    expect(res.status).toBe('missing');
    expect(res.files).toEqual([]);
    expect(res.staleFiles).toEqual([]);
  });

  it('reports missing when agent files exist but carry no Astryx marker', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents\n\nHand-written notes.\n');
    expect(inspectAgentDocs(tmpDir, '1.0.0').status).toBe('missing');
  });

  it('reports current when the only block matches the installed version', () => {
    writeBlock('AGENTS.md', '1.0.0');
    const res = inspectAgentDocs(tmpDir, '1.0.0');
    expect(res.status).toBe('current');
    expect(res.staleFiles).toEqual([]);
    expect(res.blockVersions).toEqual([]);
  });

  it.each([
    ['append addition', [], [{package: '@acme/a', append: ['added']}]],
    ['append removal', [{package: '@acme/a', append: ['removed']}], []],
    [
      'integration reorder',
      [
        {package: '@acme/a', append: ['a']},
        {package: '@acme/b', append: ['b']},
      ],
      [
        {package: '@acme/b', append: ['b']},
        {package: '@acme/a', append: ['a']},
      ],
    ],
    [
      'line content change',
      [{package: '@acme/a', append: ['old']}],
      [{package: '@acme/a', append: ['new']}],
    ],
  ])(
    'reports stale at the same Core version after %s',
    (_label, current, expected) => {
      const actualBlock = generateCompressedIndex('1.0.0', {
        agentDocs: current,
      });
      fs.writeFileSync(
        path.join(tmpDir, 'AGENTS.md'),
        `# Doc\n\n${actualBlock}\n`,
      );
      const expectedBlock = generateCompressedIndex('1.0.0', {
        agentDocs: expected,
      });

      expect(inspectAgentDocs(tmpDir, '1.0.0', expectedBlock)).toMatchObject({
        status: 'stale',
        staleFiles: ['AGENTS.md'],
      });
    },
  );

  it('reports stale (with the old version) when the block is behind', () => {
    writeBlock('AGENTS.md', '1.0.0');
    const res = inspectAgentDocs(tmpDir, '2.0.0');
    expect(res.status).toBe('stale');
    expect(res.staleFiles).toEqual(['AGENTS.md']);
    expect(res.blockVersions).toEqual(['1.0.0']);
    expect(res.installedVersion).toBe('2.0.0');
  });

  it('treats a legacy XDS block as stale even with no parseable version', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      '# Claude\n\n<!-- XDS:START -->\nlegacy index\n<!-- XDS:END -->\n',
    );
    const res = inspectAgentDocs(tmpDir, '1.0.0');
    expect(res.status).toBe('stale');
    expect(res.files[0].legacy).toBe(true);
    expect(res.blockVersions).toEqual([]);
  });

  it('is stale if ANY marked file is behind (mixed current + stale)', () => {
    writeBlock('AGENTS.md', '2.0.0');
    writeBlock('CLAUDE.md', '1.0.0');
    const res = inspectAgentDocs(tmpDir, '2.0.0');
    expect(res.status).toBe('stale');
    expect(res.staleFiles).toEqual(['CLAUDE.md']);
  });

  it('checks both copies of the block and does not count the GEMINI.md import', () => {
    const core = path.join(tmpDir, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({version: '3.0.0'}));
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');
    installAgentDocs(tmpDir);

    const current = inspectAgentDocs(tmpDir, '3.0.0');
    expect(current.status).toBe('current');
    expect(current.files.map(f => f.path)).toEqual(['AGENTS.md', 'CLAUDE.md']);
    expect(inspectAgentDocs(tmpDir, '4.0.0').staleFiles).toEqual(['AGENTS.md', 'CLAUDE.md']);

    // Without the blocks, the import alone reads as not set up.
    fs.rmSync(path.join(tmpDir, 'AGENTS.md'));
    fs.rmSync(path.join(tmpDir, 'CLAUDE.md'));
    expect(inspectAgentDocs(tmpDir, '3.0.0').status).toBe('missing');
    expect(isAstryxInitialized(tmpDir)).toBe(false);
  });

  it('defaults the installed version to the core package when omitted', () => {
    const coreDir = path.join(tmpDir, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(coreDir, {recursive: true});
    fs.writeFileSync(path.join(coreDir, 'package.json'), JSON.stringify({version: '3.0.0'}));
    writeBlock('AGENTS.md', '3.0.0');
    const res = inspectAgentDocs(tmpDir);
    expect(res.installedVersion).toBe('3.0.0');
    expect(res.status).toBe('current');
  });
});

describe('injectXdsBlock / removeXdsBlock — malformed managed blocks (no user-content loss)', () => {
  const S = '<!-- ASTRYX:START -->';
  const E = '<!-- ASTRYX:END -->';
  const BLOCK = `${S}\nNEW\n${E}`;

  it('does not duplicate user content when END precedes START', () => {
    const f = path.join(tmpDir, 'a.md');
    fs.writeFileSync(f, `# Doc\nUSER-A\n${E}\nUSER-B\n${S}\nUSER-C\n`);
    removeXdsBlock(f);
    const c = fs.readFileSync(f, 'utf-8');
    expect((c.match(/USER-B/g) || []).length).toBeLessThanOrEqual(1);
  });

  it('refuses (throws) instead of orphaning a second block when duplicates exist', () => {
    const f = path.join(tmpDir, 'b.md');
    fs.writeFileSync(f, `# Doc\n${S}\nB1\n${E}\nMID\n${S}\nB2\n${E}\nTAIL\n`);
    expect(() => injectXdsBlock(f, BLOCK)).toThrow(/multiple|malformed/i);
    // file left untouched for the user to fix
    expect(fs.readFileSync(f, 'utf-8')).toContain('MID');
    expect(fs.readFileSync(f, 'utf-8')).toContain('TAIL');
  });

  it('refuses to append a second block when a START has no matching END', () => {
    const f = path.join(tmpDir, 'c.md');
    fs.writeFileSync(f, `# Doc\nUSER1\n${S}\nOLD (no end)\nUSER2\n`);
    expect(() => injectXdsBlock(f, BLOCK)).toThrow(/end marker|malformed|no matching/i);
    expect((fs.readFileSync(f, 'utf-8').match(/ASTRYX:START/g) || []).length).toBe(1);
  });

  it('replaces a single well-formed block idempotently, preserving surrounding content', () => {
    const f = path.join(tmpDir, 'ok.md');
    fs.writeFileSync(f, `# Doc\nUSER\n${S}\nOLD\n${E}\nTAIL\n`);
    injectXdsBlock(f, BLOCK);
    const c = fs.readFileSync(f, 'utf-8');
    expect((c.match(/ASTRYX:START/g) || []).length).toBe(1);
    expect(c).toContain('NEW');
    expect(c).toContain('USER');
    expect(c).toContain('TAIL');
    expect(c).not.toContain('OLD');
  });
});

describe('isAstryxInitialized — resilient to malformed markers (postinstall hot path)', () => {
  // isAstryxInitialized runs on every consumer `npm install` (via postinstall).
  // It must never throw — even on a half-written or garbage-marker file — so it
  // uses a plain `.includes(MARKER_START)`, never the strict findManagedBlock.
  const START = '<!-- ASTRYX:START -->';
  const END = '<!-- ASTRYX:END -->';

  it('returns true (never throws) on duplicate START markers', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      `${START}\na\n${START}\nb\n${END}\n`,
    );
    expect(() => isAstryxInitialized(tmpDir)).not.toThrow();
    expect(isAstryxInitialized(tmpDir)).toBe(true);
  });

  it('returns true on an END-before-START file without throwing', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      `${END}\nuser\n${START}\nblock\n`,
    );
    expect(() => isAstryxInitialized(tmpDir)).not.toThrow();
    expect(isAstryxInitialized(tmpDir)).toBe(true);
  });

  it('returns true on a START with no END (half-written block)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      `# Doc\nuser\n${START}\ntruncated block, no end\n`,
    );
    expect(() => isAstryxInitialized(tmpDir)).not.toThrow();
    expect(isAstryxInitialized(tmpDir)).toBe(true);
  });

  it('returns false for a directory with no agent docs', () => {
    expect(isAstryxInitialized(tmpDir)).toBe(false);
  });

  it('returns false for a nonexistent directory', () => {
    expect(isAstryxInitialized(path.join(tmpDir, 'does-not-exist'))).toBe(false);
  });
});

describe('removeAgentDocs after the default layout', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('deletes the files the default created and keeps the project files', () => {
    const core = path.join(tmpDir, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({version: '1.0.0'}));
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude\n');
    installAgentDocs(tmpDir);

    expect(removeAgentDocs(tmpDir)).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'GEMINI.md'))).toBe(false);
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')).toBe('# Claude\n');
  });

  it('keeps a GEMINI.md that has the project\'s own content', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'GEMINI.md'),
      `# Gemini\n\nUse tabs.\n\n${GEMINI_IMPORT}`,
    );

    expect(removeAgentDocs(tmpDir)).toEqual(['GEMINI.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'GEMINI.md'), 'utf-8')).toBe(
      '# Gemini\n\nUse tabs.\n',
    );
  });
});

describe('agent docs never go into the home folder', () => {
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

  it.each([
    ['the default', {}],
    ['a preset', {agent: 'claude'}],
    ['an explicit path', {paths: ['AGENTS.md']}],
    ['a refresh', {onlyReplace: true}],
  ])('refuses %s and writes nothing', (_label, options) => {
    expect(() => installAgentDocs(tmpDir, options)).toThrow(AgentDocsHomeError);
    expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
      personal,
    );
    expect(fs.readdirSync(tmpDir).sort()).toEqual(['.claude']);
  });

  it('writes an explicit path into a plain folder of the home folder, as 0.7.x did', () => {
    expect(installAgentDocs(tmpDir, {paths: ['notes/AI.md']})).toEqual(['notes/AI.md']);
    expect(fs.readFileSync(path.join(tmpDir, 'notes', 'AI.md'), 'utf-8')).toContain(
      '<!-- ASTRYX:START -->',
    );
  });

  it.each([
    ['a file in the home folder', ['AI.md']],
    ['a file at the top of a settings folder', ['.claude/CLAUDE.md']],
    ['one of several paths', ['notes/AI.md', 'AI.md']],
  ])('refuses an explicit path to %s, and writes nothing', (_label, paths) => {
    expect(() => installAgentDocs(tmpDir, {paths})).toThrow(AgentDocsHomeError);
    expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
      personal,
    );
    expect(fs.readdirSync(tmpDir).sort()).toEqual(['.claude']);
  });

  it('init with an explicit path from the home folder writes it, and refuses one in the home folder', async () => {
    const {init} = await import('../../api/init/init.mjs');
    const written = await init(
      {features: ['agents'], agentDocsPath: 'notes/AI.md'},
      {cwd: tmpDir},
    );
    expect(written.data.docsWritten).toEqual(['notes/AI.md']);
    expect(written.data.docsError ?? null).toBeNull();
    const refused = await init(
      {features: ['agents'], agentDocsPath: 'AI.md'},
      {cwd: tmpDir},
    );
    expect(refused.data.docsError).toMatchObject({kind: 'install-failed'});
    expect(fs.existsSync(path.join(tmpDir, 'AI.md'))).toBe(false);
  });

  it('refuses through a symlink to the home folder', () => {
    const link = `${tmpDir}-link`;
    fs.symlinkSync(tmpDir, link);
    try {
      expect(() => installAgentDocs(link)).toThrow(AgentDocsHomeError);
    } finally {
      fs.rmSync(link);
    }
  });

  it('still removes a block an older run wrote there', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'CLAUDE.md'),
      `${personal}\n<!-- ASTRYX:START -->\nAstryx v1.0.0\n<!-- ASTRYX:END -->\n`,
    );

    expect(removeAgentDocs(tmpDir)).toEqual(['.claude/CLAUDE.md']);
    expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
      personal,
    );
  });

  it.each(['.gemini', '.claude', '.codex', path.join('.gemini', 'extensions', 'x')])(
    'refuses the settings folder ~/%s',
    folder => {
      const dir = path.join(tmpDir, folder);
      fs.mkdirSync(dir, {recursive: true});
      const before = fs.readdirSync(dir);
      expect(() => installAgentDocs(dir)).toThrow(AgentDocsHomeError);
      expect(fs.readdirSync(dir)).toEqual(before);
      expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
        personal,
      );
    },
  );

  it('writes in a project folder inside the home folder', () => {
    const project = path.join(tmpDir, 'app');
    fs.mkdirSync(project);
    expect(installAgentDocs(project)).toEqual(['AGENTS.md', 'GEMINI.md']);
  });

  /**
   * A git project that declares Astryx, at `rel` under the home folder, with
   * Core installed at `version`.
   * @param {string} rel
   * @param {string} version
   */
  function writeProject(rel, version) {
    const project = path.join(tmpDir, rel);
    fs.mkdirSync(path.join(project, 'src'), {recursive: true});
    fs.writeFileSync(path.join(project, '.git'), 'gitdir: /elsewhere/.git/worktrees/web\n');
    fs.writeFileSync(
      path.join(project, 'package.json'),
      JSON.stringify({name: 'web', dependencies: {'@astryxdesign/core': version}}),
    );
    const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({version}));
    return project;
  }

  it.each([
    ['a Codex worktree', path.join('.codex', 'worktrees', 'a1b2c3', 'web')],
    ['a Cursor worktree', path.join('.cursor', 'worktrees', 'web', 'x9y8')],
    ['a project with its package.json one level in', path.join('.config', 'web')],
  ])('writes and refreshes the docs of a project inside a settings folder (%s)', (_label, rel) => {
    const project = writeProject(rel, '1.0.0');

    expect(resolveAgentDocsRoot(path.join(project, 'src'))).toBe(project);
    expect(installAgentDocs(project)).toEqual(['AGENTS.md', 'GEMINI.md']);

    // upgrade refreshes the block in place.
    writeProject(rel, '2.0.0');
    expect(installAgentDocs(project, {onlyReplace: true})).toEqual(['AGENTS.md']);
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toContain(
      'Astryx v2.0.0',
    );

    // Nothing reaches the settings folder or the home folder.
    const settings = path.join(tmpDir, rel.split(path.sep)[0]);
    expect(fs.readdirSync(settings)).toEqual([rel.split(path.sep)[1]]);
    expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
      personal,
    );
  });

  it('refuses the top of a settings folder even with a package.json, and the folders in it outside a project', () => {
    // A package.json in ~/.claude (for hook scripts, say) would otherwise put the
    // block in ~/.claude/CLAUDE.md, which Claude Code reads in every project.
    fs.writeFileSync(path.join(tmpDir, '.claude', 'package.json'), '{"name":"hooks"}\n');
    fs.mkdirSync(path.join(tmpDir, '.claude', 'hooks'));

    expect(() => installAgentDocs(path.join(tmpDir, '.claude'))).toThrow(AgentDocsHomeError);
    expect(() => installAgentDocs(path.join(tmpDir, '.claude', 'hooks'))).toThrow(
      AgentDocsHomeError,
    );
    expect(resolveAgentDocsRoot(path.join(tmpDir, '.claude', 'hooks'))).toBe(
      path.join(tmpDir, '.claude'),
    );
    expect(fs.readFileSync(path.join(tmpDir, '.claude', 'CLAUDE.md'), 'utf-8')).toBe(
      personal,
    );

    // A worktree folder whose project has no package.json is not a project.
    const bare = path.join(tmpDir, '.codex', 'worktrees', 'a1b2c3', 'notes');
    fs.mkdirSync(bare, {recursive: true});
    expect(() => installAgentDocs(bare)).toThrow(AgentDocsHomeError);
    expect(fs.readdirSync(bare)).toEqual([]);
  });
});

describe('resolveAgentDocsRoot', () => {
  /** @param {string} dir @param {object} pkg */
  const writePkg = (dir, pkg) => {
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  };
  const astryx = {devDependencies: {'@astryxdesign/cli': '0.7.0'}};

  it('finds the nearest folder whose package.json declares Astryx', () => {
    writePkg(tmpDir, astryx);
    const sub = path.join(tmpDir, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});
    expect(resolveAgentDocsRoot(sub)).toBe(tmpDir);
    expect(resolveAgentDocsRoot(tmpDir)).toBe(tmpDir);

    // A nested package that does not declare Astryx is passed over.
    const functions = path.join(tmpDir, 'functions');
    writePkg(functions, {name: 'functions'});
    fs.mkdirSync(path.join(functions, 'src'));
    expect(resolveAgentDocsRoot(path.join(functions, 'src'))).toBe(tmpDir);

    // A nested package that declares Astryx is its own project.
    const web = path.join(tmpDir, 'apps', 'web');
    writePkg(web, {dependencies: {'@astryxdesign/core': '0.7.0'}});
    expect(resolveAgentDocsRoot(web)).toBe(web);
  });

  it('falls back to the nearest package.json when none declares Astryx', () => {
    writePkg(tmpDir, {name: 'app'});
    const pkg = path.join(tmpDir, 'packages', 'web');
    writePkg(pkg, {name: 'web'});
    fs.mkdirSync(path.join(pkg, 'src'));
    expect(resolveAgentDocsRoot(path.join(pkg, 'src'))).toBe(pkg);
  });

  it('stops at a repository root, and finds no project without a package.json', () => {
    writePkg(tmpDir, astryx);
    const repo = path.join(tmpDir, 'repo');
    fs.mkdirSync(path.join(repo, '.git'), {recursive: true});
    const sub = path.join(repo, 'docs');
    fs.mkdirSync(sub);
    expect(resolveAgentDocsRoot(sub)).toBeNull();
  });

  it('never returns the home folder', () => {
    const saved = {HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE};
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
    try {
      writePkg(tmpDir, astryx);
      const scratch = path.join(tmpDir, 'scratch');
      fs.mkdirSync(scratch);
      expect(resolveAgentDocsRoot(scratch)).toBeNull();
      expect(resolveAgentDocsRoot(tmpDir)).toBeNull();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
