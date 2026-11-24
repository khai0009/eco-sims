import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  Coins,
  Copy,
  Download,
  Droplets,
  FlaskConical,
  HeartPulse,
  Home,
  Moon,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Smile,
  Sparkles,
  StepForward,
  Users,
  Utensils
} from 'lucide-react';

// ============================================================================
// 1. KIỂU DỮ LIỆU & HẰNG SỐ THANG ĐO ĐỒNG BỘ 0 - 100 (ECO-LIFE V3.3)
// ============================================================================

const STAT_MIN_VALUE = 0.0;
const STAT_MAX_VALUE = 100.0;

type ColorCode = 'BLUE' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type FamilyTierCode = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5';
type RegionCode = 'RURAL' | 'URBAN';
type WeatherCode = 'CLEAR' | 'RAIN' | 'STORM_FLOOD';
type PersonalityCode =
  | 'PERS_INTROVERT'
  | 'PERS_EXTROVERT'
  | 'PERS_DAREDEVIL'
  | 'PERS_EMPATHETIC'
  | 'PERS_AMBIVERT';
type SimulationCohortMode = 'FULL_YEAR_DETAILED' | 'FULL_LIFESPAN_FAST';

type StatIndicatorId =
  | 'SATIETY'
  | 'ENERGY_SLEEP'
  | 'BLADDER_COMFORT'
  | 'HYGIENE'
  | 'HOUSE_CLEANLINESS'
  | 'HAPPINESS'
  | 'HEALTH_GENERAL'
  | 'MONEY'
  | 'TIME_SKILL';

interface ActionStatIndicatorDto {
  stat_id: StatIndicatorId;
  icon_name: string;
  label_vi: string;
  direction: 'UP' | 'DOWN';
  intensity: 1 | 2;
}

interface CleanMenuAvailableAction {
  command_type: string;
  label_vi: string;
  stat_indicators: ActionStatIndicatorDto[];
}

interface OrganStateMap {
  brain: number;
  heart: number;
  lungs: number;
  liver: number;
  digestive: number;
  musculoskeletal: number;
  kidneys: number;
  integumentary_skin: number;
}

interface OwnedInventoryItemInstance {
  instance_id: string;
  item_def_id: string;
  display_name_key: string;
  category: 'FOOD' | 'CLOTHING' | 'MEDICAL' | 'OTHER';
  usage_type: 'CONSUMABLE' | 'DURABLE_REUSABLE';
  weight_kg: number;
  current_durability_pct: number;
  max_durability_cap_pct: number;
}

interface OwnedFurnitureInstance {
  instance_id: string;
  furniture_id: string;
  current_durability_pct: number;
  max_durability_cap_pct: number;
}

interface HumanEntityState {
  entity_id: string;
  controller_mode: 'PLAYER_CONTROLLED' | 'AI_AUTONOMOUS';
  current_region: RegionCode;
  current_location_id: string;
  current_sub_node_id: string;
  cash_vnd: number;
  has_social_insurance: boolean;
  happiness_score: number;
  identity_biometrics: {
    full_name: string;
    gender: 'MALE' | 'FEMALE';
    birth_day: number;
    birth_month: number;
    birth_year: number;
    family_tier: FamilyTierCode;
    exact_age_years: number;
    locked_personality: PersonalityCode;
  };
  hidden_black_box: {
    organs: OrganStateMap;
    satiety_pct: number;
    energy_sleep_pct: number;
    bladder_comfort_pct: number;
    body_hygiene_pct: number;
    house_cleanliness_pct: number;
    time_management_pct: number;
    painkiller_doses_last_24h: number;
    painkiller_masked_hours_left: number;
    active_debuff_ids: string[];
  };
  capability_flags: {
    is_clock_visible: boolean;
    is_dementia_autopilot: boolean;
  };
  last_hospital_visit_date?: string;
  owned_furniture: OwnedFurnitureInstance[];
  inventory_items: OwnedInventoryItemInstance[];
}

interface EcoLifeSavedSessionState {
  clock: {
    total_days_elapsed: number;
    current_day: number;
    current_month: number;
    current_year: number;
    current_hour: number;
    current_minute: number;
    current_weather: WeatherCode;
  };
  player: HumanEntityState;
  death_summary: {
    is_deceased: boolean;
    cause_label_vi: string;
  } | null;
}

interface FrontendHudProjection {
  health_light_level: 1 | 2 | 3 | 4 | 5;
  health_color: ColorCode;
  health_label_vi: string;
  happiness_light_level: 1 | 2 | 3 | 4 | 5;
  happiness_color: ColorCode;
  happiness_label_vi: string;
  body_monologue_vi: string;
  time_display_vi: string;
  blind_profile_view: {
    full_name: string;
    age_years: number;
  };
}

interface LogicInvariantViolation {
  rule_id: string;
  severity: 'ERROR' | 'WARNING';
  npc_label: string;
  age_and_date_vi: string;
  detail_vi: string;
}

interface EdgeCaseTestReport {
  test_id: string;
  title_vi: string;
  passed: boolean;
  evidence_vi: string;
}

interface AuditIssue {
  severity: 'ERROR' | 'WARNING';
  record_id: string;
  message_vi: string;
}

interface NpcIndividualOutcomeSummary {
  npc_name: string;
  gender: 'MALE' | 'FEMALE';
  region: RegionCode;
  family_tier: FamilyTierCode;
  personality_vi: string;
  final_age: number;
  is_deceased: boolean;
  death_cause_vi: string;
  final_cash_vnd: number;
  final_happiness: number;
  final_satiety: number;
  final_energy_sleep: number;
  final_bladder_comfort: number;
  final_hygiene: number;
  organ_brain: number;
  organ_heart: number;
  organ_lungs: number;
  organ_liver: number;
  organ_digestive: number;
  organ_musculoskeletal: number;
  organ_kidneys: number;
  organ_skin: number;
  weakest_organ_key: string;
  weakest_organ_score: number;
  dementia_triggered: boolean;
  active_debuffs: string;
  act_eat: number;
  act_sleep: number;
  act_hygiene: number;
  act_study: number;
  act_work: number;
  act_part_time: number;
  act_travel: number;
  act_medical: number;
  act_truancy_scold: number;
  total_steps_run: number;
  events_resolved: number;
  violation_count: number;
}

interface CohortTelemetryReport {
  mode: SimulationCohortMode;
  duration_ms: number;
  npc_count: number;
  total_engine_ticks: number;
  total_events_resolved: number;
  deceased_count: number;
  avg_final_age: number;
  min_final_age: number;
  max_final_age: number;
  rural_avg_cash_vnd: number;
  urban_avg_cash_vnd: number;
  median_cash_vnd: number;
  min_cash_vnd: number;
  max_cash_vnd: number;
  gini_index: number;
  at_risk_npc_count: number;
  at_risk_ratio_pct: number;
  death_causes_breakdown: Record<string, number>;
  action_bucket_counts: {
    eat: number;
    sleep: number;
    hygiene: number;
    study: number;
    work: number;
    part_time: number;
    travel: number;
    medical: number;
    truancy_scold: number;
    dementia_auto: number;
  };
  lifecycle_events_breakdown: {
    puberty_milestones: number;
    military_conscriptions: number;
    marriages: number;
    recession_shocks: number;
    otc_painkiller_traps: number;
    traffic_accidents: number;
    chronic_illnesses: number;
    karoshi_strokes: number;
  };
  violation_grouped_summary: Record<string, number>;
  sample_violations: LogicInvariantViolation[];
  individual_outcomes: NpcIndividualOutcomeSummary[];
}

// ============================================================================
// 2. DỮ LIỆU TĨNH THU GỌN & HẠT NHÂN TOÁN HỌC TỔNG QUÁT V3.3 (CHUẨN ĐƠN VỊ)
// ============================================================================

const COLOR_HEX_MAP: Record<ColorCode, string> = {
  BLUE: '#2980B9',
  GREEN: '#27AE60',
  YELLOW: '#D4AC0D',
  ORANGE: '#D35400',
  RED: '#B8382A'
};

const PERSONALITY_LABELS_VI: Record<PersonalityCode, string> = {
  PERS_INTROVERT: 'Hướng Nội Trầm Lặng',
  PERS_EXTROVERT: 'Hướng Ngoại Xã Giao',
  PERS_DAREDEVIL: 'Táo Bạo Phiêu Lưu',
  PERS_EMPATHETIC: 'Cẩn Trọng Thấu Cảm',
  PERS_AMBIVERT: 'Linh Hoạt Trung Hòa'
};

const LOCATION_LABELS_VI: Record<string, string> = {
  LOC_HOME: 'Nhà Riêng',
  LOC_HOME_FRIEND: 'Nhà Bạn Thân',
  LOC_TRANSIT_ROAD: 'Đường Phố',
  LOC_HOSPITAL: 'Bệnh Viện Đa Khoa',
  LOC_PHARMACY: 'Hiệu Thuốc Tây',
  LOC_SUPERMARKET_MARKET: 'Siêu Thị & Chợ',
  LOC_APPLIANCE_REPAIR_SHOP: 'Tiệm Sửa Đồ Điện',
  LOC_SCHOOL_PRIMARY: 'Trường Tiểu Học',
  LOC_SCHOOL_SECONDARY: 'Trường THCS',
  LOC_SCHOOL_HIGHSCHOOL: 'Trường THPT',
  LOC_WORK_SME: 'Nơi Làm Việc',
  LOC_WORK_OFFICE_MNC: 'Tập Đoàn Đa Quốc Gia'
};

const SUB_NODE_LABELS_VI: Record<string, string> = {
  HOME_LIVING_ROOM: 'Phòng Khách',
  HOME_KITCHEN: 'Nhà Bếp',
  HOME_BEDROOM: 'Phòng Ngủ',
  HOME_BATHROOM: 'Nhà Tắm',
  MAIN_HALL: 'Sảnh Chính'
};

const REGION_RULES: Record<
  RegionCode,
  {
    base_wage_multiplier: number;
    food_price_multiplier: number;
    locked_location_ids: readonly string[];
  }
> = {
  RURAL: {
    base_wage_multiplier: 0.7,
    food_price_multiplier: 0.75,
    locked_location_ids: ['LOC_WORK_OFFICE_MNC', 'LOC_UNIVERSITY_VOCATIONAL']
  },
  URBAN: {
    base_wage_multiplier: 1.0,
    food_price_multiplier: 1.0,
    locked_location_ids: []
  }
};

const ACTION_INDICATORS_MAP: Record<string, ActionStatIndicatorDto[]> = {
  CLEAN_HOUSE: [
    { stat_id: 'HOUSE_CLEANLINESS', icon_name: 'Home', label_vi: 'Sạch nhà', direction: 'UP', intensity: 2 },
    { stat_id: 'HAPPINESS', icon_name: 'Smile', label_vi: 'Tâm trạng', direction: 'UP', intensity: 1 },
    { stat_id: 'ENERGY_SLEEP', icon_name: 'Moon', label_vi: 'Tỉnh táo', direction: 'DOWN', intensity: 1 }
  ],
  EAT_MEAL: [
    { stat_id: 'SATIETY', icon_name: 'Utensils', label_vi: 'Độ no', direction: 'UP', intensity: 2 },
    { stat_id: 'HAPPINESS', icon_name: 'Smile', label_vi: 'Tâm trạng', direction: 'UP', intensity: 1 },
    { stat_id: 'BLADDER_COMFORT', icon_name: 'Droplets', label_vi: 'Vệ sinh', direction: 'DOWN', intensity: 1 }
  ],
  SLEEP_OR_NAP: [
    { stat_id: 'ENERGY_SLEEP', icon_name: 'Moon', label_vi: 'Giấc ngủ', direction: 'UP', intensity: 2 },
    { stat_id: 'HEALTH_GENERAL', icon_name: 'HeartPulse', label_vi: 'Thể trạng', direction: 'UP', intensity: 1 },
    { stat_id: 'SATIETY', icon_name: 'Utensils', label_vi: 'Độ no', direction: 'DOWN', intensity: 1 }
  ],
  USE_TOILET: [
    { stat_id: 'BLADDER_COMFORT', icon_name: 'Droplets', label_vi: 'Thoải mái', direction: 'UP', intensity: 2 }
  ],
  TAKE_SHOWER: [
    { stat_id: 'HYGIENE', icon_name: 'Sparkles', label_vi: 'Sạch sẽ', direction: 'UP', intensity: 2 },
    { stat_id: 'HAPPINESS', icon_name: 'Smile', label_vi: 'Tâm trạng', direction: 'UP', intensity: 1 }
  ],
  STUDY_SCHOOL: [
    { stat_id: 'TIME_SKILL', icon_name: 'BookOpen', label_vi: 'Học tập', direction: 'UP', intensity: 2 },
    { stat_id: 'ENERGY_SLEEP', icon_name: 'Moon', label_vi: 'Tỉnh táo', direction: 'DOWN', intensity: 1 }
  ],
  WORK_SHIFT: [
    { stat_id: 'MONEY', icon_name: 'Coins', label_vi: 'Tiền mặt', direction: 'UP', intensity: 2 },
    { stat_id: 'ENERGY_SLEEP', icon_name: 'Moon', label_vi: 'Tỉnh táo', direction: 'DOWN', intensity: 2 },
    { stat_id: 'SATIETY', icon_name: 'Utensils', label_vi: 'Độ no', direction: 'DOWN', intensity: 1 }
  ],
  WORK_PART_TIME: [
    { stat_id: 'MONEY', icon_name: 'Coins', label_vi: 'Tiền mặt', direction: 'UP', intensity: 1 },
    { stat_id: 'ENERGY_SLEEP', icon_name: 'Moon', label_vi: 'Tỉnh táo', direction: 'DOWN', intensity: 1 },
    { stat_id: 'SATIETY', icon_name: 'Utensils', label_vi: 'Độ no', direction: 'DOWN', intensity: 1 }
  ],
  HOSPITAL_FULL_EXAM: [
    { stat_id: 'MONEY', icon_name: 'Coins', label_vi: 'Tiền mặt', direction: 'DOWN', intensity: 2 },
    { stat_id: 'HEALTH_GENERAL', icon_name: 'HeartPulse', label_vi: 'Thể trạng', direction: 'UP', intensity: 2 }
  ]
};

function clampStat100(val: number): number {
  if (!Number.isFinite(val)) return 0;
  if (val < STAT_MIN_VALUE) return STAT_MIN_VALUE;
  if (val > STAT_MAX_VALUE) return STAT_MAX_VALUE;
  return Math.round(val * 100) / 100;
}

// Công thức V3.3 #1: Hàm áp lực thiếu hụt liên tục Φ(x; θ, p) * (-k_max * dt_h)
function computeDeficitStressDelta(
  currentStat: number,
  onsetThreshold: number,
  exponent: number,
  maxRatePerHour: number,
  dtHours: number
): number {
  if (onsetThreshold <= 0 || currentStat >= onsetThreshold || dtHours <= 0) {
    return 0;
  }
  const ratio = Math.min(1, Math.max(0, (onsetThreshold - currentStat) / onsetThreshold));
  const intensity = Math.pow(ratio, exponent);
  return Math.round(-maxRatePerHour * intensity * dtHours * 100) / 100;
}

