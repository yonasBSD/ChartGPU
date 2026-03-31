import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.wgsl', 'examples/**', 'benchmarks/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
      },
    },
    rules: {
      // Naming conventions
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'], leadingUnderscore: 'allow' },
        { selector: 'function', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'interface', format: ['PascalCase'] },
        { selector: 'enum', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['camelCase', 'PascalCase', 'UPPER_CASE'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
      ],

      // Complexity thresholds
      'complexity': ['warn', { max: 20 }],
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],

      // Code quality
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'off',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],

      // TypeScript-specific
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // Technical debt tracking
      'no-warning-comments': ['warn', { terms: ['FIXME', 'HACK', 'XXX'], location: 'start' }],

      // preserve-caught-error requires ES2022 Error cause option which conflicts with ES2020 target
      'preserve-caught-error': 'off',
    },
  },
  {
    files: ['src/**/*.test.ts', 'src/__tests__/**/*.ts', 'src/**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
);
