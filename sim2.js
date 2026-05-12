const box = { min: { x: -0.25, y: -0.25, z: 0 }, max: { x: 0.25, y: 0.25, z: 10 } };
const spacing = 1;
const centerX = (box.min.x + box.max.x) / 2;
const centerY = (box.min.y + box.max.y) / 2;

// Oranges mode
const rowSpacing = spacing * Math.sqrt(3) / 2;
const layerIndex = 0;
const layerOffsetX = (layerIndex % 2 !== 0) ? spacing / 2 : 0;
const layerOffsetY = (layerIndex % 2 !== 0) ? rowSpacing / 3 : 0;

const startM = Math.floor((box.min.y - centerY - rowSpacing) / rowSpacing);
const endM = Math.ceil((box.max.y - centerY + rowSpacing) / rowSpacing);

let points = 0;
const startN = Math.floor((box.min.x - centerX - spacing) / spacing);
const endN = Math.ceil((box.max.x - centerX + spacing) / spacing);

for (let m = startM; m <= endM; m++) {
    const y = centerY + m * rowSpacing + layerOffsetY;
    const rowOffsetX = (Math.abs(m) % 2 !== 0) ? spacing / 2 : 0;
    for (let n = startN; n <= endN; n++) {
        const x = centerX + n * spacing + rowOffsetX + layerOffsetX;
        if (x >= box.min.x && x <= box.max.x && y >= box.min.y && y <= box.max.y) {
            points++;
        }
    }
}
console.log('Points in layer 0:', points);
