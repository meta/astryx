// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Type-level validation of the v0.3.0 authoring migration.
 *
 * `migrate-authoring-imports` changes TYPE import paths, so the decisive proof
 * is that migrated consumer code still type-checks: the new
 * `@astryxdesign/cli/authoring` path must resolve and export the types, and the
 * unwrapped objects must still satisfy them. This runs both codemods over
 * type-annotated fixtures, writes the result to a temporary project that links
 * `@astryxdesign/cli` and `@astryxdesign/core`, and runs the real `tsc` over
 * it.
 *
 * A negative control asserts the PRE-migration source fails `tsc` (the old
 * `@astryxdesign/core/authoring|config` paths and the `create*` factories are
 * gone in v0.3.0) — so the check can't pass vacuously.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';

import unwrap from '../unwrap-authoring-factories.mjs';
import migrate from '../migrate-authoring-imports.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../../../test-utils/linked-fixture.mjs';

const CLI_DIR = path.resolve(import.meta.dirname, '../../../../..'); // packages/cli
const REPO_ROOT = path.resolve(CLI_DIR, '../..');
// The workspace's own tsc, run with node. Through `pnpm exec` it fails on
// Windows, where pnpm is a pnpm.cmd batch file that needs a shell to start.
const TSC = createRequire(path.join(REPO_ROOT, 'package.json')).resolve(
  'typescript/bin/tsc',
);

async function migrateSource(src) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  const a = unwrap({source: src, path: 'f.ts'}, api) ?? src;
  return migrate({source: a, path: 'f.ts'}, api) ?? a;
}

// Pre-migration TS: authored with the removed factory + removed import surface,
// and a type annotation that only holds once the migrated types resolve + match.
const FIXTURES = {
  'config.ts': `import {createConfig} from '@astryxdesign/core/config';
import type {AstryxConfig} from '@astryxdesign/core/config';
const config: AstryxConfig = createConfig({integrations: ['@acme/widgets'], issuesUrl: 'https://example.com/i'});
export default config;
`,
  'integration.ts': `import {createIntegration} from '@astryxdesign/core/authoring';
import type {AstryxIntegration} from '@astryxdesign/core/authoring';
const integration: AstryxIntegration = createIntegration({components: './components', codemods: './codemods'});
export default integration;
`,
  'component.doc.ts': `import {createComponentDoc} from '@astryxdesign/core/authoring';
import type {ComponentDoc} from '@astryxdesign/core/authoring';
const doc: ComponentDoc = createComponentDoc({name: 'AcmeCarousel', displayName: 'Acme Carousel', usage: {description: 'Cycle related media.'}, props: [{name: 'slides', type: 'ReactNode[]', description: 'Slides.'}]});
export default doc;
`,
  'function.doc.ts': `import {createFunctionDoc} from '@astryxdesign/core/authoring';
import type {HookDoc} from '@astryxdesign/core/authoring';
const doc: HookDoc = createFunctionDoc({name: 'useCarousel', displayName: 'useCarousel', usage: {description: 'Drive carousel state.'}, params: [{name: 'count', type: 'number', description: 'Count.'}], returns: [{name: 'index', type: 'number', description: 'Index.'}]});
export default doc;
`,
  'generic.doc.ts': `import {createDoc} from '@astryxdesign/core/authoring';
import type {ReferenceDoc} from '@astryxdesign/core/authoring';
const doc: ReferenceDoc = createDoc({name: 'theming', title: 'Theming', description: 'How theming works.', sections: [{title: 'Overview', content: [{type: 'prose', text: 'Themes cascade.'}]}]});
export default doc;
`,
  'page.template.ts': `import {createPageTemplate} from '@astryxdesign/core/authoring';
import type {TemplateDoc} from '@astryxdesign/core/authoring';
const t: TemplateDoc = createPageTemplate({name: 'Landing', displayName: 'Landing', description: 'A landing page.'});
export default t;
`,
  'block.template.ts': `import {createBlockTemplate} from '@astryxdesign/core/authoring';
import type {TemplateDoc} from '@astryxdesign/core/authoring';
const t: TemplateDoc = createBlockTemplate({name: 'Hero', displayName: 'Hero', exampleFor: 'Button', aspectRatio: 1.5, description: 'A hero block.'});
export default t;
`,
  'codemod.ts': `import {createCodemod} from '@astryxdesign/cli/codemod';
import type {AstryxCodemodTransform} from '@astryxdesign/cli/codemod';
const transform: AstryxCodemodTransform = file => file.source.replace(/a/g, 'b');
export default createCodemod({title: 'Rename', transform});
`,
};

const TSCONFIG = JSON.stringify(
  {
    extends: path.join(REPO_ROOT, 'tsconfig.json'),
    // allowJs mirrors the CLI's own tsconfigs: the authoring `.ts` barrel
    // re-exports the parser values from `.mjs`, which need to be readable.
    compilerOptions: {noEmit: true, skipLibCheck: true, allowJs: true, checkJs: false},
    include: ['*.ts'],
  },
  null,
  2,
);

let dir;
beforeAll(async () => {
  // The root tsconfig names the `node` and jest-dom types.
  dir = makeLinkedFixture('astryx-codemod-tsc-', [
    '@astryxdesign/cli',
    '@astryxdesign/core',
    '@types/node',
    '@testing-library/jest-dom',
  ]);
  fs.mkdirSync(path.join(dir, 'pre'));
  fs.mkdirSync(path.join(dir, 'post'));
  for (const [name, src] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(dir, 'pre', name), src);
    fs.writeFileSync(path.join(dir, 'post', name), await migrateSource(src));
  }
  fs.writeFileSync(path.join(dir, 'pre', 'tsconfig.json'), TSCONFIG);
  fs.writeFileSync(path.join(dir, 'post', 'tsconfig.json'), TSCONFIG);
});

afterAll(() => {
  if (dir) removeLinkedFixture(dir);
});

/** Run the real tsc on a fixture dir; return {ok, output}. */
function tsc(which) {
  const project = path.join(dir, which, 'tsconfig.json');
  try {
    execFileSync(process.execPath, [TSC, '-p', project], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
    return {ok: true, output: ''};
  } catch (err) {
    return {ok: false, output: `${err.stdout || ''}${err.stderr || ''}`};
  }
}

describe('v0.3.0 authoring migration — type-level (tsc)', () => {
  it('migrated consumer code type-checks against the real authoring types', () => {
    const {ok, output} = tsc('post');
    expect(ok, `tsc reported errors on migrated output:\n${output}`).toBe(true);
  }, 60000);

  it('negative control: pre-migration code fails tsc (removed paths + factories)', () => {
    const {ok, output} = tsc('pre');
    expect(ok).toBe(false);
    // The failures are the ones the codemod exists to fix.
    expect(output).toMatch(/Cannot find module '@astryxdesign\/core\/(authoring|config)'/);
    expect(output).toMatch(/has no exported member 'createCodemod'|Cannot find module/);
  }, 60000);
});
