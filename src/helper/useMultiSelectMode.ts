import type { Promisable } from 'type-fest';

import { batch, createMemo, createSignal } from 'solid-js';

import { ReactiveMap } from 'helper';

/**
 * 通用选择状态类型。
 * - `unselected`: 未选中
 * - `selected`: 已选中
 * - `processing`: 处理中
 * - `processed`: 处理完成
 * - 其他字符串: 错误信息
 */
export type SelectionStatus =
  | 'unselected'
  | 'selected'
  | 'processing'
  | 'processed'
  | string;

export type MultiSelectModeItem = {
  status: () => SelectionStatus;
  setStatus: (status: SelectionStatus) => void;
};

export type MultiSelectModeReturnBase = {
  /** 当前是否处于多选模式 */
  isEnabled: () => boolean;
  /** 开启多选模式 */
  start: () => void;
  /** 逐个处理当前选中项并返回对应列表 */
  collect: <T = void>(
    process: (dom: HTMLElement) => Promisable<T>,
  ) => Promise<(T | Error)[]>;
  /** 清空所有选择，并清理副作用 */
  clear: () => void;
  /** 获取所有已注册的元素列表 */
  registered: () => HTMLElement[];
  /** 获取指定元素的选择状态 */
  getStatus: (dom: HTMLElement) => SelectionStatus | undefined;
  /** 设置指定元素的选择状态 */
  setStatus: (dom: HTMLElement, status: SelectionStatus) => void;
  /** 当前选中的数量 */
  selectedCount: () => number;

  onPointerDown: (dom: HTMLElement, e: PointerEvent) => void;
  onPointerEnter: (dom: HTMLElement, e: PointerEvent) => void;
};

export type UseMultiSelectModeOptions = {
  /** 挂载阶段回调，用于批量注册可选元素 */
  onMount: (register: (dom: HTMLElement) => void) => (() => void) | void;
  /** 注册回调，会在每个元素被注册上时调用，返回对应的清理函数 */
  onRegister: (
    dom: HTMLElement,
    status: () => SelectionStatus,
    order: () => number | undefined,
  ) => (() => void) | void;
};

/** 当前正在进行的区间选择会话 */
type MultiSelectModeSession = {
  pointerId: number;

  /** 锚点索引，pointerdown 时按下的元素在 registered 中的位置 */
  anchorIndex: number;
  /** 本次拖拽的操作模式：整次手势固定为 select 或 unselect */
  dragMode: 'select' | 'unselect';
  /** 上一次 applyMultiSelect 时处理过的区间 [start, end]，null 表示首次 */
  lastRange: [number, number] | null;
  /** 记录本次手势中被修改的索引的原始状态，用于离开区间时恢复 */
  baselineStatusMap: Map<number, SelectionStatus>;
  /** 本次手势是否曾发生过区间扩展（锚点与当前指针跨过不同元素），用于决定释放时是否回退单点操作 */
  hasExpanded: boolean;
};

/** 获取排序后的区间范围 */
const getRange = (start: number, end: number): [number, number] =>
  start <= end ? [start, end] : [end, start];

/** 检查索引是否在指定区间内 */
const isInRange = (index: number, range: [number, number]) =>
  index >= range[0] && index <= range[1];

