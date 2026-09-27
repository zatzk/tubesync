import { vi, beforeEach } from 'vitest';
import { fakeBrowser, fakeChrome, resetWebExtensionMocks } from './mocks/webextension';

// Mock webextension-polyfill automatically
vi.mock('webextension-polyfill', () => ({
  default: fakeBrowser,
  ...fakeBrowser,
}));

// Provide globals for environments expecting browser or chrome on globalThis / window
Object.defineProperty(globalThis, 'browser', {
  value: fakeBrowser,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'chrome', {
  value: fakeChrome,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  resetWebExtensionMocks();
});
