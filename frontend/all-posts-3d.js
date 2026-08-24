import * as THREE from './lib/three/three.module.js';
import { RoundedBoxGeometry } from './lib/three/RoundedBoxGeometry.js';

const palette = ['#efe3b9', '#e7e2d8', '#e9cfd0', '#dce9df', '#e7dfcf', '#dedbea'];
const activeScenes = [];
let mounted = false;
let mountedLayout = null;
let mountedPosts = [];
let remountTimer = 0;

const FIXED_LIGHTING = Object.freeze({
  period: 'fixed',
  sky: '#fbf4e9',
  ground: '#674b3a',
  hemisphere: 2.05,
  key: '#f2dfc5',
  keyIntensity: 3.65,
  keyPosition: [-1.8, 8.6, 7.2],
  fillIntensity: 0.06,
  exposure: 1
});

function destroyActiveScenes() {
  activeScenes.forEach(({ scene, renderer, observer, visibilityObserver }) => {
    observer?.disconnect();
    visibilityObserver?.disconnect();
    scene.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry?.dispose?.();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        material?.map?.dispose?.();
        material?.dispose?.();
      });
    });
    renderer.dispose();
  });
  activeScenes.length = 0;
}

// The cabinet changes structure when its content area can no longer hold two
// bays. Keep this threshold independent from phone/tablet device labels: a
// narrow split-screen window should use the compact stack as well.
const CABINET_TWO_COLUMN_MIN = 1100;

function usesCompactCabinet(host = null) {
  const availableWidth = host?.clientWidth || document.documentElement.clientWidth || window.innerWidth;
  return availableWidth < CABINET_TWO_COLUMN_MIN;
}

function titleVisualLength(title) {
  return Math.max(1, Array.from(String(title || '')).reduce((total, char) => {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(char)) return total + 1;
    if (/\s/u.test(char)) return total + 0.24;
    if (/[\p{L}\p{N}]/u.test(char)) return total + 0.48;
    return total + 0.3;
  }, 0));
}

function bookDepthForTitle(title) {
  const visualLength = titleVisualLength(title);
  // Longer titles make thicker books, but logarithmic growth keeps the shelf balanced.
  return THREE.MathUtils.clamp(0.7 + 0.22 * Math.log1p(visualLength), 0.76, 1.28);
}

