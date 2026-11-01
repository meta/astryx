// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from component directories (Button/, Card/, Layout/, Layer/, Toast/)
 * @output Exports all public components, hooks, and types for @astryxdesign/core
 * @position Package entry point; consumed by external applications
 *
 * SYNC: When modified, update this header and /packages/core/src/README.md
 */

// Base types
export type {BaseProps} from './BaseProps';

// Components
export * from './AppShell';
export * from './AspectRatio';
export * from './Avatar';
export * from './AvatarGroup';
export * from './Badge';
export * from './Banner';
export * from './Blockquote';
export * from './BottomSheet';
export * from './Breadcrumbs';
export * from './Button';
export * from './ButtonGroup';
export * from './IconButton';
export * from './Card';
export * from './ClickableCard';
export * from './Carousel';
export * from './Calendar';
export * from './Center';
export * from './CodeBlock';
export * from './CommandPalette';
export * from './ComplexSelector';
export * from './Chat';
export * from './Markdown';
export * from './Citation';
export * from './CheckboxInput';
export * from './CheckboxList';
export * from './Collapsible';
export * from './RadioList';
export * from './Resizable';
export * from './ScrollableArea';
export * from './Divider';
export * from './VisuallyHidden';
export * from './EmptyState';
export * from './Lightbox';
export * from './Link';
export * from './List';
export * from './MetadataList';
export * from './NavIcon';
// NavItem (navItemStyles) is internal — shared styles consumed by SideNav/TopNav/MobileNav
export * from './NavMenu';
export * from './Slider';
export * from './Stack';
export * from './Stepper';
export * from './Switch';
export * from './DateInput';
export * from './DateTimeInput';
export * from './DateRangeInput';
export * from './Field';
export * from './FileInput';
export * from './FormLayout';
export * from './Grid';
export * from './Section';
export * from './SegmentedControl';
export * from './SelectableCard';
export * from './Selector';
export * from './MultiSelector';
export * from './Icon';
export * from './Indicator';
export * from './InputGroup';
export * from './Item';
export * from './Text';
export * from './TextInput';
export * from './TabList';
export * from './TextArea';
export * from './TimeInput';
export * from './NumberInput';
export * from './Table';
export * from './ToggleButton';
export * from './Token';
export * from './Typeahead';
export * from './Tokenizer';
export * from './Thumbnail';
export * from './PowerSearch';
export * from './TreeList';

// Keyboard shortcut display
export * from './Kbd';
export * from './AlertDialog';
export * from './Dialog';
export * from './ContextMenu';
export * from './DropdownMenu';
export * from './Drawer';
export * from './MoreMenu';
export * from './InteractiveRoleContext';
export * from './SizeContext';
export * from './Toolbar';
export * from './TopNav';
export * from './SideNav';
export * from './MobileNav';
export * from './Pagination';
export * from './ProgressBar';

// Layout utilities and components (includes HStack, VStack)
export * from './Layout';

// Layer utilities (useLayer hook and core types)
export {useLayer} from './Layer';
export type {
  LayerAlignment,
  LayerPlacement,
  ContextRenderProps,
  FixedRenderProps,
  ContextLayerOptions,
  FixedLayerOptions,
  ContextLayerReturn,
  FixedLayerReturn,
} from './Layer';

// Layer provider
export {LayerProvider} from './Layer';
export type {LayerProviderProps, LayerInset, LayerToastConfig} from './Layer';

// Toast
export {Toast, useToast} from './Toast';
export type {
  ToastProps,
  ToastType,
  ToastPosition,
  ToastCollisionBehavior,
  ToastDismissReason,
  ToastOptions,
  ToastDismissFn,
  ShowToastFn,
  ToastContentRenderProps,
  ToastContentRenderFn,
} from './Toast';

// Popover component and hook
export * from './Popover';

// HoverCard component and hook
export * from './HoverCard';

// Tooltip component and hook
export * from './Tooltip';

// Skeleton loading placeholder
export * from './Skeleton';

// Status dot indicator
export * from './StatusDot';

// Spinner loading indicator
export * from './Spinner';

// Timestamp display
export * from './Timestamp';

// Elapsed timer display
export * from './Timer';

// Overlay
export * from './Overlay';
export * from './Outline';

// Overflow list
export * from './OverflowList';

// Animating one element (spec:AST-107 FR3): from the package root only, as
// one API has one entry; its hook ships from './hooks'.
export {
  createAnimator,
  type Animator,
  type AnimatorAnimateOptions,
  type AnimatorChannel,
  type AnimatorDecayVelocity,
  type AnimatorHandle,
  type AnimatorSnapshot,
  type AnimatorValues,
} from './animator/createAnimator';

// Hooks
export * from './hooks';

// Gestures: the public layer over the gesture system (spec:AST-107)
export {createPanGesture} from './gestures/createPanGesture';

// Utilities
export * from './utils';

// Theme
export type {TextColorMap} from './Text';
export * from './theme';

// Internationalization
export * from './i18n';
