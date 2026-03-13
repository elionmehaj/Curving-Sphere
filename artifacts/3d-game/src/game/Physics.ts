import * as CANNON from "cannon-es";

export function createWorld(): CANNON.World {
  const world = new CANNON.World();
  world.gravity.set(0, -20, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  (world.solver as CANNON.GSSolver).iterations = 10;
  return world;
}

export function createBallBody(world: CANNON.World): CANNON.Body {
  const radius = 0.5;
  const shape = new CANNON.Sphere(radius);
  const body = new CANNON.Body({
    mass: 1,
    shape,
    linearDamping: 0.1,
    angularDamping: 0.4,
  });
  body.position.set(0, 2, 0);
  world.addBody(body);
  return body;
}

export function createGroundBody(
  world: CANNON.World,
  x: number,
  y: number,
  z: number,
  rotY: number,
  width: number,
  length: number
): CANNON.Body {
  const halfExtents = new CANNON.Vec3(width / 2, 0.15, length / 2);
  const shape = new CANNON.Box(halfExtents);
  const body = new CANNON.Body({ mass: 0, shape });
  body.position.set(x, y, z);
  body.quaternion.setFromEuler(0, rotY, 0);
  world.addBody(body);
  return body;
}
