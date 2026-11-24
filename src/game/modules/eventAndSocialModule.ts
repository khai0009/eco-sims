// [MODULE 7: SỰ KIỆN NGỮ CẢNH, XÃ HỘI NPC & BỘ NÃO TỰ HÀNH — CHUẨN ĐƠN VỊ V3.3]
// Áp dụng phương trình cửa sổ phản xạ & đóng băng PTSD chuẩn từ ecoLifeUnifiedFormulas.ts.

import { EcoLifeJsonDb, translateVi } from '../jsonDatabaseLoader';
import {
  STAT_MAX_VALUE,
  type ActionExecutionResult,
  type ActiveEventPopupDto,
  type EventChoiceRenderDto,
  type EventResolutionResult,
  type EventTriggerContext,
  type HumanEntityState,
  type NpcPresenceAtLocation,
  type OrganStateMap,
  type OwnedInventoryItemInstance,
  type WeatherCode
} from '../engineTypes';
import { applyOrganDeltas, clampStat100 } from './organAndBiologyModule';
import {
  executeEatMealAction,
  executeInteractWithFurnitureAction,
  executeShowerAction,
  executeSleepOrNapAction,
  executeToiletAction
} from './dailyLivingModule';
import { executeTravelToLocationAction } from './transitAndVehicleModule';
import {
  executeBuyAndUsePrescriptionRxAction,
  executeHospitalFullExamAction
} from './medicalAndHealthModule';
import {
  executePartTimeJobAction,
  executeStudyAtSchoolAction,
  executeWorkShiftAction
} from './careerAndFinanceModule';
import {
  asHours,
  asSeconds,
  asStat100,
  asYears,
  computeActionUtilityScore,
  computeDeficitIntensity,
  computeDerivedCognitiveFatigue,
  computeEventDecisionWindow
} from '../math/ecoLifeUnifiedFormulas';

export function buildEventPopupDto(
  entity: HumanEntityState,
  rawEvt: any,
  yearsExp: number = 0
): ActiveEventPopupDto {
  const baseSeconds = asSeconds(
    typeof rawEvt.presentation?.base_countdown_seconds === 'number'
      ? rawEvt.presentation.base_countdown_seconds
      : 10.0
  );

  // Áp dụng công thức cửa sổ phản xạ & đóng băng PTSD tổng quát (Addendum 01 Module A.2)
  const windowCalc = computeEventDecisionWindow({
    base_seconds: baseSeconds,
    years_experience: asYears(yearsExp),
    brain_stat: asStat100(entity.hidden_black_box.organs.brain),
    ptsd_trauma_stat: asStat100(entity.hidden_black_box.ptsd_trauma_score),
    is_danger_red_event: rawEvt.category === 'DANGER_RED'
  });

  const renderedChoices: EventChoiceRenderDto[] = [];
  let defaultTimeoutId = '';

  for (const ch of rawEvt.choices || []) {
    if (ch.is_default_timeout_penalty) {
      defaultTimeoutId = ch.choice_id;
    }

    if (ch.unlock_requirements) {
      const req = ch.unlock_requirements;
      if (typeof req.min_cash_vnd === 'number' && entity.cash_vnd < req.min_cash_vnd) {
        continue;
      }
      if (typeof req.min_years_experience === 'number' && yearsExp < req.min_years_experience) {
        continue;
      }
      if (
        req.required_personality &&
        req.required_personality !== entity.identity_biometrics.locked_personality
      ) {
        continue;
      }
      if (Array.isArray(req.required_innate_traits) && req.required_innate_traits.length > 0) {
        let hasAll = true;
        for (const tr of req.required_innate_traits) {
          if (!entity.identity_biometrics.innate_traits.includes(tr)) {
            hasAll = false;
            break;
          }
        }
        if (!hasAll) continue;
      }
    }

    renderedChoices.push({
      choice_id: ch.choice_id,
      button_label_vi: translateVi(ch.label_key),
      is_default_timeout_penalty: Boolean(ch.is_default_timeout_penalty),
      is_dementia_habit_choice: Boolean(ch.is_dementia_habit_choice)
    });
  }

  if (!defaultTimeoutId && renderedChoices.length > 0) {
    defaultTimeoutId = renderedChoices[renderedChoices.length - 1].choice_id;
  }

  let uiKind: 'daily' | 'chance' | 'danger' = 'daily';
  if (rawEvt.category === 'DANGER_RED') uiKind = 'danger';
  else if (rawEvt.category === 'OPPORTUNITY_GREEN') uiKind = 'chance';

  const isDementiaActive =
    entity.capability_flags.is_dementia_autopilot ||
    (entity.identity_biometrics.exact_age_years >= 65 &&
      entity.hidden_black_box.organs.brain < 25.0);

  return {
    event_id: rawEvt.event_id,
    category: rawEvt.category,
    ui_kind: uiKind,
    title_vi: translateVi(rawEvt.presentation.title_key),
    narrative_body_vi: translateVi(rawEvt.presentation.narrative_body_key),
    base_countdown_seconds: baseSeconds,
    effective_countdown_seconds: windowCalc.effective_seconds,
    ptsd_freeze_seconds: windowCalc.ptsd_freeze_seconds,
    hide_choices_due_to_dementia: isDementiaActive,
    available_choices: renderedChoices,
    default_timeout_choice_id: defaultTimeoutId,
    auto_save_trigger: 'EVENT_TRIGGERED'
  };
}

