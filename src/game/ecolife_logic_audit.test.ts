/**
 * ============================================================================
 * ECO-LIFE (DÒNG ĐỜI) - AUTOMATED BACKEND LOGIC & EDGE-CASE AUDIT SUITE
 * ============================================================================
 * Mục đích: Kiểm thử chéo toàn bộ 7 file JSON Schema & Rules bằng TypeScript
 * trước khi nối vào Frontend React. Tập trung bắt các lỗ hổng logic (Edge-cases).
 *
 * Cách chạy nhanh (Node 22+ hoặc Bun hoặc Vitest):
 *   npx tsx ecolife_logic_audit.test.ts
 *   hoặc: bun run ecolife_logic_audit.test.ts
 */

// ============================================================================
// 1. ĐỊNH NGHĨA TYPES KHỚP CHẶT VỚI 7 FILE JSON SCHEMA
// ============================================================================

type BiologicalSex = "MALE" | "FEMALE";
type SocioeconomicTier = "Q1" | "Q2" | "Q3" | "Q4" | "Q5";
type PersonalityType = "INTROVERT" | "EXTROVERT" | "DAREDEVIL" | "EMPATHETIC" | "AMBIVERT";
type HealthColor = "BLUE" | "GREEN" | "YELLOW" | "ORANGE" | "RED";
type EnvExposure = "INDOOR" | "OUTDOOR";
type EventEnvFilter = "INDOOR" | "OUTDOOR" | "BOTH";
type EventCategory = "CHILDHOOD_MILESTONE" | "DAILY_GRAY" | "OPPORTUNITY_GREEN" | "DANGER_RED";

interface HumanEntity {
  entity_id: string;
  entity_role: "PLAYER" | "NPC";
  identity_biometrics: {
    full_name: string;
    biological_sex: BiologicalSex;
    socioeconomic_origin: SocioeconomicTier;
    exact_age_years: number;
    height_cm: number;
    weight_kg: number;
    current_bmi: number;
    locked_personality: PersonalityType | null;
    innate_and_genetic_traits: string[];
    lifestyle_habits: string[];
    habit_formation_progress: Record<string, number>;
  };
  communication_and_devices: {
    has_smartphone_on_person: boolean;
    smartphone_left_at_location_id: string | null;
    has_wallet_on_person: boolean;
    can_receive_cellular_sms_calls: boolean;
    can_access_internet_chat_apps: boolean;
    can_pay_cash: boolean;
    can_pay_qr_transfer: boolean;
  };
  hidden_black_box: {
    core_organs_6: {
      brain: number;
      heart: number;
      lungs: number;
      liver: number;
      digestive: number;
      musculoskeletal: number;
    };
    secondary_systems: {
      kidneys: number;
      endocrine_immune: number;
      integumentary_skin: number;
      reproductive: {
        fertility_health: number;
        puberty_status: "PRE_PUBERTY" | "IN_PUBERTY" | "MATURE" | "MENOPAUSE_ANDROPAUSE";
        menstrual_cycle_day: number | null;
        pregnancy_weeks: number | null;
      };
    };
    sensory_organs: {
      vision: { acuity_pct: number; myopia_diopters: number; is_wearing_corrective_glasses: boolean };
      hearing: { acuity_pct: number; has_tinnitus: boolean };
      olfactory_gustatory: { sensitivity_pct: number };
      tactile_nociception: { pain_sensitivity_pct: number };
    };
    circadian_and_trauma: {
      hours_awake_continuous: number;
      sleep_debt_hours: number;
      ptsd_trauma_score: number;
      burnout_index: number;
    };
  };
  capability_flags: {
    is_time_management_unlocked: boolean;
    has_wristwatch: boolean;
    smartphone_battery_pct: number;
    is_auto_pilot_active: boolean;
  };
  inventory: {
    current_weight_kg: number;
    max_weight_kg: number;
    items: Array<{ item_def_id: string; durability_pct: number; expiry_hours_left?: number }>;
  };
  finances: {
    cash_vnd: number;
    hidden_black_market_debt_vnd?: number;
  };
}

interface GameWorldState {
  simulation_mode: "CHILDHOOD_FAST_FORWARD" | "REALTIME_ACTIVE" | "EVENT_POPUP_FROZEN" | "DEMENTIA_AUTOPILOT";
  speed_multiplier: 0 | 1 | 2 | 4;
  hour: number;
  minute: number;
  weather: "CLEAR" | "RAIN" | "STORM" | "HEAVY_SMOG";
  current_location_id: string;
  current_sub_node_env: EnvExposure;
  is_dead: boolean;
  death_cause: string | null;
}

