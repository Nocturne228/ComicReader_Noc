import { type State, store } from '../store';
import { withOptionalState } from './helper';
import { isBottom, isTop } from './memo';

export type Dir = 'next' | 'prev';

/** 处理尽头翻页。返回当前是否已抵达尽头 */
export const handleEndTurnPage = withOptionalState(
  (dir: Dir, state: State): boolean => {
    if (dir === 'prev') {
      switch (state.show.endPage) {
        case 'start':
          if (state.scrollLock || store.option.scroolEnd !== 'auto')
            return true;
          state.prop.onPrev?.();
          return true;
        case 'end':
          state.show.endPage = undefined;
          return true;

        default:
          // 弹出卷首结束页
          if (isTop()) {
            if (state.scrollLock) return true;
            if (
              !state.prop.onExit ||
              !state.prop.onPrev ||
              store.option.scroolEnd !== 'auto'
            )
              return true;

            state.show.endPage = 'start';
            return true;
          }
      }
    } else {
      switch (state.show.endPage) {
        case 'end':
          if (state.scrollLock || store.option.scroolEnd === 'none')
            return true;
          if (store.option.scroolEnd === 'auto' && state.prop.onNext)
            state.prop.onNext();
          else state.prop.onExit?.(true);
          return true;
        case 'start':
          state.show.endPage = undefined;
          return true;

        default:
          // 弹出卷尾结束页
          if (isBottom()) {
            if (state.scrollLock) return true;
            if (!state.prop.onExit) return true;

            state.show.endPage = 'end';
            return true;
          }
      }
    }

    return false;
  },
);
