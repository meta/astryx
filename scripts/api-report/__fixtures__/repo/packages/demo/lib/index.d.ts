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
