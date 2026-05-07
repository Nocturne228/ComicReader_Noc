import { listenHotkey } from 'components/Manga';
import { querySelector } from 'helper';

import { type EhFeatureHandler, escHandler } from './helper';

export const addHotkeysActions: EhFeatureHandler = (_, pageCtx) => {
  if (pageCtx.type !== 'gallery')
    return listenHotkey({
      scroll_right: () => querySelector('#unext')?.click(),
      scroll_left: () => querySelector('#uprev')?.click(),
    });

  escHandler.set('取消选中当前标签', () =>
    unsafeWindow.selected_tagname ? unsafeWindow.toggle_tagmenu() : true,
  );

  return listenHotkey({
    // 使用上下方向键进行投票
    ArrowUp: () => unsafeWindow.selected_tagid && unsafeWindow?.tag_vote_up(),
    ArrowDown: () =>
      unsafeWindow.selected_tagid && unsafeWindow?.tag_vote_down(),

    scroll_right: () => querySelector('.ptt td:last-child:not(.ptdd)')?.click(),
    scroll_left: () => querySelector('.ptt td:first-child:not(.ptdd)')?.click(),
  });
};
