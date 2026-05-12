const box = { min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 10 } };
const spacing = 1;
const rowSpacing = spacing * Math.sqrt(3) / 2;
const layerIndex = 0;
const startM = Math.floor((box.min.y - rowSpacing) / rowSpacing);
const endM = Math.ceil((box.max.y + rowSpacing) / rowSpacing);
const layerOffsetX = (layerIndex % 2 !== 0) ? spacing / 2 : 0;
const layerOffsetY = (layerIndex % 2 !== 0) ? rowSpacing / 3 : 0;

let points = 0;
const startN = Math.floor((box.min.x - spacing) / spacing);
const endN = Math.ceil((box.max.x + spacing) / spacing);

for (let m = startM; m <= endM; m++) {
    const y = m * rowSpacing + (rowSpacing / 2) + layerOffsetY;
    const rowOffsetX = (m % 2 !== 0) ? spacing / 2 : 0;
    for (let n = startN; n <= endN; n++) {
        const x = n * spacing + (spacing / 2) + rowOffsetX + layerOffsetX;
        if (x >= box.min.x && x <= box.max.x && y >= box.min.y && y <= box.max.y) {
            points++;
        }
    }
}
console.log('Points in layer 0:', points);
