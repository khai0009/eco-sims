/**
 * ============================================================================
 * ECO-LIFE (DÒNG ĐỜI) - UNIFIED DATA-DRIVEN RUNTIME ENGINE (FULL CODE)
 * ============================================================================
 * Vai trò:
 *   - Đọc trực tiếp toàn bộ các bộ JSON Rules & Catalogs đã thiết kế trong `src/data/`.
 *   - Vận hành thời gian thực, sinh học 6 tạng + Thận, hiệu thuốc/bệnh viện,
 *     sức chứa trang phục, và tự động lưu ngay sau mỗi thao tác hoặc khoảnh khắc
 *     sự kiện bật lên (đặt lại đếm ngược về đúng thời gian gốc khi mở lại game).
 */

import {
  EcoLifeSaveAdapter,
  isTauriDesktopRuntime,
  type SaveSlotMeta,
  type SaveTriggerReason,
  type SuspendedEventSnapshot,
} from "./saveStorageAdapter";

// Import trực tiếp các file JSON từ cấu trúc thư mục src/data/ (Vite + Tauri bundle-safe)
import generatorRulesData from "../data/character/character_generator_rules.json";
import timeRulesData from "../data/time/time_and_circadian_rules.json";
import locationsData from "../data/location/location.json";
import itemsData from "../data/location/item.json";
import itemLocationsData from "../data/location/item_location.json";
import eventsData from "../data/event/event_catalog_sample.json";
import diseaseCatalogData from "../data/hospital_clinic/disease_catalog.json";
import medicineCatalogData from "../data/hospital_clinic/medicine_and_treatment_catalog.json";
import clothesAccessoriesData from "../data/character/clothes_accessories.json";

// ============================================================================
// 1. KIỂU DỮ LIỆU ĐẦU VÀO TỪ CÁC FILE JSON (JSON REGISTRY BUNDLE)
// ============================================================================

export type BiologicalSex = "MALE" | "FEMALE";
export type SocioeconomicTier = "Q1" | "Q2" | "Q3" | "Q4" | "Q5";
export type PersonalityType = "INTROVERT" | "EXTROVERT" | "DAREDEVIL" | "EMPATHETIC" | "AMBIVERT";
export type HealthColor = "BLUE" | "GREEN" | "YELLOW" | "ORANGE" | "RED";
export type SensationGrade = "PRISTINE" | "GOOD" | "WORN" | "DECAYED" | "BROKEN";

export interface GeneratorRulesJson {
  generation_pipeline: {
    step_1_origin_and_sex: {
      biological_sex_weights: Record<BiologicalSex, number>;
      socioeconomic_tier_weights: Record<SocioeconomicTier, number>;
    };
    step_2_innate_traits_roll: {
      max_traits_per_entity: number;
      probability_table: Record<string, number>;
    };
    step_3_age_bracket_baselines: Array<{
      bracket_id: string;
      min_age: number;
      max_age: number;
      organ_baseline_range: [number, number];
      sensory_baseline_range: [number, number];
      personality_locked: boolean;
      puberty_status: "PRE_PUBERTY" | "IN_PUBERTY" | "MATURE" | "MENOPAUSE_ANDROPAUSE";
    }>;
  };
  sensory_symptom_mapping_rules: {
    health_color_thresholds: Record<HealthColor, [number, number]>;
  };
}

export interface TimeAndCircadianRulesJson {
  base_time_constants: {
    rush_hour_windows: Array<{ start: string; end: string }>;
  };
  action_duration_modifiers: {
    unskilled_time_overrun: { random_multiplier_range: [number, number] };
    environmental_and_physical_multipliers: {
      rush_hour_transit_multiplier: number;
      inventory_overweight_multiplier: number;
      dyslexia_reading_paperwork_multiplier: number;
      adhd_boring_study_multiplier: number;
      adhd_hyperfocus_hobby_multiplier: number;
      fast_learner_study_multiplier: number;
      menstrual_cycle_first_2_days_multiplier: number;
    };
  };
  event_popup_reaction_window: {
    base_seconds_by_severity: {
      DAILY_GRAY: number;
      OPPORTUNITY_GREEN: number;
      DANGER_RED: number;
    };
    modifiers: {
      quick_reflexes_trait_flat_bonus_sec: number;
      ptsd_freeze_penalty_sec: number;
      minimum_allowed_window_sec: number;
      maximum_allowed_window_sec: number;
    };
  };
  passive_time_decay_rules: {
    device_and_item_decay_per_game_hour: {
      smartphone_battery_idle_drain_pct: number;
      perishable_food_room_temp_decay_pct: number;
      perishable_food_fridge_decay_pct: number;
    };
  };
}

export interface LocationNodeJson {
  location_id: string;
  location_name_key: string;
  base_travel_minutes: number;
  base_transit_cost_vnd: number;
  sub_nodes: Array<{
    sub_node_id: string;
    label_key: string;
    environment_exposure: "INDOOR" | "OUTDOOR";
    required_house_level?: number | null;
    vendor_catalog?: {
      vendor_id: string;
      is_open_24h: boolean;
      opening_time: string;
      closing_time: string;
      accepted_payments: Array<"CASH" | "BANK_CARD" | "HEALTH_INSURANCE">;
      sold_item_ids: string[];
    } | null;
  }>;
}

export interface ItemDefJson {
  item_def_id: string;
  name_key: string;
  category: string;
  physical_stats: {
    base_price_vnd: number;
    weight_kg: number;
    requires_prescription?: boolean;
  };
  biological_effects_on_use?: {
    organ_deltas?: Record<string, number>;
    suppress_symptom_hours?: number;
    unlocks_capability_flag?: string | null;
  } | null;
  diegetic_sensation_matrix: {
    grade_thresholds: Record<SensationGrade, [number, number]>;
    personality_monologue_keys: Record<PersonalityType, string>;
  };
}

export interface EventDefJson {
  event_id: string;
  category: "CHILDHOOD_MILESTONE" | "DAILY_GRAY" | "OPPORTUNITY_GREEN" | "DANGER_RED";
  environment_filter: "INDOOR" | "OUTDOOR" | "BOTH";
  is_repeatable: boolean;
  base_weight: number;
  trigger_conditions: {
    exact_milestone_age?: number | null;
    age_range?: [number, number];
    required_biological_sex?: BiologicalSex | null;
    allowed_location_ids?: string[];
    required_weather?: string[];
    biological_and_item_triggers?: {
      min_sleep_debt_hours?: number | null;
      max_organ_thresholds?: Record<string, number>;
      required_active_condition?: string | null;
    };
  };
  presentation: {
    title_key: string;
    narrative_body_key: string;
    base_countdown_seconds: number | null;
  };
  choices: Array<{
    choice_id: string;
    label_key: string;
    is_default_timeout_penalty?: boolean;
    is_dementia_habit_choice?: boolean;
    unlock_requirements?: {
      min_years_experience?: number;
      required_innate_traits?: string[];
    } | null;
    outcomes: {
      personality_vote_group?: PersonalityType | null;
      time_elapsed_minutes?: number;
      money_delta_vnd?: number;
      happiness_delta?: number;
      organ_deltas?: Record<string, number>;
      ptsd_trauma_severity?: number;
      journal_log_entry_key?: string | null;
      triggers_hospitalization?: boolean;
      triggers_instant_death_cause_key?: string | null;
    };
  }>;
}

