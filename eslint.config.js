import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import tsdocPlugin from 'eslint-plugin-tsdoc';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';

// Exported declaration shapes that make up a package's public API and
// therefore require a TSDoc comment, per planning/07-coding-conventions.md:
// functions, classes, methods, interfaces, type aliases, and exported
// consts (e.g. the VERSION placeholder). Internal, non-exported helpers
// are intentionally not covered.
const exportedDeclarationContexts = [
  'ExportNamedDeclaration > FunctionDeclaration',
  'ExportDefaultDeclaration > FunctionDeclaration',
  'ExportNamedDeclaration > ClassDeclaration',
  'ExportDefaultDeclaration > ClassDeclaration',
  'ExportNamedDeclaration > TSInterfaceDeclaration',
  'ExportNamedDeclaration > TSTypeAliasDeclaration',
  'ExportNamedDeclaration:has(> VariableDeclaration)',
  'ExportNamedDeclaration > ClassDeclaration MethodDefinition[kind!="constructor"]:not([accessibility="private"])',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'docs/api/**',
      'docs/.vitepress/**',
    ],
  },
  js.configs.recommended,
  // Non-type-aware TS linting for every .ts file, including root-level
  // tooling configs that sit outside any package's tsconfig "include".
  ...tseslint.configs.recommended,
  // Type-aware linting (needed for rules like no-floating-promises) only
  // for package sources that are actually covered by a tsconfig project.
  // Test files are excluded: each package's build tsconfig omits them (so
  // they don't end up compiled into dist/), which means they don't belong
  // to any typed project either.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['packages/*/src/**/*.ts'],
    ignores: ['packages/*/src/**/*.test.ts', 'packages/admin-ui/**'],
  })),
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['packages/*/src/**/*.test.ts', 'packages/admin-ui/**'],
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
      // Underscore-prefixed parameters are a common convention for
      // required-but-unused arguments (e.g. interface methods that don't
      // need every parameter, like an empty TypeORM migration).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  // TSDoc comment enforcement on the public API of package sources
  // (planning/07-coding-conventions.md). Excludes test files, which are
  // not part of a package's public API.
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['packages/*/src/**/*.test.ts', 'packages/admin-ui/**'],
    plugins: {
      tsdoc: tsdocPlugin,
      jsdoc: jsdocPlugin,
    },
    rules: {
      'tsdoc/syntax': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          // The plugin's own defaults (e.g. FunctionDeclaration: true)
          // would require docs on *every* declaration of that shape,
          // exported or not. Enforcement here is driven entirely by
          // `contexts` (exported declarations only), so all defaults are
          // switched off explicitly.
          require: {
            ArrowFunctionExpression: false,
            ClassDeclaration: false,
            ClassExpression: false,
            FunctionDeclaration: false,
            FunctionExpression: false,
            MethodDefinition: false,
          },
          contexts: exportedDeclarationContexts,
          checkGetters: false,
          checkSetters: false,
        },
      ],
      'jsdoc/require-description': [
        'error',
        {
          contexts: exportedDeclarationContexts,
        },
      ],
    },
  },
  // The admin UI (M14) is a browser app: React hooks and accessibility rules
  // instead of the Node packages' type-aware and TSDoc rules.
  {
    files: ['packages/admin-ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // The UI shows other people's calendar and contact text: it is always
      // rendered as text, never as markup (M14, 07-quality).
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'Never inject HTML: event and contact text must be rendered as text.',
        },
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message:
            'Never assign innerHTML: event and contact text must be rendered as text.',
        },
      ],
      // Credentials live in the session; nothing may end up in a console.
      'no-console': 'error',
    },
    languageOptions: { ...jsxA11y.flatConfigs.recommended.languageOptions },
  },
  // Node scripts of the admin UI package (end-to-end server, bundle budget).
  {
    files: ['packages/admin-ui/{e2e,scripts}/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        // Code passed to page.evaluate() runs in the browser.
        document: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
  },
  eslintConfigPrettier,
);
