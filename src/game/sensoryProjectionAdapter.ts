// Bộ chuyển đổi dữ liệu thực thể HumanEntity (Player/NPC) sang dữ liệu hiển thị cho Frontend
// Tuân thủ nghiêm ngặt:
// 1. Không bao giờ gửi số % nội tạng, % độ bền hoặc điểm lờn đô ra giao diện.
// 2. Chỉ xuất mức đèn 1-5 (BLUE -> RED) và câu độc thoại tiếng Việt theo tính cách / debuff đang dính.
// 3. Chỉ trả về những món nội thất người chơi ĐÃ MUA để vẽ xếp lớp (visual_slot) lên cảnh phòng.

import {
  type ColorCode,
  type DurabilityGrade,
  EcoLifeJsonDb,
  type PersonalityCode,
  type VisualSlotConfig,
  getFurnitureDefById,
  translateVi
} from './jsonDatabaseLoader';

// ============================================================================
// 1. INTERFACE DỮ LIỆU ĐẦU VÀO (TRẠNG THÁI THẬT TRONG BACKEND)
// ============================================================================

export type ActiveOveruseDebuffId =
  | 'DEBUFF_PAINKILLER_OVERUSE'
  | 'DEBUFF_NICOTINE_WITHDRAWAL'
  | 'DEBUFF_ALCOHOL_OVERUSE'
  | 'DEBUFF_ALCOHOL_WITHDRAWAL'
  | 'DEBUFF_STIMULANT_HEART_OVERLOAD'
  | 'DEBUFF_CLINICAL_BURNOUT'
  | 'DEBUFF_CIRCADIAN_SHOCK'
  | 'DEBUFF_STRATIFIED_FOOD_FATIGUE'
  | 'DEBUFF_FRAGMENTED_NAP_FATIGUE';

export interface OveruseTrackerState {
  painkiller_doses_last_24h: number;
  stimulant_doses_last_24h: number;
  alcohol_sessions_last_24h: number;
  alcohol_intoxication_hours_left: number;
  nicotine_tolerance: number; // 0 - 100 (Ẩn hoàn toàn)
  hours_since_last_nicotine: number;
  alcohol_tolerance: number; // 0 - 100 (Ẩn hoàn toàn)
  hours_since_last_alcohol: number;
  weekly_work_hours: number;
  consecutive_night_shifts: number;
  circadian_shock_hours_left: number;
  last_meal_def_id: string | null;
  consecutive_same_meal_count: number;
  active_debuff_ids: ActiveOveruseDebuffId[];
}

export interface OrganStateMap {
  brain: number;
  heart: number;
  lungs: number;
  liver: number;
  digestive: number;
  musculoskeletal: number;
  kidneys: number;
  integumentary_skin: number;
}

export interface OwnedFurnitureInstance {
  instance_id: string;
  furniture_id: string;
  current_durability_pct: number;
}

export interface OwnedInventoryItemInstance {
  instance_id: string;
  item_def_id: string;
  display_name_key: string;
  category: 'FOOD' | 'VEHICLE' | 'PHONE' | 'OTHER';
  usage_type: 'CONSUMABLE' | 'DURABLE_REUSABLE';
  weight_kg: number;
  current_durability_pct: number;
  remaining_servings?: number;
}

export interface HumanEntityState {
  entity_id: string;
  controller_mode: 'PLAYER_CONTROLLED' | 'AI_AUTONOMOUS';
  current_region: 'RURAL' | 'URBAN';
  current_location_id: string;
  current_sub_node_id: string;
  cash_vnd: number;
  happiness_score: number; // 0 - 100 (Ẩn dưới dạng đèn màu)
  identity_biometrics: {
    full_name: string;
    gender: 'MALE' | 'FEMALE';
    birth_day?: number;
    birth_month?: number;
    birth_year?: number;
    family_tier?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5';
    exact_age_years: number;
    height_cm: number;
    weight_kg: number;
    education_level_key: string;
    hobby_key: string | null;
    locked_personality: PersonalityCode | null;
    innate_traits: string[];
  };
  hidden_black_box: {
    organs: OrganStateMap;
    sleep_debt_hours: number;
    hours_awake_continuous: number;
    hours_since_last_meal: number;
    bladder_urgency_pct: number;
    body_hygiene_pct: number;
    naps_taken_since_full_sleep: number;
    ptsd_trauma_score: number;
    painkiller_masked_hours_left: number;
    overuse_tracker?: OveruseTrackerState;
  };
  capability_flags: {
    is_clock_visible: boolean;
    is_weather_app_visible: boolean;
    is_time_management_unlocked: boolean;
    is_biometrics_decoded: boolean;
    is_personality_decoded: boolean;
    is_dementia_autopilot: boolean;
  };
  owned_furniture: OwnedFurnitureInstance[];
  inventory_items: OwnedInventoryItemInstance[];
}

