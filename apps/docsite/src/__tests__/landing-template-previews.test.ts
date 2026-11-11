// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  fontStylesheetOf,
  previewDocument,
  previewPageSource,
} from '../../scripts/generate-landing-template-previews.mjs';
import templateRows from '../app/(site)/_landing/landingTemplateRows.json';

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
      '<meta name="robots" content="noindex"><link rel="stylesheet" href="https://fonts.example/css2?family=Figtree"></head>',
    );
  });

  it('adds no font stylesheet when the theme names none', () => {
    expect(previewDocument(RENDERED, {fontStylesheet: null})).toContain(
      '<meta name="robots" content="noindex"></head>',
    );
  });
});
