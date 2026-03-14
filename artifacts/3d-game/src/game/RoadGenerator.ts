import * as THREE from "three";
import * as CANNON from "cannon-es";

export const ROAD_WIDTH = 3.5;
export const PIECE_Z_LEN = 7;
export const GAP_Z_LEN = 5;
export const SEGMENTS_AHEAD = 35;
export const SEGMENTS_BEHIND = 5;
export const GAP_EVERY = 9;

export interface RoadPiece {
  mesh: THREE.Mesh | null;
  glowMesh: THREE.Mesh | null;
  physicsBody: CANNON.Body | null;
  xStart: number;
  xEnd: number;
  zStart: number;
  zEnd: number;
  isGap: boolean;
}

const ROAD_THICKNESS = 0.3;
const GLOW_HW = 0.38;

export const roadMat = new THREE.MeshStandardMaterial({
  color: 0xdd1111,
  emissive: 0xcc0000,
  emissiveIntensity: 0.7,
  roughness: 0.6,
  metalness: 0.3,
});

export const glowMat = new THREE.MeshStandardMaterial({
  color: 0xff44cc,
  emissive: 0xff00bb,
  emissiveIntensity: 2.2,
  transparent: true,
  opacity: 0.92,
  roughness: 0.1,
  metalness: 0.0,
  depthWrite: false,
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
    return { mesh: null, glowMesh: null, physicsBody: null, xStart, xEnd, zStart, zEnd, isGap: true };
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

  // Central magenta glow strip
  const yGlow = 0.009;
  const GL0: [number, number, number] = [xStart - GLOW_HW, yGlow, zStart];
  const GR0: [number, number, number] = [xStart + GLOW_HW, yGlow, zStart];
  const GL1: [number, number, number] = [xEnd - GLOW_HW, yGlow, zEnd];
  const GR1: [number, number, number] = [xEnd + GLOW_HW, yGlow, zEnd];

  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([...GL0, ...GR0, ...GR1, ...GL1]),
      3
    )
  );
  glowGeo.setIndex([0, 1, 2, 0, 2, 3]);
  glowGeo.computeVertexNormals();

  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  scene.add(glowMesh);

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

  return { mesh, glowMesh, physicsBody, xStart, xEnd, zStart, zEnd, isGap: false };
}
