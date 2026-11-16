// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Base adapter contracts: the inputs the CLI passes to each step and the
 * result each step returns.
 *
 * A step receives plain data and returns data or source text, or a typed
 * failure. It never writes, prints, reads stdin, or exits: the CLI does every
 * write and every output. Contracts only grow: a new optional input, never a
 * removed field. Extra output fields are ignored.
 */

/** What every step receives beside its input. */
export interface StepContext {
  /** The folder the command runs in. */
  cwd: string;
  /** The project root, or null outside a project. */
  projectDir: string | null;
  /** The active base. */
  base: {name: string; dir: string; version: string | null};
  /** The running CLI's version. */
  cliVersion: string;
  /** True when the project has a `tsconfig*.json`. */
  typescript: boolean;
  /** Read a file inside the project or the base package. Resolves to null
   *  when the file is missing or outside both. */
  read(path: string): Promise<string | null>;
}

/** Why a step did not produce a result. */
export interface StepFailure {
  /** `invalid-input`: the input cannot be served, such as a token with no
   *  platform value. `unsupported`: the base does not do this. `not-found`:
   *  a named item does not exist. `conflict`: the result would replace
   *  something it must not. */
  code: 'invalid-input' | 'unsupported' | 'not-found' | 'conflict';
  /** One sentence, shown as written. */
  message: string;
  /** The file, and line when known, that caused the failure. */
  at?: {file: string; line?: number};
  /** A command or action that fixes it. */
  fix?: string;
}

/** What a step returns. */
export type StepResult<T> =
  | {ok: true; value: T; warnings?: string[]; notices?: string[]}
  | {ok: false; failure: StepFailure};

/** One file a step asks the CLI to write. The CLI picks the folder. */
export interface OutFile {
  /** The file name, without a folder. */
  name: string;
  /** What the file is, such as `module`, `stylesheet`, or `types`. */
  role: string;
  contents: string;
}

/** One step: input and context in, a result out. */
export type Step<I, O> = (
  input: I,
  ctx: StepContext,
) => StepResult<O> | Promise<StepResult<O>>;

// ─── themes ───────────────────────────────────────────────────────────

/** `themes.targets` takes no input. */
export type ThemesTargetsInput = Record<string, never>;

/** One theming target: a key a theme may override. */
export interface ThemesTarget {
  key: string;
  component: string;
  /** The class the target renders as, on a platform that has classes. */
  className?: string;
  props: string[];
  states: string[];
}

/** `themes.targets` result. The CLI filters it and suggests near misses. */
export interface ThemesTargetsOutput {
  targets: ThemesTarget[];
}

/** `themes.compile` input: the theme source the CLI loaded. */
export interface ThemesCompileInput {
  theme: {
    /** The source file, relative to the folder the command runs in. */
    file: string;
    /** The export that holds the theme. */
    exportName: string;
    /** The exported value. */
    value: unknown;
  };
  /** The theme's name. */
  name: string;
  /** `--icons-specifier`, when given. */
  iconsSpecifier?: string;
}

/** `themes.compile` result. `files` holds exactly one `role: 'module'`
 *  file, named `<name>.js`, `.mjs`, `.ts`, or `.tsx`, so `theme add` finds
 *  it beside the source. */
export interface ThemesCompileOutput {
  name: string;
  files: OutFile[];
  tokenCount: number;
  componentCount: number;
}

/** One theme the app module imports. Specifiers are relative to the
 *  module file. */
export interface ThemesAppModuleTheme {
  slug: string;
  /** The package or local theme root that owns the theme. */
  owner: string;
  exportName: string;
  module: string;
  /** The stylesheet to import, or null when the theme has none. */
  stylesheet: string | null;
  fontStylesheet?: string;
}

/** `themes.appModule` input. */
export interface ThemesAppModuleInput {
  themes: ThemesAppModuleTheme[];
  defaultSlug: string;
}

/** `themes.appModule` result: the module source, without the generated
 *  header, which the CLI adds. It exports `themes` and `defaultThemeSlug`. */
export interface ThemesAppModuleOutput {
  source: string;
}

/** The functions a `themes` adapter module exports. */
export interface ThemesAdapter {
  targets?: Step<ThemesTargetsInput, ThemesTargetsOutput>;
  compile?: Step<ThemesCompileInput, ThemesCompileOutput>;
  appModule?: Step<ThemesAppModuleInput, ThemesAppModuleOutput>;
}