/** 多选状态管理 */
export const useMultiSelectMode = (
  options: UseMultiSelectModeOptions,
): MultiSelectModeReturnBase => {
  const [isEnabled, setIsEnabled] = createSignal(false);

  const itemsMap = new ReactiveMap<HTMLElement, MultiSelectModeItem>();

  /** 所有已注册的元素列表 */
  const registered = createMemo(() => [...itemsMap.keys()]);
  const statusEntries = createMemo(() => [...itemsMap.values()]);

  const isSelected = (status: SelectionStatus) => status === 'selected';
  const isInteractive = (status: SelectionStatus) => status !== 'processing';

  /** 当前正在进行的区间选择会话，null 表示无进行中的会话 */
  let session: MultiSelectModeSession | null = null;
  /** 已注册的清理函数列表（按栈统一管理） */
  const cleanups: (() => void)[] = [];
  /** 是否已初始化（挂载元素） */
  let isInitialized = false;

  /**
   * 根据当前拖拽模式设置指定索引的状态
   * @param index - 要设置的索引
   */
  const setIndexByMode = (index: number) => {
    if (!session) return;

    const entry = statusEntries()[index];
    if (!entry) return;

    const status = entry.status();
    if (!isInteractive(status)) return;

    const targetStatus =
      session.dragMode === 'select' ? 'selected' : 'unselected';
    if (status === targetStatus) return;

    session.baselineStatusMap.set(index, status);
    entry.setStatus(targetStatus);
  };

  /**
   * 恢复指定索引的原始状态（从 baseline 中恢复）
   * @param index - 要恢复的索引
   */
  const restoreIndexStatus = (index: number) => {
    if (!session) return;

    const baselineStatus = session.baselineStatusMap.get(index);
    if (baselineStatus !== undefined)
      statusEntries()[index]?.setStatus(baselineStatus);
  };

  /**
   * 应用锚点到当前索引的区间变化：
   * - 新区间内按 dragMode 写目标状态
   * - 旧区间与新区间差集恢复 baseline
   * @param currentIndex - 当前指针所在索引
   */
  const applyMultiSelect = (currentIndex: number) => {
    if (!session) return;

    const nextRange = getRange(session.anchorIndex, currentIndex);
    const [nextRangeStart, nextRangeEnd] = nextRange;

    if (!session.lastRange) {
      for (let index = nextRangeStart; index <= nextRangeEnd; index += 1)
        setIndexByMode(index);

      session.lastRange = nextRange;
      session.hasExpanded = nextRangeStart !== nextRangeEnd;
      return;
    }

    const [lastRangeStart, lastRangeEnd] = session.lastRange;
    const [mergedRangeStart, mergedRangeEnd] = getRange(
      Math.min(lastRangeStart, nextRangeStart),
      Math.max(lastRangeEnd, nextRangeEnd),
    );

    for (let index = mergedRangeStart; index <= mergedRangeEnd; index += 1) {
      if (isInRange(index, nextRange)) setIndexByMode(index);
      else restoreIndexStatus(index);
    }

    session.lastRange = nextRange;
    if (nextRangeStart !== nextRangeEnd) session.hasExpanded = true;
  };

  /** 处理指针按下事件，初始化区间选择会话 */
  const onPointerDown = (dom: HTMLElement, e: PointerEvent) => {
    if (!isEnabled()) return;
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const entry = itemsMap.get(dom);
    if (!entry) return;

    const status = entry.status();
    if (!isInteractive(status)) return;

    const anchorIndex = registered().indexOf(dom);
    if (anchorIndex === -1) return;

    session = {
      pointerId: e.pointerId,
      anchorIndex,
      dragMode: isSelected(status) ? 'unselect' : 'select',
      lastRange: null,
      baselineStatusMap: new Map(),
      hasExpanded: false,
    };

    applyMultiSelect(anchorIndex);
  };

  /** 处理指针进入事件，更新区间选择状态 */
  const onPointerEnter = (dom: HTMLElement, e: PointerEvent) => {
    if (!isEnabled()) return;
    if (!session) return;
    if (e.pointerId !== session.pointerId) return;

    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      session = null;
      return;
    }

    const index = registered().indexOf(dom);
    if (index !== -1) applyMultiSelect(index);
  };

  /** 全局指针释放事件处理，用于结束区间选择会话 */
  const handleGlobalPointerEnd = (e: PointerEvent) => {
    // 多选后滑回起点时，取消 anchorItem 的选中状态
    if (session && e.pointerId === session.pointerId) {
      if (
        session.hasExpanded &&
        session.lastRange &&
        session.lastRange[0] === session.lastRange[1] &&
        session.lastRange[0] === session.anchorIndex
      )
        restoreIndexStatus(session.anchorIndex);

      session = null;
    }
  };

  /** 注册一个可选择项（按注册顺序分配 index） */
  const register = (dom: HTMLElement) => {
    const [status, setStatus] = createSignal<SelectionStatus>('unselected');

    const entry: MultiSelectModeItem = { status, setStatus };
    itemsMap.set(dom, entry);

    // 计算该元素在选中列表中的顺序（1-based，未选中返回 undefined）
    const order = createMemo(() => {
      const index = selectedDom().indexOf(dom);
      return index === -1 ? undefined : index + 1;
    });

    const cleanup = options.onRegister(dom, status, order);
    if (cleanup) cleanups.push(cleanup);
  };

  const setStatus = (dom: HTMLElement, status: SelectionStatus) =>
    itemsMap.get(dom)?.setStatus(status);

  const getStatus = (dom: HTMLElement) => itemsMap.get(dom)?.status();

  /** 返回当前被选中的 dom 列表（包含 selected/processing/processed 三种状态） */
  const selectedDom = createMemo(() =>
    [...itemsMap.entries()]
      .filter(([, { status }]) => {
        switch (status()) {
          case 'selected':
          case 'processing':
          case 'processed':
            return true;
          default:
            return false;
        }
      })
      .map(([dom]) => dom),
  );

  /** 清空所有选择 */
  const clearSelection = () => {
    session = null;
    itemsMap.clear();

    setIsEnabled(false);
    isInitialized = false;

    for (let i = cleanups.length - 1; i >= 0; i -= 1) cleanups[i]?.();
    cleanups.length = 0;
  };

  /** 启动选择引擎：开启状态并绑定全局结束监听，然后调用 onMount 注册元素。 */
  const start = () => {
    if (isEnabled()) return;

    setIsEnabled(true);
    if (isInitialized) return;

    document.addEventListener('pointerup', handleGlobalPointerEnd);
    document.addEventListener('pointercancel', handleGlobalPointerEnd);
    cleanups.push(() => {
      document.removeEventListener('pointerup', handleGlobalPointerEnd);
      document.removeEventListener('pointercancel', handleGlobalPointerEnd);
    });

    const cleanup = options.onMount(register);
    if (cleanup) cleanups.push(cleanup);
    isInitialized = true;
  };

  /** 收集当前选中项并执行处理 */
  const collect = async <T = void>(
    process: (dom: HTMLElement) => Promisable<T>,
  ): Promise<(T | Error)[]> => {
    setIsEnabled(false);

    // 只过滤出真正未处理的项（避免重复处理 processing/processed 项）
    const doms = selectedDom().filter(
      (s) => itemsMap.get(s)?.status() === 'selected',
    );

    batch(() => {
      for (const dom of doms) setStatus(dom, 'processing');
    });

    const tasks = doms.map(async (dom): Promise<T | Error> => {
      try {
        const result = await process(dom);
        setStatus(dom, 'processed');
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setStatus(dom, errorMessage);
        return error instanceof Error ? error : new Error(String(error));
      }
    });

    const results = await Promise.all(tasks);
    return results;
  };

  return {
    isEnabled,
    start,
    collect,
    clear: clearSelection,
    onPointerDown,
    onPointerEnter,
    registered,
    getStatus,
    setStatus,
    selectedCount: () => selectedDom().length,
  };
};
