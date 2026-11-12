// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template preview images go through the image optimizer: the loader
 * rewrites each image the docsite serves, in every source a preview renders,
 * and leaves the references the optimizer cannot serve.
 *
 * @input Template sources, the docsite's `public/template-assets` folder, and
 *   the Next.js config
 * @output Regression coverage for the template image loader and its wiring
 * @position Build-time docsite tooling verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {imageConfigDefault} from 'next/dist/shared/lib/image-config';
import templateImageLoader, {
  TEMPLATE_IMAGE_QUALITY,
  TEMPLATE_IMAGE_WIDTH,
  optimizeTemplateImages,
} from '../../scripts/template-image-loader.mjs';

const DOCSITE = path.resolve(__dirname, '../..');
const PUBLIC = path.join(DOCSITE, 'public');
const TEMPLATES = path.resolve(DOCSITE, '../../packages/cli/assets/templates');

const isServed = (file: string) => fs.existsSync(path.join(PUBLIC, file));
const OPTIMIZED =
  '/_next/image?url=%2Ftemplate-assets%2Flight-product-1.png&w=1920&q=75';

describe('optimizeTemplateImages', () => {
  it('addresses a quoted image and a url() image by its optimizer URL', () => {
    const source = [
      "const a = '/template-assets/light-product-1.png';",
      '<img src="/template-assets/light-product-1.png" />',
      'const b = `/template-assets/light-product-1.png`;',
      "const c = 'url(/template-assets/light-product-1.png)';",
    ].join('\n');
    expect(optimizeTemplateImages(source, isServed)).toBe(
      [
        `const a = '${OPTIMIZED}';`,
        `<img src="${OPTIMIZED}" />`,
        `const b = \`${OPTIMIZED}\`;`,
        `const c = 'url(${OPTIMIZED})';`,
      ].join('\n'),
    );
  });

  it('leaves a file the docsite does not serve, so a fallback example still fails to load it', () => {
    const source =
      '<Avatar src="/template-assets/does-not-exist-primary.jpg" />';
    expect(optimizeTemplateImages(source, isServed)).toBe(source);
  });

  it('agrees with the copy on what a fixture reference is', () => {
    const source = [
      "const a = '/template-assets/light-product-1.png?v=2';",
      "const b = '/template-assets/light-product-1.PNG#top';",
    ].join('\n');
    expect(optimizeTemplateImages(source, () => true)).toBe(
      [
        `const a = '${OPTIMIZED}';`,
        "const b = '/_next/image?url=%2Ftemplate-assets%2Flight-product-1.PNG&w=1920&q=75';",
      ].join('\n'),
    );
  });

  it('asks for the width it is given', () => {
    expect(
      optimizeTemplateImages(
        "const a = '/template-assets/light-product-1.png';",
        () => true,
        640,
      ),
    ).toBe(
      "const a = '/_next/image?url=%2Ftemplate-assets%2Flight-product-1.png&w=640&q=75';",
    );
  });

  it('leaves vector images, video, other hosts, and text', () => {
    const source = [
      "const a = '/template-assets/placeholder.svg';",
      "const b = '/template-assets/Nature-1.mp4';",
      "const c = 'https://example.com/template-assets/hero.png';",
      '<Text>Photos live in /template-assets/light-product-1.png today.</Text>',
    ].join('\n');
    expect(optimizeTemplateImages(source, () => true)).toBe(source);
  });
});

describe('the template catalog', () => {
  const sources = fs
    .readdirSync(TEMPLATES, {recursive: true, encoding: 'utf8'})
    .filter(
      file => /^(?:pages|blocks)[\\/]/u.test(file) && file.endsWith('.tsx'),
    );

  it('has no served PNG or JPEG left out of the optimizer', () => {
    const left = sources.flatMap(file => {
      const optimized = optimizeTemplateImages(
        fs.readFileSync(path.join(TEMPLATES, file), 'utf8'),
        isServed,
      );
      return (optimized.match(/\/template-assets\/[^'"`)\s]+/gu) ?? [])
        .filter(found => /\.(?:png|jpe?g)$/u.test(found) && isServed(found))
        .map(found => `${file}: ${found}`);
    });
    expect(sources.length).toBeGreaterThan(100);
    expect(left).toEqual([]);
  });
});

describe('templateImageLoader', () => {
  function load(source: string) {
    const found: string[] = [];
    const missing: string[] = [];
    const output = templateImageLoader.call(
      {
        getOptions: () => ({publicDir: PUBLIC}),
        addDependency: file => found.push(file),
        addMissingDependency: file => missing.push(file),
      },
      source,
    );
    return {output, found, missing};
  }

  it('rewrites an <img> and a component prop alike', () => {
    const source = [
      '<img src="/template-assets/light-product-1.png" />',
      '<Avatar src="/template-assets/light-product-1.png" />',
    ].join('\n');
    expect(load(source).output).toBe(
      [`<img src="${OPTIMIZED}" />`, `<Avatar src="${OPTIMIZED}" />`].join(
        '\n',
      ),
    );
  });

  it('names each file it looked for, so a cached module follows the file', () => {
    const {found, missing} = load(
      [
        '<Avatar src="/template-assets/light-product-1.png" />',
        '<Avatar src="/template-assets/does-not-exist-primary.jpg" />',
      ].join('\n'),
    );
    expect(found).toEqual([
      path.join(PUBLIC, 'template-assets/light-product-1.png'),
    ]);
    expect(missing).toEqual([
      path.join(PUBLIC, 'template-assets/does-not-exist-primary.jpg'),
    ]);
  });
});

describe('next.config', () => {
  type Rule = {test?: RegExp; use?: Array<{loader: string}>};

  async function webpackConfig() {
    const {default: nextConfig} = await import('../../next.config.mjs');
    const config = {
      module: {rules: [] as Rule[]},
      resolve: {alias: {} as Record<string, string>, modules: []},
      plugins: [],
    };
    (
      nextConfig as unknown as {
        webpack: (config: unknown, options: unknown) => unknown;
      }
    ).webpack(config, {isServer: true, webpack: {BannerPlugin: class {}}});
    return {nextConfig, config};
  }

  it('runs the loader on every source a preview renders, and on no source the site shows as code', async () => {
    const {config} = await webpackConfig();
    const rule = config.module.rules.find(each =>
      each.use?.[0]?.loader.endsWith('template-image-loader.mjs'),
    );
    const test = rule?.test as RegExp;
    for (const rendered of [
      '/repo/packages/cli/assets/templates/pages/login-split/page.tsx',
      '/repo/apps/docsite/src/generated/showcases/AvatarShowcase.tsx',
      '/repo/apps/docsite/src/generated/examples/AvatarGroup.tsx',
    ]) {
      expect(test.test(rendered)).toBe(true);
    }
    for (const shown of [
      '/repo/apps/docsite/src/generated/exampleRegistry.ts',
      '/repo/apps/docsite/src/generated/templateRegistry.ts',
      '/repo/apps/docsite/src/components/TemplateThumbnail.tsx',
    ]) {
      expect(test.test(shown)).toBe(false);
    }
  });

  it('requests a width and a quality the optimizer allows', async () => {
    const {nextConfig} = await webpackConfig();
    const images = {...imageConfigDefault, ...nextConfig.images};
    expect(images.deviceSizes).toContain(TEMPLATE_IMAGE_WIDTH);
    expect(images.qualities).toContain(TEMPLATE_IMAGE_QUALITY);
  });
});
