import MdChecklist from '@material-design-icons/svg/round/checklist.svg';
import MdClearAll from '@material-design-icons/svg/round/clear_all.svg';
import { type CoreContext, listenHotkey } from 'core';
import {
  createEffectOn,
  isEqual,
  isString,
  singleThreaded,
  t,
  useCache,
  wait,
} from 'helper';
import { createRoot, createSignal } from 'solid-js';

import { type UseMultiSelectOptions, useMultiSelect } from './useMultiSelect';

/**
 * 多选加载缓存结构
 * - pending: 未确认的选择项
 * - confirmed: 已确认的选择项
 */
type MultiSelectCache = {
  pending: { id: string; selecteds: string[] };
  confirmed: { id: string; selecteds: string[] };
};

export type UseMultiSelectLoadOptions = {
  /** 当前列表的唯一标识，用于区分不同列表的选择项 */
  id: string;
  /** 在 start 时调用，用于页面 DOM 预处理，返回清理函数 */
  onStart?: UseMultiSelectOptions['onStart'];
  /** 根据标识获取图片列表 */
  getImgList: (id: string) => Promise<string[]>;
};

export const useMultiSelectLoad = <T extends Record<string, any>>(
  { setState, showComic, options }: CoreContext<T>,
  { id: initListid, onStart, getImgList }: UseMultiSelectLoadOptions,
) =>
  createRoot(async (dispose) => {
    const cache = await useCache<MultiSelectCache>({
      pending: 'id',
      confirmed: 'id',
    });

    const [listId, setListId] = createSignal<string>(initListid);
    const [registeredItems, setregisteredItems] = createSignal(
      new Map<HTMLElement, string>(),
    );
    const sm = useMultiSelect({ onStart, registeredItems });

    // 切换列表时清空选中状态
    createEffectOn([listId], ([currentId], prev) => {
      const prevId = prev?.[0];
      if (prevId !== undefined && prevId !== currentId) sm.clear();
    });

    const multiSelectLoad = singleThreaded(async () => {
      if (!sm.isEnabled()) {
        sm.start();
        const confirmed = await cache.get('confirmed', listId());
        if (confirmed) sm.setSelectedIds(confirmed.selecteds);
        return;
      }

      const imgLists = await sm.collect(getImgList);
      const imgList = imgLists.flat().filter(isString);
      if (imgList.length === 0) return sm.clear();

      await cache.del('pending', listId());
      await cache.set('confirmed', {
        id: listId(),
        selecteds: sm.selectedIds(),
      });

      setState('comicMap', 'selected', { imgList });
      await showComic('selected');
    });

    createEffectOn(
      [sm.isEnabled, () => sm.selectedIds().length, listId],
      ([enabled, count, id]) => {
        setState((state) => {
          if (enabled) {
            state.fab.multiSelectCount = count;
            state.fab.onClick = multiSelectLoad;
            state.fab.show = true;
            state.fab.overrideSpeedDial = [
              {
                name: t('other.clear'),
                onClick: sm.clear,
                icon: <MdClearAll />,
              },
            ];
          } else {
            state.fab.multiSelectCount = undefined;
            state.fab.onClick = showComic;
            state.fab.show = !options.hiddenFab && undefined;
            state.fab.overrideSpeedDial = undefined;
          }
        });
        if (!enabled) return;

        // 多选模式启用时，将当前选中项保存到 pending 缓存
        // 同时清除 confirmed 缓存，避免一个 id 的选中项同时存在两个地方
        const selecteds = sm.selectedIds();
        (async () => {
          await cache.del('confirmed', id);
          await (selecteds.length === 0
            ? cache.del('pending', id)
            : cache.set('pending', { id, selecteds }));
        })();
      },
    );

    setState('fab', 'extraSpeedDial', [
      {
        name: t('hotkeys.multi_select_load'),
        onClick: multiSelectLoad,
        icon: <MdChecklist />,
      },
    ]);

    const unlistenHotkey = listenHotkey(
      {
        enter_read_mode: multiSelectLoad,
        multi_select_load: multiSelectLoad,
      },
      true,
    );

    let oldIdSet: string[] = [];
    /** 清理副作用，但保留选中状态（用于翻页） */
    const unmount = () => {
      // 保存当前 ID 集合供下次比对
      oldIdSet = [...registeredItems().values()];

      sm.unmount();
      // 清空 registeredItems，避免旧 DOM 引用残留
      setregisteredItems(new Map());
      unlistenHotkey();
    };

    return {
      /** 注册新的可选项，并等待至和上次的注册项不同 */
      registerItems: async (
        newId: string,
        fillItems: (map: Map<HTMLElement, string>) => Promise<void>,
        maxWaitTime = 5000,
      ) => {
        setListId(newId);

        const map = await wait(async () => {
          const newMap = new Map<HTMLElement, string>();
          await fillItems(newMap);
          if (newMap.size === 0) return;
          // IdSet相同，说明 DOM 未更新
          if (isEqual(oldIdSet, [...newMap.values()])) return;
          return newMap;
        }, maxWaitTime);

        if (!map) throw new Error('等待新 DOM 超时');

        // 设置注册项，并自动恢复 pending 状态
        setregisteredItems(map);
        const pending = await cache.get('pending', listId());
        // 有 pending 时自动恢复选中状态
        if (pending?.selecteds.length) {
          sm.start();
          sm.setSelectedIds(pending.selecteds);
        }
      },
      unmount,
      /** 完全清理所有状态和副作用 */
      dispose: () => {
        oldIdSet = [];
        unmount();
        sm.dispose();
        dispose();
      },
    };
  });

export type UseMultiSelectLoadReturn = Awaited<
  ReturnType<typeof useMultiSelectLoad>
>;
