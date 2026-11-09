/**
 * HỢP ĐỒNG DỮ LIỆU CỐT LÕI - HỆ THỐNG MÔ PHỎNG DÒNG ĐỜI
 */

export type SensoryColor = 'BLUE' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
export type Gender = 'MALE' | 'FEMALE';
export type EducationLevel = 'NONE' | 'PRIMARY' | 'SECONDARY' | 'HIGHSCHOOL' | 'VOCATIONAL' | 'BACHELOR' | 'MASTER' | 'DOCTORATE';
export type LockedPersonality = 'INTROVERT' | 'EXTROVERT' | 'DAREDEVIL' | 'EMPATHETIC' | 'AMBIVERT';

export type OrganType = 'brain' | 'heart' | 'lungs' | 'liver' | 'digestive' | 'musculoskeletal';

export interface OrganBlackBox {
  brain: number;           // 0 - 100
  heart: number;           // 0 - 100
  lungs: number;           // 0 - 100
  liver: number;           // 0 - 100
  digestive: number;       // 0 - 100
  musculoskeletal: number; // 0 - 100
}

export interface CircadianSleep {
  hoursAwakeContinuous: number;
  sleepDebtHours: number;
  circadianPhaseOffsetHours: number;
}

export interface MentalTrauma {
  ptsdTraumaScore: number;     // 0 - 100 (Ψ)
  consecutiveSadnessDays: number;
  burnoutIndex: number;         // 0 - 100
}

export interface VicesAddiction {
  nicotineAddiction: number;
  alcoholAddiction: number;
  gamblingAddiction: number;
}

export interface PlayerIdentity {
  fullName: string;
  gender: Gender;
  birthTotalGameDays: number;
  exactAgeYears: number;
  heightCm: number;
  weightKg: number;
  currentBmi: number;
  educationLevel: EducationLevel;
  currentSchoolOrDegree?: string;
  lockedPersonality: LockedPersonality | null;
  innateTraits: string[];
}

export interface CapabilityFlags {
  canActIndependently: boolean;       // Mở khóa khi tròn 6 tuổi
  isTimeManagementUnlocked: boolean;  // Có kỹ năng quản lý thời gian
  isClockVisible: boolean;            // Có đồng hồ hoặc điện thoại còn pin
  isBiometricsDecoded: boolean;       // Đã mua cân/thước hoặc đã khám viện
  isPersonalityDecoded: boolean;      // Tri kỷ nói cho biết hoặc khám tâm lý
  hasHospitalMedicalReport: boolean;  // Đang giữ phiếu khám trong túi
  isAutoPilotActive: boolean;         // Sa sút trí tuệ tuổi già (Brain < 25)
}

export interface CareerProfile {
  currentJobId: string | null;
  employerNameKey: string | null;
  workplaceTier: 'TIER1_INFORMAL' | 'TIER2_SME' | 'TIER3_MNC' | 'TIER4_STATE' | null;
  shiftType: 'DAY_SHIFT' | 'EVENING_SHIFT' | 'NIGHT_SHIFT' | 'NONE';
  monthlyWageGross: number;
  kpiPerformanceScore: number;
  hasCrimeRecord: boolean;
}

export interface SensoryUIProjection {
  healthColor: SensoryColor;
  happinessColor: SensoryColor;
  bodyMonologueKey: string;
  biometricsDisplayString: string;
}

export interface ItemInstance {
  instanceId: string;
  itemId: string;
  currentDurability: number;
  maxDurability: number;
  acquiredGameDay: number;
  customData?: Record<string, unknown>; // Lưu phiếu khám bệnh, bằng lái...
}

export interface TimeState {
  totalGameDays: number;
  exactHour: number;
  exactMinute: number;
  timeScale: 0 | 1 | 2 | 4; // 0 = Pause, 1 = Normal, 2 = Fast, 4 = Ultra Fast
}

export interface RootGameState {
  sessionMeta: {
    saveSlotId: string;
    profileId: string;
    activeLocale: 'vi-VN' | 'en-US';
    antiScumHash: string;
    isEventLockActive: boolean; // Chống thoát/lưu khi sự kiện đang đếm ngược
  };
  timeEngine: TimeState;
  environment: {
    weatherType: 'SUNNY' | 'HEATWAVE' | 'RAIN' | 'STORM' | 'SMOG_PM25';
    pm25Value: number;
    isRushHour: boolean;
  };
  activeLocation: {
    locationId: string;
    subNodeId: string;
  };
  player: {
    identity: PlayerIdentity;
    blackBox: {
      organs: OrganBlackBox;
      circadian: CircadianSleep;
      mental: MentalTrauma;
      vices: VicesAddiction;
    };
    capabilities: CapabilityFlags;
    career: CareerProfile;
    finances: {
      cashVnd: number;
      bankSavingsVnd: number;
      debtsVnd: number;
      hasHealthInsurance: boolean;
    };
    inventory: {
      maxWeightKg: number;
      items: ItemInstance[];
    };
    sensoryProjection: SensoryUIProjection;
  };
  journal: {
    memoirId: string;
    entries: Array<{
      entryId: string;
      year: number;
      age: number;
      category: string;
      titleKey: string;
      narrativeKey: string;
    }>;
  };
}
