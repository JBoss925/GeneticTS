import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialSimulationState,
  defaultSimulationConfig,
  evolveSimulation,
  rerollTarget,
  simulationBounds,
  type EvaluatedAttempt,
  type GeneticSimulationConfig,
  type GeneticSimulationState,
  type Point
} from "./lib/simulation";
import "./genetic-ts.css";

type GeneticTsPageProps = {
  standalone?: boolean;
};

const configMeta = [
  { key: "populationSize", label: "Population", min: 16, max: 96, step: 2, format: (value: number) => `${value}` },
  { key: "targetRadius", label: "Target size", min: 12, max: 40, step: 1, format: (value: number) => `${value}px` },
  { key: "gravityStrength", label: "Gravity", min: 0.2, max: 1.8, step: 0.02, format: (value: number) => value.toFixed(2) },
  { key: "ballRadius", label: "Ball size", min: 8, max: 24, step: 1, format: (value: number) => `${value}px` },
  { key: "windDirection", label: "Wind direction", min: -180, max: 180, step: 1, format: (value: number) => `${Math.round(value)}°` },
  { key: "windMagnitude", label: "Wind magnitude", min: 0, max: 0.8, step: 0.01, format: (value: number) => value.toFixed(2) },
  { key: "mutationRate", label: "Mutation rate", min: 0.02, max: 0.6, step: 0.01, format: (value: number) => `${Math.round(value * 100)}%` },
  { key: "elitePercent", label: "Elite share", min: 4, max: 36, step: 1, format: (value: number) => `${Math.round(value)}%` },
  { key: "simulationSpeed", label: "Generations/sec", min: 0.4, max: 6, step: 0.1, format: (value: number) => value.toFixed(1) }
] as const;

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), Math.max(0, length - 1));
}

