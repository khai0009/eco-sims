/**
 * ============================================================================
 * ECO-LIFE (DÒNG ĐỜI) - AUTOMATED CROSS-MODULE CONSTRAINT GUARD
 * ============================================================================
 * Mục đích:
 *   Rà soát tự động toàn bộ dữ liệu JSON và trạng thái Runtime để bắt sớm
 *   các lỗi bỏ sót ràng buộc (sai vị trí sự kiện, tràn sức chứa trang phục,
 *   thuốc không khớp bệnh, vật phẩm thiếu điểm bán...).
 */

import type {
  EcoLifeJsonDatabaseBundle,
  EventDefJson,
  RootRuntimeGameState,
} from "./ecoLifeDataDrivenEngine";

export interface ConstraintViolation {
  severity: "ERROR" | "WARNING";
  ruleCode: string;
  targetId: string;
  message: string;
}

export class EcoLifeConstraintGuard {
  /**
   * 1. KIỂM TOÁN TĨNH TOÀN BỘ BUNDLE JSON (Chạy mỗi khi thêm/sửa file JSON)
   */
  static auditStaticJsonDatabase(db: EcoLifeJsonDatabaseBundle): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Ràng buộc 1: Kiểm tra tính nhất quán của Sự kiện (Môi trường vs Danh sách địa điểm)
    for (const ev of db.events) {
      if (
        ev.environment_filter === "OUTDOOR" &&
        ev.trigger_conditions.allowed_location_ids?.includes("LOC_HOME")
      ) {
        violations.push({
          severity: "ERROR",
          ruleCode: "EVT_ENV_LOCATION_MISMATCH",
          targetId: ev.event_id,
          message: `Sự kiện ${ev.event_id} gắn nhãn OUTDOOR nhưng lại cho phép xảy ra tại LOC_HOME.`,
        });
      }

      if (ev.category !== "CHILDHOOD_MILESTONE" && (!ev.choices || ev.choices.length < 2)) {
        violations.push({
          severity: "ERROR",
          ruleCode: "EVT_INSUFFICIENT_CHOICES",
          targetId: ev.event_id,
          message: `Sự kiện ${ev.event_id} phải có ít nhất 2 phương án lựa chọn.`,
        });
      }
    }

    // Ràng buộc 2: Kiểm tra liên kết Bệnh lý <-> Thuốc điều trị
    const allMedicineIds = new Set(db.medicineCatalog.medicines.map((m) => m.medicine_id));
    for (const dis of db.diseaseCatalog.diseases) {
      for (const rxId of dis.hospital_recommended_medicine_ids) {
        if (!allMedicineIds.has(rxId)) {
          violations.push({
            severity: "ERROR",
            ruleCode: "DIS_MISSING_RECOMMENDED_MED",
            targetId: dis.disease_id,
            message: `Bệnh ${dis.disease_id} kê đơn thuốc ${rxId} nhưng mã thuốc này không tồn tại trong medicine_and_treatment_catalog.json.`,
          });
        }
      }
    }

    // Ràng buộc 3: Kiểm tra mỗi vật phẩm trong item.json đều phải có điểm bán/xuất hiện trong item_location.json
    const boundItemIds = new Set(db.itemLocations.map((b) => b.item_def_id));
    for (const item of db.items) {
      if (item.category !== "MEDICAL_REPORT" && !boundItemIds.has(item.item_def_id)) {
        violations.push({
          severity: "WARNING",
          ruleCode: "ITEM_UNBOUND_LOCATION",
          targetId: item.item_def_id,
          message: `Vật phẩm ${item.item_def_id} chưa được khai báo địa điểm xuất hiện/mua bán trong item_location.json.`,
        });
      }
    }

    return violations;
  }

  /**
   * 2. KIỂM TOÁN TRẠNG THÁI RUNTIME (Chạy ngay trong lúc game vận hành để bắt lỗi logic)
   */
  static auditRuntimeState(
    state: RootRuntimeGameState,
    db: EcoLifeJsonDatabaseBundle,
    currentWeightKg: number,
    maxCapacityKg: number
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Kiểm tra 1: Sức chứa túi đồ không được vượt quá giới hạn trang phục đang mặc
    if (currentWeightKg > maxCapacityKg) {
      violations.push({
        severity: "ERROR",
        ruleCode: "INV_OVER_GEAR_CAPACITY",
        targetId: state.player.entity_id,
        message: `Túi đồ đang chứa ${currentWeightKg}kg, vượt quá giới hạn trang phục hiện tại (${maxCapacityKg}kg).`,
      });
    }

    // Kiểm tra 2: Nếu đang bật Popup sự kiện, sự kiện đó phải hợp lệ với vị trí hiện tại
    if (state.active_popup_event) {
      const ev = db.events.find((e) => e.event_id === state.active_popup_event?.event_id);
      if (ev && !this.isEventValidForCurrentLocation(ev, state)) {
        violations.push({
          severity: "ERROR",
          ruleCode: "RUNTIME_EVENT_WRONG_LOCATION",
          targetId: ev.event_id,
          message: `Sự kiện ${ev.event_id} đang bật sai địa điểm (${state.active_location.location_id} - ${state.active_location.environment_exposure}).`,
        });
      }
    }

    // Kiểm tra 3: Không được kẹt Pause (0x) khi đang ở chế độ Lú lẫn tuổi già (Auto-pilot)
    if (state.simulation_mode === "DEMENTIA_AUTOPILOT" && state.speed_multiplier === 0) {
      violations.push({
        severity: "ERROR",
        ruleCode: "DEMENTIA_PAUSE_DEADLOCK",
        targetId: state.player.entity_id,
        message: "Nhân vật đang ở chế độ Lú lẫn Auto-pilot nhưng tốc độ đồng hồ bị kẹt ở 0x (Pause).",
      });
    }

    return violations;
  }

  /**
   * Hàm chốt chặn dùng chung trước khi bật bất kỳ Sự kiện nào lên màn hình
   */
  static isEventValidForCurrentLocation(ev: EventDefJson, state: RootRuntimeGameState): boolean {
    const envOk =
      ev.environment_filter === "BOTH" ||
      ev.environment_filter === state.active_location.environment_exposure;
    if (!envOk) return false;

    const allowedLocs = ev.trigger_conditions.allowed_location_ids;
    if (allowedLocs && allowedLocs.length > 0) {
      if (!allowedLocs.includes(state.active_location.location_id)) {
        return false;
      }
    }
    return true;
  }
}