// Bộ xử lý Sự kiện ngữ cảnh (bao gồm Sự kiện theo lịch năm/mùa vụ T1-T12 & ngày 05),
// Tương tác xã hội 3 chốt chặn (Mượn đồ qua người thân NPC)
// và Bộ não tự hành AI_AUTONOMOUS (dùng chung cho cả NPC và Người chơi khi về già bị lú lẫn brain < 25%).
// Phong cách: Phẳng, tuần tự if / else, chỉ dùng phép cộng/trừ/nhân/chia cơ bản.

import {
  EcoLifeJsonDb,
  translateVi
} from './jsonDatabaseLoader';
import type {
  HumanEntityState,
  OrganStateMap,
  OwnedInventoryItemInstance
} from './sensoryProjectionAdapter';
import {
  type ActionExecutionResult,
  clampNumber,
  executeBathroomHygieneAction,
  executeEatAndDrinkAction,
  executeInteractWithFurniture,
  executeMedicalVisit,
  executeSleepOrNapAction,
  executeTravelToLocation
} from './ecoLifeActionEngine';

// ============================================================================
// 1. INTERFACE ĐẦU VÀO & ĐẦU RA CHO HỆ THỐNG SỰ KIỆN & NPC
// ============================================================================

export type EnvironmentExposure = 'INDOOR' | 'OUTDOOR';

export interface EventTriggerContext {
  current_environment: EnvironmentExposure;
  current_weather: 'CLEAR' | 'RAIN' | 'STORM' | 'STORM_FLOOD' | 'HEATWAVE' | 'PM25_HIGH';
  current_day?: number;
  current_month?: number;
  current_year?: number;
  active_condition_flag:
    | 'IN_PUBERTY'
    | 'MENSTRUATING_NO_PAD'
    | 'PREGNANT'
    | 'DRUNK'
    | 'VEHICLE_BRAKE_DECAYED'
    | 'FUEL_EMPTY_STRANDED'
    | 'OPENED_BAG_WITHOUT_SMARTPHONE'
    | 'RENT_OVERDUE_WARNING'
    | null;
  years_of_experience?: number;
}

export interface EventChoiceRenderDto {
  choice_id: string;
  button_label_vi: string;
  is_default_timeout_penalty: boolean;
  is_dementia_habit_choice: boolean;
}

export interface ActiveEventPopupDto {
  event_id: string;
  category: 'CHILDHOOD_MILESTONE' | 'DAILY_GRAY' | 'OPPORTUNITY_GREEN' | 'DANGER_RED';
  ui_kind: 'daily' | 'chance' | 'danger';
  title_vi: string;
  narrative_body_vi: string;
  base_countdown_seconds: number;
  effective_countdown_seconds: number;
  ptsd_freeze_seconds: number;
  hide_choices_due_to_dementia: boolean;
  available_choices: EventChoiceRenderDto[];
  default_timeout_choice_id: string;
  auto_save_trigger: 'EVENT_TRIGGERED';
}

export interface EventResolutionResult {
  ok: boolean;
  selected_choice_id: string;
  outcome_summary_vi: string;
  minutes_elapsed: number;
  journal_entry_vi: string | null;
  triggered_hospitalization: boolean;
  triggered_death_cause_vi: string | null;
  auto_save_trigger: 'ACTION_COMPLETED';
}

export interface NpcPresenceAtLocation {
  npc_id: string;
  full_name: string;
  role_tag: 'FRIEND_OWNER' | 'FRIEND_MOTHER_RELATIVE' | 'NEIGHBOR' | 'COLLEAGUE';
  current_location_id: string;
  bonding_score_with_player: number;
  knows_where_item_is: boolean;
  is_item_currently_at_home: boolean;
}

// ============================================================================
// 2. HÀM QUAY & LỌC SỰ KIỆN NGỮ CẢNH (9 CHỐT CHẶN BAO GỒM LỊCH NĂM / THÁNG)
// ============================================================================

