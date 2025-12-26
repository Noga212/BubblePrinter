import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';

let currentMesh = null;
let clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); // Cuts from top down
const loader = new OBJLoader();

export function setupSlicer(url, scene, camera, controls) {
    // Clean up previous mesh
    if (currentMesh) {
        scene.remove(currentMesh);
        if (currentMesh.geometry) {
            currentMesh.geometry.dispose();
            currentMesh.geometry = null;
        }
        if (currentMesh.material) {
            currentMesh.material.dispose();
            currentMesh.material = null;
        }
        currentMesh = null;
    }

    loader.load(url, (object) => {
        // Normalize object scale and center it
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 10 / maxDim; // Fit within 10 units

        object.scale.set(scale, scale, scale);
        // Recalculate box after scaling
        box.setFromObject(object);
        const scaledCenter = box.getCenter(new THREE.Vector3());

        // Center the object around (0,0,0) locally, then lift it to sit on the plane
        object.position.sub(scaledCenter);
        object.position.y += (size.y * scale) / 2;


        // Apply clipping plane to all materials
        object.traverse((child) => {
            if (child.isMesh) {
                child.material.clippingPlanes = [clipPlane];
                child.material.clipShadows = true;
                // Double side for "solid" look (fake)
                child.material.side = THREE.DoubleSide;
                child.material.color = new THREE.Color(0x00E5FF); // Neon Cyan for model
                child.material.transparent = true;
                child.material.opacity = 0.8;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        currentMesh = object;
        scene.add(object);

        // --- Camera & Controls Adjustment ---
        // 1. Point controls at the center of the model (which is now at 0, object.position.y/2, 0 approx, but due to our logic it's centered at origin then lifted)
        // actually our previous logic: object.position.sub(scaledCenter) effectively puts center at 0,0,0. 
        // Then object.position.y += ... moves it up. 
        // So the visual center of the object is at (0, (size.y * scale) / 2, 0).

        const newCenter = new THREE.Vector3(0, (size.y * scale) / 2, 0);
        controls.target.copy(newCenter);

        // 2. Position camera to fit the object
        // Fit logic: standard trick using FOV.
        const fov = camera.fov * (Math.PI / 180);

        // Calculate distance needed to fit the object height or width
        // Object size represented by '10' (since we scaled maxDim to 10)
        // Let's add some margin, say 1.5x
        const dist = Math.abs(10 / Math.sin(fov / 2)) * 0.8;

        // Position camera diagonally properly
        camera.position.set(dist, dist * 0.8, dist);

        camera.lookAt(newCenter);
        controls.update();


        // Initialize slider range based on mapped height
        const slider = document.getElementById('sliceSlider');
        const height = size.y * scale;
        const maxLimit = height * 1.05;

        // Reset slider to top (200)
        slider.value = slider.max; // Should be 200
        slider.step = 1; // Ensure integer steps

        // Dispatch input event so valid counter text is shown (otherwise it might say 0/200 if browser cached it)
        slider.dispatchEvent(new Event('input'));

        slider.oninput = (e) => {
            const ratio = e.target.value / e.target.max; // 0 to 1
            clipPlane.constant = ratio * maxLimit;
        };

        // Trigger initial update
        clipPlane.constant = maxLimit;

        console.log("Model loaded", object);
    }, (xhr) => {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    }, (error) => {
        console.error('An error happened', error);
    });
}
