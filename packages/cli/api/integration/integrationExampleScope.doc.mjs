// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `integrationExampleScope()`. Colocated with the API
 * function it documents; the shape source of truth stays in
 * `example-scope.type.mjs` and `authoring/example/type.ts`.
 * @position packages/cli/api/integration — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationExampleScope',
  namespace: 'cli/api',
  displayName: 'integrationExampleScope()',
  summary:
    "The scope Doctor reads a package's component examples against, as JSON.",
  description:
    "Builds the ExampleScope `validateIntegration` reads a package's component examples against: the components the package documents, each with the import an app uses for it; the components and hooks the Core installed beside it documents; the exports of the React it resolves; the packages its package.json declares in `dependencies`, `peerDependencies` and `optionalDependencies`; its own import specifiers whose module imports `server-only`; and its async components. The scope is plain JSON, so a catalog can store it beside the package, and a preview tool that reads each example with it and `previewableExample` from `@astryxdesign/cli/authoring` judges each example as Doctor does. It reads the local package rooted at cwd (no `pkg`), or a package installed beside cwd (`pkg` given). It loads the package's doc modules, as Doctor does.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationExampleScope(pkg?: string, options?: IntegrationExampleScopeOptions): Promise<IntegrationExampleScopeResponse>',
  keywords: [
    'integration',
    'example',
    'preview',
    'scope',
    'previewable',
    'catalog',
  ],
  params: [
    {
      name: 'pkg',
      type: 'string',
      description:
        'Installed package name; omit for the package rooted at cwd.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Folder the local package or `node_modules` is found from.',
    },
  ],
  returns: [
    {
      type: 'integration.example-scope',
      description:
        'The envelope: `data.found` (false when no integration manifest loads, and then `data.reason` says why), `data.name` and `data.version` of the package, and `data.scope`: the ExampleScope ({packageName, packageNames: [{name, import}], coreNames: [{name, import}], reactNames, dependencies, serverOnlyModules, serverComponents}), or null with `data.reason` when package.json has no name. `data.incomplete` says why the names Core or React give could not be read: the scope then lists none of them, so a reader must not report a name the scope leaves out. This JSON shape is a contract, so a stored scope stays readable: a release may add a field, and never renames, removes or retypes one.',
    },
  ],
  examples: [
    {
      label: 'Read examples as Doctor does',
      code: "import {integrationExampleScope} from '@astryxdesign/cli/api';\nimport {previewableExample} from '@astryxdesign/cli/authoring';\n\nconst {data} = await integrationExampleScope('@acme/widgets');\nconst read = previewableExample(example, data.scope);",
    },
  ],
  related: ['validateIntegration'],
};
