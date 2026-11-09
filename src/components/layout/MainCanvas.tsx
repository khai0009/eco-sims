import React from 'react';
import type { SuddenGameEvent, GameEventOption } from '../../types/events';

interface MainCanvasProps {
  currentSubNodeId: string;
  staticBackgroundAsset: string;
  activeCutscene: { isPlaying: boolean; caption: string; assetKey: string } | null;
  activePopupEvent: {
    event: SuddenGameEvent;
    remainingTime: number;
    initialDuration: number;
    isFrozen: boolean;
  } | null;
  onHotspotClick: (actionId: string, baseMinutes: number, cutsceneKey?: string, caption?: string) => void;
  onSelectEventOption: (key: 'A' | 'B' | 'C' | 'D') => void;
}

export const MainCanvas: React.FC<MainCanvasProps> = ({
  currentSubNodeId,
  staticBackgroundAsset,
  activeCutscene,
  activePopupEvent,
  onHotspotClick,
  onSelectEventOption,
}) => {
  return (
    <div className="relative w-full h-[520px] bg-[#EAD8B7] border-2 border-[#5C4033] rounded-sm shadow-inner overflow-hidden select-none font-serif">
      {/* Lớp nền vân Giấy Dó mực nho */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-all duration-700 filter sepia-[0.35] contrast-[1.05]"
        style={{ backgroundImage: `url('/assets/images/backgrounds/${staticBackgroundAsset}')` }}
      >
        {/* Lớp phủ mực nho tạo sắc độ cổ kính */}
        <div className="absolute inset-0 bg-[#3A2A1A] opacity-15 pointer-events-none mix-blend-multiply" />
      </div>

      {/* =========================================================================
          TRẠNG THÁI 1: KHUNG CẢNH TĨNH & CÁC ĐIỂM TƯƠNG TÁC (HOTSPOTS)
          ========================================================================= */}
      {!activeCutscene && !activePopupEvent && (
        <div className="relative z-10 w-full h-full p-6 flex flex-col justify-between">
          <div className="inline-block bg-[#F4ECD8]/90 border border-[#8C6D53] px-3 py-1.5 rounded text-xs text-[#3E2723] tracking-wider uppercase font-semibold">
            Không Gian: {currentSubNodeId}
          </div>

          {/* Danh sách các tương tác điểm nhấn nhanh trên sân khấu */}
          <div className="flex flex-wrap gap-3 mt-auto">
            {currentSubNodeId === 'HOME_KITCHEN' && (
              <button
                onClick={() =>
                  onHotspotClick(
                    'COOK_SOLO',
                    45,
                    'cutscene_cook_solo.webp',
                    'Đang nấu bữa cơm đạm bạc một mình bên bếp lửa...'
                  )
                }
                className="bg-[#D7C4A5] hover:bg-[#C5B08E] border border-[#5C4033] text-[#2C1810] px-4 py-2 text-sm rounded shadow transition active:scale-95"
              >
                🍳 Nấu bữa trưa (-45p)
              </button>
            )}

            {currentSubNodeId === 'HOME_BATHROOM' && (
              <button
                onClick={() =>
                  onHotspotClick(
                    'MEASURE_BODY',
                    15,
                    'cutscene_scale.webp',
                    'Đang đứng lên bàn cân và đo lại vóc dáng...'
                  )
                }
                className="bg-[#D7C4A5] hover:bg-[#C5B08E] border border-[#5C4033] text-[#2C1810] px-4 py-2 text-sm rounded shadow transition active:scale-95"
              >
                ⚖️ Cân đo thể trạng (-15p)
              </button>
            )}

            {currentSubNodeId === 'HOME_LIVING_ROOM' && (
              <button
                onClick={() =>
                  onHotspotClick(
                    'PET_DOG',
                    20,
                    'cutscene_pet.webp',
                    'Vuốt ve âu yếm người bạn nhỏ trên sàn gạch...'
                  )
                }
                className="bg-[#D7C4A5] hover:bg-[#C5B08E] border border-[#5C4033] text-[#2C1810] px-4 py-2 text-sm rounded shadow transition active:scale-95"
              >
                🐕 Nựng thú cưng (-20p)
              </button>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TRẠNG THÁI 2: MINI CUTSCENE 3 GIÂY - CHỮ ĐỀ TRỰC TIẾP TRÊN MẶT TRANH
          ========================================================================= */}
      {activeCutscene && activeCutscene.isPlaying && (
        <div className="absolute inset-0 z-20 flex flex-col justify-between p-8 bg-black/40 backdrop-blur-[1px] animate-fade-in">
          {/* Dòng chữ đề thơ/lạc khoản mực nho khắc trực tiếp lên góc tranh */}
          <div className="self-end max-w-md bg-[#2C1810]/85 border-l-4 border-[#C5A059] p-4 text-[#F4ECD8] shadow-2xl">
            <p className="text-base italic leading-relaxed tracking-wide font-medium">
              "{activeCutscene.caption}"
            </p>
            <span className="block mt-2 text-[11px] text-[#C5A059] tracking-widest uppercase">
              • Hoạt cảnh đời thường (3 giây) •
            </span>
          </div>

          {/* Thanh chỉ báo thời gian 3s mảnh khảnh chạy ngầm */}
          <div className="w-full bg-[#3E2723]/60 h-1 rounded-full overflow-hidden">
            <div className="h-full bg-[#C5A059] animate-[cutsceneProgress_3s_linear_forwards]" />
          </div>
        </div>
      )}

      {/* =========================================================================
          TRẠNG THÁI 3: HỘP THOẠI SỰ KIỆN BẤT NGỜ (EVENT POPUP) ĐẾM NGƯỢC
          ========================================================================= */}
      {activePopupEvent && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-lg bg-[#F5EBD7] border-4 p-6 shadow-2xl rounded-sm ${
              activePopupEvent.event.severity === 'RED_DANGER'
                ? 'border-[#B71C1C]'
                : activePopupEvent.event.severity === 'BLUE_OPPORTUNITY'
                ? 'border-[#0D47A1]'
                : 'border-[#4A3B32]'
            }`}
          >
            {/* Tiêu đề sự kiện */}
            <div className="flex items-center justify-between pb-3 border-b border-[#8C6D53]">
              <h3
                className={`text-lg font-bold uppercase tracking-wider ${
                  activePopupEvent.event.severity === 'RED_DANGER'
                    ? 'text-[#B71C1C]'
                    : activePopupEvent.event.severity === 'BLUE_OPPORTUNITY'
                    ? 'text-[#0D47A1]'
                    : 'text-[#3E2723]'
                }`}
              >
                {activePopupEvent.event.titleKey}
              </h3>

              {/* Thông báo Đóng Băng Phản Xạ PTSD */}
              {activePopupEvent.isFrozen && (
                <span className="bg-[#B71C1C] text-[#FFF] text-[10px] px-2 py-0.5 rounded font-sans uppercase animate-pulse">
                  ❄ PTSD Đóng Băng (2s)
                </span>
              )}
            </div>

            {/* Nội dung mô tả sự kiện */}
            <p className="py-4 text-[#3E2723] text-sm leading-relaxed">
              {activePopupEvent.event.descriptionKey}
            </p>

            {/* Thanh thời gian đếm ngược trực tiếp */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-[#5D4037] mb-1 font-sans">
                <span>Cửa sổ phản xạ sinh tồn</span>
                <span className="font-bold text-[#B71C1C]">
                  {activePopupEvent.remainingTime.toFixed(1)}s
                </span>
              </div>
              <div className="w-full bg-[#D7C4A5] h-2.5 rounded-full overflow-hidden border border-[#8C6D53]">
                <div
                  className="h-full bg-[#B71C1C] transition-all duration-100 ease-linear"
                  style={{
                    width: `${Math.max(
                      0,
                      (activePopupEvent.remainingTime / activePopupEvent.initialDuration) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Danh sách lựa chọn A / B / C / D */}
            <div className="space-y-2.5">
              {activePopupEvent.event.options.map((opt: GameEventOption) => (
                <button
                  key={opt.key}
                  disabled={activePopupEvent.isFrozen && activePopupEvent.remainingTime > activePopupEvent.initialDuration - 2.0}
                  onClick={() => onSelectEventOption(opt.key)}
                  className={`w-full text-left p-3 text-sm rounded border transition flex items-center justify-between ${
                    opt.isDefaultFailure
                      ? 'bg-[#FFEBEE] border-[#EF9A9A] text-[#B71C1C] hover:bg-[#FFCDD2]'
                      : 'bg-[#EFE3C8] border-[#A88C6D] text-[#2C1810] hover:bg-[#DFD1B3]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span>
                    <strong>[{opt.key}]</strong> {opt.labelKey}
                  </span>
                  {opt.isDefaultFailure && (
                    <span className="text-[10px] uppercase font-sans text-[#C62828] font-bold">
                      Mặc định khi hết giờ
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
