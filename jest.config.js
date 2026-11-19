/** Two projects: fast Node tests for pure logic + SQL, and React Native component tests. */
const transformIgnorePatterns = [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/.*))',
];
const moduleNameMapper = { '^@/(.*)$': '<rootDir>/src/$1' };

module.exports = {
  projects: [
    {
      displayName: 'unit',
      preset: 'jest-expo',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      setupFiles: ['<rootDir>/jest.setup.node.js'],
      transformIgnorePatterns,
      moduleNameMapper,
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.tsx'],
      setupFiles: ['<rootDir>/jest.setup.node.js'],
      transformIgnorePatterns,
      moduleNameMapper,
    },
  ],
};
