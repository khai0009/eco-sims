/**
 * LIFE SIM HEADLESS ENGINE - CORE TYPES & UI STATE CONTRACTS
 * Thiết kế theo kiến trúc Micro-Data (6 phân hệ) + Cảm hứng từ:
 * - The Sims 4 (Moodlets/Emotion Buffs, Need Autonomy)
 * - Project Zomboid (Moodle Thresholds, Body Protection, Encumbrance, Panic/Tunnel Vision)
 * - RimWorld (Consciousness, Pain, Manipulation, Sight, Moving Capacities -> ảnh hưởng trực tiếp tốc độ hành động)
 */

export type StatLevel = 'KHONG_TOT' | 'ON' | 'TOT' | 'THOAI_MAI' | 'XUAT_SAC';

export type WeatherType = 'clear' | 'heavy_rain' | 'slippery_mud' | 'scorching_heat' | 'high_humidity';
export type TimeOfDayType = 'morning' | 'rush_hour_morning' | 'afternoon' | 'rush_hour_evening' | 'evening' | 'midnight';
export type AreaSafetyTier = 'safe_zone' | 'normal_zone' | 'slum_zone';

// 1. Phân hệ Thể chất & Nội tạng (11 cơ quan chuẩn [0, 100])
export interface OrganStates {
  stomach: number;    // Dạ dày & Tiêu hóa
  intestine: number;  // Ruột & Đại tràng
  lungs: number;      // Phổi & Hô hấp
  cardio: number;     // Tim mạch & Huyết áp
  liver: number;      // Gan & Chuyển hóa
  kidneys: number;    // Thận & Bài tiết
  spine: number;      // Cột sống & Đốt sống cổ
  joints: number;     // Khớp gối & Cổ chân
  hands: number;      // Cổ tay & Ngón tay
  skin: number;       // Da & Mô mềm
  teeth: number;      // Răng & Khoang miệng
}

// 2. Phân hệ Giác quan & Nhận thức ([0, 100])
export interface CognitionStates {
  eyes: number;       // Thị lực & Mắt
  ears: number;       // Thính lực & Tai
  balance: number;    // Tiền đình & Thăng bằng
  focus: number;      // Tập trung & Tỉnh táo
  reflex: number;     // Nhạy bén & Phản xạ
}

// 3. Phân hệ Tâm lý & Hạnh phúc ([0, 100])
export interface MentalStates {
  financialStress: number; // Áp lực tài chính (càng cao càng xấu)
  familyStability: number; // An tâm gia đạo (Shield tinh thần)
  dopamineSpike: number;   // Dopamine sở hữu / trải nghiệm (phân rã theo thời gian)
  loneliness: number;      // Mức độ cô đơn (càng cao càng xấu)
  trauma: number;          // Sang chấn biến cố (càng cao càng xấu)
}

// 4. Phân hệ Kỹ năng & Xạ phản cơ bắp (Số giờ/điểm tích lũy thực tế)
export interface SkillStates {
  drivingExp: number;      // Giờ cầm lái an toàn (+Delta t khi xử lý sự cố giao thông)
  electricalExp: number;   // Giờ thao tác điện & cơ khí
  firstAid: number;        // Điểm sơ cấp cứu
  socialTact: number;      // Khéo léo ứng xử xã hội
}

// 5. Phân hệ Mạng lưới Xã hội (Social Graph & NPC States)
export interface NpcRelation {
  npcId: string;
  name: string;
  role: 'family' | 'friend' | 'mentor' | 'colleague' | 'landlord';
  trust: number;           // [0, 100]
  daysSinceLastContact: number;
}

// 6. Phân hệ Vật dụng, Phương tiện & Ngoại cảnh
export interface VehicleState {
  hasVehicle: boolean;
  brakeCondition: number;  // [0, 100] <30 mất khả năng dừng gấp đường mưa
  tireTread: number;       // [0, 100] <25 nguy cơ trượt bánh x4
  headlight: boolean;      // Hỏng đèn ban đêm -> thị lực chia đôi
}

export interface InventoryItemInstance {
  itemId: string;
  name: string;
  category: 'food' | 'beverage' | 'medicine' | 'ppe_gear' | 'study_work_gear' | 'vehicle_maintenance';
  quantity: number;
  currentDurability: number;
  maxDurability: number;
  weightKg: number;
  equipped: boolean;
}

// Cơ chế RimWorld Capacities (Năng lực tổng hợp từ nội tạng & giác quan)
export interface RimWorldCapacities {
  painPercent: number;          // [0, 100] Tổng hợp từ các cơ quan bị tổn thương
  consciousnessPercent: number; // [0, 100] Quyết định tốc độ tư duy & khả năng thức tỉnh
  manipulationPercent: number;  // [0, 100] Phụ thuộc hands, spine, joints -> tốc độ làm việc
  movingPercent: number;        // [0, 100] Phụ thuộc joints, spine, balance, lungs
  sightEfficiency: number;      // [0, 100] Phụ thuộc eyes + ánh sáng/đèn xe
  hearingEfficiency: number;    // [0, 100] Phụ thuộc ears -> ảnh hưởng trực tiếp độ hiểu bài trên lớp!
}

