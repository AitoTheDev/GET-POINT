import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so Testing Library's auto-cleanup is not registered.
afterEach(() => cleanup());

// The first Ant Design render in each test file can take over the 1 s default when the
// test files run in parallel; wait longer before a findBy* gives up.
configure({ asyncUtilTimeout: 5000 });

// Receipt images are shown from object URLs, which jsdom does not provide.
URL.createObjectURL = () => 'blob:receipt';
URL.revokeObjectURL = () => {};

// Ant Design reads these browser APIs, which jsdom does not provide.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
