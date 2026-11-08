// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file published-exports.mjs
 * @input The materialized release snapshot (the `latest` content root) and
 *   the packages read from it, each with its `exports` map.
 * @output `createPublishedImportJudge` judges one import statement against
 *   that release. `missingPublishedImport` finds a source's first named
 *   import that the release lacks, and the subpaths it could not judge.
 * @position Build-time check for the production registry, on the CLI's own
 *   `exports`, import and export-list readers. A copied example that imports
 *   a name the published release lacks stays out until a release ships it.
 */

import * as path from 'node:path';
import {subpathDeclaration} from '../../../packages/cli/foundation/integrations/exports-subpaths.mjs';
import {
  declaredTargets,
  missingNames,
  readImports,
  splitSpecifier,
} from '../../../packages/cli/foundation/integrations/public-imports.mjs';

/** The package a bare specifier names: `@scope/name` or `name`. */
export function packageNameFromSpecifier(specifier) {
  return splitSpecifier(specifier)?.pkg ?? specifier;
}

/**
 * Whether a package's `exports` field declares the specifier's subpath for an
 * ES module importer. A package without the field allows every subpath.
 */
export function packageExportsSpecifier(pkg, specifier) {
  const {state} = subpathDeclaration(
    pkg.packageExports,
    splitSpecifier(specifier)?.subpath ?? '.',
  );
  return state === 'declared' || state === 'no_exports';
}

/**
 * Judges an import statement against the snapshot's packages with the CLI's
 * `missingNames`. It returns the names the release provably lacks, or `[]`
 * when it has them all. It returns null when it cannot tell, and undefined
 * for another package.
 */
export function createPublishedImportJudge(contentRoot, packages) {
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]));
  const lists = new Map();
  return function judge(statement) {
    const split = splitSpecifier(statement.source);
    const pkg = split == null ? undefined : byName.get(split.pkg);
    if (pkg == null) return undefined;
    const {files, allPresent} = declaredTargets(
      path.join(contentRoot, pkg.packagePath),
      subpathDeclaration(pkg.packageExports, split.subpath),
    );
    return missingNames(statement, files, lists, allPresent);
  };
}

/**
 * The first import in `source` whose names the release lacks, with every name
 * it lacks there (`missing`, else null). `unread` lists the subpaths of the
 * snapshot's packages that could not be judged.
 */
export function missingPublishedImport(source, judge) {
  const unread = [];
  for (const statement of readImports(source)) {
    const names = judge(statement);
    if (names === undefined) continue;
    if (names === null) {
      unread.push(statement.source);
      continue;
    }
    if (names.length > 0) {
      return {missing: {specifier: statement.source, names}, unread};
    }
  }
  return {missing: null, unread};
}