// Cơ chế Project Zomboid & Sims 4 Moodles (Trạng thái ngắn hạn)
export interface ActiveMoodle {
  moodleId: string;
  title: string;
  type: 'buff' | 'debuff';
  severity: 1 | 2 | 3 | 4; // 1: Nhẹ -> 4: Nguy kịch (Zomboid style)
  iconKey: string;
  description: string;
  remainingGameMinutes: number;
  modifiers: {
    focusDelta?: number;
    learningEfficiencyBonus?: number;
    actionSpeedMultiplier?: number;
    cardioDecayMultiplier?: number;
    spineDecayMultiplier?: number;
    reflexWindowPenaltySeconds?: number;
    dopamineBonus?: number;
  };
}

// Hệ thống Kinh tế & Tài chính cá nhân
export interface EconomyState {
  cashOnHand: number;           // Tiền mặt trong ví
  bankBalance: number;          // Tiền trong tài khoản
  bankLoanDebt: number;         // Nợ ngân hàng / tín dụng
  informalDebt: number;         // Nợ nóng (gây Financial Stress cực mạnh)
  inflationMultiplier: number;  // Hệ số trượt giá thị trường
  pendingBills: Array<{
    billId: string;
    title: string;
    amount: number;
    dueInDays: number;
  }>;
  recentTransactions: Array<{
    timestampGameMinute: number;
    title: string;
    amount: number;
    balanceAfter: number;
  }>;
}

// Hệ thống Thời gian: 24 phút đời thực = 24 giờ trong game (1 giây thực = 1 phút game)
export interface GameClockState {
  day: number;
  hour: number;                 // 0 - 23
  minute: number;               // 0 - 59
  totalElapsedGameMinutes: number;
  totalElapsedRealSeconds: number;
  timeScaleRatio: string;       // "24 phút thực = 24 giờ game (1s thực = 1m game)"
}

// Tiến trình Hành động có Rút ngắn / Kéo dài Thời gian Động (Dynamic Action Compression)
export interface ActiveActionProgress {
  actionId: string;
  title: string;
  category: 'study' | 'work' | 'commute' | 'rest';
  baseDurationGameMinutes: number;
  effectiveDurationGameMinutes: number; // Thời gian thực tế sau khi tính độ hiểu bài / tập trung
  elapsedGameMinutes: number;
  remainingGameMinutes: number;
  remainingRealSeconds: number;         // Số giây đời thực còn lại (vì 1s thực = 1m game)
  comprehensionMultiplier: number;      // > 1.0 là hiểu bài nhanh (rút ngắn thời gian), < 1.0 là trì trệ
  compressionReasonText: string;        // Giải thích định tính hiển thị lên UI
}

// Trạng thái toàn cục của Người chơi & Thế giới trong Backend
export interface GameState {
  age: number;
  fatigue: number;              // [0, 100] Độ mệt mỏi sinh học
  calories: number;             // [0, 3000] Dinh dưỡng (Project Zomboid style)
  hydration: number;            // [0, 100] Độ đủ nước
  bodyTempCelsius: number;      // Nhiệt độ cơ thể (37.0 chuẩn)
  organs: OrganStates;
  cognition: CognitionStates;
  mental: MentalStates;
  skills: SkillStates;
  npcs: NpcRelation[];
  assets: {
    vehicle: VehicleState;
    inventory: InventoryItemInstance[];
    maxCarryWeightKg: number;
  };
  world: {
    weather: WeatherType;
    timeOfDay: TimeOfDayType;
    areaSafetyTier: AreaSafetyTier;
  };
  clock: GameClockState;
  economy: EconomyState;
  activeMoodles: ActiveMoodle[];
  currentAction: ActiveActionProgress | null;
  activeEmergencyEvent: ActiveEventModalPayload | null;
  eventCooldowns: Record<string, number>; // eventId -> ngày mở khóa
}

// Cấu trúc Sự kiện JSON (Universal Event Schema)
export interface EventRiskFactor {
  target: string;
  operator: '<' | '<=' | '>' | '>=' | '==' | '!=' | 'in';
  threshold?: number | string[] | string | boolean | StatLevel;
  is?: string | boolean | number;
  danger: number;
}

export interface EventChoiceDefinition {
  choiceId: string;
  text: string;
  isPanicChoice: boolean;
  checkCriteria?: {
    target: string;
    operator?: '<' | '<=' | '>' | '>=' | '==' | '!=' | 'in';
    threshold?: number | string[];
    requiredTier?: StatLevel;
    passEventId: string;
    failEventId: string;
  };
  effects?: {
    healthDelta?: number;
    healthTierCap?: StatLevel;
    organDamage?: Partial<OrganStates>;
    cognitionDelta?: Partial<CognitionStates>;
    mentalDelta?: Partial<MentalStates>;
    vehicleDamage?: number;
    moneyDelta?: number;
    addMoodleId?: string;
    compressCurrentActionMinutes?: number;
    sensoryLogText: string;
  };
}

