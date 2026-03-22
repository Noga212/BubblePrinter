import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

import { getSliceContours } from './geometry_utils_v2.js';

let currentMesh = null;
let originalMesh = null; // Store original loaded mesh
let activeSliceTarget = null; // Mesh to be sliced (can be separate from loaded mesh)
let sliceGroup = new THREE.Group(); // Container for slice contours
let debugGroup = new THREE.Group(); // Container for debug visuals
let ghostMesh = null;
let capMesh = null;
let useCaps = true; // State for cap rendering
const bottomClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // Keeps Z < constant
const topClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);    // Keeps Z > -constant
const loader = new OBJLoader();
let modelHeight = 10; // Dynamic current height
let originalModelHeight = 10; // Saved original height


/**
 * Extracts raw (x, y) coordinates of the intersection of the object with plane Z = z0.
 * @param {THREE.Object3D} object 
 * @param {number} z0 
 * @returns {Array<[number, number]>}
 */
export function getSlicePoints(object, z0) {
    const points = [];
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const v3 = new THREE.Vector3();

    object.traverse((child) => {
        if (child.isMesh) {
            const geometry = child.geometry;
            const matrixWorld = child.matrixWorld;
            const position = geometry.attributes.position;

            if (!position) return;

            const index = geometry.index;
            const count = index ? index.count : position.count;

            for (let i = 0; i < count; i += 3) {
                // Get local triangle vertices
                if (index) {
                    v1.fromBufferAttribute(position, index.getX(i));
                    v2.fromBufferAttribute(position, index.getX(i + 1));
                    v3.fromBufferAttribute(position, index.getX(i + 2));
                } else {
                    v1.fromBufferAttribute(position, i);
                    v2.fromBufferAttribute(position, i + 1);
                    v3.fromBufferAttribute(position, i + 2);
                }

                // Transform to world coordinates
                v1.applyMatrix4(matrixWorld);
                v2.applyMatrix4(matrixWorld);
                v3.applyMatrix4(matrixWorld);

                // Check intersection with Z = z0
                const edges = [[v1, v2], [v2, v3], [v3, v1]];
                for (const [pa, pb] of edges) {
                    // Check if edge crosses the z0 plane
                    if ((pa.z >= z0 && pb.z < z0) || (pa.z < z0 && pb.z >= z0)) {
                        const t = (z0 - pa.z) / (pb.z - pa.z);
                        const x = pa.x + t * (pb.x - pa.x);
                        const y = pa.y + t * (pb.y - pa.y);
                        points.push([x, y]);
                    }
                }
            }
        }
    });

    // For legacy support or direct extraction, we keep this simple version
    // but the main logic now uses getSliceContours for ordered polygons.
    return points;
}

