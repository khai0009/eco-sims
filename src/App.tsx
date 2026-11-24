// [TẦNG GIAO DIỆN ĐIỀU PHỐI CHÍNH — ECO-LIFE V3.1 (HƯỚNG B)]
// Kiến trúc: Nối trực tiếp 100% vào Engine Trung Tâm (ecoLifeCentralEngine.ts).
// Tuân thủ trọn vẹn 6 chốt chặn:
// 1. Sân khấu đồng nhất (Cảnh phòng vẽ lớp visual_slot / Mini Cutscene 3s / Popup sự kiện 3 màu).
// 2. Giao diện cảm quan không số (5 đèn màu, độc thoại theo tính cách, Icon mũi tên tăng/giảm).
// 3. Clean Menu & Modal 70% phủ xám màn hình (khóa 3 khối HUD đáy khi mở Modal).
// 4. Ràng buộc địa điểm (Location-Bound), không mua đồ từ xa, thuốc Rx bắt buộc Bệnh án.
// 5. Lưu trữ chống gian lận 3 thời điểm (ACTION_COMPLETED / EVENT_TRIGGERED / APP_EXIT_SUSPEND).
// 6. Tự động ẩn và cắt bỏ hoàn toàn công cụ Admin JSON & QA Tester khi build Desktop Tauri.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Backpack,
  BookOpen,
  Compass,
  FileText,
  FlaskConical,
  Hand,
  Home,
  MapPin,
  Pause,
  Play,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  User,
  Wrench,
  X
} from 'lucide-react';
import {
  EcoLifeJsonDb,
  calculateDistanceKmBetweenLocations,
  translateVi,
  type ColorCode
} from './game/jsonDatabaseLoader';
import type {
  ActiveEventPopupDto,
  EcoLifeSavedSessionState,
  FrontendDeathAndMemoirDto,
  FrontendHudProjection,
  OwnedInventoryItemInstance
} from './game/engineTypes';
import {
  type CentralEngineCommand,
  createNewCentralSession,
  deleteSavedProfile,
  dispatchCentralEngineCommand,
  formatSessionDateVi,
  getAvailableActionsForCurrentSpot,
  listAllSavedProfiles,
  restoreCentralSession,
  stepCentralRealTimeTick
} from './game/ecoLifeCentralEngine';
import {
  type StoreCatalogItemInput,
  calculateDynamicCarryCapacity
} from './game/modules/shoppingAndInventoryModule';
import type { SavedProfileSummary } from './game/modules/saveAndAntiScumModule';
import { ActionStatIndicators } from './components/ActionStatIndicators';
import DevOnlyAdminGate from './admin/DevOnlyAdminGate';

// Chỉ nạp lười (lazy-load) trình Kiểm chứng Quần thể NPC khi đang ở chế độ Dev
const LazyNpcAutonomousObserver = lazy(() => import('./test/NpcAutonomousObserver'));

// ============================================================================
// 1. ĐỊNH NGHĨA KIỂU DỮ LIỆU CỤC BỘ CHO LUỒNG MÀN HÌNH & MODAL 70%
// ============================================================================

type AppScreenState = 'TITLE' | 'LIVES_LIST' | 'BIRTH_SETUP' | 'CHILDHOOD_0_5' | 'PLAYING' | 'MEMOIR_ENDGAME';
type ActiveModalKind = 'NONE' | 'INTERACT' | 'MOVE' | 'BAG' | 'PROFILE' | 'JOURNAL' | 'MEDICAL_REPORT';
type SpeedSetting = 0 | 1 | 2 | 4;

interface ActiveCutsceneState {
  caption_vi: string;
  progress_pct: number;
}

interface ChildhoodMilestoneCard {
  age: number;
  title_vi: string;
  body_vi: string;
  options: Array<{ vote: 'A' | 'B' | 'C' | 'D'; label_vi: string }>;
}

// ============================================================================
// 2. DỮ LIỆU HIỂN THỊ GIẤY DÓ & 5 CỘT MỐC TUỔI THƠ 0-5 TUỔI (UC-02)
// ============================================================================

const COLOR_HEX_MAP: Record<ColorCode, string> = {
  BLUE: '#2980B9',
  GREEN: '#27AE60',
  YELLOW: '#D4AC0D',
  ORANGE: '#D35400',
  RED: '#B8382A'
};

const CHILDHOOD_MILESTONES: ChildhoodMilestoneCard[] = [
  {
    age: 1,
    title_vi: 'Cột mốc 1 tuổi — Bữa tiệc Thôi nôi',
    body_vi: 'Trước mặt đặt đủ món đồ chơi trên chiếc chiếu cói. Đôi tay nhỏ xíu của bé hướng về đâu?',
    options: [
      { vote: 'A', label_vi: 'A. Lặng lẽ cầm cuốn sách bìa cứng lật đi lật lại' },
      { vote: 'B', label_vi: 'B. Vỗ tay cười khanh khách đòi mọi người bế xoay vòng' },
      { vote: 'C', label_vi: 'C. Chồm người trèo khỏi chiếu để với lấy chiếc xe đồ chơi ngoài xa' },
      { vote: 'D', label_vi: 'D. Ôm chặt con gấu bông mềm và áp má vào tay mẹ' }
    ]
  },
  {
    age: 2,
    title_vi: 'Cột mốc 2 tuổi — Ngày đầu ra công viên',
    body_vi: 'Ngoài sân có rất nhiều bạn nhỏ đang chạy nhảy và một chú chó con đi ngang qua.',
    options: [
      { vote: 'A', label_vi: 'A. Ngồi yên dưới gốc cây xếp mấy viên sỏi thành hàng' },
      { vote: 'B', label_vi: 'B. Chạy ùa ngay vào đám đông rủ các bạn cùng chơi đuổi bắt' },
      { vote: 'C', label_vi: 'C. Leo thẳng lên cầu trượt cao nhất mà không cần người lớn đỡ' },
      { vote: 'D', label_vi: 'D. Đưa mẩu bánh nhỏ đang cầm trên tay chia cho chú chó con' }
    ]
  },
  {
    age: 3,
    title_vi: 'Cột mốc 3 tuổi — Món đồ chơi bị vỡ',
    body_vi: 'Chiếc ô tô nhựa yêu thích vô tình rơi xuống nền gạch nứt làm đôi.',
    options: [
      { vote: 'A', label_vi: 'A. Tự ngồi một góc loay hoay lắp ghép lại từng mảnh' },
      { vote: 'B', label_vi: 'B. Chạy đi khoe với cả nhà rồi bày ra trò chơi khác ồn ào hơn' },
      { vote: 'C', label_vi: 'C. Tháo tung luôn bánh xe còn lại để xem bên trong có gì' },
      { vote: 'D', label_vi: 'D. Rơm rớm nước mắt xót xa vì làm hỏng món quà ba tặng' }
    ]
  },
  {
    age: 4,
    title_vi: 'Cột mốc 4 tuổi — Buổi chiều ở lớp Mẫu giáo',
    body_vi: 'Cô giáo tổ chức góc kể chuyện và góc vận động ngoài sân.',
    options: [
      { vote: 'A', label_vi: 'A. Xin cô ngồi góc cửa sổ lặng lẽ tô màu bức tranh của mình' },
      { vote: 'B', label_vi: 'B. Xung phong đứng trước lớp hát thật to cho các bạn vỗ tay' },
      { vote: 'C', label_vi: 'C. Thi chạy đua thật nhanh quanh sân bất chấp ngã trầy đầu gối' },
      { vote: 'D', label_vi: 'D. Nhường hộp bút màu đẹp cho bạn bên cạnh đang ngồi khóc' }
    ]
  },
  {
    age: 5,
    title_vi: 'Cột mốc 5 tuổi — Trước ngưỡng cửa lớp Một',
    body_vi: 'Gia đình chuẩn bị cặp sách để năm sau bé chính thức bước vào Trường Tiểu Học.',
    options: [
      { vote: 'A', label_vi: 'A. Cẩn thận tự xếp từng cuốn vở ngay ngắn vào góc bàn riêng' },
      { vote: 'B', label_vi: 'B. Háo hức hỏi mẹ xem lớp mới có đông bạn mới không' },
      { vote: 'C', label_vi: 'C. Hỏi ba bao giờ được tự đạp xe đi học một mình không cần đưa đón' },
      { vote: 'D', label_vi: 'D. Dặn mẹ nhớ đón đúng giờ vì sợ ba má ở nhà một mình buồn' }
    ]
  }
];

