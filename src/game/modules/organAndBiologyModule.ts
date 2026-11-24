// [MODULE 1: NỘI TẠNG & SINH HỌC — CÔNG THỨC TỔNG QUÁT & RÀNG BUỘC ĐƠN VỊ (V3.3)]
// Thay thế các chuỗi if/else rời rạc bằng 3 phương trình tổng quát từ ecoLifeUnifiedFormulas.ts:
// 1. Hàm áp lực thiếu hụt liên tục Φ(x; θ, p) cho mọi nhu cầu & vòng xoáy Tâm–Thể.
// 2. Trần sức khỏe lão hóa theo tuổi C_age(A).
// 3. Thời lượng thao tác tổng quát có thứ nguyên chặt chẽ.

import { EcoLifeJsonDb, type PersonalityCode } from '../jsonDatabaseLoader';
import {
  STAT_MAX_VALUE,
  STAT_MIN_VALUE,
  type ActiveOveruseDebuffId,
  type FamilyTierCode,
  type HumanEntityState,
  type OrganStateMap,
  type OveruseTrackerState,
  type RegionCode
} from '../engineTypes';
import {
  type Multiplier,
  applyStatDelta,
  asDays,
  asHours,
  asMinutes,
  asMultiplier,
  asRatePerDay,
  asRatePerHour,
  asRatePerYear,
  asStat100,
  asYears,
  clampRange,
  computeAgeHealthCap,
  computeDeficitStressDelta,
  computeLinearDayDelta,
  computeLinearHourDelta,
  computeSocialBatteryHourlyRate,
  computeUnifiedActionMinutes,
  minutesToHours,
  round2
} from '../math/ecoLifeUnifiedFormulas';

export interface CreateHumanEntityInput {
  entityId: string;
  birthYear: number;
  fullName?: string;
  gender?: 'MALE' | 'FEMALE';
  familyTier?: FamilyTierCode;
  birthRegion?: RegionCode;
  controllerMode?: 'PLAYER_CONTROLLED' | 'AI_AUTONOMOUS';
}

export interface BiologyTickOptions {
  /** True khi khoảng thời gian vừa trôi là lúc nhân vật đang ngủ / chợp mắt */
  is_sleeping_period?: boolean;
}

export interface BiologyTickOutput {
  extra_collapse_minutes: number;
  collapse_journal_log_vi: string | null;
  did_enter_dementia_autopilot: boolean;
}

export interface DeathCheckResult {
  is_dead: boolean;
  cause_label_vi: string | null;
  epitaph_vi: string;
}

// ============================================================================
// 1. BẢNG THAM SỐ VẬT LÝ PHẲNG (DATA-DRIVEN PARAMETERS CHO CÔNG THỨC TỔNG QUÁT)
// ============================================================================

interface OrganStressChannel {
  organ: keyof OrganStateMap;
  source: 'satiety' | 'bladder' | 'hygiene' | 'energy' | 'happiness';
  onset_threshold: number; // θ [pt]
  exponent: number; // p
  max_rate_per_hour: number; // k_max [pt/h]
}

// Toàn bộ 8 kênh bào mòn sinh học & tâm-thể được gom về 1 bảng tham số duy nhất (thay cho 10 nhánh if/else cũ)
const AWAKE_ORGAN_STRESS_CHANNELS: readonly OrganStressChannel[] = [
  { organ: 'digestive', source: 'satiety', onset_threshold: 20, exponent: 2, max_rate_per_hour: 0.45 },
  { organ: 'kidneys', source: 'bladder', onset_threshold: 15, exponent: 2, max_rate_per_hour: 0.5 },
  { organ: 'integumentary_skin', source: 'hygiene', onset_threshold: 25, exponent: 2, max_rate_per_hour: 0.3 },
  { organ: 'brain', source: 'energy', onset_threshold: 55, exponent: 2, max_rate_per_hour: 0.85 },
  { organ: 'heart', source: 'energy', onset_threshold: 55, exponent: 2, max_rate_per_hour: 0.6 },
  { organ: 'liver', source: 'energy', onset_threshold: 55, exponent: 2, max_rate_per_hour: 0.3 },
  { organ: 'digestive', source: 'happiness', onset_threshold: 40, exponent: 1.5, max_rate_per_hour: 0.15 },
  { organ: 'heart', source: 'happiness', onset_threshold: 40, exponent: 1.5, max_rate_per_hour: 0.1 }
];

// ============================================================================
// 2. HÀM TIỆN ÍCH CƠ BẢN (GIỮ NGUYÊN CHỮ KÝ API CHO TOÀN BỘ 9 MODULE)
// ============================================================================

