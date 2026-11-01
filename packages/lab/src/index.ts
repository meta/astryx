// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @astryxdesign/lab — Experimental Astryx components
 *
 * Components here are functional but not yet hardened for production.
 * They're available in storybook and sandbox for testing and iteration.
 * Once vetted, components graduate to @astryxdesign/core.
 *
 * This package is published to npm ONLY under the @canary dist-tag
 * (npm install @astryxdesign/lab@canary). It is never released as a
 * stable (latest) version.
 */

// Code components — syntax highlighting domain
export {CodeEditor, type CodeEditorProps} from './CodeEditor';
export {
  tokenize,
  tokenizeAsync,
  SYNC_TOKENIZE_THRESHOLD,
  type SyntaxToken,
} from '@astryxdesign/core/CodeBlock';

// InfoTip — accessible info-icon help affordance (RFC meta/astryx#3349)
export {InfoTip, type InfoTipProps, type InfoTipSize} from './InfoTip';

// EmojiPicker — standalone searchable emoji panel
export {
  EmojiPicker,
  DEFAULT_FREQUENT_EMOJIS,
  type EmojiPickerProps,
  type EmojiOption,
  type EmojiCategory,
} from './EmojiPicker';

// CommentPin — avatar-first anchor for one or grouped annotation threads
export {
  CommentPin,
  type CommentPinParticipant,
  type CommentPinProps,
} from './CommentPin';

// Comments family — a panel, standalone thread, and controlled composer
export {
  Comments,
  type CommentsProps,
  CommentThread,
  type CommentThreadProps,
  CommentComposer,
  type CommentComposerProps,
  DEFAULT_COMMENT_REACTIONS,
  COMMENT_ICON_KEYS,
  type CommentAgentCommand,
  type CommentAnchor,
  type CommentComposerContext,
  type CommentComposerRenderProps,
  type CommentData,
  type CommentStatus,
  type CommentHighlightColor,
  type CommentImageUploader,
  type CommentMode,
  type CommentProgress,
  type CommentReaction,
  type CommentReactionOption,
  type CommentThreadData,
  type CommentThreadSharedProps,
  type CommentUploadedImage,
  type CommentUser,
  type CommentVersion,
  type CommentActivityEvent,
} from './Comments';

// TransferList — controlled dual-panel collection input
export {
  TransferList,
  TransferListSelector,
  transferListVars,
  type TransferListOption,
  type TransferListProps,
  type TransferListSelectorCommitBehavior,
  type TransferListSelectorProps,
} from './TransferList';

// LineClamp — clamp arbitrary content to N lines (facebook/astryx#4180)
export {LineClamp, type LineClampProps} from './LineClamp';

// Chat — experimental reasoning display
export {
  ChatReasoning,
  type ChatReasoningProps,
} from './ChatReasoning/ChatReasoning';
export * from './Chat';

// Tour — guided product-tour / NUX walkthrough (meta/astryx#4239)
export {
  Tour,
  type TourProps,
  TourStep,
  type TourStepProps,
  useTour,
  type UseTourReturn,
  type TourDismissSource,
} from './Tour';

// Stat — experimental KPI/metric display
export {
  Stat,
  type StatProps,
  type StatDelta,
  type StatDeltaDirection,
  type StatDeltaSentiment,
  type StatSize,
} from './Stat';

// Schedule — experimental full-calendar views
export * from './Schedule';

// SVG Icon system — CSS-variable-driven multi-variation icons
export {
  SVGIcon,
  type SVGIconProps,
  type SVGIconVariation,
  type SVGIconSize,
  type SVGIconColor,
  type SVGIconDef,
  type IconShape,
  type IconShapeRole,
  iconVars,
  variations,
  opticalSize,
  xIcon,
  checkIcon,
  bellIcon,
  homeIcon,
  settingsIcon,
  calendarIcon,
  menuIcon,
  heartIcon,
  eyeIcon,
  starIcon,
  folderIcon,
  shieldIcon,
  searchIcon,
  mailIcon,
  lockIcon,
  starterIcons,
} from './SVGIcon';

// Chart components — composable d3-based data visualization
export {
  Chart,
  type ChartProps,
  type YBaseline,
  ChartAxis,
  type ChartAxisProps,
  ChartGrid,
  type ChartGridProps,
  ChartBar,
  type ChartBarProps,
  ChartLine,
  type ChartLineProps,
  ChartArea,
  type ChartAreaProps,
  ChartErrorBar,
  type ChartErrorBarProps,
  ChartCandlestick,
  type ChartCandlestickProps,
  ChartDot,
  type ChartDotProps,
  ChartDotGL,
  type ChartDotGLProps,
  ChartDotGLInteractive,
  type ChartDotGLInteractiveProps,
  ChartHeatmapGL,
  type ChartHeatmapGLProps,
  ChartStreamGL,
  type ChartStreamGLProps,
  type ChartStreamGLHandle,
  ChartTooltip,
  type ChartTooltipProps,
  type ChartCrosshairMode,
  ChartLegend,
  type ChartLegendProps,
  type ChartLegendItem,
  useChart,
  type ChartContext,
  type ChartMargin,
  type ChartScale,
  m4Reduce,
  type M4Point,
  useChartColors,
  useChartRange,
  type UseChartRangeOptions,
  type UseChartRangeReturn,
  getChartColors,
  getChartColorsFromResolver,
  type ChartColorsAPI,
  type SequentialHue,
  type TokenResolver,
  compactNumber,
  currency,
  percent,
  shortDate,
  monthYear,
} from './Chart';