// ============================================================================
// 2. INTERFACE ĐẦU RA CHO FRONTEND (KHÔNG SỐ, ĐÚNG HỢP ĐỒNG GIAO DIỆN GIẤY DÓ)
// ============================================================================

export interface PlacedFurnitureRenderDto {
  instance_id: string;
  furniture_id: string;
  display_name: string;
  status_grade: DurabilityGrade;
  is_broken_locked: boolean;
  sensory_monologue: string;
  visual_slot: VisualSlotConfig;
  available_actions: Array<{
    action_id: string;
    button_label: string;
  }>;
}

export interface FrontendHudProjection {
  health_light_level: 1 | 2 | 3 | 4 | 5;
  health_color: ColorCode;
  health_label_vi: string;

  happiness_light_level: 1 | 2 | 3 | 4 | 5;
  happiness_color: ColorCode;
  happiness_label_vi: string;

  body_monologue_vi: string;

  time_display_vi: string;
  is_exact_clock_shown: boolean;

  blind_profile_view: {
    full_name: string;
    age_years: number;
    hobby_display_vi: string;
    personality_display_vi: string;
    biometrics_display_vi: string;
    is_autopilot_locked: boolean;
  };

  placed_furniture_in_current_room: PlacedFurnitureRenderDto[];
}

// ============================================================================
// 3. CÁC HÀM CHUYỂN ĐỔI CẢM QUAN (IF / ELSE TUẦN TỰ, DỄ ĐỌC DỄ SỬA)
// ============================================================================

export function mapScoreToColorAndLevel(scorePct: number): {
  color: ColorCode;
  level: 1 | 2 | 3 | 4 | 5;
} {
  if (scorePct >= 85.0) {
    return { color: 'BLUE', level: 1 };
  } else if (scorePct >= 65.0) {
    return { color: 'GREEN', level: 2 };
  } else if (scorePct >= 45.0) {
    return { color: 'YELLOW', level: 3 };
  } else if (scorePct >= 25.0) {
    return { color: 'ORANGE', level: 4 };
  } else {
    return { color: 'RED', level: 5 };
  }
}

