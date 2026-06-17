import * as THREE from 'three';
import { getSliceContours, distanceToContours, getOrangesPointsInContours, getHexagonsPointsInContours, getRejectionSamplingPointsInContours, getGridPointsInContours, isPointInContours, getPoissonPointsInContours, applyLloydRelaxation, apply3DLloydRelaxation } from './geometry_utils_v2.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export class BubbleGenerator {
    /**
     * Merged BufferGeometry of bubbles based on the input mesh.
     * @param {THREE.Object3D} mesh - Reference mesh to slice
     * @param {Object} config - Bubble configuration (from AppState.bubble)
     * @param {Object} advanced - Advanced configuration (from AppState.advanced)
     * @returns {THREE.BufferGeometry|null}
     */
    generateGeometry(mesh, config, advanced) {
        this.bubbles = []; // Initialize bubble data
        let radius = config.radius;
        let minRadius = config.radius;
        let maxRadius = config.radius;
        
        if (config.sizeMode !== 'uniform') {
            minRadius = config.minRadius;
            maxRadius = config.maxRadius;
            radius = (minRadius + maxRadius) / 2;
        }

        console.log(`[BubbleGenerator] Generating Mode: ${config.sizeMode}, radius ${radius}, minRadius ${minRadius}, maxRadius ${maxRadius}, overlapV ${config.overlapV}%, overlapH ${config.overlapH}%, baseFlatten ${config.baseFlattenPercent}%, arr ${config.arrangement}`);

        const geometries = [];

        // 1. Calculate Bounds
        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        const minZ = box.min.z;
        const maxZ = box.max.z;

        // Calculate steps based on overlap
        const overlapFactorV = 1 - (config.overlapV / 100);
        const overlapFactorH = 1 - (config.overlapH / 100);

        const meanRadius = radius;

        let firstLayerRadius = meanRadius;
        if (config.sizeMode === 'z_gradient_down') firstLayerRadius = maxRadius;
        if (config.sizeMode === 'z_gradient_up') firstLayerRadius = minRadius;

        // Base Flattening Logic:
        const thetaLength = Math.PI * (1 - (Math.max(0, Math.min(100, config.baseFlattenPercent)) / 100));

        if (config.sizeMode === 'shell_gradient_in' || config.sizeMode === 'adaptive') {
            return this.generate3DPacking(mesh, box, meanRadius, minRadius, maxRadius, overlapFactorH, overlapFactorV, config.baseFlattenPercent, config.sizeMode, thetaLength, advanced, config);
        }

        const baseZOffset = - (firstLayerRadius * Math.cos(thetaLength));
        let centerZ = minZ + baseZOffset;

        console.log(`[BubbleGenerator] baseFlatten=${config.baseFlattenPercent}%, centerZ0=${centerZ.toFixed(3)}`);

        let layerIndex = 0;

        // Determine sphere resolution
        let widthSegments = 16, heightSegments = 12;
        if (advanced.resolution === 'low') {
            widthSegments = 8; heightSegments = 6;
        } else if (advanced.resolution === 'high') {
            widthSegments = 32; heightSegments = 24;
        }

        // Loop until we reach the top of the model
        while (true) {
            let currentLayerRadius = meanRadius;
            let currentZProgress = (maxZ > minZ) ? Math.max(0, Math.min(1, (centerZ - minZ) / (maxZ - minZ))) : 0;
            
            // Map transition range
            let t = 0;
            const startT = (advanced.zGradientStart !== undefined ? advanced.zGradientStart : 0) / 100;
            const endT = (advanced.zGradientEnd !== undefined ? advanced.zGradientEnd : 100) / 100;
            if (currentZProgress <= startT) {
                t = 0;
            } else if (currentZProgress >= endT) {
                t = 1;
            } else {
                t = (currentZProgress - startT) / (endT - startT);
            }

            // Apply curve exponent
            const exponent = advanced.gradientExponent !== undefined ? advanced.gradientExponent : 1.0;
            if (exponent !== 1.0) {
                t = Math.pow(t, exponent);
            }

            if (config.sizeMode === 'z_gradient_down') {
                currentLayerRadius = maxRadius - t * (maxRadius - minRadius);
            } else if (config.sizeMode === 'z_gradient_up') {
                currentLayerRadius = minRadius + t * (maxRadius - minRadius);
            }

            // If the bottom of the current bubble is above maxZ, we stop.
            if (centerZ - currentLayerRadius > maxZ) break;

            // Define a sampling height for the mesh contours.
            let sampleZ = Math.min(maxZ - 0.01, Math.max(minZ + 0.01, centerZ));

            const contours = getSliceContours(mesh, sampleZ);

            if (contours.length > 0) {
                let points = [];
                
                let horizontalStep = (currentLayerRadius * 2) * overlapFactorH;

                if (config.arrangement === 'oranges') {
                    points = getOrangesPointsInContours(contours, box, horizontalStep, layerIndex);
                } else if (config.arrangement === 'hexagons') {
                    points = getHexagonsPointsInContours(contours, box, horizontalStep, layerIndex);
                } else if (config.arrangement === 'rejection') {
                    points = getRejectionSamplingPointsInContours(contours, box, horizontalStep, layerIndex);
                } else if (config.arrangement === 'poisson') {
                    const poissonSpacing = ((config.poissonRadius || 0.5) * 2) * overlapFactorH;
                    points = getPoissonPointsInContours(contours, box, poissonSpacing, layerIndex);
                } else {
                    points = getGridPointsInContours(contours, box, horizontalStep);
                }

                // Apply Lloyd's Relaxation if applicable
                if ((config.arrangement === 'rejection' || config.arrangement === 'poisson') && config.lloydIterations > 0) {
                    const step = config.arrangement === 'poisson' ? ((config.poissonRadius || 0.5) * 2) * overlapFactorH : horizontalStep;
                    points = applyLloydRelaxation(points, contours, box, step, config.lloydIterations);
                }

                // Apply Jitter Modifier if applicable
                if ((config.arrangement === 'grid' || config.arrangement === 'oranges' || config.arrangement === 'hexagons') && config.jitterPercent > 0) {
                    const maxDisplacement = (config.jitterPercent / 100) * currentLayerRadius;
                    let jitterSeed = layerIndex * 9997 + 13;
                    const jRand = () => {
                        let x = Math.sin(jitterSeed++) * 10000;
                        return x - Math.floor(x);
                    };

                    points = points.map(p => {
                        const angle = jRand() * Math.PI * 2;
                        const mag = jRand() * maxDisplacement;
                        const nx = p.x + Math.cos(angle) * mag;
                        const ny = p.y + Math.sin(angle) * mag;
                        if (isPointInContours(nx, ny, contours)) {
                            return { x: nx, y: ny };
                        }
                        return p;
                    });
                }

                let capReached = false;
                for (let k = 0; k < points.length; k++) {
                    if (geometries.length >= ((advanced.maxBubbles || 10000) * 1.5)) {
                        console.warn(`[BubbleGenerator] Capping bubbles to max limit: ${geometries.length}`);
                        capReached = true;
                        break;
                    }
                    const p = points[k];
                    this.bubbles.push({ x: p.x, y: p.y, z: centerZ, radius: currentLayerRadius, layerIndex, unshiftedZ: centerZ });
                    const matrix = new THREE.Matrix4().makeTranslation(p.x, p.y, centerZ);

                    let geo;
                    if (layerIndex === 0) {
                        geo = new THREE.SphereGeometry(currentLayerRadius, widthSegments, heightSegments, 0, Math.PI * 2, 0, thetaLength);
                    } else {
                        geo = new THREE.SphereGeometry(currentLayerRadius, widthSegments, heightSegments);
                    }

                    // Rotate ALL spheres so poles are on the Z axis (Vertical).
                    geo.rotateX(Math.PI / 2);

                    geometries.push(geo.clone().applyMatrix4(matrix));
                }
                if (capReached) break;
            }

            let layerStep = (currentLayerRadius * 2) * overlapFactorV;
            if (config.arrangement === 'oranges' || config.arrangement === 'hexagons') {
                layerStep = (currentLayerRadius * 2) * Math.sqrt(2/3) * overlapFactorV;
            }
            
            centerZ += layerStep;
            layerIndex++;

            // Safety break
            if (layerIndex > (advanced.maxLayers || 100)) break;
        }

        if (geometries.length > 0) {
            console.log(`[BubbleGenerator] Merged ${geometries.length} bubbles.`);
            const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
            mergedGeo.computeBoundingBox();
            const minZ = mergedGeo.boundingBox.min.z;
            if (minZ !== 0) {
                mergedGeo.translate(0, 0, -minZ);
                if (this.bubbles) {
                    this.bubbles.forEach(b => b.z -= minZ);
                }
            }
            return mergedGeo;
        } else {
            console.warn('[BubbleGenerator] No bubbles generated.');
            return null;
        }
    }

    generate3DPacking(mesh, box, meanRadius, minRadius, maxRadius, overlapFactorH, overlapFactorV, baseFlattenPercent, sizeMode, thetaLength, advanced, config) {
        console.log(`[BubbleGenerator] Using 3D Advancing Front for ${sizeMode}`);
        const geometries = [];
        const bubbles = [];
        const active = [];
        
        const minZ = box.min.z;
        const maxZ = box.max.z;
        const startZ = minZ - (minRadius * Math.cos(thetaLength));
        
        // Determine sphere resolution
        let widthSegments = 16, heightSegments = 12;
        if (advanced.resolution === 'low') {
            widthSegments = 8; heightSegments = 6;
        } else if (advanced.resolution === 'high') {
            widthSegments = 32; heightSegments = 24;
        }

        const sliceCache = new Map();
        const getContours = (z) => {
            const zKey = Math.round(z / 0.1);
            if (sliceCache.has(zKey)) return sliceCache.get(zKey);
            const sampleZ = Math.min(maxZ - 0.01, Math.max(minZ + 0.01, zKey * 0.1));
            const contours = getSliceContours(mesh, sampleZ);
            sliceCache.set(zKey, contours);
            return contours;
        };

        const evaluateRadius = (x, y, z, contours) => {
            const dist = distanceToContours(x, y, contours);
            const maxShellDepth = maxRadius * (advanced.shellDepthMultiplier || 3.0);
            if (sizeMode === 'adaptive') {
                if (dist < maxShellDepth * (advanced.innerThreshold !== undefined ? advanced.innerThreshold / 100 : 0.33)) return minRadius;
                if (dist < maxShellDepth * (advanced.outerThreshold !== undefined ? advanced.outerThreshold / 100 : 0.66)) return minRadius + (maxRadius - minRadius) / 2;
                return maxRadius;
            } else {
                let t = Math.min(dist / maxShellDepth, 1.0);
                const exponent = advanced.gradientExponent !== undefined ? advanced.gradientExponent : 1.0;
                if (exponent !== 1.0) {
                    t = Math.pow(t, exponent);
                }
                return minRadius + t * (maxRadius - minRadius);
            }
        };

        const cellSize = maxRadius * 2.1;
        const grid = new Map();
        const addGrid = (b) => {
            const k = `${Math.floor(b.x/cellSize)},${Math.floor(b.y/cellSize)},${Math.floor(b.z/cellSize)}`;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(b);
        };

        const seedSpacing = (config.arrangement === 'poisson') ? ((config.poissonRadius || 0.5) * 2 * overlapFactorH) : (minRadius * 2 * overlapFactorH);
        
        let currentStartZ = startZ;
        let initialPoints = [];
        let firstLayerContours = [];
        
        while (currentStartZ <= maxZ) {
            firstLayerContours = getContours(currentStartZ);
            if (firstLayerContours.length > 0) {
                if (config.arrangement === 'oranges') {
                    initialPoints = getOrangesPointsInContours(firstLayerContours, box, seedSpacing, 0);
                } else if (config.arrangement === 'hexagons') {
                    initialPoints = getHexagonsPointsInContours(firstLayerContours, box, seedSpacing, 0);
                } else if (config.arrangement === 'rejection') {
                    initialPoints = getRejectionSamplingPointsInContours(firstLayerContours, box, seedSpacing, 0);
                } else if (config.arrangement === 'poisson') {
                    initialPoints = getPoissonPointsInContours(firstLayerContours, box, seedSpacing, 0);
                } else {
                    initialPoints = getGridPointsInContours(firstLayerContours, box, seedSpacing);
                }
                
                if (initialPoints.length > 0) {
                    break;
                }
            }
            currentStartZ += seedSpacing;
        }

        if (initialPoints.length === 0) return null;
        
        initialPoints.forEach(p => {
            const r = evaluateRadius(p.x, p.y, currentStartZ, firstLayerContours);
            let overlap = false;
            for(let b of bubbles) {
                const ex = (p.x - b.x) / overlapFactorH;
                const ey = (p.y - b.y) / overlapFactorH;
                const req = r + b.radius;
                if (ex*ex + ey*ey < req*req - 0.001) { overlap = true; break; }
            }
            if (!overlap) {
                const nb = { x: p.x, y: p.y, z: currentStartZ, radius: r };
                bubbles.push(nb);
                active.push(nb);
                addGrid(nb);
            }
        });

        let seed = 12345;
        const sRand = () => { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); };

        const shuffle = (array) => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(sRand() * (i + 1));
                const temp = array[i];
                array[i] = array[j];
                array[j] = temp;
            }
            return array;
        };

        let iter = 0;
        const maxIterations = advanced.maxIterations3D || 300000;
        const maxBubbles = advanced.maxBubbles || 10000;

        while (active.length > 0 && iter++ < maxIterations) {
            const idx = Math.floor(sRand() * active.length);
            const b = active[idx];
            let added = false;
            
            let directions = [];
            if (config.arrangement === 'grid') {
                directions = shuffle([
                    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
                    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
                    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
                ]);
            } else if (config.arrangement === 'oranges') {
                const hy1 = Math.sqrt(3) / 2;
                const hy2 = Math.sqrt(3) / 6;
                const hy3 = Math.sqrt(3) / 3;
                const hz = Math.sqrt(2 / 3);
                directions = shuffle([
                    // In-plane neighbors
                    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
                    { x: 0.5, y: hy1, z: 0 }, { x: -0.5, y: hy1, z: 0 },
                    { x: 0.5, y: -hy1, z: 0 }, { x: -0.5, y: -hy1, z: 0 },
                    // Lower neighbors (valleys)
                    { x: 0.5, y: hy2, z: -hz }, { x: -0.5, y: hy2, z: -hz }, { x: 0, y: -hy3, z: -hz },
                    // Upper neighbors (C placement for FCC)
                    { x: 0.5, y: -hy2, z: hz }, { x: -0.5, y: -hy2, z: hz }, { x: 0, y: hy3, z: hz }
                ]);
            } else if (config.arrangement === 'hexagons') {
                const hy1 = Math.sqrt(3) / 2;
                const hy2 = Math.sqrt(3) / 6;
                const hy3 = Math.sqrt(3) / 3;
                const hz = Math.sqrt(2 / 3);
                directions = shuffle([
                    // In-plane neighbors
                    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
                    { x: 0.5, y: hy1, z: 0 }, { x: -0.5, y: hy1, z: 0 },
                    { x: 0.5, y: -hy1, z: 0 }, { x: -0.5, y: -hy1, z: 0 },
                    // Lower neighbors (valleys)
                    { x: 0.5, y: hy2, z: -hz }, { x: -0.5, y: hy2, z: -hz }, { x: 0, y: -hy3, z: -hz },
                    // Upper neighbors (A placement for HCP - same XY offsets as lower plane)
                    { x: 0.5, y: hy2, z: hz }, { x: -0.5, y: hy2, z: hz }, { x: 0, y: -hy3, z: hz }
                ]);
            } else {
                for (let i = 0; i < 30; i++) {
                    const theta = sRand() * Math.PI * 2;
                    const phi = Math.acos(2 * sRand() - 1);
                    directions.push({
                        x: Math.sin(phi) * Math.cos(theta),
                        y: Math.sin(phi) * Math.sin(theta),
                        z: Math.cos(phi)
                    });
                }
            }
            
            for (let i = 0; i < directions.length; i++) {
                const dir = directions[i];
                const dirX = dir.x * overlapFactorH;
                const dirY = dir.y * overlapFactorH;
                const dirZ = dir.z * overlapFactorV;
                
                const guessR = (minRadius + maxRadius) / 2;
                const tempX = b.x + dirX * (b.radius + guessR);
                const tempY = b.y + dirY * (b.radius + guessR);
                const tempZ = b.z + dirZ * (b.radius + guessR);
                
                if (tempZ < minZ || tempZ > maxZ) continue;
                const contours = getContours(tempZ);
                if (!isPointInContours(tempX, tempY, contours)) continue;
                
                const r = evaluateRadius(tempX, tempY, tempZ, contours);
                
                const cx = b.x + dirX * (b.radius + r);
                const cy = b.y + dirY * (b.radius + r);
                const cz = b.z + dirZ * (b.radius + r);
                
                if (cz < minZ || cz > maxZ) continue;
                const finalContours = getContours(cz);
                if (!isPointInContours(cx, cy, finalContours)) continue;
                
                let overlap = false;
                const hx = Math.floor(cx/cellSize);
                const hy = Math.floor(cy/cellSize);
                const hz = Math.floor(cz/cellSize);
                
                for(let dx=-1; dx<=1; dx++){
                    for(let dy=-1; dy<=1; dy++){
                        for(let dz=-1; dz<=1; dz++){
                            const k = `${hx+dx},${hy+dy},${hz+dz}`;
                            const cell = grid.get(k);
                            if(cell) {
                                for(let cb of cell) {
                                    const ex = (cx - cb.x) / overlapFactorH;
                                    const ey = (cy - cb.y) / overlapFactorH;
                                    const ez = (cz - cb.z) / overlapFactorV;
                                    const d2 = ex*ex + ey*ey + ez*ez;
                                    const req = r + cb.radius;
                                    if (d2 < req * req - 0.001) {
                                        overlap = true; break;
                                    }
                                }
                            }
                            if(overlap) break;
                        }
                        if(overlap) break;
                    }
                    if(overlap) break;
                }
                
                if (!overlap) {
                    const nb = { x: cx, y: cy, z: cz, radius: r };
                    bubbles.push(nb);
                    active.push(nb);
                    addGrid(nb);
                    added = true;
                    break;
                }
            }
            
            if (!added) active.splice(idx, 1);
            if (bubbles.length > maxBubbles) break;
        }

        let finalBubbles = bubbles;

        // Apply 3D Lloyd's Relaxation if applicable
        if ((config.arrangement === 'rejection' || config.arrangement === 'poisson') && config.lloydIterations > 0) {
            finalBubbles = apply3DLloydRelaxation(bubbles, mesh, box, meanRadius, config.lloydIterations);
        }

        // Apply 3D Jitter if applicable
        if ((config.arrangement === 'grid' || config.arrangement === 'oranges' || config.arrangement === 'hexagons') && config.jitterPercent > 0) {
            let jitterSeed = 54321;
            const jRand = () => {
                let x = Math.sin(jitterSeed++) * 10000;
                return x - Math.floor(x);
            };

            finalBubbles = finalBubbles.map(b => {
                const maxDisplacement = (config.jitterPercent / 100) * b.radius;
                const theta = jRand() * Math.PI * 2;
                const phi = Math.acos(2 * jRand() - 1);
                const dx = Math.sin(phi) * Math.cos(theta) * maxDisplacement;
                const dy = Math.sin(phi) * Math.sin(theta) * maxDisplacement;
                const dz = Math.cos(phi) * maxDisplacement;

                const nx = b.x + dx;
                const ny = b.y + dy;
                const nz = b.z + dz;

                if (nz >= minZ && nz <= maxZ) {
                    const contours = getContours(nz);
                    if (isPointInContours(nx, ny, contours)) {
                        return { x: nx, y: ny, z: nz, radius: b.radius };
                    }
                }
                return b;
            });
        }

        let minCenterZ = Infinity;
        finalBubbles.forEach(b => {
            if (b.z < minCenterZ) minCenterZ = b.z;
        });

        this.bubbles = []; // Initialize for 3D path
        finalBubbles.forEach((b, idx) => {
            this.bubbles.push({ x: b.x, y: b.y, z: b.z, radius: b.radius, layerIndex: Math.round((b.z - minCenterZ) / (meanRadius * 2 * overlapFactorV)), unshiftedZ: b.z });
            const matrix = new THREE.Matrix4().makeTranslation(b.x, b.y, b.z);
            let geo;
            if (Math.abs(b.z - minCenterZ) < 0.1) {
                geo = new THREE.SphereGeometry(b.radius, widthSegments, heightSegments, 0, Math.PI * 2, 0, thetaLength);
            } else {
                geo = new THREE.SphereGeometry(b.radius, widthSegments, heightSegments);
            }
            geo.rotateX(Math.PI / 2);
            geometries.push(geo.clone().applyMatrix4(matrix));
        });

        console.log(`[BubbleGenerator] 3D Packing produced ${finalBubbles.length} bubbles.`);
        if (geometries.length > 0) {
            const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
            mergedGeo.computeBoundingBox();
            const minZ = mergedGeo.boundingBox.min.z;
            if (minZ !== 0) {
                mergedGeo.translate(0, 0, -minZ);
                if (this.bubbles) {
                    this.bubbles.forEach(b => b.z -= minZ);
                }
            }
            return mergedGeo;
        }
        return null;
    }
}