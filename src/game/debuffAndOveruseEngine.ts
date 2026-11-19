// Tầng xử lý logic chuyên biệt cho hệ thống Debuff do Lạm dụng (Overuse & Abuse Engine)
// Dùng chung cho cả Người chơi (PLAYER_CONTROLLED) và NPC (AI_AUTONOMOUS).
// Quy tắc toán học: Chỉ dùng cộng, trừ, nhân, chia cơ bản và if / else tuần tự (CẤM Math.exp / log).

import { EcoLifeJsonDb, translateVi } from './jsonDatabaseLoader';
import type {
  ActiveOveruseDebuffId,
  HumanEntityState,
  OveruseTrackerState
} from './sensoryProjectionAdapter';
import { clampNumber } from './ecoLifeActionEngine';

// ============================================================================
// 1. INTERFACE ĐẦU VÀO & ĐẦU RA
// ============================================================================

export type SubstanceUseType = 'NICOTINE' | 'ALCOHOL' | 'STIMULANT';

export interface OveruseEvaluationResult {
  ok: boolean;
  triggered_debuff_ids: ActiveOveruseDebuffId[];
  sensory_message_vi: string;
  total_time_penalty_multiplier: number;
  minutes_elapsed: number;
  journal_entry_vi: string | null;
  auto_save_trigger: 'ACTION_COMPLETED' | null;
}

// ============================================================================
// 2. HÀM KHỞI TẠO AN TOÀN & QUẢN LÝ DANH SÁCH DEBUFF
// ============================================================================

