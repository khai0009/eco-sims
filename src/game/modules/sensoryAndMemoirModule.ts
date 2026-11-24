// [MODULE 8: CẢM QUAN KHÔNG SỐ, ICON MŨI TÊN CHỈ BÁO & CUỐN NHẬT KÝ — CHUẨN ĐƠN VỊ V3.4]
// Tuyệt đối không xuất số % nội tạng, % độ bền hay % pin xã hội ra giao diện.
// Áp dụng bảng tra phẳng ORGAN_SYMPTOM_GROUP_MAP, hàm lượng tử hóa 5 màu và tính BMI chuẩn đơn vị.

import {
  type ColorCode,
  type DurabilityGrade,
  EcoLifeJsonDb,
  type PersonalityCode,
  getFurnitureDefById,
  translateVi
} from '../jsonDatabaseLoader';
import type {
  ActionStatIndicatorDto,
  EcoLifeSavedSessionState,
  FrontendDeathAndMemoirDto,
  FrontendHudProjection,
  HumanEntityState,
  OrganStateMap,
  OveruseTrackerState,
  PlacedFurnitureRenderDto,
  StatIndicatorId
} from '../engineTypes';
import { findWeakestOrgan } from './organAndBiologyModule';
import {
  asCentimeters,
  asKilograms,
  asStat100,
  computeBmiKgPerM2,
  quantizeStatToSensoryLevel
} from '../math/ecoLifeUnifiedFormulas';

// ============================================================================
// 1. BẢNG ÁNH XẠ PHẲNG: 5 MỨC ĐÈN MÀU, 5 BẬC ĐỘ BỀN & 8 CƠ QUAN -> TRIỆU CHỨNG
// ============================================================================

const LEVEL_TO_COLOR: Record<1 | 2 | 3 | 4 | 5, ColorCode> = {
  1: 'BLUE',
  2: 'GREEN',
  3: 'YELLOW',
  4: 'ORANGE',
  5: 'RED'
};

const DURABILITY_THRESHOLDS: ReadonlyArray<{ min: number; grade: DurabilityGrade }> = [
  { min: 80.0, grade: 'PRISTINE' },
  { min: 50.0, grade: 'GOOD' },
  { min: 25.0, grade: 'WORN' },
  { min: 5.0, grade: 'DECAYED' },
  { min: 0.0, grade: 'BROKEN' }
];

type OrganSymptomGroupKey =
  | 'SYM_DIZZINESS_HEADACHE_FATIGUE'
  | 'SYM_CHEST_TIGHTNESS_BURNING'
  | 'SYM_RESPIRATORY_COUGH'
  | 'SYM_UPPER_ABDOMINAL_ACHE'
  | 'SYM_LOWER_BACK_AND_FATIGUE'
  | 'SYM_KIDNEY_URINARY_STRESS'
  | 'SYM_SKIN_IRRITATION';

// Bảng tra phẳng ánh xạ 8 cơ quan nội tạng sang đúng cụm triệu chứng mơ hồ trong sensory.json
const ORGAN_SYMPTOM_GROUP_MAP: Record<keyof OrganStateMap, OrganSymptomGroupKey> = {
  brain: 'SYM_DIZZINESS_HEADACHE_FATIGUE',
  heart: 'SYM_CHEST_TIGHTNESS_BURNING',
  lungs: 'SYM_RESPIRATORY_COUGH',
  liver: 'SYM_UPPER_ABDOMINAL_ACHE',
  digestive: 'SYM_UPPER_ABDOMINAL_ACHE',
  musculoskeletal: 'SYM_LOWER_BACK_AND_FATIGUE',
  kidneys: 'SYM_KIDNEY_URINARY_STRESS',
  integumentary_skin: 'SYM_SKIN_IRRITATION'
};

// ============================================================================
// 2. HÀM TRA CỨU ICON CHỈ BÁO CHIỀU TÁC ĐỘNG (HƯỚNG LÊN / HƯỚNG XUỐNG)
// ============================================================================