export interface DiseaseCatalogJson {
  symptom_clusters: Record<
    string,
    {
      monologue_key: string;
      patient_verbal_description: string;
      overlapping_disease_ids: string[];
    }
  >;
  diseases: Array<{
    disease_id: string;
    name_key: string;
    affected_organ: string;
    trigger_organ_threshold_max: number;
    critical_red_threshold: number;
    symptom_cluster_id: string;
    is_curable_by_otc_if_mild: boolean;
    hospital_diagnostic_method: string;
    hospital_recommended_medicine_ids: string[];
  }>;
}

export interface MedicineCatalogJson {
  medicines: Array<{
    medicine_id: string;
    name_key: string;
    requires_prescription: boolean;
    sold_at_locations: string[];
    price_vnd: number;
    treats_disease_ids: string[];
    symptom_clusters_covered: string[];
    effects_when_matched_mild: {
      organ_deltas?: Record<string, number>;
    };
    effects_when_mismatched_or_severe: {
      suppress_symptom_hours?: number;
      organ_deltas?: Record<string, number>;
    };
  }>;
}

export interface ItemLocationBindingJson {
  item_def_id: string;
  allowed_location_ids: string[];
  sub_node_ids?: string[];
}

export interface ClothesAccessoryItemJson {
  equip_id: string;
  slot: "TOP_WEAR" | "BOTTOM_WEAR" | "CARRY_BAG" | "WRIST_ACCESSORY" | "EYEWEAR";
  name_key: string;
  added_capacity_kg: number;
  pocket_slots?: number;
  bag_slots?: number;
  price_vnd: number;
}

export interface ClothesAccessoriesCatalogJson {
  base_body_carry_rules: {
    bare_hands_max_kg: number;
    default_no_bag_total_max_kg: number;
  };
  items: ClothesAccessoryItemJson[];
}

export interface EcoLifeJsonDatabaseBundle {
  generatorRules: GeneratorRulesJson;
  timeRules: TimeAndCircadianRulesJson;
  locations: LocationNodeJson[];
  items: ItemDefJson[];
  itemLocations: ItemLocationBindingJson[];
  events: EventDefJson[];
  diseaseCatalog: DiseaseCatalogJson;
  medicineCatalog: MedicineCatalogJson;
  clothesCatalog: ClothesAccessoriesCatalogJson;
}

// ============================================================================
// 2. RUNTIME GAME STATE (TRẠNG THÁI CHẠY THỰC TẾ TRONG BỘ NHỚ & FILE SAVE)
// ============================================================================

export interface RuntimeCharacterState {
  entity_id: string;
  full_name: string;
  biological_sex: BiologicalSex;
  socioeconomic_origin: SocioeconomicTier;
  birth_year: number;
  exact_age_years: number;
  height_cm: number;
  weight_kg: number;
  current_bmi: number;
  locked_personality: PersonalityType | null;
  childhood_personality_votes: Record<PersonalityType, number>;
  innate_traits: string[];
  lifestyle_habits: string[];
  habit_progress: Record<string, number>;
  organs: Record<string, number>;
  vision_myopia_diopters: number;
  is_wearing_glasses: boolean;
  pain_sensitivity_pct: number;
  hours_awake_continuous: number;
  sleep_debt_hours: number;
  ptsd_trauma_score: number;
  burnout_index: number;
  happiness_score: number;
  symptom_suppressed_hours_left: number;
  unlocked_prescription_medicine_ids: string[];
  capability_flags: {
    is_time_management_unlocked: boolean;
    has_wristwatch: boolean;
    is_biometrics_decoded: boolean;
    is_personality_decoded: boolean;
    is_auto_pilot_active: boolean;
  };
  communication_devices: {
    has_smartphone_on_person: boolean;
    smartphone_battery_pct: number;
    smartphone_left_at_location_id: string | null;
    has_wallet_on_person: boolean;
  };
  equipped_gear: {
    top_wear_id: string;
    bottom_wear_id: string;
    carry_bag_id: string;
  };
  finances: {
    cash_vnd: number;
    bank_balance_vnd: number;
    has_health_insurance: boolean;
  };
  inventory: Array<{
    instance_id: string;
    item_def_id: string;
    durability_pct: number;
    stored_in_fridge: boolean;
    medical_report_payload?: {
      exam_date_str: string;
      exam_age: number;
      organ_snapshot: Record<string, number>;
      diagnosed_disease_ids: string[];
      prescribed_rx_ids: string[];
    };
  }>;
  life_journal: Array<{
    year: number;
    age: number;
    entry_key: string;
  }>;
}

export interface RootRuntimeGameState {
  slot_id: string;
  save_counter: number;
  active_locale: "vi-VN" | "en-US";
  simulation_mode: "CHILDHOOD_FAST_FORWARD" | "REALTIME_ACTIVE" | "EVENT_POPUP_FROZEN" | "DEMENTIA_AUTOPILOT";
  speed_multiplier: 0 | 1 | 2 | 4;
  clock: {
    total_elapsed_minutes: number;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    weather: "CLEAR" | "RAIN" | "STORM" | "HEAVY_SMOG";
  };
  active_location: {
    location_id: string;
    sub_node_id: string;
    environment_exposure: "INDOOR" | "OUTDOOR";
  };
  player: RuntimeCharacterState;
  fired_non_repeatable_event_ids: string[];
  active_popup_event: {
    event_id: string;
    remaining_seconds: number;
    ptsd_freeze_remaining_seconds: number;
  } | null;
  is_deceased: boolean;
  death_cause_key: string | null;
}

// ============================================================================
// 3. DATA-DRIVEN ENGINE (ĐỌC TỪ JSON BUNDLE ĐỂ VẬN HÀNH TOÀN BỘ LOGIC)
// ============================================================================

export class EcoLifeDataDrivenEngine {
  private readonly db: EcoLifeJsonDatabaseBundle;
  private state: RootRuntimeGameState;

