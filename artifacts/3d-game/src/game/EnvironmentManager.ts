import * as THREE from "three";
import * as CANNON from "cannon-es";
import { SpaceScene } from "./SpaceScene";

export type Level = 1 | 2 | 3 | 4 | 5;

export interface EnvResult {
  speedMultiplier: number;
}

interface SceneryItem {
  obj: THREE.Object3D;
  z: number;
}

const SIDE = 9;

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

function makeHouse(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 2.8, 3.5),
    new THREE.MeshLambertMaterial({ color: 0xf5f5f5 })
  );
  base.position.y = 1.4;
  g.add(base);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 1.8, 4),
    new THREE.MeshLambertMaterial({ color: 0xcc2222 })
  );
  roof.position.y = 3.7;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.2, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x8b5a2b })
  );
  door.position.set(0, 0.6, 1.76);
  g.add(door);
  return g;
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

export class EnvironmentManager {
  private scene: THREE.Scene;
  private world: CANNON.World;
  private roadMat: THREE.MeshStandardMaterial;
  private fog: THREE.FogExp2;
  private roadGlowLight: THREE.PointLight;
  private spaceScene: SpaceScene;

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
  private roadGlowTarget = new THREE.Color(0xff2200);

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    roadMat: THREE.MeshStandardMaterial,
    fog: THREE.FogExp2,
    roadGlowLight: THREE.PointLight,
    spaceScene: SpaceScene
  ) {
    this.scene = scene;
    this.world = world;
    this.roadMat = roadMat;
    this.fog = fog;
    this.roadGlowLight = roadGlowLight;
    this.spaceScene = spaceScene;
  }

  update(dt: number, distance: number, ballX: number, ballZ: number): EnvResult {
    const level = this.levelFor(distance);
    if (level !== this.currentLevel) {
      this.onLevelEnter(level, ballX, ballZ);
      this.currentLevel = level;
    }

    this.blendEnvironment(distance, level, dt);
    this.updateSpecialEvents(distance, ballZ, dt);
    this.trySpawnScenery(level, ballX, ballZ);
    this.pruneScenery(ballZ);
    if (this.bubbles) this.tickBubbles(dt, ballZ);

    const speedMultiplier = level === 5 ? 1.3 : 1.0;
    return { speedMultiplier };
  }

  private levelFor(distance: number): Level {
    if (distance < 500) return 1;
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
      this.spaceScene.setVisible(false);
      this.scene.background = new THREE.Color(0x87ceeb);
      if (this.earth) { this.scene.remove(this.earth); this.earth = null; }
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

  private blendEnvironment(distance: number, level: Level, dt: number) {
    const s = Math.min(dt * 1.2, 1);

    switch (level) {
      case 1:
        this.fogTargetColor.set(0x04010e);
        this.fog.density = THREE.MathUtils.lerp(this.fog.density, 0.009, s);
        this.roadColorTarget.set(0xdd1111);
        this.roadEmissiveTarget.set(0xcc0000);
        this.roadGlowTarget.set(0xff2200);
        break;
      case 2: {
        const t = distance > 950 ? Math.min((distance - 950) / 50, 1) : 0;
        this.fogTargetColor.set(t > 0 ? 0x020510 : 0xaaddff);
        const skyBlue = new THREE.Color(0x87ceeb);
        const darkNavy = new THREE.Color(0x040820);
        if (this.scene.background instanceof THREE.Color)
          this.scene.background.lerp(t > 0 ? darkNavy : skyBlue, s);
        this.fog.density = THREE.MathUtils.lerp(this.fog.density, 0.004 + t * 0.008, s);
        this.roadColorTarget.set(0x44cc22);
        this.roadEmissiveTarget.set(0x228800);
        this.roadGlowTarget.set(0x22ff44);
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
    this.roadGlowLight.color.lerp(this.roadGlowTarget, s * 0.4);
  }

  private updateSpecialEvents(distance: number, ballZ: number, dt: number) {
    if (distance >= 380 && !this.earthSpawned) {
      this.earthSpawned = true;
      this.earthZ = ballZ + 220;
      const geo = new THREE.SphereGeometry(22, 24, 18);
      const mat = new THREE.MeshLambertMaterial({ color: 0x2266aa });
      this.earth = new THREE.Mesh(geo, mat);
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(22.8, 24, 18),
        new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.35 })
      );
      this.earth.add(clouds);
      this.earth.position.set(0, 0, this.earthZ);
      this.scene.add(this.earth);
    }
    if (this.earth) {
      if (distance < 500) {
        const t = Math.min((distance - 380) / 120, 1);
        this.earth.scale.setScalar(1 + t * 6);
        this.earth.rotation.y += dt * 0.05;
      } else {
        this.scene.remove(this.earth);
        this.earth = null;
      }
    }

    if (distance >= 1400 && !this.torusSpawned) {
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

  private trySpawnScenery(level: Level, ballX: number, ballZ: number) {
    while (this.lastSceneryZ < ballZ + 200) {
      const z = this.lastSceneryZ + this.scenerySpacing * (0.7 + Math.random() * 0.6);
      this.lastSceneryZ = z;

      const obj = this.makeSceneryForLevel(level);
      if (!obj) continue;

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

  private makeSceneryForLevel(level: Level): THREE.Object3D | null {
    switch (level) {
      case 2: return Math.random() < 0.55 ? makeTree() : makeHouse();
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
    if (this.earth) { this.scene.remove(this.earth); this.earth = null; }
    if (this.torus) { this.scene.remove(this.torus); this.torus = null; }
    if (this.bubbles) { this.scene.remove(this.bubbles); this.bubbles = null; }
    this.earthSpawned = false;
    this.torusSpawned = false;
    this.currentLevel = 1;
    this.lastSceneryZ = ballZ;
    this.spaceScene.setVisible(true);
    this.scene.background = null;
    this.world.gravity.set(0, -20, 0);
    this.fog.color.set(0x04010e);
    this.fog.density = 0.009;
    this.roadMat.color.set(0xdd1111);
    this.roadMat.emissive.set(0xcc0000);
    this.roadGlowLight.color.set(0xff2200);
  }
}
