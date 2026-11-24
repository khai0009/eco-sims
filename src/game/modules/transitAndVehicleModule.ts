// [MODULE 4: DI CHUYỂN, PHƯƠNG TIỆN & GIAO THÔNG — CHUẨN ĐƠN VỊ V3.3]
// Áp dụng các công thức tổng quát: động học di chuyển, tiêu hao nhiên liệu (km * L/km),
// hao mòn linh kiện (km * pt/km) và xác suất tai nạn cấu trúc bão hòa P = 1 - exp(-λ).

import {
  EcoLifeJsonDb,
  calculateDistanceKmBetweenLocations,
  translateVi
} from '../jsonDatabaseLoader';
import {
  STAT_MAX_VALUE,
  type ActionExecutionResult,
  type HumanEntityState,
  type PartQualityTier,
  type WeatherCode
} from '../engineTypes';
import {
  applyOrganDeltas,
  calculateActualActionMinutes,
  clampNumber,
  clampStat100
} from './organAndBiologyModule';
import { calculateDynamicCarryCapacity } from './shoppingAndInventoryModule';
import {
  applyStatDelta,
  asKilometers,
  asKmPerHour,
  asLitersPerKm,
  asMinutes,
  asMultiplier,
  asStat100,
  asWearPerKm,
  computeFuelConsumedLiters,
  computeStructuralAccidentProbability,
  computeTravelMinutes,
  computeVehiclePartWearDelta,
  round2
} from '../math/ecoLifeUnifiedFormulas';

export type TransitModeChoice = 'OWN_VEHICLE' | 'PUBLIC_BUS' | 'WALK';
export type VehiclePartKey = 'brakes' | 'tires' | 'engine';

export interface TravelRequestInput {
  target_location_id: string;
  target_sub_node_id?: string;
  transit_mode: TransitModeChoice;
  current_hour: number;
  current_weather: WeatherCode;
}

const WEATHER_TRAVEL_MULT: Record<WeatherCode, number> = {
  CLEAR: 1.0,
  HEATWAVE: 1.05,
  PM25_HIGH: 1.05,
  RAIN: 1.3,
  STORM: 2.2,
  STORM_FLOOD: 2.5
};

const WEATHER_HAZARD_MULT: Record<WeatherCode, number> = {
  CLEAR: 1.0,
  HEATWAVE: 1.15,
  PM25_HIGH: 1.25,
  RAIN: 2.0,
  STORM: 2.8,
  STORM_FLOOD: 3.2
};