// Radial charts — spider, pie, donut
export {
  RadialChart,
  type RadialChartProps,
  RadialGrid,
  type RadialGridProps,
  RadialArea,
  type RadialAreaProps,
  RadialAxis,
  type RadialAxisProps,
  RadialSlice,
  type RadialSliceProps,
  RadialTooltip,
  type RadialTooltipProps,
  type RadialTooltipDatum,
  useRadial,
  type RadialContext,
  type RadialMode,
} from './Radial';

// 3D charts — projected SVG with interactive rotation
export {
  ThreeDChart,
  type ThreeDChartProps,
  ThreeDScatter,
  ThreeDScatterGL,
  type ThreeDScatterProps,
  type ThreeDScatterGLProps,
  ThreeDBar,
  type ThreeDBarProps,
  ThreeDGrid,
  type ThreeDGridProps,
  ThreeDAxis,
  type ThreeDAxisProps,
  ThreeDSurface,
  type ThreeDSurfaceProps,
  use3D,
  type ThreeDContext,
  type Camera,
  type Point3D,
  type ProjectedPoint,
} from './ThreeD';

// Chart interactions
export {
  ChartBrush,
  type ChartBrushProps,
  type BrushMode,
  type BrushRange,
  ChartZoom,
  type ChartZoomProps,
  ChartSelect,
  type ChartSelectProps,
  ChartReferenceLine,
  type ChartReferenceLineProps,
} from './Chart';

// Sankey / flow diagrams — ribbon-based flow visualization
export {
  SankeyChart,
  type SankeyChartProps,
  SankeyLink,
  type SankeyLinkProps,
  SankeyNode,
  type SankeyNodeProps,
  SankeyLabel,
  type SankeyLabelProps,
  useSankey,
  type SankeyNodeDatum,
  type SankeyLinkDatum,
  type SankeyColumn,
  type SankeyColumnDef,
  type SankeyNodeLayout,
  type SankeyLinkLayout,
  type SankeyColumnLayout,
  SankeyGrid,
  type SankeyGridProps,
  type SankeyContext,
} from './Sankey';

// Chart v2 (config model) moved to its own package: @astryxdesign/charts.
// It is no longer re-exported from @astryxdesign/lab.
export * from './CircularProgress';

// ListInput — compact editor for short collections of simple records
export * from './ListInput';

// LogStream — experimental streaming log viewer
export {
  LogStream,
  type LogStreamProps,
  type LogEntry,
  type LogStreamLevel,
} from './LogStream';

// DiffViewer — read-only file diff (unified/split) for code review surfaces
export {
  DiffViewer,
  parseUnifiedDiff,
  createDiffFile,
  type DiffViewerProps,
  type DiffViewerViewMode,
  type CreateDiffFileOptions,
  type DiffViewerChangeIndicator,
  type DiffViewerInlineHighlight,
  type DiffViewerFile,
  type DiffViewerFileStatus,
  type DiffViewerHunk,
  type DiffViewerLine,
  type DiffViewerLineKind,
  type DiffViewerLineRef,
  type DiffViewerSide,
} from './DiffViewer';

// MobileTokenizer — Lab prototype (stack layer 1) of the touch Tokenizer
// flow: summary trigger + stacked manage/add BottomSheets. Graduates to
// Core Tokenizer presentation="bottom-sheet" (stack layer 2).
export {
  MobileTokenizer,
  type MobileTokenizerProps,
  type MobileTokenizerChange,
} from './MobileTokenizer';

// MobilePowerSearch — Lab prototype (stack layer 1) of the touch PowerSearch
// flow: field-wide "Manage filters" trigger with display-only tokens, a
// Filters sheet, and a field → operator → value drill-down. The caller picks
// it explicitly on touch layouts; the API mirrors Core PowerSearch.
export {
  MobilePowerSearch,
  type MobilePowerSearchProps,
} from './MobilePowerSearch';

// RichTextEditor (RFC meta/astryx#3899) moved out of @astryxdesign/lab into
// its own package, @astryxdesign/richtext. Import it from there:
//   import {RichTextEditor, RichTextView} from '@astryxdesign/richtext';
