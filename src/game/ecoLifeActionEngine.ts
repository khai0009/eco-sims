// Bộ xử lý các thao tác đời sống cốt lõi cho Dòng Đời (Eco-Life)
// Dùng chung 100% cho cả Người chơi (PLAYER_CONTROLLED) và Máy (AI_AUTONOMOUS).
// Phong cách: Phẳng, tuần tự 5 bước, chỉ dùng phép cộng/trừ/nhân/chia cơ bản và if / else.

import {
  EcoLifeJsonDb,
  type PersonalityCode,
  calculateDistanceKmBetweenLocations,
  getFurnitureDefById,
  translateVi
} from './jsonDatabaseLoader';
import type {
  HumanEntityState,
  OwnedInventoryItemInstance
} from './sensoryProjectionAdapter';

// ============================================================================
// 1. INTERFACE ĐẦU VÀO & ĐẦU RA CỦA HÀM HÀNH ĐỘNG
// ============================================================================

export type FamilyTierCode = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5';

export interface ActionExecutionResult {
  ok: boolean;
  message_vi: string;
  minutes_elapsed: number;
  cutscene_caption_vi: string | null;
  auto_save_trigger: 'ACTION_COMPLETED' | null;
  journal_entry_added_vi?: string | null;
}

export interface CreateHumanEntityParams {
  entityId: string;
  birthYear: number; // Lựa chọn duy nhất của người chơi
  fullName?: string; // Nếu bỏ trống sẽ tự động random tên tiếng Việt
  gender?: 'MALE' | 'FEMALE'; // Nếu bỏ trống sẽ random 50/50
  familyTier?: FamilyTierCode; // Nếu bỏ trống sẽ random Q1 -> Q5
  birthRegion?: 'RURAL' | 'URBAN'; // Nếu bỏ trống sẽ random Nông thôn / Thành thị
  controllerMode?: 'PLAYER_CONTROLLED' | 'AI_AUTONOMOUS';
}

// ============================================================================
// 2. HÀM TIỆN ÍCH CƠ BẢN (GIỚI HẠN 0-100, TÍNH KG TÚI ĐỒ, TÍNH TRÔI LỐ GIỜ)
// ============================================================================

export function clampNumber(value: number, minVal: number, maxVal: number): number {
  if (value < minVal) {
    return minVal;
  }
  if (value > maxVal) {
    return maxVal;
  }
  return Math.round(value * 100) / 100;
}

export function calculateCarryWeightStatus(entity: HumanEntityState): {
  currentWeightKg: number;
  maxCapacityKg: number;
  isOverburdened: boolean;
} {
  let currentWeight = 0.0;
  let maxCapacity = 5.0; // Khởi điểm túi quần áo cơ bản

  for (const item of entity.inventory_items) {
    currentWeight = currentWeight + item.weight_kg;
    if (item.item_def_id === 'ITEM_BACKPACK_STANDARD' && item.current_durability_pct >= 5.0) {
      maxCapacity = maxCapacity + 10.0;
    }
  }

  // Người già từ 60 tuổi trở lên giảm sức mang vác còn 70%
  if (entity.identity_biometrics.exact_age_years >= 60) {
    maxCapacity =
      maxCapacity *
      EcoLifeJsonDb.agingEndgame.aging_progression.senior_carry_capacity_multiplier;
  }

  return {
    currentWeightKg: Math.round(currentWeight * 10) / 10,
    maxCapacityKg: Math.round(maxCapacity * 10) / 10,
    isOverburdened: currentWeight > maxCapacity
  };
}

