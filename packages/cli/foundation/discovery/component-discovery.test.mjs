// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for component-discovery, run against the real
 * @astryxdesign/core source tree plus throwaway fixtures. Complements
 * component-discovery.importpath.test.mjs (which covers the .ts-source
 * import-path derivation) by pinning the discovery/grouping/resolution
 * behavior and the crash-on-missing-src surface.
 */

import {describe, it, expect, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  CORE_PACKAGE,
  discoverComponents,
  familyMember,
  findComponentReadme,
  findComponentSource,
  resolveImportPath,
  discoverExternalComponentsGrouped,
  findExternalComponentDoc,
  discoverIntegrationComponents,
  findIntegrationComponentDoc,
  findIntegrationComponentSource,
  discoverOwnedComponents,
} from './component-discovery.mjs';

// packages/cli/foundation/discovery/ -> up 4 = repo root (has packages/core).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const CORE = path.join(REPO, 'packages', 'core');

const SLOW = 30_000;

const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, {recursive: true, force: true});
  }
});

describe('discoverComponents (real core)', () => {
  it('discovers and groups real components', () => {
    const comps = discoverComponents(CORE);
    const keys = Object.keys(comps);
    expect(keys.length).toBeGreaterThan(20);
    for (const members of Object.values(comps)) {
      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBeGreaterThan(0);
      expect([...members].sort()).toEqual(members);
    }
    expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(keys);
    expect(keys).toContain('Button');
    expect(comps.Button).toContain('Button');
    expect(comps.Button).toContain('IconButton');
    expect(comps.Button.length).toBeGreaterThan(1);
  }, SLOW);

  it('never emits a non-ASCII (translated) group key', () => {
    // Regression: a `group:` prop inside a docsZh propDescriptions block leaked
    // a Chinese string as a group key in the default (English) listing.
    const comps = discoverComponents(CORE);
    for (const key of Object.keys(comps)) {
      expect([...key].every(ch => ch.charCodeAt(0) < 128)).toBe(true);
    }
  }, SLOW);

  it('honors group, hidden, and hiddenComponents from a directory doc', () => {
    const core = mkTmp('as-cd-group-');
    const dir = path.join(core, 'src', 'Foo');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'XDSFoo.tsx'), 'x');
    fs.writeFileSync(path.join(dir, 'XDSFooInternal.tsx'), 'x');
    fs.writeFileSync(
      path.join(dir, 'Foo.doc.mjs'),
      "export default {\n  group: 'Widgets',\n  hiddenComponents: ['FooInternal'],\n};\n",
    );
    expect(discoverComponents(core)).toEqual({Widgets: ['Foo']});
  });

  it('does not read a group: nested in a propDescriptions block', () => {
    // The ChatMessageBubble bug: a `group:` at 4-space indent inside
    // propDescriptions must NOT be picked up as the component's group.
    const core = mkTmp('as-cd-nested-');
    const dir = path.join(core, 'src', 'Bubble');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'XDSBubble.tsx'), 'x');
    fs.writeFileSync(
      path.join(dir, 'Bubble.doc.mjs'),
      'export default {\n' +
        "  displayName: 'Bubble',\n" +
        '  propDescriptions: {\n' +
        "    group: 'position within a multi-bubble group',\n" +
        '  },\n' +
        '};\n',
    );
    // No top-level group -> falls back to the component name, NOT the prop text.
    expect(discoverComponents(core)).toEqual({Bubble: ['Bubble']});
  });

  it('skips an entire directory whose doc is hidden: true', () => {
    const core = mkTmp('as-cd-hidden-');
    const dir = path.join(core, 'src', 'Bar');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'XDSBar.tsx'), 'x');
    fs.writeFileSync(path.join(dir, 'Bar.doc.mjs'), 'export default {\n  hidden: true,\n};\n');
    expect(discoverComponents(core)).toEqual({});
  });

  it('omits component source files that have no sibling doc file', () => {
    const core = mkTmp('as-cd-nodoc-');
    const dir = path.join(core, 'src', 'Naked');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'XDSNaked.tsx'), 'x');
    expect(discoverComponents(core)).toEqual({});
  });

  it('lists HStack, VStack and Heading, whose docs live in their family folders', () => {
    // Each has its own folder and import path; Stack's doc documents HStack and
    // VStack as members, and Heading's own doc sits in the Text folder.
    const comps = discoverComponents(CORE);
    expect(comps.Layout).toEqual(expect.arrayContaining(['HStack', 'Stack', 'VStack']));
    expect(comps.Heading).toEqual(['Heading']);
    expect(findComponentReadme(CORE, 'VStack')).toMatch(/[\\/]Stack[\\/]Stack\.doc\.mjs$/);
    expect(findComponentReadme(CORE, 'HStack')).toMatch(/[\\/]Stack[\\/]Stack\.doc\.mjs$/);
    expect(findComponentReadme(CORE, 'Heading')).toMatch(/[\\/]Text[\\/]Heading\.doc\.mjs$/);
    expect(resolveImportPath(CORE, 'VStack')).toBe('@astryxdesign/core/VStack');
    expect(resolveImportPath(CORE, 'Heading')).toBe('@astryxdesign/core/Heading');
  }, SLOW);

  it('lists a component folder with no doc when its family doc lists it as a member', () => {
    const core = mkTmp('as-cd-family-');
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(core, 'src', rel)), {recursive: true});
      fs.writeFileSync(path.join(core, 'src', rel), text);
    };
    write('Stack/Stack.tsx', 'x');
    write('VStack/VStack.tsx', "import {Stack} from '../Stack/Stack';\n");
    write('Prose/Prose.tsx', "import {Stack} from '../Stack/Stack';\n");
    // Listed by Stack's doc, but builds on nothing in Stack's folder.
    write('Orphan/Orphan.tsx', "import {x} from '../utils';\n");
    write(
      'Stack/Stack.doc.mjs',
      'export const docs = {\n' +
        "  name: 'Stack',\n" +
        "  group: 'Layout',\n" +
        "  relatedComponents: ['Prose'],\n" +
        "  usage: {description: 'Pair with Prose.', examples: [{code: \"<Prose label='Prose' />\"}]},\n" +
        "  components: [{name: 'Stack'}, {name: 'VStack', description: 'Vertical.'}, {name: 'Orphan'}],\n" +
        '};\n',
    );
    expect(discoverComponents(core)).toEqual({Layout: ['Stack', 'VStack']});
    expect(findComponentReadme(core, 'VStack')).toBe(
      path.join(core, 'src', 'Stack', 'Stack.doc.mjs'),
    );
    // Named only in relatedComponents, prose, and an example: not documented.
    expect(findComponentReadme(core, 'Prose')).toBeNull();
    // A family doc is read only from the folders the component imports.
    expect(findComponentReadme(core, 'Orphan')).toBeNull();
  });

  it('lists a component folder with no doc when its own doc sits in a family folder', () => {
    const core = mkTmp('as-cd-sibling-');
    for (const dir of ['Text', 'Heading']) {
      fs.mkdirSync(path.join(core, 'src', dir), {recursive: true});
    }
    fs.writeFileSync(path.join(core, 'src', 'Text', 'Text.tsx'), 'x');
    fs.writeFileSync(path.join(core, 'src', 'Heading', 'Heading.tsx'), 'x');
    fs.writeFileSync(
      path.join(core, 'src', 'Text', 'Text.doc.mjs'),
      "export const docs = {name: 'Text', components: [{name: 'Heading'}]};\n",
    );
    fs.writeFileSync(
      path.join(core, 'src', 'Text', 'Heading.doc.mjs'),
      "export const docs = {name: 'Heading'};\n",
    );
    expect(discoverComponents(core)).toEqual({Heading: ['Heading'], Text: ['Text']});
    expect(findComponentReadme(core, 'Heading')).toBe(
      path.join(core, 'src', 'Text', 'Heading.doc.mjs'),
    );
  });

  it('keeps a member its family hides, and a context folder, unlisted', () => {
    const core = mkTmp('as-cd-family-hidden-');
    for (const dir of ['Stack', 'VStack', 'SizeContext']) {
      fs.mkdirSync(path.join(core, 'src', dir), {recursive: true});
      fs.writeFileSync(
        path.join(core, 'src', dir, `${dir}.tsx`),
        "import {Stack} from '../Stack/Stack';\n",
      );
    }
    fs.writeFileSync(
      path.join(core, 'src', 'Stack', 'Stack.doc.mjs'),
      'export const docs = {\n' +
        "  name: 'Stack',\n" +
        "  hiddenComponents: ['VStack'],\n" +
        "  components: [{name: 'Stack'}, {name: 'VStack'}, {name: 'SizeContext'}],\n" +
        '};\n',
    );
    expect(discoverComponents(core)).toEqual({Stack: ['Stack']});
  });

  it('returns {} for an empty src/ dir', () => {
    const core = mkTmp('as-cd-emptysrc-');
    fs.mkdirSync(path.join(core, 'src'));
    expect(discoverComponents(core)).toEqual({});
  });

  it('throws when src/ is missing (no existsSync guard on the top readdir)', () => {
    const core = mkTmp('as-cd-nosrc-');
    expect(() => discoverComponents(core)).toThrow(/ENOENT/);
  });
});

