// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Node test cases only Windows or macOS can run, each with the file
 *   that holds it and the runner of its leg in the platform-only workflow.
 * @position Read by .github/scripts/vitest.platform-only.config.mjs (which
 *   files to run) and .github/scripts/platform-only-report.mjs (which case a
 *   failed leg names). No dependencies, so the report job loads it without an
 *   install.
 */

/** Each leg's runner, file and the case only its platform runs. */
export const PLATFORM_ONLY = [
  {
    os: 'windows-latest',
    file: 'packages/cli/foundation/fs/path-safety.test.mjs',
    case: 'reads Windows drive paths',
  },
  {
    os: 'macos-latest',
    file: 'packages/native/src/icons/defaults.test.ts',
    case: 'names only SF Symbols the system has',
  },
];
