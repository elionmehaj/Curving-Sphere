import * as THREE from "three";
import * as CANNON from "cannon-es";
import { SpaceScene } from "./SpaceScene";
import { RoadCurvatureMap } from "./RoadGenerator";

export type Level = 1 | 2 | 3 | 4 | 5;

export interface EnvResult {
  speedMultiplier: number;
  iceSteerMultiplier: number;
}

interface SceneryItem {
  obj: THREE.Object3D;
  z: number;
}

interface Collectible {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  z: number;
  collected: boolean;
}

const SIDE = 9;
const COLLECT_RADIUS = 1.1; // metres — pickup distance

// Speed Slower constants
const SPEED_DEBUFF_MULT = 0.75;
const SPEED_DEBUFF_DURATION = 4.0;
const SPEED_RESTORE_DURATION = 1.0;

// Icy constants
const ICE_STEER_MULT = 2.2;
const ICE_DURATION = 4.0;
const DEFAULT_LINEAR_DAMPING = 0.1;
const DEFAULT_ANGULAR_DAMPING = 0.4;

// ---------- scenery factory helpers ----------

function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.45, 2.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x7a4f2e })
  );
  trunk.position.y = 1.25;
  g.add(trunk);
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 3.8, 8),
    new THREE.MeshLambertMaterial({ color: 0x228b22 })
  );
  foliage.position.y = 4.4;
  g.add(foliage);
  return g;
}

function makePrehistoricFern(): THREE.Group {
  const g = new THREE.Group();
  // Cluster of 3 ferns
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.4, 2, 6),
      new THREE.MeshLambertMaterial({ color: 0x226b12 })
    );
    stem.position.y = 1;
    f.add(stem);
    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, 4.5, 7),
      new THREE.MeshLambertMaterial({ color: 0x33aa22 })
    );
    foliage.position.y = 3.5;
    f.add(foliage);

    const angle = (i * Math.PI * 2) / 3;
    f.position.set(Math.cos(angle) * 1.5, 0, Math.sin(angle) * 1.5);
    f.rotation.y = Math.random() * Math.PI;
    g.add(f);
  }
  return g;
}

function makeTropicalTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.0, 12, 7),
    new THREE.MeshLambertMaterial({ color: 0x5c4033 })
  );
  trunk.position.y = 6;
  g.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.DodecahedronGeometry(4, 1),
    new THREE.MeshLambertMaterial({ color: 0x228b22 })
  );
  leaves.position.y = 12;
  leaves.scale.y = 0.5;
  g.add(leaves);
  return g;
}

function makeJaggedRock(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x888888, flatShading: true });
  const height = 10 + Math.random() * 15;
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.5 + Math.random() * 2, height, 5 + Math.floor(Math.random() * 3)), mat);
  rock.position.y = height / 2;
  rock.rotation.x = (Math.random() - 0.5) * 0.2;
  rock.rotation.z = (Math.random() - 0.5) * 0.2;
  g.add(rock);
  return g;
}

function makeCloud(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const count = 3 + Math.floor(Math.random() * 4);
  for(let i=0; i<count; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + Math.random() * 2, 0), mat);
    s.position.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 4);
    g.add(s);
  }
  g.scale.set(2, 1, 2);
  return g;
}

function makeVolcano(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.ConeGeometry(6, 8, 12),
    new THREE.MeshLambertMaterial({ color: 0x443322 })
  );
  base.position.y = 4;
  g.add(base);
  const lava = new THREE.Mesh(
    new THREE.ConeGeometry(2, 4, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4422 })
  );
  lava.position.y = 8;
  g.add(lava);
  return g;
}

function makePrehistoricBird(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xd2a679 });
  
  // Body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.3, 4, 8), mat);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  
  // Wings
  const wingR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 3, 5, 3), mat);
  wingR.rotation.x = Math.PI / 2;
  wingR.position.set(0, 0.2, 2.5);
  g.add(wingR);

  const wingL = new THREE.Mesh(new THREE.CylinderGeometry(3, 0.1, 5, 3), mat);
  wingL.rotation.x = Math.PI / 2;
  wingL.position.set(0, 0.2, -2.5);
  g.add(wingL);
  
  // Beak
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2, 4), new THREE.MeshLambertMaterial({ color: 0xddbb66 }));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(2.5, 0, 0);
  g.add(beak);

  g.scale.setScalar(0.7);
  return g;
}

function makeDroppedRock(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 1),
    new THREE.MeshLambertMaterial({ color: 0x666666 })
  );
}

