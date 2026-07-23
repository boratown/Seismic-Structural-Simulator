/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaterialSpec, WallSpec, UtilitySpec } from './types';

export const FRAMEWORK_MATERIALS: Record<string, MaterialSpec> = {
  steel: {
    id: 'steel',
    name: 'Steel Rebar',
    nameKo: '철근 (강철)',
    density: 78.5, // kg per meter
    costPerMeter: 45000, // KRW
    durability: 95,
    flexibility: 0.85,
    waterResistance: 0.95,
    color: '#4B5563', // Slate gray
    thickness: 0.15,
  },
  wood: {
    id: 'wood',
    name: 'Processed Wood',
    nameKo: '나무 (목재)',
    density: 18.0,
    costPerMeter: 12000,
    durability: 55,
    flexibility: 0.65,
    waterResistance: 0.50,
    color: '#8B5A2B', // Brown
    thickness: 0.12,
  },
  bamboo: {
    id: 'bamboo',
    name: 'Flexible Bamboo',
    nameKo: '대나무',
    density: 6.2,
    costPerMeter: 4500,
    durability: 40,
    flexibility: 0.95,
    waterResistance: 0.70,
    color: '#4D7C0F', // Green
    thickness: 0.08,
  },
  mud: {
    id: 'mud',
    name: 'Clay Mud',
    nameKo: '흙 (황토/점토)',
    density: 45.0,
    costPerMeter: 1500,
    durability: 15,
    flexibility: 0.10,
    waterResistance: 0.10,
    color: '#78350F', // Dark amber/mud
    thickness: 0.20,
  }
};

export const WALL_MATERIALS: Record<string, WallSpec> = {
  concrete: {
    id: 'concrete',
    name: 'Reinforced Concrete',
    nameKo: '콘크리트 벽',
    weightPerSqm: 240,
    costPerSqm: 55000,
    durability: 90,
    shearStrength: 85,
    waterResistance: 0.90,
    color: '#9CA3AF', // Light gray
  },
  brick: {
    id: 'brick',
    name: 'Clay Brick',
    nameKo: '벽돌 벽',
    weightPerSqm: 140,
    costPerSqm: 28000,
    durability: 65,
    shearStrength: 45,
    waterResistance: 0.75,
    color: '#B45309', // Terracotta
  },
  steel_plate: {
    id: 'steel_plate',
    name: 'Industrial Steel Plate',
    nameKo: '강철 플레이트',
    weightPerSqm: 95,
    costPerSqm: 85000,
    durability: 98,
    shearStrength: 95,
    waterResistance: 0.98,
    color: '#374151', // Charcoal
  },
  glass: {
    id: 'glass',
    name: 'Tempered Glass',
    nameKo: '강화유리 벽',
    weightPerSqm: 30,
    costPerSqm: 45000,
    durability: 25,
    shearStrength: 15,
    waterResistance: 0.95,
    color: '#38BDF8', // Cyan/sky
  }
};

export const UTILITIES: Record<string, UtilitySpec> = {
  door: {
    id: 'door',
    name: 'Safety Exit Door',
    nameKo: '방화 대피문',
    cost: 180000,
    safetyEffect: '대피 경로 확보 (+8% 안전도)',
    description: '비상 탈출을 위한 고성능 방화문입니다. 대피율을 높여 인명 구조 지수를 올립니다.',
    color: '#EF4444',
  },
  drain_pipe: {
    id: 'drain_pipe',
    name: 'Storm Drainage Pipe',
    nameKo: '고성능 배수관',
    cost: 90000,
    safetyEffect: '홍수 저항력 향상 (+25% 수해 극복)',
    description: '집중 호우나 쓰나미 유입 시 배수를 도와 수위 상승 속도를 늦추고 부력을 줄입니다.',
    color: '#3B82F6',
  },
  electric: {
    id: 'electric',
    name: 'Insulated Power Line',
    nameKo: '전기 배선 (조명)',
    cost: 220000,
    safetyEffect: '전기 공급 (침수 시 안전 대비 필요)',
    description: '건물 내부 전기 및 조명을 작동시킵니다. 침수 시 단전이나 감전 위험을 예방하기 위해 방수 절연 마감 처리가 필수적입니다.',
    color: '#F59E0B',
  }
};
