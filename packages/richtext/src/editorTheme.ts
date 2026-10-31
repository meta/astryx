// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file editorTheme.ts
 * @input Uses StyleX + Astryx design tokens
 * @output Exports sharedEditorTheme(), which builds a Lexical EditorThemeClasses
 *   object mapping Lexical's theme slots to StyleX-generated class names, with
 *   document blocks styled like core Markdown (spec:AST-061 FR2–FR4).
 * @position Shared by RichTextEditor.tsx and RichTextView.tsx so editor and
 *   read-only view render identically.
 *
 * SYNC: When modified, keep RichTextEditor.tsx and RichTextView.tsx in sync.
 */

import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
  typeScaleVars,
  fontWeightVars,
  borderVars,
  focusVars,
  sizeVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {CODE_SYNTAX_CLASS} from './CodeSyntaxPlugin';
import type {EditorThemeClasses} from 'lexical';

// Document blocks follow core Markdown's typography, spacing, and measure
// (spec:AST-061 FR2–FR4): type-scale tokens for text, one block spacing table
// with no margin before the first block or after the last, and prose capped
// at Markdown's default content width while code and tables span the editor.
const PROSE_MEASURE = '680px';

// Block margins wrap their spacing tokens in calc(). The value is unique to
// these rules, so its atomic class never matches a margin declared by other
// code; a stylesheet in a later cascade layer therefore cannot outrank the
// :first-child and :last-child rules that remove the outer margins.
const MAJOR_HEADING_BEFORE = `calc(${spacingVars['--spacing-6']})`;
const MAJOR_HEADING_AFTER = `calc(${spacingVars['--spacing-3']})`;
const MINOR_HEADING_BEFORE = `calc(${spacingVars['--spacing-4']})`;
const MINOR_HEADING_AFTER = `calc(${spacingVars['--spacing-2']})`;
const TEXT_BLOCK_SPACE = `calc(${spacingVars['--spacing-3']})`;
const WIDE_BLOCK_SPACE = `calc(${spacingVars['--spacing-4']})`;
const LIST_ITEM_SPACE = `calc(${spacingVars['--spacing-1']})`;
const TASK_BOX_SIZE = '20px';
const LIST_ROW_GAP = `calc(${spacingVars['--spacing-0-5']})`;
const LIST_ROW_FLUSH = `calc(${spacingVars['--spacing-0']})`;
const NESTED_LIST_SPACE = `calc(${spacingVars['--spacing-2']})`;
const RULE_SPACE = `calc(${spacingVars['--spacing-6']})`;
const CODE_SPACE = `calc(${spacingVars['--spacing-3']})`;
// Core CodeBlock's header (8px, a small control, 8px) overlaps the code's
// 12px top padding by 8px, so its code starts 8px + control + 12px down.
const CODE_HEADER_SPACE = `calc(${spacingVars['--spacing-2']} + ${sizeVars['--size-element-sm']} + ${spacingVars['--spacing-3']})`;
// A block that names no language has no header: core CodeBlock puts its copy
// button in a column of its own at the inline end (8px, a small control, 8px),
// beside the code rather than over it, so the code ends that much earlier.
const CODE_CORNER_SPACE = `calc(${spacingVars['--spacing-4']} + ${sizeVars['--size-element-sm']} + 2 * ${spacingVars['--spacing-2']})`;

