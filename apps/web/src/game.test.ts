import { beginGame, createInitialState, hasCollision, stepGame, type Obstacle } from './game';

describe('game logic', () => {
  it('detects collision against obstacle body', () => {
    const state = beginGame(createInitialState(10));
    const obstacle: Obstacle = {
      id: 1,
      x: state.bird.x - 10,
      width: 50,
      gapTop: 0,
      gapHeight: 40,
      passed: false,
    };

    const collided = hasCollision(state.bird, [obstacle]);
    expect(collided).toBe(true);
  });

  it('increments score after passing an obstacle', () => {
    const running = beginGame(createInitialState(25));
    const advanced = stepGame({
      ...running,
      obstacles: [
        {
          id: 1,
          x: running.bird.x - 90,
          width: 60,
          gapTop: 180,
          gapHeight: 180,
          passed: false,
        },
      ],
      bird: {
        ...running.bird,
        y: 250,
      },
    });

    expect(advanced.score).toBe(1);
    expect(advanced.obstacles[0]?.passed).toBe(true);
  });
});
