import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// Slicer & Bubble Generator
import { setupSlicer, getModelHeight, updateSliceSettings, getCurrentMesh, getOriginalMesh, getClippingPlanes, setSliceTarget, setTargetGeometry, restoreOriginalGeometry, setGhostModelOpacity, setBaseMaterialColor, setBubbleData, visualizationConfig } from './src/slicer_v2.js';
import { BubbleGenerator } from './src/bubble_generator.js';

// Post-processing for Ambient Occlusion
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';

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
    poissonRadius: 0.5,
    lloydIterations: 0,
    jitterPercent: 0,
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
  },
  visualization: {
    mode: 'spheres',
    heatmap: 'none',
    heatmapPalette: 'jet',
    ao: 'none',
    densityRadius: 1.5,
    centerSize: 0.10
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
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 150);
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

// New bindings
bindState(document.getElementById('poissonRadiusSlider'), document.getElementById('poissonRadiusInput'), 'bubble', 'poissonRadius', true, 0.05, 2.0, updateBubbleView);
bindState(document.getElementById('lloydIterationsSlider'), document.getElementById('lloydIterationsInput'), 'bubble', 'lloydIterations', false, 0, 20, updateBubbleView);
bindState(document.getElementById('jitterSlider'), document.getElementById('jitterInput'), 'bubble', 'jitterPercent', false, 0, 100, updateBubbleView);

// Advanced specific bindState calls
bindState(document.getElementById('advShellDepthSlider'), document.getElementById('advShellDepthInput'), 'advanced', 'shellDepthMultiplier', true, 1.0, 10.0, updateBubbleView);
bindState(document.getElementById('advInnerThreshSlider'), document.getElementById('advInnerThreshInput'), 'advanced', 'innerThreshold', false, 0, 100, updateBubbleView);
bindState(document.getElementById('advOuterThreshSlider'), document.getElementById('advOuterThreshInput'), 'advanced', 'outerThreshold', false, 0, 100, updateBubbleView);
bindState(document.getElementById('gradientExponentSlider'), document.getElementById('gradientExponentInput'), 'advanced', 'gradientExponent', true, 0.1, 5.0, updateBubbleView);

// Visualization specific bindState calls
bindState(document.getElementById('visDensityRadiusSlider'), document.getElementById('visDensityRadiusInput'), 'visualization', 'densityRadius', true, 0.5, 5.0, updateBubbleView);
bindState(document.getElementById('visCenterSizeSlider'), document.getElementById('visCenterSizeInput'), 'visualization', 'centerSize', true, 0.02, 0.5, updateBubbleView);

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

function restoreSizeControls(mode) {
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
}

function updateControlVisibility() {
  const arrangement = AppState.bubble.arrangement;
  const sizeMode = AppState.bubble.sizeMode;

  const poissonRadiusControl = document.getElementById('poissonRadiusControl');
  const lloydIterationsControl = document.getElementById('lloydIterationsControl');
  const jitterControl = document.getElementById('jitterControl');
  
  const sizeModeSelect = document.getElementById('bubbleSizeMode');
  const sizeModeGroup = sizeModeSelect ? sizeModeSelect.closest('.setting-group') : null;



  if (arrangement === 'poisson') {
    if (poissonRadiusControl) poissonRadiusControl.style.display = 'block';
    if (lloydIterationsControl) lloydIterationsControl.style.display = 'block';
    if (jitterControl) jitterControl.style.display = 'none';
    if (sizeModeGroup) sizeModeGroup.style.display = 'block';

    restoreSizeControls(sizeMode);
  } else if (arrangement === 'rejection') {
    if (poissonRadiusControl) poissonRadiusControl.style.display = 'none';
    if (lloydIterationsControl) lloydIterationsControl.style.display = 'block';
    if (jitterControl) jitterControl.style.display = 'none';
    if (sizeModeGroup) sizeModeGroup.style.display = 'block';
    
    restoreSizeControls(sizeMode);
  } else if (arrangement === 'grid' || arrangement === 'oranges') {
    if (poissonRadiusControl) poissonRadiusControl.style.display = 'none';
    if (lloydIterationsControl) lloydIterationsControl.style.display = 'none';
    if (jitterControl) jitterControl.style.display = 'block';
    if (sizeModeGroup) sizeModeGroup.style.display = 'block';
    
    restoreSizeControls(sizeMode);
  }
}

