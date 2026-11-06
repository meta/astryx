// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MarkdownPluginNodeRenderer.tsx
 * @input Uses React (Component, Suspense, useMemo) and the plugin protocol's
 *   preparation, renderer lookup, text projection, and failure reporting.
 * @output Exports MarkdownPluginNodeRenderer, which renders one parsed
 *   extension node with the given plugins; renderMarkdownPluginNode, the one
 *   rendering path Markdown and MarkdownPluginNodeRenderer share; and
 *   MarkdownPluginBoundary, the error boundary both, and Markdown's semantic
 *   fences, render plugin output inside.
 * @position Client-only entry `@astryxdesign/core/Markdown/plugin-renderer`.
 *   `Markdown` renders every extension node through renderMarkdownPluginNode,
 *   so a surface that renders a node with MarkdownPluginNodeRenderer — the
 *   RichText surfaces do — renders it exactly as `Markdown` does: the plugin's
 *   renderer inside an error boundary and a suspense fallback, the node's
 *   readable text when it fails, and the same failure report. It adds no
 *   element or theme target of its own (spec:AST-064 FR8, DEC-6).
 */

import {Component, Suspense, useMemo, type JSX, type ReactNode} from 'react';
import {
  getMarkdownExtensionRenderer,
  markdownExtensionText,
  prepareMarkdownPlugins,
  reportMarkdownPluginFailure,
  type MarkdownExtensionNode,
  type MarkdownPluginEntry,
  type PreparedMarkdownPlugins,
} from '../plugins/protocol';

interface MarkdownPluginBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  pluginName: string;
  resetKey: unknown;
  resetRenderer: unknown;
}

interface MarkdownPluginBoundaryState {
  failed: boolean;
  resetKey: unknown;
  resetRenderer: unknown;
}

/**
 * @internal The error boundary around a plugin's rendered output: shows
 * `fallback` and reports a render failure when the output throws, and tries
 * again when the node or its renderer changes. Markdown's semantic fences use
 * it too.
 */
export class MarkdownPluginBoundary extends Component<
  MarkdownPluginBoundaryProps,
  MarkdownPluginBoundaryState
> {
  state: MarkdownPluginBoundaryState = {
    failed: false,
    resetKey: this.props.resetKey,
    resetRenderer: this.props.resetRenderer,
  };

  static getDerivedStateFromError(): Partial<MarkdownPluginBoundaryState> {
    return {failed: true};
  }

  static getDerivedStateFromProps(
    props: MarkdownPluginBoundaryProps,
    state: MarkdownPluginBoundaryState,
  ): Partial<MarkdownPluginBoundaryState> | null {
    return props.resetKey === state.resetKey &&
      props.resetRenderer === state.resetRenderer
      ? null
      : {
          failed: false,
          resetKey: props.resetKey,
          resetRenderer: props.resetRenderer,
        };
  }

  componentDidCatch(error: unknown): void {
    reportMarkdownPluginFailure(this.props.pluginName, 'render', error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * @internal Renders one extension node the way `Markdown` does: `fallback`
 * when no renderer owns the node or the renderer throws when called, and
 * otherwise the renderer's output inside an error boundary and a suspense
 * fallback that both show `fallback`.
 */
export function renderMarkdownPluginNode<Fallback extends ReactNode>(
  plugins: PreparedMarkdownPlugins | undefined,
  node: MarkdownExtensionNode,
  fallback: Fallback,
  key?: string | number,
): Fallback | JSX.Element {
  const renderer = getMarkdownExtensionRenderer(plugins, node);
  if (renderer == null) {
    return fallback;
  }
  let rendered: ReactNode;
  try {
    rendered = renderer.render({node});
  } catch (error) {
    reportMarkdownPluginFailure(node.plugin, 'render', error);
    return fallback;
  }
  return (
    <MarkdownPluginBoundary
      key={key}
      pluginName={node.plugin}
      resetKey={node}
      resetRenderer={renderer.render}
      fallback={fallback}>
      <Suspense fallback={fallback}>{rendered}</Suspense>
    </MarkdownPluginBoundary>
  );
}

export interface MarkdownPluginNodeRendererProps {
  /** The plugins the node was parsed with, as passed to `Markdown`. */
  readonly plugins: ReadonlyArray<MarkdownPluginEntry>;
  /** One extension node from a parse with those plugins. */
  readonly node: MarkdownExtensionNode;
}

/**
 * Renders one parsed extension node exactly as `Markdown` renders it, with no
 * element of its own. When no plugin renders the node, it shows the node's
 * source, or its plugin's text projection for a node with no source.
 */
export function MarkdownPluginNodeRenderer({
  plugins,
  node,
}: MarkdownPluginNodeRendererProps): ReactNode {
  const prepared = useMemo(() => {
    try {
      return prepareMarkdownPlugins(plugins);
    } catch (error) {
      reportMarkdownPluginFailure('configuration', 'transform', error);
      return undefined;
    }
  }, [plugins]);
  return renderMarkdownPluginNode(
    prepared,
    node,
    node.source ?? markdownExtensionText(prepared, node),
  );
}
