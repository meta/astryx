// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Command doc types — the TERMINAL binding of an operation. A command is
 * not its own kind of behavior; it is a FunctionDoc exposed on the CLI, so this
 * doc references the function via `fn` and only carries CLI-surface facts (args,
 * flags, subcommands, terminal examples, exit codes). It is designed to be the
 * single source that a `defineCommand` converter turns into Commander config +
 * `--help`. Colocated at `clients/cli/commands/<name>.doc.mjs`.
 */

import type {AuthoredDocGraphFields} from '../base/type.js';
import type {ReferenceContentBlock} from '../reference/type.js';

/** A positional argument. `param` links it to a FunctionDoc param for its description. */
export interface CommandArgDoc {
  name: string;
  /** FunctionDoc param this arg binds to (inherits its description). */
  param?: string;
  /** Override description (else inherited from the referenced param). */
  description?: string;
  required?: boolean;
  variadic?: boolean;
}

/** A flag/option. `param` links it to a FunctionDoc param; `cliOnly` for flags
 *  with no function param (e.g. --json). */
export interface CommandOptionDoc {
  /** Commander flag spec, e.g. '-l, --limit <n>' | '--json'. */
  flag: string;
  /** FunctionDoc param this flag maps to (inherits its description). */
  param?: string;
  /** Override/explicit description (required when cliOnly). */
  description?: string;
  choices?: string[];
  /** Default value applied via Commander `.default()` (shown in --help). A
   *  boolean flag defaults to `false`; a repeatable value flag to `string[]`. */
  default?: string | boolean | string[];
  /** True for CLI-only flags with no function param. */
  cliOnly?: boolean;
}

/**
 * What a command does in a folder outside any project:
 * - `same`: it gives the answer it gives in a new project, reading the Core
 *   the answering release carries.
 * - `refuse`: it writes nothing and fails before doing any work, naming the app
 *   project or integration package it needs.
 * - `own`: it does something else.
 * Every `refuse` and `own` command also carries an `In global mode:` note
 * in its `notes`, for readers.
 */
export type CommandOutsideProject = 'same' | 'refuse' | 'own';

export interface CommandExampleDoc {
  label?: string;
  /** A full terminal invocation, e.g. 'astryx search button --json'. */
  cli: string;
  /** Optional sample output. */
  output?: string;
}

/**
 * A CLI command documentation file (.doc.mjs).
 *
 *   /\*\* @type {import('@astryxdesign/cli/authoring').CommandDoc} \*\/
 *   export const doc = { type: 'command', name: 'search', fn: 'search', ... };
 */
export interface CommandDoc extends AuthoredDocGraphFields {
  /** Doc-kind discriminant. */
  type?: 'command';
  /** Command path, e.g. 'search' | 'theme build'. */
  name: string;
  /** Human-readable display name, e.g. 'astryx search'. */
  displayName: string;
  /** One-line summary → Commander `.description()` + the docs listing. */
  summary: string;
  /** Longer help body / when-to-use. */
  description?: string;
  /** The group that reads this doc. The CLI's commands use 'cli/commands', which the docs tree adopts: each is the leaf `cli/commands/<name>`. Every command doc the CLI ships declares one, and `astryx doctor` fails on one that is missing or that nothing reads. */
  namespace?: string;
  /** Alternate slugs that also resolve to this doc. */
  aliases?: string[];
  /** Name of the FunctionDoc (and `@astryxdesign/cli/api` export) this wraps. */
  fn?: string;
  /** Positional arguments. */
  args?: CommandArgDoc[];
  /** Flags/options. */
  options?: CommandOptionDoc[];
  /** Subcommand names (for command groups like `theme` / `layout`). */
  subcommands?: string[];
  /** Terminal examples. */
  examples?: CommandExampleDoc[];
  /** Documented exit codes. */
  exitCodes?: {code: number; when: string}[];
  /** What the command does outside a project: `same`, `refuse`, or `own`. Every command and subcommand declares one, and `astryx manifest` publishes it; a command that only groups subcommands declares none. */
  outsideProject?: CommandOutsideProject;
  /** Deprecation notice — a DEP-* id and the replacement. */
  deprecated?: string;
  /** Related command names; the CLI links each to its doc. */
  related?: string[];
  /** Freeform prose/notes. */
  notes?: ReferenceContentBlock[];
}
