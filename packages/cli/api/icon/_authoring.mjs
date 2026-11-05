// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon-set authoring writes (spec:AST-084 FR13): start a set and add
 * one of its own icon definitions in the local integration package. Every
 * file it reads or writes goes through here; it is imported only by the
 * `icon` subject's adapter (architecture:cli-surface INV21).
 *
 * @position api/icon — helper of api/icon/_adapter.mjs, read by
 *   api/icon/new-set and api/icon/new-definition
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  assertWithin,
  PathSafetyError,
  sanitizeName,
} from '../../foundation/fs/path-safety.mjs';
import {
  findLocalIntegrationManifestOrNull,
  IntegrationRootConflictError,
  patchIntegrationRoot,
} from '../../foundation/integrations/manifest-writer.mjs';
import {loadManifestObject} from '../../foundation/integrations/integrations.mjs';
import {assertContributionVisible} from '../../foundation/integrations/contribution-inventory.mjs';
import {
  IconSetAuthoringError,
  checkNewDefinition,
  definitionFile,
  findLocalIconSet,
  generatedModulePath,
  generatedModuleText,
  generatedOrigins,
  sameIconModule,
  generatedTypesPath,
  THEME_MAP_NAME,
  entryWiringNote,
  iconSetDataText,
  journalFile,
  librarySource,
  libraryIcons,
  nonIconExports,
  resolveIconSource,
  peerNote,
  typecheckNote,
  writeDefinitionFile,
  writeGeneratedIcons,
  writeIconSetData,
} from '../../foundation/discovery/icon-set-writer.mjs';
import {astryxIconDefinitions} from '../../foundation/discovery/icon-definition-discovery.mjs';
import {suggestedIcons} from '../../foundation/discovery/icon-set-checks.mjs';
import {
  resolveProjectTypeScript,
  TYPESCRIPT_FIX,
} from '../../foundation/discovery/project-typescript.mjs';
import {
  KEBAB_NAME_RE,
  applyWrites,
  kebabToTitle,
  loadCurrentManifest,
  packageJsonUpdate,
  projectPath,
  receipt,
  resolvePackage,
} from '../integration/add-helpers.mjs';

/** Where a package's icon sets go when its manifest declares none. */
const DEFAULT_ICON_SETS_ROOT = './icon-sets';

/** Where an icon set's root is declared: an experimental manifest key. */
const ICON_SETS_ROOT_KEY = 'experimental.iconSets';

// ── Icon set ────────────────────────────────────────────────────────

/**
 * A single-quoted JavaScript string literal for any text.
 * @param {string} value
 */
function quoteJs(value) {
  return `'${value
    .replace(/\\/gu, '\\\\')
    .replace(/'/gu, "\\'")
    .replace(/\n/gu, '\\n')
    .replace(/\r/gu, '\\r')}'`;
}

/**
 * Write one icon set (spec:AST-084 FR1–FR3): `<root>/<name>/<name>.doc.mjs`,
 * a typed IconSetDoc, and a starter `<name>.icons.json` whose `module` is the
 * package itself, with no icons and an empty `map`. The set is valid and
 * discoverable; `integration check` then names every built-in icon
 * definition it still has to map.
 * @param {string} name  icon set name (kebab-case)
 * @param {{cwd?: string, dryRun?: boolean, from?: string, exclude?: string[] | string, variants?: string[] | string, defaultVariant?: string, displayName?: string, description?: string}} options
 * @returns {Promise<{type: 'integration.add', data: import('./icon.type.mjs').IconNewData}>}
 */
