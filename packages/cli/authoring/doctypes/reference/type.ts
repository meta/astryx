// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reference/topic doc types.
 */

import type {AuthoredDocGraphFields} from '../base/type.js';

/** One step in a renderer-neutral workflow. */
export interface WorkflowStep {
  title: string;
  description?: string;
  /** Stable doc references that supply detail for this step. */
  references?: string[];
}

/** Ordered procedural guidance. */
export interface WorkflowDocBlock {
  type: 'workflow';
  title?: string;
  steps: WorkflowStep[];
}

/** A generated view over docs placed in one namespace slot. */
export interface CollectionDocBlock {
  type: 'collection';
  title?: string;
  source: {slot: string};
  presentation?: 'list' | 'cards' | 'compact';
  whenEmpty?: 'show' | 'omit';
}

/**
 * A bounded projection of one canonical doc. In a namespace doc's `blocks` it
 * is layout the docs tree renders later. In a topic section, a read includes
 * the doc it names in place of the block: a schema, command, function, or
 * enum doc as `astryx docs` prints it (`projection.fields` keeps only those
 * fields of a schema), then the command that opens that doc. Any other doc
 * shows its title and summary.
 */
export interface ReferenceDocBlock {
  type: 'reference';
  /** The doc it names, by identity: `[<provider>:]<kind>:<name>`. */
  target: string;
  projection?: {
    fields?: string[];
    sections?: string[];
  };
  /** `summary`: only the doc's title, summary, and the command that opens it.
   *  `compact`: the included doc without its code blocks. `full`, the default:
   *  the included doc. */
  presentation?: 'summary' | 'compact' | 'full';
}

/** Graph-only content blocks, for a namespace doc's `blocks`. These are
 * additive and do not widen the stable {@link ReferenceContentBlock} union
 * consumed by existing exhaustive renderers. A topic section accepts the
 * `reference` block too, and a read inlines it as stable blocks. */
export type GraphContentBlock =
  WorkflowDocBlock | CollectionDocBlock | ReferenceDocBlock;

/**
 * A content block within a reference doc section.
 * Ordered arrays of these blocks form renderer-neutral documentation content.
 * A new semantic kind must ship with every renderer or fail visibly at a legacy
 * reader boundary until that renderer is available.
 *
 * @example
 * ```
 * { type: 'prose', text: 'Spacing tokens control gap and padding...' }
 * { type: 'heading', level: 3, text: 'Examples' }
 * { type: 'code', lang: 'tsx', code: 'padding: spacingVars[...]' }
 * { type: 'table', headers: ['Token', 'Value'], rows: [['--spacing-4', '16px']] }
 * { type: 'list', style: 'do', items: ['Use semantic tokens'] }
 * { type: 'token-ref', topic: 'tokens', section: 'Color Tokens' }
 * { type: 'prose', text: 'Check it with {@link command:doctor}.' }
 * ```
 */
export type ReferenceContentBlock =
  /** Text. `{@link [<provider>:]<kind>:<name>}` inside it links another doc
   *  by identity; `astryx docs` prints the command that opens that doc. */
  | {type: 'prose'; text: string}
  | {type: 'heading'; level: 3 | 4 | 5 | 6; text: string}
  | {type: 'code'; lang: string; code: string; label?: string}
  | {type: 'table'; headers: string[]; rows: string[][]}
  | {
      type: 'list';
      style: 'ordered' | 'unordered' | 'do' | 'dont';
      items: string[];
    }
  | {
      /** Reference to a token table in another doc topic.
       *  The CLI resolves this at read time and inlines the referenced
       *  section's table. The docsite can render it with live theme values
       *  and type-specific previews instead of static strings. */
      type: 'token-ref';
      /** Doc topic name containing the tokens. e.g. `'tokens'` */
      topic: string;
      /** Section title to pull from that topic. e.g. `'Color Tokens'` */
      section: string;
    };

/**
 * A reference documentation file (.doc.mjs).
 *
 * Reference docs cover topics like design tokens, principles, theming,
 * patterns, accessibility, and migration guides. Unlike ComponentDoc,
 * they aren't tied to a specific component — just drop a .doc.mjs file
 * in the docs/ directory and it shows up in `astryx docs`.
 *
 * Every new reference .doc.mjs default-exports a stamped object:
 *
 *   /** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} *\/
 *   export default { type: 'generic', ... };
 */