if (bubbleArrangement) {
  bubbleArrangement.addEventListener('change', (e) => {
    AppState.bubble.arrangement = e.target.value;
    updateControlVisibility();
    updateBubbleView();
  });
}

if (bubbleSizeMode) {
  bubbleSizeMode.addEventListener('change', (e) => {
    AppState.bubble.sizeMode = e.target.value;
    updateControlVisibility();
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
  AppState.bubble.poissonRadius = 0.5;
  AppState.bubble.lloydIterations = 0;
  AppState.bubble.jitterPercent = 0;
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
  setUI('poissonRadiusSlider', 'poissonRadiusInput', AppState.bubble.poissonRadius, true);
  setUI('lloydIterationsSlider', 'lloydIterationsInput', AppState.bubble.lloydIterations, false);
  setUI('jitterSlider', 'jitterInput', AppState.bubble.jitterPercent, false);
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
  }
  
  // Reset visualization settings
  AppState.visualization = {
    mode: 'spheres',
    heatmap: 'none',
    heatmapPalette: 'jet',
    ao: 'none',
    densityRadius: 1.5,
    centerSize: 0.10
  };
  
  const visRenderMode = document.getElementById('visRenderMode');
  const visHeatmapMode = document.getElementById('visHeatmapMode');
  const visPalette = document.getElementById('visPalette');
  const visAO = document.getElementById('visAO');
  
  if (visRenderMode) visRenderMode.value = AppState.visualization.mode;
  if (visHeatmapMode) visHeatmapMode.value = AppState.visualization.heatmap;
  if (visPalette) visPalette.value = AppState.visualization.heatmapPalette;
  if (visAO) visAO.value = AppState.visualization.ao;
  
  visualizationConfig.mode = AppState.visualization.mode; // Sync with slicer
  visualizationConfig.heatmap = AppState.visualization.heatmap;
  
  setUI('visDensityRadiusSlider', 'visDensityRadiusInput', AppState.visualization.densityRadius, true);
  setUI('visCenterSizeSlider', 'visCenterSizeInput', AppState.visualization.centerSize, true);
  
  updateVisControlVisibility();
  updateControlVisibility();
}

// --- Visualization Event Listeners ---
const visRenderMode = document.getElementById('visRenderMode');
if (visRenderMode) {
  visRenderMode.addEventListener('change', (e) => {
    AppState.visualization.mode = e.target.value;
    visualizationConfig.mode = e.target.value;
    updateVisControlVisibility();
    updateBubbleView();
  });
}

const visHeatmapMode = document.getElementById('visHeatmapMode');
if (visHeatmapMode) {
  visHeatmapMode.addEventListener('change', (e) => {
    AppState.visualization.heatmap = e.target.value;
    visualizationConfig.heatmap = e.target.value;
    updateVisControlVisibility();
    updateBubbleView();
  });
}

const visPalette = document.getElementById('visPalette');
if (visPalette) {
  visPalette.addEventListener('change', (e) => {
    AppState.visualization.heatmapPalette = e.target.value;
    updateBubbleView();
  });
}

const visAO = document.getElementById('visAO');
if (visAO) {
  visAO.addEventListener('change', (e) => {
    AppState.visualization.ao = e.target.value;
    updateBubbleView();
  });
}

function updateVisControlVisibility() {
  const mode = AppState.visualization.mode;
  const heatmap = AppState.visualization.heatmap;
  
  const paletteGroup = document.getElementById('visPaletteGroup');
  const densityGroup = document.getElementById('visDensityRadiusGroup');
  const centerGroup = document.getElementById('visCenterSizeGroup');
  
  if (paletteGroup) {
    paletteGroup.style.display = (heatmap !== 'none') ? 'flex' : 'none';
  }
  if (densityGroup) {
    densityGroup.style.display = (heatmap === 'density') ? 'block' : 'none';
  }
  if (centerGroup) {
    centerGroup.style.display = (mode === 'centers') ? 'block' : 'none';
  }
}

// Ensure control visibility is updated on startup
setTimeout(updateVisControlVisibility, 200);

// --- Heatmap Helper Functions ---
function interpolateColor(t, points) {
  t = Math.max(0, Math.min(1, t));
  const numPoints = points.length;
  if (numPoints === 0) return new THREE.Color(1, 1, 1);
  if (numPoints === 1) return new THREE.Color(points[0].r, points[0].g, points[0].b);
  
  const scaledT = t * (numPoints - 1);
  const idx = Math.floor(scaledT);
  const fraction = scaledT - idx;
  
  if (idx >= numPoints - 1) {
    return new THREE.Color(points[numPoints - 1].r, points[numPoints - 1].g, points[numPoints - 1].b);
  }
  
  const c1 = points[idx];
  const c2 = points[idx + 1];
  
  return new THREE.Color(
    c1.r + fraction * (c2.r - c1.r),
    c1.g + fraction * (c2.g - c1.g),
    c1.b + fraction * (c2.b - c1.b)
  );
}

function getHeatmapColor(t, paletteName) {
  t = Math.max(0, Math.min(1, t));
  
  if (paletteName === 'viridis') {
    const points = [
      { r: 0.267, g: 0.004, b: 0.329 },
      { r: 0.231, g: 0.322, b: 0.545 },
      { r: 0.128, g: 0.565, b: 0.551 },
      { r: 0.224, g: 0.722, b: 0.404 },
      { r: 0.993, g: 0.906, b: 0.144 }
    ];
    return interpolateColor(t, points);
  }
  
  if (paletteName === 'magma') {
    const points = [
      { r: 0.000, g: 0.000, b: 0.004 },
      { r: 0.314, g: 0.078, b: 0.482 },
      { r: 0.718, g: 0.180, b: 0.502 },
      { r: 0.988, g: 0.514, b: 0.380 },
      { r: 0.988, g: 0.906, b: 0.604 }
    ];
    return interpolateColor(t, points);
  }
  
  if (paletteName === 'coolwarm') {
    const points = [
      { r: 0.230, g: 0.299, b: 0.754 },
      { r: 0.865, g: 0.865, b: 0.865 },
      { r: 0.706, g: 0.016, b: 0.150 }
    ];
    return interpolateColor(t, points);
  }
  
  const points = [
    { r: 0, g: 0, b: 0.5 },
    { r: 0, g: 0, b: 1 },
    { r: 0, g: 1, b: 1 },
    { r: 0, g: 1, b: 0 },
    { r: 1, g: 1, b: 0 },
    { r: 1, g: 0, b: 0 },
    { r: 0.5, g: 0, b: 0 }
  ];
  return interpolateColor(t, points);
}

function computeDensities(bubbles, searchRadius) {
  const densities = new Float32Array(bubbles.length);
  if (bubbles.length === 0) return densities;
  
  const cellSize = searchRadius;
  const grid = new Map();
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const gx = Math.floor(b.x / cellSize);
    const gy = Math.floor(b.y / cellSize);
    const gz = Math.floor(b.z / cellSize);
    const key = `${gx},${gy},${gz}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  
  const rSq = searchRadius * searchRadius;
  
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const gx = Math.floor(b.x / cellSize);
    const gy = Math.floor(b.y / cellSize);
    const gz = Math.floor(b.z / cellSize);
    
    let sum = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${gx + dx},${gy + dy},${gz + dz}`;
          const cell = grid.get(key);
          if (cell) {
            for (const idx of cell) {
              if (idx === i) continue;
              const ob = bubbles[idx];
              const distSq = (b.x - ob.x) ** 2 + (b.y - ob.y) ** 2 + (b.z - ob.z) ** 2;
              if (distSq < rSq) {
                sum += 1 - (distSq / rSq);
              }
            }
          }
        }
      }
    }
    densities[i] = sum;
  }
  
  return densities;
}

