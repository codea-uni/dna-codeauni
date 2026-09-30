import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.tsbuild/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Choca con no-non-null-assertion: preferimos comprobaciones explícitas o 'as T' puntual.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
    },
  },
  {
    // Archivos de configuración: fuera de los tsconfig, sin chequeo de tipos.
    files: ['**/*.js', '**/*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // core no puede depender del DOM ni de otros paquetes del monorepo.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@cronos/*'], message: 'core no depende de otros paquetes.' },
            {
              group: ['three', 'react', 'react-dom', 'zustand', 'comlink'],
              message: 'core es puro: sin UI/render/workers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@cronos/workers', '@cronos/web', 'react', 'react-dom', 'zustand'],
              message: 'engine solo depende de core y three.',
            },
          ],
        },
      ],
    },
  },
  {
    // api son contratos compartidos: solo core y zod, sin UI ni servidor.
    files: ['packages/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@cronos/engine', '@cronos/workers', '@cronos/web', '@cronos/server'],
              message: 'api solo depende de core.',
            },
            {
              group: ['react', 'react-dom', 'zustand', 'three', 'comlink', 'fastify'],
              message: 'api es solo contratos.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/server/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@cronos/engine',
                '@cronos/workers',
                '@cronos/web',
                'react',
                'react-dom',
                'three',
              ],
              message: 'server solo depende de core y api.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
