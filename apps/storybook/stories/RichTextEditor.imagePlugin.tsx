// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.imagePlugin.tsx
 * @input Uses Lexical's decorator node, command and selection APIs, the
 *   `@lexical/react` composer context with its node-selection and editable
 *   hooks, and Astryx primitives (Button, Dialog, FileInput, SegmentedControl,
 *   Text, TextInput) for the insert dialog and the selected image's controls.
 * @output The playground's image plugin: `ImageNode` with `$createImageNode`,
 *   `$isImageNode` and `IMAGE_NODE_TYPE`; `INSERT_IMAGE_COMMAND`;
 *   `RichTextImagesPlugin`; `InsertImageProvider` with `InsertImageButton`
 *   and `InsertImageDialog`; and `IMAGE_SAMPLES`.
 * @position Storybook-only, for the RichText/RichTextEditor Playground story —
 *   the Astryx counterpart of the Lexical playground's images plugin. Nothing
 *   here lives in `@astryxdesign/richtext`: the node arrives through the
 *   editor's `nodes` prop, the behaviour through its `plugins` slot, and the
 *   insert control through the toolbar's `endContent` slot, so the story
 *   exercises those three extension points exactly as a product would
 *   (spec:AST-061/DEC-8 — a caller extends the editor with Lexical directly).
 *
 * Images are editor content, not Markdown: RichText's default transformer
 * array is internal, and `transformers` replaces it whole rather than
 * extending it, so a caller cannot add an image transformer without giving up
 * tables, task lists and the rest of the dialect. An image therefore reaches
 * the editor state, the HTML export and `RichTextView`, and is absent from the
 * Markdown readout — which the playground says out loud rather than hiding.
 *
 * Stable hooks for browser tests: `data-playground-image` (the figure one
 * image draws), `data-playground-image-handle` (its pointer resize handle) and
 * `data-playground-image-actions` (the keyboard controls of a selected image).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {FileInput} from '@astryxdesign/core/FileInput';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
} from '@astryxdesign/core/Layout';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  colorVars,
  focusVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {useLexicalEditable} from '@lexical/react/useLexicalEditable';
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';
import {
  $createParagraphNode,
  $createRangeSelection,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $insertNodes,
  $isDecoratorNode,
  $isNodeSelection,
  $isRootOrShadowRoot,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  createCommand,
  DecoratorNode,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  mergeRegister,
  PASTE_COMMAND,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';

/* ------------------------------------------------------------------ *
 * Sample images
 * ------------------------------------------------------------------ */

/**
 * The samples are inline SVG data URLs rather than bundled files: the story
 * and its browser specs run with no network, and a data URL also shows what an
 * uploaded file becomes, since `FileReader` hands the plugin the same shape.
 */
function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

export interface ImageSample {
  readonly key: string;
  readonly label: string;
  readonly altText: string;
  readonly src: string;
}

export const IMAGE_SAMPLES: ReadonlyArray<ImageSample> = [
  {
    key: 'landscape',
    label: 'Landscape (640 × 360)',
    altText:
      'An illustration of layered hills under a rising sun, in blues and greens',
    src: svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0064E0"/>
      <stop offset="100%" stop-color="#9BD1FF"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#sky)"/>
  <circle cx="470" cy="118" r="46" fill="#FFD96B"/>
  <path d="M0 268 L150 186 L286 268 Z" fill="#0B6E3E"/>
  <path d="M196 288 L372 164 L556 288 Z" fill="#0D8626"/>
  <path d="M398 300 L540 214 L640 300 Z" fill="#115E3A"/>
  <rect y="286" width="640" height="74" fill="#09441F"/>
</svg>`),
  },
  {
    key: 'swatch',
    label: 'Square swatch (240 × 240)',
    altText: 'A square swatch of concentric rounded squares in warm colours',
    src: svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" role="img">
  <rect width="240" height="240" rx="16" fill="#E9AF08"/>
  <rect x="36" y="36" width="168" height="168" rx="14" fill="#EB6E00"/>
  <rect x="78" y="78" width="84" height="84" rx="12" fill="#E3193B"/>
</svg>`),
  },
];

/* ------------------------------------------------------------------ *
 * The node
 * ------------------------------------------------------------------ */

/** The serialized `type` of an image, for readouts that walk stored state. */
export const IMAGE_NODE_TYPE = 'playground-image';

export interface ImagePayload {
  readonly src: string;
  readonly altText: string;
  /** Rendered width in pixels; `null` is the image's own size. */
  readonly width?: number | null;
}

