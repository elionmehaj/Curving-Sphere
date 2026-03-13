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

  const handleRestart = () => {
    gameRef.current?.restart();
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background: "#000",
      }}
    >
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      {webglError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#000",
            color: "#fff",
            fontFamily: "monospace",
            textAlign: "center",
            padding: 32,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️ WebGL Not Available</div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>
            This game requires WebGL support.<br />
            Please open in a modern browser with hardware acceleration enabled.
          </div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          color: "#ffffff",
          fontSize: 22,
          fontWeight: "bold",
          fontFamily: "monospace",
          textShadow: "0 0 8px #000",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Distance: {distance} m
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.5)",
          fontSize: 13,
          fontFamily: "monospace",
          textShadow: "0 0 4px #000",
          pointerEvents: "none",
          userSelect: "none",
          textAlign: "center",
        }}
      >
        A / D — steer &nbsp;|&nbsp; SPACE — jump
      </div>

      {gameState === "dead" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.65)",
          }}
        >
          <div
            style={{
              color: "#ff4444",
              fontSize: 48,
              fontWeight: "bold",
              fontFamily: "monospace",
              textShadow: "0 0 16px #ff0000",
              marginBottom: 12,
            }}
          >
            GAME OVER
          </div>
          <div
            style={{
              color: "#ffffff",
              fontSize: 22,
              fontFamily: "monospace",
              marginBottom: 24,
            }}
          >
            Distance: {distance} m
          </div>
          <button
            onClick={handleRestart}
            style={{
              background: "#cc2222",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "12px 36px",
              fontSize: 18,
              fontFamily: "monospace",
              fontWeight: "bold",
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            Play Again
          </button>
          <div
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 13,
              fontFamily: "monospace",
            }}
          >
            or press R
          </div>
        </div>
      )}
    </div>
  );
}
