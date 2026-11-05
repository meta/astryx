// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-spec-files.mjs
 * @input Repository-relative paths
 * @output The browser accessibility spec globs `playwright.config.ts` runs,
 *   and `isA11ySpecFile`
 * @position The one list of browser accessibility spec files. The Playwright
 *   config matches them, and the default touched-components check (spec:AST-030
 *   FR12) uses the same list to find the specs a pull request changes. No
 *   imports and no `import.meta`, so Playwright's config loader and plain Node
 *   both load it before dependencies are installed.
 */

/** Every browser accessibility spec, run in Chromium. */
export const A11Y_SPEC_GLOBS = Object.freeze([
  // The contract's own conforming/violating fixture proof.
  'internal/a11y-spec/src/**/*.chromium.spec.ts',
  // Component bindings.
  'packages/*/src/**/*.a11y.chromium.spec.ts',
  'packages/*/src/**/*.a11y.browser.spec.ts',
]);

/** The specs that also run in WebKit. */
export const WEBKIT_A11Y_SPEC_GLOBS = Object.freeze([
  'packages/*/src/**/*.a11y.browser.spec.ts',
]);

/**
 * A glob in Playwright's subset (`**` any depth, `*` within one segment) as a
 * regular expression over a repository-relative path.
 * @param {string} glob
 */
export function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      // `**/` matches zero or more whole segments.
      source += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

const PATTERNS = A11Y_SPEC_GLOBS.map(globToRegExp);

/** Whether a repository-relative path is a browser accessibility spec. */
export function isA11ySpecFile(file) {
  return PATTERNS.some(pattern => pattern.test(file));
}
