/**
 * ============================================================================
 * ECO-LIFE (DÒNG ĐỜI) - UNIVERSAL SAVE STORAGE ADAPTER (WEB + TAURI PC)
 * ============================================================================
 * Cơ chế:
 *   - Tự động sao lưu toàn bộ trạng thái khi người chơi bấm Lưu hoặc tắt game
 *     (kể cả khi đang mở Popup Sự kiện đếm ngược).
 *   - Khi mở lại game, hệ thống khôi phục nguyên trạng ngay tại đúng khoảnh khắc
 *     đó (bao gồm sự kiện đang hiện và số giây đếm ngược còn lại).
 */

export type SaveTriggerReason = "MANUAL_SAVE" | "ACTION_COMPLETED" | "EVENT_TRIGGERED" | "APP_EXIT_SUSPEND";

export interface SaveSlotMeta {
  slot_id: string;
  character_name: string;
  age_years: number;
  birth_year: number;
  current_game_year: number;
  socioeconomic_origin: "Q1" | "Q2" | "Q3" | "Q4" | "Q5";
  is_deceased: boolean;
  last_saved_unix_ms: number;
  save_trigger_reason?: SaveTriggerReason;
  active_locale: "vi-VN" | "en-US";
}

export interface SuspendedEventSnapshot {
  event_id: string;
  original_countdown_seconds: number;
  ptsd_freeze_remaining_seconds: number;
  captured_at_unix_ms: number;
}

export interface SaveFileEnvelope<TState = Record<string, unknown>> {
  save_format_version: string;
  slot_meta: SaveSlotMeta;
  integrity_envelope: {
    hmac_sha256_signature: string;
    save_counter: number;
  };
  suspended_event_snapshot: SuspendedEventSnapshot | null;
  root_game_state: TState;
}

export function isTauriDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeTauriCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauriInternals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke: <R>(c: string, a?: Record<string, unknown>) => Promise<R> };
  }).__TAURI_INTERNALS__;

  if (!tauriInternals?.invoke) {
    throw new Error("Tauri runtime is not available.");
  }
  return tauriInternals.invoke<T>(cmd, args);
}

export class EcoLifeSaveAdapter {
  private static readonly WEB_SLOTS_KEY = "ecolife_save_slots_v1";
  private static readonly WEB_DATA_PREFIX = "ecolife_slot_data_";
  private static readonly WEB_MEMORIAL_KEY = "ecolife_memorial_books_v1";

  /**
   * 1. SAO LƯU CUỘC ĐỜI (Dùng cho cả Lưu thủ công, Auto-save & Lưu khẩn cấp khi tắt app)
   * Nếu đang có sự kiện bất ngờ chạy đếm ngược, truyền kèm suspendedEvent để lần mở sau tiếp tục đúng giây đó.
   */
  static async saveGameSlot<TState>(
    meta: SaveSlotMeta,
    rootGameState: TState,
    options?: {
      previousCounter?: number;
      triggerReason?: SaveTriggerReason;
      suspendedEvent?: SuspendedEventSnapshot | null;
    }
  ): Promise<{ success: boolean; nextCounter: number }> {
    const nextCounter = (options?.previousCounter ?? 0) + 1;
    const triggerReason = options?.triggerReason ?? "MANUAL_SAVE";
    const suspendedEvent = options?.suspendedEvent ?? null;

    const finalMeta: SaveSlotMeta = {
      ...meta,
      last_saved_unix_ms: Date.now(),
      save_trigger_reason: triggerReason,
    };

    const payloadJson = JSON.stringify({
      root_game_state: rootGameState,
      suspended_event_snapshot: suspendedEvent,
    });

    if (isTauriDesktopRuntime()) {
      // Tầng Rust ký HMAC-SHA256 và ghi nguyên trạng xuống AppData/EcoLife/saves/
      await invokeTauriCommand("tauri_write_signed_save_slot", {
        slotId: finalMeta.slot_id,
        metaJson: JSON.stringify(finalMeta),
        stateJson: JSON.stringify(rootGameState),
        suspendedEventJson: suspendedEvent ? JSON.stringify(suspendedEvent) : null,
        saveCounter: nextCounter,
      });
      return { success: true, nextCounter };
    }

    // Fallback cho Web Browser
    const envelope: SaveFileEnvelope<TState> = {
      save_format_version: "1.1.0",
      slot_meta: finalMeta,
      integrity_envelope: {
        hmac_sha256_signature: `web_dev_checksum_${payloadJson.length}_${nextCounter}`,
        save_counter: nextCounter,
      },
      suspended_event_snapshot: suspendedEvent,
      root_game_state: rootGameState,
    };

    localStorage.setItem(`${this.WEB_DATA_PREFIX}${finalMeta.slot_id}`, JSON.stringify(envelope));
    const slots = await this.listSaveSlots();
    const filtered = slots.filter((s) => s.slot_id !== finalMeta.slot_id);
    filtered.unshift(finalMeta);
    localStorage.setItem(this.WEB_SLOTS_KEY, JSON.stringify(filtered));

    return { success: true, nextCounter };
  }

