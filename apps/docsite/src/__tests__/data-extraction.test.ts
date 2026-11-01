// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Data extraction tests for the docsite.
 *
 * Validates that the generated registries contain expected data.
 * @input Authored component docs and the generated docsite registries
 * @output Regression coverage for catalog projections, including Drawer demos
 * @position Build-time docsite data verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {docs as chatDocs} from '../../../../packages/core/src/Chat/Chat.doc.mjs';
import {docs as drawerDocs} from '../../../../packages/core/src/Drawer/Drawer.doc.mjs';
import {docs as drawerHeaderDocs} from '../../../../packages/core/src/Drawer/DrawerHeader.doc.mjs';
import docsiteConfig from '../../astryx.config.mjs';
import {packages} from '../generated/packageRegistry';
import {
  components,
  componentCount,
  type ComponentEntry,
} from '../generated/componentRegistry';
import {blocks, blockCount, showcaseCount} from '../generated/blockRegistry';
import {templates, templateCount} from '../generated/templateRegistry';
import {
  templateMetadata,
  templateMetadataCount,
} from '../generated/templateMetadataRegistry';
import {docTopics, docsCount} from '../generated/docsRegistry';
import {showcaseRegistry} from '../generated/showcaseRegistry';
import {externalComponentPreviews} from '../generated/componentPreviewRegistry';
import {eagerShowcases} from '../components/eagerShowcases';
import {TEMPLATE_COMPONENTS} from '../components/templateComponents';
import {exampleRegistry} from '../generated/exampleRegistry';
import {normalizeComponentCategory} from '../lib/componentCategories';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const CORE_SRC_DIR = path.join(REPO_ROOT, 'packages/core/src');
const COMPONENT_REGISTRY_PATH = new URL(
  '../generated/componentRegistry.ts',
  import.meta.url,
);
const COMPONENT_REGISTRY_SOURCE = fs.readFileSync(
  COMPONENT_REGISTRY_PATH,
  'utf-8',
);
const CONFIGURED_INTEGRATION_PACKAGES = new Set(docsiteConfig.integrations);

/** The workspace manifest of a configured integration package. */
function integrationManifest(name: string): {
  private?: boolean;
  astryx?: {canaryOnly?: boolean};
} {
  const entry = packages.find(pkg => pkg.name === name);
  if (!entry) {
    throw new Error(`${name} is missing from packageRegistry`);
  }
  return JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, entry.packagePath, 'package.json'),
      'utf-8',
    ),
  );
}

function findFiles(dir: string, predicate: (filePath: string) => boolean) {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFiles(fullPath, predicate));
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function getCoreComponentsWithPublicProps() {
  const names = new Set<string>();
  for (const filePath of findFiles(CORE_SRC_DIR, file =>
    file.endsWith('.tsx'),
  )) {
    const source = fs.readFileSync(filePath, 'utf-8');
    for (const match of source.matchAll(
      /export\s+(?:interface|type)\s+XDS([A-Z]\w*)Props\b/g,
    )) {
      names.add(match[1]);
    }
  }
  return names;
}

function getComponentDocCompletenessIssues(
  comp: ComponentEntry,
  componentsWithPublicProps: Set<string>,
) {
  const issues: string[] = [];
  if (comp.params != null || comp.hidden) {
    return issues;
  }
  if (comp.description.trim() === '') {
    issues.push('missing description');
  }
  const usageDescription = comp.usage?.description?.trim() ?? '';
  if (usageDescription === '') {
    issues.push('missing usage description');
  }
  if (componentsWithPublicProps.has(comp.name) && comp.props.length === 0) {
    issues.push('missing props');
  }
  const incompleteProps = comp.props
    .filter(
      prop =>
        prop.name.trim() === '' ||
        prop.type.trim() === '' ||
        prop.description.trim() === '',
    )
    .map(prop => prop.name || '<unnamed>');
  if (incompleteProps.length > 0) {
    issues.push(`incomplete props: ${incompleteProps.join(', ')}`);
  }
  return issues;
}

// ── Package Registry ───────────────────────────────────────────────────

describe('packageRegistry', () => {
  it('discovers installed stable packages and canary-only integrations', () => {
    const names = packages.map(p => p.name);
    expect(names).toContain('@astryxdesign/core');
    expect(names).toContain('@astryxdesign/cli');
    expect(names).toContain('@astryxdesign/theme-neutral');
    expect(names).toContain('@astryxdesign/theme-gothic');
    expect(names).toContain('@astryxdesign/theme-stone');
    expect(names).toContain('@astryxdesign/lab');
    expect(names).toContain('@astryxdesign/charts');
    expect(names).toContain('@astryxdesign/richtext');
    expect(names).toContain('@astryxdesign/vega');
    expect(names).not.toContain('@astryxdesign/theme-default');
    expect(names).not.toContain('@astryxdesign/theme-brutalist');
    expect(names).not.toContain('@astryxdesign/theme-chocolate');
    expect(names).not.toContain('@astryxdesign/theme-daily');
    expect(names).not.toContain('@astryxdesign/build');
    // Every canary-only package is a configured integration; a configured
    // integration that is a stable release (no `astryx.canaryOnly`) is not.
    expect(packages.filter(pkg => pkg.canaryOnly).map(pkg => pkg.name)).toEqual(
      [...CONFIGURED_INTEGRATION_PACKAGES]
        .filter(name => integrationManifest(name).astryx?.canaryOnly === true)
        .sort(),
    );
    expect(packages.length).toBeGreaterThanOrEqual(9);
  });

  it('only includes packages listed in docsite dependencies', () => {
    const docsitePkg = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    );
    const docsiteDeps = {
      ...docsitePkg.dependencies,
      ...docsitePkg.devDependencies,
    };
    for (const pkg of packages) {
      expect(docsiteDeps[pkg.name]).toBeDefined();
    }
  });

  it('each package has required fields', () => {
    for (const pkg of packages) {
      expect(pkg.name).toBeTruthy();
      expect(pkg.displayName).toBeTruthy();
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(pkg.packagePath).toBeTruthy();
      expect(typeof pkg.canaryOnly).toBe('boolean');
      expect(typeof pkg.hasReadme).toBe('boolean');
      expect(typeof pkg.hasChangelog).toBe('boolean');
    }
  });

  it('generates CSS imports for every canary component package that exports CSS', () => {
    const css = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/docsite/src/generated/package-styles.css'),
      'utf-8',
    );
    const expectedImports = packages
      .filter(pkg => pkg.canaryOnly && components[pkg.name]?.length > 0)
      .flatMap(pkg => {
        const manifest = JSON.parse(
          fs.readFileSync(
            path.join(REPO_ROOT, pkg.packagePath, 'package.json'),
            'utf-8',
          ),
        );
        return Object.keys(manifest.exports ?? {})
          .filter(subpath => subpath.endsWith('.css'))
          .map(subpath => `@import "${pkg.name}/${subpath.slice(2)}";`);
      });

    for (const expectedImport of expectedImports) {
      expect(css).toContain(expectedImport);
    }
  });

  it('no duplicate package names', () => {
    const names = packages.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('packages with READMEs have readme content', () => {
    for (const pkg of packages) {
      if (pkg.hasReadme) {
        expect(pkg.readme).toBeTruthy();
        expect(typeof pkg.readme).toBe('string');
        expect(pkg.readme!.length).toBeGreaterThan(50);
      } else {
        expect(pkg.readme).toBeNull();
      }
    }
  });

  it('packages with CHANGELOGs have changelog content', () => {
    for (const pkg of packages) {
      if (pkg.hasChangelog) {
        expect(pkg.changelog).toBeTruthy();
        expect(typeof pkg.changelog).toBe('string');
        expect(pkg.changelog!.length).toBeGreaterThan(
          pkg.name === '@astryxdesign/richtext' ? 0 : 50,
        );
      } else {
        expect(pkg.changelog).toBeNull();
      }
    }
  });

  it('CLI package has a substantial README', () => {
    const cli = packages.find(p => p.name === '@astryxdesign/cli');
    expect(cli?.readme).toBeTruthy();
    expect(cli!.readme!.length).toBeGreaterThan(1000);
  });
});