export type SerializedImageNode = Spread<
  {src: string; altText: string; width: number | null},
  SerializedLexicalNode
>;

const styles = stylex.create({
  // The element `createDOM` makes. An image is an inline decorator, as it is
  // in the Lexical playground, so it can sit in a line of text. The block
  // margin keeps the selection ring off the line above it.
  host: {
    display: 'inline-block',
    maxWidth: '100%',
    verticalAlign: 'bottom',
    marginBlock: spacingVars['--spacing-1'],
  },
  figure: {
    display: 'inline-block',
    position: 'relative',
    margin: 0,
    maxWidth: '100%',
    lineHeight: 0,
  },
  image: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
  },
  // A selected image wears the focus ring, like a selected rule or Markdown
  // plugin node in `editorTheme.ts`: a person has to see what Backspace will
  // delete, and a ring costs the picture nothing.
  selected: {
    outlineWidth: focusVars['--focus-outline-width'],
    outlineStyle: focusVars['--focus-outline-style'],
    outlineColor: focusVars['--focus-outline-color'],
    outlineOffset: focusVars['--focus-outline-offset'],
  },
  handle: {
    position: 'absolute',
    insetInlineEnd: 0,
    insetBlockEnd: 0,
    width: '0.875rem',
    height: '0.875rem',
    // The handle sits on the inline end, which is the image's left edge in a
    // right-to-left document, so the diagonal it drags along flips with it.
    cursor: {
      default: 'nwse-resize',
      ':is([dir="rtl"] *)': 'nesw-resize',
    },
    backgroundColor: colorVars['--color-accent'],
    borderRadius: radiusVars['--radius-inner'],
    touchAction: 'none',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacingVars['--spacing-1'],
    marginBlockStart: spacingVars['--spacing-1'],
    lineHeight: 'normal',
  },
  broken: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    padding: spacingVars['--spacing-3'],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-muted'],
    lineHeight: 'normal',
  },
  preview: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '8rem',
    borderRadius: radiusVars['--radius-container'],
  },
});

function $convertImageElement(element: HTMLElement): DOMConversionOutput {
  const image = element as HTMLImageElement;
  const src = image.getAttribute('src') ?? '';
  if (src === '') {
    return {node: null};
  }
  return {
    node: $createImageNode({
      altText: image.getAttribute('alt') ?? '',
      src,
      width: image.width > 0 ? image.width : null,
    }),
  };
}

export class ImageNode extends DecoratorNode<ReactNode> {
  __src: string;
  __altText: string;
  /** Rendered width in pixels; `null` is the image's own size. */
  __width: number | null;

  static getType(): string {
    return IMAGE_NODE_TYPE;
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__width, node.__key);
  }

  /** Stored state is read defensively, so a damaged node still loads. */
  static importJSON(
    serialized: SerializedLexicalNode & Record<string, unknown>,
  ): ImageNode {
    const {src, altText, width} = serialized;
    return $createImageNode({
      altText: typeof altText === 'string' ? altText : '',
      src: typeof src === 'string' ? src : '',
      width: typeof width === 'number' && width > 0 ? width : null,
    }).updateFromJSON(serialized);
  }

  /** Pasted HTML carrying an `<img>` becomes an image rather than nothing. */
  static importDOM(): DOMConversionMap {
    return {img: () => ({conversion: $convertImageElement, priority: 0})};
  }

  constructor(
    src: string,
    altText: string,
    width: number | null = null,
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width;
  }

  exportJSON(): SerializedImageNode {
    const latest = this.getLatest();
    return {
      ...super.exportJSON(),
      altText: latest.__altText,
      src: latest.__src,
      width: latest.__width,
    };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('img');
    element.setAttribute('src', this.__src);
    element.setAttribute('alt', this.__altText);
    if (this.__width !== null) {
      element.setAttribute('width', String(Math.round(this.__width)));
    }
    return {element};
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('span');
    element.className = stylex.props(styles.host).className ?? '';
    return element;
  }

  updateDOM(): false {
    return false;
  }

  getSrc(): string {
    return this.getLatest().__src;
  }

  getAltText(): string {
    return this.getLatest().__altText;
  }

  getWidth(): number | null {
    return this.getLatest().__width;
  }

  setWidth(width: number | null): this {
    const writable = this.getWritable();
    writable.__width = width;
    return writable;
  }

  setAltText(altText: string): this {
    const writable = this.getWritable();
    writable.__altText = altText;
    return writable;
  }

  /**
   * No text content, as the Lexical playground's image node has none: a data
   * URL is kilobytes long, and the character counter and every plain-text copy
   * would carry it. The consequence is that an image is absent from the
   * Markdown export, which the playground says where the Markdown is read.
   */

  decorate(): ReactNode {
    return (
      <ImageComponent
        altText={this.__altText}
        nodeKey={this.getKey()}
        src={this.__src}
        width={this.__width}
      />
    );
  }
}

