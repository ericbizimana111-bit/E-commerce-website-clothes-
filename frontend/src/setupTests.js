// UgaMarket — home to home | Jest test environment setup
//
// 1. Register @testing-library/jest-dom matchers (toBeInTheDocument, etc.).
import '@testing-library/jest-dom';

// 2. react-router v7 (pulled in via react-router-dom) references TextEncoder
//    at module load. Node provides it globally, but CRA's jsdom test
//    environment (Jest 27) does not, so we polyfill it here.
const { TextEncoder, TextDecoder } = require('util');

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}