export interface ReferenceDoc extends AuthoredDocGraphFields {
  /** Doc-kind discriminant for the stamped default-export format
   *  (`export default { type: 'generic', ... }`). Optional: legacy
   *  `export const docs = {...}` docs omit it. The value stays `'generic'`
   *  (the reference/topic discriminant). */
  type?: 'generic';
  /** URL-safe identifier, used as the CLI topic name. e.g. 'tokens', 'principles' */
  name: string;
  /** Human-readable title. e.g. 'All Tokens' */
  title: string;
  /** One-line summary shown in topic listings. */
  description: string;
  /** Navigation category: 'guide' or 'foundations'. */
  category?: string;
  /** Words a reader may search for that the title and sections do not use:
   *  a synonym, a task ("dark mode"), or another library's name for the same
   *  thing. `astryx search` matches each as a keyword of the whole topic, so
   *  an exact one ranks the topic like its own title does. */
  keywords?: string[];
  /** Name of an existing topic this doc takes the place of. Authored by an
   *  integration whose guide should be served instead of the built-in one —
   *  `replaces: 'getting-started'` on a doc named `getting-started` swaps the
   *  content, and on a doc named something else swaps it and leaves the old
   *  name as an alias, so `astryx docs getting-started` still resolves.
   *  A route (`'authoring/quick-start'`) names a guide the docs tree
   *  places: readers who open that route get this doc.
   *  Ignored on a built-in topic (there is nothing above it to replace). */
  replaces?: string;
  /** Name of an existing topic this doc merges onto, section by section: a
   *  section whose title matches one in the base replaces it, and a section
   *  the base does not have is added where its `before` or `after` says, else
   *  at the end. A route (`'authoring/quick-start'`) names a guide the
   *  docs tree places. For correcting or adding to a topic rather than owning
   *  it — `replaces` and `extends` are exclusive. */
  extends?: string;
  /** Ordered sections that make up the doc. */
  sections: ReferenceSection[];
  /** Token category for foundational docs that map to a token section.
   *  When set, the docsite can link from the tokens overview page
   *  to this doc for detailed guidance on that category.
   *  e.g. `'color'` links tokens → color foundational doc. */
  tokenCategory?: string;
}

/**
 * A section within a reference doc. Sections are the primary
 * organizational unit — each becomes an h2 in full output,
 * and can be individually retrieved via `astryx docs <topic> <section>`.
 */
export interface ReferenceSection {
  /** Stable section anchor. New docs should set this instead of relying on title. */
  id?: string;
  /** Section title, e.g. "Spacing Tokens", "Light/Dark Mode" */
  title: string;
  /** Navigation category ('guide' | 'foundations'). Mirrors the parent doc's
   *  category so sections can be grouped independently in the docsite nav. */
  category?: string;
  /** Ordered content blocks. Mix prose, code, tables, and lists freely. A
   *  `reference` block includes another doc from its canonical source, so a
   *  guide never copies a schema's fields or a command's options. */
  content: (ReferenceContentBlock | ReferenceDocBlock)[];
  /** In a doc that `extends` a topic, the key of the base section (as
   *  `astryx docs <topic> --index` shows it) to add this section before,
   *  when it replaces none. Set `before` or `after`, not both; with neither,
   *  the section is added at the end. Ignored on any other doc. */
  before?: string;
  /** In a doc that `extends` a topic, the key of the base section to add this
   *  section after, when it replaces none. */
  after?: string;
  /** Preview type for token tables in this section. When set, the docsite
   *  renders a visual preview column using the token's computed CSS value
   *  from the current theme. Omit for non-token sections. */
  previewType?: ReferenceTokenPreviewType;
}

/**
 * Preview type hint for token tables. Tells the docsite how to render
 * a visual preview column for each token row.
 *
 * - `'swatch'` — Color circle/square showing the token value
 * - `'shadow-box'` — Box with the shadow applied
 * - `'radius-box'` — Box with the border-radius applied
 * - `'spacing-bar'` — Horizontal bar at the token's width
 * - `'size-bar'` — Horizontal bar at the token's height
 * - `'border-line'` — Line at the token's border-width
 * - `'duration-bar'` — Animated bar showing the timing
 * - `'easing-curve'` — Bezier curve visualization
 * - `'font-sample'` — Text sample in the font family/size/weight
 */
export type ReferenceTokenPreviewType =
  | 'swatch'
  | 'shadow-box'
  | 'radius-box'
  | 'spacing-bar'
  | 'size-bar'
  | 'border-line'
  | 'duration-bar'
  | 'easing-curve'
  | 'font-sample';

/**
 * Translation/compression overlay for reference documentation.
 *
 * Swaps prose text and list items. Code blocks and table data
 * are NOT translated — they stay as-is from the base doc.
 *
 * Used by `docsZh` (Chinese) and `docsDense` (compressed format).
 */
export interface ReferenceTranslationDoc {
  /** Translated/compressed description. */
  description: string;
  /** Section overrides, keyed to base sections by `section`. Order does not
   *  matter, and an overlay may cover any subset — sections it does not name
   *  keep their base content. (These used to be matched by array index, which
   *  meant a reordered or partial overlay grafted every title onto the wrong
   *  body: `docs tokens --dense` printed the colour table under a "Spacing"
   *  heading. See #2182.) */
  sections: {
    /** Title of the BASE section this entry overrides, verbatim and in English
     *  (e.g. 'Spacing Tokens'). Must match a section in the base doc. */
    section: string;
    /** Translated/compressed section title, shown in place of the base title. */
    title: string;
    /** Content block overrides, by index within the anchored base section.
     *  Only prose and list blocks need entries. Use null for blocks that don't
     *  change (code, table). */
    content: (
      {type: 'prose'; text: string} | {type: 'list'; items: string[]} | null
    )[];
  }[];
}