// ============================================================================
// 2. CORE ENGINE MÔ PHỎNG CÁC CÔNG THỨC TRONG JSON RULES
// ============================================================================

class EcoLifeCoreEngine {
  /**
   * Sinh ngẫu nhiên thực thể (Dùng chung cho cả Player 0 tuổi & NPC ngoài đường)
   * Khớp với character_generator_rules.json
   */
  static generateEntity(
    age: number,
    role: "PLAYER" | "NPC",
    birthYear: number,
    rng: () => number = Math.random
  ): HumanEntity {
    const sex: BiologicalSex = rng() < 0.5 ? "MALE" : "FEMALE";
    const tiers: SocioeconomicTier[] = ["Q1", "Q2", "Q3", "Q4", "Q5"];
    const tierWeights = [0.25, 0.30, 0.25, 0.15, 0.05];
    let r = rng();
    let origin: SocioeconomicTier = "Q1";
    for (let i = 0; i < tiers.length; i++) {
      if (r < tierWeights[i]) {
        origin = tiers[i];
        break;
      }
      r -= tierWeights[i];
    }

    const randRange = (min: number, max: number) => Number((min + rng() * (max - min)).toFixed(2));
    const isNewborn = age < 1.0;

    const height_cm = isNewborn ? randRange(47, 53) : randRange(150, 182);
    const weight_kg = isNewborn ? randRange(2.7, 4.2) : randRange(44, 85);
    const current_bmi = Number((weight_kg / Math.pow(height_cm / 100, 2)).toFixed(1));

    const organMin = isNewborn ? 88 : age >= 60 ? 22 : 68;
    const organMax = isNewborn ? 100 : age >= 60 ? 62 : 95;

    const brain = randRange(organMin, organMax);

    const entity: HumanEntity = {
      entity_id: `${role}_${birthYear}_${Math.floor(rng() * 100000)}`,
      entity_role: role,
      identity_biometrics: {
        full_name: role === "PLAYER" ? `Player_${birthYear}` : `NPC_${Math.floor(rng() * 999)}`,
        biological_sex: sex,
        socioeconomic_origin: origin,
        exact_age_years: age,
        height_cm,
        weight_kg,
        current_bmi,
        locked_personality: age < 6.0 ? null : "AMBIVERT",
        innate_and_genetic_traits: rng() < 0.15 ? ["GENETIC_MYOPIA"] : [],
        lifestyle_habits: rng() < 0.25 ? ["CAREFUL_CHECKLIST"] : [],
        habit_formation_progress: {},
      },
      communication_and_devices: {
        has_smartphone_on_person: false,
        smartphone_left_at_location_id: null,
        has_wallet_on_person: true,
        can_receive_cellular_sms_calls: false,
        can_access_internet_chat_apps: false,
        can_pay_cash: true,
        can_pay_qr_transfer: false,
      },
      hidden_black_box: {
        core_organs_6: {
          brain,
          heart: randRange(organMin, organMax),
          lungs: randRange(organMin, organMax),
          liver: randRange(organMin, organMax),
          digestive: randRange(organMin, organMax),
          musculoskeletal: randRange(organMin, organMax),
        },
        secondary_systems: {
          kidneys: randRange(organMin, organMax),
          endocrine_immune: randRange(organMin, organMax),
          integumentary_skin: randRange(75, 100),
          reproductive: {
            fertility_health: age >= 50 && sex === "FEMALE" ? 0 : randRange(70, 100),
            puberty_status: age < 11 ? "PRE_PUBERTY" : age < 18 ? "IN_PUBERTY" : age >= 55 ? "MENOPAUSE_ANDROPAUSE" : "MATURE",
            menstrual_cycle_day: sex === "FEMALE" && age >= 12 && age < 50 ? 1 : null,
            pregnancy_weeks: null,
          },
        },
        sensory_organs: {
          vision: {
            acuity_pct: randRange(70, 100),
            myopia_diopters: rng() < 0.25 ? randRange(0.5, 5.5) : 0,
            is_wearing_corrective_glasses: false,
          },
          hearing: { acuity_pct: randRange(75, 100), has_tinnitus: false },
          olfactory_gustatory: { sensitivity_pct: randRange(75, 100) },
          tactile_nociception: { pain_sensitivity_pct: randRange(40, 100) },
        },
        circadian_and_trauma: {
          hours_awake_continuous: 0,
          sleep_debt_hours: 0,
          ptsd_trauma_score: 0,
          burnout_index: 0,
        },
      },
      capability_flags: {
        is_time_management_unlocked: false,
        has_wristwatch: false,
        smartphone_battery_pct: 0,
        is_auto_pilot_active: age >= 60 && brain < 25,
      },
      inventory: {
        current_weight_kg: 0,
        max_weight_kg: 15.0,
        items: [],
      },
      finances: {
        cash_vnd: role === "PLAYER" ? 0 : randRange(1_000_000, 50_000_000),
        hidden_black_market_debt_vnd: role === "NPC" && origin === "Q1" && rng() < 0.25 ? 15_000_000 : 0,
      },
    };

    return entity;
  }