  constructor(db: EcoLifeJsonDatabaseBundle, initialState: RootRuntimeGameState) {
    EcoLifeDataDrivenEngine.validateDatabaseBundle(db);
    this.db = db;
    this.state = initialState;
  }

  /**
   * NẠP TRỰC TIẾP BUNDLE JSON ĐÃ ĐƯỢC VITE ĐÓNG GÓI TỪ `src/data/`
   * Hỗ trợ đọc thẳng cả trên trình duyệt Web lẫn ứng dụng Tauri Desktop PC.
   */
  public static loadBundledDatabase(): EcoLifeJsonDatabaseBundle {
    const locations = Array.isArray(locationsData)
      ? (locationsData as unknown as LocationNodeJson[])
      : ((locationsData as unknown as { locations?: LocationNodeJson[] }).locations ?? []);

    const items = Array.isArray(itemsData)
      ? (itemsData as unknown as ItemDefJson[])
      : ((itemsData as unknown as { items?: ItemDefJson[] }).items ?? []);

    const itemLocations = Array.isArray(itemLocationsData)
      ? (itemLocationsData as unknown as ItemLocationBindingJson[])
      : ((itemLocationsData as unknown as { item_locations?: ItemLocationBindingJson[] }).item_locations ?? []);

    const events = Array.isArray(eventsData)
      ? (eventsData as unknown as EventDefJson[])
      : ((eventsData as unknown as { events?: EventDefJson[] }).events ?? []);

    const bundle: EcoLifeJsonDatabaseBundle = {
      generatorRules: generatorRulesData as unknown as GeneratorRulesJson,
      timeRules: timeRulesData as unknown as TimeAndCircadianRulesJson,
      locations,
      items,
      itemLocations,
      events,
      diseaseCatalog: diseaseCatalogData as unknown as DiseaseCatalogJson,
      medicineCatalog: medicineCatalogData as unknown as MedicineCatalogJson,
      clothesCatalog: clothesAccessoriesData as unknown as ClothesAccessoriesCatalogJson,
    };

    this.validateDatabaseBundle(bundle);
    return bundle;
  }

  /**
   * NẠP DỮ LIỆU JSON TỪ THƯ MỤC NGOÀI (Dành riêng nếu sau này bạn muốn hỗ trợ Mod trên Tauri PC)
   */
  public static async loadExternalTauriDatabase(relativeDir = "data"): Promise<EcoLifeJsonDatabaseBundle> {
    if (!isTauriDesktopRuntime()) {
      return this.loadBundledDatabase();
    }
    const tauri = (window as unknown as {
      __TAURI_INTERNALS__?: { invoke: <R>(cmd: string, args?: Record<string, unknown>) => Promise<R> };
    }).__TAURI_INTERNALS__;

    if (!tauri?.invoke) {
      return this.loadBundledDatabase();
    }

    const readExternal = async <T>(relPath: string): Promise<T> => {
      const raw = await tauri.invoke<string>("tauri_read_external_json_file", { relativePath: relPath });
      return JSON.parse(raw) as T;
    };

    const [
      generatorRules,
      timeRules,
      locRaw,
      itemRaw,
      itemLocRaw,
      eventRaw,
      diseaseCatalog,
      medicineCatalog,
      clothesCatalog,
    ] = await Promise.all([
      readExternal<GeneratorRulesJson>(`${relativeDir}/character/character_generator_rules.json`),
      readExternal<TimeAndCircadianRulesJson>(`${relativeDir}/time/time_and_circadian_rules.json`),
      readExternal<LocationNodeJson[] | { locations?: LocationNodeJson[] }>(`${relativeDir}/location/location.json`),
      readExternal<ItemDefJson[] | { items?: ItemDefJson[] }>(`${relativeDir}/location/item.json`),
      readExternal<ItemLocationBindingJson[] | { item_locations?: ItemLocationBindingJson[] }>(`${relativeDir}/location/item_location.json`),
      readExternal<EventDefJson[] | { events?: EventDefJson[] }>(`${relativeDir}/event/event_catalog_sample.json`),
      readExternal<DiseaseCatalogJson>(`${relativeDir}/hospital_clinic/disease_catalog.json`),
      readExternal<MedicineCatalogJson>(`${relativeDir}/hospital_clinic/medicine_and_treatment_catalog.json`),
      readExternal<ClothesAccessoriesCatalogJson>(`${relativeDir}/character/clothes_accessories.json`),
    ]);

    const bundle: EcoLifeJsonDatabaseBundle = {
      generatorRules,
      timeRules,
      locations: Array.isArray(locRaw) ? locRaw : locRaw.locations ?? [],
      items: Array.isArray(itemRaw) ? itemRaw : itemRaw.items ?? [],
      itemLocations: Array.isArray(itemLocRaw) ? itemLocRaw : itemLocRaw.item_locations ?? [],
      events: Array.isArray(eventRaw) ? eventRaw : eventRaw.events ?? [],
      diseaseCatalog,
      medicineCatalog,
      clothesCatalog,
    };

    this.validateDatabaseBundle(bundle);
    return bundle;
  }

  /**
   * KIỂM TRA TÍNH TOÀN VẸN CỦA DỮ LIỆU JSON SAU KHI IMPORT
   */
  public static validateDatabaseBundle(db: EcoLifeJsonDatabaseBundle): void {
    if (!db.generatorRules?.generation_pipeline) {
      throw new Error("JSON Error: Thiếu cấu trúc generation_pipeline trong character_generator_rules.json");
    }
    if (!db.timeRules?.event_popup_reaction_window) {
      throw new Error("JSON Error: Thiếu cấu trúc event_popup_reaction_window trong time_and_circadian_rules.json");
    }
    if (!Array.isArray(db.events) || db.events.length === 0) {
      throw new Error("JSON Error: Danh sách sự kiện (events) đang trống hoặc sai định dạng");
    }
    if (!Array.isArray(db.diseaseCatalog?.diseases) || !Array.isArray(db.medicineCatalog?.medicines)) {
      throw new Error("JSON Error: Thiếu danh mục bệnh (diseaseCatalog) hoặc thuốc (medicineCatalog)");
    }
  }

  public getState(): RootRuntimeGameState {
    return this.state;
  }

  public getDatabase(): EcoLifeJsonDatabaseBundle {
    return this.db;
  }