// Danh mục hàng hóa cầm tay tại các quầy bán hàng chuẩn (khớp location_id & phân loại CONSUMABLE / DURABLE_REUSABLE)
const STORE_PORTABLE_ITEMS: StoreCatalogItemInput[] = [
  {
    item_def_id: 'ITEM_BREAD_LOAF',
    display_name_key: 'Ổ bánh mì thịt nóng',
    category: 'FOOD',
    usage_type: 'CONSUMABLE',
    size_class: 'PORTABLE_CARRY',
    base_price_vnd: 25000,
    weight_kg: 0.3,
    max_servings: 1,
    sold_at_location_ids: ['LOC_SUPERMARKET_MARKET']
  },
  {
    item_def_id: 'ITEM_FRESH_GROCERY_PACK',
    display_name_key: 'Túi thực phẩm tươi sống (3 bữa)',
    category: 'FOOD',
    usage_type: 'CONSUMABLE',
    size_class: 'PORTABLE_CARRY',
    base_price_vnd: 95000,
    weight_kg: 1.8,
    max_servings: 3,
    sold_at_location_ids: ['LOC_SUPERMARKET_MARKET']
  },
  {
    item_def_id: 'ITEM_LAUNDRY_DETERGENT',
    display_name_key: 'Túi bột giặt gia đình (20 lần)',
    category: 'OTHER',
    usage_type: 'CONSUMABLE',
    size_class: 'PORTABLE_CARRY',
    base_price_vnd: 90000,
    weight_kg: 2.0,
    max_servings: 20,
    sold_at_location_ids: ['LOC_SUPERMARKET_MARKET']
  },
  {
    item_def_id: 'ITEM_BACKPACK_STANDARD',
    display_name_key: 'Balo vải bền (+10kg sức chứa)',
    category: 'CLOTHING',
    usage_type: 'DURABLE_REUSABLE',
    size_class: 'PORTABLE_CARRY',
    base_price_vnd: 320000,
    weight_kg: 0.7,
    carry_bonus_kg: 10.0,
    sold_at_location_ids: ['LOC_SUPERMARKET_MARKET']
  },
  {
    item_def_id: 'ITEM_WRISTWATCH',
    display_name_key: 'Đồng hồ đeo tay cơ bản (Mở khóa giờ)',
    category: 'OTHER',
    usage_type: 'DURABLE_REUSABLE',
    size_class: 'PORTABLE_CARRY',
    base_price_vnd: 450000,
    weight_kg: 0.1,
    sold_at_location_ids: ['LOC_TECH_STORE', 'LOC_SECONDHAND_ELECTRONICS']
  },
  {
    item_def_id: 'ITEM_SMARTPHONE',
    display_name_key: 'Điện thoại thông minh (Giờ + Thời tiết)',
    category: 'PHONE',
    usage_type: 'DURABLE_REUSABLE',
    size_class: 'PORTABLE_CARRY',
    base_price_vnd: 4200000,
    weight_kg: 0.2,
    sold_at_location_ids: ['LOC_TECH_STORE', 'LOC_SECONDHAND_ELECTRONICS']
  }
];

const ALL_MAP_LOCATION_IDS = Object.keys(EcoLifeJsonDb.mapCoords.location_coordinates);

// ============================================================================
// 3. COMPONENT CHÍNH: APP ĐIỀU PHỐI TOÀN BỘ VÒNG ĐỜI ECO-LIFE V3.1
// ============================================================================

