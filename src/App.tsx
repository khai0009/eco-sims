import { useState, useEffect, useRef } from 'react';
import DevOnlyAdminGate from './admin/DevOnlyAdminGate';

// ============================================================================
// 1. ĐỊNH NGHĨA KIỂU DỮ LIỆU THỰC THỂ THỐNG NHẤT (UNIFIED HUMAN ENTITY)
// ============================================================================

type ColorCode = 'BLUE' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type PersonalityCode =
  | 'PERS_INTROVERT'
  | 'PERS_EXTROVERT'
  | 'PERS_DAREDEVIL'
  | 'PERS_EMPATHETIC'
  | 'PERS_AMBIVERT';
type FamilyTierCode = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5';

interface OrganStateMap {
  brain: number;
  heart: number;
  lungs: number;
  liver: number;
  digestive: number;
  musculoskeletal: number;
  kidneys: number;
  integumentary_skin: number;
}

interface HumanEntityState {
  entity_id: string;
  controller_mode: 'PLAYER_CONTROLLED' | 'AI_AUTONOMOUS';
  current_region: 'RURAL' | 'URBAN';
  current_location_id: string;
  current_sub_node_id: string;
  cash_vnd: number;
  happiness_score: number;
  identity_biometrics: {
    full_name: string;
    gender: 'MALE' | 'FEMALE';
    birth_day: number;
    birth_month: number;
    birth_year: number;
    family_tier: FamilyTierCode;
    exact_age_years: number;
    height_cm: number;
    weight_kg: number;
    education_level_vi: string;
    hobby_vi: string | null;
    locked_personality: PersonalityCode;
    innate_traits: string[];
  };
  hidden_black_box: {
    organs: OrganStateMap;
    sleep_debt_hours: number;
    hours_awake_continuous: number;
    hours_since_last_meal: number;
    bladder_urgency_pct: number;
    body_hygiene_pct: number;
    naps_taken_since_full_sleep: number;
    ptsd_trauma_score: number;
  };
  capability_flags: {
    is_clock_visible: boolean;
    is_time_management_unlocked: boolean;
    is_biometrics_decoded: boolean;
    is_personality_decoded: boolean;
    is_dementia_autopilot: boolean;
  };
  yearly_event_tracker: Record<string, number>;
  monthly_event_tracker: Record<string, string>;
}

interface JournalEntry {
  age_years: number;
  text_vi: string;
}

interface NpcLifeEventLog {
  id: string;
  age_years: number;
  time_str: string;
  location_name: string;
  action_summary: string;
  health_color: ColorCode;
  happiness_color: ColorCode;
  monologue: string;
}

// ============================================================================
// 2. BẢNG TRA CỨU CẢM QUAN KHÔNG SỐ & TỪ ĐIỂN TIẾNG VIỆT GIẤY DÓ
// ============================================================================

const COLOR_HEX_MAP: Record<ColorCode, string> = {
  BLUE: '#2980B9',
  GREEN: '#27AE60',
  YELLOW: '#D4AC0D',
  ORANGE: '#D35400',
  RED: '#B8382A'
};

const HEALTH_LABEL_MAP: Record<ColorCode, string> = {
  BLUE: 'Xuất Sắc',
  GREEN: 'Tốt',
  YELLOW: 'Tạm Được',
  ORANGE: 'Không Ổn',
  RED: 'Nguy Kịch'
};

const HAPPINESS_LABEL_MAP: Record<ColorCode, string> = {
  BLUE: 'Viên Mãn',
  GREEN: 'Vui Vẻ',
  YELLOW: 'Bình Lặng',
  ORANGE: 'Uất Ức',
  RED: 'Tuyệt Vọng'
};

const PERSONALITY_LABEL_MAP: Record<PersonalityCode, string> = {
  PERS_INTROVERT: 'Hướng Nội Trầm Lặng',
  PERS_EXTROVERT: 'Hướng Ngoại Xã Giao',
  PERS_DAREDEVIL: 'Táo Bạo Phiêu Lưu',
  PERS_EMPATHETIC: 'Cẩn Trọng Thấu Cảm',
  PERS_AMBIVERT: 'Linh Hoạt Trung Hòa'
};

const LOCATION_LABEL_MAP: Record<string, string> = {
  LOC_HOME: 'Nhà Riêng',
  LOC_SCHOOL_PRIMARY: 'Trường Tiểu Học',
  LOC_SCHOOL_SECONDARY: 'Trường THCS',
  LOC_SCHOOL_HIGHSCHOOL: 'Trường THPT',
  LOC_UNIVERSITY_VOCATIONAL: 'Đại Học & Dạy Nghề',
  LOC_WORK_SME: 'Nơi Làm Việc',
  LOC_HOSPITAL: 'Bệnh Viện Đa Khoa',
  LOC_SUPERMARKET_MARKET: 'Chợ & Siêu Thị',
  LOC_TRANSIT_ROAD: 'Đường Phố'
};

const MEMOIR_CHAPTERS = [
  { index: 1, roman: 'I', title: 'Chương I: Thuở Ấu Thơ & Nếp Nhà', minAge: 0, maxAge: 11 },
  { index: 2, roman: 'II', title: 'Chương II: Tuổi Trẻ & Ngưỡng Cửa Vào Đời', minAge: 12, maxAge: 24 },
  { index: 3, roman: 'III', title: 'Chương III: Bươn Chải & Lập Nghiệp', minAge: 25, maxAge: 44 },
  { index: 4, roman: 'IV', title: 'Chương IV: Chín Chắn & Gia Đình', minAge: 45, maxAge: 59 },
  { index: 5, roman: 'V', title: 'Chương V: Xế Chiều & Dấu Lặng Cuối Đời', minAge: 60, maxAge: 120 }
];

const LAST_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Đặng', 'Bùi'];
const MALE_NAMES = ['Minh An', 'Văn Bình', 'Hoàng Long', 'Đức Huy', 'Quốc Bảo', 'Gia Huy', 'Tuấn Kiệt'];
const FEMALE_NAMES = ['Thị Mai', 'Ngọc Lan', 'Thanh Thảo', 'Minh Thư', 'Phương Anh', 'Khánh Linh', 'Thu Hà'];

