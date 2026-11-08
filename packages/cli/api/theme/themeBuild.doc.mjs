// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `themeBuild()` / `astryx theme build`. Colocated with
 * the API function it documents; the response-shape source of truth stays in
 * `theme.type.mjs`. Documents imported/inherited icons and atomic rejection
 * of registries that cannot be preserved in build/check modes.
 * @input themeBuild's build/check and icon-import behavior.
 * @output Consumer API documentation for generated theme artifacts.
 * @position packages/cli/api/theme — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeBuild',
  namespace: 'cli/api',
  displayName: 'themeBuild()',
  summary:
    'Compile a defineTheme() file to scoped CSS, a JS module, and type declarations, or check committed outputs for drift in CI.',
  description:
    'The compiler behind `{@command theme build}`. Reads a file that calls defineTheme() and ' +
    'writes a scoped CSS file, a JS module that re-exports the built theme, and a .d.ts ' +
    '(plus an optional .variants.d.ts when the theme adds custom prop values). It uses ' +
    "@astryxdesign/core's own generator, so the CSS matches what the <Theme> runtime emits. " +
    'When another build step emits the icon registry, ' +
    '{iconsSpecifier} declares the fully specified module path for the generated JS import. ' +
    'Real registry imports are preserved, including aliases, default imports, and namespace ' +
    'imports. Icons inherited through extends are retained, with child entries taking precedence. ' +
    'Comment and string contents do not affect import detection. ' +
    'An inline registry that cannot be preserved fails with ERR_THEME_INVALID before any ' +
    'output is written, including in check mode. Move the registry to its own module and ' +
    'import it into the theme file. ' +
    'With {check: true} it writes nothing and instead compares ' +
    'each output against disk, returning the drift: the CI guard for committed, generated theme CSS.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeBuild(file: string, options?: {out?: string, check?: boolean, iconsSpecifier?: string}, ctx?: {cwd?: string}): Promise<ThemeBuildResponse | ThemeBuildCheckResponse | null>',
  keywords: [
    'theme',
    'build',
    'compile',
    'css',
    'defineTheme',
    'check',
    'drift',
  ],
  params: [
    {
      name: 'file',
      type: 'string',
      description:
        'Path to a theme file that calls defineTheme(), resolved against cwd.',
      required: true,
    },
    {
      name: 'options.out',
      type: 'string',
      description:
        'Override the output CSS path, relative or absolute; a build refuses a path outside cwd, and check mode refuses only a relative path that escapes cwd. The .js, .d.ts and any .variants.d.ts are written in the same directory, named after the theme (<name>.js), not after the CSS file.',
    },
    {
      name: 'options.check',
      type: 'boolean',
      description:
        'Compile in memory and compare each output against what is on disk instead of writing: the CI drift guard. Because it writes nothing, it also compares outputs outside cwd; when those are stale, the report names the directory that contains them and the build and check commands to run from there, since a build refuses them and each output records the directory it was built from.',
      default: 'false',
    },
    {
      name: 'options.iconsSpecifier',
      type: 'string',
      description:
        'Override the selected icon-registry import specifier in the generated JS module, for example ./icons.mjs. With child and inherited registries, this changes the child registry import. When omitted, direct source specifiers are preserved; relative imports followed through a local base are rebased to the theme file. A registry inherited through a package theme must be imported directly to use this option.',
    },
    {
      name: 'ctx.cwd',
      type: 'string',
      description:
        'Directory the theme file, a relative out path, and the returned output paths resolve against. Every output a build writes is inside it, including the default outputs beside the theme file.',
      default: 'process.cwd()',
    },
  ],
  returns: [
    {
      type: 'theme.build',
      description:
        'Build receipt {name, tokenCount, componentCount, sizeKB, outputs, warnings, notices}: the theme name; how many tokens (portable plus theme-local) and component targets it overrides; the CSS size in KB; the written outputs {css, cssDts for strict side-effect imports, js, dts, and variantsDts when custom prop values were augmented}; warnings, the defects the author should fix, including exact canonical replacements for deprecated component target keys and declarations the generator dropped; and notices, advisories about a correct theme, such as a font it names but does not load. Resolves to null instead when the theme produced no CSS (nothing to build).',
    },
    {
      type: 'theme.build.check',
      description:
        'The {check: true} receipt: theme name, an upToDate flag, the stale outputs (each {path, reason: "missing" | "outdated"}), and the full list of checked paths. Writes nothing. Resolves to null, like a normal build, when the theme produces no CSS.',
    },
  ],
  throws: [
    {code: 'ERR_FILE_NOT_FOUND', when: 'the theme file does not exist'},
    {
      code: 'ERR_THEME_LOAD',
      when: 'the file cannot be loaded or parsed into a defineTheme() result',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'the resolved theme is invalid, for example it has no name, a custom Heading type has no standalone rule with a declaration the compiler can emit, or its icon registry cannot be preserved through an import (also rejected in check mode)',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'the theme name contains a path separator or traversal marker, or a written output resolves outside cwd (including through a symlink): an `out` path, relative or absolute, or the default outputs beside a theme file outside cwd. Check mode writes nothing, so it refuses only a relative `out` path that escapes cwd',
    },
    {
      code: 'ERR_CORE_NOT_FOUND',
      when: '@astryxdesign/core/theme cannot be imported; a built, resolvable @astryxdesign/core is required',
    },
    {
      code: 'ERR_CORE_INCOMPATIBLE',
      when: 'the installed @astryxdesign/core does not export generateAdaptationCSS and the theme either declares ordered adaptations or has lineage whose adaptation use could not be observed (upgrade core)',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'creating the output directory or writing the outputs fails (staged temp files are rolled back)',
    },
  ],
  examples: [
    {
      label: 'Build a theme',
      code: "const r = await themeBuild('src/themes/ocean.ts');",
    },
    {
      label: 'Check for drift (CI)',
      code: "const r = await themeBuild('src/themes/ocean.ts', {check: true});",
    },
    {
      label: 'Use a separately compiled icon registry',
      code: "const r = await themeBuild('src/themes/ocean.ts', {iconsSpecifier: './icons.mjs'});",
    },
  ],
  command: 'theme build',
  related: ['themeTemplate', 'themeAdd', 'themeListAvailable', 'listThemes'],
};
