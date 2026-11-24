// [HẠT NHÂN TOÁN HỌC TỔNG QUÁT & RÀNG BUỘC ĐƠN VỊ — ECO-LIFE V3.3]
// Nguyên tắc:
// 1. Khóa cứng đơn vị ngay tại lúc biên dịch bằng Branded Types (không thể truyền nhầm Phút vào Giờ hay Điểm 0-100 vào Tỷ lệ 0-1).
// 2. Gom toàn bộ các chuỗi if / else rải rác về 8 phương trình liên tục có kiểm soát miền giá trị (bounded & smooth).
// 3. Thuần hàm toán học không tác dụng phụ (Pure Functions) — dễ kiểm chứng bằng Unit Test & Monte Carlo.

// ============================================================================
// 1. HỆ KIỂU ĐƠN VỊ VẬT LÝ & CHỈ SỐ (COMPILE-TIME DIMENSIONAL CONSTRAINTS)
// ============================================================================

declare const __unitBrand: unique symbol;
export type UnitValue<U extends string> = number & { readonly [__unitBrand]: U };

export type Minutes = UnitValue<'min'>;
export type Hours = UnitValue<'h'>;
export type Days = UnitValue<'d'>;
export type Years = UnitValue<'yr'>;
export type Seconds = UnitValue<'s'>;

export type Stat100 = UnitValue<'pt_0_100'>;
export type StatDelta = UnitValue<'delta_pt'>;
export type Norm01 = UnitValue<'norm_0_1'>;
export type Probability01 = UnitValue<'prob_0_1'>;
export type Multiplier = UnitValue<'mult'>;

export type RatePerHour = UnitValue<'pt_per_h'>;
export type RatePerDay = UnitValue<'pt_per_d'>;
export type RatePerYear = UnitValue<'pt_per_yr'>;

export type Kilometers = UnitValue<'km'>;
export type KmPerHour = UnitValue<'km_per_h'>;
export type Liters = UnitValue<'L'>;
export type LitersPerKm = UnitValue<'L_per_km'>;
export type WearPerKm = UnitValue<'pt_per_km'>;

export type Kilograms = UnitValue<'kg'>;
export type Centimeters = UnitValue<'cm'>;
export type BmiKgPerM2 = UnitValue<'kg_per_m2'>;
export type Vnd = UnitValue<'vnd'>;

// ============================================================================
// 2. HÀM ĐÓNG GÓI & CHUYỂN ĐỔI ĐƠN VỊ AN TOÀN (UNIT CONSTRUCTORS & CONVERTERS)
// ============================================================================

function sanitizeFinite(raw: number, fallback: number = 0): number {
  return Number.isFinite(raw) ? raw : fallback;
}

export function clampRange(val: number, minVal: number, maxVal: number): number {
  const safe = sanitizeFinite(val, minVal);
  if (safe < minVal) return minVal;
  if (safe > maxVal) return maxVal;
  return Math.round(safe * 10000) / 10000;
}

export function round2(val: number): number {
  return Math.round(sanitizeFinite(val, 0) * 100) / 100;
}

// Bộ khởi tạo đơn vị (ràng buộc miền giá trị ngay khi đưa số thô vào hạt nhân)
export const asMinutes = (v: number): Minutes => Math.max(0, sanitizeFinite(v)) as Minutes;
export const asHours = (v: number): Hours => Math.max(0, sanitizeFinite(v)) as Hours;
export const asDays = (v: number): Days => Math.max(0, sanitizeFinite(v)) as Days;
export const asYears = (v: number): Years => Math.max(0, sanitizeFinite(v)) as Years;
export const asSeconds = (v: number): Seconds => Math.max(0, sanitizeFinite(v)) as Seconds;

export const asStat100 = (v: number): Stat100 => round2(clampRange(v, 0, 100)) as Stat100;
export const asStatDelta = (v: number): StatDelta => round2(sanitizeFinite(v)) as StatDelta;
export const asNorm01 = (v: number): Norm01 => clampRange(v, 0, 1) as Norm01;
export const asProbability01 = (v: number): Probability01 =>
  clampRange(v, 0, 1) as Probability01;
export const asMultiplier = (v: number): Multiplier =>
  Math.max(0, sanitizeFinite(v, 1)) as Multiplier;

