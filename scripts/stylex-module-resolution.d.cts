// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylex-module-resolution.d.cts
 * @output Types for stylex-module-resolution.cjs, for the TypeScript configs
 *   (Storybook, Sandbox, Vitest, the vibe-test apps) that import it
 */

/** StyleX's `unstable_moduleResolution` of type `custom`. */
interface StylexCustomModuleResolution {
  type: 'custom';
  filePathResolver: (
    importPath: string,
    sourceFilePath: string,
    aliases: null | undefined | Readonly<Record<string, ReadonlyArray<string>>>,
  ) => string | undefined;
  getCanonicalFilePath: (filePath: string) => string;
}

declare const resolution: {
  /** The resolution for this repository's workspace. */
  stylexModuleResolution: StylexCustomModuleResolution;
  /** The resolution for a workspace at `root` (a test passes a fixture). */
  createStylexModuleResolution(options?: {
    root?: string;
    workspaceRoots?: ReadonlyArray<string>;
  }): StylexCustomModuleResolution;
};

export = resolution;
