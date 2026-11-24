// [MODULE 5: Y TẾ, BỆNH LÝ & HỒ SƠ BỆNH ÁN]
// Ràng buộc cốt lõi:
// 1. Hiệu thuốc tây (LOC_PHARMACY): 15p bốc thuốc OTC theo triệu chứng mơ hồ (nhẹ ORANGE hên xui, nặng RED vô hiệu & hại Gan).
// 2. Bệnh viện (LOC_HOSPITAL): 360p xét nghiệm 6 tạng chính xác, in vật phẩm Bệnh án (ITEM_MEDICAL_REPORT) vào túi đồ, mở khóa thuốc kê đơn Rx.
// 3. Cai nghiện chuyên khoa: Chỉ thực hiện tại LOC_HOSPITAL.

import { EcoLifeJsonDb, translateVi } from '../jsonDatabaseLoader';
import type {
  ActionExecutionResult,
  HumanEntityState,
  MedicalDiagnosisLine,
  OrganStateMap,
  OwnedInventoryItemInstance
} from '../engineTypes';
import {
  addActiveDebuff,
  applyOrganDeltas,
  calculateActualActionMinutes,
  clampNumber,
  findWeakestOrgan,
  removeActiveDebuff
} from './organAndBiologyModule';

// ============================================================================
// 1. HIỆU THUỐC TÂY (LOC_PHARMACY): THUỐC GIẢM ĐAU & BỐC THUỐC OTC HÊN XUI
// ============================================================================

