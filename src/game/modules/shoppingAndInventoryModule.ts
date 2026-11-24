// [MODULE 3: MUA SẮM, HÀNH TRANG ĐỘNG & SỬA CHỮA — CHUẨN ĐƠN VỊ V3.3]
// Áp dụng computeDynamicCarryLimitKg chuẩn đơn vị Kilograms & Years từ ecoLifeUnifiedFormulas.ts.

import { EcoLifeJsonDb, getFurnitureDefById, translateVi } from '../jsonDatabaseLoader';
import type {
  ActionExecutionResult,
  HumanEntityState,
  OwnedInventoryItemInstance
} from '../engineTypes';
import { calculateActualActionMinutes, clampNumber } from './organAndBiologyModule';
import {
  type Kilograms,
  asKilograms,
  asMultiplier,
  asYears,
  computeDynamicCarryLimitKg
} from '../math/ecoLifeUnifiedFormulas';

export interface CarryWeightStatus {
  current_weight_kg: number;
  max_capacity_kg: number;
  is_overburdened: boolean;
}

export interface StoreCatalogItemInput {
  item_def_id: string;
  display_name_key: string;
  category: OwnedInventoryItemInstance['category'];
  usage_type: 'CONSUMABLE' | 'DURABLE_REUSABLE';
  size_class: 'PORTABLE_CARRY' | 'MEDIUM_APPLIANCE';
  base_price_vnd: number;
  weight_kg: number;
  max_servings?: number;
  carry_bonus_kg?: number;
  sold_at_location_ids: string[];
}

export function calculateDynamicCarryCapacity(entity: HumanEntityState): CarryWeightStatus {
  let currentWeightKg = 0.0;
  const bonusList: Kilograms[] = [];

  for (const item of entity.inventory_items) {
    currentWeightKg = currentWeightKg + item.weight_kg;

    if (
      typeof item.carry_bonus_kg === 'number' &&
      item.carry_bonus_kg > 0 &&
      item.current_durability_pct >= 5.0
    ) {
      bonusList.push(asKilograms(item.carry_bonus_kg));
    } else if (
      item.item_def_id === 'ITEM_BACKPACK_STANDARD' &&
      item.current_durability_pct >= 5.0
    ) {
      bonusList.push(asKilograms(10.0));
    }
  }

  // Công thức tổng quát: W_max [kg] = (1.5 [kg] + Σ w_bonus [kg]) * M_senior(A)
  const maxCapacityKg = computeDynamicCarryLimitKg(
    asKilograms(1.5),
    bonusList,
    asYears(entity.identity_biometrics.exact_age_years),
    asMultiplier(EcoLifeJsonDb.agingEndgame.aging_progression.senior_carry_capacity_multiplier)
  );

  const roundedCurrent = Math.round(currentWeightKg * 10) / 10;
  return {
    current_weight_kg: roundedCurrent,
    max_capacity_kg: maxCapacityKg,
    is_overburdened: roundedCurrent > maxCapacityKg
  };
}

