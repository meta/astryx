// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Central registry of sandbox categories and persistent navigation.
 * @input Authored sandbox metadata and the generated template registry.
 * @output Typed category, home, and audit navigation entries.
 * @position Central registry of all sandbox pages, grouped by category.
 *
 * The "Templates" category is auto-populated from packages/cli/assets/templates/
 * via `node scripts/sync-templates.js`. Each template has a template.doc.mjs
 * that provides metadata. The sync script generates a registry file at
 * src/generated/templateRegistry.ts.
 *
 * To add a new template:
 *   1. Create packages/cli/assets/templates/<name>/page.tsx + template.doc.mjs
 *   2. Run `node scripts/sync-templates.js`
 *   3. It appears in the sandbox and CLI automatically
 *
 * To add a non-template sandbox page:
 *   1. Create the page under the appropriate route group
 *   2. Add an entry to the appropriate category below
 *
 * Note: hrefs use trailing slashes because the Vite build writes a physical
 * index.html for each route; static hosts redirect /route to /route/.
 */

import {templates as autoDiscoveredTemplates} from '../generated/templateRegistry';

export interface SandboxPage {
  /** Display name shown on the card */
  name: string;
  /** Route path (with trailing slash) */
  href: string;
  /** Short description shown below the name */
  description: string;
}

export interface SandboxCategory {
  /** Category label shown in the sidebar and page header */
  label: string;
  /** URL-friendly slug used for routing */
  slug: string;
  /** Short description of the category */
  description: string;
  /** Pages in this category */
  pages: SandboxPage[];
}

/**
 * Persistent sidebar destinations that are not generated category pages.
 * `icon` is a key into SandboxNav's icon map so this module stays JSX-free.
 */
export interface SandboxNavPage {
  /** Label shown in the sidebar */
  label: string;
  /** Route path (with trailing slash) */
  href: string;
  /** Key into SandboxNav's icon map */
  icon: string;
  /**
   * Match child routes too. Home must not (`/` prefixes everything); a section
   * with sub-pages should.
   */
  matchesChildren?: boolean;
}

export const homePage: SandboxNavPage = {
  label: 'Home',
  href: '/',
  icon: 'home',
};

export const auditPages: SandboxNavPage[] = [
  {label: 'Template Audits', href: '/templates/', icon: 'templates'},
  {
    label: 'Component Audits',
    href: '/pages/component-scores/',
    icon: 'scores',
    matchesChildren: true,
  },
];

