// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ast.ts
 * @input Parsed Markdown structure and optional Astryx extension nodes
 * @output Canonical immutable MDAST-aligned Markdown node types and text projection
 * @position Public canonical Markdown tree shared by parsing, transforms, rendering, and Outline
 */

export type MarkdownAstDataValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<MarkdownAstDataValue>
  | {readonly [key: string]: MarkdownAstDataValue};

export interface MarkdownAstPoint {
  readonly line?: number;
  readonly column?: number;
  readonly offset?: number;
}

export interface MarkdownAstPosition {
  readonly start: MarkdownAstPoint;
  readonly end: MarkdownAstPoint;
}

export interface MarkdownAstNodeBase {
  readonly position?: MarkdownAstPosition;
  readonly data?: MarkdownAstDataValue;
}

export interface MarkdownAstExtensionNode<
  Plugin extends string = string,
  Name extends string = string,
  Data extends MarkdownAstDataValue = MarkdownAstDataValue,
  Display extends 'inline' | 'block' = 'inline' | 'block',
> extends MarkdownAstNodeBase {
  readonly type: 'extension';
  readonly plugin: Plugin;
  readonly name: Name;
  readonly data: Data;
  readonly display: Display;
  readonly source?: string;
}

export interface MarkdownAstText extends MarkdownAstNodeBase {
  readonly type: 'text';
  readonly value: string;
}

export interface MarkdownAstParent<
  Type extends 'strong' | 'emphasis' | 'delete',
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: Type;
  readonly children: ReadonlyArray<MarkdownAstPhrasingContent<Extension>>;
}

export interface MarkdownAstInlineCode extends MarkdownAstNodeBase {
  readonly type: 'inlineCode';
  readonly value: string;
}

export interface MarkdownAstInlineMath extends MarkdownAstNodeBase {
  readonly type: 'inlineMath';
  readonly value: string;
}

export interface MarkdownAstLink<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'link';
  readonly url: string;
  readonly children: ReadonlyArray<MarkdownAstPhrasingContent<Extension>>;
}

export interface MarkdownAstImage extends MarkdownAstNodeBase {
  readonly type: 'image';
  readonly url: string;
  readonly alt: string;
}

export interface MarkdownAstCitation extends MarkdownAstNodeBase {
  readonly type: 'citation';
  readonly sourceId: string;
}

export interface MarkdownAstBreak extends MarkdownAstNodeBase {
  readonly type: 'break';
}

export type MarkdownAstPhrasingContent<
  Extension extends MarkdownAstExtensionNode = never,
> =
  | MarkdownAstText
  | MarkdownAstParent<'strong', Extension>
  | MarkdownAstParent<'emphasis', Extension>
  | MarkdownAstParent<'delete', Extension>
  | MarkdownAstInlineCode
  | MarkdownAstInlineMath
  | MarkdownAstLink<Extension>
  | MarkdownAstImage
  | MarkdownAstCitation
  | MarkdownAstBreak
  | (Extension & {readonly display: 'inline'});

export interface MarkdownAstHeading<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'heading';
  readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
  readonly children: ReadonlyArray<MarkdownAstPhrasingContent<Extension>>;
}

export interface MarkdownAstParagraph<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'paragraph';
  readonly children: ReadonlyArray<MarkdownAstPhrasingContent<Extension>>;
}

const markdownAstLegacyCodeLanguage = Symbol('MarkdownAstLegacyCodeLanguage');

export interface MarkdownAstCode extends MarkdownAstNodeBase {
  readonly type: 'code';
  readonly lang: string | null;
  readonly meta?: string;
  readonly value: string;
}

type MarkdownAstCodeWithLegacyLanguage = MarkdownAstCode & {
  readonly [markdownAstLegacyCodeLanguage]?: string | null;
};

/** @internal Preserves the released parser/renderer language projection. */
export function markMarkdownAstLegacyCodeLanguage<Node extends MarkdownAstCode>(
  node: Node,
  language: string | null,
): Node {
  if (language === node.lang) {
    return node;
  }
  Object.defineProperty(node, markdownAstLegacyCodeLanguage, {
    configurable: false,
    enumerable: true,
    value: language,
    writable: false,
  });
  return node;
}

/** @internal Reads the released language projection for a canonical code node. */
export function getMarkdownAstLegacyCodeLanguage(
  node: MarkdownAstCode,
): string | null {
  const legacyLanguage = (node as MarkdownAstCodeWithLegacyLanguage)[
    markdownAstLegacyCodeLanguage
  ];
  return legacyLanguage === undefined ? node.lang : legacyLanguage;
}

export interface MarkdownAstMath extends MarkdownAstNodeBase {
  readonly type: 'math';
  readonly value: string;
}

export interface MarkdownAstBlockquote<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'blockquote';
  readonly children: ReadonlyArray<MarkdownAstBlockContent<Extension>>;
}

