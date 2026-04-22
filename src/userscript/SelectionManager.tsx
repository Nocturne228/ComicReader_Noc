import { type Component, type JSX, Show } from 'solid-js';
import { render } from 'solid-js/web';

import { type SelectionStatus, useMultiSelectMode } from 'helper';

/** 遮罩层基础样式 */
const MASK_BASE_STYLE = {
  position: 'absolute',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  'z-index': '9999',
  cursor: 'pointer',
  display: 'flex',
  'align-items': 'center',
  'justify-content': 'center',
  'font-size': '5em',
  'user-select': 'none',
  'touch-action': 'none',
  transition: 'opacity 0.15s ease, background-color 0.15s ease',
} satisfies JSX.CSSProperties;

const SelectionMask: Component<{
  status: () => SelectionStatus;
  dom: HTMLElement;
  order: () => number | undefined;
  isEnabled: () => boolean;
  onPointerDown: (dom: HTMLElement, e: PointerEvent) => void;
  onPointerEnter: (dom: HTMLElement, e: PointerEvent) => void;
}> = (props) => {
  const errorText = () => {
    switch (props.status()) {
      case 'unselected':
      case 'selected':
      case 'processing':
      case 'processed':
        return undefined;
      default:
        return props.status();
    }
  };

  const withEventStop =
    (handler: (dom: HTMLElement, e: PointerEvent) => void) =>
    (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      handler(props.dom, e);
    };

  const getBackground = () => {
    switch (props.status()) {
      case 'selected':
      case 'processing':
      case 'processed':
        return '#0006';
    }
  };

  const getColor = () => {
    switch (props.status()) {
      case 'processing':
        return '#ffc10780';
      case 'processed':
        return '#000000a6';
      case 'selected':
        return '#ffffffbf';
      case 'unselected':
        return 'transparent';
      default:
        return '#c42b1c80';
    }
  };

  return (
    <div
      style={{
        ...MASK_BASE_STYLE,
        display: props.isEnabled() ? MASK_BASE_STYLE.display : 'none',
        background:
          props.order() === undefined ? 'transparent' : getBackground(),
      }}
      onPointerDown={withEventStop(props.onPointerDown)}
      onPointerEnter={withEventStop(props.onPointerEnter)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span
        style={{
          'font-size': '1.5em',
          'font-weight': 'bold',
          color: getColor(),
          'text-shadow': 'none',
        }}
        title={errorText()}
        children={props.order()}
      />
    </div>
  );
};

/** 在页面上批量选择元素 */
export const useSelectionManager = (
  onMount: (register: (source: HTMLElement) => void) => (() => void) | void,
) => {
  const multiSelectMode = useMultiSelectMode({
    onMount,
    onRegister: (dom, status, order) => {
      const container = document.createElement('div');
      dom.append(container);

      const dispose = render(
        () => (
          <SelectionMask
            status={status}
            dom={dom}
            order={order}
            isEnabled={multiSelectMode.isEnabled}
            onPointerDown={multiSelectMode.onPointerDown}
            onPointerEnter={multiSelectMode.onPointerEnter}
          />
        ),
        container,
      );

      return () => {
        dispose();
        container.remove();
      };
    },
  });

  return multiSelectMode;
};
