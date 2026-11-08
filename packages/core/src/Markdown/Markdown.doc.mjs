// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Document',
    required: true,
    description: 'Root container for block or inline Markdown content.',
  },
  {
    name: 'Heading',
    required: false,
    description:
      'Rendered semantic heading block; a custom heading renderer replaces the built-in part.',
  },
  {
    name: 'Paragraph',
    required: false,
    description:
      'Rendered paragraph block; a custom paragraph renderer replaces the default part.',
  },
  {
    name: 'List',
    required: false,
    description:
      'Ordered, unordered, or task-list block rendered from Markdown items.',
  },
  {
    name: 'Code block',
    required: false,
    description:
      'Fenced code block; long lines wrap rather than scroll sideways. A custom code renderer replaces the default part.',
  },
  {
    name: 'Blockquote',
    required: false,
    description:
      'Quoted block; a custom blockquote renderer replaces the default part.',
  },
  {
    name: 'Table',
    required: false,
    description:
      'Table block rendered from Markdown rows and columns; its Table child owns horizontal scrolling.',
  },
  {
    name: 'Divider',
    required: false,
    description:
      'Horizontal rule block; a custom hr renderer replaces the default part.',
  },
  {
    name: 'Image',
    required: false,
    description:
      'Block image or unsafe-URL fallback; a custom image renderer replaces a safe default image.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Markdown',
  displayName: 'Markdown',
  category: 'Content',
  keywords: [
    'markdown',
    'rich text',
    'prose',
    'renderer',
    'streaming',
    'markup',
    'formatted text',
    'md',
    'markdown renderer',
  ],
  props: [
    {
      name: 'children',
      type: 'string',
      description: 'The markdown string to render.',
      required: true,
    },
    {
      name: 'display',
      type: "'block' | 'inline'",
      description:
        "Display type. Markdown defaults to block. Use 'inline' for markdown spans embedded inside text.",
      default: "'block'",
    },
    {
      name: 'density',
      type: "\'default\' | \'compact\'",
      description: 'Controls spacing between block-level elements.',
      default: "\'default\'",
    },
    {
      name: 'headingLevelStart',
      type: '1 | 2 | 3 | 4 | 5 | 6',
      description:
        'The HTML heading level that markdown # maps to. Shifts all heading levels down to fit the surrounding page hierarchy. Levels exceeding h6 are clamped to h6.',
      default: '1',
    },
    {
      name: 'isStreaming',
      type: 'boolean',
      description:
        'Enables streaming mode; it uses incremental parsing and a smooth fade-in animation for chunk-by-chunk text delivery.',
      default: 'false',
    },
    {
      name: 'onLinkClick',
      type: '(href: string, event: MouseEvent) => void | false',
      description:
        'Handler for link clicks. Return false to prevent the default navigation behavior. Link destinations in the markdown follow the shared navigation rule described on the Link `href` prop: a blocked destination renders as plain text and never reaches this handler or a custom link renderer. Image URLs use a separate, stricter policy (every data: URL is rejected).',
    },
    {
      name: 'sources',
      type: 'Record<string, MarkdownSource>',
      description:
        'Citation sources keyed by ID. When provided, [id] and 【id】 markers in the markdown that match a key are rendered as citation chips.',
    },
    {
      name: 'citationStyle',
      type: "'label' | 'number'",
      description:
        "How citations are displayed inline. 'label' shows a chip with source title, icon, and border. 'number' shows a compact numbered badge.",
      default: "'label'",
    },
    {
      name: 'contentWidth',
      type: 'number | string',
      description:
        'Max width for prose content (paragraphs, headings, lists, blockquotes). Tables and code blocks are unconstrained and can expand to the full container width. Use for readable line lengths in wide layouts.',
      default: '680',
    },
    {
      name: 'contentAlign',
      type: "'start' | 'center'",
      description:
        'Alignment of prose content within the container when contentWidth is narrower than the available space.',
      default: "'start'",
    },
    {
      name: 'plugins',
      type: 'readonly MarkdownPluginEntry[]',
      description:
        'Ordered extensions created by createMarkdownPlugin(). Plugins may add bounded syntax, immutable typed AST transforms, and typed extension renderers. Use isMarkdownExtensionNode() to narrow extension data observed from other plugins. Renderer callbacks are pure; return a child component when hooks are needed. Omitted and empty lists preserve the released Markdown behavior.',
    },
    {
      name: 'inlinePlugins',
      type: 'MarkdownInlinePlugin[]',
      description:
        'Transforms regex matches in parsed text nodes into custom inline React elements. Use for prefixed identifiers, mentions, and other shorthand patterns. Inline code, fenced code blocks, and math are unaffected.',
    },
    {
      name: 'autolink',
      type: "'gfm'",
      description:
        "Opt-in autolinking of bare URLs and emails. 'gfm' applies GitHub-Flavored Markdown autolink-literal rules: bare https?://..., www...., <scheme:url>, <email>, and user@host all become links. Trailing sentence punctuation and unbalanced trailing close-parens are excluded; matches inside code spans, code blocks, existing links, and image alt text are skipped. Default behavior (option unset) is unchanged.",
    },
    {
      name: 'codeLanguages',
      type: 'ReadonlyArray<CodeLanguage>',
      description:
        "CodeBlock language values a fence may name, each imported on its own (e.g. graphql from @astryxdesign/core/CodeBlock/languages/graphql) or made with createCodeLanguage. A fence whose language word is one of a listed value's identifiers renders with it, ahead of a built-in; a diff-<identifier> fence takes the diff layer over it; a later entry wins. Pass the same list to RichTextEditor or RichTextView so read and edit match.",
    },
    {
      name: 'components',
      type: 'MarkdownComponents',
      description:
        'Custom React component overrides for rendered Markdown elements (code, inlineCode, math, link, heading, paragraph, image, blockquote, hr, citation). Providing math enables `$…$` inline and `$$…$$` display parsing and receives `{value, display}`; omit it when dollar text should stay literal.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description:
        'CSS class name for the root element. Prefer xstyle for styling; className is provided for integration with non-StyleX systems.',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description:
        'Inline styles for the root element. Prefer xstyle for styling; inline styles bypass StyleX optimization.',
    },
    {
      name: 'data-testid',
      type: 'string',
      description: 'Test selector for automated testing frameworks.',
    },
  ],
  playground: {
    defaults: {
      children:
        "## Getting Started\n\nInstall the package:\n\n```bash\nnpm install @astryxdesign/core\n```\n\nThen import and use any component:\n\n```tsx\nimport {Button} from '@astryxdesign/core/Button';\n```\n\n**Bold**, *italic*, and `inline code` all work.",
    },
  },
  theming: {
    targets: [
      {className: 'astryx-markdown', visualProps: ['density']},
      {
        className: 'astryx-markdown-heading',
        visualProps: ['density', 'level'],
      },
      {
        className: 'astryx-markdown-paragraph',
        visualProps: ['density'],
      },
      {
        className: 'astryx-markdown-list',
        visualProps: ['density'],
      },
      {
        className: 'astryx-markdown-codeblock',
        visualProps: ['density'],
      },
      {
        className: 'astryx-markdown-blockquote',
        visualProps: ['density'],
      },
      {
        className: 'astryx-markdown-table',
        visualProps: ['density'],
      },
      {
        className: 'astryx-markdown-hr',
        visualProps: ['density'],
      },
      {
        className: 'astryx-markdown-image',
        visualProps: ['density'],
      },
    ],
  },
  usage: {
    anatomy,
    description:
      'Renders a markdown string as Astryx-styled components. Use Markdown for user-generated content, AI responses, and documentation; it handles headings, lists, tables, code blocks, and citations with consistent styling.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set headingLevelStart to match the page hierarchy, e.g. start at 3 if the markdown sits inside an h2 section.',
      },
      {
        guidance: true,
        description:
          'Use contentWidth to keep prose at a readable line length in wide layouts.',
      },
      {
        guidance: true,
        description:
          'Emphasis and strong pair as CommonMark specifies, so *see **bold** more* puts the bold inside the emphasis. ***text*** renders as strong around emphasis, the order RichText draws, and is announced as both. Emphasis nested more than 100 levels deep stays as written text.',
      },
      {
        guidance: true,
        description:
          'Use plugins created by createMarkdownPlugin for reusable syntax, immutable AST transforms, and typed extension rendering. Keep the ordered list stable while its syntax configuration is unchanged.',
      },
      {
        guidance: true,
        description:
          'To render a plugin node outside Markdown, as another surface showing the same document does, read what the plugin declares with getMarkdownPluginCapabilities (syntax and transform, nothing else), and render each parsed extension node with MarkdownPluginNodeRenderer from the client-only @astryxdesign/core/Markdown/plugin-renderer subpath. It presents the node exactly as Markdown does, fallbacks and failure reports included, with no element of its own.',
      },
      {
        guidance: true,
        description:
          'Add markdownSoftBreaksPlugin when single line endings are meaningful. It matches remark-breaks for supported Markdown, including multiline link labels, while code and other opaque content stay unchanged.',
      },
      {
        guidance: true,
        description:
          'Add markdownSourceLinesPlugin when a feature maps the rendered document back to Markdown source lines (find, highlights, review comments). Every block Markdown renders, nested blocks included, then carries data-source-line and data-source-line-end (1-based, inclusive); components block renderers receive sourceLines to place on their own element, and plugin renderers read node.position lines. Inline elements, table rows, and cells carry none. Without the plugin no line work runs.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownTextTransform for prose matching; it preserves code, links, images, citations, math, and accepted extension syntax as protected contexts. Provide requiredSubstrings only when they conservatively cover every possible match.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownFenceTransform for declared code-fence languages with semantic data. createNode returns an owned block extension node; its standard plugin renderer and toText own presentation. A claimed fence renders through that plugin even when components.code is supplied; components.code renders every unclaimed fence and is the fallback when the plugin renderer declines, throws, or suspends, and without it the accessible, copyable CodeBlock is that fallback.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownSourceDecoration to attach non-visual metadata — search hits, review annotations — to the blocks a source range touches, and getMarkdownSourceDecorations to read it back in a later plugin. Decorations appear on the settled document rather than on partial streaming chunks, and never change rendering, copyable text, accessible names, ids, focus order, or navigation.',
      },
      {
        guidance: true,
        description:
          'Import parseMarkdownAst or parseInlineAst from @astryxdesign/core/Markdown/parser when server or React Server Component code needs to run plugins against the canonical readonly tree. The parser and plugin subpaths have no use-client boundary. The Markdown component remains client-owned, so function-bearing plugin entries must not be passed across an RSC serialization boundary.',
      },
      {
        guidance: true,
        description:
          'Use decodeMarkdownCharacterReferences (from @astryxdesign/core/Markdown/parser or @astryxdesign/core/Markdown) to show text the way Markdown renders its character references: &copy;, &#169;, and &#xA9; become ©, while unknown names and references without their semicolon stay as written. It decodes plain text and knows nothing of Markdown, so skip code and backslash-escaped references yourself. It uses the same table Markdown renders with.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownFrontmatter for typed document metadata. Its parse() method gives the host metadata directly; its plugin removes a complete leading block before rendering and withholds an unfinished block during streaming.',
      },
      {
        guidance: true,
        description:
          "Import createMarkdownRemarkTransform from '@astryxdesign/core/Markdown/remark' only to reuse an existing synchronous transform-only Remark plugin; it stays out of every other bundle. Prove each plugin with fixtures: anything outside the supported MDAST subset — async work, parser or compiler plugins, processor state, raw HTML, unsupported nodes, forged positions, or metadata Astryx cannot represent — keeps the last valid document and reports one diagnostic.",
      },
      {
        guidance: true,
        description:
          'Use inlinePlugins for prefixed identifiers, mentions, and other prose-only shorthand instead of preprocessing the markdown string.',
      },
      {
        guidance: true,
        description:
          'Provide components.math only for documents that use dollar-delimited math. The renderer owns typesetting and accessible output; Astryx passes the expression as text and never executes raw HTML.',
      },
      {
        guidance: true,
        description:
          'For direct parsing, use MathParseOptions and handle InlineNodeWithMath or BlockNodeWithMath. Incremental math parsing also uses createIncrementalState<true>() and IncrementalParseState<true>; default calls and ParseOptions annotations keep the legacy unions.',
      },
      {
        guidance: true,
        description:
          'Install createMarkdownHeadingLinks() through plugins when a document needs copyable h1–h6 permalinks. The returned entry carries its validated namespace and URL base across compatible Core package copies. Each built-in heading keeps its incoming fragment ID and gains an inline trailing # copy button: it is hidden at fine-pointer rest through useContainerReveal, reveals on heading-row hover or keyboard focus, and stays visible under the hook’s coarse/touch semantics. Unmodified tap, click, Enter, or Space copies the canonical URL without navigation, hash mutation, or scrolling; a check confirms success for 1.5 seconds. The no-plugin path stays unchanged, and nested headings use the same depth-first identity projection as Markdown-derived Outline.',
      },
      {
        guidance: true,
        description:
          'For multiple documents, create one heading-links plugin per document with headingIdPrefix and pass that same plugin to Markdown and useOutlineFromMarkdown. Use the same stable value for Markdown id when the root also needs a DOM id; permalinkBaseUrl may supply a safe caller-owned URL before the fragment.',
      },
      {
        guidance: false,
        description:
          'Use Markdown for hand-authored layouts; use Text and Heading directly when you control the content.',
      },
    ],
  },
  examples: [
    {
      label: 'Inline display',
      code: `
import {Text} from '@astryxdesign/core/Text';

<Text>
  This description includes{' '}
  <Markdown display="inline">{'\`inline code\` and **bold text**'}</Markdown>
  .
</Text>;
`,
    },
    {
      label: 'GFM autolinks',
      code: `
<Markdown autolink="gfm">
  {'Visit https://example.com or email contact@example.com. ' +
    'You can also bracket links: <https://docs.example.com>.'}
</Markdown>;
`,
    },
    {
      label: 'Linkable headings',
      code: `
import {Markdown} from '@astryxdesign/core/Markdown';
import {createMarkdownHeadingLinks} from '@astryxdesign/core/Markdown/plugins';
import {Outline, useOutlineFromMarkdown} from '@astryxdesign/core/Outline';

const documentId = 'guide';
const headingLinks = createMarkdownHeadingLinks({
  headingIdPrefix: documentId,
});
const plugins = [headingLinks];

function Guide({source}) {
  const items = useOutlineFromMarkdown(source, {plugins});
  return (
    <>
      <Markdown id={documentId} plugins={plugins}>{source}</Markdown>
      <Outline items={items} />
    </>
  );
}
`,
    },
    {
      label: 'First-party soft breaks',
      code: `
import {Markdown} from '@astryxdesign/core/Markdown';
import {markdownSoftBreaksPlugin} from '@astryxdesign/core/Markdown/plugins';

<Markdown plugins={[markdownSoftBreaksPlugin]}>
  {'First line\\nSecond line'}
</Markdown>;
`,
    },
    {
      label: 'Source-line stamps',
      code: `
import {Markdown} from '@astryxdesign/core/Markdown';
import {markdownSourceLinesPlugin} from '@astryxdesign/core/Markdown/plugins';

// Each rendered block carries data-source-line / data-source-line-end.
<Markdown plugins={[markdownSourceLinesPlugin]}>
  {'# Title\\n\\n- one\\n- two'}
</Markdown>;
`,
    },
    {
      label: 'Text transform helper',
      code: `
import {Markdown} from '@astryxdesign/core/Markdown';
import {
  createMarkdownPlugin,
  createMarkdownTextTransform,
} from '@astryxdesign/core/Markdown/plugins';

const finalLabels = createMarkdownPlugin({
  name: 'final-labels',
  apiVersion: 1,
  transform: createMarkdownTextTransform({
    pattern: /\\bDraft\\b/g,
    requiredSubstrings: ['Draft'],
    replace: () => ({type: 'text', value: 'Final'}),
  }),
});

<Markdown plugins={[finalLabels]}># Draft</Markdown>;
`,
    },
    {
      label: 'Semantic fence helper',
      code: `
import {Markdown} from '@astryxdesign/core/Markdown';
import {
  createMarkdownFenceTransform,
  createMarkdownPlugin,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';

type DiagramNode = MarkdownExtensionNode<
  'diagrams',
  'diagram',
  {readonly code: string; readonly label?: string},
  'block'
>;

const diagrams = createMarkdownPlugin<'diagrams', DiagramNode>({
  name: 'diagrams',
  apiVersion: 1,
  transform: createMarkdownFenceTransform({
    languages: ['mermaid'],
    createNode: ({code, meta}) => ({
      type: 'extension',
      plugin: 'diagrams',
      name: 'diagram',
      display: 'block',
      data: {code, ...(meta == null ? {} : {label: meta})},
    }),
  }),
  renderers: {
    diagram: {
      render: ({node}) => (
        <Diagram source={node.data.code} label={node.data.label} />
      ),
      toText: node => node.data.code,
    },
  },
});

<Markdown plugins={[diagrams]}>
  {'\`\`\`mermaid Checkout flow\\ngraph LR; A-->B\\n\`\`\`'}
</Markdown>;
`,
    },
    {
      label: 'Source decoration helper',
      code: `
import {Markdown} from '@astryxdesign/core/Markdown';
import {
  createMarkdownPlugin,
  createMarkdownSourceDecoration,
  getMarkdownSourceDecorations,
} from '@astryxdesign/core/Markdown/plugins';

// Ranges are UTF-16 offsets into the same string Markdown renders. Every
// block a range touches is annotated; rendering, copyable text, and ids
// never change.
const searchHits = createMarkdownPlugin({
  name: 'search-hits',
  apiVersion: 1,
  transform: createMarkdownSourceDecoration({
    name: 'search-hit',
    ranges: [{start: 0, end: 15, data: {query: 'release'}}],
  }),
});

const readDecorations = createMarkdownPlugin({
  name: 'read-decorations',
  apiVersion: 1,
  transform: root => {
    report(root.children.map(getMarkdownSourceDecorations));
    return root;
  },
});

<Markdown plugins={[searchHits, readDecorations]}>{source}</Markdown>;
`,
    },
    {
      label: 'Native frontmatter',
      code: `
import {Markdown} from '@astryxdesign/core/Markdown';
import {createMarkdownFrontmatter} from '@astryxdesign/core/Markdown/plugins';

const frontmatter = createMarkdownFrontmatter({
  name: 'document-metadata',
  parse: fields => ({
    title: fields.title ?? 'Untitled',
    draft: fields.draft === 'true',
  }),
});

const source = '---\\ntitle: Release notes\\ndraft: true\\n---\\n# Shipped';
const result = frontmatter.parse(source);

<Markdown plugins={[frontmatter.plugin]}>{source}</Markdown>;
`,
    },
    {
      label: 'Compatible Remark plugin',
      code: `
import {Markdown} from '@astryxdesign/core/Markdown';
import {createMarkdownPlugin} from '@astryxdesign/core/Markdown/plugins';
import {createMarkdownRemarkTransform} from '@astryxdesign/core/Markdown/remark';

// A synchronous transform-only Remark plugin in the usual attacher shape.
const remarkRename =
  ({from, to}) =>
  tree => {
    const rename = node => {
      if (node.type === 'text') {
        node.value = node.value.split(from).join(to);
      }
      node.children?.forEach(rename);
    };
    rename(tree);
  };

const productName = createMarkdownPlugin({
  name: 'product-name',
  apiVersion: 1,
  transform: createMarkdownRemarkTransform(remarkRename, {
    from: 'Astryx',
    to: 'Astryx Design',
  }),
});

<Markdown plugins={[productName]}># Astryx release notes</Markdown>;
`,
    },
    {
      label: 'Entity links',
      code: `
import {Link} from '@astryxdesign/core/Link';

const entityPlugins = [
  {
    pattern: /\\b([A-Z][A-Z0-9]+-\\d+)\\b/g,
    render: (match, key) => (
      <Link key={key} href={\`/entities/\${match[1]}\`}>
        {match[0]}
      </Link>
    ),
  },
];

<Markdown inlinePlugins={entityPlugins}>
  {'See DOC-2048. Inline code stays plain: \`DOC-9999\`.'}
</Markdown>;
`,
    },
    {
      label: 'Math renderer',
      code: `
import {BlockMath, InlineMath} from 'react-katex';

function MathExpression({value, display}) {
  const Component = display === 'block' ? BlockMath : InlineMath;
  return <Component math={value} />;
}

<Markdown components={{math: MathExpression}}>
  {'Inline $x_1 + y$ and display math:\\n\\n$$\\n\\\\sum_i x_i\\n$$'}
</Markdown>;
`,
    },
  ],
};

