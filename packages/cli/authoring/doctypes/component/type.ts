// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component doc types (ComponentDoc + its field/variant types).
 */

import type {
  AuthoredDocGraphFields,
  ComponentAccessibilityRequirement,
  ComponentAnatomyElement,
  ComponentBestPractice,
  ComponentExampleDoc,
  ComponentPlaygroundConfig,
  ComponentPropDoc,
  ComponentThemingDerivedVar,
  ComponentThemingTarget,
  ComponentThemingVar,
  HookParamDoc,
  HookReturnDoc,
  RegistryDocIdentity,
  UsageDoc,
} from '../base/type.js';

/**
 * Shared fields between single-component and multi-component docs.
 * Do not use this interface directly — use `ComponentDoc` (the union type).
 */
export interface ComponentBaseDoc extends AuthoredDocGraphFields {
  /** Doc-kind discriminant for the stamped default-export format
   *  (`export default { type: 'component', ... }`). Optional: legacy
   *  `export const docs = {...}` docs omit it, and `parseDoc` falls back to
   *  shape-sniffing when it is absent. */
  type?: 'component';
  /**
   * Stable machine identity and directory name without the Astryx prefix,
   * PascalCase (for example `Button`, `Table`, or `AppShell`). For an
   * integration component it is the export apps import: the doc sits beside
   * the file that exports it, and when that file exports nothing under its own
   * name, `name` may name the export it does have. Do not change this to edit
   * the visible label; use `displayName` for that. Registry URLs derive from
   * this value by default.
   */
  name: string;
  /** Human-readable display name with spaces between words, used by the
   *  docsite gallery and sidebar. Matches the import name visually (so
   *  `"AppShell"` → `"App Shell"`, `"ChatMessageMetadata"` → `"Chat
   *  Message Metadata"`). Required so authors stay in control of how
   *  each component reads in the UI rather than relying on a build-time
   *  regex derivation. Backfill with
   *  `apps/docsite/scripts/backfill-display-name.mjs`. */
  displayName: string;
  /** Exact consumer import specifier for integration-owned components. */
  import?: string;
  /** Integration components only: the exact `name` of the Core ComponentDoc
   *  this component takes over for unqualified lookup, so every app that loads
   *  the integration gets this component from component detail, component
   *  lists, search, `swizzle <Name>`, and issue routing; `swizzle --list` keeps
   *  listing Core names. The Core original stays reachable with
   *  `--package @astryxdesign/core`. Set it only to intentionally own a Core
   *  identity; give an alternative or variant its own name instead. It takes
   *  effect only when the package's peer range starts at the release that
   *  applies it, `"@astryxdesign/cli": ">=0.6.7"` or later; without such a
   *  range, and on older CLIs that do not read `replaces`, the component keeps
   *  its own name. */
  replaces?: string;
  /** Search keywords for CLI discovery. Terms a developer might type when
   *  looking for this component: synonyms, related UI concepts, and common
   *  names from other design systems (MUI, Chakra, Radix, and others).
   *  Lowercase only. Used by `astryx component <term>` for fuzzy matching.
   *  e.g. `['accordion', 'expand', 'toggle', 'disclosure']` for Collapsible */
  keywords?: string[];
  /** Sub-component names to hide from human-facing UI (CLI listings,
   *  docs catalogs). The components stay public and importable — agents
   *  and tooling can still discover them via source. Use when the
   *  directory's doc covers a group but some Astryx*.tsx files shouldn't
   *  appear in the catalog. */
  hiddenComponents?: string[];
  /** Hide this entire component from human-facing UI (CLI listings,
   *  docs catalogs). The component stays public and importable — agents
   *  and tooling can still discover it via source. Use for shared
   *  primitives (NavIcon, NavMenu) that only make sense in the context
   *  of their parent compositions. */
  hidden?: boolean;
  /** Optional group for sidebar/docs organization.
   *  Components without a group appear flat in alphabetical order.
   *  Groups cluster related components that are always used together
   *  or are variants of each other. */
  group?: string;
  /** Component category for the overview page gallery. Independent of
   *  `group` (which is for the sidebar). Categories represent the
   *  component's functional role in a UI.
   *
   *  Valid values:
   *  - `'Action'` — interactive triggers: buttons, links, toggles, menus
   *  - `'Chat'` — conversational UI: messages, composers, layouts
   *  - `'Container'` — wrappers: cards, carousels, collapsibles
   *  - `'Content'` — display: text, icons, avatars, code blocks
   *  - `'Form Controls'` — data entry: text fields, selectors, date pickers
   *  - `'Data Input'` — deprecated compatibility alias for `'Form Controls'`
   *  - `'Data Visualization'` — charts, graphs, 3D visualizations
   *  - `'Feedback & Status'` — progress indication: spinners, banners, badges
   *  - `'Layout'` — structural: grid, stack, dividers, app shell
   *  - `'Navigation'` — wayfinding: tabs, breadcrumbs, sidebars
   *  - `'Overlay'` — layered UI: dialogs, popovers, tooltips
   *  - `'Table & List'` — tabular and list data display
   *  - `'Utility'` — providers and context: themes, link providers */
  category?:
    | 'Action'
    | 'Chat'
    | 'Container'
    | 'Content'
    | 'Form Controls'
    | 'Data Input'
    | 'Data Visualization'
    | 'Feedback & Status'
    | 'Layout'
    | 'Navigation'
    | 'Overlay'
    | 'Table & List'
    | 'Utility';
  /** When true, this component is excluded from the categorized overview
   *  page but remains in the sidebar and CLI. Use for sub-components that
   *  only make sense within a parent (e.g. BreadcrumbItem, DialogHeader)
   *  or internal primitives that shouldn't appear in the gallery. */
  isHiddenFromOverview?: boolean;
  /** Optional stable slug override and prior aliases for registry output. */
  registry?: RegistryDocIdentity;
  /** Theming configuration. Documents the stable selector surface rendered
   *  by this component: `xds-*` classes plus data-attribute reflections that
   *  themes can target via `@scope` selectors in `defineTheme`. */
  theming?: {
    /** Whether this component is a container whose `padding` properties
     *  should be mapped to container tokens by the theme pipeline.
     *  When true, `padding`, `paddingBlock`, `paddingInline` etc. in
     *  component overrides are expanded to `--container-padding-*` and
     *  `--layout-padding-*` tokens instead of emitting raw CSS. */
    container?: boolean;
    /** Selector targets rendered by this component.
     *  Each entry corresponds to an `themeProps()` call in the source. */
    targets: ComponentThemingTarget[];
    /** CSS custom properties exposed for theming. */
    vars?: ComponentThemingVar[];
    /** Maps standard CSS properties to internal vars for theme pipeline
     *  expansion. Ordered by priority — earlier entries emit first.
     *  The pipeline reads this to know: when a theme sets `borderRadius`
     *  on this component, also emit the internal var.
     *  @see ComponentThemingDerivedVar */
    derived?: ComponentThemingDerivedVar[];
  };
  /** Component usage documentation — concise summary, best practices,
   *  and optional visual anatomy. */
  usage: UsageDoc;
  /** Short code examples rendered by the CLI after the props table. */
  examples?: ComponentExampleDoc[];

