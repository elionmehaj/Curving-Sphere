import { useEffect, useRef, useState } from "react";
import { Game, GameState as CoreGameState } from "@/game/Game";
import { audioManager } from "@/game/AudioManager";
import SplashScreen from "@/components/SplashScreen";

type AppState = "splash" | "menu" | "playing" | "dead";

const SKINS = [
  { name: "Classic Blue", color: 0x0000ff, hex: "#0000ff", unlockAt: 0 },
  { name: "Neon Green", color: 0x00ff00, hex: "#00ff00", unlockAt: 100 },
  { name: "Ocean Gold", color: 0xffd700, hex: "#ffd700", unlockAt: 300 },
  { name: "Lunar Pink", color: 0xff00ff, hex: "#ff00ff", unlockAt: 500 },
  { name: "Martian Red", color: 0xff0000, hex: "#ff0000", unlockAt: 1000 },
  { name: "Void Cyan", color: 0x00ffff, hex: "#00ffff", unlockAt: 3000 },
];

export default function GamePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [appState, setAppState] = useState<AppState>("splash");
  const [distance, setDistance] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [equippedSkin, setEquippedSkin] = useState(SKINS[0].color);
  const [volume, setVolume] = useState(() => audioManager.getVolume());
  const [webglError, setWebglError] = useState(false);

  // Load from LocalStorage on mount
  useEffect(() => {
    const savedScore = localStorage.getItem("ballroller_highscore");
    if (savedScore) {
      setHighScore(parseInt(savedScore, 10));
    }
    const savedSkin = localStorage.getItem("ballroller_equippedskin");
    if (savedSkin) {
      setEquippedSkin(parseInt(savedSkin, 10));
    }
  }, []);

  // Initialize Game when we leave the menu and splash screen
  const isGameActive = appState !== "menu" && appState !== "splash";
  useEffect(() => {
    if (!isGameActive) return;
    if (!containerRef.current) return;

    // Destroy existing instance if any
    if (gameRef.current) {
      gameRef.current.destroy();
      gameRef.current = null;
    }

    let game: Game | null = null;
    try {
      game = new Game(
        containerRef.current,
        (d) => setDistance(d),
        (s: CoreGameState) => {
          if (s === "dead") {
            setAppState("dead");
          }
        },
        equippedSkin
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
  }, [isGameActive, equippedSkin]);

  // Update high score whenever we die
  useEffect(() => {
    if (appState === "dead") {
      if (distance > highScore) {
        setHighScore(distance);
        localStorage.setItem("ballroller_highscore", distance.toString());
      }
    }
  }, [appState, distance, highScore]);

  const handleStartGame = () => {
    setAppState("playing");
    setTimeout(() => {
      audioManager.playMusic();
      if (gameRef.current) {
        gameRef.current.restart();
      }
    }, 0);
  };

  const handleRestart = () => {
    gameRef.current?.restart();
    setAppState("playing");
  };

  const handleBackToMenu = () => {
    if (gameRef.current) {
      gameRef.current.destroy();
      gameRef.current = null;
    }
    setAppState("menu");
  };

  const handleEquipSkin = (colorValue: number) => {
    setEquippedSkin(colorValue);
    localStorage.setItem("ballroller_equippedskin", colorValue.toString());
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: "#060312" }}>
      {appState === "splash" && <SplashScreen onComplete={() => setAppState("menu")} />}
      {isGameActive && (
        <div ref={containerRef} style={{ width: "100%", height: "100%", display: "block", position: "absolute", zIndex: 0 }} />
      )}

      {/* Main Menu Overlay */}
      {appState === "menu" && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 100,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "radial-gradient(circle at top, #110d29 0%, #02010c 100%)"
          }}
        >
          <div style={{
            fontSize: 64, fontWeight: "bold", fontFamily: "monospace", color: "#fff",
            textShadow: "0 0 20px rgba(0,255,150,0.5), 0 0 40px rgba(0,150,255,0.3)",
            marginBottom: 10, letterSpacing: 4
          }}>
            BALL ROLLER 3D
          </div>
          <div style={{ fontSize: 24, fontFamily: "monospace", color: "rgba(255,255,255,0.7)", marginBottom: 50, letterSpacing: 2 }}>
            HIGH SCORE: <span style={{ color: "#00ffaa", fontWeight: "bold" }}>{highScore} M</span>
          </div>

          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            background: "rgba(255,255,255,0.03)", padding: "30px", borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.1)", marginBottom: 50
          }}>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.8)", fontFamily: "monospace", marginBottom: 20, letterSpacing: 2 }}>
              SELECT SKIN
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
              {SKINS.map((skin) => {
                const isUnlocked = highScore >= skin.unlockAt;
                const isEquipped = equippedSkin === skin.color;

                return (
                  <div
                    key={skin.name}
                    onClick={() => isUnlocked && handleEquipSkin(skin.color)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      cursor: isUnlocked ? "pointer" : "not-allowed",
                      opacity: isUnlocked ? 1 : 0.4,
                      transform: isEquipped ? "scale(1.1)" : "scale(1)",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{
                      width: 60, height: 60, borderRadius: "50%",
                      backgroundColor: isUnlocked ? skin.hex : "#555",
                      boxShadow: isUnlocked ? `0 0 15px ${skin.hex}` : "none",
                      border: isEquipped ? "3px solid white" : "3px solid transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 10
                    }}>
                      {!isUnlocked && (
                        <div style={{ fontSize: 24, filter: "grayscale(100%)" }}>🔒</div>
                      )}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 12, color: isEquipped ? "#fff" : "rgba(255,255,255,0.6)" }}>
                      {skin.name}
                    </div>
                    {!isUnlocked && (
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff5555", marginTop: 4 }}>
                        {skin.unlockAt}m
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div 
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              background: "rgba(255,255,255,0.03)", padding: "15px 30px", borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.1)", marginBottom: 30
            }}
            onClick={() => audioManager.playMusic()} // Satisfy layout-click requirement just in case
          >
            <label style={{ color: "rgba(255,255,255,0.8)", fontFamily: "monospace", letterSpacing: 2, marginBottom: 10 }}>
              MUSIC VOLUME
            </label>
            <input 
              type="range" 
              min="0" max="1" step="0.05" 
              value={volume}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setVolume(val);
                audioManager.setVolume(val);
                audioManager.playMusic(); // Satisfy browser gesture requirement
              }}
              style={{ width: "200px", accentColor: "#00aaff", cursor: "pointer" }}
            />
          </div>

          <button
            onClick={handleStartGame}
            style={{
              background: "linear-gradient(135deg, #00ffaa, #00aaff)",
              color: "#000", border: "none", borderRadius: 8,
              padding: "16px 64px", fontSize: 24, fontFamily: "monospace", fontWeight: "bold",
              cursor: "pointer", letterSpacing: 2,
              boxShadow: "0 0 20px rgba(0,255,150,0.4)"
            }}
          >
            START
          </button>
        </div>
      )}

      {/* In-Game UI Overlay */}
      {appState === "playing" && (
        <>
          <div
            style={{
              position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
              background: "radial-gradient(ellipse at center, transparent 30%, rgba(2,1,14,0.55) 75%, rgba(2,1,14,0.85) 100%)"
            }}
          />
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, overflow: "hidden" }}>
            {Array.from({ length: 18 }).map((_, i) => {
              const angle = (i / 18) * 360;
              const len = 12 + Math.random() * 25;
              const opacity = 0.06 + Math.random() * 0.1;
              const dist = 40 + Math.random() * 20;
              return (
                <div key={i} style={{
                  position: "absolute", left: "50%", top: "50%", width: `${len}%`, height: "1px",
                  background: `rgba(255,255,255,${opacity})`,
                  transform: `rotate(${angle}deg) translateX(${dist}%)`, transformOrigin: "0 0"
                }} />
              );
            })}
          </div>

          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            color: "#ffffff", fontSize: 22, fontWeight: "bold", fontFamily: "monospace",
            textShadow: "0 0 12px rgba(255,80,80,0.8), 0 0 24px rgba(180,0,255,0.4), 0 2px 4px #000",
            pointerEvents: "none", userSelect: "none", zIndex: 10, letterSpacing: 2
          }}>
            Distance: {distance} m
          </div>

          <div style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.45)", fontSize: 13, fontFamily: "monospace",
            textShadow: "0 0 6px rgba(0,0,0,0.9)", pointerEvents: "none", userSelect: "none",
            textAlign: "center", zIndex: 10, letterSpacing: 1
          }}>
            A / D — steer &nbsp;|&nbsp; SPACE — jump
          </div>
        </>
      )}

      {/* Game Over Overlay */}
      {appState === "dead" && (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "radial-gradient(ellipse at center, rgba(100,0,0,0.4) 0%, rgba(0,0,0,0.75) 100%)",
            zIndex: 50
          }}
        >
          <div style={{
            color: "#ff3333", fontSize: 56, fontWeight: "bold", fontFamily: "monospace",
            textShadow: "0 0 30px #ff0000, 0 0 60px #aa0000", marginBottom: 12, letterSpacing: 4
          }}>
            GAME OVER
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 30 }}>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 22, fontFamily: "monospace", marginBottom: 8, letterSpacing: 1 }}>
              Distance: <span style={{ color: "#fff", fontWeight: "bold" }}>{distance} m</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, fontFamily: "monospace", letterSpacing: 1 }}>
              High Score: <span style={{ color: "#00ffaa", fontWeight: "bold" }}>{highScore > distance ? highScore : distance} m</span>
            </div>
            {distance > highScore && highScore > 0 && (
              <div style={{ color: "#00ffaa", fontSize: 14, fontFamily: "monospace", marginTop: 8, fontWeight: "bold" }}>
                NEW HIGH SCORE!
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 20, marginBottom: 15 }}>
            <button
              onClick={handleBackToMenu}
              style={{
                background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 8, padding: "14px 24px", fontSize: 16, fontFamily: "monospace", fontWeight: "bold",
                cursor: "pointer"
              }}
            >
              Main Menu
            </button>
            <button
              onClick={handleRestart}
              style={{
                background: "linear-gradient(135deg, #cc2222, #880000)", color: "#fff", border: "2px solid #ff4444",
                borderRadius: 8, padding: "14px 44px", fontSize: 18, fontFamily: "monospace", fontWeight: "bold",
                cursor: "pointer", textShadow: "0 0 8px rgba(255,100,100,0.8)", boxShadow: "0 0 20px rgba(255,0,0,0.4)"
              }}
            >
              Play Again
            </button>
          </div>

          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "monospace" }}>
            or press R
          </div>
        </div>
      )}

      {/* WebGL Error */}
      {webglError && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", background: "#000",
          color: "#fff", fontFamily: "monospace", textAlign: "center", padding: 32, zIndex: 1000
        }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️ WebGL Not Available</div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>
            This game requires WebGL support.<br />
            Please open in a modern browser with hardware acceleration enabled.
          </div>
        </div>
      )}
    </div>
  );
}
