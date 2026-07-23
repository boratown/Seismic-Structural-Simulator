/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FrameElement, 
  WallElement, 
  UtilityElement, 
  MaterialId, 
  WallMaterialId, 
  UtilityId, 
  DisasterType, 
  QualitySettings, 
  SimulationResult 
} from './types';
import { FRAMEWORK_MATERIALS, WALL_MATERIALS, UTILITIES } from './constants';
import SimulatorCanvas from './components/SimulatorCanvas';
import SettingsPanel from './components/SettingsPanel';
import { loadTemplate } from './utils/templates';
import { 
  Settings as SettingsIcon, 
  Play, 
  RotateCcw, 
  Building2, 
  ShieldCheck, 
  AlertTriangle, 
  HelpCircle, 
  Undo, 
  ChevronRight, 
  Cpu, 
  Layers, 
  Flame, 
  Waves, 
  Wind, 
  Droplets,
  Coins,
  ArrowRight,
  Info,
  Zap,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

export default function App() {
  // Current Simulation/Building Stage
  const [stage, setStage] = useState<'framing' | 'cladding' | 'testing'>('framing');

  // Element Selection State
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialId>('steel');
  const [selectedWallMaterial, setSelectedWallMaterial] = useState<WallMaterialId>('concrete');
  const [selectedUtility, setSelectedUtility] = useState<UtilityId>('door');

  // Interactive Elements lists
  const [frames, setFrames] = useState<FrameElement[]>([
    // Setup initial simple basement frame structure to help users start
    { id: 'base-1', material: 'steel', start: { x: -4, y: 0, z: 0 }, end: { x: -4, y: 3, z: 0 }, cost: 135000, weight: 235.5, durability: 100 },
    { id: 'base-2', material: 'steel', start: { x: 4, y: 0, z: 0 }, end: { x: 4, y: 3, z: 0 }, cost: 135000, weight: 235.5, durability: 100 },
    { id: 'base-3', material: 'steel', start: { x: -4, y: 3, z: 0 }, end: { x: 4, y: 3, z: 0 }, cost: 360000, weight: 628, durability: 100 },
  ]);
  const [walls, setWalls] = useState<WallElement[]>([]);
  const [utilities, setUtilities] = useState<UtilityElement[]>([]);

  // Disaster/Sim Testing configurations
  const [activeDisaster, setActiveDisaster] = useState<DisasterType | null>(null);
  const [disasterIntensity, setDisasterIntensity] = useState<number>(5);
  const [isDisasterRunning, setIsDisasterRunning] = useState<boolean>(false);

  // Live Simulation/Telemetry Outputs
  const [structuralIntegrity, setStructuralIntegrity] = useState<number>(100);
  const [survivalSec, setSurvivalSec] = useState<number>(0);
  const [collapseReason, setCollapseReason] = useState<string>('');
  const [seismicRating, setSeismicRating] = useState<number>(0); // years (내진 연한)

  // Modals & Panels toggle
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRebuildModalOpen, setIsRebuildModalOpen] = useState(false);

  // AI Disaster Scenario & Timeline Analysis State
  const [testingTab, setTestingTab] = useState<'manual' | 'ai'>('manual');
  const [aiScenario, setAiScenario] = useState<any | null>(null);
  const [isGeneratingScenario, setIsGeneratingScenario] = useState<boolean>(false);
  const [scenarioPlaybackActive, setScenarioPlaybackActive] = useState<boolean>(false);
  const [currentTimelineIndex, setCurrentTimelineIndex] = useState<number>(-1);
  const [aiError, setAiError] = useState<string>('');

  // Graphics configuration
  const [qualitySettings, setQualitySettings] = useState<QualitySettings>({
    graphics: 'high',
    textures: 'high',
    polygons: 'medium',
    shadows: 'medium',
    distance: 'high',
    clouds: 'fancy',
    water: 'fancy'
  });

  // Calculate live durability rating (Seismic Limit)
  useEffect(() => {
    if (frames.length === 0) {
      setSeismicRating(0);
      return;
    }

    // Base years depending on materials density & durability ratio
    let totalScore = 0;
    frames.forEach(f => {
      const spec = FRAMEWORK_MATERIALS[f.material];
      totalScore += spec.durability * spec.flexibility;
    });

    walls.forEach(w => {
      const spec = WALL_MATERIALS[w.material];
      totalScore += spec.durability * 0.3;
    });

    utilities.forEach(u => {
      if (u.type === 'drain_pipe') totalScore += 15;
      if (u.type === 'door') totalScore += 10;
    });

    const averageRating = Math.min(120, Math.round((totalScore / (frames.length + 1)) * 1.5));
    setSeismicRating(averageRating);
  }, [frames, walls, utilities]);

  // Handling structural frame, walls, utilities operations
  const handleAddFrame = (newFrame: FrameElement) => {
    setFrames(prev => [...prev, newFrame]);
  };

  const handleUpdateFrame = (updatedFrame: FrameElement) => {
    setFrames(prev => prev.map(f => f.id === updatedFrame.id ? updatedFrame : f));
  };

  const handleAddWall = (newWall: WallElement) => {
    setWalls(prev => [...prev, newWall]);
  };

  const handleUpdateWall = (updatedWall: WallElement) => {
    setWalls(prev => prev.map(w => w.id === updatedWall.id ? updatedWall : w));
  };

  const handleAddUtility = (newUtility: UtilityElement) => {
    setUtilities(prev => [...prev, newUtility]);
  };

  const handleUpdateUtility = (updatedUtility: UtilityElement) => {
    setUtilities(prev => prev.map(u => u.id === updatedUtility.id ? updatedUtility : u));
  };

  const handleDeleteElement = (id: string, type: 'frame' | 'wall' | 'utility') => {
    if (type === 'frame') setFrames(prev => prev.filter(item => item.id !== id));
    if (type === 'wall') setWalls(prev => prev.filter(item => item.id !== id));
    if (type === 'utility') setUtilities(prev => prev.filter(item => item.id !== id));
  };

  const handleLoadTemplate = (type: 'house' | 'apartment' | 'skyscraper') => {
    const template = loadTemplate(type);
    setFrames(template.frames);
    setWalls(template.walls);
    setUtilities(template.utilities);
    
    // Reset simulation status
    setActiveDisaster(null);
    setIsDisasterRunning(false);
    setSurvivalSec(0);
    setStructuralIntegrity(100);
    setCollapseReason('');
    setStage('framing');

    // Reset AI states
    setScenarioPlaybackActive(false);
    setCurrentTimelineIndex(-1);
    setAiScenario(null);
    setAiError('');
  };

  // Trigger Rebuild modal options
  const handleRebuildRequest = () => {
    setIsRebuildModalOpen(true);
  };

  const handleConfirmRebuild = (deleteEntire: boolean) => {
    setIsRebuildModalOpen(false);
    setActiveDisaster(null);
    setIsDisasterRunning(false);
    setSurvivalSec(0);
    setStructuralIntegrity(100);
    setCollapseReason('');

    // Reset AI states
    setScenarioPlaybackActive(false);
    setCurrentTimelineIndex(-1);
    setAiError('');
    
    if (deleteEntire) {
      setFrames([]);
      setWalls([]);
      setUtilities([]);
      setAiScenario(null);
    } else {
      // Keep existing structure but reset damaged values
      setFrames(prev => prev.map(f => ({ ...f, durability: 100 })));
    }
    setStage('framing');
  };

  // Simulation Update Callback
  const handleSimulationUpdate = (integrity: number, timeSec: number, reason: string) => {
    setStructuralIntegrity(integrity);
    setSurvivalSec(timeSec);
    if (reason && !collapseReason) {
      setCollapseReason(reason);
    }

    // Dynamic timeline advancement in AI scenario playback mode
    if (scenarioPlaybackActive && aiScenario && aiScenario.timeline) {
      const progressPercent = Math.min(100, (timeSec / 20) * 100);
      let activeIndex = -1;
      for (let i = 0; i < aiScenario.timeline.length; i++) {
        if (progressPercent >= aiScenario.timeline[i].timeOffset) {
          activeIndex = i;
        }
      }
      if (activeIndex !== currentTimelineIndex) {
        setCurrentTimelineIndex(activeIndex);
        if (activeIndex >= 0) {
          const milestone = aiScenario.timeline[activeIndex];
          setDisasterIntensity(milestone.suggestedIntensity);
        }
      }
    }
  };

  // AI Customized Disaster Scenario Fetch Handler
  const handleGenerateAiScenario = async () => {
    setIsGeneratingScenario(true);
    setAiScenario(null);
    setAiError('');
    setScenarioPlaybackActive(false);
    setCurrentTimelineIndex(-1);

    try {
      const response = await fetch('/api/generate-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingInfo: {
            frames: frames.map(f => ({ material: f.material, durability: f.durability })),
            walls: walls.map(w => ({ material: w.material, durability: w.durability })),
            utilities: utilities.map(u => ({ type: u.type, name: u.id }))
          }
        })
      });

      if (!response.ok) {
        throw new Error('AI 시나리오 분석 서버로부터 응답을 받지 못했습니다.');
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setAiScenario(data);
    } catch (error: any) {
      console.error(error);
      setAiError(error.message || 'AI 시나리오 생성 중 알 수 없는 요인으로 오류가 발생했습니다.');
    } finally {
      setIsGeneratingScenario(false);
    }
  };

  // Helper values
  const totalCost = 
    frames.reduce((sum, f) => sum + f.cost + (f.welded ? 35000 : 0), 0) +
    walls.reduce((sum, w) => sum + w.cost + (w.welded ? 35000 : 0), 0) +
    utilities.reduce((sum, u) => sum + u.cost, 0);

  const totalDamageCost = collapseReason ? totalCost : Math.round(totalCost * (1 - structuralIntegrity / 100));

  // Disaster details dictionary
  const disasterLabels = {
    earthquake: { name: '지진 (Seismic Wave)', icon: <Flame className="w-5 h-5 text-red-400" />, desc: '지표면이 좌우로 무작위 진동하여 결속부를 끊어놓습니다.' },
    tsunami: { name: '쓰나미 (Tsunami)', icon: <Waves className="w-5 h-5 text-blue-400" />, desc: '엄청난 양의 측압과 유수 저항으로 하단 기둥을 밀어냅니다.' },
    tornado: { name: '토네이도 (Tornado)', icon: <Wind className="w-5 h-5 text-teal-400" />, desc: '초고속 소용돌이가 가벼운 자재를 위로 들어올려 파괴합니다.' },
    flood: { name: '침수 / 홍수 (Flood)', icon: <Droplets className="w-5 h-5 text-sky-400" />, desc: '물이 지표면부터 침투해 밀도를 올리고 부력을 작용시킵니다.' },
  };

  // Determine structural grading
  const getSurvivalGrade = () => {
    if (structuralIntegrity >= 95) return { grade: 'S+', color: 'text-emerald-400 border-emerald-500' };
    if (structuralIntegrity >= 85) return { grade: 'A', color: 'text-green-400 border-green-500' };
    if (structuralIntegrity >= 70) return { grade: 'B', color: 'text-indigo-400 border-indigo-500' };
    if (structuralIntegrity >= 50) return { grade: 'C', color: 'text-amber-400 border-amber-500' };
    if (structuralIntegrity >= 30) return { grade: 'D', color: 'text-orange-400 border-orange-500' };
    return { grade: 'F', color: 'text-rose-500 border-rose-600 animate-pulse' };
  };

  const handleBackToStage = (targetStage: 'framing' | 'cladding') => {
    setActiveDisaster(null);
    setIsDisasterRunning(false);
    setStructuralIntegrity(100);
    setSurvivalSec(0);
    setCollapseReason('');
    setFrames(prev => prev.map(f => ({ ...f, durability: 100 })));
    setStage(targetStage);

    // Reset AI states
    setScenarioPlaybackActive(false);
    setCurrentTimelineIndex(-1);
    setAiError('');
  };

  const activeGrade = getSurvivalGrade();

  return (
    <div className="relative w-screen h-screen bg-[#0c0c0e] text-neutral-100 font-sans antialiased selection:bg-indigo-500 selection:text-white overflow-hidden flex flex-col lg:block">
      
      {/* Header Panel - Sticky on mobile, beautiful glass float on desktop */}
      <header className="px-4 py-3 bg-[#141418]/95 border-b border-neutral-800 flex flex-col md:flex-row items-center justify-between gap-3 shadow-md shrink-0 lg:absolute lg:top-4 lg:left-4 lg:right-4 lg:z-10 lg:h-16 lg:px-6 lg:py-0 lg:bg-neutral-950/70 lg:border lg:border-neutral-800/60 lg:backdrop-blur-md lg:rounded-2xl lg:shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm lg:text-base font-black tracking-tight text-white leading-tight">3D 내진 가상 시뮬레이터</h1>
            <p className="text-[10px] text-neutral-400 font-medium">3D Seismic Structural & Natural Disaster Simulator</p>
          </div>
        </div>

        {/* Wizard Progress Stepper */}
        <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 lg:border-neutral-800/40 lg:bg-neutral-900/40 px-3 py-1 rounded-full text-xs font-semibold">
          <button
            onClick={() => handleBackToStage('framing')}
            className={`px-3 py-0.5 rounded-full transition-colors ${stage === 'framing' ? 'bg-indigo-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'}`}
          >
            1단계: 뼈대 건설
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
          <button
            onClick={() => handleBackToStage('cladding')}
            className={`px-3 py-0.5 rounded-full transition-colors ${stage === 'cladding' ? 'bg-indigo-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'}`}
          >
            2단계: 외벽 & 설비
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
          <button
            onClick={() => {
              if (frames.length > 0) setStage('testing');
            }}
            disabled={frames.length === 0}
            className={`px-3 py-0.5 rounded-full transition-all ${stage === 'testing' ? 'bg-rose-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'}`}
          >
            3단계: 재해 테스트
          </button>
        </div>

        {/* Integrated Cost/Weight & Action Controls */}
        <div className="flex items-center gap-3">
          {/* Header Stats */}
          <div className="hidden xl:flex items-center gap-4 border-r border-neutral-800/60 pr-4 mr-1">
            <div className="text-right">
              <span className="block text-[9px] text-neutral-500 font-bold uppercase tracking-wider">총 시공액</span>
              <span className="text-xs font-bold text-amber-400 font-mono">₩{totalCost.toLocaleString()}</span>
            </div>
            <div className="text-right">
              <span className="block text-[9px] text-neutral-500 font-bold uppercase tracking-wider">전체 중량</span>
              <span className="text-xs font-bold text-indigo-400 font-mono">
                {(frames.reduce((sum, f) => sum + f.weight, 0) + walls.reduce((sum, w) => sum + w.weight, 0)).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg
              </span>
            </div>
          </div>

          <button
            id="settings-trigger-btn"
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 lg:border-neutral-800/40 lg:bg-neutral-900/40 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
            title="그래픽 및 키 설정 조작"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
          
          {stage === 'testing' ? (
            <button
              id="rebuild-trigger-btn"
              onClick={handleRebuildRequest}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 flex items-center gap-1.5 transition-all"
            >
              <RotateCcw className="w-4 h-4 text-amber-500" />
              재설계 (Rebuild)
            </button>
          ) : (
            <button
              id="next-stage-btn"
              onClick={() => {
                if (stage === 'framing') setStage('cladding');
                else if (stage === 'cladding') setStage('testing');
              }}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-900/20 hover:shadow-indigo-500/30 transition-all"
            >
              <span>다음 단계</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* 3D Canvas - Sitting in normal flow on mobile, absolute background on desktop */}
      <div className="relative w-full h-[45vh] shrink-0 lg:absolute lg:inset-0 lg:z-0 lg:h-full lg:w-full">
        <SimulatorCanvas
          stage={stage}
          selectedMaterial={selectedMaterial}
          selectedWallMaterial={selectedWallMaterial}
          selectedUtility={selectedUtility}
          frames={frames}
          walls={walls}
          utilities={utilities}
          onAddFrame={handleAddFrame}
          onUpdateFrame={handleUpdateFrame}
          onAddWall={handleAddWall}
          onUpdateWall={handleUpdateWall}
          onAddUtility={handleAddUtility}
          onUpdateUtility={handleUpdateUtility}
          onDeleteElement={handleDeleteElement}
          onClearAll={handleConfirmRebuild}
          activeDisaster={activeDisaster}
          disasterIntensity={disasterIntensity}
          qualitySettings={qualitySettings}
          isDisasterRunning={isDisasterRunning}
          onSimulationUpdate={handleSimulationUpdate}
          activeAiTimelineStep={scenarioPlaybackActive && aiScenario && currentTimelineIndex >= 0 ? aiScenario.timeline[currentTimelineIndex] : null}
        />

        {/* Floating AI Scenario Subtitle overlay */}
        {scenarioPlaybackActive && aiScenario && currentTimelineIndex >= 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-xl bg-neutral-950/85 border border-rose-500/50 backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl flex flex-col items-center text-center animate-pulse">
            <span className="text-[10px] font-black tracking-widest text-rose-500 uppercase flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              실시간 AI 맞춤 재해 시뮬레이션 진행 중
            </span>
            <h4 className="text-sm font-black text-white mt-1">
              {aiScenario.timeline[currentTimelineIndex].stageName} (강도: Lv.{disasterIntensity})
            </h4>
            <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
              {aiScenario.timeline[currentTimelineIndex].description}
            </p>
            {/* Display active state of dynamic effects returned by Gemini API */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2.5 text-[9px] font-bold text-neutral-400 border-t border-neutral-800/60 pt-2 w-full">
              <span className={aiScenario.timeline[currentTimelineIndex].dynamicEffects.glassShatter ? "text-sky-400" : "opacity-45"}>
                ✦ 유리 파열 {aiScenario.timeline[currentTimelineIndex].dynamicEffects.glassShatter ? "발생" : "미발생"}
              </span>
              <span className={aiScenario.timeline[currentTimelineIndex].dynamicEffects.wallBreak ? "text-amber-400" : "opacity-45"}>
                ✦ 외벽 붕괴 {aiScenario.timeline[currentTimelineIndex].dynamicEffects.wallBreak ? "발생" : "미발생"}
              </span>
              <span className={aiScenario.timeline[currentTimelineIndex].dynamicEffects.lightsOut ? "text-rose-400" : "opacity-45"}>
                ✦ 비상 정전 {aiScenario.timeline[currentTimelineIndex].dynamicEffects.lightsOut ? "발생" : "미발생"}
              </span>
              <span className={aiScenario.timeline[currentTimelineIndex].dynamicEffects.fireAlarm ? "text-emerald-400" : "opacity-45"}>
                ✦ 소방 경보 {aiScenario.timeline[currentTimelineIndex].dynamicEffects.fireAlarm ? "발생" : "미발생"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main UI HUD Container - Floating elements above Three.js background */}
      <div className="flex-1 overflow-y-auto lg:overflow-visible p-4 flex flex-col gap-4 lg:p-0 lg:pointer-events-none">
        
        {/* Left Side Controller Panel (Floating on lg screens) */}
        <div className="flex flex-col gap-4 shrink-0 lg:absolute lg:top-24 lg:left-4 lg:bottom-4 lg:w-[350px] lg:z-10 lg:overflow-y-auto lg:pr-1 lg:pb-1 lg:gap-4 lg:scrollbar-none lg:pointer-events-auto">
          
          {/* Active Stage Detail Info Card */}
          <div className="bg-[#141418] border border-neutral-800 rounded-2xl p-4 shadow-lg lg:bg-neutral-950/70 lg:border-neutral-800/60 lg:backdrop-blur-md">
            <h2 className="text-sm font-bold text-neutral-300 mb-2.5 flex items-center gap-1.5 border-b border-neutral-800 lg:border-neutral-800/40 pb-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              {stage === 'framing' && '구조 뼈대 설계'}
              {stage === 'cladding' && '외벽 & 유틸리티 구축'}
              {stage === 'testing' && '내진 안전성 계측기'}
            </h2>

            {stage === 'framing' && (
              <div className="space-y-3.5 text-xs text-neutral-300 leading-relaxed">
                <p>
                  건물의 뼈대가 될 기둥과 대들보를 자재별로 건설하세요. 뼈대 끝과 끝이 겹치면 <strong className="text-indigo-400">자동 용접</strong>됩니다.
                </p>
                <div className="p-3 bg-neutral-900/50 lg:bg-neutral-900/20 rounded-xl border border-neutral-800 lg:border-neutral-800/40 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">배치된 뼈대 개수:</span>
                    <span className="font-bold text-white font-mono">{frames.length}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">예상 골조 비용:</span>
                    <span className="font-bold text-indigo-400 font-mono">
                      ₩{(frames.reduce((sum, f) => sum + f.cost, 0)).toLocaleString()}
                    </span>
                  </div>
                  {frames.some(f => f.welded) && (
                    <div className="flex justify-between text-[11px] text-cyan-400">
                      <span>└ 추가 강도 용접 ({frames.filter(f => f.welded).length}개):</span>
                      <span className="font-bold font-mono">
                        +₩{(frames.filter(f => f.welded).length * 35000).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {stage === 'cladding' && (
              <div className="space-y-3.5 text-xs text-neutral-300 leading-relaxed">
                <p>
                  기둥 사이에 안전 외벽을 추가하세요. 콘크리트나 강철 플레이트 벽은 횡압력(지진/태풍)을 견디는 핵심 자재가 됩니다. 문, 배수 설비를 배치하여 유틸 안전을 강화하세요.
                </p>
                <div className="p-3 bg-neutral-900/50 lg:bg-neutral-900/20 rounded-xl border border-neutral-800 lg:border-neutral-800/40 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">배치된 외벽 수:</span>
                    <span className="font-bold text-white font-mono">{walls.length}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">예상 외벽 비용:</span>
                    <span className="font-bold text-indigo-400 font-mono">
                      ₩{walls.reduce((sum, w) => sum + w.cost, 0).toLocaleString()}
                    </span>
                  </div>
                  {walls.some(w => w.welded) && (
                    <div className="flex justify-between text-[11px] text-cyan-400">
                      <span>└ 추가 벽체 용접 ({walls.filter(w => w.welded).length}개):</span>
                      <span className="font-bold font-mono">
                        +₩{(walls.filter(w => w.welded).length * 35000).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-neutral-500">배치된 안전 설비:</span>
                    <span className="font-bold text-white font-mono">{utilities.length}개</span>
                  </div>
                </div>
              </div>
            )}

            {stage === 'testing' && (
              <div className="space-y-4 text-xs">
                {/* Mode Select Tabs */}
                <div className="grid grid-cols-2 p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
                  <button
                    onClick={() => {
                      setTestingTab('manual');
                      setScenarioPlaybackActive(false);
                      setCurrentTimelineIndex(-1);
                    }}
                    className={`py-2 font-bold rounded-lg transition-all cursor-pointer ${
                      testingTab === 'manual' 
                        ? 'bg-neutral-800 text-white shadow-sm' 
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    기본 수동 제어
                  </button>
                  <button
                    onClick={() => setTestingTab('ai')}
                    className={`py-2 font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      testingTab === 'ai' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                    AI 맞춤 시나리오
                  </button>
                </div>

                {testingTab === 'manual' ? (
                  <div className="space-y-4">
                    <p className="text-neutral-400 leading-relaxed">
                      자연재해 유형과 강도를 선택한 후 [재해 테스트 실행] 버튼을 눌러 물리 시뮬레이션을 진행하세요.
                    </p>

                    {/* Disaster Choice List */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">재해 선택</span>
                      <div className="grid grid-cols-2 gap-2">
                        {(['earthquake', 'tsunami', 'tornado', 'flood'] as const).map(type => {
                          const isActive = activeDisaster === type && !scenarioPlaybackActive;
                          return (
                            <button
                              key={type}
                              onClick={() => {
                                setActiveDisaster(type);
                                setCollapseReason('');
                                setIsDisasterRunning(false);
                                setScenarioPlaybackActive(false);
                              }}
                              className={`p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                                isActive 
                                  ? 'bg-rose-500/25 border-rose-500 text-white shadow-md' 
                                  : 'bg-neutral-900 lg:bg-neutral-900/30 border-neutral-800 lg:border-neutral-800/40 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                              }`}
                            >
                              {type === 'earthquake' && <Flame className={`w-4 h-4 ${isActive ? 'text-red-400' : 'text-neutral-500'}`} />}
                              {type === 'tsunami' && <Waves className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-neutral-500'}`} />}
                              {type === 'tornado' && <Wind className={`w-4 h-4 ${isActive ? 'text-teal-400' : 'text-neutral-500'}`} />}
                              {type === 'flood' && <Droplets className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-neutral-500'}`} />}
                              <span className="font-bold text-[10px]">{type === 'earthquake' ? '지진' : type === 'tsunami' ? '쓰나미' : type === 'tornado' ? '토네이도' : '홍수'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Intensity Slider */}
                    {activeDisaster && !scenarioPlaybackActive && (
                      <div className="space-y-2 border-t border-neutral-800 lg:border-neutral-800/40 pt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">재해 강도 (Level)</span>
                          <span className="font-mono text-sm font-black text-rose-500">Lv. {disasterIntensity}</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          value={disasterIntensity}
                          onChange={(e) => {
                            setDisasterIntensity(parseInt(e.target.value));
                            setIsDisasterRunning(false);
                          }}
                          className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                        />
                        <p className="text-[10px] text-neutral-500 leading-snug">
                          {disasterLabels[activeDisaster].desc}
                        </p>
                      </div>
                    )}

                    {/* Disaster Execution Control Button */}
                    <div className="space-y-2 border-t border-neutral-800 lg:border-neutral-800/40 pt-3">
                      {!isDisasterRunning ? (
                        <>
                          <button
                            id="start-disaster-btn"
                            onClick={() => {
                              if (!activeDisaster) {
                                setActiveDisaster('earthquake');
                              }
                              setIsDisasterRunning(true);
                              setCollapseReason('');
                              setScenarioPlaybackActive(false);
                            }}
                            className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-950/50 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                          >
                            <Play className="w-4 h-4 fill-current text-white" />
                            <span>재해 테스트 실행</span>
                          </button>
                          <div className="text-[10px] text-center text-neutral-500 font-medium">
                            버튼을 누르면 실시간 물리 연산(Matter.js)으로 재해 시뮬레이션이 시작됩니다.
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Flame className="w-4 h-4 text-rose-400 animate-pulse" />
                              <span>재해 시뮬레이션 동작 중</span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 font-mono">
                              {survivalSec.toFixed(1)}s
                            </span>
                          </div>
                          <button
                            id="stop-disaster-btn"
                            onClick={() => {
                              setIsDisasterRunning(false);
                              setCollapseReason('');
                              setScenarioPlaybackActive(false);
                            }}
                            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4 text-amber-400" />
                            <span>재해 시뮬레이션 중지 및 초기화</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  // --- AI Scenario Mode Tab UI ---
                  <div className="space-y-4">
                    {aiError && (
                      <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-200 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">시나리오 진단 오류:</span>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-red-300">{aiError}</p>
                        </div>
                      </div>
                    )}

                    {!aiScenario && !isGeneratingScenario && (
                      <div className="p-4 bg-neutral-900/50 rounded-2xl border border-neutral-800/80 text-center space-y-3.5">
                        <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
                          <Sparkles className="w-5 h-5 animate-pulse" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-neutral-200">AI 맞춤형 재난 시나리오 설계</h4>
                          <p className="text-[11px] text-neutral-400 leading-relaxed px-1">
                            현재 설계된 골조 자재(강철/강화콘크리트 등), 외벽 패널 구성, 유틸 설비를 기반으로 가장 취약한 자연재해 시나리오를 자동 예측 생성합니다.
                          </p>
                        </div>

                        {/* Brief Build Overview */}
                        <div className="text-[10px] text-left text-neutral-400 bg-neutral-950/50 p-3 rounded-xl border border-neutral-800 font-mono space-y-1">
                          <div className="text-neutral-500 uppercase font-black tracking-wider text-[8px] pb-1 border-b border-neutral-800/50">현재 시공 현황</div>
                          <div className="flex justify-between">
                            <span>골조 뼈대:</span>
                            <span className="text-white font-bold">{frames.length}개 설치됨</span>
                          </div>
                          <div className="flex justify-between">
                            <span>마감 외벽:</span>
                            <span className="text-white font-bold">{walls.length}개 시공됨</span>
                          </div>
                          <div className="flex justify-between">
                            <span>안전 설비:</span>
                            <span className="text-amber-400 font-bold">{utilities.length}개 배치됨</span>
                          </div>
                        </div>

                        <button
                          onClick={handleGenerateAiScenario}
                          disabled={frames.length === 0}
                          className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:from-neutral-800 disabled:to-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg shadow-indigo-950/40 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                        >
                          <Zap className="w-4 h-4 text-amber-300 animate-pulse" />
                          <span>AI 시나리오 & 타임라인 진단서 발급</span>
                        </button>
                      </div>
                    )}

                    {isGeneratingScenario && (
                      <div className="p-8 bg-neutral-900/40 rounded-2xl border border-neutral-800 text-center flex flex-col items-center justify-center space-y-4 min-h-[220px]">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        <div className="space-y-1.5">
                          <h4 className="font-bold text-neutral-200">구조 설계 정밀 검정 중</h4>
                          <p className="text-[10px] text-neutral-400 leading-relaxed font-mono animate-pulse">
                            - 3D 골조 노드 결속도 수식 연산 중...
                          </p>
                          <p className="text-[10px] text-indigo-400 leading-relaxed font-mono animate-pulse delay-75">
                            - Gemini 3.6 재해 극적 하중 모델링 산출 중...
                          </p>
                        </div>
                      </div>
                    )}

                    {aiScenario && !isGeneratingScenario && (
                      <div className="space-y-4">
                        {/* Scenario Synopsis */}
                        <div className="p-3.5 bg-neutral-900/60 rounded-xl border border-neutral-800/80 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30">
                              위협 등급: 위험(Level.{aiScenario.timeline[2]?.suggestedIntensity || 8})
                            </span>
                            <span className="text-[10px] font-bold text-neutral-400 flex items-center gap-1">
                              {aiScenario.hazardType === 'earthquake' && <Flame className="w-3.5 h-3.5 text-red-400" />}
                              {aiScenario.hazardType === 'tsunami' && <Waves className="w-3.5 h-3.5 text-blue-400" />}
                              {aiScenario.hazardType === 'tornado' && <Wind className="w-3.5 h-3.5 text-teal-400" />}
                              {aiScenario.hazardType === 'flood' && <Droplets className="w-3.5 h-3.5 text-sky-400" />}
                              {aiScenario.hazardType === 'earthquake' ? '지진' : aiScenario.hazardType === 'tsunami' ? '쓰나미' : aiScenario.hazardType === 'tornado' ? '토네이도' : '홍수'} 선정
                            </span>
                          </div>
                          <h4 className="font-black text-xs text-white leading-tight">{aiScenario.title}</h4>
                          <p className="text-[11px] text-neutral-300 leading-relaxed border-t border-neutral-800/60 pt-2 font-medium">
                            {aiScenario.description}
                          </p>
                        </div>

                        {/* Detected Structural Weaknesses */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                            구조적 취약 요인 분석 리포트
                          </span>
                          <div className="space-y-1.5">
                            {aiScenario.structuralWeaknesses.map((weakness: string, i: number) => (
                              <div key={i} className="p-2.5 bg-neutral-950/60 rounded-lg border border-neutral-800 flex gap-2">
                                <span className="font-bold text-rose-500 text-[10px] shrink-0 font-mono">0{i+1}.</span>
                                <span className="text-[10.5px] text-neutral-300 leading-relaxed">{weakness}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Disaster Simulation Milestones Timeline */}
                        <div className="space-y-2 border-t border-neutral-800/50 pt-3">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                            재난 발생 실시간 타임라인 예보
                          </span>
                          <div className="relative border-l border-neutral-800 pl-3.5 space-y-4 ml-1.5 pt-1">
                            {aiScenario.timeline.map((step: any, i: number) => {
                              const isActive = scenarioPlaybackActive && currentTimelineIndex === i;
                              const isPassed = scenarioPlaybackActive && currentTimelineIndex > i;
                              return (
                                <div key={i} className="relative">
                                  {/* Milestone node dot marker */}
                                  <div className={`absolute -left-[20.5px] top-1 w-3 h-3 rounded-full border-2 transition-all ${
                                    isActive 
                                      ? 'bg-rose-500 border-rose-300 scale-125 shadow-lg shadow-rose-500/50 animate-ping' 
                                      : isPassed 
                                        ? 'bg-emerald-500 border-emerald-700' 
                                        : 'bg-neutral-800 border-neutral-700'
                                  }`} />
                                  <div className={`absolute -left-[20.5px] top-1 w-3 h-3 rounded-full border-2 transition-all ${
                                    isActive 
                                      ? 'bg-rose-500 border-rose-300 scale-110 shadow-lg shadow-rose-500/50' 
                                      : isPassed 
                                        ? 'bg-emerald-500 border-emerald-700' 
                                        : 'bg-neutral-800 border-neutral-700'
                                  }`} />

                                  <div className={`space-y-1 p-2 rounded-xl transition-all ${isActive ? 'bg-indigo-950/30 border border-indigo-500/30 shadow' : 'bg-neutral-950/20'}`}>
                                    <div className="flex items-center justify-between">
                                      <span className={`font-bold text-[10.5px] ${isActive ? 'text-indigo-300' : isPassed ? 'text-neutral-400' : 'text-neutral-200'}`}>
                                        {step.stageName}
                                      </span>
                                      <span className="text-[9px] font-mono text-neutral-500">
                                        기동 {step.timeOffset}% 시점
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-neutral-400 leading-normal font-medium">{step.description}</p>
                                    <div className="flex gap-2 text-[8px] font-bold text-neutral-500 font-mono mt-1">
                                      <span>추천 강도: Lv.{step.suggestedIntensity}</span>
                                      {step.dynamicEffects.glassShatter && <span className="text-sky-400/80">✦ 유리파열</span>}
                                      {step.dynamicEffects.wallBreak && <span className="text-amber-400/80">✦ 외벽분해</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Interactive Playback Control Trigger */}
                        <div className="border-t border-neutral-800/50 pt-3 space-y-2">
                          {!isDisasterRunning ? (
                            <button
                              onClick={() => {
                                setActiveDisaster(aiScenario.hazardType);
                                setDisasterIntensity(aiScenario.timeline[0]?.suggestedIntensity || 5);
                                setScenarioPlaybackActive(true);
                                setCurrentTimelineIndex(-1);
                                setIsDisasterRunning(true);
                                setCollapseReason('');
                              }}
                              className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                            >
                              <Play className="w-4 h-4 fill-current text-white animate-pulse" />
                              <span>AI 시나리오 시뮬레이션 가동</span>
                            </button>
                          ) : (
                            <div className="space-y-2">
                              <div className="p-2.5 rounded-xl bg-indigo-950/50 border border-indigo-500/40 text-indigo-200 text-xs font-bold flex items-center justify-between">
                                <div className="flex items-center gap-2 animate-pulse">
                                  <Sparkles className="w-4 h-4 text-indigo-400" />
                                  <span>AI 타임라인 실시간 궤적 제어 중</span>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-100 font-mono">
                                  {survivalSec.toFixed(1)}s
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  setIsDisasterRunning(false);
                                  setCollapseReason('');
                                  setScenarioPlaybackActive(false);
                                }}
                                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                              >
                                <RotateCcw className="w-4 h-4 text-amber-400" />
                                <span>AI 시뮬레이션 중지 및 리셋</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Survival Escape and Improvement Recommendation cards */}
                        <div className="p-3 bg-neutral-900/40 border border-neutral-800 rounded-xl space-y-1.5">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            AI 탈출 & 인명 대피 분석
                          </span>
                          <p className="text-[10.5px] text-neutral-300 leading-relaxed font-medium">{aiScenario.escapeAnalysis}</p>
                        </div>

                        <div className="p-3 bg-neutral-900/40 border border-neutral-800 rounded-xl space-y-2">
                          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1">
                            <Cpu className="w-3.5 h-3.5 text-amber-400" />
                            AI 추천 보강 설계안
                          </span>
                          <div className="space-y-1">
                            {aiScenario.improvementTips.map((tip: string, i: number) => (
                              <div key={i} className="text-[10.5px] text-neutral-300 leading-normal flex gap-1.5">
                                <span className="text-amber-500 font-bold shrink-0">✔</span>
                                <span>{tip}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Recalibrate button */}
                        <button
                          onClick={handleGenerateAiScenario}
                          className="w-full py-2.5 px-3 rounded-lg text-[10px] font-bold bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all cursor-pointer border border-neutral-800"
                        >
                          시나리오 다시 로드 및 다른 변수 분석
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Real-time Structural Stats Output Dashboard */}
          <div className="bg-[#141418] border border-neutral-800 rounded-2xl p-4 shadow-lg flex-1 flex flex-col justify-between lg:bg-neutral-950/70 lg:border-neutral-800/60 lg:backdrop-blur-md">
            <div>
              <h2 className="text-sm font-bold text-neutral-300 mb-4 flex items-center gap-1.5 border-b border-neutral-800 lg:border-neutral-800/40 pb-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                구조 및 안전도 계측
              </h2>

              <div className="space-y-4">
                {/* Structural Integrity Progress Bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-neutral-400 font-medium">구조물 안전도 지수</span>
                    <span className="font-bold font-mono text-white">{structuralIntegrity}%</span>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden border border-neutral-800 lg:border-neutral-800/40">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        structuralIntegrity > 75 ? 'bg-emerald-500' : structuralIntegrity > 40 ? 'bg-amber-500 animate-pulse' : 'bg-red-500 animate-pulse'
                      }`}
                      style={{ width: `${structuralIntegrity}%` }}
                    />
                  </div>
                </div>

                {/* Seismic Limit Lifespan Rating (내진 연한) */}
                <div className="flex items-center justify-between bg-neutral-900/60 lg:bg-neutral-900/20 p-3 rounded-xl border border-neutral-800 lg:border-neutral-800/40">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">추정 내진 수명</span>
                    <span className="text-neutral-500 text-[9px]">Calculated Seismic Rating</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-indigo-400 font-mono">{seismicRating}</span>
                    <span className="text-xs text-neutral-400 font-bold ml-0.5">년</span>
                  </div>
                </div>

                {/* Survival Time statistics */}
                <div className="flex items-center justify-between bg-neutral-900/60 lg:bg-neutral-900/20 p-3 rounded-xl border border-neutral-800 lg:border-neutral-800/40">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">재해 버틴 시간</span>
                    <span className="text-neutral-500 text-[9px]">Time Lapsed</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-white font-mono">{survivalSec.toFixed(1)}</span>
                    <span className="text-xs text-neutral-400 font-bold ml-0.5">초</span>
                  </div>
                </div>

                {/* Damage Estimate budget */}
                <div className="flex items-center justify-between bg-neutral-900/60 lg:bg-neutral-900/20 p-3 rounded-xl border border-neutral-800 lg:border-neutral-800/40">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">재해 피해 환산액</span>
                    <span className="text-neutral-500 text-[9px]">Estimated Damage Cost</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-rose-400 font-mono">
                      ₩{totalDamageCost.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Simulated Disaster Grading output */}
            {stage === 'testing' && activeDisaster && (
              <div className="mt-5 pt-4 border-t border-neutral-800 lg:border-neutral-800/40 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">안전 인증 등급</span>
                  <span className="text-xs text-neutral-300 font-semibold">Seismic Grade Certificate</span>
                </div>
                <div className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center font-black text-2xl font-mono bg-neutral-900/40 ${activeGrade.color}`}>
                  {activeGrade.grade}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Menu / Palette Selector (Floating on lg screens) */}
        <div className="bg-[#141418] border border-neutral-800 rounded-2xl p-4 shadow-lg shrink-0 lg:absolute lg:bottom-4 lg:left-[382px] lg:right-4 lg:z-10 lg:bg-neutral-950/70 lg:border-neutral-800/60 lg:backdrop-blur-md lg:pointer-events-auto">
          <div className="flex items-center justify-between mb-3.5 border-b border-neutral-800 lg:border-neutral-800/40 pb-2">
            <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              {stage === 'framing' && '건설 뼈대 소재 선택'}
              {stage === 'cladding' && '외벽 마감재 & 보강 유틸리티 선택'}
              {stage === 'testing' && '재해 테스트 상태 정보'}
            </h3>
            <span className="hidden sm:flex text-[10px] text-neutral-500 font-medium items-center gap-1">
              <Info className="w-3.5 h-3.5 text-neutral-400" />
              소재 카드에 마우스를 올리면 1M 기준 상세 사양이 표시됩니다.
            </span>
          </div>

          {/* Materials Grid */}
          {stage === 'framing' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.values(FRAMEWORK_MATERIALS).map((mat) => {
                const isSelected = selectedMaterial === mat.id;
                return (
                  <div 
                    key={mat.id}
                    onClick={() => setSelectedMaterial(mat.id)}
                    className={`relative group p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-indigo-600/15 border-indigo-500 text-white shadow-md' 
                        : 'bg-neutral-900 lg:bg-neutral-900/30 border-neutral-800 lg:border-neutral-800/40 hover:border-neutral-700 text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mat.color }} />
                      <span className="font-bold text-xs">{mat.nameKo}</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 font-mono space-y-0.5">
                      <div>비용: ₩{mat.costPerMeter.toLocaleString()}/M</div>
                      <div>무게: {mat.density}kg/M</div>
                    </div>

                    {/* Hover Popup specifying 1m parameters */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-neutral-950 border border-neutral-700 p-3.5 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all z-30 font-sans text-[11px] leading-relaxed">
                      <div className="font-bold text-white mb-2 pb-1 border-b border-neutral-800 text-xs">
                        {mat.nameKo} (1M 환산 상세 정보)
                      </div>
                      <div className="space-y-1.5 text-neutral-300 font-mono">
                        <div className="flex justify-between">
                          <span>자재 중량:</span>
                          <span className="text-white">{mat.density} kg/m</span>
                        </div>
                        <div className="flex justify-between">
                          <span>건설 가격:</span>
                          <span className="text-indigo-400">₩{mat.costPerMeter.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>소재 강도:</span>
                          <span className="text-emerald-400">{mat.durability}/100</span>
                        </div>
                        <div className="flex justify-between">
                          <span>연성/탄성 지수:</span>
                          <span className="text-amber-400">{(mat.flexibility * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>방수 능력:</span>
                          <span className="text-sky-400">{(mat.waterResistance * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {stage === 'cladding' && (
            <div className="space-y-4">
              {/* Wall Choice Row */}
              <div>
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">마감 외벽 패널</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.values(WALL_MATERIALS).map((wall) => {
                    const isSelected = selectedWallMaterial === wall.id;
                    return (
                      <div 
                        key={wall.id}
                        onClick={() => setSelectedWallMaterial(wall.id)}
                        className={`relative group p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-indigo-600/15 border-indigo-500 text-white' 
                            : 'bg-neutral-900 lg:bg-neutral-900/30 border-neutral-800 lg:border-neutral-800/40 hover:border-neutral-700 text-neutral-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: wall.color }} />
                          <span className="font-bold text-xs">{wall.nameKo}</span>
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono space-y-0.5">
                          <div>비용: ₩{wall.costPerSqm.toLocaleString()}/㎡</div>
                          <div>무게: {wall.weightPerSqm}kg/㎡</div>
                        </div>

                        {/* Hover parameters */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-neutral-950 border border-neutral-700 p-3.5 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all z-30 font-sans text-[11px] leading-relaxed">
                          <div className="font-bold text-white mb-2 pb-1 border-b border-neutral-800 text-xs">
                            {wall.nameKo} (1㎡ 상세 규격)
                          </div>
                          <div className="space-y-1.5 text-neutral-300 font-mono">
                            <div className="flex justify-between">
                              <span>패널 중량:</span>
                              <span className="text-white">{wall.weightPerSqm} kg/㎡</span>
                            </div>
                            <div className="flex justify-between">
                              <span>시공 가격:</span>
                              <span className="text-indigo-400">₩{wall.costPerSqm.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>내구도 지수:</span>
                              <span className="text-emerald-400">{wall.durability}/100</span>
                            </div>
                            <div className="flex justify-between">
                              <span>횡탄성 지수:</span>
                              <span className="text-amber-400">{wall.shearStrength}/100</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Utilities Row */}
              <div>
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">보강 설비 (Utilities)</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Object.values(UTILITIES).map((util) => {
                    const isSelected = selectedUtility === util.id;
                    return (
                      <div 
                        key={util.id}
                        onClick={() => setSelectedUtility(util.id)}
                        className={`relative group p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-amber-500/15 border-amber-500 text-white' 
                            : 'bg-neutral-900 lg:bg-neutral-900/30 border-neutral-800 lg:border-neutral-800/40 hover:border-neutral-700 text-neutral-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: util.color }} />
                          <span className="font-bold text-xs">{util.nameKo}</span>
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono space-y-0.5">
                          <div>설치 단가: ₩{util.cost.toLocaleString()}</div>
                          <div className="text-indigo-400 font-semibold">{util.safetyEffect}</div>
                        </div>

                        {/* Hover parameters */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-neutral-950 border border-neutral-700 p-3.5 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all z-30 font-sans text-[11px] leading-relaxed">
                          <div className="font-bold text-white mb-1.5 pb-1 border-b border-neutral-800 text-xs">
                            {util.nameKo}
                          </div>
                          <p className="text-neutral-400 mb-2 font-medium">{util.description}</p>
                          <div className="flex justify-between text-neutral-300 font-mono">
                            <span>안전 효과:</span>
                            <span className="text-amber-400 font-bold">{util.safetyEffect}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {stage === 'testing' && (
            <div className="text-xs text-neutral-400 flex items-start gap-2.5 bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
              <div className="leading-relaxed">
                {collapseReason ? (
                  <div className="text-rose-400 font-bold">
                    [붕괴 감지] {collapseReason}! 안전 등급 미달로 건물이 최종 전파되었습니다. 재설계(Rebuild)를 통해 골조 보강 설계를 시작하세요.
                  </div>
                ) : (
                  <div>
                    {activeDisaster ? (
                      <>
                        <strong className="text-white">{disasterLabels[activeDisaster].name}</strong> 시뮬레이션이 활성화되었습니다. 강도가 오를수록 구조 용접 부위에 가해지는 모멘트 하중이 커지며, 허용 탄성 범위를 넘어설 시 격자 골조가 파단됩니다.
                      </>
                    ) : (
                      '동작 대기 중입니다. 좌측 패널에서 테스트할 자연재해를 선택해주세요.'
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Rebuild Options Modal Dialogue (keepExisting or delete) */}
      {isRebuildModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-500" />
              건물 재건설 및 리빌드
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed mb-6">
              현재 지어진 건물을 어떻게 처리하시겠습니까? 건물을 완전히 철거하여 처음부터 다시 지을 수도 있고, 손상된 뼈대를 보강하여 시뮬레이션을 재개할 수도 있습니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                id="rebuild-keep-btn"
                onClick={() => handleConfirmRebuild(false)}
                className="py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs border border-neutral-700 transition-colors"
              >
                현재 구조 유지 (보강 설계)
              </button>
              <button
                id="rebuild-delete-btn"
                onClick={() => handleConfirmRebuild(true)}
                className="py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-900/20 transition-all"
              >
                전체 철거 후 새로 짓기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Options Panel Component */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={qualitySettings}
        onSettingsChange={setQualitySettings}
        onLoadTemplate={handleLoadTemplate}
      />
    </div>
  );
}
