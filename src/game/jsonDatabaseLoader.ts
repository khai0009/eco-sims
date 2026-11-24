// Tầng nạp và tra cứu dữ liệu tĩnh JSON cho dự án Dòng Đời (Eco-Life)
// Phong cách: Phẳng, đơn giản, không dùng Class/Singleton phức tạp.

import viVnDict from '../data/localization/vi_VN.json';
import sensoryCatalog from '../data/sensory/sensory.json';
import sensoryMonologues from '../data/sensory/sensory_monologues.json';
import actionIndicatorIcons from '../data/sensory/action_indicator_icons.json';
import furnitureCatalog from '../data/furniture/furniture_and_appliances.json';
import vehiclesCatalog from '../data/devices/vehicles_and_transit.json';
import sleepCatalog from '../data/daily_living/sleep_and_beds.json';
import educationCatalog from '../data/career_finance/education_and_skills.json';
import jobsCatalog from '../data/career_finance/jobs_and_workplaces.json';
import bankingHousingCatalog from '../data/career_finance/banking_tax_and_housing.json';
import agingEndgameCatalog from '../data/character/aging_and_endgame_rules.json';
import overuseDebuffRules from '../data/character/overuse_and_debuff_rules.json';
import regionUrbanRuralCatalog from '../data/location/region_urban_rural_rules.json';
import mapCoordinatesCatalog from '../data/location/map_coordinates_and_transit_fares.json';
import npcBrainCatalog from '../data/npc_autonomous_engine_schema.json';

// Nạp các module sự kiện phân mảnh
import eventsSchool from '../data/event/events_school_and_study.json';
import eventsFamily from '../data/event/events_family_and_lifecycle.json';
import eventsCalendar from '../data/event/events_calendar_and_seasons.json';

export type ColorCode = 'BLUE' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
export type DurabilityGrade = 'PRISTINE' | 'GOOD' | 'WORN' | 'DECAYED' | 'BROKEN';
export type PersonalityCode =
  | 'PERS_INTROVERT'
  | 'PERS_EXTROVERT'
  | 'PERS_DAREDEVIL'
  | 'PERS_EMPATHETIC'
  | 'PERS_AMBIVERT';

export interface VisualSlotConfig {
  asset_id: string;
  anchor_x_pct: number;
  anchor_y_pct: number;
  width_pct: number;
  z_index: number;
}

export interface FurnitureDefinition {
  furniture_id: string;
  name_key: string;
  usage_type: string;
  size_class: string;
  base_price_vnd: number;
  sold_at_location_ids: string[];
  placed_in_location_id: string;
  placed_in_sub_node_id: string;
  visual_slot: VisualSlotConfig;
  durability_rules: {
    max_durability_pct: number;
    daily_wear_pct?: number;
    wear_per_use_pct?: number;
    malfunction_threshold_pct: number;
    broken_threshold_pct: number;
    repair_method: string;
  };
  interactable_actions: Array<{
    action_id: string;
    label_key: string;
    duration_minutes: number;
    requires_durability_min?: number;
    consumes_item_id?: string;
    produces_item_id?: string;
    restores_durability_pct?: number;
    happiness_delta?: number;
    burnout_delta?: number;
  }>;
}

export const EcoLifeJsonDb = {
  viVn: viVnDict,
  sensory: sensoryCatalog,
  sensoryMonologues: sensoryMonologues,
  actionIndicators: actionIndicatorIcons,
  furniture: furnitureCatalog.furniture_items as FurnitureDefinition[],
  vehicles: vehiclesCatalog,
  sleep: sleepCatalog,
  education: educationCatalog,
  jobs: jobsCatalog,
  bankingHousing: bankingHousingCatalog,
  agingEndgame: agingEndgameCatalog,
  overuseDebuffs: overuseDebuffRules,
  regions: regionUrbanRuralCatalog,
  mapCoords: mapCoordinatesCatalog,
  npcBrain: npcBrainCatalog,
  allEvents: [...eventsSchool.events, ...eventsFamily.events, ...eventsCalendar.events]
};

export function translateVi(
  key: string | null | undefined,
  params?: Record<string, string | number>
): string {
  if (!key) {
    return '';
  }

  let foundText: string | undefined;

  const sensoryRef = EcoLifeJsonDb.sensory.reference_vi_vn_translations as Record<string, string>;
  if (sensoryRef && sensoryRef[key]) {
    foundText = sensoryRef[key];
  }

  if (!foundText) {
    const dictGroups = [
      EcoLifeJsonDb.viVn.ui_system,
      EcoLifeJsonDb.viVn.overuse_debuffs,
      EcoLifeJsonDb.viVn.regions,
      EcoLifeJsonDb.viVn.blind_profile_labels,
      EcoLifeJsonDb.viVn.personality_types,
      EcoLifeJsonDb.viVn.blind_time_and_weather,
      EcoLifeJsonDb.viVn.hidden_symptom_monologues,
      EcoLifeJsonDb.viVn.school_events,
      EcoLifeJsonDb.viVn.family_and_lifecycle_events,
      EcoLifeJsonDb.viVn.calendar_events,
      EcoLifeJsonDb.viVn.locations,
      EcoLifeJsonDb.viVn.sub_nodes,
      EcoLifeJsonDb.viVn.cutscene_captions
    ] as Array<Record<string, string>>;

    for (const group of dictGroups) {
      if (group && typeof group[key] === 'string') {
        foundText = group[key];
        break;
      }
    }
  }

  let result = foundText || key;

  if (params) {
    for (const paramKey of Object.keys(params)) {
      const placeholder = `{${paramKey}}`;
      result = result.split(placeholder).join(String(params[paramKey]));
    }
  }

  return result;
}

export function getFurnitureDefById(furnitureId: string): FurnitureDefinition | null {
  for (const item of EcoLifeJsonDb.furniture) {
    if (item.furniture_id === furnitureId) {
      return item;
    }
  }
  return null;
}

export function calculateDistanceKmBetweenLocations(
  fromLocationId: string,
  toLocationId: string
): number {
  if (fromLocationId === toLocationId) {
    return 0.5;
  }

  const coordsMap = EcoLifeJsonDb.mapCoords.location_coordinates as Record<
    string,
    { map_x_km: number; map_y_km: number }
  >;
  const startCoord = coordsMap[fromLocationId];
  const endCoord = coordsMap[toLocationId];

  if (!startCoord || !endCoord) {
    return 3.0;
  }

  const rawDistance =
    Math.abs(startCoord.map_x_km - endCoord.map_x_km) +
    Math.abs(startCoord.map_y_km - endCoord.map_y_km);

  if (rawDistance < 0.5) {
    return 0.5;
  }
  return Math.round(rawDistance * 10) / 10;
}