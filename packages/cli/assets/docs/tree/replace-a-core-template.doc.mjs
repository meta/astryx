// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/document-the-template/replace-a-core-template`:
 * deliberately replace one Core template through template metadata.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'replace-a-core-template',
  placement: {
    parent: 'namespace:document-the-template',
    slot: 'guides',
    order: 40,
  },
  title: 'Replace a Core template',
  category: 'guide',
  description:
    'Use a template replacement only when an integration intentionally changes the default source returned for one Core template id.',
  sections: [
    {
      id: 'replace-only-on-purpose',
      title: 'Replace only on purpose',
      content: [
        {
          type: 'prose',
          text: 'Use with care: replace a Core template only when every app using this integration should receive your source for an existing Core id by default. An alternative, a product-specific variation, or a different kind of template gets its own id instead ({@link generic:start-a-template}).',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Sharing a Core id without `replaces` does not replace Core. It makes the bare id ambiguous, so `{@command template <id>}` fails until the app adds `--package`, and `doctor integration templates` reports an accidental collision.',
            'A replacement can keep the Core id or use its own. `replaces` is what makes it the default.',
          ],
        },
      ],
    },
    {
      id: 'declare-the-replacement',
      title: 'Declare the replacement',
      content: [
        {
          type: 'prose',
          text: 'Find the exact Core id and kind first.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx --json template --list --package @astryxdesign/core',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'templates/acme-app-shell.doc.mjs',
          code: `/** @type {import('@astryxdesign/cli/authoring').IntegrationTemplateDoc} */
export default {
  type: 'page',
  name: 'acme-app-shell',
  displayName: 'Acme App Shell',
  description:
    'An Acme application shell with product navigation, account controls, and a responsive content region.',
  replaces: 'shell-side-nav',
  isReady: true,
  category: 'Shell - Left Sidebar',
};`,
        },
        {
          type: 'prose',
          text: 'Every field is in {@link schema:template-doc}.',
        },
        {
          type: 'prose',
          text: 'Declare `replaces` on the template doc, never in `astryx.integration.mjs`.',
        },
      ],
    },
    {
      id: 'require-a-compatible-cli',
      title: 'Require a compatible CLI',
      content: [
        {
          type: 'prose',
          text: 'Declare the CLI floor that `integration verify` names as an optional peer ({@link generic:versioning}).',
        },
        {
          type: 'code',
          lang: 'json',
          label: 'package.json',
          code: `{
  "peerDependencies": {
    "@astryxdesign/cli": ">=0.6.4"
  },
  "peerDependenciesMeta": {
    "@astryxdesign/cli": {
      "optional": true
    }
  }
}`,
        },
        {
          type: 'prose',
          text: '`integration verify` reports `replaces_needs_cli` when that peer is missing or too old. Without it, published 0.6.3 and earlier drop that template and hide your doc topics.',
        },
      ],
    },
    {
      id: 'what-apps-receive',
      title: 'What apps receive',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: `# Receives the active replacement
{@command template shell-side-nav src/app}

# Receives the original Core template
{@command template shell-side-nav --package @astryxdesign/core src/app}`,
        },
        {
          type: 'prose',
          text: 'When several integrations replace the same Core template, one wins:',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'An integration explicitly listed in `astryx.config.mjs` wins over one that is only installed and picked automatically.',
            'When several explicitly configured integrations replace the same target, the one listed later wins and Astryx reports the ambiguity.',
            "When no integration is configured explicitly, the package listed later in the app's package.json dependencies wins. Configure the intended integration explicitly instead of relying on that order.",
          ],
        },
      ],
    },
    {
      id: 'check-the-replacement',
      title: 'Check the replacement',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration templates}',
        },
        {
          type: 'table',
          headers: ['Issue', 'Meaning'],
          rows: [
            [
              '`missing_template_replacement_target`',
              '`replaces` does not name a Core template id.',
            ],
            [
              '`invalid_template_replacement`',
              'The replacement is unusable or its page/block kind differs from Core.',
            ],
            [
              '`ambiguous_template_replacement`',
              'One package declares two replacements for a target, or several active packages contend for it.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Replacement resolution is safe by default. A missing source, invalid doc, missing target, wrong kind, or conflicting declaration never hands the Core id to a questionable replacement: Astryx reports the issue and keeps the Core template. Fix every issue before publishing.',
        },
      ],
    },
  ],
};
