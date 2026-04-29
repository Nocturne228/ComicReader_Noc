import { createSignal } from 'solid-js';

import { createRootMemo, extractRange, t, useCache } from 'helper';

import type { GalleryHandler } from './helper';

export const multiSelectLoad: GalleryHandler<
  Promise<{
    loadImgs: () => number[];
    handleClick: (e: MouseEvent) => Promise<void>;
  }>
> = async (coreCtx, { imgNum, imgList, galleryId }) => {
  const { setState, showComic } = coreCtx;
  const [loadImgsText, setLoadImgsText] = createSignal(`1-${imgNum}`);

  /** 需要加载的图片的 index */
  const loadImgs = createRootMemo(() =>
    // oxlint-disable-next-line explicit-length-check
    [...extractRange(loadImgsText(), imgList.length || imgNum)],
  );

  const cache = await useCache<{
    pageRange: { id: number; range: string };
  }>({ pageRange: 'id' });

  const handleClick = async (e: MouseEvent) => {
    if (!e.shiftKey) return;
    e.stopPropagation();

    const saveRange = await cache.get('pageRange', unsafeWindow.gid);
    // eslint-disable-next-line no-alert
    const pageRange = prompt(t('other.page_range'), saveRange?.range);
    if (!pageRange) return;
    await cache.set('pageRange', {
      id: unsafeWindow.gid ?? galleryId,
      range: pageRange,
    });

    setLoadImgsText(pageRange ?? `1-${imgNum}`);
    // 删掉当前的图片列表以便触发重新加载
    setState('comicMap', '', 'imgList', undefined);
    showComic();
  };

  return { loadImgs, handleClick };
};
