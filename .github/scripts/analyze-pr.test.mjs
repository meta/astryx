// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file analyze-pr.test.mjs
 * Pins the shallow-clone recovery contract of analyze-pr.js. The pr-analysis
 * job runs analyze-pr.js with a `--depth=50` fetch; once a PR has been open
 * long enough for base to advance past that window, the three-dot diff
 * (base...head) fails with "no merge base" and — without this fix — the whole
 * job dies. The script must recover by deepening the clone and retrying the
 * three-dot diff, and it must record which diff mode it used so consumers
 * know whether the component list is exact or approximate.
 *
 * We build a synthetic repo: a branch point, 60 churn commits on main, and a
 * feature branch off the branch point that touches exactly one component.
 * A shallow single-branch clone of the feature (depth 5) has no merge base
 * with origin/main, reproducing the CI failure; running analyze-pr.js against
 * it must exit 0 and report the Core, Rich Text, and Vega components the branch
 * touched.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(SCRIPTS_DIR, 'analyze-pr.js');

/** Run a git command in a repo dir; return trimmed stdout. */
function git(dir, args) {
  return execFileSync('git', args, {cwd: dir, encoding: 'utf8'}).trim();
}

/** Run a git command that is allowed to fail; return {status, stdout, stderr}. */
function gitTry(dir, args) {
  try {
    const stdout = execFileSync('git', args, {cwd: dir, encoding: 'utf8'});
    return {status: 0, stdout, stderr: ''};
  } catch (e) {
    return {status: e.status, stdout: e.stdout || '', stderr: e.stderr || ''};
  }
}

/**
 * Build the synthetic repo and return the shallow clone dir:
 *   upstream/: branch point, 60 churn commits on main, feature off the point
 *             touching Core, Rich Text, and Vega components.
 *   clone/   : --depth=5 --single-branch of feature (no merge base with main).
 */
function buildFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-analyze-'));
  const upstream = path.join(base, 'upstream');
  const clone = path.join(base, 'clone');

  fs.mkdirSync(path.join(upstream, 'packages/core/src/Card'), {recursive: true});
  fs.mkdirSync(path.join(upstream, 'packages/core/src/Button'), {recursive: true});
  fs.mkdirSync(path.join(upstream, 'packages/core/src/Line'), {recursive: true});
  fs.mkdirSync(path.join(upstream, 'packages/core/src/InteractiveRoleContext'), {recursive: true});
  fs.mkdirSync(path.join(upstream, 'packages/lab/src/Sankey'), {recursive: true});
  fs.mkdirSync(path.join(upstream, 'packages/richtext/src'), {recursive: true});
  fs.mkdirSync(path.join(upstream, 'packages/vega/src'), {recursive: true});
  fs.mkdirSync(path.join(upstream, 'packages/themes/neutral/src'), {recursive: true});
  fs.mkdirSync(path.join(upstream, 'packages/themes/probe/src'), {recursive: true});

  git(upstream, ['init', '-q', '-b', 'main']);
  git(upstream, ['config', 'user.email', 'test@test.co']);
  git(upstream, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(upstream, 'package.json'), '{}');
  fs.writeFileSync(path.join(upstream, 'packages/core/src/index.ts'), "export {Card} from './Card';\n");
  fs.writeFileSync(path.join(upstream, 'packages/core/src/Card/Card.tsx'), 'export function Card() {}\n');
  fs.writeFileSync(path.join(upstream, 'packages/core/src/Card/Card.doc.mjs'), "export default {name: 'Card'};\n");
  fs.writeFileSync(path.join(upstream, 'packages/core/src/Card/index.ts'), "export {Card} from './Card';\n");
  fs.writeFileSync(path.join(upstream, 'packages/core/src/Button/index.ts'), 'export {}\n');
  fs.writeFileSync(path.join(upstream, 'packages/core/src/Line/index.ts'), 'export {}\n');
  fs.writeFileSync(
    path.join(upstream, 'packages/richtext/src/RichTextEditor.tsx'),
    'export function RichTextEditor() {}\n',
  );
  fs.writeFileSync(
    path.join(upstream, 'packages/richtext/src/RichTextEditorAutoLinkPlugin.tsx'),
    'export function RichTextEditorAutoLinkPlugin() {}\n',
  );
  fs.writeFileSync(
    path.join(upstream, 'packages/richtext/src/RichTextView.tsx'),
    'export function RichTextView() {}\n',
  );
  fs.writeFileSync(
    path.join(upstream, 'packages/richtext/src/index.ts'),
    [
      "export {RichTextEditor} from './RichTextEditor';",
      "export {RichTextEditorAutoLinkPlugin} from './RichTextEditorAutoLinkPlugin';",
      "export {RichTextView} from './RichTextView';",
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(upstream, 'packages/vega/src/VegaChart.tsx'),
    'export function VegaChart() {}\n',
  );
  fs.writeFileSync(path.join(upstream, 'packages/vega/src/index.ts'), "export {VegaChart} from './VegaChart';\n");
  fs.writeFileSync(path.join(upstream, 'packages/core/src/InteractiveRoleContext/internal.ts'), 'export const shared = true;\n');
  fs.writeFileSync(path.join(upstream, 'packages/lab/src/Sankey/internal.ts'), 'export const family = true;\n');
  fs.writeFileSync(
    path.join(upstream, 'packages/themes/neutral/package.json'),
    JSON.stringify({name: '@astryxdesign/theme-neutral', private: false}),
  );
  fs.writeFileSync(path.join(upstream, 'packages/themes/neutral/src/theme.ts'), 'export {}\n');
  fs.writeFileSync(
    path.join(upstream, 'packages/themes/probe/package.json'),
    JSON.stringify({name: '@astryxdesign/theme-probe', private: true}),
  );
  fs.writeFileSync(path.join(upstream, 'packages/themes/probe/src/theme.ts'), 'export {}\n');
  git(upstream, ['add', '-A']);
  git(upstream, ['commit', '-qm', 'branch point']);
  const branchPoint = git(upstream, ['rev-parse', 'HEAD']);

  // 60 churn commits on main so the branch point is beyond any small depth.
  for (let i = 1; i <= 60; i++) {
    fs.appendFileSync(path.join(upstream, 'packages/core/src/Button/index.ts'), `b${i}\n`);
    fs.appendFileSync(path.join(upstream, 'packages/core/src/Line/index.ts'), `l${i}\n`);
    git(upstream, ['add', '-A']);
    git(upstream, ['commit', '-qm', `churn ${i}`]);
  }

  // Feature branch off the branch point, touching Core, Rich Text, and Vega.
  git(upstream, ['branch', 'feature', branchPoint]);
  git(upstream, ['checkout', '-q', 'feature']);
  fs.appendFileSync(path.join(upstream, 'packages/core/src/Card/index.ts'), 'export const Card = {}\n');
  fs.appendFileSync(
    path.join(upstream, 'packages/richtext/src/RichTextEditor.tsx'),
    'export const richTextChanged = true\n',
  );
  fs.appendFileSync(
    path.join(upstream, 'packages/richtext/src/RichTextEditorAutoLinkPlugin.tsx'),
    'export const autoLinkChanged = true\n',
  );
  fs.appendFileSync(
    path.join(upstream, 'packages/richtext/src/RichTextView.tsx'),
    'export const viewChanged = true\n',
  );
  fs.appendFileSync(
    path.join(upstream, 'packages/vega/src/VegaChart.tsx'),
    'export const vegaChanged = true\n',
  );
  fs.appendFileSync(path.join(upstream, 'packages/core/src/InteractiveRoleContext/internal.ts'), 'export const sharedChanged = true\n');
  fs.appendFileSync(path.join(upstream, 'packages/lab/src/Sankey/internal.ts'), 'export const familyChanged = true\n');
  fs.appendFileSync(path.join(upstream, 'packages/themes/neutral/src/theme.ts'), 'export const changed = true\n');
  fs.appendFileSync(path.join(upstream, 'packages/themes/probe/src/theme.ts'), 'export const changed = true\n');
  git(upstream, ['add', '-A']);
  git(upstream, ['commit', '-qm', 'touch three component packages']);

  // Shallow single-branch clone of the feature branch.
  git(null, [
    'clone', '-q', '--depth=5', '--single-branch', '--branch=feature',
    `file://${upstream}`, clone,
  ]);

  return {base, clone, branchPoint};
}