export const asRatePerHour = (v: number): RatePerHour => sanitizeFinite(v) as RatePerHour;
export const asRatePerDay = (v: number): RatePerDay => sanitizeFinite(v) as RatePerDay;
export const asRatePerYear = (v: number): RatePerYear => sanitizeFinite(v) as RatePerYear;

export const asKilometers = (v: number): Kilometers =>
  Math.max(0, sanitizeFinite(v)) as Kilometers;
export const asKmPerHour = (v: number): KmPerHour =>
  Math.max(0.1, sanitizeFinite(v, 0.1)) as KmPerHour;
export const asLiters = (v: number): Liters => Math.max(0, sanitizeFinite(v)) as Liters;
export const asLitersPerKm = (v: number): LitersPerKm =>
  Math.max(0, sanitizeFinite(v)) as LitersPerKm;
export const asWearPerKm = (v: number): WearPerKm =>
  Math.max(0, sanitizeFinite(v)) as WearPerKm;

export const asKilograms = (v: number): Kilograms =>
  Math.max(0, sanitizeFinite(v)) as Kilograms;
export const asCentimeters = (v: number): Centimeters =>
  Math.max(1, sanitizeFinite(v, 1)) as Centimeters;
export const asVnd = (v: number): Vnd => Math.max(0, Math.round(sanitizeFinite(v))) as Vnd;

// Chuyển đổi thứ nguyên chuẩn
export const minutesToHours = (m: Minutes): Hours => (m / 60.0) as Hours;
export const hoursToMinutes = (h: Hours): Minutes => (h * 60.0) as Minutes;
export const stat100ToNorm01 = (s: Stat100): Norm01 => clampRange(s / 100.0, 0, 1) as Norm01;

// Áp dụng biến thiên StatDelta vào Stat100 luôn giữ chặt trong [0, 100]
export function applyStatDelta(current: Stat100, delta: StatDelta): Stat100 {
  return asStat100(current + delta);
}

// ============================================================================
// 3. CÔNG THỨC 1: HÀM ÁP LỰC THIẾU HỤT LIÊN TỤC (DEFICIT STRESS LAW)
// ============================================================================
// Φ(x; θ, p) = clamp_[0,1]((θ - x) / θ)^p
// ΔS [pt] = - k_max [pt/h] * Φ(x; θ, p) [1] * Δt [h]

export interface DeficitStressParams {
  current_stat: Stat100;
  onset_threshold: Stat100;
  exponent: number; // p = 1 (tuyến tính), p = 2 (tăng tốc bậc hai khi tiệm cận 0)
  max_rate_per_hour: RatePerHour; // độ lớn tốc độ bào mòn tối đa khi x = 0 (>= 0)
  dt_hours: Hours;
}

export function computeDeficitIntensity(
  currentStat: Stat100,
  onsetThreshold: Stat100,
  exponent: number = 1
): Norm01 {
  if (onsetThreshold <= 0 || currentStat >= onsetThreshold) {
    return asNorm01(0);
  }
  const linearDeficit = (onsetThreshold - currentStat) / onsetThreshold;
  const safeExp = Math.max(0.5, sanitizeFinite(exponent, 1));
  return asNorm01(Math.pow(clampRange(linearDeficit, 0, 1), safeExp));
}

export function computeDeficitStressDelta(params: DeficitStressParams): StatDelta {
  const intensity = computeDeficitIntensity(
    params.current_stat,
    params.onset_threshold,
    params.exponent
  );
  // Thứ nguyên: [pt/h] * [1] * [h] = [pt]
  return asStatDelta(-Math.abs(params.max_rate_per_hour) * intensity * params.dt_hours);
}

/**
 * Suy giảm tuyến tính đơn thuần theo giờ: ΔS [pt] = rate [pt/h] * Δt [h]
 */
export function computeLinearHourDelta(ratePerHour: RatePerHour, dtHours: Hours): StatDelta {
  return asStatDelta(ratePerHour * dtHours);
}

/**
 * Suy giảm tuyến tính theo ngày: ΔS [pt] = rate [pt/d] * Δd [d]
 */
export function computeLinearDayDelta(ratePerDay: RatePerDay, dtDays: Days): StatDelta {
  return asStatDelta(ratePerDay * dtDays);
}

