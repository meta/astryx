// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/component-lookups`: exact single and batch component
 * lookup through the CLI and programmatic API.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'component-lookups',
  placement: {parent: 'namespace:cli', slot: 'guides', order: 5},
  title: 'Component lookups',
  category: 'guide',
  keywords: ['look up', 'looking up components', 'lookup', 'batch'],
  description:
    'Look up one or several exact component identities, choose a focused projection, and handle complete batch receipts.',
  sections: [
    {
      id: 'several',
      title: 'Look up several components',
      category: 'guide',
      content: [
        {
          type: 'prose',
          text: '`{@command component}` accepts exact selectors as a variadic positional argument. With no selector it browses the catalog. With one selector it keeps the normal single-component response. With two or more it prints one complete ordered batch receipt.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Several component docs',
          code: '{@command component Button Badge Text}\nastryx --json component Button Badge Text',
        },
        {
          type: 'prose',
          text: 'Every selector gets one row in input order. Duplicate selectors stay duplicate rows. A missing or ambiguous component does not hide successful neighbors or stop later selectors from resolving.',
        },
        {
          type: 'prose',
          text: 'A batch accepts at most 100 selectors, including duplicates, in every projection mode. A larger request returns a top-level `ERR_INVALID_ARGUMENT` before any component resolves. It emits no `component.batch` receipt and no partial results.',
        },
        {
          type: 'prose',
          text: 'Focused component controls apply to every found row. Use the same control you use for one component:',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Focused batch lookups',
          code: 'astryx --json component Button Card --props\n{@command component Button Card --source}\n{@command component Button Card --showcase}\n{@command component Button Card --blocks}\n{@command component Button Card --detail compact}\n{@command component Button Card --lang dense}\n{@command component Button Card --package @astryxdesign/core}',
        },
      ],
    },
    {
      id: 'selectors',
      title: 'Selector forms',
      category: 'reference',
      content: [
        {
          type: 'prose',
          text: 'A selector is an exact component identity, not free-text search. Use one of these forms:',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`Button` for an unqualified component name.',
            '`widgets/Button` for a component in an unscoped package.',
            '`@acme/widgets/Button` for a component in a scoped package.',
            '`@acme/widgets@1.2.3/Button` to require that exact installed package version.',
          ],
        },
        {
          type: 'prose',
          text: 'A version qualifies the package, never the component. The lookup does not fall through to another installed version. An unqualified name owned by several installed packages is `ambiguous` and lists every candidate. Use a package-qualified selector or `--package` to choose one.',
        },
        {
          type: 'prose',
          text: '`{@command discover}` remains free-text package discovery. Its words form one query; they are not component batch selectors.',
        },
      ],
    },
    {
      id: 'output',
      title: 'Batch output and exit status',
      category: 'reference',
      content: [
        {
          type: 'prose',
          text: 'JSON uses `component.batch` with `{count, results}`. Each row echoes `selector` and has one status: `found`, `not_found`, `ambiguous`, or `error`. A found row carries the normal single-component `{type, data}` under `result`. Failed rows carry `code` and `error`, plus `suggestions` or `candidates` when available.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Outcome and duplicate examples',
          code: 'astryx --json component Button Badge                 # all found, exit 0\nastryx --json component Button MissingWidget         # mixed, exit 1\nastryx --json component MissingWidget MissingPanel   # all failed, exit 1\nastryx --json component Button Button                # two ordered rows, exit 0',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'A complete failed JSON receipt',
          code: 'astryx --json component MissingWidget MissingPanel',
        },
        {
          type: 'code',
          lang: 'json',
          code: '{\n  "apiVersion": 1,\n  "type": "component.batch",\n  "data": {\n    "count": 2,\n    "results": [\n      {\n        "selector": "MissingWidget",\n        "status": "not_found",\n        "code": "ERR_UNKNOWN_COMPONENT",\n        "error": "No component named \\"MissingWidget\\""\n      },\n      {\n        "selector": "MissingPanel",\n        "status": "not_found",\n        "code": "ERR_UNKNOWN_COMPONENT",\n        "error": "No component named \\"MissingPanel\\""\n      }\n    ]\n  }\n}',
        },
        {
          type: 'code',
          lang: 'text',
          label: 'The same receipt in text mode',
          code: 'Component batch\n\ncount: 2\n\nResults\n\nMissingWidget\n\nselector: MissingWidget\nstatus:   not_found\ncode:     ERR_UNKNOWN_COMPONENT\nerror:    No component named "MissingWidget"\n\nMissingPanel\n\nselector: MissingPanel\nstatus:   not_found\ncode:     ERR_UNKNOWN_COMPONENT\nerror:    No component named "MissingPanel"',
        },
        {
          type: 'prose',
          text: 'The CLI emits every row first, then exits 1 when any row is not `found`. This includes mixed receipts and receipts where every row failed. JSON and text use the same exit status. A batch where every row is `found` exits 0.',
        },
      ],
    },
    {
      id: 'api',
      title: 'Programmatic API',
      category: 'reference',
      content: [
        {
          type: 'prose',
          text: 'The argument shape chooses the response shape. Omit the argument for the catalog, pass a string for the existing single-component response, and pass an array for `component.batch`. An array always means batch, including empty and one-item arrays, so filtering a selector list cannot silently change the response type. The published `ComponentBatchResponse` specializes the shared `BatchResponse` and `BatchRow` types.',
        },
        {
          type: 'code',
          lang: 'javascript',
          code: "import {component} from '@astryxdesign/cli/api';\n\nconst catalog = await component(); // component.list\nconst button = await component('Button'); // component.detail\nconst empty = await component([]); // component.batch, count 0\nconst oneRow = await component(['Button']); // component.batch, count 1\nconst batch = await component(['Button', 'Badge']); // component.batch, count 2\nawait component(Array(101).fill('Button')); // ERR_INVALID_ARGUMENT before lookup",
        },
        {
          type: 'code',
          lang: 'json',
          label: 'Exact empty-array response',
          code: '{\n  "type": "component.batch",\n  "data": {\n    "count": 0,\n    "results": []\n  }\n}',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'Handle every row without losing partial results',
          code: "const receipt = await component(['Button', 'MissingWidget']);\n\nfor (const row of receipt.data.results) {\n  if (row.status === 'found') {\n    useComponentDoc(row.selector, row.result);\n  } else if (row.status === 'ambiguous') {\n    choosePackage(row.selector, row.candidates);\n  } else {\n    reportLookupFailure(row.selector, row.code, row.error);\n  }\n}",
        },
      ],
    },
  ],
};
