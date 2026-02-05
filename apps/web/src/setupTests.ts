import '@testing-library/jest-dom/vitest';

if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ({
      clearRect: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      fillText: () => {},
      set fillStyle(_value: string) {},
      set font(_value: string) {},
      set textAlign(_value: CanvasTextAlign) {},
    }),
  });
}
