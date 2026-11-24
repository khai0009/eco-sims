// [ENGINE TRUNG TÂM — ECO-LIFE CENTRAL ENGINE V3.3]
// Điểm giao tiếp duy nhất cho Frontend, NPC và Bộ Kiểm Thử Quần Thể.
// Đồng bộ 100% kiểu trả về AutonomousBrainTickOutput và truyền cờ `is_sleeping_period` xuống đồng hồ sinh học.

import { translateVi } from './jsonDatabaseLoader';
import type {
  ActionExecutionResult,
  ActiveEventPopupDto,
  AutoSaveTriggerReason,
  CleanMenuAvailableAction,
  EcoLifeSavedSessionState,
  EventTriggerContext,
  FrontendDeathAndMemoirDto,
  FrontendHudProjection,
  NpcPresenceAtLocation,
  PartQualityTier,
  RegionCode
} from './engineTypes';

import {
  type BiologyTickOptions,
  createInitialHumanEntity,
  evaluateDeathCondition,
  lockChildhoodPersonalityAtAgeSix,
  tickBiologyAndOrgansByMinutes
} from './modules/organAndBiologyModule';
import {
  type EatMealInput,
  executeEatMealAction,
  executeHousekeepingAction,
  executeInteractWithFurnitureAction,
  executeShowerAction,
  executeSleepOrNapAction,
  executeToiletAction
} from './modules/dailyLivingModule';
import {
  type StoreCatalogItemInput,
  executePurchaseHomeFurnitureAction,
  executePurchaseItemAction,
  executeRepairEquipmentAction
} from './modules/shoppingAndInventoryModule';
import {
  type TransitModeChoice,
  type VehiclePartKey,
  executeRefuelVehicleAction,
  executeRepairVehiclePartAction,
  executeTravelToLocationAction
} from './modules/transitAndVehicleModule';
import {
  executeBuyAndUsePrescriptionRxAction,
  executeHospitalAddictionRehabAction,
  executeHospitalFullExamAction,
  executePharmacyOtcAction
} from './modules/medicalAndHealthModule';
import {
  type BankOrNotaryInput,
  type WorkShiftInput,
  executeBankOrNotaryAction,
  executeRegionMigrationAction,
  executeStudyAtSchoolAction,
  executeWorkShiftAction
} from './modules/careerAndFinanceModule';
import {
  executeBorrowItemFromNpcHousehold,
  resolveEventChoice,
  rollContextualEventForEntity,
  runAutonomousBrainTick
} from './modules/eventAndSocialModule';
import {
  buildDeathAndMemoirSummary,
  projectHumanEntityToFrontendHud,
  resolveActionStatIndicators
} from './modules/sensoryAndMemoirModule';
import {
  deleteSavedProfile,
  listAllSavedProfiles,
  loadSavedEcoLifeSession,
  saveGameSessionImmediately
} from './modules/saveAndAntiScumModule';

export type { CleanMenuAvailableAction };

// ============================================================================
// 1. INTERFACE ĐẦU VÀO (LỆNH ĐIỀU PHỐI) & ĐẦU RA (PHẢN HỒI ENGINE TRUNG TÂM)
// ============================================================================

