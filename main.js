import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// Slicer & Bubble Generator
import { setupSlicer, getModelHeight, updateSliceSettings, getCurrentMesh, getOriginalMesh, getClippingPlanes, setSliceTarget, setTargetGeometry, restoreOriginalGeometry, setGhostModelOpacity, setBaseMaterialColor } from './src/slicer_v2.js';
import { BubbleGenerator } from './src/bubble_generator.js';

console.log("[MAIN] BubblePrinter Version: 25 (Built-in Models)");

// --- SINGLE SOURCE OF TRUTH (STATE) ---
const AppState = {
  view: {
    ghostOpacity: 0.5,
    ambientLight: 0.5,
    modelLight: 1.0,
    bgBrightness: 10,
    modelColor: '#ffffff'
  },
  slicer: {
    layerCount: 1,
    layerHeight: 0.1
  },
  bubble: {
    enabled: true,
    radius: 0.5,
    minRadius: 0.25,
    maxRadius: 0.75,
    overlapV: 0,
    overlapH: 0,
    baseFlattenPercent: 50,
    arrangement: 'grid',
    sizeMode: 'uniform'
  },
  advanced: {
    shellDepthMultiplier: 1.0,
    innerThreshold: 50,
    outerThreshold: 80,
    gradientExponent: 1.0,
    zGradientStart: 0,
    zGradientEnd: 100,
    resolution: 'medium',
    maxLayers: 100,
    maxBubbles: 10000
  }
};

// Helper to update state is no longer needed; AppState is passed directly.

// DOM Elements
const app = document.querySelector('#app');

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// Grid Helper (Cura Style)
const gridHelper = new THREE.GridHelper(50, 50, 0x008800, 0x444444);
gridHelper.rotation.x = Math.PI / 2;
scene.add(gridHelper);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(20, -20, 20);
camera.up.set(0, 0, 1);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.localClippingEnabled = true;
app.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, AppState.view.ambientLight);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, AppState.view.modelLight);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Light transform controls
const lightTransformControl = new TransformControls(camera, renderer.domElement);
lightTransformControl.addEventListener('dragging-changed', function (event) {
  controls.enabled = !event.value;
});
scene.add(lightTransformControl);

const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 2);
lightHelper.visible = false;
scene.add(lightHelper);

lightTransformControl.addEventListener('change', () => {
  lightHelper.update();
});

// Window Resize Handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

const bubbleGenerator = new BubbleGenerator();

// Event Listeners for UI
const demoModelSelector = document.getElementById('demoModelSelector');

demoModelSelector.addEventListener('change', (e) => {
  const modelUrl = e.target.value;
  if (!modelUrl) return;

  resetBubbleSettings();
  setSliceTarget(null);
  
  setupSlicer(modelUrl, scene, camera, controls, () => {
    if (AppState.bubble.enabled) {
      updateBubbleView();
    }
  });
  
  demoModelSelector.value = "";
});

document.getElementById('uploadBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    setSliceTarget(null);
    setupSlicer(URL.createObjectURL(file), scene, camera, controls, () => {
      if (AppState.bubble.enabled) {
        updateBubbleView();
      }
    });
  }
});

// Slider Counter Logic
const slider = document.getElementById('sliceSlider');
const counter = document.getElementById('sliceCounter');
if (slider && counter) {
  slider.addEventListener('input', (e) => {
    counter.textContent = `Slice ${e.target.value}/${slider.max}`;
  });
}

// --- Layer Settings Docked Panel Logic ---
const layerCountInput = document.getElementById('layerCountInput');
const layerHeightInput = document.getElementById('layerHeightInput');

function syncLayerInputs(source) {
  const height = getModelHeight() || 10;
  
  if (source === 'count') {
    AppState.slicer.layerCount = parseInt(layerCountInput.value) || 1;
    AppState.slicer.layerHeight = height / AppState.slicer.layerCount;
    layerHeightInput.value = AppState.slicer.layerHeight.toFixed(3);
  } else if (source === 'height') {
    AppState.slicer.layerHeight = parseFloat(layerHeightInput.value) || 0.1;
    AppState.slicer.layerCount = Math.round(height / AppState.slicer.layerHeight);
    layerCountInput.value = AppState.slicer.layerCount;
  }
}

if (layerCountInput) layerCountInput.addEventListener('input', () => syncLayerInputs('count'));
if (layerHeightInput) layerHeightInput.addEventListener('input', () => syncLayerInputs('height'));

function applyLayerSettings() {
  if (AppState.slicer.layerCount > 0) {
    updateSliceSettings(AppState.slicer.layerCount);
  } else {
    alert("Layer count must be greater than 0");
  }
}

