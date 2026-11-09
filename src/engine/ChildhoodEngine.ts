import type { RootGameState, LockedPersonality } from '../types/game';
import milestonesData from '../data/milestones.json';

export interface MilestoneOption {
  key: 'A' | 'B' | 'C' | 'D';
  archetype: 'INTROVERT' | 'EXTROVERT' | 'DAREDEVIL' | 'EMPATHETIC';
  label: string;
  narrativeExcerpt: string;
  sensoryFeedback: string;
}

export interface MilestoneEvent {
  milestoneIndex: number;
  ageYear: number;
  titleKey: string;
  backgroundAsset: string;
  contextDescription: string;
  options: MilestoneOption[];
}

export interface PersonalityResolution {
  lockedPersonality: LockedPersonality;
  distribution: Record<'A' | 'B' | 'C' | 'D', number>;
  maxCount: number;
  isAmbivert: boolean;
  personalityTitleVi: string;
  personalityDescriptionVi: string;
}

export class ChildhoodEngine {
  public static readonly MILESTONES: MilestoneEvent[] = milestonesData as MilestoneEvent[];

  /**
   * Lấy sự kiện cột mốc theo độ tuổi (1 -> 5)
   */
  public static getMilestoneForAge(age: number): MilestoneEvent | undefined {
    return this.MILESTONES.find((m) => m.milestoneIndex === age);
  }

  /**
   * Thuật toán khóa cứng tính cách vĩnh viễn (Module 3.14):
   * Tổng cộng 5 lựa chọn:
   * Nếu max(N_A, N_B, N_C, N_D) >= 3 (tức >= 60% > 50%) -> Khóa cứng nhóm đó.
   * Nếu phân tán (ví dụ 2A - 2B - 1C) -> Khóa tính cách Ambivert (Linh Hoạt / Trung Hòa).
   */
  public static calculatePersonality(choices: Array<'A' | 'B' | 'C' | 'D'>): PersonalityResolution {
    const counts: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 };
    choices.forEach((choice) => {
      counts[choice] = (counts[choice] || 0) + 1;
    });

    let maxKey: 'A' | 'B' | 'C' | 'D' = 'A';
    let maxCount = 0;

    (Object.keys(counts) as Array<'A' | 'B' | 'C' | 'D'>).forEach((key) => {
      if (counts[key] > maxCount) {
        maxCount = counts[key];
        maxKey = key;
      }
    });

    // Ràng buộc >= 3 lần (60%)
    if (maxCount >= 3) {
      switch (maxKey) {
        case 'A':
          return {
            lockedPersonality: 'INTROVERT',
            distribution: counts,
            maxCount,
            isAmbivert: false,
            personalityTitleVi: 'Hướng Nội & Trầm Lặng (Introvert)',
            personalityDescriptionVi:
              'Có chiều sâu nội tâm, thích làm việc độc lập, kiên trì suy ngẫm giải quyết vấn đề phức tạp, hồi phục năng lượng trong không gian yên bình.',
          };
        case 'B':
          return {
            lockedPersonality: 'EXTROVERT',
            distribution: counts,
            maxCount,
            isAmbivert: false,
            personalityTitleVi: 'Hướng Ngoại & Xã Giao (Extrovert)',
            personalityDescriptionVi:
              'Năng nổ, hoạt bát, dễ dàng tạo dựng mối quan hệ trong xã hội, tiếp thêm sinh lực khi tương tác cùng tập thể.',
          };
        case 'C':
          return {
            lockedPersonality: 'DAREDEVIL',
            distribution: counts,
            maxCount,
            isAmbivert: false,
            personalityTitleVi: 'Phiêu Lưu & Táo Bạo (Daredevil)',
            personalityDescriptionVi:
              'Dũng cảm, quyết đoán, không ngại rủi ro và thử thách mới, phản xạ nhanh nhạy trước các bước ngoặt cuộc sống.',
          };
        case 'D':
          return {
            lockedPersonality: 'EMPATHETIC',
            distribution: counts,
            maxCount,
            isAmbivert: false,
            personalityTitleVi: 'Cẩn Trọng & Thấu Cảm (Empathetic)',
            personalityDescriptionVi:
              'Chu đáo, giàu lòng trắc ẩn, nhạy bén với cảm xúc của người khác, luôn suy nghĩ thấu đáo trước khi đưa ra quyết định.',
          };
      }
    }

    // Trường hợp phân tán (ví dụ: 2A - 2B - 1C)
    return {
      lockedPersonality: 'AMBIVERT',
      distribution: counts,
      maxCount,
      isAmbivert: true,
      personalityTitleVi: 'Linh Hoạt & Trung Hòa (Ambivert)',
      personalityDescriptionVi:
        'Biết cân bằng uyển chuyển giữa không gian cá nhân và giao tiếp tập thể, dễ dàng thích ứng với đa dạng hoàn cảnh xã hội.',
    };
  }

  /**
   * Chuyển giao sang tuổi lên 6 (UC-02):
   * Mở khóa nhận thức độc lập, tiền tiêu vặt theo gia cảnh, mở mục sở thích và kích hoạt đồng hồ thật.
   */
  public static graduateToAgeSix(
    state: RootGameState,
    choices: Array<'A' | 'B' | 'C' | 'D'>
  ): PersonalityResolution {
    const resolution = this.calculatePersonality(choices);

    state.player.identity.exactAgeYears = 6.0;
    state.timeEngine.totalGameDays = 2190; // 6 năm x 365 ngày
    state.player.identity.lockedPersonality = resolution.lockedPersonality;

    // Mở khóa các cờ năng lực
    state.player.capabilities.canActIndependently = true;
    state.player.identity.educationLevel = 'PRIMARY';

    // Bắt đầu chạy đồng hồ thời gian thật (1s = 1 phút game)
    state.timeEngine.timeScale = 1;
    state.timeEngine.exactHour = 7;
    state.timeEngine.exactMinute = 0;

    // Cập nhật chỉ số cơ thể khi lên 6 tuổi (chuẩn thể trạng trung bình)
    state.player.identity.heightCm = 115.0;
    state.player.identity.weightKg = 20.5;
    state.player.identity.currentBmi = Number((20.5 / Math.pow(1.15, 2)).toFixed(1));

    // Thêm ghi chép trang trọng vào Sổ Nhật Ký Đời Người
    const birthYear = state.journal.entries[0]?.year || 1990;
    state.journal.entries.push({
      entryId: `JRN_AGE_6_GRADUATION`,
      year: birthYear + 6,
      age: 6,
      category: 'CHILDHOOD',
      titleKey: 'Tròn 6 Tuổi - Ngày Đầu Bước Vào Trường Lớp',
      narrativeKey: `Đã khép lại thời thơ ấu với thiên hướng tính cách [${resolution.personalityTitleVi}]. Bắt đầu cắp sách tới trường Tiểu học với bao bỡ ngỡ và niềm tự lập đầu đời.`,
    });

    return resolution;
  }
}