describe('familyMember', () => {
  it("returns a family doc's entry for a member, and null for a component's own doc", () => {
    const stack = {name: 'Stack', components: [{name: 'Stack'}, {name: 'VStack', description: 'v'}]};
    expect(familyMember(stack, 'VStack')).toEqual({name: 'VStack', description: 'v'});
    expect(familyMember(stack, 'Stack')).toBeNull();
    expect(familyMember({name: 'Button'}, 'Button')).toBeNull();
    expect(familyMember(stack, 'HStack')).toBeNull();
  });
});

describe('findComponentReadme / findComponentSource / resolveImportPath', () => {
  it('finds the doc + source for a top-level component', () => {
    expect(findComponentReadme(CORE, 'Button')).toMatch(/Button\.doc\.mjs$/);
    expect(findComponentSource(CORE, 'Button')).toMatch(/\.tsx$/);
    expect(resolveImportPath(CORE, 'Button')).toBe('@astryxdesign/core/Button');
  }, SLOW);

  it('returns null for an unknown component (no fuzzy fallback, unlike hooks)', () => {
    expect(findComponentReadme(CORE, 'Buton')).toBeNull();
    expect(findComponentSource(CORE, 'Buton')).toBeNull();
  }, SLOW);

  it('falls back to the bare package root when no source is found', () => {
    const core = mkTmp('as-rip-empty-');
    fs.mkdirSync(path.join(core, 'src'));
    expect(resolveImportPath(core, 'Nope')).toBe('@astryxdesign/core');
  });

  it('throws when src/ is missing', () => {
    const core = mkTmp('as-fcr-nosrc-');
    expect(() => findComponentReadme(core, 'Button')).toThrow(/ENOENT/);
    expect(() => findComponentSource(core, 'Button')).toThrow(/ENOENT/);
    expect(() => resolveImportPath(core, 'Button')).toThrow(/ENOENT/);
  });
});

