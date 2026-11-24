// [MODULE 6: HỌC VẤN, VIỆC LÀM, TÀI CHÍNH & CHUYỂN VÙNG — THANG ĐỒNG BỘ 0 - 100]

import { EcoLifeJsonDb, translateVi } from '../jsonDatabaseLoader';
import {
  STAT_MAX_VALUE,
  type ActionExecutionResult,
  type HumanEntityState,
  type OrganStateMap,
  type RegionCode,
  type WillBeneficiaryLine
} from '../engineTypes';
import {
  addActiveDebuff,
  applyOrganDeltas,
  calculateActualActionMinutes,
  clampStat100
} from './organAndBiologyModule';
import {
  asHours,
  asRatePerHour,
  asStat100,
  computeDeficitStressDelta
} from '../math/ecoLifeUnifiedFormulas';

export type WorkShiftChoice = 'SHIFT_DAY' | 'SHIFT_EVENING' | 'SHIFT_NIGHT';

export interface WorkShiftInput {
  shift_type: WorkShiftChoice;
  hours_worked?: number;
  rest_days_since_prev_shift?: number;
}

export interface BankOrNotaryInput {
  operation: 'DEPOSIT_SAVINGS' | 'WITHDRAW_SAVINGS' | 'NOTARIZE_WILL';
  amount_vnd?: number;
  will_lines?: WillBeneficiaryLine[];
}

export interface PartTimeJobDefinition {
  part_time_job_id: string;
  title_key: string;
  location_id: string;
  environment_exposure: 'INDOOR' | 'OUTDOOR';
  min_age: number;
  max_age: number;
  duration_minutes: number;
  base_pay_vnd: number;
  energy_cost_pct: number;
  satiety_cost_pct: number;
  allows_criminal_record: boolean;
  available_in_regions: string[];
  organ_wear_per_gig: Partial<Record<keyof OrganStateMap, number>>;
}

export function getPartTimeJobsAvailableAtCurrentSpot(
  entity: HumanEntityState
): PartTimeJobDefinition[] {
  const catalog = (EcoLifeJsonDb.jobs.part_time_jobs || []) as PartTimeJobDefinition[];
  const age = Math.floor(entity.identity_biometrics.exact_age_years);

  return catalog.filter((job) => {
    // Kiểm tra khớp địa điểm hiện tại, vùng miền (RURAL/URBAN) và khung tuổi lao động bán thời gian
    if (job.location_id !== entity.current_location_id) return false;
    if (!job.available_in_regions.includes(entity.current_region)) return false;
    if (age < job.min_age || age > job.max_age) return false;
    return true;
  });
}

/**
 * Thực hiện một ca việc làm bán thời gian / thời vụ (Part-Time Gig) trả tiền mặt ngay sau ca.
 * Thiết kế làm lưới an toàn kinh tế cho học sinh >= 16t, sinh viên và nhóm thất nghiệp cạn ngân sách.
 */
