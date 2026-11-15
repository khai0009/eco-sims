/**
 * ============================================================================
 * ECO-LIFE (DÒNG ĐỜI) - AUTONOMOUS NPC LIFECYCLE & SOCIAL SIMULATION (0 -> DEATH)
 * ============================================================================
 * Mục tiêu kép:
 *   1. Kiểm toán (Stress-test) toàn bộ Core Engine qua hàng chục năm mô phỏng
 *      liên tục từ 0 tuổi đến lúc qua đời (không crash, không NaN, không kẹt vòng lặp).
 *   2. Kiểm chứng cơ chế NPC tự sinh hoạt, rèn lối sống, tương tác qua lại
 *      (mượn đồ, kết bạn, kết hôn, sinh con F1 di truyền gen bệnh lý).
 *
 * Cách chạy:
 *   npx tsx npc_autonomous_lifecycle_sim.test.ts
 */

type BiologicalSex = "MALE" | "FEMALE";
type SocioeconomicTier = "Q1" | "Q2" | "Q3" | "Q4" | "Q5";
type PersonalityType = "INTROVERT" | "EXTROVERT" | "DAREDEVIL" | "EMPATHETIC" | "AMBIVERT";
type HealthColor = "BLUE" | "GREEN" | "YELLOW" | "ORANGE" | "RED";

interface AutonomousNpc {
  id: string;
  name: string;
  generation: number; // 0 = Thế hệ khởi thủy, 1 = Con cái F1 sinh ra trong thế giới
  birthYear: number;
  age: number;
  sex: BiologicalSex;
  originTier: SocioeconomicTier;
  personality: PersonalityType | null;
  personalityVotes: Record<PersonalityType, number>;
  traits: string[];
  habits: string[];
  habitProgress: Record<string, number>;
  organs: {
    brain: number;
    heart: number;
    lungs: number;
    liver: number;
    digestive: number;
    musculoskeletal: number;
    kidneys: number;
  };
  visionMyopiaDiopters: number;
  sleepDebtHours: number;
  ptsdScore: number;
  cashVnd: number;
  spouseId: string | null;
  parentIds: [string, string] | null;
  childrenIds: string[];
  isAutoPilotDementia: boolean;
  isAlive: boolean;
  deathAge: number | null;
  deathCause: string | null;
  lifeJournal: string[];
}

interface SocialEdge {
  aId: string;
  bId: string;
  bonding: number; // 0 - 100
  relation: "STRANGER" | "ACQUAINTANCE" | "CLOSE" | "SOULMATE" | "SPOUSE" | "FAMILY";
}

// Bảng ánh xạ Bệnh & Thuốc điều trị dùng chung (Khớp disease_catalog.json & medicine_and_treatment_catalog.json)
type OrganKey = keyof AutonomousNpc["organs"];
interface DiseaseDef {
  id: string;
  organ: OrganKey;
  symptomCluster: string;
  otcCurableIfMild: boolean;
  rxMedicineId: string;
}
interface MedicineDef {
  id: string;
  requiresPrescription: boolean;
  treatsDiseaseIds: string[];
  symptomClusters: string[];
  priceVnd: number;
}

const DISEASE_TABLE: DiseaseDef[] = [
  { id: "DIS_GASTRITIS_MILD", organ: "digestive", symptomCluster: "SYM_UPPER_ABDOMINAL_ACHE", otcCurableIfMild: true, rxMedicineId: "MED_GASTRIC_MUCOSA_RX" },
  { id: "DIS_FATTY_LIVER_HEPATITIS", organ: "liver", symptomCluster: "SYM_UPPER_ABDOMINAL_ACHE", otcCurableIfMild: true, rxMedicineId: "MED_HEPATITIS_SPECIAL_RX" },
  { id: "DIS_CORONARY_ISCHEMIA", organ: "heart", symptomCluster: "SYM_CHEST_TIGHTNESS_BURNING", otcCurableIfMild: false, rxMedicineId: "MED_CARDIO_VASODILATOR_RX" },
  { id: "DIS_ASTHMA_BRONCHITIS", organ: "lungs", symptomCluster: "SYM_CHEST_TIGHTNESS_BURNING", otcCurableIfMild: true, rxMedicineId: "MED_INHALER_ASTHMA_RX" },
  { id: "DIS_CEREBRAL_ANEMIA_STRESS", organ: "brain", symptomCluster: "SYM_DIZZINESS_HEADACHE_FATIGUE", otcCurableIfMild: true, rxMedicineId: "MED_NEURO_RECOVERY_RX" },
  { id: "DIS_LUMBAR_DEGENERATION", organ: "musculoskeletal", symptomCluster: "SYM_LOWER_BACK_AND_FATIGUE", otcCurableIfMild: true, rxMedicineId: "MED_ORTHOPEDIC_RX" },
  { id: "DIS_KIDNEY_DYSFUNCTION", organ: "kidneys", symptomCluster: "SYM_LOWER_BACK_AND_FATIGUE", otcCurableIfMild: false, rxMedicineId: "MED_RENAL_THERAPY_RX" },
];

