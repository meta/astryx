// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @file Validates derivedVarRegistry stays in sync with component doc files,
 * AND detects undocumented component CSS custom properties in source files.
 *
 * Three layers of checking:
 * 1. Source scan: finds all component-level CSS vars in .tsx files
 * 2. Doc check: verifies each var is documented in the doc file's vars[]
 * 3. Registry check: verifies themeable vars have derived[] entries that
 *    match the registry
 *
 * Layers 1 and 3 each used to carry a hole that let real vars through:
 *
 * - The source scan skipped every `--_*` name outright, on the theory that a
 *   private var is "internal, not themeable". It is internal, but it is still
 *   documented — `theming.vars[]` takes `private: true` for exactly this
 *   (`--_card-radius`, `--_dropdown-menu-padding`), and the derived-var
 *   pipeline is what theme authors reach it through. Skipping the prefix meant
 *   10 private vars across 12 (component, var) sites were declared in source
 *   and documented nowhere.
 * - Layer 3 narrowed its verdict to vars matching `/radius|padding/`, so any
 *   var whose name did not happen to contain those two words was exempt from
 *   ever needing a derived[] mapping. That is now an explicit allowlist
 *   (VARS_WITHOUT_DERIVED_MAPPING) instead of a name heuristic: a new var must
 *   be given a derived[] entry or be added to the list on purpose.
 */

import {describe, it, expect} from 'vitest';
import {derivedVarRegistry, getDerivedVars} from './derivedVarRegistry';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const SRC_DIR = join(__dirname, '..');

type ComponentDocModule = {
  docs?: {
    theming?: {
      vars?: {name: string}[];
      derived?: DerivedDocEntry[];
    };
  };
};

type DerivedDocEntry = {
  property: string;
  vars?: string[];
  expand?: string;
};

// ---------------------------------------------------------------------------
// Source scanning: find CSS custom property declarations in component files
// ---------------------------------------------------------------------------

/**
 * Structural/runtime vars that are NOT component-specific theming vars.
 * These are set by JS at runtime or cascade through layout — they don't
 * belong in derived[] because they aren't things theme authors write.
 */
const STRUCTURAL_VARS = new Set([
  '--container-padding',
  '--container-padding-inline',
  '--container-padding-inline-start',
  '--container-padding-inline-end',
  '--edge-inset-start',
  '--edge-inset-end',
  '--container-padding-block-start',
  '--container-padding-block-end',
  '--container-max-height',
  '--layout-padding-inner-x',
  '--layout-padding-inner-y',
  '--layout-padding-outer-x',
  '--layout-padding-outer-y',
  '--layout-padding-own-outer-x',
  '--layout-padding-own-outer-y',
  '--layout-content-width',
  '--appshell-header-height',
  '--dialog-dir-x',
  '--dialog-dir-y',
  '--indicator-color',
  '--indicator-width',
  '--table-resize-height',
  '--table-resize-offset',
  // sticky-columns plugin: opaque backdrop (overridable) + the row overlay it
  // replays on pinned cells. Structural/runtime, not themeable design tokens.
  '--table-sticky-background',
  '--table-row-overlay',
  // The width a cell's row divider draws (0 on the last row), which a pinned
  // cell's or a detail panel's own divider reads (Table/rowDivider.ts).
  // Private runtime plumbing, never authored by a theme.
  '--_table-row-divider-width',
  '--separator-display',
  '--astryx-section-padding',
  // Private counterpart of the public token above: one ancestor Section's
  // padding, propagated down the tree. Structural, never authored by a theme.
  '--_section-padding-propagated',
  // Layout's middle row tells LayoutContent that a divider-less header or
  // footer sits beside it (Layout/layoutEdges.stylex.ts). Structural, never
  // authored by a theme.
  '--_layout-flush-block-start',
  '--_layout-flush-block-end',
]);

/**
 * Extract component-specific CSS custom property names from a source file.
 * Matches patterns like '--_card-radius': or '--_chat-composer-padding':
 * Excludes structural/runtime vars and standard token vars (--color-*,
 * --spacing-*, etc.).
 *
 * Private (`--_*`) vars are INCLUDED. They are internal in the sense that a
 * theme author does not set them directly, but they are still part of the
 * documented theming surface (`theming.vars[]` with `private: true`) and are
 * how derived[] entries connect a standard CSS property to a component.
 */