  /** Playground configuration. Controls how the interactive preview
   *  renders this component with sensible defaults and slot content. */
  playground?: ComponentPlaygroundConfig;
}

/**
 * The documentation type for a component directory's {Name}.doc.mjs file.
 *
 * Every new .doc.mjs default-exports a stamped object of this type:
 *
 *   /\*\* \@type \{import('@astryxdesign/cli/authoring').ComponentDoc\} *\/
 *   export default \{ type: 'component', ... \};
 *
 * Use SingleComponentDoc (with `props`) for single-component directories.
 * Use MultiComponentDoc (with `components`) for multi-component directories.
 * Use SubComponentDoc (with `subComponentOf`) for a sub-component that lives
 * in its own file inside its parent's directory.
 */
export type ComponentDoc =
  SingleComponentDoc | MultiComponentDoc | SubComponentDoc;

/**
 * Documents one component within a multi-component directory. Used when a
 * directory exports multiple public components (e.g. Table exports Table,
 * BaseTable, TableRow, TableCell, TableHeaderCell).
 *
 * Also use for hooks that are part of a component API (e.g.
 * useTableSelection). For hook entries, document arguments in `params`
 * and return fields in `returns` so the docsite renders a Parameters / Returns
 * signature instead of an interactive Properties playground. Order components
 * with the primary/most-used component first.
 */
