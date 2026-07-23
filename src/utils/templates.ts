/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FrameElement, WallElement, UtilityElement, MaterialId, WallMaterialId } from '../types';
import { FRAMEWORK_MATERIALS, WALL_MATERIALS, UTILITIES } from '../constants';

const generateId = () => Math.random().toString(36).substring(2, 9);

export function loadTemplate(type: 'house' | 'apartment' | 'skyscraper'): {
  frames: FrameElement[];
  walls: WallElement[];
  utilities: UtilityElement[];
} {
  const frames: FrameElement[] = [];
  const walls: WallElement[] = [];
  const utilities: UtilityElement[] = [];

  const addFrame = (
    material: MaterialId,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number
  ) => {
    const spec = FRAMEWORK_MATERIALS[material] || FRAMEWORK_MATERIALS.steel;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    frames.push({
      id: generateId(),
      material,
      start: { x: x1, y: y1, z: z1 },
      end: { x: x2, y: y2, z: z2 },
      cost: Math.round(dist * spec.costPerMeter),
      weight: dist * spec.density,
      durability: 100,
    });
  };

  const addWall = (
    material: WallMaterialId,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number
  ) => {
    const spec = WALL_MATERIALS[material] || WALL_MATERIALS.concrete;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const height = Math.abs(y2 - y1) > 0.2 ? Math.abs(y2 - y1) : 3.0;
    
    walls.push({
      id: generateId(),
      material,
      start: { x: x1, y: y1, z: z1 },
      end: { x: x2, y: y2, z: z2 },
      cost: Math.round(dist * height * spec.costPerSqm),
      weight: dist * height * spec.weightPerSqm,
    });
  };

  const addUtility = (type: 'door' | 'drain_pipe' | 'electric', x: number, y: number, z: number) => {
    const spec = UTILITIES[type];
    utilities.push({
      id: generateId(),
      type,
      position: { x, y, z },
      cost: spec ? spec.cost : 100000,
    });
  };

  if (type === 'house') {
    // === cozy 2-story house (wooden frame, brick wall) ===
    const mat: MaterialId = 'wood';
    const wallMat: WallMaterialId = 'brick';

    // Ground beams
    addFrame(mat, -3, 0, -3, 3, 0, -3);
    addFrame(mat, 3, 0, -3, 3, 0, 3);
    addFrame(mat, 3, 0, 3, -3, 0, 3);
    addFrame(mat, -3, 0, 3, -3, 0, -3);

    // 1st Floor Columns (3m height)
    addFrame(mat, -3, 0, -3, -3, 3, -3);
    addFrame(mat, 3, 0, -3, 3, 3, -3);
    addFrame(mat, 3, 0, 3, 3, 3, 3);
    addFrame(mat, -3, 0, 3, -3, 3, 3);

    // 1st Floor Ceiling Beams
    addFrame(mat, -3, 3, -3, 3, 3, -3);
    addFrame(mat, 3, 3, -3, 3, 3, 3);
    addFrame(mat, 3, 3, 3, -3, 3, 3);
    addFrame(mat, -3, 3, 3, -3, 3, -3);

    // 2nd Floor Columns (3m to 6m)
    addFrame(mat, -3, 3, -3, -3, 6, -3);
    addFrame(mat, 3, 3, -3, 3, 6, -3);
    addFrame(mat, 3, 3, 3, 3, 6, 3);
    addFrame(mat, -3, 3, 3, -3, 6, 3);

    // 2nd Floor Ceiling Beams
    addFrame(mat, -3, 6, -3, 3, 6, -3);
    addFrame(mat, 3, 6, -3, 3, 6, 3);
    addFrame(mat, 3, 6, 3, -3, 6, 3);
    addFrame(mat, -3, 6, 3, -3, 6, -3);

    // Gable roof trusses (Peak at y=8)
    addFrame(mat, -3, 6, -3, 0, 8, -3);
    addFrame(mat, 3, 6, -3, 0, 8, -3);
    addFrame(mat, -3, 6, 3, 0, 8, 3);
    addFrame(mat, 3, 6, 3, 0, 8, 3);
    addFrame(mat, 0, 8, -3, 0, 8, 3); // Ridge beam

    // Walls - 1st floor
    addWall(wallMat, -3, 0, -3, 3, 0, -3); // Back wall
    addWall(wallMat, -3, 0, -3, -3, 0, 3); // Left wall
    addWall(wallMat, 3, 0, -3, 3, 0, 3); // Right wall
    addWall(wallMat, -3, 0, 3, -0.8, 0, 3); // Front left wall
    addWall(wallMat, 0.8, 0, 3, 3, 0, 3); // Front right wall

    // Walls - 2nd floor (Glass for scenic master bedroom)
    addWall('glass', -3, 3, -3, 3, 3, -3);
    addWall('glass', -3, 3, -3, -3, 3, 3);
    addWall('glass', 3, 3, -3, 3, 3, 3);
    addWall('glass', -3, 3, 3, 3, 3, 3);

    // Utilities
    addUtility('door', 0, 0, 3); // Cozy front door
    addUtility('drain_pipe', 3, 0, 3); // Corner drainpipe
    addUtility('electric', 0, 3, 0); // Lighting for living room

  } else if (type === 'apartment') {
    // === Modern 4-story Apartment (steel frame, concrete/glass wall) ===
    const mat: MaterialId = 'steel';
    const wallMat: WallMaterialId = 'concrete';

    // 4 levels of vertical segments (3m each: 0-3, 3-6, 6-9, 9-12)
    const corners = [
      { x: -4, z: -4 },
      { x: 4, z: -4 },
      { x: 4, z: 4 },
      { x: -4, z: 4 }
    ];

    // Ground base frame
    addFrame(mat, -4, 0, -4, 4, 0, -4);
    addFrame(mat, 4, 0, -4, 4, 0, 4);
    addFrame(mat, 4, 0, 4, -4, 0, 4);
    addFrame(mat, -4, 0, 4, -4, 0, -4);

    for (let floor = 0; floor < 4; floor++) {
      const yStart = floor * 3;
      const yEnd = yStart + 3;

      // Vertical Columns
      corners.forEach(c => {
        addFrame(mat, c.x, yStart, c.z, c.x, yEnd, c.z);
      });

      // Ceiling Beams
      addFrame(mat, -4, yEnd, -4, 4, yEnd, -4);
      addFrame(mat, 4, yEnd, -4, 4, yEnd, 4);
      addFrame(mat, 4, yEnd, 4, -4, yEnd, 4);
      addFrame(mat, -4, yEnd, 4, -4, yEnd, -4);

      // Walls
      addWall(wallMat, -4, yStart, -4, 4, yStart, -4); // Back concrete wall
      addWall(wallMat, -4, yStart, -4, -4, yStart, 4); // Left concrete wall
      addWall(wallMat, 4, yStart, -4, 4, yStart, 4); // Right concrete wall

      if (floor === 0) {
        // Ground entrance door + partial walls
        addWall(wallMat, -4, 0, 4, -1, 0, 4);
        addWall(wallMat, 1, 0, 4, 4, 0, 4);
        addUtility('door', 0, 0, 4);
      } else {
        // Balcony glass facade
        addWall('glass', -4, yStart, 4, 4, yStart, 4);
      }

      // Add floor utility on each level
      addUtility('electric', 0, yStart + 0.1, 0);
    }

    // Vertical drainage on the corner
    addUtility('drain_pipe', -4, 1.5, -4);
    addUtility('drain_pipe', -4, 4.5, -4);
    addUtility('drain_pipe', -4, 7.5, -4);
    addUtility('drain_pipe', -4, 10.5, -4);

  } else if (type === 'skyscraper') {
    // === Giant Skyscraper / Mega Office Building (steel, steel plate/glass) ===
    const mat: MaterialId = 'steel';
    const baseCorners = [
      { x: -5, z: -5 },
      { x: 0, z: -5 },
      { x: 5, z: -5 },
      { x: 5, z: 0 },
      { x: 5, z: 5 },
      { x: 0, z: 5 },
      { x: -5, z: 5 },
      { x: -5, z: 0 }
    ];

    // Ground base frame
    addFrame(mat, -5, 0, -5, 5, 0, -5);
    addFrame(mat, 5, 0, -5, 5, 0, 5);
    addFrame(mat, 5, 0, 5, -5, 0, 5);
    addFrame(mat, -5, 0, 5, -5, 0, -5);
    addFrame(mat, -5, 0, 0, 5, 0, 0); // center tie
    addFrame(mat, 0, 0, -5, 0, 0, 5); // center tie

    const numFloors = 8;
    for (let floor = 0; floor < numFloors; floor++) {
      const yStart = floor * 3;
      const yEnd = yStart + 3;

      // Vertical columns on corners + center midpoint anchors
      baseCorners.forEach(c => {
        addFrame(mat, c.x, yStart, c.z, c.x, yEnd, c.z);
      });
      // Central structural spine pillar
      addFrame(mat, 0, yStart, 0, 0, yEnd, 0);

      // Horizontal Beams on level
      addFrame(mat, -5, yEnd, -5, 5, yEnd, -5);
      addFrame(mat, 5, yEnd, -5, 5, yEnd, 5);
      addFrame(mat, 5, yEnd, 5, -5, yEnd, 5);
      addFrame(mat, -5, yEnd, 5, -5, yEnd, -5);
      addFrame(mat, -5, yEnd, 0, 5, yEnd, 0); // cross beam
      addFrame(mat, 0, yEnd, -5, 0, yEnd, 5); // cross beam

      // Diagonal cross-bracing for extreme earthquake resistance (seismic dampers)
      addFrame(mat, -5, yStart, -5, 0, yEnd, -5);
      addFrame(mat, 0, yStart, -5, 5, yEnd, -5);
      addFrame(mat, -5, yStart, 5, 0, yEnd, 5);
      addFrame(mat, 0, yStart, 5, 5, yEnd, 5);

      // Walls - Steel plates on lower levels for extreme stiffness, Glass on top for premium visual appeal
      const levelWallMat: WallMaterialId = floor < 4 ? 'steel_plate' : 'glass';

      addWall(levelWallMat, -5, yStart, -5, 5, yStart, -5); // back
      addWall(levelWallMat, -5, yStart, -5, -5, yStart, 5); // left
      addWall(levelWallMat, 5, yStart, -5, 5, yStart, 5); // right

      if (floor === 0) {
        // Grand commercial revolving doors
        addWall(levelWallMat, -5, 0, 5, -1, 0, 5);
        addWall(levelWallMat, 1, 0, 5, 5, 0, 5);
        addUtility('door', 0, 0, 5);
      } else {
        addWall(levelWallMat, -5, yStart, 5, 5, yStart, 5); // front glass/steel
      }

      // Add utilities on different levels
      if (floor % 2 === 0) {
        addUtility('electric', 0, yStart + 0.1, 0);
      }
    }

    // Heavy drainage pipes on the back corners
    for (let floor = 0; floor < numFloors; floor++) {
      addUtility('drain_pipe', -5, floor * 3 + 1.5, -5);
      addUtility('drain_pipe', 5, floor * 3 + 1.5, -5);
    }
  }

  return { frames, walls, utilities };
}
