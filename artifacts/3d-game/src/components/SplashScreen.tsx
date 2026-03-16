import { useEffect } from "react";
import "./SplashScreen.css";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    // 4000ms is the duration of our CSS animation in fadeOutSequence
    const timer = setTimeout(() => {
      onComplete();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="splash-container">
      <div className="splash-text fade-sequence">
        <span className="splash-12">12</span>
        <span className="splash-brain-project">BRAIN PROJECT</span>
      </div>
    </div>
  );
}
