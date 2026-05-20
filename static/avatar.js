import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from "@pixiv/three-vrm-animation";

const MODEL_URL = "/static/models/4116680507256990981.vrm";
const ANIMATION_CONFIG = {
  greet: {
    url: "/static/animations/VRMA_03.vrma",
    trimStart: 0.2,
    trimEnd: 7.2,
    timeScale: 0.78,
    loop: THREE.LoopOnce,
    fadeOutTo: "idle",
  },
  idle: {
    url: "/static/animations/001_motion_pose.vrma",
    trimStart: 0.1,
    trimEnd: 0.35,
    timeScale: 0.2,
  },
  listening: {
    url: "/static/animations/VRMA_01.vrma",
    trimStart: 0.3,
    trimEnd: 7.8,
    timeScale: 0.62,
  },
  thinking: {
    url: "/static/animations/VRMA_06.vrma",
    trimStart: 0.2,
    trimEnd: 6.2,
    timeScale: 0.72,
  },
  speaking: {
    url: "/static/animations/VRMA_06.vrma",
    trimStart: 0.25,
    trimEnd: 6.4,
    timeScale: 0.68,
  },
  spin: {
    url: "/static/animations/VRMA_05.vrma",
    trimStart: 0.2,
    trimEnd: 3.2,
    timeScale: 0.72,
  },
};
const STATE_LABELS = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

const container = document.getElementById("avatarContainer");
const canvas = document.getElementById("avatarCanvas");
const loading = document.getElementById("avatarLoading");
const stateText = document.getElementById("avatarStateText");

let renderer;
let scene;
let camera;
let clock;
let vrmMixer;
let activeAnimationAction = null;
let activeAnimationState = null;
let hasPlayedGreeting = false;
let idleBlend = 1;
let idleBlendStartTime = 0;
const animationActions = {};
let currentVrm;
let avatarRoot;
let headBone;
let neckBone;
let chestBone;
let hipsBone;
let leftShoulderBone;
let rightShoulderBone;
let leftUpperArmBone;
let rightUpperArmBone;
let leftLowerArmBone;
let rightLowerArmBone;
let leftHandBone;
let rightHandBone;
let leftFingerBones = [];
let rightFingerBones = [];
let leftEarBones = [];
let rightEarBones = [];
let avatarBaseY = -1.08;
let currentState = "idle";
let audioContext;
let analyser;
let analyserData;
let mediaSource;
let connectedAudioElement = null;
let audioEventsBound = false;
let smoothedMouth = 0;
let speechEnergy = 0;
let speechBeat = 0;
let emphasisPulse = 0;
let lastBeatTime = 0;
let nextBlinkTime = 1.8;
let blinkValue = 0;
let nextLookTime = 2.4;
let lookTarget = new THREE.Vector2(0, 0);
let currentLook = new THREE.Vector2(0, 0);
let speechProfile = {
  energy: 0.45,
  gestureRate: 0.8,
  emphasisWords: 0,
  questionLike: false,
};
let gestureBlend = 0;
let gesturePhase = 0;
let gestureTarget = 0;
let gestureHoldUntil = 0;
let smoothGesture = 0;
let nextEarWiggleTime = 2.8;
let earWiggleUntil = 0;

init();

window.voiceAvatar = {
  setState,
  connectAudio,
  setSpeechText,
};

function init() {
  if (!container || !canvas) {
    return;
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d12);
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 1.45, 3.2);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.74;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

  addLights();
  addStage();
  resize();
  window.addEventListener("resize", resize);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  loader.load(
    MODEL_URL,
    (gltf) => {
      currentVrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(currentVrm.scene);
      VRMUtils.combineSkeletons(currentVrm.scene);
      VRMUtils.rotateVRM0(currentVrm);

      avatarRoot = currentVrm.scene;
      avatarRoot.position.set(0, 0, 0);
      avatarRoot.scale.setScalar(1);
      avatarRoot.traverse((node) => {
        node.frustumCulled = false;

        if (node.isMesh && node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach((material) => {
            material.side = THREE.DoubleSide;
            material.needsUpdate = true;
          });
        }
      });
      scene.add(avatarRoot);

      fitAvatarToView();
      bindVrmBones();
      loadVrmAnimations();
      setState("idle");

      if (loading) {
        loading.classList.add("hidden");
      }
    },
    undefined,
    (error) => {
      console.error(error);
      if (loading) {
        loading.textContent = "Không tải được avatar VRM.";
      }
    }
  );

  renderer.setAnimationLoop(render);
}

