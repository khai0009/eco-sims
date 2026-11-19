// Bộ Lưu trữ chống gian lận (Anti-Save-Scumming), Biên tập Cuốn Nhật Ký 5 Chương khi qua đời
// và Cầu nối trực tiếp vào Hook giao diện (useLifeSim.ts / App.tsx) của Frontend.
// Phong cách: Phẳng, đơn giản, chuẩn import type cho TypeScript strict, dễ đọc và dễ sửa.

import {
  EcoLifeJsonDb,
  translateVi
} from './jsonDatabaseLoader';
import {
  type FrontendHudProjection,
  type HumanEntityState,
  type OrganStateMap,
  projectHumanEntityToFrontendHud
} from './sensoryProjectionAdapter';
import {
  type ActionExecutionResult,
  clampNumber,
  createInitialHumanEntity,
  executeBuyHomeFurniture,
  executeInteractWithFurniture,
  executeMedicalVisit,
  executeSleepOrNapAction,
  executeTravelToLocation
} from './ecoLifeActionEngine';
import {
  type ActiveEventPopupDto,
  type EventTriggerContext,
  buildEventPopupDto,
  resolveEventChoice,
  rollContextualEventForEntity,
  runAutonomousBrainTick
} from './ecoLifeEventAndNpcEngine';

// ============================================================================
// 1. INTERFACE LƯU TRỮ PHIÊN CHƠI & CUỐN NHẬT KÝ ĐỜI NGƯỜI (KHỚP FRONTEND)
// ============================================================================

export type AutoSaveTriggerReason =
  | 'ACTION_COMPLETED'
  | 'EVENT_TRIGGERED'
  | 'APP_EXIT_SUSPEND';

export interface JournalLogRecord {
  age_recorded: number;
  text_vi: string;
}

export interface WillBeneficiaryLine {
  beneficiary_name: string;
  relation_label_vi: string;
  percentage_share: number;
}

export interface FrontendDeathAndMemoirDto {
  is_deceased: boolean;
  age_at_death: number;
  honorific_label_vi: string; // "Hưởng dương X tuổi" (<50) hoặc "Hưởng thọ X tuổi" (>=50)
  cause_label_vi: string;
  season_vi: string;
  epitaph_vi: string;
  total_estate_vnd: number;
  will_lines: WillBeneficiaryLine[];
  will_fallback_note_vi: string;
  chapters: Array<{
    chapter_index: number;
    roman_numeral: string;
    title_vi: string;
    entries: JournalLogRecord[];
  }>;
}

export interface EcoLifeSavedSessionState {
  save_version: string;
  profile_id: string;
  last_saved_unix_ms: number;
  last_save_reason: AutoSaveTriggerReason;
  clock: {
    total_days_elapsed: number;
    current_day: number;
    current_month: number;
    current_year: number;
    current_hour: number;
    current_minute: number;
    current_weather: 'CLEAR' | 'RAIN' | 'STORM_FLOOD';
  };
  vehicle_fuel_liters: number;
  player: HumanEntityState;
  pending_popup_event_id: string | null;
  journal_logs: JournalLogRecord[];
  will_lines: WillBeneficiaryLine[];
  death_summary: FrontendDeathAndMemoirDto | null;
}

const STORAGE_KEY_PREFIX = 'ECOLIFE_SAVE_PROFILE_';
const ACTIVE_PROFILE_KEY = 'ECOLIFE_ACTIVE_PROFILE_ID';

// ============================================================================
// 2. HÀM LƯU & TẢI CHỐNG GIAN LẬN (CHỈ LƯU TẠI 3 THỜI ĐIỂM QUY ĐỊNH)
// ============================================================================

export function saveGameSessionImmediately(
  session: EcoLifeSavedSessionState,
  reason: AutoSaveTriggerReason
): void {
  try {
    session.last_saved_unix_ms = Date.now();
    session.last_save_reason = reason;
    const rawJson = JSON.stringify(session);
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${session.profile_id}`, rawJson);
    window.localStorage.setItem(ACTIVE_PROFILE_KEY, session.profile_id);
  } catch {
    // Bỏ qua an toàn nếu trình duyệt chặn bộ nhớ cục bộ
  }
}

export function loadSavedEcoLifeSession(profileId?: string): {
  session: EcoLifeSavedSessionState | null;
  restoredPopup: ActiveEventPopupDto | null;
} {
  try {
    const targetId = profileId || window.localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (!targetId) {
      return { session: null, restoredPopup: null };
    }

    const rawJson = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${targetId}`);
    if (!rawJson) {
      return { session: null, restoredPopup: null };
    }

    const loadedSession = JSON.parse(rawJson) as EcoLifeSavedSessionState;
    let restoredPopup: ActiveEventPopupDto | null = null;

    if (loadedSession.pending_popup_event_id) {
      const rawEvt = (EcoLifeJsonDb.allEvents as Array<any>).find(
        (e) => e.event_id === loadedSession.pending_popup_event_id
      );
      if (rawEvt) {
        restoredPopup = buildEventPopupDto(loadedSession.player, rawEvt, 0);
        restoredPopup.effective_countdown_seconds = restoredPopup.base_countdown_seconds;
      }
    }

    return {
      session: loadedSession,
      restoredPopup: restoredPopup
    };
  } catch {
    return { session: null, restoredPopup: null };
  }
}