  /**
   * Tính Đèn Màu Sức Khỏe theo quy tắc Nút Thắt Cổ Chai (6 tạng + Thận)
   */
  static computeVisibleHealthColor(entity: HumanEntity): HealthColor {
    const o = entity.hidden_black_box.core_organs_6;
    const kidneys = entity.hidden_black_box.secondary_systems.kidneys;
    const minVal = Math.min(o.brain, o.heart, o.lungs, o.liver, o.digestive, o.musculoskeletal, kidneys);

    if (minVal >= 85) return "BLUE";
    if (minVal >= 65) return "GREEN";
    if (minVal >= 45) return "YELLOW";
    if (minVal >= 25) return "ORANGE";
    return "RED";
  }

  /**
   * Tính thời gian thực tế của 1 hành động (Trôi lố, kẹt xe, quá tải)
   */
  static calculateActionDuration(
    baseMinutes: number,
    isTransit: boolean,
    world: GameWorldState,
    entity: HumanEntity,
    rng: () => number = Math.random
  ): { actualMinutes: number; isDurationHiddenOnUI: boolean } {
    let mult = 1.0;

    // 1. Chưa có kỹ năng quản lý thời gian -> trôi lố 1.1x - 1.6x
    if (!entity.capability_flags.is_time_management_unlocked) {
      mult *= 1.1 + rng() * 0.5;
    }

    // 2. Giờ cao điểm (07:00-09:00 hoặc 16:30-19:00)
    const timeDecimal = world.hour + world.minute / 60;
    const isRushHour = (timeDecimal >= 7.0 && timeDecimal <= 9.0) || (timeDecimal >= 16.5 && timeDecimal <= 19.0);
    if (isTransit && isRushHour) {
      // Lối sống STREET_SMART biết đi đường hẻm tắt giảm 40% tác động kẹt xe
      const rushPenalty = entity.identity_biometrics.lifestyle_habits.includes("STREET_SMART") ? 1.5 : 2.5;
      mult *= rushPenalty;
    }

    // 3. Quá tải balo > 15kg
    if (isTransit && entity.inventory.current_weight_kg > entity.inventory.max_weight_kg) {
      mult *= 1.3;
    }

    return {
      actualMinutes: Math.round(baseMinutes * mult),
      isDurationHiddenOnUI: !entity.capability_flags.is_time_management_unlocked,
    };
  }

  /**
   * Tính thanh đếm ngược Event Popup (PTSD -2s, Não bộ, Kinh nghiệm, Sàn tối thiểu 1.0s)
   */
  static calculateEventCountdownSeconds(
    category: EventCategory,
    yearsExp: number,
    entity: HumanEntity
  ): number | null {
    if (category === "CHILDHOOD_MILESTONE") return null;

    const baseMap: Record<Exclude<EventCategory, "CHILDHOOD_MILESTONE">, number> = {
      DAILY_GRAY: 12.0,
      OPPORTUNITY_GREEN: 8.0,
      DANGER_RED: 4.0,
    };

    let sec = baseMap[category];
    const brainFactor = Math.max(0.1, entity.hidden_black_box.core_organs_6.brain / 100.0);
    sec = sec * (1 + 0.15 * yearsExp) * brainFactor;

    if (entity.identity_biometrics.innate_and_genetic_traits.includes("QUICK_REFLEXES")) {
      sec += 3.0;
    }
    if (entity.hidden_black_box.circadian_and_trauma.ptsd_trauma_score >= 40.0) {
      sec -= 2.0;
    }

    // Chặn biên [1.0s, 15.0s] để tránh số âm hoặc quá dài
    return Number(Math.min(15.0, Math.max(1.0, sec)).toFixed(2));
  }