if (layerCountInput) layerCountInput.addEventListener('change', applyLayerSettings);
if (layerHeightInput) layerHeightInput.addEventListener('change', applyLayerSettings);

// --- Generalized State Binding ---
function bindState(sliderElem, inputElem, stateCategory, stateKey, isFloat, minLimit, maxLimit, onChange) {
  const updateStateAndUI = (val, fromInput = false) => {
    let parsed = isFloat ? parseFloat(val) : parseInt(val);
    if (isNaN(parsed)) return;
    
    if (fromInput && minLimit !== undefined && maxLimit !== undefined) {
        parsed = Math.min(Math.max(parsed, minLimit), maxLimit);
    }
    
    AppState[stateCategory][stateKey] = parsed;
    
    if (sliderElem && sliderElem.value != parsed) sliderElem.value = parsed;
    if (inputElem && inputElem.value != parsed) inputElem.value = isFloat ? parsed.toFixed(2) : parsed;
  };

  const notifyChange = () => {
    if (onChange) onChange();
  };

  if (sliderElem) {
    sliderElem.addEventListener('input', (e) => updateStateAndUI(e.target.value, false));
    if (onChange) sliderElem.addEventListener('change', notifyChange);
  }
  if (inputElem) {
    inputElem.addEventListener('input', (e) => updateStateAndUI(e.target.value, true));
    if (onChange) inputElem.addEventListener('change', notifyChange);
  }
}

// View Settings Bindings
const ghostOpacitySlider = document.getElementById('ghostOpacitySlider');
if (ghostOpacitySlider) {
  ghostOpacitySlider.addEventListener('input', (e) => {
    AppState.view.ghostOpacity = parseInt(e.target.value) / 100;
    setGhostModelOpacity(AppState.view.ghostOpacity);
  });
}

const ambientLightSlider = document.getElementById('ambientLightSlider');
if (ambientLightSlider) {
  ambientLightSlider.addEventListener('input', (e) => {
    AppState.view.ambientLight = parseFloat(e.target.value);
    ambientLight.intensity = AppState.view.ambientLight;
  });
}

const modelLightSlider = document.getElementById('modelLightSlider');
if (modelLightSlider) {
  modelLightSlider.addEventListener('input', (e) => {
    AppState.view.modelLight = parseFloat(e.target.value);
    directionalLight.intensity = AppState.view.modelLight;
  });
}

const moveLightToggle = document.getElementById('moveLightToggle');
if (moveLightToggle) {
  moveLightToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      lightTransformControl.attach(directionalLight);
      lightHelper.visible = true;
    } else {
      lightTransformControl.detach();
      lightHelper.visible = false;
    }
  });
}

const bgBrightnessSlider = document.getElementById('bgBrightnessSlider');
if (bgBrightnessSlider) {
  bgBrightnessSlider.addEventListener('input', (e) => {
    AppState.view.bgBrightness = parseInt(e.target.value);
    const color = Math.floor((AppState.view.bgBrightness / 100) * 255);
    scene.background = new THREE.Color(`rgb(${color}, ${color}, ${color})`);
  });
}

const modelColorInput = document.getElementById('modelColorInput');
if (modelColorInput) {
  modelColorInput.addEventListener('input', (e) => {
    AppState.view.modelColor = e.target.value;
    setBaseMaterialColor(AppState.view.modelColor);
  });
}

// --- Accordion UI Logic ---
document.querySelectorAll('.accordion-header').forEach(button => {
  button.addEventListener('click', () => {
    const item = button.parentElement;
    item.classList.toggle('active');
    const content = item.querySelector('.accordion-content');
    if (item.classList.contains('active')) {
      content.style.display = 'flex';
    } else {
      content.style.display = 'none';
    }
  });
});

// --- Bubble Mode UI Elements ---
const bubbleModeToggle = document.getElementById('bubbleModeToggle');
const bubbleSettingsContainer = document.getElementById('bubbleSettingsContainer');
const bubbleSizeMode = document.getElementById('bubbleSizeMode');
const bubbleArrangement = document.getElementById('bubbleArrangement');

const uniformSizeControl = document.getElementById('uniformSizeControl');
const rangeSizeControl = document.getElementById('rangeSizeControl');
const shellDepthControl = document.getElementById('shellDepthControl');
const adaptiveThresholdsControl = document.getElementById('adaptiveThresholdsControl');
const gradientCurveControl = document.getElementById('gradientCurveControl');
const zAxisRangeControl = document.getElementById('zAxisRangeControl');

