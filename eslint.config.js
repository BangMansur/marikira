// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'node_modules/*', 'android/*', 'ios/*', 'coverage/*'] },
  {
    // Architecture rule: core/ is pure TypeScript (unit-testable in Node, no UI or native code).
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-native', 'expo*', '@/features/*', '@/ui/*', '@/db/*'] }],
    },
  },
  {
    // Money must never be logged.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/__tests__/**', 'src/test/**'],
    rules: { 'no-console': 'error' },
  },
]);