export function executePharmacyOtcAction(
  entity: HumanEntityState,
  otcMode: 'PAINKILLER' | 'SYMPTOM_GUESS_OTC'
): ActionExecutionResult {
  if (entity.current_location_id !== 'LOC_PHARMACY') {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const priceVnd = otcMode === 'PAINKILLER' ? 45000 : 85000;
  if (entity.cash_vnd < priceVnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - priceVnd;
  const elapsedMinutes = calculateActualActionMinutes(entity, 15, false, false);
  const tracker = entity.hidden_black_box.overuse_tracker;

  // --- NHÁNH A: Thuốc giảm đau tức thì (có kiểm tra lạm dụng từ liều thứ 2 trong 24h) ---
  if (otcMode === 'PAINKILLER') {
    const rule = EcoLifeJsonDb.overuseDebuffs.overuse_debuffs.DEBUFF_PAINKILLER_OVERUSE;
    tracker.painkiller_doses_last_24h = tracker.painkiller_doses_last_24h + 1;

    if (tracker.painkiller_doses_last_24h >= rule.trigger_doses_in_24h) {
      // Lạm dụng thuốc giảm đau -> lờn thuốc (che đau còn 3h), đánh mạnh vào Gan & Dạ dày
      addActiveDebuff(tracker, 'DEBUFF_PAINKILLER_OVERUSE');
      entity.hidden_black_box.painkiller_masked_hours_left = rule.overused_mask_hours;
      applyOrganDeltas(entity, {
        liver: rule.overused_liver_delta,
        digestive: rule.overused_digestive_delta
      });
      entity.happiness_score = clampNumber(entity.happiness_score + rule.happiness_delta, 0, 100);

      return {
        ok: true,
        message_vi: translateVi(rule.sensory_monologue_key),
        minutes_elapsed: elapsedMinutes,
        cutscene_caption_vi: null,
        auto_save_trigger: 'ACTION_COMPLETED'
      };
    }

    entity.hidden_black_box.painkiller_masked_hours_left = rule.normal_mask_hours;
    applyOrganDeltas(entity, { liver: rule.normal_liver_delta });
    return {
      ok: true,
      message_vi: translateVi('mono_symptom_masked_by_painkiller'),
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  // --- NHÁNH B: Bốc thuốc OTC theo triệu chứng mơ hồ ---
  const { organKey, lowestScore } = findWeakestOrgan(entity.hidden_black_box.organs);

  // Bệnh nặng mức ĐỎ (< 25%) -> Thuốc OTC vô hiệu hoàn toàn và làm hại Gan nặng hơn
  if (lowestScore < 25.0) {
    applyOrganDeltas(entity, { liver: -5.0 });
    return {
      ok: true,
      message_vi:
        'Bốc thuốc ngoài hiệu thuốc uống mãi không dứt cơn đau, ngược lại bụng còn nôn nao khó chịu hơn — bệnh đã nặng, cần tới Bệnh Viện xét nghiệm ngay!',
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  // Bệnh nhẹ mức CAM/VÀNG (25% - 64.9%) -> Hên xui 55% hợp thuốc đỡ bệnh, 45% lệch thuốc hại Gan
  if (lowestScore < 65.0) {
    if (Math.random() < 0.55) {
      applyOrganDeltas(entity, { [organKey]: 8.0, liver: -1.0 });
      return {
        ok: true,
        message_vi: 'Uống liều thuốc bốc theo triệu chứng thấy cơn khó chịu dịu đi rõ rệt.',
        minutes_elapsed: elapsedMinutes,
        cutscene_caption_vi: null,
        auto_save_trigger: 'ACTION_COMPLETED'
      };
    }

    applyOrganDeltas(entity, { liver: -3.5 });
    return {
      ok: true,
      message_vi: 'Uống liều thuốc OTC không đúng căn nguyên, triệu chứng chẳng mấy thuyên giảm.',
      minutes_elapsed: elapsedMinutes,
      cutscene_caption_vi: null,
      auto_save_trigger: 'ACTION_COMPLETED'
    };
  }

  return {
    ok: true,
    message_vi: 'Cơ thể vốn đang ổn định, chỉ mua thêm ít vitamin bổ sung.',
    minutes_elapsed: elapsedMinutes,
    cutscene_caption_vi: null,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

// ============================================================================
// 2. BỆNH VIỆN ĐA KHOA (LOC_HOSPITAL): XÉT NGHIỆM 360P & IN BỆNH ÁN VÀO TÚI ĐỒ
// ============================================================================

const ORGAN_CLINICAL_LABELS: Record<keyof OrganStateMap, string> = {
  brain: 'Não bộ & Thần kinh',
  heart: 'Tim mạch',
  lungs: 'Hệ Hô hấp (Phổi)',
  liver: 'Gan & Chức năng thải độc',
  digestive: 'Dạ dày & Tiêu hóa',
  musculoskeletal: 'Cơ - Xương - Khớp',
  kidneys: 'Thận & Tiết niệu',
  integumentary_skin: 'Da liễu'
};

export function executeHospitalFullExamAction(
  entity: HumanEntityState,
  examDateStr: string
): ActionExecutionResult {
  if (entity.current_location_id !== 'LOC_HOSPITAL') {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const baseHospitalFee = 800000;
  const discountRate = entity.has_social_insurance
    ? EcoLifeJsonDb.bankingHousing.tax_and_social_insurance.social_insurance
        .hospital_bill_discount_rate
    : 0.0;
  const finalFeeVnd = Math.round(baseHospitalFee * (1.0 - discountRate));

  if (entity.cash_vnd < finalFeeVnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  // [Trừ tiền & cố định 360 phút xét nghiệm bệnh viện]
  entity.cash_vnd = entity.cash_vnd - finalFeeVnd;
  entity.capability_flags.is_biometrics_decoded = true;
  entity.hidden_black_box.painkiller_masked_hours_left = 0.0;

  // Xây dựng bảng kết quả chẩn đoán y khoa không hiện % thô
  const diagnoses: MedicalDiagnosisLine[] = [];
  const organKeys = Object.keys(entity.hidden_black_box.organs) as Array<keyof OrganStateMap>;
  for (const key of organKeys) {
    const score = entity.hidden_black_box.organs[key];
    let severity: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
    let noteVi = 'Chỉ số trong ngưỡng an toàn.';
    if (score < 25.0) {
      severity = 'CRITICAL';
      noteVi = 'Tổn thương nghiêm trọng, bắt buộc dùng thuốc đặc trị kê đơn (Rx) ngay!';
    } else if (score < 55.0) {
      severity = 'WARNING';
      noteVi = 'Có dấu hiệu suy giảm chức năng, cần điều trị và nghỉ ngơi theo phác đồ.';
    }
    diagnoses.push({
      organ_key: key,
      organ_label_vi: ORGAN_CLINICAL_LABELS[key],
      severity_tag: severity,
      clinical_note_vi: noteVi
    });
  }

  // [Bắt buộc in vật phẩm Bệnh án ITEM_MEDICAL_REPORT lưu vào túi đồ]
  const reportItem: OwnedInventoryItemInstance = {
    instance_id: `MED_REPORT_${Date.now()}`,
    item_def_id: 'ITEM_MEDICAL_REPORT',
    display_name_key: `Phiếu Kết Quả Khám Bệnh (${examDateStr})`,
    category: 'MEDICAL',
    usage_type: 'DURABLE_REUSABLE',
    size_class: 'PORTABLE_CARRY',
    weight_kg: 0.1,
    current_durability_pct: 100.0,
    max_durability_cap_pct: 100.0,
    medical_report_date_str: examDateStr,
    medical_diagnoses: diagnoses
  };
  entity.inventory_items.push(reportItem);

  return {
    ok: true,
    message_vi: `Hoàn tất xét nghiệm tại Bệnh Viện (-${finalFeeVnd.toLocaleString('vi-VN')}đ). Đã in Phiếu Kết Quả Khám Bệnh lưu vào túi đồ và mở khóa thuốc kê đơn Rx.`,
    minutes_elapsed: 360,
    cutscene_caption_vi: translateVi('ACT_HOSPITAL_EXAM'),
    auto_save_trigger: 'ACTION_COMPLETED',
    journal_entry_added_vi: `Tới Bệnh Viện Đa Khoa thăm khám tổng quát và nhận Phiếu Kết Quả Khám Bệnh.`
  };
}

// ============================================================================
// 3. MUA & DÙNG THUỐC KÊ ĐƠN (Rx) — BẮT BUỘC CÓ ITEM_MEDICAL_REPORT
// ============================================================================

export function executeBuyAndUsePrescriptionRxAction(
  entity: HumanEntityState
): ActionExecutionResult {
  if (
    entity.current_location_id !== 'LOC_HOSPITAL' &&
    entity.current_location_id !== 'LOC_PHARMACY'
  ) {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  // [Chốt chặn bắt buộc]: Không có Phiếu Khám Bệnh trong túi đồ -> Nhà thuốc từ chối bán thuốc kê đơn
  const hasMedicalReport = entity.inventory_items.some(
    (item) => item.item_def_id === 'ITEM_MEDICAL_REPORT'
  );
  if (!hasMedicalReport) {
    return {
      ok: false,
      message_vi: translateVi('err_prescription_missing'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const rxPriceVnd = entity.has_social_insurance ? 180000 : 450000;
  if (entity.cash_vnd < rxPriceVnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - rxPriceVnd;
  const { organKey } = findWeakestOrgan(entity.hidden_black_box.organs);
  applyOrganDeltas(entity, { [organKey]: 24.0 });

  return {
    ok: true,
    message_vi: `Đã xuất trình Bệnh án để mua và dùng thuốc đặc trị kê đơn (Rx) (-${rxPriceVnd.toLocaleString('vi-VN')}đ). Cơ quan tổn thương bắt đầu hồi phục rõ rệt.`,
    minutes_elapsed: 20,
    cutscene_caption_vi: null,
    auto_save_trigger: 'ACTION_COMPLETED'
  };
}

// ============================================================================
// 4. CAI NGHIỆN CHUYÊN KHOA TẠI BỆNH VIỆN (LOC_HOSPITAL)
// ============================================================================

export function executeHospitalAddictionRehabAction(
  entity: HumanEntityState
): ActionExecutionResult {
  const rehab = EcoLifeJsonDb.overuseDebuffs.rehab_treatment_rules;
  if (entity.current_location_id !== rehab.location_id) {
    return {
      ok: false,
      message_vi: translateVi('err_location_mismatch'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  const discountRate = entity.has_social_insurance
    ? EcoLifeJsonDb.bankingHousing.tax_and_social_insurance.social_insurance
        .hospital_bill_discount_rate
    : 0.0;
  const finalCostVnd = Math.round(rehab.cost_vnd * (1.0 - discountRate));

  if (entity.cash_vnd < finalCostVnd) {
    return {
      ok: false,
      message_vi: translateVi('err_insufficient_cash'),
      minutes_elapsed: 0,
      cutscene_caption_vi: null,
      auto_save_trigger: null
    };
  }

  entity.cash_vnd = entity.cash_vnd - finalCostVnd;
  const tracker = entity.hidden_black_box.overuse_tracker;
  tracker.nicotine_tolerance = Math.max(0, tracker.nicotine_tolerance - rehab.tolerance_reduction_flat);
  tracker.alcohol_tolerance = Math.max(0, tracker.alcohol_tolerance - rehab.tolerance_reduction_flat);
  removeActiveDebuff(tracker, 'DEBUFF_NICOTINE_WITHDRAWAL');
  removeActiveDebuff(tracker, 'DEBUFF_ALCOHOL_WITHDRAWAL');
  removeActiveDebuff(tracker, 'DEBUFF_ALCOHOL_OVERUSE');

  return {
    ok: true,
    message_vi: translateVi(rehab.journal_log_entry_key),
    minutes_elapsed: rehab.duration_minutes,
    cutscene_caption_vi: translateVi('ACT_HOSPITAL_EXAM'),
    auto_save_trigger: 'ACTION_COMPLETED',
    journal_entry_added_vi: translateVi(rehab.journal_log_entry_key)
  };
}