import { HUMOR_LINES, SCORE_MESSAGE_INTERVAL } from './humor';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

const GRAVITY = 0.32;
const FLAP_VELOCITY = -6.3;
const PIPE_SPEED = 2.9;
const PIPE_WIDTH = 82;
const PIPE_GAP_HEIGHT = 168;
const PIPE_SPAWN_TICKS = 94;
const MIN_GAP_TOP = 70;
const MAX_GAP_TOP = GAME_HEIGHT - PIPE_GAP_HEIGHT - 70;

export type GamePhase = 'idle' | 'running' | 'gameover';

export interface Bird {
  x: number;
  y: number;
  velocityY: number;
  radius: number;
}

export interface Obstacle {
  id: number;
  x: number;
  width: number;
  gapTop: number;
  gapHeight: number;
  passed: boolean;
}

export interface GameState {
  phase: GamePhase;
  runId: number;
  tick: number;
  rngSeed: number;
  nextObstacleTick: number;
  nextObstacleId: number;
  bird: Bird;
  obstacles: Obstacle[];
  score: number;
  statusText: string;
}

const idleStatus = 'Tap Space or click to start sealing drafts.';

export const createInitialState = (seed = 1337): GameState => ({
  phase: 'idle',
  runId: 0,
  tick: 0,
  rngSeed: seed >>> 0,
  nextObstacleTick: PIPE_SPAWN_TICKS,
  nextObstacleId: 1,
  bird: {
    x: 220,
    y: GAME_HEIGHT / 2,
    velocityY: 0,
    radius: 14,
  },
  obstacles: [],
  score: 0,
  statusText: idleStatus,
});

export const beginGame = (state: GameState): GameState => ({
  ...createInitialState(state.rngSeed),
  phase: 'running',
  runId: state.runId + 1,
  statusText: 'Draft Detector deployed.',
});

export const flap = (state: GameState): GameState => {
  if (state.phase !== 'running') {
    return state;
  }

  return {
    ...state,
    bird: {
      ...state.bird,
      velocityY: FLAP_VELOCITY,
    },
  };
};

export const stepGame = (state: GameState): GameState => {
  if (state.phase !== 'running') {
    return state;
  }

  const tick = state.tick + 1;
  let seed = state.rngSeed;
  let nextObstacleId = state.nextObstacleId;
  let nextObstacleTick = state.nextObstacleTick;

  const movedObstacles = state.obstacles
    .map((obstacle) => ({
      ...obstacle,
      x: obstacle.x - PIPE_SPEED,
    }))
    .filter((obstacle) => obstacle.x + obstacle.width > -8);

  if (tick >= nextObstacleTick) {
    const randomResult = nextRandom(seed);
    seed = randomResult.seed;
    const gapTop =
      MIN_GAP_TOP + Math.floor(randomResult.value * (MAX_GAP_TOP - MIN_GAP_TOP + 1));
    movedObstacles.push({
      id: nextObstacleId,
      x: GAME_WIDTH + PIPE_WIDTH,
      width: PIPE_WIDTH,
      gapTop,
      gapHeight: PIPE_GAP_HEIGHT,
      passed: false,
    });
    nextObstacleId += 1;
    nextObstacleTick += PIPE_SPAWN_TICKS;
  }

  const bird = {
    ...state.bird,
    velocityY: state.bird.velocityY + GRAVITY,
  };
  bird.y += bird.velocityY;

  let score = state.score;
  const scoredObstacles = movedObstacles.map((obstacle) => {
    if (!obstacle.passed && obstacle.x + obstacle.width < bird.x) {
      score += 1;
      return { ...obstacle, passed: true };
    }
    return obstacle;
  });

  const collided = hasCollision(bird, scoredObstacles);
  if (collided) {
    return {
      ...state,
      phase: 'gameover',
      tick,
      rngSeed: seed,
      nextObstacleId,
      nextObstacleTick,
      bird,
      obstacles: scoredObstacles,
      score,
      statusText: 'Run complete. The draft won this round.',
    };
  }

  return {
    ...state,
    tick,
    rngSeed: seed,
    nextObstacleId,
    nextObstacleTick,
    bird,
    obstacles: scoredObstacles,
    score,
    statusText: nextStatusText(score, state.statusText),
  };
};

const nextRandom = (seed: number): { seed: number; value: number } => {
  const nextSeed = (seed * 1664525 + 1013904223) >>> 0;
  return {
    seed: nextSeed,
    value: nextSeed / 0xffffffff,
  };
};

const nextStatusText = (score: number, currentStatus: string): string => {
  if (score <= 0 || score % SCORE_MESSAGE_INTERVAL !== 0) {
    return currentStatus;
  }

  const idx = Math.floor(score / SCORE_MESSAGE_INTERVAL - 1) % HUMOR_LINES.length;
  return HUMOR_LINES[idx] ?? currentStatus;
};

export const hasCollision = (bird: Bird, obstacles: Obstacle[]): boolean => {
  if (bird.y - bird.radius <= 0 || bird.y + bird.radius >= GAME_HEIGHT) {
    return true;
  }

  for (const obstacle of obstacles) {
    const intersectsX =
      bird.x + bird.radius > obstacle.x && bird.x - bird.radius < obstacle.x + obstacle.width;

    if (!intersectsX) {
      continue;
    }

    const hitsTop = bird.y - bird.radius < obstacle.gapTop;
    const hitsBottom = bird.y + bird.radius > obstacle.gapTop + obstacle.gapHeight;

    if (hitsTop || hitsBottom) {
      return true;
    }
  }

  return false;
};