// ============================================================================
// 3. HÀM KIỂM TRA QUA ĐỜI & ĐÓNG CUỐN NHẬT KÝ ĐỜI NGƯỜI 5 CHƯƠNG (UC-08)
// ============================================================================

export function evaluateDeathAndBuildMemoir(
  session: EcoLifeSavedSessionState,
  instantDeathCauseFromEventVi: string | null = null
): FrontendDeathAndMemoirDto | null {
  const player = session.player;
  const organs = player.hidden_black_box.organs;
  const age = Math.floor(player.identity_biometrics.exact_age_years);

  let matchedCauseLabelVi: string | null = instantDeathCauseFromEventVi;
  let matchedEpitaphVi =
    'Sống trọn một kiếp người bình dị, thanh thản nhắm mắt xuôi tay.';

  const deathRules = EcoLifeJsonDb.agingEndgame.death_conditions;

  // [Điều kiện 1: Đột quỵ do kiệt sức lao động (Karoshi)]
  if (
    !matchedCauseLabelVi &&
    player.hidden_black_box.sleep_debt_hours >= 72.0 &&
    organs.heart <= 10.0
  ) {
    const karoshiDef = deathRules.find((d) => d.cause_id === 'DEATH_KAROSHI_STROKE');
    matchedCauseLabelVi = karoshiDef
      ? karoshiDef.cause_label_vi
      : 'Đột quỵ do kiệt sức lao động (Karoshi)';
    if (karoshiDef) matchedEpitaphVi = karoshiDef.epitaph_template_vi;
  }

  // [Điều kiện 2: Bất kỳ cơ quan nội tạng nào tụt về 0%]
  if (!matchedCauseLabelVi) {
    const organKeys = Object.keys(organs) as Array<keyof OrganStateMap>;
    for (const key of organKeys) {
      if (organs[key] <= 0.0) {
        const organFailDef = deathRules.find((d) => d.cause_id === 'DEATH_ORGAN_FAILURE');
        matchedCauseLabelVi = organFailDef
          ? organFailDef.cause_label_vi
          : 'Suy đa tạng nặng';
        if (organFailDef) matchedEpitaphVi = organFailDef.epitaph_template_vi;
        break;
      }
    }
  }

  // [Điều kiện 3: Tuổi cao sức yếu tự nhiên (Tuổi >= 85 và có tạng <= 15%)]
  if (!matchedCauseLabelVi && age >= 85) {
    const organValues = Object.values(organs);
    const minOrgan = Math.min(...organValues);
    if (minOrgan <= 15.0) {
      const oldAgeDef = deathRules.find((d) => d.cause_id === 'DEATH_OLD_AGE');
      matchedCauseLabelVi = oldAgeDef
        ? oldAgeDef.cause_label_vi
        : 'Tuổi cao sức yếu, an nghỉ tự nhiên';
      if (oldAgeDef) matchedEpitaphVi = oldAgeDef.epitaph_template_vi;
    }
  }

  if (!matchedCauseLabelVi) {
    return null;
  }

  const honorificRules = EcoLifeJsonDb.agingEndgame.memorial_honorific_rules;
  const honorificTemplate =
    age <= honorificRules.young_death_max_age
      ? honorificRules.young_death_label_vi
      : honorificRules.old_death_label_vi;
  const honorificLabelVi = honorificTemplate.split('{age}').join(String(age));

  let totalEstateVnd = player.cash_vnd;
  for (const furn of player.owned_furniture) {
    const def = EcoLifeJsonDb.furniture.find((f) => f.furniture_id === furn.furniture_id);
    if (def) {
      totalEstateVnd = totalEstateVnd + Math.round(def.base_price_vnd * 0.5);
    }
  }

  const romanMap = ['I', 'II', 'III', 'IV', 'V'];
  const builtChapters = EcoLifeJsonDb.agingEndgame.memoir_chapters.map((chapDef, idx) => {
    const entriesInChapter = session.journal_logs.filter(
      (log) => log.age_recorded >= chapDef.min_age && log.age_recorded <= chapDef.max_age
    );
    return {
      chapter_index: chapDef.chapter_index,
      roman_numeral: romanMap[idx] || String(chapDef.chapter_index),
      title_vi: chapDef.title_vi,
      entries: entriesInChapter
    };
  });

  const deathSummary: FrontendDeathAndMemoirDto = {
    is_deceased: true,
    age_at_death: age,
    honorific_label_vi: honorificLabelVi,
    cause_label_vi: matchedCauseLabelVi,
    season_vi: 'mùa thu',
    epitaph_vi: matchedEpitaphVi,
    total_estate_vnd: totalEstateVnd,
    will_lines: session.will_lines,
    will_fallback_note_vi:
      session.will_lines.length > 0
        ? 'Phân chia di sản theo Di chúc đã lập tại Phòng Công Chứng.'
        : 'Không lập di chúc — Tài sản chia theo pháp luật.',
    chapters: builtChapters
  };

  session.death_summary = deathSummary;
  saveGameSessionImmediately(session, 'ACTION_COMPLETED');
  return deathSummary;
}

