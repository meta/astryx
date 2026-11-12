// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  PREVIEW_IMAGE_WIDTH,
  previewMarkup,
  previewPageSource,
  stagePreviewPage,
  stageThemesStorePage,
  themesStorePageSource,
} from '../../scripts/generate-landing-template-previews.mjs';
import templateRows from '../app/(site)/_landing/landingTemplateRows.json';

const docsiteDir = path.resolve(__dirname, '../..');
const templatesDir = path.resolve(
  docsiteDir,
  '../../packages/cli/assets/templates/pages',
);

const RENDERED = [
  '<!doctype html><html><head><title>Page</title><style>.a{color:red}</style></head>',
  '<body><div data-astryx-theme="neutral"><img src="/_next/image?url=%2Ftemplate-assets%2Flight-product-1.png&amp;w=640&amp;q=75" alt=""/></div>',
  '<script type="application/x-astryx-source">{"files":[{"path":"page.tsx","text":"/template-assets/light-product-1.png"}]}</script>',
  '</body></html>',
].join('');

describe('landing template rows', () => {
  it.each(templateRows.flat())('names the page template %s', slug => {
    expect(fs.existsSync(path.join(templatesDir, slug, 'page.tsx'))).toBe(true);
  });
});

describe('previewPageSource', () => {
  it('renders the template inside the neutral theme, with its stylesheet', () => {
    const source = previewPageSource('../../templates/pages/ide/page');
    expect(source).toContain("import '@astryxdesign/theme-neutral/theme.css';");
    expect(source).toContain(
      'import Page from "../../templates/pages/ide/page";',
    );
    expect(source).toContain('<Theme theme={neutralTheme} mode="system">');
  });

  it('keeps the preview-viewport wrapper of the live template previews', () => {
    expect(previewPageSource('./template/page')).toContain(
      '<div className="preview-viewport">\n        <Page />\n      </div>',
    );
  });
});

describe('themesStorePageSource', () => {
  it('renders the staged store template inside the Butter theme', () => {
    const source = themesStorePageSource('../../src/ThemesStorePreview');
    expect(source).toContain(
      'import ThemesStorePreview from "../../src/ThemesStorePreview";',
    );
    expect(source).toContain(
      'import {ThemeShowcaseStore} from "./template/page";',
    );
    expect(source).toContain('<Theme theme={butterTheme} mode="system">');
    expect(source).toContain(
      '<ThemesStorePreview Store={ThemeShowcaseStore} />',
    );
  });
});

describe('previewMarkup', () => {
  const markup = previewMarkup(RENDERED);

  it('keeps only the body, without the page styles or the embedded source', () => {
    expect(markup.startsWith('<div data-astryx-theme="neutral">')).toBe(true);
    expect(markup).not.toContain('<style');
    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('x-astryx-source');
  });

  it('keeps the image URLs of the rendered page and loads them at low priority', () => {
    expect(markup).toContain(
      '<img fetchpriority="low" decoding="async" src="/_next/image?url=%2Ftemplate-assets%2Flight-product-1.png&amp;w=640&amp;q=75" alt=""/>',
    );
  });
});

describe('stageThemesStorePage', () => {
  const STORE = "const icon = 'store-icon';";
  let work: string;
  let pageDir: string;
  let templates: string;

  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-store-'));
    pageDir = path.join(work, 'out', 'themes-store');
    templates = path.join(work, 'templates');
    fs.mkdirSync(pageDir, {recursive: true});
    fs.mkdirSync(path.join(templates, 'theme-showcase'), {recursive: true});
    fs.writeFileSync(path.join(templates, 'theme-showcase', 'page.tsx'), STORE);
  });

  afterEach(() => {
    fs.rmSync(work, {recursive: true, force: true});
  });

  it('draws the store with the icons of the named sets, like every template preview', async () => {
    const rewrite = vi.fn(async (source: string) => `${source} WITH SET ICONS`);
    await stageThemesStorePage({
      pageDir,
      templatesDir: templates,
      iconSets: ['pkg/glyphs'],
      projectDir: work,
      storeModule: '../../src/ThemesStorePreview',
      isServed: () => true,
      rewrite,
    });

    expect(rewrite).toHaveBeenCalledWith(
      STORE,
      path.join(templates, 'theme-showcase', 'page.tsx'),
      {projectDir: work, list: ['pkg/glyphs']},
    );
    expect(
      fs.readFileSync(path.join(pageDir, 'template', 'page.tsx'), 'utf8'),
    ).toBe(`${STORE} WITH SET ICONS`);
    expect(fs.readFileSync(path.join(pageDir, 'page.tsx'), 'utf8')).toContain(
      'import {ThemeShowcaseStore} from "./template/page";',
    );
  });

  it('keeps the store template icons when no set is named', async () => {
    const rewrite = vi.fn();
    await stageThemesStorePage({
      pageDir,
      templatesDir: templates,
      iconSets: [],
      projectDir: work,
      storeModule: '../../src/ThemesStorePreview',
      isServed: () => true,
      rewrite,
    });

    expect(rewrite).not.toHaveBeenCalled();
    expect(
      fs.readFileSync(path.join(pageDir, 'template', 'page.tsx'), 'utf8'),
    ).toBe(STORE);
  });
});