function useAnimatedBall(path: Point[]) {
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    frameRef.current = 0;
    setFrame(0);
  }, [path]);

  useEffect(() => {
    if (path.length <= 1) {
      return;
    }

    let animationFrame = 0;
    let previousTimestamp = 0;

    const tick = (timestamp: number) => {
      if (!previousTimestamp) {
        previousTimestamp = timestamp;
      }

      const delta = timestamp - previousTimestamp;
      previousTimestamp = timestamp;
      const current = frameRef.current + delta * 0.018;
      frameRef.current = current;
      setFrame(current);
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [path]);

  const index = clampIndex(Math.floor(frame) % Math.max(path.length, 1), path.length);
  return path[index] ?? simulationBounds.launchPoint;
}

function getPolyline(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function GeneticTsPage({ standalone = false }: GeneticTsPageProps) {
  const [config, setConfig] = useState<GeneticSimulationConfig>(defaultSimulationConfig);
  const [simulation, setSimulation] = useState<GeneticSimulationState>(() =>
    createInitialSimulationState(defaultSimulationConfig)
  );

  const bestAttempt = simulation.lastSummary.bestAttempt;
  const animatedBall = useAnimatedBall(bestAttempt.path);
  const topAttempts = useMemo(
    () => simulation.lastSummary.attempts.slice(0, config.ghostCount),
    [config.ghostCount, simulation.lastSummary.attempts]
  );

  useEffect(() => {
    if (simulation.lastSummary.solved) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSimulation((current) => evolveSimulation(current, config));
    }, Math.max(90, 1000 / config.simulationSpeed));

    return () => window.clearTimeout(timeout);
  }, [config, simulation]);

  const updateConfig = <K extends keyof GeneticSimulationConfig>(key: K, value: number) => {
    const nextConfig = { ...config, [key]: value };
    setConfig(nextConfig);
    setSimulation(createInitialSimulationState(nextConfig, Date.now()));
  };

  const reroll = () => setSimulation(rerollTarget(config, Date.now()));
  const resetPopulation = () => setSimulation(createInitialSimulationState(config, Date.now()));
  const resetAll = () => {
    setConfig(defaultSimulationConfig);
    setSimulation(createInitialSimulationState(defaultSimulationConfig, Date.now()));
  };

  const fieldAngle = Math.atan2(
    config.gravityStrength + Math.sin((config.windDirection * Math.PI) / 180) * config.windMagnitude,
    Math.cos((config.windDirection * Math.PI) / 180) * config.windMagnitude
  );

  return (
    <div className={standalone ? "genetic-page genetic-page--standalone" : "genetic-page"}>
      <section className="genetic-shell">
        <header className="genetic-shell__intro">
          <div>
            <span className="genetic-shell__eyebrow">Interactive simulation</span>
            <h1>Genetic Algorithms in TypeScript</h1>
            <p>
              A genetic algorithm learns a launch velocity that sends a ball into a target, then
              adapts as you change the physics.
            </p>
          </div>
          <div className="genetic-shell__intro-stats">
            <div className="genetic-stat">
              <span>Generation</span>
              <strong>{simulation.lastSummary.generation}</strong>
            </div>
            <div className="genetic-stat">
              <span>Hits</span>
              <strong>
                {simulation.lastSummary.hitCount}/{config.populationSize}
              </strong>
            </div>
            <div className="genetic-stat">
              <span>Solved streak</span>
              <strong>{simulation.lastSummary.solvedStreak}</strong>
            </div>
            <div className="genetic-stat">
              <span>Best miss</span>
              <strong>{bestAttempt.minDistance.toFixed(1)}px</strong>
            </div>
          </div>
        </header>

        <div className="genetic-shell__layout">
          <section className="genetic-card genetic-card--scene">
            <div className="genetic-scene__header">
              <div>
                <span className="genetic-section-label">Live scene</span>
                <h2>{simulation.lastSummary.solved ? "Locked on target" : "Learning the throw"}</h2>
              </div>
              <div className="genetic-chip-row">
                <span className="genetic-chip">
                  Best fitness {bestAttempt.fitness.toFixed(0)}
                </span>
                <span className="genetic-chip">
                  Field angle {Math.round((fieldAngle * 180) / Math.PI)}°
                </span>
              </div>
            </div>

            <div className="genetic-scene">
              <svg
                viewBox={`0 0 ${simulationBounds.width} ${simulationBounds.height}`}
                role="img"
                aria-label="Genetic algorithm launch simulation"
              >
                <defs>
                  <linearGradient id="geneticTargetGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7dffb2" />
                    <stop offset="100%" stopColor="#2fd7ff" />
                  </linearGradient>
                </defs>

                <rect
                  x="0"
                  y="0"
                  width={simulationBounds.width}
                  height={simulationBounds.height}
                  rx="20"
                  className="genetic-scene__backdrop"
                />
                <rect
                  x={simulationBounds.wallThickness / 2}
                  y={simulationBounds.wallThickness / 2}
                  width={simulationBounds.width - simulationBounds.wallThickness}
                  height={simulationBounds.height - simulationBounds.wallThickness}
                  rx="18"
                  className="genetic-scene__bounds"
                />

                {topAttempts.slice(1).reverse().map((attempt, index) => (
                  <polyline
                    key={`${attempt.genome.vx}-${attempt.genome.vy}-${index}`}
                    points={getPolyline(attempt.path)}
                    fill="none"
                    className="genetic-scene__ghost"
                    style={{ opacity: 0.08 + index * 0.045 }}
                  />
                ))}

                <polyline
                  points={getPolyline(bestAttempt.path)}
                  fill="none"
                  className="genetic-scene__best-path"
                />

                <circle
                  cx={simulation.target.x}
                  cy={simulation.target.y}
                  r={simulation.target.radius + 10}
                  className="genetic-scene__target-halo"
                />
                <circle
                  cx={simulation.target.x}
                  cy={simulation.target.y}
                  r={simulation.target.radius}
                  fill="url(#geneticTargetGlow)"
                  className="genetic-scene__target"
                />
                <circle
                  cx={simulationBounds.launchPoint.x}
                  cy={simulationBounds.launchPoint.y}
                  r={config.ballRadius + 6}
                  className="genetic-scene__launcher"
                />
                <circle
                  cx={animatedBall.x}
                  cy={animatedBall.y}
                  r={config.ballRadius}
                  className="genetic-scene__ball"
                />
              </svg>
            </div>

            <div className="genetic-actions">
              <button type="button" className="genetic-button" onClick={reroll}>
                Reroll target
              </button>
              <button type="button" className="genetic-button" onClick={resetPopulation}>
                Reset population
              </button>
              <button type="button" className="genetic-button genetic-button--secondary" onClick={resetAll}>
                Reset defaults
              </button>
            </div>
          </section>

          <aside className="genetic-card genetic-card--controls">
            <div className="genetic-controls__intro">
              <span className="genetic-section-label">Controls</span>
              <h2>Change the physics, then watch it adapt.</h2>
              <p>
                Every slider resets the population so the algorithm can relearn the throw under the
                new rules.
              </p>
            </div>

            <div className="genetic-controls">
              {configMeta.map((item) => (
                <label key={item.key} className="genetic-slider">
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.format(config[item.key])}</strong>
                  </div>
                  <input
                    type="range"
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    value={config[item.key]}
                    onChange={(event) => updateConfig(item.key, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

export { GeneticTsPage };
