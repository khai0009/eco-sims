// Hợp đồng kiểu dữ liệu cốt lõi dùng chung cho Engine Trung Tâm và 9 mô-đun nghiệp vụ.
// Quy chuẩn V3.1: Toàn bộ chỉ số sinh học, nhu cầu, cảm xúc, độ bền và tiến độ kỹ năng đều dùng chung thang 0 - 100 (STAT_MAX_VALUE = 100).

import type {
  ColorCode,
  DurabilityGrade,
  PersonalityCode,
  VisualSlotConfig
} from './jsonDatabaseLoader';

// ============================================================================
// 0. HẰNG SỐ THANG ĐO THỐNG NHẤT 0 - 100 CHO TOÀN HỆ THỐNG
// ============================================================================

export const STAT_MIN_VALUE = 0.0;
export const STAT_MAX_VALUE = 100.0;

// ============================================================================
// 1. KIỂU DỮ LIỆU ICON CHỈ BÁO CHIỀU TÁC ĐỘNG (KHÔNG SỐ - KIỂU GTA 6 / DIEGETIC)
// ============================================================================

export type StatIndicatorId =
  | 'SATIETY'
  | 'ENERGY_SLEEP'
  | 'BLADDER_COMFORT'
  | 'HYGIENE'
  | 'HOUSE_CLEANLINESS'
  | 'HAPPINESS'
  | 'HEALTH_GENERAL'
  | 'MONEY'
  | 'TIME_SKILL';

export type StatChangeDirection = 'UP' | 'DOWN';

export interface ActionStatIndicatorDto {
  stat_id: StatIndicatorId;
  icon_name: string;
  label_vi: string;
  direction: StatChangeDirection; // UP = hướng lên (tăng/hồi), DOWN = hướng xuống (giảm/tiêu hao)
  intensity: 1 | 2; // 1 = mức nhẹ (1 mũi tên), 2 = mức mạnh (2 mũi tên)
}

// ============================================================================
// 2. KIỂU DỮ LIỆU SINH HỌC, NỘI TẠNG & DEBUFF LẠM DỤNG (ĐỀU THUỘC THANG 0 - 100)
// ============================================================================

export type FamilyTierCode = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5';
export type RegionCode = 'RURAL' | 'URBAN';
export type WeatherCode = 'CLEAR' | 'RAIN' | 'STORM' | 'STORM_FLOOD' | 'HEATWAVE' | 'PM25_HIGH';
export type EnvironmentExposure = 'INDOOR' | 'OUTDOOR';
export type PartQualityTier = 'STANDARD_NORMAL' | 'MEDIUM_OEM' | 'PREMIUM_GENUINE';
export type AutoSaveTriggerReason = 'ACTION_COMPLETED' | 'EVENT_TRIGGERED' | 'APP_EXIT_SUSPEND';

export type ActiveOveruseDebuffId =
  | 'DEBUFF_PAINKILLER_OVERUSE'
  | 'DEBUFF_NICOTINE_WITHDRAWAL'
  | 'DEBUFF_ALCOHOL_OVERUSE'
  | 'DEBUFF_ALCOHOL_WITHDRAWAL'
  | 'DEBUFF_STIMULANT_HEART_OVERLOAD'
  | 'DEBUFF_CLINICAL_BURNOUT'
  | 'DEBUFF_CIRCADIAN_SHOCK'
  | 'DEBUFF_STRATIFIED_FOOD_FATIGUE'
  | 'DEBUFF_FRAGMENTED_NAP_FATIGUE';

export interface OrganStateMap {
  brain: number; // 0 - 100
  heart: number; // 0 - 100
  lungs: number; // 0 - 100
  liver: number; // 0 - 100
  digestive: number; // 0 - 100
  musculoskeletal: number; // 0 - 100
  kidneys: number; // 0 - 100
  integumentary_skin: number; // 0 - 100
}

export interface OveruseTrackerState {
  painkiller_doses_last_24h: number;
  stimulant_doses_last_24h: number;
  alcohol_sessions_last_24h: number;
  alcohol_intoxication_hours_left: number;
  nicotine_tolerance: number; // 0 - 100
  hours_since_last_nicotine: number;
  alcohol_tolerance: number; // 0 - 100
  hours_since_last_alcohol: number;
  weekly_work_hours: number;
  consecutive_night_shifts: number;
  circadian_shock_hours_left: number;
  last_meal_def_id: string | null;
  consecutive_same_meal_count: number;
  active_debuff_ids: ActiveOveruseDebuffId[];
}

// ============================================================================
// 3. HÀNH TRANG, NỘI THẤT, PHƯƠNG TIỆN & HỒ SƠ Y TẾ
// ============================================================================

export interface OwnedFurnitureInstance {
  instance_id: string;
  furniture_id: string;
  current_durability_pct: number; // 0 - 100
  max_durability_cap_pct: number; // 0 - 100 (giảm 5% mỗi lần sửa)
}