// ============================================================================
// 4. CÔNG THỨC 2: TRẦN SỨC KHỎE THEO TUỔI & TÁI TẠO NỘI CÂN BẰNG (HOMEOSTASIS)
// ============================================================================

export function computeAgeHealthCap(
  ageYears: Years,
  senescenceStartAge: Years = asYears(60),
  annualDecayRate: RatePerYear = asRatePerYear(2.0),
  youthPeakCap: Stat100 = asStat100(94.0),
  floorCap: Stat100 = asStat100(10.0)
): Stat100 {
  // Số năm đã bước vào giai đoạn lão hóa (bắt đầu từ đúng tuổi senescenceStartAge)
  const seniorYears = Math.max(0, Math.floor(ageYears) - (senescenceStartAge - 1));
  // Thứ nguyên: [pt] - [pt/yr] * [yr] = [pt]
  const rawCap = youthPeakCap - Math.abs(annualDecayRate) * seniorYears;
  return asStat100(clampRange(rawCap, floorCap, youthPeakCap));
}

export interface HomeostaticRegenParams {
  current_organ: Stat100;
  age_years: Years;
  sleep_hours: Hours;
  regen_rate_per_hour: RatePerHour;
  critical_floor?: Stat100; // Dưới ngưỡng này (bệnh nặng RED) cơ thể không tự hồi khi ngủ, buộc đi viện
}

export function computeHomeostaticRegenDelta(params: HomeostaticRegenParams): StatDelta {
  const critFloor = params.critical_floor ?? asStat100(25.0);
  if (params.current_organ < critFloor || params.sleep_hours <= 0) {
    return asStatDelta(0);
  }

  const cap = computeAgeHealthCap(params.age_years);
  if (params.current_organ >= cap) {
    return asStatDelta(0);
  }

  // Tốc độ hồi giảm dần mượt khi càng gần trần sức khỏe theo tuổi: (1 - 0.5 * S / cap)
  const diminishingFactor = 1.0 - 0.5 * (params.current_organ / Math.max(1, cap));
  const rawGain = Math.abs(params.regen_rate_per_hour) * params.sleep_hours * diminishingFactor;
  const boundedGain = Math.min(cap - params.current_organ, rawGain);
  return asStatDelta(boundedGain);
}

// ============================================================================
// 5. CÔNG THỨC 3: THỜI LƯỢNG THAO TÁC TỔNG QUÁT (UNIFIED ACTION DURATION)
// ============================================================================

export interface UnifiedActionDurationParams {
  base_minutes: Minutes;
  time_management_pct: Stat100;
  energy_sleep_pct: Stat100;
  extra_multipliers: Multiplier[];
  debuff_multipliers: Multiplier[];
  max_debuff_cap?: Multiplier;
}

export function computeUnifiedActionMinutes(params: UnifiedActionDurationParams): Minutes {
  // 1. Kỹ năng quản lý thời gian: giảm mượt độ trôi lố từ 1.25x (0pt) xuống 1.00x (100pt)
  const timeSkillRatio = stat100ToNorm01(params.time_management_pct);
  const mSkill = 1.0 + 0.25 * (1.0 - timeSkillRatio);

  // 2. Mệt mỏi thiếu ngủ: dưới 55pt bắt đầu chậm mượt tối đa +45% (tại 0pt)
  const fatigueDeficit = computeDeficitIntensity(params.energy_sleep_pct, asStat100(55.0), 1);
  const mFatigue = 1.0 + 0.45 * fatigueDeficit;

  // 3. Tích các hệ số cản trở vật lý/đặc tính (Khó đọc, quá tải kg...)
  let mExtra = 1.0;
  for (const m of params.extra_multipliers) {
    mExtra = mExtra * Math.max(0.1, m);
  }

  // 4. Cộng dồn phần dư của các debuff lạm dụng, có chặn trần để không kéo dài vô hạn
  const maxDebuff = params.max_debuff_cap ?? asMultiplier(2.5);
  let debuffSum = 1.0;
  for (const dm of params.debuff_multipliers) {
    debuffSum = debuffSum + Math.max(0, dm - 1.0);
  }
  const mDebuff = clampRange(debuffSum, 1.0, maxDebuff);

  // Thứ nguyên: [min] * [1] * [1] * [1] * [1] = [min]
  const rawMinutes = params.base_minutes * mSkill * mFatigue * mExtra * mDebuff;
  return asMinutes(Math.max(1, Math.round(rawMinutes)));
}

