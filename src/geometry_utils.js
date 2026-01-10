import * as THREE from 'three';

/**
 * Slices a mesh at a specific Z height and returns an array of closed polygons.
 * @param {THREE.Object3D} object - The 3D object to slice.
 * @param {number} z - The Z-height to slice at.
 * @returns {Array<Array<[number, number]>>} - Array of polygons (array of points).
 */
export function getSliceContours(object, z) {
    const segments = [];
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

                const triangleSegments = getTriangleIntersectionSegments(v1, v2, v3, z);
                if (triangleSegments) {
                    segments.push(...triangleSegments);
                }
            }
        }
    });

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
/**
 * Stitches a list of segments into closed loops using a graph-based approach.
 * @param {Array<[THREE.Vector3, THREE.Vector3]>} segments 
 * @returns {Array<Array<[number, number]>>}
 */
function stitchSegments(segments) {
    if (segments.length === 0) return [];

    const loops = [];
    const precision = 6;
    const getPointKey = (v) => `${v.x.toFixed(precision)},${v.y.toFixed(precision)}`;

    // Build Graph
    // map key -> array of { targetPoint, segmentId }
    const adj = new Map();
    const visitedSegments = new Set();

    segments.forEach((seg, i) => {
        const [p1, p2] = seg;
        const k1 = getPointKey(p1);
        const k2 = getPointKey(p2);

        if (!adj.has(k1)) adj.set(k1, []);
        if (!adj.has(k2)) adj.set(k2, []);

        adj.get(k1).push({ point: p2, key: k2, id: i });
        adj.get(k2).push({ point: p1, key: k1, id: i });
    });

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

        // Check if closed (simple check: distance between last and first)
        // Or if the graph naturally closed it, the last point should be same as first (geometrically)
        // With the current logic, we pushed all points.

        if (currentLoop.length >= 3) {
            loops.push(currentLoop);
        }
    });

    return loops;
}
