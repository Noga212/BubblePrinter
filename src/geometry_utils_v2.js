import * as THREE from 'three';

/**
 * Slices a mesh at a specific Z height and returns an array of closed polygons.
 * @param {THREE.Object3D} object - The 3D object to slice.
 * @param {number} z - The Z-height to slice at.
 * @returns {Array<Array<[number, number]>>} - Array of polygons (array of points).
 */
export function getSliceContours(object, z) {
    console.log(`[GeoUtils] Starting slice at Z=${z.toFixed(2)}`);
    const segments = [];
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const v3 = new THREE.Vector3();

    let triangleCount = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;

    object.traverse((child) => {
        if (child.isMesh) {
            const geometry = child.geometry;
            const matrixWorld = child.matrixWorld;
            const position = geometry.attributes.position;

            if (!position) return;

            const index = geometry.index;
            const count = index ? index.count : position.count;

            for (let i = 0; i < count; i += 3) {
                triangleCount++;
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

                minZ = Math.min(minZ, v1.z, v2.z, v3.z);
                maxZ = Math.max(maxZ, v1.z, v2.z, v3.z);

                const triangleSegments = getTriangleIntersectionSegments(v1, v2, v3, z);
                if (triangleSegments) {
                    segments.push(...triangleSegments);
                }
            }
        }
    });

    console.log(`[GeoUtils] Checked ${triangleCount} triangles.`);
    console.log(`[GeoUtils] World Z Range: [${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`);
    console.log(`[GeoUtils] Slice Plane Z: ${z.toFixed(2)}`);
    console.log(`[GeoUtils] Found ${segments.length} segments.`);

    if (z < minZ || z > maxZ) {
        console.warn('[GeoUtils] WARNING: Slice plane is OUTSIDE object Z range!');
    }

    return stitchSegments(segments);
}

/**
 * Calculates the intersection segment of a triangle with a Z-plane.
 * @param {THREE.Vector3} v1 
 * @param {THREE.Vector3} v2 
 * @param {THREE.Vector3} v3 
 * @param {number} z 
 * @returns {Array<[THREE.Vector3, THREE.Vector3]> | null}
 */
function getTriangleIntersectionSegments(v1, v2, v3, z) {
    const points = [];
    const edges = [[v1, v2], [v2, v3], [v3, v1]];

    for (const [pa, pb] of edges) {
        if ((pa.z >= z && pb.z < z) || (pa.z < z && pb.z >= z)) {
            // Edge crosses the plane
            const t = (z - pa.z) / (pb.z - pa.z);
            const x = pa.x + t * (pb.x - pa.x);
            const y = pa.y + t * (pb.y - pa.y);
            points.push(new THREE.Vector3(x, y, z));
        } else if (pa.z === z && pb.z === z) {
            // Edge lies exactly on the plane - we can skip or handle as special case.
            // For simple stitching, we'll ignore purely horizontal edges as the other 
            // intersecting edges will provide the points.
        } else if (pa.z === z) {
            // Vertex lies on the plane.
            // Check if we already have this point to avoid duplicates.
            if (!points.some(p => p.equals(pa))) {
                points.push(pa.clone());
            }
        }
    }

    if (points.length >= 2) {
        return [[points[0], points[1]]];
    }
    return null;
}

/**
 * Stitches a list of segments into closed loops.
 * @param {Array<[THREE.Vector3, THREE.Vector3]>} segments 
 * @returns {Array<Array<[number, number]>>}
 */
