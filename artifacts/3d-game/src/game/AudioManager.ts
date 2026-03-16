export class AudioManager {
  private bgm: HTMLAudioElement;
  private currentVolume: number;
  private storedVolume: number;
  private fadeInterval: number | null = null;

  constructor() {
    this.bgm = new (window as any).Audio('/bgm.mp3') as HTMLAudioElement;
    this.bgm.loop = true;

    const savedVol = localStorage.getItem('ballroller_bgmVolume');
    this.storedVolume = savedVol ? parseFloat(savedVol) : 0.5;
    this.currentVolume = this.storedVolume;
    this.bgm.volume = this.currentVolume;
  }

  getVolume() {
    return this.storedVolume;
  }

  setVolume(value: number) {
    this.storedVolume = value;
    this.currentVolume = value;
    this.bgm.volume = value;
    localStorage.setItem('ballroller_bgmVolume', value.toString());
  }

  playMusic() {
    if (this.bgm.paused) {
      this.bgm.play().catch((err) => {
        console.warn("Autoplay prevented:", err);
      });
    }
  }

  fadeVolume(targetVol: number, durationMs: number = 1000) {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }

    const startVol = this.bgm.volume;
    const diff = targetVol - startVol;
    const steps = 20;
    const stepDuration = durationMs / steps;
    let stepCount = 0;

    this.fadeInterval = window.setInterval(() => {
      stepCount++;
      const current = startVol + (diff * (stepCount / steps));
      this.bgm.volume = Math.max(0, Math.min(1, current));

      if (stepCount >= steps) {
        if (this.fadeInterval) clearInterval(this.fadeInterval);
        this.fadeInterval = null;
        this.bgm.volume = Math.max(0, Math.min(1, targetVol));
      }
    }, stepDuration);
  }

  onDeath() {
    if (this.storedVolume > 0.1) {
      this.fadeVolume(0.1, 800);
    }
  }

  onRestart() {
    if (this.storedVolume > 0.1) {
      this.fadeVolume(this.storedVolume, 800);
    }
  }
}

export const audioManager = new AudioManager();