// --- 3D Representation Builders ---
function computeAOFactors(bubbles, aoSetting) {
  const aoFactors = new Float32Array(bubbles.length);
  aoFactors.fill(1.0);
  if (bubbles.length === 0 || aoSetting === 'none') return aoFactors;

  const radius = AppState.bubble.radius;
  const overlapFactorH = 1 - (AppState.bubble.overlapH / 100);
  let spacing = radius * 2;
  if (AppState.bubble.arrangement === 'poisson') {
    spacing = (AppState.bubble.poissonRadius || 0.5) * 2;
  }
  spacing *= overlapFactorH;

  const aoSearchRadius = 2.0 * spacing;
  const densities = computeDensities(bubbles, aoSearchRadius);

  let maxD = 0;
  for (let i = 0; i < densities.length; i++) {
    if (densities[i] > maxD) maxD = densities[i];
  }
  if (maxD === 0) maxD = 1;

  let intensity = 0.5;
  if (aoSetting === 'low') intensity = 0.3;
  if (aoSetting === 'high') intensity = 0.85;

  for (let i = 0; i < bubbles.length; i++) {
    const t = densities[i] / maxD;
    aoFactors[i] = 1.0 - Math.min(1.0, t) * intensity;
  }

  return aoFactors;
}

function applyVertexAO(geometry, bubbles, aoSetting, heatmapMode, paletteName) {
  if (!geometry) return;
  
  const radius = AppState.bubble.radius;
  const overlapFactorH = 1 - (AppState.bubble.overlapH / 100);
  let spacing = radius * 2;
  if (AppState.bubble.arrangement === 'poisson') {
    spacing = (AppState.bubble.poissonRadius || 0.5) * 2;
  }
  spacing *= overlapFactorH;
  
  const searchRadius = 2.0 * spacing;
  const cellSize = searchRadius;
  const grid = new Map();
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const gx = Math.floor(b.x / cellSize);
    const gy = Math.floor(b.y / cellSize);
    const gz = Math.floor(b.z / cellSize);
    const key = `${gx},${gy},${gz}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  
  const bubbleNeighbors = [];
  const rSq = searchRadius * searchRadius;
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const gx = Math.floor(b.x / cellSize);
    const gy = Math.floor(b.y / cellSize);
    const gz = Math.floor(b.z / cellSize);
    
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${gx + dx},${gy + dy},${gz + dz}`;
          const cell = grid.get(key);
          if (cell) {
            for (const idx of cell) {
              if (idx === i) continue;
              const ob = bubbles[idx];
              const distSq = (b.x - ob.x) ** 2 + (b.y - ob.y) ** 2 + (b.z - ob.z) ** 2;
              if (distSq < rSq) {
                neighbors.push(ob);
              }
            }
          }
        }
      }
    }
    bubbleNeighbors.push(neighbors);
  }
  
  const posAttr = geometry.attributes.position;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  
  let intensity = 0.5;
  if (aoSetting === 'low') intensity = 0.3;
  if (aoSetting === 'high') intensity = 0.85;
  
  let zMin = Infinity, zMax = -Infinity;
  let maxRad = 0;
  const center = new THREE.Vector3();
  const origMesh = getOriginalMesh();
  if (origMesh) {
    const box = new THREE.Box3().setFromObject(origMesh);
    if (box) {
      zMin = box.min.z;
      zMax = box.max.z;
      box.getCenter(center);
      maxRad = Math.hypot(box.max.x - center.x, box.max.y - center.y);
    }
  }
  if (zMax === zMin) zMax = zMin + 1;
  if (maxRad === 0) maxRad = 1;
  
  let densities = null;
  let maxD = 0, minD = Infinity;
  if (heatmapMode === 'density') {
    densities = computeDensities(bubbles, searchRadius);
    for (const d of densities) {
      if (d > maxD) maxD = d;
      if (d < minD) minD = d;
    }
    if (maxD === minD) maxD = minD + 1;
  }
  
  const px = new THREE.Vector3();
  
  for (let vi = 0; vi < count; vi++) {
    px.fromBufferAttribute(posAttr, vi);
    
    const gx = Math.floor(px.x / cellSize);
    const gy = Math.floor(px.y / cellSize);
    const gz = Math.floor(px.z / cellSize);
    
    let closestBubbleIdx = -1;
    let minDistSq = Infinity;
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${gx + dx},${gy + dy},${gz + dz}`;
          const cell = grid.get(key);
          if (cell) {
            for (const idx of cell) {
              const b = bubbles[idx];
              const distSq = (px.x - b.x) ** 2 + (px.y - b.y) ** 2 + (px.z - b.z) ** 2;
              if (distSq < minDistSq) {
                minDistSq = distSq;
                closestBubbleIdx = idx;
              }
            }
          }
        }
      }
    }
    
    let baseCol = new THREE.Color(0xffffff);
    
    if (closestBubbleIdx !== -1) {
      const b = bubbles[closestBubbleIdx];
      
      if (heatmapMode !== 'none') {
        let t = 0;
        if (heatmapMode === 'density' && densities) {
          t = (densities[closestBubbleIdx] - minD) / (maxD - minD);
        } else if (heatmapMode === 'z-height') {
          t = Math.max(0, Math.min(1, (b.z - zMin) / (zMax - zMin)));
        } else if (heatmapMode === 'radial') {
          const dist = Math.hypot(b.x - center.x, b.y - center.y);
          t = Math.max(0, Math.min(1, dist / maxRad));
        }
        baseCol = getHeatmapColor(t, paletteName);
      }
      
      if (aoSetting !== 'none') {
        const neighbors = bubbleNeighbors[closestBubbleIdx];
        let totalOcc = 0;
        
        for (const nb of neighbors) {
          const dx = px.x - nb.x;
          const dy = px.y - nb.y;
          const dz = px.z - nb.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
          
          const contactDist = nb.radius;
          const maxOccDist = contactDist + radius * 0.8;
          
          if (dist < contactDist) {
            totalOcc += 1.0;
          } else if (dist < maxOccDist) {
            const factor = 1.0 - (dist - contactDist) / (maxOccDist - contactDist);
            totalOcc += factor;
          }
        }
        
        const aoFactor = Math.max(0.15, 1.0 - totalOcc * 0.3 * intensity);
        baseCol.multiplyScalar(aoFactor);
      }
    }
    
    colors[vi * 3] = baseCol.r;
    colors[vi * 3 + 1] = baseCol.g;
    colors[vi * 3 + 2] = baseCol.b;
  }
  
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

// --- 3D Representation Builders ---
function createInstancedBubbles(bubbles, mode, heatmapMode, paletteName, searchRadius, centerSize, aoFactors) {
  if (bubbles.length === 0) return { solid: null, ghost: null };
  
  let geometry;
  let widthSegments = 16, heightSegments = 12;
  if (AppState.advanced.resolution === 'low') {
    widthSegments = 8; heightSegments = 6;
  } else if (AppState.advanced.resolution === 'high') {
    widthSegments = 32; heightSegments = 24;
  }
  
  const thetaLength = Math.PI * (1 - (Math.max(0, Math.min(100, AppState.bubble.baseFlattenPercent)) / 100));
  
  if (mode === 'centers') {
    geometry = new THREE.SphereGeometry(centerSize, 8, 6);
  } else {
    geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  }
  geometry.rotateX(Math.PI / 2);
  
  const bottomBubbles = [];
  const normalBubbles = [];
  
  let minZ = Infinity;
  for (const b of bubbles) {
    if (b.z < minZ) minZ = b.z;
  }
  
  for (const b of bubbles) {
    if (mode === 'spheres' && Math.abs(b.z - minZ) < 0.05) {
      bottomBubbles.push(b);
    } else {
      normalBubbles.push(b);
    }
  }
  
  const clippingPlanes = getClippingPlanes();
  
  const solidMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    emissive: 0x222222,
    specular: 0x111111,
    shininess: 30,
    side: THREE.DoubleSide,
    flatShading: true,
    clippingPlanes: [clippingPlanes[0]],
    clipShadows: true
  });
  
  const ghostMaterial = new THREE.MeshBasicMaterial({
    color: 0x888888,
    transparent: true,
    opacity: AppState.view.ghostOpacity,
    side: THREE.DoubleSide,
    clippingPlanes: [clippingPlanes[1]],
    depthWrite: false
  });
  
  const solidGroup = new THREE.Group();
  const ghostGroup = new THREE.Group();
  
  const populateInstance = (instMesh, list, isBottomLayer) => {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    
    let densities = null;
    let maxD = 0, minD = Infinity;
    if (heatmapMode === 'density') {
      const radius = AppState.bubble.radius;
      const overlapFactorH = 1 - (AppState.bubble.overlapH / 100);
      let spacing = radius * 2;
      if (AppState.bubble.arrangement === 'poisson') {
        spacing = (AppState.bubble.poissonRadius || 0.5) * 2;
      }
      spacing *= overlapFactorH;
      const sRad = searchRadius * spacing;
      densities = computeDensities(bubbles, sRad);
      for (const d of densities) {
        if (d > maxD) maxD = d;
        if (d < minD) minD = d;
      }
      if (maxD === minD) maxD = minD + 1;
    }
    
    let zMin = Infinity, zMax = -Infinity;
    let maxRad = 0;
    const center = new THREE.Vector3();
    const origMesh = getOriginalMesh();
    if (origMesh) {
      const box = new THREE.Box3().setFromObject(origMesh);
      if (box) {
        zMin = box.min.z;
        zMax = box.max.z;
        box.getCenter(center);
        maxRad = Math.hypot(box.max.x - center.x, box.max.y - center.y);
      }
    }
    if (zMax === zMin) zMax = zMin + 1;
    if (maxRad === 0) maxRad = 1;
    
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      position.set(b.x, b.y, b.z);
      if (mode === 'centers') {
        scale.set(1, 1, 1);
      } else {
        scale.set(b.radius, b.radius, b.radius);
      }
      
      matrix.compose(position, quaternion, scale);
      instMesh.setMatrixAt(i, matrix);
      
      let color = new THREE.Color(AppState.view.modelColor);
      if (heatmapMode !== 'none') {
        let t = 0;
        if (heatmapMode === 'density' && densities) {
          if (b.globalIndex !== undefined) {
            t = (densities[b.globalIndex] - minD) / (maxD - minD);
          } else {
            const bIdx = bubbles.indexOf(b);
            if (bIdx !== -1) {
              t = (densities[bIdx] - minD) / (maxD - minD);
            }
          }
        } else if (heatmapMode === 'z-height') {
          t = Math.max(0, Math.min(1, (b.z - zMin) / (zMax - zMin)));
        } else if (heatmapMode === 'radial') {
          const dist = Math.hypot(b.x - center.x, b.y - center.y);
          t = Math.max(0, Math.min(1, dist / maxRad));
        }
        color = getHeatmapColor(t, paletteName);
      }
      
      if (aoFactors) {
        if (b.globalIndex !== undefined) {
          color.multiplyScalar(aoFactors[b.globalIndex]);
        } else {
          const bIdx = bubbles.indexOf(b);
          if (bIdx !== -1) {
            color.multiplyScalar(aoFactors[bIdx]);
          }
        }
      }
      
      instMesh.setColorAt(i, color);
    }
    instMesh.instanceMatrix.needsUpdate = true;
    if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
  };
  
  if (bottomBubbles.length > 0) {
    const bottomGeo = new THREE.SphereGeometry(1, widthSegments, heightSegments, 0, Math.PI * 2, 0, thetaLength);
    bottomGeo.rotateX(Math.PI / 2);
    
    const bottomSolid = new THREE.InstancedMesh(bottomGeo, solidMaterial, bottomBubbles.length);
    const bottomGhost = new THREE.InstancedMesh(bottomGeo, ghostMaterial, bottomBubbles.length);
    
    populateInstance(bottomSolid, bottomBubbles, true);
    populateInstance(bottomGhost, bottomBubbles, true);
    
    solidGroup.add(bottomSolid);
    ghostGroup.add(bottomGhost);
  }
  
  if (normalBubbles.length > 0) {
    const normalSolid = new THREE.InstancedMesh(geometry, solidMaterial, normalBubbles.length);
    const normalGhost = new THREE.InstancedMesh(geometry, ghostMaterial, normalBubbles.length);
    
    populateInstance(normalSolid, normalBubbles, false);
    populateInstance(normalGhost, normalBubbles, false);
    
    solidGroup.add(normalSolid);
    ghostGroup.add(normalGhost);
  }
  
  return { solid: solidGroup, ghost: ghostGroup };
}

import { getVoronoiCells2D, getSliceContours } from './src/geometry_utils_v2.js';

function createVoronoiWireframe(bubbles, heatmapMode, paletteName, searchRadius, aoFactors) {
  if (bubbles.length === 0) return { solid: null, ghost: null };
  
  const originalMesh = getOriginalMesh();
  const box = new THREE.Box3().setFromObject(originalMesh);
  
  const layers = new Map();
  for (const b of bubbles) {
    const zKey = Math.round(b.z * 1000) / 1000;
    if (!layers.has(zKey)) layers.set(zKey, []);
    layers.get(zKey).push(b);
  }
  
  let densities = null;
  let maxD = 0, minD = Infinity;
  if (heatmapMode === 'density') {
    const radius = AppState.bubble.radius;
    const overlapFactorH = 1 - (AppState.bubble.overlapH / 100);
    let spacing = radius * 2;
    if (AppState.bubble.arrangement === 'poisson') {
      spacing = (AppState.bubble.poissonRadius || 0.5) * 2;
    }
    spacing *= overlapFactorH;
    const sRad = searchRadius * spacing;
    densities = computeDensities(bubbles, sRad);
    for (const d of densities) {
      if (d > maxD) maxD = d;
      if (d < minD) minD = d;
    }
    if (maxD === minD) maxD = minD + 1;
  }
  
  let zMin = Infinity, zMax = -Infinity;
  let maxRad = 0;
  const center = new THREE.Vector3();
  if (box) {
    zMin = box.min.z;
    zMax = box.max.z;
    box.getCenter(center);
    maxRad = Math.hypot(box.max.x - center.x, box.max.y - center.y);
  }
  if (zMax === zMin) zMax = zMin + 1;
  if (maxRad === 0) maxRad = 1;
  
  const positions = [];
  const colors = [];
  
  for (const [zVal, layerBubbles] of layers.entries()) {
    const unshiftedZ = layerBubbles[0].unshiftedZ !== undefined ? layerBubbles[0].unshiftedZ : zVal;
    const contours = getSliceContours(originalMesh, unshiftedZ);
    if (contours.length === 0) continue;
    
    const points = layerBubbles.map(b => ({ x: b.x, y: b.y }));
    const cells = getVoronoiCells2D(points, box, contours);
    
    for (const cell of cells) {
      const b = layerBubbles[cell.index];
      
      let color = new THREE.Color(AppState.view.modelColor);
      if (heatmapMode !== 'none') {
        let t = 0;
        if (heatmapMode === 'density' && densities) {
          if (b.globalIndex !== undefined) {
            t = (densities[b.globalIndex] - minD) / (maxD - minD);
          } else {
            const bIdx = bubbles.indexOf(b);
            if (bIdx !== -1) {
              t = (densities[bIdx] - minD) / (maxD - minD);
            }
          }
        } else if (heatmapMode === 'z-height') {
          t = Math.max(0, Math.min(1, (b.z - zMin) / (zMax - zMin)));
        } else if (heatmapMode === 'radial') {
          const dist = Math.hypot(b.x - center.x, b.y - center.y);
          t = Math.max(0, Math.min(1, dist / maxRad));
        }
        color = getHeatmapColor(t, paletteName);
      }
      
      if (aoFactors) {
        if (b.globalIndex !== undefined) {
          color.multiplyScalar(aoFactors[b.globalIndex]);
        } else {
          const bIdx = bubbles.indexOf(b);
          if (bIdx !== -1) {
            color.multiplyScalar(aoFactors[bIdx]);
          }
        }
      }
      
      for (const seg of cell.segments) {
        positions.push(seg.p1.x, seg.p1.y, zVal);
        positions.push(seg.p2.x, seg.p2.y, zVal);
        
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  
  if (positions.length === 0) return { solid: null, ghost: null };
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  const clippingPlanes = getClippingPlanes();
  
  const solidMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    clippingPlanes: [clippingPlanes[0]],
    linewidth: 1.5
  });
  
  const ghostMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: AppState.view.ghostOpacity,
    clippingPlanes: [clippingPlanes[1]],
    depthWrite: false
  });
  
  const solidLine = new THREE.LineSegments(geometry, solidMaterial);
  const ghostLine = new THREE.LineSegments(geometry.clone(), ghostMaterial);
  
  return { solid: solidLine, ghost: ghostLine };
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
      const bubbles = bubbleGenerator.bubbles || [];
      // Set global indices for fast lookup
      for (let i = 0; i < bubbles.length; i++) {
        bubbles[i].globalIndex = i;
      }
      setBubbleData(bubbles);

      const visMode = AppState.visualization.mode;
      const heatmapMode = AppState.visualization.heatmap;
      const paletteName = AppState.visualization.heatmapPalette;
      const densityRadius = AppState.visualization.densityRadius;
      const centerSize = AppState.visualization.centerSize;
      const aoSetting = AppState.visualization.ao;

      // Compute baked AO factors if active (for flat instanced/wire modes)
      const aoFactors = (aoSetting !== 'none') ? computeAOFactors(bubbles, aoSetting) : null;

      if (visMode === 'spheres') {
        if (heatmapMode === 'none' && aoSetting === 'none') {
          if (bubbleGeo.attributes.color) {
            bubbleGeo.removeAttribute('color');
          }
          setTargetGeometry(bubbleGeo, scene, false);
        } else {
          applyVertexAO(bubbleGeo, bubbles, aoSetting, heatmapMode, paletteName);
          setTargetGeometry(bubbleGeo, scene, false);
        }
      } else if (visMode === 'voronoi') {
        const { solid, ghost } = createVoronoiWireframe(bubbles, heatmapMode, paletteName, densityRadius, aoFactors);
        if (solid) {
          setTargetGeometry(solid, scene, false, ghost);
        } else {
          setTargetGeometry(null, scene, false);
        }
      } else {
        const { solid, ghost } = createInstancedBubbles(bubbles, visMode, heatmapMode, paletteName, densityRadius, centerSize, aoFactors);
        if (solid) {
          setTargetGeometry(solid, scene, false, ghost);
        } else {
          setTargetGeometry(null, scene, false);
        }
      }
    } else {
      console.warn("Bubble Mode: No geometry generated.");
      setBubbleData(null);
      setTargetGeometry(null, scene, false);
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
  updateControlVisibility();
}, 100);

// --- MAKE 2D PREVIEW DRAGGABLE ---
const makeElementDraggable = (elmnt) => {
  const header = elmnt.querySelector('h3') || elmnt;
  
  header.style.cursor = 'move';
  header.style.userSelect = 'none';
  header.style.touchAction = 'none'; // Prevent default scrolling behavior on touch devices during drag

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onPointerDown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    startLeft = elmnt.offsetLeft;
    startTop = elmnt.offsetTop;
    
    header.setPointerCapture(e.pointerId);
    
    header.addEventListener('pointermove', onPointerMove);
    header.addEventListener('pointerup', onPointerUp);
    header.addEventListener('pointercancel', onPointerUp);
    
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    elmnt.style.right = 'auto';
    elmnt.style.bottom = 'auto';
    
    let newLeft = startLeft + deltaX;
    let newTop = startTop + deltaY;
    
    // Bounds check
    const maxLeft = window.innerWidth - elmnt.offsetWidth - 10;
    const maxTop = window.innerHeight - elmnt.offsetHeight - 10;
    
    newLeft = Math.max(10, Math.min(maxLeft, newLeft));
    newTop = Math.max(10, Math.min(maxTop, newTop));
    
    elmnt.style.left = newLeft + 'px';
    elmnt.style.top = newTop + 'px';
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    try {
      header.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore if pointer capture was already released
    }
    
    header.removeEventListener('pointermove', onPointerMove);
    header.removeEventListener('pointerup', onPointerUp);
    header.removeEventListener('pointercancel', onPointerUp);
  };

  header.addEventListener('pointerdown', onPointerDown);
};

const previewPanel = document.querySelector('.slice-preview-panel');
if (previewPanel) {
  makeElementDraggable(previewPanel);
}
