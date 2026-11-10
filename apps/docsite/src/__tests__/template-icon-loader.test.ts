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
  templateDocPath,
} from '../../scripts/template-icon-loader.mjs';
import {writeIconSetProject} from '../../../../packages/cli/test-utils/icon-set-fixture.mjs';

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

/** A page template with its doc, in a templates/pages folder. */
function writeTemplate(): string {
  const dir = path.join(tmp, 'templates', 'pages', 'demo');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'page.tsx'), SOURCE);
  fs.writeFileSync(
    path.join(dir, 'template.doc.mjs'),
    "export const doc = {icons: {XMarkIcon: 'close', ScissorsIcon: 'cut'}};\n",
  );
  return path.join(dir, 'page.tsx');
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

  it('finds a page template doc and a block doc', () => {
    const page = writeTemplate();
    expect(templateDocPath(page)).toBe(
      path.join(path.dirname(page), 'template.doc.mjs'),
    );
    const block = path.join(tmp, 'Block.tsx');
    fs.writeFileSync(block, SOURCE);
    expect(templateDocPath(block)).toBeNull();
    fs.writeFileSync(
      path.join(tmp, 'Block.doc.mjs'),
      'export const doc = {};\n',
    );
    expect(templateDocPath(block)).toBe(path.join(tmp, 'Block.doc.mjs'));
  });
});

describe('rewriteTemplatePreview', () => {
  it('draws the preview with the chosen set, and a placeholder for an icon no set has', async () => {
    const projectDir = writeIconSetProject(tmp);
    const out = await rewriteTemplatePreview(SOURCE, writeTemplate(), {
      projectDir,
      list: ['glyphs'],
    });
    expect(out).toContain("import {XIcon} from '@acme/glyphs';");
    expect(out).toContain('MissingIcon /* missing icon: cut */');
    expect(out).toContain('function MissingIcon(');
    expect(out).not.toContain('@heroicons/react');
  });

  it('leaves the source as it is with no set named', async () => {
    const projectDir = writeIconSetProject(tmp);
    expect(
      await rewriteTemplatePreview(SOURCE, writeTemplate(), {
        projectDir,
        list: [],
      }),
    ).toBe(SOURCE);
  });

  it('fails the build when the named set is not installed', async () => {
    const projectDir = writeIconSetProject(tmp);
    await expect(
      rewriteTemplatePreview(SOURCE, writeTemplate(), {
        projectDir,
        list: ['nope'],
      }),
    ).rejects.toThrow(/DOCSITE_ICON_SET: .*"nope"/u);
  });
});

describe('next.config', () => {
  /** The module rules the config's webpack hook leaves. */
  async function rulesWith(value: string | undefined) {
    vi.resetModules();
    vi.stubEnv('DOCSITE_ICON_SET', value ?? '');
    const {default: nextConfig} = await import('../../next.config.mjs');
    const config = {
      module: {rules: [] as Array<{test?: RegExp; use?: unknown}>},
      resolve: {alias: {}},
      plugins: [],
    };
    (
      nextConfig as unknown as {
        webpack: (config: unknown, options: unknown) => unknown;
      }
    ).webpack(config, {
      isServer: true,
      webpack: {BannerPlugin: class {}},
    });
    return config.module.rules;
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
});