function addLights() {
  const key = new THREE.DirectionalLight(0xffffff, 1.28);
  key.position.set(2.5, 4.5, 3.5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x78d7c4, 0.42);
  fill.position.set(-3, 2.2, 2.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xf2c166, 0.68);
  rim.position.set(0, 3, -3.2);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0xb8fff2, 0x182033, 0.58));
}

function addStage() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 96),
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.72,
      metalness: 0.08,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.08;
  scene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.72, 0.012, 12, 128),
    new THREE.MeshBasicMaterial({ color: 0x78d7c4, transparent: true, opacity: 0.42 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.04;
  ring.name = "stateRing";
  scene.add(ring);
}

function bindVrmBones() {
  const humanoid = currentVrm?.humanoid;
  headBone = humanoid?.getNormalizedBoneNode("head") || null;
  neckBone = humanoid?.getNormalizedBoneNode("neck") || null;
  chestBone = humanoid?.getNormalizedBoneNode("chest") || null;
  hipsBone = humanoid?.getNormalizedBoneNode("hips") || null;
  leftShoulderBone = humanoid?.getNormalizedBoneNode("leftShoulder") || null;
  rightShoulderBone = humanoid?.getNormalizedBoneNode("rightShoulder") || null;
  leftUpperArmBone = humanoid?.getNormalizedBoneNode("leftUpperArm") || null;
  rightUpperArmBone = humanoid?.getNormalizedBoneNode("rightUpperArm") || null;
  leftLowerArmBone = humanoid?.getNormalizedBoneNode("leftLowerArm") || null;
  rightLowerArmBone = humanoid?.getNormalizedBoneNode("rightLowerArm") || null;
  leftHandBone = humanoid?.getNormalizedBoneNode("leftHand") || null;
  rightHandBone = humanoid?.getNormalizedBoneNode("rightHand") || null;
  leftFingerBones = collectFingerBones("left");
  rightFingerBones = collectFingerBones("right");
  leftEarBones = collectEarBones("L");
  rightEarBones = collectEarBones("R");
}

function collectFingerBones(side) {
  const humanoid = currentVrm?.humanoid;

  if (!humanoid) {
    return [];
  }

  return [
    `${side}ThumbProximal`,
    `${side}ThumbIntermediate`,
    `${side}ThumbDistal`,
    `${side}IndexProximal`,
    `${side}IndexIntermediate`,
    `${side}IndexDistal`,
    `${side}MiddleProximal`,
    `${side}MiddleIntermediate`,
    `${side}MiddleDistal`,
    `${side}RingProximal`,
    `${side}RingIntermediate`,
    `${side}RingDistal`,
    `${side}LittleProximal`,
    `${side}LittleIntermediate`,
    `${side}LittleDistal`,
  ].map((name) => humanoid.getNormalizedBoneNode(name)).filter(Boolean);
}

function collectEarBones(sideSuffix) {
  if (!avatarRoot) {
    return [];
  }

  const bones = [];
  const sidePattern = new RegExp(`_${sideSuffix}(?:_|$)`, "i");

  avatarRoot.traverse((node) => {
    if (!node.isBone || !node.name) {
      return;
    }

    const name = node.name;
    const isEarBone = /joint_(?:Sp_He_)?Ear/i.test(name);
    const isHandle = /Handle/i.test(name);
    const isEyeTear = /Eye_tear/i.test(name);

    if (isEarBone && sidePattern.test(name) && !isHandle && !isEyeTear) {
      bones.push(node);
    }
  });

  return bones;
}

function fitAvatarToView() {
  if (!avatarRoot) {
    return;
  }

  avatarRoot.updateMatrixWorld(true);

  const initialBox = new THREE.Box3().setFromObject(avatarRoot);
  const initialSize = initialBox.getSize(new THREE.Vector3());

  if (!Number.isFinite(initialSize.y) || initialSize.y <= 0) {
    avatarRoot.position.set(0, avatarBaseY, 0);
    camera.position.set(0, 0.55, 3.2);
    camera.lookAt(0, 0.45, 0);
    return;
  }

  const targetHeight = 2.25;
  const scale = targetHeight / initialSize.y;
  avatarRoot.scale.setScalar(scale);
  avatarRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(avatarRoot);
  const center = box.getCenter(new THREE.Vector3());
  const desiredBottomY = -1.08;

  avatarRoot.position.x -= center.x;
  avatarRoot.position.z -= center.z;
  avatarRoot.position.y += desiredBottomY - box.min.y;
  avatarRoot.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(avatarRoot);
  const fittedSize = fittedBox.getSize(new THREE.Vector3());
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
  const targetY = fittedBox.min.y + fittedSize.y * 0.58;
  const distance = Math.max(2.3, fittedSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) * 0.86);

  avatarBaseY = avatarRoot.position.y;
  camera.position.set(0, targetY, fittedCenter.z + distance);
  camera.lookAt(0, targetY, fittedCenter.z);
  camera.near = 0.01;
  camera.far = Math.max(100, distance * 6);
  camera.updateProjectionMatrix();
}

