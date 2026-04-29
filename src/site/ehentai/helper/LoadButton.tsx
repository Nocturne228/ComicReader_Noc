import { createMemo } from 'solid-js';

import type { EhFeatureHandler } from './context';

/** 放在原生右侧工具栏和标签选项里的漫画加载按钮 */
export const LoadButton = (props: {
  id: string;
  context: Parameters<EhFeatureHandler>[0];
  imgNum: number;
  onClick?: (e: Event) => void;
}) => {
  const tip = createMemo(() => {
    const imgList = props.context.store.comicMap[props.id]?.imgList;
    if (imgList?.length === 0) return ` loading - 0/${props.imgNum}`;
    const progress = imgList?.filter(Boolean).length;

    switch (imgList?.length) {
      case undefined:
        return ' Load comic';
      case progress:
        return ' Read';
      default:
        return ` loading - ${progress}/${props.imgNum}`;
    }
  });
  return (
    <a
      href="javascript:;"
      onClick={async (e) => {
        props.onClick?.(e);
        props.context.showComic(props.id);
      }}
      children={tip()}
    />
  );
};
