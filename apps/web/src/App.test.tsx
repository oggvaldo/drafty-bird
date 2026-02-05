// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./api', () => ({
  fetchLeaderboard: vi.fn(() => new Promise(() => {})),
  notifyGameStarted: vi.fn(async () => undefined),
  submitScore: vi.fn(async () => undefined),
}));

describe('App', () => {
  it('mounts game shell', () => {
    vi.useFakeTimers();
    const view = render(<App />);

    expect(screen.getByRole('heading', { name: /drafty bird/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/game board/i)).toBeInTheDocument();

    view.unmount();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });
});
