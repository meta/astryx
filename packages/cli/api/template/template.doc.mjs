// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `template()` / `astryx template`. Colocated with the API
 * function it documents; the shape source of truth stays in `template.type.mjs`.
 * @position packages/cli/api/template — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'template',
  namespace: 'cli/api',
  displayName: 'template()',
  summary: 'List, inspect, or scaffold page and block templates.',
  description:
    'One entry point for the template family: with no name it lists the discovered ' +
    "templates; with a name it returns that template's source, a layout skeleton, or " +
    'scaffolds it into the project. A configured integration may replace a Core ' +
    'template id for unqualified discovery and lookup; package selection still ' +
    'addresses the Core original. Other duplicate ids remain ambiguous and can be ' +
    'narrowed by type and/or package. The cdn option writes the annotated ' +
    'no-build-step CDN starter page, which ships as an asset rather than as ' +
    'a discovered template.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'template(name?: string, options?: TemplateOptions): Promise<TemplateListResponse | TemplateShowResponse | TemplateSkeletonResponse | TemplateCopyResponse | TemplateCdnResponse>',
  keywords: [
    'template',
    'scaffold',
    'page',
    'block',
    'skeleton',
    'starter',
    'cdn',
    'esm',
    'importmap',
    'no-build',
  ],
  params: [
    {
      name: 'name',
      type: 'string',
      description:
        'Template id to resolve. Omit to list every discovered template.',
    },
    {
      name: 'options.list',
      type: 'boolean',
      description:
        'List templates instead of scaffolding; refused with ERR_INVALID_ARGUMENT when a name or path is also given.',
      default: 'false',
    },
    {
      name: 'options.skeleton',
      type: 'boolean',
      description:
        'Return a compact layout skeleton (structural tags with spatial annotations) instead of the full source.',
      default: 'false',
    },
    {
      name: 'options.cdn',
      type: 'boolean | string',
      description:
        'Write the annotated no-build-step CDN starter page instead of resolving a template. Answers before discovery, so no name is involved; pass a string to use it as the destination path.',
      default: 'false',
    },
    {
      name: 'options.show',
      type: 'boolean',
      description:
        'Return the template source. This is the default for a named lookup with no target path.',
      default: 'false',
    },
    {
      name: 'options.type',
      type: "'page' | 'block'",
      description:
        'Filter list views, or narrow an ambiguous name, to a single template kind.',
    },
    {
      name: 'options.package',
      type: 'string',
      description:
        'Narrow lookups to templates from a specific owning package. Without it, a valid integration replacement is selected for the Core id; use @astryxdesign/core to select the original.',
    },
    {
      name: 'options.targetPath',
      type: 'string',
      description:
        'Destination (relative to cwd) to scaffold the template into. Its presence switches a named lookup into a copy. ' +
        "A path that ends in .tsx, .ts, .jsx, .js, .mjs, .cjs, .css, .scss, .json, .md or .html is the file to write; any other path is a directory, which receives page.tsx for a page template or the block's own file name for a block.",
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description: 'Overwrite an existing target file instead of erroring.',
      default: 'false',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'Directory to discover templates and resolve the target path from.',
      default: 'process.cwd()',
    },
  ],
  returns: [
    {
      type: 'template.list',
      description:
        'The effective templates (page + block); a valid integration replacement takes the place of its Core target and carries `replaces`. Pass `package` to list one package, including replaced Core originals.',
    },
    {
      type: 'template.show',
      description:
        "The resolved template's source, exactly as a copy writes it, plus its description, kind, the component names it composes, and `demoMediaReplaced` — how many Astryx demo media references (images, posters, videos) in the source were replaced with placeholders for you to swap for your own media, and `demoContentReplaced` — how many Astryx docs-only demo content elements were replaced with a `<Text>` placeholder for your own content.",
    },
    {
      type: 'template.skeleton',
      description:
        "A layout skeleton (structural tags with spatial annotations) plus the template's description and the components it composes.",
    },
    {
      type: 'template.copy',
      description:
        'A receipt after scaffolding the template into the project: the template id, output directory, written file name, file count, `demoMediaReplaced` — how many Astryx demo media references were replaced with placeholders, `demoContentReplaced` — how many Astryx docs-only demo content elements were replaced with a `<Text>` placeholder, `notes` — setup notes naming what the template needs that the project lacks (missing packages, missing StyleX compiler; empty when satisfied), `missingPackages` — external package names the template imports that are not in the project, and `installCommand` — a ready-to-run install command with the detected package manager and workspace version ranges (null when nothing is missing, or when several lockfiles leave the package manager undetermined; `missingPackages` still names the packages).',
    },
    {
      type: 'template.cdn',
      description:
        'A write receipt for the CDN starter page: the path (relative to cwd), the Astryx version every CDN URL was pinned to, whether it was written, and the reason it was not. `exists` when a file was already there, which is a success.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: '--cdn is combined with <name>, --list, --skeleton, --type, or --package; --list is combined with <name>, <path>, --skeleton, or --overwrite; --skeleton is combined with <path> or --overwrite; or options.list is set with a type outside page or block, or with a package that provides no templates (a valid filter that matches nothing returns an empty list instead)',
    },
    {
      code: 'ERR_UNKNOWN_TEMPLATE',
      when: 'the named template does not exist, or options.skeleton is set without a name',
    },
    {
      code: 'ERR_AMBIGUOUS_TEMPLATE',
      when: 'the name matches more than one template across kinds/packages; narrow it with type and/or package',
    },
    {
      code: 'ERR_NO_SOURCE',
      when: 'the resolved template has no source file on disk',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'the copy target path is absolute or escapes the project root',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'the copy target already exists and overwrite is not set',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'the copy target could not be written (no permission, read-only mount, full disk); nothing is written',
    },
  ],
  examples: [
    {label: 'List templates', code: 'const {data} = await template();'},
    {
      label: 'List exact Core ids',
      code: "await template(undefined, {list: true, package: '@astryxdesign/core'});",
    },
    {label: 'Show source', code: "await template('dashboard');"},
    {
      label: 'Select a replaced Core original',
      code: "await template('shell-side-nav', {package: '@astryxdesign/core'});",
    },
    {
      label: 'Layout skeleton',
      code: "await template('dashboard', {skeleton: true});",
    },
    {
      label: 'Scaffold into the project',
      code: "await template('dashboard', {targetPath: './app/page.tsx'});",
    },
    {
      label: 'CDN starter page',
      code: 'await template(undefined, {cdn: true});',
    },
  ],
  command: 'template',
  related: ['component', 'search', 'discover', 'init'],
};
