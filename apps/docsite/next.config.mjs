// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Configure the docsite's routes, response headers, and theme resolution.
 * @input Next.js build configuration, the early playground cookie guard, and
 *   staged preview-only static exports.
 * @output Docsite routes plus Storybook and Sandbox at /storybook/ and /sandbox/.
 *   Client main-app chunks start with the preview's cookie compatibility guard.
 * @position Next.js configuration for the existing Vercel docsite deployment.
 */

import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';

const playgroundCookieCompatibility = readFileSync(
  resolve(
    import.meta.dirname,
    'src/app/playground/preview/cookieCompatibility.js',
  ),
  'utf8',
);

// Slugs that are not pages of their own (generate-data.mjs): a guide under a
// docs-tree namespace opens at its section on the namespace's full page, and
// a flat topic merged into another page opens there.
const docRedirectsPath = resolve(
  import.meta.dirname,
  'src/generated/docRedirects.json',
);
const docRedirects = existsSync(docRedirectsPath)
  ? JSON.parse(readFileSync(docRedirectsPath, 'utf8'))
  : {};

const stagesStaticApps =
  process.env.VERCEL_ENV === 'preview' ||
  process.env.VERCEL_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  // The search API (app/api/search) runs `astryx search` itself. The CLI stays
  // an external module (see webpack below), so its code and dependencies are
  // traced as installed; these are the files it reads from disk at run time:
  // its docs and templates, and each documented package's docs and sources.
  outputFileTracingIncludes: {
    '/api/search': [
      './astryx.config.mjs',
      '../../packages/cli/package.json',
      '../../packages/cli/{api,assets,authoring,clients,foundation,host}/**/*',
      '../../packages/core/package.json',
      '../../packages/core/src/**/*',
      // Integrations resolve through the site's node_modules, so they are
      // traced at that path.
      './node_modules/@astryxdesign/{lab,charts,richtext,vega}/{package.json,astryx.integration.mjs}',
      './node_modules/@astryxdesign/{lab,charts,richtext,vega}/{src,blocks,docs,dist}/**/*',
    ],
  },
  // Packages the CLI imports for other commands but a search never loads
  // (bundlers, compilers, browsers, test runners), and built output it never
  // reads. Leaving them out keeps the search function small; the parity test
  // and a traced-files-only build hold it to `astryx search`.
  outputFileTracingExcludes: {
    '/api/search': [
      '../../node_modules/.pnpm/{esbuild,@esbuild+*,typescript,playwright,playwright-core,vite,rolldown,@rolldown+*,flow-parser,esprima,tsx,vitest,@vitest+*,chai,@testing-library+*}@*/**',
      '../../packages/*/dist/**',
      './src/**',
    ],
  },
  // Sandbox exports trailing-slash directories; Next's automatic slash
  // redirect runs before rewrites. Vercel deployments preserve those URLs;
  // local builds keep the docsite's existing canonical redirects.
  skipTrailingSlashRedirect: stagesStaticApps,
  // A dynamic route segment can't carry a static extension, so the public
  // plaintext URL /blog/<slug>.txt is served by the /blog/txt/[slug] handler.
  // Static files (including Storybook's iframe and Sandbox's JS/CSS, embeds
  // and template assets) take precedence over afterFiles rewrites. A missing
  // Sandbox path maps only to its own absent index.html, never to the root.
  async rewrites() {
    return {
      afterFiles: [
        {source: '/blog/:slug.txt', destination: '/blog/txt/:slug'},
        {source: '/storybook', destination: '/storybook/index.html'},
        ...(stagesStaticApps
          ? [
              {source: '/sandbox', destination: '/sandbox/index.html'},
              {
                source: '/sandbox/:path+',
                destination: '/sandbox/:path+/index.html',
              },
            ]
          : []),
      ],
    };
  },
  // Slugs that are not pages of their own redirect to where their text is
  // shown (docRedirects, from generate-data.mjs): each guide of a docs-tree
  // namespace to its section on the namespace's page, including the CLI's
  // integration guides on the CLI Integrations and Writing docs pages.
  async redirects() {
    return [
      // Temporary: a later site version may give these guides pages again.
      ...Object.entries(docRedirects).map(([slug, destination]) => ({
        source: `/docs/${slug}`,
        destination,
        permanent: false,
      })),
    ];
  },
  // The playground preview evaluates user-authored code, so it is the one
  // route that must never be embeddable by another site and never a loader of
  // third-party script. The nonce-attested port handshake on its message
  // channel is the actual guard (playground/previewChannel.ts); these headers
  // are the layer underneath it. 'unsafe-eval' is inherent — the route's whole
  // job is compiling and running TSX in the browser. img/connect stay open so
  // demo code can still fetch and show remote data; the allowed hosts are the
  // ones the site itself loads (Google Fonts, Vercel analytics).
  async headers() {
    return [
      {
        // The playground page itself also refuses embedding: today the
        // nested preview's own frame-ancestors already breaks any embedding
        // chain, but that protection shouldn't hinge on a child frame's
        // headers — the parent states it directly.
        source: '/playground',
        headers: [
          {key: 'X-Frame-Options', value: 'SAMEORIGIN'},
          {key: 'Content-Security-Policy', value: "frame-ancestors 'self'"},
        ],
      },
      {
        source: '/playground/preview',
        headers: [
          {key: 'X-Frame-Options', value: 'SAMEORIGIN'},
          {
            key: 'Content-Security-Policy',
            value: [
              "frame-ancestors 'self'",
              "base-uri 'none'",
              "object-src 'none'",
              "form-action 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
            ].join('; '),
          },
        ],
      },
    ];
  },
  webpack: (config, {isServer, webpack}) => {
    // The search API loads the CLI as installed, never bundled: the CLI reads
    // its docs, templates and the installed packages from disk.
    if (isServer) {
      config.externals = [
        ...[config.externals ?? []].flat(),
        {'@astryxdesign/cli/api': 'module @astryxdesign/cli/api'},
      ];
    }
    // Webpack's CSS @import resolver doesn't follow package.json "exports".
    // Map each theme's /theme.css subpath to the actual dist file.
    const themesDir = resolve(import.meta.dirname, '../../packages/themes');
    const themes = readdirSync(themesDir, {withFileTypes: true})
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const t of themes) {
      config.resolve.alias[`@astryxdesign/theme-${t}/theme.css`] = resolve(
        themesDir,
        t,
        'dist/theme.css',
      );
    }

    // Vercel can add Toolbar instrumentation to Next's shared main-app entry.
    // Its cookie probe throws before React starts in the playground's opaque
    // frame, so prepend our route-scoped guard to the final client asset. A
    // layout Script is too late: Next emits the async main-app tag first.
    if (!isServer) {
      config.plugins.push(
        new webpack.BannerPlugin({
          banner: playgroundCookieCompatibility,
          entryOnly: true,
          include: /main-app-/,
          raw: true,
        }),
      );
    }

    return config;
  },
};

export default nextConfig;
