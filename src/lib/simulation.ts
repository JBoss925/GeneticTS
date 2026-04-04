import {
  Body,
  Bodies,
  Composite,
  Engine,
  Vector,
  World
} from "matter-js";

export type Point = {
  x: number;
  y: number;
};

export type VelocityGenome = {
  vx: number;
  vy: number;
};

export type Target = Point & {
  radius: number;
};

export type EvaluatedAttempt = {
  genome: VelocityGenome;
  path: Point[];
  fitness: number;
  hit: boolean;
  minDistance: number;
  hitFrame: number | null;
};

export type GenerationSummary = {
  generation: number;
  attempts: EvaluatedAttempt[];
  bestAttempt: EvaluatedAttempt;
  hitCount: number;
  solvedStreak: number;
  solved: boolean;
};

export type GeneticSimulationConfig = {
  populationSize: number;
  targetRadius: number;
  gravityStrength: number;
  ballRadius: number;
  windDirection: number;
  windMagnitude: number;
  mutationRate: number;
  elitePercent: number;
  simulationSpeed: number;
  attemptFrames: number;
  successStreakTarget: number;
  ghostCount: number;
};

export type GeneticSimulationState = {
  seed: number;
  generation: number;
  target: Target;
  population: VelocityGenome[];
  solvedStreak: number;
  bestEverFitness: number;
  lastSummary: GenerationSummary;
};

export const simulationBounds = {
  width: 760,
  height: 460,
  wallThickness: 18,
  launchPoint: { x: 84, y: 368 } satisfies Point,
  safeInset: 48
};

export const defaultSimulationConfig: GeneticSimulationConfig = {
  populationSize: 42,
  targetRadius: 22,
  gravityStrength: 0.98,
  ballRadius: 12,
  windDirection: -18,
  windMagnitude: 0.18,
  mutationRate: 0.18,
  elitePercent: 18,
  simulationSpeed: 1.4,
  attemptFrames: 200,
  successStreakTarget: 3,
  ghostCount: 5
};

type RandomSource = () => number;

function createMulberry32(seed: number): RandomSource {
  let nextSeed = seed >>> 0;

  return () => {
    nextSeed += 0x6d2b79f5;
    let result = Math.imul(nextSeed ^ (nextSeed >>> 15), 1 | nextSeed);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function randomBetween(random: RandomSource, minimum: number, maximum: number) {
  return minimum + (maximum - minimum) * random();
}

function jitter(random: RandomSource, magnitude: number) {
  return (random() * 2 - 1) * magnitude;
}

function rankBiasedPick<T>(items: T[], random: RandomSource): T {
  const index = Math.floor((random() ** 1.7) * items.length);
  return items[index];
}

function getNetField(config: GeneticSimulationConfig) {
  const angle = (config.windDirection * Math.PI) / 180;
  const gravity = { x: 0, y: config.gravityStrength };
  const wind = {
    x: Math.cos(angle) * config.windMagnitude,
    y: Math.sin(angle) * config.windMagnitude
  };

  return {
    x: gravity.x + wind.x,
    y: gravity.y + wind.y
  };
}

function createWalls() {
  const { width, height, wallThickness } = simulationBounds;
  const options = {
    isStatic: true,
    restitution: 0.78,
    friction: 0.05
  };

  return [
    Bodies.rectangle(width / 2, -wallThickness / 2, width, wallThickness, options),
    Bodies.rectangle(width / 2, height + wallThickness / 2, width, wallThickness, options),
    Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, options),
    Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height, options)
  ];
}

function createRandomGenome(random: RandomSource): VelocityGenome {
  return {
    vx: randomBetween(random, 4.5, 15.5),
    vy: randomBetween(random, -16, -2.5)
  };
}

function createPopulation(random: RandomSource, populationSize: number) {
  return Array.from({ length: populationSize }, () => createRandomGenome(random));
}

function createTarget(random: RandomSource, config: GeneticSimulationConfig): Target {
  const { width, height, launchPoint, safeInset } = simulationBounds;
  const radius = config.targetRadius;
  const minimumX = Math.max(launchPoint.x + 120, safeInset + radius);
  const maximumX = width - safeInset - radius;
  const minimumY = safeInset + radius;
  const maximumY = height - safeInset - radius;

  return {
    x: randomBetween(random, minimumX, maximumX),
    y: randomBetween(random, minimumY, maximumY),
    radius
  };
}