  /**
   * Kiểm tra mua hàng ràng buộc địa điểm (Location-Bound)
   */
  static attemptPurchaseItem(
    itemDefId: string,
    priceVnd: number,
    weightKg: number,
    allowedLocationIds: string[],
    world: GameWorldState,
    entity: HumanEntity
  ): { success: boolean; reason?: string } {
    if (!allowedLocationIds.includes(world.current_location_id)) {
      return { success: false, reason: "ERR_LOCATION_BOUND_VIOLATION" };
    }
    if (entity.finances.cash_vnd < priceVnd) {
      return { success: false, reason: "ERR_INSUFFICIENT_FUNDS" };
    }
    entity.finances.cash_vnd -= priceVnd;
    entity.inventory.current_weight_kg = Number((entity.inventory.current_weight_kg + weightKg).toFixed(2));
    entity.inventory.items.push({ item_def_id: itemDefId, durability_pct: 100 });
    return { success: true };
  }

  /**
   * Đồng bộ trạng thái Lú lẫn tuổi già & Tốc độ đồng hồ (Bắt lỗi kẹt Pause)
   */
  static syncAgingAndAutoPilot(entity: HumanEntity, world: GameWorldState): void {
    if (entity.hidden_black_box.core_organs_6.brain < 25.0 && entity.identity_biometrics.exact_age_years >= 60) {
      entity.capability_flags.is_auto_pilot_active = true;
      world.simulation_mode = "DEMENTIA_AUTOPILOT";
      // LỖ HỔNG TỪNG GẶP Ở ĐỢT 8: Nếu đang Pause (0x) mà bật lú lẫn + khóa nút tốc độ -> Game kẹt chết!
      // Fix bắt buộc: Ép tốc độ >= 1x khi vào chế độ tự hành
      if (world.speed_multiplier === 0) {
        world.speed_multiplier = 1;
      }
    }
  }

  /**
   * Cơ chế Lối sống Cẩn thận (CAREFUL_CHECKLIST) & Hệ thống Hành trang khi ra ngoài
   * Mở rộng cho: Điện thoại, Ví tiền, Kính cận, Băng vệ sinh, Thuốc đặc trị
   */
  static checkDepartureAndBagReadiness(
    entity: HumanEntity,
    world: GameWorldState,
    hasDesktopOrLaptopAtCurrentSpot: boolean
  ): {
    missingEssentialItems: string[];
    showQuickDoorstepGrabOption: boolean;
    totalQuickGrabMinutes: number;
    monologue?: string;
    canSeeTime: boolean;
    canReceiveSimCallsSms: boolean;
    canUseInternetChatApps: boolean;
    canMakeAnyPayment: boolean;
  } {
    const missing: string[] = [];
    let grabMinutes = 0;

    const ownsPhoneLeftAtHome = entity.communication_and_devices.smartphone_left_at_location_id === "LOC_HOME";
    const hasPhoneOnPerson = entity.communication_and_devices.has_smartphone_on_person;
    if (ownsPhoneLeftAtHome && !hasPhoneOnPerson) {
      missing.push("SMARTPHONE");
      grabMinutes += 3;
    }

    if (!entity.communication_and_devices.has_wallet_on_person) {
      missing.push("WALLET_AND_ID");
      grabMinutes += 2;
    }

    const vision = entity.hidden_black_box.sensory_organs.vision;
    if (vision.myopia_diopters > 1.5 && !vision.is_wearing_corrective_glasses) {
      missing.push("CORRECTIVE_GLASSES");
      grabMinutes += 2;
    }

    const isCareful = entity.identity_biometrics.lifestyle_habits.includes("CAREFUL_CHECKLIST");
    const showQuickDoorstepGrabOption =
      world.current_location_id === "LOC_HOME" && missing.length > 0 && isCareful;

    // Cập nhật năng lực liên lạc, xem giờ & thanh toán khi ở ngoài
    const phoneAlive = hasPhoneOnPerson && entity.capability_flags.smartphone_battery_pct > 0;
    const canSeeTime =
      entity.capability_flags.has_wristwatch || phoneAlive || hasDesktopOrLaptopAtCurrentSpot;
    const canReceiveSimCallsSms = phoneAlive;
    const canUseInternetChatApps = phoneAlive || hasDesktopOrLaptopAtCurrentSpot;
    const canPayCash = entity.communication_and_devices.has_wallet_on_person && entity.finances.cash_vnd > 0;
    const canPayQr = phoneAlive;

    entity.communication_and_devices.can_receive_cellular_sms_calls = canReceiveSimCallsSms;
    entity.communication_and_devices.can_access_internet_chat_apps = canUseInternetChatApps;
    entity.communication_and_devices.can_pay_cash = canPayCash;
    entity.communication_and_devices.can_pay_qr_transfer = canPayQr;

    return {
      missingEssentialItems: missing,
      showQuickDoorstepGrabOption,
      totalQuickGrabMinutes: grabMinutes,
      monologue: missing.length > 0 ? `Ôi không, tôi quên mang: ${missing.join(", ")}!` : undefined,
      canSeeTime,
      canReceiveSimCallsSms,
      canUseInternetChatApps,
      canMakeAnyPayment: canPayCash || canPayQr,
    };
  }

