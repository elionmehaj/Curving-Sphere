import * as THREE from "three";
import * as CANNON from "cannon-es";
import { createWorld, createBallBody } from "./Physics";
import {
  createRoadPiece,
  roadMat,
  glowMat,
  RoadPiece,
  PIECE_Z_LEN,
  SEGMENTS_AHEAD,
  SEGMENTS_BEHIND,
  GAP_EVERY,
} from "./RoadGenerator";
import { SpaceScene } from "./SpaceScene";
import { EnvironmentManager } from "./EnvironmentManager";

export type GameState = "playing" | "dead";

const BASE_FORWARD_SPEED = 8.64;
const STEER_FORCE = 14;
const MAX_LATERAL_SPEED = 6;

function drawHexGrid(ctx: CanvasRenderingContext2D, R: number, size: number) {
  const h = R * Math.sqrt(3);
  ctx.lineWidth = 5;
  for (let col = -1; col < 7; col++) {
    for (let row = -1; row < 7; row++) {
      const cx = col * R * 1.5;
      const cy = row * h + (col % 2 === 0 ? 0 : h / 2);
      const dark = (col * 3 + row * 7) % 11 < 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const x = cx + (R - 5) * Math.cos(a);
        const y = cy + (R - 5) * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      if (dark) {
        ctx.fillStyle = "rgba(0,0,18,0.85)";
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(0,0,35,0.9)";
      ctx.stroke();
    }
  }
}

function createFootballTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createRadialGradient(195, 175, 10, 256, 256, 310);
  grad.addColorStop(0, "#55aaff");
  grad.addColorStop(0.35, "#1155ee");
  grad.addColorStop(0.8, "#0033cc");
  grad.addColorStop(1, "#000a99");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  drawHexGrid(ctx, 62, size);

  const gloss = ctx.createRadialGradient(175, 150, 0, 200, 175, 165);
  gloss.addColorStop(0, "rgba(255,255,255,0.55)");
  gloss.addColorStop(0.5, "rgba(200,220,255,0.15)");
  gloss.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: CANNON.World;
  private ballMesh: THREE.Mesh;
  private ballBody: CANNON.Body;
  private pieces: RoadPiece[] = [];
  private keys: Record<string, boolean> = {};
  private state: GameState = "playing";
  private distance = 0;
  private onDistanceUpdate: (d: number) => void;
  private onStateChange: (s: GameState) => void;
  private animFrameId = 0;
  private forwardSpeed = BASE_FORWARD_SPEED;
  private container: HTMLDivElement;
  private lastTime = 0;
  private boundHandleKey: (e: KeyboardEvent) => void;
  private boundResize: () => void;

  private nextZ = 0;
  private nextX = 0;
  private pieceCount = 0;

  private spaceScene!: SpaceScene;
  private envManager!: EnvironmentManager;
  private roadGlowLight!: THREE.PointLight;
  private fog!: THREE.FogExp2;

  constructor(
    container: HTMLDivElement,
    onDistanceUpdate: (d: number) => void,
    onStateChange: (s: GameState) => void
  ) {
    this.container = container;
    this.onDistanceUpdate = onDistanceUpdate;
    this.onStateChange = onStateChange;

    const canvas = document.createElement("canvas");
    const testCtx = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!testCtx) throw new Error("WebGL is not supported in this environment.");
    container.appendChild(canvas);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
      context: testCtx as WebGLRenderingContext,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0x04010e, 0.009);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      68,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.1,
      420
    );

    this.setupLighting();
    this.world = createWorld();

    const footballTex = createFootballTexture();
    const ballMat = new THREE.MeshStandardMaterial({
      map: footballTex,
      normalScale: new THREE.Vector2(0.4, 0.4),
      metalness: 0.55,
      roughness: 0.22,
      envMapIntensity: 1.4,
    });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), ballMat);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
    this.ballMesh.add(new THREE.PointLight(0x4488ff, 1.8, 9));

    this.roadGlowLight = new THREE.PointLight(0xff00cc, 3.0, 16);
    this.roadGlowLight.position.y = 0.6;
    this.scene.add(this.roadGlowLight);

    this.ballBody = createBallBody(this.world);

    this.spaceScene = new SpaceScene(this.scene);
    this.envManager = new EnvironmentManager(
      this.scene,
      this.world,
      roadMat,
      glowMat,
      this.fog,
      this.roadGlowLight,
      this.spaceScene
    );

    this.generateInitialRoad();

    this.boundHandleKey = this.handleKey.bind(this);
    this.boundResize = this.onResize.bind(this);
    window.addEventListener("keydown", this.boundHandleKey);
    window.addEventListener("keyup", this.boundHandleKey);
    window.addEventListener("resize", this.boundResize);

    this.animate(0);
  }

  private setupLighting() {
    this.scene.add(new THREE.AmbientLight(0x223355, 0.6));
    const dir = new THREE.DirectionalLight(0xaabbff, 0.8);
    dir.position.set(5, 15, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 80;
    dir.shadow.camera.left = -20;
    dir.shadow.camera.right = 20;
    dir.shadow.camera.top = 20;
    dir.shadow.camera.bottom = -20;
    this.scene.add(dir);
    this.scene.add(new THREE.HemisphereLight(0x220044, 0x000011, 0.4));
  }

  private sineX(pieceIndex: number): number {
    const amplitude = Math.min(2.5 + (this.distance / 380) * 5.5, 14);
    const frequency = 0.1 + Math.min(this.distance / 2000, 1) * 0.24;
    return amplitude * Math.sin(pieceIndex * frequency);
  }

  private generateInitialRoad() {
    this.nextZ = 0;
    this.nextX = 0;
    this.pieceCount = 0;
    for (let i = 0; i < SEGMENTS_AHEAD + SEGMENTS_BEHIND + 2; i++) {
      this.spawnNextPiece();
    }
  }

  private spawnNextPiece() {
    const zStart = this.nextZ;
    const isGap = this.pieceCount > 3 && this.pieceCount % GAP_EVERY === 0;

    const xStart = this.nextX;
    const xRaw = this.sineX(this.pieceCount + 1);
    const xEnd = Math.max(-15, Math.min(15, xRaw));

    const piece = createRoadPiece(this.scene, this.world, xStart, xEnd, zStart, isGap);
    this.pieces.push(piece);
    this.nextZ = piece.zEnd;
    this.nextX = xEnd;
    this.pieceCount++;
  }

  private removeOldPieces() {
    const cutoffZ = this.ballBody.position.z - SEGMENTS_BEHIND * PIECE_Z_LEN;
    while (this.pieces.length > 0 && this.pieces[0].zEnd < cutoffZ) {
      const old = this.pieces.shift()!;
      if (old.mesh) {
        this.scene.remove(old.mesh);
        old.mesh.geometry.dispose();
      }
      if (old.glowMesh) {
        this.scene.remove(old.glowMesh);
        old.glowMesh.geometry.dispose();
      }
      if (old.physicsBody) this.world.removeBody(old.physicsBody);
    }
  }

  private handleKey(e: KeyboardEvent) {
    const down = e.type === "keydown";
    this.keys[e.code] = down;
    if (down && e.code === "Space") this.jump();
    if (down && e.code === "KeyR" && this.state === "dead") this.restart();
  }

  private jump() {
    if (this.state !== "playing") return;
    if (Math.abs(this.ballBody.velocity.y) < 2.5) this.ballBody.velocity.y = 8;
  }

  private animate = (time: number) => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    if (dt <= 0) return;

    if (this.state === "playing") this.update(dt);
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    const ballPos = this.ballBody.position;

    const { speedMultiplier } = this.envManager.update(
      dt,
      this.distance,
      ballPos.x,
      ballPos.z
    );

    this.forwardSpeed = (BASE_FORWARD_SPEED + this.distance * 0.0014) * speedMultiplier;
    this.ballBody.velocity.z = this.forwardSpeed;

    let lateralInput = 0;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) lateralInput = -1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) lateralInput = 1;

    if (lateralInput !== 0) {
      this.ballBody.applyForce(
        new CANNON.Vec3(lateralInput * STEER_FORCE, 0, 0),
        new CANNON.Vec3(ballPos.x, ballPos.y, ballPos.z)
      );
    }

    const vx = this.ballBody.velocity.x;
    if (Math.abs(vx) > MAX_LATERAL_SPEED) {
      this.ballBody.velocity.x = Math.sign(vx) * MAX_LATERAL_SPEED;
    }

    this.world.step(1 / 120, dt, 10);

    this.ballMesh.position.copy(this.ballBody.position as unknown as THREE.Vector3);
    this.ballMesh.quaternion.copy(this.ballBody.quaternion as unknown as THREE.Quaternion);

    this.roadGlowLight.position.set(ballPos.x, 0.6, ballPos.z + 2.5);

    if (this.envManager.isLevel(1)) {
      this.spaceScene.update(dt, ballPos.x, ballPos.z);
    }

    this.distance += this.forwardSpeed * dt;
    this.onDistanceUpdate(Math.floor(this.distance));

    if (ballPos.y < -10) this.die();

    const lastPiece = this.pieces[this.pieces.length - 1];
    if (ballPos.z + PIECE_Z_LEN * SEGMENTS_AHEAD * 0.65 > lastPiece.zEnd) {
      this.spawnNextPiece();
    }

    this.removeOldPieces();
  }

  private updateCamera() {
    const bx = this.ballBody.position.x;
    const by = this.ballBody.position.y;
    const bz = this.ballBody.position.z;
    const targetPos = new THREE.Vector3(bx, by + 3.5, bz - 8);
    this.camera.position.lerp(targetPos, 0.1);
    this.camera.lookAt(bx, by + 0.6, bz + 20);
  }

  private die() {
    this.state = "dead";
    this.onStateChange("dead");
  }

  restart() {
    for (const p of this.pieces) {
      if (p.mesh) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
      }
      if (p.glowMesh) {
        this.scene.remove(p.glowMesh);
        p.glowMesh.geometry.dispose();
      }
      if (p.physicsBody) this.world.removeBody(p.physicsBody);
    }
    this.pieces = [];
    this.distance = 0;
    this.forwardSpeed = BASE_FORWARD_SPEED;

    this.ballBody.position.set(0, 2, 0);
    this.ballBody.velocity.set(0, 0, 0);
    this.ballBody.angularVelocity.set(0, 0, 0);

    this.envManager.reset(0);
    this.generateInitialRoad();
    this.state = "playing";
    this.onStateChange("playing");
    this.onDistanceUpdate(0);
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  destroy() {
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener("keydown", this.boundHandleKey);
    window.removeEventListener("keyup", this.boundHandleKey);
    window.removeEventListener("resize", this.boundResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
