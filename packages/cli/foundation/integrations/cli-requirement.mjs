// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI release an integration's newer contributions need
 * (spec:AST-046 FR11).
 *
 * @input A package.json object.
 * @output Whether its `peerDependencies` range for `@astryxdesign/cli` admits
 *   only CLIs that read what the package ships, and the package.json that
 *   declares that range.
 * @position foundation/integrations; read by `integration add doc --parent`
 *   and `integration add theme`, which declare the peer, and
 *   `integration verify`, which requires it.
 */

import {semverCompare} from '../env/semver.mjs';

export const CLI_PACKAGE = '@astryxdesign/cli';

/**
 * The first stable CLI release that reads an integration's docs tree:
 * namespace docs and placed guides. Published 0.6.3 rejects a namespace doc
 * and hides every doc topic the package ships, with no warning; published
 * 0.6.4 lists the namespace and reads its guides.
 */
export const NAMESPACE_DOCS_CLI = '0.6.4';

/**
 * The first stable CLI release that applies a template's `replaces`
 * (spec:AST-035 FR1). Published 0.6.3 and earlier reject the field, drop that
 * template, and hide every doc topic the package ships. Published 0.6.4 lists
 * the template, keeps the topics, answers the Core id with the replacement,
 * and still selects the Core original with `--package @astryxdesign/core`.
 */
export const TEMPLATE_REPLACES_CLI = '0.6.4';

/**
 * The first stable CLI release that reads a template's `keywords`. Published
 * 0.6.4 and 0.6.5 reject the field and drop that template but keep the
 * package's doc topics; 0.6.3 and earlier also hide them. Published 0.6.6
 * lists the template, and search matches its keywords.
 */
export const KEYWORDS_CLI = '0.6.6';

/**
 * The first stable CLI release that applies a component's `replaces`
 * (spec:AST-035 FR10). It is also the opt-in: a CLI applies a package's
 * component replacements only when the package's `@astryxdesign/cli` peer
 * range starts here, so a package published for an earlier CLI keeps the
 * behavior it shipped with. Earlier stable CLIs accept the field and keep the
 * component under its own name.
 *
 * Tied to the next patch slot: it must equal the first stable release that
 * ships component replacement. If that slot moves, change this constant and
 * its row in the floor table test together.
 */
export const COMPONENT_REPLACES_CLI = '0.6.7';

/**
 * The first stable CLI release that reads typed theme descriptors, the theme
 * folder `integration add theme` writes. Published 0.6.3 rejects a themes root
 * with no `manifest.json` catalog and withholds the package's themes and doc
 * topics; published 0.6.4 lists the themes.
 */
export const THEMES_CLI = '0.6.4';

/**
 * The first stable CLI release that reads a doc section's `id`. Published
 * 0.6.3 rejects the field and hides every doc topic the package ships;
 * published 0.6.4 reads the section by its id.
 */
export const SECTION_IDS_CLI = '0.6.4';

/**
 * The first stable CLI release that reads `stability` on a doc
 * (spec:AST-017 FR21, FR27). Published 0.7.3 refuses the field on a page or
 * block template, which it drops, and on a namespace doc, which hides every
 * doc topic the package ships; component docs and guides keep loading and
 * ignore it.
 *
 * Tied to the next patch slot: it must equal the first stable release that
 * reads the field.
 */
export const STABILITY_CLI = '0.7.4';

/**
 * The first stable CLI release that reads a template's `icons` declaration
 * (spec:AST-084 FR16). Published 0.7.3 refuses the field and drops that
 * template.
 *
 * Tied to the next patch slot, with {@link STABILITY_CLI}.
 */
export const TEMPLATE_ICONS_CLI = '0.7.4';

/**
 * The first CLI release that reads a doc section's `before` and `after`.
 * Earlier releases reject the fields and hide every doc topic the package
 * ships.
 */
export const SECTION_POSITION_CLI = '0.7.4';

/**
 * The first stable CLI release that renders doc tokens (`{@command …}`,
 * `{@pm …}`, `{@pm-only …}`) for the reader. Every earlier release prints
 * them as written, so readers see raw tokens.
 */
export const DOC_TOKENS_CLI = '0.7.4';

const VERSION_RE =
  /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * A version or partial version as MAJOR.MINOR.PATCH, a wildcard part as 0.
 * @param {string} text
 * @returns {string | null}
 */
function lowerVersion(text) {
  const m = VERSION_RE.exec(text.trim());
  if (!m) return null;
  return [m[1], m[2], m[3]]
    .map(part => (part == null || /^[xX*]$/.test(part) ? '0' : part))
    .join('.');
}

/**
 * The lowest version one space-joined comparator set admits, or null when it
 * has no lower bound this can read.
 * @param {string} set
 * @returns {string | null}
 */
