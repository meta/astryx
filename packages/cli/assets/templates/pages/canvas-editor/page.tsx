// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Fragment, useCallback, useRef, useState, type SVGProps} from 'react';
import * as stylex from '@stylexjs/stylex';

import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {Divider} from '@astryxdesign/core/Divider';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuDivider,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSubMenu,
} from '@astryxdesign/core/DropdownMenu';
import {Icon, type IconType} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Item} from '@astryxdesign/core/Item';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {List} from '@astryxdesign/core/List';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Popover} from '@astryxdesign/core/Popover';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {Section} from '@astryxdesign/core/Section';
import {Slider} from '@astryxdesign/core/Slider';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';
import {TreeList, type TreeListItemData} from '@astryxdesign/core/TreeList';
import {useContainerReveal} from '@astryxdesign/core/hooks';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {
  Aperture,
  ArrowDownToLine,
  ArrowUpToLine,
  Baseline,
  CaseLower,
  CaseSensitive,
  CaseUpper,
  Contrast,
  Download,
  // Aliased: a bare `File` would shadow the DOM type the image picker reads.
  File as FileIcon,
  FlipHorizontal2,
  FlipVertical2,
  FoldVertical,
  Frame,
  Grip,
  Group,
  Image as ImageIcon,
  Italic,
  Lock,
  LockOpen,
  Menu,
  Minus,
  PanelBottom,
  PanelLeft,
  PanelLeftRightDashed,
  PanelRight,
  PanelTopBottomDashed,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Scan,
  SquareSquare,
  SquareRoundCorner,
  Strikethrough,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  // The angle mark for the Rotation field. Not `Angle`: that landed in
  // lucide after the version this repo pins, and a template has to build
  // against the pack the consumer actually gets.
  TriangleRight,
  Type,
  Underline,
  Undo2,
  X,
} from 'lucide-react';

// =============================================================================
// Canvas editor theme
// =============================================================================

/**
 * The template keeps its visual overrides in one theme. The artboard is artwork,
 * not app chrome, so that theme is mounted around it with a heavy condensed
 * display face, poster-scale type, and a light palette pinned with `mode="light"`
 * so the poster holds when the editor goes dark.
 *
 * The theme owns what belongs to the poster as a whole — the face, the
 * leading, the uppercase treatment, the frame margins. Per-layer size and
 * tracking are not here: those belong to a layer, and the inspector edits
 * them.
 *
 * Sizes here are artboard pixels, not screen pixels. The artboard always lays
 * out at its native 1080 x 1920 and the zoom control scales the whole frame,
 * so these stay the numbers a designer would type into the inspector.
 */
const canvasEditorTheme = defineTheme({
  name: 'canvas-editor',
  typography: {
    // Anton is the reference face. It and the fallbacks are all single-weight
    // blacks, so display-1 stays at weight 400 and the poster needs no
    // webfont. Order matters: Impact outranks Arial Narrow because Arial
    // Narrow at 400 renders thin, which reads nothing like a poster.
    heading: {
      family: 'Anton',
      fallbacks: 'Haettenschweiler, Impact, "Arial Narrow", sans-serif',
    },
  },
  tokens: {
    '--text-display-1-leading': '1.02',
    // The two spacing steps the poster lockup uses: the frame margin and the
    // gap under the eyebrow.
    '--spacing-6': '56px',
    '--spacing-3': '24px',
  },
  components: {
    heading: {'type:display-1': {textTransform: 'uppercase'}},
    text: {'type:supporting': {textTransform: 'uppercase'}},
    // The hue rail is a Slider whose track is the only custom paint. Keeping
    // the override in this template's one theme avoids a component-only theme;
    // the theme is mounted narrowly where the hue control and poster need it.
    'slider-track': {
      base: {
        backgroundImage:
          'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
      },
    },
  },
});

// =============================================================================
// Document
// =============================================================================

/** Artboard size in design pixels — a 9:16 social poster. */
const FRAME = {width: 1080, height: 1920};

/**
 * Every icon on this page is 16px.
 *
 * Icon's own scale runs 12/16/20/24, and a page that mixes them reads as
 * drift rather than hierarchy: the rail's layer marks, the inspector's
 * buttons, and the canvas tools are all the same rank of thing. Button sizes
 * its icon slot to 16px at `sm` and `md`, so this is also the size that fits
 * the slot exactly instead of being scaled into it.
 */
const ICON = 'sm' as const;

/**
 * Width of the inspector's label column, in pixels.
 *
 * Wide enough for the longest label the panel uses at the label type size,
 * which is what puts every control on a single left edge.
 */
const LABEL_COLUMN = 80;

/**
 * Widest a document tab is allowed to get, in pixels.
 *
 * A ceiling rather than a fixed width: it holds the longest seeded name with
 * its close showing, and tabs fall below it as the strip fills or the window
 * narrows.
 */
const TAB_MAX_WIDTH = 164;

/**
 * Room the tab strip leaves for the rest of the header, in pixels.
 *
 * Covers the menu button ahead of the strip, the save note and Export button
 * after it, and the bar's own gutters. Generous rather than exact: too small
 * and the strip crowds Export, too large and it gives up room it could have
 * spent on tabs.
 */
const TAB_STRIP_RESERVE = 320;

/**
 * Width below which the inspector is folded away.
 *
 * It is the wider of the two panels and the one whose absence costs least:
 * you can still see the artwork and pick layers without it. Set where the
 * canvas would otherwise be squeezed under the artboard's own width.
 */
const HIDE_INSPECTOR = '@media (max-width: 1099.98px)';

/**
 * Width below which the layer rail folds away too.
 *
 * Later than the inspector, since knowing what is on the canvas survives
 * longer than being able to adjust it.
 */
const HIDE_RAIL = '@media (max-width: 839.98px)';

const PHOTO_LAYER_SRC = '/template-assets/moody-scene-vertical-1.png';

type LayerKind = 'text' | 'image';

/** What the Appearance submenu sets on the editor chrome. */
type ThemeMode = 'light' | 'dark' | 'system';

/** The menubar's menus, left to right. */
/** Horizontal and vertical placement of a text layer inside its box. */
type AlignX = 'start' | 'center' | 'end' | 'justify';
type AlignY = 'start' | 'center' | 'end';
type Decoration = 'none' | 'underline' | 'line-through';
type Transform = 'none' | 'capitalize' | 'uppercase' | 'lowercase';

/**
 * The nine CSS filters the image inspector exposes, in the order they are
 * listed there. Kept as one record so a layer carries a single `filters`
 * object and the artboard can build a `filter` string by walking it, rather
 * than nine optional fields that every read has to spell out.
 */
interface Filters {
  blur: number;
  brightness: number;
  contrast: number;
  grayscale: number;
  hue: number;
  invert: number;
  opacity: number;
  saturate: number;
  sepia: number;
}

/** A drop shadow, in the four numbers the shadow popover edits. */
interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /**
   * Padding is two numbers, not one: a poster's inset is almost never square,
   * and a single field makes the common case — wide margins, tight leading
   * above and below — impossible to express without opening a per-side
   * editor. Inline is the left/right pair, block the top/bottom, matching the
   * axis names CSS uses for the same thing.
   */
  paddingInline: number;
  paddingBlock: number;
  radius: number;
  isLocked: boolean;
  /** Copy for a text layer; the alt text for an image layer. */
  content: string;
  /** Undefined means the slot is empty and the field shows its placeholder. */
  border?: string;
  fill?: string;
  /** The shadow cast by the layer's box. */
  shadow?: Shadow;
  /** Type settings. Only text layers carry them, and only they show them. */
  family?: string;
  weight?: string;
  color?: string;
  size?: number;
  line?: number;
  tracking?: number;
  alignX?: AlignX;
  alignY?: AlignY;
  isItalic?: boolean;
  decoration?: Decoration;
  transform?: Transform;
  /**
   * The shadow cast by the glyphs, which is a different property from the
   * one in Styles: that one is the box's, this one is the type's, and a
   * layer can carry both.
   */
  textShadow?: Shadow;
  stroke?: number;
  /** Image settings. Only image layers carry them. */
  fit?: string;
  filters?: Filters;
}

const NO_SHADOW: Shadow = {x: 0, y: 0, blur: 0, spread: 0, color: '#000000'};

const NO_FILTERS: Filters = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hue: 0,
  invert: 0,
  opacity: 100,
  saturate: 100,
  sepia: 0,
};

/** An open document in the strip above the menubar. */
interface DocumentTabData {
  id: string;
  name: string;
  icon: IconType;
}

// Every tab carries the same mark: varying it per document would imply a
// distinction the editor does not make, and a strip of mixed glyphs is harder
// to scan than a strip of one. A tab stands for an open file, so the file mark
// is the literal one; the frame mark belongs to the layer groups, where it
// names an actual container.
const INITIAL_TABS: DocumentTabData[] = [
  {id: 'poster', name: 'Salzburg poster', icon: FileIcon},
  {id: 'brand', name: 'Brand sheet', icon: FileIcon},
  {id: 'draft', name: 'Untitled draft', icon: FileIcon},
];

const INITIAL_LAYERS: Layer[] = [
  {
    id: 'headline',
    name: 'Headline',
    kind: 'text',
    x: 56,
    y: 136,
    width: 968,
    height: 300,
    rotation: 0,
    paddingInline: 0,
    paddingBlock: 0,
    radius: 0,
    isLocked: false,
    content: 'A weekend in Salzburg',
    fill: '#111111',
    family: 'Anton',
    weight: 'Regular',
    color: '#111111',
    size: 112,
    line: 100,
    tracking: -2,
    alignX: 'start',
    alignY: 'start',
    isItalic: false,
    decoration: 'none',
    transform: 'uppercase',
    stroke: 0,
  },
  {
    id: 'dateline',
    name: 'Dateline',
    kind: 'text',
    x: 56,
    y: 56,
    width: 968,
    height: 56,
    rotation: 0,
    paddingInline: 0,
    paddingBlock: 0,
    radius: 0,
    isLocked: false,
    content: 'March 14–16 · Austria',
    family: 'Inter Tight',
    weight: 'Medium',
    color: '#111111',
    size: 26,
    line: 120,
    tracking: 32,
    alignX: 'center',
    alignY: 'start',
    isItalic: false,
    decoration: 'none',
    transform: 'uppercase',
    stroke: 0,
  },
  {
    id: 'photo',
    name: 'Photo',
    kind: 'image',
    x: 0,
    y: 0,
    width: 1080,
    height: 1920,
    rotation: 0,
    paddingInline: 0,
    paddingBlock: 0,
    radius: 0,
    isLocked: true,
    content: 'The Salzach river and old town rooftops at dusk',
    fit: 'Cover',
    filters: NO_FILTERS,
  },
];

const LAYER_ICON = {text: Type, image: ImageIcon} as const;

