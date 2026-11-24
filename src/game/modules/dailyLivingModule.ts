// [MODULE 2: NHU CẦU SINH HOẠT HÀNG NGÀY & NỘI THẤT — CHUẨN ĐƠN VỊ V3.3]
// Áp dụng công thức tái tạo nội cân bằng computeHomeostaticRegenDelta theo tuổi tác
// và công thức chuyển đổi phút -> giờ chuẩn đơn vị.

import { EcoLifeJsonDb, getFurnitureDefById, translateVi } from '../jsonDatabaseLoader';
import {
  STAT_MAX_VALUE,
  type ActionExecutionResult,
  type HumanEntityState,
  type OrganStateMap,
  type OwnedInventoryItemInstance
} from '../engineTypes';
import {
  addActiveDebuff,
  applyOrganDeltas,
  calculateActualActionMinutes,
  clampNumber,
  clampStat100,
  getNaturalOrganRecoveryCap,
  removeActiveDebuff
} from './organAndBiologyModule';
import {
  applyStatDelta,
  asMinutes,
  asRatePerHour,
  asStat100,
  asYears,
  computeHomeostaticRegenDelta,
  minutesToHours
} from '../math/ecoLifeUnifiedFormulas';

export type MealExecutionMode = 'FROM_INVENTORY' | 'HOME_COOKED' | 'STREET_FOOD';

export interface EatMealInput {
  mode: MealExecutionMode;
  inventoryInstanceId?: string;
}

function applyStratifiedFoodFatigue(entity: HumanEntityState, mealDefId: string): string | null {
  const tracker = entity.hidden_black_box.overuse_tracker;
  const foodRule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_STRATIFIED_FOOD_FATIGUE;

  if (tracker.last_meal_def_id === mealDefId) {
    tracker.consecutive_same_meal_count = tracker.consecutive_same_meal_count + 1;
  } else {
    tracker.last_meal_def_id = mealDefId;
    tracker.consecutive_same_meal_count = 1;
    removeActiveDebuff(tracker, 'DEBUFF_STRATIFIED_FOOD_FATIGUE');
  }

  // Miễn nhiễm ngán ăn khi Hạnh phúc dưới 65pt (đang ưu tiên sinh tồn)
  if (entity.happiness_score < foodRule.min_happiness_score_to_trigger) {
    removeActiveDebuff(tracker, 'DEBUFF_STRATIFIED_FOOD_FATIGUE');
    return null;
  }

  if (tracker.consecutive_same_meal_count >= foodRule.consecutive_same_meal_threshold) {
    addActiveDebuff(tracker, 'DEBUFF_STRATIFIED_FOOD_FATIGUE');
    entity.happiness_score = clampStat100(
      entity.happiness_score + foodRule.happiness_penalty_per_repeated_meal
    );
    return translateVi(foodRule.sensory_monologue_key);
  }

  return null;
}