function lowestOfSet(set) {
  if (set === '' || set === '*' || /^[xX]$/.test(set)) return null;
  const hyphen = /^(\S+)\s+-\s+\S+$/.exec(set);
  if (hyphen) return lowerVersion(hyphen[1]);
  /** @type {string | null} */
  let lowest = null;
  for (const comparator of set.split(/\s+/)) {
    const m = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(comparator);
    if (!m) return null;
    if (m[1] === '<' || m[1] === '<=') continue;
    const version = lowerVersion(m[2]);
    if (version == null) return null;
    if (lowest == null || semverCompare(version, lowest) > 0) lowest = version;
  }
  return lowest;
}

/**
 * The lowest version a semver range admits: the least of its `||`
 * alternatives. Null when an alternative has no lower bound, or the range is
 * not one this can read, so the caller treats it as admitting every version.
 * @param {unknown} range
 * @returns {string | null}
 */
export function lowestAdmitted(range) {
  if (typeof range !== 'string') return null;
  /** @type {string | null} */
  let lowest = null;
  for (const alternative of range.split('||')) {
    const low = lowestOfSet(alternative.trim());
    if (low == null) return null;
    if (lowest == null || semverCompare(low, lowest) < 0) lowest = low;
  }
  return lowest;
}

/**
 * Why a package that uses a feature an older CLI cannot read would lose it,
 * or null when its declared CLI range admits only CLIs that read it.
 * @param {any} pkg package.json
 * @param {string} feature what the package does, e.g. "ships a namespace doc"
 * @param {string} loss what an older CLI does with it
 * @param {string} floor the first stable CLI release that reads it
 * @returns {string | null}
 */
export function cliRangeProblem(pkg, feature, loss, floor) {
  // A floor that is missing or not a version means a caller passed the
  // arguments in another order, as after a merge with a caller written for
  // another signature. Fail loudly rather than compare a range against
  // feature text, or against nothing.
  if (typeof floor !== 'string' || lowerVersion(floor) == null) {
    throw new TypeError(`cliRangeProblem: floor "${floor}" is not a version`);
  }
  const range = pkg?.peerDependencies?.[CLI_PACKAGE];
  const fix = `"${CLI_PACKAGE}": ">=${floor}" in peerDependencies (optional in peerDependenciesMeta, if the CLI is not required)`;
  if (typeof range !== 'string') {
    return `The package ${feature} but declares no ${CLI_PACKAGE} peer. A stable CLI before ${floor} ${loss}. Declare ${fix}.`;
  }
  const lowest = lowestAdmitted(range);
  if (lowest == null || semverCompare(lowest, floor) < 0) {
    return `The package ${feature}, but its ${CLI_PACKAGE} peer range "${range}" admits a stable CLI before ${floor}, which ${loss}. Declare ${fix}.`;
  }
  return null;
}

/**
 * Why a package that ships a namespace doc or a placed guide would lose its
 * docs on an older CLI, or null when its declared CLI range admits only CLIs
 * that read the docs tree. Published 0.6.3 hides every topic of a package
 * with a namespace doc; builds of main before the docs tree also do so for a
 * placed guide. Published 0.6.4 reads both.
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function docsTreeCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'ships a namespace doc or a placed guide',
    'does not read the docs tree, and can hide every doc topic the package ships',
    NAMESPACE_DOCS_CLI,
  );
}

/**
 * Why a package with a template that sets `replaces` would lose that template
 * and its doc topics on an older CLI (spec:AST-035 FR1), or null when its
 * declared CLI range admits only CLIs that apply the field. Published 0.6.3
 * rejects the field; published 0.6.4 applies it.
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function replacesCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'has a template that sets `replaces`',
    "rejects the field, drops that template, and hides the package's doc topics",
    TEMPLATE_REPLACES_CLI,
  );
}

/**
 * Why a package with a component that sets `replaces` would not get the
 * replacement (spec:AST-035 FR10), or null when its declared CLI range starts
 * at the release that applies it. That range is the package's opt-in: without
 * it the component keeps its own name and the Core component stays selected.
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function componentReplacesCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'has a component that sets `replaces`',
    'ignores the field and keeps the component under its own name, and a later CLI applies the replacement only for a package whose range starts at that release',
    COMPONENT_REPLACES_CLI,
  );
}

/**
 * Why a package with a doc section that sets `id` would lose its doc topics on
 * an older CLI, or null when its declared CLI range admits only CLIs that read
 * the field. Published 0.6.3 rejects a section `id` and hides every doc topic
 * the package ships; published 0.6.4 reads it.
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function sectionIdsCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'has a doc section that sets `id`',
    'rejects the field, and can hide every doc topic the package ships',
    SECTION_IDS_CLI,
  );
}

/**
 * Why a package with a doc section that sets `before` or `after` would lose
 * its doc topics on an older CLI, or null when its declared CLI range admits
 * only CLIs that read the fields (spec:AST-046 FR11).
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function sectionPositionCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'has a doc section that sets `before` or `after`',
    'rejects the fields, and can hide every doc topic the package ships',
    SECTION_POSITION_CLI,
  );
}

/**
 * Why a package whose docs write doc tokens would show them raw on an older
 * CLI, or null when its declared CLI range admits only CLIs that render
 * them. Every release before the first that renders them prints a token as
 * written.
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function docTokensCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'writes doc tokens (`{@command …}`, `{@pm …}` or `{@pm-only …}`) in its docs',
    'prints each token as written, so readers see raw tokens instead of commands',
    DOC_TOKENS_CLI,
  );
}

/**
 * Why a package that ships a theme would lose its themes and doc topics on an
 * older CLI, or null when its declared CLI range admits only CLIs that read
 * typed theme descriptors. Published 0.6.3 rejects a themes root with no
 * `manifest.json` catalog, which `integration add theme` no longer writes;
 * published 0.6.4 reads the descriptors.
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function themesCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'ships a theme',
    "cannot read typed theme descriptors, and can drop the package's themes and hide its doc topics",
    THEMES_CLI,
  );
}

/**
 * Why a package with a template that sets `keywords` would lose that template
 * on an older CLI, or null when its declared CLI range admits only CLIs that
 * read the field. Published 0.6.4 and 0.6.5 reject the field and drop that
 * template; 0.6.3 and earlier also hide the package's doc topics. Published
 * 0.6.6 reads it.
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function keywordsCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'has a template that sets `keywords`',
    "rejects the field and drops that template, and one before 0.6.4 also hides the package's doc topics",
    KEYWORDS_CLI,
  );
}

/**
 * The package.json with a CLI peer of `>=floor`: optional, unless the package
 * already says otherwise. Call it only when the package's range admits a CLI
 * before `floor`, so a stricter range is never lowered.
 * @param {any} pkg package.json
 * @param {string} floor the first stable CLI release the package needs
 * @returns {any}
 */
