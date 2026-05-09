import { createEffectOn, useStore } from 'helper';

import { type MangaProps } from '../../components/Manga';

export type ImgFile = { name: string; src: string };
export const { store, setState } = useStore({
  /** 传入单个文件/文件夹时的标题 */
  title: '',
  /** 图片文件数据列表 */
  imgList: [] as ImgFile[],
  /** 是否显示漫画 */
  show: false,
  /** 是否有文件被拖拽到页面上 */
  dragging: false,
  /** 是否有文件正在加载中 */
  loading: false,
  /** 是否要隐藏安装提示 */
  hiddenInstallTip:
    (localStorage.getItem('InstallTip') as '' | 'init' | 'TD') ?? 'init',

  onWaitUrlImgs: undefined as MangaProps['onWaitUrlImgs'],
});
export type State = typeof store;

export const handleExit = () => setState('show', false);

// 将 hiddenInstallTip 的变动同步更新到 localStorage
createEffectOn(
  () => store.hiddenInstallTip,
  (v) => localStorage.setItem('InstallTip', v),
  { defer: true },
);
