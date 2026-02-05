import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLeaderboard, notifyGameStarted, submitScore, type LeaderboardEntry } from './api';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  beginGame,
  createInitialState,
  flap,
  stepGame,
  type GameState,
} from './game';
import './styles.css';

const TICK_MS = Math.round(1000 / 60);

const drawGame = (canvas: HTMLCanvasElement, state: GameState): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  const bgGradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  bgGradient.addColorStop(0, '#ffffff');
  bgGradient.addColorStop(1, '#f0f7f9');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = '#1C4C75';
  for (const obstacle of state.obstacles) {
    ctx.fillRect(obstacle.x, 0, obstacle.width, obstacle.gapTop);
    ctx.fillRect(
      obstacle.x,
      obstacle.gapTop + obstacle.gapHeight,
      obstacle.width,
      GAME_HEIGHT - (obstacle.gapTop + obstacle.gapHeight),
    );

    ctx.fillStyle = '#2597EC';
    ctx.fillRect(obstacle.x - 4, obstacle.gapTop - 8, obstacle.width + 8, 8);
    ctx.fillRect(obstacle.x - 4, obstacle.gapTop + obstacle.gapHeight, obstacle.width + 8, 8);
    ctx.fillStyle = '#1C4C75';
  }

  ctx.beginPath();
  ctx.fillStyle = '#04B290';
  ctx.arc(state.bird.x, state.bird.y, state.bird.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1C4C75';
  ctx.font = 'bold 42px Lato, system-ui, sans-serif';
  ctx.fillText(`${state.score}`, 28, 52);

  if (state.phase === 'idle' || state.phase === 'gameover') {
    ctx.fillStyle = 'rgba(28, 76, 117, 0.82)';
    ctx.fillRect(120, 185, 720, 160);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px Lato, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      state.phase === 'idle' ? 'Drafty Bird' : 'Run Complete',
      GAME_WIDTH / 2,
      250,
    );
    ctx.font = '400 24px Lato, system-ui, sans-serif';
    ctx.fillText(
      state.phase === 'idle' ? 'Spacebar or click to flap' : 'Use Restart for another run',
      GAME_WIDTH / 2,
      295,
    );
    ctx.textAlign = 'start';
  }
};

const App = (): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const submittedRunRef = useRef<number>(0);

  const [game, setGame] = useState(() => createInitialState());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [apiStatus, setApiStatus] = useState('API available');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGame((prev) => stepGame(prev));
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    drawGame(canvasRef.current, game);
  }, [game]);

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        const data = await fetchLeaderboard();
        setLeaderboard(data);
      } catch {
        setApiStatus('API unreachable. Game remains fully playable.');
      }
    };

    void loadLeaderboard();
  }, []);

  useEffect(() => {
    if (game.phase !== 'gameover') {
      return;
    }

    if (game.runId === 0 || submittedRunRef.current === game.runId) {
      return;
    }

    submittedRunRef.current = game.runId;

    const completeRun = async () => {
      try {
        await submitScore(game.score);
        const data = await fetchLeaderboard();
        setLeaderboard(data);
        setApiStatus('API available');
      } catch {
        setApiStatus('API unreachable. Score saved locally only in this browser session.');
      }
    };

    void completeRun();
  }, [game.phase, game.runId, game.score]);

  const handleFlap = () => {
    if (game.phase === 'idle') {
      setGame((prev) => beginGame(prev));
      void notifyGameStarted().catch(() => {
        setApiStatus('API unreachable. Gameplay unaffected.');
      });
      return;
    }

    setGame((prev) => flap(prev));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }
      event.preventDefault();

      let started = false;
      setGame((prev) => {
        if (prev.phase === 'idle') {
          started = true;
          return beginGame(prev);
        }
        return flap(prev);
      });

      if (started) {
        void notifyGameStarted().catch(() => {
          setApiStatus('API unreachable. Gameplay unaffected.');
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const restartRun = () => {
    setGame((prev) => ({
      ...createInitialState(prev.rngSeed),
      runId: prev.runId,
    }));
  };

  const leaderboardRows = useMemo(() => leaderboard.slice(0, 10), [leaderboard]);

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>Drafty Bird</h1>
        <p>Guide the Draft Detector past leaky ducts and stack up comfort points.</p>
      </header>

      <section className="game-layout">
        <article className="play-panel">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            aria-label="Drafty Bird game board"
            onClick={handleFlap}
            className="game-canvas"
          />
          <div className="meta-row" role="status" aria-live="polite">
            <span>{game.statusText}</span>
            <button type="button" onClick={restartRun}>
              Restart
            </button>
          </div>
          <p className="controls">Controls: press Spacebar or click the game board to flap.</p>
          <p className="api-status">{apiStatus}</p>
        </article>

        <aside className="score-panel">
          <h2>Top 10 Comfort Runs</h2>
          <ol>
            {leaderboardRows.length === 0 ? (
              <li>No scores yet. Start the first run.</li>
            ) : (
              leaderboardRows.map((entry, idx) => (
                <li key={`${entry.player}-${entry.createdAt}-${idx}`}>
                  <span>{entry.player}</span>
                  <strong>{entry.score}</strong>
                </li>
              ))
            )}
          </ol>
        </aside>
      </section>
    </main>
  );
};

export default App;