// ============================================================================
// 6. CÔNG THỨC 4 & 5: ĐỘNG HỌC DI CHUYỂN, NHIÊN LIỆU, HAO MÒN & XÁC SUẤT TAI NẠN
// ============================================================================

export interface TravelKinematicsParams {
  distance_km: Kilometers;
  speed_kmh: KmPerHour;
  traffic_multiplier: Multiplier;
  weather_multiplier: Multiplier;
  waiting_minutes: Minutes;
}

export function computeTravelMinutes(params: TravelKinematicsParams): Minutes {
  // Thứ nguyên: ([km] / [km/h]) * 60 [min/h] * [1] * [1] + [min] = [min]
  const travelHours = params.distance_km / params.speed_kmh;
  const movingMinutes = travelHours * 60.0 * params.traffic_multiplier * params.weather_multiplier;
  return asMinutes(movingMinutes + params.waiting_minutes);
}

export function computeFuelConsumedLiters(
  distanceKm: Kilometers,
  consumptionPerKm: LitersPerKm
): Liters {
  // Thứ nguyên: [km] * [L/km] = [L]
  return asLiters(round2(distanceKm * consumptionPerKm));
}

export function computeVehiclePartWearDelta(
  distanceKm: Kilometers,
  baseWearPerKm: WearPerKm,
  tierWearMultiplier: Multiplier,
  weatherWearMultiplier: Multiplier
): StatDelta {
  // Thứ nguyên: -[km] * [pt/km] * [1] * [1] = [pt]
  return asStatDelta(-distanceKm * baseWearPerKm * tierWearMultiplier * weatherWearMultiplier);
}

export interface StructuralAccidentParams {
  env_hazard_factor: Multiplier; // >= 1.0 (1.0 trời quang -> 3.0 mưa bão ngập)
  brakes_durability: Stat100;
  tires_durability: Stat100;
  energy_sleep_pct: Stat100;
  is_intoxicated: boolean;
  has_required_license: boolean;
  safety_skill_divisor?: number; // Mặc định 18.0
}

/**
 * Xác suất tai nạn cấu trúc bão hòa P = 1 - exp(-(H * W * I) / K) luôn thuộc [0, 1).
 * Đảm bảo hội tụ đủ 3 nhóm biến số (Môi trường × Độ mòn xe × Suy giảm con người).
 */
export function computeStructuralAccidentProbability(
  params: StructuralAccidentParams
): Probability01 {
  // Độ mòn phương tiện tăng mượt khi phanh hoặc lốp xuống dưới 50pt
  const brakeWearDeficit = computeDeficitIntensity(params.brakes_durability, asStat100(50.0), 1.5);
  const tireWearDeficit = computeDeficitIntensity(params.tires_durability, asStat100(50.0), 1.5);
  const wearFactor = 1.0 + 3.0 * brakeWearDeficit + 2.5 * tireWearDeficit;

  // Suy giảm con người từ thiếu ngủ (< 45pt), say rượu và thiếu bằng lái
  const sleepImpairment = computeDeficitIntensity(params.energy_sleep_pct, asStat100(45.0), 1.5);
  const alcoholBonus = params.is_intoxicated ? 3.5 : 0.0;
  const licenseBonus = params.has_required_license ? 0.0 : 1.5;
  const humanImpairment = 1.0 + 2.5 * sleepImpairment + alcoholBonus + licenseBonus;

  const divisor = Math.max(1.0, params.safety_skill_divisor ?? 18.0);
  const lambda = (params.env_hazard_factor * wearFactor * humanImpairment) / divisor;
  return asProbability01(1.0 - Math.exp(-lambda));
}

// ============================================================================
// 7. CÔNG THỨC 6: CỬA SỔ PHẢN XẠ SỰ KIỆN & ĐÓNG BĂNG PTSD (ADDENDUM 01)
// ============================================================================

export interface EventWindowParams {
  base_seconds: Seconds;
  years_experience: Years;
  brain_stat: Stat100;
  ptsd_trauma_stat: Stat100;
  is_danger_red_event: boolean;
}

