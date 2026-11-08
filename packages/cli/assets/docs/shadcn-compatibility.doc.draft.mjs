// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'shadcn-compatibility',
  title: 'Use Astryx with shadcn',
  category: 'guide',
  description:
    'Install Astryx components, examples, blocks, and pages through the shadcn Registry workflow without replacing the Astryx package or CLI.',

  sections: [
    {
      title: 'Overview',
      content: [
        {
          type: 'prose',
          text: 'This guide is for existing shadcn users who want to add Astryx without replacing their current toolchain. Astryx supports the shadcn Registry as a compatibility and distribution protocol. The Astryx packages remain the implementation and the Astryx CLI remains the richer interface for discovery, composition, theming, validation, and upgrades.',
        },
        {
          type: 'prose',
          text: 'A shadcn registry is static JSON that tells the shadcn CLI which package dependencies to install, which application-level files to copy, and which CSS imports to add. Read the protocol documentation at https://ui.shadcn.com/docs/registry.',
        },
        {
          type: 'prose',
          text: 'The registry is published as-is for existing shadcn users. Issues are welcome in the Astryx repository, with no response-time promise.',
        },
      ],
    },
    {
      title: 'Naming and URL Stability',
      content: [
        {
          type: 'prose',
          text: 'Registry URLs are organized by item kind and derived from stable Astryx doc identity: component and hook `name`, block `name` plus `exampleFor`, and the existing page-template slug. `displayName` remains free to change without changing an install URL.',
        },
        {
          type: 'code',
          lang: 'text',
          label: 'Registry path families',
          code: `/shadcn/components/button.json
/shadcn/hooks/use-app-shell-mobile.json
/shadcn/showcases/button/variants.json
/shadcn/examples/button/icon.json
/shadcn/blocks/filter-toolbar.json
/shadcn/templates/dashboard.json`,
        },
        {
          type: 'prose',
          text: 'A doc may set `registry.slug` when the derived slug is not the intended public name. After publication, keep prior relative paths in `registry.aliases`. Generation compares every name and path with a reviewed route lock, so an accidental rename fails instead of silently breaking old commands.',
        },
      ],
    },
    {
      title: 'What Gets Installed',
      content: [
        {
          type: 'table',
          headers: ['Item', 'What the CLI adds', 'Who owns updates'],
          rows: [
            [
              'Component or hook',
              'The published Astryx package plus a local public re-export',
              'Astryx updates the implementation through the package',
            ],
            [
              'Showcase or example',
              'Editable application-level composition source that imports Astryx packages',
              'Your app owns its edits; the adjacent Astryx receipt enables safe upgrades',
            ],
            [
              'Block',
              'A larger editable composition plus its package dependencies',
              'Your app owns its edits; the adjacent Astryx receipt enables safe upgrades',
            ],
            [
              'Page',
              'A complete editable page plus its package dependencies',
              'Your app owns its edits; the adjacent Astryx receipt enables safe upgrades',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'A normal registry install never copies Astryx component implementation source. Deep source customization remains an explicit `astryx swizzle <Name>` action because copied implementation source leaves the package upgrade path.',
        },
      ],
    },
    {
      title: 'Install with shadcn',
      content: [
        {
          type: 'prose',
          text: 'Use the install command shown on a component, example, or template page. The shadcn CLI reads the item, installs the declared dependencies, writes the local composition or re-export, and adds the Astryx CSS imports to your configured stylesheet.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Install the Button package entry',
          code: 'npx shadcn@4.19.0 add <registry-origin>/components/button.json',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Install the editable Button showcase',
          code: 'npx shadcn@4.19.0 add <registry-origin>/showcases/button/variants.json',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Install the complete dashboard page',
          code: 'npx shadcn@4.19.0 add <registry-origin>/templates/dashboard.json',
        },
        {
          type: 'prose',
          text: 'Astryx pins the tested shadcn client in these commands. The JavaScript receipt base must match the exact transform that client writes; use the displayed version rather than replacing it with `latest`.',
        },
      ],
    },
    {
      title: 'What the Command Changes',
      content: [
        {
          type: 'prose',
          text: 'For a component entry, the command installs `@astryxdesign/core` and writes a small local file such as `src/components/astryx/Button.ts` that re-exports `@astryxdesign/core/Button`. Behavior, accessibility, styling, and fixes still come from the package.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Generated public re-export',
          code: "export * from '@astryxdesign/core/Button';",
        },
        {
          type: 'prose',
          text: 'For an example, block, or page, the command writes editable TSX in TypeScript projects or JS/JSX in JavaScript projects, plus a small adjacent `.astryx` receipt. A composition that required StyleX compilation stays honest precompiled JSX in both modes and installs a narrow declaration for strict TypeScript imports. The source imports public Astryx package paths. The receipt stores every distinct install base so a later upgrade can preserve your edits; it is not application code and should stay committed with the copied file.',
        },
      ],
    },
    {
      title: 'Use the Astryx CLI for the Richer Path',
      content: [
        {
          type: 'prose',
          text: 'Use shadcn when you already use its registry workflow and know the exact item you want. Use the Astryx CLI when you need to discover the right component, compose a page from a natural-language request, inspect complete guidance, build a theme, validate an installation, or apply an upgrade codemod.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Astryx discovery and maintenance',
          code: `astryx build "analytics dashboard with filters"
astryx component Button
astryx template dashboard
astryx doctor
astryx upgrade --registry
astryx upgrade --registry --apply`,
        },
      ],
    },
    {
      title: 'Upgrade Model and Limits',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Package upgrades update Astryx components, hooks, behavior, accessibility, and compiled styles.',
            'A normal `astryx upgrade` also checks copied-composition receipts. Use `astryx upgrade --registry` to preview only those files; add `--apply` to write safe updates.',
            'Registry source must match the installed Astryx release. The command refuses to copy source from a newer or older release.',
            'An unchanged copied file updates automatically. Non-overlapping edits are three-way merged against the installed base.',
            'JavaScript formatting or quote changes from a compatible shadcn printer are treated as unchanged only when the parsed syntax tree and attached comments still match.',
            'A conflicting edit leaves your file untouched and writes a separate `.astryx-conflict` file for review.',
            'A deleted or moved copied file is reported but never recreated or overwritten.',
            'The registry excludes unpublished packages because an external package manager cannot install them.',
            'Your project needs a valid components.json and path-alias configuration for the shadcn CLI to resolve target paths.',
            'The compatibility layer is additive. It does not require replacing existing shadcn components or migrating the whole application.',
          ],
        },
      ],
    },
  ],
};
