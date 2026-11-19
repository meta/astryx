// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Public type surface for an Astryx config file (`astryx.config.{ts,mjs,js}`).
 *
 * Authors write a plain object against {@link AstryxConfig} — in TS via
 * `satisfies AstryxConfig`, in JS via `/** @type {import('@astryxdesign/cli/authoring').AstryxConfig} *\/`.
 * The CLI turns the loaded value into this type via `parseConfig` at the load
 * boundary; there is no factory to call.
 */

import type {DebugEventHandler} from '../debug/type.js';
import type {GapReportHandler} from '../gap-report/type.js';
import type {DiscoverSource} from '../discover/type.js';

/**
 * A command to run as part of a post-codemod hook. Returned by a hook's
 * `buildCommand` and executed after codemods write files.
 */
export interface PostCodemodCommand {
  command: string;
  args?: string[];
  options?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    timeout?: number;
  };
}

/**
 * A post-codemod hook. `buildCommand` receives the package directory and the
 * list of files changed by codemods, and returns the command to run (or a
 * nullish value to skip).
 */
export type PostCodemodHook = {
  name?: string;
  buildCommand: (ctx: {
    packageDir: string;
    files: string[];
  }) =>
    | PostCodemodCommand
    | null
    | undefined
    | Promise<PostCodemodCommand | null | undefined>;
};

/** A component XLE layout expressions can reference by name via `{hint}`. */
export interface XleComponent {
  /** Import specifier the component is imported from, e.g. '@/components/KpiCard'. */
  from: string;
  /** Optional human description shown in tooling. */
  description?: string;
  /** Import as the module's default export instead of a named export. Defaults to false. */
  default?: boolean;
}

/**
 * Record every astryx command run in this project.
 *
 * A function that receives each run. Leaving it out does not stop a handler an
 * integration contributes; see {@link AstryxConfig.debug} for how the two
 * combine and how to refuse inherited handlers.
 *
 * ```
 * export default {
 *   debug: event => appendFileSync('runs.ndjson', JSON.stringify(event) + '\n'),
 * };
 * ```
 *
 * Runs synchronously at process exit — see {@link DebugEventHandler} for what
 * that rules out.
 */
export type DebugConfig = DebugEventHandler;

/** User config exported from astryx.config.{ts,mjs,js}. */
export interface AstryxConfig {
  /** Integration package names to load. */
  integrations?: string[];
  /** Where to file issues/feedback for this project. */
  issuesUrl?: string;
  /** Lifecycle hooks. */
  hooks?: {
    postCodemod?: PostCodemodHook[];
  };
  /**
   * Record every astryx command run in this project. See {@link DebugConfig}.
   *
   * An integration can contribute a handler too, as a `debug` named export
   * from its `astryx.integration.*` module. Every handler receives the run:
   * this one first, then each integration's in load order (the ones
   * `integrations` lists, in that order, then autolinked ones). A handler that
   * throws is skipped; the others still run and the command's result does not
   * change. To refuse inherited handlers, set
   * `{"astryx": {"inheritDebug": false}}` in the project's package.json; this
   * handler still runs.
   */
  debug?: DebugConfig;
  /** Route gap reports through a project-owned handler. See {@link GapReportHandler}. */
  gapReport?: GapReportHandler;
  /**
   * Tell `astryx discover` about integrations this project could add. See
   * {@link DiscoverSource}.
   *
   * An integration can provide a source too, as a `discover` named export from
   * its `astryx.integration.*` module. Discover calls every source: this one
   * first, then each integration's in load order, and one that fails never
   * hides the others.
   */
  discover?: DiscoverSource;
  /**
   * Where the Astryx skill goes in this project. `astryx init --to` writes
   * it, `astryx init` writes each place it names, and `astryx upgrade
   * --apply` refreshes them.
   */
  skills?: {
    /**
     * The places, one or a list: `'agents-md'` (the managed block in
     * AGENTS.md and the agent files beside it), `'skills'` (the project
     * skills folders, `.agents/skills/astryx-project` and
     * `.claude/skills/astryx-project`),
     * or a folder in the project written as `'./<path>'` (`'./team-skills'`), which
     * gets `<folder>/astryx-project/SKILL.md`. Leaving it out means `'agents-md'`.
     */
    to?: string | string[];
  };
  /**
   * EXPERIMENTAL — shape may change and is not part of the stable config
   * contract. Provisional home for features still being proven out.
   */
  experimental?: {
    /** Experimental XLE (layout expression) configuration. */
    xle?: {
      /**
       * Custom components for the removed layout expander, keyed by
       * component name. The CLI still validates the field, so an entry
       * without a string `from` makes `astryx.config` invalid, but nothing
       * reads it.
       */
      components?: Record<string, XleComponent>;
    };
    /**
     * Experimental icon sets (spec:AST-084): the project's main icon set, a
     * set name (`"outline"`) or `"<package>/<set>"`. A list
     * (`["outline", "@acme/icons/brand"]`) names the main set first, then
     * backup sets in order: a copied template takes each icon from the first
     * set that has its meaning. Copied templates use these icons only when it
     * is set. `astryx discover` and `astryx doctor` report icon sets when it is
     * set or when an icon-set package is installed.
     * @experimental May change or be removed in a patch release.
     */
    iconSet?: string | string[];
    /**
     * Experimental icon variant: the look every icon of the project draws,
     * by the name the sets declare (`"filled"`). Each set in `iconSet` that
     * declares a variant of that name draws it; a set that does not draws
     * its default look. The main set must declare it. Needs `iconSet`.
     * @experimental May change or be removed in a patch release.
     */
    iconVariant?: string;
  };
}
