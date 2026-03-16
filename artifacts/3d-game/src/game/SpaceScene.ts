import * as THREE from "three";
import * as CANNON from "cannon-es";
import { ROAD_WIDTH } from "./RoadGenerator";

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface UFOData {
  group: THREE.Group;
  /** The bottom point-light whose colour we animate during charging */
  ufoLight: THREE.PointLight;
  baseX: number;
  baseY: number;
  relZ: number;
  bobPhase: number;
  bobSpeed: number;
  rotSpeed: number;
  /** "idle" | "charging" | "firing" — laser-state machine for this UFO */
  laserState: "idle" | "charging" | "firing";
  /** How long this UFO has been in the current state */
  stateTimer: number;
  /** Total charge duration before the real laser fires */
  chargeDuration: number;
  /** Absolute Z where the lethal laser will fire */
  targetZ: number;
  /** Y height of the laser beam */
  targetY: number;
  /** Visual-only targeting line shown during charge phase */
  targetingLine: THREE.Line | null;
}

interface CelestialBody {
  mesh: THREE.Mesh;
  relZ: number;
  baseX: number;
  baseY: number;
}

/**
 * Lethal laser – persists until the ball passes it (Z-based cleanup).
 * No timer/duration: it stays lit until ballZ > triggerZ + PASS_MARGIN.
 */
interface LethalLaser {
  line: THREE.Line;
  connectingLine: THREE.Line;
  triggerBody: CANNON.Body;
  triggerZ: number;
  laserY: number;
  /** Set true once the hit callback has been called, to avoid double-firing */
  hitFired: boolean;
  sourceUFO: UFOData;
}

/** Decorative ambience laser between two UFOs (timer-based, no physics) */
interface DecorativeLaser {
  line: THREE.Line;
  timer: number;
  duration: number;
}

interface ExplosionData {
  points: THREE.Points;
  velocities: Float32Array;
  timer: number;
  duration: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Ball radius is 0.5 – add margin
const LASER_HALF_H = 0.75;
const LASER_HALF_W = ROAD_WIDTH / 2 + 0.35;
// How far behind the ball a laser must be before we dispose it
const PASS_MARGIN = 5;
// Charge duration range (seconds)
const CHARGE_MIN = 0.8;
const CHARGE_MAX = 1.0;

// ─── Colours ─────────────────────────────────────────────────────────────────

const DECORATIVE_COLORS = [0x00ff88, 0x44ccff, 0xff3322, 0xffcc00, 0x00ffff, 0xff88ff];
const WARNING_COLOR = new THREE.Color(1, 1, 0);   // bright yellow during charge
const IDLE_COLOR    = new THREE.Color(0, 1, 0.53); // default UFO glow (greenish)
const LASER_COLOR   = 0xff2200;

// ─────────────────────────────────────────────────────────────────────────────

export class SpaceScene {
  private scene: THREE.Scene;
  private world: CANNON.World;
  private ballBody: CANNON.Body;

  private bgSphere!: THREE.Mesh;
  private nearStars!: THREE.Points;
  private ufos: UFOData[] = [];
  private moons: CelestialBody[] = [];
  private suns: CelestialBody[] = [];
  private sunLights: { light: THREE.PointLight; relZ: number; baseX: number; baseY: number }[] = [];

  private lethalLasers: LethalLaser[] = [];
  private decorativeLasers: DecorativeLaser[] = [];
  private explosions: ExplosionData[] = [];

  /** Callback invoked (once) when the ball contacts a lethal laser */
  public onLaserHit: (() => void) | null = null;

  // Timers for recurring spawns
  private decorativeLaserTimer = 0.5;
  private explosionTimer = 2.0;
  
  // Global cooldown for lethal lasers (4.0 to 7.0 seconds between shots)
  private globalLaserCooldown = 4.0;

  constructor(scene: THREE.Scene, world: CANNON.World, ballBody: CANNON.Body) {
    this.scene = scene;
    this.world = world;
    this.ballBody = ballBody;
    this.buildNebulaSkybox();
    this.buildNearStars();
    this.buildCelestialBodies();
    this.buildUFOs();
  }

  // ─── Build helpers ────────────────────────────────────────────────────────