export function computeEventDecisionWindow(params: EventWindowParams): {
  effective_seconds: Seconds;
  ptsd_freeze_seconds: Seconds;
} {
  const brainNorm = stat100ToNorm01(params.brain_stat);
  const traumaNorm = stat100ToNorm01(params.ptsd_trauma_stat);

  // Hệ số PTSD gia tốc mũ 1.5 theo Addendum 01 Module A.2: (1 - Ψ/100)^1.5
  const traumaRetained = Math.pow(Math.max(0.05, 1.0 - traumaNorm), 1.5);
  const expFactor = 1.0 + 0.1 * params.years_experience;

  // Đóng băng 2.0s thực khi gặp Sự kiện Đỏ với sang chấn >= 30pt
  const freezeSeconds =
    params.is_danger_red_event && params.ptsd_trauma_stat >= 30.0 ? asSeconds(2.0) : asSeconds(0.0);

  // Thứ nguyên: [s] * [1] * [1] * [1] - [s] = [s], kẹp chặt trong [3s, 15s]
  const rawSeconds =
    params.base_seconds * expFactor * brainNorm * traumaRetained - freezeSeconds;
  const boundedSeconds = Math.round(clampRange(rawSeconds, 3.0, 15.0) * 10) / 10;

  return {
    effective_seconds: asSeconds(boundedSeconds),
    ptsd_freeze_seconds: freezeSeconds
  };
}

// ============================================================================
// 8. CÔNG THỨC 7 & 8: LƯỢNG TỬ HÓA 5 MÀU CẢM QUAN, BMI & TẢI TRỌNG ĐỘNG
// ============================================================================

/**
 * Công thức lượng tử hóa khép kín thay cho 5 nhánh if/else:
 * L(S) = clamp_[1,5](5 - floor(max(0, S - 5) / 20))
 * - [85, 100] -> 1 (BLUE)
 * - [65, 84.99] -> 2 (GREEN)
 * - [45, 64.99] -> 3 (YELLOW)
 * - [25, 44.99] -> 4 (ORANGE)
 * - [0, 24.99] -> 5 (RED)
 */
export function quantizeStatToSensoryLevel(score: Stat100): 1 | 2 | 3 | 4 | 5 {
  const bucket = Math.floor(Math.max(0, score - 5.0) / 20.0);
  const level = Math.round(clampRange(5 - bucket, 1, 5));
  return level as 1 | 2 | 3 | 4 | 5;
}

export function computeBmiKgPerM2(weightKg: Kilograms, heightCm: Centimeters): BmiKgPerM2 {
  const heightM = heightCm / 100.0;
  // Thứ nguyên: [kg] / [m^2] = [kg/m^2]
  return round2(weightKg / (heightM * heightM)) as BmiKgPerM2;
}

export function computeDynamicCarryLimitKg(
  baseHandKg: Kilograms,
  intactBonusKgList: Kilograms[],
  ageYears: Years,
  seniorMultiplier: Multiplier
): Kilograms {
  let sumKg: number = baseHandKg;
  for (const bonus of intactBonusKgList) {
    sumKg = sumKg + bonus;
  }
  const ageFactor = ageYears >= 60 ? seniorMultiplier : 1.0;
  return asKilograms(Math.round(sumKg * ageFactor * 10) / 10);
}

// ============================================================================
// 9. CÔNG THỨC 9: CHỈ SỐ BẤT BÌNH ĐẲNG TÀI SẢN GINI & PHÂN TÍCH PHÂN HÓA
// ============================================================================
// G = [ Σ_{i=1..n} (2i - n - 1) * x_(i) ] / [ n * Σ_{i=1..n} x_(i) ] ∈ [0, 1]
// Không thứ nguyên (Norm01): 0.00 = bình đẳng tuyệt đối, ~0.30-0.42 = phân hóa lành mạnh, > 0.55 = phân hóa cực đoan.

export interface WealthDistributionStats {
  population_count: number;
  total_wealth_vnd: Vnd;
  mean_vnd: Vnd;
  median_vnd: Vnd;
  min_vnd: Vnd;
  max_vnd: Vnd;
  gini_index: Norm01;
  at_risk_count: number;
  at_risk_ratio_pct: Stat100;
}

