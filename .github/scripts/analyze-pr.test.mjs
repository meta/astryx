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
import {createRequire} from 'node:module';
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
  fs.mkdirSync(path.join(upstream, 'packages/core/src/Badge'), {recursive: true});
  fs.writeFileSync(path.join(upstream, 'packages/core/src/index.ts'), "export {Card} from './Card';\nexport {Badge} from './Badge';\n");
  fs.writeFileSync(path.join(upstream, 'packages/core/src/Badge/Badge.tsx'), 'export function Badge() {}\n');
  fs.writeFileSync(path.join(upstream, 'packages/core/src/Badge/Badge.doc.mjs'), "export default {name: 'Badge'};\n");
  fs.writeFileSync(path.join(upstream, 'packages/core/src/Badge/index.ts'), "export {Badge} from './Badge';\n");
  fs.writeFileSync(path.join(upstream, 'packages/core/src/Badge/Badge.spec.md'), '---\nschema_version: 3\n---\n');
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
  // Only Badge's knowledge record changes: no browser audit owns Badge.
  fs.appendFileSync(path.join(upstream, 'packages/core/src/Badge/Badge.spec.md'), 'record text\n');
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
  // Analysis bundles every package's build to find reverse dependents
  // across packages, which takes this five-package fixture past the default
  // 30 s on a loaded runner.
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
      expect(analysis.modifiedComponentOwners).not.toContain('core/Badge');
      expect(analysis.unresolvedComponentSources).not.toContain('core/Badge');
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
  }, 60_000);
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

      // A family folder's components are reverse dependents of its change:
      // visual and RTL audit them, PR accessibility (changed components with
      // stories of their own) does not.
      expect(analysis.modifiedComponentOwners).toEqual(['core/Tokenizer']);
      // One set of folders: visual reads the folder, RTL every component the
      // folder implements.
      expect(analysis.dependentComponentFolders).toEqual(['core/Chat']);
      expect(analysis.dependentComponentOwners).toEqual(['core/Chat', 'core/ChatComposer']);
      // The changed family folder stays listed, so PR accessibility expands
      // it to its members (spec:AST-030 FR12, DEC-5), and visual gets it.
      expect(analysis.unresolvedComponentSources).toEqual(['core/Chat']);
      // Its change was decided by the folder, so it asks for no full audit.
      expect(analysis.forceFullComponentAudits).toBe(false);
    } finally {
      fs.rmSync(repo, {recursive: true, force: true});
    }
  });
});

