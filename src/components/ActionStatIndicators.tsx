// Component hiển thị cụm Icon chỉ số kèm mũi tên hướng lên (tăng) / hướng xuống (giảm)
// Đặt trực tiếp trên từng nút thao tác (Clean Menu & Nội thất trong phòng).
// Tuân thủ 100% nguyên tắc Cảm Quan Không Số — tuyệt đối không in số % hay số điểm.

import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronsDown,
  ChevronsUp,
  Coins,
  Droplets,
  HeartPulse,
  Home,
  Moon,
  Smile,
  Sparkles,
  Utensils
} from 'lucide-react';
import type { ActionStatIndicatorDto } from '../game/engineTypes';

export interface ActionStatIndicatorsProps {
  indicators: ActionStatIndicatorDto[];
  compact?: boolean;
}

function renderStatIcon(iconName: string) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  if (iconName === 'Utensils') return <Utensils className={cls} />;
  if (iconName === 'Moon') return <Moon className={cls} />;
  if (iconName === 'Droplets') return <Droplets className={cls} />;
  if (iconName === 'Sparkles') return <Sparkles className={cls} />;
  if (iconName === 'Home') return <Home className={cls} />;
  if (iconName === 'Smile') return <Smile className={cls} />;
  if (iconName === 'HeartPulse') return <HeartPulse className={cls} />;
  if (iconName === 'Coins') return <Coins className={cls} />;
  return <BookOpen className={cls} />;
}

function renderDirectionArrow(direction: 'UP' | 'DOWN', intensity: 1 | 2) {
  const cls = 'h-3 w-3 shrink-0 stroke-[2.6]';
  if (direction === 'UP') {
    return intensity === 2 ? <ChevronsUp className={cls} /> : <ArrowUp className={cls} />;
  }
  return intensity === 2 ? <ChevronsDown className={cls} /> : <ArrowDown className={cls} />;
}

export function ActionStatIndicators({
  indicators,
  compact = false
}: ActionStatIndicatorsProps) {
  if (!indicators || indicators.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {indicators.map((ind) => {
        const isUp = ind.direction === 'UP';
        const arrowHintVi = isUp
          ? ind.intensity === 2
            ? 'Tăng mạnh'
            : 'Tăng'
          : ind.intensity === 2
            ? 'Giảm mạnh'
            : 'Giảm';

        return (
          <span
            key={`${ind.stat_id}_${ind.direction}`}
            title={`${ind.label_vi}: ${arrowHintVi}`}
            className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
              isUp
                ? 'border-[#27AE60]/45 bg-[#E7F6EC] text-[#1D7A43]'
                : 'border-[#B8382A]/45 bg-[#FDECE9] text-[#A12C1F]'
            }`}
          >
            {renderStatIcon(ind.icon_name)}
            {renderDirectionArrow(ind.direction, ind.intensity)}
            {!compact && <span className="ml-0.5 hidden sm:inline">{ind.label_vi}</span>}
          </span>
        );
      })}
    </span>
  );
}

export default ActionStatIndicators;