const editorTheme = stylex.create({
  // Lexical marks every top-level block `dir="auto"`, which picks each
  // block's direction from its first strong character: a Hebrew paragraph in
  // an English document flips to the right, an English one in an Arabic
  // document to the left. Blocks take the direction of the surface around
  // them instead, as core Markdown's do, and bidi inside a block still
  // follows the Unicode algorithm (spec:AST-061 FR6).
  providerDirection: {
    direction: 'inherit',
  },
  paragraph: {
    // The first block's leading margin would stack with the input inset, so
    // the first line aligns with TextArea and the empty-editor placeholder.
    // A Markdown plugin block takes this style and is a decorator, so at
    // either edge of the document it sits beside Lexical's zero-size caret
    // boundary element (see `hr`) and takes no outer margin there either.
    marginBlockStart: {
      default: TEXT_BLOCK_SPACE,
      ':first-child': spacingVars['--spacing-0'],
      ':is([data-lexical-decorator-boundary]:first-child + *)':
        spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: TEXT_BLOCK_SPACE,
      ':last-child': spacingVars['--spacing-0'],
      ':has(+ [data-lexical-decorator-boundary]:last-child)':
        spacingVars['--spacing-0'],
    },
    maxWidth: PROSE_MEASURE,
    // The base reset gives every <p> body weight and primary color; a
    // paragraph inside a table header cell takes the cell's instead.
    fontWeight: 'inherit',
    color: 'inherit',
  },
  h1: {
    fontFamily: typographyVars['--font-family-heading'],
    fontSize: typeScaleVars['--text-heading-1-size'],
    fontWeight: typeScaleVars['--text-heading-1-weight'],
    lineHeight: typeScaleVars['--text-heading-1-leading'],
    marginBlockStart: {
      default: MAJOR_HEADING_BEFORE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: MAJOR_HEADING_AFTER,
      ':last-child': spacingVars['--spacing-0'],
    },
    maxWidth: PROSE_MEASURE,
  },
  h2: {
    fontFamily: typographyVars['--font-family-heading'],
    fontSize: typeScaleVars['--text-heading-2-size'],
    fontWeight: typeScaleVars['--text-heading-2-weight'],
    lineHeight: typeScaleVars['--text-heading-2-leading'],
    marginBlockStart: {
      default: MAJOR_HEADING_BEFORE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: MAJOR_HEADING_AFTER,
      ':last-child': spacingVars['--spacing-0'],
    },
    maxWidth: PROSE_MEASURE,
  },
  h3: {
    fontFamily: typographyVars['--font-family-heading'],
    fontSize: typeScaleVars['--text-heading-3-size'],
    fontWeight: typeScaleVars['--text-heading-3-weight'],
    lineHeight: typeScaleVars['--text-heading-3-leading'],
    marginBlockStart: {
      default: MAJOR_HEADING_BEFORE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: MAJOR_HEADING_AFTER,
      ':last-child': spacingVars['--spacing-0'],
    },
    maxWidth: PROSE_MEASURE,
  },
  h4: {
    fontFamily: typographyVars['--font-family-heading'],
    fontSize: typeScaleVars['--text-heading-4-size'],
    fontWeight: typeScaleVars['--text-heading-4-weight'],
    lineHeight: typeScaleVars['--text-heading-4-leading'],
    marginBlockStart: {
      default: MINOR_HEADING_BEFORE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: MINOR_HEADING_AFTER,
      ':last-child': spacingVars['--spacing-0'],
    },
    maxWidth: PROSE_MEASURE,
  },
  h5: {
    fontFamily: typographyVars['--font-family-heading'],
    fontSize: typeScaleVars['--text-heading-5-size'],
    fontWeight: typeScaleVars['--text-heading-5-weight'],
    lineHeight: typeScaleVars['--text-heading-5-leading'],
    marginBlockStart: {
      default: MINOR_HEADING_BEFORE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: MINOR_HEADING_AFTER,
      ':last-child': spacingVars['--spacing-0'],
    },
    maxWidth: PROSE_MEASURE,
  },
  h6: {
    fontFamily: typographyVars['--font-family-heading'],
    fontSize: typeScaleVars['--text-heading-6-size'],
    fontWeight: typeScaleVars['--text-heading-6-weight'],
    lineHeight: typeScaleVars['--text-heading-6-leading'],
    marginBlockStart: {
      default: MINOR_HEADING_BEFORE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: MINOR_HEADING_AFTER,
      ':last-child': spacingVars['--spacing-0'],
    },
    maxWidth: PROSE_MEASURE,
  },
  quote: {
    marginBlockStart: {
      default: WIDE_BLOCK_SPACE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: WIDE_BLOCK_SPACE,
      ':last-child': spacingVars['--spacing-0'],
    },
    marginInline: 0,
    maxWidth: PROSE_MEASURE,
    paddingInlineStart: spacingVars['--spacing-4'],
    borderInlineStartWidth: '2px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border-emphasized'],
    color: colorVars['--color-text-secondary'],
  },
  ul: {
    marginBlockStart: {
      default: TEXT_BLOCK_SPACE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: TEXT_BLOCK_SPACE,
      ':last-child': spacingVars['--spacing-0'],
    },
    maxWidth: PROSE_MEASURE,
    paddingInlineStart: spacingVars['--spacing-6'],
    listStylePosition: 'outside',
  },
  ol: {
    marginBlockStart: {
      default: TEXT_BLOCK_SPACE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: TEXT_BLOCK_SPACE,
      ':last-child': spacingVars['--spacing-0'],
    },
    maxWidth: PROSE_MEASURE,
    paddingInlineStart: spacingVars['--spacing-6'],
    listStylePosition: 'outside',
  },
  // Markers by depth (spec:AST-061 DEC-6): a list nested inside n lists, of
  // either kind, draws disc, circle, or square, or writes decimal,
  // lower-alpha, or lower-roman numbers, for n modulo 3 = 0, 1, 2. Lexical
  // gives every list its tag's class above and the depth class at
  // `depth % 3`; only the depth class names a marker, so no two classes on a
  // list compete for it. A nested list sits alone in its item, so the first-
  // and last-child rules above already take its margins away.
  ulMarker0: {listStyleType: 'disc'},
  ulMarker1: {listStyleType: 'circle'},
  ulMarker2: {listStyleType: 'square'},
  olMarker0: {listStyleType: 'decimal'},
  olMarker1: {listStyleType: 'lower-alpha'},
  olMarker2: {listStyleType: 'lower-roman'},
  // List items space like core Markdown's compact list rows: 4px padding and
  // a 2px gap between rows. Lexical puts a nested list in an item of its own
  // after its parent item; that wrapper adds no top padding and no marker,
  // and its 8px top margin plus the parent row's padding give the 12px
  // Markdown leaves between an item's text and its nested list.
  listItem: {
    paddingBlockStart: {
      default: LIST_ITEM_SPACE,
      ':has(ul)': spacingVars['--spacing-0'],
      ':has(ol)': spacingVars['--spacing-0'],
    },
    paddingBlockEnd: LIST_ITEM_SPACE,
    marginBlockStart: {
      default: LIST_ROW_FLUSH,
      ':has(ul)': NESTED_LIST_SPACE,
      ':has(ol)': NESTED_LIST_SPACE,
    },
    marginBlockEnd: {
      default: LIST_ROW_GAP,
      ':last-child': spacingVars['--spacing-0'],
    },
    // Ensure the marker is shown (some CSS resets set list-style: none on li).
    // A task item (TaskCheckboxPlugin marks it) shows a checkbox instead.
    listStyleType: {
      default: 'inherit',
      ':has(ul)': 'none',
      ':has(ol)': 'none',
      ':is([data-richtext-task])': 'none',
    },
    // A task item's text starts 28px in from the list's edge, after core's
    // small checkbox (20px) and its 8px gap, like core Markdown's task lists:
    // the item cancels the list's bullet indent and pads for the checkbox.
    marginInlineStart: {
      default: LIST_ROW_FLUSH,
      ':is([data-richtext-task])': `calc(-1 * ${spacingVars['--spacing-6']})`,
    },
    paddingInlineStart: {
      default: LIST_ROW_FLUSH,
      ':is([data-richtext-task])': `calc(${TASK_BOX_SIZE} + ${spacingVars['--spacing-2']})`,
    },
  },
  link: {
    color: colorVars['--color-text-accent'],
    textDecoration: 'underline',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  textBold: {fontWeight: fontWeightVars['--font-weight-semibold']},
  textItalic: {fontStyle: 'italic'},
  textUnderline: {textDecoration: 'underline'},
  textStrikethrough: {textDecoration: 'line-through'},
  textCode: {
    fontFamily: typographyVars['--font-family-code'],
    backgroundColor: colorVars['--color-background-muted'],
    paddingInline: spacingVars['--spacing-1'],
    borderRadius: radiusVars['--radius-inner'],
  },
  // GFM tables, styled like core Markdown's table: semibold secondary header
  // text, a divider under every row but the last, and a wide table that
  // scrolls inside its own wrapper instead of widening the editor.
  tableScrollableWrapper: {
    overflowX: 'auto',
    maxWidth: '100%',
    // One grid track that may shrink to nothing: the wrapper asks its host
    // for no minimum width, so a grid or flex host never grows to fit a wide
    // table and the wrapper scrolls instead, while a shrink-to-fit host still
    // sizes to the table's natural width.
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    marginBlockStart: {
      default: WIDE_BLOCK_SPACE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: WIDE_BLOCK_SPACE,
      ':last-child': spacingVars['--spacing-0'],
    },
  },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
    // The grid's outer edge, matching core Markdown's table: the row and
    // column lines stop at the table's rim, so without this the top, bottom,
    // and sides stay open. `border-collapse: collapse` merges it with the
    // cell lines into one 1px rule rather than doubling up at the edge.
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
  },
  tableRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: {
      default: colorVars['--color-border'],
      ':last-child': 'transparent',
    },
  },
  tableCell: {
    // Column floors (TableColumnFloorPlugin) size the text box, not the
    // padding, as in core Markdown's tables.
    boxSizing: 'content-box',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
    textAlign: 'start',
    verticalAlign: 'middle',
    overflowWrap: 'break-word',
    // A line on every cell edge, as core Markdown's table draws with
    // `dividers="grid"`. The row lines come from `tableRow`; this is the
    // column half. The last column draws none, so the rim is the `table`
    // rule's own border rather than two lines stacked at the edge — the
    // same rule core `TableCell` follows (`:last-child` → 0).
    borderInlineEndWidth: {
      default: borderVars['--border-width'],
      ':last-child': 0,
    },
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
  },
  tableCellHeader: {
    fontWeight: fontWeightVars['--font-weight-semibold'],
    color: colorVars['--color-text-secondary'],
  },
  // Cells in a table selection — dragging across cells, Shift+arrow between
  // them, or selecting a row or column — are ringed, for the reason
  // `hrSelected` gives: a person has to see what the next keystroke will
  // replace. Lexical names this class on every highlighted cell and takes it
  // off when the selection goes; left unnamed, a cell inside the selection is
  // painted exactly like one outside it.
  //
  // A ring, not a background wash. A wash sits behind the cell's text and
  // eats into its contrast, and no one token stays clear of the field in
  // every theme: `--color-accent-muted` resolves to the field's own colour
  // under Neutral dark, so the selection would be invisible there, and a
  // 10% accent tint drops Neutral dark's header text from 5.65:1 to 4.25:1.
  // The focus ring is drawn for exactly this job — it clears the field by
  // 5.24:1 at worst across every shipped theme and mode — and sits beside
  // the text rather than behind it, so no cell's contrast moves at all.
  // `outline` takes no space, so the document's geometry is untouched
  // (spec:AST-061 FR9), and the inset offset keeps each ring inside its own
  // cell instead of bleeding over the neighbour it is not marking.
  //
  // `RichTextView` and a read-only editor ring a dragged cell selection too:
  // Lexical's table pointer handler does not ask whether the surface is
  // editable, and a person selects cells in a read surface to copy them, so
  // seeing the selection is as right there. Both surfaces draw the same ring
  // and neither moves a block, so they still render the same document the
  // same way.
  tableCellSelected: {
    outlineWidth: focusVars['--focus-outline-width'],
    outlineStyle: focusVars['--focus-outline-style'],
    outlineColor: focusVars['--focus-outline-color'],
    outlineOffset: `calc(-1 * ${focusVars['--focus-outline-width']})`,
  },
  // Thematic breaks, drawn like core Markdown's rule. A rule is a decorator,
  // and Lexical puts a zero-size caret boundary element beside a decorator at
  // either edge of the document, so a rule there is not literally the first
  // or last child; it still takes no outer margin.
  hr: {
    borderWidth: 0,
    borderTopWidth: borderVars['--border-width'],
    borderTopStyle: 'solid',
    borderTopColor: colorVars['--color-border'],
    marginBlockStart: {
      default: RULE_SPACE,
      ':first-child': spacingVars['--spacing-0'],
      ':is([data-lexical-decorator-boundary]:first-child + *)':
        spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: RULE_SPACE,
      ':last-child': spacingVars['--spacing-0'],
      ':has(+ [data-lexical-decorator-boundary]:last-child)':
        spacingVars['--spacing-0'],
    },
  },
  // A selected rule (click, or arrow onto it) or Markdown plugin node (click)
  // shows the focus ring, so users can see what Backspace will delete.
  hrSelected: {
    outlineWidth: focusVars['--focus-outline-width'],
    outlineStyle: focusVars['--focus-outline-style'],
    outlineColor: focusVars['--focus-outline-color'],
    outlineOffset: focusVars['--focus-outline-offset'],
  },
  // Fenced code in core CodeBlock's frame: syntax background, a border, the
  // code type size, and room at the top for the header that
  // CodeBlockHeaderPlugin draws over a block that names its language. Long
  // lines wrap rather than scroll: a scrolling region inside the editable
  // text cannot take keyboard focus of its own, so keyboard users could not
  // scroll it (axe scrollable-region-focusable).
  code: {
    display: 'block',
    fontFamily: typographyVars['--font-family-code'],
    fontSize: typeScaleVars['--text-code-size'],
    lineHeight: typeScaleVars['--text-code-leading'],
    backgroundColor: 'var(--color-syntax-background)',
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    paddingBlockStart: {
      default: CODE_SPACE,
      // Only a block whose header names a language; `plaintext` names none,
      // as in core CodeBlock (CodeBlockHeaderPlugin).
      ':is([data-language]:not([data-language="plaintext"]))':
        CODE_HEADER_SPACE,
    },
    paddingBlockEnd: spacingVars['--spacing-3'],
    paddingInlineStart: spacingVars['--spacing-4'],
    paddingInlineEnd: {
      // Room for the corner copy button CodeBlockHeaderPlugin draws over a
      // block that names no language, so no line runs under it.
      default: CODE_CORNER_SPACE,
      ':is([data-language]:not([data-language="plaintext"]))':
        spacingVars['--spacing-4'],
    },
    // Sized like core Markdown's code frame: as wide as its longest line, at
    // least the prose measure (or the whole width when that is narrower), and
    // never wider than the editor, where long lines wrap.
    boxSizing: 'border-box',
    width: 'fit-content',
    minWidth: `min(${PROSE_MEASURE}, 100%)`,
    maxWidth: '100%',
    marginBlockStart: {
      default: WIDE_BLOCK_SPACE,
      ':first-child': spacingVars['--spacing-0'],
    },
    marginBlockEnd: {
      default: WIDE_BLOCK_SPACE,
      ':last-child': spacingVars['--spacing-0'],
    },
    // Long lines wrap exactly as core CodeBlock's wrapped lines do, so a code
    // block is as tall here as in core Markdown (spec:AST-061 FR5, DEC-9).
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    overflowWrap: 'break-word',
  },
});