function canvasTexture(renderer, width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  paint(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function normalizeSpineTitle(title) {
  return String(title || 'Untitled').replace(/\s+/g, ' ').trim();
}

function balancedLatinLines(ctx, title, lineCount) {
  const words = normalizeSpineTitle(title).split(' ').filter(Boolean);
  const weakEdgeWords = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  if (lineCount <= 1 || words.length <= 1) return [words.join(' ')];
  const actualLineCount = Math.min(lineCount, words.length);
  const candidates = [];

  const collect = (cuts, nextIndex) => {
    if (cuts.length === actualLineCount - 1) {
      const boundaries = [0, ...cuts, words.length];
      const lines = boundaries.slice(0, -1).map((start, index) => words.slice(start, boundaries[index + 1]).join(' '));
      const widths = lines.map((line) => ctx.measureText(line).width);
      const largest = Math.max(...widths);
      const smallest = Math.min(...widths);
      const phrasePenalty = lines.reduce((penalty, line, index) => {
        const lineWords = line.toLowerCase().split(' ').filter(Boolean);
        const first = lineWords[0] || '';
        const last = lineWords[lineWords.length - 1] || '';
        if (index > 0 && weakEdgeWords.has(first)) penalty += 150;
        if (index < lines.length - 1 && weakEdgeWords.has(last)) penalty += 180;
        if (lineWords.length === 1 && first.length <= 3) penalty += 140;
        return penalty;
      }, 0);
      candidates.push({ lines, score: largest + (largest - smallest) * 0.32 + phrasePenalty });
      return;
    }
    const remainingCuts = actualLineCount - cuts.length - 1;
    for (let index = nextIndex; index <= words.length - remainingCuts; index += 1) {
      collect([...cuts, index], index + 1);
    }
  };

  collect([], 1);
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.lines || [words.join(' ')];
}

function chooseLatinSpineLayout(ctx, title, width, height) {
  const normalized = normalizeSpineTitle(title);
  const words = normalized.split(' ').filter(Boolean);
  const maxLineCount = Math.min(3, Math.max(1, words.length));
  const availableLength = height - 380;
  const availableWidth = width - 82;
  const maxFontSize = width * 0.34;
  const minimumRatios = [0.22, 0.205, 0.175];
  const minimumReadableSizes = [180, 150, 126];
  let fallback = null;

  for (let lineCount = 1; lineCount <= maxLineCount; lineCount += 1) {
    ctx.font = '700 100px Georgia, "Noto Serif SC", serif';
    const lines = balancedLatinLines(ctx, normalized, lineCount);
    const measuredAt100 = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const fontByLength = availableLength / Math.max(measuredAt100 / 100, 0.01);
    const fontByWidth = availableWidth / Math.max(lines.length * 0.94, 1);
    const fontSize = Math.min(maxFontSize, fontByLength, fontByWidth);
    const layout = {
      title: normalized,
      lines,
      lineCount: lines.length,
      fontSize,
      scaleX: 1,
      truncated: false,
      orientation: 'rotated-whole-title',
      strategy: lines.length === 1 ? 'single-band' : 'phrase-balanced-bands'
    };
    fallback = layout;
    const readableFloor = Math.max(
      width * minimumRatios[lineCount - 1],
      minimumReadableSizes[lineCount - 1]
    );
    if (fontSize >= readableFloor) return layout;
  }

  // Extremely long titles keep every word. A restrained horizontal squeeze is
  // closer to condensed book-spine typography than removing the final words.
  if (fallback) {
    ctx.font = `700 ${Math.round(fallback.fontSize)}px Georgia, "Noto Serif SC", serif`;
    const widest = Math.max(...fallback.lines.map((line) => ctx.measureText(line).width));
    fallback.scaleX = Math.max(0.82, Math.min(1, availableLength / Math.max(widest, 1)));
  }
  return fallback || {
    title: normalized,
    lines: [normalized],
    lineCount: 1,
    fontSize: maxFontSize,
    scaleX: 1,
    truncated: false,
    orientation: 'rotated-whole-title',
    strategy: 'single-band'
  };
}

function makeWoodTexture(renderer) {
  return canvasTexture(renderer, 1024, 512, (ctx, width, height) => {
    ctx.fillStyle = '#a97851';
    ctx.fillRect(0, 0, width, height);
    for (let x = 8; x < width; x += 18) {
      const alpha = 0.025 + ((x / 18) % 5) * 0.012;
      ctx.strokeStyle = `rgba(75, 54, 39, ${alpha * 0.82})`;
      ctx.lineWidth = x % 54 === 0 ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 9, height * 0.3, x - 7, height * 0.7, x + 4, height);
      ctx.stroke();
    }
  });
}

function makePageTexture(renderer) {
  return canvasTexture(renderer, 512, 1024, (ctx, width, height) => {
    ctx.fillStyle = '#e9dfc8';
    ctx.fillRect(0, 0, width, height);
    for (let y = 2; y < height; y += 7) {
      ctx.strokeStyle = `rgba(75, 60, 40, ${0.035 + ((y / 7) % 4) * 0.01})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y + Math.sin(y * 0.05));
      ctx.stroke();
    }
  });
}

function makeSpineTexture(renderer, title, color, spineWidth, spineHeight) {
  const textureHeight = 2200;
  const textureWidth = Math.max(420, Math.round(textureHeight * (spineWidth / spineHeight)));
  let typography = null;
  const texture = canvasTexture(renderer, textureWidth, textureHeight, (ctx, width, height) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 0.14;
    for (let x = 28; x < width; x += 42) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 8, height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#423f39';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const normalizedTitle = normalizeSpineTitle(title);
    const isLatin = /^[\x00-\x7f]+$/.test(normalizedTitle);
    const maxFont = width * 0.34;
    let fontSize = maxFont;
    const setFont = () => { ctx.font = `700 ${Math.round(fontSize)}px Georgia, "Noto Serif SC", serif`; };
    setFont();
    if (isLatin) {
      typography = chooseLatinSpineLayout(ctx, normalizedTitle, width, height);
      fontSize = typography.fontSize;
      setFont();
      const lineGap = fontSize * 0.94;
      ctx.save();
      ctx.translate(width * 0.5, height * 0.5);
      ctx.rotate(Math.PI * 0.5);
      ctx.scale(typography.scaleX, 1);
      const startY = -((typography.lines.length - 1) * lineGap) * 0.5;
      typography.lines.forEach((line, index) => ctx.fillText(line, 0, startY + index * lineGap));
      ctx.restore();
    } else {
      const display = Array.from(normalizedTitle);
      fontSize = Math.min(maxFont, (height - 360) / Math.max(display.length * 1.08, 1));
      setFont();
      const lineHeight = fontSize * 1.08;
      const startY = height * 0.5 - ((display.length - 1) * lineHeight) * 0.5;
      display.forEach((char, index) => ctx.fillText(char, width * 0.5, startY + index * lineHeight));
      typography = {
        title: normalizedTitle,
        lines: [display.join('')],
        lineCount: 1,
        fontSize,
        scaleX: 1,
        truncated: display.join('') !== normalizedTitle,
        orientation: 'upright-cjk'
      };
    }
  });
  texture.userData.spineTypography = typography;
  return texture;
}

function addPart(group, geometry, material, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function createBook(renderer, data, materials) {
  const book = new THREE.Group();
  const width = 3.02;
  const { height, depth, color } = data;
  const coverThickness = 0.1;
  const coverZ = depth * 0.5 + coverThickness * 0.5;
  const coverMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.76 });
  const coverDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.82), roughness: 0.8 });
  addPart(book, new RoundedBoxGeometry(width - 0.18, height - 0.24, depth, 6, 0.065), materials.paper, new THREE.Vector3(0.06, 0, 0));
  addPart(book, new RoundedBoxGeometry(width, height, coverThickness, 8, 0.085), coverMaterial, new THREE.Vector3(0, 0, coverZ));
  addPart(book, new RoundedBoxGeometry(width, height, coverThickness, 8, 0.085), coverMaterial, new THREE.Vector3(0, 0, -coverZ));
  addPart(book, new RoundedBoxGeometry(0.21, height, depth + coverThickness * 2, 10, 0.1), coverDark, new THREE.Vector3(-width * 0.5 + 0.04, 0, 0));
  addPart(book, new THREE.PlaneGeometry(depth - 0.04, height - 0.32), materials.pageEdge, new THREE.Vector3(width * 0.5 - 0.025, 0, 0), new THREE.Euler(0, Math.PI * 0.5, 0));
  addPart(book, new THREE.PlaneGeometry(width - 0.34, depth - 0.04), materials.pageEdge, new THREE.Vector3(0.07, height * 0.5 - 0.12, 0), new THREE.Euler(-Math.PI * 0.5, 0, 0));
  addPart(book, new THREE.PlaneGeometry(width - 0.34, depth - 0.04), materials.pageEdge, new THREE.Vector3(0.07, -height * 0.5 + 0.12, 0), new THREE.Euler(Math.PI * 0.5, 0, 0));
  const spineWidth = depth + coverThickness * 1.75;
  const spineHeight = height - 0.16;
  const spineTexture = makeSpineTexture(renderer, data.title, color, spineWidth, spineHeight);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(spineWidth, spineHeight),
    new THREE.MeshStandardMaterial({ map: spineTexture, roughness: 0.78 })
  );
  label.position.set(-width * 0.5 - 0.072, 0, 0);
  label.rotation.y = -Math.PI * 0.5;
  label.userData.spineTypography = spineTexture.userData.spineTypography;
  book.add(label);
  book.rotation.y = Math.PI * 0.5;
  book.userData.post = data;
  book.traverse((node) => { if (node.isMesh) node.userData.post = data; });
  return book;
}

function createCabinet(host, groups, compactLayout = usesCompactCabinet(host)) {
  const columnCount = compactLayout ? 1 : 2;
  const rowCount = Math.max(1, Math.ceil(groups.length / columnCount));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  host.append(renderer.domElement);

  const hemisphere = new THREE.HemisphereLight(0xfff4df, 0x3f251b, 2.15);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xffe5bd, 4.2);
  key.position.set(-4, 8, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 2;
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  scene.add(key);
  const fill = new THREE.PointLight(0xffb36b, 0, 36, 1.6);
  fill.position.set(0, 2.8, 4.8);
  scene.add(fill);

  hemisphere.color.set(FIXED_LIGHTING.sky);
  hemisphere.groundColor.set(FIXED_LIGHTING.ground);
  hemisphere.intensity = FIXED_LIGHTING.hemisphere;
  key.color.set(FIXED_LIGHTING.key);
  key.intensity = FIXED_LIGHTING.keyIntensity;
  key.position.set(...FIXED_LIGHTING.keyPosition);
  fill.intensity = FIXED_LIGHTING.fillIntensity;
  renderer.toneMappingExposure = FIXED_LIGHTING.exposure;
  host.dataset.lightingPeriod = FIXED_LIGHTING.period;
  delete host.dataset.lightingHour;

  const woodMap = makeWoodTexture(renderer);
  const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodMap, roughness: 0.78 });
  const darkWood = new THREE.MeshStandardMaterial({
    color: 0x765749,
    roughness: 1,
    metalness: 0,
    emissive: 0x24140f,
    emissiveIntensity: 0.12
  });
  const paper = new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.96 });
  const pageEdge = new THREE.MeshStandardMaterial({ map: makePageTexture(renderer), roughness: 0.96 });
  const materials = { paper, pageEdge };
  const bayHeight = 5.55;
  const cabinetWidth = compactLayout ? 9.6 : 27.2;
  const cabinetHeight = rowCount * bayHeight + 0.45;
  const cabinetDepth = 2.72;
  const frameThickness = 0.3;
  const sideX = cabinetWidth * 0.5 - frameThickness * 0.5;
  const innerWidth = cabinetWidth - frameThickness * 2;
  const bottomLevel = -cabinetHeight * 0.5 + frameThickness * 0.5;
  const shelfLevels = Array.from({ length: rowCount + 1 }, (_, index) => bottomLevel + index * bayHeight);
  const addShelf = (size, position, material = wood, shadowOptions = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    mesh.position.copy(position);
    mesh.castShadow = shadowOptions.castShadow ?? true;
    mesh.receiveShadow = shadowOptions.receiveShadow ?? true;
    scene.add(mesh);
    return mesh;
  };
  addShelf(
    // Extend the back panel behind the top and bottom rails. A flush fit can
    // expose a bright sub-pixel seam when the cabinet is viewed in perspective.
    new THREE.Vector3(innerWidth, cabinetHeight - 0.1, 0.16),
    new THREE.Vector3(0, 0, -1.31),
    darkWood,
    { castShadow: false, receiveShadow: false }
  );
  shelfLevels.forEach((level, index) => {
    // The outer rails cap the side panels across the cabinet's full width.
    // Keeping them at the inner width exposes the side-panel corner in
    // perspective, which reads as an accidental tab at the top-left edge.
    const isOuterRail = index === 0 || index === shelfLevels.length - 1;
    const railWidth = isOuterRail ? cabinetWidth : innerWidth;
    addShelf(new THREE.Vector3(railWidth, frameThickness, cabinetDepth), new THREE.Vector3(0, level, -0.05));
  });
  // Fit the side panels exactly between the outer faces of the top and bottom
  // rails. Full-height panels poke above the rail as a triangular "ear" once
  // the perspective camera reveals their top faces.
  const sidePanelHeight = cabinetHeight - frameThickness;
  addShelf(new THREE.Vector3(frameThickness, sidePanelHeight, cabinetDepth), new THREE.Vector3(-sideX, 0, -0.05));
  addShelf(new THREE.Vector3(frameThickness, sidePanelHeight, cabinetDepth), new THREE.Vector3(sideX, 0, -0.05));
  if (!compactLayout) {
    for (let row = 0; row < rowCount; row += 1) {
      const lower = shelfLevels[row];
      const upper = shelfLevels[row + 1];
      addShelf(
        new THREE.Vector3(0.28, upper - lower - frameThickness, cabinetDepth),
        new THREE.Vector3(0, (lower + upper) * 0.5, -0.05)
      );
    }
  }

  const interactive = [];
  const pivots = [];
  groups.forEach(([, posts], bayIndex) => {
    const row = Math.floor(bayIndex / columnCount);
    const column = bayIndex % columnCount;
    const floorY = shelfLevels[rowCount - 1 - row];
    const bayLeft = column === 0 ? -sideX + 0.72 : 0.72;
    let cursorX = bayLeft;
    posts.forEach((post, index) => {
      const data = {
        ...post,
        color: palette[(index + bayIndex) % palette.length],
        depth: bookDepthForTitle(post.title),
        titleVisualLength: titleVisualLength(post.title),
        height: 4.05 + ((index * 11 + bayIndex * 5) % 7) * 0.085,
        lean: (((index + bayIndex) % 5) - 2) * 0.009
      };
      const pivot = new THREE.Group();
      const model = createBook(renderer, data, materials);
      model.position.y = data.height * 0.5;
      model.position.z = 0;
      pivot.add(model);
      pivot.position.set(0, floorY + 0.23, 0);
      pivot.rotation.z = data.lean;
      pivot.rotation.y = (index - posts.length * 0.5) * -0.008;
      pivot.userData.post = data;
      pivot.userData.restZ = 0;
      scene.add(pivot);
      pivot.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(pivot);
      const shelfSurfaceY = floorY + 0.215;
      pivot.position.y += shelfSurfaceY - bounds.min.y;
      pivot.updateMatrixWorld(true);
      bounds.setFromObject(pivot);
      pivot.userData.shelfGap = Number((bounds.min.y - shelfSurfaceY).toFixed(4));
      pivot.userData.bookDepth = Number(data.depth.toFixed(4));
      const shelfFrontZ = cabinetDepth * 0.5 - 0.085;
      pivot.position.z += shelfFrontZ - bounds.max.z;
      pivot.updateMatrixWorld(true);
      bounds.setFromObject(pivot);
      pivot.userData.frontGap = Number((shelfFrontZ - bounds.max.z).toFixed(4));
      pivot.userData.restZ = pivot.position.z;
      pivot.position.x += cursorX - bounds.min.x;
      pivot.updateMatrixWorld(true);
      bounds.setFromObject(pivot);
      pivot.userData.restY = pivot.position.y;
      pivot.userData.pullProgress = 0;
      cursorX = bounds.max.x + 0.14;
      pivots.push(pivot);
      model.traverse((node) => { if (node.isMesh) interactive.push(node); });
    });
  });
  host.dataset.minShelfGap = Math.min(...pivots.map((pivot) => pivot.userData.shelfGap)).toFixed(4);
  host.dataset.minBookDepth = Math.min(...pivots.map((pivot) => pivot.userData.bookDepth)).toFixed(4);
  host.dataset.maxBookDepth = Math.max(...pivots.map((pivot) => pivot.userData.bookDepth)).toFixed(4);
  host.dataset.minBookFrontGap = Math.min(...pivots.map((pivot) => pivot.userData.frontGap)).toFixed(4);
  host.dataset.hoverLift = '0.1400';
  const latinSpineTypography = [];
  pivots.forEach((pivot) => {
    pivot.traverse((node) => {
      const typography = node.userData.spineTypography;
      if (typography?.orientation === 'rotated-whole-title') latinSpineTypography.push(typography);
    });
  });
  host.dataset.latinSpineCount = String(latinSpineTypography.length);
  host.dataset.latinSpineMaxLines = String(Math.max(0, ...latinSpineTypography.map((item) => item.lineCount)));
  host.dataset.latinSpineComplete = String(latinSpineTypography.every((item) => {
    const rendered = item.lines.join(' ').replace(/\s+/g, ' ').trim();
    return !item.truncated && rendered === item.title;
  }));

  // Frame the cabinet, not the book cluster. Sparse categories otherwise pull
  // the camera toward their books and crop the opposite side of the cabinet.
  const cabinetCenter = new THREE.Vector3(0, 0.22, -0.08);
  host.dataset.cabinetLayout = compactLayout ? 'compact-stack' : 'two-column-grid';
  const cabinetElement = host.closest('.modeled-cabinet-section');
  const plaqueElements = [...(cabinetElement?.querySelectorAll('.modeled-cabinet-label') || [])];
  cabinetElement?.style.setProperty('--cabinet-rows', rowCount);
  cabinetElement?.style.setProperty('--cabinet-columns', columnCount);
  cabinetElement?.style.setProperty('--cabinet-aspect', (cabinetWidth / cabinetHeight).toFixed(3));

  const tooltip = document.querySelector('#modeled-book-tooltip');
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  let hovered = null;
  let pointerDown = null;
  const findPivot = (object) => {
    let current = object;
    while (current && !current.userData.post) current = current.parent;
    while (current?.parent?.userData.post) current = current.parent;
    return current;
  };
  const pick = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    hovered = raycaster.intersectObjects(interactive, false)[0]?.object || null;
    hovered = hovered ? findPivot(hovered) : null;
    if (!hovered) {
      tooltip?.classList.remove('is-visible');
      return;
    }
    const post = hovered.userData.post;
    tooltip.innerHTML = `<strong>${post.title}</strong><span>${post.excerpt}</span><small>${post.category}${post.date ? ` · ${post.date}` : ''}</small>`;
    const width = Math.min(420, window.innerWidth - 32);
    tooltip.style.left = `${Math.max(16, Math.min(event.clientX + 14, window.innerWidth - width - 16))}px`;
    tooltip.style.top = `${Math.max(16, Math.min(event.clientY + 14, window.innerHeight - 170))}px`;
    tooltip.classList.add('is-visible');
  };
  renderer.domElement.addEventListener('pointermove', pick);
  renderer.domElement.addEventListener('pointerleave', () => { hovered = null; tooltip?.classList.remove('is-visible'); });
  renderer.domElement.addEventListener('pointerdown', (event) => { pointerDown = { x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!pointerDown || !hovered || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return;
    window.location.href = hovered.userData.post.href;
  });

  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 2 || height < 2) {
      host.dataset.projectionState = 'waiting-for-visible-stage';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    const verticalHalf = cabinetHeight * 0.5;
    const horizontalHalf = cabinetWidth * 0.5;
    const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const distanceForHeight = verticalHalf / Math.tan(halfFov);
    const distanceForWidth = horizontalHalf / (Math.tan(halfFov) * camera.aspect);
    const framingDistance = Math.max(distanceForHeight, distanceForWidth) * 1.08;
    camera.position.set(compactLayout ? -0.08 : -0.16, compactLayout ? 0.18 : 0.58, framingDistance);
    camera.lookAt(cabinetCenter);
    camera.updateProjectionMatrix();
    plaqueElements.forEach((label, bayIndex) => {
      const row = Math.floor(bayIndex / columnCount);
      const column = bayIndex % columnCount;
      const bayLeft = column === 0 ? -sideX + 0.72 : 0.72;
      const upperBeamY = shelfLevels[rowCount - row];
      const anchorX = bayLeft + 1.28;
      const anchor = new THREE.Vector3(anchorX, upperBeamY, cabinetDepth * 0.5 + 0.02).project(camera);
      const halfLabelWidth = Math.max(label.offsetWidth * 0.5, 1);
      const halfLabelHeight = Math.max(label.offsetHeight * 0.5, 1);
      const projectedLeft = (anchor.x * 0.5 + 0.5) * width;
      const projectedTop = (-anchor.y * 0.5 + 0.5) * height;
      const left = THREE.MathUtils.clamp(projectedLeft, halfLabelWidth + 4, width - halfLabelWidth - 4);
      const top = THREE.MathUtils.clamp(projectedTop, halfLabelHeight + 4, height - halfLabelHeight - 4);
      label.style.left = `${left}px`;
      label.style.top = `${top}px`;
      label.dataset.projectedBeamTop = projectedTop.toFixed(2);
      label.dataset.clampedBeamTop = top.toFixed(2);
    });
    host.dataset.cameraDistance = framingDistance.toFixed(2);
    host.dataset.projectionState = 'ready';
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const visibilityRoot = host.closest('#all-posts');
  const visibilityObserver = new MutationObserver(() => {
    window.requestAnimationFrame(resize);
  });
  if (visibilityRoot) {
    visibilityObserver.observe(visibilityRoot, {
      attributes: true,
      attributeFilter: ['hidden', 'class', 'style']
    });
  }
  window.addEventListener('hashchange', () => window.requestAnimationFrame(resize), { passive: true });
  resize();
  const render = () => {
    if (!renderer.domElement.isConnected) return;
    pivots.forEach((pivot) => {
      const targetProgress = pivot === hovered ? 1 : 0;
      pivot.userData.pullProgress += (targetProgress - pivot.userData.pullProgress) * 0.12;
      const pull = pivot.userData.pullProgress;
      // Lift while pulling forward so the lower cover clears the shelf fascia
      // for the whole interaction, rather than intersecting it midway.
      pivot.position.y = pivot.userData.restY + pull * 0.14;
      pivot.position.z = pivot.userData.restZ + pull * 0.3;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  };
  render();
  activeScenes.push({ scene, camera, renderer, pivots, groups, observer, visibilityObserver });
}

function mount(posts, force = false) {
  if (!Array.isArray(posts) || !posts.length) return;
  const list = document.querySelector('#all-posts-list');
  if (!list) return;
  const compactLayout = usesCompactCabinet(list);
  if (!force && mounted && mountedLayout === compactLayout && list.querySelector('.modeled-cabinet-section')) return;
  mounted = true;
  mountedLayout = compactLayout;
  mountedPosts = posts;
  destroyActiveScenes();
  const knownPinnedAliases = new Map([
    ['machine-learning', ['机器学习']],
    ['michael-diary', ['michael-diary-2026-05-08']]
  ]);
  const pinnedDefinitions = (Array.isArray(window.MICHEL_PINNED_POSTS) ? window.MICHEL_PINNED_POSTS : [])
    .map((entry) => {
      if (typeof entry === 'string') {
        return { slugs: [entry, ...(knownPinnedAliases.get(entry) || [])], title: '' };
      }
      const canonicalSlug = String(entry?.slug || '').trim();
      return {
        slugs: [
          canonicalSlug,
          ...(knownPinnedAliases.get(canonicalSlug) || []),
          ...(Array.isArray(entry?.aliases) ? entry.aliases : [])
        ]
          .map((slug) => String(slug || '').trim())
          .filter(Boolean),
        title: String(entry?.title || '').trim()
      };
    });
  const postMatchesPinnedDefinition = (post, definition) => {
    const slug = String(post?.slug || '').trim();
    const title = String(post?.title || '').trim();
    return definition.slugs.includes(slug) || Boolean(definition.title && definition.title === title);
  };
  const pinnedPosts = pinnedDefinitions
    .map((definition) => posts.find((post) => postMatchesPinnedDefinition(post, definition)))
    .filter(Boolean);
  const pinnedPostSet = new Set(pinnedPosts);
  const groups = posts.reduce((map, post) => {
    if (pinnedPostSet.has(post)) return map;
    if (!map.has(post.category)) map.set(post.category, []);
    map.get(post.category).push(post);
    return map;
  }, new Map());
  list.replaceChildren();
  list.className = 'all-posts-list all-posts-list--modeled';
  list.dataset.layoutVersion = 'modeled-cabinet-v22-flush-frame-corners';
  const cabinet = document.createElement('section');
  cabinet.className = 'modeled-cabinet-section';
  cabinet.setAttribute('aria-label', `${posts.length} posts in one cabinet`);
  const stage = document.createElement('div');
  stage.className = 'modeled-cabinet-stage';
  const labels = document.createElement('div');
  labels.className = 'modeled-cabinet-labels';
  const tooltip = document.createElement('div');
  tooltip.id = 'modeled-book-tooltip';
  tooltip.className = 'modeled-book-tooltip';
  tooltip.setAttribute('aria-live', 'polite');
  cabinet.append(stage, labels);
  list.append(cabinet, tooltip);
  const categoryEntries = [...groups.entries()].slice(0, 6);
  const groupEntries = pinnedPosts.length
    ? [['Pinned', pinnedPosts], ...categoryEntries]
    : categoryEntries;
  const columnCount = compactLayout ? 1 : 2;
  groupEntries.forEach(([category, categoryPosts], bayIndex) => {
    const label = document.createElement('div');
    label.className = 'modeled-cabinet-label';
    label.style.setProperty('--bay-row', Math.floor(bayIndex / columnCount));
    label.style.setProperty('--bay-column', bayIndex % columnCount);
    label.textContent = category;
    labels.appendChild(label);
  });
  createCabinet(stage, groupEntries, compactLayout);
  window.__modeledBookshelf = {
    activeScenes,
    posts,
    groups: groupEntries.map(([category, categoryPosts]) => ({
      category,
      slugs: categoryPosts.map((post) => post.slug)
    }))
  };
}

window.addEventListener('michel:posts-rendered', (event) => mount(event.detail?.posts));
if (Array.isArray(window.MICHEL_BOOKSHELF_POSTS)) mount(window.MICHEL_BOOKSHELF_POSTS);

window.addEventListener('resize', () => {
  window.clearTimeout(remountTimer);
  remountTimer = window.setTimeout(() => {
    const list = document.querySelector('#all-posts-list');
    if (!mounted || !list || !mountedPosts.length) return;
    if (usesCompactCabinet(list) !== mountedLayout) mount(mountedPosts, true);
  }, 160);
}, { passive: true });
