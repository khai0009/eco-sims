/**
 * TIME ENGINE: 24 phút thực = 24 giờ game.
 * 1s thực = 1 phút game (tại x1).
 */

/**
 * TIME ENGINE: 24 phút thực = 24 giờ game.
 * 1s thực = 1 phút game (tại x1).
 */
import type { RootGameState } from '../types/game';
import { eventBus } from './EventBus';

export class TimeEngine {
  private intervalTimer: ReturnType<typeof setTimeout> | null = null;
  private state: RootGameState;

  constructor(initialState: RootGameState) {
    this.state = initialState;
  }

  public start(): void {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => {
      this.tick();
    }, 1000);
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public setSpeed(scale: 0 | 1 | 2 | 4): void {
    this.state.timeEngine.timeScale = scale;
    eventBus.emit('SPEED_CHANGED', { newSpeed: scale });
  }

  private tick(): void {
    const scale = this.state.timeEngine.timeScale;
    if (scale === 0) return; // Đang tạm dừng

    const deltaGameMinutes = 1 * scale;
    this.advanceMinutes(deltaGameMinutes);
  }

  public advanceMinutes(minutes: number): void {
    let { totalGameDays, exactHour, exactMinute } = this.state.timeEngine;

    exactMinute += minutes;
    while (exactMinute >= 60) {
      exactMinute -= 60;
      exactHour += 1;
    }

    while (exactHour >= 24) {
      exactHour -= 24;
      totalGameDays += 1;
      this.checkAnnualMilestone(totalGameDays);
    }

    this.state.timeEngine.totalGameDays = totalGameDays;
    this.state.timeEngine.exactHour = exactHour;
    this.state.timeEngine.exactMinute = exactMinute;

    eventBus.emit('TIME_TICK', { minutesPassed: minutes });
  }

  public calculateActionOverrun(baseMinutes: number): number {
    const hasSkill = this.state.player.capabilities.isTimeManagementUnlocked;
    if (hasSkill) {
      // Có kỹ năng: thời gian tối ưu, không bị lố
      return Math.round(baseMinutes * 0.85);
    }
    // Chưa có kỹ năng: trôi lố ngẫu nhiên 10% - 60%
    const overrunFactor = 1 + (Math.random() * 0.5 + 0.1);
    return Math.round(baseMinutes * overrunFactor);
  }

  private checkAnnualMilestone(days: number): void {
    const age = Math.floor(days / 365);
    this.state.player.identity.exactAgeYears = Number((days / 365).toFixed(1));
    
    // Mở khóa nhận thức độc lập khi bước sang 6 tuổi
    if (age >= 6 && !this.state.player.capabilities.canActIndependently) {
      this.state.player.capabilities.canActIndependently = true;
    }
  }
}