// Bubble specific bindState calls
bindState(document.getElementById('bubbleSizeSlider'), document.getElementById('bubbleSizeInput'), 'bubble', 'radius', true, 0.01, 2.0, updateBubbleView);
bindState(document.getElementById('bubbleOverlapVSlider'), document.getElementById('bubbleOverlapVInput'), 'bubble', 'overlapV', false, 0, 70, updateBubbleView);
bindState(document.getElementById('bubbleOverlapHSlider'), document.getElementById('bubbleOverlapHInput'), 'bubble', 'overlapH', false, 0, 70, updateBubbleView);
bindState(document.getElementById('baseFlattenSlider'), document.getElementById('baseFlattenInput'), 'bubble', 'baseFlattenPercent', false, 0, 100, updateBubbleView);

// Advanced specific bindState calls
bindState(document.getElementById('advShellDepthSlider'), document.getElementById('advShellDepthInput'), 'advanced', 'shellDepthMultiplier', true, 1.0, 10.0, updateBubbleView);
bindState(document.getElementById('advInnerThreshSlider'), document.getElementById('advInnerThreshInput'), 'advanced', 'innerThreshold', false, 0, 100, updateBubbleView);
bindState(document.getElementById('advOuterThreshSlider'), document.getElementById('advOuterThreshInput'), 'advanced', 'outerThreshold', false, 0, 100, updateBubbleView);
bindState(document.getElementById('gradientExponentSlider'), document.getElementById('gradientExponentInput'), 'advanced', 'gradientExponent', true, 0.1, 5.0, updateBubbleView);

const advMaxLayersInput = document.getElementById('advMaxLayersInput');
if (advMaxLayersInput) {
  advMaxLayersInput.addEventListener('change', (e) => {
    AppState.advanced.maxLayers = parseInt(e.target.value);

  });
}
const advMaxBubblesInput = document.getElementById('advMaxBubblesInput');
if (advMaxBubblesInput) {
  advMaxBubblesInput.addEventListener('change', (e) => {
    AppState.advanced.maxBubbles = parseInt(e.target.value);

  });
}

const advResolution = document.getElementById('advResolution');
if (advResolution) {
  advResolution.addEventListener('change', (e) => {
    AppState.advanced.resolution = e.target.value;

    updateBubbleView();
  });
}

// Custom Z-range binding
const zRangeStartSlider = document.getElementById('zRangeStartSlider');
const zRangeEndSlider = document.getElementById('zRangeEndSlider');
const zRangeStartInput = document.getElementById('zRangeStartInput');
const zRangeEndInput = document.getElementById('zRangeEndInput');

function updateZRangeBinding(e) {
  let startVal = parseInt(zRangeStartSlider.value);
  let endVal = parseInt(zRangeEndSlider.value);

  if (e && (e.target === zRangeStartInput || e.target === zRangeEndInput)) {
      let val = parseInt(e.target.value);
      if (!isNaN(val)) {
          val = Math.max(0, Math.min(val, 100));
          if (e.target === zRangeStartInput) startVal = val;
          else endVal = val;
      }
  } else {
      if (isNaN(startVal)) startVal = 0;
      if (isNaN(endVal)) endVal = 100;
  }
  
  if (startVal > endVal) {
    if (e && (e.target === zRangeStartSlider || e.target === zRangeStartInput)) {
      startVal = endVal;
    } else {
      endVal = startVal;
    }
  }
  
  AppState.advanced.zGradientStart = startVal;
  AppState.advanced.zGradientEnd = endVal;
  
  if (zRangeStartSlider) zRangeStartSlider.value = startVal;
  if (zRangeEndSlider) zRangeEndSlider.value = endVal;
  if (zRangeStartInput) zRangeStartInput.value = startVal;
  if (zRangeEndInput) zRangeEndInput.value = endVal;
}

if (zRangeStartSlider && zRangeEndSlider) {
  [zRangeStartSlider, zRangeEndSlider].forEach(el => el.addEventListener('input', updateZRangeBinding));
  [zRangeStartInput, zRangeEndInput].forEach(el => el.addEventListener('input', updateZRangeBinding));
  [zRangeStartSlider, zRangeEndSlider, zRangeStartInput, zRangeEndInput].forEach(el => el.addEventListener('change', updateBubbleView));
}

// Custom Min/Max Range binding
const bubbleMinSlider = document.getElementById('bubbleMinSlider');
const bubbleMaxSlider = document.getElementById('bubbleMaxSlider');
const bubbleMinInput = document.getElementById('bubbleMinInput');
const bubbleMaxInput = document.getElementById('bubbleMaxInput');