export function executeEatMealAction(
  entity: HumanEntityState,
  input: EatMealInput
): ActionExecutionResult {
  const box = entity.hidden_black_box;
  const recoveryCap = getNaturalOrganRecoveryCap(entity.identity_biometrics.exact_age_years);

  if (input.mode === 'FROM_INVENTORY') {
    const itemIdx = entity.inventory_items.findIndex(
      (it) =>
        it.usage_type === 'CONSUMABLE' &&
        it.category === 'FOOD' &&
        (!input.inventoryInstanceId || it.instance_id === input.inventoryInstanceId)
    );

    if (itemIdx < 0) {
      return {
        ok: false,
        message_vi: 'Trong túi đồ không có sẵn phần thức ăn nào.',
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    const foodItem = entity.inventory_items[itemIdx];
    const isSpoiled = foodItem.current_durability_pct < 25.0;
    const elapsedMinutes = calculateActualActionMinutes(entity, 20, false, false);

    const nextServings = (foodItem.remaining_servings ?? 1) - 1;
    if (nextServings <= 0) {
      entity.inventory_items.splice(itemIdx, 1);
    } else {
      foodItem.remaining_servings = nextServings;
    }

    box.satiety_pct = clampStat100(box.satiety_pct + 55.0);
    box.bladder_comfort_pct = clampStat100(box.bladder_comfort_pct - 12.0);

    if (isSpoiled) {
      applyOrganDeltas(entity, { digestive: -6.0 });
      entity.happiness_score = clampStat100(entity.happiness_score - 6.0);
      return {
        ok: true,
        message_vi: `Ăn phải ${translateVi(foodItem.display_name_key)} đã ôi thiu, bụng đau quặn lên khó chịu!`,
        minutes_elapsed: elapsedMinutes,
        cutscene_caption_vi: translateVi('ACT_EAT_MEAL'),
        auto_save_trigger: 'ACTION_COMPLETED'
      };
    }

    if (box.organs.digestive < recoveryCap) {
      box.organs.digestive = clampNumber(box.organs.digestive + 1.5, 0, recoveryCap);
    }
    entity.happiness_score = clampStat100(entity.happiness_score + 2.5);
    const fatigueMsg = applyStratifiedFoodFatigue(entity, foodItem.item_def_id);

    return {
      ok: true,
      message_vi: fatigueMsg
        ? `Đã ăn ${translateVi(foodItem.display_name_key)}. ${fatigueMsg}`
        : `Đã thưởng thức ${translateVi(foodItem.display_name_key)} ấm bụng.`,
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: translateVi('ACT_EAT_MEAL'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const regionFoodMult =
    EcoLifeJsonDb.regions.region_types[entity.current_region].food_price_multiplier || 1.0;

  if (input.mode === 'HOME_COOKED') {
    if (entity.current_location_id !== 'LOC_HOME') {
      return {
        ok: false,
        message_vi: translateVi('err_location_mismatch'),
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    const isChildSupported = entity.identity_biometrics.exact_age_years < 18;
    const costVnd = isChildSupported ? 0 : Math.round(20000 * regionFoodMult);
    if (entity.cash_vnd < costVnd) {
      return {
        ok: false,
        message_vi: translateVi('err_insufficient_cash'),
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    entity.cash_vnd = entity.cash_vnd - costVnd;
    const elapsedMinutes = calculateActualActionMinutes(entity, 35, false, false);
    box.satiety_pct = STAT_MAX_VALUE;
    box.bladder_comfort_pct = clampStat100(box.bladder_comfort_pct - 12.0);
    if (box.organs.digestive < recoveryCap) {
      box.organs.digestive = clampNumber(box.organs.digestive + 2.0, 0, recoveryCap);
    }
    entity.happiness_score = clampStat100(entity.happiness_score + 3.0);
    const fatigueMsg = applyStratifiedFoodFatigue(entity, 'MEAL_HOME_COOKED');

    return {
      ok: true,
      message_vi: fatigueMsg
        ? `Nấu và ăn cơm nhà (${costVnd === 0 ? 'Gia đình chuẩn bị' : `-${costVnd.toLocaleString('vi-VN')}đ`}). ${fatigueMsg}`
        : `Nấu và ăn bữa cơm nóng tại nhà (${costVnd === 0 ? 'Gia đình chuẩn bị' : `-${costVnd.toLocaleString('vi-VN')}đ`}).`,
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: translateVi('ACT_COOK_MEAL'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (entity.current_location_id === 'LOC_HOME') {
    return {
      ok: false,
      message_vi: 'Đang ở nhà riêng, hãy tự nấu tại bếp hoặc ra khu ăn uống ngoài phố.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  // Theo Master GDD (Mục 0.2): Học sinh dưới 18 tuổi được gia đình bao cấp suất cơm trưa mang theo (0đ tiền tiêu vặt)
  const isChildLunchSupported = entity.identity_biometrics.exact_age_years < 18;
  const streetCost = isChildLunchSupported ? 0 : Math.round(35000 * regionFoodMult);
  if (entity.cash_vnd < streetCost) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - streetCost;
  const elapsedMinutes = calculateActualActionMinutes(entity, 25, false, false);
  box.satiety_pct = clampStat100(box.satiety_pct + 70.0);
  box.bladder_comfort_pct = clampStat100(box.bladder_comfort_pct - 12.0);
  if (box.organs.digestive < recoveryCap) {
    box.organs.digestive = clampNumber(box.organs.digestive + 0.8, 0, recoveryCap);
  }
  entity.happiness_score = clampStat100(entity.happiness_score + 1.5);
  const fatigueMsg = applyStratifiedFoodFatigue(entity, 'MEAL_STREET_EATERY');

  const mealLabel = isChildLunchSupported
    ? 'Ăn suất cơm trưa gia đình chuẩn bị mang theo (Gia đình bao cấp)'
    : `Ăn suất cơm bình dân & uống nước (-${streetCost.toLocaleString('vi-VN')}đ)`;

  return {
    ok: true,
    message_vi: fatigueMsg ? `${mealLabel}. ${fatigueMsg}` : `${mealLabel}.`,
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: translateVi('ACT_EAT_MEAL'),
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
      message_vi: 'Không tìm thấy chế độ ngủ nghỉ này.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (!sleepAct.allowed_sub_nodes.includes(entity.current_sub_node_id)) {
    return {
      ok: false,
      message_vi: 'Hãy vào Phòng Ngủ hoặc Phòng Khách để nằm nghỉ.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const elapsedMinutes = asMinutes(sleepAct.duration_minutes);
  const hoursSlept = minutesToHours(elapsedMinutes);
  const box = entity.hidden_black_box;
  const tracker = box.overuse_tracker;
  const ageYears = asYears(entity.identity_biometrics.exact_age_years);

  // [Ngủ sâu dài >= 4h]: Hồi đầy năng lượng & áp dụng phương trình tái tạo nội cân bằng cho cả 8 tạng
  if (sleepAct.category === 'FULL_SLEEP') {
    box.energy_sleep_pct = clampStat100(box.energy_sleep_pct + hoursSlept * 14.5);
    box.naps_taken_since_full_sleep = 0;
    removeActiveDebuff(tracker, 'DEBUFF_FRAGMENTED_NAP_FATIGUE');

    const organKeys = Object.keys(box.organs) as Array<keyof OrganStateMap>;
    for (const key of organKeys) {
      const regenDelta = computeHomeostaticRegenDelta({
        current_organ: asStat100(box.organs[key]),
        age_years: ageYears,
        sleep_hours: hoursSlept,
        regen_rate_per_hour: asRatePerHour(0.35)
      });
      box.organs[key] = applyStatDelta(asStat100(box.organs[key]), regenDelta);
    }

    if (entity.happiness_score >= 30.0 && entity.happiness_score < 68.0) {
      entity.happiness_score = clampStat100(entity.happiness_score + 2.0);
    }

    return {
      ok: true,
      message_vi: translateVi(sleepAct.label_key),
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: translateVi('ACT_SLEEP'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  // [Chợp mắt ngắn 20p/45p/90p]: Hồi nhẹ năng lượng, phạt nếu lạm dụng >= 2 lần không ngủ đêm
  box.naps_taken_since_full_sleep = box.naps_taken_since_full_sleep + 1;
  box.energy_sleep_pct = clampStat100(box.energy_sleep_pct + Math.min(28.0, hoursSlept * 20.0));

  const napRule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_FRAGMENTED_NAP_FATIGUE;
  if (box.naps_taken_since_full_sleep >= napRule.trigger_naps_without_full_sleep) {
    addActiveDebuff(tracker, 'DEBUFF_FRAGMENTED_NAP_FATIGUE');
    applyOrganDeltas(entity, {
      brain: napRule.brain_delta_per_extra_nap,
      digestive: napRule.digestive_delta_per_extra_nap
    });
    entity.happiness_score = clampStat100(
      entity.happiness_score + napRule.happiness_delta_per_extra_nap
    );
    return {
      ok: true,
      message_vi: translateVi(napRule.sensory_monologue_key),
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: translateVi('ACT_SLEEP'),
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const brainRegen = computeHomeostaticRegenDelta({
    current_organ: asStat100(box.organs.brain),
    age_years: ageYears,
    sleep_hours: hoursSlept,
    regen_rate_per_hour: asRatePerHour(1.2)
  });
  box.organs.brain = applyStatDelta(asStat100(box.organs.brain), brainRegen);
  if (sleepAct.happiness_delta) {
    entity.happiness_score = clampStat100(entity.happiness_score + sleepAct.happiness_delta);
  }

  return {
    ok: true,
    message_vi: translateVi(sleepAct.label_key),
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: translateVi('ACT_SLEEP'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeToiletAction(entity: HumanEntityState): ActionExecutionResult {
  if (entity.current_location_id === 'LOC_TRANSIT_ROAD') {
    return {
      ok: false,
      message_vi: 'Đang ở ngoài đường phố, hãy ghé nhà riêng hoặc khu công cộng có nhà vệ sinh.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.hidden_black_box.bladder_comfort_pct = STAT_MAX_VALUE;
  return {
    ok: true,
    message_vi: 'Giải quyết nhu cầu vệ sinh nhẹ nhõm, bảo vệ Thận khỏi căng tức.',
    minutes_elapsed: 10,
    cutscene_caption_vi: translateVi('ACT_USE_TOILET'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeShowerAction(entity: HumanEntityState): ActionExecutionResult {
  if (
    entity.current_location_id !== 'LOC_HOME' ||
    entity.current_sub_node_id !== 'HOME_BATHROOM'
  ) {
    return {
      ok: false,
      message_vi: 'Chỉ có thể tắm rửa khi đang ở trong Nhà Tắm tại nhà riêng.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const recoveryCap = getNaturalOrganRecoveryCap(entity.identity_biometrics.exact_age_years);
  entity.hidden_black_box.body_hygiene_pct = STAT_MAX_VALUE;
  if (entity.hidden_black_box.organs.integumentary_skin < recoveryCap) {
    entity.hidden_black_box.organs.integumentary_skin = clampNumber(
      entity.hidden_black_box.organs.integumentary_skin + 1.5,
      0,
      recoveryCap
    );
  }
  entity.happiness_score = clampStat100(entity.happiness_score + 2.5);

  return {
    ok: true,
    message_vi: 'Tắm nước ấm sạch sẽ, da dẻ thông thoáng và tinh thần sảng khoái.',
    minutes_elapsed: calculateActualActionMinutes(entity, 20, false, false),
    cutscene_caption_vi: translateVi('ACT_TAKE_SHOWER'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeHousekeepingAction(entity: HumanEntityState): ActionExecutionResult {
  if (entity.current_location_id !== 'LOC_HOME') {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.hidden_black_box.house_cleanliness_pct = STAT_MAX_VALUE;
  entity.hidden_black_box.energy_sleep_pct = clampStat100(
    entity.hidden_black_box.energy_sleep_pct - 4.0
  );
  applyOrganDeltas(entity, { lungs: 1.0, musculoskeletal: -0.3 });
  entity.happiness_score = clampStat100(entity.happiness_score + 3.0);

  return {
    ok: true,
    message_vi: 'Quét dọn và lau chùi nhà cửa gọn gàng, không khí trong phòng dễ thở hẳn.',
    minutes_elapsed: calculateActualActionMinutes(entity, 40, false, false),
    cutscene_caption_vi: 'Đang quét dọn và sắp xếp lại nhà cửa...',
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeInteractWithFurnitureAction(
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
      message_vi: 'Trong nhà chưa có thiết bị này.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const isSameRoom =
    furnDef.placed_in_sub_node_id === entity.current_sub_node_id ||
    (furnDef.placed_in_sub_node_id === 'HOME_KITCHEN_DINING' &&
      entity.current_sub_node_id === 'HOME_KITCHEN');
  if (!isSameRoom) {
    return {
      ok: false,
      message_vi: 'Hãy đi sang đúng phòng đặt thiết bị này để sử dụng.',
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
      message_vi: 'Thao tác không tồn tại trên thiết bị này.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (actionDef.consumes_item_id) {
    const matIdx = entity.inventory_items.findIndex(
      (i) => i.item_def_id === actionDef.consumes_item_id
    );
    if (matIdx < 0) {
      return {
        ok: false,
        message_vi: `Thiếu vật tư tiêu hao cần thiết (${actionDef.consumes_item_id}) trong túi đồ.`,
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }
    const matItem = entity.inventory_items[matIdx];
    const nextServ = (matItem.remaining_servings ?? 1) - 1;
    if (nextServ <= 0) {
      entity.inventory_items.splice(matIdx, 1);
    } else {
      matItem.remaining_servings = nextServ;
    }
  }

  const elapsedMinutes = calculateActualActionMinutes(
    entity,
    actionDef.duration_minutes,
    false,
    false
  );
  const wearPct = furnDef.durability_rules.wear_per_use_pct || 0.3;

  if (actionDef.restores_durability_pct) {
    ownedFurn.current_durability_pct = clampNumber(
      ownedFurn.current_durability_pct + actionDef.restores_durability_pct,
      0,
      ownedFurn.max_durability_cap_pct
    );
  } else {
    ownedFurn.current_durability_pct = clampNumber(
      ownedFurn.current_durability_pct - wearPct,
      0,
      ownedFurn.max_durability_cap_pct
    );
  }

  if (actionDef.happiness_delta) {
    entity.happiness_score = clampStat100(entity.happiness_score + actionDef.happiness_delta);
  }

  if (actionDef.produces_item_id === 'ITEM_FOOD_HOME_COOKED_MEAL') {
    const cookedMeal: OwnedInventoryItemInstance = {
      instance_id: `MEAL_${Date.now()}_${entity.inventory_items.length}`,
      item_def_id: 'ITEM_FOOD_HOME_COOKED_MEAL',
      display_name_key: 'Bữa cơm nhà nấu nóng hổi',
      category: 'FOOD',
      usage_type: 'CONSUMABLE',
      size_class: 'PORTABLE_CARRY',
      weight_kg: 0.5,
      current_durability_pct: STAT_MAX_VALUE,
      max_durability_cap_pct: STAT_MAX_VALUE,
      remaining_servings: 1
    };
    entity.inventory_items.push(cookedMeal);
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