export function mapDurabilityToGrade(durabilityPct: number): DurabilityGrade {
  if (durabilityPct >= 80.0) {
    return 'PRISTINE';
  } else if (durabilityPct >= 50.0) {
    return 'GOOD';
  } else if (durabilityPct >= 25.0) {
    return 'WORN';
  } else if (durabilityPct >= 5.0) {
    return 'DECAYED';
  } else {
    return 'BROKEN';
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

/**
 * Tìm lời độc thoại cảm quan cho Debuff lạm dụng ưu tiên nhất đang bật (không lộ số).
 */
function resolveActiveOveruseDebuffMonologueVi(
  tracker: OveruseTrackerState | undefined
): string | null {
  if (!tracker || tracker.active_debuff_ids.length === 0) {
    return null;
  }

  const active = tracker.active_debuff_ids;

  // Ưu tiên cảnh báo các trạng thái hành xác cấp tính trước (sốc nhịp tim, vã cơn nghiện, sốc đảo ca)
  if (active.includes('DEBUFF_STIMULANT_HEART_OVERLOAD')) {
    return translateVi('debuff_stimulant_overload_mono');
  } else if (active.includes('DEBUFF_ALCOHOL_WITHDRAWAL')) {
    return translateVi('debuff_alcohol_withdrawal_mono');
  } else if (active.includes('DEBUFF_NICOTINE_WITHDRAWAL')) {
    return translateVi('debuff_nicotine_withdrawal_mono');
  } else if (active.includes('DEBUFF_CIRCADIAN_SHOCK')) {
    return translateVi('debuff_circadian_shock_mono');
  } else if (active.includes('DEBUFF_CLINICAL_BURNOUT')) {
    return translateVi('debuff_clinical_burnout_mono');
  } else if (active.includes('DEBUFF_PAINKILLER_OVERUSE')) {
    return translateVi('debuff_painkiller_overuse_mono');
  } else if (active.includes('DEBUFF_ALCOHOL_OVERUSE')) {
    return translateVi('debuff_alcohol_overuse_mono');
  } else if (active.includes('DEBUFF_FRAGMENTED_NAP_FATIGUE')) {
    return translateVi('debuff_fragmented_nap_mono');
  } else if (active.includes('DEBUFF_STRATIFIED_FOOD_FATIGUE')) {
    return translateVi('debuff_food_fatigue_mono');
  }

  return null;
}

export function resolveBodyMonologueVi(entity: HumanEntityState): string {
  const personality: PersonalityCode =
    entity.identity_biometrics.locked_personality || 'PERS_AMBIVERT';

  // Nếu nhân vật đang uống thuốc giảm đau che triệu chứng nhưng chưa lạm dụng quá liều
  if (entity.hidden_black_box.painkiller_masked_hours_left > 0) {
    const isOverused =
      entity.hidden_black_box.overuse_tracker?.active_debuff_ids.includes(
        'DEBUFF_PAINKILLER_OVERUSE'
      ) || false;
    if (isOverused) {
      return translateVi('debuff_painkiller_overuse_mono');
    }
    return translateVi('mono_symptom_masked_by_painkiller');
  }

  const { organKey, lowestScore } = findWeakestOrgan(entity.hidden_black_box.organs);
  const { color } = mapScoreToColorAndLevel(lowestScore);

  if (color === 'BLUE' || color === 'GREEN') {
    const box = entity.hidden_black_box;

    // Nếu nội tạng chưa xuống màu Vàng/Cam/Đỏ nhưng đang dính debuff lạm dụng -> phát cảm quan cảnh báo sớm
    const debuffMono = resolveActiveOveruseDebuffMonologueVi(box.overuse_tracker);
    if (debuffMono) {
      return debuffMono;
    }

    if (box.bladder_urgency_pct >= 85.0) {
      return translateVi('need_bladder_critical_hold_warning');
    }
    if (box.hours_since_last_meal >= 6.0) {
      return 'Bụng đói cồn cào, tay chân hơi bủn rủn vì đã quá bữa ăn.';
    }
    if (box.naps_taken_since_full_sleep >= 2) {
      return translateVi('debuff_fragmented_nap_mono');
    }
    if (box.body_hygiene_pct <= 35.0) {
      return translateVi('need_hygiene_dirty_odor');
    }

    const healthyMap = EcoLifeJsonDb.sensory.organ_symptom_monologues.NORMAL_HEALTHY as Record<
      string,
      string
    >;
    const monoKey = healthyMap[personality] || 'mono_health_normal_ambivert';
    return translateVi(monoKey);
  }

  if (organKey === 'liver' || organKey === 'digestive') {
    const symGroup = EcoLifeJsonDb.sensory.organ_symptom_monologues.SYM_UPPER_ABDOMINAL_ACHE;
    if (color === 'YELLOW') {
      return translateVi(symGroup.YELLOW.default);
    } else if (color === 'ORANGE') {
      const orangeMap = symGroup.ORANGE as Record<string, string>;
      return translateVi(orangeMap[personality] || orangeMap.PERS_AMBIVERT);
    } else {
      const redMap = symGroup.RED as Record<string, string>;
      return translateVi(redMap[personality] || redMap.PERS_AMBIVERT);
    }
  }

  if (organKey === 'heart') {
    const symGroup = EcoLifeJsonDb.sensory.organ_symptom_monologues.SYM_CHEST_TIGHTNESS_BURNING;
    if (color === 'YELLOW') return translateVi(symGroup.YELLOW.default);
    if (color === 'RED') return translateVi(symGroup.RED.default);
    const orangeMap = symGroup.ORANGE as Record<string, string>;
    return translateVi(orangeMap[personality] || orangeMap.PERS_AMBIVERT);
  }

  if (organKey === 'lungs') {
    const symGroup = EcoLifeJsonDb.sensory.organ_symptom_monologues.SYM_RESPIRATORY_COUGH;
    if (color === 'YELLOW') return translateVi(symGroup.YELLOW.default);
    if (color === 'RED') return translateVi(symGroup.RED.default);
    const orangeMap = symGroup.ORANGE as Record<string, string>;
    return translateVi(orangeMap[personality] || orangeMap.PERS_AMBIVERT);
  }

  if (organKey === 'brain') {
    const symGroup = EcoLifeJsonDb.sensory.organ_symptom_monologues.SYM_DIZZINESS_HEADACHE_FATIGUE;
    if (color === 'YELLOW') return translateVi(symGroup.YELLOW.default);
    if (color === 'RED') return translateVi(symGroup.RED.default);
    const orangeMap = symGroup.ORANGE as Record<string, string>;
    return translateVi(orangeMap[personality] || orangeMap.PERS_AMBIVERT);
  }

  if (organKey === 'musculoskeletal') {
    const symGroup = EcoLifeJsonDb.sensory.organ_symptom_monologues.SYM_LOWER_BACK_AND_FATIGUE;
    if (color === 'YELLOW') return translateVi(symGroup.YELLOW.default);
    if (color === 'RED') return translateVi(symGroup.RED.default);
    const orangeMap = symGroup.ORANGE as Record<string, string>;
    return translateVi(orangeMap[personality] || orangeMap.PERS_AMBIVERT);
  }

  if (organKey === 'kidneys') {
    const symGroup = EcoLifeJsonDb.sensory.organ_symptom_monologues.SYM_KIDNEY_URINARY_STRESS;
    if (color === 'YELLOW') return translateVi(symGroup.YELLOW.default);
    if (color === 'ORANGE') return translateVi(symGroup.ORANGE.default);
    return translateVi(symGroup.RED.default);
  }

  const skinGroup = EcoLifeJsonDb.sensory.organ_symptom_monologues.SYM_SKIN_IRRITATION;
  if (color === 'YELLOW') return translateVi(skinGroup.YELLOW.default);
  if (color === 'ORANGE') return translateVi(skinGroup.ORANGE.default);
  return translateVi(skinGroup.RED.default);
}

export function resolveBlindSkyTimeText(currentHour: number): string {
  if (currentHour >= 5 && currentHour <= 7) {
    return translateVi('sky_dawn');
  } else if (currentHour >= 8 && currentHour <= 10) {
    return translateVi('sky_morning');
  } else if (currentHour >= 11 && currentHour <= 13) {
    return translateVi('sky_noon');
  } else if (currentHour >= 14 && currentHour <= 16) {
    return translateVi('sky_afternoon');
  } else if (currentHour >= 17 && currentHour <= 18) {
    return translateVi('sky_dusk');
  } else {
    return translateVi('sky_night');
  }
}

export function projectRoomFurnitureForScene(
  entity: HumanEntityState
): PlacedFurnitureRenderDto[] {
  const result: PlacedFurnitureRenderDto[] = [];

  if (entity.current_location_id !== 'LOC_HOME') {
    return result;
  }

  const personality: PersonalityCode =
    entity.identity_biometrics.locked_personality || 'PERS_AMBIVERT';

  for (const owned of entity.owned_furniture) {
    const def = getFurnitureDefById(owned.furniture_id);
    if (!def) {
      continue;
    }

    const isSameRoom =
      def.placed_in_sub_node_id === entity.current_sub_node_id ||
      (def.placed_in_sub_node_id === 'HOME_KITCHEN_DINING' &&
        entity.current_sub_node_id === 'HOME_KITCHEN');

    if (!isSameRoom) {
      continue;
    }

    const grade = mapDurabilityToGrade(owned.current_durability_pct);
    const isBroken = owned.current_durability_pct < def.durability_rules.broken_threshold_pct;

    const durMonoGroup = EcoLifeJsonDb.sensory.durability_sensation_monologues[grade] as Record<
      string,
      string
    >;
    const monoKey = durMonoGroup[personality] || durMonoGroup.default || 'item_good_standard';

    const availableActions: Array<{ action_id: string; button_label: string }> = [];
    if (!isBroken && !entity.capability_flags.is_dementia_autopilot) {
      for (const act of def.interactable_actions) {
        let labelText = translateVi(act.label_key);
        if (!entity.capability_flags.is_time_management_unlocked) {
          labelText = labelText.replace(/\s*\(\+\d+\s*phút\)/g, '');
        }
        availableActions.push({
          action_id: act.action_id,
          button_label: labelText
        });
      }
    }

    result.push({
      instance_id: owned.instance_id,
      furniture_id: def.furniture_id,
      display_name: translateVi(def.name_key),
      status_grade: grade,
      is_broken_locked: isBroken,
      sensory_monologue: translateVi(monoKey),
      visual_slot: def.visual_slot,
      available_actions: availableActions
    });
  }

  return result;
}

export function projectHumanEntityToFrontendHud(
  entity: HumanEntityState,
  currentHour: number,
  currentMinute: number
): FrontendHudProjection {
  const { lowestScore } = findWeakestOrgan(entity.hidden_black_box.organs);
  const healthMapped = mapScoreToColorAndLevel(lowestScore);
  const healthLabelVi =
    EcoLifeJsonDb.viVn.sensory_colors.health[healthMapped.color] || 'Tạm Được';

  const happinessMapped = mapScoreToColorAndLevel(entity.happiness_score);
  const happinessLabelVi =
    EcoLifeJsonDb.viVn.sensory_colors.happiness[happinessMapped.color] || 'Bình Lặng';

  let timeDisplayVi = resolveBlindSkyTimeText(currentHour);
  if (entity.capability_flags.is_clock_visible) {
    const hh = String(currentHour).padStart(2, '0');
    const mm = String(currentMinute).padStart(2, '0');
    timeDisplayVi = `${hh}:${mm}`;
  }

  const bio = entity.identity_biometrics;
  const flags = entity.capability_flags;

  let hobbyDisplay = translateVi('not_formed_yet');
  if (bio.exact_age_years >= 6 && bio.hobby_key) {
    hobbyDisplay = translateVi(bio.hobby_key);
  }

  let personalityDisplay = translateVi('unknown_mark');
  if (flags.is_personality_decoded && bio.locked_personality) {
    personalityDisplay = translateVi(bio.locked_personality);
  }

  let biometricsDisplay = translateVi('biometrics_unknown');
  if (flags.is_biometrics_decoded) {
    const heightM = bio.height_cm / 100.0;
    const bmi = bio.weight_kg / (heightM * heightM);
    let bmiLabelKey = 'bmi_normal';
    if (bmi < 18.5) {
      bmiLabelKey = 'bmi_underweight';
    } else if (bmi >= 23.0 && bmi < 25.0) {
      bmiLabelKey = 'bmi_overweight';
    } else if (bmi >= 25.0 && bmi < 30.0) {
      bmiLabelKey = 'bmi_obese_1';
    } else if (bmi >= 30.0) {
      bmiLabelKey = 'bmi_obese_2';
    }

    biometricsDisplay = translateVi('biometrics_known_format', {
      height_cm: Math.round(bio.height_cm),
      weight_kg: Math.round(bio.weight_kg),
      bmi_label: translateVi(bmiLabelKey)
    });
  }

  return {
    health_light_level: healthMapped.level,
    health_color: healthMapped.color,
    health_label_vi: healthLabelVi,

    happiness_light_level: happinessMapped.level,
    happiness_color: happinessMapped.color,
    happiness_label_vi: happinessLabelVi,

    body_monologue_vi: resolveBodyMonologueVi(entity),

    time_display_vi: timeDisplayVi,
    is_exact_clock_shown: flags.is_clock_visible,

    blind_profile_view: {
      full_name: bio.full_name,
      age_years: Math.floor(bio.exact_age_years),
      hobby_display_vi: hobbyDisplay,
      personality_display_vi: personalityDisplay,
      biometrics_display_vi: biometricsDisplay,
      is_autopilot_locked: flags.is_dementia_autopilot
    },

    placed_furniture_in_current_room: projectRoomFurnitureForScene(entity)
  };
}