// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contract/index.ts
 * @input Core component documentation, supplied by the caller
 * @output Contracts for every native component, checked, plus the generators
 * @position Build-time entry (`@astryxdesign/native/contract`). Reads core
 *   documentation as data; nothing here runs in an app
 */

import {NATIVE_COMPONENTS} from '../components/index.js';
import {fromComponentDoc, type ComponentDocLike} from './fromComponentDoc.js';
import {checkContract, type ContractIssue} from './rules.js';
import type {ComponentContract} from './types.js';

export {fromComponentDoc} from './fromComponentDoc.js';
export type {
  ComponentDocLike,
  NativeAdditions,
  SlotKind,
} from './fromComponentDoc.js';
export {generateSwift} from './generateSwift.js';
export {generateTypeScript} from './generateTypeScript.js';
export {parseDocType} from './parseDocType.js';
export {checkContract, coreNameProblem} from './rules.js';
export type {ContractIssue} from './rules.js';
export type * from './types.js';

/**
 * Loads one core documentation file: a component name for
 * `<Name>/<Name>.doc.mjs`, or a path such as `Text/Heading` relative to core's
 * `src` without `.doc.mjs`.
 */
export type ComponentDocLoader = (file: string) => Promise<ComponentDocLike>;

export interface BuiltContracts {
  readonly contracts: readonly ComponentContract[];
  readonly warnings: readonly ContractIssue[];
}

/** Builds and checks every native component contract; throws on any error. */
export async function buildContracts(
  loadDoc: ComponentDocLoader,
): Promise<BuiltContracts> {
  const contracts: ComponentContract[] = [];
  const warnings: ContractIssue[] = [];
  const errors: ContractIssue[] = [];
  for (const additions of NATIVE_COMPONENTS) {
    const doc = await loadDoc(additions.doc?.file ?? additions.name);
    const contract = fromComponentDoc(doc, additions);
    for (const issue of checkContract(contract)) {
      (issue.level === 'error' ? errors : warnings).push(issue);
    }
    contracts.push(contract);
  }
  if (errors.length > 0) {
    throw new Error(
      `Native contracts are invalid:\n${errors.map(e => `  ${e.message}`).join('\n')}`,
    );
  }
  return {contracts, warnings};
}
