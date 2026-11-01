// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchTriggerTap.deprecated.test.ts
 * @input The TypeScript language service over Core's own tsconfig, and a
 *   fixture written against Tooltip, HoverCard, useTooltip and useHoverCard
 * @output Proof of DEP-0016's static metadata (`component:Tooltip` DEP-0016,
 *   `spec:AST-017` FR29a): a `touchTrigger="tap"` call resolves to a
 *   `@deprecated` signature, so editors mark it with its replacement, while
 *   `auto`, `none`, no value, and forwarded props do not
 * @position Type-level test beside the touch trigger
 */

import * as path from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const CORE = path.resolve(__dirname, '../../..');
const FIXTURE = path.join(CORE, 'src/Layer/__tests__/__deprecationFixture.tsx');

const SOURCE = `
import {Tooltip} from '../../Tooltip/Tooltip';
import {useTooltip} from '../../Tooltip/useTooltip';
import type {TooltipProps} from '../../Tooltip/Tooltip';
import {HoverCard} from '../../HoverCard/HoverCard';
import {useHoverCard} from '../../HoverCard/useHoverCard';

export const tapTip = <Tooltip content="x" touchTrigger="tap"><button type="button">?</button></Tooltip>;
export const autoTip = <Tooltip content="x" touchTrigger="auto"><button type="button">?</button></Tooltip>;
export const plainTip = <Tooltip content="x"><button type="button">?</button></Tooltip>;
export function Forwarded(props: TooltipProps) {
  return <Tooltip {...props} />;
}
export const tapCard = <HoverCard content="x" touchTrigger="tap"><button type="button">?</button></HoverCard>;
export const noneCard = <HoverCard content="x" touchTrigger="none"><button type="button">?</button></HoverCard>;
export function useTap() {
  return [useTooltip({touchTrigger: 'tap'}), useHoverCard({touchTrigger: 'tap'})];
}
export function useAuto() {
  return [useTooltip({touchTrigger: 'auto'}), useHoverCard({})];
}
`;

function deprecationsIn(source: string): string[] {
  const configPath = path.join(CORE, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, CORE);
  const files = new Map([[FIXTURE, source]]);
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => ({...parsed.options, noEmit: true}),
    getScriptFileNames: () => [FIXTURE],
    getScriptVersion: () => '1',
    getScriptSnapshot: fileName => {
      const text = files.get(fileName) ?? ts.sys.readFile(fileName);
      return text == null ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => CORE,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    fileExists: fileName => files.has(fileName) || ts.sys.fileExists(fileName),
    readFile: fileName => files.get(fileName) ?? ts.sys.readFile(fileName),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host);
  const errors = service
    .getSemanticDiagnostics(FIXTURE)
    .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  expect(errors).toEqual([]);
  return service
    .getSuggestionDiagnostics(FIXTURE)
    .filter(d => d.reportsDeprecated)
    .map(d => {
      // Named by the export the marked call sits in.
      const {line} = ts.getLineAndCharacterOfPosition(d.file, d.start ?? 0);
      const lines = d.file.text.split('\n');
      for (let at = line; at >= 0; at--) {
        const match = /^export (?:const|function) (\w+)/.exec(lines[at]);
        if (match != null) {
          return match[1];
        }
      }
      return `line ${line}`;
    });
}

describe('touchTrigger="tap" carries static @deprecated metadata (DEP-0016)', () => {
  it('marks every tap call, and nothing else', () => {
    const marked = deprecationsIn(SOURCE);
    expect(marked.sort()).toEqual(
      ['tapCard', 'tapTip', 'useTap', 'useTap'].sort(),
    );
  }, 60_000);
});
