/**
 * HỆ THỐNG LƯU TRỮ VÀ BẢO MẬT CHỐNG SAVE-SCUMMING
 */

/**
 * HỆ THỐNG LƯU TRỮ VÀ BẢO MẬT CHỐNG SAVE-SCUMMING
 */
import type { RootGameState } from '../types/game';

export class SaveSystem {
  private static readonly STORAGE_PREFIX = 'DONG_DOI_SAVE_';

  public static generateSignature(state: RootGameState): string {
    const raw = `${state.sessionMeta.profileId}_${state.timeEngine.totalGameDays}_${state.player.finances.cashVnd}`;
    // Băm chuỗi đơn giản cho client (hoặc băm SHA-256 qua Web Crypto API)
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return `SEC_${Math.abs(hash)}`;
  }

  public static saveGame(state: RootGameState): { success: boolean; message?: string } {
    // NGHIÊM CẤM LƯU KHI SỰ KIỆN KHẨN CẤP ĐANG MỞ
    if (state.sessionMeta.isEventLockActive) {
      return { success: false, message: 'Đang trong tình huống nguy hiểm, không thể lưu game!' };
    }

    state.sessionMeta.antiScumHash = this.generateSignature(state);
    const payload = JSON.stringify(state);
    localStorage.setItem(`${this.STORAGE_PREFIX}${state.sessionMeta.saveSlotId}`, payload);
    return { success: true };
  }

  public static loadGame(slotId: string): RootGameState | null {
    const raw = localStorage.getItem(`${this.STORAGE_PREFIX}${slotId}`);
    if (!raw) return null;

    try {
      const state: RootGameState = JSON.parse(raw);
      const expectedHash = this.generateSignature(state);
      if (state.sessionMeta.antiScumHash !== expectedHash) {
        console.warn('[Anti-Scumming] Dữ liệu lưu đã bị chỉnh sửa bất hợp pháp!');
      }
      return state;
    } catch {
      return null;
    }
  }
}
