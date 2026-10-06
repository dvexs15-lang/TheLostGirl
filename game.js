(() => {
  'use strict';

  if (!window.THREE) {
    document.body.innerHTML = '<div style="padding:24px;color:white;font-family:sans-serif">Не удалось загрузить Three.js. Проверь подключение к интернету.</div>';
    return;
  }

  const THREE = window.THREE;
  const gameRoot = document.getElementById('game');
  const hud = document.getElementById('hud');
  const startScreen = document.getElementById('startScreen');
  const pauseScreen = document.getElementById('pauseScreen');
  const defeatScreen = document.getElementById('defeatScreen');
  const winScreen = document.getElementById('winScreen');
  const runWarning = document.getElementById('runWarning');
  const interactionEl = document.getElementById('interaction');
  const staminaFill = document.getElementById('staminaFill');
  const batteryFill = document.getElementById('batteryFill');
  const batteryText = document.getElementById('batteryText');
  const runeCount = document.getElementById('runeCount');
  const keyCounter = document.getElementById('keyCounter');
  const keyIdEl = document.getElementById('keyId');
  const visionOverlay = document.getElementById('visionOverlay');
  const visionTimer = document.getElementById('visionTimer');
  const toastEl = document.getElementById('toast');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  gameRoot.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020304);
  scene.fog = new THREE.FogExp2(0x050607, 0.047);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 80);
  camera.rotation.order = 'YXZ';

  const monsterCamera = new THREE.PerspectiveCamera(80, camera.aspect, 0.05, 80);
  monsterCamera.rotation.order = 'YXZ';
  scene.add(monsterCamera);

  const ambient = new THREE.HemisphereLight(0x53606a, 0x050505, 0.22);
  scene.add(ambient);

  const state = {
    started: false,
    paused: true,
    gameOver: false,
    won: false,
    monsterVision: false,
    visionRemaining: 0,
    runes: 0,
    keyId: null,
    battery: 70,
    flashlightOn: true,
    stamina: 100,
    recoveryDelay: 0,
    yaw: Math.PI,
    pitch: 0,
    toastTimer: 0,
    currentInteractable: null
  };

  const keys = new Set();
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const losRaycaster = new THREE.Raycaster();
  const UP = new THREE.Vector3(0, 1, 0);

  const player = {
    pos: new THREE.Vector3(0, 1.65, 10.5),
    radius: 0.34,
    walkSpeed: 3.05,
    runSpeed: 5.15,
    stepTimer: 0
  };

  const wallBoxes = [];
  const worldRayTargets = [];
  const interactables = [];
  const doors = [];
  const pickups = [];

  const matWall = new THREE.MeshStandardMaterial({ color: 0x232729, roughness: 0.98, metalness: 0.01 });
  const matWallAlt = new THREE.MeshStandardMaterial({ color: 0x191c1e, roughness: 1 });
  const matFloor = new THREE.MeshStandardMaterial({ color: 0x141617, roughness: 0.96 });
  const matCeiling = new THREE.MeshStandardMaterial({ color: 0x101213, roughness: 1, side: THREE.DoubleSide });
  const matDoor = new THREE.MeshStandardMaterial({ color: 0x3a2720, roughness: 0.86 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x53595b, roughness: 0.55, metalness: 0.7 });
  const matRune = new THREE.MeshStandardMaterial({ color: 0x8d73ff, emissive: 0x261758, emissiveIntensity: 1.4, roughness: 0.35 });
  const matBattery = new THREE.MeshStandardMaterial({ color: 0xcbbd55, emissive: 0x2a2605, emissiveIntensity: 0.35, roughness: 0.6 });
  const matKey = new THREE.MeshStandardMaterial({ color: 0xb9bdc0, metalness: 0.75, roughness: 0.35 });

  function addBox(x, y, z, sx, sy, sz, material, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function addWall(x, z, sx, sz, alt = false) {
    const h = 3.2;
    const mesh = addBox(x, h / 2, z, sx, h, sz, alt ? matWallAlt : matWall);
    const box = { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, mesh };
    wallBoxes.push(box);
    worldRayTargets.push(mesh);
    return mesh;
  }

  // Floor + ceiling
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), matCeiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3.2;
  scene.add(ceiling);

  // Outer shell
  addWall(0, -14, 28, 0.45);
  addWall(0, 14, 28, 0.45);
  addWall(-14, 0, 0.45, 28);
  addWall(14, 0, 0.45, 28);

  // Internal walls. Gaps are doorways.
  addWall(-8.5, 4, 11, 0.38, true);
  addWall(2.5, 4, 7, 0.38, true);
  addWall(11, 4, 6, 0.38, true);

  addWall(-10, -4, 8, 0.38);
  addWall(-0.5, -4, 7, 0.38);
  addWall(9.5, -4, 9, 0.38);

  // Vertical partitions. Each pair leaves a 2-unit doorway gap.
  addWall(-6, 6.5, 0.38, 5);
  addWall(-6, 12.5, 0.38, 3);
  addWall(-6, -2.5, 0.38, 3);
  addWall(-6, 2.5, 0.38, 3);
  addWall(-6, -11.5, 0.38, 5);
  addWall(-6, -5.5, 0.38, 3);

  addWall(6, 6.5, 0.38, 5, true);
  addWall(6, 12.5, 0.38, 3, true);
  addWall(6, -2.5, 0.38, 3, true);
  addWall(6, 2.5, 0.38, 3, true);
  addWall(6, -11.5, 0.38, 5, true);
  addWall(6, -5.5, 0.38, 3, true);

  // Decorative furniture as blockers.
  function addFurniture(x, z, sx, sz, h = 0.8) {
    const mesh = addBox(x, h / 2, z, sx, h, sz, new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.9 }));
    wallBoxes.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, mesh });
    worldRayTargets.push(mesh);
  }
  addFurniture(-10.5, 9.5, 2.8, 1.1, 0.72);
  addFurniture(10.4, 9.8, 1.1, 2.4, 0.9);
  addFurniture(-9.8, -0.2, 2.2, 1.0, 0.82);
  addFurniture(1.0, -9.8, 3.0, 1.15, 0.75);
  addFurniture(10.6, -10.4, 1.0, 2.7, 0.88);

  // Sparse mansion lighting.
  function addLamp(x, z, color = 0xcab489, intensity = 3.0, distance = 6.0) {
    const bulb = new THREE.PointLight(color, intensity, distance, 2.0);
    bulb.position.set(x, 2.45, z);
    bulb.castShadow = true;
    bulb.shadow.mapSize.set(256, 256);
    scene.add(bulb);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(bulb.position);
    scene.add(mesh);
  }
  addLamp(-10, 8, 0x8e7b5d, 1.4, 4.5);
  addLamp(9, 1, 0x7b826f, 1.0, 4.0);
  addLamp(-1, -9, 0x8b7562, 1.25, 4.5);

  // Player flashlight
  const flashlight = new THREE.SpotLight(0xf2f0de, 18, 13, Math.PI / 6.3, 0.45, 1.35);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(512, 512);
  const flashlightTarget = new THREE.Object3D();
  scene.add(flashlight, flashlightTarget);
  flashlight.target = flashlightTarget;

  // Doors
  function createDoor({ x, z, axis = 'x', id = '', locked = false, open = false, label = '' }) {
    const width = 2.0, height = 2.72, thick = 0.16;
    const group = new THREE.Group();
    // x/z describe the center of the doorway. The group itself sits on one hinge.
    if (axis === 'x') group.position.set(x - width / 2, 0, z);
    else group.position.set(x, 0, z - width / 2);
    scene.add(group);

    const leafGeo = axis === 'x'
      ? new THREE.BoxGeometry(width, height, thick)
      : new THREE.BoxGeometry(thick, height, width);
    const leaf = new THREE.Mesh(leafGeo, matDoor.clone());
    leaf.position.y = height / 2;
    if (axis === 'x') leaf.position.x = width / 2;
    else leaf.position.z = width / 2;
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);

    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), matMetal);
    knob.position.y = 1.15;
    if (axis === 'x') knob.position.set(width * 0.82, 1.15, thick * 0.8);
    else knob.position.set(thick * 0.8, 1.15, width * 0.82);
    group.add(knob);

    const door = {
      type: 'door', x, z, axis, id, locked, isOpen: open, targetOpen: open, amount: open ? 1 : 0,
      group, leaf, width, label: label || (locked ? `Дверь ${id}` : 'Дверь')
    };
    group.rotation.y = open ? (axis === 'x' ? -Math.PI / 2 : Math.PI / 2) : 0;
    leaf.userData.interactable = door;
    knob.userData.interactable = door;
    worldRayTargets.push(leaf, knob);
    doors.push(door);
    interactables.push(door);
    return door;
  }

  // axis='x' = leaf spans X (doorway in a horizontal wall); axis='z' = leaf spans Z.
  createDoor({ x: -2, z: 4, axis: 'x', id: 'A1', locked: true, label: 'Дверь A1' });
  createDoor({ x: 7, z: 4, axis: 'x', locked: false });
  createDoor({ x: -5, z: -4, axis: 'x', locked: false });
  createDoor({ x: 4, z: -4, axis: 'x', id: 'B1', locked: true, label: 'Дверь B1' });
  createDoor({ x: -6, z: 10, axis: 'z', locked: false });
  createDoor({ x: -6, z: 0, axis: 'z', locked: false });
  createDoor({ x: -6, z: -8, axis: 'z', locked: false });
  createDoor({ x: 6, z: 10, axis: 'z', locked: false });
  createDoor({ x: 6, z: 0, axis: 'z', locked: false });
  createDoor({ x: 6, z: -8, axis: 'z', locked: false });

  // Pickups
  function registerPickup(obj, mesh) {
    mesh.userData.interactable = obj;
    worldRayTargets.push(mesh);
    pickups.push(obj);
    interactables.push(obj);
    return obj;
  }

  function createRune(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0.48, z);
    scene.add(group);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.045, 8, 22), matRune);
    torus.rotation.x = Math.PI / 2;
    group.add(torus);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), matRune);
    group.add(diamond);
    const obj = { type: 'rune', group, mesh: diamond, alive: true, baseY: group.position.y, phase: Math.random() * 10 };
    torus.userData.interactable = obj;
    diamond.userData.interactable = obj;
    worldRayTargets.push(torus, diamond);
    pickups.push(obj); interactables.push(obj);
  }

  function createBattery(x, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 12), matBattery);
    mesh.position.set(x, 0.24, z);
    mesh.rotation.z = Math.PI / 2;
    mesh.castShadow = true;
    scene.add(mesh);
    registerPickup({ type: 'battery', mesh, alive: true }, mesh);
  }

  function createKey(x, z, id) {
    const group = new THREE.Group();
    group.position.set(x, 0.35, z);
    scene.add(group);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 16), matKey);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.055), matKey);
    shaft.position.x = 0.23;
    group.add(shaft);
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 0.055), matKey);
    tooth.position.set(0.37, -0.05, 0);
    group.add(tooth);
    const obj = { type: 'key', id, group, mesh: shaft, alive: true, phase: Math.random() * 10 };
    [ring, shaft, tooth].forEach(m => { m.userData.interactable = obj; worldRayTargets.push(m); });
    pickups.push(obj); interactables.push(obj);
  }

  createKey(3.8, 9.4, 'A1');
  createRune(2.0, 11.7);
  createBattery(-3.9, 9.8);
  createRune(-10.8, 7.0);
  createBattery(10.4, 6.8);
  createKey(-1.5, 0.4, 'B1');
  createRune(-10.7, -1.8);
  createBattery(9.8, -1.4);
  createRune(-9.2, -10.5);
  createBattery(3.7, -10.8);

  // Exit trigger and visual door at north-east.
  const exitGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 2.5),
    new THREE.MeshBasicMaterial({ color: 0x4a7052, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
  );
  exitGlow.position.set(10.5, 1.3, -13.72);
  scene.add(exitGlow);
  const exitTrigger = { minX: 9.4, maxX: 11.6, minZ: -13.8, maxZ: -12.7 };

  // Monster body.
  const monster = {
    root: new THREE.Group(),
    pos: new THREE.Vector3(9.5, 0, 0),
    yaw: Math.PI,
    state: 'patrol',
    sees: false,
    wasPursuing: false,
    lastSeen: new THREE.Vector3(),
    lastSeenAt: -999,
    warningUntil: -999,
    path: [],
    pathIndex: 0,
    nextPathAt: 0,
    patrolTarget: null,
    idleUntil: 0,
    searchUntil: 0,
    speed: 1.65
  };
  scene.add(monster.root);
  const monsterMat = new THREE.MeshStandardMaterial({ color: 0x080909, roughness: 1 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.35, 0.44), monsterMat);
  torso.position.y = 1.25; torso.castShadow = true; monster.root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), monsterMat);
  head.position.y = 2.08; head.castShadow = true; monster.root.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3434 });
  for (const ex of [-0.12, 0.12]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    e.position.set(ex, 2.11, -0.31); monster.root.add(e);
  }
  for (const ex of [-0.23, 0.23]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.2), monsterMat);
    leg.position.set(ex, 0.44, 0); leg.castShadow = true; monster.root.add(leg);
  }
  monster.root.position.copy(monster.pos);

  const monsterViewAnchor = new THREE.Object3D();
  monsterViewAnchor.position.set(0, 2.06, -0.12);
  monster.root.add(monsterViewAnchor);
  monsterViewAnchor.add(monsterCamera);
  monsterCamera.position.set(0, 0, 0);
  monsterCamera.rotation.set(0, 0, 0); // Camera looks along the monster's local -Z direction.

  // Audio engine: procedural sounds, no files required.
  let audioCtx = null;
  let ambientOsc = null;
  let ambientGain = null;

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      ambientOsc = audioCtx.createOscillator();
      ambientGain = audioCtx.createGain();
      ambientOsc.type = 'sine';
      ambientOsc.frequency.value = 43;
      ambientGain.gain.value = 0.018;
      ambientOsc.connect(ambientGain).connect(audioCtx.destination);
      ambientOsc.start();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function tone(freq = 120, duration = 0.08, volume = 0.05, type = 'sine', endFreq = null) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), audioCtx.currentTime + duration);
    g.gain.setValueAtTime(volume, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + duration);
  }

  function footstep() { tone(78 + Math.random() * 18, 0.055, 0.035, 'triangle', 42); }
  function doorSound(opening) { tone(opening ? 88 : 62, 0.16, 0.07, 'sawtooth', opening ? 54 : 35); }
  function unlockSound() { tone(420, 0.07, 0.045, 'square', 620); setTimeout(() => tone(620, 0.06, 0.035, 'square', 780), 55); }
  function pickupSound() { tone(560, 0.08, 0.035, 'sine', 920); }
  function emptySound() { tone(95, 0.18, 0.04, 'square', 70); }

  function monsterPhrase() {
    tone(62, 0.32, 0.08, 'sawtooth', 35);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const lines = ['Я тебя вижу.', 'Не убежишь.', 'Нашёл тебя.', 'Беги.'];
      const u = new SpeechSynthesisUtterance(lines[Math.floor(Math.random() * lines.length)]);
      u.lang = 'ru-RU'; u.rate = 0.72; u.pitch = 0.55; u.volume = 0.65;
      window.speechSynthesis.speak(u);
    }
  }

  function toast(text, seconds = 1.8) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    state.toastTimer = seconds;
  }

  // Door collider approximates the doorway while closed / mostly closed.
  function doorBlockingBox(door, radius = 0) {
    const half = door.width / 2;
    if (door.axis === 'x') {
      return { minX: door.x - half - radius, maxX: door.x + half + radius, minZ: door.z - 0.22 - radius, maxZ: door.z + 0.22 + radius };
    }
    return { minX: door.x - 0.22 - radius, maxX: door.x + 0.22 + radius, minZ: door.z - half - radius, maxZ: door.z + half + radius };
  }

  function circleHitsBox(x, z, r, box) {
    const cx = Math.max(box.minX, Math.min(x, box.maxX));
    const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - cx, dz = z - cz;
    return dx * dx + dz * dz < r * r;
  }

  function blockedAt(x, z, radius = player.radius, forMonster = false) {
    for (const b of wallBoxes) {
      if (circleHitsBox(x, z, radius, b)) return true;
    }
    for (const d of doors) {
      if (d.amount < 0.73 && circleHitsBox(x, z, radius, doorBlockingBox(d))) return true;
    }
    if (x < -13.55 || x > 13.55 || z < -13.55 || z > 13.55) return true;
    return false;
  }

  function movePlayer(dx, dz) {
    let nx = player.pos.x + dx;
    if (!blockedAt(nx, player.pos.z)) player.pos.x = nx;
    let nz = player.pos.z + dz;
    if (!blockedAt(player.pos.x, nz)) player.pos.z = nz;
  }

  function updateCamera() {
    camera.position.copy(player.pos);
    camera.rotation.set(state.pitch, state.yaw, 0);
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    flashlight.position.copy(camera.position);
    flashlight.position.addScaledVector(forward, 0.12);
    flashlightTarget.position.copy(camera.position).addScaledVector(forward, 8);
    flashlight.visible = state.flashlightOn && state.battery > 0 && !state.monsterVision;
  }

  function promptFor(obj) {
    if (!obj) return '';
    if (obj.type === 'rune') return 'ЛКМ — взять руну';
    if (obj.type === 'battery') return state.battery >= 99.9 ? 'Фонарик уже заряжен' : 'ЛКМ — взять батарейку';
    if (obj.type === 'key') return state.keyId ? `Уже несёшь ключ ${state.keyId}` : `ЛКМ — взять ключ ${obj.id}`;
    if (obj.type === 'door') {
      if (obj.locked) return state.keyId === obj.id ? `ЛКМ — использовать ключ ${obj.id}` : `Заперто — нужен ключ ${obj.id}`;
      return obj.targetOpen ? 'ЛКМ — закрыть дверь' : 'ЛКМ — открыть дверь';
    }
    return '';
  }

  function updateInteraction() {
    if (state.paused || state.gameOver || state.monsterVision) {
      state.currentInteractable = null;
      interactionEl.classList.remove('show');
      return;
    }
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = 2.6;
    const hits = raycaster.intersectObjects(worldRayTargets, false);
    let obj = null;
    if (hits.length) obj = hits[0].object.userData.interactable || null;
    if (obj && obj.alive === false) obj = null;
    state.currentInteractable = obj;
    const text = promptFor(obj);
    interactionEl.textContent = text;
    interactionEl.classList.toggle('show', !!text);
  }

  function removePickup(obj) {
    obj.alive = false;
    const root = obj.group || obj.mesh;
    if (root) {
      root.visible = false;
      if (root.traverse) root.traverse(child => { if (child.isMesh) child.layers.set(1); });
      else if (root.isMesh) root.layers.set(1);
    }
  }

  function interact() {
    const obj = state.currentInteractable;
    if (!obj || state.paused || state.gameOver || state.monsterVision) return;
    ensureAudio();

    if (obj.type === 'rune') {
      state.runes += 1; removePickup(obj); pickupSound(); toast('Руна +1');
    } else if (obj.type === 'battery') {
      if (state.battery >= 99.9) { toast('Заряд уже полный'); return; }
      state.battery = Math.min(100, state.battery + 36); removePickup(obj); pickupSound(); toast('Батарейка найдена');
    } else if (obj.type === 'key') {
      if (state.keyId) { toast(`Сначала используй ключ ${state.keyId}`); return; }
      state.keyId = obj.id; removePickup(obj); pickupSound(); toast(`Ключ ${obj.id}`);
    } else if (obj.type === 'door') {
      if (obj.locked) {
        if (state.keyId === obj.id) {
          state.keyId = null; obj.locked = false; obj.targetOpen = true; unlockSound();
          setTimeout(() => doorSound(true), 100); toast(`Ключ ${obj.id} использован`);
          monster.nextPathAt = 0;
        } else {
          tone(110, 0.08, 0.04, 'square', 80); toast(`Нужен ключ ${obj.id}`);
        }
      } else {
        obj.targetOpen = !obj.targetOpen;
        doorSound(obj.targetOpen);
        monster.nextPathAt = 0;
      }
    }
    updateUI();
  }

  function updateDoors(dt) {
    for (const d of doors) {
      const target = d.targetOpen ? 1 : 0;
      if (Math.abs(d.amount - target) < 0.001) { d.amount = target; continue; }
      d.amount += Math.sign(target - d.amount) * dt * 1.55;
      if ((target === 1 && d.amount > 1) || (target === 0 && d.amount < 0)) d.amount = target;
      const angle = (d.axis === 'x' ? -Math.PI / 2 : Math.PI / 2) * smoothstep(d.amount);
      d.group.rotation.y = angle;
    }
  }

  function smoothstep(t) { return t * t * (3 - 2 * t); }

  // Grid A* for monster navigation.
  const NAV_MIN = -13, NAV_MAX = 13, NAV_STEP = 1;
  const NAV_N = Math.floor((NAV_MAX - NAV_MIN) / NAV_STEP) + 1;
  function cellToWorld(cx, cz) { return { x: NAV_MIN + cx * NAV_STEP, z: NAV_MIN + cz * NAV_STEP }; }
  function worldToCell(x, z) {
    return {
      x: Math.max(0, Math.min(NAV_N - 1, Math.round((x - NAV_MIN) / NAV_STEP))),
      z: Math.max(0, Math.min(NAV_N - 1, Math.round((z - NAV_MIN) / NAV_STEP)))
    };
  }
  function navBlocked(cx, cz) {
    const p = cellToWorld(cx, cz);
    return blockedAt(p.x, p.z, 0.36, true);
  }
  function nearestWalkableCell(x, z) {
    const c = worldToCell(x, z);
    if (!navBlocked(c.x, c.z)) return c;
    for (let r = 1; r <= 4; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const nx = c.x + dx, nz = c.z + dz;
        if (nx >= 0 && nz >= 0 && nx < NAV_N && nz < NAV_N && !navBlocked(nx, nz)) return { x: nx, z: nz };
      }
    }
    return c;
  }
  function cellKey(c) { return c.x + ',' + c.z; }
  function heuristic(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.z - b.z); }

  function findPath(sx, sz, tx, tz) {
    const start = nearestWalkableCell(sx, sz);
    const goal = nearestWalkableCell(tx, tz);
    const open = [start];
    const came = new Map();
    const g = new Map([[cellKey(start), 0]]);
    const f = new Map([[cellKey(start), heuristic(start, goal)]]);
    const openSet = new Set([cellKey(start)]);
    let loops = 0;

    while (open.length && loops++ < 2500) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) {
        if ((f.get(cellKey(open[i])) ?? Infinity) < (f.get(cellKey(open[bestIndex])) ?? Infinity)) bestIndex = i;
      }
      const current = open.splice(bestIndex, 1)[0];
      openSet.delete(cellKey(current));
      if (current.x === goal.x && current.z === goal.z) {
        const path = [];
        let cur = current;
        while (cur) {
          const w = cellToWorld(cur.x, cur.z);
          path.push(new THREE.Vector3(w.x, 0, w.z));
          cur = came.get(cellKey(cur));
        }
        path.reverse();
        return simplifyPath(path);
      }
      const nbs = [
        { x: current.x + 1, z: current.z }, { x: current.x - 1, z: current.z },
        { x: current.x, z: current.z + 1 }, { x: current.x, z: current.z - 1 }
      ];
      for (const nb of nbs) {
        if (nb.x < 0 || nb.z < 0 || nb.x >= NAV_N || nb.z >= NAV_N || navBlocked(nb.x, nb.z)) continue;
        const nk = cellKey(nb), ck = cellKey(current);
        const tg = (g.get(ck) ?? Infinity) + 1;
        if (tg < (g.get(nk) ?? Infinity)) {
          came.set(nk, current); g.set(nk, tg); f.set(nk, tg + heuristic(nb, goal));
          if (!openSet.has(nk)) { open.push(nb); openSet.add(nk); }
        }
      }
    }
    return [];
  }

  function segmentClear(a, b, radius = 0.34) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 0.001) return true;
    d.normalize();
    for (let t = 0; t <= len; t += 0.35) {
      const x = a.x + d.x * t, z = a.z + d.z * t;
      if (blockedAt(x, z, radius, true)) return false;
    }
    return true;
  }

  function simplifyPath(path) {
    if (path.length <= 2) return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let next = i + 1;
      for (let j = path.length - 1; j > i + 1; j--) {
        if (segmentClear(path[i], path[j])) { next = j; break; }
      }
      out.push(path[next]); i = next;
    }
    return out;
  }

  function canMonsterSeePlayer() {
    const eye = new THREE.Vector3(monster.pos.x, 2.05, monster.pos.z);
    const target = new THREE.Vector3(player.pos.x, 1.55, player.pos.z);
    const to = target.clone().sub(eye);
    const dist = to.length();
    if (dist > 12.5) return false;
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, monster.yaw);
    const dir = to.clone().normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(forward.dot(new THREE.Vector3(dir.x, 0, dir.z).normalize()), -1, 1));
    if (angle > THREE.MathUtils.degToRad(46)) return false;
    losRaycaster.set(eye, dir); losRaycaster.far = dist;
    const blockers = wallBoxes.map(b => b.mesh).concat(doors.map(d => d.leaf));
    const hits = losRaycaster.intersectObjects(blockers, false);
    if (hits.length && hits[0].distance < dist - 0.2) return false;
    return true;
  }

  function pickPatrolTarget() {
    for (let i = 0; i < 40; i++) {
      const x = THREE.MathUtils.randFloat(-12.5, 12.5);
      const z = THREE.MathUtils.randFloat(-12.5, 12.5);
      if (!blockedAt(x, z, 0.4, true)) {
        const path = findPath(monster.pos.x, monster.pos.z, x, z);
        if (path.length > 1) {
          monster.patrolTarget = new THREE.Vector3(x, 0, z);
          monster.path = path; monster.pathIndex = 1;
          return;
        }
      }
    }
    monster.idleUntil = performance.now() / 1000 + 1.5;
  }

  function setMonsterPath(target) {
    monster.path = findPath(monster.pos.x, monster.pos.z, target.x, target.z);
    monster.pathIndex = monster.path.length > 1 ? 1 : 0;
  }

  function moveMonsterAlongPath(dt, speed) {
    if (!monster.path.length || monster.pathIndex >= monster.path.length) return false;
    const target = monster.path[monster.pathIndex];
    const delta = target.clone().sub(monster.pos); delta.y = 0;
    const dist = delta.length();
    if (dist < 0.14) {
      monster.pathIndex++;
      return monster.pathIndex < monster.path.length;
    }
    delta.normalize();
    const desiredYaw = Math.atan2(-delta.x, -delta.z);
    let diff = Math.atan2(Math.sin(desiredYaw - monster.yaw), Math.cos(desiredYaw - monster.yaw));
    const turnRate = monster.state === 'chase' ? 3.4 : 1.8;
    monster.yaw += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);
    const actualForward = new THREE.Vector3(-Math.sin(monster.yaw), 0, -Math.cos(monster.yaw));
    const step = Math.min(speed * dt, dist);
    const nx = monster.pos.x + actualForward.x * step;
    const nz = monster.pos.z + actualForward.z * step;
    if (!blockedAt(nx, nz, 0.33, true)) {
      monster.pos.x = nx; monster.pos.z = nz;
    } else {
      monster.nextPathAt = 0;
    }
    return true;
  }

  function updateMonster(dt, now) {
    if (state.gameOver) return;
    const sees = canMonsterSeePlayer();
    monster.sees = sees;

    if (sees) {
      if (!monster.wasPursuing) monsterPhrase();
      monster.wasPursuing = true;
      monster.state = 'chase';
      monster.lastSeen.copy(player.pos); monster.lastSeen.y = 0;
      monster.lastSeenAt = now;
      monster.warningUntil = now + 2;
      if (now >= monster.nextPathAt) {
        setMonsterPath(player.pos);
        monster.nextPathAt = now + 0.34;
      }
    } else if (monster.wasPursuing && now - monster.lastSeenAt <= 6.0) {
      monster.state = 'search';
      if (now >= monster.nextPathAt) {
        setMonsterPath(monster.lastSeen);
        monster.nextPathAt = now + 0.65;
      }
    } else {
      if (monster.wasPursuing) {
        monster.wasPursuing = false;
        monster.state = 'patrol';
        monster.path = [];
        monster.idleUntil = now + THREE.MathUtils.randFloat(0.8, 2.1);
      }
      if (monster.state !== 'patrol') monster.state = 'patrol';
    }

    if (monster.state === 'chase') {
      moveMonsterAlongPath(dt, 4.15);
    } else if (monster.state === 'search') {
      const moving = moveMonsterAlongPath(dt, 3.7);
      if (!moving && now - monster.lastSeenAt < 6.0) {
        // Slowly scan around at the last seen point.
        monster.yaw += dt * 0.72;
      }
    } else {
      if (now < monster.idleUntil) {
        monster.yaw += Math.sin(now * 1.7) * dt * 0.45;
      } else {
        if (!monster.path.length || monster.pathIndex >= monster.path.length) {
          monster.idleUntil = now + THREE.MathUtils.randFloat(0.9, 2.5);
          monster.path = [];
          pickPatrolTarget();
        }
        const moving = moveMonsterAlongPath(dt, 1.65);
        if (!moving && monster.path.length) {
          monster.path = [];
          monster.idleUntil = now + THREE.MathUtils.randFloat(0.8, 2.4);
        }
      }
    }

    monster.root.position.copy(monster.pos);
    monster.root.rotation.y = monster.yaw;

    const d2 = (monster.pos.x - player.pos.x) ** 2 + (monster.pos.z - player.pos.z) ** 2;
    if (d2 < 0.72 ** 2) defeat();

    runWarning.classList.toggle('show', sees || now < monster.warningUntil);
  }

  function updatePickups(now) {
    for (const p of pickups) {
      if (!p.alive) continue;
      const root = p.group || p.mesh;
      if (!root) continue;
      if (p.type === 'rune' || p.type === 'key') {
        root.rotation.y = now * 0.9 + (p.phase || 0);
        if (p.baseY != null) root.position.y = p.baseY + Math.sin(now * 2 + p.phase) * 0.04;
      }
    }
  }

  function updatePlayer(dt) {
    if (state.paused || state.gameOver || state.monsterVision) return;
    let ix = 0, iz = 0;
    if (keys.has('KeyW')) iz -= 1;
    if (keys.has('KeyS')) iz += 1;
    if (keys.has('KeyA')) ix -= 1;
    if (keys.has('KeyD')) ix += 1;
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }

    const wantsRun = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && len > 0;
    const running = wantsRun && state.stamina > 0.2;
    const speed = running ? player.runSpeed : player.walkSpeed;

    if (running) {
      state.stamina = Math.max(0, state.stamina - 23 * dt);
      state.recoveryDelay = 0.6;
    } else {
      state.recoveryDelay = Math.max(0, state.recoveryDelay - dt);
      if (state.recoveryDelay <= 0) state.stamina = Math.min(100, state.stamina + 16 * dt);
    }

    if (len > 0) {
      const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
      const dx = (ix * cos + iz * sin) * speed * dt;
      const dz = (-ix * sin + iz * cos) * speed * dt;
      movePlayer(dx, dz);
      player.stepTimer -= dt;
      if (player.stepTimer <= 0) {
        footstep();
        player.stepTimer = running ? 0.31 : 0.46;
      }
    } else {
      player.stepTimer = 0;
    }

    if (state.flashlightOn && state.battery > 0) {
      state.battery = Math.max(0, state.battery - 1.55 * dt);
      if (state.battery <= 0) { state.flashlightOn = false; emptySound(); toast('Батарея фонарика разряжена'); }
    }

    if (player.pos.x >= exitTrigger.minX && player.pos.x <= exitTrigger.maxX &&
        player.pos.z >= exitTrigger.minZ && player.pos.z <= exitTrigger.maxZ) {
      win();
    }
  }

  function updateMonsterVision(dt) {
    if (!state.monsterVision || state.paused || state.gameOver) return;
    state.visionRemaining -= dt;
    if (state.visionRemaining <= 0) endMonsterVision();
  }

  function startMonsterVision() {
    if (state.paused || state.gameOver || state.monsterVision) return;
    if (state.runes <= 0) { toast('Нужна руна'); tone(95, 0.12, 0.035, 'square', 70); return; }
    state.runes -= 1;
    state.monsterVision = true;
    state.visionRemaining = 5;
    visionOverlay.classList.remove('hidden');
    flashlight.visible = false;
    tone(250, 0.22, 0.04, 'sine', 90);
    updateUI();
  }

  function endMonsterVision() {
    if (!state.monsterVision) return;
    state.monsterVision = false;
    state.visionRemaining = 0;
    visionOverlay.classList.add('hidden');
    updateCamera();
  }

  function updateUI() {
    staminaFill.style.width = `${state.stamina}%`;
    batteryFill.style.width = `${state.battery}%`;
    batteryText.textContent = `${Math.ceil(state.battery)}%`;
    runeCount.textContent = state.runes;
    keyCounter.classList.toggle('hidden', !state.keyId);
    keyIdEl.textContent = state.keyId || '—';
    visionTimer.textContent = Math.max(0, state.visionRemaining).toFixed(1);
  }

  function activeCamera() { return state.monsterVision ? monsterCamera : camera; }

  function pause(show = true) {
    if (!state.started || state.gameOver) return;
    state.paused = show;
    if (show) {
      pauseScreen.classList.add('visible');
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      pauseScreen.classList.remove('visible');
      renderer.domElement.requestPointerLock?.();
      ensureAudio();
    }
  }

  function defeat() {
    if (state.gameOver) return;
    state.gameOver = true; state.paused = true;
    runWarning.classList.remove('show');
    defeatScreen.classList.add('visible');
    if (document.pointerLockElement) document.exitPointerLock();
    tone(46, 0.8, 0.12, 'sawtooth', 25);
  }

  function win() {
    if (state.gameOver) return;
    state.gameOver = true; state.won = true; state.paused = true;
    runWarning.classList.remove('show');
    winScreen.classList.add('visible');
    if (document.pointerLockElement) document.exitPointerLock();
    tone(330, 0.35, 0.05, 'sine', 660);
  }

  function restart() { location.reload(); }

  function startGame() {
    state.started = true; state.paused = false;
    startScreen.classList.remove('visible');
    hud.classList.remove('hidden');
    ensureAudio();
    renderer.domElement.requestPointerLock?.();
    toast('Найди ключ A1. Выход — в северо-восточной части особняка.', 3.3);
  }

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('continueBtn').addEventListener('click', () => pause(false));
  document.getElementById('restartBtn').addEventListener('click', restart);
  document.getElementById('restartWinBtn').addEventListener('click', restart);
  document.getElementById('restartPauseBtn').addEventListener('click', restart);

  document.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (!state.started) return;
    if (e.code === 'Escape') {
      if (state.monsterVision) { endMonsterVision(); return; }
      if (!state.gameOver) pause(!state.paused);
    }
    if (state.paused || state.gameOver) return;
    if (e.code === 'KeyF' && !state.monsterVision) {
      ensureAudio();
      if (state.battery <= 0) { emptySound(); toast('Фонарик разряжен'); }
      else { state.flashlightOn = !state.flashlightOn; tone(state.flashlightOn ? 360 : 180, 0.045, 0.025, 'square'); }
    }
    if (e.code === 'KeyE' && !state.monsterVision) startMonsterVision();
    if (e.code === 'KeyQ' && state.monsterVision) endMonsterVision();
  });
  document.addEventListener('keyup', e => keys.delete(e.code));

  document.addEventListener('mousemove', (e) => {
    if (!state.started || state.paused || state.gameOver || state.monsterVision) return;
    if (document.pointerLockElement !== renderer.domElement) return;
    state.yaw -= e.movementX * 0.00225;
    state.pitch -= e.movementY * 0.00225;
    state.pitch = THREE.MathUtils.clamp(state.pitch, -1.48, 1.48);
  });

  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && state.started && !state.paused && !state.gameOver && !state.monsterVision) interact();
  });

  document.addEventListener('pointerlockchange', () => {
    if (!state.started || state.gameOver) return;
    if (document.pointerLockElement !== renderer.domElement && !state.paused) pause(true);
  });

  window.addEventListener('blur', () => {
    keys.clear();
    if (state.started && !state.gameOver) pause(true);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    monsterCamera.aspect = camera.aspect;
    monsterCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  });

  updateCamera();
  pickPatrolTarget();
  updateUI();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now() / 1000;

    if (state.started && !state.paused && !state.gameOver) {
      updateDoors(dt);
      updatePlayer(dt);
      updateMonster(dt, now);
      updateMonsterVision(dt);
      updatePickups(now);
      updateCamera();
      updateInteraction();
      updateUI();
    } else {
      updatePickups(now);
    }

    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) toastEl.classList.remove('show');
    }

    renderer.render(scene, activeCamera());
  }
  frame();
})();