/**
 * Đọc danh mục icon chỉ báo từ action_indicator_icons.json theo mã thao tác.
 * Giúp người chơi nhìn thấy ngay tác dụng (tăng/giảm) của hành động mà không lộ số %.
 */
export function resolveActionStatIndicators(actionKey: string): ActionStatIndicatorDto[] {
  const effectsMap = EcoLifeJsonDb.actionIndicators.action_effects_map as Record<
    string,
    Array<{ stat_id: string; direction: string; intensity: number }>
  >;
  const catalog = EcoLifeJsonDb.actionIndicators.stat_catalog as Record<
    string,
    { icon_name: string; label_vi: string }
  >;

  const rawEffects = effectsMap[actionKey];
  // Hành động chưa khai báo hiệu ứng cảm quan -> trả mảng rỗng an toàn
  if (!Array.isArray(rawEffects) || rawEffects.length === 0) {
    return [];
  }

  const indicators: ActionStatIndicatorDto[] = [];
  for (const eff of rawEffects) {
    const meta = catalog[eff.stat_id];
    // Bỏ qua nếu mã chỉ số chưa tồn tại trong bảng stat_catalog để tránh lỗi UI
    if (!meta) {
      continue;
    }
    const direction: 'UP' | 'DOWN' = eff.direction === 'DOWN' ? 'DOWN' : 'UP';
    const intensity: 1 | 2 = eff.intensity === 2 ? 2 : 1;

    indicators.push({
      stat_id: eff.stat_id as StatIndicatorId,
      icon_name: meta.icon_name,
      label_vi: meta.label_vi,
      direction,
      intensity
    });
  }

  return indicators;
}

// ============================================================================
// 3. LƯỢNG TỬ HÓA 5 MÀU SỨC KHỎE/HẠNH PHÚC, 5 BẬC ĐỘ BỀN & MÙ GIỜ BẦU TRỜI
// ============================================================================

export function mapScoreToColorAndLevel(scorePct: number): {
  color: ColorCode;
  level: 1 | 2 | 3 | 4 | 5;
} {
  const level = quantizeStatToSensoryLevel(asStat100(scorePct));
  return {
    color: LEVEL_TO_COLOR[level],
    level
  };
}

export function mapDurabilityToGrade(durabilityPct: number): DurabilityGrade {
  const safe = asStat100(durabilityPct);
  const found = DURABILITY_THRESHOLDS.find((band) => safe >= band.min);
  return found ? found.grade : 'BROKEN';
}

export function resolveBlindSkyTimeText(currentHour: number): string {
  // Khi nhân vật không có đồng hồ đeo tay hoặc điện thoại còn pin -> cảm nhận giờ qua bầu trời
  if (currentHour >= 5 && currentHour <= 7) return translateVi('sky_dawn');
  if (currentHour >= 8 && currentHour <= 10) return translateVi('sky_morning');
  if (currentHour >= 11 && currentHour <= 13) return translateVi('sky_noon');
  if (currentHour >= 14 && currentHour <= 16) return translateVi('sky_afternoon');
  if (currentHour >= 17 && currentHour <= 18) return translateVi('sky_dusk');
  return translateVi('sky_night');
}

// ============================================================================
// 4. ĐỘC THOẠI CƠ THỂ THEO TÍNH CÁCH, DEBUFF LẠM DỤNG & PIN XÃ HỘI (KHÔNG SỐ)
// ============================================================================