function stitchSegments(segments) {
    if (segments.length === 0) return [];

    const loops = [];
    const precision = 5; // Reduced precision to help matching
    const getPointKey = (v) => `${v.x.toFixed(precision)},${v.y.toFixed(precision)}`;

    // Build Graph
    // map key -> array of { targetPoint, segmentId }
    const adj = new Map();
    const visitedSegments = new Set();

    segments.forEach((seg, i) => {
        const [p1, p2] = seg;

        // Debug check for NaN
        if (isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) {
            console.error('[GeoUtils] NaN point found in segment', i);
            return;
        }

        const k1 = getPointKey(p1);
        const k2 = getPointKey(p2);

        if (!adj.has(k1)) adj.set(k1, []);
        if (!adj.has(k2)) adj.set(k2, []);

        adj.get(k1).push({ point: p2, key: k2, id: i });
        adj.get(k2).push({ point: p1, key: k1, id: i });
    });

    console.log(`[GeoUtils] Graph built. Unique vertices: ${adj.size}`);

    // Traverse
    segments.forEach((_, startSegId) => {
        if (visitedSegments.has(startSegId)) return;

        // Start a new loop from this segment
        const startSeg = segments[startSegId];
        visitedSegments.add(startSegId);

        let pStart = startSeg[0];
        let pNext = startSeg[1];

        const currentLoop = [[pStart.x, pStart.y], [pNext.x, pNext.y]];

        let currPoint = pNext;
        let currKey = getPointKey(currPoint);
        let prevKey = getPointKey(pStart);

        let expanding = true;
        while (expanding) {
            expanding = false;

            const neighbors = adj.get(currKey);
            if (!neighbors) break;

            for (const neighbor of neighbors) {
                if (visitedSegments.has(neighbor.id)) continue;

                // Found a valid continuation
                visitedSegments.add(neighbor.id);
                currentLoop.push([neighbor.point.x, neighbor.point.y]);

                prevKey = currKey;
                currPoint = neighbor.point;
                currKey = neighbor.key;

                expanding = true;
                break; // Move to next point in chain
            }
        }

        if (currentLoop.length >= 3) {
            loops.push(currentLoop);
        }
    });

    console.log(`[GeoUtils] Stitched ${loops.length} loops.`);
    return loops;
}

/**
 * Calculates shortest distance from point to any contour edge
 */
export function distanceToContours(x, y, contours) {
    let minDist = Infinity;
    for (const polygon of contours) {
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            
            // Point to line segment distance
            const l2 = (xi - xj) ** 2 + (yi - yj) ** 2;
            if (l2 === 0) {
                minDist = Math.min(minDist, Math.hypot(x - xi, y - yi));
                continue;
            }
            
            let t = ((x - xi) * (xj - xi) + (y - yi) * (yj - yi)) / l2;
            t = Math.max(0, Math.min(1, t));
            
            const projX = xi + t * (xj - xi);
            const projY = yi + t * (yj - yi);
            
            minDist = Math.min(minDist, Math.hypot(x - projX, y - projY));
        }
    }
    return minDist;
}

/**
 * Returns true hexagonal close packing points (ABCABC Face-Centered Cubic).
 */
export function getOrangesPointsInContours(contours, box, spacing, layerIndex) {
    const points = [];
    // True hex packing row spacing
    const rowSpacing = spacing * Math.sqrt(3) / 2;

    const startN = Math.floor((box.min.x - spacing) / spacing);
    const endN = Math.ceil((box.max.x + spacing) / spacing);

    const startM = Math.floor((box.min.y - rowSpacing) / rowSpacing);
    const endM = Math.ceil((box.max.y + rowSpacing) / rowSpacing);

    // ABCABC Stacking
    const k = layerIndex % 3;
    let layerOffsetX = 0;
    let layerOffsetY = 0;
    if (k === 1) {
        layerOffsetX = spacing / 2;
        layerOffsetY = rowSpacing / 3;
    } else if (k === 2) {
        layerOffsetX = 0;
        layerOffsetY = rowSpacing * 2 / 3;
    }

    for (let m = startM; m <= endM; m++) {
        const y = m * rowSpacing + (rowSpacing / 2) + layerOffsetY;
        // Alternating rows shift by half spacing
        const rowOffsetX = (m % 2 !== 0) ? spacing / 2 : 0;
        
        for (let n = startN; n <= endN; n++) {
            const x = n * spacing + (spacing / 2) + rowOffsetX + layerOffsetX;

            if (isPointInContours(x, y, contours)) {
                points.push({ x, y });
            }
        }
    }
    return points;
}