export function clampNumber(
  value: number,
  minVal: number = STAT_MIN_VALUE,
  maxVal: number = STAT_MAX_VALUE
): number {
  return round2(clampRange(value, minVal, maxVal));
}

export function clampStat100(value: number): number {
  return asStat100(value);
}

export function getNaturalOrganRecoveryCap(exactAgeYears: number): number {
  const annualDecay = EcoLifeJsonDb.agingEndgame.aging_progression.annual_organ_decay_pct;
  const startAge = EcoLifeJsonDb.agingEndgame.aging_progression.senescence_start_age;
  return computeAgeHealthCap(
    asYears(exactAgeYears),
    asYears(startAge),
    asRatePerYear(annualDecay)
  );
}

export function createEmptyOveruseTracker(): OveruseTrackerState {
  return {
    painkiller_doses_last_24h: 0,
    stimulant_doses_last_24h: 0,
    alcohol_sessions_last_24h: 0,
    alcohol_intoxication_hours_left: 0,
    nicotine_tolerance: 0,
    hours_since_last_nicotine: 0,
    alcohol_tolerance: 0,
    hours_since_last_alcohol: 0,
    weekly_work_hours: 0,
    consecutive_night_shifts: 0,
    circadian_shock_hours_left: 0,
    last_meal_def_id: null,
    consecutive_same_meal_count: 0,
    active_debuff_ids: []
  };
}

export function addActiveDebuff(
  tracker: OveruseTrackerState,
  debuffId: ActiveOveruseDebuffId
): void {
  if (!tracker.active_debuff_ids.includes(debuffId)) {
    tracker.active_debuff_ids.push(debuffId);
  }
}

export function removeActiveDebuff(
  tracker: OveruseTrackerState,
  debuffId: ActiveOveruseDebuffId
): void {
  tracker.active_debuff_ids = tracker.active_debuff_ids.filter((id) => id !== debuffId);
}

export function applyOrganDeltas(
  entity: HumanEntityState,
  deltas: Partial<Record<keyof OrganStateMap, number>>
): void {
  const keys = Object.keys(deltas) as Array<keyof OrganStateMap>;
  for (const key of keys) {
    const delta = deltas[key];
    if (typeof delta === 'number') {
      entity.hidden_black_box.organs[key] = asStat100(
        entity.hidden_black_box.organs[key] + delta
      );
    }
  }
}

export function findWeakestOrgan(organs: OrganStateMap): {
  organKey: keyof OrganStateMap;
  lowestScore: number;
} {
  const keys: Array<keyof OrganStateMap> = [
    'brain',
    'heart',
    'lungs',
    'liver',
    'digestive',
    'musculoskeletal',
    'kidneys',
    'integumentary_skin'
  ];

  let weakestKey: keyof OrganStateMap = 'brain';
  let minVal = organs.brain;
  for (const key of keys) {
    if (organs[key] < minVal) {
      minVal = organs[key];
      weakestKey = key;
    }
  }
  return { organKey: weakestKey, lowestScore: minVal };
}

export function calculateActualActionMinutes(
  entity: HumanEntityState,
  baseMinutes: number,
  isReadingOrPaperwork: boolean = false,
  isOverburdenedMovement: boolean = false
): number {
  const extraMultipliers: Multiplier[] = [];

  // Chứng Khó đọc làm chậm thao tác đọc/giấy tờ theo đúng hệ số từ JSON
  if (isReadingOrPaperwork && entity.identity_biometrics.innate_traits.includes('TRAIT_DYSLEXIA')) {
    extraMultipliers.push(asMultiplier(1.45));
  }
  // Mang vác quá tải sức chứa làm chậm tốc độ di chuyển
  if (isOverburdenedMovement) {
    extraMultipliers.push(asMultiplier(1.3));
  }

  // Ánh xạ các debuff lạm dụng đang hoạt động sang mảng hệ số không thứ nguyên
  const rules = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs;
  const debuffMultiplierMap: Partial<Record<ActiveOveruseDebuffId, number>> = {
    DEBUFF_CLINICAL_BURNOUT: rules.DEBUFF_CLINICAL_BURNOUT.time_cost_multiplier,
    DEBUFF_CIRCADIAN_SHOCK: rules.DEBUFF_CIRCADIAN_SHOCK.time_cost_multiplier,
    DEBUFF_ALCOHOL_WITHDRAWAL:
      rules.DEBUFF_ALCOHOL_OVERUSE_AND_WITHDRAWAL.withdrawal_time_cost_multiplier,
    DEBUFF_NICOTINE_WITHDRAWAL: rules.DEBUFF_NICOTINE_WITHDRAWAL.withdrawal_time_cost_multiplier,
    DEBUFF_FRAGMENTED_NAP_FATIGUE: rules.DEBUFF_FRAGMENTED_NAP_FATIGUE.time_cost_multiplier
  };

  const debuffMultipliers: Multiplier[] = [];
  for (const id of entity.hidden_black_box.overuse_tracker.active_debuff_ids) {
    const mult = debuffMultiplierMap[id];
    if (typeof mult === 'number') {
      debuffMultipliers.push(asMultiplier(mult));
    }
  }

  // Nếu đã mở khóa kỹ năng Quản lý thời gian thì điểm kỹ năng hiệu dụng luôn là 100pt
  const effectiveTimeSkill = entity.capability_flags.is_time_management_unlocked
    ? asStat100(100)
    : asStat100(entity.hidden_black_box.time_management_pct);

  return computeUnifiedActionMinutes({
    base_minutes: asMinutes(baseMinutes),
    time_management_pct: effectiveTimeSkill,
    energy_sleep_pct: asStat100(entity.hidden_black_box.energy_sleep_pct),
    extra_multipliers: extraMultipliers,
    debuff_multipliers: debuffMultipliers
  });
}

