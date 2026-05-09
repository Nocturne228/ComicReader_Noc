import { getKeyboardCode } from 'helper';

import classes from '../index.module.css';
import { setState, store } from '../store';
import { handleEndTurnPage } from './endPage';
import { openScrollLock } from './helper';
import { handleHotkey } from './hotkeyAction';
import { hotkeysMap } from './hotkeys';
import { isAbreastMode, isScrollMode } from './memo';
import { handleTrackpadWheel } from './pointer';
import { constantScroll, scrollBy } from './scroll';
import { handleScrollModeZoom } from './scrollMode';
import { switchFillEffect } from './switch';
import { turnPage } from './turnPage';
import { zoom } from './zoom';

export const handleMouseDown: EventHandler['on:mousedown'] = (e) => {
  if (e.button !== 1 || store.option.scrollMode.enabled) return;
  e.stopPropagation();
  e.preventDefault();
  switchFillEffect();
};

export const handleKeyDown = (e: KeyboardEvent) => {
  switch ((e.target as HTMLElement).tagName) {
    case 'INPUT':
    case 'TEXTAREA':
      return;
  }
  if ((e.target as HTMLElement).className === classes.hotkeysItem) return;

  const code = getKeyboardCode(e);

  // esc 在触发配置操作前，先用于退出一些界面
  if (e.key === 'Escape') {
    if (store.gridMode) {
      e.stopPropagation();
      e.preventDefault();
      return setState('gridMode', false);
    }

    if (store.show.endPage) {
      e.stopPropagation();
      e.preventDefault();
      return setState('show', 'endPage', undefined);
    }
  }

  // 处理标注了 data-only-number 的元素
  if ((e.target as HTMLElement).dataset.onlyNumber !== undefined) {
    // 拦截能输入数字外的按键
    if (/^(?:Shift \+ )?[a-zA-Z]$/.test(code)) {
      e.stopPropagation();
      e.preventDefault();
    }
    return;
  }

  // 卷轴、网格模式下跳过用于移动的原生按键
  if ((isScrollMode() || store.gridMode) && !store.show.endPage) {
    switch (e.key) {
      case 'Home':
      case 'End':
      case 'ArrowRight':
      case 'ArrowLeft':
        return e.stopPropagation();

      case 'ArrowUp':
      case 'PageUp':
        e.stopPropagation();
        if (isScrollMode()) return handleEndTurnPage('prev');
        return;

      case 'ArrowDown':
      case 'PageDown':
      case ' ':
        e.stopPropagation();
        if (isScrollMode()) return handleEndTurnPage('next');
        return;
    }
  }

  // 拦截已注册的快捷键
  if (Reflect.has(hotkeysMap(), code)) {
    e.stopPropagation();
    e.preventDefault();
  } else return;

  handleHotkey(hotkeysMap()[code], e);
};

export const handleKeyUp = (e: KeyboardEvent) => {
  switch (hotkeysMap()[getKeyboardCode(e)]) {
    // 停止长按滚动
    case 'scroll_left':
    case 'scroll_right':
    case 'scroll_up':
    case 'scroll_down':
      return constantScroll.cancel();
  }
};

/** 判断两个数值是否是整数倍的关系 */
const isMultipleOf = (a: number, b: number) => {
  const decimal = `${a < b ? b / a : a / b}`.split('.')?.[1];
  return !decimal || decimal.startsWith('0000') || decimal.startsWith('9999');
};

let lastDeltaY = -1;
let timeoutId = 0;
let lastPageNum = -1;
let wheelType: undefined | 'trackpad' | 'mouse';
let equalNum = 0;
let diffNum = 0;

export const handleWheel = (e: WheelEvent) => {
  if (store.gridMode) return;
  e.stopPropagation();
  if (e.ctrlKey || e.altKey) e.preventDefault();

  const isWheelDown = e.deltaY > 0;
  const dir = isWheelDown ? 'next' : 'prev';
  const absDeltaY = Math.abs(e.deltaY);

  // 通过`两次滚动距离是否成倍数`和`滚动距离是否过小`来判断是否是触摸板
  if (
    wheelType !== 'trackpad' &&
    (absDeltaY < 5 ||
      (!Number.isInteger(lastDeltaY) &&
        !Number.isInteger(absDeltaY) &&
        !isMultipleOf(lastDeltaY, absDeltaY)))
  ) {
    wheelType = 'trackpad';
    if (timeoutId) clearTimeout(timeoutId);
    // 如果是触摸板滚动，且上次成功触发了翻页，就重新翻页回去
    if (lastPageNum !== -1) setState('activePageIndex', lastPageNum);
  }
  if (absDeltaY < 5) return;

  // 卷轴模式下的图片缩放
  if (
    (e.ctrlKey || e.altKey) &&
    store.option.scrollMode.enabled &&
    store.option.zoom.ratio === 100
  ) {
    e.preventDefault();
    return handleScrollModeZoom(isWheelDown ? 'sub' : 'add');
  }

  if (e.ctrlKey || e.altKey) {
    e.preventDefault();
    return zoom(store.option.zoom.ratio + (isWheelDown ? -25 : 25), e);
  }

  if (handleEndTurnPage(dir)) {
    openScrollLock();
    return e.preventDefault();
  }

  // 并排卷轴模式下
  if (isAbreastMode() && store.option.zoom.ratio === 100) {
    e.preventDefault();
    scrollBy(e.deltaY, true);
  }

  // 防止滚动到网页
  if (!isScrollMode()) e.preventDefault();

  // 为了避免因临时卡顿而误判为触摸板
  // 在连续几次滚动量均相同的情况下，将 wheelType 相关变量重置回初始状态
  if (diffNum < 10) {
    if (lastDeltaY === absDeltaY && absDeltaY > 5) equalNum += 1;
    else {
      diffNum += 1;
      equalNum = 0;
    }

    if (equalNum >= 3) {
      wheelType = undefined;
      lastPageNum = -1;
    }
  }

  lastDeltaY = absDeltaY;

  switch (wheelType) {
    case undefined: {
      if (lastPageNum === -1) {
        // 第一次触发滚动没法判断类型，就当作滚轮来处理
        // 但为了避免触摸板前两次滚动事件间隔大于帧生成时间导致得重新翻页回去的闪烁，加个延迟等待下
        lastPageNum = store.activePageIndex;
        timeoutId = window.setTimeout(turnPage, 16, dir);
        return;
      }
      wheelType = 'mouse';
    }
    // falls through

    case 'mouse':
      return turnPage(dir);

    case 'trackpad':
      return handleTrackpadWheel(e);
  }
};