/** The inspector's vertical alignment, in the words a Stack uses for it. */
const V_ALIGN = {start: 'start', center: 'center', end: 'end'} as const;

// =============================================================================
// Field glyphs
// =============================================================================

/**
 * Draws a letterform sized to the icon grid.
 *
 * A design tool names a numeric field from inside it — the X sits in the box
 * with the number, not in a segment bolted to its edge — so the row reads as
 * one control. That is the input's start-icon slot, which takes an SVG
 * component; Lucide ships no letterforms, so these are drawn on the same 24px
 * grid Lucide uses. They inherit `currentColor` and the slot's sizing, so a
 * letter and an icon are interchangeable in the same position.
 */
function glyph(char: string): IconType {
  const Glyph = (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...props}>
      <text
        x={12}
        y={12}
        fill="currentColor"
        // Two-letter glyphs get the smaller size so both fit the same box.
        fontSize={char.length > 1 ? 13 : 17}
        fontWeight={500}
        textAnchor="middle"
        dominantBaseline="central">
        {char}
      </text>
    </svg>
  );
  Glyph.displayName = `Glyph(${char})`;
  return Glyph;
}

/**
 * Built once at module scope so each glyph keeps a stable component identity.
 *
 * Only the axis fields are lettered. A letter is the right mark when the
 * field names a *dimension* a reader already has a letter for — X, Y, W, H
 * are how the value is written down anyway. Where the pack has a drawing of
 * the thing being set (an angle, a pair of insets, a rounded corner), the
 * drawing says it in one glance and the letter makes you translate.
 */
const GLYPH = {
  x: glyph('X'),
  y: glyph('Y'),
  width: glyph('W'),
  height: glyph('H'),
} as const;

/**
 * Each preset carries its own icon. A library where every row shows the same
 * glyph is a list you have to read word by word; distinct marks let the eye
 * find the row it wants.
 */
const EFFECT_PRESETS: {label: string; icon: IconType}[] = [
  {label: 'Grain overlay', icon: Aperture},
  {label: 'Halftone', icon: Grip},
  {label: 'Duotone teal', icon: Contrast},
];

/**
 * The icon-only segmented rows in the text inspector. Each entry keeps its
 * spoken label next to its glyph, because `isLabelHidden` hides the text but
 * still needs it for the accessible name.
 */
const ALIGN_X: {value: AlignX; label: string; icon: IconType}[] = [
  {value: 'start', label: 'Align left', icon: TextAlignStart},
  {value: 'center', label: 'Align centre', icon: TextAlignCenter},
  {value: 'end', label: 'Align right', icon: TextAlignEnd},
  {value: 'justify', label: 'Justify', icon: TextAlignJustify},
];

const ALIGN_Y: {value: AlignY; label: string; icon: IconType}[] = [
  {value: 'start', label: 'Align top', icon: ArrowUpToLine},
  {value: 'center', label: 'Align middle', icon: FoldVertical},
  {value: 'end', label: 'Align bottom', icon: ArrowDownToLine},
];

const DECORATIONS: {value: Decoration; label: string; icon: IconType}[] = [
  {value: 'none', label: 'No decoration', icon: CaseSensitive},
  {value: 'underline', label: 'Underline', icon: Underline},
  {value: 'line-through', label: 'Strikethrough', icon: Strikethrough},
];

const TRANSFORMS: {value: Transform; label: string; icon: IconType}[] = [
  {value: 'none', label: 'As typed', icon: Minus},
  {value: 'capitalize', label: 'Capitalise', icon: CaseSensitive},
  {value: 'uppercase', label: 'Uppercase', icon: CaseUpper},
  {value: 'lowercase', label: 'Lowercase', icon: CaseLower},
];

/**
 * The nine image filters, with the range and unit each one is stated in.
 * `max` is what the slider runs to rather than what CSS allows — brightness
 * and saturate go past 200%, but a rail that reaches 500 spends most of its
 * travel somewhere nobody drags to.
 */
const FILTERS: {
  key: keyof Filters;
  label: string;
  max: number;
  unit: string;
}[] = [
  {key: 'blur', label: 'Blur', max: 20, unit: 'px'},
  {key: 'brightness', label: 'Brightness', max: 200, unit: '%'},
  {key: 'contrast', label: 'Contrast', max: 200, unit: '%'},
  {key: 'grayscale', label: 'Grayscale', max: 100, unit: '%'},
  {key: 'hue', label: 'Hue', max: 360, unit: 'deg'},
  {key: 'invert', label: 'Invert', max: 100, unit: '%'},
  {key: 'opacity', label: 'Opacity', max: 100, unit: '%'},
  {key: 'saturate', label: 'Saturate', max: 200, unit: '%'},
  {key: 'sepia', label: 'Sepia', max: 100, unit: '%'},
];

const ZOOM_OPTIONS = [
  {value: '0.25', label: '25%'},
  {value: '0.4', label: '40%'},
  {value: '0.6', label: '60%'},
  {value: '1', label: '100%'},
];

const FONT_OPTIONS = ['Anton', 'Archivo Black', 'Bebas Neue', 'Inter Tight'];
const WEIGHT_OPTIONS = ['Regular', 'Medium', 'Semibold', 'Bold'];

/** What the Insert submenu can add to the artboard. */
const INSERT_ITEMS: {label: string; icon: IconType}[] = [
  {label: 'Frame', icon: Frame},
  {label: 'Group', icon: Group},
  {label: 'Text', icon: Type},
  {label: 'Image', icon: ImageIcon},
];

/** Written once: the Export button and the File menu offer the same three. */
const EXPORT_FORMATS = [
  'PNG · 1080 × 1920',
  'JPG · 1080 × 1920',
  'PDF · print ready',
];

const EXPORT_MENU = EXPORT_FORMATS.map(label => ({label}));

// =============================================================================
// Colour
// =============================================================================

/** A colour as the picker holds it: hue 0–360, saturation and value 0–100. */
interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * The picker thinks in HSV because that is the shape of its two controls — a
 * hue rail and a saturation/value plane — while every value it reads and
 * writes is a hex string. These convert between the two.
 */
function hsvToHex({h, s, v}: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    const value =
      (v / 100) * (1 - (s / 100) * Math.max(0, Math.min(k, 4 - k, 1)));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}

function hexToHsv(hex: string): Hsv {
  const parsed = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!parsed) {
    return {h: 0, s: 0, v: 0};
  }
  const int = parseInt(parsed[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const span = max - Math.min(r, g, b);
  let h = 0;
  if (span !== 0) {
    if (max === r) {
      h = ((g - b) / span) % 6;
    } else if (max === g) {
      h = (b - r) / span + 2;
    } else {
      h = (r - g) / span + 4;
    }
  }
  return {
    h: (Math.round(h * 60) + 360) % 360,
    s: max === 0 ? 0 : Math.round((span / max) * 100),
    v: Math.round(max * 100),
  };
}

/**
 * Drag tracking for the saturation/value plane, which is the one control
 * here that has to be painted: it is two axes at once, and no slider is.
 * Reports the pointer as a fraction of the element on press and for as long
 * as the drag lasts.
 *
 * Pointer capture is what makes the drag survive leaving the element: a fast
 * diagonal out of the plane keeps tracking instead of stopping dead at the
 * edge, which is the difference between a picker that feels attached to the
 * cursor and one that keeps dropping it.
 */
function usePointerTrack(onTrack: (x: number, y: number) => void) {
  const read = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      onTrack(
        Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
        Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
      );
    },
    [onTrack],
  );
  return {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      read(event);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        read(event);
      }
    },
  };
}

/**
 * Builds the `filter` shorthand from the nine values the inspector edits.
 *
 * Only the ones that are off their neutral point are emitted: a filter list
 * of nine no-op functions still forces the image onto its own composited
 * layer, and a poster that is only ever blurred should not pay for the other
 * eight.
 */
function filterCss(filters: Filters): string {
  const parts = [
    ['blur', filters.blur, 0, 'px'],
    ['brightness', filters.brightness, 100, '%'],
    ['contrast', filters.contrast, 100, '%'],
    ['grayscale', filters.grayscale, 0, '%'],
    ['hue-rotate', filters.hue, 0, 'deg'],
    ['invert', filters.invert, 0, '%'],
    ['opacity', filters.opacity, 100, '%'],
    ['saturate', filters.saturate, 100, '%'],
    ['sepia', filters.sepia, 0, '%'],
  ] as const;
  const active = parts
    .filter(([, value, neutral]) => value !== neutral)
    .map(([name, value, , unit]) => `${name}(${value}${unit})`);
  return active.length > 0 ? active.join(' ') : 'none';
}