export function computeGiniCoefficient(values: readonly number[]): Norm01 {
  const n = values.length;
  // Quần thể rỗng hoặc chỉ có 1 cá thể thì không có bất bình đẳng (G = 0)
  if (n <= 1) {
    return asNorm01(0);
  }

  const sorted = values
    .map((v) => Math.max(0, sanitizeFinite(v, 0)))
    .sort((a, b) => a - b);

  let totalSum = 0;
  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    totalSum = totalSum + sorted[i];
    // Thứ hạng 1-based là (i + 1) -> hệ số (2 * (i + 1) - n - 1) = (2 * i - n + 1)
    weightedSum = weightedSum + (2 * i - n + 1) * sorted[i];
  }

  // Nếu toàn xã hội đều có tài sản bằng 0đ thì Gini = 0
  if (totalSum <= 0) {
    return asNorm01(0);
  }

  const rawGini = weightedSum / (n * totalSum);
  return asNorm01(Math.round(clampRange(rawGini, 0, 1) * 1000) / 1000);
}

export function computeWealthDistributionStats(
  wealthList: readonly number[],
  povertyThresholdVnd: Vnd = asVnd(2000000)
): WealthDistributionStats {
  const n = wealthList.length;
  if (n === 0) {
    return {
      population_count: 0,
      total_wealth_vnd: asVnd(0),
      mean_vnd: asVnd(0),
      median_vnd: asVnd(0),
      min_vnd: asVnd(0),
      max_vnd: asVnd(0),
      gini_index: asNorm01(0),
      at_risk_count: 0,
      at_risk_ratio_pct: asStat100(0)
    };
  }

  const sorted = wealthList
    .map((v) => Math.max(0, Math.round(sanitizeFinite(v, 0))))
    .sort((a, b) => a - b);

  let totalSum = 0;
  let atRiskCount = 0;
  for (let i = 0; i < n; i++) {
    totalSum = totalSum + sorted[i];
    // Cá thể có tiền mặt thấp hơn ngưỡng sinh tồn (mặc định 2.000.000đ) thuộc nhóm rủi ro cần việc Part-time
    if (sorted[i] < povertyThresholdVnd) {
      atRiskCount = atRiskCount + 1;
    }
  }

  const mid = Math.floor(n / 2);
  const medianVal =
    n % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);

  return {
    population_count: n,
    total_wealth_vnd: asVnd(totalSum),
    mean_vnd: asVnd(Math.round(totalSum / n)),
    median_vnd: asVnd(medianVal),
    min_vnd: asVnd(sorted[0]),
    max_vnd: asVnd(sorted[n - 1]),
    gini_index: computeGiniCoefficient(sorted),
    at_risk_count: atRiskCount,
    at_risk_ratio_pct: asStat100((atRiskCount / n) * 100.0)
  };
}

// ============================================================================
// 10. CÔNG THỨC 10: MỆT MỎI THẦN KINH ĐỘNG, PIN XÃ HỘI & UTILITY AI SCORING
// ============================================================================

export type PersonalityMathCode =
  | 'PERS_INTROVERT'
  | 'PERS_EXTROVERT'
  | 'PERS_DAREDEVIL'
  | 'PERS_EMPATHETIC'
  | 'PERS_AMBIVERT'
  | null;

export interface SocialBatteryRateParams {
  personality: PersonalityMathCode;
  has_asd_trait: boolean;
  is_solo_at_home: boolean;
  is_sleeping: boolean;
}

export interface ActionUtilityParams {
  urgency_score: number; // Điểm cấp thiết của nhu cầu / lịch trình (0 - 120)
  startup_cost: number; // Ma sát khởi động hành động (0 - 50; VD: ngủ rất thấp, nấu ăn/ra ngoài cao)
  cognitive_fatigue_pct: Stat100; // Mệt mỏi thần kinh động (0 - 100)
  personality_affinity?: number; // Thiên hướng tính cách & bối cảnh (-25 đến +25)
}

/**
 * Tính độ mệt mỏi thần kinh động (Derived Cognitive Fatigue) từ năng lượng giấc ngủ và giờ làm tuần.
 * Không lưu thêm trường rác vào Save để tránh phình Schema và lệch đồng bộ chỉ số.
 */