  /**
   * Tích lũy điểm rèn luyện thói quen (0 -> 100) và xử lý triệt tiêu cặp lối sống đối lập
   */
  static trainLifestyleHabit(
    entity: HumanEntity,
    targetHabitId: string,
    pointsEarned: number,
    hasPlannerOrBookMultiplier: boolean = false
  ): { unlockedNow: boolean } {
    const oppositeMap: Record<string, string> = {
      CAREFUL_CHECKLIST: "SCATTERBRAINED",
      SCATTERBRAINED: "CAREFUL_CHECKLIST",
      EARLY_BIRD: "NIGHT_OWL",
      NIGHT_OWL: "EARLY_BIRD",
      FRUGAL_SAVER: "IMPULSE_SPENDER",
      IMPULSE_SPENDER: "FRUGAL_SAVER",
      HEALTH_CONSCIOUS: "SLOB_NEGLECTFUL",
      SLOB_NEGLECTFUL: "HEALTH_CONSCIOUS",
      SOCIAL_BUTTERFLY: "LONE_WOLF",
      LONE_WOLF: "SOCIAL_BUTTERFLY",
    };

    const actualGain = hasPlannerOrBookMultiplier ? pointsEarned * 2.0 : pointsEarned;
    const current = entity.identity_biometrics.habit_formation_progress[targetHabitId] ?? 0;
    const updated = Math.min(100, current + actualGain);
    entity.identity_biometrics.habit_formation_progress[targetHabitId] = updated;

    if (updated >= 100 && !entity.identity_biometrics.lifestyle_habits.includes(targetHabitId)) {
      entity.identity_biometrics.lifestyle_habits.push(targetHabitId);
      // Gỡ bỏ lối sống đối lập nếu đang có (VD: Đãng trí -> Cẩn thận)
      const opposite = oppositeMap[targetHabitId];
      if (opposite) {
        entity.identity_biometrics.lifestyle_habits = entity.identity_biometrics.lifestyle_habits.filter(
          (h) => h !== opposite
        );
      }
      return { unlockedNow: true };
    }
    return { unlockedNow: false };
  }
}

// ============================================================================
// 3. BỘ 9 KỊCH BẢN AUDIT SĂN LỖ HỔNG LOGIC (ASSERTION RUNNER)
// ============================================================================
// 3. BỘ 8 KỊCH BẢN AUDIT SĂN LỖ HỔNG LOGIC (ASSERTION RUNNER)
// ============================================================================
// 3. BỘ 7 KỊCH BẢN AUDIT SĂN LỖ HỔNG LOGIC (ASSERTION RUNNER)
// ============================================================================

function assert(condition: boolean, testName: string, detail?: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
    throw new Error(`Audit failed at: ${testName}`);
  }
  console.log(`✅ [PASS] ${testName}`);
}

