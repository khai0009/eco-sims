import { useState, useEffect, useRef, useCallback } from 'react';
import type { RootGameState, SensoryColor } from '../types/game';
import type { SuddenGameEvent, GameEventOption } from '../types/events';
import { eventBus } from '../engine/EventBus';
import { TimeEngine } from '../engine/TimeEngine';
import { BlackBoxEngine } from '../engine/BlackBoxEngine';
import { AccidentMatrix } from '../engine/AccidentMatrix';
import { SaveSystem } from '../engine/SaveSystem';

export interface UseLifeSimReturn {
  gameState: RootGameState;
  activeCutscene: { isPlaying: boolean; caption: string; assetKey: string } | null;
  activePopupEvent: {
    event: SuddenGameEvent;
    remainingTime: number;
    initialDuration: number;
    isFrozen: boolean;
  } | null;
  // Các hàm điều khiển từ UI
  setTimeSpeed: (speed: 0 | 1 | 2 | 4) => void;
  navigateToSubNode: (subNodeId: string) => void;
  performHotspotAction: (actionId: string, baseMinutes: number, cutsceneKey?: string, caption?: string) => void;
  resolveEventOption: (optionKey: 'A' | 'B' | 'C' | 'D') => void;
  saveCurrentGame: () => { success: boolean; message?: string };
}

