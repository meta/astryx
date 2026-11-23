// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file packageText.ts
 * @input The generated README and changelog text of each package
 * @output The text of each package, in the order of the package registry
 * @position Server-side input of the package pages and the changelog routes.
 *   The text is megabytes: no client module imports this file.
 */

import text from '../generated/packageText.json';

export interface PackageText {
  name: string;
  readme: string | null;
  changelog: string | null;
}

export const packageText: PackageText[] = text;
