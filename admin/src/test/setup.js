import '@testing-library/jest-dom/vitest';

// jsdom lacks matchMedia; layout components read it for responsive behavior.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Clean localStorage between tests so auth state never leaks across suites.
afterEach(() => {
  localStorage.clear();
});