export async function addIconSet(name, options) {
  const {cwd = process.cwd(), dryRun = false, from} = options;
  const looks = variantOptions(options);
  const exclude =
    typeof options.exclude === 'string'
      ? options.exclude
          .split(',')
          .map(each => each.trim())
          .filter(Boolean)
      : (options.exclude ?? []);
  if (exclude.length > 0 && from == null) {
    throw new AstryxError(
      '--exclude names library exports to leave out, so it needs --from.',
      undefined,
      ERROR_CODES.ERR_INVALID_OPTION,
    );
  }
  if (!KEBAB_NAME_RE.test(name)) {
    throw new AstryxError(
      `Invalid icon set name "${name}": use lowercase kebab-case starting with a letter.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  try {
    sanitizeName(name, {label: 'icon set name'});
  } catch (error) {
    if (error instanceof PathSafetyError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    throw error;
  }

  const {packageDir, packageFile, pkg, owner, manifestFile, manifestExists} =
    resolvePackage(cwd);
  if (typeof pkg.name !== 'string' || pkg.name.trim() === '') {
    throw new AstryxError(
      'package.json has no name. An icon set imports its icons from its own package, so the package needs a name first.',
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const manifest = await loadCurrentManifest(manifestFile, manifestExists);
  const rootPath = manifest.experimental?.iconSets ?? DEFAULT_ICON_SETS_ROOT;
  /** @type {string} */
  let root;
  try {
    root = assertWithin(rootPath, packageDir, {
      label: 'experimental.iconSets root',
    });
  } catch (error) {
    if (error instanceof PathSafetyError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw error;
  }

  try {
    await patchIntegrationRoot(packageDir, ICON_SETS_ROOT_KEY, rootPath, {
      dryRun: true,
      createIfMissing: true,
    });
  } catch (error) {
    if (error instanceof IntegrationRootConflictError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_INTEGRATION_ROOT_CONFLICT,
      );
    }
    throw error;
  }

  const setDir = assertWithin(name, root, {label: 'icon set directory'});
  const docFile = assertWithin(`${name}.doc.mjs`, setDir, {
    label: 'icon set descriptor',
  });
  const dataFile = assertWithin(`${name}.icons.json`, setDir, {
    label: 'icon set data file',
  });
  // Wrapping a library again refreshes the set's icons in place.
  if (from != null && fs.existsSync(docFile) && fs.existsSync(dataFile)) {
    return refreshIconSet(name, {
      cwd,
      dryRun,
      from,
      exclude,
      looks,
      describe: {
        displayName: options.displayName,
        description: options.description,
      },
      packageDir,
      rootPath,
      manifestPath: projectPath(path.relative(packageDir, manifestFile)),
    });
  }
  for (const file of [docFile, dataFile]) {
    if (fs.existsSync(file)) {
      throw new AstryxError(
        `Refusing to overwrite existing file ${projectPath(path.relative(packageDir, file))}.`,
        undefined,
        ERROR_CODES.ERR_FILE_EXISTS,
      );
    }
  }

  // The set's generated icons module, with its theme map, starts empty; with
  // --from, every component the library exports becomes an icon in it.
  const generated = `./${projectPath(path.relative(packageDir, path.join(setDir, `${name}.generated.js`)))}`;
  /** @type {Array<{id: string, export: string, words: string[]}>} */
  let icons = [];
  /** @type {Record<string, string>} */
  let map = {};
  /** @type {import('../../foundation/discovery/icon-set-writer.mjs').GeneratedIcon[]} */
  let exportsToWrite = [];
  /** @type {Array<{definition: string, icon: string, word: string}>} */
  let suggestions = [];
  /** @type {string[]} */
  let skipped = [];
  /** @type {ReturnType<typeof librarySource>} */
  let library = null;
  if (from != null) {
    const source = await iconAuthoring(() =>
      resolveIconSource(from, {packageDir, pkg}),
    );
    const found = libraryIcons(source.file, {exclude});
    if (found.length === 0) {
      throw new AstryxError(
        `"${from}" exports no icon components this command can read. If its icons are data (objects or SVG strings), run \`astryx experimental icon new-set ${name}\`, declare an "adapter" in ${name}.icons.json, and run this command again; or add icons one at a time with \`astryx experimental icon add <Export> --from ${from}\`.`,
        undefined,
        ERROR_CODES.ERR_NOT_FOUND,
      );
    }
    icons = found.map(icon => ({
      id: icon.id,
      export: icon.name,
      words: [...new Set([...idWords(icon.id), ...icon.aliases])],
    }));
    map = exactDefinitionMap(icons, {});
    skipped = nonIconExports(source.file, {exclude});
    suggestions = definitionSuggestions(icons, map);
    library = librarySource(source.module, packageDir);
    exportsToWrite = found.map(icon => ({
      name: icon.name,
      from: source.module,
      source: icon.export,
      adapt: icon.adapt,
    }));
  }
  const data = {
    schemaVersion: /** @type {const} */ (1),
    module: pkg.name,
    ...(library
      ? {source: {package: library.package, version: library.version}}
      : {}),
    ...(exclude.length > 0 ? {exclude: [...new Set(exclude)].sort()} : {}),
    generated,
    ...(looks
      ? {variants: looks.variants, default: {variant: looks.default}}
      : {}),
    themeMap: THEME_MAP_NAME,
    map,
    icons,
  };
  const generatedText = await iconAuthoring(() =>
    generatedModuleText(packageDir, generated, null, data, exportsToWrite),
  );

  const displayName = options.displayName?.trim() || kebabToTitle(name);
  // The artwork license is the wrapped library's, else the package's own;
  // the author edits it when the artwork comes from elsewhere.
  const license =
    library?.license ??
    (typeof pkg.license === 'string' && pkg.license.trim() !== ''
      ? pkg.license
      : 'UNLICENSED');
  const docContents = [
    "/** @type {import('@astryxdesign/cli/authoring').IconSetDoc} */",
    'export default {',
    "  type: 'icon-set',",
    `  name: ${quoteJs(name)},`,
    `  displayName: ${quoteJs(displayName)},`,
    `  description: ${quoteJs(options.description?.trim() || `${displayName} icons.`)},`,
    '  maintained: true,',
    `  license: ${quoteJs(license)},`,
    '};',
    '',
  ].join('\n');
  const dataContents = iconSetDataText(data);

  /** @type {import('../integration/add-helpers.mjs').WritePlan[]} */
  const plans = [
    {path: docFile, contents: docContents, createOnly: true},
    {path: dataFile, contents: dataContents, createOnly: true},
  ];
  plans.push({
    path: assertWithin(generated, packageDir, {
      label: 'generated icons module',
    }),
    contents: generatedText.js,
    createOnly: true,
  });
  // The wrapped library's license notices travel with its artwork.
  for (const notice of library?.notices ?? []) {
    const target = assertWithin(notice, setDir, {label: 'license notice'});
    if (!library || fs.existsSync(target)) continue;
    plans.push({
      path: target,
      contents: fs.readFileSync(path.join(library.dir, notice), 'utf-8'),
      createOnly: true,
    });
  }
  const typesPath = generatedTypesPath(generated);
  if (typesPath && generatedText.dts != null) {
    plans.push({
      path: assertWithin(typesPath, packageDir, {
        label: 'generated icon types',
      }),
      contents: generatedText.dts,
      createOnly: true,
    });
  }
  const pkgUpdate = packageJsonUpdate(
    packageFile,
    rootPath,
    path.basename(manifestFile),
  );
  if (pkgUpdate != null) {
    plans.push({
      path: packageFile,
      contents: pkgUpdate.contents,
      createOnly: false,
      expectedOriginal: pkgUpdate.expectedOriginal,
    });
  }

  const writtenFiles = plans.map(p =>
    projectPath(path.relative(packageDir, p.path)),
  );
  const manifestPath = projectPath(path.relative(packageDir, manifestFile));

  let rootReceipt = {
    path: rootPath,
    created: !manifest.experimental?.iconSets,
  };
  if (!dryRun) {
    let rollback = () => {};
    // Every file this writes, the manifest included, is journaled first, so
    // a failure anywhere puts each back (AST-084 FR13).
    for (const plan of plans) journalFile(plan.path);
    journalFile(manifestFile);
    try {
      rollback = applyWrites(plans);
      rootReceipt = await patchIntegrationRoot(
        packageDir,
        ICON_SETS_ROOT_KEY,
        rootPath,
        {
          createIfMissing: true,
          verify: async () => {
            const m = await loadManifestObject(manifestFile, 'verify', {
              fresh: true,
            });
            const declared = m.experimental?.iconSets;
            if (!declared)
              throw new Error(
                'experimental.iconSets root not visible after writing.',
              );
            const setsRoot = assertWithin(declared, packageDir, {
              label: 'experimental.iconSets root',
            });
            await assertContributionVisible(
              {name: owner, iconSets: setsRoot},
              'icon-set',
              name,
            );
          },
        },
      );
    } catch (error) {
      rollback();
      if (error instanceof IntegrationRootConflictError) {
        throw new AstryxError(
          error.message,
          undefined,
          ERROR_CODES.ERR_INTEGRATION_ROOT_CONFLICT,
        );
      }
      if (error instanceof AstryxError) throw error;
      throw new AstryxError(
        `Failed to write icon-set contribution: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    }
  }
  if (rootReceipt.created && !writtenFiles.includes(manifestPath)) {
    writtenFiles.push(manifestPath);
  }
  const result = receipt(
    'icon-set',
    name,
    rootReceipt,
    manifestPath,
    writtenFiles,
    dryRun,
  );
  {
    result.data.icons = icons.length;
    if (from != null) {
      result.data.mapped = Object.entries(map).map(([definition, icon]) => ({
        definition,
        icon,
      }));
      result.data.suggestions = suggestions;
    }
    // `integration check --strict` type-checks the set's typed doc files.
    const typescript = resolveProjectTypeScript([packageDir]);
    /** @type {Record<string, any>} */
    const packageAfter = pkgUpdate ? JSON.parse(pkgUpdate.contents) : pkg;
    result.data.notes = [
      // First, so a long receipt never hides it: the strict check needs it.
      ...(typescript?.ts
        ? []
        : [
            typescript
              ? `\`integration check --strict\` type-checks the set's doc files with this package's TypeScript, ${typescript.version}, which has no compiler API. ${TYPESCRIPT_FIX}`
              : "`integration check --strict` type-checks the set's doc files with TypeScript, which this package does not have: run `npm install -D typescript@6` (TypeScript 5.0 through 6).",
          ]),
      // What the package needs that the CLI leaves to its author
      // (architecture:cli-surface INV16), each as the exact change to make.
      ...[
        entryWiringNote(packageDir, packageAfter, generated),
        peerNote(packageAfter),
        typecheckNote(packageAfter),
      ].filter(note => note != null),
      ...(options.description?.trim()
        ? []
        : [
            `The set's description is a placeholder ("${displayName} icons."): apps and discover show it. Pass --description when you create a set, or edit ${projectPath(path.relative(packageDir, docFile))}.`,
          ]),
      ...(skipped.length > 0
        ? [
            `Left out ${skipped.length} exports that are not icons: ${skipped.slice(0, 12).join(', ')}${skipped.length > 12 ? ', …' : ''}.`,
          ]
        : []),
      ...mappedNotes(map),
      ...suggestionNotes(suggestions),
      'Run `astryx integration check` to see the icon definitions still to map.',
    ];
  }
  return result;
}

