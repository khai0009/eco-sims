import type { RootGameState, SensoryColor } from './game';

export type EventSeverity = 'RED_DANGER' | 'BLUE_OPPORTUNITY' | 'GREY_NEUTRAL';

export interface EventOptionOutcome {
  deltaTimeMinutes: number;
  deltaCash: number;
  organDeltas?: Partial<Record<'brain' | 'heart' | 'lungs' | 'liver' | 'digestive' | 'musculoskeletal', number>>;
  deltaHappinessIndex?: number;
  deltaTraumaPoints?: number;
  addItems?: string[];
  removeInstanceIds?: string[];
  journalLog?: {
    category: string;
    titleKey: string;
    narrativeKey: string;
  };
}

export interface GameEventOption {
  key: 'A' | 'B' | 'C' | 'D';
  labelKey: string;
  isDefaultFailure: boolean;
  requiredCondition?: (state: RootGameState) => boolean;
  outcomes: EventOptionOutcome;
}

export interface SuddenGameEvent {
  eventId: string;
  titleKey: string;
  descriptionKey: string;
  category: 'ROAD_TRAFFIC' | 'HOME_LIFE' | 'WORKPLACE' | 'SCHOOL_ACADEMIC' | 'MEDICAL_HEALTH';
  severity: EventSeverity;
  baseTimerSec: number; // 3 đến 15 giây
  options: GameEventOption[];
}
