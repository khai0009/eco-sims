/**
 * QUẢN LÝ GIAO DỊCH THƯƠNG MẠI RÀNG BUỘC ĐỊA ĐIỂM
 * Nghiêm cấm mua đồ không đúng địa điểm chức năng.
 */

/**
 * QUẢN LÝ GIAO DỊCH THƯƠNG MẠI RÀNG BUỘC ĐỊA ĐIỂM
 * Nghiêm cấm mua đồ không đúng địa điểm chức năng.
 */
import type { RootGameState } from '../types/game';

export interface BuyValidationResult {
  canPurchase: boolean;
  errorCode?: 'VENDOR_CLOSED' | 'WRONG_LOCATION' | 'NOT_ENOUGH_CASH' | 'OVERBURDENED' | 'PRESCRIPTION_REQUIRED';
}

export class VendorEngine {
  public static validatePurchase(
    state: RootGameState,
    targetLocationId: string,
    targetSubNodeId: string,
    itemPriceVnd: number,
    itemWeightKg: number,
    requiresPrescription: boolean,
    vendorHours: { openingTime: string; closingTime: string; is24h: boolean }
  ): BuyValidationResult {
    // 1. Kiểm tra vị trí đứng hiện tại
    if (state.activeLocation.locationId !== targetLocationId || state.activeLocation.subNodeId !== targetSubNodeId) {
      return { canPurchase: false, errorCode: 'WRONG_LOCATION' };
    }

    // 2. Kiểm tra giờ mở cửa
    if (!vendorHours.is24h) {
      const currentMinutes = state.timeEngine.exactHour * 60 + state.timeEngine.exactMinute;
      const [oH, oM] = vendorHours.openingTime.split(':').map(Number);
      const [cH, cM] = vendorHours.closingTime.split(':').map(Number);
      const openMinutes = oH * 60 + oM;
      const closeMinutes = cH * 60 + cM;

      if (currentMinutes < openMinutes || currentMinutes > closeMinutes) {
        return { canPurchase: false, errorCode: 'VENDOR_CLOSED' };
      }
    }

    // 3. Kiểm tra tiền mặt
    if (state.player.finances.cashVnd < itemPriceVnd) {
      return { canPurchase: false, errorCode: 'NOT_ENOUGH_CASH' };
    }

    // 4. Kiểm tra tải trọng túi đồ
    const currentWeight = state.player.inventory.items.length * 1.0; // demo ước tính
    if (currentWeight + itemWeightKg > state.player.inventory.maxWeightKg) {
      return { canPurchase: false, errorCode: 'OVERBURDENED' };
    }

    // 5. Kiểm tra toa thuốc bệnh viện
    if (requiresPrescription && !state.player.capabilities.hasHospitalMedicalReport) {
      return { canPurchase: false, errorCode: 'PRESCRIPTION_REQUIRED' };
    }

    return { canPurchase: true };
  }
}
