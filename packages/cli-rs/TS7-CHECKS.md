# TypeScript 7 checks: the API call sequence

The JS CLI runs its type checks on its own pinned TypeScript 7
(`typescript-native` = `npm:typescript@7.0.2`, packages/cli/package.json)
through the sync API (`typescript-native/unstable/sync`). This note is the
contract the Rust port mirrors: per check, which requests, which fs
callbacks, and what is read from each response. Source of truth:
`packages/cli/foundation/discovery/project-typescript.mjs` and each check's
module.

## Gate

A check runs only when the project installs `typescript` (any version):
`resolveProjectTypeScript(dirs)` tries `require.resolve('typescript/package.json')`
from each dir in order and reads its `version`. Nothing else of the project's
TypeScript is loaded. Missing → the check's `..._MISSING_REASON` (unchanged
shape; the fix text is now `TYPESCRIPT_FIX`):

```
Install TypeScript in this project (`npm install -D typescript`), then run this check again.
```

The report's `typescript` field is the version of the compiler that checked:
`typescript-native/package.json` `version` (`7.0.2`), not the project's.

There is no version gate any more (TS 4.8 / 5.x / 6 / 7 projects are all
checked by TS 7), and no "has no JavaScript compiler API" message.

## Process

`openTypeScript({cwd})` (project-typescript.mjs) — one compiler process per
check call (doc-types: one per `checkDocTypes`; prop-drift: one per
`comparePropTables`). tsgo keeps what it read (configs, files) for the life
of its process and only re-reads what `fileChanges` names, so never reuse a
process across check calls:

- Executable: what `typescript-native/lib/getExePath.js` resolves: the
  platform package `@typescript/typescript-<process.platform>-<process.arch>`
  resolved from the `typescript-native` package dir, then `<pkg>/lib/tsc`
  (`tsc.exe` on Windows). Rust: realpath of
  `packages/cli/node_modules/typescript-native` →
  `require.resolve('@typescript/typescript-linux-x64/package.json')` from
  there → `lib/tsc`.
