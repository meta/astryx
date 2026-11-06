// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template doc types.
 */

import type {
  AuthoredDocGraphFields,
  RegistryDocIdentity,
} from '../base/type.js';

export interface BaseTemplateDoc extends AuthoredDocGraphFields {
  /** Identifier name for the template. For block templates this matches
   *  the React component import name (e.g. `"ChatMessageMetadata"`); for
   *  page templates it's a human-readable label that doubles as the
   *  display value (e.g. `"Dashboard"`). */
  name: string;
  /** Human-readable display name for the gallery / CLI. Matches `name`
   *  for already-spaced template names (e.g. `"Blank Page"`); for block
   *  templates that mirror a PascalCase component, spaces it out
   *  (`"ChatMessageMetadata"` → `"Chat Message Metadata"`). Required so
   *  authors stay in control of the visible label rather than relying
   *  on a build-time regex derivation. */
  displayName: string;

  /** One-sentence description of what the template provides. */
  description?: string;

  /** Search keywords for CLI discovery: the ideas, domains, and other names a
   *  builder might use for what this template serves (e.g. `['monitoring',
   *  'uptime', 'on-call']` for a service-health dashboard). Lowercase.
   *  `astryx search` matches them as it matches the description, and
   *  `astryx build` ranks page templates on them, so the `description` can
   *  stay a description of the layout. Integration templates need
   *  `@astryxdesign/cli` 0.6.6 or later: earlier CLIs reject the field and
   *  drop that template, and CLIs before 0.6.4 also hide the package's doc
   *  topics. */
  keywords?: string[];

  /** Optional stable slug override and prior aliases for registry output. */
  registry?: RegistryDocIdentity;

  /** Integration templates only: the exact id of the Core template this one
   *  replaces for unqualified lookup (find it with
   *  `astryx --json template --list --package @astryxdesign/core`). The Core
   *  original stays selectable with `--package @astryxdesign/core`. Needs
   *  `@astryxdesign/cli` 0.6.4 or later: earlier CLIs reject the field,
   *  drop that template, and hide the package's doc topics. */
  replaces?: string;
  /** Whether this template is ready for use. Templates with
   *  isReady: false show as "(WIP)" in the gallery and CLI. */
  isReady?: boolean;

  /** The icon definition each icon the source imports draws
   *  (`{TrashIcon: 'delete'}`), keyed by the name a named import reads
   *  (`{Trash as TrashIcon}` is `Trash`) or a default import's local name
   *  (`import DeleteIcon from …` is `DeleteIcon`). When the project has an
   *  icon set, each declared icon is replaced by the set's icon for that
   *  definition (`astryx docs cli/experimental/icon-definitions`), and every
   *  key is reported as mapped or kept. A name imported from two modules
   *  (`TrashIcon` from an outline and a solid module) needs one key.
   *  @experimental May change or be removed in a patch release. */
  icons?: Record<string, string>;

  /** Whether this template is a scaffolding tool only (e.g. blank page).
   *  Scaffold templates are available via the CLI but hidden from
   *  browsable template galleries like the craft browser. */
  scaffold?: boolean;

  /** Functional category for the docsite Templates overview gallery.
   *  Templates are grouped by the part before `" - "` (e.g. `"Dashboard"`).
   *  Independent of CLI discovery, which uses `name`/`description`. */
  category?: TemplateCategory;

  /** Boolean opt-out for templates that shouldn't appear on the Templates
   *  overview gallery. The template stays available via the CLI and
   *  `astryx template <name>` — it's only hidden from the browsable gallery.
   *  Use for duplicate/experimental variants. Scaffold templates are
   *  hidden automatically and don't need this flag. */
  isHiddenFromOverview?: boolean;
}

export interface BlockTemplateDoc extends BaseTemplateDoc {
  type: 'block';
  /** The component this block is an example of. When omitted, the block is a
   *  standalone composition and is not owned by any component doc page. */
  exampleFor?: string;
  /** Additional component or hook doc pages whose Examples section should
   *  include this block. Use when a component example is also the canonical
   *  usage example for one of that component's hooks. */
  alsoExampleFor?: string[];
  /** Additional component or hook doc pages whose hero showcase should reuse
   *  this block. Unlike `isShowcase`, this does not make the block the primary
   *  showcase for `exampleFor`; it only creates explicit secondary placements. */
  alsoShowcaseFor?: string[];
  /** Width-to-height ratio for preview containers (e.g. 16/9, 1, 3/4). */
  aspectRatio: number;
  /** Scale factor for the block preview (default 1). */
  scale?: number;
  /** Component names this block uses, for cross-referencing.
   *  Powers "See also" and "Used in" sections — not for primary attribution. */
  componentsUsed?: string[];
  /** When true this block is the canonical hero showcase for `exampleFor`.
   *  Requires `exampleFor`; standalone blocks cannot be component showcases. */
  isShowcase?: boolean;
}

