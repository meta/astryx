// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationAddTheme',
  namespace: 'cli/api',
  displayName: 'integrationAddTheme()',
  summary: 'Add a source theme to an integration package.',
  description:
    'Creates an integration manifest when the package has none, writes a minimal named-export defineTheme source file plus its strongly typed same-stem ThemeDoc, declares the optional themes root on first use, and includes the manifest and root in package.json files when the package already uses an allowlist. Every path is confined to the package and existing theme directories are never overwritten.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationAddTheme(name: string, options?: IntegrationAddThemeOptions): Promise<IntegrationAddResponse>',
  keywords: ['integration', 'add', 'theme', 'author', 'source', 'scaffold'],
  params: [
    {
      name: 'name',
      type: 'string',
      description: 'Lowercase kebab-case theme name and directory slug.',
      required: true,
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Directory inside the integration package.',
    },
    {
      name: 'options.dryRun',
      type: 'boolean',
      description:
        'Validate and return the same receipt without writing; data.written is false and data.dryRun is true.',
      default: 'false',
    },
    {
      name: 'options.from',
      type: 'string',
      description:
        'Slug of an existing theme to fork as the starting point. The new theme copies the base and has no link back, and package.json `dependencies` gains the npm packages the copied files import (other than Core and React).',
    },
  ],
  returns: [
    {
      type: 'integration.add',
      description:
        'A typed receipt naming the contribution kind and name, root path and whether it was declared, manifest path, every affected project-relative path, whether writes occurred, and whether this was a dry run.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the theme name is not lowercase kebab-case',
    },
    {
      code: 'ERR_FILE_NOT_FOUND',
      when: 'no package.json exists',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'the theme slug directory already exists',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'a declared themes root escapes the package',
    },
    {
      code: 'ERR_INTEGRATION_ROOT_CONFLICT',
      when: 'the manifest root changed to another path while the command was writing',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'the package, integration manifest, or theme descriptor is invalid',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'a staged write fails and prior writes are rolled back',
    },
  ],
  examples: [
    {
      label: 'Add a theme',
      code: "await integrationAddTheme('ocean');",
    },
    {
      label: 'Fork an existing theme',
      code: "await integrationAddTheme('ocean', {from: 'neutral'});",
    },
    {
      label: 'Preview writes',
      code: "await integrationAddTheme('ocean', {dryRun: true});",
    },
  ],
  command: 'integration add theme',
  related: ['themeList', 'themeAdd', 'validateIntegration'],
};