describe('external package discovery', () => {
  function buildExternalDocs() {
    const root = mkTmp('as-ext-');
    const docs = path.join(root, 'docs');
    fs.mkdirSync(path.join(docs, 'sub'), {recursive: true});
    fs.writeFileSync(path.join(docs, 'AppShell.doc.mjs'), "export default {\n  group: 'App Chrome',\n};\n");
    fs.writeFileSync(path.join(docs, 'sub', 'SideNav.doc.mjs'), "export default {\n  group: 'App Chrome',\n};\n");
    fs.writeFileSync(path.join(docs, 'Diff.doc.mjs'), 'export default {};\n');
    fs.writeFileSync(path.join(docs, 'Secret.doc.mjs'), 'export default {\n  hidden: true,\n};\n');
    return docs;
  }


  it('discoverExternalComponentsGrouped groups + drops hidden', () => {
    expect(discoverExternalComponentsGrouped(buildExternalDocs())).toEqual({
      'App Chrome': ['AppShell', 'SideNav'],
      Diff: ['Diff'],
    });
  });

  it('findExternalComponentDoc locates a nested doc by name', () => {
    const docs = buildExternalDocs();
    expect(findExternalComponentDoc(docs, 'SideNav')).toMatch(/SideNav\.doc\.mjs$/);
    expect(findExternalComponentDoc(docs, 'Nope')).toBeNull();
  });

  it('returns empty for a missing docs dir (guarded)', () => {
    expect(discoverExternalComponentsGrouped('/no/such/dir')).toEqual({});
    expect(findExternalComponentDoc('/no/such/dir', 'X')).toBeNull();
  });
});

