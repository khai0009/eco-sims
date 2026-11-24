// [TẦNG KIỂM THỬ LOGIC TỰ ĐỘNG CHO ECO-LIFE V3.2 BALANCED]
// Áp dụng 3 kỹ thuật QA chuẩn của dòng game Life Sim (RimWorld / The Sims / BitLife):
// 1. Runtime Invariant Checker: Tự động bắt lỗi vô lý sau từng nhịp Engine.
// 2. Deterministic Edge-Case Suite: Kiểm chứng 8 luật biên cốt lõi từ tài liệu thiết kế.
// 3. Headless Monte Carlo Cohort: Mô phỏng nhanh nhiều cuộc đời NPC -> xuất 1 Log Tổng Quát.

import { EcoLifeJsonDb, translateVi } from '../game/jsonDatabaseLoader';
import {
  STAT_MAX_VALUE,
  STAT_MIN_VALUE,
  type EcoLifeSavedSessionState,
  type EventTriggerContext,
  type FrontendHudProjection,
  type HumanEntityState,
  type NpcPresenceAtLocation,
  type OrganStateMap
} from '../game/engineTypes';
import {
  createInitialHumanEntity,
  evaluateDeathCondition,
  lockChildhoodPersonalityAtAgeSix
} from '../game/modules/organAndBiologyModule';
import {
  projectHumanEntityToFrontendHud,
  buildDeathAndMemoirSummary
} from '../game/modules/sensoryAndMemoirModule';
import {
  resolveEventChoice,
  rollContextualEventForEntity
} from '../game/modules/eventAndSocialModule';
import {
  advanceCentralClockAndBiology,
  dispatchCentralEngineCommand,
  formatSessionDateVi,
  getAvailableActionsForCurrentSpot,
  stepAutonomousEntityTurn
} from '../game/ecoLifeCentralEngine';
import {
  asMultiplier,
  asStat100,
  asVnd,
  computeStructuralAccidentProbability,
  computeWealthDistributionStats
} from '../game/math/ecoLifeUnifiedFormulas';

export type SimulationCohortMode = 'FULL_YEAR_DETAILED' | 'FULL_LIFESPAN_FAST';

export interface CohortSimulationConfig {
  npc_count: number;
  birth_year: number;
  mode: SimulationCohortMode;
}

export interface LogicInvariantViolation {
  rule_id: string;
  severity: 'ERROR' | 'WARNING';
  npc_label: string;
  age_and_date_vi: string;
  detail_vi: string;
}

export interface EdgeCaseTestReport {
  test_id: string;
  title_vi: string;
  passed: boolean;
  evidence_vi: string;
}

