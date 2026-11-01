// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the `ComponentDoc` doc-type — how to author a component
 * directory's `{Name}.doc.mjs`. A discriminated union (Single/Multi/Sub) that
 * shares ComponentBaseDoc. Colocated with the type it describes (`type.ts`).
 * @position packages/cli/authoring/doctypes/component — doc-type documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'component-doc',
  displayName: 'ComponentDoc',
  namespace: 'authoring',
  description:
    "The doc-type for a component directory's {Name}.doc.mjs. A discriminated union of " +
    'SingleComponentDoc (props on the doc), MultiComponentDoc (a `components` array), and ' +
    'SubComponentDoc (a `subComponentOf` pointer). All three share the ComponentBaseDoc ' +
    'fields below; the variant is chosen by which of props / components / subComponentOf you set.',
  appliesTo: '{Name}.doc.mjs',
  fields: [
    {
      name: 'type',
      type: "'component'",
      description:
        'Doc-kind discriminant for the stamped default-export format. Optional: legacy `export const docs = {...}` docs omit it and the parser falls back to shape-sniffing.',
    },
    {
      name: 'name',
      type: 'string',
      description:
        "Stable machine identity without the Astryx prefix, PascalCase. e.g. 'Button', 'TextInput', 'AppShell'. For an integration component it is the export apps import: the doc sits beside the file that exports it, and when that file exports nothing under its own name, `name` may name the export it does have. Change `displayName`, not `name`, to edit the visible label; registry URLs derive from this identity by default.",
      required: true,
    },
    {
      name: 'displayName',
      type: 'string',
      description:
        "Human-readable display name with spaces between words ('AppShell' → 'App Shell'). Drives the docsite gallery and sidebar label.",
      required: true,
    },
    {
      name: 'registry',
      type: 'RegistryDocIdentity',
      description:
        'Optional public registry identity. The converter derives a stable kebab-case slug from `name`; set `slug` only to override it, and keep prior relative paths in `aliases` after a published rename.',
    },
    {
      name: 'import',
      type: 'string',
      description:
        'Exact public package specifier consumers use to import an integration-owned component. The packed-package gate resolves this specifier and verifies it exports the component name.',
    },
    {
      name: 'replaces',
      type: 'string',
      description:
        'Integration components only: the exact `name` of the Core ComponentDoc this component takes over for unqualified lookup, so every app that loads the integration gets it from component detail, component lists, search, `swizzle <Name>`, and issue routing; `swizzle --list` keeps listing Core names. The Core original stays reachable with `--package @astryxdesign/core`. It takes effect only when the package\'s peer range starts at the release that applies it, `"@astryxdesign/cli": ">=0.6.7"` or later; with a lower range nothing changes and `doctor integration components` warns ({@link generic:replace-a-core-component}). Set it only to intentionally own a Core identity; give an alternative or variant its own name instead.',
    },
    {
      name: 'keywords',
      type: 'string[]',
      description:
        'Search keywords for CLI discovery: synonyms and related UI concepts from other design systems (MUI, Chakra, Radix, and others). Lowercase. `astryx search` matches them; `astryx component <term>` also suggests Core components by keyword.',
    },
    {
      name: 'hiddenComponents',
      type: 'string[]',
      description:
        "Sub-component names to hide from human-facing UI (CLI listings, docs catalogs). They stay public and importable; agents and tooling can still discover them via source. In an integration it hides only full entries in this doc's `components`, which the CLI then neither lists nor opens; hide a sub-component that has its own doc with `hidden` in that doc.",
    },
    {
      name: 'hidden',
      type: 'boolean',
      description:
        'Hide this entire component from human-facing UI. It stays public and importable. Use for a shared primitive that only makes sense inside its parent.',
    },
    {
      name: 'group',
      type: 'string',
      description:
        'Optional sidebar/docs group. Clusters related components; ungrouped components appear flat in alphabetical order.',
    },
    {
      name: 'category',
      type: "'Action' | 'Chat' | 'Container' | 'Content' | 'Form Controls' | 'Data Input' | 'Data Visualization' | 'Feedback & Status' | 'Layout' | 'Navigation' | 'Overlay' | 'Table & List' | 'Utility'",
      description:
        "Overview-gallery category representing the component's functional role. Independent of `group` (which is for the sidebar). `Data Input` is a deprecated compatibility alias for `Form Controls`.",
    },
    {
      name: 'isHiddenFromOverview',
      type: 'boolean',
      description:
        'Exclude from the categorized overview page while keeping the component in the sidebar and CLI. Use for sub-components or internal primitives.',
    },
    {
      name: 'theming',
      type: '{ container?: boolean; targets: ComponentThemingTarget[]; vars?: ComponentThemingVar[]; derived?: ComponentThemingDerivedVar[] }',
      description:
        'Theming configuration: the stable selector surface (astryx-* classes + data-attribute reflections) that themes target via @scope selectors in defineTheme.',
      fields: [
        {
          name: 'theming.container',
          type: 'boolean',
          description:
            "Marks a container component. Nothing reads it today: the theme pipeline maps `padding` to container tokens from a `theming.derived` entry `{property: 'padding', expand: 'container'}`.",
        },
        {
          name: 'theming.targets',
          type: 'ComponentThemingTarget[]',
          description:
            'Selector targets rendered by this component. Each entry corresponds to a themeProps() call in the source.',
          required: true,
        },
        {
          name: 'theming.vars',
          type: 'ComponentThemingVar[]',
          description: 'CSS custom properties exposed for theming.',
        },
        {
          name: 'theming.derived',
          type: 'ComponentThemingDerivedVar[]',
          description:
            "Maps standard CSS properties to internal vars for theme-pipeline expansion. Ordered by priority: earlier entries emit first. The pipeline reads only Core components' entries, so an integration's have no effect.",
        },
      ],
    },
    {
      name: 'usage',
      type: 'UsageDoc',
      description:
        'Component usage documentation: concise summary, best practices, component-specific accessibility requirements, and optional visual anatomy. Required on a component doc; optional on a sub-component doc (`subComponentOf`), which uses its description instead.',
      fields: [
        {
          name: 'usage.description',
          type: 'string',
          description:
            'What the component is and when to use it, in 2-3 short sentences.',
          required: true,
        },
        {
          name: 'usage.bestPractices',
          type: 'ComponentBestPractice[]',
          description:
            "3-4 do/don't design-guidance items ({guidance: boolean, description: string}). Never start the description with 'Do' or 'Don't'.",
        },
        {
          name: 'usage.accessibility',
          type: 'ComponentAccessibilityRequirement[]',
          description:
            'Component-specific requirements rendered in the shared Accessibility tab. Write at about a grade-7 reading level with short sentences, common words, and active voice. For color contrast, put the ratio in `requirement`; name the exact foreground, background, state, and any overlay in `description`; explain exceptions in plain language; and give a human or agent enough detail to reproduce the check. Keep repository audit procedures in the wiki rubric.',
        },
        {
          name: 'usage.accessibilityThemeCoverage',
          type: 'ComponentAccessibilityThemeCoverage[]',
          description:
            'Verified per-theme accessibility measurements rendered in the shared Accessibility tab. Record light and dark mode separately, include rendered color pairs, and mark failed measurements. Put visuals excluded from the audit in `notMeasured` with a short reason; do not add them as table measurements. Each theme declares `applicability` for measured values, informed by the component contract and never inferred from the ratio: `Conditional` is required only in some contexts, `Supplemental` adds another meaningful cue, and `Decorative` has no required meaning. These values do not change row status. Provide a complete breakdown when one cell summarizes multiple combinations, and protect derived values with an automated audit.',
        },
        {
          name: 'usage.anatomy',
          type: 'ComponentAnatomyElement[]',
          description:
            'Structural/visual parts in reading order ({name, required, description}).',
        },
      ],
    },
    {
      name: 'examples',
      type: 'ComponentExampleDoc[]',
      description:
        'Short code examples ({label?, code}) rendered by the CLI after the props table.',
    },
    {
      name: 'playground',
      type: 'ComponentPlaygroundConfig',
      description:
        'Interactive-preview config: initial prop `defaults`, `overlay` for modal-only components, `appShellMobile` for components gated on AppShell mobile context, and a `wrapper` for context-dependent sub-components.',
    },
    {
      name: 'props',
      type: 'ComponentPropDoc[]',
      description:
        'SingleComponentDoc variant (required there): all public props for the one primary component. Each prop is {name, type, description, default?, required?, slotElements?, stability?}. Skip styling props like xstyle/className/style. Also present on SubComponentDoc.',
    },
    {
      name: 'components',
      type: '(ComponentEntry | ComponentRef)[]',
      description:
        'MultiComponentDoc variant (required there): one entry per public component/hook exported from the directory. Each entry is a full ComponentEntry (inline: name, displayName, description, props | params+returns) or a name-only ComponentRef pointing at a sibling {Name}.doc.mjs. In an integration, each full entry the module named by `import` exports is a component under its own name.',
    },
    {
      name: 'subComponentOf',
      type: 'string',
      description:
        "SubComponentDoc variant (required there): the parent component's `name` (e.g. 'Chat'). Marks this file as a sub-component doc. The CLI does not copy family fields (group, category, keywords, theming, playground) from the parent to an integration's sub-component: its detail, list group and search use only what its own doc sets. Set any the child needs in its own doc.",
    },
    {
      name: 'description',
      type: 'string',
      description:
        "SubComponentDoc variant (required there): one-sentence description of the sub-component's role within the parent composition. Single/Multi docs have no top-level description; they derive their summary from `usage`.",
    },
  ],
  examples: [
    {
      label: 'SingleComponentDoc (props on the doc)',
      code: `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeSwitch',
  displayName: 'Acme Switch',
  category: 'Form Controls',
  keywords: ['toggle', 'switch', 'on off'],
  usage: {
    description:
      'A Switch toggles a single setting on or off. Use it for instant, binary preferences that apply immediately without a submit step.',
    bestPractices: [
      {guidance: true, description: 'Apply the change immediately when toggled.'},
      {guidance: false, description: 'Use a Switch for actions that need confirmation; prefer a Checkbox in a form.'},
    ],
  },
  props: [
    {name: 'isSelected', type: 'boolean', description: 'Whether the switch is on.', required: true},
    {name: 'onChange', type: '(isSelected: boolean) => void', description: 'Called when the user toggles the switch.'},
    {name: 'isDisabled', type: 'boolean', description: 'Prevents interaction and dims the control.', default: 'false'},
  ],
};`,
    },
    {
      label: 'MultiComponentDoc (a components array)',
      code: `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeTable',
  displayName: 'Acme Table',
  category: 'Table & List',
  usage: {description: 'Displays rows and columns of data. Compose the sub-components to build headers, rows, and cells.'},
  components: [
    {name: 'AcmeTable', displayName: 'Acme Table', description: 'The table container.', props: []},
    {name: 'AcmeTableRow', displayName: 'Acme Table Row', description: 'A row within the table body.', props: [
      {name: 'isSelected', type: 'boolean', description: 'Highlights the row as selected.'},
    ]},
    {name: 'useAcmeTableSelection', displayName: 'useAcmeTableSelection', description: 'Manages row selection state.',
      params: [{name: 'rows', type: 'T[]', description: 'The rows to track.', required: true}],
      returns: [{name: 'selectedIds', type: 'Set<string>', description: 'Currently selected row ids.'}]},
  ],
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: "When it loads, a stamped component doc is checked about as loosely as an unstamped one, so adding `type: 'component'` to a doc that follows the type never breaks it: `displayName` may be missing, `category` may be any string, `usage`, `theming` and `playground` are not checked, and `examples` need only be an array. Unlike an unstamped doc, each entry in a group doc's `components` must have a `name`, and `import` and `replaces`, when set, must be non-empty strings. Write to the type anyway; it is the contract.",
    },
    {
      type: 'prose',
      text: 'ComponentDoc is a discriminated union of three shapes that all extend ComponentBaseDoc. Pick the variant by which key you set: `props` (single), `components` (multi), or `subComponentOf` (sub).',
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        'SingleComponentDoc: one primary component; put props directly on the doc via `props`. Use for Switch, Badge, Spinner, TextInput.',
        'MultiComponentDoc: a directory exporting several components/hooks; list them in `components` (inline ComponentEntry or name-only ComponentRef). Use for Table, Dialog, TabList.',
        "SubComponentDoc: a single sub-component in its own {Name}.doc.mjs inside the parent directory; set `subComponentOf` to the parent name. It does not take the parent's family fields, and it may omit `usage`.",
      ],
    },
    {
      type: 'code',
      lang: 'js',
      label: 'SubComponentDoc',
      code: `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeChatComposer',
  displayName: 'Acme Chat Composer',
  subComponentOf: 'AcmeChat',
  description: 'The message input row within an Acme Chat, with an editor and send affordance.',
  props: [
    {name: 'onSend', type: '(text: string) => void', description: 'Called when the user submits a message.', required: true},
  ],
};`,
    },
    {
      type: 'prose',
      text: "The stamped format is `export default { type: 'component', ... }`, which `astryx integration add component` writes; legacy docs use `export const docs = {...}` and omit `type` (the parser shape-sniffs). A hook that is part of a component API is listed in a MultiComponentDoc `components` array: inline as a ComponentEntry (with `params`/`returns`), or by name with its own SubComponentDoc file, as Core's useTableSelection is.",
    },
  ],
};