// ============================================================================
// 4. BỘ ĐIỀU PHỐI PHIÊN CHƠI PHẲNG (DỄ DÀNG GỌI TỪ useLifeSim.ts)
// ============================================================================

export function startNewEcoLifeSession(params: {
  profileId: string;
  birthYear: number;
}): EcoLifeSavedSessionState {
  const player = createInitialHumanEntity({
    entityId: `PLAYER_${params.profileId}`,
    birthYear: params.birthYear,
    controllerMode: 'PLAYER_CONTROLLED'
  });

  const now = new Date();
  const birthDay = player.identity_biometrics.birth_day ?? now.getDate();
  const birthMonth = player.identity_biometrics.birth_month ?? now.getMonth() + 1;
  const birthYear = player.identity_biometrics.birth_year ?? params.birthYear;
  const familyTier = player.identity_biometrics.family_tier ?? 'Q2';

  const newSession: EcoLifeSavedSessionState = {
    save_version: '2.4.0',
    profile_id: params.profileId,
    last_saved_unix_ms: Date.now(),
    last_save_reason: 'ACTION_COMPLETED',
    clock: {
      total_days_elapsed: 0,
      current_day: birthDay,
      current_month: birthMonth,
      current_year: birthYear,
      current_hour: 7,
      current_minute: 30,
      current_weather: 'CLEAR'
    },
    vehicle_fuel_liters: 3.5,
    player: player,
    pending_popup_event_id: null,
    journal_logs: [
      {
        age_recorded: 0,
        text_vi: `Ngày ${String(birthDay).padStart(2, '0')}/${String(birthMonth).padStart(2, '0')}/${birthYear}: ${player.identity_biometrics.full_name} (${player.identity_biometrics.gender === 'MALE' ? 'Nam' : 'Nữ'}) chào đời tại ${translateVi(
          player.current_region === 'RURAL' ? 'region_rural_name' : 'region_urban_name'
        )} trong một gia đình tầng lớp ${familyTier}.`
      }
    ],
    will_lines: [],
    death_summary: null
  };

  saveGameSessionImmediately(newSession, 'ACTION_COMPLETED');
  return newSession;
}

/**
 * Cộng thêm số phút vào đồng hồ của phiên chơi, xử lý đổi ngày/tháng/năm lịch thực tế,
 * và áp dụng cơ chế tự do thức khuya của Module 3.10 (Không ép giờ ngủ, nhưng thức quá 18h/30h/40h sẽ bị hại tạng & ngất xỉu cưỡng chế).
 */