function evaluateGenome(
  genome: VelocityGenome,
  target: Target,
  config: GeneticSimulationConfig
): EvaluatedAttempt {
  const engine = Engine.create({
    enableSleeping: false
  });
  const field = getNetField(config);
  engine.gravity.scale = 0.0014;
  engine.gravity.x = field.x;
  engine.gravity.y = field.y;

  const ball = Bodies.circle(
    simulationBounds.launchPoint.x,
    simulationBounds.launchPoint.y,
    config.ballRadius,
    {
      restitution: 0.78,
      friction: 0.012,
      frictionAir: 0.0028,
      slop: 0.02
    }
  );

  World.add(engine.world, [...createWalls(), ball]);
  Body.setVelocity(ball, { x: genome.vx, y: genome.vy });

  const path: Point[] = [];
  let minDistance = Number.POSITIVE_INFINITY;
  let hit = false;
  let hitFrame: number | null = null;
  let restingFrames = 0;

  for (let frame = 0; frame < config.attemptFrames; frame += 1) {
    Engine.update(engine, 1000 / 60);

    const position = { x: ball.position.x, y: ball.position.y };
    path.push(position);

    const distance = Vector.magnitude(
      Vector.sub(position, { x: target.x, y: target.y })
    ) - (target.radius + config.ballRadius);
    minDistance = Math.min(minDistance, Math.max(0, distance));

    if (distance <= 0) {
      hit = true;
      hitFrame = frame;
      break;
    }

    const velocityMagnitude = Vector.magnitude(ball.velocity);
    const onFloor =
      position.y >= simulationBounds.height - simulationBounds.wallThickness - config.ballRadius - 4;

    if (onFloor && velocityMagnitude < 0.22) {
      restingFrames += 1;
      if (restingFrames > 18) {
        break;
      }
    } else {
      restingFrames = 0;
    }
  }

  const pathDistance = path.reduce((total, point, index) => {
    if (index === 0) {
      return 0;
    }

    return total + Vector.magnitude(Vector.sub(point, path[index - 1]));
  }, 0);

  const fitness = hit
    ? 10000 + (config.attemptFrames - (hitFrame ?? config.attemptFrames)) * 18
    : 1800 / (1 + minDistance) - pathDistance * 0.012;

  Composite.clear(engine.world, false);
  Engine.clear(engine);

  return {
    genome,
    path,
    fitness,
    hit,
    minDistance,
    hitFrame
  };
}

function evaluateGeneration(
  population: VelocityGenome[],
  target: Target,
  config: GeneticSimulationConfig
) {
  const attempts = population
    .map((genome) => evaluateGenome(genome, target, config))
    .sort((left, right) => right.fitness - left.fitness);

  const hitCount = attempts.filter((attempt) => attempt.hit).length;

  return {
    attempts,
    bestAttempt: attempts[0],
    hitCount
  };
}

function breedNextPopulation(
  attempts: EvaluatedAttempt[],
  config: GeneticSimulationConfig,
  random: RandomSource
) {
  const populationSize = config.populationSize;
  const eliteCount = clamp(
    Math.round((config.elitePercent / 100) * populationSize),
    2,
    Math.max(2, populationSize - 1)
  );
  const parentPool = attempts.slice(0, Math.max(eliteCount + 2, Math.ceil(populationSize * 0.4)));
  const nextPopulation: VelocityGenome[] = attempts
    .slice(0, eliteCount)
    .map((attempt) => ({ ...attempt.genome }));

  const randomResetCount = Math.max(1, Math.round(populationSize * 0.08));

  while (nextPopulation.length < populationSize - randomResetCount) {
    const parentA = rankBiasedPick(parentPool, random).genome;
    const parentB = rankBiasedPick(parentPool, random).genome;
    const blend = randomBetween(random, 0.28, 0.72);

    const child: VelocityGenome = {
      vx: parentA.vx * blend + parentB.vx * (1 - blend),
      vy: parentA.vy * blend + parentB.vy * (1 - blend)
    };

    if (random() < config.mutationRate) {
      child.vx += jitter(random, 1.8 + config.windMagnitude * 3.5);
      child.vy += jitter(random, 2.2 + config.gravityStrength * 1.4);
    }

    child.vx = clamp(child.vx, 2.2, 18);
    child.vy = clamp(child.vy, -18, 3.5);
    nextPopulation.push(child);
  }

  while (nextPopulation.length < populationSize) {
    nextPopulation.push(createRandomGenome(random));
  }

  return nextPopulation;
}

export function createInitialSimulationState(
  config: GeneticSimulationConfig = defaultSimulationConfig,
  seed = Date.now()
): GeneticSimulationState {
  const random = createMulberry32(seed);
  const population = createPopulation(random, config.populationSize);
  const target = createTarget(random, config);
  const evaluated = evaluateGeneration(population, target, config);

  return {
    seed,
    generation: 1,
    target,
    population,
    solvedStreak: evaluated.hitCount === config.populationSize ? 1 : 0,
    bestEverFitness: evaluated.bestAttempt.fitness,
    lastSummary: {
      generation: 1,
      attempts: evaluated.attempts,
      bestAttempt: evaluated.bestAttempt,
      hitCount: evaluated.hitCount,
      solvedStreak: evaluated.hitCount === config.populationSize ? 1 : 0,
      solved: false
    }
  };
}

export function evolveSimulation(
  current: GeneticSimulationState,
  config: GeneticSimulationConfig
): GeneticSimulationState {
  if (current.lastSummary.solved) {
    return current;
  }

  const random = createMulberry32(current.seed + current.generation * 101);
  const nextPopulation = breedNextPopulation(current.lastSummary.attempts, config, random);
  const evaluated = evaluateGeneration(nextPopulation, current.target, config);
  const solvedStreak =
    evaluated.hitCount === config.populationSize ? current.solvedStreak + 1 : 0;
  const solved = solvedStreak >= config.successStreakTarget;

  return {
    seed: current.seed,
    generation: current.generation + 1,
    target: current.target,
    population: nextPopulation,
    solvedStreak,
    bestEverFitness: Math.max(current.bestEverFitness, evaluated.bestAttempt.fitness),
    lastSummary: {
      generation: current.generation + 1,
      attempts: evaluated.attempts,
      bestAttempt: evaluated.bestAttempt,
      hitCount: evaluated.hitCount,
      solvedStreak,
      solved
    }
  };
}

export function rerollTarget(
  config: GeneticSimulationConfig,
  seed = Date.now()
): GeneticSimulationState {
  return createInitialSimulationState(config, seed);
}
