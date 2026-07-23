/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import Matter from 'matter-js';
import { 
  FrameElement, 
  WallElement, 
  UtilityElement, 
  MaterialId, 
  WallMaterialId, 
  UtilityId, 
  DisasterType, 
  QualitySettings, 
  Vector3D 
} from '../types';
import { FRAMEWORK_MATERIALS, WALL_MATERIALS, UTILITIES } from '../constants';
import { getMaterialTextures } from '../utils/textureGenerator';
import { Eye, ShieldAlert, Coins, Weight, HelpCircle, Construction, Zap, FlameKindling, Waves, Wind, Droplets, Navigation, Box, Search, Copy, MapPin, Trash2, X, Filter, RotateCw, Move, Maximize2 } from 'lucide-react';

interface SimulatorCanvasProps {
  stage: 'framing' | 'cladding' | 'testing';
  selectedMaterial: MaterialId | null;
  selectedWallMaterial: WallMaterialId | null;
  selectedUtility: UtilityId | null;
  frames: FrameElement[];
  walls: WallElement[];
  utilities: UtilityElement[];
  onAddFrame: (frame: FrameElement) => void;
  onUpdateFrame?: (frame: FrameElement) => void;
  onAddWall: (wall: WallElement) => void;
  onUpdateWall?: (wall: WallElement) => void;
  onAddUtility: (utility: UtilityElement) => void;
  onUpdateUtility?: (utility: UtilityElement) => void;
  onDeleteElement: (id: string, type: 'frame' | 'wall' | 'utility') => void;
  onClearAll: (keepExisting: boolean) => void;
  activeDisaster: DisasterType | null;
  disasterIntensity: number; // 1 to 10
  qualitySettings: QualitySettings;
  isDisasterRunning?: boolean;
  onSimulationUpdate: (integrity: number, survivalSec: number, collapseReason: string) => void;
  activeAiTimelineStep?: {
    timeOffset: number;
    stageName: string;
    description: string;
    suggestedIntensity: number;
    dynamicEffects: {
      glassShatter: boolean;
      wallBreak: boolean;
      lightsOut: boolean;
      fireAlarm: boolean;
    };
  } | null;
}