/**
 * An icon's words from its id: each part, leaving out a bare number
 * (`volume-2` is `volume`) unless the id is only numbers.
 * @param {string} id
 */
function idWords(id) {
  const parts = id.split('-');
  const named = parts.filter(part => !/^[0-9]+$/u.test(part));
  return named.length > 0 ? named : parts;
}

/** @param {string} name a camelCase definition name, as a kebab id */
const definitionId = name =>
  name.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase();

/**
 * The `map` entries an exact name gives: each Astryx definition whose name
 * is an icon's id (`delete` → icon `delete`). A word alone never maps: a
 * library's `trash` may not mean what a template's delete means, so it is a
 * suggestion ({@link definitionSuggestions}). Entries the map already has are
 * kept.
 * @param {Array<{id: string}>} icons
 * @param {Record<string, string>} map
 */
function exactDefinitionMap(icons, map) {
  const ids = new Set(icons.map(icon => icon.id));
  /** @type {Record<string, string>} */
  const next = {...map};
  for (const {doc} of astryxIconDefinitions().definitions) {
    if (next[doc.name]) continue;
    const id = definitionId(doc.name);
    if (ids.has(id)) next[doc.name] = id;
  }
  return next;
}

/**
 * The icons each still-unmapped Astryx definition might map to
 * ({@link suggestedIcons}). Never written; the author chooses with
 * `astryx experimental icon map <definition> <icon>`.
 * @param {Array<{id: string, words: string[]}>} icons
 * @param {Record<string, string>} map
 * @returns {Array<{definition: string, icon: string, word: string}>}
 */