export function rollContextualEventForEntity(
  entity: HumanEntityState,
  context: EventTriggerContext
): ActiveEventPopupDto | null {
  const age = entity.identity_biometrics.exact_age_years;
  const candidateEvents: Array<any> = [];

  if (context.current_year && context.current_month) {
    (entity as any)._current_year_month_tag = `${context.current_year}-${context.current_month}`;
  }

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
      if (
        typeof bioTrig.min_sleep_debt_hours === 'number' &&
        entity.hidden_black_box.sleep_debt_hours < bioTrig.min_sleep_debt_hours
      ) {
        continue;
      }
    }

    if (rawEvt.is_once_per_year_age) {
      const currentFloorAge = Math.floor(age);
      const yearlyTracker: Record<string, number> =
        (entity as any)._yearly_event_age_tracker || {};
      const lastAgeForEvent =
        typeof yearlyTracker[rawEvt.event_id] === 'number'
          ? yearlyTracker[rawEvt.event_id]
          : 5;
      if (currentFloorAge <= lastAgeForEvent) {
        continue;
      }
    }

    if (rawEvt.is_once_per_calendar_month && context.current_month && context.current_year) {
      const monthKey = `${context.current_year}-${context.current_month}`;
      const monthlyTracker: Record<string, string> =
        (entity as any)._monthly_event_tracker || {};
      if (monthlyTracker[rawEvt.event_id] === monthKey) {
        continue;
      }
    }

    if (cond.schedule_trigger) {
      const sched = cond.schedule_trigger;
      if (
        Array.isArray(sched.allowed_months) &&
        sched.allowed_months.length > 0 &&
        typeof context.current_month === 'number'
      ) {
        if (!sched.allowed_months.includes(context.current_month)) {
          continue;
        }
      }

      if (
        typeof sched.exact_day_of_month === 'number' &&
        typeof context.current_day === 'number'
      ) {
        if (context.current_day !== sched.exact_day_of_month) {
          continue;
        }
      }

      if (sched.match_character_birthday === true) {
        const bDay = entity.identity_biometrics.birth_day;
        const bMonth = entity.identity_biometrics.birth_month;
        if (
          typeof bDay === 'number' &&
          typeof bMonth === 'number' &&
          typeof context.current_day === 'number' &&
          typeof context.current_month === 'number'
        ) {
          if (context.current_day !== bDay || context.current_month !== bMonth) {
            continue;
          }
        }
      }
    }

    candidateEvents.push(rawEvt);
  }

  if (candidateEvents.length === 0) {
    return null;
  }

  const scheduledCandidates = candidateEvents.filter(
    (e) => Boolean(e.trigger_conditions?.schedule_trigger)
  );
  const poolToPick = scheduledCandidates.length > 0 ? scheduledCandidates : candidateEvents;

  let totalWeight = 0;
  for (const evt of poolToPick) {
    totalWeight = totalWeight + (evt.base_weight || 50.0);
  }

  let rollValue = Math.random() * totalWeight;
  let chosenEvt = poolToPick[0];
  for (const evt of poolToPick) {
    rollValue = rollValue - (evt.base_weight || 50.0);
    if (rollValue <= 0) {
      chosenEvt = evt;
      break;
    }
  }

  return buildEventPopupDto(entity, chosenEvt, context.years_of_experience || 0);
}

export function buildEventPopupDto(
  entity: HumanEntityState,
  rawEvt: any,
  yearsExp: number = 0
): ActiveEventPopupDto {
  const baseSeconds =
    typeof rawEvt.presentation?.base_countdown_seconds === 'number'
      ? rawEvt.presentation.base_countdown_seconds
      : 10.0;

  const brainRatio = entity.hidden_black_box.organs.brain / 100.0;
  let effectiveSeconds = baseSeconds * (1.0 + yearsExp * 0.1) * brainRatio;

  let ptsdFreezeSeconds = 0;
  if (rawEvt.category === 'DANGER_RED' && entity.hidden_black_box.ptsd_trauma_score >= 30.0) {
    ptsdFreezeSeconds = 2.0;
    effectiveSeconds = effectiveSeconds - 2.0;
  }

  effectiveSeconds = clampNumber(effectiveSeconds, 3.0, 15.0);

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
        let hasAllTraits = true;
        for (const reqTrait of req.required_innate_traits) {
          if (!entity.identity_biometrics.innate_traits.includes(reqTrait)) {
            hasAllTraits = false;
            break;
          }
        }
        if (!hasAllTraits) {
          continue;
        }
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
  if (rawEvt.category === 'OPPORTUNITY_GREEN') uiKind = 'chance';

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
    effective_countdown_seconds: Math.round(effectiveSeconds * 10) / 10,
    ptsd_freeze_seconds: ptsdFreezeSeconds,
    hide_choices_due_to_dementia: isDementiaActive,
    available_choices: renderedChoices,
    default_timeout_choice_id: defaultTimeoutId,
    auto_save_trigger: 'EVENT_TRIGGERED'
  };
}

