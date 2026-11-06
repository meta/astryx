// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for integration component-conflict diagnostics. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationComponentConflicts',
  namespace: 'cli/api',
  displayName: 'integrationComponentConflicts()',
  summary:
    'Check integration component names, replaces declarations, and documented props.',
  description:
    'Loads one local or installed integration, compares its component names with ' +
    'Core, and returns non-blocking conflicts with the exact package-qualified ' +
    "component command required to keep an intentional overlap. Each component's " +
    'replaces is checked too: its findings are issues, errors for a package that ' +
    'declares the CLI range that turns replacement on and warnings otherwise. ' +
    "A `{@link}` in a component doc's text that names no doc is an `invalid_doc_graph` " +
    'warning, since it prints as written. ' +
    "Each component doc's props are compared with the component's TypeScript props, " +
    "read with the project's own `typescript` (or, where `typescript` is missing or has no " +
    'JavaScript compiler API, as TypeScript 7 does, the `@typescript/typescript6` it ' +
    'installs): a documented prop the code lacks, a ' +
    'prop the package declares that the doc omits, a wrong `required`, or a type ' +
    'that does not match. A type is judged only when it reads exactly: the same ' +
    'text as the source, once whitespace, quotes and union order are set aside (exactly, if it contains `readonly`), ' +
    'or primitives, literals, arrays and unions of those, or a name for one, on ' +
    'both sides, a field such as `status.type` included, and for a union of ' +
    "props types, the type of any one member. A field the prop's variants give " +
    "different types is listed when the doc gives only some variants' types. A " +
    'mutable array type matches a readonly one, because callers can pass it; a ' +
    'readonly one documented for a mutable array is a mismatch. ' +
    '`Name = …` with a union after it ' +
    "must match in both parts; one value after it (`Size = 'md'`) is read as a " +
    "default. A name only TypeScript's own libraries declare is not resolved, and " +
    '`React.X` resolves through React where the prop is declared. Every ' +
    'other type is listed as not compared, never reported, and so is a name an ' +
    'index signature takes unless exactly one the package declares takes it; ' +
    'with a TypeScript older than 4.8 no type is judged. ' +
    'Those findings are warnings in `propDrift`; without TypeScript it is ' +
    '`skipped` with a reason.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationComponentConflicts(pkg?: string, options?: IntegrationAuthoringOptions): Promise<IntegrationComponentConflictResponse>',
  keywords: [
    'integration',
    'component',
    'conflict',
    'authoring',
    'doctor',
    'props',
    'drift',
  ],
  params: [
    {
      name: 'pkg',
      type: 'string',
      description: 'Installed package; omit for the local package.',
    },
    {name: 'options.cwd', type: 'string', description: 'Resolution directory.'},
  ],
  returns: [
    {
      type: 'integration.component-conflicts',
      description:
        "`validated` (false when no integration manifest was found, so nothing was inspected), integration identity, structural and replaces issues, and Core component-name conflicts with package-qualified commands. An active replacement that keeps the Core name it replaces is not a conflict. When the manifest loads and declares a components root, `propDrift` holds the props comparison: `status` (`checked` | `skipped`), `reason` when skipped, `typescript`, `components` compared, `typesCompared` (documented prop types judged), `typesSkipped` (why none was, with a TypeScript older than 4.8), `findings` ({component, prop, kind: `not_in_code` | `not_in_doc` | `required_mismatch` | `type_mismatch` | `default_mismatch`, severity: `warning`, message, doc, source, docType?, codeType?, docRequired?, codeRequired?, docDefault?, codeDefault?, fix?}), `unchecked` ({component, doc, reason}), `typesNotCompared` ({component, doc, reason, props}: every other documented prop type, grouped by why it was not judged: not a form the check judges exactly (a doc type that does not parse, or a prop a mapped type builds from keys the check cannot trace, included), a field the prop's variants give different types, a standard prop such as `className`, or a prop declared outside the package), and `propsNotChecked` when a mapped type builds props from keys the check cannot trace to the package ({component, doc, reason, props}: no warning is drawn for those props).",
    },
  ],
  examples: [
    {
      label: 'Check the local integration',
      code: 'await integrationComponentConflicts();',
    },
  ],
  command: 'doctor integration components',
  related: ['integrationTemplateConflicts', 'component'],
};
