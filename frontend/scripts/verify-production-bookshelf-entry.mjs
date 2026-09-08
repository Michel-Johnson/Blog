import { readFile } from 'node:fs/promises';

const [indexHtml, deployScript, bookshelfModule, threeModule, threeCore] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('./deploy-sketch-admin.sh', import.meta.url), 'utf8'),
  readFile(new URL('../all-posts-3d.js', import.meta.url), 'utf8'),
  readFile(new URL('../lib/three/three.module.js', import.meta.url), 'utf8'),
  readFile(new URL('../lib/three/three.core.js', import.meta.url), 'utf8'),
]);

const homeIndex = indexHtml.indexOf('./home.js');
const modeledIndex = indexHtml.indexOf('./all-posts-3d.js');

if (homeIndex < 0 || modeledIndex < 0 || modeledIndex < homeIndex) {
  throw new Error('index.html must load all-posts-3d.js after home.js.');
}

if (!indexHtml.includes('type="module" src="./all-posts-3d.js')) {
  throw new Error('The modeled bookshelf entry must remain an ES module.');
}

if (!deployScript.includes('all-posts-3d.js')) {
  throw new Error('The deploy manifest must include all-posts-3d.js.');
}

if (!bookshelfModule.includes("modeled-cabinet-v23-no-legacy-flash")) {
  throw new Error('The production bookshelf module is not the approved v23 layout.');
}

if (!indexHtml.includes('bookshelf-model-loading')) {
  throw new Error('index.html must suppress the legacy shelf during modeled cabinet initialization.');
}

if (!bookshelfModule.includes("./lib/three/three.module.js")) {
  throw new Error('The bookshelf must use the project-owned Three.js dependency.');
}

if (!threeModule.includes("from './three.core.js'")) {
  throw new Error('The vendored Three.js module must resolve its local core dependency.');
}

if (!threeCore.includes('REVISION')) {
  throw new Error('The vendored Three.js core dependency is incomplete.');
}

if (!/\bassets\s+lib\b/.test(deployScript)) {
  throw new Error('The deploy manifest must include the complete Three.js dependency directory.');
}

console.log('Production bookshelf entry verified: modeled cabinet v23 without legacy first-paint flash.');