export interface MedicalDiagnosisLine {
  organ_key: keyof OrganStateMap;
  organ_label_vi: string;
  severity_tag: 'NORMAL' | 'WARNING' | 'CRITICAL';
  clinical_note_vi: string;
}

export interface OwnedInventoryItemInstance {
  instance_id: string;
  item_def_id: string;
  display_name_key: string;
  category: 'FOOD' | 'VEHICLE' | 'PHONE' | 'CLOTHING' | 'MEDICAL' | 'OTHER';
  usage_type: 'CONSUMABLE' | 'DURABLE_REUSABLE';
  size_class: 'PORTABLE_CARRY' | 'MEDIUM_APPLIANCE' | 'BULKY_HOME_APPLIANCE';
  weight_kg: number;
  current_durability_pct: number; // 0 - 100
  max_durability_cap_pct: number; // 0 - 100
  remaining_servings?: number;
  carry_bonus_kg?: number;
  has_hidden_secondhand_defect?: boolean;
  medical_report_date_str?: string;
  medical_diagnoses?: MedicalDiagnosisLine[];
}

export interface VehicleComponentState {
  quality_tier: PartQualityTier;
  durability_pct: number; // 0 - 100
}

export interface OwnedVehicleState {
  vehicle_def_id: string;
  uses_fuel: boolean;
  current_fuel_liters: number;
  max_fuel_liters: number;
  fuel_consumption_per_km: number;
  base_speed_kmh: number;
  trunk_capacity_kg: number;
  requires_license_id: string | null;
  brakes: VehicleComponentState;
  tires: VehicleComponentState;
  engine: VehicleComponentState;
}

// ============================================================================
// 4. THỰC THỂ CON NGƯỜI THỐNG NHẤT (TOÀN BỘ CHỈ SỐ CHUẨN THANG 0 - 100)
// ============================================================================

export interface HumanEntityState {
  entity_id: string;
  controller_mode: 'PLAYER_CONTROLLED' | 'AI_AUTONOMOUS';
  current_region: RegionCode;
  current_location_id: string;
  current_sub_node_id: string;
  cash_vnd: number;
  bank_savings_vnd: number;
  has_social_insurance: boolean;
  happiness_score: number; // 0 - 100 (100 = Viên mãn)
  house_tier: 1 | 2 | 3 | 4;
  identity_biometrics: {
    full_name: string;
    gender: 'MALE' | 'FEMALE';
    birth_day: number;
    birth_month: number;
    birth_year: number;
    family_tier: FamilyTierCode;
    exact_age_years: number;
    height_cm: number;
    weight_kg: number;
    education_level_key: string;
    hobby_key: string | null;
    locked_personality: PersonalityCode | null;
    innate_traits: string[];
    owned_certificates: string[];
  };
  hidden_black_box: {
    organs: OrganStateMap; // 8 tạng đều 0 - 100
    satiety_pct: number; // 0 - 100 (100 = No đủ, 0 = Đói lả)
    energy_sleep_pct: number; // 0 - 100 (100 = Tỉnh táo, 0 = Sập nguồn 40h)
    bladder_comfort_pct: number; // 0 - 100 (100 = Thoải mái, 0 = Nhịn tiểu cực độ hại Thận)
    body_hygiene_pct: number; // 0 - 100 (100 = Sạch sẽ, 0 = Bẩn hại Da)
    house_cleanliness_pct: number; // 0 - 100 (100 = Nhà sạch, 0 = Nhà bẩn)
    social_battery_pct: number; // 0 - 100 (Ẩn hoàn toàn: Pin giao tiếp xã hội theo tính cách & ASD)
    time_management_pct: number; // 0 - 100 (100 = Mở khóa kỹ năng Quản lý thời gian)
    naps_taken_since_full_sleep: number;
    ptsd_trauma_score: number; // 0 - 100
    painkiller_masked_hours_left: number;
    overuse_tracker: OveruseTrackerState;
  };
  capability_flags: {
    is_clock_visible: boolean;
    is_weather_app_visible: boolean;
    is_time_management_unlocked: boolean;
    is_biometrics_decoded: boolean;
    is_personality_decoded: boolean;
    is_dementia_autopilot: boolean;
  };
  owned_furniture: OwnedFurnitureInstance[];
  inventory_items: OwnedInventoryItemInstance[];
  active_vehicle: OwnedVehicleState | null;
  yearly_event_age_tracker: Record<string, number>;
  monthly_event_tracker: Record<string, string>;
}

// ============================================================================
// 5. KẾT QUẢ HÀNH ĐỘNG, SỰ KIỆN, CLEAN MENU & CẢM QUAN HUD
// ============================================================================

export interface ActionExecutionResult {
  ok: boolean;
  message_vi: string;
  minutes_elapsed: number;
  cutscene_caption_vi: string | null;
  auto_save_trigger: AutoSaveTriggerReason | null;
  journal_entry_added_vi?: string | null;
  triggered_accident_risk_score?: number;
}

