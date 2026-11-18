// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file End-to-end validation of the v0.3.0 authoring migration.
 *
 * Unlike the per-codemod unit tests, this exercises the two codemods TOGETHER
 * (in the order `astryx upgrade` runs them: unwrap-factories, then
 * migrate-imports) over a realistic corpus, and then proves the migrated output
 * is not merely string-correct but is ACCEPTED BY THE REAL PARSERS
 * (`parseConfig`/`parseIntegration`/`parseDoc`/`parseTemplate`/`parseCodemod`).
 * That closes the loop the unit tests can't: a consumer who ran `astryx upgrade`
 * ends up with authoring files the CLI actually loads. Also checks idempotency
 * (running the pair twice is a fixed point) and the tricky import shapes.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

import unwrapFactories from '../unwrap-authoring-factories.mjs';
import migrateImports from '../migrate-authoring-imports.mjs';
import {parseConfig} from '../../../../../authoring/config/parse.mjs';
import {parseIntegration} from '../../../../../authoring/integration/parse.mjs';
import {parseDoc} from '../../../../../authoring/doctypes/parse.mjs';
import {parseTemplate} from '../../../../../authoring/doctypes/template/parse.mjs';
import {parseCodemod} from '../../../../../authoring/codemod/parse.mjs';
import {REPO_ROOT} from '../../../../../test-utils/repo-root.mjs';

/** Run the full v0.3.0 authoring migration (both codemods, in release order). */
async function migrate(source, filePath = 'input.ts') {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  const afterUnwrap = unwrapFactories({source, path: filePath}, api) ?? source;
  const afterImports =
    migrateImports({source: afterUnwrap, path: filePath}, api) ?? afterUnwrap;
  return afterImports;
}