export function withCliPeer(pkg, floor) {
  const meta = pkg.peerDependenciesMeta ?? {};
  return {
    ...pkg,
    peerDependencies: {
      ...(pkg.peerDependencies ?? {}),
      [CLI_PACKAGE]: `>=${floor}`,
    },
    peerDependenciesMeta: meta[CLI_PACKAGE]
      ? meta
      : {...meta, [CLI_PACKAGE]: {optional: true}},
  };
}

/**
 * The package.json with a CLI peer that reads namespace docs.
 * @param {any} pkg package.json
 * @returns {any}
 */
export function withDocsTreeCli(pkg) {
  return withCliPeer(pkg, NAMESPACE_DOCS_CLI);
}

/**
 * Why a package whose template or namespace doc sets `stability` would lose
 * it on an older CLI, or null when its declared CLI range admits only CLIs
 * that read the field.
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function stabilityCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'has a template or namespace doc that sets `stability`',
    "rejects the field and drops that descriptor, and for a namespace doc hides the package's doc topics",
    STABILITY_CLI,
  );
}

/**
 * Why a package with a template that declares `icons` would lose that
 * template on an older CLI, or null when its declared CLI range admits only
 * CLIs that read the field.
 * @param {any} pkg package.json
 * @returns {string | null}
 */
export function templateIconsCliProblem(pkg) {
  return cliRangeProblem(
    pkg,
    'has a template that declares `icons`',
    'rejects the field and drops that template',
    TEMPLATE_ICONS_CLI,
  );
}

/**
 * The first stable CLI release that reads `experimental.iconSet` in a
 * project's astryx.config (spec:AST-084 FR16). Published 0.7.3 refuses the
 * config ("Unrecognized key"), so commands that load the project
 * configuration, such as `doctor` and `discover`, fail in that project.
 *
 * Tied to the next patch slot, with {@link STABILITY_CLI}.
 */
export const CONFIG_ICON_SET_CLI = '0.7.4';

/**
 * Why an app project whose astryx.config sets `experimental.iconSet` would be
 * refused by a CLI it may run, or null when the `@astryxdesign/cli` range it
 * declares (in dependencies, devDependencies, optionalDependencies, or
 * peerDependencies) admits only CLIs that read the key. A project that
 * declares no range, or one that is not a version range (`workspace:`,
 * `file:`, `link:`), gets null: nothing says which CLI it runs.
 * @param {any} pkg the project's package.json
 * @returns {string | null}
 */
export function projectIconSetCliWarning(pkg) {
  const field = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ].find(name => typeof pkg?.[name]?.[CLI_PACKAGE] === 'string');
  if (!field) return null;
  const range = pkg[field][CLI_PACKAGE];
  if (range.includes(':')) return null;
  const lowest = lowestAdmitted(range);
  if (lowest != null && semverCompare(lowest, CONFIG_ICON_SET_CLI) >= 0) {
    return null;
  }
  return `The project's ${CLI_PACKAGE} range "${range}" (${field}) admits a release before ${CONFIG_ICON_SET_CLI}, which refuses an astryx.config that sets \`experimental.iconSet\` ("Unrecognized key"), so commands that load the project configuration, such as \`doctor\` and \`discover\`, fail there. Require "${CLI_PACKAGE}": ">=${CONFIG_ICON_SET_CLI}".`;
}
