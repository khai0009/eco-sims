import React, { useState } from 'react';
import { useLifeSim } from './hooks/useLifeSim';
import { MainCanvas } from './components/layout/MainCanvas';
import { SensoryHUD } from './components/hud/SensoryHUD';
import type { RootGameState } from './types/game';

// Khởi tạo trạng thái ban đầu chuẩn xác theo tài liệu Master
const INITIAL_STATE: RootGameState = {
  sessionMeta: {
    saveSlotId: 'SLOT_01',
    profileId: 'PROFILE_AN_TRAN',
    activeLocale: 'vi-VN',
    antiScumHash: '',
    isEventLockActive: false,
  },
  timeEngine: {
    totalGameDays: 5110, // 14 tuổi
    exactHour: 18,
    exactMinute: 0,
    timeScale: 1,
  },
  environment: {
    weatherType: 'RAIN',
    pm25Value: 125,
    isRushHour: true,
  },
  activeLocation: {
    locationId: 'LOC_HOME',
    subNodeId: 'HOME_KITCHEN',
  },
  player: {
    identity: {
      fullName: 'Trần Minh An',
      gender: 'MALE',
      birthTotalGameDays: 0,
      exactAgeYears: 14.0,
      heightCm: 158,
      weightKg: 46,
      currentBmi: 18.4,
      educationLevel: 'SECONDARY',
      lockedPersonality: 'INTROVERT',
      innateTraits: ['FAST_LEARNER'],
    },
    blackBox: {
      organs: {
        brain: 85,
        heart: 90,
        lungs: 78,
        liver: 45, // Gan bắt đầu yếu
        digestive: 55,
        musculoskeletal: 82,
      },
      circadian: {
        hoursAwakeContinuous: 8,
        sleepDebtHours: 1.5,
        circadianPhaseOffsetHours: 0,
      },
      mental: {
        ptsdTraumaScore: 25,
        consecutiveSadnessDays: 0,
        burnoutIndex: 15,
      },
      vices: {
        nicotineAddiction: 0,
        alcoholAddiction: 0,
        gamblingAddiction: 0,
      },
    },
    capabilities: {
      canActIndependently: true,
      isTimeManagementUnlocked: false, // Chưa có kỹ năng -> Sẽ bị trôi lố
      isClockVisible: false,          // Chưa có đồng hồ -> Hiện văn phong cảm quan
      isBiometricsDecoded: true,
      isPersonalityDecoded: false,
      hasHospitalMedicalReport: false,
      isAutoPilotActive: false,
    },
    career: {
      currentJobId: null,
      employerNameKey: null,
      workplaceTier: null,
      shiftType: 'NONE',
      monthlyWageGross: 0,
      kpiPerformanceScore: 0,
      hasCrimeRecord: false,
    },
    finances: {
      cashVnd: 2450000,
      bankSavingsVnd: 0,
      debtsVnd: 0,
      hasHealthInsurance: true,
    },
    inventory: {
      maxWeightKg: 15.0,
      items: [],
    },
    sensoryProjection: {
      healthColor: 'YELLOW',
      happinessColor: 'GREEN',
      bodyMonologueKey: 'Vùng bụng trên cứ âm ỉ khó chịu, người mệt mỏi chán ăn...',
      biometricsDisplayString: '1m58 • 46kg (Gầy nhẹ)',
    },
  },
  journal: {
    memoirId: 'MEMOIR_001',
    entries: [
      {
        entryId: '1',
        year: 1973,
        age: 0,
        category: 'CHILDHOOD',
        titleKey: 'Chào đời',
        narrativeKey: 'Sinh ra tại vùng quê Vân Khê nghèo khó, gia cảnh Q2.',
      },
    ],
  },
};

export const App: React.FC = () => {
  const {
    gameState,
    activeCutscene,
    activePopupEvent,
    setTimeSpeed,
    navigateToSubNode,
    performHotspotAction,
    resolveEventOption,
  } = useLifeSim(INITIAL_STATE);

  const [activeTab, setActiveTab] = useState<'HOME' | 'MAP' | 'JOURNAL'>('HOME');

  return (
    <div className="min-h-screen bg-[#2B1B17] flex items-center justify-center p-4">
      <main className="w-full max-w-4xl bg-[#DFD1B3] border-4 border-[#4A3525] p-5 shadow-2xl flex flex-col gap-4">
        {/* Thanh HUD Cảm Quan Phía Trên */}
        <SensoryHUD
          state={gameState}
          onSetSpeed={setTimeSpeed}
          onOpenMap={() => setActiveTab('MAP')}
          onOpenJournal={() => setActiveTab('JOURNAL')}
        />

        {/* Khung Chuyển Đổi Phòng Nhanh (Room Tabs) */}
        <nav className="flex gap-2">
          {['HOME_LIVING_ROOM', 'HOME_KITCHEN', 'HOME_BATHROOM'].map((room) => (
            <button
              key={room}
              onClick={() => navigateToSubNode(room)}
              className={`px-3 py-1 text-xs rounded border transition font-serif ${
                gameState.activeLocation.subNodeId === room
                  ? 'bg-[#5C4033] text-[#FFF] border-[#3E2723]'
                  : 'bg-[#EAD8B7] text-[#3E2723] border-[#8C6D53] hover:bg-[#D7C4A5]'
              }`}
            >
              {room === 'HOME_LIVING_ROOM' && 'Phòng Khách'}
              {room === 'HOME_KITCHEN' && 'Nhà Bếp'}
              {room === 'HOME_BATHROOM' && 'Nhà Tắm'}
            </button>
          ))}
        </nav>

        {/* Khung Sân Khấu Đa Năng Duy Nhất */}
        <MainCanvas
          currentSubNodeId={gameState.activeLocation.subNodeId}
          staticBackgroundAsset="bg_home_kitchen.webp"
          activeCutscene={activeCutscene}
          activePopupEvent={activePopupEvent}
          onHotspotClick={performHotspotAction}
          onSelectEventOption={resolveEventOption}
        />
      </main>
    </div>
  );
};

export default App;
