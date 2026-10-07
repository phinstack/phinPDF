import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/desktop/src-tauri/**',
      'spikes/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      // Raw HTML injection is how document text becomes XSS (plan §5).
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Never inject raw HTML. Document text is untrusted.',
        },
        {
          selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
          message: 'Never assign innerHTML/outerHTML. Document text is untrusted.',
        },
      ],
      // ADR-0005: only the platform package may talk to Tauri.
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@tauri-apps/*'], message: 'Use @phinpdf/platform (ADR-0005).' }] },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: false }],
      // Flags every obj[key]; too noisy to be useful with TypeScript's checks.
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['packages/platform/src/detect.ts', 'apps/web/src/e2e/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'error',
    },
  },
  {
    files: [
      '**/*.test.{ts,tsx}',
      '**/e2e/**/*.ts',
      'apps/web/vite-plugins/**',
      '**/*.config.{ts,js}',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Tests and build tooling read fixture files by computed path.
      'security/detect-non-literal-fs-filename': 'off',
      // Tests pass hostile URLs on purpose and assert on bare mock methods.
      'no-script-url': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
);
