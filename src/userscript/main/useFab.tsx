import MdCloudDownload from '@material-design-icons/svg/round/cloud_download.svg';
import MdImageSearch from '@material-design-icons/svg/round/image_search.svg';
import MdImportContacts from '@material-design-icons/svg/round/import_contacts.svg';
import MdMenuBook from '@material-design-icons/svg/round/menu_book.svg';
import type { Accessor } from 'solid-js';
import type { ComicImgData } from 'components/Manga';
import type { UseDrag } from 'helper';
import { createEffect } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import { Fab } from 'components/Fab';
import { imgList } from 'components/Manga';
import {
  createEffectOn,
  createRootMemo,
  isNumber,
  mountComponents,
  t,
  useDrag,
  useStyle,
  useStyleMemo,
} from 'helper';

import type { MainContext } from '.';

import { useSpeedDial } from '.';

export const useFab = <T extends Record<string, any>>(
  mainContext: MainContext<T>,
  nowImgList: Accessor<(string | ComicImgData)[] | undefined>,
) => {
  const { store, setState, options, setOptions } = mainContext;

  useStyle(`
    #fab {
      --text-bg: transparent;

      position: fixed;
      right: calc(3vw - var(--left, 0px));
      bottom: calc(6vh - var(--top, 0px));

      font-size: clamp(12px, 1.5vw, 16px);
    }
  `);

  useStyleMemo('#fab', {
    '--left': () => `${options.fabPosition.left}px`,
    '--top': () => `${options.fabPosition.top}px`,
  });

  /** 当前已取得 url 的图片数量 */
  const doneImgNum = createRootMemo(
    () => nowImgList()?.filter(Boolean)?.length,
  );

  /** 已加载完毕的图片数量 */
  const loadedImgNum = createRootMemo(() => {
    let i = 0;
    for (const img of imgList()) if (img.loadType === 'loaded') i += 1;
    return i;
  });

  createEffectOn(
    [
      doneImgNum,
      loadedImgNum,
      () => nowImgList()?.length,
      () => store.fab.multiSelectCount,
    ],
    ([doneNum, loadNum, totalNum, multiSelectCount]) =>
      setState((state) => {
        if (isNumber(multiSelectCount)) {
          state.fab.children = (
            <div style={{ 'text-align': 'center', 'line-height': 1.2 }}>
              <span style={{ opacity: 0.6, 'font-size': '0.75em' }}>
                {t('other.selected')}
              </span>
              <br />
              {multiSelectCount}
            </div>
          );
          state.fab.tip = t('other.multi_select_mode');
          return;
        }

        state.fab.children = undefined;

        if (totalNum === undefined || doneNum === undefined) {
          state.fab.progress = undefined;
          return;
        }

        if (totalNum === 0) {
          state.fab.progress = 0;
          state.fab.tip = `${t('other.loading_img')} - ${doneNum}/${totalNum}`;
          return;
        }

        if (doneNum < totalNum) {
          state.fab.progress = doneNum / totalNum;
          state.fab.tip = `${t('other.loading_img')} - ${doneNum}/${totalNum}`;
          return;
        }

        if (loadNum < totalNum) {
          state.fab.progress = 1 + loadNum / totalNum;
          state.fab.tip = `${t('other.img_loading')} - ${loadNum}/${totalNum}`;
          return;
        }

        state.fab.progress = 1 + loadNum / totalNum;
        state.fab.tip = t('other.read_mode');
        state.fab.show = !options.hiddenFAB && undefined;
      }),
  );

  const FabIcon = () => {
    switch (store.fab.progress) {
      case undefined:
        return MdImportContacts; // 没有内容的书
      case 1:
      case 2:
        return MdMenuBook; // 有内容的书
      default:
        return store.fab.progress > 1 ? MdCloudDownload : MdImageSearch;
    }
  };

  const handleMount = (ref: HTMLElement) => {
    const handleDrag: UseDrag = ({ xy: [x, y], last: [lx, ly] }) => {
      const left = options.fabPosition.left + x - lx;
      const top = options.fabPosition.top + y - ly;
      setOptions({ fabPosition: { left, top } });
    };
    useDrag({ ref, handleDrag, setCapture: true });

    // 超出显示范围就恢复原位
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.length !== 1 || entries[0].isIntersecting) return;
        setOptions({ fabPosition: { left: 0, top: 0 } });
      },
      { threshold: 0.5 },
    );
    observer.observe(ref);
  };

  const dom = mountComponents('fab', () => {
    createEffect(() => {
      setState('fab', {
        placement:
          -options.fabPosition.left < window.innerWidth / 2 ? 'left' : 'right',
        speedDialPlacement:
          -options.fabPosition.top < window.innerHeight / 2 ? 'top' : 'bottom',
      });
    });

    return (
      <Fab ref={handleMount} {...store.fab}>
        {store.fab.children ?? <Dynamic component={FabIcon()} />}
      </Fab>
    );
  });
  dom.style.setProperty('z-index', '2147483646', 'important');

  useSpeedDial(mainContext);
};
