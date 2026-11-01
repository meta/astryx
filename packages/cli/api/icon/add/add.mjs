// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.add` and `icon.definitionMatches` leaf (AST-084 FR13): register
 * one icon the caller chose from a source module, against an icon
 * definition.
 *
 * The caller (usually an agent that knows the library) picks the export; the
 * CLI never searches the source library. It proves the export is a runtime
 * component of the source module, read statically, and then:
 *   - with no definition flag, answers the definitions that fit the export
 *     (`icon.definitionMatches`), Astryx's and the set's own, ranked by the
 *     icon lookup's scorer, and writes nothing;
 *   - with `definition`, adds the icon (or a variant of an existing icon)
 *     and maps the definition to it. The icon becomes an export of the set's
 *     generated icons module (`generated`): a re-export of a component, or,
 *     for anything else, the set's `adapter` applied to it. The data file
 *     names the set's own module, so every reader gets a component;
 *   - with `newDefinition`, writes the set's own definition file first.
 * Running it again with the same arguments changes nothing.
 *
 * @output the `icon.add` or `icon.definitionMatches` envelope
 * @position api/icon/add — dispatched by the `experimental icon add` command
 */

import * as path from 'node:path';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {
  assertIconExport,
  astryxIconDefinitions,
  authoring,
  checkNewDefinition,
  closestNames,
  findLocalIconSet,
  iconIdOf,
  mappableDefinitions,
  exportValueKind,
  generatedModulePath,
  generatedNamesOf,
  generatedOrigins,
  iconModulePackage,
  iconNaming,
  localSourceNote,
  definitionNameOf,
  libraryIcons,
  modulePrefix,
  variantExportName,
  rankIcons,
  resolveIconSource,
  setModuleNote,
  writeGeneratedIcons,
  THEME_MAP_NAME,
  writeDefinitionFile,
  writeIconSetData,
  refuseOutsideProject,
} from '../_adapter.mjs';
import {passed, refuseIgnoredPairs} from '../_options.mjs';

/** The lowest score a definition match needs: an exact word or name. */
const FIT_FLOOR = 80;

/** How many definition matches the answer lists. */
const MATCH_LIMIT = 10;

/**
 * Register one icon in the set being authored, or list the definitions that
 * fit it.
 * Experimental (spec:AST-017 FR27): may change or be removed in a patch
 * release.
 * @experimental
 * @param {string | undefined} exportName the export the set exposes the icon as; absent with `all`
 * @param {import('../icon.type.mjs').IconAddOptions} options
 * @returns {Promise<import('../icon.type.mjs').IconAddResponse | import('../icon.type.mjs').IconDefinitionMatchesResponse | import('../icon.type.mjs').IconAddVariantsResponse>}
 */