describe('analyze-pr base and head sizes', () => {
  it('sizes a component whose bundle reaches a changed shared module', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-analyze-reach-'));
    const write = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), {recursive: true});
      fs.writeFileSync(path.join(repo, file), content);
    };
    try {
      write('package.json', '{}');
      write('.gitignore', 'dist/\n*.json.out\nanalysis.json\n');
      write('packages/core/package.json', '{"type": "module"}\n');
      write('packages/core/src/index.ts', "export {Card} from './Card';\nexport {Badge} from './Badge';\n");
      write('packages/core/src/Card/index.ts', "export {Card} from './Card';\n");
      write('packages/core/src/Card/Card.tsx', "import {useHold} from '../hooks/useHold';\nexport function Card() { return useHold(); }\n");
      write('packages/core/src/Card/Card.doc.mjs', "export const docs = {\n  name: 'Card',\n};\n");
      write('packages/core/src/Badge/index.ts', "export {Badge} from './Badge';\n");
      write('packages/core/src/Badge/Badge.tsx', 'export function Badge() {}\n');
      write('packages/core/src/Badge/Badge.doc.mjs', "export const docs = {\n  name: 'Badge',\n};\n");
      write('packages/core/src/hooks/useHold.ts', 'export function useHold() { return 1; }\n');
      git(repo, ['init', '-q', '-b', 'main']);
      git(repo, ['config', 'user.email', 'test@test.co']);
      git(repo, ['config', 'user.name', 'Test']);
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-qm', 'base']);
      git(repo, ['checkout', '-q', '-b', 'feature']);
      write('packages/core/src/hooks/useHold.ts', 'export function useHold() { return 2; }\n');
      git(repo, ['commit', '-qam', 'touch the shared hook only']);
      write('packages/core/dist/Card/Card.js', "import {useHold} from '../hooks/useHold.js';\nexport function Card() { return useHold(); }\n");
      write('packages/core/dist/Badge/Badge.js', 'export function Badge() { return 0; }\n');
      write('packages/core/dist/hooks/useHold.js', 'export function useHold() { return 2; }\n');
      write('packages/core/dist/index.js', "export {Card} from './Card/Card.js';\nexport {Badge} from './Badge/Badge.js';\n");

      execFileSync(
        process.execPath,
        [SCRIPT, '--base', 'main', '--head', 'HEAD', '--output', 'analysis.json'],
        {cwd: repo, encoding: 'utf8'},
      );
      const analysis = JSON.parse(fs.readFileSync(path.join(repo, 'analysis.json'), 'utf8'));
      expect(Object.keys(analysis.componentSizes)).toEqual(['core/Card']);
      // The shared hook's reverse dependent is audited, not the whole roster.
      // A reverse dependent, kept apart from the changed owners: visual and
      // RTL audits run it, PR accessibility stays with changed owners.
      expect(analysis.modifiedComponentOwners).toEqual([]);
      expect(analysis.dependentComponentOwners).toEqual(['core/Card']);
      // The shared folder stays listed (PR accessibility finds no component
      // documented in it); its reach decided it, so no full audit.
      expect(analysis.unresolvedComponentSources).toEqual(['core/hooks']);
      expect(analysis.forceFullComponentAudits).toBe(false);

      // A change to shared infrastructure asks for full audits whatever it
      // reaches.
      execFileSync(
        process.execPath,
        [SCRIPT, '--base', 'main', '--head', 'HEAD', '--output', 'analysis.json', '--force-full'],
        {cwd: repo, encoding: 'utf8'},
      );
      const forced = JSON.parse(fs.readFileSync(path.join(repo, 'analysis.json'), 'utf8'));
      expect(forced.forceFullComponentAudits).toBe(true);

      // A module no component bundle holds changes no component: it adds no
      // owner and asks for no full audit.
      write('packages/core/src/hooks/useOrphan.ts', 'export function useOrphan() { return 1; }\n');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-qm', 'add a module nothing imports']);
      write('packages/core/dist/hooks/useOrphan.js', 'export function useOrphan() { return 1; }\n');
      execFileSync(
        process.execPath,
        [SCRIPT, '--base', 'main', '--head', 'HEAD', '--output', 'analysis.json'],
        {cwd: repo, encoding: 'utf8'},
      );
      const orphan = JSON.parse(fs.readFileSync(path.join(repo, 'analysis.json'), 'utf8'));
      expect(orphan.dependentComponentOwners).toEqual(['core/Card']);
      expect(orphan.forceFullComponentAudits).toBe(false);

      // Without a build to read reach from, a shared module stays unresolved:
      // full audits.
      fs.rmSync(path.join(repo, 'packages/core/dist'), {recursive: true});
      execFileSync(
        process.execPath,
        [SCRIPT, '--base', 'main', '--head', 'HEAD', '--output', 'analysis.json'],
        {cwd: repo, encoding: 'utf8'},
      );
      const unbuilt = JSON.parse(fs.readFileSync(path.join(repo, 'analysis.json'), 'utf8'));
      expect(unbuilt.unresolvedComponentSources).toEqual(['core/hooks']);
      expect(unbuilt.forceFullComponentAudits).toBe(true);
    } finally {
      fs.rmSync(repo, {recursive: true, force: true});
    }
  });

  it('adds the components of another package whose bundle reaches a changed Core module', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-analyze-crossreach-'));
    const write = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), {recursive: true});
      fs.writeFileSync(path.join(repo, file), content);
    };
    try {
      write('package.json', '{}');
      write('.gitignore', 'dist/\n*.json.out\nanalysis.json\n');
      write('packages/core/package.json', '{"type": "module"}\n');
      write('packages/core/src/index.ts', "export {Card} from './Card';\n");
      write('packages/core/src/Card/index.ts', "export {Card} from './Card';\n");
      write('packages/core/src/Card/Card.tsx', "import {useHold} from '../hooks/useHold';\nexport function Card() { return useHold(); }\n");
      write('packages/core/src/Card/Card.doc.mjs', "export const docs = {\n  name: 'Card',\n};\n");
      write('packages/core/src/hooks/useHold.ts', 'export function useHold() { return 1; }\n');
      write('packages/lab/package.json', '{"type": "module"}\n');
      write('packages/lab/src/index.ts', "export {Sketch} from './Sketch';\nexport {Plain} from './Plain';\n");
      write('packages/lab/src/Sketch/index.ts', "export {Sketch} from './Sketch';\n");
      write('packages/lab/src/Sketch/Sketch.tsx', "import {useHold} from '@astryxdesign/core';\nexport function Sketch() { return useHold(); }\n");
      write('packages/lab/src/Sketch/Sketch.doc.mjs', "export const docs = {\n  name: 'Sketch',\n};\n");
      write('packages/lab/src/Plain/index.ts', "export {Plain} from './Plain';\n");
      write('packages/lab/src/Plain/Plain.tsx', 'export function Plain() {}\n');
      write('packages/lab/src/Plain/Plain.doc.mjs', "export const docs = {\n  name: 'Plain',\n};\n");
      git(repo, ['init', '-q', '-b', 'main']);
      git(repo, ['config', 'user.email', 'test@test.co']);
      git(repo, ['config', 'user.name', 'Test']);
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-qm', 'base']);
      git(repo, ['checkout', '-q', '-b', 'feature']);
      write('packages/core/src/hooks/useHold.ts', 'export function useHold() { return 2; }\n');
      git(repo, ['commit', '-qam', 'touch the Core hook']);
      write('packages/core/dist/Card/Card.js', "import {useHold} from '../hooks/useHold.js';\nexport function Card() { return useHold(); }\n");
      write('packages/core/dist/hooks/useHold.js', 'export function useHold() { return 2; }\n');
      write('packages/core/dist/index.js', "export {Card} from './Card/Card.js';\n");
      // Lab's build imports Core's build, as the package does.
      write('packages/lab/dist/Sketch/Sketch.js', "import {useHold} from '../../../core/dist/hooks/useHold.js';\nexport function Sketch() { return useHold(); }\n");
      write('packages/lab/dist/Plain/Plain.js', 'export function Plain() { return 0; }\n');
      write('packages/lab/dist/index.js', "export {Sketch} from './Sketch/Sketch.js';\nexport {Plain} from './Plain/Plain.js';\n");

      execFileSync(
        process.execPath,
        [SCRIPT, '--base', 'main', '--head', 'HEAD', '--output', 'analysis.json'],
        {cwd: repo, encoding: 'utf8'},
      );
      const analysis = JSON.parse(fs.readFileSync(path.join(repo, 'analysis.json'), 'utf8'));
      // RTL and visual follow the Core change into Lab, as the full audit the
      // base ran did; Lab's untouched Plain stays out.
      expect(analysis.dependentComponentOwners).toEqual(['core/Card', 'lab/Sketch']);
      expect(analysis.forceFullComponentAudits).toBe(false);
    } finally {
      fs.rmSync(repo, {recursive: true, force: true});
    }
  });

  it('decides reach in the merge-base build when only the base is built', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-analyze-basereach-'));
    const baseRoot = path.join(repo, '.size-base');
    const write = (root, file, content) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), content);
    };
    try {
      write(repo, 'package.json', '{}');
      write(repo, '.gitignore', 'dist/\n.size-base/\nbase.json\n');
      write(repo, 'packages/core/package.json', '{"type": "module"}\n');
      write(repo, 'packages/core/src/index.ts', "export {Card} from './Card';\nexport {Badge} from './Badge';\n");
      write(repo, 'packages/core/src/Card/index.ts', "export {Card} from './Card';\n");
      write(repo, 'packages/core/src/Card/Card.tsx', "import {useHold} from '../hooks/useHold';\nexport function Card() { return useHold(); }\n");
      write(repo, 'packages/core/src/Card/Card.doc.mjs', "export const docs = {\n  name: 'Card',\n};\n");
      write(repo, 'packages/core/src/Badge/index.ts', "export {Badge} from './Badge';\n");
      write(repo, 'packages/core/src/Badge/Badge.tsx', 'export function Badge() {}\n');
      write(repo, 'packages/core/src/Badge/Badge.doc.mjs', "export const docs = {\n  name: 'Badge',\n};\n");
      write(repo, 'packages/core/src/hooks/useHold.ts', 'export function useHold() { return 1; }\n');
      git(repo, ['init', '-q', '-b', 'main']);
      git(repo, ['config', 'user.email', 'test@test.co']);
      git(repo, ['config', 'user.name', 'Test']);
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-qm', 'base']);
      git(repo, ['worktree', 'add', '-q', '--detach', baseRoot, 'HEAD']);
      git(repo, ['checkout', '-q', '-b', 'feature']);
      write(repo, 'packages/core/src/hooks/useHold.ts', 'export function useHold() { return 2; }\n');
      git(repo, ['commit', '-qam', 'touch the shared hook only']);
      // Only the merge base is built, as in the size-base job.
      write(baseRoot, 'packages/core/dist/Card/Card.js', "import {useHold} from '../hooks/useHold.js';\nexport function Card() { return useHold(); }\n");
      write(baseRoot, 'packages/core/dist/Badge/Badge.js', 'export function Badge() { return 0; }\n');
      write(baseRoot, 'packages/core/dist/hooks/useHold.js', 'export function useHold() { return 1; }\n');
      write(baseRoot, 'packages/core/dist/index.js', "export {Card} from './Card/Card.js';\nexport {Badge} from './Badge/Badge.js';\n");

      execFileSync(
        process.execPath,
        [SCRIPT, '--base', 'main', '--head', 'HEAD', '--base-root', '.size-base', '--base-only', '--output', 'base.json'],
        {cwd: repo, encoding: 'utf8'},
      );
      const base = JSON.parse(fs.readFileSync(path.join(repo, 'base.json'), 'utf8'));
      expect(Object.keys(base.baseComponentSizes)).toEqual(['core/Card']);
      expect(base.baseComponentSizes['core/Card'].importGzipBytes).toBeGreaterThan(0);
    } finally {
      fs.rmSync(repo, {recursive: true, force: true});
    }
  });

  it('measures the merge base through its own defining module when the pull request renames it', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-analyze-rename-'));
    const baseRoot = path.join(repo, '.size-base');
    const write = (root, file, content) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), content);
    };
    try {
      write(repo, 'package.json', '{}');
      write(repo, '.gitignore', 'dist/\n.size-base/\nbase.json\n');
      write(repo, 'packages/core/package.json', '{"type": "module"}\n');
      write(repo, 'packages/core/src/index.ts', "export {Card} from './Card';\n");
      write(repo, 'packages/core/src/Card/index.ts', "export {Card} from './Card';\n");
      write(repo, 'packages/core/src/Card/Card.tsx', 'export function Card() {}\n');
      write(repo, 'packages/core/src/Card/Card.doc.mjs', "export const docs = {\n  name: 'Card',\n};\n");
      git(repo, ['init', '-q', '-b', 'main']);
      git(repo, ['config', 'user.email', 'test@test.co']);
      git(repo, ['config', 'user.name', 'Test']);
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-qm', 'base']);
      git(repo, ['worktree', 'add', '-q', '--detach', baseRoot, 'HEAD']);
      git(repo, ['checkout', '-q', '-b', 'feature']);
      git(repo, ['mv', 'packages/core/src/Card/Card.tsx', 'packages/core/src/Card/CardView.tsx']);
      write(repo, 'packages/core/src/Card/index.ts', "export {Card} from './CardView';\n");
      git(repo, ['commit', '-qam', 'rename the defining module']);
      // Only the merge base is built; its package entry does not export Card,
      // so a figure proves the defining module was measured.
      write(baseRoot, 'packages/core/dist/Card/Card.js', 'export function Card() { return 1; }\n');
      write(baseRoot, 'packages/core/dist/index.js', 'export const other = 1;\n');

      execFileSync(
        process.execPath,
        [SCRIPT, '--base', 'main', '--head', 'HEAD', '--base-root', '.size-base', '--base-only', '--output', 'base.json'],
        {cwd: repo, encoding: 'utf8'},
      );
      const base = JSON.parse(fs.readFileSync(path.join(repo, 'base.json'), 'utf8'));
      expect(base.baseComponentSizes['core/Card'].importGzipBytes).toBeGreaterThan(0);
    } finally {
      fs.rmSync(repo, {recursive: true, force: true});
    }
  });

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
        "export {Card} from './Card';\nexport {Chat, ChatComposer} from './Chat';\n",
      );
      write(
        repo,
        'packages/core/src/Chat/index.ts',
        "export {Chat} from './Chat';\nexport {ChatComposer} from './ChatComposer';\n",
      );
      write(repo, 'packages/core/src/Chat/Chat.tsx', 'export function Chat() {}\n');
      write(repo, 'packages/core/src/Chat/ChatComposer.tsx', 'export function ChatComposer() {}\n');
      write(repo, 'packages/core/src/Chat/Chat.doc.mjs', "export const docs = {\n  name: 'Chat',\n};\n");
      write(
        repo,
        'packages/core/src/Chat/ChatComposer.doc.mjs',
        "export const docs = {\n  name: 'ChatComposer',\n};\n",
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
      fs.appendFileSync(
        path.join(repo, 'packages/core/src/Chat/ChatComposer.tsx'),
        'export const changed = true;\n',
      );
      git(repo, ['commit', '-qam', 'touch Card and the Chat family']);

      // Babel writes ES modules as `.js` in a "type": "module" package.
      write(baseRoot, 'packages/core/dist/Card/index.js', 'x'.repeat(100));
      write(
        baseRoot,
        'packages/core/dist/index.js',
        'export const base = 1;\n'.repeat(10),
      );
      write(repo, 'packages/core/dist/Card/index.js', 'x'.repeat(160));
      write(baseRoot, 'packages/core/dist/Card/Card.js', 'export function Card() {}\n');
      write(
        repo,
        'packages/core/dist/Card/Card.js',
        'export function Card() { return "a longer head body"; }\nexport const changed = true;\n',
      );
      write(baseRoot, 'packages/core/dist/Chat/Chat.js', 'export function Chat() {}\n');
      write(repo, 'packages/core/dist/Chat/Chat.js', 'export function Chat() {}\n');
      write(
        repo,
        'packages/core/dist/Chat/ChatComposer.js',
        'export function ChatComposer() { return "new"; }\n',
      );
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
      // Every public component in a changed folder is sized, family folders
      // included, at head and at the merge base.
      expect(Object.keys(analysis.componentSizes).sort()).toEqual([
        'core/Card',
        'core/Chat',
        'core/ChatComposer',
      ]);
      expect(analysis.componentSizes['core/Card'].importGzipBytes).toBeGreaterThan(
        analysis.baseComponentSizes['core/Card'].importGzipBytes,
      );
      expect(analysis.componentSizes['core/ChatComposer'].importGzipBytes).toBeGreaterThan(0);
      expect(analysis.baseComponentSizes['core/ChatComposer'].importGzipBytes).toBeNull();
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
      expect(baseOnly.baseComponentSizes['core/Chat'].importGzipBytes).toBeGreaterThan(0);
    } finally {
      fs.rmSync(repo, {recursive: true, force: true});
    }
  });
});

