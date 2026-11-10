/** Props for a button. */
export interface ButtonProps {
  /** The label. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  onPress?: (event: { x: number }) => void;
  tone: Tone;
}

export type Tone = 'neutral' | 'accent';

export function Button(props: ButtonProps): string {
  return props.label + (props.size ?? 'md');
}

export const broken: number = 'not a number';
