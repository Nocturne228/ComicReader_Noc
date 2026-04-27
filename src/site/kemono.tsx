import {
  createEffectOn,
  querySelectorAll,
  querySelectorClick,
  waitDom,
} from 'helper';
import { request, universalSPA } from 'main';

import {
  useMultiSelectLoad,
  type UseMultiSelectLoadReturn,
} from '../userscript/multiSelect';

const original = () =>
  querySelectorAll<HTMLAnchorElement>('.post__thumbnail a').map((e) => e.href);
const thumbnail = () =>
  querySelectorAll<HTMLImageElement>('.post__thumbnail img').map((e) => e.src);

const handlePwa = () => {
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

/** 多选加载实例，用于在翻页时保持选中状态 */
let multiSelectLoader: UseMultiSelectLoadReturn | undefined;

universalSPA('kemono', {
  options: {
    autoShow: false,
    defaultOption: { pageNum: 1 },
    /** 加载原图 */
    load_original_image: true,
  },
  getPageType: async () => {
    const listId = location.pathname.match(/\/fanbox\/user\/(\w+)/)?.[1];
    if (listId) {
      const offset = Number(new URLSearchParams(location.search).get('o')) || 0;
      return { type: 'list', id: listId, offset } as const;
    }

    const postId = location.pathname.match(/\/post\/(\w+)/)?.[1];
    if (!postId) return;
    return { type: 'manga', id: postId } as const;
  },

  handlers: {
    manga: async ({ store, setState, showComic }) => {
      await waitDom('.post__thumbnail');
      handlePwa();

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
    list: async (mainContext, { id, offset }) => {
      const { options } = mainContext;

      // 首次进入列表时初始化多选加载器
      if (!multiSelectLoader) {
        multiSelectLoader = await useMultiSelectLoad(mainContext, {
          id,
          onStart: () => {
            for (const item of querySelectorAll('.post-card'))
              item.style.position = 'relative';
          },
          getImgList: async (postId) => {
            const res = await request<{
              previews: { name: string; path: string; serer: string }[];
            }>(`/api/v1${location.pathname}/post/${postId}`, {
              responseType: 'json',
              headers: { Accept: 'text/css' },
            });

            if (options.load_original_image)
              return res.response.previews.map(
                ({ serer, path, name }) => `${serer}/data${path}?f=${name}`,
              );

            return res.response.previews.map(
              ({ path }) =>
                `https://img.${location.host}/thumbnail/data${path}`,
            );
          },
        });
      }

      await multiSelectLoader.registerItems(id, async (map) => {
        for (const dom of await waitDom('.post-card', 20))
          map.set(dom, dom.dataset.id!);
      });

      // 页面切换时根据下一页类型决定清理策略
      return (nextPageType) => {
        // 同一 list 翻页，只清理副作用，保留实例和选中状态
        multiSelectLoader?.unmount();

        // 切换到不同页面时，完全清理
        if (nextPageType?.type !== 'list' || nextPageType?.id !== id) {
          multiSelectLoader?.dispose();
          multiSelectLoader = undefined;
        }
      };
    },
  },
});
