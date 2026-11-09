/**
 * TRỤC ĐIỀU PHỐI EVENT-DRIVEN CHÍNH CỦA GAME (PUB/SUB PATTERN)
 */

export type GameEventMap = {
  // Đồng hồ & Vòng lặp
  'TIME_TICK': { minutesPassed: number };
  'SPEED_CHANGED': { newSpeed: 0 | 1 | 2 | 4 };
  
  // Tương tác địa điểm & Không gian
  'LOCATION_CHANGE_REQUEST': { targetLocationId: string; targetSubNodeId: string };
  'LOCATION_CHANGED': { locationId: string; subNodeId: string };
  
  // Hành động & Cutscenes
  'TRIGGER_ACTION': { actionId: string; baseMinutes: number; cutsceneKey?: string };
  'ACTION_COMPLETED': { actionId: string; elapsedMinutes: number };
  
  // Sự kiện ngẫu nhiên & Đếm ngược
  'POPUP_EVENT_TRIGGERED': { event: import('../types/events').SuddenGameEvent };
  'POPUP_OPTION_SELECTED': { eventId: string; optionKey: 'A' | 'B' | 'C' | 'D'; isTimeout: boolean };
  
  // Cơ thể & Hộp đen
  'BLACK_BOX_UPDATED': { worstOrgan: string; worstScore: number };
  'DIAGNOSTIC_COMPLETED': { reportSheetItemId: string };
  'ORGAN_CRITICAL_COLLAPSE': { organ: string };
  
  // Sinh tử & Kết thúc
  'PLAYER_DEATH': { causeOfDeathKey: string };
};

type EventCallback<T> = (data: T) => void;

class GameEventBus {
  private static instance: GameEventBus;
  private listeners: Map<keyof GameEventMap, Set<EventCallback<any>>> = new Map();

  private constructor() {}

  public static getInstance(): GameEventBus {
    if (!GameEventBus.instance) {
      GameEventBus.instance = new GameEventBus();
    }
    return GameEventBus.instance;
  }

  public on<K extends keyof GameEventMap>(event: K, callback: EventCallback<GameEventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  public off<K extends keyof GameEventMap>(event: K, callback: EventCallback<GameEventMap[K]>): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  public emit<K extends keyof GameEventMap>(event: K, data: GameEventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (error) {
          console.error(`[EventBus] Error executing handler for event: ${String(event)}`, error);
        }
      });
    }
  }
}

export const eventBus = GameEventBus.getInstance();
