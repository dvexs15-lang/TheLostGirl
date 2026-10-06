(() => {
  'use strict';

  if (!window.THREE) {
    document.body.innerHTML = '<div style="padding:24px;color:white;font-family:sans-serif">Не удалось загрузить Three.js. Для первого запуска нужен интернет.</div>';
    return;
  }

  const THREE = window.THREE;
  const $ = (id) => document.getElementById(id);
  const gameRoot = $('game');
  const hud = $('hud');
  const startScreen = $('startScreen');
  const pauseScreen = $('pauseScreen');
  const noteScreen = $('noteScreen');
  const safeScreen = $('safeScreen');
  const defeatScreen = $('defeatScreen');
  const winScreen = $('winScreen');
  const jumpscare = $('jumpscare');
  const interactionEl = $('interaction');
  const runWarning = $('runWarning');
  const staminaFill = $('staminaFill');
  const batteryFill = $('batteryFill');
  const batteryText = $('batteryText');
  const runeCount = $('runeCount');
  const knownCode = $('knownCode');
  const codeProgress = $('codeProgress');
  const visionOverlay = $('visionOverlay');
  const visionTimer = $('visionTimer');
  const hidingOverlay = $('hidingOverlay');
  const toastEl = $('toast');
  const subtitleEl = $('subtitle');
  const noteKicker = $('noteKicker');
  const noteTitle = $('noteTitle');
  const noteBody = $('noteBody');
  const noteCode = $('noteCode');
  const safeHint = $('safeHint');
  const safeInput = $('safeInput');
  const safeSubmit = $('safeSubmit');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.78;
  gameRoot.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050708);
  scene.fog = new THREE.FogExp2(0x080a0c, 0.047);

  const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.05, 70);
  camera.rotation.order = 'YXZ';

  const ambient = new THREE.AmbientLight(0x71808b, 0.11);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x47525b, 0x120e0b, 0.12);
  scene.add(hemi);

  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const losRaycaster = new THREE.Raycaster();
  const centerNdc = new THREE.Vector2(0, 0);
  const keys = new Set();

  const SAFE_CODE = '4137';
  const state = {
    started: false,
    paused: true,
    modal: null,
    gameOver: false,
    won: false,
    jumpscaring: false,
    flashlightOn: true,
    battery: 72,
    stamina: 100,
    staminaDelay: 0,
    yaw: 0,
    pitch: 0,
    currentInteractable: null,
    runes: 0,
    vision: false,
    visionRemaining: 0,
    hidden: false,
    hiddenWardrobe: null,
    rose: false,
    codeDigits: [null, null, null, null],
    safeOpened: false,
    ring: false,
    postcard: false,
    escaped: false,
    toastTimer: 0,
    subtitleTimer: 0,
    elapsed: 0
  };

  const player = {
    pos: new THREE.Vector3(0, 1.65, 12.3),
    radius: 0.34,
    walkSpeed: 3.0,
    runSpeed: 5.1,
    stepTimer: 0
  };

  const staticBoxes = [];
  const occluders = [];
  const interactMeshes = [];
  const interactables = [];
  const doors = [];
  const wardrobes = [];
  const pickups = [];
  const notes = [];
  const lamps = [];
  const roomCenters = [
    new THREE.Vector3(-10, 0, 10), new THREE.Vector3(0, 0, 10), new THREE.Vector3(10, 0, 10),
    new THREE.Vector3(-10, 0, 1),  new THREE.Vector3(0, 0, 1),  new THREE.Vector3(10, 0, 1),
    new THREE.Vector3(-10, 0, -10),new THREE.Vector3(0, 0, -10),new THREE.Vector3(10, 0, -10)
  ];

  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: 0x25282a, roughness: 0.98 }),
    wallAlt: new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 1 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x171819, roughness: 0.95 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 1, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0x30221c, roughness: 0.88 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x201714, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x575c5e, roughness: 0.45, metalness: 0.72 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xc8c0a9, roughness: 1, side: THREE.DoubleSide }),
    rune: new THREE.MeshStandardMaterial({ color: 0x9b86ff, emissive: 0x38216e, emissiveIntensity: 1.4, roughness: 0.35 }),
    battery: new THREE.MeshStandardMaterial({ color: 0xc9b85c, emissive: 0x2c2605, emissiveIntensity: 0.35, roughness: 0.62 }),
    roseStem: new THREE.MeshStandardMaterial({ color: 0x314127, roughness: 0.9 }),
    rosePetal: new THREE.MeshStandardMaterial({ color: 0x4d0f18, roughness: 0.85 }),
    safe: new THREE.MeshStandardMaterial({ color: 0x33383a, roughness: 0.56, metalness: 0.68 }),
    thorn: new THREE.MeshStandardMaterial({ color: 0x5e1832, emissive: 0x1b0209, emissiveIntensity: 0.65, metalness: 0.7, roughness: 0.34 })
  };

  function addBox(x, y, z, sx, sy, sz, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    scene.add(mesh);
    if (opts.blocker) {
      staticBoxes.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, mesh });
    }
    if (opts.occluder !== false) occluders.push(mesh);
    return mesh;
  }

  function addWall(x, z, sx, sz, alt = false) {
    return addBox(x, 1.6, z, sx, 3.2, sz, alt ? mats.wallAlt : mats.wall, { blocker: true });
  }

  function addFurniture(x, z, sx, sz, h = 0.8, material = mats.wood, blocker = true) {
    return addBox(x, h / 2, z, sx, h, sz, material, { blocker });
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mats.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3.2;
  scene.add(ceiling);

  // Outer shell.
  addWall(0, -15, 30, 0.45);
  addWall(0, 15, 30, 0.45);
  addWall(-15, 0, 0.45, 30);
  addWall(15, 0, 0.45, 30);

  function wallSegmentsHorizontal(z) {
    addWall(-13, z, 4, 0.35, true);
    addWall(-5, z, 8, 0.35, true);
    addWall(5, z, 8, 0.35, true);
    addWall(13, z, 4, 0.35, true);
  }
  function wallSegmentsVertical(x) {
    // Door gaps: [-10,-8], [0,2], [9,11].
    addWall(x, -12.5, 0.35, 5);
    addWall(x, -4, 0.35, 8);
    addWall(x, 5.5, 0.35, 7);
    addWall(x, 13, 0.35, 4);
  }
  wallSegmentsHorizontal(6);
  wallSegmentsHorizontal(-4);
  wallSegmentsVertical(-5);
  wallSegmentsVertical(5);

  // Door creation. Each sign is chosen so the leaf opens into one room rather than sitting across a corridor.
  function createDoor({ x, z, axis = 'x', openSign = 1, label = 'Дверь' }) {
    const width = 2.0;
    const h = 2.72;
    const thick = 0.14;
    const group = new THREE.Group();
    if (axis === 'x') group.position.set(x - width / 2, 0, z);
    else group.position.set(x, 0, z - width / 2);
    scene.add(group);

    const geo = axis === 'x' ? new THREE.BoxGeometry(width, h, thick) : new THREE.BoxGeometry(thick, h, width);
    const leaf = new THREE.Mesh(geo, mats.wood.clone());
    leaf.position.y = h / 2;
    if (axis === 'x') leaf.position.x = width / 2;
    else leaf.position.z = width / 2;
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);

    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), mats.metal);
    if (axis === 'x') knob.position.set(width * 0.82, 1.15, thick * 0.8);
    else knob.position.set(thick * 0.8, 1.15, width * 0.82);
    group.add(knob);

    const d = { type: 'door', x, z, axis, openSign, width, group, leaf, knob, amount: 0, target: 0, label };
    leaf.userData.interactable = d;
    knob.userData.interactable = d;
    interactMeshes.push(leaf, knob);
    occluders.push(leaf);
    doors.push(d);
    interactables.push(d);
    return d;
  }

  // Horizontal partitions z=6 and z=-4: openings at x=-10,0,10.
  createDoor({ x: -10, z: 6, axis: 'x', openSign: 1, label: 'Дверь в столовую' });
  createDoor({ x: 0, z: 6, axis: 'x', openSign: -1, label: 'Дверь в коридор' });
  createDoor({ x: 10, z: 6, axis: 'x', openSign: 1, label: 'Дверь в спальню' });
  createDoor({ x: -10, z: -4, axis: 'x', openSign: -1 });
  createDoor({ x: 0, z: -4, axis: 'x', openSign: 1 });
  createDoor({ x: 10, z: -4, axis: 'x', openSign: -1 });
  // Vertical partitions x=-5 and x=5: openings at z=-9,1,10.
  createDoor({ x: -5, z: -9, axis: 'z', openSign: 1 });
  createDoor({ x: -5, z: 1, axis: 'z', openSign: -1 });
  createDoor({ x: -5, z: 10, axis: 'z', openSign: 1 });
  createDoor({ x: 5, z: -9, axis: 'z', openSign: -1 });
  createDoor({ x: 5, z: 1, axis: 'z', openSign: 1 });
  createDoor({ x: 5, z: 10, axis: 'z', openSign: -1 });

  // Front entrance / final escape object.
  const exitDoor = addBox(0, 1.35, 14.72, 2.3, 2.7, 0.14, mats.woodDark.clone(), { blocker: false });
  const exitObj = { type: 'exit', mesh: exitDoor, label: 'Входная дверь' };
  exitDoor.userData.interactable = exitObj;
  interactMeshes.push(exitDoor);
  interactables.push(exitObj);

  // Furniture and room dressing.
  addFurniture(-10.2, 10.2, 4.2, 1.45, 0.76); // dining table
  for (const [x,z] of [[-12.4,10.2],[-8,10.2],[-10.2,8.7],[-10.2,11.7]]) addFurniture(x,z,.65,.65,.65,mats.woodDark);
  addFurniture(10.5, 10.7, 3.2, 1.85, 0.55); // bed
  addFurniture(11.9, 7.9, 1.2, 0.7, 0.78);
  addFurniture(-10.5, 1.3, 3.3, 1.15, 0.75); // side table
  addFurniture(0.2, 1.0, 2.6, 0.9, 0.7);
  addFurniture(10.4, 1.1, 2.5, 1.1, 0.7);
  addFurniture(-10.6, -10.1, 3.0, 1.6, 0.58); // old bed
  addFurniture(-1.0, -10.7, 3.4, 1.0, 0.73);
  addFurniture(10.8, -8.8, 1.3, 2.4, 0.85);
  addFurniture(8.4, -12.0, 1.4, 0.75, 0.7);

  // Picture frames and unsettling wall details.
  function picture(x, y, z, rx, ry, sx = 1.0, sy = 0.72) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.055), mats.woodDark);
    frame.position.set(x,y,z); frame.rotation.set(0,ry,rx); scene.add(frame); occluders.push(frame);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(sx*.79,sy*.72), new THREE.MeshBasicMaterial({ color: 0x34302c, side: THREE.DoubleSide }));
    inner.position.copy(frame.position); inner.rotation.copy(frame.rotation);
    if (Math.abs(Math.sin(ry)) > .5) inner.position.x += Math.sin(ry)*.031; else inner.position.z += Math.cos(ry)*.031;
    scene.add(inner);
  }
  picture(-14.75,1.8,9,0,Math.PI/2);
  picture(14.75,1.8,10,0,-Math.PI/2);
  picture(-2,1.8,-14.75,0,0);

  function addLamp(x, z, intensity = 1.25, distance = 5.5, color = 0xb7a47f) {
    const light = new THREE.PointLight(color, intensity, distance, 2.0);
    light.position.set(x,2.5,z);
    light.castShadow = true;
    light.shadow.mapSize.set(256,256);
    scene.add(light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.055,8,8), new THREE.MeshBasicMaterial({color}));
    bulb.position.copy(light.position); scene.add(bulb);
    lamps.push({ light, base: intensity, phase: Math.random()*10 });
  }
  addLamp(-10,10,1.0,5.2,0x8f7959);
  addLamp(0,10,0.85,4.8,0x87775f);
  addLamp(10,10,0.8,4.6,0x7e826d);
  addLamp(-10,1,0.75,4.5,0x7f6b58);
  addLamp(0,1,0.6,4.3,0x6e7470);
  addLamp(10,1,0.7,4.5,0x726f63);
  addLamp(-10,-10,0.68,4.3,0x796354);
  addLamp(0,-10,0.58,4.2,0x6a6761);
  addLamp(10,-10,0.55,4.0,0x725f59);

  // Player flashlight.
  const flashlight = new THREE.SpotLight(0xf3eed7, 17, 13.5, Math.PI/6.1, 0.48, 1.35);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(512,512);
  const flashlightTarget = new THREE.Object3D();
  scene.add(flashlight, flashlightTarget);
  flashlight.target = flashlightTarget;

  function registerInteractable(obj, meshes) {
    for (const mesh of (Array.isArray(meshes) ? meshes : [meshes])) {
      mesh.userData.interactable = obj;
      interactMeshes.push(mesh);
    }
    interactables.push(obj);
    return obj;
  }

  function createWardrobe(x, z, facing = 0) {
    const group = new THREE.Group();
    group.position.set(x,0,z);
    group.rotation.y = facing;
    scene.add(group);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5,2.55,.78), mats.woodDark.clone());
    body.position.y = 1.275; body.castShadow = true; body.receiveShadow = true; group.add(body);
    const left = new THREE.Mesh(new THREE.BoxGeometry(.67,2.25,.055), mats.wood.clone());
    const right = left.clone(); left.position.set(-.36,1.22,.42); right.position.set(.36,1.22,.42); group.add(left,right);
    const gap1 = new THREE.Mesh(new THREE.BoxGeometry(.48,.04,.018), new THREE.MeshBasicMaterial({color:0x050505}));
    const gap2 = gap1.clone(); gap1.position.set(-.36,1.45,.453); gap2.position.set(.36,1.45,.453); group.add(gap1,gap2);
    const forward = new THREE.Vector3(Math.sin(facing),0,Math.cos(facing));
    const obj = {
      type:'wardrobe', group, body, left, right,
      hidePos: new THREE.Vector3(x,1.65,z).addScaledVector(forward,.18),
      exitPos: new THREE.Vector3(x,1.65,z).addScaledVector(forward,1.05),
      approachPos: new THREE.Vector3(x,0,z).addScaledVector(forward,1.25),
      label:'Шкаф'
    };
    const rotated = Math.abs(Math.sin(facing)) > 0.5;
    const hx = rotated ? .4 : .75;
    const hz = rotated ? .75 : .4;
    staticBoxes.push({minX:x-hx,maxX:x+hx,minZ:z-hz,maxZ:z+hz,mesh:body});
    occluders.push(body,left,right);
    wardrobes.push(obj);
    registerInteractable(obj,[left,right]);
    return obj;
  }

  createWardrobe(-13.5,8.2,Math.PI/2);
  createWardrobe(13.5,8.4,-Math.PI/2);
  createWardrobe(-13.5,-.4,Math.PI/2);
  createWardrobe(13.5,-1.0,-Math.PI/2);
  createWardrobe(-13.5,-11.8,Math.PI/2);
  createWardrobe(1.8,-13.5,0);
  createWardrobe(13.5,-11.0,-Math.PI/2);

  function createRune(x,z) {
    const group = new THREE.Group(); group.position.set(x,.5,z); scene.add(group);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.18,.043,8,24),mats.rune); ring.rotation.x=Math.PI/2; group.add(ring);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(.1),mats.rune); group.add(core);
    const obj={type:'rune',group,alive:true,phase:Math.random()*8,baseY:.5};
    registerInteractable(obj,[ring,core]); pickups.push(obj); return obj;
  }
  function createBattery(x,z) {
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.34,12),mats.battery); mesh.position.set(x,.2,z); mesh.rotation.z=Math.PI/2; mesh.castShadow=true; scene.add(mesh);
    const obj={type:'battery',mesh,alive:true}; registerInteractable(obj,mesh); pickups.push(obj); return obj;
  }
  createRune(2.2,10.4); createRune(-11.8,1.8); createRune(8.0,-1.8); createRune(-8.7,-11.6);
  createBattery(3.2,8.5); createBattery(-8.3,.1); createBattery(11.8,2.2); createBattery(-1.6,-8.7); createBattery(7.4,-11.8);

  function createRose(x,z) {
    const group=new THREE.Group(); group.position.set(x,.86,z); group.rotation.z=.12; scene.add(group);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.018,.025,.5,7),mats.roseStem); stem.position.y=-.2; group.add(stem);
    const petals=[];
    for(let i=0;i<6;i++){
      const p=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),mats.rosePetal);
      const a=i/6*Math.PI*2; p.scale.set(1,.45,.8); p.position.set(Math.cos(a)*.07,.05+Math.sin(a*2)*.018,Math.sin(a)*.07); p.rotation.z=a; group.add(p); petals.push(p);
    }
    group.rotation.x=.45;
    const obj={type:'rose',group,alive:true,label:'Увядшая роза'};
    registerInteractable(obj,[stem,...petals]); pickups.push(obj); return obj;
  }
  createRose(-10.2,10.2);

  const noteData = [
    {x:-11.4,z:8.9,title:'СНЕГ ВНУТРИ',body:'Я думала, что если стану достаточно сильной, холод перестанет быть чем-то страшным.\n\nНо за границей мира не было ни зимы, ни лета. Там вообще ничего не было. Только я — и мысль о том, что Крис остался по другую сторону.',order:0,digit:'4'},
    {x:10.7,z:8.2,title:'ДЕСЯТЬ ЛЕТ',body:'В доме всё стоит на своих местах. Это хуже всего.\n\nСтол помнит руки мамы. Комната помнит смех. А я помню, сколько раз пыталась вернуться сюда нормальной.\n\nДесять лет — достаточный срок, чтобы понять: свобода и одиночество иногда звучат одинаково.',order:1,digit:'1'},
    {x:-9.0,z:-11.1,title:'КОЛЬЦО',body:'Я спрятала Терновое кольцо. Оно не должно было существовать здесь, но пришло вместе со мной.\n\nКогда я держу его, я снова чувствую ту силу. Слишком знакомую. Слишком лёгкую.\n\nЕсли Крис когда-нибудь вернётся, пусть лучше не надевает его.',order:2,digit:'3'},
    {x:2.4,z:12.2,title:'ДОМ',body:'Я заперла самое важное в сейфе. Не потому что боялась воров.\n\nЯ боялась себя.\n\nПоследнюю цифру я написала там, где Крис раньше всегда останавливался перед уходом.',order:3,digit:'7'},
    {x:-2.2,z:9.0,title:'ЗА КРАЕМ',body:'Мы правда верили, что мир — клетка. Что снаружи нас ждёт настоящее небо.\n\nКрис, если ты читаешь это: я была первой, кто выбрался. И первой, кто понял, что клетка хотя бы знала твоё имя.'},
    {x:10.0,z:1.7,title:'Я СЛЫШУ ТЕБЯ',body:'Иногда ночью дом скрипит так, будто кто-то ходит по коридору.\n\nЯ знаю, что это не мама. Не папа. Не Десс.\n\nИногда я отвечаю. Иногда шаги отвечают мне.'},
    {x:-1.8,z:.1,title:'КРИС',body:'Я злилась на тебя за то, что ты не смог выйти. Потом злилась на себя за то, что смогла.\n\nТеперь мне кажется, что я просто ждала. Очень долго.\n\nЕсли дверь откроется ещё раз — я не знаю, захочу ли я тебя обнять или заставить остаться.'},
    {x:11.8,z:-9.0,title:'НЕ СМОТРИ',body:'Зеркала пришлось накрыть. В них я всё ещё выгляжу как девочка, которой была.\n\nА в стекле окон — нет.\n\nПожалуйста, не смотри на меня слишком долго.'}
  ];

  function createNote(data,index) {
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.52,.36),mats.paper.clone());
    mesh.position.set(data.x,.035,data.z); mesh.rotation.x=-Math.PI/2; mesh.rotation.z=(index*.77)%2-.8; scene.add(mesh);
    const obj={type:'note',mesh,data,index,read:false}; notes.push(obj); registerInteractable(obj,mesh); return obj;
  }
  noteData.forEach(createNote);

  // Safe and its contents.
  const safeGroup=new THREE.Group(); safeGroup.position.set(10.5,0,-11.2); scene.add(safeGroup);
  const safeBody=new THREE.Mesh(new THREE.BoxGeometry(1.35,1.35,.78),mats.safe); safeBody.position.y=.68; safeBody.castShadow=true; safeGroup.add(safeBody);
  const safeDoorPivot=new THREE.Group(); safeDoorPivot.position.set(-.675,.68,.415); safeGroup.add(safeDoorPivot);
  const safeDoorMesh=new THREE.Mesh(new THREE.BoxGeometry(1.3,1.25,.08),mats.safe.clone()); safeDoorMesh.position.x=.65; safeDoorPivot.add(safeDoorMesh);
  const safeKnob=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.1,14),mats.metal); safeKnob.rotation.x=Math.PI/2; safeKnob.position.set(.95,0,.08); safeDoorPivot.add(safeKnob);
  occluders.push(safeBody,safeDoorMesh);
  staticBoxes.push({minX:9.82,maxX:11.18,minZ:-11.62,maxZ:-10.8,mesh:safeBody});
  const safeObj={type:'safe',group:safeGroup,body:safeBody,door:safeDoorMesh,knob:safeKnob,amount:0,target:0};
  registerInteractable(safeObj,[safeDoorMesh,safeKnob]);

  const ringMesh=new THREE.Mesh(new THREE.TorusGeometry(.13,.035,8,22),mats.thorn); ringMesh.position.set(10.35,.7,-10.72); ringMesh.rotation.x=Math.PI/2; ringMesh.visible=false; scene.add(ringMesh);
  const thorn1=new THREE.Mesh(new THREE.ConeGeometry(.035,.15,5),mats.thorn); thorn1.position.set(.11,.08,0); thorn1.rotation.z=-.7; ringMesh.add(thorn1);
  const ringObj={type:'ring',mesh:ringMesh,alive:true}; registerInteractable(ringObj,ringMesh);

  const postcardMat=new THREE.MeshStandardMaterial({color:0xd7cab2,roughness:1,side:THREE.DoubleSide});
  const postcardMesh=new THREE.Mesh(new THREE.PlaneGeometry(.48,.3),postcardMat); postcardMesh.position.set(10.75,.62,-10.72); postcardMesh.rotation.x=-Math.PI/2; postcardMesh.visible=false; scene.add(postcardMesh);
  const postcardObj={type:'postcard',mesh:postcardMesh,alive:true}; registerInteractable(postcardObj,postcardMesh);

  // Noelle: pale ghostly deer-like silhouette.
  const noelle={
    root:new THREE.Group(), active:false, state:'dormant', pos:new THREE.Vector3(11.5,0,-10.4),
    yaw:Math.PI, speed:0, lastSeen:new THREE.Vector3(), lastSeenTime:-999, warnUntil:-999,
    target:new THREE.Vector3(), path:[], pathIndex:0, pathTimer:0, idleTimer:0, searchTimer:0,
    wardrobe:null, wardrobeTimer:0, attackCooldown:0, voiceCooldown:0, retreatTarget:null
  };
  scene.add(noelle.root); noelle.root.position.copy(noelle.pos); noelle.root.visible=false;

  const ghostMat=new THREE.MeshStandardMaterial({color:0xcfd3d5,roughness:.9,transparent:true,opacity:.88});
  const ghostDark=new THREE.MeshStandardMaterial({color:0x1b1c1e,roughness:1});
  const dress=new THREE.Mesh(new THREE.ConeGeometry(.48,1.55,14,1,true),ghostMat); dress.position.y=.82; dress.castShadow=true; noelle.root.add(dress);
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(.28,.4,.72,12),ghostMat); torso.position.y=1.42; noelle.root.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,16,12),ghostMat); head.position.y=1.98; head.scale.set(.85,1.1,.85); noelle.root.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.34,14,10),new THREE.MeshStandardMaterial({color:0xe2e3e3,roughness:1,transparent:true,opacity:.9})); hair.position.set(0,2.05,.08); hair.scale.set(1,1.12,.78); noelle.root.add(hair);
  const faceCover=new THREE.Mesh(new THREE.SphereGeometry(.25,14,10),ghostMat); faceCover.position.set(0,1.98,-.055); faceCover.scale.set(.78,.95,.42); noelle.root.add(faceCover);
  function antler(side){
    const g=new THREE.Group(); g.position.set(.16*side,2.19,0); noelle.root.add(g);
    const m=new THREE.MeshStandardMaterial({color:0xdadede,roughness:.75});
    const main=new THREE.Mesh(new THREE.CylinderGeometry(.025,.04,.55,7),m); main.position.y=.25; main.rotation.z=-.28*side; g.add(main);
    for(let i=0;i<2;i++){
      const branch=new THREE.Mesh(new THREE.CylinderGeometry(.018,.025,.25,6),m); branch.position.set(.07*side,.16+i*.16,0); branch.rotation.z=-1.0*side; g.add(branch);
    }
  }
  antler(-1); antler(1);
  const eyeMat=new THREE.MeshBasicMaterial({color:0xd51422});
  const e1=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),eyeMat); const e2=e1.clone();
  e1.position.set(-.09,2.0,-.245); e2.position.set(.09,2.0,-.245); noelle.root.add(e1,e2);
  const redLight=new THREE.PointLight(0x9f0b19,.55,2.5); redLight.position.set(0,2.0,-.25); noelle.root.add(redLight);
  const mouth=new THREE.Mesh(new THREE.PlaneGeometry(.12,.18),new THREE.MeshBasicMaterial({color:0x050506,side:THREE.DoubleSide})); mouth.position.set(0,1.87,-.258); noelle.root.add(mouth);

  // Audio — fully procedural; no asset files required.
  let audioCtx=null, master=null, ambienceOsc=null, ambienceGain=null;
  function initAudio(){
    if(audioCtx) return;
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    audioCtx=new AC(); master=audioCtx.createGain(); master.gain.value=.72; master.connect(audioCtx.destination);
    ambienceOsc=audioCtx.createOscillator(); ambienceGain=audioCtx.createGain();
    ambienceOsc.type='sine'; ambienceOsc.frequency.value=43; ambienceGain.gain.value=.018;
    ambienceOsc.connect(ambienceGain); ambienceGain.connect(master); ambienceOsc.start();
  }
  function tone(freq=220,dur=.08,vol=.06,type='sine',slide=1){
    if(!audioCtx||!master) return;
    const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.type=type; o.frequency.setValueAtTime(freq,audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*slide),audioCtx.currentTime+dur);
    g.gain.setValueAtTime(vol,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur); o.connect(g); g.connect(master); o.start(); o.stop(audioCtx.currentTime+dur+.02);
  }
  function noise(dur=.18,vol=.08){
    if(!audioCtx||!master) return;
    const len=Math.max(1,Math.floor(audioCtx.sampleRate*dur)); const b=audioCtx.createBuffer(1,len,audioCtx.sampleRate); const d=b.getChannelData(0); for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const s=audioCtx.createBufferSource(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter(); s.buffer=b; f.type='lowpass'; f.frequency.value=1400; g.gain.setValueAtTime(vol,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur); s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  function footstep(run){ noise(.045,run?.035:.022); tone(run?92:78,.05,.014,'triangle',.7); }
  function doorSound(open){ noise(.22,.045); tone(open?105:78,.32,.035,'sawtooth',.55); }
  function pickupSound(){ tone(420,.08,.035,'sine',1.35); tone(660,.12,.022,'triangle',.8); }
  function runeSound(){ tone(280,.22,.04,'sine',1.8); tone(520,.3,.025,'sine',.75); }
  function scareSound(){ noise(1.0,.42); tone(68,1.0,.34,'sawtooth',2.5); tone(840,.42,.16,'square',.35); }
  function speakNoelle(text){
    showSubtitle('Ноэлль: «'+text+'»',3.0);
    if(!('speechSynthesis' in window)) return;
    try{
      speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='ru-RU'; u.rate=.72; u.pitch=.52; u.volume=.85;
      const voices=speechSynthesis.getVoices(); const ru=voices.find(v=>v.lang&&v.lang.toLowerCase().startsWith('ru')); if(ru) u.voice=ru; speechSynthesis.speak(u);
    }catch(_){ }
  }

  function showToast(text,seconds=2.0){ state.toastTimer=seconds; toastEl.textContent=text; toastEl.classList.add('show'); }
  function showSubtitle(text,seconds=2.7){ state.subtitleTimer=seconds; subtitleEl.textContent=text; subtitleEl.classList.add('show'); }
  function updateMessages(dt){
    if(state.toastTimer>0){ state.toastTimer-=dt; if(state.toastTimer<=0) toastEl.classList.remove('show'); }
    if(state.subtitleTimer>0){ state.subtitleTimer-=dt; if(state.subtitleTimer<=0) subtitleEl.classList.remove('show'); }
  }

  function setScreen(el,show){ el.classList.toggle('visible',!!show); }
  function requestPointer(){ if(state.started&&!state.modal&&!state.gameOver&&!state.jumpscaring) renderer.domElement.requestPointerLock?.(); }

  function pauseGame(show=true){
    if(!state.started||state.gameOver||state.modal||state.jumpscaring) return;
    state.paused=true; setScreen(pauseScreen,show); document.exitPointerLock?.();
  }
  function resumeGame(){
    if(state.gameOver) return; state.paused=false; setScreen(pauseScreen,false); requestPointer();
  }

  function goalDone(name){
    return ({rose:state.rose,code:state.codeDigits.every(Boolean),safe:state.safeOpened,ring:state.ring,postcard:state.postcard,escape:state.escaped})[name];
  }
  function updateHud(){
    staminaFill.style.width=state.stamina.toFixed(2)+'%';
    batteryFill.style.width=state.battery.toFixed(2)+'%'; batteryText.textContent=Math.ceil(state.battery)+'%';
    runeCount.textContent=state.runes;
    const known=state.codeDigits.map(d=>d||'_').join(' '); knownCode.textContent=known;
    const count=state.codeDigits.filter(Boolean).length; codeProgress.textContent=count+'/4';
    document.querySelectorAll('.objective').forEach(el=>el.classList.toggle('done',goalDone(el.dataset.goal)));
  }

  function pointInExpandedBox(x,z,b,r){ return x>b.minX-r&&x<b.maxX+r&&z>b.minZ-r&&z<b.maxZ+r; }
  function pointSegDistance(px,pz,ax,az,bx,bz){
    const abx=bx-ax,abz=bz-az,apx=px-ax,apz=pz-az; const denom=abx*abx+abz*abz||1; const t=Math.max(0,Math.min(1,(apx*abx+apz*abz)/denom));
    const dx=px-(ax+abx*t),dz=pz-(az+abz*t); return Math.hypot(dx,dz);
  }
  function doorSegment(d){
    const a=d.group.position; const r=d.group.rotation.y; let dx,dz;
    if(d.axis==='x'){dx=Math.cos(r)*d.width;dz=-Math.sin(r)*d.width;}else{dx=Math.sin(r)*d.width;dz=Math.cos(r)*d.width;}
    return [a.x,a.z,a.x+dx,a.z+dz];
  }
  function blockedAt(x,z,r=.34,includeDoors=true){
    if(x<-14.55+r||x>14.55-r||z<-14.55+r||z>14.55-r) return true;
    for(const b of staticBoxes) if(pointInExpandedBox(x,z,b,r)) return true;
    if(includeDoors){
      for(const d of doors){
        if(d.amount>.86) continue; const [ax,az,bx,bz]=doorSegment(d); if(pointSegDistance(x,z,ax,az,bx,bz)<r+.1) return true;
      }
    }
    return false;
  }

  function movePlayer(dx,dz){
    const nx=player.pos.x+dx; if(!blockedAt(nx,player.pos.z,player.radius)) player.pos.x=nx;
    const nz=player.pos.z+dz; if(!blockedAt(player.pos.x,nz,player.radius)) player.pos.z=nz;
  }

  function updatePlayer(dt){
    if(state.hidden||state.vision) return;
    let ix=0,iz=0; if(keys.has('KeyW')) iz-=1; if(keys.has('KeyS')) iz+=1; if(keys.has('KeyA')) ix-=1; if(keys.has('KeyD')) ix+=1;
    const len=Math.hypot(ix,iz); if(len>0){ix/=len;iz/=len;}
    const moving=len>0; const wantsRun=moving&&(keys.has('ShiftLeft')||keys.has('ShiftRight')); const running=wantsRun&&state.stamina>.2;
    const speed=running?player.runSpeed:player.walkSpeed;
    if(moving){
      const sy=Math.sin(state.yaw),cy=Math.cos(state.yaw); const dx=(ix*cy+iz*sy)*speed*dt; const dz=(-ix*sy+iz*cy)*speed*dt; movePlayer(dx,dz);
      player.stepTimer-=dt; if(player.stepTimer<=0){ footstep(running); player.stepTimer=running?.31:.47; }
    } else player.stepTimer=0;
    if(running){state.stamina=Math.max(0,state.stamina-23*dt);state.staminaDelay=.6;}else if(state.staminaDelay>0)state.staminaDelay-=dt;else state.stamina=Math.min(100,state.stamina+17*dt);
  }

  function updateCamera(){
    if(state.vision){
      const eye=noelle.root.position.clone().add(new THREE.Vector3(0,1.92,0)); camera.position.copy(eye);
      camera.rotation.set(0,noelle.yaw+Math.PI,0);
      return;
    }
    camera.position.copy(player.pos);
    camera.rotation.set(state.pitch,state.yaw,0);
  }

  function updateFlashlight(dt){
    if(state.flashlightOn&&state.battery>0&&!state.hidden){ state.battery=Math.max(0,state.battery-1.55*dt); if(state.battery<=0){state.flashlightOn=false;showToast('Фонарик разрядился.');tone(70,.2,.04,'square',.5);} }
    const enabled=state.flashlightOn&&state.battery>0&&!state.vision&&!state.hidden;
    flashlight.visible=enabled;
    if(enabled){
      flashlight.position.copy(camera.position); const dir=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion); flashlightTarget.position.copy(camera.position).addScaledVector(dir,8);
    }
  }

  function getPrompt(obj){
    if(!obj) return '';
    if(obj.type==='door') return obj.target>.5?'ЛКМ — закрыть дверь':'ЛКМ — открыть дверь';
    if(obj.type==='wardrobe') return state.hidden&&state.hiddenWardrobe===obj?'ЛКМ — выйти из шкафа':'ЛКМ — спрятаться в шкафу';
    if(obj.type==='rune') return obj.alive?'ЛКМ — взять руну':'';
    if(obj.type==='battery') return obj.alive?(state.battery>=99?'Фонарик заряжен':'ЛКМ — взять батарейку'):'';
    if(obj.type==='rose') return obj.alive?'ЛКМ — забрать увядшую розу':'';
    if(obj.type==='note') return 'ЛКМ — прочитать записку';
    if(obj.type==='safe') return state.safeOpened?'Сейф открыт':'ЛКМ — осмотреть сейф';
    if(obj.type==='ring') return obj.alive&&obj.mesh.visible?'ЛКМ — забрать Терновое кольцо':'';
    if(obj.type==='postcard') return obj.alive&&obj.mesh.visible?'ЛКМ — забрать открытку':'';
    if(obj.type==='exit') return 'ЛКМ — открыть входную дверь';
    return '';
  }

  function findInteraction(){
    if(state.hidden){ state.currentInteractable=state.hiddenWardrobe; interactionEl.textContent='ЛКМ — выйти из шкафа'; interactionEl.classList.add('show'); return; }
    if(state.vision){ state.currentInteractable=null; interactionEl.classList.remove('show'); return; }
    raycaster.setFromCamera(centerNdc,camera); raycaster.far=2.65;
    const hits=raycaster.intersectObjects(interactMeshes,false);
    let obj=null;
    for(const hit of hits){ if(hit.object.visible===false) continue; const candidate=hit.object.userData.interactable; if(candidate){ obj=candidate; break; } }
    state.currentInteractable=obj;
    const p=getPrompt(obj); interactionEl.textContent=p; interactionEl.classList.toggle('show',!!p);
  }

  function removePickup(obj){ obj.alive=false; if(obj.group)obj.group.visible=false; if(obj.mesh)obj.mesh.visible=false; }

  function openNote(obj){
    state.modal='note'; state.paused=true; document.exitPointerLock?.();
    noteKicker.textContent=obj.data.order!==undefined?'ФРАГМЕНТ ЗАПИСИ':'ЗАПИСКА НОЭЛЛЬ'; noteTitle.textContent=obj.data.title; noteBody.textContent=obj.data.body;
    if(obj.data.order!==undefined){ noteCode.textContent=`ЧАСТЬ КОДА ${obj.data.order+1}:  ${obj.data.digit}`; noteCode.classList.remove('hidden'); if(!state.codeDigits[obj.data.order]){state.codeDigits[obj.data.order]=obj.data.digit;pickupSound();updateHud();showToast('Часть кода запомнена.');} }
    else noteCode.classList.add('hidden');
    obj.read=true; setScreen(noteScreen,true);
  }
  function closeNote(){ state.modal=null; state.paused=false; setScreen(noteScreen,false); requestPointer(); }

  function openSafeUI(){
    if(state.safeOpened){showToast('Сейф уже открыт.');return;}
    state.modal='safe'; state.paused=true; document.exitPointerLock?.(); setScreen(safeScreen,true);
    const count=state.codeDigits.filter(Boolean).length; safeHint.textContent=count<4?`Найдено частей кода: ${count}/4. Можно попробовать ввести код, но Крис ещё не знает его целиком.`:`Записки складываются в код: ${state.codeDigits.join('')}.`;
    safeInput.value=''; safeInput.focus();
  }
  function closeSafe(){ state.modal=null; state.paused=false; setScreen(safeScreen,false); requestPointer(); }

  function wakeNoelle(){
    if(noelle.active) return; noelle.active=true; noelle.state='roam'; noelle.root.visible=true; noelle.pos.set(11.4,0,-10.2); noelle.root.position.copy(noelle.pos); chooseRoamTarget();
    for(const l of lamps) l.light.intensity*=.25;
    noise(.8,.13); tone(48,.9,.08,'sawtooth',.55);
    setTimeout(()=>{ if(!state.gameOver){ for(const l of lamps) l.light.intensity=l.base; speakNoelle('Крис... ты всё-таки вернулся.'); } },900);
  }

  function interact(obj){
    if(!obj||state.paused||state.gameOver||state.jumpscaring) return;
    if(obj.type==='door'){
      obj.target=obj.target>.5?0:1; doorSound(obj.target>.5); return;
    }
    if(obj.type==='wardrobe'){
      if(state.hidden){ exitWardrobe(false); return; }
      const seen=noelle.active&&monsterCanSeePlayer();
      state.hidden=true; state.hiddenWardrobe=obj; player.pos.copy(obj.hidePos); state.flashlightOn=false; hidingOverlay.classList.remove('hidden'); tone(72,.1,.04,'triangle',.6);
      if(seen){ noelle.state='wardrobeCheck'; noelle.wardrobe=obj; noelle.wardrobeTimer=0; noelle.pathTimer=0; showSubtitle('Она видела, куда ты спрятался.',1.8); }
      return;
    }
    if(obj.type==='rune'&&obj.alive){ state.runes++; removePickup(obj); runeSound(); updateHud(); showToast('Руна +1'); return; }
    if(obj.type==='battery'&&obj.alive){ if(state.battery>=99){showToast('Заряд уже полный.');return;} state.battery=Math.min(100,state.battery+34); removePickup(obj); pickupSound();updateHud();showToast('Батарейка найдена.');return; }
    if(obj.type==='rose'&&obj.alive){ state.rose=true; removePickup(obj); pickupSound(); updateHud(); showToast('Увядшая роза. Она почему-то ледяная.',2.8); wakeNoelle(); return; }
    if(obj.type==='note'){ openNote(obj); return; }
    if(obj.type==='safe'){ openSafeUI(); return; }
    if(obj.type==='ring'&&obj.alive&&obj.mesh.visible){state.ring=true;removePickup(obj);pickupSound();updateHud();showToast('Терновое кольцо. От него немеют пальцы.',2.5);return;}
    if(obj.type==='postcard'&&obj.alive&&obj.mesh.visible){state.postcard=true;removePickup(obj);pickupSound();updateHud();showToast('Старая открытка семьи Холидеев.',2.5);return;}
    if(obj.type==='exit'){
      const missing=[]; if(!state.rose)missing.push('розу'); if(!state.safeOpened)missing.push('открыть сейф'); if(!state.ring)missing.push('Терновое кольцо'); if(!state.postcard)missing.push('открытку');
      if(missing.length){showToast('Крис ещё не может уйти: '+missing.join(', ')+'.',3.0);return;} winGame();
    }
  }

  function exitWardrobe(forced){
    const w=state.hiddenWardrobe; if(!w)return;
    state.hidden=false; state.hiddenWardrobe=null; hidingOverlay.classList.add('hidden'); player.pos.copy(w.exitPos);
    if(forced){ noise(.28,.14); tone(95,.28,.09,'sawtooth',.6); showToast('Ноэлль распахнула шкаф и вытолкнула Криса.',2.5); }
  }

  function updateDoors(dt){
    for(const d of doors){
      d.amount=THREE.MathUtils.damp(d.amount,d.target,8,dt); d.group.rotation.y=d.openSign*(Math.PI/2)*d.amount;
    }
    safeObj.amount=THREE.MathUtils.damp(safeObj.amount,safeObj.target,6,dt); safeDoorPivot.rotation.y=-Math.PI/2*safeObj.amount;
  }

  // Grid A* used by Noelle so closed doors and furniture matter.
  const NAV_MIN=-14,NAV_MAX=14,NAV_STEP=.8;
  function navKey(ix,iz){return ix+','+iz;}
  function toCell(v){return Math.round((v-NAV_MIN)/NAV_STEP);}
  function fromCell(i){return NAV_MIN+i*NAV_STEP;}
  function findPath(start,target){
    const sx=toCell(start.x),sz=toCell(start.z),tx=toCell(target.x),tz=toCell(target.z); const maxI=toCell(NAV_MAX);
    const open=[{x:sx,z:sz,g:0,f:0}]; const best=new Map([[navKey(sx,sz),0]]); const parent=new Map(); let found=null,iterations=0;
    const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    while(open.length&&iterations++<3000){
      let bi=0; for(let i=1;i<open.length;i++)if(open[i].f<open[bi].f)bi=i; const cur=open.splice(bi,1)[0];
      if(cur.x===tx&&cur.z===tz){found=cur;break;}
      for(const [dx,dz] of dirs){
        const nx=cur.x+dx,nz=cur.z+dz;if(nx<0||nz<0||nx>maxI||nz>maxI)continue; const wx=fromCell(nx),wz=fromCell(nz);
        if(blockedAt(wx,wz,.33,true)&&!(Math.abs(nx-tx)<=1&&Math.abs(nz-tz)<=1))continue;
        if(dx&&dz){const ax=fromCell(cur.x+dx),az=fromCell(cur.z),bx=fromCell(cur.x),bz=fromCell(cur.z+dz);if(blockedAt(ax,az,.28,true)||blockedAt(bx,bz,.28,true))continue;}
        const ng=cur.g+(dx&&dz?1.414:1);const k=navKey(nx,nz);if(best.has(k)&&best.get(k)<=ng)continue;best.set(k,ng);parent.set(k,navKey(cur.x,cur.z));const h=Math.hypot(tx-nx,tz-nz);open.push({x:nx,z:nz,g:ng,f:ng+h});
      }
    }
    if(!found)return [target.clone()];
    const cells=[];let k=navKey(found.x,found.z);while(k){const [x,z]=k.split(',').map(Number);cells.push(new THREE.Vector3(fromCell(x),0,fromCell(z)));if(x===sx&&z===sz)break;k=parent.get(k);}
    cells.reverse(); cells.push(target.clone()); return cells;
  }

  function chooseRoamTarget(){
    const candidates=roomCenters.filter(p=>p.distanceTo(noelle.pos)>5); noelle.target.copy(candidates[Math.floor(Math.random()*candidates.length)]||roomCenters[0]); noelle.pathTimer=0;
  }
  function setPathTarget(target,force=false){
    noelle.pathTimer-=.016;
    if(force||noelle.pathTimer<=0||!noelle.path.length){ noelle.path=findPath(noelle.pos,target); noelle.pathIndex=Math.min(1,noelle.path.length-1); noelle.pathTimer=.48; }
  }
  function followPath(dt,speed,target){
    noelle.pathTimer-=dt;
    if(noelle.pathTimer<=0||!noelle.path.length){noelle.path=findPath(noelle.pos,target);noelle.pathIndex=Math.min(1,noelle.path.length-1);noelle.pathTimer=.48;}
    let wp=noelle.path[noelle.pathIndex]||target; if(noelle.pos.distanceTo(wp)<.38&&noelle.pathIndex<noelle.path.length-1){noelle.pathIndex++;wp=noelle.path[noelle.pathIndex];}
    const dir=wp.clone().sub(noelle.pos);dir.y=0;const dist=dir.length();if(dist>.02){dir.divideScalar(dist);const step=Math.min(dist,speed*dt);noelle.pos.addScaledVector(dir,step);const targetYaw=Math.atan2(dir.x,dir.z);let delta=((targetYaw-noelle.yaw+Math.PI)%(Math.PI*2))-Math.PI;if(delta<-Math.PI)delta+=Math.PI*2;noelle.yaw+=delta*Math.min(1,dt*5.0);noelle.speed=speed;}else noelle.speed=0;
  }

  function monsterCanSeePlayer(){
    if(!noelle.active||state.hidden)return false;
    const origin=noelle.pos.clone().add(new THREE.Vector3(0,1.9,0)); const target=player.pos.clone(); const to=target.sub(origin); const dist=to.length();
    if(dist>15.5)return false; const dir=to.clone().normalize(); const fwd=new THREE.Vector3(Math.sin(noelle.yaw),0,Math.cos(noelle.yaw)); const flat=new THREE.Vector3(dir.x,0,dir.z).normalize();
    const angle=Math.acos(THREE.MathUtils.clamp(fwd.dot(flat),-1,1))*180/Math.PI; if(angle>47&&dist>2.0)return false;
    losRaycaster.set(origin,dir);losRaycaster.far=dist; const hits=losRaycaster.intersectObjects(occluders,false); if(hits.length&&hits[0].distance<dist-.2)return false; return true;
  }

  const phrases=['Крис... не уходи снова.','Я всё ещё здесь.','Ты хотел увидеть, что стало со мной?','Останься. На этот раз — останься.'];
  function onDetected(){ if(noelle.voiceCooldown<=0){speakNoelle(phrases[Math.floor(Math.random()*phrases.length)]);noelle.voiceCooldown=5.5;} }

  function updateNoelle(dt){
    if(!noelle.active||state.gameOver)return;
    noelle.voiceCooldown=Math.max(0,noelle.voiceCooldown-dt); noelle.attackCooldown=Math.max(0,noelle.attackCooldown-dt);
    const seen=monsterCanSeePlayer();
    if(seen&&noelle.state!=='wardrobeCheck'&&noelle.state!=='retreat'){
      if(noelle.state!=='chase')onDetected(); noelle.state='chase'; noelle.lastSeen.copy(player.pos); noelle.lastSeenTime=state.elapsed; noelle.warnUntil=state.elapsed+2;
    }
    if(noelle.state==='chase'&&!seen&&state.elapsed-noelle.lastSeenTime>.12) noelle.state='search';

    if(noelle.state==='wardrobeCheck'){
      if(!state.hidden||state.hiddenWardrobe!==noelle.wardrobe){noelle.state='search';noelle.wardrobe=null;}
      else{
        followPath(dt,4.15,noelle.wardrobe.approachPos);
        if(noelle.pos.distanceTo(noelle.wardrobe.approachPos)<1.05){ noelle.wardrobeTimer+=dt; noelle.speed=0; if(noelle.wardrobeTimer>.72){ const old=noelle.wardrobe; exitWardrobe(true); noelle.wardrobe=null; noelle.wardrobeTimer=0; noelle.state='retreat'; noelle.attackCooldown=3.2; const far=roomCenters.slice().sort((a,b)=>b.distanceTo(noelle.pos)-a.distanceTo(noelle.pos))[0]; noelle.retreatTarget=far.clone(); noelle.pathTimer=0; speakNoelle('Не здесь.'); } }
      }
    } else if(noelle.state==='retreat'){
      followPath(dt,4.6,noelle.retreatTarget||roomCenters[0]); if(noelle.retreatTarget&&noelle.pos.distanceTo(noelle.retreatTarget)<1.1){noelle.state='roam';noelle.idleTimer=1+Math.random()*1.5;chooseRoamTarget();}
    } else if(noelle.state==='chase'){
      followPath(dt,4.35,player.pos); if(seen){noelle.lastSeen.copy(player.pos);noelle.lastSeenTime=state.elapsed;noelle.warnUntil=state.elapsed+2;}
    } else if(noelle.state==='search'){
      if(state.elapsed-noelle.lastSeenTime>6.0){noelle.state='roam';noelle.idleTimer=.7+Math.random()*1.4;chooseRoamTarget();}
      else {followPath(dt,3.5,noelle.lastSeen);if(noelle.pos.distanceTo(noelle.lastSeen)<.9){noelle.searchTimer+=dt;noelle.speed=0;noelle.yaw+=Math.sin(state.elapsed*2.0)*dt*.7;if(noelle.searchTimer>2.0){noelle.searchTimer=0;noelle.state='roam';chooseRoamTarget();}}}
    } else if(noelle.state==='roam'){
      if(noelle.idleTimer>0){noelle.idleTimer-=dt;noelle.speed=0;noelle.yaw+=Math.sin(state.elapsed*1.3)*dt*.35;}
      else {followPath(dt,1.72,noelle.target);if(noelle.pos.distanceTo(noelle.target)<1.0){noelle.idleTimer=.8+Math.random()*2.2;chooseRoamTarget();}}
    }

    noelle.root.position.set(noelle.pos.x,.06+Math.sin(state.elapsed*2.1)*.06,noelle.pos.z); noelle.root.rotation.y=noelle.yaw+Math.PI;
    const dangerous=noelle.state==='chase'||(state.elapsed<noelle.warnUntil&&noelle.state==='search'); runWarning.classList.toggle('show',dangerous&&!state.hidden&&!state.vision);
    if(!state.hidden&&!state.vision&&noelle.state!=='retreat'&&noelle.attackCooldown<=0&&noelle.pos.distanceTo(player.pos)<.92) triggerJumpscare();
  }

  function triggerJumpscare(){
    if(state.jumpscaring||state.gameOver)return; state.jumpscaring=true; state.paused=true; document.exitPointerLock?.(); scareSound(); jumpscare.classList.add('show'); jumpscare.setAttribute('aria-hidden','false');
    setTimeout(()=>{jumpscare.classList.remove('show');jumpscare.setAttribute('aria-hidden','true');state.jumpscaring=false;defeatGame();},1050);
  }
  function defeatGame(){state.gameOver=true;state.paused=true;hud.classList.add('hidden');runWarning.classList.remove('show');setScreen(defeatScreen,true);try{speechSynthesis.cancel();}catch(_){}}
  function winGame(){state.escaped=true;state.won=true;state.gameOver=true;state.paused=true;updateHud();hud.classList.add('hidden');document.exitPointerLock?.();setScreen(winScreen,true);tone(260,.6,.04,'sine',1.5);}

  function startVision(){
    if(state.hidden){showToast('Из шкафа руна не отвечает.');return;} if(state.runes<=0){showToast('Нужна руна.');return;} if(!noelle.active){showToast('Здесь пока нечего видеть.');return;}
    state.runes--;state.vision=true;state.visionRemaining=5;visionOverlay.classList.remove('hidden');runeSound();updateHud();
  }
  function endVision(){state.vision=false;state.visionRemaining=0;visionOverlay.classList.add('hidden');}
  function updateVision(dt){if(!state.vision)return;state.visionRemaining-=dt;visionTimer.textContent=Math.max(0,state.visionRemaining).toFixed(1);if(state.visionRemaining<=0)endVision();}

  function updatePickups(){
    for(const p of pickups){if(!p.alive||!p.group)continue;p.group.position.y=(p.baseY||.48)+Math.sin(state.elapsed*1.8+(p.phase||0))*.045;p.group.rotation.y+=.006;}
    ringMesh.rotation.z+=.004;
  }
  function updateLamps(){for(const l of lamps){const flick=Math.sin(state.elapsed*7+l.phase)*.03+(Math.random()<.004?-.38:0);l.light.intensity=Math.max(.05,l.base*(1+flick));}}

  function frame(){
    requestAnimationFrame(frame); const raw=Math.min(clock.getDelta(),.05); const dt=(state.started&&!state.paused&&!state.gameOver&&!state.modal&&!state.jumpscaring)?raw:0;
    if(dt>0){state.elapsed+=dt;updatePlayer(dt);updateDoors(dt);updateNoelle(dt);updateVision(dt);updateFlashlight(dt);updatePickups();updateLamps();updateMessages(dt);} else {updateDoors(raw);updateMessages(raw);}
    updateCamera(); if(state.started&&!state.paused&&!state.modal&&!state.gameOver&&!state.vision)findInteraction(); else if(!state.hidden)interactionEl.classList.remove('show'); updateHud(); renderer.render(scene,camera);
  }

  // Input and pointer-lock lifecycle.
  window.addEventListener('keydown',(e)=>{
    keys.add(e.code);
    if(!state.started)return;
    if(e.code==='Escape'){
      if(state.modal==='note'){closeNote();return;}
      if(state.modal==='safe'){closeSafe();return;}
      if(state.vision){endVision();return;}
      // In pointer-lock mode the browser itself releases the mouse on Esc;
      // pointerlockchange below turns that into a pause without immediately toggling back.
      if(state.paused||state.gameOver)return;
      if(document.pointerLockElement===renderer.domElement)return;
      pauseGame(true);
      return;
    }
    if(state.paused||state.modal||state.gameOver||state.jumpscaring)return;
    if(e.code==='KeyF'){if(state.battery<=0){showToast('Фонарик разряжен.');return;}state.flashlightOn=!state.flashlightOn;tone(state.flashlightOn?220:120,.06,.025,'square',.8);}
    if(e.code==='KeyE'&&!state.vision)startVision();
    if(e.code==='KeyQ'&&state.vision)endVision();
  });
  window.addEventListener('keyup',(e)=>keys.delete(e.code));
  window.addEventListener('mousemove',(e)=>{
    if(document.pointerLockElement!==renderer.domElement||state.paused||state.modal||state.gameOver||state.vision||state.hidden)return;
    const s=.00215;state.yaw-=e.movementX*s;state.pitch-=e.movementY*s;state.pitch=THREE.MathUtils.clamp(state.pitch,-1.45,1.45);
  });
  window.addEventListener('mousedown',(e)=>{
    if(e.button!==0||!state.started||state.paused||state.modal||state.gameOver||state.jumpscaring||state.vision)return;
    if(document.pointerLockElement!==renderer.domElement){requestPointer();return;}
    if(state.hidden){exitWardrobe(false);return;}
    interact(state.currentInteractable);
  });
  document.addEventListener('pointerlockchange',()=>{
    if(!state.started||state.gameOver||state.modal||state.jumpscaring)return;
    if(document.pointerLockElement!==renderer.domElement&&!state.paused)pauseGame(true);
  });
  window.addEventListener('blur',()=>{if(state.started&&!state.gameOver&&!state.modal&&!state.jumpscaring)pauseGame(true);});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

  $('startBtn').addEventListener('click',()=>{initAudio();audioCtx?.resume?.();state.started=true;state.paused=false;setScreen(startScreen,false);hud.classList.remove('hidden');updateHud();requestPointer();showToast('Найди в доме увядшую розу.',2.8);});
  $('continueBtn').addEventListener('click',()=>{audioCtx?.resume?.();resumeGame();});
  $('restartBtn').addEventListener('click',()=>location.reload());
  $('restartPauseBtn').addEventListener('click',()=>location.reload());
  $('restartWinBtn').addEventListener('click',()=>location.reload());
  $('closeNoteBtn').addEventListener('click',closeNote);
  $('closeSafeBtn').addEventListener('click',closeSafe);
  $('safeForm').addEventListener('submit',(e)=>{
    e.preventDefault(); const value=safeInput.value.replace(/\D/g,'').slice(0,4); safeInput.value=value;
    if(value.length!==4){safeHint.textContent='Нужно четыре цифры.';tone(80,.08,.03,'square',.7);return;}
    if(value!==SAFE_CODE){safeHint.textContent='Неверный код. Внутри сейфа что-то тихо звякнуло.';tone(70,.18,.05,'square',.6);return;}
    state.safeOpened=true;safeObj.target=1;ringMesh.visible=true;postcardMesh.visible=true;updateHud();tone(120,.35,.05,'triangle',1.7);closeSafe();showToast('Сейф открыт. Внутри два предмета.',2.6);
  });
  safeInput.addEventListener('input',()=>{safeInput.value=safeInput.value.replace(/\D/g,'').slice(0,4);});

  updateHud(); updateCamera(); frame();
})();
