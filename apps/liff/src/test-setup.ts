import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so Testing Library's auto-cleanup is not registered.
afterEach(() => cleanup());

// Test files run in parallel; give findBy* a little longer than the 1 s default.
configure({ asyncUtilTimeout: 5000 });