describe('integration component discovery (ownership-aware)', () => {
  function buildIntegration() {
    const root = mkTmp('as-integ-');
    const cdir = path.join(root, 'components');
    fs.mkdirSync(path.join(cdir, 'sub'), {recursive: true});
    fs.writeFileSync(path.join(cdir, 'MetaAppShell.doc.mjs'), "export default {\n  group: 'App Chrome',\n};\n");
    fs.writeFileSync(path.join(cdir, 'MetaAppShell.tsx'), 'x');
    fs.writeFileSync(path.join(cdir, 'sub', 'MetaDiff.doc.ts'), 'export default {};\n');
    fs.writeFileSync(path.join(cdir, 'MetaSecret.doc.mjs'), 'export default {\n  hidden: true,\n};\n');
    return {name: '@acme/astryx-meta', components: cdir, issuesUrl: 'https://example.com/issues'};
  }

  it('records owner package, issuesUrl, group, and source presence; drops hidden', () => {
    const recs = discoverIntegrationComponents(buildIntegration()).sort((a, b) => a.name.localeCompare(b.name));
    expect(recs.map(r => r.name)).toEqual(['MetaAppShell', 'MetaDiff']);
    const shell = recs.find(r => r.name === 'MetaAppShell');
    expect(shell.package).toBe('@acme/astryx-meta');
    expect(shell.issuesUrl).toBe('https://example.com/issues');
    expect(shell.group).toBe('App Chrome');
    expect(shell.sourcePath).toMatch(/MetaAppShell\.tsx$/);
    expect(recs.find(r => r.name === 'MetaDiff').sourcePath).toBeNull();
  });

  it('finds an integration doc + source by name', () => {
    const integ = buildIntegration();
    expect(findIntegrationComponentDoc(integ, 'MetaAppShell')).toMatch(/MetaAppShell\.doc\.mjs$/);
    expect(findIntegrationComponentSource(integ, 'MetaAppShell')).toMatch(/MetaAppShell\.tsx$/);
    expect(findIntegrationComponentDoc(integ, 'MetaDiff')).toMatch(/MetaDiff\.doc\.ts$/);
    expect(findIntegrationComponentSource(integ, 'MetaDiff')).toBeNull();
    expect(findIntegrationComponentDoc(integ, 'Nope')).toBeNull();
  });

  it('gracefully handles a broken/missing integration components dir', () => {
    expect(discoverIntegrationComponents({name: 'x'})).toEqual([]);
    expect(discoverIntegrationComponents({name: 'x', components: '/no/such/dir'})).toEqual([]);
    expect(findIntegrationComponentDoc({name: 'x', components: '/no/such/dir'}, 'A')).toBeNull();
  });

  it('discoverOwnedComponents merges core + integration records', () => {
    const recs = discoverOwnedComponents(CORE, [buildIntegration()]);
    const button = recs.find(r => r.name === 'Button');
    expect(button).toBeDefined();
    expect(button.package).toBe(CORE_PACKAGE);
    expect(button.sourcePath).toMatch(/\.tsx$/);
    expect(recs.find(r => r.name === 'MetaAppShell').package).toBe('@acme/astryx-meta');
  }, SLOW);
});
