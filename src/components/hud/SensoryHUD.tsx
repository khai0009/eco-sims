import React from 'react';
import type { RootGameState, SensoryColor } from '../../types/game';

interface SensoryHUDProps {
  state: RootGameState;
  onSetSpeed: (speed: 0 | 1 | 2 | 4) => void;
  onOpenMap: () => void;
  onOpenJournal: () => void;
}

// Bảng màu chuẩn mực theo tài liệu thiết kế
const SENSORY_COLOR_MAP: Record<SensoryColor, { bg: string; text: string; labelVi: string }> = {
  BLUE: { bg: '#3498DB', text: '#FFFFFF', labelVi: 'Xuất Sắc / Viên Mãn' },
  GREEN: { bg: '#2ECC71', text: '#FFFFFF', labelVi: 'Tốt / Vui Vẻ' },
  YELLOW: { bg: '#F1C40F', text: '#2C1810', labelVi: 'Tạm Được / Bình Lặng' },
  ORANGE: { bg: '#E67E22', text: '#FFFFFF', labelVi: 'Không Ổn / Uất Ức' },
  RED: { bg: '#E74C3C', text: '#FFFFFF', labelVi: 'Nguy Kịch / Tuyệt Vọng' },
};

export const SensoryHUD: React.FC<SensoryHUDProps> = ({
  state,
  onSetSpeed,
  onOpenMap,
  onOpenJournal,
}) => {
  const { player, timeEngine, environment } = state;
  const { sensoryProjection, capabilities } = player;

  const healthStyle = SENSORY_COLOR_MAP[sensoryProjection.healthColor];
  const happinessStyle = SENSORY_COLOR_MAP[sensoryProjection.happinessColor];

  // Định dạng tiền tệ LORE_VND
  const formattedCash = new Intl.NumberFormat('vi-VN').format(player.finances.cashVnd) + ' đ';

  return (
    <div className="w-full flex flex-col gap-3 font-serif select-none">
      {/* =========================================================================
          TOP BAR: THỜI GIAN CẢM QUAN, THỜI TIẾT, TIỀN MẶT & ĐIỀU TỐC
          ========================================================================= */}
      <header className="w-full bg-[#E8D7B8] border-2 border-[#5C4033] px-5 py-3 rounded-sm shadow-md flex items-center justify-between">
        {/* Nhận thức Thời Gian & Môi trường */}
        <div className="flex flex-col">
          {capabilities.isClockVisible ? (
            <div className="text-[#3E2723] text-base font-bold">
              Ngày {timeEngine.totalGameDays} •{' '}
              {String(timeEngine.exactHour).padStart(2, '0')}:
              {String(timeEngine.exactMinute).padStart(2, '0')}
            </div>
          ) : (
            <div className="text-[#5D4037] text-sm italic">
              "Trời ngả về chiều, bóng nắng dần tắt trên mái ngói..."
            </div>
          )}

          <div className="text-xs text-[#795548] mt-0.5">
            Thời tiết: {environment.weatherType} • PM2.5: {environment.pm25Value > 100 ? 'Bụi mịt mù' : 'Trong lành'}
          </div>
        </div>

        {/* Tiền mặt & Nút Chức Năng Bản Đồ */}
        <div className="flex items-center gap-5">
          <div className="text-right">
            <span className="block text-[11px] text-[#795548] uppercase tracking-wider">Tiền mặt</span>
            <span className="text-base font-bold text-[#1B5E20]">{formattedCash}</span>
          </div>

          <button
            onClick={onOpenMap}
            className="bg-[#8D6E63] hover:bg-[#6D4C41] text-[#FFF] text-xs px-3.5 py-2 rounded shadow transition active:scale-95 uppercase font-medium"
          >
            ► Ra Bản Đồ
          </button>

          {/* Cụm Nút Tốc Độ */}
          <div className="flex items-center bg-[#D7C4A5] border border-[#5C4033] rounded overflow-hidden">
            {[0, 1, 2, 4].map((scale) => (
              <button
                key={scale}
                onClick={() => onSetSpeed(scale as 0 | 1 | 2 | 4)}
                className={`px-2.5 py-1 text-xs font-mono font-bold transition ${
                  timeEngine.timeScale === scale
                    ? 'bg-[#5C4033] text-[#FFF]'
                    : 'text-[#3E2723] hover:bg-[#C5B08E]'
                }`}
              >
                {scale === 0 ? '❚❚' : `x${scale}`}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* =========================================================================
          BOTTOM BAR: ĐÈN CẢM QUAN 5 MÀU, ĐỘC THOẠI CƠ THỂ & SINH TRẮC HỌC
          ========================================================================= */}
      <footer className="w-full bg-[#E8D7B8] border-2 border-[#5C4033] p-4 rounded-sm shadow-md flex flex-wrap items-center justify-between gap-4">
        {/* Cụm Đèn Cảm Quan Không Số */}
        <div className="flex items-center gap-6">
          {/* Đèn Sức Khỏe */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[#5D4037] font-semibold">Sức Khỏe:</span>
            <div
              className="px-3 py-1 rounded text-xs font-bold shadow-sm"
              style={{ backgroundColor: healthStyle.bg, color: healthStyle.text }}
            >
              ● {healthStyle.labelVi}
            </div>
          </div>

          {/* Đèn Hạnh Phúc */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[#5D4037] font-semibold">Hạnh Phúc:</span>
            <div
              className="px-3 py-1 rounded text-xs font-bold shadow-sm"
              style={{ backgroundColor: happinessStyle.bg, color: happinessStyle.text }}
            >
              ● {happinessStyle.labelVi}
            </div>
          </div>
        </div>

        {/* Độc thoại triệu chứng cơ thể (Bottleneck Monologue) */}
        <div className="flex-1 max-w-md bg-[#F4ECD8] border border-[#A88C6D] px-3.5 py-1.5 rounded text-xs text-[#4E342E] italic">
          "{sensoryProjection.bodyMonologueKey}"
        </div>

        {/* Sinh trắc học & Nhật ký */}
        <div className="flex items-center gap-4">
          <div className="text-right text-xs text-[#5D4037]">
            <span className="block text-[10px] uppercase text-[#8D6E63]">Sinh trắc vóc dáng</span>
            <strong>{sensoryProjection.biometricsDisplayString}</strong>
          </div>

          <button
            onClick={onOpenJournal}
            className="bg-[#5C4033] hover:bg-[#3E2723] text-[#F5EBD7] text-xs px-3.5 py-2 rounded shadow transition active:scale-95"
          >
            📖 Sổ Nhật Ký
          </button>
        </div>
      </footer>
    </div>
  );
};
