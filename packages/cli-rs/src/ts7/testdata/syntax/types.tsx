import type {Foo} from './foo';
export interface Props<T extends object = {}> extends Base, Other<T> {
  /** The label 😀. */
  readonly label?: string;
  onPress(event: {x: number}): void;
  [key: string]: unknown;
  new (x: number): Props;
  (y: string): void;
}
export type U = keyof typeof x | `a${string}` | (A & B)[] | [a: string, b?: number, ...c: boolean[]];
type M = {readonly [K in keyof T]?: T[K]} extends infer X ? X : never;
declare module 'm' { export const v: 1; }
namespace N { export enum E { A = 1, B } }
export default class C<T> implements I { #p = 1; static s = -2; get g() { return 1; } }
const el = <Foo bar="x" {...rest}>text {value}</Foo>;
export {a as b, type c} from './d';
export * as ns from './e';
const z = (<any>w)!;