// ============================================================================
// 3. KHỞI TẠO THỰC THỂ CON NGƯỜI THỐNG NHẤT & KHÓA TÍNH CÁCH TUỔI LÊN 6
// ============================================================================

const LAST_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Đặng', 'Bùi'];
const MALE_NAMES = ['Minh An', 'Văn Bình', 'Hoàng Long', 'Đức Huy', 'Quốc Bảo', 'Tuấn Kiệt'];
const FEMALE_NAMES = ['Thị Mai', 'Ngọc Lan', 'Thanh Thảo', 'Minh Thư', 'Phương Anh', 'Thu Hà'];

export function createInitialHumanEntity(input: CreateHumanEntityInput): HumanEntityState {
  const now = new Date();
  const realDay = now.getDate();
  const realMonth = now.getMonth() + 1;

  const resolvedGender: 'MALE' | 'FEMALE' =
    input.gender || (Math.random() < 0.5 ? 'MALE' : 'FEMALE');
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const firstPool = resolvedGender === 'MALE' ? MALE_NAMES : FEMALE_NAMES;
  const firstName = firstPool[Math.floor(Math.random() * firstPool.length)];
  const resolvedName = input.fullName || `${lastName} ${firstName}`;

  const tierPool: FamilyTierCode[] = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const resolvedTier: FamilyTierCode =
    input.familyTier || tierPool[Math.floor(Math.random() * tierPool.length)];
  const resolvedRegion: RegionCode =
    input.birthRegion || (Math.random() < 0.55 ? 'RURAL' : 'URBAN');

  const startingCashMap: Record<FamilyTierCode, number> = {
    Q1: 0,
    Q2: 200000,
    Q3: 1500000,
    Q4: 5000000,
    Q5: 20000000
  };
  const houseTierMap: Record<FamilyTierCode, 1 | 2 | 3 | 4> = {
    Q1: 1,
    Q2: 1,
    Q3: 2,
    Q4: 3,
    Q5: 4
  };

  // [Biến thiên di truyền & dinh dưỡng sơ sinh — Master GDD Module 3.21]
  // Gia cảnh Q1/Q2 có nền dinh dưỡng thấp hơn nhẹ; mỗi cơ quan dao động tự nhiên 82 - 96 thay vì cố định 90
  const tierOrganOffset: Record<FamilyTierCode, number> = {
    Q1: -4.0,
    Q2: -2.0,
    Q3: 0.0,
    Q4: 2.0,
    Q5: 3.0
  };
  const rollOrganBase = (): number =>
    clampNumber(86.0 + tierOrganOffset[resolvedTier] + (Math.random() * 12.0 - 6.0), 72.0, 97.0);

  const initialOrgans: OrganStateMap = {
    brain: rollOrganBase(),
    heart: rollOrganBase(),
    lungs: rollOrganBase(),
    liver: rollOrganBase(),
    digestive: rollOrganBase(),
    musculoskeletal: rollOrganBase(),
    kidneys: rollOrganBase(),
    integumentary_skin: rollOrganBase()
  };

  // 22% tỷ lệ mang 1 điểm yếu nội tạng di truyền bẩm sinh (yếu tim, hen suyễn phổi, dạ dày yếu...)
  if (Math.random() < 0.22) {
    const geneticPool: Array<keyof OrganStateMap> = ['heart', 'lungs', 'digestive', 'liver', 'kidneys'];
    const weakKey = geneticPool[Math.floor(Math.random() * geneticPool.length)];
    initialOrgans[weakKey] = clampNumber(initialOrgans[weakKey] - (10.0 + Math.random() * 6.0), 60.0, 95.0);
  }

  // Ngẫu nhiên 0-1 đặc tính thần kinh / thể chất bẩm sinh ẩn (Module 3.12)
  const innateTraits: string[] = [];
  const traitRoll = Math.random();
  if (traitRoll < 0.08) innateTraits.push('TRAIT_ADHD');
  else if (traitRoll < 0.14) innateTraits.push('TRAIT_DYSLEXIA');
  else if (traitRoll < 0.19) innateTraits.push('TRAIT_ASD');
  else if (traitRoll < 0.29) innateTraits.push('TRAIT_FAST_LEARNER');
  else if (traitRoll < 0.37) innateTraits.push('QUICK_REFLEXES');

  return {
    entity_id: input.entityId,
    controller_mode: input.controllerMode || 'PLAYER_CONTROLLED',
    current_region: resolvedRegion,
    current_location_id: 'LOC_HOME',
    current_sub_node_id: 'HOME_LIVING_ROOM',
    cash_vnd: startingCashMap[resolvedTier],
    bank_savings_vnd: 0,
    has_social_insurance: resolvedTier === 'Q3' || resolvedTier === 'Q4' || resolvedTier === 'Q5',
    happiness_score: 75.0,
    house_tier: houseTierMap[resolvedTier],
    identity_biometrics: {
      full_name: resolvedName,
      gender: resolvedGender,
      birth_day: realDay,
      birth_month: realMonth,
      birth_year: input.birthYear,
      family_tier: resolvedTier,
      exact_age_years: 0,
      height_cm: 50,
      weight_kg: 3.2,
      education_level_key: 'Chưa đi học',
      hobby_key: null,
      locked_personality: null,
      innate_traits: innateTraits,
      owned_certificates: []
    },
    hidden_black_box: {
      organs: initialOrgans,
      satiety_pct: 85.0,
      energy_sleep_pct: 100.0,
      bladder_comfort_pct: 85.0,
      body_hygiene_pct: 85.0,
      house_cleanliness_pct: 85.0,
      social_battery_pct: 80.0,
      time_management_pct: 0.0,
      naps_taken_since_full_sleep: 0,
      ptsd_trauma_score: 0.0,
      painkiller_masked_hours_left: 0.0,
      overuse_tracker: createEmptyOveruseTracker()
    },
    capability_flags: {
      is_clock_visible: false,
      is_weather_app_visible: false,
      is_time_management_unlocked: false,
      is_biometrics_decoded: false,
      is_personality_decoded: false,
      is_dementia_autopilot: false
    },
    owned_furniture: [],
    inventory_items: [
      {
        instance_id: 'EQUIP_CLOTHES_DEFAULT',
        item_def_id: 'ITEM_CASUAL_OUTFIT',
        display_name_key: 'Bộ quần áo thường ngày (có túi quần)',
        category: 'CLOTHING',
        usage_type: 'DURABLE_REUSABLE',
        size_class: 'PORTABLE_CARRY',
        weight_kg: 0.4,
        current_durability_pct: 100.0,
        max_durability_cap_pct: 100.0,
        carry_bonus_kg: 2.0
      }
    ],
    active_vehicle: null,
    yearly_event_age_tracker: {},
    monthly_event_tracker: {}
  };
}