describe('stagePreviewPage', () => {
  const PAGE = [
    "const photo = '/template-assets/hero.png';",
    "const missing = '/template-assets/does-not-exist.png';",
    "const logo = '/template-assets/logo.svg';",
  ].join('\n');
  const PAGE_FOR_PREVIEW = [
    "const photo = '/_next/image?url=%2Ftemplate-assets%2Fhero.png&w=640&q=75';",
    "const missing = '/template-assets/does-not-exist.png';",
    "const logo = '/template-assets/logo.svg';",
  ].join('\n');
  const isServed = (file: string) =>
    file !== '/template-assets/does-not-exist.png';

  let work: string;
  let pageDir: string;
  let templates: string;

  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-previews-'));
    pageDir = path.join(work, 'out', 'ide');
    templates = path.join(work, 'templates');
    fs.mkdirSync(pageDir, {recursive: true});
    fs.mkdirSync(path.join(templates, 'ide'), {recursive: true});
    fs.writeFileSync(path.join(templates, 'ide', 'page.tsx'), PAGE);
    fs.writeFileSync(path.join(templates, 'ide', 'data.ts'), 'DATA');
  });

  afterEach(() => {
    fs.rmSync(work, {recursive: true, force: true});
  });

  it('renders a copy whose photos load through the image optimizer at preview size', async () => {
    const rewrite = vi.fn();
    await stagePreviewPage({
      slug: 'ide',
      pageDir,
      templatesDir: templates,
      iconSets: [],
      projectDir: work,
      isServed,
      rewrite,
    });

    expect(rewrite).not.toHaveBeenCalled();
    expect(
      fs.readFileSync(path.join(pageDir, 'template', 'page.tsx'), 'utf8'),
    ).toBe(PAGE_FOR_PREVIEW);
    expect(
      fs.readFileSync(path.join(pageDir, 'template', 'data.ts'), 'utf8'),
    ).toBe('DATA');
    expect(fs.readFileSync(path.join(pageDir, 'page.tsx'), 'utf8')).toContain(
      'import Page from "./template/page";',
    );
    expect(
      fs.readFileSync(path.join(templates, 'ide', 'page.tsx'), 'utf8'),
    ).toBe(PAGE);
  });

  it('asks the optimizer for a width that it allows', async () => {
    const {default: nextConfig} = await import('../../next.config.mjs');
    const {imageConfigDefault} =
      await import('next/dist/shared/lib/image-config');
    const images = {...imageConfigDefault, ...nextConfig.images};
    expect([...images.deviceSizes, ...images.imageSizes]).toContain(
      PREVIEW_IMAGE_WIDTH,
    );
  });

  it('draws the copy with the icons of the named sets, after the image rewrite', async () => {
    const rewrite = vi.fn(async (source: string) => `${source} WITH SET ICONS`);
    await stagePreviewPage({
      slug: 'ide',
      pageDir,
      templatesDir: templates,
      iconSets: ['pkg/glyphs', 'pkg/backup'],
      projectDir: work,
      isServed,
      rewrite,
    });

    // The rewrite finds the template's doc by the path of the original.
    expect(rewrite).toHaveBeenCalledWith(
      PAGE_FOR_PREVIEW,
      path.join(templates, 'ide', 'page.tsx'),
      {projectDir: work, list: ['pkg/glyphs', 'pkg/backup']},
    );
    expect(
      fs.readFileSync(path.join(pageDir, 'template', 'page.tsx'), 'utf8'),
    ).toBe(`${PAGE_FOR_PREVIEW} WITH SET ICONS`);
  });
});