/**
 * Builds the Lexical EditorThemeClasses object. Lexical expects plain
 * class-name strings, which `stylex.props(...).className` yields.
 */
export function sharedEditorTheme(): EditorThemeClasses {
  // A class for a block Lexical may mark `dir="auto"`.
  const block = (...styles: Array<stylex.StyleXStyles>): string =>
    stylex.props(...styles, editorTheme.providerDirection).className ?? '';
  const className = (style: stylex.StyleXStyles): string =>
    stylex.props(style).className ?? '';
  return {
    paragraph: block(editorTheme.paragraph),
    // A Markdown plugin's block node is spaced and measured as a paragraph,
    // as core Markdown spaces its block (RichTextExtensionNode reads it).
    markdownExtensionBlock: block(editorTheme.paragraph),
    heading: {
      h1: block(editorTheme.h1),
      h2: block(editorTheme.h2),
      h3: block(editorTheme.h3),
      h4: block(editorTheme.h4),
      h5: block(editorTheme.h5),
      h6: block(editorTheme.h6),
    },
    quote: block(editorTheme.quote),
    list: {
      ul: block(editorTheme.ul),
      ol: block(editorTheme.ol),
      listitem: stylex.props(editorTheme.listItem).className,
      nested: {
        listitem: stylex.props(editorTheme.listItem).className,
      },
      // Lexical picks the class at `depth % 3` (spec:AST-061 DEC-6).
      ulDepth: [
        className(editorTheme.ulMarker0),
        className(editorTheme.ulMarker1),
        className(editorTheme.ulMarker2),
      ],
      olDepth: [
        className(editorTheme.olMarker0),
        className(editorTheme.olMarker1),
        className(editorTheme.olMarker2),
      ],
    },
    link: stylex.props(editorTheme.link).className,
    text: {
      bold: stylex.props(editorTheme.textBold).className,
      italic: stylex.props(editorTheme.textItalic).className,
      underline: stylex.props(editorTheme.textUnderline).className,
      strikethrough: stylex.props(editorTheme.textStrikethrough).className,
      code: stylex.props(editorTheme.textCode).className,
    },
    // The plain class lets CodeSyntaxPlugin's highlight rules find code blocks.
    code: `${block(editorTheme.code)} ${CODE_SYNTAX_CLASS}`,
    hr: stylex.props(editorTheme.hr).className,
    hrSelected: stylex.props(editorTheme.hrSelected).className,
    // MarkdownExtensionsPlugin puts it on a selected plugin node.
    markdownExtensionSelected: stylex.props(editorTheme.hrSelected).className,
    table: block(editorTheme.table),
    // Lexical stamps rows and cells `dir="auto"` too, which would set a cell
    // of English text left-to-right inside a right-to-left document.
    tableRow: block(editorTheme.tableRow),
    tableCell: block(editorTheme.tableCell),
    tableCellHeader: block(editorTheme.tableCellHeader),
    // Added on top of the cell's own class by Lexical while the cell is in a
    // table selection, so it carries no direction of its own.
    tableCellSelected: className(editorTheme.tableCellSelected),
    tableScrollableWrapper: block(editorTheme.tableScrollableWrapper),
  };
}