export function calculateActualActionMinutes(
  entity: HumanEntityState,
  baseMinutes: number,
  isReadingOrPaperwork: boolean = false,
  isMovementAction: boolean = false
): number {
  let finalMinutes = baseMinutes;

  // Kiểm tra trôi lố thời gian khi chưa có kỹ năng Quản lý thời gian
  if (!entity.capability_flags.is_time_management_unlocked) {
    finalMinutes = finalMinutes * 1.25;
  }

  // [Module 3.10] Thức quá 18 tiếng: đầu óc lơ mơ, giảm -30% hiệu suất -> thao tác kéo dài thêm 1.3x
  if (entity.hidden_black_box.hours_awake_continuous > 18.0) {
    finalMinutes = finalMinutes * 1.3;
  }

  // Kiểm tra chứng Khó đọc (TRAIT_DYSLEXIA)
  if (
    isReadingOrPaperwork &&
    entity.identity_biometrics.innate_traits.includes('TRAIT_DYSLEXIA')
  ) {
    finalMinutes = finalMinutes * 1.45;
  }

  // Kiểm tra mang đồ quá tải khi di chuyển
  if (isMovementAction) {
    const weightStatus = calculateCarryWeightStatus(entity);
    if (weightStatus.isOverburdened) {
      finalMinutes = finalMinutes * 1.3;
    }
  }

  return Math.max(1, Math.round(finalMinutes));
}

// ============================================================================
// 3. KHỞI TẠO THỰC THỂ CON NGƯỜI THỐNG NHẤT & KHÓA TÍNH CÁCH TUỔI LÊN 6
// ============================================================================

const RANDOM_LAST_NAMES = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Đặng',
  'Bùi'
];
const RANDOM_MALE_NAMES = [
  'Minh An',
  'Văn Bình',
  'Hoàng Long',
  'Đức Huy',
  'Quốc Bảo',
  'Gia Huy',
  'Tuấn Kiệt'
];
const RANDOM_FEMALE_NAMES = [
  'Thị Mai',
  'Ngọc Lan',
  'Thanh Thảo',
  'Minh Thư',
  'Phương Anh',
  'Khánh Linh',
  'Thu Hà'
];