export function executeTravelToLocationAction(
  entity: HumanEntityState,
  input: TravelRequestInput
): ActionExecutionResult {
  const distanceKm = asKilometers(
    calculateDistanceKmBetweenLocations(entity.current_location_id, input.target_location_id)
  );

  const regionRules = EcoLifeJsonDb.regions.region_types[entity.current_region];
  const lockedLocationIds: readonly string[] = regionRules.locked_location_ids;
  if (lockedLocationIds.includes(input.target_location_id)) {
    return {
      ok: false,
      message_vi: 'Khu vực Nông Thôn hiện không có địa điểm này. Cần chuyển lên Thành Thị.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const carryStatus = calculateDynamicCarryCapacity(entity);
  const isRushHour =
    (input.current_hour >= 7 && input.current_hour <= 8) ||
    (input.current_hour >= 17 && input.current_hour <= 19);
  const trafficMult = asMultiplier(isRushHour ? regionRules.rush_hour_traffic_multiplier : 1.0);
  const weatherMult = asMultiplier(WEATHER_TRAVEL_MULT[input.current_weather] ?? 1.0);

  let speedKmh = asKmPerHour(5.0);
  let ticketCostVnd = 0;
  let extraWaitMinutes = asMinutes(0);
  let noteSuffix = '';
  let accidentRiskScore100 = 0;

  if (input.transit_mode === 'PUBLIC_BUS') {
    const busFareRules = EcoLifeJsonDb.mapCoords.public_transit_fare_rules.TRANSIT_PUBLIC_BUS;
    const matchedTier =
      busFareRules.tiers.find((t) => distanceKm <= t.max_distance_km) ||
      busFareRules.tiers[busFareRules.tiers.length - 1];
    const isStudent = entity.identity_biometrics.exact_age_years <= 22;
    ticketCostVnd = isStudent
      ? Math.round(matchedTier.fare_vnd * busFareRules.student_discount_multiplier)
      : matchedTier.fare_vnd;

    if (entity.cash_vnd < ticketCostVnd) {
      return {
        ok: false,
        message_vi: translateVi('err_insufficient_cash'),
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }

    entity.cash_vnd = entity.cash_vnd - ticketCostVnd;
    speedKmh = asKmPerHour(22.0);
    extraWaitMinutes = asMinutes(12);
  } else if (input.transit_mode === 'OWN_VEHICLE' && entity.active_vehicle) {
    const veh = entity.active_vehicle;
    const isOutOfFuel = veh.uses_fuel && veh.current_fuel_liters <= 0.0;
    const isEngineBroken = veh.engine.durability_pct < 5.0;

    if (isOutOfFuel || isEngineBroken) {
      speedKmh = asKmPerHour(
        EcoLifeJsonDb.vehicles.refueling_station_rules.empty_tank_penalty.push_bike_speed_kmh
      );
      applyOrganDeltas(entity, { musculoskeletal: -distanceKm * 0.4 });
      noteSuffix = isOutOfFuel
        ? ` ${translateVi('err_fuel_empty')}`
        : ' Động cơ đã hỏng nặng, phải dắt bộ ra Tiệm Sửa Xe!';
    } else {
      speedKmh = asKmPerHour(veh.base_speed_kmh);

      if (veh.uses_fuel) {
        const fuelUsed = computeFuelConsumedLiters(
          distanceKm,
          asLitersPerKm(veh.fuel_consumption_per_km)
        );
        veh.current_fuel_liters = Math.max(0, round2(veh.current_fuel_liters - fuelUsed));
      }

      const tierMap = EcoLifeJsonDb.vehicles.part_quality_tiers;
      const rainWearMult = asMultiplier(
        input.current_weather === 'RAIN' || input.current_weather === 'STORM_FLOOD' ? 1.6 : 1.0
      );

      // Hao mòn đồng nhất cho 3 cụm linh kiện với thứ nguyên chặt [km] * [pt/km] = [pt]
      veh.brakes.durability_pct = applyStatDelta(
        asStat100(veh.brakes.durability_pct),
        computeVehiclePartWearDelta(
          distanceKm,
          asWearPerKm(0.03),
          asMultiplier(tierMap[veh.brakes.quality_tier].wear_rate_multiplier),
          rainWearMult
        )
      );
      veh.tires.durability_pct = applyStatDelta(
        asStat100(veh.tires.durability_pct),
        computeVehiclePartWearDelta(
          distanceKm,
          asWearPerKm(0.02),
          asMultiplier(tierMap[veh.tires.quality_tier].wear_rate_multiplier),
          rainWearMult
        )
      );
      veh.engine.durability_pct = applyStatDelta(
        asStat100(veh.engine.durability_pct),
        computeVehiclePartWearDelta(
          distanceKm,
          asWearPerKm(0.015),
          asMultiplier(tierMap[veh.engine.quality_tier].wear_rate_multiplier),
          rainWearMult
        )
      );

      if (veh.uses_fuel && input.current_weather === 'STORM_FLOOD') {
        veh.engine.durability_pct = clampStat100(veh.engine.durability_pct - 60.0);
        noteSuffix = ' Nước ngập tràn vào cổ hút gió khiến xe chết máy thủy kích!';
      }

      // Xác suất tai nạn cấu trúc bão hòa P ∈ [0, 1) -> quy đổi thang 0-100 để đồng bộ API
      const hasLicense =
        !veh.requires_license_id ||
        entity.identity_biometrics.owned_certificates.includes(veh.requires_license_id);
      const prob01 = computeStructuralAccidentProbability({
        env_hazard_factor: asMultiplier(WEATHER_HAZARD_MULT[input.current_weather] ?? 1.0),
        brakes_durability: asStat100(veh.brakes.durability_pct),
        tires_durability: asStat100(veh.tires.durability_pct),
        energy_sleep_pct: asStat100(entity.hidden_black_box.energy_sleep_pct),
        is_intoxicated: entity.hidden_black_box.overuse_tracker.alcohol_intoxication_hours_left > 0,
        has_required_license: hasLicense
      });
      accidentRiskScore100 = round2(prob01 * 100.0);
    }
  } else {
    speedKmh = asKmPerHour(entity.identity_biometrics.exact_age_years >= 60 ? 3.75 : 5.0);
    if (carryStatus.is_overburdened) {
      applyOrganDeltas(entity, { musculoskeletal: -distanceKm * 0.4 });
    }
  }

  const rawTravelMinutes = computeTravelMinutes({
    distance_km: distanceKm,
    speed_kmh: speedKmh,
    traffic_multiplier: trafficMult,
    weather_multiplier: weatherMult,
    waiting_minutes: extraWaitMinutes
  });
  const elapsedMinutes = calculateActualActionMinutes(
    entity,
    rawTravelMinutes,
    false,
    carryStatus.is_overburdened
  );

  entity.current_location_id = input.target_location_id;
  entity.current_sub_node_id =
    input.target_sub_node_id ||
    (input.target_location_id === 'LOC_HOME' ? 'HOME_LIVING_ROOM' : 'MAIN_HALL');

  return {
    ok: true,
    message_vi: `Đã di chuyển tới ${translateVi(input.target_location_id)} (${distanceKm} km${
      ticketCostVnd > 0 ? `, vé -${ticketCostVnd.toLocaleString('vi-VN')}đ` : ''
    }).${noteSuffix}`,
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: translateVi('ACT_TRAVEL_ROAD'),
    auto_save_trigger: 'ACTION_COMPLETED',
    triggered_accident_risk_score: accidentRiskScore100
  };
}

export function executeRefuelVehicleAction(
  entity: HumanEntityState,
  option: 'REFUEL_50K' | 'REFUEL_FULL_TANK'
): ActionExecutionResult {
  const station = EcoLifeJsonDb.vehicles.refueling_station_rules;

  if (entity.current_location_id !== station.location_id) {
    return {
      ok: false,
      message_vi: 'Hãy đưa xe tới Trạm Xăng Dầu (LOC_GAS_STATION) để đổ xăng.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const veh = entity.active_vehicle;
  if (!veh || !veh.uses_fuel) {
    return {
      ok: false,
      message_vi: 'Bạn hiện không có phương tiện chạy xăng để tiếp nhiên liệu.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const missingLiters = Math.max(0, veh.max_fuel_liters - veh.current_fuel_liters);
  if (missingLiters <= 0.1) {
    return {
      ok: false,
      message_vi: 'Bình xăng của xe hiện vẫn còn đầy.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  let litersToAdd = missingLiters;
  let costVnd = Math.round(missingLiters * station.fuel_price_per_liter_vnd);

  if (option === 'REFUEL_50K') {
    costVnd = Math.min(50000, costVnd);
    litersToAdd = Math.min(missingLiters, costVnd / station.fuel_price_per_liter_vnd);
  }

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
  veh.current_fuel_liters = clampNumber(
    veh.current_fuel_liters + litersToAdd,
    0,
    veh.max_fuel_liters
  );

  return {
    ok: true,
    message_vi: `Đã đổ thêm ${Math.round(litersToAdd * 10) / 10} lít xăng (-${costVnd.toLocaleString('vi-VN')}đ).`,
    minutes_elapsed: station.refuel_duration_minutes,
    cutscene_caption_vi: 'Đang tiếp nhiên liệu tại Trạm Xăng Dầu...',
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeRepairVehiclePartAction(
  entity: HumanEntityState,
  partKey: VehiclePartKey,
  chosenTier: PartQualityTier
): ActionExecutionResult {
  if (entity.current_location_id !== 'LOC_VEHICLE_REPAIR') {
    return {
      ok: false,
      message_vi: 'Hãy đưa xe tới Tiệm Sửa Xe (LOC_VEHICLE_REPAIR) để thay phụ tùng.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const veh = entity.active_vehicle;
  if (!veh) {
    return {
      ok: false,
      message_vi: 'Bạn chưa sở hữu phương tiện cá nhân nào để bảo dưỡng.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const baseCostByPart: Record<VehiclePartKey, number> = {
    brakes: 160000,
    tires: 650000,
    engine: 2200000
  };
  const tierDef = EcoLifeJsonDb.vehicles.part_quality_tiers[chosenTier];
  const finalCostVnd = Math.round(baseCostByPart[partKey] * tierDef.price_multiplier);

  if (entity.cash_vnd < finalCostVnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - finalCostVnd;
  veh[partKey].quality_tier = chosenTier;
  veh[partKey].durability_pct = STAT_MAX_VALUE;

  return {
    ok: true,
    message_vi: `Đã thay mới cụm ${partKey} (${translateVi(tierDef.name_key)}) (-${finalCostVnd.toLocaleString('vi-VN')}đ).`,
    minutes_elapsed: partKey === 'engine' ? 120 : 35,
    cutscene_caption_vi: 'Thợ sửa xe đang thay thế và cân chỉnh phụ tùng...',
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}