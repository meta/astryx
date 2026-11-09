// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Types for the CLI capability manifest emitted by `astryx manifest --json`
 * (and embedded under `data.manifest` of the bare `xds --json` help envelope).
 *
 * The manifest is a self-describing view of the entire CLI surface so an agent
 * can discover every command, argument, flag, and response type in one call —
 * without scraping `--help`. Most of it is derived from Commander metadata; see
 * lib/manifest.mjs.
 */

/** A single command-line flag/option. */
export interface ManifestOption {
  /** Raw Commander flag spec, e.g. `--detail <level>` or `-o, --out <path>`. */
  flag: string;
  description: string;
  /** `boolean` for flags, `string` for value options, `enum` when choices exist. */
  type: 'boolean' | 'string' | 'enum';
  /** Allowed values when `type` is `enum`. */
  choices?: string[];
  /** Default value, if any. */
  default?: unknown;
  /** True for `--no-foo` style negation flags. */
  negate?: boolean;
}

/** A positional argument. */
export interface ManifestArgument {
  name: string;
  required: boolean;
  variadic: boolean;
  description: string;
}

/** A single command (possibly with subcommands). */
export interface ManifestCommand {
  /** Fully-qualified name, e.g. `theme build`. */
  name: string;
  description: string;
  arguments: ManifestArgument[];
  options: ManifestOption[];
  /** Whether this command supports `--json` (from the JSON_SUPPORTED allowlist). */
  json: boolean;
  /** Command aliases, if any. */
  aliases?: string[];
  /** Response `type` discriminators this command can emit in `--json` mode. */
  responseTypes?: string[];
  /** Example invocations. */
  examples?: string[];
  /** Documented exit codes: the process exit status and when it occurs. */
  exitCodes?: {code: number; when: string}[];
  /**
   * What the command does in a folder outside any project: `same` gives the
   * answer it gives in a new project; `refuse` writes nothing and fails, naming
   * the app project or integration package it needs; `own` does something
   * else, which its docs state. Absent on a group that only holds subcommands.
   */
  outsideProject?: 'same' | 'refuse' | 'own';
  /** Nested subcommands (e.g. `theme build` under `theme`). */
  subcommands?: ManifestCommand[];
}

/** The full manifest payload (the `data` of the `manifest` envelope). */
export interface CLIManifest {
  name: 'astryx';
  version: string;
  apiVersion: number;
  description: string;
  globalOptions: ManifestOption[];
  commands: ManifestCommand[];
  /** Sorted list of fully-qualified command names that support `--json`. */
  jsonSupported: string[];
  /** What a run may do beyond its command (the hand-off, the daily update check, the agent skill), and the docs topic that explains it. */
  globalMode: {docs: string; summary: string};
  /** Flat index of response `type` discriminators keyed by command name. */
  responseTypes: Record<string, string[]>;
}

/** The `astryx manifest --json` envelope. */
export interface ManifestResponse {
  type: 'manifest';
  data: CLIManifest;
}
