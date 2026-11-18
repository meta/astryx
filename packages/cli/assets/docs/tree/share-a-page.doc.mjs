// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/experimental/share-a-page`: write a page, render it
 * to one HTML file, share or upload that file, and turn it back into source
 * to change it.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'share-a-page',
  placement: {parent: 'namespace:experimental', slot: 'guides', order: 18},
  stability: 'experimental',
  title: 'Make a shareable page',
  category: 'guide',
  keywords: [
    'share',
    'shareable page',
    'one html file',
    'single file',
    'artifact',
    'upload',
    'report',
    'status page',
    'dashboard',
    'edit a shared page',
    'back to source',
    'render',
  ],
  description:
    'Experimental. Write a page with Astryx components, render it to one HTML file, share or upload that file, and turn it back into source to change it.',
  sections: [
    {
      id: 'overview',
      title: 'Four steps',
      content: [
        {
          type: 'prose',
          text: 'A shareable page is one HTML file. It opens in a browser, as an attachment, or in an artifact viewer that shows HTML in a sandboxed frame. It runs no script and loads nothing from the network. It also carries its own source, so anyone who has the file can turn it back into code, change it, and render it again. The render command is experimental: its options and its output can change in a patch release.',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Write the page: one `.tsx` file built from Astryx components.',
            'Render it to one HTML file.',
            'Share or upload that file.',
            'To change it, turn the file back into source, edit the source, and render again.',
          ],
        },
      ],
    },
    {
      id: 'write',
      title: '1. Write the page',
      content: [
        {
          type: 'prose',
          text: 'Make a folder and write one file, such as `page.tsx`. Its default export is a React component built from Astryx components. In a folder that is not an Astryx project, the CLI renders the page with its own Astryx, React and StyleX, so the folder needs no package.json and no install.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: "import {VStack} from '@astryxdesign/core/VStack';\nimport {HStack} from '@astryxdesign/core/HStack';\nimport {Card} from '@astryxdesign/core/Card';\nimport {Heading} from '@astryxdesign/core/Heading';\nimport {Text} from '@astryxdesign/core/Text';\nimport {Badge} from '@astryxdesign/core/Badge';\n\nexport default function Page() {\n  return (\n    <VStack gap={5} padding={6}>\n      <HStack gap={2} vAlign=\"center\">\n        <Heading level={1}>Project Atlas</Heading>\n        <Badge label=\"At risk\" variant=\"warning\" />\n      </HStack>\n      <Card padding={5}>\n        <Text type=\"body\">38% of traffic is on the new stack.</Text>\n      </Card>\n    </VStack>\n  );\n}",
        },
        {
          type: 'prose',
          text: 'Find a component with `{@command search "progress bar"}` and read its props with `{@command component ProgressBar}` before you use it. Use components and tokens, not colors or CSS of your own: the page then follows the reader\u2019s light or dark setting, and a viewer that sets Astryx theme variables gives it that viewer\u2019s theme.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Readers open the file on phones and on wide screens. Put cards in a row with `<Grid columns={{minWidth: 220, max: 3}}>`, which drops to fewer columns on a narrow screen, down to one. Do not pick a layout with script, such as useMediaQuery: the file runs no script, so every reader, on any screen, gets the one layout that the query\u2019s server answer (false) picks.',
            'Each Table column keeps its share of the width at every size, so the column with the smallest share sets the table\u2019s minimum width: a column with 1 of 11 shares and the default 120 px floor makes the table at least 1,320 px wide, and a narrower screen scrolls it sideways. Give small columns a small floor: `width: proportional(1, {minWidth: 80})`.',
            'Charts use recharts: install it in the page\u2019s folder first (`{@pm install recharts}`). Size a chart with `<ResponsiveContainer width="100%" aspect={2.5}>`, and color each series with a theme variable, such as `stroke="var(--color-data-categorical-blue)"`, so it follows the theme too.',
            'Leave out controls that need a browser. Buttons, filters, tabs and menus show in the file but do nothing.',
          ],
        },
      ],
    },
    {
      id: 'render',
      title: '2. Render it to one file',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx experimental render page.tsx --out page.html',
        },
        {
          type: 'prose',
          text: 'Read what the command prints. A warning names something that can look different from what you meant, such as a component that ignores its children or a remote image the viewer cannot load, and says what to change; fix it and render again. When the command says a package is not installed, install that package in the page\u2019s folder and render again. Then check the file: open it in a browser if you have one, or run the reverse command in step 4 to see that its source comes back.',
        },
      ],
    },
    {
      id: 'share',
      title: '3. Share or upload the file',
      content: [
        {
          type: 'prose',
          text: 'The file is the whole page: send it, put it on a web host, or upload it to an artifact viewer that accepts one HTML file. A viewer that shows HTML in a frame with no network and no script shows it as it is. Upload it with the host\u2019s own command, and keep the link or ID it gives back: you update that same artifact later, so readers keep the same link.',
        },
        {
          type: 'prose',
          text: 'The file carries the page\u2019s source and every local file the page imports. Whoever has the file can read them, so keep secrets out of the page and its imports.',
        },
      ],
    },
    {
      id: 'change',
      title: '4. Change it later',
      content: [
        {
          type: 'prose',
          text: 'Change the page through its source, never by editing the HTML: the source inside the file does not change with the markup, so the next person who turns it back gets the old page.',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Get the current file, such as the latest version of the artifact: the shared copy can be newer than yours.',
            'Turn it back into source. `astryx experimental render --reverse page.html` writes the page and every local file it imports into a new folder beside the file: `page-restored/`, or `page-restored-2/` when that folder exists. The command prints the folder it wrote.',
            'Edit the page in that folder, such as `page-restored/page.tsx`.',
            'Render it over the old file: `astryx experimental render page-restored/page.tsx --out page.html`. The command replaces a file only when a render wrote it.',
            'Share the new file, or upload it as a new version of the same artifact.',
          ],
        },
        {
          type: 'prose',
          text: 'Run each command from the folder that holds the file: the command writes only inside the folder you run it from, so the page and `--out` must both be inside it. When the restored page imports a package, such as recharts or an icon set, install it in that folder first; the render names each package that is missing.',
        },
      ],
    },
    {
      id: 'problems',
      title: 'When a step fails',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`ERR_RENDER_BROWSER_API`: the page reads `window` or `document` while it renders. Move that into an effect, or remove it.',
            'The page looks wrong on a phone: a layout picked by script, or a table with large column floors. See step 1.',
            'The render refuses to write the output: it replaces only a file a render wrote. Choose another `--out` name.',
          ],
        },
        {
          type: 'prose',
          text: 'Every detail of the command, such as what it carries, its warnings, and files from other CLI versions: {@link generic:render-pages}.',
        },
      ],
    },
  ],
};
