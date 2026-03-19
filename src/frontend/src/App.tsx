import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ScoreEntry } from "./backend.d";
import {
  useLeaderboard,
  usePersonalBest,
  useSubmitScore,
} from "./hooks/useQueries";

// ─── Game Constants ───────────────────────────────────────────────────────────
const GRID_SIZE = 20;
const CELL_SIZE = 20;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
const BASE_INTERVAL = 150;
const MIN_INTERVAL = 60;

// Canvas literal colors (CSS vars not available in canvas API)
const COLOR_BG = "#0d0f1a";
const COLOR_GRID = "rgba(74, 222, 128, 0.04)";
const COLOR_SNAKE_HEAD = "#4ade80";
const COLOR_SNAKE_BODY = "#22c55e";
const COLOR_FOOD = "#f97316";
const COLOR_FOOD_GLOW = "rgba(249, 115, 22, 0.6)";
const COLOR_SNAKE_GLOW = "rgba(74, 222, 128, 0.5)";

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
type GameState = "start" | "playing" | "paused" | "gameover";

interface Point {
  x: number;
  y: number;
}

const OPPOSITE: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

function randomFood(snake: Point[]): Point {
  let pos: Point;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
  return pos;
}

function getInterval(score: number): number {
  return Math.max(MIN_INTERVAL, BASE_INTERVAL - score * 3);
}

