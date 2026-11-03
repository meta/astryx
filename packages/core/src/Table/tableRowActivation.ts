// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Private Table row-action finalization.
 * @input Sequentially accumulated row render props and an owning module closure.
 * @output Final request handlers after non-owning cancellation contributions.
 * @position Parent protocol; never a public plugin callback or alternate pipeline.
 */
import type {BodyRowRenderProps} from './types';
const rowActivationFinalizer = Symbol('rowActivationFinalizer');
type FinalizedRowProps = BodyRowRenderProps & {
  [rowActivationFinalizer]?: (props: BodyRowRenderProps) => BodyRowRenderProps;
};
export function withRowActivationFinalizer(
  props: BodyRowRenderProps,
  finalize: (props: BodyRowRenderProps) => BodyRowRenderProps,
): BodyRowRenderProps {
  const result: FinalizedRowProps = {
    ...props,
    [rowActivationFinalizer]: finalize,
  };
  return result;
}
export function finalizeRowActivation(
  props: BodyRowRenderProps,
): BodyRowRenderProps {
  const {[rowActivationFinalizer]: finalize, ...remaining} =
    props as FinalizedRowProps;
  return finalize ? finalize(remaining) : props;
}
