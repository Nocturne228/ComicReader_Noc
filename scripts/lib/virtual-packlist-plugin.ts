import { type RolldownPlugin } from 'rolldown';

import { escapeTmplText } from '../plugin';
import { pathResolve, readFile } from './utils';

export const virtualPacklistPlugin = (
  packList: readonly string[],
  extraEntries?: Record<string, string>,
): RolldownPlugin => ({
  name: 'virtual-packlist',
  resolveId(id) {
    if (id === 'virtual:lib-code') return '\0virtual:lib-code';
  },
  load(id) {
    if (id !== '\0virtual:lib-code') return null;
    for (const path of packList)
      this.addWatchFile(pathResolve(`dist/${path}.js`));

    let entries = packList
      .map((path) => {
        const caseName = path === 'userscript/core' ? 'core' : path;
        const fileContent = readFile(pathResolve(`dist/${path}.js`));
        return `  '${caseName}': \`\\n${escapeTmplText(fileContent)}\`,`;
      })
      .join('\n');

    for (const [name, code] of Object.entries(extraEntries ?? {}))
      entries += `\n  '${name}': \`\\n${escapeTmplText(code)}\`,`;

    return `export const libCodeMap = {\n${entries}\n};`;
  },
});