export function executePartTimeJobAction(
  entity: HumanEntityState,
  partTimeJobId: string
): ActionExecutionResult {
  const catalog = (EcoLifeJsonDb.jobs.part_time_jobs || []) as PartTimeJobDefinition[];
  const jobDef = catalog.find((j) => j.part_time_job_id === partTimeJobId);

  // [1. Kiểm tra tồn tại, ràng buộc địa điểm, vùng miền & độ tuổi tối thiểu]
  if (!jobDef) {
    return {
      ok: false,
      message_vi: 'Không tìm thấy công việc bán thời gian này trong danh mục.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (entity.current_location_id !== jobDef.location_id) {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (!jobDef.available_in_regions.includes(entity.current_region)) {
    return {
      ok: false,
      message_vi: 'Khu vực hiện tại chưa có dịch vụ việc làm bán thời gian này.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const age = Math.floor(entity.identity_biometrics.exact_age_years);
  if (age < jobDef.min_age || age > jobDef.max_age) {
    return {
      ok: false,
      message_vi: `Công việc bán thời gian này yêu cầu độ tuổi từ ${jobDef.min_age} đến ${jobDef.max_age} tuổi.`,
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  // Kiểm tra sức khỏe tối thiểu để không ngất xỉu ngay lúc nhận việc
  if (entity.hidden_black_box.energy_sleep_pct <= 15.0) {
    return {
      ok: false,
      message_vi: 'Cơ thể quá kiệt sức buồn ngủ, không thể nhận thêm ca làm thời vụ lúc này.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  // [2. Tính tiền công theo vùng miền, thời lượng và tiêu hao sinh học]
  const regionWageMult =
    EcoLifeJsonDb.regions.region_types[entity.current_region].base_wage_multiplier || 1.0;
  const actualPayVnd = Math.round(jobDef.base_pay_vnd * regionWageMult);
  const gigHours = jobDef.duration_minutes / 60.0;

  // [3. Cập nhật tiền mặt, chỉ số năng lượng, độ no, nội tạng & bộ đếm giờ làm tuần (Burnout)]
  entity.cash_vnd = entity.cash_vnd + actualPayVnd;
  entity.hidden_black_box.energy_sleep_pct = clampStat100(
    entity.hidden_black_box.energy_sleep_pct - jobDef.energy_cost_pct
  );
  entity.hidden_black_box.satiety_pct = clampStat100(
    entity.hidden_black_box.satiety_pct - jobDef.satiety_cost_pct
  );
  applyOrganDeltas(entity, jobDef.organ_wear_per_gig);

  const tracker = entity.hidden_black_box.overuse_tracker;
  const burnoutRule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_CLINICAL_BURNOUT;
  tracker.weekly_work_hours = tracker.weekly_work_hours + gigHours;

  let burnoutNote = '';
  if (tracker.weekly_work_hours > burnoutRule.trigger_weekly_work_hours) {
    addActiveDebuff(tracker, 'DEBUFF_CLINICAL_BURNOUT');
    applyOrganDeltas(entity, { brain: burnoutRule.brain_delta_per_work_hour * gigHours });
    burnoutNote = ` ${translateVi(burnoutRule.sensory_monologue_key)}`;
  }

  const elapsedMinutes = calculateActualActionMinutes(
    entity,
    jobDef.duration_minutes,
    false,
    jobDef.environment_exposure === 'OUTDOOR'
  );

  // [4-5. Trả kết quả & kích hoạt tự động lưu ACTION_COMPLETED]
  return {
    ok: true,
    message_vi: `Hoàn thành ca Part-time (${translateVi(jobDef.title_key)}) và nhận ngay +${actualPayVnd.toLocaleString('vi-VN')}đ.${burnoutNote}`,
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: translateVi('ACT_WORK_SHIFT'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeWorkShiftAction(
  entity: HumanEntityState,
  input: WorkShiftInput
): ActionExecutionResult {
  const validWorkplaces = [
    'LOC_WORK_SME',
    'LOC_WORK_OFFICE_MNC',
    'LOC_WORK_SME_FACTORY',
    'LOC_VEHICLE_REPAIR',
    'LOC_BANK_FINANCE'
  ];

  if (!validWorkplaces.includes(entity.current_location_id)) {
    return {
      ok: false,
      message_vi: 'Hãy di chuyển đến đúng nơi làm việc trước khi chấm công vào ca.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (entity.identity_biometrics.exact_age_years < 18) {
    return {
      ok: false,
      message_vi: 'Chưa đủ 18 tuổi để ký hợp đồng lao động chính thức.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const shiftHours = input.hours_worked || 4;
  const shiftRule = EcoLifeJsonDb.jobs.shift_schedules[input.shift_type];
  const regionWageMult =
    EcoLifeJsonDb.regions.region_types[entity.current_region].base_wage_multiplier || 1.0;

  const baseShiftPayVnd =
    entity.current_location_id === 'LOC_WORK_OFFICE_MNC' ? 650000 : 320000;
  const actualPayVnd = Math.round(
    baseShiftPayVnd * (shiftHours / 4.0) * shiftRule.pay_multiplier * regionWageMult
  );

  entity.cash_vnd = entity.cash_vnd + actualPayVnd;

  // Đi làm ca bình thường tiêu hao năng lượng sinh học và chỉ mòn rất nhẹ cơ-xương-khớp/não
  // (tổn thương thực thể mạnh chỉ kích hoạt khi cố làm trong trạng thái kiệt sức < 40/100 hoặc tăng ca Burnout)
  entity.hidden_black_box.energy_sleep_pct = clampStat100(
    entity.hidden_black_box.energy_sleep_pct - shiftHours * 2.2
  );
  const exhaustionBrainDelta = computeDeficitStressDelta({
    current_stat: asStat100(entity.hidden_black_box.energy_sleep_pct),
    onset_threshold: asStat100(40.0),
    exponent: 2,
    max_rate_per_hour: asRatePerHour(0.45),
    dt_hours: asHours(shiftHours)
  });
  applyOrganDeltas(entity, {
    brain: -0.15 + exhaustionBrainDelta,
    musculoskeletal: -0.2
  });

  // Ca đêm tiêu hao thêm -15 điểm năng lượng giấc ngủ trên thang 0-100 do đảo ngược nhịp sinh học
  if (input.shift_type === 'SHIFT_NIGHT') {
    entity.hidden_black_box.energy_sleep_pct = clampStat100(
      entity.hidden_black_box.energy_sleep_pct - 15.0
    );
  }

  const tracker = entity.hidden_black_box.overuse_tracker;
  const burnoutRule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_CLINICAL_BURNOUT;
  const shockRule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_CIRCADIAN_SHOCK;
  tracker.weekly_work_hours = tracker.weekly_work_hours + shiftHours;

  let warningText = '';

  if (input.shift_type === 'SHIFT_NIGHT') {
    tracker.consecutive_night_shifts = tracker.consecutive_night_shifts + 1;
  } else if (input.shift_type === 'SHIFT_DAY') {
    const restDays = input.rest_days_since_prev_shift ?? 0;
    if (
      tracker.consecutive_night_shifts >= shockRule.min_consecutive_night_shifts &&
      restDays < shockRule.required_rest_days_before_day_shift
    ) {
      addActiveDebuff(tracker, 'DEBUFF_CIRCADIAN_SHOCK');
      tracker.circadian_shock_hours_left = shockRule.shock_duration_hours;
      entity.happiness_score = clampStat100(
        entity.happiness_score + shockRule.happiness_delta_on_trigger
      );
      warningText = ` ${translateVi(shockRule.sensory_monologue_key)}`;
    }
    tracker.consecutive_night_shifts = 0;
  }

  if (tracker.weekly_work_hours > burnoutRule.trigger_weekly_work_hours) {
    addActiveDebuff(tracker, 'DEBUFF_CLINICAL_BURNOUT');
    applyOrganDeltas(entity, { brain: burnoutRule.brain_delta_per_work_hour * shiftHours });
    entity.happiness_score = clampStat100(
      entity.happiness_score + burnoutRule.happiness_delta_per_shift
    );
    warningText = `${warningText} ${translateVi(burnoutRule.sensory_monologue_key)}`;
  }

  return {
    ok: true,
    message_vi: `Hoàn thành ca làm việc (${translateVi(shiftRule.name_key)}) và nhận +${actualPayVnd.toLocaleString('vi-VN')}đ.${warningText}`,
    minutes_elapsed: calculateActualActionMinutes(entity, shiftHours * 60, false, false),
    cutscene_caption_vi: translateVi('ACT_WORK_SHIFT'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeStudyAtSchoolAction(
  entity: HumanEntityState,
  currentMonth: number
): ActionExecutionResult {
  const schoolLocations = [
    'LOC_SCHOOL_PRIMARY',
    'LOC_SCHOOL_SECONDARY',
    'LOC_SCHOOL_HIGHSCHOOL',
    'LOC_UNIVERSITY_VOCATIONAL'
  ];

  if (!schoolLocations.includes(entity.current_location_id)) {
    return {
      ok: false,
      message_vi: 'Hãy tới đúng Trường học hoặc Trung tâm đào tạo để tham gia lớp học.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const age = entity.identity_biometrics.exact_age_years;
  if (age <= 17 && (currentMonth === 6 || currentMonth === 7)) {
    return {
      ok: false,
      message_vi: 'Hiện đang trong kỳ nghỉ hè (Tháng 6 - Tháng 7), trường phổ thông không có tiết học.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  // Học tập trên lớp bình thường tiêu hao năng lượng tinh thần (không trừ thẳng tế bào Não gây suy tạng ở trẻ lớp 1)
  // Chỉ bào mòn Não nếu học sinh thức khuya cố học trong tình trạng kiệt sức (energy_sleep_pct < 35)
  entity.hidden_black_box.energy_sleep_pct = clampStat100(
    entity.hidden_black_box.energy_sleep_pct - 2.5
  );
  const exhaustedStudyBrainDelta = computeDeficitStressDelta({
    current_stat: asStat100(entity.hidden_black_box.energy_sleep_pct),
    onset_threshold: asStat100(35.0),
    exponent: 2,
    max_rate_per_hour: asRatePerHour(0.4),
    dt_hours: asHours(1.0)
  });
  if (exhaustedStudyBrainDelta < 0) {
    applyOrganDeltas(entity, { brain: exhaustedStudyBrainDelta });
  }

  // Học tập trên lớp cộng +4/100 vào kỹ năng Quản lý thời gian (chạm 100 thì mở khóa)
  entity.hidden_black_box.time_management_pct = clampStat100(
    entity.hidden_black_box.time_management_pct + 4.0
  );
  if (entity.hidden_black_box.time_management_pct >= STAT_MAX_VALUE) {
    entity.capability_flags.is_time_management_unlocked = true;
  }

  return {
    ok: true,
    message_vi: `${entity.identity_biometrics.full_name} hoàn thành tiết học trên lớp.`,
    minutes_elapsed: calculateActualActionMinutes(entity, 60, true, false),
    cutscene_caption_vi: translateVi('ACT_STUDY_BOOK'),
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

export function executeBankOrNotaryAction(
  entity: HumanEntityState,
  input: BankOrNotaryInput,
  sessionWillLines: WillBeneficiaryLine[]
): ActionExecutionResult {
  if (entity.current_location_id !== 'LOC_BANK_FINANCE') {
    return {
      ok: false,
      message_vi: 'Hãy đến Ngân Hàng & Phòng Công Chứng (LOC_BANK_FINANCE) để giao dịch.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (input.operation === 'DEPOSIT_SAVINGS') {
    const amt = Math.max(0, Math.round(input.amount_vnd || 0));
    if (amt <= 0 || entity.cash_vnd < amt) {
      return {
        ok: false,
        message_vi: translateVi('err_insufficient_cash'),
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }
    entity.cash_vnd = entity.cash_vnd - amt;
    entity.bank_savings_vnd = entity.bank_savings_vnd + amt;
    return {
      ok: true,
      message_vi: `Đã gửi tiết kiệm ${amt.toLocaleString('vi-VN')}đ vào sổ ngân hàng.`,
      minutes_elapsed: 25,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  if (input.operation === 'WITHDRAW_SAVINGS') {
    const amt = Math.max(0, Math.round(input.amount_vnd || 0));
    if (amt <= 0 || entity.bank_savings_vnd < amt) {
      return {
        ok: false,
        message_vi: 'Số dư sổ tiết kiệm không đủ để rút.',
        minutes_elapsed: 0,
        cutscene_caption_vi: null,
        auto_save_trigger: null
      };
    }
    entity.bank_savings_vnd = entity.bank_savings_vnd - amt;
    entity.cash_vnd = entity.cash_vnd + amt;
    return {
      ok: true,
      message_vi: `Đã rút ${amt.toLocaleString('vi-VN')}đ tiền mặt từ sổ tiết kiệm.`,
      minutes_elapsed: 25,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  const notaryFee = EcoLifeJsonDb.bankingHousing.will_and_inheritance.notary_fee_vnd;
  if (entity.cash_vnd < notaryFee) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - notaryFee;
  sessionWillLines.length = 0;
  if (input.will_lines && input.will_lines.length > 0) {
    for (const line of input.will_lines) {
      sessionWillLines.push(line);
    }
  }

  return {
    ok: true,
    message_vi: `Đã lập và công chứng Di chúc hợp pháp (-${notaryFee.toLocaleString('vi-VN')}đ).`,
    minutes_elapsed: 60,
    cutscene_caption_vi: null,
    auto_save_trigger: 'ACTION_COMPLETED',
    journal_entry_added_vi: 'Tới Phòng Công Chứng lập Di chúc phân chia di sản cho người thân.'
  };
}

export function executeRegionMigrationAction(
  entity: HumanEntityState,
  targetRegion: RegionCode
): ActionExecutionResult {
  if (entity.current_region === targetRegion) {
    return {
      ok: false,
      message_vi: 'Bạn hiện đã sinh sống tại khu vực này rồi.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const migrationDef = EcoLifeJsonDb.regions.migration_actions.find(
    (m) => m.from_region === entity.current_region && m.to_region === targetRegion
  );
  if (!migrationDef) {
    return {
      ok: false,
      message_vi: 'Không tìm thấy tuyến xe chuyển vùng phù hợp.',
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (entity.identity_biometrics.exact_age_years < migrationDef.min_age) {
    return {
      ok: false,
      message_vi: `Phải đủ ${migrationDef.min_age} tuổi mới có thể tự lập chuyển vùng sinh sống.`,
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  if (entity.cash_vnd < migrationDef.ticket_cost_vnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - migrationDef.ticket_cost_vnd;
  entity.current_region = targetRegion;
  entity.current_location_id = 'LOC_HOME';
  entity.current_sub_node_id = 'HOME_LIVING_ROOM';

  const logVi = translateVi(migrationDef.journal_log_entry_key);
  return {
    ok: true,
    message_vi: logVi,
    minutes_elapsed: migrationDef.travel_duration_minutes,
    cutscene_caption_vi: translateVi('ACT_TRAVEL_ROAD'),
    auto_save_trigger: 'ACTION_COMPLETED',
    journal_entry_added_vi: logVi
  };
}