function setState(nextState = "idle") {
  currentState = STATE_LABELS[nextState] ? nextState : "idle";
  document.body.dataset.avatarState = currentState;

  if (stateText) {
    stateText.textContent = STATE_LABELS[currentState];
  }

  playStateAnimation(currentState);
}

function setSpeechText(text = "") {
  const normalized = text.toLowerCase();
  const emphasisWords = [
    "thứ nhất",
    "thứ hai",
    "thứ ba",
    "kết luận",
    "quan trọng",
    "cần lưu ý",
    "nguyên nhân",
    "vì vậy",
    "do đó",
    "mặt khác",
  ].filter((word) => normalized.includes(word)).length;

  speechProfile = {
    energy: THREE.MathUtils.clamp(text.length / 900, 0.28, 0.85),
    gestureRate: THREE.MathUtils.clamp(text.split(/\s+/).length / 120, 0.65, 1.35),
    emphasisWords,
    questionLike: /[?？]|vì sao|tại sao|như thế nào|phân tích/.test(normalized),
  };
}

async function loadVrmAnimations() {
  if (!currentVrm) {
    return;
  }

  vrmMixer = new THREE.AnimationMixer(currentVrm.scene);

  await Promise.all(
    Object.entries(ANIMATION_CONFIG).map(async ([state, config]) => {
      try {
        const rawClip = await loadVrmAnimationClip(config.url);
        const clip = trimAnimationClip(
          rawClip,
          config.trimStart ?? 0,
          config.trimEnd ?? rawClip.duration,
          state
        );
        const action = vrmMixer.clipAction(clip);
        action.enabled = true;
        action.clampWhenFinished = false;
        action.loop = config.loop || THREE.LoopPingPong;
        action.repetitions = Infinity;
        if (config.loop === THREE.LoopOnce) {
          action.repetitions = 1;
          action.clampWhenFinished = true;
        }
        animationActions[state] = action;
      } catch (error) {
        console.warn(`Cannot load VRMA for ${state}: ${config.url}`, error);
      }
    })
  );

  playStateAnimation(currentState);
  playGreetingOnce();
}

function loadVrmAnimationClip(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    loader.load(
      url,
      (gltf) => {
        const vrmAnimation = gltf.userData.vrmAnimations?.[0];

        if (!vrmAnimation) {
          reject(new Error("No VRMAnimation found in file."));
          return;
        }

        resolve(createVRMAnimationClip(vrmAnimation, currentVrm));
      },
      undefined,
      reject
    );
  });
}