  /**
   * KHỞI TẠO CUỘC ĐỜI MỚI TỪ 0 TUỔI (Người chơi chỉ chọn Năm sinh & Tên, còn lại đọc từ JSON)
   */
  public static createNewLifeFromJson(
    db: EcoLifeJsonDatabaseBundle,
    params: { slotId: string; fullName: string; birthYear: number; locale?: "vi-VN" | "en-US" }
  ): EcoLifeDataDrivenEngine {
    const pipeline = db.generatorRules.generation_pipeline;
    const sex: BiologicalSex =
      Math.random() < pipeline.step_1_origin_and_sex.biological_sex_weights.MALE ? "MALE" : "FEMALE";

    // Random gia cảnh Q1 -> Q5 theo bảng trọng số trong JSON
    const tierEntries = Object.entries(pipeline.step_1_origin_and_sex.socioeconomic_tier_weights) as Array<
      [SocioeconomicTier, number]
    >;
    let r = Math.random();
    let originTier: SocioeconomicTier = "Q2";
    for (const [tier, weight] of tierEntries) {
      if (r < weight) {
        originTier = tier;
        break;
      }
      r -= weight;
    }

    // Random đặc tính bẩm sinh theo bảng xác suất JSON
    const innateTraits: string[] = [];
    for (const [traitId, prob] of Object.entries(pipeline.step_2_innate_traits_roll.probability_table)) {
      if (
        Math.random() < prob &&
        innateTraits.length < pipeline.step_2_innate_traits_roll.max_traits_per_entity
      ) {
        innateTraits.push(traitId);
      }
    }

    const newbornBracket =
      pipeline.step_3_age_bracket_baselines.find((b) => b.bracket_id === "NEWBORN_0") ||
      pipeline.step_3_age_bracket_baselines[0];
    const [orgMin, orgMax] = newbornBracket.organ_baseline_range;
    const randOrgan = () => Number((orgMin + Math.random() * (orgMax - orgMin)).toFixed(1));

    const heightCm = Number((48 + Math.random() * 4).toFixed(1));
    const weightKg = Number((2.8 + Math.random() * 1.2).toFixed(1));
    const bmi = Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1));

    const initialState: RootRuntimeGameState = {
      slot_id: params.slotId,
      save_counter: 0,
      active_locale: params.locale ?? "vi-VN",
      simulation_mode: "CHILDHOOD_FAST_FORWARD",
      speed_multiplier: 1,
      clock: {
        total_elapsed_minutes: 0,
        year: params.birthYear,
        month: 1,
        day: 1,
        hour: 8,
        minute: 0,
        weather: "CLEAR",
      },
      active_location: {
        location_id: "LOC_HOME",
        sub_node_id: "HOME_LIVING_ROOM",
        environment_exposure: "INDOOR",
      },
      player: {
        entity_id: `PLAYER_${params.birthYear}_${Date.now()}`,
        full_name: params.fullName,
        biological_sex: sex,
        socioeconomic_origin: originTier,
        birth_year: params.birthYear,
        exact_age_years: 0,
        height_cm: heightCm,
        weight_kg: weightKg,
        current_bmi: bmi,
        locked_personality: null,
        childhood_personality_votes: {
          INTROVERT: 0,
          EXTROVERT: 0,
          DAREDEVIL: 0,
          EMPATHETIC: 0,
          AMBIVERT: 0,
        },
        innate_traits: innateTraits,
        lifestyle_habits: [],
        habit_progress: {},
        organs: {
          brain: randOrgan(),
          heart: innateTraits.includes("GENETIC_HEART_WEAKNESS") ? 72.0 : randOrgan(),
          lungs: innateTraits.includes("GENETIC_ASTHMA") ? 74.0 : randOrgan(),
          liver: randOrgan(),
          digestive: randOrgan(),
          musculoskeletal: randOrgan(),
          kidneys: randOrgan(),
        },
        vision_myopia_diopters: innateTraits.includes("GENETIC_MYOPIA") ? 2.0 : 0.0,
        is_wearing_glasses: false,
        pain_sensitivity_pct: 80.0,
        hours_awake_continuous: 0,
        sleep_debt_hours: 0,
        ptsd_trauma_score: 0,
        burnout_index: 0,
        happiness_score: 75.0,
        symptom_suppressed_hours_left: 0,
        unlocked_prescription_medicine_ids: [],
        capability_flags: {
          is_time_management_unlocked: false,
          has_wristwatch: false,
          is_biometrics_decoded: false,
          is_personality_decoded: false,
          is_auto_pilot_active: false,
        },
        communication_devices: {
          has_smartphone_on_person: false,
          smartphone_battery_pct: 0,
          smartphone_left_at_location_id: null,
          has_wallet_on_person: true,
        },
        equipped_gear: {
          top_wear_id: "EQ_TOP_TSHIRT_NO_POCKET",
          bottom_wear_id: "EQ_BOT_JEANS_POCKETS",
          carry_bag_id: "EQ_BAG_NONE",
        },
        finances: {
          cash_vnd: 0,
          bank_balance_vnd: 0,
          has_health_insurance: originTier !== "Q1",
        },
        inventory: [],
        life_journal: [
          {
            year: params.birthYear,
            age: 0,
            entry_key: `log_born_tier_${originTier.toLowerCase()}`,
          },
        ],
      },
      fired_non_repeatable_event_ids: [],
      active_popup_event: null,
      is_deceased: false,
      death_cause_key: null,
    };

    return new EcoLifeDataDrivenEngine(db, initialState);
  }

  /**
   * 1. CHIẾU DỮ LIỆU CẢM QUAN RA GIAO DIỆN HUD (Đèn màu, triệu chứng mờ, mù giờ giấc, cảm quan đồ vật)
   */
  public getSensoryHudProjection(): {
    healthColor: HealthColor;
    happinessColor: HealthColor;
    symptomMonologueKey: string;
    canSeeDigitalClock: boolean;
    formattedClockOrSkyKey: string;
    inventorySensoryViews: Array<{
      instanceId: string;
      nameKey: string;
      grade: SensationGrade;
      monologueKey: string;
    }>;
  } {
    const p = this.state.player;
    const minOrganVal = Math.min(...Object.values(p.organs));
    const healthColor = this.mapValueToColor(minOrganVal);
    const happinessColor = this.mapValueToColor(p.happiness_score);

    // Nếu đang uống thuốc giảm đau cắt cơn -> ẩn triệu chứng thật trên HUD
    let symptomMonologueKey = "symptom_feeling_normal";
    if (p.symptom_suppressed_hours_left <= 0 && minOrganVal < 45.0) {
      const weakestOrgan = Object.keys(p.organs).reduce((a, b) =>
        p.organs[a] < p.organs[b] ? a : b
      );
      const matchedDisease = this.db.diseaseCatalog.diseases.find(
        (d) => d.affected_organ === weakestOrgan
      );
      if (matchedDisease) {
        const cluster = this.db.diseaseCatalog.symptom_clusters[matchedDisease.symptom_cluster_id];
        if (cluster) symptomMonologueKey = cluster.monologue_key;
      }
    }

    const phoneWorking =
      p.communication_devices.has_smartphone_on_person &&
      p.communication_devices.smartphone_battery_pct > 0;
    const canSeeDigitalClock = p.capability_flags.has_wristwatch || phoneWorking;

    const pad = (n: number) => String(n).padStart(2, "0");
    const formattedClockOrSkyKey = canSeeDigitalClock
      ? `${pad(this.state.clock.hour)}:${pad(this.state.clock.minute)}`
      : this.getSkyMonologueKeyByHour(this.state.clock.hour);

    // Cảm quan hóa độ bền vật phẩm theo tính cách đã khóa
    const personality: PersonalityType = p.locked_personality ?? "AMBIVERT";
    const inventorySensoryViews = p.inventory.map((inv) => {
      const def = this.db.items.find((i) => i.item_def_id === inv.item_def_id);
      const grade = this.mapDurabilityToGrade(inv.durability_pct, def);
      const monologueKey =
        def?.diegetic_sensation_matrix.personality_monologue_keys[personality] ??
        "item_sensation_default";
      return {
        instanceId: inv.instance_id,
        nameKey: def?.name_key ?? inv.item_def_id,
        grade,
        monologueKey,
      };
    });

    return {
      healthColor,
      happinessColor,
      symptomMonologueKey,
      canSeeDigitalClock,
      formattedClockOrSkyKey,
      inventorySensoryViews,
    };
  }

  /**
   * TÍNH SỨC CHỨA TÚI ĐỒ (KG) DỰA TRÊN QUẦN ÁO & TÚI ĐANG MẶC TRÊN NGƯỜI
   */
  public getCarryCapacityStats(): {
    currentWeightKg: number;
    maxCapacityKg: number;
    breakdownLabel: string;
  } {
    const p = this.state.player;
    const bareHandsKg = this.db.clothesCatalog?.base_body_carry_rules?.bare_hands_max_kg ?? 1.5;
    const allGear = this.db.clothesCatalog?.items ?? [];

    const top = allGear.find((g) => g.equip_id === p.equipped_gear?.top_wear_id);
    const bot = allGear.find((g) => g.equip_id === p.equipped_gear?.bottom_wear_id);
    const bag = allGear.find((g) => g.equip_id === p.equipped_gear?.carry_bag_id);

    const maxCapacityKg = Number(
      (
        bareHandsKg +
        (top?.added_capacity_kg ?? 0) +
        (bot?.added_capacity_kg ?? 0) +
        (bag?.added_capacity_kg ?? 0)
      ).toFixed(2)
    );

    const currentWeightKg = Number(
      p.inventory
        .reduce((sum, inv) => {
          const def = this.db.items.find((i) => i.item_def_id === inv.item_def_id);
          return sum + (def?.physical_stats.weight_kg ?? 0.05);
        }, 0)
        .toFixed(2)
    );

    const breakdownLabel = `Tay không (${bareHandsKg}kg) + ${top?.name_key ?? "Áo"} + ${bot?.name_key ?? "Quần"} + ${bag?.name_key ?? "Không túi"}`;
    return { currentWeightKg, maxCapacityKg, breakdownLabel };
  }

  /**
   * 2. XỬ LÝ CỘT MỐC TUỔI THƠ (0 - 5 TUỔI) & MỞ KHÓA ĐỒNG HỒ LÚC 6 TUỔI
   */
  public advanceChildhoodYear(chosenPersonalityGroup: PersonalityType): {
    reachedAgeSix: boolean;
    lockedPersonality: PersonalityType | null;
  } {
    const p = this.state.player;
    if (p.exact_age_years >= 6) {
      return { reachedAgeSix: true, lockedPersonality: p.locked_personality };
    }

    p.childhood_personality_votes[chosenPersonalityGroup] =
      (p.childhood_personality_votes[chosenPersonalityGroup] || 0) + 1;
    p.exact_age_years += 1;
    this.state.clock.year += 1;

    if (p.exact_age_years >= 6) {
      let locked: PersonalityType = "AMBIVERT";
      for (const [k, votes] of Object.entries(p.childhood_personality_votes) as Array<
        [PersonalityType, number]
      >) {
        if (votes >= 3) {
          locked = k;
          break;
        }
      }
      p.locked_personality = locked;
      this.state.simulation_mode = "REALTIME_ACTIVE";
      p.life_journal.push({
        year: this.state.clock.year,
        age: 6,
        entry_key: `log_age_6_unlocked_personality_${locked.toLowerCase()}`,
      });
      void this.saveCurrentProgress("ACTION_COMPLETED");
      return { reachedAgeSix: true, lockedPersonality: locked };
    }

    void this.saveCurrentProgress("ACTION_COMPLETED");
    return { reachedAgeSix: false, lockedPersonality: null };
  }

  /**
   * 3. NHỊP ĐỒNG HỒ THỜI GIAN THỰC (Không lưu định kỳ 10p; chỉ lưu ngay khi có sự kiện bật lên)
   */
  public tickMinutes(minutesToAdvance: number): void {
    if (this.state.is_deceased || this.state.simulation_mode === "EVENT_POPUP_FROZEN") return;

    const p = this.state.player;
    const prevHour = Math.floor(this.state.clock.total_elapsed_minutes / 60);
    this.state.clock.total_elapsed_minutes += minutesToAdvance;
    const newHour = Math.floor(this.state.clock.total_elapsed_minutes / 60);

    // Cập nhật giờ, phút, ngày, năm
    this.state.clock.minute += minutesToAdvance;
    while (this.state.clock.minute >= 60) {
      this.state.clock.minute -= 60;
      this.state.clock.hour += 1;
    }
    while (this.state.clock.hour >= 24) {
      this.state.clock.hour -= 24;
      this.state.clock.day += 1;
    }
    while (this.state.clock.day > 30) {
      this.state.clock.day -= 30;
      this.state.clock.month += 1;
    }
    while (this.state.clock.month > 12) {
      this.state.clock.month -= 12;
      this.state.clock.year += 1;
      p.exact_age_years += 1;
      this.applyAnnualAgingDecayFromJson();
    }

    // Xử lý hao mòn theo từng giờ game trôi qua (Pin ĐT, thức ăn, thức khuya, hết thuốc giảm đau)
    const elapsedWholeHours = newHour - prevHour;
    if (elapsedWholeHours > 0) {
      const decayRules = this.db.timeRules.passive_time_decay_rules.device_and_item_decay_per_game_hour;
      p.hours_awake_continuous += elapsedWholeHours;
      if (p.hours_awake_continuous > 16) {
        p.sleep_debt_hours += elapsedWholeHours * 1.25;
      }
      if (p.symptom_suppressed_hours_left > 0) {
        p.symptom_suppressed_hours_left = Math.max(0, p.symptom_suppressed_hours_left - elapsedWholeHours);
      }
      if (p.communication_devices.smartphone_battery_pct > 0) {
        p.communication_devices.smartphone_battery_pct = Math.max(
          0,
          Number(
            (
              p.communication_devices.smartphone_battery_pct +
              decayRules.smartphone_battery_idle_drain_pct * elapsedWholeHours
            ).toFixed(1)
          )
        );
      }

      // Kiểm tra sự kiện bất ngờ sau mỗi giờ game
      const candidateEvent = this.rollContextualEventFromJson();
      if (candidateEvent) {
        const countdown = this.computeEventCountdownFromJson(candidateEvent);
        this.state.active_popup_event = {
          event_id: candidateEvent.event_id,
          remaining_seconds: countdown,
          ptsd_freeze_remaining_seconds: p.ptsd_trauma_score >= 40 ? 2.0 : 0.0,
        };
        if (this.state.simulation_mode !== "DEMENTIA_AUTOPILOT") {
          this.state.simulation_mode = "EVENT_POPUP_FROZEN";
          this.state.speed_multiplier = 0;
        }
        // Lưu tức thì ngay khoảnh khắc sự kiện bất ngờ xuất hiện
        void this.saveCurrentProgress("EVENT_TRIGGERED");
      }
    }
  }

  /**
   * 3B. DI CHUYỂN ĐỊA ĐIỂM (RA NGOÀI / VỀ NHÀ / TỚI CỬA HÀNG) & TỰ ĐỘNG LƯU NGAY SAU THAO TÁC
   */
  public moveToLocation(
    locationId: string,
    subNodeId: string,
    environmentExposure: "INDOOR" | "OUTDOOR",
    travelMinutes: number = 15
  ): void {
    this.state.active_location = {
      location_id: locationId,
      sub_node_id: subNodeId,
      environment_exposure: environmentExposure,
    };
    this.tickMinutes(travelMinutes);
    if (!this.state.active_popup_event) {
      void this.saveCurrentProgress("ACTION_COMPLETED");
    }
  }

  /**
   * 3C. GIẢI QUYẾT LỰA CHỌN SỰ KIỆN & TỰ ĐỘNG LƯU NGAY SAU THAO TÁC
   */
  public resolveActiveEventChoice(choiceId: string): { success: boolean; reason?: string } {
    if (!this.state.active_popup_event) {
      return { success: false, reason: "ERR_NO_ACTIVE_EVENT" };
    }
    const evDef = this.db.events.find((e) => e.event_id === this.state.active_popup_event?.event_id);
    if (!evDef) {
      this.state.active_popup_event = null;
      this.state.simulation_mode = "REALTIME_ACTIVE";
      return { success: false, reason: "ERR_EVENT_DEF_NOT_FOUND" };
    }

    const choice = evDef.choices.find((c) => c.choice_id === choiceId) ?? evDef.choices[0];
    const p = this.state.player;

    if (choice.outcomes.money_delta_vnd) {
      p.finances.cash_vnd = Math.max(0, p.finances.cash_vnd + choice.outcomes.money_delta_vnd);
    }
    if (choice.outcomes.happiness_delta) {
      p.happiness_score = Math.max(0, Math.min(100, p.happiness_score + choice.outcomes.happiness_delta));
    }
    if (choice.outcomes.ptsd_trauma_severity) {
      p.ptsd_trauma_score = Math.min(100, p.ptsd_trauma_score + choice.outcomes.ptsd_trauma_severity);
    }
    this.applyOrganDeltas(choice.outcomes.organ_deltas);

    if (choice.outcomes.journal_log_entry_key) {
      p.life_journal.push({
        year: this.state.clock.year,
        age: p.exact_age_years,
        entry_key: choice.outcomes.journal_log_entry_key,
      });
    }

    if (!evDef.is_repeatable && !this.state.fired_non_repeatable_event_ids.includes(evDef.event_id)) {
      this.state.fired_non_repeatable_event_ids.push(evDef.event_id);
    }

    this.state.active_popup_event = null;
    this.state.simulation_mode = p.capability_flags.is_auto_pilot_active
      ? "DEMENTIA_AUTOPILOT"
      : "REALTIME_ACTIVE";
    this.state.speed_multiplier = 1;

    if (choice.outcomes.time_elapsed_minutes) {
      this.tickMinutes(choice.outcomes.time_elapsed_minutes);
    }

    if (!this.state.active_popup_event) {
      void this.saveCurrentProgress("ACTION_COMPLETED");
    }
    return { success: true };
  }

  /**
   * 4. MUA THUỐC TẠI HIỆU THUỐC TÂY (Dược sĩ bốc thuốc theo triệu chứng) & TỰ ĐỘNG LƯU NGAY
   */
  public consultPharmacistBySymptom(): {
    purchasedMedicineId: string | null;
    curedMildDisease: boolean;
    reason?: string;
  } {
    if (this.state.active_location.location_id !== "LOC_PHARMACY") {
      return { purchasedMedicineId: null, curedMildDisease: false, reason: "ERR_MUST_BE_AT_PHARMACY" };
    }

    const p = this.state.player;
    const weakestOrgan = Object.keys(p.organs).reduce((a, b) => (p.organs[a] < p.organs[b] ? a : b));
    const organScore = p.organs[weakestOrgan];

    const actualDisease = this.db.diseaseCatalog.diseases.find((d) => d.affected_organ === weakestOrgan);
    if (!actualDisease) {
      return { purchasedMedicineId: null, curedMildDisease: false, reason: "NO_SYMPTOM_DETECTED" };
    }

    const otcPool = this.db.medicineCatalog.medicines.filter(
      (m) =>
        !m.requires_prescription &&
        m.symptom_clusters_covered.includes(actualDisease.symptom_cluster_id)
    );
    if (otcPool.length === 0) {
      return { purchasedMedicineId: null, curedMildDisease: false, reason: "NO_OTC_AVAILABLE" };
    }

    const chosenMed = otcPool[Math.floor(Math.random() * otcPool.length)];
    if (p.finances.cash_vnd < chosenMed.price_vnd) {
      return { purchasedMedicineId: null, curedMildDisease: false, reason: "ERR_INSUFFICIENT_CASH" };
    }

    p.finances.cash_vnd -= chosenMed.price_vnd;
    this.tickMinutes(15);

    const isMildOrange = organScore >= 25.0 && organScore < 45.0;
    const isMatched =
      isMildOrange &&
      actualDisease.is_curable_by_otc_if_mild &&
      chosenMed.treats_disease_ids.includes(actualDisease.disease_id);

    if (isMatched) {
      this.applyOrganDeltas(chosenMed.effects_when_matched_mild.organ_deltas);
      void this.saveCurrentProgress("ACTION_COMPLETED");
      return { purchasedMedicineId: chosenMed.medicine_id, curedMildDisease: true };
    } else {
      this.applyOrganDeltas(chosenMed.effects_when_mismatched_or_severe.organ_deltas);
      p.symptom_suppressed_hours_left =
        chosenMed.effects_when_mismatched_or_severe.suppress_symptom_hours ?? 0;
      void this.saveCurrentProgress("ACTION_COMPLETED");
      return { purchasedMedicineId: chosenMed.medicine_id, curedMildDisease: false };
    }
  }

  /**
   * 4B. MUA & UỐNG THUỐC ĐẶC TRỊ THEO ĐƠN BÁC SĨ & TỰ ĐỘNG LƯU NGAY
   */
  public purchaseAndTakePrescribedMedicine(medicineId: string): {
    success: boolean;
    reason?: string;
  } {
    const loc = this.state.active_location.location_id;
    if (loc !== "LOC_HOSPITAL" && loc !== "LOC_PHARMACY") {
      return { success: false, reason: "ERR_MUST_BE_AT_HOSPITAL_OR_PHARMACY" };
    }

    const p = this.state.player;
    const med = this.db.medicineCatalog.medicines.find((m) => m.medicine_id === medicineId);
    if (!med) {
      return { success: false, reason: "ERR_MEDICINE_NOT_FOUND" };
    }
    if (med.requires_prescription && !p.unlocked_prescription_medicine_ids.includes(medicineId)) {
      return { success: false, reason: "ERR_PRESCRIPTION_REQUIRED" };
    }
    if (p.finances.cash_vnd < med.price_vnd) {
      return { success: false, reason: "ERR_INSUFFICIENT_CASH" };
    }

    p.finances.cash_vnd -= med.price_vnd;
    this.tickMinutes(10);
    this.applyOrganDeltas(
      Object.keys(med.effects_when_matched_mild.organ_deltas ?? {}).length > 0
        ? med.effects_when_matched_mild.organ_deltas
        : med.effects_when_mismatched_or_severe.organ_deltas
    );
    void this.saveCurrentProgress("ACTION_COMPLETED");
    return { success: true };
  }

  /**
   * 5. KHÁM CHUYÊN SÂU TẠI BỆNH VIỆN (Nghỉ 1 ngày làm 360p, lưu Phiếu Khám Bệnh vào túi) & TỰ ĐỘNG LƯU NGAY
   */
  public performHospitalExamination(baseFeeVnd: number = 1_500_000): {
    success: boolean;
    diagnosedDiseases: Array<{ diseaseId: string; organ: string; recommendedRxIds: string[] }>;
    organSnapshot: Record<string, number>;
    reason?: string;
  } {
    if (this.state.active_location.location_id !== "LOC_HOSPITAL") {
      return {
        success: false,
        diagnosedDiseases: [],
        organSnapshot: {},
        reason: "ERR_MUST_BE_AT_HOSPITAL",
      };
    }

    const p = this.state.player;
    const finalFee = p.finances.has_health_insurance ? Math.round(baseFeeVnd * 0.2) : baseFeeVnd;
    if (p.finances.cash_vnd < finalFee) {
      return {
        success: false,
        diagnosedDiseases: [],
        organSnapshot: {},
        reason: "ERR_INSUFFICIENT_CASH",
      };
    }

    p.finances.cash_vnd -= finalFee;
    p.capability_flags.is_biometrics_decoded = true;
    this.tickMinutes(360);

    const diagnosed: Array<{ diseaseId: string; organ: string; recommendedRxIds: string[] }> = [];
    for (const dis of this.db.diseaseCatalog.diseases) {
      const val = p.organs[dis.affected_organ] ?? 100;
      if (val <= dis.trigger_organ_threshold_max) {
        diagnosed.push({
          diseaseId: dis.disease_id,
          organ: dis.affected_organ,
          recommendedRxIds: dis.hospital_recommended_medicine_ids,
        });
        for (const rxId of dis.hospital_recommended_medicine_ids) {
          if (!p.unlocked_prescription_medicine_ids.includes(rxId)) {
            p.unlocked_prescription_medicine_ids.push(rxId);
          }
        }
      }
    }

    const allRxIds = Array.from(new Set(diagnosed.flatMap((d) => d.recommendedRxIds)));
    const pad = (n: number) => String(n).padStart(2, "0");
    const examDateStr = `${pad(this.state.clock.day)}/${pad(this.state.clock.month)}/${this.state.clock.year}`;

    p.inventory.unshift({
      instance_id: `med_report_${Date.now()}`,
      item_def_id: "ITEM_MEDICAL_REPORT",
      durability_pct: 100,
      stored_in_fridge: false,
      medical_report_payload: {
        exam_date_str: examDateStr,
        exam_age: p.exact_age_years,
        organ_snapshot: { ...p.organs },
        diagnosed_disease_ids: diagnosed.map((d) => d.diseaseId),
        prescribed_rx_ids: allRxIds,
      },
    });

    void this.saveCurrentProgress("ACTION_COMPLETED");

    return {
      success: true,
      diagnosedDiseases: diagnosed,
      organSnapshot: { ...p.organs },
    };
  }

  /**
   * 6. ĐỒNG BỘ VỚI ECO-LIFE SAVE ADAPTER (Lưu sau thao tác & giữ đúng sự kiện với thời gian đếm ngược gốc)
   */
  public async saveCurrentProgress(triggerReason: SaveTriggerReason = "MANUAL_SAVE"): Promise<void> {
    const p = this.state.player;
    const meta: SaveSlotMeta = {
      slot_id: this.state.slot_id,
      character_name: p.full_name,
      age_years: p.exact_age_years,
      birth_year: p.birth_year,
      current_game_year: this.state.clock.year,
      socioeconomic_origin: p.socioeconomic_origin,
      is_deceased: this.state.is_deceased,
      last_saved_unix_ms: Date.now(),
      save_trigger_reason: triggerReason,
      active_locale: this.state.active_locale,
    };

    const activeEvDef = this.state.active_popup_event
      ? this.db.events.find((e) => e.event_id === this.state.active_popup_event?.event_id)
      : null;
    const originalCountdown = activeEvDef
      ? this.computeEventCountdownFromJson(activeEvDef)
      : this.state.active_popup_event?.remaining_seconds ?? 0;

    const suspendedEvent: SuspendedEventSnapshot | null = this.state.active_popup_event
      ? {
          event_id: this.state.active_popup_event.event_id,
          original_countdown_seconds: originalCountdown,
          ptsd_freeze_remaining_seconds: p.ptsd_trauma_score >= 40 ? 2.0 : 0.0,
          captured_at_unix_ms: Date.now(),
        }
      : null;

    const res = await EcoLifeSaveAdapter.saveGameSlot(meta, this.state, {
      previousCounter: this.state.save_counter,
      triggerReason,
      suspendedEvent,
    });
    this.state.save_counter = res.nextCounter;
  }

  /**
   * 7. KHÔI PHỤC TRẠNG THÁI TỪ BẢN LƯU (Đặt lại đếm ngược sự kiện về thời gian gốc nếu tắt ngang lúc đang suy nghĩ)
   */
  public static restoreFromSaveEnvelope(
    db: EcoLifeJsonDatabaseBundle,
    envelope: {
      suspended_event_snapshot: SuspendedEventSnapshot | null;
      root_game_state: RootRuntimeGameState;
    }
  ): EcoLifeDataDrivenEngine {
    const restoredState = envelope.root_game_state;
    if (envelope.suspended_event_snapshot && restoredState.active_popup_event) {
      restoredState.active_popup_event.remaining_seconds =
        envelope.suspended_event_snapshot.original_countdown_seconds;
      restoredState.active_popup_event.ptsd_freeze_remaining_seconds =
        envelope.suspended_event_snapshot.ptsd_freeze_remaining_seconds;
    }
    return new EcoLifeDataDrivenEngine(db, restoredState);
  }

  // ============================================================================
  // CÁC HÀM NỘI BỘ ĐỌC TỪ JSON RULES
  // ============================================================================

  public applyOrganDeltas(deltas?: Record<string, number>): void {
    if (!deltas) return;
    const p = this.state.player;
    for (const [organ, delta] of Object.entries(deltas)) {
      if (typeof p.organs[organ] === "number") {
        p.organs[organ] = Math.max(0, Math.min(100, Number((p.organs[organ] + delta).toFixed(1))));
        if (p.organs[organ] <= 0) {
          this.state.is_deceased = true;
          this.state.death_cause_key = `cause_organ_failure_${organ}`;
        }
      }
    }
  }

  private applyAnnualAgingDecayFromJson(): void {
    const p = this.state.player;
    if (p.exact_age_years >= 60) {
      for (const k of Object.keys(p.organs)) {
        p.organs[k] = Math.max(0, Number((p.organs[k] - 2.0).toFixed(1)));
      }
      if (p.organs.brain < 25.0) {
        p.capability_flags.is_auto_pilot_active = true;
        this.state.simulation_mode = "DEMENTIA_AUTOPILOT";
        if (this.state.speed_multiplier === 0) {
          this.state.speed_multiplier = 1;
        }
      }
    }
  }

  private rollContextualEventFromJson(): EventDefJson | null {
    const p = this.state.player;
    const eligible = this.db.events.filter((ev) => {
      if (ev.category === "CHILDHOOD_MILESTONE") return false;
      if (!ev.is_repeatable && this.state.fired_non_repeatable_event_ids.includes(ev.event_id)) {
        return false;
      }
      if (
        ev.environment_filter !== "BOTH" &&
        ev.environment_filter !== this.state.active_location.environment_exposure
      ) {
        return false;
      }
      const cond = ev.trigger_conditions;
      if (cond.age_range && (p.exact_age_years < cond.age_range[0] || p.exact_age_years > cond.age_range[1])) {
        return false;
      }
      if (cond.required_biological_sex && cond.required_biological_sex !== p.biological_sex) {
        return false;
      }
      if (
        cond.allowed_location_ids &&
        cond.allowed_location_ids.length > 0 &&
        !cond.allowed_location_ids.includes(this.state.active_location.location_id)
      ) {
        return false;
      }
      if (cond.biological_and_item_triggers?.min_sleep_debt_hours) {
        if (p.sleep_debt_hours < cond.biological_and_item_triggers.min_sleep_debt_hours) {
          return false;
        }
      }
      return true;
    });

    if (eligible.length === 0 || Math.random() > 0.15) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  public computeEventCountdownFromJson(ev: EventDefJson): number {
    const rules = this.db.timeRules.event_popup_reaction_window;
    const base =
      ev.presentation.base_countdown_seconds ??
      rules.base_seconds_by_severity[
        ev.category as Exclude<EventDefJson["category"], "CHILDHOOD_MILESTONE">
      ];
    const p = this.state.player;
    let sec = base * Math.max(0.2, p.organs.brain / 100.0);
    if (p.innate_traits.includes("QUICK_REFLEXES")) {
      sec += rules.modifiers.quick_reflexes_trait_flat_bonus_sec;
    }
    if (p.ptsd_trauma_score >= 40.0) {
      sec += rules.modifiers.ptsd_freeze_penalty_sec;
    }
    return Number(
      Math.min(
        rules.modifiers.maximum_allowed_window_sec,
        Math.max(rules.modifiers.minimum_allowed_window_sec, sec)
      ).toFixed(2)
    );
  }

  private mapValueToColor(val: number): HealthColor {
    const thresholds = this.db.generatorRules.sensory_symptom_mapping_rules.health_color_thresholds;
    for (const [color, [min, max]] of Object.entries(thresholds) as Array<
      [HealthColor, [number, number]]
    >) {
      if (val >= min && val <= max) return color;
    }
    return val >= 85 ? "BLUE" : "RED";
  }

  private mapDurabilityToGrade(pct: number, def?: ItemDefJson): SensationGrade {
    if (!def) {
      if (pct >= 85) return "PRISTINE";
      if (pct >= 60) return "GOOD";
      if (pct >= 30) return "WORN";
      if (pct >= 10) return "DECAYED";
      return "BROKEN";
    }
    for (const [grade, [min, max]] of Object.entries(
      def.diegetic_sensation_matrix.grade_thresholds
    ) as Array<[SensationGrade, [number, number]]>) {
      if (pct >= min && pct <= max) return grade;
    }
    return "BROKEN";
  }

  private getSkyMonologueKeyByHour(hour: number): string {
    if (hour >= 5 && hour < 8) return "sky_dawn_early_mist";
    if (hour >= 8 && hour < 11) return "sky_morning_clear_sun";
    if (hour >= 11 && hour < 14) return "sky_noon_blazing_vertical";
    if (hour >= 14 && hour < 17) return "sky_afternoon_slanting_light";
    if (hour >= 17 && hour < 19) return "sky_dusk_chilly_wind";
    return "sky_night_pitch_dark";
  }
}