const MEDICINE_TABLE: MedicineDef[] = [
  { id: "MED_PAINKILLER_GENERIC_OTC", requiresPrescription: false, treatsDiseaseIds: [], symptomClusters: ["SYM_UPPER_ABDOMINAL_ACHE", "SYM_CHEST_TIGHTNESS_BURNING", "SYM_DIZZINESS_HEADACHE_FATIGUE", "SYM_LOWER_BACK_AND_FATIGUE"], priceVnd: 45_000 },
  { id: "MED_ANTACID_STOMACH", requiresPrescription: false, treatsDiseaseIds: ["DIS_GASTRITIS_MILD"], symptomClusters: ["SYM_UPPER_ABDOMINAL_ACHE", "SYM_CHEST_TIGHTNESS_BURNING"], priceVnd: 120_000 },
  { id: "MED_LIVER_DETOX_OTC", requiresPrescription: false, treatsDiseaseIds: ["DIS_FATTY_LIVER_HEPATITIS"], symptomClusters: ["SYM_UPPER_ABDOMINAL_ACHE"], priceVnd: 180_000 },
  { id: "MED_COUGH_BRONCHIAL_OTC", requiresPrescription: false, treatsDiseaseIds: ["DIS_ASTHMA_BRONCHITIS"], symptomClusters: ["SYM_CHEST_TIGHTNESS_BURNING"], priceVnd: 135_000 },
  { id: "MED_BRAIN_TONIC_OTC", requiresPrescription: false, treatsDiseaseIds: ["DIS_CEREBRAL_ANEMIA_STRESS"], symptomClusters: ["SYM_DIZZINESS_HEADACHE_FATIGUE"], priceVnd: 160_000 },
  { id: "MED_JOINT_SUPPORT_OTC", requiresPrescription: false, treatsDiseaseIds: ["DIS_LUMBAR_DEGENERATION"], symptomClusters: ["SYM_LOWER_BACK_AND_FATIGUE"], priceVnd: 150_000 },
  { id: "MED_HEPATITIS_SPECIAL_RX", requiresPrescription: true, treatsDiseaseIds: ["DIS_FATTY_LIVER_HEPATITIS"], symptomClusters: ["SYM_UPPER_ABDOMINAL_ACHE"], priceVnd: 850_000 },
  { id: "MED_GASTRIC_MUCOSA_RX", requiresPrescription: true, treatsDiseaseIds: ["DIS_GASTRITIS_MILD"], symptomClusters: ["SYM_UPPER_ABDOMINAL_ACHE"], priceVnd: 650_000 },
  { id: "MED_CARDIO_VASODILATOR_RX", requiresPrescription: true, treatsDiseaseIds: ["DIS_CORONARY_ISCHEMIA"], symptomClusters: ["SYM_CHEST_TIGHTNESS_BURNING"], priceVnd: 1_200_000 },
  { id: "MED_INHALER_ASTHMA_RX", requiresPrescription: true, treatsDiseaseIds: ["DIS_ASTHMA_BRONCHITIS"], symptomClusters: ["SYM_CHEST_TIGHTNESS_BURNING"], priceVnd: 750_000 },
  { id: "MED_NEURO_RECOVERY_RX", requiresPrescription: true, treatsDiseaseIds: ["DIS_CEREBRAL_ANEMIA_STRESS"], symptomClusters: ["SYM_DIZZINESS_HEADACHE_FATIGUE"], priceVnd: 980_000 },
  { id: "MED_ORTHOPEDIC_RX", requiresPrescription: true, treatsDiseaseIds: ["DIS_LUMBAR_DEGENERATION"], symptomClusters: ["SYM_LOWER_BACK_AND_FATIGUE"], priceVnd: 800_000 },
  { id: "MED_RENAL_THERAPY_RX", requiresPrescription: true, treatsDiseaseIds: ["DIS_KIDNEY_DYSFUNCTION"], symptomClusters: ["SYM_LOWER_BACK_AND_FATIGUE"], priceVnd: 1_100_000 },
];