function resolvePriorityDebuffMonologueVi(tracker: OveruseTrackerState): string | null {
  const priorityOrder: ReadonlyArray<{
    id: OveruseTrackerState['active_debuff_ids'][number];
    key: string;
  }> = [
    { id: 'DEBUFF_STIMULANT_HEART_OVERLOAD', key: 'debuff_stimulant_overload_mono' },
    { id: 'DEBUFF_ALCOHOL_WITHDRAWAL', key: 'debuff_alcohol_withdrawal_mono' },
    { id: 'DEBUFF_NICOTINE_WITHDRAWAL', key: 'debuff_nicotine_withdrawal_mono' },
    { id: 'DEBUFF_CIRCADIAN_SHOCK', key: 'debuff_circadian_shock_mono' },
    { id: 'DEBUFF_CLINICAL_BURNOUT', key: 'debuff_clinical_burnout_mono' },
    { id: 'DEBUFF_PAINKILLER_OVERUSE', key: 'debuff_painkiller_overuse_mono' },
    { id: 'DEBUFF_ALCOHOL_OVERUSE', key: 'debuff_alcohol_overuse_mono' },
    { id: 'DEBUFF_FRAGMENTED_NAP_FATIGUE', key: 'debuff_fragmented_nap_mono' },
    { id: 'DEBUFF_STRATIFIED_FOOD_FATIGUE', key: 'debuff_food_fatigue_mono' }
  ];

  for (const item of priorityOrder) {
    if (tracker.active_debuff_ids.includes(item.id)) {
      return translateVi(item.key);
    }
  }
  return null;
}

export function resolveBodyMonologueVi(entity: HumanEntityState): string {
  const personality: PersonalityCode =
    entity.identity_biometrics.locked_personality || 'PERS_AMBIVERT';
  const box = entity.hidden_black_box;

  // [Chốt 1 — Thuốc giảm đau che triệu chứng]: Nhân vật không cảm thấy cơn đau thật bên trong
  if (box.painkiller_masked_hours_left > 0) {
    if (box.overuse_tracker.active_debuff_ids.includes('DEBUFF_PAINKILLER_OVERUSE')) {
      return translateVi('debuff_painkiller_overuse_mono');
    }
    return translateVi('mono_symptom_masked_by_painkiller');
  }

  const { organKey, lowestScore } = findWeakestOrgan(box.organs);
  const { color } = mapScoreToColorAndLevel(lowestScore);

  // [Chốt 2 — Cơ thể còn khỏe (Xanh Biển / Xanh Lá)]: Ưu tiên báo debuff lạm dụng, nhu cầu sinh hoạt, rồi tới Pin xã hội
  if (color === 'BLUE' || color === 'GREEN') {
    const debuffMono = resolvePriorityDebuffMonologueVi(box.overuse_tracker);
    if (debuffMono) return debuffMono;

    // Kiểm tra lần lượt các nhu cầu sinh hoạt cấp bách trên thang 0-100
    if (box.bladder_comfort_pct <= 15.0) return translateVi('need_bladder_critical_hold_warning');
    if (box.energy_sleep_pct <= 25.0) return translateVi('need_sleep_microsleep_danger');
    if (box.satiety_pct <= 40.0) {
      return 'Bụng đói cồn cào, tay chân hơi bủn rủn vì đã quá bữa ăn.';
    }
    if (box.energy_sleep_pct <= 55.0) return translateVi('need_sleep_groggy');
    if (box.body_hygiene_pct <= 35.0) return translateVi('need_hygiene_dirty_odor');
    if (box.house_cleanliness_pct <= 35.0) return translateVi('env_home_dusty_messy');

    // Cảm quan không số khi Pin giao tiếp xã hội xuống thấp (< 30pt), phân hóa theo Tính cách & ASD
    const socialBattery = typeof box.social_battery_pct === 'number' ? box.social_battery_pct : 80.0;
    if (socialBattery < 30.0) {
      const hasAsd = entity.identity_biometrics.innate_traits.includes('TRAIT_ASD');
      if (personality === 'PERS_INTROVERT' || hasAsd) {
        return 'Đông người ồn ào quá, đầu óc căng thẳng chỉ muốn về phòng yên tĩnh một mình...';
      }
      if (personality === 'PERS_EXTROVERT') {
        return 'Ở nhà một mình lâu quá thấy bí bách chân tay, muốn ra ngoài trò chuyện với ai đó...';
      }
      return 'Cảm thấy hơi đuối sức vì nhịp giao tiếp vừa rồi, cần một khoảng lặng để lấy lại cân bằng.';
    }

    const healthyMap = EcoLifeJsonDb.sensory.organ_symptom_monologues.NORMAL_HEALTHY as Record<
      string,
      string
    >;
    return translateVi(healthyMap[personality] || 'mono_health_normal_ambivert');
  }

  // [Chốt 3 — Cơ thể suy giảm (Vàng / Cam / Đỏ)]: Tra bảng phẳng 8 cơ quan -> cụm triệu chứng -> màu -> tính cách
  const symptomGroupKey = ORGAN_SYMPTOM_GROUP_MAP[organKey];
  const monoRoot = EcoLifeJsonDb.sensory.organ_symptom_monologues as unknown as Record<
    string,
    Record<string, Record<string, string>>
  >;
  const colorBand = monoRoot[symptomGroupKey]?.[color];
  const resolvedKey =
    colorBand?.[personality] ||
    colorBand?.PERS_AMBIVERT ||
    colorBand?.default ||
    'mono_health_normal_ambivert';
  return translateVi(resolvedKey);
}

