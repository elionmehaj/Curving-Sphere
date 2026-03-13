import * as THREE from "three";
import * as CANNON from "cannon-es";
import { createWorld, createBallBody } from "./Physics";
import {
  createRoadPiece,
  buildStarfield,
  RoadPiece,
  PIECE_Z_LEN,
  GAP_Z_LEN,
  SEGMENTS_AHEAD,
  SEGMENTS_BEHIND,
  GAP_EVERY,
} from "./RoadGenerator";

export type GameState = "playing" | "dead";

const BASE_FORWARD_SPEED = 5.76;
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
  private starfield!: THREE.Points;

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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03010f);
    this.scene.fog = new THREE.FogExp2(0x06021a, 0.012);

    this.camera = new THREE.PerspectiveCamera(
      60,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.1,
      220
    );

    this.setupLighting();
    this.world = createWorld();

    const ballGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const ballMat = new THREE.MeshLambertMaterial({ color: 0x2266ff });
    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);

    this.ballBody = createBallBody(this.world);
    this.starfield = buildStarfield(this.scene);
    this.generateInitialRoad();

    this.boundHandleKey = this.handleKey.bind(this);
    this.boundResize = this.onResize.bind(this);
    window.addEventListener("keydown", this.boundHandleKey);
    window.addEventListener("keyup", this.boundHandleKey);
    window.addEventListener("resize", this.boundResize);

    this.animate(0);
  }

  private setupLighting() {
    const ambient = new THREE.AmbientLight(0x8899cc, 0.5);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xaabbff, 1.1);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 120;
    dir.shadow.camera.left = -30;
    dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30;
    dir.shadow.camera.bottom = -30;
    this.scene.add(dir);

    const hemi = new THREE.HemisphereLight(0x330066, 0x000033, 0.3);
    this.scene.add(hemi);
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
      this.xDrift += (Math.random() - 0.5) * 0.1;
      this.xDrift = Math.max(-0.22, Math.min(0.22, this.xDrift));
      xEnd = this.nextX + this.xDrift * PIECE_Z_LEN;
      const maxX = 16;
      if (Math.abs(xEnd) > maxX) {
        this.xDrift *= -0.6;
        xEnd = this.nextX + this.xDrift * PIECE_Z_LEN;
      }
    } else {
      xEnd = this.nextX + (Math.random() - 0.5) * 3;
    }

    const piece = createRoadPiece(
      this.scene,
      this.world,
      this.nextX,
      xEnd,
      zStart,
      isGap
    );

    this.pieces.push(piece);
    this.nextZ = piece.zEnd;
    this.nextX = isGap ? xEnd : xEnd;
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
      if (old.physicsBody) {
        this.world.removeBody(old.physicsBody);
      }
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
    if (Math.abs(this.ballBody.velocity.y) < 2.5) {
      this.ballBody.velocity.y = 8;
    }
  }

  private animate = (time: number) => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    if (dt <= 0) return;

    if (this.state === "playing") this.update(dt);
    this.updateCamera();

    this.starfield.position.z = this.ballBody.position.z;
    this.starfield.position.x = this.ballBody.position.x;

    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    this.forwardSpeed = BASE_FORWARD_SPEED + this.distance * 0.0014;
    const ballPos = this.ballBody.position;

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

    this.world.step(1 / 60, dt, 3);

    this.ballMesh.position.copy(this.ballBody.position as unknown as THREE.Vector3);
    this.ballMesh.quaternion.copy(this.ballBody.quaternion as unknown as THREE.Quaternion);

    this.distance += this.forwardSpeed * dt;
    this.onDistanceUpdate(Math.floor(this.distance));

    if (ballPos.y < -8) this.die();

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
    const targetPos = new THREE.Vector3(bx, by + 5, bz - 10);
    this.camera.position.lerp(targetPos, 0.1);
    this.camera.lookAt(bx, by + 0.5, bz + 7);
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