export type CentralEngineCommand =
  | { type: 'LOCK_CHILDHOOD_PERSONALITY'; votes: Array<'A' | 'B' | 'C' | 'D'> }
  | { type: 'SWITCH_HOME_ROOM'; sub_node_id: string }
  | { type: 'EAT_MEAL'; input: EatMealInput }
  | { type: 'SLEEP_OR_NAP'; sleep_action_id: string }
  | { type: 'USE_TOILET' }
  | { type: 'TAKE_SHOWER' }
  | { type: 'CLEAN_HOUSE' }
  | { type: 'INTERACT_FURNITURE'; furniture_id: string; action_id: string }
  | { type: 'BUY_ITEM'; item_def: StoreCatalogItemInput }
  | { type: 'BUY_FURNITURE'; furniture_id: string }
  | { type: 'REPAIR_EQUIPMENT'; target_kind: 'HOME_FURNITURE' | 'INVENTORY_ITEM'; instance_id: string }
  | {
      type: 'TRAVEL_TO_LOCATION';
      target_location_id: string;
      target_sub_node_id?: string;
      transit_mode: TransitModeChoice;
    }
  | { type: 'REFUEL_VEHICLE'; option: 'REFUEL_50K' | 'REFUEL_FULL_TANK' }
  | { type: 'REPAIR_VEHICLE_PART'; part_key: VehiclePartKey; quality_tier: PartQualityTier }
  | { type: 'PHARMACY_OTC'; otc_mode: 'PAINKILLER' | 'SYMPTOM_GUESS_OTC' }
  | { type: 'HOSPITAL_FULL_EXAM' }
  | { type: 'BUY_USE_RX_MEDICINE' }
  | { type: 'HOSPITAL_REHAB' }
  | { type: 'WORK_SHIFT'; input: WorkShiftInput }
  | { type: 'STUDY_SCHOOL' }
  | { type: 'BANK_OR_NOTARY'; input: BankOrNotaryInput }
  | { type: 'MIGRATE_REGION'; target_region: RegionCode }
  | {
      type: 'BORROW_FROM_NPC';
      npcs_at_location: NpcPresenceAtLocation[];
      item_def_id: string;
      item_name_vi: string;
      minutes_until_next_commitment: number;
    }
  | { type: 'SUBMIT_EVENT_CHOICE'; selected_choice_id: string | null }
  | { type: 'APP_EXIT_SUSPEND' };

export interface CentralEngineResponse {
  ok: boolean;
  action_result: ActionExecutionResult;
  hud: FrontendHudProjection;
  active_popup: ActiveEventPopupDto | null;
  death_summary: FrontendDeathAndMemoirDto | null;
  auto_saved_reason: AutoSaveTriggerReason | null;
}

// ============================================================================
// 2. ĐỒNG HỒ LỊCH & TUẦN HOÀN SINH HỌC DÙNG CHUNG (PLAYER & NPC)
// ============================================================================

export function formatSessionDateVi(session: EcoLifeSavedSessionState): string {
  const dd = String(session.clock.current_day).padStart(2, '0');
  const mm = String(session.clock.current_month).padStart(2, '0');
  return `${dd}/${mm}/${session.clock.current_year}`;
}

