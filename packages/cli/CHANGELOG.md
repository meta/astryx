# @xds/cli

# 0.7.5

#### Experimental APIs

- New command `astryx experimental render <page>` turns a page built with your installed Astryx components into one self-contained HTML file. The file needs no network and no scripts, follows light and dark mode, and carries the page's source; `astryx experimental render --reverse <file.html>` writes that source back. Warnings point out anything that may not look as intended. Experimental commands may change or be removed in any patch release. Guide: `astryx docs cli/experimental/render-pages`.
- Building an icon-set package from an icon library takes fewer steps and fewer guesses. Only the experimental icon commands, the icon-set guide, and `astryx template` in a project that sets `experimental.iconSet` change; without that opt-in, stable commands behave as before, and only the `experimental` group's summary in `astryx help` and `astryx manifest` now mentions icon sets.
  - **`experimental icon new-set`.** `--from` maps a definition only when an icon has its exact name and lists those for review; likely matches come back as at most three suggestions each, never written. It saves the library and version, copies the library's license notices, keeps your `--exclude` list across refreshes, and its receipt names the package entry, peer dependencies, and `typecheck` script to add. `--variants`, `--default-variant`, `--display-name`, and `--description` fill in the set. A refresh changes only the icons that library supplies, keeps each icon's export name, and lists renamed icons. A 1,600-icon library is read in about two seconds.
  - **`experimental icon add` and `map`.** `add --variant <name> --from <module> --all` adds a variant for every icon at once, and `map --pairs a=b,c=d` writes many entries in one checked step.
  - Icon commands now refuse options that conflict instead of silently ignoring one (`ERR_INVALID_OPTION`), leave every file as it was when they fail partway (`ERR_WRITE_FAILED`), and report a missing or withdrawn set the same way everywhere (`ERR_NOT_FOUND`).
  - `experimental icon --set <set> --all-icons` lists every icon in a set, and `--definitions` lists every Astryx icon definition.
  - Templates drop a mapped icon library's sizing props (`size`, `strokeWidth`, `absoluteStrokeWidth`) and keep comments on rewritten imports.
  - Thirteen new icon definitions: `rotate`, `flipHorizontal`, `flipVertical`, `alignStart`, `alignCenter`, `alignEnd`, `panelLeft`, `panelRight`, `gitBranch`, `gitFork`, `scale`, `cpu`, and `textCase`. Definitions gain common glyph names as search words; seven optional definitions lose a word that named a different thing: `star` (`bookmark`), `database` (`table`), `raiseHand` (`stop`), `redo` (`forward`), `activity` (`monitor`), `archive` (`store`), `mobile` (`device`).
  - `integration check` suggests icons by the same rule, describes each optional definition, and its version-drift warning gives the refresh command.

#### New Features

- Status colors are readable everywhere they appear, and Info is a status of its own. Each status (info, success, warning, error) now has a strong fill (`--color-<status>`) with content on it (`--color-on-<status>`, at least 4.5:1), a pale fill (`--color-<status>-muted`) with its content (`--color-on-<status>-muted`), and readable text for the page and cards (`--color-text-<status>`). Status icons (`--color-icon-<status>`) and borders (`--color-border-<status>`) default to the readable text color. The Info roles (`--color-info`, `--color-on-info`, `--color-info-muted`, …) are new and no longer borrow your accent color.

  `--color-success`, `--color-warning`, and `--color-error` and `bg-<status>` keep their meaning as the strong fills. In Tailwind, `bg-info`, `bg-info-muted`, `text-on-<status>`, `text-on-<status>-muted`, and `text-status-<status>` are new; `text-`, `decoration-`, `placeholder-`, and `caret-<status>` now use the readable text shade, and `border-`, `divide-`, `outline-`, and `ring-<status>` use the border shade, while `bg-`, `accent-`, `fill-`, `stroke-<status>`, shadows, and gradients keep the strong fill. For example, Core's light `text-warning` is now `#753F07` instead of `#E9AF08`. To keep the fill color on text, write `text-[var(--color-warning)]`.

  What changes on screen:

  - Core's dark Error content (`--color-on-error`) is now `#0A1317` instead of white, so text on dark-mode error fills reaches 4.5:1. Core's Info Badge uses `#0064E0` instead of the accent (`#2694FE` in dark mode).
  - Status icons (Icon `color="info|success|warning|error"`), Stepper status glyphs, and Chat tool-call status icons use the readable shades. Core's light success icon is now `#09441F` instead of `#0D8626`.
  - Input and FileInput status borders use the border shades. Core's light warning border is now `#753F07` instead of `#E9AF08`, and Butter's light success and warning input borders reach 3:1.
  - Banner draws its title, description, icon, and controls in the on-muted colors, and fills Info with `--color-info-muted`.
  - Status fills keep a visible edge in forced-colors mode.
  - Content on Chocolate and Matcha success and error fills, and on Stone success, warning, and error fills, now reaches 4.5:1.
  - Every first-party theme sets a blue Info. Chocolate and Matcha Info Badges move from the accent to that blue; Butter keeps its own Info Badge colors.
  - Neutral's `--color-success`, `--color-warning`, and `--color-error` are now the fills its Badges already showed, and its `--color-info` is `#0074E2` (`#6D9CFE` in dark mode). Its Badges, StatusDots, progress fills, and Stepper badges look the same; its accent ProgressBar, StatusDot, and Stepper now use Neutral's accent instead of blue.
  - Neutral no longer defines its undocumented local status tokens. Use the standard roles instead: `--astryx-theme-neutral-color-status-fill-success`, `-status-fill-warning`, and `-status-fill-error` → `--color-success`, `--color-warning`, `--color-error`; `-status-muted-accent` → `--color-info-muted`; `-on-tint-neutral` → `--color-neutral`; the `-on-tint-overlay-*` and `-destructive-overlay-*` tokens → `--color-overlay-hover` and `--color-overlay-pressed`. `--astryx-theme-neutral-color-status-fill-accent` keeps its value but is deprecated.

  Custom themes get the content and text roles they don't set: they are derived from the theme's status fills. To keep a component's previous color, set the matching role, for example `--color-icon-success` to your old `--color-success`.

- CodeBlock's `tokenizer` prop is deprecated in favor of a custom language: pass `language={createCodeLanguage({name, identifiers, tokenize})}` with the same function. The prop still works. `astryx upgrade` rewrites it when the block has a fixed `language`, and leaves a TODO comment where it can't safely rewrite it.
- `Icon` takes an optional `variant` to ask the active theme for alternate artwork, for example `<Icon icon="info" variant="filled" />`. The theme's icon receives the variant only when the theme lists it in `iconVariants`; otherwise it draws its normal artwork. Icons you pass as components never receive `variant`, and it is never written to the page. Icons without `variant` render as before.
- A theme icon can now pick its artwork by size: an entry in `defineTheme({icons})` or `registerIcons()` can be a function of `{size, variant}`, and `Icon` calls it with the size it renders at. Returning `null` draws no icon. `getIcon`, `getExtendedIcon`, `getIconRegistry`, `useIcon`, and a theme's `icons` field still return nodes, reading a function at `{size: 'md'}`. Existing icon entries are unchanged.
- A theme can list the icon variants it supports, such as `filled`, with `defineTheme({iconVariants})`, and read them back from `theme.iconVariants`. Child themes inherit the list unless they set their own. `@astryxdesign/core/Icon` exports `IconVariantMap` and `IconVariant` for typing variants. Themes without `iconVariants` are unchanged.
- `astryx theme build` keeps function icons and icon variant lists, so a built theme draws each icon at the same size and variant as the live theme, including icons inherited from another theme. A theme that lists `iconVariants` gets matching types in `<theme>.variants.d.ts`. Themes without these features build exactly as before.
- Themes can set the real size of each Icon size: `width` and `height` in `px` or `rem` on `components.icon['size:sm']` (or `xsm`, `md`, `lg`) now resize the glyph itself, for named icons and SVG components, in live and built themes. Before, they sized only the box around the icon. Sizes a theme does not style still render at 12, 16, 20, or 24px at a 16px root. `astryx docs theme` gains an Icon sizes section.
- New `--ease-exit` motion token for things leaving the screen, beside `--ease-standard` for things arriving. BottomSheet already closes on it, so nothing looks different, but a theme can now tune the exit. `astryx docs motion` and the theme template list it.
- `astryx upgrade` finishes instead of failing when it finds code it can't migrate safely: each spot is listed in `declinedCandidates` with its file, line, and a reason starting `manual migration needed (<codemod>):`, and the run exits 0. Generated files that need rebuilding, such as stale theme CSS, are listed in a new `regenerate` field with their rebuild command until they are rebuilt; a `hooks.postCodemod` that rebuilds them clears the entry. Protected generated files still stop the run as before, now with the rebuild command listed.
- The two Bottom Sheet flow templates (`BottomSheetSwitcherShowcase`, `BottomSheetSwitcherReviewFlow`) now show the standalone-step pattern that replaces `BottomSheetSwitcher`, and are also listed under `BottomSheet`. Template names and ids are unchanged.

#### Fixes

- Projects that compile StyleX with `@stylexjs/unplugin` (the standard Vite setup) are detected as StyleX projects.
- The `Tokenizer` showcase template's search returns matching tags again, so the live example on the Tokenizer docs page works.
- `astryx integration verify` no longer fails with "npm pack failed" when another `npm` wrapper comes first on your PATH.
- `astryx upgrade` skips vendored, generated, or ignored files it can't parse, lists them in `declinedCandidates`, and finishes the rest of the upgrade.
- `astryx upgrade` no longer spends minutes reading symlinked `node_modules` folders or package stores.
- `astryx upgrade --from` a version before 0.7.0 no longer fails on `var(--color-data-*)` without a fallback. Source builds that read raw data colors should import `dataVars` from `@astryxdesign/core/theme/dataTokens.stylex`.
- Tools that call the CLI API repeatedly, such as a docs site search, now see doc edits without restarting.
- Component families list the same members whether or not the package has been built, so Lab's `TourStep` now appears in the official package list.
- `astryx upgrade` handles an `astryx.config` written as `const config = {...}; export default config;`.
- `astryx component <name>` suggests the right component when you type a wrapped or prefixed name.
- When `astryx component`, `astryx template`, or `astryx docs` finds nothing, its suggestions stop where the matches get weak instead of listing unrelated entries.
- `astryx upgrade` to 0.7 no longer turns your own MetadataList class into a `data-columns` selector that never matches.
- `astryx discover` lists the experimental MobilePowerSearch component from `@astryxdesign/lab`.
- `astryx theme build` reports a theme file that fails to load instead of guessing the theme from its text.
- `astryx theme build` fails with a clear error when your project's `@astryxdesign/core` can't load, instead of silently building with the CLI's own copy.
- `astryx upgrade` to 0.7 leaves other libraries' theme objects alone.
- A failed `astryx upgrade` now lists the files it already changed: its `--json` error includes a `receipt` with `modifiedFiles`, `errors`, `protectedFiles`, `complete: false`, and `errorCode`. The error code and exit code are unchanged.

#### Documentation

- The Tokenizer templates size their field to fit phone screens.
- The CodeBlock snippet example shows one-line commands with Copy beside them.
- Package links now point to the project's GitHub home, `meta/astryx`.
- TabList's description no longer promises a built-in "more" menu (a narrow tab strip scrolls), and the library page template describes `MobileNav` as the slide-out drawer it is.
- The theme guide and generated theme files explain that an extending theme's `motion` settings inherit field by field.
- The disabled Thumbnail template now describes its buttons correctly: they stay focusable and are announced as disabled.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ejhammond
- @imdreamrunner
- @josephfarina
- @kentonquatman
- @nbozidarevic
- @rubyycheung
- @vjeux

---

# 0.7.4

#### Experimental APIs

- Icon sets: an integration can ship an icon set, agents find icons by meaning and get the exact import line, and copied templates use the project's icons. Everything here is experimental and may change or be removed in a patch release; a project that does not set `experimental.iconSet` sees no change in any stable command, apart from: the marked `experimental` group in help and in `astryx manifest` (its command, and its `responseTypes` and `jsonSupported` entries); the marked experimental entries in the `astryx docs cli` listings; and a search for "experimental", which also finds the new stable `stability` field of the field reference. `astryx search` returns no icon and no experimental doc. With a package that ships icon sets installed and no opt-in, the warnings an older CLI gives about the manifest key `experimental` (in `astryx doctor` and `astryx doctor integration validate <package>`, and the one-line nudge other commands print to stderr) are gone, and `doctor integration` checks that package's icon sets only in a project that sets `experimental.iconSet`; and `astryx integration check` reports icon-set findings for a package that declares `experimental.iconSets` (below). (#7759)

#### New Features

- Keep Butter's released `butterPalettes` object byte-identical while moving the maintained Light/Dark theme to reviewed named palette stops. Signature Blue `#225BFF`, Butter Yellow `#FDEE8C`, and warm body surfaces remain exact; status fills move from success `#91D143` to `#7BBF7A`, warning `#FFC502` to `#DFCF5B`, error `#FC473B` to `#E56241`, and info `#4883FD` to `#4D82FF`. Info and error content changes from white to warm Neutral `#1D1C11`, the neutral Badge uses Blue `#194CE8`, and light TopNav items use Blue `#225BFF` / `#194CE8`; these palette-first pairs clear normal-text AA. Consumers that need the former appearance can extend `butterTheme` and override the affected color, syntax, shadow, and component values with their previous values. The CLI template ships the same private palette request, receipt, and runtime-sized references. (#7672)
- Docs can mark an experimental surface: every doc type except `ThemeDoc` and `IconSetDoc`, and every schema field and enum value, accepts `stability: 'experimental'`. A marked command shows `[experimental]` in help, a marked schema field or enum value is left out of its stable table so its feature's own docs describe it, and `astryx search` leaves out a marked doc, which is read on its own route. For the package being authored, `doctor integration validate` (and so `integration check`) adds `olderCliNotes`, each `{file, kind, field, message}`: a template or namespace doc that sets `stability`, or a template that declares `icons`, while the package's CLI peer range admits a release before 0.7.4, which drops that descriptor. A note is never an error or a warning and never fails a check, under `--strict` or `--next`; text output prints "Notes for older CLIs". Docs and findings that use none of these read exactly as before. (#7759)
- Docs can write commands so every reader sees their own: `{@command docs theme}` for an Astryx command, `{@pm install @acme/widgets --dev}` for a package-manager step, and `{@pm-only npm "<reason>" pkg set name=x}` for a step only one package manager can do. The CLI shows each one with the reader's runner and package manager (npm, pnpm, Yarn 1, Yarn 2 and newer, or Bun), and `{@@…}` shows a token as written. `astryx docs authoring/building-blocks/docs/doc-syntax` documents them. `doctor integration validate` lists each command a topic writes for one package manager (`package_manager_command`), bare (`plain_command`) or with a runner (`runner_command`), and each token that does not parse (`doc_token`), each with the token to write. (#7868)
  `integration check --next` counts the findings the next minor release turns into warnings, the notes marked `next`, as warnings now, so `--strict --next` fails on them. Every run says how many there are. Without `--next`, `integration check --strict` exits as before.
- An integration's doc can now replace or extend one of the CLI's guides by its route, such as `replaces: 'authoring/quick-start'` or `extends: 'authoring/quick-start'`, so a package changes the guide agents already read for every app that installs it. An extension's section can set `before` or `after` to a section's key to go there instead of at the end; an older CLI rejects those fields, so `integration verify` warns when the package's `@astryxdesign/cli` peer range admits one. Every read names the replacing or extending package: `package` on the guide and on each section, and a replaced topic or guide now also carries `replacedPackage` beside `replaces` (in `docs`, `docs --index`, the topic list, and a namespace's children), with a `replaces <package>'s <topic>` line in text. A name that holds no topic or guide (such as a namespace) changes nothing, and a `before` or `after` key that names no section adds the section at the end: `integration validate` lists each as a note (`doc_target_not_found`, `doc_section_unplaced`), and two docs of one package that replace one guide as `duplicate_guide_replacement`; none fails anything until the next minor release. (#7936)
- `astryx doctor --built <path>` checks a finished build before you deliver it: a project folder, a build output folder, or one built HTML file. `built-astryx-usage` fails when the path holds no import from an Astryx package (any `@astryxdesign/*` package, or an integration the project installs: a declared dependency whose installed copy has an integration manifest), no component imported from one, and no Astryx styles in built CSS or HTML, and names the template-first way to rebuild it. `built-astryx-purity` warns with the source check of `astryx docs is-my-code-good`: raw elements Astryx has a component for, raw SVG and icon-library icons, inline styles, classes, `stylex.create` and imported stylesheets, each with its file and line, or says the source was not inspected when the path holds no source with JSX, such as a bundle. The files under the path and that package.json are only read; nothing in them runs. Without `--built`, `astryx doctor` runs exactly as before. (#7886)
- Keep Gothic's released flat `gothicPalettes` compatibility export unchanged while moving the maintained dark theme to a reproducible generated palette and named stop mappings. The card changes from `#1A1D20` to `#191D20`; Gray background and border from `#3D4248` / `#5D646B` to `#3E454B` / `#5E676E`; syntax comment and punctuation from `#6B7079` / `#7A8290` to `#7E8791` / `#7E8791`; and diff backgrounds from `#081408` / `#1E0A0A` to `#071607` / `#220806`. Success, warning, and error inset rings move from `#87B06A50` / `#D6B56A50` / `#D4485150` to `#869B7250` / `#D3C49050` / `#C6A6A250`. Yellow text moves from `#6C5010` to `#573F0B`, and Pink text from `#71223C` to `#5C182F`; both darker named stops clear 4.5:1 on their categorical surfaces. Consumers that need the former appearance can extend `gothicTheme` and override these color, syntax, shadow, and component tokens with their previous values. The CLI template ships the same request, receipt, and runtime-sized references. (#7670)
- `doctor integration validate`, and so `integration check`, lists what a package's examples need to work everywhere they are shown, as notes for the next minor release (`integration check --strict --next` fails on them now): (#7891)
- Move Matcha's existing color roles onto its reviewed light and dark ramps, including Tea Gold. Warning and Yellow move from `#FFB600` / `#FFC940` to `#F2C000` / `#F6D066`; related syntax colors and warning inset rings follow the same palette. Consumers that need the former appearance can extend `matchaTheme` and override the affected color, syntax, shadow, and component tokens with their previous values. The complete Matcha palette remains private authoring data, and the CLI template ships the same request, receipt, and runtime-sized references. (#7671)
- `astryx theme palette generate` receipts now name the generator implementation (`generatorVersion: 'palette-generator-v1'`) and the format of the candidate bytes they hash (`candidateFormatVersion`: `'palette-typescript-v1'` for a `.ts` output, `'palette-json-v1'` for a `.json` output or a printed candidate). `candidateSha256` and every other receipt field keep their meaning, values, and order, so existing readers keep working. (#7678)
- Replace Stone's internal shared-ramp mapping with reviewed light and dark ramps while preserving the public numbered palette lookups and `hue`/`chroma` metadata. The light canvas moves from `#F3F3F5` to `#F0F0F7`, the dark popover from `#25252A` to `#302F36`, and Green, Yellow, Teal, and Cyan use re-seeded midtones (including Green `#667D65` to `#528B49`). Seven families' light stop-90 surfaces, syntax colors, and input status rims shift; the mapped success and warning rims use `#609757` and `#A08C36`, and syntax attribute uses `#736419`, keeping the required contrast floors. Existing apps can keep the former appearance by extending `stoneTheme` and overriding the affected color, syntax, shadow, and component tokens with their previous values. The CLI template ships the same reproducible request, receipt, and runtime-sized references. (#7669)
- When the project's installed CLI (its own, or its workspace's) has `astryx doctor --built` (0.7.4 and later), the agent docs `astryx init` writes tell agents to run it before they deliver a build, and not to deliver a build that fails it. Before install, or on an older CLI, the line is left out; the next `init` or `upgrade --apply` adds it. (#7944)
- Keep Y2K's released `y2kPalettes` object byte-identical while moving the maintained Light/Dark theme to reviewed named palette stops. Periwinkle `#CCCFFA` and Neon Green `#C5E17A` remain exact; syntax becomes brighter, the dark code background moves from `#190F00` to `#0E0F1A`, and dark Gray background moves from `#EDE0D4` to `#DFE2F3`. The necessary dark input and unchecked-selection outline moves from the released `#3A3F5E` to Neutral Dark 45 `#636889`, raising contrast on the input surface from 1.71:1 to 3.23:1. Consumers that need the former appearance can extend `y2kTheme` and override the affected color, syntax, shadow, and component values with their previous values. The CLI template ships the same private palette request, receipt, and runtime-sized references. (#7675)

#### Fixes

- `astryx doctor --built` no longer counts a type-only Astryx import (`import type`, `import {type X}`, `export type … from`) as Astryx use, since the build erases it. (#7945)
- Discover results name their source package and tolerate typos. (#7147)
  Every `discover` JSON result now names its package per the provenance rule: single-artifact responses (`discover.detail`, `discover.detail.doc`, `discover.item`) carry `package` in the envelope, and list entries (`discover.list`, and each entry of its `meta.available`) carry `package`. Text output matches: an opened doc prints its `package:` line on stdout.

  `discover <words>` now has the same typo tolerance as `search`: a near-miss name (edit distance 1–3, with minimum-length guards) returns results instead of "not found". Previously `discover Geodetics` said "not found" while `search Geodetics` found `geodesic`.

- `astryx search` finds a family member by its name spelled out, as its own description spells it ("vertical stack" is VStack), and lists a member named by its head word after single letters (VStack, HStack) for that word ("stack"). (#7927)
- `astryx search` lists the first three members a family's doc names for a query that is the family's name ("table" lists three Table parts after Table; "chat" lists Chat parts though no Chat component exists), for Core and integration families alike. (#7955)
- `astryx search` orders results the matcher scored the same by fit instead of by name: below the first result, a part of it leads (BadgeCountBadges after Badge), then the result matching the query's rarer words. Scores and the first result are unchanged. (#7959)
- `astryx integration verify` works on npm 8 for a scoped package: npm 8 names the tarball `@scope/name-1.0.0.tgz` in its pack output but writes `scope-name-1.0.0.tgz`, so verify reads the file npm wrote instead of failing to find it. (#7933)

#### Documentation

- Four block templates (`MetadataListItemBasic`, `SegmentedControlItemBasic`, `VisuallyHiddenSupplementaryContext`, `ItemWithMetadata`) now describe what each one shows and when to use it, written from what the block renders. (#7963)
- The `BottomSheetSwitcher` template docs (`BottomSheetSwitcherShowcase`, `BottomSheetSwitcherReviewFlow`) describe each step as its own native dialog under one scrim, as the component now renders, instead of "one shared dialog". (#7720)
- The `CommandPaletteItem` showcase block now describes what it renders, an inline command palette whose items pair each label with its keyboard shortcut, and lists only the components it uses. (#7967)
- Discover data: list the Lab ListInput blocks (the Tag options showcase and the Mailing list, Budget allocation, and Family member declaration examples) as templates. (#7953)
- Six guide titles read more plainly and use the same sentence case as the rest: Theme System is now Theming, Styling Components is Styling components, Browser Support is Browser support, Migration Guide is Migration, Styling Library Interop is Other styling libraries, and Looking up components is Component lookups. Only the titles changed: every route still opens the same doc (`astryx docs theme`, `astryx docs styling-libraries`, `astryx docs cli/component-lookups`), and searching by an old title still finds it. (#7934)

#### Other Changes

- **Commands.** The new `astryx experimental` group holds experimental commands; icon sets are its first. `astryx experimental icon <words>` ranks icons across the installed sets (`icon.search`), `<set>/<id>` reads one icon with every variant's import line (`icon.detail`), and `--list` lists each set with its definition coverage (`icon.list`). Authoring: `experimental icon new-set <name>` starts a set (`--from <module>` wraps every icon a library exports, `--exclude` drops exports that are not icons), `experimental icon new-definition <name>` adds a set's own icon definition, `experimental icon add <Export> --from <module>` verifies an export and lists the definitions that fit it or adds and maps it (`--variant <name>` adds it as a variant the set declares, a named look such as solid; size comes from CSS), `experimental icon map <definition> <icon>` edits one map entry, and `experimental icon use <set>` picks the project's set. The API gains `icon`, `iconAdd`, `iconMap`, `iconUse`, `iconNewSet`, and `iconNewDefinition`, all marked `@experimental`.
- **Configuration.** The project's set is `experimental.iconSet` in astryx.config; an integration declares its sets folder as `experimental.iconSets` in its manifest. Each set has a typed `<name>.doc.mjs` (`IconSetDoc`), a `<name>.icons.json` data file, and an optional `definitions/` folder; `@astryxdesign/cli/authoring` exports `IconSetDoc`, `IconSetData`, `IconDefinitionDoc`, and their parsers. An older CLI warns that `experimental` is a manifest key it does not know, and a CLI before 0.7.4 refuses an astryx.config that sets `experimental.iconSet` ("Unrecognized key"), so commands that load the project configuration, such as `doctor` and `discover`, fail in that project; `astryx experimental icon use` says so in its receipt (`warning`) when the project's `@astryxdesign/cli` range admits such a release.
- **Where icon sets show up.** Icon lookup by meaning is only `astryx experimental icon`: `astryx search` never returns icons or experimental docs, with or without a set. A project that sets `experimental.iconSet` also gets `astryx template` replacing each icon a template declares in its new `icons` field (a named import by the name it imports, a default import by its local name) with that set's icon, every key reported as mapped or kept in an `icons` receipt field, `astryx discover` reading `icon-set` as a kind (`--type icon-set`, and catalog entries of that kind), and an `icon-sets` check in `astryx doctor`. Without it, none of these change: templates are copied as they are, `--type icon-set` is an unknown type and catalog `icon-set` entries are ignored, and Doctor reports nothing about icon sets, even an invalid one. `astryx integration check` reports icon-set findings for a package that declares `experimental.iconSets`, and lists, in the validate result's additive `iconSets` field, the optional Astryx definitions each set leaves unmapped, with the icons that fit, and what it cannot judge (`unchecked`: an icon whose module is an `exports` target not built yet, an icon or adapter export it cannot prove either way, such as one behind a re-export it cannot follow or bound to a default import, and a theme map or entry it cannot read; only an export it proves absent fails), printed under "Not checked"; neither list is ever counted or fails a check, even under `--strict` or `--next`. It also notes each template `icons` key the template's source never imports (`template_icon_not_imported`), which fails nothing, under `--next` too.
- **Docs.** The guide and every icon definition live under `astryx docs cli/experimental`, and every icon-set doc is marked `stability: 'experimental'`. The experimental icon-definitions namespace adopts definition docs from every package (`source.packages: 'all'`, read only on a CLI namespace marked experimental).
- `component_without_example`: a published component that no block template shows with `exampleFor: '<Name>'` and `isShowcase: true` (or `alsoShowcaseFor`). A block named like a showcase that sets neither does not count. Hidden docs, family members, docs with `isHiddenFromOverview` and `Utility` components are exempt. The note carries a template doc to paste.
- `template_category`: a template `category` written as a path, such as `components/X`, with a `"<Group> - <Variant>"` one to write.
- `showcase_not_standalone`: a showcase (a block with `isShowcase: true` or `alsoShowcaseFor` names) that imports what a browser cannot load (`server-only`, `next/headers`, `next/server`, `next/cache`, a Node built-in) or reads `process.env` past `NODE_ENV`. Type-only imports and comments don't count, and live data through the app is fine.
- `template_asset_not_packed`: a file or folder a template loads with `new URL(…, import.meta.url)` that does not exist, sits outside the package, or that npm leaves out of the package: by `files` in package.json (the note names a `!` entry that excludes it), or by a `.npmignore` or `.gitignore` line (the note names the line). What `npm pack --dry-run` packs decides; when npm cannot answer, an asset it may pack is listed under `data.exampleAssets` as not checked.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ernestt
- @imdreamrunner
- @josephfarina
- @rubyycheung

---

# 0.7.3

#### New Features

- `astryx build` names the right block first far more often. It ranks every block in the catalog by what the request means, read from each block's own name, description, and component, so a block that word matching missed can still come first, with its own score and reason; and the block picker's fixed values are refitted on a larger, more varied set of written example requests, which helps most with requests worded in a product's own terms. A block the request names by its exact name, and a block from an integration, keep their place. The kit never lists more blocks than before, and its fields, page call, start template, and alternatives are unchanged.
- `astryx search` puts the entry you are after first more often: it orders the matches inside each score band, every result keeps its match score and reason, and a query that is an entry's exact name still answers with that entry first ([#7752](https://github.com/meta/astryx/pull/7752)).
- `astryx doctor integration validate` and `astryx integration check` check the component names a package's docs and blocks give, and list what they find as notes beside validate's issues, each with its fix. Nothing counts a note and `integration check --strict` does not fail on them; they become failing warnings in the next minor release:
  - `doc_name_mismatch` lists a component doc whose `name` is not the name the component is listed under when the module its printed import names (the doc's `import`, the published subpath, or the package root) provably does not export that name, so `astryx component` would print a broken import. The `Fix:` proposes the file name when that module exports it, otherwise the component it exports. A name that module's exports cannot prove or rule out (a re-export from another package, `export =`, a destructured binding, a namespace, an import that resolves to no file, or, when no import can be resolved, a source that only exports a default) is listed as not checked, with the reason, in validate's new `docNames` report.
  - `unknown_block_component` lists a name a template's `exampleFor` or `componentsUsed` gives that neither the package nor Core has (every doc `astryx component` resolves in Core counts) and the template does not import it. Imports the template's local helpers make count too, including through a barrel such as `parts/index.ts`. A name is judged only where the template reaches components solely through named imports and re-exports from Core, React, StyleX, local helpers read in full, or the package's own name (followed through its `exports` like a helper). Anything else is listed as not checked in validate's new `blockComponents` report: an import from another package, which may render other components; any `default` binding other than React's or StyleX's; a namespace import; an alias of or member read off an imported binding; a component held in a variable; `require()`; a dynamic `import()`; a file that does not parse cleanly; a local module this check cannot read; and, without Core installed, any name only Core could resolve.

  `integration check --strict` does not fail on anything listed as not checked.

- New `@astryxdesign/cli/host` entry for tools that carry the CLI: `runHostedCli` runs the CLI once per process, with the command name that tool's users type (printed commands start with it) and, when the tool skipped the project's own CLI, the reason, so that CLI is never run.

  ```js
  import {runHostedCli} from '@astryxdesign/cli/host';

  const result = await runHostedCli({
    argv: ['search', 'button'],
    cliCommand: 'acme astryx',
  });
  ```

- `astryx doctor integration validate` now notes, from source and without a build, what an integration package tells apps to import that they cannot import, the way it lists an ignored `cliCommand`. Each note is in `data.notes` and names its fix, such as the exact `exports` entry to add. Notes are listed only: neither `doctor integration validate` nor `astryx integration check --strict` counts or fails on them in 0.7.3, and they become failing warnings in the next minor release, so fix them now. It notes:
  - a component's import (the doc's `import`, or the one the CLI derives when the doc has none) or a template's public import whose subpath package.json `exports` does not declare, or that names another package. A subpath is not declared by a missing key, a key whose only conditions an ES module import does not load (such as `require` or `types`), an `exports` that is a single string, a wildcard that does not match, or an empty `exports` map;
  - a component example that imports a subpath the package does not declare;
  - a template that imports a relative path outside the templates root, or a path its own package or Core does not export.

  A subpath is judged from its `exports` declaration alone, never by its target file, so `exports` may point at build output that does not exist yet; whether that module exports the names an import asks for is the next entry's check. Wildcards and condition objects with `import` or `default` pass. An import of a subpath whose `exports` entry has only `types` targets, or that an ES module import reaches only through `types` (such as `types` beside `require`), is never judged as a run-time import: it passes when it is `import type`, when every binding is an inline `type`, or when every name it imports is one the `types` file declares as a type, and is listed under `unchecked` otherwise. A `types` target under `require` does not count, and a package with no `exports` keeps its deep paths to files it ships. What it cannot judge (in a package with no `exports`, a deep path into build output not built yet, such as `dist/`; a template import of Core when `@astryxdesign/core` is not installed beside the package; every import of the package's own name when package.json has no `name`) is listed under `unchecked` in a new `publicImports` report on the result (`{status: 'checked', findings: [], unchecked: [{file, specifier, reason}]}`), which `integration check` counts as not compared.

- `astryx doctor integration validate` now also notes, from source and without a build, an import that names something its module does not export (in `data.notes`, each with its fix). These notes are listed only in 0.7.3 too, and become failing warnings in the next minor release. It notes:
  - a component's import (the doc's `import`, or the one the CLI derives) that leads to a module that does not export the component, naming the subpath that does or the `exports` entry to add;
  - a component example or a template that imports a name the package does not export;
  - a template source with no default export (`astryx template` still copies it, but its public import and anything that renders it get nothing), suggesting an exported PascalCase function, class or `const`, never a hook such as `useAccount`, a helper such as `formatBalance`, an ALL-CAPS constant or a type; with none, the fix stays generic.

  A name is judged only when a file the `exports` entry names is there to read in full. `export *` is followed, cycles included; a built module's declaration file (`x.d.ts` beside `x.js`, and the `.d.ts` files its `export *` names) is read for the types it exports; `export import Alias = Inner.Value` counts as an export; TypeScript source resolves a `./x.js` specifier to `./x.ts`; and a declaration file that is a module exports every top-level declaration unless it has an export list, `export *`, `export =` or a default export of an expression, as TypeScript does. Whatever the reader does not fully model is listed under `unchecked` in the `publicImports` report instead of as a note: a file the `exports` entry names that does not exist yet; a module whose list cannot be read in full (CommonJS, `export *` from another package); a declaration file with no import or export (a global script); a name missing from a JavaScript module with no declaration file, which may be a type; and every name it would report, other than a component doc's own component, while a TypeScript file in the package (outside `node_modules`) has a parsed `declare module` block for a relative path, the package's own name or a subpath of it, since that can add names to the module. The reason names that file; `declare global`, a wildcard spec such as `'*.css'`, another package's name and a `declare module` in a comment do not count, and a file with `declare module` in its text that cannot be parsed counts. `astryx docs authoring/ship/checks` explains each check.

- A failed `astryx component`, `template` or `docs` lookup lists the entry you most likely meant first. Components that tie on match score are ordered by how early the name you typed appears in their keywords and by how close their names are, instead of alphabetically; among the suggestions offered, a component one of whose other names was typed (including another library's name for it, such as `MUI TextField`, with or without the library's name) comes first; a compound name that does not exist (a family part named with other words, or without one of its family's words) suggests the real part or its family. Templates are ordered by how closely their id or title matches the name you typed, and unknown docs routes by how closely the route matches. Suggestion lists never get longer, every suggestion is a real entry, and a name that resolved before still resolves to the same entry.
- Integration docs that tell readers to run an Astryx command through a package runner now get a `runner_command` note from `doctor integration validate` (and so `integration check`) in `data.notes`, with its file, line and the bare `astryx <command>` to write instead. A note fails nothing, so `integration check --strict` exits as before. The unscoped name after a download runner (`npx astryx`) always counts, because it fetches an unrelated package; the scoped `npx @astryxdesign/cli`, for install steps, does not.

#### Fixes

- `astryx build` starts from a page template its word weights do not list (an integration's template, or one added since the weights were fit) only when the request names as many words of that template's own display name, category and keywords (search's stopwords aside) as of the best listed template, or names that template's family (the first part of its category) before the listed template's family and at most two fewer of its words; otherwise it starts from that listed template and offers the other as the first alternative.
- The CLI finds the project's `@astryxdesign/core` from any folder inside the project, so `component`, `hook`, `build`, `search`, `swizzle`, `theme targets` and `doctor` now work five or more folders deep, in workspace members whose Core the workspace installs at its root, and in Yarn Plug'n'Play projects. They still search the folders they searched before, and past them continue up to the workspace root of the nearest folder whose package.json declares an Astryx package.
  - `upgrade --from` run from any folder in a project upgrades that project: the nearest folder whose package.json declares an Astryx package or that an Astryx workspace lists, found without passing a repository root or counting the home folder. It targets only the project's own Core (the one in its `node_modules`, or for a member its workspace lists, the one the workspace installs), scans the project's `src` by default, reads a `--path` you type from the folder you ran in, names the files in its `--json` result relative to that folder, refreshes the project's agent docs, and names the project root and the source folder it scans before it changes anything. With no such project, `upgrade` reads only the current folder, as before.
  - An `upgrade` run in a folder that installs Core but declares no Astryx package now upgrades the Astryx project above it instead of that folder alone, since such a folder was never a separate upgrade root. To keep a sub-folder that installs Core its own project, declare an Astryx package in that folder's package.json.
  - A `packages/core` folder that holds another package is no longer read as Core, and an integration named in `astryx.config` now loads when the workspace installs it at its root, as an autolinked one already did.
- The CLI's install advice no longer adds a package to a `package.json` that is not an Astryx project's. This covers the daily hint, the setup reminder, the update notice, `astryx doctor`'s version-alignment and integration fixes, and `astryx discover`'s install command for an integration installed for the computer. The project is the nearest folder whose `package.json` declares an Astryx package, or a member its workspace lists, never the home folder and never past a repository root.
  - From a folder inside such a project whose own `package.json` is not the project's, such as a tool folder that installs its own `@astryxdesign/core`, the daily hint that matches a project's CLI to its Core, the setup reminder and `astryx doctor`'s version-alignment fix used to name a command that added the CLI to that folder's `package.json`, making it a separate Astryx project. They still compare the CLI with the Core the run reads, and when the two differ they say to run from the project's folder, or to declare an Astryx package in that folder; the update notice upgrades the project from its folder, with the project's release.
  - For an integration installed for the computer, `astryx discover` gives no install command from such a folder, and `astryx doctor`'s fix says to run from the project's folder, where the command adds it for the project; in a folder that belongs to no project, neither names a command.
  - In a folder that belongs to no Astryx project, the hint, the setup reminder and the update notice no longer print, and `astryx doctor`'s fix says how to reach a project.
  - Unchanged: the official packages `astryx discover` lists and the theme packages `astryx doctor` suggests still use the folder the command runs in; a member its workspace lists keeps its own advice; in a folder whose `package.json` declares an Astryx package, the advice is the same. No JSON shape or exit code changes.
- `astryx doctor integration validate`, `astryx integration check` and `astryx integration verify` catch more package mistakes, and each new finding ends in a `Fix:` that clears it. Findings that 0.7.2 did not fail on are listed as notes beside validate's issues, which nothing counts, until the next minor:
  - Two docs for one component (`AcmeWidget.doc.mjs` and `AcmeWidget.doc.js`) are listed as `duplicate_component_doc`, naming the one read; discovery now always reads the same one.
  - A component doc whose file name differs from its source only in letter case is one finding that says which file to rename: an error where the pair fails (Linux), a listed `source_without_component_doc` where it still pairs (a case-insensitive disk); a hidden doc that does not pair keeps the source warning it had.
  - A root reached through a symlinked folder is listed as `symlinked_root`: npm pack does not follow it.
  - An absolute root says roots are relative and gives the relative path; a root that is a file is reported by every check instead of crashing it.
  - A package.json without `name` or `version` is listed with a fix, instead of a crash; `verify` fails on it. A package whose `name` and manifest `providerId` give no provider ID is listed as `no_provider_id`.
  - A contribution file Astryx cannot read is listed as `unreadable_file`, before npm pack fails on it.

  `astryx integration check --strict` does not fail on these pairing, root and package.json notes either; they become failures in the next minor. `astryx integration verify` still fails on a package.json npm cannot pack.

- `astryx doctor integration validate`, `astryx integration check` and `astryx integration verify` say more plainly what is wrong in findings they already reported, and how to fix it:
  - An empty doc or manifest, or one with no default export, says so and names what it does export, instead of "(root): Invalid input".
  - A manifest key one or two letters off a known key asks "did you mean `components`?" before suggesting a newer CLI.
  - A theme descriptor named for the built file (`ocean.doc.mjs` beside a built `ocean.js` that lacks the `ocean` export) says it must share its stem with the `defineTheme` source, naming that source when the built module's `Source:` line or the source's `defineTheme` name confirms it.
  - A template doc with no source, a theme descriptor with no source, a theme source with no descriptor, and a component whose source is `.jsx` get a `Fix:`.
  - A theme source named for its theme (`brand.ts`) beside the module the build writes (`brand.js`) is told to take the `brandTheme` stem.
  - `verify` names packed files by their path in the package, not the scratch copy's; says npm pack does not follow a symlinked root instead of asking for a `files` entry; and, when a theme's `defineTheme` name differs from the files its package exports, says a rebuild writes files under the new name.
- Integration authors now learn when the running CLI is outside their package's `@astryxdesign/cli` peer range: `astryx doctor integration validate` and `astryx integration check` list a `cli_peer_version` note naming the package, the range and the running version. Below the range the note gives the project's commands to install a newer `@astryxdesign/core` and `@astryxdesign/cli` together (as dev dependencies in the package's own folder) and then run `astryx upgrade --from <version> --apply`. Above the range it asks for a release of an installed package that supports this CLI, or asks the author of the package in the current folder to test with this CLI and widen the range. A note fails nothing: `--strict`, `integration verify`, `doctor`, and exit codes are unchanged.
- `astryx component <Member> --package @astryxdesign/core` now answers with that member, as the unscoped lookup does. A Core component documented in its family's doc (HStack and VStack in the Stack doc) used to come back as the family doc, named after the family and with no props.
- The agent guide that global mode writes to the home folder now tells agents to deliver a page built with Astryx, not only how to find things. Before, agents that found the right template could still build the page with a tool that cannot install packages and deliver a page with no Astryx in it. The guide now tells agents to work in a project folder (creating one if there is none); add `@astryxdesign/core` and `@astryxdesign/cli` to a new project or one without Core, or, in a project that already has `@astryxdesign/core`, the CLI at the same version; run `astryx init` there; follow the same template-first workflow and self-check the project agent docs give; and end by building the project and delivering that build. The guide stays version-free and names only commands every release keeps. The project agent docs are unchanged, and so is what `@astryxdesign/core`'s install script prints: its copy of the shared agent-docs file only gains the same workflow lines.
- Agents that follow the guide global mode writes to the home folder now know what to do when `astryx` is not found: run the command that installed the CLI for the computer first, with the same package manager and folder, such as `npm i -g @astryxdesign/cli` or `pnpm add -g @astryxdesign/cli`. On machines that keep the home folder but reset system folders on restart, the guide outlived the CLI installed for the computer and told agents to run a command that was gone. Outside a project, when the guide names `astryx` and no `astryx` command is on the search path, apart from a package runner's own copy, `astryx doctor` now says so and names the install step the guide records, or npm's when it records none. The global-mode guide for CI and containers explains how to keep the CLI across restarts. A guide written for a host's own command is unchanged. No JSON shape or exit code changes.
- The butter, stone, and y2k themes no longer show the secondary hover fill on a disabled `ComplexSelector` trigger, whether the trigger is natively disabled or exposes `aria-disabled="true"`, the focusable form every disabled control now uses. Before, the guard only recognized a natively disabled trigger. The themes `astryx theme eject` copies carry the same guard.
- Apps that use Core's prebuilt CSS without a StyleX build step now get the default data colors: the prebuilt CSS defines the canonical `dataVars` defaults, so compiled imports and raw CSS references paint correctly.
- `astryx init` writes the agent docs at the project root, in files the project commits, so Codex, Gemini CLI, Copilot CLI and Claude Code all read the block from the project root or any folder below it ([#7497](https://github.com/meta/astryx/pull/7497)). It no longer writes agent docs into a project's subfolder, the home folder, or a settings folder in it such as `~/.gemini`.
  - `AGENTS.md` holds the block, created when missing. Before, a project with only `CLAUDE.md` got the block only there, so Codex and Gemini CLI never saw it.
  - Claude Code skips `AGENTS.md` in a folder that has a `CLAUDE.md` or `.claude/CLAUDE.md`, so the Claude Code file the project already has keeps a full copy: root `CLAUDE.md`, else `.claude/CLAUDE.md`. It keeps the copy even when it imports `AGENTS.md`, because Claude Code does not follow that import in a session started in a subfolder; started at the root, Claude Code then reads two. When both exist, the copy goes in root `CLAUDE.md`, which projects commit even when they ignore `.claude/`, and a block in `.claude/CLAUDE.md` is removed. Init creates no Claude file. `astryx upgrade` refreshes every copy, except in a project at the top of a home settings folder (see the next entry).
  - Gemini CLI reads only `GEMINI.md`: init adds a one-line import, `@./AGENTS.md`, creating `GEMINI.md` when it is missing. It adds none when `GEMINI.md` already imports `AGENTS.md`, inline or on its own line. It adds the import even when the project's `.gemini/settings.json` has Gemini read `AGENTS.md` through `context.fileName`: Gemini loads those settings only when it starts at the project root, so a session started in a subfolder would otherwise get no copy. Started at the root, Gemini then reads two.
  - The project root is the nearest folder at or above where init runs whose `package.json` declares an `@astryxdesign` package, else the nearest with any `package.json`. The search stops at a repository root and never counts the home folder. With no `package.json` found, init writes where it runs, as before. `docsWritten` still lists each file relative to where init ran, for example `../../AGENTS.md`.
  - A `GEMINI.md` that resolves outside the project, for example a link to a shared file, is skipped and reported in `docsError` with one note (not an error line), in the default layout and in a project's own layout; the rest is written and init exits 0.
  - The managed block belongs to Astryx: init and `astryx upgrade` write, refresh, and remove only the block, whatever ignore rules or generated markers say, as 0.7.1 did, and never change the text around it. Every write stays inside the project: run in the folder 0.7.1 wrote, an agent file 0.7.1 wrote there whose path leaves the project still refuses the run with exit 1. The project's Claude Code file (root `CLAUDE.md`, or `.claude/CLAUDE.md` when there is no root one) that resolves outside the project and is a block-less import of an existing `AGENTS.md`, which 0.7.1 left alone, is skipped and reported in `docsError` with one note, and init exits 0. Run from a folder below the project root, where 0.7.1 wrote in that folder instead, a project-root file whose path leaves the project is skipped and reported in `docsError` with one note, the rest is written, and init exits 0.
  - While root `CLAUDE.md` is untracked and ignored by the repository's ignore rules (any ignore file from the repository root down, such as a monorepo's root `.gitignore`, the local exclude file, or configured excludes; init asks git, Sapling or Mercurial), a `.claude/CLAUDE.md` the project commits gets the copy too, so a fresh clone still gives Claude Code a copy; `--agent claude` and `--agent all` write it there as well. A file the repository tracks counts as committed whatever the ignore rules say, as git and Mercurial ignore only untracked files, and when the repository cannot answer, the copy is kept, on the first run as on later ones. Such a copy that resolves outside the project refuses the run with exit 1 where 0.7.1 wrote it too; one 0.7.1 did not write (the one `--agent claude` adds, or a block-less import of an existing `AGENTS.md`) is skipped and reported in `docsError` with one note, and init exits 0. So is a `.claude/CLAUDE.md` whose block `--agent claude` would remove beside a `CLAUDE.md`, since 0.7.1's `claude` preset wrote only `CLAUDE.md` there. Beside a committed root `CLAUDE.md`, with `.claude` linked outside the project, three cases that 0.7.1 refused now exit 0 with nothing written: the default with a `.claude/CLAUDE.md` of plain text, and `--agent all` with one of plain text or a block-less import of `AGENTS.md`; root `CLAUDE.md` holds the copy, so no write leaves the project. In a project that keeps its own layout, a `GEMINI.md` that imports no agent file now gets a copy, as the other agent files do.
  - The copy in `.claude/CLAUDE.md` is removed only once root `CLAUDE.md` holds the same block, and only the managed block between its markers: the rest of the file stays, and the file is deleted only when nothing but whitespace is left. `astryx init --remove-agents` deletes a file it created only when nothing but whitespace or init's own heading is left; 0.7.0 also deleted a file whose remaining text had a heading and any line with the word "guidance".
  - `astryx init --remove-agents` removes the block at the project root, where `init` writes it, and in the folder it runs in. Run from a subfolder, it removes what `init` wrote at the root, and a block an earlier version left in that subfolder; a root agent file with a block that resolves outside the project is left as it is with a note, and the run exits 0, as 0.7.1 did when it touched only the subfolder. Exit codes and the JSON shape are unchanged.
  - `--agent claude` and `--agent all` never leave a block in both `CLAUDE.md` and `.claude/CLAUDE.md`, unless the project ignores `CLAUDE.md`: when `CLAUDE.md` gets the block, a block in `.claude/CLAUDE.md` is removed. `--agent all` keeps the `GEMINI.md` import. The `--agent` help and the working-with-AI guide say so. `--agent-docs-path` writes where init runs, as before.
  - `astryx doctor` fails when the `GEMINI.md` import points at an `AGENTS.md` with no block. The setup check in the CLI and in `@astryxdesign/core` no longer counts that import as set up, and looks at `GEMINI.md`. The reminder to run `init` that commands print looks at the project root too, so it stops once `init` has run in a nested package.
- `astryx init` and `astryx upgrade` no longer write agent docs into your home folder, or into a settings folder in it such as `~/.gemini` or `~/.claude` outside a project. Agents read the files in those folders in every project, so a block there reached unrelated work. This follows the CLI's existing rules that no command writes agent docs into those folders and that a write outside a command's own folder is refused before anything is written.
  - **Refused by `init`:** the home folder itself, and the top of any folder in it whose name starts with a dot (every such folder is a settings folder), even when it holds a `package.json`. A folder below it with its own `package.json` is a project and is set up normally, such as an agent worktree in `~/.codex/worktrees/` or `~/.cursor/worktrees/`, and `astryx upgrade` refreshes it. With `--agent-docs-path`, each file's own folder is checked: from the home folder, `notes/AI.md` is written as before, while `AI.md` or `.claude/CLAUDE.md` is refused.
  - **What `init` does instead:** it writes no agent docs, reports `docsError` as `install-failed` with the reason, and exits 0, as before.
  - **Refused by `upgrade`:** refreshing a block in a project whose root is the home folder or the top of a settings folder, such as `~/.dotfiles` with a `package.json`, with or without `--apply`. It leaves the block as it is, sets `agentDocs.action` to `error` (never `would-refresh`), and warns with the folder and why; its other steps and its exit status are as before. With no block there, it gives the same reason instead of suggesting `astryx init`. `astryx doctor`'s agent-docs fix does the same, and the setup reminder after each command stays quiet.
  - **Migration:** run `astryx init` from the project's own folder, or add the block to the file by hand. Move a project rooted at the home folder or a settings folder into a folder of its own, or update or remove its block by hand. To remove a block an earlier version wrote into `~/.claude/CLAUDE.md`, run `astryx init --remove-agents` in the home folder.
- Repeated searches in one process answer faster: `astryx search` reuses its entry index while the catalog is unchanged, and ties that reuse to one list of the fields the index reads, so the index is never reused after any of them changes. Every answer is unchanged.
- Tools that bundle the CLI into a server function no longer pack their whole project folder into it: one path in `integration check`'s import checks was built in a way file tracers cannot follow. The path and its results are unchanged.
- `search()` from `@astryxdesign/cli/api` answers faster when one process searches again: it reuses the components, docs, templates and themes it gathered for the same folder and `type` while no file it read, and no folder it listed, has changed since (a linked workspace package included). To see those reads, the first such search in a process wraps `node:fs`'s read functions for that process; outside a search they behave exactly as before. Results are unchanged. Short-lived runs are unaffected: each `astryx search` command gathers once, as before ([#7830](https://github.com/meta/astryx/pull/7830)).
- `astryx search` and `astryx build` find a block by its authored display name when that name has two words or more and holds every word of the component the block shows: a query naming it, such as "rich text editor" for an integration's Rich Text Editor block, ranks it first. A display name that labels only the variant, such as "Inside a card", is not read.

#### Documentation

- `astryx docs cli/commands/postinstall` now documents the hidden `postinstall` hook, `astryx docs cli/commands` lists it, and `astryx postinstall --help` shows its exit code and an example. The summary of `astryx docs cli/commands/manifest` (text and `--json`) drops its final period, so it matches the description the manifest has always printed. What each command prints when it runs, its JSON and its exit codes are unchanged.
- Everything an integration author reads now lives under one home, `astryx docs authoring`: the integration guides' routes moved from `cli/integrations/…` to `authoring/…` (for example, `cli/integrations/quick-start` is now `authoring/quick-start`), beside the field reference at `astryx docs authoring/field-reference`. `astryx docs authoring <name>` still opens one field reference section, and an old `cli/integrations/…` route's error names its new route. The loose topics now sit in Guides or Foundations instead of Unorganized, under the same names: `astryx docs getting-started` still opens, and its Up is `astryx docs guides`.
- A new guide, `astryx docs is-my-code-good`, checks component use, icons, custom styles, layout, assets, and code health from source and rendered evidence, in one page you can share. It includes an agent prompt and requires missing evidence to stay visible. The template grading rubric now links each category to these shared criteria instead of repeating them, and keeps its own weights, counting rules, and version 1.4.
- Questions like "add an integration" or "install a package" now find a guide for app builders first.
  Added a "Use integrations" guide (`use-integrations.doc.mjs`) that covers discovering, installing, and using integration packages in an app; open it with `astryx docs use-integrations`. Search ranks it above authoring and API-function docs for those questions, while queries like "build an integration" still rank authoring content first.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ejhammond
- @josephfarina

---

# 0.7.2

#### New Components

- Promote `Drawer` and `DrawerHeader` from the canary-only Lab package to Core, imported from `@astryxdesign/core/Drawer` or the package root. The stable package now ships the full-height side panel with modal and non-modal presentation, the shared dismissal stack, Dialog's `purpose` dismissal policy, a `DrawerHeader` whose close button appears when given `onOpenChange`, and Dialog-style container padding (`--spacing-4` by default, `padding` prop, or a theme's `drawer` padding), plus Core documentation and runnable examples. Canary users importing from `@astryxdesign/lab` switch to `@astryxdesign/core/Drawer`.

#### New Features

- An integration component doc can name a differently named export of the file beside it: when `Slides.tsx` exports `AcmeCarousel` and nothing named `Slides`, `Slides.doc.mjs` can set `name: 'AcmeCarousel'`, and a kebab-case `acme-widget.doc.mjs` can name `AcmeWidget`. `component --list`, `component <Name>`, `search`, `swizzle`, the `doctor integration` checks and `integration verify` know the component by that name, and its file name still opens it. A name that Core or another doc's file already has stays theirs on every surface unless `--package` names the integration. Docs and sources are read without running them; a doc named after its file, or beside a file that exports its own name, reads exactly as before.
- Each full entry an integration's family doc lists in `components`, such as `AcmeSlide` in an `AcmeCarousel` doc, is a component under its own name when the module the doc's `import` names exports it. Its source is the `.tsx` file in the family's folder that declares it; a member that only built output or a file outside that folder declares has no source to show or copy. `component --list`, `component <Name>`, `search`, `swizzle`, the `doctor integration` checks, `integration verify` and `integration add` know these members. A member's detail is scoped to its own entry, as a Core sub-component's is, and it never carries the family's `replaces`. A member named like a Core component or another doc's file opens with `--package`.
- The CLI installed for the computer keeps one short Astryx skill for every agent on the computer: `~/.agents/skills/astryx/SKILL.md`, which most coding agents read, linked into the skill folder of each agent that reads only its own (`~/.claude/skills` always; Kiro, Windsurf, Letta, Xcode's coding assistant, and `~/.config/agents/skills` when that folder exists) with a folder link and a relative target, a junction on Windows, or a copy where no link can be made. Continue, whose scanner skips links, gets a managed copy. The text tells agents that Astryx is on the computer, when it is relevant (building or changing UI), to start with `astryx search`, and to read docs with `astryx docs`; it names no version and only commands every release keeps. It is written on the global copy's first run and after each upgrade, in the background; package install scripts never write it. `astryx init --user` writes it now, in any folder, and `astryx init --user --remove-agents` removes the file, every link Astryx made, and the copy, and turns it off. The setting and the links Astryx made are kept in `astryx/settings.json` in the per-user configuration folder. The file records a hash of its text, so a file a person edited is never overwritten or removed, and nothing Astryx did not create at a link folder is replaced. `init --user` warns, while still writing, when no `astryx` command on the computer runs the Astryx CLI, and its `init.user` receipt lists each path and what happened to it. Outside a project, `astryx doctor` adds a `computer-agent-text` check (info only) that says whether the text is present, current, edited, or turned off, where it is linked, and any link folder it skipped or whose skill folder is missing. A cache or configuration folder set through `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, `LOCALAPPDATA`, or `APPDATA` is used only when it is an absolute path.
- Integrations installed for the computer. An integration package installed in the same place as the CLI installed for the computer (`npm i -g`, `pnpm add -g`, `yarn global add`, or `bun add -g` beside `@astryxdesign/cli`), or installed with the CLI in one package set by a tool that runs it, is a computer-level integration. Outside a project, it loads the way a project's integrations do: its components, templates, docs, themes, discover source, and `cliCommand` apply, with the same validation, and one whose `@astryxdesign/core` or `@astryxdesign/cli` peer range excludes the CLI's release is skipped. pnpm 11 and later, which give each global package a folder of its own, count every one of those folders. Inside a project, only the project's own integrations load: a computer-level one adds nothing there, and `astryx discover` lists it under `meta.available` with source `installed for this computer` and the project's install command in `install`, when its peer range admits the project's release and it loads. A project that installs the same integration uses only its own copy. `astryx doctor` adds a `computer-integrations` check: outside a project, each one it uses, each the folder replaces with its own copy, and a warning for each it skips or cannot load; inside one, the ones the project could add.
- `astryx gap-report --to <package>` sends a report to the issues URL of the loaded integration the person chose, under the same `--confirm-public` rule, instead of the default handlers. When loaded integrations name their own issues URLs, `--list-categories` and the receipt list every destination and tell the agent to ask the person where to file. The default route is unchanged.
- Install the CLI once for your computer (`npm i -g @astryxdesign/cli`) and run `astryx` in any folder. In a project, the project's own CLI answers, whatever its version, as before: a copy started anywhere else (the global install, `npx`, a typed version) hands the run to it. A project with no CLI of its own (only `@astryxdesign/core`, or a fresh clone) is answered by the copy you started, as before; when that copy is not the Core's release, one hint after the command, at most once a day per project, names the command that adds the CLI at Core's version, and JSON reports `meta.answeredBy.copy: "starting"`. Only a project whose own CLI cannot start is answered by the CLI release equal to its Core, installed once into a per-user cache (from the installed Core, else the lockfile, else the declared range). `astryx doctor` warns when a project's CLI and Core are different releases, or when a project has no CLI and the copy that answered differs from its Core, and prints the command that aligns them. `astryx --help` and the manifest's new `globalMode` field point to `astryx docs global`. The hand-off keeps the arguments, folder, standard streams, and exit status. Outside a project, the copy installed for your computer answers with its own release; commands that read Core use the Core of that release there: the global copy downloads it into the cache in a background step it starts as a run ends (never in CI, and not on Windows, where a background process would hold the caller's pipes and the first component command downloads it instead), so component reads work offline after one online run. Nothing that worked before breaks: when that release cannot be obtained (offline, a registry without it, an unwritable cache), the copy you started answers, as before global mode, with one warning line on standard error (`astryx: could not get Astryx <version> to match this project's Core (<reason>); answering with CLI <version> instead`) and `meta.answeredBy.copy: "fallback"` in JSON. A copy counts as installed for the computer only in npm's global folder or in a global folder a package manager's own settings name (Bun's `BUN_INSTALL` or `globalDir`, Yarn's `global-folder`, pnpm's `PNPM_HOME` or `global-dir`, or their defaults), never by a folder's layout alone, so an app made with `yarn add` is never mistaken for one; a moved Bun or Yarn global folder counts, and its notice reinstalls there. A failed install is remembered in the cache, so offline runs do not start npm again each time: it is retried after 2 minutes, then after 10 once it fails again, and a success forgets it. A stale install lock ends the process it records only when that process is exactly this CLI's install of that release (npm, or node running npm-cli.js, installing `@astryxdesign/cli@<version>`, started after the lock); otherwise the lock is simply taken over. The new `ERR_VERSIONS_UNAVAILABLE` is kept for runs nothing can answer, such as a command that needs Core outside a project that cannot install it. The CLI starts npm from npm's own entry file with the running Node, never through a shell, and reads a project's declared Core range only when it is a plain version range.
  Every successful `--json` result now carries `meta.answeredBy` (`cli`, `core`, `copy`: `project`, `starting`, `matched`, `carried`, or `fallback`), typed in `CLIResponse` and described in the output envelope docs. In text mode, a run answered by anything other than the project's own CLI prints one `astryx: answered by …` line on standard error. Printed commands start with a name that reaches the same release: the project's runner when its own CLI answers, `astryx` outside a project for the copy installed for the computer, and otherwise the CLI package pinned to the answering version (`npx @astryxdesign/cli@0.7.2`). The new `ERR_PROJECT_REQUIRED` code names a command that needs a project. See `astryx docs global/install-once`.
- `astryx doctor integration` and `astryx integration check` catch more doc mistakes, and stop flagging one pattern Core itself uses.
- An integration can set the command its users run the CLI with: a new `cliCommand` field in `astryx.integration.*`, such as `cliCommand: 'acme astryx'`. In a project that loads that integration, every command the CLI prints starts with it instead of the package-manager prefix (`npx astryx`, `pnpm exec astryx`): next-step hints, errors, suggestions, Doctor fixes, `--help`, the setup reminder, the agent-docs block, and doc text. If two loaded integrations set different commands, neither is used, and the new `cli-command` check in `astryx doctor` warns. An invalid `cliCommand` is ignored with an `invalid_cli_command` warning; the rest of the manifest still loads.
  Docs, including an integration's, are now written with bare `astryx ...` commands, and `astryx docs` prefixes them for the project when it prints them. JSON output keeps every command bare, as before. The install-time setup reminder from `@astryxdesign/core` and `@astryxdesign/cli` names the command the project's package manager runs, instead of always `npx @astryxdesign/cli`.
- The integration manifest accepts an optional `docsiteUrl`, a link to the integration's docs site, as a known field, so setting it no longer raises an unknown-key warning.
- Update notices, the way `gh` and the Vercel CLI do them. Once a day, never in the first day after its first run, the CLI installed for the computer checks the registry's `latest` release in the background without delaying the command; it never installs a release by itself. When a newer release exists, a command that finishes successfully prints two lines on standard error, at most once a day: `A new release of Astryx is available: <current> → <newest>` and `To upgrade, run: <command>`, with the command of the package manager that installed the CLI (`npm i -g`, `pnpm add -g`, `yarn global add`, `bun add -g`, or `volta install`), after the Node the release needs when the computer runs an older one. Inside a project the notice names the project's install and `upgrade` commands instead, and an `astryx` first on the search path from before the hand-off gets a notice naming its upgrade. No notice prints with `--json`, after a failed command, or when `CI` or `NO_UPDATE_NOTIFIER` is set, and neither variable lets the check run; unlike `gh`, a notice prints when standard error is not a terminal, because agents run the CLI without one. What the check found lives in `astryx/state.json` in the per-user configuration folder. `astryx doctor` reports the same: the `newest-release` check names the upgrade commands, and a new `cli-on-path` check lists every `astryx` command on the search path.
- A `{@link <target>}` in a component doc's text now reads as the command that opens its doc, in `astryx component <Name>`, its `--props` view, and component lists, in text and JSON: the description, usage, best practices, anatomy and accessibility notes, and each prop's and example's description. A topic's description reads the same way in `astryx docs`, its list, and the docs tree. Code fields and code ticks show the link as written. A Core component's links resolve against the CLI's docs; an integration's against its own. `astryx doctor integration components` warns on a link in an integration's component docs that names no doc, and `doctor integration docs` does the same for a topic's description. The written-pointer warning also reads component docs and topic descriptions, and each finding now names its `kind` and `field`.
- Component prop docs accept `stability: 'experimental'`, the machine-readable marker for a prop outside the stable compatibility promise, such as a component's `experimental` prop object.
- `doctor integration docs` (and so `integration check`) lists each pair of topics that repeat 10 or more words of prose word for word: two of the package's own topics, or one of them and a Core topic other than the one it replaces. Each entry names the topic that keeps the text (a Core topic, or of two package topics the one the passage fits), the line to change in the other, and the exact link to put there, and is in the new `copiedPassages` field. A run with fewer than 4 distinct content words (words other than function words such as "the", "in" or "it"), or one that three or more topics share, is not listed. Each pair is also a `copied_passage` warning, so `integration check --strict` (new in this release) fails until it is fixed; `doctor integration docs` still exits 0.
  The CLI's own guides no longer repeat 18 passages that another guide owns; each copy is now a link to the guide that owns the fact.
- `astryx discover` lists the official Astryx packages, first, from a list each CLI release carries, so a project with no discover source sees the official themes, even offline. Each entry in `meta.available` carries the command that adds it (`install`), so a project that loads no integration and has no discover source of its own, where every query still answers with the list, can add a package straight from it. An official entry's `latest` is the newest release the CLI knows (its own version on a release CLI, or a newer Core release the project has), and its `versions` also list the project's Core version, so both can be looked up. Its add command pins the project's Core version (installed, or declared exactly), else the Core range the project declares (quoted), else the latest release; on a canary CLI with no Core it pins none for packages released with Core, and canary-only packages are listed only beside a canary Core or no Core. Official entries name `Astryx` as their `source`, and `meta.sources` reports the list last. A project's or an integration's source keeps its entry for an official package, and for any package of the same integration. A theme package that the project's own package.json declares as a dependency, under an npm alias too, shows as installed from any folder of the project, and a theme's add text ends with `astryx theme add <slug>`. A version or item that the official list does not show still answers `ERR_UNKNOWN_PACKAGE`, as before.
- `doctor integration docs` (and so `integration check`) lists fluff in a package's prose, in the new `fluff` field: each padding phrase such as "in order to", "note that", or "it is worth noting", with its file line and what to write instead, and each topic of 80 or more prose words in which fewer than half the words carry content. Each is also a `doc_fluff` warning, so `integration check --strict` (new in this release) fails until it is cut; `doctor integration docs` still exits 0. The phrase list and the floor are in the check-your-docs guide (`astryx docs cli/integrations/building-blocks/docs/check-your-docs`). Core's `browser-support` guide loses its one padding phrase, and three of Core's guides (`debug-and-gap-reports`, `sections-and-placement`, `publishing`) are tightened to meet the density floor.
- `astryx doctor integration validate` now checks every doc an integration ships under its roots (components, templates, docs topics, themes, and their translations, served or not) against the published authoring type for its kind, with the project's own TypeScript, the way `tsc` would. Each unknown field, missing required field, or value outside its field's type is a warning that names the doc, the line, the field, and a fix; the exit code is unchanged. A doc it cannot fully check, or a themes root that does not load, is listed with the reason; test fixtures under `__tests__` in the components or docs root are counted, not checked. JSON adds `data.docTypes`. Without TypeScript the check prints one `[skip]` line instead of passing silently; with a TypeScript it cannot read types with (one with no JavaScript compiler API, such as TypeScript 7), that line names the installed version. With no doc files, it says there is nothing to check.
- `astryx doctor integration components` compares each component doc's props with the component's TypeScript props, read with the project's own `typescript`. It warns about a documented prop the code does not have, a prop the package declares that the doc leaves out, and a wrong `required`. Without TypeScript it prints one line saying the comparison was skipped; with a TypeScript it cannot read types with (one with no JavaScript compiler API, such as TypeScript 7), that line names the installed version. The findings are warnings, so the exit code does not change; the JSON response gains `data.propDrift`, and nothing else in it changes.
- `astryx doctor integration components` also judges each documented prop's type against the code, for props the package declares, a documented field such as `status.type` and a name the package's own index signature takes included, and warns when they differ (`type_mismatch`). A type is judged only where both sides read exactly, with the project's own `typescript`: the same text once whitespace, quotes and union order are set aside, or primitives, literals, arrays and unions of those, and names for them. Every other type (a callback, an object, a generic with arguments, an intersection, `keyof`, a type that does not resolve, a name two index signatures take) is listed as not compared, never reported. The comparison needs TypeScript 4.8 or later: with an older one, no type is judged and the text says so in one `[skip]` line. JSON adds `typesCompared`, `typesNotCompared` and, when the types were not judged, `typesSkipped` to `propDrift`. The findings are warnings, so the exit code does not change.
- New `astryx integration check`, the CI check for an integration package's own build. It takes no package argument and checks the integration package in the current folder. It runs the four `doctor integration` checks (`validate`, `components`, `templates`, `docs`), prints each result, then a summary, and exits 1 when any of them would. `--strict` also exits 1 on any warning and on any check that did not run, such as a package with no `astryx.integration.*`: add `"typecheck": "tsc --noEmit && astryx integration check --strict"` to package.json so every build keeps the package's docs in sync. Its exit codes and JSON are a contract for the builds that run it: from this first release on, a new check, or a new failure code, joins only in a minor release named in the release notes. JSON: a new `integration.check` envelope carries each check's own envelope unchanged. Its docs say to run it in CI, so `astryx search ci` finds it. The `doctor integration` subcommands keep their exit codes; their JSON gains only additions.
- Three new published types describe an integration package's templates: `IntegrationPageTemplateDoc` and `IntegrationBlockTemplateDoc`, each with every field of its `TemplateDoc` member but `category` as the package's own string instead of a `TemplateCategory` value, and their union, `IntegrationTemplateDoc`. `@astryxdesign/cli/authoring` exports `IntegrationTemplateDoc`; `@astryxdesign/cli/doc` and `@astryxdesign/cli/template` export all three. `TemplateDoc` is unchanged.
- `astryx upgrade` renames a static `edgeCompensation="inline"` on `List` to `edge="outset"`, and drops `edgeCompensation` beside an `edge` that is a fixed string. It keeps `edgeCompensation` with a `TODO(astryx upgrade)` comment where it can't prove the result: where `edge` is computed (it may be undefined, and then `edgeCompensation` still applies), on a dynamic `edgeCompensation` value, and where the `List` also spreads props, which may set `edge`. The deprecated prop keeps working there.
- `astryx doctor integration docs` lists each code span in an integration's prose that is exactly `astryx docs <name>` for a doc that exists, and says which `{@link}` to write instead: `{@link generic:<name>}` for the package's own topic, `{@link @astryxdesign/cli:generic:<name>}` for Core's. The link prints the command that opens the doc, and doctor's link check fails it if the doc goes away. A command with more words, a route, or a code block is not listed. Each is a `stray_doc_pointer` warning, so `astryx integration check --strict` fails on it, and is in the new `strayPointers` field; `doctor integration docs` keeps exit 0. Core's own guides point with links, and a test keeps them that way.
- `astryx doctor integration validate` and `astryx integration check` now warn `source_without_template_doc` when a `.tsx` directly in an integration's templates root has no same-stem template doc, so `astryx template` would never list it. The warning names the file and the doc to add. Files in subfolders, such as helpers a template imports, and test, spec or story files such as `stray.test.tsx` are not checked; a dotted template id such as `landing.page.tsx` is, and `integration check --strict` fails on the warning.
- The doc-type and prop checks in `integration check` and `doctor integration validate|components` read types with `@typescript/typescript6`, the TypeScript 6 API package TypeScript publishes for tools, when the project installs it and its own `typescript` is missing or has no JavaScript compiler API, as TypeScript 7 does. When no usable TypeScript is found, the skip reason now ends with the remedy: add `@typescript/typescript6` on TypeScript 7, or install TypeScript 5.0 through 6 (`npm install -D typescript@6`).

#### Fixes

- `extractComponents` reported phantom components from locally-declared helper functions in template files — e.g. "Timeline", derived from a `function TimelineSection() {...}` helper declared directly in the detail-page template, which isn't a real component. It now excludes any name bound by a top-level `function`, `class`, `const`, `let` or `var` declaration in the same file (read from the parsed source, so comments, strings and type annotations don't count), before suffix-stripping runs, so a locally-declared helper is never mistaken for an imported component. A component whose whole name is a stripped suffix, such as a bare `Section`, now stays in the list instead of emptying out.
- Global and project copies of the CLI meet more predictably. A repository that builds the CLI itself, with `packages/cli` beside `packages/core`, answers with that CLI instead of failing with `ERR_VERSIONS_UNAVAILABLE`. On a cache folder shared between computers, a release install renews its lock every 10 seconds, and a lock from another computer that goes a minute without renewal is taken over, instead of blocking runs for 20 minutes. Folder names are compared without letter case on macOS and Windows, a Yarn 1 global install on Windows is recognized as a global install, and the shims npm, pnpm (including pnpm 12's), and PowerShell write are read when doctor and the reminders look for the `astryx` commands on the search path.
- The setup reminder, the swizzle StyleX note, and one doctor line say only what is true
- A CLI installed with npm under a prefix of its own (`npm i -g --prefix ~/.local`, `NPM_CONFIG_PREFIX`, or `prefix=` in an `.npmrc`) is now upgraded into that same prefix: the update notice and `astryx doctor` print `npm i -g --prefix <prefix> @astryxdesign/cli@latest`, with `~` for the home folder. npm's default prefixes (Node's own, `/usr/local`, `/usr`, and `%APPDATA%\npm` on Windows) keep the plain command.
- The CLI now uses `postcss-selector-parser` 7.1.6, which parses flat selectors in linear time and closes a CPU-exhaustion vulnerability (#6985).
- `integration verify` reads a package's exports with the same reader discovery uses, so the two agree: a component re-exported through a folder's index file passes, and a type-only re-export no longer counts as the component.
- `astryx component --list` and `astryx search` find VStack, HStack and Heading
  Each has its own import path, but its doc lives in its family's folder: Stack's doc documents HStack and VStack, and Heading's doc sits next to Text's. The list only counted a doc in the component's own folder, so the three were missing from the list and from search, and `astryx component VStack` found its doc only through fuzzy matching. A component whose doc is elsewhere is now listed and searchable with its own import path, and `astryx component VStack` opens its doc directly.
- A doc link to a component, page, or block (`{@link component:AcmeButton}`, `{@link @astryxdesign/core:component:Button}`, `{@link block:acme-card}`) now resolves, and reads as the command that opens it: `astryx component <Name>` or `astryx template <id> --type <page|block>`, with `--package` for anything not from Core. Before, every such link printed as written, and `astryx doctor` and `doctor integration docs` warned that it named no doc, for Core's components as for a package's own. A link that names no component or template still warns, and its hint now searches components or templates instead of topics. A resolved link's `route` is null for these kinds, which no `astryx docs` route opens.
- `astryx doctor` no longer fails "Theme owners and built imports", and `astryx component` no longer stops with "Could not load the recorded theme", when an added theme's built module imports a stylesheet, as in `import './ocean.css'`. Node cannot load a stylesheet, so the CLI checks that each imported `.css` file exists, then treats it as empty. It looks for each stylesheet from the theme module's folder, also when a module that the theme imports from another folder names it. Doctor still fails when an imported stylesheet is missing, and when the module has any other problem, such as a missing dependency, a syntax error, or an error thrown while it loads.
- `astryx search` finds more of what a reader means when the words differ from the catalog's.
- `astryx search` keeps a guide first when the query is a phrase of two or more words that the guide declares as a keyword. `font size` and `font weight` now open the font setup guide before the Text component, and `dark mode` opens the theme guides before the theme hooks. A component whose name is the whole query still comes first, one-word queries are unchanged, and the code terms and table cells in a reference doc don't count as its keywords.
- `astryx search` ranks a match on more of your words above a shorter named entry.
- `astryx integration check --strict` prints each finding once. The checks' own output shows its message and fix, and the closing "Failing under --strict" list names each failure by check, code and place only, so a long report is no longer doubled.
- The `table-filter` page template's phone-width view-options panel is now labelled by its selected tab (`aria-labelledby`) instead of a fixed `aria-label`, so screen readers get the panel's name from the tab that controls it and the tab–panel relationship resolves in both directions.
- `astryx theme build --check` and `themeBuild({check: true})` keep comparing outputs outside the working directory, as the latest release does, rather than refusing them with `ERR_PATH_TRAVERSAL` the way a build does. Check mode writes nothing, so the write confinement of `architecture:cli-surface/INV10` and `INV10a` does not apply to it: an absolute `--out` path outside the working directory, a theme file outside it whose outputs sit beside it, and `--family` with its root theme file outside it are each checked read-only. A relative `--out` path that escapes the working directory is still refused, as before. Builds keep refusing every one of these writes, so when such outputs are stale, the report no longer ends with a `Rebuild with:` command the build refuses. It names the nearest directory that contains the theme files and the outputs, and the build and check commands to run from there: each output's `Source:` header records the directory its build ran from, so the check passes only from that same directory. Stale outputs inside the working directory keep the `Rebuild with:` line.
- `astryx theme build` and `themeBuild()` now write only inside the working directory (`cwd` for the API), as `architecture:cli-surface/INV10` requires; under `architecture:cli-surface/INV10a` the refusal is a compatible fix. Each of these builds now fails with `ERR_PATH_TRAVERSAL` before anything is written: an absolute `--out` path outside the working directory, a theme file outside it whose outputs would go beside it, and `--family` with its root theme file outside it. Paths inside the working directory still build, including through a symlink. To migrate, run the build from a folder that holds the theme file and its outputs, or pass an `--out` path inside that folder; API callers pass a `cwd` that holds them.
- `astryx upgrade` no longer reports your code as up to date when the CLI is older than the installed `@astryxdesign/core`. Core codemods ship inside the CLI, so an older CLI has none for the releases after its own version. It used to print "No changes needed" and "No codemods available for this version range" and exit 0 while the code still needed those releases' migrations. It now warns once that it cannot finish, prints the same upgrade pinned to the CLI release that matches your Core (such as `cd <project> && npx @astryxdesign/cli@<core-version> upgrade --from <old-version> --path <source-dir> --apply`), and ends with "Upgrade incomplete". That command changes to the folder the run used and names the directory it scanned as an absolute path, both with symbolic links resolved, so it upgrades the same code wherever you paste it. It is written for a POSIX shell, or for PowerShell on Windows. `upgrade.status` (`no_codemods` and `config_fixable`) and `upgrade.run` gain an optional `cliBehindCore` field with `cliVersion` and `command`, present only in that case. The codemods the CLI has still run, and the exit status and every existing field are unchanged.
- `astryx integration verify` accepts a theme module that loads the theme's own styles. Such a module imports the theme's exported stylesheet and font stylesheet for their side effects, and re-exports from the module `astryx theme build` writes either everything or only its theme, under the theme's export name. Verify also finds that built module by the name `theme build` gives it, the theme's own name, so a theme whose name differs from its slug no longer fails to rebuild. Any other difference from the built module still fails with `theme_module_stale`, and for a module that re-exports the theme, the message now says what is wrong.

#### Performance

- The CLI loads Core's runtime (`@astryxdesign/core` and `@astryxdesign/core/theme`) only when it builds or checks a theme (`theme build`, and the `doctor` and `integration pack` theme checks), not on every start. In a project with Core installed, every other command, and an import of `@astryxdesign/cli/api`, skips loading Core's components and React: `astryx --version` drops from about 1.3 s to 0.5 s. Output is unchanged.

#### Documentation

- Docs and CLI examples import each Core export from the path `astryx component <Name>` prints.
- Global mode docs: `astryx docs global` is a top-level docs section (and one docsite page, under Guide, which Getting Started introduces and links) explaining what global mode is, the one install command, what you get, and which version runs where. Its pages, each answering one question: project, global, or both (both is recommended; `global/project-global-or-both`), install (`global/install-once`, with what to do about `EACCES`), which version runs and why (`global/who-answers`), updates and notices (`global/updates`), the agent guide on your computer (`global/computer-agent-guide`), integrations installed globally (`global/computer-integrations`), monorepos and nested folders (`global/monorepos`), CI and containers (`global/ci-and-containers`), troubleshooting every line global mode prints (`global/problems`), uninstall and reset (`global/uninstall`), and a reference of paths, environment variables, JSON fields, and error codes (`global/reference`). `astryx docs global` and its pages are answered by the copy you start, even inside a project whose version predates them. Integration authors get a checklist with the commands to try a package globally (`cli/integrations/global-integrations`). Every command that does something else outside a project says exactly what in its "In global mode" note, checked against the command run in an empty folder, and every terminal line the global-mode pages show is checked against the CLI's own strings. A project's update notice now installs the CLI beside Core, so a project that installed only Core gets its own CLI too.
- The integration guides make `integration check --strict` a required step in every integration's build: the quick start installs `typescript@6` (the checks need its JavaScript compiler API, which TypeScript 7 does not ship) and adds "Check it in every build (required)", the Build an integration overview says so, and the checks guide's section reads "Run every check in every build (required)".
- The `astryx docs cli/integrations` guides and `astryx docs authoring` now match the current CLI, and the guides point to the matching `astryx docs authoring <section>` for every field instead of repeating its tables.
- Fix the MCP setup snippet in working-with-ai — "type": "url" is not a transport type, and Claude Desktop adds remote servers through Connectors

#### Other Changes

- `VStack` and `HStack` come from `@astryxdesign/core/VStack` and `@astryxdesign/core/HStack`, `Heading` from `@astryxdesign/core/Heading`, `Text` from `@astryxdesign/core/Text`, and `Theme` and `defineTheme` from `@astryxdesign/core/theme`.
- This covers the guides, the `Card` docs, the next steps `astryx init` prints, the install example `astryx theme build` prints, the wiring example `theme add` prints, the build rules, the theme-module fix `astryx doctor` prints, and the annotated theme template.
- Every path was already exported. Nothing else changes.
- A `docsZh` or `docsDense` overlay may set `name` and `displayName`, as Core's own docs do; both are ignored when the doc renders, so `--strict` no longer fails on them.
- `doctor integration components` reports a documented `default` that differs from the literal default the component writes in its props destructuring (`size = 'md'`) as `default_mismatch`. Quotes and spacing are ignored; where either side's default is not a literal, the prop is listed as not compared.
- `doctor integration validate` warns, each with a fix, on a prop documented twice (`duplicate_prop`), a `propDescriptions` key that matches no prop entry's name as written (`unknown_translated_prop`), a section with no content (`empty_section`), two sections of one topic with the same key (`duplicate_section_key`, whose fix names the key the second one is already served at), and a `.doc.zh.mjs` or `.doc.dense.mjs` overlay beside no topic file (`orphan_doc_overlay`).
- A topic that takes the route of one of Astryx's own docs is named by its topic name, not an internal id, with the rename to make. A link written as a bare name (`{@link deploying}`) gives the exact link to write, or says no topic has that name.
- When a doc is missing several required fields, each finding's message names only its own field.
- `doctor integration validate` prints each issue's fix and file in text output, as JSON already carries them.
- The "run init to finish setup" reminder no longer prints where agents already have the Astryx prompt. In a git repository it looks for init's block in the agent docs from the project up to the repository root, because coding agents read every agent doc in between, so a package in a monorepo that ran `init` at its root stays quiet. This holds for every command and for the reminder printed when `@astryxdesign/core` or `@astryxdesign/cli` is installed. Running the CLI from its own source checkout, inside that checkout, prints no reminder. A project with no block in reach still gets it, and `--json` never prints it.
- `astryx swizzle` no longer says StyleX components "render unstyled (no error)" without a StyleX compiler. Importing them throws StyleX's "Unexpected 'stylex.create' call at runtime" error and the page does not render, and the note now says so.
- In an integration package, where the package's own manifest loads, `astryx doctor`'s implicit-integrations line no longer says that "every loaded integration is named in astryx.config". It names the package's own manifest: as the only loaded integration, or beside the integrations astryx.config names.

  Classification: contract-restoring. Only message text changes: JSON keys, check ids, statuses, and exit codes are unchanged. The doctor line's new text also appears in its `--json` `message`.

- Internal groundwork for `astryx doctor integration components`: a comparison of the props a component doc documents with the props its TypeScript source declares, read with the project's own `typescript`. Nothing reaches it yet, so the CLI's behavior and output do not change; the command starts running it in a later change, which describes what users see.
- Internal groundwork for `astryx doctor integration components`: reading two written TypeScript types as one type when they differ only in how they are written (whitespace, comments, quotes, member order, `Array<T>` for `T[]`, parameter names, `React.` qualifiers), and judging a documented prop type against the type the code declares where both read exactly. Nothing reaches either yet, so the CLI's behavior and output do not change.
- Internal groundwork for `astryx doctor integration components`: finding the project's own `typescript`, and reading a package's TypeScript project the way `tsc` reads it (its own `tsconfig.json` or a monorepo root's, a solution-style config's references, and the declaration files the config includes), and finding the references in that project the compiler cannot resolve. Nothing reaches it yet, so the CLI's behavior and output do not change.
- Old-CLI notes name the published releases that behave that way: template `replaces`, links, docs sections, section `id`s and typed theme descriptors work from 0.6.4, and template `keywords` from 0.6.6. `integration verify` still names the CLI range to declare.
- The quick start makes the package an ES module, so a theme it builds can be imported.
- Samples and output that had drifted are fixed, among them the subcomponent imports, a theme that extends another, and the upgrade output.
- The Authoring Reference corrects how an invalid `astryx.config` is handled, the `issuesUrl` format, where codemod files go, and which fields nothing reads yet. Its examples use the `export default {type: ...}` form that `integration add` writes.
- `astryx docs cli/integrations` links to the Authoring Reference, and the reference links back to the guides.
- `astryx docs styling-overview` and `tokens-and-setup` give the real symptom of a missing StyleX compiler: importing a swizzled component throws an error that starts `Unexpected 'stylex.create' call at runtime`.
- Adjacent query words that join into a component, hook, or template name, or into a one-word keyword, match it: `table header cell with sort arrow` finds `TableHeaderCell`, `tree view folders` the `treeview` keyword, and a hook answers to its words without `use`. Most of a name, a name's leading words, or a run of its words also count for components and hooks, a step below the full name.
- A query that is one camelCase identifier and matches nothing as typed is read as the words it spells, so an unknown API name such as `useTablePaginationState` reaches `useTablePagination`. In a query of several words each identifier stays one term.
- When the whole query is an entry's name, these readings add no near siblings beside it. A match on a joined keyword never ranks above an entry the query names, and a match on part of another name does only when it spans more query words than that entry's name.
- A gerund matches its verb (`spacing` and `space`, `dragging` and `drag`), and a plural can start a longer word through its singular (`tokens` and `Tokenizer`).
- Core component docs declare more keywords: other libraries' names (`scrollarea`, `togglegroup`, `pageheader`, `splitpane`, `circularprogress`, `linearprogress`, `commandmenu`, `relativetime`, `sidesheet`, `descriptionlist`, `inlinecode`) and common glyph names on `Icon`, since any icon library's glyph renders through it.
- The JSON shape is unchanged.
- A match on part of a longer name that reads more of the query than the entry the query names is no longer held below it: `dropdown menu radio options` leads with `DropdownMenuRadioItem`, not `DropdownMenu`.
- `useResizable` drops the `splitview` keyword, which put it ahead of the side-panels guide.

#### Contributors

Thanks to everyone who contributed to this release:

- @abu-abdullah22
- @cixzhang
- @dependabot
- @imdreamrunner
- @josephfarina
- @kentonquatman
- @Kyujenius

---

# 0.7.1

#### Fixes

- `CommandPaletteInput` now exposes the semantics and name that its visible state promises. (#7321)
  - A standalone field with no popup attributes was `role="combobox"` with `aria-expanded="true"` and `aria-autocomplete="list"`; it is now `role="searchbox"` with no popup state. Pass `role="combobox"`, or your popup's own ARIA attributes, to keep the old semantics. A field that already passes popup attributes (`aria-expanded`, `aria-controls`, `aria-owns`, `aria-haspopup`, and the like) stays a `combobox` and keeps them, and a field inside `CommandPalette` is unchanged.

  - The field's default accessible name was its placeholder (`Search…`, or the caller's `placeholder`); it is now `Search commands`, translated. Pass `label` to keep a specific name, for example `label="Search…"` for the old default. A caller whose custom `placeholder` served as the name keeps working code and hears the generic name until it passes `label`.

  - The CLI's async-search CommandPalette block names its field `Search files`.

  - `endContent={true}` no longer renders an empty trailing slot, and `endContent={0}` renders inside the trailing slot instead of after it.
- Stone, Y2K, and Gothic set `CodeBlock`'s diff row slots in their own syntax palettes, so a reader of a diff on those themes gets added and removed rows whose code, line numbers, and `+`/`-` glyphs stay readable: every syntax token keeps at least 4.5:1 on the tinted rows in Stone (light and dark) and Y2K (light and dark), and in Gothic the rows take a deep green and a deep red at the background's own luminance, so every token keeps the contrast it has on the plain background. Line numbers and glyphs on changed rows use each theme's own green and red. The CLI's bundled copies of the three themes (`astryx theme eject`) carry the same palettes. (#7428)
- A `secondary` Selector, MultiSelector, or ComplexSelector now matches the theme's secondary Button: under butter, chocolate, gothic, stone, and y2k it takes that Button's border, fill, text color, and hover instead of the default borderless neutral fill, so a toolbar mixing secondary buttons and selectors reads as one set of controls. Disabled and read-only triggers keep a still fill on hover, as a disabled Button does, and a Selector or MultiSelector inside an InputGroup keeps the group's neutral fill and edges. The default theme is unchanged, the selector docs now say `secondary` follows the theme's secondary Button, and themes added with the CLI get the same parity. (#7548)
- `astryx theme build --watch` stops as soon as it is interrupted (Ctrl-C or SIGTERM). A change saved while a rebuild was running no longer starts another rebuild after "Stopped watching.", and a rebuild in progress stops with the watcher instead of keeping the process alive. (#7508)

#### Performance

- `astryx search` and `astryx build`, and the `search` and `build` API functions, read each source directory once per call instead of once per candidate. Results are unchanged. A warm `search` drops from about 1.9 s to 0.4 s on macOS. (#7421)

#### Documentation

- The generated token docs list the five diff row slots of the syntax vocabulary — `--color-syntax-added`, `--color-syntax-removed`, `--color-syntax-diff-header`, `--color-syntax-added-marker`, `--color-syntax-removed-marker` — with their defaults, so `astryx docs tokens` describes nineteen syntax slots. (#7389)
- The Tailwind and migration setup docs now say that `globals.css` (or a `layers.css` holding only the `@layer` line) must be the first import in the root layout or app entry, before the `astryx-themes` module or any component that imports theme CSS; otherwise Tailwind preflight overrides Astryx base styles and theme overrides lose. The Tailwind v3 coexistence snippet moves its `@layer` line into a `layers.css` imported first, because Next.js (webpack or Turbopack) hoists CSS imports above an inline `@layer` line. (#7534)
- Grid's `columns` docs now lead with the shape that reflows: a numeric `columns` is exactly N columns at every width and never reflows, and `columns={{minWidth, max}}` is the form for columns that must survive a phone. The `astryx docs layout/responsive` topic gains a "Columns that reflow" section with a reflowing stat row beside a fixed week row. No behavior changes. (#7340)
- The styling setup docs now load the prebuilt stylesheets on every path. The "StyleX from source" path becomes "StyleX for your own code": it keeps `astryx.css` and points the StyleX compiler at your own and swizzled source only. A new "Other Astryx packages" section lists each package's stylesheet (`richtext.css`, `lab.css`, `charts.css`) and where to import it. Getting started no longer lists the two example setups that compile Astryx source; the remaining examples all load `astryx.css`. (#7587)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.7.0

#### Breaking Changes

- `theme add` now imports built themes; use `theme eject` to copy theme source. (#7138)
  The old contract copied theme source with `theme add <slug> [path] [--overwrite] [--package <package>]` and returned `theme.add` JSON. The `ThemeAddResponse` type and the `theme.add` response type are removed, with their `ThemeAddResponse.type`, `ThemeAddResponse.data`, and `ThemeAddResponse.meta` fields. The replacement imports the built theme with `theme add <slug> [--package <package>]` and returns `theme.app`; `--import` remains an accepted no-op. Plain `theme add` now returns `theme.app` with the owner `package` directly after `type`. Local themes carry no package.

  A path after `theme add` now exits 1 with `ERR_INVALID_ARGUMENT`, and `--overwrite` exits 1 with `ERR_INVALID_OPTION`; neither writes files. To migrate a script that copied source, run `theme eject` with the same slug, path, `--overwrite`, and `--package` arguments. A script that already runs `theme add --import` keeps the same meaning and needs no change.

- `init --remove-agents` says when there was nothing to remove. (#6623)
  Migration: a consumer reading `data.removed` as a boolean keeps working; a consumer that narrowed on the literal `true` must accept the corrected value.
- Four commands refuse silently ignored option pairs. (#7132)
  Migration: remove the option the command was ignoring.
- Refuse invalid input that used to silently succeed. (#7149)
  Migration: pass a valid type or package, an integer limit, or the documented arguments, and catch `ERR_AMBIGUOUS_COMPONENT` for a multi-package name.
- An empty-string argument no longer discards the rest of the command. (#6620)
  Migration: remove the empty string from the invocation; omit the argument to list.
- `doctor integration validate` exits 1 when there is no package.json. (#7150)
  A missing package.json now produces a `no_package` error, so the existing error-severity exit rule applies. A directory with package.json but no integration manifest still exits 0.

  Migration: run the command in a directory that has a `package.json`, or handle exit 1 for that case.

- Move canonical data-color defaults from generated theme CSS to the public StyleX `dataVars` group. (#6834)
  Import `dataVars` from `@astryxdesign/core/theme/dataTokens.stylex` for CSS-capable code. Canvas and other non-CSS APIs continue to use `resolveThemeToken()` or `useTheme().token()`. Rebuild committed theme CSS with `astryx theme build`; concrete themes now emit only explicitly authored data-color overrides.

  Old usage: Generated theme CSS owned the canonical `--color-data-*` root defaults.

  Replacement: The public StyleX `dataVars` group in `@astryxdesign/core/theme/dataTokens.stylex` owns the defaults; concrete themes emit only explicitly authored data-color overrides.

  Migration: Import `dataVars` from `@astryxdesign/core/theme/dataTokens.stylex` for CSS-capable code. Canvas and other non-CSS APIs continue to use `resolveThemeToken()` or `useTheme().token()`. Rebuild committed theme CSS with `astryx theme build`.

  Codemod: `astryx upgrade` runs `validate-data-token-ownership`, which rewrites nothing and reports fallback-less `var(--color-data-*)` uses (whole or embedded source strings, and stylesheets) and stale generated theme CSS for manual migration.

- Doctor fails when the CLI cannot load what astryx.config asks for (#7130)
  A new `configured-integrations` check fails when an integration named in astryx.config cannot be loaded: not installed, installed without a manifest, or a manifest that throws or fails its schema. Such an integration is withdrawn whole and contributes nothing. The config check fails, instead of warning, when astryx.config imports but the CLI cannot load the project from it.

  Unchanged: a problem inside one contribution kind (an invalid component doc, a missing or unreadable root, or an unresolved replacement) stays a warning under `integration-issues`, and an autolinked dependency that cannot be loaded stays informational.

  No codemod applies: nothing in a project's source changes; install the integration, repair its manifest, or edit `integrations` in astryx.config.

  What counts as configured is every name astryx.config lists, including a package set aside for a provider conflict and the package being authored when its own config names it. Migration: install the integration, fix its manifest, or remove it from `integrations`; fix the astryx.config field the message names.

- Typeahead, Tokenizer, CheckboxList, RadioList, and Slider no longer accept root `xstyle`, `className`, or `style`. Style the field with `containerXstyle`/`containerClassName`/`containerStyle` (the Field box; no effect inside InputGroup or a `horizontal-labels` FormLayout) and the visual control box with `controlXstyle`/`controlClassName`/`controlStyle`. Base props now reach the primary semantic control: the combobox input for Typeahead and Tokenizer, the `role="group"`/`role="radiogroup"` element for CheckboxList and RadioList, and the `role="slider"` thumb for Slider (the `role="group"` control in range mode). A caller `aria-describedby` is kept alongside the field's own description and status, on these components and on TextInput, TextArea, and NumberInput, which previously dropped it. CLI templates use the new props. (#7339)
  Migration: rename root `xstyle`/`className`/`style` to the part they styled before: `containerXstyle`/`containerClassName`/`containerStyle` on all five components, except a Typeahead inside InputGroup, whose root styling painted the control surface and moves to `controlXstyle`/`controlClassName`/`controlStyle`. The release's `astryx upgrade` codemod, `migrate-field-input-styling`, performs these renames on JSX usage.

  Not rewritten by the codemod, so update by hand:

  - `ref` and `id`, plus `data-*` (except Typeahead and Tokenizer `data-testid`, which marked the control surface), `aria-*`, and DOM event handlers such as `onClick`, previously landed on the outer Field (or were dropped by RadioList and Slider). They now land on the primary semantic control. Update code that measured, queried, or listened on the outer field, and wrap the component in your own element when you need an outer boundary.
  - Typeahead and Tokenizer refs are now `HTMLInputElement`.
  - A consumer `onKeyDown` on Typeahead or Tokenizer still runs after the built-in key handling, cannot cancel it, and still fires for keys on the clear button and tokens; for keys on the input it now runs on the combobox input itself.
  - RadioList and Slider used to drop DOM event handlers; they now run after the component's own handling, so a Slider `onPointerDown`, `onKeyDown`, `onFocus`, or `onBlur` that never fired before now fires (on the thumb, or on the group in range mode).
  - Tokenizer's `onFocus`/`onBlur` keep their meaning: focus entering or leaving the field.
  - Styling passed through a wrapper's own props or a spread is not rewritten and now fails type-checking at that callsite.

  Untyped callers get a development warning and the value is ignored.

  From #5656 by @harjothkhara.

- Selector, MultiSelector, and ComplexSelector no longer accept root `xstyle`, `className`, or `style`. Style the field with `containerXstyle`/`containerClassName`/`containerStyle` (the Field box; no effect inside InputGroup, a `horizontal-labels` FormLayout, or with `renderTrigger`) and the visual control box with `controlXstyle`/`controlClassName`/`controlStyle`. Base props such as `ref`, `id`, `data-*` (including `data-testid`), `aria-*`, and DOM handlers reach the trigger button that carries the combobox role (or, with `renderTrigger`, the caller's control), and a caller `aria-describedby` is kept alongside the field's own description and status instead of being replaced. Handlers keep their existing order: a ComplexSelector `onClick` on its own trigger can still cancel opening, and newly forwarded handlers (including those reaching a `renderTrigger` control) run after the built-in toggle and keyboard handling. CLI templates use the new props. (#7341)
  Migration: rename root `xstyle`/`className`/`style` on these components to `controlXstyle`/`controlClassName`/`controlStyle`, which style the same element as before. Not a rename: a `data-testid` or other base prop now lands on the trigger button rather than the bordered box around it (query the box with `.closest()` if a test measured it), and with `renderTrigger` base props and `ref` now reach the caller's control. Rename JSX usage by hand, or run `astryx upgrade`; it runs `migrate-field-input-styling`, which does not follow styling passed through a wrapper's own props or a spread, which now fails type-checking at that callsite, so rename it there. Untyped callers get a development warning and the value is ignored.

  From #5656 by @harjothkhara.

- TextInput, TextArea, NumberInput, and FileInput no longer accept root `xstyle`, `className`, or `style`. Style the field with `containerXstyle`/`containerClassName`/`containerStyle` (the Field box; no effect inside InputGroup or a `horizontal-labels` FormLayout) and the visual control box with `controlXstyle`/`controlClassName`/`controlStyle`. Base props such as `ref`, `id`, `data-*`, `aria-*`, and DOM handlers reach the native control, and a caller `id` is now honored there. CLI templates use the new props. (#7336)
  Migration: rename root `xstyle`/`className`/`style` on these components to `controlXstyle`/`controlClassName`/`controlStyle`, which style the same element as before. `astryx upgrade` rewrites JSX usage; styling passed through a wrapper's own props or a spread is not rewritten and now fails type-checking at that callsite, so rename it there. Untyped callers get a development warning and the value is ignored. Not rewritten by the codemod: a caller `id` used to be replaced by a generated one and now reaches the native control (the label stays associated), so remove an `id` you passed but relied on being ignored. Other base props already reached the native control and are unchanged.

  From #5656 by @harjothkhara.

- matcha's and y2k's spacing steps are rem (`--spacing-2: 0.75rem`), so their gaps and padding follow the reader's root font size like the core scale. Every step is the same pixel value at the default 16px root; a reader with a larger root font size now sees proportionally larger spacing on these themes. The CLI's copies of both theme templates and the annotated theme template's spacing example change the same way. (#7374)
  Migration: nothing to change to take the new behaviour. To keep fixed pixel spacing on one of these themes, extend it and override the steps in px, which is honoured as written: `defineTheme({name: 'app', extends: matchaTheme, tokens: {'--spacing-2': '12px'}})`.
- On touch devices narrower than the `lg` breakpoint (`(width < 1024px) and (pointer: coarse)`), the 14px-base first-party themes now floor their type base to 16px and re-derive the ratio so Display 1 keeps its desktop size: neutral and chocolate (base 14, ratio 1.2 → 1.1736) and butter and stone (base 14, ratio 1.25 → 1.2225). On phones, body, label and code text rise from 14px to 16px; supporting text, the headings and Display 2 and 3 grow by 1–2px; only Display 1 holds its desktop size. Desktop sizes are unchanged. gothic, matcha and y2k already use a 16px base and need no rule. The CLI's theme templates carry the same rule, so a newly scaffolded theme gets it too. (#6699)
  An app theme that extends one of these four themes and sets its own `typography.scale` or type-size tokens inherits this rule, and on touch + narrow screens the rule replaces those values (a base-18 child drops to a 16px body and a 42px Display 1). Append your own rule for the same condition with the values you want; a later rule for the same condition wins.

  Migration: nothing to change to take the new phone scale. To keep the previous 14px phone scale in an app, extend the theme and append a later rule for the same condition: `defineTheme({name: 'app', extends: neutralTheme, adaptations: {rules: [{when: {pointer: 'coarse', width: {below: 'lg'}}, value: {typography: {scale: {base: 14, ratio: 1.2}}}}]}})`. For butter and stone use `ratio: 1.25` and also set `tokens: {'--text-supporting-size': '12px'}` in that rule's value, because those themes pin supporting text at 12px rather than the 11px the scale alone gives. This cannot be rewritten by a codemod: whether an app wants the floor is a product choice.

- Stop reading the Astryx-owned agent variables ASTRYX_AGENT_ID, ASTRYX_AGENT_SESSION_ID, and ASTRYX_AGENT_METADATA (#7127)
  The theme-import change already stopped reading `ASTRYX_THEME`; these three were the last Astryx-owned agent variables. A test now fails on any `process.env.ASTRYX_*` read in the CLI source.

  Migration: set `AGENT` and `AGENT_SESSION_ID`, which the CLI already reads, instead of the Astryx-prefixed variants. `ASTRYX_AGENT_METADATA` has no replacement variable.

- Remove the deprecated component-theming compatibility surface scheduled for 0.7.0. Components now emit only canonical target classes and reflected `data-*` prop/state selectors. Theme discovery and build output no longer expose deprecated targets, and `ThemePropsOptions` plus `ComponentThemingTarget.deprecatedFor` are removed. The `theme targets --json` response drops the `ThemeTargetEntry.deprecatedFor` field, because no target it lists is deprecated. (#7302)
  Migration: run the required codemod `migrate-deprecated-theme-surface` with `astryx upgrade --from <your 0.6 version> --apply --path .` after upgrading.

  The codemod renames removed target keys inside theme `components` maps (an imported `defineTheme()` call, an object typed as an Astryx theme, or a theme object with a static `name`), renames target classes in CSS, and replaces target-qualified bare prop/value/state classes with reflected `data-*` selectors, using every bare class the final 0.6 release emitted. It leaves dynamic/computed theme keys, unqualified or unknown classes, and CSS embedded in JavaScript/TypeScript strings for manual review. It adds `TODO(astryx upgrade)` when old and canonical keys coexist, and when a bare class Astryx once emitted has no known meaning on the target it qualifies.

  The four per-component clear-icon aliases all become the shared `input-clear-icon`, which styles every input's clear icon. In CSS the codemod keeps each rule on its component with `:where(.astryx-<component> *)`, which adds no specificity. Theme keys cannot carry that scope, so the codemod adds a TODO naming the CSS selector to use.

  Code that passed `{legacyNames}` to `themeProps()` or set `deprecatedFor` in a component doc should delete that argument or field; the canonical target is unchanged.

  Rename theme keys and CSS target classes with this complete mapping:

  - `base-table` → `table`
  - `checkbox` → `checkbox-indicator`
  - `codeblock` → `code-block`
  - `codeblock-copy-button` → `code-block-copy-button`
  - `codeblock-header` → `code-block-header`
  - `codeblock-title` → `code-block-title`
  - `date-input-clear-icon` → `input-clear-icon`
  - `date-range-input-clear-icon` → `input-clear-icon`
  - `hovercard` → `hover-card`
  - `multi-selector-clear-icon` → `input-clear-icon`
  - `navicon` → `nav-icon`
  - `popover-surface` → `popover`
  - `progressbar` → `progress-bar`
  - `progressbar-fill` → `progress-bar-fill`
  - `progressbar-mark` → `progress-bar-mark`
  - `progressbar-track` → `progress-bar-track`
  - `radio` → `radio-indicator`
  - `radio-dot` → `radio-indicator-dot`
  - `selector-clear-icon` → `input-clear-icon`
  - `statusdot` → `status-dot`
  - `textarea` → `text-area`

  For custom CSS, replace removed bare selectors with the corresponding reflected attribute on a canonical target—for example, `.astryx-button.primary.sm` becomes `.astryx-button[data-variant="primary"][data-size="sm"]`, and `.astryx-switch.checked` becomes `.astryx-switch[data-checked="checked"]`. Review unqualified classes such as `.primary` manually because they may be application-owned.

- Remove the `astryx layout` command group. (#7137)
  Removes the deprecated `astryx layout` command group (`expand`, `check`, `grammar`), its three response types (`layout.expand`, `layout.check`, `layout.grammar`), and the programmatic API exports (`layoutExpand`, `layoutCheck`, `layoutGrammar`).

  Use `astryx build` to choose the template to start from, `astryx template` to scaffold it, and `astryx docs layout` for layout guidance. The layout guide is unaffected. The error codes `ERR_LAYOUT_PARSE` and `ERR_LAYOUT_INVALID` are retained.

  Removed JSON ids: `LayoutBlockReference.mode` `LayoutBlockReference.name` `LayoutCheckOptions.cwd` `LayoutCheckOptions.form` `LayoutCheckOptions.loose` `LayoutCheckResponse.data` `LayoutCheckResponse.data.compact` `LayoutCheckResponse.data.errors` `LayoutCheckResponse.data.form` `LayoutCheckResponse.data.outline` `LayoutCheckResponse.data.valid` `LayoutCheckResponse.data.warnings` `LayoutCheckResponse.type` `LayoutExpandOptions.cwd` `LayoutExpandOptions.form` `LayoutExpandOptions.loose` `LayoutExpandOptions.name` `LayoutExpandOptions.targetPath` `LayoutExpandResponse.data` `LayoutExpandResponse.data.blocksReferenced` `LayoutExpandResponse.data.code` `LayoutExpandResponse.data.componentsUsed` `LayoutExpandResponse.data.demoMediaReplaced` `LayoutExpandResponse.data.form` `LayoutExpandResponse.data.states` `LayoutExpandResponse.data.todos` `LayoutExpandResponse.data.warnings` `LayoutExpandResponse.data.written` `LayoutExpandResponse.type` `LayoutGrammarOptions.cwd` `LayoutGrammarResponse.data` `LayoutGrammarResponse.data.aliases` `LayoutGrammarResponse.data.text` `LayoutGrammarResponse.type` `LayoutIssue.col` `LayoutIssue.formatted` `LayoutIssue.line` `LayoutIssue.message` `LayoutIssue.suggestions`

- Spacing tokens are rem (`--spacing-2: 0.5rem`), so gaps and padding follow the reader's root font size the way the type scale does. Every token value is unchanged at the default 16px root. (#7359)
  One change shows at the default root: the `useTableRowExpansion` chevron now sits centered in its fixed 40px column instead of running past its edge (its button moves from 24–48px to 8–32px of the column). Under a theme with a larger spacing scale, such as matcha, the chevron is visible again and the detail panel lines up with the first column instead of starting 20px past it.

  Old usage: The `--spacing-*` defaults were fixed px (`--spacing-2: 8px`), so `useTheme().token()`, `resolveThemeToken()`, `tokenDefaults` and `spacingDefaults` returned px strings, and spacing stayed the same size when a reader raised the browser font size.

  Replacement: The defaults are rem with the same value at a 16px root (`--spacing-2: 0.5rem`, `--spacing-4: 1rem`), and those readers return the rem string.

  Migration: CSS that reads `var(--spacing-*)` needs no change. Code that parses a spacing token as a px number converts the rem value with the root font size, or reads the element's computed length. A theme that wants fixed px spacing sets the tokens back, for example `defineTheme({tokens: {'--spacing-2': '8px'}})`.

  Codemod: None. A token read and parsed at runtime cannot be found and rewritten statically, and CSS uses need no rewrite.

- `theme build` exits 1 when it reports private `--_*` variables. (#6872)
  The old contract reported private-variable errors but exited 0. The corrected contract keeps the same warnings, receipts, generated files, and `--check` output, but exits 1.

  To migrate, a CI step that relied on exit 0 must fix the theme's private `--_*` inputs.

#### New Features

- `astryx upgrade` adds `padding={0}` to BottomSheet elements that do not set `padding`, keeping their unpadded content box now that BottomSheet pads like Dialog. Sheets whose only child is a Section or a Layout are left unchanged. A sheet with a Layout anywhere in its content also gets a TODO comment, because `padding={0}` removes the inset between that Layout's regions and the Layout's own `padding` restores only its outer edges. A shadowed `BottomSheet` binding is left alone, and a second run changes nothing. (#6884)
- `astryx upgrade` runs `migrate-field-input-styling`, which renames root `xstyle`/`className`/`style` on Field-composed inputs to the part they styled before: `controlXstyle`/`controlClassName`/`controlStyle` on TextInput, TextArea, NumberInput, FileInput, DateInput, DateRangeInput, DateTimeInput, TimeInput, Selector, MultiSelector, and ComplexSelector, and `containerXstyle`/`containerClassName`/`containerStyle` on Typeahead, Tokenizer, CheckboxList, RadioList, and Slider. It rewrites JSX written directly on an Astryx import (named, aliased, or namespace). Spreads and wrappers that forward their own styling props are left for manual migration, and a callsite that already sets the target prop gets a TODO instead of a rename. (#7342)
- `astryx upgrade` renames `emptySearchResultsText` to `emptySearchText` on `Tokenizer`, `Typeahead`, `BaseTypeahead`, and `ChatComposerInput` trigger objects, for the release that removes the old name. (#7289)

#### Fixes

- `template` and `build` follow the project's package manager. The nearest directory from the target up to the workspace root that has a `packageManager` field or a lockfile decides. With neither, the command uses npm, whatever package manager launched the CLI. When that directory's lockfiles disagree and nothing it commits picks one, `installCommand` is `null` and the note names the missing packages, the directory, and the lockfiles that disagree, instead of guessing a command that would write a second lockfile. (#7343)
- Teach generated palette references in the full custom-theme authoring guide. (#7268)
- Generate Neutral's runtime palette references from the stops its theme uses, and fail verification when the package or CLI template copy drifts. (#7255)

#### Documentation

- Clarify release-branch codemod promotion and version ownership. (#7293)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @harjothkhara
- @imdreamrunner
- @josephfarina
- @rubyycheung
- @vjeux

---

# 0.6.8

#### Fixes

- A template that sets `replaces` needs `@astryxdesign/cli` 0.6.4, and one that sets `keywords` needs 0.6.6, not 0.7.0 (#7265).
  Published 0.6.4 applies a template's `replaces`, and published 0.6.6 reads its `keywords`. `integration verify` asked for `">=0.7.0"` for both, a range no released CLI satisfies, and npm leaves the CLI uninstalled in an app that installs a package with that optional peer. `integration verify` now accepts `">=0.6.4"` for `replaces` and `">=0.6.6"` for `keywords`, and still refuses a range that admits an older CLI. Its messages now say what older CLIs do. Before 0.6.6 a template that sets `keywords` is dropped, and before 0.6.4 the package's doc topics are hidden too.

#### Documentation

- Guide new theme authors to the palette generator and keep the broad color scale opt-in in generated theme templates (#6795).

#### Contributors

Thanks to everyone who contributed to this release:

- @josephfarina
- @rubyycheung

---

# 0.6.7

#### New Features

- Apps can opt into package-managed themes with `astryx theme add <slug> --import`. The command records the theme in one generated app module with its production CSS, optional font CSS, and default slug. Use `theme remove` and `theme use` to manage that record, and pass `themes[defaultThemeSlug]` to `<Theme>`.
  Plain `astryx theme add` keeps its released source-copy behavior, options, stdout, exit status, and every `theme.add` data field. It now warns that `theme eject` is the explicit source-fork command and `theme add --import` is the way to use the package-managed theme. Its machine result adds the `DEP-0005` deprecation entry; the cleanup is `CLN-0005` in a later scheduled minor.

  Use `defineTheme({extends: importedTheme, ...})` for ordinary customization. `theme eject` creates an independent local fork with its descriptor. JSON callers receive `theme.app` from import, remove, and use, or `theme.eject` from eject.

  Existing bundled source copies stay where they are and keep their bytes. Run `astryx upgrade --from 0.6.4 --path . --apply` to add the missing unmaintained descriptor beside each bundled copy in `src/themes`. Until then, theme commands skip those copies and `theme list` and doctor name them as unmigrated. Package integration themes keep their released complete-directory copy, including the authoring descriptor.

  `ASTRYX_THEME` is no longer read. In a project with a generated app theme module, component metadata reads that record's default built theme. Without the module, the released `package.json#astryx.theme` lookup keeps its meaning. Doctor loads every recorded built module through the same theme adapter, so a broken runtime import fails `theme-owners` instead of passing.

  `theme build` also writes `<out>.css.d.ts` so TypeScript accepts generated CSS imports. Check mode stays compatible with released output sets that do not have this new stub yet.

  Integration themes can export built modules and stylesheets. `astryx integration add theme` creates those exports, and `integration verify` checks the exported paths against the packed package and source. Missing partner exports alone do not block packing. Every declared export must resolve; staleness is a warning for an incomplete set and an error for the complete importable module and stylesheet pair.

- Every result now names the package it comes from. A `--json` result about one artifact (a component and each of its projections, a doc topic, index, section, or docs-tree node, a template, a hook, and `swizzle`) carries `package` in its envelope, directly after `type`. A result that lists artifacts gives each item its own `package`: every `search` hit, `build`'s start, alternatives, blocks, and components, a doc's sections, a docs-tree node's children, `--blocks` entries, and the `component --list` and `upgrade --list` entries. Text names the same package; `--source`, `--showcase`, and a template's source still print only the source on stdout and name the package on stderr. Existing fields are unchanged.
- Deprecate the `astryx layout` command group
  The `astryx layout` command group (`expand`, `check`, `grammar`) is deprecated. Use `astryx build` to choose the template to start from, `astryx template` to scaffold it, and `astryx docs layout` for layout guidance.

  In human mode each invocation prints a stderr warning naming the replacement. In JSON mode the response envelope carries machine-readable deprecation metadata in its `meta` field. Canonical stdout, exit codes, and the `layout.expand` / `layout.check` / `layout.grammar` response schemas are unchanged.

  Deprecation lifecycle (`spec:AST-017` FR28, FR31) — removal only in a later minor whose frozen manifest carries both ids of a pair:

- An integration component can replace a Core component, once its package opts in
  An `@acme/nav` component whose doc sets `replaces: 'SideNav'` takes over `SideNav` for unqualified component detail, batch selectors, every `component --list` detail level, `search`, `swizzle`, and gap-report routing, when `@acme/nav` declares `"@astryxdesign/cli": ">=0.6.7"` in `peerDependencies` (optional in `peerDependenciesMeta`). Every result names its package, `--package @astryxdesign/core` still selects the original Core component, and the replacement keeps answering to its own name. `component SideNav --package @acme/nav` also selects it.

  Any `@astryxdesign/cli` range that starts at 0.6.7 or later is the opt-in, including the `>=0.7.0` that `integration add doc --parent` wrote in 0.6.4 and 0.6.5, and `integration add theme` in 0.6.5. A package whose range admits an earlier CLI keeps its component under its own name and Core stays selected, and an app that loads it sees no new output; its author gets warnings naming the range to add, from `astryx doctor integration components` and `integration verify`. For a package that declares the range, `astryx doctor integration components` reports a missing Core target, an invalid value, a component named after a different Core component, or two replacements for one target in the package as errors and exits 1. When several packages replace one target, an explicitly configured package beats an autolinked one, the later configured package wins, and Doctor warns.

- Add the model comparison page template with responsive sticky context and accessible interactions. (#6251)
- New `table-collapsible` page template: several tables on one page, each in a collapsible card with its own columns, for groups that do not share a schema. Every table sorts on its own, one time range in the page header drives all of them, and rows expand in place into a full-width history chart. Below 720px each table folds to its name and headline figure. (#6065)

#### Fixes

- Printed commands name the scoped `@astryxdesign/cli` package whenever the `astryx` bin is not installed for the project
- Compact the generated agent-docs block: fewer lines, same behavioral coverage
- `astryx doctor` keeps its `themes` check, with the same id, label and fields, beside the new theme checks, so scripts that read it by id keep working. Without a generated theme module it reports what it did before: whether an `@astryxdesign/theme-*` package is installed, and whether the app's package.json names a theme in `astryx.theme`. Its fix now names `theme add --import`. With a generated module it reports the overall result of the theme checks.
  In a workspace, `themes` reads the app's own package.json, the file the CLI reads when it resolves the theme, rather than the package.json beside the root `node_modules`. It no longer counts the `ASTRYX_THEME` variable, which the CLI does not read, as a wired theme.
- Doctor says why it skipped a check and what it checked, and `doctor integration validate` no longer crashes on a folder it cannot read
- upgrade: exclude node_modules from integration codemod discovery
  When an integration declared its codemods root as the package root (`codemods: "./"`), the version-folder scan treated `node_modules`, `.git`, `__tests__`, and `__fixtures__` as version folders and loaded their files as codemods. The same `SKIP_DIRS` filter that the recursive file walk already used is now also applied to the top-level version-folder enumeration.
- Align the layout deprecation (DEP-0006) with the documented envelope and precedent
  The layout command's JSON envelope now emits `meta.deprecations: [{id, replacements}]`, matching the response schema doc and the DEP-0005 theme add precedent. The `deprecated` CommandDoc field renders in `--help` and the manifest. The programmatic API exports (`layoutExpand`, `layoutCheck`, `layoutGrammar`) carry `@deprecated` in their declarations and generated types. Command and function reference pages name DEP-0006 and the replacement. The DEP-0006 record names its direct authority. All released data fields are unchanged.
- swizzle: rewrite every .stylex import to a deep path
  `astryx swizzle Button` (and any component that imports a `.stylex` module from outside its own directory) emitted an import that collapsed to the directory barrel — e.g. `@astryxdesign/core/utils` instead of `@astryxdesign/core/utils/interactionOverlay.stylex`. The barrel does not re-export those StyleX symbols, so the swizzled file could not compile.

  `rewriteImports` now gives every `*.stylex` module the deep subpath. The exports generator (`scripts/sync-exports.js`) adds 16 specific subpath exports for the `.stylex` modules swizzled components actually reference across directories:

  `DateInput/tokens.stylex`, `Icon/IconSize.stylex`, `Indicator/indicator.markers.stylex`, `Layer/layerAnimations.stylex`, `Layer/layerTextReset.stylex`, `Layer/layerViewportInset.stylex`, `Layout/container.stylex`, `Layout/edgeCompensation.stylex`, `Layout/padding.stylex`, `NavItem/navItemStyles.stylex`, `Selector/selectorPresentation.stylex`, `Stack/stack.stylex`, `Stack/stackItem.stylex`, `Text/text.stylex`, `utils/focusOutline.stylex`, `utils/interactionOverlay.stylex`

  These are public API additions. Each module already ships in the npm tarball (in `dist/`); only the exports map entry is new. No wildcard — a future cross-directory `.stylex` import needs a deliberate entry in `STATIC_EXPORTS`. Precedent: `./theme/dataTokens.stylex` (AST-066 FR2).

- template: show a grouped summary by default instead of the full catalog
  Bare `astryx template` (no name, no `--list`) now shows templates grouped by category with counts — about 21 KB instead of the full 149 KB catalog. The full catalog with descriptions is still reachable via `astryx template --list`.

  JSON output is unchanged — `--json template` still returns the complete `template.list` response. This is a text-only rendering change under AST-017 FR11: the machine-readable response schema is the contract; text formatting is not.

  Trade-off: the grouped output still includes every template id (so `template <id>` works from a copy-paste), at the cost of ~21 KB. An even shorter summary (type + count only, no ids) would be ~500 bytes but would require a second step to discover any id. The current shape serves both human scanning and agent copy-paste without a round-trip.

- template: bare `template --type` no longer prints an empty group header
- A section read on a docs-tree namespace answers from the guide that has the section again, so `astryx docs layout side-panels` and the other layout section reads released in 0.6.6 work after the layout split. `docs(route, section)` returns the same `docs.detail.section` the guide's own section read returns, found by key, then by title, in `--dense` and `--zh` too. When no guide or more than one has the section, the read fails with `ERR_UNKNOWN_SECTION` and names the guides to read it from.
- `astryx search` ranks a component, hook, or template that a query word names above a doc that matched only by keyword, heading, or text. `font size` finds Text first again instead of a typography guide. A doc the query names, such as `font setup` or `migration`, or one whose title the query holds, such as `resizable side panels`, keeps its place. Result scores do not change; only the order between domains moves.
- `astryx search` finds a guide when the query is its route or title in the other number: `side panel` finds the side panels guide first again, and `header and footer` finds headers and footers. A section's heading still doesn't count as its topic's name, so `font size` keeps finding Text first.
- Fix comparison table category from "Table - Frozen Column" to "Table - Comparison"
  The category described an implementation detail (the frozen label column) instead of what the template is for. Builders searching by layout type now find it under Comparison.
- Template and build tell you what a scaffolded template needs that your project lacks.
  When `astryx template <name> <path>` scaffolds a file that imports packages your project does not have (e.g. `@heroicons/react`, `recharts`, `lucide-react`), the receipt now includes a ready-to-run install command with the project's package manager and version ranges from the CLI workspace. `astryx build` shows the same note on its start template.

  When a scaffolded template uses StyleX and the project has no compiler plugin configured, the receipt warns and points to `astryx docs styling-overview`. The agent-docs block no longer says "don't use xstyle" flat-out — it acknowledges that some templates need it and links the setup doc.

  `detectStylingSystem` now recognizes the official `@stylexjs/rollup-plugin`, `@stylexjs/webpack-plugin`, and `@stylexjs/nextjs-plugin` alongside the existing entries.

- `astryx theme build` prints one line per built theme, plus one line naming fonts the themes do not load. Before, every theme printed the same install example and font recipe, so a build of many themes printed the same blocks again and again. `--detail full` prints the install example and font recipe, once for a batch instead of once per theme; for one theme it prints what the default printed before. Only the text report changes: `--json` output, `--check`, exit codes and written files are unchanged.
- Wherever the CLI shows the `<Theme>` wrapper, it now also shows where `Theme` comes from: `import {Theme} from '@astryxdesign/core'`. This covers the `astryx init` next steps, `theme add` and `theme build` output, the doctor fix for an unimported theme module, `build` help, and the theme guides.
- `astryx theme add <slug> --import` names the npm package that owns the added theme, in its JSON envelope (`package`, directly after `type`) and in its text output, the same way other results about one artifact do. A local theme has no package, so its result has no `package`, and `theme remove` and `theme use` are unchanged.
  `astryx theme add --list` keeps its JSON. Its text now names `theme add <slug> --import` to use a theme and `theme eject <slug>` to fork one, instead of the deprecated copy form.

  `astryx doctor` adds a `theme-management` check, and focused `theme-*` checks once a project has a generated theme module.

- One-off commands in a classic Yarn (1.x) project use `npx @astryxdesign/cli …` instead of `yarn dlx`, which classic Yarn does not have

#### Documentation

- `astryx docs migration`, `internationalization`, `styling`, `styling-libraries`, `typography` and `tokens` still work and now list focused guides. Each section is also readable under its guide, for example `astryx docs tokens/tokens-spacing` or `astryx docs styling/tokens-and-setup stylex-setup`, and `astryx docs <topic> <section>` keeps working: every section key these topics had still opens the same section. `astryx docs tokens --depth all --detail full` prints every token table, and a `token-ref` to `tokens` keeps resolving through the guide that holds the table.
  Integrations: these six names are now docs-tree sections, not topics, so an integration doc that declares `extends` or `replaces` with one of them is reported as naming no topic, and its content no longer shows. To keep that content, ship it as your own topic under a new name, or as a guide in your package's own section (`astryx integration add doc <name> --parent <your-section>`). Topics that are still flat, such as `theme` or `color`, can still be extended or replaced.

  (#7184)

- `astryx docs layout` still works and now lists the focused guides. Each section is also readable under its guide, for example `astryx docs layout/side-panels` or `astryx docs layout/scaffold shell`, and `astryx docs layout <section>` keeps working.
  (#7125)
- `astryx docs layout` opens with its overview again, and `astryx docs author-a-theme` and `use-a-theme` restore guidance the theme split dropped: what a bad `extends` base does, how adaptation rules are validated, what `__built` means, the icon-registry specifier traps, `registerTheme`, and wiring built themes in development too.
  (#7204)
- Add a choose-a-path styling overview and restore the import-based workflow across the theme guides.
  (#7134)
- Split the theme documentation into focused guides for using and authoring themes, with a concise overview that points to both workflows.
  (#7141)

#### Other Changes

- A hint uses `npx astryx …` (or `pnpm exec`, `yarn`, `bunx`) only when the `astryx` bin is in `node_modules/.bin`, in the project or a folder above it. Otherwise it prints `npx @astryxdesign/cli …` (`pnpm dlx`, `yarn dlx`, `bunx`), as it already did when the CLI ran from an npx or dlx cache.
- A global install, or a workspace install used in a fresh package, used to print `npx astryx …`. The npm package named `astryx` is not this CLI, so following that hint fetched an unrelated package.
- `astryx blog` follows the same rule, and the incident console template names the scoped package.

  Classification: contract-restoring. JSON shapes are unchanged; only hint text changes, and projects with the CLI installed keep `npx astryx …`.

- deprecation `DEP-0006` / cleanup `CLN-0006` — `astryx layout` command group (`expand`, `check`, `grammar`)
- A check that needs the loaded project quotes the reason the CLI could not load it, instead of only "Skipped".
- The config check warns when astryx.config imports but the CLI cannot load the project from it. Before, it said the config loaded cleanly.
- Integration contributions name the integrations they checked; with none loaded, the check reports info and says there is nothing to check.
- The agent-docs check reads every file init can write (Hermes included) and looks in the project root as well as the working directory, so running doctor from a subfolder no longer reports that there are no agent docs.
- `astryx doctor integration validate` names a folder it cannot read and keeps checking. A declared root that is a file or that cannot be read is reported as `invalid_root` or `unreadable_root` instead of a raw error or a crash.

  Classification: contract-restoring. No check becomes stricter: every new finding is a warning or info, and the only exit-code change is that an unreadable folder outside every root no longer crashes validation.

- Whenever the CLI prints its scoped one-off form (it ran from an npx or dlx cache, or the `astryx` bin is not installed for the project), a Yarn project got `yarn dlx @astryxdesign/cli …`. On classic Yarn that command fails.
- Classic Yarn is read from the declared `packageManager` version, the `yarn.lock` header (`# yarn lockfile v1`), a committed `.yarnrc` (without `.yarnrc.yml`), or the runner. Yarn 2 and later keep `yarn dlx`.

  Classification: contract-restoring. JSON shapes are unchanged; only hint text changes.

#### Contributors

Thanks to everyone who contributed to this release:

- @ernestt
- @josephfarina

---

# 0.6.6

#### New Features

- Add a shared `upload` icon, and use it for FileInput's upload affordance instead of the directional `arrowUp`
  Themes draw `upload` through `icons.upload`, separately from `arrowUp`, so sort arrows and every other `arrowUp` use stay unchanged. Every bundled theme and theme template draws `upload` in its own icon style. FileInput keeps its icon size, placement, color, and accessibility in both modes; a theme with no `upload` artwork shows the default upload-into-tray glyph there.

  A complete `IconRegistry` may still omit `upload` in this release. The next minor makes it required, so add an `upload` entry to any registry you type as `IconRegistry`.

- Templates declare their `keywords`, and `build` tells a part of a page from a page by the components the project can use (#6805)
- `build` chooses where to start with a checked-in table of word weights blended with the page ranker
- `astryx docs <route> --depth <levels>` reads as far down the docs tree as you ask, from one doc to everything below it.
  `--depth 0` reads only the namespace you name, `--depth 1` adds the docs right below it (what a read without `--depth` shows), and `--depth all` goes to the bottom. With `--depth`, `--detail` sets how much of each doc below shows: `brief` (the default) is one line each, named by where it sits so you can open it, `compact` adds its sections, and `full` prints it whole. So `astryx docs cli --depth all` is a map of every CLI doc, and `astryx docs cli/integrations --depth all --detail full` prints the integration guides as one read. Where a read stops, a namespace says how many docs sit below it. `--json` returns the same tree as `docs.node`: each child carries its own `slots` while the read goes deeper, `childCount` where it stops, and its text at `compact` or `full`. `docs()` takes the same `depth` and `detail` options. Reads without `--depth` are unchanged.
- Point at `discover` where people look for things to add
  Nothing an agent reads named `discover`, so agents asked to find a theme searched the package registry instead. The agent block `astryx init` writes now lists `discover <words>` (integrations you could add, and the ones you have), `theme list` ends with `More themes in packages you could add: astryx discover theme`, and a text search ends with `More in packages you could add: astryx discover <query>` (except `--type hook`, since no integration adds hooks). JSON output is unchanged.
- `integration add theme --from <base>` forks an existing theme as the starting point instead of a blank scaffold. The new theme copies the base's source files — renamed and rewritten for the new slug — with no link back. Use `--from` when you want to change a lot; for a small change that stays linked, use `extends` in `defineTheme`.

#### Fixes

- Say when a command did nothing: `upgrade` reports `sourcePathFound`, the integration checks report `validated`.
  Two commands could legitimately do nothing and produce an envelope identical to a clean success. Both now carry the fact in a field of their own response instead of only in human text.

  `astryx upgrade` defaults `--path` to `./src`. A project laid out as `app/` (or a typo) skipped every code codemod and still reported exit 0, `filesChanged: 0`, `errors: []` and "Upgrade complete". The only warning was a log line `--json` suppresses by design. `upgrade.run` now carries `sourcePathFound`, and the human completion line names the directory it did not find.

  `astryx doctor integration validate|components|docs|templates` returned `{name: null, version: null, issues: []}` and exit 0 when no integration manifest was found — the same shape as a validated, healthy integration. All four envelopes now carry `validated`, false only when nothing was inspected.

- `astryx manifest --json` now takes each command's examples from its CommandDoc and its response types from the API function it wraps, so no example differs from the documented one and `upgrade` lists `upgrade.registry`, which `upgrade --registry --json` already emits.
- `astryx template <name> <path>` and `astryx layout expand` now say when they replaced Astryx demo media. The `template.copy` and `layout.expand` receipts carry `demoMediaReplaced`, the number of demo image and video references that became placeholders (one per reference, however many fixture paths its URL carries), and the text output names the file to update (when `layout expand` prints the code instead, the same line follows it as a comment, so the output is still valid TSX). Nothing about the copy itself changed.
- `astryx template <name>` and `template()` now return the same source that `astryx template <name> <path>` writes, and say how many Astryx demo media references they replaced. Demo images and videos that only Astryx's own previews serve are replaced the same way in both, so code copied from the printed source no longer points at media your project doesn't have. `template.show` gains `demoMediaReplaced` (0 when the template carried none); in text mode the count is stated on stderr so the printed source stays exact.
- A write that fails reports ERR_WRITE_FAILED instead of a raw Node errno.
  `astryx template` into an unwritable directory returned `{"error": "EACCES: permission denied, open '/home/you/project/readonly/x.tsx'", "code": "ERR_UNKNOWN"}`, and `swizzle` returned the `mkdir` equivalent. Two things were wrong: ERR_WRITE_FAILED is already in the frozen error registry for exactly this case, and the message carried an absolute host path where every other Astryx message names its target relative to the project.

  Both now throw ERR_WRITE_FAILED with the errno kept (it is the part that says what to fix) and the target named relative to the project. Nothing is left half-written: a `swizzle` that fails part-way removes the files it already copied and puts back any it replaced before it reports the error, and the message names any file it could not restore.

- When `discover --available` runs without a discover source, the CLI now
  explains what discover sources are and where to find Astryx packages on npm, instead of the misleading message that told users to add package names they had no way to find. The base `discover` with no integrations also gains a pointer to npm and the integrations docs.
- A package with a namespace doc or a placed guide needs `@astryxdesign/cli` 0.6.4, not 0.7.0.
  Published 0.6.4 reads an integration's docs tree: it lists the namespace and reads each guide placed in it. 0.6.3 rejects a namespace doc and hides every doc topic the package ships. `integration add doc --parent` wrote `"@astryxdesign/cli": ">=0.7.0"`, a range no released CLI satisfies, and `integration verify` failed a docs-tree package whose CLI peer started at 0.6.4. `integration add doc --parent` now writes `">=0.6.4"`, marked optional, and `integration verify` accepts it. A template that sets `replaces` or `keywords` still needs `">=0.7.0"`.
- `gap-report` fails when a listed integration cannot load, instead of reporting a clean result.
  An integration whose `astryx.integration` module throws on import or fails validation was left out of the handler set. With no other handler, the report fell through to the built-in GitHub fallback for Core: the command exited 0 with `consent_required`, printed nothing on stderr, and offered `--confirm-public` to file on Core's public tracker a report the integration might have been meant to receive.

  The unloadable integration now records a failed delivery in its config position, with the load error and the fix in its message. Like any handler, it turns the fallback off, so the report never goes to another package's tracker. The command exits 1, and a failed or partial report now prints each failed delivery on stderr as well as in the receipt.

- `astryx integration add theme <name> --from <base>` now adds the packages the copied theme files import to `dependencies`.
  A fork of a bundled theme such as `neutral` copies its `icons.tsx`, which imports `lucide-react`, but the package did not declare it. So `astryx theme build` on the fork failed with "Cannot find module 'lucide-react'", and an app that installed the package hit the same error. `--from` now adds each package the copied files import, at the range the bundled themes use. It leaves out Core and React, which every Astryx app already has, and anything the package already declares.
- `astryx integration pack` without `--check` now points only at `astryx integration verify`.
  It used to say "Pass --check to verify the integration tarball, or run `astryx integration verify`", which sent people to the deprecated spelling. It now says that `integration pack` is now `integration verify`, and that `npm pack` builds the tarball. The error code and exit code are unchanged, and `integration pack --check` still runs the same check as before.
- Search: differentiate all-word matches by total quality; index themes
  Within the all-words tier, every candidate whose strongest token hit was a keyword scored the same (e.g. 157), regardless of how the other query words matched. A doc matching both words by keyword outranked nothing, and `search "how to use a theme"` put API reference docs above the consumer theme guide.

  The bonus now uses the sum of ALL token scores instead of just the strongest, so a candidate matching every word by keyword outranks one matching keyword + prose. The `theme` doc also gains consumer-facing keywords so it surfaces for questions like "how to use a theme" and "how to apply a theme".

  Themes are now a search domain: bundled and integration-provided themes appear in results with their slug, displayName, package, and the `astryx theme add` command. `--type theme` filters to them. Like `--type doc`, it works outside an app, where an open search now covers the docs and themes. Search help, the manifest, and the API reference list the new domain and its result fields.

- Search ranks a theme's description as prose, not as keywords
  A word a theme shares with your query only through its description, such as `minimal`, `focus` or `content`, now ranks the theme like any other description instead of like a declared keyword, so it no longer lands above the components, hooks and docs that declare that word. A theme still comes first for its own slug or display name: `astryx search neutral` finds the Neutral theme first.
- A package that ships a theme or a doc section `id` needs `@astryxdesign/cli` 0.6.4, not 0.7.0.
  Published 0.6.4 reads typed theme descriptors and section ids; 0.6.3 rejects both and hides the package's themes or doc topics. The 0.6.5 notes said a stable CLI before 0.7.0 rejects them, so `integration add theme` wrote `"@astryxdesign/cli": ">=0.7.0"`, a range no released CLI satisfies, and `integration verify` failed a theme or section-id package whose CLI peer started at 0.6.4. `integration add theme` now writes `">=0.6.4"`, marked optional, and `integration verify` accepts it for themes and section ids. A template that sets `replaces` or `keywords` still needs `">=0.7.0"`.
- `theme build` resolves real icon imports from the selected theme instead of matching comment or string contents. Generated modules preserve named, aliased, default, and namespace registry imports, plus inherited icons with child overrides. Normal builds and `--check` reject unsupported inline registries with `ERR_THEME_INVALID` before generating or writing output. Move such a registry into its own module and import it into the theme file.
- `astryx theme build` in an app uses the app's installed `@astryxdesign/core`, and says to install Core when there is none.
  Run one-off with `npx @astryxdesign/cli`, it failed with "Build @astryxdesign/core first (e.g. `pnpm -F @astryxdesign/core build`)" even when the app had Core installed, because it looked for Core only next to the CLI. It now generates with the Core the project installed, the same Core the app's `<Theme>` runs on. In an app without Core, the error now says to install it (`npm install @astryxdesign/core`). The build command stays only for the Astryx repository itself. The error code (`ERR_CORE_NOT_FOUND`) is unchanged.

#### Other Changes

- `TemplateDoc` gains an optional `keywords` list: the ideas, domains, and other names a builder might use for what the template serves. `parseTemplate` validates it, discovery carries it from every template source, `astryx search` matches it as it matches a template's description, and `astryx build` ranks page templates on it. Each Core page template's closing list of ideas moved out of its `description` into `keywords`, so descriptions describe the layout.
- `build` starts a part of a page where it lives (`spec:AST-048` FR3), and the project's own components say what a part is: an idea whose head noun is a word of a component's name or keywords, Core's or an integration's, asks for a part, unless the noun names a family of page templates or the idea lists three or more pieces. A part starts from the base template of the family the idea names, else from the app shell; a change to an existing page or part (an idea whose "existing" names a page family or a component, such as "the existing table", and that does not ask for a new page) starts from the app shell. The start's reason says which case applies and why.
- A family's base template leads its family unless a variant matches two terms of its own; a base that cannot start on its own never displaces the variant that leads.

  Integration templates that set `keywords` need `@astryxdesign/cli` 0.7.0 or later. The template metadata object is strict, so a stable CLI before 0.7.0 rejects the field, drops that template, and hides the package's doc topics; only `template --list` and `search` print a warning. `integration verify` fails a package whose template sets `keywords` until it declares `@astryxdesign/cli >=0.7.0`, as it does for `replaces`.

- `api/build/kit/weights.mjs` scores each candidate start (the app shell and every ready page template) from the idea's stemmed words using the tables in `weights.json`, and blends those scores with the ranker's own. The blend decides the start of every whole page; a part or an edit starts where it did before, and the ranker's pick of a template the tables do not list stands. Without a weights file the ranker's pick stands. The response's shape is unchanged.

#### Contributors

Thanks to everyone who contributed to this release:

- @AstryxBot
- @cixzhang
- @jiunshinn
- @josephfarina
- @rubyycheung

---

# 0.6.5

#### New Features

- `astryx component` accepts several exact selectors in one call. The JSON response keeps one ordered row per selector, including missing and ambiguous components, and text mode prints every row before exiting nonzero when any lookup fails. The `component()` API accepts selector arrays and always returns `component.batch` for an array, including empty and one-item arrays. Batches accept up to 100 selectors and reject larger arrays before lookup. The public API also exports shared `BatchResponse` and `BatchRow` types for typed receipts.
- `astryx discover` browses integrations: the ones a project has and, through discover sources, the ones it could add, with every version and what each one adds. It searches every kind of item and filters with `--type`, `--installed`, `--available`, and `--limit`. A project sets a source as `discover` in `astryx.config`, and an integration exports one as a `discover` named export. Discover only reads: it prints the command that adds a package and never runs it. Existing `--json` fields keep their meaning. A free-text query now always lists its matches, even an exact component name, and `astryx discover <package>/<Name>` opens one.
- `astryx integration verify` is the new name of `astryx integration pack --check`.
  The check you run before publishing an integration now has a name that says what it does. `astryx integration verify` packs the package with npm, installs the tarball into a temporary app, and checks that the app sees the same components, templates, themes, docs, and codemods. It takes no flags. `astryx integration pack --check` still works as a deprecated alias: it runs the same check with the same output, JSON, and exit codes, prints a note that names `integration verify`, and shows as deprecated in help. It will be removed in a later release. The `integrationPackCheck()` API and its `integration.pack-check` JSON response do not change. With `--json`, a command group given an unknown subcommand now reports `ERR_UNKNOWN_SUBCOMMAND` and lists its subcommands, where it used to say JSON output is not supported.

#### Fixes

- Fix the CLI's topic docs and how they print.
- `astryx doctor` no longer reports an integration it could not check as absent or complete (#6619)
- `upgrade`'s `filesChanged` counts files, not (codemod, file) pairs (#6622)
  One source file that four codemods each changed was reported as four files changed, so `filesChanged` matched `transformsApplied` and the documented meaning, "Total files changed", was not true. The human summary said the same thing: "Found 4 changes across 4 files" for one file.

  `filesChanged` is now the count of distinct files. `transformsApplied` is unchanged: a code or config codemod counts once for each file it changed, and a project codemod counts once. A file that both a core codemod and an integration codemod changed counts once in `filesChanged`.

- A parse error prints the Astryx error format in text mode.
  `astryx theme list --lang zh-Hans` printed Commander's own line — `error: option '--lang <locale>' argument 'zh-Hans' is invalid…` — while every other CLI error prints `Error: …`. `--json` was already correct (`ERR_INVALID_LANG`), so the two modes agreed only on the exit code.

  Commander writes that line before any Astryx code runs, so the JSON shim — the one place that already sees every parse failure — now suppresses it and writes the Astryx line itself, from the same message, for both modes. Every parse failure is covered: unknown option, unknown command, missing argument, and an invalid value for a global option. `--help` and `--version` are untouched and still exit 0.

- The CLI reference now matches what the commands do. Every `--help` ends with the command's examples and a `More:` line that names its full docs page. Function docs show each parameter's default, mark required parameters, list the error codes each function throws, and use examples that run. The response-type list adds `help`, `version`, and `upgrade.registry`, and `astryx manifest` now lists `upgrade.registry` for `upgrade`. The `--zh`, `--dense`, `--lang`, and `--detail` descriptions name the commands they change, and command summaries say when to use each command. When `astryx template` refuses to overwrite a file, it now says to re-run with `--overwrite` (or `-f`). The `upgrade` command page (`astryx docs cli/commands/upgrade`) now explains which files codemods never edit, what happens when one of them needs a change, and how to regenerate it.
- `astryx integration pack --check` now checks the tarball when a `prepack`, `prepare`, or `postpack` script prints to stdout. Before, any lifecycle output made the check fail with "npm pack produced unparseable JSON output" before it looked at the tarball. A failing lifecycle script still fails the check, and its output stays in the `pack_failed` message.
- `astryx doctor integration docs` fails when a namespace doc or a placement fails, as its help says.
  Such a failure hides the doc from the docs tree, so it now exits 1 with an `invalid_doc_graph` error instead of a warning. A link that names no doc still only warns, since it prints as written. `doctor integration docs` and `doctor integration components` also no longer print an `[ok]` line after a check that failed.

  A mistyped subcommand under `doctor` now fails and lists the subcommands the group has: `astryx doctor integrations` used to run the project checks, and `astryx doctor integration bogus` exited 0 in text though it exited 1 with `--json`.

- A package that ships a theme, or a doc section with an `id`, now declares the CLI that can read it.
  A stable CLI before 0.7.0 rejects both: it cannot read the typed theme descriptors that `astryx integration add theme` writes, and it rejects a section `id`. Either way it hides the package's themes or doc topics with no warning. `astryx integration add theme` now adds `"@astryxdesign/cli": ">=0.7.0"` to `peerDependencies`, marked optional, and `astryx integration verify` fails with `themes_need_cli` or `section_ids_need_cli` when a package needs that peer range and does not declare it.
- `astryx integration verify` resolves every public import in the packed package, not in your source folder.
  Before, its temporary app resolved your package's own name through the source `package.json`, so an `exports` target left out of the tarball still passed. It now fails with `component_export_missing`, as an app that installs the tarball would.
- `astryx theme add` and `astryx theme build` now undo a failed write completely. Before, when one file failed to write after others were written, the written files kept their new content. Now every replaced file gets its previous content back, every new file is removed, and the error names any file that could not be restored. Both commands also refuse to replace a destination that is a symbolic link. (#6852)

#### Other Changes

- A code block's label now prints above the block instead of as a `// label` line inside it, so copied bash, CSS, JSON, and HTML stay valid. Table cells escape `|`, so a union type stays in one column.
- `astryx search dark mode` searches for both words; it used to drop every word after the first. A result that matches every word of a query, one of them by name or keyword, now outranks one that matches only some, and a section whose title or heading holds the whole query ranks near the top. Topics can declare search `keywords`, now a documented ReferenceDoc field, and a namespace's `keywords` now count too. A query keeps its phrase when common words such as `make`, `build`, or `an` drop out, so `astryx search make an integration` finds the integration guides, a plural of a doc's name matches it, one step below the exact name, and a component's name typed as words, such as `command palette`, finds the component. Outside an app, where `@astryxdesign/core` is not installed, `astryx search` searches the docs instead of failing, and says so; `--type component`, `hook`, or `template` still needs Core.
- Snippets that failed when copied now work: StyleX token imports, the `fr-FR.json` locale path, Tailwind `rounded-lg`, `--color-background-muted`, icon and color values, and the Cursor rule path.
- Claims that did not match the code are corrected: the 30 shipped locales and how RTL mirroring works, what `astryx init` writes, `--detail brief` for a shorter read, the Neutral and Matcha fonts, the components that need anchor positioning, `gap` steps, Card's radius, and the Next.js StyleX example. The deprecated bare classes are still emitted and will be removed in a later release.
- `astryx docs tokens` lists all 258 tokens, adding the data visualization and syntax groups, and shows both halves of every `light-dark()` value.
- Long sections are split, vague titles renamed, and the `--dense` and Chinese versions no longer drop blocks. Eleven long section keys are shorter, such as `astryx docs styling stylex-setup`, and every old key still resolves. An integration section that extends a Core topic by a section's old title still replaces that section.
- `astryx integration add codemod --to` help says it takes the Core version whose upgrade runs the codemod.
- The agent block that `astryx init` writes now says `upgrade --from <old version> --apply`; `upgrade --apply` alone stops with "Missing required --from".
- The contributor-only sections, on adding a semantic icon and on strings and text direction inside components, moved to CONTRIBUTING.md.
- An installed dependency whose `astryx.integration.*` manifest cannot be loaded is still kept out of the loaded set, but `implicit-integrations` now names it and says it contributes nothing. Before, doctor said that no installed dependency ships a manifest. The check stays informational, and `astryx doctor integration validate <package>` gives the details.
- `implicit-integrations` lists only the roots that exist on disk. A package whose declared roots are missing is reported as contributing nothing, with the missing roots named. Before, it listed every root the manifest declared.
- `provider-identity` says how many loaded integrations it could not read, instead of counting only the readable ones.

#### Contributors

Thanks to everyone who contributed to this release:

- @josephfarina

---

# 0.6.4

#### New Features

- Add a reusable Item document tabs block template (#6652)
- `astryx build "<idea>"` now always names a page template to start from (#6707).
  A page template carries the page frame, the spacing, and the section rhythm. A page composed from components has to rediscover them. Before, the kit recommended scaffolding only when a template matched almost by name. Other ideas got "use it as a layout reference", which pointed at a 35-line `--skeleton`, and an idea that no template matched got "frame with AppShell, then compose". Now:
- Link docs by identity, and let integrations add to the docs tree. (#6626)
  A doc links another doc inside its text with `{@link [<provider>:]<kind>:<name>}`, such as `{@link command:doctor}`. The CLI prints each link as the `astryx docs` command that opens the doc; a link that names no doc prints as written, and `astryx doctor` warns on it. An older CLI prints the link as plain text. `reference`, `workflow`, and `collection` blocks stay in namespace docs.

  An integration can ship namespace docs and place its guides in them. They show up in `astryx docs` beside `cli`, with the same moves, links, and search, and `astryx doctor integration docs` checks them before the package ships. A namespace doc in an integration's docs directory no longer fails to load, and `astryx integration add doc <name> --parent <namespace>` writes a placed guide. A CLI release that does not read the docs tree can hide every doc topic of a package that ships a namespace doc or a placed guide, with nothing saying why, so `--parent` declares the CLI that reads them as an optional `@astryxdesign/cli` peer, and `astryx integration pack --check` fails a package that ships either one without it.

  The CLI keeps its own routes: an integration's flat topic or namespace named `cli`, `unorganized`, or after one of the CLI's topics (compared without case) is withdrawn from the tree, its name opens the CLI's doc, and doctor warns.

  Every flat topic now sits in `astryx docs unorganized`, under its own name, so every doc has a place in the tree with a way up and across. Search hits for a topic name the level and the package that wrote it.

  New guide: `astryx docs cli/writing-docs`.

- In text, `astryx docs <topic>` lists the topic's sections when it has more than one. (#6626)
  Read one with `astryx docs <topic> <section>`, or print the whole topic with `--full`. `--dense` still prints the whole dense doc, so the agent bootstrap in AGENTS.md reads the same as before. The JSON contract is unchanged: `astryx docs <topic> --json` and `docs(topic)` in `@astryxdesign/cli/api` still return the whole topic (`docs.detail`), and `--index` returns its section list.
- Read the CLI's docs as a tree, one level at a time. (#6498, #6626)
  `astryx docs cli` lists the CLI's guides and reference. `astryx docs cli/commands` lists every command, `astryx docs cli/api` lists the API's functions, schemas, and enums, and a route such as `astryx docs cli/api/functions/search` prints one doc. `--json` returns `docs.node` for a namespace or typed doc, identified by its doc identity (a generated level has `id: null`). The text of `astryx docs` lists the docs tree's namespaces first; its `--json` keeps `data` as the topic list and adds them in `meta.namespaces`. Every command, API function, schema, and enum doc the CLI ships declares the `namespace` that reads it: `astryx doctor` fails when one has none or names one nothing reads, and warns when one has no route in the tree.
- Export `themeTemplate()` from `@astryxdesign/cli/api`, matching the documented API behind `astryx theme template`. (#6626)
- The integration guide moved from `astryx docs cli-integrations` to `astryx docs cli/integrations`. (#6626)
  Documentation names and routes are mutable catalog data under `spec:AST-017/FR45`, so the move is nonbreaking and needs no compatibility alias. The guide now lives in the CLI's docs tree, under `cli`. Use `astryx docs cli/integrations`, including section reads such as `astryx docs cli/integrations components`. The old name no longer resolves. The docsite page stays at `/docs/cli-integrations`.
- `astryx search` finds the smallest doc part that answers. (#6626)
  A doc hit is now one section (`astryx docs cli/integrations codemods`), one docs-tree route (`astryx docs cli/api/functions/assert-response`), or a topic's index, never a whole-topic read. Typed docs match by their own name and by the identifiers they define, such as error codes. `astryx search --type doc` works without `@astryxdesign/core`. `astryx docs` lists the docs tree first, and a namespace shows each child's own name when its route name differs.

  Every docs read now ends with its moves: `Up`, plus `Previous` and `Next` for a section or a docs-tree page, and `Related` for a typed doc (its command or API function, and its related docs). `--json` carries them as `links` (`up`, `previous`, `next`, `related`). Each search hit carries `parent`, the command that opens the level above it, and a docs-tree hit carries `package`.

- A doc section can include another doc instead of copying it. Put a `reference` block in the section, such as `{type: 'reference', target: '@astryxdesign/cli:schema:integration', projection: {fields: ['components', 'docs']}}`, and `astryx docs` prints those two fields of the integration manifest from the schema's own doc, then the command that opens it.
  A reference block includes a schema, command, function, or enum doc. `projection.fields` keeps only the named fields of a schema, and `presentation` is `full` (the default), `compact` (no code blocks), or `summary`. A reference to any other doc shows its title and summary. A read inlines the block, so `--json` still returns only the stable block kinds. `astryx doctor integration docs` fails when a block names a doc, field, or projection it cannot include, and a read marks what is missing. Links also find the CLI's authoring schemas now: `schema:integration` opens `astryx docs authoring integration`.
- `astryx doctor` now fails when a type that `@astryxdesign/cli/authoring` exports has no doc in `astryx docs authoring`, or when a listed self-doc documents nothing the package exports. The message names each type, the module that declares it, and the self-doc that is missing or not listed. (#6498)
- Add `presentation` to DateInput, DateTimeInput, and TimeInput (`spec:AST-043`) (#6628).
  `presentation` names every picker surface, distinguishing Astryx's desktop surface, Astryx's bottom sheet (including a new TimeInput sheet), the browser/OS picker, and — for TimeInput only — a plain typed field. DateInput and DateTimeInput accept five values: `'popover' | 'bottom-sheet' | 'native' | 'adaptive-bottom-sheet' | 'adaptive-native'` (default). TimeInput accepts those five plus `'text-input'`, the typed field on every pointer, because that is the surface its released `nativePicker="never"` already was. `presentation="native"` always shows native; `adaptive-native` keeps the released native fallbacks.

  `nativePicker` is deprecated but keeps working exactly as released (`touch`→`adaptive-native`, `always`→`native`, `never`→`adaptive-bottom-sheet`, or `text-input` for TimeInput); `presentation` wins when both are set. `astryx upgrade` ships `migrate-native-picker-to-presentation` for static callsites.

- Prepare integration template replacement before its supported package boundary. (#6265, #6626)
  An integration template can set `replaces` in its own metadata to a Core template id. Unqualified template lookup and discovery surfaces use a valid replacement, while `--package @astryxdesign/core` still selects the original. Missing targets, type mismatches, a declaration on a template that cannot be used, and duplicate declarations fail closed and are reported by `astryx doctor integration templates`.

  When separate configured packages replace one target, the package configured later wins with a warning. Explicitly configured packages always precede autolinked ones. When only autolinked packages conflict, the dependency listed later in package.json wins with a warning and the CLI recommends explicit configuration. Invalid contribution kinds remain reportable without hiding other valid kinds, and invalid template or component files do not hide valid siblings.

  This implementation may ship in final 0.6.x for forward validation, but an integration package that uses `replaces` must still require `@astryxdesign/cli >=0.7.0`. Earlier CLIs reject the field and withhold that package's templates and doc topics. No supported latest-stable integration consumer can enter the replacement path yet, so replacement selection and its mutable catalog results are patch-compatible pre-publication behavior.

  Existing same-id `IntegrationTemplateConflict` responses keep their released warning-only shape on 0.6.x. The optional `TemplateListEntry.replaces` field is additive; at or after 0.7.0, replacement-specific `relationship`, `replaces`, and `severity: 'info'` conflict fields require one deliberate projection update across runtime, types, generated reference, terminal output, documentation, and tests. A package-version bump alone leaves the warning-only shape unchanged.

- Add ScrollableArea block templates so the component page has worked examples. All six share one content vocabulary — a workspace file panel of labelled sections holding a two-column grid of muted cards — so the only thing that changes between examples is the behavior each one demonstrates: block-axis scrolling, `axis="inline"` with `isFullBleed`, sticky section labels, `axis="both"`, sticky pass-through against `stickyContainment="always"`, and `overscroll` allow against contain. (#6490)
- Add the Tree Table page template (#6195)
  A hierarchical table where every parent row is derived from its children, shown as a code repository: folders roll up the newest commit beneath them, columns resize, sorting is scoped to siblings so branches never interleave, arrow keys walk the tree per the APG treegrid pattern, and search prunes to the branches that match. Selecting a folder drives a header trail that folds its middle into a menu once the path outgrows the bar. Supporting repository chrome — header actions, an About sidebar and a README rendered with `Markdown` — puts the table in the context that makes its rollups legible.
- Add opt-in typed documentation graph contracts and stable provider-aware documentation identity without breaking existing topic readers. (#6471)
  New `NamespaceDoc`, `AuthoredDocKind`, provider identity types, semantic graph-block types, section IDs, `astryx docs <topic> --index`, and section-key reads are additive. The public `ReferenceContentBlock` union keeps its 0.6.x members so existing exhaustive renderers continue to compile; graph-only `workflow`, `collection`, and `reference` blocks are exported separately as `GraphContentBlock` and are accepted by `NamespaceDoc`.

  Existing authored topics continue to load and read as before. Duplicate title-derived keys receive deterministic suffixed index keys, titles with no Latin letters or digits receive deterministic `section-N` keys, ambiguous title queries keep returning the first match, and legacy extension sections without IDs continue to merge by exact title. Explicit new section IDs remain validated. The new progressive-disclosure Doctor audit reports compatibility issues as warnings, and existing full-topic text output keeps its 0.6.x formatting.

  Every doc section can opt into a stable `id`. `astryx docs <topic> --index` (`docs(topic, undefined, {index: true})`) returns the topic's section index (`docs.index`), and `astryx docs <topic> <key>` reads one section. A topic read still returns the whole doc. `astryx docs authoring` documents every authoring schema, one section each.

  Provider-ID conflicts are now visible instead of being dropped without a word: the package being authored wins, otherwise the first-loaded provider wins, and every command plus `astryx doctor` reports the set-aside package.

- Integration themes use typed same-stem descriptors, not a central catalog. (#6498)
  A themes root no longer holds `manifest.json`, the theme catalog that `astryx integration add theme` wrote in 0.6 (stable since 0.6.3). Each theme carries a strongly typed `<name>Theme.doc.mjs` beside its source instead, and a themes root that still holds the catalog is refused. To migrate an integration package, run `astryx upgrade --from 0.6.3 --path . --apply` in it: a codemod writes each theme's descriptor from its catalog entry and removes the catalog. Until a package is migrated, apps that install it get none of its themes or doc topics.

  Theme discovery reads descriptors and checks integration theme sources without executing them, and `theme add` copies an integration theme's complete directory. `astryx doctor integration validate` warns about a folder in the themes root that looks like a theme but is not read as one. New component, topic, and template scaffolds also emit type-annotated `.doc.mjs`; released `.template.*` inputs remain readable.

#### Fixes

- The published authoring types now type-check in projects that use `"moduleResolution": "nodenext"` or have no Node types installed. Relative imports inside them name their files, and `PostCodemodCommand`'s `env` no longer needs Node's types. (#6492)
- Drop `gpt-tokenizer` from the CLI's peer dependencies. Nothing in the CLI imports it, but npm and pnpm install a required peer by default, so every install of the CLI pulled in about 53 MB it never used. (#6508)
- `astryx init`, `astryx init --remove-agents` and `astryx upgrade --apply` no longer edit or delete a file outside the project through an agent file or `.claude/` directory that is a symlink pointing there. Init reports a path-safety error for that file and exits 1, `init --remove-agents` fails with `ERR_PATH_TRAVERSAL` and exits 1 instead of reporting the block removed, and upgrade reports the refresh as failed, before any file is written. (#6524)
- The text output of `astryx component` and `astryx hook` no longer adds non-ASCII characters of its own. Empty table cells show `-` instead of an em dash, the brief view's import hint reads `<- from`, derived properties and deprecated targets use `->`, and brief prop and parameter lists are separated by commas instead of middle dots. Text that comes from the docs themselves is unchanged. (#6553)
- `astryx init` human output is now plain ASCII, including the per-file lines `init --remove-agents` prints. Status lines use `[ok]` instead of a check glyph, and dashes, bullets and arrows print as `-` and `->`. `--json` output is unchanged. (#6540)
- `astryx upgrade` human output is now plain ASCII. Progress and codemod lines use `[ok]`, `!` and `!!` instead of check, warning and cross glyphs, and dashes and arrows print as `-` and `->`, including in codemod titles listed by `--list`. `--json` output is unchanged. (#6539)
- Commands that write files no longer follow a dangling symlink out of the project: when the target, or a directory on the way to it, links to a missing path outside the project root, the command now fails with `ERR_PATH_TRAVERSAL` instead of creating the file there. A symlink escape reported by `integration add` now carries `ERR_PATH_TRAVERSAL` too, instead of an unregistered `PATH_TRAVERSAL` code. (#6513)
- `astryx blog` text output now labels the feed URL `feedUrl`, matching its `--json` key, and prints every post field the JSON carries: the list adds each post's description, date, authors and link, and a post read adds its metadata above the body. (#6526)
- `astryx build "<idea>"` no longer prints a `setup:` line in its text output. That field existed only in the text, never in the `--json` kit, so the two views disagreed. The same guidance is in the no-query `astryx build` playbook. (#6570)
- `astryx build --json` with no query, and `build()` with no query, now return the playbook itself — a title, the ordered steps with their commands, the on-system rules, and related lookups — instead of only `{playbook: true}`. The terminal output is rendered from the same data, and `playbook: true` is still there. (#6566)
- The programmatic `component()` API now rejects `detail` and `lang` values that the `astryx component` command rejects, with the same codes (`ERR_INVALID_DETAIL`, `ERR_INVALID_LANG`). It used to fall back silently: an unknown `detail` returned the name list, and an unknown `lang` returned English. (#6576)
- The programmatic `component(name, {cwd, blocks: true})` now discovers blocks from the `cwd` it is given, as every other slice already does. It used to read blocks from the process working directory, so a caller pointing at another project got that directory's blocks, or none. (#6580)
- `parentDoc` in `astryx component <Name> --json` is now a documented part of the `component.detail` response. The field appears when a sub-component such as `HStack` is scoped out of its parent's doc. It is in the published response type and the `component()` reference, and the text output now shows it as `parentDoc: Stack`. (#6575)
- `astryx component <Name>` no longer prints a "Related block templates" list that `--json` never carried, so the text output shows only what the JSON result holds. The same blocks are still listed by `astryx component <Name> --blocks`, in text and JSON. (#6574)
- `astryx component <Name> --package <pkg>` no longer ignores `--source` and `--blocks` when the package publishes docs through the legacy `astryx.docs` field. `--source` now fails with `ERR_NO_SOURCE`, and `--blocks` returns the blocks, the same answers as without `--package`. Before, both flags silently returned the plain doc. (#6577)
- `astryx component --list` now prints the right import for components from packages that publish docs through the legacy `astryx.docs` field. It used to show an `@astryxdesign/core` path for them. The JSON list entries now carry the same `import` that `astryx component <Name>` reports for each of those components. (#6578)
- `astryx integration add component <Name>` now refuses with `ERR_FILE_EXISTS` when a component doc anywhere under the components root already uses that name, for example `components/<Name>/<Name>.doc.mjs`. Before, it wrote a second `<Name>` beside the first and reported success, and `astryx component <Name>` then showed the new scaffold instead of the authored component. `--dry-run` refuses the same way. (#6557)
- The `debug` entry of the `AstryxConfig` type and of `astryx docs authoring config` now states how handlers from integrations combine with the app's own: the app's runs first, then each integration's in load order, a handler that throws is skipped without affecting the others or the command, and `{"astryx": {"inheritDebug": false}}` refuses inherited handlers. The type no longer claims that leaving `debug` out records nothing. (#6514)
- The text output of `astryx discover` (the package list and a single package) now shows every field its `--json` entry carries, including `category` and `version`, which only the JSON used to include. (#6521)
- `astryx doctor` text output now uses the same field names as `--json`: each check prints its `id` and `label` (the label was shown as `check`, and the id was missing), and the summary prints `pass`, `warn`, `fail`, and `info` under a `summary` heading instead of a prose line. (#6516)
- `astryx template --help` and `astryx layout expand --help` now explain how the path argument is read: a path ending in a source-file extension is the file to write, anything else is a directory that gets `page.tsx`, the block's file name, or `<Name>.tsx`. `layout expand` and `layout check` also document `-` for stdin and that `--file` wins over the argument, and `--overwrite` no longer mentions a prompt the CLI never shows. (#6571)
- The CLI no longer reads or sets the `ASTRYX_LATEST_VERSION` environment variable. Its only effect was an `FYI: A newer version of @astryxdesign/core ...` line on stderr after `astryx component` and `astryx docs`, and a CLI run cannot set a variable for later runs, so the line appeared only when the variable was set by hand. Commands now print the same output whether or not it is set. (#6554)
- The `@astryxdesign/cli/json` types now declare `apiVersion` on `CLIError`, `CLIUnsupportedError`, and the success envelope that `parseResponse` and `assertResponse` return, matching what every `--json` envelope carries. Code that constructs a `CLIError` value by hand, for example in a test double, now has to include `apiVersion`. (#6555)
- `astryx <command> --help` (including `astryx manifest --help`) now ends with the command's documented exit codes, and each command in `astryx manifest --json` carries them as `exitCodes: [{code, when}]`. `astryx doctor --help` shows them once, and the `layout` and `discover` exit codes now say when they apply: bare `astryx layout` exits 1, and a blank `discover` query exits 1 when packages are discovered. (#6586)
- `astryx gap-report --help` and `astryx manifest` now describe the `component` argument and say that `component`, `--category`, and `--reason` are required unless `--list-categories` is set, with the character limits the command enforces. The manifest listed the argument with an empty description, and nothing said these inputs were required. (#6518)
- `astryx theme build` now fails with `ERR_THEME_INVALID`, before writing anything, when a custom Heading type's standalone rule has no usable declaration: every value is blank, or the compiler dropped every declaration. It previously wrote CSS with an empty or missing rule and still added the type to the generated `HeadingTypeMap`. (#6547)
- With `--json`, `astryx help <unknown-command>` and a command group run without a subcommand (such as `astryx layout --json`) now return an error envelope, with `ERR_UNKNOWN_COMMAND` or `ERR_MISSING_ARGUMENT`, instead of a success-shaped help envelope. Both still exit 1, as they do without `--json`. (#6550)
- `astryx hook <name>` text output no longer lists block templates that the `--json` envelope does not carry. It now names the related components and points to `astryx component <name> --blocks`, which returns their block templates as JSON. (#6537)
- `"astryx": {"inheritDebug": false}` in package.json now also refuses the `debug` handler of an autolinked integration in a project that has no `astryx.config`. The setting used to be read only beside a config file, so without one those handlers still received every run. (#6520)
- Programmatic `init()` now confines the starter template it scaffolds with `templateName` to the project directory. A `src` symlink that points outside the project is rejected with `ERR_PATH_TRAVERSAL` before anything is written. (#6538)
- `astryx integration add --help` and the CLI manifest now define every control: the name format for each kind, that `--type` defaults to `page`, that `--to` takes an exact semver version, and that `--replaces` and `--extends` can't be combined. The `integrationAdd()` docs say the same. Behavior is unchanged. (#6558)
- One integration that cannot load at all (a configured package that is not installed, has no manifest or more than one, or a package being authored with two manifests) no longer takes every other integration down with it. It is reported as that package's integration issue, the other integrations keep contributing, and `astryx discover` no longer exits 1 because of it. (#6519)
- One integration whose templates root cannot be read, for example a manifest that points `templates` at a file, no longer makes `astryx template` fail with a raw filesystem error. That package's templates are skipped with the usual one-line warning, and core templates and every other integration's templates still list and resolve. (#6523)
- The `--json` option's description in `astryx --help`, in the manifest, and in the CLI README now lists every envelope field: `{ apiVersion, type, data, meta? }` on success and `{ apiVersion, error, code, suggestions? }` on failure. It used to omit `apiVersion`, `meta`, and the stable `code` field that consumers branch on. (#6549)
- `astryx layout expand <expr> <dir>` now refuses the write, with `ERR_PATH_TRAVERSAL`, when `<dir>/<Name>.tsx` is a symlink to an existing file outside the project. Before, only the directory was checked, so the generated TSX replaced the file the link pointed at. (#6564)
- `astryx layout expand <expr> <path>` now labels its text fields `componentsUsed` and `todos`, the keys the `--json` output uses, instead of `Components` and `TODOs`. (#6569)
- `astryx layout expand` now caps every `*N` repeat at 10000 copies. Repeated table rows skipped the cap, and a huge count on any element was still walked copy by copy before the cap applied, so `B*999999999` could hang or run out of memory. `astryx layout grammar` now states the cap. (#6565)
- `astryx layout check -` and `astryx layout expand -` now stop reading stdin at 5 MB and fail with `ERR_INVALID_ARGUMENT`, the same size cap `--file` already had. Before, an endless or oversized pipe was buffered whole until memory ran out. (#6572)
- When a command's module fails to load, running that command with `--json` now prints one error envelope (`ERR_UNKNOWN`, with the load error in the message) instead of printing nothing to stdout. Without `--json` the error is still printed to stderr, and the exit code is still 1 in both modes. (#6551)
- `astryx manifest` without `--json` now labels each command's name `name:`, the same key the JSON manifest uses, instead of `command:`. (#6552)
- `astryx theme build --out` now reports a path that leaves the working directory with `ERR_PATH_TRAVERSAL`, and an output directory it cannot create with `ERR_WRITE_FAILED`, instead of unregistered codes such as `PATH_TRAVERSAL` or `EEXIST`. The programmatic `themeBuild()` throws the same codes as an `AstryxError`. (#6543)
- `astryx theme palette generate` now writes candidate JSON in the canonical form the `astryx-oklch-v1` recipe pins, so a JSON candidate and the `candidateSha256` in its receipt match the recipe's reference fixtures byte for byte. Before, the `stops` array was printed on one line, which changed the bytes and the digest of every JSON candidate. (#6531)
- `astryx theme palette generate` and `generateTonalPalette()` now reject a `neutralProfile` the recipe does not define, even when the request has no neutral family. Before, such a request produced a candidate whose receipt recorded the unknown profile as part of the normalized request. (#6534)
- `astryx theme palette generate` now reports an output or preview path it cannot use, such as one below a regular file, with the stable `ERR_WRITE_FAILED` code. Before, the `--json` error envelope carried the raw system error name, such as `ENOTDIR`, as its `code`. (#6533)
- `--json` output is one envelope again when `astryx.config` or an integration manifest prints while it loads. Anything a project module writes to stdout during its load now goes to stderr. (#6581)
- A `--json` error envelope's `code` is now always one of the documented error codes. A failure that carried a Node.js system code, such as `ENOTDIR` or `EACCES` from a failed write, used to put that code in the envelope; it now reports `ERR_UNKNOWN`, and the original message is unchanged. (#6548)
- The 0.6 `rename-resizable-pixel-bounds` upgrade codemod now also renames `minSizePx`/`maxSizePx` in static inline `useResizable` configurations called through a namespace import (`Astryx.useResizable({...})`) or wrapped in `as const` or `satisfies`. These were left unchanged before. (#6541)
- `astryx search` now fails with `ERR_CORE_NOT_FOUND`, like `component` and `hook`, when `@astryxdesign/core` cannot be found, instead of the catch-all `ERR_UNKNOWN`. (#6525)
- `astryx search --limit` now refuses a value that is not a positive integer, such as `1.5` or `5abc`, with `ERR_INVALID_ARGUMENT` and exit 1, as `search({limit})` already did, instead of silently truncating it. (#6528)
- `astryx search` text output now prints every field its `--json` results carry: `title` for doc results and `kind` for template results were missing. The `--verbose` help now says what it adds: each result's score and match reason. (#6527)
- `search()` from `@astryxdesign/cli/api` is now declared to return `SearchResponse`, as its docs say, so TypeScript sees each result's `SearchResultEntry` fields instead of a bare `object`. (#6529)
- `astryx swizzle` no longer writes outside the project through a symlink in the output folder. When the component folder or one of its files is a symlink that points outside the project, the command now fails with `ERR_PATH_TRAVERSAL` before it writes anything. (#6573)
- The `astryx swizzle --overwrite` help and manifest entry no longer says it skips a prompt. The CLI never prompts. The entry now says that without `--overwrite`, existing files fail the command with `ERR_FILE_EXISTS` and nothing is written. (#6579)
- `astryx template <name> <dir>` now refuses the write, with `ERR_PATH_TRAVERSAL`, when the file it would create in that directory is a symlink to an existing file outside the project. Before, only the directory was checked, so `--overwrite` followed the link and replaced the file it pointed at. (#6563)
- `astryx template <name> <path>` and `astryx layout expand` now replace demo media only when a path starts with `/template-assets/`, so third-party URLs and product paths that merely contain that text are left alone. Demo media in a subdirectory, with a query string, or with characters such as `@` in the file name is now replaced whole instead of being corrupted or left behind. A demo media reference that cannot be replaced safely, such as one with no file suffix or one built at runtime, now fails the copy with its path. (#6596)
- `astryx theme add` now copies every file a theme catalog lists byte for byte, so a theme that ships a font or an image arrives intact. Before, it decoded each file as text, which corrupted any file that was not UTF-8. (#6530)
- `astryx theme add` no longer writes through a symlink that already sits at the temporary name it stages each file under. A link that leads outside the project now fails with `ERR_PATH_TRAVERSAL`, and any other entry at that name fails the copy instead of being overwritten. (#6535)
- `astryx theme build` and `astryx theme palette generate` now print plain ASCII: status lines use `[ok]`, `[warn]`, `[error]`, `[fail]`, and `[note]` markers instead of symbol glyphs, and theme build messages drop em dashes and ellipses. The reworded font and private-variable messages also appear in the `--json` receipt's `notices` and `warnings`. Generated theme files are unchanged. (#6544)
- `astryx theme build --help` and the capability manifest now state each flag's default and which flag combinations are refused (`--family` with `--out` or `--watch`, `--check` with `--watch`, `--watch` with `--json`, `--out` with more than one file), with the error code the refusal returns. (#6546)
- The `themeBuild()` reference and the `theme.build` response-type entry (and the CLI README table generated from it) now document every field of the receipt by name, including `notices`, the advisories (such as a font the theme names but does not load) that had no documentation. (#6545)
- `astryx theme template` now reports a file it cannot write with the stable `ERR_WRITE_FAILED` code. Before, the `--json` error envelope carried the raw system error name, such as `EEXIST` or `EISDIR`, as its `code`. (#6532)
- `astryx upgrade --json` now prints exactly one JSON envelope when a post-codemod hook prints output. Anything a hook's `buildCommand` writes goes to stderr, so stdout carries only the result. (#6536)
- The published `UpgradeListEntry` type now declares `optional`, the boolean every `astryx upgrade --list --json` entry already carries, so typed callers can read it without a cast. (#6542)
- `astryx doctor integration validate`, `templates`, `components`, and `docs` now show the `invalid_package_json` error when a local integration's package.json can't be parsed. Before, the text output said no `astryx.integration.*` file was found and hid the error, because the JSON reported a null `name`, which means no manifest. In that case `data.name` is now `(local package)`. (#6559)
- `astryx docs authoring` now says which docs-graph features are not built yet: the `placement`, `aliases` and `audience` fields, the workflow, collection and reference blocks, namespace docs, and the artifact, doc and instance identities. It had described them as working, but a topic that uses them fails to load. A namespace doc in an integration's docs directory now fails with a message that names it, instead of reporting missing topic fields. (#6492)
- `astryx doctor integration validate` now ends each finding about a misplaced contribution, a stray codemod file, a mis-named codemod folder, a component doc without its source, or a component source without a doc with a fix that works when followed as written: where to move the file and the manifest line to add, the version folder a codemod belongs in, or the file to add. Codemod files are named by their path inside the package instead of an absolute path. A hidden component doc no longer draws the missing-doc warning, and a codemods root at the package root no longer reports the manifest as a stray codemod. (#6498)
- An integration topic that `extends` another no longer renames it. `astryx docs theme` with an extension installed used to print the extension's own title and description; the topic now keeps its own, and the extension only adds or replaces sections. A topic that `replaces` another still renames it. (#6498)
- Use extensionless subpath specifiers for generated integration imports (#6288)
  `integrationAddComponent` and `integrationAddTemplate` now emit extensionless public import specifiers (`@pkg/components/MyWidget` instead of `@pkg/components/MyWidget.tsx`) and map them to source files through the package `exports` field. Consumer imports no longer expose the package's source extension or require `allowImportingTsExtensions`.

  `integrationPackCheck` now rejects public specifiers ending in `.tsx` or `.ts` and validates each exact import from the packed artifact through Node's package resolver. Packages without a usable public export fail the check, and the result does not depend on project-local TypeScript.

- Make every command's text output match its --json data (#6616)
  `upgrade --list` text now renders each codemod from the JSON result (name, title, version, optional) instead of the API logger, with no `(undefined)` rows. `theme targets` prints one line per target via the formatter kit's inline layout and now shows className. `docs` list shows the package field. A manifest-driven parity test covers the commands this PR fixes and catches future regressions in the same family; commands with known deferred divergences are covered by envelope and exit-code checks and have allowlist entries that explain the gap.
- Correct the palette authoring types. `TonalPaletteCandidate`'s description had landed on `TonalPaletteAnchor`, so the generated `.d.ts` documented the wrong type and left the candidate bare. `TonalPaletteFamilyInput` — the type an author writes by hand — had no property descriptions, and `neutralProfile` never said what its four values do. (#6168)
  [fix] Give the generation receipt a real type. `generationReceipt` was `Record<string, unknown>`; it is now `TonalPaletteGenerationReceipt`, with `TonalPaletteRampDiagnostics`, `TonalPaletteCoordinationDiagnostics`, and `TonalPaletteNormalizedRequest` beside it. The generator's internal typedefs point at the same types, so the compiler holds the documentation true instead of letting it drift.

  [docs] Replace the stale `xds` command name with `astryx` across 79 lines of API type docs in 11 files, and realign the invocation tables. Codemods and changelogs that reference the old name are untouched — migrating it is their job.

- Protect generated, vendored, ignored, linked, dependency, and out-of-root files from upgrade codemods using working-tree declarations. Upgrades now run declared regeneration hooks, recheck protected outputs, and report incomplete changes in human and JSON results (#6692).
- Restrict the authoring factory codemod to Astryx imports (#6335)
- Restrict the status-variant and Avatar-size upgrade codemods to static props on verified imported JSX components, avoiding unrelated literal rewrites. (#6445)
- Test and fixture files under a codemod version folder are no longer loaded as codemods. Every `.ts`/`.mjs`/`.js` file under a version folder was loaded and validated, so a test colocated with its transform failed validation and — a definition error being a hard error — took every codemod in that version with it, while `upgrade` applied nothing and reported success. Reserved names: `*.test.*`, `*.spec.*`, `*.fixture.*`, and anything under `__tests__/` or `__fixtures__/`. (#6230)
- A stamped component doc (`type: 'component'`) that documents several components with `components` now loads, as the published `ComponentDoc` type allows. It used to fail with "props: expected array". Each entry must name its component; an entry without a `name` fails at load instead of later in a reader. (#6492)
- Keep authored theme declarations inside their CSS boundaries. Drop only an unsafe declaration, preserve valid CSS values and legacy token generation, and continue compiling the rest of the theme. Runtime reports dropped declarations on the console; theme builds include them in the existing receipt warnings. CSS generators accept an optional warning-text array for build collectors, without a callback API or additional exported diagnostic types. (#5529)
- Make the Toolbar — Table Filter block's filters actually filter, and bring the row up to the pattern the Filterable Table page template demonstrates: each closed selector doubles as its own filter chip, clauses fold from the end into a count as the row narrows, and the result count, clear all, and a column picker follow the clauses. (#6478)

#### Documentation

- `astryx docs authoring` now documents the `DebugEvent` a `debug` handler receives and the `GapReportHandler` contract, field by field. Both types were exported from `@astryxdesign/cli/authoring` with no section of their own. (#6498)
- `astryx docs authoring` now matches the published authoring types field for field, and a test keeps it that way: every field is listed, with its real type and whether it is required. Three entries were wrong: a component doc's `usage` is optional on sub-component docs, a command option's `default` may also be a boolean or a list, and a codemod's `type` is `'code'` or `'config'`. (#6492)
- Document CheckboxList's `isReadOnly` prop, and separate the select-all block example's rows with `hasDividers` instead of placing a Divider inside the options list (#6777).
- The documented exit codes for `astryx build` now say that a query exits 1 when `@astryxdesign/core` cannot be found, while the playbook (`astryx build` with no query) needs no core. (#6592)
- `astryx discover --components` is now documented as what it does: in the package list it prints every component of each package instead of the first 10 and a "+N more" count, and it changes nothing in `--json`. It was described as "List components only". The help also gains an example. (#6522)
- `astryx init --help` and the manifest now say how init's flags interact: `--remove-agents` only removes the managed block and ignores the install flags, `--all` overrides `--features`, and `--agent` and `--agent-docs-path` apply only when agent docs are installed, with an explicit path taking precedence. The documented exit codes now include an `--agent-docs-path` outside the project (exit 1) and no longer list two template cases the CLI cannot reach. (#6589)
- `astryx theme add --overwrite` and `astryx upgrade --install-deps` no longer describe a prompt the CLI never shows; each now says what happens without the flag (`ERR_FILE_EXISTS` with nothing written, or `ERR_DEP_MISSING`). `ERR_FILE_EXISTS` is described as "Refused to overwrite an existing file." without the "non-interactive mode" qualifier; its meaning is unchanged. (#6593)
- The CLI README now shows `apiVersion` in every hand-written envelope shape and example, and lists `astryx search --verbose` in place of `--detail`, which needs a level and does not add a result's score or reason. (#6587)
- The response-type docs, and the CLI README table generated from them, now name the fields of the `component.detail`, `docs.index`, `search`, `build.kit`, `gap-report.file`, `theme.build`, `theme.targets`, and `integration.pack-check` responses by their JSON keys, including `parentDoc`, `hint`, `notices`, `deprecatedFor`, each gap-report delivery's fields, and the pack-check contribution identities and issue fields. The `component.detail` response type declares `parentDoc`. (#6588)
- `astryx template --help` and the manifest now say which flags win when they are combined: `--cdn` overrides everything else and writes to its value, else to `<path>`, else `cdn.template.html`; `--list` ignores a name, a path, `--skeleton` and `--overwrite`; and `--skeleton` needs a name and writes nothing. (#6591)
- `astryx upgrade --help` and the manifest now state how its flags combine: `--list` ignores every other flag, `--registry` refuses `--list` and the migration flags, and `--codemod` is the only way to run an optional codemod and also skips the ShadCN composition check. The `--from` help names the legacy `@xds/core` fallback, and the documented exit codes now include a missing core, a missing jscodeshift, an invalid `astryx.config`, a post-codemod hook failure and the refused flag combinations. (#6590)
- `astryx docs authoring` now says where loading a doc is looser than its published type (stamped component and function docs, older generic docs, and templates), and which doc kinds accept fields they do not know. Nothing about how docs load has changed. (#6492)

#### Other Changes

- `start` names the template to scaffold, with the `template <id> --type page <path>` command that selects it (an integration replacement through the Core id it replaces), a `basis`, a one-line `reason`, and `alternatives`: the next two templates. A page ranker built for the long ideas builders write ("ops dashboard with a KPI row, a sortable table and a trend chart") picks it. Every matched word counts, weighted by how rare it is among page templates. The words before the first "with", ":" or "," name the page's family, a container ("in a modal") names its frame, and a word that only modifies another ("product" in "product response") counts half. A family's base template (`dashboard`, `settings`) leads its family unless a variant's own words outweigh it. Family words come from the templates' own ids. `basis` is `direct` when the ranker's pick is also search's direct match, `closest` when it is not, and `fallback` when nothing has the evidence to lead and the page starts from the `shell-top-nav` app shell (`blank` when that is not available). A template that is not ready yet is never the start.
- Search matches words more strictly. A term matches inside a name or keyword only at the start of one of its words ("input" finds `TextInput`, "file" no longer finds "profile"), plurals and stems count as the same word, and typo tolerance applies only to one-word lookups of words long enough that one edit rarely makes another word ("site" no longer matches "side", nor "cable" "table").
- Blocks and components that matched only one description word of a multi-word idea are no longer offered.
- The text output has four sections: TEMPLATE (with its reason and command), OTHER TEMPLATES, BLOCKS, and COMPONENTS (with the frame and foundation names). They replace RECOMMENDED START and PAGE TEMPLATES. Search's page matches (`pages`) move to one line, with their full entries under `--verbose`. Descriptions stop at their first sentence, and blocks and components show the top three, each with one shared command line. `--verbose` shows every block and component, with full descriptions, import paths, and match reasons. The recommended command always scaffolds (`template <id> --type page <path>`), where for most ideas it used to print a `--skeleton` or `component AppShell`.

  The `build` playbook, the generated agent docs, and the `working-with-ai` and `layout` guides now start every page from a template.

  Compatibility: the `build.kit` JSON only gains `start`. Every existing field keeps its shape and meaning. Which pages, blocks, and components are listed, and `directMatch`, change with the stricter matching, as ranking results do. The human-readable output is reorganized. Options, exit codes, and the `build.help` shape are unchanged, and `build` still writes nothing. The same matching changes the ranking of `search` results.

- Docs reads go through one internal compiler. `astryx docs` (and `docs()`), `astryx doctor` and `astryx search` read compiled topic nodes instead of each loading, merging, translating and linking doc files on its own. Output is unchanged. (#6484)

#### Contributors

Thanks to everyone who contributed to this release:

- @bhamodi
- @cixzhang
- @ejhammond
- @ernestt
- @imdreamrunner
- @josephfarina

---

# 0.6.3

#### New Features

- Add a Canvas Editor page template (#6237)
  A layered-artboard workspace: a File/Edit/View/Object/Help menubar over a layer rail and asset library on the left, the artboard centered on a muted backdrop under a floating tool bar that sets zoom, and a property inspector on the right whose fields retarget to the selected layer. Both rails drag to resize.

  The inspector is the substance of it. A text layer gets font, weight, colour, size, line height, letter spacing, horizontal and vertical alignment, slant, decoration, transform, a text shadow and a stroke; an image layer gets fit and the nine CSS filters, each on a number and a rail that move together. Colour anywhere in the panel opens a real picker. Everything that can reach the artboard does — typing in Transform recases the poster, dragging Sepia tints the photograph.

  It fills a gap next to `Tools - Page Editor`. That one composes a document — a palette of blocks dropped into a flow that reflows around them. This one moves objects on a fixed 1080 x 1920 frame, where position and size are coordinates rather than an order, so the inspector reads X/Y/W/H and the canvas needs a zoom control at all.

  Two decisions worth knowing if you copy it:

  **The artboard is themed, not styled.** The template's `canvasEditorTheme` is pinned to `mode="light"` around the artboard, so the poster keeps its palette when the editor around it goes dark. The theme carries what belongs to the poster as a whole — the display face, the leading, the uppercase treatment, the frame margins — and the display face is Anton with a fallback chain through the condensed grotesques that ship with macOS and Windows. The chain puts Impact ahead of Arial Narrow because every face in it is a single-weight black rendered at weight 400, and Arial Narrow at 400 reads thin rather than poster-heavy.

  Size and tracking are deliberately not tokens: they belong to a layer rather than to the poster, so they live on the layer and the inspector edits them live. That split is the line worth copying — theme what the surface owns, leave per-object properties to the object.

  **Zoom is a transform, not a re-layout.** The artboard always lays out at its native size and the frame scales the painted result, which keeps the theme's numbers in artboard pixels — the same numbers the inspector shows — and keeps the poster from reflowing between zoom steps.

  **The menubar is one button, not five.** File/Edit/View/Object/Help became submenus of a single `DropdownMenu`. A menubar spends the top-left on five words that are only read by someone already hunting for a command, and this editor has something better to do with that space: the tabs, which are read constantly. The commands keep their grouping — the bar became the first level of the menu rather than disappearing. The menu takes a `menuWidth` because left to itself it matches its trigger, and the trigger is a 28px icon button: five one-word rows in a column barely wider than the words, with nowhere for the submenu chevrons to sit.

  Five smaller things the template works out, in case you hit the same walls:

  **A field names itself from inside.** Every inspector control is one input with a glyph in its `startIcon` slot — `X`, `Y`, `W`, `H` — rather than an `InputGroup` pairing an addon to a field. It reads as a single control, and the accessible name stops stuttering ("Horizontal position", not "Horizontal position X"). `startIcon` takes an SVG component, so the letters are drawn on the same 24px grid Lucide uses and sit interchangeably beside real icons.

  **One left edge across the panel.** The label column is a set width, but a flex item shrinks before its siblings do, and the fields beside it carry StackItem's min-width reset. Without `flexShrink: 0` on the label column the row spends its shrinkage there, and every field lands on a slightly different edge — which is the one thing an inspector cannot afford.

  **Row actions use the shared reveal primitive.** A layer's lock stays hidden until the row is pointed at or receives keyboard focus. `useContainerReveal` owns the hover, focus, coarse-pointer, and reduced-motion behavior, while `TreeListItemData` forwards the returned row props so every nested row keeps its reveal state isolated.

  **A fixed-height Card scrolls; the artboard has to clip.** Give `Card` a `height` and it becomes a scroll container, which is right for a card holding more copy than fits. The artboard is the opposite case: it lays out at its native 1080 wide at every zoom step and the frame scales the painted result, so its content is deliberately larger than its box and the card would offer 1080px of sideways scroll inside a 432px frame. `overflow: clip` through `xstyle` is the fix, and `clip` over `hidden` because nothing here should scroll at all — including the quiet scroll `hidden` still performs when something inside it takes focus.

  **Concentric corners come out of the padding.** The floating tool bar is a card with one spacing step of padding, so the controls inside it round to the card's radius _less_ that step — written as `calc(var(--radius-container) - var(--spacing-1))` rather than a number, so it still holds if either token moves. An inner corner cut at the same radius as its container reads as a rounder curve crossing a straighter one; matching the difference is what strikes both from the same centre. While you are in there: a vertical `Divider` is `height: 100%`, and a flex row that centres its items gives a percentage height nothing to resolve against, so the rule collapses to zero and the bar silently loses its groups. `alignSelf: stretch` is what gives it a height.

  **The top bar is a `LayoutHeader`, not a `Toolbar`.** It reads like a toolbar and it is not one. A toolbar is a set of peer commands that arrow keys walk across, and the document tabs break that twice: arrowing off a tab landed on that tab's own close button, and a strip of open documents is not a band of tools in the first place. It also fought the padding — a toolbar sizes its gutters for a band heading content, and app chrome wants to sit tighter, which took a `--astryx-section-padding-inline` override and the edge compensation that override republished.

  `LayoutHeader` is the component for the slot, and `padding={1}` settles all of it: 4px on every edge puts the menu button's box exactly where the ghost inset used to pull it, so the glyph lands on the same pixel with nothing pulled back out. Same 45px bar, same 18px glyph centre, same divider — measured before and after — minus a role that was describing the wrong thing. The floating canvas tool bar stays a `Toolbar`, because that one really is a row of peer commands, and it still roves left to right.

  **One icon on three rows is a list nobody reads.** Border, shadow and fill all shipped with the same `Palette` swatch, and the three effect presets in the library shared it too — six rows, one mark, so the column read as one control repeated rather than six different things. Lucide has no `shadow`, `fill` or `padding` icon, so the picks came out of reading the pack rather than guessing at names: `PaintBucket` for fill, `SquareStack` for shadow (two offset squares is a drop shadow), plain `Square` for border, `SquareRoundCorner` for per-corner radius so it stops colliding with the per-side padding button that was also `SquareDashed`. Two things worth knowing if you go looking yourself. Names in that pack can be aliases — `FlipHorizontal` re-exports `square-centerline-dashed-horizontal`, which at 16px is an unreadable dashed box, and the mirrored triangles you actually want are `FlipHorizontal2`. And judge candidates at 16px, not at sketch size: `radius` is a legible corner gauge at 48px and mush at 16.

  X, Y, W and H stay letterforms. They are names, not pictures — no icon distinguishes the horizontal coordinate from the vertical one, and every design tool prints the letters for the same reason.

  **A shortcut is a hint, not a control.** `Kbd` paints one key cap per key, so `⌘N` arrived as two small objects beside the menu item and read as something you could press. Desktop menus print shortcuts as quiet secondary text, which is what these are now — a `Text type="supporting" color="secondary"`, one string, set against the menu's right edge. The cost is platform awareness: `Kbd` resolves `mod` to ⌘ or Ctrl, and it does that through `isApplePlatform`, which core keeps unexported on purpose, so a template that leaves `Kbd` prints macOS glyphs and stops adapting. The `shell-nav` menubar already makes that trade. If you need both the quiet treatment and the platform switch, that is a gap in `Kbd` rather than something to solve at the callsite.

  **Rows are `Item`, not `ListItem`.** Both land on the same compact metrics — 4px/8px padding — but `Item` carries its own `density` instead of taking it from `List` context, so a row keeps its spacing wherever it is put and the rail does not depend on the list above it to stay dense. The rows still render as `<li>` through `as="li"`, so the rail is still a list to a screen reader, and `Item` merges `className`, which is what lets the hover-reveal marker keep sitting on the row itself.

  **One height, two rules: beside a field, or inside a row.** Everything here aligns to 28px — the menubar, the tool bar, every inspector field, every row of the layer rail. Two different things follow from that, and conflating them is what makes a panel look untidy.

  An action standing _beside_ a field is `IconButton size="sm"`, and its 28px box is the whole point: the clear, the rotate pair, the per-side and per-corner toggles all end level with the input's top and bottom, so the row reads as one band rather than a field with something small floating next to it. The colour swatch and the image thumbnail take the same 28px square for the same reason — a chip beside a field is still a thing with edges, and its edges should be the field's.

  An action _inside_ a row is the exception, and the only place anything shrinks. A compact row spends 4px above and below, leaving 20px, and the smallest `IconButton` is 28px on its own — so a rail built from them measures 36px no matter what density says. There is no smaller size to reach for; the floor is the component's. The layer rail's lock is therefore a bare `<button>` with a 20px hit area (`styles.itemAction`), and the rail measures 28px. Note what did _not_ change: it is still a `<button>`, so it stays keyboard-reachable and announced. It was `Button`'s minimum that had to go, not the element.

  **Gutters differ by panel, and the swatch borrows the field's corner.** The left rail sits at 8px because its rows are the content — a denser gutter lets the list read as a list. The inspector sits at 12px, carried by each `InspectorSection` rather than by the panel, which is what keeps the rules between sections running edge to edge: pad the panel instead and every divider insets by the gutter, turning a full-bleed rule into a floating line.

  The colour chips round to `--radius-element`, the same token an input rounds to, not `--radius-inner`. One step tighter sounds like the safer choice for a small square, but at 28px beside a 28px field the two curves read as different families; matching them is what makes the chip look like another control on the row rather than a tile dropped next to one.

  Sliders are the one control that should _not_ match. A filter row pairs a 28px number field with a 20px rail, centred — a slider is a line to aim at, not a box to stack, and stretching it to the field's height would read as a second input.

  **Border, Shadow and Fill are pickers, not text fields.** Each row is now a value, a chip that opens a picker, and a clear that only lights up once the slot holds something. Astryx has no colour picker to reach for, so the popover is assembled from what it does have: a `Popover`, a `TextInput` for hex, and a `Slider` for hue.

  The hue rail is worth pausing on, because the obvious move is to paint it and that would be wrong. A spectrum rail looks like custom work, but the only custom thing about it is the gradient — the dragging, the arrow keys, the ARIA and the thumb are all just a slider. So it _is_ a `Slider`, with `components['slider-track']` in the template's single `defineTheme` carries the spectrum. That same theme is mounted narrowly around the hue Slider so the nine filter sliders in the panel keep the plain track they should have. Reach for the theming target before reaching for a `<div>`; check a component's `theming.targets` in its docs first.

  Only the saturation/value plane is painted, and only because it is two axes at once and no slider is. It carries `role="slider"`, arrow keys, and pointer capture — capture being the part worth copying, since without it a fast drag out of the plane stops at the edge instead of following the cursor.

  The picker holds HSV while it is open even though the layer stores hex. That is not redundancy — hex has no hue left once a colour reaches black or white, so a picker that round-trips through it loses your place on the rail the moment you drag to the bottom of the plane.

  Shadow reuses the same popover and adds X, Y, Blur and Spread inside it, because a shadow is one thing to set rather than five rows to find. And Shadow appears twice on a text layer on purpose: the one in Styles is the box's, the one in Text is the type's, and a layer can carry both.

  **Enumerable styling is static; only the open-ended values are dynamic.** Text transform, decoration, slant and alignment are closed sets, so they compile to real classes picked by key (`typeCase`, `typeLine`, `typeSlant`, `typeAlign`) rather than to a custom property written on every keystroke. Size, line height, colour, stroke and shadow have no such set, so those stay a dynamic `styles.type(…)`. Worth splitting rather than making everything dynamic: the static half costs nothing at runtime and shows up in devtools as a name instead of a variable.

  **Filters emit only what is off its neutral point.** Nine filter functions that all happen to be no-ops still force the image onto its own composited layer, so `filterCss` drops the ones sitting at 0 or 100 and returns `none` when they all are.

  **The image row's thumbnail opens a picker.** `FileInput` would be the obvious component, but it is fixed at the medium element height and this inspector is built on a 28px rhythm, so the picker is driven from the thumbnail instead and the file input itself stays hidden in the DOM. Choosing a file names it in the adjacent field and stops there: a template has no upload endpoint, and repainting the artboard from a local object URL would show something the template does not ship.

  **The canvas tool bar's end gutters match.** The trailing zoom control is a ghost, so edge compensation pulls it out to the card's edge to optically align its label — correct when the control is alone in a container, but here it left 8px on the leading end and nothing on the trailing one. The step goes back via a wrapper rather than the control's own `xstyle`, because `Selector` passes `xstyle` to an inner node and a margin there does not move the field.

  **The layer rail is a `TreeList`, grouped by layer kind.** A poster's layers are not a flat list — the two text layers belong together and the images belong together — and a tree says so structurally instead of relying on sort order and the reader's inference. It also buys collapse for documents whose layer count outgrows the rail. The rows are supplied as data rather than composed, so `TreeList` keeps the disclosure state, the guide lines and the roving focus that a hand-rolled tree would have to reimplement; the lock still arrives through `endContent`.

  The per-row lock reveal survives the move because `TreeListItemData` forwards the `className` and `style` from `useContainerReveal` to each row. Groups take the frame mark rather than repeating a child's glyph, since a parent is a container and not another layer of that kind.

  **A tab's close eats into its label rather than widening the tab.** Fading a control that still occupies its box costs the name 20px permanently to hold room for something usually invisible. The close now collapses to zero width at rest and takes its 20px back on hover, so the space belongs to the name until it is needed. That requires a set tab width: with content sizing the label has nothing to shrink against, and revealing the close would push every tab to its right — the strip would reflow under the pointer and the target being reached for would move. The reveal is instant. Easing the width means the label reflows for the length of the animation, so the name wobbles every time the pointer crosses a tab — motion on an affordance that is only ever glanced at. The set width holds the longest seeded name _with_ its close showing, since the open document never hides one.

  **Tabs separate with a 16px rule, dropped either side of the open one.** A vertical `Divider` takes its height from the row unless given one, and the strip has no columns to divide — it needs the smallest mark that reads as "these are separate tabs". Tabs are all one width, so the rule marks a boundary rather than sitting midway between two labels, which is also why it is dropped next to the open document: that tab already reads as separate by its fill, and a rule running into the fill's rounded edge only crowds it. The rule is hidden rather than unmounted, so moving the selection does not add or remove a flex item and slide the whole strip sideways under the pointer that just clicked it. The strip carries no flex gap, since a gap applies on _both_ sides of a rule and would leave it floating in a channel of its own instead of landing on the seam; the tabs have their own inner padding, so butting them up costs the labels nothing.

  **Tabs have a ceiling, not a fixed width, and the panels fold by width.** A tab now sits at its widest and gives ground as documents are added or the window narrows, spending the label's slack before truncating and stopping at a floor so a crowded strip scrolls rather than grinding every tab down to a sliver. The ceiling has to be `width` and not `flex-basis`: a basis does not raise an item's max-content contribution, so the strip sizes itself to the tabs' _content_ and then squeezes them back under their own basis, leaving every tab short even with the bar half empty.

  The strip also caps itself, because it sits in `Toolbar`'s start slot and that is not the slot built to give way — only the centre slot carries `min-width: 0`, so a start slot grows to its content and pushes the bar wider instead of squeezing. Widening the start slot in core would change every toolbar to suit one page's tab strip, so the cap is local: bar width less the room the menu button and the trailing save/export group need, measured in `cqw` against the header so it tracks the bar rather than the window. The new-document button moved out of the strip on the way — it is not one of the open documents the group is named for, and inside a scrolling strip it would be the first thing to scroll out of reach.

  The two side panels fold away below a width rather than being switched off: the View menu's toggles record what the user asked for, so a panel that vanished for room comes back on its own when the window grows. The inspector goes first, being the wider of the two and the one you can work without; the rail follows later, since knowing what is on the canvas outlasts being able to adjust it. Each resize handle folds with its panel, or a grip is left behind on a seam with nothing on the other side.

  **The header bar sits at 4px, not 8.** Two paddings were stacking: the toolbar's own gutter plus the tab strip's, putting 12px above a 28px tab and a 53px bar over the canvas. The bar is app chrome, so it takes the tighter gutter and the strip keeps its 4px, which lands the header at 45px. Note the floor while you are in here — `Toolbar` sets `min-height: --size-element-sm` and a tab is that same 28px, so no padding gets the bar below 37px.

  **Export is a ghost trigger.** A filled primary put the page's heaviest mark on the one control that is not the work — the canvas is, and the bar around it should stay chrome. Ghost also lets the toolbar's edge compensation do its job: it pulls a ghost trigger out by its own padding, so the icon lands on the header's gutter while the hover box still bleeds past it.

  **The image row's trigger is a `Thumbnail`, not a button wrapping an `img`.** The component already carries what the hand-rolled version was re-deriving: button semantics and a hover overlay from `onClick`, an accessible name and tooltip from `label`, and the same `--radius-element` the colour swatches use. It ships at 64px for media grids, so it takes a width override to join a row of 28px controls; the picture stays square on its own aspect ratio, so the height needs no help.

  **Icons in the rail share one colour, and unselected tabs dim whole.** Every rail glyph, and the strip's new-document `+`, now resolves to the secondary _icon_ token. That token and its text counterpart agree at the theme root but diverge under this editor's theme, so a lock keyed to the text ramp came out darker than the layer glyphs on its own row. Tabs dim their icon alongside their label; dimming the label alone left the icon at full strength and read as half-active.

  **An open document tab is an `Item`, and the strip is an `HStack`.** A tab was a `div` painting chrome around a `button` and a `span`, with its own radius, fill, height, gap, padding and ellipsis. It is the same object as a layer row — a name with a mark in front and an action behind — so it is now the same component, and all of that comes from `Item`: `density="compact"` gives the 28px box, `isSelected` the fill, `startContent` and `endContent` the file mark and the close, and a string `label` ellipsizes on its own. `Item` also ignores a click that lands on a nested button, which is what keeps the close from switching to the document it closes. The strip's flex, gap, padding, scroll and cap are all `HStack` props now.

  Not `TabList`, which is the component the name suggests: a `Tab` marks the open one with an underline rather than a fill, sizes itself to its label with no way to cap it from outside, and keeps both of those in spans an `xstyle` cannot reach.

  Two things stayed local. The width ceiling, because the strip sits in `Toolbar`'s start slot and that slot grows to its content. And the selected fill, because `Item` marks selection with `--color-accent-muted`, which this editor's theme resolves to the exact colour of the header bar in dark — the open document would have read as no document at all. `Item` also spaces a list row for reading down a column; across a tab those channels cost the name six characters, so the measure is tightened back to what the strip had.

  **Two wrapper divs went back to the layout components.** The canvas stage is an `HStack` — its flex box, its max-content sizing and its 100% floor on the block axis are props, leaving only the `min-width` HStack has no prop for. The zoom control's wrapper is gone entirely: a div whose only job was one margin is a margin the control carries itself.

  **A nested row action is a real `IconButton` now.** It was a hand-rolled 20px `button` because the element scale stops at 28px and a control the row's own height would push a 28px row to 36. A `size="sm"` `IconButton` pulled in by the row's padding step on every edge lays out as 20px while staying 28px to the pointer: the glyph does not move, the row keeps its height, and the target grows to what a pointer expects. No tooltip on these — a bubble opening off a 28px row covers the row above it, and a padlock and an × already say what they do.

  A note if you wire the Appearance menu to a Theme of your own: a nested Theme recolours text but does not repaint the page behind transparent panels, so an explicit mode needs a surface — here a `Section` wrapping the editor — or the new mode's text lands on the host's old background.

#### Contributors

Thanks to everyone who contributed to this release:

- @ernestt

---

# 0.6.2

#### New Features

- Add `muse` preset to `astryx init --agent` targeting `AGENTS.md` for Muse Code. (#6045)
- Build one keyed artifact trio for a selected theme family (#6268)

#### Fixes

- doctor: range-check every peer against the project's own node_modules, so a peer that is only reachable from the ambient environment no longer reads as installed (#5327)
  `checkPeerDeps` resolved each peer with `require.resolve(name, {paths: [cwd]})`. Node folds `NODE_PATH` into that lookup regardless of `paths`, so a peer merely reachable from the ambient environment resolved, and doctor reported nothing while the project itself was missing it. It now walks the project's own `node_modules` and reads each `package.json` off disk, so a missing peer is reported and an installed one is checked against the declared range.

  Yarn Plug'n'Play projects have no `node_modules` for that walk to find, so the lookup asks the PnP runtime when the walk comes up empty. PnP resolves from the project's own dependency graph and ignores `NODE_PATH`, which keeps the answer project-local. A PnP project now gets its peers range-checked too — previously `require.resolve` could confirm a peer was present there but not read its version, because Core does not export `./package.json`.

- Component loader now reads default-export `.doc.mjs` files (the shape `integration add component` writes), fixing a crash where `component` and `search` could not load generated docs. Human `component` detail and list views now use the API-resolved import specifier instead of recomputing from core, so integration components report their package-authored import. `pack --check` now reports an error when a component doc cannot be loaded instead of silently approving. (#6291)
- Fix `theme build` emitting invalid JS identifiers for theme names containing hyphens or dots followed by digits. The output identifier is now derived deterministically from `theme.name` by camelCasing across `-` and `.` separators (underscores are preserved as valid identifier characters). Names like `chaos-07` correctly produce `chaos07Theme` instead of the unparseable `chaos-07Theme`. (#6289)
- Make staged writes portable across filesystems that reject hard links.
  The create-only publisher now falls back from `linkSync` to `copyFileSync` with `COPYFILE_EXCL` for `EPERM` and `EXDEV`, while preserving no-clobber, concurrent-creator safety, compare-and-swap replacements, symlink rejection, rollback, and temporary-file cleanup. (#6287)
- theme build: only treat a core the theme's own node_modules chain can reach as one a CommonJS dependency could reach, so an ambient-only core no longer fails the build with ERR_CORE_INCOMPATIBLE (#5327)
  `patchCommonJs` required `@astryxdesign/core` from the theme file to see whether it could wrap `defineTheme` for `.cjs` dependencies. `require` folds `NODE_PATH` in, and pnpm's isolated layout puts every package in `node_modules/.pnpm/node_modules`, so a core no dependency of the theme could reach answered that lookup. Wrapping it fails on a `require(esm)` namespace, and the reported coverage gap then rejected any theme whose lineage was unobserved. The lookup now walks the theme's own `node_modules` chain first, the same way `doctor` resolves peers.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @Han5991
- @josephfarina
- @oliprovscode

---

# 0.6.1

#### New Features

- Load an installed integration even when no `astryx.config` names it (#6202)
  A package the project declares as a dependency, and that ships a root `astryx.integration.*` manifest, is now loaded on sight — no config entry required. A scaffold that adds the dependency and writes no config used to leave the integration invisible: its components, templates, docs and codemods all reported as missing, which is indistinguishable from not having installed it at all.

  Only DECLARED dependencies are probed — `dependencies`, `devDependencies` and `optionalDependencies` — and only by key. `node_modules` is never walked, so a transitive dependency of a dependency cannot contribute; and because the value is never parsed, a dependency that is not a semver range (`npm:` aliases, `workspace:`, `file:`, `link:`, `catalog:`) resolves like any other. Identity comes from the resolved package's own `name`, so an aliased dependency reports the package it actually is, and two dependency keys naming one package load it once.

  An explicit `astryx.config` entry keeps its precedence and its position, and a dependency whose manifest fails to load is dropped quietly rather than reported as the consuming project's problem.

  `astryx doctor` gains an `implicit-integrations` line naming each integration linked this way, the package.json field that declared it, and what it contributes — so an author can answer "why can the CLI see this?" without reading the CLI's source, and an unused-dependency check has something to read that says the dependency is load-bearing. The line is always informational, so the doctor CI gate is unaffected.

- Replace executable gap-report writers with composable handlers. (#6200)
  Gap reports now fan out to every configured handler — project config first, then each loaded integration in config order — instead of selecting one writer. Each handler gets its own report copy and an abort signal under a 30 s budget. A failed handler cannot stop later handlers, and the aggregate receipt shows every outcome.

  Public types: `GapReportHandler` replaces `GapReportWriter`; the handler receives a normalized `GapReport` event and returns a strict `GapReportHandlerReceipt`. Project config gains a `gapReport` field; the integration named export uses the same type.

- Add integration authoring and packed-package verification. `astryx integration add <kind> <name>` and the per-kind `integrationAddComponent`, `integrationAddDoc`, `integrationAddTemplate`, `integrationAddCodemod`, `integrationAddAgentDoc`, and `integrationAddTheme` APIs write complete contributions. Existing component, docs, template, and theme commands see the package being authored without publishing it first. `astryx integration pack --check` proves the same contributions survive the npm tarball and that packed components remain available through their public imports. Doctor now names source-only components, unreachable metadata, codemods outside a version folder, and invalid version folders. (#6245)
- Remove the prefix requirement from theme-local tokens (#6285)
- Add upgrade receipts and safe three-way reconciliation for ShadCN-copied compositions. (#6228)
- Let integration packages contribute source themes (#6245)
  An integration can declare a themes root using the same bundle shape as Astryx's built-in themes. Installed themes now appear in `theme list`, and `theme add` can copy one by owner.

#### Fixes

- build: recommend `template <name> --skeleton` in the kit payload when the top page is not a direct match, matching what the renderer already tells a human (#6255)
- Center: preserve component-owned axis reflection and correct the horizontal-centering example. (#6207)
- `astryx component <Name>`'s plain-text output always showed `import {Name} from '@astryxdesign/core/...'`, even for a component owned by an integration package. The JSON response already resolved the import against the correct owner, but the command's text formatter recomputed its own hint via the core-only resolver and ignored that value. (#5294)
  The command now uses the already-resolved `import` field from the component's detail response, so the plain-text output matches the JSON output and shows the integration's own package.
- Prefer canonical component target names in maintained themes and new examples while preserving deprecated runtime aliases and released bare prop/state selector classes through the 0.7.0 removal window. Theme discovery labels deprecated targets, theme build warns with each exact canonical replacement, and `astryx upgrade --apply` provides the forward-compatible bare-selector migration. (#6126)
- `component` and `search` now report the same import specifier for an integration component, resolved once in `foundation/discovery/component-discovery.mjs`. `search` previously returned the bare package name, which does not resolve for a package whose components are exported behind subpaths. (#6203)
- Keep ShadCN composition upgrades safe in JavaScript projects and publish precompiled JSX with strict TypeScript declarations. (#6246)
- Make generated ShadCN compositions match the exact bytes written by the stock client, include package peer dependencies, and require full-catalog install/build coverage in CI. (#6231)
- Keep copied integration theme files inside the target project. (#6270)
- Show all seven dashboard page templates in the templates gallery and playground. (#6264)

#### Contributors

Thanks to everyone who contributed to this release:

- @andrskr
- @cixzhang
- @ernestt
- @josephfarina
- @kentonquatman

---

# 0.6.0

#### Breaking Changes

- Add ordered environmental adaptations to `defineTheme`
  Themes can now opt into CSS-first token, theme-local token, and component changes for named viewport widths, primary-pointer precision, contrast preference, and motion preference:

  ```ts
  defineTheme({
    name: 'acme',
    adaptations: {
      widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
      rules: [
        {
          when: {width: {from: 'lg', below: 'xl'}, pointer: 'coarse'},
          value: {tokens: {'--size-element-md': '44px'}},
        },
      ],
    },
  });
  ```

  Condition fields are ANDed. `width.from` is inclusive, `width.below` is exclusive, and rules cascade in declaration order so later matching writes win. Theme extension preserves the effective breakpoint map and inherited rule order; static builds retain the metadata needed for source-equivalent extension.

  `AppShell` now accepts `xl` and `2xl` for `mobileNav.breakpoint` and resolves all five names through the nearest Theme. Mobile mode now uses the documented exclusive boundary (`width < breakpoint`), so an AppShell exactly at the named point renders the wider layout instead of the mobile layout.

  `defineTheme` now validates the token values authored inside an adaptation rule, rejecting non-string scalars and arrays with a length other than two instead of emitting them. Root and on-media token input keeps its existing acceptance unchanged, so themes that pass values through casts or spreads keep building. It also validates the combined portable and theme-local token graph for every reachable set of matching adaptation rules, rejecting cycles before CSS is emitted. Component writes in a rule use the same target, axis, value-domain, and extension validation as root `components`; a rule may not be the only place a custom value is enrolled, because generated type augmentation is unconditional.

  `astryx theme build` treats the adaptation generator as a core capability rather than a baseline requirement, so a theme with no adaptation intent still builds against an older installed `@astryxdesign/core` and emits the same CSS as before. A theme that does carry adaptation intent — valid rules, a custom `widthBreakpoints` map, or present-but-malformed adaptation metadata — fails against such a core before any output is written, with `ERR_CORE_INCOMPATIBLE` naming the missing `generateAdaptationCSS` export. A complete default width map with no rules asks for nothing and still builds. Where an older core's `defineTheme` drops adaptations while resolving, the build records each raw `defineTheme()` input and associates it with the theme it produced, so only the selected theme's lineage decides. An unobservable selected ancestor (including a CommonJS source package whose ESM core namespace cannot be wrapped) fails closed; an unused adaptive theme elsewhere in the import graph does not affect a plain build. The same capture preserves raw typography, color, radius, and motion axis metadata in old-core-built artifacts, allowing later current-core children to resolve partial adaptation axes exactly as if they extended the source theme.

#### New Features

- Let integration manifests add managed agent guidance
- Add an authoring-time OKLCH palette generator with a pure API, terminal and HTML previews, typed palette output, custom stops, deterministic receipts, and overwrite protection.
  [feat] Expose exact solid black and white values as `neutralPalettes.black` and `neutralPalettes.white` for use in semantic theme tokens.
- Every command now reports what it returned in its debug logs, and a new command cannot skip it.
  A command's action returns a `CommandResult` — either `{kind: 'results', count, resultKind, ...}` or `{kind: 'none'}` for the commands whose work is an effect (build, init, upgrade, doctor). The CommandDoc converter records it centrally, so `resultCount`, `emptyResult`, `resultKind`, and `directMatch` are now populated for `component`, `docs`, `hook`, `template`, `theme list`/`add`/`targets`, `discover`, `blog`, `swizzle --list`, `upgrade --list`, `layout grammar`, and `manifest`, not just `search` and `build`. `resultKind` gains `theme`, `integration`, `migration`, `command`, and `none`; a null now means the run never reached an answer rather than "this command has nothing to say". That is a change of meaning on an existing field, so recorded runs are now `schemaVersion: 3` — a consumer that counted nulls as "commands with nothing to report" should branch on the version before mixing old rows with new ones.
- Add `doctor integration` checks for structural validation and Core template, component, and doc overlaps (#6173).
- Add an experimental shadcn Registry compatibility guide and doc-derived registry identity metadata. It explains the package boundary, stable organized paths, copied composition model, upgrade behavior, and when to use the richer Astryx CLI.
- Add `astryx upgrade` transforms for the Core 0.6 deprecated-API removals: focus direction overrides, the hooks-path IME helper import, and Resizable pixel-bound aliases.

#### Fixes

- Prevented removed Resizable bounds from being silently ignored and kept ambiguous spread migrations behavior-preserving (#6124)
- Add a conservative `astryx upgrade --apply` migration for the Core bare selector-class removal. The transform parses `.css` selector syntax, rewrites exact v0.5.4 target/value pairs to behavior-preserving old-class/data-attribute unions, covers unbounded values that v0.5.4 emitted, and leaves unknown consumer classes unchanged.
- Preserve `@path` agent doc imports and remove previously duplicated managed blocks (#6164)
- Refresh the Collapsible block templates with complete, current examples for single, multiple, controlled, divided, standalone, and grouped usage. The controlled step example keeps one valid step open so its progress label and Previous/Next actions never enter an invalid “Step 0” state.
- Report the fixture path when a template demo asset has an unsupported format (#6039)

#### Documentation

- Align Doctor help and README examples with the shipped command tree and output format (#6197).
- Clarify how to build themes with imported icon registries, including the current omission of inline registries and the separate registry compilation step.
  The theme guide distinguishes a missing compiled registry from an extensionless source import: the former breaks both loading and bundling, while the latter can resolve in a bundler when the source remains beside the generated module. English, dense, and Chinese guidance now explains how output paths and `--icons-specifier` affect resolution.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ernestt
- @Hashim1999164
- @imdreamrunner
- @jiunshinn
- @josephfarina
- @rubyycheung

---

# 0.5.4

#### New Features

- Preserve block showcase metadata from CLI integrations so packages can ship their own docsite previews. Charts now includes its primary bar-chart showcase alongside the package.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.5.3

#### New Components

- Add popover, bottom-sheet, and adaptive presentation options to Selector and MultiSelector, with docsite examples for both bottom-sheet variants. (#5395)
- Reuse Neutral-owned local tokens for semantic status fills across badges, status dots, step indicators, and progress bars. (#5854)
- Add Neutral's reproducible, theme-owned OKLCH palette without changing
  its runtime token mappings. The request, receipt, generated result, and CLI template artifacts are committed together for review. (#5987)
- Add the opt-in theme-local token contract for maintained theme families. (#5844)

#### New Features

- Add structured accessibility requirements and theme coverage support to component documentation. (#5713)
- Add the checkout wizard page template. (#5660)
- CLI: record every command run and hand it to a function you supply. (#4812)

  ```js
  // astryx.config.mjs
  export default {
    debug: event => appendFileSync('runs.ndjson', JSON.stringify(event) + '\n'),
  };
  ```

  That is the whole feature. Setting `debug` opts in; the function receives one `DebugEvent` per invocation and decides what happens to it. The CLI stores nothing.

  Each event carries the command, its arguments and flags (with their Commander source, so you can tell a typed flag from a default), the outcome, exit code, duration, error code, a coarse environment snapshot including which coding agent invoked the CLI, and — under `output` — everything the command printed to stdout and stderr. That last part is the answer the user actually got, which is what makes a record useful for improving the output rather than just counting invocations. Streams are captured separately with their true byte counts, and truncated past 32KB per stream so a command that prints a whole file does not dominate the record. Coverage is the point: handled errors, parse errors, `--help`, rejected invocations, uncaught throws, and Ctrl-C all report. The event is delivered from a `process.on('exit')` listener because the CLI's error path exits synchronously — anything hooked to normal completion would report successes and almost no failures — and the handler is loaded before parsing, because parse errors and `--help` short-circuit before any hook runs.

  `event` is a published contract: `DebugEvent` is exported from `@astryxdesign/cli/debug` with a sealed zod validator, `parseDebugEvent`, drift-locked to the type so the recorder cannot add a field without publishing it. `schemaVersion` is a literal, so widening it turns every consumer's branch into a compile error rather than a silent misread.

  The handler runs synchronously at exit — a returned promise is never awaited, so network delivery from inside it will not work; write a file or spawn a detached child. It receives a copy, so a handler that throws, or mutates what it was given, can neither fail the command nor affect anything else. Follow-up hardening keeps a handler from replacing the command's exit code and routes handler writes away from stdout so a `--json` envelope stays valid. (#5929)

  Nothing changes for a project that has not set `debug`. Startup is unmoved: the environment probe is deferred to delivery rather than run in `begin`, because its first `Intl` call initialises ICU and that alone was ~9% of the CLI's startup for everyone. Nor does the config run: `Project.load` evaluates the config module and loads its integrations, which most commands never did, so the file is read as text first and only loaded when the word `debug` appears in it. Measured across eight commands, no command evaluates a config that did not already.

  Values are scrubbed before delivery: home paths, absolute paths inside stack frames, email addresses, URL credentials, credential-shaped strings, and the value half of a sensitive assignment wherever it appears — including where an error message, a stack frame and the captured stderr all quote the flag that was rejected. Sensitive names are matched with `-` and `_` stripped, so `--api-key`, `--api_key` and `--apiKey` are one rule; `key`, `pat` and `pw` are matched whole so they do not take `--keyboard` and `--path` with them. `argv` is scrubbed pairwise, so `--token hunter2` loses its value the way `--token=hunter2` does. Oversized values are clamped.

  Hardened against three adversarial chaos runs and an independent review, each finding mutation-tested before its fix landed: a `__proto__` key silently reparenting the record that carried it, one oversized value discarding the whole event, an exit that bypassed `cliError` being indistinguishable from a classified failure, a signal-terminated run leaving no record at all, a sensitive `--flag=value` scrubbed in `argv` but written back out in full through the error message and captured stderr that quote it, absolute paths surviving inside stack frames — where nothing puts whitespace in front of them — and taking the machine's username with them, a graceful Ctrl-C recorded as a failure with an exit code the process never returned, `--api-key` and `--token value` reaching a handler intact, and the two startup costs above.

  One change reaches beyond this feature: `installJsonShim` now shims commands as they join the command tree rather than in a single walk at startup, so a command registered later can no longer silently fall out of the `--json` contract.

- CLI: `astryx init --json` now works. It emits the install receipt as a standard envelope — `init.run` with the mode, the features that ran, the agent-doc files written, any soft `docsError`, and the template outcome, or `init.remove` for `--remove-agents`. Human output is suppressed so stdout carries only the envelope, and the exit code is unchanged from human mode. (#4812)
  `init` was the last side-effecting command still refused by the `--json` gate. That gate existed to stop a command writing half a project and only then reporting that `--json` was unsupported; since `init()` already returned a typed receipt, the fix was to emit it rather than to keep refusing. `theme` and `layout` remain off the allowlist, but both are command groups with no output of their own.
- Add result and agent-session context to DebugEvent (#5971)
- Add the dialog wizard page template. (#5798)
- Let themes add typed Heading visual roles with a safe semantic-level
  fallback when the owning theme styles are unavailable. (#6026)
- Add the form wizard page template. (#5664)
- Add the inline wizard page template. (#5797)
- An integration can now supply a `debug` handler, so installing it turns on its debug logs with no change to the app. Export `debug` from `astryx.integration.*`; the app's own `debug` still runs, both get every event, and a handler that throws cannot affect the command. Opt out with `{"astryx": {"inheritDebug": false}}`. (#5998)
- Mute the low-tone edge of Neutral's dark chromatic palette while preserving its light and neutral ramps. (#6069)
- Rebuild the `table-page` template as a searchable, filterable, sortable table pattern with filter-aware totals, row detail, a scrolling document masthead, and guidance organized around narrowing, sorting, and communicating filtered state. (#5865)
- TabList: add an `isFullBleed` prop so a tab bar can bleed out to its container's inline content edges instead of requiring hand-written negative-margin CSS (#2622). Like Divider's `isFullBleed`, it cancels the nearest padded Layout container's `--container-padding-inline-*` custom properties with negative margins; the inner strip pads back by the amount the bleed exceeds a tab stop's own padding so edge labels remain aligned to the content inset. It is inline-only: TabList owns the inline full bleed, and the container owns the block-end dock. For that, LayoutHeader gains a `paddingBlockEnd` per-edge override in Section's existing spelling — `paddingBlockEnd={0}` docks the header's last child on its bottom edge so a tab strip's underline meets `hasDivider` at any header padding. The `detail-page` template now uses both props, aligns its ghost panel toggle with the container inset, and no longer carries any hand-written tab-row CSS.
- Add the vertical wizard page template. (#5672)
- Add the `work-item-detail` page template for task, ticket, issue, story, bug, card, and request detail surfaces. It includes responsive main-content and details-rail layouts, editable metadata, subtasks, attachments, comments, activity, and a narrow-viewport details dialog. (#5926)

#### Fixes

- build: a page that matched one word of the query is no longer offered as a direct match. A page template's keywords include every component its source renders, so `build "actionable warning banner"` returned `login`, `contact-form` and `documentation-design` at 95 apiece — an exact keyword hit on "banner" alone, plus the coverage garnish, landing exactly on the direct-match threshold. Three pages that are not warnings, presented as the page to start from. Coverage now gates the pages group rather than garnishing its score.
  Score alone could not carry the gate, so `scoreQuery` now reports the coverage it already computed: `matchedTerms` / `queryTerms` on every search result, with a whole-phrase hit reporting full coverage. A single strong hit and a broad weak one land on the same score, so a caller cannot tell "one of three concepts" from "three of three" without it.

  Rebased onto current `main`, which landed integration search (#5259) and the scorer-level false-direct-match fix (#5614) while this was open. Both are `main`'s implementations, untouched here — this branch no longer rewrites `gatherComponents`, so the two regressions that rewrite caused are gone with it: an integration result reports its own package again, and a broken config no longer turns a Core `button` search into an empty success.

  The other two pieces this branch used to carry now ship separately, as asked: the guidance-tier indexing in #5937 and the thin-kit hint in #5938.

- A thin `build` kit now says what to try instead of looking empty.
  `build "quantum flux capacitor telemetry"` returned one incidental component and the always-on frame list, and said nothing else. An agent reading that does not conclude its wording was wrong — it concludes the package has nothing and falls back on its own memory of what Astryx contains, which is the failure `build` exists to prevent.

  Below three offerable results the kit carries a `hint` naming the two commands that browse rather than search, and saying plainly that this is keyword matching, not semantic. The threshold counts what SURVIVED the score floors, not what search returned: `hasResults` is already true for a query that matched things and then filtered them all out, and that is the case most likely to be misread.

  `hint` is structured — `{reason, commands}` with bare subcommands — not a sentence with commands baked into it. The API cannot know how a project invokes the CLI, and a hardcoded `astryx component --list` does not resolve in a pnpm workspace, where every other command in this output renders as `pnpm exec astryx`. The renderer formats them through `formatCliCommand`, so they are runnable as printed, and a JSON caller gets the parts rather than prose to re-parse.

  `hint` is present only when it applies, so a healthy kit is byte-identical to before. The CLI renders it last, as a `FEW MATCHES` section listed in the legend's section order, so it is the line the reader leaves with.

  Split out of #5320 at review request. Public response doc (`build.doc.mjs`) and the `BuildKitResponse` type both updated.

- The shared CLI blog adapter (`blog.list`, `blog.detail`) cleared its 15-second abort timer as soon as `fetch` returned response headers, leaving the later body read unbounded in time, and buffered the entire response before checking the 5 MB size limit, so the limit didn't actually cap how much was read into memory. (#5286)
  The abort timer now stays active through body consumption. The body is read as a stream where available, checking decoded size after each chunk and aborting the read as soon as it exceeds the limit, instead of buffering the full response first.
- CLI: recorded runs no longer carry a raw agent session id, and the environment snapshot is scrubbed like every other value. (#6051)
  A `DebugEvent` claimed `redacted: true` while `env` had never been through the scrubbing pass, and it stored the raw `agentSessionId` beside its hash. A session id follows one person across every run they make, and a handler may forward these records anywhere — so the record shipped a stable identifier, and an agent name pasted in from the environment went out verbatim, under a flag that said neither had.

  The contract is now explicit on `DebugEventEnv`: no identity, attribution only from positive evidence, and free text scrubbed. `env.agentSessionId` is always null — join runs on `env.agentSessionIdHash`, which is what the raw value was for. Everything the CLI derives itself (platform, CI provider, locale, the hash) is still recorded verbatim, because a scrubbed snapshot is not worth keeping. `redacted` is set only on the sealed copy, after every pass has actually run.

  `DebugSchemaVersion` widens to `1 | 2` and the CLI emits `2`, so code that switches on it is forced to handle both rather than silently reading a field that no longer means what it did. `parseDebugEvent` is version-aware to match: a v1 record may carry the raw id, a v2 record may not and is rejected if it does.

  Not a breaking change: `debug` and the whole `DebugEvent` surface are unreleased — they land in this same release — so no published consumer ever saw the raw identifier.

- A manifest key this CLI does not know no longer discards the whole integration. `astryx.integration.*` was parsed with a strict schema, so one unrecognized field failed the parse — and an integration whose manifest fails to parse contributes _nothing_, taking its components, templates and codemods down with it. Since an integration is published once and installed against many CLI versions, a field added by a newer CLI reached every older consumer as total, silent loss of that package (#5119). Unknown fields are now ignored with an `unknown_manifest_key` warning naming them, and the rest of the manifest still applies; a _known_ field of the wrong type is still an error. (#5311 follow-up)
- CLI: a stray lockfile no longer overrides the `packageManager` your project declares. (#6051)
  One `yarn install` inside a pnpm project leaves a `yarn.lock` behind forever. A single lockfile used to outrank the `packageManager` field, so the CLI answered "yarn" for a project that says pnpm — and printed `yarn astryx …` in every command it suggested, including the invocation line written into agent docs, where agents copy it. `astryx doctor` called that setup healthy.

  The declared `packageManager` field now decides, whatever lockfiles sit beside it. The documented fallbacks are unchanged: with nothing declared, a single lockfile still answers, a committed `pnpm-workspace.yaml` / `.yarnrc.yml` / `bunfig.toml` still breaks a multi-lockfile tie, an unbroken tie still resolves to the neutral `npx` form with a doctor FAIL, and the runner is still consulted only when the whole walk found nothing.

  `astryx doctor` now WARNs when a lockfile contradicts the declaration, names the file, and says what to delete — instead of reporting the project as fine.

- `astryx search` (and `astryx build`, which shares its ranking) never surfaced a component whose exact multi-word keyword phrase was searched, if enough other unrelated candidates happened to each contain one of the query's individual words. Searching `"table of contents"` returned no results for `Outline`, even though `Outline.doc.mjs` declares `'table of contents'` verbatim as a keyword, because `Table`-related templates each matched `table` and `contents` separately and their combined per-word score outranked Outline's single exact match.
  A query that exactly matches a candidate's declared keyword (or name) verbatim is now promoted to a top-tier score, so it always outranks a candidate that only coincidentally contains several of the query's individual words. Single-word queries and queries that don't exactly match a keyword are unaffected.

  Follow-ups #6001 and #5994 preserve the coverage counts needed by build ranking while keeping them out of the public search result shape.

- CLI: `search` and `build` now report how many results MATCHED, not how many were returned. (#6051)
  `matchCount` on a `build.kit` envelope, and `output.resultCount` on a recorded run, were both the length of the list after `--limit` had cut it. A query matching two hundred things and one matching exactly twenty filed the same number, so nothing downstream could tell a capped answer from a complete one — and a thin kit read as "the package has nothing" when it was really "the cap hid the rest".

  `search --json` now carries `matchCount` alongside `results`, and the text view says `Results for "x" (2 of 57)` when the list was cut short. The payloads themselves are unchanged: `results` is still bounded by `--limit`, and the kit still surfaces at most 3 pages, 5 blocks, and 6 components.

- Rename five dashboard page template catalog slugs to reusable pattern names, per the naming convention in Contributing Templates: `dashboard-data` → `dashboard-comparison`, `dashboard-executive-summary` → `dashboard-scorecard`, `dashboard-portfolio` → `dashboard-composition`, `dashboard-project-status` → `dashboard-progress`, and `dashboard-service-monitoring` → `dashboard-alert-rail`. Each old slug named the data or task rather than the reusable pattern, so it under-served neighbouring requests: the composition-over-time shape is not specific to portfolios, and the alert-rail shape is not specific to service monitoring. The old slugs no longer resolve because catalog lookup is exact-match; use the new current-catalog values above. The `template` command and machine-readable schema are unchanged. (#5927)
  Two categories move with their slugs: `dashboard-comparison` takes `Dashboard - Comparison` (it previously shared `Dashboard - Analytics` verbatim with the `dashboard` template, so neither owned the keyword) and `dashboard-scorecard` takes `Dashboard - Scorecard`. Both values are added to the `TemplateCategory` union; the superseded values stay reserved. Domain vocabulary — portfolio, holdings, monitoring, uptime, executive summary — is untouched in each `description`, which is where retrieval actually reads it from.

  Also fixes a typo in the scorecard template's `name` field ("Executive Summary Dashoard").

- Deduplicate parent-owned theming targets in CLI discovery while preserving each child component's direct documentation. (#5767)
- Preserve anatomy when loading localized component docs directly (#5761)
  The validated component-doc loader now applies the same full-overlay fallback as the CLI loader, so omitted localized anatomy inherits the canonical structure while explicit localized anatomy still wins.
- Package-manager detection: don't let a stray lockfile decide (#5301)
  `detectPackageManager` checked lockfiles in a fixed order and returned the first hit, so a directory holding more than one lockfile was resolved by array position. `yarn.lock` is first in that array, which means a single `yarn install` inside a pnpm project silently switches the CLI's answer to yarn — permanently, because the stray lockfile stays on disk.

  Every command the CLI prints is then wrong, including the invocation line written into the agent-docs block, which agents copy verbatim into their own runs.

  An explicit `packageManager` declaration is authoritative even when the project also contains one or several lockfiles. Without a declaration, a single lockfile remains decisive. When several lockfiles sit in one directory, the tie is broken only from other evidence the project owns: a committed package-manager config file (`pnpm-workspace.yaml`, `.yarnrc.yml`, `bunfig.toml`). A stray `install` drops a lockfile; it writes none of those.

  The runner (`npm_config_user_agent`) deliberately does NOT break that tie. An agent handed the wrong `yarn astryx` line runs the CLI through yarn, so the runner agrees with the mistake and regenerating agent docs writes the wrong line again — the failure reproduces itself. The same holds for an installed binary invoked from that shell. Both now have regressions that start from the wrong line.

  When nothing project-owned decides it, the CLI does not guess. `detectPackageManager` returns the neutral `npx`, which is correct under every package manager, and the new `explainPackageManager` reports `ambiguous` with the tied candidates. `astryx doctor` turns that into a FAIL naming the directory and the fix — add a `packageManager` field, or delete the lockfile that does not belong. It is the refusal `findConfigPath` already makes for coexisting config files.

- LayoutPanel: add playground wrapper and default children for docsite preview (#5919)
  Prevents the properties-tab preview on the docsite from rendering an empty stage by wrapping LayoutPanel inside a Layout scaffold with representative panel content in start slot.
- Preserve canonical anatomy in localized component docs (#5753)
  Localized component docs now inherit canonical anatomy when they omit it, while explicit localized anatomy still takes precedence.
- Make the table-filter page template usable on narrow and touch surfaces: View options, the detail panel, the saved-view dialogs and the filter overflow adapt to bottom sheets, the filter and saved-view rows hold one line, and column freezing is dropped where there is too little width to scroll the rest. (#5829)
- Correct Neutral Banner interaction tints so light mode uses translucent light overlays and dark mode uses translucent dark overlays. (#5936)
- Use palette-backed red interaction overlays for Neutral destructive
  buttons, solid dark-palette tone-25 backgrounds (tone 20 for gray), and calmer dark-mode text colors. Use a palette-backed muted blue tint for dark info banners while preserving the existing light-mode non-semantic color mappings. (#6049)
- Give Neutral segmented controls a roomier inset while preserving their outside height. (#5851)
- Rename built-in syntax theme identifiers. (#5847)
- Remap Neutral's semantic, syntax, and categorical color tokens to the
  reviewed theme-owned palette through named stop references. Keep the maintained CLI template synchronized. (#6034)
- Keep query-coverage metadata internal to build ranking while preserving it for promoted exact-phrase matches. (#5994)
- `search` indexes a component's usage guidance, one tier below its description. (#5937)
  A component's best practices are where the reader's vocabulary lives. `Banner` describes itself as "a persistent message"; only its guidance says "caution", "problems", "form errors". None of those words found it, because guidance was never read — 97 core components ship guidance, and all of it was invisible to search.

  Measured on the real registry, before and after: `caution`, `problems`, `sources` and `attention` each now return the component whose guidance defines them, and each returned nothing relevant before.

  Guidance scores 45, below description's 50, so a component that IS the answer still outranks one whose advice merely mentions the term — the ordering that put `Toast` behind `Card`, `Dialog` and `Item` on "notification".

  It sits deliberately BELOW `MIN_TOKEN_SCORE`, so it never counts as a matched concept in a multi-word query. That is not a detail: letting it count was measured moving `nested menu` from SideNav to List, and `explain why a field is required` from Field to TextInput — a component whose guidance happens to mention the other word displacing the one that is the answer. Breadth is not relevance, the same reason `weakKeywords` are capped. With the floor left at 50, a 28-query sweep shows zero top-result changes and zero regressions, while the single-word gains above are kept.

- Table inbox replies now preserve an unsent body only for the same conversation, preventing text from following changed recipients. (#5934)

#### Documentation

- The namespaced-icon rationale and the add-a-semantic-icon intro in the icons guide, and the `SideNavItem` `actions` prop description, now use a comma and a colon in place of prose em dashes. Meaning unchanged. (#5647)
- The description prose of 12 page templates now uses parentheses, commas, and colons in place of em dashes. These strings feed the CLI template list and the doc site, so plain punctuation reads better there. Meaning unchanged. (#5679)

#### Other Changes

- Core's postinstall no longer hand-mirrors the setup contract. `packages/core/scripts/agent-doc-state.mjs` is now GENERATED byte-for-byte from the CLI's dependency-free leaf `packages/cli/foundation/agent-docs/agent-doc-state.mjs`, and `pnpm check:setup-contract` — wired into `check:repo` — fails the build when the two differ. (#4162)
  The previous guard compared two hand-edited constant lists. That caught a new agent-doc path or a new marker, and nothing else: the predicate itself, and the `shouldNudge` decision matrix duplicated in both postinstall scripts, could still drift and leave layer 1 and layer 2 disagreeing about "is this project set up?" with the test green. `shouldNudge` and the nudge string move into the contract as well, so all four things — paths, markers, predicate, decision — now have one definition and one place to edit.

  Behavior is unchanged, and verified rather than assumed: the nudge text is byte-identical, legacy `<!-- XDS:START -->` blocks still count as set up, all six agent-doc locations are still detected, and both scripts still exit 0 on every path including failure. Core loads its copy with a dynamic import, so a packaging mistake degrades to "no nudge" instead of throwing out of module evaluation and failing a consumer's install. `check:setup-contract` also fails if core stops listing the generated file in `files`, so it cannot go missing in the first place.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ernestt
- @Geervan
- @harjothkhara
- @jiunshinn
- @josephfarina
- @kentonquatman
- @nynexman4464
- @rubyycheung

---

# 0.5.2

#### Fixes

- Rename the Data Input component category to Form Controls (#5686)

#### Contributors

Thanks to everyone who contributed to this release:

- @rubyycheung

---

# 0.5.1

#### New Features

- Component docs can declare structured `usage.accessibility` requirements, and `astryx component` renders them as a dedicated Accessibility section in full and compact output. Translated and dense documentation overlays preserve the base accessibility guidance unless they explicitly replace it. (#5646)
- Icon APIs and themes accept namespaced extension keys, and NumberInput steppers use `numberInput:stepperDown` without widening the required `IconRegistry` keys (#5466)
  `<Icon icon>`, `useIcon`, and `defineTheme({icons})` accept keys such as `numberInput:stepperDown` and `richtext:bold`; misspelled built-in names remain type errors. NumberInput keeps a compact centered Core fallback, while themes can override its steppers independently from the shared `chevronDown` semantic.
- Rebuild the `settings-dialog` page template with searchable navigation, responsive grouped controls, live appearance previews, configurable keyboard shortcuts, and docsite gallery visibility. (#5568)
- New `table-filter` page template: a table page built around a filter token list (#5448)
  Ports the feature set of the internal XDS table page pattern onto Astryx primitives. The filter row is a token list of quick-filter toggles and field controls — `Selector`, `MultiSelector`, and a `ComplexSelector` wrapping a range `Slider` — that swaps to `PowerSearch` for anything the tokens can't express. Both modes read and write the same `PowerSearchFilter[]`, so a filter built in either survives the swap. Controls carry field chrome when unset and a pressed fill once they hold a value, so the row reads as one family whether a clause came from a toggle or a selector.

  Around that: saved views that capture the filters and the whole table configuration, a bulk-edit bar that slides in on selection, and a view options popover with four panels — a drag-and-drop column transfer list, density, sticky edges, and grouping — that apply instantly. Clicking a row opens a resizable detail panel. The list pages in by infinite scroll against an `IntersectionObserver`, with skeleton rows aligned to the table's own column grid standing in for the batch in flight, and empty states for the no-results and no-data paths. The toolbar wraps to a second row under a container query rather than a viewport one, so it responds to the width the detail panel leaves it.

  Uses the `Table - Filtering` category, already reserved in the `TemplateCategory` union.

#### Fixes

- `build`/`search` no longer rank a partially-matched template above one matching every term, no longer index TypeScript generic arguments as rendered components, and no longer treat breadth of rendered components as full-strength relevance. (#5614)
- Component and hook names resolve case-exactly on macOS and Windows, matching Linux (#5478)
  `findComponentReadme`, `findComponentSource` and `findHookDoc` probed candidate paths with `fs.existsSync`, which answers through the filesystem's own case folding. On a case-insensitive filesystem `astryx component button` resolved to `Button` instead of reporting an unknown component with suggestions, and `findHookDoc(core, 'mediaquery')` returned `.../hooks/useMediaquery.doc.mjs` — a spelling that exists nowhere, and that breaks any consumer reading it on Linux. The probes now verify each path segment against its parent's real directory listing, so these component and hook lookups resolve the same names to the same real paths on every host. The deliberate case-insensitive hook lookup is unchanged; it now returns the file's true casing.
- The 56 `--color-data-*` defaults now reach runtime CSS and built themes from the same source, while dashboard template fallbacks match those defaults (#5562, #5566)
  The defaults live once at `:root` in `@layer astryx-base`, so nested themes inherit parent overrides and `astryx theme build` matches `<Theme>` while `generateThemeCSS` keeps its existing return shape.

  **Visual change.** A chart or template that previously painted nothing or used a mismatched hex fallback now paints the data token's default. Pin an explicit color to preserve a previous fallback.

- The theme-showcase page no longer clips its own controls. In the store's product cards the quantity field and "Add to cart" button spilled out of both sides of the card; in the checkout card the card number truncated mid-number (`1234 1234 12`), the country selector ellipsized, and the pay button was left with only a few pixels of slack. (#5539)
  The product-card row is the more visible of the two. It had no width of its own — the enclosing stack centers rather than stretches its children — so it sized to its contents and, being centered, overflowed the card at both edges once those contents outgrew it. That stayed hidden while the quantity field was narrow, and surfaced when `NumberInput` moved to `type="text"` for formatted display: a text input's default `size=20` made the field ~200px instead of ~65px, and the template was pinning it with a `style` `minWidth` (a floor, not a cap) plus `flexShrink: 0`. The field now uses `NumberInput`'s `width` prop, which is what actually sizes a field, and the row is pinned to the card width and allowed to wrap so the button drops to its own full-width line instead of ellipsizing on a narrow card.

  The checkout sat in a grid track with a 200px minimum, so its width was a fraction of however many tracks happened to fit — it swung between 208px and 328px as the viewport resized, and the narrow end is well under what the form needs. Themes with a large spacing scale suffered most: Matcha's `--spacing-5` card padding alone spends 60px of that budget.

  The checkout and chat panels are now a wrapping flex row. They share a row at roughly 1:2 while both flex bases fit, then the chat drops to its own full-width row, which makes 300px a floor for the checkout rather than an accident of the track count. Raising the track minimum instead would have left a tall gap beside the checkout at mid widths, since a two-track row can't hold a two-track span.

  Two narrower fixes ride along, both text the card was breaking rather than fitting: the payment-method grid's minimum goes 70px to 80px so "Google" stops breaking mid-word on Matcha and Y2K, and on phones the card drops one padding step and sheds the card number's decorative start icon, which together buy back the room a 16-digit number needs at 360px.

#### Documentation

- `useAnnounce`, `useTypeahead`, `useInteractiveRole`, `useLongPress`, `useInputStatusIcon`, `useDevWarning` and `useIndicatorFocusRing` are now discoverable. The CLI's hook index is built from the `.doc.mjs` files next to each hook, and these seven shipped without one; so `astryx hook <name>` answered "No hook named", `astryx hook` omitted them and `astryx search` never returned them, while the package exported them with full TSDoc. Agents following the documented discovery workflow concluded the primitives did not exist and hand-rolled replacements; for `useAnnounce` that means a hand-built `aria-live` region, which usually does not announce at all. A test now fails when a hook is exported from the barrel without a doc, so the index cannot silently go stale again. (#5109)
- rewrite all 46 page template descriptions to describe layout, container, data shape and behaviour — the things that actually differentiate one template from its siblings — instead of the sample data they happen to ship with, so `build` and `search` retrieve them from a description of the problem rather than a guess at the slug. (#5615)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ernestt
- @rubyycheung

---

# 0.5.0

#### Breaking Changes

- Banner: the collapse axis moves onto one `collapsible` prop, and content can opt out of collapsing (#5255)
  Banner inferred its disclosure from its content: any `children` got a chevron in the header and were hidden until it was pressed. There was no way to show content without a toggle — the case a banner most often wants, a list of the three fields that failed validation — and `defaultIsExpanded` was the only knob, with no controlled mode.

  The whole axis is now one `boolean | CollapsibleConfig` prop, following the boolean-or-config convention `SideNav.collapsible` set, and backed by the shared `useCollapsible` hook rather than Banner's own state:

  ```tsx
  <Banner status="error" title="3 fields need attention">…</Banner>  // unchanged: collapsible, starts closed
  <Banner collapsible={false}>…</Banner>                             // new: always visible, no toggle
  <Banner collapsible={{defaultIsOpen: true}}>…</Banner>             // replaces defaultIsExpanded
  <Banner collapsible={{isOpen, onOpenChange}}>…</Banner>            // new: controlled
  ```

  **The default is unchanged** — a banner that never mentioned `defaultIsExpanded` behaves exactly as it did. The breaking part is the prop itself: `defaultIsExpanded` is removed in favour of the config, which is a type error at every JSX call site that names it.

  **Codemod:** `npx astryx upgrade --codemod banner-collapsible-content`

  It rewrites `defaultIsExpanded` to `collapsible={{defaultIsOpen: true}}` and drops `defaultIsExpanded={false}`, which is now the default. Banners that never set the prop are left alone.

  **One case the codemod and the compiler both miss: a spread.** `defaultIsExpanded` inside a props object is out of the transform's scope. A props object in a typed position still fails to compile — but an inferred one that is spread, `<Banner {...args} />`, does not, because TypeScript does not excess-property-check a spread. The prop then falls through to the DOM and the banner quietly starts collapsed. **Grep for `defaultIsExpanded` after running the codemod** and migrate any spread sites by hand.

#### New Components

- Promote `Stepper` and `Step` from the canary-only Lab package to Core. The stable package now ships their existing horizontal/vertical layouts, separated and on-track indicators, semantic status, density, and non-linear navigation, plus Core documentation and rendered examples. The default `aria-label` is now localized.
  Advancing one step now animates the connector. Every connector the four layouts draw — the separated bars and the on-track segments alike — grows its accent fill out of the segment's leading edge instead of swapping a background color, so moving forward reads as progress travelling the track. That one gesture is the only thing that animates: going back, jumping forward by more than one step, and mounting mid-flow all apply at once, as does any change under `prefers-reduced-motion`. Retreats are deliberately instant — run in reverse the same transition ends on a shrinking stub of accent, and a remnant still on the track reads as unfinished where the identical curve growing forward reads as arrived — and multi-step jumps are instant because a jump is a navigation rather than a progression, so sweeping a front across the crossed segments only makes the user sit out a journey they asked to skip. Where one span is drawn by several segments (the on-track layouts split a span between two steps, three when a content slot sits between them) the segments take abutting slices of the span's time and run linearly, so the fill reads as one line growing at a constant speed rather than pieces lighting in turn.

  Five visual fixes land with the promotion. Horizontal steps now divide the track evenly instead of sizing to their own labels, so every progress segment is the same width regardless of how long a step is named. Number indicators shrink from 20px to 16px to match the check, ring, and custom-icon indicators, so a step swapping its number for a check as it completes no longer nudges the label beside it. A step description now occupies a 16px box rather than a 24px one — it previously inherited the page's line box instead of applying its own leading, which opened an 8px gap under the label. A step's content slot now starts flush with the label above it at every density: the slot renders outside the density-padded label area, so it was hanging one pad short of it. And a vertical on-track step carrying content keeps its connector unbroken — the content renders below the row that draws the line, so the track used to split open around any step with content (#5201).

#### New Features

- AspectRatio: emit `ratio` as a class-level declaration instead of a hard inline style, so the ratio can be overridden responsively: StyleX consumers pass an `aspect-ratio` rule via `xstyle` (including under `@media`/`@container` conditions), and plain-CSS/Tailwind consumers override `aspect-ratio` from their own unlayered rules, which beat the `astryx-base` cascade layer regardless of specificity. The mixed-gallery template's hero now switches 3:1 to 3:2 when the grid stacks with a one-line override on a single element, replacing the duplicated hero markup the fixed inline ratio previously forced (#3883, closes #2798)
- CLI: `astryx theme targets` lists every component theming target — the `defineTheme` key, the class it paints, and the props and states it accepts — for one component or the whole system, with `--json` for lint and audit scripts. `astryx theme --help` now points at component overrides instead of reading as a build-tool menu. The listing and `theme build`'s override validation share one enumeration of the component docs, so neither can drift from the components (#5115).

#### Fixes

- neutral theme: darken the light-mode error red from `#e33f4a` to `#c9303a` so the filled `Badge variant="error"` label clears WCAG 2.1 AA. White on `#e33f4a` is 4.14:1 and the badge label is 12px/weight 500, so the 4.5:1 normal-text threshold applies rather than the 3:1 large-text allowance; `#c9303a` gives 5.29:1 while holding the hue (OKLCH H 21.9 -> 22.8, C 0.200 -> 0.189). StatusDot and the ProgressBar `--color-error` rebinding move with it — both are documented as tracking the badge fill so the dot and its badge read as one status language. Dark mode is untouched (dark text on `#ff705d`, 6.60:1). Adds `scripts/check-badge-contrast.test.mjs`, which resolves every theme's badge label/fill pair through `light-dark()`, `var()` indirection and alpha compositing, and holds all of them to 4.5:1 (#4446).
- Unified search and build now include components contributed by integrations, so a component registered through an integration is findable and buildable alongside the built-in set instead of silently missing from both (#5259).
- Table - Grouped page template: wrap the rows in `TableBody`
  The template rendered `<TableRow>` straight into `<Table>`, so the emitted DOM was `<table><tr>`. `<table>` cannot contain a row directly: the HTML parser inserts an implied `<tbody>` when it parses server-rendered markup and React does not when it renders on the client, so anyone who copied the template into an app as a server-rendered page inherited a hydration mismatch in their own app. Client-only the DOM is still invalid — nothing reparents the rows, so the table ends up with `<tr>` children and no `<tbody>` at all, and any CSS or query aimed at `tbody` silently misses.

  The rows now sit in `<TableBody>`, the same element the data-driven `data={...}` path renders, so styling, dividers, and column widths are unchanged (#5278).

#### Other Changes

- Public component theming vars are enumerable, and guarded against being documented but unsettable
  `collectThemingVars` joins `collectThemingTargets` as part of the one enumeration the theming surface is read from. Two guards ride on it: a documented public var no component reads compiles to a declaration that never applies, and a var the component writes inline outranks every cascade layer, so no theme can reach it. Both had shipped; neither is visible in the generated theme CSS the jsdom suites assert on (#5409).

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @andrskr
- @cixzhang
- @ernestt
- @freddymeta
- @jiunshinn
- @rubyycheung

---

# 0.4.7

---

# 0.4.6

#### New Features

- An integration can contribute reference-doc topics: point `docs` at a root in `astryx.integration.*` and every `{topic}.doc.{ts,mjs,js}` under it is served by `astryx docs`, indexed by `astryx search`, and named in the agent-docs block, beside the built-in topics. A topic may also declare `replaces: '<topic>'` to take over an existing one (renaming it leaves the old name resolving as an alias) or `extends: '<topic>'` to merge onto one section by section. A name that collides without declaring either is an `invalid_doc` issue rather than a silent override, and `validate-integration` reports it. (#5311)
  Also fixes the agent-docs block's topic list, which scanned for `\w+` and so silently dropped every hyphenated topic — `getting-started`, `cli-integrations`, `browser-support`, `styling-libraries` and `working-with-ai` were missing from every block ever written, and an agent cannot ask for a topic it was never told about.
- Five dashboard page templates: `dashboard-cohort-funnel`, `dashboard-data`, `dashboard-executive-summary`, `dashboard-project-status` and `dashboard-service-monitoring`. Each is a complete page — layout, realistic sample data, and the component choices that go with the shape of the data — so `astryx template <name>` gives you something to edit rather than a blank frame (#5245).

#### Fixes

- `component` built the import specifier for an integration component by joining the package name and the component name, which assumes every component is exported from a subpath named after itself. Components are commonly grouped behind a single entry point named after the concept, so the suggested import pointed at a subpath the package does not export and did not resolve (#4810).
  The specifier is now resolved against the owning package's `exports` map, keyed on the directory the component's doc file sits in, and falls back to the package root when that directory is not an exported subpath. A specifier a doc file states for itself is also no longer overwritten.
- The upgrade codemod no longer collapses significant JSX whitespace when it renames an element tag. Renaming `<OldName>` next to text and a `{expression}` (e.g. `hello {name} world`) previously dropped the adjacent space (`hello {name}world`); element-tag renames are now spliced into the output so the surrounding JSX is left untouched (#5149).
- The XDS-prefix codemod no longer produces a file that will not compile. Dropping the prefix renames `XDSButton` to `Button`, but if the file already had a local binding called `Button` the rewrite collided with it and shadowed one of the two. The import is now aliased instead, so both survive and the file still typechecks (#5225).

#### Contributors

Thanks to everyone who contributed to this release:

- @ejhammond
- @josephfarina
- @kentonquatman
- @rubyycheung

---

# 0.4.5

---

# 0.4.4

#### New Components

- Promote `BottomSheet` and `BottomSheetSwitcher` from the canary-only Lab package to Core. The stable package now includes their existing native-dialog, drag-detent, transition, and mobile-keyboard behavior, plus Core documentation and examples (#5080).

#### New Features

- `astryx template --cdn` writes a working no-build-step CDN starter page (#5068).
  A CDN starter is a template, so it joins the template family beside `--skeleton` rather than claiming a top-level command. It is a flag and not the positional `astryx template cdn` because the positional resolves against everything `discoverAll()` finds, where a `cdn` id would shadow a discovered template. `cdn.template.html` loads Astryx from jsDelivr and esm.sh with no bundler, no install and no build step, with every CDN URL pinned to the Astryx version you have installed — an unpinned CDN URL resolves to whatever is latest and is cached hard, so a page written today breaks tomorrow without being edited. An existing file is never clobbered; `--overwrite` replaces it, and `--json` returns the receipt.

  The annotations are the things that are load-bearing and silent when missing: `?external=react,react-dom` (without it esm.sh bundles a second React and every hook throws `Cannot read properties of null (reading 'useState')`), `react/jsx-runtime` in the import map (the published bundle imports it; omitting it fails the page with `Failed to resolve module specifier`), and a `font-family` on `body` (nothing in the stylesheets sets a document font, so `Button` — which is `font: inherit` — otherwise renders its label in the browser's default serif).

  Three more lessons came out of building a real app on it. The page now `<link>`s the theme's webfont from Google Fonts, because the theme _names_ Figtree and never loads it, so every viewer silently got the fallback stack (#5015 again). It imports the theme OBJECT and wraps in `<Theme theme={neutralTheme} mode="system">`, so light and dark follow the OS — the `data-astryx-theme` attribute alone scopes the stylesheet but cannot switch modes. And `#root:empty` carries a "Loading…" state, because ESM-from-CDN has real latency and a blank page reads as broken. Markup is `htm`, with a comment saying it is optional and `createElement` is the dependency-free alternative.

  A recipe that is only read is a recipe that is only assumed to work, so CI renders it: `.github/scripts/cdn-template-smoke-test.mjs` scaffolds the page with the real CLI and opens it in headless Chromium, failing on any console error, page error or failed request, and on a page that loads without rendering.

- `astryx theme build` takes any number of theme files — `astryx theme build themes/*.ts` compiles them all in one process, so an app with several themes no longer hand-rolls a loop that re-enters the CLI once per theme. Outputs are byte-identical to the serial invocations; the run stops at the first failure and names the theme that failed. The CLI's Node floor (>=22.13) is now declared in `engines`, so a package manager can enforce it at install instead of the build failing later (#5121).
- `defineTheme`: `color.accent` accepts a `[light, dark]` tuple (#2279)
  `ColorScaleConfig.accent` now takes either a single hex or a `[light, dark]` tuple, matching `TokenValue`. With a tuple, `expandColorScale` derives the light half of every generated `light-dark()` pair from the light seed's palettes and the dark half from the dark seed's, so each scheme gets a consistent derived palette (muted, on-accent, neutrals) instead of the `tokens['--color-accent']` workaround that skips scale generation. Single-string configs are unchanged, token for token. Also documents the precedence between `color` and `tokens` for accent-derived values: `tokens` entries win token by token, the `var(--color-accent)` reference tokens follow a `--color-accent` override at runtime, and the baked `--color-on-accent` stays derived from the `color.accent` seed.

#### Fixes

- Bottom Sheet showcase block: the filter checkboxes are interactive again (#5157).
  `CheckboxInput` is fully controlled — `value` is required and the input only moves when the owner updates it. The showcase passed a literal `value={false}` with no `onChange`, so the three filters ("In stock", "On sale", "Free shipping") rendered but could never be toggled: on the docs site the first thing a reader tries in a Bottom Sheet does nothing, and anyone copying the block inherits three dead controls. Each filter now has its own `useState` and `onChange`, matching the checkbox wiring already used in the Bottom Sheet Switcher showcase.
- An integration whose manifest fails to load is no longer silent. A manifest that throws on import — the common case being one still calling a `create*` authoring factory, removed in 0.3.0 — contributes nothing, and the CLI treated that as if the package had never been configured: `astryx discover` answered `No integrations configured.` while `astryx.config.mjs` plainly configured one, and no command said a word. The only way to find out was to already suspect it and run `validate-integration` by name. A configured integration could remain invisible to CLI discovery, leading an app team to conclude that its components did not exist (#5119).
  The load error now counts as an integration issue, so the existing one-line stderr nudge fires on `component`, `template` and `upgrade`, and `discover` — the command whose whole job is listing integrations — nudges too, as does `search`. `discover` also stops reporting `configured: false` for a project that configured an integration that failed to load; the empty state now distinguishes "you configured nothing" from "what you configured contributed nothing", which is the distinction `meta.configured` was introduced to carry.

  Nothing becomes fatal: the warning is best-effort, stderr-only, suppressed under `--json`, and never changes an exit code. Broken contributions are still skipped exactly as before.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @imdreamrunner
- @jiunshinn

---

# 0.4.3

#### Fixes

- The unloaded-font advisory is a notice, not a warning. A theme file cannot load a font — Astryx sets `--font-family-*` and loading is the app's job — so #5045's advisory fires on any theme naming a webfont, including a perfectly correct one. As a warning that made a clean build read as defective, and it put the shipped template permanently in violation of its own "compiles with no warnings" guard (#5079 had to allowlist the template's two font names in that assertion).
  The `theme.build` receipt now separates the two: `warnings` are defects the author should fix, `notices` are advisories about a correct theme. The font advisory moves to `notices` and to stdout with the rest of the build's progress; stderr stays for defects. The template guard is back to `warnings` being empty, and no longer needs to know which fonts the template names.

  Programmatic callers reading `data.warnings` for font advisories should read `data.notices`; the message text is unchanged.

- `extends` now reaches the CSS. A theme that extended another built a stylesheet holding only the declarations it stated itself: the base's tokens, component overrides and surface rules were all absent, and because each theme is `@scope`d to its own `data-astryx-theme` value, loading the base's stylesheet alongside could not fill the gap either. Every consumer of an inheritance chain silently got stock geometry, elevation and type with a new palette painted over it (#5067). Nothing warned; the loss only showed up by diffing two generated stylesheets token by token.
  The cause was `theme build` shadowing its own inputs. It writes `<name>.js` next to `<name>.ts`, and the loader resolved a plain `./<name>` specifier to that generated artifact before the source — so the second build of a family read the artifact, which carries no `components` and exports `<name>Theme` rather than whatever the source exports. A named import that missed became `extends: undefined`, and `defineTheme` treated an absent base as no base at all. The loader now resolves source extensions first, which is also the resolution the author's TypeScript sees, so the CSS a build emits matches the theme that type-checked.

  Three things behind it are fixed too, so the failure cannot come back by another route. `defineTheme` **throws** when `extends` is present but is not a theme, naming the likely cause, instead of inheriting nothing — the one behavior change here, and it turns a silent stylesheet into a build error. A theme's `onDark`/`onLight` surfaces and its `__inputTokens` are now inherited like its tokens and components were, so a child no longer reverts its base's inverted-surface customizations to the defaults or loses its `[light, dark]` tuples. And a built theme module now carries the resolved `components` and surfaces alongside its tokens, so extending one — the `./built` subpath every shipped theme exposes — is no longer lossy. `theme build` also stopped hand-picking fields when it re-resolves a plain object theme file, which dropped `extends`, `color` and `syntax` on the way in.

  An extended theme is flat: everything it inherits is resolved into its own output, and its stylesheet stands alone. Measured on a 14-theme family (one base, 13 palettes extending it): each palette went from 25 custom properties and no component rules to the base's full 175 and 70, with its own colours still winning.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.4.2

#### New Features

- `astryx theme build` warns when a theme names fonts it does not load. The resolved `--font-family-*` tokens and component-override `fontFamily` values are checked against CSS generics and known system families; anything else gets one warning per family in the receipt and, after the install instructions, the `<link>`/`@font-face` snippet to add. `astryx docs typography` gains a Loading Custom Fonts section (Google Fonts and self-hosted recipes, `font-display: swap`, real fallback stacks), and the theme docs' production-build section points at it (#5015).
- `astryx theme template` writes an annotated theme template into your project (#5048).
  New sibling of `theme add`: where `add` starts you from a theme we ship, `template` starts you from a blank annotated one. `astryx init --features theme` calls the same leaf, so project setup writes it too — it previously printed a one-line hint and wrote nothing, which is the weakest form of the help a theme author needs, since the first problem is not knowing the command but not knowing what the theme surface contains. The file is `theme.template.ts`: every `defineTheme` field with a note on when to reach for it, the token families, the component override syntax, and the consumption steps (providing the theme, loading the fonts you name, building for SSR), each section naming the CLI command that prints its authoritative reference. An existing file is never clobbered.

  This came out of a vibe test (#5047): agents given an annotated template reached twice as far into the theme surface as agents given only the docs (17 component targets vs 8, and the only arm to use interaction states, custom variants and `onDark`), and shipped a third of the contrast defects.

  A template that lies is worse than no template, so its claims are machine-checked against live sources rather than trusted: `scripts/check-theme-template.test.mjs` fails when a `defineTheme` field is added and left undocumented, when a token family is missing from the inventory, when a CSS variable or component key it names does not exist, when it cites a docs topic that does not, or when a theme source drops its SYNC reference. `theme build` compiles it warning-free in CI, and the CLI typecheck now covers it.

#### Fixes

- Heading's `type` is a documented theming target, and the docs stop teaching a CSS variable that does not exist (#5016).
  `Heading` reflects `type` as a theme selector — `typography.scale` generates `heading: {'type:display-1' …}` rules for it — but `theming.targets` listed only `level` and `color`, so `astryx theme build` warned `Unknown prop "type" on component "heading"` on every theme that sets a type scale, including the shipped `neutralTheme`. The drift guard missed it twice over: it read a conditional spread (`{level, color, ...(type && {type})}`) as an unknown bag, and it only checked a component against a doc file in its own directory, so `Heading/` — documented from `Text/Text.doc.mjs` — was never checked at all. Both are fixed, which brings three more previously unchecked directories under the guard.

  Separately, the theme docs' component-override example set `--button-press-scale`, which no component defines: copying it produces CSS that silently never applies. It now sets a real public var, and the example no longer declares the same `button` key twice.

- Two guards left failing on `main` by their own landings, so every PR since has been red through no fault of its own. #4963 gave Thumbnail's remove button a coarse-pointer hit-area var and did not document it, which the derived-var guard reads as an undocumented private var; the var is an `inset` on a `::after` overlay, so it is documented as private and listed alongside the other vars no standard CSS property maps onto. #5026 moved `borderDefaults` into `CoreTokenName` — the landing the theme-template guard was explicitly waiting for (its comment says "when #5017 lands, this guard starts requiring the template to cover it") — so the template's token inventory now names `--border-width`.

#### Documentation

- MobileNavToggle preview simulates a mobile AppShell instead of an empty stage: new playground.appShellMobile for components that render nothing without AppShell mobile context (#4983)

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cixzhang

---

# 0.4.1

#### Fixes

- `astryx theme build` no longer warns `Unknown prop` for documented state override keys. Component docs declare state-driven selectors under `theming.targets[].states` (`radio` → `checked`/`disabled`, `calendar-day` → `today`/`selected`, …), but override validation only loaded `visualProps`, so the state syntax the Theming Infrastructure wiki documents — `components: {radio: {checked: {...}}}` — warned on every build. The CSS was always generated correctly; only the warning was wrong. 30 targets across core were affected (#4778).

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.4.0

#### Breaking Changes

- DropdownMenu's two item modes are peers again. Compound mode gains a `DropdownMenuDivider` component (aliased as `ContextMenuDivider` and `BreadcrumbMenuDivider`), which the data path also renders, so `{type: 'divider'}` and `<DropdownMenuDivider />` produce identical DOM, spacing, and theme target. Data mode gains `endContent` and `description`, so an `items` row can carry a shortcut hint or secondary text without dropping to compound mode. Its `label` widens from `string` to `ReactNode`, matching compound mode: the narrowing existed only because rows were keyed by label, and they no longer are (#4953).
  The bare names now belong to those components, so the data-mode option types take the `Data` suffix their sibling `DropdownMenuItemData` already carries: `DropdownMenuDivider` → `DropdownMenuDividerData`, `ContextMenuDivider` → `ContextMenuDividerData`, `BreadcrumbMenuDivider` → `BreadcrumbMenuDividerData`. TypeScript cannot re-export a value and a type under one name from a single barrel, so the rename is what makes the components exportable at all. Run `astryx upgrade --apply` to rewrite the type imports; a missed one fails at compile time rather than silently.

#### New Features

- Add the `migrate-table-rowexpansion-to-tree` codemod (runs on `astryx upgrade`): rewrites the removed `useTableRowExpansionState` tree pattern to `useTableTreeState` + `useTableTreeData`. Detail-panel usage (`renderExpanded`) is left untouched. (#4884)
- Add a self-documenting layer to the CLI: typed, colocated `.doc.mjs` for every command, every `@astryxdesign/cli/api` function, and every authored schema (config, integration, codemod, the response envelope, and the doc-types themselves). Adds the `FunctionDoc`, `SchemaDoc`, `CommandDoc`, and `EnumDoc` authoring types with sealed parsers. (#4714)
  Every command's `--help` and its `astryx manifest` entry are now built from that command's colocated `CommandDoc` via a `defineCommand` converter, so the docs and the CLI can no longer describe different things. The migration is behavior-preserving: help text, command output, error paths, and exit codes are byte-identical.

  The CLI README's command, error-code, and response-type tables are now generated from the manifest and the `EnumDoc`s, correcting real drift — the error-code table listed two codes that do not exist and omitted several that do, and the command table was missing `blog`, `build`, `layout`, and `validate-integration`.

  Kept honest by a drift harness (docs vs the live CLI), `check:cli-structure` (each doc-type and `api/` leaf ships its full file set), and lint rules for the CLI's layering.

- Add themeable indicators — the componentized check, checkbox, and radio visuals. `defineTheme({indicators: {check: RadioIndicator}})` replaces one by name, and every component drawing it follows. (#4712)
  Theme targets now follow the component-name convention: `checkbox-indicator`, `radio-indicator`, `radio-indicator-dot`. The old names (`checkbox`, `radio`, `radio-dot`) remain emitted on the same element so existing themes keep working. New themes should use the canonical names; deprecation does not set an automatic removal deadline.

  Migration: menu radios use those shared targets now. `dropdown-menu-radio-dot` is removed — target `radio-indicator-dot`; `astryx upgrade` rewrites it for you.

#### Fixes

- The generated agent cheat sheet hardcoded a shell recommendation ("Full page → AppShell; sidebar nav → SideNav", "pick the shell (AppShell / Layout+LayoutPanel)"), which answers a question that depends on the app archetype and duplicates guidance `astryx docs layout` already maintains. The two layout rules now send agents to that doc instead, so shell choice, region budgets, and the responsive contract have one source of truth. (#4772)
  The rule cites the command rather than the docsite URL, in the block's established `astryx <cmd>` form that the header maps to the project's real invocation (`pnpm exec astryx`, `npx @astryxdesign/cli`, …). `astryx docs` reads the docs shipped inside the installed version, so an agent can't be shown an API that release doesn't have.
- The `migrate-grid-minchildwidth-to-columns` codemod bailed without changes when a `<Grid>` had both `columns` and `minChildWidth`, leaving the now-invalid `minChildWidth` prop in place and failing type-checking on 0.3.0. (#4792)
  When `columns` is a numeric literal, it now migrates losslessly to the 0.3.0 object form. This mirrors the old (0.2.0) Grid runtime, where `minChildWidth` dominated and the numeric `columns` capped the column count under `auto-fit`: `<Grid columns={3} minChildWidth={280}>` becomes `<Grid columns={{minWidth: 280, max: 3, repeat: 'fit'}}>`. Object or dynamic `columns` values remain a deliberate bail.
- The documented `hook` example referenced `useToggle`, which is not a hook in the design system — running it failed with `ERR_UNKNOWN_HOOK`. It now uses `useFocusTrap`. (#4742)
  This shipped in two places a consumer sees: `astryx manifest --json`, which agents read to learn the CLI, and the `hook` CommandDoc that feeds `--help`. Replaced in both.
- CLI internals: a true `foundation/` bottom layer, and generated `./authoring` types (#4736).
  `foundation/` no longer imports `api/`, and ESLint now enforces that direction alongside the existing `authoring/` and `api/` rules. Two things were reaching upward: `Project` pulled template discovery out of `api/template`, whose adapter imported `Project` straight back, and both `Project` and `integration-warnings` imported `validateLoadedIntegration` from the `validate-integration` command. Neither was misplaced logic, just misplaced files — the adapter now lives at `foundation/discovery/template-adapter.mjs` and the validators at `foundation/integrations/validate-contributions.mjs`. To be precise: `Project` and the template adapter still import each other, so that module cycle remains, contained within foundation instead of spanning two layers. Behavior-preserving — the CLI's observable surface is byte-identical across 84 invocations.

  The published `./authoring` type declarations are now generated from their JSDoc instead of hand-written, the same way `./api` already works. The 13 hand-maintained `.d.mts` files are gone; `scripts/sync-api-types.mjs` emits both trees at `prepack`, stamped `@generated`. A hand-written declaration shadows the JSDoc in its `.mjs`, so it could disagree with the implementation and still compile — and both failure modes had shipped: a missing declaration made a strict consumer resolve that parser as `any`, and a stale `parseDoc` return union silently dropped `SchemaDoc`, `CommandDoc` and `EnumDoc`. Also fixes `parseFunction`, a bare re-export of `parseHook` that published `HookDoc` instead of the general `FunctionDoc`.

- Scaffolding a template that references demo video (e.g. `LightboxVideo`) no longer replaces the video source with the image placeholder data URI, which the generated `<video>` element couldn't play. `stripTemplateAssetRefs()` treated every demo-media reference as an image regardless of extension; video extensions (`.mp4`, `.webm`, `.mov`, `.ogv`) are now stripped to an empty `src` instead — there's no equivalent self-contained inline placeholder for video, so the scaffolded example is honest about needing the builder to supply their own file rather than pointing at something that can't play. (#4863)
- Stepper templates: the scaffolded Stepper blocks gain the a11y, theming and responsive-label hardening from the component audit, and their doc blocks match what they render (#4917).
- cli: add `theme build --icons-specifier` so the generated module's icon import can be fully specified (#4620)
  The generated theme module imports the icon registry rather than inlining it, because the registry holds React elements. `astryx theme build` scraped that specifier out of the TypeScript source and emitted it verbatim, so `./icons` — valid TypeScript, invalid ESM — reached the generated `.js`. Every published theme's `/built` entry therefore failed to load in Node, including under Vite SSR and Next.js Pages Router, while bundlers papered over it by guessing the extension.

  No single extension is correct: the same source compiled by tsup lands at `icons.mjs` in a package with no `"type"` field and at `icons.js` in one with `"type": "module"`, and the generator runs before the compile step that produces either. The caller knows; now it can say so. Without the flag the specifier is emitted unchanged, so the default no-`--out` flow — where the neighbour is an uncompiled `icons.tsx` that only a bundler can resolve — is unaffected.

  The seven theme packages now declare `--icons-specifier ./icons.mjs` in their build scripts.

#### Other Changes

- The scaffolded login pages use `Center`'s `padding` prop instead of a hand-written `var(--spacing-6)` style object (#4764).
- Self-host template demo imagery in the repo instead of streaming it (#3973)
  from the internal `lookaside.facebook.com` CDN.
- Template demo images are now committed under
  `apps/docsite/public/template-assets/` and referenced by root-relative `/template-assets/*` paths (previously Meta-internal CDN URLs invisible to external contributors).
- `stripTemplateAssetRefs` still swaps these paths for the inline `data:` URI
  placeholder on scaffold, so generated projects render with zero setup and no network dependency — no image is ever copied into a scaffolded project.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ejhammond
- @ernestt
- @HelloOjasMutreja
- @humbertovirtudes
- @imdreamrunner
- @jiunshinn
- @josephfarina

---

# 0.3.0

#### Breaking Changes

- CLI — authoring is consolidated into a single entrypoint, `@astryxdesign/cli/authoring`, that exposes only TYPES (the plain objects authors write) and PARSERS (the CLI's load-boundary validators). Zod is sealed inside each parser and never exported.
- Remove long-deprecated compatibility APIs from core and CLI. Run `astryx upgrade` first to migrate the supported replacements for authoring imports, Dialog logical positions, Switch label spacing, and Table root props.

#### New Features

- CLI human (non-`--json`) output now renders through a small, documented formatter kit: consistent, plain-ASCII `key: value` records/sections that mirror `--json` and are greppable by field. Every command was migrated onto it (a lint rule keeps output funneled through the single `emit` sink), and `astryx --help` documents the output contract. `--json` output is unchanged. (#4686)
- `defineTheme`: make `color.accent` optional (#2279)
  A theme can now restyle the neutral ramp (`neutralStyle`, `contrast`) without adopting an accent. An accent-less config seeds the neutral palettes from the default accent's hue but leaves `--color-accent`, `--color-accent-muted` and `--color-on-accent` ungenerated, so they fall through to the token defaults — the same fall-through `expandColorScale` already applies to status, categorical and on-dark tokens. Configs that pass an accent are unchanged, token for token.

#### Fixes

- theme build: generated custom Button variants now type-check through the public `@astryxdesign/core/Button` subpath.
- Remove the `@xds/theme-default` → `@astryxdesign/theme-neutral` collapse from the v0.1.0 upgrade codemods (module-specifiers, css-surfaces, and declare-module). `theme-default` was dropped at the v0.1.0 scope move, so no v0.1.x consumer imported it — the collapse was dead and could rewrite unrelated source (including `@xds/theme-default/theme.css` CSS imports) to a `@astryxdesign/theme-neutral` package the app never declared. The `@xds/theme-daily` → `theme-neutral` collapse (and its `defaultTheme` → `neutralTheme` export remap) is unchanged.
- cli — confine user-controlled file paths, close DoS vectors, and repair paths broken by the authoring reorg (#4637)
- cli hardening pass — validate inputs at the API layer, close path-safety gaps, and prevent agent-docs content loss. The API is a public surface (`@astryxdesign/cli/api`), so guards that lived only in the CLI wrapper are pushed into the API.
  Path safety (the guard the write commands all depend on):
- cli — rename the `search`/`build` verbose flag to `--verbose`, resync the bundled themes, and fix `unwrap-authoring-factories` edge cases (#4639)
- `astryx doctor`'s peer-dependency check is now version-aware and names scoped packages correctly. Two problems are fixed: (1) the install hint was built with `name.split('@')[0]`, which for a scoped peer like `@stylexjs/stylex` returned an empty string, printing a bare `npm install ` with no package; and (2) the check only verified a peer was _present_, not that its installed version satisfied the declared range — so an out-of-range version (e.g. `@stylexjs/stylex@0.10.1` against a `^0.19.0` peer) was reported as satisfied. The check now flags out-of-range peers and its fix pins the required range, e.g. `npm install @stylexjs/stylex@^0.19.0`.
- theme build: validate component override keys from documented theming targets so subtargets like Chat bubbles and SideNav items no longer warn as unknown.
- `astryx theme build`: hyphenated component-override keys now resolve their built-in visual-prop values, and the `KNOWN_COMPONENTS` prop lists match what each component renders (#4109)
  `loadKnownValues` mapped a theme key to its core component directory by stripping non-letters from only the directory name, so a hyphenated key (`text-input`, `dropdown-menu`, `app-shell`, ...) never matched its `TextInput`/`DropdownMenu`/`AppShell` dir and the built-in prop values were silently dropped. It now strips non-letters from both sides before comparing, so hyphenated keys resolve. The `KNOWN_COMPONENTS` visual-prop lists are also synced to each component's `theming.targets[].visualProps` (e.g. `text-input`/`date-input`/`number-input`/`time-input`: `size`, `status`; `side-nav`: `mode`; `aspect-ratio`: `shape`), correcting stale/empty entries.

#### Documentation

- Document the core codemod staging workflow and add release-time automation that promotes `transforms/next` codemods into the resolved release version folder.
- Document the `@astryxdesign/core` StyleX peer dependency — add `@stylexjs/stylex` to the Getting Started / Quick Start install commands in both READMEs, and add an `astryx init` next-steps reminder to ensure the `@stylexjs/stylex` peer dependency is met, with a pointer to `astryx doctor`. StyleX is the styling runtime every component calls, and not all package managers auto-install peers.
- Surface the React 19 peer-dependency requirement everywhere a user would look for it (root README, core README, docsite hero, and the CLI getting-started guide), and add a sync test that keeps those surfaces naming the same React major as the core peer range.

#### Other Changes

- **The `create*` factories are removed** (`createConfig`, `createIntegration`, `createComponentDoc`, `createFunctionDoc`, `createDoc`, `createPageTemplate`, `createBlockTemplate`, `createCodemod`, `createConfigCodemod`). Author a plain object and stamp its `type` directly (`{type: 'component', ...}`, `{type: 'page', ...}`, `{type: 'code', ...}`); config and integration manifests are plain objects with no discriminant.
- **Import authoring types from `@astryxdesign/cli/authoring`** — the doc types `ComponentDoc`, `HookDoc`, `ReferenceDoc`, `TemplateDoc`, and the project-file types `AstryxConfig`, `AstryxIntegration`, `AstryxCodemod`. The old split surfaces (`@astryxdesign/cli/{config,doc,integration,template,codemod}` and the authoring exports of `@astryxdesign/core`) are superseded.
- **Doc field types are renamed to explicit, domain-prefixed names** so the surface reads clearly: `PropDoc → ComponentPropDoc`, `ThemingTarget → ComponentThemingTarget`, `ComponentVar → ComponentThemingVar`, `DerivedVar → ComponentThemingDerivedVar`, `ElementDescriptor → ComponentSlotElement`, `GroupDoc → ComponentGroupDoc`, `TranslationDoc → ComponentTranslationDoc`, `ExampleDoc/AnatomyElement/BestPractice/PlaygroundConfig → Component*`, and `ContentBlock/TokenPreviewType → Reference*`. The authorable entry types (`ComponentDoc`/`HookDoc`/`ReferenceDoc`/`TemplateDoc`) are unchanged.
- **`astryx upgrade` migrates you automatically.** Three codemods ship in this release: `unwrap-authoring-factories` rewrites every `create*` call to the plain stamped object, `migrate-authoring-imports` repoints the import specifiers to `@astryxdesign/cli/authoring`, and `rename-authoring-doctypes` applies the doc field-type renames (imports, type references, and JSDoc `@type` refs).
- CLI — the public `@astryxdesign/cli/api` type surface is now generated from the runtime JSDoc, and the injectable logger is consolidated into one `Logger`.
  Consumer-visible changes to `@astryxdesign/cli/api` (types only — runtime imports are unchanged):
- **Precise return types.** `component`, `docs`, `blog`, `discover`, `build`, `swizzle`, `upgrade`, `init`, and `themeBuild` previously resolved to `Promise<any>`; they now return their precise `{ type, data }` response unions. Code that leaned on `any` may surface new (correct) type errors.
- **Response types are now exported by name** — e.g. `ComponentDetailResponse`, `SearchResponse`, `UpgradeRunResponse` — alongside `themeAdd`/`themeList`/`listThemes` and a new shared `logger` value + `Logger` type.
- **Breaking:** the per-command return-union aliases `ComponentResult`, `DiscoverResult`, `DocsResult`, `HookResult`, and `TemplateResult` are no longer exported. Use `Awaited<ReturnType<typeof component>>` (still works), or import the member response types directly.
- `theme build --out`/`<file>`, the `validate-integration` manifest roots (`components`/`templates`/`codemods`), and `layout --file` are now confined with `assertWithin`. An escaping integration root reports a validation issue instead of importing and executing files outside the package; `layout --file` is also size-capped (5 MB) and rejects non-files, so a stream like `/dev/zero` can't exhaust memory.
- Fuzzy-match (Levenshtein), the layout value parser, and the layout expander gained bounds — a very long search query, a deeply nested attribute value, and a huge repeat count (`Box*999999999`) can no longer spin the CPU, blow the stack, or exhaust the heap.
- Docs topic lookup uses a null-prototype map so `__proto__`/`constructor` as a topic name can't bypass the unknown-topic guard. The shipped getting-started docs and the sandbox registry generator point at the current CLI source path again (both broke in the authoring reorg).
- `assertWithin` now canonicalizes symlinks (realpath of the deepest existing ancestor) — a symlink inside the project root pointing outside no longer lets a write escape. Also rejects a NUL byte in the path. This closes the escape for every command that writes through the guard (swizzle/template/upgrade/theme/layout/agent-docs).
- `search()`: non-positive/non-integer `limit`, empty query, unknown `--type` → `ERR_INVALID_ARGUMENT` (previously `limit: 0` returned the full unclamped set).
- `swizzle()`: the component name is sanitized so `..`/separators can't escape the `--output` base.
- `swizzle()` import rewriting: dynamic `import('../Sibling/…')` is now rewritten (was left pointing at a non-existent sibling in the output dir); a two-levels-up asset import (`../../locales/x.json`) maps to the exported subpath instead of the invalid `<pkg>/..`; and `../theme/tokens.stylex` keeps its full subpath (the StyleX compiler needs the dedicated `./theme/tokens.stylex` export — collapsing it to `<pkg>/theme` broke StyleX resolution). Component-local `.stylex` files that aren't subpath exports keep the working barrel collapse.
- `template()` copy: refuses to clobber without `overwrite: true` (`ERR_FILE_EXISTS`); adds an `overwrite` option.
- `upgrade()`: the `--path` scan dir is confined to cwd (`--apply` rewrites files in place).
- `init()`: template scaffold refuses to clobber an existing `page.tsx` (`ERR_FILE_EXISTS`); an unknown `--agent` now throws `ERR_UNKNOWN_AGENT` (was silently ignored).
- `layout`: rejects an unknown `--form` (`ERR_INVALID_OPTION`) and empty expression (`ERR_INVALID_ARGUMENT`).
- `layout expand`: text payloads containing `<`, `>`, `{`, or `}` (e.g. `Text"5 < 3"`) are emitted as JSX string-expression children so the generated TSX is valid — previously they produced syntactically-broken output.
- `layout expand`: a top-level repeat or group that expands to multiple sibling elements (`B"x"*3`, `(B"a" + B"b")`, an outline `repeat` block) is now wrapped in a fragment — previously the generated TSX had adjacent root elements with no parent and failed to compile (the wrapper decision counted AST roots instead of expanded elements).
- `layout` (expand/check): an empty expression now surfaces `ERR_MISSING_ARGUMENT` and a missing `--file` surfaces `ERR_FILE_NOT_FOUND` (was a generic `ERR_UNKNOWN` / a raw `ENOENT` errno, with a stack leak in human mode).
- `layout` parser: a pathologically deep compact expression (`V > …` nested past 512 levels) is rejected with a located `ERR_LAYOUT_PARSE` instead of blowing the call stack and surfacing a raw `RangeError` (→ `ERR_UNKNOWN`).
- `layout check --form …` printers: a string containing a quote (e.g. a Button `label="Don't panic"`) now round-trips — the printer picks a delimiter the string doesn't contain instead of always single-quoting, so the emitted compact/outline surface re-parses (was producing an unparseable token).
- `resolveTheme`: a non-string `astryx.theme` in package.json (number/array/object/boolean) degrades to null instead of crashing `astryx component` with a raw `TypeError` (parity with the empty-string / unknown-slug paths).
- `jsonOut`: serializes the envelope BEFORE marking the emission handled, so if a command returns unserializable `data` (circular ref / BigInt — an author bug) the bin error boundary still emits a JSON error envelope instead of leaving a `--json` consumer with empty stdout.
- package scanner: a dependency's `astryx.docs` that is a non-string (number/array) is skipped instead of crashing the whole scan with a raw `TypeError`, and a `docs` path that escapes its own package dir is skipped rather than surfacing foreign docs; a non-string package `name` is coerced to a string.
- `component --package <pkg> --showcase`/`--blocks`: route to the right leaf instead of falling back to `component.detail`.
- `discover`/`docs` leaves: empty query/section errors instead of matching everything via `.includes('')`.
- `docs()`/`discover()`: a non-string `topic`/`section`/`query` now throws a stable coded error (`ERR_UNKNOWN_TOPIC` / `ERR_UNKNOWN_SECTION` / `ERR_INVALID_ARGUMENT`) instead of a raw `TypeError` the CLI downgraded to `ERR_UNKNOWN` (parity with the `component`/`hook` non-string guards).
- `blog()` detail: a non-string slug throws `ERR_INVALID_ARGUMENT` (was a raw `TypeError` the CLI downgraded to `ERR_UNKNOWN`), and fails fast before any network fetch.
- `hook()`/`component()` dispatchers: a non-string `name` or `category` throws a coded error (`ERR_UNKNOWN_HOOK` / `ERR_UNKNOWN_COMPONENT` / `ERR_UNKNOWN_CATEGORY`) instead of a raw `TypeError` with no `.code` from the leaf's `.toLowerCase()`/`.replace(...)`.
- `theme add`: a write failure where an ancestor of the target dir is a file now surfaces `ERR_WRITE_FAILED` (the `mkdir` moved inside the write try/catch) instead of leaking a raw fs errno (`EEXIST`/`ENOTDIR`) + absolute path.
- `validate-integration`: a path-unsafe `[package]` spec (`..`/absolute) is reported as an `invalid_package_spec` diagnostic instead of crashing with a raw stack (human) / generic `ERR_UNKNOWN` (`--json`).
- `doctor`: no longer crashes (raw stack in human mode / `ERR_UNKNOWN` in `--json`) when multiple `astryx.config.*` files coexist — it reports a `config` FAIL. Version-alignment skips (info) instead of a spurious drift WARN with a `NaN.undefined.x` fix when either version isn't comparable semver (e.g. `workspace:*`).
- `manifest`: subcommands are sorted by name (same stability guarantee the top-level command list makes), so reordering `.command()` calls can't silently change the agent-facing manifest.
- `build`: the CLI wrapper now propagates the API's error `code` into the `--json` envelope (bogus `--type` / non-positive / non-integer `--limit` → `ERR_INVALID_ARGUMENT` instead of a generic `ERR_UNKNOWN`), and delegates `--limit` validation to the API (parity with `search`).
- `layout check`: exits `1` in BOTH `--json` and human mode for an invalid (but parseable) layout — the exit code no longer depends on the output mode, so it works as a CI gate / agent check without parsing stdout.
- `upgrade` config codemods: a `findConfigPath` throw (multiple `astryx.config.*` files) is surfaced as a structured per-codemod error instead of crashing the whole upgrade run — config codemods run before the strict loader, so this restores the per-codemod isolation every other failure path honors.
- CLI dispatch: the belt-and-suspenders postAction "completed without emitting an envelope" error carries a `code` (`ERR_UNKNOWN`) so every error envelope is branchable on `code`.
- `toErrorEnvelope`/`AstryxError`: attach `suggestions` only when it's a real array.
- `injectXdsBlock`/`removeXdsBlock` no longer drop, duplicate, or orphan user content on malformed managed blocks (END-before-START, duplicate/nested blocks, or a start marker with no end). They locate a single well-formed block (END searched after START) and refuse to touch an ambiguous/half-written file instead of corrupting it.
- The codemod source scan no longer follows symlinks (a symlinked file under the scanned path could rewrite its target OUTSIDE the project) and skips generated-output dirs (dist/build/out/.next/coverage) — codemods rewrite source, not artifacts or dependencies.
- `resolvePackageDir` rejects an integration spec that isn't a bare package name (no `..`, no absolute, must stay in node_modules) — a config spec can no longer point the loader at an arbitrary module.
- A broken integration manifest (throws on import or fails schema validation) no longer crashes `Project.load` (and thus every command). It's recorded and surfaced via `issues()`, restoring the documented skip+warn policy; other integrations still load.
- The `--radius-*`, `--shadow-*`/`--elevation-*`, and `--color-*` token-migration codemods no longer rewrite a longer consumer-defined token that merely shares a prefix (e.g. `--radius-container-custom` → `--radius-3-custom`, `--radius-innermost` → `--radius-0most`, `var(--shadow-10)` → `--shadow-base0`, `--color-positive-custom` → `--color-success-custom`). The boundary lookahead was binding only to the last alternative in the pattern (and two codemods had no boundary at all); it now wraps the whole alternation, so only exact token names migrate.
- `migrate-badge-children-to-label` no longer emits a duplicate `label` prop when the badge already has one (`<XDSBadge label="x">Active</XDSBadge>` produced an invalid `label="x" label="Active"`); it now skips a badge that already declares `label`.
- `readDocMeta` no longer reads a `group:`/`hidden:` field nested inside a `propDescriptions` block (a docsZh/docsDense translation export) as the component's group — that leaked a translated prop description as a group key in the default English `component --list` (e.g. a Chinese string appeared as a group). The field regexes now match top-level fields only (<=2 spaces).
- `astryx search`/`build` verbose output was unreachable: the boolean `--detail` flag collided with the root program's value-taking `--detail <level>`, so `search button --detail` errored `argument missing`. The boolean is now `--verbose` (the global `--detail <level>` is unchanged).
- The themes bundled for `astryx theme add` had drifted from source — the `neutral` bundle was missing a WCAG AA light-mode `text-secondary` contrast fix and a StatusDot color block, so `astryx theme add neutral` scaffolded a theme below AA. All bundles are regenerated to match source, guarded by a new drift test.
- The `unwrap-authoring-factories` upgrade codemod produced broken output for a shorthand `type` property (emitted `{'component'}`) and for no-argument factory calls (left a call referencing the just-removed import). Both now emit the correct plain object.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cixzhang
- @ejhammond
- @imdreamrunner
- @jiunshinn
- @joeyfarina
- @josephfarina

---

# 0.2.0

#### Breaking Changes

- cli/json: remove the central `CLIAnyResponse`, `CLIResponseType`, and `CLIResponseDataMap` types. `jsonOut` is now a structural serializer and `parseResponse` / `assertResponse` return the structural `CLIResponse` (`{type, data, meta?}`) instead of the discriminated union, so `result.data` is `unknown` until you narrow it yourself.
  Runtime output is unchanged (every `--json` envelope is byte-identical). This only affects consumers importing those types or relying on `parseResponse` / `assertResponse` to auto-narrow `.data`.
- component/hook `--json` list responses collapsed. `--detail compact`/`full` previously emitted distinct `component.brief`/`component.full` (and `hook.*`) envelopes; they now all emit `component.list` (resp. `hook.list`) with a `data.detail: 'names' | 'compact' | 'full'` field. Migrate: switch on `data.detail`, not the `.brief`/`.full` discriminator. Removed types: ComponentBriefResponse, ComponentFullResponse, HookBriefResponse, HookFullResponse.

#### New Features

- CLI: `blog` is now a normal, agent-facing command — it appears in `--help` and the capability manifest and supports `--json` (emitting `blog.list` / `blog.detail` envelopes), instead of being hidden. Human output is unchanged; the reader still consumes the public RSS feed. Also scriptable through the `./api` barrel as `blog(slug?)`.
- CLI: `init` is now fully scriptable through the `./api` barrel — the non-interactive installer (agent-docs cheat sheet, starter template, `--remove-agents`) lives in `api/init` and returns a typed receipt (`init.run` | `init.remove`), with the CLI reduced to a thin parse → API call → render wrapper. Human output is emitted through an injectable logger, so a scripted `init()` stays silent while the CLI output is byte-identical for existing usage.
- CLI: `theme build` is now fully scriptable through the `./api` barrel — the ~1,000-line theme compiler (defineTheme extraction, CSS generation via `@astryxdesign/core/theme`, variant/type-declaration + icon-module generation, override validation) lives in `api/theme/build` and returns a typed `theme.build` receipt, with the CLI reduced to a thin parse → API call → render wrapper. Human progress is emitted through an injectable logger, so a scripted `themeBuild()` stays silent while the generated CSS/JS/.d.ts, the `--json` envelope, and human output stay byte-identical for existing usage. Watch mode remains a thin CLI loop.
- CLI: `upgrade` is now fully scriptable through the `./api` barrel — the version-to-version pipeline (codemods + agent-docs refresh) lives in `api/upgrade` and returns a typed receipt (`upgrade.list` | `upgrade.status` | `upgrade.run`), with the CLI reduced to a thin parse → API call → render wrapper. Human progress is emitted through an injectable logger, so a scripted `upgrade()` stays silent while the CLI output and `--json` envelopes are unchanged for existing usage.
- Timestamp: new `tooltipEntries` prop renders the hover tooltip across several time zones and/or formats at once — one line per entry, each with an optional `timezoneID` (IANA id; omit it or pass `'local'` for the viewer's zone), `format` (every non-relative `TimestampFormat` plus `'full'`), and `label`. The default is unchanged: with no entries the tooltip stays the single full absolute line in the viewer's zone. Configuring entries also attaches the tooltip to absolute formats, which previously had none — note that this gives those timestamps a tab stop and focus ring, as relative timestamps already have, so a column of them gains one tab stop per row. `hasTooltip={false}` still suppresses the tooltip, and an empty array counts as no configuration. Also corrects `isTimezoneShown`'s documentation, which claimed it applied to the `system_date_time` and `system_time` formats; it never has, and those formats stay machine-readable. (#4188)

#### Fixes

- `astryx theme build`: component-override keys for multi-word components (TextInput, DateInput, NumberInput, DropdownMenu, SideNav, TopNav, etc.) now match the hyphenated class the component actually renders. The known-component registry used de-hyphenated keys, so overrides authored against them emitted dead selectors (`.astryx-textinput` instead of `.astryx-text-input`) that silently never applied (#4109).

#### Other Changes

- CLI: blog reorganized into api/blog leaf shape — list/detail leaves projecting a shared RSS adapter (`_adapter.mjs` owns all network fetch + feed parsing), with `blog.mjs` kept as a dispatcher+barrel so the same `blog` export, the CLI wrapper, api/index.mjs, and the --json/human output stay byte-identical.
- CLI: `build` reorganized into the `api/build` leaf shape — `build.mjs` is now a dispatcher + barrel that routes no-query → `build.help` (`api/build/help/help.mjs`) and a query → `build.kit` (`api/build/kit/kit.mjs`), with each leaf projecting its single `{type, data}` envelope. Pure reorganization: the `build` export, the `./api` barrel, and the CLI consumer are unchanged, and the `--json` and human output stay byte-identical for existing usage.
- CLI: `component` reorganized into the `api/component` leaf shape over a shared `_adapter` resolver — `component.mjs` is now a dispatcher + barrel that routes to per-type leaves (`list`, `detail`, `detail/props`, `detail/source`, `detail/showcase`, `detail/blocks`), each a thin projection of a subject the adapter resolves once (core/external/scoped/integration ownership, ambiguity handling, and fuzzy search, deduped). Pure reorg: every `--json` envelope and human output stays byte-identical across all modes.
- CLI: discover reorganized into api/discover leaf shape (list, detail, detail/doc, search) behind a shared _adapter that owns external-package discovery and doc loading; discover.mjs is now a dispatcher+barrel keeping the same exports. Pure reorg — `--json` and human output are byte-identical and api/index.mjs + the CLI consumer are untouched. Adds colocated leaf tests.
- CLI: docs reorganized into api/docs leaf shape — `docs()` in `api/docs/docs.mjs` is now a dispatcher + barrel that routes by argument shape into three leaves (`api/docs/list`, `api/docs/detail`, `api/docs/detail/section`), each projecting into a single `{ type, data }` envelope. The discovery, overlay loading, and topic resolution shared by ≥2 leaves live in `api/docs/_adapter.mjs`. Pure reorganization: the `docs` export, `api/index.mjs`, the CLI consumer, and all `--json` and human output are unchanged (byte-identical).
- CLI: hook reorganized into api/hook leaf shape — `hook.mjs` is now a dispatcher+barrel routing to colocated leaves (`list/list.mjs` → hook.list, `detail/detail.mjs` → hook.detail, `detail/params/params.mjs` → hook.detail.params) over a shared `_adapter.mjs` resolver. Pure reorg: `--json` and human output are byte-identical across all modes, and the `hook` export surface (api/index.mjs + CLI) is unchanged.
- CLI: init reorganized into api/init leaf shape — `init.mjs` is now a dispatcher + barrel that routes to `api/init/run/run.mjs` (the default / `--features` / `--all` install path) and `api/init/remove/remove.mjs` (the `--remove-agents` path), with the shared plain-logger contract in `api/init/_adapter.mjs`. Pure reorg: `getNextSteps`, `noopInitLogger`, and the `InitOptions` / `InitLogger` types stay re-exported from the barrel, so api/index.mjs, the CLI command, and the programmatic API are unchanged. Human and `--json` output are byte-identical.
- CLI: layout reorganized into the api/layout leaf shape — a shared `_adapter.mjs` (`analyze`/`loadBlocks`/`formatIssue` over `lib/xle`) with thin `expand/`, `check/`, and `grammar/` leaves, plus a `layout.mjs` barrel. `api/index.mjs` and the CLI are unchanged (they import via the barrel). Pure reorg: `layout expand`/`check`/`grammar` `--json` envelopes and human output are byte-identical.
- CLI: swizzle reorganized into api/swizzle leaf shape — the flat command splits into `api/swizzle/list` (`swizzle.list`) and `api/swizzle/copy` (`swizzle.copy` receipt, incl. `rewriteImports`), with shared @astryxdesign/core discovery + component listing deduped in `api/swizzle/_adapter.mjs`, and `swizzle.mjs` reduced to a dispatcher + barrel that keeps its existing exports (`swizzle`, `rewriteImports`). Pure reorganization with no behavior change: human output and every `--json` envelope stay byte-identical, and the CLI command, the `./api` barrel, and the central `types/swizzle` declarations are untouched.
- CLI: template reorganized into api/template leaf shape (shared helpers preserved on the barrel). Pure reorg — `--json` and human output stay byte-identical: shared discovery/IO moved to `api/template/_adapter.mjs`, the command modes split into `list`/`show`/`skeleton`/`copy` leaves, and `template.mjs` becomes a dispatcher + barrel that re-exports every previously-exported symbol (template, discoverTemplates, discoverAll, discoverAllWithErrors, discoverIntegrationTemplatesForOne, findShowcase, findRelatedBlocks, stripTemplateAssetRefs, listTemplates, extractComponents, and the DiscoveredTemplate/TemplateDiscoveryError types) so component/layout/search/init/discover/validate-integration and lib/project keep resolving `api/template/template.mjs` unchanged.
- CLI: `theme add`/`list` are reorganized into the fractal `api/theme/` leaf shape — a shared `_adapter.mjs` (bundled-theme manifest reader + slug resolver) with thin `add/` (copy → `theme.add` receipt) and `list/` (`theme.list`) leaves over it, plus a `theme.mjs` barrel, mirroring the `theme build` extraction (#4462). `themeList()` is now exported from `@astryxdesign/cli/api` alongside `themeAdd`. Pure reorg: `theme list`/`add` `--json` envelopes and human output are byte-identical, with new direct-API tests for both leaves.
- CLI: upgrade reorganized into api/upgrade leaf shape — the flat pipeline is split into a dispatcher+barrel (`upgrade.mjs`), a shared `_adapter.mjs` (version detection + agent-docs refresh + codemod selection/execution machinery), and `list`/`status`/`run` leaves (`upgrade.list` | `upgrade.status` | `upgrade.run`). Pure reorg: the `./api` barrel + CLI consumer are unchanged, and both the human output and `--json` envelopes are byte-identical.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cixzhang
- @josephfarina

---

# 0.1.9

#### New Features

- CLI: full API coverage for the `build`, `swizzle`, `layout`, and `validate` commands — each is now scriptable through the `./api` barrel with the CLI as a thin parse → API call → render wrapper. `build` gains `--json` output. Behavior is unchanged for existing command usage. (#4302)

#### Fixes

- Align two `--json` contract shapes with what the CLI actually emits
- Register all emitted response types in the `--json` envelope union
  Three response types were defined, exported, and emitted by commands but never added to `CLIAnyResponse` — the union that `jsonOut()` type-checks payloads against: `component.full`, `component.detail.blocks`, and `upgrade.status`. Because their discriminators were missing from the map, `jsonOut('upgrade.status', …)` (and the two component variants) were rejected by the type-checker, and their payload shapes weren't actually being validated. `build.help` had no response type at all. Added a `BuildHelpResponse` type and wired all four into the union so every `--json` envelope the CLI can emit is now type-checked against a declared shape.
- Type `detectPackageManager` honestly so `astryx doctor`'s "no lockfile" branch is reachable
  `detectPackageManager` returns `'npx'` as the sentinel for "nothing detected", but its return type only listed `'yarn' | 'pnpm' | 'bun' | 'npm'`. Type-checkers therefore treated `doctor`'s `pm !== 'npx'` guard as a dead comparison — the "No lockfile detected — defaulting to npm/npx" message looked unreachable and was at risk of being "cleaned up". The return type is now `PackageManager | 'npx'` and detection narrows via a shared type predicate, so the guard is honest and the branch is preserved.
- Make the CLI's `.mjs` sources fully strict-typecheckable (checkJs + JSDoc)
  Annotated the entire CLI package so `tsconfig.strict.json` (full `strict` `checkJs` over `src`, `bin`, `scripts`, `docs`, and the emitted `templates`) reports zero errors — down from 1717. Fixes are JSDoc-only: no runtime logic changed, `.mjs` stays `.mjs`. Strict checking also surfaced and corrected several type-contract drifts: the `upgrade.run` response type (declared a `depsUpdated` field the command never emits, and omitted the real `integrations`/`filesChanged`/`transformsApplied`/`errors`), registered the emitted `theme.list`/`theme.add`/`layout.*` response types in the `--json` envelope union, and added `category?` to `ReferenceSection` in core's docs types (reference docs already emit it).
- Drop the dead `cwd` parameter from `getLatestVersion`
  `checkForUpdate` called `getLatestVersion(cwd)` and the JSDoc advertised a `cwd` parameter, but the function takes no arguments — it only reads the `$ASTRYX_LATEST_VERSION` env var, so the passed `cwd` was silently ignored. Removed the phantom parameter and its doc so the signature matches the behavior. No functional change to the update-nudge output.

#### Other Changes

- `swizzle.copy` payloads always include `package` and `usesStyleX` (both covered by tests), but `SwizzleCopyResponse.data` didn't declare them — the call site cast the payload to `Record<string, unknown>` to sidestep the mismatch. Added both fields to the type and dropped the loose cast so the payload is type-checked.
- The error `suggestions` shape was declared as `{name, reason}` (reason required) in the JSON envelope / API error contract, but some call sites emit bare `{name}` (e.g. candidate component names on swizzle). Introduced a single canonical `Suggestion` type (`reason?` optional) and referenced it everywhere so the contract matches the emitted data.

#### Contributors

Thanks to everyone who contributed to this release:

- @josephfarina

---

# 0.1.8

#### Breaking Changes

- Avatar and AvatarGroup adopt Icon's abbreviated size scale — `size` now takes `xsm`/`sm`/`md`/`lg`/`xl` instead of `tiny`/`xsmall`/`small`/`medium`/`large`. Pixel values are unchanged (20/24/36/48/128px) and the default is now `md` (still 36px, formerly `small`). Avatar's tiers stay larger than Icon's because avatars align with media rather than glyphs. Run `astryx upgrade` to migrate call sites. (#2672)

#### New Features

- `astryx init --features agents` now defaults to creating root `AGENTS.md` — the tool-agnostic standard that Codex/Copilot, Cursor, and most agents read — instead of the Claude-specific `.claude/CLAUDE.md`. Claude output is now opt-in via `--agent claude` (→ `.claude/CLAUDE.md`), and `--agent all` still writes both. Projects with existing agent-doc files are unaffected: init still discovers and updates every file already present, so this only changes the from-scratch default. (#4216)
- "Foolproof init": both `@astryxdesign/core` and `@astryxdesign/cli` now print a postinstall nudge pointing you to `npx @astryxdesign/cli init`, `astryx` commands nudge you to finish setup until init has run, and `astryx init` runs non-interactively (no TTY required) so it works in CI and agent environments. (#4147, #4153, #4154, #4155)

#### Fixes

- Stop suggesting bare `npx astryx` before the CLI is installed — it resolves to an unrelated package on the npm registry.
  The CLI now emits an install-aware invocation everywhere it prints a command:
- Extend the v0.1.0 upgrade codemods to cover test files that mock `@xds/core` modules, which were previously left half-migrated and broke after upgrade:
- `astryx upgrade` now keeps the managed agent-docs block (`<!-- ASTRYX:START --> … <!-- ASTRYX:END -->`) in sync with the installed version on **every** path — including the up-to-date and no-codemods short-circuits that previously returned before any refresh, leaving AI agents reading a stale component index and superseded rules. The block documents the installed library, so it's now refreshed up front (independent of codemods) and reported in the `--json` receipt as `agentDocs`. One detection pass covers three cases: a stale block is rewritten (`--apply`) or reported as a pending change (dry-run, which no longer writes); a project with core installed but no managed block is nudged to run `astryx init --features agents`; an already-current block stays silent. (#4168, #4169)

#### Documentation

- Add a `cli-integrations` CLI docs topic (`astryx docs cli-integrations`) so the integration-authoring guide (originally written by @ejhammond) is discoverable through the CLI and docsite instead of an unreferenced markdown file. Rewrite the CLI README's Configuration section to match the current strict config schema (`integrations`, `issuesUrl`, `hooks.postCodemod`, `experimental.xle`) and reframe the Integrations section around the two-file API.

#### Other Changes

- Installed / global / dev runs suggest `<pm> astryx <cmd>` (e.g. `pnpm exec astryx …`), unchanged.
- One-off runs (launched via `npx`/`pnpm dlx`/`yarn dlx`/`bunx`) suggest the scoped package `<dlx> @astryxdesign/cli <cmd>`, which always resolves to us.
- **migrate-xds-module-specifiers**: rewrite the mocked-module path in `vi.mock`/`vi.doMock`/`jest.mock`/`jest.doMock` (and bare `mock`) calls, plus `import(...)` specifiers used in TS type positions (`typeof import('@xds/core/Text')`), so the mock still intercepts the renamed `@astryxdesign/*` import.
- **drop-xds-prefix-imports**: un-prefix partial-mock override keys inside an `@xds/core` mock factory (e.g. `useXDSTruncation` → `useTruncation`) so the override matches the renamed export instead of silently overriding nothing. Scoped to recognized `@xds/core` mock factories only; unrelated object keys are untouched.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ejhammond
- @joeyfarina
- @josephfarina

---

# 0.1.7

#### New Features

- Export the authoring factories from `@astryxdesign/core`: `createConfig` at `@astryxdesign/core/config` and `createIntegration`/`createPageTemplate`/`createBlockTemplate`/`createComponentDoc`/`createFunctionDoc`/`createDoc` at `@astryxdesign/core/authoring`. Authoring a config or integration no longer requires depending on the CLI. Existing `@astryxdesign/cli/*` imports keep working via re-export.
- Add the finalized doc-authoring API to `@astryxdesign/cli/doc`: `createComponentDoc`, `createFunctionDoc` (any function, including hooks), and `createDoc` (generic reference/topic docs). Each factory stamps a `type` discriminant and is validated at the load boundary against a matching per-kind schema. The legacy loose `export const docs = {...}` format keeps loading unchanged, and `.ts`-authored hook/function sources now derive their import path to a tree-shakeable subpath instead of the bare package root.
- New codemod for the Table `tableProps` deprecation: lifts object-literal `tableProps` keys into direct props on `<Table>`, keeps colliding or dynamic values in place with a TODO note. **Codemod:** `npx astryx upgrade --codemod migrate-table-tableprops-to-direct-props` (#3679)
- New docs topic `internationalization` covering how to localize astryx components, provide translation catalogs, override default strings, coexist with existing i18n libraries (react-intl, i18next, next-intl), swap languages at runtime, and validate coverage with the shipped pseudo locale. Run `npx astryx docs internationalization` or read it at https://astryx.atmeta.com/docs/internationalization.
- template: accept `.template.{ts,mjs,js}` as the canonical suffix for template-spec files, alongside the legacy `.doc.*` suffix. Template specs export `createBlockTemplate`/`createPageTemplate` — a scaffoldable template, not documentation — so they now get a descriptive name. Core, external-package, and integration discovery (`findShowcase`, `--blocks`, `astryx template <id>` scaffolding) all treat `Foo.template.ts` identically to a legacy `Foo.doc.mjs`; same-stem `.tsx` source resolves for either suffix, and `.template.ts` authoring is loaded via jiti. Additive only — no existing files are renamed.

#### Fixes

- Translated component docs no longer drop props
  A `docsZh` / `docsDense` block that carried its own `props` array replaced the English component doc **wholesale** rather than overlaying it, so any prop the translation had not caught up with simply ceased to exist. `astryx component Button --zh` silently omitted `isInterruptible` and `isIconOnly`; ten components were affected, including `MobileNav`, `Popover` and `Stack` through the multi-component `components[]` shape.
- Anchor --dense / --zh doc overlays to their base sections (#2182)
  The compressed and translated reference docs were merged into the base doc **by array position**, so an overlay whose sections were ordered differently — or which omitted one — grafted every title onto the wrong body.
- template: inline full demo-image URLs in the Avatar blocks and theme-showcase page so scaffolding strips them to a clean placeholder. Templates that stored only the CDN base in a `const` and appended the filename via interpolation (`` `${CDN}/File.png` ``) previously scaffolded a malformed `src` — the placeholder data URI with the filename glued onto the end — plus a dead `const CDN = 'data:…'`. (#4027)

#### Documentation

- Document the minimal `package.json#exports` recipe an integration needs so its block templates are importable by a bundler-resolution consumer and type-check under `moduleResolution: bundler`: `"./templates/*.tsx": "./templates/*.tsx"` plus an extensionful `import('@acme/widgets/templates/…/…Showcase.tsx')`. Adds `packages/cli/docs/integration-authoring.md` and a fixture test proving the recipe against the repo's own `tsc` and `esbuild`.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @ejhammond
- @imdreamrunner
- @nynexman4464

---

# 0.1.6

---

# 0.1.5

#### New Features

- Add a v0.1.5 upgrade codemod that renames `labelSpacing="default"` to `labelSpacing="hug"` on Switch. (#2889)
- New `incident-console` page template: an on-call incident response console demonstrating the frame-first tracker archetype — grouped dense incident rows (StatusDot severity, Token state), PowerSearch filtering, status segmented control, and a resizable inspector panel with metadata and timeline. Adds the `Tools - Incident Console` template category.
- New `messaging-shell` page template: Slack-style column frame (rail | sidebar | stream | thread panel) built on the Chat component family — dense rows, zero cards. Adds the `Shell - Messaging` template category.

#### Fixes

- Fill viewport height across CLI page templates so the background covers the full page (#3762)
- `astryx init --features agents` now supports `--agent hermes`. The preset injects the component index into an existing `.hermes.md`/`HERMES.md` (Hermes Agent's top-priority project-context files) and otherwise creates root `AGENTS.md`, which Hermes loads from the project root — unlike the `.claude/CLAUDE.md` default. Additive only: existing `claude`/`cursor`/`codex`/`all`/auto-detect behavior is unchanged. (#2187)
- cli: `astryx doctor` now detects `@astryxdesign/theme-*` packages in pnpm projects. pnpm installs packages as symlinks into `node_modules/.pnpm`, and the theme scan only accepted real directories, so every symlinked theme package was skipped and doctor warned that none were installed (#3530).
- Make `astryx theme build`'s color-scheme declaration mode-aware, so built themes with `light-dark()` tokens no longer defeat `<Theme mode="light|dark">` forcing (#3660)
- `runCodemods` now returns `writtenFiles`, so `astryx upgrade`'s post-codemod hooks (prettier/eslint formatting) actually run on core-codemod changes.
  The runner built the `writtenFiles` list internally but omitted it from its return object, so `upgrade.mjs` read `codemodResult.writtenFiles ?? []` as always-empty and the configured `hooks.postCodemod` (e.g. `prettier --write`, `eslint --fix`) received no files and silently skipped. As a result, jscodeshift's default double-quote output (`"@astryxdesign/core/Button"`) was never reformatted to the project's style, failing `prettier-format` lint on migrated apps. The sibling `integration-runner` already returned `writtenFiles` correctly, so integration-codemod changes were formatted while core-codemod changes were not.
- `astryx swizzle`: swizzled components ship raw StyleX source that needs a build-time StyleX compiler, and without one they render unstyled with no error. The command now prints a StyleX build-setup note after copying (including the Next.js caveat that the StyleX Babel plugin disables SWC and breaks `next/font`, so an SWC-based transform is required), and `astryx docs styling` gains a "StyleX Build Setup" section covering per-bundler setup. (#3373)
- `astryx theme build`: custom component variants declared in a theme (e.g. `button['variant:accentOutline']`) now generate a type augmentation against the component's real interface (`ButtonVariantMap`) instead of a non-existent `XDS`-prefixed one, so `variant="accentOutline"` type-checks. Props with no augmentation point (closed unions like Button `size` or Heading `type`) are skipped instead of emitting dead augmentations, and the generated `.variants.d.ts` is now referenced from the theme's `.d.ts` so the augmentation actually loads. (#3371)

#### Documentation

- CodeBlock: terminal-style dark block template (syntaxTheme preset)
- Add cascade-layer safety guidance to the migration guide (`astryx docs migration`): a Cascade Layer Safety audit checklist (unlayered styles and later layers both beat `astryx-base` regardless of specificity, classify every stylesheet into a layer deliberately, layer Tailwind preflight on both v3 and v4) and a Foundation Smoke Test section (one page with Button/TextInput/Card/Table plus a non-zero-padding assertion) so a broken layer order fails before feature work instead of after N migrated screens. The getting-started guide now points to it from the theme CSS step.
- NavHeadingMenu: add a playground config and showcase block so the Overview tab has a working preview (#2698)
- NavHeadingMenu: constrain the showcase SideNav to a shorter height so the heading no longer appears to float at the top of the Overview preview (#2698)

#### Contributors

Thanks to everyone who contributed to this release:

- @arman-luthra
- @cixzhang
- @ejhammond
- @harjothkhara
- @is-jain
- @jiunshinn
- @josephfarina
- @let-sunny
- @thedjpetersen
- @zeroryu

---

# 0.1.4

#### Fixes

- `astryx component <Name>` now prints the correct `defineTheme` component-override key. The theming example stripped a stale `xds-` prefix (left over from the astryx rename) instead of `astryx-`, so it advertised keys like `astryx-base-table` / `astryx-button`. Those double-prefix to `.astryx-astryx-*` selectors at runtime and silently match nothing. Keys are now the stable class name minus `astryx-` (e.g. `base-table`, `button`), which is what `generateThemeRules` expects (#3458).
- Harden the v0.1.0 upgrade codemods against three cases surfaced while migrating consumer apps:

#### Documentation

- Add a browser-support guide (`astryx docs browser-support`) documenting the support tiers, the modern platform features Astryx depends on (Popover API, CSS anchor positioning, `light-dark()`), which components are affected, and how consumers can support older browsers for their own audience.

#### Other Changes

- **drop-xds-prefix-imports**: when un-prefixing an `@xds/core` import (e.g. `XDSCodeBlock` → `CodeBlock`) would collide with a same-named local binding in the file (such as a local `export function CodeBlock` wrapper), alias the import to `Astryx<Name>` and rewrite its usages instead of producing a duplicate declaration that breaks the build.
- **migrate-xds-css-surfaces**: rewrite CSS `@import` of `@xds/*` package stylesheets (both `'…'`/`"…"` and `url(…)` forms), including the `@xds/core/xds.css` → `@astryxdesign/core/astryx.css` file rename and the `theme-default`/`theme-daily` → `theme-neutral` collapse.
- **migrate-xds-module-specifiers**: when collapsing `@xds/theme-default`/`@xds/theme-daily` to `@astryxdesign/theme-neutral`, remap the `defaultTheme` export to `neutralTheme`, aliasing back to the original local name (`neutralTheme as defaultTheme`) so downstream usages keep working.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ejhammond
- @ryanda9910

---

# 0.1.3

#### New Features

- Add a hidden `astryx blog` command that reads the blog over the site's RSS feed and prints a post's plaintext (`.txt`) variant. The command is not shown in `--help` or the manifest and always reads from the canonical site origin.
- Component discovery is now package-ownership aware: --package scoping, source resolution for integration components, and package-qualified JSON listings.
- Strict config + integration v1 schema (integrations, issuesUrl, hooks.postCodemod) and new @astryxdesign/cli/integration export.
- File-based codemod API (createCodemod/createConfigCodemod) with the @astryxdesign/cli/codemod export and integration codemod discovery in upgrade.
- component, template, and upgrade now print a one-line non-blocking warning when a configured integration has validation issues, pointing to validate-integration.
- Add a Kanban Board page template: color-coded status columns, draggable task cards with priority tags, and board toolbar. Based on a design by @cg-hub18.
- Add frame-first layout guidance: new `astryx docs layout` topic (shell choice, region budgets, app archetypes, cards-vs-rows policy, responsive contracts), layout rules in the generated agent cheat sheet, and layout anti-patterns in `docs principles`.
- Add a v0.1.3 config codemod that migrates astryx.config layout.components to experimental.xle.components.
- Add v0.1.0 codemods for migrating `declare module "@xds/core/..."` type augmentations and `.xds-*` / `[data-xds-theme]` / `@layer xds-theme` CSS surfaces to their `@astryxdesign`/`astryx-*` equivalents.
- Introduce the Project configuration API as the single entry point for reading resolved project config, components, templates, codemods, and issue routing, replacing loadConfig. Misconfigured integrations are now skipped with a warning during upgrade instead of hard-failing, and a new --skip-codemod flag lets you re-run past a failed codemod.
- Add a Shell page-template category to the CLI: Top Nav, Side Nav, and Shell Nav app-shell scaffolds (#3245, #3246, #3247)
- Static template authoring API (createPageTemplate/createBlockTemplate) with the @astryxdesign/cli/template export and type-driven, package-scoped template discovery.
- Swizzle can now copy integration-owned components, rewrites escaping imports to the owning package, and routes maintainer feedback through config and integration issue URLs.
- `astryx theme build --watch`: rebuild a theme automatically whenever the source file changes, until interrupted with Ctrl-C. Removes the manual re-run step (and the stale-CSS confusion that comes with forgetting it) from the theme-authoring loop. Each rebuild runs in a child process so a build error is contained and the watcher keeps running. Not supported with `--json`. (#3375)
- Add the validate-integration command and integration issue model for checking an Astryx integration package's manifest and contributions.
- XLE app-component registration moved into validated config under experimental.xle.components (object form), replacing the unvalidated layout.components read.

#### Fixes

- Align the CLI error-code type declarations with the runtime error codes (add the missing ERR_AMBIGUOUS_TEMPLATE declaration).
- Correct the `doctor` theme-wiring hint to reference the real `astryx.theme` config field (was `xds.theme`) and update the agent-docs check wording to say "Astryx".
- Update the API/CLI parity harness for the package-qualified `component --list` shape, and make the component API reject a non-string name with a clean error instead of throwing.
- The XDS-prefix drop codemod now runs as a mandatory v0.1.0 upgrade step, so upgrading from 0.0.x rewrites prefixed imports (useXDSTheme, XDSButton, XDSIconRegistry, ...) to their bare names alongside the @xds/_ → @astryxdesign/_ scope rename.
- upgrade now runs core codemods before loading config, so a config codemod can repair an otherwise-invalid config; dry-run reports a fixable config and suggests the command to apply it.

#### Documentation

- Blockquote: add "With Attribution" and "Testimonials" examples (#3385)
- DateTimeInput and DateRangeInput: add example blocks so their docs pages have populated Examples sections and playground links (#2724)
- Add copyable example blocks to 46 component docs pages that previously showed only a hero visual and an empty Examples section (#3481)
- HoverCard: give the "Link Preview" example an interactive `Link` trigger so there is something to hover over (#2728)
- Lightbox: add Gallery, Video, and Zoom examples and fix the playground preview (#3301)
- Remove lingering references to the removed gap-report feature and swizzle gap flags; docs now reflect swizzle's maintainer feedback link.
- Tab: add an interactive example showing `icon` and `selectedIcon` on the Tab docs page (#2765)
- ToggleButtonGroup: add a vertical example block showing orientation="vertical" with single- and multi-select groups (#2707)

#### Other Changes

- Integration codemod and template-doc loading now use the shared module-loader util instead of duplicating the jiti/import logic.
- Extract the shared module-loading + conventional-file-discovery helpers used by config and integration loading into one internal util (no behavior change).
- Remove the standalone gap-report command. Swizzle now prints a short maintainer feedback link instead of filing issues.
- Load and validate user-authored config, integration, codemod, and template modules through one shared module loader; create\* factories are now type-only and validation happens at load.
- Remove the obsolete xds config-surface migration codemod and unify config codemod execution on the shared (file, api) runner used by integration codemods.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cg-hub18
- @ejhammond
- @ernestt
- @harshavardhan194
- @josephfarina
- @kentonquatman
- @mohitWeb-lab
- @pollychen-lab
- @thedjpetersen

---

# 0.1.2

#### Breaking Changes

- `Text`, `Heading`, `Link`, and `Timestamp` rename the `color="active"` value to `color="accent"`, now mapping to the dedicated `--color-text-accent` token (legible accent text ink) instead of `--color-accent`. Run `astryx upgrade` to migrate call sites automatically. (#2863)

#### New Features

- Let `astryx.config.mjs` integrations contribute package docs, gap-report hooks, template fetching hooks, upgrade codemods, and post-codemod hooks.
- Add `astryx theme add <slug> [path]` (and `astryx theme list`) to scaffold a theme's source into your project as editable files you own, with theme sources bundled into the CLI

#### Fixes

- align `astryx init` theme instructions with the runtime built-theme recommendation (#3080)
  `astryx init` now points users at the pre-built theme path (`@astryxdesign/theme-neutral/built` + `theme.css`) and the base CSS imports, matching the runtime `<Theme>` console guidance, instead of the slower runtime style-injection import that left apps unstyled.
- `astryx theme build` now derives every output file (.css/.js/.d.ts) from the theme name so they share one naming scheme, shows import paths as bare `./<name>` specifiers (instead of a cwd-rooted `./src/...` path that was wrong when your file already lives under src/), and no longer warns about the `variant` prop on `card`

#### Documentation

- Rename the ClickableCard and SelectableCard examples to follow the "Component — Variant" title convention (`Clickable Card — Nested Button`, `Selectable Card — Multi-select`), and add playground defaults to both card docs so their docsite previews show realistic card content (#2877)
- Declare playground scaffolds for the Chat sub-components so they preview at a realistic width (ChatComposer and ChatComposerDrawer wrap in a sized container, and the drawer seeds default content), and drop the redundant visible value label from the ChatComposerDrawer "With Progress" example while keeping the accessible label (#2877)
- Rename the DateInput "Date Range" example to "Min/Max Constraints" — it demos a single input constrained to a min/max window, not a date-range picker (#2692)
- Wire local state into more showcase examples that were frozen (static value + no-op onChange): TextInput, TextArea, NumberInput, SegmentedControl, RadioList, Tab, TabList, and TabMenu. Follows the same fix as the Slider/Selector/MultiSelector showcases so the docsite previews are actually interactive
- Wire local state into the Typeahead, Tokenizer, and FileInput showcase examples (static value + no-op onChange → frozen previews). Completes the interactive-showcase fixes started for Slider/Selector/MultiSelector (#3187-#3189) and the input/tab batch
- Wire local state into the Slider, Selector, and MultiSelector showcase examples so they are interactive — they were controlled components with a static value and a no-op/missing onChange, so the docsite previews appeared frozen (#3187, #3188, #3189)
- Add a LinkProvider example block showing how to swap in a framework router link (e.g. Next.js Link) for client-side routing (#2733)
- Add a showcase block for Outline so its docs page has a hero preview, alongside the existing example blocks (#2871)
- Remove the "MoreMenu — In Toolbar" example block — it rendered incorrectly and was redundant with the other MoreMenu examples (#2870)
- Add rendered example blocks for the two column-axis Table plugin hooks,
  shown on their own subcomponent pages:
- Move the "ToggleButton — Group" example to the ToggleButtonGroup page, where it belongs (it demonstrates grouped toggle behavior) (#2842)
- Make the Toolbar "Table Filter" example use real Selector controls for its Status and Priority filters instead of buttons styled to look like dropdowns, and add meaningful playground defaults plus richer slot options (buttons, icon buttons, tabs, segmented controls, selectors) to the Toolbar docs (#2877).

#### Other Changes

- `useTableStickyColumns — Pinned Columns` (on /components/useTableStickyColumns)
- `useTableColumnResize — Draggable Columns` (on /components/useTableColumnResize)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @durvesh1992
- @ejhammond
- @humbertovirtudes
- @rubyycheung

---

# 0.1.1

#### New Features

- Add `astryx build` command for page composition, with natural-language search ranking.
  `build "<idea>"` returns a composition kit — the closest page template, the
  blocks that cover parts, and components to fill gaps, plus a Compose suggestion.
  `build` with no args prints the how-to-build playbook. The shared search ranking
  now handles oblique natural-language queries via tokenization + stopwords, a
  synonym/intent map, light stemming, and page-template keyword enrichment.
- Make generated agent docs build-first and restructure `init` output.
  The generated `CLAUDE.md` now leads with the `build` workflow (search reframed as
  a neutral universal find), and includes a required-CSS setup note
  (`reset.css` + `astryx.css`) so components never render unstyled. `init` now
  points agents at `astryx build`/`astryx search` instead of dumping page-template
  names.
- Improve `astryx build` output into a complete composition kit.
  `build "<idea>"` now returns an agent-ready kit grouped by role: a START line
  (scaffold vs compose), the closest PAGE template, an always-on FRAME (page
  shell) and FOUNDATION (layout/typography/action primitives), idea-specific
  BLOCKS and DOMAIN COMPONENTS (with a relevance floor to cut noise), and a SETUP
  reminder. The always-on FRAME/FOUNDATION groups fix low recall of the
  structural primitives every page needs but that never keyword-match an idea
  (measured: component recall 15% to 71% on an agent-grounded eval).
- Densify agent docs + tailor styling guidance to the project's configured system
  Tightened the generated `CLAUDE.md`/`AGENTS.md` block from ~48 lines to ~26
  (the per-topic `docs` dump collapsed to one line, `build`/`search`/`component`
  no longer duplicated between workflow and reference, run-prefix stated once,
  filler prose removed) — same information, far denser.

#### Fixes

- `npx astryx` now works when the CLI is installed as a real npm package.
  The bin imported its `../src/*` modules relative to the invoked path, so running
  through the `node_modules/.bin/astryx` symlink made them resolve outside the
  package (`ERR_MODULE_NOT_FOUND: .../node_modules/src/...`) on Node versions that
  don't realpath the bin entry. It now resolves siblings via the bin's real path
  (realpath of `import.meta.url`), working whether invoked via symlink, copy, or
  Windows shim. Also fixes the non-interactive `init`/`theme` error to say
  `astryx <command>` instead of the stale `xds <command>`.
- Add a v0.1.0 upgrade codemod that migrates legacy `@xds/*` module specifiers and config surfaces to the Astryx v0.1.0 names.
  [breaking] Remove legacy `astryx.versionFile` update-hint support from package.json.

#### Documentation

- Add npm install step to the Theme System guide
  The Quick Start section jumped straight to `import {neutralTheme} from '@astryxdesign/theme-neutral'`, which fails with `Cannot find module` for anyone who hasn't already installed the theme package. Prepend a one-line preamble + `npm install` code block, and add a short prose note above the Available Themes table pointing at the install command pattern. Reported in #3082.

#### Other Changes

- StyleX compiler wired → `xstyle` / StyleX token imports
- Tailwind → utility classes backed by `@astryxdesign/core/tailwind-theme.css`
- neither → `style`/`className` with `var(--token)` design tokens, plus an
  explicit note NOT to use `xstyle`/utilities (they would not compile)

#### Contributors

Thanks to everyone who contributed to this release:

- @ejhammond
- @josephfarina
- @nynexman4464

---

# 0.1.0

#### Breaking Changes

- Read project config from `astryx.config.mjs` (was `xds.config.mjs`)
  The CLI now resolves its optional project config from `astryx.config.mjs`
  instead of `xds.config.mjs` — a hard cut, no fallback. Consumers with an
  `xds.config.mjs` must rename it to `astryx.config.mjs` (the config shape and
  all fields are unchanged). Part of removing `xds` naming from the public API.
- Rename the CLI command/bin from `xds` to `astryx`
  The CLI binary is now `astryx` (was `xds`); `bin/xds.mjs` is renamed to
  `bin/astryx.mjs`, the dual `xds`+`astryx` bin entries collapse to a single
  `astryx`, and the program/manifest name is `astryx`. Invoke the CLI as
  `npx astryx <command>` (e.g. `npx astryx component Button`). The swizzle
  default output dir moves from `./components/xds` to `./components/astryx`.
  Consumers using `npx xds`, an `xds` npm-script alias, or the `xds` MCP server
  name should switch to `astryx`. Part of removing `xds` naming from the public API.
- Rename the exported `XDSError` class to `AstryxError`
  The CLI's programmatic API error class is renamed `XDSError` -> `AstryxError`
  (exported from `@xds/cli` + declared in its types). Consumers that catch or
  reference `XDSError` from the CLI's API should switch to `AstryxError`. Part of
  removing `xds` naming from the public API.
- Remove the XDS-prefix compatibility layer — astryx is now the only public surface
  This release erases all `xds` naming from the public API; there is no compatibility
  window. Consumers must migrate (we own all consumers pre-OSS):
- Remove the daily, brutalist, and default themes; neutral is the new baseline
  Three theme packages are removed from the repo and will no longer be published:

#### Fixes

- `theme build` generates valid bare type imports (IconRegistry/DefinedTheme)
  `astryx theme build` emitted `.d.ts` files importing `XDSIconRegistry` /
  `XDSDefinedTheme` from `@xds/core`, but those aliases were removed — the
  generated types failed to resolve. Generate `IconRegistry` / `DefinedTheme`
  (the bare names `@xds/core` now exports) instead.

#### Documentation

- Update CLI theme docs to the current theme set
  Refreshes the `astryx docs theme`, `getting-started`, `styling`,
  `styling-libraries`, and `migration` reference docs to reflect the published
  themes: `neutral`, `butter`, `chocolate`, `gothic`, `matcha`, `stone`, and
  `y2k`. The removed `theme-default`, `theme-brutalist`, and `theme-daily`
  packages are dropped from the docs, and install/import examples now use
  `@astryxdesign/theme-neutral` as the recommended starting theme.

#### Other Changes

- **Component names:** the `XDS*` aliases are gone — use bare names (`Button` not
  `XDSButton`, `useTheme` not `useXDSTheme`, `ButtonProps` not `XDSButtonProps`). The
  `drop-xds-prefix-imports` codemod automates this.
- **CSS classes:** components emit only `.astryx-*` (the dual `.xds-*` class is gone).
  Update custom CSS selectors `.xds-button` -> `.astryx-button` (prop/state value classes
  like `.primary`/`.sm` are unchanged).
- **data attributes:** only `data-astryx-theme` / `data-astryx-media` are written; update
  custom selectors and SSR root attributes off `data-xds-*`.
- **CSS layers:** `@layer xds-base` / `xds-theme` are renamed to `astryx-base` /
  `astryx-theme`; update your `@layer` order line and any PostCSS `layersBefore` config.
  `@astryxdesign/build`'s default library layer is now `astryx-base`.
- **Pre-compiled stylesheet:** the `@astryxdesign/core/xds.css` export is removed — import
  `@astryxdesign/core/astryx.css`.
- **CSS custom properties:** the `--xds-*` padding fallback is gone; set `--astryx-*`.
- **CLI config key:** `@astryxdesign/cli` reads the package.json `"astryx"` field (was `"xds"`).
  Rename the block; a stale `"xds"` key silently drops the package from discovery.
- `@astryxdesign/theme-daily`
- `@astryxdesign/theme-brutalist`
- `@astryxdesign/theme-default`
- import {defaultTheme} from '@astryxdesign/theme-default/built';
  - import {neutralTheme} from '@astryxdesign/theme-neutral/built';
- <Theme theme={defaultTheme}>...</Theme>
  - <Theme theme={neutralTheme}>...</Theme>

  ```

  ```

- Remove the internal `drop-xds-meta-prefix` codemod from the OSS repo (#2970)
  This codemod has been moved to its own package's tooling, where it belongs. It was registered as an optional, version-independent transform and is not part of any standard upgrade path, so removing it does not affect the public `0.0.13 → 0.0.15` migration.
- Rename the npm package scope from `@xds/*` to `@astryxdesign/*`
  All published packages move to the new `@astryxdesign` scope (e.g. `@xds/core` → `@astryxdesign/core`), along with the workspace lockfile, build/runtime scope-directory scans, and docsite slug derivation. Consumers must update their imports and dependency names. The internal ESLint plugin namespace (`@xds/*` rules) is intentionally untouched and tracked separately. Existing `@xds/*` codemods continue to target the old scope so projects still on `@xds/*` can migrate.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ejhammond

---

# 0.0.15

#### Breaking Changes

- **New `astryx upgrade` codemods** — This release ships codemods for the DatePicker→Input rename (`rename-date-picker-to-input`), Stack `element`→`as` (`rename-stack-element-to-as`), Chat `isStreaming`→`isStopShown` (`rename-isStreaming-to-isStopShown`), imperative `ref`→`handleRef` (`rename-imperative-ref-to-handleRef`), the menu/selector `children`→`endContent` move (`migrate-item-children-to-endcontent`), and the selector function-children→`renderOption` move (`migrate-selector-children-to-render-option`). The bare-name migration (`drop-xds-prefix-imports`, `drop-xds-meta-prefix`) and the theme `migrate-theme-selectors-to-data-attrs` codemod ship as optional, run them explicitly. (#2879, #2957)

#### Upgrade

```bash
npx astryx upgrade --apply
```

#### New Features

- **`astryx` binary** — The CLI is now also available as `astryx` (same launcher as `xds`), part of the un-prefix migration. Component discovery, the doc gate, and CI checks are prefix-agnostic — both `XDS{Name}.tsx` and bare `{Name}.tsx` source files are recognized. (#2867, #2878)
- **`astryx doctor`** — New health-check command for diagnosing project/setup issues. (#2565)
- **Unified search** — `astryx search` searches across components, hooks, docs, and templates in one query. (#2564)
- **Capability manifest** — Full machine-readable capability manifest for agent discovery, plus stable machine-readable error codes on every error. (#2562, #2563)
- **`@xds/cli/api` hook export** — The `hook` is exposed via `@xds/cli/api` with types and parity coverage. (#2558)
- **CLI exit-code policy** — Every user-visible error now exits with code 1 in both human and `--json` modes (previously several command-layer errors printed a message but exited 0, invisible to CI scripts and AI agents). `xds bogus-cmd`, `astryx theme bogus-subcommand`, the bare `theme` group with an unknown subcommand, and "command not found"/"did you mean…" paths all exit 1. Help, version, and bare-list invocations still exit 0. Introduces `lib/cli-error.mjs` as the canonical exit-code helper.
- **Migration guide** — Added an explicit guide for moving existing Tailwind, shadcn, and Radix applications to XDS incrementally.
- **Data-attribute selector docs** — Documented the data-attribute selector surface in CLI docs alongside the core dual-emit change.

#### Fixes

- **`--json` on Commander short-circuits** — `--json` now honored on parse errors and `--help`. A new shim wires `exitOverride()` and a JSON-aware `configureOutput` onto every command and patches `outputHelp` to emit a `{apiVersion, type:'help', data}` envelope under `--json`. Parse errors produce `{apiVersion, error}` on stdout with exit 1; unknown subcommands now error instead of silently emitting help with exit 0; `--detail` is choice-validated. Non-`--json` invocations are unchanged.
- **`--json` contract enforcement** — Commands that don't support `--json` reject the flag in a `preAction` hook _before_ running side effects, so `astryx init --json` no longer creates files and _then_ errors, leaving partial state behind.
- **`--json` envelope documented** — Success responses are `{ type, data }`; error responses are `{ error, suggestions? }`. The `--json` help text describes both.
- **`xds --version --json`** — Emits `{ type: 'version', data: { version } }` instead of plain text.
- **`xds --json` (no subcommand)** — Emits `{ type: 'help', data: { commands, jsonSupported, ... } }` instead of human help text.
- **`astryx upgrade --json`** — "Already up to date" and "no codemods in version range" paths emit structured `{ type: 'upgrade.status', ... }` envelopes. The codemod runner is silent under `--json` so prompts and progress lines no longer corrupt stdout.
- **`astryx discover --json`** — Includes `meta: { configured: false }` when no packages are configured, distinguishing "configured but empty" from "not configured".
- **`xds gap-report --json`** — Returns a structured error instead of starting an interactive prompt when required flags are missing; the "gh CLI missing" path also emits a JSON error.
- **`astryx theme --json`** — The `theme` parent command (without a subcommand) rejects `--json` cleanly; `theme build --json` continues to work.
- **Theme CSS prose regression** — `astryx theme build` now uses a single CSS generation path (`@xds/core`'s generator) and treats a failed `@xds/core/theme` import as a hard build error instead of a silent fallback, fixing the docsite Markdown typography regression after the XDS-prefix migration. (#2964)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @czarandy
- @ejhammond
- @ernestt
- @imdreamrunner
- @josephfarina
- @kentonquatman
- @rubyycheung
- @thedjpetersen

---

# 0.0.14

#### Codemods

- `rename-action-props` — Rename `on*Action` props to `*Action` (React 19 convention) (#1942)
- `rename-status-variants` — Rename `positive`/`negative` status to `success`/`error` (#2175)
- `rename-section-wash-to-muted` — Rename Section `wash` variant to `muted` (#2063)

#### New Features

- **New component showcases** — XDSAvatarGroup, XDSInputGroup, XDSStepper, XDSButtonGroup, XDSContextMenu, XDSFileInput, XDSDateRangePicker, XDSDateTimePicker, XDSBlockquote
- **Hook documentation system** — `xds hooks` CLI command for hook docs (#1849)
- **Playground defaults** — Added to 19 more components (#2047)
- **Theme/MediaTheme/SyntaxTheme showcases** — Utility showcase support (#2040, #2028)
- **Slot elements** — Wired through playground UI for ReactNode props (#2012, #2005)
- **`exampleFor` field** — Added to all block templates (#1966)
- **`scaffold` flag** — Template metadata scaffold support (#1939)
- **Table page templates** — Heatmap Status, Matcha Store, Chart Shoe Store (#2172, #2149, #2154)

#### Fixes

- **Group useXDSToast and useXDSCollapsible** with their parent components in docs (#2049)
- **DropdownMenu inline data types** — Inline into items prop docs (#2027)
- **Parent hook docs** to their component in docsite (#2022)

---

# 0.0.13

#### Codemods

- `toolbar-density-to-size` — Migrate Toolbar `density` prop to `size` (#1448)
- `icon-name-deprecations` — Rename `checkCircle`/`xCircle` icons to `success`/`error` (#1503)
- `rename-attachments-to-drawer` — Rename `XDSChatComposerAttachments` → `XDSChatComposerDrawer` (#1714)

#### New Features

- `--skip-install` and `--force-install` flags for `astryx upgrade` (#1547)
- `npx astryx docs icons` reference + updated icon prop descriptions (#1500)
- Theme nudge in generated agent docs (#1456)
- Theme `expandColorScale` — derive color tokens from accent hex in `astryx theme build` (#1452)
- Component groups read from doc files instead of hardcoded map (#1650)
- Page and block template system (#1393)

#### Fixes

- Handle prerelease suffixes in `semverCompare` (#1512)
- Handle ternary/logical expressions in `icon-name-deprecations` codemod (#1513)
- Don't inject XDS block into files without markers during upgrade (#1495)
- `findShowcase` matches by directory name and `componentsUsed` (#1728)
- Include `onMedia` CSS in built theme output (#1450)
- Register codemods for v0.0.13 (moved from v0.0.14) (#1508)

#### Upgrade

```sh
npx astryx upgrade --apply --to 0.0.13
```

---

# 0.0.12

#### Codemods

- `add-is-icon-only` — Add `isIconOnly` to icon-only Button and ToggleButton usages (#1257)

#### Upgrade

```sh
npx astryx upgrade --apply --to 0.0.12
```

---

# 0.0.10

#### Codemods

- `remove-size-props` — Remove `size` prop from StatusDot and ProgressBar (#966)

#### Upgrade

```sh
npx astryx upgrade --apply --to 0.0.10
```

---

# 0.0.8

#### New Features

- CLI: tsx parser for .ts files
- Update hints in postAction hook

#### Codemods

- `rename-endslot-to-endcontent` — Button `endSlot` → `endContent` (#895)
- `migrate-token-renames` — Token name migration to v0.0.8 convention

#### Upgrade

```sh
npx astryx upgrade --apply --to 0.0.8
```

---

# 0.0.7

#### Codemods

- `rename-banner-variant-to-container` — Banner `variant` → `container` (#814)

#### Upgrade

```sh
npx astryx upgrade --apply --to 0.0.7
```

---

# 0.0.6

#### Codemods

- `migrate-token-names` — Design token renames per naming audit
- `migrate-shadow-tokens` — Elevation → shadow semantic naming
- `migrate-collapse-to-collapsible` — XDSCollapse → XDSCollapsible
- `migrate-radius-tokens` — Semantic radius → numeric scale
- `migrate-skeleton-radius` — Skeleton radius prop → numeric scale
- `migrate-badge-children-to-label` — Badge children → label prop

#### Upgrade

```sh
npx astryx upgrade --apply --to 0.0.6
```

---

# 0.0.5

#### New Features

- Generate agent cheat sheet from live CLI metadata (#640)
- `--detail` and `--lang` flags for typed `.doc.mjs` output (#636)
- Fold `agent-docs` into `init` with `--features` flag (#639)

> **Note:** Codemods for v0.0.5 breaking changes are registered under v0.0.6. Use `--to 0.0.6`.

---

# 0.0.4

#### Features

- **`astryx theme build`** — Renamed from `build-theme` to `theme build` (#570)
- **`--lang` flag** — ComponentTranslationDoc support for i18n/compressed docs (#611)
- **`--zh` flag** — Chinese Simplified doc output (#567)

#### Refactors

- Split `component.mjs` into `lib/` modules with lazy command registry (#613)

---

# 0.0.3

#### Patch Changes

- Sync package.json exports map
- Add verify-exports CI check (#537)

---

# 0.0.2

#### New Features

- `astryx upgrade` command with codemod support
- `astryx theme build` (formerly `build-theme`)

#### Codemods

12 codemods for the v0.0.2 breaking changes:

- `rename-selector-items-to-options` — Selector `items` → `options`
- `unify-visibility-to-onOpenChange` — Visibility callbacks → `onOpenChange`
- `unify-uncontrolled-to-defaultX` — Uncontrolled state → defaultX pattern
- `rename-banner-endButton-to-endContent` — Banner `endButton` → `endContent`
- `rename-form-tooltip-startIcon` — Form `tooltip` → `labelTooltip`, `startIcon` → `labelIcon`
- `rename-isShown-to-isOpen` — Dialog/Popover `isShown` → `isOpen`
- `rename-topnav-title-to-heading` — TopNav title → heading
- `rename-sidenav-header-to-heading` — SideNav header → heading
- `migrate-useXDSIcon-to-getIcon` — `useXDSIcon()` → `getIcon()`
- `migrate-gap-to-numeric` — String gap tokens → numeric
- `migrate-isFullBleed-to-padding` — `isFullBleed` → `padding={0}`
- `migrate-badge-dot-to-statusdot` — Badge dot → StatusDot

#### Upgrade

```sh
npx astryx upgrade --apply --to 0.0.2
```

---

# 0.0.1

- Initial release
