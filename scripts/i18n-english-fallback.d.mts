// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Absolute path of packages/core/src. */
export const CORE_SRC_DIR: string;
/** Absolute path of the generated per-module English maps. */
export const ENGLISH_FALLBACK_DIR: string;
/** Core modules (relative to src) that register the whole English catalog. */
export const FULL_FALLBACK_MODULES: readonly string[];
/** Whether a path relative to packages/core/src ships in the package build. */
export function isShippedSourceModule(relPath: string): boolean;
/** Every string literal in a module that is a key of `catalog`, sorted. */
export function collectCatalogKeys(
  sourceText: string,
  fileName: string,
  catalog: Readonly<Record<string, string>>,
): string[];
/** Shipped Core module (relative to src) → the catalog keys it names. */
export function collectEnglishFallbackSlices(
  englishCatalog: Readonly<Record<string, string>>,
  srcDir?: string,
): Map<string, string[]>;
/** A module's generated map path, relative to ENGLISH_FALLBACK_DIR. */
export function getSliceModuleName(sourceRel: string): string;
/** The specifier a module imports its generated map with. */
export function getSliceImportSpecifier(sourceRel: string): string;
/** Modules that name keys without reaching their own map, and other misuse. */
export function findWiringProblems(
  slices: Map<string, string[]>,
  srcDir?: string,
): string[];