export function ensureOveruseTracker(entity: HumanEntityState): OveruseTrackerState {
  if (!entity.hidden_black_box.overuse_tracker) {
    entity.hidden_black_box.overuse_tracker = {
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
  return entity.hidden_black_box.overuse_tracker;
}

function addActiveDebuff(tracker: OveruseTrackerState, debuffId: ActiveOveruseDebuffId): void {
  if (!tracker.active_debuff_ids.includes(debuffId)) {
    tracker.active_debuff_ids.push(debuffId);
  }
}

function removeActiveDebuff(tracker: OveruseTrackerState, debuffId: ActiveOveruseDebuffId): void {
  tracker.active_debuff_ids = tracker.active_debuff_ids.filter((id) => id !== debuffId);
}

/**
 * Tính tổng hệ số nhân thời gian thao tác khi nhân vật đang gánh nhiều debuff lạm dụng cùng lúc.
 * Frontend/ActionEngine chỉ cần nhân kết quả này vào thời gian hành động gốc.
 */
export function getActiveOveruseTimeMultiplier(entity: HumanEntityState): number {
  const tracker = ensureOveruseTracker(entity);
  const rules = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs;
  let multiplier = 1.0;

  // Kiểm tra từng debuff đang bật và cộng dồn phần trăm chậm lại theo phép cộng phẳng
  if (tracker.active_debuff_ids.includes('DEBUFF_CLINICAL_BURNOUT')) {
    multiplier = multiplier + (rules.DEBUFF_CLINICAL_BURNOUT.time_cost_multiplier - 1.0);
  }
  if (tracker.active_debuff_ids.includes('DEBUFF_CIRCADIAN_SHOCK')) {
    multiplier = multiplier + (rules.DEBUFF_CIRCADIAN_SHOCK.time_cost_multiplier - 1.0);
  }
  if (tracker.active_debuff_ids.includes('DEBUFF_ALCOHOL_WITHDRAWAL')) {
    multiplier =
      multiplier +
      (rules.DEBUFF_ALCOHOL_OVERUSE_AND_WITHDRAWAL.withdrawal_time_cost_multiplier - 1.0);
  }
  if (tracker.active_debuff_ids.includes('DEBUFF_NICOTINE_WITHDRAWAL')) {
    multiplier =
      multiplier + (rules.DEBUFF_NICOTINE_WITHDRAWAL.withdrawal_time_cost_multiplier - 1.0);
  }
  if (tracker.active_debuff_ids.includes('DEBUFF_PAINKILLER_OVERUSE')) {
    multiplier = multiplier + (rules.DEBUFF_PAINKILLER_OVERUSE.time_cost_multiplier - 1.0);
  }
  if (tracker.active_debuff_ids.includes('DEBUFF_STIMULANT_HEART_OVERLOAD')) {
    multiplier = multiplier + (rules.DEBUFF_STIMULANT_HEART_OVERLOAD.time_cost_multiplier - 1.0);
  }
  if (tracker.active_debuff_ids.includes('DEBUFF_FRAGMENTED_NAP_FATIGUE')) {
    multiplier = multiplier + (rules.DEBUFF_FRAGMENTED_NAP_FATIGUE.time_cost_multiplier - 1.0);
  }

  // Giới hạn trần tối đa 3.0x để tránh thao tác bị kéo dài vô hạn
  return clampNumber(multiplier, 1.0, 3.0);
}

// ============================================================================
// 3. XỬ LÝ LẠM DỤNG THUỐC GIẢM ĐAU OTC (MODULE 3.1)
// ============================================================================

export function recordAndEvaluatePainkillerUse(
  entity: HumanEntityState
): OveruseEvaluationResult {
  const tracker = ensureOveruseTracker(entity);
  const rule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_PAINKILLER_OVERUSE;

  // [1. Cộng dồn số liều thuốc giảm đau đã uống trong 24 giờ qua]
  tracker.painkiller_doses_last_24h = tracker.painkiller_doses_last_24h + 1;

  // [2. Kiểm tra xem người chơi có đang lạm dụng từ liều thứ 2 trở lên trong 24h không]
  if (tracker.painkiller_doses_last_24h >= rule.trigger_doses_in_24h) {
    // Đời thực: Uống thuốc giảm đau dồn dập gây lờn thuốc (che đau ngắn lại còn 3h),
    // đồng thời đánh nặng vào Gan và gây nóng rát loét Dạ dày.
    addActiveDebuff(tracker, 'DEBUFF_PAINKILLER_OVERUSE');
    entity.hidden_black_box.painkiller_masked_hours_left = rule.overused_mask_hours;
    entity.hidden_black_box.organs.liver = clampNumber(
      entity.hidden_black_box.organs.liver + rule.overused_liver_delta,
      0,
      100
    );
    entity.hidden_black_box.organs.digestive = clampNumber(
      entity.hidden_black_box.organs.digestive + rule.overused_digestive_delta,
      0,
      100
    );
    entity.happiness_score = clampNumber(entity.happiness_score + rule.happiness_delta, 0, 100);

    return {
      ok: true,
      triggered_debuff_ids: [...tracker.active_debuff_ids],
      sensory_message_vi: translateVi(rule.sensory_monologue_key),
      total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
      minutes_elapsed: 5,
      journal_entry_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  // Trường hợp uống liều đầu tiên trong ngày: Che triệu chứng 6h nhưng vẫn âm thầm trừ nhẹ Gan
  entity.hidden_black_box.painkiller_masked_hours_left = rule.normal_mask_hours;
  entity.hidden_black_box.organs.liver = clampNumber(
    entity.hidden_black_box.organs.liver + rule.normal_liver_delta,
    0,
    100
  );

  return {
    ok: true,
    triggered_debuff_ids: [...tracker.active_debuff_ids],
    sensory_message_vi: translateVi('mono_symptom_masked_by_painkiller'),
    total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
    minutes_elapsed: 5,
    journal_entry_vi: null,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

// ============================================================================
// 4. XỬ LÝ TỆ NẠN & CHẤT KÍCH THÍCH (THUỐC LÁ / RƯỢU BIA / NƯỚC TĂNG LỰC)
// ============================================================================

export function executeUseViceOrStimulant(
  entity: HumanEntityState,
  substanceType: SubstanceUseType,
  currentEnvironment: 'INDOOR' | 'OUTDOOR',
  costVnd: number,
  familyMembersInSameRoom: HumanEntityState[] = []
): OveruseEvaluationResult {
  const tracker = ensureOveruseTracker(entity);
  const rules = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs;

  // [1. Kiểm tra điều kiện ví tiền]
  if (entity.cash_vnd < costVnd) {
    return {
      ok: false,
      triggered_debuff_ids: [...tracker.active_debuff_ids],
      sensory_message_vi: translateVi('err_insufficient_cash'),
      total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
      minutes_elapsed: 0,
      journal_entry_vi: null,
      auto_save_trigger: null
    };
  }

  // --- NHÁNH A: HÚT THUỐC LÁ (NICOTINE) ---
  if (substanceType === 'NICOTINE') {
    const nicRule = rules.DEBUFF_NICOTINE_WITHDRAWAL;

    // Kiểm tra ràng buộc địa điểm: Cấm hút thuốc trong Bệnh viện và Trường học
    if (nicRule.forbidden_location_ids.includes(entity.current_location_id)) {
      return {
        ok: false,
        triggered_debuff_ids: [...tracker.active_debuff_ids],
        sensory_message_vi: translateVi('err_vice_forbidden_location'),
        total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
        minutes_elapsed: 0,
        journal_entry_vi: null,
        auto_save_trigger: null
      };
    }

    // Trừ tiền, reset đồng hồ vã thuốc và tăng mức Lờn đô (Tolerance)
    entity.cash_vnd = entity.cash_vnd - costVnd;
    tracker.hours_since_last_nicotine = 0;
    removeActiveDebuff(tracker, 'DEBUFF_NICOTINE_WITHDRAWAL');

    // Nếu đã lờn đô (>= ngưỡng nghiện) thì hiệu quả giải tỏa stress giảm mạnh
    const reliefHappy =
      tracker.nicotine_tolerance >= nicRule.addiction_threshold_tolerance
        ? nicRule.tolerant_happiness_relief
        : nicRule.base_happiness_relief;

    tracker.nicotine_tolerance = clampNumber(
      tracker.nicotine_tolerance + nicRule.tolerance_gain_per_use,
      0,
      100
    );
    entity.happiness_score = clampNumber(entity.happiness_score + reliefHappy, 0, 100);
    entity.hidden_black_box.organs.lungs = clampNumber(
      entity.hidden_black_box.organs.lungs + nicRule.lungs_delta_per_use,
      0,
      100
    );
    entity.hidden_black_box.organs.heart = clampNumber(
      entity.hidden_black_box.organs.heart + nicRule.heart_delta_per_use,
      0,
      100
    );

    // Kiểm tra khói thuốc thụ động: Hút trong nhà kín (INDOOR) làm hại Phổi cả vợ/chồng và con nhỏ
    let msgVi = 'Hút xong điếu thuốc, cảm giác căng thẳng dịu đi đôi chút nhưng cổ họng hơi khé.';
    if (
      currentEnvironment === 'INDOOR' &&
      entity.current_location_id === 'LOC_HOME' &&
      familyMembersInSameRoom.length > 0
    ) {
      for (const member of familyMembersInSameRoom) {
        member.hidden_black_box.organs.lungs = clampNumber(
          member.hidden_black_box.organs.lungs + nicRule.indoor_passive_smoke_family_lungs_delta,
          0,
          100
        );
      }
      msgVi = `${msgVi} ${translateVi('msg_passive_smoke_family_warning')}`;
    }

    return {
      ok: true,
      triggered_debuff_ids: [...tracker.active_debuff_ids],
      sensory_message_vi: msgVi,
      total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
      minutes_elapsed: 5,
      journal_entry_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  // --- NHÁNH B: UỐNG RƯỢU BIA (ALCOHOL) ---
  if (substanceType === 'ALCOHOL') {
    const alcRule = rules.DEBUFF_ALCOHOL_OVERUSE_AND_WITHDRAWAL;

    // Kiểm tra ràng buộc độ tuổi & địa điểm cấm uống rượu bia
    if (entity.identity_biometrics.exact_age_years < alcRule.min_age_legal) {
      return {
        ok: false,
        triggered_debuff_ids: [...tracker.active_debuff_ids],
        sensory_message_vi: translateVi('err_underage_alcohol'),
        total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
        minutes_elapsed: 0,
        journal_entry_vi: null,
        auto_save_trigger: null
      };
    }

    if (alcRule.forbidden_location_ids.includes(entity.current_location_id)) {
      return {
        ok: false,
        triggered_debuff_ids: [...tracker.active_debuff_ids],
        sensory_message_vi: translateVi('err_vice_forbidden_location'),
        total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
        minutes_elapsed: 0,
        journal_entry_vi: null,
        auto_save_trigger: null
      };
    }

    entity.cash_vnd = entity.cash_vnd - costVnd;
    tracker.alcohol_sessions_last_24h = tracker.alcohol_sessions_last_24h + 1;
    tracker.alcohol_intoxication_hours_left = alcRule.intoxication_duration_hours;
    tracker.hours_since_last_alcohol = 0;
    tracker.alcohol_tolerance = clampNumber(
      tracker.alcohol_tolerance + alcRule.tolerance_gain_per_use,
      0,
      100
    );
    removeActiveDebuff(tracker, 'DEBUFF_ALCOHOL_WITHDRAWAL');

    // Kiểm tra lạm dụng uống từ cữ thứ 2 trong 24h -> đánh sập Gan & Não mạnh hơn nhiều
    if (tracker.alcohol_sessions_last_24h >= alcRule.overuse_sessions_in_24h) {
      addActiveDebuff(tracker, 'DEBUFF_ALCOHOL_OVERUSE');
      entity.hidden_black_box.organs.liver = clampNumber(
        entity.hidden_black_box.organs.liver + alcRule.overused_liver_delta,
        0,
        100
      );
      entity.hidden_black_box.organs.brain = clampNumber(
        entity.hidden_black_box.organs.brain + alcRule.overused_brain_delta,
        0,
        100
      );
      return {
        ok: true,
        triggered_debuff_ids: [...tracker.active_debuff_ids],
        sensory_message_vi: translateVi(alcRule.overuse_monologue_key),
        total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
        minutes_elapsed: 60,
        journal_entry_vi: null,
        auto_save_trigger: 'ACTION_COMPLETED'
      };
    }

    entity.hidden_black_box.organs.liver = clampNumber(
      entity.hidden_black_box.organs.liver + alcRule.normal_liver_delta,
      0,
      100
    );
    entity.happiness_score = clampNumber(entity.happiness_score + 6.0, 0, 100);

    return {
      ok: true,
      triggered_debuff_ids: [...tracker.active_debuff_ids],
      sensory_message_vi: 'Cụng ly giải sầu đôi chén, người lâng lâng nhưng không nên tự lái xe lúc này.',
      total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
      minutes_elapsed: 45,
      journal_entry_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  // --- NHÁNH C: NƯỚC TĂNG LỰC / CÀ PHÊ ĐẶC ÉP THỨC (STIMULANT) ---
  const stimRule = rules.DEBUFF_STIMULANT_HEART_OVERLOAD;
  entity.cash_vnd = entity.cash_vnd - costVnd;
  tracker.stimulant_doses_last_24h = tracker.stimulant_doses_last_24h + 1;

  // Giảm nhẹ cảm giác buồn ngủ tức thời (KHÔNG xóa nợ ngủ gốc sleep_debt_hours)
  entity.hidden_black_box.hours_awake_continuous = Math.max(
    0,
    entity.hidden_black_box.hours_awake_continuous - stimRule.temporary_awake_relief_hours
  );

  // Kiểm tra lạm dụng từ lon thứ 2 trở lên trong 24h -> sốc nhịp tim & xót dạ dày
  if (tracker.stimulant_doses_last_24h >= stimRule.overuse_doses_in_24h) {
    addActiveDebuff(tracker, 'DEBUFF_STIMULANT_HEART_OVERLOAD');
    entity.hidden_black_box.organs.heart = clampNumber(
      entity.hidden_black_box.organs.heart + stimRule.overused_heart_delta,
      0,
      100
    );
    entity.hidden_black_box.organs.digestive = clampNumber(
      entity.hidden_black_box.organs.digestive + stimRule.overused_digestive_delta,
      0,
      100
    );
    entity.happiness_score = clampNumber(
      entity.happiness_score + stimRule.overused_happiness_delta,
      0,
      100
    );

    return {
      ok: true,
      triggered_debuff_ids: [...tracker.active_debuff_ids],
      sensory_message_vi: translateVi(stimRule.sensory_monologue_key),
      total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
      minutes_elapsed: 5,
      journal_entry_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  entity.hidden_black_box.organs.heart = clampNumber(
    entity.hidden_black_box.organs.heart + stimRule.normal_heart_delta,
    0,
    100
  );

  return {
    ok: true,
    triggered_debuff_ids: [...tracker.active_debuff_ids],
    sensory_message_vi: 'Uống một ngụm nước tăng lực giúp tỉnh táo thêm đôi chút để cố nốt việc.',
    total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
    minutes_elapsed: 5,
    journal_entry_vi: null,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

// ============================================================================
// 5. XỬ LÝ NGÁN ĂN PHÂN TẦNG TÂM LÝ (MODULE 3.18) & QUÁ TẢI CÔNG VIỆC / ĐẢO CA
// ============================================================================

export function evaluateStratifiedFoodFatigue(
  entity: HumanEntityState,
  mealDefId: string
): OveruseEvaluationResult {
  const tracker = ensureOveruseTracker(entity);
  const foodRule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_STRATIFIED_FOOD_FATIGUE;

  // [1. Cập nhật số bữa ăn liên tiếp cùng một món]
  if (tracker.last_meal_def_id === mealDefId) {
    tracker.consecutive_same_meal_count = tracker.consecutive_same_meal_count + 1;
  } else {
    tracker.last_meal_def_id = mealDefId;
    tracker.consecutive_same_meal_count = 1;
    removeActiveDebuff(tracker, 'DEBUFF_STRATIFIED_FOOD_FATIGUE');
  }

  // [2. Luật Ngán Ăn Phân Tầng Tâm Lý (Module 3.18)]:
  // Nếu Hạnh phúc < 65 (Màu Vàng, Cam, Đỏ) -> Nhân vật đang tập trung sinh tồn, MIỄN NHIỄM ngán ăn!
  if (entity.happiness_score < foodRule.min_happiness_score_to_trigger) {
    removeActiveDebuff(tracker, 'DEBUFF_STRATIFIED_FOOD_FATIGUE');
    return {
      ok: true,
      triggered_debuff_ids: [...tracker.active_debuff_ids],
      sensory_message_vi: 'Ăn no bụng để có sức lo cho cuộc sống, không đòi hỏi cao sang.',
      total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
      minutes_elapsed: 0,
      journal_entry_vi: null,
      auto_save_trigger: null
    };
  }

  // Nếu Hạnh phúc >= 65 (Xanh Lá / Xanh Biển) và ăn lặp món từ bữa thứ 4 trở đi -> Dính Debuff Ngán Ngẩm
  if (tracker.consecutive_same_meal_count >= foodRule.consecutive_same_meal_threshold) {
    addActiveDebuff(tracker, 'DEBUFF_STRATIFIED_FOOD_FATIGUE');
    entity.happiness_score = clampNumber(
      entity.happiness_score + foodRule.happiness_penalty_per_repeated_meal,
      0,
      100
    );

    return {
      ok: true,
      triggered_debuff_ids: [...tracker.active_debuff_ids],
      sensory_message_vi: translateVi(foodRule.sensory_monologue_key),
      total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
      minutes_elapsed: 0,
      journal_entry_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  return {
    ok: true,
    triggered_debuff_ids: [...tracker.active_debuff_ids],
    sensory_message_vi: 'Bữa ăn hợp khẩu vị, tinh thần thấy phấn chấn hơn.',
    total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
    minutes_elapsed: 0,
    journal_entry_vi: null,
    auto_save_trigger: null
  };
}

export function evaluateWorkOveruseAndShiftShock(
  entity: HumanEntityState,
  shiftType: 'SHIFT_DAY' | 'SHIFT_EVENING' | 'SHIFT_NIGHT',
  shiftHours: number,
  restDaysSincePrevShift: number
): OveruseEvaluationResult {
  const tracker = ensureOveruseTracker(entity);
  const burnoutRule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_CLINICAL_BURNOUT;
  const shockRule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_CIRCADIAN_SHOCK;

  // [1. Cộng dồn tổng giờ làm việc trong tuần]
  tracker.weekly_work_hours = tracker.weekly_work_hours + shiftHours;
  let messageVi = 'Hoàn thành ca làm việc.';

  // [2. Kiểm tra Sốc đảo ca đột ngột (Module 3.10): Đang làm >= 3 ca đêm mà nhảy sang ca sáng không nghỉ đủ 2 ngày]
  if (shiftType === 'SHIFT_NIGHT') {
    tracker.consecutive_night_shifts = tracker.consecutive_night_shifts + 1;
  } else if (shiftType === 'SHIFT_DAY') {
    if (
      tracker.consecutive_night_shifts >= shockRule.min_consecutive_night_shifts &&
      restDaysSincePrevShift < shockRule.required_rest_days_before_day_shift
    ) {
      addActiveDebuff(tracker, 'DEBUFF_CIRCADIAN_SHOCK');
      tracker.circadian_shock_hours_left = shockRule.shock_duration_hours;
      entity.happiness_score = clampNumber(
        entity.happiness_score + shockRule.happiness_delta_on_trigger,
        0,
        100
      );
      messageVi = translateVi(shockRule.sensory_monologue_key);
    }
    tracker.consecutive_night_shifts = 0;
  }

  // [3. Kiểm tra Hội chứng Cháy sạch / Kiệt quệ thần kinh (Module A.3): Làm việc > 65 giờ/tuần]
  if (tracker.weekly_work_hours > burnoutRule.trigger_weekly_work_hours) {
    addActiveDebuff(tracker, 'DEBUFF_CLINICAL_BURNOUT');
    entity.hidden_black_box.organs.brain = clampNumber(
      entity.hidden_black_box.organs.brain + burnoutRule.brain_delta_per_work_hour * shiftHours,
      0,
      100
    );
    entity.happiness_score = clampNumber(
      entity.happiness_score + burnoutRule.happiness_delta_per_shift,
      0,
      100
    );
    messageVi = translateVi(burnoutRule.sensory_monologue_key);
  }

  return {
    ok: true,
    triggered_debuff_ids: [...tracker.active_debuff_ids],
    sensory_message_vi: messageVi,
    total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
    minutes_elapsed: 0,
    journal_entry_vi: null,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

// ============================================================================
// 6. CẬP NHẬT VÃ CƠN NGHIỆN, SỐC ĐẢO CA & HỒI PHỤC THEO THỜI GIAN TRÔI
// ============================================================================

export function tickOveruseDebuffsByHours(
  entity: HumanEntityState,
  hoursElapsed: number,
  didCrossNewDay: boolean = false,
  didCrossNewWeek: boolean = false
): void {
  if (hoursElapsed <= 0) {
    return;
  }

  const tracker = ensureOveruseTracker(entity);
  const rules = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs;

  // [1. Giảm giờ say rượu & sốc đảo ca theo thời gian thực tế trôi qua]
  if (tracker.alcohol_intoxication_hours_left > 0) {
    tracker.alcohol_intoxication_hours_left = Math.max(
      0,
      tracker.alcohol_intoxication_hours_left - hoursElapsed
    );
  }

  if (tracker.circadian_shock_hours_left > 0) {
    tracker.circadian_shock_hours_left = Math.max(
      0,
      tracker.circadian_shock_hours_left - hoursElapsed
    );
    // Đang trong cơn sốc đảo ca: bào mòn Tim và Não từng giờ
    entity.hidden_black_box.organs.heart = clampNumber(
      entity.hidden_black_box.organs.heart + rules.DEBUFF_CIRCADIAN_SHOCK.heart_delta_per_hour * hoursElapsed,
      0,
      100
    );
    entity.hidden_black_box.organs.brain = clampNumber(
      entity.hidden_black_box.organs.brain + rules.DEBUFF_CIRCADIAN_SHOCK.brain_delta_per_hour * hoursElapsed,
      0,
      100
    );
    if (tracker.circadian_shock_hours_left <= 0) {
      removeActiveDebuff(tracker, 'DEBUFF_CIRCADIAN_SHOCK');
    }
  }

  // [2. Kiểm tra Vã thuốc lá (Nicotine Withdrawal) nếu đã đạt ngưỡng nghiện mà nhịn > 12h]
  const nicRule = rules.DEBUFF_NICOTINE_WITHDRAWAL;
  if (tracker.nicotine_tolerance >= nicRule.addiction_threshold_tolerance) {
    tracker.hours_since_last_nicotine = tracker.hours_since_last_nicotine + hoursElapsed;
    if (tracker.hours_since_last_nicotine >= nicRule.withdrawal_trigger_hours_without_use) {
      addActiveDebuff(tracker, 'DEBUFF_NICOTINE_WITHDRAWAL');
      entity.happiness_score = clampNumber(
        entity.happiness_score + nicRule.withdrawal_happiness_per_hour * hoursElapsed,
        0,
        100
      );
      entity.hidden_black_box.organs.brain = clampNumber(
        entity.hidden_black_box.organs.brain + nicRule.withdrawal_brain_per_hour * hoursElapsed,
        0,
        100
      );
    }
  }

  // [3. Kiểm tra Vã rượu (Alcohol Withdrawal) nếu đã nghiện mà nhịn > 24h]
  const alcRule = rules.DEBUFF_ALCOHOL_OVERUSE_AND_WITHDRAWAL;
  if (tracker.alcohol_tolerance >= alcRule.addiction_threshold_tolerance) {
    tracker.hours_since_last_alcohol = tracker.hours_since_last_alcohol + hoursElapsed;
    if (tracker.hours_since_last_alcohol >= alcRule.withdrawal_trigger_hours_without_use) {
      addActiveDebuff(tracker, 'DEBUFF_ALCOHOL_WITHDRAWAL');
      entity.happiness_score = clampNumber(
        entity.happiness_score + alcRule.withdrawal_happiness_per_hour * hoursElapsed,
        0,
        100
      );
      entity.hidden_black_box.organs.brain = clampNumber(
        entity.hidden_black_box.organs.brain + alcRule.withdrawal_brain_per_hour * hoursElapsed,
        0,
        100
      );
    }
  }

  // [4. Đồng bộ Debuff ngủ vặt từ hidden_black_box]
  if (
    entity.hidden_black_box.naps_taken_since_full_sleep >=
    rules.DEBUFF_FRAGMENTED_NAP_FATIGUE.trigger_naps_without_full_sleep
  ) {
    addActiveDebuff(tracker, 'DEBUFF_FRAGMENTED_NAP_FATIGUE');
  } else {
    removeActiveDebuff(tracker, 'DEBUFF_FRAGMENTED_NAP_FATIGUE');
  }

  // [5. Khi qua ngày mới: Reset bộ đếm liều trong 24h và hạ dần điểm lờn đô nếu không dùng]
  if (didCrossNewDay) {
    tracker.painkiller_doses_last_24h = 0;
    tracker.stimulant_doses_last_24h = 0;
    tracker.alcohol_sessions_last_24h = 0;
    removeActiveDebuff(tracker, 'DEBUFF_PAINKILLER_OVERUSE');
    removeActiveDebuff(tracker, 'DEBUFF_STIMULANT_HEART_OVERLOAD');
    removeActiveDebuff(tracker, 'DEBUFF_ALCOHOL_OVERUSE');

    if (tracker.hours_since_last_nicotine >= 24.0) {
      tracker.nicotine_tolerance = Math.max(
        0,
        tracker.nicotine_tolerance - nicRule.tolerance_decay_per_day_clean
      );
      if (tracker.nicotine_tolerance < nicRule.addiction_threshold_tolerance) {
        removeActiveDebuff(tracker, 'DEBUFF_NICOTINE_WITHDRAWAL');
      }
    }

    if (tracker.hours_since_last_alcohol >= 24.0) {
      tracker.alcohol_tolerance = Math.max(
        0,
        tracker.alcohol_tolerance - alcRule.tolerance_decay_per_day_clean
      );
      if (tracker.alcohol_tolerance < alcRule.addiction_threshold_tolerance) {
        removeActiveDebuff(tracker, 'DEBUFF_ALCOHOL_WITHDRAWAL');
      }
    }
  }

  // [6. Khi sang tuần mới: Nếu tuần vừa rồi làm dưới 44h thì khỏi hội chứng Burnout, sau đó reset bộ đếm giờ làm tuần]
  if (didCrossNewWeek) {
    if (tracker.weekly_work_hours <= rules.DEBUFF_CLINICAL_BURNOUT.recovery_weekly_work_hours_below) {
      removeActiveDebuff(tracker, 'DEBUFF_CLINICAL_BURNOUT');
    }
    tracker.weekly_work_hours = 0;
  }
}

// ============================================================================
// 7. CAI NGHIỆN CHUYÊN KHOA TẠI BỆNH VIỆN (RÀNG BUỘC ĐỊA ĐIỂM LOC_HOSPITAL)
// ============================================================================

export function executeHospitalAddictionRehab(
  entity: HumanEntityState,
  hasSocialInsurance: boolean = false
): OveruseEvaluationResult {
  const rehab = EcoLifeJsonDb.overuseDebuffs.rehab_treatment_rules;

  // [1. Ràng buộc địa điểm: Chỉ được điều trị cắt cơn cai nghiện tại Bệnh viện]
  if (entity.current_location_id !== rehab.location_id) {
    return {
      ok: false,
      triggered_debuff_ids: [...ensureOveruseTracker(entity).active_debuff_ids],
      sensory_message_vi: translateVi('err_location_mismatch'),
      total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
      minutes_elapsed: 0,
      journal_entry_vi: null,
      auto_save_trigger: null
    };
  }

  const discountRate = hasSocialInsurance
    ? EcoLifeJsonDb.bankingHousing.tax_and_social_insurance.social_insurance
        .hospital_bill_discount_rate
    : 0.0;
  const finalCostVnd = Math.round(rehab.cost_vnd * (1.0 - discountRate));

  if (entity.cash_vnd < finalCostVnd) {
    return {
      ok: false,
      triggered_debuff_ids: [...ensureOveruseTracker(entity).active_debuff_ids],
      sensory_message_vi: translateVi('err_insufficient_cash'),
      total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
      minutes_elapsed: 0,
      journal_entry_vi: null,
      auto_save_trigger: null
    };
  }

  // [2. Trừ tiền & cắt giảm mạnh mức lờn đô / xóa toàn bộ cơn vã thuốc]
  entity.cash_vnd = entity.cash_vnd - finalCostVnd;
  const tracker = ensureOveruseTracker(entity);
  tracker.nicotine_tolerance = Math.max(
    0,
    tracker.nicotine_tolerance - rehab.tolerance_reduction_flat
  );
  tracker.alcohol_tolerance = Math.max(
    0,
    tracker.alcohol_tolerance - rehab.tolerance_reduction_flat
  );
  removeActiveDebuff(tracker, 'DEBUFF_NICOTINE_WITHDRAWAL');
  removeActiveDebuff(tracker, 'DEBUFF_ALCOHOL_WITHDRAWAL');
  removeActiveDebuff(tracker, 'DEBUFF_ALCOHOL_OVERUSE');

  return {
    ok: true,
    triggered_debuff_ids: [...tracker.active_debuff_ids],
    sensory_message_vi: translateVi(rehab.journal_log_entry_key),
    total_time_penalty_multiplier: getActiveOveruseTimeMultiplier(entity),
    minutes_elapsed: rehab.duration_minutes,
    journal_entry_vi: translateVi(rehab.journal_log_entry_key),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}