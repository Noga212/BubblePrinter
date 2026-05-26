import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Slicer & Bubble Generator
import { setupSlicer, getModelHeight, updateSliceSettings, getCurrentMesh, getOriginalMesh, getClippingPlanes, setSliceTarget, setTargetGeometry, restoreOriginalGeometry, setGhostModelOpacity, setBaseMaterialColor } from './src/slicer_v2.js';
import { BubbleGenerator, GENERATOR_CONFIG } from './src/bubble_generator.js';

console.log("[MAIN] BubblePrinter Version: 25 (Built-in Models)");


// DOM Elements
const app = document.querySelector('#app');

// Z-Up setup is handled by camera.up in scene setup

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a); // Deep Void (approx rgb 26, 26, 26, which is ~10%)

// Grid Helper (Cura Style)
const gridHelper = new THREE.GridHelper(50, 50, 0x008800, 0x444444); // Bright Green/Gray
gridHelper.rotation.x = Math.PI / 2; // Rotate to XY plane
scene.add(gridHelper);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(20, -20, 20); // Better angle for Z-up
camera.up.set(0, 0, 1); // Z is up
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.localClippingEnabled = true; // Use visual clipping
app.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

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



// Logic placeholder for Slicer
// Logic placeholder for Slicer
// Imports moved to top



const bubbleGenerator = new BubbleGenerator();

// Event Listeners for UI
const demoModelSelector = document.getElementById('demoModelSelector');

demoModelSelector.addEventListener('change', (e) => {
  const modelUrl = e.target.value;
  if (!modelUrl) return;

  resetBubbleSettings();
  setSliceTarget(null);
  
  // Load directly via OBJLoader in setupSlicer
  setupSlicer(modelUrl, scene, camera, controls, () => {
    if (bubbleModeToggle.checked) {
      updateBubbleView();
    }
  });
  
  // Reset selector so the same model can be selected again
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
      // Note: bubble settings are kept to allow applying same style to new model
      if (bubbleModeToggle.checked) {
        updateBubbleView();
      }
    });
  }
});



// Slider Counter Logic
const slider = document.getElementById('sliceSlider');
const counter = document.getElementById('sliceCounter');

slider.addEventListener('input', (e) => {
  counter.textContent = `Slice ${e.target.value}/${slider.max}`;
});


// --- Layer Settings Docked Panel Logic ---
const layerCountInput = document.getElementById('layerCountInput');
const layerHeightInput = document.getElementById('layerHeightInput');
const applySettingsBtn = document.getElementById('applySettingsBtn');

// Helper to keep inputs in sync based on current model height
function syncLayerInputs(source) {
  const height = getModelHeight() || 10; // Default height if no model is loaded
  
  if (source === 'count') {
    const count = parseInt(layerCountInput.value) || 1;
    const newLayerHeight = height / count;
    layerHeightInput.value = newLayerHeight.toFixed(3);
  } else if (source === 'height') {
    const lh = parseFloat(layerHeightInput.value) || 0.1;
    const newCount = Math.round(height / lh);
    layerCountInput.value = newCount;
  }
}

// Sync Inputs when user types
layerCountInput.addEventListener('input', () => syncLayerInputs('count'));
layerHeightInput.addEventListener('input', () => syncLayerInputs('height'));

// Apply settings automatically on blur (when user leaves the input)
function applyLayerSettings() {
  const newCount = parseInt(layerCountInput.value);
  if (newCount > 0) {
    updateSliceSettings(newCount);
  } else {
    alert("Layer count must be greater than 0");
  }
}

layerCountInput.addEventListener('change', applyLayerSettings);
layerHeightInput.addEventListener('change', applyLayerSettings);

const ghostOpacitySlider = document.getElementById('ghostOpacitySlider');
if (ghostOpacitySlider) {
  ghostOpacitySlider.addEventListener('input', (e) => {
    const opacity = parseInt(e.target.value) / 100;
    setGhostModelOpacity(opacity);
  });
}

const ambientLightSlider = document.getElementById('ambientLightSlider');
if (ambientLightSlider) {
  ambientLightSlider.addEventListener('input', (e) => {
    ambientLight.intensity = parseFloat(e.target.value);
  });
}

const modelLightSlider = document.getElementById('modelLightSlider');
if (modelLightSlider) {
  modelLightSlider.addEventListener('input', (e) => {
    directionalLight.intensity = parseFloat(e.target.value);
  });
}