export const docsZh = {
  name: 'Markdown',
  displayName: 'Markdown',
  props: [
    {
      name: 'children',
      type: 'string',
      description: '要渲染的 Markdown 字符串。',
      required: true,
    },
    {
      name: 'display',
      type: "'block' | 'inline'",
      description:
        "显示类型。Markdown 默认为 block。使用 'inline' 可在文本内嵌入 Markdown 片段。",
      default: "'block'",
    },
    {
      name: 'density',
      type: "'default' | 'compact'",
      description: '控制块级元素之间的间距。',
      default: "'default'",
    },
    {
      name: 'headingLevelStart',
      type: '1 | 2 | 3 | 4 | 5 | 6',
      description:
        'Markdown # 映射到的 HTML 标题级别。将所有标题级别向下偏移以适应页面层次结构。超过 h6 的级别将被限制为 h6。',
      default: '1',
    },
    {
      name: 'isStreaming',
      type: 'boolean',
      description: '启用流式模式，使用增量解析和淡入动画处理分块文本。',
      default: 'false',
    },
    {
      name: 'onLinkClick',
      type: '(href: string, event: MouseEvent) => void | false',
      description: '链接点击处理器。返回 false 可阻止默认导航行为。',
    },
    {
      name: 'sources',
      type: 'Record<string, MarkdownSource>',
      description:
        '按 ID 索引的引用来源。提供后，Markdown 中匹配的 [id] 和 【id】 标记将渲染为引用标签。',
    },
    {
      name: 'citationStyle',
      type: "'label' | 'number'",
      description:
        "引用的内联显示方式。'label' 显示带标题、图标和边框的标签。'number' 显示紧凑编号徽章。",
      default: "'label'",
    },
    {
      name: 'contentWidth',
      type: 'number | string',
      description:
        '正文内容的最大宽度（段落、标题、列表、引用块）。表格和代码块不受限制，可扩展到完整容器宽度。用于在宽布局中保持可读行长。',
      default: '680',
    },
    {
      name: 'contentAlign',
      type: "'start' | 'center'",
      description:
        '当 contentWidth 小于可用空间时，正文内容在容器内的对齐方式。',
      default: "'start'",
    },
    {
      name: 'plugins',
      type: 'readonly MarkdownPluginEntry[]',
      description:
        '由 createMarkdownPlugin() 创建的有序扩展。插件可添加有界语法、不可变的类型化 AST 转换和类型化扩展渲染器。使用 isMarkdownExtensionNode() 缩小从其他插件观察到的扩展数据类型。渲染回调必须是纯函数；需要 Hook 时请返回子组件。省略或传入空列表时保持已发布的 Markdown 行为。',
    },
    {
      name: 'inlinePlugins',
      type: 'MarkdownInlinePlugin[]',
      description:
        '将已解析文本节点中的正则匹配转换为自定义内联 React 元素。适用于带前缀的标识符、用户提及等简写模式。内联代码、围栏代码块和数学表达式不受影响。',
    },
    {
      name: 'autolink',
      type: "'gfm'",
      description:
        "可选的裸 URL 和电子邮箱自动链接。设为 'gfm' 启用 GitHub Flavored Markdown 自动链接规则：裸 https?://、www.、<scheme:url>、<email> 以及 user@host 都会变成链接。末尾句末标点和不平衡的末尾右括号会被排除；代码块、现有链接和图片替代文本内部的匹配会被跳过。默认为关闭。",
    },
    {
      name: 'codeLanguages',
      type: 'ReadonlyArray<CodeLanguage>',
      description:
        '代码块可以命名的 CodeBlock 语言值，每个单独导入（例如从 @astryxdesign/core/CodeBlock/languages/graphql 导入 graphql），或用 createCodeLanguage 创建。语言词属于所列值标识符的代码块用该值渲染，优先于内置语言；后列出的条目优先。',
    },
    {
      name: 'components',
      type: 'MarkdownComponents',
      description:
        '用于覆盖 Markdown 渲染元素的自定义 React 组件（code、inlineCode、math、link、heading、paragraph、image、blockquote、hr、citation）。提供 math 会启用 `$…$` 行内数学和 `$$…$$` 块级数学解析，并接收 `{value, display}`；不提供时美元符号保持原样。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式。必须是 stylex.create() 的值，而非内联样式对象。',
    },
    {
      name: 'className',
      type: 'string',
      description:
        '根元素的 CSS 类名。建议使用 xstyle，className 适用于非 StyleX 系统集成。',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description:
        '根元素的内联样式。建议使用 xstyle，内联样式会绕过 StyleX 优化。',
    },
    {
      name: 'data-testid',
      type: 'string',
      description: '用于自动化测试框架的测试选择器。',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-markdown', visualProps: ['density']},
      {
        className: 'astryx-markdown-heading',
        visualProps: ['density', 'level'],
        description:
          '每个渲染的标题块（h1–h6）。覆盖 marginBlockStart/marginBlockEnd 可调整标题周围的间距；反映 data-density 和 data-level，因此主题可按密度和标题层级设置间距。仅适用于默认标题渲染——自定义的 components.heading 拥有自己的样式。',
      },
      {
        className: 'astryx-markdown-paragraph',
        visualProps: ['density'],
        description:
          '每个渲染的段落块。覆盖 marginBlockStart/marginBlockEnd 可调整段落之间的间距。反映 data-density，因此主题可以为不同密度设置不同的间距。',
      },
      {
        className: 'astryx-markdown-list',
        visualProps: ['density'],
        description:
          '每个渲染的列表块（有序、无序和任务列表）。覆盖 marginBlockStart/marginBlockEnd 可调整列表周围的间距；反映 data-density。',
      },
      {
        className: 'astryx-markdown-codeblock',
        visualProps: ['density'],
        description:
          '每个渲染的代码块外层容器。覆盖 marginBlockStart/marginBlockEnd 可调整代码块周围的间距；反映 data-density。仅适用于默认渲染——自定义的 components.code 拥有自己的样式。',
      },
      {
        className: 'astryx-markdown-blockquote',
        visualProps: ['density'],
        description:
          '每个渲染的引用块（与 astryx-blockquote 目标共用同一元素）。覆盖 marginBlockStart/marginBlockEnd 可调整引用块周围的间距；反映 data-density。仅适用于默认渲染——自定义的 components.blockquote 拥有自己的样式。',
      },
      {
        className: 'astryx-markdown-table',
        visualProps: ['density'],
        description:
          '每个渲染的表格外层容器。覆盖 marginBlockStart/marginBlockEnd 可调整表格周围的间距；反映 data-density。',
      },
      {
        className: 'astryx-markdown-hr',
        visualProps: ['density'],
        description:
          '每个渲染的水平分隔线。覆盖 marginBlockStart/marginBlockEnd 可调整分隔线周围的间距；反映 data-density。仅适用于默认渲染——自定义的 components.hr 拥有自己的样式。',
      },
      {
        className: 'astryx-markdown-image',
        visualProps: ['density'],
        description:
          '每个渲染的块级图片外层容器（以及损坏图片的占位符）。覆盖 marginBlockStart/marginBlockEnd 可调整图片周围的间距；反映 data-density。仅适用于默认渲染——自定义的 components.image 拥有自己的样式。',
      },
    ],
  },
  usage: {
    anatomy,
    description:
      'Renders a markdown string as Astryx-styled components. Use Markdown for user-generated content, AI responses, and documentation; it handles headings, lists, tables, code blocks, and citations with consistent styling.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set headingLevelStart to match the page hierarchy, e.g. start at 3 if the markdown sits inside an h2 section.',
      },
      {
        guidance: true,
        description:
          'Use contentWidth to keep prose at a readable line length in wide layouts.',
      },
      {
        guidance: true,
        description:
          'Emphasis and strong pair as CommonMark specifies, so *see **bold** more* puts the bold inside the emphasis. ***text*** renders as strong around emphasis, the order RichText draws, and is announced as both. Emphasis nested more than 100 levels deep stays as written text.',
      },
      {
        guidance: true,
        description:
          'Use plugins created by createMarkdownPlugin for reusable syntax, immutable AST transforms, and typed extension rendering. Keep the ordered list stable while its syntax configuration is unchanged.',
      },
      {
        guidance: true,
        description:
          'To render a plugin node outside Markdown, as another surface showing the same document does, read what the plugin declares with getMarkdownPluginCapabilities (syntax and transform, nothing else), and render each parsed extension node with MarkdownPluginNodeRenderer from the client-only @astryxdesign/core/Markdown/plugin-renderer subpath. It presents the node exactly as Markdown does, fallbacks and failure reports included, with no element of its own.',
      },
      {
        guidance: true,
        description:
          'Add markdownSoftBreaksPlugin when single line endings are meaningful. It matches remark-breaks for supported Markdown, including multiline link labels, while code and other opaque content stay unchanged.',
      },
      {
        guidance: true,
        description:
          'Add markdownSourceLinesPlugin when a feature maps the rendered document back to Markdown source lines (find, highlights, review comments). Every block Markdown renders, nested blocks included, then carries data-source-line and data-source-line-end (1-based, inclusive); components block renderers receive sourceLines to place on their own element, and plugin renderers read node.position lines. Inline elements, table rows, and cells carry none. Without the plugin no line work runs.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownTextTransform for prose matching; it preserves code, links, images, citations, math, and accepted extension syntax as protected contexts. Provide requiredSubstrings only when they conservatively cover every possible match.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownFenceTransform for declared code-fence languages with semantic data. createNode returns an owned block extension node; its standard plugin renderer and toText own presentation. A claimed fence renders through that plugin even when components.code is supplied; components.code renders every unclaimed fence and is the fallback when the plugin renderer declines, throws, or suspends, and without it the accessible, copyable CodeBlock is that fallback.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownSourceDecoration to attach non-visual metadata — search hits, review annotations — to the blocks a source range touches, and getMarkdownSourceDecorations to read it back in a later plugin. Decorations appear on the settled document rather than on partial streaming chunks, and never change rendering, copyable text, accessible names, ids, focus order, or navigation.',
      },
      {
        guidance: true,
        description:
          'Import parseMarkdownAst or parseInlineAst from @astryxdesign/core/Markdown/parser when server or React Server Component code needs to run plugins against the canonical readonly tree. The parser and plugin subpaths have no use-client boundary. The Markdown component remains client-owned, so function-bearing plugin entries must not be passed across an RSC serialization boundary.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownFrontmatter for typed document metadata. Its parse() method gives the host metadata directly; its plugin removes a complete leading block before rendering and withholds an unfinished block during streaming.',
      },
      {
        guidance: true,
        description:
          "Import createMarkdownRemarkTransform from '@astryxdesign/core/Markdown/remark' only to reuse an existing synchronous transform-only Remark plugin; it stays out of every other bundle. Prove each plugin with fixtures: anything outside the supported MDAST subset — async work, parser or compiler plugins, processor state, raw HTML, unsupported nodes, forged positions, or metadata Astryx cannot represent — keeps the last valid document and reports one diagnostic.",
      },
      {
        guidance: true,
        description:
          'Use inlinePlugins for prefixed identifiers, mentions, and other prose-only shorthand instead of preprocessing the markdown string.',
      },
      {
        guidance: true,
        description:
          'Provide components.math only for documents that use dollar-delimited math. The renderer owns typesetting and accessible output; Astryx passes the expression as text and never executes raw HTML.',
      },
      {
        guidance: true,
        description:
          'For direct parsing, use MathParseOptions and handle InlineNodeWithMath or BlockNodeWithMath. Incremental math parsing also uses createIncrementalState<true>() and IncrementalParseState<true>; default calls and ParseOptions annotations keep the legacy unions.',
      },
      {
        guidance: true,
        description:
          'Install createMarkdownHeadingLinks() through plugins when a document needs copyable h1–h6 permalinks. The returned entry carries its validated namespace and URL base across compatible Core package copies. Each built-in heading keeps its incoming fragment ID and gains an inline trailing # copy button: it is hidden at fine-pointer rest through useContainerReveal, reveals on heading-row hover or keyboard focus, and stays visible under the hook’s coarse/touch semantics. Unmodified tap, click, Enter, or Space copies the canonical URL without navigation, hash mutation, or scrolling; a check confirms success for 1.5 seconds. The no-plugin path stays unchanged, and nested headings use the same depth-first identity projection as Markdown-derived Outline.',
      },
      {
        guidance: true,
        description:
          'For multiple documents, create one heading-links plugin per document with headingIdPrefix and pass that same plugin to Markdown and useOutlineFromMarkdown. Use the same stable value for Markdown id when the root also needs a DOM id; permalinkBaseUrl may supply a safe caller-owned URL before the fragment.',
      },
      {
        guidance: false,
        description:
          'Use Markdown for hand-authored layouts; use Text and Heading directly when you control the content.',
      },
    ],
  },
};