export interface NpcIndividualOutcomeSummary {
  npc_name: string;
  gender: 'MALE' | 'FEMALE';
  region: 'RURAL' | 'URBAN';
  family_tier: string;
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

export interface CohortTelemetryReport {
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

export function createInMemoryTestSession(
  birthYear: number,
  seedIndex: number,
  forcedRegion?: 'RURAL' | 'URBAN',
  forcedTier?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5'
): EcoLifeSavedSessionState {
  const player = createInitialHumanEntity({
    entityId: `TEST_NPC_${seedIndex}_${Date.now()}`,
    birthYear: birthYear,
    birthRegion: forcedRegion,
    familyTier: forcedTier,
    controllerMode: 'AI_AUTONOMOUS'
  });

  const votePool: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
  const votes: Array<'A' | 'B' | 'C' | 'D'> = [];
  for (let i = 0; i < 5; i++) {
    votes.push(votePool[Math.floor(Math.random() * votePool.length)]);
  }
  const lockedPers = lockChildhoodPersonalityAtAgeSix(player, votes);
  player.capability_flags.is_personality_decoded = true;
  player.capability_flags.is_clock_visible = true;

  const bio = player.identity_biometrics;
  const startYear = bio.birth_year + 6;
  const birthDateStr = `${String(bio.birth_day).padStart(2, '0')}/${String(bio.birth_month).padStart(
    2,
    '0'
  )}/${bio.birth_year}`;

  return {
    save_version: '3.2.0',
    profile_id: `IN_MEMORY_TEST_${seedIndex}`,
    last_saved_unix_ms: Date.now(),
    last_save_reason: 'ACTION_COMPLETED',
    clock: {
      total_days_elapsed: 0,
      current_day: bio.birth_day,
      current_month: bio.birth_month,
      current_year: startYear,
      current_hour: 7,
      current_minute: 30,
      current_weather: 'CLEAR'
    },
    player: player,
    pending_popup_event_id: null,
    journal_logs: [
      {
        age_recorded: 0,
        date_str_vi: birthDateStr,
        text_vi: `${bio.full_name} chào đời tại ${translateVi(
          player.current_region === 'RURAL' ? 'region_rural_name' : 'region_urban_name'
        )} (Gia cảnh ${bio.family_tier}).`
      },
      {
        age_recorded: 6,
        date_str_vi: `${String(bio.birth_day).padStart(2, '0')}/${String(bio.birth_month).padStart(
          2,
          '0'
        )}/${startYear}`,
        text_vi: `Tròn 6 tuổi, định hình tính cách ${translateVi(lockedPers)} và vào Tiểu học.`
      }
    ],
    will_lines: [],
    death_summary: null
  };
}

export function checkSessionLogicInvariants(
  session: EcoLifeSavedSessionState,
  hud: FrontendHudProjection,
  lastActionMessageVi: string
): LogicInvariantViolation[] {
  const violations: LogicInvariantViolation[] = [];
  const p: HumanEntityState = session.player;
  const box = p.hidden_black_box;
  const age = Math.floor(p.identity_biometrics.exact_age_years);
  const npcLabel = p.identity_biometrics.full_name;
  const ageDateStr = `${age} tuổi • ${formatSessionDateVi(session)}`;

  if (Number.isNaN(p.cash_vnd) || p.cash_vnd < 0) {
    violations.push({
      rule_id: 'INV_NO_NEGATIVE_CASH',
      severity: 'ERROR',
      npc_label: npcLabel,
      age_and_date_vi: ageDateStr,
      detail_vi: `Ví tiền mặt rơi xuống giá trị bất hợp lệ: ${p.cash_vnd}đ.`
    });
  }

  const organKeys = Object.keys(box.organs) as Array<keyof OrganStateMap>;
  for (const key of organKeys) {
    const val = box.organs[key];
    if (Number.isNaN(val) || val < STAT_MIN_VALUE || val > STAT_MAX_VALUE) {
      violations.push({
        rule_id: 'INV_STAT_BOUNDS_0_100',
        severity: 'ERROR',
        npc_label: npcLabel,
        age_and_date_vi: ageDateStr,
        detail_vi: `Nội tạng '${key}' vượt chuẩn 0-100: ${val}.`
      });
    }
  }

  const unifiedStats: Array<[string, number]> = [
    ['happiness_score', p.happiness_score],
    ['satiety_pct', box.satiety_pct],
    ['energy_sleep_pct', box.energy_sleep_pct],
    ['bladder_comfort_pct', box.bladder_comfort_pct],
    ['body_hygiene_pct', box.body_hygiene_pct],
    ['house_cleanliness_pct', box.house_cleanliness_pct],
    ['social_battery_pct', box.social_battery_pct],
    ['time_management_pct', box.time_management_pct]
  ];
  for (const [statName, val] of unifiedStats) {
    if (Number.isNaN(val) || val < STAT_MIN_VALUE || val > STAT_MAX_VALUE) {
      violations.push({
        rule_id: 'INV_STAT_BOUNDS_0_100',
        severity: 'ERROR',
        npc_label: npcLabel,
        age_and_date_vi: ageDateStr,
        detail_vi: `Chỉ số '${statName}' vượt chuẩn 0-100: ${val}.`
      });
    }
  }

  const regionRules = EcoLifeJsonDb.regions.region_types[p.current_region];
  const lockedLocations: readonly string[] = regionRules.locked_location_ids;
  if (lockedLocations.includes(p.current_location_id)) {
    violations.push({
      rule_id: 'INV_REGION_LOCK_BREACH',
      severity: 'ERROR',
      npc_label: npcLabel,
      age_and_date_vi: ageDateStr,
      detail_vi: `Nhân vật ở vùng ${p.current_region} nhưng lại có mặt tại địa điểm bị khóa ${p.current_location_id}.`
    });
  }

  const isSummerMonth = session.clock.current_month === 6 || session.clock.current_month === 7;
  if (
    age >= 6 &&
    age <= 17 &&
    isSummerMonth &&
    lastActionMessageVi.includes('hoàn thành tiết học trên lớp')
  ) {
    violations.push({
      rule_id: 'INV_SUMMER_SCHOOL_BREACH',
      severity: 'ERROR',
      npc_label: npcLabel,
      age_and_date_vi: ageDateStr,
      detail_vi: `Học sinh ${age} tuổi vẫn học trên lớp giữa kỳ nghỉ hè (Tháng ${session.clock.current_month}).`
    });
  }

  if (hud.body_monologue_vi.includes('%') || hud.health_label_vi.includes('%')) {
    violations.push({
      rule_id: 'INV_SENSORY_NO_NUMBER_LEAK',
      severity: 'ERROR',
      npc_label: npcLabel,
      age_and_date_vi: ageDateStr,
      detail_vi: `Rò rỉ ký tự '%' ra lớp cảm quan HUD: "${hud.body_monologue_vi}".`
    });
  }

  if (age >= 65 && box.organs.brain < 25.0 && !p.capability_flags.is_dementia_autopilot) {
    violations.push({
      rule_id: 'INV_DEMENTIA_LOCK_MISSING',
      severity: 'WARNING',
      npc_label: npcLabel,
      age_and_date_vi: ageDateStr,
      detail_vi: `Nhân vật ${age} tuổi có Não < 25 nhưng chưa bật cờ is_dementia_autopilot.`
    });
  }

  let minOrgan = 100;
  for (const key of organKeys) {
    if (box.organs[key] < minOrgan) minOrgan = box.organs[key];
  }
  if (minOrgan <= 0 && !session.death_summary?.is_deceased) {
    violations.push({
      rule_id: 'INV_UNDEAD_ZERO_ORGAN',
      severity: 'ERROR',
      npc_label: npcLabel,
      age_and_date_vi: ageDateStr,
      detail_vi: 'Có nội tạng đã chạm 0/100 nhưng hệ thống chưa chốt qua đời (death_summary vẫn rỗng).'
    });
  }

  return violations;
}

export function runDeterministicEdgeCaseSuite(): EdgeCaseTestReport[] {
  const reports: EdgeCaseTestReport[] = [];

  // --- TEST 1 ---
  {
    const s = createInMemoryTestSession(2000, 101, 'URBAN', 'Q1');
    s.player.controller_mode = 'PLAYER_CONTROLLED';
    s.player.cash_vnd = 0;
    s.player.current_location_id = 'LOC_SUPERMARKET_MARKET';
    const res = dispatchCentralEngineCommand(s, {
      type: 'BUY_ITEM',
      item_def: {
        item_def_id: 'ITEM_BREAD_LOAF',
        display_name_key: 'Ổ bánh mì thịt',
        category: 'FOOD',
        usage_type: 'CONSUMABLE',
        size_class: 'PORTABLE_CARRY',
        base_price_vnd: 25000,
        weight_kg: 0.3,
        max_servings: 1,
        sold_at_location_ids: ['LOC_SUPERMARKET_MARKET']
      }
    });
    const passed = !res.ok && s.player.cash_vnd === 0 && s.player.inventory_items.length === 1;
    reports.push({
      test_id: 'EDGE_01_ZERO_CASH_BUY',
      title_vi: '1. Chặn mua hàng khi ví 0đ',
      passed,
      evidence_vi: passed
        ? `Đạt: Engine từ chối giao dịch ("${res.action_result.message_vi}"), ví giữ nguyên 0đ.`
        : `Lỗi: Ví 0đ nhưng vẫn mua thành công hoặc tiền bị biến động (${s.player.cash_vnd}đ).`
    });
  }

  // --- TEST 2 ---
  {
    const s = createInMemoryTestSession(1998, 102, 'URBAN', 'Q4');
    s.player.controller_mode = 'PLAYER_CONTROLLED';
    s.player.cash_vnd = 3000000;
    s.player.current_location_id = 'LOC_PHARMACY';
    const beforeExam = dispatchCentralEngineCommand(s, { type: 'BUY_USE_RX_MEDICINE' });

    s.player.current_location_id = 'LOC_HOSPITAL';
    const examRes = dispatchCentralEngineCommand(s, { type: 'HOSPITAL_FULL_EXAM' });
    const hasReport = s.player.inventory_items.some((i) => i.item_def_id === 'ITEM_MEDICAL_REPORT');

    s.player.current_location_id = 'LOC_PHARMACY';
    const afterExam = dispatchCentralEngineCommand(s, { type: 'BUY_USE_RX_MEDICINE' });

    const passed =
      !beforeExam.ok &&
      examRes.ok &&
      examRes.action_result.minutes_elapsed === 360 &&
      hasReport &&
      afterExam.ok;
    reports.push({
      test_id: 'EDGE_02_RX_MEDICAL_REPORT',
      title_vi: '2. Thuốc Rx bắt buộc có Phiếu Khám Bệnh (360p) từ Bệnh viện',
      passed,
      evidence_vi: passed
        ? 'Đạt: Bị từ chối mua Rx khi chưa khám; sau 360p xét nghiệm có ITEM_MEDICAL_REPORT trong túi và mua Rx thành công.'
        : `Lỗi: beforeExam=${beforeExam.ok}, examMinutes=${examRes.action_result.minutes_elapsed}, hasReport=${hasReport}, afterExam=${afterExam.ok}.`
    });
  }

  // --- TEST 3 ---
  {
    const s = createInMemoryTestSession(1995, 103, 'URBAN', 'Q4');
    s.player.controller_mode = 'PLAYER_CONTROLLED';
    s.player.cash_vnd = 2000000;
    s.player.owned_furniture.push({
      instance_id: 'FRIDGE_TEST_1',
      furniture_id: 'FURN_FRIDGE_STANDARD',
      current_durability_pct: 4.0,
      max_durability_cap_pct: 100.0
    });

    s.player.current_location_id = 'LOC_APPLIANCE_REPAIR_SHOP';
    const tryShop = dispatchCentralEngineCommand(s, {
      type: 'REPAIR_EQUIPMENT',
      target_kind: 'HOME_FURNITURE',
      instance_id: 'FRIDGE_TEST_1'
    });

    s.player.current_location_id = 'LOC_HOME';
    const tryHome = dispatchCentralEngineCommand(s, {
      type: 'REPAIR_EQUIPMENT',
      target_kind: 'HOME_FURNITURE',
      instance_id: 'FRIDGE_TEST_1'
    });
    const capAfter = s.player.owned_furniture[0].max_durability_cap_pct;

    const passed = !tryShop.ok && tryHome.ok && capAfter === 95.0;
    reports.push({
      test_id: 'EDGE_03_BULKY_HOME_REPAIR',
      title_vi: '3. Đồ cồng kềnh chỉ gọi thợ tới LOC_HOME & trừ trần độ bền 5%',
      passed,
      evidence_vi: passed
        ? 'Đạt: Chặn sửa tủ lạnh ở tiệm; gọi thợ tới nhà thành công và trần độ bền giảm còn 95/100.'
        : `Lỗi: tryShop=${tryShop.ok}, tryHome=${tryHome.ok}, capAfter=${capAfter}.`
    });
  }

  // --- TEST 4 ---
  {
    const s = createInMemoryTestSession(1999, 104, 'RURAL', 'Q2');
    s.player.controller_mode = 'PLAYER_CONTROLLED';
    const moveRes = dispatchCentralEngineCommand(s, {
      type: 'TRAVEL_TO_LOCATION',
      target_location_id: 'LOC_WORK_OFFICE_MNC',
      transit_mode: 'WALK'
    });
    const passed = !moveRes.ok && s.player.current_location_id === 'LOC_HOME';
    reports.push({
      test_id: 'EDGE_04_RURAL_REGION_LOCK',
      title_vi: '4. Vùng Nông Thôn chặn di chuyển vào địa điểm Đô Thị (MNC)',
      passed,
      evidence_vi: passed
        ? `Đạt: Engine chặn di chuyển sang MNC ở Nông Thôn ("${moveRes.action_result.message_vi}").`
        : `Lỗi: Đang ở Nông Thôn vẫn đi được tới ${s.player.current_location_id}.`
    });
  }

  // --- TEST 5 ---
  {
    const s = createInMemoryTestSession(1997, 105, 'URBAN', 'Q3');
    s.player.controller_mode = 'PLAYER_CONTROLLED';
    s.player.cash_vnd = 500000;
    s.player.current_location_id = 'LOC_PHARMACY';
    const liverBefore = s.player.hidden_black_box.organs.liver;

    dispatchCentralEngineCommand(s, { type: 'PHARMACY_OTC', otc_mode: 'PAINKILLER' });
    dispatchCentralEngineCommand(s, { type: 'PHARMACY_OTC', otc_mode: 'PAINKILLER' });

    const hasOveruseDebuff = s.player.hidden_black_box.overuse_tracker.active_debuff_ids.includes(
      'DEBUFF_PAINKILLER_OVERUSE'
    );
    const liverDrop = liverBefore - s.player.hidden_black_box.organs.liver;
    const passed = hasOveruseDebuff && liverDrop >= 11.0;
    reports.push({
      test_id: 'EDGE_05_PAINKILLER_OVERUSE',
      title_vi: '5. Lạm dụng 2 liều thuốc giảm đau trong 24h bật Debuff hại Gan',
      passed,
      evidence_vi: passed
        ? `Đạt: Bật DEBUFF_PAINKILLER_OVERUSE và Gan bị trừ ngầm ${Math.round(liverDrop * 10) / 10} điểm.`
        : `Lỗi: hasDebuff=${hasOveruseDebuff}, liverDrop=${liverDrop}.`
    });
  }

  // --- TEST 6 ---
  {
    const s = createInMemoryTestSession(2005, 106, 'URBAN', 'Q3');
    s.player.controller_mode = 'PLAYER_CONTROLLED';
    s.player.current_location_id = 'LOC_HOME_FRIEND';

    const emptyHouse = dispatchCentralEngineCommand(s, {
      type: 'BORROW_FROM_NPC',
      npcs_at_location: [],
      item_def_id: 'ITEM_TEXTBOOK_MATH',
      item_name_vi: 'Sách Toán nâng cao',
      minutes_until_next_commitment: 60
    });

    const motherOnly: NpcPresenceAtLocation[] = [
      {
        npc_id: 'NPC_MOM_1',
        full_name: 'Hương',
        role_tag: 'FRIEND_MOTHER_RELATIVE',
        current_location_id: 'LOC_HOME_FRIEND',
        bonding_score_with_player: 65,
        knows_where_item_is: false,
        is_item_currently_at_home: false
      }
    ];
    const noTimeToWait = dispatchCentralEngineCommand(s, {
      type: 'BORROW_FROM_NPC',
      npcs_at_location: motherOnly,
      item_def_id: 'ITEM_TEXTBOOK_MATH',
      item_name_vi: 'Sách Toán nâng cao',
      minutes_until_next_commitment: 20
    });
    const enoughTime = dispatchCentralEngineCommand(s, {
      type: 'BORROW_FROM_NPC',
      npcs_at_location: motherOnly,
      item_def_id: 'ITEM_TEXTBOOK_MATH',
      item_name_vi: 'Sách Toán nâng cao',
      minutes_until_next_commitment: 90
    });

    const passed = !emptyHouse.ok && !noTimeToWait.ok && enoughTime.ok;
    reports.push({
      test_id: 'EDGE_06_NPC_BORROW_3_GATES',
      title_vi: '6. Mượn sách qua Mẹ bạn kiểm tra đủ 3 chốt chặn thực tế',
      passed,
      evidence_vi: passed
        ? 'Đạt: Nhà khóa cửa -> từ chối; sắp trễ giờ học (còn 20p < 45p chờ) -> về tay không; rảnh 90p -> mượn thành công.'
        : `Lỗi: emptyHouse=${emptyHouse.ok}, noTimeToWait=${noTimeToWait.ok}, enoughTime=${enoughTime.ok}.`
    });
  }

  // --- TEST 7 ---
  {
    const s = createInMemoryTestSession(1996, 107, 'URBAN', 'Q3');
    s.player.controller_mode = 'PLAYER_CONTROLLED';
    s.player.current_location_id = 'LOC_TRANSIT_ROAD';
    s.player.cash_vnd = 1000000;
    s.player.hidden_black_box.energy_sleep_pct = 2.0;

    advanceCentralClockAndBiology(s, 60, { is_sleeping_period: false });
    const passed = s.player.cash_vnd === 200000 && s.player.hidden_black_box.energy_sleep_pct === 45.0;
    reports.push({
      test_id: 'EDGE_07_COLLAPSE_OUTDOOR_PICKPOCKET',
      title_vi: '7. Sập nguồn 0/100 năng lượng ngoài đường -> Ngất & bị móc 80% tiền',
      passed,
      evidence_vi: passed
        ? 'Đạt: Ngất tại LOC_TRANSIT_ROAD, tiền mặt tụt từ 1.000.000đ xuống 200.000đ và năng lượng hồi tạm 45/100.'
        : `Lỗi: cash=${s.player.cash_vnd}đ, energy=${s.player.hidden_black_box.energy_sleep_pct}.`
    });
  }

  // --- TEST 8 ---
  {
    const s = createInMemoryTestSession(1955, 108, 'RURAL', 'Q3');
    s.player.controller_mode = 'PLAYER_CONTROLLED';
    s.player.identity_biometrics.exact_age_years = 68;
    s.player.hidden_black_box.organs.brain = 20.0;

    advanceCentralClockAndBiology(s, 60, { is_sleeping_period: false });
    const cleanActions = getAvailableActionsForCurrentSpot(s);
    const blockedCmd = dispatchCentralEngineCommand(s, { type: 'CLEAN_HOUSE' });
    const modeAfterTick = s.player.controller_mode as HumanEntityState['controller_mode'];

    const passed =
      s.player.capability_flags.is_dementia_autopilot &&
      modeAfterTick === 'AI_AUTONOMOUS' &&
      cleanActions.length === 0 &&
      !blockedCmd.ok;
    reports.push({
      test_id: 'EDGE_08_DEMENTIA_AUTOPILOT_LOCK',
      title_vi: '8. Tuổi già lú lẫn (68t, Não < 25) tự chuyển AI_AUTONOMOUS & khóa Clean Menu',
      passed,
      evidence_vi: passed
        ? 'Đạt: Tự bật is_dementia_autopilot, Clean Menu trả 0 nút và mọi lệnh bấm chủ động đều bị khóa.'
        : `Lỗi: autopilot=${s.player.capability_flags.is_dementia_autopilot}, mode=${modeAfterTick}, menuCount=${cleanActions.length}, cmdOk=${blockedCmd.ok}.`
    });
  }

  return reports;
}

function classifyActionBucket(
  msg: string,
  buckets: CohortTelemetryReport['action_bucket_counts']
): void {
  const lower = msg.toLowerCase();
  // Chặn nhầm lẫn: Câu báo lỗi thiếu tiền không được tính là đã ăn uống thành công
  if (lower.includes('không đủ tiền')) {
    return;
  }
  if (lower.includes('bị ba má la') || lower.includes('trốn học')) {
    buckets.truancy_scold = buckets.truancy_scold + 1;
  } else if (lower.includes('part-time') || lower.includes('thời vụ') || lower.includes('gia sư')) {
    buckets.part_time = buckets.part_time + 1;
  } else if (lower.includes('cơm') || lower.includes('thưởng thức') || lower.includes('ăn bữa')) {
    buckets.eat = buckets.eat + 1;
  } else if (lower.includes('ngủ') || lower.includes('chợp mắt') || lower.includes('thiếp đi')) {
    buckets.sleep = buckets.sleep + 1;
  } else if (lower.includes('vệ sinh') || lower.includes('tắm')) {
    buckets.hygiene = buckets.hygiene + 1;
  } else if (lower.includes('tiết học') || lower.includes('trường')) {
    buckets.study = buckets.study + 1;
  } else if (lower.includes('ca làm') || lower.includes('tiền công')) {
    buckets.work = buckets.work + 1;
  } else if (lower.includes('di chuyển')) {
    buckets.travel = buckets.travel + 1;
  } else if (lower.includes('bệnh viện') || lower.includes('xét nghiệm') || lower.includes('thuốc')) {
    buckets.medical = buckets.medical + 1;
  } else if (lower.includes('thẫn thờ') || lower.includes('tấm ảnh cũ')) {
    buckets.dementia_auto = buckets.dementia_auto + 1;
  }
}

function rollAndResolveNpcEventOnce(session: EcoLifeSavedSessionState): boolean {
  const npc = session.player;
  const age = Math.floor(npc.identity_biometrics.exact_age_years);
  const context: EventTriggerContext = {
    current_environment: npc.current_location_id === 'LOC_TRANSIT_ROAD' ? 'OUTDOOR' : 'INDOOR',
    current_weather: session.clock.current_weather,
    current_day: session.clock.current_day,
    current_month: session.clock.current_month,
    current_year: session.clock.current_year,
    active_condition_flag: null,
    years_of_experience: Math.max(0, age - 18)
  };

  const popup = rollContextualEventForEntity(npc, context);
  if (!popup) return false;

  const isScheduled =
    popup.event_id.startsWith('EVT_CAL_') ||
    popup.event_id === 'EVT_LIFECYCLE_ANNUAL_BIRTHDAY' ||
    popup.event_id === 'EVT_SCHOOL_ANNUAL_HEALTH_CHECKUP';

  if (!isScheduled && Math.random() >= 0.12) {
    return false;
  }

  let choiceId: string | null = null;
  if (!popup.hide_choices_due_to_dementia && popup.available_choices.length > 0) {
    const safeChoice = popup.available_choices.find((c) => !c.is_default_timeout_penalty);
    choiceId = safeChoice ? safeChoice.choice_id : popup.available_choices[0].choice_id;
  }

  const res = resolveEventChoice(
    npc,
    popup.event_id,
    choiceId,
    session.clock.current_year,
    session.clock.current_month
  );

  if (res.minutes_elapsed > 0) {
    advanceCentralClockAndBiology(session, res.minutes_elapsed, { is_sleeping_period: false });
  }
  if (res.triggered_death_cause_vi) {
    const deathCheck = evaluateDeathCondition(npc, res.triggered_death_cause_vi);
    if (deathCheck.is_dead && deathCheck.cause_label_vi) {
      session.death_summary = buildDeathAndMemoirSummary(
        session,
        deathCheck.cause_label_vi,
        deathCheck.epitaph_vi
      );
    }
  }

  return true;
}

interface NpcLifecycleFlags {
  didPuberty: boolean;
  didMilitary: boolean;
  isMarried: boolean;
  childrenCount: number;
  frailtyRateMultiplier: number; // Hệ số lão hóa cá thể (0.85x - 1.45x quanh chuẩn 2.0/năm)
  hasViceHabit: boolean; // Hút thuốc / rượu bia theo tính cách & áp lực đời sống
  overtimeBurnoutQuarters: number; // Số quý tăng ca kiệt sức tích lũy nguy cơ Karoshi
  chronicOrganScar: Record<keyof OrganStateMap, number>; // Trần tổn thương vĩnh viễn không thể tự hồi khi ngủ
}

/**
 * Mô phỏng các biến cố vòng đời & ma trận rủi ro cấu trúc (Master GDD Module 1.6, 2.1, 3.1, 3.5, 3.10, 3.20, 3.24)
 * trong bước nhảy quý của chế độ FULL_LIFESPAN_FAST kèm sẹo mãn tính & khấu hao kinh tế thực tế.
 */
function simulateQuarterlyLifecycleAndRisks(
  session: EcoLifeSavedSessionState,
  flags: NpcLifecycleFlags,
  lifecycleStats: CohortTelemetryReport['lifecycle_events_breakdown']
): { extra_events_resolved: number; instant_death_cause_vi: string | null } {
  const npc = session.player;
  const bio = npc.identity_biometrics;
  const organs = npc.hidden_black_box.organs;
  const age = Math.floor(bio.exact_age_years);
  const pers = bio.locked_personality || 'PERS_AMBIVERT';
  const month = session.clock.current_month;
  let eventsCount = 0;

  // [1. Tuổi Dậy Thì (12 - 15t — Module 3.24)]: Nam vỡ giọng / Nữ chu kỳ kinh nguyệt
  if (!flags.didPuberty && age >= 12 && age <= 15) {
    flags.didPuberty = true;
    eventsCount = eventsCount + 1;
    lifecycleStats.puberty_milestones = lifecycleStats.puberty_milestones + 1;
    if (bio.gender === 'MALE') {
      organs.musculoskeletal = Math.min(95, Math.round((organs.musculoskeletal + 3.0) * 100) / 100);
    } else {
      npc.happiness_score = Math.max(0, Math.round((npc.happiness_score - 3.0) * 100) / 100);
    }
  }

  // [2. Nghĩa Vụ Quân Sự Thời Bình (Nam 18 - 25t — Module 3.24)]: Rèn thể chất + kỷ luật + trợ cấp xuất ngũ
  if (
    !flags.didMilitary &&
    bio.gender === 'MALE' &&
    age >= 18 &&
    age <= 25 &&
    month >= 10 &&
    organs.heart >= 60 &&
    organs.lungs >= 60 &&
    Math.random() < 0.14
  ) {
    flags.didMilitary = true;
    eventsCount = eventsCount + 1;
    lifecycleStats.military_conscriptions = lifecycleStats.military_conscriptions + 1;
    organs.musculoskeletal = Math.min(96, Math.round((organs.musculoskeletal + 8.0) * 100) / 100);
    npc.hidden_black_box.time_management_pct = Math.min(
      100,
      npc.hidden_black_box.time_management_pct + 45
    );
    if (npc.hidden_black_box.time_management_pct >= 100) {
      npc.capability_flags.is_time_management_unlocked = true;
    }
    npc.cash_vnd = npc.cash_vnd + 22000000;
  }

  // [3. Hôn Nhân & Sinh Con (23 - 40t — Module 3.20)]: Xác suất tự nhiên ~75-85% cả đời (không ép 100%)
  if (!flags.isMarried && age >= 23 && age <= 40 && Math.random() < 0.028) {
    flags.isMarried = true;
    eventsCount = eventsCount + 1;
    lifecycleStats.marriages = lifecycleStats.marriages + 1;
    const weddingCost = npc.cash_vnd >= 25000000 ? 18000000 : 1500000;
    npc.cash_vnd = Math.max(0, npc.cash_vnd - weddingCost);
    npc.happiness_score = Math.min(100, Math.round((npc.happiness_score + 10.0) * 100) / 100);
  }
  // Sau khi kết hôn ở tuổi 24-42: sinh tối đa 2 con, phát sinh chi phí nuôi con hàng quý
  if (flags.isMarried && flags.childrenCount < 2 && age >= 24 && age <= 42 && Math.random() < 0.045) {
    flags.childrenCount = flags.childrenCount + 1;
    eventsCount = eventsCount + 1;
    npc.cash_vnd = Math.max(0, npc.cash_vnd - (npc.has_social_insurance ? 2500000 : 8500000));
  }

  // [4. Suy thoái kinh tế cục bộ (Module 2.1)]: Hao hụt tài sản đầu tư/tiết kiệm & tăng stress
  if (age >= 20 && age < 60 && Math.random() < 0.022) {
    eventsCount = eventsCount + 1;
    lifecycleStats.recession_shocks = lifecycleStats.recession_shocks + 1;
    const shockLoss = Math.round(npc.cash_vnd * 0.16);
    npc.cash_vnd = Math.max(0, npc.cash_vnd - shockLoss);
    npc.happiness_score = Math.max(0, Math.round((npc.happiness_score - 12.0) * 100) / 100);
    organs.digestive = Math.max(0, Math.round((organs.digestive - 3.0) * 100) / 100);
  }

  // [5. Lối sống Tệ nạn (Rượu bia / Thuốc lá) & Tăng ca Ca Đêm (Karoshi — Module 3.10 & 3.23)]
  if (age >= 19 && age <= 65) {
    if (!flags.hasViceHabit) {
      const viceInitChance =
        pers === 'PERS_DAREDEVIL'
          ? 0.045
          : pers === 'PERS_EXTROVERT'
            ? 0.028
            : npc.happiness_score < 55
              ? 0.032
              : 0.008;
      if (Math.random() < viceInitChance) {
        flags.hasViceHabit = true;
      }
    }

    if (flags.hasViceHabit) {
      // Hút thuốc & nhậu nhẹt để lại sẹo mãn tính từ từ ở Gan, Phổi, Tim + tốn Sin Tax vừa phải
      flags.chronicOrganScar.liver = Math.min(55, flags.chronicOrganScar.liver + 0.28);
      flags.chronicOrganScar.lungs = Math.min(55, flags.chronicOrganScar.lungs + 0.24);
      flags.chronicOrganScar.heart = Math.min(55, flags.chronicOrganScar.heart + 0.2);
      organs.liver = Math.max(0, Math.round((organs.liver - 0.85) * 100) / 100);
      organs.lungs = Math.max(0, Math.round((organs.lungs - 0.75) * 100) / 100);
      organs.heart = Math.max(0, Math.round((organs.heart - 0.55) * 100) / 100);
      npc.cash_vnd = Math.max(0, npc.cash_vnd - 1800000);
    }

    // Nhóm Táo bạo hoặc lao động Q1/Q2 dễ tăng ca đêm -> tích lũy kiệt sức Karoshi ở tuổi 35-59
    if (
      age >= 35 &&
      age < 60 &&
      (pers === 'PERS_DAREDEVIL' || bio.family_tier === 'Q1' || bio.family_tier === 'Q2') &&
      Math.random() < 0.04
    ) {
      eventsCount = eventsCount + 1;
      flags.overtimeBurnoutQuarters = flags.overtimeBurnoutQuarters + 1;
      flags.chronicOrganScar.heart = Math.min(60, flags.chronicOrganScar.heart + 1.6);
      flags.chronicOrganScar.brain = Math.min(60, flags.chronicOrganScar.brain + 1.2);
      organs.heart = Math.max(0, Math.round((organs.heart - 5.0) * 100) / 100);
      organs.brain = Math.max(0, Math.round((organs.brain - 4.0) * 100) / 100);
      npc.happiness_score = Math.max(0, Math.round((npc.happiness_score - 8.0) * 100) / 100);

      // Khi đã tích lũy >= 2 đợt tăng ca kiệt sức hoặc Tim chịu sẹo >= 10pt -> nguy cơ đột quỵ Karoshi trong độ tuổi lao động
      if (
        (flags.overtimeBurnoutQuarters >= 2 || flags.chronicOrganScar.heart >= 10.0) &&
        Math.random() < 0.16
      ) {
        lifecycleStats.karoshi_strokes = lifecycleStats.karoshi_strokes + 1;
        return {
          extra_events_resolved: eventsCount,
          instant_death_cause_vi: 'Đột quỵ do kiệt sức lao động (Karoshi)'
        };
      }
    }
  }

  // [6. Ma Trận Tai Nạn Giao Thông Cấu Trúc (Module 3.5 — computeStructuralAccidentProbability)]
  if (age >= 16 && age <= 78) {
    const isStormSeason = month === 9 || month === 10;
    const envMult = isStormSeason ? 2.4 : 1.05;
    const effectiveBrakes = pers === 'PERS_DAREDEVIL' ? 42 : 78;
    const effectiveTires = npc.current_region === 'URBAN' ? 68 : 75;
    const probStructural = computeStructuralAccidentProbability({
      env_hazard_factor: asMultiplier(envMult),
      brakes_durability: asStat100(effectiveBrakes),
      tires_durability: asStat100(effectiveTires),
      energy_sleep_pct: asStat100(npc.hidden_black_box.energy_sleep_pct),
      is_intoxicated: flags.hasViceHabit && Math.random() < 0.22,
      has_required_license: age >= 18
    });

    // Quy đổi xác suất tai nạn theo quý (khoảng 1% - 3% tùy rủi ro thực tế)
    const quarterlyAccidentRoll = probStructural * 0.045;
    if (Math.random() < quarterlyAccidentRoll) {
      eventsCount = eventsCount + 1;
      lifecycleStats.traffic_accidents = lifecycleStats.traffic_accidents + 1;
      organs.musculoskeletal = Math.max(0, Math.round((organs.musculoskeletal - 14.0) * 100) / 100);
      npc.hidden_black_box.ptsd_trauma_score = Math.min(
        100,
        Math.round((npc.hidden_black_box.ptsd_trauma_score + 22.0) * 100) / 100
      );
      const hospitalBill = npc.has_social_insurance ? 650000 : 3200000;
      npc.cash_vnd = Math.max(0, npc.cash_vnd - hospitalBill);

      // Tỷ lệ nhỏ tai nạn cực nghiêm trọng gây tử vong nếu vừa mưa bão vừa có yếu tố say rượu/Táo bạo
      const fatalChance = isStormSeason && (flags.hasViceHabit || pers === 'PERS_DAREDEVIL') ? 0.14 : 0.05;
      if (Math.random() < fatalChance) {
        return {
          extra_events_resolved: eventsCount,
          instant_death_cause_vi: 'Tai nạn giao thông nghiêm trọng'
        };
      }
    }
  }

  // [7. Bệnh Mãn Tính Tuổi Trung Niên & Cái Bẫy Hộp Đen Thuốc Giảm Đau OTC (Module 3.1)]
  if (age >= 45 && Math.random() < 0.038 + Math.max(0, age - 60) * 0.002) {
    eventsCount = eventsCount + 1;
    lifecycleStats.chronic_illnesses = lifecycleStats.chronic_illnesses + 1;
    const chronicPool: Array<keyof OrganStateMap> = ['heart', 'liver', 'lungs', 'digestive', 'kidneys'];
    const struckOrgan = chronicPool[Math.floor(Math.random() * chronicPool.length)];
    const acuteDrop = 4.5 + Math.random() * 4.5;
    organs[struckOrgan] = Math.max(0, Math.round((organs[struckOrgan] - acuteDrop) * 100) / 100);

    // Nếu NPC ít tiền (< 4tr) hoặc tính cách Táo bạo -> dễ rơi vào bẫy tự mua thuốc giảm đau OTC
    if ((npc.cash_vnd < 4000000 || pers === 'PERS_DAREDEVIL') && Math.random() < 0.55) {
      lifecycleStats.otc_painkiller_traps = lifecycleStats.otc_painkiller_traps + 1;
      npc.cash_vnd = Math.max(0, npc.cash_vnd - 45000);
      // Không chữa đúng gốc -> để lại sẹo mãn tính vừa phải ở cơ quan bệnh và Gan
      flags.chronicOrganScar[struckOrgan] = Math.min(65, flags.chronicOrganScar[struckOrgan] + 2.4);
      flags.chronicOrganScar.liver = Math.min(65, flags.chronicOrganScar.liver + 1.6);
      organs.liver = Math.max(0, Math.round((organs.liver - 3.5) * 100) / 100);
    } else if (npc.cash_vnd >= 400000) {
      // Khám Bệnh viện & dùng thuốc kê đơn Rx giúp hạn chế sẹo mãn tính xuống rất nhẹ
      const treatCost = npc.has_social_insurance ? 450000 : 1800000;
      npc.cash_vnd = Math.max(0, npc.cash_vnd - treatCost);
      flags.chronicOrganScar[struckOrgan] = Math.min(65, flags.chronicOrganScar[struckOrgan] + 0.8);
      organs[struckOrgan] = Math.min(92, Math.round((organs[struckOrgan] + 4.5) * 100) / 100);
    } else {
      flags.chronicOrganScar[struckOrgan] = Math.min(65, flags.chronicOrganScar[struckOrgan] + 3.0);
    }
  }

  return { extra_events_resolved: eventsCount, instant_death_cause_vi: null };
}

export function runHeadlessCohortSimulation(config: CohortSimulationConfig): CohortTelemetryReport {
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
    const regionChoice: 'RURAL' | 'URBAN' = i % 2 === 0 ? 'RURAL' : 'URBAN';
    const session = createInMemoryTestSession(config.birth_year, i + 1, regionChoice);
    const npcLifecycleFlags: NpcLifecycleFlags = {
      didPuberty: false,
      didMilitary: false,
      isMarried: false,
      childrenCount: 0,
      // Biến thiên lão hóa cá thể nhẹ quanh 1.0x (0.85x - 1.25x), tránh tính trùng với trần tuổi cơ sở
      frailtyRateMultiplier: 0.85 + Math.random() * 0.4,
      hasViceHabit: false,
      overtimeBurnoutQuarters: 0,
      chronicOrganScar: {
        brain: 0,
        heart: 0,
        lungs: 0,
        liver: 0,
        digestive: 0,
        musculoskeletal: 0,
        kidneys: 0,
        integumentary_skin: 0
      }
    };

    let npcSteps = 0;
    let npcEvents = 0;
    let npcViolationCount = 0;
    const npcActionBuckets: CohortTelemetryReport['action_bucket_counts'] = {
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

    if (config.mode === 'FULL_YEAR_DETAILED') {
      // Cần vượt mốc 365 ngày (366) và nâng safetyGuard lên 16.000 nhịp (~24 nhịp/ngày x 366 = ~8.800 nhịp)
      // để mọi NPC sống sót đi trọn năm lớp 1 từ 6 tuổi lên đủ 7 tuổi
      const targetDays = 366;
      let safetyGuard = 0;
      while (
        !session.death_summary?.is_deceased &&
        session.clock.total_days_elapsed < targetDays &&
        safetyGuard < 16000
      ) {
        safetyGuard = safetyGuard + 1;
        const stepRes = stepAutonomousEntityTurn(session);
        npcSteps = npcSteps + 1;
        totalTicks = totalTicks + 1;

        classifyActionBucket(stepRes.action_result.message_vi, actionBuckets);
        classifyActionBucket(stepRes.action_result.message_vi, npcActionBuckets);

        if (rollAndResolveNpcEventOnce(session)) {
          npcEvents = npcEvents + 1;
          totalEvents = totalEvents + 1;
        }

        const hud = projectHumanEntityToFrontendHud(
          session.player,
          session.clock.current_hour,
          session.clock.current_minute
        );
        const stepViolations = checkSessionLogicInvariants(
          session,
          hud,
          stepRes.action_result.message_vi
        );
        for (const v of stepViolations) {
          npcViolationCount = npcViolationCount + 1;
          violationGrouped[v.rule_id] = (violationGrouped[v.rule_id] || 0) + 1;
          if (sampleViolations.length < 40) {
            sampleViolations.push(v);
          }
        }
      }
    } else {
      const maxQuarters = 90 * 4;
      for (let q = 0; q < maxQuarters; q++) {
        if (session.death_summary?.is_deceased) break;
        if (session.player.identity_biometrics.exact_age_years >= 95) break;

        for (let tick = 0; tick < 10; tick++) {
          if (session.death_summary?.is_deceased) break;
          const stepRes = stepAutonomousEntityTurn(session);
          npcSteps = npcSteps + 1;
          totalTicks = totalTicks + 1;
          classifyActionBucket(stepRes.action_result.message_vi, actionBuckets);
          classifyActionBucket(stepRes.action_result.message_vi, npcActionBuckets);

          if (rollAndResolveNpcEventOnce(session)) {
            npcEvents = npcEvents + 1;
            totalEvents = totalEvents + 1;
          }

          const hud = projectHumanEntityToFrontendHud(
            session.player,
            session.clock.current_hour,
            session.clock.current_minute
          );
          const stepViolations = checkSessionLogicInvariants(
            session,
            hud,
            stepRes.action_result.message_vi
          );
          for (const v of stepViolations) {
            npcViolationCount = npcViolationCount + 1;
            violationGrouped[v.rule_id] = (violationGrouped[v.rule_id] || 0) + 1;
            if (sampleViolations.length < 40) {
              sampleViolations.push(v);
            }
          }
        }

        if (session.death_summary?.is_deceased) break;

        // Nhảy tiến 3 tháng lịch (90 ngày) kèm thu chi sinh hoạt cơ bản & lão hóa tuổi 60+
        const npc = session.player;
        const prevAge = Math.floor(npc.identity_biometrics.exact_age_years);
        let nextMonth = session.clock.current_month + 3;
        let nextYear = session.clock.current_year;
        if (nextMonth > 12) {
          nextMonth = nextMonth - 12;
          nextYear = nextYear + 1;
        }
        session.clock.current_month = nextMonth;
        session.clock.current_year = nextYear;
        session.clock.total_days_elapsed = session.clock.total_days_elapsed + 90;

        const bio = npc.identity_biometrics;
        const passedBday =
          nextMonth > bio.birth_month ||
          (nextMonth === bio.birth_month && session.clock.current_day >= bio.birth_day);
        const newAge = Math.max(0, nextYear - bio.birth_year - (passedBday ? 0 : 1));
        bio.exact_age_years = newAge;

        const regionRules = EcoLifeJsonDb.regions.region_types[npc.current_region];
        const tierCareerMult: Record<string, number> = {
          Q1: 0.78,
          Q2: 0.9,
          Q3: 1.05,
          Q4: 1.28,
          Q5: 1.62
        };
        const careerMult = tierCareerMult[bio.family_tier] || 1.0;

        if (newAge >= 18 && newAge < 60) {
          // Hệ số thâm niên tăng dần theo độ tuổi lao động (18t: 0.85x -> 45-55t: 1.38x)
          const workYears = Math.max(0, newAge - 18);
          const experienceMult = Math.min(1.38, 0.85 + workYears * 0.02);
          const isTemporarilyUnemployed = Math.random() < (bio.family_tier === 'Q1' ? 0.14 : 0.08);
          const grossMonthly = isTemporarilyUnemployed
            ? 3200000 * regionRules.base_wage_multiplier
            : 8800000 * careerMult * experienceMult * regionRules.base_wage_multiplier;
          const bhxhAndTaxDeduction = npc.has_social_insurance ? grossMonthly * 0.115 : 0;
          // Chi phí nuôi con được chia sẻ 50/50 trong hộ gia đình khi đã kết hôn
          const childSharePerMonth = npcLifecycleFlags.isMarried ? 950000 : 1500000;
          const childExpenseMonthly =
            npcLifecycleFlags.childrenCount *
            (newAge <= 55 ? childSharePerMonth * regionRules.food_price_multiplier : 0);
          const livingCostMonthly =
            (2700000 + npc.house_tier * 950000) * regionRules.food_price_multiplier +
            childExpenseMonthly;
          const quarterlyNetIncome = Math.round(
            (grossMonthly - bhxhAndTaxDeduction - livingCostMonthly) * 3
          );
          npc.cash_vnd = Math.max(0, npc.cash_vnd + quarterlyNetIncome);
        } else if (newAge >= 60) {
          // Tuổi hưu: Có BHXH nhận lương hưu, không BHXH có trợ cấp tối thiểu / con cái phụng dưỡng một phần
          const pensionMonthly = npc.has_social_insurance
            ? 4500000 * careerMult * regionRules.base_wage_multiplier
            : 1800000 * regionRules.food_price_multiplier;
          const seniorLivingMonthly =
            (2300000 + npc.house_tier * 450000) * regionRules.food_price_multiplier;
          const quarterlySeniorNet = Math.round((pensionMonthly - seniorLivingMonthly) * 3);
          npc.cash_vnd = Math.max(0, npc.cash_vnd + quarterlySeniorNet);
        }

        // Bào mòn lạm phát CPI lên tiền mặt nhàn rỗi (~3.2%/năm = 0.8%/quý theo Master GDD Module 2.1)
        if (newAge >= 20 && npc.cash_vnd > 10000000) {
          npc.cash_vnd = Math.max(0, Math.round(npc.cash_vnd * 0.992));
        }

        // Bụi mịn đô thị bào mòn nhẹ Phổi theo quý
        const organs = npc.hidden_black_box.organs;
        if (npc.current_region === 'URBAN') {
          organs.lungs = Math.max(0, Math.round((organs.lungs - 0.2) * 100) / 100);
          npcLifecycleFlags.chronicOrganScar.lungs = Math.min(
            35,
            npcLifecycleFlags.chronicOrganScar.lungs + 0.05
          );
        }

        // Kích hoạt hệ thống Sự kiện Vòng đời & Ma trận Rủi ro Cấu trúc (Dậy thì, NVQS, Hôn nhân, Tai nạn, OTC, Karoshi)
        const lifecycleOutcome = simulateQuarterlyLifecycleAndRisks(
          session,
          npcLifecycleFlags,
          lifecycleEventsStats
        );
        npcEvents = npcEvents + lifecycleOutcome.extra_events_resolved;
        totalEvents = totalEvents + lifecycleOutcome.extra_events_resolved;

        // Lão hóa cá thể từ tuổi 60: Không cộng trùng vào sẹo toàn bộ 8 tạng (chỉ lệch nhẹ theo frailtyRateMultiplier)
        const agedYears = Math.max(0, newAge - prevAge);
        if (agedYears > 0 && newAge >= 60 && !lifecycleOutcome.instant_death_cause_vi) {
          const baseAnnualDecay = EcoLifeJsonDb.agingEndgame.aging_progression.annual_organ_decay_pct;
          const individualRate = baseAnnualDecay * npcLifecycleFlags.frailtyRateMultiplier;
          const extraOverBase = Math.max(0, individualRate - baseAnnualDecay) * agedYears;
          const totalDecay = individualRate * agedYears;
          const oKeys = Object.keys(organs) as Array<keyof OrganStateMap>;
          for (const ok of oKeys) {
            if (extraOverBase > 0) {
              npcLifecycleFlags.chronicOrganScar[ok] = Math.min(
                45,
                npcLifecycleFlags.chronicOrganScar[ok] + extraOverBase
              );
            }
            organs[ok] = Math.max(0, Math.round((organs[ok] - totalDecay) * 100) / 100);
          }

          if (newAge >= 65 && organs.brain < 25.0) {
            npc.capability_flags.is_dementia_autopilot = true;
            npc.controller_mode = 'AI_AUTONOMOUS';
          }
        }

        // Áp trần sẹo tổn thương vĩnh viễn: Giấc ngủ sâu không thể hồi xuyên qua sẹo bệnh mãn tính
        if (!lifecycleOutcome.instant_death_cause_vi) {
          const seniorYears = Math.max(0, newAge - 59);
          const baseAgeCap = Math.max(10, 94 - 2.0 * seniorYears);
          const oKeys = Object.keys(organs) as Array<keyof OrganStateMap>;
          for (const ok of oKeys) {
            const scarredCap = Math.max(
              0,
              Math.round((baseAgeCap - npcLifecycleFlags.chronicOrganScar[ok]) * 100) / 100
            );
            if (organs[ok] > scarredCap) {
              organs[ok] = scarredCap;
            }
          }
        }

        const deathCheck = evaluateDeathCondition(npc, lifecycleOutcome.instant_death_cause_vi);
        if (deathCheck.is_dead && deathCheck.cause_label_vi) {
          session.death_summary = buildDeathAndMemoirSummary(
            session,
            deathCheck.cause_label_vi,
            deathCheck.epitaph_vi
          );
        }
      }
    }

    const finalAge = Math.floor(session.player.identity_biometrics.exact_age_years);
    const isDead = Boolean(session.death_summary?.is_deceased);
    const causeVi = session.death_summary?.cause_label_vi || 'Còn sống (Kết thúc đợt mô phỏng)';

    sumFinalAge = sumFinalAge + finalAge;
    if (finalAge < minAge) minAge = finalAge;
    if (finalAge > maxAge) maxAge = finalAge;
    if (isDead) {
      deceasedCount = deceasedCount + 1;
      deathCauses[causeVi] = (deathCauses[causeVi] || 0) + 1;
    }

    if (session.player.current_region === 'RURAL') {
      ruralCashSum = ruralCashSum + session.player.cash_vnd;
      ruralCount = ruralCount + 1;
    } else {
      urbanCashSum = urbanCashSum + session.player.cash_vnd;
      urbanCount = urbanCount + 1;
    }

    // Tìm cơ quan nội tạng yếu nhất lúc kết thúc mô phỏng để dễ soi nguyên nhân suy tạng trên CSV
    const finalOrgans = session.player.hidden_black_box.organs;
    const organKeyList = Object.keys(finalOrgans) as Array<keyof OrganStateMap>;
    let weakestKey: keyof OrganStateMap = 'brain';
    let weakestScore = finalOrgans.brain;
    for (const oKey of organKeyList) {
      if (finalOrgans[oKey] < weakestScore) {
        weakestScore = finalOrgans[oKey];
        weakestKey = oKey;
      }
    }

    const finalBox = session.player.hidden_black_box;
    const debuffListStr =
      finalBox.overuse_tracker.active_debuff_ids.length > 0
        ? finalBox.overuse_tracker.active_debuff_ids.join('|')
        : 'NONE';

    individualOutcomes.push({
      npc_name: session.player.identity_biometrics.full_name,
      gender: session.player.identity_biometrics.gender,
      region: session.player.current_region,
      family_tier: session.player.identity_biometrics.family_tier,
      personality_vi: translateVi(
        session.player.identity_biometrics.locked_personality || 'PERS_AMBIVERT'
      ),
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
      weakest_organ_key: weakestKey,
      weakest_organ_score: weakestScore,
      dementia_triggered: session.player.capability_flags.is_dementia_autopilot,
      active_debuffs: debuffListStr,
      act_eat: npcActionBuckets.eat,
      act_sleep: npcActionBuckets.sleep,
      act_hygiene: npcActionBuckets.hygiene,
      act_study: npcActionBuckets.study,
      act_work: npcActionBuckets.work,
      act_part_time: npcActionBuckets.part_time,
      act_travel: npcActionBuckets.travel,
      act_medical: npcActionBuckets.medical,
      act_truancy_scold: npcActionBuckets.truancy_scold,
      total_steps_run: npcSteps,
      events_resolved: npcEvents,
      violation_count: npcViolationCount
    });
  }

  // Tính chỉ số bất bình đẳng Gini & thống kê tài sản (chuẩn đơn vị Vnd / Norm01)
  const wealthStats = computeWealthDistributionStats(
    individualOutcomes.map((o) => o.final_cash_vnd),
    asVnd(2000000)
  );

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
    median_cash_vnd: wealthStats.median_vnd,
    min_cash_vnd: wealthStats.min_vnd,
    max_cash_vnd: wealthStats.max_vnd,
    gini_index: wealthStats.gini_index,
    at_risk_npc_count: wealthStats.at_risk_count,
    at_risk_ratio_pct: wealthStats.at_risk_ratio_pct,
    death_causes_breakdown: deathCauses,
    action_bucket_counts: actionBuckets,
    lifecycle_events_breakdown: lifecycleEventsStats,
    violation_grouped_summary: violationGrouped,
    sample_violations: sampleViolations,
    individual_outcomes: individualOutcomes
  };
}

// ============================================================================
// HÀM XUẤT BÁO CÁO CSV CHUẨN UTF-8 BOM (DÙNG ĐỂ PHÂN TÍCH CÂN BẰNG CÔNG THỨC)
// ============================================================================

function escapeCsvCell(value: string | number | boolean): string {
  const str = String(value);
  // Bọc ngoặc kép nếu ô chứa dấu phẩy, ngoặc kép hoặc xuống dòng để không lệch cột CSV
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Xuất bảng phẳng chi tiết từng NPC (1 dòng = 1 cuộc đời NPC) kèm đầy đủ 8 tạng, 5 nhu cầu,
 * hành vi AI và trạng thái tử vong để mở Excel hoặc gửi phân tích dữ liệu.
 */
export function buildCohortIndividualCsvContent(report: CohortTelemetryReport): string {
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

  for (let idx = 0; idx < report.individual_outcomes.length; idx++) {
    const npc = report.individual_outcomes[idx];
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
  }

  // Thêm ký tự BOM \uFEFF ở đầu để Excel nhận đúng tiếng Việt có dấu UTF-8
  return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * Xuất báo cáo CSV tổng hợp toàn đợt mô phỏng, phân bố nguyên nhân chết, 8 Test Biên
 * và danh sách mẫu vi phạm bất biến (nếu có).
 */
export function buildCohortSummaryAndAuditCsvContent(
  report: CohortTelemetryReport,
  edgeReports: EdgeCaseTestReport[]
): string {
  const lines: string[] = ['section,key_or_id,value_or_status,detail_vi'];

  // 1. Các chỉ số tổng quát toàn quần thể
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
  for (const [k, v, desc] of summaryRows) {
    lines.push(['SUMMARY', k, v, desc].map(escapeCsvCell).join(','));
  }

  // 2. Tổng phân bố hành vi AI toàn quần thể
  for (const [actKey, actCnt] of Object.entries(report.action_bucket_counts)) {
    lines.push(['ACTION_TOTALS', actKey, actCnt, 'Tổng lượt thực hiện hành vi'].map(escapeCsvCell).join(','));
  }

  // 2B. Thống kê các biến cố vòng đời & rủi ro cấu trúc (Master GDD)
  for (const [lcKey, lcCnt] of Object.entries(report.lifecycle_events_breakdown)) {
    lines.push(
      ['LIFECYCLE_EVENTS', lcKey, lcCnt, 'Số lượt biến cố vòng đời & rủi ro kích hoạt']
        .map(escapeCsvCell)
        .join(',')
    );
  }

  // 3. Phân bố nguyên nhân tử vong
  for (const [cause, cnt] of Object.entries(report.death_causes_breakdown)) {
    lines.push(['DEATH_CAUSES', cause, cnt, 'Số NPC qua đời theo nguyên nhân'].map(escapeCsvCell).join(','));
  }

  // 4. Kết quả 8 kịch bản Test Biên định lượng
  for (const edge of edgeReports) {
    lines.push(
      ['EDGE_TEST', edge.test_id, edge.passed ? 'PASS' : 'FAIL', `${edge.title_vi} | ${edge.evidence_vi}`]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  // 5. Danh sách vi phạm bất biến (nếu phát hiện lỗi logic)
  if (report.sample_violations.length === 0) {
    lines.push(['INVARIANT_VIOLATION', 'NONE', 0, 'Sạch lỗi 7 bất biến logic'].map(escapeCsvCell).join(','));
  } else {
    for (const v of report.sample_violations) {
      lines.push(
        ['INVARIANT_VIOLATION', v.rule_id, v.severity, `${v.npc_label} (${v.age_and_date_vi}): ${v.detail_vi}`]
          .map(escapeCsvCell)
          .join(',')
      );
    }
  }

  return `\uFEFF${lines.join('\r\n')}`;
}