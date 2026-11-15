// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Types for reading a doc example as a module that runs on its own.
 * @input Nothing; types only.
 * @output ExampleScope, PreviewableExample, ExampleProblem and the names they
 *   compose from.
 * @position packages/cli/authoring/example — the contract `preview.mjs`
 *   implements and `example.doc.mjs` documents.
 */

/**
 * Why an example that is not `kind: 'setup'` cannot run on its own.
 * - `example_does_not_compile`: the code is not a TSX module (a top-level
 *   `return`, code that stops partway, a syntax error).
 * - `example_renders_nothing`: no default export, no component, and no JSX
 *   at the end.
 * - `example_undefined_name`: a name the example never defines or imports
 *   and its scope does not provide.
 * - `example_server_only`: it imports code that runs only on a server,
 *   renders an async server component, or reads `process.env`.
 * - `example_import_unresolvable`: it imports a relative path, or a package
 *   its package does not declare.
 */
export type ExampleProblemCode =
  | 'example_does_not_compile'
  | 'example_renders_nothing'
  | 'example_undefined_name'
  | 'example_server_only'
  | 'example_import_unresolvable';

/** One reason an example cannot preview, with what to change. */
export interface ExampleProblem {
  code: ExampleProblemCode;
  /** What is wrong and what it breaks, as one clause. */
  message: string;
  /** What to change, as one or two sentences. */
  fix: string;
  /**
   * The names an `example_undefined_name` problem found, in order of use, or
   * the server component an `example_server_only` problem found.
   */
  names?: string[];
  /** The import an import problem is about. */
  specifier?: string;
  /** Where a `example_does_not_compile` problem is, 1-based. */
  line?: number;
  /** Where a `example_does_not_compile` problem is, 0-based. */
  column?: number;
}

/** A name an example may use without importing it, and where it comes from. */
export interface ExampleScopeName {
  name: string;
  /** The module specifier an app imports the name from. */
  import: string;
}

/**
 * What an example may use without importing it, and what it may import, as
 * JSON: one tool can build it (`integrationExampleScope` in
 * `@astryxdesign/cli/api`) and store it, and another read examples with it.
 * When two lists give one name, the package's own wins over Core's, and
 * Core's over React's.
 */
export interface ExampleScope {
  /** The package the example documents. It may import itself. */
  packageName: string;
  /** Each component the package documents. */
  packageNames: ReadonlyArray<ExampleScopeName>;
  /** Each component and hook Core documents. */
  coreNames: ReadonlyArray<ExampleScopeName>;
  /** React's named exports. `React` itself is the namespace. */
  reactNames: ReadonlyArray<string>;
  /**
   * The packages the package declares in `dependencies`,
   * `peerDependencies` and `optionalDependencies`. React and Core may always
   * be imported.
   */
  dependencies: ReadonlyArray<string>;
  /**
   * The package's own import specifiers whose module runs only on a server
   * (it imports `server-only`), such as `'@acme/widgets/server'`. Every scope
   * also counts `server-only`, `next/headers`, `next/server`, `next/cache` and
   * a Node built-in the package does not install.
   */
  serverOnlyModules?: ReadonlyArray<string>;
  /**
   * The package's documented components that only a server renders: async
   * function components. An example that renders one is server-only.
   */
  serverComponents?: ReadonlyArray<string>;
}

/**
 * An example read as a module. A previewable example's `module` imports
 * every scope name it uses and default-exports what it renders.
 */
export type PreviewableExample =
  | {previewable: true; module: string}
  | {previewable: false; setup: true}
  | {previewable: false; setup: false; problems: ExampleProblem[]};