describe('analyze-pr shallow-clone recovery', () => {
  it('recovers the three-dot diff and reports Core, Rich Text, and Vega owners', () => {
    const {base, clone} = buildFixture();
    try {
      // Precondition: the clone really has no merge base (the CI failure).
      const mb = gitTry(clone, ['merge-base', 'HEAD', 'origin/main']);
      expect(mb.status).not.toBe(0);

      const stdout = execFileSync(
        process.execPath,
        [SCRIPT, '--base', 'origin/main', '--head', 'HEAD', '--output', 'analysis.json'],
        {cwd: clone, encoding: 'utf8'},
      );
      const analysis = JSON.parse(
        fs.readFileSync(path.join(clone, 'analysis.json'), 'utf8'),
      );

      // Reaching the assertions proves exit 0 (execFileSync throws otherwise).
      expect(stdout).toContain('diff mode: three-dot');
      expect(analysis.diffMode).toBe('three-dot');
      expect(analysis.modifiedComponents).toEqual([
        'Card',
        'RichTextEditor',
        'RichTextEditorAutoLinkPlugin',
        'RichTextView',
        'VegaChart',
      ]);
      expect(analysis.modifiedComponentOwners).toEqual([
        'core/Card',
        'richtext/RichTextEditor',
        'richtext/RichTextEditorAutoLinkPlugin',
        'richtext/RichTextView',
        'vega/VegaChart',
      ]);
      expect(analysis.modifiedComponentOwners).not.toContain('core/InteractiveRoleContext');
      expect(analysis.modifiedComponentOwners).not.toContain('lab/Sankey');
      expect(analysis.forceFullComponentAudits).toBe(true);
      expect(analysis.unresolvedComponentSources).toEqual(
        expect.arrayContaining(['core/InteractiveRoleContext', 'lab/Sankey']),
      );
      expect(analysis.changedPackages).toEqual([
        '@astryxdesign/core',
        '@astryxdesign/lab',
        '@astryxdesign/richtext',
        '@astryxdesign/vega',
      ]);
      expect(analysis.changedStableThemes).toEqual(['neutral']);
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });
});

describe('analyze-pr component ownership', () => {
  it('resolves a folder whose doc names the components it is built from', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-analyze-owner-'));
    const write = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), {recursive: true});
      fs.writeFileSync(path.join(repo, file), content);
    };
    try {
      write('package.json', '{}');
      write(
        'packages/core/src/index.ts',
        [
          "export {Label} from './Label';",
          "export {Tokenizer} from './Tokenizer';",
          "export {Chat, ChatComposer} from './Chat';",
          '',
        ].join('\n'),
      );
      write('packages/core/src/Label/index.ts', "export {Label} from './Label';\n");
      write('packages/core/src/Label/Label.tsx', 'export function Label() {}\n');
      write('packages/core/src/Label/Label.doc.mjs', "export const docs = {\n  name: 'Label',\n};\n");
      write('packages/core/src/Tokenizer/index.ts', "export {Tokenizer} from './Tokenizer';\n");
      write('packages/core/src/Tokenizer/Tokenizer.tsx', 'export function Tokenizer() {}\n');
      // Anatomy names the Label the Tokenizer renders; Label is implemented
      // in its own folder, so it must not make this folder a family.
      write(
        'packages/core/src/Tokenizer/Tokenizer.doc.mjs',
        "export const docs = {\n  name: 'Tokenizer',\n  anatomy: [{name: 'Label'}],\n};\n",
      );
      // A real family: two public components implemented in one folder.
      write(
        'packages/core/src/Chat/index.ts',
        "export {Chat} from './Chat';\nexport {ChatComposer} from './ChatComposer';\n",
      );
      write('packages/core/src/Chat/Chat.tsx', 'export function Chat() {}\n');
      write('packages/core/src/Chat/ChatComposer.tsx', 'export function ChatComposer() {}\n');
      write('packages/core/src/Chat/Chat.doc.mjs', "export const docs = {\n  name: 'Chat',\n};\n");
      write(
        'packages/core/src/Chat/ChatComposer.doc.mjs',
        "export const docs = {\n  name: 'ChatComposer',\n};\n",
      );
      git(repo, ['init', '-q', '-b', 'main']);
      git(repo, ['config', 'user.email', 'test@test.co']);
      git(repo, ['config', 'user.name', 'Test']);
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-qm', 'base']);
      git(repo, ['checkout', '-q', '-b', 'feature']);
      fs.appendFileSync(path.join(repo, 'packages/core/src/Tokenizer/Tokenizer.tsx'), 'export const changed = true;\n');
      fs.appendFileSync(path.join(repo, 'packages/core/src/Chat/ChatComposer.tsx'), 'export const changed = true;\n');
      git(repo, ['commit', '-qam', 'touch Tokenizer and Chat']);

      execFileSync(
        process.execPath,
        [SCRIPT, '--base', 'main', '--head', 'HEAD', '--output', 'analysis.json'],
        {cwd: repo, encoding: 'utf8'},
      );
      const analysis = JSON.parse(fs.readFileSync(path.join(repo, 'analysis.json'), 'utf8'));

      expect(analysis.modifiedComponentOwners).toEqual(['core/Tokenizer']);
      expect(analysis.unresolvedComponentSources).toEqual(['core/Chat']);
      expect(analysis.forceFullComponentAudits).toBe(true);
    } finally {
      fs.rmSync(repo, {recursive: true, force: true});
    }
  });
});

