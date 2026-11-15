import React, { useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// 1. TYPES & EMBEDDED ENGINE + SAVE ADAPTER (SELF-CONTAINED CHO PREVIEW)
// ============================================================================

export type BiologicalSex = "MALE" | "FEMALE";
export type SocioeconomicTier = "Q1" | "Q2" | "Q3" | "Q4" | "Q5";
export type PersonalityType = "INTROVERT" | "EXTROVERT" | "DAREDEVIL" | "EMPATHETIC" | "AMBIVERT";
export type HealthColor = "BLUE" | "GREEN" | "YELLOW" | "ORANGE" | "RED";
export type SaveTriggerReason = "MANUAL_SAVE" | "AUTO_PERIODIC" | "APP_EXIT_SUSPEND";

export interface SaveSlotMeta {
  slot_id: string;
  character_name: string;
  age_years: number;
  birth_year: number;
  current_game_year: number;
  socioeconomic_origin: SocioeconomicTier;
  is_deceased: boolean;
  last_saved_unix_ms: number;
  save_trigger_reason?: SaveTriggerReason;
  active_locale: "vi-VN" | "en-US";
}

export interface SuspendedEventSnapshot {
  event_id: string;
  remaining_countdown_seconds: number;
  ptsd_freeze_remaining_seconds: number;
  captured_at_unix_ms: number;
}

export interface SaveFileEnvelope<TState = Record<string, unknown>> {
  save_format_version: string;
  slot_meta: SaveSlotMeta;
  integrity_envelope: {
    hmac_sha256_signature: string;
    save_counter: number;
  };
  suspended_event_snapshot: SuspendedEventSnapshot | null;
  root_game_state: TState;
}

class EcoLifeSaveAdapter {
  private static readonly WEB_SLOTS_KEY = "ecolife_save_slots_v1";
  private static readonly WEB_DATA_PREFIX = "ecolife_slot_data_";

  static async saveGameSlot<TState>(
    meta: SaveSlotMeta,
    rootGameState: TState,
    options?: {
      previousCounter?: number;
      triggerReason?: SaveTriggerReason;
      suspendedEvent?: SuspendedEventSnapshot | null;
    }
  ): Promise<{ success: boolean; nextCounter: number }> {
    const nextCounter = (options?.previousCounter ?? 0) + 1;
    const finalMeta: SaveSlotMeta = {
      ...meta,
      last_saved_unix_ms: Date.now(),
      save_trigger_reason: options?.triggerReason ?? "MANUAL_SAVE",
    };

    const envelope: SaveFileEnvelope<TState> = {
      save_format_version: "1.1.0",
      slot_meta: finalMeta,
      integrity_envelope: {
        hmac_sha256_signature: `web_dev_checksum_${nextCounter}`,
        save_counter: nextCounter,
      },
      suspended_event_snapshot: options?.suspendedEvent ?? null,
      root_game_state: rootGameState,
    };

    localStorage.setItem(`${this.WEB_DATA_PREFIX}${finalMeta.slot_id}`, JSON.stringify(envelope));
    const slots = await this.listSaveSlots();
    const filtered = slots.filter((s) => s.slot_id !== finalMeta.slot_id);
    filtered.unshift(finalMeta);
    localStorage.setItem(this.WEB_SLOTS_KEY, JSON.stringify(filtered));
    return { success: true, nextCounter };
  }

  static registerAutoSaveOnExit<TState>(
    getCurrentSnapshot: () => {
      meta: SaveSlotMeta;
      state: TState;
      saveCounter: number;
      activeEvent: SuspendedEventSnapshot | null;
    } | null
  ): () => void {
    const handleExitSave = () => {
      const snap = getCurrentSnapshot();
      if (!snap || snap.meta.is_deceased) return;
      const nextCounter = snap.saveCounter + 1;
      const finalMeta: SaveSlotMeta = {
        ...snap.meta,
        last_saved_unix_ms: Date.now(),
        save_trigger_reason: "APP_EXIT_SUSPEND",
      };
      const envelope: SaveFileEnvelope<TState> = {
        save_format_version: "1.1.0",
        slot_meta: finalMeta,
        integrity_envelope: {
          hmac_sha256_signature: `web_exit_checksum_${nextCounter}`,
          save_counter: nextCounter,
        },
        suspended_event_snapshot: snap.activeEvent,
        root_game_state: snap.state,
      };
      localStorage.setItem(`${this.WEB_DATA_PREFIX}${finalMeta.slot_id}`, JSON.stringify(envelope));
      const rawList = localStorage.getItem(this.WEB_SLOTS_KEY);
      const slots: SaveSlotMeta[] = rawList ? JSON.parse(rawList) : [];
      const filtered = slots.filter((s) => s.slot_id !== finalMeta.slot_id);
      filtered.unshift(finalMeta);
      localStorage.setItem(this.WEB_SLOTS_KEY, JSON.stringify(filtered));
    };

    window.addEventListener("beforeunload", handleExitSave);
    return () => window.removeEventListener("beforeunload", handleExitSave);
  }

  static async loadGameSlot<TState>(
    slotId: string
  ): Promise<{ envelope: SaveFileEnvelope<TState> | null; tampered: boolean }> {
    const raw = localStorage.getItem(`${this.WEB_DATA_PREFIX}${slotId}`);
    if (!raw) return { envelope: null, tampered: false };
    return { envelope: JSON.parse(raw) as SaveFileEnvelope<TState>, tampered: false };
  }

  static async listSaveSlots(): Promise<SaveSlotMeta[]> {
    const raw = localStorage.getItem(this.WEB_SLOTS_KEY);
    return raw ? (JSON.parse(raw) as SaveSlotMeta[]) : [];
  }
}

// ============================================================================
// 2. EMBEDDED DATA-DRIVEN ENGINE (KHỚP SCHEMA JSON DỰ ÁN)
// ============================================================================

interface DiseaseDef {
  disease_id: string;
  affected_organ: string;
  trigger_organ_threshold_max: number;
  symptom_cluster_id: string;
  is_curable_by_otc_if_mild: boolean;
  hospital_recommended_medicine_ids: string[];
}

interface MedicineDef {
  medicine_id: string;
  requires_prescription: boolean;
  price_vnd: number;
  treats_disease_ids: string[];
  symptom_clusters_covered: string[];
  effects_when_matched_mild: { organ_deltas?: Record<string, number> };
  effects_when_mismatched_or_severe: {
    suppress_symptom_hours?: number;
    organ_deltas?: Record<string, number>;
  };
}

interface EventDef {
  event_id: string;
  category: "DAILY_GRAY" | "OPPORTUNITY_GREEN" | "DANGER_RED";
  environment_filter: "INDOOR" | "OUTDOOR" | "BOTH";
  presentation: {
    title_key: string;
    narrative_body_key: string;
    base_countdown_seconds: number;
  };
  choices: Array<{
    choice_id: string;
    label_key: string;
    outcomes: {
      time_elapsed_minutes?: number;
      money_delta_vnd?: number;
      happiness_delta?: number;
      organ_deltas?: Record<string, number>;
    };
  }>;
}

const EMBEDDED_JSON_BUNDLE = {
  symptomClusters: {
    SYM_UPPER_ABDOMINAL_ACHE: "Đau âm ỉ vùng bụng trên, ăn uống khó tiêu, người mệt mỏi.",
    SYM_CHEST_TIGHTNESS_BURNING: "Ngực tức nghẹn, nóng rát vùng chấn thủy, thỉnh thoảng hụt hơi.",
    SYM_DIZZINESS_HEADACHE_FATIGUE: "Đau đầu, hoa mắt chóng mặt, mất ngủ kéo dài và hay quên.",
    SYM_LOWER_BACK_AND_FATIGUE: "Đau mỏi thắt lưng, tiểu đêm nhiều lần, cơ thể uể oải.",
  } as Record<string, string>,
  diseases: [
    {
      disease_id: "DIS_GASTRITIS_MILD",
      affected_organ: "digestive",
      trigger_organ_threshold_max: 44.99,
      symptom_cluster_id: "SYM_UPPER_ABDOMINAL_ACHE",
      is_curable_by_otc_if_mild: true,
      hospital_recommended_medicine_ids: ["MED_GASTRIC_MUCOSA_RX"],
    },
    {
      disease_id: "DIS_FATTY_LIVER_HEPATITIS",
      affected_organ: "liver",
      trigger_organ_threshold_max: 44.99,
      symptom_cluster_id: "SYM_UPPER_ABDOMINAL_ACHE",
      is_curable_by_otc_if_mild: true,
      hospital_recommended_medicine_ids: ["MED_HEPATITIS_SPECIAL_RX"],
    },
    {
      disease_id: "DIS_CORONARY_ISCHEMIA",
      affected_organ: "heart",
      trigger_organ_threshold_max: 44.99,
      symptom_cluster_id: "SYM_CHEST_TIGHTNESS_BURNING",
      is_curable_by_otc_if_mild: false,
      hospital_recommended_medicine_ids: ["MED_CARDIO_VASODILATOR_RX"],
    },
    {
      disease_id: "DIS_ASTHMA_BRONCHITIS",
      affected_organ: "lungs",
      trigger_organ_threshold_max: 44.99,
      symptom_cluster_id: "SYM_CHEST_TIGHTNESS_BURNING",
      is_curable_by_otc_if_mild: true,
      hospital_recommended_medicine_ids: ["MED_INHALER_ASTHMA_RX"],
    },
    {
      disease_id: "DIS_CEREBRAL_ANEMIA_STRESS",
      affected_organ: "brain",
      trigger_organ_threshold_max: 44.99,
      symptom_cluster_id: "SYM_DIZZINESS_HEADACHE_FATIGUE",
      is_curable_by_otc_if_mild: true,
      hospital_recommended_medicine_ids: ["MED_NEURO_RECOVERY_RX"],
    },
    {
      disease_id: "DIS_LUMBAR_DEGENERATION",
      affected_organ: "musculoskeletal",
      trigger_organ_threshold_max: 44.99,
      symptom_cluster_id: "SYM_LOWER_BACK_AND_FATIGUE",
      is_curable_by_otc_if_mild: true,
      hospital_recommended_medicine_ids: ["MED_ORTHOPEDIC_RX"],
    },
    {
      disease_id: "DIS_KIDNEY_DYSFUNCTION",
      affected_organ: "kidneys",
      trigger_organ_threshold_max: 44.99,
      symptom_cluster_id: "SYM_LOWER_BACK_AND_FATIGUE",
      is_curable_by_otc_if_mild: false,
      hospital_recommended_medicine_ids: ["MED_RENAL_THERAPY_RX"],
    },
  ] as DiseaseDef[],
  medicines: [
    {
      medicine_id: "MED_PAINKILLER_GENERIC_OTC",
      requires_prescription: false,
      price_vnd: 45000,
      treats_disease_ids: [],
      symptom_clusters_covered: [
        "SYM_UPPER_ABDOMINAL_ACHE",
        "SYM_CHEST_TIGHTNESS_BURNING",
        "SYM_DIZZINESS_HEADACHE_FATIGUE",
        "SYM_LOWER_BACK_AND_FATIGUE",
      ],
      effects_when_matched_mild: {},
      effects_when_mismatched_or_severe: {
        suppress_symptom_hours: 6,
        organ_deltas: { liver: -5.5, kidneys: -2.0 },
      },
    },
    {
      medicine_id: "MED_ANTACID_STOMACH",
      requires_prescription: false,
      price_vnd: 120000,
      treats_disease_ids: ["DIS_GASTRITIS_MILD"],
      symptom_clusters_covered: ["SYM_UPPER_ABDOMINAL_ACHE", "SYM_CHEST_TIGHTNESS_BURNING"],
      effects_when_matched_mild: { organ_deltas: { digestive: 11.0, liver: -1.0 } },
      effects_when_mismatched_or_severe: { suppress_symptom_hours: 3, organ_deltas: { liver: -3.5 } },
    },
    {
      medicine_id: "MED_LIVER_DETOX_OTC",
      requires_prescription: false,
      price_vnd: 180000,
      treats_disease_ids: ["DIS_FATTY_LIVER_HEPATITIS"],
      symptom_clusters_covered: ["SYM_UPPER_ABDOMINAL_ACHE"],
      effects_when_matched_mild: { organ_deltas: { liver: 10.5 } },
      effects_when_mismatched_or_severe: { organ_deltas: { kidneys: -2.5 } },
    },
    {
      medicine_id: "MED_HEPATITIS_SPECIAL_RX",
      requires_prescription: true,
      price_vnd: 850000,
      treats_disease_ids: ["DIS_FATTY_LIVER_HEPATITIS"],
      symptom_clusters_covered: ["SYM_UPPER_ABDOMINAL_ACHE"],
      effects_when_matched_mild: { organ_deltas: { liver: 25.0 } },
      effects_when_mismatched_or_severe: { organ_deltas: { liver: 20.0 } },
    },
    {
      medicine_id: "MED_GASTRIC_MUCOSA_RX",
      requires_prescription: true,
      price_vnd: 650000,
      treats_disease_ids: ["DIS_GASTRITIS_MILD"],
      symptom_clusters_covered: ["SYM_UPPER_ABDOMINAL_ACHE"],
      effects_when_matched_mild: { organ_deltas: { digestive: 25.0 } },
      effects_when_mismatched_or_severe: { organ_deltas: { digestive: 20.0 } },
    },
    {
      medicine_id: "MED_CARDIO_VASODILATOR_RX",
      requires_prescription: true,
      price_vnd: 1200000,
      treats_disease_ids: ["DIS_CORONARY_ISCHEMIA"],
      symptom_clusters_covered: ["SYM_CHEST_TIGHTNESS_BURNING"],
      effects_when_matched_mild: { organ_deltas: { heart: 22.0 } },
      effects_when_mismatched_or_severe: { organ_deltas: { heart: 18.0 } },
    },
    {
      medicine_id: "MED_INHALER_ASTHMA_RX",
      requires_prescription: true,
      price_vnd: 750000,
      treats_disease_ids: ["DIS_ASTHMA_BRONCHITIS"],
      symptom_clusters_covered: ["SYM_CHEST_TIGHTNESS_BURNING"],
      effects_when_matched_mild: { organ_deltas: { lungs: 24.0 } },
      effects_when_mismatched_or_severe: { organ_deltas: { lungs: 20.0 } },
    },
    {
      medicine_id: "MED_NEURO_RECOVERY_RX",
      requires_prescription: true,
      price_vnd: 980000,
      treats_disease_ids: ["DIS_CEREBRAL_ANEMIA_STRESS"],
      symptom_clusters_covered: ["SYM_DIZZINESS_HEADACHE_FATIGUE"],
      effects_when_matched_mild: { organ_deltas: { brain: 22.0 } },
      effects_when_mismatched_or_severe: { organ_deltas: { brain: 18.0 } },
    },
    {
      medicine_id: "MED_ORTHOPEDIC_RX",
      requires_prescription: true,
      price_vnd: 800000,
      treats_disease_ids: ["DIS_LUMBAR_DEGENERATION"],
      symptom_clusters_covered: ["SYM_LOWER_BACK_AND_FATIGUE"],
      effects_when_matched_mild: { organ_deltas: { musculoskeletal: 24.0 } },
      effects_when_mismatched_or_severe: { organ_deltas: { musculoskeletal: 20.0 } },
    },
    {
      medicine_id: "MED_RENAL_THERAPY_RX",
      requires_prescription: true,
      price_vnd: 1100000,
      treats_disease_ids: ["DIS_KIDNEY_DYSFUNCTION"],
      symptom_clusters_covered: ["SYM_LOWER_BACK_AND_FATIGUE"],
      effects_when_matched_mild: { organ_deltas: { kidneys: 22.0 } },
      effects_when_mismatched_or_severe: { organ_deltas: { kidneys: 18.0 } },
    },
  ] as MedicineDef[],
  events: [
    {
      event_id: "EVT_OUTDOOR_TRAFFIC_SPLASH",
      category: "DAILY_GRAY",
      environment_filter: "OUTDOOR",
      presentation: {
        title_key: "Xe buýt phóng qua vũng nước ngoài phố",
        narrative_body_key: "Một chiếc xe buýt chạy sát lề đường bắn nước tung tóe khi bạn đang đi ngoài trời.",
        base_countdown_seconds: 10,
      },
      choices: [
        {
          choice_id: "DODGE_QUICKLY",
          label_key: "Nhanh chân né lên vỉa hè (+5p)",
          outcomes: { time_elapsed_minutes: 5, happiness_delta: -2 },
        },
        {
          choice_id: "GET_SPLASHED",
          label_key: "Không kịp né, ướt sũng quần áo (-15p)",
          outcomes: { time_elapsed_minutes: 15, happiness_delta: -10 },
        },
      ],
    },
    {
      event_id: "EVT_INDOOR_NEIGHBOR_GIFT",
      category: "OPPORTUNITY_GREEN",
      environment_filter: "INDOOR",
      presentation: {
        title_key: "Hàng xóm gõ cửa biếu giỏ trái cây",
        narrative_body_key: "Bác hàng xóm vừa từ quê lên mang biếu gia đình ít trái cây tươi.",
        base_countdown_seconds: 12,
      },
      choices: [
        {
          choice_id: "CHAT_WARMLY",
          label_key: "Mời vào nhà uống trà trò chuyện (+20p, +8 Hạnh phúc)",
          outcomes: { time_elapsed_minutes: 20, happiness_delta: 8, organ_deltas: { digestive: 3 } },
        },
        {
          choice_id: "THANK_BRIEFLY",
          label_key: "Cảm ơn nhanh rồi đóng cửa (+2p, +3 Hạnh phúc)",
          outcomes: { time_elapsed_minutes: 2, happiness_delta: 3 },
        },
      ],
    },
  ] as EventDef[],
};

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
  player: {
    full_name: string;
    biological_sex: BiologicalSex;
    socioeconomic_origin: SocioeconomicTier;
    birth_year: number;
    exact_age_years: number;
    locked_personality: PersonalityType | null;
    childhood_personality_votes: Record<PersonalityType, number>;
    organs: Record<string, number>;
    ptsd_trauma_score: number;
    happiness_score: number;
    symptom_suppressed_hours_left: number;
    unlocked_prescription_medicine_ids: string[];
    inventory: Array<{
      instance_id: string;
      item_def_id: string;
      medical_report_payload?: {
        exam_date_str: string;
        exam_age: number;
        organ_snapshot: Record<string, number>;
        prescribed_rx_ids: string[];
      };
    }>;
    capability_flags: {
      has_wristwatch: boolean;
      is_biometrics_decoded: boolean;
      is_auto_pilot_active: boolean;
    };
    finances: {
      cash_vnd: number;
      has_health_insurance: boolean;
    };
  };
  active_popup_event: {
    event_id: string;
    remaining_seconds: number;
    ptsd_freeze_remaining_seconds: number;
  } | null;
  is_deceased: boolean;
}

