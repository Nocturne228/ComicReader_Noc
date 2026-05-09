import { toast } from 'components/Toast';
import { t } from 'helper';

import { getImgData } from './fileParser';
import { handleExit, setState, store } from './store';

const collator = new Intl.Collator(undefined, { numeric: true });

const sortFiles = (files: File[]) => {
  // 我也不知道这个 path 是哪里来的，总之它就是存在
  // 在 edge 上 webkitRelativePath 为空，但有 path。在火狐上，则是两个属性都有
  const getFilePath = (file: File) =>
    file.webkitRelativePath || (file as any).path || file.name;
  files.sort((a, b) => collator.compare(getFilePath(a), getFilePath(b)));
};

/** 加载新的文件列表 */
export const loadNewImglist = async (files: File[], errorTip?: string) => {
  if (files.length === 0) return;

  if (store.loading) return toast.warn(t('pwa.alert.repeat_load'));

  setState('loading', true);
  sortFiles(files);

  try {
    const imgListRaw = await Promise.all(files.map(getImgData));
    const newImglist = imgListRaw.flat();
    if (newImglist.length === 0) {
      toast.warn(errorTip ?? t('pwa.alert.img_not_found'));
      return;
    }

    handleExit();
    setState((state) => {
      // 在清空上次的列表前把创建的 URL 对象释放掉
      for (const { src } of state.imgList) URL.revokeObjectURL(src);
      state.imgList = [];
    });
    setState((state) => {
      state.imgList = newImglist;
      state.show = true;

      // 在用过一次后提示安装
      if (state.hiddenInstallTip === 'init' && state.imgList.length > 0)
        state.hiddenInstallTip = '';
    });
  } catch (error) {
    toast.error((error as Error).message, { throw: error as Error });
  } finally {
    setState('loading', false);
  }
};