// ============================================================================
// 3. CÁC HÀM TOÁN HỌC PHẲNG & CHIẾU CẢM QUAN (KHÔNG LỘ SỐ %)
// ============================================================================

function clamp(val: number, min: number, max: number): number {
  if (val < min) return min;
  if (val > max) return max;
  return Math.round(val * 100) / 100;
}

function scoreToColor(score: number): ColorCode {
  if (score >= 85) return 'BLUE';
  if (score >= 65) return 'GREEN';
  if (score >= 45) return 'YELLOW';
  if (score >= 25) return 'ORANGE';
  return 'RED';
}

function getWeakestOrgan(organs: OrganStateMap): { key: keyof OrganStateMap; val: number } {
  const keys: Array<keyof OrganStateMap> = [
    'brain',
    'heart',
    'lungs',
    'liver',
    'digestive',
    'musculoskeletal',
    'kidneys',
    'integumentary_skin'
  ];
  let minKey: keyof OrganStateMap = 'brain';
  let minVal = organs.brain;
  for (const k of keys) {
    if (organs[k] < minVal) {
      minVal = organs[k];
      minKey = k;
    }
  }
  return { key: minKey, val: minVal };
}

function buildSensoryMonologue(npc: HumanEntityState): string {
  const { key, val } = getWeakestOrgan(npc.hidden_black_box.organs);
  const color = scoreToColor(val);
  const pers = npc.identity_biometrics.locked_personality;
  const box = npc.hidden_black_box;

  if (color === 'BLUE' || color === 'GREEN') {
    if (box.hours_awake_continuous > 30) {
      return 'Cơn buồn ngủ ập tới từng chập, mắt hoa lên vì thức trắng quá lâu — sắp gục rồi!';
    }
    if (box.hours_awake_continuous > 18) {
      return 'Mí mắt nặng trĩu, đầu óc lơ mơ chậm chạp vì thức khuya kéo dài.';
    }
    if (box.bladder_urgency_pct >= 85) {
      return 'Bàng quang căng tức khó chịu, cần tìm nhà vệ sinh ngay.';
    }
    if (box.hours_since_last_meal >= 6) {
      return 'Bụng đói cồn cào, tay chân hơi bủn rủn vì đã quá bữa ăn.';
    }
    if (box.naps_taken_since_full_sleep >= 2) {
      return 'Ngủ chập chờn từng đoạn ngắn mà thiếu giấc ngủ đêm trọn vẹn khiến đầu óc nặng trĩu...';
    }
    if (box.body_hygiene_pct <= 35) {
      return 'Người bết mồ hôi và bụi bẩn, cần được tắm rửa cho tỉnh táo.';
    }
    if (pers === 'PERS_INTROVERT') return 'Cơ thể nhẹ nhõm, nhịp thở đều đặn, đầu óc tĩnh lặng.';
    if (pers === 'PERS_EXTROVERT') return 'Người tràn đầy năng lượng, chỉ muốn ra ngoài gặp gỡ mọi người!';
    if (pers === 'PERS_DAREDEVIL') return 'Sung sức thế này thì cày thêm ca đêm nữa cũng chẳng xi nhê gì.';
    if (pers === 'PERS_EMPATHETIC') return 'Cơ thể khỏe khoắn khiến lòng mình cũng thấy bình yên theo.';
    return 'Sức khỏe ổn định, sẵn sàng cho các kế hoạch trong ngày.';
  }

  if (key === 'digestive' || key === 'liver') {
    return color === 'RED'
      ? 'Cơn đau quặn thắt vùng bụng trên khiến mồ hôi lạnh vã ra, không thể chịu nổi nữa!'
      : 'Vùng bụng trên âm ỉ khó chịu, người mệt mỏi và chán ăn.';
  }
  if (key === 'heart') {
    return color === 'RED'
      ? 'Ngực đau thắt dữ dội, mồ hôi vã như tắm — cực kỳ nguy kịch!'
      : 'Ngực cứ tức nghẹn, nóng rát vùng chấn thủy và hơi khó thở.';
  }
  if (key === 'lungs') {
    return 'Cổ họng ngứa rát, thỉnh thoảng ho khan từng cơn khi hít sâu.';
  }
  if (key === 'brain') {
    return 'Đầu đau nhức từng cơn, mắt hoa lên vì thiếu ngủ và căng thẳng kéo dài.';
  }
  if (key === 'kidneys') {
    return 'Vùng thắt lưng dưới căng tức âm ỉ do nhịn tiểu hoặc uống ít nước.';
  }
  if (key === 'integumentary_skin') {
    return 'Da dẻ bết rít, mẩn ngứa khó chịu vì bụi bẩn và mồ hôi tích tụ.';
  }
  return 'Vùng thắt lưng và các khớp gối nhức mỏi âm ỉ, đi lại chậm chạp.';
}