export default function App() {
  const [screen, setScreen] = useState<AppScreenState>('TITLE');
  const [savedProfiles, setSavedProfiles] = useState<SavedProfileSummary[]>(() =>
    listAllSavedProfiles()
  );
  const [confirmDeleteProfileId, setConfirmDeleteProfileId] = useState<string | null>(null);

  // Trạng thái phiên chơi thật (nguồn chân lý duy nhất từ ecoLifeCentralEngine.ts)
  const [session, setSession] = useState<EcoLifeSavedSessionState | null>(null);
  const [hud, setHud] = useState<FrontendHudProjection | null>(null);
  const [activePopup, setActivePopup] = useState<ActiveEventPopupDto | null>(null);
  const [popupSecondsLeft, setPopupSecondsLeft] = useState<number>(0);
  const [ptsdFreezeLeft, setPtsdFreezeLeft] = useState<number>(0);

  // Cấu hình màn hình tạo nhân vật & tuổi thơ
  const [birthYearInput, setBirthYearInput] = useState<number>(2002);
  const [childhoodVotes, setChildhoodVotes] = useState<Array<'A' | 'B' | 'C' | 'D'>>([]);

  // Điều khiển thời gian thực, Cutscene 3s, Modal 70% & thông báo cảm quan
  const [speed, setSpeed] = useState<SpeedSetting>(1);
  const [activeModal, setActiveModal] = useState<ActiveModalKind>('NONE');
  const [cutscene, setCutscene] = useState<ActiveCutsceneState | null>(null);
  const [feedbackToastVi, setFeedbackToastVi] = useState<string>('');
  const [viewingReportItem, setViewingReportItem] = useState<OwnedInventoryItemInstance | null>(
    null
  );

  // Cuốn Nhật Ký Đời Người (Trang bìa = 0, 5 Chương = 1..5, Trang cuối Di sản = 6)
  const [memoirPageIdx, setMemoirPageIdx] = useState<number>(0);
  const [memoirReturnScreen, setMemoirReturnScreen] = useState<AppScreenState>('TITLE');

  // Công cụ QA nội bộ (chỉ hoạt động khi import.meta.env.DEV === true)
  const [showDevQaObserver, setShowDevQaObserver] = useState<boolean>(false);

  const sessionRef = useRef<EcoLifeSavedSessionState | null>(null);
  sessionRef.current = session;

  const refreshSavedProfileList = () => {
    setSavedProfiles(listAllSavedProfiles());
  };

  // [Chốt chống gian lận 3]: Lưu tức thì khi người chơi đóng tab / thu nhỏ cửa sổ Desktop
  useEffect(() => {
    const handleSuspendSave = () => {
      if (sessionRef.current && !sessionRef.current.death_summary?.is_deceased) {
        dispatchCentralEngineCommand(sessionRef.current, { type: 'APP_EXIT_SUSPEND' });
      }
    };
    window.addEventListener('beforeunload', handleSuspendSave);
    return () => window.removeEventListener('beforeunload', handleSuspendSave);
  }, []);

  // [Mini Cutscene 3 giây]: Chạy thanh tiến trình phủ ngay lên Sân Khấu Đồng Nhất
  const triggerMiniCutscene = (captionVi: string | null) => {
    if (!captionVi) return;
    setCutscene({ caption_vi: captionVi, progress_pct: 5 });
  };

  useEffect(() => {
    if (!cutscene) return;
    const stepMs = 150;
    const increment = 100 / (3000 / stepMs);
    const timer = window.setInterval(() => {
      setCutscene((prev) => {
        if (!prev) return null;
        const nextPct = prev.progress_pct + increment;
        if (nextPct >= 100) {
          return null;
        }
        return { ...prev, progress_pct: nextPct };
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [cutscene !== null]);

  // Hàm mở một Popup sự kiện kèm thiết lập đếm ngược & đóng băng PTSD 2 giây
  const openEventPopupState = (popup: ActiveEventPopupDto) => {
    setActivePopup(popup);
    setPopupSecondsLeft(popup.effective_countdown_seconds);
    setPtsdFreezeLeft(popup.ptsd_freeze_seconds);
    setActiveModal('NONE');
    // Tự tạm dừng đồng hồ chính khi sự kiện bật lên (EVENT_POPUP_FROZEN)
    setSpeed(0);
  };

  // Hàm gửi lệnh tập trung qua Engine Trung Tâm V3.1
  const runEngineCommand = (command: CentralEngineCommand) => {
    if (!session) return;

    // Sao chép sâu phiên chơi để đảm bảo React nhận đúng tham chiếu state mới sau cập nhật
    const clonedSession: EcoLifeSavedSessionState = JSON.parse(JSON.stringify(session));
    const response = dispatchCentralEngineCommand(clonedSession, command);

    setSession(clonedSession);
    setHud(response.hud);
    setFeedbackToastVi(response.action_result.message_vi);

    if (response.action_result.ok && response.action_result.cutscene_caption_vi) {
      triggerMiniCutscene(response.action_result.cutscene_caption_vi);
    }

    if (response.active_popup) {
      openEventPopupState(response.active_popup);
    }

    // Nếu nhân vật vừa qua đời -> Cuốn Nhật Ký Đời Người tự động bung toàn màn hình (UC-08)
    if (response.death_summary?.is_deceased) {
      setActivePopup(null);
      setActiveModal('NONE');
      setSpeed(0);
      setMemoirPageIdx(0);
      setMemoirReturnScreen('TITLE');
      setScreen('MEMOIR_ENDGAME');
    }

    refreshSavedProfileList();
  };

  // [Trục Thời Gian Thực]: 1 giây thực = 1 phút game (nhân hệ số tốc độ 1x / 2x / 4x)
  useEffect(() => {
    if (screen !== 'PLAYING' || !session || activePopup || cutscene) {
      return;
    }

    // Khi nhân vật bị lú lẫn tuổi già (is_dementia_autopilot): khóa nút Pause, ép tự chạy tốc độ >= 1x
    const isDementia = session.player.capability_flags.is_dementia_autopilot;
    const effectiveSpeed = isDementia ? Math.max(1, speed) : speed;
    if (effectiveSpeed === 0) {
      return;
    }

    const tickIntervalMs = 1000;
    const minutesPerTick = effectiveSpeed * 5; // Mỗi giây thực tiến 5/10/20 phút game để trải nghiệm nhịp mượt

    const timer = window.setInterval(() => {
      if (!sessionRef.current || sessionRef.current.death_summary?.is_deceased) {
        return;
      }
      const cloned: EcoLifeSavedSessionState = JSON.parse(JSON.stringify(sessionRef.current));
      const tickRes = stepCentralRealTimeTick(cloned, minutesPerTick, 0.06);

      setSession(cloned);
      setHud(tickRes.hud);

      if (tickRes.action_result.message_vi) {
        setFeedbackToastVi(tickRes.action_result.message_vi);
      }

      if (tickRes.active_popup) {
        openEventPopupState(tickRes.active_popup);
        refreshSavedProfileList();
      } else if (tickRes.death_summary?.is_deceased) {
        setActiveModal('NONE');
        setSpeed(0);
        setMemoirPageIdx(0);
        setMemoirReturnScreen('TITLE');
        setScreen('MEMOIR_ENDGAME');
        refreshSavedProfileList();
      }
    }, tickIntervalMs);

    return () => window.clearInterval(timer);
  }, [screen, speed, activePopup, cutscene, session?.player.capability_flags.is_dementia_autopilot]);

  // [Bộ Đếm Ngược Popup Sự Kiện 3-15 giây + Đóng Băng PTSD 2 giây]
  useEffect(() => {
    if (!activePopup) return;

    const timer = window.setInterval(() => {
      if (ptsdFreezeLeft > 0) {
        setPtsdFreezeLeft((prev) => Math.max(0, Math.round((prev - 0.1) * 10) / 10));
        return;
      }

      setPopupSecondsLeft((prev) => {
        const next = Math.round((prev - 0.1) * 10) / 10;
        if (next <= 0) {
          // Hết giờ đếm ngược -> tự động gửi null để Engine chọn phương án phạt mặc định / thói quen lú lẫn
          window.clearInterval(timer);
          setActivePopup(null);
          runEngineCommand({ type: 'SUBMIT_EVENT_CHOICE', selected_choice_id: null });
          return 0;
        }
        return next;
      });
    }, 100);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePopup, ptsdFreezeLeft]);

  // [Phím tắt lật trang Nhật Ký ← →]
  useEffect(() => {
    if (screen !== 'MEMOIR_ENDGAME') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setMemoirPageIdx((p) => Math.min(6, p + 1));
      } else if (e.key === 'ArrowLeft') {
        setMemoirPageIdx((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen]);

  // ============================================================================
  // 4. HÀM CHUYỂN MÀN HÌNH & TẢI / TẠO CUỘC ĐỜI THẬT
  // ============================================================================

  const handleOpenSavedProfile = (profileId?: string) => {
    const restored = restoreCentralSession(profileId);
    if (!restored.session || !restored.hud) {
      setFeedbackToastVi('Chưa có hồ sơ cuộc đời nào được lưu.');
      return;
    }

    setSession(restored.session);
    setHud(restored.hud);
    setActiveModal('NONE');

    // Nếu cuộc đời đã qua đời -> Mở thẳng Cuốn Nhật Ký Đời Người
    if (restored.session.death_summary?.is_deceased) {
      setMemoirPageIdx(0);
      setMemoirReturnScreen('LIVES_LIST');
      setScreen('MEMOIR_ENDGAME');
      return;
    }

    // Nếu chưa xong giai đoạn 0-5 tuổi -> Quay lại hoàn tất 5 cột mốc tuổi thơ
    if (restored.session.player.identity_biometrics.exact_age_years < 6) {
      setChildhoodVotes([]);
      setScreen('CHILDHOOD_0_5');
      return;
    }

    setScreen('PLAYING');
    // Chống Alt+F4: Nếu lần tắt trước đang kẹt sự kiện thì mở lại ngay đúng sự kiện đó với số giây gốc
    if (restored.restoredPopup) {
      openEventPopupState(restored.restoredPopup);
    } else {
      setActivePopup(null);
      setSpeed(1);
    }
  };

  const handleConfirmCreateNewLife = () => {
    const safeYear = Math.max(1950, Math.min(2026, Math.floor(birthYearInput) || 2002));
    const profileId = `LIFE_${Date.now()}`;
    const created = createNewCentralSession({
      profileId,
      birthYear: safeYear,
      controllerMode: 'PLAYER_CONTROLLED'
    });

    setSession(created.session);
    setHud(created.hud);
    setChildhoodVotes([]);
    setActivePopup(null);
    setActiveModal('NONE');
    setFeedbackToastVi('');
    refreshSavedProfileList();
    setScreen('CHILDHOOD_0_5');
  };

  const handlePickChildhoodVote = (vote: 'A' | 'B' | 'C' | 'D') => {
    const nextVotes = [...childhoodVotes, vote];
    setChildhoodVotes(nextVotes);

    // Đủ 5 cột mốc (1 -> 5 tuổi) -> Khóa tính cách ở mốc 6 tuổi và mở khóa màn chơi thời gian thực
    if (nextVotes.length >= CHILDHOOD_MILESTONES.length && session) {
      const cloned: EcoLifeSavedSessionState = JSON.parse(JSON.stringify(session));
      const res = dispatchCentralEngineCommand(cloned, {
        type: 'LOCK_CHILDHOOD_PERSONALITY',
        votes: nextVotes
      });
      setSession(cloned);
      setHud(res.hud);
      setFeedbackToastVi(res.action_result.message_vi);
      setSpeed(1);
      refreshSavedProfileList();
      setScreen('PLAYING');
    }
  };

  const handleDeleteProfileClick = (profileId: string) => {
    // Xác nhận 2 bước chống bấm xóa nhầm cuộc đời đang chơi
    if (confirmDeleteProfileId !== profileId) {
      setConfirmDeleteProfileId(profileId);
      return;
    }
    deleteSavedProfile(profileId);
    setConfirmDeleteProfileId(null);
    refreshSavedProfileList();
  };

  // Các dữ liệu tính toán phụ trợ cho HUD & Modal
  const latestAliveProfile = useMemo(
    () => savedProfiles.find((p) => !p.is_deceased) || null,
    [savedProfiles]
  );

  const cleanMenuActions = useMemo(
    () => (session ? getAvailableActionsForCurrentSpot(session) : []),
    [session]
  );

  const unlockedHomeRooms = useMemo(() => {
    if (!session) return ['HOME_LIVING_ROOM', 'HOME_KITCHEN', 'HOME_BATHROOM'];
    const tierDef = EcoLifeJsonDb.bankingHousing.housing_tiers.find(
      (h) => h.house_tier === session.player.house_tier
    );
    return tierDef ? tierDef.unlocked_sub_nodes : ['HOME_LIVING_ROOM', 'HOME_KITCHEN', 'HOME_BATHROOM'];
  }, [session]);

  const carryStatus = useMemo(
    () => (session ? calculateDynamicCarryCapacity(session.player) : null),
    [session]
  );

  const storeItemsAtCurrentSpot = useMemo(() => {
    if (!session) return [];
    return STORE_PORTABLE_ITEMS.filter((it) =>
      it.sold_at_location_ids.includes(session.player.current_location_id)
    );
  }, [session]);

  const furnitureSoldAtCurrentSpot = useMemo(() => {
    if (!session) return [];
    return EcoLifeJsonDb.furniture.filter((f) =>
      f.sold_at_location_ids.includes(session.player.current_location_id)
    );
  }, [session]);

  // ============================================================================
  // 5. LỚP RENDER CHÍNH (BỌC NGOÀI BỞI DevOnlyAdminGate TỰ CẮT KHI BUILD DESKTOP)
  // ============================================================================

  const renderMainContent = () => {
    // [Chế độ QA Nội Bộ — Chỉ tồn tại khi Dev]
    if (import.meta.env.DEV && showDevQaObserver) {
      return (
        <div className="min-h-screen bg-[#F2ECE0]">
          <div className="sticky top-0 z-40 flex items-center justify-between border-b-2 border-[#1F1B16] bg-[#1F1B16] px-4 py-2.5 text-xs text-[#F9F5EC]">
            <span className="font-bold">Chế Độ Kiểm Chứng Logic & Quần Thể NPC (Dev-Only)</span>
            <button
              type="button"
              onClick={() => setShowDevQaObserver(false)}
              className="rounded border border-[#B8382A] bg-[#B8382A] px-3 py-1 font-bold text-white"
            >
              ← Quay Lại Game Chính
            </button>
          </div>
          <Suspense
            fallback={
              <div className="p-8 text-center text-sm">Đang nạp Trung tâm Kiểm chứng Logic...</div>
            }
          >
            <LazyNpcAutonomousObserver />
          </Suspense>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // MÀN HÌNH 1: MÀN CHÀO GIẤY DÓ (UC-01)
    // ------------------------------------------------------------------------
    if (screen === 'TITLE') {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#F2ECE0] p-6 text-[#1F1B16]">
          <div className="w-full max-w-md space-y-6 rounded border-2 border-[#1F1B16] bg-[#FAF6EE] p-8 text-center shadow-lg">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#B8382A] bg-[#FDECE9] font-serif text-xl font-bold text-[#B8382A]">
              Đời
            </div>

            <div>
              <h1
                className="text-3xl font-bold tracking-wider text-[#1F1B16]"
                style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
              >
                DÒNG ĐỜI
              </h1>
              <p className="mt-1 text-xs uppercase tracking-widest text-[#6B5B47]">
                Eco-Life • Mô Phỏng Cuộc Sống Cảm Quan Không Số (V3.1)
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {latestAliveProfile && (
                <button
                  type="button"
                  onClick={() => handleOpenSavedProfile(latestAliveProfile.profile_id)}
                  className="w-full rounded border-2 border-[#1F1B16] bg-[#B8382A] px-4 py-3 text-sm font-bold text-[#FAF6EE] transition hover:bg-[#9E2D20]"
                >
                  Tiếp tục: {latestAliveProfile.full_name} — {latestAliveProfile.age_years} tuổi
                </button>
              )}

              <button
                type="button"
                onClick={() => setScreen('BIRTH_SETUP')}
                className="w-full rounded border-2 border-[#1F1B16] bg-[#1F1B16] px-4 py-3 text-sm font-bold text-[#FAF6EE] transition hover:bg-[#332C24]"
              >
                Bắt Đầu Cuộc Đời Mới
              </button>

              <button
                type="button"
                onClick={() => {
                  refreshSavedProfileList();
                  setScreen('LIVES_LIST');
                }}
                className="w-full rounded border border-[#1F1B16] bg-[#F2ECE0] px-4 py-2.5 text-sm font-semibold text-[#1F1B16] transition hover:bg-[#E5DAC5]"
              >
                Danh Sách Cuộc Đời ({savedProfiles.length})
              </button>
            </div>

            {import.meta.env.DEV && (
              <div className="border-t border-dashed border-[#C8BFA8] pt-4">
                <button
                  type="button"
                  onClick={() => setShowDevQaObserver(true)}
                  className="inline-flex items-center gap-1.5 rounded border border-[#B8382A] bg-[#FFF5F3] px-3 py-1.5 text-xs font-bold text-[#B8382A] hover:bg-[#FDE4DF]"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Mở Trung Tâm Test Logic & Quần Thể NPC (Dev)
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // MÀN HÌNH 2: DANH SÁCH CUỘC ĐỜI ĐÃ LƯU THẬT (UC-01)
    // ------------------------------------------------------------------------
    if (screen === 'LIVES_LIST') {
      return (
        <div className="min-h-screen bg-[#F2ECE0] p-6 text-[#1F1B16]">
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-center justify-between border-b-2 border-[#1F1B16] pb-3">
              <h2
                className="text-xl font-bold"
                style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
              >
                Danh Sách Cuộc Đời Đã Lưu
              </h2>
              <button
                type="button"
                onClick={() => setScreen('TITLE')}
                className="rounded border border-[#1F1B16] bg-[#FAF6EE] px-3 py-1.5 text-xs font-bold"
              >
                ← Về Màn Chào
              </button>
            </div>

            {savedProfiles.length === 0 ? (
              <div className="rounded border border-dashed border-[#8C7B60] bg-[#FAF6EE] p-10 text-center text-sm italic text-[#6B5B47]">
                Chưa có cuộc đời nào được ghi lại. Hãy bắt đầu một cuộc đời mới.
              </div>
            ) : (
              <div className="space-y-3">
                {savedProfiles.map((prof) => (
                  <div
                    key={prof.profile_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#1F1B16] bg-[#FAF6EE] p-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-base font-bold">{prof.full_name}</span>
                        <span className="rounded bg-[#EAE1D0] px-2 py-0.5 text-xs font-semibold">
                          {prof.age_years} tuổi
                        </span>
                        {prof.is_deceased && (
                          <span className="rounded bg-[#1F1B16] px-2 py-0.5 text-[11px] font-bold text-[#F9F5EC]">
                            Đã An Nghỉ
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-[#6B5B47]">
                        Lưu gần nhất: {new Date(prof.last_saved_unix_ms).toLocaleString('vi-VN')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenSavedProfile(prof.profile_id)}
                        className="rounded bg-[#B8382A] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#9E2D20]"
                      >
                        {prof.is_deceased ? 'Đọc Nhật Ký' : 'Chơi Tiếp'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProfileClick(prof.profile_id)}
                        className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-bold ${
                          confirmDeleteProfileId === prof.profile_id
                            ? 'border-[#B8382A] bg-[#B8382A] text-white'
                            : 'border-[#C8BFA8] bg-white text-[#9C2418]'
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {confirmDeleteProfileId === prof.profile_id ? 'Xác nhận xóa?' : 'Xóa'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // MÀN HÌNH 3: KHAI SINH CUỘC ĐỜI MỚI (CHỈ CHỌN NĂM SINH — RANDOM TOÀN BỘ)
    // ------------------------------------------------------------------------
    if (screen === 'BIRTH_SETUP') {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F2ECE0] p-6 text-[#1F1B16]">
          <div className="w-full max-w-md space-y-5 rounded border-2 border-[#1F1B16] bg-[#FAF6EE] p-6 shadow-md">
            <div className="border-b border-[#C8BFA8] pb-3 text-center">
              <div className="text-xs font-bold uppercase tracking-widest text-[#B8382A]">
                Giấy Khai Sinh • Vòng Đời Mới
              </div>
              <h2
                className="mt-1 text-2xl font-bold"
                style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
              >
                Chọn Năm Chào Đời
              </h2>
            </div>

            <p className="text-xs leading-relaxed text-[#4A3F30]">
              Con người không thể chọn nơi mình sinh ra. Bạn chỉ chọn <strong>Năm sinh</strong>;
              hệ thống sẽ ngẫu nhiên hoàn toàn <strong>Họ tên, Giới tính, Vùng miền (Nông Thôn /
              Thành Thị)</strong> và <strong>Gia cảnh (Q1 – Q5)</strong> cùng ngày tháng thực tế
              hôm nay.
            </p>

            <div>
              <label className="mb-1 block text-xs font-bold">Năm sinh (1950 – 2026)</label>
              <input
                type="number"
                min={1950}
                max={2026}
                value={birthYearInput}
                onChange={(e) => setBirthYearInput(Number(e.target.value))}
                className="w-full rounded border-2 border-[#1F1B16] bg-white px-3 py-2 text-center text-lg font-bold"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setScreen('TITLE')}
                className="flex-1 rounded border border-[#1F1B16] bg-[#F2ECE0] py-2.5 text-xs font-bold"
              >
                Quay Lại
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateNewLife}
                className="flex-1 rounded bg-[#B8382A] py-2.5 text-xs font-bold text-white hover:bg-[#9E2D20]"
              >
                Chào Đời Ngay
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // MÀN HÌNH 4: GIAI ĐOẠN TUỔI THƠ 0 - 5 TUỔI (KHÓA ĐỒNG HỒ, 5 CỘT MỐC A-D)
    // ------------------------------------------------------------------------
    if (screen === 'CHILDHOOD_0_5' && session) {
      const bio = session.player.identity_biometrics;
      const stepIndex = Math.min(childhoodVotes.length, CHILDHOOD_MILESTONES.length - 1);
      const currentMilestone = CHILDHOOD_MILESTONES[stepIndex];

      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F2ECE0] p-4 text-[#1F1B16] sm:p-6">
          <div className="w-full max-w-2xl space-y-5 rounded border-2 border-[#1F1B16] bg-[#FAF6EE] p-6 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C8BFA8] pb-3">
              <div>
                <div className="text-xs font-bold uppercase text-[#B8382A]">
                  Tua Nhanh Tuổi Thơ (0 – 5 Tuổi) • Khóa Đồng Hồ
                </div>
                <h2
                  className="text-lg font-bold"
                  style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
                >
                  {bio.full_name} ({bio.gender === 'MALE' ? 'Nam' : 'Nữ'}) — Sinh{' '}
                  {String(bio.birth_day).padStart(2, '0')}/
                  {String(bio.birth_month).padStart(2, '0')}/{bio.birth_year}
                </h2>
              </div>
              <span className="rounded border border-[#B8382A] bg-[#FDECE9] px-3 py-1 text-xs font-bold text-[#B8382A]">
                Gia cảnh {bio.family_tier} •{' '}
                {session.player.current_region === 'RURAL' ? 'Nông Thôn' : 'Thành Thị'}
              </span>
            </div>

            <div className="space-y-2 rounded border border-[#D4C6AE] bg-[#F2ECE0] p-4">
              <div className="text-xs font-bold text-[#6B5B47]">
                Cột mốc {stepIndex + 1} / {CHILDHOOD_MILESTONES.length}
              </div>
              <h3 className="font-serif text-lg font-bold text-[#1F1B16]">
                {currentMilestone.title_vi}
              </h3>
              <p className="text-sm leading-relaxed text-[#3A3126]">{currentMilestone.body_vi}</p>
            </div>

            <div className="space-y-2">
              {currentMilestone.options.map((opt) => (
                <button
                  key={opt.vote}
                  type="button"
                  onClick={() => handlePickChildhoodVote(opt.vote)}
                  className="w-full rounded border border-[#1F1B16] bg-white px-4 py-3 text-left text-xs font-semibold transition hover:border-[#B8382A] hover:bg-[#FFF5F3] sm:text-sm"
                >
                  {opt.label_vi}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // MÀN HÌNH 5: CUỐN NHẬT KÝ ĐỜI NGƯỜI 5 CHƯƠNG & BIA MỘ ENDGAME (UC-08)
    // ------------------------------------------------------------------------
    if (screen === 'MEMOIR_ENDGAME' && session && session.death_summary) {
      const death: FrontendDeathAndMemoirDto = session.death_summary;
      const bio = session.player.identity_biometrics;

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#E7DEC8] p-4 text-[#1F1B16] sm:p-6">
          <div className="w-full max-w-3xl space-y-5 rounded border-2 border-[#1F1B16] bg-[#FAF6EE] p-6 shadow-xl sm:p-8">
            <div className="flex items-center justify-between border-b border-[#C8BFA8] pb-3 text-xs font-bold text-[#6B5B47]">
              <span>CUỐN NHẬT KÝ ĐỜI NGƯỜI — {bio.full_name.toUpperCase()}</span>
              <span>Trang {memoirPageIdx + 1} / 7 (Phím ← →)</span>
            </div>

            {/* Trang 0: Trang Bìa Bia Mộ */}
            {memoirPageIdx === 0 && (
              <div className="space-y-4 py-8 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-[#B8382A]">
                  Khép Lại Một Kiếp Người
                </div>
                <h1
                  className="text-3xl font-bold"
                  style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
                >
                  {bio.full_name}
                </h1>
                <div className="text-sm font-semibold text-[#4A3F30]">
                  {bio.birth_year} — {session.clock.current_year} • {death.honorific_label_vi}
                </div>
                <div className="mx-auto max-w-md rounded border border-[#C8BFA8] bg-[#F2ECE0] p-4 text-sm italic">
                  “{death.epitaph_vi}”
                </div>
                <div className="text-xs text-[#6B5B47]">
                  Nguyên nhân qua đời: <strong>{death.cause_label_vi}</strong> (vào {death.season_vi})
                </div>
              </div>
            )}

            {/* Trang 1..5: 5 Chương Đời Người */}
            {memoirPageIdx >= 1 && memoirPageIdx <= 5 && (() => {
              const chap = death.chapters[memoirPageIdx - 1];
              return (
                <div className="min-h-[280px] space-y-3">
                  <h2
                    className="border-b border-[#D4C6AE] pb-2 text-lg font-bold text-[#B8382A]"
                    style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
                  >
                    {chap.title_vi}
                  </h2>
                  {chap.entries.length === 0 ? (
                    <p className="py-10 text-center text-sm italic text-[#7A6A53]">
                      Những năm tháng lặng lẽ trôi qua không ghi dấu biến cố lớn.
                    </p>
                  ) : (
                    <ul className="max-h-72 space-y-2 overflow-y-auto pr-2 text-xs leading-relaxed">
                      {chap.entries.map((entry, idx) => (
                        <li key={idx} className="border-b border-dotted border-[#D4C6AE] pb-1.5">
                          <strong className="text-[#B8382A]">
                            [{entry.age_recorded} tuổi{entry.date_str_vi ? ` • ${entry.date_str_vi}` : ''}]
                          </strong>{' '}
                          {entry.text_vi}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {/* Trang 6: Tổng kết Tài sản & Di chúc */}
            {memoirPageIdx === 6 && (
              <div className="min-h-[280px] space-y-4">
                <h2
                  className="border-b border-[#D4C6AE] pb-2 text-lg font-bold text-[#B8382A]"
                  style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
                >
                  Trang Cuối: Di Sản & Di Chúc Để Lại
                </h2>
                <div className="rounded border border-[#C8BFA8] bg-[#F2ECE0] p-4 text-sm">
                  Tổng giá trị di sản ước tính:{' '}
                  <strong className="text-[#B8382A]">
                    {death.total_estate_vnd.toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="font-bold">{death.will_fallback_note_vi}</div>
                  {death.will_lines.map((wl, i) => (
                    <div
                      key={i}
                      className="flex justify-between rounded border border-[#DFD5C2] bg-white px-3 py-2"
                    >
                      <span>
                        {wl.beneficiary_name} ({wl.relation_label_vi})
                      </span>
                      <strong>{wl.percentage_share}% di sản</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Điều hướng lật trang & 2 nút kết thúc */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#C8BFA8] pt-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={memoirPageIdx === 0}
                  onClick={() => setMemoirPageIdx((p) => Math.max(0, p - 1))}
                  className="rounded border border-[#1F1B16] bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                >
                  ← Trang Trước
                </button>
                <button
                  type="button"
                  disabled={memoirPageIdx === 6}
                  onClick={() => setMemoirPageIdx((p) => Math.min(6, p + 1))}
                  className="rounded border border-[#1F1B16] bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                >
                  Trang Sau →
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  refreshSavedProfileList();
                  setScreen(memoirReturnScreen);
                }}
                className="rounded bg-[#1F1B16] px-4 py-1.5 text-xs font-bold text-[#FAF6EE]"
              >
                {memoirReturnScreen === 'LIVES_LIST' ? 'Về Danh Sách Cuộc Đời' : 'Trở Về Màn Chào'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // MÀN HÌNH 6: MÀN CHƠI CHÍNH — SÂN KHẤU ĐỒNG NHẤT & THANH CẢM QUAN KHÔNG SỐ
    // ------------------------------------------------------------------------
    if (!session || !hud) {
      return null;
    }

    const player = session.player;
    const isDementiaLocked = player.capability_flags.is_dementia_autopilot;
    const isHudBottomDisabled = activeModal !== 'NONE' || Boolean(activePopup) || Boolean(cutscene);
    const regionRules = EcoLifeJsonDb.regions.region_types[player.current_region];
    const lockedLocations: readonly string[] = regionRules.locked_location_ids;

    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F2ECE0] text-[#1F1B16]">
        {/* === TOP-BAR: THỜI GIAN (HOẶC MÙ GIỜ), NGÀY LỊCH, TIỀN MẶT, TỐC ĐỘ === */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b-2 border-[#1F1B16] bg-[#FAF6EE] px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                runEngineCommand({ type: 'APP_EXIT_SUSPEND' });
                setSpeed(0);
                setScreen('TITLE');
              }}
              className="rounded border border-[#1F1B16] bg-[#F2ECE0] px-2.5 py-1 font-bold hover:bg-[#E5DAC5]"
            >
              ← Màn Chào
            </button>

            <div>
              <div className="font-bold text-[#1F1B16]">
                {hud.blind_profile_view.full_name} • {hud.blind_profile_view.age_years} tuổi
              </div>
              <div className="text-[11px] text-[#5A5043]">
                {formatSessionDateVi(session)} •{' '}
                {hud.is_exact_clock_shown ? (
                  <strong className="text-[#B8382A]">{hud.time_display_vi}</strong>
                ) : (
                  <span className="italic">{hud.time_display_vi}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded border border-[#C8BFA8] bg-[#F2ECE0] px-3 py-1 font-bold">
              Ví: <span className="text-[#B8382A]">{player.cash_vnd.toLocaleString('vi-VN')} đ</span>
            </div>

            {/* Điều khiển tốc độ Pause / 1x / 2x / 4x (Lú lẫn tuổi già khóa Pause) */}
            <div className="inline-flex overflow-hidden rounded border border-[#1F1B16]">
              {([0, 1, 2, 4] as SpeedSetting[]).map((spd) => {
                const disabledPause = spd === 0 && isDementiaLocked;
                return (
                  <button
                    key={spd}
                    type="button"
                    disabled={disabledPause || Boolean(activePopup)}
                    onClick={() => setSpeed(spd)}
                    className={`inline-flex items-center gap-0.5 px-2.5 py-1 font-bold transition disabled:opacity-35 ${
                      speed === spd
                        ? 'bg-[#1F1B16] text-[#FAF6EE]'
                        : 'bg-[#FAF6EE] text-[#1F1B16] hover:bg-[#EAE1D0]'
                    }`}
                  >
                    {spd === 0 ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {spd === 0 ? '' : `${spd}×`}
                  </button>
                );
              })}
            </div>

            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={() => setShowDevQaObserver(true)}
                className="inline-flex items-center gap-1 rounded border border-[#B8382A] bg-[#FFF5F3] px-2 py-1 text-[11px] font-bold text-[#B8382A]"
                title="Mở Trung tâm Test Logic & NPC (Dev)"
              >
                <FlaskConical className="h-3 w-3" /> QA
              </button>
            )}
          </div>
        </header>

        {/* === SÂN KHẤU ĐỒNG NHẤT (UNIFIED VIEWPORT — THUẦN QUAN SÁT TĨNH) === */}
        <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
          <div
            className={`relative flex h-full w-full max-w-5xl flex-col justify-between overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-md transition ${
              isDementiaLocked ? 'grayscale-[45%]' : ''
            }`}
            style={{
              background:
                player.current_location_id === 'LOC_HOME'
                  ? 'linear-gradient(180deg, #FAF6EE 0%, #FAF6EE 66%, #E5DBC7 66%, #E5DBC7 100%)'
                  : 'linear-gradient(180deg, #EFE9DA 0%, #EFE9DA 68%, #D9CEB8 68%, #D9CEB8 100%)'
            }}
          >
            {/* Dải nhãn địa điểm & vùng miền trên góc sân khấu */}
            <div className="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[#D4C6AE] bg-[#FAF6EE]/90 px-4 py-2 text-xs">
              <div className="flex items-center gap-2 font-bold">
                <MapPin className="h-4 w-4 text-[#B8382A]" />
                <span>{translateVi(player.current_location_id)}</span>
                {player.current_location_id === 'LOC_HOME' && (
                  <span className="rounded bg-[#EAE1D0] px-2 py-0.5 text-[11px]">
                    {translateVi(player.current_sub_node_id)} (Nhà cấp {player.house_tier})
                  </span>
                )}
              </div>
              <span className="text-[11px] font-semibold text-[#5A5043]">
                {player.current_region === 'RURAL' ? 'Vùng Quê Nông Thôn' : 'Khu Đô Thị Thành Phố'}
              </span>
            </div>

            {/* Lớp vẽ xếp lớp Nội thất đã mua (visual_slot) khi đang ở trong phòng nhà riêng */}
            <div className="relative flex-1">
              {hud.placed_furniture_in_current_room.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-[#6B5B47]">
                  <div className="rounded border border-dashed border-[#B7A98E] bg-[#FAF6EE]/80 px-5 py-4">
                    <div className="font-serif text-base font-bold text-[#1F1B16]">
                      {player.current_location_id === 'LOC_HOME'
                        ? translateVi(player.current_sub_node_id)
                        : translateVi(player.current_location_id)}
                    </div>
                    <p className="mt-1">
                      {player.current_location_id === 'LOC_HOME'
                        ? 'Căn phòng hiện còn trống trải. Nội thất bạn mua sẽ tự động hiện đúng vị trí tại đây.'
                        : 'Mở menu Tương Tác ở thanh đáy để thực hiện các việc được phép tại địa điểm này.'}
                    </p>
                  </div>
                </div>
              ) : (
                hud.placed_furniture_in_current_room.map((furn) => (
                  <div
                    key={furn.instance_id}
                    style={{
                      position: 'absolute',
                      left: `${furn.visual_slot.anchor_x_pct}%`,
                      top: `${furn.visual_slot.anchor_y_pct}%`,
                      width: `${furn.visual_slot.width_pct}%`,
                      zIndex: furn.visual_slot.z_index
                    }}
                    className={`rounded border-2 p-2 text-center shadow-sm ${
                      furn.is_broken_locked
                        ? 'border-[#B8382A] bg-[#FDECE9]/95 text-[#7A1C12]'
                        : 'border-[#1F1B16] bg-[#FAF6EE]/95 text-[#1F1B16]'
                    }`}
                  >
                    <div className="text-xs font-bold">{furn.display_name}</div>
                    <div className="mt-0.5 text-[10px] italic text-[#5A5043]">
                      {furn.is_broken_locked ? 'Đã hỏng — Cần gọi thợ sửa' : furn.sensory_monologue}
                    </div>
                  </div>
                ))
              )}

              {/* Dòng thông báo phản hồi thao tác gần nhất ở mép dưới sân khấu */}
              {feedbackToastVi && !cutscene && !activePopup && (
                <div className="absolute bottom-3 left-4 right-4 z-20 rounded border border-[#1F1B16] bg-[#FAF6EE]/95 px-3.5 py-2 text-xs font-medium text-[#1F1B16] shadow">
                  {feedbackToastVi}
                </div>
              )}
            </div>

            {/* TRẠNG THÁI 2 CỦA SÂN KHẤU: MINI CUTSCENE 3 GIÂY (CHỮ TRỰC TIẾP LÊN MẶT TRANH) */}
            {cutscene && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#1F1B16]/75 p-6 text-center text-[#FAF6EE]">
                <Sparkles className="mb-3 h-7 w-7 text-[#F3D19C]" />
                <p
                  className="max-w-lg text-lg font-semibold leading-relaxed"
                  style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
                >
                  {cutscene.caption_vi}
                </p>
                <div className="mt-5 h-1.5 w-64 overflow-hidden rounded-full bg-[#FAF6EE]/25">
                  <div
                    className="h-full bg-[#E5A952] transition-all duration-150"
                    style={{ width: `${Math.min(100, cutscene.progress_pct)}%` }}
                  />
                </div>
              </div>
            )}

            {/* TRẠNG THÁI 3 CỦA SÂN KHẤU: POPUP SỰ KIỆN 3 MÀU ĐẾM NGƯỢC 3-15 GIÂY */}
            {activePopup && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#1F1B16]/70 p-4">
                <div
                  className={`w-full max-w-lg space-y-4 rounded-md border-2 bg-[#FAF6EE] p-5 shadow-2xl ${
                    activePopup.ui_kind === 'danger'
                      ? 'border-[#B8382A]'
                      : activePopup.ui_kind === 'chance'
                        ? 'border-[#27AE60]'
                        : 'border-[#1F1B16]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-bold text-white ${
                        activePopup.ui_kind === 'danger'
                          ? 'bg-[#B8382A]'
                          : activePopup.ui_kind === 'chance'
                            ? 'bg-[#27AE60]'
                            : 'bg-[#5A5043]'
                      }`}
                    >
                      {activePopup.ui_kind === 'danger'
                        ? 'SỰ KIỆN NGUY HIỂM'
                        : activePopup.ui_kind === 'chance'
                          ? 'CƠ HỘI BẤT NGỜ'
                          : 'BIẾN CỐ ĐỜI THƯỜNG'}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#B8382A]">
                      {ptsdFreezeLeft > 0
                        ? `Đóng băng PTSD: ${ptsdFreezeLeft.toFixed(1)}s`
                        : `Còn ${popupSecondsLeft.toFixed(1)}s`}
                    </span>
                  </div>

                  {/* Thanh đếm ngược trực quan */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E4DAC8]">
                    <div
                      className={`h-full transition-all duration-100 ${
                        activePopup.ui_kind === 'danger' ? 'bg-[#B8382A]' : 'bg-[#1F1B16]'
                      }`}
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            (popupSecondsLeft / Math.max(1, activePopup.effective_countdown_seconds)) *
                              100
                          )
                        )}%`
                      }}
                    />
                  </div>

                  <div>
                    <h3
                      className="text-base font-bold text-[#1F1B16]"
                      style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
                    >
                      {activePopup.title_vi}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#3A3126]">
                      {activePopup.narrative_body_vi}
                    </p>
                  </div>

                  {activePopup.hide_choices_due_to_dementia ? (
                    <div className="rounded border border-dashed border-[#B8382A] bg-[#FDECE9] p-3 text-center text-xs italic text-[#7A1C12]">
                      Trí nhớ mờ mịt không thể tự phán đoán... Cơ thể tự phản xạ theo thói quen cũ khi hết giờ.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activePopup.available_choices.map((ch) => (
                        <button
                          key={ch.choice_id}
                          type="button"
                          disabled={ptsdFreezeLeft > 0}
                          onClick={() => {
                            setActivePopup(null);
                            runEngineCommand({
                              type: 'SUBMIT_EVENT_CHOICE',
                              selected_choice_id: ch.choice_id
                            });
                          }}
                          className="w-full rounded border border-[#1F1B16] bg-white px-3.5 py-2.5 text-left text-xs font-semibold transition hover:border-[#B8382A] hover:bg-[#FFF5F3] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {ch.button_label_vi}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* === THANH ĐÁY CẢM QUAN KHÔNG SỐ & 4 NÚT CHỨC NĂNG GOM === */}
        <footer
          className={`shrink-0 border-t-2 border-[#1F1B16] bg-[#FAF6EE] px-4 py-3 transition ${
            isHudBottomDisabled ? 'pointer-events-none opacity-45' : ''
          }`}
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Khối Cảm quan Không số: 2 Đèn 5 màu + Câu độc thoại cơ thể */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full border border-[#1F1B16]/40"
                    style={{ backgroundColor: COLOR_HEX_MAP[hud.health_color] }}
                  />
                  Sức khỏe: <strong>{hud.health_label_vi}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full border border-[#1F1B16]/40"
                    style={{ backgroundColor: COLOR_HEX_MAP[hud.happiness_color] }}
                  />
                  Hạnh phúc: <strong>{hud.happiness_label_vi}</strong>
                </span>
                {isDementiaLocked && (
                  <span className="rounded bg-[#B8382A] px-2 py-0.5 text-[10px] font-bold text-white">
                    TỰ HÀNH VÔ THỨC (LÚ LẪN)
                  </span>
                )}
              </div>
              <p className="truncate text-xs italic text-[#4A3F30]">“{hud.body_monologue_vi}”</p>
            </div>

            {/* Nhóm nút gom: TƯƠNG TÁC, DI CHUYỂN, TÚI ĐỒ, HỒ SƠ, NHẬT KÝ */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isDementiaLocked}
                onClick={() => setActiveModal('INTERACT')}
                className="inline-flex items-center gap-1.5 rounded bg-[#B8382A] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#9E2D20] disabled:opacity-40"
              >
                <Hand className="h-4 w-4" /> Tương Tác
              </button>

              <button
                type="button"
                disabled={isDementiaLocked}
                onClick={() => setActiveModal('MOVE')}
                className="inline-flex items-center gap-1.5 rounded bg-[#1F1B16] px-3.5 py-2 text-xs font-bold text-[#FAF6EE] hover:bg-[#332C24] disabled:opacity-40"
              >
                <Compass className="h-4 w-4" /> Di Chuyển
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('BAG')}
                className="inline-flex items-center gap-1.5 rounded border border-[#1F1B16] bg-[#F2ECE0] px-3 py-2 text-xs font-bold hover:bg-[#E5DAC5]"
              >
                <Backpack className="h-4 w-4" /> Túi Đồ
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('PROFILE')}
                className="inline-flex items-center gap-1.5 rounded border border-[#1F1B16] bg-[#F2ECE0] px-3 py-2 text-xs font-bold hover:bg-[#E5DAC5]"
              >
                <User className="h-4 w-4" /> Hồ Sơ
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('JOURNAL')}
                className="inline-flex items-center gap-1.5 rounded border border-[#1F1B16] bg-[#F2ECE0] px-3 py-2 text-xs font-bold hover:bg-[#E5DAC5]"
              >
                <BookOpen className="h-4 w-4" /> Nhật Ký
              </button>
            </div>
          </div>
        </footer>

        {/* ====================================================================
            LỚP MODAL 70% PHỦ XÁM MÀN HÌNH (CHUẨN MASTER TECHNICAL HANDOFF)
           ==================================================================== */}
        {activeModal !== 'NONE' && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1B16]/65 p-4"
            onClick={() => setActiveModal('NONE')}
          >
            <div
              className="flex max-h-[76vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#C8BFA8] bg-[#EFE7D7] px-4 py-3">
                <h2
                  className="text-base font-bold text-[#B8382A]"
                  style={{ fontFamily: '"Noto Serif", "Times New Roman", serif' }}
                >
                  {activeModal === 'INTERACT' &&
                    `Tương Tác Tại ${translateVi(player.current_location_id)}`}
                  {activeModal === 'MOVE' && 'Di Chuyển Phòng & Bản Đồ Khu Vực'}
                  {activeModal === 'BAG' && 'Túi Đồ Hành Trang & Đồ Gia Dụng'}
                  {activeModal === 'PROFILE' && 'Hồ Sơ Nhân Vật (Mù Thông Tin)'}
                  {activeModal === 'JOURNAL' && 'Nhật Ký Đời Người Đang Viết'}
                  {activeModal === 'MEDICAL_REPORT' && 'Phiếu Kết Quả Khám Bệnh Đa Khoa'}
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveModal('NONE')}
                  className="rounded p-1 hover:bg-[#DFD4BF]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
                {/* --- MODAL A: CLEAN MENU TƯƠNG TÁC (KÈM ICON MŨI TÊN TĂNG/GIẢM) --- */}
                {activeModal === 'INTERACT' && (
                  <>
                    {/* 1. Các hành động chuẩn theo địa điểm/phòng (Clean Menu) */}
                    <div className="space-y-2">
                      <div className="font-bold uppercase text-[#6B5B47]">
                        Thao Tác Khả Dụng Tại Chỗ (Ẩn Sạch Mục Sai Địa Điểm)
                      </div>

                      {cleanMenuActions.length === 0 &&
                        storeItemsAtCurrentSpot.length === 0 &&
                        furnitureSoldAtCurrentSpot.length === 0 && (
                          <p className="italic text-[#6B5B47]">
                            Không có thao tác chuyên biệt tại phòng/khu vực này.
                          </p>
                        )}

                      {cleanMenuActions.map((act) => {
                        // Riêng ngủ/chợp mắt tách thành 3 nút trực tiếp (Chợp mắt 20p, Ngủ trưa 45p, Ngủ đêm 7h)
                        if (act.command_type === 'SLEEP_OR_NAP') {
                          return (
                            <div
                              key={act.command_type}
                              className="space-y-1.5 rounded border border-[#D4C6AE] bg-white p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-bold">{act.label_vi}</span>
                                <ActionStatIndicators indicators={act.stat_indicators} />
                              </div>
                              <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveModal('NONE');
                                    runEngineCommand({
                                      type: 'SLEEP_OR_NAP',
                                      sleep_action_id: 'ACT_NAP_SHORT_20M'
                                    });
                                  }}
                                  className="rounded border border-[#1F1B16] bg-[#FAF6EE] px-3 py-1.5 font-semibold hover:bg-[#EAE1D0]"
                                >
                                  Chợp mắt ngắn
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveModal('NONE');
                                    runEngineCommand({
                                      type: 'SLEEP_OR_NAP',
                                      sleep_action_id: 'ACT_NAP_NOON_45M'
                                    });
                                  }}
                                  className="rounded border border-[#1F1B16] bg-[#FAF6EE] px-3 py-1.5 font-semibold hover:bg-[#EAE1D0]"
                                >
                                  Ngủ trưa
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveModal('NONE');
                                    runEngineCommand({
                                      type: 'SLEEP_OR_NAP',
                                      sleep_action_id: 'ACT_SLEEP_STANDARD_7H'
                                    });
                                  }}
                                  className="rounded bg-[#1F1B16] px-3 py-1.5 font-bold text-white hover:bg-[#332C24]"
                                >
                                  Ngủ giấc sâu trọn vẹn
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // Riêng Hiệu thuốc tách 2 lựa chọn OTC (Thuốc giảm đau vs Bốc thuốc triệu chứng)
                        if (act.command_type === 'PHARMACY_OTC') {
                          return (
                            <div
                              key={act.command_type}
                              className="space-y-2 rounded border border-[#D4C6AE] bg-white p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-bold">{act.label_vi}</span>
                                <ActionStatIndicators indicators={act.stat_indicators} />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveModal('NONE');
                                    runEngineCommand({
                                      type: 'PHARMACY_OTC',
                                      otc_mode: 'PAINKILLER'
                                    });
                                  }}
                                  className="rounded border border-[#B8382A] bg-[#FFF5F3] px-3 py-1.5 font-semibold text-[#B8382A]"
                                >
                                  Mua Thuốc Giảm Đau (45.000đ)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveModal('NONE');
                                    runEngineCommand({
                                      type: 'PHARMACY_OTC',
                                      otc_mode: 'SYMPTOM_GUESS_OTC'
                                    });
                                  }}
                                  className="rounded border border-[#1F1B16] bg-[#FAF6EE] px-3 py-1.5 font-semibold"
                                >
                                  Kể triệu chứng nhờ bốc thuốc OTC (85.000đ)
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // Các nút hành động trực tiếp khác
                        return (
                          <button
                            key={act.command_type}
                            type="button"
                            onClick={() => {
                              setActiveModal('NONE');
                              if (act.command_type === 'EAT_MEAL') {
                                runEngineCommand({ type: 'EAT_MEAL', input: { mode: 'HOME_COOKED' } });
                              } else if (act.command_type === 'USE_TOILET') {
                                runEngineCommand({ type: 'USE_TOILET' });
                              } else if (act.command_type === 'TAKE_SHOWER') {
                                runEngineCommand({ type: 'TAKE_SHOWER' });
                              } else if (act.command_type === 'CLEAN_HOUSE') {
                                runEngineCommand({ type: 'CLEAN_HOUSE' });
                              } else if (act.command_type === 'HOSPITAL_FULL_EXAM') {
                                runEngineCommand({ type: 'HOSPITAL_FULL_EXAM' });
                              } else if (act.command_type === 'BUY_USE_RX_MEDICINE') {
                                runEngineCommand({ type: 'BUY_USE_RX_MEDICINE' });
                              } else if (act.command_type === 'HOSPITAL_REHAB') {
                                runEngineCommand({ type: 'HOSPITAL_REHAB' });
                              } else if (act.command_type === 'STUDY_SCHOOL') {
                                runEngineCommand({ type: 'STUDY_SCHOOL' });
                              } else if (act.command_type === 'WORK_SHIFT') {
                                runEngineCommand({
                                  type: 'WORK_SHIFT',
                                  input: { shift_type: 'SHIFT_DAY', hours_worked: 4 }
                                });
                              } else if (act.command_type === 'REFUEL_VEHICLE') {
                                runEngineCommand({ type: 'REFUEL_VEHICLE', option: 'REFUEL_50K' });
                              } else if (act.command_type === 'BANK_OR_NOTARY') {
                                runEngineCommand({
                                  type: 'BANK_OR_NOTARY',
                                  input: {
                                    operation: 'NOTARIZE_WILL',
                                    will_lines: [
                                      {
                                        beneficiary_name: 'Quỹ Từ Thiện Cộng Đồng',
                                        relation_label_vi: 'Người thụ hưởng',
                                        percentage_share: 100
                                      }
                                    ]
                                  }
                                });
                              }
                            }}
                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded border border-[#1F1B16] bg-white px-3.5 py-2.5 text-left transition hover:border-[#B8382A] hover:bg-[#FFF5F3]"
                          >
                            <span className="font-bold">{act.label_vi}</span>
                            <ActionStatIndicators indicators={act.stat_indicators} />
                          </button>
                        );
                      })}
                    </div>

                    {/* 2. Tương tác lên Nội thất ĐÃ MUA đặt trong phòng hiện tại */}
                    {hud.placed_furniture_in_current_room.length > 0 && (
                      <div className="space-y-2 border-t border-[#D4C6AE] pt-3">
                        <div className="font-bold uppercase text-[#6B5B47]">
                          Thiết Bị & Nội Thất Trong Phòng
                        </div>
                        {hud.placed_furniture_in_current_room.map((furn) => (
                          <div
                            key={furn.instance_id}
                            className="space-y-2 rounded border border-[#D4C6AE] bg-white p-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{furn.display_name}</span>
                              {furn.is_broken_locked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveModal('NONE');
                                    runEngineCommand({
                                      type: 'REPAIR_EQUIPMENT',
                                      target_kind: 'HOME_FURNITURE',
                                      instance_id: furn.instance_id
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 rounded bg-[#B8382A] px-2.5 py-1 font-bold text-white"
                                >
                                  <Wrench className="h-3 w-3" /> Gọi Thợ Tới Nhà Sửa
                                </button>
                              )}
                            </div>
                            <p className="italic text-[#5A5043]">{furn.sensory_monologue}</p>
                            <div className="space-y-1.5">
                              {furn.available_actions.map((fa) => (
                                <button
                                  key={fa.action_id}
                                  type="button"
                                  onClick={() => {
                                    setActiveModal('NONE');
                                    runEngineCommand({
                                      type: 'INTERACT_FURNITURE',
                                      furniture_id: furn.furniture_id,
                                      action_id: fa.action_id
                                    });
                                  }}
                                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded border border-[#C8BFA8] bg-[#FAF6EE] px-3 py-2 text-left hover:border-[#B8382A]"
                                >
                                  <span className="font-semibold">{fa.button_label}</span>
                                  <ActionStatIndicators indicators={fa.stat_indicators} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 3. Quầy mua sắm Location-Bound (chỉ hiện tại Siêu thị / Cửa hàng Công nghệ / Chợ đồ cũ) */}
                    {(storeItemsAtCurrentSpot.length > 0 || furnitureSoldAtCurrentSpot.length > 0) && (
                      <div className="space-y-2 border-t border-[#D4C6AE] pt-3">
                        <div className="flex items-center gap-1.5 font-bold uppercase text-[#B8382A]">
                          <ShoppingBag className="h-4 w-4" />
                          Quầy Hàng Tại {translateVi(player.current_location_id)}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {storeItemsAtCurrentSpot.map((it) => {
                            const isSecondhand =
                              player.current_location_id === 'LOC_SECONDHAND_ELECTRONICS';
                            const displayPrice = isSecondhand
                              ? Math.round(it.base_price_vnd * 0.45)
                              : it.base_price_vnd;
                            return (
                              <button
                                key={it.item_def_id}
                                type="button"
                                onClick={() => {
                                  setActiveModal('NONE');
                                  runEngineCommand({ type: 'BUY_ITEM', item_def: it });
                                }}
                                className="flex items-center justify-between gap-2 rounded border border-[#C8BFA8] bg-white p-2.5 text-left hover:border-[#B8382A]"
                              >
                                <div>
                                  <div className="font-bold">{it.display_name_key}</div>
                                  <div className="text-[11px] text-[#6B5B47]">
                                    {it.weight_kg} kg •{' '}
                                    {it.usage_type === 'CONSUMABLE' ? 'Tiêu thụ' : 'Dùng bền'}
                                  </div>
                                </div>
                                <span className="shrink-0 font-bold text-[#B8382A]">
                                  {displayPrice.toLocaleString('vi-VN')} đ
                                </span>
                              </button>
                            );
                          })}

                          {furnitureSoldAtCurrentSpot.map((furn) => {
                            const isSecondhand =
                              player.current_location_id === 'LOC_SECONDHAND_ELECTRONICS';
                            const displayPrice = isSecondhand
                              ? Math.round(furn.base_price_vnd * 0.45)
                              : furn.base_price_vnd;
                            return (
                              <button
                                key={furn.furniture_id}
                                type="button"
                                onClick={() => {
                                  setActiveModal('NONE');
                                  runEngineCommand({
                                    type: 'BUY_FURNITURE',
                                    furniture_id: furn.furniture_id
                                  });
                                }}
                                className="flex items-center justify-between gap-2 rounded border border-[#1F1B16] bg-[#FFFDF8] p-2.5 text-left hover:border-[#B8382A]"
                              >
                                <div>
                                  <div className="font-bold">{translateVi(furn.name_key)}</div>
                                  <div className="text-[11px] text-[#6B5B47]">
                                    Nội thất giao thẳng về Nhà Riêng
                                  </div>
                                </div>
                                <span className="shrink-0 font-bold text-[#B8382A]">
                                  {displayPrice.toLocaleString('vi-VN')} đ
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* --- MODAL B: DI CHUYỂN PHÒNG & BẢN ĐỒ KHU VỰC (RURAL / URBAN) --- */}
                {activeModal === 'MOVE' && (
                  <>
                    {player.current_location_id === 'LOC_HOME' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 font-bold uppercase text-[#6B5B47]">
                          <Home className="h-4 w-4" /> Chuyển Phòng Trong Nhà (Cấp {player.house_tier})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {unlockedHomeRooms.map((roomId) => (
                            <button
                              key={roomId}
                              type="button"
                              onClick={() => {
                                setActiveModal('NONE');
                                runEngineCommand({ type: 'SWITCH_HOME_ROOM', sub_node_id: roomId });
                              }}
                              className={`rounded border px-3 py-1.5 font-bold ${
                                player.current_sub_node_id === roomId
                                  ? 'border-[#B8382A] bg-[#B8382A] text-white'
                                  : 'border-[#1F1B16] bg-white hover:bg-[#EAE1D0]'
                              }`}
                            >
                              {translateVi(roomId)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 border-t border-[#D4C6AE] pt-3">
                      <div className="font-bold uppercase text-[#B8382A]">
                        Bản Đồ Khu Vực ({player.current_region === 'RURAL' ? 'Nông Thôn' : 'Thành Thị'})
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {ALL_MAP_LOCATION_IDS.filter((locId) => !lockedLocations.includes(locId)).map(
                          (locId) => {
                            const distKm = calculateDistanceKmBetweenLocations(
                              player.current_location_id,
                              locId
                            );
                            const isHere = player.current_location_id === locId;
                            return (
                              <button
                                key={locId}
                                type="button"
                                disabled={isHere}
                                onClick={() => {
                                  setActiveModal('NONE');
                                  runEngineCommand({
                                    type: 'TRAVEL_TO_LOCATION',
                                    target_location_id: locId,
                                    transit_mode: player.active_vehicle ? 'OWN_VEHICLE' : 'PUBLIC_BUS'
                                  });
                                }}
                                className={`flex items-center justify-between rounded border px-3 py-2 text-left transition ${
                                  isHere
                                    ? 'border-[#B8382A] bg-[#FDECE9] font-bold text-[#B8382A]'
                                    : 'border-[#C8BFA8] bg-white hover:border-[#1F1B16]'
                                }`}
                              >
                                <span className="font-semibold">{translateVi(locId)}</span>
                                <span className="text-[11px] text-[#6B5B47]">
                                  {isHere ? 'Đang ở đây' : `${distKm} km`}
                                </span>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>

                    {/* Chuyển vùng Nông Thôn <-> Thành Thị khi đủ 18 tuổi */}
                    {player.identity_biometrics.exact_age_years >= 18 && (
                      <div className="border-t border-[#D4C6AE] pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal('NONE');
                            runEngineCommand({
                              type: 'MIGRATE_REGION',
                              target_region: player.current_region === 'RURAL' ? 'URBAN' : 'RURAL'
                            });
                          }}
                          className="w-full rounded border border-[#1F1B16] bg-[#EAE1D0] px-3 py-2 font-bold hover:bg-[#DFD4BF]"
                        >
                          {player.current_region === 'RURAL'
                            ? translateVi('act_migrate_to_city_label')
                            : translateVi('act_return_to_countryside_label')}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* --- MODAL C: TÚI ĐỒ HÀNH TRANG ĐỘNG (KG) & PHIẾU KHÁM BỆNH --- */}
                {activeModal === 'BAG' && carryStatus && (
                  <div className="space-y-3">
                    <div
                      className={`rounded border p-3 font-bold ${
                        carryStatus.is_overburdened
                          ? 'border-[#B8382A] bg-[#FDECE9] text-[#B8382A]'
                          : 'border-[#C8BFA8] bg-[#F2ECE0]'
                      }`}
                    >
                      Tải trọng đang mang: {carryStatus.current_weight_kg} /{' '}
                      {carryStatus.max_capacity_kg} kg{' '}
                      {carryStatus.is_overburdened && '— QUÁ TẢI (Đi chậm ×1.3 & đau lưng)'}
                    </div>

                    <div className="space-y-2">
                      {player.inventory_items.map((item) => (
                        <div
                          key={item.instance_id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#D4C6AE] bg-white p-3"
                        >
                          <div>
                            <div className="font-bold">{translateVi(item.display_name_key)}</div>
                            <div className="text-[11px] text-[#6B5B47]">
                              {item.weight_kg} kg •{' '}
                              {item.usage_type === 'CONSUMABLE'
                                ? `Còn ${item.remaining_servings ?? 1} phần`
                                : 'Đồ dùng bền'}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {item.category === 'FOOD' && item.usage_type === 'CONSUMABLE' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveModal('NONE');
                                  runEngineCommand({
                                    type: 'EAT_MEAL',
                                    input: {
                                      mode: 'FROM_INVENTORY',
                                      inventoryInstanceId: item.instance_id
                                    }
                                  });
                                }}
                                className="rounded bg-[#1F1B16] px-2.5 py-1 font-bold text-white"
                              >
                                Ăn Ngay
                              </button>
                            )}

                            {item.item_def_id === 'ITEM_MEDICAL_REPORT' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setViewingReportItem(item);
                                  setActiveModal('MEDICAL_REPORT');
                                }}
                                className="inline-flex items-center gap-1 rounded bg-[#B8382A] px-2.5 py-1 font-bold text-white"
                              >
                                <FileText className="h-3.5 w-3.5" /> Đọc Bệnh Án
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* --- MODAL D: HỒ SƠ MÙ THÔNG TIN (UC-03) --- */}
                {activeModal === 'PROFILE' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded border border-[#D4C6AE] bg-white p-3">
                        <div className="text-[11px] text-[#6B5B47]">Họ & Tên</div>
                        <div className="font-bold">{hud.blind_profile_view.full_name}</div>
                      </div>
                      <div className="rounded border border-[#D4C6AE] bg-white p-3">
                        <div className="text-[11px] text-[#6B5B47]">Tuổi / Học vấn</div>
                        <div className="font-bold">
                          {hud.blind_profile_view.age_years} tuổi •{' '}
                          {player.identity_biometrics.education_level_key}
                        </div>
                      </div>
                      <div className="rounded border border-[#D4C6AE] bg-white p-3">
                        <div className="text-[11px] text-[#6B5B47]">Tính cách ngầm</div>
                        <div className="font-bold">
                          {hud.blind_profile_view.personality_display_vi}
                        </div>
                      </div>
                      <div className="rounded border border-[#D4C6AE] bg-white p-3">
                        <div className="text-[11px] text-[#6B5B47]">Vóc dáng & BMI</div>
                        <div className="font-bold">
                          {hud.blind_profile_view.biometrics_display_vi}
                        </div>
                      </div>
                      <div className="rounded border border-[#D4C6AE] bg-white p-3">
                        <div className="text-[11px] text-[#6B5B47]">Sở thích</div>
                        <div className="font-bold">{hud.blind_profile_view.hobby_display_vi}</div>
                      </div>
                      <div className="rounded border border-[#D4C6AE] bg-white p-3">
                        <div className="text-[11px] text-[#6B5B47]">Tiền tiết kiệm / BHXH</div>
                        <div className="font-bold">
                          {player.bank_savings_vnd.toLocaleString('vi-VN')} đ •{' '}
                          {player.has_social_insurance ? 'Có BHXH (-80% viện phí)' : 'Chưa có BHXH'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- MODAL E: NHẬT KÝ ĐỜI NGƯỜI ĐANG GHI CHÉP --- */}
                {activeModal === 'JOURNAL' && (
                  <div className="space-y-2">
                    {session.journal_logs.length === 0 ? (
                      <p className="italic text-[#6B5B47]">Chưa có ghi chép nào.</p>
                    ) : (
                      [...session.journal_logs].reverse().map((log, idx) => (
                        <div
                          key={idx}
                          className="rounded border border-[#DFD5C2] bg-white px-3 py-2 leading-relaxed"
                        >
                          <strong className="text-[#B8382A]">
                            [{log.age_recorded} tuổi{log.date_str_vi ? ` • ${log.date_str_vi}` : ''}]
                          </strong>{' '}
                          {log.text_vi}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* --- MODAL F: PHIẾU KẾT QUẢ KHÁM BỆNH ĐA KHOA (KHÔNG HIỆN %) --- */}
                {activeModal === 'MEDICAL_REPORT' && viewingReportItem && (
                  <div className="space-y-3">
                    <div className="rounded border border-[#1F1B16] bg-white p-4">
                      <div className="border-b border-[#C8BFA8] pb-2 text-center">
                        <div className="font-serif text-base font-bold text-[#B8382A]">
                          PHIẾU KẾT QUẢ XÉT NGHIỆM TỔNG QUÁT
                        </div>
                        <div className="text-[11px] text-[#6B5B47]">
                          Bệnh nhân: {player.identity_biometrics.full_name} • Ngày khám:{' '}
                          {viewingReportItem.medical_report_date_str || formatSessionDateVi(session)}
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(viewingReportItem.medical_diagnoses || []).map((diag) => (
                          <div
                            key={diag.organ_key}
                            className={`rounded border p-2.5 ${
                              diag.severity_tag === 'CRITICAL'
                                ? 'border-[#B8382A] bg-[#FDECE9]'
                                : diag.severity_tag === 'WARNING'
                                  ? 'border-[#D4AC0D] bg-[#FEF9E7]'
                                  : 'border-[#DFD5C2] bg-[#FAF6EE]'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span>{diag.organ_label_vi}</span>
                              <span>
                                {diag.severity_tag === 'CRITICAL'
                                  ? 'NGUY KỊCH'
                                  : diag.severity_tag === 'WARNING'
                                    ? 'CẦN THEO DÕI'
                                    : 'ỔN ĐỊNH'}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#4A3F30]">
                              {diag.clinical_note_vi}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        fontFamily: '"Be Vietnam Pro", "Segoe UI", Roboto, Arial, sans-serif',
        fontVariantNumeric: 'lining-nums'
      }}
    >
      {/* Cổng DevOnlyAdminGate tự cắt bỏ hoàn toàn trang Admin JSON khi build Desktop Tauri */}
      <DevOnlyAdminGate enableFloatingButton={!showDevQaObserver}>
        {renderMainContent()}
      </DevOnlyAdminGate>
    </div>
  );
}