// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every authored doc kind written as TypeScript with `satisfies`: no builder
 * call, only the published type. The JSDoc twins are the `*.doc.mjs` files
 * beside this one.
 */

import type {
  CommandDoc,
  ComponentDoc,
  EnumDoc,
  FunctionDoc,
  HookDoc,
  IconDefinitionDoc,
  ReferenceDoc,
  SchemaDoc,
  TemplateDoc,
  ThemeDoc,
} from '@astryxdesign/cli/authoring';
import type {BlockTemplateDoc, PageTemplateDoc} from '@astryxdesign/cli/doc';

export const component = {
  type: 'component',
  name: 'Badge',
  displayName: 'Badge',
  props: [{name: 'label', type: 'string', description: 'Text inside.'}],
  usage: {description: 'Show a short status.'},
} satisfies ComponentDoc;

export const componentGroup = {
  type: 'component',
  name: 'Tabs',
  displayName: 'Tabs',
  usage: {description: 'Switch between views.'},
  components: [{name: 'Tab'}],
} satisfies ComponentDoc;

export const hook = {
  type: 'function',
  name: 'useToast',
  displayName: 'useToast',
  params: [],
  returns: [{name: 'show', type: '() => void', description: 'Shows one.'}],
  usage: {description: 'Show a message that dismisses itself.'},
} satisfies HookDoc;

export const fn = {
  type: 'function',
  name: 'search',
  displayName: 'search()',
  kind: 'api',
  params: [{name: 'query', type: 'string', description: 'What to find.'}],
  returns: [{type: 'Promise<SearchResponse>', description: 'Matches.'}],
} satisfies FunctionDoc;

export const reference = {
  type: 'generic',
  name: 'deploying',
  title: 'Deploying',
  description: 'Ship an app that uses Astryx.',
  sections: [
    {title: 'Build', content: [{type: 'prose', text: 'Build the theme.'}]},
  ],
} satisfies ReferenceDoc;

export const page = {
  type: 'page',
  name: 'settings-page',
  displayName: 'Settings page',
} satisfies PageTemplateDoc satisfies TemplateDoc;

export const block = {
  type: 'block',
  name: 'badge-counts',
  displayName: 'Badge counts',
  aspectRatio: 1.5,
} satisfies BlockTemplateDoc satisfies TemplateDoc;

export const schema = {
  type: 'schema',
  name: 'widget-config',
  displayName: 'Widget config',
  description: 'Options a widget integration reads.',
  fields: [{name: 'size', type: "'sm' | 'md'", description: 'Widget size.'}],
} satisfies SchemaDoc;

export const command = {
  type: 'command',
  name: 'widget sync',
  displayName: 'astryx widget sync',
  summary: 'Copy widget assets into the app.',
} satisfies CommandDoc;

export const enumDoc = {
  type: 'enum',
  name: 'widget-status',
  displayName: 'Widget status',
  description: 'Every state a widget reports.',
  members: [{value: 'ready', description: 'Loaded and usable.'}],
} satisfies EnumDoc;

export const theme = {
  type: 'theme',
  name: 'ocean',
  displayName: 'Ocean',
  description: 'Blue and calm.',
  maintained: true,
} satisfies ThemeDoc;

export const iconDefinition = {
  type: 'icon-definition',
  name: 'delete',
  description: 'Delete something permanently.',
  words: ['trash', 'bin'],
} satisfies IconDefinitionDoc;

// A required field left out is a type error, not a runtime surprise.
export const missingUsage = {
  type: 'component',
  name: 'Badge',
  displayName: 'Badge',
  props: [],
  // @ts-expect-error usage is required on a component doc
} satisfies ComponentDoc;