export function executePurchaseItemAction(
  entity: HumanEntityState,
  itemDef: StoreCatalogItemInput
): ActionExecutionResult {
  if (!itemDef.sold_at_location_ids.includes(entity.current_location_id)) {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const isSecondhand = entity.current_location_id === 'LOC_SECONDHAND_ELECTRONICS';
  const regionFoodMult =
    itemDef.category === 'FOOD'
      ? EcoLifeJsonDb.regions.region_types[entity.current_region].food_price_multiplier || 1.0
      : 1.0;

  const finalPriceVnd = isSecondhand
    ? Math.round(itemDef.base_price_vnd * 0.45)
    : Math.round(itemDef.base_price_vnd * regionFoodMult);

  if (entity.cash_vnd < finalPriceVnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const weightStatus = calculateDynamicCarryCapacity(entity);
  const projectedWeight = weightStatus.current_weight_kg + itemDef.weight_kg;
  if (projectedWeight > weightStatus.max_capacity_kg * 1.5 && !itemDef.carry_bonus_kg) {
    return {
      ok: false,
      message_vi: `${translateVi('err_overburdened')} Cần mua thêm Balo hoặc cất bớt đồ về nhà.`,
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - finalPriceVnd;
  const elapsedMinutes = calculateActualActionMinutes(entity, 15, false, false);

  const initialDurability =
    isSecondhand && itemDef.usage_type === 'DURABLE_REUSABLE'
      ? Math.round(38 + Math.random() * 34)
      : 100.0;
  const hasDefect = isSecondhand && Math.random() < 0.25;

  const newItem: OwnedInventoryItemInstance = {
    instance_id: `ITEM_${Date.now()}_${entity.inventory_items.length + 1}`,
    item_def_id: itemDef.item_def_id,
    display_name_key: itemDef.display_name_key,
    category: itemDef.category,
    usage_type: itemDef.usage_type,
    size_class: itemDef.size_class,
    weight_kg: itemDef.weight_kg,
    current_durability_pct: initialDurability,
    max_durability_cap_pct: isSecondhand ? Math.min(90, initialDurability + 15) : 100.0,
    remaining_servings: itemDef.usage_type === 'CONSUMABLE' ? itemDef.max_servings ?? 1 : undefined,
    carry_bonus_kg: itemDef.carry_bonus_kg,
    has_hidden_secondhand_defect: hasDefect
  };
  entity.inventory_items.push(newItem);

  if (
    itemDef.category === 'PHONE' ||
    itemDef.item_def_id === 'ITEM_WRISTWATCH' ||
    itemDef.item_def_id === 'ITEM_SMARTPHONE'
  ) {
    entity.capability_flags.is_clock_visible = true;
    if (itemDef.category === 'PHONE' || itemDef.item_def_id === 'ITEM_SMARTPHONE') {
      entity.capability_flags.is_weather_app_visible = true;
    }
  }

  return {
    ok: true,
    message_vi: isSecondhand
      ? `Đã mua đồ cũ ${translateVi(itemDef.display_name_key)} với giá hời (-${finalPriceVnd.toLocaleString('vi-VN')}đ).`
      : `Đã mua ${translateVi(itemDef.display_name_key)} (-${finalPriceVnd.toLocaleString('vi-VN')}đ).`,
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: null,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executePurchaseHomeFurnitureAction(
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

  const isSecondhand = entity.current_location_id === 'LOC_SECONDHAND_ELECTRONICS';
  const finalPriceVnd = isSecondhand
    ? Math.round(furnDef.base_price_vnd * 0.45)
    : furnDef.base_price_vnd;

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
  const startDurability = isSecondhand ? Math.round(45 + Math.random() * 25) : 100.0;

  entity.owned_furniture.push({
    instance_id: `FURN_${Date.now()}_${entity.owned_furniture.length + 1}`,
    furniture_id: furnDef.furniture_id,
    current_durability_pct: startDurability,
    max_durability_cap_pct: isSecondhand ? 85.0 : 100.0
  });
  entity.happiness_score = clampNumber(entity.happiness_score + 6.0, 0, 100);

  return {
    ok: true,
    message_vi: `Đã mua ${translateVi(furnDef.name_key)} (-${finalPriceVnd.toLocaleString('vi-VN')}đ) và giao về đặt tại nhà riêng!`,
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: translateVi('ACT_TRAVEL_ROAD'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeRepairEquipmentAction(
  entity: HumanEntityState,
  targetKind: 'HOME_FURNITURE' | 'INVENTORY_ITEM',
  instanceId: string
): ActionExecutionResult {
  if (targetKind === 'HOME_FURNITURE') {
    const owned = entity.owned_furniture.find((f) => f.instance_id === instanceId);
    const furnDef = owned ? getFurnitureDefById(owned.furniture_id) : null;
    if (!owned || !furnDef) {
      return {
        ok: false,
        message_vi: 'Không tìm thấy thiết bị gia dụng cần sửa.',
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    if (
      furnDef.durability_rules.repair_method === 'HOME_TECHNICIAN_ONLY' &&
      entity.current_location_id !== 'LOC_HOME'
    ) {
      return {
        ok: false,
        message_vi:
          'Thiết bị gia dụng cồng kềnh không thể chở ra tiệm! Hãy về Nhà Riêng (LOC_HOME) gọi thợ kỹ thuật tới sửa.',
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    const isHomeCall = entity.current_location_id === 'LOC_HOME';
    const isRepairShop = entity.current_location_id === 'LOC_APPLIANCE_REPAIR_SHOP';
    if (!isHomeCall && !isRepairShop) {
      return {
        ok: false,
        message_vi: translateVi('err_location_mismatch'),
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    const serviceFeeVnd = Math.round(furnDef.base_price_vnd * 0.08) + (isHomeCall ? 120000 : 0);
    if (entity.cash_vnd < serviceFeeVnd) {
      return {
        ok: false,
        message_vi: translateVi('err_insufficient_cash'),
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    entity.cash_vnd = entity.cash_vnd - serviceFeeVnd;
    owned.max_durability_cap_pct = Math.max(30.0, owned.max_durability_cap_pct - 5.0);
    owned.current_durability_pct = owned.max_durability_cap_pct;

    return {
      ok: true,
      message_vi: isHomeCall
        ? `Thợ kỹ thuật đã tới nhà sửa xong ${translateVi(furnDef.name_key)} (-${serviceFeeVnd.toLocaleString('vi-VN')}đ).`
        : `Đã sửa xong ${translateVi(furnDef.name_key)} tại tiệm (-${serviceFeeVnd.toLocaleString('vi-VN')}đ).`,
      minutes_elapsed: isHomeCall ? 95 : 50,
      cutscene_caption_vi: 'Thợ kỹ thuật đang kiểm tra mạch điện và thay linh kiện...',
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (entity.current_location_id !== 'LOC_APPLIANCE_REPAIR_SHOP') {
    return {
      ok: false,
      message_vi: 'Hãy mang thiết bị tới Tiệm Sửa Đồ Điện (LOC_APPLIANCE_REPAIR_SHOP) để sửa.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const item = entity.inventory_items.find((i) => i.instance_id === instanceId);
  if (!item || item.usage_type !== 'DURABLE_REUSABLE') {
    return {
      ok: false,
      message_vi: 'Vật phẩm này không thể sửa chữa.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const repairCostVnd = 220000;
  if (entity.cash_vnd < repairCostVnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - repairCostVnd;
  item.max_durability_cap_pct = Math.max(30.0, item.max_durability_cap_pct - 6.0);
  item.current_durability_pct = item.max_durability_cap_pct;
  item.has_hidden_secondhand_defect = false;

  return {
    ok: true,
    message_vi: `Đã sửa xong ${translateVi(item.display_name_key)} tại tiệm (-${repairCostVnd.toLocaleString('vi-VN')}đ).`,
    minutes_elapsed: 45,
    cutscene_caption_vi: 'Đang sửa chữa và vệ sinh linh kiện...',
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}