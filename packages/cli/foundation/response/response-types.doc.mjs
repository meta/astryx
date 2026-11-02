// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file EnumDoc for the `type` discriminant carried on every --json success
 * envelope. The vocabulary equals the manifest's response types (each
 * command's FunctionDoc returns; see `clients/cli/lib/manifest.mjs`) plus
 * ROOT_RESPONSE_TYPES (help, version) there; a consumer switches on `type` to
 * narrow the `data` payload. Descriptions follow the currently published
 * response projection, not a future package-version boundary.
 *
 * @input Public response discriminants and their currently released payloads.
 * @output Generated consumer reference for every typed JSON success response.
 * @position packages/cli/foundation/response — enum documentation
 */

/** @type {import('@astryxdesign/cli/authoring').EnumDoc} */
export const doc = {
  type: 'enum',
  name: 'response-types',
  displayName: 'Response Types',
  namespace: 'cli/api',
  description:
    'The `type` discriminant present on every --json success envelope. Consumers switch on it to narrow `data`.',
  members: [
    {
      value: 'init.run',
      description:
        'The install receipt: the `mode` (`default` | `features`), the features run, agent-doc files written, any soft `docsError`, whether theme guidance was emitted, the template outcome (`workflow` | `created` | `skipped`) plus its path, and whether the next-steps were emitted.',
    },
    {
      value: 'init.remove',
      description:
        'The removal receipt — returned when --remove-agents is set: `data.removed` is true when a managed agent-docs block was found and removed, and false when there was none to remove.',
    },
    {
      value: 'init.user',
      description:
        'The computer-level agent text receipt — returned when --user is set: `data.files`, one `{path, action, reason?}` per path acted on, the skill file first and then each link to its folder (action `written` | `linked` | `unchanged` | `removed` | `absent` | `kept`; `reason` only on `kept`: `edited` when a person changed the text, `not-astryx` when Astryx did not write it), `data.command` (the command the text names), and `data.warnings`.',
    },
    // component
    {
      value: 'component.list',
      description:
        "The component catalog grouped by component group (each component's group field): `detail` (the level: names | compact | full) and `components`, the grouped map of names entries ({name, package, and optional canonical import for integrations}), brief entries ({name, package, description, import}), or a full ComponentDoc per entry with its package.",
    },
    {
      value: 'component.batch',
      description:
        'The component specialization of the shared `BatchResponse` and `BatchRow` types. An explicit programmatic selector array, or two or more CLI selectors, returns one ordered receipt: `count` plus `results`, one row per selector including duplicates. Every row carries `selector` and `status` (found | not_found | ambiguous | error). A found row carries `result`, the same {type, data} response as one selector. An ambiguous row carries `code`, `error`, and `candidates` ({package, component, kind, installed}). Other failed rows carry `code`, `error`, and optional `suggestions` ({name, reason}).',
    },
    {
      value: 'component.detail',
      description:
        "One component's authored ComponentDoc plus ownership fields (package, the owner; import, the specifier; sourceAvailable, whether source exists) and parentDoc (present when the component is documented inside another component's doc, naming that doc). The envelope's package names the same owner.",
    },
    {
      value: 'component.detail.props',
      description:
        "Just one component's props table (ComponentPropDoc[]). The envelope's package names the npm package that owns the component.",
    },
    {
      value: 'component.detail.source',
      description:
        "One component's source file, as {component, source}. The envelope's package names the npm package that owns the component.",
    },
    {
      value: 'component.detail.showcase',
      description:
        "One component's showcase example, as {component, aspectRatio, source}. The envelope's package names the npm package that owns the component.",
    },
    {
      value: 'component.detail.blocks',
      description:
        "One component's example blocks, as {component, showcase, examples, related} of BlockEntry ({name, package, displayName, description, isShowcase, category}); each block names the package that owns it, and the envelope's package names the component's owner.",
    },

    // docs
    {
      value: 'docs.list',
      description:
        "All reference-doc topics as DocsListEntry[] ({topic, description, package, replaces?, replacedPackage?}), in read order; meta.namespaces lists the docs tree's top-level namespaces, and meta.notLoaded each package whose docs did not load.",
    },
    {
      value: 'docs.detail',
      description:
        "One topic's full ReferenceDoc (the JSON read of a topic, --full, --dense, or a topic with one section), with token-ref blocks inlined and each section naming the package that wrote it, plus links ({up, previous, next}: the commands that open the level it sits in and its neighbors there). A topic or guide that took another's place carries replaces and replacedPackage, the package whose topic or guide it replaced.",
    },
    {
      value: 'docs.index',
      description:
        "One topic's section index, the text read of a topic with more than one section (and --index): the topic's name, title, and description, plus sections, each {id, title, package, summary} (pass the id as the section argument; package is the npm package that wrote the section; summary is the section's one-line summary), and links ({up, previous, next}: the commands that open the level it sits in and its neighbors there); replaces and replacedPackage when the topic or guide took another's place.",
    },
    {
      value: 'docs.detail.section',
      description:
        "One ReferenceSection of a topic, found by key or title, with token-ref blocks inlined, plus links ({up, previous, next}: the commands that open its topic index and the sections before and after it). The envelope's package names the npm package that wrote the section.",
    },
    {
      value: 'docs.node',
      description:
        "One node of the docs tree, read by its route: its id, kind, package, title, summary, and breadcrumb, plus a namespace's slots with their children (one level down, each naming its package, and a guide an integration replaced its replaces and replacedPackage) or a typed doc's content, and links ({up, previous, next, related}: the commands that open its parent, its neighbors, and the docs it names).",
    },

    // blog (read from the published RSS feed)
    {
      value: 'blog.list',
      description:
        'The feed URL plus every post parsed from the RSS feed, each with slug, title, description, date, type, authors, link, and plaintext URL.',
    },
    {
      value: 'blog.detail',
      description:
        "One post's metadata plus the feed URL and the post's full plaintext body.",
    },
    // render (experimental: may change or be removed in a patch release)
    {
      value: 'render.page',
      stability: 'experimental',
      description:
        'A page rendered to one self-contained file: `input`, `output`, `bytes`, the local files embedded (`files`: modules, stylesheets, images and JSON), the package `stylesheets` cut and inlined, `classes`, `cssBytes`, `images` inlined, and `warnings` (`{code, message}`; empty when nothing looked wrong). Experimental: may change or be removed in a patch release.',
    },
    {
      value: 'render.reverse',
      stability: 'experimental',
      description:
        'A rendered file turned back into a page: `input`, `mode` (`embedded`: the embedded source written back byte for byte; `rebuilt`: rebuilt from Astryx markup, text and layout only), `output`, every file written (`files`), `exact`, the relative imports it did not carry (`missing`, when any), and for a rebuilt page `components`, `elements`, `unknown` and `omitted`. Experimental: may change or be removed in a patch release.',
    },

    // experimental icon (installed icon sets, AST-084): experimental values,
    // documented under `astryx docs cli/experimental`, not in this table.
    {
      value: 'icon.search',
      stability: 'experimental',
      description:
        'The echoed query, `matchCount` (every match, before `limit`), and matches: icons from the installed icon sets ranked by meaning, each {set, id, package, module, export, import, words, definitions, variants, reason, score}.',
    },
    {
      value: 'icon.detail',
      stability: 'experimental',
      description:
        "One icon's fields, as a match names them, with every variant's import line. The envelope names the set's package.",
    },
    {
      value: 'icon.list',
      stability: 'experimental',
      description:
        "The project's icon-set state (status, projectSet, reason), each installed set with its package, license, icon count, default variant, declared variants, and the icon definitions its `map` covers (built-in, all of Astryx's, and its own), and each withdrawn set with its reason.",
    },
    {
      value: 'icon.use',
      stability: 'experimental',
      description:
        'The `experimental.iconSet` written to astryx.config, the set it names as `<package>/<set>`, the config file, whether it was created, the value it replaced, and whether anything changed.',
    },
    {
      value: 'icon.mapMany',
      stability: 'experimental',
      description:
        'Many `map` entries written at once (--pairs): the set, its package, the data file, each entry {definition, icon, previous, changed}, whether anything changed, and the generated files rewritten.',
    },
    {
      value: 'icon.map',
      stability: 'experimental',
      description:
        'One `map` entry of the icon set being authored: the set, its package, the data file, the definition, the icon id now mapped (null after --remove), the id it replaced, and whether the file changed.',
    },
    {
      value: 'icon.add',
      stability: 'experimental',
      description:
        "One icon registered in the icon set being authored: the set, its package, the icon {id, export, module}, the variant when it was added as one, the definition mapped to it, the definition file written when it added the set's own, the files written, and whether anything changed.",
    },
    {
      value: 'icon.definitions',
      stability: 'experimental',
      description:
        'Every Astryx icon definition (--definitions): each {name, builtIn, description, words}.',
    },
    {
      value: 'icon.setIcons',
      stability: 'experimental',
      description:
        'Every icon of one set (--set with --all-icons): the set, its package, how many icons, and each icon {id, export, words, definitions}, by id.',
    },
    {
      value: 'icon.addVariants',
      stability: 'experimental',
      description:
        'One variant added for every icon of the set at once (--all): the set, its package, the variant, the module read, how many icons gained it, how many already had it, the ids the module has no export for, the files written, and whether anything changed.',
    },
    {
      value: 'icon.definitionMatches',
      stability: 'experimental',
      description:
        "The icon definitions that fit an export, before it is added: the export, its source module, the id it would get, at most 10 matches {name, description, source (astryx or set), score, reason, command}, and the command that adds the set's own definition when none fits.",
    },
    {
      value: 'icon.newSet',
      stability: 'experimental',
      description:
        "An icon set started in the integration package: the set's name, the manifest's `experimental.iconSets` root (and whether it was declared now), the manifest file, the files written, whether they were written or only planned, and with --from how many icons it wrapped and what to do next.",
    },
    {
      value: 'icon.newDefinition',
      stability: 'experimental',
      description:
        "An icon set's own icon definition: its name, the manifest file, the files written (the definition and, with --icon, the data file), and whether they were written or only planned.",
    },

    // discover (external / integration packages)
    {
      value: 'discover.list',
      description:
        'What the project has, the integrations it loads and the official packages it declares, official packages first (package, the npm package and always equal to name; name, category, components, version, a list per other kind they add, and latest when a source knows it); meta.available lists what the project could add, the official packages first, each with its package and the command that adds it, and meta.sources reports each source, the official list last; when it lists no integration it carries meta.configured to tell "nothing configured" from "nothing discovered".',
    },
    {
      value: 'discover.detail',
      description:
        'One package, for an @scope/name or @scope/name@version query: its package (the npm package the result is about), what the shown version adds, whether the project has it, and, when a source knows the package, its versions, latest release, and the command that adds it.',
    },
    {
      value: 'discover.detail.doc',
      description:
        'The validated ComponentDoc for one installed component, for an @scope/name/Component query, plus package, the npm package that owns the component.',
    },
    {
      value: 'discover.item',
      description:
        "One item that is not an installed component, for an @scope/name/<item> query: its kind, name, package, version, and whether the project has the package. The envelope's package names the same package.",
    },
    {
      value: 'discover.search',
      description:
        'The echoed query plus every matching item and package across all packages, each with its kind and whether the project has it, even when only one matches; total is set when --limit cut the list.',
    },

    // search
    {
      value: 'search',
      description:
        'The echoed query, `matchCount` (total matches, before `limit`), and results, a ranked SearchResultEntry[] bounded by `limit`: each {domain, name, package, score, reason, description, command} (package is the npm package that owns the result), plus import (components, hooks), title, parent (the command that opens the level above), and, for a hit on one section, section (docs), or displayName and kind (templates). When a search with no `type` could not obtain @astryxdesign/core, `meta.partial` is {skipped, reason}: the domains it skipped (component, hook, template) and why.',
    },

    // build
    {
      value: 'build.help',
      description:
        'The how-to-build-a-page playbook, emitted when no query is given: `playbook: true`, a title, the ordered steps (title, commands, optional returns), the on-system rules, and related lookups. Commands are bare subcommands for the caller to render with its own invocation.',
    },
    {
      value: 'build.kit',
      description:
        "The template to start from and its kit: query, hasResults, matchCount (never a cap), directMatch, start {name, package, command, basis, reason, alternatives, ...} (the start and each alternative name the package that owns the template), pages (search's closest templates), blocks and domain as SearchResultEntry[] (each naming its package), frame and foundation (Core component names), and hint {reason, commands} when thin.",
    },

    // swizzle
    {
      value: 'swizzle.list',
      description:
        "The names of swizzlable components discoverable from cwd's @astryxdesign/core. The envelope's package is @astryxdesign/core.",
    },
    {
      value: 'swizzle.copy',
      description:
        "An eject receipt: component name, owning package, output directory, files-copied count, the written file names, whether any file uses StyleX, and, when the owner has an issues URL, feedback ({issuesUrl, ghCommand?}): where to report the gap that led to swizzling. The envelope's package names the same owning package.",
    },

    // gap reports
    {
      value: 'gap-report.categories',
      description:
        'The fixed gap category values and human-readable labels; when a loaded integration names its own issues URL, meta.destinations lists every destination ({to, default, issuesUrl}) and meta.ask tells an agent to ask the person.',
    },
    {
      value: 'gap-report.file',
      description:
        'An aggregate receipt: overall status, the selected package, issuesUrl (or null), deliveries in handler order, each {handlerType: project | integration | fallback, handler, audience, status, url, message}, and filedCount/routedOnlyCount totals; without --to, when a loaded integration names its own issues URL, destinations and ask as on gap-report.categories.',
    },

    // template
    {
      value: 'template.list',
      description:
        'The effective discovered TemplateListEntry[] for pages and blocks. A winning replacement entry includes optional `replaces`, naming the Core id omitted from the default list.',
    },
    {
      value: 'template.show',
      description:
        "The resolved template's source, exactly as a copy writes it, plus its description, kind, the component names it composes, and demoMediaReplaced (how many Astryx demo media references were replaced with placeholders for you to swap for your own media).",
    },
    {
      value: 'template.skeleton',
      description:
        "A layout skeleton (structural tags with spatial annotations) plus the template's description and the components it composes. The envelope's package names the npm package that owns the template.",
    },
    {
      value: 'template.copy',
      description:
        "A scaffold receipt: template id, output directory, written file name, file count, demoMediaReplaced (how many Astryx demo media references were replaced with placeholders), notes (setup notes naming what the template needs that the project lacks — missing packages, missing StyleX compiler; empty when satisfied), missingPackages (external package names the template imports that are not in the project), and installCommand (a ready-to-run install command with the detected package manager and workspace version ranges; null when nothing is missing, or when several lockfiles leave the package manager undetermined). The envelope's package names the npm package that owns the template.",
    },

    {
      value: 'template.cdn',
      description:
        'A write receipt for the no-build-step CDN starter page: the path (relative to cwd), the Astryx version every CDN URL was pinned to, whether it was written, and the reason it was not. `exists` when a file was already there, which is a success.',
    },

    // hook
    {
      value: 'hook.list',
      description:
        "The hook catalog grouped by category: `detail` (the level: names | compact | full) and `components`, the grouped map of hook names, brief entries, or a full HookDoc per entry. The envelope's package is @astryxdesign/core, the only package that ships hooks.",
    },
    {
      value: 'hook.detail',
      description:
        "One hook's full authored HookDoc. The envelope's package is @astryxdesign/core.",
    },
    {
      value: 'hook.detail.params',
      description:
        "Just one hook's parameters table (HookParamDoc[]). The envelope's package is @astryxdesign/core.",
    },

    // theme
    {
      value: 'theme.build',
      description:
        'A theme build receipt: name, tokenCount and componentCount (override counts), sizeKB, the written outputs {css, cssDts, js, dts, and variantsDts when applicable}, warnings (defects to fix), and notices (advisories about a correct theme, such as a named font it does not load).',
    },
    {
      value: 'theme.build.check',
      description:
        'The --check receipt: theme name, an upToDate flag, the stale outputs (each {path, reason: missing | outdated}), and the full list of checked paths. Writes nothing.',
    },
    {
      value: 'theme.build.batch',
      description:
        "Several themes built in one invocation: `count` plus one {file, receipt} per theme in argument order, where receipt is that theme's theme.build (or theme.build.check) envelope, or null when it produced no CSS.",
    },
    {
      value: 'theme.list',
      description:
        'Every bundled, installed package, and local theme as a ThemeListEntry[]. Each entry has slug, displayName, description, maintained, owner package or local root, source, added, and default fields. Optional meta.unmigratedCopies names earlier descriptor-less copies, their missing descriptor, and the upgrade command; those copies are not data entries.',
    },
    {
      value: 'theme.app',
      description:
        'The app theme record after add, remove, or use. It includes every added theme and its built imports, the default slug, generated module path, and the command change. After add, the envelope package names the npm package that owns the added theme; a local theme has none.',
    },
    {
      value: 'theme.eject',
      description:
        'A local source-fork receipt with the resolved slug, displayName, source theme maintained flag, source-selector package, outputDir, source entry, exportName, and every file written, including the descriptor. The written local descriptor always uses maintained: false.',
    },
    {
      value: 'theme.template',
      description:
        'A write receipt for the annotated theme template: the path (relative to cwd), whether it was written, and the reason it was not. `exists` when a file was already there, which is a success.',
    },
    {
      value: 'theme.targets',
      description:
        'The whole themeable surface: the echoed filter, componentCount, and targets, one per theming target — {key, className, component, props, states}, where props and states are its legal override keys.',
    },
    {
      value: 'theme.palette.generate',
      description:
        'An author-reviewable OKLCH palette response: recipe (`astryx-oklch-v1`), status (`candidate`), familyCount, stopCount, modes, candidate (`TonalPaletteCandidate`), and generationReceipt. The generationReceipt contains schemaVersion (1), recipe, generatorVersion (`palette-generator-v1`), candidateFormatVersion (`palette-typescript-v1` or `palette-json-v1`), candidateSha256, optional preview, resolved request, and diagnostics. File-write fields are output, receipt, preview, written, and reason (`exists` or null).',
    },

    // upgrade
    {
      value: 'upgrade.list',
      description:
        'Every available codemod, oldest→newest, as {name, package, title, version, optional}; returned for --list without running anything.',
    },
    {
      value: 'upgrade.registry',
      description:
        'The copied-composition receipt for --registry: applied, ok, the counts (found, current, wouldUpdate, updated, wouldMerge, merged, wouldRefreshReceipt, receiptsRefreshed, conflicts, missing, invalid, failed), and items.',
    },
    {
      value: 'upgrade.status',
      description:
        'A short-circuit outcome with no codemods run (up_to_date, no_codemods, or config_fixable), each carrying the agent-docs summary. no_codemods and config_fixable carry cliBehindCore ({cliVersion, command}) when the installed Core is newer than the CLI, which then has no codemods for the releases after its own version.',
    },
    {
      value: 'upgrade.run',
      description:
        'The run receipt: from/to versions, codemod count, integrations processed, the agent-docs summary, sourcePathFound (false when the resolved source directory does not exist, so no source file was read), and (apply mode) filesChanged, transformsApplied, and per-codemod errors. regenerate lists generated files to rebuild, each with its codemods, commands and messages. When the installed Core is newer than the CLI, it also carries cliBehindCore ({cliVersion, command}): codemods for the releases after cliVersion did not run.',
    },

    // manifest
    {
      value: 'manifest',
      description:
        "The CLI capability manifest: name, version, apiVersion, description, globalOptions, commands (each name, description, arguments, options, json, aliases?, responseTypes?, examples?, exitCodes? as [{code, when}], outsideProject? (same, refuse, or own; absent on a group), subcommands?), jsonSupported, globalMode ({docs, summary}: what a run may do beyond its command, such as the hand-off to the project's own CLI, the daily update check, and the agent skill file, and the docs topic that explains it), and the flat responseTypes index.",
    },

    // help and version, which no single command owns
    {
      value: 'help',
      description:
        'Help, in one of two shapes. A bare `astryx --json` returns the root manifest: name, version, commands (the command names), jsonSupported, and manifest (the full payload `astryx manifest --json` returns). ' +
        "`--help --json` on any command, or `astryx help [command] --json`, returns that command's help: command, description, usage, options (each flags, description, and defaultValue and choices when set), and subcommands (each name and description). " +
        'data.manifest marks the first shape; data.usage marks the second.',
    },
    {
      value: 'version',
      description: 'The CLI version, for `astryx --version --json`: {version}.',
    },

    // doctor
    {
      value: 'doctor',
      description:
        'The health-check report: `checks` (each with id, label, status: pass | warn | fail | info, a message, and an optional fix, always present on warn and fail) plus a `summary` of counts per status.',
    },

    // integration authoring
    {
      value: 'integration.add',
      description:
        'A contribution-writer receipt: kind, name, optional root {path, created}, integration-manifest path, every affected project-relative path, written, and dryRun.',
    },
    {
      value: 'integration.pack-check',
      description:
        'The packed-package check: name, version, packable, tarball {filename, fileCount, size, unpackedSize} or null, inventory {manifest, roots [{kind, path, expectedFiles, missingFiles, complete}], expectedFiles, packedFiles}, contributions {local, packed}, each null or {themes [{slug, exportName}], components, templates [{id, type, name}], codemods [{version, id}], docs, agentDocsAppend}, and issues [{code, severity, message, fix?, file?, line?}] (the issues validation finds in the source and, prefixed packed_, in the packed tree, with the fix and the place when the check knows them).',
    },
    {
      value: 'integration.validate',
      description:
        'The validation result: validated (false when nothing was validated: with no package.json the issues list carries one no_package error so the command exits 1, and with a package.json but no integration manifest the issues list is empty and proves nothing), the package name and version (both null when validated is false) plus issues, an AstryxIntegrationIssue[] of {code, severity: warning | error, message, fix?, file?, line?} (fix: the change that resolves it; file and line: where, relative to the package), and notes when there are any: {code, message, next?} information beside the issues (text output marks a next note [next minor]); a note fails nothing by default, and one with next: true counts as a warning under integration check --next, fails integration check --strict --next, and fails --strict from the next minor release. Notes include invalid_cli_command for a malformed cliCommand and cli_peer_version when the running CLI is outside the @astryxdesign/cli peer range of the package, and the package layout findings added after the last minor release, each with its fix in the message (duplicate_component_doc, symlinked_root, unreadable_file, invalid_package_json, no_provider_id, source_without_component_doc where a doc and its source still pair), and doc_name_mismatch and unknown_block_component, until they become warnings in the next minor release. For the commands a topic writes, runner_command (written with a package runner), plain_command (written bare), package_manager_command (written for one package manager) and doc_token (a token that does not parse) notes each give the file, line and the token to write. A doc_target_not_found note names a doc whose replaces or extends names no topic and no guide of the CLI docs or the docs of the package (such as a namespace), and a doc_section_unplaced note a section whose before or after names no section of what it extends (it is added at the end), and a duplicate_guide_replacement note two docs of the package that replace one guide; they become warnings in the next minor release. When the manifest loads, docTypes checks each doc against its published authoring type: status (checked | skipped), reason, typescript, docs, findings (all warnings, each naming the field and a fix), unchecked, and fixtures (test fixture docs not checked). When the manifest loads, docNames lists the component doc names it could not judge: status (checked), findings (always empty; a doc name the module its import names provably does not export is a doc_name_mismatch note, with its fix in the message) and unchecked ({file, name, reason}: a doc whose name differs from the name it is listed under and whose source exports cannot all be read, such as a re-export from another package). When the manifest loads, blockComponents lists the component names templates give in exampleFor or componentsUsed that could not be judged: status (checked), findings (always empty; a name neither the package nor Core has, and the template does not import, is an unknown_block_component note, with its fix in the message) and unchecked ({file, name, reason}: a name the template may reach through anything other than named imports and re-exports from Core, React, StyleX, local helpers or the entry of the package itself, such as an import from another package, a default or namespace import, an alias of or member read off an imported binding, require() or a dynamic import(), or a local module that cannot be read, or any name Core would have to resolve when Core is not installed). Since 0.7.3 each import apps cannot use is also a note (its fix in the message), listed only and failing --strict from the next minor. So are the examples a package ships: component_without_example (a published component no block shows with exampleFor and isShowcase: true, or names in alsoShowcaseFor), template_category (a category written as a path, such as components/X), showcase_not_standalone (a showcase importing server-only code or reading process.env past NODE_ENV) and template_asset_not_packed (a new URL(…, import.meta.url) asset missing, or left out by npm pack --dry-run). When npm cannot list the files, an asset no files entry can reach is still a note and any other is listed in exampleAssets ({status: checked, findings: [], unchecked}, only when it lists any) as {file, asset, reason}. publicImports ({status: checked, findings: [], unchecked}) lists each import the check could not judge as {file, specifier, reason}; never counted or failed on. For the package being authored, olderCliNotes ({file, kind: template | namespace, field, message}) lists each descriptor field a CLI before 0.7.4 refuses, such as stability on a template or namespace doc; it is present only when it has entries, and is never counted or fails a check.',
    },
    {
      value: 'integration.template-conflicts',
      description:
        'validated (false when no integration manifest was found, so nothing was inspected), the integration identity, structural issues, and non-blocking Core template-id conflicts as {id, severity: warning, integrationPackage, integrationType, integrationName, coreMatches, message, command}.',
    },
    {
      value: 'integration.component-conflicts',
      description:
        'validated (false when no integration manifest was found, so nothing was inspected), the integration identity, structural issues, and non-blocking conflicts where an integration component name is also owned by Core; each conflict includes the exact package-qualified command. When the manifest loads and declares a components root, propDrift compares documented props with the TypeScript props: status (checked | skipped), reason, typescript, components, typesCompared, typesSkipped, findings (all warnings; a default_mismatch carries docDefault, codeDefault, and a fix), unchecked, typesNotCompared, and propsNotChecked.',
    },
    {
      value: 'integration.doc-conflicts',
      description:
        'validated (false when no integration manifest was found, so nothing was inspected), the integration identity, structural issues, and Core doc overlaps. Each finding includes `severity` (`info` | `error`) and `relationship` (`replaces` | `extends` | `accidental`). copiedPassages lists each pair of topics that repeat 10 or more words of prose word for word: topic, section, otherTopic, otherOwner (package | core), words, passages, owner (the topic that should keep the text), text (the passage as the topic writes it), line (where the copy starts in the topic to change, or null), and message (the exact replacement); each is also a copied_passage warning in issues. fluff lists padding phrases and low-density topics: topic, kind (phrase | density), phrase, section, file (relative to the package root), line, density, and message (what to cut or write instead); each is also a doc_fluff warning in issues. strayPointers lists each code span that is exactly `astryx docs <name>` for a doc that exists, in the prose, description or summary of a topic or the text fields of a component doc: topic (the topic or component doc), kind (topic | component), section, field (the field outside any section, such as description or usage.bestPractices[0].description, else null), file (relative to the package root), line, pointer (the written command), link (the {@link} that replaces it), and message; each is also a stray_doc_pointer warning in issues.',
    },
    {
      value: 'integration.check',
      description:
        'Every source check of an integration package in one result: validated (false when no integration manifest was found, so nothing was checked), the package name and version, strict, next (true with --next), and checks, one entry per check (validate, components, templates, docs), each with check, errors, warnings, skipped, failed, and response, the envelope that check returns on its own. The totals are errors, warnings, and skipped; unchecked counts what the checks could not compare, and upcoming how many of the validate notes carry next: true. With --next those notes count as warnings in the validate row and the totals. With --strict, failures lists each warning and each piece of skipped work again as an error, in the issue format the checks use, and with --strict --next each next note too; it is empty without --strict. failed decides the exit code.',
    },
  ],
};