// ============================================================================
// 3. HÀM XỬ LÝ KẾT QUẢ KHI CHỌN ĐÁP ÁN SỰ KIỆN (HOẶC HẾT GIỜ TIMEOUT)
// ============================================================================

export function resolveEventChoice(
  entity: HumanEntityState,
  eventId: string,
  selectedChoiceId: string | null
): EventResolutionResult {
  const rawEvt = (EcoLifeJsonDb.allEvents as Array<any>).find((e) => e.event_id === eventId);
  if (!rawEvt) {
    return {
      ok: false,
      selected_choice_id: '',
      outcome_summary_vi: 'Không tìm thấy sự kiện cần xử lý.',
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
    entity.happiness_score = clampNumber(
      entity.happiness_score + outcomes.happiness_delta,
      0,
      100
    );
  }

  if (outcomes.organ_deltas) {
    const organKeys = Object.keys(outcomes.organ_deltas) as Array<keyof OrganStateMap>;
    for (const key of organKeys) {
      if (typeof entity.hidden_black_box.organs[key] === 'number') {
        entity.hidden_black_box.organs[key] = clampNumber(
          entity.hidden_black_box.organs[key] + outcomes.organ_deltas[key],
          0,
          100
        );
      }
    }
  }

  if (typeof outcomes.ptsd_trauma_severity === 'number' && outcomes.ptsd_trauma_severity > 0) {
    entity.hidden_black_box.ptsd_trauma_score = clampNumber(
      entity.hidden_black_box.ptsd_trauma_score + outcomes.ptsd_trauma_severity * 0.5,
      0,
      100
    );
  }

  if (
    eventId === 'EVT_SCHOOL_ANNUAL_HEALTH_CHECKUP' ||
    outcomes.unlocks_biometrics_flag === true
  ) {
    entity.capability_flags.is_biometrics_decoded = true;
  }

  if (rawEvt.is_once_per_year_age) {
    if (!(entity as any)._yearly_event_age_tracker) {
      (entity as any)._yearly_event_age_tracker = {};
    }
    (entity as any)._yearly_event_age_tracker[eventId] = Math.floor(
      entity.identity_biometrics.exact_age_years
    );
  }

  if (rawEvt.is_once_per_calendar_month) {
    if (!(entity as any)._monthly_event_tracker) {
      (entity as any)._monthly_event_tracker = {};
    }
    const nowTag = (entity as any)._current_year_month_tag || 'DEFAULT_MONTH';
    (entity as any)._monthly_event_tracker[eventId] = nowTag;
  }

  const journalVi = outcomes.journal_log_entry_key
    ? translateVi(outcomes.journal_log_entry_key)
    : null;

  const deathCauseVi = outcomes.triggers_instant_death_cause_key
    ? translateVi(outcomes.triggers_instant_death_cause_key)
    : null;

  return {
    ok: true,
    selected_choice_id: chosenObj.choice_id,
    outcome_summary_vi: translateVi(chosenObj.label_key),
    minutes_elapsed: elapsedMinutes,
    journal_entry_vi: journalVi,
    triggered_hospitalization: Boolean(outcomes.triggers_hospitalization),
    triggered_death_cause_vi: deathCauseVi,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

// ============================================================================
// 4. LUỒNG TƯƠNG TÁC XÃ HỘI LÊN CON NGƯỜI (3 CHỐT CHẶN: SANG NHÀ BẠN MƯỢN SÁCH)
// ============================================================================

export function executeBorrowItemFromNpcHousehold(
  player: HumanEntityState,
  npcsAtCurrentLocation: NpcPresenceAtLocation[],
  itemDefIdToBorrow: string,
  itemDisplayNameVi: string,
  minutesUntilPlayerNextShiftOrClass: number
): ActionExecutionResult {
  const presentNpcs = npcsAtCurrentLocation.filter(
    (npc) => npc.current_location_id === player.current_location_id
  );

  if (presentNpcs.length === 0) {
    return {
      ok: false,
      message_vi:
        'Cửa nhà khóa chặt, không có ai ở nhà lúc này nên bạn không thể hỏi mượn đồ được.',
      minutes_elapsed: 5,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const friendOwner = presentNpcs.find((npc) => npc.role_tag === 'FRIEND_OWNER');
  if (friendOwner) {
    if (friendOwner.bonding_score_with_player < 30.0) {
      return {
        ok: false,
        message_vi: `${friendOwner.full_name} còn ngại ngùng vì hai người chưa đủ thân thiết để cho mượn ${itemDisplayNameVi}.`,
        minutes_elapsed: 5,
        cutscene_caption_vi: null,
        auto_save_trigger: 'ACTION_COMPLETED'
      };
    }

    const borrowedItem: OwnedInventoryItemInstance = {
      instance_id: `BORROWED_${player.inventory_items.length + 1}`,
      item_def_id: itemDefIdToBorrow,
      display_name_key: itemDisplayNameVi,
      category: 'OTHER',
      usage_type: 'DURABLE_REUSABLE',
      weight_kg: 0.4,
      current_durability_pct: 90.0
    };
    player.inventory_items.push(borrowedItem);

    return {
      ok: true,
      message_vi: `${friendOwner.full_name} vui vẻ vào bàn học lấy ${itemDisplayNameVi} đưa tận tay cho bạn mượn.`,
      minutes_elapsed: 10,
      cutscene_caption_vi: translateVi('ACT_STUDY_BOOK'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const friendMother = presentNpcs.find((npc) => npc.role_tag === 'FRIEND_MOTHER_RELATIVE');
  if (!friendMother) {
    return {
      ok: false,
      message_vi: 'Chủ nhân món đồ không có mặt tại đây.',
      minutes_elapsed: 5,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (friendMother.knows_where_item_is && friendMother.is_item_currently_at_home) {
    const borrowedItem: OwnedInventoryItemInstance = {
      instance_id: `BORROWED_${player.inventory_items.length + 1}`,
      item_def_id: itemDefIdToBorrow,
      display_name_key: itemDisplayNameVi,
      category: 'OTHER',
      usage_type: 'DURABLE_REUSABLE',
      weight_kg: 0.4,
      current_durability_pct: 90.0
    };
    player.inventory_items.push(borrowedItem);

    return {
      ok: true,
      message_vi: `Bác ${friendMother.full_name} nhận ra bạn, liền vào phòng con tìm ${itemDisplayNameVi} đưa cho bạn mượn.`,
      minutes_elapsed: 15,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (!friendMother.knows_where_item_is && friendMother.is_item_currently_at_home) {
    const borrowedItem: OwnedInventoryItemInstance = {
      instance_id: `BORROWED_${player.inventory_items.length + 1}`,
      item_def_id: itemDefIdToBorrow,
      display_name_key: itemDisplayNameVi,
      category: 'OTHER',
      usage_type: 'DURABLE_REUSABLE',
      weight_kg: 0.4,
      current_durability_pct: 90.0
    };
    player.inventory_items.push(borrowedItem);

    return {
      ok: true,
      message_vi: `Bác ${friendMother.full_name} gọi điện hỏi con vị trí cất đồ rồi vào ngăn kéo lấy ${itemDisplayNameVi} đưa cho bạn.`,
      minutes_elapsed: 20,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const requiredWaitMinutes =
    EcoLifeJsonDb.npcBrain.social_interaction_and_lending_rules.borrow_item_through_relative_rules
      .relative_present_owner_absent.branch_c_wait_for_owner_return.wait_duration_minutes;

  if (minutesUntilPlayerNextShiftOrClass < requiredWaitMinutes) {
    return {
      ok: false,
      message_vi: `Bác ${friendMother.full_name} bảo con bác đang cầm ${itemDisplayNameVi} theo người, phải đợi ${requiredWaitMinutes} phút nữa mới về. Vì sắp trễ giờ học/làm nên bạn đành xin phép ra về tay không.`,
      minutes_elapsed: 10,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const borrowedItemAfterWait: OwnedInventoryItemInstance = {
    instance_id: `BORROWED_${player.inventory_items.length + 1}`,
    item_def_id: itemDefIdToBorrow,
    display_name_key: itemDisplayNameVi,
    category: 'OTHER',
    usage_type: 'DURABLE_REUSABLE',
    weight_kg: 0.4,
    current_durability_pct: 90.0
  };
  player.inventory_items.push(borrowedItemAfterWait);

  return {
    ok: true,
    message_vi: `Bạn ngồi uống nước trò chuyện với bác ${friendMother.full_name} chờ ${requiredWaitMinutes} phút cho tới khi bạn mình về và mượn được ${itemDisplayNameVi}.`,
    minutes_elapsed: requiredWaitMinutes,
    cutscene_caption_vi: null,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

// ============================================================================
// 5. BỘ NÃO TỰ HÀNH AI_AUTONOMOUS (KHÔNG GÁN CỨNG GIỜ NGỦ — NGỦ THEO BUỒN NGỦ & TÍNH CÁCH)
// ============================================================================

export function runAutonomousBrainTick(
  entity: HumanEntityState,
  currentHour: number,
  currentWeather: 'CLEAR' | 'RAIN' | 'STORM_FLOOD',
  currentMonth: number = 9
): ActionExecutionResult {
  if (
    entity.identity_biometrics.exact_age_years >=
      EcoLifeJsonDb.agingEndgame.dementia_autopilot_rules.trigger_min_age &&
    entity.hidden_black_box.organs.brain <
      EcoLifeJsonDb.agingEndgame.dementia_autopilot_rules.trigger_brain_health_below
  ) {
    entity.controller_mode = 'AI_AUTONOMOUS';
    entity.capability_flags.is_dementia_autopilot = true;

    const routines = EcoLifeJsonDb.agingEndgame.dementia_autopilot_rules.autopilot_routine_actions;
    const pickedRoutine = routines[Math.floor(Math.random() * routines.length)];

    if (pickedRoutine.action_id === 'AUTO_NAP_BED') {
      entity.hidden_black_box.sleep_debt_hours = clampNumber(
        entity.hidden_black_box.sleep_debt_hours - 2.0,
        0,
        100
      );
    }

    return {
      ok: true,
      message_vi: pickedRoutine.log_key,
      minutes_elapsed:
        EcoLifeJsonDb.agingEndgame.dementia_autopilot_rules.autopilot_tick_interval_minutes,
      cutscene_caption_vi: pickedRoutine.log_key,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const organs = entity.hidden_black_box.organs;
  const box = entity.hidden_black_box;
  const personality = entity.identity_biometrics.locked_personality || 'PERS_AMBIVERT';

  // [Ưu tiên 1: Cấp cứu nội tạng nguy kịch (< 25%) nếu đủ tiền]
  if (
    (organs.heart < 25.0 || organs.liver < 25.0 || organs.lungs < 25.0 || organs.brain < 25.0) &&
    entity.cash_vnd >= 800000
  ) {
    if (entity.current_location_id !== 'LOC_HOSPITAL') {
      return executeTravelToLocation(entity, 'LOC_HOSPITAL', currentHour, currentWeather, 2.0)
        .result;
    }
    return executeMedicalVisit(entity, 'HOSPITAL_FULL_EXAM', true);
  }

  // [Ưu tiên 2: Nhu cầu vệ sinh cấp bách (Đi tiểu bảo vệ Thận / Tắm rửa bảo vệ Da)]
  if (box.bladder_urgency_pct >= 75.0) {
    return executeBathroomHygieneAction(entity, 'USE_TOILET');
  }
  if (box.body_hygiene_pct <= 40.0 && entity.current_location_id === 'LOC_HOME') {
    entity.current_sub_node_id = 'HOME_BATHROOM';
    return executeBathroomHygieneAction(entity, 'TAKE_SHOWER');
  }

  // [Ưu tiên 3: Ngủ theo áp lực buồn ngủ thật & tính cách — KHÔNG gán cứng 22h/23h]
  // Người Cẩn trọng/Hướng nội ngủ sau 16h thức; Trung hòa sau 18h; Táo bạo/Hướng ngoại hay thức trắng đêm 26-34h
  let personalSleepThresholdHours = 18.0;
  if (personality === 'PERS_EMPATHETIC' || personality === 'PERS_INTROVERT') {
    personalSleepThresholdHours = 16.0;
  } else if (personality === 'PERS_DAREDEVIL') {
    personalSleepThresholdHours = 30.0;
  } else if (personality === 'PERS_EXTROVERT') {
    personalSleepThresholdHours = 24.0;
  }

  if (
    box.hours_awake_continuous >= personalSleepThresholdHours ||
    box.sleep_debt_hours >= 14.0
  ) {
    if (entity.current_location_id !== 'LOC_HOME') {
      return executeTravelToLocation(entity, 'LOC_HOME', currentHour, currentWeather, 2.0).result;
    }
    entity.current_sub_node_id = 'HOME_BEDROOM';
    return executeSleepOrNapAction(entity, 'ACT_SLEEP_STANDARD_7H');
  }

  // [Ưu tiên 4: Nhu cầu ăn uống khi đói (>= 5 tiếng chưa ăn)]
  if (box.hours_since_last_meal >= 5.0) {
    if (entity.current_location_id === 'LOC_HOME') {
      entity.current_sub_node_id = 'HOME_KITCHEN';
      const homeEatRes = executeEatAndDrinkAction(entity, 'HOME_COOKED');
      if (homeEatRes.ok) {
        return homeEatRes;
      }
    } else {
      const streetEatRes = executeEatAndDrinkAction(entity, 'STREET_FOOD');
      if (streetEatRes.ok) {
        return streetEatRes;
      }
    }
  }

  // [Ưu tiên 5: Trong khung giờ hành chính (08:00 - 17:00), đi học (Tháng 8 -> Tháng 5) hoặc đi làm]
  if (currentHour >= 8 && currentHour < 17) {
    const age = entity.identity_biometrics.exact_age_years;
    const isSummerVacationMonth = currentMonth === 6 || currentMonth === 7;
    if (age >= 6 && age <= 17 && !isSummerVacationMonth) {
      const targetSchool =
        age <= 10
          ? 'LOC_SCHOOL_PRIMARY'
          : age <= 14
            ? 'LOC_SCHOOL_SECONDARY'
            : 'LOC_SCHOOL_HIGHSCHOOL';
      if (entity.current_location_id !== targetSchool) {
        return executeTravelToLocation(entity, targetSchool, currentHour, currentWeather, 2.0)
          .result;
      }
      box.hours_awake_continuous = box.hours_awake_continuous + 1.0;
      return {
        ok: true,
        message_vi: `${entity.identity_biometrics.full_name} đang ngồi học chăm chú trên lớp.`,
        minutes_elapsed: 60,
        cutscene_caption_vi: translateVi('ACT_STUDY_BOOK'),
        auto_save_trigger: 'ACTION_COMPLETED'
      };
    }

    if (age >= 18 && age < 60) {
      if (entity.current_location_id !== 'LOC_WORK_SME') {
        return executeTravelToLocation(entity, 'LOC_WORK_SME', currentHour, currentWeather, 2.0)
          .result;
      }
      entity.cash_vnd = entity.cash_vnd + 350000;
      box.hours_awake_continuous = box.hours_awake_continuous + 4.0;
      return {
        ok: true,
        message_vi: `${entity.identity_biometrics.full_name} hoàn thành ca làm việc và nhận tiền công.`,
        minutes_elapsed: 240,
        cutscene_caption_vi: translateVi('ACT_WORK_SHIFT'),
        auto_save_trigger: 'ACTION_COMPLETED'
      };
    }
  }

  // [Ưu tiên 6: Ngoài giờ hành chính (bao gồm buổi tối & khuya nếu chưa buồn ngủ)]
  if (
    (personality === 'PERS_DAREDEVIL' || personality === 'PERS_EXTROVERT') &&
    entity.identity_biometrics.exact_age_years >= 18 &&
    entity.identity_biometrics.exact_age_years < 60 &&
    currentHour >= 18 &&
    currentHour <= 23
  ) {
    entity.cash_vnd = entity.cash_vnd + 150000;
    box.hours_awake_continuous = box.hours_awake_continuous + 2.0;
    organs.brain = clampNumber(organs.brain - 1.0, 0, 100);
    return {
      ok: true,
      message_vi: `${entity.identity_biometrics.full_name} thức đêm nhận thêm việc làm ngoài giờ (+150.000đ).`,
      minutes_elapsed: 120,
      cutscene_caption_vi: translateVi('ACT_WORK_SHIFT'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (entity.current_location_id !== 'LOC_HOME') {
    return executeTravelToLocation(entity, 'LOC_HOME', currentHour, currentWeather, 2.0).result;
  }

  entity.current_sub_node_id = 'HOME_LIVING_ROOM';
  const hasTvSofa = entity.owned_furniture.some(
    (f) => f.furniture_id === 'FURN_SMART_TV_SOFA_SET'
  );
  if (hasTvSofa) {
    return executeInteractWithFurniture(
      entity,
      'FURN_SMART_TV_SOFA_SET',
      'ACT_WATCH_NEWS_WEATHER'
    );
  }

  if (
    currentHour >= 12 &&
    currentHour <= 14 &&
    box.naps_taken_since_full_sleep === 0
  ) {
    return executeSleepOrNapAction(entity, 'ACT_NAP_SHORT_20M');
  }

  box.hours_awake_continuous = box.hours_awake_continuous + 1.0;
  return {
    ok: true,
    message_vi: `${entity.identity_biometrics.full_name} thức đọc sách và thư giãn tại phòng khách.`,
    minutes_elapsed: 60,
    cutscene_caption_vi: translateVi('ACT_STUDY_BOOK'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}