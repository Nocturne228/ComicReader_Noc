import type { Promisable } from 'type-fest';

import type { MangaProps } from 'components/Manga';

import {
  isEqual,
  onUrlChange,
  requestIdleCallback,
  sleep,
  wait,
  waitUrlChange,
} from 'helper';

import type { CoreContext } from '.';

import { useInit } from './useInit';

export type UseInitFnMap = AsyncReturnType<typeof useInit>;

export type InitOptions<T extends Record<string, any> = Record<string, any>> = {
  name: string;
  /** 等待返回 true 后才开始运行。用于等待元素渲染 */
  wait?: () => unknown | Promise<unknown>;

  getImgList: (
    coreCtx: CoreContext<T>,
  ) => Promise<MangaProps['imgList']> | MangaProps['imgList'];
  onPrev?: MangaProps['onPrev'];
  onNext?: MangaProps['onNext'];
  onExit?: MangaProps['onExit'];
  onShowImgsChange?: MangaProps['onShowImgsChange'];
  getCommentList?: () => Promise<string[]> | string[];

  /** 初始站点配置 */
  initOptions?: Partial<T>;

  /** 用于适配单页应用的配置项 */
  SPA?: {
    /** 在 URL 发生变化后判断当前页面是否是漫画页 */
    isMangaPage?: () => Promise<unknown> | unknown;
    getOnPrev?: () => Promise<MangaProps['onPrev']> | MangaProps['onPrev'];
    getOnNext?: () => Promise<MangaProps['onNext']> | MangaProps['onNext'];
    /** 有些 SPA 会在页数变更时修改 url，导致脚本误以为换章节了，需要处理下 */
    handleUrl?: (location: Location) => string;
  };
};

/** 对简单站点的通用解 */
export const universal = async <
  T extends Record<string, any> = Record<string, any>,
>({
  name,
  wait: waitFn,
  getImgList,
  onPrev,
  onNext,
  onExit,
  onShowImgsChange,
  getCommentList,
  initOptions,
  SPA,
}: InitOptions<T>) => {
  if (SPA?.isMangaPage) await waitUrlChange(SPA.isMangaPage);
  if (waitFn) await wait(waitFn);

  const coreCtx = await useInit(name, initOptions);
  const { store, setState, showComic } = coreCtx;

  setState('comicMap', '', { getImgList: () => getImgList(coreCtx) });

  setState('manga', { onShowImgsChange });
  if (onExit)
    setState('manga', {
      onExit: (isEnd?: boolean) => {
        onExit?.(isEnd);
        setState('manga', 'show', false);
      },
    });

  if (!SPA) {
    if (onNext ?? onPrev) setState('manga', { onNext, onPrev });
    if (getCommentList)
      setState('manga', 'commentList', await getCommentList());
    return;
  }

  onUrlChange(async () => {
    if (SPA.isMangaPage && !(await SPA.isMangaPage()))
      return setState((state) => {
        state.fab.show = false;
        state.manga.show = false;
        state.comicMap[''].imgList = undefined;
      });

    if (waitFn) await wait(waitFn);

    setState((state) => {
      state.fab.show = undefined;
      state.manga.onPrev = undefined;
      state.manga.onNext = undefined;
      state.flag.needAutoShow = state.options.autoShow;
      state.comicMap[''].imgList = undefined;
    });
    if (store.options.autoShow) await showComic('');

    await Promise.all([
      (async () =>
        getCommentList &&
        setState('manga', 'commentList', await getCommentList()))(),
      (async () =>
        SPA.getOnPrev &&
        setState('manga', { onPrev: await wait(SPA.getOnPrev, 5000) }))(),
      (async () =>
        SPA.getOnNext &&
        setState('manga', { onNext: await wait(SPA.getOnNext, 5000) }))(),
    ]);
  }, SPA?.handleUrl);
};

// TODO: 使用 setupSiteAdapter 重构 universal

/** 用于适配 SPA 站点的页面上下文类型 */
export type SpaPageContext = { type: string; id?: string } & Record<
  string,
  unknown
>;

type CleanupFn<PageContext> = (nextPageCtx?: PageContext) => Promisable<void>;

export type PageHandler<
  PageContext extends SpaPageContext = SpaPageContext,
  Options extends Record<string, unknown> = Record<string, unknown>,