export function createInitialHumanEntity(params: CreateHumanEntityParams): HumanEntityState {
  // [1. Lấy ngày tháng thực tế hiện tại]
  const now = new Date();
  const realDay = now.getDate();
  const realMonth = now.getMonth() + 1;

  // [2. Random Giới tính, Họ tên, Gia cảnh Q1-Q5 và Vùng miền nếu chưa chỉ định]
  const resolvedGender: 'MALE' | 'FEMALE' =
    params.gender || (Math.random() < 0.5 ? 'MALE' : 'FEMALE');

  const lastName = RANDOM_LAST_NAMES[Math.floor(Math.random() * RANDOM_LAST_NAMES.length)];
  const firstNamePool = resolvedGender === 'MALE' ? RANDOM_MALE_NAMES : RANDOM_FEMALE_NAMES;
  const firstName = firstNamePool[Math.floor(Math.random() * firstNamePool.length)];
  const resolvedFullName = params.fullName || `${lastName} ${firstName}`;

  const tierPool: FamilyTierCode[] = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const resolvedFamilyTier: FamilyTierCode =
    params.familyTier || tierPool[Math.floor(Math.random() * tierPool.length)];

  const resolvedRegion: 'RURAL' | 'URBAN' =
    params.birthRegion || (Math.random() < 0.55 ? 'RURAL' : 'URBAN');

  // Tiền mặt khởi điểm tùy theo gia cảnh Q1 -> Q5
  const startingCashByTier: Record<FamilyTierCode, number> = {
    Q1: 0,
    Q2: 200000,
    Q3: 1500000,
    Q4: 5000000,
    Q5: 20000000
  };

  return {
    entity_id: params.entityId,
    controller_mode: params.controllerMode || 'PLAYER_CONTROLLED',
    current_region: resolvedRegion,
    current_location_id: 'LOC_HOME',
    current_sub_node_id: 'HOME_LIVING_ROOM',
    cash_vnd: startingCashByTier[resolvedFamilyTier],
    happiness_score: 75.0,
    identity_biometrics: {
      full_name: resolvedFullName,
      gender: resolvedGender,
      birth_day: realDay,
      birth_month: realMonth,
      birth_year: params.birthYear,
      family_tier: resolvedFamilyTier,
      exact_age_years: 0,
      height_cm: 50,
      weight_kg: 3.2,
      education_level_key: 'Chưa đi học',
      hobby_key: null,
      locked_personality: null,
      innate_traits: []
    },
    hidden_black_box: {
      organs: {
        brain: 90.0,
        heart: 90.0,
        lungs: 90.0,
        liver: 90.0,
        digestive: 90.0,
        musculoskeletal: 90.0,
        kidneys: 90.0,
        integumentary_skin: 90.0
      },
      sleep_debt_hours: 0.0,
      hours_awake_continuous: 0.0,
      hours_since_last_meal: 2.0,
      bladder_urgency_pct: 20.0,
      body_hygiene_pct: 85.0,
      naps_taken_since_full_sleep: 0,
      ptsd_trauma_score: 0.0,
      painkiller_masked_hours_left: 0.0
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
    inventory_items: []
  };
}

export function lockChildhoodPersonalityAtAgeSix(
  entity: HumanEntityState,
  votes: Array<'A' | 'B' | 'C' | 'D'>
): PersonalityCode {
  let countA = 0;
  let countB = 0;
  let countC = 0;
  let countD = 0;

  for (const vote of votes) {
    if (vote === 'A') countA = countA + 1;
    if (vote === 'B') countB = countB + 1;
    if (vote === 'C') countC = countC + 1;
    if (vote === 'D') countD = countD + 1;
  }

  let locked: PersonalityCode = 'PERS_AMBIVERT';
  if (countA >= 3) {
    locked = 'PERS_INTROVERT';
  } else if (countB >= 3) {
    locked = 'PERS_EXTROVERT';
  } else if (countC >= 3) {
    locked = 'PERS_DAREDEVIL';
  } else if (countD >= 3) {
    locked = 'PERS_EMPATHETIC';
  }

  entity.identity_biometrics.exact_age_years = 6;
  entity.identity_biometrics.height_cm = 115;
  entity.identity_biometrics.weight_kg = 20;
  entity.identity_biometrics.locked_personality = locked;
  entity.identity_biometrics.hobby_key = 'Đọc truyện & Khám phá';
  entity.identity_biometrics.education_level_key = 'Học sinh Tiểu học';

  return locked;
}

// ============================================================================
// 4. CÁC HÀM THAO TÁC ĐỜI SỐNG THEO ĐÚNG 5 BƯỚC PHẲNG
// ============================================================================

export function executeBuyHomeFurniture(
  entity: HumanEntityState,
  furnitureId: string
): ActionExecutionResult {
  const furnDef = getFurnitureDefById(furnitureId);
  if (!furnDef) {
    return {
      ok: false,
      message_vi: 'Không tìm thấy thông tin món nội thất này.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (!furnDef.sold_at_location_ids.includes(entity.current_location_id)) {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const isSecondhandShop = entity.current_location_id === 'LOC_SECONDHAND_ELECTRONICS';
  const finalPriceVnd = isSecondhandShop
    ? Math.round(furnDef.base_price_vnd * 0.45)
    : furnDef.base_price_vnd;
  const initialDurabilityPct = isSecondhandShop ? 60.0 : 100.0;

  if (entity.cash_vnd < finalPriceVnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - finalPriceVnd;
  const elapsedMinutes = calculateActualActionMinutes(entity, 30, false, false);

  entity.owned_furniture.push({
    instance_id: `FURN_INST_${entity.owned_furniture.length + 1}`,
    furniture_id: furnDef.furniture_id,
    current_durability_pct: initialDurabilityPct
  });
  entity.happiness_score = clampNumber(entity.happiness_score + 6.0, 0, 100);

  return {
    ok: true,
    message_vi: `Đã mua ${translateVi(furnDef.name_key)} và vận chuyển về đặt tại nhà riêng!`,
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: translateVi('ACT_TRAVEL_ROAD'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeInteractWithFurniture(
  entity: HumanEntityState,
  furnitureId: string,
  actionId: string
): ActionExecutionResult {
  if (entity.current_location_id !== 'LOC_HOME') {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const ownedFurn = entity.owned_furniture.find((f) => f.furniture_id === furnitureId);
  const furnDef = getFurnitureDefById(furnitureId);

  if (!ownedFurn || !furnDef) {
    return {
      ok: false,
      message_vi: 'Trong phòng chưa có thiết bị này.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (ownedFurn.current_durability_pct < furnDef.durability_rules.broken_threshold_pct) {
    return {
      ok: false,
      message_vi: translateVi('err_item_broken'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const actionDef = furnDef.interactable_actions.find((a) => a.action_id === actionId);
  if (!actionDef) {
    return {
      ok: false,
      message_vi: 'Thao tác không hợp lệ trên thiết bị này.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const elapsedMinutes = calculateActualActionMinutes(
    entity,
    actionDef.duration_minutes,
    false,
    false
  );
  const wearPct = furnDef.durability_rules.wear_per_use_pct || 0.25;

  if (actionDef.restores_durability_pct) {
    ownedFurn.current_durability_pct = clampNumber(
      ownedFurn.current_durability_pct + actionDef.restores_durability_pct,
      0,
      100
    );
  } else {
    ownedFurn.current_durability_pct = clampNumber(
      ownedFurn.current_durability_pct - wearPct,
      0,
      100
    );
  }

  if (actionDef.happiness_delta) {
    entity.happiness_score = clampNumber(
      entity.happiness_score + actionDef.happiness_delta,
      0,
      100
    );
  }

  if (actionDef.produces_item_id === 'ITEM_FOOD_HOME_COOKED_MEAL') {
    const newMeal: OwnedInventoryItemInstance = {
      instance_id: `ITEM_MEAL_${entity.inventory_items.length + 1}`,
      item_def_id: 'ITEM_FOOD_HOME_COOKED_MEAL',
      display_name_key: 'Bữa cơm nhà nấu nóng hổi',
      category: 'FOOD',
      usage_type: 'CONSUMABLE',
      weight_kg: 0.5,
      current_durability_pct: 100.0,
      remaining_servings: 1
    };
    entity.inventory_items.push(newMeal);
  }

  if (actionId === 'ACT_WATCH_NEWS_WEATHER') {
    entity.capability_flags.is_weather_app_visible = true;
  }
  if (actionId === 'ACT_PC_CHECK_TIME_AND_CHAT') {
    entity.capability_flags.is_clock_visible = true;
  }

  return {
    ok: true,
    message_vi: translateVi(actionDef.label_key),
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi:
      actionId === 'ACT_COOK_FRESH_MEAL'
        ? translateVi('ACT_COOK_MEAL')
        : translateVi(actionDef.label_key),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeSleepOrNapAction(
  entity: HumanEntityState,
  sleepActionId: string
): ActionExecutionResult {
  if (entity.current_location_id !== 'LOC_HOME') {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const sleepAct = EcoLifeJsonDb.sleep.sleep_and_nap_actions.find(
    (a) => a.action_id === sleepActionId
  );
  if (!sleepAct) {
    return {
      ok: false,
      message_vi: 'Không tìm thấy chế độ nghỉ ngơi này.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (!sleepAct.allowed_sub_nodes.includes(entity.current_sub_node_id)) {
    return {
      ok: false,
      message_vi: 'Hãy vào Phòng ngủ hoặc Phòng khách để nằm nghỉ.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const elapsedMinutes = sleepAct.duration_minutes;
  const hoursSlept = elapsedMinutes / 60.0;

  // Phân biệt rạch ròi giữa Ngủ sâu dài (FULL_SLEEP >= 4 tiếng) và Chợp mắt ngắn (POWER_NAP / SHORT_REST)
  if (sleepAct.category === 'FULL_SLEEP') {
    const debtReduction = hoursSlept * 2.0;
    entity.hidden_black_box.sleep_debt_hours = clampNumber(
      entity.hidden_black_box.sleep_debt_hours - debtReduction,
      0,
      100
    );
    entity.hidden_black_box.hours_awake_continuous = 0.0;
    entity.hidden_black_box.naps_taken_since_full_sleep = 0;

    const brainBonus = hoursSlept * 1.3;
    entity.hidden_black_box.organs.brain = clampNumber(
      entity.hidden_black_box.organs.brain + brainBonus,
      0,
      100
    );
    entity.hidden_black_box.organs.digestive = clampNumber(
      entity.hidden_black_box.organs.digestive + 1.0,
      0,
      100
    );

    return {
      ok: true,
      message_vi: translateVi(sleepAct.label_key),
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: translateVi('ACT_SLEEP'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  // Trường hợp chợp mắt ngắn (20p / 45p / 90p): Chỉ giảm nhẹ cơn buồn ngủ, KHÔNG reset giờ thức về 0
  entity.hidden_black_box.naps_taken_since_full_sleep =
    entity.hidden_black_box.naps_taken_since_full_sleep + 1;

  const napHoursRelief = sleepAct.sleep_debt_reduction_hours || 1.5;
  entity.hidden_black_box.sleep_debt_hours = clampNumber(
    entity.hidden_black_box.sleep_debt_hours - napHoursRelief,
    0,
    100
  );
  entity.hidden_black_box.hours_awake_continuous = Math.max(
    0,
    entity.hidden_black_box.hours_awake_continuous - 1.5
  );

  // Phạt nếu lạm dụng chợp mắt vặt từ lần thứ 2 trở lên thay vì ngủ giấc đêm trọn vẹn
  if (entity.hidden_black_box.naps_taken_since_full_sleep >= 2) {
    entity.hidden_black_box.organs.brain = clampNumber(
      entity.hidden_black_box.organs.brain - 1.5,
      0,
      100
    );
    entity.hidden_black_box.organs.digestive = clampNumber(
      entity.hidden_black_box.organs.digestive - 1.0,
      0,
      100
    );
    entity.happiness_score = clampNumber(entity.happiness_score - 3.0, 0, 100);

    return {
      ok: true,
      message_vi:
        'Chợp mắt lắt nhắt nhiều lần mà không ngủ giấc đêm trọn vẹn khiến cơ thể mệt mỏi, đầu óc nặng trĩu!',
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: translateVi('ACT_SLEEP'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const brainBonus = sleepAct.brain_recovery_bonus || 1.0;
  entity.hidden_black_box.organs.brain = clampNumber(
    entity.hidden_black_box.organs.brain + brainBonus,
    0,
    100
  );

  if (sleepAct.happiness_delta) {
    entity.happiness_score = clampNumber(
      entity.happiness_score + sleepAct.happiness_delta,
      0,
      100
    );
  }

  return {
    ok: true,
    message_vi: translateVi(sleepAct.label_key),
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: translateVi('ACT_SLEEP'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

/**
 * Thao tác Ăn uống (dùng chung cho cả Người chơi & AI tự hành).
 * Hỗ trợ ăn cơm nhà nấu hoặc mua suất ăn bình dân ngoài phố.
 */
export function executeEatAndDrinkAction(
  entity: HumanEntityState,
  mealMode: 'HOME_COOKED' | 'STREET_FOOD'
): ActionExecutionResult {
  const isChildSupported = entity.identity_biometrics.exact_age_years < 18;
  const regionFoodMult =
    EcoLifeJsonDb.regions.region_types[entity.current_region].food_price_multiplier || 1.0;

  let costVnd = mealMode === 'HOME_COOKED' ? 20000 : 35000;
  costVnd = Math.round(costVnd * regionFoodMult);

  // Dưới 18 tuổi ở nhà được gia đình bao cấp bữa ăn
  if (isChildSupported && mealMode === 'HOME_COOKED') {
    costVnd = 0;
  }

  if (entity.cash_vnd < costVnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 15,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - costVnd;
  const elapsedMinutes = calculateActualActionMinutes(entity, 30, false, false);

  entity.hidden_black_box.hours_since_last_meal = 0.0;
  entity.hidden_black_box.bladder_urgency_pct = clampNumber(
    entity.hidden_black_box.bladder_urgency_pct + 18.0,
    0,
    100
  );

  if (mealMode === 'HOME_COOKED') {
    entity.hidden_black_box.organs.digestive = clampNumber(
      entity.hidden_black_box.organs.digestive + 2.0,
      0,
      100
    );
    entity.happiness_score = clampNumber(entity.happiness_score + 3.0, 0, 100);
  } else {
    entity.hidden_black_box.organs.digestive = clampNumber(
      entity.hidden_black_box.organs.digestive + 0.5,
      0,
      100
    );
    entity.happiness_score = clampNumber(entity.happiness_score + 1.5, 0, 100);
  }

  const msg =
    mealMode === 'HOME_COOKED'
      ? `Nấu và ăn bữa cơm nóng tại nhà (${costVnd === 0 ? 'Gia đình chuẩn bị' : `-${costVnd.toLocaleString('vi-VN')}đ`}).`
      : `Ăn suất cơm bình dân & uống nước (-${costVnd.toLocaleString('vi-VN')}đ).`;

  return {
    ok: true,
    message_vi: msg,
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: translateVi('ACT_EAT_MEAL'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

/**
 * Thao tác Vệ sinh cá nhân (tách riêng Đi vệ sinh bảo vệ Thận và Tắm rửa bảo vệ Da).
 */
export function executeBathroomHygieneAction(
  entity: HumanEntityState,
  hygieneMode: 'USE_TOILET' | 'TAKE_SHOWER'
): ActionExecutionResult {
  if (hygieneMode === 'USE_TOILET') {
    entity.hidden_black_box.bladder_urgency_pct = 0.0;
    return {
      ok: true,
      message_vi: 'Đi vệ sinh giải tỏa căng tức bàng quang.',
      minutes_elapsed: 10,
      cutscene_caption_vi: translateVi('ACT_USE_TOILET'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (entity.current_location_id !== 'LOC_HOME') {
    return {
      ok: false,
      message_vi: 'Chỉ có thể tắm rửa tại Nhà Tắm ở nhà riêng.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.hidden_black_box.body_hygiene_pct = 100.0;
  entity.hidden_black_box.organs.integumentary_skin = clampNumber(
    entity.hidden_black_box.organs.integumentary_skin + 1.5,
    0,
    100
  );
  entity.happiness_score = clampNumber(entity.happiness_score + 2.5, 0, 100);

  return {
    ok: true,
    message_vi: 'Tắm nước ấm sạch sẽ, cơ thể sảng khoái dễ chịu.',
    minutes_elapsed: 25,
    cutscene_caption_vi: translateVi('ACT_TAKE_SHOWER'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeMedicalVisit(
  entity: HumanEntityState,
  visitType: 'HOSPITAL_FULL_EXAM' | 'PHARMACY_OTC_PAINKILLER',
  hasSocialInsurance: boolean = false
): ActionExecutionResult {
  if (visitType === 'PHARMACY_OTC_PAINKILLER') {
    if (entity.current_location_id !== 'LOC_PHARMACY') {
      return {
        ok: false,
        message_vi: translateVi('err_location_mismatch'),
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    const otcPrice = 45000;
    if (entity.cash_vnd < otcPrice) {
      return {
        ok: false,
        message_vi: translateVi('err_insufficient_cash'),
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    entity.cash_vnd = entity.cash_vnd - otcPrice;
    const elapsedMinutes = calculateActualActionMinutes(entity, 15, false, false);

    entity.hidden_black_box.painkiller_masked_hours_left = 6.0;
    entity.hidden_black_box.organs.liver = clampNumber(
      entity.hidden_black_box.organs.liver - 4.0,
      0,
      100
    );

    return {
      ok: true,
      message_vi: translateVi('mono_symptom_masked_by_painkiller'),
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (entity.current_location_id !== 'LOC_HOSPITAL') {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const baseHospitalFee = 800000;
  const discountRate = hasSocialInsurance
    ? EcoLifeJsonDb.bankingHousing.tax_and_social_insurance.social_insurance
        .hospital_bill_discount_rate
    : 0.0;
  const finalHospitalFee = Math.round(baseHospitalFee * (1.0 - discountRate));

  if (entity.cash_vnd < finalHospitalFee) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - finalHospitalFee;
  const elapsedMinutes = 360;

  entity.capability_flags.is_biometrics_decoded = true;
  entity.hidden_black_box.painkiller_masked_hours_left = 0.0;

  const medicalReportItem: OwnedInventoryItemInstance = {
    instance_id: `MED_REPORT_${entity.inventory_items.length + 1}`,
    item_def_id: 'ITEM_MEDICAL_REPORT',
    display_name_key: 'Phiếu Kết Quả Khám Bệnh Đa Khoa',
    category: 'OTHER',
    usage_type: 'DURABLE_REUSABLE',
    weight_kg: 0.1,
    current_durability_pct: 100.0
  };
  entity.inventory_items.push(medicalReportItem);

  return {
    ok: true,
    message_vi:
      'Đã hoàn tất xét nghiệm 6 nội tạng và nhận Phiếu Kết Quả Khám Bệnh lưu vào túi đồ.',
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: translateVi('ACT_HOSPITAL_EXAM'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeTravelToLocation(
  entity: HumanEntityState,
  targetLocationId: string,
  currentHour: number,
  currentWeather: 'CLEAR' | 'RAIN' | 'STORM_FLOOD',
  currentFuelLiters: number = 2.0
): {
  result: ActionExecutionResult;
  remainingFuelLiters: number;
} {
  const distanceKm = calculateDistanceKmBetweenLocations(
    entity.current_location_id,
    targetLocationId
  );

  const isOutOfFuel = currentFuelLiters <= 0.0;
  const speedKmh = isOutOfFuel ? 3.5 : 30.0;

  const isRushHour =
    (currentHour >= 7 && currentHour <= 8) || (currentHour >= 17 && currentHour <= 19);
  const regionRules = EcoLifeJsonDb.regions.region_types[entity.current_region];
  const trafficMultiplier = isRushHour ? regionRules.rush_hour_traffic_multiplier : 1.0;

  let weatherMultiplier = 1.0;
  if (currentWeather === 'RAIN') weatherMultiplier = 1.3;
  if (currentWeather === 'STORM_FLOOD') weatherMultiplier = 2.5;

  const rawMinutes = (distanceKm / speedKmh) * 60.0 * trafficMultiplier * weatherMultiplier;
  const elapsedMinutes = calculateActualActionMinutes(entity, rawMinutes, false, true);

  let nextFuel = currentFuelLiters;
  if (!isOutOfFuel) {
    nextFuel = Math.max(0.0, Math.round((currentFuelLiters - distanceKm * 0.022) * 100) / 100);
  }

  entity.current_location_id = targetLocationId;
  entity.current_sub_node_id =
    targetLocationId === 'LOC_HOME' ? 'HOME_LIVING_ROOM' : 'MAIN_HALL';

  const carryStatus = calculateCarryWeightStatus(entity);
  if (isOutOfFuel || carryStatus.isOverburdened) {
    entity.hidden_black_box.organs.musculoskeletal = clampNumber(
      entity.hidden_black_box.organs.musculoskeletal - distanceKm * 0.4,
      0,
      100
    );
  }

  const arrivalMessage = isOutOfFuel
    ? translateVi('err_fuel_empty')
    : `Đã di chuyển tới ${translateVi(targetLocationId)} (${distanceKm} km).`;

  return {
    result: {
      ok: true,
      message_vi: arrivalMessage,
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: translateVi('ACT_TRAVEL_ROAD'),
      auto_save_trigger: 'ACTION_COMPLETED'
    },
    remainingFuelLiters: nextFuel
  };
}