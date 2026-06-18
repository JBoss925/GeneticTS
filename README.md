# GeneticTS

GeneticTS is an interactive genetic algorithm simulation built with React, TypeScript, Vite, and Matter.js. A population of candidate launch velocities evolves until a ball reliably reaches a target inside a bounded physics scene.

## What It Demonstrates

- Continuous genome optimization with a two-value velocity genome.
- Matter.js physics evaluation for every candidate in a generation.
- Fitness scoring based on target hits, hit timing, closest approach, and path distance.
- Elitism, rank-biased parent selection, blend crossover, mutation, and random resets.
- Interactive target dragging and configurable environment parameters.
- SVG replay of the best path plus ghost paths from strong candidates.

## Prerequisites

- Node.js 20 or newer
- npm

## Setup

```bash
npm install
```

## Runbook

Start the development server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Build the production bundle:

```bash
npm run build
```

Preview the production bundle:

```bash
npm run preview
```

## Project Structure

```text
src/
  GeneticTsPage.tsx      React UI, controls, SVG scene, replay animation
  genetic-ts.css         Route-level styling
  lib/simulation.ts      Genetic algorithm, physics evaluation, target bounds
  lib/simulation.test.ts Simulation tests
```

## Simulation Model

Each genome is:

```ts
type VelocityGenome = {
  vx: number;
  vy: number;
};
```

Each generation:

1. Evaluates every genome in a fresh Matter.js world.
2. Sorts attempts by descending fitness.
3. Copies the elite subset unchanged.
4. Produces children through rank-biased parent selection and blend crossover.
5. Applies mutation and clamps velocity bounds.
6. Adds a small random-reset tail to preserve exploration.
7. Re-evaluates the new population.

The solved condition requires a high hit rate across consecutive generations, not just one lucky target hit.

## Useful Controls

- Population size: search breadth per generation.
- Mutation rate: exploration pressure.
- Elite share: exploitation pressure.
- Gravity and wind: field forces applied during evaluation.
- Target radius and ball radius: collision difficulty.
- Attempt frames: simulation time budget per candidate.

## Troubleshooting

- If tests fail after dependency upgrades, run `npm install` again to refresh the lockfile installation.
- If the scene looks stale after changing controls, use the reset/reroll controls to create a fresh target and population.
- If local rendering feels slow, reduce population size or ghost path count first.