function updateSizeRangeBinding(e) {
  let minVal = parseFloat(bubbleMinSlider.value);
  let maxVal = parseFloat(bubbleMaxSlider.value);
  
  if (e && (e.target === bubbleMinInput || e.target === bubbleMaxInput)) {
      let val = parseFloat(e.target.value);
      if (!isNaN(val)) {
          val = Math.max(0.01, Math.min(val, 2.0));
          if (e.target === bubbleMinInput) minVal = val;
          else maxVal = val;
      }
  } else {
      if (isNaN(minVal)) minVal = 0.25;
      if (isNaN(maxVal)) maxVal = 0.75;
  }
  
  if (minVal > maxVal) {
    if (e && (e.target === bubbleMinSlider || e.target === bubbleMinInput)) {
      minVal = maxVal;
    } else {
      maxVal = minVal;
    }
  }
  
  AppState.bubble.minRadius = minVal;
  AppState.bubble.maxRadius = maxVal;
  
  if (bubbleMinSlider) bubbleMinSlider.value = minVal;
  if (bubbleMaxSlider) bubbleMaxSlider.value = maxVal;
  if (bubbleMinInput) bubbleMinInput.value = minVal.toFixed(2);
  if (bubbleMaxInput) bubbleMaxInput.value = maxVal.toFixed(2);
}

if (bubbleMinSlider && bubbleMaxSlider) {
  [bubbleMinSlider, bubbleMaxSlider].forEach(el => el.addEventListener('input', updateSizeRangeBinding));
  [bubbleMinInput, bubbleMaxInput].forEach(el => el.addEventListener('input', updateSizeRangeBinding));
  [bubbleMinSlider, bubbleMaxSlider, bubbleMinInput, bubbleMaxInput].forEach(el => el.addEventListener('change', updateBubbleView));
}

if (bubbleModeToggle) {
  bubbleModeToggle.addEventListener('change', (e) => {
    AppState.bubble.enabled = e.target.checked;
    const mesh = getCurrentMesh();
    
    if (AppState.bubble.enabled) {
      bubbleSettingsContainer.style.display = 'block';
      if (mesh) updateBubbleView();
    } else {
      bubbleSettingsContainer.style.display = 'none';
      restoreOriginalGeometry(scene);
    }
  });
}

if (bubbleArrangement) {
  bubbleArrangement.addEventListener('change', (e) => {
    AppState.bubble.arrangement = e.target.value;
    updateBubbleView();
  });
}

if (bubbleSizeMode) {
  bubbleSizeMode.addEventListener('change', (e) => {
    AppState.bubble.sizeMode = e.target.value;
    const mode = AppState.bubble.sizeMode;
    
    if (mode === 'uniform') {
      if (uniformSizeControl) uniformSizeControl.style.display = 'block';
      if (rangeSizeControl) rangeSizeControl.style.display = 'none';
      if (shellDepthControl) shellDepthControl.style.display = 'none';
      if (adaptiveThresholdsControl) adaptiveThresholdsControl.style.display = 'none';
      if (gradientCurveControl) gradientCurveControl.style.display = 'none';
      if (zAxisRangeControl) zAxisRangeControl.style.display = 'none';
    } else if (mode === 'shell_gradient_in') {
      if (uniformSizeControl) uniformSizeControl.style.display = 'none';
      if (rangeSizeControl) rangeSizeControl.style.display = 'block';
      if (shellDepthControl) shellDepthControl.style.display = 'block';
      if (adaptiveThresholdsControl) adaptiveThresholdsControl.style.display = 'none';
      if (gradientCurveControl) gradientCurveControl.style.display = 'block';
      if (zAxisRangeControl) zAxisRangeControl.style.display = 'none';
    } else if (mode === 'adaptive') {
      if (uniformSizeControl) uniformSizeControl.style.display = 'none';
      if (rangeSizeControl) rangeSizeControl.style.display = 'block';
      if (shellDepthControl) shellDepthControl.style.display = 'block';
      if (adaptiveThresholdsControl) adaptiveThresholdsControl.style.display = 'block';
      if (gradientCurveControl) gradientCurveControl.style.display = 'none';
      if (zAxisRangeControl) zAxisRangeControl.style.display = 'none';
    } else {
      // z_gradient_down or z_gradient_up
      if (uniformSizeControl) uniformSizeControl.style.display = 'none';
      if (rangeSizeControl) rangeSizeControl.style.display = 'block';
      if (shellDepthControl) shellDepthControl.style.display = 'none';
      if (adaptiveThresholdsControl) adaptiveThresholdsControl.style.display = 'none';
      if (gradientCurveControl) gradientCurveControl.style.display = 'block';
      if (zAxisRangeControl) zAxisRangeControl.style.display = 'block';
    }
    updateBubbleView();
  });
}

