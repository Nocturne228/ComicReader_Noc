import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 80,
  singleQuote: true,
  sortImports: {
    groups: [
      'type-import', // TypeScript 类型导入
      ['value-builtin', 'value-external'], // 值导入：Node.js 内置模块 + 外部依赖
      'type-internal', // 类型导入：项目内部模块
      'value-internal', // 值导入：项目内部模块
      ['type-parent', 'type-sibling', 'type-index'], // 类型导入：父级/同级/索引模块
      ['value-parent', 'value-sibling', 'value-index'], // 值导入：父级/同级/索引模块
      'unknown', // 未知类型
    ],
  },
  sortTailwindcss: {},
  sortPackageJson: true,

  // 避免在 package.json 添加尾随逗号
  overrides: [
    {
      files: ['*.json', '*.json5', '*.jsonc'],
      options: {
        trailingComma: 'none',
      },
    },
  ],

  ignorePatterns: [
    '**/dist/**',
    '**/public/**',
    '**/dev-dist/**',
    '**/assets/**',
    '**/**.js',
    '**/**.mjs',
    '**/**.json5',
    'ComicReader.umd.d.ts',
  ],
});
