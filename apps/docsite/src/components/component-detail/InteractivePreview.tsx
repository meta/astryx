// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  createElement,
  Suspense,
  useMemo,
  useState,
  useCallback,
  isValidElement,
  Component,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {getComponent, resolveValue} from './resolveElements';
import {AppShellMobileContext} from '@astryxdesign/core/AppShell';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {CodeExampleBlock} from '../CodeExampleBlock';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Code} from 'lucide-react';
import {ComponentPreviewTheme} from './ComponentPreviewTheme';
import {
  buildAppShellMobilePreviewContext,
  buildInitialState,
  buildRuntimePreviewState,
  getOverlayPreviewControl,
  getMissingRequiredProps,
  isOverlayPreviewClosed,
  pickPrimaryProps,
  type KnobProp,
} from './interactiveState';
import type {
  PropDoc,
  PlaygroundConfig,
} from '../../generated/componentRegistry';

export type {KnobProp} from './interactiveState';

const styles = stylex.create({
  card: {
    width: '100%',
    position: 'relative',
  },
  // Flattens the Card corners when embedded in an already-framed container.
  flat: {
    borderRadius: 0,
  },
});

class PreviewErrorBoundary extends Component<
  {children: ReactNode; resetKeys: unknown[]},
  {error: Error | null}
> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  componentDidUpdate(prevProps: {resetKeys: unknown[]}) {
    if (
      this.state.error &&
      prevProps.resetKeys.some((k, i) => !Object.is(k, this.props.resetKeys[i]))
    ) {
      this.setState({error: null});
    }
  }
  render() {
    if (this.state.error) {
      return (
        <Text type="supporting" color="secondary">
          Render error: {this.state.error.message}
        </Text>
      );
    }
    return this.props.children;
  }
}

// Simulated mobile AppShell for `playground.appShellMobile` components:
// they render null unless AppShell mobile context reports an enabled mobile
// viewport, which the default context value outside AppShell never does
// (#4983). Holds the drawer open state so the toggle stays interactive.
function AppShellMobilePreviewProvider({children}: {children: ReactNode}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const value = useMemo(
    () =>
      buildAppShellMobilePreviewContext(isMobileNavOpen, setIsMobileNavOpen),
    [isMobileNavOpen],
  );
  return (
    <AppShellMobileContext.Provider value={value}>
      {children}
    </AppShellMobileContext.Provider>
  );
}