export function advanceSessionClockMinutes(
  session: EcoLifeSavedSessionState,
  minutesToAdd: number
): FrontendHudProjection {
  let effectiveMinutesToAdd = minutesToAdd;

  if (effectiveMinutesToAdd > 0) {
    const box = session.player.hidden_black_box;
    const organs = box.organs;
    const exactHoursElapsed = effectiveMinutesToAdd / 60.0;

    // Cộng dồn số giờ thức liên tục (trừ khi vừa ngủ giấc dài đã reset về 0)
    box.hours_awake_continuous =
      Math.round((box.hours_awake_continuous + exactHoursElapsed) * 10) / 10;

    // [Module 3.10] Tích lũy nợ giấc ngủ và bào mòn nội tạng khi thức khuya kéo dài
    if (box.hours_awake_continuous > 16.0) {
      box.sleep_debt_hours = clampNumber(
        box.sleep_debt_hours + exactHoursElapsed * 1.0,
        0,
        100
      );
      organs.brain = clampNumber(organs.brain - exactHoursElapsed * 0.5, 0, 100);
      organs.heart = clampNumber(organs.heart - exactHoursElapsed * 0.35, 0, 100);
      organs.liver = clampNumber(organs.liver - exactHoursElapsed * 0.35, 0, 100);
    }

    // Mốc > 30h: Giấc ngủ vi mô (Micro-sleep), bào mòn thần kinh & tim mạch nặng hơn
    if (box.hours_awake_continuous > 30.0) {
      organs.brain = clampNumber(organs.brain - exactHoursElapsed * 1.2, 0, 100);
      organs.heart = clampNumber(organs.heart - exactHoursElapsed * 0.8, 0, 100);
    }

    // Mốc >= 40h: Sập nguồn cưỡng chế (Forced Collapse) -> ngất ngủ gục 6 tiếng tại chỗ
    if (box.hours_awake_continuous >= 40.0) {
      box.hours_awake_continuous = 0.0;
      box.naps_taken_since_full_sleep = 0;
      box.sleep_debt_hours = clampNumber(box.sleep_debt_hours - 8.0, 0, 100);
      organs.brain = clampNumber(organs.brain - 4.0, 0, 100);
      organs.musculoskeletal = clampNumber(organs.musculoskeletal - 2.0, 0, 100);
      session.player.happiness_score = clampNumber(
        session.player.happiness_score - 12.0,
        0,
        100
      );

      // Nếu ngất gục ngoài đường phố thì bị móc túi mất 80% tiền mặt
      if (session.player.current_location_id === 'LOC_TRANSIT_ROAD') {
        const stolenCash = Math.round(session.player.cash_vnd * 0.8);
        session.player.cash_vnd = Math.max(0, session.player.cash_vnd - stolenCash);
        session.journal_logs.push({
          age_recorded: Math.floor(session.player.identity_biometrics.exact_age_years),
          text_vi:
            'Thức trắng 40 tiếng dẫn đến sập nguồn ngất xỉu ngay trên vỉa hè, tỉnh dậy thì ví tiền đã bị kẻ gian móc sạch!'
        });
      } else {
        session.journal_logs.push({
          age_recorded: Math.floor(session.player.identity_biometrics.exact_age_years),
          text_vi:
            'Thức trắng 40 tiếng quá giới hạn chịu đựng, cơ thể sập nguồn ngất lịm ngay tại chỗ.'
        });
      }

      // Ngủ gục cưỡng chế 6 tiếng (360 phút)
      effectiveMinutesToAdd = effectiveMinutesToAdd + 360;
    }

    const totalMinutes = session.clock.current_minute + effectiveMinutesToAdd;
    const hoursAdded = Math.floor(totalMinutes / 60);
    session.clock.current_minute = totalMinutes % 60;

    const nextHour = session.clock.current_hour + hoursAdded;
    const daysAdded = Math.floor(nextHour / 24);
    session.clock.current_hour = nextHour % 24;
    session.clock.total_days_elapsed = session.clock.total_days_elapsed + daysAdded;

    if (box.painkiller_masked_hours_left > 0) {
      box.painkiller_masked_hours_left = Math.max(
        0,
        box.painkiller_masked_hours_left - effectiveMinutesToAdd / 60.0
      );
    }

    // Cập nhật Ngày / Tháng / Năm lịch và tuổi chính xác theo năm sinh
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
      if (
        typeof bio.birth_year === 'number' &&
        typeof bio.birth_month === 'number' &&
        typeof bio.birth_day === 'number'
      ) {
        const hasPassedBirthdayThisYear =
          m > bio.birth_month || (m === bio.birth_month && d >= bio.birth_day);
        const computedAge = y - bio.birth_year - (hasPassedBirthdayThisYear ? 0 : 1);
        session.player.identity_biometrics.exact_age_years = Math.max(0, computedAge);
      }

      if (session.player.current_region === 'URBAN') {
        organs.lungs = Math.max(0, organs.lungs - 0.35 * daysAdded);
      } else {
        organs.lungs = Math.min(100, organs.lungs + 0.4 * daysAdded);
      }
    }
  }

  // Kiểm tra tự động chuyển sang Lú lẫn tự hành nếu nhân vật >= 65 tuổi và Não < 25%
  if (
    session.player.identity_biometrics.exact_age_years >= 65 &&
    session.player.hidden_black_box.organs.brain < 25.0
  ) {
    runAutonomousBrainTick(
      session.player,
      session.clock.current_hour,
      session.clock.current_weather,
      session.clock.current_month
    );
  }

  return projectHumanEntityToFrontendHud(
    session.player,
    session.clock.current_hour,
    session.clock.current_minute
  );
}