function trimAnimationClip(clip, startTime, endTime, name) {
  const safeStart = THREE.MathUtils.clamp(startTime, 0, Math.max(0, clip.duration - 0.1));
  const safeEnd = THREE.MathUtils.clamp(endTime, safeStart + 0.1, clip.duration);
  const duration = safeEnd - safeStart;
  const tracks = clip.tracks.map((track) => {
    const valueSize = track.getValueSize();
    const times = [];
    const values = [];
    const addKey = (time, sourceIndex) => {
      times.push(time);

      for (let j = 0; j < valueSize; j += 1) {
        values.push(track.values[sourceIndex * valueSize + j]);
      }
    };
    const startIndex = findNearestKeyIndex(track.times, safeStart);
    const endIndex = findNearestKeyIndex(track.times, safeEnd);

    addKey(0, startIndex);

    for (let i = 0; i < track.times.length; i += 1) {
      const time = track.times[i];

      if (time <= safeStart || time >= safeEnd) {
        continue;
      }

      times.push(time - safeStart);

      for (let j = 0; j < valueSize; j += 1) {
        values.push(track.values[i * valueSize + j]);
      }
    }

    addKey(duration, endIndex);

    return new track.constructor(track.name, times, values, track.getInterpolation());
  });

  return new THREE.AnimationClip(`${clip.name || name}_trimmed`, duration, tracks);
}

function findNearestKeyIndex(times, targetTime) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < times.length; i += 1) {
    const distance = Math.abs(times[i] - targetTime);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }

  return nearestIndex;
}

function playStateAnimation(state) {
  const nextAction = animationActions[state] || animationActions.idle;

  if (!nextAction && state === "idle") {
    if (activeAnimationAction) {
      activeAnimationAction.fadeOut(0.35);
    }

    activeAnimationAction = null;
    activeAnimationState = "idle";
    idleBlend = 0;
    idleBlendStartTime = clock?.elapsedTime || 0;
    return;
  }

  if (!nextAction || nextAction === activeAnimationAction) {
    return;
  }

  nextAction.reset();
  nextAction.enabled = true;
  nextAction.setEffectiveTimeScale(1);
  nextAction.setEffectiveWeight(1);
  nextAction.fadeIn(0.35);
  nextAction.play();

  if (activeAnimationAction) {
    activeAnimationAction.fadeOut(0.35);
  }

  activeAnimationAction = nextAction;
  activeAnimationState = state;
}

function playGreetingOnce() {
  if (hasPlayedGreeting || !animationActions.greet) {
    return;
  }

  hasPlayedGreeting = true;
  playStateAnimation("greet");
}

function updateVrmAnimation(delta) {
  if (!vrmMixer) {
    return;
  }

  vrmMixer.update(delta);

  const config = ANIMATION_CONFIG[activeAnimationState];
  if (
    config?.fadeOutTo &&
    activeAnimationAction &&
    activeAnimationAction.time >= activeAnimationAction.getClip().duration - 0.05
  ) {
    playStateAnimation(config.fadeOutTo);
  }
}

function connectAudio(audioElement) {
  if (!audioElement) {
    return;
  }

  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    analyser = analyser || audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyserData = new Uint8Array(analyser.frequencyBinCount);

    if (!mediaSource) {
      mediaSource = audioContext.createMediaElementSource(audioElement);
      mediaSource.connect(analyser);
      analyser.connect(audioContext.destination);
    }

    bindAudioEvents(audioElement);
  } catch (error) {
    bindAudioEvents(audioElement);
  }
}

function bindAudioEvents(audioElement) {
  if (audioEventsBound && connectedAudioElement === audioElement) {
    return;
  }

  connectedAudioElement = audioElement;
  audioEventsBound = true;

  audioElement.addEventListener("play", () => {
    audioContext?.resume();
    setState("speaking");
  });
  audioElement.addEventListener("ended", () => setState("idle"));
  audioElement.addEventListener("pause", () => {
    if (audioElement.ended) {
      setState("idle");
    }
  });
}

function render() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  updateVrmAnimation(delta);
  updateSpeechSignals(elapsed);
  updateBodyMotion(elapsed);
  updateExpressions(elapsed);
  currentVrm?.update(delta);
  resize();
  renderer.render(scene, camera);
}