export function setupSlicer(url, scene, camera, controls) {
    // Clean up previous mesh and slice
    if (currentMesh) {
        scene.remove(currentMesh);
        if (ghostMesh) scene.remove(ghostMesh);

        currentMesh.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });

        if (ghostMesh) {
            ghostMesh.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        }

        sliceGroup.clear();
        currentMesh = null;
        ghostMesh = null;
        capMesh = null;
        useCaps = true; // Reset to default
    }

    sliceGroup = new THREE.Group();
    scene.add(sliceGroup);

    debugGroup = new THREE.Group();
    scene.add(debugGroup);

    loader.load(url, (object) => {
        // Normalize object scale and center it
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 10 / maxDim; // Fit within 10 units

        object.scale.set(scale, scale, scale);
        // Correct rotation for Z-up (Standard OBJ is usually Y-up)
        object.rotation.x = Math.PI / 2;

        // Recalculate box after scaling AND rotation to get correct world bounds
        box.setFromObject(object);
        const newSize = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Center on grid (XY plane), sitting on Z=0
        // We subtract the current center to move it to (0,0,0)
        object.position.sub(center);
        // Then we add half of the NEW height to lift the bottom to Z=0
        object.position.z += newSize.z / 2;

        modelHeight = newSize.z;
        originalModelHeight = newSize.z;
        console.log('Model aligned. Height:', newSize.z);

        // Visual Box Helper disabled
        // const boxHelper = new THREE.BoxHelper(object, 0xffff00);
        // debugGroup.add(boxHelper);

        // Apply styles to materials
        console.log('Starting traversal for material application...');
        object.traverse((child) => {
            if (child.isMesh) {
                // SOLID BOTTOM MATERIAL
                child.material = new THREE.MeshPhongMaterial({
                    color: 0xffaa00, // Orange
                    emissive: 0x222222,
                    specular: 0x111111,
                    shininess: 30,
                    side: THREE.DoubleSide,
                    flatShading: true,
                    clippingPlanes: [bottomClipPlane],
                    clipShadows: true
                });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        currentMesh = object;
        originalMesh = object; // Save reference
        scene.add(object);

        // CREATE GHOST OBJECT (Top Half)
        ghostMesh = object.clone();
        ghostMesh.traverse((child) => {
            if (child.isMesh) {
                // GHOST TOP MATERIAL
                child.material = new THREE.MeshBasicMaterial({
                    color: 0x888888,
                    transparent: true,
                    opacity: 0.15,
                    side: THREE.DoubleSide,
                    clippingPlanes: [topClipPlane],
                    depthWrite: false, // Don't block the solid object
                });
                child.castShadow = false;
                child.receiveShadow = false;
            }
        });
        scene.add(ghostMesh);

        // Adjust camera target
        const newCenter = new THREE.Vector3(0, 0, (size.z * scale) / 2);
        controls.target.copy(newCenter);
        controls.update();

        // Initialize slider range based on CORRECT world height
        const slider = document.getElementById('sliceSlider');
        const height = newSize.z; // Use the rotated/aligned height
        const maxLimit = height;

        slider.max = 200;
        slider.value = 200;
        slider.step = 1;

        // Initialize clipping plane to top
        bottomClipPlane.constant = height;
        topClipPlane.constant = -height; // Initial top plane allows everything above -height (so everything)

        slider.oninput = (e) => {
            const ratio = e.target.value / e.target.max; // 0 to 1
            const z0 = ratio * modelHeight; // Use dynamic modelHeight!

            // Update clipping planes
            // Bottom keeps < z0.
            bottomClipPlane.constant = z0;
            // Top keeps > z0. Plane formula A*x + B*y + C*z + D = 0.
            // Normal (0,0,1). z + D > 0 => z > -D. We want z > z0. So -D = z0 => D = -z0.
            topClipPlane.constant = -z0;

            // Clear previous slice visualization
            sliceGroup.clear();

            // Ensure matrices are up to date before slicing
            currentMesh.updateMatrixWorld(true);

            // Update visual plane
            // if (slicePlaneMesh) {
            //     slicePlaneMesh.visible = true;
            //     slicePlaneMesh.position.set(0, 0, z0);
            // }

            // Ensure matrices are up to date before slicing
            currentMesh.updateMatrixWorld(true);

            // Real Geometric Slicing - Returns array of arrays of points
            const target = activeSliceTarget || currentMesh;
            if (activeSliceTarget) {
                target.updateMatrixWorld(true);
            }

            // Debug / UI Update
            const typeLabel = document.querySelector('.slice-preview-panel h3');
            if (typeLabel) {
                typeLabel.textContent = activeSliceTarget ? '2D Slice Preview (Bubbles)' : '2D Slice Preview (Original)';
            }

            console.log(`[Slicer] Slicing target: ${activeSliceTarget ? 'BubbleMesh' : 'OriginalMesh'} at Z=${z0.toFixed(2)}`);
            const polygons = getSliceContours(target, z0);

            if (polygons.length > 0) {
                // 1. Draw Contours (Blue Line) - Only if caps enabled (or make a separate setting? For now link to caps)
                if (useCaps) {
                    polygons.forEach(polygon => {
                        const points = polygon.map(p => new THREE.Vector3(p[0], p[1], z0));
                        const geometry = new THREE.BufferGeometry().setFromPoints(points);
                        // Thick blue line, always on top
                        const material = new THREE.LineBasicMaterial({
                            color: 0x00E5FF,
                            linewidth: 2,
                            depthTest: false,
                            depthWrite: false
                        });
                        const line = new THREE.LineLoop(geometry, material);
                        line.renderOrder = 999; // Ensure it draws last
                        sliceGroup.add(line);
                    });
                }

                // 2. Generate Cap Mesh (Highlighted Plane)
                const shapes = [];
                polygons.forEach(polygon => {
                    // Create Shape
                    const shape = new THREE.Shape();
                    if (polygon.length > 0) {
                        shape.moveTo(polygon[0][0], polygon[0][1]);
                        for (let i = 1; i < polygon.length; i++) {
                            shape.lineTo(polygon[i][0], polygon[i][1]);
                        }
                        shape.closePath();
                        shapes.push(shape);
                    }
                });

                if (useCaps && shapes.length > 0) {
                    const capGeo = new THREE.ShapeGeometry(shapes);
                    const capMat = new THREE.MeshBasicMaterial({
                        color: 0x00E5FF, // Cyan glow
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.5,
                        depthTest: true
                    });
                    // Slight Z-offset to prevent z-fighting with the clip face
                    capMesh = new THREE.Mesh(capGeo, capMat);
                    capMesh.position.z = z0 + 0.001;
                    sliceGroup.add(capMesh);
                }

                console.log(`Slice at Z=${z0.toFixed(2)}: Found ${polygons.length} contours.`);
            }

            // Draw to 2D Canvas
            const canvas = document.getElementById('sliceCanvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                drawSliceToCanvas(ctx, polygons, canvas.width, canvas.height);
            }
        };

        // Trigger initial update
        slider.dispatchEvent(new Event('input'));

        console.log("Model loaded with Z-up", object);
    }, undefined, (error) => {
        console.error('An error happened', error);
    });
}

/**
 * Draws the slice polygons onto a 2D canvas context.
 * Assumes the model is centered at (0,0) and scaled to approx 10 units max dimension.
 * @param {CanvasRenderingContext2D} ctx 
 * @param {Array<Array<[number, number]>>} polygons 
 * @param {number} width 
 * @param {number} height 
 */
function drawSliceToCanvas(ctx, polygons, width, height) {
    // Clear with semi-transparent background to show it's active
    ctx.clearRect(0, 0, width, height);

    // Optional: Draw grid or center cross
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Style for slice
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';

    const scale = 20; // 20px per unit. Model is ~10 units -> 200px. Canvas is 300px. Fits well.
    const cx = width / 2;
    const cy = height / 2;

    ctx.beginPath();
    for (const polygon of polygons) {
        if (polygon.length === 0) continue;

        // Move to first point
        const startX = cx + polygon[0][0] * scale;
        const startY = cy - polygon[0][1] * scale; // Invert Y
        ctx.moveTo(startX, startY);

        for (let i = 1; i < polygon.length; i++) {
            const px = cx + polygon[i][0] * scale;
            const py = cy - polygon[i][1] * scale;
            ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
}

export function getModelHeight() {
    return modelHeight;
}

export function updateSliceSettings(layerCount) {
    const slider = document.getElementById('sliceSlider');
    const counter = document.getElementById('sliceCounter');

    // Update Slider
    slider.max = layerCount;
    slider.value = layerCount; // Reset to top

    // Trigger update
    slider.dispatchEvent(new Event('input'));

    // Update Counter Text immediately
    if (counter) {
        counter.textContent = `Slice ${layerCount}/${layerCount}`;
    }
}



export function getCurrentMesh() {
    return currentMesh;
}

export function getOriginalMesh() {
    return originalMesh;
}

export function getClippingPlanes() {
    return [bottomClipPlane, topClipPlane];
}

export function restoreOriginalGeometry(scene) {
    if (!originalMesh) {
        console.warn("No original mesh to restore.");
        return;
    }
    console.log("Restoring original mesh...");

    // remove current (bubbles)
    if (currentMesh) {
        scene.remove(currentMesh);
        // dont dispose geometry if it's the original!
        if (currentMesh !== originalMesh && currentMesh.geometry) {
            // If it's bubbles, we can dispose. 
            // But we need to know if currentMesh IS originalMesh.
            // If we switched currentMesh to point to a new Mesh(bubbleGeo), then it's distinct.
            currentMesh.geometry.dispose();
        }
    }
    if (ghostMesh) {
        scene.remove(ghostMesh);
        if (ghostMesh.geometry) ghostMesh.geometry.dispose();
    }

    // Restore Original
    currentMesh = originalMesh;
    modelHeight = originalModelHeight; // Restore height
    scene.add(currentMesh);

    // Re-create ghost for original? 
    // The original loader created a ghostMesh, but we probably lost reference or disposed it if we ran setTargetGeometry.
    // Actually setTargetGeometry disposes ghostMesh.
    // So we need to recreate Ghost for original.

    ghostMesh = originalMesh.clone();
    ghostMesh.traverse((child) => {
        if (child.isMesh) {
            child.material = new THREE.MeshBasicMaterial({
                color: 0x888888,
                transparent: true,
                opacity: 0.15,
                side: THREE.DoubleSide,
                clippingPlanes: [topClipPlane],
                depthWrite: false,
            });
            child.castShadow = false;
            child.receiveShadow = false;
        }
    });
    scene.add(ghostMesh);

    setSliceTarget(currentMesh);
}

/**
 * Sets a generic geometry as the main slice target.
 * Replaces the loaded OBJ visualization with this geometry.
 * @param {THREE.BufferGeometry} geometry 
 * @param {THREE.Scene} scene 
 * @param {boolean} renderCaps 
 */
export function setTargetGeometry(geometry, scene, renderCaps = true) {
    if (!geometry) {
        console.error("setTargetGeometry called with null geometry");
        return;
    }

    console.log("[Slicer] Setting target geometry (Bubbles)...");

    // 1. Cleanup existing currentMesh
    if (currentMesh) {
        scene.remove(currentMesh);
        if (currentMesh.geometry && currentMesh !== originalMesh) {
            currentMesh.geometry.dispose();
        }
    }
    if (ghostMesh) {
        scene.remove(ghostMesh);
        if (ghostMesh.geometry) ghostMesh.geometry.dispose();
    }

    // 2. Create Solid Mesh (Bottom)
    // Ensure normals are computed for Phong material
    if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
    }

    const material = new THREE.MeshPhongMaterial({
        color: 0xffaa00, // Orange
        emissive: 0x222222,
        specular: 0x111111,
        shininess: 30,
        side: THREE.DoubleSide,
        flatShading: true,
        clippingPlanes: [bottomClipPlane],
        clipShadows: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    currentMesh = mesh;
    scene.add(mesh);

    // 3. Create Ghost Mesh (Top/Ghost)
    // We clone the geometry for the ghost to avoid shared state issues if we need them separate (though referencing same geo is usually fine, cloning is safer for disposal logic)
    // ACTUALLY: Cloning geometry is expensive. Let's reuse if possible, or shallow clone.
    // But `setTargetGeometry` passed a fresh `bubbleGeo`.
    // Let's use the same geometry but different material.
    const ghostMat = new THREE.MeshBasicMaterial({
        color: 0xababab, // Slightly lighter grey
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        clippingPlanes: [topClipPlane],
        depthWrite: false, // Important for ghosts
    });

    // Reuse geometry?
    ghostMesh = new THREE.Mesh(geometry, ghostMat);
    scene.add(ghostMesh);
    console.log("[Slicer] Ghost Mesh created and added.");

    // Update Height logic
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
        modelHeight = geometry.boundingBox.max.z;
        console.log("Updated modelHeight for bubbles:", modelHeight);
    }

    // 4. Update Slice Target
    useCaps = renderCaps; // Update state
    setSliceTarget(currentMesh);
}

export function setSliceTarget(mesh) {
    activeSliceTarget = mesh;
    console.log("[Slicer] setSliceTarget called. Mesh present?", !!mesh);

    // Force update of the slider to apply clipping planes to the new materials immediately
    const slider = document.getElementById('sliceSlider');
    if (slider) {
        // We need to make sure the slider reflects the current height physically or logically?
        // The slider max is set by layer count usually, but the clipping logic relies on slider.value/max * modelHeight.
        // We just trigger input to re-run the plane updates.
        slider.dispatchEvent(new Event('input'));
    }
}

