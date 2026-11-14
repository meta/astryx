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
          text: "`outline.doc.mjs` is the descriptor: name, display name and description (`--display-name`, `--description`), and `license`, the SPDX license of the artwork (it starts as your package's own). `outline.icons.json` starts with no icons and an empty `map`; its `module` is your package name. After you rename the package, the next command that writes the data file (`new-set` on the existing set, with or without `--from`, `add`, `map`, or `new-definition --icon`) writes the new name and keeps any subpath (`@acme/old-icons/outline` becomes `@acme/new-icons/outline`), and its receipt says so. `outline.generated.js` is the set's generated module, with its declaration file `outline.generated.d.ts`: the CLI writes both, and every icon and the theme map are exports of it. Every field is in {@link schema:icon-set-doc} and {@link schema:icon-set-data}.",
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
          text: "Every component the library exports becomes an icon (an alias of one component is recorded once), named `<Name>Icon`, with an id from its name (`Squares2X2Icon` is `squares-2x2`: a dimension stays one word). An export name cannot start with a digit, so an icon whose id would start with one once the library prefix comes off keeps the prefix (`fa0` is id `fa-0`, exported as `Fa0Icon`), and an id you give with `--id` must start with a letter. `map` is filled only where a definition's name is an icon's id (`delete` → icon `delete`), and the receipt lists those entries under Mapped by name: a library can draw another meaning under the same name (one library's `delete` is a backspace key), so check each. An icon whose id is only one of a definition's words (`trash` for `delete`) may mean something else in this library, so the receipt lists it under Suggestions, with the `experimental icon map <definition> <icon>` command for each, and writes nothing for it: check the meaning, then run the ones that fit. Run it again after a library release to refresh the icons that library supplies; `map` entries whose icon still exists are kept, and the receipt names any icon the library dropped, any icon `--exclude` left out, and the `map` entries each took with it. Icons you added from your own files or another library are left as they are. Icons you added one file at a time from the same package (`--from <package>/dist/XIcon`) move to the root import when you refresh from the package root and the root exports the same icon; each keeps its id, export, `map` entries, variants, and words on that refresh and every later one, and the receipt lists it under `moved`. A library icon whose id or name a moved icon already has is left out. When another icon of the set already reads the same root export, the icon stays on its own file, and the receipt says why. An icon you already have is known by the library export it re-exports, so it keeps its export name exactly, its `map` entries, variants, and words, even when a newer CLI spells its id differently or your `--exclude` lets a library prefix come off new ids; the receipt lists each changed id under `renamed`. An id you chose that is not a spelling of the library name (`dismiss` for `XIcon`) is kept. A refresh with `--dry-run` writes nothing and prints the Mapped by name and Suggestions lists again; `--display-name` and `--description` on a refresh rewrite the descriptor. Variants added with `add --variant … --all` are kept too; run that `add` again to pick up icons the release added. `experimental icon --list` shows how many definitions the set maps.",
        },
        {
          type: 'prose',
          text: "With a package or package subpath, it also records the installed library and version as the data file's `source`, so `integration check` warns when your dependency moves to another version; copies the library's LICENSE (and NOTICE) files into the set directory; and sets the descriptor's `license` to the library's. A set you started without `--from` gets the same the first time a refresh records its source, unless you already changed `license`: a `license` you set is kept (the receipt names the library's), and every later refresh keeps it too. Your package.json `license` is never changed. Edit `license` when the artwork's license differs from the library's package license. When the library ships no license file to copy, the receipt says so under `licenseNoticeMissing` and in its notes, and the CLI writes nothing: add a `NOTICE` file to the set directory (`icon-sets/<set>/NOTICE`) that names the library, its version, and its license. `integration check` accepts a file named `LICENSE`, `LICENCE`, `NOTICE`, or `COPYING`, in any case and with an optional suffix such as `NOTICE.md` or `LICENSE-MIT`, in the set directory or the package root; without one it reports `icon_license_notice_missing`.",
        },
        {
          type: 'prose',
          text: "A library with a module per style supplies variants. Declare them when you create the set, then add a variant for every icon in one run. Name each look by what it draws, `outline` or `filled`, not by the library's word for it (Heroicons calls its filled look `solid`): an app picks one look for all its icons by that name, and the name reaches every set in its list that uses it (see Draw every icon in one look).",
        },
        {
          type: 'code',
          lang: 'bash',
          code: `astryx experimental icon new-set heroicons --from @heroicons/react/24/outline --variants outline,filled --default-variant outline --description 'Heroicons, outline and filled.'
astryx experimental icon add --variant filled --from @heroicons/react/24/solid --all`,
        },
        {
          type: 'prose',
          text: "A library that redraws its artwork for small sizes (Heroicons' 20px mini and 16px micro) ships each of those as its own set in its own package (their export names match the 24px ones), not as variants: a variant's size comes from CSS. `--variants` lists the variants; `--default-variant` names the one each icon's own export draws (when omitted, the look a library that names its looks draws; otherwise the set's current default, else, on a set without icons, the first variant; a set with icons changes it only with `--from`, and only in a library that names its looks). `--all` adds the variant for every icon whose id an export of `--from` has (`TrashIcon` in the solid module becomes `TrashFilledIcon`, the filled variant of `trash`), and the receipt lists the icons the module has no export for. A library may ship each look as its own package (Font Awesome's solid and regular packages): `--from` may then name the other package, and an icon gains the variant from the export of the same name there; the receipt lists the icons that package has no export for. Running it again changes nothing.",
        },
        {
          type: 'prose',
          text: 'A library whose icons are data (objects or SVG strings) has no components to find: write an adapter (see library shapes) and pass it, as in `experimental icon new-set fa --from @acme/glyph-data --adapter ./src/adapt.js#adapt`; every data export then becomes an icon through the adapter. When every icon export shares a leading word, such as `feather` in `featherEye` and `featherSun`, ids and export names leave it out: `featherEye` becomes id `eye`, exported as `EyeIcon`. The prefix is read over icon-like exports only: SCREAMING_CASE constants (`README`, `VERSION`), number and boolean exports, and, next to components or icon objects, plain strings are never icons. Components named `…Provider` or `…Context` are never icons either, and neither is a pack: an object whose keys are all other exports of the module, such as `fas` next to `faXmark`. Leave out any other export that is not an icon with `--exclude meta,version`: the data file keeps the list in `exclude`, so a refresh leaves them out too. When a library exports one icon under several names (`Trash2` and `Trash`), the icon is recorded once and its other names become words, so `experimental icon trash-2` finds it and `experimental icon map delete trash-2` maps it. `experimental icon add` reads the prefix the same way, and reuses the icon an export already has, so its commands need no `--id`.',
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
          text: 'An optional render test you can copy. Save it inside your package directory and run it there, since it imports your package by name through its `exports`, and install `react-dom` first (`npm install -D react-dom`). A library may add its own classes beside yours, so it checks the class list. A component that writes its own `width` and `height` attributes (24, from a `size` prop, say) still fills its box when it passes `style` through to its svg: the `Icon` component and `themeIcons` size the svg with CSS, which overrides size attributes. The test checks that too.',
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
  const styled = renderToStaticMarkup(createElement(Icon, {style: {width: '1em'}}));
  if (!styled.includes('width:1em')) throw new Error(\`\${name} drops style, so CSS cannot size it\`);
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
              'Every look in its export names (`XOutline24WGHT500Icon`, `XFilled24WGHT500Icon`)',
              "`experimental icon new-set meta --from @acme/vector-icons` wraps each glyph once as `x` (`XIcon`), in the look `--default-variant` names or the library's usual default (outline, the middle weight). For another look: `experimental icon new-set meta --variants outline,filled` declares it in place, then `experimental icon add --variant filled --from @acme/vector-icons --all`",
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
          text: 'An export that is not a component goes through your adapter: a function in your package that turns it into one. Pass it to `experimental icon new-set` as `--adapter ./src/adapt.js#adapt`, which declares it in the data file as `"adapter": {"module": "./src/adapt.js", "export": "adapt"}`; with `--from`, every data export becomes an icon through it, and `experimental icon add` writes `export const RocketIcon = adaptIcon(RocketIconSource);`:',
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
          text: "The generated module also exports `themeIcons`: one entry per built-in definition in `map`, each an element of your own icon, hidden from assistive technology and sized `1em` by its attributes and by CSS (its `style`), so it fills the theme's icon box even when your component writes its own size attributes. The CLI rewrites it on every `experimental icon add` and `experimental icon map`, so you never write it by hand, and `integration check` proves it matches `map`. A theme uses it in one line:",
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import {defineTheme} from '@astryxdesign/core/theme';
import {themeIcons} from '@acme/icons';

export const brand = defineTheme({name: 'brand', icons: themeIcons});`,
        },
        {
          type: 'prose',
          text: "`themeIcons` draws your default look. For each other variant that one of your icons draws, the module also exports a map named after it, `themeIcons<Variant>` (`themeIconsFilled` for `filled`): the same keys, each your icon's export for that variant, or its own export when it has none. An app whose icons draw that look sets `icons: themeIconsFilled` instead. `integration check` holds each of these maps to `map` as well; when an older module lacks one, it names the `experimental icon add --variant <variant> --from <module> --all` run that writes it.",
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
          text: 'Templates use more meanings than the built-in ones, such as `document` and `share`. A copied template shows a placeholder for each meaning your set does not map. To see which, run `astryx experimental icon --definitions` in your package: each definition shows how many templates use it and whether your set maps it. `new-set`, `add`, and `map` end with a line that names the template meanings the set still leaves unmapped, most used first, and `integration check` lists them under "Template icon meanings not mapped" (in the JSON, each set\'s `templateMeanings.unmapped`, each `{definition, templates}`). This list never fails a check.',
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
astryx experimental icon --list              # installed sets, their order, and definition coverage
astryx experimental icon use outline         # make it the project's main icon set
astryx experimental icon use outline --backup brand   # a main set, then a backup
astryx experimental icon use brand --variant filled   # every icon in its filled look`,
        },
        {
          type: 'prose',
          text: "A template declares, in its descriptor's `icons`, the definition each imported icon draws (`{TrashIcon: 'delete'}`). Once the project sets `experimental.iconSet` in astryx.config (`experimental icon use` writes it), each declared icon becomes the icon for that definition from the first set in the project's list that maps it. An icon that no set in the list has draws a placeholder instead (see When no set has an icon, below), unless it comes from the library a set in the list wraps (the `source` in the set's data). Such an icon is already one your project chose: a template written with the main set's own library keeps its icons as written, and an icon from a backup set's library that no set maps keeps its import. The copy reports every icon as mapped, a placeholder, or kept. Nothing is guessed from names. A mapped icon loses its library's sizing props (`size`, `strokeWidth`, `absoluteStrokeWidth`), since a set's icons take their size from CSS; the report names them as `dropped`. Comments on a rewritten import line are kept.",
        },
        {
          type: 'prose',
          text: "Each `icons` key is the name the template imports from its module, not a local alias. When a template imports the same name from two modules, such as `TrashIcon` from a library's outline and solid modules, one key covers both: both draw the same definition. Each then becomes the chosen set's variant of the same name when its module belongs to an installed set that declares the variant (so solid stays solid). When the chosen set's icon has no such variant, it draws the set's default look, and the report names both looks as `variant: {asked, used}`. A missing look never moves an icon to a backup set. When the project picks a look (`experimental.iconVariant`), every icon asks for that look instead.",
        },
      ],
    },
    {
      id: 'main-and-backup-sets',
      title: 'Choose a main set and backups',
      content: [
        {
          type: 'prose',
          text: 'A project uses one main icon set. Backup sets fill the meanings the main set does not map, in the order you list them. Each icon comes from exactly one set: the first in the list that maps its meaning. Two sets that both map a meaning never mix; the list order decides.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: `astryx experimental icon use outline --backup @acme/brand-icons/brand --backup lines`,
        },
        {
          type: 'prose',
          text: "`use` writes `experimental.iconSet` in astryx.config. With no `--backup`, it writes the set name as a string. With backups, it writes a list, the main set first. Name a set as `<set>`, or as `<package>/<set>` when two packages ship a set with that name. Every set in the list must be installed, and each set appears once. When the project's `@astryxdesign/cli` range also admits an older release that refuses the value written, `use` warns and names the range to require; the CLI you run now reads it either way.",
        },
        {
          type: 'code',
          lang: 'js',
          label: 'astryx.config.mjs',
          code: `export default {
  experimental: {
    // One main set:
    // iconSet: 'outline',
    // A main set, then backups in order:
    iconSet: ['outline', '@acme/brand-icons/brand', 'lines'],
  },
};`,
        },
        {
          type: 'prose',
          text: "`astryx experimental icon --list` shows the order: the project's `order` (each set as `<package>/<set>`), and each set's `role` (`main`, `backup`, or not listed) and `rank`. Its coverage columns count the definitions each set maps: `builtIn` of the built-in names (a valid set maps them all, and `missing` lists any it lacks), and `definitions` of every Astryx definition. When two or more sets are installed and none is the main set, `--list` says so with the command to run, `astryx experimental icon use <main> --backup <set>`. The `use` receipt (`icon.use`) names the main set (`iconSet`, `set`) and each backup (`backups`), and lists installed sets the list leaves out (`unlisted`) with the command that adds them (`next`): `astryx doctor` fails a project that installs more than one set and leaves one out of the list.",
        },
        {
          type: 'prose',
          text: "Only the main set's theme map feeds `defineTheme({icons})`. Backups never change the theme. The copy report lists each set it used, with its license (`icons.sets`).",
        },
      ],
    },
    {
      id: 'one-look',
      title: 'Draw every icon in one look',
      content: [
        {
          type: 'prose',
          text: "A set may supply each icon in several looks, its variants: outline and filled, say. A project picks one look for all of its icons with `--variant`, which writes `experimental.iconVariant` next to `experimental.iconSet`. The look must be one of the main set's variants; `experimental icon --list` shows each set's `variants`.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: `astryx experimental icon use brand --backup lines --variant filled`,
        },
        {
          type: 'code',
          lang: 'js',
          label: 'astryx.config.mjs',
          code: `export default {
  experimental: {
    iconSet: ['brand', 'lines'],
    iconVariant: 'filled',
  },
};`,
        },
        {
          type: 'prose',
          text: "Sets match the look by name. Each set in the list draws its variant called `filled`; a set without one draws its default look, and the receipt shows the look of every listed set (`looks`). A set that calls the same look something else, such as `solid` or `regular`, draws its default look until it renames that variant to `filled`. A copied template imports each icon's `filled` export where the icon has one (`TrashFilledIcon`). Where it has none, the copy keeps the set's default export and reports `variant: {asked, used}`; it never fetches that icon from a backup for its look. With a look picked, an icon taken from the main set's own library becomes the main set's icon in that look: the one `map` names for its meaning, or else the one that re-exports that same library export (reported `by: 'variant'`). An icon already imported from a listed set in another look moves to its `filled` export (also `by: 'variant'`). The copy report names the look as `icons.variant`.",
        },
        {
          type: 'prose',
          text: "Components take the built-in icons from the theme. Where an icon of the main set draws the look, the set's package exports a theme map for it, `themeIconsFilled`, and the receipt names that export and its module (`themeMap`):",
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import {defineTheme} from '@astryxdesign/core/theme';
import {themeIconsFilled} from '@acme/brand-icons';

export const brand = defineTheme({name: 'brand', icons: themeIconsFilled});`,
        },
        {
          type: 'prose',
          text: "`use` writes the whole choice each time: run it with every set and the look you want, and without `--variant` to go back to each set's default look, which removes `experimental.iconVariant`. `astryx doctor` fails while the main set declares no variant of that name, naming its variants and the command that picks one. A CLI older than 0.7.16 refuses an astryx.config that sets `experimental.iconVariant`, so `use` warns when the project's `@astryxdesign/cli` range admits one.",
        },
      ],
    },
    {
      id: 'missing-icons',
      title: 'When no set has an icon',
      content: [
        {
          type: 'prose',
          text: "When no set in the list maps an icon's meaning, and no set in the list wraps the library the template imports it from, the copied file removes that icon from the template's library import. It declares a small `MissingIcon` component once (another free name when the file already uses `MissingIcon`), and each place the icon was renders it, so the page still builds and needs no new package. The placeholder is a dashed square, 1em in size, in the current text color. It is hidden from screen readers unless that use gives it an `aria-label`. A comment beside each use records the meaning.",
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `<Icon icon={MissingIcon /* missing icon: cut */} size="sm" />`,
        },
        {
          type: 'prose',
          text: '`astryx template` prints a note for each placeholder, and the JSON report lists it in `icons.placeholder` with its `definitions` and `fixes`. Give the meaning a real icon in one of these ways:',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Add a backup set that has the meaning: `astryx experimental icon use <main> --backup <set>`. `astryx discover --type icon-set` lists the sets your sources offer, with the definitions each maps; install one first.',
            'If you author your main set (its package is yours, not an installed dependency), map the meaning there: `astryx experimental icon map cut <icon> --set <main>`.',
            'For a built-in meaning (`astryx experimental icon --definitions` marks them), render the theme icon by name instead: `<Icon icon="close" />`. Every set maps the built-in names, so this needs no import.',
            'Otherwise, write your own icon component and pass it where `MissingIcon` was (`astryx docs icons custom-icons`).',
          ],
        },
        {
          type: 'prose',
          text: 'After the first two, copy the template again, or replace each use of `MissingIcon` with the icon `astryx experimental icon <meaning>` prints, which finds the icon once a set in your list maps the meaning, and delete the `MissingIcon` declaration. `astryx doctor` warns while copied code still uses the placeholder (the `icon-placeholders` check), and names each file and meaning.',
        },
      ],
    },
    {
      id: 'label-template-icons',
      title: 'Label every template icon',
      content: [
        {
          type: 'prose',
          text: "A template follows a project's icon sets only for the icons its `icons` declares. In a package whose templates declare `icons`, `astryx integration check` notes each icon a template imports but does not declare (`template_icon_undeclared`). The note fails `--strict --next` now, and `--strict` from the next minor release. It counts an import from another package as an icon when a template in the package declares an icon from the same module, and the template renders it as an element with no children (`<Scissors />`) or passes it as a value (`icon={Scissors}`). Any other import from that module, such as a type, a function the template calls, or a provider with children, is listed as not checked: declaring it would make `astryx template` swap it for an icon. An import whose name ends in `Icon`, from any other module, matches by name only, so the check lists it as not checked. A generic renderer (a bare `Icon`, or a component every use gives an `icon`, `iconNode`, `name` or `src` prop, such as lucide's `DynamicIcon`) draws no one definition, so it is listed as not checked too, whatever its module. Neither fails anything. Add the key with the definition it draws; `astryx experimental icon --definitions` lists the definitions, and `astryx experimental icon new-definition` adds one your set needs.",
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
              "The project's main icon set, by set name or as `<package>/<set>`, or a list: the main set first, then backup sets in order. It is the opt-in: templates, discover, and doctor read icon sets only when it is set. `astryx experimental icon` ranks the main set's icons first, and without it treats the only installed set as the project's. `astryx experimental icon use <main> --backup <set>` writes it.",
            ],
            [
              '`experimental.iconVariant` in astryx.config',
              "The look every icon of the project draws, one of the main set's variants; it needs `experimental.iconSet`. Copied templates import each icon in that look where its set has one, and `astryx experimental icon use <main> --variant <variant>` writes it.",
            ],
            [
              '`experimental.iconSets` in the integration manifest',
              "The folder that holds the package's icon sets, relative to package.json. `astryx experimental icon new-set` declares it.",
            ],
            [
              "A template descriptor's `icons`",
              "The icon definition each imported icon draws (`{TrashIcon: 'delete'}`): a named import by the name it imports, a default import by its local name. `astryx template`, shown or copied, then writes the icons from the first set in the list that has each meaning and reports `icons` (status, set, order, variant, mapped, placeholder, kept, sets): every key is mapped, a placeholder when no set has its meaning, or kept with why (a namespace or type-only import, a re-export, an Astryx import or one from a set in the list, an import from the library a set in the list wraps, no import at all, or an icon that draws no definition and has no match). `integration check` notes a key the template's source never imports (`template_icon_not_imported`), never failing, and notes an imported icon the package's templates do not declare (`template_icon_undeclared`), which fails `--strict --next`.",
            ],
            [
              '`astryx discover`',
              "A package's sets (`iconSets`) and, for `@scope/name/<set>`, the set's display name, license, icon count, and definitions; `--type icon-set` keeps only sets.",
            ],
            [
              '`astryx doctor`',
              'In an app, the `icon-sets` check: fails when `experimental.iconSet` names a set, main or backup, that is not installed, was withdrawn (an invalid set, or one whose module does not resolve), or that two packages ship by that name, saying why; fails when more than one set is installed and the list leaves one out; fails when `experimental.iconVariant` names a variant the main set does not declare; and warns when another installed set was withdrawn. The `icon-placeholders` check warns while copied code uses the placeholder for a missing icon, naming each file and meaning. In your icon-set package, check with `astryx integration check` instead: plain `doctor` diagnoses an app.',
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
