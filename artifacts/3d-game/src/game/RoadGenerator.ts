import * as THREE from "three";
import * as CANNON from "cannon-es";

export const ROAD_WIDTH = 3.5;
export const PIECE_Z_LEN = 7;
export const GAP_Z_LEN = 5;
export const SEGMENTS_AHEAD = 35;
export const SEGMENTS_BEHIND = 5;

// Curvature threshold: absolute xDrift above this is considered "curved"
const CURVE_DRIFT_THRESHOLD = 0.1;
// Gap safety buffer: do not spawn collectibles within this many Z-units before a gap
const GAP_SAFETY_BUFFER = PIECE_Z_LEN * 3;

// --------------- Road Curvature Map ---------------
interface SegmentRecord {
  zStart: number;
  zEnd: number;
  xStart: number;
  xEnd: number;
  drift: number;   // absolute xDrift value at spawn time
  isGap: boolean;
}

/**
 * Rolling window of spawned road segment metadata.
 * Game.ts registers each segment; EnvironmentManager queries it.
 */
export class RoadCurvatureMap {
  private segments: SegmentRecord[] = [];

  record(zStart: number, zEnd: number, xStart: number, xEnd: number, drift: number, isGap: boolean) {
    this.segments.push({ zStart, zEnd, xStart, xEnd, drift, isGap });
  }

  /**
   * Returns true if targetZ is:
   *  – on a curved segment (|drift| > threshold)
   *  – not a gap segment itself
   *  – not within GAP_SAFETY_BUFFER ahead of any upcoming gap
   */
  isSafeAndCurved(targetZ: number): boolean {
    let targetDrift = 0;
    let onGap = false;
    let nearUpcomingGap = false;

    for (const seg of this.segments) {
      if (targetZ >= seg.zStart && targetZ < seg.zEnd) {
        targetDrift = seg.drift;
        onGap = seg.isGap;
      }
      // Any gap that starts within the safety buffer ahead of targetZ
      if (seg.isGap && seg.zStart > targetZ && seg.zStart < targetZ + GAP_SAFETY_BUFFER) {
        nearUpcomingGap = true;
      }
    }

    return !onGap && !nearUpcomingGap && targetDrift > CURVE_DRIFT_THRESHOLD;
  }

  /**
   * Returns the linearly interpolated X center coordinate of the road at `targetZ`.
   * Returns null if targetZ is out of bounds or on a gap.
   */
  getRoadCenterAtZ(targetZ: number): number | null {
    for (const seg of this.segments) {
      if (targetZ >= seg.zStart && targetZ < seg.zEnd) {
        if (seg.isGap) return null;
        
        // Linear interpolation: how far along this segment is targetZ?
        const t = (targetZ - seg.zStart) / (seg.zEnd - seg.zStart);
        return seg.xStart + (seg.xEnd - seg.xStart) * t;
      }
    }
    return null;
  }

  /** Prune records whose zEnd has fallen behind the current ballZ */
  prune(behindZ: number) {
    while (this.segments.length > 0 && this.segments[0].zEnd < behindZ) {
      this.segments.shift();
    }
  }

  reset() {
    this.segments = [];
  }
}

// --- Randomized gap scheduler ---
const MIN_GAP_PIECES = 5;
const MAX_GAP_PIECES = 15;

export interface GapScheduler {
  shouldGap(pieceCount: number, distance: number): boolean;
  reset(): void;
}