  /**
   * 2. ĐĂNG KÝ HOOK TỰ ĐỘNG SAO LƯU KHI TẮT GAME (Web & Tauri PC)
   * Gọi hàm này một lần trong App.tsx khi người chơi đang ở trong ván chơi.
   */
  static registerAutoSaveOnExit<TState>(
    getCurrentSnapshot: () => {
      meta: SaveSlotMeta;
      state: TState;
      saveCounter: number;
      activeEvent: SuspendedEventSnapshot | null;
    } | null
  ): () => void {
    const handleExitSave = () => {
      const snap = getCurrentSnapshot();
      if (!snap || snap.meta.is_deceased) return;

      // Ghi đồng bộ ngay lập tức trên Web trước khi tab đóng
      if (!isTauriDesktopRuntime()) {
        const nextCounter = snap.saveCounter + 1;
        const finalMeta: SaveSlotMeta = {
          ...snap.meta,
          last_saved_unix_ms: Date.now(),
          save_trigger_reason: "APP_EXIT_SUSPEND",
        };
        const envelope: SaveFileEnvelope<TState> = {
          save_format_version: "1.1.0",
          slot_meta: finalMeta,
          integrity_envelope: {
            hmac_sha256_signature: `web_exit_checksum_${nextCounter}`,
            save_counter: nextCounter,
          },
          suspended_event_snapshot: snap.activeEvent,
          root_game_state: snap.state,
        };
        localStorage.setItem(`${this.WEB_DATA_PREFIX}${finalMeta.slot_id}`, JSON.stringify(envelope));
        const rawList = localStorage.getItem(this.WEB_SLOTS_KEY);
        const slots: SaveSlotMeta[] = rawList ? JSON.parse(rawList) : [];
        const filtered = slots.filter((s) => s.slot_id !== finalMeta.slot_id);
        filtered.unshift(finalMeta);
        localStorage.setItem(this.WEB_SLOTS_KEY, JSON.stringify(filtered));
      } else {
        // Với Tauri Desktop: Gửi snapshot cuối cùng sang Rust trước khi cửa sổ đóng
        void this.saveGameSlot(snap.meta, snap.state, {
          previousCounter: snap.saveCounter,
          triggerReason: "APP_EXIT_SUSPEND",
          suspendedEvent: snap.activeEvent,
        });
      }
    };

    window.addEventListener("beforeunload", handleExitSave);
    return () => {
      window.removeEventListener("beforeunload", handleExitSave);
    };
  }

  /**
   * 3. TẢI CUỘC ĐỜI & KHÔI PHỤC NGUYÊN TRẠNG NGAY ĐOẠN ĐANG CHƠI
   */
  static async loadGameSlot<TState>(
    slotId: string
  ): Promise<{ envelope: SaveFileEnvelope<TState> | null; tampered: boolean }> {
    if (isTauriDesktopRuntime()) {
      const result = await invokeTauriCommand<{
        raw_envelope_json: string | null;
        is_signature_valid: boolean;
      }>("tauri_read_and_verify_save_slot", { slotId });

      if (!result.raw_envelope_json) return { envelope: null, tampered: false };
      if (!result.is_signature_valid) return { envelope: null, tampered: true };

      return {
        envelope: JSON.parse(result.raw_envelope_json) as SaveFileEnvelope<TState>,
        tampered: false,
      };
    }

    const raw = localStorage.getItem(`${this.WEB_DATA_PREFIX}${slotId}`);
    if (!raw) return { envelope: null, tampered: false };
    return { envelope: JSON.parse(raw) as SaveFileEnvelope<TState>, tampered: false };
  }

  /**
   * 4. LẤY DANH SÁCH CÁC CUỘC ĐỜI ĐÃ LƯU
   */
  static async listSaveSlots(): Promise<SaveSlotMeta[]> {
    if (isTauriDesktopRuntime()) {
      const rawList = await invokeTauriCommand<string>("tauri_list_save_slots");
      return JSON.parse(rawList) as SaveSlotMeta[];
    }
    const raw = localStorage.getItem(this.WEB_SLOTS_KEY);
    return raw ? (JSON.parse(raw) as SaveSlotMeta[]) : [];
  }

  /**
   * 5. LƯU CUỐN NHẬT KÝ ĐỜI NGƯỜI VÀO KỶ NIỆM VĨNH VIỄN (ENDGAME MEMORIAL)
   */
  static async archiveLifeJournalToMemorial<TJournal>(
    memoirId: string,
    journalData: TJournal
  ): Promise<void> {
    if (isTauriDesktopRuntime()) {
      await invokeTauriCommand("tauri_archive_memorial_book", {
        memoirId,
        journalJson: JSON.stringify(journalData),
      });
      return;
    }
    const raw = localStorage.getItem(this.WEB_MEMORIAL_KEY);
    const list: Array<{ memoir_id: string; saved_at: number; data: TJournal }> = raw
      ? JSON.parse(raw)
      : [];
    list.unshift({ memoir_id: memoirId, saved_at: Date.now(), data: journalData });
    localStorage.setItem(this.WEB_MEMORIAL_KEY, JSON.stringify(list));
  }
}