  private buildNebulaSkybox() {
    const W = 2048, H = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#02010d";
    ctx.fillRect(0, 0, W, H);

    const nebulae = [
      { x: 180,  y: 350, r: 450, r2: 120, g2: 0,   b2: 210, a: 0.38 },
      { x: 900,  y: 180, r: 380, r2: 0,   g2: 60,  b2: 220, a: 0.32 },
      { x: 1450, y: 620, r: 480, r2: 200, g2: 0,   b2: 140, a: 0.30 },
      { x: 580,  y: 820, r: 320, r2: 0,   g2: 120, b2: 190, a: 0.28 },
      { x: 1820, y: 250, r: 300, r2: 220, g2: 90,  b2: 0,   a: 0.22 },
      { x: 1100, y: 950, r: 340, r2: 80,  g2: 0,   b2: 160, a: 0.35 },
      { x: 280,  y: 90,  r: 260, r2: 0,   g2: 160, b2: 130, a: 0.20 },
      { x: 1650, y: 900, r: 290, r2: 160, g2: 40,  b2: 180, a: 0.26 },
    ];
    for (const n of nebulae) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0,    `rgba(${n.r2},${n.g2},${n.b2},${n.a})`);
      g.addColorStop(0.45, `rgba(${n.r2},${n.g2},${n.b2},${n.a * 0.4})`);
      g.addColorStop(1,    "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const big = Math.random() < 0.04;
      const r = big ? 1.8 + Math.random() * 1.2 : 0.5 + Math.random() * 0.8;
      const v = Math.floor(180 + Math.random() * 75);
      const alpha = big ? 1.0 : 0.4 + Math.random() * 0.6;
      const tint = Math.random();
      const cr = tint < 0.3 ? v : tint < 0.55 ? Math.floor(v * 0.8) : v;
      const cg = tint < 0.3 ? Math.floor(v * 0.85) : v;
      const cb = tint > 0.7 ? v : tint > 0.45 ? v : Math.floor(v * 0.85);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (big) {
        const gw = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
        gw.addColorStop(0, `rgba(${cr},${cg},${cb},0.3)`);
        gw.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gw;
        ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    this.bgSphere = new THREE.Mesh(
      new THREE.SphereGeometry(380, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })
    );
    this.scene.add(this.bgSphere);
  }

  private buildNearStars() {
    const count = 2000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [0xffffff, 0xaaccff, 0xfff8dd, 0xffccee, 0xccffff, 0xffddaa];
    for (let i = 0; i < count; i++) {
      const r = 40 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = (r * Math.sin(phi) * Math.sin(theta)) * 0.6 + 5;
      pos[i*3+2] = r * Math.cos(phi);
      const c = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      const b = 0.5 + Math.random() * 0.5;
      col[i*3] = c.r*b; col[i*3+1] = c.g*b; col[i*3+2] = c.b*b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
    this.nearStars = new THREE.Points(geo,
      new THREE.PointsMaterial({ size: 0.35, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9 })
    );
    this.scene.add(this.nearStars);
  }

  private buildCelestialBodies() {
    const sunConfigs = [
      { baseX: 65,  baseY: 18,  relZ: 80,  r: 9,  color: 0xff8800, lightColor: 0xff9900 },
      { baseX: -85, baseY: -8,  relZ: 130, r: 11, color: 0xffaa22, lightColor: 0xffaa44 },
      { baseX: 48,  baseY: 28,  relZ: 200, r: 7,  color: 0xff6600, lightColor: 0xff7700 },
      { baseX: -42, baseY: -18, relZ: 160, r: 13, color: 0xffcc00, lightColor: 0xffcc00 },
    ];
    for (const s of sunConfigs) {
      const sun = new THREE.Mesh(new THREE.SphereGeometry(s.r, 20, 14), new THREE.MeshBasicMaterial({ color: s.color }));
      this.scene.add(sun);
      const corona = new THREE.Mesh(new THREE.SphereGeometry(s.r * 1.6, 20, 14),
        new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.15, side: THREE.BackSide }));
      this.scene.add(corona);
      const light = new THREE.PointLight(s.lightColor, 2.0, 150);
      this.scene.add(light);
      this.suns.push({ mesh: sun,    relZ: s.relZ, baseX: s.baseX, baseY: s.baseY });
      this.suns.push({ mesh: corona, relZ: s.relZ, baseX: s.baseX, baseY: s.baseY });
      this.sunLights.push({ light, relZ: s.relZ, baseX: s.baseX, baseY: s.baseY });
    }

