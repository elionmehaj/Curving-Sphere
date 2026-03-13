import * as THREE from "three";
import * as CANNON from "cannon-es";
import {
  createWorld,
  createBallBody,
  createGroundBody,
} from "./Physics";
import {
  createRoadSegment,
  generateCurvedYaw,
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
  private forwardSpeed = 8;
  private lastSegEndX = 0;
  private lastSegEndZ = 0;
  private lastSegYaw = 0;
  private segmentIndex = 0;
  private container: HTMLDivElement;
  private lastTime = 0;
  private boundHandleKey: (e: KeyboardEvent) => void;

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
    if (!testCtx) {
      throw new Error("WebGL is not supported in this environment.");
    }
    container.appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
      context: testCtx as WebGLRenderingContext,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, 40, 100);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
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
    window.addEventListener("keydown", this.boundHandleKey);
    window.addEventListener("keyup", this.boundHandleKey);
    window.addEventListener("resize", this.onResize.bind(this));

    this.animate(0);
  }

  private setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

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
    this.lastSegEndX = 0;
    this.lastSegEndZ = 0;
    this.lastSegYaw = 0;

    for (let i = 0; i < SEGMENTS_AHEAD + SEGMENTS_BEHIND; i++) {
      this.addNextSegment();
    }
  }

  private addNextSegment() {
    const newYaw =
      this.segmentIndex === 0
        ? 0
        : generateCurvedYaw(this.lastSegYaw);
    const seg = createRoadSegment(
      this.scene,
      this.lastSegEndX,
      this.lastSegEndZ,
      newYaw
    );
    const physicsBody = createGroundBody(
      this.world,
      seg.centerX,
      0,
      seg.centerZ,
      newYaw,
      seg.width,
      seg.length
    );
    this.segments.push({ ...seg, physicsBody });
    this.lastSegEndX = seg.endX;
    this.lastSegEndZ = seg.endZ;
    this.lastSegYaw = newYaw;
    this.segmentIndex++;
  }

  private removeOldSegments() {
    const bx = this.ballBody.position.x;
    const bz = this.ballBody.position.z;
    while (this.segments.length > 0) {
      const oldest = this.segments[0];
      const dx = oldest.centerX - bx;
      const dz = oldest.centerZ - bz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > SEGMENT_LENGTH * (SEGMENTS_BEHIND + 2)) {
        this.scene.remove(oldest.mesh);
        oldest.mesh.geometry.dispose();
        (oldest.mesh.material as THREE.Material).dispose();
        this.world.removeBody(oldest.physicsBody);
        this.segments.shift();
      } else {
        break;
      }
    }
  }

  private handleKey(e: KeyboardEvent) {
    const down = e.type === "keydown";
    this.keys[e.code] = down;

    if (down && e.code === "Space") {
      this.jump();
    }

    if (down && e.code === "KeyR" && this.state === "dead") {
      this.restart();
    }
  }

  private jump() {
    if (this.state !== "playing") return;
    const vel = this.ballBody.velocity;
    if (Math.abs(vel.y) < 2) {
      this.ballBody.velocity.y = 7;
    }
  }

  private animate = (time: number) => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    if (dt <= 0) return;

    if (this.state === "playing") {
      this.update(dt);
    }

    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    this.forwardSpeed = 8 + this.distance * 0.002;
    const ballPos = this.ballBody.position;

    const lookYaw = this.getCurrentPathYaw();
    const forwardX = Math.sin(lookYaw);
    const forwardZ = Math.cos(lookYaw);
    const rightX = Math.cos(lookYaw);
    const rightZ = -Math.sin(lookYaw);

    const steerForce = 18;
    let lateralInput = 0;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) lateralInput -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) lateralInput += 1;

    this.ballBody.applyForce(
      new CANNON.Vec3(
        forwardX * this.forwardSpeed * 3 + rightX * lateralInput * steerForce,
        0,
        forwardZ * this.forwardSpeed * 3 + rightZ * lateralInput * steerForce
      ),
      new CANNON.Vec3(ballPos.x, ballPos.y, ballPos.z)
    );

    const vx = this.ballBody.velocity.x;
    const vz = this.ballBody.velocity.z;
    const hspeed = Math.sqrt(vx * vx + vz * vz);
    const maxHSpeed = this.forwardSpeed * 2.5;
    if (hspeed > maxHSpeed) {
      this.ballBody.velocity.x = (vx / hspeed) * maxHSpeed;
      this.ballBody.velocity.z = (vz / hspeed) * maxHSpeed;
    }

    this.world.step(1 / 60, dt, 3);

    this.ballMesh.position.copy(this.ballBody.position as unknown as THREE.Vector3);
    this.ballMesh.quaternion.copy(
      this.ballBody.quaternion as unknown as THREE.Quaternion
    );

    this.distance += this.forwardSpeed * dt;
    this.onDistanceUpdate(Math.floor(this.distance));

    if (ballPos.y < -5) {
      this.die();
    }

    const lastSeg = this.segments[this.segments.length - 1];
    const ahead =
      Math.sqrt(
        Math.pow(lastSeg.centerX - ballPos.x, 2) +
          Math.pow(lastSeg.centerZ - ballPos.z, 2)
      );
    if (ahead < SEGMENT_LENGTH * SEGMENTS_AHEAD * 0.6) {
      this.addNextSegment();
    }

    this.removeOldSegments();
  }

  private getCurrentPathYaw(): number {
    const bx = this.ballBody.position.x;
    const bz = this.ballBody.position.z;

    let closestSeg: SegmentWithBody | null = null;
    let minDist = Infinity;
    for (const seg of this.segments) {
      const dx = seg.centerX - bx;
      const dz = seg.centerZ - bz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < minDist) {
        minDist = d;
        closestSeg = seg;
      }
    }
    return closestSeg ? closestSeg.yaw : 0;
  }

  private updateCamera() {
    const bx = this.ballBody.position.x;
    const by = this.ballBody.position.y;
    const bz = this.ballBody.position.z;
    const yaw = this.getCurrentPathYaw();
    const backX = -Math.sin(yaw) * 8;
    const backZ = -Math.cos(yaw) * 8;
    const targetPos = new THREE.Vector3(
      bx + backX,
      by + 4.5,
      bz + backZ
    );
    this.camera.position.lerp(targetPos, 0.12);
    this.camera.lookAt(bx + Math.sin(yaw) * 4, by, bz + Math.cos(yaw) * 4);
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
    this.segmentIndex = 0;
    this.distance = 0;
    this.forwardSpeed = 8;

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
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
