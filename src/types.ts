/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MaterialId = 'steel' | 'wood' | 'bamboo' | 'mud';
export type WallMaterialId = 'brick' | 'concrete' | 'steel_plate' | 'glass';
export type UtilityId = 'door' | 'drain_pipe' | 'electric';

export interface MaterialSpec {
  id: MaterialId;
  name: string;
  nameKo: string;
  density: number; // kg per meter
  costPerMeter: number; // KRW per meter
  durability: number; // Max stress before breaking (0-100)
  flexibility: number; // Resilience to bending (0-1)
  waterResistance: number; // 0-1 (degradation multiplier)
  color: string;
  thickness: number;
}

export interface WallSpec {
  id: WallMaterialId;
  name: string;
  nameKo: string;
  weightPerSqm: number; // kg/m^2
  costPerSqm: number; // KRW/m^2
  durability: number; // 0-100
  shearStrength: number; // Resistance to lateral force
  waterResistance: number;
  color: string;
}

export interface UtilitySpec {
  id: UtilityId;
  name: string;
  nameKo: string;
  cost: number;
  safetyEffect: string;
  description: string;
  color: string;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface FrameElement {
  id: string;
  material: MaterialId;
  start: Vector3D;
  end: Vector3D;
  cost: number;
  weight: number;
  durability: number; // current durability
  welded?: boolean;
}

export interface WallElement {
  id: string;
  material: WallMaterialId;
  // Positioned between 4 framing points or defined by a rectangular plane
  start: Vector3D;
  end: Vector3D;
  cost: number;
  weight: number;
  height?: number;
  welded?: boolean;
}

export interface UtilityElement {
  id: string;
  type: UtilityId;
  position: Vector3D;
  cost: number;
  rotation?: number;
  scale?: number;
}

export type SimulatorStage = 'framing' | 'cladding' | 'testing';

export type DisasterType = 'earthquake' | 'tsunami' | 'tornado' | 'flood';

export interface QualitySettings {
  graphics: 'high' | 'medium' | 'low';
  textures: 'high' | 'medium' | 'low';
  polygons: 'high' | 'medium' | 'low';
  shadows: 'high' | 'medium' | 'low';
  distance: 'high' | 'medium' | 'low' | 'off';
  clouds: 'fancy' | 'fast' | 'off';
  water: 'fancy' | 'fast' | 'static';
}

export interface SimulationResult {
  survivalTime: number; // seconds
  maxIntensityReached: number;
  structuralIntegrity: number; // 0 - 100%
  seismicRatingYears: number; // years (내진 연한)
  damageCost: number; // KRW
  collapseReason: string;
}