export function lockChildhoodPersonalityAtAgeSix(
  entity: HumanEntityState,
  votes: Array<'A' | 'B' | 'C' | 'D'>
): PersonalityCode {
  const counts: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const vote of votes) {
    counts[vote] = counts[vote] + 1;
  }

  let locked: PersonalityCode = 'PERS_AMBIVERT';
  if (counts.A >= 3) locked = 'PERS_INTROVERT';
  else if (counts.B >= 3) locked = 'PERS_EXTROVERT';
  else if (counts.C >= 3) locked = 'PERS_DAREDEVIL';
  else if (counts.D >= 3) locked = 'PERS_EMPATHETIC';

  entity.identity_biometrics.exact_age_years = 6;
  entity.identity_biometrics.height_cm = 115;
  entity.identity_biometrics.weight_kg = 20;
  entity.identity_biometrics.locked_personality = locked;
  entity.identity_biometrics.hobby_key = 'Đọc truyện & Khám phá';
  entity.identity_biometrics.education_level_key = 'Học sinh Tiểu học';

  return locked;
}

// ============================================================================
// 4. VÒNG TUẦN HOÀN SINH HỌC CHUẨN ĐƠN VỊ (THAY CHUỖI IF/ELSE BẰNG HÀM LIÊN TỤC)
// ============================================================================

