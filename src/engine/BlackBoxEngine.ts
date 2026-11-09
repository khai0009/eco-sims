/**
 * BLACK BOX ENGINE: 6 Nội tạng giấu kín.
 * Quy tắc Nút Thắt Cổ Chai (Bottleneck): Đèn màu lấy theo cơ quan yếu nhất.
 */

/**
 * BLACK BOX ENGINE: 6 Nội tạng giấu kín.
 * Quy tắc Nút Thắt Cổ Chai (Bottleneck): Đèn màu lấy theo cơ quan yếu nhất.
 */
import type { OrganBlackBox, SensoryColor, SensoryUIProjection, RootGameState } from '../types/game';
import { eventBus } from './EventBus';

export class BlackBoxEngine {
  public static evaluateSensoryProjection(state: RootGameState): SensoryUIProjection {
    const organs = state.player.blackBox.organs;
    const organEntries = Object.entries(organs) as [keyof OrganBlackBox, number][];

    // Tìm cơ quan có chỉ số thấp nhất
    organEntries.sort((a, b) => a[1] - b[1]);
    const [worstOrgan, worstScore] = organEntries[0];

    // Xác định 5 mốc màu chuẩn
    let healthColor: SensoryColor = 'BLUE';
    if (worstScore < 20) healthColor = 'RED';
    else if (worstScore < 40) healthColor = 'ORANGE';
    else if (worstScore < 60) healthColor = 'YELLOW';
    else if (worstScore < 80) healthColor = 'GREEN';

    // Độc thoại cơ thể theo cơ quan bị đau nhất
    const bodyMonologueKey = this.deriveMonologue(worstOrgan, worstScore, healthColor);

    // Xử lý Hạnh phúc
    const happinessScore = 100 - state.player.blackBox.mental.ptsdTraumaScore - (state.player.blackBox.mental.consecutiveSadnessDays * 2);
    let happinessColor: SensoryColor = 'BLUE';
    if (happinessScore < 20) happinessColor = 'RED';
    else if (happinessScore < 40) happinessColor = 'ORANGE';
    else if (happinessScore < 60) happinessColor = 'YELLOW';
    else if (happinessScore < 80) happinessColor = 'GREEN';

    // Sinh trắc học hiển thị
    let biometricsDisplayString = 'Chưa rõ (chưa đo)';
    if (state.player.capabilities.isBiometricsDecoded) {
      const h = (state.player.identity.heightCm / 100).toFixed(2);
      const w = state.player.identity.weightKg;
      const bmi = state.player.identity.currentBmi.toFixed(1);
      biometricsDisplayString = `${h}m • ${w}kg (BMI: ${bmi})`;
    }

    // Kiểm tra nguy kịch
    if (worstScore <= 0) {
      eventBus.emit('PLAYER_DEATH', { causeOfDeathKey: `DEATH_ORGAN_FAILURE_${worstOrgan.toUpperCase()}` });
    }

    return {
      healthColor,
      happinessColor,
      bodyMonologueKey,
      biometricsDisplayString,
    };
  }

  private static deriveMonologue(organ: keyof OrganBlackBox, score: number, color: SensoryColor): string {
    if (color === 'BLUE' || color === 'GREEN') return 'mono_body_fine';
    switch (organ) {
      case 'liver': return 'mono_liver_ache_nausea';
      case 'heart': return 'mono_heart_palpitation_chest_tight';
      case 'lungs': return 'mono_lungs_short_breath_cough';
      case 'digestive': return 'mono_stomach_burning_cramps';
      case 'brain': return 'mono_brain_dizziness_headache';
      case 'musculoskeletal': return 'mono_spine_joints_stiff';
      default: return 'mono_body_fatigue_general';
    }
  }

  public static applyWearAndDecay(organs: OrganBlackBox, minutesPassed: number): void {
    // Tự nhiên suy hao nhẹ theo thời gian sống (1 ngày game = 1440 phút)
    const decayPerMinute = 0.001;
    (Object.keys(organs) as (keyof OrganBlackBox)[]).forEach(k => {
      organs[k] = Math.max(0, Number((organs[k] - decayPerMinute * minutesPassed).toFixed(3)));
    });
  }
}