export async function iconAdd(exportName, options) {
  const {
    cwd = process.cwd(),
    from,
    set: selector,
    definition: givenDefinition,
    newDefinition,
    description,
    words,
    useDefault = false,
    variant,
    id: givenId,
    all = false,
  } = options ?? {};
  refuseOutsideProject(cwd, 'experimental icon add', 'the icon-set package');
  // `--all` adds a declared variant to existing icons, so it names no icon
  // and maps nothing; a description and words describe only a new
  // definition (spec:AST-042 FR5).
  refuseIgnoredPairs(
    {
      'an export name': passed(exportName),
      '--definition': passed(givenDefinition),
      '--new-definition': passed(newDefinition),
      '--description': passed(description),
      '--words': passed(words),
      '--default': passed(useDefault),
      '--id': passed(givenId),
      '--all': passed(all),
    },
    [
      ['--all', 'an export name'],
      ['--all', '--definition'],
      ['--all', '--new-definition'],
      ['--all', '--description'],
      ['--all', '--words'],
      ['--all', '--default'],
      ['--all', '--id'],
      ['--definition', '--new-definition'],
      ['--definition', '--description'],
      ['--definition', '--words'],
    ],
  );
  for (const [flag, value] of /** @type {const} */ ([
    ['--description', description],
    ['--words', words],
  ])) {
    if (passed(value) && !passed(newDefinition)) {
      throw new AstryxError(
        `${flag} describes a new definition, so it needs --new-definition`,
        [
          {
            name: `--new-definition <name> --description '<what it is for>' --words a,b`,
            reason: 'add your own definition',
          },
        ],
        ERROR_CODES.ERR_INVALID_OPTION,
      );
    }
  }
  if (all) {
    return authoring(() => addVariantForAll({cwd, from, selector, variant}));
  }
  return authoring(async () => {
    if (
      typeof exportName !== 'string' ||
      !/^[$A-Z_a-z][$\w]*$/u.test(exportName)
    ) {
      throw new AstryxError(
        `Name the icon's export, such as TrashIcon; received "${String(exportName)}".`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    if (typeof from !== 'string' || from.trim() === '') {
      throw new AstryxError(
        'Pass --from with the module the icon is exported from: a package, a package subpath, or a relative path in this package.',
        undefined,
        ERROR_CODES.ERR_MISSING_ARGUMENT,
      );
    }
    const where = await findLocalIconSet(cwd, selector);
    const {packageDir, set} = where;
    // The docs' kebab id (`eye-slash`) names the same definition.
    const definition =
      givenDefinition == null
        ? undefined
        : definitionNameOf(givenDefinition, mappableDefinitions(set));
    const source = resolveIconSource(from, where);
    const sourceExport = useDefault ? 'default' : exportName;
    assertIconExport(source.file, source.module, sourceExport);

    // A component is re-exported; anything else goes through the set's
    // adapter. Either way the icon is an export of the set's own module.
    const adapt = exportValueKind(source.file, sourceExport) !== 'component';
    if (adapt && !set.data.adapter) {
      throw new AstryxError(
        `"${sourceExport}" in "${source.module}" is not a component, so this set needs an adapter: a function in your package that turns it into one. Declare "adapter": {"module": "./src/adapt.js", "export": "adapt"} in ${set.name}.icons.json (astryx docs cli/experimental/icon-sets library-shapes).`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    const generated = generatedModulePath(set, packageDir);
    const module = set.data.module;
    // A library prefix every icon export shares (`feather` in `featherEye`)
    // is left out of the id and the set's export name, as the bulk wrap does.
    // A ./ path is the author's own files, named as written: never a library
    // prefix (`CheckDouble` and `CheckDoubleSolid` share `check`).
    const shared =
      useDefault || source.module.startsWith('./')
        ? []
        : modulePrefix(source.file, {adapter: Boolean(set.data.adapter)});
    const nameWords = iconIdOf(exportName).split('-');
    const prefix =
      shared.length > 0 &&
      nameWords.length > shared.length &&
      shared.every((word, index) => nameWords[index] === word)
        ? shared
        : [];
    // A library export the set already has keeps its icon's name and id.
    const already = generatedNamesOf(
      packageDir,
      generated,
      source.module,
      sourceExport,
    );
    const known = set.data.icons.find(each => already.includes(each.export));
    const naming = known
      ? {id: known.id, name: known.export}
      : iconNaming(exportName, prefix);
    const id = givenId ?? naming.id;
    const asVariant = variant != null;
    // The name the set exports it as: `<Name>Icon`, or for a variant the
    // icon's name with the variant's name.
    const baseIcon = set.data.icons.find(each => each.id === id);
    const setName = asVariant
      ? variantExportName(baseIcon?.export ?? naming.name, variant)
      : naming.name;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
      throw new AstryxError(
        `"${exportName}" gives no icon id; pass --id with a lower-kebab id.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }

    if (definition == null && newDefinition == null && !asVariant) {
      return definitionMatches(set, exportName, from, id);
    }

    /** @type {{name: string, description: string, words: string[]} | null} */
    let created = null;
    let mapped = definition ?? newDefinition ?? null;
    if (newDefinition != null) {
      const own = set.definitions.find(each => each.doc.name === newDefinition);
      if (own) {
        mapped = own.doc.name;
      } else {
        created = checkNewDefinition(set, {
          name: newDefinition,
          description,
          words,
        });
      }
    } else if (
      definition != null &&
      !mappableDefinitions(set).has(definition)
    ) {
      throw new AstryxError(
        `"${definition}" is not an icon definition.`,
        [
          ...closestNames(definition, [...mappableDefinitions(set)]).map(
            name => ({
              name: `--definition ${name}`,
              reason: 'a known icon definition',
            }),
          ),
          {
            name: `--new-definition ${definition} --description '<what it is for>' --words a,b`,
            reason: 'add it as your own definition',
          },
        ],
        ERROR_CODES.ERR_NOT_FOUND,
      );
    }
    // The icon keeps only its own words: search also matches it by the
    // words of every definition it is mapped to, so they are not copied.
    const icons = set.data.icons.map(each => ({...each}));
    const existing = icons.find(each => each.id === id);
    if (asVariant) {
      if (!existing) {
        throw new AstryxError(
          `Icon set "${set.name}" has no icon "${id}" to add a variant to. Add the icon first, or pass --id.`,
          closestNames(
            id,
            icons.map(each => each.id),
          ).map(name => ({
            name: `--id ${name}`,
            reason: 'an icon in this set',
          })),
          ERROR_CODES.ERR_NOT_FOUND,
        );
      }
      const variants = [...(existing.variants ?? [])];
      const same = variants.find(each => each.export === setName);
      if (!same) {
        variants.push({variant, export: setName});
        existing.variants = variants;
      }
    } else if (existing) {
      if (
        existing.export !== setName ||
        (existing.module ?? set.data.module) !== module
      ) {
        throw new AstryxError(
          `Icon set "${set.name}" already has an icon "${id}" (${existing.export}). Pass --id to add this one under another id.`,
          undefined,
          ERROR_CODES.ERR_FILE_EXISTS,
        );
      }
    } else {
      icons.push({
        id,
        export: setName,
        words: id.split('-'),
      });
    }
    const map = {...(set.data.map ?? {})};
    if (mapped) map[mapped] = id;

    const next = {
      ...set.data,
      ...(set.data.generated ? {} : {generated}),
      ...(set.data.themeMap ? {} : {themeMap: THEME_MAP_NAME}),
      map,
      icons,
    };
    /** @type {string[]} */
    const files = [];
    // Every write happens inside this try, so any failure undoes the ones
    // before it and leaves every file as it was (AST-084 FR13).
    let undoDefinition = () => {};
    let undoGenerated = () => {};
    /** @type {boolean} */
    let generatedChanged;
    try {
      if (created) undoDefinition = writeDefinitionFile(set, created);
      const written = writeGeneratedIcons(packageDir, generated, next, [
        {name: setName, from: source.module, source: sourceExport, adapt},
      ]);
      undoGenerated = written.undo;
      generatedChanged = written.changed;
      files.push(...written.files);
      if (created) {
        files.push(
          path
            .relative(
              packageDir,
              path.join(set.dir, 'definitions', `${created.name}.doc.mjs`),
            )
            .split(path.sep)
            .join('/'),
        );
      }
      if (JSON.stringify(next) !== JSON.stringify(set.data)) {
        writeIconSetData(set, next, {
          extraDefinitions: created ? [created.name] : [],
        });
        files.push(
          path.relative(packageDir, set.dataPath).split(path.sep).join('/'),
        );
      }
    } catch (error) {
      undoGenerated();
      undoDefinition();
      if (error instanceof Error && /is not in variants/u.test(error.message)) {
        throw new AstryxError(
          `${error.message} Declare it in "variants" in ${set.name}.icons.json first.`,
          undefined,
          ERROR_CODES.ERR_INVALID_ARGUMENT,
        );
      }
      throw error;
    }
    const changed =
      JSON.stringify(next) !== JSON.stringify(set.data) ||
      created != null ||
      generatedChanged;
    // A ./ file publishes only when package.json `files` lists it; the
    // author adds it (architecture:cli-surface INV16).
    const note =
      [
        localSourceNote(packageDir, source.module),
        setModuleNote(set, where, generated, setName),
      ]
        .filter(Boolean)
        .join(' ') || null;
    return {
      type: /** @type {const} */ ('icon.add'),
      data: {
        set: set.name,
        package: set.package,
        icon: {id, export: setName, module},
        ...(asVariant ? {variant} : {}),
        definition: mapped,
        ...(created ? {newDefinition: created.name} : {}),
        files,
        changed,
        ...(note ? {note} : {}),
      },
    };
  });
}

/**
 * The definitions that fit an export, Astryx's and the set's own, ranked by
 * the icon lookup's scorer: each word of the export's name is a query
 * against every definition's name and words; a definition keeps its best.
 * @param {import('../../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet} set
 * @param {string} exportName
 * @param {string} from
 * @param {string} id
 * @returns {import('../icon.type.mjs').IconDefinitionMatchesResponse}
 */
function definitionMatches(set, exportName, from, id) {
  const astryx = astryxIconDefinitions().definitions.map(each => ({
    doc: each.doc,
    source: /** @type {const} */ ('astryx'),
  }));
  const own = set.definitions
    .filter(each => !astryx.some(a => a.doc.name === each.doc.name))
    .map(each => ({doc: each.doc, source: /** @type {const} */ ('set')}));
  const all = [...astryx, ...own];
  // Each definition reads as an icon: its name's words as the id, then its
  // words, so the lookup's tiers apply unchanged.
  const asSet = /** @type {any} */ ({
    name: 'definitions',
    package: set.package,
    data: {
      module: set.data.module,
      icons: all.map(({doc}) => ({
        id: doc.name.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase(),
        export: doc.name,
        words: [
          ...doc.name
            .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
            .toLowerCase()
            .split(' '),
          ...doc.words,
        ],
      })),
    },
  });
  const queries = [
    id.replace(/-/gu, ' '),
    ...id.split('-').filter(word => /[a-z]/u.test(word)),
  ];
  /** @type {Map<string, {score: number, reason: string}>} */
  const best = new Map();
  for (const query of queries) {
    for (const match of rankIcons([asSet], query)) {
      const prior = best.get(match.export);
      if (!prior || match.score > prior.score) {
        best.set(match.export, {score: match.score, reason: match.reason});
      }
    }
  }
  const base = `astryx experimental icon add ${exportName} --from ${from}`;
  const matches = all
    .filter(({doc}) => best.has(doc.name))
    .map(({doc, source}) => {
      const hit = /** @type {{score: number, reason: string}} */ (
        best.get(doc.name)
      );
      return {
        name: doc.name,
        description: doc.description,
        source,
        score: hit.score,
        reason: hit.reason,
        command: `${base} --definition ${doc.name}`,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.source === b.source ? 0 : a.source === 'astryx' ? -1 : 1) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )
    .slice(0, MATCH_LIMIT);
  const fits = matches.some(match => match.score >= FIT_FLOOR);
  const name = id.replace(/-([a-z0-9])/gu, (_, c) => c.toUpperCase());
  return {
    type: 'icon.definitionMatches',
    data: {
      export: exportName,
      from,
      id,
      matches,
      newDefinition: fits
        ? null
        : `${base} --new-definition ${/^[a-z]/u.test(name) ? name : `icon${name}`} --description '<what the icon is for>' --words <word>,<word>`,
    },
  };
}

/**
 * `--all`: add one variant for every icon of the set whose library export
 * has a counterpart in `from` with the same id (`TrashIcon` in the solid
 * module is the solid variant of `trash`), in one write.
 * @param {{cwd: string, from: string | undefined, selector: string | undefined, variant: string | undefined}} args
 * @returns {Promise<import('../icon.type.mjs').IconAddVariantsResponse>}
 */
async function addVariantForAll({cwd, from, selector, variant}) {
  if (variant == null || variant === '') {
    throw new AstryxError(
      '--all adds one variant for every icon: pass --variant with the variant, such as solid.',
      undefined,
      ERROR_CODES.ERR_MISSING_ARGUMENT,
    );
  }
  if (typeof from !== 'string' || from.trim() === '') {
    throw new AstryxError(
      'Pass --from with the module that exports the variant, such as @heroicons/react/24/solid.',
      undefined,
      ERROR_CODES.ERR_MISSING_ARGUMENT,
    );
  }
  const where = await findLocalIconSet(cwd, selector);
  const {packageDir, set} = where;
  const declared = set.data.variants ?? [];
  if (!declared.includes(variant)) {
    throw new AstryxError(
      `Icon set "${set.name}" declares no variant "${variant}"${declared.length > 0 ? ` (it declares ${declared.join(', ')})` : ''}. Declare it first.`,
      [
        {
          name: `astryx experimental icon new-set ${set.name} --from <its library> --variants ${[...new Set([...(declared.length > 0 ? declared : ['<default>']), variant])].join(',')}`,
          reason: 'declare the variants',
        },
      ],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  if (set.data.default?.variant === variant) {
    throw new AstryxError(
      `"${variant}" is the set's default variant: each icon's own export already draws it.`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const source = resolveIconSource(from, where);
  const found = libraryIcons(source.file, {adapter: Boolean(set.data.adapter)});
  const byId = new Map(found.map(each => [each.id, each]));
  // An existing icon is known by the library export it re-exports, then by
  // its own export, then by its id: an icon whose id or name an older rule
  // wrote (`squares-2-x2`, `Squares2X2Icon`) still meets its variant
  // (`HiSquares2X2Icon` in the solid module).
  const byLibraryExport = new Map(found.map(each => [each.export, each]));
  const byName = new Map(found.map(each => [each.name, each]));
  const origins = generatedOrigins(
    packageDir,
    generatedModulePath(set, packageDir),
  );
  // Only icons from the same package as the variant module can have a
  // variant there: an icon from your own `./` file, or from another library,
  // is left as it is and never listed as missing.
  const variantPackage = iconModulePackage(source.module);
  const generated = generatedModulePath(set, packageDir);
  /** @type {import('../../../foundation/discovery/icon-set-writer.mjs').GeneratedIcon[]} */
  const toWrite = [];
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const already = [];
  /** @type {string[]} */
  const missing = [];
  const icons = set.data.icons.map(icon => {
    const origin = origins.get(icon.export);
    if (origin && iconModulePackage(origin.module) !== variantPackage) {
      return icon;
    }
    const librarySource =
      origin && origin.source !== 'default' ? origin.source : undefined;
    const match =
      (librarySource ? byLibraryExport.get(librarySource) : undefined) ??
      byName.get(icon.export) ??
      byId.get(icon.id);
    if (!match) {
      missing.push(icon.id);
      return icon;
    }
    if (match.adapt && !set.data.adapter) {
      missing.push(icon.id);
      return icon;
    }
    const name = variantExportName(icon.export, variant);
    const variants = [...(icon.variants ?? [])];
    if (variants.some(each => each.variant === variant)) {
      already.push(icon.id);
      return icon;
    }
    toWrite.push({
      name,
      from: source.module,
      source: match.export,
      adapt: match.adapt,
    });
    variants.push({variant, export: name});
    added.push(icon.id);
    return {...icon, variants};
  });
  if (added.length === 0 && already.length === 0) {
    throw new AstryxError(
      `"${source.module}" exports no icon with the id of an icon in "${set.name}". Pass the module that exports the ${variant} variant under the same names.`,
      undefined,
      ERROR_CODES.ERR_NOT_FOUND,
    );
  }
  const next = {
    ...set.data,
    ...(set.data.generated ? {} : {generated}),
    ...(set.data.themeMap ? {} : {themeMap: THEME_MAP_NAME}),
    icons,
  };
  /** @type {string[]} */
  const files = [];
  const written = writeGeneratedIcons(packageDir, generated, next, toWrite);
  files.push(...written.files);
  const dataChanged = JSON.stringify(next) !== JSON.stringify(set.data);
  if (dataChanged) {
    try {
      writeIconSetData(set, next);
    } catch (error) {
      written.undo();
      throw error;
    }
    files.push(
      path.relative(packageDir, set.dataPath).split(path.sep).join('/'),
    );
  }
  return {
    type: /** @type {const} */ ('icon.addVariants'),
    data: {
      set: set.name,
      package: set.package,
      variant,
      from: source.module,
      added: added.length,
      already: already.length,
      missing,
      files,
      changed: dataChanged || written.changed,
    },
  };
}