export function tickBiologyAndOrgansByMinutes(
  entity: HumanEntityState,
  minutesElapsed: number,
  daysCrossed: number,
  didCrossNewWeek: boolean,
  yearsAgedUp: number,
  options?: BiologyTickOptions
): BiologyTickOutput {
  if (minutesElapsed <= 0) {
    return {
      extra_collapse_minutes: 0,
      collapse_journal_log_vi: null,
      did_enter_dementia_autopilot: false
    };
  }

  const isSleeping = Boolean(options?.is_sleeping_period);
  const dtHours = minutesToHours(asMinutes(minutesElapsed));
  const dtDays = asDays(daysCrossed);

  const box = entity.hidden_black_box;
  const organs = box.organs;
  const tracker = box.overuse_tracker;
  const rules = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs;

  // [1. Tiêu hao nhu cầu theo bảng tốc độ đơn vị pt/h (tách rõ trạng thái Đang ngủ vs Đang thức)]
  const needRates = isSleeping
    ? { satiety: -2.2, energy: 0.0, bladder: -3.5, hygiene: -0.8, house: -0.2 }
    : { satiety: -5.0, energy: -2.5, bladder: -6.5, hygiene: -1.8, house: -0.45 };

  box.satiety_pct = applyStatDelta(
    asStat100(box.satiety_pct),
    computeLinearHourDelta(asRatePerHour(needRates.satiety), dtHours)
  );
  box.energy_sleep_pct = applyStatDelta(
    asStat100(box.energy_sleep_pct),
    computeLinearHourDelta(asRatePerHour(needRates.energy), dtHours)
  );
  box.bladder_comfort_pct = applyStatDelta(
    asStat100(box.bladder_comfort_pct),
    computeLinearHourDelta(asRatePerHour(needRates.bladder), dtHours)
  );
  box.body_hygiene_pct = applyStatDelta(
    asStat100(box.body_hygiene_pct),
    computeLinearHourDelta(asRatePerHour(needRates.hygiene), dtHours)
  );
  box.house_cleanliness_pct = applyStatDelta(
    asStat100(box.house_cleanliness_pct),
    computeLinearHourDelta(asRatePerHour(needRates.house), dtHours)
  );

  // [1B. Cập nhật Pin giao tiếp xã hội dựa trên tính cách, đặc tính ASD và không gian ở nhà/đông người]
  const currentSocialBattery =
    typeof box.social_battery_pct === 'number' ? box.social_battery_pct : 80.0;
  const socialRate = computeSocialBatteryHourlyRate({
    personality: entity.identity_biometrics.locked_personality,
    has_asd_trait: entity.identity_biometrics.innate_traits.includes('TRAIT_ASD'),
    is_solo_at_home: entity.current_location_id === 'LOC_HOME',
    is_sleeping: isSleeping
  });
  box.social_battery_pct = applyStatDelta(
    asStat100(currentSocialBattery),
    computeLinearHourDelta(socialRate, dtHours)
  );

  // [2. Áp dụng đồng loạt Hàm Áp Lực Thiếu Hụt Liên Tục Φ(x; θ, p) cho cả 8 kênh cơ quan khi đang thức]
  let extraCollapseMinutes = 0;
  let collapseLogVi: string | null = null;

  if (!isSleeping) {
    const sourceStatMap: Record<OrganStressChannel['source'], number> = {
      satiety: box.satiety_pct,
      bladder: box.bladder_comfort_pct,
      hygiene: box.body_hygiene_pct,
      energy: box.energy_sleep_pct,
      happiness: entity.happiness_score
    };

    for (const ch of AWAKE_ORGAN_STRESS_CHANNELS) {
      const deltaPt = computeDeficitStressDelta({
        current_stat: asStat100(sourceStatMap[ch.source]),
        onset_threshold: asStat100(ch.onset_threshold),
        exponent: ch.exponent,
        max_rate_per_hour: asRatePerHour(ch.max_rate_per_hour),
        dt_hours: dtHours
      });
      if (deltaPt < 0) {
        organs[ch.organ] = applyStatDelta(asStat100(organs[ch.organ]), deltaPt);
      }
    }

    // Chiều ngược Tâm–Thể: Khi cơ quan yếu nhất xuống dưới 45pt, tâm trạng giảm mượt tương ứng
    const { lowestScore } = findWeakestOrgan(organs);
    const moodDropFromPain = computeDeficitStressDelta({
      current_stat: asStat100(lowestScore),
      onset_threshold: asStat100(45),
      exponent: 1.5,
      max_rate_per_hour: asRatePerHour(0.35),
      dt_hours: dtHours
    });
    // Cạn Pin xã hội (< 25pt): Hướng nội bị quá tải đám đông hoặc Hướng ngoại bị cô lập quá lâu -> giảm tâm trạng
    const moodDropFromSocial = computeDeficitStressDelta({
      current_stat: asStat100(box.social_battery_pct),
      onset_threshold: asStat100(25),
      exponent: 1.5,
      max_rate_per_hour: asRatePerHour(0.4),
      dt_hours: dtHours
    });
    // Thích nghi cảm xúc tự nhiên (Hedonic Adaptation): Khi hưng phấn > 72pt, cảm xúc dịu dần về vùng cân bằng đời thường
    let hedonicDecay = 0;
    if (entity.happiness_score > 72.0) {
      hedonicDecay = -0.65 * ((entity.happiness_score - 72.0) / 28.0) * dtHours;
    }
    entity.happiness_score = applyStatDelta(
      asStat100(entity.happiness_score),
      (moodDropFromPain + moodDropFromSocial + hedonicDecay) as typeof moodDropFromPain
    );

    // Chốt biên sinh học bắt buộc: Năng lượng chạm đáy 0pt -> Sập nguồn ngất lịm 6 tiếng
    if (box.energy_sleep_pct <= STAT_MIN_VALUE) {
      box.energy_sleep_pct = 45.0;
      box.naps_taken_since_full_sleep = 0;
      applyOrganDeltas(entity, { brain: -4.0, musculoskeletal: -2.0 });
      entity.happiness_score = asStat100(entity.happiness_score - 12.0);
      extraCollapseMinutes = 360;

      if (entity.current_location_id === 'LOC_TRANSIT_ROAD') {
        const stolenCash = Math.round(entity.cash_vnd * 0.8);
        entity.cash_vnd = Math.max(0, entity.cash_vnd - stolenCash);
        collapseLogVi =
          'Kiệt sức trắng đêm sập nguồn ngất xỉu ngay ngoài đường, tỉnh dậy thì ví tiền đã bị kẻ gian móc mất!';
      } else {
        collapseLogVi =
          'Cơ thể cạn sạch năng lượng vì thức trắng quá giới hạn, sập nguồn ngất lịm 6 tiếng tại chỗ.';
      }
    }
  }

  // [3. Giảm thời gian hiệu lực của thuốc giảm đau, say rượu, sốc đảo ca & vã cơn nghiện]
  if (box.painkiller_masked_hours_left > 0) {
    box.painkiller_masked_hours_left = Math.max(0, box.painkiller_masked_hours_left - dtHours);
  }
  if (tracker.alcohol_intoxication_hours_left > 0) {
    tracker.alcohol_intoxication_hours_left = Math.max(
      0,
      tracker.alcohol_intoxication_hours_left - dtHours
    );
  }
  if (tracker.circadian_shock_hours_left > 0) {
    tracker.circadian_shock_hours_left = Math.max(0, tracker.circadian_shock_hours_left - dtHours);
    applyOrganDeltas(entity, {
      heart: computeLinearHourDelta(asRatePerHour(rules.DEBUFF_CIRCADIAN_SHOCK.heart_delta_per_hour), dtHours),
      brain: computeLinearHourDelta(asRatePerHour(rules.DEBUFF_CIRCADIAN_SHOCK.brain_delta_per_hour), dtHours)
    });
    if (tracker.circadian_shock_hours_left <= 0) {
      removeActiveDebuff(tracker, 'DEBUFF_CIRCADIAN_SHOCK');
    }
  }

  const nicRule = rules.DEBUFF_NICOTINE_WITHDRAWAL;
  if (tracker.nicotine_tolerance >= nicRule.addiction_threshold_tolerance) {
    tracker.hours_since_last_nicotine = tracker.hours_since_last_nicotine + dtHours;
    if (tracker.hours_since_last_nicotine >= nicRule.withdrawal_trigger_hours_without_use) {
      addActiveDebuff(tracker, 'DEBUFF_NICOTINE_WITHDRAWAL');
      entity.happiness_score = applyStatDelta(
        asStat100(entity.happiness_score),
        computeLinearHourDelta(asRatePerHour(nicRule.withdrawal_happiness_per_hour), dtHours)
      );
      organs.brain = applyStatDelta(
        asStat100(organs.brain),
        computeLinearHourDelta(asRatePerHour(nicRule.withdrawal_brain_per_hour), dtHours)
      );
    }
  }

  const alcRule = rules.DEBUFF_ALCOHOL_OVERUSE_AND_WITHDRAWAL;
  if (tracker.alcohol_tolerance >= alcRule.addiction_threshold_tolerance) {
    tracker.hours_since_last_alcohol = tracker.hours_since_last_alcohol + dtHours;
    if (tracker.hours_since_last_alcohol >= alcRule.withdrawal_trigger_hours_without_use) {
      addActiveDebuff(tracker, 'DEBUFF_ALCOHOL_WITHDRAWAL');
      entity.happiness_score = applyStatDelta(
        asStat100(entity.happiness_score),
        computeLinearHourDelta(asRatePerHour(alcRule.withdrawal_happiness_per_hour), dtHours)
      );
      organs.brain = applyStatDelta(
        asStat100(organs.brain),
        computeLinearHourDelta(asRatePerHour(alcRule.withdrawal_brain_per_hour), dtHours)
      );
    }
  }

  // [4. Cập nhật chu kỳ theo ngày (đơn vị Days -> pt/d * d = pt)]
  if (dtDays > 0) {
    const ageCap = getNaturalOrganRecoveryCap(entity.identity_biometrics.exact_age_years);
    const airRatePerDay = entity.current_region === 'URBAN' ? -0.015 : 0.02;
    const lungDelta = computeLinearDayDelta(asRatePerDay(airRatePerDay), dtDays);
    if (lungDelta < 0) {
      organs.lungs = applyStatDelta(asStat100(organs.lungs), lungDelta);
    } else if (organs.lungs < ageCap) {
      organs.lungs = clampNumber(organs.lungs + lungDelta, 0, ageCap);
    }

    if (
      entity.capability_flags.is_clock_visible &&
      !entity.capability_flags.is_time_management_unlocked
    ) {
      box.time_management_pct = applyStatDelta(
        asStat100(box.time_management_pct),
        computeLinearDayDelta(asRatePerDay(5.0), dtDays)
      );
      if (box.time_management_pct >= STAT_MAX_VALUE) {
        entity.capability_flags.is_time_management_unlocked = true;
      }
    }

    tracker.painkiller_doses_last_24h = 0;
    tracker.stimulant_doses_last_24h = 0;
    tracker.alcohol_sessions_last_24h = 0;
    removeActiveDebuff(tracker, 'DEBUFF_PAINKILLER_OVERUSE');
    removeActiveDebuff(tracker, 'DEBUFF_STIMULANT_HEART_OVERLOAD');
    removeActiveDebuff(tracker, 'DEBUFF_ALCOHOL_OVERUSE');

    if (tracker.hours_since_last_nicotine >= 24.0) {
      tracker.nicotine_tolerance = applyStatDelta(
        asStat100(tracker.nicotine_tolerance),
        computeLinearDayDelta(asRatePerDay(-nicRule.tolerance_decay_per_day_clean), dtDays)
      );
      if (tracker.nicotine_tolerance < nicRule.addiction_threshold_tolerance) {
        removeActiveDebuff(tracker, 'DEBUFF_NICOTINE_WITHDRAWAL');
      }
    }
    if (tracker.hours_since_last_alcohol >= 24.0) {
      tracker.alcohol_tolerance = applyStatDelta(
        asStat100(tracker.alcohol_tolerance),
        computeLinearDayDelta(asRatePerDay(-alcRule.tolerance_decay_per_day_clean), dtDays)
      );
      if (tracker.alcohol_tolerance < alcRule.addiction_threshold_tolerance) {
        removeActiveDebuff(tracker, 'DEBUFF_ALCOHOL_WITHDRAWAL');
      }
    }
  }

  // [5. Cập nhật chu kỳ theo tuần (giải tỏa Burnout nếu làm <= 44h)]
  if (didCrossNewWeek) {
    if (tracker.weekly_work_hours <= rules.DEBUFF_CLINICAL_BURNOUT.recovery_weekly_work_hours_below) {
      removeActiveDebuff(tracker, 'DEBUFF_CLINICAL_BURNOUT');
    }
    tracker.weekly_work_hours = 0;
  }

  // [6. Lão hóa tự nhiên theo năm (đơn vị Years -> pt/yr * yr = pt)]
  if (yearsAgedUp > 0 && entity.identity_biometrics.exact_age_years >= 60) {
    const annualDecay =
      EcoLifeJsonDb.agingEndgame.aging_progression.annual_organ_decay_pct * yearsAgedUp;
    applyOrganDeltas(entity, {
      brain: -annualDecay,
      heart: -annualDecay,
      lungs: -annualDecay,
      liver: -annualDecay,
      digestive: -annualDecay,
      musculoskeletal: -annualDecay,
      kidneys: -annualDecay,
      integumentary_skin: -annualDecay
    });
  }

  // [7. Chuyển quyền điều khiển sang Lú lẫn tự hành khi >= 65t & Não < 25pt]
  let didEnterDementia = false;
  if (
    !entity.capability_flags.is_dementia_autopilot &&
    entity.identity_biometrics.exact_age_years >=
      EcoLifeJsonDb.agingEndgame.dementia_autopilot_rules.trigger_min_age &&
    organs.brain < EcoLifeJsonDb.agingEndgame.dementia_autopilot_rules.trigger_brain_health_below
  ) {
    entity.capability_flags.is_dementia_autopilot = true;
    entity.controller_mode = 'AI_AUTONOMOUS';
    didEnterDementia = true;
  }

  return {
    extra_collapse_minutes: extraCollapseMinutes,
    collapse_journal_log_vi: collapseLogVi,
    did_enter_dementia_autopilot: didEnterDementia
  };
}