/** `text-shadow` takes no spread, so a text layer's shadow drops it. */
function shadowCss(shadow: Shadow | undefined): string {
  return shadow
    ? `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color}`
    : 'none';
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  // Zoom the way a design tool does: lay the artboard out once at its native
  // size and scale the painted result. Type and spacing stay in artboard
  // pixels, and the poster gets no reflow between zoom steps.
  artboard: (scale: number) => ({
    width: FRAME.width,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
  }),
  // Type the inspector owns. Size and tracking can't be theme tokens: they
  // belong to a layer, not to the poster, and they change per keystroke.
  // Tracking is a percentage of the type size, the way a design tool states
  // it, so it holds when the size changes.
  type: (
    size: number,
    tracking: number,
    line: number,
    color: string,
    stroke: number,
    shadow: string,
  ) => ({
    fontSize: `${size}px`,
    letterSpacing: `${tracking / 100}em`,
    lineHeight: `${line}%`,
    color,
    WebkitTextStrokeWidth: stroke > 0 ? `${stroke}px` : null,
    WebkitTextStrokeColor: stroke > 0 ? color : null,
    textShadow: shadow,
  }),
  // AspectRatio's `fit` stretches every direct child to fill the box, so a
  // second one would flow below the photo and clip. Taking the text layers
  // out of flow is what stacks them over it, the way they sit on an artboard.
  textLayers: {position: 'absolute', inset: 0},
  // A Card given a height prop turns into a scroll container, which is the
  // right default for a card holding more copy than fits. This one is a
  // viewport onto an artboard that is deliberately larger than its frame —
  // the artboard lays out at 1080 wide at every zoom step and the frame
  // scales it — so it clips instead. `clip` over `hidden`: nothing here
  // should scroll, including the quiet scroll that focusing a clipped child
  // would otherwise cause.
  artboardFrame: {overflow: 'clip'},
  // The canvas pans in both axes, which centring normally breaks.
  //
  // A scroll port that centres with `justify-content`/`align-items` has no
  // scrollable overflow on the *start* side: once the artboard is bigger than
  // the port, its top-left is pushed out and nothing can scroll back to it.
  // Auto margins centre the same way while leaving that overflow reachable —
  // when there is spare room they split it, and when there is none they
  // resolve to zero instead of pushing.
  //
  // The stage sizes to whichever is larger, the port or the artboard, so the
  // scrollbars describe the artboard rather than the port.
  // The one part HStack has no prop for; the rest of the stage — the flex
  // box, the max-content sizing and the 100% floor on the block axis — says
  // itself in props.
  canvasStage: {minWidth: '100%'},
  artboardCentered: {margin: 'auto'},
  // Concentric corners. The card rounds to --radius-container and holds one
  // spacing step of padding, so the controls inside it round to the
  // difference: an inner corner struck from the same centre as the outer one
  // rather than a rounder curve cutting across it. Stated as the subtraction
  // so it still holds if either token moves.
  toolBarControl: {
    borderRadius: 'calc(var(--radius-container) - var(--spacing-1))',
  },
  // The trailing control is a ghost, so edge compensation pulls it out to the
  // card's edge to optically align its label. That is the right call when the
  // control is the only thing in a container, but here it leaves the bar with
  // a gutter on the left and none on the right. Putting the step back matches
  // the two ends. It rides on the control itself rather than a wrapper — a
  // div whose only job is one margin is a div the control can absorb.
  toolBarTrailing: {
    marginInlineEnd: 'var(--spacing-2)',
  },
  // A vertical Divider is `height: 100%`, and a flex row that centres its
  // items gives a percentage height nothing to resolve against — the rule
  // collapses to nothing and the tool bar loses its groups. Stretching the
  // item is what gives it a height; the inset then pulls it back off the
  // buttons so it separates them rather than boxing them in.
  toolBarRule: {
    alignSelf: 'stretch',
    height: 'auto',
    marginBlock: 'var(--spacing-1)',
  },
  // Give the header bar its own inline padding, so the Export button stops
  // at a margin instead of the window edge.
  //
  // The layout under it is set to zero padding — the panels have to reach
  // the edges — and a Toolbar takes its inline padding from whatever
  // container it sits in, so it inherits that zero. The fix has to arrive as
  // Section's padding token rather than as `paddingInline`: Section renders
  // an outer wrapper that escapes its parent's gutter and an inner one that
  // holds the padding, xstyle lands on the outer, and padding set there
  // makes the bar bleed 12px past the window rather than inset its contents.
  // The token is read on the inner element, where it also republishes
  // --container-padding-inline-*. That second effect is the one that
  // matters: it feeds the toolbar's edge compensation, which pulls ghost
  // triggers back out by their own padding so the menu button's *icon* lines
  // up on the gutter while its hover box still bleeds into it.
  headerBar: {
    // Named so the tab strip can size against the bar rather than the window:
    // cqw tracks this element, so it stays right if the bar ever stops being
    // full-bleed, and it excludes a scrollbar the way vw does not.
    containerType: 'inline-size',
    containerName: 'editor-header',
  },
  // The menu, the tabs and the add button. It has to be allowed to shrink or
  // the strip's own ceiling never binds — a flex item defaults to min-width
  // auto, which floors it at the tabs' combined width.
  headerLead: {
    minWidth: 0,
  },
  // The open-document strip above the menubar. It scrolls rather than wraps:
  // a second row of tabs would move the menubar down, and the whole point of
  // the strip is that the chrome above the canvas has a fixed height.
  tabStrip: {
    minWidth: 0,
    flexShrink: 1,
    // The strip has to cap itself, which is the one thing HStack's maxWidth
    // cannot say for it. It sits in Toolbar's start slot, and that slot is
    // not the one built to give way — only the centre slot carries
    // `min-width: 0`, so a start slot grows to its content and pushes the bar
    // wider instead of squeezing. Widening the start slot in core would
    // change every toolbar's behaviour to suit one page's tab strip, so the
    // cap arrives as a maxWidth prop and this only has to let it shrink.
    //
    // The strip is short enough that a scrollbar would eat most of it, and
    // the tabs are draggable-looking targets already.
    scrollbarWidth: 'none',
  },
  // Folded by width, not by the View menu's toggles. Those record what the
  // user asked for; this records whether there is room to honour it, so the
  // panel comes back on its own when the window grows rather than leaving
  // the toggle switched off. Applied to the handle as well as the panel, or
  // a grip is left behind on a seam with nothing on the other side.
  foldsAtRail: {display: {default: null, [HIDE_RAIL]: 'none'}},
  foldsAtInspector: {display: {default: null, [HIDE_INSPECTOR]: 'none'}},
  // A short rule, not a full-height one: the strip has no columns to divide,
  // it only needs the smallest mark that reads as "these are separate tabs".
  // A vertical Divider takes its height from the row unless given one, and a
  // centred 16px keeps it clear of both the tab fill and the bar's own edges.
  tabRule: {height: 16, alignSelf: 'center', flexShrink: 0},
  tabRuleHidden: {visibility: 'hidden'},
  // Everything a tab needs beyond an Item: a width ceiling and a tighter
  // measure. Item brings the 28px box, the radius, the fill when selected,
  // the inline padding, and the ellipsis on a string label.
  tab: {
    // Item spaces a list row, where 8px either side of the label is right
    // because the rows are stacked and the eye reads down a column. A tab is
    // read across, and at this ceiling those three 8px channels cost the
    // name six characters: "Salzburg poster" needs 102px and would get 96.
    // Back to the measure the strip had before, which clears it with 2px
    // spare — the close end tighter still, because a bare 20px icon carries
    // its own inset and an equal gap there reads as a wider one.
    gap: 'var(--spacing-1-5)',
    paddingInlineEnd: 'var(--spacing-1)',
    // A width the tab is allowed to shrink under, which makes it a ceiling:
    // it never grows, so it sits at this size until something squeezes it.
    // It has to be `width` and not `flexBasis` — a basis does not raise an
    // item's max-content contribution, so the strip above would size itself
    // to the tabs' *content* and then squeeze them back under their basis,
    // leaving every tab short even with the bar half empty.
    flexGrow: 0,
    flexShrink: 1,
    width: TAB_MAX_WIDTH,
    // A floor, so a crowded strip scrolls instead of grinding every tab down
    // to an unreadable sliver. Enough for the mark, a few characters and the
    // close; past it the strip's own overflow takes over.
    minWidth: 96,
  },
  // Item marks a selected row with --color-accent-muted, which this editor's
  // theme resolves to #262626 in dark — the exact colour of the header bar
  // the strip sits on, so the open document would read as no document at
  // all. The muted background is a step off the bar in both schemes, and it
  // is the fill hover already uses, so selection and hover agree.
  tabSelected: {backgroundColor: 'var(--color-background-muted)'},
  // Item paints a fill when selected but leaves hover to the list that owns
  // it, and the strip is not a list. The tab is a target on its own, so it
  // answers the pointer itself.
  tabHover: {
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  // Hold the label column at its set width. The fields beside it carry the
  // flex min-width reset, so without this the row spends its shrinkage on
  // whichever item gives way first and each label ends up a different width —
  // which is exactly the shared left edge the panel is built around.
  labelColumn: {flexShrink: 0},
  // An action nested *inside* a row, as opposed to one standing beside a
  // field. This is the only place a control drops below the 28px the rest
  // of the panel aligns to.
  //
  // It has to: the smallest IconButton is 28px, which is the whole row's
  // height budget once compact density adds its 4px above and below, so a
  // rail of 28px rows cannot hold a 28px button. Hence a bare button — no
  // painted box, no size floor, just a hit area around the icon. It stays a
  // <button> because the lock is a real action that has to remain
  // keyboard-reachable; it was the Button *component's* minimum that had to
  // go, not the element.
  itemAction: {
    // A full 28px button laid out as 20px. The row is 28px with a step of
    // padding, so a control its own height would push it to 36; pulling that
    // same step off every edge hands the padding back to the layout. The
    // glyph does not move — centred in a 28px box that now starts a step
    // early, it lands exactly where a 20px button would have put it — but
    // the target it sits in is the full 28px the pointer expects.
    //
    // Stated against the row's own padding token rather than as -4px, so the
    // two cannot drift apart.
    margin: 'calc(-1 * var(--spacing-1))',
    // Icon tokens, not the text ones a ghost Button reaches for. The two
    // agree at the theme root but this editor's theme separates them, and a
    // lock keyed to the text ramp came out darker than the layer glyphs
    // sitting beside it on the same row.
    color: {
      default: 'var(--color-icon-secondary)',
      ':hover': 'var(--color-icon-primary)',
      ':disabled': 'var(--color-icon-disabled)',
    },
  },
  // The colour chip that opens a picker. Square at the field's own height
  // and rounded to the field's own corner, so it reads as another control
  // on the row rather than a tile dropped beside one. --radius-element is
  // the token an input rounds to; --radius-inner is a step tighter and
  // reads as a different family at this size.
  swatch: {
    width: 'var(--spacing-7)',
    height: 'var(--spacing-7)',
    flexShrink: 0,
    padding: 0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    borderRadius: 'var(--radius-element)',
    cursor: 'pointer',
    // A chip for an unset slot reads as empty rather than as black.
    backgroundImage:
      'linear-gradient(45deg, transparent 45%, var(--color-border-emphasized) 45% 55%, transparent 55%)',
  },
  swatchFilled: {backgroundImage: 'none'},
  // The saturation/value plane. White runs left to right and black bottom to
  // top over the pure hue, so every point in the square is one colour at
  // that hue.
  plane: {
    position: 'relative',
    height: 160,
    borderRadius: 'var(--radius-inner)',
    backgroundImage:
      'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
    cursor: 'crosshair',
    touchAction: 'none',
  },
  // Both thumbs are positioned by their centre, so the translate is what
  // keeps them on the value rather than beside it.
  thumb: {
    position: 'absolute',
    width: 'var(--spacing-3)',
    height: 'var(--spacing-3)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#fff',
    borderRadius: 'var(--radius-full)',
    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.35)',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  planeStack: {display: 'grid', gap: 'var(--spacing-3)'},
  // Filter rows put the slider beside the number rather than under it, so
  // nine of them still read as one column.
  //
  // The slider takes the fill and the number trails it at a fixed width: the
  // slider is the control being used and the number is the read-out, so the
  // draggable track gets the room. Fixed rather than hugging, so nine
  // read-outs share one right edge instead of stepping in and out as their
  // values change width.
  filterValue: {flexShrink: 0, width: 64},
  // Thumbnail ships at 64px for media grids; here it is a control sitting in
  // a row of 28px controls, so it takes the same box as the colour swatches.
  // Width alone is enough — the picture is kept square by an aspect ratio.
  sourceThumbnail: {width: 'var(--spacing-7)'},
});

/**
 * The enumerable half of a text layer's styling. These are closed sets, so
 * they compile to static classes picked by key rather than to a custom
 * property set at runtime.
 */
