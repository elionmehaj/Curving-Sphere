import * as THREE from "three";
import * as CANNON from "cannon-es";
import { createWorld, createBallBody, createGroundBody } from "./Physics";
import {
  createRoadSegment,
  nextCurveX,
  ROAD_WIDTH,
  SEGMENT_LENGTH,
  SEGMENTS_AHEAD,
  SEGMENTS_BEHIND,
  RoadSegment,
} from "./RoadGenerator";

export type GameState = "playing" | "dead";

interface SegmentWithBody extends RoadSegment {
  physicsBody: CANNON.Body;
}

const BASE_FORWARD_SPEED = 4.8;
const STEER_FORCE = 14;
const MAX_LATERAL_SPEED = 6;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: CANNON.World;
  private ballMesh: THREE.Mesh;
  private ballBody: CANNON.Body;
  private segments: SegmentWithBody[] = [];
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

  private lastSegZ = 0;
  private lastSegX = 0;
  private xDrift = 0;
  private segmentIndex = 0;

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
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, 50, 110);

    this.camera = new THREE.PerspectiveCamera(
      60,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.1,
      200
    );

    this.setupLighting();
    this.world = createWorld();

    const ballGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const ballMat = new THREE.MeshLambertMaterial({ color: 0x2266ff });
    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);

    this.ballBody = createBallBody(this.world);

    this.generateInitialRoad();

    this.boundHandleKey = this.handleKey.bind(this);
    this.boundResize = this.onResize.bind(this);
    window.addEventListener("keydown", this.boundHandleKey);
    window.addEventListener("keyup", this.boundHandleKey);
    window.addEventListener("resize", this.boundResize);

    this.animate(0);
  }

  private setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 100;
    dir.shadow.camera.left = -30;
    dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30;
    dir.shadow.camera.bottom = -30;
    this.scene.add(dir);
  }

  private generateInitialRoad() {
    this.lastSegZ = -SEGMENT_LENGTH;
    this.lastSegX = 0;
    this.xDrift = 0;
    this.segmentIndex = 0;
    for (let i = 0; i < SEGMENTS_AHEAD + SEGMENTS_BEHIND + 2; i++) {
      this.addNextSegment();
    }
  }

  private addNextSegment() {
    const z = this.lastSegZ + SEGMENT_LENGTH;
    let x = this.lastSegX;

    if (this.segmentIndex > 2) {
      const result = nextCurveX(this.lastSegX, this.xDrift);
      x = result.x;
      this.xDrift = result.drift;
    }

    const seg = createRoadSegment(this.scene, x, z);
    const physicsBody = createGroundBody(this.world, x, 0, z, 0, ROAD_WIDTH, SEGMENT_LENGTH);
    this.segments.push({ ...seg, physicsBody });
    this.lastSegZ = z;
    this.lastSegX = x;
    this.segmentIndex++;
  }

  private removeOldSegments() {
    const ballZ = this.ballBody.position.z;
    const cutoffZ = ballZ - SEGMENTS_BEHIND * SEGMENT_LENGTH;
    while (this.segments.length > 0 && this.segments[0].centerZ < cutoffZ) {
      const old = this.segments.shift()!;
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      (old.mesh.material as THREE.Material).dispose();
      this.world.removeBody(old.physicsBody);
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
    if (Math.abs(this.ballBody.velocity.y) < 2) {
      this.ballBody.velocity.y = 7;
    }
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
    this.forwardSpeed = BASE_FORWARD_SPEED + this.distance * 0.0012;
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

    if (ballPos.y < -5) this.die();

    const lastSeg = this.segments[this.segments.length - 1];
    if (ballPos.z + SEGMENT_LENGTH * SEGMENTS_AHEAD * 0.7 > lastSeg.centerZ) {
      this.addNextSegment();
    }

    this.removeOldSegments();
  }

  private updateCamera() {
    const bx = this.ballBody.position.x;
    const by = this.ballBody.position.y;
    const bz = this.ballBody.position.z;
    const targetPos = new THREE.Vector3(bx, by + 5, bz - 9);
    this.camera.position.lerp(targetPos, 0.1);
    this.camera.lookAt(bx, by + 0.5, bz + 6);
  }

  private die() {
    this.state = "dead";
    this.onStateChange("dead");
  }

  restart() {
    for (const seg of this.segments) {
      this.scene.remove(seg.mesh);
      seg.mesh.geometry.dispose();
      (seg.mesh.material as THREE.Material).dispose();
      this.world.removeBody(seg.physicsBody);
    }
    this.segments = [];
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