export function computeDerivedCognitiveFatigue(
  energySleepPct: Stat100,
  weeklyWorkHours: Hours
): Stat100 {
  // Năng lượng càng tụt thấp, mệt mỏi thần kinh càng tăng tuyến tính từ 0 lên 100
  const sleepFatigue = 100.0 - energySleepPct;
  // Nếu làm việc vượt quá 44h/tuần (mốc quá tải), cộng thêm áp lực Burnout tối đa +25 điểm
  const overtimeHours = Math.max(0, weeklyWorkHours - 44.0);
  const burnoutBonus = Math.min(25.0, overtimeHours * 1.1);
  return asStat100(sleepFatigue + burnoutBonus);
}

/**
 * Tính tốc độ hồi/hao Pin giao tiếp xã hội [pt/h] theo tính cách (PERS_*), hội chứng ASD và môi trường.
 * - Hướng nội / ASD: Ở nhà một mình giúp hồi pin nhanh; ra nơi đông người làm tụt pin nhanh.
 * - Hướng ngoại: Tương tác ngoài xã hội giúp sạc pin; ở nhà một mình quá lâu làm tụt pin sinh bí bách.
 */
export function computeSocialBatteryHourlyRate(params: SocialBatteryRateParams): RatePerHour {
  // Khi đang ngủ sâu, toàn bộ các tính cách đều hồi nhẹ năng lượng xã hội
  if (params.is_sleeping) {
    return asRatePerHour(4.0);
  }

  let ratePerHour = 0.0;

  if (params.is_solo_at_home) {
    // Ở nhà một mình: Hướng nội & Thấu cảm hồi sức tinh thần; Hướng ngoại dễ thấy cô đơn bí bách
    if (params.personality === 'PERS_INTROVERT') {
      ratePerHour = 7.5;
    } else if (params.personality === 'PERS_EXTROVERT') {
      ratePerHour = -4.5;
    } else if (params.personality === 'PERS_DAREDEVIL') {
      ratePerHour = -2.0;
    } else if (params.personality === 'PERS_EMPATHETIC') {
      ratePerHour = 3.0;
    } else {
      ratePerHour = 2.0;
    }

    // Đặc tính Phổ Tự Kỷ (TRAIT_ASD): Không gian yên tĩnh một mình giúp hồi pin rất nhanh
    if (params.has_asd_trait) {
      ratePerHour = ratePerHour + 4.0;
    }
  } else {
    // Đang ở trường học, công ty, siêu thị hay ngoài đường phố đông người
    if (params.personality === 'PERS_INTROVERT') {
      ratePerHour = -6.0;
    } else if (params.personality === 'PERS_EXTROVERT') {
      ratePerHour = 6.5;
    } else if (params.personality === 'PERS_DAREDEVIL') {
      ratePerHour = 2.5;
    } else if (params.personality === 'PERS_EMPATHETIC') {
      ratePerHour = 1.5;
    } else {
      ratePerHour = -1.5;
    }

    // Đặc tính Phổ Tự Kỷ (TRAIT_ASD): Môi trường đông người ồn ào gây tiêu hao pin xã hội nặng hơn
    if (params.has_asd_trait) {
      ratePerHour = ratePerHour - 5.5;
    }
  }

  return asRatePerHour(ratePerHour);
}

/**
 * Công thức Chấm điểm Hữu dụng (Utility Scoring) cho Bộ não Tự hành AI_AUTONOMOUS:
 *   Utility(a) = Urgency(a) - StartupCost(a) * (1 + Fatigue / 100) + Affinity(a)
 * Khi kiệt sức (Fatigue cao), các hành động tốn công khởi động (nấu ăn, ra đường) bị phạt nặng
 * để nhân vật tự nhiên chọn hành động tối giản (lên giường ngủ thẳng tới sáng).
 */
export function computeActionUtilityScore(params: ActionUtilityParams): number {
  const fatigueScale = 1.0 + stat100ToNorm01(params.cognitive_fatigue_pct);
  const affinity = sanitizeFinite(params.personality_affinity ?? 0, 0);
  const rawScore = params.urgency_score - params.startup_cost * fatigueScale + affinity;
  return round2(rawScore);
}