export interface ComponentEntry {
  /** Full export name including Astryx prefix. e.g. `"TableRow"`,
   *  `"DialogHeader"`, `"useTableSelection"` */
  name: string;
  /** Human-readable display name for this subcomponent. Matches the import
   *  name visually with spaces between PascalCase / camelCase words
   *  (e.g. `"TableRow"` → `"Astryx Table Row"`). See `ComponentBaseDoc.displayName`. */
  displayName: string;
  /** One-sentence description of what this specific component does.
   *  For sub-components, explain the role within the parent composition. */
  description: string;
  /** Optional stable slug override and prior aliases for this entry. */
  registry?: RegistryDocIdentity;
  /** All public props for this component. Omit for hook entries. */
  props?: ComponentPropDoc[];
  /** Hook parameters or options object fields. Use for `use*` entries. */
  params?: HookParamDoc[];
  /** Hook return value fields. Use for `use*` entries. */
  returns?: HookReturnDoc[];
  /** Usage documentation for this specific component or hook. */
  usage?: UsageDoc;
  /** Components this hook is commonly used with. */
  relatedComponents?: string[];
  /** Other hooks this hook is commonly used with. */
  relatedHooks?: string[];
  /** Short code examples rendered by the CLI after the props table. */
  examples?: ComponentExampleDoc[];
  /** When true, this sub-component is excluded from the overview page. */
  isHiddenFromOverview?: boolean;
  /** Playground configuration for this specific component. Falls back to
   *  the directory doc's `playground` when omitted — declare one here when
   *  siblings must not share it (e.g. an overlay drawer whose toggle
   *  sub-component should not inherit `overlay: true`). */
  playground?: ComponentPlaygroundConfig;
}

/**
 * Metadata for a component group that is NOT itself a component.
 *
 * Some groups (e.g. 'Checkbox', 'Layout', 'Tabs') are category labels —
 * they cluster related components but have no corresponding Astryx*.tsx file.
 * This metadata tells the docsite and CLI which component to treat as the
 * canonical entry point for the group.
 *
 * Groups whose name IS a component (e.g. 'Avatar', 'Button', 'Dialog')
 * don't need an entry here — the component IS the canonical representative.
 *
 * @example
 * ```
 * { name: 'Checkbox', canonical: 'CheckboxList', description: 'Selection controls for choosing one or more options from a set.' }
 * { name: 'Layout', canonical: 'Stack', description: 'Structural primitives for page and content layout.' }
 * ```
 */
export interface ComponentGroupDoc {
  /** Group name — must match one of the `group` union values on ComponentBaseDoc. */
  name: string;
  /** The canonical component for this group — the one the docsite links
   *  to when a user clicks the group name. Should be the most commonly
   *  used or most representative component in the group.
   *  e.g. `'CheckboxList'` for the Checkbox group. */
  canonical: string;
  /** One-sentence description of what this group of components does.
   *  Shown in the sidebar, catalog, or group landing page. */
  description: string;
}

/**
 * A cross-link reference to a sub-component that lives in its own sibling
 * `{Name}.doc.mjs` file (see {@link SubComponentDoc}). The parent's
 * `components` array lists these names so the family stays discoverable;
 * the entry's content is emitted from the sub-component's own file, not here.
 */
export interface ComponentRef {
  /** Full export name including Astryx prefix, e.g. `"ChatComposer"`. Must
   *  match the `name` field of the referenced sub-component's own doc. */
  name: string;
}

/**
 * Translation overlay for component documentation.
 *
 * Contains only the prose fields that change between languages/formats.
 * The CLI merges this onto the base `docs` at read time — props,
 * types, defaults, and code all come from `docs`.
 *
 * Used by both `docsZh` (Chinese translation) and `docsDense` (compressed format).
 */