export interface MarkdownAstListItem<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'listItem';
  readonly checked?: boolean;
  readonly children: ReadonlyArray<MarkdownAstBlockContent<Extension>>;
}

export interface MarkdownAstList<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'list';
  readonly ordered: boolean;
  readonly start?: number;
  readonly spread?: boolean;
  /** Astryx-preserved ordered-list marker delimiter. */
  readonly delimiter?: '.' | ')';
  readonly children: ReadonlyArray<MarkdownAstListItem<Extension>>;
}

export type MarkdownAstTableAlignment = 'left' | 'center' | 'right' | null;

export interface MarkdownAstTableCell<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'tableCell';
  readonly children: ReadonlyArray<MarkdownAstPhrasingContent<Extension>>;
}

export interface MarkdownAstTableRow<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'tableRow';
  readonly children: ReadonlyArray<MarkdownAstTableCell<Extension>>;
}

export interface MarkdownAstTable<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'table';
  readonly align: ReadonlyArray<MarkdownAstTableAlignment>;
  readonly children: ReadonlyArray<MarkdownAstTableRow<Extension>>;
}

export interface MarkdownAstThematicBreak extends MarkdownAstNodeBase {
  readonly type: 'thematicBreak';
}

export type MarkdownAstBlockContent<
  Extension extends MarkdownAstExtensionNode = never,
> =
  | MarkdownAstHeading<Extension>
  | MarkdownAstParagraph<Extension>
  | MarkdownAstCode
  | MarkdownAstMath
  | MarkdownAstBlockquote<Extension>
  | MarkdownAstList<Extension>
  | MarkdownAstTable<Extension>
  | MarkdownAstThematicBreak
  | MarkdownAstImage
  | (Extension & {readonly display: 'block'});

export interface MarkdownAstRoot<
  Extension extends MarkdownAstExtensionNode = never,
> extends MarkdownAstNodeBase {
  readonly type: 'root';
  readonly children: ReadonlyArray<MarkdownAstBlockContent<Extension>>;
}

export interface MarkdownAstNodeMap<
  Extension extends MarkdownAstExtensionNode = MarkdownAstExtensionNode,
> {
  readonly root: MarkdownAstRoot<Extension>;
  readonly text: MarkdownAstText;
  readonly strong: MarkdownAstParent<'strong', Extension>;
  readonly emphasis: MarkdownAstParent<'emphasis', Extension>;
  readonly delete: MarkdownAstParent<'delete', Extension>;
  readonly inlineCode: MarkdownAstInlineCode;
  readonly inlineMath: MarkdownAstInlineMath;
  readonly break: MarkdownAstBreak;
  readonly link: MarkdownAstLink<Extension>;
  readonly image: MarkdownAstImage;
  readonly citation: MarkdownAstCitation;
  readonly heading: MarkdownAstHeading<Extension>;
  readonly paragraph: MarkdownAstParagraph<Extension>;
  readonly code: MarkdownAstCode;
  readonly math: MarkdownAstMath;
  readonly blockquote: MarkdownAstBlockquote<Extension>;
  readonly list: MarkdownAstList<Extension>;
  readonly listItem: MarkdownAstListItem<Extension>;
  readonly table: MarkdownAstTable<Extension>;
  readonly tableRow: MarkdownAstTableRow<Extension>;
  readonly tableCell: MarkdownAstTableCell<Extension>;
  readonly thematicBreak: MarkdownAstThematicBreak;
  readonly extension: Extension;
}

export type MarkdownAstNode<
  Extension extends MarkdownAstExtensionNode = MarkdownAstExtensionNode,
  Type extends keyof MarkdownAstNodeMap<Extension> =
    keyof MarkdownAstNodeMap<Extension>,
> = MarkdownAstNodeMap<Extension>[Type];

export function visitMarkdownNodes<
  Extension extends MarkdownAstExtensionNode,
  Type extends keyof MarkdownAstNodeMap<Extension>,
>(
  root: MarkdownAstRoot<Extension>,
  type: Type,
  visitor: (node: MarkdownAstNodeMap<Extension>[Type]) => void,
): void {
  const visit = (node: MarkdownAstNode<Extension>): void => {
    if (node.type === type) {
      visitor(node as MarkdownAstNodeMap<Extension>[Type]);
    }
    if ('children' in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(root);
}

export function markdownAstText<
  Extension extends MarkdownAstExtensionNode = never,
>(
  nodes: ReadonlyArray<MarkdownAstPhrasingContent<Extension>>,
  extensionText: (
    node: Extension & {readonly display: 'inline'},
  ) => string = node => node.source ?? '',
): string {
  let text = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
      case 'inlineMath':
        text += node.value;
        break;
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'link':
        text += markdownAstText(node.children, extensionText);
        break;
      case 'image':
        text += node.alt;
        break;
      case 'citation':
      case 'break':
        break;
      case 'extension':
        text += extensionText(node);
        break;
      default: {
        node satisfies never;
      }
    }
  }
  return text;
}