// ─── Leaderboard Component ────────────────────────────────────────────────────
function Leaderboard({ entries }: { entries: ScoreEntry[] }) {
  const top10 = [...entries]
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, 10);

  return (
    <div data-ocid="game.leaderboard_list" className="w-full">
      <h3 className="text-xs font-mono tracking-[0.2em] text-primary/60 uppercase mb-3 text-center">
        Leaderboard
      </h3>
      {top10.length === 0 ? (
        <p className="text-muted-foreground text-center text-sm py-4">
          No scores yet. Be first!
        </p>
      ) : (
        <div className="space-y-1">
          {top10.map((entry, i) => (
            <div
              key={`${entry.name}-${i}`}
              className="flex items-center gap-3 px-3 py-1.5 rounded"
              style={{
                background:
                  i === 0
                    ? "oklch(0.78 0.22 145 / 0.1)"
                    : "oklch(0.18 0.02 260 / 0.5)",
              }}
            >
              <span
                className="w-5 text-xs font-mono font-bold"
                style={{
                  color:
                    i === 0
                      ? "#fbbf24"
                      : i === 1
                        ? "#9ca3af"
                        : i === 2
                          ? "#b45309"
                          : "oklch(0.55 0.04 200)",
                }}
              >
                {i + 1}
              </span>
              <span className="flex-1 text-sm truncate text-foreground">
                {entry.name}
              </span>
              <span className="font-mono text-sm text-primary font-bold">
                {Number(entry.score)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Arrow Icon ───────────────────────────────────────────────────────────────
function ArrowIcon({ rotate, label }: { rotate: string; label: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
      className="text-primary"
      style={{ transform: `rotate(${rotate})` }}
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

// ─── D-Pad ────────────────────────────────────────────────────────────────────
function DPad({ onDirection }: { onDirection: (d: Direction) => void }) {
  const btn = (dir: Direction, label: string, ocid: string, rotate: string) => (
    <button
      type="button"
      data-ocid={ocid}
      onPointerDown={(e) => {
        e.preventDefault();
        onDirection(dir);
      }}
      className="w-12 h-12 flex items-center justify-center rounded bg-secondary/80 border border-border active:bg-primary/20 active:border-primary transition-colors touch-none select-none"
      aria-label={label}
    >
      <ArrowIcon rotate={rotate} label={label} />
    </button>
  );

  return (
    <div className="grid grid-cols-3 gap-1 w-fit mx-auto">
      <div />
      {btn("UP", "Move Up", "game.up_button", "0deg")}
      <div />
      {btn("LEFT", "Move Left", "game.left_button", "-90deg")}
      <div className="w-12 h-12 rounded bg-secondary/30 border border-border/30" />
      {btn("RIGHT", "Move Right", "game.right_button", "90deg")}
      <div />
      {btn("DOWN", "Move Down", "game.down_button", "180deg")}
      <div />
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Game state stored in refs for use in setInterval/rAF without stale closure
  const gameStateRef = useRef<GameState>("start");
  const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }]);
  const directionRef = useRef<Direction>("RIGHT");
  const nextDirRef = useRef<Direction>("RIGHT");
  const foodRef = useRef<Point>(randomFood([{ x: 10, y: 10 }]));
  const scoreRef = useRef(0);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  // Stable ref to endGame so tick can call it without circular deps
  const endGameRef = useRef<() => void>(() => {});

  const [gameState, setGameState] = useState<GameState>("start");
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [playerName, setPlayerName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: leaderboard = [], refetch: refetchLeaderboard } =
    useLeaderboard();
  const { data: personalBest = BigInt(0) } = usePersonalBest();
  const submitScore = useSubmitScore();

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Grid
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
      ctx.stroke();
    }

    const snake = snakeRef.current;
    const food = foodRef.current;

    // Food
    ctx.shadowColor = COLOR_FOOD_GLOW;
    ctx.shadowBlur = 14;
    ctx.fillStyle = COLOR_FOOD;
    ctx.beginPath();
    ctx.arc(
      food.x * CELL_SIZE + CELL_SIZE / 2,
      food.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE / 2 - 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    // Snake
    snake.forEach((seg, idx) => {
      const isHead = idx === 0;
      ctx.shadowColor = isHead ? COLOR_SNAKE_GLOW : "transparent";
      ctx.shadowBlur = isHead ? 12 : 0;
      ctx.fillStyle = isHead ? COLOR_SNAKE_HEAD : COLOR_SNAKE_BODY;
      const padding = isHead ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(
        seg.x * CELL_SIZE + padding,
        seg.y * CELL_SIZE + padding,
        CELL_SIZE - padding * 2,
        CELL_SIZE - padding * 2,
        isHead ? 5 : 3,
      );
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }, []);

  const renderLoop = useCallback(() => {
    draw();
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [draw]);

  // ── Tick ─────────────────────────────────────────────────────────────────
  // Stable interval ticker — all data via refs
  const startTick = useCallback((interval: number) => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    tickIntervalRef.current = setInterval(() => {
      if (gameStateRef.current !== "playing") return;

      directionRef.current = nextDirRef.current;
      const dir = directionRef.current;
      const snake = snakeRef.current;
      const head = snake[0];

      let newHead: Point;
      switch (dir) {
        case "UP":
          newHead = { x: head.x, y: head.y - 1 };
          break;
        case "DOWN":
          newHead = { x: head.x, y: head.y + 1 };
          break;
        case "LEFT":
          newHead = { x: head.x - 1, y: head.y };
          break;
        default:
          newHead = { x: head.x + 1, y: head.y };
          break;
      }

      // Wall collision
      if (
        newHead.x < 0 ||
        newHead.x >= GRID_SIZE ||
        newHead.y < 0 ||
        newHead.y >= GRID_SIZE
      ) {
        endGameRef.current();
        return;
      }

      // Self collision
      if (snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
        endGameRef.current();
        return;
      }

      const newSnake = [newHead, ...snake];
      const food = foodRef.current;
      let newScore = scoreRef.current;

      if (newHead.x === food.x && newHead.y === food.y) {
        newScore++;
        scoreRef.current = newScore;
        setScore(newScore);
        foodRef.current = randomFood(newSnake);
        // Speed up — restart tick at new interval
        startTick(getInterval(newScore));
        snakeRef.current = newSnake;
        return;
      }

      newSnake.pop();
      snakeRef.current = newSnake;
    }, interval);
  }, []);

  // ── End / Start / Pause ───────────────────────────────────────────────────
  const endGame = useCallback(() => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    gameStateRef.current = "gameover";
    setFinalScore(scoreRef.current);
    setGameState("gameover");
    setSubmitted(false);
    refetchLeaderboard();
  }, [refetchLeaderboard]);

  // Keep endGameRef stable so tick can call it without circular dep
  useEffect(() => {
    endGameRef.current = endGame;
  }, [endGame]);

  const startGame = useCallback(() => {
    const initial: Point[] = [{ x: 10, y: 10 }];
    snakeRef.current = initial;
    directionRef.current = "RIGHT";
    nextDirRef.current = "RIGHT";
    foodRef.current = randomFood(initial);
    scoreRef.current = 0;
    setScore(0);
    gameStateRef.current = "playing";
    setGameState("playing");
    startTick(BASE_INTERVAL);
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(renderLoop);
    }
  }, [startTick, renderLoop]);

  const pauseGame = useCallback(() => {
    if (gameStateRef.current === "playing") {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      gameStateRef.current = "paused";
      setGameState("paused");
    } else if (gameStateRef.current === "paused") {
      gameStateRef.current = "playing";
      setGameState("playing");
      startTick(getInterval(scoreRef.current));
    }
  }, [startTick]);

  // ── Input ─────────────────────────────────────────────────────────────────
  const handleDirection = useCallback((dir: Direction) => {
    if (dir !== OPPOSITE[directionRef.current]) {
      nextDirRef.current = dir;
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const state = gameStateRef.current;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          if (state === "playing") handleDirection("UP");
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          if (state === "playing") handleDirection("DOWN");
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          if (state === "playing") handleDirection("LEFT");
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          if (state === "playing") handleDirection("RIGHT");
          break;
        case "p":
        case "P":
        case "Escape":
          if (state === "playing" || state === "paused") pauseGame();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDirection, pauseGame]);

  // Start render loop on mount
  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [renderLoop]);

  // ── Submit score ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!playerName.trim()) {
      toast.error("Enter your name first!");
      return;
    }
    try {
      await submitScore.mutateAsync({
        name: playerName.trim(),
        score: finalScore,
      });
      setSubmitted(true);
      toast.success("Score submitted!");
      await refetchLeaderboard();
    } catch {
      toast.error("Failed to submit score.");
    }
  };

  const highScore = Math.max(
    Number(personalBest),
    ...leaderboard.map((e) => Number(e.score)),
    0,
  );

  return (
    <div className="min-h-screen bg-background grid-bg flex flex-col items-center justify-start">
      <Toaster />

      {/* Header */}
      <header className="w-full max-w-3xl px-4 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1
            className="text-2xl font-black tracking-tight text-primary neon-glow"
            style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
          >
            SNAKE
          </h1>
          <span className="text-xs text-muted-foreground font-mono tracking-widest">
            v2.0
          </span>
        </div>
        {(gameState === "playing" || gameState === "paused") && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-muted-foreground font-mono">
                SCORE
              </div>
              <div className="text-xl font-mono font-bold text-primary">
                {score}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground font-mono">
                BEST
              </div>
              <div className="text-xl font-mono font-bold text-foreground/60">
                {highScore}
              </div>
            </div>
            <Button
              data-ocid="game.pause_button"
              variant="outline"
              size="sm"
              onClick={pauseGame}
              className="border-primary/40 text-primary hover:bg-primary/10"
            >
              {gameState === "paused" ? "Resume" : "Pause"}
            </Button>
          </div>
        )}
      </header>

      {/* Main */}
      <main className="flex flex-col lg:flex-row items-start gap-6 px-4 py-4 w-full max-w-3xl">
        {/* Canvas area */}
        <div className="flex flex-col items-center gap-4 flex-shrink-0">
          <div className="relative">
            <canvas
              data-ocid="game.canvas_target"
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="block rounded-lg neon-box-glow scanlines"
              style={{ imageRendering: "pixelated" }}
            />

            {/* Overlays */}
            <AnimatePresence>
              {gameState === "start" && (
                <motion.div
                  key="start"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 rounded-lg"
                >
                  <motion.h2
                    animate={{
                      textShadow: [
                        "0 0 20px #4ade80",
                        "0 0 40px #4ade80",
                        "0 0 20px #4ade80",
                      ],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Number.POSITIVE_INFINITY,
                    }}
                    className="text-5xl font-black text-primary mb-2 tracking-wider"
                    style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
                  >
                    SNAKE
                  </motion.h2>
                  <p className="text-muted-foreground text-sm mb-6 text-center font-mono">
                    WASD / Arrow Keys to move
                    <br />P or Esc to pause
                  </p>
                  <Button
                    data-ocid="game.play_button"
                    onClick={startGame}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-widest text-sm px-8 py-5"
                  >
                    PLAY
                  </Button>
                </motion.div>
              )}

              {gameState === "paused" && (
                <motion.div
                  key="paused"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 rounded-lg"
                >
                  <p className="text-3xl font-black text-primary neon-glow mb-4 tracking-widest">
                    PAUSED
                  </p>
                  <Button
                    data-ocid="game.resume_button"
                    onClick={pauseGame}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-widest px-8"
                  >
                    RESUME
                  </Button>
                </motion.div>
              )}

              {gameState === "gameover" && (
                <motion.div
                  key="gameover"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 rounded-lg px-6"
                >
                  <p className="text-2xl font-black text-destructive mb-1 tracking-widest">
                    GAME OVER
                  </p>
                  <p className="text-4xl font-mono font-bold text-primary mb-4">
                    {finalScore}
                  </p>
                  {!submitted ? (
                    <div className="flex flex-col gap-2 w-full max-w-[180px] mb-4">
                      <Input
                        data-ocid="game.name_input"
                        placeholder="Your name..."
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        className="bg-secondary border-border text-center font-mono"
                        maxLength={20}
                      />
                      <Button
                        data-ocid="game.submit_button"
                        onClick={handleSubmit}
                        disabled={submitScore.isPending}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs tracking-widest"
                      >
                        {submitScore.isPending ? "Saving..." : "SAVE SCORE"}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-primary font-mono text-sm mb-4">
                      ✓ Score saved!
                    </p>
                  )}
                  <Button
                    data-ocid="game.play_button"
                    onClick={startGame}
                    variant="outline"
                    className="border-primary/40 text-primary hover:bg-primary/10 font-bold tracking-widest text-xs"
                  >
                    PLAY AGAIN
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile D-Pad */}
          <div className="lg:hidden">
            <DPad onDirection={handleDirection} />
          </div>
        </div>

        {/* Sidebar: leaderboard */}
        <aside className="flex-1 w-full min-w-0">
          <div className="rounded-lg border border-border/60 bg-card/60 p-4 neon-box-glow">
            <Leaderboard entries={leaderboard} />
          </div>

          {/* Desktop D-Pad */}
          <div className="hidden lg:flex justify-center mt-6">
            <DPad onDirection={handleDirection} />
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="mt-auto pb-4 text-center text-xs text-muted-foreground/50">
        © {new Date().getFullYear()}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary transition-colors"
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}