export function advanceCentralClockAndBiology(
  session: EcoLifeSavedSessionState,
  minutesToAdd: number,
  options?: BiologyTickOptions
): void {
  // Không cộng thời gian khi số phút không dương hoặc nhân vật đã qua đời
  if (minutesToAdd <= 0 || session.death_summary?.is_deceased) {
    return;
  }

  const prevTotalDays = session.clock.total_days_elapsed;
  const totalMinutes = session.clock.current_minute + minutesToAdd;
  const hoursAdded = Math.floor(totalMinutes / 60);
  session.clock.current_minute = totalMinutes % 60;

  const nextHour = session.clock.current_hour + hoursAdded;
  const daysAdded = Math.floor(nextHour / 24);
  session.clock.current_hour = nextHour % 24;
  session.clock.total_days_elapsed = prevTotalDays + daysAdded;

  let yearsAgedUp = 0;

  // Khi đồng hồ bước qua ngày mới: cập nhật ngày/tháng/năm lịch và tính lại tuổi thực tế
  if (daysAdded > 0) {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let d = session.clock.current_day + daysAdded;
    let m = session.clock.current_month;
    let y = session.clock.current_year;

    while (d > daysInMonth[m - 1]) {
      d = d - daysInMonth[m - 1];
      m = m + 1;
      if (m > 12) {
        m = 1;
        y = y + 1;
      }
    }

    session.clock.current_day = d;
    session.clock.current_month = m;
    session.clock.current_year = y;

    const bio = session.player.identity_biometrics;
    const prevAge = Math.floor(bio.exact_age_years);
    const passedBirthday = m > bio.birth_month || (m === bio.birth_month && d >= bio.birth_day);
    const computedAge = Math.max(0, y - bio.birth_year - (passedBirthday ? 0 : 1));
    bio.exact_age_years = computedAge;
    yearsAgedUp = Math.max(0, computedAge - prevAge);
  }

  const didCrossNewWeek =
    Math.floor(session.clock.total_days_elapsed / 7) > Math.floor(prevTotalDays / 7);

  // Truyền tiếp cờ is_sleeping_period xuống hạt nhân sinh học để không trừ ngược nhu cầu khi ngủ
  const bioTick = tickBiologyAndOrgansByMinutes(
    session.player,
    minutesToAdd,
    daysAdded,
    didCrossNewWeek,
    yearsAgedUp,
    options
  );

  if (bioTick.collapse_journal_log_vi) {
    session.journal_logs.push({
      age_recorded: Math.floor(session.player.identity_biometrics.exact_age_years),
      date_str_vi: formatSessionDateVi(session),
      text_vi: bioTick.collapse_journal_log_vi
    });
  }

  if (bioTick.did_enter_dementia_autopilot) {
    session.journal_logs.push({
      age_recorded: Math.floor(session.player.identity_biometrics.exact_age_years),
      date_str_vi: formatSessionDateVi(session),
      text_vi: 'Trí nhớ tuổi già bắt đầu mờ nhạt, sinh hoạt hằng ngày dần đi theo thói quen vô thức.'
    });
  }

  // Nếu nhân vật kiệt sức ngất xỉu tại chỗ -> cộng thêm thời gian hôn mê (6 tiếng) vào đồng hồ
  if (bioTick.extra_collapse_minutes > 0) {
    const collapseMins = session.clock.current_minute + bioTick.extra_collapse_minutes;
    const collapseHrs = Math.floor(collapseMins / 60);
    session.clock.current_minute = collapseMins % 60;
    session.clock.current_hour = (session.clock.current_hour + collapseHrs) % 24;
  }
}

// ============================================================================
// 3. KHỞI TẠO & KHÔI PHỤC PHIÊN CHƠI CHỐNG GIAN LẬN
// ============================================================================

export function createNewCentralSession(params: {
  profileId: string;
  birthYear: number;
  controllerMode?: 'PLAYER_CONTROLLED' | 'AI_AUTONOMOUS';
}): {
  session: EcoLifeSavedSessionState;
  hud: FrontendHudProjection;
} {
  const player = createInitialHumanEntity({
    entityId: `ENTITY_${params.profileId}`,
    birthYear: params.birthYear,
    controllerMode: params.controllerMode || 'PLAYER_CONTROLLED'
  });

  const bio = player.identity_biometrics;
  const birthDateStr = `${String(bio.birth_day).padStart(2, '0')}/${String(bio.birth_month).padStart(
    2,
    '0'
  )}/${bio.birth_year}`;

  const session: EcoLifeSavedSessionState = {
    save_version: '3.3.0',
    profile_id: params.profileId,
    last_saved_unix_ms: Date.now(),
    last_save_reason: 'ACTION_COMPLETED',
    clock: {
      total_days_elapsed: 0,
      current_day: bio.birth_day,
      current_month: bio.birth_month,
      current_year: bio.birth_year,
      current_hour: 7,
      current_minute: 30,
      current_weather: 'CLEAR'
    },
    player,
    pending_popup_event_id: null,
    journal_logs: [
      {
        age_recorded: 0,
        date_str_vi: birthDateStr,
        text_vi: `${bio.full_name} (${bio.gender === 'MALE' ? 'Nam' : 'Nữ'}) chào đời tại ${translateVi(
          player.current_region === 'RURAL' ? 'region_rural_name' : 'region_urban_name'
        )} trong một gia đình tầng lớp ${bio.family_tier}.`
      }
    ],
    will_lines: [],
    death_summary: null
  };

  saveGameSessionImmediately(session, 'ACTION_COMPLETED');
  const hud = projectHumanEntityToFrontendHud(
    session.player,
    session.clock.current_hour,
    session.clock.current_minute
  );
  return { session, hud };
}

