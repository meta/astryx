// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/components/replace-a-core-component`:
 * intentionally make an integration component the default for a Core identity.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'replace-a-core-component',
  placement: {parent: 'namespace:components', slot: 'guides', order: 50},
  title: 'Replace a Core component',
  category: 'guide',
  description:
    'Use a component replacement only when an integration must intentionally own a Core component identity.',
  sections: [
    {
      id: 'decide-whether-to-replace',
      title: 'Decide whether to replace',
      content: [
        {
          type: 'prose',
          text: 'Most components should not use `replaces`. Give a new component its own name and let apps choose it explicitly. Replace Core only when your component must become the default for one Core identity everywhere the integration is active.',
        },
        {type: 'heading', level: 3, text: 'Use it when'},
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Your component intentionally serves the same role as one specific Core component.',
            'Every app that loads the integration should get your component from unqualified component detail, `component --list`, search, `swizzle <Name>`, and issue routing.',
            'You have tested both the replacement and explicit access to the original Core component.',
          ],
        },
        {type: 'heading', level: 3, text: 'Do not use it when'},
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Your component is an alternative, variant, wrapper, or product-specific extension. Give it a unique name instead.',
            'You only need to resolve an accidental name collision.',
            'You want the replacement in only one screen or workflow. Replacement applies across the app wherever the integration is active.',
          ],
        },
      ],
    },
    {
      id: 'set-the-replacement',
      title: 'Set the replacement',
      content: [
        {
          type: 'code',
          lang: 'javascript',
          label: 'components/AcmeSideNav.doc.mjs',
          code: `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeSideNav',
  displayName: 'Acme Side Nav',
  replaces: 'SideNav',
  import: '@acme/astryx-widgets/components/AcmeSideNav',
  usage: {description: 'Product navigation for Acme apps.'},
  props: [],
};`,
        },
        {
          type: 'prose',
          text: 'Every field is in {@link schema:component-doc}.',
        },
        {
          type: 'prose',
          text: 'The replacement turns on only when your package declares the first CLI release that applies it. Add this to its `package.json`:',
        },
        {
          type: 'code',
          lang: 'json',
          label: 'package.json',
          code: `{
  "peerDependencies": {"@astryxdesign/cli": ">=0.6.7"},
  "peerDependenciesMeta": {"@astryxdesign/cli": {"optional": true}}
}`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Any `@astryxdesign/cli` range that starts at that release or later turns it on, including the `>=0.7.0` that `integration add doc --parent` wrote in published 0.6.4 and 0.6.5, and `integration add theme` in published 0.6.5.',
            'Without such a range, the component keeps its own name, the Core component stays selected (a component named like its target stays ambiguous by that bare name, as before), and `doctor integration components` warns with the range to add. Apps that load such a package see no change.',
            '`replaces` names the Core `ComponentDoc` identity, not its display label, import path, or a standalone hook.',
            'Your component may keep a distinct name or use the same name as the target. A distinct name remains directly addressable on older CLIs that ignore `replaces`.',
            '`--package @astryxdesign/core` always selects the original Core component, and `--package` with your package selects your component by either name.',
            'Replacing `SideNav` replaces only that name. `SideNavItem` and the other SideNav parts stay Core components; document any parts your package provides under their own names.',
            '`swizzle --list` lists Core components, including the one you replace. `swizzle SideNav` copies your component, and `swizzle SideNav --package @astryxdesign/core` copies the original.',
          ],
        },
      ],
    },
    {
      id: 'check-replacement-resolution',
      title: 'Check replacement resolution',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration components}\n{@command component SideNav}\n{@command component AcmeSideNav}\n{@command component SideNav --package @astryxdesign/core}',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Once the package declares the range, a missing target, invalid value, second replacement for one target in the same package, or a replacement named after a different Core component is an error. Without the range, `doctor integration components` reports each of these as a warning.',
            'When several integrations replace one target, explicit configuration beats the automatic pick. Among explicitly configured integrations, the later package wins and Doctor warns. Among autolinked integrations alone, the dependency listed later in `package.json` wins and Doctor warns.',
          ],
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: 'In global mode: a replacement from a package installed for the computer applies in folders outside any project; inside a project, only replacements from packages the project installs apply. See {@link namespace:global} and {@link generic:global-integrations}.',
        },
      ],
    },
  ],
};