function toIdentifierName(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.charAt(0).toLowerCase() + part.slice(1);
      if (index === 0) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

function formatValue(
  value: unknown,
  propName?: string,
  componentName?: string,
): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (
    value != null &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string' &&
    propName === 'theme'
  ) {
    const identifier = toIdentifierName(value.name);
    return componentName === 'Theme' ? `${identifier}Theme` : identifier;
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (isValidElement(value)) {
    const el = value as React.ReactElement<Record<string, unknown>>;
    const type =
      typeof el.type === 'string'
        ? el.type
        : ((el.type as {displayName?: string}).displayName ??
          el.type.name ??
          'Component');
    const props = el.props;
    if (!props || Object.keys(props).length === 0) {
      return `<${type} />`;
    }
    const propStr = Object.entries(props)
      .filter(([k]) => k !== 'children')
      .map(([k, v]) => {
        if (typeof v === 'string') {
          return `${k}="${v}"`;
        }
        try {
          return `${k}={${JSON.stringify(v)}}`;
        } catch {
          return `${k}={/* ... */}`;
        }
      })
      .join(' ');
    return `<${type} ${propStr} />`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '/* ... */';
  }
}

function generateCode(name: string, state: Record<string, unknown>): string {
  const componentName = name;
  // Filter out docs-only props that shouldn't appear in user code
  const entries = Object.entries(state).filter(
    ([k, v]) => v !== undefined && k !== 'isInline',
  );

  if (entries.length === 0) {
    return `<${componentName} />`;
  }

  const propLines = entries.map(([key, value]) => {
    if (typeof value === 'boolean' && value === true) {
      return `  ${key}`;
    }
    if (typeof value === 'string') {
      return `  ${key}="${value}"`;
    }
    return `  ${key}={${formatValue(value, key, name)}}`;
  });

  return `<${componentName}\n${propLines.join('\n')}\n/>`;
}

export function useInteractiveState(
  name: string,
  props: PropDoc[],
  playground?: PlaygroundConfig | null,
) {
  const knobs = useMemo(() => pickPrimaryProps(name, props), [name, props]);
  const initialState = useMemo(
    () => buildInitialState(knobs, playground),
    [knobs, playground],
  );
  const [state, setState] = useState<Record<string, unknown>>(initialState);
  const missingRequiredProps = useMemo(
    () => getMissingRequiredProps(knobs, initialState),
    [knobs, initialState],
  );

  const setProp = useCallback(
    (propName: string, value: unknown) =>
      setState(prev => ({...prev, [propName]: value})),
    [],
  );

  const reset = useCallback(() => setState(initialState), [initialState]);

  const isDirty = useMemo(
    () => Object.keys(state).some(k => !Object.is(state[k], initialState[k])),
    [state, initialState],
  );

  return {knobs, state, setProp, reset, isDirty, missingRequiredProps};
}

export function InteractivePreviewStage({
  name,
  state,
  knobs,
  playground,
  missingRequiredProps = [],
  onPropChange,
  canControlOpenState = false,
  embedded = false,
}: {
  name: string;
  state: Record<string, unknown>;
  knobs?: KnobProp[];
  playground?: PlaygroundConfig | null;
  missingRequiredProps?: string[];
  onPropChange?: (propName: string, value: unknown) => void;
  canControlOpenState?: boolean;
  embedded?: boolean;
}) {
  const [showCode, setShowCode] = useState(false);
  const Component = getComponent(name);
  const runtimeState = useMemo(
    () =>
      resolveValue(
        buildRuntimePreviewState(state, onPropChange, {
          canControlOpenState,
          knobs,
        }),
      ) as Record<string, unknown>,
    [state, onPropChange, canControlOpenState, knobs],
  );

  // Sub-components that need a parent context provider declare it via
  // `playground.wrapper`; wrap the previewed component in that parent.
  const wrapper = playground?.wrapper ?? null;
  const overlayControl = getOverlayPreviewControl(playground);
  const WrapperComponent = wrapper ? getComponent(wrapper.component) : null;
  const [wrapperValue, setWrapperValue] = useState<unknown>(undefined);
  const [isWrapperMenuOpen, setIsWrapperMenuOpen] = useState<
    boolean | undefined
  >(undefined);

  const wrapperProps = useMemo(() => {
    const resolved = wrapper?.props
      ? (resolveValue(wrapper.props) as Record<string, unknown>)
      : {};

    const activeValue =
      wrapperValue !== undefined ? wrapperValue : resolved.value;

    return {
      ...resolved,
      value: activeValue,
      onChange: (newVal: unknown) => {
        setWrapperValue(newVal);
        if (onPropChange && 'value' in state) {
          onPropChange('value', newVal);
        }
        if (typeof resolved.onChange === 'function') {
          resolved.onChange(newVal);
        }
      },
      // A menu wrapper seeded open (`isMenuOpen`) is controlled, so bridge
      // its open pair too: selecting still closes it and the trigger reopens
      // it (#5888).
      ...(typeof resolved.isMenuOpen === 'boolean' && {
        isMenuOpen: isWrapperMenuOpen ?? resolved.isMenuOpen,
        onOpenChange: setIsWrapperMenuOpen,
      }),
    };
  }, [wrapper, wrapperValue, isWrapperMenuOpen, state, onPropChange]);

  const renderPreview = useCallback(
    (rendered: ReactNode): ReactNode => {
      if (wrapper && WrapperComponent) {
        const slotProp = (wrapper as {slotProp?: string}).slotProp;
        if (slotProp) {
          return createElement(WrapperComponent, {
            ...wrapperProps,
            [slotProp]: rendered,
          });
        }
        return createElement(WrapperComponent, wrapperProps, rendered);
      }
      return rendered;
    },
    [wrapper, WrapperComponent, wrapperProps],
  );

  if (missingRequiredProps.length > 0) {
    return (
      <ComponentPreviewTheme>
        <Card variant="muted" padding={0} xstyle={embedded && styles.flat}>
          <Center style={{minHeight: 200, width: '100%'}}>
            <VStack
              gap={1}
              style={{
                paddingBlock: 24,
                paddingInline: 16,
                textAlign: 'center',
              }}>
              <Text type="supporting" color="secondary">
                Interactive preview needs required props that cannot be
                generated automatically.
              </Text>
              <Text type="supporting" color="secondary">
                Missing: {missingRequiredProps.join(', ')}
              </Text>
            </VStack>
          </Center>
        </Card>
      </ComponentPreviewTheme>
    );
  }

  if (!Component) {
    return (
      <ComponentPreviewTheme>
        <Card variant="muted" padding={0} xstyle={embedded && styles.flat}>
          <Center style={{minHeight: 200, width: '100%'}}>
            <VStack
              gap={1}
              style={{
                paddingBlock: 24,
                paddingInline: 16,
                textAlign: 'center',
              }}>
              <Text type="supporting" color="secondary">
                Interactive preview not available for {name}.
              </Text>
              <Text type="supporting" color="secondary">
                This component is not part of @astryxdesign/core.
              </Text>
            </VStack>
          </Center>
        </Card>
      </ComponentPreviewTheme>
    );
  }

  const code = generateCode(name, state);

  return (
    <ComponentPreviewTheme>
      <Card
        variant="muted"
        padding={0}
        xstyle={[styles.card, embedded && styles.flat]}>
        <div
          style={{
            position: 'absolute',
            top: 'var(--spacing-2)',
            right: 'var(--spacing-2)',
            zIndex: 2,
          }}>
          <Button
            label="Show code"
            tooltip="Show code"
            icon={<Code size={16} />}
            isIconOnly
            variant={showCode ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowCode(v => !v)}
          />
        </div>
        {showCode ? (
          <div
            style={{
              minHeight: 200,
              overflow: 'auto',
              paddingRight: 'var(--spacing-8)',
            }}>
            <CodeExampleBlock
              code={code}
              language="tsx"
              hasCopyButton
              container="section"
              width="100%"
            />
          </div>
        ) : (
          <Center
            style={{
              minHeight: 200,
              width: '100%',
              padding: 'var(--spacing-4)',
            }}>
            <Suspense
              fallback={
                <Text type="supporting" color="secondary">
                  Loading preview…
                </Text>
              }>
              <PreviewErrorBoundary
                resetKeys={[Component, runtimeState, WrapperComponent]}>
                {playground?.appShellMobile === true ? (
                  <AppShellMobilePreviewProvider>
                    <VStack
                      gap={2}
                      style={{alignItems: 'center', textAlign: 'center'}}>
                      {renderPreview(createElement(Component, runtimeState))}
                      <Text type="supporting" color="secondary">
                        Simulated mobile AppShell — in an app this renders only
                        below the mobile breakpoint.
                      </Text>
                    </VStack>
                  </AppShellMobilePreviewProvider>
                ) : (
                  renderPreview(createElement(Component, runtimeState))
                )}
                {isOverlayPreviewClosed(playground, state) && (
                  <VStack
                    gap={2}
                    style={{
                      alignItems: 'center',
                      paddingBlock: 24,
                      paddingInline: 16,
                      textAlign: 'center',
                    }}>
                    <Text type="supporting" color="secondary">
                      Opens as a full-screen overlay — nothing renders while it
                      is closed.
                    </Text>
                    {onPropChange != null &&
                      overlayControl != null &&
                      (overlayControl.stateProp !== 'isOpen' ||
                        canControlOpenState) && (
                        <Button
                          label="Open preview"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            onPropChange(
                              overlayControl.stateProp,
                              overlayControl.openValue,
                            )
                          }
                        />
                      )}
                  </VStack>
                )}
              </PreviewErrorBoundary>
            </Suspense>
          </Center>
        )}
      </Card>
    </ComponentPreviewTheme>
  );
}