/**
 * Returns hexagonal close packing points (ABABAB Hexagonal Close Packing).
 */
export function getHexagonsPointsInContours(contours, box, spacing, layerIndex) {
    const points = [];
    // True hex packing row spacing
    const rowSpacing = spacing * Math.sqrt(3) / 2;

    const startN = Math.floor((box.min.x - spacing) / spacing);
    const endN = Math.ceil((box.max.x + spacing) / spacing);

    const startM = Math.floor((box.min.y - rowSpacing) / rowSpacing);
    const endM = Math.ceil((box.max.y + rowSpacing) / rowSpacing);

    // ABABAB Stacking
    const layerOffsetX = (layerIndex % 2 !== 0) ? spacing / 2 : 0;
    const layerOffsetY = (layerIndex % 2 !== 0) ? rowSpacing / 3 : 0;

    for (let m = startM; m <= endM; m++) {
        const y = m * rowSpacing + (rowSpacing / 2) + layerOffsetY;
        // Alternating rows shift by half spacing
        const rowOffsetX = (m % 2 !== 0) ? spacing / 2 : 0;
        
        for (let n = startN; n <= endN; n++) {
            const x = n * spacing + (spacing / 2) + rowOffsetX + layerOffsetX;

            if (isPointInContours(x, y, contours)) {
                points.push({ x, y });
            }
        }
    }
    return points;
}

// Simple seeded random function
export function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