class EcoLifeDataDrivenEngine {
  private readonly db = EMBEDDED_JSON_BUNDLE;
  private state: RootRuntimeGameState;

  constructor(initialState: RootRuntimeGameState) {
    this.state = initialState;
  }

  public static createNewLifeFromJson(params: {
    slotId: string;
    fullName: string;
    birthYear: number;
  }): EcoLifeDataDrivenEngine {
    const tiers: SocioeconomicTier[] = ["Q1", "Q2", "Q3", "Q4", "Q5"];
    const origin = tiers[Math.floor(Math.random() * tiers.length)];
    const sex: BiologicalSex = Math.random() < 0.5 ? "MALE" : "FEMALE";
    const randOrgan = () => Number((88 + Math.random() * 12).toFixed(1));

    return new EcoLifeDataDrivenEngine({
      slot_id: params.slotId,
      save_counter: 0,
      active_locale: "vi-VN",
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
        full_name: params.fullName,
        biological_sex: sex,
        socioeconomic_origin: origin,
        birth_year: params.birthYear,
        exact_age_years: 0,
        locked_personality: null,
        childhood_personality_votes: {
          INTROVERT: 0,
          EXTROVERT: 0,
          DAREDEVIL: 0,
          EMPATHETIC: 0,
          AMBIVERT: 0,
        },
        organs: {
          brain: randOrgan(),
          heart: randOrgan(),
          lungs: randOrgan(),
          liver: randOrgan(),
          digestive: randOrgan(),
          musculoskeletal: randOrgan(),
          kidneys: randOrgan(),
        },
        ptsd_trauma_score: 0,
        happiness_score: 75,
        symptom_suppressed_hours_left: 0,
        unlocked_prescription_medicine_ids: [],
        inventory: [],
        capability_flags: {
          has_wristwatch: false,
          is_biometrics_decoded: false,
          is_auto_pilot_active: false,
        },
        finances: {
          cash_vnd: 0,
          has_health_insurance: origin !== "Q1",
        },
      },
      active_popup_event: null,
      is_deceased: false,
    });
  }

  public getState(): RootRuntimeGameState {
    return this.state;
  }

  public getEvents(): EventDef[] {
    return this.db.events;
  }

  public getSensoryHudProjection(): {
    healthColor: HealthColor;
    happinessColor: HealthColor;
    symptomMonologueKey: string;
    canSeeDigitalClock: boolean;
    formattedClockOrSkyKey: string;
  } {
    const p = this.state.player;
    const minOrgan = Math.min(...Object.values(p.organs));
    const mapColor = (val: number): HealthColor => {
      if (val >= 85) return "BLUE";
      if (val >= 65) return "GREEN";
      if (val >= 45) return "YELLOW";
      if (val >= 25) return "ORANGE";
      return "RED";
    };

    let symptom = "Cơ thể bình thường, không có dấu hiệu bất ổn rõ rệt.";
    if (p.symptom_suppressed_hours_left > 0) {
      symptom = "Cơn đau đã dịu xuống sau khi uống thuốc giảm đau...";
    } else if (minOrgan < 45) {
      const weakest = Object.keys(p.organs).reduce((a, b) => (p.organs[a] < p.organs[b] ? a : b));
      const dis = this.db.diseases.find((d) => d.affected_organ === weakest);
      if (dis && this.db.symptomClusters[dis.symptom_cluster_id]) {
        symptom = this.db.symptomClusters[dis.symptom_cluster_id];
      }
    }

    const canSeeDigitalClock = p.capability_flags.has_wristwatch;
    const pad = (n: number) => String(n).padStart(2, "0");
    const skyByHour = (h: number) => {
      if (h >= 5 && h < 8) return "Sương sớm tan dần, trời hửng sáng...";
      if (h >= 8 && h < 11) return "Nắng sớm rải nhẹ ngoài hiên...";
      if (h >= 11 && h < 14) return "Nắng đã đứng bóng, không khí oi ả...";
      if (h >= 14 && h < 17) return "Nắng chiều ngả bóng dài...";
      if (h >= 17 && h < 19) return "Bầu trời nhá nhem tối, gió lạnh thổi nhẹ...";
      return "Màn đêm tĩnh mịch bao trùm...";
    };

    return {
      healthColor: mapColor(minOrgan),
      happinessColor: mapColor(p.happiness_score),
      symptomMonologueKey: symptom,
      canSeeDigitalClock,
      formattedClockOrSkyKey: canSeeDigitalClock
        ? `${pad(this.state.clock.hour)}:${pad(this.state.clock.minute)}`
        : skyByHour(this.state.clock.hour),
    };
  }

  public advanceChildhoodYear(chosenGroup: PersonalityType): {
    reachedAgeSix: boolean;
    lockedPersonality: PersonalityType | null;
  } {
    const p = this.state.player;
    p.childhood_personality_votes[chosenGroup] = (p.childhood_personality_votes[chosenGroup] || 0) + 1;
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
      return { reachedAgeSix: true, lockedPersonality: locked };
    }
    return { reachedAgeSix: false, lockedPersonality: null };
  }

  public tickMinutes(minutesToAdvance: number): void {
    if (this.state.is_deceased || this.state.simulation_mode === "EVENT_POPUP_FROZEN") return;

    const p = this.state.player;
    const prevHour = Math.floor(this.state.clock.total_elapsed_minutes / 60);
    this.state.clock.total_elapsed_minutes += minutesToAdvance;
    const newHour = Math.floor(this.state.clock.total_elapsed_minutes / 60);

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
    }

    const elapsedHours = newHour - prevHour;
    if (elapsedHours > 0) {
      if (p.symptom_suppressed_hours_left > 0) {
        p.symptom_suppressed_hours_left = Math.max(0, p.symptom_suppressed_hours_left - elapsedHours);
      }
      // Ngẫu nhiên bật sự kiện phù hợp INDOOR / OUTDOOR
      if (!this.state.active_popup_event && Math.random() < 0.18) {
        const pool = this.db.events.filter(
          (e) =>
            e.environment_filter === "BOTH" ||
            e.environment_filter === this.state.active_location.environment_exposure
        );
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          this.state.active_popup_event = {
            event_id: picked.event_id,
            remaining_seconds: picked.presentation.base_countdown_seconds,
            ptsd_freeze_remaining_seconds: p.ptsd_trauma_score >= 40 ? 2 : 0,
          };
          this.state.simulation_mode = "EVENT_POPUP_FROZEN";
          this.state.speed_multiplier = 0;
        }
      }
    }
  }

  public consultPharmacistBySymptom(): {
    purchasedMedicineId: string | null;
    curedMildDisease: boolean;
    reason?: string;
  } {
    if (this.state.active_location.location_id !== "LOC_PHARMACY") {
      return { purchasedMedicineId: null, curedMildDisease: false, reason: "Bạn phải đứng tại Hiệu thuốc tây mới mua được!" };
    }
    const p = this.state.player;
    const weakest = Object.keys(p.organs).reduce((a, b) => (p.organs[a] < p.organs[b] ? a : b));
    const score = p.organs[weakest];
    const dis = this.db.diseases.find((d) => d.affected_organ === weakest);
    if (!dis) return { purchasedMedicineId: null, curedMildDisease: false, reason: "Không rõ triệu chứng." };

    const otcPool = this.db.medicines.filter(
      (m) => !m.requires_prescription && m.symptom_clusters_covered.includes(dis.symptom_cluster_id)
    );
    const chosen = otcPool[Math.floor(Math.random() * otcPool.length)];
    if (p.finances.cash_vnd < chosen.price_vnd) {
      return { purchasedMedicineId: null, curedMildDisease: false, reason: "Không đủ tiền mặt." };
    }

    p.finances.cash_vnd -= chosen.price_vnd;
    this.tickMinutes(15);

    const isMild = score >= 25 && score < 45;
    const isMatched =
      isMild && dis.is_curable_by_otc_if_mild && chosen.treats_disease_ids.includes(dis.disease_id);

    if (isMatched) {
      this.applyOrganDeltas(chosen.effects_when_matched_mild.organ_deltas);
      return { purchasedMedicineId: chosen.medicine_id, curedMildDisease: true };
    } else {
      this.applyOrganDeltas(chosen.effects_when_mismatched_or_severe.organ_deltas);
      p.symptom_suppressed_hours_left =
        chosen.effects_when_mismatched_or_severe.suppress_symptom_hours ?? 0;
      return { purchasedMedicineId: chosen.medicine_id, curedMildDisease: false };
    }
  }

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
        reason: "Bạn phải di chuyển tới Bệnh viện mới khám xét nghiệm được!",
      };
    }

    const p = this.state.player;
    const finalFee = p.finances.has_health_insurance ? Math.round(baseFeeVnd * 0.2) : baseFeeVnd;
    if (p.finances.cash_vnd < finalFee) {
      return { success: false, diagnosedDiseases: [], organSnapshot: {}, reason: "Không đủ tiền viện phí." };
    }

    p.finances.cash_vnd -= finalFee;
    p.capability_flags.is_biometrics_decoded = true;
    this.tickMinutes(360);

    const diagnosed: Array<{ diseaseId: string; organ: string; recommendedRxIds: string[] }> = [];
    for (const dis of this.db.diseases) {
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
    p.inventory.unshift({
      instance_id: `med_report_${Date.now()}`,
      item_def_id: "ITEM_MEDICAL_REPORT",
      medical_report_payload: {
        exam_date_str: `${pad(this.state.clock.day)}/${pad(this.state.clock.month)}/${this.state.clock.year}`,
        exam_age: p.exact_age_years,
        organ_snapshot: { ...p.organs },
        prescribed_rx_ids: allRxIds,
      },
    });

    return { success: true, diagnosedDiseases: diagnosed, organSnapshot: { ...p.organs } };
  }

  public purchaseAndTakePrescribedMedicine(medicineId: string): {
    success: boolean;
    reason?: string;
  } {
    const loc = this.state.active_location.location_id;
    if (loc !== "LOC_HOSPITAL" && loc !== "LOC_PHARMACY") {
      return { success: false, reason: "Phải đứng ở Bệnh viện hoặc Nhà thuốc mới mua được thuốc!" };
    }
    const p = this.state.player;
    const med = this.db.medicines.find((m) => m.medicine_id === medicineId);
    if (!med) return { success: false, reason: "Không tìm thấy mã thuốc." };
    if (med.requires_prescription && !p.unlocked_prescription_medicine_ids.includes(medicineId)) {
      return { success: false, reason: "Thuốc này bắt buộc phải có đơn của Bác sĩ Bệnh viện!" };
    }
    if (p.finances.cash_vnd < med.price_vnd) {
      return { success: false, reason: "Không đủ tiền mặt mua thuốc." };
    }

    p.finances.cash_vnd -= med.price_vnd;
    this.tickMinutes(10);
    this.applyOrganDeltas(
      Object.keys(med.effects_when_matched_mild.organ_deltas ?? {}).length > 0
        ? med.effects_when_matched_mild.organ_deltas
        : med.effects_when_mismatched_or_severe.organ_deltas
    );
    return { success: true };
  }

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
    const res = await EcoLifeSaveAdapter.saveGameSlot(meta, this.state, {
      previousCounter: this.state.save_counter,
      triggerReason,
      suspendedEvent: this.state.active_popup_event
        ? {
            event_id: this.state.active_popup_event.event_id,
            remaining_countdown_seconds: this.state.active_popup_event.remaining_seconds,
            ptsd_freeze_remaining_seconds:
              this.state.active_popup_event.ptsd_freeze_remaining_seconds,
            captured_at_unix_ms: Date.now(),
          }
        : null,
    });
    this.state.save_counter = res.nextCounter;
  }

  public applyOrganDeltas(deltas?: Record<string, number>): void {
    if (!deltas) return;
    const p = this.state.player;
    for (const [organ, delta] of Object.entries(deltas)) {
      if (typeof p.organs[organ] === "number") {
        p.organs[organ] = Math.max(0, Math.min(100, Number((p.organs[organ] + delta).toFixed(1))));
      }
    }
  }
}

