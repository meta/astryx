// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file undefinedVariables.ts
 * @input A stylesheet's text, the StyleX class-name prefixes, and the other
 *   stylesheets the build emits
 * @output undefinedGeneratedVariables, the generated custom properties the
 *   stylesheet reads but never declares
 * @position Internal to @astryxdesign/build: astryxStylex (vite.ts) runs it
 *   on a production stylesheet and warns about what it finds. Not exported
 *   from any package entry.
 */

/**
 * The StyleX-generated custom properties `css` reads that it never declares.
 *
 * StyleX names the variables it generates `--<prefix><hash>` (a theme
 * variable, or a constant waiting for its value). One that is read but never
 * declared is a value that compiled to a variable nothing sets, so browsers
 * drop the declaration or take its fallback: a constant whose defining module
 * never reached the build, or a plain export read from a `.stylex.ts` file as
 * if it were a token. The dynamic-style variables StyleX sets inline
 * (`--<prefix>-<property>`) and component variables with a dash after the
 * prefix are not generated names and are never reported.
 *
 * Only a hash-shaped name counts as generated: the prefix and four to seven
 * base-36 characters (StyleX's hash is a 32-bit value in base 36, shorter than
 * four characters about once in a hundred thousand). An app's own short names
 * (`--xl`) are never reported, and a property declared in any stylesheet the
 * build emits (`others`, the app's own CSS) is declared.
 *
 * SYNC: scripts/build-css.mjs `undefinedStyleXVariables` is the same check
 * for the prebuilt package stylesheets.
 */
export function undefinedGeneratedVariables(
  css: string,
  prefixes: readonly string[],
  others: readonly string[] = [],
): string[] {
  const names = prefixes
    .map(prefix => prefix.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .join('|');
  const declared = new Set(
    [css, ...others].flatMap(text =>
      [...text.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map(match => match[1]),
    ),
  );
  const read = new Set(
    [
      ...css.matchAll(
        new RegExp(`var\\(\\s*(--(?:${names})[a-z0-9]{4,7})\\s*[,)]`, 'g'),
      ),
    ].map(match => match[1]),
  );
  return [...read].filter(name => !declared.has(name)).sort();
}