function makeDroppedEgg(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1.2, 16, 16);
  geo.scale(1, 1.4, 1);
  return new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ color: 0xddccb6 })
  );
}

function makeKelp(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x1a8c44 });
  const segs = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < segs; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2, 6), mat);
    seg.position.y = i * 1.85;
    seg.rotation.z = Math.sin(i * 1.3) * 0.35;
    seg.rotation.x = Math.cos(i * 0.9) * 0.2;
    g.add(seg);
  }
  return g;
}

function makeSubmarine(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xeecc00 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 4, 8, 12), mat);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.4, 1.4),
    new THREE.MeshLambertMaterial({ color: 0xddbb00 })
  );
  tower.position.y = 0.9;
  g.add(tower);
  const prop = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.1, 6, 12),
    new THREE.MeshLambertMaterial({ color: 0xaa9900 })
  );
  prop.position.x = -2.9;
  prop.rotation.y = Math.PI / 2;
  g.add(prop);
  return g;
}

function makeCrater(): THREE.Group {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(3.5, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x999aaa })
  );
  bowl.rotation.x = Math.PI;
  g.add(bowl);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(3.5, 0.35, 8, 24),
    new THREE.MeshLambertMaterial({ color: 0x888899 })
  );
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  return g;
}

function makeLunarRock(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x888899 });
  for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + Math.random() * 1.4, 0), mat);
    r.position.set((Math.random() - 0.5) * 4, Math.random() * 0.8, (Math.random() - 0.5) * 4);
    r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    g.add(r);
  }
  return g;
}

function makeMartianRuin(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xaa3311 });
  for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
    const h = 3 + Math.random() * 9;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(1.5 + Math.random() * 3, h, 1.5 + Math.random() * 3),
      mat
    );
    block.position.set((Math.random() - 0.5) * 9, h / 2, (Math.random() - 0.5) * 5);
    g.add(block);
  }
  return g;
}

// ---------- Materials for collectibles (shared) ----------
const speedGeo = new THREE.OctahedronGeometry(0.38, 0);
const speedMat = new THREE.MeshStandardMaterial({
  color: 0x44aaff,
  emissive: 0x0066ff,
  emissiveIntensity: 1.2,
  transparent: true,
  opacity: 0.9,
});

const iceGeo = new THREE.IcosahedronGeometry(0.38, 0);
const iceMat = new THREE.MeshStandardMaterial({
  color: 0xddf4ff,
  emissive: 0x88ccff,
  emissiveIntensity: 0.9,
  transparent: true,
  opacity: 0.88,
});

export class EnvironmentManager {
  private scene: THREE.Scene;
  private world: CANNON.World;
  private roadMat: THREE.MeshStandardMaterial;
  private fog: THREE.FogExp2;
  private roadGlowLight: THREE.PointLight;
  private spaceScene: SpaceScene;
  private ballBody: CANNON.Body;
  
  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;

  private currentLevel: Level = 1;
  private scenery: SceneryItem[] = [];
  private lastSceneryZ = 0;
  private scenerySpacing = 28;

  private earth: THREE.Mesh | null = null;
  private earthZ = 0;
  private earthSpawned = false;

  private torus: THREE.Mesh | null = null;
  private torusZ = 0;
  private torusSpawned = false;

  private bubbles: THREE.Points | null = null;

  private bgColor = new THREE.Color(0x03010f);
  private fogTargetColor = new THREE.Color(0x04010e);
  private roadColorTarget = new THREE.Color(0xdd1111);
  private roadEmissiveTarget = new THREE.Color(0xcc0000);
  private roadEmissiveIntensityTarget = 0.7;
  private roadGlowTarget = new THREE.Color(0xff2200);

  private dirLightIntensityTarget = 0.8;
  private dirColorTarget = new THREE.Color(0xaabbff);
  private ambientIntensityTarget = 0.6;
  private ambientColorTarget = new THREE.Color(0x223355);
  private hemiIntensityTarget = 0.4;
  private hemiColorTarget = new THREE.Color(0x220044);
  private hemiGroundColorTarget = new THREE.Color(0x000011);

  // ------- Speed Slower state -------
  private speedDebuffActive = false;
  private speedDebuffTimer = 0;
  private speedRestoreTimer = 0;
  private speedMultiplierCurrent = 1.0;

  // ------- Icy state -------
  private iceActive = false;
  private iceTimer = 0;

  // ------- Collectibles -------
  private speedPowerUps: Collectible[] = [];
  private icePickups: Collectible[] = [];
  private nextCollectibleZ = 150;
  private curvatureMap: RoadCurvatureMap;

