// The world: renderer, scene, the pier itself, and the small effects that
// make a shot feel like a shot — a viewmodel gun, a muzzle flash light, a
// tracer line and an explosion flash. Geometry is shared where it can be;
// materials are one per palette name, made once. The map's boxes become
// meshes and Box3 colliders in one pass.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';

// Sniff the GPU before creating the real renderer: a throwaway context
// tells us whether the rasterizer is software, so the real renderer can
// start with the right flags instead of discovering it the slow way.
function isSoftwareRenderer() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|software/i.test(name);
  } catch {
    return false;
  }
}

export function createWorld(canvas, options = {}) {
  const softwareRenderer = isSoftwareRenderer();
  // On a software rasterizer the fill rate is the whole budget: no
  // antialiasing, no shadows, half resolution. A staged screenshot
  // (fullRes) renders only twice, so it can afford full quality.
  const fullRes = options.fullRes === true;
  const basePixelRatio = softwareRenderer && !fullRes ? 0.5 : Math.min(window.devicePixelRatio, 2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !softwareRenderer, powerPreference: 'high-performance' });
  renderer.setPixelRatio(basePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !softwareRenderer;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 45, 110);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 300);
  camera.rotation.order = 'YXZ';

  // Dusk light: a cool hemisphere, one warm directional "last sun" that
  // casts the shadows, and amber glows over the two berths.
  scene.add(new THREE.HemisphereLight(0x8fa3bd, 0x2a2f36, 0.9));
  const sun = new THREE.DirectionalLight(0xffc07a, 1.6);
  sun.position.set(-20, 30, -25);
  sun.castShadow = !softwareRenderer;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.camera.far = 100;
  scene.add(sun);
  const glowA = new THREE.PointLight(0xffb02e, 12, 18, 1.6);
  glowA.position.set(21, 5, -14);
  scene.add(glowA);
  const glowB = new THREE.PointLight(0xffb02e, 12, 18, 1.6);
  glowB.position.set(21, 5, 14);
  scene.add(glowB);
  const flashLight = new THREE.PointLight(0xffc36b, 0, 12, 1.8);
  scene.add(flashLight);
  const boomLight = new THREE.PointLight(0xff7722, 0, 26, 1.5);
  scene.add(boomLight);

  const materials = {};
  for (const [name, hex] of Object.entries(PALETTE)) {
    if (name === 'sky' || name === 'fog' || name === 'ink' || name === 'muted' || name === 'accent') continue;
    materials[name] = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.9, metalness: 0.05 });
  }
  materials.rust.metalness = 0.25;
  materials.teal.metalness = 0.25;
  materials.signalBlue.metalness = 0.25;
  materials.steel.metalness = 0.6;
  materials.steelDark.metalness = 0.6;

  const colliders = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (const [w, h, d, x, y, z, mat] of MAP.boxes) {
    const mesh = new THREE.Mesh(boxGeometry, materials[mat]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = h > 1;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
    ));
  }
  for (const [w, h, d, x, y, z] of MAP.collidersOnly) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
    ));
  }

  // Berth rings: flat amber circles on the concrete, with a canvas sign
  // above each one.
  const ringGeo = new THREE.RingGeometry(3.9, 4.5, 40);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
  for (const key of ['A', 'B']) {
    const site = MAP.sites[key];
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center[0], 0.03, site.center[1]);
    scene.add(ring);
    const sign = makeSign(`BERTH ${key}`);
    sign.position.set(site.center[0], 4.2, site.center[1]);
    scene.add(sign);
  }

  // The gantry beam over berth A (the legs are map boxes) and the silo
  // cylinder over berth B (its collider is in collidersOnly).
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 0.6), materials.steelDark);
  beam.position.set(21, 5.3, -18);
  beam.castShadow = true;
  scene.add(beam);
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 5, 20), materials.steel);
  silo.position.set(25.5, 2.5, 18);
  silo.castShadow = true;
  silo.receiveShadow = true;
  scene.add(silo);
  const siloCap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.8, 20), materials.rust);
  siloCap.position.set(25.5, 5.4, 18);
  scene.add(siloCap);

  // Lamp posts along the quays: emissive heads, no extra lights.
  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8);
  const headGeo = new THREE.BoxGeometry(0.5, 0.15, 0.25);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb02e, emissiveIntensity: 2 });
  for (const [x, z] of [[-24, -19], [-8, -19], [8, -19], [-24, 19], [-8, 19], [8, 19], [-27, 0], [27, -10], [27, 10]]) {
    const post = new THREE.Mesh(postGeo, materials.steelDark);
    post.position.set(x, 2.1, z);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x, 4.25, z);
    scene.add(post, head);
  }

  // The player's gun, held in view. It sits far enough out that the near
  // end does not balloon in perspective, and angled slightly inward like
  // a real low-ready hold.
  const viewmodel = new THREE.Group();
  const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x4d5a66, roughness: 0.4, metalness: 0.6 }));
  const vmBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.35), new THREE.MeshStandardMaterial({ color: 0x333d46, roughness: 0.35, metalness: 0.7 }));
  vmBarrel.position.set(0, 0.02, -0.4);
  const vmSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.02), new THREE.MeshStandardMaterial({ color: 0xffb02e, emissive: 0xffb02e, emissiveIntensity: 1.5 }));
  vmSight.position.set(0, 0.1, -0.15);
  viewmodel.add(vmBody, vmBarrel, vmSight);
  viewmodel.position.set(0.24, -0.22, -0.7);
  viewmodel.scale.setScalar(0.85);
  viewmodel.rotation.y = -0.06;
  camera.add(viewmodel);
  scene.add(camera);

  // One tracer line, reused: a shot is a brief bright segment.
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0 }));
  tracer.frustumCulled = false;
  scene.add(tracer);
  let tracerLeft = 0;

  let boomLeft = 0;

  function makeSign(text) {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = 256;
    canvasEl.height = 96;
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = '#232a31';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = '#ffb02e';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 88);
    ctx.fillStyle = '#ffb02e';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 50);
    const texture = new THREE.CanvasTexture(canvasEl);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 1.1),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    return sign;
  }

  function setTracer(from, to) {
    const pos = tracer.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    tracer.material.opacity = 0.9;
    tracerLeft = 0.06;
  }

  function flashMuzzle(position) {
    flashLight.position.copy(position);
    flashLight.intensity = 18;
  }

  function flashExplosion(position) {
    boomLight.position.copy(position);
    boomLight.position.y += 1;
    boomLight.intensity = 120;
    boomLeft = 0.35;
  }

  function stepFx(dt) {
    if (tracerLeft > 0) {
      tracerLeft -= dt;
      if (tracerLeft <= 0) tracer.material.opacity = 0;
    }
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 400);
    if (boomLeft > 0) {
      boomLeft -= dt;
      boomLight.intensity = Math.max(0, boomLight.intensity - dt * 350);
    }
    viewmodel.position.z = -0.7;
  }

  function setViewmodelKick(kick) {
    viewmodel.position.z = -0.7 + kick * 1.4;
    viewmodel.rotation.x = kick * 2.2;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function adaptQuality(level) {
    // Each rung only ever lowers quality from where the renderer started:
    // a software renderer already starts at half resolution with no
    // shadows, so the ladder is a no-op there.
    if (level >= 1 && basePixelRatio > 1) {
      renderer.setPixelRatio(1);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    if (level >= 2) {
      renderer.shadowMap.enabled = false;
      sun.castShadow = false;
    }
    if (level >= 3 && basePixelRatio > 0.5) {
      renderer.setPixelRatio(0.5);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  return {
    renderer,
    scene,
    camera,
    colliders,
    sun,
    viewmodel,
    setTracer,
    flashMuzzle,
    flashExplosion,
    stepFx,
    setViewmodelKick,
    resize,
    adaptQuality,
  };
}
