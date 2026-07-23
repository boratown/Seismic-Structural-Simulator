/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

interface TextureSet {
  map: THREE.CanvasTexture;
  bumpMap?: THREE.CanvasTexture;
}

// Global texture cache to prevent regenerating identical textures
const textureCache = new Map<string, TextureSet>();

export function getMaterialTextures(
  materialId: string,
  quality: 'low' | 'medium' | 'high' = 'high'
): TextureSet {
  const cacheKey = `${materialId}_${quality}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const size = quality === 'high' ? 512 : quality === 'medium' ? 256 : 128;
  let textures: TextureSet;

  switch (materialId) {
    case 'brick':
      textures = createBrickTexture(size);
      break;
    case 'concrete':
      textures = createConcreteTexture(size);
      break;
    case 'wood':
      textures = createWoodTexture(size);
      break;
    case 'steel':
    case 'steel_rebar':
      textures = createSteelTexture(size);
      break;
    case 'steel_plate':
      textures = createSteelPlateTexture(size);
      break;
    case 'bamboo':
      textures = createBambooTexture(size);
      break;
    case 'mud':
      textures = createMudTexture(size);
      break;
    case 'glass':
      textures = createGlassTexture(size);
      break;
    case 'ground':
      textures = createGroundTexture(size);
      break;
    default:
      textures = createConcreteTexture(size);
      break;
  }

  textureCache.set(cacheKey, textures);
  return textures;
}

// Clear texture cache if quality settings change drastically
export function clearTextureCache(): void {
  textureCache.forEach(({ map, bumpMap }) => {
    map.dispose();
    bumpMap?.dispose();
  });
  textureCache.clear();
}

/**
 * 1. Brick Pattern Texture (Terracotta bricks with mortar joints)
 */
function createBrickTexture(size: number): TextureSet {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  // Background Mortar
  ctx.fillStyle = '#d1d5db'; // Light gray mortar
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#111111'; // Mortar is indented
  bumpCtx.fillRect(0, 0, size, size);

  const rows = 16;
  const cols = 8;
  const brickH = size / rows;
  const brickW = size / (cols / 2);
  const mortar = Math.max(2, size / 128);

  for (let r = 0; r < rows; r++) {
    const y = r * brickH;
    const offsetX = (r % 2 === 0) ? 0 : brickW / 2;

    for (let c = -1; c <= cols + 1; c++) {
      const x = c * brickW + offsetX;

      // Color variation per brick
      const shade = Math.floor((Math.random() - 0.5) * 40);
      const red = Math.min(255, Math.max(120, 180 + shade));
      const green = Math.min(255, Math.max(50, 83 + Math.floor(shade * 0.5)));
      const blue = Math.min(255, Math.max(10, 20 + Math.floor(shade * 0.2)));

      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      ctx.fillRect(x + mortar / 2, y + mortar / 2, brickW - mortar, brickH - mortar);

      // Add subtle noise/pitting inside each brick
      for (let n = 0; n < 8; n++) {
        const nx = x + mortar + Math.random() * (brickW - mortar * 2);
        const ny = y + mortar + Math.random() * (brickH - mortar * 2);
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
        ctx.fillRect(nx, ny, mortar, mortar);
      }

      // Bump map (white raised bricks)
      bumpCtx.fillStyle = '#eeeeee';
      bumpCtx.fillRect(x + mortar / 2, y + mortar / 2, brickW - mortar, brickH - mortar);
      
      // Bump noise inside brick
      bumpCtx.fillStyle = '#888888';
      for (let n = 0; n < 6; n++) {
        const nx = x + mortar + Math.random() * (brickW - mortar * 2);
        const ny = y + mortar + Math.random() * (brickH - mortar * 2);
        bumpCtx.fillRect(nx, ny, mortar, mortar);
      }
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/**
 * 2. Reinforced Concrete Texture (Architectural concrete with speckles & tie-rod holes)
 */
function createConcreteTexture(size: number): TextureSet {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  // Base concrete grey
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#888888';
  bumpCtx.fillRect(0, 0, size, size);

  // Speckled aggregate noise
  const imgData = ctx.getImageData(0, 0, size, size);
  const bumpData = bumpCtx.getImageData(0, 0, size, size);

  for (let i = 0; i < imgData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 35;
    imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
    imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise));
    imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise));

    const bVal = 128 + noise * 1.5;
    bumpData.data[i] = bVal;
    bumpData.data[i + 1] = bVal;
    bumpData.data[i + 2] = bVal;
  }
  ctx.putImageData(imgData, 0, 0);
  bumpCtx.putImageData(bumpData, 0, 0);

  // Formwork seams (subtle grid lines)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  ctx.strokeRect(0, 0, size / 2, size);

  bumpCtx.strokeStyle = '#222222';
  bumpCtx.lineWidth = 2;
  bumpCtx.strokeRect(0, 0, size, size);
  bumpCtx.strokeRect(0, 0, size / 2, size);

  // Architectural tie-rod circular holes
  const holes = [
    { x: size * 0.15, y: size * 0.15 },
    { x: size * 0.85, y: size * 0.15 },
    { x: size * 0.15, y: size * 0.85 },
    { x: size * 0.85, y: size * 0.85 },
    { x: size * 0.35, y: size * 0.15 },
    { x: size * 0.65, y: size * 0.15 },
  ];

  holes.forEach(({ x, y }) => {
    const radius = Math.max(3, size / 64);

    // Color canvas hole
    ctx.fillStyle = '#4b5563';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner rim shadow
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Bump hole (indented dark circle)
    bumpCtx.fillStyle = '#111111';
    bumpCtx.beginPath();
    bumpCtx.arc(x, y, radius, 0, Math.PI * 2);
    bumpCtx.fill();
  });

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/**
 * 3. Wood Grain Texture (Natural Timber planks/beams with organic grain)
 */
function createWoodTexture(size: number): TextureSet {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  // Base timber amber brown
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#888888';
  bumpCtx.fillRect(0, 0, size, size);

  // Draw natural organic wood fiber streaks
  for (let y = 0; y < size; y++) {
    const wave1 = Math.sin(y * 0.05) * 8;
    const wave2 = Math.cos(y * 0.02) * 12;
    const intensity = Math.sin(y * 0.15 + wave1 * 0.1) * 0.5 + 0.5;

    // Dark wood fiber color
    const darkR = 100 + intensity * 40;
    const darkG = 60 + intensity * 25;
    const darkB = 25 + intensity * 15;

    ctx.fillStyle = `rgb(${Math.floor(darkR)}, ${Math.floor(darkG)}, ${Math.floor(darkB)})`;
    ctx.fillRect(0, y, size, 1);

    // Bump map ridge
    const bVal = 80 + intensity * 90;
    bumpCtx.fillStyle = `rgb(${Math.floor(bVal)}, ${Math.floor(bVal)}, ${Math.floor(bVal)})`;
    bumpCtx.fillRect(0, y, size, 1);
  }

  // Draw knots
  const knots = [{ x: size * 0.3, y: size * 0.45, r: size * 0.08 }];
  knots.forEach((k) => {
    for (let r = k.r; r > 0; r -= 1.5) {
      ctx.strokeStyle = r % 3 < 1.5 ? '#4a2c11' : '#a06a38';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(k.x, k.y, r * 1.5, r, 0.2, 0, Math.PI * 2);
      ctx.stroke();

      bumpCtx.strokeStyle = r % 3 < 1.5 ? '#222222' : '#dddddd';
      bumpCtx.lineWidth = 1.5;
      bumpCtx.beginPath();
      bumpCtx.ellipse(k.x, k.y, r * 1.5, r, 0.2, 0, Math.PI * 2);
      bumpCtx.stroke();
    }
  });

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/**
 * 4. Steel Rebar / Metallic Tube Texture (Brushed metallic streaks and ribbed rings)
 */
function createSteelTexture(size: number): TextureSet {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  // Base metallic dark slate
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#888888';
  bumpCtx.fillRect(0, 0, size, size);

  // Brushed metal fine vertical streaks
  for (let x = 0; x < size; x++) {
    const val = 60 + Math.random() * 50;
    ctx.fillStyle = `rgb(${val + 10}, ${val + 15}, ${val + 20})`;
    ctx.fillRect(x, 0, 1, size);

    bumpCtx.fillStyle = `rgb(${val}, ${val}, ${val})`;
    bumpCtx.fillRect(x, 0, 1, size);
  }

  // Horizontal rebar ribbed rings
  const ribSpacing = size / 16;
  for (let y = 0; y < size; y += ribSpacing) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, y, size, ribSpacing * 0.35);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, y + ribSpacing * 0.35, size, ribSpacing * 0.25);

    // Bump ridges for rebar grips
    bumpCtx.fillStyle = '#ffffff';
    bumpCtx.fillRect(0, y, size, ribSpacing * 0.35);

    bumpCtx.fillStyle = '#000000';
    bumpCtx.fillRect(0, y + ribSpacing * 0.35, size, ribSpacing * 0.25);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/**
 * 5. Industrial Steel Plate (Diamond tread checker plate pattern)
 */
function createSteelPlateTexture(size: number): TextureSet {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  // Dark industrial steel plate
  ctx.fillStyle = '#374151';
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#444444';
  bumpCtx.fillRect(0, 0, size, size);

  // Panel seam border with corner rivets
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = Math.max(2, size / 128);
  ctx.strokeRect(0, 0, size, size);

  bumpCtx.strokeStyle = '#000000';
  bumpCtx.lineWidth = Math.max(2, size / 128);
  bumpCtx.strokeRect(0, 0, size, size);

  // Draw rivets
  const rivetOffset = size * 0.08;
  const rivets = [
    { x: rivetOffset, y: rivetOffset },
    { x: size - rivetOffset, y: rivetOffset },
    { x: rivetOffset, y: size - rivetOffset },
    { x: size - rivetOffset, y: size - rivetOffset },
    { x: size / 2, y: rivetOffset },
    { x: size / 2, y: size - rivetOffset },
  ];

  rivets.forEach(({ x, y }) => {
    const r = Math.max(3, size / 64);

    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    bumpCtx.fillStyle = '#ffffff';
    bumpCtx.beginPath();
    bumpCtx.arc(x, y, r, 0, Math.PI * 2);
    bumpCtx.fill();
  });

  // Diamond tread ridges grid
  const step = size / 8;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) {
        const cx = c * step + step / 2;
        const cy = r * step + step / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);

        ctx.fillStyle = '#6b7280';
        ctx.fillRect(-step * 0.25, -step * 0.08, step * 0.5, step * 0.16);

        ctx.restore();

        bumpCtx.save();
        bumpCtx.translate(cx, cy);
        bumpCtx.rotate(Math.PI / 4);

        bumpCtx.fillStyle = '#eeeeee';
        bumpCtx.fillRect(-step * 0.25, -step * 0.08, step * 0.5, step * 0.16);

        bumpCtx.restore();
      }
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/**
 * 6. Bamboo Texture (Green-yellow stalk with vertical striations & joint rings)
 */
function createBambooTexture(size: number): TextureSet {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  // Base bamboo green
  ctx.fillStyle = '#4d7c0f';
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#888888';
  bumpCtx.fillRect(0, 0, size, size);

  // Vertical fiber striations
  for (let x = 0; x < size; x++) {
    const val = (Math.sin(x * 0.2) + 1) * 0.5;
    const g = 110 + val * 45;
    ctx.fillStyle = `rgb(${Math.floor(65 + val * 20)}, ${Math.floor(g)}, ${Math.floor(10 + val * 10)})`;
    ctx.fillRect(x, 0, 1, size);
  }

  // Bamboo node joints (rings)
  const nodeSpacing = size / 4;
  for (let y = nodeSpacing / 2; y < size; y += nodeSpacing) {
    // Dark ring
    ctx.fillStyle = '#2d4a09';
    ctx.fillRect(0, y, size, nodeSpacing * 0.08);

    // Light highlight edge
    ctx.fillStyle = '#a3e635';
    ctx.fillRect(0, y + nodeSpacing * 0.08, size, nodeSpacing * 0.04);

    // Bump map for raised bamboo node ring
    bumpCtx.fillStyle = '#ffffff';
    bumpCtx.fillRect(0, y, size, nodeSpacing * 0.12);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/**
 * 7. Mud / Clay Texture (Organic earth with dirt noise, clumps & straw fibers)
 */
function createMudTexture(size: number): TextureSet {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  // Dark earthy brown
  ctx.fillStyle = '#78350f';
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#888888';
  bumpCtx.fillRect(0, 0, size, size);

  // Coarse dirt clumps and sand speckles
  const imgData = ctx.getImageData(0, 0, size, size);
  const bumpData = bumpCtx.getImageData(0, 0, size, size);

  for (let i = 0; i < imgData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 50;
    imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
    imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise * 0.5));
    imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise * 0.2));

    const bVal = 128 + noise * 2;
    bumpData.data[i] = bVal;
    bumpData.data[i + 1] = bVal;
    bumpData.data[i + 2] = bVal;
  }
  ctx.putImageData(imgData, 0, 0);
  bumpCtx.putImageData(bumpData, 0, 0);

  // Straw fiber strands embedded in mud
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 1.5;
  for (let s = 0; s < 25; s++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const len = 10 + Math.random() * 20;
    const angle = Math.random() * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
    ctx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/**
 * 8. Tempered Glass Texture (Cyan/sky blue tinted glass with soft reflections)
 */
function createGlassTexture(size: number): TextureSet {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Light translucent sky blue tint gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
  grad.addColorStop(0.5, 'rgba(186, 230, 253, 0.2)');
  grad.addColorStop(1, 'rgba(14, 165, 233, 0.4)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Soft diagonal reflection sheen
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(size * 0.2, 0);
  ctx.lineTo(size * 0.5, 0);
  ctx.lineTo(size * 0.1, size);
  ctx.lineTo(0, size);
  ctx.closePath();
  ctx.fill();

  // Glass panel perimeter border bevel
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = Math.max(2, size / 128);
  ctx.strokeRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  return { map };
}

/**
 * 9. Ground Concrete Foundation Tile Texture
 */
function createGroundTexture(size: number): TextureSet {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  // Slate ground color
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#888888';
  bumpCtx.fillRect(0, 0, size, size);

  // Concrete aggregate speckles
  const imgData = ctx.getImageData(0, 0, size, size);
  const bumpData = bumpCtx.getImageData(0, 0, size, size);

  for (let i = 0; i < imgData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 20;
    imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
    imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise));
    imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise));

    const bVal = 128 + noise;
    bumpData.data[i] = bVal;
    bumpData.data[i + 1] = bVal;
    bumpData.data[i + 2] = bVal;
  }
  ctx.putImageData(imgData, 0, 0);
  bumpCtx.putImageData(bumpData, 0, 0);

  // Tile joints
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);

  bumpCtx.strokeStyle = '#000000';
  bumpCtx.lineWidth = 3;
  bumpCtx.strokeRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(10, 10);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(10, 10);

  return { map, bumpMap };
}