// ============================================================================
// 3. GIAO DIỆN THỬ NGHIỆM GIẤY DÓ (UI PREVIEW)
// ============================================================================

const COLOR_BADGE_MAP: Record<HealthColor, { bg: string; label: string }> = {
  BLUE: { bg: "#2B6CB0", label: "Xanh Biển (Xuất sắc)" },
  GREEN: { bg: "#2F855A", label: "Xanh Lá (Tốt)" },
  YELLOW: { bg: "#D69E2E", label: "Vàng (Tạm được)" },
  ORANGE: { bg: "#DD6B20", label: "Cam (Không ổn)" },
  RED: { bg: "#B8382A", label: "Đỏ (Nguy kịch)" },
};

const CHILDHOOD_PROMPTS = [
  "Năm 1 tuổi: Tiếng sấm đầu mùa vang lên ngoài hiên nhà...",
  "Năm 2 tuổi: Mẹ đặt trước mặt bạn một hộp gỗ đầy đồ chơi cũ...",
  "Năm 3 tuổi: Đêm mưa mất điện tối om, ánh đèn pin hắt lên tường...",
  "Năm 4 tuổi: Bạn hàng xóm sang chơi và làm rơi chiếc cốc nhựa...",
  "Năm 5 tuổi: Ngày đầu tiên đứng trước cổng trường mẫu giáo...",
];