const typeCase = stylex.create({
  none: {textTransform: 'none'},
  capitalize: {textTransform: 'capitalize'},
  uppercase: {textTransform: 'uppercase'},
  lowercase: {textTransform: 'lowercase'},
});

const typeLine = stylex.create({
  none: {textDecorationLine: 'none'},
  underline: {textDecorationLine: 'underline'},
  'line-through': {textDecorationLine: 'line-through'},
});

const typeSlant = stylex.create({
  normal: {fontStyle: 'normal'},
  italic: {fontStyle: 'italic'},
});

const typeAlign = stylex.create({
  start: {textAlign: 'start'},
  center: {textAlign: 'center'},
  end: {textAlign: 'end'},
  justify: {textAlign: 'justify'},
});

/** Runtime values the painted controls need, kept out of the static sheet. */
const paint = stylex.create({
  photo: (filter: string) => ({filter}),
  hue: (h: number) => ({backgroundColor: `hsl(${h} 100% 50%)`}),
  planeThumb: (s: number, v: number) => ({
    insetInlineStart: `${s}%`,
    insetBlockStart: `${100 - v}%`,
  }),
  fill: (color: string) => ({backgroundColor: color}),
});

// =============================================================================
// Panel building blocks
// =============================================================================

/**
 * One inspector row: a fixed label column, then the controls for it.
 *
 * The label column is a set width rather than intrinsic so that every control
 * in the panel starts on the same vertical line, whatever its label is
 * called. That shared edge is what lets the eye run down the column and
 * compare values instead of hunting for each field.
 */
function InspectorRow({
  label,
  hAlign,
  labelWidth = LABEL_COLUMN,
  children,
}: {
  label: string;
  /** Set to "end" for a row of bare buttons, which have no field to fill. */
  hAlign?: 'start' | 'end';
  /** Narrower inside a popover, where the panel's column would not fit. */
  labelWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <HStack gap={2} vAlign="center">
      <HStack width={labelWidth} xstyle={styles.labelColumn}>
        <Text type="label" color="secondary" maxLines={1}>
          {label}
        </Text>
      </HStack>
      <StackItem size="fill">
        <HStack gap={1} vAlign="center" hAlign={hAlign}>
          {children}
        </HStack>
      </StackItem>
    </HStack>
  );
}

/** A numeric field that names itself from inside, like X 40. */
function AxisInput({
  icon,
  label,
  value,
  onChange,
}: {
  icon: IconType;
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <StackItem size="fill">
      <NumberInput
        label={label}
        isLabelHidden
        startIcon={icon}
        size="sm"
        value={value}
        onChange={onChange}
        isWheelEnabled={false}
      />
    </StackItem>
  );
}

/**
 * A numeric row with the steppers showing. Size, line height and letter
 * spacing get them because they are values you arrive at by nudging rather
 * than by typing a number you already know.
 */
function StepperRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <InspectorRow label={label}>
      <StackItem size="fill">
        <NumberInput
          label={label}
          isLabelHidden
          size="sm"
          hasNumberSteppers
          value={value}
          onChange={onChange}
          isWheelEnabled={false}
        />
      </StackItem>
    </InspectorRow>
  );
}

/**
 * One image filter: the number and the rail that drags it.
 *
 * Both are wired to the same value, which is the point — you drag to find
 * the look and read the number to reproduce it, and nine of these read as
 * one column because the rail is fixed-width instead of filling.
 */
function FilterRow({
  filter,
  value,
  onChange,
}: {
  filter: (typeof FILTERS)[number];
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <InspectorRow label={filter.label}>
      <StackItem size="fill">
        <Slider
          label={`${filter.label} slider`}
          isLabelHidden
          min={0}
          max={filter.max}
          value={value}
          onChange={onChange}
          valueDisplay="none"
        />
      </StackItem>
      <NumberInput
        label={filter.label}
        isLabelHidden
        size="sm"
        min={0}
        max={filter.max}
        value={value}
        onChange={onChange}
        isWheelEnabled={false}
        controlXstyle={styles.filterValue}
      />
    </InspectorRow>
  );
}

/** An inspector group: a caption, its rows, and a closing divider. */
function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    // The panel itself stays at zero padding and each section carries the
    // gutter instead. That is what keeps the rules between sections running
    // edge to edge: pad the panel and every divider insets by the gutter,
    // turning a full-bleed rule into a floating line.
    <Section padding={3} dividers={['bottom']}>
      <VStack gap={3}>
        <Text type="label" weight="semibold">
          {title}
        </Text>
        {children}
      </VStack>
    </Section>
  );
}

/**
 * An action nested inside a list row: an icon you can click, not a button
 * with an icon in it.
 *
 * This is the exception, not the pattern. An action standing beside a field
 * uses `IconButton size="sm"`, so its 28px box lines up with the input's
 * and the row reads as one band. Only an action *inside* a 28px row shrinks,
 * because the row has no space for a control its own height. See
 * `styles.itemAction`.
 */
function ItemAction({
  label,
  icon,
  isDisabled,
  onClick,
  xstyle,
  className,
  style,
}: {
  label: string;
  icon: IconType;
  isDisabled?: boolean;
  onClick?: () => void;
  xstyle?: stylex.StyleXStyles;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <IconButton
      label={label}
      // No tooltip. These sit in 28px rows, and a bubble opening off one
      // covers the row above it — a lot of chrome for a padlock and an ×
      // that already say what they do. `label` still names them for anyone
      // reading the rail through assistive tech.
      icon={<Icon icon={icon} size={ICON} />}
      variant="ghost"
      size="sm"
      isDisabled={isDisabled}
      onClick={onClick}
      xstyle={[styles.itemAction, xstyle]}
      className={className}
      style={style}
    />
  );
}

/**
 * One open document in the strip above the menubar.
 *
 * An open document is the same kind of thing as a layer: a name with a mark
 * in front of it and an action behind, which is why this is the same Item
 * the rail is built from rather than a tab. Item ellipsizes a string label
 * on its own, so the width ceiling below is the only thing left to say, and
 * it ignores a click that lands on a nested button — that is what stops the
 * close from also switching to the document it is closing.
 *
 * Not TabList: a Tab marks the open one with an underline rather than a
 * fill, sizes itself to its label with no way to cap it from out here, and
 * keeps both of those in spans an xstyle cannot reach.
 *
 * The close follows the same rule as the layer rail's lock: hidden until the
 * tab is hovered or holds focus, and pinned open on the active tab, which is
 * the one whose close a user reaches for. Because it only fades, the tab does
 * not change width when the control arrives.
 */