export function createGapScheduler(): GapScheduler {
  let piecesSinceLastGap = 0;
  let nextGapIn = MIN_GAP_PIECES + Math.floor(Math.random() * (MAX_GAP_PIECES - MIN_GAP_PIECES + 1));

  return {
    shouldGap(pieceCount: number, distance: number): boolean {
      const scaledMax = Math.max(MIN_GAP_PIECES, MAX_GAP_PIECES - Math.floor(distance / 250));
      piecesSinceLastGap++;
      if (pieceCount <= 3) return false;
      if (piecesSinceLastGap >= nextGapIn) {
        piecesSinceLastGap = 0;
        nextGapIn = MIN_GAP_PIECES + Math.floor(Math.random() * (scaledMax - MIN_GAP_PIECES + 1));
        return true;
      }
      return false;
    },
    reset() {
      piecesSinceLastGap = 0;
      nextGapIn = MIN_GAP_PIECES + Math.floor(Math.random() * (MAX_GAP_PIECES - MIN_GAP_PIECES + 1));
    },
  };
}

export interface RoadPiece {
  mesh: THREE.Mesh | null;
  physicsBody: CANNON.Body | null;
  xStart: number;
  xEnd: number;
  zStart: number;
  zEnd: number;
  isGap: boolean;
}

const ROAD_THICKNESS = 0.3;
export const roadMat = new THREE.MeshStandardMaterial({
  color: 0xdd1111,
  emissive: 0xcc0000,
  emissiveIntensity: 0.7,
  roughness: 0.6,
  metalness: 0.3,
});

function pushQuad(
  positions: number[],
  normals: number[],
  indices: number[],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
  v3: [number, number, number],
  n: [number, number, number]
) {
  const base = positions.length / 3;
  for (const v of [v0, v1, v2, v3]) {
    positions.push(...v);
    normals.push(...n);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function createRoadPiece(
  scene: THREE.Scene,
  world: CANNON.World,
  xStart: number,
  xEnd: number,
  zStart: number,
  isGap: boolean
): RoadPiece {
  const zLen = isGap ? GAP_Z_LEN : PIECE_Z_LEN;
  const zEnd = zStart + zLen;

  if (isGap) {
    return { mesh: null, physicsBody: null, xStart, xEnd, zStart, zEnd, isGap: true };
  }

  const hw = ROAD_WIDTH / 2;
  const t = ROAD_THICKNESS;

  const TL0: [number, number, number] = [xStart - hw, 0, zStart];
  const TR0: [number, number, number] = [xStart + hw, 0, zStart];
  const TL1: [number, number, number] = [xEnd - hw, 0, zEnd];
  const TR1: [number, number, number] = [xEnd + hw, 0, zEnd];
  const BL0: [number, number, number] = [xStart - hw, -t, zStart];
  const BR0: [number, number, number] = [xStart + hw, -t, zStart];
  const BL1: [number, number, number] = [xEnd - hw, -t, zEnd];
  const BR1: [number, number, number] = [xEnd + hw, -t, zEnd];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  pushQuad(positions, normals, indices, TL0, TR0, TR1, TL1, [0, 1, 0]);
  pushQuad(positions, normals, indices, BL1, TL1, TL0, BL0, [-1, 0, 0]);
  pushQuad(positions, normals, indices, TR0, BR0, BR1, TR1, [1, 0, 0]);
  pushQuad(positions, normals, indices, BL0, TL0, TR0, BR0, [0, 0, -1]);
  pushQuad(positions, normals, indices, TR1, TL1, BL1, BR1, [0, 0, 1]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(geometry, roadMat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  const cx = (xStart + xEnd) / 2;
  const cz = (zStart + zEnd) / 2;
  const dx = xEnd - xStart;
  const rotY = Math.atan2(dx, PIECE_Z_LEN);
  const len = Math.sqrt(dx * dx + PIECE_Z_LEN * PIECE_Z_LEN);

  const shape = new CANNON.Box(new CANNON.Vec3(ROAD_WIDTH / 2, 0.15, len / 2));
  const physicsBody = new CANNON.Body({ mass: 0, shape });
  physicsBody.position.set(cx, -0.15, cz);
  physicsBody.quaternion.setFromEuler(0, -rotY, 0);
  world.addBody(physicsBody);

  return { mesh, physicsBody, xStart, xEnd, zStart, zEnd, isGap: false };
}
