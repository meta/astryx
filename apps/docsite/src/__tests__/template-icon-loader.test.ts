// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The experimental DOCSITE_ICON_SET build setting: unset, the build
 * adds nothing and previews keep their templates' icons; set, each template
 * preview takes its icons from the chosen sets, and an icon no set has draws
 * the placeholder the source declares.
 *
 * @input A temporary project with an installed icon set, a template source and
 *   its doc, and the Next.js config
 * @output Regression coverage for the preview icon-set setting
 * @position Build-time docsite tooling verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  previewIconSetList,
  rewriteTemplatePreview,
} from '../../scripts/template-icon-loader.mjs';
import {writeIconSetProject} from '../../../../packages/cli/test-utils/icon-set-fixture.mjs';
import {discoverIntegrationTemplatesForOne} from '../../../../packages/cli/foundation/discovery/template-adapter.mjs';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docsite-icon-set-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
  vi.unstubAllEnvs();
});

const SOURCE = [
  "import {XMarkIcon, ScissorsIcon} from '@heroicons/react/24/outline';",
  "import {Icon} from '@astryxdesign/core/Icon';",
  'export default function Page() {',
  '  return <><Icon icon={XMarkIcon} /><Icon icon={ScissorsIcon} /></>;',
  '}',
  '',
].join('\n');

const ICONS = "icons: {XMarkIcon: 'close', ScissorsIcon: 'cut'}";

/**
 * A block template and its doc, in a templates folder, under a doc suffix
 * template discovery accepts. Returns the source path.
 */
function writeTemplate(docSuffix = '.doc.mjs'): string {
  const dir = path.join(tmp, 'templates');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'demo.tsx'), SOURCE);
  fs.writeFileSync(
    path.join(dir, `demo${docSuffix}`),
    `export default {type: 'block', name: 'Demo', description: 'A demo.', aspectRatio: 1, componentsUsed: [], ${ICONS}};\n`,
  );
  return path.join(dir, 'demo.tsx');
}

/**
 * Template discovery over this test's templates folder. The loader reads each
 * discovery once, so every test takes its own.
 */
function discoverer() {
  const templates = path.join(tmp, 'templates');
  return () =>
    discoverIntegrationTemplatesForOne({name: '@acme/demo', templates}).then(
      found => found.templates,
    );
}

describe('DOCSITE_ICON_SET values', () => {
  it('names the main set first, then backups', () => {
    expect(previewIconSetList(' glyphs , @acme/lines/lines ')).toEqual([
      'glyphs',
      '@acme/lines/lines',
    ]);
    expect(previewIconSetList(undefined)).toEqual([]);
    expect(previewIconSetList('')).toEqual([]);
  });
});

describe('rewriteTemplatePreview', () => {
  it('draws the preview with the chosen set, and a placeholder for an icon no set has', async () => {
    const projectDir = writeIconSetProject(tmp);
    const out = await rewriteTemplatePreview(SOURCE, writeTemplate(), {
      projectDir,
      list: ['glyphs'],
      discover: discoverer(),
    });
    expect(out).toContain("import {XIcon} from '@acme/glyphs';");
    expect(out).toContain('MissingIcon /* missing icon: cut */');
    expect(out).toContain('function MissingIcon(');
    expect(out).not.toContain('@heroicons/react');
  });

  it('reads icons from a doc under another accepted suffix, and names that doc as a dependency', async () => {
    const projectDir = writeIconSetProject(tmp);
    const docs: string[] = [];
    const out = await rewriteTemplatePreview(
      SOURCE,
      writeTemplate('.template.mjs'),
      {
        projectDir,
        list: ['glyphs'],
        discover: discoverer(),
        onDoc: file => docs.push(file),
      },
    );
    expect(out).toContain("import {XIcon} from '@acme/glyphs';");
    expect(docs).toEqual([path.join(tmp, 'templates', 'demo.template.mjs')]);
  });

  it('leaves a source no discovered template owns as it is', async () => {
    const projectDir = writeIconSetProject(tmp);
    writeTemplate();
    expect(
      await rewriteTemplatePreview(SOURCE, path.join(tmp, 'Other.tsx'), {
        projectDir,
        list: ['glyphs'],
        discover: discoverer(),
      }),
    ).toBe(SOURCE);
  });

  it('leaves the source as it is with no set named', async () => {
    const projectDir = writeIconSetProject(tmp);
    expect(
      await rewriteTemplatePreview(SOURCE, writeTemplate(), {
        projectDir,
        list: [],
        discover: discoverer(),
      }),
    ).toBe(SOURCE);
  });

  it('fails the build when the named set is not installed', async () => {
    const projectDir = writeIconSetProject(tmp);
    await expect(
      rewriteTemplatePreview(SOURCE, writeTemplate(), {
        projectDir,
        list: ['nope'],
        discover: discoverer(),
      }),
    ).rejects.toThrow(/DOCSITE_ICON_SET: .*"nope"/u);
  });
});

describe('next.config', () => {
  type Rule = {test?: RegExp; use?: unknown; resolve?: {modules?: string[]}};
  /** The webpack config the config's webpack hook leaves. */
  async function configWith(value: string | undefined) {
    vi.resetModules();
    vi.stubEnv('DOCSITE_ICON_SET', value ?? '');
    const {default: nextConfig} = await import('../../next.config.mjs');
    const config = {
      module: {rules: [] as Rule[]},
      resolve: {alias: {}, modules: ['node_modules']},
      plugins: [],
      cache: {type: 'filesystem', version: 'next'},
    };
    (
      nextConfig as unknown as {
        webpack: (config: unknown, options: unknown) => unknown;
      }
    ).webpack(config, {
      isServer: true,
      webpack: {BannerPlugin: class {}},
    });
    return config;
  }
  /** The module rules the config's webpack hook leaves. */
  async function rulesWith(value: string | undefined) {
    return (await configWith(value)).module.rules;
  }

  it('adds no loader when the setting is unset', async () => {
    expect(await rulesWith(undefined)).toEqual([]);
  });

  it('adds the loader for template sources when the setting names a set', async () => {
    const rules = await rulesWith('glyphs');
    expect(rules).toHaveLength(1);
    const test = rules[0].test as RegExp;
    expect(
      test.test('/repo/packages/cli/assets/templates/pages/ai-chat/page.tsx'),
    ).toBe(true);
    expect(test.test('/repo/apps/docsite/src/app/page.tsx')).toBe(false);
  });

  it("resolves a template's rewritten imports from the docsite too, where the sets are installed", async () => {
    const [rule] = await rulesWith('glyphs');
    // Template sources live outside the docsite: after the folders above the
    // template, a package resolves from the docsite's own node_modules.
    expect(rule.resolve?.modules).toEqual([
      'node_modules',
      path.resolve(__dirname, '../../node_modules'),
    ]);
  });

  it('keys the build cache on the setting, and leaves it alone when unset', async () => {
    expect((await configWith(undefined)).cache.version).toBe('next');
    expect((await configWith('glyphs')).cache.version).toBe(
      'next|DOCSITE_ICON_SET=glyphs',
    );
    expect((await configWith('lines,glyphs')).cache.version).toBe(
      'next|DOCSITE_ICON_SET=lines,glyphs',
    );
  });
});