function createRandomNpcAtAgeSix(birthYear: number): HumanEntityState {
  const now = new Date();
  const birthDay = now.getDate();
  const birthMonth = now.getMonth() + 1;

  const gender: 'MALE' | 'FEMALE' = Math.random() < 0.5 ? 'MALE' : 'FEMALE';
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const firstPool = gender === 'MALE' ? MALE_NAMES : FEMALE_NAMES;
  const firstName = firstPool[Math.floor(Math.random() * firstPool.length)];

  const tiers: FamilyTierCode[] = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const familyTier = tiers[Math.floor(Math.random() * tiers.length)];
  const region: 'RURAL' | 'URBAN' = Math.random() < 0.55 ? 'RURAL' : 'URBAN';

  const personalities: PersonalityCode[] = [
    'PERS_INTROVERT',
    'PERS_EXTROVERT',
    'PERS_DAREDEVIL',
    'PERS_EMPATHETIC',
    'PERS_AMBIVERT'
  ];
  const lockedPersonality = personalities[Math.floor(Math.random() * personalities.length)];

  const startCashMap: Record<FamilyTierCode, number> = {
    Q1: 0,
    Q2: 200000,
    Q3: 1500000,
    Q4: 5000000,
    Q5: 20000000
  };

  return {
    entity_id: `NPC_${Date.now()}`,
    controller_mode: 'AI_AUTONOMOUS',
    current_region: region,
    current_location_id: 'LOC_HOME',
    current_sub_node_id: 'HOME_LIVING_ROOM',
    cash_vnd: startCashMap[familyTier],
    happiness_score: 76,
    identity_biometrics: {
      full_name: `${lastName} ${firstName}`,
      gender,
      birth_day: birthDay,
      birth_month: birthMonth,
      birth_year: birthYear,
      family_tier: familyTier,
      exact_age_years: 6,
      height_cm: 116,
      weight_kg: 21,
      education_level_vi: 'Học sinh Tiểu học',
      hobby_vi: 'Đọc truyện & Khám phá',
      locked_personality: lockedPersonality,
      innate_traits: []
    },
    hidden_black_box: {
      organs: {
        brain: 90,
        heart: 90,
        lungs: 90,
        liver: 90,
        digestive: 90,
        musculoskeletal: 90,
        kidneys: 90,
        integumentary_skin: 90
      },
      sleep_debt_hours: 0,
      hours_awake_continuous: 0,
      hours_since_last_meal: 2,
      bladder_urgency_pct: 20,
      body_hygiene_pct: 85,
      naps_taken_since_full_sleep: 0,
      ptsd_trauma_score: 0
    },
    capability_flags: {
      is_clock_visible: true,
      is_time_management_unlocked: false,
      is_biometrics_decoded: false,
      is_personality_decoded: true,
      is_dementia_autopilot: false
    },
    yearly_event_tracker: {},
    monthly_event_tracker: {}
  };
}

// ============================================================================
// 4. COMPONENT CHÍNH: TRÌNH THEO DÕI CUỘC ĐỜI NPC TỰ HÀNH (GIẤY DÓ)
// ============================================================================