// ── Component Registry ─────────────────────────────────────────────────

describe('componentRegistry', () => {
  it('derives playground types from the CLI authoring contract', () => {
    const playground: NonNullable<ComponentEntry['playground']> = {
      wrapper: {component: 'Layout', slotProp: 'start'},
    };
    expect(COMPONENT_REGISTRY_SOURCE).toContain(
      "from '@astryxdesign/cli/authoring'",
    );
    expect(COMPONENT_REGISTRY_SOURCE).toContain(
      'export type PlaygroundConfig = ComponentPlaygroundConfig;',
    );
    expect(playground.wrapper?.slotProp).toBe('start');
  });

  it('discovers components in @astryxdesign/core', () => {
    expect(components['@astryxdesign/core']).toBeDefined();
    expect(components['@astryxdesign/core'].length).toBeGreaterThan(100);
  });

  it('discovers CLI-configured canary package components', () => {
    expect(components['@astryxdesign/lab'].length).toBeGreaterThan(30);
    expect(components['@astryxdesign/charts'].map(comp => comp.name)).toEqual([
      'Chart',
      'ChartAxis',
      'ChartGrid',
      'ChartLegend',
      'ChartSwatch',
      'ChartTooltip',
    ]);
    expect(components['@astryxdesign/richtext'].map(comp => comp.name)).toEqual(
      ['RichTextEditor'],
    );
    expect(components['@astryxdesign/vega'].map(comp => comp.name)).toEqual([
      'VegaChart',
    ]);

    // Components of a canary-only integration are not ready; components of a
    // configured integration that is a stable release are, like Core's.
    for (const packageName of [
      '@astryxdesign/lab',
      '@astryxdesign/charts',
      '@astryxdesign/richtext',
      '@astryxdesign/vega',
    ]) {
      const isReady =
        integrationManifest(packageName).astryx?.canaryOnly !== true;
      expect(
        components[packageName].every(comp => comp.isReady === isReady),
        packageName,
      ).toBe(true);
    }
    expect(components['@astryxdesign/core'].every(comp => comp.isReady)).toBe(
      true,
    );
  });

  it('groups every chart-family component under Charts', () => {
    const chartComponents = [
      ...(components['@astryxdesign/charts'] ?? []),
      ...(components['@astryxdesign/lab'] ?? []).filter(comp =>
        comp.name.startsWith('Chart'),
      ),
    ];
    expect(chartComponents.length).toBeGreaterThan(2);
    expect(chartComponents.every(comp => comp.group === 'Charts')).toBe(true);
    expect(
      chartComponents.every(comp => comp.category === 'Data Visualization'),
    ).toBe(true);
  });

  it('keeps every Lab chat component in the Chat family and category', () => {
    const chatComponents = (components['@astryxdesign/lab'] ?? []).filter(
      comp => comp.name.startsWith('Chat'),
    );
    expect(chatComponents.length).toBeGreaterThan(4);
    expect(chatComponents.every(comp => comp.group === 'Chat')).toBe(true);
    expect(chatComponents.every(comp => comp.category === 'Chat')).toBe(true);
  });

  it('generates lazy previews for every non-core component', () => {
    const externalNames = Object.entries(components).flatMap(
      ([packageName, entries]) =>
        packageName === '@astryxdesign/core'
          ? []
          : entries.map(component => component.name),
    );
    expect(Object.keys(externalComponentPreviews).sort()).toEqual(
      externalNames.sort(),
    );
    expect(
      Object.values(externalComponentPreviews).every(
        component => component != null && typeof component === 'object',
      ),
    ).toBe(true);
  });

  it('component count matches sum of all packages', () => {
    const sum = Object.values(components).reduce(
      (acc, list) => acc + list.length,
      0,
    );
    expect(componentCount).toBe(sum);
  });

  it('components have all required fields', () => {
    for (const [pkgName, comps] of Object.entries(components)) {
      expect(pkgName).toMatch(/^@astryxdesign\//);
      for (const comp of comps) {
        expect(comp.name).toBeTruthy();
        expect(comp.moduleName).toBeTruthy();
        expect(typeof comp.directory).toBe('string');
        expect(typeof comp.description).toBe('string');
        expect(Array.isArray(comp.keywords)).toBe(true);
        expect(typeof comp.hidden).toBe('boolean');
        expect(typeof comp.isReady).toBe('boolean');
        // parentDoc is string | null
        expect(
          comp.parentDoc === null || typeof comp.parentDoc === 'string',
        ).toBe(true);
      }
    }
  });

  // ── Sub-component expansion ────────────────────────────────────────

  it('expands compound components into sub-component entries', () => {
    const core = components['@astryxdesign/core'];
    // Table has sub-components: Table, BaseTable, TableRow, TableCell, TableHeaderCell, etc.
    const tableComponents = core.filter(c => c.parentDoc === 'Table');
    expect(tableComponents.length).toBeGreaterThanOrEqual(5);
    const tableNames = tableComponents.map(c => c.name);
    expect(tableNames).toContain('Table');
    expect(tableNames).toContain('TableRow');
    expect(tableNames).toContain('TableCell');
    expect(tableNames).toContain('TableHeaderCell');
  });

  it('sub-components share the parent group and directory', () => {
    const core = components['@astryxdesign/core'];
    const dialogSubs = core.filter(c => c.parentDoc === 'Dialog');
    expect(dialogSubs.length).toBeGreaterThanOrEqual(2);
    for (const sub of dialogSubs) {
      expect(sub.group).toBe('Dialog');
      expect(sub.directory).toBe('Dialog');
    }
  });

  it('sub-components have their own descriptions', () => {
    const core = components['@astryxdesign/core'];
    const dialogHeader = core.find(c => c.name === 'DialogHeader');
    expect(dialogHeader).toBeDefined();
    expect(dialogHeader!.description.length).toBeGreaterThan(10);
    // Description should be specific to DialogHeader, not the parent Dialog
    expect(dialogHeader!.description.toLowerCase()).toContain('header');
  });

  it('extracted sub-components do not inherit parent usage prose', () => {
    const core = components['@astryxdesign/core'];
    const chatComposer = core.find(c => c.name === 'ChatComposer');
    expect(chatComposer).toBeDefined();
    expect(chatComposer!.parentDoc).toBe('Chat');
    expect(chatDocs.usage?.description).toBeTruthy();
    expect(chatComposer!.usage?.description).toBeTruthy();
    expect(chatComposer!.usage?.description).not.toBe(
      chatDocs.usage?.description,
    );
  });

  it('sub-components can override inherited playground defaults', () => {
    const core = components['@astryxdesign/core'];
    const avatarGroupOverflow = core.find(
      c => c.name === 'AvatarGroupOverflow',
    );
    expect(avatarGroupOverflow).toBeDefined();
    expect(avatarGroupOverflow!.playground?.defaults).toMatchObject({
      count: 2,
      children: '+2',
    });
  });

  it('Chat sub-components declare a playground wrapper for realistic preview geometry', () => {
    const core = components['@astryxdesign/core'];
    const chatComposer = core.find(c => c.name === 'ChatComposer');
    expect(chatComposer).toBeDefined();
    expect(chatComposer!.playground?.wrapper).toMatchObject({
      component: 'Stack',
      props: {width: 480},
    });

    const chatComposerDrawer = core.find(c => c.name === 'ChatComposerDrawer');
    expect(chatComposerDrawer).toBeDefined();
    expect(chatComposerDrawer!.playground?.wrapper).toMatchObject({
      component: 'Stack',
      props: {width: 480},
    });
    expect(chatComposerDrawer!.playground?.defaults).toMatchObject({
      count: 3,
      label: 'Attachments',
    });
  });

  it('DropdownMenuRadioGroup declares a menu wrapper and radio choices for its preview (#5888)', () => {
    const core = components['@astryxdesign/core'];
    const radioGroup = core.find(c => c.name === 'DropdownMenuRadioGroup');

    expect(radioGroup).toBeDefined();
    // The menu opens on first load so both choices are visible immediately;
    // the preview bridges DropdownMenu's `onOpenChange` back to this prop so
    // selecting still closes the menu and the trigger reopens it.
    expect(radioGroup!.playground?.wrapper).toMatchObject({
      component: 'DropdownMenu',
      props: {
        button: {label: 'Sort'},
        presentation: 'popover',
        isMenuOpen: true,
      },
    });
    expect(radioGroup!.playground?.defaults).toMatchObject({
      value: 'newest',
      label: 'Sort by',
      children: [
        {
          __element: 'DropdownMenuRadioItem',
          props: {value: 'newest', label: 'Newest'},
        },
        {
          __element: 'DropdownMenuRadioItem',
          props: {value: 'oldest', label: 'Oldest'},
        },
      ],
    });
  });

  it('Citation satisfies its required source prop via playground defaults', () => {
    const core = components['@astryxdesign/core'];
    const citation = core.find(c => c.name === 'Citation');
    expect(citation).toBeDefined();
    // `source` is a custom object type the preview cannot auto-generate;
    // without these defaults the properties tab has no interactive preview.
    expect(citation!.playground?.defaults).toMatchObject({
      source: {title: 'Astryx Design', url: 'https://example.com'},
      number: 1,
    });
  });

  it('PowerSearch supplies representative config and filters playground defaults', () => {
    const core = components['@astryxdesign/core'];
    const powerSearch = core.find(c => c.name === 'PowerSearch');
    expect(powerSearch).toBeDefined();
    expect(powerSearch!.playground?.defaults).toMatchObject({
      config: {
        name: 'IssueSearch',
        fields: [
          {
            key: 'status',
            operators: [
              {
                key: 'is',
                value: {
                  type: 'enum',
                  values: [
                    {value: 'open', label: 'Open'},
                    {value: 'closed', label: 'Closed'},
                  ],
                },
              },
            ],
          },
          {key: 'title'},
        ],
      },
      filters: [
        {
          field: 'status',
          operator: 'is',
          value: {type: 'enum', value: 'open'},
        },
      ],
    });
  });

  it('Tokenizer satisfies its required value prop via playground defaults', () => {
    const core = components['@astryxdesign/core'];
    const tokenizer = core.find(c => c.name === 'Tokenizer');
    expect(tokenizer).toBeDefined();
    // `value` is an array of custom items the preview cannot auto-generate;
    // without this default the properties tab has no interactive preview.
    expect(tokenizer!.playground?.defaults).toMatchObject({
      label: 'Tags',
      value: [
        {id: '1', label: 'Design'},
        {id: '2', label: 'Engineering'},
      ],
    });
  });

  it('MetadataListItem declares a playground wrapper for realistic preview structure', () => {
    const core = components['@astryxdesign/core'];
    const metadataListItem = core.find(c => c.name === 'MetadataListItem');
    expect(metadataListItem).toBeDefined();
    expect(metadataListItem!.playground?.defaults).toMatchObject({
      label: 'Status',
      children: 'Active',
    });
    expect(metadataListItem!.playground?.wrapper).toMatchObject({
      component: 'MetadataList',
    });
  });

  it('LayoutHeader declares a playground wrapper and default content so preview is not empty', () => {
    const core = components['@astryxdesign/core'];
    const layoutHeader = core.find(c => c.name === 'LayoutHeader');
    expect(layoutHeader).toBeDefined();
    expect(layoutHeader!.playground?.defaults).toMatchObject({
      children: expect.any(String),
    });
    expect(layoutHeader!.playground?.wrapper).toMatchObject({
      component: 'Layout',
    });
  });

  it('Grid declares playground children so the preview is not empty (#5892)', () => {
    const core = components['@astryxdesign/core'];
    const grid = core.find(c => c.name === 'Grid');
    expect(grid).toBeDefined();
    expect(grid!.playground?.defaults).toMatchObject({
      columns: 3,
      gap: 2,
      children: expect.arrayContaining([
        expect.objectContaining({__element: 'Card'}),
      ]),
    });
  });

  it('GridSpan declares a playground wrapper for realistic preview geometry (#5893)', () => {
    const core = components['@astryxdesign/core'];
    const gridSpan = core.find(c => c.name === 'GridSpan');
    expect(gridSpan).toBeDefined();
    expect(gridSpan!.playground?.wrapper).toMatchObject({
      component: 'Grid',
      props: {columns: 3, gap: 2},
    });
    expect(gridSpan!.playground?.defaults).toMatchObject({
      columns: 2,
      children: expect.any(String),
    });
  });

  it.each(['Stack', 'HStack', 'VStack'])(
    '%s declares playground children so the preview is not empty (#5894, #5898, #5900)',
    name => {
      const core = components['@astryxdesign/core'];
      const entry = core.find(c => c.name === name);
      expect(entry).toBeDefined();
      expect(entry!.playground?.defaults).toMatchObject({
        gap: 2,
        children: expect.arrayContaining([
          expect.objectContaining({__element: 'Card'}),
        ]),
      });
    },
  );

  it('StackItem declares a playground wrapper for realistic preview geometry (#5899)', () => {
    const core = components['@astryxdesign/core'];
    const stackItem = core.find(c => c.name === 'StackItem');
    expect(stackItem).toBeDefined();
    expect(stackItem!.playground?.wrapper).toMatchObject({
      component: 'HStack',
      props: {gap: 2, width: 300},
    });
    expect(stackItem!.playground?.defaults).toMatchObject({
      size: 'fill',
      children: expect.objectContaining({__element: 'Card'}),
    });
  });

  it('LayoutPanel declares a playground wrapper in start slot so hasDivider preview is not 0px (#5897)', () => {
    const core = components['@astryxdesign/core'];
    const layoutPanel = core.find(c => c.name === 'LayoutPanel');
    expect(layoutPanel).toBeDefined();
    expect(layoutPanel!.playground?.defaults).toMatchObject({
      children: expect.any(String),
      hasDivider: true,
    });
    expect(layoutPanel!.playground?.wrapper).toMatchObject({
      component: 'Layout',
      slotProp: 'start',
    });
  });

  it('LayoutFooter declares a playground wrapper in footer slot so preview is not empty (#5895)', () => {
    const core = components['@astryxdesign/core'];
    const layoutFooter = core.find(c => c.name === 'LayoutFooter');
    expect(layoutFooter).toBeDefined();
    expect(layoutFooter!.playground?.defaults).toMatchObject({
      children: expect.any(String),
      hasDivider: true,
    });
    expect(layoutFooter!.playground?.wrapper).toMatchObject({
      component: 'Layout',
      slotProp: 'footer',
    });
  });

  it('Lightbox declares an overlay playground with a closed initial state (#3657)', () => {
    const core = components['@astryxdesign/core'];
    const lightbox = core.find(c => c.name === 'Lightbox');
    expect(lightbox).toBeDefined();
    // Lightbox opens via showModal() and renders nothing while closed; without
    // overlay mode the properties tab is an empty stage on load.
    expect(lightbox!.playground?.overlay).toBe(true);
    expect(lightbox!.playground?.defaults).toMatchObject({
      isOpen: false,
      media: {
        src: expect.stringContaining('/template-assets/'),
        alt: expect.any(String),
      },
    });
  });

  it('MobileNavToggle declares an appShellMobile playground so its preview is not empty (#4983)', () => {
    const core = components['@astryxdesign/core'];
    const toggle = core.find(c => c.name === 'MobileNavToggle');
    expect(toggle).toBeDefined();
    // The toggle reads AppShell mobile context and renders null without it;
    // appShellMobile makes the preview provide a simulated mobile context.
    expect(toggle!.playground?.appShellMobile).toBe(true);
    // The drawer's overlay playground stays on the MobileNav entry only —
    // the toggle renders inline and must not inherit the overlay placeholder.
    expect(toggle!.playground?.overlay).toBeUndefined();
  });

  it('dialog-family components keep contained isInline previews, not overlay mode (#3657)', () => {
    const core = components['@astryxdesign/core'];
    for (const name of ['Dialog', 'AlertDialog', 'CommandPalette']) {
      const entry = core.find(c => c.name === name);
      expect(entry, name).toBeDefined();
      // Intentional: the contained preview keeps knobs usable while the
      // component is visible. Guard the half-migrated shape too — overlay
      // with isOpen: true would never show the open trigger.
      expect(entry!.playground?.overlay, name).toBeUndefined();
      expect(entry!.playground?.defaults, name).toMatchObject({
        isOpen: true,
        isInline: true,
      });
    }
  });

  it('Chat has many sub-components (standalone docs take priority over compound entries)', () => {
    const core = components['@astryxdesign/core'];
    // Chat compound doc has 14 sub-components, but ChatToolCalls and
    // ChatDictationButton have their own standalone docs so they appear
    // with parentDoc: null instead of parentDoc: 'Chat'
    const chatSubs = core.filter(c => c.parentDoc === 'Chat');
    expect(chatSubs.length).toBeGreaterThanOrEqual(12);
    const chatNames = chatSubs.map(c => c.name);
    expect(chatNames).toContain('ChatMessage');
    expect(chatNames).toContain('ChatComposer');
    expect(chatNames).toContain('ChatSendButton');

    // ChatToolCalls should exist but as a standalone entry
    const toolCalls = core.find(c => c.name === 'ChatToolCalls');
    expect(toolCalls).toBeDefined();
    // It's standalone (has its own doc.mjs), not a sub-component
    expect(toolCalls!.parentDoc).toBeNull();
  });

  it('simple components have null parentDoc', () => {
    const core = components['@astryxdesign/core'];
    const button = core.find(c => c.name === 'Button');
    expect(button).toBeDefined();
    expect(button!.parentDoc).toBeNull();
  });

  it('keeps core component docs complete for generated component pages', () => {
    const componentsWithPublicProps = getCoreComponentsWithPublicProps();
    const incompleteDocs = components['@astryxdesign/core'].flatMap(comp => {
      const issues = getComponentDocCompletenessIssues(
        comp,
        componentsWithPublicProps,
      );
      return issues.length > 0 ? [`${comp.name}: ${issues.join(', ')}`] : [];
    });

    expect(incompleteDocs).toEqual([]);
  });

  it('moduleName has XDS prefix for components, not for hooks', () => {
    const core = components['@astryxdesign/core'];
    const button = core.find(c => c.name === 'Button');
    expect(button?.moduleName).toBe('Button');

    const hookComp = core.find(c => c.name === 'useClickableContainer');
    expect(hookComp?.moduleName).toBe('useClickableContainer');

    // Sub-component hooks also keep their name
    const tableHook = core.find(c => c.name === 'useTableSelection');
    if (tableHook) {
      expect(tableHook.moduleName).toMatch(/^use/);
    }
  });

  // ── Discovery coverage ─────────────────────────────────────────────

  it('discovers hooks (not skipped)', () => {
    const core = components['@astryxdesign/core'];
    const hooks = core.filter(c => c.directory === 'hooks');
    expect(hooks.length).toBeGreaterThan(8);
    for (const hook of hooks) {
      expect(hook.name).toMatch(/^use[A-Z]/);
    }
  });

  it('renders hook pages as hook docs with examples', () => {
    const core = components['@astryxdesign/core'];
    // Public hooks (useTheme, useToast, useTableSortable, …) ship example
    // blocks; internal utility hooks (useFocusTrap, useScrollLock, …) do not.
    // Post un-prefix migration the doc `name` is bare for both,
    // so the public set is identified by having an example-registry entry
    // rather than by a name prefix.
    const hooks = core.filter(
      c =>
        /^use[A-Z]/.test(c.name) && (exampleRegistry[c.name]?.length ?? 0) > 0,
    );
    expect(hooks.length).toBeGreaterThan(15);
    expect(hooks.map(h => h.name)).toContain('useTheme');

    for (const hook of hooks) {
      expect(hook.params).not.toBeNull();
      expect(hook.returns).not.toBeNull();
      expect(hook.props).toHaveLength(0);
      expect(exampleRegistry[hook.name]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('discovers theme utilities (not skipped)', () => {
    const core = components['@astryxdesign/core'];
    const themeUtils = core.filter(c => c.directory === 'theme');
    expect(themeUtils.length).toBeGreaterThanOrEqual(2);
    const names = themeUtils.map(c => c.name);
    expect(names).toContain('MediaTheme');
  });

  it('hidden components are included with hidden flag', () => {
    const core = components['@astryxdesign/core'];
    const names = core.map(c => c.name);
    expect(names).toContain('ChatDictationButton');
    expect(names).toContain('NavHeadingMenu');
    const hiddenCount = core.filter(c => c.hidden).length;
    expect(hiddenCount).toBe(0);
  });

  it('no duplicate component names within a package', () => {
    for (const [, comps] of Object.entries(components)) {
      const names = comps.map(c => c.name);
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      expect(dupes).toEqual([]);
    }
  });

  it('has globally unique component route names', () => {
    const names = Object.values(components)
      .flat()
      .map(component => component.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('known compound docs are expanded, not emitted as single entries', () => {
    const core = components['@astryxdesign/core'];
    const names = core.map(c => c.name);
    // These are parent doc names that should NOT appear as component names
    // because they were expanded into sub-components
    // (unless the sub-component itself is named the same, like Table → Table → Table)
    // Verify the sub-components exist instead
    expect(names).toContain('DialogHeader'); // from Dialog compound doc
    expect(names).toContain('SideNavItem'); // from SideNav compound doc
    expect(names).toContain('TopNavItem'); // from TopNav compound doc
  });

  // ── Full doc extraction ──────────────────────────────────────────

  it('extracts props for standalone components', () => {
    const core = components['@astryxdesign/core'];
    const button = core.find(c => c.name === 'Button');
    expect(button).toBeDefined();
    expect(button!.props.length).toBeGreaterThan(5);
    const labelProp = button!.props.find(p => p.name === 'label');
    expect(labelProp).toBeDefined();
    expect(labelProp!.type).toBe('string');
    expect(labelProp!.required).toBe(true);
  });

  it('extracts props for sub-components in compound docs', () => {
    const core = components['@astryxdesign/core'];
    const dialog = core.find(c => c.name === 'Dialog');
    expect(dialog).toBeDefined();
    expect(dialog!.props.length).toBeGreaterThan(3);
    const isOpenProp = dialog!.props.find(p => p.name === 'isOpen');
    expect(isOpenProp).toBeDefined();
    expect(isOpenProp!.required).toBe(true);
  });

  it('extracts usage with bestPractices and anatomy', () => {
    const core = components['@astryxdesign/core'];
    const button = core.find(c => c.name === 'Button');
    expect(button!.usage).toBeDefined();
    expect(button!.usage!.description.length).toBeGreaterThan(20);
    expect(button!.usage!.bestPractices).toBeDefined();
    expect(button!.usage!.bestPractices!.length).toBeGreaterThanOrEqual(3);
    expect(button!.usage!.anatomy).toBeDefined();
    expect(button!.usage!.anatomy!.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts theming data', () => {
    const core = components['@astryxdesign/core'];
    const button = core.find(c => c.name === 'Button');
    expect(button!.theming).toBeDefined();
    expect(button!.theming!.targets.length).toBeGreaterThanOrEqual(1);
    expect(button!.theming!.targets[0].className).toBe('astryx-button');
    expect(button!.theming!.vars).toBeDefined();
    expect(button!.theming!.vars!.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts hook params and returns', () => {
    const core = components['@astryxdesign/core'];
    const hook = core.find(c => c.name === 'useMediaQuery');
    expect(hook).toBeDefined();
    expect(hook!.params).toBeDefined();
    expect(hook!.params!.length).toBeGreaterThanOrEqual(1);
    expect(hook!.params![0].name).toBe('query');
    expect(hook!.returns).toBeDefined();
    expect(hook!.returns!.length).toBeGreaterThanOrEqual(1);
  });

  it('components without props have empty props array', () => {
    const core = components['@astryxdesign/core'];
    for (const comp of core) {
      expect(Array.isArray(comp.props)).toBe(true);
    }
  });

  it('most standalone components have usage data', () => {
    const core = components['@astryxdesign/core'];
    const standalone = core.filter(c => c.parentDoc === null);
    const withUsage = standalone.filter(c => c.usage != null);
    // At least 80% should have usage docs
    expect(withUsage.length / standalone.length).toBeGreaterThan(0.8);
  });
});

// ── Block Registry ─────────────────────────────────────────────────────

describe('blockRegistry', () => {
  it('discovers blocks', () => {
    expect(blockCount).toBeGreaterThan(100);
    expect(blocks.length).toBe(blockCount);
  });

  it('has showcases', () => {
    expect(showcaseCount).toBeGreaterThan(20);
    const actualShowcases = blocks.filter(b => b.isShowcase);
    expect(actualShowcases.length).toBe(showcaseCount);
  });

  it('blocks have required fields', () => {
    for (const block of blocks) {
      expect(block.dirName).toBeTruthy();
      expect(block.name).toBeTruthy();
      expect(typeof block.isShowcase).toBe('boolean');
      expect(typeof block.aspectRatio).toBe('number');
      expect(block.aspectRatio).toBeGreaterThan(0);
      expect(block.aspectRatio).not.toBeNaN();
      expect(Array.isArray(block.componentsUsed)).toBe(true);
      expect(block.category).toBeDefined();
      expect(
        block.exampleFor === null || typeof block.exampleFor === 'string',
      ).toBe(true);
    }
  });

  it('aspect ratios are parsed correctly (no eval)', () => {
    const wideBlocks = blocks.filter(
      b => Math.abs(b.aspectRatio - 16 / 9) < 0.01,
    );
    expect(wideBlocks.length).toBeGreaterThan(0);
    const standardBlocks = blocks.filter(
      b => Math.abs(b.aspectRatio - 4 / 3) < 0.01,
    );
    expect(standardBlocks.length).toBeGreaterThan(0);
  });

  it('blocks are scoped by category (component directory)', () => {
    const categories = new Set(blocks.map(b => b.category));
    expect(categories.size).toBeGreaterThan(10);
  });

  it('showcase for Button exists', () => {
    const buttonShowcase = blocks.find(
      b => b.isShowcase && b.exampleFor === 'Button',
    );
    expect(buttonShowcase).toBeDefined();
  });

  it('discovers the Charts-owned showcase through its CLI integration', () => {
    const chartShowcase = blocks.find(
      block => block.isShowcase && block.exampleFor === 'Chart',
    );
    expect(chartShowcase).toMatchObject({
      displayName: 'Chart',
      sourcePackage: '@astryxdesign/charts',
      aspectRatio: 1.6,
    });
    expect(chartShowcase?.source).toContain("from '@astryxdesign/charts'");
  });

  it('showcases always declare component ownership', () => {
    const missing = blocks.filter(b => b.isShowcase && !b.exampleFor);
    expect(missing.map(b => b.dirName)).toEqual([]);
  });

  it('showcase blocks have unique exampleFor (one showcase per component)', () => {
    const showcases = blocks.filter(b => b.isShowcase);
    const seen = new Map<string, string[]>();
    for (const s of showcases) {
      expect(s.exampleFor).not.toBeNull();
      const owner = s.exampleFor!;
      if (!seen.has(owner)) {
        seen.set(owner, []);
      }
      seen.get(owner)!.push(s.dirName);
    }
    const dupes = [...seen.entries()].filter(([, v]) => v.length > 1);
    // Some components may legitimately have multiple showcases, but flag them
    // so we're aware. Most should have exactly one.
    expect(dupes.length).toBeLessThan(showcases.length * 0.1);
  });

  it('componentsUsed links blocks to components', () => {
    const blocksWithComponents = blocks.filter(
      b => b.componentsUsed.length > 0,
    );
    expect(blocksWithComponents.length).toBeGreaterThan(blocks.length * 0.5);
  });

  it('blocks include TSX source code', () => {
    for (const block of blocks) {
      expect(typeof block.source).toBe('string');
      expect(block.source.length).toBeGreaterThan(0);
    }
  });

  it('decodes unicode escapes in block titles', () => {
    const block = blocks.find(b => b.dirName === 'TabListTabsWithBadge');
    expect(block).toBeDefined();
    expect(block!.name).toBe('TabList — With Badge');
    expect(block!.displayName).toBe('TabList — With Badge');
    expect(block!.name).not.toContain('\\u2014');
  });

  it('showcase sources contain valid JSX', () => {
    const showcases = blocks.filter(b => b.isShowcase);
    for (const s of showcases) {
      // Every showcase should have an export default function
      expect(s.source).toMatch(/export default function/);
    }
  });
});

// ── Template Registry ──────────────────────────────────────────────────

describe('templateRegistry', () => {
  it('discovers page templates', () => {
    expect(templateCount).toBeGreaterThan(10);
    expect(templates.length).toBe(templateCount);
    expect(templateMetadataCount).toBe(templateCount);
    expect(templateMetadata).toHaveLength(templateCount);
  });

  it('keeps source out of the metadata-only registry', () => {
    expect(templateMetadata.map(template => template.slug)).toEqual(
      templates.map(template => template.slug),
    );
    for (const template of templateMetadata) {
      expect(template).not.toHaveProperty('source');
    }
  });

  it('templates have required fields', () => {
    for (const t of templates) {
      expect(t.slug).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(typeof t.description).toBe('string');
      expect(typeof t.isReady).toBe('boolean');
    }
  });

  it('known templates are present', () => {
    const slugs = templates.map(t => t.slug);
    expect(slugs).toContain('dashboard');
    expect(slugs).toContain('settings');
  });

  it('surfaces all dashboard templates with live previews', () => {
    const dashboards = templates.filter(template =>
      template.category.startsWith('Dashboard'),
    );

    expect(dashboards.map(template => template.slug).sort()).toEqual([
      'dashboard',
      'dashboard-alert-rail',
      'dashboard-cohort-funnel',
      'dashboard-comparison',
      'dashboard-composition',
      'dashboard-progress',
      'dashboard-scorecard',
    ]);
    for (const template of dashboards) {
      expect(template.isReady).toBe(true);
      expect(template.isHiddenFromOverview).toBe(false);
      expect(TEMPLATE_COMPONENTS[template.slug]).toBeDefined();
    }
  });

  it('no duplicate template slugs', () => {
    const slugs = templates.map(t => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

// ── Docs Registry ──────────────────────────────────────────────────────

describe('docsRegistry', () => {
  it('discovers doc topics', () => {
    expect(docsCount).toBeGreaterThan(5);
    expect(docTopics.length).toBe(docsCount);
  });

  it('doc topics have required fields including title', () => {
    for (const d of docTopics) {
      expect(d.topic).toBeTruthy();
      expect(d.title).toBeTruthy();
      expect(typeof d.description).toBe('string');
    }
  });

  it('title differs from slug (human-readable)', () => {
    const gettingStarted = docTopics.find(d => d.topic === 'getting-started');
    expect(gettingStarted).toBeDefined();
    expect(gettingStarted?.title).toBe('Getting Started');

    const theme = docTopics.find(d => d.topic === 'theme');
    expect(theme).toBeDefined();
    expect(theme?.title).toBe('Theming');
  });

  it('known topics are present', () => {
    const topics = docTopics.map(d => d.topic);
    expect(topics).toContain('getting-started');
    expect(topics).toContain('tokens');
    expect(topics).toContain('spacing');
    expect(topics).toContain('color');
  });

  it('doc topics have category (guide or foundations)', () => {
    for (const d of docTopics) {
      expect(d.category === 'guide' || d.category === 'foundations').toBe(true);
    }
    const guide = docTopics.filter(d => d.category === 'guide');
    const foundations = docTopics.filter(d => d.category === 'foundations');
    expect(guide.length).toBeGreaterThanOrEqual(4);
    expect(foundations.length).toBeGreaterThanOrEqual(7);
  });

  it('no duplicate topics', () => {
    const topics = docTopics.map(d => d.topic);
    expect(new Set(topics).size).toBe(topics.length);
  });
});

// ── Theme Registry ─────────────────────────────────────────────────────

describe('themeRegistry', () => {
  const registryPath = new URL(
    '../generated/themeRegistry.ts',
    import.meta.url,
  );
  const registrySource = fs.readFileSync(registryPath, 'utf-8');

  it('generates a themeRegistry file', () => {
    expect(registrySource).toContain('themeObjects');
  });

  it('has an import and entry for every theme package', () => {
    const themePackages = packages.filter(p =>
      p.name.startsWith('@astryxdesign/theme-'),
    );
    expect(themePackages.length).toBeGreaterThan(0);
    for (const pkg of themePackages) {
      const slug = pkg.name.replace('@astryxdesign/theme-', '');
      expect(registrySource).toContain(`from '${pkg.name}/built'`);
      expect(registrySource).toContain(`'${pkg.name}': ${slug}Theme`);
    }
  });

  it('has no entries for non-theme packages', () => {
    const nonTheme = packages.filter(
      p => !p.name.startsWith('@astryxdesign/theme-'),
    );
    for (const pkg of nonTheme) {
      expect(registrySource).not.toContain(`'${pkg.name}':`);
    }
  });
});

// ── Showcase Registry ──────────────────────────────────────────────────

describe('showcaseRegistry', () => {
  it('has showcase loaders for many components', () => {
    const keys = Object.keys(showcaseRegistry);
    expect(keys.length).toBeGreaterThan(100);
  });

  it('every entry is a function (dynamic import loader)', () => {
    for (const [_key, loader] of Object.entries(showcaseRegistry)) {
      expect(typeof loader).toBe('function');
    }
  });

  it('has showcases for known components', () => {
    expect(showcaseRegistry['Button']).toBeDefined();
    expect(showcaseRegistry['Dialog']).toBeDefined();
    expect(showcaseRegistry['Table']).toBeDefined();
    expect(showcaseRegistry['Card']).toBeDefined();
    expect(showcaseRegistry['Chart']).toBeDefined();
    expect(showcaseRegistry['ChartBar']).toBeDefined();
    expect(showcaseRegistry['RichTextEditor']).toBeDefined();
  });

  it('no duplicate keys (one showcase per component)', () => {
    const keys = Object.keys(showcaseRegistry);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('showcase files exist on disk', () => {
    const showcaseDir = new URL('../generated/showcases', import.meta.url);
    const files = fs.readdirSync(showcaseDir);
    expect(files.length).toBeGreaterThan(100);
    expect(files.every(f => f.endsWith('.tsx'))).toBe(true);
  });

  it('showcase file count matches registry entries', () => {
    const showcaseDir = new URL('../generated/showcases', import.meta.url);
    const files = fs.readdirSync(showcaseDir);
    const keys = Object.keys(showcaseRegistry);
    // Files may be more than keys due to dedup, but keys should not exceed files
    expect(keys.length).toBeLessThanOrEqual(files.length);
  });
});

// ── Example Registry ───────────────────────────────────────────────────

describe('exampleRegistry', () => {
  it('has examples for many components', () => {
    const keys = Object.keys(exampleRegistry);
    expect(keys.length).toBeGreaterThan(50);
  });

  it('every entry is an array of example objects', () => {
    for (const [, examples] of Object.entries(exampleRegistry)) {
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(typeof ex.name).toBe('string');
        expect(ex.name.length).toBeGreaterThan(0);
        expect(typeof ex.description).toBe('string');
        expect(typeof ex.load).toBe('function');
      }
    }
  });

  it('has examples for known components', () => {
    expect(exampleRegistry['Button']).toBeDefined();
    expect(exampleRegistry['Table']).toBeDefined();
    expect(exampleRegistry['Dialog']).toBeDefined();
  });

  it('projects Drawer docs into a live showcase and runnable example blocks', () => {
    const drawerBlocks = blocks.filter(block => block.exampleFor === 'Drawer');
    const labels = drawerDocs.examples!.map(example => example.label);
    expect(drawerBlocks).toHaveLength(labels.length);
    expect(drawerBlocks.map(block => block.name).sort()).toEqual(
      [...labels].sort(),
    );
    // Core blocks, not an integration package's.
    expect(drawerBlocks.every(block => block.sourcePackage == null)).toBe(true);

    const showcase = drawerBlocks.filter(block => block.isShowcase);
    expect(showcase.map(block => block.name)).toEqual([labels[0]]);
    expect(showcaseRegistry.Drawer).toBeTypeOf('function');
    // The page lists the examples in the doc's priority order, not by name.
    expect(exampleRegistry.Drawer.map(example => example.name)).toEqual(
      labels.slice(1),
    );
  });

  it('gives DrawerHeader a visible showcase and projects its docs into example blocks', () => {
    const headerBlocks = blocks.filter(
      block => block.exampleFor === 'DrawerHeader',
    );
    const labels = drawerHeaderDocs.examples!.map(example => example.label);
    expect(headerBlocks).toHaveLength(labels.length + 1);
    expect(headerBlocks.every(block => block.sourcePackage == null)).toBe(true);

    // Like DialogHeader, the page leads with a rendered header rather than an
    // empty preview; every authored example also runs live.
    expect(headerBlocks.filter(block => block.isShowcase)).toHaveLength(1);
    expect(showcaseRegistry.DrawerHeader).toBeTypeOf('function');
    expect(
      exampleRegistry.DrawerHeader.map(example => example.name).sort(),
    ).toEqual([...labels].sort());
  });

  it('Button has multiple examples', () => {
    const buttonExamples = exampleRegistry['Button'];
    expect(buttonExamples.length).toBeGreaterThanOrEqual(3);
  });

  it('example files exist on disk', () => {
    const examplesDir = new URL('../generated/examples', import.meta.url);
    const files = fs.readdirSync(examplesDir);
    expect(files.length).toBeGreaterThan(200);
    expect(files.every(f => f.endsWith('.tsx'))).toBe(true);
  });

  it('does not include showcases as primary component examples', () => {
    // Hook pages can reuse authored component examples/showcases through
    // explicit block metadata. Count unique authored example sources so those
    // hook aliases don't make the registry look larger than the block set.
    const showcaseCount = Object.keys(showcaseRegistry).length;
    const examples = Object.values(exampleRegistry).flat();
    const uniqueExampleSourceCount = new Set(examples.map(e => e.source)).size;
    expect(uniqueExampleSourceCount).toBeLessThanOrEqual(blockCount);
    expect(examples.length).toBeGreaterThan(showcaseCount);
  });

  // Regression: the description extractor used to truncate at the first
  // interior quote (e.g. 'Swap the default "/"...') and drop any
  // description longer than 200 characters entirely — surfacing as
  // "No description available." in the docsite. Every authored doc has a
  // description, so the registry should never carry an empty one.
  it('every example has a non-empty description', () => {
    const missing: string[] = [];
    for (const examples of Object.values(exampleRegistry)) {
      for (const ex of examples) {
        if (!ex.description || ex.description.trim().length === 0) {
          missing.push(ex.name);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  // Regression: descriptions containing interior double quotes must be
  // preserved in full rather than cut off at the first quote.
  it('preserves descriptions with interior quotes', () => {
    const breadcrumbs = exampleRegistry['Breadcrumbs'] ?? [];
    const separators = breadcrumbs.find(e => /Separator/i.test(e.name));
    expect(separators).toBeDefined();
    expect(separators!.description).toContain('"/"');
    // Full sentence survives past the interior quote.
    expect(separators!.description).toMatch(/separator\.?$/i);
  });

  it('decodes unicode escapes in example titles', () => {
    const tabList = exampleRegistry['TabList'] ?? [];
    const withBadge = tabList.find(e => /With Badge/i.test(e.name));
    expect(withBadge).toBeDefined();
    expect(withBadge!.name).toBe('TabList — With Badge');
    expect(withBadge!.name).not.toContain('\\u2014');
  });

  // Regression: long descriptions (>200 chars) must not be dropped.
  it('keeps long descriptions intact', () => {
    const longest = Object.values(exampleRegistry)
      .flat()
      .reduce((max, e) => Math.max(max, e.description.length), 0);
    expect(longest).toBeGreaterThan(200);
  });
});

// ── Block example title convention (Component — Variant) ─────────────────
// Example block `displayName`s should read like "Component — Variant" using an
// em-dash separator, not leak PascalCase/export-name wording. The Card example
// titles previously rendered as "Clickable Card With Nested Button" and
// "Selectable Card Multi".
describe('block example title convention', () => {
  const blocksDir = fileURLToPath(
    new URL(
      '../../../../packages/cli/assets/templates/blocks',
      import.meta.url,
    ),
  );

  function displayNameOf(relPath: string): string | null {
    const content = fs.readFileSync(`${blocksDir}/${relPath}`, 'utf-8');
    const m = content.match(/displayName:\s*['"]([^'"]+)['"]/);
    return m ? m[1] : null;
  }

  it('Card example titles use the em-dash variant convention', () => {
    expect(
      displayNameOf('components/Card/ClickableCardWithNestedButton.doc.mjs'),
    ).toBe('Clickable Card — Nested Button');
    expect(displayNameOf('components/Card/SelectableCardMulti.doc.mjs')).toBe(
      'Selectable Card — Multi-select',
    );
  });
});

// ── Playground defaults for Card components (BB-006 / #2008) ──────────────
// ClickableCard and SelectableCard playgrounds rendered empty because their
// docs carried no `playground.defaults`. Defaults must flow into the generated
// registry so previews demonstrate realistic card layouts.
describe('Card playground defaults', () => {
  function coreComponent(name: string) {
    return Object.values(components)
      .flat()
      .find(c => c.name === name);
  }

  it('ClickableCard has playground defaults with label, href, and body content', () => {
    const entry = coreComponent('ClickableCard');
    expect(entry).toBeDefined();
    const defaults = entry!.playground?.defaults as
      Record<string, unknown> | undefined;
    expect(defaults).toBeDefined();
    expect(typeof defaults!.label).toBe('string');
    expect(defaults!.href).toBeDefined();
    // children is a resolved element descriptor, not empty.
    expect(defaults!.children).toBeTruthy();
    expect(typeof defaults!.children).toBe('object');
  });

  it('SelectableCard has playground defaults with label, selection state, and body content', () => {
    const entry = coreComponent('SelectableCard');
    expect(entry).toBeDefined();
    const defaults = entry!.playground?.defaults as
      Record<string, unknown> | undefined;
    expect(defaults).toBeDefined();
    expect(typeof defaults!.label).toBe('string');
    expect(typeof defaults!.isSelected).toBe('boolean');
    expect(defaults!.children).toBeTruthy();
    expect(typeof defaults!.children).toBe('object');
  });
});

describe('CheckIndicator playground defaults (#5890)', () => {
  it('starts the Properties preview in its visible checked state', () => {
    const checkIndicator = Object.values(components)
      .flat()
      .find(component => component.name === 'CheckIndicator');

    expect(checkIndicator).toBeDefined();
    expect(checkIndicator!.playground?.defaults).toMatchObject({
      state: 'checked',
    });
  });
});

describe('DropdownMenu adaptive-presentation example', () => {
  it('documents the presentation choice for the Properties tab', () => {
    const dropdownMenu = Object.values(components)
      .flat()
      .find(component => component.name === 'DropdownMenu');
    const presentation = dropdownMenu?.props.find(
      prop => prop.name === 'presentation',
    );

    expect(presentation?.type).toBe("'popover' | 'bottom-sheet' | 'adaptive'");
    expect(presentation?.default).toBe("'popover'");

    const defaults = dropdownMenu?.playground?.defaults as
      Record<string, unknown> | undefined;
    const items = defaults?.items as
      Array<{label?: unknown; icon?: unknown}> | undefined;
    expect(items).toHaveLength(4);
    expect(items?.every(item => typeof item.icon === 'string')).toBe(true);
  });

  it('registers the responsive presentation example on the related component pages', () => {
    const dropdownExamples = exampleRegistry['DropdownMenu'] ?? [];
    const bottomSheetExample = dropdownExamples.find(example =>
      /Adaptive presentation/i.test(example.name),
    );

    expect(bottomSheetExample).toBeDefined();
    expect(bottomSheetExample!.source).toContain('useMediaQuery');
    expect(bottomSheetExample!.source).toContain("'bottom-sheet' : 'popover'");
    expect(bottomSheetExample!.source).toContain('<DropdownMenu');

    const bottomSheetExamples = exampleRegistry['BottomSheet'] ?? [];
    expect(
      bottomSheetExamples.some(
        example => example.source === bottomSheetExample!.source,
      ),
    ).toBe(true);

    const mediaQueryExamples = exampleRegistry['useMediaQuery'] ?? [];
    expect(
      mediaQueryExamples.some(
        example => example.source === bottomSheetExample!.source,
      ),
    ).toBe(true);
  });

  it('registers the ContextMenu BottomSheet example', () => {
    const contextMenuExamples = exampleRegistry['ContextMenu'] ?? [];
    const bottomSheetExample = contextMenuExamples.find(example =>
      /Bottom Sheet/i.test(example.name),
    );

    expect(bottomSheetExample).toBeDefined();
    expect(bottomSheetExample!.source).toContain('presentation="bottom-sheet"');
    expect(bottomSheetExample!.source).toContain(
      'Long-press on touch or right-click',
    );
    expect(bottomSheetExample!.source).not.toContain("type: 'divider'");
  });

  it('uses adaptive presentation in the primary ContextMenu example', () => {
    const contextMenuExamples = exampleRegistry['ContextMenu'] ?? [];
    const basicExample = contextMenuExamples.find(example =>
      /Basic/i.test(example.name),
    );

    expect(basicExample).toBeDefined();
    expect(basicExample!.source).toContain('presentation="adaptive"');
    expect(basicExample!.source).toContain('Long-press or right-click');
  });

  it('registers the MoreMenu BottomSheet example', () => {
    const moreMenuExamples = exampleRegistry['MoreMenu'] ?? [];
    const bottomSheetExample = moreMenuExamples.find(example =>
      /Bottom Sheet/i.test(example.name),
    );

    expect(bottomSheetExample).toBeDefined();
    expect(bottomSheetExample!.source).toContain('presentation="bottom-sheet"');
    expect(bottomSheetExample!.source).toContain('label="Project actions"');
    expect(bottomSheetExample!.source).not.toContain("type: 'divider'");
  });
});

describe('Selector bottom-sheet examples', () => {
  it.each(['Selector', 'MultiSelector'])(
    'documents the %s presentation choice',
    componentName => {
      const component = Object.values(components)
        .flat()
        .find(entry => entry.name === componentName);
      const presentation = component?.props.find(
        prop => prop.name === 'presentation',
      );

      expect(presentation?.type).toBe(
        "'popover' | 'bottom-sheet' | 'adaptive'",
      );
      expect(presentation?.default).toBe("'popover'");
    },
  );

  it.each(['Selector', 'MultiSelector'])(
    'registers the %s BottomSheet example',
    componentName => {
      const examples = exampleRegistry[componentName] ?? [];
      const bottomSheetExample = examples.find(example =>
        /Bottom Sheet/i.test(example.name),
      );

      expect(bottomSheetExample).toBeDefined();
      expect(bottomSheetExample!.source).toContain(
        'presentation="bottom-sheet"',
      );
    },
  );
});

// ── Vertical ToggleButtonGroup example (#2707) ─────────────────────────────
// ToggleButtonGroup supports orientation="vertical", but no docsite example
// demonstrated it — the prop was undiscoverable without reading the API
// table. A dedicated vertical example block must exist and actually use the
// vertical orientation.
describe('ToggleButtonGroup vertical example', () => {
  it('discovers the ToggleButtonGroupVertical block', () => {
    const block = blocks.find(b => b.dirName === 'ToggleButtonGroupVertical');
    expect(block).toBeDefined();
    expect(block!.exampleFor).toBe('ToggleButtonGroup');
    expect(block!.isShowcase).toBe(false);
    expect(block!.name).toBe('ToggleButtonGroup — Vertical');
  });

  it('registers it among the ToggleButtonGroup examples', () => {
    const examples = exampleRegistry['ToggleButtonGroup'] ?? [];
    const vertical = examples.find(e => /Vertical/i.test(e.name));
    expect(vertical).toBeDefined();
    expect(vertical!.source).toContain('orientation="vertical"');
  });

  it('demonstrates both single-select and multi-select stacks', () => {
    const examples = exampleRegistry['ToggleButtonGroup'] ?? [];
    const vertical = examples.find(e => /Vertical/i.test(e.name));
    expect(vertical).toBeDefined();
    expect(vertical!.source).toContain('type="multiple"');
  });
});

// ── LinkProvider utility page (#2733) ──────────────────────────────────────
// LinkProvider is a non-visual provider: its page renders the hook-style
// static layout (props table on the main page, no interactive playground).
// That layout keys off `category: 'Utility'` with no curated playground, and
// still needs props and an example block to have content to show.
describe('LinkProvider utility page', () => {
  const linkProvider = components['@astryxdesign/core'].find(
    c => c.name === 'LinkProvider',
  );

  it('is a Utility entry without a curated playground', () => {
    expect(linkProvider).toBeDefined();
    expect(linkProvider!.category).toBe('Utility');
    expect(linkProvider!.params).toBeNull();
    expect(linkProvider!.playground).toBeNull();
  });

  it('documents props for the static props table', () => {
    const propNames = linkProvider!.props.map(p => p.name);
    expect(propNames).toContain('component');
    expect(propNames).toContain('children');
  });

  it('registers an example block demonstrating a custom link component', () => {
    const examples = exampleRegistry['LinkProvider'] ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(1);
    expect(examples[0].source).toContain('<LinkProvider component=');
  });
});

// ── Gallery Showcase Registry ──────────────────────────────────────────

/**
 * The eagerly imported showcases have to stay in step with what the
 * /components gallery actually renders first — an eager set pointing at
 * tiles further down the page would ship the chunk cost without removing
 * any loading state. These tests recompute the gallery's render order from
 * the same inputs the page uses and pin the eager set to the top of it.
 */
describe('galleryEagerShowcases', () => {
  /**
   * The gallery's category order lives in the page itself. Reading it back
   * out of the source keeps this test honest without putting a second copy
   * of the order anywhere — if the page is reordered, the expectations below
   * follow it, and the eager list is what has to catch up.
   */
  const GALLERY_PAGE = path.join(
    REPO_ROOT,
    'apps/docsite/src/app/(docs)/components/page.tsx',
  );
  const pageSource = fs.readFileSync(GALLERY_PAGE, 'utf-8');
  const categories = [
    ...pageSource
      .slice(
        pageSource.indexOf('const CATEGORIES = ['),
        pageSource.indexOf('] as const;'),
      )
      .matchAll(/'([^']+)'/g),
  ].map(m => m[1]);

  /** Mirrors the tile filtering in the same page. */
  const isGalleryComponent = (comp: ComponentEntry) =>
    !comp.isHiddenFromOverview &&
    !comp.hidden &&
    !comp.name.startsWith('use') &&
    Boolean(comp.category) &&
    comp.group !== 'Utilities';

  /** Gallery render order: categories in display order, then registry order. */
  const galleryOrder = categories.flatMap(cat =>
    (components['@astryxdesign/core'] ?? []).filter(
      c =>
        normalizeComponentCategory(c.category ?? '') === cat &&
        isGalleryComponent(c),
    ),
  );

  it('reads the gallery category order out of the page', () => {
    expect(categories.length).toBeGreaterThan(5);
    expect(categories).toContain('Action');
    expect(categories).toContain('Form Controls');
    expect(categories).not.toContain('Data Input');
    expect(galleryOrder.length).toBeGreaterThan(50);
  });

  it('renders every category some component declares', () => {
    const declared = new Set(
      (components['@astryxdesign/core'] ?? [])
        .filter(isGalleryComponent)
        .map(c => normalizeComponentCategory(c.category ?? '')),
    );
    for (const cat of declared) {
      expect(
        categories,
        `category "${cat}" has no section on the page`,
      ).toContain(cat);
    }
  });

  /**
   * The point of the eager set is that those tiles are the ones a visitor
   * sees first. If the gallery is reordered and this list isn't, the page
   * pays the chunk cost for tiles that are no longer on top and still shows
   * a skeleton for the ones that are.
   */
  it('eagerly imports exactly the tiles at the top of the gallery', () => {
    const expected = galleryOrder
      .filter(c => showcaseRegistry[c.name] != null)
      .slice(0, Object.keys(eagerShowcases).length)
      .map(c => c.name);
    expect(Object.keys(eagerShowcases)).toEqual(expected);
  });

  it('eager entries are components, not lazy loaders', () => {
    for (const [name, Component] of Object.entries(eagerShowcases)) {
      expect(Component, name).toBeTypeOf('function');
      // A lazy loader would resolve to a promise; an eager showcase is the
      // component itself and must render synchronously on the server.
      expect((Component as {$$typeof?: symbol}).$$typeof).toBeUndefined();
    }
  });

  it('every eager component also has a lazy loader', () => {
    for (const name of Object.keys(eagerShowcases)) {
      expect(showcaseRegistry[name], name).toBeDefined();
    }
  });

  it('keeps the eager set small enough to stay off the critical path', () => {
    // 12 covers a 2560x1440 viewport. Well past that and the page chunk is
    // carrying components nobody sees before they scroll.
    expect(Object.keys(eagerShowcases).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(eagerShowcases).length).toBeLessThanOrEqual(16);
  });
});