// Reset Function
function resetBubbleSettings() {
  console.log("[MAIN] Resetting bubble settings to defaults...");
  
  // Set State
  AppState.bubble.enabled = true;
  AppState.bubble.radius = 0.5;
  AppState.bubble.minRadius = 0.25;
  AppState.bubble.maxRadius = 0.75;
  AppState.bubble.overlapV = 0;
  AppState.bubble.overlapH = 0;
  AppState.bubble.baseFlattenPercent = 50;
  AppState.bubble.arrangement = 'grid';
  AppState.bubble.sizeMode = 'uniform';
  
  AppState.advanced.gradientExponent = 1.0;
  AppState.advanced.zGradientStart = 0;
  AppState.advanced.zGradientEnd = 100;

  // Sync UI from State
  if (bubbleModeToggle) bubbleModeToggle.checked = AppState.bubble.enabled;
  if (bubbleSettingsContainer) bubbleSettingsContainer.style.display = 'block';

  const setUI = (sliderId, inputId, val, isFloat) => {
    const s = document.getElementById(sliderId);
    const i = document.getElementById(inputId);
    if (s) s.value = val;
    if (i) i.value = isFloat ? val.toFixed(2) : val;
  };

  setUI('bubbleSizeSlider', 'bubbleSizeInput', AppState.bubble.radius, true);
  setUI('bubbleMinSlider', 'bubbleMinInput', AppState.bubble.minRadius, true);
  setUI('bubbleMaxSlider', 'bubbleMaxInput', AppState.bubble.maxRadius, true);
  setUI('bubbleOverlapVSlider', 'bubbleOverlapVInput', AppState.bubble.overlapV, false);
  setUI('bubbleOverlapHSlider', 'bubbleOverlapHInput', AppState.bubble.overlapH, false);
  setUI('baseFlattenSlider', 'baseFlattenInput', AppState.bubble.baseFlattenPercent, false);
  setUI('gradientExponentSlider', 'gradientExponentInput', AppState.advanced.gradientExponent, true);
  
  if (zRangeStartSlider) zRangeStartSlider.value = AppState.advanced.zGradientStart;
  if (zRangeStartInput) zRangeStartInput.value = AppState.advanced.zGradientStart;
  if (zRangeEndSlider) zRangeEndSlider.value = AppState.advanced.zGradientEnd;
  if (zRangeEndInput) zRangeEndInput.value = AppState.advanced.zGradientEnd;

  if (bubbleArrangement) bubbleArrangement.value = AppState.bubble.arrangement;
  if (bubbleSizeMode) {
    bubbleSizeMode.value = AppState.bubble.sizeMode;
    bubbleSizeMode.dispatchEvent(new Event('change'));
  }
  

}

function updateBubbleView() {
  const originalMesh = getOriginalMesh();
  if (!originalMesh) {
    console.warn("Bubble Mode: No original mesh available.");
    return;
  }

  if (AppState.bubble.enabled) {


    const config = AppState.bubble;
    let radius = config.radius;
    let minRadius = config.radius;
    let maxRadius = config.radius;
    
    if (config.sizeMode !== 'uniform') {
        minRadius = config.minRadius;
        maxRadius = config.maxRadius;
        radius = (minRadius + maxRadius) / 2;
    }

    console.log(`[MAIN] Refresh clicked! size=${radius}, min=${minRadius}, max=${maxRadius}, mode=${config.sizeMode}, overlapV=${config.overlapV}, overlapH=${config.overlapH}, flatten=${config.baseFlattenPercent}, arr=${config.arrangement}`);

    // Generate Bubbles from the ORIGINAL geometry using AppState
    const bubbleGeo = bubbleGenerator.generateGeometry(
      originalMesh, 
      AppState.bubble,
      AppState.advanced
    );

    if (bubbleGeo) {
      setTargetGeometry(bubbleGeo, scene, false);
    } else {
      console.warn("Bubble Mode: No geometry generated.");
    }
  }
}

// Automatically load a random test model on startup
setTimeout(() => {
  const demoModels = [
    "./models/cube_simple.obj", 
    "./models/sphere_smooth.obj",
    "./models/cylinder.obj",
    "./models/cone_smooth.obj",
    "./models/pyramid.obj",
    "./models/octahedron.obj",
    "./models/tetrahedron.obj",
    "./models/torus_complex.obj"
  ];
  const randomModel = demoModels[Math.floor(Math.random() * demoModels.length)];
  
  if (demoModelSelector) {
    demoModelSelector.value = randomModel;
    demoModelSelector.dispatchEvent(new Event('change'));
  }
}, 100);