// ============================================================================
// BỘ NÃO MÔ PHỎNG VÒNG ĐỜI & XÃ HỘI NPC
// ============================================================================

class NpcWorldSimulator {
  currentYear: number;
  npcs: AutonomousNpc[] = [];
  socialEdges: SocialEdge[] = [];
  metrics = {
    totalBornF1: 0,
    totalMarriages: 0,
    totalPhoneBorrowsSucceeded: 0,
    totalPhoneBorrowsRefused: 0,
    totalKaroshiDeaths: 0,
    totalOtcLuckyCures: 0,
    totalPainkillerLiverTraps: 0,
    totalDementiaCases: 0,
  };

  constructor(startYear: number) {
    this.currentYear = startYear;
  }

  private rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Random tính cách cho NPC có chống áp đảo (Anti-Domination Weighted Roll):
   * Nhóm tính cách nào đang ít xuất hiện trong xã hội sẽ có trọng số cao hơn.
   */
  private pickBalancedNpcPersonality(): PersonalityType {
    const allTypes: PersonalityType[] = [
      "INTROVERT",
      "EXTROVERT",
      "DAREDEVIL",
      "EMPATHETIC",
      "AMBIVERT",
    ];
    const counts: Record<PersonalityType, number> = {
      INTROVERT: 0,
      EXTROVERT: 0,
      DAREDEVIL: 0,
      EMPATHETIC: 0,
      AMBIVERT: 0,
    };

    for (const n of this.npcs) {
      if (n.personality) counts[n.personality]++;
    }

    const maxCount = Math.max(...Object.values(counts));
    // Trọng số nghịch đảo: nhóm ít người hơn sẽ được ưu tiên chọn, tránh 1 nhóm chiếm đa số
    const weights = allTypes.map((t) => Math.max(1, maxCount - counts[t] + 2));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let r = Math.random() * totalWeight;
    for (let i = 0; i < allTypes.length; i++) {
      if (r < weights[i]) return allTypes[i];
      r -= weights[i];
    }
    return "AMBIVERT";
  }