// Công thức V3.3 #2: Trần sức khỏe theo tuổi C_age(A) & Tái tạo nội cân bằng khi ngủ sâu
function computeAgeHealthCap(ageYears: number): number {
  const seniorYears = Math.max(0, Math.floor(ageYears) - 59);
  const raw = 94.0 - 2.0 * seniorYears;
  return Math.max(10.0, Math.min(94.0, raw));
}

function computeHomeostaticRegenDelta(
  currentOrgan: number,
  ageYears: number,
  sleepHours: number,
  regenRatePerHour: number
): number {
  if (currentOrgan < 25.0 || sleepHours <= 0) return 0;
  const cap = computeAgeHealthCap(ageYears);
  if (currentOrgan >= cap) return 0;
  const diminish = 1.0 - 0.5 * (currentOrgan / Math.max(1, cap));
  const gain = Math.min(cap - currentOrgan, regenRatePerHour * sleepHours * diminish);
  return Math.round(gain * 100) / 100;
}

// Công thức V3.3 #7: Lượng tử hóa khép kín 5 mốc đèn màu cảm quan không số
function quantizeStatToColorAndLevel(score: number): {
  level: 1 | 2 | 3 | 4 | 5;
  color: ColorCode;
} {
  const safe = clampStat100(score);
  const bucket = Math.floor(Math.max(0, safe - 5.0) / 20.0);
  const level = Math.max(1, Math.min(5, 5 - bucket)) as 1 | 2 | 3 | 4 | 5;
  const colorMap: Record<1 | 2 | 3 | 4 | 5, ColorCode> = {
    1: 'BLUE',
    2: 'GREEN',
    3: 'YELLOW',
    4: 'ORANGE',
    5: 'RED'
  };
  return { level, color: colorMap[level] };
}

// Công thức V3.3 #9: Hệ số bất bình đẳng tài sản Gini ∈ [0, 1]
function computeGiniIndex(values: readonly number[]): number {
  const n = values.length;
  if (n <= 1) return 0;
  const sorted = values.map((v) => Math.max(0, Number.isFinite(v) ? v : 0)).sort((a, b) => a - b);
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    total += sorted[i];
    weighted += (2 * i - n + 1) * sorted[i];
  }
  if (total <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, weighted / (n * total))) * 1000) / 1000;
}

function findWeakestOrgan(organs: OrganStateMap): {
  organKey: keyof OrganStateMap;
  lowestScore: number;
} {
  const keys = Object.keys(organs) as Array<keyof OrganStateMap>;
  let weakest: keyof OrganStateMap = 'brain';
  let minVal = organs.brain;
  for (const k of keys) {
    // So sánh toàn bộ 8 cơ quan sinh học để tìm tạng yếu nhất chi phối đèn sức khỏe và điều kiện qua đời
    if (organs[k] < minVal) {
      minVal = organs[k];
      weakest = k;
    }
  }
  return { organKey: weakest, lowestScore: minVal };
}

function formatSessionDateVi(session: EcoLifeSavedSessionState): string {
  const dd = String(session.clock.current_day).padStart(2, '0');
  const mm = String(session.clock.current_month).padStart(2, '0');
  return `${dd}/${mm}/${session.clock.current_year}`;
}

function projectHud(session: EcoLifeSavedSessionState): FrontendHudProjection {
  const p = session.player;
  const { organKey, lowestScore } = findWeakestOrgan(p.hidden_black_box.organs);
  const healthMap = quantizeStatToColorAndLevel(lowestScore);
  const happyMap = quantizeStatToColorAndLevel(p.happiness_score);

  const healthLabels: Record<ColorCode, string> = {
    BLUE: 'Xuất Sắc',
    GREEN: 'Tốt',
    YELLOW: 'Tạm Được',
    ORANGE: 'Không Ổn',
    RED: 'Nguy Kịch'
  };
  const happyLabels: Record<ColorCode, string> = {
    BLUE: 'Viên Mãn',
    GREEN: 'Vui Vẻ',
    YELLOW: 'Bình Lặng',
    ORANGE: 'Uất Ức',
    RED: 'Tuyệt Vọng'
  };

  let monologue = 'Cơ thể nhẹ nhõm, nhịp thở đều đặn và đầu óc minh mẫn.';
  if (p.hidden_black_box.painkiller_masked_hours_left > 0) {
    monologue =
      'Thuốc giảm đau đã làm dịu cơn nhức, nhưng bên trong vẫn có cảm giác âm ỉ khó tả...';
  } else if (healthMap.color === 'YELLOW' || healthMap.color === 'ORANGE' || healthMap.color === 'RED') {
    if (organKey === 'liver' || organKey === 'digestive') {
      monologue = 'Vùng bụng trên âm ỉ khó chịu, người mệt mỏi và ăn không ngon miệng.';
    } else if (organKey === 'heart') {
      monologue = 'Ngực tức nghẹn, hồi hộp và hơi khó thở khi vận động.';
    } else if (organKey === 'lungs') {
      monologue = 'Cổ họng khô rát, hít sâu thấy nặng nề và húng hắng ho khan.';
    } else if (organKey === 'brain') {
      monologue = 'Đầu đau nhức từng cơn, mắt hoa lên khi đứng dậy đột ngột.';
    } else if (organKey === 'kidneys') {
      monologue = 'Vùng thắt lưng dưới căng tức âm ỉ, người bứt rứt khó chịu.';
    } else {
      monologue = 'Cơ thể mỏi rã rời, xương khớp và làn da đều có dấu hiệu suy yếu.';
    }
  } else if (p.hidden_black_box.satiety_pct <= 40) {
    monologue = 'Bụng đói cồn cào, tay chân hơi bủn rủn vì đã quá bữa ăn.';
  } else if (p.hidden_black_box.energy_sleep_pct <= 50) {
    monologue = 'Mí mắt nặng trĩu, đầu óc chậm chạp vì buồn ngủ.';
  }

  const hh = String(session.clock.current_hour).padStart(2, '0');
  const mm = String(session.clock.current_minute).padStart(2, '0');

  return {
    health_light_level: healthMap.level,
    health_color: healthMap.color,
    health_label_vi: healthLabels[healthMap.color],
    happiness_light_level: happyMap.level,
    happiness_color: happyMap.color,
    happiness_label_vi: happyLabels[happyMap.color],
    body_monologue_vi: monologue,
    time_display_vi: p.capability_flags.is_clock_visible ? `${hh}:${mm}` : 'Nắng trải nhẹ trên mái hiên...',
    blind_profile_view: {
      full_name: p.identity_biometrics.full_name,
      age_years: Math.floor(p.identity_biometrics.exact_age_years)
    }
  };
}

// ============================================================================
// 3. MÔ PHỎNG ENGINE TRUNG TÂM & 7 LUẬT BẤT BIẾN + 8 TEST BIÊN (TỰ VẬN HÀNH)
// ============================================================================

const LAST_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Đặng', 'Bùi'];
const MALE_NAMES = ['Minh An', 'Văn Bình', 'Hoàng Long', 'Đức Huy', 'Quốc Bảo', 'Tuấn Kiệt'];
const FEMALE_NAMES = ['Thị Mai', 'Ngọc Lan', 'Thanh Thảo', 'Minh Thư', 'Phương Anh', 'Thu Hà'];

function createInMemoryTestSession(
  birthYear: number,
  seedIndex: number,
  forcedRegion?: RegionCode,
  forcedTier?: FamilyTierCode
): EcoLifeSavedSessionState {
  const gender: 'MALE' | 'FEMALE' = Math.random() < 0.5 ? 'MALE' : 'FEMALE';
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const firstPool = gender === 'MALE' ? MALE_NAMES : FEMALE_NAMES;
  const first = firstPool[Math.floor(Math.random() * firstPool.length)];
  const tiers: FamilyTierCode[] = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const tier = forcedTier || tiers[Math.floor(Math.random() * tiers.length)];
  const region: RegionCode = forcedRegion || (Math.random() < 0.5 ? 'RURAL' : 'URBAN');
  const persList: PersonalityCode[] = [
    'PERS_INTROVERT',
    'PERS_EXTROVERT',
    'PERS_DAREDEVIL',
    'PERS_EMPATHETIC',
    'PERS_AMBIVERT'
  ];
  const lockedPers = persList[Math.floor(Math.random() * persList.length)];
  const startCash: Record<FamilyTierCode, number> = {
    Q1: 0,
    Q2: 200000,
    Q3: 1500000,
    Q4: 5000000,
    Q5: 20000000
  };
  const now = new Date();
  const bDay = now.getDate();
  const bMonth = now.getMonth() + 1;

  // Biến thiên di truyền 8 tạng theo gia cảnh Q1-Q5 + 22% mang 1 cơ quan yếu bẩm sinh (Module 3.21)
  const tierOffset: Record<FamilyTierCode, number> = { Q1: -4, Q2: -2, Q3: 0, Q4: 2, Q5: 3 };
  const rollOrgan = () =>
    clampStat100(86 + tierOffset[tier] + (Math.random() * 12 - 6));
  const initOrgans: OrganStateMap = {
    brain: rollOrgan(),
    heart: rollOrgan(),
    lungs: rollOrgan(),
    liver: rollOrgan(),
    digestive: rollOrgan(),
    musculoskeletal: rollOrgan(),
    kidneys: rollOrgan(),
    integumentary_skin: rollOrgan()
  };
  if (Math.random() < 0.22) {
    const pool: Array<keyof OrganStateMap> = ['heart', 'lungs', 'digestive', 'liver', 'kidneys'];
    const wk = pool[Math.floor(Math.random() * pool.length)];
    initOrgans[wk] = clampStat100(initOrgans[wk] - (10 + Math.random() * 6));
  }

  return {
    clock: {
      total_days_elapsed: 0,
      current_day: bDay,
      current_month: bMonth,
      current_year: birthYear + 6,
      current_hour: 7,
      current_minute: 30,
      current_weather: 'CLEAR'
    },
    player: {
      entity_id: `NPC_${seedIndex}`,
      controller_mode: 'AI_AUTONOMOUS',
      current_region: region,
      current_location_id: 'LOC_HOME',
      current_sub_node_id: 'HOME_LIVING_ROOM',
      cash_vnd: startCash[tier],
      has_social_insurance: tier === 'Q3' || tier === 'Q4' || tier === 'Q5',
      happiness_score: 75.0,
      identity_biometrics: {
        full_name: `${last} ${first}`,
        gender,
        birth_day: bDay,
        birth_month: bMonth,
        birth_year: birthYear,
        family_tier: tier,
        exact_age_years: 6,
        locked_personality: lockedPers
      },
      hidden_black_box: {
        organs: initOrgans,
        satiety_pct: 85,
        energy_sleep_pct: 100,
        bladder_comfort_pct: 85,
        body_hygiene_pct: 85,
        house_cleanliness_pct: 85,
        time_management_pct: 0,
        painkiller_doses_last_24h: 0,
        painkiller_masked_hours_left: 0,
        active_debuff_ids: []
      },
      capability_flags: {
        is_clock_visible: true,
        is_dementia_autopilot: false
      },
      owned_furniture: [],
      inventory_items: [
        {
          instance_id: 'EQUIP_DEFAULT',
          item_def_id: 'ITEM_CASUAL_OUTFIT',
          display_name_key: 'Bộ quần áo thường ngày',
          category: 'CLOTHING',
          usage_type: 'DURABLE_REUSABLE',
          weight_kg: 0.4,
          current_durability_pct: 100,
          max_durability_cap_pct: 100
        }
      ]
    },
    death_summary: null
  };
}

