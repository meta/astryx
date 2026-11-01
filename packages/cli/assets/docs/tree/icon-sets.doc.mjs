// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/experimental/icon-sets`: make an
 * icon set: register icons against icon definitions with the CLI, check the
 * set, and know how apps find its icons and how templates follow it.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'icon-sets',
  placement: {parent: 'namespace:experimental', slot: 'guides', order: 10},
  stability: 'experimental',
  title: 'Icon sets',
  category: 'guide',
  keywords: [
    'icon set',
    'add icons',
    'ship icons',
    'icon library',
    'icon definition',
    'icons.json',
    'integration icons',
  ],
  description:
    'Ship an icon set: register each icon against an icon definition, so apps find icons by meaning and templates use your icons.',
  sections: [
    {
      id: 'experimental',
      title: 'Experimental',
      content: [
        {
          type: 'prose',
          text: 'Icon sets are experimental: the `astryx experimental icon` commands, the `experimental.iconSet` key in astryx.config, the `experimental.iconSets` key in an integration manifest, the data file, icon definitions, and the output and JSON of all of them can change, or go away, in any patch release without a deprecation period. A project that does not set `experimental.iconSet` sees no change in any stable command, apart from: the marked `experimental` group in help and in `astryx manifest` (its command, and its `responseTypes` and `jsonSupported` entries); the marked experimental entries in the CLI reference listings; and a search for \"experimental\", which also finds the stable `stability` field of the field reference. Templates, discover, and doctor answer as they do with no icon set installed. With a package that ships icon sets installed and no opt-in, the warnings an older CLI gives about the manifest key `experimental` (in `astryx doctor` and `astryx doctor integration validate <package>`, and the one-line nudge other commands print to stderr) are gone. `astryx search` never returns icons or these docs; to find an icon by meaning, use `astryx experimental icon <words>`.',
        },
      ],
    },
    {
      id: 'how-it-works',
      title: 'How it works',
      content: [
        {
          type: 'prose',
          text: 'Astryx keeps a list of icon definitions: one file per meaning, like `close` or `delete` (`astryx docs cli/experimental/icon-definitions`). An icon set registers which of its icons draws each definition, in the `map` of its data file; one icon may draw several definitions (`file` and `document` can both be your `document` icon). Templates say which definition each of their icons draws, so a project that uses your set gets your icon for every definition you map. Every set maps the built-in definitions, the names Core renders itself.',
        },
        {
          type: 'prose',
          text: 'The CLI knows no icon library. You, or your agent, pick each icon from the library you wrap; the commands below verify it, write the files, and check the set.',
        },
      ],
    },
    {
      id: 'add-an-icon-set',
      title: 'Add an icon set',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx experimental icon new-set outline',
        },
        {
          type: 'prose',
          text: "`outline.doc.mjs` is the descriptor: name, display name and description (`--display-name`, `--description`), and `license`, the SPDX license of the artwork (it starts as your package's own). `outline.icons.json` starts with no icons and an empty `map`; its `module` is your package name. `outline.generated.js` is the set's generated module, with its declaration file `outline.generated.d.ts`: the CLI writes both, and every icon and the theme map are exports of it. Every field is in {@link schema:icon-set-doc} and {@link schema:icon-set-data}.",
        },
        {
          type: 'prose',
          text: "The set's icons import from your package by name, so your package's entry must re-export the generated module. The command writes only the set's own files: your entry, `exports`, `main`, `types`, `files`, peers, and scripts are yours, and the receipt names each change to make as text to copy. For an entry file in the package (and the declaration file package.json names) that is the line `export * from './icon-sets/outline/outline.generated.js';`, relative to it; for a package with no entry, `index.js` and `index.d.ts` with that line and the package.json `main`, `types`, and `exports` that name them; for a built or CommonJS entry, the line to add to the source it is built from. `integration check` names the same change until you make it, and the receipt also names the peers and the `typecheck` script to add. `integration check --strict` type-checks the set's doc files with your package's TypeScript; the receipt says when it is missing (`npm install -D typescript@6`).",
        },
      ],
    },
    {
      id: 'add-icons',
      title: 'Add icons one at a time',
      content: [
        {
          type: 'prose',
          text: 'Pick an icon from the library and ask which definitions fit it. Nothing is written yet. To read every icon a set already has, one line each with its words and the definitions it draws, run `astryx experimental icon --set <set> --all-icons`; `astryx experimental icon <set>/<id>` reads one, or says the id does not exist:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx experimental icon add Bin --from @acme/glyph-library',
        },
        {
          type: 'prose',
          text: 'Each row is an Astryx definition (or one your set declares) with the exact command that adds the icon for it. Run one:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx experimental icon add Bin --from @acme/glyph-library --definition delete',
        },
        {
          type: 'prose',
          text: "The CLI reads the library's exports without running them and refuses a name the module does not export, suggesting close names. It adds the icon as `BinIcon` (id `bin`, words from its name), writes `export {Bin as BinIcon} from '@acme/glyph-library';` to the set's generated module, and sets `map.delete = \"bin\"`. Running it again changes nothing. Do not copy the definition's words into the icon: `astryx experimental icon` matches an icon by its own words and by the name and words of every definition it is mapped to.",
        },
        {
          type: 'prose',
          text: 'When no Astryx definition fits, add your own in the same command. It needs no pull request:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: "astryx experimental icon add Dice5 --from @acme/glyph-library --new-definition random --description 'Pick something at random.' --words dice,shuffle,chance",
        },
        {
          type: 'prose',
          text: '`experimental icon map <definition> <icon>` points a definition at an icon the set already has (a definition is named in camelCase, `eyeSlash`, or by the kebab id the definitions list shows, `eye-slash`; an icon by its id, its export name in any case, or another name its library exports it as, such as `trash-2`, never by one word of its id), `experimental icon map --pairs close=x-mark,search=magnifying-glass` writes many entries at once (checked together, all or none; an entry the map already has is replaced, and the receipt shows what it was), and `--remove` drops an entry. `experimental icon new-definition <name> --description ... --words ... --icon <id>` adds your own definition for an icon you already have. `experimental icon --definitions` lists every Astryx definition, built in or not, with its words (`--json` for a script).',
        },
      ],
    },
    {
      id: 'wrap-a-library',
      title: 'Or wrap a whole library',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx experimental icon new-set outline --from @acme/glyph-library',
        },
        {
          type: 'prose',
          text: "Every component the library exports becomes an icon (an alias of one component is recorded once), named `<Name>Icon`, with an id from its name (`Squares2X2Icon` is `squares-2x2`: a dimension stays one word). `map` is filled only where a definition's name is an icon's id (`delete` → icon `delete`), and the receipt lists those entries under Mapped by name: a library can draw another meaning under the same name (one library's `delete` is a backspace key), so check each. An icon whose id is only one of a definition's words (`trash` for `delete`) may mean something else in this library, so the receipt lists it under Suggestions, with the `experimental icon map <definition> <icon>` command for each, and writes nothing for it: check the meaning, then run the ones that fit. Run it again after a library release to refresh the icons that library supplies; `map` entries whose icon still exists are kept, and the receipt names any icon the library dropped, any icon `--exclude` left out, and the `map` entries each took with it. Icons you added from your own files or another library are left as they are. An icon you already have is known by the library export it re-exports, so it keeps its export name exactly, its `map` entries, variants, and words, even when a newer CLI spells its id differently or your `--exclude` lets a library prefix come off new ids; the receipt lists each changed id under `renamed`. A refresh with `--dry-run` writes nothing and prints the Mapped by name and Suggestions lists again; `--display-name` and `--description` on a refresh rewrite the descriptor. Variants added with `add --variant … --all` are kept too; run that `add` again to pick up icons the release added. `experimental icon --list` shows how many definitions the set maps.",
        },
        {
          type: 'prose',
          text: "With a package or package subpath, it also records the installed library and version as the data file's `source`, so `integration check` warns when your dependency moves to another version; copies the library's LICENSE (and NOTICE) files into the set directory; and sets the descriptor's `license` to the library's. A set you started without `--from` gets the same the first time a refresh records its source, unless you already changed `license`: a `license` you set is kept (the receipt names the library's), and every later refresh keeps it too. Your package.json `license` is never changed. Edit `license` when the artwork's license differs from the library's package license.",
        },
        {
          type: 'prose',
          text: 'A library with a module per style supplies variants. Declare them when you create the set, then add a variant for every icon in one run:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: `astryx experimental icon new-set heroicons --from @heroicons/react/24/outline --variants outline,solid --default-variant outline --description 'Heroicons, outline and solid.'
astryx experimental icon add --variant solid --from @heroicons/react/24/solid --all`,
        },
        {
          type: 'prose',
          text: "A library that redraws its artwork for small sizes (Heroicons' 20px mini and 16px micro) ships each of those as its own set in its own package (their export names match the 24px ones), not as variants: a variant's size comes from CSS. `--variants` lists the variants; `--default-variant` names the one each icon's own export draws (the first variant when omitted). `--all` adds the variant for every icon whose id an export of `--from` has (`TrashIcon` in the solid module becomes `TrashSolidIcon`, the solid variant of `trash`), and the receipt lists the icons the module has no export for. Running it again changes nothing.",
        },
        {
          type: 'prose',
          text: 'A library whose icons are data (objects or SVG strings) has no components to find: create the set, declare an `adapter` in its data file (see library shapes), and run the command again; every data export then becomes an icon through the adapter. When every icon export shares a leading word, such as `feather` in `featherEye` and `featherSun`, ids and export names leave it out: `featherEye` becomes id `eye`, exported as `EyeIcon`. The prefix is read over icon-like exports only: SCREAMING_CASE constants (`README`, `VERSION`), number and boolean exports, and, next to components or icon objects, plain strings are never icons. Components named `…Provider` or `…Context` are never icons either. Leave out any other export that is not an icon with `--exclude meta,version`: the data file keeps the list in `exclude`, so a refresh leaves them out too. When a library exports one icon under several names (`Trash2` and `Trash`), the icon is recorded once and its other names become words, so `experimental icon trash-2` finds it and `experimental icon map delete trash-2` maps it. `experimental icon add` reads the prefix the same way, and reuses the icon an export already has, so its commands need no `--id`.',
        },
      ],
    },
    {
      id: 'export-the-icons',
      title: 'How icons are exported',
      content: [
        {
          type: 'prose',
          text: "Every icon is a named export of your package's public entry, so apps, templates, and theme maps all import components from one place:",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "The data file's `module` is your package name or one of its package.json `exports` subpaths, never a file path. `integration check` fails otherwise.",
            "A variant is a named look the set supplies (for example outline or solid); size comes from CSS. List the names in `variants` in the data file and the one each icon's own export draws in `default`.",
            'Each export is named `<Name>Icon`, and a variant `<Name><Variant>Icon`, such as `TrashSolidIcon`. `experimental icon add` names them that way; `integration check` warns on another name.',
            'Each export is a React component: a function, a class, `forwardRef` or `memo`, or what your adapter returns. `integration check` fails on a plain object or string.',
            'It accepts SVG props (`className`, `style`, `aria-*`, `width`, `height`), draws with `currentColor`, and fills its box (`1em` or `100%`), so `<Icon icon={TrashIcon} size="sm" />` sizes and colors it like a built-in icon. The CLI cannot check this statically; the test below can.',
          ],
        },
        {
          type: 'prose',
          text: "`experimental icon add` writes the set's generated module (`generated` in the data file) and its declaration file, which re-exports each component's own types and types each adapted icon as `ComponentType<SVGProps<SVGSVGElement>>`. Add this line to your package's entry and its types; `experimental icon new-set` names the exact line and file in its receipt (see add an icon set):",
        },
        {
          type: 'code',
          lang: 'js',
          code: "export * from './icon-sets/outline/outline.generated.js';",
        },
        {
          type: 'prose',
          text: "An optional render test you can copy. Save it inside your package directory and run it there, since it imports your package by name through its `exports`, and install `react-dom` first (`npm install -D react-dom`). A library may add its own classes beside yours, so it checks the class list. A library that sets `width` and `height` attributes (24, say) still fills its box: CSS sizing, such as the `Icon` component's, overrides SVG size attributes.",
        },
        {
          type: 'code',
          lang: 'js',
          code: `import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import * as icons from '@acme/icons';

for (const [name, Icon] of Object.entries(icons)) {
  if (!name.endsWith('Icon')) continue;
  const html = renderToStaticMarkup(createElement(Icon, {className: 'x'}));
  if (!/class="([^"]* )?x( [^"]*)?"/.test(html)) throw new Error(\`\${name} drops className\`);
  if (!html.includes('currentColor')) throw new Error(\`\${name} has a fixed color\`);
}`,
        },
      ],
    },
    {
      id: 'library-shapes',
      title: 'Library shapes',
      content: [
        {
          type: 'prose',
          text: '`--from` is any import specifier: a package, a package subpath, or a `./` path inside your package. Use the row that matches the library:',
        },
        {
          type: 'table',
          headers: ['Library ships', 'Command'],
          rows: [
            [
              'Components in one module',
              '`experimental icon add Bin --from @acme/glyph-library --definition delete`',
            ],
            [
              'A subpath per style',
              '`experimental icon add --variant solid --from @acme/glyph-library/solid --all` for every icon at once, or `experimental icon add Bin --from @acme/glyph-library/solid --id bin --variant solid` for one (the set must declare the variant: `new-set --variants`)',
            ],
            [
              'One file per icon, default export',
              '`experimental icon add Rocket --from @acme/glyph-library/rocket --default --definition rocket`',
            ],
            [
              'Icon data objects',
              'Declare an `adapter`, then `experimental icon add Rocket --from @acme/glyph-data --definition rocket`',
            ],
            [
              'SVG strings or URLs',
              'Declare an `adapter` that renders them, then `experimental icon add` as above',
            ],
            [
              'Your own component files',
              "`experimental icon add Rocket --from ./src/icons/rocket.js --definition rocket`, and `--id rocket --variant solid` for its other looks. The file exports a component named as written (no library prefix is taken off), with a declaration file beside it (`rocket.d.ts`) or written in TypeScript, since the set's types re-export its own; when package.json lists `files` and none covers it, the receipt names the `files` array that publishes its folder.",
            ],
          ],
        },
        {
          type: 'prose',
          text: 'An export that is not a component goes through your adapter: a function in your package that turns it into one. Declare it in the data file, `"adapter": {"module": "./src/adapt.js", "export": "adapt"}`, and `experimental icon add` writes `export const RocketIcon = adaptIcon(RocketIconSource);`:',
        },
        {
          type: 'code',
          lang: 'js',
          code: `// src/adapt.js
import {createElement} from 'react';

/** Turn one icon data object ({path}) into an icon component. */
export function adapt(data) {
  return function AdaptedIcon(props) {
    return createElement(
      'svg',
      {'viewBox': '0 0 24 24', 'width': '1em', 'height': '1em', 'fill': 'currentColor', ...props},
      createElement('path', {d: data.path}),
    );
  };
}`,
        },
      ],
    },
    {
      id: 'theme-map',
      title: 'The theme map',
      content: [
        {
          type: 'prose',
          text: 'The generated module also exports `themeIcons`: one entry per built-in definition in `map`, each an element of your own icon, hidden from assistive technology and sized `1em`. The CLI rewrites it on every `experimental icon add` and `experimental icon map`, so you never write it by hand, and `integration check` proves it matches `map`. A theme uses it in one line:',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import {defineTheme} from '@astryxdesign/core/theme';
import {themeIcons} from '@acme/icons';

export const brand = defineTheme({name: 'brand', icons: themeIcons});`,
        },
      ],
    },
    {
      id: 'check-the-set',
      title: 'Check the set',
      content: [
        {
          type: 'prose',
          text: "`astryx integration check` reads the set without running your icons. An unmapped built-in definition is an error that names the definition's description and words and the `experimental icon map <definition> <icon id>` command that fixes it, so you or your agent can pick the icon. It names a search of your set (`experimental icon <word> --set <set>`) only when that search finds icons, and suggests one icon: the first of the suggestions `experimental icon new-set` gives for that definition. It never matches part of a word, and never writes a suggestion. Its icon-set codes:",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`invalid_icon_set` (error): the descriptor, data file, or a definition file is invalid, for example a repeated `id`, an icon with no words, or a `map` key that is neither an Astryx definition nor one in your `definitions` folder. The set is withdrawn: apps do not see it.',
            '`icon_builtin_definition_missing` (error): a built-in definition is not in `map`.',
            '`icon_definition_unused` (warning): a definition you declared is not in `map`.',
            "`icon_definition_shadowed` (warning): a definition you declared now exists in Astryx; map to Astryx's and remove yours.",
            '`icon_module_not_public` (error), `icon_export_name` (warning), `icon_not_component` (error): the export contract above.',
            '`icon_export_missing` (error): an export, the generated module, or the adapter does not exist.',
            "`icon_module_invalid` (error): the set's module, a file it re-exports, or the generated module does not parse; reported once, instead of a missing export per icon.",
            "`icon_generated_types_mismatch` (error): the generated module's declaration file is missing or does not match it.",
            '`icon_theme_map_mismatch` (error): the theme map disagrees with the built-in entries of `map`.',
            '`icon_source_version_drift` and `icon_license_notice_missing` (warnings): the data names another library version than the package depends on, or a set with an upstream ships no license notice.',
          ],
        },
        {
          type: 'prose',
          text: 'The other Astryx definitions your set leaves unmapped are not issues: a library need not draw every definition. They are listed under "Unmapped icon definitions (optional)", and in the JSON as the validate result\'s `iconSets`: for each set, `unmappedDefinitions` (each `{name, description, words}`) and `suggestions` (each `{definition, icon}`, for any unmapped definition one of your icons fits). They are never counted and never fail a check.',
        },
        {
          type: 'prose',
          text: 'An export fails only when the reader proves it absent; what it cannot judge it does not fail either. An icon export whose module is an `exports` target you have not built yet; an icon or adapter export it cannot prove either way (behind a re-export it cannot follow, bound to a default or namespace import, or imported from a package that is not installed); and a theme map or theme-map entry it cannot read are listed under "Not checked", and in the JSON as each set\'s `unchecked` (each `{icon}`, `{adapter}`, or `{entry}`, with its `reason`). Build the package, install the package it imports from, export the icon by name, or write the entry as a binding or element to have it checked. An export your built module lacks is still an error.',
        },
        {
          type: 'prose',
          text: 'Errors fail the check. Warnings fail only with `--strict`. A set that maps every built-in definition and every definition it declares passes `--strict`, which integrations run in their build ({@link generic:checks}). The flow, start to finish: `experimental icon new-set` → `npm install -D typescript@6` when the receipt asks → `integration check` → `experimental icon add` (or `experimental icon map`) for each definition it lists → `integration check` passes.',
        },
      ],
    },
    {
      id: 'publish',
      title: 'Before you publish',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Run `astryx integration verify` yourself before publishing. Do not put it in `prepublishOnly`: under `npm publish --dry-run` its own `npm pack` becomes a dry run too, and it checks nothing.',
            "Declare `@astryxdesign/cli` as an optional peer (`peerDependenciesMeta`). A required peer an app cannot satisfy makes npm remove the app's CLI without a word. Icon sets are experimental, so no version range promises them, and the format may change in a patch release. A CLI reads a set only when it knows every key the set's data file uses: a key it does not know withdraws the set, naming the key. `exclude` is read only by a CLI whose data-file reference lists it ({@link schema:icon-set-data}); a set without `exclude` is read by every CLI that has `astryx experimental icon`. A CLI without it reads `experimental` as a manifest key it does not know: `astryx doctor` there warns that your package was published against a newer Astryx CLI, other commands print a one-line nudge to run it, and your icons, icon definitions, and template icon mapping do not appear ({@link generic:versioning}).",
            "Every built-in definition needs an icon, because Core renders it. When your library has no icon with that exact meaning, map the closest one, or add your own artwork as a component file in your package (`experimental icon add <Name> --from ./src/icons/<name>.js --definition <definition>`; a ./ path is named as written). Artwork you draw is yours: note its license beside the library's, for example in a NOTICE file in the set directory.",
            'The generated declaration file imports React types, so declare `@types/react` as an optional peer for TypeScript users.',
            'Keep the wrapped library in `dependencies`: your generated module re-exports its components, so apps get it with your package, and `integration check` compares its range with the version the data file records.',
            "`integration check --strict` type-checks the set's doc files; it does not type-check the generated declaration file against React's types. Run `tsc` with `@types/react` installed to check those.",
            'Your package needs `react` (the theme map and adapter use it) as a peer, as Core does. The `experimental icon new-set` receipt names the peers your package.json does not declare yet, as the JSON to add: `react` (`>=18`), and `@types/react` and `@astryxdesign/cli` (from the release that wrote the set) as optional peers; and the `typecheck` script (`astryx integration check --strict`) when there is none.',
          ],
        },
      ],
    },
    {
      id: 'share-a-definition',
      title: 'Share a definition with every set',
      content: [
        {
          type: 'prose',
          text: "Your own definitions need no change to Astryx. To share one with every set, open a pull request that copies its file into the CLI's icon definitions folder, with a description and words. Its name must not clash with another definition.",
        },
      ],
    },
    {
      id: 'how-apps-use-it',
      title: 'How apps use it',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: `astryx experimental icon delete              # ranked matches with import lines
astryx experimental icon outline/bin         # one icon and every variant
astryx experimental icon --list              # installed sets and their definition coverage
astryx experimental icon use outline         # make it the project's icon set`,
        },
        {
          type: 'prose',
          text: "A template declares, in its descriptor's `icons`, the definition each imported icon draws (`{TrashIcon: 'delete'}`). Once the project sets `experimental.iconSet` in astryx.config (`experimental icon use` writes it), each declared icon becomes the set's icon for that definition. An icon the set does not map keeps its original import, and the copy reports every icon as mapped or kept. Nothing is guessed from names. A mapped icon loses its library's sizing props (`size`, `strokeWidth`, `absoluteStrokeWidth`), since a set's icons take their size from CSS; the report names them as `dropped`. Comments on a rewritten import line are kept.",
        },
        {
          type: 'prose',
          text: "Each `icons` key is the name the template imports from its module, not a local alias. When a template imports the same name from two modules, such as `TrashIcon` from a library's outline and solid modules, one key covers both: both draw the same definition. Each then becomes the project set's variant of the same name when its module belongs to an installed set that declares the variant (so solid stays solid), else the set's default.",
        },
      ],
    },
    {
      id: 'reference',
      title: 'Where icon sets show up',
      content: [
        {
          type: 'prose',
          text: 'Every place the CLI reads or reports icon sets, all experimental. Outside `astryx experimental icon`, each appears only in a project that sets `experimental.iconSet`; `astryx search` never returns icons:',
        },
        {
          type: 'table',
          headers: ['Where', 'What'],
          rows: [
            [
              '`experimental.iconSet` in astryx.config',
              "The project's icon set, by set name or as `<package>/<set>`, and the opt-in: templates, discover, and doctor read icon sets only when it is set. `astryx experimental icon` ranks its icons first, and without it treats the only installed set as the project's. `astryx experimental icon use` writes it.",
            ],
            [
              '`experimental.iconSets` in the integration manifest',
              "The folder that holds the package's icon sets, relative to package.json. `astryx experimental icon new-set` declares it.",
            ],
            [
              "A template descriptor's `icons`",
              "The icon definition each imported icon draws (`{TrashIcon: 'delete'}`): a named import by the name it imports, a default import by its local name. `astryx template`, shown or copied, then writes the set's icons and reports `icons` (status, set, mapped, kept): every key is mapped, or kept with why (no match, a namespace or type-only import, a re-export, an Astryx or project-set import, or no import at all). `integration check` notes a key the template's source never imports (`template_icon_not_imported`), never failing.",
            ],
            [
              '`astryx discover`',
              "A package's sets (`iconSets`) and, for `@scope/name/<set>`, the set's display name, license, icon count, and definitions; `--type icon-set` keeps only sets.",
            ],
            [
              '`astryx doctor`',
              'In an app, the `icon-sets` check: fails when `experimental.iconSet` names a set that is not installed or was withdrawn (an invalid set, or one whose module does not resolve), saying why, and warns when two packages ship a set by that name or a set was withdrawn. In your icon-set package, check with `astryx integration check` instead: plain `doctor` diagnoses an app.',
            ],
            [
              'JSON types',
              '`icon.search`, `icon.detail`, `icon.list`, `icon.setIcons`, `icon.definitions`, `icon.use`, `icon.map`, `icon.mapMany`, `icon.add`, `icon.addVariants`, `icon.definitionMatches`, `icon.newSet`, and `icon.newDefinition`, from the matching `astryx experimental icon` command.',
            ],
          ],
        },
      ],
    },
  ],
};
