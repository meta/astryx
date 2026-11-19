// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/template-assets/template-images-media`:
 * keep template images and video working after the copy, or make them clear
 * placeholders.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'template-images-media',
  placement: {
    parent: 'namespace:template-assets',
    slot: 'guides',
    order: 50,
  },
  title: 'Images and media',
  category: 'guide',
  description:
    'Make sure every image and video still works after the copy, or becomes a clear placeholder the app replaces.',
  sections: [
    {
      id: 'do-not-copy-relative-media',
      title: 'Do not rely on sibling media',
      content: [
        {
          type: 'prose',
          text: 'A reference such as `./hero.png` or `../assets/demo.mp4` stays unchanged in the copied file and normally breaks.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Use a stable public URL when the integration owner will continue to host the media.',
            'Use an explicit app-owned placeholder when every app must supply product-specific media.',
            'Use a package-owned JS or CSS entrypoint only when every supported app toolchain can resolve and emit the underlying asset.',
            'Do not assume that a file inside `node_modules` is automatically served at a browser URL.',
          ],
        },
      ],
    },
    {
      id: 'understand-template-assets',
      title: 'Understand `/template-assets`',
      content: [
        {
          type: 'prose',
          text: '`/template-assets/<path>` is a preview-only fixture path. During copy, Astryx replaces a complete static image reference with an inline neutral SVG placeholder. It replaces a complete static video reference with an empty string because it cannot create a valid inline video.',
        },
        {
          type: 'table',
          headers: ['Source reference', 'Copied result'],
          rows: [
            ['`/template-assets/hero.png`', 'Inline SVG data URL placeholder'],
            ['`/template-assets/demo.mp4`', 'Empty string'],
            ['`./hero.png` or `/product/hero.png`', 'Unchanged'],
            ['`https://example.com/template-assets/hero.png`', 'Unchanged'],
          ],
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Supported preview image suffixes are SVG, PNG, JPG, JPEG, GIF, WebP, AVIF, and ICO.',
            'Supported preview video suffixes are MP4, WebM, MOV, OGV, and M4V.',
            'Keep the preview path as one complete static string. Concatenation, interpolation, method calls, module imports, and unknown file formats are rejected when Astryx cannot replace them safely.',
            'Use this path only when a placeholder is the intended copied result. It is not a way to ship required product media.',
            'Astryx serves `/template-assets` only in its own docs. A preview you host must serve that path itself.',
          ],
        },
      ],
    },
    {
      id: 'design-a-useful-placeholder',
      title: 'Design a useful placeholder',
      content: [
        {
          type: 'prose',
          text: 'When the app must provide the final asset, keep the replacement point obvious in the copied source. Preserve enough surrounding layout and example data that the template still teaches the pattern without pretending the final content is included.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `const HERO_IMAGE = '/acme-dashboard-hero.jpg';
// Replace HERO_IMAGE with an app-owned public URL before shipping the page.

<img
  src={HERO_IMAGE}
  alt="Account health trends for the current quarter"
  width={1200}
  height={675}
/>`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Use accurate alternative text for informative images and `alt=""` for decoration.',
            'Provide dimensions or an aspect-ratio container so loading does not shift the page.',
            'For video, provide controls, a useful poster, and captions when the content requires them.',
            'Do not leave an inaccessible, expiring, authenticated, or environment-specific URL in copied source.',
          ],
        },
      ],
    },
    {
      id: 'check-media-in-the-app',
      title: 'Check media in the app',
      content: [
        {
          type: 'prose',
          text: 'When you test the template in an app ({@link generic:test-template-in-app}), also confirm the following.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'The copied source shows the placeholder substitutions you expect.',
            'The network log has no missing, redirected, blocked, or unauthorized media requests.',
            'Each placeholder keeps the layout and says what the app must replace.',
          ],
        },
      ],
    },
  ],
};