  // ------- Level 2 Hazards (Birds) -------
  private activeBirds: { mesh: THREE.Group; phase: number }[] = [];
  private birdDropCooldown = 6.0;
  private droppedObstacles: { mesh: THREE.Mesh; body: CANNON.Body; triggerZ: number }[] = [];

  // ------- Clouds (Level 2) -------
  private clouds: THREE.Group[] = [];
  
  // ------- Distant Volcano (Level 2) -------
  private volcano: THREE.Group | null = null;

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    roadMat: THREE.MeshStandardMaterial,
    fog: THREE.FogExp2,
    roadGlowLight: THREE.PointLight,
    spaceScene: SpaceScene,
    ballBody: CANNON.Body,
    curvatureMap: RoadCurvatureMap,
    ambientLight: THREE.AmbientLight,
    dirLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight
  ) {
    this.scene = scene;
    this.world = world;
    this.roadMat = roadMat;
    this.fog = fog;
    this.roadGlowLight = roadGlowLight;
    this.spaceScene = spaceScene;
    this.ballBody = ballBody;
    this.curvatureMap = curvatureMap;
    this.ambientLight = ambientLight;
    this.dirLight = dirLight;
    this.hemiLight = hemiLight;
  }

  update(dt: number, distance: number, ballX: number, ballZ: number, forwardSpeed: number): EnvResult {
    const level = this.levelFor(distance);
    if (level !== this.currentLevel) {
      this.onLevelEnter(level, ballX, ballZ);
      this.currentLevel = level;
    }

    this.blendEnvironment(distance, level, dt, ballZ);
    this.updateSpecialEvents(distance, ballZ, dt);
    
    // Level 2 special
    if (level === 2) {
      this.updateClouds(dt, ballZ);
    }

    // Birds hazard (level 2+)
    if (level >= 2) {
      this.updateBirds(dt, ballZ, forwardSpeed);
    }

    this.trySpawnScenery(level, ballX, ballZ);
    this.trySpawnCollectiblesDeterministic(ballZ);
    this.pruneScenery(ballZ);
    if (this.bubbles) this.tickBubbles(dt, ballZ);

    // Tick power-up effects
    const baseSpeedMult = level === 5 ? 1.3 : 1.0;
    const speedMultiplier = this.tickSpeedDebuff(dt, baseSpeedMult);
    const iceSteerMultiplier = this.tickIce(dt);

    // Collect power-ups
    this.checkCollectibles(ballX, ballZ);

    // Prune old collectibles
    this.pruneCollectibles(ballZ);

    // Animate collectibles (spin)
    const t = performance.now() * 0.001;
    for (const c of this.speedPowerUps) if (!c.collected) c.mesh.rotation.y = t * 2.0;
    for (const c of this.icePickups) if (!c.collected) c.mesh.rotation.y = t * -1.8;

    return { speedMultiplier, iceSteerMultiplier };
  }

  // -------- Speed Slower --------
  private tickSpeedDebuff(dt: number, baseMultiplier: number): number {
    if (this.speedDebuffActive) {
      this.speedDebuffTimer -= dt;
      if (this.speedDebuffTimer <= 0) {
        this.speedDebuffActive = false;
        this.speedRestoreTimer = SPEED_RESTORE_DURATION;
      }
    }
    if (this.speedRestoreTimer > 0) {
      this.speedRestoreTimer -= dt;
      // lerp speedMultiplierCurrent back to base over SPEED_RESTORE_DURATION
      const t = 1 - Math.max(0, this.speedRestoreTimer / SPEED_RESTORE_DURATION);
      this.speedMultiplierCurrent = THREE.MathUtils.lerp(
        this.speedMultiplierCurrent,
        baseMultiplier,
        Math.min(t * dt * 3, 1)
      );
    } else if (!this.speedDebuffActive) {
      this.speedMultiplierCurrent = baseMultiplier;
    }
    return this.speedMultiplierCurrent;
  }

  private activateSpeedDebuff(baseMultiplier: number) {
    this.speedDebuffActive = true;
    this.speedDebuffTimer = SPEED_DEBUFF_DURATION;
    this.speedRestoreTimer = 0;
    this.speedMultiplierCurrent = baseMultiplier * SPEED_DEBUFF_MULT;
  }

  // -------- Icy --------
  private tickIce(dt: number): number {
    if (!this.iceActive) return 1.0;
    this.iceTimer -= dt;
    if (this.iceTimer <= 0) {
      this.iceActive = false;
      // Restore default damping
      this.ballBody.linearDamping = DEFAULT_LINEAR_DAMPING;
      this.ballBody.angularDamping = DEFAULT_ANGULAR_DAMPING;
      return 1.0;
    }
    return ICE_STEER_MULT;
  }

  private activateIce() {
    this.iceActive = true;
    this.iceTimer = ICE_DURATION;
    this.ballBody.linearDamping = 0.0;
    this.ballBody.angularDamping = 0.0;
  }

  // -------- Collectible spawning --------
  private spawnSpeedPowerUp(x: number, z: number) {
    const mesh = new THREE.Mesh(speedGeo, speedMat.clone());
    mesh.position.set(x, 0.85, z);
    // Small point light for glow
    const light = new THREE.PointLight(0x2266ff, 1.2, 6);
    mesh.add(light);
    this.scene.add(mesh);

    const body = new CANNON.Body({ mass: 0, collisionResponse: false });
    body.addShape(new CANNON.Sphere(0.55));
    body.position.set(x, 0.85, z);
    this.world.addBody(body);

    this.speedPowerUps.push({ mesh, body, z, collected: false });
  }

  private spawnIcePickup(x: number, z: number) {
    const mesh = new THREE.Mesh(iceGeo, iceMat.clone());
    mesh.position.set(x, 0.85, z);
    const light = new THREE.PointLight(0x88ddff, 1.0, 6);
    mesh.add(light);
    this.scene.add(mesh);

    const body = new CANNON.Body({ mass: 0, collisionResponse: false });
    body.addShape(new CANNON.Sphere(0.55));
    body.position.set(x, 0.85, z);
    this.world.addBody(body);

    this.icePickups.push({ mesh, body, z, collected: false });
  }

  // -------- Per-frame collection checks --------
  private checkCollectibles(ballX: number, ballZ: number) {
    const bx = this.ballBody.position.x;
    const by = this.ballBody.position.y;
    const bz = this.ballBody.position.z;

    for (const c of this.speedPowerUps) {
      if (c.collected) continue;
      const dx = bx - c.mesh.position.x;
      const dy = by - c.mesh.position.y;
      const dz = bz - c.mesh.position.z;
      if (dx * dx + dy * dy + dz * dz < COLLECT_RADIUS * COLLECT_RADIUS) {
        this.collectSpeedPowerUp(c);
      }
    }

    for (const c of this.icePickups) {
      if (c.collected) continue;
      const dx = bx - c.mesh.position.x;
      const dy = by - c.mesh.position.y;
      const dz = bz - c.mesh.position.z;
      if (dx * dx + dy * dy + dz * dz < COLLECT_RADIUS * COLLECT_RADIUS) {
        this.collectIcePickup(c);
      }
    }
  }

  private collectSpeedPowerUp(c: Collectible) {
    c.collected = true;
    this.scene.remove(c.mesh);
    (c.mesh.material as THREE.Material).dispose();
    c.mesh.geometry.dispose();
    this.world.removeBody(c.body);
    const baseMultiplier = this.currentLevel === 5 ? 1.3 : 1.0;
    this.activateSpeedDebuff(baseMultiplier);
  }

  private collectIcePickup(c: Collectible) {
    c.collected = true;
    this.scene.remove(c.mesh);
    (c.mesh.material as THREE.Material).dispose();
    c.mesh.geometry.dispose();
    this.world.removeBody(c.body);
    this.activateIce();
  }

  // -------- Prune out-of-range collectibles --------
  private pruneCollectibles(ballZ: number) {
    const cutoff = ballZ - 40;
    for (let i = this.speedPowerUps.length - 1; i >= 0; i--) {
      const c = this.speedPowerUps[i];
      if (c.z < cutoff) {
        if (!c.collected) {
          this.scene.remove(c.mesh);
          (c.mesh.material as THREE.Material).dispose();
          c.mesh.geometry.dispose();
          this.world.removeBody(c.body);
        }
        this.speedPowerUps.splice(i, 1);
      }
    }
    for (let i = this.icePickups.length - 1; i >= 0; i--) {
      const c = this.icePickups[i];
      if (c.z < cutoff) {
        if (!c.collected) {
          this.scene.remove(c.mesh);
          (c.mesh.material as THREE.Material).dispose();
          c.mesh.geometry.dispose();
          this.world.removeBody(c.body);
        }
        this.icePickups.splice(i, 1);
      }
    }
  }

  private clearCollectibles() {
    for (const c of this.speedPowerUps) {
      if (!c.collected) {
        this.scene.remove(c.mesh);
        (c.mesh.material as THREE.Material).dispose();
        c.mesh.geometry.dispose();
        this.world.removeBody(c.body);
      }
    }
    this.speedPowerUps = [];
    for (const c of this.icePickups) {
      if (!c.collected) {
        this.scene.remove(c.mesh);
        (c.mesh.material as THREE.Material).dispose();
        c.mesh.geometry.dispose();
        this.world.removeBody(c.body);
      }
    }
    this.icePickups = [];
  }

  // -------- Level / environment --------
  private levelFor(distance: number): Level {
    if (distance < 200) return 1;
    if (distance < 1000) return 2;
    if (distance < 1500) return 3;
    if (distance < 2000) return 4;
    return 5;
  }

  private onLevelEnter(level: Level, ballX: number, ballZ: number) {
    this.clearScenery();
    this.lastSceneryZ = ballZ;

    if (level === 1) {
      this.spaceScene.setVisible(true);
      this.scene.background = null;
      this.world.gravity.set(0, -20, 0);
    }
    if (level === 2) {
      this.spaceScene.reset();
      this.spaceScene.setVisible(false);
      this.scene.background = new THREE.Color(0x04010e); // Start dark for a smooth transition
      this.world.gravity.set(0, -20, 0);
    }
    if (level === 3) {
      this.spaceScene.setVisible(false);
      this.scene.background = new THREE.Color(0x001832);
      this.spawnBubbles(ballX, ballZ);
    }
    if (level === 4) {
      this.spaceScene.setVisible(false);
      this.scene.background = new THREE.Color(0x010101);
      if (this.torus) { this.scene.remove(this.torus); this.torus = null; }
      if (this.bubbles) { this.scene.remove(this.bubbles); this.bubbles = null; }
      this.world.gravity.set(0, -10, 0);
    }
    if (level === 5) {
      this.spaceScene.setVisible(false);
      this.scene.background = new THREE.Color(0x2a0800);
      this.world.gravity.set(0, -20, 0);
    }
  }

  private blendEnvironment(distance: number, level: Level, dt: number, ballZ: number) {
    const s = Math.min(dt * 0.8, 1); // 0.8 keeps it to ~1.25 seconds for a smoother transition

    switch (level) {
      case 1:
        this.fogTargetColor.set(0x04010e);
        this.fog.density = THREE.MathUtils.lerp(this.fog.density, 0.009, s);
        this.roadColorTarget.set(0xdd1111);
        this.roadEmissiveTarget.set(0xcc0000);
        this.roadEmissiveIntensityTarget = 0.7;
        this.roadGlowTarget.set(0xff2200);

        this.dirColorTarget.set(0xaabbff);
        this.dirLightIntensityTarget = 0.8;
        this.ambientColorTarget.set(0x223355);
        this.ambientIntensityTarget = 0.6;
        this.hemiColorTarget.set(0x220044);
        this.hemiGroundColorTarget.set(0x000011);
        this.hemiIntensityTarget = 0.4;
        break;
      case 2: {
        const skyBlue = new THREE.Color(0x4da6ff);
        if (this.scene.background instanceof THREE.Color)
          this.scene.background.lerp(skyBlue, s);
        
        this.fogTargetColor.set(0x4da6ff);
        this.fog.density = THREE.MathUtils.lerp(this.fog.density, 0.004, s);
        
        this.roadColorTarget.set(0x33cc33);
        this.roadEmissiveTarget.set(0x000000);
        this.roadEmissiveIntensityTarget = 0.0;
        this.roadGlowTarget.set(0x000000);

        // Sun light
        this.dirColorTarget.set(0xffffee);
        this.dirLightIntensityTarget = 1.5;
        // Warm lush shadows
        this.ambientColorTarget.set(0x445566);
        this.ambientIntensityTarget = 0.8;
        
        this.hemiColorTarget.set(0x87ceeb);
        this.hemiGroundColorTarget.set(0x228b22);
        this.hemiIntensityTarget = 0.6;
        break;
      }
      case 3:
        this.fogTargetColor.set(0x001a38);
        this.fog.density = THREE.MathUtils.lerp(this.fog.density, 0.014, s);
        if (this.scene.background instanceof THREE.Color)
          this.scene.background.lerp(new THREE.Color(0x001832), s);
        this.roadColorTarget.set(0xddbb55);
        this.roadEmissiveTarget.set(0xaa8833);
        this.roadGlowTarget.set(0xddaa44);
        break;
      case 4:
        this.fogTargetColor.set(0xddddcc);
        this.fog.density = THREE.MathUtils.lerp(this.fog.density, 0.007, s);
        if (this.scene.background instanceof THREE.Color)
          this.scene.background.lerp(new THREE.Color(0x010101), s);
        this.roadColorTarget.set(0xccccaa);
        this.roadEmissiveTarget.set(0x999977);
        this.roadGlowTarget.set(0xddddaa);
        break;
      case 5:
        this.fogTargetColor.set(0xcc4400);
        this.fog.density = THREE.MathUtils.lerp(this.fog.density, 0.018, s);
        if (this.scene.background instanceof THREE.Color)
          this.scene.background.lerp(new THREE.Color(0x2a0800), s);
        this.roadColorTarget.set(0xbb4411);
        this.roadEmissiveTarget.set(0x992200);
        this.roadGlowTarget.set(0xff6600);
        break;
    }

    this.fog.color.lerp(this.fogTargetColor, s * 0.5);
    this.roadMat.color.lerp(this.roadColorTarget, s * 0.4);
    this.roadMat.emissive.lerp(this.roadEmissiveTarget, s * 0.4);
    this.roadMat.emissiveIntensity = THREE.MathUtils.lerp(this.roadMat.emissiveIntensity, this.roadEmissiveIntensityTarget, s * 0.4);
    this.roadGlowLight.color.lerp(this.roadGlowTarget, s * 0.4);

    if (this.dirLight && this.ambientLight && this.hemiLight) {
      this.dirLight.color.lerp(this.dirColorTarget, s * 0.4);
      this.dirLight.intensity = THREE.MathUtils.lerp(this.dirLight.intensity, this.dirLightIntensityTarget, s * 0.4);
      
      this.ambientLight.color.lerp(this.ambientColorTarget, s * 0.4);
      this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientLight.intensity, this.ambientIntensityTarget, s * 0.4);

      this.hemiLight.color.lerp(this.hemiColorTarget, s * 0.4);
      this.hemiLight.groundColor.lerp(this.hemiGroundColorTarget, s * 0.4);
      this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, this.hemiIntensityTarget, s * 0.4);

      // Lock dirLight target relatively high to player if Level 2
      if (level === 2) {
        this.dirLight.position.lerp(new THREE.Vector3(50, 100, ballZ - 50), s * 0.1);
        this.dirLight.target.position.set(0, 0, ballZ);
        this.dirLight.target.updateMatrixWorld();
      } else {
        this.dirLight.position.lerp(new THREE.Vector3(5, 15, ballZ + 5), s * 0.1);
        this.dirLight.target.position.set(0, 0, ballZ);
        this.dirLight.target.updateMatrixWorld();
      }
    }
  }

  private updateSpecialEvents(distance: number, ballZ: number, dt: number) {
    // Distant Volcano for Level 2
    if (this.currentLevel === 2) {
      if (!this.volcano) {
        this.volcano = makeVolcano();
        this.volcano.scale.setScalar(8); // make it large
        this.scene.add(this.volcano);
      }
      // Pin to the horizon
      this.volcano.position.set(120, -10, ballZ - 300);
    } else if (this.volcano) {
      this.scene.remove(this.volcano);
      this.volcano = null;
    }

    if (this.currentLevel === 4 && distance >= 1700 && !this.torusSpawned) {
      this.torusSpawned = true;
      this.torusZ = ballZ + 90;
      const mat = new THREE.MeshStandardMaterial({ color: 0x8822cc, emissive: 0x6600aa, emissiveIntensity: 0.8 });
      this.torus = new THREE.Mesh(new THREE.TorusGeometry(5, 1.2, 16, 40), mat);
      this.torus.position.set(0, 1, this.torusZ);
      const light = new THREE.PointLight(0xaa44ff, 3.0, 30);
      this.torus.add(light);
      this.scene.add(this.torus);
    }
    if (this.torus) {
      this.torus.rotation.x += dt * 0.6;
      this.torus.rotation.y += dt * 0.3;
    }
  }

  // -------- Bird Hazard Mechanic --------
  private updateBirds(dt: number, ballZ: number, forwardSpeed: number) {
    // 1. Manage active orbiting birds
    if (this.activeBirds.length < 6) {
      const birdMesh = makePrehistoricBird();
      this.scene.add(birdMesh);
      this.activeBirds.push({ mesh: birdMesh, phase: Math.random() * Math.PI * 2 });
    }

    for (const b of this.activeBirds) {
      b.phase += dt * 1.5;
      const radius = 25 + Math.sin(b.phase * 0.5) * 5;
      // Orbit ahead of the ball
      b.mesh.position.x = Math.sin(b.phase) * radius;
      b.mesh.position.y = 15 + Math.cos(b.phase * 1.3) * 5;
      b.mesh.position.z = ballZ + 50 + Math.cos(b.phase) * radius;
      
      // Orient bird along its tangent flight path
      const nextX = Math.sin(b.phase + 0.1) * radius;
      const nextY = 15 + Math.cos((b.phase + 0.1) * 1.3) * 5;
      const nextZ = ballZ + 50 + Math.cos(b.phase + 0.1) * radius;
      b.mesh.lookAt(nextX, nextY, nextZ);
    }

    // 2. Cooldown & Drop logic
    if (this.birdDropCooldown > 0) {
      this.birdDropCooldown -= dt;
    } else {
      const targetZ = ballZ + forwardSpeed * 2.0;
      const roadCenter = this.curvatureMap.getRoadCenterAtZ(targetZ);

      if (roadCenter !== null) {
        // Drop an obstacle exactly at target
        const dropIsEgg = Math.random() > 0.5;
        const mesh = dropIsEgg ? makeDroppedEgg() : makeDroppedRock();
        mesh.position.set(roadCenter, 1.2, targetZ);
        this.scene.add(mesh);

        const body = new CANNON.Body({
          mass: 0,
          collisionResponse: false,
          type: CANNON.Body.STATIC,
        });
        body.addShape(new CANNON.Box(new CANNON.Vec3(1.2, 1.2, 1.2)));
        body.position.set(roadCenter, 1.2, targetZ);
        this.world.addBody(body);

        this.droppedObstacles.push({ mesh, body, triggerZ: targetZ });
        this.birdDropCooldown = 4.0 + Math.random() * 3.0;
      } else {
        // Road is a gap or out of bounds, try again shortly
        this.birdDropCooldown = 0.5;
      }
    }

    // 3. Clean up dropped obstacles after ball passes
    const bp = this.ballBody.position;
    for (let i = this.droppedObstacles.length - 1; i >= 0; i--) {
      const drop = this.droppedObstacles[i];
      
      // Collision mimicking lasers
      const dx = Math.abs(bp.x - drop.mesh.position.x);
      const dy = Math.abs(bp.y - drop.mesh.position.y);
      const dz = Math.abs(bp.z - drop.triggerZ);
      if (dx < 1.7 && dy < 1.7 && dz < 1.7) {
         // Direct hit - kill player
         this.ballBody.position.y = -20;
      }

      if (bp.z > drop.triggerZ + 5) { // 5 unit pass margin
        this.scene.remove(drop.mesh);
        drop.mesh.geometry.dispose();
        if (!Array.isArray(drop.mesh.material)) {
          drop.mesh.material.dispose();
        }
        this.world.removeBody(drop.body);
        this.droppedObstacles.splice(i, 1);
      }
    }
  }

  // -------- Clouds (Level 2) --------
  private updateClouds(dt: number, ballZ: number) {
    if (this.clouds.length < 8) {
      const c = makeCloud();
      // Spawn far away to the side and slightly ahead
      c.position.set((Math.random() < 0.5 ? 1 : -1) * (100 + Math.random() * 50), 30 + Math.random() * 20, ballZ + 100 + Math.random() * 200);
      c.userData.driftSpeed = 2 + Math.random() * 4;
      this.scene.add(c);
      this.clouds.push(c);
    }

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.position.z -= dt * c.userData.driftSpeed;
      if (c.position.z < ballZ - 100) {
        this.scene.remove(c);
        this.clouds.splice(i, 1);
      }
    }
  }

  private trySpawnScenery(level: Level, ballX: number, ballZ: number) {
    while (this.lastSceneryZ < ballZ + 200) {
      const z = this.lastSceneryZ + this.scenerySpacing * (0.7 + Math.random() * 0.6);
      this.lastSceneryZ = z;

      const obj = this.makeSceneryForLevel(level);
      if (!obj) {
        continue;
      }

      const side = Math.random() < 0.5 ? -1 : 1;
      const xOff = SIDE + Math.random() * 8;
      obj.position.set(side * xOff, 0, z);
      obj.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(obj);
      this.scenery.push({ obj, z });

      if (Math.random() < 0.5) {
        const obj2 = this.makeSceneryForLevel(level);
        if (obj2) {
          obj2.position.set(-side * (SIDE + Math.random() * 8), 0, z + Math.random() * 10 - 5);
          obj2.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(obj2);
          this.scenery.push({ obj: obj2, z: obj2.position.z });
        }
      }
    }
  }

  private trySpawnCollectiblesDeterministic(ballZ: number) {
    // Only spawn when we're reasonably close
    if (ballZ + 120 < this.nextCollectibleZ) return;

    // We want to spawn right at the exact Z distance
    const spawnZ = this.nextCollectibleZ;

    // Try finding the exact center of the road
    const roadCenter = this.curvatureMap.getRoadCenterAtZ(spawnZ);

    if (
      roadCenter === null || 
      !this.curvatureMap.isSafeAndCurved(spawnZ) || 
      this.spaceScene.hasLaserNearZ(spawnZ, 10)
    ) {
      // Unsafe location (gap, near gap, straightaway, or near a laser) -> delay & retry
      this.nextCollectibleZ += 20;
      return;
    }

    // Perfectly safe! Spawn it at the dead center
    // 50/50 Chance between speed debuff (blue) and ice pickup (white)
    if (Math.random() < 0.5) {
      this.spawnSpeedPowerUp(roadCenter, spawnZ);
    } else {
      this.spawnIcePickup(roadCenter, spawnZ);
    }

    // Next collectible will spawn 150-250m after this one
    this.nextCollectibleZ += 150 + Math.random() * 100;
  }

  private makeSceneryForLevel(level: Level): THREE.Object3D | null {
    switch (level) {
      case 2: {
        const r = Math.random();
        if (r < 0.45) return makePrehistoricFern();
        if (r < 0.7) return makeTropicalTree();
        return makeJaggedRock();
      }
      case 3: return Math.random() < 0.6 ? makeKelp() : makeSubmarine();
      case 4: return Math.random() < 0.55 ? makeCrater() : makeLunarRock();
      case 5: return makeMartianRuin();
      default: return null;
    }
  }

  private pruneScenery(ballZ: number) {
    const cutoff = ballZ - 60;
    while (this.scenery.length > 0 && this.scenery[0].z < cutoff) {
      const { obj } = this.scenery.shift()!;
      this.scene.remove(obj);
    }
  }

  private clearScenery() {
    for (const { obj } of this.scenery) this.scene.remove(obj);
    this.scenery = [];
  }

  private spawnBubbles(ballX: number, ballZ: number) {
    const count = 180;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 2] = ballZ + (Math.random() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.bubbles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.25, color: 0x88ddff, transparent: true, opacity: 0.55 })
    );
    this.scene.add(this.bubbles);
  }

  private tickBubbles(dt: number, ballZ: number) {
    const arr = this.bubbles!.geometry.attributes.position.array as Float32Array;
    const n = arr.length / 3;
    for (let i = 0; i < n; i++) {
      arr[i * 3 + 1] += dt * (0.8 + Math.random() * 0.5);
      if (arr[i * 3 + 1] > 20) arr[i * 3 + 1] = -15;
      if (arr[i * 3 + 2] < ballZ - 45) arr[i * 3 + 2] += 90;
      if (arr[i * 3 + 2] > ballZ + 45) arr[i * 3 + 2] -= 90;
    }
    (this.bubbles!.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  reset(ballZ: number) {
    this.clearScenery();
    this.clearCollectibles();
    if (this.earth) { this.scene.remove(this.earth); this.earth = null; }
    if (this.torus) { this.scene.remove(this.torus); this.torus = null; }
    if (this.bubbles) { this.scene.remove(this.bubbles); this.bubbles = null; }
    
    // Clear birds and drops
    for (const b of this.activeBirds) this.scene.remove(b.mesh);
    this.activeBirds = [];
    for (const d of this.droppedObstacles) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      this.world.removeBody(d.body);
    }
    this.droppedObstacles = [];
    this.birdDropCooldown = 6.0;

    this.earthSpawned = false;
    this.torusSpawned = false;
    this.currentLevel = 1;
    this.lastSceneryZ = ballZ;
    this.nextCollectibleZ = ballZ + 150;
    this.spaceScene.setVisible(true);
    this.scene.background = null;
    this.world.gravity.set(0, -20, 0);
    this.fog.color.set(0x04010e);
    this.fog.density = 0.009;
    this.roadMat.color.set(0xdd1111);
    this.roadMat.emissive.set(0xcc0000);
    this.roadGlowLight.color.set(0xff2200);

    // Reset effects
    this.speedDebuffActive = false;
    this.speedDebuffTimer = 0;
    this.speedRestoreTimer = 0;
    this.speedMultiplierCurrent = 1.0;
    this.iceActive = false;
    this.iceTimer = 0;
    this.ballBody.linearDamping = DEFAULT_LINEAR_DAMPING;
    this.ballBody.angularDamping = DEFAULT_ANGULAR_DAMPING;
  }
}
