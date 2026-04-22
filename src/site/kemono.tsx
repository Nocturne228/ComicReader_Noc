import MdChecklist from '@material-design-icons/svg/round/checklist.svg';

import {
  createEffectOn,
  isString,
  querySelectorAll,
  querySelectorClick,
  singleThreaded,
  waitDom,
} from 'helper';
import { listenHotkey, request, universalSPA } from 'main';

import { useSelectionManager } from '../userscript/SelectionManager';

const original = () =>
  querySelectorAll<HTMLAnchorElement>('.post__thumbnail a').map((e) => e.href);
const thumbnail = () =>
  querySelectorAll<HTMLImageElement>('.post__thumbnail img').map((e) => e.src);

const handlePwa = () => {
  // 加上跳转至 pwa 的链接
  const zipExtension = new Set(['zip', 'rar', '7z', 'cbz', 'cbr', 'cb7']);
  for (const e of querySelectorAll<HTMLAnchorElement>('.post__attachment a')) {
    if (!zipExtension.has(e.href.split('.').pop()!)) continue;
    const a = document.createElement('a');
    a.href = `https://comic-read.pages.dev/?url=${encodeURIComponent(e.href)}`;
    a.textContent = e.textContent!.replace('Download ', 'ComicReadPWA - ');
    a.className = e.className;
    a.style.opacity = '.6';
    e.parentNode!.insertBefore(a, e.nextElementSibling);
  }
};

universalSPA('kemono', {
  options: {
    autoShow: false,
    defaultOption: { pageNum: 1 },
    /** 加载原图 */
    load_original_image: true,
  },
  getPageType: async () => {
    const listId = location.pathname.match(/\/fanbox\/user\/(\w+)/)?.[1];
    if (listId) return { type: 'list', id: listId };

    const postId = location.pathname.match(/\/post\/(\w+)/)?.[1];
    if (!postId) return;
    return { type: 'manga', id: postId };
  },

  handlers: {
    manga: async ({ store, setState, showComic }) => {
      await waitDom('.post__thumbnail');
      handlePwa();

      // 在切换时重新获取图片
      createEffectOn(
        () => store.options.load_original_image,
        (isOriginal, prev) => {
          setState('nowComic', isOriginal ? 'original' : 'thumbnail');
          if (prev) showComic();
        },
      );

      setState((state) => {
        state.comicMap.original = { getImgList: original };
        state.comicMap.thumbnail = { getImgList: thumbnail };
        state.manga.onNext = querySelectorClick('.post__nav-link.next');
        state.manga.onPrev = querySelectorClick('.post__nav-link.prev');
      });
    },
    list: ({ setState, showComic, options }) => {
      const sm = useSelectionManager((register) => {
        for (const item of querySelectorAll('.post-card')) {
          item.style.position = 'relative';
          register(item);
        }
      });

      const getImgList = async (id: string) => {
        const res = await request<{
          previews: { name: string; path: string; serer: string }[];
        }>(`/api/v1${location.pathname}/post/${id}`, {
          responseType: 'json',
          headers: { Accept: 'text/css' },
        });

        if (options.load_original_image)
          return res.response.previews.map(
            ({ serer, path, name }) => `${serer}/data${path}?f=${name}`,
          );

        return res.response.previews.map(
          ({ path }) => `https://img.${location.host}/thumbnail/data${path}`,
        );
      };

      const multiSelectLoad = singleThreaded(async () => {
        if (!sm.isEnabled()) return sm.start();

        const res = await sm.collect((dom) => dom.dataset.id!);
        const imgLists = await Promise.all(
          res.filter(isString).map(getImgList),
        );
        const imgList = imgLists.flat();
        if (imgList.length === 0) return;
        setState('comicMap', 'selected', { imgList });
        showComic('selected');
      });

      createEffectOn([sm.isEnabled, sm.selectedCount], ([enabled, count]) => {
        setState((state) => {
          state.fab.multiSelectCount = enabled ? count : undefined;
          state.fab.onClick = enabled ? multiSelectLoad : showComic;
        });
      });

      setState('fab', 'extraSpeedDial', [
        {
          name: '多选加载',
          onClick: multiSelectLoad,
          icon: <MdChecklist />,
        },
      ]);

      const unlisten = listenHotkey(
        {
          enter_read_mode: multiSelectLoad,
          multi_select_load: multiSelectLoad,
        },
        true,
      );

      return () => {
        sm.clear();
        unlisten();
      };
    },
  },
});