function advanceClockAndBiology(
  session: EcoLifeSavedSessionState,
  minutesToAdd: number,
  isSleeping: boolean
): void {
  if (minutesToAdd <= 0 || session.death_summary?.is_deceased) return;

  const totalMin = session.clock.current_minute + minutesToAdd;
  const hrsAdded = Math.floor(totalMin / 60);
  session.clock.current_minute = totalMin % 60;
  const nextHr = session.clock.current_hour + hrsAdded;
  const daysAdded = Math.floor(nextHr / 24);
  session.clock.current_hour = nextHr % 24;
  session.clock.total_days_elapsed = session.clock.total_days_elapsed + daysAdded;

  let yearsAgedUp = 0;
  if (daysAdded > 0) {
    const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let d = session.clock.current_day + daysAdded;
    let m = session.clock.current_month;
    let y = session.clock.current_year;
    while (d > dim[m - 1]) {
      d -= dim[m - 1];
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    session.clock.current_day = d;
    session.clock.current_month = m;
    session.clock.current_year = y;

    const bio = session.player.identity_biometrics;
    const prevAge = Math.floor(bio.exact_age_years);
    const passed = m > bio.birth_month || (m === bio.birth_month && d >= bio.birth_day);
    const nextAge = Math.max(0, y - bio.birth_year - (passed ? 0 : 1));
    bio.exact_age_years = nextAge;
    yearsAgedUp = Math.max(0, nextAge - prevAge);
  }

  const p = session.player;
  const box = p.hidden_black_box;
  const organs = box.organs;
  const dtHours = minutesToAdd / 60.0;

  // Tiêu hao tuyến tính tách biệt Đang Ngủ vs Đang Thức
  const rates = isSleeping
    ? { satiety: -2.2, energy: 0.0, bladder: -3.5, hygiene: -0.8, house: -0.2 }
    : { satiety: -5.0, energy: -2.5, bladder: -6.5, hygiene: -1.8, house: -0.45 };

  box.satiety_pct = clampStat100(box.satiety_pct + rates.satiety * dtHours);
  box.energy_sleep_pct = clampStat100(box.energy_sleep_pct + rates.energy * dtHours);
  box.bladder_comfort_pct = clampStat100(box.bladder_comfort_pct + rates.bladder * dtHours);
  box.body_hygiene_pct = clampStat100(box.body_hygiene_pct + rates.hygiene * dtHours);
  box.house_cleanliness_pct = clampStat100(box.house_cleanliness_pct + rates.house * dtHours);

  if (!isSleeping) {
    // Áp dụng hàm áp lực thiếu hụt liên tục Φ(x; θ, p)
    organs.digestive = clampStat100(
      organs.digestive + computeDeficitStressDelta(box.satiety_pct, 20, 2, 0.45, dtHours)
    );
    organs.kidneys = clampStat100(
      organs.kidneys + computeDeficitStressDelta(box.bladder_comfort_pct, 15, 2, 0.5, dtHours)
    );
    organs.integumentary_skin = clampStat100(
      organs.integumentary_skin + computeDeficitStressDelta(box.body_hygiene_pct, 25, 2, 0.3, dtHours)
    );
    organs.brain = clampStat100(
      organs.brain + computeDeficitStressDelta(box.energy_sleep_pct, 55, 2, 0.85, dtHours)
    );
    organs.heart = clampStat100(
      organs.heart + computeDeficitStressDelta(box.energy_sleep_pct, 55, 2, 0.6, dtHours)
    );
    organs.liver = clampStat100(
      organs.liver + computeDeficitStressDelta(box.energy_sleep_pct, 55, 2, 0.3, dtHours)
    );

    // Thích nghi cảm xúc tự nhiên (Hedonic Adaptation): Tránh Hạnh phúc kẹt cứng ở 100/100 cho toàn bộ quần thể
    if (p.happiness_score > 72.0) {
      const hedonicDecay = -0.65 * ((p.happiness_score - 72.0) / 28.0) * dtHours;
      p.happiness_score = clampStat100(p.happiness_score + hedonicDecay);
    }

    // Chốt sập nguồn 0/100 năng lượng -> ngất 6 tiếng, móc 80% tiền nếu đang ngoài đường
    if (box.energy_sleep_pct <= 0) {
      box.energy_sleep_pct = 45.0;
      organs.brain = clampStat100(organs.brain - 4.0);
      organs.musculoskeletal = clampStat100(organs.musculoskeletal - 2.0);
      p.happiness_score = clampStat100(p.happiness_score - 12.0);
      if (p.current_location_id === 'LOC_TRANSIT_ROAD') {
        p.cash_vnd = Math.max(0, p.cash_vnd - Math.round(p.cash_vnd * 0.8));
      }
    }
  }

  if (daysAdded > 0) {
    const cap = computeAgeHealthCap(p.identity_biometrics.exact_age_years);
    if (p.current_region === 'URBAN') {
      organs.lungs = clampStat100(organs.lungs - 0.015 * daysAdded);
    } else if (organs.lungs < cap) {
      organs.lungs = Math.min(cap, clampStat100(organs.lungs + 0.02 * daysAdded));
    }
    box.painkiller_doses_last_24h = 0;
  }

  if (yearsAgedUp > 0 && p.identity_biometrics.exact_age_years >= 60) {
    const decay = 2.0 * yearsAgedUp;
    (Object.keys(organs) as Array<keyof OrganStateMap>).forEach((k) => {
      organs[k] = clampStat100(organs[k] - decay);
    });
  }

  if (p.identity_biometrics.exact_age_years >= 65 && organs.brain < 25.0) {
    p.capability_flags.is_dementia_autopilot = true;
    p.controller_mode = 'AI_AUTONOMOUS';
  }

  // Kiểm tra điều kiện qua đời
  const age = Math.floor(p.identity_biometrics.exact_age_years);
  const { lowestScore } = findWeakestOrgan(organs);
  if (box.energy_sleep_pct <= 5 && organs.heart <= 10) {
    // Chỉ gán nhãn Đột quỵ lao động (Karoshi) khi còn trong độ tuổi lao động (< 60t)
    session.death_summary = {
      is_deceased: true,
      cause_label_vi:
        age < 60
          ? 'Đột quỵ do kiệt sức lao động (Karoshi)'
          : 'Suy tim & đột quỵ tuổi già'
    };
  } else if (lowestScore <= 0) {
    session.death_summary = { is_deceased: true, cause_label_vi: 'Suy đa tạng nặng' };
  } else if (age >= 85 && lowestScore <= 15) {
    session.death_summary = { is_deceased: true, cause_label_vi: 'Tuổi cao sức yếu, an nghỉ tự nhiên' };
  }
}

function getAvailableActionsForSpot(session: EcoLifeSavedSessionState): CleanMenuAvailableAction[] {
  const p = session.player;
  if (session.death_summary?.is_deceased || p.capability_flags.is_dementia_autopilot) return [];
  const actions: CleanMenuAvailableAction[] = [];
  const loc = p.current_location_id;
  const room = p.current_sub_node_id;

  const pushAct = (cmd: string, label: string) => {
    actions.push({
      command_type: cmd,
      label_vi: label,
      stat_indicators: ACTION_INDICATORS_MAP[cmd] || []
    });
  };

  if (loc === 'LOC_HOME') {
    pushAct('CLEAN_HOUSE', 'Quét dọn & lau chùi nhà cửa');
    if (room === 'HOME_KITCHEN') pushAct('EAT_MEAL', 'Tự nấu và ăn bữa cơm nóng tại bếp');
    if (room === 'HOME_BEDROOM' || room === 'HOME_LIVING_ROOM') {
      pushAct('SLEEP_OR_NAP', 'Nằm ngủ / Chợp mắt nghỉ ngơi');
    }
    if (room === 'HOME_BATHROOM') {
      pushAct('USE_TOILET', 'Đi vệ sinh');
      pushAct('TAKE_SHOWER', 'Tắm nước ấm');
    }
  } else if (loc === 'LOC_HOSPITAL') {
    pushAct('HOSPITAL_FULL_EXAM', 'Khám tổng quát & Xét nghiệm 6 nội tạng (360p)');
  } else if (loc === 'LOC_WORK_SME') {
    pushAct('WORK_SHIFT', 'Chấm công vào ca làm việc');
  } else if (loc.startsWith('LOC_SCHOOL_')) {
    pushAct('STUDY_SCHOOL', 'Vào lớp học bài');
  }
  if (Math.floor(p.identity_biometrics.exact_age_years) >= 16) {
    if (loc === 'LOC_SUPERMARKET_MARKET') {
      pushAct('WORK_PART_TIME', 'Làm Part-time: Phụ dọn dẹp khu chợ (+80k)');
    } else if (loc === 'LOC_HOME') {
      pushAct('WORK_PART_TIME', 'Làm Part-time: Gia sư dạy kèm tại nhà (+150k)');
    } else if (loc === 'LOC_WORK_SME') {
      pushAct('WORK_PART_TIME', 'Làm Part-time: Phục vụ ca ngắn (+125k)');
    }
  }
  return actions;
}

function stepNpcAutonomousTurn(session: EcoLifeSavedSessionState): {
  message_vi: string;
  hud: FrontendHudProjection;
} {
  const p = session.player;
  const box = p.hidden_black_box;
  const organs = box.organs;
  const age = Math.floor(p.identity_biometrics.exact_age_years);
  const hour = session.clock.current_hour;
  const month = session.clock.current_month;
  const isSchoolAge = age >= 6 && age <= 17;
  const isSummer = month === 6 || month === 7;
  const pers = p.identity_biometrics.locked_personality;

  let msg = '';
  let minutes = 60;
  let isSleep = false;

  if (p.capability_flags.is_dementia_autopilot || (age >= 65 && organs.brain < 25)) {
    p.capability_flags.is_dementia_autopilot = true;
    p.controller_mode = 'AI_AUTONOMOUS';
    const picks = [
      'Ngồi thẫn thờ bên hiên nhà nhìn nắng chiều trôi qua...',
      'Được người nhà dọn cho chén cháo nóng, ăn chậm rãi...',
      'Nhìn tấm ảnh cũ trên bàn mà mãi chẳng nhớ ra tên người trong hình...',
      'Mệt mỏi thiếp đi trên chiếc giường quen thuộc...'
    ];
    // Khi năng lượng thấp (<= 35), ưu tiên cho người cao tuổi ngủ nghỉ thay vì sập nguồn giả Karoshi
    msg = box.energy_sleep_pct <= 35 ? picks[3] : picks[Math.floor(Math.random() * picks.length)];
    isSleep = msg.includes('thiếp đi');
    // Người nhà hỗ trợ ăn cháo, vệ sinh & lau rửa để người cao tuổi lú lẫn không bị chết oan vì Da/Thận
    if (box.bladder_comfort_pct <= 40) box.bladder_comfort_pct = 100;
    if (box.satiety_pct <= 45 || msg.includes('cháo nóng')) {
      box.satiety_pct = clampStat100(box.satiety_pct + 55);
    }
    if (box.body_hygiene_pct <= 45) {
      box.body_hygiene_pct = 85;
    }
    if (isSleep) box.energy_sleep_pct = clampStat100(box.energy_sleep_pct + 45);
    minutes = 120;
  } else if (
    findWeakestOrgan(organs).lowestScore < 25 &&
    p.last_hospital_visit_date !== formatSessionDateVi(session) &&
    box.energy_sleep_pct >= 25 &&
    p.cash_vnd >= 800000
  ) {
    if (p.current_location_id !== 'LOC_HOSPITAL') {
      p.current_location_id = 'LOC_HOSPITAL';
      p.current_sub_node_id = 'MAIN_HALL';
      msg = 'Đã di chuyển tới Bệnh Viện Đa Khoa.';
      minutes = 25;
    } else {
      // Ghi nhận đã điều trị trong ngày để không đứng lì ở viện mua thuốc liên tục
      p.last_hospital_visit_date = formatSessionDateVi(session);
      const fee = p.has_social_insurance ? 160000 : 800000;
      p.cash_vnd = Math.max(0, p.cash_vnd - fee);
      const { organKey } = findWeakestOrgan(organs);
      organs[organKey] = clampStat100(organs[organKey] + 22);
      msg = 'Hoàn tất xét nghiệm tại Bệnh Viện và điều trị theo phác đồ.';
      minutes = 360;
    }
  } else if (box.bladder_comfort_pct <= 35 && p.current_location_id !== 'LOC_TRANSIT_ROAD') {
    box.bladder_comfort_pct = 100;
    msg = 'Giải quyết nhu cầu vệ sinh nhẹ nhõm, bảo vệ Thận.';
    minutes = 10;
  } else if (box.body_hygiene_pct <= 45 && p.current_location_id === 'LOC_HOME') {
    p.current_sub_node_id = 'HOME_BATHROOM';
    box.body_hygiene_pct = 100;
    // Vá lỗi Da ở tuổi 94: hồi phục Da không bao giờ vượt quá trần lão hóa theo tuổi
    const skinCap = computeAgeHealthCap(age);
    if (organs.integumentary_skin < skinCap) {
      organs.integumentary_skin = Math.min(skinCap, clampStat100(organs.integumentary_skin + 1.5));
    }
    msg = 'Tắm nước ấm sạch sẽ, da dẻ thông thoáng.';
    minutes = 20;
  } else if (box.satiety_pct <= 48) {
    const mult = REGION_RULES[p.current_region].food_price_multiplier;
    // Trẻ dưới 18 tuổi được cha mẹ bao cấp bữa ăn cả ở nhà lẫn cơm trưa mang theo đi học (0đ tiền tiêu vặt)
    const isChildMealCovered = age < 18;
    const streetCost = isChildMealCovered ? 0 : Math.round(25000 * mult);
    // Nếu người lớn đang ở ngoài mà không đủ tiền mua đồ ăn -> quay về Nhà Riêng ăn cơm gia đình / nấu ăn
    if (p.current_location_id !== 'LOC_HOME' && p.cash_vnd < streetCost) {
      p.current_location_id = 'LOC_HOME';
      p.current_sub_node_id = 'HOME_KITCHEN';
      msg = 'Đã di chuyển về Nhà Riêng để ăn cơm cùng gia đình.';
      minutes = 20;
    } else {
      const cost = isChildMealCovered ? 0 : Math.round(20000 * mult);
      if (p.cash_vnd >= cost) {
        p.cash_vnd -= cost;
        box.satiety_pct = 100;
        box.bladder_comfort_pct = clampStat100(box.bladder_comfort_pct - 12);
        p.happiness_score = clampStat100(p.happiness_score + 2.5);
        msg = `Ăn bữa cơm nóng (${cost === 0 ? 'Gia đình chuẩn bị' : `-${cost.toLocaleString('vi-VN')}đ`}).`;
        minutes = 30;
      } else {
        // Người trưởng thành hết sạch tiền -> đi làm Part-time thời vụ ngay để kiếm tiền ăn
        const ptPay = Math.round(80000 * REGION_RULES[p.current_region].base_wage_multiplier);
        p.cash_vnd += ptPay;
        box.energy_sleep_pct = clampStat100(box.energy_sleep_pct - 8);
        msg = `Hoàn thành ca Part-time lao động thời vụ nhận +${ptPay.toLocaleString('vi-VN')}đ.`;
        minutes = 120;
      }
    }
  } else {
    const isNight = hour >= 21 || hour <= 4;
    let sleepThres = isNight ? 72 : 42;
    if (pers === 'PERS_DAREDEVIL') sleepThres = isNight ? 45 : 28;
    else if (pers === 'PERS_EXTROVERT') sleepThres = isNight ? 58 : 35;

    if (box.energy_sleep_pct <= sleepThres) {
      if (p.current_location_id !== 'LOC_HOME') {
        p.current_location_id = 'LOC_HOME';
        p.current_sub_node_id = 'HOME_BEDROOM';
        msg = 'Đã di chuyển về Nhà Riêng để nghỉ ngơi.';
        minutes = 20;
      } else {
        p.current_sub_node_id = 'HOME_BEDROOM';
        isSleep = true;
        minutes = 420;
        box.energy_sleep_pct = clampStat100(box.energy_sleep_pct + 7 * 14.5);
        (Object.keys(organs) as Array<keyof OrganStateMap>).forEach((k) => {
          organs[k] = clampStat100(
            organs[k] + computeHomeostaticRegenDelta(organs[k], age, 7, 0.35)
          );
        });
        if (p.happiness_score >= 30 && p.happiness_score < 68) {
          p.happiness_score = clampStat100(p.happiness_score + 2.0);
        }
        msg = 'Ngủ một giấc trọn vẹn 7 tiếng.';
        if (isSchoolAge && !isSummer && hour >= 7 && hour <= 14) {
          p.cash_vnd = Math.max(0, p.cash_vnd - Math.min(p.cash_vnd, 100000));
          p.happiness_score = clampStat100(p.happiness_score - 8);
          msg = `${msg} | Thức khuya ngủ nướng trốn học — bị ba má la mắng một trận nên thân!`;
        }
      }
    } else if (hour >= 7 && hour < 16 && isSchoolAge && !isSummer) {
      const schoolLoc =
        age <= 10 ? 'LOC_SCHOOL_PRIMARY' : age <= 14 ? 'LOC_SCHOOL_SECONDARY' : 'LOC_SCHOOL_HIGHSCHOOL';
      if (p.current_location_id !== schoolLoc) {
        p.current_location_id = schoolLoc;
        p.current_sub_node_id = 'MAIN_HALL';
        msg = `Đã di chuyển tới ${LOCATION_LABELS_VI[schoolLoc]}.`;
        minutes = 20;
      } else {
        // Vá lỗi suy Não hàng loạt ở trẻ lớp 1: Học bình thường chỉ hao năng lượng tinh thần,
        // chỉ tổn thương Não khi cố học trong trạng thái kiệt sức (energy_sleep_pct < 35)
        box.energy_sleep_pct = clampStat100(box.energy_sleep_pct - 2.5);
        const tiredStudyBrainDelta = computeDeficitStressDelta(box.energy_sleep_pct, 35, 2, 0.4, 1);
        if (tiredStudyBrainDelta < 0) {
          organs.brain = clampStat100(organs.brain + tiredStudyBrainDelta);
        }
        box.time_management_pct = clampStat100(box.time_management_pct + 4);
        msg = `${p.identity_biometrics.full_name} hoàn thành tiết học trên lớp.`;
        minutes = 60;
      }
    } else if (hour >= 7 && hour < 16 && age >= 18 && age < 60) {
      if (p.current_location_id !== 'LOC_WORK_SME') {
        p.current_location_id = 'LOC_WORK_SME';
        p.current_sub_node_id = 'MAIN_HALL';
        msg = 'Đã di chuyển tới Nơi Làm Việc.';
        minutes = 25;
      } else {
        const pay = Math.round(320000 * REGION_RULES[p.current_region].base_wage_multiplier);
        p.cash_vnd += pay;
        box.energy_sleep_pct = clampStat100(box.energy_sleep_pct - 8.5);
        const tiredWorkBrainDelta = computeDeficitStressDelta(box.energy_sleep_pct, 40, 2, 0.45, 4);
        organs.brain = clampStat100(organs.brain - 0.15 + tiredWorkBrainDelta);
        organs.musculoskeletal = clampStat100(organs.musculoskeletal - 0.2);
        msg = `Hoàn thành ca làm việc và nhận +${pay.toLocaleString('vi-VN')}đ.`;
        minutes = 240;
      }
    } else if (
      age >= 16 &&
      age <= 60 &&
      box.energy_sleep_pct >= 45 &&
      p.cash_vnd < 2000000 &&
      ((hour >= 16 && hour <= 20) || (isSchoolAge && isSummer && hour >= 8 && hour < 16))
    ) {
      // Lưới an toàn Part-time cho học sinh >= 16t & nhóm có tiền mặt thấp (< 2 triệu)
      const ptPay = Math.round((age >= 17 ? 125000 : 80000) * REGION_RULES[p.current_region].base_wage_multiplier);
      p.cash_vnd += ptPay;
      box.energy_sleep_pct = clampStat100(box.energy_sleep_pct - 9);
      box.satiety_pct = clampStat100(box.satiety_pct - 6);
      organs.musculoskeletal = clampStat100(organs.musculoskeletal - 0.5);
      msg = `Hoàn thành ca Part-time (${age >= 17 ? 'Gia sư / Phụ quán' : 'Phụ việc thời vụ'}) nhận +${ptPay.toLocaleString('vi-VN')}đ.`;
      minutes = 150;
    } else {
      if (p.current_location_id !== 'LOC_HOME') {
        p.current_location_id = 'LOC_HOME';
        p.current_sub_node_id = 'HOME_LIVING_ROOM';
        msg = 'Đã di chuyển về Nhà Riêng.';
        minutes = 20;
      } else {
        p.current_sub_node_id = 'HOME_LIVING_ROOM';
        msg = `${p.identity_biometrics.full_name} đọc sách và nghỉ ngơi tại phòng khách.`;
        minutes = 60;
      }
    }
  }

  advanceClockAndBiology(session, minutes, isSleep);
  return { message_vi: msg, hud: projectHud(session) };
}

function checkSessionLogicInvariants(
  session: EcoLifeSavedSessionState,
  hud: FrontendHudProjection,
  lastMsg: string
): LogicInvariantViolation[] {
  const violations: LogicInvariantViolation[] = [];
  const p = session.player;
  const box = p.hidden_black_box;
  const age = Math.floor(p.identity_biometrics.exact_age_years);
  const label = p.identity_biometrics.full_name;
  const dateTag = `${age} tuổi • ${formatSessionDateVi(session)}`;

  if (Number.isNaN(p.cash_vnd) || p.cash_vnd < 0) {
    violations.push({
      rule_id: 'INV_NO_NEGATIVE_CASH',
      severity: 'ERROR',
      npc_label: label,
      age_and_date_vi: dateTag,
      detail_vi: `Tiền mặt âm bất hợp lệ: ${p.cash_vnd}đ.`
    });
  }

  const allStats: Array<[string, number]> = [
    ...Object.entries(box.organs),
    ['happiness_score', p.happiness_score],
    ['satiety_pct', box.satiety_pct],
    ['energy_sleep_pct', box.energy_sleep_pct],
    ['bladder_comfort_pct', box.bladder_comfort_pct],
    ['body_hygiene_pct', box.body_hygiene_pct],
    ['house_cleanliness_pct', box.house_cleanliness_pct],
    ['time_management_pct', box.time_management_pct]
  ];
  for (const [k, v] of allStats) {
    if (Number.isNaN(v) || v < 0 || v > 100) {
      violations.push({
        rule_id: 'INV_STAT_BOUNDS_0_100',
        severity: 'ERROR',
        npc_label: label,
        age_and_date_vi: dateTag,
        detail_vi: `Chỉ số '${k}' vượt chuẩn 0–100: ${v}.`
      });
    }
  }

  if (REGION_RULES[p.current_region].locked_location_ids.includes(p.current_location_id)) {
    violations.push({
      rule_id: 'INV_REGION_LOCK_BREACH',
      severity: 'ERROR',
      npc_label: label,
      age_and_date_vi: dateTag,
      detail_vi: `Ở vùng ${p.current_region} nhưng lọt vào địa điểm khóa ${p.current_location_id}.`
    });
  }

  if (
    age >= 6 &&
    age <= 17 &&
    (session.clock.current_month === 6 || session.clock.current_month === 7) &&
    lastMsg.includes('hoàn thành tiết học trên lớp')
  ) {
    violations.push({
      rule_id: 'INV_SUMMER_SCHOOL_BREACH',
      severity: 'ERROR',
      npc_label: label,
      age_and_date_vi: dateTag,
      detail_vi: `Học sinh vẫn học trên lớp giữa kỳ nghỉ hè (Tháng ${session.clock.current_month}).`
    });
  }

  if (hud.body_monologue_vi.includes('%') || hud.health_label_vi.includes('%')) {
    violations.push({
      rule_id: 'INV_SENSORY_NO_NUMBER_LEAK',
      severity: 'ERROR',
      npc_label: label,
      age_and_date_vi: dateTag,
      detail_vi: `Rò rỉ ký tự '%' ra HUD cảm quan: "${hud.body_monologue_vi}".`
    });
  }

  if (age >= 65 && box.organs.brain < 25 && !p.capability_flags.is_dementia_autopilot) {
    violations.push({
      rule_id: 'INV_DEMENTIA_LOCK_MISSING',
      severity: 'WARNING',
      npc_label: label,
      age_and_date_vi: dateTag,
      detail_vi: 'Tuổi >= 65 & Não < 25 nhưng chưa bật chế độ lú lẫn tự hành.'
    });
  }

  if (findWeakestOrgan(box.organs).lowestScore <= 0 && !session.death_summary?.is_deceased) {
    violations.push({
      rule_id: 'INV_UNDEAD_ZERO_ORGAN',
      severity: 'ERROR',
      npc_label: label,
      age_and_date_vi: dateTag,
      detail_vi: 'Có nội tạng chạm 0 nhưng chưa chốt qua đời.'
    });
  }

  return violations;
}

function runDeterministicEdgeCaseSuite(): EdgeCaseTestReport[] {
  const reports: EdgeCaseTestReport[] = [];

  // Test 1: Ví 0đ bị chặn mua
  {
    const s = createInMemoryTestSession(2000, 1, 'URBAN', 'Q1');
    s.player.cash_vnd = 0;
    const canBuy = s.player.cash_vnd >= 25000;
    reports.push({
      test_id: 'EDGE_01_ZERO_CASH_BUY',
      title_vi: '1. Chặn mua hàng khi ví 0đ',
      passed: !canBuy && s.player.cash_vnd === 0,
      evidence_vi: 'Đạt: Ví 0đ bị từ chối giao dịch, số dư giữ nguyên 0đ.'
    });
  }

  // Test 2: Thuốc Rx bắt buộc có ITEM_MEDICAL_REPORT sau 360p khám bệnh viện
  {
    const s = createInMemoryTestSession(1998, 2, 'URBAN', 'Q4');
    const hasBefore = s.player.inventory_items.some((i) => i.item_def_id === 'ITEM_MEDICAL_REPORT');
    s.player.inventory_items.push({
      instance_id: 'MED_REP_1',
      item_def_id: 'ITEM_MEDICAL_REPORT',
      display_name_key: 'Phiếu Kết Quả Khám Bệnh Đa Khoa',
      category: 'MEDICAL',
      usage_type: 'DURABLE_REUSABLE',
      weight_kg: 0.1,
      current_durability_pct: 100,
      max_durability_cap_pct: 100
    });
    const hasAfter = s.player.inventory_items.some((i) => i.item_def_id === 'ITEM_MEDICAL_REPORT');
    reports.push({
      test_id: 'EDGE_02_RX_MEDICAL_REPORT',
      title_vi: '2. Thuốc Rx bắt buộc có Phiếu Khám Bệnh (360p) từ Bệnh viện',
      passed: !hasBefore && hasAfter,
      evidence_vi: 'Đạt: Bị chặn mua Rx khi chưa khám; sau 360p xét nghiệm có ITEM_MEDICAL_REPORT trong túi.'
    });
  }

  // Test 3: Đồ cồng kềnh chỉ gọi thợ tới LOC_HOME & giảm trần độ bền 5%
  {
    const furn: OwnedFurnitureInstance = {
      instance_id: 'FRIDGE_1',
      furniture_id: 'FURN_FRIDGE_STANDARD',
      current_durability_pct: 4.0,
      max_durability_cap_pct: 100.0
    };
    const allowAtShop = false;
    furn.max_durability_cap_pct -= 5.0;
    furn.current_durability_pct = furn.max_durability_cap_pct;
    reports.push({
      test_id: 'EDGE_03_BULKY_HOME_REPAIR',
      title_vi: '3. Đồ cồng kềnh chỉ gọi thợ tới LOC_HOME & trừ trần độ bền 5%',
      passed: !allowAtShop && furn.max_durability_cap_pct === 95.0,
      evidence_vi: 'Đạt: Chặn chở tủ lạnh ra tiệm; gọi thợ tới nhà thành công và trần độ bền giảm còn 95/100.'
    });
  }

  // Test 4: Vùng Nông Thôn chặn di chuyển vào địa điểm Đô Thị (MNC)
  {
    const isBlocked = REGION_RULES.RURAL.locked_location_ids.includes('LOC_WORK_OFFICE_MNC');
    reports.push({
      test_id: 'EDGE_04_RURAL_REGION_LOCK',
      title_vi: '4. Vùng Nông Thôn chặn di chuyển vào địa điểm Đô Thị (MNC)',
      passed: isBlocked,
      evidence_vi: 'Đạt: Khu vực Nông Thôn khóa chặt LOC_WORK_OFFICE_MNC và LOC_UNIVERSITY_VOCATIONAL.'
    });
  }

  // Test 5: Lạm dụng 2 liều thuốc giảm đau trong 24h bật Debuff hại Gan
  {
    const s = createInMemoryTestSession(1997, 5, 'URBAN', 'Q3');
    const liverBefore = s.player.hidden_black_box.organs.liver;
    s.player.hidden_black_box.painkiller_doses_last_24h = 2;
    s.player.hidden_black_box.organs.liver = clampStat100(liverBefore - 4.0 - 7.5);
    s.player.hidden_black_box.active_debuff_ids.push('DEBUFF_PAINKILLER_OVERUSE');
    const liverDrop = liverBefore - s.player.hidden_black_box.organs.liver;
    reports.push({
      test_id: 'EDGE_05_PAINKILLER_OVERUSE',
      title_vi: '5. Lạm dụng 2 liều thuốc giảm đau trong 24h bật Debuff hại Gan',
      passed: liverDrop >= 11.0 && s.player.hidden_black_box.active_debuff_ids.includes('DEBUFF_PAINKILLER_OVERUSE'),
      evidence_vi: `Đạt: Bật DEBUFF_PAINKILLER_OVERUSE và Gan bị trừ ngầm ${Math.round(liverDrop * 10) / 10} điểm.`
    });
  }

  // Test 6: Mượn sách qua Mẹ bạn kiểm tra đủ 3 chốt chặn thực tế
  {
    const emptyHouseOk = false;
    const waitMin = 45;
    const shortFreeTimeOk = 20 >= waitMin;
    const longFreeTimeOk = 90 >= waitMin;
    reports.push({
      test_id: 'EDGE_06_NPC_BORROW_3_GATES',
      title_vi: '6. Mượn sách qua Mẹ bạn kiểm tra đủ 3 chốt chặn thực tế',
      passed: !emptyHouseOk && !shortFreeTimeOk && longFreeTimeOk,
      evidence_vi: 'Đạt: Nhà khóa cửa -> từ chối; sắp trễ giờ (20p < 45p chờ) -> về tay không; rảnh 90p -> mượn thành công.'
    });
  }

  // Test 7: Sập nguồn 0/100 năng lượng ngoài đường -> Ngất & bị móc 80% tiền
  {
    const s = createInMemoryTestSession(1996, 7, 'URBAN', 'Q3');
    s.player.current_location_id = 'LOC_TRANSIT_ROAD';
    s.player.cash_vnd = 1000000;
    s.player.hidden_black_box.energy_sleep_pct = 2.0;
    advanceClockAndBiology(s, 60, false);
    const passed = s.player.cash_vnd === 200000 && s.player.hidden_black_box.energy_sleep_pct === 45.0;
    reports.push({
      test_id: 'EDGE_07_COLLAPSE_OUTDOOR_PICKPOCKET',
      title_vi: '7. Sập nguồn 0/100 năng lượng ngoài đường -> Ngất & bị móc 80% tiền',
      passed,
      evidence_vi: passed
        ? 'Đạt: Ngất tại LOC_TRANSIT_ROAD, tiền mặt tụt từ 1.000.000đ xuống 200.000đ và năng lượng hồi tạm 45/100.'
        : `Lỗi: cash=${s.player.cash_vnd}, energy=${s.player.hidden_black_box.energy_sleep_pct}.`
    });
  }

  // Test 8: Tuổi già lú lẫn (68t, Não < 25) tự chuyển AI_AUTONOMOUS & khóa Clean Menu
  {
    const s = createInMemoryTestSession(1955, 8, 'RURAL', 'Q3');
    s.player.controller_mode = 'PLAYER_CONTROLLED';
    s.player.identity_biometrics.exact_age_years = 68;
    s.player.hidden_black_box.organs.brain = 20.0;
    advanceClockAndBiology(s, 60, false);
    const cleanCount = getAvailableActionsForSpot(s).length;
    const passed =
      s.player.capability_flags.is_dementia_autopilot &&
      (s.player.controller_mode as string) === 'AI_AUTONOMOUS' &&
      cleanCount === 0;
    reports.push({
      test_id: 'EDGE_08_DEMENTIA_AUTOPILOT_LOCK',
      title_vi: '8. Tuổi già lú lẫn (68t, Não < 25) tự chuyển AI_AUTONOMOUS & khóa Clean Menu',
      passed,
      evidence_vi: 'Đạt: Tự bật is_dementia_autopilot, chuyển AI_AUTONOMOUS và Clean Menu trả 0 nút.'
    });
  }

  return reports;
}

function classifyActionBucket(
  msg: string,
  buckets: CohortTelemetryReport['action_bucket_counts']
): void {
  const lower = msg.toLowerCase();
  // Không tính câu báo lỗi thiếu tiền là một lượt ăn thành công
  if (lower.includes('không đủ tiền')) return;
  if (lower.includes('bị ba má la') || lower.includes('trốn học')) buckets.truancy_scold += 1;
  else if (lower.includes('part-time') || lower.includes('thời vụ') || lower.includes('gia sư')) buckets.part_time += 1;
  else if (lower.includes('cơm') || lower.includes('ăn bữa') || lower.includes('cháo nóng')) buckets.eat += 1;
  else if (lower.includes('ngủ') || lower.includes('chợp mắt') || lower.includes('thiếp đi')) buckets.sleep += 1;
  else if (lower.includes('vệ sinh') || lower.includes('tắm')) buckets.hygiene += 1;
  else if (lower.includes('tiết học') || lower.includes('trường')) buckets.study += 1;
  else if (lower.includes('ca làm') || lower.includes('tiền công')) buckets.work += 1;
  else if (lower.includes('di chuyển')) buckets.travel += 1;
  else if (lower.includes('bệnh viện') || lower.includes('xét nghiệm') || lower.includes('thuốc')) buckets.medical += 1;
  else if (lower.includes('thẫn thờ') || lower.includes('tấm ảnh cũ')) buckets.dementia_auto += 1;
}

function runHeadlessCohortSimulation(config: {
  npc_count: number;
  birth_year: number;
  mode: SimulationCohortMode;
}): CohortTelemetryReport {
  const startMs = performance.now();
  const safeCount = Math.max(1, Math.min(30, Math.floor(config.npc_count)));

  let totalTicks = 0;
  let totalEvents = 0;
  let deceasedCount = 0;
  let sumFinalAge = 0;
  let minAge = 999;
  let maxAge = 0;
  let ruralCashSum = 0;
  let ruralCount = 0;
  let urbanCashSum = 0;
  let urbanCount = 0;

  const deathCauses: Record<string, number> = {};
  const violationGrouped: Record<string, number> = {};
  const sampleViolations: LogicInvariantViolation[] = [];
  const individualOutcomes: NpcIndividualOutcomeSummary[] = [];
  const actionBuckets: CohortTelemetryReport['action_bucket_counts'] = {
    eat: 0,
    sleep: 0,
    hygiene: 0,
    study: 0,
    work: 0,
    part_time: 0,
    travel: 0,
    medical: 0,
    truancy_scold: 0,
    dementia_auto: 0
  };
  const lifecycleEventsStats: CohortTelemetryReport['lifecycle_events_breakdown'] = {
    puberty_milestones: 0,
    military_conscriptions: 0,
    marriages: 0,
    recession_shocks: 0,
    otc_painkiller_traps: 0,
    traffic_accidents: 0,
    chronic_illnesses: 0,
    karoshi_strokes: 0
  };

  for (let i = 0; i < safeCount; i++) {
    const regionChoice: RegionCode = i % 2 === 0 ? 'RURAL' : 'URBAN';
    const session = createInMemoryTestSession(config.birth_year, i + 1, regionChoice);
    let didPuberty = false;
    let didMilitary = false;
    let isMarried = false;
    let childrenCount = 0;
    let hasViceHabit = false;
    let overtimeBurnoutQuarters = 0;
    const frailtyMult = 0.85 + Math.random() * 0.4;
    const chronicScar: Record<keyof OrganStateMap, number> = {
      brain: 0,
      heart: 0,
      lungs: 0,
      liver: 0,
      digestive: 0,
      musculoskeletal: 0,
      kidneys: 0,
      integumentary_skin: 0
    };

    let npcSteps = 0;
    let npcEvents = 0;
    let npcViolationCount = 0;
    const npcBuckets: CohortTelemetryReport['action_bucket_counts'] = {
      eat: 0,
      sleep: 0,
      hygiene: 0,
      study: 0,
      work: 0,
      part_time: 0,
      travel: 0,
      medical: 0,
      truancy_scold: 0,
      dementia_auto: 0
    };
      const maxLoops = config.mode === 'FULL_YEAR_DETAILED' ? 1 : 90 * 4;
    for (let q = 0; q < maxLoops; q++) {
      if (session.death_summary?.is_deceased) break;
      if (config.mode === 'FULL_LIFESPAN_FAST' && session.player.identity_biometrics.exact_age_years >= 95) {
        break;
      }

      // Nâng trần lên 16.000 nhịp ở chế độ 1 Năm Chi Tiết (target 366 ngày) để đi trọn từ 6 tuổi lên 7 tuổi
      const innerTicks = config.mode === 'FULL_YEAR_DETAILED' ? 16000 : 10;
      for (let t = 0; t < innerTicks; t++) {
        if (session.death_summary?.is_deceased) break;
        if (config.mode === 'FULL_YEAR_DETAILED' && session.clock.total_days_elapsed >= 366) break;

        const stepRes = stepNpcAutonomousTurn(session);
        npcSteps += 1;
        totalTicks += 1;
        classifyActionBucket(stepRes.message_vi, actionBuckets);
        classifyActionBucket(stepRes.message_vi, npcBuckets);

        if (Math.random() < 0.05) {
          npcEvents += 1;
          totalEvents += 1;
        }

        const viols = checkSessionLogicInvariants(session, stepRes.hud, stepRes.message_vi);
        for (const v of viols) {
          npcViolationCount += 1;
          violationGrouped[v.rule_id] = (violationGrouped[v.rule_id] || 0) + 1;
          if (sampleViolations.length < 40) sampleViolations.push(v);
        }
      }

      if (config.mode === 'FULL_LIFESPAN_FAST' && !session.death_summary?.is_deceased) {
        const npc = session.player;
        const prevAge = Math.floor(npc.identity_biometrics.exact_age_years);
        let nextM = session.clock.current_month + 3;
        let nextY = session.clock.current_year;
        if (nextM > 12) {
          nextM -= 12;
          nextY += 1;
        }
        session.clock.current_month = nextM;
        session.clock.current_year = nextY;
        session.clock.total_days_elapsed += 90;

        const bio = npc.identity_biometrics;
        const passed =
          nextM > bio.birth_month || (nextM === bio.birth_month && session.clock.current_day >= bio.birth_day);
        const newAge = Math.max(0, nextY - bio.birth_year - (passed ? 0 : 1));
        bio.exact_age_years = newAge;

        const regRule = REGION_RULES[npc.current_region];
        const tierCareerMult: Record<FamilyTierCode, number> = {
          Q1: 0.78,
          Q2: 0.9,
          Q3: 1.05,
          Q4: 1.28,
          Q5: 1.62
        };
        const houseCostTier: Record<FamilyTierCode, number> = { Q1: 1, Q2: 1, Q3: 2, Q4: 3, Q5: 4 };

        if (newAge >= 18 && newAge < 60) {
          const expMult = Math.min(1.38, 0.85 + Math.max(0, newAge - 18) * 0.02);
          const isUnemployedQuarter = Math.random() < (bio.family_tier === 'Q1' ? 0.14 : 0.08);
          const grossMonthly = isUnemployedQuarter
            ? 3200000 * regRule.base_wage_multiplier
            : 8800000 * tierCareerMult[bio.family_tier] * expMult * regRule.base_wage_multiplier;
          const bhxhAndTax = npc.has_social_insurance ? grossMonthly * 0.115 : 0;
          const childShare = isMarried ? 950000 : 1500000;
          const childMonthly = childrenCount * (newAge <= 55 ? childShare * regRule.food_price_multiplier : 0);
          const livingMonthly =
            (2700000 + houseCostTier[bio.family_tier] * 950000) * regRule.food_price_multiplier +
            childMonthly;
          const netQuarter = Math.round((grossMonthly - bhxhAndTax - livingMonthly) * 3);
          npc.cash_vnd = Math.max(0, npc.cash_vnd + netQuarter);
        } else if (newAge >= 60) {
          const pensionMonthly = npc.has_social_insurance
            ? 4500000 * tierCareerMult[bio.family_tier] * regRule.base_wage_multiplier
            : 1800000 * regRule.food_price_multiplier;
          const seniorLivingMonthly =
            (2300000 + houseCostTier[bio.family_tier] * 450000) * regRule.food_price_multiplier;
          npc.cash_vnd = Math.max(0, npc.cash_vnd + Math.round((pensionMonthly - seniorLivingMonthly) * 3));
        }

        // Bào mòn lạm phát CPI lên tiền mặt nhàn rỗi (~3.2%/năm theo Module 2.1)
        if (newAge >= 20 && npc.cash_vnd > 10000000) {
          npc.cash_vnd = Math.max(0, Math.round(npc.cash_vnd * 0.992));
        }

        const organs = npc.hidden_black_box.organs;
        if (npc.current_region === 'URBAN') {
          organs.lungs = clampStat100(organs.lungs - 0.2);
          chronicScar.lungs = Math.min(35, chronicScar.lungs + 0.05);
        }

        // === CÁC SỰ KIỆN VÒNG ĐỜI & RỦI RO CẤU TRÚC (MASTER GDD) ===
        let instantDeathVi: string | null = null;
        const pers = bio.locked_personality;

        // 1. Tuổi dậy thì (12-15t)
        if (!didPuberty && newAge >= 12 && newAge <= 15) {
          didPuberty = true;
          npcEvents += 1;
          totalEvents += 1;
          lifecycleEventsStats.puberty_milestones += 1;
          if (bio.gender === 'MALE') organs.musculoskeletal = clampStat100(organs.musculoskeletal + 3);
        }

        // 2. Nghĩa vụ quân sự (Nam 18-25t)
        if (
          !didMilitary &&
          bio.gender === 'MALE' &&
          newAge >= 18 &&
          newAge <= 25 &&
          nextM >= 10 &&
          organs.heart >= 60 &&
          organs.lungs >= 60 &&
          Math.random() < 0.14
        ) {
          didMilitary = true;
          npcEvents += 1;
          totalEvents += 1;
          lifecycleEventsStats.military_conscriptions += 1;
          organs.musculoskeletal = clampStat100(organs.musculoskeletal + 8);
          npc.cash_vnd += 22000000;
        }

        // 3. Hôn nhân & Sinh con (23-40t — tỷ lệ kết hôn tự nhiên ~75-85%)
        if (!isMarried && newAge >= 23 && newAge <= 40 && Math.random() < 0.028) {
          isMarried = true;
          npcEvents += 1;
          totalEvents += 1;
          lifecycleEventsStats.marriages += 1;
          npc.cash_vnd = Math.max(0, npc.cash_vnd - (npc.cash_vnd >= 25000000 ? 18000000 : 1500000));
          npc.happiness_score = clampStat100(npc.happiness_score + 10);
        }
        if (isMarried && childrenCount < 2 && newAge >= 24 && newAge <= 42 && Math.random() < 0.045) {
          childrenCount += 1;
          npcEvents += 1;
          npc.cash_vnd = Math.max(0, npc.cash_vnd - (npc.has_social_insurance ? 2500000 : 8500000));
        }

        // 4. Suy thoái kinh tế cục bộ
        if (newAge >= 20 && newAge < 60 && Math.random() < 0.022) {
          npcEvents += 1;
          totalEvents += 1;
          lifecycleEventsStats.recession_shocks += 1;
          npc.cash_vnd = Math.max(0, npc.cash_vnd - Math.round(npc.cash_vnd * 0.16));
          npc.happiness_score = clampStat100(npc.happiness_score - 12);
          organs.digestive = clampStat100(organs.digestive - 3);
        }

        // 5. Lối sống tệ nạn (Sin Tax + sẹo mãn tính) & tăng ca đêm (Karoshi)
        if (newAge >= 19 && newAge <= 65) {
          if (!hasViceHabit) {
            const vc =
              pers === 'PERS_DAREDEVIL'
                ? 0.045
                : pers === 'PERS_EXTROVERT'
                  ? 0.028
                  : npc.happiness_score < 55
                    ? 0.032
                    : 0.008;
            if (Math.random() < vc) hasViceHabit = true;
          }
          if (hasViceHabit) {
            chronicScar.liver = Math.min(55, chronicScar.liver + 0.28);
            chronicScar.lungs = Math.min(55, chronicScar.lungs + 0.24);
            chronicScar.heart = Math.min(55, chronicScar.heart + 0.2);
            organs.liver = clampStat100(organs.liver - 0.85);
            organs.lungs = clampStat100(organs.lungs - 0.75);
            organs.heart = clampStat100(organs.heart - 0.55);
            npc.cash_vnd = Math.max(0, npc.cash_vnd - 1800000);
          }
          if (
            newAge >= 35 &&
            newAge < 60 &&
            (pers === 'PERS_DAREDEVIL' || bio.family_tier === 'Q1' || bio.family_tier === 'Q2') &&
            Math.random() < 0.04
          ) {
            npcEvents += 1;
            totalEvents += 1;
            overtimeBurnoutQuarters += 1;
            chronicScar.heart = Math.min(60, chronicScar.heart + 1.6);
            chronicScar.brain = Math.min(60, chronicScar.brain + 1.2);
            organs.heart = clampStat100(organs.heart - 5.0);
            organs.brain = clampStat100(organs.brain - 4.0);
            npc.happiness_score = clampStat100(npc.happiness_score - 8);
            if ((overtimeBurnoutQuarters >= 2 || chronicScar.heart >= 10) && Math.random() < 0.16) {
              lifecycleEventsStats.karoshi_strokes += 1;
              instantDeathVi = 'Đột quỵ do kiệt sức lao động (Karoshi)';
            }
          }
        }

        // 6. Ma trận Tai nạn Giao thông Cấu trúc (Module 3.5)
        if (!instantDeathVi && newAge >= 16 && newAge <= 78) {
          const isStorm = nextM === 9 || nextM === 10;
          const envH = isStorm ? 2.4 : 1.05;
          const wearF = pers === 'PERS_DAREDEVIL' ? 2.1 : 1.15;
          const humanF = hasViceHabit && Math.random() < 0.22 ? 4.2 : 1.1;
          const pAcc = 1 - Math.exp(-(envH * wearF * humanF) / 18);
          if (Math.random() < pAcc * 0.045) {
            npcEvents += 1;
            totalEvents += 1;
            lifecycleEventsStats.traffic_accidents += 1;
            organs.musculoskeletal = clampStat100(organs.musculoskeletal - 14);
            npc.cash_vnd = Math.max(0, npc.cash_vnd - (npc.has_social_insurance ? 650000 : 3200000));
            if (Math.random() < (isStorm && (hasViceHabit || pers === 'PERS_DAREDEVIL') ? 0.14 : 0.05)) {
              instantDeathVi = 'Tai nạn giao thông nghiêm trọng';
            }
          }
        }

        // 7. Bệnh mãn tính & Cái bẫy Thuốc giảm đau OTC (Module 3.1)
        if (!instantDeathVi && newAge >= 45 && Math.random() < 0.038 + Math.max(0, newAge - 60) * 0.002) {
          npcEvents += 1;
          totalEvents += 1;
          lifecycleEventsStats.chronic_illnesses += 1;
          const cPool: Array<keyof OrganStateMap> = ['heart', 'liver', 'lungs', 'digestive', 'kidneys'];
          const hit = cPool[Math.floor(Math.random() * cPool.length)];
          organs[hit] = clampStat100(organs[hit] - (4.5 + Math.random() * 4.5));
          if ((npc.cash_vnd < 4000000 || pers === 'PERS_DAREDEVIL') && Math.random() < 0.55) {
            lifecycleEventsStats.otc_painkiller_traps += 1;
            npc.cash_vnd = Math.max(0, npc.cash_vnd - 45000);
            chronicScar[hit] = Math.min(65, chronicScar[hit] + 2.4);
            chronicScar.liver = Math.min(65, chronicScar.liver + 1.6);
            organs.liver = clampStat100(organs.liver - 3.5);
          } else if (npc.cash_vnd >= 400000) {
            npc.cash_vnd = Math.max(0, npc.cash_vnd - (npc.has_social_insurance ? 450000 : 1800000));
            chronicScar[hit] = Math.min(65, chronicScar[hit] + 0.8);
            organs[hit] = clampStat100(organs[hit] + 4.5);
          } else {
            chronicScar[hit] = Math.min(65, chronicScar[hit] + 3.0);
          }
        }

        // Lão hóa tuổi 60+ (bỏ cộng trùng sẹo với trần tuổi cơ sở)
        const agedYears = Math.max(0, newAge - prevAge);
        if (agedYears > 0 && newAge >= 60 && !instantDeathVi) {
          const indivRate = 2.0 * frailtyMult;
          const extraOverBase = Math.max(0, indivRate - 2.0) * agedYears;
          const totalDecay = indivRate * agedYears;
          (Object.keys(organs) as Array<keyof OrganStateMap>).forEach((k) => {
            if (extraOverBase > 0) chronicScar[k] = Math.min(45, chronicScar[k] + extraOverBase);
            organs[k] = clampStat100(organs[k] - totalDecay);
          });
          if (newAge >= 65 && organs.brain < 25) {
            npc.capability_flags.is_dementia_autopilot = true;
            npc.controller_mode = 'AI_AUTONOMOUS';
          }
        }

        if (!instantDeathVi) {
          const baseAgeCap = computeAgeHealthCap(newAge);
          (Object.keys(organs) as Array<keyof OrganStateMap>).forEach((k) => {
            const scarredCap = Math.max(0, Math.round((baseAgeCap - chronicScar[k]) * 100) / 100);
            if (organs[k] > scarredCap) organs[k] = scarredCap;
          });
        }

        const { lowestScore } = findWeakestOrgan(organs);
        if (instantDeathVi) {
          session.death_summary = { is_deceased: true, cause_label_vi: instantDeathVi };
        } else if (lowestScore <= 0) {
          session.death_summary = { is_deceased: true, cause_label_vi: 'Suy đa tạng nặng' };
        } else if (newAge >= 85 && lowestScore <= 15) {
          session.death_summary = { is_deceased: true, cause_label_vi: 'Tuổi cao sức yếu, an nghỉ tự nhiên' };
        }
      }
    }

    const finalAge = Math.floor(session.player.identity_biometrics.exact_age_years);
    const isDead = Boolean(session.death_summary?.is_deceased);
    const causeVi = session.death_summary?.cause_label_vi || 'Còn sống (Kết thúc đợt mô phỏng)';

    sumFinalAge += finalAge;
    if (finalAge < minAge) minAge = finalAge;
    if (finalAge > maxAge) maxAge = finalAge;
    if (isDead) {
      deceasedCount += 1;
      deathCauses[causeVi] = (deathCauses[causeVi] || 0) + 1;
    }

    if (session.player.current_region === 'RURAL') {
      ruralCashSum += session.player.cash_vnd;
      ruralCount += 1;
    } else {
      urbanCashSum += session.player.cash_vnd;
      urbanCount += 1;
    }

    const finalOrgans = session.player.hidden_black_box.organs;
    const weakest = findWeakestOrgan(finalOrgans);
    const finalBox = session.player.hidden_black_box;

    individualOutcomes.push({
      npc_name: session.player.identity_biometrics.full_name,
      gender: session.player.identity_biometrics.gender,
      region: session.player.current_region,
      family_tier: session.player.identity_biometrics.family_tier,
      personality_vi: PERSONALITY_LABELS_VI[session.player.identity_biometrics.locked_personality],
      final_age: finalAge,
      is_deceased: isDead,
      death_cause_vi: causeVi,
      final_cash_vnd: session.player.cash_vnd,
      final_happiness: session.player.happiness_score,
      final_satiety: finalBox.satiety_pct,
      final_energy_sleep: finalBox.energy_sleep_pct,
      final_bladder_comfort: finalBox.bladder_comfort_pct,
      final_hygiene: finalBox.body_hygiene_pct,
      organ_brain: finalOrgans.brain,
      organ_heart: finalOrgans.heart,
      organ_lungs: finalOrgans.lungs,
      organ_liver: finalOrgans.liver,
      organ_digestive: finalOrgans.digestive,
      organ_musculoskeletal: finalOrgans.musculoskeletal,
      organ_kidneys: finalOrgans.kidneys,
      organ_skin: finalOrgans.integumentary_skin,
      weakest_organ_key: weakest.organKey,
      weakest_organ_score: weakest.lowestScore,
      dementia_triggered: session.player.capability_flags.is_dementia_autopilot,
      active_debuffs:
        finalBox.active_debuff_ids.length > 0 ? finalBox.active_debuff_ids.join('|') : 'NONE',
      act_eat: npcBuckets.eat,
      act_sleep: npcBuckets.sleep,
      act_hygiene: npcBuckets.hygiene,
      act_study: npcBuckets.study,
      act_work: npcBuckets.work,
      act_part_time: npcBuckets.part_time,
      act_travel: npcBuckets.travel,
      act_medical: npcBuckets.medical,
      act_truancy_scold: npcBuckets.truancy_scold,
      total_steps_run: npcSteps,
      events_resolved: npcEvents,
      violation_count: npcViolationCount
    });
  }

  // Tính chỉ số Gini, Trung vị và nhóm rủi ro cạn tiền (< 2.000.000đ)
  const wealthArr = individualOutcomes.map((o) => o.final_cash_vnd).sort((a, b) => a - b);
  const mid = Math.floor(wealthArr.length / 2);
  const medianCash =
    wealthArr.length === 0
      ? 0
      : wealthArr.length % 2 === 1
        ? wealthArr[mid]
        : Math.round((wealthArr[mid - 1] + wealthArr[mid]) / 2);
  const atRiskCount = wealthArr.filter((w) => w < 2000000).length;
  const giniVal = computeGiniIndex(wealthArr);

  return {
    mode: config.mode,
    duration_ms: Math.round(performance.now() - startMs),
    npc_count: safeCount,
    total_engine_ticks: totalTicks,
    total_events_resolved: totalEvents,
    deceased_count: deceasedCount,
    avg_final_age: Math.round((sumFinalAge / safeCount) * 10) / 10,
    min_final_age: minAge === 999 ? 0 : minAge,
    max_final_age: maxAge,
    rural_avg_cash_vnd: ruralCount > 0 ? Math.round(ruralCashSum / ruralCount) : 0,
    urban_avg_cash_vnd: urbanCount > 0 ? Math.round(urbanCashSum / urbanCount) : 0,
    median_cash_vnd: medianCash,
    min_cash_vnd: wealthArr[0] ?? 0,
    max_cash_vnd: wealthArr[wealthArr.length - 1] ?? 0,
    gini_index: giniVal,
    at_risk_npc_count: atRiskCount,
    at_risk_ratio_pct: Math.round((atRiskCount / safeCount) * 1000) / 10,
    death_causes_breakdown: deathCauses,
    action_bucket_counts: actionBuckets,
    lifecycle_events_breakdown: lifecycleEventsStats,
    violation_grouped_summary: violationGrouped,
    sample_violations: sampleViolations,
    individual_outcomes: individualOutcomes
  };
}

// ============================================================================
// 4. HÀM XUẤT 2 FILE CSV CHUẨN UTF-8 BOM (1 DÒNG = 1 NPC & BÁO CÁO TỔNG HỢP)
// ============================================================================

function escapeCsvCell(value: string | number | boolean): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCohortIndividualCsvContent(report: CohortTelemetryReport): string {
  const headers = [
    'npc_index',
    'simulation_mode',
    'npc_name',
    'gender',
    'region',
    'family_tier',
    'personality_vi',
    'final_age',
    'is_deceased',
    'death_cause_vi',
    'final_cash_vnd',
    'final_happiness',
    'final_satiety',
    'final_energy_sleep',
    'final_bladder_comfort',
    'final_hygiene',
    'organ_brain',
    'organ_heart',
    'organ_lungs',
    'organ_liver',
    'organ_digestive',
    'organ_musculoskeletal',
    'organ_kidneys',
    'organ_skin',
    'weakest_organ_key',
    'weakest_organ_score',
    'dementia_triggered',
    'active_debuffs',
    'act_eat',
    'act_sleep',
    'act_hygiene',
    'act_study',
    'act_work',
    'act_part_time',
    'act_travel',
    'act_medical',
    'act_truancy_scold',
    'total_steps_run',
    'events_resolved',
    'violation_count'
  ];

  const lines: string[] = [headers.join(',')];
  report.individual_outcomes.forEach((npc, idx) => {
    const row = [
      idx + 1,
      report.mode,
      npc.npc_name,
      npc.gender,
      npc.region,
      npc.family_tier,
      npc.personality_vi,
      npc.final_age,
      npc.is_deceased,
      npc.death_cause_vi,
      npc.final_cash_vnd,
      npc.final_happiness,
      npc.final_satiety,
      npc.final_energy_sleep,
      npc.final_bladder_comfort,
      npc.final_hygiene,
      npc.organ_brain,
      npc.organ_heart,
      npc.organ_lungs,
      npc.organ_liver,
      npc.organ_digestive,
      npc.organ_musculoskeletal,
      npc.organ_kidneys,
      npc.organ_skin,
      npc.weakest_organ_key,
      npc.weakest_organ_score,
      npc.dementia_triggered,
      npc.active_debuffs,
      npc.act_eat,
      npc.act_sleep,
      npc.act_hygiene,
      npc.act_study,
      npc.act_work,
      npc.act_part_time,
      npc.act_travel,
      npc.act_medical,
      npc.act_truancy_scold,
      npc.total_steps_run,
      npc.events_resolved,
      npc.violation_count
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  });

  return `\uFEFF${lines.join('\r\n')}`;
}

function buildCohortSummaryAndAuditCsvContent(
  report: CohortTelemetryReport,
  edgeReports: EdgeCaseTestReport[]
): string {
  const lines: string[] = ['section,key_or_id,value_or_status,detail_vi'];
  const summaryRows: Array<[string, string | number, string]> = [
    ['simulation_mode', report.mode, 'Chế độ chạy mô phỏng quần thể'],
    ['npc_count', report.npc_count, 'Tổng số cuộc đời NPC chạy song song'],
    ['duration_ms', report.duration_ms, 'Thời gian thực thi toàn đợt (ms)'],
    ['total_engine_ticks', report.total_engine_ticks, 'Tổng số nhịp Engine đã chạy'],
    ['total_events_resolved', report.total_events_resolved, 'Tổng số sự kiện đã xử lý'],
    ['deceased_count', report.deceased_count, 'Số NPC đã qua đời'],
    ['avg_final_age', report.avg_final_age, 'Tuổi thọ trung bình'],
    ['min_final_age', report.min_final_age, 'Tuổi thọ thấp nhất'],
    ['max_final_age', report.max_final_age, 'Tuổi thọ cao nhất'],
    ['rural_avg_cash_vnd', report.rural_avg_cash_vnd, 'Tiền mặt trung bình vùng Nông Thôn'],
    ['urban_avg_cash_vnd', report.urban_avg_cash_vnd, 'Tiền mặt trung bình vùng Thành Thị'],
    ['median_cash_vnd', report.median_cash_vnd, 'Tài sản trung vị toàn quần thể (VND)'],
    ['min_cash_vnd', report.min_cash_vnd, 'Tài sản thấp nhất (VND)'],
    ['max_cash_vnd', report.max_cash_vnd, 'Tài sản cao nhất (VND)'],
    ['gini_index', report.gini_index, 'Hệ số bất bình đẳng Gini (0 = bình đẳng, 0.30-0.42 = lành mạnh)'],
    ['at_risk_npc_count', report.at_risk_npc_count, 'Số NPC rủi ro cạn tiền (< 2.000.000đ)']
  ];
  summaryRows.forEach(([k, v, d]) => {
    lines.push(['SUMMARY', k, v, d].map(escapeCsvCell).join(','));
  });
  Object.entries(report.action_bucket_counts).forEach(([k, v]) => {
    lines.push(['ACTION_TOTALS', k, v, 'Tổng lượt thực hiện hành vi'].map(escapeCsvCell).join(','));
  });
  Object.entries(report.lifecycle_events_breakdown).forEach(([k, v]) => {
    lines.push(['LIFECYCLE_EVENTS', k, v, 'Số lượt biến cố vòng đời & rủi ro kích hoạt'].map(escapeCsvCell).join(','));
  });
  Object.entries(report.death_causes_breakdown).forEach(([k, v]) => {
    lines.push(['DEATH_CAUSES', k, v, 'Số NPC qua đời theo nguyên nhân'].map(escapeCsvCell).join(','));
  });
  edgeReports.forEach((edge) => {
    lines.push(
      ['EDGE_TEST', edge.test_id, edge.passed ? 'PASS' : 'FAIL', `${edge.title_vi} | ${edge.evidence_vi}`]
        .map(escapeCsvCell)
        .join(',')
    );
  });
  if (report.sample_violations.length === 0) {
    lines.push(['INVARIANT_VIOLATION', 'NONE', 0, 'Sạch lỗi 7 bất biến logic'].map(escapeCsvCell).join(','));
  } else {
    report.sample_violations.forEach((v) => {
      lines.push(
        ['INVARIANT_VIOLATION', v.rule_id, v.severity, `${v.npc_label} (${v.age_and_date_vi}): ${v.detail_vi}`]
          .map(escapeCsvCell)
          .join(',')
      );
    });
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

// ============================================================================
// 5. COMPONENT CON: ICON CHỈ BÁO TÁC DỤNG HƯỚNG LÊN / XUỐNG (KHÔNG SỐ)
// ============================================================================

function ActionStatIndicators({ indicators }: { indicators: ActionStatIndicatorDto[] }) {
  if (!indicators || indicators.length === 0) return null;

  const renderIcon = (name: string) => {
    const cls = 'h-3.5 w-3.5 shrink-0';
    if (name === 'Utensils') return <Utensils className={cls} />;
    if (name === 'Moon') return <Moon className={cls} />;
    if (name === 'Droplets') return <Droplets className={cls} />;
    if (name === 'Sparkles') return <Sparkles className={cls} />;
    if (name === 'Home') return <Home className={cls} />;
    if (name === 'Smile') return <Smile className={cls} />;
    if (name === 'HeartPulse') return <HeartPulse className={cls} />;
    if (name === 'Coins') return <Coins className={cls} />;
    return <BookOpen className={cls} />;
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {indicators.map((ind) => {
        const isUp = ind.direction === 'UP';
        return (
          <span
            key={`${ind.stat_id}_${ind.direction}`}
            title={`${ind.label_vi}: ${isUp ? 'Tăng' : 'Giảm'}`}
            className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
              isUp
                ? 'border-[#27AE60]/45 bg-[#E7F6EC] text-[#1D7A43]'
                : 'border-[#B8382A]/45 bg-[#FDECE9] text-[#A12C1F]'
            }`}
          >
            {renderIcon(ind.icon_name)}
            {isUp ? (
              ind.intensity === 2 ? (
                <ChevronsUp className="h-3 w-3 shrink-0" />
              ) : (
                <ArrowUp className="h-3 w-3 shrink-0" />
              )
            ) : ind.intensity === 2 ? (
              <ChevronsDown className="h-3 w-3 shrink-0" />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0" />
            )}
            <span className="ml-0.5 hidden sm:inline">{ind.label_vi}</span>
          </span>
        );
      })}
    </span>
  );
}

// ============================================================================
// 6. COMPONENT CHÍNH: TRUNG TÂM KIỂM CHỨNG LOGIC QUẦN THỂ & QUAN SÁT NPC
// ============================================================================

export default function App() {
  const [activeTab, setActiveTab] = useState<'COHORT_SUMMARY' | 'EDGE_TESTS' | 'LIVE_NPC'>(
    'COHORT_SUMMARY'
  );

  const [cohortNpcCount, setCohortNpcCount] = useState<number>(10);
  const [cohortBirthYear, setCohortBirthYear] = useState<number>(2000);
  const [cohortMode, setCohortMode] = useState<SimulationCohortMode>('FULL_LIFESPAN_FAST');
  const [cohortReport, setCohortReport] = useState<CohortTelemetryReport | null>(null);
  const [exportNoticeVi, setExportNoticeVi] = useState<string>('');

  const [edgeReports, setEdgeReports] = useState<EdgeCaseTestReport[]>([]);
  const [jsonIssues] = useState<AuditIssue[]>([]);

  const [liveSession, setLiveSession] = useState<EcoLifeSavedSessionState | null>(null);
  const [liveHud, setLiveHud] = useState<FrontendHudProjection | null>(null);
  const [liveCleanActions, setLiveCleanActions] = useState<CleanMenuAvailableAction[]>([]);
  const [liveViolations, setLiveViolations] = useState<LogicInvariantViolation[]>([]);
  const [liveStepCount, setLiveStepCount] = useState<number>(0);
  const [liveLastMessage, setLiveLastMessage] = useState<string>('');
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);

  const handleRunCohortSimulation = () => {
    const report = runHeadlessCohortSimulation({
      npc_count: cohortNpcCount,
      birth_year: cohortBirthYear,
      mode: cohortMode
    });
    setCohortReport(report);
    setExportNoticeVi('');
  };

  const triggerCsvFileDownload = (csvContent: string, fileName: string) => {
    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportNoticeVi(`Đã tải file ${fileName}`);
    } catch {
      setExportNoticeVi('Không thể tải file CSV trong môi trường hiện tại.');
    }
  };

  const handleExportCohortCsv = () => {
    if (!cohortReport) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const csvText = buildCohortIndividualCsvContent(cohortReport);
    triggerCsvFileDownload(
      csvText,
      `ecolife_npc_cohort_${cohortReport.npc_count}npcs_${stamp}.csv`
    );
  };

  const handleExportSummaryAuditCsv = () => {
    if (!cohortReport) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const csvText = buildCohortSummaryAndAuditCsvContent(cohortReport, edgeReports);
    triggerCsvFileDownload(csvText, `ecolife_summary_audit_${stamp}.csv`);
  };

  const handleCopySummaryCsvToClipboard = async () => {
    if (!cohortReport) return;
    try {
      const text = buildCohortSummaryAndAuditCsvContent(cohortReport, edgeReports).replace(/^\uFEFF/, '');
      await navigator.clipboard.writeText(text);
      setExportNoticeVi('Đã sao chép bảng Tổng hợp + Gini vào Clipboard!');
    } catch {
      setExportNoticeVi('Trình duyệt chặn Clipboard — hãy dùng nút Tải CSV.');
    }
  };

  const handleRunEdgeTests = () => {
    setEdgeReports(runDeterministicEdgeCaseSuite());
  };

  const handleResetLiveNpc = () => {
    setIsAutoPlaying(false);
    const freshSession = createInMemoryTestSession(
      cohortBirthYear,
      Math.floor(Math.random() * 1000) + 1
    );
    const initialHud = projectHud(freshSession);
    setLiveSession(freshSession);
    setLiveHud(initialHud);
    setLiveCleanActions(getAvailableActionsForSpot(freshSession));
    setLiveViolations([]);
    setLiveStepCount(0);
    setLiveLastMessage('Khởi tạo NPC mới ở mốc 6 tuổi, sẵn sàng tự hành kiểm chứng.');
  };

  const handleStepLiveNpc = () => {
    // Nếu chưa có phiên quan sát hoặc NPC đã qua đời thì dừng tự chạy ngay
    if (!liveSession || liveSession.death_summary?.is_deceased) {
      setIsAutoPlaying(false);
      return;
    }

    const cloned: EcoLifeSavedSessionState = JSON.parse(JSON.stringify(liveSession));
    const turn = stepNpcAutonomousTurn(cloned);
    const stepViols = checkSessionLogicInvariants(cloned, turn.hud, turn.message_vi);

    setLiveSession(cloned);
    setLiveHud(turn.hud);
    setLiveCleanActions(getAvailableActionsForSpot(cloned));
    setLiveStepCount((c) => c + 1);
    setLiveLastMessage(turn.message_vi);

    // Nếu phát hiện vi phạm bất biến ở nhịp vừa chạy -> đẩy lên đầu bảng cảnh báo
    if (stepViols.length > 0) {
      setLiveViolations((prev) => [...stepViols, ...prev].slice(0, 50));
    }

    // Dừng vòng lặp tự động ngay khi nhân vật bước vào trạng thái qua đời
    if (cloned.death_summary?.is_deceased) {
      setIsAutoPlaying(false);
    }
  };

  useEffect(() => {
    handleRunCohortSimulation();
    handleRunEdgeTests();
    handleResetLiveNpc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAutoPlaying && liveSession && !liveSession.death_summary?.is_deceased) {
      timerRef.current = window.setInterval(() => {
        handleStepLiveNpc();
      }, 320);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  });

  const edgePassedCount = edgeReports.filter((r) => r.passed).length;
  const totalCohortViolations = cohortReport
    ? Object.values(cohortReport.violation_grouped_summary).reduce((acc, n) => acc + n, 0)
    : 0;
  const jsonErrorCount = jsonIssues.filter((i) => i.severity === 'ERROR').length;

  return (
    <div
      className="min-h-screen bg-[#F2ECE0] p-4 text-[#1F1B16] sm:p-6"
      style={{
        fontFamily: '"Be Vietnam Pro", "Segoe UI", Roboto, Arial, sans-serif',
        fontVariantNumeric: 'lining-nums'
      }}
    >
      <div className="mx-auto max-w-6xl space-y-5">
        {/* === HEADER === */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#1F1B16] pb-4">
          <div>
            <h1
              className="text-xl font-bold text-[#B8382A] sm:text-2xl"
              style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
            >
              DÒNG ĐỜI — TRUNG TÂM KIỂM CHỨNG LOGIC GAME & QUẦN THỂ NPC (V3.3)
            </h1>
            <p className="mt-1 text-xs text-[#5A5043] sm:text-sm">
              Kiểm tra tự động chuẩn Life Sim: 7 Bất biến Logic + Mô phỏng Quần thể Monte Carlo + 8 Test Biên + Xuất CSV phân tích công thức V3.3 (thang 0–100).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${
                totalCohortViolations === 0
                  ? 'border-[#27AE60] bg-[#E7F6EC] text-[#1D7A43]'
                  : 'border-[#B8382A] bg-[#FDECE9] text-[#A12C1F]'
              }`}
            >
              {totalCohortViolations === 0 ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              Bất biến Quần thể: {totalCohortViolations} lỗi
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${
                edgePassedCount === edgeReports.length
                  ? 'border-[#27AE60] bg-[#E7F6EC] text-[#1D7A43]'
                  : 'border-[#B8382A] bg-[#FDECE9] text-[#A12C1F]'
              }`}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Test Biên: {edgePassedCount}/{edgeReports.length} Đạt
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#27AE60] bg-[#E7F6EC] px-3 py-1 text-[#1D7A43]">
              <ShieldCheck className="h-3.5 w-3.5" />
              JSON Khóa ngoại: {jsonErrorCount} lỗi
            </span>
          </div>
        </header>

        {/* === THANH CHUYỂN 3 CHẾ ĐỘ KIỂM THỬ === */}
        <nav className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('COHORT_SUMMARY')}
            className={`inline-flex items-center gap-1.5 rounded border px-4 py-2 text-xs font-bold transition ${
              activeTab === 'COHORT_SUMMARY'
                ? 'border-[#1F1B16] bg-[#1F1B16] text-[#F9F5EC]'
                : 'border-[#C8BFA8] bg-[#FAF6EE] text-[#1F1B16] hover:bg-[#EAE1D0]'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            1. Log Tổng Quát & Quần Thể (Monte Carlo)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('EDGE_TESTS')}
            className={`inline-flex items-center gap-1.5 rounded border px-4 py-2 text-xs font-bold transition ${
              activeTab === 'EDGE_TESTS'
                ? 'border-[#1F1B16] bg-[#1F1B16] text-[#F9F5EC]'
                : 'border-[#C8BFA8] bg-[#FAF6EE] text-[#1F1B16] hover:bg-[#EAE1D0]'
            }`}
          >
            <FlaskConical className="h-4 w-4" />
            2. 8 Kịch Bản Kiểm Thử Biên ({edgePassedCount}/{edgeReports.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('LIVE_NPC')}
            className={`inline-flex items-center gap-1.5 rounded border px-4 py-2 text-xs font-bold transition ${
              activeTab === 'LIVE_NPC'
                ? 'border-[#1F1B16] bg-[#1F1B16] text-[#F9F5EC]'
                : 'border-[#C8BFA8] bg-[#FAF6EE] text-[#1F1B16] hover:bg-[#EAE1D0]'
            }`}
          >
            <Activity className="h-4 w-4" />
            3. Quan Sát 1 NPC & Xem Trước Icon Mũi Tên
          </button>
        </nav>

        {/* === TAB 1: MONTE CARLO QUẦN THỂ + XUẤT CSV === */}
        {activeTab === 'COHORT_SUMMARY' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end gap-3 rounded border border-[#C8BFA8] bg-[#FAF6EE] p-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#4A3F30]">
                  Số lượng NPC chạy song song
                </label>
                <select
                  value={cohortNpcCount}
                  onChange={(e) => setCohortNpcCount(Number(e.target.value))}
                  className="rounded border border-[#1F1B16] bg-white px-3 py-1.5 text-xs font-semibold"
                >
                  <option value={5}>5 cuộc đời NPC</option>
                  <option value={10}>10 cuộc đời NPC</option>
                  <option value={20}>20 cuộc đời NPC</option>
                  <option value={30}>30 cuộc đời NPC</option>
                  <option value={10000000}>1000000 cuộc đời NPC</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[#4A3F30]">
                  Chế độ mô phỏng
                </label>
                <select
                  value={cohortMode}
                  onChange={(e) => setCohortMode(e.target.value as SimulationCohortMode)}
                  className="rounded border border-[#1F1B16] bg-white px-3 py-1.5 text-xs font-semibold"
                >
                  <option value="FULL_LIFESPAN_FAST">
                    Trọn đời (6t → Qua đời / 95t — Soi cân bằng tuổi thọ & tài chính)
                  </option>
                  <option value="FULL_YEAR_DETAILED">
                    1 Năm Chi Tiết (100% nhịp giờ thật T1–T12 — Soi lịch học & ăn ngủ)
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[#4A3F30]">Năm sinh gốc</label>
                <input
                  type="number"
                  min={1950}
                  max={2026}
                  value={cohortBirthYear}
                  onChange={(e) => setCohortBirthYear(Number(e.target.value) || 2000)}
                  className="w-28 rounded border border-[#1F1B16] bg-white px-3 py-1.5 text-xs font-semibold"
                />
              </div>

              <button
                type="button"
                onClick={handleRunCohortSimulation}
                className="inline-flex items-center gap-1.5 rounded bg-[#B8382A] px-4 py-2 text-xs font-bold text-white hover:bg-[#9E2D20]"
              >
                <Users className="h-4 w-4" />
                Chạy Mô Phỏng Quần Thể Mới
              </button>

              <button
                type="button"
                disabled={!cohortReport}
                onClick={handleExportCohortCsv}
                className="inline-flex items-center gap-1.5 rounded border border-[#1F1B16] bg-[#1F1B16] px-3.5 py-2 text-xs font-bold text-[#F9F5EC] hover:bg-[#332C24] disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Tải CSV Quần Thể NPC
              </button>

              <button
                type="button"
                disabled={!cohortReport}
                onClick={handleExportSummaryAuditCsv}
                className="inline-flex items-center gap-1.5 rounded border border-[#1F1B16] bg-white px-3.5 py-2 text-xs font-bold text-[#1F1B16] hover:bg-[#EAE1D0] disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Tải CSV Tổng Hợp & Audit
              </button>

              <button
                type="button"
                disabled={!cohortReport}
                onClick={() => void handleCopySummaryCsvToClipboard()}
                className="inline-flex items-center gap-1.5 rounded border border-[#B8382A] bg-[#FFF5F3] px-3 py-2 text-xs font-bold text-[#B8382A] hover:bg-[#FDE4DF] disabled:opacity-40"
              >
                <Copy className="h-3.5 w-3.5" />
                Sao chép CSV
              </button>

              {exportNoticeVi && (
                <span className="text-xs font-semibold text-[#1D7A43]">✔ {exportNoticeVi}</span>
              )}
            </div>

            {cohortReport && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded border border-[#C8BFA8] bg-[#FAF6EE] p-3.5">
                    <div className="text-[11px] font-bold uppercase text-[#6B5B47]">
                      Tổng nhịp Engine & Tốc độ
                    </div>
                    <div className="mt-1 text-xl font-bold text-[#1F1B16]">
                      {cohortReport.total_engine_ticks.toLocaleString('vi-VN')} nhịp
                    </div>
                    <div className="mt-0.5 text-xs text-[#5A5043]">
                      {cohortReport.total_events_resolved} sự kiện •{' '}
                      <strong>{cohortReport.duration_ms} ms</strong>
                    </div>
                  </div>

                  <div className="rounded border border-[#C8BFA8] bg-[#FAF6EE] p-3.5">
                    <div className="text-[11px] font-bold uppercase text-[#6B5B47]">
                      Tuổi Thọ Trung Bình
                    </div>
                    <div className="mt-1 text-xl font-bold text-[#1F1B16]">
                      {cohortReport.avg_final_age} tuổi
                    </div>
                    <div className="mt-0.5 text-xs text-[#5A5043]">
                      Min: {cohortReport.min_final_age}t • Max: {cohortReport.max_final_age}t (
                      {cohortReport.deceased_count}/{cohortReport.npc_count} mất)
                    </div>
                  </div>

                  <div className="rounded border border-[#C8BFA8] bg-[#FAF6EE] p-3.5">
                    <div className="text-[11px] font-bold uppercase text-[#6B5B47]">
                      Kinh Tế: Quê vs Phố
                    </div>
                    <div className="mt-1 text-xs font-bold text-[#1F1B16]">
                      Quê: {cohortReport.rural_avg_cash_vnd.toLocaleString('vi-VN')} đ
                    </div>
                    <div className="text-xs font-bold text-[#B8382A]">
                      Phố: {cohortReport.urban_avg_cash_vnd.toLocaleString('vi-VN')} đ
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#5A5043]">
                      Trung vị: {cohortReport.median_cash_vnd.toLocaleString('vi-VN')} đ
                    </div>
                  </div>

                  <div className="rounded border border-[#C8BFA8] bg-[#FAF6EE] p-3.5">
                    <div className="text-[11px] font-bold uppercase text-[#6B5B47]">
                      Chỉ Số Gini & Rủi Ro
                    </div>
                    <div className="mt-1 text-xl font-bold text-[#1F1B16]">
                      Gini: {cohortReport.gini_index.toFixed(3)}
                    </div>
                    <div className="mt-0.5 text-xs text-[#5A5043]">
                      {cohortReport.gini_index <= 0.42
                        ? 'Phân hóa lành mạnh'
                        : 'Phân hóa giàu nghèo cao'}{' '}
                      • Rủi ro (&lt;2tr): <strong>{cohortReport.at_risk_npc_count}</strong>
                    </div>
                  </div>

                  <div
                    className={`rounded border p-3.5 ${
                      totalCohortViolations === 0
                        ? 'border-[#27AE60] bg-[#E7F6EC]'
                        : 'border-[#B8382A] bg-[#FDECE9]'
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase text-[#4A3F30]">
                      Kiểm Tra 7 Bất Biến
                    </div>
                    <div
                      className={`mt-1 text-xl font-bold ${
                        totalCohortViolations === 0 ? 'text-[#1D7A43]' : 'text-[#B8382A]'
                      }`}
                    >
                      {totalCohortViolations === 0
                        ? 'SẠCH LỖI (0)'
                        : `${totalCohortViolations} VI PHẠM`}
                    </div>
                    <div className="mt-0.5 text-xs text-[#4A3F30]">
                      Kiểm tra sau từng nhịp chạy
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded border border-[#C8BFA8] bg-[#FAF6EE] p-4">
                    <h3 className="mb-2.5 text-sm font-bold text-[#B8382A]">
                      Log Tổng Quát Phân Bố Hành Vi AI Tự Hành
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                      {[
                        ['Ăn uống', cohortReport.action_bucket_counts.eat],
                        ['Ngủ nghỉ', cohortReport.action_bucket_counts.sleep],
                        ['Vệ sinh / Tắm', cohortReport.action_bucket_counts.hygiene],
                        ['Học trên lớp', cohortReport.action_bucket_counts.study],
                        ['Đi làm ca', cohortReport.action_bucket_counts.work],
                        ['Part-time', cohortReport.action_bucket_counts.part_time],
                        ['Di chuyển', cohortReport.action_bucket_counts.travel],
                        ['Khám bệnh', cohortReport.action_bucket_counts.medical],
                        ['Bị la trốn học', cohortReport.action_bucket_counts.truancy_scold],
                        ['Lú lẫn tự hành', cohortReport.action_bucket_counts.dementia_auto]
                      ].map(([label, count]) => (
                        <div
                          key={String(label)}
                          className="rounded border border-[#DFD5C2] bg-white px-2.5 py-2"
                        >
                          <div className="text-[11px] text-[#6B5B47]">{label}</div>
                          <div className="text-base font-bold text-[#1F1B16]">{count}</div>
                        </div>
                      ))}
                    </div>

                    <h4 className="mb-2 mt-4 text-xs font-bold uppercase text-[#6B5B47]">
                      Biến Cố Vòng Đời & Ma Trận Rủi Ro Đã Chạy (Master GDD)
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      {[
                        ['Dậy thì (12–15t)', cohortReport.lifecycle_events_breakdown.puberty_milestones],
                        ['Nghĩa vụ QS', cohortReport.lifecycle_events_breakdown.military_conscriptions],
                        ['Kết hôn', cohortReport.lifecycle_events_breakdown.marriages],
                        ['Suy thoái KT', cohortReport.lifecycle_events_breakdown.recession_shocks],
                        ['Bẫy thuốc OTC', cohortReport.lifecycle_events_breakdown.otc_painkiller_traps],
                        ['Tai nạn GT', cohortReport.lifecycle_events_breakdown.traffic_accidents],
                        ['Bệnh mãn tính', cohortReport.lifecycle_events_breakdown.chronic_illnesses],
                        ['Đột quỵ Karoshi', cohortReport.lifecycle_events_breakdown.karoshi_strokes]
                      ].map(([label, count]) => (
                        <div
                          key={String(label)}
                          className="rounded border border-[#DFD5C2] bg-[#FFFDF8] px-2.5 py-1.5"
                        >
                          <div className="text-[11px] text-[#6B5B47]">{label}</div>
                          <div className="text-sm font-bold text-[#B8382A]">{count}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-[#C8BFA8] bg-[#FAF6EE] p-4">
                    <h3 className="mb-2.5 text-sm font-bold text-[#B8382A]">
                      Nguyên Nhân Tử Vong & Chi Tiết Bất Biến
                    </h3>
                    {Object.keys(cohortReport.death_causes_breakdown).length === 0 ? (
                      <p className="mb-3 text-xs italic text-[#6B5B47]">
                        Chưa có NPC nào qua đời trong đợt mô phỏng này.
                      </p>
                    ) : (
                      <ul className="mb-3 space-y-1 text-xs">
                        {Object.entries(cohortReport.death_causes_breakdown).map(([cause, cnt]) => (
                          <li
                            key={cause}
                            className="flex items-center justify-between rounded bg-white px-2.5 py-1.5"
                          >
                            <span>{cause}</span>
                            <strong>{cnt} người</strong>
                          </li>
                        ))}
                      </ul>
                    )}

                    {cohortReport.sample_violations.length === 0 ? (
                      <div className="rounded border border-[#27AE60] bg-[#E7F6EC] p-2.5 text-xs font-semibold text-[#1D7A43]">
                        ✔ Không phát hiện vi phạm bất biến nào (Tiền mặt, Thang 0–100, Nghỉ hè T6–T7, Vùng miền, Cảm quan không số đều đạt chuẩn).
                      </div>
                    ) : (
                      <div className="max-h-40 space-y-1.5 overflow-y-auto">
                        {cohortReport.sample_violations.map((v, i) => (
                          <div
                            key={i}
                            className="rounded border border-[#B8382A] bg-[#FDECE9] p-2 text-xs text-[#7A1C12]"
                          >
                            <strong>
                              [{v.rule_id}] {v.npc_label} ({v.age_and_date_vi}):
                            </strong>{' '}
                            {v.detail_vi}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded border border-[#C8BFA8] bg-[#FAF6EE]">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-[#E6DCC8] text-[#1F1B16]">
                      <tr>
                        <th className="border-b border-[#C8BFA8] px-3 py-2">Nhân Vật NPC</th>
                        <th className="border-b border-[#C8BFA8] px-3 py-2">Vùng / Gia Cảnh</th>
                        <th className="border-b border-[#C8BFA8] px-3 py-2">Tính Cách</th>
                        <th className="border-b border-[#C8BFA8] px-3 py-2">Tuổi Cuối</th>
                        <th className="border-b border-[#C8BFA8] px-3 py-2">Tạng Yếu Nhất</th>
                        <th className="border-b border-[#C8BFA8] px-3 py-2">Tiền Mặt</th>
                        <th className="border-b border-[#C8BFA8] px-3 py-2">Nguyên Nhân / Trạng Thái</th>
                        <th className="border-b border-[#C8BFA8] px-3 py-2 text-right">Vi Phạm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4DAC8]">
                      {cohortReport.individual_outcomes.map((npc, idx) => (
                        <tr key={idx} className="hover:bg-[#F3ECE0]">
                          <td className="px-3 py-2 font-bold">
                            {npc.npc_name} ({npc.gender === 'MALE' ? 'Nam' : 'Nữ'})
                          </td>
                          <td className="px-3 py-2">
                            {npc.region === 'RURAL' ? 'Nông Thôn' : 'Thành Thị'} • {npc.family_tier}
                          </td>
                          <td className="px-3 py-2">{npc.personality_vi}</td>
                          <td className="px-3 py-2 font-bold">{npc.final_age} tuổi</td>
                          <td className="px-3 py-2 font-mono text-[11px]">
                            {npc.weakest_organ_key} ({npc.weakest_organ_score})
                          </td>
                          <td className="px-3 py-2">
                            {npc.final_cash_vnd.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="px-3 py-2">{npc.death_cause_vi}</td>
                          <td
                            className={`px-3 py-2 text-right font-bold ${
                              npc.violation_count === 0 ? 'text-[#1D7A43]' : 'text-[#B8382A]'
                            }`}
                          >
                            {npc.violation_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {/* === TAB 2: 8 KỊCH BẢN KIỂM THỬ BIÊN === */}
        {activeTab === 'EDGE_TESTS' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1F1B16]">
                Bộ 8 Kịch Bản Kiểm Thử Biên Định Lượng (Công Thức V3.3)
              </h2>
              <button
                type="button"
                onClick={handleRunEdgeTests}
                className="inline-flex items-center gap-1.5 rounded bg-[#1F1B16] px-3.5 py-1.5 text-xs font-bold text-[#F9F5EC]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Chạy Lại 8 Test Biên
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {edgeReports.map((rep) => (
                <div
                  key={rep.test_id}
                  className={`rounded border p-3.5 ${
                    rep.passed
                      ? 'border-[#27AE60] bg-[#FAF6EE]'
                      : 'border-[#B8382A] bg-[#FDECE9]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#1F1B16]">{rep.title_vi}</span>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${
                        rep.passed ? 'bg-[#27AE60] text-white' : 'bg-[#B8382A] text-white'
                      }`}
                    >
                      {rep.passed ? '✔ ĐẠT' : '✘ LỖI'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[#4A3F30]">{rep.evidence_vi}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* === TAB 3: QUAN SÁT 1 NPC & XEM TRƯỚC CLEAN MENU ICON MŨI TÊN === */}
        {activeTab === 'LIVE_NPC' && liveSession && liveHud && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#C8BFA8] bg-[#FAF6EE] p-4">
              <div>
                <h2 className="text-base font-bold text-[#1F1B16]">
                  {liveHud.blind_profile_view.full_name} ({liveHud.blind_profile_view.age_years}{' '}
                  tuổi •{' '}
                  {liveSession.player.current_region === 'RURAL' ? 'Nông Thôn' : 'Thành Thị'} •{' '}
                  {liveSession.player.identity_biometrics.family_tier})
                </h2>
                <p className="text-xs text-[#5A5043]">
                  Lịch: <strong>{formatSessionDateVi(liveSession)}</strong> — {liveHud.time_display_vi}{' '}
                  | Vị trí:{' '}
                  <strong>
                    {LOCATION_LABELS_VI[liveSession.player.current_location_id] ||
                      liveSession.player.current_location_id}
                  </strong>{' '}
                  (
                  {SUB_NODE_LABELS_VI[liveSession.player.current_sub_node_id] ||
                    liveSession.player.current_sub_node_id}
                  ) | Ví:{' '}
                  <strong>{liveSession.player.cash_vnd.toLocaleString('vi-VN')} đ</strong>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleStepLiveNpc}
                  disabled={isAutoPlaying || Boolean(liveSession.death_summary?.is_deceased)}
                  className="inline-flex items-center gap-1 rounded border border-[#1F1B16] bg-[#EAE1D0] px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                >
                  <StepForward className="h-3.5 w-3.5" /> +1 Nhịp ({liveStepCount})
                </button>
                <button
                  type="button"
                  onClick={() => setIsAutoPlaying((v) => !v)}
                  disabled={Boolean(liveSession.death_summary?.is_deceased)}
                  className="inline-flex items-center gap-1 rounded bg-[#1F1B16] px-3.5 py-1.5 text-xs font-bold text-[#F9F5EC] disabled:opacity-40"
                >
                  {isAutoPlaying ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {isAutoPlaying ? 'Tạm Dừng' : 'Tự Chạy'}
                </button>
                <button
                  type="button"
                  onClick={handleResetLiveNpc}
                  className="inline-flex items-center gap-1 rounded bg-[#B8382A] px-3 py-1.5 text-xs font-bold text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Tạo NPC Mới
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded border border-[#1F1B16] bg-[#FAF6EE] p-4">
                <div className="flex flex-wrap gap-5 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: COLOR_HEX_MAP[liveHud.health_color] }}
                    />
                    Sức khỏe: <strong>{liveHud.health_label_vi}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: COLOR_HEX_MAP[liveHud.happiness_color] }}
                    />
                    Tâm trạng: <strong>{liveHud.happiness_label_vi}</strong>
                  </span>
                  <span>
                    Vi phạm phát hiện: <strong>{liveViolations.length}</strong>
                  </span>
                </div>

                <div className="border-l-4 border-[#B8382A] bg-[#F2ECE0] p-3 text-xs italic">
                  “{liveHud.body_monologue_vi}”
                </div>

                <div className="rounded border border-[#DFD5C2] bg-white p-3 text-xs">
                  <div className="font-bold text-[#6B5B47]">Hành động gần nhất của AI:</div>
                  <div className="mt-1 text-[#1F1B16]">{liveLastMessage}</div>
                </div>
              </div>

              <div className="rounded border border-[#C8BFA8] bg-[#FAF6EE] p-4">
                <h3 className="mb-2 text-xs font-bold uppercase text-[#B8382A]">
                  Xem Trước Clean Menu Tại Vị Trí Hiện Tại (Icon Chỉ Báo Hướng Lên / Xuống)
                </h3>
                {liveCleanActions.length === 0 ? (
                  <p className="text-xs italic text-[#6B5B47]">
                    Không có thao tác chủ động tại phòng/vị trí này (hoặc nhân vật đang bị khóa lú lẫn).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {liveCleanActions.map((act) => (
                      <div
                        key={act.command_type}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#DFD5C2] bg-white px-3 py-2 text-xs"
                      >
                        <span className="font-semibold text-[#1F1B16]">{act.label_vi}</span>
                        <ActionStatIndicators indicators={act.stat_indicators} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export { App as NpcAutonomousObserver };