// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for ExampleScope, what `previewableExample` reads a doc
 * example against, and the PreviewableExample it returns.
 * @input The types in `type.ts`, which `preview.mjs` implements.
 * @output The `example-scope` section of `astryx docs authoring`.
 * @position packages/cli/authoring/example — schema documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'example-scope',
  displayName: 'ExampleScope',
  namespace: 'authoring',
  description:
    "What `previewableExample(example, scope)` from `@astryxdesign/cli/authoring` reads a component doc example against, as JSON. `integrationExampleScope()` in `@astryxdesign/cli/api` builds the scope Doctor reads a package's examples with, so a catalog can store it and a preview tool read examples exactly as Doctor does. A tool that shows an example as a live preview calls it, and `{@command doctor integration validate}` uses the same rule, so the two agree. An example with `kind: 'setup'` is code only. Any other example must run on its own: its code compiles as a TSX module; it renders something (a default export, then JSX at its end, then the last component it declares); it imports only the package, the packages the package declares, React and Core, never a relative path or code that runs only on a server; and every name it uses is defined in it, imported, named in the scope, or a JavaScript or browser global (the name of an element only from the example or the scope, as a global such as `Image` is not a component). The result is `{previewable: true, module}`, a module that imports each scope name it uses and default-exports what it renders, so a bundler can build it as is; `{previewable: false, setup: true}`; or `{previewable: false, setup: false, problems}`, each problem with a `code` (`example_does_not_compile` with `line` and `column`, `example_renders_nothing`, `example_undefined_name` with `names`, `example_server_only`, or `example_import_unresolvable` with `specifier`), a `message` and a `fix`.",
  appliesTo:
    'The second argument of `previewableExample`, from `@astryxdesign/cli/authoring`',
  fields: [
    {
      name: 'packageName',
      type: 'string',
      description: 'The package the example documents. It may import itself.',
      required: true,
    },
    {
      name: 'packageNames',
      type: 'ExampleScopeName[]',
      description:
        'Each component the package documents, as `{name, import}`: the name, and the specifier an app imports it from. Its names win over Core and React names.',
      required: true,
    },
    {
      name: 'coreNames',
      type: 'ExampleScopeName[]',
      description:
        'Each component and hook Core documents. Its names win over React names.',
      required: true,
    },
    {
      name: 'reactNames',
      type: 'string[]',
      description:
        "React's named exports. The example may also use `React`, the namespace.",
      required: true,
    },
    {
      name: 'dependencies',
      type: 'string[]',
      description:
        'The packages the package declares in `dependencies`, `peerDependencies` and `optionalDependencies`. React and Core may always be imported.',
      required: true,
    },
    {
      name: 'serverOnlyModules',
      type: 'string[]',
      description:
        "The package's own import specifiers whose module runs only on a server: it imports `server-only`. Every scope also counts `server-only`, `next/headers`, `next/server`, `next/cache`, and a Node built-in the package does not install.",
    },
    {
      name: 'serverComponents',
      type: 'string[]',
      description:
        "The package's documented components that only a server renders: async function components. An example that renders one, without importing it or through an import of the package, cannot preview.",
    },
  ],
};
