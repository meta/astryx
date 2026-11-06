// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring` must describe the published authoring types
 * exactly. For each self-doc this checks, against the TypeScript types
 * themselves: every field of the type is documented, every documented field
 * exists, each documented `type` string is the same type as the real field,
 * and each `required` flag matches whether the field is required in every
 * variant of the type. Graph fields may be left to the graph-fields self-doc.
 */

import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBPATHS = [
  'authoring',
  'doc',
  'config',
  'integration',
  'codemod',
  'debug',
];
const GRAPH_FIELDS = ['placement', 'aliases', 'audience', 'stability'];

/** Each self-doc and the published type (or union) it describes. */
const SELF_DOCS = {
  'doctypes/base/graph-fields.doc.mjs': 'AuthoredDocGraphFields',
  'doctypes/component/component.doc.mjs': 'ComponentDoc',
  'doctypes/hook/hook.doc.mjs': 'HookDoc',
  'doctypes/function/function.doc.mjs': 'FunctionDoc',
  'doctypes/reference/reference.doc.mjs': 'ReferenceDoc',
  'doctypes/template/template.doc.mjs': 'TemplateDoc',
  'doctypes/schema/schema.doc.mjs': 'SchemaDoc',
  'doctypes/command/command.doc.mjs': 'CommandDoc',
  'doctypes/enum/enum.doc.mjs': 'EnumDoc',
  'doctypes/namespace/namespace.doc.mjs': 'NamespaceDoc',
  'doctypes/theme/theme.doc.mjs': 'ThemeDoc',
  'config/config.doc.mjs': 'AstryxConfig',
  'debug/debug.doc.mjs': 'DebugEvent',
  'gap-report/gap-report.doc.mjs': 'GapReportHandler',
  'integration/integration.doc.mjs': 'AstryxIntegration',
  // The codemod types describe a loaded codemod, whose `isOptional` has its
  // default; the self-doc describes what an author writes.
  'codemod/codemod.doc.mjs':
    "(Omit<AstryxCodemod, 'isOptional'> & {isOptional?: boolean}) | (Omit<AstryxConfigCodemod, 'isOptional'> & {isOptional?: boolean})",
};

const config = ts.getParsedCommandLineOfConfigFile(
  path.join(CLI, 'tsconfig.strict.json'),
  {},
  {...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {}},
);
const options = {...config.options, noEmit: true, skipLibCheck: true};
const VIRTUAL = path.join(CLI, 'test', '__self_docs_match_types__.ts');

/** Type-check `source` as a file inside the package; returns its diagnostics. */
function check(source) {
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version) =>
    file === VIRTUAL
      ? ts.createSourceFile(file, source, version)
      : getSourceFile(file, version);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = file => file === VIRTUAL || fileExists(file);
  const program = ts.createProgram([VIRTUAL], options, host);
  return {
    program,
    diagnostics: ts.getPreEmitDiagnostics(
      program,
      program.getSourceFile(VIRTUAL),
    ),
  };
}

/** Every type name the authoring subpaths export, for unqualified doc strings. */
function exportedTypeNames() {
  const probe = SUBPATHS.map(
    (s, i) => `import type * as S${i} from '@astryxdesign/cli/${s}';`,
  ).join('\n');
  const {program} = check(`${probe}\nexport {};`);
  const checker = program.getTypeChecker();
  const names = new Map();
  for (const [i, subpath] of SUBPATHS.entries()) {
    const file = program.getSourceFile(VIRTUAL);
    const decl = file.statements[i];
    const sym = checker.getSymbolAtLocation(decl.moduleSpecifier);
    if (!sym) continue;
    for (const e of checker.getExportsOfModule(sym)) {
      const target =
        e.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(e) : e;
      if (
        target.flags &
          (ts.SymbolFlags.Type |
            ts.SymbolFlags.Interface |
            ts.SymbolFlags.TypeAlias) &&
        !names.has(e.name)
      ) {
        names.set(e.name, subpath);
      }
    }
  }
  return names;
}

const NAMES = exportedTypeNames();
const PRELUDE = [
  ...[...NAMES].map(
    ([name, subpath]) =>
      `import type {${name}} from '@astryxdesign/cli/${subpath}';`,
  ),
  'type Expect<T extends true> = T;',
  'type Same<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;',
  'type Field<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? T[K] : never) : never;',
  'type Req<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? ({} extends Pick<T, K> ? false : true) : false) : never;',
  'type AlwaysRequired<T, K extends PropertyKey> = [Req<T, K>] extends [true] ? true : false;',
  'type Keys<T> = T extends unknown ? keyof T : never;',
  'type Defined<T> = unknown extends T ? T : NonNullable<T>;',
].join('\n');

/**
 * Each documented field with the steps from the root type to it. A field's
 * `fields` are its properties when named `<field>.x` or `<field>[].x`, and its
 * parameters, in order, when it is a function and they are named on their own
 * (as `transform` documents `file` and `api`).
 *
 * @returns {{field: any, steps: Array<{prop: string} | {elem: true} | {param: number}>}[]}
 */