const bgBrightnessSlider = document.getElementById('bgBrightnessSlider');
if (bgBrightnessSlider) {
  bgBrightnessSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    const color = Math.floor((val / 100) * 255);
    scene.background = new THREE.Color(`rgb(${color}, ${color}, ${color})`);
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

// --- Bubble Mode Constants & Defaults ---
const BUBBLE_DEFAULTS = {
  size: 0.5,
  minSize: 0.25,
  maxSize: 0.75,
  overlapV: 0,
  overlapH: 0,
  baseFlatten: 50,
  arrangement: 'grid',
  sizeMode: 'uniform'
};

const BUBBLE_LIMITS = {
  sizeMin: 0.01,
  sizeMax: 2.0,
  overlapMin: 0,
  overlapMax: 70,
  flattenMin: 0,
  flattenMax: 100
};

// --- Bubble Mode Logic ---
const bubbleModeToggle = document.getElementById('bubbleModeToggle');
const bubbleSettingsContainer = document.getElementById('bubbleSettingsContainer');
const bubbleSizeMode = document.getElementById('bubbleSizeMode');
const bubbleSizeLabel = document.getElementById('bubbleSizeLabel');
const bubbleArrangement = document.getElementById('bubbleArrangement');

const bubbleSizeSlider = document.getElementById('bubbleSizeSlider');
const bubbleSizeInput = document.getElementById('bubbleSizeInput');
const bubbleOverlapVSlider = document.getElementById('bubbleOverlapVSlider');
const bubbleOverlapVInput = document.getElementById('bubbleOverlapVInput');
const bubbleOverlapHSlider = document.getElementById('bubbleOverlapHSlider');
const bubbleOverlapHInput = document.getElementById('bubbleOverlapHInput');
const baseFlattenSlider = document.getElementById('baseFlattenSlider');
const baseFlattenInput = document.getElementById('baseFlattenInput');

const uniformSizeControl = document.getElementById('uniformSizeControl');
const rangeSizeControl = document.getElementById('rangeSizeControl');
const bubbleMinSlider = document.getElementById('bubbleMinSlider');
const bubbleMaxSlider = document.getElementById('bubbleMaxSlider');
const bubbleMinInput = document.getElementById('bubbleMinInput');
const bubbleMaxInput = document.getElementById('bubbleMaxInput');
const shellDepthControl = document.getElementById('shellDepthControl');
const adaptiveThresholdsControl = document.getElementById('adaptiveThresholdsControl');
const gradientCurveControl = document.getElementById('gradientCurveControl');
const gradientExponentSlider = document.getElementById('gradientExponentSlider');
const gradientExponentInput = document.getElementById('gradientExponentInput');
const zAxisRangeControl = document.getElementById('zAxisRangeControl');
const zRangeStartSlider = document.getElementById('zRangeStartSlider');
const zRangeStartInput = document.getElementById('zRangeStartInput');
const zRangeEndSlider = document.getElementById('zRangeEndSlider');
const zRangeEndInput = document.getElementById('zRangeEndInput');

// --- Helper for two-way binding ---
function bindSliderAndInput(sliderElem, inputElem, minLimit, maxLimit, isFloat, onChange) {
  sliderElem.addEventListener('input', (e) => {
    inputElem.value = isFloat ? parseFloat(e.target.value).toFixed(2) : e.target.value;
  });
  inputElem.addEventListener('input', (e) => {
    let val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
    if (isNaN(val)) val = minLimit;
    val = Math.min(Math.max(val, minLimit), maxLimit);
    sliderElem.value = val;
  });
  if (onChange) {
    sliderElem.addEventListener('change', onChange);
    inputElem.addEventListener('change', onChange);
  }
}

// Bind simple sliders
bindSliderAndInput(bubbleSizeSlider, bubbleSizeInput, BUBBLE_LIMITS.sizeMin, BUBBLE_LIMITS.sizeMax, true, updateBubbleView);
bindSliderAndInput(bubbleOverlapVSlider, bubbleOverlapVInput, BUBBLE_LIMITS.overlapMin, BUBBLE_LIMITS.overlapMax, false, updateBubbleView);
bindSliderAndInput(bubbleOverlapHSlider, bubbleOverlapHInput, BUBBLE_LIMITS.overlapMin, BUBBLE_LIMITS.overlapMax, false, updateBubbleView);
bindSliderAndInput(baseFlattenSlider, baseFlattenInput, BUBBLE_LIMITS.flattenMin, BUBBLE_LIMITS.flattenMax, false, updateBubbleView);

// Bind Advanced Sliders
const advShellDepthSlider = document.getElementById('advShellDepthSlider');
const advShellDepthInput = document.getElementById('advShellDepthInput');
const advInnerThreshSlider = document.getElementById('advInnerThreshSlider');
const advInnerThreshInput = document.getElementById('advInnerThreshInput');
const advOuterThreshSlider = document.getElementById('advOuterThreshSlider');
const advOuterThreshInput = document.getElementById('advOuterThreshInput');
const advResolution = document.getElementById('advResolution');
const advMaxLayersInput = document.getElementById('advMaxLayersInput');
const advMaxBubblesInput = document.getElementById('advMaxBubblesInput');
const modelColorInput = document.getElementById('modelColorInput');

if (advMaxLayersInput) {
  advMaxLayersInput.addEventListener('change', (e) => {
    GENERATOR_CONFIG.maxLayers = parseInt(e.target.value);
  });
}
if (advMaxBubblesInput) {
  advMaxBubblesInput.addEventListener('change', (e) => {
    GENERATOR_CONFIG.maxBubbles3D = parseInt(e.target.value);
  });
}
if (modelColorInput) {
  modelColorInput.addEventListener('input', (e) => {
    setBaseMaterialColor(e.target.value);
  });
}

if (advShellDepthSlider) {
  bindSliderAndInput(advShellDepthSlider, advShellDepthInput, 1.0, 10.0, true, (e) => {
    GENERATOR_CONFIG.adaptiveShellDepthMultiplier = parseFloat(e.target.value);
    updateBubbleView();
  });
}
if (advInnerThreshSlider) {
  bindSliderAndInput(advInnerThreshSlider, advInnerThreshInput, 0, 100, false, (e) => {
    GENERATOR_CONFIG.adaptiveThresholdInner = parseInt(e.target.value) / 100;
    updateBubbleView();
  });
}
if (advOuterThreshSlider) {
  bindSliderAndInput(advOuterThreshSlider, advOuterThreshInput, 0, 100, false, (e) => {
    GENERATOR_CONFIG.adaptiveThresholdOuter = parseInt(e.target.value) / 100;
    updateBubbleView();
  });
}
// Bind Curve Exponent and Z Transition Range
if (gradientExponentSlider) {
  bindSliderAndInput(gradientExponentSlider, gradientExponentInput, 0.1, 5.0, true, (e) => {
    GENERATOR_CONFIG.gradientExponent = parseFloat(e.target.value);
    updateBubbleView();
  });
}

// Bind Z-range sliders (0 to 100%)
function updateZRangeBinding() {
  let startVal = parseInt(zRangeStartSlider.value);
  let endVal = parseInt(zRangeEndSlider.value);
  
  if (startVal > endVal) {
    if (this === zRangeStartSlider || this === zRangeStartInput) {
      startVal = endVal;
      zRangeStartSlider.value = startVal;
    } else {
      endVal = startVal;
      zRangeEndSlider.value = endVal;
    }
  }
  
  zRangeStartInput.value = startVal;
  zRangeEndInput.value = endVal;
  GENERATOR_CONFIG.zGradientStart = startVal;
  GENERATOR_CONFIG.zGradientEnd = endVal;
}

if (zRangeStartSlider && zRangeEndSlider) {
  [zRangeStartSlider, zRangeEndSlider].forEach(el => el.addEventListener('input', updateZRangeBinding));
  [zRangeStartInput, zRangeEndInput].forEach(el => el.addEventListener('input', (e) => {
    let val = Math.min(Math.max(parseInt(e.target.value) || 0, 0), 100);
    if (e.target === zRangeStartInput) zRangeStartSlider.value = val;
    else zRangeEndSlider.value = val;
    updateZRangeBinding.call(e.target);
  }));

  [zRangeStartSlider, zRangeEndSlider, zRangeStartInput, zRangeEndInput].forEach(el => el.addEventListener('change', updateBubbleView));
}

// Bind range sliders (custom logic due to dependency between min/max)
function updateRangeBinding() {
  let minVal = parseFloat(bubbleMinSlider.value);
  let maxVal = parseFloat(bubbleMaxSlider.value);
  
  if (minVal > maxVal) {
    if (this === bubbleMinSlider || this === bubbleMinInput) {
      minVal = maxVal;
      bubbleMinSlider.value = minVal;
    } else {
      maxVal = minVal;
      bubbleMaxSlider.value = maxVal;
    }
  }
  
  bubbleMinInput.value = minVal.toFixed(2);
  bubbleMaxInput.value = maxVal.toFixed(2);
}

[bubbleMinSlider, bubbleMaxSlider].forEach(el => el.addEventListener('input', updateRangeBinding));
[bubbleMinInput, bubbleMaxInput].forEach(el => el.addEventListener('input', (e) => {
  let val = Math.min(Math.max(parseFloat(e.target.value) || BUBBLE_LIMITS.sizeMin, BUBBLE_LIMITS.sizeMin), BUBBLE_LIMITS.sizeMax);
  if (e.target === bubbleMinInput) bubbleMinSlider.value = val;
  else bubbleMaxSlider.value = val;
  updateRangeBinding.call(e.target);
}));

[bubbleMinSlider, bubbleMaxSlider, bubbleMinInput, bubbleMaxInput].forEach(el => el.addEventListener('change', updateBubbleView));

bubbleModeToggle.addEventListener('change', () => {
  const mesh = getCurrentMesh();
  
  if (bubbleModeToggle.checked) {
    bubbleSettingsContainer.style.display = 'block';
    if (mesh) updateBubbleView();
  } else {
    bubbleSettingsContainer.style.display = 'none';
    restoreOriginalGeometry(scene);
  }
});

bubbleArrangement.addEventListener('change', updateBubbleView);
bubbleSizeMode.addEventListener('change', (e) => {
  const mode = e.target.value;
  if (mode === 'uniform') {
    uniformSizeControl.style.display = 'block';
    rangeSizeControl.style.display = 'none';
    if (shellDepthControl) shellDepthControl.style.display = 'none';
    if (adaptiveThresholdsControl) adaptiveThresholdsControl.style.display = 'none';
    if (gradientCurveControl) gradientCurveControl.style.display = 'none';
    if (zAxisRangeControl) zAxisRangeControl.style.display = 'none';
  } else if (mode === 'shell_gradient_in') {
    uniformSizeControl.style.display = 'none';
    rangeSizeControl.style.display = 'block';
    if (shellDepthControl) shellDepthControl.style.display = 'block';
    if (adaptiveThresholdsControl) adaptiveThresholdsControl.style.display = 'none';
    if (gradientCurveControl) gradientCurveControl.style.display = 'block';
    if (zAxisRangeControl) zAxisRangeControl.style.display = 'none';
  } else if (mode === 'adaptive') {
    uniformSizeControl.style.display = 'none';
    rangeSizeControl.style.display = 'block';
    if (shellDepthControl) shellDepthControl.style.display = 'block';
    if (adaptiveThresholdsControl) adaptiveThresholdsControl.style.display = 'block';
    if (gradientCurveControl) gradientCurveControl.style.display = 'none';
    if (zAxisRangeControl) zAxisRangeControl.style.display = 'none';
  } else {
    // z_gradient_down or z_gradient_up
    uniformSizeControl.style.display = 'none';
    rangeSizeControl.style.display = 'block';
    if (shellDepthControl) shellDepthControl.style.display = 'none';
    if (adaptiveThresholdsControl) adaptiveThresholdsControl.style.display = 'none';
    if (gradientCurveControl) gradientCurveControl.style.display = 'block';
    if (zAxisRangeControl) zAxisRangeControl.style.display = 'block';
  }
  updateBubbleView();
});

if (advResolution) {
  advResolution.addEventListener('change', (e) => {
    if (e.target.value === 'low') {
      GENERATOR_CONFIG.sphereWidthSegments = 8;
      GENERATOR_CONFIG.sphereHeightSegments = 6;
    } else if (e.target.value === 'high') {
      GENERATOR_CONFIG.sphereWidthSegments = 32;
      GENERATOR_CONFIG.sphereHeightSegments = 24;
    } else {
      GENERATOR_CONFIG.sphereWidthSegments = 16;
      GENERATOR_CONFIG.sphereHeightSegments = 12;
    }
    updateBubbleView();
  });
}

function getBubbleConfig() {
  const parseVal = (val, def, isFloat = false) => {
    const parsed = isFloat ? parseFloat(val) : parseInt(val);
    return isNaN(parsed) ? def : parsed;
  };

  return {
    overlapV: parseVal(bubbleOverlapVSlider.value, BUBBLE_DEFAULTS.overlapV),
    overlapH: parseVal(bubbleOverlapHSlider.value, BUBBLE_DEFAULTS.overlapH),
    baseFlattenPercent: parseVal(baseFlattenSlider.value, BUBBLE_DEFAULTS.baseFlatten),
    arrangement: bubbleArrangement.value || BUBBLE_DEFAULTS.arrangement,
    sizeMode: bubbleSizeMode.value || BUBBLE_DEFAULTS.sizeMode,
    radius: parseVal(bubbleSizeSlider.value, BUBBLE_DEFAULTS.size, true),
    minRadius: parseVal(bubbleMinSlider.value, BUBBLE_DEFAULTS.minSize, true),
    maxRadius: parseVal(bubbleMaxSlider.value, BUBBLE_DEFAULTS.maxSize, true)
  };
}

function resetBubbleSettings() {
  console.log("[MAIN] Resetting bubble settings to defaults...");
  // Bubble mode is ON by default
  bubbleModeToggle.checked = true;
  bubbleSettingsContainer.style.display = 'block';

  bubbleSizeSlider.value = BUBBLE_DEFAULTS.size;
  bubbleSizeInput.value = BUBBLE_DEFAULTS.size.toFixed(2);
  bubbleMinSlider.value = BUBBLE_DEFAULTS.minSize;
  bubbleMinInput.value = BUBBLE_DEFAULTS.minSize.toFixed(2);
  bubbleMaxSlider.value = BUBBLE_DEFAULTS.maxSize;
  bubbleMaxInput.value = BUBBLE_DEFAULTS.maxSize.toFixed(2);

  bubbleOverlapVSlider.value = BUBBLE_DEFAULTS.overlapV;
  bubbleOverlapVInput.value = BUBBLE_DEFAULTS.overlapV;

  bubbleOverlapHSlider.value = BUBBLE_DEFAULTS.overlapH;
  bubbleOverlapHInput.value = BUBBLE_DEFAULTS.overlapH;

  baseFlattenSlider.value = BUBBLE_DEFAULTS.baseFlatten;
  baseFlattenInput.value = BUBBLE_DEFAULTS.baseFlatten;
  
  bubbleArrangement.value = BUBBLE_DEFAULTS.arrangement;
  bubbleSizeMode.value = BUBBLE_DEFAULTS.sizeMode;
  
  if (gradientExponentSlider) {
    gradientExponentSlider.value = 1.0;
    gradientExponentInput.value = "1.00";
    GENERATOR_CONFIG.gradientExponent = 1.0;
  }
  if (zRangeStartSlider && zRangeEndSlider) {
    zRangeStartSlider.value = 0;
    zRangeStartInput.value = 0;
    zRangeEndSlider.value = 100;
    zRangeEndInput.value = 100;
    GENERATOR_CONFIG.zGradientStart = 0;
    GENERATOR_CONFIG.zGradientEnd = 100;
  }

  // Dispatch change event to update the shown/hidden sections automatically
  bubbleSizeMode.dispatchEvent(new Event('change'));
}

function updateBubbleView() {
  const originalMesh = getOriginalMesh();
  if (!originalMesh) {
    console.warn("Bubble Mode: No original mesh available.");
    return;
  }

  if (bubbleModeToggle.checked) {
    const config = getBubbleConfig();

    let radius = config.radius;
    let minRadius = config.radius;
    let maxRadius = config.radius;
    
    if (config.sizeMode !== 'uniform') {
        minRadius = config.minRadius;
        maxRadius = config.maxRadius;
        radius = (minRadius + maxRadius) / 2;
    }

    console.log(`[MAIN] Refresh clicked! size=${radius}, min=${minRadius}, max=${maxRadius}, mode=${config.sizeMode}, overlapV=${config.overlapV}, overlapH=${config.overlapH}, flatten=${config.baseFlattenPercent}, arr=${config.arrangement}`);

    // Generate Bubbles from the ORIGINAL geometry
    const bubbleGeo = bubbleGenerator.generateGeometry(
      originalMesh, 
      radius, 
      config.overlapV, 
      config.overlapH, 
      config.baseFlattenPercent, 
      config.arrangement, 
      config.sizeMode, 
      minRadius, 
      maxRadius
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
