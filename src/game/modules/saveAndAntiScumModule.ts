// [MODULE 9: LƯU TRỮ CHỐNG GIAN LẬN (ANTI-SAVE-SCUMMING)]
// Quy tắc bắt buộc:
// 1. Chỉ lưu đúng 3 thời điểm: ACTION_COMPLETED, EVENT_TRIGGERED, APP_EXIT_SUSPEND (không lưu theo phút).
// 2. Khi mở lại game đang kẹt sự kiện (Alt+F4/F5), giữ nguyên đúng sự kiện đó và đặt lại đếm ngược về đúng base_countdown_seconds gốc.

import { EcoLifeJsonDb } from '../jsonDatabaseLoader';
import type {
  ActiveEventPopupDto,
  AutoSaveTriggerReason,
  EcoLifeSavedSessionState
} from '../engineTypes';
import { buildEventPopupDto } from './eventAndSocialModule';

const STORAGE_KEY_PREFIX = 'ECOLIFE_V3_SAVE_';
const ACTIVE_PROFILE_KEY = 'ECOLIFE_V3_ACTIVE_PROFILE';
const PROFILE_INDEX_KEY = 'ECOLIFE_V3_PROFILE_INDEX';

// ============================================================================
// 1. INTERFACE TÓM TẮT HỒ SƠ CHO MÀN HÌNH DANH SÁCH CUỘC ĐỜI
// ============================================================================

export interface SavedProfileSummary {
  profile_id: string;
  full_name: string;
  age_years: number;
  is_deceased: boolean;
  last_saved_unix_ms: number;
}

// ============================================================================
// 2. HÀM LƯU, TẢI, LIỆT KÊ & XÓA PHIÊN CHƠI AN TOÀN
// ============================================================================

export function saveGameSessionImmediately(
  session: EcoLifeSavedSessionState,
  reason: AutoSaveTriggerReason
): void {
  try {
    session.last_saved_unix_ms = Date.now();
    session.last_save_reason = reason;

    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${session.profile_id}`,
      JSON.stringify(session)
    );
    window.localStorage.setItem(ACTIVE_PROFILE_KEY, session.profile_id);

    // Cập nhật danh sách mục lục hồ sơ đã lưu
    const rawIndex = window.localStorage.getItem(PROFILE_INDEX_KEY);
    const idList: string[] = rawIndex ? (JSON.parse(rawIndex) as string[]) : [];
    if (!idList.includes(session.profile_id)) {
      idList.push(session.profile_id);
      window.localStorage.setItem(PROFILE_INDEX_KEY, JSON.stringify(idList));
    }
  } catch {
    // Bỏ qua an toàn nếu trình duyệt ở chế độ chặn localStorage
  }
}

export function loadSavedEcoLifeSession(profileId?: string): {
  session: EcoLifeSavedSessionState | null;
  restoredPopup: ActiveEventPopupDto | null;
} {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { session: null, restoredPopup: null };
    }

    const targetId = profileId || window.localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (!targetId) {
      return { session: null, restoredPopup: null };
    }

    const rawJson = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${targetId}`);
    if (!rawJson) {
      return { session: null, restoredPopup: null };
    }

    const loadedSession = JSON.parse(rawJson) as EcoLifeSavedSessionState;
    let restoredPopup: ActiveEventPopupDto | null = null;

    // [Chốt chống Alt+F4]: Nếu lần tắt trước đang treo Popup sự kiện -> giữ nguyên sự kiện & reset số giây về gốc
    if (loadedSession.pending_popup_event_id) {
      const rawEvt = (EcoLifeJsonDb.allEvents as Array<any>).find(
        (e) => e.event_id === loadedSession.pending_popup_event_id
      );
      if (rawEvt) {
        restoredPopup = buildEventPopupDto(loadedSession.player, rawEvt, 0);
        restoredPopup.effective_countdown_seconds = restoredPopup.base_countdown_seconds;
      }
    }

    return { session: loadedSession, restoredPopup };
  } catch {
    return { session: null, restoredPopup: null };
  }
}

export function listAllSavedProfiles(): SavedProfileSummary[] {
  const summaries: SavedProfileSummary[] = [];
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return summaries;
    }
    const rawIndex = window.localStorage.getItem(PROFILE_INDEX_KEY);
    const idList: string[] = rawIndex ? (JSON.parse(rawIndex) as string[]) : [];

    for (const id of idList) {
      const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as EcoLifeSavedSessionState;
      summaries.push({
        profile_id: parsed.profile_id,
        full_name: parsed.player.identity_biometrics.full_name,
        age_years: Math.floor(parsed.player.identity_biometrics.exact_age_years),
        is_deceased: Boolean(parsed.death_summary?.is_deceased),
        last_saved_unix_ms: parsed.last_saved_unix_ms
      });
    }
  } catch {
    return summaries;
  }

  summaries.sort((a, b) => b.last_saved_unix_ms - a.last_saved_unix_ms);
  return summaries;
}

export function deleteSavedProfile(profileId: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${profileId}`);

    const rawIndex = window.localStorage.getItem(PROFILE_INDEX_KEY);
    if (rawIndex) {
      const idList = (JSON.parse(rawIndex) as string[]).filter((id) => id !== profileId);
      window.localStorage.setItem(PROFILE_INDEX_KEY, JSON.stringify(idList));
    }
    if (window.localStorage.getItem(ACTIVE_PROFILE_KEY) === profileId) {
      window.localStorage.removeItem(ACTIVE_PROFILE_KEY);
    }
  } catch {
    // Bỏ qua an toàn
  }
}