function definitionSuggestions(icons, map) {
  const set = {data: {icons, map}};
  return astryxIconDefinitions()
    .definitions.map(each => each.doc)
    .filter(doc => !map[doc.name])
    .flatMap(doc =>
      suggestedIcons(set, doc).map(each => ({definition: doc.name, ...each})),
    )
    .sort((a, b) =>
      a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0,
    );
}

/**
 * The receipt's note for the suggestions, if any.
 * @param {Array<{definition: string, icon: string}>} suggestions
 */
function suggestionNotes(suggestions) {
  if (suggestions.length === 0) return [];
  const count = new Set(suggestions.map(each => each.definition)).size;
  return [
    `${count} unmapped icon definitions have possible icons (listed under Suggestions; nothing was written for them). Check each meaning, then map the ones that fit: \`astryx experimental icon map <definition> <icon>\`.`,
  ];
}

/**
 * The receipt's note for the entries an exact name wrote, if any.
 * @param {Record<string, string>} map
 */
function mappedNotes(map) {
  const count = Object.keys(map).length;
  if (count === 0) return [];
  return [
    `${count} icon definitions were mapped because an icon has their exact name (listed under Mapped by name). A library can draw another meaning under the same name, such as a backspace key named delete: check each, and remap with \`astryx experimental icon map <definition> <icon>\`.`,
  ];
}

