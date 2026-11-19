/* global jest -- Jest setup file */
// UI tests: Reanimated 4's own Jest mock can't load here ("setCSSEventHandler is not available in
// JSReanimated"), and swipe gestures can't be exercised in Jest anyway. Render swipeable rows as
// plain pass-throughs; delete/edit are covered via the detail screen here and by Maestro on device.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }) => children,
}));