> = (
  coreCtx: CoreContext<Options>,
  pageCtx: PageContext,
) => Promisable<void | CleanupFn<PageContext>>;

export type SpaInitOptions<
  PageContext extends SpaPageContext = SpaPageContext,
  Options extends Record<string, unknown> = Record<string, unknown>,
> = {
  options?: Partial<Options>;
  /**
   * 获取当前页面的上下文信息
   *
   * 返回的对象中，type 字段用于匹配对应的 handler，其值变化将触发重新初始化；
   * id 字段用于标识同一类型下的不同页面实例，在同类型页面切换时用于判断是否需要重新初始化。
   */
  getPageContext: (
    lastPageCtx?: PageContext,
  ) => Promisable<PageContext | undefined>;
  /** 根据 PageContext 自动调用匹配的 handler */
  handlers: {
    /** 在匹配到的 handler 执行前调用，用于放置在所有页面上都要执行的逻辑 */
    all?: PageHandler<PageContext, Options>;
  } & {
    [K in PageContext['type']]?: (
      coreCtx: CoreContext<Options>,
      pageCtx: Extract<PageContext, { type: K }>,
    ) => Promisable<void | CleanupFn<PageContext>>;
  };
  /**
   * 类似 handlers.all，但只会在对应的 options 启用时执行
   *
   * 在匹配的 handlers 执行前调用
   */
  features?: {
    [FeatureName in keyof Options]?: PageHandler<PageContext, Options>;
  };
  handleUrl?: (location: Location) => string;
};

// TODO: wrapIdle 或许可以直接设置为 setupSiteAdapter 的 features 的默认调用方法？
/** 创建延迟执行的功能函数 */
export const wrapIdle =
  <T extends unknown[]>(fn: (...args: T) => void) =>
  async (...args: T) => {
    requestIdleCallback(() => fn(...args), 1000);
  };

export const setupSiteAdapter = async <
  PageContext extends SpaPageContext = SpaPageContext,
  Options extends Record<string, any> = Record<string, any>,
>(
  name: string,
  {
    options: initOptions,
    getPageContext,
    handlers,
    features,
    handleUrl,
  }: SpaInitOptions<PageContext, Options>,
) => {
  let pageCtx: PageContext | undefined;
  const cleanupFns: Array<CleanupFn<PageContext>> = [];

  pageCtx = await waitUrlChange(() => getPageContext(pageCtx));

  const coreCtx = await useInit(name, initOptions);
  const { store, setState, showComic, loadComic, init, options } = coreCtx;

  const processPageContext = async (
    newPageCtx: typeof pageCtx,
    force = false,
  ) => {
    if (!force && isEqual(pageCtx, newPageCtx)) return;

    for (const cleanup of cleanupFns) await cleanup(newPageCtx);
    cleanupFns.length = 0;
    pageCtx = newPageCtx;
    const isMangePage = newPageCtx?.type === 'manga';

    setState((state) => {
      state.fab.show = isMangePage ? undefined : false;
      state.manga.show = false;
    });

    if (!newPageCtx) return;

    init(isMangePage);

    const allCleanup = await handlers.all?.(coreCtx, newPageCtx);
    if (allCleanup) cleanupFns.push(allCleanup);

    if (features) {
      for (const [featureName, handler] of Object.entries(features)) {
        if (!options[featureName as keyof Options]) continue;
        if (!handler) continue;

        const cleanup = await handler(coreCtx, newPageCtx);
        if (cleanup) cleanupFns.push(cleanup);
      }
    }

    const handlerCleanup = await handlers[newPageCtx.type]?.(
      coreCtx,
      newPageCtx,
    );
    if (handlerCleanup) cleanupFns.push(handlerCleanup);

    if (!isMangePage) return;

    const lastImg = store.comicMap[store.nowComic].imgList?.[0];
    const res = await wait(async () => {
      await sleep(200);
      await loadComic();
      return store.comicMap[store.nowComic].imgList?.[0] !== lastImg;
    }, 10 * 1000);
    if (!res) return;

    if (store.options.autoShow) await showComic();
  };

  onUrlChange(
    async (lastUrl) => {
      if (!lastUrl) return await processPageContext(pageCtx, true);
      await processPageContext(await getPageContext(pageCtx));
    },
    handleUrl ? (location) => handleUrl(location) : undefined,
  );
};
