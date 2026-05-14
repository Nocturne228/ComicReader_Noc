import { type RenderedChunk } from 'rolldown';
import { type Promisable } from 'type-fest';

export type TransformFn = (
  code: string,
  chunk: RenderedChunk,
  addWatchFile?: (file: string) => void,
) => Promisable<string | undefined>;

export const codeEdit = (name: string, ...fnList: TransformFn[]) => {
  let addWatchFile: ((file: string) => void) | undefined;
  return {
    name,
    buildStart(this: { addWatchFile: (file: string) => void }) {
      addWatchFile = this.addWatchFile.bind(this);
    },
    async renderChunk(code: string, chunk: RenderedChunk) {
      for (const fn of fnList) {
        const newCode = await fn(code, chunk, addWatchFile);
        if (typeof newCode === 'string') code = newCode;
      }
      return code;
    },
  };
};