function updateSpeechSignals(elapsed) {
  let level = 0;

  if (currentState === "speaking" && analyser && analyserData) {
    analyser.getByteFrequencyData(analyserData);
    const sum = analyserData.reduce((total, value) => total + value, 0);
    level = Math.min(1, sum / analyserData.length / 115);
  }

  smoothedMouth += (level - smoothedMouth) * 0.32;
  speechEnergy += (level - speechEnergy) * 0.18;
  speechBeat = Math.max(0, speechBeat - 0.055);
  emphasisPulse = Math.max(0, emphasisPulse - 0.035);

  if (currentState === "speaking" && level > 0.42 && elapsed - lastBeatTime > 0.34) {
    speechBeat = THREE.MathUtils.clamp(level, 0.35, 1);
    lastBeatTime = elapsed;

    if (speechProfile.emphasisWords > 0 || level > 0.68) {
      emphasisPulse = Math.max(emphasisPulse, speechBeat);
    }
  }
}

function updateBodyMotion(elapsed) {
  if (!avatarRoot) {
    return;
  }

  if (activeAnimationAction) {
    updateAnimatedStateOverlay(elapsed);
    updateStageRing(elapsed);
    return;
  }

  const thinking = currentState === "thinking";
  const listening = currentState === "listening";
  const speaking = currentState === "speaking";
  const breath = Math.sin(elapsed * 1.9);
  const speechMotion = speaking ? speechEnergy * speechProfile.energy : 0;
  const emphasis = speaking ? emphasisPulse : 0;

  avatarRoot.position.y = avatarBaseY + breath * (thinking ? 0.018 : 0.01) + emphasis * 0.012;

  if (hipsBone) {
    hipsBone.rotation.y = Math.sin(elapsed * 0.85) * 0.025 + speechMotion * 0.025;
  }

  if (chestBone) {
    chestBone.rotation.x = breath * 0.018 - emphasis * 0.045;
    chestBone.rotation.z = Math.sin(elapsed * 0.7) * 0.018 + speechMotion * 0.04;
  }

  if (currentState === "idle") {
    applyIdleAkimboPose(elapsed);
  } else {
    applyRelaxedArmPose(elapsed);
  }

  if (neckBone) {
    neckBone.rotation.x = thinking
      ? -0.06 + Math.sin(elapsed * 1.3) * 0.018
      : -speechMotion * 0.035;
  }

  if (headBone) {
    const questionTilt = speechProfile.questionLike && listening ? 0.08 : 0;
    const nod = speaking ? Math.sin(elapsed * 7.4 * speechProfile.gestureRate) * speechEnergy * 0.09 : 0;
    const beatNod = speaking ? speechBeat * 0.055 : 0;
    headBone.rotation.y = listening
      ? Math.sin(elapsed * 2.1) * 0.13 + currentLook.x
      : Math.sin(elapsed * 0.9) * 0.045 + currentLook.x + speechMotion * 0.05;
    headBone.rotation.x = speaking
      ? Math.sin(elapsed * 2.5) * 0.025 - nod - beatNod + currentLook.y
      : thinking
        ? -0.08
        : currentLook.y;
    headBone.rotation.z = Math.sin(elapsed * 1.2) * 0.025 + questionTilt;
  }

  updateStageRing(elapsed);
}