const DISPLAY_LABELS: Record<string, string> = {
  LOC_HOME: "Nhà Riêng (Phòng Khách)",
  LOC_TRANSIT_ROAD: "Đường Phố Thành Phố",
  LOC_PHARMACY: "Hiệu Thuốc Tây",
  LOC_HOSPITAL: "Bệnh Viện Đa Khoa",
  MED_PAINKILLER_GENERIC_OTC: "Thuốc Giảm Đau Tức Thì (OTC)",
  MED_ANTACID_STOMACH: "Thuốc Trung Hòa Axit Dạ Dày",
  MED_LIVER_DETOX_OTC: "Viên Giải Độc & Mát Gan",
  MED_HEPATITIS_SPECIAL_RX: "Thuốc Đặc Trị Kháng Viêm Gan (Kê Đơn)",
  MED_GASTRIC_MUCOSA_RX: "Thuốc Tái Tạo Niêm Mạc Dạ Dày (Kê Đơn)",
  MED_CARDIO_VASODILATOR_RX: "Thuốc Giãn Mạch Vành Tim (Kê Đơn)",
  MED_INHALER_ASTHMA_RX: "Bình Xịt Giãn Phế Quản Hen Suyễn (Kê Đơn)",
  MED_NEURO_RECOVERY_RX: "Thuốc Tuần Hoàn & Phục Hồi Não Bộ (Kê Đơn)",
  MED_ORTHOPEDIC_RX: "Thuốc Kháng Viêm & Tái Tạo Sụn Khớp (Kê Đơn)",
  MED_RENAL_THERAPY_RX: "Thuốc Điều Trị Suy Chức Năng Thận (Kê Đơn)",
};