export const categories: SandboxCategory[] = [
  {
    label: 'Components & Patterns',
    slug: 'components-patterns',
    description:
      'Component demos, composition patterns, and interactive examples.',
    pages: [
      {
        name: 'Mobile Prototypes',
        href: '/pages/mobile-prototypes/',
        description:
          'Interactive mobile interaction prototypes (bottom sheets, action sheets, drawers) for the component migration table',
      },
      {
        name: 'TextArea Counter',
        href: '/pages/textarea-counter/',
        description:
          'Explore where the character counter sits on the TextArea — below, inline with the label, or overlaid inside the field',
      },
      {
        name: 'Card Examples',
        href: '/pages/example-cards/',
        description:
          'Astryx components showcased in realistic card compositions',
      },
      {
        name: 'Table Overview',
        href: '/pages/table-overview/',
        description: 'Data table patterns and configurations',
      },
      {
        name: 'Side Navigation',
        href: '/pages/navigation/',
        description: 'Side navigation layout patterns',
      },
      {
        name: 'Top Navigation',
        href: '/pages/topnav-menu/',
        description: 'Top navigation bar with menu integration',
      },
      {
        name: 'Mega Menu',
        href: '/pages/mega-menu/',
        description: 'Full-width dropdown navigation menu',
      },
      {
        name: 'Link Patterns',
        href: '/pages/polymorphic-link/',
        description: 'Flexible link component with router integration',
      },
      {
        name: 'Motion Examples',
        href: '/pages/motion-examples/',
        description:
          'Duration and easing tokens applied to common animation patterns',
      },
      {
        name: 'App Shell',
        href: '/pages/shell-lab/',
        description: 'Experiment with app shell layouts and navigation',
      },
      {
        name: 'Component Overview',
        href: '/pages/example/',
        description: 'General component composition examples',
      },
      {
        name: 'Tap Targets (AA)',
        href: '/pages/tap-targets/',
        description:
          'WCAG 2.5.8 AA touch-target sizes visualized on real components',
      },
    ],
  },
  {
    label: 'Templates',
    slug: 'templates',
    description:
      'Full-page application templates — dashboards, forms, and data views built with Astryx.',
    pages: [
      ...autoDiscoveredTemplates.map(t => ({
        name: t.name,
        href: t.href,
        description: t.description,
      })),
    ],
  },
  {
    label: 'Themes',
    slug: 'themes',
    description: 'Theme palette previews and design token references.',
    pages: [
      {
        name: 'Theme Family Artifacts',
        href: '/pages/theme-family/',
        description:
          'One generated CSS/ESM family with attribute switching, nested descendants, sibling isolation, and cascade-order evidence',
      },
      {
        name: 'Neutral Palette',
        href: '/pages/neutral-palette/',
        description:
          'Neutral theme — pure grayscale spine, OKLCH categorical palette, vivid T60 semantic badges, soft T90 categorical pastels, Figtree typography',
      },
      {
        name: 'Stone Palette',
        href: '/pages/stone-palette/',
        description:
          'Stone theme tonal palettes, badges, banners, inputs, and buttons in light and dark mode',
      },
      {
        name: 'Y2K Palette',
        href: '/pages/y2k-palette/',
        description:
          'Y2K pop theme — sharp corners, cream body, neon lime accent, Crimson Text display type',
      },
      {
        name: 'Gothic Palette',
        href: '/pages/gothic-palette/',
        description:
          'Gothic dark-only theme — atmospheric blue-gray, distressed display heading, pastel categorical accents',
      },
      {
        name: 'Butter Palette',
        href: '/pages/butter-palette/',
        description:
          'Butter theme — golden buttery palette with blue accents, Sarina display, Outfit body & headings',
      },
      {
        name: 'Color Studio',
        href: '/pages/color-studio/',
        description:
          'Generate and explore color palettes from an accent color or image',
      },
      {
        name: 'Palette Generator Lab',
        href: '/pages/palette-generator/',
        description:
          'Compare experimental OKLCH and HCT-like ramps with profiles, anchors, custom stops, and separate dark-mode generation',
      },
      {
        name: 'Mobile Spacing',
        href: '/pages/mobile-spacing/',
        description:
          'Draft mobile semantic spacing preview with real component scale comparisons',
      },
    ],
  },
  {
    label: 'Tools',
    slug: 'tools',
    description:
      'Interactive tools for building and exploring Astryx components.',
    pages: [
      {
        name: 'Layout DSL',
        href: '/pages/layout-dsl/',
        description:
          'Write compressed XLE/XLO layout expressions and expand them to TSX with live token metrics',
      },
      {
        name: 'CodeBlock Perf',
        href: '/pages/codeblock-perf/',
        description: 'Compare highlight modes and scroll performance',
      },
      {
        name: 'Markdown Perf',
        href: '/pages/markdown-perf/',
        description:
          'Compare complete Markdown rendering with bursty streaming performance and animation',
      },
      {
        name: 'DiffViewer Perf',
        href: '/pages/diffviewer-perf/',
        description:
          'Render and scroll many files and lines; compare unified and split',
      },
      {
        name: 'Perf Scenes',
        href: '/pages/perf-scenes/',
        description:
          'The fixed scenes the nightly performance run measures, to mount and profile by hand',
      },
      {
        name: 'Table Lab',
        href: '/pages/table-lab/',
        description:
          'Test any combination of Table plugins with live scroll FPS, dropped-frame, and re-render metrics',
      },
      {
        name: 'Motion Lab',
        href: '/pages/motion-lab/',
        description:
          'Every motion proposal as a working before-and-after, with the durations, curves and springs tunable live',
      },
      {
        name: 'Foundations',
        href: '/pages/doc-preview/',
        description:
          'Token reference docs with live theme previews — color, spacing, typography, and more',
      },
      {
        name: 'Media Mode',
        href: '/pages/media-mode/',
        description:
          'Compare luminance algorithms (BT.709 / WCAG 2 / APCA) for dark/light surface detection',
      },
      {
        name: 'Dictation Lab',
        href: '/pages/dictation-lab/',
        description:
          'Test voice dictation, tune sound effects, and explore animation',
      },
      {
        name: 'Mobile Type',
        href: '/pages/mobile-type/',
        description: 'How the type scale adapts on touch devices',
      },
    ],
  },
];