- Spawn args: `--api --cwd <cwd> --callbacks=readFile,fileExists`
  (`cwd` = the check's package dir).
- If loading the package or spawning fails (the constructor throws), the check
  returns `status: 'skipped'` with
  `nativeTypeScriptFailedReason(error, outcome)`:
  ``This CLI's TypeScript 7 compiler could not start (<error.message>), so <outcome>. Reinstall @astryxdesign/cli for this platform and run this check again.``
- fs callbacks (arguments and returns JSON, as the Node client encodes them):
  - `readFile(path)`: a virtual file set for that exact path → its text;
    otherwise `undefined` (fall back to the real FS). Never `null`.
  - `fileExists(path)`: a virtual file set for that path → `true`; otherwise
    `undefined` (fall back).
- `close()` at the end of the check (also on error): SIGKILL the compiler
  process first, then close its pipes. No `release` requests. (Closing its
  stdin first makes tsgo print `context canceled` on the stderr it inherits;
  that leaked into one golden before the fix.)

### Opening a program

`session.project(dir, rootNames, compilerOptions, changed = [])`:

1. Virtual config path: `path.join(dir, "__astryx_check_<n>.tsconfig.json")`,
   `n` a per-process counter starting at 1 (only the name differs between
   runs; it never shows in output).
2. Its text, served by `readFile`, byte-exact:
   `JSON.stringify({compilerOptions, files: rootNames})` — keys in the order
   each check lists them below, no whitespace.
3. `updateSnapshot({openProjects: [configPath]})`, plus
   `fileChanges: {changed: [...]}` when `changed` is non-empty (files set
   again since an earlier snapshot of the same process).
4. `snapshot.getProject(configPath)`.

`session.update(project, changed)`: `updateSnapshot({fileChanges: {changed}})`
→ `snapshot.getProject(project.configFileName)`.

`session.parseConfigFile(path)` = API `parseConfigFile({file: path})` →
`{options, fileNames}` (no errors in the response).

### Parsing text

`syntax.createSourceFile(fileName, text)` / `syntax.prefetchSourceFiles([{fileName, text}])`
(project-typescript.mjs): texts not parsed yet in this process each get a
virtual file `path.join(cwd, "__astryx_text_<k>" + ext)` (`ext` from
`fileName`, default `.ts`; `k` a per-process counter from 1) holding exactly
`text`, then one parse program:
`{"compilerOptions":{"noLib":true,"noResolve":true,"allowJs":true,"noEmit":true,"types":[]},"files":[...]}`
opened with `updateSnapshot({openProjects:[cfg], closeProjects:[previous parse cfg]})`
(no `closeProjects` the first time). Per file: `getSourceFile(file)` (the
tree) and `getSyntacticDiagnostics(file)` (= TS 6's `parseDiagnostics`). Kept
by `ext + text` for the process.

### Positions

All positions in requests and responses are UTF-16 code-unit offsets into
the file's text (verified: diagnostics `pos`/`end`, `getSymbolAtPosition`).
Rust/oxc spans are UTF-8 bytes: convert.

### Diagnostics

`program.getSyntacticDiagnostics(file)` / `getSemanticDiagnostics(file)`
return `{fileName, pos, end, code, category, text, messageChain?, relatedInformation?}`.

- Chain (`diagnosticChain`): `[d.text, d.messageChain[0].text,
  d.messageChain[0].messageChain[0].text, …]` — first child at each level,
  outermost first (TS 6's `messageText` chain read the same way).
- Flattened (`flattenDiagnostic(d, newLine)`): TS's
  `flattenDiagnosticMessageText`: `d.text`, then for each child, recursively,
  `newLine + '  '.repeat(level) + child.text`.
- Output quotes tsgo's message text (shortened); match it verbatim — both CLIs
  run the same tsgo, so it is the same text.

## Syntax

The JS side walks TypeScript 7's own syntax tree
(`program.getSourceFile(file)`, `typescript-native/unstable/ast`) through a
facade with TS 6's helper names (`typeScriptSyntax()`), so the checks' syntax
code is unchanged. Rust may parse with oxc instead; what matters is the
positions and texts read, listed per check. TS 7 differences that change
which nodes exist:

- In JS files, a JSDoc cast `/** @type {T} */ (x)` is
  `ParenthesizedExpression(AsExpression(x, T))` (TS 6: a
  `ParenthesizedExpression` carrying the JSDoc). `@satisfies` likewise gives
  a `SatisfiesExpression`. The reparsed node's `end` equals its expression's,
  and its type node lies inside the comment.

## doc-types (`foundation/discovery/doc-types.mjs`)

1. Gate; no doc files → `{status: 'checked', docs: 0, …}` without starting
   the compiler.
2. `openTypeScript({cwd: packageDir})`.
3. Read each doc file (`fs.readFileSync`); unreadable → `unchecked`.
4. Parse (JS only; Rust: oxc): each doc set as a virtual file at
   `path.resolve(doc)` with its text as written, then
   `project(packageDir, docs, {"noLib":true,"noResolve":true,"allowJs":true,"noEmit":true,"types":[]})`
   and `program.getSourceFile(doc)` each. No checker call.
5. Targets and instrumented text exactly as before (see the module): same
   blanking and insertions (`(… ) satisfies T` for `.ts`,
   `/** @satisfies {T} */ (…)` otherwise).
6. Each instrumented text set as the virtual file at the same path. Pass 0:
   `project(packageDir, instrumentedPaths, compilerOptions, instrumentedPaths)`
   (`changed` = the same paths, since step 4 served other text for them), with
   `compilerOptions`, in this key order:

   ```
   {"allowJs":true,"checkJs":true,"noEmit":true,"skipLibCheck":true,"strict":true,"noImplicitAny":false,"target":"es2022","module":"esnext","moduleResolution":"bundler","jsx":"react-jsx","resolveJsonModule":true,"allowImportingTsExtensions":true,"types":[],"paths":{"@astryxdesign/cli/authoring":["<abs>/packages/cli/authoring/index.d.ts"]}}
   ```

   `rootNames` = instrumented docs in input order (unreadable and
   target-less docs dropped).
7. Per pending doc, in order: `getSyntacticDiagnostics(doc)`; the first one,
   flattened with `' '`, goes into the "cannot parse it with its type check
   added (…)" reason. Else `getSemanticDiagnostics(doc)`; keep codes
   1360 2322 2353 2559 2561 2739 2740 2741 2820 with a `pos`; map `pos` back to
   the original text; the rest is unchanged (findings from `diagnosticChain`).
8. Docs that changed get new instrumented text (set again), and the next pass
   is `update(project, changedDocPaths)` (only the docs still pending), up to
   50 passes.
9. `close()`.

## Checker interface (`foundation/discovery/typescript-checker.mjs`)

prop-drift, type-match and unresolved-references keep TS 6's checker method
names through `adaptProject(project, syntax)`. Each symbol/type/signature is
wrapped once per raw object (identity holds). Mapping, each = one request
or a field of a response:

| TS 6 name | TS 7 |
| --- | --- |
| `checker.getSymbolAtLocation(node)` | `getSymbolAtLocation` (node handle) |
| `getExportsOfModule(s)` / `getAliasedSymbol(s)` | same |
| `getExportSymbolOfSymbol(s)` | `symbol.getExportSymbol()` (exportSymbol id) |
| `getTypeOfSymbolAtLocation(s, node)`, `getTypeOfSymbol`, `getDeclaredTypeOfSymbol` | same |
| `getPropertiesOfType`, `getPropertyOfType(t, name)` | same |
| `getIndexInfosOfType(t)` → `{keyType, type, declaration}` | same; `type` = `valueType`, `declaration` = resolved handle |
| `typeToString(t, node?, flags?)` | same; flags are TS 6's `TypeFormatFlags` bits (NoTruncation 1, UseAliasDefinedOutsideCurrentScope 1<<14, InTypeAlias 1<<23, UseSingleQuotesForStringLiteralType 1<<28) |
| `getTypeFromTypeNode(node)`, `getTypeAtLocation(node)`, `getShorthandAssignmentValueSymbol(node)` | same (node handles) |
| `isTypeAssignableTo`, `getUndefinedType`, `getTypeArguments` | same |
| `getSymbolsInScope(loc, meaning)` filtered by name (type-match) | `resolveName(name, meaning, loc, false)` |
| `getFullyQualifiedName(s)` (enum identity key only) | names of `s` and its `getParent()` chain joined with `.` |
| `getStringLiteralType` | absent → keyAccepts' template-matching fallback |
| `type.isUnion()/isIntersection()/types` | flags; `getTypesOfType` (union, intersection, template literal) |
| `type.symbol/aliasSymbol/aliasTypeArguments` | `getSymbolOfType` / `getAliasSymbolOfType` / `getAliasTypeArgumentsOfType` (only when the id field is set) |
| `type.target` (reference) / `.type` (string mapping) | `getTargetOfType` |
| `type.value`, `intrinsicName`, `texts`, `objectFlags` | fields; a boolean literal's `intrinsicName` = `"true"`/`"false"` from `value` |
| mapped `type.declaration` | the type's symbol's declaration that is a `MappedType` node |
| `type.getCallSignatures()/getConstructSignatures()` | `getSignaturesOfType(t, Call=0 / Construct=1)` |
| `signature.getParameters()/getTypeParameters()` | same |
| `symbol.declarations/valueDeclaration` | node handles → `NodeHandle.resolve(project)` (cached by path+index) |
| `symbol.links.target` (copiesType) | `symbol.checkFlags & 1` (Instantiated) |
| `symbol.links.mappedType/keyType/syntheticOrigin/containingType` (mappedPropOrigin) | not exposed: see prop-drift below |
| `type.mapper`, `type.constraintType` (namesFromTypeParameter) | not exposed: see prop-drift below |
| `program.getCompilerOptions()` | `project.compilerOptions` (parsed: enums as numbers) |
| `program.isSourceFileDefaultLibrary(sf)` | same |
| `program.getSemanticDiagnostics(file)` → `{start, code, category, messageText}` | same, `start` = `pos`, `messageText` = `text` |

## prop-drift (`foundation/discovery/prop-drift.mjs`)

1. Gate (`TYPESCRIPT_MISSING_REASON`); no tables → `{status:'checked', typescript: <7.x>, …0}` without a process.
2. `openTypeScript({cwd: packageDir})`; failure → skipped with
   `nativeTypeScriptFailedReason(e, 'documented props were not compared with the code')`.
3. `openPackageProject(session, packageDir, allTableSources)` (below). Error →
   every table unchecked with the same reason text as before.
4. `adaptProject`. `compilerOptions = {...project.compilerOptions, configFilePath: <real chosen config> | undefined}`
   (the real path, never the virtual one: it shows in "named in" reasons).
5. `unresolvedGlobals` as before (see unresolved-references).
6. `nullable = !(strictNullChecks ?? strict ?? true)` (TS 7 defaults strict on).
7. Prefetch every documented type: for each table prop with a string `type`,
   the whole text and each ` / `-split part, each as
   `{fileName:'type-text.ts', text:`type T = ${t}\n;`}` and
   `{fileName:'__documented_type__.ts', text:`type __Documented = ${t};`}`,
   in one parse batch (order: tables, props, [whole, ...parts], [type-text, documented]).
8. Then the comparison exactly as before, with these TS 7 substitutions:
   - module symbol: `getSymbolAtLocation(sourceFile)`.
   - `copiesType`: `own === symbol || declared === type || (symbol.checkFlags & 1 && print(type) === print(declared))`.
   - `namesFromTypeParameter`, mapped type: open when its constraint
     (`declaration.typeParameter.constraint`) names a type parameter (a
     `TypeReference` whose `getSymbolAtLocation(typeName)` has
     SymbolFlags.TypeParameter) whose value is deferred. Value =
     `aliasTypeArguments[i]` where `i` is the parameter's index in the type's
     alias declaration's `typeParameters` (`aliasValue`). No value: a
     parameter declared by a type alias → open iff the mapped type has no
     properties and no index infos; any other (the component's own) → open.
     `renamedByTypeParameter` (the `as` clause) uses the same value rule.
   - `mappedPropOrigin`: `propOrigin(prop, depth, container)`; the
     container is the props member the prop came from (or the `keyof`
     operand type). A prop without declarations: walk the container (union /
     intersection members; a class/interface's `getBaseTypes`), find the
     member whose `getPropertyOfType(name)` holds it: with declarations →
     own/foreign by them; a mapped member → its declaration's sites (as
     collected by the walk) answer `keyOrigin(constraint, key, env)` with
     `key = prop.name`, or `key = null` (any literal key) when the mapping
     has an `as` clause. Each (mapping, env, key) is answered once; a
     re-entry answers null.
   - `keyAccepts` always takes the template-matching path.
9. `close()`.

## package-tsconfig (`openPackageProject`)

1. Config: nearest `tsconfig.json` from `packageDir` up (fs). Not read when
   the package is below `node_modules` relative to it.
2. Per config: raw text read (missing → "unreadable"), JSONC-parsed by the CLI
   for `references` (each `path` resolved; not `.json` → `<path>/tsconfig.json`),
   and `parseConfigFile(path)` for `{fileNames, options}`.
3. Solution walk as before: the first config (depth first through
   references, each once) whose `fileNames` hold a source. None: the first
   visited reference with a problem is the error (`<rel>: Cannot read file '<abs>'.`
   when unreadable, else the first `getConfigFileParsingDiagnostics()` of a
   probe project `{"extends":<ref>,"compilerOptions":{"noLib":true,"noResolve":true,"types":[]},"files":[],"include":[]}`
   with code ≠ 18002/18003, flattened with `' '`), and no program is built.
4. Ambient candidates from the chosen config's `fileNames` (an entry without
   extension gets the first existing of .ts .tsx .d.ts .cts .d.cts .mts .d.mts):
   `.d.*ts` yes; text with `declare global|module` yes; not `.ts/.tsx` no;
   no `import`/`export` word yes; else maybe.
5. Program: virtual tsconfig in the chosen config's folder:
   `{"extends":"<abs config>","compilerOptions":{"noEmit":true,"skipLibCheck":true,"incremental":false,"composite":false[,"jsx":"react-jsx" when options.jsx is unset]},"files":[<config's own files entries>, ...sources, ...yes/maybe candidates],"include":[]}`.
   The config's own `files` entries come from the nearest config in its
   relative `extends` chain that writes `files`, each re-expressed relative
   to the chosen config's folder (`${configDir}` kept as written).
   No config: virtual tsconfig in `packageDir`:
   `{"compilerOptions":{"jsx":"react-jsx","target":"es2022","module":"esnext","moduleResolution":"bundler","strict":true,"allowJs":true,"resolveJsonModule":true,"allowImportingTsExtensions":true,"noEmit":true,"skipLibCheck":true,"incremental":false,"composite":false},"files":[...],"include":[]}`.
6. Error: first `getConfigFileParsingDiagnostics()` with code ≠ 18002/18003 →
   `<rel config>: <flattened>`; else first `getProgramDiagnostics()` with code
   6053/6231 → `<rel config>: <d.text>` with `<abs config dir>/` replaced by
   the folder relative to `packageDir` (`''` at the package root).
7. Declarations = yes candidates + maybe candidates whose tree has no
   `externalModuleIndicator`.

## unresolved-references

Unchanged walk; TS 7 substitutions:
- `noUncheckedSideEffectImports ?? true`.
- `ts.resolveModuleName(spec, from).resolvedModule` → `moduleFound(spec, from)`:
  relative/absolute → the path, the path + any of .ts .tsx .d.ts .mts .cts
  .d.mts .d.cts .js .jsx .mjs .cjs .json, a `.js`/`.mjs`/`.cjs` name's TS
  twin, or a folder with package.json or index.<ext>; bare → walking up from
  the file: `node_modules/<pkg>` (and, for a subpath, the subpath as above or
  an `exports` key/pattern) or `node_modules/@types/<mangled>`.
- `resolveTypeReferenceDirective(name, from)` → `typesFound(name, fromDir, options.typeRoots)`:
  each type root's `<name>` first, then walking up `node_modules/@types/<mangled>`,
  `node_modules/<name>`; in a package: `types` ?? `typings` ?? `index.d.ts`,
  trying `<entry>`, `<entry>.d.ts`, `<entry>/index.d.ts`.
- `getAutomaticTypeDirectiveNames` → `options.types ?? []`; `*` → the other
  names plus every non-dot folder in each type root (default: every
  `node_modules/@types` from the config's folder up; `a__b` → `@a/b`).
- Diagnostics category Error = 1; `start` = `pos`.

## Measurements (JS CLI, median of 5, this box)

| fixture | command | before: TS 6 JS compiler | after: TS 7 native |
| --- | --- | --- | --- |
| doctor-ts/kit | `doctor integration validate --json` | 1.68 s | 0.79 s |
| doctor-ts/kit | `integration check` | 2.47 s | 1.47 s |
| doctor-ts2/badconfig | `doctor integration validate --json` | 1.66 s | 0.73 s |
| doctor-ts2/badconfig | `integration check` | 2.53 s | 1.45 s |
| doctor-ts2/clean | `doctor integration validate --json` | 1.61 s | 0.70 s |
| doctor-ts2/clean | `integration check` | 2.36 s | 1.58 s |
| doctor-ts2/defaults | `doctor integration validate --json` | 1.77 s | 0.72 s |
| doctor-ts2/defaults | `integration check` | 2.39 s | 1.52 s |
| doctor-ts2/shapes | `doctor integration validate --json` | 1.84 s | 0.73 s |
| doctor-ts2/shapes | `integration check` | 2.38 s | 1.67 s |
| doctor-ts2/unresolved | `doctor integration validate --json` | 1.69 s | 0.73 s |
| doctor-ts2/unresolved | `integration check` | 2.32 s | 1.56 s |

`integration check` on doctor-ts2/clean without TypeScript installed takes 1.28 s: the TS checks now cost ~0.2 s of its 1.49 s; the rest is the command's other checks.
