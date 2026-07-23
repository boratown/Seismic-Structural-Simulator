/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Settings, X, Keyboard, Laptop, ShieldCheck, Home, Building, Building2, Download } from 'lucide-react';
import { QualitySettings } from '../types';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: QualitySettings;
  onSettingsChange: (settings: QualitySettings) => void;
  onLoadTemplate: (type: 'house' | 'apartment' | 'skyscraper') => void;
}

export default function SettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onLoadTemplate,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'graphics' | 'templates' | 'keyboard'>('graphics');
  const [loadedMsg, setLoadedMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePreset = (level: 'low' | 'medium' | 'high') => {
    onSettingsChange({
      graphics: level,
      textures: level,
      polygons: level,
      shadows: level,
      distance: level,
      clouds: level === 'high' ? 'fancy' : level === 'medium' ? 'fast' : 'off',
      water: level === 'high' ? 'fancy' : level === 'medium' ? 'fast' : 'static',
    });
  };

  const handleIndividualChange = (key: keyof QualitySettings, value: any) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  const triggerLoadTemplate = (type: 'house' | 'apartment' | 'skyscraper', label: string) => {
    onLoadTemplate(type);
    setLoadedMsg(`"${label}" 설계 도면이 성공적으로 활성화되었습니다!`);
    setTimeout(() => setLoadedMsg(null), 3000);
  };

  const presetLabels: Record<string, string> = {
    low: '낮음',
    medium: '보통',
    high: '높음',
    off: '제거(끄기)',
    fancy: '화려하게',
    fast: '빠르게',
    static: '움직임 없음',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        id="settings-modal" 
        className="w-full max-w-lg bg-neutral-900 border border-neutral-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white font-sans">시뮬레이터 설정</h2>
          </div>
          <button 
            id="close-settings-btn"
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800">
          <button
            id="tab-graphics-btn"
            onClick={() => setActiveTab('graphics')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'graphics'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Laptop className="w-4 h-4" />
            그래픽 & 최적화
          </button>
          <button
            id="tab-templates-btn"
            onClick={() => setActiveTab('templates')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'templates'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Home className="w-4 h-4" />
            설계 도면 불러오기
          </button>
          <button
            id="tab-keyboard-btn"
            onClick={() => setActiveTab('keyboard')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'keyboard'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            단축키 안내
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {activeTab === 'graphics' ? (
            <div className="space-y-6">
              {/* Quick Presets */}
              <div>
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-3">
                  빠른 그래픽 프리셋
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((level) => {
                    const isSelected = 
                      settings.graphics === level &&
                      settings.textures === level &&
                      settings.polygons === level &&
                      settings.shadows === level &&
                      settings.distance === level;
                    
                    return (
                      <button
                        key={level}
                        id={`preset-${level}-btn`}
                        onClick={() => handlePreset(level)}
                        className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                          isSelected
                            ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md shadow-indigo-900/10'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        {presetLabels[level]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Individual Settings */}
              <div className="space-y-4 border-t border-neutral-800 pt-4">
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                  세부 성능 조정
                </span>

                {/* Render Quality */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-200">그래픽 품질 (Shader/WebGL)</span>
                    <span className="text-xs text-neutral-500">실시간 조명 및 셰이더 정밀도</span>
                  </div>
                  <div className="flex gap-1 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
                    {(['low', 'medium', 'high'] as const).map((val) => (
                      <button
                        key={val}
                        onClick={() => handleIndividualChange('graphics', val)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                          settings.graphics === val
                            ? 'bg-neutral-700 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {presetLabels[val]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textures */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-200">이미지 / 텍스처 해상도</span>
                    <span className="text-xs text-neutral-500">콘크리트, 벽돌 등의 질감 표현</span>
                  </div>
                  <div className="flex gap-1 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
                    {(['low', 'medium', 'high'] as const).map((val) => (
                      <button
                        key={val}
                        onClick={() => handleIndividualChange('textures', val)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                          settings.textures === val
                            ? 'bg-neutral-700 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {presetLabels[val]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Polygons */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-200">폴리곤 수 (세분화도)</span>
                    <span className="text-xs text-neutral-500">3D 입체 기둥 및 연결 노드 디테일</span>
                  </div>
                  <div className="flex gap-1 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
                    {(['low', 'medium', 'high'] as const).map((val) => (
                      <button
                        key={val}
                        onClick={() => handleIndividualChange('polygons', val)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                          settings.polygons === val
                            ? 'bg-neutral-700 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {presetLabels[val]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shadows */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-200">그림자 품질</span>
                    <span className="text-xs text-neutral-500">지표면 그림자의 해상도 및 부드러움</span>
                  </div>
                  <div className="flex gap-1 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
                    {(['low', 'medium', 'high'] as const).map((val) => (
                      <button
                        key={val}
                        onClick={() => handleIndividualChange('shadows', val)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                          settings.shadows === val
                            ? 'bg-neutral-700 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {presetLabels[val]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Render Distance */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-200">가시거리 (안개)</span>
                    <span className="text-xs text-neutral-500">배경 하늘 및 재해 효과 렌더 범위</span>
                  </div>
                  <div className="flex gap-1 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
                    {(['off', 'low', 'medium', 'high'] as const).map((val) => (
                      <button
                        key={val}
                        onClick={() => handleIndividualChange('distance', val as any)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                          settings.distance === val
                            ? 'bg-neutral-700 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {presetLabels[val]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clouds Detail */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-200">구름 디테일</span>
                    <span className="text-xs text-neutral-500">배경 구름 렌더링 품질</span>
                  </div>
                  <div className="flex gap-1 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
                    {(['off', 'fast', 'fancy'] as const).map((val) => (
                      <button
                        key={val}
                        onClick={() => handleIndividualChange('clouds', val as any)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                          settings.clouds === val
                            ? 'bg-neutral-700 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {presetLabels[val]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Water Detail */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-200">물 디테일</span>
                    <span className="text-xs text-neutral-500">홍수 및 쓰나미 그래픽 품질</span>
                  </div>
                  <div className="flex gap-1 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
                    {(['static', 'fast', 'fancy'] as const).map((val) => (
                      <button
                        key={val}
                        onClick={() => handleIndividualChange('water', val as any)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                          settings.water === val
                            ? 'bg-neutral-700 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {presetLabels[val]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'templates' ? (
            <div className="space-y-4">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                완성형 설계 템플릿 불러오기
              </span>
              <p className="text-xs text-neutral-400">
                원하는 사전 설계 구조를 선택하여 시뮬레이터에 즉시 배치해 보세요. 기존에 건설된 구조물은 초기화되고 새로운 템플릿 구조물이 불러와집니다.
              </p>

              {loadedMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium text-center animate-pulse">
                  {loadedMsg}
                </div>
              )}

              <div className="space-y-3">
                {/* House Card */}
                <div className="bg-neutral-800/80 border border-neutral-700/60 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-indigo-500/50 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-all">
                      <Home className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-neutral-100">단독 주택 (Prefab Cozy House)</h4>
                      <p className="text-xs text-neutral-400 mt-0.5">2층 목조 주택 설계 (높이 8.0M)</p>
                      <p className="text-[10px] text-neutral-500 mt-1">소재:Processed Wood | 삼각 트러스 지붕 | 아늑한 주거 공간</p>
                    </div>
                  </div>
                  <button
                    onClick={() => triggerLoadTemplate('house', '단독 주택')}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    불러오기
                  </button>
                </div>

                {/* Apartment Card */}
                <div className="bg-neutral-800/80 border border-neutral-700/60 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-indigo-500/50 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-all">
                      <Building className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-neutral-100">현대식 아파트 (Modern Apartment)</h4>
                      <p className="text-xs text-neutral-400 mt-0.5">4층 고층 아파트 설계 (높이 12.0M)</p>
                      <p className="text-[10px] text-neutral-500 mt-1">소재:Structural Steel & Concrete | 발코니 안전 유리 탑재</p>
                    </div>
                  </div>
                  <button
                    onClick={() => triggerLoadTemplate('apartment', '현대식 아파트')}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    불러오기
                  </button>
                </div>

                {/* Skyscraper Card */}
                <div className="bg-neutral-800/80 border border-neutral-700/60 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-indigo-500/50 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-all">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-neutral-100">초고층 빌딩 (Seismic Skyscraper)</h4>
                      <p className="text-xs text-neutral-400 mt-0.5">8층 초대형 빌딩 설계 (높이 24.0M)</p>
                      <p className="text-[10px] text-neutral-500 mt-1">소재:Reinforced Steel & Steel Plates | X-브레이싱 코어 내진 진동 방지</p>
                    </div>
                  </div>
                  <button
                    onClick={() => triggerLoadTemplate('skyscraper', '초고층 마천루 빌딩')}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    불러오기
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 font-sans text-neutral-300">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                가상 시뮬레이터 조작법
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-800/60 border border-neutral-700/50 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-neutral-300 font-medium">화면 회전</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-neutral-700 text-white rounded shadow-sm border border-neutral-600">
                    우클릭 드래그
                  </kbd>
                </div>
                <div className="bg-neutral-800/60 border border-neutral-700/50 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-neutral-300 font-medium">확대 / 축소</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-neutral-700 text-white rounded shadow-sm border border-neutral-600">
                    마우스 휠
                  </kbd>
                </div>
                <div className="bg-neutral-800/60 border border-neutral-700/50 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-neutral-300 font-medium">카메라 이동</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-neutral-700 text-white rounded shadow-sm border border-neutral-600">
                    W, A, S, D
                  </kbd>
                </div>
                <div className="bg-neutral-800/60 border border-neutral-700/50 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-neutral-300 font-medium">3D / 2D 전환</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-neutral-700 text-white rounded shadow-sm border border-neutral-600">
                    Shift
                  </kbd>
                </div>
                <div className="bg-neutral-800/60 border border-neutral-700/50 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-neutral-300 font-medium">y축 높이 보기</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-neutral-700 text-white rounded shadow-sm border border-neutral-600">
                    Ctrl
                  </kbd>
                </div>
                <div className="bg-neutral-800/60 border border-neutral-700/50 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-neutral-300 font-medium">스냅 / 간격 스냅</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-neutral-700 text-white rounded shadow-sm border border-neutral-600">
                    Alt
                  </kbd>
                </div>
                <div className="bg-neutral-800/60 border border-neutral-700/50 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-neutral-300 font-medium">선택 개체 삭제</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-neutral-700 text-white rounded shadow-sm border border-neutral-600">
                    Delete
                  </kbd>
                </div>
                <div className="bg-neutral-800/60 border border-neutral-700/50 p-3 rounded-xl flex items-center justify-between col-span-2">
                  <span className="text-sm text-neutral-300 font-medium">기둥 / 대들보 설치</span>
                  <span className="text-xs text-neutral-400">마우스 클릭 후 드래그로 길이/위치 지정</span>
                </div>
              </div>
              <div className="bg-indigo-950/40 border border-indigo-900/50 p-3.5 rounded-xl flex items-start gap-3 mt-4">
                <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-300 leading-relaxed">
                  <strong className="block text-indigo-200 mb-0.5">내진 시뮬레이션 물리 팁:</strong>
                  기둥(수직)과 대들보(수평)가 겹치거나 가깝게 설치되면 <span className="text-white font-bold">자동 용접(Welding)</span>됩니다. 고정이 없는 채 공중에 대들보만 설치하면 중력에 의해 바닥으로 떨어지므로 주의하세요!
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-950/50 flex justify-end">
          <button
            id="apply-settings-btn"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md shadow-indigo-900/20 hover:shadow-indigo-500/30 transition-all"
          >
            설정 완료
          </button>
        </div>
      </div>
    </div>
  );
}