function extractComponentVars(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const varPattern = /['"](--(\w[\w-]*))['"]\s*:/g;
  const vars = new Set<string>();
  let match;

  while ((match = varPattern.exec(content)) !== null) {
    const varName = match[1];
    // Skip token vars (--color-*, --spacing-*, --radius-*, etc.)
    if (
      /^--(color|spacing|radius|shadow|duration|ease|transition|font|text|size)-/.test(
        varName,
      )
    ) {
      continue;
    }
    // Skip structural vars
    if (STRUCTURAL_VARS.has(varName)) {
      continue;
    }
    // Skip vars that start with structural prefixes
    if (/^--(container-|layout-|edge-|component-)/.test(varName)) {
      continue;
    }
    vars.add(varName);
  }
  return [...vars];
}

// ---------------------------------------------------------------------------
// Discovery: scan all component directories
// ---------------------------------------------------------------------------

interface ComponentInfo {
  dir: string;
  sourceVars: string[];
  docVars: string[];
  docDerived: {property: string; vars?: string[]; expand?: string}[];
}

function discoverComponents(): ComponentInfo[] {
  const results: ComponentInfo[] = [];
  const dirs = readdirSync(SRC_DIR, {withFileTypes: true})
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of dirs) {
    const dirPath = join(SRC_DIR, dir);
    const dirEntries = readdirSync(dirPath);
    // Find source files with component vars (.tsx and .ts, excluding tests/docs)
    const sourceFiles = dirEntries
      .filter(
        f =>
          (f.endsWith('.tsx') || f.endsWith('.ts')) &&
          !f.includes('.test.') &&
          !f.endsWith('.doc.mjs') &&
          !f.endsWith('.d.ts'),
      )
      .map(f => join(dirPath, f));

    const allVars = new Set<string>();
    for (const f of sourceFiles) {
      for (const v of extractComponentVars(f)) {
        allVars.add(v);
      }
    }

    // Only check component directories (those with a doc file named after the
    // directory). Match against the on-disk listing rather than existsSync so
    // the comparison is case-exact everywhere — on case-insensitive
    // filesystems (macOS, Windows) existsSync('theme/theme.doc.mjs') matches
    // theme/Theme.doc.mjs and pulls in a directory that CI never checks.
    if (!dirEntries.includes(`${dir}.doc.mjs`)) {
      continue;
    }
    const docPath = join(dirPath, `${dir}.doc.mjs`);

    let docVars: string[] = [];
    let docDerived: DerivedDocEntry[] = [];
    try {
      const mod = require(docPath) as ComponentDocModule;
      docVars = (mod.docs?.theming?.vars || []).map(v => v.name);
      docDerived = mod.docs?.theming?.derived || [];
    } catch {
      /* skip */
    }

    // A directory earns a check by declaring a var OR by documenting a
    // derived[] entry. Bailing on the var count alone (as this did) hid every
    // component that is themeable purely through an expansion strategy —
    // `{property: 'padding', expand: 'container'}` names no var, so such a
    // component declares nothing and its registry↔doc consistency check
    // silently never ran.
    if (allVars.size === 0 && docDerived.length === 0) {
      continue;
    }

    results.push({
      dir,
      sourceVars: [...allVars],
      docVars,
      docDerived,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Known mapping: doc dir → registry key
// ---------------------------------------------------------------------------

const DIR_TO_REGISTRY_KEY: Record<string, string> = {
  Avatar: 'avatar',
  Banner: 'banner',
  BottomSheet: 'bottom-sheet',
  Button: 'button',
  Card: 'card',
  Chat: 'chat',
  ContextMenu: 'context-menu',
  Dialog: 'dialog',
  Drawer: 'drawer',
  DropdownMenu: 'dropdown-menu',
  Field: 'field',
  HoverCard: 'hover-card',
  Item: 'item',
  NumberInput: 'number-input',
  Popover: 'popover',
  ProgressBar: 'progress-bar-mark',
  Section: 'section',
  SegmentedControl: 'segmented-control',
  TextArea: 'text-area',
};

/**
 * Vars that are intentionally set by one component for use by another
 * (cross-component vars). These are documented in the *consuming* component's
 * doc, not the *setting* component's doc.
 *
 * e.g. Carousel and Thumbnail set --_button-radius for their child Buttons,
 * but --_button-radius is documented in Button's doc.
 */
const CROSS_COMPONENT_VARS: Record<string, string[]> = {
  Carousel: ['--_button-radius'],
  Thumbnail: ['--_button-radius'],
  Chat: ['--_button-radius'],
  // AvatarGroupOverflow sets the overlap for the Avatars it lays out; Avatar
  // owns and documents it (and sets it itself when it is the group root).
  AvatarGroup: ['--_avatar-group-overlap'],
  // BreadcrumbItem tunes the DropdownMenu it opens.
  Breadcrumbs: ['--_dropdown-menu-radius', '--_dropdown-menu-padding'],
  // SelectableCard draws its selection ring through the Card shadow slot.
  SelectableCard: ['--_card-ring'],
  // Toolbar offsets the TabList indicator it hosts.
  Toolbar: ['--_tab-indicator-bottom'],
  // The destructive item variant recolors the Item it renders; Item owns,
  // documents and reads both slots.
  DropdownMenu: ['--_item-label-color', '--_item-description-color'],
  // List's edge="flush" zeroes the inline inset of the Item each ListItem
  // renders; Item owns, documents and reads it.
  List: ['--_item-inset-inline'],
  // A layer content root stops an outer Stepper's connector gap; Stepper owns,
  // documents and reads it.
  Layer: ['--step-connector-gap'],
};

/**
 * Documented vars that intentionally have NO derived[] entry — a theme author
 * cannot reach them by writing a standard CSS property, only by targeting the
 * component's own theming surface.
 *
 * This replaces a `/radius|padding/` name test that exempted every var whose
 * name did not contain those words. Each entry is a deliberate classification,
 * so a NEW var has to be argued into the list rather than slipping past on its
 * name. The list should shrink over time, not grow.
 */
const VARS_WITHOUT_DERIVED_MAPPING = new Set([
  // No standard CSS property maps onto these — they are component behaviors.
  '--button-focus-offset',
  '--button-icon-only-aspect',
  '--_avatar-group-overlap',
  '--_field-status-overlap',
  '--_codeblock-gutter-width',
  '--_tab-indicator-bottom',
  // Hit-area outset on a ::after overlay, and whether that overlay is
  // generated at all — `inset` and `content` on a pseudo-element are not
  // properties a theme author sets on the component.
  '--_thumbnail-hit-inset',
  '--_input-clear-hit-inset',
  // The interaction overlay's colour on the ::after layer of the cards:
  // written by the component's own hover and mouse `:active` arms, never a
  // value a theme author sets; the overlay colours themselves are the shared
  // interaction tokens.
  '--_press-overlay',
  // The touch press's paint at its current strength, declared once by the
  // shared overlay styles on the element the controller writes to and read
  // by whatever paints it. A theme sets `--color-overlay-pressed`, not this.
  '--_press-paint',
  '--_press-paint-image',
  '--_input-clear-hit-content',
  // Placement and swipe lifecycle values are private Toast behavior. A theme
  // author controls the surface transform/opacity as a whole, not these values.
  '--_toast-slide-y',
  '--_toast-swipe-y',
  '--_toast-swipe-exit-y',
  '--_toast-swipe-opacity',
  '--_toast-swipe-scale',
  // Indentation and row-spacing metrics: --tree-list-indent is the authorable
  // step, --_tree-indent the per-row distance TreeListItem computes from it.
  // --tree-list-row-gap is applied as half a padding-block on each row wrapper,
  // not as gap on the list, so no standard property on the tree-list target
  // maps onto it; a theme sets the var directly.
  '--tree-list-indent',
  '--_tree-indent',
  '--tree-list-row-gap',
  // Published by each treeitem while it has keyboard focus and read as its
  // row's z-index, so the focused row paints above the guide lines. Focus
  // state, not a value a theme author sets.
  '--_tree-focus-z',
  // Clipped on the ONE side each on-track connector segment faces the
  // indicator from — trailing above the node, leading below it, mirrored
  // again per axis. No standard property maps onto this purpose-based seam:
  // one clip must cover the segment and its pseudo-element fill together.
  '--step-connector-gap',
  // Composed into a single box-shadow list on the card, so neither maps 1:1
  // onto boxShadow — setting one through a derived entry would clobber the
  // other.
  '--_card-elevation',
  '--_card-ring',
  // The colour inside that composed ring, for a variant only a theme knows.
  // It is one component of one shadow in the list, so no standard property
  // maps onto it either — a theme sets it beside the fill it has to contrast.
  '--selectable-card-ring-color',
  // The spinner's ring is drawn as an SVG circle, so none of its five vars is
  // a CSS property of the element carrying the theme target: `width` and
  // `borderWidth` would name a box the ring is not, a `color` mapping would
  // take the label's text color with it, and the arc fraction is a pure
  // dash-length multiplier with no standard property to attach to. They are
  // public vars a theme sets directly under a size- or shade-variant key.
  '--spinner-diameter',
  '--spinner-stroke-width',
  '--spinner-color',
  '--spinner-track-color',
  '--spinner-arc-fraction',
  // Set by a PARENT component (e.g. the destructive dropdown/context menu
  // item) to recolor the two text lines it renders. A single standard `color`
  // property cannot map onto both lines, and the root color is not what they
  // control — a theme reaches them by setting the vars directly.
  '--_item-label-color',
  '--_item-description-color',
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('component CSS vars are documented and themeable', () => {
  const components = discoverComponents();

  for (const {dir, sourceVars, docVars, docDerived} of components) {
    const crossVars = new Set(CROSS_COMPONENT_VARS[dir] || []);

    it(`${dir}: all source vars are in doc file`, () => {
      const undocumented = sourceVars.filter(
        v => !docVars.includes(v) && !crossVars.has(v),
      );
      expect(
        undocumented,
        `${dir} has undocumented CSS vars in source: ${undocumented.join(', ')}. ` +
          `Add them to ${dir}.doc.mjs theming.vars[] and add a derived[] ` +
          `entry mapping the standard CSS property to the internal var.`,
      ).toEqual([]);
    });

    it(`${dir}: documented vars have derived entries for theming`, () => {
      // Every var that maps to a standard CSS property should have a
      // derived entry so theme authors can write standard CSS.
      const derivedVarNames = new Set(docDerived.flatMap(d => d.vars || []));
      const derivedExpands = docDerived
        .filter(d => d.expand)
        .map(d => d.expand);
      const hasContainerExpand = derivedExpands.includes('container');

      const missingDerived = docVars.filter(varName => {
        // Cross-component vars are handled by the owning component
        if (crossVars.has(varName)) {
          return false;
        }
        // Check if this var is covered by a derived entry
        if (derivedVarNames.has(varName)) {
          return false;
        }
        // Container expansion covers padding-related vars
        if (hasContainerExpand && varName.includes('padding')) {
          return false;
        }
        return true;
      });

      // Everything that is not explicitly classified as unmappable must have
      // a derived[] entry. (This was a `/radius|padding/` name test, which
      // exempted any var whose name lacked those words.)
      const themeableVars = missingDerived.filter(
        v => !VARS_WITHOUT_DERIVED_MAPPING.has(v),
      );

      expect(
        themeableVars,
        `${dir} has vars that should be themeable via derived[]: ${themeableVars.join(', ')}. ` +
          `Add derived[] entries in ${dir}.doc.mjs mapping standard CSS ` +
          `properties (borderRadius, padding) to these internal vars — or, if ` +
          `no standard property maps onto them, add them to ` +
          `VARS_WITHOUT_DERIVED_MAPPING with the reason.`,
      ).toEqual([]);
    });
  }
});

describe('derivedVarRegistry ↔ doc file consistency', () => {
  const components = discoverComponents();

  for (const {dir, docDerived} of components) {
    const key = DIR_TO_REGISTRY_KEY[dir];
    if (!key || docDerived.length === 0) {
      continue;
    }

    it(`${dir} (${key}): registry matches doc derived`, () => {
      const registryEntries = derivedVarRegistry[key];
      expect(registryEntries).toBeDefined();
      expect(registryEntries).toEqual(docDerived);
    });
  }

  // Catch new doc files with derived that have no registry key mapping
  it('every doc with theming.derived has a registry mapping', () => {
    const missing: string[] = [];
    for (const {dir, docDerived} of components) {
      if (docDerived.length === 0) {
        continue;
      }
      const key = DIR_TO_REGISTRY_KEY[dir];
      if (!key) {
        missing.push(
          `${dir}: has theming.derived but no DIR_TO_REGISTRY_KEY mapping. ` +
            `Add the mapping and a derivedVarRegistry entry.`,
        );
      } else if (!derivedVarRegistry[key]) {
        missing.push(
          `${dir} (${key}): has theming.derived but no derivedVarRegistry entry.`,
        );
      }
    }
    expect(missing).toEqual([]);
  });

  it('registry has no orphan entries', () => {
    const validKeys = new Set(Object.values(DIR_TO_REGISTRY_KEY));
    const orphans = Object.keys(derivedVarRegistry).filter(
      k => !validKeys.has(k),
    );
    expect(orphans).toEqual([]);
  });
});

describe('getDerivedVars', () => {
  it('returns matching entries for card borderRadius', () => {
    const result = getDerivedVars('card', 'borderRadius');
    expect(result).toHaveLength(1);
    expect(result[0].vars).toEqual(['--_card-radius']);
  });

  it('returns empty for unknown component', () => {
    expect(getDerivedVars('unknown', 'borderRadius')).toEqual([]);
  });

  it('does not resolve removed target aliases', () => {
    expect(getDerivedVars('hovercard', 'borderRadius')).toEqual([]);
    expect(getDerivedVars('textarea', 'paddingInline')).toEqual([]);
    expect(getDerivedVars('progressbar-mark', 'width')).toEqual([]);
  });

  it('returns empty for unregistered property', () => {
    expect(getDerivedVars('card', 'color')).toEqual([]);
  });

  it('marks text-area paddingInline as replacing the source property', () => {
    const result = getDerivedVars('text-area', 'paddingInline');
    expect(result).toHaveLength(1);
    expect(result[0].vars).toEqual(['--_textarea-inline-padding']);
    expect(result[0].replaces).toBe(true);
  });

  it('marks progress-bar-mark width and height as replacing the source property', () => {
    for (const [property, varName] of [
      ['width', '--_progressbar-mark-width'],
      ['height', '--_progressbar-mark-height'],
    ]) {
      const result = getDerivedVars('progress-bar-mark', property);
      expect(result).toHaveLength(1);
      expect(result[0].vars).toEqual([varName]);
      expect(result[0].replaces).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Read check: a registered var nothing reads is a dead theming knob
// ---------------------------------------------------------------------------

/**
 * Every source file under packages/core/src, concatenated once.
 *
 * `--_popover-radius` shipped documented and registered while `usePopover`
 * hardcoded its radius, so `popover: {borderRadius}` set a var no element ever
 * read. Sync between source, docs and registry cannot catch that: the three
 * agreed with each other, and none of them required a reader.
 */
function readAllSource(dir: string): string {
  let out = '';
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out += readAllSource(path);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.includes('.test.') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out += readFileSync(path, 'utf-8');
    }
  }
  return out;
}

describe('registered derived vars are read by component styles', () => {
  const source = readAllSource(SRC_DIR);

  for (const [component, entries] of Object.entries(derivedVarRegistry)) {
    for (const varName of entries.flatMap(e => e.vars ?? [])) {
      it(`${component}: ${varName} is read via var()`, () => {
        expect(
          source.includes(`var(${varName})`) ||
            source.includes(`var(${varName},`),
          `${varName} is registered as the derived var for a CSS property on ` +
            `\`${component}\`, but no component reads it. A theme setting that ` +
            `property would write a var nothing consumes. Read it in the ` +
            `element's StyleX styles, or drop the derived entry.`,
        ).toBe(true);
      });
    }
  }
});
