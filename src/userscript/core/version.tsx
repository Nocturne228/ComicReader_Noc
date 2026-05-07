import { toast } from 'components/Toast';
import { ensureGmValue, lang } from 'helper';
import { Show } from 'solid-js';

import { migration, versionLt } from './migration';

/** 处理版本更新相关 */
export const handleVersionUpdate = async () => {
  const version = await ensureGmValue('@Version', GM.info.script.version);
  if (version === GM.info.script.version) return;

  await migration(version); // 每次版本更新都执行一遍迁移

  // 只在语言为中文时弹窗提示最新更新内容
  if (lang() === 'zh') {
    toast(
      () => (
        /* oxlint-disable i18next/no-literal-string */
        <>
          <h2>🥳 ComicRead 已更新到 v{GM.info.script.version}</h2>
          inject@LatestChange
          <Show when={versionLt(version, '12')}>
            <h3>新增</h3>
            <ul>
              <li>实现图片放大功能（需要打开「图像识别」功能）</li>
              <li>增加 ehentai 在缩略图列表页里展开标签列表功能</li>
            </ul>
          </Show>
        </>
        /* eslint-enable i18next/no-literal-string */
      ),
      {
        id: 'Version Tip',
        type: 'custom',
        duration: Number.POSITIVE_INFINITY,
        // 手动点击关掉通知后才不会再次弹出
        onDismiss: () => GM.setValue('@Version', GM.info.script.version),
      },
    );

    // 监听储存的版本数据的变动，如果和当前版本一致就关掉弹窗
    // 防止在更新版本后一次性打开多个页面，不得不一个一个关过去
    const listenerId = await GM.addValueChangeListener(
      '@Version',
      async (_, __, newVersion) => {
        if (newVersion !== GM.info.script.version) return;
        toast.dismiss('Version Tip');
        await GM.removeValueChangeListener(listenerId);
      },
    );
  } else await GM.setValue('@Version', GM.info.script.version);
};