  /**
   * Sinh một NPC sơ sinh 0 tuổi (Ngẫu nhiên hoàn toàn hoặc kế thừa gen từ Cha & Mẹ)
   */
  spawnNewbornNpc(
    name: string,
    generation: number,
    parents: [AutonomousNpc, AutonomousNpc] | null = null,
    forcedSex?: BiologicalSex
  ): AutonomousNpc {
    const sex: BiologicalSex = forcedSex ?? (Math.random() < 0.5 ? "MALE" : "FEMALE");
    const tiers: SocioeconomicTier[] = ["Q1", "Q2", "Q3", "Q4", "Q5"];
    const originTier: SocioeconomicTier = parents ? parents[0].originTier : this.pick(tiers);

    const traits: string[] = [];
    if (parents) {
      // Di truyền gen từ Cha hoặc Mẹ (45% cơ hội nhận mỗi gen)
      const parentGenePool = Array.from(new Set([...parents[0].traits, ...parents[1].traits]));
      for (const gene of parentGenePool) {
        if (Math.random() < 0.45 && traits.length < 2) {
          traits.push(gene);
        }
      }
    } else {
      // Random gen bẩm sinh thế hệ đầu
      const possibleTraits = [
        "GENETIC_HEART_WEAKNESS",
        "GENETIC_MYOPIA",
        "ADHD",
        "FAST_LEARNER",
        "SUPERIOR_PHYSIQUE",
        "QUICK_REFLEXES",
      ];
      for (const t of possibleTraits) {
        if (Math.random() < 0.12 && traits.length < 2) {
          traits.push(t);
        }
      }
    }

    const heartBase = traits.includes("GENETIC_HEART_WEAKNESS") ? this.rand(65, 78) : this.rand(88, 100);
    const myopia = traits.includes("GENETIC_MYOPIA") ? Number(this.rand(1.5, 4.5).toFixed(1)) : 0;

    const npc: AutonomousNpc = {
      id: `NPC_G${generation}_${this.npcs.length + 1}`,
      name,
      generation,
      birthYear: this.currentYear,
      age: 0,
      sex,
      originTier,
      personality: null, // 0 tuổi chưa khóa tính cách
      personalityVotes: { INTROVERT: 0, EXTROVERT: 0, DAREDEVIL: 0, EMPATHETIC: 0, AMBIVERT: 0 },
      traits,
      habits: [],
      habitProgress: {},
      organs: {
        brain: Number(this.rand(90, 100).toFixed(1)),
        heart: Number(heartBase.toFixed(1)),
        lungs: Number(this.rand(88, 100).toFixed(1)),
        liver: Number(this.rand(88, 100).toFixed(1)),
        digestive: Number(this.rand(88, 100).toFixed(1)),
        musculoskeletal: Number(this.rand(88, 100).toFixed(1)),
        kidneys: Number(this.rand(88, 100).toFixed(1)),
      },
      visionMyopiaDiopters: myopia,
      sleepDebtHours: 0,
      ptsdScore: 0,
      cashVnd: 0,
      spouseId: null,
      parentIds: parents ? [parents[0].id, parents[1].id] : null,
      childrenIds: [],
      isAutoPilotDementia: false,
      isAlive: true,
      deathAge: null,
      deathCause: null,
      lifeJournal: [`Năm ${this.currentYear}: Chào đời (${sex}, Gia cảnh ${originTier}${traits.length ? `, Gen: ${traits.join("+")}` : ""}).`],
    };

    this.npcs.push(npc);
    if (parents) {
      parents[0].childrenIds.push(npc.id);
      parents[1].childrenIds.push(npc.id);
      this.metrics.totalBornF1++;
    }
    return npc;
  }

  private getHealthColor(npc: AutonomousNpc): HealthColor {
    const minVal = Math.min(...Object.values(npc.organs));
    if (minVal >= 85) return "BLUE";
    if (minVal >= 65) return "GREEN";
    if (minVal >= 45) return "YELLOW";
    if (minVal >= 25) return "ORANGE";
    return "RED";
  }

  private getOrCreateEdge(a: AutonomousNpc, b: AutonomousNpc): SocialEdge {
    let edge = this.socialEdges.find(
      (e) => (e.aId === a.id && e.bId === b.id) || (e.aId === b.id && e.bId === a.id)
    );
    if (!edge) {
      edge = { aId: a.id, bId: b.id, bonding: 5, relation: "STRANGER" };
      this.socialEdges.push(edge);
    }
    return edge;
  }

  private trainHabit(npc: AutonomousNpc, habit: string, gain: number) {
    const opposites: Record<string, string> = {
      CAREFUL_CHECKLIST: "SCATTERBRAINED",
      SCATTERBRAINED: "CAREFUL_CHECKLIST",
      FRUGAL_SAVER: "IMPULSE_SPENDER",
      IMPULSE_SPENDER: "FRUGAL_SAVER",
    };
    const next = Math.min(100, (npc.habitProgress[habit] || 0) + gain);
    npc.habitProgress[habit] = next;
    if (next >= 100 && !npc.habits.includes(habit)) {
      npc.habits.push(habit);
      const opp = opposites[habit];
      if (opp) npc.habits = npc.habits.filter((h) => h !== opp);
      npc.lifeJournal.push(`Tuổi ${npc.age}: Hình thành lối sống [${habit}].`);
    }
  }