export function triggerContextualEventWithAutoSave(
  session: EcoLifeSavedSessionState,
  context: EventTriggerContext
): ActiveEventPopupDto | null {
  const popup = rollContextualEventForEntity(session.player, context);
  if (popup) {
    session.pending_popup_event_id = popup.event_id;
    saveGameSessionImmediately(session, 'EVENT_TRIGGERED');
  }
  return popup;
}

export function submitSessionEventChoice(
  session: EcoLifeSavedSessionState,
  selectedChoiceId: string | null
): {
  hud: FrontendHudProjection;
  deathSummary: FrontendDeathAndMemoirDto | null;
  outcomeMessageVi: string;
} {
  const activeEventId = session.pending_popup_event_id;
  if (!activeEventId) {
    return {
      hud: projectHumanEntityToFrontendHud(
        session.player,
        session.clock.current_hour,
        session.clock.current_minute
      ),
      deathSummary: session.death_summary,
      outcomeMessageVi: ''
    };
  }

  const res = resolveEventChoice(session.player, activeEventId, selectedChoiceId);
  session.pending_popup_event_id = null;

  if (res.journal_entry_vi) {
    session.journal_logs.push({
      age_recorded: Math.floor(session.player.identity_biometrics.exact_age_years),
      text_vi: res.journal_entry_vi
    });
  }

  const hud = advanceSessionClockMinutes(session, res.minutes_elapsed);
  const deathSummary = evaluateDeathAndBuildMemoir(session, res.triggered_death_cause_vi);

  saveGameSessionImmediately(session, 'ACTION_COMPLETED');

  return {
    hud: hud,
    deathSummary: deathSummary,
    outcomeMessageVi: res.outcome_summary_vi
  };
}

export function dispatchPlayerActionAndSyncHud(
  session: EcoLifeSavedSessionState,
  actionPayload:
    | { type: 'BUY_FURNITURE'; furnitureId: string }
    | { type: 'INTERACT_FURNITURE'; furnitureId: string; actionId: string }
    | { type: 'SLEEP_OR_NAP'; sleepActionId: string }
    | {
        type: 'MEDICAL_VISIT';
        visitType: 'HOSPITAL_FULL_EXAM' | 'PHARMACY_OTC_PAINKILLER';
        hasInsurance: boolean;
      }
    | { type: 'TRAVEL_TO_LOCATION'; targetLocationId: string }
): {
  actionResult: ActionExecutionResult;
  hud: FrontendHudProjection;
  deathSummary: FrontendDeathAndMemoirDto | null;
} {
  let execResult: ActionExecutionResult;

  if (actionPayload.type === 'BUY_FURNITURE') {
    execResult = executeBuyHomeFurniture(session.player, actionPayload.furnitureId);
  } else if (actionPayload.type === 'INTERACT_FURNITURE') {
    execResult = executeInteractWithFurniture(
      session.player,
      actionPayload.furnitureId,
      actionPayload.actionId
    );
  } else if (actionPayload.type === 'SLEEP_OR_NAP') {
    execResult = executeSleepOrNapAction(session.player, actionPayload.sleepActionId);
  } else if (actionPayload.type === 'MEDICAL_VISIT') {
    execResult = executeMedicalVisit(
      session.player,
      actionPayload.visitType,
      actionPayload.hasInsurance
    );
  } else {
    const travelOut = executeTravelToLocation(
      session.player,
      actionPayload.targetLocationId,
      session.clock.current_hour,
      session.clock.current_weather,
      session.vehicle_fuel_liters
    );
    execResult = travelOut.result;
    session.vehicle_fuel_liters = travelOut.remainingFuelLiters;
  }

  const hud = execResult.ok
    ? advanceSessionClockMinutes(session, execResult.minutes_elapsed)
    : projectHumanEntityToFrontendHud(
        session.player,
        session.clock.current_hour,
        session.clock.current_minute
      );

  const deathSummary = evaluateDeathAndBuildMemoir(session, null);

  if (execResult.auto_save_trigger === 'ACTION_COMPLETED') {
    saveGameSessionImmediately(session, 'ACTION_COMPLETED');
  }

  return {
    actionResult: execResult,
    hud: hud,
    deathSummary: deathSummary
  };
}