function applyIdleAkimboPose(elapsed) {
  idleBlend = Math.min(1, idleBlend + 0.028);

  const breath = Math.sin(elapsed * 1.65);
  const sway = Math.sin(elapsed * 0.72) * 0.012;
  const lean = 0.08 * idleBlend;
  const armEase = idleBlend;

  if (hipsBone) {
    hipsBone.rotation.y = THREE.MathUtils.lerp(hipsBone.rotation.y, 0.08 + sway, armEase);
    hipsBone.rotation.z = THREE.MathUtils.lerp(hipsBone.rotation.z, -0.045, armEase);
  }

  if (chestBone) {
    chestBone.rotation.x = THREE.MathUtils.lerp(chestBone.rotation.x, breath * 0.012, armEase);
    chestBone.rotation.y = THREE.MathUtils.lerp(chestBone.rotation.y, -0.055, armEase);
    chestBone.rotation.z = THREE.MathUtils.lerp(chestBone.rotation.z, 0.055 + sway, armEase);
  }

  if (neckBone) {
    neckBone.rotation.x = THREE.MathUtils.lerp(neckBone.rotation.x, -0.01, armEase);
    neckBone.rotation.z = THREE.MathUtils.lerp(neckBone.rotation.z, -0.018, armEase);
  }

  if (headBone) {
    headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, currentLook.y - 0.01, armEase);
    headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, currentLook.x - 0.035, armEase);
    headBone.rotation.z = THREE.MathUtils.lerp(headBone.rotation.z, -0.035 + sway, armEase);
  }

  avatarRoot.rotation.z = THREE.MathUtils.lerp(avatarRoot.rotation.z, lean * 0.12, armEase);

  if (leftShoulderBone) {
    lerpBoneRotation(leftShoulderBone, 0.025 + breath * 0.004, 0.015, -0.035 + sway, armEase);
  }

  if (rightShoulderBone) {
    lerpBoneRotation(rightShoulderBone, 0.065 - breath * 0.004, -0.035, 0.075 - sway, armEase);
  }

  if (leftUpperArmBone) {
    lerpBoneRotation(leftUpperArmBone, 0.13 + breath * 0.006, 0.015, 1.24 + sway, armEase);
  }

  if (rightUpperArmBone) {
    lerpBoneRotation(rightUpperArmBone, 0.24 - breath * 0.006, -0.1, -0.95 - sway, armEase);
  }

  if (leftLowerArmBone) {
    lerpBoneRotation(leftLowerArmBone, 0.035, 0.015, 0.08 + breath * 0.008, armEase);
  }

  if (rightLowerArmBone) {
    lerpBoneRotation(rightLowerArmBone, 0.08, -0.08, -0.58 - breath * 0.01, armEase);
  }

  if (leftHandBone) {
    lerpBoneRotation(leftHandBone, -0.055, 0.015, 0.035, armEase);
  }

  if (rightHandBone) {
    lerpBoneRotation(rightHandBone, -0.08, -0.04, -0.24, armEase);
  }

  poseFingerSet(leftFingerBones, 0.18, 1);
  poseFingerSet(rightFingerBones, 0.16, -1);
  updateEarWiggle(elapsed);
}

function lerpBoneRotation(bone, x, y, z, alpha) {
  bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, x, alpha);
  bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, y, alpha);
  bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, z, alpha);
}

function updateEarWiggle(elapsed) {
  if (!leftEarBones.length && !rightEarBones.length) {
    return;
  }

  if (elapsed > nextEarWiggleTime) {
    earWiggleUntil = elapsed + 0.72;
    nextEarWiggleTime = elapsed + THREE.MathUtils.randFloat(4.5, 8.5);
  }

  const active = elapsed < earWiggleUntil;
  const progress = active ? 1 - ((earWiggleUntil - elapsed) / 0.72) : 1;
  const envelope = active ? Math.sin(progress * Math.PI) : 0;
  const wiggle = Math.sin(elapsed * 24) * envelope * 0.16;
  const softTilt = Math.sin(elapsed * 1.25) * 0.018;

  leftEarBones.forEach((bone, index) => {
    const falloff = 1 - index * 0.18;
    bone.rotation.z = softTilt + wiggle * falloff;
    bone.rotation.x = wiggle * 0.28 * falloff;
  });

  rightEarBones.forEach((bone, index) => {
    const falloff = 1 - index * 0.18;
    bone.rotation.z = -softTilt - wiggle * falloff;
    bone.rotation.x = wiggle * 0.28 * falloff;
  });
}