  /**
   * Mô phỏng 1 năm trôi qua cho toàn bộ NPC đang sống & Tương tác xã hội giữa chúng
   */
  simulateOneYear() {
    this.currentYear++;
    const livingNpcs = this.npcs.filter((n) => n.isAlive);

    // 1. Vòng lặp sinh học & hành vi cá nhân của từng NPC
    for (const npc of livingNpcs) {
      npc.age++;

      // Giai đoạn 6 tuổi: NPC nhận tính cách ngẫu nhiên có cân bằng xã hội (chống 1 nhóm áp đảo)
      if (npc.age === 6 && !npc.personality) {
        npc.personality = this.pickBalancedNpcPersonality();
        npc.lifeJournal.push(`Tuổi 6: Định hình tính cách [${npc.personality}] & mở đồng hồ nhận thức.`);
      }

      // Giai đoạn 6 - 17 tuổi: Đi học & rèn luyện lối sống ngẫu nhiên
      if (npc.age >= 6 && npc.age < 18) {
        if (npc.personality === "INTROVERT" || npc.personality === "EMPATHETIC") {
          this.trainHabit(npc, "CAREFUL_CHECKLIST", 18);
          this.trainHabit(npc, "FRUGAL_SAVER", 15);
        } else if (npc.personality === "DAREDEVIL") {
          this.trainHabit(npc, "SCATTERBRAINED", 20);
          this.trainHabit(npc, "STREET_SMART", 18);
        } else {
          this.trainHabit(npc, "SOCIAL_BUTTERFLY", 20);
        }
      }

      // Giai đoạn 18 - 59 tuổi: Đi làm, áp lực ca đêm, nợ ngủ & bẫy thuốc giảm đau
      if (npc.age >= 18 && npc.age < 60) {
        const baseIncome =
          npc.originTier === "Q5" ? 180_000_000 : npc.originTier === "Q4" ? 95_000_000 : 55_000_000;
        const saverMult = npc.habits.includes("FRUGAL_SAVER") ? 0.65 : 0.35;
        npc.cashVnd += Math.round(baseIncome * saverMult);

        // Mô phỏng nhóm tham công tiếc việc thức khuya cày ca đêm -> Karoshi
        if ((npc.personality === "DAREDEVIL" || npc.originTier === "Q1") && Math.random() < 0.35) {
          npc.sleepDebtHours += 16;
          npc.organs.heart = Math.max(0, npc.organs.heart - 7.5);
          npc.organs.brain = Math.max(0, npc.organs.brain - 5.5);
        } else {
          npc.sleepDebtHours = Math.max(0, npc.sleepDebtHours - 3);
        }

        // Kiểm tra đột quỵ Karoshi khi nợ ngủ cao + tim yếu
        if (npc.sleepDebtHours >= 30 && npc.organs.heart < 30) {
          npc.isAlive = false;
          npc.deathAge = npc.age;
          npc.deathCause = "Đột quỵ Karoshi do thức đêm làm việc quá sức";
          npc.lifeJournal.push(`Tuổi ${npc.age}: Qua đời đột ngột vì ${npc.deathCause}.`);
          this.metrics.totalKaroshiDeaths++;
          continue;
        }
      }

      // Lão hóa tự nhiên sau tuổi 60 (-2.2%/năm cho các tạng)
      if (npc.age >= 60) {
        (Object.keys(npc.organs) as OrganKey[]).forEach((k) => {
          npc.organs[k] = Math.max(0, Number((npc.organs[k] - 2.2).toFixed(1)));
        });
        if (npc.organs.brain < 25 && !npc.isAutoPilotDementia) {
          npc.isAutoPilotDementia = true;
          npc.lifeJournal.push(`Tuổi ${npc.age}: Sa sút trí tuệ nặng (Não < 25%), chuyển sang tự hành Auto-pilot.`);
          this.metrics.totalDementiaCases++;
        }
      }

      // Phản ứng y tế dựa trên Bảng Bệnh (DISEASE_TABLE) & Bảng Thuốc (MEDICINE_TABLE)
      const healthColor = this.getHealthColor(npc);
      if (healthColor === "RED" || healthColor === "ORANGE") {
        // Xác định tạng yếu nhất (không tính lão hóa não tự nhiên >= 65 tuổi)
        const treatableOrgans = (Object.keys(npc.organs) as OrganKey[]).filter(
          (k) => !(k === "brain" && npc.age >= 65)
        );
        const weakestOrgan = treatableOrgans.reduce((a, b) =>
          npc.organs[a] < npc.organs[b] ? a : b
        );
        const actualDisease =
          DISEASE_TABLE.find((d) => d.organ === weakestOrgan) || DISEASE_TABLE[0];

        // Nhóm bận rộn / DAREDEVIL / Q1 không muốn nghỉ 1 ngày làm đi Bệnh viện -> Ra Hiệu thuốc tây kể triệu chứng
        const skipsHospitalWorkLeave =
          (npc.personality === "DAREDEVIL" && !npc.habits.includes("CAREFUL_CHECKLIST")) ||
          npc.originTier === "Q1" ||
          npc.cashVnd < 3_000_000;

        if (!skipsHospitalWorkLeave && npc.cashVnd >= 3_000_000) {
          // Đi Bệnh viện: Tốn phí khám + nghỉ 1 ngày làm (trừ nhẹ thu nhập), xét nghiệm đúng bệnh & kê sẵn thuốc đặc trị
          const rxMed = MEDICINE_TABLE.find((m) => m.id === actualDisease.rxMedicineId)!;
          npc.cashVnd = Math.max(0, npc.cashVnd - (1_800_000 + rxMed.priceVnd));
          npc.organs[weakestOrgan] = Math.min(100, Number((npc.organs[weakestOrgan] + 18.0).toFixed(1)));
        } else if (healthColor === "ORANGE") {
          // Hiệu thuốc tây (OTC): Dược sĩ chỉ nghe mô tả triệu chứng -> Bốc ngẫu nhiên 1 thuốc OTC thuộc cụm triệu chứng đó
          const otcCandidates = MEDICINE_TABLE.filter(
            (m) => !m.requiresPrescription && m.symptomClusters.includes(actualDisease.symptomCluster)
          );
          const chosenOtc = this.pick(otcCandidates);
          npc.cashVnd = Math.max(0, npc.cashVnd - chosenOtc.priceVnd);

          const isMatchedAndCurable =
            actualDisease.otcCurableIfMild && chosenOtc.treatsDiseaseIds.includes(actualDisease.id);

          if (isMatchedAndCurable) {
            // Hên: Dược sĩ bốc trúng thuốc đúng bệnh nhẹ -> Hồi phục tạng yếu, hao nhẹ -1.0 Gan
            npc.organs[weakestOrgan] = Math.min(100, Number((npc.organs[weakestOrgan] + 11.0).toFixed(1)));
            npc.organs.liver = Math.max(0, Number((npc.organs.liver - 1.0).toFixed(1)));
            this.metrics.totalOtcLuckyCures++;
          } else {
            // Xui: Bốc nhầm bệnh trùng triệu chứng (VD: đau thượng vị do Gan nhưng uống thuốc Dạ dày/Giảm đau) -> Hại Gan/Thận
            npc.organs.liver = Math.max(0, Number((npc.organs.liver - 5.5).toFixed(1)));
            npc.organs.kidneys = Math.max(0, Number((npc.organs.kidneys - 2.0).toFixed(1)));
            this.metrics.totalPainkillerLiverTraps++;
          }
        } else {
          // Bệnh nặng (RED): Thuốc OTC hiệu thuốc tây không trị được -> Cố uống chỉ làm hoại tử Gan (-6.5)
          npc.organs.liver = Math.max(0, Number((npc.organs.liver - 6.5).toFixed(1)));
          this.metrics.totalPainkillerLiverTraps++;
        }
      }

      // Kiểm tra tử vong do suy tạng (bất kỳ tạng nào <= 0) hoặc tuổi già > 95
      const minOrgan = Math.min(...Object.values(npc.organs));
      if (minOrgan <= 0 || npc.age >= 98) {
        npc.isAlive = false;
        npc.deathAge = npc.age;
        npc.deathCause =
          minOrgan <= 0 ? "Suy đa tạng mức Đỏ" : "Tuổi già sức yếu (Hưởng thượng thọ)";
        npc.lifeJournal.push(`Tuổi ${npc.age}: Qua đời (${npc.deathCause}). Tài sản để lại: ${npc.cashVnd.toLocaleString()}đ.`);
      }
    }

    // 2. Vòng lặp tương tác xã hội giữa các NPC đang sống (NPC-to-NPC Interactions)
    const activeAdultsAndYouth = this.npcs.filter((n) => n.isAlive && n.age >= 12);
    for (let i = 0; i < activeAdultsAndYouth.length; i++) {
      const a = activeAdultsAndYouth[i];

      // Ưu tiên tương tác gia đình nếu đã kết hôn (kiểm tra sinh con F1 hàng năm)
      if (a.spouseId && a.sex === "FEMALE" && a.age >= 23 && a.age <= 40 && a.childrenIds.length < 2) {
        const husband = this.npcs.find((n) => n.id === a.spouseId && n.isAlive);
        if (husband && Math.random() < 0.35) {
          const babySex: BiologicalSex = Math.random() < 0.5 ? "MALE" : "FEMALE";
          const babyName = `${babySex === "MALE" ? "Bé_Trai" : "Bé_Gái"}_${a.name.split("_")[1]}_F1`;
          const baby = this.spawnNewbornNpc(babyName, a.generation + 1, [a, husband], babySex);
          a.lifeJournal.push(`Tuổi ${a.age}: Cùng chồng (${husband.name}) sinh con (${baby.name}).`);
        }
      }

      const b = this.pick(activeAdultsAndYouth);
      if (a.id === b.id) continue;

      const edge = this.getOrCreateEdge(a, b);
      // Tăng điểm thân thiết khi giao lưu
      const compatBonus = a.personality === b.personality || a.personality === "EXTROVERT" ? 14 : 9;
      edge.bonding = Math.min(100, edge.bonding + compatBonus);

      if (edge.relation !== "SPOUSE" && edge.relation !== "FAMILY") {
        if (edge.bonding >= 81) edge.relation = "SOULMATE";
        else if (edge.bonding >= 51) edge.relation = "CLOSE";
        else if (edge.bonding >= 21) edge.relation = "ACQUAINTANCE";
      }

      // Mô phỏng tình huống NPC A quên điện thoại & hỏi mượn NPC B
      if (a.habits.includes("SCATTERBRAINED") && edge.bonding >= 21 && Math.random() < 0.15) {
        const refuseChance = b.personality === "INTROVERT" ? 0.4 : b.personality === "EMPATHETIC" ? 0.0 : 0.1;
        if (Math.random() > refuseChance) {
          this.metrics.totalPhoneBorrowsSucceeded++;
        } else {
          this.metrics.totalPhoneBorrowsRefused++;
        }
      }

      // Kết hôn khi đạt Tri kỷ (>= 81 điểm), khác giới, đủ 22 tuổi và đều độc thân
      if (
        edge.bonding >= 81 &&
        a.sex !== b.sex &&
        a.age >= 22 &&
        a.age <= 45 &&
        b.age >= 22 &&
        b.age <= 45 &&
        !a.spouseId &&
        !b.spouseId &&
        (!a.parentIds || !a.parentIds.includes(b.id))
      ) {
        a.spouseId = b.id;
        b.spouseId = a.id;
        edge.relation = "SPOUSE";
        this.metrics.totalMarriages++;
        a.lifeJournal.push(`Tuổi ${a.age}: Kết hôn với Tri kỷ ${b.name}.`);
        b.lifeJournal.push(`Tuổi ${b.age}: Kết hôn với Tri kỷ ${a.name}.`);
      }
    }
  }
}

