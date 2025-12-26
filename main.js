import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// DOM Elements
const app = document.querySelector('#app');

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a); // Deep Void
scene.fog = new THREE.Fog(0x1a1a1a, 20, 100);

// Grid Helper (Cura Style)
const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
scene.add(gridHelper);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.localClippingEnabled = true; // Crucial for slicing!
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
import { setupSlicer } from './src/slicer.js';

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
  counter.textContent = `Slice ${e.target.value}/200`;
});