export function getRejectionSamplingPointsInContours(contours, box, spacing, layerIndex) {
    const points = [];
    const cellSize = spacing / Math.sqrt(2); 
    const grid = new Map();

    let seed = layerIndex * 1337 + 1; // Basic seed per layer
    const maxAttempts = 200;
    let rejections = 0;
    
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;

    // Ensure width and height are positive and large enough
    if (width <= 0 || height <= 0) return points;

    const maxIter = Math.floor((width * height) / (spacing * spacing)) * 10;

    for (let i = 0; i < maxIter && rejections < maxAttempts; i++) {
        const rx = box.min.x + seededRandom(seed++) * width;
        const ry = box.min.y + seededRandom(seed++) * height;

        if (!isPointInContours(rx, ry, contours)) {
            continue; // Not a rejection, just not in mesh
        }

        // Spatial Hash Check
        const gx = Math.floor(rx / cellSize);
        const gy = Math.floor(ry / cellSize);
        let tooClose = false;

        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const key = `${gx + dx},${gy + dy}`;
                if (grid.has(key)) {
                    const cellPoints = grid.get(key);
                    for (const p of cellPoints) {
                        const distSq = (p.x - rx) ** 2 + (p.y - ry) ** 2;
                        if (distSq < spacing * spacing) {
                            tooClose = true;
                            break;
                        }
                    }
                }
            }
            if (tooClose) break;
        }

        if (!tooClose) {
            points.push({ x: rx, y: ry });
            const key = `${gx},${gy}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push({ x: rx, y: ry });
            rejections = 0;
        } else {
            rejections++;
        }
    }
    return points;
}

/**
 * Returns grid points (x, y) that are inside the contours.
 * Truly absolute world-grid anchored at (0,0).
 */
export function getGridPointsInContours(contours, box, spacing) {
    const points = [];
    
    const centerX = (box.min.x + box.max.x) / 2;
    const centerY = (box.min.y + box.max.y) / 2;

    // Find the range of indices 'n' that cover the bounding box relative to center
    const startN = Math.floor((box.min.x - centerX - spacing) / spacing);
    const endN = Math.ceil((box.max.x - centerX + spacing) / spacing);

    const startM = Math.floor((box.min.y - centerY - spacing) / spacing);
    const endM = Math.ceil((box.max.y - centerY + spacing) / spacing);

    for (let n = startN; n <= endN; n++) {
        const x = centerX + (n + 0.5) * spacing;
        for (let m = startM; m <= endM; m++) {
            const y = centerY + (m + 0.5) * spacing;

            // Check if (x,y) is inside any contour
            if (isPointInContours(x, y, contours)) {
                points.push({ x, y });
            }
        }
    }
    return points;
}

/**
 * Ray casting algorithm to check if point is inside contours.
 */
export function isPointInContours(x, y, contours) {
    let inside = false;
    for (const polygon of contours) {
        // polygon is array of [x, y]
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
    }
    return inside;
}

/**
 * Generates points using Bridson's 2D Poisson Disk Sampling algorithm inside contours.
 */
export function getPoissonPointsInContours(contours, box, spacing, layerIndex) {
    const points = [];
    const r = spacing; // minimum distance between points
    const cellSize = r / Math.sqrt(2);
    
    // Grid to store point coordinates
    const grid = new Map();
    const active = [];
    
    // Seeded random helper
    let seed = layerIndex * 2777 + 7;
    const pRand = () => {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    // Find a starting point inside contours
    let foundStart = false;
    let startX = 0, startY = 0;
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;

    if (width <= 0 || height <= 0) return points;

    for (let attempt = 0; attempt < 500; attempt++) {
        const x = box.min.x + pRand() * width;
        const y = box.min.y + pRand() * height;
        if (isPointInContours(x, y, contours)) {
            startX = x;
            startY = y;
            foundStart = true;
            break;
        }
    }

    if (!foundStart) {
        return points;
    }

    // Insert first point
    const firstPoint = { x: startX, y: startY };
    points.push(firstPoint);
    active.push(firstPoint);
    
    const getGridKey = (x, y) => `${Math.floor((x - box.min.x) / cellSize)},${Math.floor((y - box.min.y) / cellSize)}`;
    grid.set(getGridKey(startX, startY), firstPoint);

    const k = 30; // Max candidates per active point

    while (active.length > 0) {
        const randIdx = Math.floor(pRand() * active.length);
        const p = active[randIdx];
        let foundCandidate = false;

        for (let i = 0; i < k; i++) {
            const theta = pRand() * Math.PI * 2;
            const dist = r + pRand() * r; // between r and 2r
            const cx = p.x + Math.cos(theta) * dist;
            const cy = p.y + Math.sin(theta) * dist;

            if (cx < box.min.x || cx > box.max.x || cy < box.min.y || cy > box.max.y) continue;
            if (!isPointInContours(cx, cy, contours)) continue;

            const gx = Math.floor((cx - box.min.x) / cellSize);
            const gy = Math.floor((cy - box.min.y) / cellSize);
            let tooClose = false;

            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const neighborKey = `${gx + dx},${gy + dy}`;
                    if (grid.has(neighborKey)) {
                        const np = grid.get(neighborKey);
                        const distSq = (np.x - cx) ** 2 + (np.y - cy) ** 2;
                        if (distSq < r * r) {
                            tooClose = true;
                            break;
                        }
                    }
                }
                if (tooClose) break;
            }

            if (!tooClose) {
                const newPoint = { x: cx, y: cy };
                points.push(newPoint);
                active.push(newPoint);
                grid.set(getGridKey(cx, cy), newPoint);
                foundCandidate = true;
                break;
            }
        }

        if (!foundCandidate) {
            active.splice(randIdx, 1);
        }
    }

    return points;
}

/**
 * Performs Lloyd's Relaxation in 2D using a grid-discretized centroid estimation.
 */
export function applyLloydRelaxation(points, contours, box, spacing, iterations) {
    if (iterations <= 0 || points.length === 0) return points;

    let relaxedPoints = points.map(p => ({ x: p.x, y: p.y }));
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    if (width <= 0 || height <= 0) return points;

    // Use a maximum grid resolution to balance quality and performance
    const maxGridDimension = 150;
    const cellSize = Math.max(0.05, Math.max(width, height) / maxGridDimension);
    
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);

    // Precalculate cells inside the contours
    const insideGrid = Array.from({ length: cols }, () => new Uint8Array(rows));
    for (let c = 0; c < cols; c++) {
        const cx = box.min.x + (c + 0.5) * cellSize;
        for (let r = 0; r < rows; r++) {
            const cy = box.min.y + (r + 0.5) * cellSize;
            if (isPointInContours(cx, cy, contours)) {
                insideGrid[c][r] = 1;
            }
        }
    }

    const binSize = Math.max(cellSize * 2, spacing * 2);

    for (let iter = 0; iter < iterations; iter++) {
        // Spatial hash binning
        const binCols = Math.ceil(width / binSize);
        const binRows = Math.ceil(height / binSize);
        const bins = Array.from({ length: Math.max(1, binCols * binRows) }, () => []);

        for (let i = 0; i < relaxedPoints.length; i++) {
            const p = relaxedPoints[i];
            const bx = Math.min(binCols - 1, Math.max(0, Math.floor((p.x - box.min.x) / binSize)));
            const by = Math.min(binRows - 1, Math.max(0, Math.floor((p.y - box.min.y) / binSize)));
            bins[by * binCols + bx].push(i);
        }

        const sumsX = new Float32Array(relaxedPoints.length);
        const sumsY = new Float32Array(relaxedPoints.length);
        const counts = new Int32Array(relaxedPoints.length);

        // Assign each inside grid cell to the closest point site
        for (let c = 0; c < cols; c++) {
            const cx = box.min.x + (c + 0.5) * cellSize;
            const bx = Math.min(binCols - 1, Math.max(0, Math.floor((cx - box.min.x) / binSize)));

            for (let r = 0; r < rows; r++) {
                if (insideGrid[c][r] === 0) continue;

                const cy = box.min.y + (r + 0.5) * cellSize;
                const by = Math.min(binRows - 1, Math.max(0, Math.floor((cy - box.min.y) / binSize)));

                let closestIndex = -1;
                let minDistSq = Infinity;

                // Check 3x3 neighboring spatial hash bins
                for (let dy = -1; dy <= 1; dy++) {
                    const ny = by + dy;
                    if (ny < 0 || ny >= binRows) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = bx + dx;
                        if (nx < 0 || nx >= binCols) continue;

                        const binPoints = bins[ny * binCols + nx];
                        for (let k = 0; k < binPoints.length; k++) {
                            const idx = binPoints[k];
                            const p = relaxedPoints[idx];
                            const distSq = (p.x - cx) ** 2 + (p.y - cy) ** 2;
                            if (distSq < minDistSq) {
                                minDistSq = distSq;
                                closestIndex = idx;
                            }
                        }
                    }
                }

                if (closestIndex !== -1) {
                    sumsX[closestIndex] += cx;
                    sumsY[closestIndex] += cy;
                    counts[closestIndex]++;
                }
            }
        }

        // Calculate centroids
        for (let i = 0; i < relaxedPoints.length; i++) {
            if (counts[i] > 0) {
                const newX = sumsX[i] / counts[i];
                const newY = sumsY[i] / counts[i];
                if (isPointInContours(newX, newY, contours)) {
                    relaxedPoints[i].x = newX;
                    relaxedPoints[i].y = newY;
                }
            }
        }
    }

    return relaxedPoints;
}

/**
 * Classic Sutherland-Hodgman algorithm to clip a convex polygon by a half-plane.
 * The half-plane is defined by a point M on its boundary line and a normal vector N pointing inside.
 * @param {Array<{x: number, y: number}>} poly 
 * @param {{x: number, y: number}} M 
 * @param {{x: number, y: number}} N 
 * @returns {Array<{x: number, y: number}>}
 */
export function clipPolygon(poly, M, N) {
    const output = [];
    if (poly.length === 0) return output;

    const isInside = (pt) => {
        return (pt.x - M.x) * N.x + (pt.y - M.y) * N.y >= 0;
    };

    const intersect = (p1, p2) => {
        const d1 = (p1.x - M.x) * N.x + (p1.y - M.y) * N.y;
        const d2 = (p2.x - M.x) * N.x + (p2.y - M.y) * N.y;
        const diff = d1 - d2;
        if (Math.abs(diff) < 1e-10) return p1;
        const t = d1 / diff;
        return {
            x: p1.x + t * (p2.x - p1.x),
            y: p1.y + t * (p2.y - p1.y)
        };
    };

    let s = poly[poly.length - 1];
    for (const p of poly) {
        if (isInside(p)) {
            if (!isInside(s)) {
                output.push(intersect(s, p));
            }
            output.push(p);
        } else if (isInside(s)) {
            output.push(intersect(s, p));
        }
        s = p;
    }
    return output;
}

/**
 * Returns the intersection point of two line segments p1-p2 and c1-c2, or null if none.
 */
export function getLineSegmentIntersection(p1, p2, c1, c2) {
    const det = (p2.x - p1.x) * (c2.y - c1.y) - (p2.y - p1.y) * (c2.x - c1.x);
    if (Math.abs(det) < 1e-9) return null; // Parallel

    const t = ((c1.x - p1.x) * (c2.y - c1.y) - (c1.y - p1.y) * (c2.x - c1.x)) / det;
    const u = ((c1.x - p1.x) * (p2.y - p1.y) - (c1.y - p1.y) * (p2.x - p1.x)) / det;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: p1.x + t * (p2.x - p1.x),
            y: p1.y + t * (p2.y - p1.y)
        };
    }
    return null;
}

/**
 * Clips a line segment p1-p2 to the inside of 2D contours.
 * Returns an array of segment objects [{p1, p2}].
 */
export function clipSegmentToContours(p1, p2, contours) {
    const inside1 = isPointInContours(p1.x, p1.y, contours);
    const inside2 = isPointInContours(p2.x, p2.y, contours);

    if (inside1 && inside2) {
        return [{ p1, p2 }];
    }

    // Find all intersections
    const intersections = [];
    for (const poly of contours) {
        for (let i = 0; i < poly.length; i++) {
            const nextIdx = (i + 1) % poly.length;
            const c1 = { x: poly[i][0], y: poly[i][1] };
            const c2 = { x: poly[nextIdx][0], y: poly[nextIdx][1] };

            const intersect = getLineSegmentIntersection(p1, p2, c1, c2);
            if (intersect) {
                if (!intersections.some(pt => Math.hypot(pt.x - intersect.x, pt.y - intersect.y) < 1e-5)) {
                    intersections.push(intersect);
                }
            }
        }
    }

    // Sort intersections by distance from p1
    intersections.sort((a, b) => {
        const distA = (a.x - p1.x) ** 2 + (a.y - p1.y) ** 2;
        const distB = (b.x - p1.x) ** 2 + (b.y - p1.y) ** 2;
        return distA - distB;
    });

    const pts = [p1, ...intersections, p2];
    const segments = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const mid = { x: (pts[i].x + pts[i+1].x) / 2, y: (pts[i].y + pts[i+1].y) / 2 };
        if (isPointInContours(mid.x, mid.y, contours)) {
            segments.push({ p1: pts[i], p2: pts[i+1] });
        }
    }
    return segments;
}

/**
 * Computes 2D Voronoi cells for a set of points, clipped by the bounding box and layer contours.
 * @param {Array<{x: number, y: number}>} points 
 * @param {THREE.Box3} box 
 * @param {Array<Array<[number, number]>>} contours 
 * @returns {Array<{index: number, segments: Array<{p1, p2}>, cellPolygon: Array<{x, y}>}>}
 */
export function getVoronoiCells2D(points, box, contours) {
    const cells = [];
    if (points.length === 0) return cells;

    // Expand bounding box slightly for initial cells
    const padding = 2.0;
    const bMinX = box.min.x - padding;
    const bMaxX = box.max.x + padding;
    const bMinY = box.min.y - padding;
    const bMaxY = box.max.y + padding;

    const getInitialCell = () => [
        { x: bMinX, y: bMinY },
        { x: bMaxX, y: bMinY },
        { x: bMaxX, y: bMaxY },
        { x: bMinX, y: bMaxY }
    ];

    for (let i = 0; i < points.length; i++) {
        const pi = points[i];
        let cell = getInitialCell();

        // Find neighbors and sort by distance
        const neighbors = [];
        for (let j = 0; j < points.length; j++) {
            if (i === j) continue;
            const pj = points[j];
            const dSq = (pi.x - pj.x) ** 2 + (pi.y - pj.y) ** 2;
            neighbors.push({ index: j, distSq: dSq, pt: pj });
        }
        neighbors.sort((a, b) => a.distSq - b.distSq);

        const limit = Math.min(neighbors.length, 40);
        for (let k = 0; k < limit; k++) {
            const pj = neighbors[k].pt;
            const M = { x: (pi.x + pj.x) / 2, y: (pi.y + pj.y) / 2 };
            const N = { x: pi.x - pj.x, y: pi.y - pj.y };
            cell = clipPolygon(cell, M, N);
            if (cell.length < 3) break;
        }

        if (cell.length >= 3) {
            const clippedSegments = [];
            for (let k = 0; k < cell.length; k++) {
                const nextIdx = (k + 1) % cell.length;
                const p1 = cell[k];
                const p2 = cell[nextIdx];
                const segments = clipSegmentToContours(p1, p2, contours);
                clippedSegments.push(...segments);
            }
            cells.push({
                index: i,
                segments: clippedSegments,
                cellPolygon: cell
            });
        }
    }
    return cells;
}

/**
 * Performs 3D discretized Voronoi Lloyd's Relaxation inside the 3D mesh.
 */
export function apply3DLloydRelaxation(bubbles, mesh, box, meanRadius, iterations) {
    if (iterations <= 0 || bubbles.length === 0) return bubbles;

    let relaxed = bubbles.map(b => ({ x: b.x, y: b.y, z: b.z, radius: b.radius }));
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    const depth = box.max.z - box.min.z;
    if (width <= 0 || height <= 0 || depth <= 0) return bubbles;

    // Define 3D grid cell size
    const maxCells = 80000; // Limit cell count to keep it fast
    const volume = width * height * depth;
    const cellSize = Math.max(0.1, Math.pow(volume / maxCells, 1 / 3));

    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const slices = Math.ceil(depth / cellSize);

    // Precalculate Z heights and their slice contours
    const sliceContours = [];
    const insideGrid = []; // 3D boolean grid

    for (let s = 0; s < slices; s++) {
        const cz = box.min.z + (s + 0.5) * cellSize;
        const contours = getSliceContours(mesh, cz);
        sliceContours.push(contours);

        const sliceGrid = Array.from({ length: cols }, () => new Uint8Array(rows));
        if (contours.length > 0) {
            for (let c = 0; c < cols; c++) {
                const cx = box.min.x + (c + 0.5) * cellSize;
                for (let r = 0; r < rows; r++) {
                    const cy = box.min.y + (r + 0.5) * cellSize;
                    if (isPointInContours(cx, cy, contours)) {
                        sliceGrid[c][r] = 1;
                    }
                }
            }
        }
        insideGrid.push(sliceGrid);
    }

    const binSize = Math.max(cellSize * 2, meanRadius * 2);

    for (let iter = 0; iter < iterations; iter++) {
        // 3D Spatial hashing
        const binCols = Math.ceil(width / binSize);
        const binRows = Math.ceil(height / binSize);
        const binSlices = Math.ceil(depth / binSize);
        const bins = Array.from({ length: Math.max(1, binCols * binRows * binSlices) }, () => []);

        for (let i = 0; i < relaxed.length; i++) {
            const b = relaxed[i];
            const bx = Math.min(binCols - 1, Math.max(0, Math.floor((b.x - box.min.x) / binSize)));
            const by = Math.min(binRows - 1, Math.max(0, Math.floor((b.y - box.min.y) / binSize)));
            const bz = Math.min(binSlices - 1, Math.max(0, Math.floor((b.z - box.min.z) / binSize)));
            bins[(bz * binRows + by) * binCols + bx].push(i);
        }

        const sumsX = new Float32Array(relaxed.length);
        const sumsY = new Float32Array(relaxed.length);
        const sumsZ = new Float32Array(relaxed.length);
        const counts = new Int32Array(relaxed.length);

        // Assign each inside 3D grid cell to the closest bubble
        for (let s = 0; s < slices; s++) {
            const cz = box.min.z + (s + 0.5) * cellSize;
            const bz = Math.min(binSlices - 1, Math.max(0, Math.floor((cz - box.min.z) / binSize)));
            const sliceGrid = insideGrid[s];

            for (let c = 0; c < cols; c++) {
                const cx = box.min.x + (c + 0.5) * cellSize;
                const bx = Math.min(binCols - 1, Math.max(0, Math.floor((cx - box.min.x) / binSize)));

                for (let r = 0; r < rows; r++) {
                    if (sliceGrid[c][r] === 0) continue;

                    const cy = box.min.y + (r + 0.5) * cellSize;
                    const by = Math.min(binRows - 1, Math.max(0, Math.floor((cy - box.min.y) / binSize)));

                    let closestIndex = -1;
                    let minDistSq = Infinity;

                    // Check 3x3x3 neighboring bins
                    for (let dz = -1; dz <= 1; dz++) {
                        const nz = bz + dz;
                        if (nz < 0 || nz >= binSlices) continue;
                        for (let dy = -1; dy <= 1; dy++) {
                            const ny = by + dy;
                            if (ny < 0 || ny >= binRows) continue;
                            for (let dx = -1; dx <= 1; dx++) {
                                const nx = bx + dx;
                                if (nx < 0 || nx >= binCols) continue;

                                const binBubbles = bins[(nz * binRows + ny) * binCols + nx];
                                for (let k = 0; k < binBubbles.length; k++) {
                                    const idx = binBubbles[k];
                                    const b = relaxed[idx];
                                    const distSq = (b.x - cx) ** 2 + (b.y - cy) ** 2 + (b.z - cz) ** 2;
                                    if (distSq < minDistSq) {
                                        minDistSq = distSq;
                                        closestIndex = idx;
                                    }
                                }
                            }
                        }
                    }

                    if (closestIndex !== -1) {
                        sumsX[closestIndex] += cx;
                        sumsY[closestIndex] += cy;
                        sumsZ[closestIndex] += cz;
                        counts[closestIndex]++;
                    }
                }
            }
        }

        // Update bubble positions
        for (let i = 0; i < relaxed.length; i++) {
            if (counts[i] > 0) {
                const newX = sumsX[i] / counts[i];
                const newY = sumsY[i] / counts[i];
                const newZ = sumsZ[i] / counts[i];

                // Determine slice index for newZ to do inside check
                const sIdx = Math.min(slices - 1, Math.max(0, Math.floor((newZ - box.min.z) / cellSize)));
                const contours = sliceContours[sIdx];
                if (contours.length === 0 || isPointInContours(newX, newY, contours)) {
                    relaxed[i].x = newX;
                    relaxed[i].y = newY;
                    relaxed[i].z = newZ;
                }
            }
        }
    }

    return relaxed;
}