function DocumentTab({
  tab,
  isActive,
  onSelect,
  onClose,
}: {
  tab: DocumentTabData;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const {getContainerProps, getContentRevealProps} = useContainerReveal();

  return (
    <Item
      label={tab.name}
      density="compact"
      isSelected={isActive}
      onClick={onSelect}
      aria-current={isActive ? 'true' : undefined}
      {...getContainerProps()}
      startContent={
        <Icon
          icon={tab.icon}
          size={ICON}
          color={isActive ? 'primary' : 'secondary'}
        />
      }
      endContent={
        <ItemAction
          label={`Close ${tab.name}`}
          icon={X}
          onClick={onClose}
          {...getContentRevealProps({
            forceVisibility: isActive ? 'shown' : undefined,
          })}
        />
      }
      // Both fills land after Item's own, which is what lets the selected one
      // be replaced; they stay mutually exclusive so hover cannot erase it.
      xstyle={[styles.tab, isActive ? styles.tabSelected : styles.tabHover]}
    />
  );
}

/**
 * The saturation/value plane, the hue rail, and the hex field, which are the
 * three ways the same colour gets said.
 *
 * The plane and the rail are painted rather than composed: a two-dimensional
 * gradient and a rainbow track are not controls the system ships, and a
 * Slider styled into a hue rail would still only give one of the two axes.
 * They carry `role="slider"` with arrow keys so the picker is not
 * pointer-only, and the hex field is the exact route for anyone who already
 * knows the value.
 *
 * HSV lives here rather than on the layer. A layer stores a hex string —
 * that is what the artboard paints — but hex has no hue to slide once the
 * colour reaches black or white, so the picker keeps the HSV it is working
 * in for as long as it is open.
 */
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [draft, setDraft] = useState(value);

  const commit = useCallback(
    (next: Hsv) => {
      setHsv(next);
      const hex = hsvToHex(next);
      setDraft(hex);
      onChange(hex);
    },
    [onChange],
  );

  const planeTrack = usePointerTrack(
    useCallback(
      (x, y) =>
        commit({...hsv, s: Math.round(x * 100), v: Math.round(100 - y * 100)}),
      [commit, hsv],
    ),
  );
  /** Arrow keys on the plane: left/right saturate, up/down brighten. */
  const nudge = (event: React.KeyboardEvent) => {
    const sign =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    if (sign === 0) {
      return;
    }
    event.preventDefault();
    const horizontal = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
    const clamp = (n: number) => Math.min(100, Math.max(0, n));
    commit({
      h: hsv.h,
      s: clamp(hsv.s + (horizontal ? sign * 2 : 0)),
      v: clamp(hsv.v + (horizontal ? 0 : sign * 2)),
    });
  };

  return (
    <div {...stylex.props(styles.planeStack)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuetext={`${hsv.s}% saturation, ${hsv.v}% brightness`}
        aria-valuenow={hsv.s}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={nudge}
        {...planeTrack}
        {...stylex.props(styles.plane, paint.hue(hsv.h))}>
        <span
          {...stylex.props(
            styles.thumb,
            paint.planeThumb(hsv.s, hsv.v),
            paint.fill(hsvToHex(hsv)),
          )}
        />
      </div>
      {/* The hue rail is a real Slider with its track repainted, not a
      hand-rolled one: the rainbow is the only thing about it that is not
      already a Slider, and `slider-track` is a theming target. The template's
      one custom theme is mounted narrowly here so the nine filter sliders in
      the same panel keep the plain track they should have. */}
      <Theme theme={canvasEditorTheme}>
        <Slider
          label="Hue"
          isLabelHidden
          min={0}
          max={360}
          value={hsv.h}
          // Annotated because Slider's props are a union of the single and
          // range forms, and with no `value` tuple to discriminate on there is
          // nothing for the parameter to infer from.
          onChange={(h: number) => commit({...hsv, h})}
          valueDisplay="none"
        />
      </Theme>
      <TextInput
        label="Hex"
        isLabelHidden
        size="sm"
        value={draft}
        onChange={next => {
          setDraft(next);
          if (/^#?[\da-f]{6}$/i.test(next.trim())) {
            setHsv(hexToHsv(next));
            onChange(next.startsWith('#') ? next : `#${next}`);
          }
        }}
      />
    </div>
  );
}

/**
 * The chip that opens a picker. Twenty pixels square, so a row carrying one
 * still measures 28.
 */
function Swatch({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value?: string;
  onChange: (next: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <Popover
      label={label}
      placement="start"
      alignment="start"
      width={248}
      content={
        <VStack gap={3}>
          <Text type="label" weight="semibold">
            {label}
          </Text>
          <ColorPicker value={value ?? '#ffffff'} onChange={onChange} />
          {children}
        </VStack>
      }>
      <button
        type="button"
        aria-label={`${label}${value ? `, ${value}` : ', not set'}`}
        {...stylex.props(
          styles.swatch,
          value != null && styles.swatchFilled,
          value != null && paint.fill(value),
        )}
      />
    </Popover>
  );
}

/**
 * A menu shortcut, printed the way a desktop menu prints one: quiet
 * secondary text set hard against the menu's right edge.
 *
 * `Kbd` paints one key cap per key, so `⌘` and `N` arrive as two small
 * objects sitting beside the item. A shortcut is a hint about the item, not
 * a control on it, so it reads better as one dim string that the eye can
 * skip.
 *
 * The glyphs are literal because platform detection is core's, not a
 * template's — `Kbd` resolves `mod` to ⌘ or Ctrl through an internal util
 * that is deliberately unexported. These read as macOS, as they do in the
 * shell-nav template.
 */
function Shortcut({children}: {children: string}) {
  return (
    <Text type="supporting" color="secondary">
      {children}
    </Text>
  );
}

/**
 * One row of the layer rail: an icon, the layer's name, and a lock.
 *
 * The lock is an action on the row, so it stays out of the way until the row
 * is the one being pointed at — the rail reads as a list of names, and the
 * control arrives where the cursor already is. A locked row is the exception:
 * it shows the closed lock at rest, because that is a fact about the layer
 * rather than an action being offered.
 */
/**
 * The layer rail as a tree, grouped by what each layer is.
 *
 * A poster's layers are not a flat list — the two text layers belong together
 * and the images belong together — and a tree says so structurally rather
 * than by sorting and hoping the reader infers it. It also buys collapse: a
 * document with thirty layers is navigable when the groups fold.
 *
 * Built as data rather than rows because TreeList owns the disclosure state,
 * the guide lines and the roving focus that a hand-rolled tree would have to
 * reimplement. The per-row pieces still come through the content slots, so
 * the lock keeps its hover reveal.
 */
function layerTree(
  layers: Layer[],
  selectedID: string,
  onSelect: (id: string) => void,
  onToggleLock: (id: string) => void,
  reveal: ReturnType<typeof useContainerReveal>,
): TreeListItemData[] {
  const row = (layer: Layer): TreeListItemData => ({
    id: layer.id,
    label: layer.name,
    isSelected: layer.id === selectedID,
    onClick: () => onSelect(layer.id),
    // The hook owns both sides of the reveal. TreeList forwards the complete
    // container props to this row, including the inline custom properties that
    // isolate nested reveal containers.
    ...reveal.getContainerProps(),
    startContent: (
      <Icon icon={LAYER_ICON[layer.kind]} size={ICON} color="secondary" />
    ),
    endContent: (
      <ItemAction
        label={layer.isLocked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
        icon={layer.isLocked ? Lock : LockOpen}
        onClick={() => onToggleLock(layer.id)}
        {...reveal.getContentRevealProps({
          forceVisibility: layer.isLocked ? 'shown' : undefined,
        })}
      />
    ),
  });

  const groups: {id: string; label: string; kind: LayerKind}[] = [
    {id: 'group-text', label: 'Text', kind: 'text'},
    {id: 'group-images', label: 'Images', kind: 'image'},
  ];

  // A group with nothing in it is a disclosure that opens onto nothing, so it
  // does not get drawn.
  return groups
    .map(group => ({
      id: group.id,
      label: group.label,
      isExpanded: true,
      // A group is a frame, not a bigger version of what it holds. Repeating
      // the child's glyph on the parent says the row is another layer of that
      // kind; the frame mark says it is the container.
      startContent: <Icon icon={Frame} size={ICON} color="secondary" />,
      children: layers.filter(l => l.kind === group.kind).map(row),
    }))
    .filter(group => group.children.length > 0);
}

/**
 * A style slot that is either unset or carries a value: a field led by the
 * slot's own icon, and a clear that only lights up once the slot holds
 * something.
 *
 * The icon is a prop rather than one shared swatch. Border, shadow and fill
 * are three different properties, and giving them one icon makes the column
 * read as three copies of the same control.
 */
function StyleRow({
  label,
  name = label,
  value,
  placeholder,
  onChange,
  onClear,
  children,
}: {
  label: string;
  /**
   * What the row's controls are called, when that has to differ from what
   * the row is captioned. A text layer carries two shadows — its box's and
   * its type's — and both are captioned "Shadow" because the section
   * heading above each already says which. Screen reader users get no such
   * heading with the control, so they get the longer name instead.
   */
  name?: string;
  value?: string;
  placeholder: string;
  onChange: (next: string) => void;
  onClear: () => void;
  /** Extra controls for the popover, e.g. a shadow's offset and blur. */
  children?: React.ReactNode;
}) {
  return (
    <InspectorRow label={label}>
      <StackItem size="fill">
        <TextInput
          label={name}
          isLabelHidden
          size="sm"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={onChange}
        />
      </StackItem>
      <Swatch label={name} value={value} onChange={onChange}>
        {children}
      </Swatch>
      <IconButton
        label={`Clear ${name.toLowerCase()}`}
        tooltip="Clear"
        size="sm"
        variant="ghost"
        isDisabled={value === undefined}
        onClick={onClear}
        icon={<Icon icon={X} size={ICON} />}
      />
    </InspectorRow>
  );
}

/**
 * The four numbers a shadow has beyond its colour. They live in the same
 * popover as the colour because a shadow is one thing to set, not five.
 */
function ShadowFields({
  name,
  shadow,
  onChange,
}: {
  /** Prefixes each field, so two shadows on one layer stay tellable apart. */
  name: string;
  shadow: Shadow;
  onChange: (next: Shadow) => void;
}) {
  const field = (key: 'x' | 'y' | 'blur' | 'spread', label: string) => (
    <InspectorRow label={label} labelWidth={56}>
      <StackItem size="fill">
        <NumberInput
          label={`${name} ${label.toLowerCase()}`}
          isLabelHidden
          size="sm"
          hasNumberSteppers
          value={shadow[key]}
          onChange={next => onChange({...shadow, [key]: next})}
          isWheelEnabled={false}
        />
      </StackItem>
    </InspectorRow>
  );
  return (
    <VStack gap={2}>
      {field('x', 'X')}
      {field('y', 'Y')}
      {field('blur', 'Blur')}
      {field('spread', 'Spread')}
    </VStack>
  );
}

// =============================================================================
// Page
// =============================================================================

export default function CanvasEditor() {
  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [selectedID, setSelectedID] = useState('headline');
  const [panel, setPanel] = useState('layers');
  const [zoom, setZoom] = useState('0.4');

  // The picker is presentational here: a template has no upload endpoint to
  // post to, and swapping the artboard for a local object URL would leave the
  // page showing something the template does not ship. Naming the chosen file
  // is the honest middle — the control demonstrably works, and nothing
  // pretends to have been uploaded.
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageName, setImageName] = useState('Image');
  // What the View submenu toggles. A design tool trades chrome for canvas, so
  // these drive the real Layout slots rather than standing in for them.
  const [chrome, setChrome] = useState({
    left: true,
    right: true,
    toolbar: true,
  });
  const [appearance, setAppearance] = useState<ThemeMode>('system');
  const [tabs, setTabs] = useState(INITIAL_TABS);
  const [activeTab, setActiveTab] = useState(INITIAL_TABS[0].id);
  const layerReveal = useContainerReveal();
  // Only used to name new tabs, so it counts documents opened rather than
  // documents open — reusing "Untitled 2" after closing one would be worse.
  const untitledCount = useRef(1);

  // Closing the open document has to hand the strip a new one, and the
  // neighbour is the least surprising choice: the tab that slides under the
  // pointer is the one that takes over. Closing the last tab leaves the strip
  // empty rather than inventing a document nobody asked for.
  const closeTab = (id: string) => {
    setTabs(current => {
      const index = current.findIndex(tab => tab.id === id);
      const next = current.filter(tab => tab.id !== id);
      if (id === activeTab) {
        const neighbour = next[index] ?? next[index - 1];
        setActiveTab(neighbour ? neighbour.id : '');
      }
      return next;
    });
  };

  const addTab = () => {
    untitledCount.current += 1;
    const tab: DocumentTabData = {
      id: `untitled-${untitledCount.current}`,
      name: `Untitled ${untitledCount.current}`,
      icon: FileIcon,
    };
    setTabs(current => [...current, tab]);
    setActiveTab(tab.id);
  };

  // Both rails are drag-sized. The floors are the width each panel stops
  // being useful below — the rail at the point layer names start truncating,
  // the inspector at the point its two-field rows stop fitting side by side —
  // and the ceilings keep either from eating the canvas they exist to serve.
  const rail = useResizable({defaultSize: 216, minSize: 176, maxSize: 320});
  const inspector = useResizable({
    defaultSize: 288,
    minSize: 264,
    maxSize: 400,
  });

  const selected = layers.find(layer => layer.id === selectedID) ?? layers[0];
  const scale = Number(zoom);

  const updateSelected = useCallback(
    (patch: Partial<Layer>) => {
      setLayers(current =>
        current.map(layer =>
          layer.id === selectedID ? {...layer, ...patch} : layer,
        ),
      );
    },
    [selectedID],
  );

  const [headline, dateline] = layers.filter(layer => layer.kind === 'text');
  const photo = layers.filter(layer => layer.kind === 'image')[0];

  return (
    // Appearance drives a Theme around the whole editor, and that Theme needs
    // a surface of its own. Panels and toolbars are transparent, so without
    // one they keep showing the host page's background while their text takes
    // the new mode's colour — light text on a light page. The Section paints
    // the mode's own background, which is what makes the editor consistent.
    <Theme theme={neutralTheme} mode={appearance}>
      <Section variant="section" padding={0} height="100%">
        <Layout
          height="fill"
          padding={0}
          header={
            // Not a Toolbar. A toolbar is a set of peer commands that arrow
            // keys walk across, and the document tabs make that wrong twice
            // over: arrowing off a tab lands on its own close button, and a
            // strip of documents is not a band of tools. This is the header
            // slot of the layout it heads, which is what LayoutHeader is.
            <LayoutHeader
              hasDivider
              // 4px on every edge. A toolbar's padding is sized for a band
              // heading content, and app chrome wants to sit tighter: the
              // strip inside carries its own 4px around a 28px tab. It also
              // lands the menu button on the inset a ghost trigger wants, so
              // nothing has to be pulled back out again.
              padding={1}
              xstyle={styles.headerBar}>
              <HStack gap={0.5} vAlign="center" hAlign="between">
                <HStack gap={0.5} vAlign="center" xstyle={styles.headerLead}>
                  {/*
                    One button for every command in the editor, the way a
                    single-window design tool does it. A menubar spends the
                    top-left on five words that are only read when someone is
                    already looking for a command; folding them into submenus
                    hands that space to the tabs, which are read constantly.
                    The commands keep their grouping — the bar became the
                    first level of the menu rather than disappearing.
                  */}
                  <DropdownMenu
                    button={{
                      label: 'Menu',
                      tooltip: 'Menu',
                      variant: 'ghost',
                      size: 'sm',
                      isIconOnly: true,
                      icon: <Icon icon={Menu} size={ICON} />,
                    }}
                    hasChevron={false}
                    // Left to itself the menu matches its trigger, and the
                    // trigger is a 28px icon button — five one-word rows in a
                    // column barely wider than the words. A set width gives
                    // the submenu chevrons somewhere to sit at the far edge,
                    // which is what makes the rows read as a menu bar folded
                    // into a list rather than a stack of buttons.
                    menuWidth={280}>
                    <DropdownMenuSubMenu label="File">
                      <DropdownMenuItem
                        label="New poster"
                        endContent={<Shortcut>⌘N</Shortcut>}
                      />
                      <DropdownMenuItem
                        label="Open…"
                        endContent={<Shortcut>⌘O</Shortcut>}
                      />
                      <DropdownMenuDivider />
                      <DropdownMenuItem
                        label="Save"
                        endContent={<Shortcut>⌘S</Shortcut>}
                      />
                      <DropdownMenuItem
                        label="Save as…"
                        endContent={<Shortcut>⇧⌘S</Shortcut>}
                      />
                      <DropdownMenuSubMenu label="Export">
                        {EXPORT_FORMATS.map(format => (
                          <DropdownMenuItem key={format} label={format} />
                        ))}
                      </DropdownMenuSubMenu>
                      <DropdownMenuDivider />
                      <DropdownMenuItem
                        label="Close"
                        endContent={<Shortcut>⌘W</Shortcut>}
                      />
                    </DropdownMenuSubMenu>

                    <DropdownMenuSubMenu label="Edit">
                      <DropdownMenuItem
                        label="Undo"
                        endContent={<Shortcut>⌘Z</Shortcut>}
                      />
                      <DropdownMenuItem
                        label="Redo"
                        endContent={<Shortcut>⇧⌘Z</Shortcut>}
                      />
                      <DropdownMenuDivider />
                      <DropdownMenuItem
                        label="Cut"
                        endContent={<Shortcut>⌘X</Shortcut>}
                      />
                      <DropdownMenuItem
                        label="Copy"
                        endContent={<Shortcut>⌘C</Shortcut>}
                      />
                      <DropdownMenuItem
                        label="Paste"
                        endContent={<Shortcut>⌘V</Shortcut>}
                      />
                      <DropdownMenuDivider />
                      <DropdownMenuItem
                        label="Duplicate"
                        endContent={<Shortcut>⌘D</Shortcut>}
                      />
                      {/* Named, because a menu opened from the bar has lost
                    sight of the rail: the row that would go is worth saying
                    out loud before a destructive item is clicked. */}
                      <DropdownMenuItem
                        label={`Delete ${selected.name}`}
                        variant="destructive"
                        endContent={<Shortcut>⌫</Shortcut>}
                      />
                    </DropdownMenuSubMenu>

                    {/* Checkbox rows, not actions: each reports a state the
                  user can see on the page, and the menu stays open so all
                  three can be set in one visit. */}
                    <DropdownMenuSubMenu label="View">
                      <DropdownMenuCheckboxItem
                        label="Left panel"
                        icon={PanelLeft}
                        endContent={<Shortcut>⌘B</Shortcut>}
                        value={chrome.left}
                        onChange={next => setChrome(c => ({...c, left: next}))}
                      />
                      <DropdownMenuCheckboxItem
                        label="Right panel"
                        icon={PanelRight}
                        endContent={<Shortcut>⇧⌘B</Shortcut>}
                        value={chrome.right}
                        onChange={next => setChrome(c => ({...c, right: next}))}
                      />
                      <DropdownMenuCheckboxItem
                        label="Canvas tools"
                        icon={PanelBottom}
                        endContent={<Shortcut>⌘.</Shortcut>}
                        value={chrome.toolbar}
                        onChange={next =>
                          setChrome(c => ({...c, toolbar: next}))
                        }
                      />
                      <DropdownMenuDivider />
                      {/* The same value the tool bar's zoom control holds, so
                    setting it in either place moves the other. */}
                      <DropdownMenuSubMenu label="Zoom">
                        <DropdownMenuRadioGroup
                          label="Zoom"
                          value={zoom}
                          onChange={setZoom}>
                          {ZOOM_OPTIONS.map(option => (
                            <DropdownMenuRadioItem
                              key={option.value}
                              value={option.value}
                              label={option.label}
                            />
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubMenu>
                      <DropdownMenuSubMenu label="Appearance">
                        <DropdownMenuRadioGroup
                          label="Appearance"
                          value={appearance}
                          onChange={next => setAppearance(next as ThemeMode)}>
                          <DropdownMenuRadioItem value="light" label="Light" />
                          <DropdownMenuRadioItem value="dark" label="Dark" />
                          <DropdownMenuRadioItem
                            value="system"
                            label="System"
                          />
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubMenu>
                    </DropdownMenuSubMenu>

                    <DropdownMenuSubMenu label="Object">
                      <DropdownMenuSubMenu label="Insert">
                        {INSERT_ITEMS.map(item => (
                          <DropdownMenuItem
                            key={item.label}
                            label={item.label}
                            icon={item.icon}
                          />
                        ))}
                      </DropdownMenuSubMenu>
                      <DropdownMenuDivider />
                      <DropdownMenuItem
                        label="Bring forward"
                        endContent={<Shortcut>⌘]</Shortcut>}
                      />
                      <DropdownMenuItem
                        label="Send backward"
                        endContent={<Shortcut>⌘[</Shortcut>}
                      />
                      <DropdownMenuDivider />
                      {/* The lock the rail row reveals on hover, reached from
                    the menubar instead — one piece of state, two ways in. */}
                      <DropdownMenuCheckboxItem
                        label={`Lock ${selected.name}`}
                        icon={selected.isLocked ? Lock : LockOpen}
                        endContent={<Shortcut>⇧⌘L</Shortcut>}
                        value={selected.isLocked}
                        onChange={next => updateSelected({isLocked: next})}
                      />
                    </DropdownMenuSubMenu>

                    <DropdownMenuDivider />

                    <DropdownMenuSubMenu label="Help">
                      <DropdownMenuItem
                        label="Keyboard shortcuts"
                        endContent={<Shortcut>⌘/</Shortcut>}
                      />
                      <DropdownMenuItem label="Documentation" />
                      <DropdownMenuDivider />
                      <DropdownMenuItem label="About this editor" />
                    </DropdownMenuSubMenu>
                  </DropdownMenu>

                  {/*
                    A group, not a nav landmark: a landmark inside a
                    role="toolbar" is not a place a screen reader expects one,
                    and the toolbar already is the region. The group gives the
                    strip a name, and each tab says whether it is the open
                    document with aria-current.
                  */}
                  <HStack
                    role="group"
                    aria-label="Open documents"
                    gap={0}
                    vAlign="center"
                    paddingInline={2}
                    paddingBlock={1}
                    isScrollable
                    maxWidth={`calc(100cqw - ${TAB_STRIP_RESERVE}px)`}
                    xstyle={styles.tabStrip}>
                    {tabs.map((tab, index) => {
                      // Tabs are all one width, so the rule marks a boundary
                      // rather than sitting midway between two labels. It is
                      // dropped either side of the open document: that tab
                      // already reads as separate by its fill, and a rule
                      // running into the fill's rounded edge only crowds it.
                      // Hidden rather than unmounted, so moving the selection
                      // does not add or remove a flex item and slide the whole
                      // strip sideways under the pointer that just clicked it.
                      const previous = tabs[index - 1];
                      const isRuleHidden =
                        previous?.id === activeTab || tab.id === activeTab;
                      return (
                        <Fragment key={tab.id}>
                          {previous != null ? (
                            <Divider
                              orientation="vertical"
                              xstyle={[
                                styles.tabRule,
                                isRuleHidden && styles.tabRuleHidden,
                              ]}
                            />
                          ) : null}
                          <DocumentTab
                            tab={tab}
                            isActive={tab.id === activeTab}
                            onSelect={() => setActiveTab(tab.id)}
                            onClose={() => closeTab(tab.id)}
                          />
                        </Fragment>
                      );
                    })}
                  </HStack>
                  {/*
                    Outside the strip on both counts: it is not one of the
                    open documents the group is named for, and inside a strip
                    that scrolls once the tabs stop fitting it would be the
                    first thing to scroll out of reach — exactly when adding
                    a document is most likely to be what you came for.
                  */}
                  <IconButton
                    label="New document"
                    tooltip="New document"
                    variant="ghost"
                    size="sm"
                    onClick={addTab}
                    icon={<Icon icon={Plus} size={ICON} color="secondary" />}
                  />
                </HStack>
                <HStack gap={3} vAlign="center">
                  <Text type="supporting" color="secondary">
                    Saved · 2 min ago
                  </Text>
                  <DropdownMenu
                    button={{
                      label: 'Export',
                      variant: 'ghost',
                      size: 'sm',
                      icon: <Icon icon={Download} size={ICON} />,
                    }}
                    alignment="end"
                    items={EXPORT_MENU}
                  />
                </HStack>
              </HStack>
            </LayoutHeader>
          }
          content={
            <LayoutContent padding={0}>
              <Layout
                height="fill"
                start={
                  chrome.left ? (
                    <>
                      <LayoutPanel
                        resizable={rail.props}
                        hasDivider
                        padding={2}
                        label="Layers and assets"
                        xstyle={styles.foldsAtRail}>
                        <VStack gap={3}>
                          <SegmentedControl
                            label="Left panel"
                            size="sm"
                            layout="fill"
                            value={panel}
                            onChange={setPanel}>
                            <SegmentedControlItem
                              label="Layers"
                              value="layers"
                            />
                            <SegmentedControlItem
                              label="Library"
                              value="library"
                            />
                          </SegmentedControl>
                          {panel === 'layers' ? (
                            <TreeList
                              density="compact"
                              items={layerTree(
                                layers,
                                selectedID,
                                setSelectedID,
                                id =>
                                  setLayers(current =>
                                    current.map(l =>
                                      l.id === id
                                        ? {...l, isLocked: !l.isLocked}
                                        : l,
                                    ),
                                  ),
                                layerReveal,
                              )}
                            />
                          ) : (
                            <List>
                              {EFFECT_PRESETS.map(preset => (
                                <Item
                                  key={preset.label}
                                  as="li"
                                  density="compact"
                                  label={preset.label}
                                  startContent={
                                    <Icon
                                      icon={preset.icon}
                                      size={ICON}
                                      color="secondary"
                                    />
                                  }
                                />
                              ))}
                            </List>
                          )}
                        </VStack>
                      </LayoutPanel>
                      {/* The panel draws the separator, so the handle stays
                    divider-less and keeps its grip hidden until the pointer
                    is on the seam. */}
                      <ResizeHandle
                        resizable={rail.props}
                        isAlwaysVisible={false}
                        // Centred on the seam rather than pushed onto the
                        // content side: the grip marks the edge it moves, and
                        // an offset pill points at a boundary that is not
                        // where the drag actually happens.
                        pillPlacement="center"
                        label="Resize layers panel"
                        xstyle={styles.foldsAtRail}
                      />
                    </>
                  ) : undefined
                }
                content={
                  <LayoutContent padding={0}>
                    <Section variant="muted" padding={0} height="100%">
                      <Layout
                        height="fill"
                        // Lifts the tool bar off the bottom edge: the footer
                        // reads this as its outer padding, so the bar floats
                        // over the backdrop rather than sitting on the sill.
                        padding={4}
                        content={
                          <LayoutContent padding={6}>
                            <HStack
                              width="max-content"
                              height="max-content"
                              minHeight="100%"
                              xstyle={styles.canvasStage}>
                              <Card
                                padding={0}
                                elevation="med"
                                width={FRAME.width * scale}
                                height={FRAME.height * scale}
                                xstyle={[
                                  styles.artboardFrame,
                                  styles.artboardCentered,
                                ]}>
                                <Theme theme={canvasEditorTheme} mode="light">
                                  <AspectRatio
                                    ratio={FRAME.width / FRAME.height}
                                    fit="cover"
                                    xstyle={styles.artboard(scale)}>
                                    <img
                                      src={PHOTO_LAYER_SRC}
                                      alt={photo.content}
                                      {...stylex.props(
                                        paint.photo(
                                          filterCss(
                                            photo.filters ?? NO_FILTERS,
                                          ),
                                        ),
                                      )}
                                    />
                                    {/* Both text layers share one column, so
                                    vertical alignment is a property of the
                                    column and the headline speaks for it. */}
                                    <VStack
                                      padding={6}
                                      gap={3}
                                      vAlign={
                                        V_ALIGN[headline.alignY ?? 'start']
                                      }
                                      xstyle={styles.textLayers}>
                                      <Text
                                        type="supporting"
                                        display="block"
                                        xstyle={[
                                          styles.type(
                                            dateline.size ?? 0,
                                            dateline.tracking ?? 0,
                                            dateline.line ?? 100,
                                            dateline.color ?? '#111111',
                                            dateline.stroke ?? 0,
                                            shadowCss(dateline.textShadow),
                                          ),
                                          typeAlign[dateline.alignX ?? 'start'],
                                          typeCase[
                                            dateline.transform ?? 'none'
                                          ],
                                          typeLine[
                                            dateline.decoration ?? 'none'
                                          ],
                                          typeSlant[
                                            dateline.isItalic
                                              ? 'italic'
                                              : 'normal'
                                          ],
                                        ]}>
                                        {dateline.content}
                                      </Text>
                                      <Heading
                                        level={2}
                                        type="display-1"
                                        textWrap="balance"
                                        xstyle={[
                                          styles.type(
                                            headline.size ?? 0,
                                            headline.tracking ?? 0,
                                            headline.line ?? 100,
                                            headline.color ?? '#111111',
                                            headline.stroke ?? 0,
                                            shadowCss(headline.textShadow),
                                          ),
                                          typeAlign[headline.alignX ?? 'start'],
                                          typeCase[
                                            headline.transform ?? 'none'
                                          ],
                                          typeLine[
                                            headline.decoration ?? 'none'
                                          ],
                                          typeSlant[
                                            headline.isItalic
                                              ? 'italic'
                                              : 'normal'
                                          ],
                                        ]}>
                                        {headline.content}
                                      </Heading>
                                    </VStack>
                                  </AspectRatio>
                                </Theme>
                              </Card>
                            </HStack>
                          </LayoutContent>
                        }
                        footer={
                          chrome.toolbar ? (
                            <LayoutFooter>
                              <Center>
                                {/* Padding of one step, and the controls
                                inside round to the card's radius less that
                                step — see styles.toolBarControl. */}
                                <Card padding={1} elevation="high">
                                  <Toolbar
                                    label="Canvas tools"
                                    size="sm"
                                    startContent={
                                      <>
                                        <IconButton
                                          label="Undo"
                                          tooltip="Undo"
                                          variant="ghost"
                                          icon={
                                            <Icon icon={Undo2} size={ICON} />
                                          }
                                          xstyle={styles.toolBarControl}
                                        />
                                        <IconButton
                                          label="Redo"
                                          tooltip="Redo"
                                          variant="ghost"
                                          icon={
                                            <Icon icon={Redo2} size={ICON} />
                                          }
                                          xstyle={styles.toolBarControl}
                                        />
                                        <Divider
                                          orientation="vertical"
                                          xstyle={styles.toolBarRule}
                                        />
                                        <IconButton
                                          label="Add frame"
                                          tooltip="Add frame"
                                          variant="ghost"
                                          icon={
                                            <Icon icon={Frame} size={ICON} />
                                          }
                                          xstyle={styles.toolBarControl}
                                        />
                                        <IconButton
                                          label="Add text"
                                          tooltip="Add text"
                                          variant="ghost"
                                          icon={
                                            <Icon icon={Type} size={ICON} />
                                          }
                                          xstyle={styles.toolBarControl}
                                        />
                                        <IconButton
                                          label="Add image"
                                          tooltip="Add image"
                                          variant="ghost"
                                          icon={
                                            <Icon
                                              icon={ImageIcon}
                                              size={ICON}
                                            />
                                          }
                                          xstyle={styles.toolBarControl}
                                        />
                                        <Divider
                                          orientation="vertical"
                                          xstyle={styles.toolBarRule}
                                        />
                                        <Selector
                                          label="Zoom"
                                          isLabelHidden
                                          variant="ghost"
                                          value={zoom}
                                          onChange={setZoom}
                                          options={ZOOM_OPTIONS}
                                          placement="above"
                                          // Fixed so the bar does not reflow
                                          // as the value changes, and wide
                                          // enough for the longest option
                                          // ("100%") to avoid truncation.
                                          width={92}
                                          controlXstyle={[
                                            styles.toolBarControl,
                                            styles.toolBarTrailing,
                                          ]}
                                        />
                                      </>
                                    }
                                  />
                                </Card>
                              </Center>
                            </LayoutFooter>
                          ) : undefined
                        }
                      />
                    </Section>
                  </LayoutContent>
                }
                end={
                  chrome.right ? (
                    <>
                      <ResizeHandle
                        resizable={inspector.props}
                        isReversed
                        isAlwaysVisible={false}
                        pillPlacement="center"
                        label="Resize properties panel"
                        xstyle={styles.foldsAtInspector}
                      />
                      <LayoutPanel
                        resizable={inspector.props}
                        hasDivider
                        padding={0}
                        isScrollable
                        label={`${selected.name} properties`}
                        xstyle={styles.foldsAtInspector}>
                        <InspectorSection title="Layout">
                          <InspectorRow label="Padding">
                            <AxisInput
                              icon={PanelLeftRightDashed}
                              label="Horizontal padding"
                              value={selected.paddingInline}
                              onChange={next =>
                                updateSelected({paddingInline: next})
                              }
                            />
                            <AxisInput
                              icon={PanelTopBottomDashed}
                              label="Vertical padding"
                              value={selected.paddingBlock}
                              onChange={next =>
                                updateSelected({paddingBlock: next})
                              }
                            />
                            <IconButton
                              label="Set padding per side"
                              tooltip="Per side"
                              size="sm"
                              variant="ghost"
                              icon={<Icon icon={SquareSquare} size={ICON} />}
                            />
                          </InspectorRow>
                        </InspectorSection>

                        <InspectorSection title="Layer">
                          <InspectorRow label="Position">
                            <AxisInput
                              icon={GLYPH.x}
                              label="Horizontal position"
                              value={selected.x}
                              onChange={next => updateSelected({x: next})}
                            />
                            <AxisInput
                              icon={GLYPH.y}
                              label="Vertical position"
                              value={selected.y}
                              onChange={next => updateSelected({y: next})}
                            />
                          </InspectorRow>
                          <InspectorRow label="Size">
                            <AxisInput
                              icon={GLYPH.width}
                              label="Width"
                              value={selected.width}
                              onChange={next => updateSelected({width: next})}
                            />
                            <AxisInput
                              icon={GLYPH.height}
                              label="Height"
                              value={selected.height}
                              onChange={next => updateSelected({height: next})}
                            />
                          </InspectorRow>
                        </InspectorSection>

                        <InspectorSection title="Styles">
                          <InspectorRow label="Radius">
                            <AxisInput
                              icon={Scan}
                              label="Corner radius"
                              value={selected.radius}
                              onChange={next => updateSelected({radius: next})}
                            />
                            <IconButton
                              label="Set radius per corner"
                              tooltip="Per corner"
                              size="sm"
                              variant="ghost"
                              icon={
                                <Icon icon={SquareRoundCorner} size={ICON} />
                              }
                            />
                          </InspectorRow>
                          <StyleRow
                            label="Border"
                            value={selected.border}
                            placeholder="Add…"
                            onChange={next => updateSelected({border: next})}
                            onClear={() => updateSelected({border: undefined})}
                          />
                          <StyleRow
                            label="Shadow"
                            name="Box shadow"
                            value={selected.shadow?.color}
                            placeholder="Add…"
                            onChange={next =>
                              updateSelected({
                                shadow: {
                                  ...(selected.shadow ?? NO_SHADOW),
                                  color: next,
                                },
                              })
                            }
                            onClear={() => updateSelected({shadow: undefined})}>
                            <ShadowFields
                              name="Box shadow"
                              shadow={selected.shadow ?? NO_SHADOW}
                              onChange={next => updateSelected({shadow: next})}
                            />
                          </StyleRow>
                          <StyleRow
                            label="Fill"
                            value={selected.fill}
                            placeholder="Add…"
                            onChange={next => updateSelected({fill: next})}
                            onClear={() => updateSelected({fill: undefined})}
                          />
                        </InspectorSection>

                        <InspectorSection title="Transforms">
                          <InspectorRow label="Rotate">
                            <AxisInput
                              icon={TriangleRight}
                              label="Rotation"
                              value={selected.rotation}
                              onChange={next =>
                                updateSelected({rotation: next})
                              }
                            />
                            <IconButton
                              label="Rotate counterclockwise"
                              tooltip="−90°"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                updateSelected({
                                  rotation: (selected.rotation + 270) % 360,
                                })
                              }
                              icon={<Icon icon={RotateCcw} size={ICON} />}
                            />
                            <IconButton
                              label="Rotate clockwise"
                              tooltip="+90°"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                updateSelected({
                                  rotation: (selected.rotation + 90) % 360,
                                })
                              }
                              icon={<Icon icon={RotateCw} size={ICON} />}
                            />
                          </InspectorRow>
                          <InspectorRow label="Flip" hAlign="end">
                            <IconButton
                              label="Flip horizontally"
                              tooltip="Flip horizontally"
                              size="sm"
                              variant="ghost"
                              icon={<Icon icon={FlipHorizontal2} size={ICON} />}
                            />
                            <IconButton
                              label="Flip vertically"
                              tooltip="Flip vertically"
                              size="sm"
                              variant="ghost"
                              icon={<Icon icon={FlipVertical2} size={ICON} />}
                            />
                          </InspectorRow>
                        </InspectorSection>

                        {selected.kind === 'text' ? (
                          <InspectorSection title="Text">
                            <TextArea
                              label="Content"
                              isLabelHidden
                              size="sm"
                              rows={2}
                              value={selected.content}
                              onChange={next => updateSelected({content: next})}
                            />
                            <InspectorRow label="Font">
                              <StackItem size="fill">
                                <Selector
                                  label="Font family"
                                  isLabelHidden
                                  size="sm"
                                  value={selected.family}
                                  onChange={next =>
                                    updateSelected({family: next})
                                  }
                                  options={FONT_OPTIONS}
                                />
                              </StackItem>
                            </InspectorRow>
                            <InspectorRow label="Weight">
                              <StackItem size="fill">
                                <Selector
                                  label="Font weight"
                                  isLabelHidden
                                  size="sm"
                                  value={selected.weight}
                                  onChange={next =>
                                    updateSelected({weight: next})
                                  }
                                  options={WEIGHT_OPTIONS}
                                />
                              </StackItem>
                            </InspectorRow>
                            <InspectorRow label="Color">
                              <StackItem size="fill">
                                <TextInput
                                  label="Text colour"
                                  isLabelHidden
                                  size="sm"
                                  value={selected.color ?? ''}
                                  onChange={next =>
                                    updateSelected({color: next})
                                  }
                                />
                              </StackItem>
                              <Swatch
                                label="Text colour"
                                value={selected.color}
                                onChange={next => updateSelected({color: next})}
                              />
                            </InspectorRow>
                            <StepperRow
                              label="Size"
                              value={selected.size ?? 0}
                              onChange={next => updateSelected({size: next})}
                            />
                            <StepperRow
                              label="Line"
                              value={selected.line ?? 100}
                              onChange={next => updateSelected({line: next})}
                            />
                            <StepperRow
                              label="Spacing"
                              value={selected.tracking ?? 0}
                              onChange={next =>
                                updateSelected({tracking: next})
                              }
                            />
                            <InspectorRow label="Align">
                              <StackItem size="fill">
                                <SegmentedControl
                                  label="Horizontal alignment"
                                  size="sm"
                                  layout="fill"
                                  value={selected.alignX ?? 'start'}
                                  onChange={next =>
                                    updateSelected({alignX: next as AlignX})
                                  }>
                                  {ALIGN_X.map(option => (
                                    <SegmentedControlItem
                                      key={option.value}
                                      value={option.value}
                                      label={option.label}
                                      isLabelHidden
                                      icon={
                                        <Icon icon={option.icon} size={ICON} />
                                      }
                                    />
                                  ))}
                                </SegmentedControl>
                              </StackItem>
                            </InspectorRow>
                            <InspectorRow label="Align">
                              <StackItem size="fill">
                                <SegmentedControl
                                  label="Vertical alignment"
                                  size="sm"
                                  layout="fill"
                                  value={selected.alignY ?? 'start'}
                                  onChange={next =>
                                    updateSelected({alignY: next as AlignY})
                                  }>
                                  {ALIGN_Y.map(option => (
                                    <SegmentedControlItem
                                      key={option.value}
                                      value={option.value}
                                      label={option.label}
                                      isLabelHidden
                                      icon={
                                        <Icon icon={option.icon} size={ICON} />
                                      }
                                    />
                                  ))}
                                </SegmentedControl>
                              </StackItem>
                            </InspectorRow>
                            <InspectorRow label="Style">
                              <StackItem size="fill">
                                <SegmentedControl
                                  label="Font style"
                                  size="sm"
                                  layout="fill"
                                  value={
                                    selected.isItalic ? 'italic' : 'normal'
                                  }
                                  onChange={next =>
                                    updateSelected({
                                      isItalic: next === 'italic',
                                    })
                                  }>
                                  <SegmentedControlItem
                                    value="normal"
                                    label="Regular"
                                    isLabelHidden
                                    icon={<Icon icon={Baseline} size={ICON} />}
                                  />
                                  <SegmentedControlItem
                                    value="italic"
                                    label="Italic"
                                    isLabelHidden
                                    icon={<Icon icon={Italic} size={ICON} />}
                                  />
                                </SegmentedControl>
                              </StackItem>
                            </InspectorRow>
                            <InspectorRow label="Decoration">
                              <StackItem size="fill">
                                <SegmentedControl
                                  label="Text decoration"
                                  size="sm"
                                  layout="fill"
                                  value={selected.decoration ?? 'none'}
                                  onChange={next =>
                                    updateSelected({
                                      decoration: next as Decoration,
                                    })
                                  }>
                                  {DECORATIONS.map(option => (
                                    <SegmentedControlItem
                                      key={option.value}
                                      value={option.value}
                                      label={option.label}
                                      isLabelHidden
                                      icon={
                                        <Icon icon={option.icon} size={ICON} />
                                      }
                                    />
                                  ))}
                                </SegmentedControl>
                              </StackItem>
                            </InspectorRow>
                            <InspectorRow label="Transform">
                              <StackItem size="fill">
                                <SegmentedControl
                                  label="Text transform"
                                  size="sm"
                                  layout="fill"
                                  value={selected.transform ?? 'none'}
                                  onChange={next =>
                                    updateSelected({
                                      transform: next as Transform,
                                    })
                                  }>
                                  {TRANSFORMS.map(option => (
                                    <SegmentedControlItem
                                      key={option.value}
                                      value={option.value}
                                      label={option.label}
                                      isLabelHidden
                                      icon={
                                        <Icon icon={option.icon} size={ICON} />
                                      }
                                    />
                                  ))}
                                </SegmentedControl>
                              </StackItem>
                            </InspectorRow>
                            <StyleRow
                              label="Shadow"
                              name="Text shadow"
                              value={selected.textShadow?.color}
                              placeholder="Add…"
                              onChange={next =>
                                updateSelected({
                                  textShadow: {
                                    ...(selected.textShadow ?? NO_SHADOW),
                                    color: next,
                                  },
                                })
                              }
                              onClear={() =>
                                updateSelected({textShadow: undefined})
                              }>
                              <ShadowFields
                                name="Text shadow"
                                shadow={selected.textShadow ?? NO_SHADOW}
                                onChange={next =>
                                  updateSelected({textShadow: next})
                                }
                              />
                            </StyleRow>
                            <InspectorRow label="Stroke">
                              <StackItem size="fill">
                                <NumberInput
                                  label="Text stroke"
                                  isLabelHidden
                                  size="sm"
                                  value={selected.stroke ?? 0}
                                  onChange={next =>
                                    updateSelected({stroke: next})
                                  }
                                  isWheelEnabled={false}
                                />
                              </StackItem>
                              <IconButton
                                label="Clear stroke"
                                tooltip="Clear"
                                size="sm"
                                variant="ghost"
                                isDisabled={!selected.stroke}
                                onClick={() => updateSelected({stroke: 0})}
                                icon={<Icon icon={X} size={ICON} />}
                              />
                            </InspectorRow>
                          </InspectorSection>
                        ) : (
                          <>
                            <InspectorSection title="Image">
                              <InspectorRow label="Edit">
                                <StackItem size="fill">
                                  <TextInput
                                    label="Image source"
                                    isLabelHidden
                                    size="sm"
                                    value={imageName}
                                    isReadOnly
                                  />
                                </StackItem>
                                {/* Astryx's FileInput is fixed at the medium
                                element height, and this row is built on the
                                28px rhythm the rest of the inspector keeps,
                                so the picker is driven from the thumbnail
                                instead. The input stays in the DOM — hiding
                                it with the attribute rather than unmounting
                                it is what lets the button open it. */}
                                <input
                                  ref={fileRef}
                                  type="file"
                                  accept="image/*"
                                  hidden
                                  onChange={event => {
                                    const file = event.target.files?.[0];
                                    if (file) {
                                      setImageName(file.name);
                                    }
                                  }}
                                />
                                {/* The trigger shows the picture rather than
                                an icon standing in for one: the row is about
                                which image this is. `onClick` is what gives
                                Thumbnail its button semantics and hover
                                overlay, and `label` doubles as the tooltip. */}
                                <Thumbnail
                                  src={PHOTO_LAYER_SRC}
                                  alt={`Current image, ${imageName}`}
                                  label="Replace image"
                                  onClick={() => fileRef.current?.click()}
                                  xstyle={styles.sourceThumbnail}
                                />
                              </InspectorRow>
                              <InspectorRow label="Fit">
                                <StackItem size="fill">
                                  <Selector
                                    label="Image fit"
                                    isLabelHidden
                                    size="sm"
                                    value={selected.fit ?? 'Cover'}
                                    onChange={next =>
                                      updateSelected({fit: next})
                                    }
                                    options={['Cover', 'Contain', 'Fill']}
                                  />
                                </StackItem>
                              </InspectorRow>
                            </InspectorSection>
                            <InspectorSection title="Filters">
                              {FILTERS.map(filter => (
                                <FilterRow
                                  key={filter.key}
                                  filter={filter}
                                  value={
                                    (selected.filters ?? NO_FILTERS)[filter.key]
                                  }
                                  onChange={next =>
                                    updateSelected({
                                      filters: {
                                        ...(selected.filters ?? NO_FILTERS),
                                        [filter.key]: next,
                                      },
                                    })
                                  }
                                />
                              ))}
                            </InspectorSection>
                          </>
                        )}
                      </LayoutPanel>
                    </>
                  ) : undefined
                }
              />
            </LayoutContent>
          }
        />
      </Section>
    </Theme>
  );
}