export interface CleanMenuAvailableAction {
  command_type: string;
  label_vi: string;
  stat_indicators: ActionStatIndicatorDto[]; // Cụm icon mũi tên tăng/giảm (không số)
}

export interface EventTriggerContext {
  current_environment: EnvironmentExposure;
  current_weather: WeatherCode;
  current_day: number;
  current_month: number;
  current_year: number;
  active_condition_flag:
    | 'IN_PUBERTY'
    | 'MENSTRUATING_NO_PAD'
    | 'PREGNANT'
    | 'DRUNK'
    | 'VEHICLE_BRAKE_DECAYED'
    | 'FUEL_EMPTY_STRANDED'
    | 'OPENED_BAG_WITHOUT_SMARTPHONE'
    | 'RENT_OVERDUE_WARNING'
    | null;
  years_of_experience?: number;
}

export interface EventChoiceRenderDto {
  choice_id: string;
  button_label_vi: string;
  is_default_timeout_penalty: boolean;
  is_dementia_habit_choice: boolean;
}

export interface ActiveEventPopupDto {
  event_id: string;
  category: 'CHILDHOOD_MILESTONE' | 'DAILY_GRAY' | 'OPPORTUNITY_GREEN' | 'DANGER_RED';
  ui_kind: 'daily' | 'chance' | 'danger';
  title_vi: string;
  narrative_body_vi: string;
  base_countdown_seconds: number;
  effective_countdown_seconds: number;
  ptsd_freeze_seconds: number;
  hide_choices_due_to_dementia: boolean;
  available_choices: EventChoiceRenderDto[];
  default_timeout_choice_id: string;
  auto_save_trigger: 'EVENT_TRIGGERED';
}

export interface EventResolutionResult {
  ok: boolean;
  selected_choice_id: string;
  outcome_summary_vi: string;
  minutes_elapsed: number;
  journal_entry_vi: string | null;
  triggered_hospitalization: boolean;
  triggered_death_cause_vi: string | null;
  auto_save_trigger: 'ACTION_COMPLETED';
}

export interface PlacedFurnitureRenderDto {
  instance_id: string;
  furniture_id: string;
  display_name: string;
  status_grade: DurabilityGrade;
  is_broken_locked: boolean;
  sensory_monologue: string;
  visual_slot: VisualSlotConfig;
  available_actions: Array<{
    action_id: string;
    button_label: string;
    stat_indicators: ActionStatIndicatorDto[]; // Icon hướng lên/xuống trên từng nút nội thất
  }>;
}

export interface FrontendHudProjection {
  health_light_level: 1 | 2 | 3 | 4 | 5;
  health_color: ColorCode;
  health_label_vi: string;
  happiness_light_level: 1 | 2 | 3 | 4 | 5;
  happiness_color: ColorCode;
  happiness_label_vi: string;
  body_monologue_vi: string;
  time_display_vi: string;
  is_exact_clock_shown: boolean;
  blind_profile_view: {
    full_name: string;
    age_years: number;
    hobby_display_vi: string;
    personality_display_vi: string;
    biometrics_display_vi: string;
    is_autopilot_locked: boolean;
  };
  placed_furniture_in_current_room: PlacedFurnitureRenderDto[];
}

export interface JournalLogRecord {
  age_recorded: number;
  date_str_vi?: string;
  text_vi: string;
}

export interface WillBeneficiaryLine {
  beneficiary_name: string;
  relation_label_vi: string;
  percentage_share: number;
}

export interface FrontendDeathAndMemoirDto {
  is_deceased: boolean;
  age_at_death: number;
  honorific_label_vi: string;
  cause_label_vi: string;
  season_vi: string;
  epitaph_vi: string;
  total_estate_vnd: number;
  will_lines: WillBeneficiaryLine[];
  will_fallback_note_vi: string;
  chapters: Array<{
    chapter_index: number;
    roman_numeral: string;
    title_vi: string;
    entries: JournalLogRecord[];
  }>;
}

export interface SessionClockState {
  total_days_elapsed: number;
  current_day: number;
  current_month: number;
  current_year: number;
  current_hour: number;
  current_minute: number;
  current_weather: WeatherCode;
}

export interface EcoLifeSavedSessionState {
  save_version: string;
  profile_id: string;
  last_saved_unix_ms: number;
  last_save_reason: AutoSaveTriggerReason;
  clock: SessionClockState;
  player: HumanEntityState;
  pending_popup_event_id: string | null;
  journal_logs: JournalLogRecord[];
  will_lines: WillBeneficiaryLine[];
  death_summary: FrontendDeathAndMemoirDto | null;
}

export interface NpcPresenceAtLocation {
  npc_id: string;
  full_name: string;
  role_tag: 'FRIEND_OWNER' | 'FRIEND_MOTHER_RELATIVE' | 'NEIGHBOR' | 'COLLEAGUE';
  current_location_id: string;
  bonding_score_with_player: number; // 0 - 100
  knows_where_item_is: boolean;
  is_item_currently_at_home: boolean;
}