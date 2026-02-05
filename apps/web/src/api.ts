export interface LeaderboardEntry {
  player: string;
  score: number;
  createdAt: string;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

export const notifyGameStarted = async (): Promise<void> => {
  await fetch(`${API_BASE}/game-start`, { method: 'POST' });
};

export const submitScore = async (score: number): Promise<void> => {
  await fetch(`${API_BASE}/score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ player: 'Guest', score }),
  }).then(parseJson);
};

export const fetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  const payload = await fetch(`${API_BASE}/leaderboard`).then(
    parseJson<{ leaderboard: LeaderboardEntry[] }>,
  );
  return payload.leaderboard;
};
