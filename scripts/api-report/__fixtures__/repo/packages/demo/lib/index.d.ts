// Copyright (c) Meta Platforms, Inc. and affiliates.

export type ReactNode = string | number | null;
export type ChipSize = 'sm' | 'md';
export interface ChipProps {
  /** Text the chip shows. */
  label: string;
  /** @default 'md' */
  size?: ChipSize;
  /** @default false */
  isSelected?: boolean;
  onSelect?(id: string): void;
}
export declare function Chip(props: ChipProps): ReactNode;
export interface BadgeProps {
  /** Text the badge shows. */
  label: string;
  /** @default 'neutral' */
  tone?: 'neutral' | 'accent';
}
type BadgeExperimentalProps = Omit<BadgeProps, 'tone'> & {
  /** @experimental */
  experimental: {glow?: boolean};
};
interface BadgeColorProps extends BadgeProps {
  /** A color name. */
  color: string;
}
/** @deprecated `color` is gone: set `tone`. */
export declare function Badge(props: BadgeColorProps): ReactNode;
export declare function Badge(props: BadgeExperimentalProps): ReactNode;
export declare function Badge(props: BadgeProps): ReactNode;
export interface TagProps {
  text: string;
}
/** @deprecated Use Badge. */
export declare const Tag: {
  (props: TagProps & {color: string}): ReactNode;
  (props: TagProps): ReactNode;
};
export interface PillProps {
  size: number;
}
export declare function Pill(props: PillProps & {legacy: true}): ReactNode;
/** @internal */
export declare function Pill(props: PillProps): ReactNode;
export declare function useChipState(
  initial?: boolean,
): readonly [boolean, (next: boolean) => void];
export declare function formatChip(label: string): string;
export declare function formatChip(label: string, size: ChipSize): string;
export declare const CHIP_SIZES: readonly ChipSize[];
/** @internal */
export declare function resetChips(): void;
/** @experimental */
export interface ChipExperimentalOptions {
  pulse?: boolean;
}
export declare const THEME_ATTR = 'data-astryx-theme';
// Only the declarations marked `export` are public: the two Badge props types
// above without it stay private.
export {};