function flatten(fields, prefix = '', base = [], out = []) {
  let param = 0;
  for (const field of fields) {
    /** @type {Array<{prop: string} | {elem: true} | {param: number}>} */
    let steps;
    let name = field.name;
    if (
      prefix &&
      !name.startsWith(`${prefix}.`) &&
      !name.startsWith(`${prefix}[].`)
    ) {
      steps = [...base, {param: param++}];
    } else {
      if (prefix)
        name = name.slice(
          name.startsWith(`${prefix}[].`)
            ? prefix.length + 3
            : prefix.length + 1,
        );
      steps = [...base];
      if (prefix && field.name.startsWith(`${prefix}[].`))
        steps.push({elem: true});
      for (const [i, segment] of name.split('.').entries()) {
        steps.push({prop: segment.replace(/\[\]$/, '')});
        if (segment.endsWith('[]') && i < name.split('.').length - 1)
          steps.push({elem: true});
      }
    }
    out.push({field, steps});
    if (field.fields) flatten(field.fields, field.name, steps, out);
  }
  return out;
}

/** The type expression for the steps before the last one. */
function parentOf(root, steps) {
  let expr = `(${root})`;
  for (const step of steps.slice(0, -1)) {
    if ('prop' in step) expr = `NonNullable<Field<${expr}, '${step.prop}'>>`;
    else if ('elem' in step) expr = `${expr}[number]`;
    else expr = `Parameters<NonNullable<${expr}>>[${step.param}]`;
  }
  return expr;
}

describe('astryx docs authoring matches the published types', () => {
  it.each(Object.entries(SELF_DOCS))(
    '%s',
    async (file, root) => {
      const {doc} = await import(
        pathToFileURL(path.join(CLI, 'authoring', file)).href
      );
      const fields = flatten(doc.fields);
      /** @type {string[]} */
      const lines = [PRELUDE];
      /** @type {Map<number, string>} */
      const meaning = new Map();
      const line = (text, what) => {
        lines.push(text);
        meaning.set(lines.join('\n').split('\n').length - 1, what);
      };
      for (const [i, {field, steps}] of fields.entries()) {
        const parent = parentOf(root, steps);
        const last = steps.at(-1);
        if ('param' in last) {
          line(
            `type Type${i} = Expect<Same<(${field.type}), Parameters<NonNullable<${parent}>>[${last.param}]>>;`,
            `\`${field.name}\` is documented as \`${field.type}\`, which is not its type`,
          );
          continue;
        }
        line(
          `type Has${i} = Expect<'${last.prop}' extends Keys<${parent}> ? true : false>;`,
          `\`${field.name}\` is documented but is not a field of ${root}`,
        );
        line(
          `type Type${i} = Expect<Same<(${field.type}), Defined<Field<${parent}, '${last.prop}'>>>>;`,
          `\`${field.name}\` is documented as \`${field.type}\`, which is not its type`,
        );
        line(
          `type Req${i} = Expect<Same<AlwaysRequired<${parent}, '${last.prop}'>, ${field.required ? 'true' : 'false'}>>;`,
          `\`${field.name}\` is documented as ${field.required ? 'required' : 'optional'}, which does not match the type`,
        );
      }
      const documented = new Set(
        fields
          .filter(({steps}) => steps.length === 1)
          .map(({field}) => field.name),
      );
      const allowedMissing = file.endsWith('graph-fields.doc.mjs')
        ? []
        : GRAPH_FIELDS;
      const topKeys = `Exclude<Keys<(${root})>, ${[...documented, ...allowedMissing].map(n => `'${n}'`).join(' | ') || 'never'}>`;
      line(
        `type Undocumented = Expect<Same<${topKeys}, never>>;`,
        `${root} has fields the self-doc does not list`,
      );
      const source = lines.join('\n') + '\nexport {};\n';
      const {diagnostics, program} = check(source);
      const problems = diagnostics.map(d => {
        const {line: at} = ts.getLineAndCharacterOfPosition(
          d.file,
          d.start ?? 0,
        );
        const what =
          meaning.get(at) ??
          ts.flattenDiagnosticMessageText(d.messageText, ' ');
        if (what.endsWith('does not list')) {
          const checker = program.getTypeChecker();
          const alias = program
            .getSourceFile(VIRTUAL)
            .statements.find(
              s =>
                ts.isTypeAliasDeclaration(s) && s.name.text === 'Undocumented',
            );
          const missing = checker.typeToString(
            checker.getTypeAtLocation(
              alias.type.typeArguments[0].typeArguments[0],
            ),
          );
          return `${what}: ${missing}`;
        }
        return what;
      });
      expect(problems, `${file}`).toEqual([]);
    },
    60_000,
  );
});
