// Player control: keyboard into acceleration-based movement. The wish
// direction comes from the keys and the yaw; velocity blends toward it,
// faster on the ground than in the air, and friction bleeds speed when no
// key is held — so stopping takes a beat and a moving player is a louder,
// less accurate target. Crouch halves speed and the eye height; jump is one
// impulse while grounded. Collision is physics.move, shared with the bots.
import * as THREE from 'three';
import { CROUCH_HEIGHT, STAND_HEIGHT, CROUCH_EYE, STAND_EYE, ACTOR_RADIUS } from './actors.js';

const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

const wish = new THREE.Vector3();

export function createPlayerControl(actor, physics) {
  function look(dx, dy, sensitivity = 0.0022) {
    actor.yaw -= dx * sensitivity;
    actor.pitch = Math.max(-1.45, Math.min(1.45, actor.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    actor.pitch = Math.min(1.45, actor.pitch + pitchKick);
    actor.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !actor.crouching) {
      actor.crouching = true;
      actor.height = CROUCH_HEIGHT;
    } else if (!crouching && actor.crouching
      && !physics.overlaps(actor.position.x, actor.position.y, actor.position.z, ACTOR_RADIUS, STAND_HEIGHT, 0.02)) {
      actor.crouching = false;
      actor.height = STAND_HEIGHT;
    }
    const eyeTarget = actor.crouching ? CROUCH_EYE : STAND_EYE;
    actor.eye += (eyeTarget - actor.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(actor.yaw);
      const cos = Math.cos(actor.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = actor.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (actor.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    actor.velocity.x += (wish.x * speed - actor.velocity.x) * blend;
    actor.velocity.z += (wish.z * speed - actor.velocity.z) * blend;
    if (actor.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      actor.velocity.x *= damp;
      actor.velocity.z *= damp;
    }

    if (keys.has('Space') && actor.onGround) {
      actor.velocity.y = JUMP_SPEED;
      actor.onGround = false;
    }
    actor.velocity.y -= GRAVITY * dt;
    actor.velocity.y = Math.max(-30, actor.velocity.y);
    actor.onGround = physics.move(actor.position, actor.velocity, dt, ACTOR_RADIUS, actor.height);
  }

  function groundSpeed() {
    return Math.hypot(actor.velocity.x, actor.velocity.z);
  }

  return { step, look, recoil, groundSpeed };
}