export interface GameEventDefinition {
  eventId: string;
  category: string;
  title: string;
  description: string;
  imageAssetKey?: string;
  cooldownMonths: number;
  isEmergency?: boolean;
  timeLimitSeconds: number | null;
  defaultChoiceId?: string;
  requirements: {
    minAge?: number;
    maxAge?: number;
    hasVehicle?: boolean;
    currentAction?: string;
    requiredDegrees?: string[];
  };
  riskFactors?: EventRiskFactor[];
  triggerThreshold?: number;
  choices: EventChoiceDefinition[];
}

export interface ActiveEventModalPayload {
  eventId: string;
  title: string;
  description: string;
  imageAssetKey?: string;
  isEmergency: boolean;
  baseTimeLimitSeconds: number | null;
  effectiveTimeLimitSeconds: number | null; // Đã cộng/trừ phản xạ, kỹ năng lái xe, thị lực!
  reflexBonusBreakdown: string;
  defaultChoiceId?: string;
  choices: Array<{
    choiceId: string;
    text: string;
    isPanicChoice: boolean;
  }>;
}

/**
 * ============================================================================
 * GÓI DỮ LIỆU ĐẦU RA CHO UI (FRONTEND VIEW-MODEL PAYLOAD)
 * Frontend chỉ cần đọc các biến trong object này để render màn hình,
 * hoàn toàn không cần biết công thức vi dữ liệu ngầm bên dưới.
 * ============================================================================
 */
export interface UIHudViewModel {
  // 1. Đồng hồ & Thời gian thực (24 phút = 24 giờ)
  clockUI: {
    formattedTime: string;        // VD: "Ngày 1 - 08:35"
    timeOfDayLabel: string;       // VD: "Giờ cao điểm sáng"
    weatherLabel: string;         // VD: "Mưa lớn đường trơn"
    realTimeConversionNote: string; // "1 giây thực = 1 phút game (24 phút = 1 ngày)"
  };

  // 2. Bậc định tính tổng hợp (Không lộ con số thô)
  qualitativeStatsUI: {
    healthTier: StatLevel;        // KHONG_TOT | ON | TOT | THOAI_MAI | XUAT_SAC
    cognitionTier: StatLevel;     // Độ minh mẫn / Quan sát
    happinessTier: StatLevel;     // Hạnh phúc tổng hợp từ 5 trụ cột
    energyQualitativeLabel: string; // VD: "Tràn đầy sinh lực" / "Rã rời buồn ngủ"
  };

  // 3. Chỉ số Năng lực RimWorld-style (Hiển thị thanh trạng thái định tính)
  capacitiesUI: {
    consciousnessLabel: string;   // Tỉnh táo
    manipulationLabel: string;    // Thao tác tay
    movingLabel: string;          // Vận động
    learningAbsorptionLabel: string; // Khả năng tiếp thu bài giảng hiện tại
    painLevelLabel: string;       // Mức độ đau đớn cơ thể
  };

  // 4. Moodles (Sims 4 + Project Zomboid Buff/Debuff Badges)
  moodlesUI: Array<{
    moodleId: string;
    title: string;
    type: 'buff' | 'debuff';
    severity: 1 | 2 | 3 | 4;
    iconKey: string;
    tooltip: string;
    remainingTimeText: string;
  }>;

  // 5. Thanh tiến trình Hành động & Rút ngắn thời gian học/làm
  activeActionUI: {
    isBusy: boolean;
    title: string;
    progressPercent: number;
    remainingGameTimeText: string; // VD: "Còn 42 phút trong game"
    remainingRealTimeText: string; // VD: "Còn 42 giây ngoài đời thực"
    timeSavedMinutes: number;      // Số phút được rút ngắn nhờ hiểu bài / tập trung
    comprehensionStatusBanner: string; // VD: "Đang hiểu bài sâu: Rút ngắn 42 phút!"
  } | null;

  // 6. Ví tiền, Ngân hàng, Hóa đơn & Cửa hàng (Economy UI Variables)
  economyUI: {
    formattedCash: string;
    formattedBank: string;
    formattedTotalDebt: string;
    financialMoodBanner: string;
    carryWeightText: string;       // VD: "1.2 / 12.0 kg (Nhẹ nhàng)"
    upcomingBills: Array<{
      title: string;
      formattedAmount: string;
      dueText: string;
    }>;
    inventoryList: Array<{
      itemId: string;
      name: string;
      category: string;
      quantity: number;
      durabilityPercent: number;
      equipped: boolean;
    }>;
  };

  // 7. Dòng cảm giác ưu tiên (Sensory Log)
  sensoryLogsUI: string[];

  // 8. Popup Sự kiện Khẩn cấp & Cửa sổ Phản xạ (T + Delta t)
  emergencyModalUI: ActiveEventModalPayload | null;
}