export interface ComponentTranslationDoc {
  /** Optional exact name from the base doc. Allowed so an overlay can say
   *  which component it translates; the overlay renders through the base
   *  doc, so this field is ignored at render time. */
  name?: string;
  /** Optional translated displayName. Allowed so the displayName backfill
   *  codemod (which adds `displayName` next to every `name:` field) does not
   *  break translation overlays. Ignored at render time. */
  displayName?: string;
  /** Compressed/translated component description. */
  description?: string;
  /** Prop descriptions keyed by prop name. Only include props that have descriptions. */
  propDescriptions?: Record<string, string>;
  /** Translated/compressed usage overlay. Mirrors UsageDoc fields. */
  usage?: {
    description?: string;
    bestPractices?: ComponentBestPractice[];
    accessibility?: ComponentAccessibilityRequirement[];
    anatomy?: ComponentAnatomyElement[];
  };
  /** Sub-component translations. Must match docs.components length and order (if present). */
  components?: {
    /** Exact name from docs.components[n].name */
    name: string;
    /** Optional translated displayName for the sub-component. Allowed so
     *  the displayName backfill codemod (which adds `displayName` next
     *  to every `name:` field) does not break translation overlays.
     *  Translation overlays render via the canonical docs, so this
     *  field is ignored at render time. */
    displayName?: string;
    /** Compressed/translated sub-component description. */
    description: string;
    /** Prop descriptions keyed by prop name. */
    propDescriptions?: Record<string, string>;
    /** When true, this sub-component is excluded from the overview page. */
    isHiddenFromOverview?: boolean;
  }[];
}

/**
 * Documentation for a directory that exports multiple public components.
 * Props live on each entry in `components`.
 *
 * Use this when the directory has multiple `XDS*.tsx` files
 * (e.g. Table, Dialog, TabList, TopNav, Layout).
 *
 * Each `components` entry is either a full {@link ComponentEntry} (inline
 * sub-component) or a name-only {@link ComponentRef} pointing at a sibling
 * `{Name}.doc.mjs` file. The two styles can be mixed during migration.
 */
export interface MultiComponentDoc extends ComponentBaseDoc {
  /** Each public component/hook exported from this directory — either an
   *  inline entry or a name-only reference to a sibling sub-component doc. */
  components: (ComponentEntry | ComponentRef)[];
}

/**
 * Documentation for a directory that exports a single primary component.
 * Props live directly on this object.
 *
 * Use this when the directory has one main `XDS*.tsx` file
 * (e.g. Switch, Badge, Spinner, TextInput).
 */
export interface SingleComponentDoc extends ComponentBaseDoc {
  /** All public props for the component. */
  props: ComponentPropDoc[];
}

/**
 * Documentation for a single sub-component that lives in its own
 * `{Name}.doc.mjs` file inside its parent's directory. Identified by the
 * `subComponentOf` field, which names the parent component.
 *
 * A sub-component owns its `description`, `props`, and (optionally) its own
 * `usage`. The CLI does not copy family-level fields (`group`, `category`,
 * `keywords`, `theming`, `playground`) from the parent to an integration's
 * sub-component: its detail, list group and search use only what its own doc
 * sets. Set any the child needs in its own doc. The generated registry entry
 * is identical to the legacy inline `components[]` expansion — this is purely
 * a file-structure change.
 */
export interface SubComponentDoc extends Omit<ComponentBaseDoc, 'usage'> {
  /** Name of the parent component this sub-component belongs to, matching the
   *  parent doc's `name` (e.g. `"Chat"`). Marks this file as a sub-component
   *  doc. The CLI does not copy the parent's family fields to it. */
  subComponentOf: string;
  /** One-sentence description of what this sub-component does and its role
   *  within the parent composition. */
  description: string;
  /** All public props for this sub-component. */
  props: ComponentPropDoc[];
  /** Usage is optional for sub-components — when omitted, generated surfaces
   *  should use the sub-component's own description as the concise usage
   *  summary (not inherited from the parent, which was the #2602 bug). */
  usage?: UsageDoc;
}
