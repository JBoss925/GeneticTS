import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampTargetToBounds,
  createInitialSimulationState,
  defaultSimulationConfig,
  evolveSimulation,
  reconfigureSimulation,
  simulationBounds,
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
  { key: "windMagnitude", label: "Wind magnitude", min: 0, max: 1, step: 0.01, format: (value: number) => value.toFixed(2) },
  { key: "mutationRate", label: "Mutation rate", min: 0.02, max: 0.6, step: 0.01, format: (value: number) => `${Math.round(value * 100)}%` },
  { key: "elitePercent", label: "Elite share", min: 4, max: 36, step: 1, format: (value: number) => `${Math.round(value)}%` }
] as const;

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), Math.max(0, length - 1));
}

function getPointDelta(from: Point, to: Point) {
  return {
    x: to.x - from.x,
    y: to.y - from.y
  };
}

function getMagnitude(vector: Point) {
  return Math.hypot(vector.x, vector.y);
}

const minimumReplayDurationMs = 800;
const replayFramesPerMillisecond = 0.06;

function useAnimatedBall(path: Point[], onCycleComplete?: () => void) {
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const cycleCountRef = useRef(0);
  const onCycleCompleteRef = useRef(onCycleComplete);

  useEffect(() => {
    onCycleCompleteRef.current = onCycleComplete;
  }, [onCycleComplete]);

  useEffect(() => {
    frameRef.current = 0;
    cycleCountRef.current = 0;
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
      const pathLength = Math.max(path.length, 1);
      const current = frameRef.current + delta * replayFramesPerMillisecond;

      if (pathLength > 1) {
        const minimumCycles = Math.max(
          1,
          Math.ceil((minimumReplayDurationMs * replayFramesPerMillisecond) / pathLength)
        );
        const cycleCount = Math.floor(current / pathLength);

        if (cycleCount > cycleCountRef.current && cycleCount >= minimumCycles) {
          cycleCountRef.current = cycleCount;
          onCycleCompleteRef.current?.();
        }
      }

      frameRef.current = current;
      setFrame(current);
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [path]);

  const pathLength = Math.max(path.length, 1);
  const index = clampIndex(Math.floor(frame) % pathLength, path.length);
  const point = path[index] ?? simulationBounds.launchPoint;
  const nextPoint =
    path[path.length <= 1 ? index : (index + 1) % path.length] ?? point;
  const velocity = getPointDelta(point, nextPoint);

  return {
    point,
    velocity,
    speed: getMagnitude(velocity)
  };
}

function getPolyline(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function getSvgPointFromPointer(
  event: ReactPointerEvent<SVGSVGElement | SVGCircleElement | SVGGElement>,
  svg: SVGSVGElement
) {
  const rect = svg.getBoundingClientRect();
  const scaleX = simulationBounds.width / rect.width;
  const scaleY = simulationBounds.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function GeneticTsPage({ standalone = false }: GeneticTsPageProps) {
  const [config, setConfig] = useState<GeneticSimulationConfig>(defaultSimulationConfig);
  const [simulation, setSimulation] = useState<GeneticSimulationState>(() =>
    createInitialSimulationState(defaultSimulationConfig)
  );
  const [isPaused, setIsPaused] = useState(false);
  const [isDraggingTarget, setIsDraggingTarget] = useState(false);
  const pendingSimulationRef = useRef<GeneticSimulationState | null>(null);
  const isPausedRef = useRef(isPaused);
  const solvedRef = useRef(simulation.lastSummary.solved);
  const sceneSvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    solvedRef.current = simulation.lastSummary.solved;
  }, [simulation.lastSummary.solved]);

  const bestAttempt = simulation.lastSummary.bestAttempt;
  const animatedBall = useAnimatedBall(bestAttempt.path, () => {
    if (isPausedRef.current || solvedRef.current) {
      return;
    }

    if (pendingSimulationRef.current) {
      setSimulation(pendingSimulationRef.current);
      pendingSimulationRef.current = null;
    }
  });
  const topAttempts = useMemo(
    () => simulation.lastSummary.attempts.slice(0, config.ghostCount),
    [config.ghostCount, simulation.lastSummary.attempts]
  );

  useEffect(() => {
    pendingSimulationRef.current =
      simulation.lastSummary.solved || isPaused
        ? null
        : evolveSimulation(simulation, config);
  }, [config, isPaused, simulation]);

  const updateConfig = <K extends keyof GeneticSimulationConfig>(key: K, value: number) => {
    const nextConfig = { ...config, [key]: value };
    setConfig(nextConfig);
    setIsPaused(false);
    setSimulation((current) => reconfigureSimulation(current, nextConfig, Date.now()));
  };

  const moveTarget = (point: Point) => {
    setIsPaused(false);
    setSimulation((current) =>
      reconfigureSimulation(
        current,
        config,
        Date.now(),
        clampTargetToBounds(
          {
            x: point.x,
            y: point.y,
            radius: config.targetRadius
          },
          config
        )
      )
    );
  };

  const redoSimulation = () => {
    setIsPaused(false);
    setSimulation((current) =>
      createInitialSimulationState(config, Date.now(), current.target)
    );
  };
  const resetAll = () => {
    setConfig(defaultSimulationConfig);
    setIsPaused(false);
    setSimulation((current) =>
      reconfigureSimulation(current, defaultSimulationConfig, Date.now())
    );
  };

  const fieldAngle = Math.atan2(
    config.gravityStrength + Math.sin((config.windDirection * Math.PI) / 180) * config.windMagnitude,
    Math.cos((config.windDirection * Math.PI) / 180) * config.windMagnitude
  );
  const windAngleRadians = (config.windDirection * Math.PI) / 180;
  const displayedWindLength = 16 + config.windMagnitude * 13.6;
  const windVector = {
    x: Math.cos(windAngleRadians) * displayedWindLength,
    y: Math.sin(windAngleRadians) * displayedWindLength
  };
  const velocityVectorScale = 4.5;
  const velocityVector = {
    x: bestAttempt.genome.vx * velocityVectorScale,
    y: bestAttempt.genome.vy * velocityVectorScale
  };
  const velocityVectorLength = getMagnitude(velocityVector);
  const launchSpeed = getMagnitude({
    x: bestAttempt.genome.vx,
    y: bestAttempt.genome.vy
  });
  const velocityLabelPosition = {
    x: simulationBounds.launchPoint.x + velocityVector.x + 10,
    y: simulationBounds.launchPoint.y + velocityVector.y - 8
  };

  return (
    <div className={standalone ? "genetic-page genetic-page--standalone" : "genetic-page"}>
      <section className="genetic-shell">
        <header className="genetic-shell__intro">
          <div>
            <span className="genetic-shell__eyebrow">Interactive simulation</span>
            <h1>Genetic Algorithms in TypeScript</h1>
            <p>
              This simulation evolves a launch velocity for a ball until it can reliably hit the
              target inside the box.
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
                <h2>{simulation.lastSummary.solved ? "Target solved" : "Current best throw"}</h2>
              </div>
              <div className="genetic-chip-row">
                <span className="genetic-chip">
                  Best fitness {bestAttempt.fitness.toFixed(0)}
                </span>
                <span className="genetic-chip">
                  Field angle {Math.round((fieldAngle * 180) / Math.PI)}°
                </span>
                {simulation.lastSummary.solved ? (
                  <span className="genetic-chip genetic-chip--accent">Solved target</span>
                ) : null}
                {isPaused ? <span className="genetic-chip genetic-chip--paused">Paused on best throw</span> : null}
              </div>
            </div>

            <div className="genetic-scene">
              <svg
                ref={sceneSvgRef}
                viewBox={`0 0 ${simulationBounds.width} ${simulationBounds.height}`}
                role="img"
                aria-label="Genetic algorithm launch simulation"
                onPointerMove={(event) => {
                  if (!isDraggingTarget || !sceneSvgRef.current) {
                    return;
                  }

                  moveTarget(getSvgPointFromPointer(event, sceneSvgRef.current));
                }}
                onPointerUp={() => {
                  setIsDraggingTarget(false);
                }}
                onPointerLeave={() => {
                  setIsDraggingTarget(false);
                }}
              >
                <defs>
                  <linearGradient id="geneticTargetGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7dffb2" />
                    <stop offset="100%" stopColor="#2fd7ff" />
                  </linearGradient>
                  <marker
                    id="geneticVelocityArrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#7fd7ff" />
                  </marker>
                  <marker
                    id="geneticWindArrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 L 2.7 5 z" fill="#b8fff2" />
                  </marker>
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
                  onPointerDown={(event) => {
                    if (!sceneSvgRef.current) {
                      return;
                    }

                    event.preventDefault();
                    setIsDraggingTarget(true);
                    moveTarget(getSvgPointFromPointer(event, sceneSvgRef.current));
                  }}
                />
                <circle
                  cx={simulation.target.x}
                  cy={simulation.target.y}
                  r={simulation.target.radius}
                  fill="url(#geneticTargetGlow)"
                  className="genetic-scene__target"
                  onPointerDown={(event) => {
                    if (!sceneSvgRef.current) {
                      return;
                    }

                    event.preventDefault();
                    setIsDraggingTarget(true);
                    moveTarget(getSvgPointFromPointer(event, sceneSvgRef.current));
                  }}
                />
                <g
                  transform={`translate(${simulation.target.x} ${simulation.target.y})`}
                  className="genetic-scene__target-drag-icon"
                  onPointerDown={(event) => {
                    if (!sceneSvgRef.current) {
                      return;
                    }

                    event.preventDefault();
                    setIsDraggingTarget(true);
                    moveTarget(getSvgPointFromPointer(event, sceneSvgRef.current));
                  }}
                >
                  <line x1="-8" y1="0" x2="8" y2="0" />
                  <line x1="0" y1="-8" x2="0" y2="8" />
                  <path d="M -10 0 L -6 -2.5 L -6 2.5 Z" />
                  <path d="M 10 0 L 6 -2.5 L 6 2.5 Z" />
                  <path d="M 0 -10 L -2.5 -6 L 2.5 -6 Z" />
                  <path d="M 0 10 L -2.5 6 L 2.5 6 Z" />
                </g>
                <circle
                  cx={simulationBounds.launchPoint.x}
                  cy={simulationBounds.launchPoint.y}
                  r={config.ballRadius + 6}
                  className="genetic-scene__launcher"
                />
                {velocityVectorLength > 0.1 ? (
                  <>
                    <line
                      x1={simulationBounds.launchPoint.x}
                      y1={simulationBounds.launchPoint.y}
                      x2={simulationBounds.launchPoint.x + velocityVector.x}
                      y2={simulationBounds.launchPoint.y + velocityVector.y}
                      className="genetic-scene__velocity"
                      markerEnd="url(#geneticVelocityArrow)"
                    />
                    <text
                      x={velocityLabelPosition.x}
                      y={velocityLabelPosition.y}
                      className="genetic-scene__velocity-label"
                    >
                      {launchSpeed.toFixed(1)}
                    </text>
                  </>
                ) : null}
                <circle
                  cx={animatedBall.point.x}
                  cy={animatedBall.point.y}
                  r={config.ballRadius}
                  className="genetic-scene__ball"
                />
                <g transform={`translate(${simulationBounds.width - 132} 28)`}>
                  <rect
                    x="0"
                    y="0"
                    width="104"
                    height="116"
                    rx="16"
                    className="genetic-scene__wind-panel"
                  />
                  <text x="16" y="22" className="genetic-scene__wind-label">
                    Wind
                  </text>
                  <line
                    x1="52"
                    y1="54"
                    x2={52 + windVector.x}
                    y2={54 + windVector.y}
                    className="genetic-scene__wind-vector"
                    markerEnd="url(#geneticWindArrow)"
                  />
                  <text x="52" y="98" textAnchor="middle" className="genetic-scene__wind-value">
                    {config.windMagnitude.toFixed(2)} @ {Math.round(config.windDirection)}°
                  </text>
                </g>
              </svg>
            </div>

            <div className="genetic-actions">
              <button
                type="button"
                className={isPaused ? "genetic-button genetic-button--secondary" : "genetic-button"}
                onClick={() => {
                  if (simulation.lastSummary.solved) {
                    return;
                  }

                  setIsPaused((current) => !current);
                }}
                disabled={simulation.lastSummary.solved}
              >
                {isPaused ? "Resume evolution" : "Pause evolution"}
              </button>
              <button type="button" className="genetic-button genetic-button--secondary" onClick={redoSimulation}>
                Restart simulation
              </button>
            </div>
          </section>

          <aside className="genetic-card genetic-card--controls">
            <div className="genetic-controls__intro">
              <span className="genetic-section-label">Controls</span>
              <h2>Adjust the setup.</h2>
              <p>
                Change the physics, resize the ball or target, or drag the target to a new spot.
                The current population will keep adapting to the updated setup.
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
              <button
                type="button"
                className="genetic-button genetic-button--secondary genetic-controls__reset"
                onClick={resetAll}
              >
                Reset defaults
              </button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

export { GeneticTsPage };
