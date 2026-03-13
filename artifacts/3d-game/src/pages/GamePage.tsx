import { useEffect, useRef, useState } from "react";
import { Game, GameState } from "@/game/Game";

export default function GamePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [distance, setDistance] = useState(0);
  const [gameState, setGameState] = useState<GameState>("playing");
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let game: Game | null = null;
    try {
      game = new Game(
        containerRef.current,
        (d) => setDistance(d),
        (s) => setGameState(s)
      );
      gameRef.current = game;
    } catch (e) {
      console.error("Game init failed:", e);
      setWebglError(true);
    }
    return () => {
      game?.destroy();
      gameRef.current = null;
    };
  }, []);

  const handleRestart = () => gameRef.current?.restart();

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: "#000" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", display: "block" }} />

      {/* Vignette + speed lines overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(ellipse at center, transparent 30%, rgba(2,1,14,0.55) 75%, rgba(2,1,14,0.85) 100%)",
          zIndex: 1,
        }}
      />

      {/* Speed streaks */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 2,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: 18 }).map((_, i) => {
          const angle = (i / 18) * 360;
          const len = 12 + Math.random() * 25;
          const opacity = 0.06 + Math.random() * 0.1;
          const dist = 40 + Math.random() * 20;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: `${len}%`,
                height: "1px",
                background: `rgba(255,255,255,${opacity})`,
                transform: `rotate(${angle}deg) translateX(${dist}%)`,
                transformOrigin: "0 0",
              }}
            />
          );
        })}
      </div>

      {webglError && (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", background: "#000",
            color: "#fff", fontFamily: "monospace", textAlign: "center", padding: 32, zIndex: 100,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️ WebGL Not Available</div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>
            This game requires WebGL support.<br />
            Please open in a modern browser with hardware acceleration enabled.
          </div>
        </div>
      )}

      {/* Distance HUD */}
      <div
        style={{
          position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
          color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "monospace",
          textShadow: "0 0 12px rgba(255,80,80,0.8), 0 0 24px rgba(180,0,255,0.4), 0 2px 4px #000",
          pointerEvents: "none", userSelect: "none", zIndex: 10,
          letterSpacing: 2,
        }}
      >
        Distance: {distance} m
      </div>

      {/* Controls hint */}
      <div
        style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.45)", fontSize: 13, fontFamily: "monospace",
          textShadow: "0 0 6px rgba(0,0,0,0.9)", pointerEvents: "none", userSelect: "none",
          textAlign: "center", zIndex: 10, letterSpacing: 1,
        }}
      >
        A / D — steer &nbsp;|&nbsp; SPACE — jump
      </div>

      {gameState === "dead" && (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "radial-gradient(ellipse at center, rgba(100,0,0,0.4) 0%, rgba(0,0,0,0.75) 100%)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              color: "#ff3333", fontSize: 56, fontWeight: "bold", fontFamily: "monospace",
              textShadow: "0 0 30px #ff0000, 0 0 60px #aa0000",
              marginBottom: 12, letterSpacing: 4, animation: "none",
            }}
          >
            GAME OVER
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 22, fontFamily: "monospace", marginBottom: 28, letterSpacing: 1 }}>
            Distance: {distance} m
          </div>
          <button
            onClick={handleRestart}
            style={{
              background: "linear-gradient(135deg, #cc2222, #880000)",
              color: "#fff", border: "2px solid #ff4444", borderRadius: 8,
              padding: "14px 44px", fontSize: 18, fontFamily: "monospace", fontWeight: "bold",
              cursor: "pointer", marginBottom: 10,
              textShadow: "0 0 8px rgba(255,100,100,0.8)",
              boxShadow: "0 0 20px rgba(255,0,0,0.4)",
            }}
          >
            Play Again
          </button>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "monospace" }}>
            or press R
          </div>
        </div>
      )}
    </div>
  );
}
