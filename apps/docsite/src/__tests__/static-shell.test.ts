// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards the docsite's query-driven PPR boundaries and global footer.
 * @input Reads the relevant docsite source files
 * @output Invariants for narrow Suspense boundaries, shaped visible fallbacks,
 *   invisible URL synchronizers, and CSS-driven footer responsiveness
 * @position Cross-cutting meta-test; no runtime behavior of its own
 *
 * The docsite runs with `cacheComponents: true` (Partial Prerendering).
 * Request state such as `searchParams` is valid, but everything up to its
 * nearest Suspense boundary becomes a PPR hole. The component detail page,
 * templates gallery, and theme explorer deliberately keep their deep-link
 * behavior; these tests keep visible content outside the query-dependent hole
 * or reserve a shaped fallback. An invisible URL synchronizer may render no
 * fallback because it owns no layout. The global footer must be CSS-responsive
 * because a JavaScript media query cannot know the viewport during prerendering.
 */

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const SRC_DIR = join(__dirname, '..');

function source(path: string): string {
  return readFileSync(join(SRC_DIR, path), 'utf8');
}

describe('docsite static shell', () => {
  it('keeps the component heading outside the query-dependent boundary', () => {
    const detail = source(
      'components/component-detail/ComponentDetailClient.tsx',
    );

    expect(detail).toContain('const searchParams = useSearchParams()');
    expect(detail).toContain(
      'fallback={<ComponentDetailFallback hasShowcase={hasShowcase} />}',
    );
    expect(detail).not.toMatch(/<Suspense[^>]*fallback=\{null\}[\s\S]*?>/);
    expect(detail.indexOf('<Text type="display-1">')).toBeLessThan(
      detail.indexOf('<Suspense'),
    );
  });

  it('keeps the templates gallery outside its URL sync boundary', () => {
    const templates = source('app/(site)/templates/page.tsx');
    const galleryStart = templates.indexOf('function TemplatesGallery()');
    const heading = templates.indexOf('<Heading level={1}', galleryStart);
    const grid = templates.indexOf('<Grid', heading);
    const boundary = templates.indexOf(
      '<Suspense fallback={null}>',
      galleryStart,
    );
    const boundaryEnd = templates.indexOf('</Suspense>', boundary);
    const boundarySource = templates.slice(boundary, boundaryEnd);

    expect(templates).toContain('function TemplatePreviewURLSync');
    expect(templates).toContain('const searchParams = useSearchParams()');
    expect(templates).toContain('return <TemplatesGallery />;');
    expect(heading).toBeGreaterThan(galleryStart);
    expect(grid).toBeGreaterThan(heading);
    expect(boundary).toBeGreaterThan(grid);
    expect(boundarySource).toContain('<TemplatePreviewURLSync');
    expect(boundarySource).not.toContain('<TemplatesGallery');
  });

  it('reuses the same theme heading in fallback and resolved layouts', () => {
    const themes = source('app/(site)/themes/page.tsx');
    const themePage = source('components/ThemePackagePage.tsx');
    const heading = source('components/ThemeHeading.tsx');
    const layout = source('components/ThemeExplorerLayout.tsx');

    expect(themes).toContain('const params = await searchParams');
    expect(themes).toContain('fallback={<ThemeExplorerFallback />}');
    expect(themes).not.toMatch(/<Suspense[^>]*fallback=\{null\}[\s\S]*?>/);
    expect(themePage).toContain("import {ThemeHeading} from './ThemeHeading'");
    expect(themes).toContain(
      "import {ThemeHeading} from '../../../components/ThemeHeading'",
    );
    for (const component of [
      'ThemeExplorerLayout',
      'ThemeExplorerSidebar',
      'ThemeExplorerSidebarSurface',
      'ThemeExplorerSidebarContent',
      'ThemeExplorerActions',
      'ThemeExplorerRightColumn',
      'ThemeExplorerMobileContext',
      'ThemeExplorerMobileCarousel',
      'ThemeExplorerMobileCarouselItem',
      'ThemeExplorerPreview',
    ]) {
      expect(themePage).toContain(`<${component}`);
      expect(themes).toContain(`<${component}`);
    }
    expect(themePage.match(/<ThemeHeading/g)).toHaveLength(2);
    expect(themes.match(/<ThemeHeading/g)).toHaveLength(2);
    expect(themePage).toContain('<ThemeExplorerLayout>');
    expect(themes).toContain(
      '<ThemeExplorerLayout statusLabel="Loading theme explorer">',
    );
    expect(layout).toContain('inert={statusLabel ? true : undefined}');
    expect(layout).toContain('<VisuallyHidden as="div" role="status">');
    expect(themePage).not.toContain('useMediaQuery');
    expect(themePage).toContain('isMobile\n            mode={mode}');
    expect(heading).toContain('<Skeleton width={36} height={36}');
    expect(heading).toContain('tabIndex={isLoading ? -1 : undefined}');
    expect(heading).toContain('Astryx comes with a default theme built in');
    expect(heading).toContain('Learn how theming works');
  });

  it('the site footer does not branch on a media query', () => {
    // SiteFooter renders on every route, docs and marketing alike, so it is
    // part of the static shell at every width. Its responsive layout has to be
    // CSS (see the MOBILE media query in SiteFooter.tsx), because a JS branch
    // can only ever prerender one of the two arms.
    const footer = source('components/SiteFooter.tsx');
    expect(footer).not.toMatch(
      /import[^;]*(?:useAppShellMobile|useMediaQuery)[^;]*from/,
    );
  });
});