// An oracle over this repository: every Core component a story can own is one
// of the components its folder's affected set hands RTL, found here by
// reading the barrels independently of analyze-pr (spec:AST-030 FR13).
describe('analyze-pr folder membership oracle', () => {
  const require = createRequire(import.meta.url);
  const {folderComponents} = require('./analyze-pr.js');
  const {
    COMPONENT_PACKAGES,
    nestedPackageComponentNames,
  } = require('../../scripts/component-packages.cjs');
  const repoRoot = path.resolve(SCRIPTS_DIR, '../..');
  const core = COMPONENT_PACKAGES.find(pkg => pkg.name === 'core');
  const src = path.join(repoRoot, core.src);
  const canonical = new Set(nestedPackageComponentNames(repoRoot, core));

  // The names a module exports, following its re-exports within its folder.
  const exportedNames = (file, folder, seen = new Set()) => {
    if (seen.has(file) || !fs.existsSync(file)) return [];
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    const names = [];
    for (const [, list, from] of text.matchAll(
      /export\s*\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g,
    )) {
      // A re-export from another folder belongs to that folder.
      if (
        from != null &&
        !path.resolve(path.dirname(file), from).startsWith(folder + path.sep)
      )
        continue;
      for (const part of list.split(',')) {
        const name = part
          .replace(/^\s*type\s+/, '')
          .split(/\s+as\s+/)
          .pop()
          ?.trim();
        if (name) names.push(name);
      }
    }
    for (const [, name] of text.matchAll(
      /export\s+(?:declare\s+)?(?:function|const|class)\s+([A-Z]\w*)/g,
    )) {
      names.push(name);
    }
    for (const [, target] of text.matchAll(
      /export\s*\*\s*from\s*['"](\.[^'"]+)['"]/g,
    )) {
      const base = path
        .resolve(path.dirname(file), target)
        .replace(/\.js$/, '');
      if (!base.startsWith(folder + path.sep)) continue;
      const next = ['.ts', '.tsx', '/index.ts', '/index.tsx']
        .map(ext => base + ext)
        .find(fs.existsSync);
      if (next) names.push(...exportedNames(next, folder, seen));
    }
    return names;
  };
  // Every Core folder with a barrel of its own, whether the package barrel
  // names it directly or reaches it through another folder (Code via
  // CodeBlock).
  const folders = fs
    .readdirSync(src, {withFileTypes: true})
    .filter(
      entry =>
        entry.isDirectory() &&
        fs.existsSync(path.join(src, entry.name, 'index.ts')),
    )
    .map(entry => entry.name);

  it('finds Core folders to check', () => {
    expect(folders.length).toBeGreaterThan(50);
  });

  it('hands RTL every canonical component each Core folder exports, family members included', () => {
    const missing = [];
    for (const folder of folders) {
      const expected = exportedNames(
        path.join(src, folder, 'index.ts'),
        path.join(src, folder),
      ).filter(name => canonical.has(name));
      const actual = new Set(folderComponents(core, folder, repoRoot));
      for (const name of expected)
        if (!actual.has(name)) missing.push(`${folder}/${name}`);
    }
    expect(missing).toEqual([]);
  });

  it('places every canonical Core component in some folder', () => {
    const placed = new Set(
      folders.flatMap(folder => folderComponents(core, folder, repoRoot)),
    );
    expect([...canonical].filter(name => !placed.has(name))).toEqual([]);
  });

  it('lists the members CodeBunny found skipped (FieldLabel in Field, DrawerHeader in Drawer)', () => {
    const owners = folders.flatMap(folder =>
      folderComponents(core, folder, repoRoot),
    );
    for (const name of ['FieldLabel', 'DrawerHeader', 'AvatarStatusDot']) {
      if (canonical.has(name)) expect(owners).toContain(name);
    }
  });
});
