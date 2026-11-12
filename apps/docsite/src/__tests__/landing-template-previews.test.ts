// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  fontStylesheetOf,
  previewDocument,
  previewPageSource,
  stagePreviewPage,
} from '../../scripts/generate-landing-template-previews.mjs';
import templateRows from '../app/(site)/_landing/landingTemplateRows.json';
import {previewColorModeFragment} from '../app/(site)/_landing/templatePreviewColorMode';

const docsiteDir = path.resolve(__dirname, '../..');
const templatesDir = path.resolve(
  docsiteDir,
  '../../packages/cli/assets/templates/pages',
);

const RENDERED = [
  '<!doctype html><html><head><title>Page</title><style>.a{background:url(/template-assets/hero.png)}</style></head>',
  '<body><img src="/template-assets/light-product-1.png" alt=""/>',
  '<img src="/template-assets/logo.svg" alt=""/>',
  '<img src="https://example.com/template-assets/remote.png" alt=""/>',
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
});

describe('fontStylesheetOf', () => {
  it('reads the stylesheet URL from the theme fonts file', () => {
    expect(
      fontStylesheetOf(
        "/* Fonts */\n@import url('https://fonts.example/css2?family=Figtree');\n",
      ),
    ).toBe('https://fonts.example/css2?family=Figtree');
    expect(fontStylesheetOf('body { margin: 0 }')).toBeNull();
  });
});

describe('previewDocument', () => {
  const html = previewDocument(RENDERED, {
    fontStylesheet: 'https://fonts.example/css2?family=Figtree',
  });

  it('drops the embedded source, so the file carries no script', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toContain('x-astryx-source');
  });

  it('loads template photos through the image optimizer at preview size', () => {
    expect(html).toContain(
      '<img src="/_next/image?url=%2Ftemplate-assets%2Flight-product-1.png&w=640&q=75" alt=""/>',
    );
    expect(html).toContain(
      'url(/_next/image?url=%2Ftemplate-assets%2Fhero.png&w=640&q=75)',
    );
  });

  it('keeps vector images and images on other hosts', () => {
    expect(html).toContain('<img src="/template-assets/logo.svg" alt=""/>');
    expect(html).toContain(
      '<img src="https://example.com/template-assets/remote.png" alt=""/>',
    );
  });

  it('loads the theme fonts and stays out of search results', () => {
    expect(html).toContain(
      '<meta name="robots" content="noindex"><link rel="stylesheet" href="https://fonts.example/css2?family=Figtree"><style>',
    );
  });

  it('adds no font stylesheet when the theme names none', () => {
    expect(previewDocument(RENDERED, {fontStylesheet: null})).toContain(
      '<meta name="robots" content="noindex"><style>',
    );
  });

  it('fills the frame and never scrolls', () => {
    expect(html).toContain('html,body{height:100%;overflow:hidden}');
    expect(html).toContain(
      'body>[data-astryx-theme]>:first-child{height:100%!important;min-height:100%!important}',
    );
  });

  it('takes its color mode from the URL fragment', () => {
    expect(html).toContain(
      '<body><a id="light" hidden></a><a id="dark" hidden></a><img',
    );
    expect(html).toContain(
      ':root:has(#dark:target),:root:has(#dark:target) [data-astryx-theme]{color-scheme:dark!important}',
    );
    expect(html).toContain(
      ':root:has(#light:target),:root:has(#light:target) [data-astryx-theme]{color-scheme:light!important}',
    );
  });
});

describe('previewColorModeFragment', () => {
  it('adds nothing while the site follows the OS', () => {
    expect(previewColorModeFragment('light', false)).toBe('');
    expect(previewColorModeFragment('dark', true)).toBe('');
  });

  it('adds nothing on the server and through hydration, whatever the OS scheme reads as', () => {
    expect(previewColorModeFragment('system', false)).toBe('');
    expect(previewColorModeFragment('system', true)).toBe('');
  });

  it('names the mode that a visitor set against the OS', () => {
    expect(previewColorModeFragment('dark', false)).toBe('#dark');
    expect(previewColorModeFragment('light', true)).toBe('#light');
  });
});

describe('stagePreviewPage', () => {
  let work: string;
  let pageDir: string;
  let templates: string;

  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-previews-'));
    pageDir = path.join(work, 'out', 'ide');
    templates = path.join(work, 'templates');
    fs.mkdirSync(pageDir, {recursive: true});
    fs.mkdirSync(path.join(templates, 'ide'), {recursive: true});
    fs.writeFileSync(path.join(templates, 'ide', 'page.tsx'), 'PAGE');
    fs.writeFileSync(path.join(templates, 'ide', 'data.ts'), 'DATA');
  });

  afterEach(() => {
    fs.rmSync(work, {recursive: true, force: true});
  });

  it('renders the template where it is when no icon set is named', async () => {
    const rewrite = vi.fn();
    await stagePreviewPage({
      slug: 'ide',
      pageDir,
      templatesDir: templates,
      iconSets: [],
      projectDir: work,
      rewrite,
    });

    expect(rewrite).not.toHaveBeenCalled();
    expect(fs.readdirSync(pageDir)).toEqual(['page.tsx']);
    expect(fs.readFileSync(path.join(pageDir, 'page.tsx'), 'utf8')).toContain(
      'import Page from "../../templates/ide/page";',
    );
  });

  it('renders a copy with the icons of the named sets', async () => {
    const rewrite = vi.fn(async (source: string) => `${source} WITH SET ICONS`);
    await stagePreviewPage({
      slug: 'ide',
      pageDir,
      templatesDir: templates,
      iconSets: ['pkg/glyphs', 'pkg/backup'],
      projectDir: work,
      rewrite,
    });

    // The rewrite finds the template's doc by the path of the original.
    expect(rewrite).toHaveBeenCalledWith(
      'PAGE',
      path.join(templates, 'ide', 'page.tsx'),
      {projectDir: work, list: ['pkg/glyphs', 'pkg/backup']},
    );
    expect(
      fs.readFileSync(path.join(pageDir, 'template', 'page.tsx'), 'utf8'),
    ).toBe('PAGE WITH SET ICONS');
    expect(
      fs.readFileSync(path.join(pageDir, 'template', 'data.ts'), 'utf8'),
    ).toBe('DATA');
    expect(fs.readFileSync(path.join(pageDir, 'page.tsx'), 'utf8')).toContain(
      'import Page from "./template/page";',
    );
    expect(
      fs.readFileSync(path.join(templates, 'ide', 'page.tsx'), 'utf8'),
    ).toBe('PAGE');
  });
});