// ============================================================================
// 5. CHIẾU NỘI THẤT TRONG PHÒNG (VISUAL_SLOT), HUD & CUỐN NHẬT KÝ 5 CHƯƠNG
// ============================================================================

export function projectRoomFurnitureForScene(entity: HumanEntityState): PlacedFurnitureRenderDto[] {
  const result: PlacedFurnitureRenderDto[] = [];
  // Chỉ vẽ lớp nội thất sở hữu khi nhân vật đang đứng trong Nhà Riêng (LOC_HOME)
  if (entity.current_location_id !== 'LOC_HOME') return result;

  const personality: PersonalityCode =
    entity.identity_biometrics.locked_personality || 'PERS_AMBIVERT';

  for (const owned of entity.owned_furniture) {
    const def = getFurnitureDefById(owned.furniture_id);
    if (!def) continue;

    const isSameRoom =
      def.placed_in_sub_node_id === entity.current_sub_node_id ||
      (def.placed_in_sub_node_id === 'HOME_KITCHEN_DINING' &&
        entity.current_sub_node_id === 'HOME_KITCHEN');
    if (!isSameRoom) continue;

    const grade = mapDurabilityToGrade(owned.current_durability_pct);
    const isBroken = owned.current_durability_pct < def.durability_rules.broken_threshold_pct;
    const durMap = EcoLifeJsonDb.sensory.durability_sensation_monologues[grade] as Record<
      string,
      string
    >;
    const monoKey = durMap[personality] || durMap.default || 'item_good_standard';

    const actions: PlacedFurnitureRenderDto['available_actions'] = [];
    // Chỉ mở nút tương tác khi đồ chưa hỏng (< 5%) và nhân vật không bị khóa lú lẫn tuổi già
    if (!isBroken && !entity.capability_flags.is_dementia_autopilot) {
      for (const act of def.interactable_actions) {
        let label = translateVi(act.label_key);
        // Nếu chưa mở khóa kỹ năng Quản lý thời gian -> ẩn số phút trên nút bấm (mù thời gian)
        if (!entity.capability_flags.is_time_management_unlocked) {
          label = label.replace(/\s*\(\+\d+\s*phút\)/g, '');
        }
        actions.push({
          action_id: act.action_id,
          button_label: label,
          stat_indicators: resolveActionStatIndicators(act.action_id)
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
      available_actions: actions
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
  const happinessMapped = mapScoreToColorAndLevel(entity.happiness_score);

  let timeDisplayVi = resolveBlindSkyTimeText(currentHour);
  if (entity.capability_flags.is_clock_visible) {
    timeDisplayVi = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
  }

  const bio = entity.identity_biometrics;
  const flags = entity.capability_flags;

  let biometricsDisplay = translateVi('biometrics_unknown');
  // Chỉ giải mã chiều cao, cân nặng và phân loại BMI sau khi khám sức khỏe hoặc đo tại nhà
  if (flags.is_biometrics_decoded) {
    const bmi = computeBmiKgPerM2(asKilograms(bio.weight_kg), asCentimeters(bio.height_cm));
    let bmiKey = 'bmi_normal';
    if (bmi < 18.5) bmiKey = 'bmi_underweight';
    else if (bmi >= 23.0 && bmi < 25.0) bmiKey = 'bmi_overweight';
    else if (bmi >= 25.0 && bmi < 30.0) bmiKey = 'bmi_obese_1';
    else if (bmi >= 30.0) bmiKey = 'bmi_obese_2';

    biometricsDisplay = translateVi('biometrics_known_format', {
      height_cm: Math.round(bio.height_cm),
      weight_kg: Math.round(bio.weight_kg),
      bmi_label: translateVi(bmiKey)
    });
  }

  return {
    health_light_level: healthMapped.level,
    health_color: healthMapped.color,
    health_label_vi: EcoLifeJsonDb.viVn.sensory_colors.health[healthMapped.color] || 'Tạm Được',
    happiness_light_level: happinessMapped.level,
    happiness_color: happinessMapped.color,
    happiness_label_vi:
      EcoLifeJsonDb.viVn.sensory_colors.happiness[happinessMapped.color] || 'Bình Lặng',
    body_monologue_vi: resolveBodyMonologueVi(entity),
    time_display_vi: timeDisplayVi,
    is_exact_clock_shown: flags.is_clock_visible,
    blind_profile_view: {
      full_name: bio.full_name,
      age_years: Math.floor(bio.exact_age_years),
      hobby_display_vi:
        bio.exact_age_years >= 6 && bio.hobby_key
          ? translateVi(bio.hobby_key)
          : translateVi('not_formed_yet'),
      personality_display_vi:
        flags.is_personality_decoded && bio.locked_personality
          ? translateVi(bio.locked_personality)
          : translateVi('unknown_mark'),
      biometrics_display_vi: biometricsDisplay,
      is_autopilot_locked: flags.is_dementia_autopilot
    },
    placed_furniture_in_current_room: projectRoomFurnitureForScene(entity)
  };
}

export function buildDeathAndMemoirSummary(
  session: EcoLifeSavedSessionState,
  causeLabelVi: string,
  epitaphVi: string
): FrontendDeathAndMemoirDto {
  const player = session.player;
  const age = Math.floor(player.identity_biometrics.exact_age_years);
  const honorRules = EcoLifeJsonDb.agingEndgame.memorial_honorific_rules;

  // Dưới ngưỡng tuổi thọ dùng "Hưởng dương", từ ngưỡng trở lên dùng "Hưởng thọ"
  const template =
    age <= honorRules.young_death_max_age
      ? honorRules.young_death_label_vi
      : honorRules.old_death_label_vi;
  const honorificLabelVi = template.split('{age}').join(String(age));

  let totalEstateVnd = player.cash_vnd + player.bank_savings_vnd;
  for (const furn of player.owned_furniture) {
    const def = getFurnitureDefById(furn.furniture_id);
    if (def) {
      totalEstateVnd = totalEstateVnd + Math.round(def.base_price_vnd * 0.5);
    }
  }

  const m = session.clock.current_month;
  const seasonNames = ['mùa xuân', 'mùa hạ', 'mùa thu', 'mùa đông'];
  const seasonVi = seasonNames[Math.min(3, Math.floor((Math.max(1, m) - 1) / 3))];

  const romanMap = ['I', 'II', 'III', 'IV', 'V'];
  const chapters = EcoLifeJsonDb.agingEndgame.memoir_chapters.map((chap, idx) => ({
    chapter_index: chap.chapter_index,
    roman_numeral: romanMap[idx] || String(chap.chapter_index),
    title_vi: chap.title_vi,
    entries: session.journal_logs.filter(
      (log) => log.age_recorded >= chap.min_age && log.age_recorded <= chap.max_age
    )
  }));

  return {
    is_deceased: true,
    age_at_death: age,
    honorific_label_vi: honorificLabelVi,
    cause_label_vi: causeLabelVi,
    season_vi: seasonVi,
    epitaph_vi: epitaphVi,
    total_estate_vnd: totalEstateVnd,
    will_lines: session.will_lines,
    will_fallback_note_vi:
      session.will_lines.length > 0
        ? 'Phân chia di sản theo Di chúc đã lập tại Phòng Công Chứng.'
        : 'Không lập di chúc — Tài sản chia theo quy định pháp luật.',
    chapters
  };
}