export interface PageTemplateDoc extends BaseTemplateDoc {
  type: 'page';
}

/**
 * Functional category for a page template, used to group templates on the
 * docsite Templates overview gallery. Independent of any sidebar/nav grouping.
 *
 * Values follow a `"Group - Variant"` convention (e.g. `"Dashboard - Analytics"`).
 * The overview page derives the group heading from the text before the `" - "`.
 * Standalone values without a hyphen (e.g. `"Settings"`) are their own group.
 *
 * Not every value maps to an existing template — unused values are reserved
 * for future templates so authors get autocomplete for the full taxonomy.
 */
export type TemplateCategory =
  // Dashboard
  | 'Dashboard - Analytics'
  | 'Dashboard - Comparison'
  | 'Dashboard - KPI Summary'
  | 'Dashboard - Monitoring'
  | 'Dashboard - Executive Summary'
  | 'Dashboard - Scorecard'
  | 'Dashboard - Widget Grid'
  | 'Dashboard - Split'
  | 'Dashboard - Tabbed'
  | 'Dashboard - Filterable'
  | 'Dashboard - Portfolio'
  | 'Dashboard - Project Status'
  | 'Dashboard - Funnel & Cohort'
  // Table
  | 'Table - Basic'
  | 'Table - Grouped'
  | 'Table - Index/Detail'
  | 'Table - Split Pane'
  | 'Table - Bulk Actions'
  | 'Table - Filtering'
  | 'Table - Tree/Hierarchical List'
  | 'Table - Frozen Column'
  | 'Table - Comparison'
  | 'Table - Chart'
  | 'Table - Heatmap'
  // Form
  | 'Form - Basic'
  | 'Form - Page'
  | 'Form - Checkout'
  | 'Form - Two-column'
  | 'Form - Wizard'
  | 'Form - Wizard Dialog'
  | 'Form - Wizard Inline'
  | 'Form - Wizard Vertical'
  | 'Form - Modal Overlay'
  | 'Form - Side Sheet'
  | 'Form - Inline Edits'
  | 'Form - Settings'
  // Settings
  | 'Settings'
  | 'Settings - Dialog'
  | 'Settings - Sidebar'
  | 'Settings - Panels'
  | 'Settings - Form'
  // Login
  | 'Login - Basic'
  | 'Login - Card'
  | 'Login - SSO'
  | 'Login - Split'
  // Tools
  | 'Tools - Canvas Editor'
  | 'Tools - File Explorer'
  | 'Tools - Page Editor'
  | 'Tools - IDE'
  | 'Tools - Incident Console'
  | 'Tools - Kanban Board'
  | 'Tools - Notebook/Report Page'
  | 'Tools - Diff Compare Viewer'
  | 'Tools - Search Results Page'
  // Content
  | 'Content - Card Grid'
  | 'Content - Order Detail'
  | 'Content - Product Detail'
  | 'Content - Work Item Detail'
  | 'Content - Product List'
  | 'Content - Documentation Catalog'
  | 'Content - Documentation Design'
  | 'Content - Documentation Technical'
  | 'Content - Infinite Scroll Page'
  | 'Content - Timeline'
  | 'Content - Profile Page'
  // AI Chat
  | 'AI Chat - Conversation'
  | 'AI Chat - Landing'
  | 'AI Chat - Artifact Page'
  // Gallery
  | 'Gallery - Hero'
  | 'Gallery - Basic'
  | 'Gallery - Mixed'
  | 'Gallery - Side'
  | 'Gallery - Product'
  // Shell
  | 'Shell - Left Sidebar'
  | 'Shell - Top Nav'
  | 'Shell - Top Nav + Left Sidebar'
  | 'Shell - Breadcrumb Driven Layout'
  | 'Shell - Messaging'
  | 'Shell - Blank';

export type TemplateDoc = PageTemplateDoc | BlockTemplateDoc;

/** A page template an integration package ships, with its own `category`. */
export interface IntegrationPageTemplateDoc extends Omit<
  PageTemplateDoc,
  'category'
> {
  category?: string;
}

/** A block template an integration package ships, with its own `category`. */
export interface IntegrationBlockTemplateDoc extends Omit<
  BlockTemplateDoc,
  'category'
> {
  category?: string;
}

/** The doc-type for an integration package's template metadata: TemplateDoc,
 *  with `category` the package's own string (bare `astryx template` groups
 *  the package's templates by it) instead of a TemplateCategory value. */
export type IntegrationTemplateDoc =
  IntegrationPageTemplateDoc | IntegrationBlockTemplateDoc;