    const moonConfigs = [
      { baseX: -52, baseY: 8,   relZ: 55,  r: 8  },
      { baseX: 42,  baseY: -4,  relZ: 100, r: 10 },
      { baseX: -72, baseY: 18,  relZ: 155, r: 12 },
      { baseX: 82,  baseY: 3,   relZ: 125, r: 7  },
      { baseX: -32, baseY: -14, relZ: 195, r: 9  },
      { baseX: 62,  baseY: 22,  relZ: 245, r: 11 },
    ];
    const moonMat = new THREE.MeshLambertMaterial({ color: 0x999aaa });
    for (const m of moonConfigs) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(m.r, 18, 12), moonMat);
      this.scene.add(moon);
      this.moons.push({ mesh: moon, relZ: m.relZ, baseX: m.baseX, baseY: m.baseY });
    }
  }

  private makeUFOGroup(): { group: THREE.Group; ufoLight: THREE.PointLight } {
    const group = new THREE.Group();
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x889aaa });
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.0, 0.5, 22), metalMat));
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.3, 22),
      new THREE.MeshLambertMaterial({ color: 0x5a6a7a }));
    ridge.position.y = 0.2;
    group.add(ridge);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xaaccdd, transparent: true, opacity: 0.8 }));
    dome.position.y = 0.38;
    group.add(dome);

    // We always use green as the base idle colour and animate it during charge
    const ufoLight = new THREE.PointLight(IDLE_COLOR.getHex(), 1.5, 12);
    ufoLight.position.y = -0.6;
    group.add(ufoLight);
    return { group, ufoLight };
  }

  private buildUFOs() {
    const slots = [
      { baseX: -19, baseY: 5,  relZ: 22 }, { baseX: -28, baseY: 10, relZ: 38 },
      { baseX: -22, baseY: 2,  relZ: 55 }, { baseX: -34, baseY: 14, relZ: 16 },
      { baseX: -25, baseY: 6,  relZ: 68 }, { baseX: -30, baseY: 0,  relZ: 82 },
      { baseX:  19, baseY: 4,  relZ: 28 }, { baseX:  27, baseY: 11, relZ: 44 },
      { baseX:  22, baseY: 1,  relZ: 60 }, { baseX:  34, baseY: 9,  relZ: 12 },
      { baseX:  26, baseY: 7,  relZ: 74 }, { baseX:  32, baseY: 15, relZ: 48 },
    ];
    for (const s of slots) {
      const { group, ufoLight } = this.makeUFOGroup();
      this.scene.add(group);
      this.ufos.push({
        group, ufoLight,
        baseX: s.baseX, baseY: s.baseY, relZ: s.relZ,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.7  + Math.random() * 0.8,
        rotSpeed: 0.2  + Math.random() * 0.4,
        laserState: "idle", stateTimer: 0, chargeDuration: CHARGE_MIN,
        targetZ: 0, targetY: 0.6, targetingLine: null,
      });
    }
  }

  // ─── Laser spawning ───────────────────────────────────────────────────────

  /** Step 1 – enter charge phase: show a faint targeting line, blink UFO light */
  private beginCharge(ufo: UFOData, ballZ: number, forwardSpeed: number) {
    ufo.laserState = "charging";
    ufo.stateTimer = 0;
    ufo.chargeDuration = CHARGE_MIN + Math.random() * (CHARGE_MAX - CHARGE_MIN);
    
    // Dynamic reaction distance: precisely 2.0 seconds ahead based on current speed
    ufo.targetZ = ballZ + forwardSpeed * 2.0;
    
    ufo.targetY = 0.55 + Math.random() * 0.5;

    // Faint targeting line across road (strictly visual, no physics)
    const lx = -(ROAD_WIDTH / 2 + 1.5);
    const rx =   ROAD_WIDTH / 2 + 1.5;
    const mat = new THREE.LineBasicMaterial({
      color: 0xffff00, transparent: true, opacity: 0.25,
    });
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(lx, ufo.targetY, ufo.targetZ),
      new THREE.Vector3(rx, ufo.targetY, ufo.targetZ),
    ]);
    ufo.targetingLine = new THREE.Line(geo, mat);
    this.scene.add(ufo.targetingLine);
  }

  /** Step 2 – fire the real lethal laser (called after charge completes) */
  private fireLethalLaser(ufo: UFOData) {
    ufo.laserState = "firing";
    ufo.stateTimer = 0;

    // Remove the targeting line
    if (ufo.targetingLine) {
      this.scene.remove(ufo.targetingLine);
      ufo.targetingLine.geometry.dispose();
      ufo.targetingLine = null;
    }

    const lx = -(ROAD_WIDTH / 2 + 1.5);
    const rx =   ROAD_WIDTH / 2 + 1.5;

    // Solid bright-red lethal line
    const mat = new THREE.LineBasicMaterial({ color: LASER_COLOR, transparent: false, opacity: 1.0 });
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(lx, ufo.targetY, ufo.targetZ),
      new THREE.Vector3(rx, ufo.targetY, ufo.targetZ),
    ]);
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    // Connecting beam from UFO to the center of the road
    const connectMat = new THREE.LineBasicMaterial({ color: LASER_COLOR, transparent: false, opacity: 1.0, linewidth: 2 });
    const connectGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ufo.group.position.x, ufo.group.position.y - 0.6, ufo.group.position.z),
      new THREE.Vector3(0, ufo.targetY, ufo.targetZ),
    ]);
    const connectingLine = new THREE.Line(connectGeo, connectMat);
    this.scene.add(connectingLine);

    // Physics trigger box
    const halfW = (rx - lx) / 2;
    const triggerBody = new CANNON.Body({
      mass: 0,
      collisionResponse: false,
      type: CANNON.Body.STATIC,
    });
    triggerBody.addShape(new CANNON.Box(new CANNON.Vec3(halfW, LASER_HALF_H, 0.15)));
    triggerBody.position.set((lx + rx) / 2, ufo.targetY, ufo.targetZ);
    this.world.addBody(triggerBody);

    this.lethalLasers.push({
      line, connectingLine, triggerBody,
      triggerZ: ufo.targetZ,
      laserY: ufo.targetY,
      hitFired: false,
      sourceUFO: ufo,
    });

    // Reset UFO light and state – allow it to idle
    ufo.ufoLight.color.copy(IDLE_COLOR);
    ufo.ufoLight.intensity = 1.5;
    ufo.laserState = "idle";
    ufo.stateTimer = 0;
    
    // Reset global cooldown (e.g. 4-7 seconds until another laser can charge)
    this.globalLaserCooldown = 4.0 + Math.random() * 3.0;
  }

  private spawnDecorativeLaser(a: THREE.Vector3, b: THREE.Vector3) {
    const color = DECORATIVE_COLORS[Math.floor(Math.random() * DECORATIVE_COLORS.length)];
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0 });
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.decorativeLasers.push({ line, timer: 0, duration: 0.25 + Math.random() * 0.35 });
  }

  private spawnExplosion(pos: THREE.Vector3) {
    const count = 40;
    const positions   = new Float32Array(count * 3);
    const velocities  = new Float32Array(count * 3);
    const colors      = new Float32Array(count * 3);
    const palette = [
      new THREE.Color(0xff8800), new THREE.Color(0xff4400),
      new THREE.Color(0xffee00), new THREE.Color(0xffffff), new THREE.Color(0xff2200),
    ];
    for (let i = 0; i < count; i++) {
      positions[i*3] = pos.x; positions[i*3+1] = pos.y; positions[i*3+2] = pos.z;
      const speed = 3 + Math.random() * 7;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      velocities[i*3]   = speed * Math.sin(phi) * Math.cos(theta);
      velocities[i*3+1] = speed * Math.sin(phi) * Math.sin(theta);
      velocities[i*3+2] = speed * Math.cos(phi);
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    const pts = new THREE.Points(geo,
      new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 1.0 }));
    this.scene.add(pts);
    this.explosions.push({ points: pts, velocities, timer: 0, duration: 0.7 + Math.random() * 0.4 });
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  reset() {
    this.globalLaserCooldown = 4.0;
    
    // Cleanup lethal lasers
    for (const l of this.lethalLasers) {
      this.scene.remove(l.line);
      l.line.geometry.dispose();
      this.scene.remove(l.connectingLine);
      l.connectingLine.geometry.dispose();
      this.world.removeBody(l.triggerBody);
    }
    this.lethalLasers = [];

    // Reset UFO states
    for (const u of this.ufos) {
      u.laserState = "idle";
      u.stateTimer = 0;
      if (u.targetingLine) {
        this.scene.remove(u.targetingLine);
        u.targetingLine.geometry.dispose();
        u.targetingLine = null;
      }
      u.ufoLight.color.copy(IDLE_COLOR);
      u.ufoLight.intensity = 1.5;
    }
  }

  hasLaserNearZ(targetZ: number, tolerance: number = 5): boolean {
    // Check charging UFOs
    for (const u of this.ufos) {
      if (u.laserState === "charging" && Math.abs(u.targetZ - targetZ) <= tolerance) {
        return true;
      }
    }
    // Check fired lasers
    for (const l of this.lethalLasers) {
      if (Math.abs(l.triggerZ - targetZ) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  setVisible(v: boolean) {
    this.bgSphere.visible   = v;
    this.nearStars.visible  = v;
    for (const u  of this.ufos)          u.group.visible     = v;
    for (const m  of this.moons)         m.mesh.visible      = v;
    for (const s  of this.suns)          s.mesh.visible      = v;
    for (const sl of this.sunLights)     sl.light.visible    = v;
    for (const l  of this.lethalLasers)  { l.line.visible = v; l.connectingLine.visible = v; }
    for (const dl of this.decorativeLasers) dl.line.visible  = v;
    for (const e  of this.explosions)    e.points.visible    = v;
  }

  update(dt: number, ballX: number, ballZ: number, forwardSpeed: number) {
    const time = performance.now() * 0.001;

    this.bgSphere.position.set(ballX, 0, ballZ);
    this.nearStars.position.set(ballX, 0, ballZ);

    // ── UFO movement + laser state machine ──────────────────────────────────
    for (const ufo of this.ufos) {
      const wy = ufo.baseY + Math.sin(time * ufo.bobSpeed + ufo.bobPhase) * 1.8;
      const wz = ballZ + ufo.relZ;
      ufo.group.position.set(ufo.baseX, wy, wz);
      ufo.group.rotation.y += dt * ufo.rotSpeed;
      if (ufo.relZ < -25) ufo.relZ += 130;
      if (ufo.relZ > 130) ufo.relZ = -10;

      ufo.stateTimer += dt;

      if (ufo.laserState === "charging") {
        // ── Blink the UFO light between warning-yellow and white ──
        const blink = Math.sin(time * 18) > 0;    // ~9 blinks/s
        ufo.ufoLight.color.copy(blink ? WARNING_COLOR : new THREE.Color(1, 1, 1));
        ufo.ufoLight.intensity = blink ? 3.5 : 1.0;

        // Pulse opacity of targeting line
        if (ufo.targetingLine) {
          const mat = ufo.targetingLine.material as THREE.LineBasicMaterial;
          mat.opacity = 0.15 + 0.20 * Math.abs(Math.sin(time * 8));
        }

        // Transition to lethal laser once charge completes
        if (ufo.stateTimer >= ufo.chargeDuration) {
          this.fireLethalLaser(ufo);
        }
      }
    }

    // ── Celestial body recycling ─────────────────────────────────────────
    for (const m  of this.moons)     { m.mesh.position.set(m.baseX, m.baseY, ballZ + m.relZ);   if (m.relZ < -30)  m.relZ += 280; }
    for (const s  of this.suns)      { s.mesh.position.set(s.baseX, s.baseY, ballZ + s.relZ);   if (s.relZ < -30)  s.relZ += 280; }
    for (const sl of this.sunLights) { sl.light.position.set(sl.baseX, sl.baseY, ballZ + sl.relZ); if (sl.relZ < -30) sl.relZ += 280; }

    // ── Decorative UFO-to-UFO lasers ─────────────────────────────────────
    this.decorativeLaserTimer -= dt;
    if (this.decorativeLaserTimer <= 0 && this.ufos.length >= 2) {
      this.decorativeLaserTimer = 0.6 + Math.random() * 1.0;
      const ia = Math.floor(Math.random() * this.ufos.length);
      let   ib = Math.floor(Math.random() * this.ufos.length);
      while (ib === ia) ib = Math.floor(Math.random() * this.ufos.length);
      this.spawnDecorativeLaser(this.ufos[ia].group.position, this.ufos[ib].group.position);
    }
    for (let i = this.decorativeLasers.length - 1; i >= 0; i--) {
      const dl = this.decorativeLasers[i];
      dl.timer += dt;
      (dl.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1 - dl.timer / dl.duration);
      if (dl.timer >= dl.duration) {
        this.scene.remove(dl.line);
        dl.line.geometry.dispose();
        this.decorativeLasers.splice(i, 1);
      }
    }

    // ── Trigger new lethal road lasers ────────────────────────────────────
    if (this.globalLaserCooldown > 0) {
      this.globalLaserCooldown -= dt;
    }
    
    if (this.globalLaserCooldown <= 0) {
      // Pick an idle UFO to charge
      const idleUFOs = this.ufos.filter(u => u.laserState === "idle");
      if (idleUFOs.length > 0) {
        const ufo = idleUFOs[Math.floor(Math.random() * idleUFOs.length)];
        this.beginCharge(ufo, ballZ, forwardSpeed);
        // Set cooldown to a large value while charging so no others trigger
        this.globalLaserCooldown = 9999;
      }
    }

    // ── Lethal laser update: AABB hit check + Z-based cleanup ─────────────
    const bp = this.ballBody.position;
    for (let i = this.lethalLasers.length - 1; i >= 0; i--) {
      const l = this.lethalLasers[i];
      const tb = l.triggerBody.position;
      
      // Update the connecting beam geometry to track the UFO
      const positions = l.connectingLine.geometry.attributes.position.array as Float32Array;
      positions[0] = l.sourceUFO.group.position.x;
      positions[1] = l.sourceUFO.group.position.y - 0.6;
      positions[2] = l.sourceUFO.group.position.z;
      // Index 3,4,5 (the target) remain the same (0, l.laserY, l.triggerZ)
      (l.connectingLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

      // Hit check (only while ball is at or before the laser's Z)
      if (!l.hitFired && this.onLaserHit !== null) {
        const dx = Math.abs(bp.x - tb.x);
        const dy = Math.abs(bp.y - tb.y);
        const dz = Math.abs(bp.z - tb.z);
        if (dx < LASER_HALF_W + 0.5 && dy < LASER_HALF_H + 0.5 && dz < 0.15 + 0.5) {
          l.hitFired = true;
          this.onLaserHit();
        }
      }

      // Z-based cleanup: dispose once ball has safely passed the laser
      if (bp.z > l.triggerZ + PASS_MARGIN) {
        this.scene.remove(l.line);
        l.line.geometry.dispose();
        this.scene.remove(l.connectingLine);
        l.connectingLine.geometry.dispose();
        this.world.removeBody(l.triggerBody);
        this.lethalLasers.splice(i, 1);
      }
    }

    // ── Explosions ────────────────────────────────────────────────────────
    this.explosionTimer -= dt;
    if (this.explosionTimer <= 0) {
      this.explosionTimer = 1.2 + Math.random() * 1.8;
      const ufo = this.ufos[Math.floor(Math.random() * this.ufos.length)];
      this.spawnExplosion(ufo.group.position.clone());
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.timer += dt;
      const pa = exp.points.geometry.attributes.position.array as Float32Array;
      for (let j = 0; j < pa.length / 3; j++) {
        pa[j*3]   += exp.velocities[j*3]   * dt;
        pa[j*3+1] += exp.velocities[j*3+1] * dt;
        pa[j*3+2] += exp.velocities[j*3+2] * dt;
      }
      (exp.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (exp.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - exp.timer / exp.duration);
      if (exp.timer >= exp.duration) {
        this.scene.remove(exp.points);
        exp.points.geometry.dispose();
        this.explosions.splice(i, 1);
      }
    }
  }
}