export default function NpcAutonomousObserver() {
  const [selectedBirthYear, setSelectedBirthYear] = useState<number>(2000);
  const [npcEntity, setNpcEntity] = useState<HumanEntityState | null>(null);
  const [calendarDate, setCalendarDate] = useState<{ day: number; month: number; year: number }>({
    day: new Date().getDate(),
    month: new Date().getMonth() + 1,
    year: 2006
  });
  const [currentHour, setCurrentHour] = useState<number>(7);
  const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false);
  const [isDeceased, setIsDeceased] = useState<boolean>(false);
  const [deathCauseVi, setDeathCauseVi] = useState<string>('');
  const [logs, setLogs] = useState<NpcLifeEventLog[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'TIMELINE' | 'MEMOIR'>('TIMELINE');

  const timerRef = useRef<number | null>(null);

  const handleStartNewNpcLife = () => {
    setIsAutoRunning(false);
    setIsDeceased(false);
    setDeathCauseVi('');
    setActiveTab('TIMELINE');

    const freshNpc = createRandomNpcAtAgeSix(selectedBirthYear);
    const startDate = {
      day: freshNpc.identity_biometrics.birth_day,
      month: freshNpc.identity_biometrics.birth_month,
      year: selectedBirthYear + 6
    };

    const dateFormatted = `${String(startDate.day).padStart(2, '0')}/${String(startDate.month).padStart(2, '0')}/${startDate.year}`;
    const bio = freshNpc.identity_biometrics;
    const initSummary = `Chào đời ngày ${String(bio.birth_day).padStart(2, '0')}/${String(bio.birth_month).padStart(2, '0')}/${bio.birth_year} (${bio.gender === 'MALE' ? 'Nam' : 'Nữ'}, Gia cảnh ${bio.family_tier}, ${freshNpc.current_region === 'RURAL' ? 'Nông Thôn' : 'Thành Thị'}). Tròn 6 tuổi bắt đầu vào Lớp 1.`;

    setNpcEntity(freshNpc);
    setCalendarDate(startDate);
    setCurrentHour(7);
    setJournalEntries([{ age_years: 6, text_vi: initSummary }]);
    setLogs([
      {
        id: 'LOG_INIT',
        age_years: 6,
        time_str: `${dateFormatted} - 07:00`,
        location_name: 'Nhà Riêng',
        action_summary: initSummary,
        health_color: 'BLUE',
        happiness_color: 'GREEN',
        monologue: buildSensoryMonologue(freshNpc)
      }
    ]);
  };

  const stepOneHourTick = () => {
    if (!npcEntity || isDeceased) {
      setIsAutoRunning(false);
      return;
    }

    const npc: HumanEntityState = JSON.parse(JSON.stringify(npcEntity));
    const box = npc.hidden_black_box;
    const organs = box.organs;
    const age = Math.floor(npc.identity_biometrics.exact_age_years);
    const personality = npc.identity_biometrics.locked_personality;

    let hoursPassed = 1;
    let actionSummary = '';
    let addedJournal: string | null = null;
    let wentToSleepThisTick = false;

    // Ngưỡng buồn ngủ linh hoạt theo Tính cách (KHÔNG gán cứng 22h hay 23h)
    let sleepThresholdHours = 18;
    if (personality === 'PERS_EMPATHETIC' || personality === 'PERS_INTROVERT') {
      sleepThresholdHours = 16;
    } else if (personality === 'PERS_DAREDEVIL') {
      sleepThresholdHours = 32; // Dễ thức trắng đêm cày cuốc hoặc đi chơi đêm
    } else if (personality === 'PERS_EXTROVERT') {
      sleepThresholdHours = 24;
    }

    // [1. Chế độ lú lẫn tuổi già (Tuổi >= 65 & Não < 25%)]
    if (age >= 65 && organs.brain < 25) {
      npc.capability_flags.is_dementia_autopilot = true;
      npc.current_location_id = 'LOC_HOME';
      hoursPassed = 2;
      box.sleep_debt_hours = clamp(box.sleep_debt_hours - 1.5, 0, 100);
      actionSummary = 'Ngồi thẫn thờ bên hiên nhà nhìn nắng chiều trôi qua trong vô thức...';
    }
    // [2. Sập nguồn cưỡng chế nếu thức trắng chạm 40 tiếng (Module 3.10)]
    else if (box.hours_awake_continuous >= 40) {
      wentToSleepThisTick = true;
      hoursPassed = 6;
      box.hours_awake_continuous = 0;
      box.naps_taken_since_full_sleep = 0;
      box.sleep_debt_hours = clamp(box.sleep_debt_hours - 8, 0, 100);
      organs.brain = clamp(organs.brain - 4, 0, 100);
      npc.happiness_score = clamp(npc.happiness_score - 12, 0, 100);

      if (npc.current_location_id === 'LOC_TRANSIT_ROAD') {
        const stolen = Math.round(npc.cash_vnd * 0.8);
        npc.cash_vnd = Math.max(0, npc.cash_vnd - stolen);
        actionSummary =
          'SẬP NGUỒN CƯỠNG CHẾ (40h thức trắng): Ngất gục ngủ trên vỉa hè suốt 6 tiếng và bị kẻ gian móc sạch ví!';
        addedJournal =
          'Thức trắng 40 tiếng dẫn đến ngất xỉu ngoài đường phố và bị móc túi mất tiền.';
      } else {
        actionSummary =
          'SẬP NGUỒN CƯỠNG CHẾ (40h thức trắng): Cơ thể gục ngã ngủ li bì 6 tiếng ngay tại chỗ.';
        addedJournal = 'Bán mạng thức trắng 40 tiếng đến mức cơ thể sập nguồn ngất lịm.';
      }
    }
    // [3. Cấp cứu nội tạng nguy kịch (< 25%) nếu đủ tiền]
    else if (getWeakestOrgan(organs).val < 25 && npc.cash_vnd >= 800000) {
      npc.current_location_id = 'LOC_HOSPITAL';
      npc.cash_vnd = npc.cash_vnd - 800000;
      hoursPassed = 6;
      npc.capability_flags.is_biometrics_decoded = true;
      const weak = getWeakestOrgan(organs);
      organs[weak.key] = clamp(organs[weak.key] + 22, 0, 100);
      actionSummary = 'Nhập viện khám tổng quát & điều trị kịp thời (-800.000đ, mở khóa số đo cơ thể).';
      addedJournal = 'Phải nhập viện cấp cứu vì sức khỏe suy kiệt nặng, may mắn qua khỏi.';
    }
    // [4. Nhu cầu vệ sinh cấp bách (Đi tiểu bảo vệ Thận / Tắm rửa bảo vệ Da)]
    else if (box.bladder_urgency_pct >= 75) {
      box.bladder_urgency_pct = 0;
      hoursPassed = 1;
      actionSummary = 'Đi vệ sinh giải tỏa căng tức bàng quang.';
    } else if (box.body_hygiene_pct <= 40 && npc.current_location_id === 'LOC_HOME') {
      box.body_hygiene_pct = 100;
      organs.integumentary_skin = clamp(organs.integumentary_skin + 1.5, 0, 100);
      npc.happiness_score = clamp(npc.happiness_score + 2, 0, 100);
      hoursPassed = 1;
      actionSummary = 'Tắm nước ấm sạch sẽ tại nhà, cơ thể sảng khoái dễ chịu.';
    }
    // [5. Đi ngủ giấc dài 7 tiếng khi chạm ngưỡng buồn ngủ cá nhân (Bất kể ngày hay đêm)]
    else if (box.hours_awake_continuous >= sleepThresholdHours || box.sleep_debt_hours >= 14) {
      wentToSleepThisTick = true;
      npc.current_location_id = 'LOC_HOME';
      npc.current_sub_node_id = 'HOME_BEDROOM';
      hoursPassed = 7;
      box.hours_awake_continuous = 0;
      box.naps_taken_since_full_sleep = 0;
      box.sleep_debt_hours = clamp(box.sleep_debt_hours - 14, 0, 100);
      organs.brain = clamp(organs.brain + 8, 0, 100);
      organs.digestive = clamp(organs.digestive + 1, 0, 100);
      actionSummary = `Buồn ngủ rã rời sau nhiều giờ thức, lên giường ngủ một giấc trọn vẹn 7 tiếng.`;
    }
    // [6. Nhu cầu ăn uống khi đói (>= 5 tiếng chưa ăn)]
    else if (box.hours_since_last_meal >= 5) {
      const foodCost = age < 18 ? 0 : npc.current_region === 'RURAL' ? 20000 : 30000;
      if (npc.cash_vnd >= foodCost) {
        npc.cash_vnd = npc.cash_vnd - foodCost;
        box.hours_since_last_meal = 0;
        box.bladder_urgency_pct = clamp(box.bladder_urgency_pct + 18, 0, 100);
        organs.digestive = clamp(organs.digestive + 1.5, 0, 100);
        npc.happiness_score = clamp(npc.happiness_score + 2, 0, 100);
        hoursPassed = 1;
        actionSummary =
          foodCost === 0
            ? 'Ăn bữa cơm nóng gia đình chuẩn bị sẵn.'
            : `Ăn cơm & uống nước bổ sung năng lượng (-${foodCost.toLocaleString('vi-VN')}đ).`;
      } else {
        hoursPassed = 1;
        organs.digestive = clamp(organs.digestive - 2, 0, 100);
        npc.happiness_score = clamp(npc.happiness_score - 3, 0, 100);
        actionSummary = 'Ví cạn tiền, đành nhịn đói uống nước lã cầm hơi...';
      }
    }
    // [7. Khung giờ hành chính 08:00 - 17:00: Đi học (T8-T5) hoặc Đi làm]
    else if (currentHour >= 8 && currentHour < 17) {
      const isSummerBreak = calendarDate.month === 6 || calendarDate.month === 7;
      if (age >= 6 && age <= 17 && !isSummerBreak) {
        const schoolId =
          age <= 10
            ? 'LOC_SCHOOL_PRIMARY'
            : age <= 14
              ? 'LOC_SCHOOL_SECONDARY'
              : 'LOC_SCHOOL_HIGHSCHOOL';
        npc.current_location_id = schoolId;
        hoursPassed = 1;
        actionSummary = `Ngồi học chăm chú tại ${LOCATION_LABEL_MAP[schoolId]}.`;

        if (Math.random() < 0.14) {
          const roll = Math.random();
          if (roll < 0.35) {
            npc.happiness_score = clamp(npc.happiness_score + 4, 0, 100);
            actionSummary += ' | Bạn cùng bàn mượn tập chép bài (+4 Hạnh phúc).';
          } else if (roll < 0.7) {
            npc.happiness_score = clamp(npc.happiness_score - 5, 0, 100);
            actionSummary += ' | Bị gọi lên bảng khảo bài đầu giờ hơi lúng túng.';
          } else if (!npc.capability_flags.is_biometrics_decoded) {
            npc.capability_flags.is_biometrics_decoded = true;
            actionSummary += ' | Y tế trường học đo chiều cao, cân nặng & thị lực định kỳ!';
            addedJournal = 'Được y tế trường học đo chiều cao, cân nặng và thị lực định kỳ.';
          }
        }
      } else if (age >= 18 && age < 60) {
        npc.current_location_id = 'LOC_WORK_SME';
        const dailyShiftPay = npc.current_region === 'RURAL' ? 260000 : 380000;
        npc.cash_vnd = npc.cash_vnd + dailyShiftPay;
        organs.musculoskeletal = clamp(organs.musculoskeletal - 0.8, 0, 100);
        hoursPassed = 4;
        actionSummary = `Hoàn thành ca làm việc tại ${LOCATION_LABEL_MAP.LOC_WORK_SME} (+${dailyShiftPay.toLocaleString('vi-VN')}đ).`;
      } else {
        npc.current_location_id = 'LOC_HOME';
        hoursPassed = 1;
        actionSummary =
          age <= 17
            ? 'Nghỉ hè tháng 6–7 ở nhà phụ giúp gia đình và đọc sách.'
            : 'An dưỡng tuổi hưu tại nhà, đọc báo uống trà.';
      }
    }
    // [8. Thời gian tối/đêm hoặc rảnh rỗi: Tự do thức khuya cày việc / đi chơi đêm nếu chưa buồn ngủ]
    else if (
      (personality === 'PERS_DAREDEVIL' || personality === 'PERS_EXTROVERT') &&
      age >= 18 &&
      age < 60 &&
      (currentHour >= 19 || currentHour <= 3)
    ) {
      if (personality === 'PERS_DAREDEVIL') {
        npc.current_location_id = 'LOC_WORK_SME';
        npc.cash_vnd = npc.cash_vnd + 160000;
        hoursPassed = 2;
        actionSummary = 'Thức xuyên đêm cày thêm việc tự do (+160.000đ).';
      } else {
        npc.current_location_id = 'LOC_TRANSIT_ROAD';
        npc.happiness_score = clamp(npc.happiness_score + 3, 0, 100);
        hoursPassed = 2;
        actionSummary = 'Thức khuya đi dạo phố đêm gặp gỡ bạn bè.';
      }
    } else {
      npc.current_location_id = 'LOC_HOME';
      if (currentHour >= 12 && currentHour <= 14 && box.naps_taken_since_full_sleep === 0) {
        box.naps_taken_since_full_sleep = 1;
        box.sleep_debt_hours = clamp(box.sleep_debt_hours - 1.5, 0, 100);
        organs.brain = clamp(organs.brain + 1.2, 0, 100);
        hoursPassed = 1;
        actionSummary = 'Chợp mắt nghỉ trưa nhẹ nhàng (20p), đầu óc tỉnh táo hơn.';
      } else {
        hoursPassed = 1;
        npc.happiness_score = clamp(npc.happiness_score + 1, 0, 100);
        actionSummary = 'Sinh hoạt tự do, đọc sách tại phòng khách.';
      }
    }

    // Cộng dồn giờ thức liên tục và áp dụng hình phạt sinh học khi thức khuya (Module 3.10)
    if (!wentToSleepThisTick) {
      box.hours_awake_continuous = box.hours_awake_continuous + hoursPassed;
      if (box.hours_awake_continuous > 16) {
        box.sleep_debt_hours = clamp(box.sleep_debt_hours + hoursPassed * 1.0, 0, 100);
        organs.brain = clamp(organs.brain - hoursPassed * 0.6, 0, 100);
        organs.heart = clamp(organs.heart - hoursPassed * 0.4, 0, 100);
        organs.liver = clamp(organs.liver - hoursPassed * 0.4, 0, 100);
      }
      if (box.hours_awake_continuous > 30) {
        organs.brain = clamp(organs.brain - hoursPassed * 1.2, 0, 100);
        organs.heart = clamp(organs.heart - hoursPassed * 0.8, 0, 100);
      }
    }

    box.hours_since_last_meal = box.hours_since_last_meal + hoursPassed;
    box.bladder_urgency_pct = clamp(box.bladder_urgency_pct + 11 * hoursPassed, 0, 100);
    box.body_hygiene_pct = clamp(box.body_hygiene_pct - 3 * hoursPassed, 0, 100);

    if (box.hours_since_last_meal > 10) {
      organs.digestive = clamp(organs.digestive - 1.5 * hoursPassed, 0, 100);
    }
    if (box.bladder_urgency_pct >= 95) {
      organs.kidneys = clamp(organs.kidneys - 1.5 * hoursPassed, 0, 100);
    }

    // Cập nhật đồng hồ Ngày / Tháng / Năm lịch thực tế
    const nextHourRaw = currentHour + hoursPassed;
    const daysAdded = Math.floor(nextHourRaw / 24);
    const nextHour = nextHourRaw % 24;

    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let nextDay = calendarDate.day + daysAdded;
    let nextMonth = calendarDate.month;
    let nextYear = calendarDate.year;
    while (nextDay > daysInMonth[nextMonth - 1]) {
      nextDay = nextDay - daysInMonth[nextMonth - 1];
      nextMonth = nextMonth + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear = nextYear + 1;
      }
    }

    const bio = npc.identity_biometrics;
    const prevAge = Math.floor(bio.exact_age_years);
    const passedBirthday =
      nextMonth > bio.birth_month || (nextMonth === bio.birth_month && nextDay >= bio.birth_day);
    const newAge = Math.max(6, nextYear - bio.birth_year - (passedBirthday ? 0 : 1));
    bio.exact_age_years = newAge;

    if (newAge <= 10) {
      bio.education_level_vi = 'Học sinh Tiểu học';
      bio.height_cm = 115 + (newAge - 6) * 5;
      bio.weight_kg = 20 + (newAge - 6) * 3;
    } else if (newAge <= 14) {
      bio.education_level_vi = 'Học sinh THCS';
      bio.height_cm = 136 + (newAge - 11) * 6;
      bio.weight_kg = 33 + (newAge - 11) * 4;
    } else if (newAge <= 17) {
      bio.education_level_vi = 'Học sinh THPT';
      bio.height_cm = 158 + (newAge - 15) * 3;
      bio.weight_kg = 48 + (newAge - 15) * 3;
    } else if (newAge === 18 && prevAge === 17) {
      bio.education_level_vi = 'Tốt nghiệp THPT (Tự lập)';
      addedJournal = 'Tròn 18 tuổi, bước qua ngưỡng cửa trưởng thành với bao dự định mới.';
    }

    if (newAge > prevAge && newAge >= 60) {
      organs.brain = clamp(organs.brain - 2.0, 0, 100);
      organs.heart = clamp(organs.heart - 2.0, 0, 100);
      organs.lungs = clamp(organs.lungs - 2.0, 0, 100);
      organs.liver = clamp(organs.liver - 2.0, 0, 100);
      organs.digestive = clamp(organs.digestive - 2.0, 0, 100);
      organs.musculoskeletal = clamp(organs.musculoskeletal - 2.0, 0, 100);
      organs.kidneys = clamp(organs.kidneys - 2.0, 0, 100);
      organs.integumentary_skin = clamp(organs.integumentary_skin - 2.0, 0, 100);
    }

    if (
      nextDay === bio.birth_day &&
      nextMonth === bio.birth_month &&
      npc.current_location_id === 'LOC_HOME' &&
      (npc.yearly_event_tracker.BIRTHDAY ?? 5) < newAge
    ) {
      npc.yearly_event_tracker.BIRTHDAY = newAge;
      if (npc.cash_vnd >= 250000) {
        npc.cash_vnd = npc.cash_vnd - 250000;
        npc.happiness_score = clamp(npc.happiness_score + 12, 0, 100);
        actionSummary += ' | Sinh nhật: Mua chiếc bánh kem nhỏ quây quần bên gia đình (-250.000đ).';
        addedJournal = `Đón sinh nhật tuổi ${newAge} ấm áp bên người thân.`;
      } else {
        npc.happiness_score = clamp(npc.happiness_score + 4, 0, 100);
        actionSummary += ' | Sinh nhật: Lặng lẽ đón tuổi mới trong bình yên.';
      }
    } else if (
      (nextMonth === 1 || nextMonth === 2) &&
      (npc.yearly_event_tracker.TET ?? 5) < newAge
    ) {
      npc.yearly_event_tracker.TET = newAge;
      if (newAge < 18) {
        npc.cash_vnd = npc.cash_vnd + 500000;
        npc.happiness_score = clamp(npc.happiness_score + 14, 0, 100);
        actionSummary += ' | Tết Nguyên Đán: Nhận phong bao lì xì đầu năm (+500.000đ).';
        addedJournal = 'Đón Tết Nguyên Đán rộn ràng và nhận lì xì mừng tuổi.';
      } else if (npc.cash_vnd >= 1500000) {
        npc.cash_vnd = npc.cash_vnd - 1500000;
        npc.happiness_score = clamp(npc.happiness_score + 12, 0, 100);
        actionSummary += ' | Tết Nguyên Đán: Sắm Tết và biếu cha mẹ (-1.500.000đ).';
        addedJournal = 'Sum họp đón Tết Nguyên Đán trọn vẹn bên gia đình.';
      }
    } else if (
      nextMonth === 8 &&
      newAge <= 17 &&
      (npc.yearly_event_tracker.BACK_TO_SCHOOL ?? 5) < newAge
    ) {
      npc.yearly_event_tracker.BACK_TO_SCHOOL = newAge;
      npc.happiness_score = clamp(npc.happiness_score + 6, 0, 100);
      actionSummary += ' | Mùa Tựu Trường tháng 8: Sửa soạn sách vở bước vào năm học mới.';
    } else if (
      nextDay === 5 &&
      newAge >= 20 &&
      npc.monthly_event_tracker.RENT !== `${nextYear}-${nextMonth}`
    ) {
      npc.monthly_event_tracker.RENT = `${nextYear}-${nextMonth}`;
      const rentCost = npc.current_region === 'RURAL' ? 900000 : 1800000;
      if (npc.cash_vnd >= rentCost) {
        npc.cash_vnd = npc.cash_vnd - rentCost;
        actionSummary += ` | Ngày 05 đầu tháng: Thanh toán tiền trọ & điện nước (-${rentCost.toLocaleString('vi-VN')}đ).`;
      } else {
        npc.happiness_score = clamp(npc.happiness_score - 10, 0, 100);
        actionSummary += ' | Ngày 05 đầu tháng: Chậm tiền trọ, phải xin chủ nhà khất nợ.';
      }
    }

    // Kiểm tra điều kiện qua đời (Đột quỵ Karoshi, Suy đa tạng, Tuổi già)
    const minOrganVal = getWeakestOrgan(organs).val;
    let diedNow = false;
    let causeText = '';
    if (box.sleep_debt_hours >= 72 && organs.heart <= 10) {
      diedNow = true;
      causeText = 'Đột quỵ do kiệt sức thức khuya lao động quá độ (Karoshi)';
    } else if (minOrganVal <= 0) {
      diedNow = true;
      causeText = 'Suy đa tạng nặng';
    } else if (newAge >= 85 && minOrganVal <= 15) {
      diedNow = true;
      causeText = 'Tuổi cao sức yếu, an nghỉ tự nhiên';
    }

    const healthColor = scoreToColor(minOrganVal);
    const happinessColor = scoreToColor(npc.happiness_score);
    const monologue = buildSensoryMonologue(npc);
    const dateStr = `${String(nextDay).padStart(2, '0')}/${String(nextMonth).padStart(2, '0')}/${nextYear}`;

    const newLog: NpcLifeEventLog = {
      id: `LOG_${Date.now()}_${Math.random()}`,
      age_years: newAge,
      time_str: `${dateStr} - ${String(nextHour).padStart(2, '0')}:00`,
      location_name: LOCATION_LABEL_MAP[npc.current_location_id] || npc.current_location_id,
      action_summary: actionSummary,
      health_color: healthColor,
      happiness_color: happinessColor,
      monologue
    };

    setNpcEntity(npc);
    setCalendarDate({ day: nextDay, month: nextMonth, year: nextYear });
    setCurrentHour(nextHour);
    setLogs((prev) => [newLog, ...prev].slice(0, 60));

    if (addedJournal) {
      setJournalEntries((prev) => [...prev, { age_years: newAge, text_vi: addedJournal! }]);
    }

    if (diedNow) {
      setIsDeceased(true);
      setDeathCauseVi(causeText);
      setIsAutoRunning(false);
      setActiveTab('MEMOIR');
      setJournalEntries((prev) => [
        ...prev,
        {
          age_years: newAge,
          text_vi: `Khép lại cuộc đời ở tuổi ${newAge} (${newAge < 50 ? 'Hưởng dương' : 'Hưởng thọ'} ${newAge} tuổi) — ${causeText}.`
        }
      ]);
    }
  };

  useEffect(() => {
    if (isAutoRunning && !isDeceased) {
      timerRef.current = window.setInterval(() => {
        stepOneHourTick();
      }, 380);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  });

  useEffect(() => {
    handleStartNewNpcLife();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const healthColor: ColorCode = npcEntity
    ? scoreToColor(getWeakestOrgan(npcEntity.hidden_black_box.organs).val)
    : 'GREEN';
  const happinessColor: ColorCode = npcEntity
    ? scoreToColor(npcEntity.happiness_score)
    : 'GREEN';

  return (
    <div
      style={{
        backgroundColor: '#F2ECE0',
        color: '#1F1B16',
        minHeight: '100vh',
        padding: '20px',
        fontFamily: 'Georgia, "Be Vietnam Pro", serif'
      }}
    >
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <div
          style={{
            borderBottom: '2px solid #1F1B16',
            paddingBottom: '12px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', color: '#B8382A' }}>
              DÒNG ĐỜI — TRÌNH QUAN SÁT NPC TỰ HÀNH (AI_AUTONOMOUS)
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.85 }}>
              Tự do thức khuya không gán cứng giờ ngủ: Ngủ theo áp lực buồn ngủ & tính cách; thức quá 18h/30h/40h bị hao mòn nội tạng & sập nguồn cưỡng chế
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={stepOneHourTick}
              disabled={isDeceased || isAutoRunning}
              style={{
                padding: '8px 14px',
                border: '1px solid #1F1B16',
                backgroundColor: '#EAE1D0',
                cursor: isDeceased ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              +1 Nhịp AI
            </button>
            <button
              onClick={() => setIsAutoRunning(!isAutoRunning)}
              disabled={isDeceased}
              style={{
                padding: '8px 16px',
                border: '1px solid #B8382A',
                backgroundColor: isAutoRunning ? '#B8382A' : '#1F1B16',
                color: '#F2ECE0',
                cursor: isDeceased ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {isAutoRunning ? '⏸ Tạm Dừng' : '▶ Tự Động Theo Dõi'}
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '12px 14px',
            border: '1px solid #C8BFA8',
            backgroundColor: '#FAF6EE',
            marginBottom: '16px'
          }}
        >
          <div style={{ flex: '1 1 260px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
              Chọn Năm Sinh Ra (Lựa chọn duy nhất — Tên, Giới tính, Gia cảnh Q1–Q5 & Vùng miền ngẫu nhiên 100%)
            </label>
            <input
              type="number"
              min={1950}
              max={2026}
              value={selectedBirthYear}
              onChange={(e) => setSelectedBirthYear(Number(e.target.value) || 2000)}
              style={{
                width: '100%',
                padding: '7px',
                border: '1px solid #1F1B16',
                background: '#FFF',
                fontSize: '14px'
              }}
            />
          </div>
          <button
            onClick={handleStartNewNpcLife}
            style={{
              padding: '9px 18px',
              backgroundColor: '#B8382A',
              color: '#F2ECE0',
              border: 'none',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Khởi Tạo Cuộc Đời Mới (Random Nhân Thân)
          </button>
        </div>

        {npcEntity && (
          <div
            style={{
              border: '1px solid #1F1B16',
              padding: '16px',
              backgroundColor: '#FAF6EE',
              marginBottom: '18px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px' }}>
                  {npcEntity.identity_biometrics.full_name} ({Math.floor(npcEntity.identity_biometrics.exact_age_years)} tuổi •{' '}
                  {npcEntity.identity_biometrics.gender === 'MALE' ? 'Nam' : 'Nữ'})
                </h2>
                <div style={{ fontSize: '13px', marginTop: '4px', lineHeight: 1.5 }}>
                  Ngày sinh:{' '}
                  <strong>
                    {String(npcEntity.identity_biometrics.birth_day).padStart(2, '0')}/
                    {String(npcEntity.identity_biometrics.birth_month).padStart(2, '0')}/
                    {npcEntity.identity_biometrics.birth_year}
                  </strong>{' '}
                  • Gia cảnh: <strong>{npcEntity.identity_biometrics.family_tier}</strong> • Vùng:{' '}
                  <strong>{npcEntity.current_region === 'RURAL' ? 'Nông Thôn' : 'Thành Thị'}</strong>
                  <br />
                  Học vấn: <strong>{npcEntity.identity_biometrics.education_level_vi}</strong> • Tính cách:{' '}
                  <strong>{PERSONALITY_LABEL_MAP[npcEntity.identity_biometrics.locked_personality]}</strong> • Vóc dáng:{' '}
                  <strong>
                    {npcEntity.capability_flags.is_biometrics_decoded
                      ? `${npcEntity.identity_biometrics.height_cm}cm • ${npcEntity.identity_biometrics.weight_kg}kg`
                      : 'Chưa rõ vóc dáng (Chờ khám sức khỏe)'}
                  </strong>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  Ví tiền: {npcEntity.cash_vnd.toLocaleString('vi-VN')} đ
                </div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>
                  Lịch: {String(calendarDate.day).padStart(2, '0')}/{String(calendarDate.month).padStart(2, '0')}/
                  {calendarDate.year} — {String(currentHour).padStart(2, '0')}:00
                </div>
                <div style={{ fontSize: '12px', opacity: 0.75, marginTop: '2px' }}>
                  Vị trí: {LOCATION_LABEL_MAP[npcEntity.current_location_id] || npcEntity.current_location_id}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', marginTop: '14px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    backgroundColor: COLOR_HEX_MAP[healthColor],
                    display: 'inline-block'
                  }}
                />
                <span>
                  Sức khỏe: <strong>{HEALTH_LABEL_MAP[healthColor]}</strong>
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    backgroundColor: COLOR_HEX_MAP[happinessColor],
                    display: 'inline-block'
                  }}
                />
                <span>
                  Tâm trạng: <strong>{HAPPINESS_LABEL_MAP[happinessColor]}</strong>
                </span>
              </div>

              {npcEntity.capability_flags.is_dementia_autopilot && (
                <span style={{ color: '#B8382A', fontWeight: 'bold' }}>
                  [Trạng thái: Lú lẫn tuổi già — Sinh hoạt vô thức]
                </span>
              )}
            </div>

            <div
              style={{
                marginTop: '12px',
                padding: '10px',
                borderLeft: '3px solid #B8382A',
                backgroundColor: '#F2ECE0',
                fontStyle: 'italic',
                fontSize: '14px'
              }}
            >
              “{buildSensoryMonologue(npcEntity)}”
            </div>

            {isDeceased && (
              <div
                style={{
                  marginTop: '14px',
                  padding: '12px',
                  backgroundColor: '#1F1B16',
                  color: '#F2ECE0',
                  textAlign: 'center'
                }}
              >
                <strong>
                  {Math.floor(npcEntity.identity_biometrics.exact_age_years) < 50 ? 'HƯỞNG DƯƠNG' : 'HƯỞNG THỌ'}{' '}
                  {Math.floor(npcEntity.identity_biometrics.exact_age_years)} TUỔI:
                </strong>{' '}
                {npcEntity.identity_biometrics.full_name} — Nguyên nhân: {deathCauseVi}.
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            onClick={() => setActiveTab('TIMELINE')}
            style={{
              padding: '7px 14px',
              border: '1px solid #1F1B16',
              backgroundColor: activeTab === 'TIMELINE' ? '#1F1B16' : '#FAF6EE',
              color: activeTab === 'TIMELINE' ? '#F2ECE0' : '#1F1B16',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Nhịp Sinh Hoạt Tự Hành ({logs.length})
          </button>
          <button
            onClick={() => setActiveTab('MEMOIR')}
            style={{
              padding: '7px 14px',
              border: '1px solid #1F1B16',
              backgroundColor: activeTab === 'MEMOIR' ? '#1F1B16' : '#FAF6EE',
              color: activeTab === 'MEMOIR' ? '#F2ECE0' : '#1F1B16',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Cuốn Nhật Ký Đời Người — 5 Chương ({journalEntries.length})
          </button>
        </div>

        {activeTab === 'TIMELINE' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {logs.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #D5CCB8',
                  backgroundColor: '#FAF6EE',
                  fontSize: '13px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong>
                    [{entry.age_years} tuổi • {entry.time_str}] — Tại: {entry.location_name}
                  </strong>
                  <span style={{ color: COLOR_HEX_MAP[entry.health_color], fontWeight: 'bold' }}>
                    ● {HEALTH_LABEL_MAP[entry.health_color]}
                  </span>
                </div>
                <div>{entry.action_summary}</div>
                <div style={{ fontSize: '12px', opacity: 0.75, marginTop: '3px', fontStyle: 'italic' }}>
                  Cảm nhận: {entry.monologue}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {MEMOIR_CHAPTERS.map((chap) => {
              const items = journalEntries.filter(
                (j) => j.age_years >= chap.minAge && j.age_years <= chap.maxAge
              );
              return (
                <div
                  key={chap.index}
                  style={{
                    padding: '14px',
                    border: '1px solid #C8BFA8',
                    backgroundColor: '#FAF6EE'
                  }}
                >
                  <h4 style={{ margin: '0 0 8px', color: '#B8382A' }}>{chap.title}</h4>
                  {items.length === 0 ? (
                    <div style={{ fontSize: '13px', opacity: 0.65, fontStyle: 'italic' }}>
                      Trang giấy còn để ngỏ...
                    </div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: 1.6 }}>
                      {items.map((it, idx) => (
                        <li key={idx}>
                          <strong>[{it.age_years} tuổi]</strong> {it.text_vi}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <DevOnlyAdminGate/>
    </div>
    
  );
}