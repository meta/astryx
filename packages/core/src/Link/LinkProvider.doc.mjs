// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'LinkProvider',
  displayName: 'Link Provider',
  group: 'Utilities',
  category: 'Utility',
  isHiddenFromOverview: true,
  keywords: ['link', 'provider', 'router', 'nextjs', 'client-side-routing'],
  usage: {
    description: 'Wraps your app to replace the default <a> tag with a framework-specific link component (e.g. Next.js Link) for client-side routing across all Astryx components.',
  },
  props: [
    {name: 'component', type: 'LinkComponentType', required: true, description: 'Link component to use for all link elements in the subtree (e.g. Next.js Link). It receives accepted `href` and `to` values under the shared navigation rule described on the Link `href` prop. Supported structured destinations, including their `protocol`, are checked without changing object identity. If either supplied destination is rejected, Astryx renders inert content without invoking this component; it does not pass undefined or fall back to the other destination.'},
    {name: 'children', type: 'ReactNode', required: true, description: 'The subtree. Astryx links in it that render through `useLinkComponent`, such as Link and Button with `href`, use `component`, unless a link sets its own `as` or a nearer LinkProvider sets another component. A disabled Link does not use it.'},
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'Wraps app to replace default <a> tag w/ framework-specific link component (e.g. Next.js Link) for client-side routing across all Astryx components.',
  usage: {
    description: 'Wraps app to replace default <a> tag w/ framework-specific link component (e.g. Next.js Link) for client-side routing across all Astryx components.',
  },
  propDescriptions: {
    component: 'link component for all link elements in subtree (e.g. Next.js Link). Accepted href/to follow the Link href rule; structured fields including protocol are checked, preserving identity. Either rejected => inert content, no router invocation or fallback.',
    children: 'Subtree; links rendered through useLinkComponent (Link, Button w/ href) use component unless they set `as` or a nearer provider applies; a disabled Link does not.',
  },
};
