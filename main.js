import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Slicer & Bubble Generator
import { setupSlicer, getModelHeight, updateSliceSettings, getCurrentMesh, getOriginalMesh, getClippingPlanes, setSliceTarget, setTargetGeometry, restoreOriginalGeometry } from './src/slicer_v2.js';
import { BubbleGenerator } from './src/bubble_generator.js?v=3';

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
document.getElementById('uploadBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    // Reset bubble mode internals if needed, or just let slicer handle it
    // But slicer target might persist?
    setSliceTarget(null);
    setupSlicer(URL.createObjectURL(file), scene, camera, controls);

    // Potentially uncheck bubble mode?
    // bubbleModeToggle.checked = false; 
    // bubbleSettings.style.display = 'none';
  }
});



// Slider Counter Logic
const slider = document.getElementById('sliceSlider');
const counter = document.getElementById('sliceCounter');

slider.addEventListener('input', (e) => {
  counter.textContent = `Slice ${e.target.value}/${slider.max}`;
});


// --- Adjust Settings Modal Logic ---
const adjustBtn = document.getElementById('adjustBtn');
const settingsModal = document.getElementById('layerSettingsModal');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const applySettingsBtn = document.getElementById('applySettingsBtn');

const layerCountInput = document.getElementById('layerCountInput');
const layerHeightInput = document.getElementById('layerHeightInput');

// Open Modal
adjustBtn.addEventListener('click', () => {
  // Sync current values (approximate if needed, but we start with defaults)
  const currentMax = slider.max;
  const height = getModelHeight();

  layerCountInput.value = currentMax;
  // Calc layer height: Total Height / Count
  const lh = height / currentMax;
  layerHeightInput.value = lh.toFixed(3); // 3 decimals for precision

  settingsModal.style.display = 'flex';
});

// Close Modal
const closeModal = () => {
  settingsModal.style.display = 'none';
};
cancelSettingsBtn.addEventListener('click', closeModal);

// Sync Inputs
layerCountInput.addEventListener('input', () => {
  const count = parseInt(layerCountInput.value) || 1;
  const height = getModelHeight();
  const newLayerHeight = height / count;
  layerHeightInput.value = newLayerHeight.toFixed(3);
});

layerHeightInput.addEventListener('input', () => {
  const lh = parseFloat(layerHeightInput.value) || 0.1;
  const height = getModelHeight();
  const newCount = Math.round(height / lh);
  layerCountInput.value = newCount;
});

// Apply Settings
applySettingsBtn.addEventListener('click', () => {
  const newCount = parseInt(layerCountInput.value);
  if (newCount > 0) {
    updateSliceSettings(newCount);
    closeModal();
  } else {
    alert("Layer count must be greater than 0");
  }
});

// --- Bubble Mode Logic ---
const bubbleModeToggle = document.getElementById('bubbleModeToggle');
const bubbleSettings = document.getElementById('bubbleSettings');
const bubbleSizeSlider = document.getElementById('bubbleSizeSlider');
const bubbleSizeInput = document.getElementById('bubbleSizeInput');
const bubbleOverlapSlider = document.getElementById('bubbleOverlapSlider');
const bubbleOverlapInput = document.getElementById('bubbleOverlapInput');
const baseFlattenSlider = document.getElementById('baseFlattenSlider');
const baseFlattenInput = document.getElementById('baseFlattenInput');
const regenerateBubblesBtn = document.getElementById('regenerateBubblesBtn');

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

// Sync slider -> input
bubbleOverlapSlider.addEventListener('input', (e) => {
  bubbleOverlapInput.value = e.target.value;
});

// Sync input -> slider
bubbleOverlapInput.addEventListener('input', (e) => {
  const val = Math.min(Math.max(parseInt(e.target.value) || 0, 0), 70);
  bubbleOverlapSlider.value = val;
});

// Sync slider -> input for Base Flatten
baseFlattenSlider.addEventListener('input', (e) => {
  baseFlattenInput.value = e.target.value;
});

// Sync input -> slider for Base Flatten
baseFlattenInput.addEventListener('input', (e) => {
  const val = Math.min(Math.max(parseInt(e.target.value) || 0, 0), 100);
  baseFlattenSlider.value = val;
});

regenerateBubblesBtn.addEventListener('click', () => {
  updateBubbleView();
});

function updateBubbleView() {
  // Use the ORIGINAL mesh, not currentMesh (which may already be bubbles)
  const originalMesh = getOriginalMesh();
  if (!originalMesh) {
    console.warn("Bubble Mode: No original mesh available.");
    return;
  }

  if (bubbleModeToggle.checked) {
    const radius = parseFloat(bubbleSizeSlider.value);
    const overlapPercent = parseInt(bubbleOverlapSlider.value);
    const baseFlattenPercent = parseInt(baseFlattenSlider.value);

    console.log(`[MAIN] Refresh clicked! size=${radius}, overlap=${overlapPercent}, flatten=${baseFlattenPercent}`);

    // Generate Bubbles from the ORIGINAL geometry
    const bubbleGeo = bubbleGenerator.generateGeometry(originalMesh, radius, overlapPercent, baseFlattenPercent);

    if (bubbleGeo) {
      // Hand over to Slicer for Visualization (Orange Cut + Caps)
      setTargetGeometry(bubbleGeo, scene, false);
    } else {
      console.warn("Bubble Mode: No geometry generated.");
    }
  }
}
