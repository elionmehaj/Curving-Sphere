import * as THREE from "three";

interface UFOData {
  group: THREE.Group;
  baseX: number;
  baseY: number;
  relZ: number;
  bobPhase: number;
  bobSpeed: number;
  rotSpeed: number;
}

interface CelestialBody {
  mesh: THREE.Mesh;
  relZ: number;
  baseX: number;
  baseY: number;
}

interface LaserData {
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

export class SpaceScene {
  private scene: THREE.Scene;
  private bgSphere!: THREE.Mesh;
  private nearStars!: THREE.Points;
  private ufos: UFOData[] = [];
  private moons: CelestialBody[] = [];
  private suns: CelestialBody[] = [];
  private sunLights: { light: THREE.PointLight; relZ: number; baseX: number; baseY: number }[] = [];
  private lasers: LaserData[] = [];
  private explosions: ExplosionData[] = [];
  private laserTimer = 0.5;
  private explosionTimer = 2.0;

  private readonly laserColors = [0x00ff88, 0x44ccff, 0xff3322, 0xffcc00, 0x00ffff, 0xff88ff];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.buildNebulaSkybox();
    this.buildNearStars();
    this.buildCelestialBodies();
    this.buildUFOs();
  }

  private buildNebulaSkybox() {
    const W = 2048, H = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#02010d";
    ctx.fillRect(0, 0, W, H);

    const nebulae = [
      { x: 180, y: 350, r: 450, r2: 120, g2: 0, b2: 210, a: 0.38 },
      { x: 900, y: 180, r: 380, r2: 0, g2: 60, b2: 220, a: 0.32 },
      { x: 1450, y: 620, r: 480, r2: 200, g2: 0, b2: 140, a: 0.3 },
      { x: 580, y: 820, r: 320, r2: 0, g2: 120, b2: 190, a: 0.28 },
      { x: 1820, y: 250, r: 300, r2: 220, g2: 90, b2: 0, a: 0.22 },
      { x: 1100, y: 950, r: 340, r2: 80, g2: 0, b2: 160, a: 0.35 },
      { x: 280, y: 90, r: 260, r2: 0, g2: 160, b2: 130, a: 0.2 },
      { x: 1650, y: 900, r: 290, r2: 160, g2: 40, b2: 180, a: 0.26 },
    ];

    for (const n of nebulae) {
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      grad.addColorStop(0, `rgba(${n.r2},${n.g2},${n.b2},${n.a})`);
      grad.addColorStop(0.45, `rgba(${n.r2},${n.g2},${n.b2},${n.a * 0.4})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const big = Math.random() < 0.04;
      const r = big ? 1.8 + Math.random() * 1.2 : 0.5 + Math.random() * 0.8;
      const v = Math.floor(180 + Math.random() * 75);
      const alpha = big ? 1.0 : 0.4 + Math.random() * 0.6;
      const tint = Math.random();
      const cr = tint < 0.3 ? v : tint < 0.55 ? Math.floor(v * 0.8) : v;
      const cg = tint < 0.3 ? Math.floor(v * 0.85) : v;
      const cb = tint > 0.7 ? v : tint > 0.45 ? v : Math.floor(v * 0.85);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (big) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
        glow.addColorStop(0, `rgba(${cr},${cg},${cb},0.3)`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.SphereGeometry(380, 32, 16);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
    this.bgSphere = new THREE.Mesh(geo, mat);
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
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = (r * Math.sin(phi) * Math.sin(theta)) * 0.6 + 5;
      pos[i * 3 + 2] = r * Math.cos(phi);
      const c = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      const b = 0.5 + Math.random() * 0.5;
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.nearStars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.35, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9 })
    );
    this.scene.add(this.nearStars);
  }

  private buildCelestialBodies() {
    const sunConfigs = [
      { baseX: 65, baseY: 18, relZ: 80, r: 9, color: 0xff8800, lightColor: 0xff9900 },
      { baseX: -85, baseY: -8, relZ: 130, r: 11, color: 0xffaa22, lightColor: 0xffaa44 },
      { baseX: 48, baseY: 28, relZ: 200, r: 7, color: 0xff6600, lightColor: 0xff7700 },
      { baseX: -42, baseY: -18, relZ: 160, r: 13, color: 0xffcc00, lightColor: 0xffcc00 },
    ];

    for (const s of sunConfigs) {
      const geo = new THREE.SphereGeometry(s.r, 20, 14);
      const mat = new THREE.MeshBasicMaterial({ color: s.color });
      const sun = new THREE.Mesh(geo, mat);
      this.scene.add(sun);

      const coronaGeo = new THREE.SphereGeometry(s.r * 1.6, 20, 14);
      const coronaMat = new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.15, side: THREE.BackSide });
      const corona = new THREE.Mesh(coronaGeo, coronaMat);
      this.scene.add(corona);

      const light = new THREE.PointLight(s.lightColor, 2.0, 150);
      this.scene.add(light);

      this.suns.push({ mesh: sun, relZ: s.relZ, baseX: s.baseX, baseY: s.baseY });
      this.suns.push({ mesh: corona, relZ: s.relZ, baseX: s.baseX, baseY: s.baseY });
      this.sunLights.push({ light, relZ: s.relZ, baseX: s.baseX, baseY: s.baseY });
    }

    const moonConfigs = [
      { baseX: -52, baseY: 8, relZ: 55, r: 8 },
      { baseX: 42, baseY: -4, relZ: 100, r: 10 },
      { baseX: -72, baseY: 18, relZ: 155, r: 12 },
      { baseX: 82, baseY: 3, relZ: 125, r: 7 },
      { baseX: -32, baseY: -14, relZ: 195, r: 9 },
      { baseX: 62, baseY: 22, relZ: 245, r: 11 },
    ];

    const moonMat = new THREE.MeshLambertMaterial({ color: 0x999aaa });
    for (const m of moonConfigs) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(m.r, 18, 12), moonMat);
      this.scene.add(moon);
      this.moons.push({ mesh: moon, relZ: m.relZ, baseX: m.baseX, baseY: m.baseY });
    }
  }

  private makeUFOGroup(): THREE.Group {
    const group = new THREE.Group();
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x889aaa });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.0, 0.5, 22), metalMat);
    group.add(disc);
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.3, 22), new THREE.MeshLambertMaterial({ color: 0x5a6a7a }));
    ridge.position.y = 0.2;
    group.add(ridge);
    const domeMat = new THREE.MeshLambertMaterial({ color: 0xaaccdd, transparent: true, opacity: 0.8 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.y = 0.38;
    group.add(dome);
    const glowColor = Math.random() < 0.5 ? 0x00ff88 : 0x44aaff;
    const ufoLight = new THREE.PointLight(glowColor, 1.5, 12);
    ufoLight.position.y = -0.6;
    group.add(ufoLight);
    return group;
  }

  private buildUFOs() {
    const slots = [
      { baseX: -19, baseY: 5, relZ: 22 },
      { baseX: -28, baseY: 10, relZ: 38 },
      { baseX: -22, baseY: 2, relZ: 55 },
      { baseX: -34, baseY: 14, relZ: 16 },
      { baseX: -25, baseY: 6, relZ: 68 },
      { baseX: -30, baseY: 0, relZ: 82 },
      { baseX: 19, baseY: 4, relZ: 28 },
      { baseX: 27, baseY: 11, relZ: 44 },
      { baseX: 22, baseY: 1, relZ: 60 },
      { baseX: 34, baseY: 9, relZ: 12 },
      { baseX: 26, baseY: 7, relZ: 74 },
      { baseX: 32, baseY: 15, relZ: 48 },
    ];

    for (const s of slots) {
      const group = this.makeUFOGroup();
      this.scene.add(group);
      this.ufos.push({
        group,
        baseX: s.baseX,
        baseY: s.baseY,
        relZ: s.relZ,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.7 + Math.random() * 0.8,
        rotSpeed: 0.2 + Math.random() * 0.4,
      });
    }
  }

  private spawnLaser(a: THREE.Vector3, b: THREE.Vector3) {
    const color = this.laserColors[Math.floor(Math.random() * this.laserColors.length)];
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0 });
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.lasers.push({ line, timer: 0, duration: 0.25 + Math.random() * 0.35 });
  }

  private spawnExplosion(pos: THREE.Vector3) {
    const count = 40;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color(0xff8800), new THREE.Color(0xff4400), new THREE.Color(0xffee00), new THREE.Color(0xffffff), new THREE.Color(0xff2200)];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
      const speed = 3 + Math.random() * 7;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      velocities[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
      velocities[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
      velocities[i * 3 + 2] = speed * Math.cos(phi);
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 1.0 }));
    this.scene.add(pts);
    this.explosions.push({ points: pts, velocities, timer: 0, duration: 0.7 + Math.random() * 0.4 });
  }

  update(dt: number, ballX: number, ballZ: number) {
    const time = performance.now() * 0.001;

    this.bgSphere.position.set(ballX, 0, ballZ);
    this.nearStars.position.set(ballX, 0, ballZ);

    for (const ufo of this.ufos) {
      const wx = ufo.baseX;
      const wy = ufo.baseY + Math.sin(time * ufo.bobSpeed + ufo.bobPhase) * 1.8;
      const wz = ballZ + ufo.relZ;
      ufo.group.position.set(wx, wy, wz);
      ufo.group.rotation.y += dt * ufo.rotSpeed;
      if (ufo.relZ < -25) ufo.relZ += 130;
      if (ufo.relZ > 130) ufo.relZ = -10;
    }

    for (const m of this.moons) {
      m.mesh.position.set(m.baseX, m.baseY, ballZ + m.relZ);
      if (m.relZ < -30) m.relZ += 280;
    }
    for (const s of this.suns) {
      s.mesh.position.set(s.baseX, s.baseY, ballZ + s.relZ);
      if (s.relZ < -30) s.relZ += 280;
    }
    for (const sl of this.sunLights) {
      sl.light.position.set(sl.baseX, sl.baseY, ballZ + sl.relZ);
      if (sl.relZ < -30) sl.relZ += 280;
    }

    this.laserTimer -= dt;
    if (this.laserTimer <= 0 && this.ufos.length >= 2) {
      this.laserTimer = 0.3 + Math.random() * 0.5;
      const ia = Math.floor(Math.random() * this.ufos.length);
      let ib = Math.floor(Math.random() * this.ufos.length);
      while (ib === ia) ib = Math.floor(Math.random() * this.ufos.length);
      this.spawnLaser(this.ufos[ia].group.position, this.ufos[ib].group.position);
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.timer += dt;
      (l.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1 - l.timer / l.duration);
      if (l.timer >= l.duration) {
        this.scene.remove(l.line);
        l.line.geometry.dispose();
        this.lasers.splice(i, 1);
      }
    }

    this.explosionTimer -= dt;
    if (this.explosionTimer <= 0) {
      this.explosionTimer = 1.2 + Math.random() * 1.8;
      const ufo = this.ufos[Math.floor(Math.random() * this.ufos.length)];
      this.spawnExplosion(ufo.group.position.clone());
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.timer += dt;
      const posArr = exp.points.geometry.attributes.position.array as Float32Array;
      for (let j = 0; j < posArr.length / 3; j++) {
        posArr[j * 3] += exp.velocities[j * 3] * dt;
        posArr[j * 3 + 1] += exp.velocities[j * 3 + 1] * dt;
        posArr[j * 3 + 2] += exp.velocities[j * 3 + 2] * dt;
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