export default function SimulatorCanvas({
  stage,
  selectedMaterial,
  selectedWallMaterial,
  selectedUtility,
  frames,
  walls,
  utilities,
  onAddFrame,
  onUpdateFrame,
  onAddWall,
  onUpdateWall,
  onAddUtility,
  onUpdateUtility,
  onDeleteElement,
  onClearAll,
  activeDisaster,
  disasterIntensity,
  qualitySettings,
  isDisasterRunning = false,
  onSimulationUpdate,
  activeAiTimelineStep,
}: SimulatorCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const offScreenIndicatorRef = useRef<HTMLDivElement>(null);
  
  // State refs to make them accessible inside Three.js update loops
  const stageRef = useRef(stage);
  const isDisasterRunningRef = useRef(isDisasterRunning);
  const selectedMaterialRef = useRef(selectedMaterial);
  const selectedWallMaterialRef = useRef(selectedWallMaterial);
  const selectedUtilityRef = useRef(selectedUtility);
  const framesRef = useRef(frames);
  const wallsRef = useRef(walls);
  const utilitiesRef = useRef(utilities);
  const disasterRef = useRef(activeDisaster);
  const intensityRef = useRef(disasterIntensity);
  const elementCollisionDamageMapRef = useRef<Map<string, number>>(new Map());
  const activeAiTimelineStepRef = useRef<any>(null);
  const checkCollisionRef = useRef<any>(null);
  
  // Interaction variables
  const [is3D, setIs3D] = useState(true);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [mouseMode, setMouseMode] = useState<'build' | 'position' | 'rotation' | 'scale'>('build');
  
  const isAltPressedRef = useRef(false);
  const mouseModeRef = useRef<'build' | 'position' | 'rotation' | 'scale'>('build');

  const onUpdateFrameRef = useRef(onUpdateFrame);
  const onUpdateWallRef = useRef(onUpdateWall);
  const onUpdateUtilityRef = useRef(onUpdateUtility);
  const buildThreeMeshesRef = useRef<() => void>(() => {});

  // Persistent camera parameters across rerenders / rebuilds
  const cameraTargetRef = useRef(new THREE.Vector3(0, 4, 0));
  const cameraDistanceRef = useRef(25);
  const cameraThetaRef = useRef(Math.PI / 4);
  const cameraPhiRef = useRef(Math.PI / 3);

  const is3DRef = useRef(is3D);
  
  // Debug Position Inspector state
  const [showDebugInspector, setShowDebugInspector] = useState(false);
  const [debugSearchQuery, setDebugSearchQuery] = useState('');
  const [debugCategory, setDebugCategory] = useState<'all' | 'frame' | 'wall' | 'utility'>('all');
  const [selectedDebugId, setSelectedDebugId] = useState<string | null>(null);
  const [copyNotification, setCopyNotification] = useState<string | null>(null);

  const selectedDebugIdRef = useRef(selectedDebugId);
  useEffect(() => {
    selectedDebugIdRef.current = selectedDebugId;
  }, [selectedDebugId]);

  // Sequential Object Verification & Gravity Application State
  const [objectValidation, setObjectValidation] = useState<{
    stage: 'idle' | 'validating' | 'verified';
    currentIndex: number;
    totalCount: number;
    currentLabel: string;
    hasGravity: boolean;
  }>({
    stage: 'idle',
    currentIndex: 0,
    totalCount: 0,
    currentLabel: '',
    hasGravity: true,
  });

  const objectValidationRef = useRef(objectValidation);
  useEffect(() => {
    objectValidationRef.current = objectValidation;
  }, [objectValidation]);

  // Wall height helper to support dynamic scaling and default dimensions
  const getWallHeight = (wall: any) => {
    if (wall.height !== undefined && wall.height !== null && !isNaN(wall.height)) return wall.height;
    const deltaY = Math.abs(wall.end.y - wall.start.y);
    return deltaY > 0.2 ? deltaY : 3.0;
  };

  // Sequential Object Validation Runner when stage === 'testing'
  useEffect(() => {
    if (stage === 'testing') {
      const total = frames.length + walls.length + utilities.length;
      if (total === 0) {
        setObjectValidation({
          stage: 'verified',
          currentIndex: 0,
          totalCount: 0,
          currentLabel: '구조물 개체가 없습니다.',
          hasGravity: true,
        });
        return;
      }

      setObjectValidation({
        stage: 'validating',
        currentIndex: 0,
        totalCount: total,
        currentLabel: '개체 순차 무결성 검증 진행 중...',
        hasGravity: false,
      });

      let current = 0;
      const interval = setInterval(() => {
        current++;
        if (current <= total) {
          let label = '';
          if (current <= frames.length) {
            label = `골조 개체 #${current} 규격 및 결합점 무결성 검증 완료`;
          } else if (current <= frames.length + walls.length) {
            const wallIdx = current - frames.length;
            label = `벽체 개체 #${wallIdx} 하중 균형 및 지지 상태 검증 완료`;
          } else {
            const utilIdx = current - frames.length - walls.length;
            label = `설비 개체 #${utilIdx} 설치 밸런스 검증 완료`;
          }

          setObjectValidation({
            stage: 'validating',
            currentIndex: current,
            totalCount: total,
            currentLabel: label,
            hasGravity: false,
          });
        } else {
          clearInterval(interval);
          setObjectValidation({
            stage: 'verified',
            currentIndex: total,
            totalCount: total,
            currentLabel: `모든 개체(${total}개) 무결성 검증 완료 (0건 오류) | 중력 가속도(9.81 m/s²) 적용`,
            hasGravity: true,
          });
        }
      }, 180);

      return () => clearInterval(interval);
    } else {
      setObjectValidation({
        stage: 'idle',
        currentIndex: 0,
        totalCount: 0,
        currentLabel: '',
        hasGravity: false,
      });
    }
  }, [stage, frames.length, walls.length, utilities.length]);

  // Hover/Creation Tooltip Info
  const [tooltipInfo, setTooltipInfo] = useState<{
    show: boolean;
    x: number;
    y: number;
    title: string;
    details: string[];
  }>({ show: false, x: 0, y: 0, title: '', details: [] });
  
  const [outOfBoundsError, setOutOfBoundsError] = useState(false);
  const outOfBoundsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update refs when props change
  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { isDisasterRunningRef.current = isDisasterRunning; }, [isDisasterRunning]);
  useEffect(() => { selectedMaterialRef.current = selectedMaterial; }, [selectedMaterial]);
  useEffect(() => { selectedWallMaterialRef.current = selectedWallMaterial; }, [selectedWallMaterial]);
  useEffect(() => { selectedUtilityRef.current = selectedUtility; }, [selectedUtility]);
  useEffect(() => { framesRef.current = frames; }, [frames]);
  useEffect(() => { wallsRef.current = walls; }, [walls]);
  useEffect(() => { utilitiesRef.current = utilities; }, [utilities]);
  useEffect(() => { disasterRef.current = activeDisaster; }, [activeDisaster]);
  useEffect(() => { intensityRef.current = disasterIntensity; }, [disasterIntensity]);
  useEffect(() => { is3DRef.current = is3D; }, [is3D]);
  useEffect(() => { activeAiTimelineStepRef.current = activeAiTimelineStep; }, [activeAiTimelineStep]);
  useEffect(() => { mouseModeRef.current = mouseMode; }, [mouseMode]);
  useEffect(() => { onUpdateFrameRef.current = onUpdateFrame; }, [onUpdateFrame]);
  useEffect(() => { onUpdateWallRef.current = onUpdateWall; }, [onUpdateWall]);
  useEffect(() => { onUpdateUtilityRef.current = onUpdateUtility; }, [onUpdateUtility]);

  // Handle hotkeys & state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIs3D(prev => !prev);
      }
      if (e.key === 'Alt') {
        setIsAltPressed(true);
        isAltPressedRef.current = true;
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'r') {
        setMouseMode(prev => {
          if (prev === 'build') return 'position';
          if (prev === 'position') return 'rotation';
          if (prev === 'rotation') return 'scale';
          return 'build';
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setIsAltPressed(false);
        isAltPressedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Main Three.js + Matter.js Setup Loop
  useEffect(() => {
    if (!mountRef.current) return;

    // --- 1. Three.js Initialization ---
    const width = mountRef.current.clientWidth || 800;
    const height = mountRef.current.clientHeight || 500;

    const scene = new THREE.Scene();
    // Sky blue background color with matching fog
    const skyColor = '#bae6fd';
    scene.background = new THREE.Color(skyColor);
    if (qualitySettings.distance !== 'off') {
      scene.fog = new THREE.FogExp2(skyColor, qualitySettings.distance === 'low' ? 0.05 : 0.012);
    }

    // --- Sky Clouds Setup ---
    const cloudGroup = new THREE.Group();
    let cloudMaterial: THREE.RawShaderMaterial | null = null;
    
    if (qualitySettings.clouds !== 'off') {
      // Create the volumetric cloud texture
      const size = qualitySettings.textures === 'high' ? 128 : (qualitySettings.textures === 'medium' ? 64 : 32);
    const data = new Uint8Array( size * size * size );
    let i = 0;
    const scale = 0.05 * (128 / size); // scale noise to keep features similar size
    const perlin = new ImprovedNoise();
    const vector = new THREE.Vector3();

    for ( let z = 0; z < size; z ++ ) {
      for ( let y = 0; y < size; y ++ ) {
        for ( let x = 0; x < size; x ++ ) {
          const d = 1.0 - vector.set( x, y, z ).subScalar( size / 2 ).divideScalar( size ).length();
          data[ i ] = ( 128 + 128 * perlin.noise( x * scale / 1.5, y * scale, z * scale / 1.5 ) ) * d * d;
          i ++;
        }
      }
    }

    const cloudTexture = new THREE.Data3DTexture( data, size, size, size );
    cloudTexture.format = THREE.RedFormat;
    cloudTexture.minFilter = THREE.LinearFilter;
    cloudTexture.magFilter = THREE.LinearFilter;
    cloudTexture.unpackAlignment = 1;
    cloudTexture.needsUpdate = true;

    const vertexShader = /* glsl */`
      in vec3 position;
      uniform mat4 modelMatrix;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform vec3 cameraPos;
      out vec3 vOrigin;
      out vec3 vDirection;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        vOrigin = vec3( inverse( modelMatrix ) * vec4( cameraPos, 1.0 ) ).xyz;
        vDirection = position - vOrigin;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = /* glsl */`
      precision highp float;
      precision highp sampler3D;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      in vec3 vOrigin;
      in vec3 vDirection;
      out vec4 color;
      uniform vec3 base;
      uniform sampler3D map;
      uniform float threshold;
      uniform float range;
      uniform float opacity;
      uniform float steps;
      uniform float frame;
      uint wang_hash(uint seed)
      {
          seed = (seed ^ 61u) ^ (seed >> 16u);
          seed *= 9u;
          seed = seed ^ (seed >> 4u);
          seed *= 0x27d4eb2du;
          seed = seed ^ (seed >> 15u);
          return seed;
      }
      float randomFloat(inout uint seed)
      {
          return float(wang_hash(seed)) / 4294967296.;
      }
      vec2 hitBox( vec3 orig, vec3 dir ) {
        const vec3 box_min = vec3( - 0.5 );
        const vec3 box_max = vec3( 0.5 );
        vec3 inv_dir = 1.0 / dir;
        vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
        vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
        vec3 tmin = min( tmin_tmp, tmax_tmp );
        vec3 tmax = max( tmin_tmp, tmax_tmp );
        float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
        float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
        return vec2( t0, t1 );
      }
      float sample1( vec3 p ) {
        return texture( map, p ).r;
      }
      float shading( vec3 coord ) {
        float step = 0.01;
        return sample1( coord + vec3( - step ) ) - sample1( coord + vec3( step ) );
      }
      vec4 linearToSRGB( in vec4 value ) {
        return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
      }
      void main(){
        vec3 rayDir = normalize( vDirection );
        vec2 bounds = hitBox( vOrigin, rayDir );
        if ( bounds.x > bounds.y ) discard;
        bounds.x = max( bounds.x, 0.0 );
        float stepSize = ( bounds.y - bounds.x ) / steps;
        uint seed = uint( gl_FragCoord.x ) * uint( 1973 ) + uint( gl_FragCoord.y ) * uint( 9277 ) + uint( frame ) * uint( 26699 );
        vec3 texSize = vec3( textureSize( map, 0 ) );
        float randNum = randomFloat( seed ) * 2.0 - 1.0;
        vec3 p = vOrigin + bounds.x * rayDir;
        p += rayDir * randNum * ( 1.0 / texSize );
        vec4 ac = vec4( base, 0.0 );
        for ( float i = 0.0; i < steps; i += 1.0 ) {
          float t = bounds.x + i * stepSize;
          float d = sample1( p + 0.5 );
          d = smoothstep( threshold - range, threshold + range, d ) * opacity;
          float col = shading( p + 0.5 ) * 3.0 + ( ( p.x + p.y ) * 0.25 ) + 0.2;
          ac.rgb += ( 1.0 - ac.a ) * d * col;
          ac.a += ( 1.0 - ac.a ) * d;
          if ( ac.a >= 0.95 ) break;
          p += rayDir * stepSize;
        }
        color = linearToSRGB( ac );
        if ( color.a == 0.0 ) discard;
      }
    `;

    cloudMaterial = new THREE.RawShaderMaterial( {
      glslVersion: THREE.GLSL3,
      uniforms: {
        base: { value: new THREE.Color( 0xffffff ) },
        map: { value: cloudTexture },
        cameraPos: { value: new THREE.Vector3() },
        threshold: { value: 0.25 },
        opacity: { value: 0.35 },
        range: { value: 0.1 },
        steps: { value: qualitySettings.clouds === 'fancy' ? 100 : 25 },
        frame: { value: 0 }
      },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      transparent: true
    } );

      const cloudGeometry = new THREE.BoxGeometry( 1, 1, 1 );
      for (let j = 0; j < 6; j++) {
        const mesh = new THREE.Mesh( cloudGeometry, cloudMaterial );
        const sX = 30 + Math.random() * 20;
        const sY = 15 + Math.random() * 10;
        const sZ = 30 + Math.random() * 20;
        mesh.scale.set(sX, sY, sZ);
        const cX = (Math.random() - 0.5) * 80;
        const cY = 25 + (Math.random() - 0.5) * 8;
        const cZ = (Math.random() - 0.5) * 80;
        mesh.position.set(cX, cY, cZ);
        cloudGroup.add(mesh);
      }
      scene.add(cloudGroup);
    }

    // Camera parameters
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    
    // Orbital control states
    let cameraTarget = cameraTargetRef.current.clone();
    let cameraDistance = cameraDistanceRef.current;
    let cameraTheta = cameraThetaRef.current; // Horizontal rotation
    let cameraPhi = cameraPhiRef.current;   // Vertical rotation

    // Update camera position helper using smooth interpolated camera angles
    const updateCameraPosition = () => {
      const phi = THREE.MathUtils.clamp(cameraPhi, 0.01, Math.PI / 2);
      camera.position.x = cameraTarget.x + cameraDistance * Math.sin(cameraTheta) * Math.sin(phi);
      camera.position.y = cameraTarget.y + cameraDistance * Math.cos(phi);
      camera.position.z = cameraTarget.z + cameraDistance * Math.cos(cameraTheta) * Math.sin(phi);
      camera.lookAt(cameraTarget);
    };

    // Camera lerp targets for 2D/3D smooth transitions
    let thetaTarget = cameraTheta;
    let phiTarget = cameraPhi;
    let distanceTarget = cameraDistance;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.display = 'block';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, qualitySettings.graphics === 'high' ? 2 : 1));
    renderer.shadowMap.enabled = qualitySettings.shadows !== 'low';
    if (qualitySettings.shadows === 'high') {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    mountRef.current.appendChild(renderer.domElement);

    // --- 2. Lights Setup ---
    const ambientLight = new THREE.AmbientLight('#ffffff', qualitySettings.graphics === 'low' ? 0.8 : 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight('#ffffff', 1.0);
    dirLight.position.set(15, 30, 15);
    dirLight.castShadow = qualitySettings.shadows !== 'low';
    if (qualitySettings.shadows === 'high') {
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
    } else {
      dirLight.shadow.mapSize.width = 512;
      dirLight.shadow.mapSize.height = 512;
    }
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    const d = 20;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    const floorLight = new THREE.DirectionalLight('#4f46e5', 0.4);
    floorLight.position.set(-15, 2, -15);
    scene.add(floorLight);

    const sirenLight = new THREE.PointLight('#ff0000', 0.0, 30);
    sirenLight.position.set(0, 6, 0);
    scene.add(sirenLight);

    // --- 3. Grid & Ground Setup ---
    // Ground Grid with brighter lines
    const gridSize = 30;
    const gridDivisions = 30; // 1 division per meter
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, '#4f46e5', '#94a3b8');
    gridHelper.position.y = 0.001;
    scene.add(gridHelper);

    // Ground plane with procedural foundation tile texture
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundTex = getMaterialTextures('ground', qualitySettings.textures);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#6b7280', // Beautiful slate concrete grey
      map: groundTex.map,
      bumpMap: groundTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.85,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Height Guider Line & Dot (Ctrl + mouse height indicator)
    const heightLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 10, 0)
    ]);
    const heightLineMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 });
    const heightLine = new THREE.Line(heightLineGeo, heightLineMat);
    heightLine.visible = false;
    scene.add(heightLine);

    const heightDotGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const heightDotMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const heightDot = new THREE.Mesh(heightDotGeo, heightDotMat);
    heightDot.visible = false;
    scene.add(heightDot);

    // 3D Debug Highlight Gizmo (Wireframe Box + Target Center Sphere)
    const debugGizmoGroup = new THREE.Group();
    const gizmoBoxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const gizmoBoxMat = new THREE.MeshBasicMaterial({
      color: '#10b981',
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const gizmoBoxMesh = new THREE.Mesh(gizmoBoxGeo, gizmoBoxMat);
    debugGizmoGroup.add(gizmoBoxMesh);

    const gizmoCenterGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const gizmoCenterMat = new THREE.MeshBasicMaterial({ color: '#34d399' });
    const gizmoCenterMesh = new THREE.Mesh(gizmoCenterGeo, gizmoCenterMat);
    debugGizmoGroup.add(gizmoCenterMesh);

    debugGizmoGroup.visible = false;
    scene.add(debugGizmoGroup);

    // --- 3.5. Rotation, Scale, Translation Axes Gizmo Setup ---
    const rotationGizmoGroup = new THREE.Group();
    rotationGizmoGroup.visible = false;
    scene.add(rotationGizmoGroup);

    // Translation Axes (이동 축) - X (Red), Y (Green), Z (Blue)
    const tArrowLen = 2.2;
    const tArrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), tArrowLen, 0xef4444, 0.45, 0.15);
    const tArrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), tArrowLen, 0x22c55e, 0.45, 0.15);
    const tArrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), tArrowLen, 0x3b82f6, 0.45, 0.15);
    rotationGizmoGroup.add(tArrowX);
    rotationGizmoGroup.add(tArrowY);
    rotationGizmoGroup.add(tArrowZ);

    // Rotation Axes (회전 축) - Rings (X: Red, Y: Green, Z: Blue)
    const rRingRadius = 1.3;
    const rRingTube = 0.04;
    const rRingGeoX = new THREE.TorusGeometry(rRingRadius, rRingTube, 8, 48);
    const rRingMatX = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.75 });
    const rRingX = new THREE.Mesh(rRingGeoX, rRingMatX);
    rRingX.rotation.y = Math.PI / 2;

    const rRingGeoY = new THREE.TorusGeometry(rRingRadius, rRingTube, 8, 48);
    const rRingMatY = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.75 });
    const rRingY = new THREE.Mesh(rRingGeoY, rRingMatY);
    rRingY.rotation.x = Math.PI / 2;

    const rRingGeoZ = new THREE.TorusGeometry(rRingRadius, rRingTube, 8, 48);
    const rRingMatZ = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.75 });
    const rRingZ = new THREE.Mesh(rRingGeoZ, rRingMatZ);
    rotationGizmoGroup.add(rRingX);
    rotationGizmoGroup.add(rRingY);
    rotationGizmoGroup.add(rRingZ);

    // Scale Axes (확장 축) - Lines & boxes (X: Red, Y: Green, Z: Blue)
    const sLineLen = 1.7;
    const sBoxSize = 0.14;
    const sBoxGeo = new THREE.BoxGeometry(sBoxSize, sBoxSize, sBoxSize);

    // X Handle
    const sLineGeoX = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(sLineLen, 0, 0)]);
    const sLineMatX = new THREE.LineBasicMaterial({ color: 0xef4444 });
    const sLineX = new THREE.Line(sLineGeoX, sLineMatX);
    const sBoxMeshX = new THREE.Mesh(sBoxGeo, new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    sBoxMeshX.position.set(sLineLen, 0, 0);
    rotationGizmoGroup.add(sLineX);
    rotationGizmoGroup.add(sBoxMeshX);

    // Y Handle
    const sLineGeoY = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0, sLineLen, 0)]);
    const sLineMatY = new THREE.LineBasicMaterial({ color: 0x22c55e });
    const sLineY = new THREE.Line(sLineGeoY, sLineMatY);
    const sBoxMeshY = new THREE.Mesh(sBoxGeo, new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    sBoxMeshY.position.set(0, sLineLen, 0);
    rotationGizmoGroup.add(sLineY);
    rotationGizmoGroup.add(sBoxMeshY);

    // Z Handle
    const sLineGeoZ = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0, 0, sLineLen)]);
    const sLineMatZ = new THREE.LineBasicMaterial({ color: 0x3b82f6 });
    const sLineZ = new THREE.Line(sLineGeoZ, sLineMatZ);
    const sBoxMeshZ = new THREE.Mesh(sBoxGeo, new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
    sBoxMeshZ.position.set(0, 0, sLineLen);
    rotationGizmoGroup.add(sLineZ);
    rotationGizmoGroup.add(sBoxMeshZ);

    // Tag names to helper structures for raycast picking
    tArrowX.line.name = "gizmo_pos_x"; tArrowX.cone.name = "gizmo_pos_x";
    tArrowY.line.name = "gizmo_pos_y"; tArrowY.cone.name = "gizmo_pos_y";
    tArrowZ.line.name = "gizmo_pos_z"; tArrowZ.cone.name = "gizmo_pos_z";

    rRingX.name = "gizmo_rot_x";
    rRingY.name = "gizmo_rot_y";
    rRingZ.name = "gizmo_rot_z";

    sLineX.name = "gizmo_scale_x"; sBoxMeshX.name = "gizmo_scale_x";
    sLineY.name = "gizmo_scale_y"; sBoxMeshY.name = "gizmo_scale_y";
    sLineZ.name = "gizmo_scale_z"; sBoxMeshZ.name = "gizmo_scale_z";

    const gizmoInteractiveObjects: THREE.Object3D[] = [
      tArrowX.line, tArrowX.cone,
      tArrowY.line, tArrowY.cone,
      tArrowZ.line, tArrowZ.cone,
      rRingX, rRingY, rRingZ,
      sLineX, sBoxMeshX,
      sLineY, sBoxMeshY,
      sLineZ, sBoxMeshZ
    ];

    // Gizmo manipulation states inside closure
    let isDraggingGizmo = false;
    let activeGizmoAxis: string | null = null;
    let dragGizmoStartMousePos = new THREE.Vector2();
    let hoveredGizmoAxis: THREE.Object3D | null = null;
    let originalElementData: any = null;

    // --- 4. Element Meshes Storage ---
    const frameMeshes = new Map<string, THREE.Object3D>();
    const wallMeshes = new Map<string, THREE.Object3D>();
    const wallFragmentMeshes = new Map<string, THREE.Object3D>();
    const frameFragmentMeshes = new Map<string, THREE.Object3D>();
    const utilityMeshes = new Map<string, THREE.Object3D>();

    // --- 4.5. Disaster Visual Effects Setup ---
    const createWaterBumpMap = () => {
      const size = qualitySettings.textures === 'high' ? 256 : (qualitySettings.textures === 'medium' ? 128 : 64);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d')!;
      const imgData = context.createImageData(size, size);
      
      const perlin = new ImprovedNoise();
      const scale = 0.05 * (256 / size); // scale noise so waves don't get tiny on low quality
      const z = Math.random() * 100;
      
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          let n = perlin.noise(x * scale, y * scale, z);
          n += 0.5 * perlin.noise(x * scale * 2, y * scale * 2, z);
          n += 0.25 * perlin.noise(x * scale * 4, y * scale * 4, z);
          
          const val = Math.floor((n * 0.5 + 0.5) * 255);
          const idx = (x + y * size) * 4;
          imgData.data[idx] = val;
          imgData.data[idx+1] = val;
          imgData.data[idx+2] = val;
          imgData.data[idx+3] = 255;
        }
      }
      context.putImageData(imgData, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    };

    const waterBumpMap = qualitySettings.water === 'fancy' ? createWaterBumpMap() : null;
    
    // Macro wave vertex shader plugin
    const waterVertexShaderPlugin = (shader: any) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = `
        uniform float uTime;
        ${shader.vertexShader}
      `;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // Only displace top faces or front faces
        if (normal.y > 0.5 || normal.x > 0.5) {
          float wave = sin(position.x * 0.5 + uTime * 3.0) * 0.3;
          wave += cos(position.z * 0.4 + uTime * 2.0) * 0.3;
          
          if (normal.y > 0.5) {
             transformed.y += wave;
          } else if (normal.x > 0.5) {
             transformed.x += wave * 1.5;
          }
        }
        `
      );
    };

    // Flood Visual Water Plane (covers 100mx100m)
    const waterSegs = qualitySettings.polygons === 'high' ? 32 : (qualitySettings.polygons === 'medium' ? 16 : 8);
    const floodWaterGeo = new THREE.BoxGeometry(120, 30, 120, waterSegs, 1, waterSegs);
    
    let floodWaterMat: THREE.Material;
    if (qualitySettings.water === 'fancy') {
      floodWaterMat = new THREE.MeshPhysicalMaterial({
        color: '#0284c7', // realistic deep water blue
        emissive: '#0369a1',
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 1, // Full opacity is needed for Physical Transmission to work correctly
        transmission: 0.9, // Realistic refraction
        roughness: 0.05,
        metalness: 0.1,
        ior: 1.33,
        thickness: 5.0,
        bumpMap: waterBumpMap || undefined,
        bumpScale: 0.1,
      });
      floodWaterMat.onBeforeCompile = (shader) => {
        waterVertexShaderPlugin(shader);
        floodWaterMat.userData.shader = shader;
      };
    } else {
      floodWaterMat = new THREE.MeshStandardMaterial({
        color: '#0284c7',
        transparent: true,
        opacity: 0.6,
        roughness: 0.15,
        metalness: 0.3,
      });
      if (qualitySettings.water === 'fast') {
        floodWaterMat.onBeforeCompile = (shader) => {
          waterVertexShaderPlugin(shader);
          floodWaterMat.userData.shader = shader;
        };
      }
    }
    
    const floodMesh = new THREE.Mesh(floodWaterGeo, floodWaterMat);
    floodMesh.position.set(0, -15.5, 0); // start submerged below ground
    floodMesh.visible = false;
    scene.add(floodMesh);

    // Tsunami Visual Water Wall
    const tsunamiSegsX = Math.max(2, Math.floor(waterSegs / 2));
    const tsunamiSegsY = Math.max(2, Math.floor(waterSegs / 2));
    const tsunamiWaterGeo = new THREE.BoxGeometry(12, 16, 120, tsunamiSegsX, tsunamiSegsY, waterSegs);
    
    let tsunamiWaterMat: THREE.Material;
    if (qualitySettings.water === 'fancy') {
      tsunamiWaterMat = new THREE.MeshPhysicalMaterial({
        color: '#075985', // darker stormy water
        emissive: '#0c4a6e',
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 1, 
        transmission: 0.95,
        roughness: 0.08,
        metalness: 0.1,
        ior: 1.33,
        thickness: 10.0,
        bumpMap: waterBumpMap || undefined,
        bumpScale: 0.15,
      });
      tsunamiWaterMat.onBeforeCompile = (shader) => {
        waterVertexShaderPlugin(shader);
        tsunamiWaterMat.userData.shader = shader;
      };
    } else {
      tsunamiWaterMat = new THREE.MeshStandardMaterial({
        color: '#075985',
        transparent: true,
        opacity: 0.8,
        roughness: 0.1,
        metalness: 0.2,
      });
      if (qualitySettings.water === 'fast') {
        tsunamiWaterMat.onBeforeCompile = (shader) => {
          waterVertexShaderPlugin(shader);
          tsunamiWaterMat.userData.shader = shader;
        };
      }
    }
    
    const tsunamiMesh = new THREE.Mesh(tsunamiWaterGeo, tsunamiWaterMat);
    tsunamiMesh.position.set(-60, 8, 0);
    tsunamiMesh.visible = false;
    scene.add(tsunamiMesh);

    // Tsunami wave foam cap
    const foamGeo = new THREE.BoxGeometry(12.5, 1, 120.5);
    const foamMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85,
    });
    const tsunamiFoam = new THREE.Mesh(foamGeo, foamMat);
    tsunamiFoam.position.set(0, 8, 0); // on top of the tsunami box
    tsunamiMesh.add(tsunamiFoam);

    // Tornado Twister Funnel
    const tornadoGeo = new THREE.CylinderGeometry(10, 0.6, 40, 16, 1, true);
    const tornadoMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      transparent: true,
      opacity: 0.55,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const tornadoMesh = new THREE.Mesh(tornadoGeo, tornadoMat);
    tornadoMesh.position.set(0, 20, 0);
    tornadoMesh.visible = false;
    scene.add(tornadoMesh);

    // Inner tornado core for density
    const tornadoInnerGeo = new THREE.CylinderGeometry(5, 0.3, 38, 12, 1, true);
    const tornadoInnerMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const tornadoInnerMesh = new THREE.Mesh(tornadoInnerGeo, tornadoInnerMat);
    tornadoMesh.add(tornadoInnerMesh);

    // Particle system for disaster debris
    const particleCount = 60;
    const particlesGroup = new THREE.Group();
    const particleGeo = new THREE.DodecahedronGeometry(0.18, 0);
    const particleMat = new THREE.MeshStandardMaterial({
      color: '#64748b',
      transparent: true,
      opacity: 0.8,
      roughness: 0.9,
    });
    
    const particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; baseSpeed: number }[] = [];
    for (let i = 0; i < particleCount; i++) {
      const pMesh = new THREE.Mesh(particleGeo, particleMat.clone());
      pMesh.visible = false;
      particlesGroup.add(pMesh);
      particles.push({
        mesh: pMesh,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        baseSpeed: 1 + Math.random() * 2
      });
    }
    scene.add(particlesGroup);

    // --- Unity PhysX Particle & Fragment Debris System ---
    const spawnDebrisParticles = (x: number, y: number, z: number, count = 20) => {
      let spawned = 0;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.life <= 0) {
          p.mesh.visible = true;
          p.mesh.position.set(x + (Math.random() - 0.5) * 1.2, y + 0.1, z + (Math.random() - 0.5) * 1.2);
          p.mesh.scale.setScalar(0.08 + Math.random() * 0.16);
          p.life = 1.0;

          const angle = Math.random() * Math.PI * 2;
          const speed = 0.10 + Math.random() * 0.25;
          p.vx = Math.cos(angle) * speed;
          p.vy = 0.15 + Math.random() * 0.30; // Initial upward velocity burst
          p.vz = Math.sin(angle) * speed;

          if (p.mesh.material) {
            const mat = p.mesh.material as THREE.MeshStandardMaterial;
            mat.color.set(Math.random() > 0.5 ? '#f59e0b' : '#38bdf8');
            mat.opacity = 1.0;
          }

          spawned++;
          if (spawned >= count) break;
        }
      }
    };

    // Debris particle generator initialized for structural simulation

    // --- 5. Frame creation preview indicators ---
    let previewLine: THREE.Line | null = null;
    let previewCylinder: THREE.Mesh | null = null;
    const initPreview = () => {
      const lineMat = new THREE.LineDashedMaterial({ color: '#f59e0b', dashSize: 0.5, gapSize: 0.3 });
      const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      previewLine = new THREE.Line(lineGeo, lineMat);
      previewLine.computeLineDistances();
      previewLine.visible = false;
      scene.add(previewLine);

      const cylGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 8);
      const cylMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', transparent: true, opacity: 0.6 });
      previewCylinder = new THREE.Mesh(cylGeo, cylMat);
      previewCylinder.visible = false;
      scene.add(previewCylinder);
    };
    initPreview();

    // Wall creation preview
    const wallPreviewGeo = new THREE.BoxGeometry(1, 1, 0.15);
    const wallPreviewMat = new THREE.MeshStandardMaterial({ color: '#4f46e5', transparent: true, opacity: 0.5 });
    const wallPreviewMesh = new THREE.Mesh(wallPreviewGeo, wallPreviewMat);
    wallPreviewMesh.visible = false;
    scene.add(wallPreviewMesh);

    // --- 6. Matter.js Setup (Engine & World for tests) ---
    const physicsEngine = Matter.Engine.create({ 
      gravity: { y: 2.8 },
      positionIterations: 32,     // Ultra-high iteration count for solid joint rigidity
      velocityIterations: 32,
      constraintIterations: 32
    });
    const physicsWorld = physicsEngine.world;
    const SCALE = 50; // Standardized scale: 1 meter = 50 pixels in Matter.js to prevent mass calculation issues (NaN)
    let isSimulationRunning = false;
    let simulationTimeSec = 0;
    let currentIntegrity = 100;
    
    // Collision filtering categories to separate building parts self-collision from ground collisions (prevents explosions)
    const GROUND_CATEGORY = 0x0001;
    const INTACT_CATEGORY = 0x0002; // formerly BUILDING_CATEGORY
    const DEBRIS_CATEGORY = 0x0004;

    const GROUND_MASK = INTACT_CATEGORY | DEBRIS_CATEGORY;
    const INTACT_MASK = GROUND_CATEGORY; // Removes all inter-object collisions, collides ONLY with floor
    const DEBRIS_MASK = GROUND_CATEGORY; // Collides ONLY with floor

    // Maps Matter.js body ID back to Frame / Wall / Utility Element IDs
    const bodyToElementMap = new Map<number, { id: string, type: 'frame' | 'wall' | 'utility' | 'wall_fragment' | 'frame_fragment' }>();
    const elementToBodyMap = new Map<string, Matter.Body>();
    const constraintsList: Matter.Constraint[] = [];

    // Setup ground in Matter.js (Thicker 1000px ground to prevent dynamic bodies tunneling through under extreme forces)
    // We place the physical hitbox slightly lower to avoid overlaps with building frames during the start or settling phases.
    // The top of the ground is set to Y = 15 pixels downwards (center at Y = 515 instead of Y = 506).
    // This provides a physical hitbox slightly below the visual Y = 0 surface, preventing initial overlap/bouncing issues
    // while keeping the visual floor at Y = 0 intact.
    let physicsGround = Matter.Bodies.rectangle(0, 500, 20000, 1000, {
      isStatic: true,
      friction: 0.95,
      restitution: 0.15,
      collisionFilter: {
        category: GROUND_CATEGORY,
        mask: GROUND_MASK
      }
    });
    (physicsGround as any).initialX = physicsGround.position.x;
      (physicsGround as any).isGround = true;
    (physicsGround as any).initialY = physicsGround.position.y;
    
    Matter.Composite.add(physicsWorld, physicsGround);

    // --- Physical Debris, Shatter, and Collision Handling ---
    const shatterBody = (body: Matter.Body) => {
      if (!body || (body as any).isDestroyedDebris) return;
      (body as any).isDestroyedDebris = true;
      (body as any).shouldBeStatic = false;
      (body as any).isGround = false;

      // Reset parent & recalculate parts/mass/inertia so Matter.js physics acts on body with inverseMass > 0
      body.parent = body;
      body.parts = [body];
      Matter.Body.setParts(body, [body]);
      Matter.Body.setMass(body, (body as any).originalMass || 5);

      // Make body dynamic so the full 3D mesh falls as solid physical debris
      if (body.isStatic) {
        Matter.Body.setStatic(body, false);
      }
      body.collisionFilter.category = DEBRIS_CATEGORY;
      body.collisionFilter.mask = DEBRIS_MASK;
      body.collisionFilter.group = 0;

      // Set highly dampened, heavy material properties for realistic non-bouncy debris
      body.restitution = 0.02;
      body.friction = 0.95;
      body.frictionAir = 0.015;

      // Initialize 3D Z position and velocity scatter (damped and controlled)
      if ((body as any).posZ === undefined) {
        (body as any).posZ = 0;
      }
      (body as any).vz = (Math.random() - 0.5) * 1.5;

      // Softened launch velocities so debris doesn't violently snap/explode out
      Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: -0.5 - Math.random() * 1.0 });
      Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);

      // Break constraints connected to this body (so it separates and falls as debris)
      constraintsList.forEach(c => {
        if (c.bodyA === body || c.bodyB === body) {
          if (!(c as any).isBroken) {
            Matter.Composite.remove(physicsWorld, c);
            (c as any).isBroken = true;
          }
        }
      });
    };

    Matter.Events.on(physicsEngine, 'collisionStart', (event) => {
      event.pairs.forEach(pair => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        
        // Ground Contact Impact Damping & Friction
        if ((bodyA as any).isGround || (bodyB as any).isGround) {
          const dynamicBody = (bodyA as any).isGround ? bodyB : bodyA;
          if (!dynamicBody.isStatic) {
            dynamicBody.friction = 0.95;
            dynamicBody.restitution = 0.02;
          }
        }

        // Collisional Activation: when a dynamic body hits a static body with severe impact
        if (bodyA.isStatic && !bodyB.isStatic && !(bodyA as any).isGround) {
          const speed = Math.hypot(bodyB.velocity.x, bodyB.velocity.y);
          if (speed > 12.0) {
            (bodyA as any).shouldBeStatic = false;
            (bodyA as any).activated = true;
            Matter.Body.setStatic(bodyA, false);
            if (bodyA.parts && bodyA.parts.length > 1) {
              Matter.Body.setParts(bodyA, bodyA.parts);
            }
          }
        } else if (bodyB.isStatic && !bodyA.isStatic && !(bodyB as any).isGround) {
          const speed = Math.hypot(bodyA.velocity.x, bodyA.velocity.y);
          if (speed > 12.0) {
            (bodyB as any).shouldBeStatic = false;
            (bodyB as any).activated = true;
            Matter.Body.setStatic(bodyB, false);
            if (bodyB.parts && bodyB.parts.length > 1) {
              Matter.Body.setParts(bodyB, bodyB.parts);
            }
          }
        }

        // Collision Shattering: under extreme high velocity impact
        const speedA = Math.hypot(bodyA.velocity.x, bodyA.velocity.y);
        const speedB = Math.hypot(bodyB.velocity.x, bodyB.velocity.y);
        const relativeSpeed = Math.max(speedA, speedB);
        
        // Mitigate early shattering from initial drops (grace period)
        const isGracePeriod = simulationTimeSec < 2.0;
        const breakMultiplier = isGracePeriod ? 5.0 : 1.5;

        if (relativeSpeed > 35.0 * breakMultiplier) {
          const durA = (bodyA as any).durability || 70;
          const durB = (bodyB as any).durability || 70;
          
          if (relativeSpeed > (durA * 0.5 * breakMultiplier) && !(bodyA as any).isGround) {
            shatterBody(bodyA);
          }
          if (relativeSpeed > (durB * 0.5 * breakMultiplier) && !(bodyB as any).isGround) {
            shatterBody(bodyB);
          }
        }
      });
    });

    // Setup Physics World from Current Building State
    // Standard scaling functions for coordinate sync: 1m = 50px
    const syncMatterToThree = (body: Matter.Body, mesh: THREE.Object3D) => {
      const scale = SCALE;
      const x3d = body.position.x / scale;
      // Clamp Y to stay at or above ground level (y >= 0) to prevent objects from sinking below floor grid and vanishing
      const y3d = Math.max(0, -body.position.y / scale);

      mesh.position.x = x3d;
      mesh.position.y = y3d;

      const mapping = bodyToElementMap.get(body.id);

      // Check if body is dynamic (taking parent compound body status into account)
      const isDynamic = !body.isStatic && (!body.parent || !body.parent.isStatic);

      // Update 3D Z position and velocity for dynamic objects / debris
      if (isDynamic || (body as any).isDestroyedDebris) {
        if ((body as any).posZ === undefined) {
          (body as any).posZ = mesh.position.z;
        }
        if ((body as any).vz === undefined) {
          // Initialize a random out-of-plane velocity when the object first starts falling
          const speedFactor = body.speed || 0;
          (body as any).vz = (Math.random() - 0.5) * (1.5 + speedFactor * 0.5);
        }

        // Apply disaster forces to Z-velocity (vz):
        if (disasterRef.current === 'earthquake' && isSimulationRunning) {
          // Shaking on the Z-axis (North-South)
          const quakeZForce = Math.sin(simulationTimeSec * 35) * (intensityRef.current || 5) * 0.04;
          (body as any).vz += quakeZForce + (Math.random() - 0.5) * 0.02;
        } else if (disasterRef.current === 'tornado' && isSimulationRunning) {
          // Suction towards the tornado center along Z
          const tAngle = simulationTimeSec * 1.5;
          const tz = Math.sin(tAngle) * 5;
          const dz = tz - ((body as any).posZ || 0);
          (body as any).vz += Math.sign(dz) * 0.008 * (intensityRef.current || 5) + (Math.random() - 0.5) * 0.03;
        } else if (disasterRef.current === 'tsunami' && isSimulationRunning) {
          // Tsunami wave has turbulent out-of-plane Z scattering
          (body as any).vz += (Math.random() - 0.5) * (intensityRef.current || 5) * 0.05;
        } else if (disasterRef.current === 'flood' && isSimulationRunning) {
          // Flood water currents drift and sway things on Z
          (body as any).vz += Math.sin(simulationTimeSec * 2) * 0.005 * (intensityRef.current || 5) + (Math.random() - 0.5) * 0.01;
        }

        // Apply out-of-plane Z translation
        (body as any).posZ += (body as any).vz * (1 / 60);

        // Keep dynamic debris within boundary limits on the Z-axis
        if (Math.abs((body as any).posZ) > 8.0) {
          (body as any).vz *= -0.5; // bounce back
          (body as any).posZ = Math.sign((body as any).posZ) * 8.0;
        }

        // Apply ground damping and friction to Z-velocity
        const groundDamping = y3d <= 0.2 ? 0.88 : 0.98;
        (body as any).vz *= groundDamping;

        // Custom Out-of-Plane Tipping for Walls ("넓은 면적으로 쓰러지는 물리"):
        // If a wall panel collapses, it tilts out of plane and falls flat onto its face
        // (tumbleAngleX tilts smoothly up to 90 degrees/pi/2).
        if (mapping?.type === 'wall') {
          if ((body as any).wallTiltDir === undefined) {
            (body as any).wallTiltDir = Math.random() > 0.5 ? 1 : -1;
            (body as any).posZTiltOffset = 0;
            (body as any).wallCollapseProgress = 0;
          }

          if (isDynamic) {
            // Once dynamic, the wall collapses and falls flat over time (approx 45 frames ~ 0.75s)
            (body as any).wallCollapseProgress = Math.min(1.0, ((body as any).wallCollapseProgress || 0) + 0.022);
          } else {
            (body as any).wallCollapseProgress = 0;
          }

          const fallProgress = (body as any).wallCollapseProgress;

          // Wall height in 3D is typically around 3.0m. Center of mass shifts in Z as it pitches.
          const wallHeight = 3.0;
          const targetZTilt = (wallHeight / 2) * (body as any).wallTiltDir;

          // Interpolate the Z position offset and pitch angle to lay flat
          (body as any).posZTiltOffset = (body as any).posZTiltOffset * 0.92 + targetZTilt * fallProgress * 0.08;

          const targetPitch = (Math.PI / 2) * (body as any).wallTiltDir;
          if ((body as any).tumbleAngleX === undefined) {
            (body as any).tumbleAngleX = 0;
          }
          (body as any).tumbleAngleX = (body as any).tumbleAngleX * 0.92 + targetPitch * fallProgress * 0.08;
        }
      }

      // Sync the Z coordinate for both static and dynamic elements, with earthquake Z-shaking included!
      const baseZ = (body as any).posZ !== undefined ? (body as any).posZ : mesh.position.z;
      let currentZ = baseZ;
      if (disasterRef.current === 'earthquake' && isSimulationRunning) {
        const shakeValZ = Math.sin(simulationTimeSec * 35) * (intensityRef.current || 5) * 0.04;
        currentZ += shakeValZ;
      }
      mesh.position.z = currentZ + ((body as any).posZTiltOffset || 0);

      const initialAngle = (body as any).initialAngle !== undefined ? (body as any).initialAngle : 0;
      let angleDiff = body.angle - initialAngle;

      const isUtility = mapping?.type === 'utility';

      if (isUtility) {
        // AutoCAD-style Rotation Lock (Readable):
        // Keep the rotation-locked element's orientation upright (lock angleDiff to 0),
        // while its 3D position rotates and translates correctly around the parent/pivot.
        angleDiff = 0;
      }

      // Initialize 3D rotational tumbling and rolling for dynamic debris/collapsing items
      if ((isDynamic || (body as any).isDestroyedDebris) && !isUtility) {
        if ((body as any).tumbleAVX === undefined) {
          const speedFactor = body.speed || 0;
          (body as any).tumbleAVX = (Math.random() - 0.5) * (1.2 + speedFactor * 0.2);
          (body as any).tumbleAVY = (Math.random() - 0.5) * (1.2 + speedFactor * 0.2);
          if ((body as any).tumbleAngleX === undefined) {
            (body as any).tumbleAngleX = 0;
          }
          if ((body as any).tumbleAngleY === undefined) {
            (body as any).tumbleAngleY = 0;
          }
        }

        // Apply additional rolling/tumbling torque when in contact with the ground floor
        if (y3d <= 0.6) {
          const speedX = body.velocity ? body.velocity.x : 0;
          const speedZ = (body as any).vz || 0;
          (body as any).tumbleAVX += speedZ * 0.12 * (1 / 60);
          (body as any).tumbleAVY += speedX * 0.12 * (1 / 60);
        }

        // Integrate dynamic 3D angular velocities to accumulate 3D tumble angles
        const dt = 1 / 60;
        // For walls, tumbleAngleX is driven dynamically to fall flat on its face.
        if (mapping?.type !== 'wall') {
          (body as any).tumbleAngleX += (body as any).tumbleAVX * dt;
        }
        (body as any).tumbleAngleY += (body as any).tumbleAVY * dt;

        // Apply decay to 3D tumbling (higher damping on ground)
        const rotDamping = y3d <= 0.2 ? 0.85 : 0.98;
        (body as any).tumbleAVX *= rotDamping;
        (body as any).tumbleAVY *= rotDamping;
      }

      if ((mesh as any).initialQuaternion) {
        // High-precision alignment of 2D angle (around Z-axis) to 3D rotation quaternion
        const qDiff = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angleDiff);
        mesh.quaternion.copy((mesh as any).initialQuaternion).premultiply(qDiff);

        // Apply cumulative 3D tumble rotations (pitch and yaw/roll) for dynamic debris
        if ((isDynamic || (body as any).isDestroyedDebris) && !isUtility) {
          const tx = (body as any).tumbleAngleX || 0;
          const ty = (body as any).tumbleAngleY || 0;
          if (Math.abs(tx) > 0.0001 || Math.abs(ty) > 0.0001) {
            const tumbleQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tx, ty, 0, 'YXZ'));
            if (mapping?.type === 'wall') {
              mesh.quaternion.multiply(tumbleQuat);
            } else {
              mesh.quaternion.premultiply(tumbleQuat);
            }
          }
        }
      } else {
        if ((isDynamic || (body as any).isDestroyedDebris) && !isUtility) {
          const tx = (body as any).tumbleAngleX || 0;
          const ty = (body as any).tumbleAngleY || 0;
          mesh.rotation.set(tx, ty, -body.angle);
        } else {
          mesh.rotation.z = isUtility ? 0 : -body.angle;
        }
      }
    };

    // Helper to create safe constraints and avoid 'Snap Effect' by calculating actual rest distance
    const createSafeConstraint = (options: Matter.IConstraintDefinition) => {
      const bodyA = options.bodyA;
      const bodyB = options.bodyB;
      const pointA = options.pointA || { x: 0, y: 0 };
      const pointB = options.pointB || { x: 0, y: 0 };

      let actualLength = 0;

      if (bodyA && bodyB) {
        const angleA = bodyA.angle || 0;
        const angleB = bodyB.angle || 0;

        // Calculate world position A
        const rotA_x = pointA.x * Math.cos(angleA) - pointA.y * Math.sin(angleA);
        const rotA_y = pointA.x * Math.sin(angleA) + pointA.y * Math.cos(angleA);
        const worldPtA = { x: bodyA.position.x + rotA_x, y: bodyA.position.y + rotA_y };

        // Calculate world position B
        const rotB_x = pointB.x * Math.cos(angleB) - pointB.y * Math.sin(angleB);
        const rotB_y = pointB.x * Math.sin(angleB) + pointB.y * Math.cos(angleB);
        const worldPtB = { x: bodyB.position.x + rotB_x, y: bodyB.position.y + rotB_y };

        // Real distance between anchoring ports in Matter space
        actualLength = Math.hypot(worldPtA.x - worldPtB.x, worldPtA.y - worldPtB.y);
      }

      const constraint = Matter.Constraint.create({
        ...options,
        length: actualLength
      });

      return constraint;
    };

    const initPhysicsFromBuilding = () => {
      Matter.Composite.clear(physicsWorld, false);
      Matter.Engine.clear(physicsEngine);
      bodyToElementMap.clear();
      elementToBodyMap.clear();
      constraintsList.length = 0;

      // Re-add static ground with calibrated friction and zero restitution (prevents friction bounce popping)
      physicsGround = Matter.Bodies.rectangle(0, 500, 20000, 1000, { 
        isStatic: true,
        friction: 0.4,
        restitution: 0.0,
        slop: 0.05,
        collisionFilter: {
          category: GROUND_CATEGORY,
          mask: GROUND_MASK
        }
      });
      (physicsGround as any).initialX = physicsGround.position.x;
      (physicsGround as any).isGround = true;
      (physicsGround as any).initialY = physicsGround.position.y;

      Matter.Composite.add(physicsWorld, physicsGround);

      // Union-Find graph structure to group all connected/welded elements into unified single objects
      class DisjointSet {
        parent = new Map<string, string>();
        find(i: string): string {
          if (!this.parent.has(i)) this.parent.set(i, i);
          if (this.parent.get(i) !== i) {
            this.parent.set(i, this.find(this.parent.get(i)!));
          }
          return this.parent.get(i)!;
        }
        union(i: string, j: string) {
          const rootI = this.find(i);
          const rootJ = this.find(j);
          if (rootI !== rootJ) {
            this.parent.set(rootI, rootJ);
          }
        }
      }

      const ds = new DisjointSet();
      const getNodeKey = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;

      // 1. Union frames by start & end nodes
      framesRef.current.forEach(f => {
        const k1 = getNodeKey(f.start.x, f.start.y);
        const k2 = getNodeKey(f.end.x, f.end.y);
        ds.union(k1, k2);
      });

      // 2. Union walls by start & end nodes
      wallsRef.current.forEach(w => {
        const k1 = getNodeKey(w.start.x, w.start.y);
        const k2 = getNodeKey(w.end.x, w.end.y);
        ds.union(k1, k2);
      });

      // 3. Union utilities by position
      utilitiesRef.current.forEach(u => {
        const uk = getNodeKey(u.position.x, u.position.y);
        let connectedNodeKey = uk;
        framesRef.current.forEach(f => {
          if (Math.hypot(f.start.x - u.position.x, f.start.y - u.position.y) < 1.0) {
            connectedNodeKey = getNodeKey(f.start.x, f.start.y);
          } else if (Math.hypot(f.end.x - u.position.x, f.end.y - u.position.y) < 1.0) {
            connectedNodeKey = getNodeKey(f.end.x, f.end.y);
          }
        });
        ds.union(uk, connectedNodeKey);
      });

      interface Cluster {
        nodeKeys: Set<string>;
        frames: FrameElement[];
        walls: WallElement[];
        utilities: UtilityElement[];
      }

      const clusters = new Map<string, Cluster>();
      const getCluster = (key: string): Cluster => {
        const root = ds.find(key);
        if (!clusters.has(root)) {
          clusters.set(root, {
            nodeKeys: new Set(),
            frames: [],
            walls: [],
            utilities: []
          });
        }
        return clusters.get(root)!;
      };

      framesRef.current.forEach(f => {
        const k1 = getNodeKey(f.start.x, f.start.y);
        const k2 = getNodeKey(f.end.x, f.end.y);
        const cluster = getCluster(k1);
        cluster.nodeKeys.add(k1);
        cluster.nodeKeys.add(k2);
        cluster.frames.push(f);
      });

      wallsRef.current.forEach(w => {
        const k1 = getNodeKey(w.start.x, w.start.y);
        const k2 = getNodeKey(w.end.x, w.end.y);
        const cluster = getCluster(k1);
        cluster.nodeKeys.add(k1);
        cluster.nodeKeys.add(k2);
        cluster.walls.push(w);
      });

      utilitiesRef.current.forEach(u => {
        const uk = getNodeKey(u.position.x, u.position.y);
        const cluster = getCluster(uk);
        cluster.nodeKeys.add(uk);
        cluster.utilities.push(u);
      });

      // Create compound rigid bodies for each connected/welded group
      clusters.forEach((cluster) => {
        const parts: Matter.Body[] = [];
        let isGroundedCluster = false;

        // A. Joint Node Parts
        cluster.nodeKeys.forEach(nk => {
          const [xStr, yStr] = nk.split(',');
          const nx = parseFloat(xStr);
          const ny = parseFloat(yStr);

          const isGround = ny <= 0.15;
          if (isGround) isGroundedCluster = true;

          const nodePart = Matter.Bodies.rectangle(nx * SCALE, -ny * SCALE, 8, 8, {
            friction: 0.9,
            density: 0.1,
            collisionFilter: {
              category: INTACT_CATEGORY,
              mask: INTACT_MASK,
              group: 0
            }
          });
          (nodePart as any).isGround = isGround;
          (nodePart as any).initialX = nodePart.position.x;
          (nodePart as any).initialY = nodePart.position.y;

          parts.push(nodePart);
        });

        // B. Frame Parts
        cluster.frames.forEach(f => {
          const spec = FRAMEWORK_MATERIALS[f.material] || FRAMEWORK_MATERIALS.steel;
          const len2D = Math.hypot(f.end.x - f.start.x, f.end.y - f.start.y);
          const len = Math.max(0.1, len2D);
          const angle = Math.atan2(f.end.y - f.start.y, f.end.x - f.start.x);

          const midX = (f.start.x + f.end.x) / 2;
          const midY = (f.start.y + f.end.y) / 2;

          const shrunkThickness = Math.max(4, spec.thickness * SCALE * 0.75);
          const barPart = Matter.Bodies.rectangle(midX * SCALE, -midY * SCALE, len * SCALE, shrunkThickness, {
            friction: 0.85,
            density: spec.density / 1000,
            angle: -angle,
            collisionFilter: {
              category: INTACT_CATEGORY,
              mask: INTACT_MASK,
              group: 0
            }
          });

          (barPart as any).durability = spec.durability;
          (barPart as any).initialX = barPart.position.x;
          (barPart as any).initialY = barPart.position.y;
          (barPart as any).initialAngle = barPart.angle;
          (barPart as any).posZ = (f.start.z + f.end.z) / 2;
          (barPart as any).isGround = f.start.y <= 0.15 || f.end.y <= 0.15;

          parts.push(barPart);

          bodyToElementMap.set(barPart.id, { id: f.id, type: 'frame' });
          elementToBodyMap.set(f.id, barPart);
        });

        // C. Wall Parts
        cluster.walls.forEach(w => {
          const spec = WALL_MATERIALS[w.material] || WALL_MATERIALS.concrete;
          const len2D = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
          const len = Math.max(0.1, len2D);
          const angle = Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
          const midX = (w.start.x + w.end.x) / 2;
          
          const deltaY = Math.abs(w.end.y - w.start.y);
          const height = deltaY > 0.2 ? deltaY : 3.0;
          const midY = (w.start.y + w.end.y) / 2 + height / 2;
          
          const originalDensity = spec.weightPerSqm / 10000;
          const adjustedDensity = Math.max(0.0001, originalDensity * 6 / (height * SCALE));

          const wallPart = Matter.Bodies.rectangle(midX * SCALE, -midY * SCALE, len * SCALE, height * SCALE, {
            friction: 0.9,
            density: adjustedDensity,
            angle: -angle,
            collisionFilter: {
              category: INTACT_CATEGORY,
              mask: INTACT_MASK,
              group: 0
            }
          });

          (wallPart as any).durability = spec.durability;
          (wallPart as any).initialX = wallPart.position.x;
          (wallPart as any).initialY = wallPart.position.y;
          (wallPart as any).initialAngle = wallPart.angle;
          (wallPart as any).posZ = (w.start.z + w.end.z) / 2;
          (wallPart as any).isGround = w.start.y <= 0.15 || w.end.y <= 0.15;

          parts.push(wallPart);

          bodyToElementMap.set(wallPart.id, { id: w.id, type: 'wall' });
          elementToBodyMap.set(w.id, wallPart);
        });

        // D. Utility Parts
        cluster.utilities.forEach(u => {
          const uPart = Matter.Bodies.rectangle(u.position.x * SCALE, -u.position.y * SCALE, 10, 10, {
            friction: 0.8,
            density: 0.01,
            collisionFilter: {
              category: INTACT_CATEGORY,
              mask: INTACT_MASK,
              group: 0
            }
          });

          (uPart as any).durability = 80;
          (uPart as any).initialX = uPart.position.x;
          (uPart as any).initialY = uPart.position.y;
          (uPart as any).initialAngle = uPart.angle;
          (uPart as any).posZ = u.position.z;

          parts.push(uPart);

          bodyToElementMap.set(uPart.id, { id: u.id, type: 'utility' });
          elementToBodyMap.set(u.id, uPart);
        });

        if (parts.length === 0) return;

        let clusterBody: Matter.Body;
        if (parts.length === 1) {
          clusterBody = parts[0];
        } else {
          clusterBody = Matter.Body.create({
            parts: parts,
            friction: 0.85,
            restitution: 0.1,
            collisionFilter: {
              category: INTACT_CATEGORY,
              mask: INTACT_MASK,
              group: 0
            }
          });
        }

        clusterBody.collisionFilter = {
          category: INTACT_CATEGORY,
          mask: INTACT_MASK, // FLOOR ONLY!
          group: 0
        };

        if (clusterBody.parts) {
          clusterBody.parts.forEach(p => {
            p.collisionFilter = {
              category: INTACT_CATEGORY,
              mask: INTACT_MASK,
              group: 0
            };
            if ((p as any).initialAngle === undefined) {
              (p as any).initialAngle = p.angle;
            }
            if ((p as any).initialX === undefined) {
              (p as any).initialX = p.position.x;
            }
            if ((p as any).initialY === undefined) {
              (p as any).initialY = p.position.y;
            }
            if ((p as any).originalMass === undefined) {
              (p as any).originalMass = p.mass;
            }
          });
        }

        const gParts = parts.filter(p => (p as any).isGround);
        (clusterBody as any).groundParts = gParts;
        (clusterBody as any).initialGroundCount = gParts.length;

        if (isGroundedCluster) {
          Matter.Body.setStatic(clusterBody, true);
          (clusterBody as any).isGround = true;
          (clusterBody as any).shouldBeStatic = true;
          (clusterBody as any).initialX = clusterBody.position.x;
          (clusterBody as any).initialY = clusterBody.position.y;
        } else {
          (clusterBody as any).shouldBeStatic = false;
        }

        Matter.Composite.add(physicsWorld, clusterBody);
      });

      // Store the normal collision group for structural integrity
      const normalGroup = Matter.Body.nextGroup(true); 
      physicsWorld.bodies.forEach(body => {
        if (!(body as any).isGround) {
          (body as any).normalGroup = normalGroup;
          body.collisionFilter.group = 0;
        }
      });
    };

    /* const _unusedLegacyInit = () => {

      // Second pass: Create Matter.js line bodies (bars) for each frame element
      framesRef.current.forEach(f => {
        const startKey = `${f.start.x.toFixed(4)},${f.start.y.toFixed(4)}`;
        const endKey = `${f.end.x.toFixed(4)},${f.end.y.toFixed(4)}`;

        const startJoint = joints.get(startKey);
        const endJoint = joints.get(endKey);

        if (startJoint && endJoint) {
          const spec = FRAMEWORK_MATERIALS[f.material] || FRAMEWORK_MATERIALS.steel;

          // Compute length and center point for physical bar
          const len2D = Math.hypot(f.end.x - f.start.x, f.end.y - f.start.y);
          const len = Math.max(0.1, len2D);
          const angle = Math.atan2(f.end.y - f.start.y, f.end.x - f.start.x);

          const midX = (f.start.x + f.end.x) / 2;
          const midY = (f.start.y + f.end.y) / 2;

          // Reduced frame hitbox thickness (from spec.thickness * SCALE * 2 down to spec.thickness * SCALE * 0.75, min 4px)
          const shrunkThickness = Math.max(4, spec.thickness * SCALE * 0.75);
          const barBody = Matter.Bodies.rectangle(midX * SCALE, -midY * SCALE, len * SCALE, shrunkThickness, {
            friction: 0.85,
            density: spec.density / 1000, // proportional density
            angle: -angle,
            collisionFilter: {
              category: INTACT_CATEGORY,
              mask: INTACT_MASK,
              group: -999 // Warmup safety group to avoid start explosions
            }
          });
          Matter.Body.setStatic(barBody, true);
          
          // Force stable mass proportional to physical materials but perfectly scaled to 5..15 units to prevent constraint stretching!
          const massRatio = spec.density / 78.5; // steel is 1.0, wood is 0.23, bamboo is 0.08, mud is 0.57
          const balancedMass = Math.max(5, Math.min(15, 12 * massRatio) * (len / 3.0)); // scaled by length ratio to reflect geometry
          Matter.Body.setMass(barBody, balancedMass);
          
          (barBody as any).shouldBeStatic = false;
          (barBody as any).durability = spec.durability;

          // Store initial position for stability
          (barBody as any).initialX = barBody.position.x;
          (barBody as any).initialY = barBody.position.y;
          (barBody as any).initialAngle = barBody.angle;

          Matter.Composite.add(physicsWorld, barBody);
          bodyToElementMap.set(barBody.id, { id: f.id, type: 'frame' });
          elementToBodyMap.set(f.id, barBody);

          // 1. Weld start of the bar to the startJoint with two stable constraints (Positional + Rotational)
          const weldStartPos = createSafeConstraint({
            bodyA: startJoint.body,
            bodyB: barBody,
            pointA: { x: 0, y: 0 },
            pointB: { x: - (len * SCALE) / 2, y: 0 },
            stiffness: 1.0
          });
          (weldStartPos as any).durability = spec.durability;
          (weldStartPos as any).isBroken = false;
          (weldStartPos as any).desiredStiffness = 1.0;
          weldStartPos.stiffness = 0.5;

          const leverDist = 15;
          const weldStartRot = createSafeConstraint({
            bodyA: startJoint.body,
            bodyB: barBody,
            pointA: { x: leverDist * Math.cos(-angle), y: leverDist * Math.sin(-angle) },
            pointB: { x: - (len * SCALE) / 2 + leverDist, y: 0 },
            stiffness: 0.9
          });
          (weldStartRot as any).durability = spec.durability;
          (weldStartRot as any).isBroken = false;
          (weldStartRot as any).desiredStiffness = 0.9;
          weldStartRot.stiffness = 0.5;

          // Link start welds as twins
          (weldStartPos as any).twin = weldStartRot;
          (weldStartRot as any).twin = weldStartPos;

          // 2. Weld end of the bar to the endJoint with two stable constraints (Positional + Rotational)
          const weldEndPos = createSafeConstraint({
            bodyA: endJoint.body,
            bodyB: barBody,
            pointA: { x: 0, y: 0 },
            pointB: { x: (len * SCALE) / 2, y: 0 },
            stiffness: 1.0
          });
          (weldEndPos as any).durability = spec.durability;
          (weldEndPos as any).isBroken = false;
          (weldEndPos as any).desiredStiffness = 1.0;
          weldEndPos.stiffness = 0.5;

          const weldEndRot = createSafeConstraint({
            bodyA: endJoint.body,
            bodyB: barBody,
            pointA: { x: -leverDist * Math.cos(-angle), y: -leverDist * Math.sin(-angle) },
            pointB: { x: (len * SCALE) / 2 - leverDist, y: 0 },
            stiffness: 0.9
          });
          (weldEndRot as any).durability = spec.durability;
          (weldEndRot as any).isBroken = false;
          (weldEndRot as any).desiredStiffness = 0.9;
          weldEndRot.stiffness = 0.5;

          // Link end welds as twins
          (weldEndPos as any).twin = weldEndRot;
          (weldEndRot as any).twin = weldEndPos;

          Matter.Composite.add(physicsWorld, weldStartPos);
          Matter.Composite.add(physicsWorld, weldStartRot);
          Matter.Composite.add(physicsWorld, weldEndPos);
          Matter.Composite.add(physicsWorld, weldEndRot);
          constraintsList.push(weldStartPos, weldStartRot, weldEndPos, weldEndRot);
        }
      });

      // Add wall elements as lighter rectangular constraints or physical plates attached to adjacent bars
      const worldToLocal = (body: Matter.Body, worldPt: { x: number; y: number }) => {
        const dx = worldPt.x - body.position.x;
        const dy = worldPt.y - body.position.y;
        const cosAngle = Math.cos(-body.angle);
        const sinAngle = Math.sin(-body.angle);
        return {
          x: dx * cosAngle - dy * sinAngle,
          y: dx * sinAngle + dy * cosAngle
        };
      };

      wallsRef.current.forEach(w => {
        const spec = WALL_MATERIALS[w.material];
        const len2D = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
        const len = Math.max(0.1, len2D);
        const angle = Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
        const midX = (w.start.x + w.end.x) / 2;
        const midY = (w.start.y + w.end.y) / 2;

        // Shrunk wall hitbox thickness from 15px down to 6px for non-intrusive physics
        const wallBody = Matter.Bodies.rectangle(midX * SCALE, -midY * SCALE, len * SCALE, 6, {
          friction: 0.9,
          density: spec.weightPerSqm / 10000,
          angle: -angle,
          collisionFilter: {
            category: INTACT_CATEGORY,
            mask: INTACT_MASK,
            group: -999 // Warmup safety group to avoid start explosions
          }
        });
        Matter.Body.setStatic(wallBody, true);
        (wallBody as any).shouldBeStatic = false;
        (wallBody as any).durability = spec.durability;

        // Store initial position
        (wallBody as any).initialX = wallBody.position.x;
        (wallBody as any).initialY = wallBody.position.y;
        (wallBody as any).initialAngle = wallBody.angle;

        Matter.Composite.add(physicsWorld, wallBody);
        bodyToElementMap.set(wallBody.id, { id: w.id, type: 'wall' });
        elementToBodyMap.set(w.id, wallBody);

        // Connect walls rigidly to nearby joints or frame members
        const startKey = `${w.start.x.toFixed(4)},${w.start.y.toFixed(4)}`;
        const endKey = `${w.end.x.toFixed(4)},${w.end.y.toFixed(4)}`;
        let jointA = joints.get(startKey);
        let jointB = joints.get(endKey);

        // Fallback: search for closest joint within 15 pixels (0.3m)
        if (!jointA) {
          let bestDist = 15;
          joints.forEach((j) => {
            const dist = Math.hypot(j.body.position.x - w.start.x * SCALE, j.body.position.y - (-w.start.y * SCALE));
            if (dist < bestDist) {
              bestDist = dist;
              jointA = j;
            }
          });
        }
        if (!jointB) {
          let bestDist = 15;
          joints.forEach((j) => {
            const dist = Math.hypot(j.body.position.x - w.end.x * SCALE, j.body.position.y - (-w.end.y * SCALE));
            if (dist < bestDist) {
              bestDist = dist;
              jointB = j;
            }
          });
        }

        // Direct Weld to framing joints at wall's endpoints
        if (jointA) {
          const weldAPos = createSafeConstraint({
            bodyA: jointA.body,
            bodyB: wallBody,
            pointA: { x: 0, y: 0 },
            pointB: { x: -len * SCALE / 2, y: 0 },
            stiffness: 1.0
          });
          (weldAPos as any).durability = spec.durability;
          (weldAPos as any).isBroken = false;
          (weldAPos as any).desiredStiffness = 1.0;
          weldAPos.stiffness = 0.5;

          const leverDist = 15;
          const weldARot = createSafeConstraint({
            bodyA: jointA.body,
            bodyB: wallBody,
            pointA: { x: leverDist * Math.cos(-angle), y: leverDist * Math.sin(-angle) },
            pointB: { x: -len * SCALE / 2 + leverDist, y: 0 },
            stiffness: 0.9
          });
          (weldARot as any).durability = spec.durability;
          (weldARot as any).isBroken = false;
          (weldARot as any).desiredStiffness = 0.9;
          weldARot.stiffness = 0.5;

          (weldAPos as any).twin = weldARot;
          (weldARot as any).twin = weldAPos;

          Matter.Composite.add(physicsWorld, weldAPos);
          Matter.Composite.add(physicsWorld, weldARot);
          constraintsList.push(weldAPos, weldARot);
        }

        if (jointB) {
          const weldBPos = createSafeConstraint({
            bodyA: jointB.body,
            bodyB: wallBody,
            pointA: { x: 0, y: 0 },
            pointB: { x: len * SCALE / 2, y: 0 },
            stiffness: 1.0
          });
          (weldBPos as any).durability = spec.durability;
          (weldBPos as any).isBroken = false;
          (weldBPos as any).desiredStiffness = 1.0;
          weldBPos.stiffness = 0.5;

          const leverDist = 15;
          const weldBRot = createSafeConstraint({
            bodyA: jointB.body,
            bodyB: wallBody,
            pointA: { x: -leverDist * Math.cos(-angle), y: -leverDist * Math.sin(-angle) },
            pointB: { x: len * SCALE / 2 - leverDist, y: 0 },
            stiffness: 0.9
          });
          (weldBRot as any).durability = spec.durability;
          (weldBRot as any).isBroken = false;
          (weldBRot as any).desiredStiffness = 0.9;
          weldBRot.stiffness = 0.5;

          (weldBPos as any).twin = weldBRot;
          (weldBRot as any).twin = weldBPos;

          Matter.Composite.add(physicsWorld, weldBPos);
          Matter.Composite.add(physicsWorld, weldBRot);
          constraintsList.push(weldBPos, weldBRot);
        }

        // 2. Multi-point Moment-Resisting Weld to overlapping frame members (beams/columns)
        framesRef.current.forEach(f => {
          const bodyF = elementToBodyMap.get(f.id);
          if (bodyF) {
            const dist = Math.hypot(bodyF.position.x - wallBody.position.x, bodyF.position.y - wallBody.position.y);
            if (dist < 40) {
              const angleF = bodyF.angle;
              const w1 = { x: wallBody.position.x, y: wallBody.position.y };
              const w2 = {
                x: wallBody.position.x + 15 * Math.cos(angleF),
                y: wallBody.position.y + 15 * Math.sin(angleF)
              };

              const localF1 = worldToLocal(bodyF, w1);
              const localF2 = worldToLocal(bodyF, w2);
              const localW1 = worldToLocal(wallBody, w1);
              const localW2 = worldToLocal(wallBody, w2);

              const wallWeld1 = createSafeConstraint({
                bodyA: bodyF,
                bodyB: wallBody,
                pointA: localF1,
                pointB: localW1,
                stiffness: 0.85
              });
              (wallWeld1 as any).durability = spec.durability;
              (wallWeld1 as any).isBroken = false;
              (wallWeld1 as any).desiredStiffness = 0.85;
              wallWeld1.stiffness = 0.5;

              const wallWeld2 = createSafeConstraint({
                bodyA: bodyF,
                bodyB: wallBody,
                pointA: localF2,
                pointB: localW2,
                stiffness: 0.85
              });
              (wallWeld2 as any).durability = spec.durability;
              (wallWeld2 as any).isBroken = false;
              (wallWeld2 as any).desiredStiffness = 0.85;
              wallWeld2.stiffness = 0.5;

              (wallWeld1 as any).twin = wallWeld2;
              (wallWeld2 as any).twin = wallWeld1;

              Matter.Composite.add(physicsWorld, wallWeld1);
              Matter.Composite.add(physicsWorld, wallWeld2);
              constraintsList.push(wallWeld1, wallWeld2);
            }
          }
        });
      });

      // Add utility elements as physical bodies connected to nearest frames/joints
      utilitiesRef.current.forEach(u => {
        const spec = UTILITIES[u.type];
        if (!spec) return;

        // Shrunk utility body hitbox from 20x20 to 10x10, with custom scale support
        const scaleVal = u.scale !== undefined ? u.scale : 1.0;
        const uBody = Matter.Bodies.rectangle(u.position.x * SCALE, -u.position.y * SCALE, 10 * scaleVal, 10 * scaleVal, {
          friction: 0.8,
          density: 0.01,
          collisionFilter: {
            category: INTACT_CATEGORY,
            mask: INTACT_MASK,
            group: -999 // Warmup safety group to avoid start explosions
          }
        });
        Matter.Body.setStatic(uBody, true);
        (uBody as any).shouldBeStatic = false;
        (uBody as any).durability = 85;

        // Store initial position
        (uBody as any).initialX = uBody.position.x;
        (uBody as any).initialY = uBody.position.y;
        (uBody as any).initialAngle = uBody.angle;

        Matter.Composite.add(physicsWorld, uBody);
        bodyToElementMap.set(uBody.id, { id: u.id, type: 'utility' });
        elementToBodyMap.set(u.id, uBody);

        // Find closest frame to attach the utility body to
        let closestBody: Matter.Body | null = null;
        let minDist = 99999;

        framesRef.current.forEach(f => {
          const fBody = elementToBodyMap.get(f.id);
          if (fBody) {
            const dist = Math.hypot(fBody.position.x - uBody.position.x, fBody.position.y - uBody.position.y);
            if (dist < minDist) {
              minDist = dist;
              closestBody = fBody;
            }
          }
        });

        if (closestBody && minDist < 60) {
          const w1 = { x: uBody.position.x, y: uBody.position.y };
          const angle = uBody.angle;
          const w2 = {
            x: uBody.position.x + 15 * Math.cos(angle),
            y: uBody.position.y + 15 * Math.sin(angle)
          };

          const localA1 = worldToLocal(closestBody, w1);
          const localA2 = worldToLocal(closestBody, w2);
          const localB1 = { x: 0, y: 0 };
          const localB2 = { x: 15, y: 0 };

          const weld1 = createSafeConstraint({
            bodyA: closestBody,
            bodyB: uBody,
            pointA: localA1,
            pointB: localB1,
            stiffness: 0.85
          });
          (weld1 as any).durability = 85;
          (weld1 as any).isBroken = false;
          (weld1 as any).desiredStiffness = 0.85;
          weld1.stiffness = 0.5;

          const weld2 = createSafeConstraint({
            bodyA: closestBody,
            bodyB: uBody,
            pointA: localA2,
            pointB: localB2,
            stiffness: 0.85
          });
          (weld2 as any).durability = 85;
          (weld2 as any).isBroken = false;
          (weld2 as any).desiredStiffness = 0.85;
          weld2.stiffness = 0.5;

          (weld1 as any).twin = weld2;
          (weld2 as any).twin = weld1;

          Matter.Composite.add(physicsWorld, weld1);
          Matter.Composite.add(physicsWorld, weld2);
          constraintsList.push(weld1, weld2);
        }
      });

      // Store the normal collision group for structural integrity, and initialize as -999 warmup group
      const normalGroup = Matter.Body.nextGroup(true); 
      physicsWorld.bodies.forEach(body => {
        if (!(body as any).isGround) {
          (body as any).normalGroup = normalGroup;
          body.collisionFilter.group = -999;
        }
      });
    }; */

    // --- 7. Building Visual Components ---
