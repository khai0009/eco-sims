/**
 * MA TRẬN TAI NẠN KHÔNG NGẪU NHIÊN & CƠ CHẾ ĐÓNG BĂNG PTSD
 */

export interface AccidentVariables {
  environmentalHazard: number; // Thời tiết, ngập lụt (1.0 - 3.5)
  toolWearFactor: number;       // Độ mòn phanh/lốp xe (1.0 - 5.0)
  humanImpairment: number;      // Say rượu, thức đêm, ốm (1.0 - 8.0)
  drivingSkillYears: number;    // Kinh nghiệm cầm lái
}

export class AccidentMatrix {
  public static calculateAccidentProbability(vars: AccidentVariables): number {
    const numerator = vars.environmentalHazard * vars.toolWearFactor * vars.humanImpairment;
    const denominator = Math.max(1, vars.drivingSkillYears * 1.5 + 2.0);
    const exponent = -(numerator / (denominator * 4.0));
    const probability = 1 - Math.exp(exponent);
    return Math.min(0.98, Math.max(0.01, probability));
  }

  public static calculateReactionWindow(baseTimerSec: number, ptsdScore: number, brainScore: number): {
    actualWindowSec: number;
    isFrozen: boolean;
  } {
    // Nếu PTSD >= 70, kích hoạt Đóng Băng Phản Xạ 2s
    const isFrozen = ptsdScore >= 70;
    const freezePenalty = isFrozen ? 2.0 : 0.0;
    
    const traumaReduction = Math.pow(Math.max(0, 1 - ptsdScore / 100), 1.5);
    const brainFactor = Math.max(0.2, brainScore / 100);

    const actualWindowSec = Math.max(0, (baseTimerSec * traumaReduction * brainFactor) - freezePenalty);
    return {
      actualWindowSec: Number(actualWindowSec.toFixed(2)),
      isFrozen,
    };
  }
}