export function rollContextualEventForEntity(
  entity: HumanEntityState,
  context: EventTriggerContext
): ActiveEventPopupDto | null {
  const age = entity.identity_biometrics.exact_age_years;
  const candidateEvents: Array<any> = [];

  for (const rawEvt of EcoLifeJsonDb.allEvents as Array<any>) {
    if (
      rawEvt.environment_filter !== 'BOTH' &&
      rawEvt.environment_filter !== context.current_environment
    ) {
      continue;
    }

    const cond = rawEvt.trigger_conditions || {};

    if (Array.isArray(cond.allowed_location_ids) && cond.allowed_location_ids.length > 0) {
      if (!cond.allowed_location_ids.includes(entity.current_location_id)) {
        continue;
      }
    }

    if (Array.isArray(cond.age_range) && cond.age_range.length === 2) {
      if (age < cond.age_range[0] || age > cond.age_range[1]) {
        continue;
      }
    }
    if (
      cond.required_biological_sex &&
      cond.required_biological_sex !== entity.identity_biometrics.gender
    ) {
      continue;
    }

    if (Array.isArray(cond.required_weather) && cond.required_weather.length > 0) {
      if (!cond.required_weather.includes(context.current_weather)) {
        continue;
      }
    }

    if (cond.biological_and_item_triggers) {
      const bioTrig = cond.biological_and_item_triggers;
      if (
        bioTrig.required_active_condition &&
        bioTrig.required_active_condition !== context.active_condition_flag
      ) {
        continue;
      }
      if (typeof bioTrig.min_sleep_debt_hours === 'number') {
        const maxEnergyThreshold = Math.max(0, STAT_MAX_VALUE - bioTrig.min_sleep_debt_hours * 2.5);
        if (entity.hidden_black_box.energy_sleep_pct > maxEnergyThreshold) {
          continue;
        }
      }
    }

    if (rawEvt.is_once_per_year_age) {
      const lastAge =
        typeof entity.yearly_event_age_tracker[rawEvt.event_id] === 'number'
          ? entity.yearly_event_age_tracker[rawEvt.event_id]
          : 5;
      if (Math.floor(age) <= lastAge) {
        continue;
      }
    }

    if (rawEvt.is_once_per_calendar_month) {
      const monthKey = `${context.current_year}-${context.current_month}`;
      if (entity.monthly_event_tracker[rawEvt.event_id] === monthKey) {
        continue;
      }
    }

    if (cond.schedule_trigger) {
      const sched = cond.schedule_trigger;
      if (
        Array.isArray(sched.allowed_months) &&
        sched.allowed_months.length > 0 &&
        !sched.allowed_months.includes(context.current_month)
      ) {
        continue;
      }
      if (
        typeof sched.exact_day_of_month === 'number' &&
        context.current_day !== sched.exact_day_of_month
      ) {
        continue;
      }
      if (sched.match_character_birthday === true) {
        if (
          context.current_day !== entity.identity_biometrics.birth_day ||
          context.current_month !== entity.identity_biometrics.birth_month
        ) {
          continue;
        }
      }
    }

    candidateEvents.push(rawEvt);
  }

  if (candidateEvents.length === 0) {
    return null;
  }

  const scheduledPool = candidateEvents.filter((e) =>
    Boolean(e.trigger_conditions?.schedule_trigger)
  );
  const pool = scheduledPool.length > 0 ? scheduledPool : candidateEvents;

  let totalWeight = 0;
  for (const evt of pool) {
    totalWeight = totalWeight + (evt.base_weight || 50.0);
  }
  let roll = Math.random() * totalWeight;
  let picked = pool[0];
  for (const evt of pool) {
    roll = roll - (evt.base_weight || 50.0);
    if (roll <= 0) {
      picked = evt;
      break;
    }
  }

  return buildEventPopupDto(entity, picked, context.years_of_experience || 0);
}