describe('analyze-pr base and head sizes', () => {
  it('measures ESM entries by module type and reads base sizes from a merge-base build', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-analyze-size-'));
    const baseRoot = path.join(repo, '.size-base');
    const write = (root, file, content) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), content);
    };
    try {
      write(repo, 'package.json', '{}');
      write(repo, '.gitignore', 'dist/\n.size-base/\n*.json.out\n');
      write(repo, 'packages/core/package.json', '{"type": "module"}\n');
      write(
        repo,
        'packages/core/src/index.ts',
        "export {Card} from './Card';\n",
      );
      write(
        repo,
        'packages/core/src/Card/index.ts',
        "export {Card} from './Card';\n",
      );
      write(
        repo,
        'packages/core/src/Card/Card.tsx',
        'export function Card() {}\n',
      );
      write(
        repo,
        'packages/core/src/Card/Card.doc.mjs',
        "export const docs = {\n  name: 'Card',\n};\n",
      );
      git(repo, ['init', '-q', '-b', 'main']);
      git(repo, ['config', 'user.email', 'test@test.co']);
      git(repo, ['config', 'user.name', 'Test']);
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-qm', 'base']);
      git(repo, ['worktree', 'add', '-q', '--detach', baseRoot, 'HEAD']);
      git(repo, ['checkout', '-q', '-b', 'feature']);
      fs.appendFileSync(
        path.join(repo, 'packages/core/src/Card/Card.tsx'),
        'export const changed = true;\n',
      );
      git(repo, ['commit', '-qam', 'touch Card']);

      // Babel writes ES modules as `.js` in a "type": "module" package.
      write(baseRoot, 'packages/core/dist/Card/index.js', 'x'.repeat(100));
      write(
        baseRoot,
        'packages/core/dist/index.js',
        'export const base = 1;\n'.repeat(10),
      );
      write(repo, 'packages/core/dist/Card/index.js', 'x'.repeat(160));
      write(
        repo,
        'packages/core/dist/index.js',
        'export const head = 2;\n'.repeat(40),
      );

      execFileSync(
        process.execPath,
        [
          SCRIPT,
          '--base',
          'main',
          '--head',
          'HEAD',
          '--base-root',
          '.size-base',
          '--output',
          'analysis.json',
        ],
        {cwd: repo, encoding: 'utf8'},
      );
      const analysis = JSON.parse(
        fs.readFileSync(path.join(repo, 'analysis.json'), 'utf8'),
      );
      expect(analysis.componentStats.Card.esmBytes).toBe(160);
      expect(analysis.componentStats.Card.cjsBytes).toBeNull();
      expect(analysis.baseComponentStats.Card.esmBytes).toBe(100);
      const [headBundle] = analysis.bundlePackages;
      const [baseBundle] = analysis.baseBundlePackages;
      expect(headBundle.package).toBe('@astryxdesign/core');
      expect(baseBundle.package).toBe('@astryxdesign/core');
      expect(headBundle.gzipBytes).toBeGreaterThan(0);
      expect(baseBundle.gzipBytes).toBeGreaterThan(0);

      execFileSync(
        process.execPath,
        [
          SCRIPT,
          '--base',
          'main',
          '--head',
          'HEAD',
          '--base-root',
          '.size-base',
          '--base-only',
          '--output',
          'size-base.json',
        ],
        {cwd: repo, encoding: 'utf8'},
      );
      const baseOnly = JSON.parse(
        fs.readFileSync(path.join(repo, 'size-base.json'), 'utf8'),
      );
      expect(baseOnly.headSha).toBe(git(repo, ['rev-parse', 'HEAD']));
      expect(baseOnly.baseSha).toBe(git(repo, ['rev-parse', 'main']));
      expect(baseOnly.baseComponentStats.Card.esmBytes).toBe(100);
      expect(baseOnly.componentStats).toBeUndefined();
    } finally {
      fs.rmSync(repo, {recursive: true, force: true});
    }
  });
});
