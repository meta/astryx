// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the `TemplateDoc` doc-type — how to author metadata for a
 * page or block template. A union of PageTemplateDoc and BlockTemplateDoc that
 * share BaseTemplateDoc. Colocated with the type it describes (`type.ts`).
 * @position packages/cli/authoring/doctypes/template — doc-type documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'template-doc',
  displayName: 'TemplateDoc',
  namespace: 'authoring',
  description:
    'The doc-type for template metadata. A discriminated union of PageTemplateDoc ' +
    "(type: 'page') for full page templates and BlockTemplateDoc (type: 'block') for " +
    'editable compositions. A block can stand alone or use `exampleFor` to attach ' +
    'to one component; `isShowcase` requires that component ownership.',
  appliesTo: '<Name>.doc.mjs',
  fields: [
    {
      name: 'type',
      type: "'page' | 'block'",
      description:
        "Discriminant selecting the variant: 'page' for a full page template, 'block' for an editable composition that may be standalone or component-owned.",
      required: true,
    },
    {
      name: 'name',
      type: 'string',
      description:
        "Stable identifier for block templates; change `displayName`, not `name`, to edit their visible label in the gallery. For page templates it is a human-readable label, while the existing template-directory/CLI slug owns the default registry path. `astryx template --list` and `astryx search` print `name` as the label of both, and `astryx template <id>` finds a template by its id, never by `name`: an integration template's id is its path under the templates folder without the `.doc.*` suffix.",
      required: true,
    },
    {
      name: 'displayName',
      type: 'string',
      description:
        "Human-readable label for the gallery. The CLI prints `name` instead; `astryx template --list --json` also returns an integration template's `displayName`. Spaces out block names that mirror a PascalCase component ('ChatMessageMetadata' → 'Chat Message Metadata').",
      required: true,
    },
    {
      name: 'registry',
      type: 'RegistryDocIdentity',
      description:
        'Optional public registry identity. The converter derives a stable kebab-case slug from `name` (or the existing page-template slug); set `slug` only to override it, and keep prior relative paths in `aliases` after a published rename.',
    },
    {
      name: 'description',
      type: 'string',
      description: 'One-sentence description of what the template provides.',
    },
    {
      name: 'keywords',
      type: 'string[]',
      description:
        "Search keywords for CLI discovery: the ideas, domains, and other names a builder might use for what the template serves (e.g. ['monitoring', 'uptime', 'on-call'] for a service-health dashboard). Lowercase. `astryx search` matches them as it matches the description and `astryx build` ranks page templates on them, so keep them out of `description`. Integration templates need @astryxdesign/cli 0.6.6 or later: earlier CLIs reject the field and drop that template, and CLIs before 0.6.4 also hide the package's doc topics.",
    },
    {
      name: 'replaces',
      type: 'string',
      description:
        "Integration templates only: the exact id of the Core template this one replaces for unqualified lookup. Find it with `astryx --json template --list --package @astryxdesign/core`; the Core original stays selectable with `--package @astryxdesign/core`. A page replaces only a Core page and a block only a Core block. Needs @astryxdesign/cli 0.6.4 or later: earlier CLIs reject the field, drop that template, and hide the package's doc topics.",
    },
    {
      name: 'icons',
      type: 'Record<string, string>',
      stability: 'experimental',
      description:
        "The icon definition each icon the source imports draws, such as `{TrashIcon: 'delete'}`: a named import is keyed by the name it imports (`{Trash as TrashIcon}` is `Trash`), a default import by its local name (`import DeleteIcon from …` is `DeleteIcon`). When the project sets `experimental.iconSet`, `astryx template` (shown or copied) replaces each declared icon with the icon for that definition (`astryx docs cli/experimental/icon-definitions`) from the first set in the project's list that maps it, or with a placeholder the copied file declares when no set does, and reports every key as mapped, a placeholder, or kept; an undeclared import is left alone, and `astryx integration check` notes it (`template_icon_undeclared`, failing `--strict --next`) in a package whose templates declare `icons`. A name imported from two modules (`TrashIcon` from an outline and a solid module) needs one key, and each import keeps its variant when its module belongs to an installed set.",
    },
    {
      name: 'isReady',
      type: 'boolean',
      description:
        "Whether the template is ready for use. false shows as '(WIP)' in the gallery and CLI.",
    },
    {
      name: 'scaffold',
      type: 'boolean',
      description:
        'Scaffolding-only template (e.g. blank page): available via the CLI but hidden from browsable galleries.',
    },
    {
      name: 'category',
      type: 'TemplateCategory',
      description:
        "Functional gallery category following a 'Group - Variant' convention (e.g. 'Dashboard - Analytics', 'Table - Basic', 'Form - Wizard'). The overview groups by the text before ' - '.",
    },
    {
      name: 'isHiddenFromOverview',
      type: 'boolean',
      description:
        'Opt out of the Templates overview gallery while staying available via the CLI. Use for duplicate/experimental variants. Scaffold templates are hidden automatically.',
    },
    {
      name: 'exampleFor',
      type: 'string',
      description:
        'Block templates only: optional component ownership. Set this when the block is specifically an example of one component. Omit it for a standalone composition.',
    },
    {
      name: 'alsoExampleFor',
      type: 'string[]',
      description:
        'Block templates only: additional component/hook doc pages whose Examples section should include this block.',
    },
    {
      name: 'alsoShowcaseFor',
      type: 'string[]',
      description:
        'Block templates only: additional doc pages whose hero showcase should reuse this block (secondary placements; does not change the primary showcase).',
    },
    {
      name: 'aspectRatio',
      type: 'number',
      description:
        'Block templates only (required): width-to-height ratio for preview containers (e.g. 16/9, 1, 3/4).',
    },
    {
      name: 'scale',
      type: 'number',
      description: 'Block templates only: scale factor for the block preview.',
      default: '1',
    },
    {
      name: 'componentsUsed',
      type: 'string[]',
      description:
        "Block templates only: component names this block uses, for 'See also'/'Used in' cross-references (not primary attribution).",
    },
    {
      name: 'isShowcase',
      type: 'boolean',
      description:
        'Block templates only: when true this block is the canonical hero showcase for its `exampleFor` component. Requires `exampleFor`.',
    },
    {
      name: 'slots',
      type: 'TemplateSlot[]',
      description:
        "Page templates only: the named places in the page where blocks go, in reading order. Each slot is `{name, kind, description}`: `name` is lowercase words joined by hyphens and unique in the page, `kind` is one of the slot kinds below, and `description` says in one sentence where the slot is and what goes there. A shell is a layout: its slots are its navigation and its body (`main`). `astryx build` lists the start's slots and names the slot each block it suggests goes in. Integration templates need @astryxdesign/cli 0.7.16 or later: earlier CLIs reject the field and drop that template.",
    },
    {
      name: 'fits',
      type: 'TemplateSlotKind[]',
      description:
        "Block templates only: the kinds of place the block goes in, best first: page slot kinds, or a context, `overlay` (opens from a trigger) or `inline` (goes inside another piece). An empty list says the block is a reference that shows a component's options and is not put into a page as it is. Decide it from what the block renders. `astryx build` puts each block it suggests into the start's slot of its best fit, else into the page body (`main`); an overlay or inline block goes in no slot. Integration templates need @astryxdesign/cli 0.7.16 or later: earlier CLIs reject the field and drop that template.",
    },
  ],
  examples: [
    {
      label: 'Page template',
      code: `/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'page',
  name: 'Dashboard',
  displayName: 'Dashboard',
  description: 'An analytics dashboard with KPI cards and charts.',
  category: 'Dashboard - Analytics',
  isReady: true,
};`,
    },
    {
      label: 'Block template (component example)',
      code: `/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'ButtonGroupExample',
  displayName: 'Button Group Example',
  description: 'A row of related buttons showing primary and secondary actions.',
  exampleFor: 'Button',
  aspectRatio: 16 / 9,
  componentsUsed: ['Button', 'HStack'],
  isShowcase: true,
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: 'When it loads, a template may leave out `displayName` and `aspectRatio` and use its own `category`, as integration templates already published do; a block with no `aspectRatio` previews at 1. Write to the type anyway; it is the contract, and `astryx doctor integration validate` warns about an integration template that leaves out `displayName` or `aspectRatio`.',
    },
    {
      type: 'prose',
      text: "TemplateDoc is a discriminated union keyed by `type`. Set `type: 'page'` for a full page template. Set `type: 'block'` for an editable composition; add `exampleFor` only when one component owns the example.",
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        "PageTemplateDoc (type: 'page'): a full page template; `name` doubles as its display value.",
        "BlockTemplateDoc (type: 'block'): an editable composition. `exampleFor` is optional component ownership; omit it for a standalone block. `isShowcase` requires `exampleFor`.",
      ],
    },
    {
      type: 'prose',
      text: "`category` uses the shared TemplateCategory taxonomy: 'Group - Variant' strings (e.g. 'Table - Bulk Actions'). Not every value maps to an existing template; unused values are reserved so authors get autocomplete for the full taxonomy.",
    },
    {
      type: 'prose',
      text: "Slot kinds (TemplateSlotKind) are one vocabulary for a page's `slots` and a block's `fits`, so a block from any package fits a page from any other. A region is a place in a page's layout; a section is a part of the body named by what it holds; a context is not a place in the page. A block fits a slot when its `fits` lists the slot's kind; a `main` slot takes every block that goes in a page. A CLI that meets a kind it does not know still loads the template and skips the kind, and `astryx doctor integration validate` names it.",
    },
    {
      type: 'table',
      headers: ['Kind', 'Group', 'What goes there'],
      rows: [
        ['`navigation`', 'region', 'Moves people between pages or views.'],
        ['`header`', 'region', 'The top of a page or section.'],
        ['`toolbar`', 'region', 'Controls that act on the content next to them.'],
        ['`main`', 'region', 'The page body. Every block that goes in a page fits it; a page names its parts with section kinds where it can.'],
        ['`panel`', 'region', 'A side region next to the main content.'],
        ['`footer`', 'region', 'The bottom of a page or section.'],
        ['`metrics`', 'section', 'Headline numbers.'],
        ['`chart`', 'section', 'Plotted data.'],
        ['`table`', 'section', 'Records in rows and columns.'],
        ['`list`', 'section', 'A collection of items.'],
        ['`form`', 'section', 'Data entry and its submit actions.'],
        ['`content`', 'section', 'Things to read or look at.'],
        ['`feedback`', 'section', 'Messages about state.'],
        ['`chat`', 'section', 'A conversation.'],
        ['`overlay`', 'context', 'Opens above the page from a trigger.'],
        ['`inline`', 'context', 'Goes inside another piece.'],
      ],
    },
  ],
};
