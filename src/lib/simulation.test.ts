import {
  createInitialSimulationState,
  defaultSimulationConfig,
  evolveSimulation,
  simulationBounds
} from "./simulation";

describe("genetic simulation", () => {
  it("places the target within the boxed playfield", () => {
    const state = createInitialSimulationState(defaultSimulationConfig, 42);

    expect(state.target.x).toBeGreaterThan(0);
    expect(state.target.x).toBeLessThan(simulationBounds.width);
    expect(state.target.y).toBeGreaterThan(0);
    expect(state.target.y).toBeLessThan(simulationBounds.height);
  });

  it("improves best fitness across several generations for a fixed seed", () => {
    let state = createInitialSimulationState(defaultSimulationConfig, 1337);
    const startingFitness = state.lastSummary.bestAttempt.fitness;

    for (let generation = 0; generation < 12; generation += 1) {
      state = evolveSimulation(state, defaultSimulationConfig);
    }

    expect(state.bestEverFitness).toBeGreaterThan(startingFitness);
  });
});
