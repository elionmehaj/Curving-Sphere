import * as THREE from "three";
import * as CANNON from "cannon-es";
import { createWorld, createBallBody } from "./Physics";
import {
  createRoadPiece,
  roadMat,
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
  private xDrift = 0;
  private pieceCount = 0;
  private curvePhase = 0;

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
      82,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.1,
      420
    );

    this.setupLighting();
    this.world = createWorld();

    const ballGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0x1155ff,
      emissive: 0x0033cc,
      emissiveIntensity: 0.4,
      metalness: 0.6,
      roughness: 0.3,
    });
    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
    this.ballMesh.add(new THREE.PointLight(0x2255ff, 1.5, 8));

    this.roadGlowLight = new THREE.PointLight(0xff2200, 2.5, 18);
    this.roadGlowLight.position.y = 1.0;
    this.scene.add(this.roadGlowLight);

    this.ballBody = createBallBody(this.world);

    this.spaceScene = new SpaceScene(this.scene);
    this.envManager = new EnvironmentManager(
      this.scene,
      this.world,
      roadMat,
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

  private generateInitialRoad() {
    this.nextZ = 0;
    this.nextX = 0;
    this.xDrift = 0;
    this.pieceCount = 0;
    for (let i = 0; i < SEGMENTS_AHEAD + SEGMENTS_BEHIND + 2; i++) {
      this.spawnNextPiece();
    }
  }

  private spawnNextPiece() {
    const zStart = this.nextZ;
    let xEnd = this.nextX;
    const isGap = this.pieceCount > 3 && this.pieceCount % GAP_EVERY === 0;

    if (!isGap) {
      this.curvePhase += 0.09 + (Math.random() - 0.5) * 0.015;
      this.xDrift = Math.sin(this.curvePhase) * 0.55;
      xEnd = this.nextX + this.xDrift * PIECE_Z_LEN;
      const maxX = 18;
      if (Math.abs(xEnd) > maxX) {
        this.curvePhase += Math.PI;
        this.xDrift = Math.sin(this.curvePhase) * 0.55;
        xEnd = this.nextX + this.xDrift * PIECE_Z_LEN;
      }
    } else {
      xEnd = this.nextX + Math.sin(this.curvePhase) * 2;
    }

    const piece = createRoadPiece(this.scene, this.world, this.nextX, xEnd, zStart, isGap);
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

    this.roadGlowLight.position.set(ballPos.x, 1.0, ballPos.z + 3);

    // SpaceScene only updates when visible (level 1)
    if (this.envManager["currentLevel"] === 1) {
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
    const targetPos = new THREE.Vector3(bx, by + 1.0, bz - 2.5);
    this.camera.position.lerp(targetPos, 0.14);
    this.camera.lookAt(bx, by - 0.1, bz + 90);
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
      if (p.physicsBody) this.world.removeBody(p.physicsBody);
    }
    this.pieces = [];
    this.distance = 0;
    this.forwardSpeed = BASE_FORWARD_SPEED;

    this.ballBody.position.set(0, 2, 0);
    this.ballBody.velocity.set(0, 0, 0);
    this.ballBody.angularVelocity.set(0, 0, 0);

    this.curvePhase = 0;
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