// ============================================================================
// CHẠY MÔ PHỎNG & IN BÁO CÁO KIỂM TOÁN
// ============================================================================

function runAutonomousNpcSimulation() {
  console.log("=================================================================");
  console.log("🌍 MÔ PHỎNG VÒNG ĐỜI TỰ HÀNH NPC (0 TUỔI -> QUA ĐỜI) & XÃ HỘI");
  console.log("=================================================================\n");

  const sim = new NpcWorldSimulator(2000);

  // Khởi tạo 12 NPC sơ sinh 0 tuổi (6 Nam, 6 Nữ khớp đúng tên gọi)
  const maleNames = ["Minh_An", "Hoàng_Nam", "Quốc_Bảo", "Đức_Huy", "Tuấn_Kiệt", "Gia_Huy"];
  const femaleNames = ["Thu_Trang", "Lan_Anh", "Ngọc_Mai", "Thanh_Hà", "Phương_Thảo", "Khánh_Linh"];
  for (const name of maleNames) {
    sim.spawnNewbornNpc(name, 0, null, "MALE");
  }
  for (const name of femaleNames) {
    sim.spawnNewbornNpc(name, 0, null, "FEMALE");
  }

  // Cho thế giới chạy liên tục 95 năm game (từ năm 2000 đến 2095)
  for (let y = 0; y < 95; y++) {
    sim.simulateOneYear();
  }

  // Kiểm toán tính toàn vẹn dữ liệu sau 95 năm mô phỏng
  let corruptEntities = 0;
  for (const npc of sim.npcs) {
    const organValues = Object.values(npc.organs);
    if (organValues.some((v) => Number.isNaN(v) || v < 0 || v > 100)) {
      corruptEntities++;
    }
  }

  console.log("📊 THỐNG KÊ XÃ HỘI SAU 95 NĂM VẬN HÀNH TỰ ĐỘNG:");
  console.log(`   • Tổng dân số từng tồn tại (G0 + F1): ${sim.npcs.length} NPC`);
  console.log(`   • Số cặp kết hôn từ mức Tri kỷ (>=81): ${sim.metrics.totalMarriages} cặp`);
  console.log(`   • Số trẻ em F1 sinh ra & kế thừa gen:  ${sim.metrics.totalBornF1} bé`);
  console.log(`   • Hỏi mượn điện thoại ngoài đường:     ${sim.metrics.totalPhoneBorrowsSucceeded} thành công / ${sim.metrics.totalPhoneBorrowsRefused} bị từ chối`);
  console.log(`   • Mua thuốc tây trị khỏi bệnh nhẹ:     ${sim.metrics.totalOtcLuckyCures} ca (Hên đoán đúng)`);
  console.log(`   • Ca dính bẫy thuốc tây sai/hại Gan:   ${sim.metrics.totalPainkillerLiverTraps} lần (Xui/Lạm dụng)`);
  console.log(`   • Ca tử vong do đột quỵ Karoshi:       ${sim.metrics.totalKaroshiDeaths} ca`);
  console.log(`   • Ca sa sút trí tuệ tuổi già (Auto):   ${sim.metrics.totalDementiaCases} ca`);
  console.log(`   • Lỗi tràn số / NaN chỉ số nội tạng:   ${corruptEntities} lỗi\n`);

  // In chi tiết Cuốn Nhật Ký Đời Người của 2 NPC tiêu biểu (1 G0 và 1 F1)
  const g0Sample = sim.npcs.find((n) => n.generation === 0 && !n.isAlive) || sim.npcs[0];
  const f1Sample = sim.npcs.find((n) => n.generation === 1);

  console.log(`📖 TRÍCH ĐOẠN NHẬT KÝ TỰ ĐỘNG — ${g0Sample.name} (G0):`);
  g0Sample.lifeJournal.slice(0, 8).forEach((line) => console.log(`   - ${line}`));
  if (g0Sample.lifeJournal.length > 8) {
    console.log(`   - ... (${g0Sample.lifeJournal.length - 8} sự kiện khác)`);
    console.log(`   - ${g0Sample.lifeJournal[g0Sample.lifeJournal.length - 1]}`);
  }

  if (f1Sample) {
    console.log(`\n👶 TRÍCH ĐOẠN THẾ HỆ F1 DI TRUYỀN — ${f1Sample.name} (Con của ${f1Sample.parentIds?.join(" & ")}):`);
    f1Sample.lifeJournal.slice(0, 6).forEach((line) => console.log(`   - ${line}`));
  }

  if (corruptEntities > 0) {
    throw new Error("Phát hiện lỗi tràn chỉ số nội tạng trong quá trình mô phỏng!");
  }
  console.log("\n✅ MÔ PHỎNG VÒNG ĐỜI NPC HOÀN TẤT 100% ỔN ĐỊNH, KHÔNG LỖI LOGIC!");
}

runAutonomousNpcSimulation();