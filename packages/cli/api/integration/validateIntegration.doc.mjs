// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `validateIntegration()` / `astryx doctor integration validate`.
 * Colocated with the API function it documents; the shape source of truth stays
 * in `validate-integration.type.mjs`.
 * @position packages/cli/api/integration — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'validateIntegration',
  namespace: 'cli/api',
  displayName: 'validateIntegration()',
  summary:
    'Validate a single Astryx integration package and report its issues.',
  description:
    'Validates exactly ONE integration at a time: the local package rooted at ' +
    'cwd (no `pkg`), or an installed package resolved from cwd/node_modules ' +
    '(`pkg` given). It loads and schema-checks the manifest, verifies each ' +
    'declared contribution root exists, and runs the codemod/template/component/' +
    'docs/theme validators, returning every finding as an AstryxIntegrationIssue. A missing ' +
    'local manifest is guidance (name null, no issues), not an error, so callers ' +
    'can stay exit-0 in a non-integration directory. It also checks every doc the ' +
    'package ships under its roots (component, template, docs topic, theme, and translation, served or not) against ' +
    "the published authoring type for its kind, as `tsc` would, with the project's " +
    'own `typescript` (or, where `typescript` is missing or has no JavaScript compiler ' +
    'API, as TypeScript 7 does, the `@typescript/typescript6` it installs): an unknown ' +
    'field, a missing required field, or a value outside ' +
    "a field's type is a warning in `docTypes` naming the field and a fix. A test " +
    'fixture under `__tests__` in the components or docs root is counted, not checked. ' +
    'Without TypeScript, `docTypes` is `skipped` with a reason.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'validateIntegration(pkg?: string, options?: ValidateIntegrationOptions): Promise<ValidateIntegrationResponse>',
  keywords: [
    'integration',
    'validate',
    'manifest',
    'lint',
    'check',
    'types',
    'typecheck',
  ],
  params: [
    {
      name: 'pkg',
      type: 'string',
      description:
        'Installed package name to validate; omit to validate the package rooted at cwd.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'Directory to resolve the local package / node_modules from.',
    },
  ],
  returns: [
    {
      type: 'integration.validate',
      description:
        "The result envelope: `data.validated`, false when nothing was validated — with no `package.json` at all, `data.issues` carries one `no_package` error-severity issue so the command exits 1; with a `package.json` but no integration manifest, `data.issues` is empty, which means \"not looked at\", not \"healthy\"; `data.name` and `data.version` of the validated package (both null when `data.validated` is false; `data.name` is `(local package)` when the local package.json has no readable name), plus `data.issues`, an AstryxIntegrationIssue[] of {code, severity: `warning` | `error`, message, fix?, file?, line?}: `fix` is the change that resolves the issue, and `file` and `line` where it is, relative to the package, when the check knows them; and `data.notes` when there are any: {code, message, next?} information beside the issues; a note fails nothing by default, and one with `next: true` counts as a warning under `integration check --next`, fails `integration check --strict --next`, and fails `--strict` from the next minor release. Notes include `invalid_cli_command` for a `cliCommand` that was ignored as malformed and `cli_peer_version` when the running CLI is outside the `@astryxdesign/cli` peer range of the package, and the package layout findings added after the last minor release, each with its fix in the message: `duplicate_component_doc`, `symlinked_root`, `unreadable_file`, `invalid_package_json` (no `name` or `version`), `no_provider_id`, and `source_without_component_doc` for a doc whose file name differs from its source only in letter case where the two still pair; and `doc_name_mismatch` and `unknown_block_component` (see `docNames` and `blockComponents`); they become warnings in the next minor release. For the commands a topic writes, `runner_command` (written with a package runner), `plain_command` (written bare), `package_manager_command` (written for one package manager) and `doc_token` (a token that does not parse) notes each give the file, line and the token to write. A `doc_target_not_found` note names a doc whose `replaces` or `extends` names no topic and no guide of the CLI's docs or the package's own (such as a namespace, with the guides below it), so it changes nothing unless an app also installs a package that provides it, and a `doc_section_unplaced` note a section whose `before` or `after` names no section of the topic or guide it extends, so it is added at the end, and a `duplicate_guide_replacement` note two docs of the package that replace one guide, of which only the last is read; they become warnings in the next minor release. When the manifest loads, `data.docTypes` holds the doc type check: `status` (`checked` | `skipped`), `reason` when skipped, `typescript`, `docs` (doc values checked), `findings` ({doc, line, export, type, field, problem: `unknown_field` | `missing_field` | `wrong_type`, severity: `warning`, message, fix}), `unchecked` ({doc, reason}: a doc that could not be fully checked, or a root its reader cannot read), and `fixtures` when the components or docs root holds test fixture docs under `__tests__`: how many, none of them checked. When the manifest loads, `data.docNames` lists the component doc names it could not judge: `status` (`checked`), `findings` (always empty; a doc name the module its import names provably does not export is a `doc_name_mismatch` note, with its fix in the message) and `unchecked` ({file, name, reason}: a doc whose `name` differs from the name it is listed under and whose source exports cannot all be read, such as a re-export from another package). When the manifest loads, `data.blockComponents` lists the component names templates give in `exampleFor` or `componentsUsed` that could not be judged: `status` (`checked`), `findings` (always empty; a name neither the package nor Core has, and the template does not import, is an `unknown_block_component` note, with its fix in the message) and `unchecked` ({file, name, reason}: a name the template may reach through anything other than named imports and re-exports from Core, React, StyleX, local helpers or the entry of the package itself, such as an import from another package, a default or namespace import, an alias of or member read off an imported binding, require() or a dynamic import(), or a local module that cannot be read, or any name Core would have to resolve when Core is not installed). Since 0.7.3 each import apps cannot use is a note in `data.notes`, its fix inside the message, listed only: it does not fail this command or `integration check --strict`, and fails `--strict` from the next minor release. The codes are `component_import_not_exported`, `component_import_other_package`, `component_import_missing_name`, `example_import_not_exported`, `example_import_missing_name`, `template_import_not_exported`, `template_import_outside_root`, `template_private_import`, `template_import_missing_name` and `template_no_default_export`. Since 0.7.4 the examples a package ships are checked the same way: `component_without_example` (a published component no block template shows with `exampleFor` and `isShowcase: true`, or names in `alsoShowcaseFor`), `template_category` (a template category written as a path, such as `components/X`), `showcase_not_standalone` (a showcase that imports server-only code or reads `process.env` past `NODE_ENV`) and `template_asset_not_packed` (a `new URL(…, import.meta.url)` asset that is missing, or that `npm pack --dry-run` leaves out of the package). When npm cannot list the package's files, an asset no `files` entry can reach is still a note, and any other is listed in `data.exampleAssets` (`{status: 'checked', findings: [], unchecked}`, present only when it lists any) as {file, asset, reason}; `integration check` counts them as not compared. When the manifest loads, `data.publicImports` is `{status: 'checked', findings: [], unchecked}`: `unchecked` lists each import the check could not judge, as {file, specifier, reason}, the reason starting `example <label>:` for an import in a component example: an `exports` target not built yet; a module whose export list cannot be read in full (CommonJS, or a declaration file it cannot read); a root import in a package with no `exports` (the root module `main` names is not read); every name an import (other than a component doc's own component) names that its module does not export, while a TypeScript file in the package has a `declare module` block for a relative path or the package's own name or a subpath of it, which can add names to that module (a `declare module` in a comment, `declare global`, a wildcard such as `'*.css'`, and another package's name do not count; a file whose text has `declare module` but that cannot be parsed counts); the same for every such name when the package has more than 5,000 files to search for that block; a deep path into build output not built yet in a package with no `exports`; a template import of Core when `@astryxdesign/core` is not installed beside the package (a `packages/core` of the workspace under another name does not count); every import of the package's own name when package.json has no `name` or a `name` that is not a bare package name; one entry for the whole check when package.json cannot be read; and an import of a subpath whose `exports` entry has only a `types` target, unless it is `import type`, every binding is an inline `type`, or every name it imports is a type its types file declares: a value import of a name that file does not declare as a type, a namespace or side-effect import, or any import when the types file cannot be read (it may be build output). `integration check` counts the unchecked as not compared; they never fail it. `data.olderCliNotes` ({file, kind: `template` | `namespace`, field, message}), for the local package, lists each descriptor field a release before 0.7.4 refuses while the package's CLI peer range admits one, such as `stability` on a template or namespace doc; it is present only when it has entries, is never counted, and never fails a check.",
    },
  ],
  examples: [
    {
      label: 'Validate the local package',
      code: 'const r = await validateIntegration();',
    },
    {
      label: 'Validate an installed package',
      code: "await validateIntegration('@acme/astryx-integration');",
    },
  ],
  command: 'doctor integration validate',
  related: ['summarizeIssues', 'integrationTemplateConflicts', 'upgrade'],
};