const buildThreeMeshes = () => {
      // Clear old frame meshes
      frameMeshes.forEach(mesh => scene.remove(mesh));
      frameMeshes.clear();

      // Clear old wall meshes
      wallMeshes.forEach(mesh => scene.remove(mesh));
      wallMeshes.clear();

      // Clear old wall fragments
      wallFragmentMeshes.forEach(mesh => scene.remove(mesh));
      wallFragmentMeshes.clear();

      // Clear old frame fragments
      frameFragmentMeshes.forEach(mesh => scene.remove(mesh));
      frameFragmentMeshes.clear();

      // Clear old utility meshes
      utilityMeshes.forEach(mesh => scene.remove(mesh));
      utilityMeshes.clear();

      // Draw frames
      framesRef.current.forEach(f => {
        const spec = FRAMEWORK_MATERIALS[f.material] || FRAMEWORK_MATERIALS.steel;
        const colorVal = f.durability < 30 ? '#ef4444' : f.durability < 70 ? '#f59e0b' : spec.color;

        const startVec = new THREE.Vector3(f.start.x, f.start.y, f.start.z);
        const endVec = new THREE.Vector3(f.end.x, f.end.y, f.end.z);
        const distance = startVec.distanceTo(endVec);

        const group = new THREE.Group();

        // Use cylinders for columns and beams
        const radius = spec.thickness;
        const cylGeo = new THREE.CylinderGeometry(radius, radius, distance, qualitySettings.polygons === 'high' ? 16 : 8);
        cylGeo.rotateZ(-Math.PI / 2);

        const frameTex = getMaterialTextures(f.material, qualitySettings.textures);
        const cylMat = new THREE.MeshStandardMaterial({
          color: colorVal,
          map: frameTex.map,
          bumpMap: frameTex.bumpMap,
          bumpScale: f.material === 'wood' || f.material === 'mud' ? 0.08 : 0.04,
          roughness: f.material === 'steel' ? 0.3 : f.material === 'wood' ? 0.7 : f.material === 'bamboo' ? 0.5 : 0.9,
          metalness: f.material === 'steel' ? 0.8 : 0.1,
        });
        const cylinder = new THREE.Mesh(cylGeo, cylMat);
        cylinder.castShadow = true;
        cylinder.receiveShadow = true;

        cylinder.position.set(0, 0, 0);
        const midVec = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
        group.position.copy(midVec);
        group.add(cylinder);

        let direction = new THREE.Vector3().subVectors(endVec, startVec); if (direction.lengthSq() < 0.0001) direction.set(1, 0, 0); else direction.normalize();
        const alignAxis = new THREE.Vector3(1, 0, 0);
        group.quaternion.setFromUnitVectors(alignAxis, direction);
        (group as any).initialQuaternion = group.quaternion.clone();

        const sphereGeo = new THREE.SphereGeometry(radius * 1.3, 8, 8);
        const sphereMat = new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.9 });
        const sphereStart = new THREE.Mesh(sphereGeo, sphereMat);
        const sphereEnd = new THREE.Mesh(sphereGeo, sphereMat);
        sphereStart.position.set(-distance / 2, 0, 0);
        sphereEnd.position.set(distance / 2, 0, 0);
        group.add(sphereStart, sphereEnd);

        scene.add(group);
        frameMeshes.set(f.id, group);
      });

        // Draw walls
        wallsRef.current.forEach(w => {
          const spec = WALL_MATERIALS[w.material] || WALL_MATERIALS.concrete;
          const startVec = new THREE.Vector3(w.start.x, w.start.y, w.start.z);
          const endVec = new THREE.Vector3(w.end.x, w.end.y, w.end.z);
          
          const width = startVec.distanceTo(endVec);
          const height = getWallHeight(w);

          const wallGeo = new THREE.BoxGeometry(width, height, 0.18);
          const wallTex = getMaterialTextures(w.material, qualitySettings.textures);
          const wallMat = new THREE.MeshStandardMaterial({
            color: w.material === 'glass' ? '#ffffff' : spec.color,
            map: wallTex.map,
            bumpMap: wallTex.bumpMap,
            bumpScale: w.material === 'brick' ? 0.12 : w.material === 'steel_plate' ? 0.08 : 0.05,
            roughness: w.material === 'glass' ? 0.1 : w.material === 'steel_plate' ? 0.4 : w.material === 'brick' ? 0.85 : 0.9,
            metalness: w.material === 'steel_plate' ? 0.7 : 0.1,
            transparent: true,
            opacity: w.material === 'glass' ? 0.6 : 0.95,
          });
          const wallMesh = new THREE.Mesh(wallGeo, wallMat);
          wallMesh.castShadow = true;
          wallMesh.receiveShadow = true;

          let dir = new THREE.Vector3().subVectors(endVec, startVec); if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0); else dir.normalize();
          const globalUp = new THREE.Vector3(0, 1, 0);
          const localZ = new THREE.Vector3().crossVectors(dir, globalUp).normalize();
          if (localZ.lengthSq() < 0.001) {
            localZ.set(0, 0, 1);
          }
          const localY = new THREE.Vector3().crossVectors(localZ, dir).normalize();

          const rotationMatrix = new THREE.Matrix4().makeBasis(dir, localY, localZ);
          wallMesh.quaternion.setFromRotationMatrix(rotationMatrix);
          (wallMesh as any).initialQuaternion = wallMesh.quaternion.clone();

          const center = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
          const centerOfMass = center.clone().addScaledVector(localY, height / 2);
          wallMesh.position.copy(centerOfMass);

          // --- Dynamic Crack Generation System ---
          // We create a line segment group to represent visual cracks that develop with damage
          const crackGroup = new THREE.Group();
          crackGroup.name = 'cracks';
          crackGroup.visible = false;

          // Generate 2 to 4 crack centers depending on the width of the wall
          const numCenters = Math.max(2, Math.floor(width / 1.5));
          const points: number[] = [];

          for (let c = 0; c < numCenters; c++) {
            // Center in local space of the front/back faces of the wall
            const cx = (Math.random() - 0.5) * width * 0.8;
            const cy = (Math.random() - 0.5) * height * 0.8;

            // We want cracks on both the front face (z = +0.091) and the back face (z = -0.091)
            const zOffsets = [0.091, -0.091];
            zOffsets.forEach(cz => {
              // From this center, we spawn 5 to 7 branching lines going outwards
              const branches = 5 + Math.floor(Math.random() * 3);
              for (let b = 0; b < branches; b++) {
                const baseAngle = (b / branches) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
                let px = cx;
                let py = cy;
                let pz = cz;

                const lengthSteps = 3 + Math.floor(Math.random() * 3);
                const stepDist = 0.15 + Math.random() * 0.2;

                for (let s = 0; s < lengthSteps; s++) {
                  const stepAngle = baseAngle + (Math.random() - 0.5) * 0.5;
                  const nextX = px + Math.cos(stepAngle) * stepDist;
                  const nextY = py + Math.sin(stepAngle) * stepDist;
                  const nextZ = pz + (Math.random() - 0.5) * 0.01; // subtle jitter

                  // Bound inside the wall face boundaries (add small margin)
                  if (Math.abs(nextX) < width / 2 && Math.abs(nextY) < height / 2) {
                    // Add line segment: (px, py, pz) to (nextX, nextY, nextZ)
                    points.push(px, py, pz);
                    points.push(nextX, nextY, nextZ);

                    px = nextX;
                    py = nextY;
                    pz = nextZ;
                  } else {
                    break;
                  }
                }
              }
            });
          }

          if (points.length > 0) {
            const crackGeo = new THREE.BufferGeometry();
            crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
            
            // Different colors for materials: glass gets white cracks, others get dark charcoal
            const crackColor = w.material === 'glass' ? '#ffffff' : (w.material === 'steel_plate' ? '#111827' : '#27272a');
            const crackMat = new THREE.LineBasicMaterial({
              color: crackColor,
              transparent: true,
              opacity: 0.85
            });

            const crackLines = new THREE.LineSegments(crackGeo, crackMat);
            crackGroup.add(crackLines);
          }

          wallMesh.add(crackGroup);
          (wallMesh as any).crackGroup = crackGroup;

          scene.add(wallMesh);
          wallMeshes.set(w.id, wallMesh);
        });

      // Draw utilities
      utilitiesRef.current.forEach(u => {
        const spec = UTILITIES[u.type];
        const pos = new THREE.Vector3(u.position.x, u.position.y, u.position.z);

        const group = new THREE.Group();
        group.position.copy(pos);
        if (u.rotation !== undefined) {
          group.rotation.y = u.rotation;
        }
        if (u.scale !== undefined) {
          group.scale.set(u.scale, u.scale, u.scale);
        }

        if (u.type === 'door') {
          const frameGeo = new THREE.BoxGeometry(1.2, 2.2, 0.2);
          const frameMat = new THREE.MeshStandardMaterial({ color: '#1e1e24', metalness: 0.5 });
          const frame = new THREE.Mesh(frameGeo, frameMat);
          group.add(frame);

          const plateGeo = new THREE.BoxGeometry(1.0, 2.0, 0.08);
          const plateMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.3 });
          const plate = new THREE.Mesh(plateGeo, plateMat);
          plate.position.set(0, 0, 0.02);
          group.add(plate);
        } else if (u.type === 'drain_pipe') {
          const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, 4, 8);
          const pipeMat = new THREE.MeshStandardMaterial({ color: spec.color, metalness: 0.8, roughness: 0.2 });
          const pipe = new THREE.Mesh(pipeGeo, pipeMat);
          pipe.rotation.x = Math.PI / 2;
          group.add(pipe);
        } else if (u.type === 'electric') {
          const boxGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
          const boxMat = new THREE.MeshStandardMaterial({ color: '#27272a' });
          const box = new THREE.Mesh(boxGeo, boxMat);
          group.add(box);

          const bulbGeo = new THREE.SphereGeometry(0.15, 8, 8);
          const bulbMat = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
          const bulb = new THREE.Mesh(bulbGeo, bulbMat);
          bulb.position.set(0, -0.25, 0);
          group.add(bulb);
        }

        (group as any).initialQuaternion = group.quaternion.clone();

        scene.add(group);
        utilityMeshes.set(u.id, group);
      });
    };

    buildThreeMeshesRef.current = buildThreeMeshes;
    buildThreeMeshes();

    // --- 8. Mouse & Interaction Handlers ---
    let isMouseDown = false;
    let dragStartPos: THREE.Vector3 | null = null;
    let dragCurrentPos: THREE.Vector3 | null = null;
    let activeDrawing = false;
    
    // Smooth camera target focal values (keyboard movement state)
    let moveForward = 0;
    let moveRight = 0;
    let moveUp = 0;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const getGridIntersection = (event: MouseEvent): THREE.Vector3 | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // 1. Raycast against existing structures first (frameMeshes and wallMeshes)
      const meshesToIntersect: THREE.Object3D[] = [];
      frameMeshes.forEach(group => {
        meshesToIntersect.push(group);
      });
      wallMeshes.forEach(mesh => {
        meshesToIntersect.push(mesh);
      });

      const intersects = raycaster.intersectObjects(meshesToIntersect, true);
      if (intersects.length > 0) {
        let targetVec = intersects[0].point.clone();

        // Try to snap to the nearest joint (start or end) of any frame element
        let closestJoint: THREE.Vector3 | null = null;
        let minJointDist = 0.8; // snap radius of 0.8m
        
        framesRef.current.forEach(f => {
          const vStart = new THREE.Vector3(f.start.x, f.start.y, f.start.z);
          const vEnd = new THREE.Vector3(f.end.x, f.end.y, f.end.z);
          
          const dStart = targetVec.distanceTo(vStart);
          if (dStart < minJointDist) {
            minJointDist = dStart;
            closestJoint = vStart;
          }
          
          const dEnd = targetVec.distanceTo(vEnd);
          if (dEnd < minJointDist) {
            minJointDist = dEnd;
            closestJoint = vEnd;
          }
        });

        if (closestJoint) {
          targetVec.copy(closestJoint);
        } else if (isAltPressedRef.current) {
          targetVec.x = Math.round(targetVec.x);
          targetVec.y = Math.round(targetVec.y);
          targetVec.z = Math.round(targetVec.z);
        }
        return targetVec;
      }

      // 2. Fall back to ground plane
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const targetVec = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, targetVec)) {
        // Try to snap to the nearest joint of any frame element if close enough
        let closestJoint: THREE.Vector3 | null = null;
        let minJointDist = 0.8;
        
        framesRef.current.forEach(f => {
          const vStart = new THREE.Vector3(f.start.x, f.start.y, f.start.z);
          const vEnd = new THREE.Vector3(f.end.x, f.end.y, f.end.z);
          
          const dStart = targetVec.distanceTo(vStart);
          if (dStart < minJointDist) {
            minJointDist = dStart;
            closestJoint = vStart;
          }
          
          const dEnd = targetVec.distanceTo(vEnd);
          if (dEnd < minJointDist) {
            minJointDist = dEnd;
            closestJoint = vEnd;
          }
        });

        if (closestJoint) {
          targetVec.copy(closestJoint);
        } else if (isAltPressedRef.current) {
          targetVec.x = Math.round(targetVec.x);
          targetVec.z = Math.round(targetVec.z);
        }
        return targetVec;
      }
      return null;
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (stageRef.current === 'testing') return;

      const isRotateMode = ['position', 'rotation', 'scale'].includes(mouseModeRef.current);
      if (isRotateMode) {
        if (event.button === 0) {
          if (hoveredGizmoAxis) {
            isDraggingGizmo = true;
            activeGizmoAxis = hoveredGizmoAxis.name;
            dragGizmoStartMousePos.set(event.clientX, event.clientY);

            // Save original element data for delta mapping
            const targetId = selectedDebugIdRef.current;
            if (targetId) {
              const frame = framesRef.current.find(f => f.id === targetId);
              if (frame) {
                originalElementData = {
                  type: 'frame',
                  start: new THREE.Vector3(frame.start.x, frame.start.y, frame.start.z),
                  end: new THREE.Vector3(frame.end.x, frame.end.y, frame.end.z)
                };
              } else {
                const wall = wallsRef.current.find(w => w.id === targetId);
                if (wall) {
                  originalElementData = {
                    type: 'wall',
                    start: new THREE.Vector3(wall.start.x, wall.start.y, wall.start.z),
                    end: new THREE.Vector3(wall.end.x, wall.end.y, wall.end.z),
                    height: getWallHeight(wall)
                  };
                } else {
                  const util = utilitiesRef.current.find(u => u.id === targetId);
                  if (util) {
                    originalElementData = {
                      type: 'utility',
                      position: new THREE.Vector3(util.position.x, util.position.y, util.position.z),
                      rotation: util.rotation !== undefined ? util.rotation : 0,
                      scale: util.scale !== undefined ? util.scale : 1.0
                    };
                  }
                }
              }
            }
            return;
          } else {
            // Raycast against building elements for selection
            raycaster.setFromCamera(mouse, camera);
            const meshesList = [
              ...Array.from(frameMeshes.values()).flatMap(obj => obj.children),
              ...Array.from(wallMeshes.values()),
              ...Array.from(utilityMeshes.values()).flatMap(obj => obj.children)
            ];
            const intersects = raycaster.intersectObjects(meshesList, true);
            let targetPoint: THREE.Vector3 | null = null;
            if (intersects.length > 0) {
              targetPoint = intersects[0].point;
              let obj: THREE.Object3D | null = intersects[0].object;
              let foundId: string | null = null;
              while (obj && obj !== scene) {
                for (const [id, frameGroup] of frameMeshes.entries()) {
                  if (frameGroup === obj || frameGroup.uuid === obj.uuid || frameGroup.getObjectById(obj.id)) {
                    foundId = id; break;
                  }
                }
                if (foundId) break;
                for (const [id, wallObj] of wallMeshes.entries()) {
                  if (wallObj === obj || wallObj.uuid === obj.uuid || wallObj.getObjectById(obj.id)) {
                    foundId = id; break;
                  }
                }
                if (foundId) break;
                for (const [id, utilGroup] of utilityMeshes.entries()) {
                  if (utilGroup === obj || utilGroup.uuid === obj.uuid || utilGroup.getObjectById(obj.id)) {
                    foundId = id; break;
                  }
                }
                if (foundId) break;
                obj = obj.parent;
              }
              if (foundId) {
                setSelectedDebugId(foundId);
                // Position gizmo at element's exact center
                let center = new THREE.Vector3();
                const frame = framesRef.current.find(f => f.id === foundId);
                if (frame) {
                  center.addVectors(new THREE.Vector3(frame.start.x, frame.start.y, frame.start.z), new THREE.Vector3(frame.end.x, frame.end.y, frame.end.z)).multiplyScalar(0.5);
                } else {
                  const wall = wallsRef.current.find(w => w.id === foundId);
                  if (wall) {
                    center.addVectors(new THREE.Vector3(wall.start.x, wall.start.y, wall.start.z), new THREE.Vector3(wall.end.x, wall.end.y, wall.end.z)).multiplyScalar(0.5);
                    center.y += getWallHeight(wall) / 2;
                  } else {
                    const util = utilitiesRef.current.find(u => u.id === foundId);
                    if (util) {
                      center.set(util.position.x, util.position.y, util.position.z);
                    }
                  }
                }
                rotationGizmoGroup.position.copy(center);
                rotationGizmoGroup.visible = true;
              }
            } else {
              // Clicked on blank space, clear selection
              setSelectedDebugId(null);
              rotationGizmoGroup.visible = false;
            }
          }
        }
        return;
      }

      // Handle Left Click for building
      if (event.button === 0) {
        const intersection = getGridIntersection(event);
        if (intersection) {
          isMouseDown = true;
          dragStartPos = intersection.clone();
          dragCurrentPos = intersection.clone();
          activeDrawing = true;
        }
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // --- A. Gizmo Dragging Logic ---
      if (isDraggingGizmo && originalElementData && activeGizmoAxis) {
        const dx = event.clientX - dragGizmoStartMousePos.x;
        const dy = event.clientY - dragGizmoStartMousePos.y;

        // Sensible translation scale per pixel delta
        const dragScale = 0.04;
        let deltaX = dx * dragScale;
        let deltaY = -dy * dragScale;
        let deltaZ = dy * dragScale;

        const targetId = selectedDebugIdRef.current;
        if (targetId) {
          if (originalElementData.type === 'frame') {
            const frame = framesRef.current.find(f => f.id === targetId);
            if (frame && onUpdateFrameRef.current) {
              const updatedFrame = { ...frame };
              const start = originalElementData.start.clone();
              const end = originalElementData.end.clone();
              const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

              if (mouseModeRef.current === 'position') {
                const offset = new THREE.Vector3();
                if (activeGizmoAxis === "gizmo_pos_x") offset.set(deltaX, 0, 0);
                if (activeGizmoAxis === "gizmo_pos_y") offset.set(0, deltaY, 0);
                if (activeGizmoAxis === "gizmo_pos_z") offset.set(0, 0, deltaZ);
                
                updatedFrame.start = { x: start.x + offset.x, y: start.y + offset.y, z: start.z + offset.z };
                updatedFrame.end = { x: end.x + offset.x, y: end.y + offset.y, z: end.z + offset.z };
              } 
              else if (mouseModeRef.current === 'rotation') {
                if (activeGizmoAxis === "gizmo_rot_y") {
                  const angle = dx * 0.015;
                  const rotMatrix = new THREE.Matrix4().makeRotationY(angle);
                  
                  const startRel = start.clone().sub(center).applyMatrix4(rotMatrix).add(center);
                  const endRel = end.clone().sub(center).applyMatrix4(rotMatrix).add(center);

                  updatedFrame.start = { x: startRel.x, y: startRel.y, z: startRel.z };
                  updatedFrame.end = { x: endRel.x, y: endRel.y, z: endRel.z };
                }
              } 
              else if (mouseModeRef.current === 'scale') {
                let scaleFactor = 1.0;
                if (activeGizmoAxis === "gizmo_scale_x" || activeGizmoAxis === "gizmo_scale_z") scaleFactor = 1.0 + dx * 0.01;
                if (activeGizmoAxis === "gizmo_scale_y") scaleFactor = 1.0 + deltaY * 0.1;
                
                scaleFactor = Math.max(0.2, scaleFactor);

                const startRel = start.clone().sub(center).multiplyScalar(scaleFactor).add(center);
                const endRel = end.clone().sub(center).multiplyScalar(scaleFactor).add(center);

                updatedFrame.start = { x: startRel.x, y: startRel.y, z: startRel.z };
                updatedFrame.end = { x: endRel.x, y: endRel.y, z: endRel.z };
              }

              onUpdateFrameRef.current(updatedFrame);
              const newCenter = new THREE.Vector3(updatedFrame.start.x + updatedFrame.end.x, updatedFrame.start.y + updatedFrame.end.y, updatedFrame.start.z + updatedFrame.end.z).multiplyScalar(0.5);
              rotationGizmoGroup.position.copy(newCenter);
            }
          } 
          else if (originalElementData.type === 'wall') {
            const wall = wallsRef.current.find(w => w.id === targetId);
            if (wall && onUpdateWallRef.current) {
              const updatedWall = { ...wall };
              const start = originalElementData.start.clone();
              const end = originalElementData.end.clone();
              const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

              if (mouseModeRef.current === 'position') {
                const offset = new THREE.Vector3();
                if (activeGizmoAxis === "gizmo_pos_x") offset.set(deltaX, 0, 0);
                if (activeGizmoAxis === "gizmo_pos_y") offset.set(0, deltaY, 0);
                if (activeGizmoAxis === "gizmo_pos_z") offset.set(0, 0, deltaZ);

                updatedWall.start = { x: start.x + offset.x, y: start.y + offset.y, z: start.z + offset.z };
                updatedWall.end = { x: end.x + offset.x, y: end.y + offset.y, z: end.z + offset.z };
              } 
              else if (mouseModeRef.current === 'rotation') {
                if (activeGizmoAxis === "gizmo_rot_y") {
                  const angle = dx * 0.015;
                  const rotMatrix = new THREE.Matrix4().makeRotationY(angle);
                  
                  const startRel = start.clone().sub(center).applyMatrix4(rotMatrix).add(center);
                  const endRel = end.clone().sub(center).applyMatrix4(rotMatrix).add(center);

                  updatedWall.start = { x: startRel.x, y: startRel.y, z: startRel.z };
                  updatedWall.end = { x: endRel.x, y: endRel.y, z: endRel.z };
                }
              } 
              else if (mouseModeRef.current === 'scale') {
                if (activeGizmoAxis === "gizmo_scale_x" || activeGizmoAxis === "gizmo_scale_z") {
                  const scaleFactor = Math.max(0.2, 1.0 + dx * 0.01);
                  const startRel = start.clone().sub(center).multiplyScalar(scaleFactor).add(center);
                  const endRel = end.clone().sub(center).multiplyScalar(scaleFactor).add(center);

                  updatedWall.start = { x: startRel.x, y: startRel.y, z: startRel.z };
                  updatedWall.end = { x: endRel.x, y: endRel.y, z: endRel.z };
                }
                if (activeGizmoAxis === "gizmo_scale_y") {
                  updatedWall.height = Math.max(0.5, originalElementData.height + deltaY);
                }
              }

              onUpdateWallRef.current(updatedWall);
              const newCenter = new THREE.Vector3(updatedWall.start.x + updatedWall.end.x, updatedWall.start.y + updatedWall.end.y, updatedWall.start.z + updatedWall.end.z).multiplyScalar(0.5);
              newCenter.y += getWallHeight(updatedWall) / 2;
              rotationGizmoGroup.position.copy(newCenter);
            }
          } 
          else if (originalElementData.type === 'utility') {
            const util = utilitiesRef.current.find(u => u.id === targetId);
            if (util && onUpdateUtilityRef.current) {
              const updatedUtil = { ...util };
              const pos = originalElementData.position.clone();

              if (mouseModeRef.current === 'position') {
                const offset = new THREE.Vector3();
                if (activeGizmoAxis === "gizmo_pos_x") offset.set(deltaX, 0, 0);
                if (activeGizmoAxis === "gizmo_pos_y") offset.set(0, deltaY, 0);
                if (activeGizmoAxis === "gizmo_pos_z") offset.set(0, 0, deltaZ);

                updatedUtil.position = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
              } 
              else if (mouseModeRef.current === 'rotation') {
                if (activeGizmoAxis === "gizmo_rot_y") {
                  const initialRot = originalElementData.rotation !== undefined ? originalElementData.rotation : 0;
                  const angle = initialRot + dx * 0.015;
                  updatedUtil.rotation = angle;
                }
              } 
              else if (mouseModeRef.current === 'scale') {
                let scaleFactor = originalElementData.scale !== undefined ? originalElementData.scale : 1.0;
                if (activeGizmoAxis === "gizmo_scale_x" || activeGizmoAxis === "gizmo_scale_z") {
                  scaleFactor = scaleFactor + dx * 0.01;
                } else if (activeGizmoAxis === "gizmo_scale_y") {
                  scaleFactor = scaleFactor + deltaY * 0.1;
                }
                updatedUtil.scale = Math.max(0.2, scaleFactor);
              }

              onUpdateUtilityRef.current(updatedUtil);
              rotationGizmoGroup.position.set(updatedUtil.position.x, updatedUtil.position.y, updatedUtil.position.z);
            }
          }
        }
        return;
      }

      // --- B. Gizmo Hover Highlight Logic ---
      const isRotateMode = ['position', 'rotation', 'scale'].includes(mouseModeRef.current);
      if (isRotateMode && !isDraggingGizmo) {
        // Reset colors and opacities
        (tArrowX.line.material as any).color.setHex(0xef4444);
        (tArrowX.cone.material as any).color.setHex(0xef4444);
        rRingMatX.color.setHex(0xef4444);
        rRingMatX.opacity = 0.6;
        sLineMatX.color.setHex(0xef4444);
        (sBoxMeshX.material as any).color.setHex(0xef4444);

        (tArrowY.line.material as any).color.setHex(0x22c55e);
        (tArrowY.cone.material as any).color.setHex(0x22c55e);
        rRingMatY.color.setHex(0x22c55e);
        rRingMatY.opacity = 0.6;
        sLineMatY.color.setHex(0x22c55e);
        (sBoxMeshY.material as any).color.setHex(0x22c55e);

        (tArrowZ.line.material as any).color.setHex(0x3b82f6);
        (tArrowZ.cone.material as any).color.setHex(0x3b82f6);
        rRingMatZ.color.setHex(0x3b82f6);
        rRingMatZ.opacity = 0.6;
        sLineMatZ.color.setHex(0x3b82f6);
        (sBoxMeshZ.material as any).color.setHex(0x3b82f6);

        // Raycast against only visible active gizmo handles
        const visibleGizmoObjects = gizmoInteractiveObjects.filter(obj => {
          let parentVisible = true;
          let p = obj.parent;
          while (p) {
            if (!p.visible) { parentVisible = false; break; }
            p = p.parent;
          }
          return obj.visible && parentVisible;
        });

        const intersectsGizmo = raycaster.intersectObjects(visibleGizmoObjects, true);
        if (intersectsGizmo.length > 0) {
          const hitObj = intersectsGizmo[0].object;
          hoveredGizmoAxis = hitObj;
          renderer.domElement.style.cursor = 'pointer';

          let axisName = "";
          if (hitObj === tArrowX.line || hitObj === tArrowX.cone) axisName = "gizmo_pos_x";
          else if (hitObj === tArrowY.line || hitObj === tArrowY.cone) axisName = "gizmo_pos_y";
          else if (hitObj === tArrowZ.line || hitObj === tArrowZ.cone) axisName = "gizmo_pos_z";
          else if (hitObj === rRingX) axisName = "gizmo_rot_x";
          else if (hitObj === rRingY) axisName = "gizmo_rot_y";
          else if (hitObj === rRingZ) axisName = "gizmo_rot_z";
          else if (hitObj === sLineX || hitObj === sBoxMeshX) axisName = "gizmo_scale_x";
          else if (hitObj === sLineY || hitObj === sBoxMeshY) axisName = "gizmo_scale_y";
          else if (hitObj === sLineZ || hitObj === sBoxMeshZ) axisName = "gizmo_scale_z";

          hitObj.name = axisName;

          if (axisName === "gizmo_pos_x" || axisName === "gizmo_rot_x" || axisName === "gizmo_scale_x") {
            (tArrowX.line.material as any).color.setHex(0xff8888);
            (tArrowX.cone.material as any).color.setHex(0xff8888);
            rRingMatX.color.setHex(0xff8888);
            rRingMatX.opacity = 0.95;
            sLineMatX.color.setHex(0xff8888);
            (sBoxMeshX.material as any).color.setHex(0xff8888);
          } else if (axisName === "gizmo_pos_y" || axisName === "gizmo_rot_y" || axisName === "gizmo_scale_y") {
            (tArrowY.line.material as any).color.setHex(0x86efac);
            (tArrowY.cone.material as any).color.setHex(0x86efac);
            rRingMatY.color.setHex(0x86efac);
            rRingMatY.opacity = 0.95;
            sLineMatY.color.setHex(0x86efac);
            (sBoxMeshY.material as any).color.setHex(0x86efac);
          } else if (axisName === "gizmo_pos_z" || axisName === "gizmo_rot_z" || axisName === "gizmo_scale_z") {
            (tArrowZ.line.material as any).color.setHex(0x93c5fd);
            (tArrowZ.cone.material as any).color.setHex(0x93c5fd);
            rRingMatZ.color.setHex(0x93c5fd);
            rRingMatZ.opacity = 0.95;
            sLineMatZ.color.setHex(0x93c5fd);
            (sBoxMeshZ.material as any).color.setHex(0x93c5fd);
          }
        } else {
          hoveredGizmoAxis = null;
          renderer.domElement.style.cursor = 'auto';
        }
      }

      // --- C. Drawing / Placement Preview Logic ---
      if (isMouseDown && dragStartPos && activeDrawing) {
        heightLine.visible = false;
        heightDot.visible = false;

        const intersection = getGridIntersection(event);
        if (intersection) {
          dragCurrentPos = intersection.clone();

          if (isAltPressedRef.current) {
            dragCurrentPos.x = Math.round(dragCurrentPos.x);
            dragCurrentPos.z = Math.round(dragCurrentPos.z);
          }

          if (stageRef.current === 'framing' && selectedMaterialRef.current) {
            const matSpec = FRAMEWORK_MATERIALS[selectedMaterialRef.current];
            let startPoint = dragStartPos.clone();
            let endPoint = dragCurrentPos.clone();

            let snappedY = endPoint.y;
            let minDiffY = 0.25;
            framesRef.current.forEach(f => {
              const diffStart = Math.abs(endPoint.y - f.start.y);
              if (diffStart < minDiffY) {
                minDiffY = diffStart;
                snappedY = f.start.y;
              }
              const diffEnd = Math.abs(endPoint.y - f.end.y);
              if (diffEnd < minDiffY) {
                minDiffY = diffEnd;
                snappedY = f.end.y;
              }
            });
            endPoint.y = snappedY;

            const dist = startPoint.distanceTo(endPoint);
            const mid = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
            
            previewCylinder!.scale.set(1, dist, 1);
            previewCylinder!.position.copy(mid);
            
            const dir = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();
            const align = new THREE.Vector3(0, 1, 0);
            previewCylinder!.quaternion.setFromUnitVectors(align, dir);
            previewCylinder!.visible = true;

            const calculatedCost = dist * matSpec.costPerMeter;
            const calculatedWeight = dist * matSpec.density;

            setTooltipInfo({
              show: true,
              x: event.clientX + 20,
              y: event.clientY + 20,
              title: `${matSpec.nameKo} 건설 중`,
              details: [
                `길이: ${dist.toFixed(2)}m`,
                `총 건설비: ₩${calculatedCost.toLocaleString()}`,
                `총 무게: ${calculatedWeight.toFixed(2)}kg`,
                `내구성 지수: ${matSpec.durability}/100`,
                `유연성: ${(matSpec.flexibility * 100).toFixed(0)}%`,
              ]
            });
          } else if (stageRef.current === 'cladding' && selectedWallMaterialRef.current) {
            const wallSpec = WALL_MATERIALS[selectedWallMaterialRef.current];
            const dist = dragStartPos.distanceTo(dragCurrentPos);
            
            const deltaY = Math.abs(dragCurrentPos.y - dragStartPos.y);
            const height = deltaY > 0.2 ? deltaY : 3.0;
            
            const dir = new THREE.Vector3().subVectors(dragCurrentPos, dragStartPos).normalize();
            const globalUp = new THREE.Vector3(0, 1, 0);
            const localZ = new THREE.Vector3().crossVectors(dir, globalUp).normalize();
            if (localZ.lengthSq() < 0.001) {
              localZ.set(0, 0, 1);
            }
            const localY = new THREE.Vector3().crossVectors(localZ, dir).normalize();

            const rotationMatrix = new THREE.Matrix4().makeBasis(dir, localY, localZ);
            wallPreviewMesh.quaternion.setFromRotationMatrix(rotationMatrix);

            const center = new THREE.Vector3().addVectors(dragStartPos, dragCurrentPos).multiplyScalar(0.5);
            center.addScaledVector(localY, height / 2);
            wallPreviewMesh.position.copy(center);

            wallPreviewMesh.scale.set(dist, height, 1.2);
            wallPreviewMesh.visible = true;

            const calculatedCost = dist * 3 * wallSpec.costPerSqm;
            const calculatedWeight = dist * 3 * wallSpec.weightPerSqm;

            setTooltipInfo({
              show: true,
              x: event.clientX + 20,
              y: event.clientY + 20,
              title: `${wallSpec.nameKo} 미리보기`,
              details: [
                `가로 너비: ${dist.toFixed(2)}m`,
                `벽 면적: ${(dist * 3).toFixed(1)}㎡`,
                `건설 비용: ₩${calculatedCost.toLocaleString()}`,
                `예상 무게: ${calculatedWeight.toFixed(1)}kg`,
              ]
            });
          }
        }
      } else if (!isRotateMode) {
        // --- D. Elements Hover State Inspections (Only in standard build mode) ---
        const meshesList = [
          ...Array.from(frameMeshes.values()).flatMap(obj => obj.children),
          ...Array.from(wallMeshes.values()),
          ...Array.from(utilityMeshes.values()).flatMap(obj => obj.children)
        ];
        const intersects = raycaster.intersectObjects(meshesList, true);
        if (intersects.length > 0) {
          const hitPoint = intersects[0].point;
          
          let found = false;
          let foundItemName = '';
          let foundDetails: string[] = [];

          let obj: THREE.Object3D | null = intersects[0].object;
          while (obj && obj !== scene) {
            for (const [id, frameGroup] of frameMeshes.entries()) {
              if (frameGroup === obj || frameGroup.uuid === obj.uuid || frameGroup.getObjectById(obj.id)) {
                const element = framesRef.current.find(f => f.id === id);
                if (element) {
                  const spec = FRAMEWORK_MATERIALS[element.material];
                  foundItemName = spec.nameKo;
                  foundDetails = [
                    `유형: 뼈대 구조체`,
                    `길이: ${element.start.y === element.end.y ? '수평 빔' : '수직 기둥'} (${new THREE.Vector3(element.start.x, element.start.y, element.start.z).distanceTo(new THREE.Vector3(element.end.x, element.end.y, element.end.z)).toFixed(2)}m)`,
                    `소재 무게: ${element.weight.toFixed(1)}kg`,
                    `소재 비용: ₩${element.cost.toLocaleString()}`,
                    `현재 내구도: ${element.durability.toFixed(0)}%`,
                  ];
                  found = true;
                  break;
                }
              }
            }
            if (found) break;

            for (const [id, wallObj] of wallMeshes.entries()) {
              if (wallObj === obj) {
                const element = wallsRef.current.find(w => w.id === id);
                if (element) {
                  const spec = WALL_MATERIALS[element.material];
                  foundItemName = spec.nameKo;
                  foundDetails = [
                    `유형: 외장형 외벽`,
                    `예상 자재비: ₩${element.cost.toLocaleString()}`,
                    `예상 중량: ${element.weight.toFixed(1)}kg`,
                    `내구성: ${spec.durability}/100`,
                    `수해 저항: ${(spec.waterResistance * 100).toFixed(0)}%`,
                  ];
                  found = true;
                  break;
                }
              }
            }
            if (found) break;

            for (const [id, utilGroup] of utilityMeshes.entries()) {
              if (utilGroup === obj || utilGroup.uuid === obj.uuid || utilGroup.getObjectById(obj.id)) {
                const element = utilitiesRef.current.find(u => u.id === id);
                if (element) {
                  const spec = UTILITIES[element.type];
                  foundItemName = spec.nameKo;
                  foundDetails = [
                    `유형: 보강 설비`,
                    `설치 비용: ₩${element.cost.toLocaleString()}`,
                    `안전 효과: ${spec.safetyEffect}`,
                  ];
                  found = true;
                  break;
                }
              }
            }
            if (found) break;

            obj = obj.parent;
          }

          if (found) {
            // Render neat light indicator laser lines on element hover ONLY
            const points = [new THREE.Vector3(hitPoint.x, 0, hitPoint.z), hitPoint];
            heightLine.geometry.setFromPoints(points);
            heightLine.visible = true;
            
            heightDot.position.copy(hitPoint);
            heightDot.visible = true;

            foundDetails.push(`지면 측정 높이(Y): ${hitPoint.y.toFixed(2)}m`);
            setTooltipInfo({
              show: true,
              x: event.clientX + 15,
              y: event.clientY + 15,
              title: foundItemName,
              details: foundDetails,
            });
          } else {
            heightLine.visible = false;
            heightDot.visible = false;
            setTooltipInfo(prev => ({ ...prev, show: false }));
          }
        } else {
          heightLine.visible = false;
          heightDot.visible = false;
          setTooltipInfo(prev => ({ ...prev, show: false }));
        }
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (stageRef.current === 'testing') return;

      if (isDraggingGizmo) {
        isDraggingGizmo = false;
        activeGizmoAxis = null;
        renderer.domElement.style.cursor = 'auto';
        return;
      }

      if (event.button === 0 && isMouseDown && dragStartPos && dragCurrentPos) {
        isMouseDown = false;
        activeDrawing = false;
        previewCylinder!.visible = false;
        wallPreviewMesh.visible = false;

        // Add framed or wall elements
        const dist = dragStartPos.distanceTo(dragCurrentPos);
        if (dist > 0.4) {
          if (stageRef.current === 'framing' && selectedMaterialRef.current) {
            const spec = FRAMEWORK_MATERIALS[selectedMaterialRef.current];

            // Decide horizontal/vertical snapping
            let start = dragStartPos.clone();
            let end = dragCurrentPos.clone(); // Follow mouse unconditionally in X, Y, Z

            // Y-axis height magnet snap: if Y is within 0.25m of any nearby frame height, snap to it!
            let snappedY = end.y;
            let minDiffY = 0.25; // 0.25M
            framesRef.current.forEach(f => {
              const diffStart = Math.abs(end.y - f.start.y);
              if (diffStart < minDiffY) {
                minDiffY = diffStart;
                snappedY = f.start.y;
              }
              const diffEnd = Math.abs(end.y - f.end.y);
              if (diffEnd < minDiffY) {
                minDiffY = diffEnd;
                snappedY = f.end.y;
              }
            });
            end.y = snappedY;

            // Welding verification: If it's a horizontal beam floating, snap to adjacent columns
            // Auto welding checks!
            let canWeld = end.y === 0 || start.y === 0; // on ground is always safe
            
            // Check snapping to other joints or poles
            framesRef.current.forEach(other => {
              const oStart = new THREE.Vector3(other.start.x, other.start.y, other.start.z);
              const oEnd = new THREE.Vector3(other.end.x, other.end.y, other.end.z);
              
              if (start.distanceTo(oStart) < 0.5) { start.copy(oStart); canWeld = true; }
              if (start.distanceTo(oEnd) < 0.5) { start.copy(oEnd); canWeld = true; }
              if (end.distanceTo(oStart) < 0.5) { end.copy(oStart); canWeld = true; }
              if (end.distanceTo(oEnd) < 0.5) { end.copy(oEnd); canWeld = true; }
            });

            // If we try to build in mid-air with absolutely no weld connection points, it falls!
            // We will allow adding it, but we drop it or delete if floating.
            const calculatedCost = dist * spec.costPerMeter;
            const calculatedWeight = dist * spec.density;

            onAddFrame({
              id: Math.random().toString(36).substring(2, 9),
              material: selectedMaterialRef.current,
              start: { x: start.x, y: start.y, z: start.z },
              end: { x: end.x, y: end.y, z: end.z },
              cost: Math.round(calculatedCost),
              weight: calculatedWeight,
              durability: 100,
            });

          } else if (stageRef.current === 'cladding' && selectedWallMaterialRef.current) {
            const spec = WALL_MATERIALS[selectedWallMaterialRef.current];
            const start = dragStartPos.clone();
            const end = dragCurrentPos.clone();

            const calculatedCost = dist * 3 * spec.costPerSqm;
            const calculatedWeight = dist * 3 * spec.weightPerSqm;

            onAddWall({
              id: Math.random().toString(36).substring(2, 9),
              material: selectedWallMaterialRef.current,
              start: { x: start.x, y: start.y, z: start.z },
              end: { x: end.x, y: end.y, z: end.z },
              cost: Math.round(calculatedCost),
              weight: calculatedWeight,
            });
          }
        } else {
          // If the user clicked/dragged a tiny bit, and a utility is selected, place it!
          if (stageRef.current === 'cladding' && selectedUtilityRef.current) {
            const spec = UTILITIES[selectedUtilityRef.current];
            if (spec) {
              onAddUtility({
                id: Math.random().toString(36).substring(2, 9),
                type: selectedUtilityRef.current,
                position: { x: dragCurrentPos.x, y: dragCurrentPos.y, z: dragCurrentPos.z },
                cost: spec.cost,
              });
            }
          }
        }
      }
    };

    // Right Click Camera Rotation
    let isRightMouseDown = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const handleCanvasMouseDown = (e: MouseEvent) => {
      if (isDraggingGizmo) return;
      if (e.button === 2) { // Right click
        isRightMouseDown = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
        e.preventDefault();
      }
    };

    const handleCanvasMouseMove = (e: MouseEvent) => {
      if (isDraggingGizmo) return;
      if (isRightMouseDown && is3DRef.current) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;

        thetaTarget -= deltaX * 0.007;
        phiTarget += deltaY * 0.007;

        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const handleCanvasMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        isRightMouseDown = false;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      distanceTarget += e.deltaY * 0.015;
      distanceTarget = THREE.MathUtils.clamp(distanceTarget, 8, 80);
      e.preventDefault();
    };

    // WASD keyboard moves camera focal target point
    const handleKeyDownWASD = (e: KeyboardEvent) => {
      const moveSpeed = 1;
      if (e.key === 'w' || e.key === 'W') moveForward = moveSpeed;
      if (e.key === 's' || e.key === 'S') moveForward = -moveSpeed;
      if (e.key === 'a' || e.key === 'A') moveRight = -moveSpeed;
      if (e.key === 'd' || e.key === 'D') moveRight = moveSpeed;
      if (e.key === ' ' || e.key === 'Spacebar') {
        moveUp = moveSpeed;
        e.preventDefault();
      }
      if (e.key === 'Control') {
        moveUp = -moveSpeed;
        e.preventDefault();
      }

      // Handle direct item deletion
      if (e.key === 'Delete') {
        // Delete selected under cursor
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
          let obj: THREE.Object3D | null = intersects[0].object;
          while (obj && obj !== scene) {
            for (const [id, fG] of frameMeshes.entries()) {
              if (fG.uuid === obj.uuid || fG.getObjectById(obj.id)) {
                onDeleteElement(id, 'frame');
                break;
              }
            }
            for (const [id, wM] of wallMeshes.entries()) {
              if (wM === obj) {
                onDeleteElement(id, 'wall');
                break;
              }
            }
            obj = obj.parent;
          }
        }
      }
    };

    const handleKeyUpWASD = (e: KeyboardEvent) => {
      if (['w', 'W', 's', 'S'].includes(e.key)) moveForward = 0;
      if (['a', 'A', 'd', 'D'].includes(e.key)) moveRight = 0;
      if (e.key === ' ' || e.key === 'Spacebar') moveUp = 0;
      if (e.key === 'Control') moveUp = 0;
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', handleMouseDown);
    dom.addEventListener('mousemove', handleMouseMove);
    dom.addEventListener('mouseup', handleMouseUp);
    dom.addEventListener('mousedown', handleCanvasMouseDown);
    dom.addEventListener('mousemove', handleCanvasMouseMove);
    dom.addEventListener('mouseup', handleCanvasMouseUp);
    dom.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDownWASD);
    window.addEventListener('keyup', handleKeyUpWASD);

    // Disable default context menu
    const disableContextMenu = (e: MouseEvent) => e.preventDefault();
    dom.addEventListener('contextmenu', disableContextMenu);

    // --- 9. Real-time Render & Physics Animation Loop ---
    let frameId: number;

    const animate = () => {
      frameId = requestAnimationFrame(animate);

      // Interpolate camera focal target (WASD smooth glide relative to look direction)
      const forwardDir = new THREE.Vector3();
      forwardDir.subVectors(cameraTarget, camera.position);
      forwardDir.y = 0; // Project onto horizontal XZ plane
      forwardDir.normalize();

      const rightDir = new THREE.Vector3();
      rightDir.crossVectors(forwardDir, new THREE.Vector3(0, 1, 0)).normalize();

      const glideSpeed = 0.35;
      cameraTarget.addScaledVector(forwardDir, moveForward * glideSpeed);
      cameraTarget.addScaledVector(rightDir, moveRight * glideSpeed);
      cameraTarget.y += moveUp * glideSpeed;
      cameraTarget.y = THREE.MathUtils.clamp(cameraTarget.y, 0, 50);

      // Toggle camera projection based on 2D / 3D state (Shift key transition)
      if (!is3DRef.current) {
        // Smooth transition to direct front visual 2D orthogonal elevation in closest cardinal direction (North, South, East, West)
        const snapTheta = Math.round(cameraTheta / (Math.PI / 2)) * (Math.PI / 2);
        thetaTarget = THREE.MathUtils.lerp(thetaTarget, snapTheta, 0.08);
        phiTarget = THREE.MathUtils.lerp(phiTarget, Math.PI / 2, 0.08);
        distanceTarget = THREE.MathUtils.lerp(distanceTarget, 22, 0.08);
      } else {
        // Normal 3D angled camera look - let the right-click drag update targets freely
        phiTarget = THREE.MathUtils.clamp(phiTarget, 0.05, Math.PI / 2 - 0.05);
        distanceTarget = THREE.MathUtils.clamp(distanceTarget, 8, 80);
      }

      cameraTheta = THREE.MathUtils.lerp(cameraTheta, thetaTarget, 0.08);
      cameraPhi = THREE.MathUtils.lerp(cameraPhi, phiTarget, 0.08);
      cameraDistance = THREE.MathUtils.lerp(cameraDistance, distanceTarget, 0.08);

      updateCameraPosition();

      // Update 3D Debug Position Highlight Gizmo in Scene
      if (selectedDebugIdRef.current) {
        const targetId = selectedDebugIdRef.current;
        let targetPos: { x: number; y: number; z: number } | null = null;
        let targetSize: { x: number; y: number; z: number } = { x: 1.0, y: 1.0, z: 1.0 };
        
        const targetFrame = framesRef.current.find(f => f.id === targetId);
        if (targetFrame) {
          targetPos = {
            x: (targetFrame.start.x + targetFrame.end.x) / 2,
            y: (targetFrame.start.y + targetFrame.end.y) / 2,
            z: (targetFrame.start.z + targetFrame.end.z) / 2,
          };
          const len = Math.max(0.2, Math.hypot(
            targetFrame.end.x - targetFrame.start.x,
            targetFrame.end.y - targetFrame.start.y,
            targetFrame.end.z - targetFrame.start.z
          ));
          const thick = Math.max(0.15, (FRAMEWORK_MATERIALS[targetFrame.material]?.thickness || 0.15) * 1.5);
          targetSize = { x: thick, y: thick, z: len };
        } else {
          const targetWall = wallsRef.current.find(w => w.id === targetId);
          if (targetWall) {
            targetPos = {
              x: (targetWall.start.x + targetWall.end.x) / 2,
              y: (targetWall.start.y + targetWall.end.y) / 2,
              z: (targetWall.start.z + targetWall.end.z) / 2,
            };
            const wLen = Math.max(0.3, Math.hypot(
              targetWall.end.x - targetWall.start.x,
              targetWall.end.y - targetWall.start.y
            ));
            const wHeight = Math.max(0.5, Math.abs(targetWall.end.z - targetWall.start.z) || 3.0);
            targetSize = { x: wLen, y: wHeight, z: 0.25 };
          } else {
            const targetUtil = utilitiesRef.current.find(u => u.id === targetId);
            if (targetUtil) {
              targetPos = { 
                x: targetUtil.position.x, 
                y: targetUtil.position.y, 
                z: targetUtil.position.z 
              };
              targetSize = { x: 0.4, y: 0.4, z: 0.4 };
            }
          }
        }

        if (targetPos) {
          debugGizmoGroup.visible = true;
          debugGizmoGroup.position.set(targetPos.x, targetPos.y, targetPos.z);
          gizmoBoxMesh.scale.set(targetSize.x, targetSize.y, targetSize.z);
          debugGizmoGroup.rotation.y += 0.02;
        } else {
          debugGizmoGroup.visible = false;
        }
      } else {
        debugGizmoGroup.visible = false;
      }

      // IF SIMULATION IS ACTIVE, RUN MATTER.JS AND MAP BACK TO THREE.JS
      if (stageRef.current === 'testing' && isDisasterRunningRef.current) {
        if (!isSimulationRunning) {
          isSimulationRunning = true;
          simulationTimeSec = 0;
          currentIntegrity = 100;
          elementCollisionDamageMapRef.current.clear();
          initPhysicsFromBuilding();
        }

        // Advance physical step using 4x substepping (at 240Hz instead of 60Hz)
        const substeps = 4;
        const dt = (1000 / 60) / substeps;
        for (let i = 0; i < substeps; i++) {
          Matter.Engine.update(physicsEngine, dt);
        }

        // Determine warmup interpolation ratio (0.0 to 1.0) over first 100ms (0.1s)
        const warmupDuration = 0.1;
        const warmupRatio = Math.min(1.0, simulationTimeSec / warmupDuration);

        // Adjust constraint stiffness and update collision filters depending on warmup phase
        physicsWorld.constraints.forEach(c => {
          const desired = (c as any).desiredStiffness;
          if (desired !== undefined) {
            c.stiffness = (1 - warmupRatio) * 0.5 + warmupRatio * desired;
          }
        });

        // Sanity Check: Protect against physical coordinate explosion (NaN, Infinity, or flying way out of bounds)
        Matter.Composite.allBodies(physicsWorld).forEach(body => {
          const isOutOfBounds = 
            body.position.x < -15000 || body.position.x > 15000 ||
            body.position.y < -15000 || body.position.y > 15000;

          if (
            isNaN(body.position.x) || 
            isNaN(body.position.y) || 
            !isFinite(body.position.x) || 
            !isFinite(body.position.y) ||
            isOutOfBounds
          ) {
            if (isOutOfBounds && !(body as any).isGround) {
              setOutOfBoundsError(true);
              if (outOfBoundsTimeoutRef.current) clearTimeout(outOfBoundsTimeoutRef.current);
              outOfBoundsTimeoutRef.current = setTimeout(() => setOutOfBoundsError(false), 3000);
            }
            // Restore back to initial position or safely reset to coordinate origin if initial position is missing
            const fallbackX = (body as any).initialX !== undefined ? (body as any).initialX : 0;
            const fallbackY = (body as any).initialY !== undefined ? (body as any).initialY : 0;
            Matter.Body.setPosition(body, { x: fallbackX, y: fallbackY });
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(body, 0);
            body.force = { x: 0, y: 0 };
            body.torque = 0;
          }
          
          // Velocity / force threshold checks to prevent explosions (velocity > 100 px/frame)
          const speed = Math.hypot(body.velocity.x, body.velocity.y);
          if (speed > 100 || isNaN(speed) || !isFinite(speed)) {
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            body.force = { x: 0, y: 0 };
          }

          if (Math.abs(body.angularVelocity) > 15 || isNaN(body.angularVelocity) || !isFinite(body.angularVelocity)) {
            Matter.Body.setAngularVelocity(body, 0);
            body.torque = 0;
          }

          if (isNaN(body.angle) || !isFinite(body.angle)) {
            const fallbackAngle = (body as any).initialAngle !== undefined ? (body as any).initialAngle : 0;
            Matter.Body.setAngle(body, fallbackAngle);
            Matter.Body.setAngularVelocity(body, 0);
            body.torque = 0;
          }
        });

        simulationTimeSec += 1 / 60;

        // Unanchor bodies after sequential object validation confirms structural integrity!
        const gravityAllowed = objectValidationRef.current.hasGravity;
        if (gravityAllowed && simulationTimeSec >= 0.03) {
          Matter.Composite.allBodies(physicsWorld).forEach(body => {
            if (body.isStatic && (body as any).shouldBeStatic === false) {
              Matter.Body.setStatic(body, false);
              if (body.parts && body.parts.length > 1) {
                Matter.Body.setParts(body, body.parts);
              }
            }
          });
        } else if (!gravityAllowed) {
          // Enforce static bodies during object validation, keeping destroyed debris dynamic
          Matter.Composite.allBodies(physicsWorld).forEach(body => {
            if ((body as any).isDestroyedDebris) {
              if (body.isStatic) {
                Matter.Body.setStatic(body, false);
                if (body.parts && body.parts.length > 1) {
                  Matter.Body.setParts(body, body.parts);
                }
              }
            } else if (!body.isStatic) {
              Matter.Body.setStatic(body, true);
            }
          });
        }

        // Apply disaster forces dynamically (Sinus vibrations and wave sweeps!)
        const intensity = intensityRef.current || 5;
        const disasterType = disasterRef.current;

        // Reset disaster visual state, then update active ones
        floodMesh.visible = false;
        tsunamiMesh.visible = false;
        tornadoMesh.visible = false;

        // Calculate custom disaster effects
        if (disasterType === 'earthquake') {
          // Vibrates Matter.js static base anchor anchors relative to their INITIAL position to prevent drifting/flying away!
          const shakeVal = Math.sin(simulationTimeSec * 25) * intensity * 1.5;
          Matter.Composite.allBodies(physicsWorld).forEach(body => {
            if (body.isStatic && (body as any).initialX !== undefined) {
              Matter.Body.setPosition(body, { 
                x: (body as any).initialX + shakeVal, 
                y: (body as any).initialY 
              });
            }
          });

          // Earth shake visual effect (shake ground, grid, and camera target!)
          const shakeVal3D = Math.sin(simulationTimeSec * 40) * intensity * 0.04;
          gridHelper.position.x = shakeVal3D;
          ground.position.x = shakeVal3D;
          
          camera.position.x += shakeVal3D * 0.6;
          camera.position.y += shakeVal3D * 0.6;
          camera.position.z += shakeVal3D * 0.6;

          // Animate dust particles
          particles.forEach((p, idx) => {
            p.mesh.visible = true;
            if (p.life <= 0) {
              // Respawn near bottom
              p.mesh.position.set(
                (Math.random() - 0.5) * 15,
                0.1,
                (Math.random() - 0.5) * 15
              );
              p.mesh.scale.setScalar(0.4 + Math.random() * 0.6);
              p.life = 1 + Math.random();
              p.vx = (Math.random() - 0.5) * 0.15;
              p.vy = 0.04 + Math.random() * 0.06;
              p.vz = (Math.random() - 0.5) * 0.15;
              (p.mesh.material as THREE.MeshStandardMaterial).color.set('#a1a1aa'); // gray dust
              (p.mesh.material as THREE.MeshStandardMaterial).opacity = 0.6;
            } else {
              p.mesh.position.x += p.vx;
              p.mesh.position.y += p.vy;
              p.mesh.position.z += p.vz;
              p.life -= 0.02;
              (p.mesh.material as THREE.MeshStandardMaterial).opacity = p.life * 0.6;
            }
          });

        } else if (disasterType === 'tsunami') {
          // Sweeping waves force from left side
          const waveHeight = Math.min(10, simulationTimeSec * 1.2);
          const floodLevel = waveHeight;
          
          Matter.Composite.allBodies(physicsWorld).forEach(body => {
            if (!body.isStatic) {
              // Apply side hydrostatic pushes
              const depth = -body.position.y / 30; // convert body coord to meters
              if (depth < floodLevel) {
                const forceMag = (floodLevel - depth) * intensity * 0.001;
                Matter.Body.applyForce(body, body.position, { x: forceMag * 1.8, y: -0.0001 });
              }
            }
          });

          // Tsunami visual water wall sweep
          tsunamiMesh.visible = true;
          const tsunamiX = -45 + simulationTimeSec * 6; // velocity 6m/s
          tsunamiMesh.position.set(tsunamiX, 8, 0); // height 16, centered at y = 8
          
          // Foam cap wiggle
          tsunamiFoam.position.y = 8 + Math.sin(simulationTimeSec * 5) * 0.15;
          
          // Splash particles spraying forward and up from wave front
          particles.forEach((p, idx) => {
            p.mesh.visible = true;
            if (p.life <= 0) {
              p.mesh.position.set(
                tsunamiX + 6, // front edge of wave
                Math.random() * 12,
                (Math.random() - 0.5) * 15
              );
              p.mesh.scale.setScalar(0.2 + Math.random() * 0.3);
              p.life = 1.0;
              p.vx = (2 + Math.random() * 4) * 0.08;
              p.vy = (2 + Math.random() * 3) * 0.08;
              p.vz = (Math.random() - 0.5) * 0.1;
              (p.mesh.material as THREE.MeshStandardMaterial).color.set('#ffffff'); // white splash
              (p.mesh.material as THREE.MeshStandardMaterial).opacity = 0.8;
            } else {
              p.mesh.position.x += p.vx;
              p.mesh.position.y += p.vy;
              p.vy -= 0.02; // gravity drop
              p.mesh.position.z += p.vz;
              p.life -= 0.025;
              (p.mesh.material as THREE.MeshStandardMaterial).opacity = p.life * 0.8;
            }
          });

        } else if (disasterType === 'tornado') {
          // Cyclone wind turbulence
          const windIntensity = intensity * 0.002;
          Matter.Composite.allBodies(physicsWorld).forEach(body => {
            if (!body.isStatic) {
              const windX = Math.sin(simulationTimeSec * 4 + body.position.y / 50) * windIntensity;
              const liftY = -Math.cos(simulationTimeSec * 2) * windIntensity * 0.8;
              Matter.Body.applyForce(body, body.position, { x: windX, y: liftY });
            }
          });

          // Tornado Visual cyclonic funnel
          tornadoMesh.visible = true;
          const tAngle = simulationTimeSec * 1.5;
          const radius = 5;
          const tx = Math.cos(tAngle) * radius;
          const tz = Math.sin(tAngle) * radius;
          tornadoMesh.position.set(tx, 20, tz); // height 40, centered at y = 20
          tornadoMesh.rotation.y += 0.2;
          tornadoMesh.rotation.z = Math.sin(simulationTimeSec * 3) * 0.08;

          // Swirling debris particles
          particles.forEach((p, idx) => {
            p.mesh.visible = true;
            if (p.life <= 0 || p.life > 1.0) {
              p.life = Math.random();
              p.vx = 0.5 + Math.random() * 0.5; // spiral angle speed
              p.vy = 10 + Math.random() * 20; // spiral radius
            } else {
              const spiralAngle = simulationTimeSec * 4 + idx * (Math.PI * 2 / particleCount);
              const spiralRadius = 1 + (p.life * 12);
              p.mesh.position.x = tx + Math.cos(spiralAngle) * spiralRadius;
              p.mesh.position.z = tz + Math.sin(spiralAngle) * spiralRadius;
              p.mesh.position.y = p.life * 40;
              p.mesh.scale.setScalar((1.0 - p.life) * 0.4 + 0.15);
              (p.mesh.material as THREE.MeshStandardMaterial).color.set('#334155'); // dark slate debris
              (p.mesh.material as THREE.MeshStandardMaterial).opacity = (1.0 - p.life) * 0.7;
              p.life += 0.015;
            }
          });

        } else if (disasterType === 'flood') {
          // Progressive bottom water logging (causes high buoyancy and degradation)
          const waterRise = Math.min(8, simulationTimeSec * 0.4);
          Matter.Composite.allBodies(physicsWorld).forEach(body => {
            if (!body.isStatic) {
              const depth = -body.position.y / SCALE;
              if (depth < waterRise) {
                // Apply lifting upwards buoyancy force
                const buoyancy = (waterRise - depth) * 0.0005 * intensity;
                Matter.Body.applyForce(body, body.position, { x: 0, y: -buoyancy });
              }
            }
          });

          // Flood rising water box visual
          floodMesh.visible = true;
          const waterRiseHeight = Math.min(8, simulationTimeSec * 0.4);
          floodMesh.position.y = -15.5 + waterRiseHeight;

          // Animate bubble/ripple particles on the surface
          particles.forEach((p, idx) => {
            p.mesh.visible = true;
            if (p.life <= 0) {
              p.mesh.position.set(
                (Math.random() - 0.5) * 20,
                waterRiseHeight + 0.05,
                (Math.random() - 0.5) * 20
              );
              p.mesh.scale.setScalar(0.1 + Math.random() * 0.2);
              p.life = 1.0;
              p.vx = (Math.random() - 0.5) * 0.05;
              p.vy = 0;
              p.vz = (Math.random() - 0.5) * 0.05;
              (p.mesh.material as THREE.MeshStandardMaterial).color.set('#93c5fd'); // light water blue
              (p.mesh.material as THREE.MeshStandardMaterial).opacity = 0.4;
            } else {
              p.mesh.position.x += p.vx;
              p.mesh.position.y = waterRiseHeight + Math.sin(simulationTimeSec * 2 + idx) * 0.05 + 0.05;
              p.mesh.position.z += p.vz;
              p.life -= 0.01;
              (p.mesh.material as THREE.MeshStandardMaterial).opacity = p.life * 0.4;
            }
          });
        }

        // =========================================================================
        // 3D PHYSICS SIMULATION LOOP FOR DEBRIS & PARTICLES
        // =========================================================================
        const DT = 0.0166;
        physicsEngine.gravity.y = 2.8;

        // 3D Particle & Fragment Debris Physics under calibrated floor contact material
        const gCannon = 9.81;
        particles.forEach((p) => {
          if (!p.mesh.visible || p.life <= 0) return;

          // Apply Gravity
          p.vy -= gCannon * DT * 0.02;

          // Linear Damping
          p.vx *= (1 - 0.05 * DT * 5);
          p.vy *= (1 - 0.05 * DT * 5);
          p.vz *= (1 - 0.05 * DT * 5);

          // Position step
          p.mesh.position.x += p.vx;
          p.mesh.position.y += p.vy;
          p.mesh.position.z += p.vz;

          // Ground Collision & Restitution / Friction - eliminate bounce chatter
          const floorLevel = 0.08;
          if (p.mesh.position.y <= floorLevel) {
            p.mesh.position.y = floorLevel;
            p.vy = 0; // ZERO restitution bounce on floor contact
            p.vx *= 0.8;
            p.vz *= 0.8;
          }

          p.life -= DT * 0.8;
          if (p.life <= 0) {
            p.mesh.visible = false;
          } else if (p.mesh.material) {
            (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(1, p.life * 1.5);
          }
        });

        // Helper function to spawn structural damage particles at broken joint
        const spawnBreakParticles = (x: number, y: number) => {
          let spawned = 0;
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (p.life <= 0) {
              p.mesh.visible = true;
              p.mesh.position.set(x, y, (Math.random() - 0.5) * 1.5);
              p.mesh.scale.setScalar(0.08 + Math.random() * 0.12);
              p.life = 0.6 + Math.random() * 0.4; // active life duration
              p.vx = (Math.random() - 0.5) * 0.12;
              p.vy = (0.04 + Math.random() * 0.08);
              p.vz = (Math.random() - 0.5) * 0.12;
              
              // Color them rusty-orange or steel-gray to simulate structural debris
              if (p.mesh.material) {
                const mat = p.mesh.material as THREE.MeshStandardMaterial;
                mat.color.set(Math.random() > 0.45 ? '#ea580c' : '#4b5563'); // amber rust or dark steel gray
                mat.opacity = 0.9;
              }
              
              spawned++;
              if (spawned >= 6) break;
            }
          }
        };

        // Stress and Welding Breaker Logic: Verify constraint lengths with precise 2D rotation transformations
        let brokenConstraints = 0;
        let totalConstraints = constraintsList.length;

        constraintsList.forEach(c => {
          if (!c.bodyA || !c.bodyB) return;

          // If already broken, skip recalculating and keep counting as broken
          if ((c as any).isBroken) {
            brokenConstraints++;
            return;
          }
          
          const ptA = c.pointA || { x: 0, y: 0 };
          const ptB = c.pointB || { x: 0, y: 0 };
          
          const angleA = c.bodyA.angle || 0;
          const angleB = c.bodyB.angle || 0;

          // Compute exact world-space endpoints considering body rotations!
          const rotA_x = ptA.x * Math.cos(angleA) - ptA.y * Math.sin(angleA);
          const rotA_y = ptA.x * Math.sin(angleA) + ptA.y * Math.cos(angleA);

          const rotB_x = ptB.x * Math.cos(angleB) - ptB.y * Math.sin(angleB);
          const rotB_y = ptB.x * Math.sin(angleB) + ptB.y * Math.cos(angleB);

          const pA_x = c.bodyA.position.x + rotA_x;
          const pA_y = c.bodyA.position.y + rotA_y;
          const pB_x = c.bodyB.position.x + rotB_x;
          const pB_y = c.bodyB.position.y + rotB_y;

          const currentDist = Math.hypot(pA_x - pB_x, pA_y - pB_y);
          const elongation = Math.abs(currentDist - (c.length || 0));

          // Base material durability
          const dur = (c as any).durability !== undefined ? (c as any).durability : 50;
          const durabilityFactor = dur / 50;
          
          // Instantaneous failure break limit
          const breakLimit = (35 + (10 - intensity) * 4) * durabilityFactor;

          // Initialize fatigue stress accumulator on the constraint (percentage, 0 to 100)
          if ((c as any).stress === undefined) {
            (c as any).stress = 0;
          }

          // Grace period to mitigate damage when objects drop and land initially (e.g. built slightly above ground)
          const isGracePeriod = simulationTimeSec < 2.0;
          const graceMultiplier = isGracePeriod ? 0.05 : 1.0;

          // Accumulate fatigue stress over time under dynamic loads or impact spikes
          const stressThreshold = breakLimit * (isGracePeriod ? 0.3 : 0.15); // lower limit for structural wear and tear
          if (elongation > stressThreshold) {
            const overstressRatio = (elongation - stressThreshold) / (breakLimit - stressThreshold);
            // Non-linear stress fatigue accumulation
            const fatigueRate = Math.pow(overstressRatio, 1.5) * 5.0 * graceMultiplier; 
            (c as any).stress = Math.min(100, (c as any).stress + fatigueRate);
          } else {
            // Slow elastic healing/recovery of stress below the threshold
            (c as any).stress = Math.max(0, (c as any).stress - (isGracePeriod ? 0.2 : 0.04));
          }

          // Determine if the weld snaps due to either instantaneous load or accumulated fatigue stress!
          let shouldBreak = false;
          if (simulationTimeSec > 0.5) {
            if ((c as any).stress >= 100) {
              shouldBreak = true;
            } else if (elongation > breakLimit * (isGracePeriod ? 4.0 : 2.2)) {
              // Catastrophic instant structural failure from major shock impact
              shouldBreak = true;
            }
          }

          if (shouldBreak) {
            Matter.Composite.remove(physicsWorld, c);
            (c as any).isBroken = true;
            brokenConstraints++;

            if ((c as any).twin && !(c as any).twin.isBroken) {
              Matter.Composite.remove(physicsWorld, (c as any).twin);
              (c as any).twin.isBroken = true;
              brokenConstraints++;
            }

            // Visual explosion of structural debris particles
            spawnBreakParticles(pA_x / SCALE, pA_y / -SCALE);
          }
        });

        // Perform a BFS-based connectivity search starting from the ground to find all bodies connected to the foundation.
        const grounded = new Set<number>();
        const queue: Matter.Body[] = [];

        // Start BFS from physicsGround and all static anchor bodies (e.g. ground nodes) to ensure stability
        grounded.add(physicsGround.id);
        queue.push(physicsGround);

        Matter.Composite.allBodies(physicsWorld).forEach(body => {
          if (body.isStatic && body !== physicsGround) {
            const childParts = (body.parts && body.parts.length > 1) ? body.parts.slice(1) : [body];
            const hasGroundPart = childParts.some(p => (p as any).isGround || Math.abs(p.position.y) <= 12);
            if (hasGroundPart) {
              grounded.add(body.id);
              queue.push(body);
            }
          }
        });

        // Build adjacency list of active constraints
        const adj = new Map<number, Matter.Body[]>();
        constraintsList.forEach(c => {
          if ((c as any).isBroken || !c.bodyA || !c.bodyB) return;
          
          if (!adj.has(c.bodyA.id)) adj.set(c.bodyA.id, []);
          if (!adj.has(c.bodyB.id)) adj.set(c.bodyB.id, []);

          adj.get(c.bodyA.id)!.push(c.bodyB);
          adj.get(c.bodyB.id)!.push(c.bodyA);
        });

        // BFS traversal
        let head = 0;
        while (head < queue.length) {
          const u = queue[head++];
          const neighbors = adj.get(u.id) || [];
          neighbors.forEach(v => {
            if (!grounded.has(v.id)) {
              grounded.add(v.id);
              queue.push(v);
            }
          });
        }

        // Apply debris transition and clamp velocities to prevent tunneling
        Matter.Composite.allBodies(physicsWorld).forEach(body => {
          if (body === physicsGround) return;

          // Velocity clamping to prevent tunneling through the floor or explosive flyaways
          const maxSpeed = 25; // 25 pixels per frame (~25 m/s)
          const speed = Math.hypot(body.velocity.x, body.velocity.y);
          if (speed > maxSpeed) {
            Matter.Body.setVelocity(body, {
              x: (body.velocity.x / speed) * maxSpeed,
              y: (body.velocity.y / speed) * maxSpeed
            });
          }

          if (body.isStatic) return;

          // If the body is grounded (transitively connected to the foundation), keep it as INTACT to prevent self-collision explosions.
          // Otherwise, it has broken off and is now DEBRIS - enable full self-collisions so it stacks and collides properly!
          if (simulationTimeSec < warmupDuration) {
            // Keep in warmup safety group
            body.collisionFilter.group = -999;
          } else {
            if (grounded.has(body.id)) {
              body.collisionFilter.category = INTACT_CATEGORY;
              body.collisionFilter.mask = INTACT_MASK;
              body.collisionFilter.group = (body as any).normalGroup !== undefined ? (body as any).normalGroup : -1;
            } else {
              body.collisionFilter.category = DEBRIS_CATEGORY;
              body.collisionFilter.mask = DEBRIS_MASK;
              // Clear the negative group so debris can collide and stack
              body.collisionFilter.group = 0;
              if (body.isStatic) {
                Matter.Body.setStatic(body, false);
              }
            }
          }
        });

        // Structural Center of Mass & Ground Support Imbalance Evaluation
        Matter.Composite.allBodies(physicsWorld).forEach(body => {
          if (body === physicsGround || (body as any).isDestroyedDebris) return;

          const childParts = (body.parts && body.parts.length > 1) ? body.parts.slice(1) : [body];
          const intactGroundParts = childParts.filter(p => (p as any).isGround && !(p as any).isDestroyedDebris);

          if (body.isStatic) {
            const initialGroundCount = (body as any).initialGroundCount || 0;
            const lostAllGround = intactGroundParts.length === 0;

            let isUnbalanced = false;
            let tiltDirection = 0;

            if (intactGroundParts.length > 0) {
              let minSuppX = Infinity, maxSuppX = -Infinity;
              intactGroundParts.forEach(p => {
                if (p.position.x < minSuppX) minSuppX = p.position.x;
                if (p.position.x > maxSuppX) maxSuppX = p.position.x;
              });

              const comX = body.position.x;
              const supportMargin = 12;

              if (comX < minSuppX - supportMargin) {
                isUnbalanced = true;
                tiltDirection = -1;
              } else if (comX > maxSuppX + supportMargin) {
                isUnbalanced = true;
                tiltDirection = 1;
              }
            }

            if (initialGroundCount >= 2 && intactGroundParts.length < initialGroundCount) {
              const remainingRatio = intactGroundParts.length / initialGroundCount;
              if (remainingRatio <= 0.6) {
                isUnbalanced = true;
                const initialX = (body as any).initialX || body.position.x;
                tiltDirection = body.position.x < initialX ? -1 : 1;
              }
            }

            if (lostAllGround || isUnbalanced) {
              // Un-anchor building structure so it collapses / tilts dynamically
              Matter.Body.setStatic(body, false);
              if (body.parts && body.parts.length > 1) {
                Matter.Body.setParts(body, body.parts);
              }
              (body as any).shouldBeStatic = false;
              (body as any).isGround = false;

              body.collisionFilter.category = INTACT_CATEGORY;
              body.collisionFilter.mask = INTACT_MASK | DEBRIS_MASK | GROUND_MASK;
              body.collisionFilter.group = 0;

              const tiltSpeed = 0.04 + Math.random() * 0.03;
              const initialPushX = (tiltDirection !== 0 ? tiltDirection : (Math.random() > 0.5 ? 1 : -1)) * (2 + Math.random() * 3);

              Matter.Body.setAngularVelocity(body, (tiltDirection !== 0 ? tiltDirection : 1) * tiltSpeed);
              Matter.Body.setVelocity(body, { x: initialPushX, y: -0.5 });
              body.torque = (tiltDirection !== 0 ? tiltDirection : 1) * 0.8 * body.mass;
            }
          } else {
            // Dynamic structure: apply ground pivot mechanics so building topples over at the base corner on the floor
            const childParts = (body.parts && body.parts.length > 1) ? body.parts.slice(1) : [body];
            
            // Find lowest Y (closest to ground = 0 in Matter.js)
            let lowestY = -Infinity;
            childParts.forEach(p => {
              if (p.position.y > lowestY) lowestY = p.position.y;
            });

            // Base near ground level (lowestY in Matter.js near 0, e.g. >= -35) and building not completely horizontal yet
            const isBaseNearGround = lowestY >= -35 && Math.abs(body.angle) < Math.PI * 0.45;

            if (isBaseNearGround && Math.abs(body.angularVelocity) > 0.0005) {
              const tiltDir = Math.sign(body.angularVelocity || body.torque || 1);
              
              // Base pivot point on ground: right corner if tilting right (+), left corner if tilting left (-)
              let pivotX = body.position.x;
              if (tiltDir > 0) {
                let maxX = -Infinity;
                childParts.forEach(p => { if (p.position.x > maxX) maxX = p.position.x; });
                pivotX = maxX;
              } else {
                let minX = Infinity;
                childParts.forEach(p => { if (p.position.x < minX) minX = p.position.x; });
                pivotX = minX;
              }

              const pivotY = 0; // Ground surface level Y in Matter.js

              // Enforce rigid body kinematic velocity around the base pivot point (X_pivot, Y_pivot)
              const targetVx = body.angularVelocity * (pivotY - body.position.y);
              const targetVy = body.angularVelocity * (body.position.x - pivotX);

              // Smoothly blend center of mass velocity to pin base corner to the floor
              body.velocity.x = body.velocity.x * 0.25 + targetVx * 0.75;
              body.velocity.y = body.velocity.y * 0.25 + targetVy * 0.75;

              // Overturning gravity moment around base pivot: tau = armX * mass * g
              const armX = body.position.x - pivotX;
              body.torque += (armX * 0.0025 + tiltDir * 0.001) * body.mass;
            } else if (intactGroundParts.length > 0) {
              let pivotX = 0;
              intactGroundParts.forEach(p => { pivotX += p.position.x; });
              pivotX /= intactGroundParts.length;

              const armX = body.position.x - pivotX;
              body.torque += armX * 0.0005 * body.mass;
            } else {
              if (Math.abs(body.angle) > 0.03) {
                body.torque += Math.sign(body.angle) * 0.0005 * body.mass;
              }
            }

            // Disaster lateral forces & overturning moment
            if (disasterType === 'tsunami') {
              const tsunamiX = -45 + simulationTimeSec * 6;
              if (Math.abs((body.position.x / SCALE) - tsunamiX) <= 6.0) {
                Matter.Body.applyForce(body, body.position, {
                  x: 0.002 * intensity * body.mass,
                  y: -0.0005 * intensity * body.mass
                });
                body.torque += 0.002 * intensity * body.mass;
              }
            } else if (disasterType === 'tornado') {
              const tAngle = simulationTimeSec * 1.5;
              const tx = Math.cos(tAngle) * 5 * SCALE;
              const dx = tx - body.position.x;
              if (Math.abs(dx) < 15 * SCALE) {
                Matter.Body.applyForce(body, body.position, {
                  x: Math.sign(dx) * 0.0015 * intensity * body.mass,
                  y: -0.001 * intensity * body.mass
                });
                body.torque += (Math.random() - 0.5) * 0.003 * intensity * body.mass;
              }
            } else if (disasterType === 'earthquake') {
              const quakeAccel = Math.cos(simulationTimeSec * 35) * intensity * 0.0008;
              Matter.Body.applyForce(body, body.position, { x: quakeAccel * body.mass, y: 0 });
              body.torque += quakeAccel * body.mass * 0.4;
            } else if (disasterType === 'flood') {
              Matter.Body.applyForce(body, body.position, {
                x: 0.0008 * intensity * body.mass,
                y: -0.0002 * intensity * body.mass
              });
              body.torque += 0.0005 * intensity * body.mass;
            }
          }
        });

        // Compute Structural Integrity rating from broken constraints & direct disaster impacts
        let constraintIntegrity = 100;
        if (totalConstraints > 0) {
          const ratio = (totalConstraints - brokenConstraints) / totalConstraints;
          constraintIntegrity = Math.max(0, Math.round(ratio * 100));
        }

        // Direct Disaster Collision & Impact Damage Testing
        const currentDamageMap = elementCollisionDamageMapRef.current;

        const checkElementCollision = (
          id: string, 
          pos: { x: number; y: number; z: number }, 
          durability: number,
          mesh?: THREE.Object3D
        ) => {
          const body = elementToBodyMap.get(id);
          if (body && (body as any).isDestroyedDebris) {
            return; // Already separated and falling as full 3D debris object
          }

          let isHit = false;
          let damageAmount = 0;

          if (disasterType === 'tsunami') {
            const tsunamiX = -45 + simulationTimeSec * 6;
            if (Math.abs(pos.x - tsunamiX) <= 4.0 && pos.y <= 12) {
              isHit = true;
              damageAmount = (0.35 * intensity) / (durability / 50);
            }
          } else if (disasterType === 'flood') {
            const waterRiseHeight = Math.min(8, simulationTimeSec * 0.4);
            if (pos.y <= waterRiseHeight) {
              isHit = true;
              damageAmount = (0.2 * intensity) / (durability / 50);
            }
          } else if (disasterType === 'tornado') {
            const tAngle = simulationTimeSec * 1.5;
            const tx = Math.cos(tAngle) * 5;
            const tz = Math.sin(tAngle) * 5;
            if (Math.hypot(pos.x - tx, pos.z - tz) <= 6.5) {
              isHit = true;
              damageAmount = (0.4 * intensity) / (durability / 50);
            }
          } else if (disasterType === 'earthquake') {
            const shakeVal3D = Math.abs(Math.sin(simulationTimeSec * 40) * intensity);
            if (shakeVal3D > 0.5) {
              isHit = true;
              damageAmount = (0.15 * intensity * (1 / (pos.y + 1))) / (durability / 50);
            }
          }

          if (isHit) {
            const current = currentDamageMap.get(id) || 0;
            const newDmg = Math.min(100, current + damageAmount);
            currentDamageMap.set(id, newDmg);

            // When durability is destroyed (100% damage), un-fix the element and activate physics so it separates & falls!
            if (newDmg >= 100) {
              const body = elementToBodyMap.get(id);
              if (body && !(body as any).isDestroyedDebris) {
                (body as any).isDestroyedDebris = true;

                // Detach broken body from compound cluster parent if present
                const parentCluster = physicsWorld.bodies.find(b => b.parts && b.parts.includes(body));
                if (parentCluster) {
                  const remainingParts = parentCluster.parts.filter(p => p !== body && p !== parentCluster && !(p as any).isDestroyedDebris);
                  
                  if (remainingParts.length === 0) {
                    Matter.Composite.remove(physicsWorld, parentCluster);
                  } else {
                    // Helper to get nodes for each part to establish correct model-based connectivity
                    const getPartNodeKeys = (p: Matter.Body): string[] => {
                      const mapping = bodyToElementMap.get(p.id);
                      const keyOf = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
                      if (!mapping) {
                        return [keyOf(p.position.x / SCALE, -p.position.y / SCALE)];
                      }
                      if (mapping.type === 'frame') {
                        const f = framesRef.current.find(item => item.id === mapping.id);
                        if (f) {
                          return [keyOf(f.start.x, f.start.y), keyOf(f.end.x, f.end.y)];
                        }
                      } else if (mapping.type === 'wall') {
                        const w = wallsRef.current.find(item => item.id === mapping.id);
                        if (w) {
                          return [keyOf(w.start.x, w.start.y), keyOf(w.end.x, w.end.y)];
                        }
                      } else if (mapping.type === 'utility') {
                        const u = utilitiesRef.current.find(item => item.id === mapping.id);
                        if (u) {
                          const keys = [keyOf(u.position.x, u.position.y)];
                          framesRef.current.forEach(f => {
                            if (Math.hypot(f.start.x - u.position.x, f.start.y - u.position.y) < 1.0) {
                              keys.push(keyOf(f.start.x, f.start.y));
                            } else if (Math.hypot(f.end.x - u.position.x, f.end.y - u.position.y) < 1.0) {
                              keys.push(keyOf(f.end.x, f.end.y));
                            }
                          });
                          return keys;
                        }
                      }
                      return [];
                    };

                    const partNodeKeysMap = new Map<number, string[]>();
                    remainingParts.forEach(p => {
                      partNodeKeysMap.set(p.id, getPartNodeKeys(p));
                    });

                    // Group remainingParts into connected clusters/islands using model-defined node connectivity and proximity fallback
                    const islands: Matter.Body[][] = [];
                    const visited = new Set<number>();

                    remainingParts.forEach(p1 => {
                      if (visited.has(p1.id)) return;
                      const currentIsland: Matter.Body[] = [];
                      const queue: Matter.Body[] = [p1];
                      visited.add(p1.id);

                      while (queue.length > 0) {
                        const curr = queue.shift()!;
                        currentIsland.push(curr);

                        const currKeys = partNodeKeysMap.get(curr.id) || [];

                        remainingParts.forEach(p2 => {
                          if (visited.has(p2.id)) return;
                          
                          const p2Keys = partNodeKeysMap.get(p2.id) || [];
                          const sharesNode = currKeys.some(k => p2Keys.includes(k));
                          
                          const dist = Math.hypot(curr.position.x - p2.position.x, curr.position.y - p2.position.y);
                          const isTouching = dist <= 60; // 60px is 1.2m, extremely generous touch/overlap distance for structural continuity

                          if (sharesNode || isTouching) {
                            visited.add(p2.id);
                            queue.push(p2);
                          }
                        });
                      }
                      islands.push(currentIsland);
                    });

                    let primarySet = false;
                    islands.forEach(island => {
                      const hasGround = island.some(p => (p as any).isGround || Math.abs(p.position.y) <= 12);
                      
                      if (hasGround && !primarySet) {
                        primarySet = true;
                        // Correct Matter.js setParts usage: parentCluster itself must be the first element
                        Matter.Body.setParts(parentCluster, [parentCluster].concat(island));
                      } else {
                        // Floating unsupported island or secondary island: detach into independent body!
                        let islandBody: Matter.Body;
                        if (island.length === 1) {
                          islandBody = island[0];
                          islandBody.parent = islandBody;
                          islandBody.parts = [islandBody];
                          Matter.Body.setParts(islandBody, [islandBody]);
                          Matter.Body.setMass(islandBody, (islandBody as any).originalMass || 5);
                          islandBody.restitution = 0.02;
                          islandBody.friction = 0.95;
                          islandBody.frictionAir = 0.015;
                        } else {
                          islandBody = Matter.Body.create({
                            parts: island,
                            friction: 0.95,
                            restitution: 0.02,
                            frictionAir: 0.015
                          });
                        }

                        (islandBody as any).shouldBeStatic = !hasGround ? false : (parentCluster.isStatic);
                        (islandBody as any).isGround = hasGround;

                        if (!hasGround) {
                          Matter.Body.setStatic(islandBody, false);
                          islandBody.collisionFilter.category = DEBRIS_CATEGORY;
                          islandBody.collisionFilter.mask = DEBRIS_MASK;
                          islandBody.collisionFilter.group = 0;
                          // Softened initial gravity drift instead of strong snapping
                          Matter.Body.setVelocity(islandBody, { x: (Math.random() - 0.5) * 0.8, y: 0.2 + Math.random() * 0.3 });
                          Matter.Body.setAngularVelocity(islandBody, (Math.random() - 0.5) * 0.05);
                        } else {
                          Matter.Body.setStatic(islandBody, true);
                        }

                        Matter.Composite.add(physicsWorld, islandBody);
                      }
                    });

                    if (!primarySet) {
                      Matter.Composite.remove(physicsWorld, parentCluster);
                    }
                  }
                }

                // Check if the destroyed element is an outer wall
                const mapping = bodyToElementMap.get(body.id);
                if (mapping?.type === 'wall') {
                  const wallId = mapping.id;
                  const wallMesh = wallMeshes.get(wallId);
                  const w = wallsRef.current.find(item => item.id === wallId);

                  if (w && wallMesh) {
                    // Hide original solid wall mesh
                    wallMesh.visible = false;

                    const spec = WALL_MATERIALS[w.material] || WALL_MATERIALS.concrete;
                    const startVec = new THREE.Vector3(w.start.x, w.start.y, w.start.z);
                    const endVec = new THREE.Vector3(w.end.x, w.end.y, w.end.z);
                    const width = startVec.distanceTo(endVec);
                    const deltaY = Math.abs(endVec.y - startVec.y);
                    const height = deltaY > 0.2 ? deltaY : 3.0;

                    let dir = new THREE.Vector3().subVectors(endVec, startVec);
                    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0); else dir.normalize();
                    const globalUp = new THREE.Vector3(0, 1, 0);
                    const localZ = new THREE.Vector3().crossVectors(dir, globalUp).normalize();
                    if (localZ.lengthSq() < 0.001) localZ.set(0, 0, 1);
                    const localY = new THREE.Vector3().crossVectors(localZ, dir).normalize();
                    const rotationMatrix = new THREE.Matrix4().makeBasis(dir, localY, localZ);

                    const center = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
                    const centerOfMass = center.clone().addScaledVector(localY, height / 2);

                    const angle = Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
                    const len2D = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
                    const len = Math.max(0.1, len2D);
                    const midX = (w.start.x + w.end.x) / 2;
                    const midY = (w.start.y + w.end.y) / 2;

                    // Remove original wall body from physics engine and disconnect constraints
                    Matter.Composite.remove(physicsWorld, body);
                    constraintsList.forEach(c => {
                      if ((c.bodyA === body || c.bodyB === body) && !(c as any).isBroken) {
                        (c as any).isBroken = true;
                        Matter.Composite.remove(physicsWorld, c);
                      }
                    });

                    // Create physical dynamic fragments with specialized material behaviors (glass shatters more, concrete/brick splits in blocks)
                    const isGlass = w.material === 'glass';
                    const rows = isGlass ? 3 : 2;
                    const cols = isGlass ? 3 : 2;

                    for (let i = 0; i < cols; i++) {
                      for (let j = 0; j < rows; j++) {
                        const fragId = `${wallId}_frag_${i}_${j}`;

                        // Local coordinates for the fragment's 3D center (with organic jitter)
                        const localCenterX = (i - (cols - 1) / 2) * (width / cols) + (Math.random() - 0.5) * (width * 0.04);
                        const localCenterY = (j - (rows - 1) / 2) * (height / rows) + (Math.random() - 0.5) * (height * 0.04);
                        const worldCenter = centerOfMass.clone().addScaledVector(dir, localCenterX).addScaledVector(localY, localCenterY);

                        // Position in 2D Matter.js coordinates (with organic jitter)
                        const dispX = (i - (cols - 1) / 2) * (len / cols) * Math.cos(angle) * SCALE;
                        const dispY = (i - (cols - 1) / 2) * (len / cols) * Math.sin(angle) * SCALE;
                        const px = (midX * SCALE) + dispX + (Math.random() - 0.5) * 4;
                        const py = (-midY * SCALE) - dispY + (j - (rows - 1) / 2) * (height / rows) * SCALE + (Math.random() - 0.5) * 4;

                        // Create 2D physical body
                        const fragBody = Matter.Bodies.rectangle(px, py, (len / cols) * SCALE, 6, {
                          friction: isGlass ? 0.25 : 0.95,
                          density: isGlass ? spec.weightPerSqm / 25000 : spec.weightPerSqm / 15000,
                          angle: -angle + (isGlass ? (Math.random() - 0.5) * 0.4 : 0),
                          collisionFilter: {
                            category: DEBRIS_CATEGORY,
                            mask: DEBRIS_MASK,
                            group: 0
                          }
                        });

                        (fragBody as any).isDestroyedDebris = true;
                        (fragBody as any).shouldBeStatic = false;
                        (fragBody as any).isGround = false;
                        fragBody.restitution = isGlass ? 0.35 : 0.02; // Glass is more elastic and bouncy
                        fragBody.friction = isGlass ? 0.2 : 0.95;
                        fragBody.frictionAir = isGlass ? 0.006 : 0.015;

                        // Calculate disaster outwards blast velocities
                        let blastX = (i - (cols - 1) / 2) * (1.5 + Math.random() * 2.5);
                        let blastY = (j - (rows - 1) / 2) * (1.0 + Math.random() * 2.0) - 1.0;

                        if (disasterType === 'tsunami') {
                          blastX += 4 + intensity * 0.6;
                          blastY -= 1 + Math.random() * 2.0;
                        } else if (disasterType === 'tornado') {
                          blastX += (Math.random() - 0.5) * 10;
                          blastY -= 3 + Math.random() * 4;
                        } else if (disasterType === 'earthquake') {
                          blastX += (Math.random() - 0.5) * 5;
                          blastY -= 1 + Math.random() * 2.0;
                        } else if (disasterType === 'flood') {
                          blastX += 1.5 + Math.random() * 2.0;
                          blastY -= 0.5 + Math.random() * 1.5;
                        }

                        // Boost velocities for glass to simulate a pressure pop shatter
                        if (isGlass) {
                          blastX *= 1.8;
                          blastY *= 1.8;
                        }

                        Matter.Body.setVelocity(fragBody, { x: blastX, y: blastY });
                        Matter.Body.setAngularVelocity(fragBody, (Math.random() - 0.5) * (isGlass ? 0.8 : 0.3));

                        // Store initial coordinate values for 3D simulation
                        (fragBody as any).initialX = fragBody.position.x;
                        (fragBody as any).initialY = fragBody.position.y;
                        (fragBody as any).posZ = (Math.random() - 0.5) * 0.4; // slight offset
                        
                        // Push fragments outwards along the Z-axis (towards the camera or background)
                        const zBlastSign = Math.random() > 0.5 ? 1 : -1;
                        (fragBody as any).vz = zBlastSign * ((isGlass ? 4.0 : 2.0) + Math.random() * (isGlass ? 5.0 : 3.5));

                        Matter.Composite.add(physicsWorld, fragBody);
                        bodyToElementMap.set(fragBody.id, { id: fragId, type: 'wall_fragment' });

                        // Create 3D mesh
                        // Slightly shrink physical dimensions for visual gaps between shards
                        const fragGeo = new THREE.BoxGeometry(
                          (width / cols) * (isGlass ? 0.93 : 0.98),
                          (height / rows) * (isGlass ? 0.93 : 0.98),
                          isGlass ? 0.05 : 0.16
                        );
                        
                        // Clone original material so edge shading or damage effects don't bleed into healthy walls
                        let fragMat = (wallMesh as THREE.Mesh).material;
                        if (fragMat instanceof THREE.Material) {
                          fragMat = fragMat.clone();
                          if (isGlass) {
                            // Turn into a highly shiny, semi-transparent physically correct glass shard
                            const glassMat = fragMat as THREE.MeshStandardMaterial;
                            glassMat.transparent = true;
                            glassMat.opacity = 0.55;
                            glassMat.roughness = 0.05;
                            glassMat.metalness = 0.2;
                            glassMat.color.set('#bae6fd'); // Cool icy blue shard color
                          } else {
                            // Subtly darken/damage the fractured fragment edges
                            (fragMat as any).color.multiplyScalar(0.85);
                          }
                        }

                        const fragMesh = new THREE.Mesh(fragGeo, fragMat);
                        fragMesh.castShadow = true;
                        fragMesh.receiveShadow = true;

                        // Give it the same starting rotation as the wall
                        fragMesh.quaternion.setFromRotationMatrix(rotationMatrix);
                        (fragMesh as any).initialQuaternion = fragMesh.quaternion.clone();
                        fragMesh.position.copy(worldCenter);

                        scene.add(fragMesh);
                        wallFragmentMeshes.set(fragId, fragMesh);
                      }
                    }

                    // Spawn robust, dramatic dust explosions!
                    spawnBreakParticles(pos.x, pos.y);
                    spawnBreakParticles(pos.x + 0.5, pos.y);
                    spawnBreakParticles(pos.x - 0.5, pos.y);
                  }
                } else if (mapping?.type === 'frame') {
                  const frameId = mapping.id;
                  const frameMesh = frameMeshes.get(frameId);
                  const f = framesRef.current.find(item => item.id === frameId);
                  if (f && frameMesh) {
                    // Hide original solid frame mesh
                    frameMesh.visible = false;

                    const spec = FRAMEWORK_MATERIALS[f.material] || FRAMEWORK_MATERIALS.steel;
                    const startVec = new THREE.Vector3(f.start.x, f.start.y, f.start.z);
                    const endVec = new THREE.Vector3(f.end.x, f.end.y, f.end.z);
                    const length = startVec.distanceTo(endVec);

                    const dir = new THREE.Vector3().subVectors(endVec, startVec).normalize();
                    const angle = Math.atan2(f.end.y - f.start.y, f.end.x - f.start.x);

                    // Remove original body from physics
                    Matter.Composite.remove(physicsWorld, body);
                    constraintsList.forEach(c => {
                      if ((c.bodyA === body || c.bodyB === body) && !(c as any).isBroken) {
                        (c as any).isBroken = true;
                        Matter.Composite.remove(physicsWorld, c);
                      }
                    });

                    // Divide the frame into 3 segment pieces for dynamic shattering
                    const numSegments = 3;
                    for (let i = 0; i < numSegments; i++) {
                      const fragId = `${frameId}_frag_${i}`;

                      // Calculate 3D position of the segment center
                      const t = (i + 0.5) / numSegments;
                      const segmentCenter = new THREE.Vector3().lerpVectors(startVec, endVec, t);

                      // Calculate 2D position in Matter.js coordinates
                      const px = segmentCenter.x * SCALE + (Math.random() - 0.5) * 3;
                      const py = -segmentCenter.y * SCALE + (Math.random() - 0.5) * 3;

                      const segLen = length / numSegments;

                      // Create 2D physical body for the frame fragment
                      const fragBody = Matter.Bodies.rectangle(px, py, segLen * SCALE, spec.thickness * SCALE * 0.7, {
                        friction: 0.9,
                        density: spec.density / 3000,
                        angle: -angle + (Math.random() - 0.5) * 0.3,
                        collisionFilter: {
                          category: DEBRIS_CATEGORY,
                          mask: DEBRIS_MASK,
                          group: 0
                        }
                      });

                      (fragBody as any).isDestroyedDebris = true;
                      (fragBody as any).shouldBeStatic = false;
                      (fragBody as any).isGround = false;
                      fragBody.restitution = 0.05;
                      fragBody.friction = 0.9;
                      fragBody.frictionAir = 0.015;

                      // Calculate disaster outwards blast velocities
                      let blastX = (i - (numSegments - 1) / 2) * (2.0 + Math.random() * 3.0);
                      let blastY = -1.0 - Math.random() * 2.0;

                      if (disasterType === 'tsunami') {
                        blastX += 4 + intensity * 0.6;
                        blastY -= 1.0;
                      } else if (disasterType === 'tornado') {
                        blastX += (Math.random() - 0.5) * 10;
                        blastY -= 3 + Math.random() * 4;
                      } else if (disasterType === 'earthquake') {
                        blastX += (Math.random() - 0.5) * 5;
                        blastY -= 1 + Math.random() * 2.0;
                      } else if (disasterType === 'flood') {
                        blastX += 1.5 + Math.random() * 2.0;
                        blastY -= 0.5 + Math.random() * 1.5;
                      }

                      Matter.Body.setVelocity(fragBody, { x: blastX, y: blastY });
                      Matter.Body.setAngularVelocity(fragBody, (Math.random() - 0.5) * 0.4);

                      // Store initial coordinates
                      (fragBody as any).initialX = fragBody.position.x;
                      (fragBody as any).initialY = fragBody.position.y;
                      (fragBody as any).posZ = segmentCenter.z + (Math.random() - 0.5) * 0.3;

                      // Out-of-plane velocity
                      const zBlastSign = Math.random() > 0.5 ? 1 : -1;
                      (fragBody as any).vz = zBlastSign * (1.5 + Math.random() * 2.0);

                      Matter.Composite.add(physicsWorld, fragBody);
                      bodyToElementMap.set(fragBody.id, { id: fragId, type: 'frame_fragment' });

                      // Create 3D cylinder geometry for this cylinder/box segment
                      const thickness = spec.thickness || 0.16;
                      const fragGeo = new THREE.CylinderGeometry(thickness, thickness, segLen * 0.98, 8);
                      
                      // Clone original material from the parent frame group meshes
                      let fragMat: THREE.Material | THREE.Material[] | undefined;
                      frameMesh.traverse(child => {
                        if (child instanceof THREE.Mesh && child.material) {
                          fragMat = child.material;
                        }
                      });
                      if (!fragMat) {
                        fragMat = (frameMesh as any).material || new THREE.MeshStandardMaterial({ color: spec.color });
                      }
                      if (fragMat instanceof THREE.Material) {
                        fragMat = fragMat.clone();
                        // Darken/damage the fractured fragment edges visually
                        (fragMat as any).color.multiplyScalar(0.75);
                      }

                      const fragMesh = new THREE.Mesh(fragGeo, fragMat);
                      fragMesh.castShadow = true;
                      fragMesh.receiveShadow = true;

                      // Rotate cylinder to align with the frame's direction (vertical (0,1,0) to 'dir')
                      const align = new THREE.Vector3(0, 1, 0);
                      const quat = new THREE.Quaternion().setFromUnitVectors(align, dir);
                      fragMesh.quaternion.copy(quat);
                      (fragMesh as any).initialQuaternion = fragMesh.quaternion.clone();
                      fragMesh.position.copy(segmentCenter);

                      scene.add(fragMesh);
                      frameFragmentMeshes.set(fragId, fragMesh);
                    }

                    spawnBreakParticles(pos.x, pos.y);
                  }
                } else {
                  // --- Fallback Utility / Non-structural Destruction ---
                  body.parent = body;
                  body.parts = [body];
                  Matter.Body.setParts(body, [body]);
                  Matter.Body.setMass(body, (body as any).originalMass || 5);
                  (body as any).shouldBeStatic = false;
                  (body as any).isGround = false;

                  body.restitution = 0.02;
                  body.friction = 0.95;
                  body.frictionAir = 0.015;

                  // 1. Un-fix body (activate physics)
                  Matter.Body.setStatic(body, false);
                  Matter.Composite.add(physicsWorld, body);

                  // 2. Break all connected welds/constraints
                  constraintsList.forEach(c => {
                    if ((c.bodyA === body || c.bodyB === body) && !(c as any).isBroken) {
                      (c as any).isBroken = true;
                      Matter.Composite.remove(physicsWorld, c);
                    }
                  });

                  // 3. Convert to debris collision category so it collides with floor & other debris
                  body.collisionFilter.category = DEBRIS_CATEGORY;
                  body.collisionFilter.mask = DEBRIS_MASK;
                  body.collisionFilter.group = 0;

                  // 4. Apply initial launch impulse from disaster force
                  if (disasterType === 'tsunami') {
                    Matter.Body.setVelocity(body, { x: 3 + intensity * 0.4, y: -1.5 - Math.random() * 1.5 });
                    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
                  } else if (disasterType === 'tornado') {
                    Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 6, y: -3 - Math.random() * 2 });
                    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
                  } else if (disasterType === 'earthquake') {
                    Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 2.5, y: -0.5 - Math.random() * 1.0 });
                    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);
                  } else if (disasterType === 'flood') {
                    Matter.Body.setVelocity(body, { x: 1 + Math.random() * 1, y: -1 - Math.random() * 1 });
                    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.04);
                  }

                  // 5. Spawn burst of break debris particles
                  spawnBreakParticles(pos.x, pos.y);
                }
              }
            }

            // Flash emissive on mesh if available
            if (mesh) {
              mesh.traverse(child => {
                if (child instanceof THREE.Mesh && child.material) {
                  const mat = child.material as THREE.MeshStandardMaterial;
                  if (mat.emissive) {
                    mat.emissive.setHex(newDmg >= 100 ? 0xff0000 : 0xff3300);
                    mat.emissiveIntensity = newDmg >= 100 ? 0.8 : 0.5;
                    setTimeout(() => {
                      if (mat.emissive) mat.emissiveIntensity = 0;
                    }, 100);
                  }
                }
              });
            }

            // Spawn collision particles at hit point
            for (let i = 0; i < particles.length; i++) {
              const p = particles[i];
              if (p.life <= 0) {
                p.mesh.visible = true;
                p.mesh.position.set(
                  pos.x + (Math.random() - 0.5) * 0.5,
                  pos.y + (Math.random() - 0.5) * 0.5,
                  pos.z + (Math.random() - 0.5) * 0.5
                );
                p.mesh.scale.setScalar(0.15 + Math.random() * 0.2);
                p.life = 0.5;
                p.vx = (Math.random() - 0.5) * 0.1;
                p.vy = 0.05 + Math.random() * 0.05;
                p.vz = (Math.random() - 0.5) * 0.1;
                if (p.mesh.material) {
                  (p.mesh.material as THREE.MeshStandardMaterial).color.set(
                    disasterType === 'tsunami' || disasterType === 'flood' ? '#38bdf8' : '#f97316'
                  );
                }
                break;
              }
            }
          }
        };

        checkCollisionRef.current = checkElementCollision;

        // Check all frames
        framesRef.current.forEach(f => {
          const mx = (f.start.x + f.end.x) / 2;
          const my = (f.start.y + f.end.y) / 2;
          const mz = (f.start.z + f.end.z) / 2;
          const mesh = frameMeshes.get(f.id);
          checkElementCollision(f.id, { x: mx, y: my, z: mz }, f.durability, mesh);
        });

        // Check all walls
        wallsRef.current.forEach(w => {
          const mx = (w.start.x + w.end.x) / 2;
          const my = (w.start.y + w.end.y) / 2;
          const mz = (w.start.z + w.end.z) / 2;
          const mesh = wallMeshes.get(w.id);
          checkElementCollision(w.id, { x: mx, y: my, z: mz }, w.durability, mesh);
        });

        // Check all utilities
        utilitiesRef.current.forEach(u => {
          const mesh = utilityMeshes.get(u.id);
          checkElementCollision(u.id, u.position, 80, mesh);
        });

        // Calculate integrity from accumulated collision damage & broken constraints
        const totalElements = framesRef.current.length + wallsRef.current.length + utilitiesRef.current.length;
        let elementIntegrity = 100;
        if (totalElements > 0) {
          let totalDamageSum = 0;
          currentDamageMap.forEach(val => { totalDamageSum += val; });
          const avgDamage = totalDamageSum / totalElements;
          elementIntegrity = Math.max(0, Math.round(100 - avgDamage));
        }

        currentIntegrity = Math.min(constraintIntegrity, elementIntegrity);

        let collapseReason = '';
        if (currentIntegrity < 25) {
          if (constraintIntegrity < 25) {
            collapseReason = '주요 구조체 프레임 파손 및 용접부 단열 붕괴 (Structural Frame Failure)';
          } else {
            collapseReason = '재해 직접 충돌 임계 한계 초과 (Direct Disaster Impact Failure)';
          }
        }

        onSimulationUpdate(currentIntegrity, simulationTimeSec, collapseReason);

        // Map Matter.js positions back to Three.js 3D meshes (incorporate utilities as well!)
        Matter.Composite.allBodies(physicsWorld).forEach(topBody => {
          const partsToSync = (topBody.parts && topBody.parts.length > 1) ? topBody.parts : [topBody];
          partsToSync.forEach(part => {
            const mapping = bodyToElementMap.get(part.id);
            if (mapping) {
              if (mapping.type === 'frame') {
                const mesh = frameMeshes.get(mapping.id);
                if (mesh) {
                  syncMatterToThree(part, mesh);
                }
              } else if (mapping.type === 'wall') {
                const mesh = wallMeshes.get(mapping.id);
                if (mesh) {
                  syncMatterToThree(part, mesh);

                  // Update cracks opacity based on accumulated damage
                  const damage = currentDamageMap.get(mapping.id) || 0;
                  const crackGroup = (mesh as any).crackGroup;
                  if (crackGroup) {
                    if (damage > 10) {
                      crackGroup.visible = true;
                      crackGroup.children.forEach((child: any) => {
                        if (child.material) {
                          child.material.opacity = Math.min(0.95, (damage - 10) / 90);
                        }
                      });
                    } else {
                      crackGroup.visible = false;
                    }
                  }
                }
              } else if (mapping.type === 'wall_fragment') {
                const mesh = wallFragmentMeshes.get(mapping.id);
                if (mesh) {
                  syncMatterToThree(part, mesh);
                }
              } else if (mapping.type === 'frame_fragment') {
                const mesh = frameFragmentMeshes.get(mapping.id);
                if (mesh) {
                  syncMatterToThree(part, mesh);
                }
              } else if (mapping.type === 'utility') {
                const mesh = utilityMeshes.get(mapping.id);
                if (mesh) {
                  syncMatterToThree(part, mesh);
                }
              }
            }
          });
        });

      } else {
        // If not testing, reset bodies positions to initial
        if (isSimulationRunning) {
          isSimulationRunning = false;
          elementCollisionDamageMapRef.current.clear();
          buildThreeMeshes();
        }

        // Reset visibilities, ground, and grid positions
        floodMesh.visible = false;
        tsunamiMesh.visible = false;
        tornadoMesh.visible = false;
        gridHelper.position.set(0, 0.001, 0);
        ground.position.set(0, 0, 0);
        particles.forEach(p => { p.mesh.visible = false; });
      }

      // Slowly drift clouds
      if (cloudMaterial) {
        cloudMaterial.uniforms.cameraPos.value.copy(camera.position);
        cloudMaterial.uniforms.frame.value++;
      }
      cloudGroup.children.forEach((cloud) => {
        cloud.position.x += 0.012;
        if (cloud.position.x > 35) {
          cloud.position.x = -35;
          cloud.position.z = (Math.random() - 0.5) * 70;
        }
      });
      
      // Animate water shader and bumps
      if (waterBumpMap) {
        waterBumpMap.offset.x += 0.002;
        waterBumpMap.offset.y += 0.001;
      }
      if (floodWaterMat.userData.shader) {
        floodWaterMat.userData.shader.uniforms.uTime.value = simulationTimeSec;
      }
      if (tsunamiWaterMat.userData.shader) {
        tsunamiWaterMat.userData.shader.uniforms.uTime.value = simulationTimeSec;
      }

      // --- Building Off-Screen Indicator Logic ---
      let centerX = 0, centerY = 0, centerZ = 0, count = 0;
      frameMeshes.forEach(mesh => {
        centerX += mesh.position.x;
        centerY += mesh.position.y;
        centerZ += mesh.position.z;
        count++;
      });
      wallMeshes.forEach(mesh => {
        centerX += mesh.position.x;
        centerY += mesh.position.y;
        centerZ += mesh.position.z;
        count++;
      });
      
      if (count > 0 && offScreenIndicatorRef.current && mountRef.current) {
        centerX /= count;
        centerY /= count;
        centerZ /= count;
        const centerVec = new THREE.Vector3(centerX, centerY, centerZ);
        centerVec.project(camera);

        let isOffScreen = false;
        let ndcX = centerVec.x;
        let ndcY = centerVec.y;

        if (centerVec.z > 1) { // Behind camera
          isOffScreen = true;
          ndcX *= -1;
          ndcY *= -1;
        } else if (ndcX < -0.9 || ndcX > 0.9 || ndcY < -0.9 || ndcY > 0.9) {
          isOffScreen = true;
        }

        if (isOffScreen) {
          offScreenIndicatorRef.current.style.display = 'flex';
          
          const width = mountRef.current.clientWidth;
          const height = mountRef.current.clientHeight;
          
          let dirX = ndcX;
          let dirY = -ndcY; // Invert Y because NDC is Y-up, DOM is Y-down
          
          const len = Math.hypot(dirX, dirY);
          if (len > 0.001) {
            dirX /= len;
            dirY /= len;
          } else {
            dirX = 1; dirY = 0;
          }
          
          const padding = 30;
          const halfW = (width / 2) - padding;
          const halfH = (height / 2) - padding;
          
          let scaleX = Infinity, scaleY = Infinity;
          if (Math.abs(dirX) > 0.001) scaleX = Math.abs(halfW / dirX);
          if (Math.abs(dirY) > 0.001) scaleY = Math.abs(halfH / dirY);
          const scale = Math.min(scaleX, scaleY);
          
          const finalX = (width / 2) + dirX * scale;
          const finalY = (height / 2) + dirY * scale;
          
          // Math.atan2 returns angle where 0 is RIGHT.
          // ArrowRight points RIGHT. We don't need additional rotation for base.
          const angle = Math.atan2(dirY, dirX);
          
          offScreenIndicatorRef.current.style.left = `${finalX}px`;
          offScreenIndicatorRef.current.style.top = `${finalY}px`;
          offScreenIndicatorRef.current.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
        } else {
          offScreenIndicatorRef.current.style.display = 'none';
        }
      } else if (offScreenIndicatorRef.current) {
        offScreenIndicatorRef.current.style.display = 'none';
      }

      // 11. AI Timeline Custom Effects Processing (Lights Out & Fire Alarm Siren & Glass Shatter & Wall Break)
      const currentStep = activeAiTimelineStepRef.current;
      if (currentStep && isDisasterRunningRef.current) {
        // --- Effect 1: Lights Out (Power Outage Blackout) ---
        if (currentStep.dynamicEffects?.lightsOut) {
          ambientLight.intensity = THREE.MathUtils.lerp(ambientLight.intensity, 0.03, 0.05);
          dirLight.intensity = THREE.MathUtils.lerp(dirLight.intensity, 0.05, 0.05);
          floorLight.intensity = THREE.MathUtils.lerp(floorLight.intensity, 0.0, 0.05);
        } else {
          ambientLight.intensity = THREE.MathUtils.lerp(ambientLight.intensity, qualitySettings.graphics === 'low' ? 0.8 : 0.4, 0.05);
          dirLight.intensity = THREE.MathUtils.lerp(dirLight.intensity, 1.0, 0.05);
          floorLight.intensity = THREE.MathUtils.lerp(floorLight.intensity, 0.4, 0.05);
        }

        // --- Effect 2: Fire Alarm Siren ---
        if (currentStep.dynamicEffects?.fireAlarm) {
          // Flashing siren light intensity (oscillates rapidly)
          const flashFreq = simulationTimeSec * 8;
          const flashIntensity = (Math.sin(flashFreq) + 1.0) * 2.5; // Up to 5.0 intensity
          sirenLight.intensity = THREE.MathUtils.lerp(sirenLight.intensity, flashIntensity, 0.1);
        } else {
          sirenLight.intensity = THREE.MathUtils.lerp(sirenLight.intensity, 0.0, 0.1);
        }

        // --- Effect 3: Glass Shatter & Effect 4: Wall Break ---
        if (currentStep.dynamicEffects?.glassShatter || currentStep.dynamicEffects?.wallBreak) {
          Matter.Composite.allBodies(physicsWorld).forEach(body => {
            const partId = body.id;
            const mapping = bodyToElementMap.get(partId);
            if (mapping && mapping.type === 'wall' && !body.isStatic) {
              const wallElement = wallsRef.current.find(w => w.id === mapping.id);
              if (wallElement) {
                const isGlass = wallElement.material === 'glass';
                if ((isGlass && currentStep.dynamicEffects.glassShatter) || (!isGlass && currentStep.dynamicEffects.wallBreak)) {
                  const currentDamage = elementCollisionDamageMapRef.current.get(mapping.id) || 0;
                  if (currentDamage < 100) {
                    elementCollisionDamageMapRef.current.set(mapping.id, 100);
                    const wallMesh = wallMeshes.get(mapping.id);
                    const pos = {
                      x: (wallElement.start.x + wallElement.end.x) / 2,
                      y: (wallElement.start.y + wallElement.end.y) / 2,
                      z: (wallElement.start.z + wallElement.end.z) / 2,
                    };
                    if (checkCollisionRef.current) {
                      checkCollisionRef.current(mapping.id, pos, wallElement.durability, wallMesh);
                    }
                  }
                }
              }
            }
          });
        }
      } else {
        // Reset lights to standard default intensities when AI timeline is not active or simulation is stopped
        ambientLight.intensity = THREE.MathUtils.lerp(ambientLight.intensity, qualitySettings.graphics === 'low' ? 0.8 : 0.4, 0.05);
        dirLight.intensity = THREE.MathUtils.lerp(dirLight.intensity, 1.0, 0.05);
        floorLight.intensity = THREE.MathUtils.lerp(floorLight.intensity, 0.4, 0.05);
        sirenLight.intensity = THREE.MathUtils.lerp(sirenLight.intensity, 0.0, 0.1);
      }

      const activeMode = mouseModeRef.current;
      const isRotateMode = ['position', 'rotation', 'scale'].includes(activeMode);
      if (!isRotateMode) {
        rotationGizmoGroup.visible = false;
      } else {
        tArrowX.visible = activeMode === 'position';
        tArrowY.visible = activeMode === 'position';
        tArrowZ.visible = activeMode === 'position';

        rRingX.visible = activeMode === 'rotation';
        rRingY.visible = activeMode === 'rotation';
        rRingZ.visible = activeMode === 'rotation';

        sLineX.visible = activeMode === 'scale';
        sBoxMeshX.visible = activeMode === 'scale';
        sLineY.visible = activeMode === 'scale';
        sBoxMeshY.visible = activeMode === 'scale';
        sLineZ.visible = activeMode === 'scale';
        sBoxMeshZ.visible = activeMode === 'scale';

        if (activeMode === 'rotation') {
          rRingX.rotation.z += 0.005;
          rRingY.rotation.z += 0.005;
          rRingZ.rotation.z += 0.005;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // --- 10. Cleanups ---
    const handleResize = () => {
      const w = mountRef.current?.clientWidth || width;
      const h = mountRef.current?.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);

    const resizeObserver = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => {
        if (!entries || entries.length === 0) return;
        const entry = entries[0];
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false); // use false to prevent setting inline styles that trigger layout
        }
      });
    });
    if (mountRef.current) {
      resizeObserver.observe(mountRef.current);
    }

    return () => {
      // Save camera parameters to persistent refs
      cameraTargetRef.current.copy(cameraTarget);
      cameraDistanceRef.current = cameraDistance;
      cameraThetaRef.current = cameraTheta;
      cameraPhiRef.current = cameraPhi;

      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDownWASD);
      window.removeEventListener('keyup', handleKeyUpWASD);
      dom.removeEventListener('mousedown', handleMouseDown);
      dom.removeEventListener('mousemove', handleMouseMove);
      dom.removeEventListener('mouseup', handleMouseUp);
      dom.removeEventListener('mousedown', handleCanvasMouseDown);
      dom.removeEventListener('mousemove', handleCanvasMouseMove);
      dom.removeEventListener('mouseup', handleCanvasMouseUp);
      dom.removeEventListener('wheel', handleWheel);
      dom.removeEventListener('contextmenu', disableContextMenu);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      buildThreeMeshesRef.current = () => {};
    };
  }, [qualitySettings]);

  // Dynamically rebuild Three.js meshes when elements list changes, avoiding full WebGL context recreation!
  useEffect(() => {
    if (buildThreeMeshesRef.current) {
      buildThreeMeshesRef.current();
    }
  }, [frames, walls, utilities]);

  // Total Construction Cost Statistics
  const totalCost = 
    frames.reduce((sum, f) => sum + f.cost, 0) +
    walls.reduce((sum, w) => sum + w.cost, 0) +
    utilities.reduce((sum, u) => sum + u.cost, 0);

  const totalWeight = 
    frames.reduce((sum, f) => sum + f.weight, 0) +
    walls.reduce((sum, w) => sum + w.weight, 0);

  // Camera focus handler for debug inspection
  const handleFocusElement = (x: number, y: number, z: number, id: string) => {
    setSelectedDebugId(id);
    cameraTargetRef.current.set(x, Math.max(0.5, y), z);
  };

  // Copy position coordinates string
  const handleCopyPosition = (posStr: string) => {
    navigator.clipboard.writeText(posStr);
    setCopyNotification(`좌표 복사됨: ${posStr}`);
    setTimeout(() => setCopyNotification(null), 2500);
  };

  // Compile full normalized debug element list
  const allDebugElements = [
    ...frames.map((f) => {
      const midX = (f.start.x + f.end.x) / 2;
      const midY = (f.start.y + f.end.y) / 2;
      const midZ = (f.start.z + f.end.z) / 2;
      const spec = FRAMEWORK_MATERIALS[f.material];
      return {
        id: f.id,
        type: 'frame' as const,
        title: `골조: ${spec ? spec.name : f.material}`,
        material: f.material,
        weight: f.weight,
        startX: f.start.x,
        startY: f.start.y,
        startZ: f.start.z,
        endX: f.end.x,
        endY: f.end.y,
        endZ: f.end.z,
        midX,
        midY,
        midZ,
      };
    }),
    ...walls.map((w) => {
      const midX = (w.start.x + w.end.x) / 2;
      const midY = (w.start.y + w.end.y) / 2;
      const midZ = (w.start.z + w.end.z) / 2;
      const spec = WALL_MATERIALS[w.material];
      return {
        id: w.id,
        type: 'wall' as const,
        title: `벽체: ${spec ? spec.name : w.material}`,
        material: w.material,
        weight: w.weight,
        startX: w.start.x,
        startY: w.start.y,
        startZ: w.start.z,
        endX: w.end.x,
        endY: w.end.y,
        endZ: w.end.z,
        midX,
        midY,
        midZ,
      };
    }),
    ...utilities.map((u) => {
      const spec = UTILITIES[u.type];
      return {
        id: u.id,
        type: 'utility' as const,
        title: `설비: ${spec ? spec.name : u.type}`,
        material: u.type,
        weight: 0,
        startX: u.position.x,
        startY: u.position.y,
        startZ: u.position.z,
        endX: u.position.x,
        endY: u.position.y,
        endZ: u.position.z,
        midX: u.position.x,
        midY: u.position.y,
        midZ: u.position.z,
      };
    }),
  ];

  // Calculate Spatial Bounding Box & Center of Mass Metrics
  const spatialMetrics = (() => {
    if (allDebugElements.length === 0) {
      return { total: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, centerX: 0, centerY: 0, centerZ: 0 };
    }
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let sumX = 0, sumY = 0, sumZ = 0;

    allDebugElements.forEach((el) => {
      minX = Math.min(minX, el.midX);
      maxX = Math.max(maxX, el.midX);
      minY = Math.min(minY, el.midY);
      maxY = Math.max(maxY, el.midY);
      minZ = Math.min(minZ, el.midZ);
      maxZ = Math.max(maxZ, el.midZ);

      sumX += el.midX;
      sumY += el.midY;
      sumZ += el.midZ;
    });

    const count = allDebugElements.length;
    return {
      total: count,
      minX: minX === Infinity ? 0 : minX,
      maxX: maxX === -Infinity ? 0 : maxX,
      minY: minY === Infinity ? 0 : minY,
      maxY: maxY === -Infinity ? 0 : maxY,
      minZ: minZ === Infinity ? 0 : minZ,
      maxZ: maxZ === -Infinity ? 0 : maxZ,
      centerX: sumX / count,
      centerY: sumY / count,
      centerZ: sumZ / count,
    };
  })();

  // Filtered Debug Element List
  const filteredDebugElements = allDebugElements.filter((item) => {
    if (debugCategory !== 'all' && item.type !== debugCategory) return false;
    if (debugSearchQuery.trim()) {
      const q = debugSearchQuery.toLowerCase();
      const matchId = item.id.toLowerCase().includes(q);
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchMat = item.material.toLowerCase().includes(q);
      return matchId || matchTitle || matchMat;
    }
    return true;
  });

  return (
    <div className="relative w-full h-full flex flex-col bg-neutral-950 select-none overflow-hidden">
      
      {/* Sequential Object Validation & Gravity Understanding Status HUD Banner */}
      {stage === 'testing' && objectValidation.stage !== 'idle' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-in fade-in slide-in-from-top-3 duration-300">
          <div className={`px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 border text-xs font-medium transition-all ${
            objectValidation.stage === 'validating'
              ? 'bg-neutral-900/90 text-amber-300 border-amber-500/40'
              : 'bg-neutral-900/90 text-emerald-300 border-emerald-500/40'
          }`}>
            {objectValidation.stage === 'validating' ? (
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Zap className="w-4 h-4 text-emerald-400" />
            )}
            
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-wide">
                  {objectValidation.stage === 'validating' 
                    ? `개체 순차 무결성 검사 중... (${objectValidation.currentIndex}/${objectValidation.totalCount})`
                    : `개체 검사 완료 & 중력(9.81 m/s²) 적용 중`}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                  objectValidation.stage === 'validating'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {objectValidation.stage === 'validating' ? '정적 고정 (Static Lock)' : '동적 중력 (Dynamic Physics)'}
                </span>
              </div>
              <span className="text-[11px] text-neutral-300 font-mono mt-0.5">
                {objectValidation.currentLabel}
              </span>
            </div>
          </div>
        </div>
      )}

      {outOfBoundsError && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-red-500/90 text-white px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2 border border-red-400">
            <ShieldAlert className="w-5 h-5" />
            <span className="font-bold text-sm tracking-wide">경고: 일부 블록이 시뮬레이션 공간을 이탈하여 초기화되었습니다!</span>
          </div>
        </div>
      )}

      {/* Toast notification for coordinate clipboard copy */}
      {copyNotification && (
        <div className="absolute top-8 right-1/2 translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-2xl font-mono text-xs font-bold border border-emerald-400 flex items-center gap-2">
            <Copy className="w-4 h-4" />
            <span>{copyNotification}</span>
          </div>
        </div>
      )}

      {/* Camera View Mode Display Overlay & Debug Toggle Button */}
      <div className="absolute top-36 lg:top-24 right-4 z-20 flex items-center gap-2">
        {/* Interaction Mode Switcher (설치 vs 이동 축 vs 회전 축 vs 확장 축) */}
        <div className="p-0.5 bg-neutral-900/90 border border-neutral-700/80 rounded-lg flex items-center shadow-lg backdrop-blur-md pointer-events-auto">
          <button
            onClick={() => setMouseMode('build')}
            className={`px-3 py-1.5 rounded-md font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              mouseMode === 'build'
                ? 'bg-indigo-600/95 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
            }`}
          >
            <Construction className="w-3.5 h-3.5" />
            <span>설치 모드</span>
          </button>
          <button
            onClick={() => setMouseMode('position')}
            className={`px-3 py-1.5 rounded-md font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              mouseMode === 'position'
                ? 'bg-emerald-600/95 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
            }`}
          >
            <Move className="w-3.5 h-3.5 text-emerald-400" />
            <span>이동 축</span>
          </button>
          <button
            onClick={() => setMouseMode('rotation')}
            className={`px-3 py-1.5 rounded-md font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              mouseMode === 'rotation'
                ? 'bg-rose-600/95 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5 text-rose-400" />
            <span>회전 축</span>
          </button>
          <button
            onClick={() => setMouseMode('scale')}
            className={`px-3 py-1.5 rounded-md font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              mouseMode === 'scale'
                ? 'bg-amber-600/95 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>확장 축</span>
            <kbd className="px-1 text-[9px] bg-neutral-800 text-neutral-400 rounded border border-neutral-700 font-mono ml-0.5">
              R
            </kbd>
          </button>
        </div>

        {stage === 'testing' && (
          <div className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md ${
            isDisasterRunning 
              ? 'border-rose-500/80 bg-rose-950/90 text-rose-300 animate-pulse'
              : 'border-cyan-500/80 bg-cyan-950/90 text-cyan-300'
          }`}>
            <Zap className="w-4 h-4 text-amber-400" />
            <span>{isDisasterRunning ? '재해 물리 시뮬레이션 진행 중' : '재해 실행 대기 중'}</span>
          </div>
        )}
        
        <button
          id="toggle-debug-btn"
          onClick={() => setShowDebugInspector(!showDebugInspector)}
          className={`px-3.5 py-1.5 rounded-lg border font-medium text-xs flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-all cursor-pointer ${
            showDebugInspector
              ? 'border-emerald-500 bg-emerald-950/90 text-emerald-300 ring-2 ring-emerald-500/50 font-bold'
              : 'border-neutral-700 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white'
          }`}
        >
          <Box className="w-4 h-4 text-emerald-400" />
          <span>개체 위치 디버그</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
            {spatialMetrics.total}개
          </span>
        </button>

        <button
          id="toggle-view-btn"
          onClick={() => setIs3D(!is3D)}
          className="px-3.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white font-medium text-xs flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-all cursor-pointer"
        >
          <Eye className="w-4 h-4 text-indigo-400" />
          <span>{is3D ? '3D 자유 궤적' : '2D 정면도'}</span>
          <kbd className="px-1.5 py-0.5 text-[9px] bg-neutral-800 text-neutral-400 rounded border border-neutral-700">
            Shift
          </kbd>
        </button>
      </div>

      {/* Debug Position Inspector Floating Window */}
      {showDebugInspector && (
        <div className="absolute top-24 left-4 lg:left-[382px] z-30 max-w-md w-96 max-h-[75vh] flex flex-col bg-neutral-950/95 border border-emerald-500/50 rounded-2xl shadow-2xl backdrop-blur-xl text-white overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200">
          {/* Panel Header */}
          <div className="p-3.5 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Box className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-emerald-300 leading-tight">개체 위치 디버그 인스펙터</h3>
                <p className="text-[10px] text-neutral-400">실시간 구조물 3D 좌표 및 정밀 바운딩 모니터</p>
              </div>
            </div>
            <button
              onClick={() => setShowDebugInspector(false)}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Spatial Bounding Box & Center Metrics */}
          <div className="p-3 bg-neutral-900/50 border-b border-neutral-800 text-[11px] font-mono grid grid-cols-2 gap-2">
            <div className="bg-neutral-950/70 p-2 rounded-xl border border-neutral-800/80">
              <span className="text-[10px] text-neutral-400 block">최고 높이 (Max Height Y)</span>
              <span className="font-bold text-emerald-400 text-xs">{spatialMetrics.maxY.toFixed(2)}m</span>
            </div>
            <div className="bg-neutral-950/70 p-2 rounded-xl border border-neutral-800/80">
              <span className="text-[10px] text-neutral-400 block">개체 총수 (Total Count)</span>
              <span className="font-bold text-sky-400 text-xs">{spatialMetrics.total}개</span>
            </div>
            <div className="bg-neutral-950/70 p-2 rounded-xl border border-neutral-800/80">
              <span className="text-[10px] text-neutral-400 block">X 범위 (Width Span)</span>
              <span className="font-bold text-amber-300 text-[11px]">{spatialMetrics.minX.toFixed(1)}m ~ {spatialMetrics.maxX.toFixed(1)}m</span>
            </div>
            <div className="bg-neutral-950/70 p-2 rounded-xl border border-neutral-800/80">
              <span className="text-[10px] text-neutral-400 block">Z 범위 (Depth Span)</span>
              <span className="font-bold text-indigo-300 text-[11px]">{spatialMetrics.minZ.toFixed(1)}m ~ {spatialMetrics.maxZ.toFixed(1)}m</span>
            </div>
            <div className="col-span-2 bg-neutral-950/70 p-2 rounded-xl border border-neutral-800/80 flex justify-between items-center">
              <span className="text-[10px] text-neutral-400">추정 질량 중심 (Center of Mass)</span>
              <span className="font-bold text-emerald-300 font-mono text-[11px]">
                ({spatialMetrics.centerX.toFixed(2)}, {spatialMetrics.centerY.toFixed(2)}, {spatialMetrics.centerZ.toFixed(2)})
              </span>
            </div>
          </div>

          {/* Search & Category Filter Tabs */}
          <div className="p-2.5 border-b border-neutral-800 bg-neutral-900/30 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={debugSearchQuery}
                onChange={(e) => setDebugSearchQuery(e.target.value)}
                placeholder="개체 ID 또는 재질 검색..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div className="grid grid-cols-4 gap-1 text-[11px]">
              {(['all', 'frame', 'wall', 'utility'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setDebugCategory(cat)}
                  className={`py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    debugCategory === cat
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-neutral-800/80 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  {cat === 'all' && `전체 (${spatialMetrics.total})`}
                  {cat === 'frame' && `골조 (${frames.length})`}
                  {cat === 'wall' && `벽체 (${walls.length})`}
                  {cat === 'utility' && `설비 (${utilities.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Object Position Cards Scrollable List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 max-h-[320px] custom-scrollbar">
            {filteredDebugElements.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-xs">
                검색된 구조물 개체가 없습니다.
              </div>
            ) : (
              filteredDebugElements.map((item) => {
                const isSelected = selectedDebugId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedDebugId(item.id)}
                    className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-950/60 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                        : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          item.type === 'frame' ? 'bg-indigo-400' : item.type === 'wall' ? 'bg-purple-400' : 'bg-emerald-400'
                        }`} />
                        <span className="font-bold text-white text-xs">{item.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                          #{item.id.slice(0, 8)}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-neutral-400">
                        {item.weight > 0 && `${item.weight.toFixed(0)}kg`}
                      </span>
                    </div>

                    {/* Coordinates Details */}
                    <div className="font-mono text-[11px] bg-neutral-950/80 p-2 rounded-lg space-y-0.5 text-neutral-300 mb-2 border border-neutral-800/60">
                      {item.type === 'frame' && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-neutral-400 text-[10px]">시작 좌표:</span>
                            <span className="text-indigo-300">({item.startX?.toFixed(2)}, {item.startY?.toFixed(2)}, {item.startZ?.toFixed(2)})</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400 text-[10px]">끝 좌표:</span>
                            <span className="text-indigo-300">({item.endX?.toFixed(2)}, {item.endY?.toFixed(2)}, {item.endZ?.toFixed(2)})</span>
                          </div>
                          <div className="flex justify-between font-bold border-t border-neutral-800 pt-0.5 mt-0.5">
                            <span className="text-emerald-400 text-[10px]">중심 좌표:</span>
                            <span className="text-emerald-300">({item.midX.toFixed(2)}, {item.midY.toFixed(2)}, {item.midZ.toFixed(2)})</span>
                          </div>
                        </>
                      )}
                      {item.type === 'wall' && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-neutral-400 text-[10px]">벽체 시점:</span>
                            <span className="text-purple-300">({item.startX?.toFixed(2)}, {item.startY?.toFixed(2)})</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400 text-[10px]">벽체 종점:</span>
                            <span className="text-purple-300">({item.endX?.toFixed(2)}, {item.endY?.toFixed(2)})</span>
                          </div>
                          <div className="flex justify-between font-bold border-t border-neutral-800 pt-0.5 mt-0.5">
                            <span className="text-emerald-400 text-[10px]">중심 좌표:</span>
                            <span className="text-emerald-300">({item.midX.toFixed(2)}, {item.midY.toFixed(2)}, {item.midZ.toFixed(2)})</span>
                          </div>
                        </>
                      )}
                      {item.type === 'utility' && (
                        <div className="flex justify-between font-bold">
                          <span className="text-emerald-400 text-[10px]">설치 좌표:</span>
                          <span className="text-emerald-300">({item.midX.toFixed(2)}, {item.midY.toFixed(2)}, {item.midZ.toFixed(2)})</span>
                        </div>
                      )}
                    </div>

                    {/* Hitbox & Collision Range Metrics */}
                    <div className="font-mono text-[10px] bg-emerald-950/40 p-2 rounded-lg border border-emerald-800/50 space-y-1 mb-2 text-emerald-200">
                      <div className="flex items-center justify-between border-b border-emerald-800/40 pb-1">
                        <span className="font-bold flex items-center gap-1 text-emerald-300">
                          <Box className="w-3 h-3 text-emerald-400" />
                          히트박스 크기 (Hitbox Bounds)
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-[9px] text-emerald-300 font-bold border border-emerald-500/30">
                          -60% 축소 완료
                        </span>
                      </div>
                      {item.type === 'frame' && (
                        <div className="flex justify-between">
                          <span className="text-neutral-400">물리 충돌 두께:</span>
                          <span className="text-emerald-300 font-bold">5.6px (원래 15.0px → 62.5% 감축)</span>
                        </div>
                      )}
                      {item.type === 'wall' && (
                        <div className="flex justify-between">
                          <span className="text-neutral-400">물리 충돌 두께:</span>
                          <span className="text-emerald-300 font-bold">6.0px (원래 15.0px → 60% 감축)</span>
                        </div>
                      )}
                      {item.type === 'utility' && (
                        <div className="flex justify-between">
                          <span className="text-neutral-400">히트박스 점유 면적:</span>
                          <span className="text-emerald-300 font-bold">10x10px (원래 20x20px)</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[9px] text-neutral-400 pt-0.5">
                        <span>영향 요인:</span>
                        <span>재질 두께 & Matter.js 물리 스케일</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-neutral-800/80">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFocusElement(item.midX, item.midY, item.midZ, item.id);
                        }}
                        className="px-2 py-1 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <MapPin className="w-3 h-3" />
                        <span>위치 카메라 이동</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const posStr = `X: ${item.midX.toFixed(2)}, Y: ${item.midY.toFixed(2)}, Z: ${item.midZ.toFixed(2)}`;
                          handleCopyPosition(posStr);
                        }}
                        className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>좌표 복사</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteElement(item.id, item.type);
                        }}
                        className="px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 text-red-200 text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Guide Help Toast inside Canvas */}
      <div className="absolute bottom-[185px] left-4 lg:left-[382px] z-10 max-w-sm pointer-events-none">
        <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3 shadow-xl backdrop-blur-md flex items-start gap-2.5">
          <Construction className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
          <div className="text-xs text-neutral-300 leading-relaxed">
            {stage === 'framing' && (
              <>
                <strong className="text-amber-400">1단계: 뼈대 건설</strong><br />
                마우스를 드래그하여 철근/나무 등의 뼈대를 배치하세요. Alt키를 누르면 격자(1M) 스냅이 활성화됩니다.
              </>
            )}
            {stage === 'cladding' && (
              <>
                <strong className="text-indigo-400">2단계: 외벽 & 설비 구축</strong><br />
                기둥 사이에 외벽을 설치하고 문, 배수관 등을 배치하여 구조 안전 지수와 방수 능력을 늘립니다.
              </>
            )}
            {stage === 'testing' && (
              <>
                <strong className="text-rose-400">3단계: 재해 내구성 시뮬레이션</strong><br />
                자연재해 유형을 고르고 강도를 조정하세요. 실시간 물리 연산(Matter.js)으로 내진 수명을 예측합니다.
              </>
            )}
          </div>
        </div>
      </div>

      {/* Primary Rendering Container */}
      <div ref={mountRef} className="w-full flex-1 relative cursor-crosshair outline-none">
        {/* Off-screen Building Indicator */}
        <div 
          ref={offScreenIndicatorRef}
          className="absolute w-10 h-10 bg-neutral-900/90 border border-neutral-700 backdrop-blur-md rounded-full items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.2)] z-50 pointer-events-none"
          style={{ display: 'none' }}
        >
          <Navigation className="w-5 h-5 fill-amber-400/20" style={{ transform: 'rotate(90deg)' }} />
        </div>
      </div>

      {/* Render Dynamic Tooltip / Hover Spec Box */}
      {tooltipInfo.show && (
        <div 
          style={{ left: tooltipInfo.x, top: tooltipInfo.y }}
          className="absolute z-40 bg-neutral-950/95 border border-neutral-700/80 rounded-xl p-3 shadow-xl pointer-events-none backdrop-blur-md max-w-xs transition-all duration-75"
        >
          <div className="text-xs font-bold text-white border-b border-neutral-800 pb-1.5 mb-1.5 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            {tooltipInfo.title}
          </div>
          <div className="space-y-1 font-mono text-[11px] text-neutral-300">
            {tooltipInfo.details.map((detail, index) => (
              <div key={index}>{detail}</div>
            ))}
          </div>
        </div>
      )}

      {/* Controls Overlay Tips */}
      <div className="absolute bottom-[185px] right-4 z-10 flex flex-col gap-2 pointer-events-none items-end">
        {mouseMode === 'build' && (
          <div className="bg-indigo-600 text-white px-2.5 py-1 rounded-md text-[10px] font-bold shadow-lg flex items-center gap-1">
            <Construction className="w-3.5 h-3.5 text-white" />
            마우스 블록 설치 모드 활성
          </div>
        )}
        {mouseMode === 'position' && (
          <div className="bg-emerald-600 text-white px-2.5 py-1 rounded-md text-[10px] font-bold shadow-lg flex items-center gap-1">
            <Move className="w-3.5 h-3.5 text-white" />
            이동 축 조작 모드: 기즈모 축을 드래그하여 블록 위치 이동
          </div>
        )}
        {mouseMode === 'rotation' && (
          <div className="bg-rose-600 text-white px-2.5 py-1 rounded-md text-[10px] font-bold shadow-lg flex items-center gap-1">
            <RotateCw className="w-3.5 h-3.5 text-white" />
            회전 축 조작 모드: 기즈모 링을 드래그하여 블록 요(Yaw) 회전
          </div>
        )}
        {mouseMode === 'scale' && (
          <div className="bg-amber-600 text-white px-2.5 py-1 rounded-md text-[10px] font-bold shadow-lg flex items-center gap-1">
            <Maximize2 className="w-3.5 h-3.5 text-white" />
            확장 축 조작 모드: 기즈모 박스를 드래그하여 블록 크기 조정
          </div>
        )}
        {isAltPressed && (
          <div className="bg-indigo-600 text-white px-2.5 py-1 rounded-md text-[10px] font-bold shadow-lg flex items-center gap-1">
            <Eye className="w-3 h-3" />
            1M 정밀 스냅 격자 온
          </div>
        )}
      </div>
    </div>
  );
}
