import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', 'docs/api/**'],
  },
  js.configs.recommended,
  // Non-type-aware TS linting for every .ts file, including root-level
  // tooling configs that sit outside any package's tsconfig "include".
  ...tseslint.configs.recommended,
  // Type-aware linting (needed for rules like no-floating-promises) only
  // for package sources, which are actually covered by a tsconfig project.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['packages/*/src/**/*.ts'],
  })),
  {
    files: ['packages/*/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Requires type information, so it only applies where a tsconfig
      // project actually covers the file (package sources).
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      // TypeScript's own compiler already catches undefined references
      // more accurately than this core rule, which doesn't understand
      // ambient TS declarations and produces false positives.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
  eslintConfigPrettier,
);