/** A variant name: lower-kebab, such as `outline` or `mini-solid`. */
const VARIANT_NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/**
 * The variants and default variant `--variants` and `--default-variant`
 * declare, or
 * null when neither is given. The default is the first variant unless named.
 * @param {{variants?: string[] | string, defaultVariant?: string}} options
 * @returns {{variants: string[], default: string} | null}
 */
function variantOptions(options) {
  const given =
    typeof options.variants === 'string'
      ? options.variants.split(',')
      : options.variants;
  const variants = [
    ...new Set((given ?? []).map(each => each.trim()).filter(Boolean)),
  ];
  const chosen = options.defaultVariant?.trim();
  if (variants.length === 0) {
    if (chosen) {
      throw new AstryxError(
        "--default-variant names one of the set's variants, so it needs --variants.",
        [
          {
            name: `--variants ${chosen},<other>`,
            reason: 'declare the variants',
          },
        ],
        ERROR_CODES.ERR_INVALID_OPTION,
      );
    }
    return null;
  }
  for (const variant of variants) {
    if (!VARIANT_NAME_RE.test(variant)) {
      throw new AstryxError(
        `Invalid variant name "${variant}": use lower-kebab, such as outline or solid.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
  }
  if (chosen && !variants.includes(chosen)) {
    throw new AstryxError(
      `--default-variant "${chosen}" is not one of --variants (${variants.join(', ')}).`,
      variants.map(each => ({
        name: `--default-variant ${each}`,
        reason: 'a declared variant',
      })),
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  return {variants, default: chosen || variants[0]};
}

/**
 * Run an icon-set authoring step, turning its errors into AstryxErrors.
 * @template T
 * @param {() => T | Promise<T>} step
 * @returns {Promise<T>}
 */
async function iconAuthoring(step) {
  try {
    return await step();
  } catch (error) {
    if (error instanceof IconSetAuthoringError) {
      throw new AstryxError(
        error.message,
        error.suggestions,
        /** @type {any} */ (ERROR_CODES)[error.code] ??
          ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    if (error instanceof PathSafetyError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw error;
  }
}

/**
 * Wrap a library into an existing set again: its icons are replaced by what
 * the library exports now (an icon whose words the author extended keeps
 * them), the generated module gains the new exports, `map` keeps every entry
 * whose icon still exists, and the receipt names the entries that lost theirs.
 * @param {string} name
 * @param {{cwd: string, dryRun: boolean, from: string, exclude: string[], looks: {variants: string[], default: string} | null, describe: {displayName?: string, description?: string}, packageDir: string, rootPath: string, manifestPath: string}} options
 */
async function refreshIconSet(
  name,
  {
    cwd,
    dryRun,
    from,
    exclude,
    looks,
    describe,
    packageDir,
    rootPath,
    manifestPath,
  },
) {
  return iconAuthoring(async () => {
    const where = await findLocalIconSet(cwd, name);
    const {set} = where;
    const source = resolveIconSource(from, where);
    // Exports left out before stay out; --exclude adds to them.
    const excluded = [
      ...new Set([...(set.data.exclude ?? []), ...exclude]),
    ].sort();
    const found = libraryIcons(source.file, {
      adapter: Boolean(set.data.adapter),
      exclude: excluded,
    });
    // A refresh changes only the icons the refreshed module supplies: those
    // the generated module re-exports or adapts from it. Every other icon
    // (your own `./` artwork, another library's) is kept as it is, with its
    // map entries and variants.
    const generatedBefore = generatedModulePath(set, packageDir);
    const origins = generatedOrigins(packageDir, generatedBefore);
    /** @param {{export: string, module?: string}} icon */
    const suppliedHere = icon => {
      if ((icon.module ?? set.data.module) !== set.data.module) return false;
      const origin = origins.get(icon.export);
      return origin != null && sameIconModule(origin.module, source.module);
    };
    const supplied = set.data.icons.filter(suppliedHere);
    const others = set.data.icons.filter(icon => !suppliedHere(icon));
    // An existing icon is the same icon when the library still exports it:
    // its identity is the library export its generated module re-exports
    // (`HiSquares2X2Icon`), then its public export, then its id. Ids and
    // public names are derived, and a newer rule may spell them differently
    // (`squares-2-x2` is now `squares-2x2`); an icon matched this way keeps
    // its public export byte for byte, every field it had (its variants, the
    // words the author added, its module), and its map entries.
    const byId = new Map(supplied.map(icon => [icon.id, icon]));
    const byExport = new Map(supplied.map(icon => [icon.export, icon]));
    const bySource = new Map(
      supplied.map(icon => [origins.get(icon.export)?.source, icon]),
    );
    /** @param {{export: string, name: string, id: string}} icon */
    const priorOf = icon =>
      bySource.get(icon.export) ??
      byExport.get(icon.name) ??
      byId.get(icon.id) ??
      null;
    const otherIds = new Set(others.map(icon => icon.id));
    const otherExports = new Set(others.map(icon => icon.export));
    /** @type {string[]} library icons left out: an icon of yours has the id or name */
    const shadowed = [];
    /** @type {Map<string, string>} old id → new id */
    const renames = new Map();
    /** @type {Map<string, string>} the library export → the set's export */
    const publicName = new Map();
    const fromLibrary = found.flatMap(icon => {
      const prior = priorOf(icon);
      const name = prior?.export ?? icon.name;
      if (!prior && (otherIds.has(icon.id) || otherExports.has(name))) {
        shadowed.push(icon.id);
        return [];
      }
      if (prior && prior.id !== icon.id) renames.set(prior.id, icon.id);
      publicName.set(icon.export, name);
      // The words its old id gave are the old rule's, not the author's.
      const oldIdWords =
        prior && prior.id !== icon.id ? new Set(idWords(prior.id)) : new Set();
      return [
        {
          ...(prior ?? {}),
          id: icon.id,
          export: name,
          words: [
            ...new Set([
              ...idWords(icon.id),
              ...icon.aliases,
              ...(prior?.words ?? []).filter(word => !oldIdWords.has(word)),
            ]),
          ],
        },
      ];
    });
    const icons = [...fromLibrary, ...others];
    // The icons this module supplied that it no longer exports: they leave
    // the set and its generated module, and the receipt names them.
    // Each is named for why it left: `--exclude` (or the data file's
    // `exclude`) names its library export, or the library no longer exports
    // it.
    const excludedNames = new Set(excluded);
    const gone = supplied.filter(
      icon => !fromLibrary.some(each => each.export === icon.export),
    );
    const isExcluded = (/** @type {{export: string}} */ icon) =>
      excludedNames.has(origins.get(icon.export)?.source ?? '') ||
      excludedNames.has(icon.export);
    const goneExcluded = gone.filter(isExcluded);
    const goneMissing = gone.filter(icon => !isExcluded(icon));
    const excludedIds = new Set(goneExcluded.map(icon => icon.id));
    const ids = new Set(icons.map(icon => icon.id));
    /** @type {Record<string, string>} */
    const kept = {};
    // The data file's `map` names only icons in the set (its parser refuses
    // anything else), so each lost entry's icon is one of these.
    /** @type {{excluded: string[], missing: string[]}} */
    const lost = {excluded: [], missing: []};
    for (const [definition, id] of Object.entries(set.data.map ?? {})) {
      const now = renames.get(id) ?? id;
      if (ids.has(now)) kept[definition] = now;
      else if (excludedIds.has(id)) {
        lost.excluded.push(`${definition} -> "${id}"`);
      } else lost.missing.push(`${definition} -> "${id}"`);
    }
    const generated = generatedModulePath(set, packageDir);
    const library = librarySource(source.module, packageDir);
    const map = exactDefinitionMap(icons, kept);
    const suggestions = definitionSuggestions(icons, map);
    const next = {
      ...set.data,
      ...(library
        ? {source: {package: library.package, version: library.version}}
        : {}),
      ...(excluded.length > 0 ? {exclude: excluded} : {}),
      generated,
      ...(looks
        ? {variants: looks.variants, default: {variant: looks.default}}
        : {}),
      ...(set.data.themeMap ? {} : {themeMap: THEME_MAP_NAME}),
      map,
      icons,
    };
    /** @type {string[]} */
    const files = [];
    const dataChanged =
      iconSetDataText(next) !== fs.readFileSync(set.dataPath, 'utf-8');
    // --display-name and --description rewrite the descriptor's fields.
    const docFile = path.join(set.dir, `${set.name}.doc.mjs`);
    const docBefore = fs.readFileSync(docFile, 'utf-8');
    let docAfter = docBefore;
    for (const [field, value] of /** @type {const} */ ([
      ['displayName', describe.displayName],
      ['description', describe.description],
    ])) {
      if (!value?.trim()) continue;
      docAfter = docAfter.replace(
        new RegExp(
          `^(\\s*${field}:\\s*)(['"\`])(?:\\\\.|(?!\\2).)*\\2,?$`,
          'mu',
        ),
        (_, lead) => `${lead}${quoteJs(value.trim())},`,
      );
    }
    // A refresh that first records the library as the set's source does what
    // `new-set --from` does: the descriptor takes the library's license, but
    // only over the value `new-set` wrote by default (the package's license,
    // or UNLICENSED), never over one the author chose. Either way the
    // receipt names both values.
    /** @type {string | null} */
    let licenseNote = null;
    if (library?.license && !set.data.source) {
      const license = library.license;
      const licenseRe = /^(\s*license:\s*)(['"`])((?:\\.|(?!\2).)*)\2,?$/mu;
      const current = licenseRe.exec(docBefore)?.[3] ?? null;
      const packageLicense =
        typeof where.pkg.license === 'string' && where.pkg.license.trim() !== ''
          ? where.pkg.license
          : 'UNLICENSED';
      const docRel = projectPath(path.relative(packageDir, docFile));
      if (current === license) {
        // Already the library's.
      } else if (current == null || current === packageLicense) {
        docAfter = docAfter.replace(
          licenseRe,
          (_, lead) => `${lead}${quoteJs(license)},`,
        );
        licenseNote = `The set's license in ${docRel} changed from "${current ?? '(none)'}" to "${license}", the license of ${library.package}, whose artwork it now wraps. Edit it if the artwork's license differs.`;
      } else {
        licenseNote = `The set's license in ${docRel} stays "${current}", which you set; ${library.package} is licensed "${license}". Change it if the artwork is the library's.`;
      }
    }
    if (docAfter !== docBefore) {
      files.push(projectPath(path.relative(packageDir, docFile)));
    }
    // The library's license notices travel with its artwork, as new-set
    // copies them: each one the set directory does not have yet.
    const libraryDir = library?.dir ?? '';
    const notices = (library?.notices ?? [])
      .map(notice => ({
        notice,
        target: assertWithin(notice, set.dir, {label: 'license notice'}),
      }))
      .filter(({target}) => !fs.existsSync(target));
    for (const {target} of notices) {
      files.push(projectPath(path.relative(packageDir, target)));
    }
    if (!dryRun) {
      const written = writeGeneratedIcons(
        packageDir,
        generated,
        next,
        found
          .map(icon => ({
            name: publicName.get(icon.export) ?? icon.name,
            from: source.module,
            source: icon.export,
            adapt: icon.adapt,
          }))
          .filter(icon => publicName.has(icon.source)),
        // The icons the library no longer exports leave the module too; a
        // renamed icon keeps its export.
        gone.map(icon => icon.export),
      );
      files.push(...written.files);
      try {
        writeIconSetData(set, next);
        // The descriptor last: the command's journal puts it back with the
        // rest if anything after it fails (AST-084 FR13).
        for (const {notice, target} of notices) {
          journalFile(target);
          fs.writeFileSync(
            target,
            fs.readFileSync(path.join(libraryDir, notice)),
          );
        }
        if (docAfter !== docBefore) {
          journalFile(docFile);
          fs.writeFileSync(docFile, docAfter);
        }
      } catch (error) {
        written.undo();
        throw error;
      }
    }
    if (dataChanged) {
      files.push(projectPath(path.relative(packageDir, set.dataPath)));
    }
    const result = receipt(
      'icon-set',
      name,
      {path: rootPath, created: false},
      manifestPath,
      files,
      dryRun,
    );
    result.data.icons = icons.length;
    result.data.refreshed = true;
    // Every entry an exact name gives, kept or new, so a refresh lists
    // them for review again.
    const byName = Object.fromEntries(
      Object.entries(map).filter(
        ([definition, id]) =>
          !(definition in kept) || id === definitionId(definition),
      ),
    );
    result.data.mapped = Object.entries(byName).map(([definition, icon]) => ({
      definition,
      icon,
    }));
    result.data.suggestions = suggestions;
    if (renames.size > 0) {
      result.data.renamed = [...renames].map(([from, to]) => ({from, to}));
    }
    result.data.notes = [
      ...(licenseNote ? [licenseNote] : []),
      ...(renames.size > 0
        ? [
            `${renames.size} icons have a new id under this release's id rule, and keep their map entries, variants, and words: ${[...renames].map(([from, to]) => `${from} -> ${to}`).join(', ')}.`,
          ]
        : []),
      ...mappedNotes(byName),
      ...suggestionNotes(suggestions),
      ...(goneMissing.length > 0
        ? [
            `${goneMissing.length} icons the library no longer exports were removed from the set: ${goneMissing.map(icon => icon.id).join(', ')}.`,
          ]
        : []),
      ...(lost.missing.length > 0
        ? [
            `These map entries named those icons and were removed: ${lost.missing.join(', ')}.`,
          ]
        : []),
      ...(goneExcluded.length > 0
        ? [
            `Left out by --exclude, and removed from the set: ${goneExcluded.map(icon => icon.id).join(', ')}.`,
          ]
        : []),
      ...(lost.excluded.length > 0
        ? [
            `These map entries named icons --exclude left out and were removed: ${lost.excluded.join(', ')}.`,
          ]
        : []),
      ...(shadowed.length > 0
        ? [
            `Left out ${shadowed.length} library icons whose id or name an icon of yours from another module already has: ${shadowed.join(', ')}.`,
          ]
        : []),
      astryxIconDefinitions().definitions.every(({doc}) => map[doc.name])
        ? 'Every Astryx icon definition is mapped.'
        : 'Run `astryx integration check` to see the icon definitions still to map.',
    ];
    return result;
  });
}

// ── Icon definition ─────────────────────────────────────────────────

/**
 * Add one of an icon set's own icon definitions (AST-084):
 * `<set>/definitions/<name>.doc.mjs`, a typed IconDefinitionDoc, and, with
 * `icon`, the set's `map` entry for it. A name Astryx already has is refused:
 * map to Astryx's definition instead.
 * @param {string} name camelCase definition name
 * @param {{cwd?: string, dryRun?: boolean, set?: string, description?: string, words?: string[] | string, icon?: string}} options
 * @returns {Promise<{type: 'integration.add', data: import('./icon.type.mjs').IconNewData}>}
 */
export async function addIconDefinition(name, options) {
  const {
    cwd = process.cwd(),
    dryRun = false,
    set: selector,
    description,
    icon,
  } = options;
  const words =
    typeof options.words === 'string'
      ? options.words.split(',')
      : options.words;
  return iconAuthoring(async () => {
    const where = await findLocalIconSet(cwd, selector);
    const {packageDir, set} = where;
    const doc = checkNewDefinition(set, {name, description, words});
    const file = definitionFile(set, doc.name);
    if (fs.existsSync(file)) {
      throw new AstryxError(
        `Refusing to overwrite existing file ${projectPath(path.relative(packageDir, file))}.`,
        undefined,
        ERROR_CODES.ERR_FILE_EXISTS,
      );
    }
    if (icon != null && !set.data.icons.some(each => each.id === icon)) {
      throw new AstryxError(
        `Icon set "${set.name}" has no icon "${icon}".`,
        set.data.icons
          .map(each => each.id)
          .filter(id => id.includes(icon) || icon.includes(id))
          .slice(0, 5)
          .map(id => ({name: id, reason: 'an icon in this set'})),
        ERROR_CODES.ERR_NOT_FOUND,
      );
    }
    const files = [projectPath(path.relative(packageDir, file))];
    if (icon != null)
      files.push(projectPath(path.relative(packageDir, set.dataPath)));
    if (!dryRun) {
      const undo = writeDefinitionFile(set, doc);
      let undoMap = () => {};
      if (icon != null) {
        try {
          undoMap = writeIconSetData(
            set,
            {...set.data, map: {...(set.data.map ?? {}), [doc.name]: icon}},
            {extraDefinitions: [doc.name]},
          );
        } catch (error) {
          undo();
          throw error;
        }
      }
      // Discovery reads the set, its new definition included, or every
      // write is undone: the data file first, then the definition.
      try {
        await findLocalIconSet(cwd, set.name);
      } catch (error) {
        undoMap();
        undo();
        throw error;
      }
    }
    return receipt(
      'icon-definition',
      doc.name,
      {
        path: `./${projectPath(path.relative(packageDir, where.root))}`,
        created: false,
      },
      projectPath(
        path.relative(
          packageDir,
          findLocalIntegrationManifestOrNull(packageDir) ??
            path.join(packageDir, 'astryx.integration.mjs'),
        ),
      ),
      files,
      dryRun,
    );
  });
}
