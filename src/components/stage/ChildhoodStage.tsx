import React, { useState } from 'react';
import { ChildhoodEngine, type MilestoneEvent, type MilestoneOption, type PersonalityResolution } from '../../engine/ChildhoodEngine';

interface ChildhoodStageProps {
  currentMilestoneAge: number; // 1 -> 5
  accumulatedChoices: Array<'A' | 'B' | 'C' | 'D'>;
  onSelectMilestoneChoice: (choiceKey: 'A' | 'B' | 'C' | 'D') => void;
  onFinishGraduationToAge6: () => void;
}

export const ChildhoodStage: React.FC<ChildhoodStageProps> = ({
  currentMilestoneAge,
  accumulatedChoices,
  onSelectMilestoneChoice,
  onFinishGraduationToAge6,
}) => {
  const [selectedOption, setSelectedOption] = useState<MilestoneOption | null>(null);
  const [graduationResult, setGraduationResult] = useState<PersonalityResolution | null>(null);

  const activeMilestone: MilestoneEvent | undefined = ChildhoodEngine.getMilestoneForAge(currentMilestoneAge);

  // Khi người chơi xác nhận lựa chọn của cột mốc
  const handleConfirmChoice = () => {
    if (!selectedOption) return;

    const nextChoices = [...accumulatedChoices, selectedOption.key];
    onSelectMilestoneChoice(selectedOption.key);
    setSelectedOption(null);

    // Nếu đã hoàn tất mốc 5 tuổi -> Hiển thị kết quả khóa tính cách 6 tuổi
    if (currentMilestoneAge >= 5) {
      const res = ChildhoodEngine.calculatePersonality(nextChoices);
      setGraduationResult(res);
    }
  };

  return (
    <div className="relative w-full min-h-[560px] bg-[#E7D6B5] border-4 border-[#4A3222] rounded-sm p-6 flex flex-col justify-between font-serif select-none shadow-2xl overflow-hidden">
      {/* Nền giấy Dó cổ kính */}
      <div className="absolute inset-0 bg-[radial-gradient(#D2B48C_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

      {/* =========================================================================
          TIÊU ĐỀ GIAI ĐOẠN TUỔI THƠ & THANH TIẾN ĐỘ 5 NĂM
          ========================================================================= */}
      <header className="relative z-10 flex flex-wrap items-center justify-between pb-4 border-b-2 border-[#8C6D53]">
        <div>
          <span className="text-[11px] uppercase tracking-widest text-[#795548] font-bold block">
            Giai Đoạn Ấu Thơ (Tua Nhanh Tự Sự • 0 - 5 Tuổi)
          </span>
          <h2 className="text-xl font-bold text-[#2C1810] tracking-wide mt-0.5">
            {activeMilestone ? `Mốc ${activeMilestone.ageYear} Tuổi: ${activeMilestone.titleKey}` : 'Định Hình Tính Cách Đầu Đời'}
          </h2>
        </div>

        {/* Thanh đánh dấu 5 cột mốc tuổi thơ */}
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          {[1, 2, 3, 4, 5].map((age) => {
            const isCompleted = accumulatedChoices.length >= age;
            const isCurrent = currentMilestoneAge === age;
            return (
              <div
                key={age}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition ${
                  isCompleted
                    ? 'bg-[#5C4033] text-[#F5EBD7] border-[#3E2723]'
                    : isCurrent
                    ? 'bg-[#C5A059] text-[#2C1810] border-[#8C6D53] ring-2 ring-[#5C4033] scale-110'
                    : 'bg-[#D7C4A5] text-[#8D6E63] border-[#A88C6D] opacity-60'
                }`}
              >
                {age}t
              </div>
            );
          })}
        </div>
      </header>

      {/* =========================================================================
          NỘI DUNG BỐI CẢNH & KHUNG 4 LỰA CHỌN A / B / C / D
          ========================================================================= */}
      {!graduationResult && activeMilestone && (
        <div className="relative z-10 flex-1 flex flex-col justify-center my-4 space-y-5">
          {/* Hộp mô tả bối cảnh văn tự Dó */}
          <div className="bg-[#F4ECD8]/90 border border-[#8C6D53] p-4 rounded shadow-sm">
            <p className="text-sm md:text-base text-[#3E2723] leading-relaxed italic">
              "{activeMilestone.contextDescription}"
            </p>
          </div>

          {/* Danh sách 4 lựa chọn hành vi */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {activeMilestone.options.map((option) => {
              const isSelected = selectedOption?.key === option.key;
              return (
                <button
                  key={option.key}
                  onClick={() => setSelectedOption(option)}
                  className={`p-3.5 text-left rounded border transition relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#5C4033] text-[#F5EBD7] border-[#2C1810] shadow-md scale-[1.01]'
                      : 'bg-[#EFE3C8] hover:bg-[#E5D5B5] text-[#2C1810] border-[#A88C6D] shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`inline-block w-6 h-6 rounded-full text-center text-xs font-bold leading-6 shrink-0 ${
                        isSelected ? 'bg-[#C5A059] text-[#2C1810]' : 'bg-[#D7C4A5] text-[#3E2723]'
                      }`}
                    >
                      {option.key}
                    </span>
                    <span className="text-sm font-medium leading-snug">{option.label}</span>
                  </div>

                  {isSelected && (
                    <div className="mt-2.5 pt-2 border-t border-[#8C6D53]/60 text-[11px] italic text-[#E0D0B5]">
                      • {option.sensoryFeedback}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          NÚT XÁC NHẬN LỰA CHỌN CỦA TỪNG NĂM
          ========================================================================= */}
      {!graduationResult && (
        <footer className="relative z-10 flex justify-end pt-3 border-t border-[#8C6D53]/60">
          <button
            disabled={!selectedOption}
            onClick={handleConfirmChoice}
            className="bg-[#5C4033] hover:bg-[#3E2723] disabled:opacity-40 disabled:cursor-not-allowed text-[#F5EBD7] px-6 py-2.5 rounded text-sm font-semibold tracking-wider uppercase shadow-md transition active:scale-95"
          >
            Khắc Ghi Quyết Định Năm {currentMilestoneAge} Tuổi ►
          </button>
        </footer>
      )}

      {/* =========================================================================
          POPUP VINH DANH KHÓA TÍNH CÁCH VĨNH VIỄN & MỞ KHÓA MỐC 6 TUỔI
          ========================================================================= */}
      {graduationResult && (
        <div className="absolute inset-0 z-30 bg-[#2C1810]/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-[#F5EBD7] border-4 border-[#C5A059] p-6 shadow-2xl rounded text-center font-serif relative">
            <span className="text-[11px] uppercase tracking-widest text-[#795548] font-bold block">
              ✦ Cột Mốc Cuộc Đời: Tròn 6 Tuổi ✦
            </span>
            <h3 className="text-2xl font-bold text-[#3E2723] mt-1 mb-3">
              {graduationResult.personalityTitleVi}
            </h3>

            <div className="bg-[#EAD8B7] border border-[#8C6D53] p-4 rounded text-left text-sm text-[#4E342E] leading-relaxed mb-4">
              <p className="mb-2 italic">"{graduationResult.personalityDescriptionVi}"</p>
              <div className="text-xs text-[#795548] font-sans pt-2 border-t border-[#C5A059]/50 flex justify-between">
                <span>Tần suất lựa chọn:</span>
                <span>
                  A: {graduationResult.distribution.A} | B: {graduationResult.distribution.B} | C:{' '}
                  {graduationResult.distribution.C} | D: {graduationResult.distribution.D}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-left text-xs text-[#5D4037] bg-[#FFF8E7] p-3 rounded border border-[#E0D0B5] mb-5">
              <div className="font-semibold text-[#2C1810] mb-1">🎁 Mở khóa năng lực khi lên 6 tuổi:</div>
              <div>✔ Mở khóa mục <strong>Sở Thích Cá Nhân</strong> trên bảng thông tin.</div>
              <div>✔ Kích hoạt <strong>Đồng hồ thời gian thật</strong> (24 phút thực = 24 giờ game).</div>
              <div>✔ Nhập học <strong>Trường Tiểu Học</strong> và bắt đầu nhận tiền tiêu vặt hàng tuần.</div>
              <div>✔ Mở khóa toàn quyền <strong>Di chuyển và Nhận thức tự chủ</strong>.</div>
            </div>

            <button
              onClick={onFinishGraduationToAge6}
              className="w-full bg-[#5C4033] hover:bg-[#3E2723] text-[#F5EBD7] py-3 rounded text-sm font-bold uppercase tracking-wider shadow-lg transition active:scale-95"
            >
              Bước Vào Lớp Một & Bắt Đầu Hành Trình Độc Lập ►
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
