// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Public type surface for discover sources.
 *
 * A discover source tells `astryx discover` which integrations exist beyond the
 * ones a project already has. A project sets one as `discover` in
 * `astryx.config`; an integration exports one as a `discover` NAMED export from
 * its manifest. Discover calls every source, checks each answer, keeps a saved
 * copy of the last good one, and never installs, enables, or runs anything a
 * catalog names.
 */

/** Kinds of item a package can add. */
export type DiscoverKind =
  | 'component'
  | 'template'
  | 'doc'
  | 'theme'
  | 'codemod'
  | 'agent-doc'
  /**
   * An icon set, read only in a project that sets `experimental.iconSet`.
   * @experimental May change or be removed in a patch release.
   */
  | 'icon-set';

/** One item a package version adds. */
export interface DiscoverContribution {
  kind: DiscoverKind;
  /**
   * The name the CLI uses for it: a component name, template id, doc topic,
   * theme slug, codemod id, or icon set name.
   */
  name: string;
  title?: string;
  summary?: string;
  keywords?: string[];
  /**
   * For an icon set: how many icons it has.
   * @experimental May change or be removed in a patch release.
   */
  iconCount?: number;
  /**
   * For an icon set: the icon definitions its `map` covers.
   * @experimental May change or be removed in a patch release.
   */
  definitions?: string[];
}

/** One published version of a package. */
export interface DiscoverVersion {
  version: string;
  /** ISO 8601 publish time, or null when the source does not know it. */
  publishedAt: string | null;
  prerelease: boolean;
  /** `ok`, or why the source could not read this version. */
  status: string;
}

/** One npm package a source knows about. */
export interface DiscoverPackage {
  package: string;
  /** Shared by every npm name that publishes the same integration. */
  integration: string;
  /** The integration's other npm names. Discover never offers one the project has. */
  aliases: string[];
  description?: string;
  /** The latest release, or null when the package has only prereleases. */
  latest: string | null;
  /** Every version, newest first. */
  versions: DiscoverVersion[];
  /** What the requested version adds, or the latest when none was requested. */
  contributions: DiscoverContribution[];
}

/** What a discover source returns. */
export interface DiscoverCatalog {
  schemaVersion: 1;
  source: {
    /** Shown to people, for example "Acme catalog". */
    name: string;
    /** ISO 8601 time the source's data was produced. */
    generatedAt: string;
    /** False when the source knows its list is partial. */
    complete: boolean;
  };
  packages: DiscoverPackage[];
}

/** One call to a discover source. */
export interface DiscoverSourceContext {
  /** Aborted when the source exceeds its 30-second budget. */
  readonly signal: AbortSignal;
  /** Asks for one package: every version, and `version`'s contributions. */
  readonly package?: string;
  /** With `package`: the version whose contributions to return. Defaults to the latest. */
  readonly version?: string;
}

/**
 * A discover source: an async function, like `debug`. Set it as `discover` in
 * astryx.config, or export it as `discover` from an integration manifest.
 */
export type DiscoverSource = (
  context: DiscoverSourceContext,
) => Promise<DiscoverCatalog>;