// ============================================================================
// 5. KIỂM TRA 4 ĐIỀU KIỆN TỬ VONG TRÊN THANG 0 - 100
// ============================================================================

export function evaluateDeathCondition(
  entity: HumanEntityState,
  instantDeathCauseFromEventVi: string | null = null
): DeathCheckResult {
  const organs = entity.hidden_black_box.organs;
  const age = Math.floor(entity.identity_biometrics.exact_age_years);
  const rules = EcoLifeJsonDb.agingEndgame.death_conditions;

  if (instantDeathCauseFromEventVi) {
    const accRule = rules.find((d) => d.cause_id === 'DEATH_TRAFFIC_ACCIDENT');
    return {
      is_dead: true,
      cause_label_vi: instantDeathCauseFromEventVi,
      epitaph_vi:
        accRule?.epitaph_template_vi ||
        'Một chuyến đi dang dở giữa dòng đời tấp nập, để lại bao tiếc thương.'
    };
  }

  if (entity.hidden_black_box.energy_sleep_pct <= 5.0 && organs.heart <= 10.0) {
    // Chỉ tính là Đột quỵ lao động (Karoshi) khi nhân vật còn trong độ tuổi lao động (< 60 tuổi)
    if (age < 60) {
      const karoshi = rules.find((d) => d.cause_id === 'DEATH_KAROSHI_STROKE');
      return {
        is_dead: true,
        cause_label_vi: karoshi?.cause_label_vi || 'Đột quỵ do kiệt sức lao động (Karoshi)',
        epitaph_vi:
          karoshi?.epitaph_template_vi ||
          'Cả đời miệt mài bươn chải không ngơi nghỉ, nay đã được yên giấc ngàn thu.'
      };
    }

    // Từ 60 tuổi trở lên suy kiệt tim mạch là biến chứng suy tim / đột quỵ tuổi già
    return {
      is_dead: true,
      cause_label_vi: 'Suy tim & đột quỵ tuổi già',
      epitaph_vi: 'Trái tim đã mỏi mệt sau chặng đường dài, nay lặng lẽ yên nghỉ.'
    };
  }

  const { lowestScore } = findWeakestOrgan(organs);
  if (lowestScore <= STAT_MIN_VALUE) {
    const fail = rules.find((d) => d.cause_id === 'DEATH_ORGAN_FAILURE');
    return {
      is_dead: true,
      cause_label_vi: fail?.cause_label_vi || 'Suy đa tạng nặng',
      epitaph_vi:
        fail?.epitaph_template_vi ||
        'Thân xác hao mòn sau bao năm tháng gió sương, nay trở về với cát bụi.'
    };
  }

  if (age >= 85 && lowestScore <= 15.0) {
    const oldAge = rules.find((d) => d.cause_id === 'DEATH_OLD_AGE');
    return {
      is_dead: true,
      cause_label_vi: oldAge?.cause_label_vi || 'Tuổi cao sức yếu, an nghỉ tự nhiên',
      epitaph_vi:
        oldAge?.epitaph_template_vi ||
        'Sống trọn một kiếp người bình dị, thanh thản nhắm mắt xuôi tay.'
    };
  }

  return { is_dead: false, cause_label_vi: null, epitaph_vi: '' };
}