const tLabel = (key: string) => DISPLAY_LABELS[key] ?? key;

export default function App() {
  const engineRef = useRef<EcoLifeDataDrivenEngine | null>(null);

  const [gameState, setGameState] = useState<RootRuntimeGameState | null>(null);
  const [savedSlots, setSavedSlots] = useState<SaveSlotMeta[]>([]);
  const [newName, setNewName] = useState("Trần Minh An");
  const [birthYear, setBirthYear] = useState(2002);
  const [statusLog, setStatusLog] = useState<string>("Sẵn sàng khởi tạo cuộc đời từ dữ liệu JSON.");
  const [medicalReport, setMedicalReport] = useState<{
    organs: Record<string, number>;
    prescribedRxIds: string[];
  } | null>(null);

  // Đặt tất cả Hooks lên trước các lệnh return có điều kiện để tuân thủ Rules of Hooks của React
  const activeEventDef = useMemo(() => {
    if (!gameState?.active_popup_event || !engineRef.current) return null;
    return (
      engineRef.current
        .getEvents()
        .find((e) => e.event_id === gameState.active_popup_event?.event_id) ?? null
    );
  }, [gameState?.active_popup_event]);

  useEffect(() => {
    void EcoLifeSaveAdapter.listSaveSlots().then(setSavedSlots);
  }, []);

  useEffect(() => {
    return EcoLifeSaveAdapter.registerAutoSaveOnExit(() => {
      const eng = engineRef.current;
      if (!eng) return null;
      const st = eng.getState();
      return {
        meta: {
          slot_id: st.slot_id,
          character_name: st.player.full_name,
          age_years: st.player.exact_age_years,
          birth_year: st.player.birth_year,
          current_game_year: st.clock.year,
          socioeconomic_origin: st.player.socioeconomic_origin,
          is_deceased: st.is_deceased,
          last_saved_unix_ms: Date.now(),
          active_locale: st.active_locale,
        },
        state: st,
        saveCounter: st.save_counter,
        activeEvent: st.active_popup_event
          ? {
              event_id: st.active_popup_event.event_id,
              remaining_countdown_seconds: st.active_popup_event.remaining_seconds,
              ptsd_freeze_remaining_seconds:
                st.active_popup_event.ptsd_freeze_remaining_seconds,
              captured_at_unix_ms: Date.now(),
            }
          : null,
      };
    });
  }, []);

  useEffect(() => {
    if (!gameState || gameState.is_deceased) return;
    if (gameState.simulation_mode === "CHILDHOOD_FAST_FORWARD") return;
    if (gameState.speed_multiplier === 0) return;

    const timer = window.setInterval(() => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.tickMinutes(eng.getState().speed_multiplier);
      setGameState({ ...eng.getState() });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [gameState?.simulation_mode, gameState?.speed_multiplier, gameState?.is_deceased]);

  const syncState = () => {
    if (engineRef.current) {
      setGameState({ ...engineRef.current.getState() });
    }
  };

  const handleStartNewLife = () => {
    const slotId = `slot_${Date.now()}`;
    const eng = EcoLifeDataDrivenEngine.createNewLifeFromJson({
      slotId,
      fullName: newName.trim() || "Vô Danh",
      birthYear,
    });
    eng.getState().player.finances.cash_vnd = 2_500_000;
    engineRef.current = eng;
    setMedicalReport(null);
    setStatusLog(
      `Đã khai sinh ${eng.getState().player.full_name} (Gia cảnh ${eng.getState().player.socioeconomic_origin}).`
    );
    syncState();
  };

  const handleLoadSlot = async (slotId: string) => {
    const { envelope, tampered } = await EcoLifeSaveAdapter.loadGameSlot<RootRuntimeGameState>(slotId);
    if (tampered) {
      setStatusLog("Cảnh báo: File lưu trữ có dấu hiệu bị chỉnh sửa trái phép!");
      return;
    }
    if (!envelope) return;
    const eng = new EcoLifeDataDrivenEngine(envelope.root_game_state);
    engineRef.current = eng;
    setMedicalReport(null);
    setStatusLog(`Đã khôi phục cuộc đời ${envelope.slot_meta.character_name} ngay đúng khoảnh khắc đang chơi.`);
    syncState();
  };

  if (!gameState || !engineRef.current) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>DÒNG ĐỜI (ECO-LIFE) — BẢN TEST ENGINE</h1>
          <p style={styles.sub}>Nạp trực tiếp từ dữ liệu JSON • Giao diện Giấy Dó tối giản</p>

          <div style={styles.section}>
            <h3>1. Khai Sinh Cuộc Đời Mới (0 Tuổi)</h3>
            <div style={styles.row}>
              <input
                style={styles.input}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nhập họ tên..."
              />
              <input
                style={{ ...styles.input, width: 110 }}
                type="number"
                value={birthYear}
                onChange={(e) => setBirthYear(Number(e.target.value))}
              />
              <button style={styles.primaryBtn} onClick={handleStartNewLife}>
                Bắt Đầu (0 Tuổi)
              </button>
            </div>
          </div>

          <div style={styles.section}>
            <h3>2. Tiếp Tục Cuộc Đời Đã Lưu ({savedSlots.length})</h3>
            {savedSlots.length === 0 ? (
              <p style={{ color: "#6B6156", fontSize: 14 }}>Chưa có bản lưu nào.</p>
            ) : (
              savedSlots.map((slot) => (
                <div key={slot.slot_id} style={styles.saveItem}>
                  <span>
                    <strong>{slot.character_name}</strong> — {slot.age_years} tuổi (Gia cảnh {slot.socioeconomic_origin})
                  </span>
                  <button style={styles.btn} onClick={() => void handleLoadSlot(slot.slot_id)}>
                    Tiếp tục
                  </button>
                </div>
              ))
            )}
          </div>
          <div style={styles.logBox}>{statusLog}</div>
        </div>
      </div>
    );
  }

  const eng = engineRef.current;
  const hud = eng.getSensoryHudProjection();
  const p = gameState.player;

  if (gameState.simulation_mode === "CHILDHOOD_FAST_FORWARD") {
    const ageIdx = Math.min(4, Math.floor(p.exact_age_years));
    const handleChildhoodChoice = (group: PersonalityType) => {
      const res = eng.advanceChildhoodYear(group);
      if (res.reachedAgeSix) {
        setStatusLog(
          `Tròn 6 tuổi! Tính cách khóa cứng: [${res.lockedPersonality}]. Đồng hồ thời gian thực đã mở.`
        );
      }
      syncState();
    };

    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.headerBar}>
            <strong>CUỐN SÁCH TUỔI THƠ — {p.full_name}</strong>
            <span>
              {p.exact_age_years} Tuổi • Gia cảnh {p.socioeconomic_origin}
            </span>
          </div>
          <p style={{ fontSize: 16, margin: "20px 0" }}>{CHILDHOOD_PROMPTS[ageIdx]}</p>
          <div style={styles.grid2}>
            <button style={styles.btn} onClick={() => handleChildhoodChoice("INTROVERT")}>
              A. Ngồi yên quan sát một mình (Hướng nội)
            </button>
            <button style={styles.btn} onClick={() => handleChildhoodChoice("EXTROVERT")}>
              B. Chạy tới gọi bố mẹ và bạn bè (Hướng ngoại)
            </button>
            <button style={styles.btn} onClick={() => handleChildhoodChoice("DAREDEVIL")}>
              C. Tò mò tự mình khám phá ngay (Táo bạo)
            </button>
            <button style={styles.btn} onClick={() => handleChildhoodChoice("EMPATHETIC")}>
              D. Ôm lấy chú gấu bông vỗ về (Thấu cảm)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const changeSpeed = (spd: 0 | 1 | 2 | 4) => {
    const st = eng.getState();
    if (st.simulation_mode === "DEMENTIA_AUTOPILOT" && spd === 0) {
      setStatusLog("Nhân vật đang lú lẫn tuổi già (Auto-pilot), không thể tạm dừng!");
      return;
    }
    st.speed_multiplier = spd;
    syncState();
  };

  const moveLocation = (locId: string, subId: string, env: "INDOOR" | "OUTDOOR") => {
    const st = eng.getState();
    st.active_location = { location_id: locId, sub_node_id: subId, environment_exposure: env };
    eng.tickMinutes(15);
    setStatusLog(`Di chuyển tới ${tLabel(locId)} (${env === "INDOOR" ? "Trong nhà" : "Ngoài trời"}).`);
    syncState();
  };

  const handleBuyPharmacy = () => {
    const curPlayer = eng.getState().player;
    const minOrgan = Math.min(...Object.values(curPlayer.organs));
    if (minOrgan >= 45) {
      setStatusLog("Cơ thể đang khỏe mạnh (không có triệu chứng bệnh), dược sĩ khuyên không nên uống thuốc bừa!");
      return;
    }
    const res = eng.consultPharmacistBySymptom();
    if (res.reason) {
      setStatusLog(`Hiệu thuốc: ${res.reason}`);
    } else if (res.curedMildDisease) {
      setStatusLog(`Dược sĩ bốc trúng [${tLabel(res.purchasedMedicineId ?? "")}] -> Đã hồi phục bệnh nhẹ!`);
    } else {
      setStatusLog(`Uống [${tLabel(res.purchasedMedicineId ?? "")}] -> Cắt triệu chứng tạm thời nhưng bốc sai bệnh / hại Gan ngầm!`);
    }
    syncState();
  };

  const handleHospitalExam = () => {
    const res = eng.performHospitalExamination();
    if (!res.success) {
      setStatusLog(`Bệnh viện: ${res.reason}`);
      return;
    }
    const allRxIds = Array.from(new Set(res.diagnosedDiseases.flatMap((d) => d.recommendedRxIds)));
    setMedicalReport({ organs: res.organSnapshot, prescribedRxIds: allRxIds });
    setStatusLog(
      allRxIds.length > 0
        ? `Khám xong (-6h): Phát hiện ${res.diagnosedDiseases.length} bệnh & đã kê ${allRxIds.length} thuốc đặc trị bên dưới!`
        : "Khám xong (-6h): Các chỉ số nội tạng đều bình thường, không cần uống thuốc."
    );
    syncState();
  };

  const handleTakePrescribedMed = (medId: string) => {
    const res = eng.purchaseAndTakePrescribedMedicine(medId);
    if (!res.success) {
      setStatusLog(`Mua thuốc thất bại: ${res.reason}`);
      return;
    }
    setStatusLog(`Đã mua & uống [${tLabel(medId)}]! Tạng tổn thương đang hồi phục.`);
    syncState();
  };

  const medicalReportsInBag = p.inventory.filter(
    (item) => item.item_def_id === "ITEM_MEDICAL_REPORT" && item.medical_report_payload
  );

  function handleManualSave() {
    throw new Error("Function not implemented.");
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.headerBar}>
          <div>
            <strong>{p.full_name}</strong> ({p.exact_age_years} tuổi • {p.biological_sex}) •{" "}
            <span>
              {hud.canSeeDigitalClock
                ? `🕒 ${hud.formattedClockOrSkyKey}`
                : `🌤️ [Mù giờ] ${hud.formattedClockOrSkyKey}`}
            </span>
          </div>
          <div>
            <span>💰 {p.finances.cash_vnd.toLocaleString("vi-VN")} đ</span>
            <span style={{ marginLeft: 12 }}>
              {([0, 1, 2, 4] as const).map((s) => (
                <button
                  key={s}
                  style={{
                    ...styles.speedBtn,
                    fontWeight: gameState.speed_multiplier === s ? "bold" : "normal",
                    background: gameState.speed_multiplier === s ? "#B8382A" : "#E6DEC8",
                    color: gameState.speed_multiplier === s ? "#FFF" : "#1F1B16",
                  }}
                  onClick={() => changeSpeed(s)}
                >
                  {s === 0 ? "⏸" : `${s}×`}
                </button>
              ))}
            </span>
          </div>
        </div>

        <div style={styles.section}>
          <div style={{ marginBottom: 8 }}>
            <strong>Vị trí hiện tại:</strong> {tLabel(gameState.active_location.location_id)} (
            {gameState.active_location.environment_exposure === "INDOOR" ? "Trong nhà" : "Ngoài trời"})
          </div>
          <div style={styles.row}>
            <button style={styles.btn} onClick={() => moveLocation("LOC_HOME", "HOME_LIVING_ROOM", "INDOOR")}>
              🏠 Về Nhà
            </button>
            <button style={styles.btn} onClick={() => moveLocation("LOC_TRANSIT_ROAD", "CITY_STREET", "OUTDOOR")}>
              🛵 Ra Đường (OUTDOOR)
            </button>
            <button style={styles.btn} onClick={() => moveLocation("LOC_PHARMACY", "PHARMACY_COUNTER", "INDOOR")}>
              💊 Tới Hiệu Thuốc Tây
            </button>
            <button style={styles.btn} onClick={() => moveLocation("LOC_HOSPITAL", "HOSPITAL_CLINIC", "INDOOR")}>
              🏥 Tới Bệnh Viện
            </button>
          </div>

          <div style={{ ...styles.row, marginTop: 10 }}>
            <button
              style={styles.btn}
              onClick={() => {
                eng.getState().player.capability_flags.has_wristwatch = true;
                setStatusLog("Đã đeo đồng hồ: Mở khóa hiển thị giờ số trên Top-Bar.");
                syncState();
              }}
            >
              ⌚ Đeo Đồng Hồ (Test mở giờ)
            </button>
            <button
              style={styles.btn}
              onClick={() => {
                eng.getState().player.organs.liver = 35;
                setStatusLog("Test: Đã làm Gan suy yếu xuống mức Cam (ẩn trên HUD).");
                syncState();
              }}
            >
              🧪 Ép Gan Yếu (Test Bệnh Ẩn)
            </button>
            <button style={styles.btn} onClick={handleBuyPharmacy}>
              💊 Kể Triệu Chứng Mua Thuốc Tây
            </button>
            <button style={styles.btn} onClick={handleHospitalExam}>
              🩺 Khám Xét Nghiệm Bệnh Viện
            </button>
          </div>
        </div>

        {gameState.active_popup_event && activeEventDef && (
          <div style={styles.eventBox}>
            <strong>⚡ SỰ KIỆN BẤT NGỜ: {activeEventDef.presentation.title_key}</strong>
            <p>{activeEventDef.presentation.narrative_body_key}</p>
            <div style={styles.row}>
              {activeEventDef.choices.map((ch) => (
                <button
                  key={ch.choice_id}
                  style={styles.primaryBtn}
                  onClick={() => {
                    const st = eng.getState();
                    if (ch.outcomes.happiness_delta) {
                      st.player.happiness_score = Math.max(
                        0,
                        Math.min(100, st.player.happiness_score + ch.outcomes.happiness_delta)
                      );
                    }
                    eng.applyOrganDeltas(ch.outcomes.organ_deltas);
                    st.active_popup_event = null;
                    st.simulation_mode = "REALTIME_ACTIVE";
                    st.speed_multiplier = 1;
                    if (ch.outcomes.time_elapsed_minutes) {
                      eng.tickMinutes(ch.outcomes.time_elapsed_minutes);
                    }
                    setStatusLog(`Đã xử lý sự kiện: ${ch.label_key}`);
                    syncState();
                  }}
                >
                  {ch.label_key}
                </button>
              ))}
            </div>
          </div>
        )}

        {medicalReport && (
          <div style={styles.reportBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>📋 PHIẾU KẾT QUẢ KHÁM BỆNH (ĐANG MỞ XEM)</strong>
              <button style={styles.speedBtn} onClick={() => setMedicalReport(null)}>
                Đóng tờ phiếu
              </button>
            </div>
            <div style={styles.grid2}>
              {Object.entries(medicalReport.organs).map(([organ, val]) => (
                <div key={organ}>
                  • {organ.toUpperCase()}: <strong>{val}%</strong>
                </div>
              ))}
            </div>
            {medicalReport.prescribedRxIds.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed #2F855A" }}>
                <div style={{ marginBottom: 6 }}>
                  <strong>Đơn thuốc Bác sĩ kê sẵn (Bấm để mua & uống điều trị):</strong>
                </div>
                <div style={styles.row}>
                  {medicalReport.prescribedRxIds.map((rxId) => (
                    <button
                      key={rxId}
                      style={styles.primaryBtn}
                      onClick={() => handleTakePrescribedMed(rxId)}
                    >
                      💊 Mua & Uống: {tLabel(rxId)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={styles.section}>
          <strong>🎒 Túi Đồ & Hồ Sơ Y Tế Đã Lưu ({medicalReportsInBag.length} bệnh án):</strong>
          {medicalReportsInBag.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6B6156", marginTop: 4 }}>
              Chưa có tờ kết quả khám bệnh nào trong túi.
            </div>
          ) : (
            <div style={{ ...styles.row, marginTop: 8 }}>
              {medicalReportsInBag.map((rep, idx) => (
                <button
                  key={rep.instance_id}
                  style={styles.btn}
                  onClick={() =>
                    setMedicalReport({
                      organs: rep.medical_report_payload!.organ_snapshot,
                      prescribedRxIds: rep.medical_report_payload!.prescribed_rx_ids,
                    })
                  }
                >
                  📄 Bệnh án #{medicalReportsInBag.length - idx} ({rep.medical_report_payload!.exam_date_str} -{" "}
                  {rep.medical_report_payload!.exam_age}t)
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={styles.sensoryFooter}>
          <div>
            Sức khỏe:{" "}
            <span style={{ ...styles.pill, background: COLOR_BADGE_MAP[hud.healthColor].bg }}>
              {COLOR_BADGE_MAP[hud.healthColor].label}
            </span>
          </div>
          <div>
            Hạnh phúc:{" "}
            <span style={{ ...styles.pill, background: COLOR_BADGE_MAP[hud.happinessColor].bg }}>
              {COLOR_BADGE_MAP[hud.happinessColor].label}
            </span>
          </div>
          <div>
            Cảm nhận cơ thể: <em>"{hud.symptomMonologueKey}"</em>
          </div>
        </div>

        <div style={{ ...styles.row, marginTop: 12, justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#5C5346" }}>{statusLog}</span>
          <div>
            <button style={styles.btn} onClick={() => void handleManualSave()}>
              💾 Lưu Cuộc Đời
            </button>
            <button
              style={{ ...styles.btn, marginLeft: 8 }}
              onClick={() => {
                engineRef.current = null;
                setGameState(null);
              }}
            >
              Thoát Ra Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#F2ECE0",
    color: "#1F1B16",
    fontFamily: "'Noto Serif', Georgia, serif",
    padding: 24,
  },
  card: {
    maxWidth: 860,
    margin: "0 auto",
    background: "#FAF6EE",
    border: "1px solid #C8BFA8",
    borderRadius: 8,
    padding: 20,
    boxShadow: "0 4px 16px rgba(31, 27, 22, 0.08)",
  },
  title: { margin: 0, fontSize: 22, color: "#B8382A" },
  sub: { margin: "4px 0 16px", fontSize: 13, color: "#6B6156" },
  headerBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottom: "1px solid #D8CFC0",
    marginBottom: 14,
  },
  section: {
    padding: "12px 0",
    borderBottom: "1px dashed #D8CFC0",
  },
  row: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 },
  input: {
    padding: "6px 10px",
    border: "1px solid #B8AE9C",
    borderRadius: 4,
    background: "#FFFDF9",
    fontFamily: "inherit",
  },
  btn: {
    padding: "6px 12px",
    border: "1px solid #A89E8C",
    borderRadius: 4,
    background: "#EFE8D8",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  primaryBtn: {
    padding: "6px 14px",
    border: "none",
    borderRadius: 4,
    background: "#B8382A",
    color: "#FFF",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  speedBtn: {
    padding: "3px 8px",
    marginLeft: 4,
    border: "1px solid #B8AE9C",
    borderRadius: 4,
    cursor: "pointer",
  },
  saveItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    background: "#F2ECE0",
    borderRadius: 4,
    marginBottom: 6,
  },
  eventBox: {
    marginTop: 12,
    padding: 12,
    background: "#FFF5F5",
    border: "1px solid #B8382A",
    borderRadius: 6,
  },
  reportBox: {
    marginTop: 12,
    padding: 12,
    background: "#F0F7F4",
    border: "1px solid #2F855A",
    borderRadius: 6,
  },
  sensoryFooter: {
    marginTop: 14,
    padding: 12,
    background: "#EFE8D8",
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  pill: {
    color: "#FFF",
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 12,
  },
  logBox: {
    marginTop: 14,
    padding: 8,
    background: "#EFE8D8",
    fontSize: 13,
    borderRadius: 4,
  },
};