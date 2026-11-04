// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `swizzle()` / `astryx swizzle`. Colocated with the API
 * function it documents; the shape source of truth stays in `swizzle.type.mjs`.
 * @position packages/cli/api/swizzle — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'swizzle',
  namespace: 'cli/api',
  displayName: 'swizzle()',
  summary: "Eject a component's source into your project for customization.",
  description:
    "Ejects a component's source into the consumer project for deep customization. " +
    'It copies from the locally resolved @astryxdesign/core (or the owning integration) ' +
    'package source, rewriting imports that escape the component directory to the owner ' +
    "package's subpaths and flagging whether any copied file uses StyleX. With no name " +
    '(or list) it returns the swizzlable component names instead. An integration ' +
    'component that replaces a Core component is what that Core name copies; ' +
    "options.package '@astryxdesign/core' copies the original. The list names Core " +
    'components, including one an integration component replaces.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'swizzle(component?: string, options?: SwizzleOptions): Promise<SwizzleListResponse | SwizzleCopyResponse>',
  keywords: ['swizzle', 'eject', 'copy', 'customize', 'source', 'override'],
  params: [
    {
      name: 'component',
      type: 'string',
      description:
        "Component name to copy (e.g. 'Button'). Omit to list the swizzlable components.",
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Directory to resolve @astryxdesign/core from.',
      default: 'process.cwd()',
    },
    {
      name: 'options.output',
      type: 'string',
      description:
        'Output directory, relative to cwd. An absolute path, or one that resolves outside cwd, throws ERR_PATH_TRAVERSAL.',
      default: "'./components/astryx'",
    },
    {
      name: 'options.package',
      type: 'string',
      description:
        "Owning package to copy from when the name is provided by more than one. Use '@astryxdesign/core' to copy an original replaced by an integration component.",
    },
    {
      name: 'options.list',
      type: 'boolean',
      description:
        'Force the list response even when a component argument is given.',
      default: 'false',
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description: 'Overwrite existing files instead of erroring.',
      default: 'false',
    },
  ],
  returns: [
    {
      type: 'swizzle.list',
      description:
        "The names of swizzlable components discoverable from cwd's @astryxdesign/core.",
    },
    {
      type: 'swizzle.copy',
      description:
        'A receipt after copying the component into the project: the component name, owning package, output directory, files-copied count, the written file names, whether any file uses StyleX, and, when the owner has an issues URL, feedback ({issuesUrl, ghCommand?}): where to report the gap that led to swizzling.',
    },
  ],
  throws: [
    {
      code: 'ERR_CORE_NOT_FOUND',
      when: '@astryxdesign/core cannot be located from cwd',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'the component name contains a path separator or traversal, output is absolute or resolves outside cwd, or an existing output file or directory is a symlink that resolves outside cwd',
    },
    {
      code: 'ERR_UNKNOWN_COMPONENT',
      when: 'no package provides the component, or the named package does not provide it',
    },
    {
      code: 'ERR_AMBIGUOUS_COMPONENT',
      when: 'more than one package provides the component; choose one with package',
    },
    {
      code: 'ERR_NO_SOURCE',
      when: 'the owning package has no source directory for the component on disk',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'copying would overwrite existing files and overwrite is not set',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'the output directory or a copied file could not be written (no permission, read-only mount, full disk)',
    },
  ],
  examples: [
    {
      label: 'List swizzlable components',
      code: 'const {data} = await swizzle();',
    },
    {label: 'Eject a component', code: "await swizzle('Button');"},
    {
      label: 'Disambiguate by package',
      code: "await swizzle('Button', {package: '@astryxdesign/core', overwrite: true});",
    },
    {
      label: 'Custom output directory',
      code: "await swizzle('Card', {output: './src/ui', overwrite: true});",
    },
  ],
  command: 'swizzle',
  related: ['component', 'discover', 'upgrade'],
};