function updateAnimatedStateOverlay(elapsed) {
  const speaking = currentState === "speaking";
  const thinking = currentState === "thinking";
  const listening = currentState === "listening";
  const speechMotion = speaking ? speechEnergy * speechProfile.energy : 0;

  avatarRoot.position.y = avatarBaseY + Math.sin(elapsed * 1.9) * 0.006;

  if (activeAnimationAction) {
    const baseTimeScale = ANIMATION_CONFIG[activeAnimationState]?.timeScale ?? 0.68;
    activeAnimationAction.timeScale = speaking
      ? THREE.MathUtils.clamp(baseTimeScale + speechEnergy * 0.18, 0.58, 0.88)
      : thinking
        ? baseTimeScale
        : baseTimeScale;
  }

  if (neckBone) {
    neckBone.rotation.x += thinking ? -0.035 : -speechMotion * 0.018;
  }

  if (headBone) {
    const nod = speaking ? Math.sin(elapsed * 6.4 * speechProfile.gestureRate) * speechEnergy * 0.035 : 0;
    headBone.rotation.x += -nod + currentLook.y;
    headBone.rotation.y += (listening ? Math.sin(elapsed * 1.8) * 0.06 : 0) + currentLook.x;
  }
}

function updateStageRing(elapsed) {
  const ring = scene.getObjectByName("stateRing");

  if (!ring) {
    return;
  }

  const colors = {
    idle: 0x78d7c4,
    listening: 0xf07178,
    thinking: 0xf2c166,
    speaking: 0x8bd3ff,
  };
  ring.material.color.setHex(colors[currentState] || colors.idle);
  ring.material.opacity = 0.3 + Math.sin(elapsed * 2.4) * 0.08;
  ring.rotation.z += 0.004;
}

function applyRelaxedArmPose(elapsed) {
  const listenLift = currentState === "listening" ? 0.08 : 0;
  const speaking = currentState === "speaking";
  updateGestureEnvelope(elapsed, speaking);

  gestureBlend += ((speaking ? 1 : 0) - gestureBlend) * 0.055;
  const emphasis = speaking ? emphasisPulse * 0.32 : 0;
  const sway = Math.sin(elapsed * 1.15) * 0.012;
  const micro = Math.sin(elapsed * 2.3 * speechProfile.gestureRate) * 0.018 * gestureBlend;
  const explain = smoothGesture * (0.16 + speechEnergy * 0.18);
  const leftOpen = explain * (0.55 + Math.sin(gesturePhase + 0.8) * 0.18);
  const rightOpen = explain * (0.55 + Math.sin(gesturePhase + 2.2) * 0.18);

  if (leftShoulderBone) {
    leftShoulderBone.rotation.set(
      0.025 + listenLift * 0.45 + explain * 0.035,
      0.015 + leftOpen * 0.035,
      -0.055 + sway
    );
  }

  if (rightShoulderBone) {
    rightShoulderBone.rotation.set(
      0.025 + listenLift * 0.45 + explain * 0.035,
      -0.015 - rightOpen * 0.035,
      0.055 - sway
    );
  }

  if (leftUpperArmBone) {
    leftUpperArmBone.rotation.set(
      0.2 + listenLift * 0.6 + explain * 0.16 + micro + emphasis * 0.04,
      0.045 - leftOpen * 0.045,
      1.18 + sway - leftOpen * 0.11 - emphasis * 0.035
    );
  }

  if (rightUpperArmBone) {
    rightUpperArmBone.rotation.set(
      0.2 + listenLift * 0.6 + explain * 0.16 - micro + emphasis * 0.04,
      -0.045 + rightOpen * 0.045,
      -1.18 - sway + rightOpen * 0.11 + emphasis * 0.035
    );
  }

  if (leftLowerArmBone) {
    leftLowerArmBone.rotation.set(
      0.06 + explain * 0.1 + emphasis * 0.035,
      0.025 + leftOpen * 0.055,
      0.32 + leftOpen * 0.16 + emphasis * 0.055
    );
  }

  if (rightLowerArmBone) {
    rightLowerArmBone.rotation.set(
      0.06 + explain * 0.1 + emphasis * 0.035,
      -0.025 - rightOpen * 0.055,
      -0.32 - rightOpen * 0.16 - emphasis * 0.055
    );
  }

  if (leftHandBone) {
    leftHandBone.rotation.set(
      -0.04 - explain * 0.035 + Math.sin(elapsed * 2.6) * gestureBlend * 0.008,
      0.04 + leftOpen * 0.055,
      0.035 + leftOpen * 0.045
    );
  }

  if (rightHandBone) {
    rightHandBone.rotation.set(
      -0.04 - explain * 0.035 + Math.sin(elapsed * 2.5 + 0.7) * gestureBlend * 0.008,
      -0.04 - rightOpen * 0.055,
      -0.035 - rightOpen * 0.045
    );
  }

  applyFingerPose(elapsed, explain, emphasis);
}

