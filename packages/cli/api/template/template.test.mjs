// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, it, expect} from 'vitest';
import {
  stripTemplateAssetRefs,
  template,
  extractComponents,
} from './template.mjs';

describe('stripTemplateAssetRefs', () => {
  it('replaces a /template-assets image path with an inline data URI', () => {
    const src =
      "const hero = '/template-assets/colorful-home-horizontal-1.png';";
    const out = stripTemplateAssetRefs(src);
    expect(out).not.toContain('/template-assets/');
    expect(out).toContain('data:image/svg+xml,');
  });

  it('replaces a /template-assets block-avatar image path', () => {
    const src = 'src="/template-assets/avatar-profile-05.jpg"';
    const out = stripTemplateAssetRefs(src);
    expect(out).not.toContain('/template-assets/');
    expect(out).toContain('data:image/svg+xml,');
  });

  it('replaces every /template-assets reference, not just the first', () => {
    const src = [
      "'/template-assets/colorful-home-horizontal-1.png'",
      "'/template-assets/illustrative-horizontal-3.png'",
      "'/template-assets/moody-scene-horizontal-1.png'",
    ].join('\n');
    const out = stripTemplateAssetRefs(src);
    expect(out).not.toContain('/template-assets/');
    expect(out.match(/data:image\/svg\+xml,/g)).toHaveLength(3);
  });

  it('preserves surrounding source structure', () => {
    const src = "const data = [{src: '/template-assets/x.png', alt: 'X'}];";
    const out = stripTemplateAssetRefs(src);
    expect(out).toContain("alt: 'X'");
    expect(out).toContain('const data = [{src:');
  });

  it('leaves non-Meta third-party image URLs untouched', () => {
    const src = [
      'src="https://www.paypalobjects.com/webstatic/mktg/Logo/pp-logo-100px.png"',
      'src="https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat/visa.svg"',
    ].join('\n');
    const out = stripTemplateAssetRefs(src);
    expect(out).toBe(src);
  });

  it('leaves unrelated local paths untouched', () => {
    const src = "import x from './local.png'; const y = '/public/logo.svg';";
    const out = stripTemplateAssetRefs(src);
    expect(out).toBe(src);
  });

  it('strips a /template-assets .mp4 source to an empty string, not the image data URI (#4780)', () => {
    const src = "src: '/template-assets/Nature-1.mp4',";
    const out = stripTemplateAssetRefs(src);
    expect(out).toBe("src: '',");
    expect(out).not.toContain('data:image/svg+xml,');
    expect(out).not.toContain('/template-assets/');
  });

  it('strips other video extensions (.webm, .mov, .ogv) the same way', () => {
    for (const ext of ['webm', 'mov', 'ogv']) {
      const src = `src: '/template-assets/clip.${ext}',`;
      const out = stripTemplateAssetRefs(src);
      expect(out).toBe("src: '',");
    }
  });

  it('still replaces an adjacent image reference with the placeholder when a video reference is also present', () => {
    const src = [
      "poster: '/template-assets/Nature-1-poster.jpg',",
      "src: '/template-assets/Nature-1.mp4',",
    ].join('\n');
    const out = stripTemplateAssetRefs(src);
    expect(out).toContain('data:image/svg+xml,');
    expect(out).toContain("src: '',");
  });
});

describe('template --skeleton component extraction (prefix-agnostic)', () => {
  // Regression guard: templates author bare component names post un-prefix
  // migration (P2380608025). The extractors previously matched only the
  // `XDS`-prefixed form, so `--skeleton` returned an empty components list and
  // an empty skeleton body for bare templates.
  it('extracts components and a skeleton from a bare-named template', async () => {
    const result = await template('contact-form', {skeleton: true});

    expect(result.type).toBe('template.skeleton');
    expect(Array.isArray(result.data.components)).toBe(true);
    expect(result.data.components.length).toBeGreaterThan(0);
    // The contact-form template composes a Card + form inputs.
    expect(result.data.components).toContain('Card');
    expect(result.data.components).toContain('TextInput');

    // Skeleton body is non-empty and uses bare component tags (no XDS prefix).
    expect(result.data.skeleton.trim().length).toBeGreaterThan(0);
    expect(result.data.skeleton).toMatch(/<[A-Z]\w+/);
    expect(result.data.skeleton).not.toContain('<XDS');

    expect(result.data.skeleton).toContain('columns={{minWidth: 200}}');
  });

  it('filters out local helper components declared in the same file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-test-'));
    const pagePath = path.join(tmpDir, 'page.tsx');
    fs.writeFileSync(
      pagePath,
      `
import {Card} from '@astryxdesign/core/Layout';

function TimelineSection() {
  return <div />;
}

export default function Page() {
  return (
    <Card>
      <TimelineSection />
    </Card>
  );
}
      `,
    );

    try {
      const components = extractComponents(pagePath);
      expect(components).toContain('Card');
      expect(components).not.toContain('Timeline');
    } finally {
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });

  it('filters out a type-annotated local helper', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-test-'));
    const pagePath = path.join(tmpDir, 'page.tsx');
    fs.writeFileSync(
      pagePath,
      `
import type {FC} from 'react';
import {Card} from '@astryxdesign/core/Layout';

const TimelineSection: FC = () => <div />;

export default function Page() {
  return (
    <Card>
      <TimelineSection />
    </Card>
  );
}
`,
    );
    try {
      const components = extractComponents(pagePath);
      expect(components).toContain('Card');
      expect(components).not.toContain('Timeline');
    } finally {
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });

  it('keeps an imported component when declaration-like text appears in a comment or string', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-test-'));
    const pagePath = path.join(tmpDir, 'page.tsx');
    fs.writeFileSync(
      pagePath,
      `
import {Card} from '@astryxdesign/core/Layout';

// const Card = () => null;
const note = 'function Card() {}';

export default function Page() {
  return <Card>{note}</Card>;
}
`,
    );
    try {
      expect(extractComponents(pagePath)).toContain('Card');
    } finally {
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });

  it('keeps a bare imported component whose name is itself a stripped suffix', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-test-'));
    const pagePath = path.join(tmpDir, 'page.tsx');
    fs.writeFileSync(
      pagePath,
      `
import {Section} from '@astryxdesign/core/Section';

function SectionHeading() {
  return <div />;
}

export default function Page() {
  return (
    <Section>
      <SectionHeading />
    </Section>
  );
}
`,
    );
    try {
      expect(extractComponents(pagePath)).toContain('Section');
    } finally {
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });
});
