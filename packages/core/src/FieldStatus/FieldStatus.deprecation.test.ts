// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FieldStatus.deprecation.test.ts
 * @input The TypeScript language service and FieldStatus.tsx
 * @output Verifies an editor marks a direct `variant="tooltip"` deprecated,
 *   and leaves the supported variants and Field-family placements unmarked
 * @position Static deprecation evidence for `component:FieldStatus` FR7
 *   (`spec:AST-017` FR29a: the warning lives in the declarations)
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '../..');
const FIXTURE = path.join(__dirname, '__deprecation_fixture__.tsx');

const SOURCE = `
import {FieldStatus} from './FieldStatus';
import type {FieldStatusVariant} from './FieldStatus';
import {TextInput} from '../TextInput/TextInput';

declare const someVariant: FieldStatusVariant;

export const direct = <FieldStatus type="error" message="m" variant="tooltip" />;
export const attached = <FieldStatus type="error" message="m" variant="attached" />;
export const detached = <FieldStatus type="error" message="m" variant="detached" />;
export const typed = <FieldStatus type="error" message="m" variant={someVariant} />;
export const field = (
  <TextInput label="Name" value="" onChange={() => {}} status={{type: 'error', message: 'm'}} statusVariant="tooltip" />
);
`;

function deprecatedLines(): number[] {
  const configPath = path.join(CORE_ROOT, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    CORE_ROOT,
    undefined,
    configPath,
  );
  const files = new Map([[FIXTURE, SOURCE]]);
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [FIXTURE],
    getScriptVersion: () => '1',
    getScriptSnapshot: name => {
      const text = files.get(name) ?? ts.sys.readFile(name);
      return text == null ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => CORE_ROOT,
    getCompilationSettings: () => ({...parsed.options, noEmit: true}),
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    fileExists: name => files.has(name) || ts.sys.fileExists(name),
    readFile: name => files.get(name) ?? ts.sys.readFile(name),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host);
  const errors = service.getSemanticDiagnostics(FIXTURE);
  expect(
    errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
  ).toEqual([]);
  const source = service.getProgram()!.getSourceFile(FIXTURE)!;
  return service
    .getSuggestionDiagnostics(FIXTURE)
    .filter(d => d.reportsDeprecated)
    .map(d => source.getLineAndCharacterOfPosition(d.start ?? 0).line);
}

function lineOf(name: string): number {
  return SOURCE.split('\n').findIndex(line => line.includes(`const ${name} =`));
}

describe('FieldStatus tooltip deprecation (component:FieldStatus FR7)', () => {
  it('marks a direct variant="tooltip" deprecated and nothing else', () => {
    const lines = deprecatedLines();
    expect(lines).toEqual([lineOf('direct')]);
  }, 120_000);
});
