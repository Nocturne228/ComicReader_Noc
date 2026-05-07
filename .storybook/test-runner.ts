// oxlint-disable typescript/no-unsafe-argument
import percySnapshot from '@percy/playwright';
import {
  type TestRunnerConfig,
  waitForPageReady,
} from '@storybook/test-runner';

// oxlint-disable-next-line promise/avoid-new no-promise-executor-return typescript/strict-void-return
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const config: TestRunnerConfig = {
  async postVisit(page, context) {
    await waitForPageReady(page);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await sleep(1000);
    // 虽然 TS 报错，但确实是有生效的
    await percySnapshot(page, context.id, { width: 1920 } as any);

    await page.setViewportSize({ width: 768, height: 1080 });
    await sleep(1000);
    await percySnapshot(page, context.id, { width: 768 } as any);
  },
};

export default config;
