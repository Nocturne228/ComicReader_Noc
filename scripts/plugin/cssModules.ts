import autoprefixer from 'autoprefixer';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import postcssImport from 'postcss-import';
import postcssModules from 'postcss-modules';
import postcssNesting from 'postcss-nesting';

export const cssModules = () => ({
  name: 'self-css-modules',

  async load(id: string) {
    const isInline = id.endsWith('.module.css?inline');
    if (!id.endsWith('.module.css') && !isInline) return null;

    const filePath = isInline ? id.replace('?inline', '') : id;
    const cssContent = await readFile(filePath, 'utf8');

    let cssModulesJson: Record<string, string> = {};

    const result = await postcss([
      postcssImport(),
      postcssNesting(),
      autoprefixer(),
      postcssModules({
        generateScopedName: '[local]___[hash:base64:5]',
        getJSON(_cssFilename: string, json: Record<string, string>) {
          cssModulesJson = json;
        },
      }),
    ]).process(cssContent, { from: filePath });

    return {
      code: isInline
        ? `export default ${JSON.stringify(result.css)};`
        : [
            `const classes = ${JSON.stringify(cssModulesJson)};`,
            'export default classes;',
          ].join('\n'),
      moduleType: 'js' as const,
      moduleSideEffects: true,
    };
  },
});
