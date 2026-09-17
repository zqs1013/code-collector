const fs = require('fs');
const path = require('path');
const runtimeDir = path.join(__dirname, '..', 'runtime');
const sourceNode = process.execPath;
const targetNode = path.join(runtimeDir, 'node.exe');

fs.mkdirSync(runtimeDir, { recursive: true });
fs.copyFileSync(sourceNode, targetNode);
console.log(`[runtime] copied node: ${sourceNode} -> ${targetNode}`);
