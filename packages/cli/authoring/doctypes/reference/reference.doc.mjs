// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the `ReferenceDoc` doc-type — how to author a topic/guide
 * doc (design tokens, principles, theming, patterns, migration). Colocated with
 * the type it describes (`type.ts`).
 * @position packages/cli/authoring/doctypes/reference — doc-type documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'reference-doc',
  displayName: 'ReferenceDoc',
  namespace: 'authoring',
  description:
    'The doc-type for a reference/topic doc: tokens, principles, theming, patterns, ' +
    'accessibility, migration guides. Unlike ComponentDoc it is not tied to a component: ' +
    'drop a `.doc.mjs` in the docs directory and it shows up in `astryx docs`. Content is ' +
    'built from ordered sections of mixed content blocks.',
  appliesTo:
    "<topic>.doc.{ts,mjs,js} in the folder the integration manifest's `docs` names",
  fields: [
    {
      name: 'type',
      type: "'generic'",
      description:
        "Doc-kind discriminant. Stays 'generic' (the reference/topic discriminant). Legacy `export const docs = {...}` docs omit it.",
    },
    {
      name: 'name',
      type: 'string',
      description:
        "URL-safe identifier, used as the CLI topic name. e.g. 'tokens', 'principles'.",
      required: true,
    },
    {
      name: 'title',
      type: 'string',
      description:
        "Human-readable title. e.g. 'All Tokens'. (Reference docs use `title`, not `displayName`.)",
      required: true,
    },
    {
      name: 'description',
      type: 'string',
      description: 'One-line summary shown in topic listings.',
      required: true,
    },
    {
      name: 'category',
      type: 'string',
      description: "Navigation category: 'guide' or 'foundations'.",
    },
    {
      name: 'keywords',
      type: 'string[]',
      description:
        "Words a reader may search for that the title and sections do not use: a synonym, a task, or another library's name for the same thing. `astryx search` matches each as a keyword of the whole topic, so an exact one ranks the topic like its own title does.",
      example: "['dark mode', 'color scheme']",
    },
    {
      name: 'replaces',
      type: 'string',
      description:
        'Name of an existing topic this doc takes the place of. Authored by an integration that serves its own guide instead of the built-in one: on a doc of the same name it swaps the content, and on a doc of another name it also leaves the old name as an alias so `astryx docs <old>` still resolves. Exclusive with `extends`.',
      example: "'getting-started'",
    },
    {
      name: 'extends',
      type: 'string',
      description:
        "Name of an existing topic this doc merges onto, section by section. A section replaces the base section with the same `id`, or else the one with exactly its title when either of the two has no `id`. A key derived from a title counts only against an `id`: a section without an `id` also matches a base section whose `id` is the key its title derives, and a section with an `id` also matches a base section without one whose title derives that `id`. Two different `id`s never match, two sections without an `id` whose titles differ only in case or punctuation stay separate, and a section that matches none is appended. The topic keeps the base's title and description. For correcting or adding to a topic rather than owning it. Exclusive with `replaces`.",
      example: "'theme'",
    },
    {
      name: 'sections',
      type: 'ReferenceSection[]',
      description:
        'Ordered sections that make up the doc. Each becomes an h2 in full output and can be retrieved via `astryx docs <topic> <section>`.',
      required: true,
      fields: [
        {
          name: 'sections[].id',
          type: 'string',
          description:
            'Stable section anchor. New docs should set this instead of relying on a mutable title. Published @astryxdesign/cli 0.6.3 and earlier reject the field and hide every doc topic the package ships, so `astryx integration verify` fails an integration that sets one until it declares an `@astryxdesign/cli` peer of `>=0.6.4`.',
        },
        {
          name: 'sections[].title',
          type: 'string',
          description:
            'Section title, e.g. "Spacing Tokens", "Light/Dark Mode".',
          required: true,
        },
        {
          name: 'sections[].category',
          type: 'string',
          description:
            "Navigation category ('guide' | 'foundations'). Mirrors the parent doc's category so sections can be grouped independently.",
        },
        {
          name: 'sections[].content',
          type: '(ReferenceContentBlock | ReferenceDocBlock)[]',
          description:
            "Ordered content blocks: prose, heading, code, table, list, token-ref, and reference. A `reference` block (`{type: 'reference', target, projection?, presentation?}`) includes another doc from its canonical source instead of a copy: a schema, command, function, or enum doc as `astryx docs` prints it, then the command that opens it. `projection.fields` keeps only those fields of a schema; `presentation` is `full` (the default), `compact` (no code blocks), or `summary` (only the doc's title, summary, and command). Any other doc shows as a summary. Graph-only workflow and collection blocks are available through GraphContentBlock on NamespaceDoc, without widening the stable ReferenceContentBlock union. Inside text, `{@link <target>}` links another doc by identity (`[<provider>:]<kind>:<name>`): the CLI prints the command that opens it, and `astryx doctor` warns on one that names no doc.",
          required: true,
        },
        {
          name: 'sections[].previewType',
          type: 'ReferenceTokenPreviewType',
          description:
            'Preview type for token tables in this section. The CLI rejects a value not in the list below and returns the value in `astryx docs --json`, but draws no preview from it. Omit for non-token sections.',
        },
      ],
    },
    {
      name: 'tokenCategory',
      type: 'string',
      description:
        "Token category for foundational docs that map to a token section (e.g. 'color'). `astryx docs --json` returns it as authored; no tokens page links to the doc through it.",
    },
  ],
  examples: [
    {
      label: 'A reference doc with one section',
      code: `/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export default {
  type: 'generic',
  name: 'acme-spacing',
  title: 'Acme Spacing',
  description: 'Spacing tokens for gap, margin, and padding.',
  category: 'foundations',
  tokenCategory: 'spacing',
  sections: [
    {
      title: 'Spacing Tokens',
      content: [
        {type: 'prose', text: 'Use spacing tokens instead of raw pixel values so layouts stay on the 4px grid.'},
        {type: 'table', headers: ['Token', 'Value'], rows: [['--spacing-4', '16px']]},
      ],
      previewType: 'spacing-bar',
    },
  ],
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: 'A stamped generic doc without `title`, `description` or `sections` still loads, as older codemod output does; its title falls back to `displayName` or `name`. Without a description and sections it is not a usable topic, and `astryx doctor` reports it.',
    },
    {
      type: 'prose',
      text: 'Each `sections[].content` is an ordered array of ReferenceContentBlock, the stable discriminated union of prose, heading, code, table, list, and token-ref, plus the reference block (ReferenceDocBlock). A read inlines a reference block the way it inlines a token-ref, so `astryx docs`, in text and in `--json`, returns only the stable block kinds. Docs-graph-only workflow and collection blocks are exported separately as GraphContentBlock and accepted by NamespaceDoc. choice, callout, and checklist remain invalid. ReferenceContentBlock is also reused by the `notes` field on SchemaDoc and CommandDoc. Inside text, `{@link <target>}` links another doc by identity (`[<provider>:]<kind>:<name>`): the CLI prints the command that opens it, and `astryx doctor` warns on one that names no doc. Write a CLI command in text, shell code, or a table cell as a bare `astryx` command: a text read adds the runner the reader uses in front of it, and `--json` returns it as written.',
    },
    {
      type: 'prose',
      text: "A reference block includes content, where a link only points at it: `astryx doctor integration docs` fails when its target names no doc, when `projection.fields` names a field the schema does not have, or when the doc cannot take the projection or presentation it sets, and a read marks the missing content. A target without a provider names a doc of the package that wrote it, so an integration names the CLI's docs with the CLI's provider, as in `@astryxdesign/cli:schema:integration`.",
    },
    {
      type: 'code',
      lang: 'js',
      label: 'A section that includes two fields of the integration manifest',
      code: `{
  title: 'Point the manifest at your folders',
  content: [
    {type: 'prose', text: 'Add these fields to astryx.integration.mjs.'},
    {
      type: 'reference',
      target: '@astryxdesign/cli:schema:integration',
      projection: {fields: ['components', 'docs']},
    },
  ],
}`,
    },
    {
      type: 'code',
      lang: 'ts',
      label: 'ReferenceContentBlock union',
      code: `type ReferenceContentBlock =
  | { type: 'prose'; text: string }
  | { type: 'heading'; level: 3 | 4 | 5 | 6; text: string }
  | { type: 'code'; lang: string; code: string; label?: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; style: 'ordered' | 'unordered' | 'do' | 'dont'; items: string[] }
  | { type: 'token-ref'; topic: string; section: string };

type ReferenceDocBlock = {
  type: 'reference';
  target: string;
  projection?: { fields?: string[]; sections?: string[] };
  presentation?: 'summary' | 'compact' | 'full';
};

type GraphContentBlock =
  | { type: 'workflow'; title?: string; steps: WorkflowStep[] }
  | { type: 'collection'; title?: string; source: {slot: string}; presentation?: 'list' | 'cards' | 'compact'; whenEmpty?: 'show' | 'omit' }
  | ReferenceDocBlock;`,
    },
    {
      type: 'prose',
      text: "A `token-ref` block (e.g. {type: 'token-ref', topic: 'tokens', section: 'Color Tokens'}) references a token table in another topic; the CLI resolves and inlines it at read time so the docsite can render live theme values.",
    },
    {
      type: 'prose',
      text: "A section may set `previewType`, a hint for previewing its token table, to one of 'swatch' | 'shadow-box' | 'radius-box' | 'spacing-bar' | 'size-bar' | 'border-line' | 'duration-bar' | 'easing-curve' | 'font-sample'; the CLI rejects any other value.",
    },
  ],
};