export function resolveEventChoice(
  entity: HumanEntityState,
  eventId: string,
  selectedChoiceId: string | null,
  currentYear: number,
  currentMonth: number
): EventResolutionResult {
  const rawEvt = (EcoLifeJsonDb.allEvents as Array<any>).find((e) => e.event_id === eventId);
  if (!rawEvt) {
    return {
      ok: false,
      selected_choice_id: '',
      outcome_summary_vi: 'Không tìm thấy sự kiện cần giải quyết.',
      minutes_elapsed: 0,
      journal_entry_vi: null,
      triggered_hospitalization: false,
      triggered_death_cause_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  let chosenObj = rawEvt.choices.find((c: any) => c.choice_id === selectedChoiceId);

  if (
    chosenObj &&
    typeof chosenObj.outcomes?.money_delta_vnd === 'number' &&
    chosenObj.outcomes.money_delta_vnd < 0 &&
    entity.cash_vnd < Math.abs(chosenObj.outcomes.money_delta_vnd)
  ) {
    chosenObj = null;
  }

  if (!chosenObj) {
    chosenObj =
      rawEvt.choices.find((c: any) => c.is_dementia_habit_choice) ||
      rawEvt.choices.find((c: any) => c.is_default_timeout_penalty) ||
      rawEvt.choices[rawEvt.choices.length - 1];
  }

  const outcomes = chosenObj.outcomes || {};
  const elapsedMinutes = outcomes.time_elapsed_minutes || 0;

  if (typeof outcomes.money_delta_vnd === 'number') {
    entity.cash_vnd = Math.max(0, entity.cash_vnd + outcomes.money_delta_vnd);
  }
  if (typeof outcomes.happiness_delta === 'number') {
    entity.happiness_score = clampStat100(entity.happiness_score + outcomes.happiness_delta);
  }
  // Sự kiện cơ hội xã giao ngoài nhà tác động ngược chiều lên Pin xã hội giữa Hướng Ngoại và Hướng Nội/ASD
  if (rawEvt.category === 'OPPORTUNITY_GREEN' && rawEvt.environment_filter !== 'INDOOR') {
    const pers = entity.identity_biometrics.locked_personality;
    const hasAsd = entity.identity_biometrics.innate_traits.includes('TRAIT_ASD');
    const prevSocial = entity.hidden_black_box.social_battery_pct ?? 80.0;
    if (pers === 'PERS_EXTROVERT') {
      entity.hidden_black_box.social_battery_pct = clampStat100(prevSocial + 12.0);
    } else if (pers === 'PERS_INTROVERT' || hasAsd) {
      entity.hidden_black_box.social_battery_pct = clampStat100(prevSocial - 10.0);
    }
  }
  if (outcomes.organ_deltas) {
    applyOrganDeltas(entity, outcomes.organ_deltas as Partial<Record<keyof OrganStateMap, number>>);
  }
  if (typeof outcomes.ptsd_trauma_severity === 'number' && outcomes.ptsd_trauma_severity > 0) {
    entity.hidden_black_box.ptsd_trauma_score = clampStat100(
      entity.hidden_black_box.ptsd_trauma_score + outcomes.ptsd_trauma_severity * 0.5
    );
  }
  if (
    eventId === 'EVT_SCHOOL_ANNUAL_HEALTH_CHECKUP' ||
    outcomes.unlocks_biometrics_flag === true
  ) {
    entity.capability_flags.is_biometrics_decoded = true;
  }

  if (rawEvt.is_once_per_year_age) {
    entity.yearly_event_age_tracker[eventId] = Math.floor(
      entity.identity_biometrics.exact_age_years
    );
  }
  if (rawEvt.is_once_per_calendar_month) {
    entity.monthly_event_tracker[eventId] = `${currentYear}-${currentMonth}`;
  }

  return {
    ok: true,
    selected_choice_id: chosenObj.choice_id,
    outcome_summary_vi: translateVi(chosenObj.label_key),
    minutes_elapsed: elapsedMinutes,
    journal_entry_vi: outcomes.journal_log_entry_key
      ? translateVi(outcomes.journal_log_entry_key)
      : null,
    triggered_hospitalization: Boolean(outcomes.triggers_hospitalization),
    triggered_death_cause_vi: outcomes.triggers_instant_death_cause_key
      ? translateVi(outcomes.triggers_instant_death_cause_key)
      : null,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeBorrowItemFromNpcHousehold(
  player: HumanEntityState,
  npcsAtLocation: NpcPresenceAtLocation[],
  itemDefIdToBorrow: string,
  itemDisplayNameVi: string,
  minutesUntilNextCommitment: number
): ActionExecutionResult {
  const presentNpcs = npcsAtLocation.filter(
    (npc) => npc.current_location_id === player.current_location_id
  );

  if (presentNpcs.length === 0) {
    return {
      ok: false,
      message_vi: 'Cửa nhà khóa chặt, không có ai ở nhà lúc này nên không thể mượn đồ.',
      minutes_elapsed: 5,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const pushBorrowed = (): void => {
    const borrowed: OwnedInventoryItemInstance = {
      instance_id: `BORROWED_${Date.now()}`,
      item_def_id: itemDefIdToBorrow,
      display_name_key: itemDisplayNameVi,
      category: 'OTHER',
      usage_type: 'DURABLE_REUSABLE',
      size_class: 'PORTABLE_CARRY',
      weight_kg: 0.4,
      current_durability_pct: 90.0,
      max_durability_cap_pct: STAT_MAX_VALUE
    };
    player.inventory_items.push(borrowed);
  };

  const friendOwner = presentNpcs.find((n) => n.role_tag === 'FRIEND_OWNER');
  if (friendOwner) {
    if (friendOwner.bonding_score_with_player < 30.0) {
      return {
        ok: false,
        message_vi: `${friendOwner.full_name} còn ngại vì hai người chưa đủ thân để cho mượn ${itemDisplayNameVi}.`,
        minutes_elapsed: 5,
        cutscene_caption_vi: null,
        auto_save_trigger: 'ACTION_COMPLETED'
      };
    }
    pushBorrowed();
    // Mượn đồ thành công từ bạn: Hướng Ngoại tăng pin & vui vẻ, Hướng Nội tốn nhẹ năng lượng giao tiếp
    const prevSocial = player.hidden_black_box.social_battery_pct ?? 80.0;
    if (player.identity_biometrics.locked_personality === 'PERS_EXTROVERT') {
      player.hidden_black_box.social_battery_pct = clampStat100(prevSocial + 10.0);
      player.happiness_score = clampStat100(player.happiness_score + 3.0);
    } else if (player.identity_biometrics.locked_personality === 'PERS_INTROVERT') {
      player.hidden_black_box.social_battery_pct = clampStat100(prevSocial - 5.0);
    }
    return {
      ok: true,
      message_vi: `${friendOwner.full_name} vui vẻ lấy ${itemDisplayNameVi} đưa tận tay cho bạn mượn.`,
      minutes_elapsed: 10,
      cutscene_caption_vi: translateVi('ACT_STUDY_BOOK'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const mother = presentNpcs.find((n) => n.role_tag === 'FRIEND_MOTHER_RELATIVE');
  if (!mother) {
    return {
      ok: false,
      message_vi: 'Chủ nhân món đồ hiện không có mặt tại đây.',
      minutes_elapsed: 5,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (mother.knows_where_item_is && mother.is_item_currently_at_home) {
    pushBorrowed();
    return {
      ok: true,
      message_vi: `Bác ${mother.full_name} biết chỗ cất nên vào phòng lấy ${itemDisplayNameVi} đưa bạn mượn ngay.`,
      minutes_elapsed: 15,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (!mother.knows_where_item_is && mother.is_item_currently_at_home) {
    pushBorrowed();
    return {
      ok: true,
      message_vi: `Bác ${mother.full_name} gọi điện hỏi con chỗ cất rồi tìm ${itemDisplayNameVi} đưa bạn mượn.`,
      minutes_elapsed: 20,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const waitMin =
    EcoLifeJsonDb.npcBrain.social_interaction_and_lending_rules.borrow_item_through_relative_rules
      .relative_present_owner_absent.branch_c_wait_for_owner_return.wait_duration_minutes;

  if (minutesUntilNextCommitment < waitMin) {
    return {
      ok: false,
      message_vi: `Bác ${mother.full_name} bảo phải đợi ${waitMin} phút con mới về. Sắp trễ giờ học/làm nên bạn đành chào bác ra về tay không.`,
      minutes_elapsed: 10,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  pushBorrowed();
  return {
    ok: true,
    message_vi: `Ngồi trò chuyện với bác ${mother.full_name} chờ ${waitMin} phút tới khi bạn về và mượn được ${itemDisplayNameVi}.`,
    minutes_elapsed: waitMin,
    cutscene_caption_vi: null,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export interface AutonomousBrainTickOutput {
  result: ActionExecutionResult;
  is_sleeping_action: boolean;
}

type UtilityCandidateId =
  | 'USE_TOILET'
  | 'TAKE_SHOWER'
  | 'SLEEP_DEEP'
  | 'EAT_MEAL'
  | 'STUDY_SCHOOL'
  | 'WORK_SHIFT'
  | 'WORK_PART_TIME'
  | 'SOCIAL_OUTING'
  | 'REST_SOLO_HOME';

interface UtilityCandidateOption {
  id: UtilityCandidateId;
  score: number;
}

/**
 * Bộ não tự hành AI_AUTONOMOUS nâng cấp lên Utility Scoring (Eco-Life V3.4):
 * - Giữ 3 chốt cứng bắt buộc: (1) Lú lẫn & Cấp cứu nội tạng < 25pt, (2) Lọc kỳ nghỉ hè T6-T7, (3) Lọc vùng khóa RURAL.
 * - Mọi hành động sinh hoạt / học tập / đi làm / giao lưu đều được chấm điểm Utility có tính Mệt mỏi thần kinh & Tính cách.
 */
export function runAutonomousBrainTick(
  entity: HumanEntityState,
  currentHour: number,
  currentWeather: WeatherCode,
  currentMonth: number,
  currentDateStr: string
): AutonomousBrainTickOutput {
  const age = entity.identity_biometrics.exact_age_years;
  const box = entity.hidden_black_box;
  const organs = box.organs;
  const personality = entity.identity_biometrics.locked_personality || 'PERS_AMBIVERT';
  const hasAsd = entity.identity_biometrics.innate_traits.includes('TRAIT_ASD');
  const isSchoolAge = age >= 6 && age <= 17;
  const isSummerVacation = currentMonth === 6 || currentMonth === 7;
  const socialBattery = typeof box.social_battery_pct === 'number' ? box.social_battery_pct : 80.0;

  // ==========================================================================
  // [CHỐT CỨNG 1A — LÚ LẪN TUỔI GIÀ]: Tuổi >= 65 & Não < 25 -> tự hành vô thức
  // ==========================================================================
  if (
    entity.capability_flags.is_dementia_autopilot ||
    (age >= 65 && organs.brain < 25.0)
  ) {
    entity.capability_flags.is_dementia_autopilot = true;
    entity.controller_mode = 'AI_AUTONOMOUS';
    const routines = EcoLifeJsonDb.agingEndgame.dementia_autopilot_rules.autopilot_routine_actions;
    const napRoutine =
      routines.find((r) => r.action_id === 'AUTO_NAP_BED') || routines[routines.length - 1];
    // Khi người cao tuổi lú lẫn quá mệt mỏi (năng lượng <= 35), ưu tiên cho nằm ngủ để tránh sập nguồn giả Karoshi
    const picked =
      box.energy_sleep_pct <= 35.0
        ? napRoutine
        : routines[Math.floor(Math.random() * routines.length)];
    const isAutoNap = picked.action_id === 'AUTO_NAP_BED';

    // Người nhà hỗ trợ chăm sóc cơ bản cho người cao tuổi lú lẫn để không bị chết đói/suy thận bất thường
    if (box.bladder_comfort_pct <= 40.0) {
      box.bladder_comfort_pct = 100.0;
    }
    if (box.satiety_pct <= 45.0 || picked.action_id === 'AUTO_EAT_SIMPLE') {
      box.satiety_pct = clampStat100(box.satiety_pct + 55.0);
    }
    // Người nhà hỗ trợ lau rửa & thay quần áo định kỳ để không tụt vệ sinh về 0 gây chết oan vì Da
    if (box.body_hygiene_pct <= 45.0) {
      box.body_hygiene_pct = 85.0;
    }
    if (isAutoNap) {
      box.energy_sleep_pct = clampStat100(box.energy_sleep_pct + 45.0);
    }
    return {
      is_sleeping_action: isAutoNap,
      result: {
        ok: true,
        message_vi: picked.log_key,
        minutes_elapsed: 120,
        cutscene_caption_vi: picked.log_key,
        auto_save_trigger: 'ACTION_COMPLETED'
      }
    };
  }

  // ==========================================================================
  // [CHỐT CỨNG 1B — CẤP CỨU SINH MẠNG]: Tạng < 25pt, đủ sức đi viện (>= 25 năng lượng) & đủ tiền
  // Mỗi ngày lịch chỉ khám/dùng thuốc Rx tối đa 1 lần để tránh AI đứng lì tại bệnh viện spam 100+ đơn thuốc
  // ==========================================================================
  const hasCriticalOrgan =
    organs.heart < 25 || organs.liver < 25 || organs.lungs < 25 || organs.brain < 25;
  const hasMedicalReport = entity.inventory_items.some(
    (item) => item.item_def_id === 'ITEM_MEDICAL_REPORT'
  );
  const alreadyTreatedToday = entity.monthly_event_tracker['AI_DAILY_HOSPITAL_VISIT'] === currentDateStr;

  if (
    hasCriticalOrgan &&
    !alreadyTreatedToday &&
    box.energy_sleep_pct >= 25.0 &&
    entity.cash_vnd >= 800000
  ) {
    if (entity.current_location_id !== 'LOC_HOSPITAL') {
      return {
        is_sleeping_action: false,
        result: executeTravelToLocationAction(entity, {
          target_location_id: 'LOC_HOSPITAL',
          transit_mode: entity.active_vehicle ? 'OWN_VEHICLE' : 'PUBLIC_BUS',
          current_hour: currentHour,
          current_weather: currentWeather
        })
      };
    }
    // Đánh dấu hôm nay đã tiếp nhận điều trị y tế để AI quay về sinh hoạt/nghỉ ngơi bình thường
    entity.monthly_event_tracker['AI_DAILY_HOSPITAL_VISIT'] = currentDateStr;
    // Đã có Bệnh án trong túi đồ -> mua & dùng thuốc Rx điều trị thật (+24 tạng yếu nhất)
    if (hasMedicalReport) {
      const rxRes = executeBuyAndUsePrescriptionRxAction(entity);
      if (rxRes.ok) {
        return { is_sleeping_action: false, result: rxRes };
      }
    }
    return {
      is_sleeping_action: false,
      result: executeHospitalFullExamAction(entity, currentDateStr)
    };
  }

  // ==========================================================================
  // [BƯỚC CHẤM ĐIỂM HỮU DỤNG — UTILITY AI SCORING]
  // ==========================================================================
  const cognitiveFatigue = computeDerivedCognitiveFatigue(
    asStat100(box.energy_sleep_pct),
    asHours(box.overuse_tracker.weekly_work_hours)
  );
  const isAtHome = entity.current_location_id === 'LOC_HOME';
  const isNightHours = currentHour >= 21 || currentHour <= 4;
  const candidates: UtilityCandidateOption[] = [];

  // [Ứng viên 1 — Đi vệ sinh]: Cấp thiết tăng mạnh theo bậc 2 khi bàng quang giảm dưới 45pt
  if (entity.current_location_id !== 'LOC_TRANSIT_ROAD' && box.bladder_comfort_pct < 45.0) {
    const bladderUrgency =
      115.0 * computeDeficitIntensity(asStat100(box.bladder_comfort_pct), asStat100(45.0), 1.5);
    candidates.push({
      id: 'USE_TOILET',
      score: computeActionUtilityScore({
        urgency_score: bladderUrgency,
        startup_cost: 3.0,
        cognitive_fatigue_pct: cognitiveFatigue
      })
    });
  }

  // [Ứng viên 2 — Tắm rửa tại nhà]: Chỉ khả dụng khi đang ở nhà và người bẩn (< 50pt)
  if (isAtHome && box.body_hygiene_pct < 50.0) {
    const hygieneUrgency =
      72.0 * computeDeficitIntensity(asStat100(box.body_hygiene_pct), asStat100(50.0), 1.5);
    candidates.push({
      id: 'TAKE_SHOWER',
      score: computeActionUtilityScore({
        urgency_score: hygieneUrgency,
        startup_cost: 12.0,
        cognitive_fatigue_pct: cognitiveFatigue,
        personality_affinity: personality === 'PERS_EMPATHETIC' ? 4.0 : 0.0
      })
    });
  }

  // [Ứng viên 3 — Ngủ giấc sâu]: Chi phí khởi động rất thấp -> thắng áp đảo khi kiệt sức & mệt mỏi thần kinh cao
  const sleepOnset = isNightHours ? 78.0 : 48.0;
  const sleepUrgency =
    112.0 * computeDeficitIntensity(asStat100(box.energy_sleep_pct), asStat100(sleepOnset), 1.4) +
    (isNightHours && box.energy_sleep_pct < 70.0 ? 18.0 : 0.0);
  let sleepAffinity = 0.0;
  if (personality === 'PERS_DAREDEVIL') sleepAffinity = -12.0; // Táo bạo hay cố thức khuya
  else if (personality === 'PERS_EXTROVERT') sleepAffinity = -5.0;
  else if (personality === 'PERS_INTROVERT' || personality === 'PERS_EMPATHETIC') {
    sleepAffinity = 4.0;
  }
  candidates.push({
    id: 'SLEEP_DEEP',
    score: computeActionUtilityScore({
      urgency_score: sleepUrgency,
      startup_cost: isAtHome ? 2.0 : 10.0,
      cognitive_fatigue_pct: cognitiveFatigue,
      personality_affinity: sleepAffinity
    })
  });

  // [Ứng viên 4 — Ăn uống]: Khi vừa đói nhẹ (45pt) vừa kiệt sức (15pt), startup_cost nấu ăn/mua đồ bị nhân (1 + fatigue/100)
  // khiến nhân vật ưu tiên đi ngủ trước thay vì máy móc lết đi nấu cơm
  const hungerUrgency =
    102.0 * computeDeficitIntensity(asStat100(box.satiety_pct), asStat100(55.0), 1.5);
  if (hungerUrgency > 0) {
    const eatStartupCost = isAtHome ? 16.0 : 20.0;
    candidates.push({
      id: 'EAT_MEAL',
      score: computeActionUtilityScore({
        urgency_score: hungerUrgency,
        startup_cost: eatStartupCost,
        cognitive_fatigue_pct: cognitiveFatigue
      })
    });
  }

  // [Ứng viên 5 — Đi học chính quy]: Chốt cứng 2 -> cấm đưa vào ứng viên trong kỳ nghỉ hè Tháng 6-7
  if (currentHour >= 7 && currentHour < 16 && isSchoolAge && !isSummerVacation) {
    const isAtSchool = entity.current_location_id.startsWith('LOC_SCHOOL_');
    candidates.push({
      id: 'STUDY_SCHOOL',
      score: computeActionUtilityScore({
        urgency_score: 68.0,
        startup_cost: isAtSchool ? 10.0 : 16.0,
        cognitive_fatigue_pct: cognitiveFatigue,
        personality_affinity: personality === 'PERS_DAREDEVIL' ? -6.0 : 4.0
      })
    });
  }

  // [Ứng viên 6 — Đi làm ca chính thức]: Độ tuổi lao động 18-59 trong khung giờ hành chính
  if (currentHour >= 7 && currentHour < 16 && age >= 18 && age < 60) {
    const moneyPressureBonus = entity.cash_vnd < 2000000 ? 18.0 : 0.0;
    const isAtWork = entity.current_location_id === 'LOC_WORK_SME';
    candidates.push({
      id: 'WORK_SHIFT',
      score: computeActionUtilityScore({
        urgency_score: 66.0 + moneyPressureBonus,
        startup_cost: isAtWork ? 12.0 : 18.0,
        cognitive_fatigue_pct: cognitiveFatigue,
        personality_affinity: personality === 'PERS_INTROVERT' || hasAsd ? 3.0 : 0.0
      })
    });
  }

  // [Ứng viên 7 — Việc làm Part-time cứu đói]: Dành cho học sinh >= 16t ngoài giờ học hoặc người cạn ngân sách (< 2 triệu)
  if (
    age >= 16 &&
    age <= 60 &&
    box.energy_sleep_pct >= 35.0 &&
    entity.cash_vnd < 2000000 &&
    ((currentHour >= 16 && currentHour <= 20) ||
      (isSchoolAge && isSummerVacation && currentHour >= 8 && currentHour < 16))
  ) {
    const povertyUrgency = 64.0 * (1.0 - Math.min(1.0, entity.cash_vnd / 2000000.0)) + 20.0;
    candidates.push({
      id: 'WORK_PART_TIME',
      score: computeActionUtilityScore({
        urgency_score: povertyUrgency,
        startup_cost: 16.0,
        cognitive_fatigue_pct: cognitiveFatigue
      })
    });
  }

  // [Ứng viên 8 — Ra ngoài giao lưu / dạo phố]: Hướng Ngoại tụt pin khi ở nhà lâu sẽ chủ động ra ngoài nạp pin xã hội
  if (currentHour >= 8 && currentHour <= 20 && currentWeather !== 'STORM_FLOOD') {
    const extrovertCraving =
      personality === 'PERS_EXTROVERT'
        ? 58.0 * computeDeficitIntensity(asStat100(socialBattery), asStat100(65.0), 1.3)
        : personality === 'PERS_DAREDEVIL'
          ? 34.0 * computeDeficitIntensity(asStat100(socialBattery), asStat100(55.0), 1.2)
          : 0.0;
    if (extrovertCraving > 5.0) {
      candidates.push({
        id: 'SOCIAL_OUTING',
        score: computeActionUtilityScore({
          urgency_score: extrovertCraving,
          startup_cost: 12.0,
          cognitive_fatigue_pct: cognitiveFatigue,
          personality_affinity: personality === 'PERS_INTROVERT' || hasAsd ? -25.0 : 8.0
        })
      });
    }
  }

  // [Ứng viên 9 — Nghỉ ngơi yên tĩnh một mình tại nhà]: Phương án nền luôn tồn tại, rất hấp dẫn khi Hướng nội/ASD cạn pin xã hội
  const soloRechargeUrgency =
    personality === 'PERS_INTROVERT' || hasAsd
      ? 24.0 + 52.0 * computeDeficitIntensity(asStat100(socialBattery), asStat100(60.0), 1.3)
      : 20.0;
  candidates.push({
    id: 'REST_SOLO_HOME',
    score: computeActionUtilityScore({
      urgency_score: soloRechargeUrgency,
      startup_cost: isAtHome ? 3.0 : 12.0,
      cognitive_fatigue_pct: cognitiveFatigue,
      personality_affinity: personality === 'PERS_EXTROVERT' ? -8.0 : 4.0
    })
  });

  // Chọn ứng viên có điểm Utility cao nhất (phẳng, không ngẫu nhiên rối)
  let bestCandidate = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].score > bestCandidate.score) {
      bestCandidate = candidates[i];
    }
  }

  // ==========================================================================
  // [THỰC THI HÀNH ĐỘNG ĐƯỢC UTILITY AI LỰA CHỌN]
  // ==========================================================================

  if (bestCandidate.id === 'USE_TOILET') {
    return { is_sleeping_action: false, result: executeToiletAction(entity) };
  }

  if (bestCandidate.id === 'TAKE_SHOWER') {
    entity.current_sub_node_id = 'HOME_BATHROOM';
    return { is_sleeping_action: false, result: executeShowerAction(entity) };
  }

  if (bestCandidate.id === 'EAT_MEAL') {
    const regionFoodMult =
      EcoLifeJsonDb.regions.region_types[entity.current_region].food_price_multiplier || 1.0;
    const streetFoodCost = age < 18 ? 0 : Math.round(35000 * regionFoodMult);
    // Nếu người lớn ở ngoài không đủ tiền mua đồ ăn -> quay về Nhà Riêng tự nấu ăn
    if (!isAtHome && entity.cash_vnd < streetFoodCost) {
      return {
        is_sleeping_action: false,
        result: executeTravelToLocationAction(entity, {
          target_location_id: 'LOC_HOME',
          target_sub_node_id: 'HOME_KITCHEN',
          transit_mode: 'WALK',
          current_hour: currentHour,
          current_weather: currentWeather
        })
      };
    }

    const eatMode = isAtHome ? 'HOME_COOKED' : 'STREET_FOOD';
    const eatRes = executeEatMealAction(entity, { mode: eatMode });
    if (eatRes.ok) {
      return { is_sleeping_action: false, result: eatRes };
    }
  }

  if (bestCandidate.id === 'SLEEP_DEEP') {
    if (!isAtHome) {
      return {
        is_sleeping_action: false,
        result: executeTravelToLocationAction(entity, {
          target_location_id: 'LOC_HOME',
          target_sub_node_id: 'HOME_BEDROOM',
          transit_mode: entity.active_vehicle ? 'OWN_VEHICLE' : 'WALK',
          current_hour: currentHour,
          current_weather: currentWeather
        })
      };
    }
    entity.current_sub_node_id = 'HOME_BEDROOM';
    const sleepRes = executeSleepOrNapAction(entity, 'ACT_SLEEP_STANDARD_7H');

    // Nếu học sinh 6-17t thức khuya dẫn đến ngủ nướng giữa giờ học trong năm học -> bị ba má la mắng
    if (isSchoolAge && !isSummerVacation && currentHour >= 7 && currentHour <= 14) {
      const confiscated = Math.min(entity.cash_vnd, 100000);
      entity.cash_vnd = Math.max(0, entity.cash_vnd - confiscated);
      entity.happiness_score = clampStat100(entity.happiness_score - 8.0);
      return {
        is_sleeping_action: true,
        result: {
          ...sleepRes,
          message_vi: `${sleepRes.message_vi} | Thức khuya ngủ nướng bỏ bê giờ lên lớp — bị ba má la mắng một trận nên thân!`,
          journal_entry_added_vi: 'Bị ba má la mắng vì thức khuya ngủ nướng trốn học.'
        }
      };
    }
    return { is_sleeping_action: true, result: sleepRes };
  }

  if (bestCandidate.id === 'STUDY_SCHOOL') {
    const targetSchool =
      age <= 10
        ? 'LOC_SCHOOL_PRIMARY'
        : age <= 14
          ? 'LOC_SCHOOL_SECONDARY'
          : 'LOC_SCHOOL_HIGHSCHOOL';
    if (entity.current_location_id !== targetSchool) {
      return {
        is_sleeping_action: false,
        result: executeTravelToLocationAction(entity, {
          target_location_id: targetSchool,
          transit_mode: 'WALK',
          current_hour: currentHour,
          current_weather: currentWeather
        })
      };
    }
    return {
      is_sleeping_action: false,
      result: executeStudyAtSchoolAction(entity, currentMonth)
    };
  }

  if (bestCandidate.id === 'WORK_SHIFT') {
    if (entity.current_location_id !== 'LOC_WORK_SME') {
      return {
        is_sleeping_action: false,
        result: executeTravelToLocationAction(entity, {
          target_location_id: 'LOC_WORK_SME',
          transit_mode: entity.active_vehicle ? 'OWN_VEHICLE' : 'PUBLIC_BUS',
          current_hour: currentHour,
          current_weather: currentWeather
        })
      };
    }
    return {
      is_sleeping_action: false,
      result: executeWorkShiftAction(entity, { shift_type: 'SHIFT_DAY', hours_worked: 4 })
    };
  }

  if (bestCandidate.id === 'WORK_PART_TIME') {
    const chosenGigId = age >= 17 && isAtHome ? 'PT_TUTOR_STUDENT' : 'PT_COMMUNITY_CLEANUP';
    const targetLoc = chosenGigId === 'PT_TUTOR_STUDENT' ? 'LOC_HOME' : 'LOC_SUPERMARKET_MARKET';

    if (entity.current_location_id !== targetLoc) {
      return {
        is_sleeping_action: false,
        result: executeTravelToLocationAction(entity, {
          target_location_id: targetLoc,
          transit_mode: 'WALK',
          current_hour: currentHour,
          current_weather: currentWeather
        })
      };
    }

    const ptRes = executePartTimeJobAction(entity, chosenGigId);
    if (ptRes.ok) {
      return { is_sleeping_action: false, result: ptRes };
    }
  }

  if (bestCandidate.id === 'SOCIAL_OUTING') {
    // LOC_SUPERMARKET_MARKET hợp lệ ở cả RURAL và URBAN (không vi phạm chốt khóa vùng miền)
    if (entity.current_location_id !== 'LOC_SUPERMARKET_MARKET') {
      return {
        is_sleeping_action: false,
        result: executeTravelToLocationAction(entity, {
          target_location_id: 'LOC_SUPERMARKET_MARKET',
          transit_mode: 'WALK',
          current_hour: currentHour,
          current_weather: currentWeather
        })
      };
    }
    box.social_battery_pct = clampStat100(socialBattery + 16.0);
    entity.happiness_score = clampStat100(entity.happiness_score + 4.0);
    return {
      is_sleeping_action: false,
      result: {
        ok: true,
        message_vi: `${entity.identity_biometrics.full_name} dạo quanh khu chợ trò chuyện rôm rả với hàng xóm để giải khuây.`,
        minutes_elapsed: 60,
        cutscene_caption_vi: translateVi('ACT_TRAVEL_ROAD'),
        auto_save_trigger: 'ACTION_COMPLETED'
      }
    };
  }

  // Mặc định: Nghỉ ngơi yên tĩnh một mình tại Nhà Riêng (hồi pin xã hội cho Hướng Nội / ASD)
  if (!isAtHome) {
    return {
      is_sleeping_action: false,
      result: executeTravelToLocationAction(entity, {
        target_location_id: 'LOC_HOME',
        target_sub_node_id: 'HOME_LIVING_ROOM',
        transit_mode: entity.active_vehicle ? 'OWN_VEHICLE' : 'WALK',
        current_hour: currentHour,
        current_weather: currentWeather
      })
    };
  }

  entity.current_sub_node_id = 'HOME_LIVING_ROOM';
  const hasTv = entity.owned_furniture.some((f) => f.furniture_id === 'FURN_SMART_TV_SOFA_SET');
  if (hasTv) {
    return {
      is_sleeping_action: false,
      result: executeInteractWithFurnitureAction(
        entity,
        'FURN_SMART_TV_SOFA_SET',
        'ACT_WATCH_NEWS_WEATHER'
      )
    };
  }

  return {
    is_sleeping_action: false,
    result: {
      ok: true,
      message_vi: `${entity.identity_biometrics.full_name} đọc sách và nghỉ ngơi yên tĩnh một mình tại phòng khách.`,
      minutes_elapsed: 60,
      cutscene_caption_vi: translateVi('ACT_STUDY_BOOK'),
      auto_save_trigger: 'ACTION_COMPLETED'
    }
  };
}