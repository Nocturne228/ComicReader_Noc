import MdSwipeVertical from '@material-design-icons/svg/round/swipe_vertical.svg';
import MdSwipe from '@material-design-icons/svg/round/swipe.svg';
import {
  type Accessor,
  type Component,
  createSignal,
  Match,
  Switch,
} from 'solid-js';

import type { DragSession } from './usePointerSelect';
import type { SelectionManager } from './useSelection';

import { withEventStop } from '../../helper';
import { useStyle, useStyleMemo } from '../../helper/useStyle';

export const SelectionMask: Component<{
  dom: HTMLElement;
  index: number;
  isEnabled: () => boolean;
  registeredItems: Accessor<Map<HTMLElement, string>>;
  selection: Pick<SelectionManager, 'isSelected' | 'getOrder' | 'selectedIds'>;
  drag: Pick<DragSession, 'onPointerDown' | 'onPointerEnter'>;
}> = (props) => {
  const id = () => props.registeredItems().get(props.dom)!;
  const isSelected = () => props.selection.isSelected(id());
  const selectedCount = () => props.selection.selectedIds().length;
  const shouldBlink = () => selectedCount() === 0 && props.index === 0;

  const [showVerticalIcon, setShowVerticalIcon] = createSignal(false);

  useStyle(
    `
      .selection-mask {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 5em;
        user-select: none;
        touch-action: none;
        transition: opacity 0.15s ease, background-color 0.15s ease;

        &.blink {
          animation: check-blink 2s ease-in-out 2s backwards infinite;
        }
      }

      .selection-mask.selected,
      .selection-mask.blink {
        background: #0009;
      }

      .selection-mask-content {
        font-size: 1.5em;
        font-weight: bold;
        text-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;

        & > svg {
          width: 1em;
          font-size: 1em;
        }
      }

      @keyframes check-blink {
        0% { opacity: 0; }
        20% { opacity: 1; }   /* 0.4s 淡入 */
        35% { opacity: 1; }   /* 保持显示 0.3s */
        55% { opacity: 0; }   /* 0.4s 淡出 */
        100% { opacity: 0; }  /* 等待 0.9s */
      }
    `,
    props.dom,
  );

  useStyleMemo(
    '.selection-mask-content',
    { color: () => (isSelected() ? '#ffffffbf' : '#fffb') },
    props.dom,
  );

  return (
    <div
      class="selection-mask"
      classList={{
        selected: isSelected(),
        blink: shouldBlink() && !isSelected(),
      }}
      onPointerDown={withEventStop((e) =>
        props.drag.onPointerDown(props.dom, e),
      )}
      onPointerEnter={withEventStop((e) =>
        props.drag.onPointerEnter(props.dom, e),
      )}
      onContextMenu={withEventStop()}
      onAnimationIteration={() => setShowVerticalIcon((prev) => !prev)}
    >
      <span class="selection-mask-content">
        <Switch>
          <Match when={isSelected()}>{props.selection.getOrder(id())}</Match>
          <Match when={shouldBlink()}>
            {showVerticalIcon() ? <MdSwipeVertical /> : <MdSwipe />}
          </Match>
        </Switch>
      </span>
    </div>
  );
};
