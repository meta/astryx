// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {
  AuthoredDocEntry,
  AuthoredDocKindOf,
  NamespaceDoc,
  ProviderId,
} from '@astryxdesign/cli/authoring';

export const docs = {
  type: 'namespace',
  name: 'integrations',
  title: 'Author integrations',
  summary: 'Publish reusable Astryx packages.',
  placement: {parent: 'namespace:cli', slot: 'guides', order: 10},
  slots: {
    reference: {
      title: 'Reference',
      accepts: {kinds: ['command', 'function', 'schema', 'enum']},
    },
  },
  blocks: [
    {
      type: 'workflow',
      steps: [{title: 'Validate', references: ['command:doctor']}],
    },
    {type: 'reference', target: 'schema:integration'},
  ],
} satisfies NamespaceDoc;

export type Provider = ProviderId;
export type Entry = AuthoredDocEntry;

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Assert<Value extends true> = Value;

export type NamespaceKindContract = Assert<
  Equal<AuthoredDocKindOf<NamespaceDoc>, 'namespace'>
>;
export type NamespaceEntryKindContract = Assert<
  Equal<AuthoredDocEntry<NamespaceDoc>['kind'], 'namespace'>
>;

declare const namespaceEntry: AuthoredDocEntry<NamespaceDoc>;
// @ts-expect-error Compiler entries expose immutable authored snapshots.
namespaceEntry.authored.title = 'Changed';