export const useLifeSim = (initialState: RootGameState): UseLifeSimReturn => {
  const [gameState, setGameState] = useState<RootGameState>(initialState);
  const stateRef = useRef<RootGameState>(initialState);
  stateRef.current = gameState;

  const timeEngineRef = useRef<TimeEngine | null>(null);

  // Quản lý Mini Cutscene 3 giây
  const [activeCutscene, setActiveCutscene] = useState<{
    isPlaying: boolean;
    caption: string;
    assetKey: string;
  } | null>(null);

  // Quản lý Popup Sự kiện Khẩn cấp đếm ngược
  const [activePopupEvent, setActivePopupEvent] = useState<{
    event: SuddenGameEvent;
    remainingTime: number;
    initialDuration: number;
    isFrozen: boolean;
  } | null>(null);

  const countdownIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Khởi tạo TimeEngine và lắng nghe Bus
  useEffect(() => {
    const engine = new TimeEngine(stateRef.current);
    timeEngineRef.current = engine;
    engine.start();

    // Lắng nghe nhịp trôi thời gian
    const unsubscribeTime = eventBus.on('TIME_TICK', ({ minutesPassed }) => {
      setGameState((prev) => {
        const next = { ...prev };
        // Suy hao tự nhiên theo nhịp sống
        BlackBoxEngine.applyWearAndDecay(next.player.blackBox.organs, minutesPassed);
        // Cập nhật cảm quan chiếu lên HUD
        next.player.sensoryProjection = BlackBoxEngine.evaluateSensoryProjection(next);
        return { ...next };
      });
    });

    // Lắng nghe kích hoạt sự kiện bất ngờ
    const unsubscribePopup = eventBus.on('POPUP_EVENT_TRIGGERED', ({ event }) => {
      triggerSuddenEvent(event);
    });

    // Lắng nghe khi nhân vật kiệt quệ / qua đời
    const unsubscribeDeath = eventBus.on('PLAYER_DEATH', ({ causeOfDeathKey }) => {
      handleCharacterDeath(causeOfDeathKey);
    });

    return () => {
      engine.stop();
      unsubscribeTime();
      unsubscribePopup();
      unsubscribeDeath();
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // 2. Kích hoạt Popup Sự kiện với cơ chế trừ cửa sổ phản xạ & đóng băng PTSD
  const triggerSuddenEvent = useCallback((event: SuddenGameEvent) => {
    const currentState = stateRef.current;
    
    // Auto-Pause đồng hồ game khi có biến cố đỏ
    if (event.severity === 'RED_DANGER' && timeEngineRef.current) {
      timeEngineRef.current.setSpeed(0);
    }

    // Khóa cờ chống Save-Scumming
    currentState.sessionMeta.isEventLockActive = true;

    // Tính toán cửa sổ phản xạ thực tế qua AccidentMatrix
    const ptsd = currentState.player.blackBox.mental.ptsdTraumaScore;
    const brain = currentState.player.blackBox.organs.brain;
    const { actualWindowSec, isFrozen } = AccidentMatrix.calculateReactionWindow(
      event.baseTimerSec,
      ptsd,
      brain
    );

    setActivePopupEvent({
      event,
      remainingTime: actualWindowSec,
      initialDuration: actualWindowSec,
      isFrozen,
    });

    // Bắt đầu đếm ngược thời gian thực (100ms tick)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    const stepMs = 100;
    countdownIntervalRef.current = setInterval(() => {
      setActivePopupEvent((curr) => {
        if (!curr) return null;
        const nextTime = curr.remainingTime - stepMs / 1000;

        if (nextTime <= 0) {
          // Hết giờ: Tự động phạt phương án thất bại mặc định
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          const defaultOpt = curr.event.options.find((o) => o.isDefaultFailure) || curr.event.options[0];
          executeEventResolution(curr.event, defaultOpt.key, true);
          return null;
        }

        return { ...curr, remainingTime: nextTime };
      });
    }, stepMs);
  }, []);

  // 3. Xử lý hoàn tất lựa chọn sự kiện
  const executeEventResolution = useCallback(
    (event: SuddenGameEvent, optionKey: 'A' | 'B' | 'C' | 'D', isTimeout: boolean) => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setActivePopupEvent(null);

      const option = event.options.find((o) => o.key === optionKey);
      if (!option) return;

      const outcome = option.outcomes;

      setGameState((prev) => {
        const next = { ...prev };
        next.sessionMeta.isEventLockActive = false; // Mở khóa lưu game

        // Áp dụng trôi thời gian do sự kiện
        if (outcome.deltaTimeMinutes && timeEngineRef.current) {
          timeEngineRef.current.advanceMinutes(outcome.deltaTimeMinutes);
        }

        // Áp dụng biến thiên tiền tệ
        next.player.finances.cashVnd = Math.max(0, next.player.finances.cashVnd + outcome.deltaCash);

        // Áp dụng biến thiên nội tạng
        if (outcome.organDeltas) {
          Object.entries(outcome.organDeltas).forEach(([organ, delta]) => {
            const orgKey = organ as keyof typeof next.player.blackBox.organs;
            next.player.blackBox.organs[orgKey] = Math.min(
              100,
              Math.max(0, next.player.blackBox.organs[orgKey] + (delta || 0))
            );
          });
        }

        // Tích lũy PTSD Trauma Score
        if (outcome.deltaTraumaPoints) {
          next.player.blackBox.mental.ptsdTraumaScore = Math.min(
            100,
            Math.max(0, next.player.blackBox.mental.ptsdTraumaScore + outcome.deltaTraumaPoints)
          );
        }

        // Ghi nhật ký cuộc đời nếu có
        if (outcome.journalLog) {
          next.journal.entries.push({
            entryId: `JRN_${Date.now()}`,
            year: Math.floor(next.timeEngine.totalGameDays / 365) + 1990,
            age: Math.floor(next.player.identity.exactAgeYears),
            category: outcome.journalLog.category,
            titleKey: outcome.journalLog.titleKey,
            narrativeKey: outcome.journalLog.narrativeKey,
          });
        }

        next.player.sensoryProjection = BlackBoxEngine.evaluateSensoryProjection(next);
        return { ...next };
      });

      eventBus.emit('POPUP_OPTION_SELECTED', { eventId: event.eventId, optionKey, isTimeout });
    },
    []
  );

  const resolveEventOption = useCallback(
    (optionKey: 'A' | 'B' | 'C' | 'D') => {
      if (!activePopupEvent) return;
      executeEventResolution(activePopupEvent.event, optionKey, false);
    },
    [activePopupEvent, executeEventResolution]
  );

  // 4. Xử lý thao tác Point & Click kèm Mini Cutscene 3 giây
  const performHotspotAction = useCallback(
    (actionId: string, baseMinutes: number, cutsceneKey?: string, caption?: string) => {
      if (gameState.sessionMeta.isEventLockActive) return; // Đang kẹt sự kiện

      // Tính toán trôi lố thời gian (Time Overrun) nếu chưa có kỹ năng
      const actualMinutes = timeEngineRef.current
        ? timeEngineRef.current.calculateActionOverrun(baseMinutes)
        : baseMinutes;

      // Kích hoạt Mini Cutscene 3 giây (3000ms), không có lựa chọn
      if (cutsceneKey && caption) {
        setActiveCutscene({
          isPlaying: true,
          caption,
          assetKey: cutsceneKey,
        });

        setTimeout(() => {
          setActiveCutscene(null);
          // Sau khi kết thúc 3s, trừ thời gian và giải quyết kết quả
          if (timeEngineRef.current) {
            timeEngineRef.current.advanceMinutes(actualMinutes);
          }
          eventBus.emit('ACTION_COMPLETED', { actionId, elapsedMinutes: actualMinutes });
        }, 3000);
      } else {
        if (timeEngineRef.current) {
          timeEngineRef.current.advanceMinutes(actualMinutes);
        }
        eventBus.emit('ACTION_COMPLETED', { actionId, elapsedMinutes: actualMinutes });
      }
    },
    [gameState.sessionMeta.isEventLockActive]
  );

  // 5. Điều hướng phòng trong nhà / POI
  const navigateToSubNode = useCallback((subNodeId: string) => {
    setGameState((prev) => ({
      ...prev,
      activeLocation: {
        ...prev.activeLocation,
        subNodeId,
      },
    }));
    eventBus.emit('LOCATION_CHANGED', {
      locationId: stateRef.current.activeLocation.locationId,
      subNodeId,
    });
  }, []);

  // 6. Điều khiển tốc độ
  const setTimeSpeed = useCallback((speed: 0 | 1 | 2 | 4) => {
    if (timeEngineRef.current) {
      timeEngineRef.current.setSpeed(speed);
    }
  }, []);

  // 7. Xử lý nhân vật qua đời
  const handleCharacterDeath = useCallback((causeKey: string) => {
    if (timeEngineRef.current) timeEngineRef.current.setSpeed(0);
    // Lưu chương cuối nhật ký
    setGameState((prev) => {
      const next = { ...prev };
      next.journal.entries.push({
        entryId: `END_${Date.now()}`,
        year: Math.floor(next.timeEngine.totalGameDays / 365) + 1990,
        age: Math.floor(next.player.identity.exactAgeYears),
        category: 'ENDGAME',
        titleKey: 'log_endgame_death_title',
        narrativeKey: causeKey,
      });
      return { ...next };
    });
  }, []);

  // 8. Lưu game chống gian lận
  const saveCurrentGame = useCallback(() => {
    return SaveSystem.saveGame(stateRef.current);
  }, []);

  return {
    gameState,
    activeCutscene,
    activePopupEvent,
    setTimeSpeed,
    navigateToSubNode,
    performHotspotAction,
    resolveEventOption,
    saveCurrentGame,
  };
};