function updateGestureEnvelope(elapsed, speaking) {
  if (!speaking) {
    gestureTarget = 0;
    smoothGesture += (0 - smoothGesture) * 0.06;
    return;
  }

  if (elapsed > gestureHoldUntil) {
    gestureTarget = THREE.MathUtils.randFloat(0.22, 0.55) * speechProfile.energy;
    gestureHoldUntil = elapsed + THREE.MathUtils.randFloat(1.2, 2.4) / speechProfile.gestureRate;
  }

  const audioLift = THREE.MathUtils.clamp(speechEnergy * 0.32 + emphasisPulse * 0.18, 0, 0.32);
  smoothGesture += (gestureTarget + audioLift - smoothGesture) * 0.035;
  smoothGesture = THREE.MathUtils.clamp(smoothGesture, 0, 0.62);
  gesturePhase += 0.028 * speechProfile.gestureRate + speechEnergy * 0.012;
}

function applyFingerPose(elapsed, explain, emphasis) {
  const fingerWave = Math.sin(elapsed * 3.8 * speechProfile.gestureRate) * 0.018;
  const leftCurl = THREE.MathUtils.clamp(0.16 + fingerWave - explain * 0.04 + emphasis * 0.025, 0.08, 0.26);
  const rightCurl = THREE.MathUtils.clamp(0.15 - fingerWave - explain * 0.035 + emphasis * 0.025, 0.08, 0.26);

  poseFingerSet(leftFingerBones, leftCurl, 1);
  poseFingerSet(rightFingerBones, rightCurl, -1);
}

function poseFingerSet(bones, curl, sideSign) {
  bones.forEach((bone) => {
    const name = bone.name.toLowerCase();
    const isThumb = name.includes("thumb");
    const isTip = name.includes("distal");

    if (isThumb) {
      bone.rotation.set(curl * 0.2, sideSign * (0.06 + curl * 0.12), sideSign * curl * 0.08);
      return;
    }

    bone.rotation.set(curl * (isTip ? 0.28 : 0.45), 0, sideSign * curl * 0.035);
  });
}

function updateExpressions(elapsed) {
  const expressionManager = currentVrm?.expressionManager;

  if (!expressionManager) {
    return;
  }

  updateBlinkAndLook(elapsed);

  expressionManager.setValue("aa", smoothedMouth);
  expressionManager.setValue("ih", smoothedMouth * 0.28);
  expressionManager.setValue("ou", smoothedMouth * 0.18);
  expressionManager.setValue("blink", blinkValue);

  if (currentState === "speaking") {
    expressionManager.setValue("happy", THREE.MathUtils.clamp(speechEnergy * 0.18, 0, 0.16));
  } else {
    expressionManager.setValue("happy", 0);
  }

  expressionManager.update();
}

function updateBlinkAndLook(elapsed) {
  if (elapsed > nextBlinkTime) {
    blinkValue = 1;
    nextBlinkTime = elapsed + THREE.MathUtils.randFloat(2.2, 5.6);
  } else {
    blinkValue = Math.max(0, blinkValue - 0.18);
  }

  if (elapsed > nextLookTime) {
    const lookScale = currentState === "listening" ? 1.25 : 1;
    lookTarget.set(
      THREE.MathUtils.randFloat(-0.035, 0.035) * lookScale,
      THREE.MathUtils.randFloat(-0.018, 0.02) * lookScale
    );
    nextLookTime = elapsed + THREE.MathUtils.randFloat(1.5, 3.8);
  }

  currentLook.lerp(lookTarget, 0.045);
}

function resize() {
  if (!container || !renderer || !camera) {
    return;
  }

  const width = container.clientWidth || 1;
  const height = container.clientHeight || 1;
  const size = renderer.getSize(new THREE.Vector2());

  if (size.width !== width || size.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}
