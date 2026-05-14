import path from 'node:path';

const plugin = {
  meta: {
    name: 'restricted-relative-imports',
  },
  rules: {
    'no-restricted-relative-imports': {
      meta: {
        fixable: 'code',
        schema: [
          {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                srcPath: { type: 'string' },
                allowed: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['srcPath'],
              additionalProperties: false,
            },
          },
        ],
      },
      create(context) {
        const options = context.options[0] ?? {};
        const cwd = process.cwd();

        function checkImportPath(importPath, node) {
          if (importPath.endsWith('.css')) return;

          for (const [moduleName, config] of Object.entries(options)) {
            const srcPath = config.srcPath;
            const allowed = config.allowed ?? [];

            if (importPath.startsWith(`${moduleName}/`)) {
              if (!allowed.includes(importPath))
                context.report({
                  node,
                  message: `禁止从 '${importPath}' 导入，请使用 import { } from '${moduleName}' 来导入`,
                  fix: (fixer) => fixer.replaceText(node, `'${moduleName}'`),
                });
              return;
            }

            if (!importPath.startsWith('.')) continue;

            const filename = path.resolve(context.filename);
            const resolvedTarget = path.resolve(cwd, srcPath);

            if (filename.startsWith(resolvedTarget + path.sep)) return;

            const resolvedImport = path.resolve(path.dirname(filename), importPath);

            if (
              resolvedImport !== resolvedTarget &&
              !resolvedImport.startsWith(resolvedTarget + path.sep)
            ) continue;

            const isAllowed = allowed.some((a) => {
              const subPath = a.slice(moduleName.length + 1);
              const allowedResolved = path.resolve(cwd, srcPath, subPath);
              return (
                resolvedImport === allowedResolved ||
                resolvedImport.startsWith(allowedResolved + path.sep)
              );
            });
            if (isAllowed) continue;

            context.report({
              node,
              message: `禁止使用相对路径导入 '${moduleName}'，只能使用 import { } from '${moduleName}' 来导入`,
              fix: (fixer) => fixer.replaceText(node, `'${moduleName}'`),
            });
          }
        }

        return {
          ImportDeclaration(node) {
            checkImportPath(node.source.value, node.source);
          },
          ExportNamedDeclaration(node) {
            if (node.source) checkImportPath(node.source.value, node.source);
          },
          ExportAllDeclaration(node) {
            if (node.source) checkImportPath(node.source.value, node.source);
          },
        };
      },
    },
  },
};

export default plugin;