export const docsDense = {
  description:
    'Renders markdown string as Astryx-styled components. Use for user-generated content, AI responses, docs. Headings, lists, tables, code, citations w/ consistent styling.',
  usage: {
    anatomy,
    description:
      'Renders a markdown string as Astryx-styled components. Use Markdown for user-generated content, AI responses, and documentation; it handles headings, lists, tables, code blocks, and citations with consistent styling.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set headingLevelStart to match the page hierarchy, e.g. start at 3 if the markdown sits inside an h2 section.',
      },
      {
        guidance: true,
        description:
          'Use contentWidth to keep prose at a readable line length in wide layouts.',
      },
      {
        guidance: true,
        description:
          'Emphasis and strong pair as CommonMark specifies, so *see **bold** more* puts the bold inside the emphasis. ***text*** renders as strong around emphasis, the order RichText draws, and is announced as both. Emphasis nested more than 100 levels deep stays as written text.',
      },
      {
        guidance: true,
        description:
          'Use plugins created by createMarkdownPlugin for reusable syntax, immutable AST transforms, and typed extension rendering. Keep the ordered list stable while its syntax configuration is unchanged.',
      },
      {
        guidance: true,
        description:
          'To render a plugin node outside Markdown, as another surface showing the same document does, read what the plugin declares with getMarkdownPluginCapabilities (syntax and transform, nothing else), and render each parsed extension node with MarkdownPluginNodeRenderer from the client-only @astryxdesign/core/Markdown/plugin-renderer subpath. It presents the node exactly as Markdown does, fallbacks and failure reports included, with no element of its own.',
      },
      {
        guidance: true,
        description:
          'Add markdownSoftBreaksPlugin when single line endings are meaningful. It matches remark-breaks for supported Markdown, including multiline link labels, while code and other opaque content stay unchanged.',
      },
      {
        guidance: true,
        description:
          'Add markdownSourceLinesPlugin when a feature maps the rendered document back to Markdown source lines (find, highlights, review comments). Every block Markdown renders, nested blocks included, then carries data-source-line and data-source-line-end (1-based, inclusive); components block renderers receive sourceLines to place on their own element, and plugin renderers read node.position lines. Inline elements, table rows, and cells carry none. Without the plugin no line work runs.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownTextTransform for prose matching; it preserves code, links, images, citations, math, and accepted extension syntax as protected contexts. Provide requiredSubstrings only when they conservatively cover every possible match.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownFenceTransform for declared code-fence languages with semantic data. createNode returns an owned block extension node; its standard plugin renderer and toText own presentation. A claimed fence renders through that plugin even when components.code is supplied; components.code renders every unclaimed fence and is the fallback when the plugin renderer declines, throws, or suspends, and without it the accessible, copyable CodeBlock is that fallback.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownSourceDecoration to attach non-visual metadata — search hits, review annotations — to the blocks a source range touches, and getMarkdownSourceDecorations to read it back in a later plugin. Decorations appear on the settled document rather than on partial streaming chunks, and never change rendering, copyable text, accessible names, ids, focus order, or navigation.',
      },
      {
        guidance: true,
        description:
          'Import parseMarkdownAst or parseInlineAst from @astryxdesign/core/Markdown/parser when server or React Server Component code needs to run plugins against the canonical readonly tree. The parser and plugin subpaths have no use-client boundary. The Markdown component remains client-owned, so function-bearing plugin entries must not be passed across an RSC serialization boundary.',
      },
      {
        guidance: true,
        description:
          'Use createMarkdownFrontmatter for typed document metadata. Its parse() method gives the host metadata directly; its plugin removes a complete leading block before rendering and withholds an unfinished block during streaming.',
      },
      {
        guidance: true,
        description:
          "Import createMarkdownRemarkTransform from '@astryxdesign/core/Markdown/remark' only to reuse a synchronous transform-only Remark plugin; it stays out of every other bundle and unsupported behavior keeps the last valid document with one diagnostic.",
      },
      {
        guidance: true,
        description:
          'Use inlinePlugins for prefixed identifiers, mentions, and other prose-only shorthand instead of preprocessing the markdown string.',
      },
      {
        guidance: true,
        description:
          'Provide components.math only for documents that use dollar-delimited math; the renderer owns typesetting and accessible output.',
      },
      {
        guidance: true,
        description:
          'Direct math parser calls use MathParseOptions and the explicit WithMath node unions; incremental calls also use createIncrementalState<true>() and IncrementalParseState<true>. Default calls keep the legacy unions.',
      },
      {
        guidance: true,
        description:
          'Install createMarkdownHeadingLinks() through plugins to add all-depth stable IDs and inline trailing # copy buttons to built-in headings. useContainerReveal keeps each button hidden at fine-pointer rest and keyboard/touch reachable. Unmodified activation copies the canonical URL without navigation, hash mutation, or scrolling and shows a 1.5-second check; failures stay silent. Pass the same plugin entry to Markdown-derived Outline; use headingIdPrefix for multiple instances.',
      },
      {
        guidance: false,
        description:
          'Use Markdown for hand-authored layouts; use Text and Heading directly when you control the content.',
      },
    ],
  },
  propDescriptions: {
    children: 'markdown string',
    density: "Block spacing. 'default'|'compact'. Default: 'default'.",
    headingLevelStart:
      'Maps # to this heading level (1-6). Clamped to h6. Default: 1.',
    isStreaming:
      'Incremental parse + fade-in for streamed chunks. Default: false.',
    onLinkClick:
      '(href, event) => void|false. Return false prevents navigation. Link destinations follow the shared navigation rule (see Link href); blocked ones render as text. Image URLs: separate stricter policy.',
    sources:
      'Record<string, MarkdownSource>. Citation sources by ID. [id]/【id】 markers render as chips.',
    citationStyle:
      "'label'|'number'. label=chip w/ title+icon, number=compact badge. Default: 'label'.",
    contentWidth:
      'number|string. Max width for prose (headings, paragraphs, lists). Tables/code unconstrained.',
    contentAlign:
      "'start'|'center'. Prose alignment when contentWidth < container. Default: 'start'.",
    plugins:
      'readonly MarkdownPluginEntry[]. Ordered syntax, immutable AST transforms, and typed extension renderers from createMarkdownPlugin(), plus first-party helpers such as createMarkdownHeadingLinks(). Default: omitted or empty.',
    inlinePlugins:
      'MarkdownInlinePlugin[]. Regex matches in text nodes -> custom inline React elements. Skips inline/fenced code and math.',
    autolink:
      "'gfm'. Opt-in GFM autolinking: bare URLs (https?://, www.), <scheme:url>, <email>, user@host. Skips code, code blocks, existing links. Default: off.",
    components:
      'MarkdownComponents. Custom renderers; math({value, display}) opts into $…$/$$…$$ parsing. Renderer owns output and accessibility.',
    xstyle: 'stylex.create() for layout (margins, sizing).',
    className: 'CSS class. Prefer xstyle.',
    style: 'Inline styles. Prefer xstyle.',
    'data-testid': 'Test selector.',
  },
};
