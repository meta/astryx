// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Public type surface for an Astryx integration manifest
 * (`astryx.integration.{ts,mjs,js}`, sibling to the integration package's
 * package.json). Identity defaults to the package name, but `providerId` can keep
 * a stable logical identity across an explicit package rename. Authors write a
 * plain object against {@link AstryxIntegration}; the CLI validates it via
 * `parseIntegration` at the load boundary.
 *
 * The manifest module may also carry `debug` and `gapReport` NAMED exports.
 * They are not fields here on purpose: a CLI released before a given manifest
 * field existed could reject it and lose every contribution, while an unknown
 * named export is simply not read. See `astryx docs authoring`.
 */
export interface AstryxIntegration {
  /** Stable logical provider ID. Omit to use package.json#name. Set this only
   *  when a package rename must preserve existing artifact IDs. */
  providerId?: string;
  /** Relative path to the components/docs root (resolved to absolute). */
  components?: string;
  /** Relative path to the templates root (resolved to absolute). */
  templates?: string;
  /** Relative path to the codemods root (resolved to absolute).
   *  The root uses a version-folder-first layout:
   *  `<codemodsRoot>/<version>/<id>.<ext>`, where `<version>` is an exact
   *  semver string (e.g. `0.2.0`, no `v` prefix) and `<id>` is a kebab-case
   *  module basename. Each module default-exports a codemod envelope stamped
   *  `type: 'code'` or `type: 'config'`. Codemod ids must be unique within
   *  a package across all versions. */
  codemods?: string;
  /** Relative path to the reference-docs (topics) root (resolved to
   *  absolute). Every `{topic}.doc.{ts,mjs,js}` under it is a topic the CLI
   *  serves from `astryx docs`, alongside the built-in ones. A topic may also
   *  `replace` or `extend` a built-in topic; see the ReferenceDoc type. */
  docs?: string;
  /** Relative path to the source-theme root (resolved to absolute). Each
   *  lower-kebab theme directory contains a source module and mandatory
   *  same-stem, strongly typed `.doc.mjs` descriptor. */
  themes?: string;
  /** Experimental contribution roots (spec:AST-017 FR27).
   *  @experimental Their shape may change or be removed in a patch release. */
  experimental?: {
    /** Relative path to the icon-set root (spec:AST-084). Each lower-kebab
     *  directory under it is one icon set holding a strongly typed
     *  `<name>.doc.mjs` IconSetDoc and its `<name>.icons.json` data file. */
    iconSets?: string;
  };
  /** Static package guidance appended to the CLI-owned managed agent block. */
  agentDocs?: {
    append?: readonly string[];
  };
  /** Where to file issues/feedback for this integration. */
  issuesUrl?: string;
  /** Link to this integration's docs site, such as its home page. The CLI
   *  accepts it as a known field; catalogs that list the package may show
   *  it. */
  docsiteUrl?: string;
  /** The command that runs the Astryx CLI for this package's users, such as
   *  `acme astryx`. Every command the CLI prints in a project that loads
   *  this package starts with it, in place of the package-manager prefix
   *  (`pnpm exec astryx`, `yarn astryx`). One line, no subcommand. When two
   *  loaded integrations set different commands, neither is used and
   *  `astryx doctor` warns. An invalid value is ignored with a warning; the
   *  rest of the manifest still loads. JSON output keeps commands bare. */
  cliCommand?: string;
}

/**
 * A handler that receives a normalized gap report. Used as a named export
 * from integration manifests and as a config field.
 *
 * Re-exported from `@astryxdesign/cli/authoring`; see
 * `authoring/gap-report/type.ts` for the full contract.
 */
export type {
  GapReportHandler,
  GapReportHandlerContext,
  GapReport,
  GapReportCategory,
  GapReportTarget,
  GapReportHandlerReceipt,
} from '../gap-report/type.js';