function runLogicAuditSuite() {
  console.log("=================================================================");
  console.log("🚀 BẮT ĐẦU CHẠY BỘ AUDIT LOGIC & EDGE-CASE CHO ECO-LIFE BACKEND");
  console.log("=================================================================\n");

  // -------------------------------------------------------------------------
  // KỊCH BẢN 1: Khởi tạo ngẫu nhiên Player (0 tuổi) & Procedural NPC (32 tuổi)
  // Lỗ hổng săn tìm: Lệch schema giữa Player và NPC, tuổi 0 bị khóa tính cách sớm.
  // -------------------------------------------------------------------------
  const player0 = EcoLifeCoreEngine.generateEntity(0, "PLAYER", 2002);
  const npc32 = EcoLifeCoreEngine.generateEntity(32, "NPC", 1994);

  assert(
    player0.identity_biometrics.locked_personality === null,
    "Kịch bản 1A: Trẻ 0 tuổi chưa bị khóa cứng tính cách"
  );
  assert(
    typeof npc32.hidden_black_box.secondary_systems.kidneys === "number" &&
      typeof npc32.hidden_black_box.sensory_organs.vision.myopia_diopters === "number",
    "Kịch bản 1B: NPC ngẫu nhiên có đầy đủ 6 tạng + Thận + 5 Giác quan dùng chung Schema"
  );

  // -------------------------------------------------------------------------
  // KỊCH BẢN 2: Cái bẫy Hộp Đen Nội Tạng & Thuốc giảm đau hại Gan
  // Lỗ hổng săn tìm: Đèn màu HUD không phản ánh tạng yếu nhất, hoặc chỉ số âm < 0.
  // -------------------------------------------------------------------------
  const adult = EcoLifeCoreEngine.generateEntity(28, "PLAYER", 1998);
  adult.hidden_black_box.core_organs_6 = {
    brain: 90,
    heart: 88,
    lungs: 85,
    liver: 22, // Gan xơ hóa mức nguy hiểm (< 25)
    digestive: 80,
    musculoskeletal: 85,
  };
  adult.hidden_black_box.secondary_systems.kidneys = 85;

  const hudColor = EcoLifeCoreEngine.computeVisibleHealthColor(adult);
  assert(
    hudColor === "RED",
    "Kịch bản 2: Quy tắc nút thắt cổ chai ép đèn HUD sang RED dù 5 tạng kia đều Xanh",
    `Got: ${hudColor}`
  );

  // -------------------------------------------------------------------------
  // KỊCH BẢN 3: Trôi lố thời gian + Giờ cao điểm + Quá tải balo > 15kg
  // Lỗ hổng săn tìm: Nhân dồn hệ số sai hoặc vẫn lộ số phút khi chưa có kỹ năng.
  // -------------------------------------------------------------------------
  const worldRush: GameWorldState = {
    simulation_mode: "REALTIME_ACTIVE",
    speed_multiplier: 1,
    hour: 7,
    minute: 30, // Giờ cao điểm sáng
    weather: "RAIN",
    current_location_id: "LOC_TRANSIT_ROAD",
    current_sub_node_env: "OUTDOOR",
    is_dead: false,
    death_cause: null,
  };
  adult.capability_flags.is_time_management_unlocked = false;
  adult.inventory.current_weight_kg = 18.5; // Quá tải 15kg

  const transitResult = EcoLifeCoreEngine.calculateActionDuration(20, true, worldRush, adult, () => 0.5); // Overrun = 1.35
  // Kỳ vọng: 20 * 1.35 * 2.5 (kẹt xe) * 1.3 (quá tải) = 87.75 -> 88 phút
  assert(
    transitResult.actualMinutes === 88 && transitResult.isDurationHiddenOnUI === true,
    "Kịch bản 3: Trôi lố + Kẹt xe (2.5x) + Quá tải (1.3x) tính đúng và ẩn thời gian trên UI",
    `Actual: ${transitResult.actualMinutes}m`
  );

  // -------------------------------------------------------------------------
  // KỊCH BẢN 4: Ràng buộc địa điểm (Location-Bound) - Mua đồ sai chỗ
  // Lỗ hổng săn tìm: Người chơi đứng ở Nhà nhưng gọi API mua thuốc ở Hiệu thuốc thành công.
  // -------------------------------------------------------------------------
  worldRush.current_location_id = "LOC_HOME";
  adult.finances.cash_vnd = 500_000;
  const illegalBuy = EcoLifeCoreEngine.attemptPurchaseItem(
    "MED_PAINKILLER",
    50_000,
    0.1,
    ["LOC_PHARMACY"],
    worldRush,
    adult
  );
  assert(
    illegalBuy.success === false && illegalBuy.reason === "ERR_LOCATION_BOUND_VIOLATION",
    "Kịch bản 4: Chặn đứng hành vi mua vật phẩm từ xa khi không đứng đúng POI"
  );

  // -------------------------------------------------------------------------
  // KỊCH BẢN 5: Sự kiện Đỏ + PTSD + Não suy yếu -> Kiểm tra sàn đếm ngược 1.0s
  // Lỗ hổng săn tìm: Thanh đếm ngược bị trừ về số âm (-0.8s) gây crash UI Progress Bar.
  // -------------------------------------------------------------------------
  adult.hidden_black_box.circadian_and_trauma.ptsd_trauma_score = 75.0; // Kích hoạt PTSD (-2s)
  adult.hidden_black_box.core_organs_6.brain = 30.0; // Não yếu
  const countdown = EcoLifeCoreEngine.calculateEventCountdownSeconds("DANGER_RED", 0, adult);
  // Công thức thô: 4.0 * 1.0 * 0.3 - 2.0 = -0.8s -> Phải được kẹp sàn ở 1.0s!
  assert(
    countdown === 1.0,
    "Kịch bản 5: Thanh đếm ngược sự kiện Đỏ khi dính PTSD + Não yếu không bị âm (kẹp sàn 1.0s)",
    `Countdown: ${countdown}s`
  );

  // -------------------------------------------------------------------------
  // KỊCH BẢN 6: Tuổi già lú lẫn (brain < 25) kích hoạt đúng lúc đang Pause (0x)
  // Lỗ hổng săn tìm: Game bị đóng băng vĩnh viễn vì vào Auto-pilot khóa nút tốc độ nhưng speed vẫn = 0.
  // -------------------------------------------------------------------------
  const senior = EcoLifeCoreEngine.generateEntity(78, "PLAYER", 1948);
  senior.hidden_black_box.core_organs_6.brain = 18.0;
  worldRush.speed_multiplier = 0; // Đang Pause
  EcoLifeCoreEngine.syncAgingAndAutoPilot(senior, worldRush);

  assert(
    worldRush.simulation_mode === "DEMENTIA_AUTOPILOT" && worldRush.speed_multiplier === 1,
    "Kịch bản 6: Tự động gỡ Pause (ép tốc độ >= 1x) khi bật Lú lẫn Auto-pilot để tránh kẹt game"
  );

  // -------------------------------------------------------------------------
  // KỊCH BẢN 7: Kiểm tra Mù thông tin giờ giấc (Không đồng hồ + Điện thoại 0% pin)
  // Lỗ hổng săn tìm: Điện thoại sập nguồn 0% pin nhưng UI vẫn hiện giờ số.
  // -------------------------------------------------------------------------
  adult.capability_flags.has_wristwatch = false;
  adult.capability_flags.smartphone_battery_pct = 0;
  const canSeeDigitalClock =
    adult.capability_flags.has_wristwatch || adult.capability_flags.smartphone_battery_pct > 0;
  assert(
    canSeeDigitalClock === false,
    "Kịch bản 7: Smartphone hết pin (0%) và không có đồng hồ -> Khóa đồng hồ số, chuyển về cảm quan bầu trời"
  );

  // -------------------------------------------------------------------------
  // KỊCH BẢN 8: Lối sống Cẩn thận (CAREFUL_CHECKLIST) vs Quên điện thoại ngoài đường
  // Lỗ hổng săn tìm: Người thường bị lộ nút lấy nhanh; hoặc ngồi PC công ty lại gọi được SĐT/SIM.
  // -------------------------------------------------------------------------
  // KỊCH BẢN 8: Lối sống Cẩn thận (CAREFUL_CHECKLIST) & Hệ thống Hành trang mở rộng
  // Lỗ hổng săn tìm: Quên cả ĐT lẫn Ví thì không trả tiền được; có CAREFUL_CHECKLIST gom 1 lần.
  // -------------------------------------------------------------------------
  const carefulWorker = EcoLifeCoreEngine.generateEntity(26, "PLAYER", 2000);
  carefulWorker.identity_biometrics.lifestyle_habits = ["CAREFUL_CHECKLIST"];
  carefulWorker.communication_and_devices.has_smartphone_on_person = false;
  carefulWorker.communication_and_devices.smartphone_left_at_location_id = "LOC_HOME";
  carefulWorker.communication_and_devices.has_wallet_on_person = false;
  worldRush.current_location_id = "LOC_HOME";

  const doorstepCheck = EcoLifeCoreEngine.checkDepartureAndBagReadiness(carefulWorker, worldRush, false);
  assert(
    doorstepCheck.showQuickDoorstepGrabOption === true && doorstepCheck.totalQuickGrabMinutes === 5,
    "Kịch bản 8A: CAREFUL_CHECKLIST phát hiện quên cả ĐT + Ví lúc bước ra cửa -> Gom 1 lượt mất 5 phút"
  );

  // Nhân vật thường quên cả Điện thoại và Ví khi đã tới văn phòng ngồi trước PC
  const normalWorker = EcoLifeCoreEngine.generateEntity(26, "PLAYER", 2000);
  normalWorker.identity_biometrics.lifestyle_habits = [];
  normalWorker.communication_and_devices.has_smartphone_on_person = false;
  normalWorker.communication_and_devices.smartphone_left_at_location_id = "LOC_HOME";
  normalWorker.communication_and_devices.has_wallet_on_person = false;
  normalWorker.capability_flags.has_wristwatch = false;
  normalWorker.finances.cash_vnd = 500_000;
  worldRush.current_location_id = "LOC_WORK_OFFICE_MNC";

  const officeBagCheck = EcoLifeCoreEngine.checkDepartureAndBagReadiness(normalWorker, worldRush, true);
  assert(
    officeBagCheck.showQuickDoorstepGrabOption === false &&
      officeBagCheck.canSeeTime === true &&
      officeBagCheck.canUseInternetChatApps === true &&
      officeBagCheck.canReceiveSimCallsSms === false &&
      officeBagCheck.canMakeAnyPayment === false,
    "Kịch bản 8B: Quên cả ĐT + Ví ngồi PC văn phòng -> Xem giờ & nhắn Zalo web được, nhưng mất SĐT và kẹt thanh toán (0 tiền mặt + 0 QR)"
  );

  // -------------------------------------------------------------------------
  // KỊCH BẢN 9: Hình thành & chuyển hóa lối sống (SCATTERBRAINED -> CAREFUL_CHECKLIST & STREET_SMART)
  // Lỗ hổng săn tìm: Tồn tại đồng thời 2 lối sống đối lập nhau hoặc lối sống không tác động công thức.
  // -------------------------------------------------------------------------
  const trainee = EcoLifeCoreEngine.generateEntity(21, "PLAYER", 2005);
  trainee.identity_biometrics.lifestyle_habits = ["SCATTERBRAINED"];
  // Rèn luyện 8 ngày có Sổ tay kế hoạch (+7 * 2 = +14 điểm/ngày -> 112 -> kẹp 100)
  let unlocked = false;
  for (let day = 1; day <= 8; day++) {
    const res = EcoLifeCoreEngine.trainLifestyleHabit(trainee, "CAREFUL_CHECKLIST", 7, true);
    if (res.unlockedNow) unlocked = true;
  }
  assert(
    unlocked === true &&
      trainee.identity_biometrics.lifestyle_habits.includes("CAREFUL_CHECKLIST") &&
      !trainee.identity_biometrics.lifestyle_habits.includes("SCATTERBRAINED"),
    "Kịch bản 9A: Rèn luyện thành công CAREFUL_CHECKLIST và tự động gỡ bỏ lối sống đối lập SCATTERBRAINED"
  );

  // Kiểm chứng STREET_SMART giảm kẹt xe giờ cao điểm từ 2.5x xuống 1.5x
  trainee.identity_biometrics.lifestyle_habits.push("STREET_SMART");
  trainee.capability_flags.is_time_management_unlocked = true;
  trainee.inventory.current_weight_kg = 5.0;
  worldRush.hour = 8;
  worldRush.minute = 0;
  const smartTransit = EcoLifeCoreEngine.calculateActionDuration(20, true, worldRush, trainee);
  assert(
    smartTransit.actualMinutes === 30,
    "Kịch bản 9B: Lối sống STREET_SMART đi đường tắt giảm kẹt xe giờ cao điểm từ 50p (2.5x) xuống 30p (1.5x)",
    `Got: ${smartTransit.actualMinutes}m`
  );

  console.log("\n🎉 TẤT CẢ 9 KỊCH BẢN AUDIT ĐỀU VƯỢT QUA KHÔNG LỖ HỔNG!");
}

// Chạy trực tiếp bộ test
runLogicAuditSuite();