let tmpDir;
beforeAll(() => {
  // Repo-local temp dir: Vite's dynamic import blocks /tmp.
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-codemod-e2e-'));
});
afterAll(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** Write migrated source to a temp .mjs and return its default export. */
async function loadDefault(source) {
  const file = path.join(
    tmpDir,
    `m${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(file, source);
  const mod = await import(pathToFileURL(file).href);
  return mod.default;
}

// ---------------------------------------------------------------------------
// Corpus — realistic consumer files, one per authoring kind. Each authors with
// the removed factory + the old import surface, exactly what a pre-v0.3.0
// integration/app shipped. Content mirrors real Astryx docs/configs.
// ---------------------------------------------------------------------------

const CONFIG = `import {createConfig} from '@astryxdesign/core/config';

export default createConfig({
  integrations: ['@acme/widgets', '@acme/charts'],
  issuesUrl: 'https://github.com/acme/app/issues',
  hooks: {postCodemod: [{name: 'reinstall', buildCommand: () => ({command: 'pnpm', args: ['install']})}]},
  experimental: {xle: {components: {KpiCard: {from: '@/components/KpiCard', default: true}}}},
});
`;

const INTEGRATION = `import {createIntegration} from '@astryxdesign/core/authoring';

export default createIntegration({
  components: './components',
  templates: './templates',
  codemods: './codemods',
  issuesUrl: 'https://github.com/acme/widgets/issues',
});
`;

const COMPONENT_DOC = `import {createComponentDoc} from '@astryxdesign/core/authoring';

export default createComponentDoc({
  name: 'AcmeCarousel',
  displayName: 'Acme Carousel',
  description: 'A carousel that cycles through slides.',
  category: 'Content',
  keywords: ['carousel', 'slider', 'gallery'],
  props: [
    {name: 'slides', type: 'ReactNode[]', description: 'The slides to render.', required: true},
    {name: 'autoPlay', type: 'boolean', description: 'Advance automatically.', default: 'false'},
  ],
  usage: {description: 'Use to cycle related media.', bestPractices: [{guidance: true, description: 'Keep slides consistent in size.'}]},
  examples: [{label: 'Basic', code: '<AcmeCarousel slides={slides} />'}],
});
`;

const FUNCTION_DOC = `import {createFunctionDoc} from '@astryxdesign/core/authoring';

export default createFunctionDoc({
  name: 'useCarousel',
  displayName: 'useCarousel',
  description: 'Drives carousel state.',
  params: [{name: 'count', type: 'number', description: 'Slide count.', required: true}],
  returns: [{name: 'index', type: 'number', description: 'Active slide index.'}],
});
`;

const GENERIC_DOC = `import {createDoc} from '@astryxdesign/core/authoring';

export default createDoc({
  name: 'Theming',
  displayName: 'Theming',
  description: 'How theming works in this package.',
});
`;

const PAGE_TEMPLATE = `import {createPageTemplate} from '@astryxdesign/core/authoring';

export default createPageTemplate({
  name: 'Acme Landing',
  description: 'A marketing landing page.',
  category: 'Marketing',
  componentsUsed: ['AcmeCarousel', 'Button'],
  preview: {image: './preview.png', aspectRatio: '16 / 9'},
});
`;

const BLOCK_TEMPLATE = `import {createBlockTemplate} from '@astryxdesign/core/authoring';

export default createBlockTemplate({
  name: 'Acme Hero',
  description: 'A hero block.',
  componentsUsed: ['AcmeCarousel'],
});
`;

const CODE_CODEMOD = `import {createCodemod} from '@astryxdesign/cli/codemod';

export default createCodemod({
  title: 'Rename slides prop to items',
  description: 'v2 renamed AcmeCarousel.slides to items.',
  transform: (file) => file.source.replace(/slides=/g, 'items='),
});
`;

const CONFIG_CODEMOD = `import {createConfigCodemod} from '@astryxdesign/cli/codemod';

export default createConfigCodemod({
  title: 'Bump acme integration id',
  transform: (file) => file.source.replace('@acme/old', '@acme/new'),
});
`;

/** Each corpus entry: what to run, the parser it must satisfy, extra checks. */
const CORPUS = [
  {name: 'astryx.config', source: CONFIG, parse: parseConfig, stamp: null, keep: ["integrations: ['@acme/widgets'"]},
  {name: 'astryx.integration', source: INTEGRATION, parse: parseIntegration, stamp: null, keep: ["components: './components'"]},
  {name: 'component .doc', source: COMPONENT_DOC, parse: parseDoc, stamp: "type: 'component'", keep: ["name: 'AcmeCarousel'"]},
  {name: 'function .doc', source: FUNCTION_DOC, parse: parseDoc, stamp: "type: 'function'", keep: ["name: 'useCarousel'"]},
  {name: 'generic .doc', source: GENERIC_DOC, parse: parseDoc, stamp: "type: 'generic'", keep: ["name: 'Theming'"]},
  {name: 'page .template', source: PAGE_TEMPLATE, parse: parseTemplate, stamp: "type: 'page'", keep: ["name: 'Acme Landing'"]},
  {name: 'block .template', source: BLOCK_TEMPLATE, parse: parseTemplate, stamp: "type: 'block'", keep: ["name: 'Acme Hero'"]},
  {name: 'code codemod', source: CODE_CODEMOD, parse: parseCodemod, stamp: "type: 'code'", keep: ['title:']},
  {name: 'config codemod', source: CONFIG_CODEMOD, parse: parseCodemod, stamp: "type: 'config'", keep: ['title:']},
];

const FACTORY_NAMES = [
  'createConfig', 'createIntegration', 'createComponentDoc', 'createFunctionDoc',
  'createDoc', 'createPageTemplate', 'createBlockTemplate', 'createCodemod',
  'createConfigCodemod',
];

describe('v0.3.0 authoring migration — end to end over a realistic corpus', () => {
  for (const entry of CORPUS) {
    describe(entry.name, () => {
      it('migrates: drops factories, stamps type, repoints imports', async () => {
        const out = await migrate(entry.source);
        // No factory call or import survives.
        for (const f of FACTORY_NAMES) expect(out).not.toContain(f);
        // Old surfaces are gone; only the unified entrypoint may remain.
        expect(out).not.toContain('@astryxdesign/core/authoring');
        expect(out).not.toContain('@astryxdesign/core/config');
        expect(out).not.toContain('@astryxdesign/cli/codemod');
        // The discriminant is stamped for doc/template/codemod kinds.
        if (entry.stamp) expect(out).toContain(entry.stamp);
        // Payload is preserved.
        for (const k of entry.keep) expect(out).toContain(k);
      });

      it('output is accepted by the real parser', async () => {
        const out = await migrate(entry.source);
        const value = await loadDefault(out);
        // The load boundary the CLI actually uses must accept it.
        expect(() => entry.parse(value)).not.toThrow();
        // And the parsed value round-trips the stamp where applicable.
        if (entry.stamp) {
          const kind = entry.stamp.match(/'([^']+)'/)[1];
          expect(entry.parse(value).type).toBe(kind);
        }
      });

      it('is idempotent (running the migration twice is a fixed point)', async () => {
        const once = await migrate(entry.source);
        const twice = await migrate(once);
        expect(twice).toBe(once);
      });
    });
  }
});

describe('v0.3.0 authoring migration — import shapes & edge cases', () => {
  it('follows an aliased factory import', async () => {
    const out = await migrate(
      `import {createDoc as mkDoc} from '@astryxdesign/core/authoring';\nexport default mkDoc({name: 'X', description: 'y'});\n`,
    );
    expect(out).not.toMatch(/mkDoc|createDoc/);
    expect(out).toContain("type: 'generic'");
    expect(() => parseDoc(0)).toThrow(); // sanity: parser is real
    expect(parseDoc(await loadDefault(out)).type).toBe('generic');
  });

  it('keeps a sibling type import and repoints its source', async () => {
    const out = await migrate(
      `import {createComponentDoc, type ComponentDoc} from '@astryxdesign/core/authoring';\nconst d: ComponentDoc = createComponentDoc({name: 'X', props: []});\nexport default d;\n`,
    );
    expect(out).not.toContain('createComponentDoc');
    expect(out).toContain('ComponentDoc');
    expect(out).toContain("from '@astryxdesign/cli/authoring'");
    expect(out).toContain("type: 'component'");
  });

  it('wraps a non-object argument with a spread to preserve the stamp', async () => {
    const out = await migrate(
      `import {createComponentDoc} from '@astryxdesign/core/authoring';\nexport default createComponentDoc(baseDoc);\n`,
    );
    expect(out).toContain('...baseDoc');
    expect(out).toContain("type: 'component'");
  });

  it('overwrites an existing (wrong) type discriminant', async () => {
    const out = await migrate(
      `import {createComponentDoc} from '@astryxdesign/core/authoring';\nexport default createComponentDoc({type: 'wrong', name: 'X', props: []});\n`,
    );
    expect(out).toContain("type: 'component'");
    expect(out).not.toContain("'wrong'");
    expect(parseDoc(await loadDefault(out)).type).toBe('component');
  });

  it('handles multiple factories + type re-export in one module', async () => {
    const out = await migrate(
      `import {createDoc, createComponentDoc} from '@astryxdesign/core/authoring';\n` +
        `export const a = createDoc({name: 'A', description: 'a'});\n` +
        `export const b = createComponentDoc({name: 'B', props: []});\n` +
        `export {ComponentDoc} from '@astryxdesign/cli/doc';\n`,
    );
    expect(out).not.toMatch(/createDoc|createComponentDoc/);
    expect(out).toContain("type: 'generic'");
    expect(out).toContain("type: 'component'");
    // both the core value-import source and the cli/doc re-export collapse
    expect(out).not.toContain('@astryxdesign/core/authoring');
    expect(out).not.toContain('@astryxdesign/cli/doc');
    expect(out).toContain("from '@astryxdesign/cli/authoring'");
  });

  it('repoints a dynamic import and a TS import-type', async () => {
    const out = await migrate(
      `type C = import('@astryxdesign/cli/config').AstryxConfig;\n` +
        `const m = await import('@astryxdesign/cli/codemod');\n`,
    );
    expect(out).toContain("import('@astryxdesign/cli/authoring').AstryxConfig");
    expect(out).toContain("import('@astryxdesign/cli/authoring')");
    expect(out).not.toContain('@astryxdesign/cli/config');
    expect(out).not.toContain('@astryxdesign/cli/codemod');
  });

  it('all five old CLI subpaths collapse to /authoring', async () => {
    for (const sub of ['config', 'doc', 'integration', 'template', 'codemod']) {
      const out = await migrate(
        `import type {T} from '@astryxdesign/cli/${sub}';\nexport const x: T = null;\n`,
      );
      expect(out).toContain("from '@astryxdesign/cli/authoring'");
      expect(out).not.toContain(`@astryxdesign/cli/${sub}'`);
    }
  });

  it('is a no-op on a file with no authoring usage', async () => {
    const input = `import {Button} from '@astryxdesign/core';\nexport const x = <Button />;\n`;
    expect(await migrate(input)).toBe(input);
  });
});
