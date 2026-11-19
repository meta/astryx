// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contract/rules.ts
 * @input A component contract
 * @output Naming and portability issues under AST-082 FR4 and FR8
 * @position Run by the generator before it writes any binding; an error stops
 *   generation
 */

import {NATIVE_PLATFORMS} from '../platforms.js';
import {
  KOTLIN_KEYWORDS,
  RECLAIMED,
  SWIFT_KEYWORDS,
  TOOLKIT_NAMES,
} from './names.js';
import type {ComponentContract, PropMap, PropType} from './types.js';

export interface ContractIssue {
  readonly level: 'error' | 'warning';
  readonly rule:
    | 'core-is-portable'
    | 'name-keyword'
    | 'name-toolkit'
    | 'platform-shadows-core'
    | 'same-name-different-meaning'
    | 'unknown-type';
  readonly message: string;
}

/**
 * Why a core prop name is not allowed, or null when it is. A toolkit name is
 * allowed when the component declares it has the same meaning there.
 */
export function coreNameProblem(
  name: string,
  sameMeaning = false,
): string | null {
  if (SWIFT_KEYWORDS.has(name)) {
    return `"${name}" is a Swift keyword`;
  }
  if (KOTLIN_KEYWORDS.has(name)) {
    return `"${name}" is a Kotlin keyword`;
  }
  if (RECLAIMED.has(name) || sameMeaning) {
    return null;
  }
  for (const [toolkit, names] of Object.entries(TOOLKIT_NAMES)) {
    if (names.has(name)) {
      return `"${name}" already means something else in ${toolkit}`;
    }
  }
  return null;
}

function namedTypesIn(type: PropType, into: Set<string>): Set<string> {
  if (type.kind === 'named') {
    into.add(type.name);
  } else if (type.kind === 'array') {
    namedTypesIn(type.of, into);
  } else if (type.kind === 'fn') {
    type.args.forEach(arg => namedTypesIn(arg, into));
  } else if (type.kind === 'record') {
    Object.values(type.fields).forEach(field => namedTypesIn(field.type, into));
  }
  return into;
}

export function checkContract(contract: ComponentContract): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const add = (
    level: ContractIssue['level'],
    rule: ContractIssue['rule'],
    message: string,
  ) => issues.push({level, rule, message: `${contract.name}: ${message}`});

  const referenced = new Set<string>();
  const collect = (props: PropMap) =>
    Object.values(props).forEach(spec => namedTypesIn(spec.type, referenced));

  const sameMeaning = new Set(contract.sameMeaning ?? []);
  for (const name of Object.keys(contract.core)) {
    const problem = coreNameProblem(name, sameMeaning.has(name));
    if (problem) {
      add(
        'error',
        SWIFT_KEYWORDS.has(name) || KOTLIN_KEYWORDS.has(name)
          ? 'name-keyword'
          : 'name-toolkit',
        `core prop ${problem}`,
      );
    }
  }
  collect(contract.core);

  const seen = new Map<string, {platform: string; type: string}>();
  for (const platform of NATIVE_PLATFORMS) {
    const props = contract.platforms[platform] ?? {};
    collect(props);
    for (const [name, spec] of Object.entries(props)) {
      if (name in contract.core) {
        add(
          'error',
          'platform-shadows-core',
          `${platform} prop "${name}" reuses a core prop name`,
        );
      }
      if (SWIFT_KEYWORDS.has(name) || KOTLIN_KEYWORDS.has(name)) {
        add(
          'error',
          'name-keyword',
          `${platform} prop "${name}" is a Swift or Kotlin keyword`,
        );
      }
      const type = JSON.stringify(spec.type);
      const earlier = seen.get(name);
      if (earlier && earlier.type !== type) {
        add(
          'warning',
          'same-name-different-meaning',
          `"${name}" has different values on ${earlier.platform} and ${platform}; ` +
            'allowed in platform-scoped types, never in a merged type',
        );
      }
      if (!earlier) {
        seen.set(name, {platform, type});
      }
    }
  }

  Object.values(contract.types).forEach(collect);
  for (const name of referenced) {
    if (!(name in contract.types)) {
      add('error', 'unknown-type', `type "${name}" has no definition`);
    }
  }
  return issues;
}