export function $createImageNode({
  src,
  altText,
  width = null,
}: ImagePayload): ImageNode {
  return new ImageNode(src, altText, width);
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}

/* ------------------------------------------------------------------ *
 * The rendered image
 * ------------------------------------------------------------------ */

/** Narrower than this and the resize handle covers the picture. */
const MIN_WIDTH = 48;
/** One step of the keyboard size controls. */
const RESIZE_STEP = 1.25;

function ImageComponent({
  src,
  altText,
  width,
  nodeKey,
}: {
  readonly src: string;
  readonly altText: string;
  readonly width: number | null;
  readonly nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const isEditable = useLexicalEditable();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const actionsRef = useRef<HTMLSpanElement | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  // The width being dragged, before it is committed to the node: a resize is
  // one editor update at the end, not one per pointer move.
  const [draggedWidth, setDraggedWidth] = useState<number | null>(null);

  const isActive = isSelected && isEditable;

  const writeWidth = useCallback(
    (next: number | null) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isImageNode(node)) {
          node.setWidth(next === null ? null : Math.round(next));
        }
      });
    },
    [editor, nodeKey],
  );

  const scaleBy = useCallback(
    (factor: number) => {
      const current = imageRef.current?.getBoundingClientRect().width ?? 0;
      writeWidth(Math.max(MIN_WIDTH, current * factor));
    },
    [writeWidth],
  );

  const remove = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      node?.remove();
    });
    editor.focus();
  }, [editor, nodeKey]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      const image = imageRef.current;
      if (image === null) {
        return;
      }
      const startX = event.clientX;
      const startWidth = image.getBoundingClientRect().width;
      // The handle is on the inline end, so in a right-to-left document it is
      // the image's LEFT edge: dragging it outward lowers clientX, and the
      // width has to follow the drag rather than the axis.
      const towardsWider =
        getComputedStyle(handle).direction === 'rtl' ? -1 : 1;
      const widthAt = (clientX: number) =>
        Math.max(MIN_WIDTH, startWidth + (clientX - startX) * towardsWider);
      // The pointer owns the gesture until it is lifted, so a fast drag that
      // leaves the handle still resizes — and still ends.
      handle.setPointerCapture(event.pointerId);
      const onMove = (moveEvent: PointerEvent) => {
        setDraggedWidth(widthAt(moveEvent.clientX));
      };
      const onEnd = (endEvent: PointerEvent) => {
        handle.removeEventListener('pointermove', onMove);
        handle.releasePointerCapture(endEvent.pointerId);
        setDraggedWidth(null);
        writeWidth(widthAt(endEvent.clientX));
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onEnd, {once: true});
      handle.addEventListener('pointercancel', onEnd, {once: true});
    },
    [writeWidth],
  );

  /**
   * Enter, on a selected image, moves focus to its controls. Tab is bound to
   * indentation inside the editor, so without this the controls would be
   * keyboard-unreachable — the same route the Lexical playground gives its
   * caption button. Enter pressed ON a control bubbles back through here, and
   * must be left alone: swallowing it would cancel the button's activation.
   */
  const $onEnter = useCallback(
    (event: KeyboardEvent | null) => {
      const target = event?.target;
      if (target instanceof Node && actionsRef.current?.contains(target)) {
        return false;
      }
      const selection = $getSelection();
      if (
        !$isNodeSelection(selection) ||
        !selection.has(nodeKey) ||
        selection.getNodes().length !== 1
      ) {
        return false;
      }
      const button = actionsRef.current?.querySelector('button');
      if (button == null) {
        return false;
      }
      event?.preventDefault();
      button.focus();
      return true;
    },
    [nodeKey],
  );

  /** Escape, from the controls, goes back to the image in the document. */
  const $onEscape = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        actionsRef.current === null ||
        !actionsRef.current.contains(target)
      ) {
        return false;
      }
      editor.update(() => {
        clearSelection();
        setSelected(true);
        // The root element, not `editor.focus()`: focus has to leave the
        // button this keystroke came from, and the editor already believes it
        // is focused, so its own focus() moves nothing.
        editor.getRootElement()?.focus();
      });
      return true;
    },
    [clearSelection, editor, setSelected],
  );

  const onClick = useCallback(
    (event: MouseEvent) => {
      if (event.target !== imageRef.current) {
        return false;
      }
      if (event.shiftKey) {
        setSelected(!isSelected);
      } else {
        clearSelection();
        setSelected(true);
      }
      return true;
    },
    [clearSelection, isSelected, setSelected],
  );

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
        editor.registerCommand(
          DRAGSTART_COMMAND,
          (event: DragEvent) => {
            // Dragging the image away would have the browser drop a copy of
            // the file back into the document, under the plugin's own drop
            // handler. Cancel the native drag; moving an image is a cut and
            // an insert, which the controls and the editor already do.
            if (event.target !== imageRef.current) {
              return false;
            }
            event.preventDefault();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          $onEnter,
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_ESCAPE_COMMAND,
          $onEscape,
          // Above the editor's own Escape handler, which arms the Tab exit and
          // consumes the key at COMMAND_PRIORITY_LOW. Escape inside these
          // controls means "back to the image", and the editor's own handling
          // is what the fall-through below leaves in place everywhere else.
          COMMAND_PRIORITY_NORMAL,
        ),
      ),
    [$onEnter, $onEscape, editor, onClick],
  );

  if (hasLoadError) {
    return (
      <span {...stylex.props(styles.broken)} data-playground-image="broken">
        <Text type="supporting">
          {altText === ''
            ? 'This image could not be loaded.'
            : `This image could not be loaded: ${altText}`}
        </Text>
        {isEditable && (
          <Button size="sm" label="Remove image" onClick={remove} />
        )}
      </span>
    );
  }

  const renderedWidth = draggedWidth ?? width;
  return (
    <span data-playground-image="">
      <span {...stylex.props(styles.figure)}>
        <img
          alt={altText}
          draggable={false}
          onError={() => setHasLoadError(true)}
          ref={imageRef}
          src={src}
          // A resize is a per-instance pixel width, which is what the node
          // stores; StyleX covers everything about the image that is not it.
          style={renderedWidth === null ? undefined : {width: renderedWidth}}
          {...stylex.props(styles.image, isActive && styles.selected)}
        />
        {isActive && (
          <span
            {...stylex.props(styles.handle)}
            aria-hidden="true"
            data-playground-image-handle=""
            onPointerDown={onPointerDown}
          />
        )}
      </span>
      {isActive && (
        <span
          {...stylex.props(styles.actions)}
          data-playground-image-actions=""
          ref={actionsRef}>
          <Button
            size="sm"
            label="Smaller"
            onClick={() => scaleBy(1 / RESIZE_STEP)}
          />
          <Button
            size="sm"
            label="Larger"
            onClick={() => scaleBy(RESIZE_STEP)}
          />
          <Button
            size="sm"
            label="Reset size"
            onClick={() => writeWidth(null)}
          />
          <Button
            size="sm"
            variant="destructive"
            label="Remove image"
            onClick={remove}
          />
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * The plugin
 * ------------------------------------------------------------------ */

export const INSERT_IMAGE_COMMAND: LexicalCommand<ImagePayload> = createCommand(
  'INSERT_IMAGE_COMMAND',
);

/** Reads the image files out of a paste or a drop, as data URLs. */
function readImageFiles(files: FileList): Promise<ReadonlyArray<ImagePayload>> {
  const images = [...files].filter(file => file.type.startsWith('image/'));
  return Promise.all(
    images.map(
      file =>
        new Promise<ImagePayload>(resolve => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              // A dropped file carries no alt text; its name is the honest
              // placeholder, and the person can say better in the dialog.
              altText: file.name,
              src: typeof reader.result === 'string' ? reader.result : '',
            });
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function hasImageFiles(files: FileList): boolean {
  return [...files].some(file => file.type.startsWith('image/'));
}

/**
 * The document position a pointer event is over, as a DOM range. Lexical's
 * own drop handling does this with `@lexical/clipboard`'s `caretFromPoint`,
 * which is not a Storybook dependency; the two browser APIs it wraps are
 * right here.
 */
function rangeFromPoint(x: number, y: number): Range | null {
  const withCaretPosition = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => {offsetNode: Node; offset: number} | null;
  };
  const position = withCaretPosition.caretPositionFromPoint?.(x, y);
  if (position != null) {
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  const withCaretRange = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  return withCaretRange.caretRangeFromPoint?.(x, y) ?? null;
}

/**
 * Inserts the image files of a paste or a drop. A drop names the point it
 * landed on: this handler consumes `DROP_COMMAND` ahead of the rich-text
 * handler that would have moved the selection there, so it has to move the
 * selection itself, or the image arrives wherever the caret already was.
 */
function insertFiles(
  editor: LexicalEditor,
  files: FileList,
  point?: {readonly x: number; readonly y: number},
): void {
  void readImageFiles(files).then(payloads => {
    const usable = payloads.filter(payload => payload.src !== '');
    if (usable.length === 0) {
      return;
    }
    const range = point ? rangeFromPoint(point.x, point.y) : null;
    if (range !== null) {
      editor.update(() => {
        // A point inside a decorator — the image already in the document, a
        // Markdown plugin node — resolves to no Lexical position at all, and
        // `applyDOMRange` then leaves the fresh selection at the root's
        // offset 0, dropping the file at the top of the document. Land
        // beside the decorator instead, as Lexical's own drop handler does.
        const nearest = $getNearestNodeFromDOMNode(range.startContainer);
        if ($isDecoratorNode(nearest)) {
          const after = nearest.getIndexWithinParent() + 1;
          nearest.getParentOrThrow().select(after, after);
          return;
        }
        const selection = $createRangeSelection();
        selection.applyDOMRange(range);
        $setSelection(selection);
      });
    }
    for (const payload of usable) {
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, payload);
    }
  });
}

/**
 * The editor-side half of the plugin, rendered in `RichTextEditor`'s `plugins`
 * slot: it answers `INSERT_IMAGE_COMMAND`, and takes image files pasted or
 * dropped into the editor.
 */
export function RichTextImagesPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          INSERT_IMAGE_COMMAND,
          payload => {
            const image = $createImageNode(payload);
            $insertNodes([image]);
            // An image is an inline node, so at the top level it needs a
            // paragraph of its own. `@lexical/utils`' `$wrapNodeInElement` is
            // this, and is not a dependency of the Storybook app.
            if ($isRootOrShadowRoot(image.getParentOrThrow())) {
              const paragraph = $createParagraphNode();
              image.replace(paragraph);
              paragraph.append(image);
              paragraph.selectEnd();
            }
            return true;
          },
          COMMAND_PRIORITY_EDITOR,
        ),
        editor.registerCommand(
          DROP_COMMAND,
          (event: DragEvent) => {
            const files = event.dataTransfer?.files;
            if (files == null || !hasImageFiles(files)) {
              return false;
            }
            event.preventDefault();
            insertFiles(editor, files, {x: event.clientX, y: event.clientY});
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          PASTE_COMMAND,
          event => {
            const files =
              event instanceof ClipboardEvent
                ? event.clipboardData?.files
                : undefined;
            if (files == null || !hasImageFiles(files)) {
              return false;
            }
            event.preventDefault();
            insertFiles(editor, files);
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor],
  );

  return null;
}

/* ------------------------------------------------------------------ *
 * The insert control
 * ------------------------------------------------------------------ */

type ImageSource = 'sample' | 'url' | 'file';

/**
 * Whether the insert dialog is open. The button lives in the toolbar's
 * `endContent` and the dialog does NOT: a `Toolbar` is a roving tab stop, so
 * everything inside it is `tabindex="-1"`, and a dialog rendered there cannot
 * be tabbed through at all. `RichTextEditorToolbar` renders its own link
 * dialog as a sibling of the toolbar for the same reason; a consumer-authored
 * control reaches that position through the editor's `plugins` slot, so the
 * two halves are joined by this context rather than by the tree.
 */
const InsertImageContext = createContext<{
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
} | null>(null);

function useInsertImage() {
  const value = useContext(InsertImageContext);
  if (value === null) {
    throw new Error(
      'InsertImageButton and InsertImageDialog need an InsertImageProvider around the editor.',
    );
  }
  return value;
}

/** Holds the dialog's open state for the button and the dialog. */
export function InsertImageProvider({children}: {children: ReactNode}) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo(() => ({isOpen, setIsOpen}), [isOpen]);
  return (
    <InsertImageContext.Provider value={value}>
      {children}
    </InsertImageContext.Provider>
  );
}

/**
 * The toolbar's image button, for the toolbar's public `endContent` slot. It
 * reaches the editor through `useLexicalComposerContext()`, like any
 * consumer-authored control; `InsertImageDialog` goes in the `plugins` slot.
 */
export function InsertImageButton() {
  const isEditable = useLexicalEditable();
  const {isOpen, setIsOpen} = useInsertImage();
  return (
    <Button
      size="sm"
      variant="ghost"
      label="Image"
      isDisabled={!isEditable}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      onClick={() => setIsOpen(true)}
    />
  );
}

/**
 * The insert dialog, for the editor's `plugins` slot — outside the toolbar,
 * so its controls keep their own tab order. Three sources, as the Lexical
 * playground's image dialog has: a sample, a URL, and a file from the machine.
 */
export function InsertImageDialog() {
  const [editor] = useLexicalComposerContext();
  const {isOpen, setIsOpen} = useInsertImage();
  const [source, setSource] = useState<ImageSource>('sample');
  const [sampleKey, setSampleKey] = useState(IMAGE_SAMPLES[0].key);
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileSrc, setFileSrc] = useState('');
  const [altText, setAltText] = useState('');

  const sample =
    IMAGE_SAMPLES.find(entry => entry.key === sampleKey) ?? IMAGE_SAMPLES[0];
  const src =
    source === 'sample' ? sample.src : source === 'url' ? url.trim() : fileSrc;
  const alt =
    altText.trim() !== ''
      ? altText.trim()
      : source === 'sample'
        ? sample.altText
        : source === 'file' && file !== null
          ? file.name
          : '';

  const close = useCallback(() => {
    setIsOpen(false);
    setSource('sample');
    setSampleKey(IMAGE_SAMPLES[0].key);
    setUrl('');
    setFile(null);
    setFileSrc('');
    setAltText('');
  }, []);

  const onFileChange = useCallback((next: File | File[] | null) => {
    const picked = Array.isArray(next) ? (next[0] ?? null) : next;
    setFile(picked);
    if (picked === null) {
      setFileSrc('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setFileSrc(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(picked);
  }, []);

  const insert = useCallback(() => {
    if (src === '') {
      return;
    }
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, {altText: alt, src});
    close();
    // Deferred a frame, as RichTextEditorToolbar defers it for its link
    // dialog: the dialog returns focus to its invoker as it closes, so a
    // `focus()` called before that lands on the toolbar's Image button and
    // the next keystroke reopens the dialog instead of typing.
    requestAnimationFrame(() => editor.focus());
  }, [alt, close, editor, src]);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => (open ? setIsOpen(true) : close())}
      purpose="form"
      width={460}>
      <Layout
        header={
          <DialogHeader
            title="Insert image"
            subtitle="A sample, a URL, or a file from this machine."
            onOpenChange={() => close()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={3}>
              <SegmentedControl
                size="sm"
                label="Image source"
                value={source}
                onChange={value => setSource(value as ImageSource)}>
                <SegmentedControlItem value="sample" label="Sample" />
                <SegmentedControlItem value="url" label="URL" />
                <SegmentedControlItem value="file" label="File" />
              </SegmentedControl>

              {source === 'sample' && (
                <VStack gap={2}>
                  <SegmentedControl
                    size="sm"
                    label="Sample image"
                    layout="fill"
                    value={sampleKey}
                    onChange={setSampleKey}>
                    {IMAGE_SAMPLES.map(entry => (
                      <SegmentedControlItem
                        key={entry.key}
                        value={entry.key}
                        label={entry.label}
                      />
                    ))}
                  </SegmentedControl>
                  <img
                    alt={sample.altText}
                    src={sample.src}
                    {...stylex.props(styles.preview)}
                  />
                </VStack>
              )}

              {source === 'url' && (
                <TextInput
                  size="sm"
                  label="Image URL"
                  description="Any URL the page can load, including a data URL."
                  placeholder="https://example.com/photo.jpg"
                  value={url}
                  onChange={setUrl}
                  hasAutoFocus
                />
              )}

              {source === 'file' && (
                <FileInput
                  label="Image file"
                  description="Read in the browser as a data URL; nothing is uploaded."
                  accept="image/*"
                  mode="dropzone"
                  value={file}
                  onChange={onFileChange}
                />
              )}

              <TextInput
                size="sm"
                label="Alt text"
                description="What the image says, for people who cannot see it."
                placeholder={
                  source === 'sample' ? sample.altText : 'Describe the image'
                }
                value={altText}
                onChange={setAltText}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" onClick={close} />
              <Button
                variant="primary"
                label="Insert image"
                isDisabled={src === ''}
                onClick={insert}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
