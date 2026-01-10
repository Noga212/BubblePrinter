import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
import { setupSlicer, getModelHeight, updateSliceSettings } from './src/slicer_v2.js';

// Event Listeners for UI
document.getElementById('uploadBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    setupSlicer(URL.createObjectURL(file), scene, camera, controls);
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
