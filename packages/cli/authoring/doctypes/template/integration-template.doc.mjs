// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the `IntegrationTemplateDoc` doc-type — the template
 * metadata an integration package ships: TemplateDoc, with the package's own
 * `category`. Colocated with the type it describes (`type.ts`).
 * @position packages/cli/authoring/doctypes/template — doc-type documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'integration-template-doc',
  displayName: 'IntegrationTemplateDoc',
  namespace: 'authoring',
  description:
    "The doc-type for an integration package's template metadata. It has every " +
    "TemplateDoc field and rule, except that `category` is the package's own " +
    'string instead of a TemplateCategory value.',
  appliesTo: '<Name>.doc.mjs',
  fields: [
    {
      name: 'category',
      type: 'string',
      description:
        "The package's own category. Bare `astryx template` groups the package's templates by it.",
    },
  ],
  examples: [
    {
      label: 'Block template in an integration package',
      code: `/** @type {import('@astryxdesign/cli/authoring').IntegrationTemplateDoc} */
export default {
  type: 'block',
  name: 'acme-pricing-table',
  displayName: 'Pricing Table',
  description: 'Plans side by side, with the chosen plan highlighted.',
  aspectRatio: 16 / 9,
  category: 'Acme - Commerce',
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: "Every other field, and the page and block variants, are TemplateDoc's. Core's own templates use TemplateDoc, whose `category` is a TemplateCategory value. `astryx doctor integration validate` checks an integration's template docs against IntegrationTemplateDoc.",
    },
  ],
};
