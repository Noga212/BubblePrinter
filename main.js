import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Slicer & Bubble Generator
import { setupSlicer, getModelHeight, updateSliceSettings, getCurrentMesh, getOriginalMesh, getClippingPlanes, setSliceTarget, setTargetGeometry, restoreOriginalGeometry, setGhostModelVisibility } from './src/slicer_v2.js';
import { BubbleGenerator } from './src/bubble_generator.js?v=8';

console.log("[MAIN] BubblePrinter Version: 25 (Built-in Models)");


// DOM Elements
const app = document.querySelector('#app');

// Z-Up setup is handled by camera.up in scene setup

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a); // Deep Void

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

demoModelSelector.addEventListener('change', async (e) => {
  const modelUrl = e.target.value;
  if (!modelUrl) return;

  try {
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    resetBubbleSettings();
    setSliceTarget(null);
    setupSlicer(objectUrl, scene, camera, controls);
    
    // Reset selector so the same model can be selected again
    demoModelSelector.value = "";
  } catch (error) {
    console.error("Error loading demo model:", error);
    alert("Failed to load demo model.");
    demoModelSelector.value = "";
  }
});

document.getElementById('uploadBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    // Reset bubble mode UI and state
    resetBubbleSettings();

    setSliceTarget(null);
    setupSlicer(URL.createObjectURL(file), scene, camera, controls);
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

const ghostModelToggle = document.getElementById('ghostModelToggle');
if (ghostModelToggle) {
  ghostModelToggle.addEventListener('change', (e) => {
    setGhostModelVisibility(e.target.checked);
  });
}

// --- Bubble Mode Logic ---
const bubbleModeToggle = document.getElementById('bubbleModeToggle');
const bubbleSettings = document.getElementById('bubbleSettings');
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

bubbleModeToggle.addEventListener('change', () => {
  const mesh = getCurrentMesh();
  if (!mesh) {
    alert("Please load a model first.");
    bubbleModeToggle.checked = false;
    return;
  }

  if (bubbleModeToggle.checked) {
    bubbleSettings.style.display = 'block';
    // Hide original mesh if desired? Or keep it?
    // Usually we want to hide certain things or just overlay.
    // For now, let's just generate.
    // mesh.visible = false; // setTargetGeometry will remove it anyway
    updateBubbleView();
  } else {
    bubbleSettings.style.display = 'none';
    // Restore original geometry
    restoreOriginalGeometry(scene);
  }
});

// Sync slider -> input
bubbleSizeSlider.addEventListener('input', (e) => {
  bubbleSizeInput.value = parseFloat(e.target.value).toFixed(2);
});

// Sync input -> slider
bubbleSizeInput.addEventListener('input', (e) => {
  const val = Math.min(Math.max(parseFloat(e.target.value) || 0.01, 0.01), 2.0);
  bubbleSizeSlider.value = val;
});

// Range controls syncing
bubbleMinSlider.addEventListener('input', (e) => {
  if (parseFloat(bubbleMinSlider.value) > parseFloat(bubbleMaxSlider.value)) {
    bubbleMinSlider.value = bubbleMaxSlider.value;
  }
  bubbleMinInput.value = parseFloat(bubbleMinSlider.value).toFixed(2);
});

bubbleMaxSlider.addEventListener('input', (e) => {
  if (parseFloat(bubbleMaxSlider.value) < parseFloat(bubbleMinSlider.value)) {
    bubbleMaxSlider.value = bubbleMinSlider.value;
  }
  bubbleMaxInput.value = parseFloat(bubbleMaxSlider.value).toFixed(2);
});

bubbleMinInput.addEventListener('input', (e) => {
  let val = Math.min(Math.max(parseFloat(e.target.value) || 0.01, 0.01), 2.0);
  if (val > parseFloat(bubbleMaxInput.value)) val = parseFloat(bubbleMaxInput.value);
  bubbleMinSlider.value = val;
});

bubbleMaxInput.addEventListener('input', (e) => {
  let val = Math.min(Math.max(parseFloat(e.target.value) || 0.01, 0.01), 2.0);
  if (val < parseFloat(bubbleMinInput.value)) val = parseFloat(bubbleMinInput.value);
  bubbleMaxSlider.value = val;
});

// Trigger generation on mouse release (change)
bubbleSizeSlider.addEventListener('change', updateBubbleView);
bubbleSizeInput.addEventListener('change', updateBubbleView);
bubbleMinSlider.addEventListener('change', updateBubbleView);
bubbleMaxSlider.addEventListener('change', updateBubbleView);
bubbleMinInput.addEventListener('change', updateBubbleView);
bubbleMaxInput.addEventListener('change', updateBubbleView);
bubbleArrangement.addEventListener('change', updateBubbleView);

bubbleSizeMode.addEventListener('change', (e) => {
  if (e.target.value === 'uniform') {
    uniformSizeControl.style.display = 'block';
    rangeSizeControl.style.display = 'none';
  } else {
    uniformSizeControl.style.display = 'none';
    rangeSizeControl.style.display = 'block';
  }
  updateBubbleView();
});

// Sync Vertical Overlap
bubbleOverlapVSlider.addEventListener('input', (e) => {
  bubbleOverlapVInput.value = e.target.value;
});
bubbleOverlapVInput.addEventListener('input', (e) => {
  const val = Math.min(Math.max(parseInt(e.target.value) || 0, 0), 70);
  bubbleOverlapVSlider.value = val;
});

bubbleOverlapVSlider.addEventListener('change', updateBubbleView);
bubbleOverlapVInput.addEventListener('change', updateBubbleView);

// Sync Horizontal Overlap
bubbleOverlapHSlider.addEventListener('input', (e) => {
  bubbleOverlapHInput.value = e.target.value;
});
bubbleOverlapHInput.addEventListener('input', (e) => {
  const val = Math.min(Math.max(parseInt(e.target.value) || 0, 0), 70);
  bubbleOverlapHSlider.value = val;
});

bubbleOverlapHSlider.addEventListener('change', updateBubbleView);
bubbleOverlapHInput.addEventListener('change', updateBubbleView);

// Sync slider -> input for Base Flatten
baseFlattenSlider.addEventListener('input', (e) => {
  baseFlattenInput.value = e.target.value;
});

// Sync input -> slider for Base Flatten
baseFlattenInput.addEventListener('input', (e) => {
  const val = Math.min(Math.max(parseInt(e.target.value) || 0, 0), 100);
  baseFlattenSlider.value = val;
});

baseFlattenSlider.addEventListener('change', updateBubbleView);
baseFlattenInput.addEventListener('change', updateBubbleView);

/**
 * Resets all bubble settings to default and turns off Bubble Mode.
 */
function resetBubbleSettings() {
  console.log("[MAIN] Resetting bubble settings to defaults...");
  bubbleModeToggle.checked = false;
  bubbleSettings.style.display = 'none';

  // Reset sliders and inputs to defaults
  bubbleSizeSlider.value = 0.5;
  bubbleSizeInput.value = "0.50";
  bubbleMinSlider.value = 0.25;
  bubbleMinInput.value = "0.25";
  bubbleMaxSlider.value = 0.75;
  bubbleMaxInput.value = "0.75";

  bubbleOverlapVSlider.value = 0;
  bubbleOverlapVInput.value = 0;

  bubbleOverlapHSlider.value = 0;
  bubbleOverlapHInput.value = 0;

  baseFlattenSlider.value = 50;
  baseFlattenInput.value = 50;
  
  bubbleArrangement.value = 'grid';
  bubbleSizeMode.value = 'uniform';
  
  uniformSizeControl.style.display = 'block';
  rangeSizeControl.style.display = 'none';
}

function updateBubbleView() {
  // Use the ORIGINAL mesh, not currentMesh (which may already be bubbles)
  const originalMesh = getOriginalMesh();
  if (!originalMesh) {
    console.warn("Bubble Mode: No original mesh available.");
    return;
  }

  if (bubbleModeToggle.checked) {
    const overlapV = parseInt(bubbleOverlapVSlider.value);
    const overlapH = parseInt(bubbleOverlapHSlider.value);
    const baseFlattenPercent = parseInt(baseFlattenSlider.value);
    const arrangement = bubbleArrangement.value;
    const sizeMode = bubbleSizeMode.value;

    let radius, minRadius, maxRadius;
    if (sizeMode === 'uniform') {
        radius = parseFloat(bubbleSizeSlider.value);
        minRadius = radius;
        maxRadius = radius;
    } else {
        minRadius = parseFloat(bubbleMinSlider.value);
        maxRadius = parseFloat(bubbleMaxSlider.value);
        radius = (minRadius + maxRadius) / 2;
    }

    console.log(`[MAIN] Refresh clicked! size=${radius}, min=${minRadius}, max=${maxRadius}, mode=${sizeMode}, overlapV=${overlapV}, overlapH=${overlapH}, flatten=${baseFlattenPercent}, arr=${arrangement}`);

    // Generate Bubbles from the ORIGINAL geometry
    const bubbleGeo = bubbleGenerator.generateGeometry(originalMesh, radius, overlapV, overlapH, baseFlattenPercent, arrangement, sizeMode, minRadius, maxRadius);

    if (bubbleGeo) {
      // Hand over to Slicer for Visualization (Orange Cut + Caps)
      setTargetGeometry(bubbleGeo, scene, false);
    } else {
      console.warn("Bubble Mode: No geometry generated.");
    }
  }
}