export function restoreCentralSession(profileId?: string): {
  session: EcoLifeSavedSessionState | null;
  hud: FrontendHudProjection | null;
  restoredPopup: ActiveEventPopupDto | null;
} {
  const { session, restoredPopup } = loadSavedEcoLifeSession(profileId);
  if (!session) {
    return { session: null, hud: null, restoredPopup: null };
  }
  const hud = projectHumanEntityToFrontendHud(
    session.player,
    session.clock.current_hour,
    session.clock.current_minute
  );
  return { session, hud, restoredPopup };
}

// ============================================================================
// 4. BỘ ĐIỀU PHỐI LỆNH TRUNG TÂM (DISPATCHER DUY NHẤT)
// ============================================================================

export function dispatchCentralEngineCommand(
  session: EcoLifeSavedSessionState,
  command: CentralEngineCommand
): CentralEngineResponse {
  // Chốt 1: Nếu cuộc đời đã kết thúc, khóa toàn bộ thao tác
  if (session.death_summary?.is_deceased) {
    return {
      ok: false,
      action_result: {
        ok: false,
        message_vi: 'Cuộc đời này đã khép lại.',
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      },
      hud: projectHumanEntityToFrontendHud(
        session.player,
        session.clock.current_hour,
        session.clock.current_minute
      ),
      active_popup: null,
      death_summary: session.death_summary,
      auto_saved_reason: null
    };
  }

  // Chốt 2: Lưu khẩn cấp ngay khi người chơi tắt tab hoặc đóng cửa sổ Desktop
  if (command.type === 'APP_EXIT_SUSPEND') {
    saveGameSessionImmediately(session, 'APP_EXIT_SUSPEND');
    return {
      ok: true,
      action_result: {
        ok: true,
        message_vi: 'Đã lưu trạng thái trước khi thoát ứng dụng.',
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: 'APP_EXIT_SUSPEND'
      },
      hud: projectHumanEntityToFrontendHud(
        session.player,
        session.clock.current_hour,
        session.clock.current_minute
      ),
      active_popup: null,
      death_summary: null,
      auto_saved_reason: 'APP_EXIT_SUSPEND'
    };
  }

  // Chốt 3: Đang có Popup sự kiện treo -> bắt buộc xử lý sự kiện trước, chống bỏ qua
  if (session.pending_popup_event_id && command.type !== 'SUBMIT_EVENT_CHOICE') {
    return {
      ok: false,
      action_result: {
        ok: false,
        message_vi: 'Đang có sự kiện khẩn cấp cần xử lý trước khi làm việc khác.',
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      },
      hud: projectHumanEntityToFrontendHud(
        session.player,
        session.clock.current_hour,
        session.clock.current_minute
      ),
      active_popup: null,
      death_summary: null,
      auto_saved_reason: null
    };
  }

  // Chốt 4: Khi nhân vật tuổi già bị lú lẫn tự hành -> khóa thao tác bấm tay chủ động
  if (
    session.player.capability_flags.is_dementia_autopilot &&
    command.type !== 'SUBMIT_EVENT_CHOICE'
  ) {
    return {
      ok: false,
      action_result: {
        ok: false,
        message_vi: 'Nhân vật đang trong trạng thái suy giảm trí nhớ tuổi già, tự sinh hoạt vô thức.',
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      },
      hud: projectHumanEntityToFrontendHud(
        session.player,
        session.clock.current_hour,
        session.clock.current_minute
      ),
      active_popup: null,
      death_summary: null,
      auto_saved_reason: null
    };
  }

  let execResult: ActionExecutionResult;
  let instantDeathFromEventVi: string | null = null;
  let isSleepingAction = false;
  const player = session.player;
  const dateStr = formatSessionDateVi(session);

  if (command.type === 'LOCK_CHILDHOOD_PERSONALITY') {
    const locked = lockChildhoodPersonalityAtAgeSix(player, command.votes);
    session.clock.current_year = player.identity_biometrics.birth_year + 6;
    execResult = {
      ok: true,
      message_vi: 'Tròn 6 tuổi, bắt đầu mở khóa đồng hồ thời gian thực và đi học Tiểu học.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED',
      journal_entry_added_vi: `Tròn 6 tuổi, hoàn thành 5 cột mốc đầu đời với thiên hướng tính cách: ${translateVi(locked)}.`
    };
  } else if (command.type === 'SWITCH_HOME_ROOM') {
    if (player.current_location_id !== 'LOC_HOME') {
      execResult = {
        ok: false,
        message_vi: translateVi('err_location_mismatch'),
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    } else {
      player.current_sub_node_id = command.sub_node_id;
      execResult = {
        ok: true,
        message_vi: `Di chuyển sang ${translateVi(command.sub_node_id)}.`,
        minutes_elapsed: 1,
        cutscene_caption_vi: null,
        auto_save_trigger: 'ACTION_COMPLETED'
      };
    }
  } else if (command.type === 'EAT_MEAL') {
    execResult = executeEatMealAction(player, command.input);
  } else if (command.type === 'SLEEP_OR_NAP') {
    execResult = executeSleepOrNapAction(player, command.sleep_action_id);
    isSleepingAction = execResult.ok;
  } else if (command.type === 'USE_TOILET') {
    execResult = executeToiletAction(player);
  } else if (command.type === 'TAKE_SHOWER') {
    execResult = executeShowerAction(player);
  } else if (command.type === 'CLEAN_HOUSE') {
    execResult = executeHousekeepingAction(player);
  } else if (command.type === 'INTERACT_FURNITURE') {
    execResult = executeInteractWithFurnitureAction(player, command.furniture_id, command.action_id);
  } else if (command.type === 'BUY_ITEM') {
    execResult = executePurchaseItemAction(player, command.item_def);
  } else if (command.type === 'BUY_FURNITURE') {
    execResult = executePurchaseHomeFurnitureAction(player, command.furniture_id);
  } else if (command.type === 'REPAIR_EQUIPMENT') {
    execResult = executeRepairEquipmentAction(player, command.target_kind, command.instance_id);
  } else if (command.type === 'TRAVEL_TO_LOCATION') {
    execResult = executeTravelToLocationAction(player, {
      target_location_id: command.target_location_id,
      target_sub_node_id: command.target_sub_node_id,
      transit_mode: command.transit_mode,
      current_hour: session.clock.current_hour,
      current_weather: session.clock.current_weather
    });
  } else if (command.type === 'REFUEL_VEHICLE') {
    execResult = executeRefuelVehicleAction(player, command.option);
  } else if (command.type === 'REPAIR_VEHICLE_PART') {
    execResult = executeRepairVehiclePartAction(player, command.part_key, command.quality_tier);
  } else if (command.type === 'PHARMACY_OTC') {
    execResult = executePharmacyOtcAction(player, command.otc_mode);
  } else if (command.type === 'HOSPITAL_FULL_EXAM') {
    execResult = executeHospitalFullExamAction(player, dateStr);
  } else if (command.type === 'BUY_USE_RX_MEDICINE') {
    execResult = executeBuyAndUsePrescriptionRxAction(player);
  } else if (command.type === 'HOSPITAL_REHAB') {
    execResult = executeHospitalAddictionRehabAction(player);
  } else if (command.type === 'WORK_SHIFT') {
    execResult = executeWorkShiftAction(player, command.input);
  } else if (command.type === 'STUDY_SCHOOL') {
    execResult = executeStudyAtSchoolAction(player, session.clock.current_month);
  } else if (command.type === 'BANK_OR_NOTARY') {
    execResult = executeBankOrNotaryAction(player, command.input, session.will_lines);
  } else if (command.type === 'MIGRATE_REGION') {
    execResult = executeRegionMigrationAction(player, command.target_region);
  } else if (command.type === 'BORROW_FROM_NPC') {
    execResult = executeBorrowItemFromNpcHousehold(
      player,
      command.npcs_at_location,
      command.item_def_id,
      command.item_name_vi,
      command.minutes_until_next_commitment
    );
  } else {
    const activeEvtId = session.pending_popup_event_id || '';
    const evtRes = resolveEventChoice(
      player,
      activeEvtId,
      command.selected_choice_id,
      session.clock.current_year,
      session.clock.current_month
    );
    session.pending_popup_event_id = null;
    instantDeathFromEventVi = evtRes.triggered_death_cause_vi;
    execResult = {
      ok: evtRes.ok,
      message_vi: evtRes.outcome_summary_vi,
      minutes_elapsed: evtRes.minutes_elapsed,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED',
      journal_entry_added_vi: evtRes.journal_entry_vi
    };
  }

  if (execResult.journal_entry_added_vi) {
    session.journal_logs.push({
      age_recorded: Math.floor(player.identity_biometrics.exact_age_years),
      date_str_vi: dateStr,
      text_vi: execResult.journal_entry_added_vi
    });
  }

  if (execResult.ok && execResult.minutes_elapsed > 0) {
    advanceCentralClockAndBiology(session, execResult.minutes_elapsed, {
      is_sleeping_period: isSleepingAction
    });
  }

  const deathCheck = evaluateDeathCondition(player, instantDeathFromEventVi);
  if (deathCheck.is_dead && deathCheck.cause_label_vi) {
    session.death_summary = buildDeathAndMemoirSummary(
      session,
      deathCheck.cause_label_vi,
      deathCheck.epitaph_vi
    );
  }

  let savedReason: AutoSaveTriggerReason | null = null;
  if (execResult.auto_save_trigger) {
    saveGameSessionImmediately(session, execResult.auto_save_trigger);
    savedReason = execResult.auto_save_trigger;
  }

  const hud = projectHumanEntityToFrontendHud(
    player,
    session.clock.current_hour,
    session.clock.current_minute
  );

  return {
    ok: execResult.ok,
    action_result: execResult,
    hud,
    active_popup: null,
    death_summary: session.death_summary,
    auto_saved_reason: savedReason
  };
}

// ============================================================================
// 5. NHỊP THỜI GIAN THỰC & BƯỚC TỰ HÀNH AI (PLAYER LÚ LẪN / NPC)
// ============================================================================

export function stepCentralRealTimeTick(
  session: EcoLifeSavedSessionState,
  minutesTicked: number,
  eventRollChance: number = 0.08
): CentralEngineResponse {
  if (session.death_summary?.is_deceased || session.pending_popup_event_id) {
    return {
      ok: true,
      action_result: {
        ok: true,
        message_vi: '',
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      },
      hud: projectHumanEntityToFrontendHud(
        session.player,
        session.clock.current_hour,
        session.clock.current_minute
      ),
      active_popup: null,
      death_summary: session.death_summary,
      auto_saved_reason: null
    };
  }

  if (session.player.capability_flags.is_dementia_autopilot) {
    return stepAutonomousEntityTurn(session);
  }

  advanceCentralClockAndBiology(session, minutesTicked, { is_sleeping_period: false });

  const deathCheck = evaluateDeathCondition(session.player, null);
  if (deathCheck.is_dead && deathCheck.cause_label_vi) {
    session.death_summary = buildDeathAndMemoirSummary(
      session,
      deathCheck.cause_label_vi,
      deathCheck.epitaph_vi
    );
    saveGameSessionImmediately(session, 'ACTION_COMPLETED');
    return {
      ok: true,
      action_result: {
        ok: true,
        message_vi: deathCheck.cause_label_vi,
        minutes_elapsed: minutesTicked,
        cutscene_caption_vi: null,
        auto_save_trigger: 'ACTION_COMPLETED'
      },
      hud: projectHumanEntityToFrontendHud(
        session.player,
        session.clock.current_hour,
        session.clock.current_minute
      ),
      active_popup: null,
      death_summary: session.death_summary,
      auto_saved_reason: 'ACTION_COMPLETED'
    };
  }

  const isOutdoor = session.player.current_location_id === 'LOC_TRANSIT_ROAD';
  const context: EventTriggerContext = {
    current_environment: isOutdoor ? 'OUTDOOR' : 'INDOOR',
    current_weather: session.clock.current_weather,
    current_day: session.clock.current_day,
    current_month: session.clock.current_month,
    current_year: session.clock.current_year,
    active_condition_flag: null,
    years_of_experience: Math.max(
      0,
      Math.floor(session.player.identity_biometrics.exact_age_years) - 18
    )
  };

  let triggeredPopup: ActiveEventPopupDto | null = null;
  let savedReason: AutoSaveTriggerReason | null = null;

  const candidatePopup = rollContextualEventForEntity(session.player, context);
  if (candidatePopup) {
    const isScheduledEvent =
      candidatePopup.event_id.startsWith('EVT_CAL_') ||
      candidatePopup.event_id === 'EVT_LIFECYCLE_ANNUAL_BIRTHDAY';

    if (isScheduledEvent || Math.random() < eventRollChance) {
      triggeredPopup = candidatePopup;
      session.pending_popup_event_id = candidatePopup.event_id;
      saveGameSessionImmediately(session, 'EVENT_TRIGGERED');
      savedReason = 'EVENT_TRIGGERED';
    }
  }

  return {
    ok: true,
    action_result: {
      ok: true,
      message_vi: '',
      minutes_elapsed: minutesTicked,
      cutscene_caption_vi: null,
      auto_save_trigger: savedReason
    },
    hud: projectHumanEntityToFrontendHud(
      session.player,
      session.clock.current_hour,
      session.clock.current_minute
    ),
    active_popup: triggeredPopup,
    death_summary: null,
    auto_saved_reason: savedReason
  };
}

export function stepAutonomousEntityTurn(
  session: EcoLifeSavedSessionState
): CentralEngineResponse {
  const dateStr = formatSessionDateVi(session);

  // Tách đúng phần `result` (ActionExecutionResult) và cờ `is_sleeping_action` từ bộ não tự hành
  const aiTurn = runAutonomousBrainTick(
    session.player,
    session.clock.current_hour,
    session.clock.current_weather,
    session.clock.current_month,
    dateStr
  );
  const aiResult: ActionExecutionResult = aiTurn.result;

  if (aiResult.journal_entry_added_vi) {
    session.journal_logs.push({
      age_recorded: Math.floor(session.player.identity_biometrics.exact_age_years),
      date_str_vi: dateStr,
      text_vi: aiResult.journal_entry_added_vi
    });
  }

  advanceCentralClockAndBiology(session, Math.max(15, aiResult.minutes_elapsed), {
    is_sleeping_period: aiTurn.is_sleeping_action
  });

  const deathCheck = evaluateDeathCondition(session.player, null);
  if (deathCheck.is_dead && deathCheck.cause_label_vi) {
    session.death_summary = buildDeathAndMemoirSummary(
      session,
      deathCheck.cause_label_vi,
      deathCheck.epitaph_vi
    );
  }

  const hud = projectHumanEntityToFrontendHud(
    session.player,
    session.clock.current_hour,
    session.clock.current_minute
  );

  return {
    ok: aiResult.ok,
    action_result: aiResult,
    hud,
    active_popup: null,
    death_summary: session.death_summary,
    auto_saved_reason: null
  };
}

// ============================================================================
// 6. CLEAN MENU: CHỈ TRẢ HÀNH ĐỘNG ĐỦ ĐIỀU KIỆN KÈM ICON MŨI TÊN TĂNG/GIẢM
// ============================================================================

function makeCleanAction(commandType: string, labelVi: string): CleanMenuAvailableAction {
  return {
    command_type: commandType,
    label_vi: labelVi,
    stat_indicators: resolveActionStatIndicators(commandType)
  };
}

export function getAvailableActionsForCurrentSpot(
  session: EcoLifeSavedSessionState
): CleanMenuAvailableAction[] {
  const player = session.player;
  const actions: CleanMenuAvailableAction[] = [];

  if (session.death_summary?.is_deceased || player.capability_flags.is_dementia_autopilot) {
    return actions;
  }

  const loc = player.current_location_id;
  const room = player.current_sub_node_id;

  if (loc === 'LOC_HOME') {
    actions.push(makeCleanAction('CLEAN_HOUSE', 'Quét dọn & lau chùi nhà cửa'));
    if (room === 'HOME_KITCHEN') {
      actions.push(makeCleanAction('EAT_MEAL', 'Tự nấu và ăn bữa cơm nóng tại bếp'));
    }
    if (room === 'HOME_BEDROOM' || room === 'HOME_LIVING_ROOM') {
      actions.push(makeCleanAction('SLEEP_OR_NAP', 'Nằm ngủ / Chợp mắt nghỉ ngơi'));
    }
    if (room === 'HOME_BATHROOM') {
      actions.push(makeCleanAction('USE_TOILET', 'Đi vệ sinh'));
      actions.push(makeCleanAction('TAKE_SHOWER', 'Tắm nước ấm'));
    }
  } else if (loc === 'LOC_PHARMACY') {
    actions.push(makeCleanAction('PHARMACY_OTC', 'Bốc thuốc OTC / Mua thuốc giảm đau'));
    if (player.inventory_items.some((i) => i.item_def_id === 'ITEM_MEDICAL_REPORT')) {
      actions.push(makeCleanAction('BUY_USE_RX_MEDICINE', 'Mua thuốc kê đơn (Rx) theo Bệnh án'));
    }
  } else if (loc === 'LOC_HOSPITAL') {
    actions.push(
      makeCleanAction('HOSPITAL_FULL_EXAM', 'Khám tổng quát & Xét nghiệm 6 nội tạng (360p)')
    );
    actions.push(makeCleanAction('HOSPITAL_REHAB', 'Điều trị cắt cơn cai nghiện chuyên khoa'));
  } else if (loc === 'LOC_GAS_STATION' && player.active_vehicle?.uses_fuel) {
    actions.push(makeCleanAction('REFUEL_VEHICLE', 'Đổ xăng cho phương tiện'));
  } else if (loc === 'LOC_VEHICLE_REPAIR' && player.active_vehicle) {
    actions.push(
      makeCleanAction('REPAIR_VEHICLE_PART', 'Bảo dưỡng / Thay phụ tùng Phanh - Lốp - Động cơ')
    );
  } else if (loc === 'LOC_BANK_FINANCE') {
    actions.push(makeCleanAction('BANK_OR_NOTARY', 'Gửi/Rút tiết kiệm & Lập Di chúc công chứng'));
  } else if (
    loc === 'LOC_WORK_SME' ||
    loc === 'LOC_WORK_OFFICE_MNC' ||
    loc === 'LOC_WORK_SME_FACTORY'
  ) {
    actions.push(makeCleanAction('WORK_SHIFT', 'Chấm công vào ca làm việc'));
  } else if (
    loc === 'LOC_SCHOOL_PRIMARY' ||
    loc === 'LOC_SCHOOL_SECONDARY' ||
    loc === 'LOC_SCHOOL_HIGHSCHOOL' ||
    loc === 'LOC_UNIVERSITY_VOCATIONAL'
  ) {
    actions.push(makeCleanAction('STUDY_SCHOOL', 'Vào lớp học bài'));
  }

  return actions;
}

export { deleteSavedProfile, listAllSavedProfiles, saveGameSessionImmediately };