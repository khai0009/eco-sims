import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Code,
  Copy,
  Database,
  Download,
  Edit3,
  FileJson,
  FileSpreadsheet,
  Folder,
  GitCompare,
  KeyRound,
  Layers,
  Link2,
  Lock,
  Menu,
  Network,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Table,
  Trash2,
  Undo2,
  Upload,
  X
} from 'lucide-react';

// ============================================================================
// 1. INTERFACE ĐẦU VÀO & ĐẦU RA (STRICT TYPESCRIPT - ĐỒNG BỘ VITE PLUGIN)
// ============================================================================

export interface JsonDbFileEntry {
  relative_path: string;
  folder_group: string;
  file_name: string;
  is_schema_file: boolean;
  line_count: number;
  data: Record<string, unknown>;
}

export type RelationTableKey =
  | 'LOCATION'
  | 'SUB_NODE'
  | 'ITEM_ANY'
  | 'FURNITURE'
  | 'DISEASE'
  | 'MEDICINE'
  | 'VEHICLE'
  | 'JOB'
  | 'PERSONALITY'
  | 'TRAIT'
  | 'WEATHER'
  | 'SHIFT'
  | 'USAGE_TYPE'
  | 'ENVIRONMENT'
  | 'EVENT_CATEGORY'
  | 'REGION';

export interface RelationOption {
  id: string;
  label_vi: string;
  source_file: string;
  parent_location_id?: string;
}

export interface DynamicRelationIndex {
  tables: Record<RelationTableKey, RelationOption[]>;
  primary_key_by_file: Record<string, string[]>;
  total_indexed_records: number;
}

export interface FieldForeignKeyRule {
  target_table: RelationTableKey;
  is_multi: boolean;
  filter_by_sibling_location?: boolean;
}

export interface IncomingReferenceMatch {
  source_file: string;
  collection_key: string;
  record_id: string;
  field_path: string;
  matched_id: string;
}

export interface DeleteGuardResult {
  can_delete: boolean;
  block_reason_vi: string;
  references: IncomingReferenceMatch[];
}

export interface AdminIntegrityIssue {
  id: string;
  severity: 'ERROR' | 'WARNING';
  relative_path: string;
  collection_key: string;
  record_id: string;
  message_vi: string;
}

interface DetectedCollection {
  collection_key: string;
  label_vi: string;
  kind: 'ARRAY_OF_OBJECTS' | 'OBJECT_MAP' | 'STRING_DICTIONARY';
  row_count: number;
}

interface TableRowAdapter {
  row_key: string;
  primary_id: string;
  primary_id_field: string | null;
  display_title: string;
  location_summary: string;
  category_or_type: string;
  extra_metric: string;
  numeric_sort_value: number;
  raw_value: unknown;
}

interface GlobalSearchHit {
  relative_path: string;
  collection_key: string;
  record_id: string;
  snippet_vi: string;
}

interface ToastNotice {
  type: 'SUCCESS' | 'ERROR' | 'INFO';
  text_vi: string;
}

type SortField = 'primary_id' | 'display_title' | 'category_or_type' | 'numeric_sort_value';

// ============================================================================
// 2. CẤU HÌNH NHÓM THƯ MỤC, ÁNH XẠ KHÓA NGOẠI & ENUM CHUẨN ECO-LIFE V2.5
// ============================================================================

const FOLDER_LABELS_VI: Record<string, string> = {
  character: '1. Sinh học & Tính cách (character/)',
  time: '2. Đồng hồ & Nhịp sinh học (time/)',
  daily_living: '3. Sinh hoạt hàng ngày (daily_living/)',
  devices: '4. Thiết bị & Phương tiện (devices/)',
  furniture: '5. Nội thất & Gia dụng (furniture/)',
  career_finance: '6. Học vấn, Việc làm & Tiền (career_finance/)',
  location: '7. Bản đồ & Địa điểm (location/)',
  hospital_clinic: '8. Y tế, Bệnh lý & Thuốc (hospital_clinic/)',
  event: '9. Kho Sự kiện phân mảnh (event/)',
  sensory: '10. Cảm quan không số (sensory/)',
  localization: '11. Từ điển ngôn ngữ (localization/)',
  root: '12. Cấu trúc lõi gốc (src/data/)'
};

const FOLDER_SORT_ORDER: string[] = [
  'character',
  'time',
  'daily_living',
  'devices',
  'furniture',
  'career_finance',
  'location',
  'hospital_clinic',
  'event',
  'sensory',
  'localization',
  'root'
];

// Bảng định nghĩa quan hệ khóa ngoại (Tên trường JSON -> Bảng đích sống)
const FOREIGN_KEY_FIELD_RULES: Record<string, FieldForeignKeyRule> = {
  // Nhóm Địa điểm (Location)
  location_id: { target_table: 'LOCATION', is_multi: false },
  placed_in_location_id: { target_table: 'LOCATION', is_multi: false },
  allowed_location_ids: { target_table: 'LOCATION', is_multi: true },
  sold_at_location_ids: { target_table: 'LOCATION', is_multi: true },
  forbidden_location_ids: { target_table: 'LOCATION', is_multi: true },
  usable_at_location_ids: { target_table: 'LOCATION', is_multi: true },
  repair_location_ids: { target_table: 'LOCATION', is_multi: true },
  repair_at_location_ids: { target_table: 'LOCATION', is_multi: true },
  locked_location_ids: { target_table: 'LOCATION', is_multi: true },
  required_locations: { target_table: 'LOCATION', is_multi: true },

  // Nhóm Phòng chức năng (Sub-Node) — tự lọc theo location_id cùng bản ghi nếu có
  sub_node_id: { target_table: 'SUB_NODE', is_multi: false, filter_by_sibling_location: true },
  placed_in_sub_node_id: {
    target_table: 'SUB_NODE',
    is_multi: false,
    filter_by_sibling_location: true
  },
  allowed_sub_nodes: {
    target_table: 'SUB_NODE',
    is_multi: true,
    filter_by_sibling_location: true
  },
  allowed_sub_node_ids: {
    target_table: 'SUB_NODE',
    is_multi: true,
    filter_by_sibling_location: true
  },
  placed_in_sub_node_ids: {
    target_table: 'SUB_NODE',
    is_multi: true,
    filter_by_sibling_location: true
  },
  unlocked_sub_nodes: {
    target_table: 'SUB_NODE',
    is_multi: true,
    filter_by_sibling_location: true
  },
  usable_at_sub_node_ids: {
    target_table: 'SUB_NODE',
    is_multi: true,
    filter_by_sibling_location: true
  },

  // Nhóm Vật phẩm / Thực phẩm / Đồ dùng
  consumes_item_id: { target_table: 'ITEM_ANY', is_multi: false },
  produces_item_id: { target_table: 'ITEM_ANY', is_multi: false },
  required_item_id: { target_table: 'ITEM_ANY', is_multi: false },
  available_item_ids: { target_table: 'ITEM_ANY', is_multi: true },
  required_item_ids: { target_table: 'ITEM_ANY', is_multi: true },
  missing_item_ids: { target_table: 'ITEM_ANY', is_multi: true },
  prescribed_item_ids: { target_table: 'ITEM_ANY', is_multi: true },

  // Nhóm Nội thất, Bệnh lý, Thuốc, Phương tiện, Việc làm
  requires_furniture_id: { target_table: 'FURNITURE', is_multi: false },
  disease_id: { target_table: 'DISEASE', is_multi: false },
  target_disease_ids: { target_table: 'DISEASE', is_multi: true },
  medicine_id: { target_table: 'MEDICINE', is_multi: false },
  hospital_recommended_medicine_ids: { target_table: 'MEDICINE', is_multi: true },
  vehicle_def_id: { target_table: 'VEHICLE', is_multi: false },
  current_job_id: { target_table: 'JOB', is_multi: false },

  // Nhóm Enum chuẩn của Eco-Life
  required_personality: { target_table: 'PERSONALITY', is_multi: false },
  locked_personality: { target_table: 'PERSONALITY', is_multi: false },
  required_personalities: { target_table: 'PERSONALITY', is_multi: true },
  required_innate_traits: { target_table: 'TRAIT', is_multi: true },
  inheritable_neuro_traits: { target_table: 'TRAIT', is_multi: true },
  required_weather: { target_table: 'WEATHER', is_multi: true },
  weather_in: { target_table: 'WEATHER', is_multi: true },
  available_shifts: { target_table: 'SHIFT', is_multi: true },
  shift_type: { target_table: 'SHIFT', is_multi: false },
  usage_type: { target_table: 'USAGE_TYPE', is_multi: false },
  environment_filter: { target_table: 'ENVIRONMENT', is_multi: false },
  environment_exposure: { target_table: 'ENVIRONMENT', is_multi: false },
  region_filter: { target_table: 'REGION', is_multi: true },
  available_in_regions: { target_table: 'REGION', is_multi: true }
};

const STATIC_ENUM_TABLES: Record<
  'PERSONALITY' | 'TRAIT' | 'WEATHER' | 'SHIFT' | 'USAGE_TYPE' | 'ENVIRONMENT' | 'EVENT_CATEGORY' | 'REGION',
  RelationOption[]
> = {
  PERSONALITY: [
    { id: 'PERS_INTROVERT', label_vi: 'Hướng Nội Trầm Lặng', source_file: 'enum' },
    { id: 'PERS_EXTROVERT', label_vi: 'Hướng Ngoại Xã Giao', source_file: 'enum' },
    { id: 'PERS_DAREDEVIL', label_vi: 'Táo Bạo Phiêu Lưu', source_file: 'enum' },
    { id: 'PERS_EMPATHETIC', label_vi: 'Cẩn Trọng Thấu Cảm', source_file: 'enum' },
    { id: 'PERS_AMBIVERT', label_vi: 'Linh Hoạt Trung Hòa', source_file: 'enum' }
  ],
  TRAIT: [
    { id: 'TRAIT_ADHD', label_vi: 'Tăng động giảm chú ý (ADHD)', source_file: 'enum' },
    { id: 'TRAIT_DYSLEXIA', label_vi: 'Chứng khó đọc (Dyslexia)', source_file: 'enum' },
    { id: 'TRAIT_ASD', label_vi: 'Hội chứng Phổ tự kỷ (ASD)', source_file: 'enum' },
    { id: 'TRAIT_FAST_LEARNER', label_vi: 'Tư duy tiếp thu nhanh', source_file: 'enum' },
    { id: 'CAREFUL_CHECKLIST', label_vi: 'Thói quen kiểm tra kỹ lưỡng', source_file: 'enum' },
    { id: 'QUICK_REFLEXES', label_vi: 'Phản xạ nhanh', source_file: 'enum' }
  ],
  WEATHER: [
    { id: 'CLEAR', label_vi: 'Trời quang', source_file: 'enum' },
    { id: 'RAIN', label_vi: 'Mưa rào', source_file: 'enum' },
    { id: 'STORM', label_vi: 'Giông bão', source_file: 'enum' },
    { id: 'STORM_FLOOD', label_vi: 'Mưa bão ngập sâu', source_file: 'enum' },
    { id: 'HEATWAVE', label_vi: 'Nắng nóng gay gắt', source_file: 'enum' },
    { id: 'PM25_HIGH', label_vi: 'Bụi mịn PM2.5 cao', source_file: 'enum' }
  ],
  SHIFT: [
    { id: 'SHIFT_DAY', label_vi: 'Ca sáng / Hành chính', source_file: 'enum' },
    { id: 'SHIFT_EVENING', label_vi: 'Ca chiều tối', source_file: 'enum' },
    { id: 'SHIFT_NIGHT', label_vi: 'Ca đêm (+40% lương)', source_file: 'enum' }
  ],
  USAGE_TYPE: [
    { id: 'CONSUMABLE', label_vi: 'Tiêu thụ hết thì xóa (max_servings)', source_file: 'enum' },
    { id: 'DURABLE_REUSABLE', label_vi: 'Dùng bền nhiều lần (độ bền 0-100%)', source_file: 'enum' }
  ],
  ENVIRONMENT: [
    { id: 'INDOOR', label_vi: 'Trong nhà (INDOOR)', source_file: 'enum' },
    { id: 'OUTDOOR', label_vi: 'Ngoài trời (OUTDOOR)', source_file: 'enum' },
    { id: 'BOTH', label_vi: 'Cả trong nhà lẫn ngoài trời', source_file: 'enum' }
  ],
  EVENT_CATEGORY: [
    { id: 'CHILDHOOD_MILESTONE', label_vi: 'Cột mốc tuổi thơ (0-5t)', source_file: 'enum' },
    { id: 'DAILY_GRAY', label_vi: 'Đời thường (Màu Xám)', source_file: 'enum' },
    { id: 'OPPORTUNITY_GREEN', label_vi: 'Cơ hội (Màu Xanh)', source_file: 'enum' },
    { id: 'DANGER_RED', label_vi: 'Nguy hiểm (Màu Đỏ)', source_file: 'enum' }
  ],
  REGION: [
    { id: 'RURAL', label_vi: 'Nông Thôn (RURAL)', source_file: 'enum' },
    { id: 'URBAN', label_vi: 'Thành Thị (URBAN)', source_file: 'enum' }
  ]
};

const PK_FIELD_CANDIDATES = [
  'event_id',
  'furniture_id',
  'location_id',
  'sub_node_id',
  'item_def_id',
  'item_id',
  'disease_id',
  'medicine_id',
  'job_id',
  'vehicle_def_id',
  'vehicle_id',
  'degree_id',
  'cert_id',
  'action_id',
  'surface_id',
  'debuff_id',
  'cause_id',
  'id'
];

// ============================================================================
// 3. DỮ LIỆU MẪU DỰ PHÒNG (KHI MỞ TRÊN PREVIEW KHÔNG CÓ VITE DEV SERVER)
// ============================================================================

function buildFallbackEcoLifeFiles(): JsonDbFileEntry[] {
  const sampleFiles: Array<{ path: string; folder: string; data: Record<string, unknown> }> = [
    {
      path: 'location/map_coordinates_and_transit_fares.json',
      folder: 'location',
      data: {
        metadata: { version: '2.1.0', description: 'Tọa độ địa điểm POI chuẩn trên bản đồ khu vực' },
        location_coordinates: {
          LOC_HOME: { district_zone: 'RESIDENTIAL_ZONE', map_x_km: 2.0, map_y_km: 2.0 },
          LOC_HOME_FRIEND: { district_zone: 'RESIDENTIAL_ZONE', map_x_km: 2.6, map_y_km: 2.4 },
          LOC_TRANSIT_ROAD: { district_zone: 'TRANSIT_ARTERIAL', map_x_km: 3.0, map_y_km: 3.0 },
          LOC_GAS_STATION: { district_zone: 'TRANSIT_ARTERIAL', map_x_km: 3.5, map_y_km: 3.0 },
          LOC_HOSPITAL: { district_zone: 'MEDICAL_CIVIC_ZONE', map_x_km: 6.0, map_y_km: 5.5 },
          LOC_PHARMACY: { district_zone: 'RESIDENTIAL_ZONE', map_x_km: 3.0, map_y_km: 2.2 },
          LOC_SUPERMARKET_MARKET: { district_zone: 'RESIDENTIAL_ZONE', map_x_km: 2.8, map_y_km: 2.5 },
          LOC_TECH_STORE: { district_zone: 'DOWNTOWN_CENTER', map_x_km: 8.2, map_y_km: 7.0 },
          LOC_SECONDHAND_ELECTRONICS: { district_zone: 'COMMERCIAL_ZONE', map_x_km: 4.8, map_y_km: 4.5 },
          LOC_BANK_FINANCE: { district_zone: 'DOWNTOWN_CENTER', map_x_km: 8.0, map_y_km: 7.5 },
          LOC_SCHOOL_PRIMARY: { district_zone: 'EDUCATION_ZONE', map_x_km: 2.5, map_y_km: 3.5 },
          LOC_SCHOOL_SECONDARY: { district_zone: 'EDUCATION_ZONE', map_x_km: 3.2, map_y_km: 4.0 },
          LOC_SCHOOL_HIGHSCHOOL: { district_zone: 'EDUCATION_ZONE', map_x_km: 4.5, map_y_km: 5.0 },
          LOC_UNIVERSITY_VOCATIONAL: { district_zone: 'EDUCATION_ZONE', map_x_km: 7.0, map_y_km: 6.5 },
          LOC_WORK_SME: { district_zone: 'INDUSTRIAL_OFFICE_ZONE', map_x_km: 9.5, map_y_km: 8.0 },
          LOC_WORK_OFFICE_MNC: { district_zone: 'DOWNTOWN_CENTER', map_x_km: 8.5, map_y_km: 8.5 },
          LOC_WORK_SME_FACTORY: { district_zone: 'INDUSTRIAL_OFFICE_ZONE', map_x_km: 11.5, map_y_km: 4.0 }
        }
      }
    },
    {
      path: 'location/item.json',
      folder: 'location',
      data: {
        metadata: { version: '2.4.0', description: 'Danh mục vật phẩm tiêu hao & đồ dùng bền' },
        items: [
          {
            item_def_id: 'ITEM_LAUNDRY_DETERGENT',
            name_key: 'Bột giặt quần áo (túi 2kg)',
            usage_type: 'CONSUMABLE',
            base_price_vnd: 95000,
            weight_kg: 2.0,
            max_servings: 20,
            sold_at_location_ids: ['LOC_SUPERMARKET_MARKET']
          },
          {
            item_def_id: 'ITEM_MEDICAL_REPORT',
            name_key: 'Phiếu Kết Quả Khám Bệnh Đa Khoa',
            usage_type: 'DURABLE_REUSABLE',
            base_price_vnd: 0,
            weight_kg: 0.1,
            sold_at_location_ids: ['LOC_HOSPITAL']
          },
          {
            item_def_id: 'ITEM_FOOD_HOME_COOKED_MEAL',
            name_key: 'Bữa cơm nhà nấu nóng hổi',
            usage_type: 'CONSUMABLE',
            base_price_vnd: 25000,
            weight_kg: 0.5,
            max_servings: 1,
            sold_at_location_ids: ['LOC_HOME']
          }
        ]
      }
    },
    {
      path: 'furniture/furniture_and_appliances.json',
      folder: 'furniture',
      data: {
        title: 'EcoLifeFurnitureAndAppliancesCatalog',
        version: '1.1.0',
        furniture_items: [
          {
            furniture_id: 'FURN_FRIDGE_STANDARD',
            name_key: 'Tủ lạnh 2 cánh gia đình',
            usage_type: 'DURABLE_REUSABLE',
            size_class: 'BULKY_HOME_APPLIANCE',
            base_price_vnd: 6500000,
            sold_at_location_ids: ['LOC_TECH_STORE', 'LOC_SECONDHAND_ELECTRONICS'],
            placed_in_location_id: 'LOC_HOME',
            placed_in_sub_node_id: 'HOME_KITCHEN',
            visual_slot: {
              asset_id: 'sketch_fridge_standard',
              anchor_x_pct: 14,
              anchor_y_pct: 36,
              width_pct: 20,
              z_index: 2
            }
          },
          {
            furniture_id: 'FURN_WASHING_MACHINE',
            name_key: 'Máy giặt cửa trên',
            usage_type: 'DURABLE_REUSABLE',
            size_class: 'BULKY_HOME_APPLIANCE',
            base_price_vnd: 5200000,
            sold_at_location_ids: ['LOC_TECH_STORE', 'LOC_SECONDHAND_ELECTRONICS'],
            placed_in_location_id: 'LOC_HOME',
            placed_in_sub_node_id: 'HOME_BATHROOM',
            consumes_item_id: 'ITEM_LAUNDRY_DETERGENT',
            visual_slot: {
              asset_id: 'sketch_washing_machine',
              anchor_x_pct: 68,
              anchor_y_pct: 50,
              width_pct: 18,
              z_index: 2
            }
          },
          {
            furniture_id: 'FURN_SMART_TV_SOFA_SET',
            name_key: 'Bộ Sofa & Tivi phòng khách',
            usage_type: 'DURABLE_REUSABLE',
            size_class: 'BULKY_HOME_APPLIANCE',
            base_price_vnd: 8500000,
            sold_at_location_ids: ['LOC_TECH_STORE', 'LOC_SECONDHAND_ELECTRONICS'],
            placed_in_location_id: 'LOC_HOME',
            placed_in_sub_node_id: 'HOME_LIVING_ROOM',
            visual_slot: {
              asset_id: 'sketch_sofa_tv_set',
              anchor_x_pct: 25,
              anchor_y_pct: 45,
              width_pct: 50,
              z_index: 2
            }
          }
        ]
      }
    },
    {
      path: 'hospital_clinic/disease_catalog.json',
      folder: 'hospital_clinic',
      data: {
        metadata: { version: '2.4.0', description: 'Danh mục bệnh lý & cụm triệu chứng mơ hồ' },
        diseases: [
          {
            disease_id: 'DIS_FATTY_LIVER_HEPATITIS',
            name_key: 'Men gan cao & Viêm gan nhiễm mỡ',
            affected_organ: 'liver',
            trigger_organ_threshold_max: 44.99,
            is_curable_by_otc_if_mild: false,
            hospital_recommended_medicine_ids: ['MED_HEPATITIS_SPECIAL_RX']
          }
        ]
      }
    },
    {
      path: 'hospital_clinic/medicine_and_treatment_catalog.json',
      folder: 'hospital_clinic',
      data: {
        metadata: { version: '2.4.0', description: 'Thuốc OTC hiệu thuốc vs Thuốc kê đơn Rx bệnh viện' },
        medicines: [
          {
            medicine_id: 'MED_PAINKILLER_OTC',
            name_key: 'Thuốc Giảm Đau Tức Thì (OTC)',
            usage_type: 'CONSUMABLE',
            dispense_channel: 'OTC_PHARMACY',
            requires_medical_report_item: false,
            base_price_vnd: 45000,
            sold_at_location_ids: ['LOC_PHARMACY']
          },
          {
            medicine_id: 'MED_HEPATITIS_SPECIAL_RX',
            name_key: 'Thuốc Đặc Trị Kháng Viêm Gan (Rx)',
            usage_type: 'CONSUMABLE',
            dispense_channel: 'RX_HOSPITAL_PRESCRIPTION',
            requires_medical_report_item: true,
            base_price_vnd: 420000,
            sold_at_location_ids: ['LOC_HOSPITAL', 'LOC_PHARMACY']
          }
        ]
      }
    },
    {
      path: 'career_finance/jobs_and_workplaces.json',
      folder: 'career_finance',
      data: {
        metadata: { version: '2.1.0', description: 'Danh mục việc làm & ca kíp' },
        job_catalog: [
          {
            job_id: 'JOB_STREET_HELPER',
            title_key: 'Phụ quán ăn / Bưng bê',
            employer_tier: 'TIER_1_INFORMAL',
            location_id: 'LOC_WORK_SME',
            base_monthly_salary_vnd: 5500000,
            allows_criminal_record: true,
            available_shifts: ['SHIFT_DAY', 'SHIFT_EVENING', 'SHIFT_NIGHT']
          },
          {
            job_id: 'JOB_FACTORY_WORKER',
            title_key: 'Công nhân dây chuyền nhà máy',
            employer_tier: 'TIER_2_SME',
            location_id: 'LOC_WORK_SME_FACTORY',
            base_monthly_salary_vnd: 8200000,
            allows_criminal_record: true,
            available_shifts: ['SHIFT_DAY', 'SHIFT_EVENING', 'SHIFT_NIGHT']
          },
          {
            job_id: 'JOB_MNC_SPECIALIST',
            title_key: 'Chuyên viên Tập đoàn Đa quốc gia',
            employer_tier: 'TIER_3_MNC',
            location_id: 'LOC_WORK_OFFICE_MNC',
            base_monthly_salary_vnd: 26000000,
            allows_criminal_record: false,
            available_shifts: ['SHIFT_DAY']
          }
        ]
      }
    },
    {
      path: 'character/overuse_and_debuff_rules.json',
      folder: 'character',
      data: {
        metadata: { version: '2.5.0', description: 'Quy tắc Debuff lạm dụng, lờn đô & vã cơn nghiện' },
        overuse_debuffs: {
          DEBUFF_PAINKILLER_OVERUSE: {
            debuff_id: 'DEBUFF_PAINKILLER_OVERUSE',
            category: 'MEDICAL_ABUSE',
            trigger_doses_in_24h: 2,
            time_cost_multiplier: 1.15,
            overused_liver_delta: -7.5,
            sensory_monologue_key: 'debuff_painkiller_overuse_mono'
          },
          DEBUFF_CLINICAL_BURNOUT: {
            debuff_id: 'DEBUFF_CLINICAL_BURNOUT',
            category: 'WORK_OVERUSE',
            trigger_weekly_work_hours: 65.0,
            time_cost_multiplier: 2.0,
            brain_delta_per_work_hour: -0.8,
            sensory_monologue_key: 'debuff_clinical_burnout_mono'
          }
        }
      }
    },
    {
      path: 'event/events_calendar_and_seasons.json',
      folder: 'event',
      data: {
        module_id: 'EVT_MOD_CALENDAR_AND_SEASONS',
        description: 'Sự kiện theo lịch năm & mùa vụ (T1-T12 & ngày 05)',
        events: [
          {
            event_id: 'EVT_CAL_AUGUST_BACK_TO_SCHOOL',
            category: 'DAILY_GRAY',
            environment_filter: 'BOTH',
            is_repeatable: true,
            is_once_per_year_age: true,
            base_weight: 140,
            trigger_conditions: {
              age_range: [6, 22],
              allowed_location_ids: ['LOC_HOME', 'LOC_SCHOOL_PRIMARY'],
              schedule_trigger: { allowed_months: [8, 9] }
            },
            presentation: {
              title_key: 'evt_cal_back_to_school_title',
              narrative_body_key: 'evt_cal_back_to_school_body',
              base_countdown_seconds: 12
            },
            choices: [
              {
                choice_id: 'BUY_NEW_BOOKS',
                label_key: 'evt_cal_school_choice_new_gear',
                outcomes: { time_elapsed_minutes: 90, money_delta_vnd: -350000, happiness_delta: 9 }
              }
            ]
          },
          {
            event_id: 'EVT_CAL_MONTHLY_RENT_DUE_DAY_5',
            category: 'DAILY_GRAY',
            environment_filter: 'INDOOR',
            is_repeatable: true,
            is_once_per_calendar_month: true,
            base_weight: 125,
            trigger_conditions: {
              age_range: [18, 90],
              allowed_location_ids: ['LOC_HOME'],
              schedule_trigger: { exact_day_of_month: 5 }
            },
            presentation: {
              title_key: 'evt_cal_rent_day5_title',
              narrative_body_key: 'evt_cal_rent_day5_body',
              base_countdown_seconds: 12
            },
            choices: [
              {
                choice_id: 'PAY_MONTHLY_RENT',
                label_key: 'evt_cal_rent_choice_pay',
                outcomes: { time_elapsed_minutes: 10, money_delta_vnd: -1800000 }
              }
            ]
          }
        ]
      }
    },
    {
      path: 'event/event_engine_schema.json',
      folder: 'event',
      data: {
        title: 'EcoLifeEventModuleSchema',
        version: '2.3.0',
        description: 'File cấu trúc chuẩn (Schema) — khóa cứng không cho xóa nhầm'
      }
    },
    {
      path: 'localization/vi_VN.json',
      folder: 'localization',
      data: {
        locale: 'vi-VN',
        metadata: { version: '2.5.0', description: 'Từ điển hiển thị tiếng Việt chuẩn Giấy Dó' },
        overuse_debuffs: {
          debuff_painkiller_overuse_mono:
            'Uống thuốc giảm đau dồn dập khiến bụng cồn cào nóng rát, thuốc cũng chẳng còn làm dịu cơn đau lâu như trước...',
          debuff_clinical_burnout_mono:
            'Đầu óc đặc quánh và trống rỗng sau những tuần tăng ca kiệt sức; mọi việc đơn giản cũng trở nên chậm chạp nặng nề.'
        },
        calendar_events: {
          evt_cal_back_to_school_title: 'Mùa Tựu Trường & Khai Giảng Năm Học Mới (Tháng 8 - 9)',
          evt_cal_back_to_school_body:
            'Mùa thu tựu trường đã tới, học sinh sinh viên nô nức chuẩn bị sách vở bước vào năm học mới.',
          evt_cal_school_choice_new_gear: 'Mua sách giáo khoa, tập vở và đồng phục mới (-350.000đ)',
          evt_cal_rent_day5_title: 'Hạn Đóng Tiền Thuê Trọ & Điện Nước (Ngày 05 Hàng Tháng)',
          evt_cal_rent_day5_body:
            'Đã tới ngày mùng 5 đầu tháng, chủ nhà nhắn tin nhắc thanh toán tiền thuê phòng và điện nước.',
          evt_cal_rent_choice_pay: 'Thanh toán sòng phẳng tiền trọ & điện nước (-1.800.000đ)'
        },
        locations: {
          LOC_HOME: 'Nhà Riêng',
          LOC_HOME_FRIEND: 'Nhà Bạn Thân',
          LOC_TRANSIT_ROAD: 'Đường Phố',
          LOC_GAS_STATION: 'Trạm Xăng Dầu',
          LOC_HOSPITAL: 'Bệnh Viện Đa Khoa',
          LOC_PHARMACY: 'Hiệu Thuốc Tây',
          LOC_SUPERMARKET_MARKET: 'Siêu Thị & Chợ',
          LOC_TECH_STORE: 'Cửa Hàng Công Nghệ',
          LOC_SECONDHAND_ELECTRONICS: 'Chợ Đồ Cũ Điện Tử',
          LOC_BANK_FINANCE: 'Ngân Hàng & Công Chứng',
          LOC_SCHOOL_PRIMARY: 'Trường Tiểu Học',
          LOC_SCHOOL_SECONDARY: 'Trường THCS',
          LOC_SCHOOL_HIGHSCHOOL: 'Trường THPT',
          LOC_UNIVERSITY_VOCATIONAL: 'Đại Học & Dạy Nghề',
          LOC_WORK_SME: 'Văn Phòng SME',
          LOC_WORK_OFFICE_MNC: 'Tập Đoàn MNC',
          LOC_WORK_SME_FACTORY: 'Nhà Máy Sản Xuất'
        },
        sub_nodes: {
          HOME_LIVING_ROOM: 'Phòng Khách',
          HOME_KITCHEN: 'Nhà Bếp',
          HOME_BEDROOM: 'Phòng Ngủ',
          HOME_BATHROOM: 'Nhà Tắm',
          HOME_BALCONY: 'Sân Thượng',
          HOME_GARAGE: 'Gara Xe',
          HOME_POOL: 'Hồ Bơi'
        }
      }
    }
  ];

  return sampleFiles.map((item) => {
    const fileName = item.path.split('/').pop() || item.path;
    const rawStr = JSON.stringify(item.data, null, 2);
    return {
      relative_path: item.path,
      folder_group: item.folder,
      file_name: fileName,
      is_schema_file: fileName.endsWith('_schema.json'),
      line_count: rawStr.split('\n').length,
      data: item.data
    };
  });
}

// ============================================================================
// 4. BỘ QUAN HỆ CSDL ĐỘNG (INDEX, FK OPTIONS, RESTRICT, CASCADE, AUDIT, DIFF)
// ============================================================================

function flattenStringDictionary(obj: unknown, outMap: Record<string, string>): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return;
  }
  const rec = obj as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const val = rec[key];
    if (typeof val === 'string') {
      outMap[key] = val;
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      flattenStringDictionary(val, outMap);
    }
  }
}

function buildViLookupFromFiles(files: JsonDbFileEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const file of files) {
    if (file.file_name === 'vi_VN.json') {
      flattenStringDictionary(file.data, map);
    }
    if (file.file_name === 'sensory.json' && file.data.reference_vi_vn_translations) {
      flattenStringDictionary(file.data.reference_vi_vn_translations, map);
    }
  }
  return map;
}

function extractPrimaryKeyInfo(record: Record<string, unknown>): {
  id: string | null;
  field: string | null;
} {
  for (const key of PK_FIELD_CANDIDATES) {
    const val = record[key];
    if (typeof val === 'string' && val.trim() !== '') {
      return { id: val.trim(), field: key };
    }
  }
  return { id: null, field: null };
}

function resolveOptionLabelVi(
  record: Record<string, unknown>,
  viDict: Record<string, string>,
  fallbackId: string
): string {
  const labelFields = ['name_key', 'location_name_key', 'title_key', 'label_key', 'display_name'];
  for (const f of labelFields) {
    const raw = record[f];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return viDict[raw] || raw;
    }
  }
  return viDict[fallbackId] || fallbackId;
}

function pushUniqueOption(list: RelationOption[], option: RelationOption): void {
  for (const existing of list) {
    if (existing.id === option.id) {
      return;
    }
  }
  list.push(option);
}

/**
 * Xây dựng chỉ mục khóa chính sống từ toàn bộ file JSON đang mở trên ổ cứng.
 * Khi thêm một địa điểm/vật phẩm/bệnh mới -> tự động hiện ngay trong Dropdown các bảng khác.
 */
function buildDynamicRelationIndex(
  files: JsonDbFileEntry[],
  viDict: Record<string, string>
): DynamicRelationIndex {
  const tables: Record<RelationTableKey, RelationOption[]> = {
    LOCATION: [],
    SUB_NODE: [],
    ITEM_ANY: [],
    FURNITURE: [],
    DISEASE: [],
    MEDICINE: [],
    VEHICLE: [],
    JOB: [],
    PERSONALITY: [...STATIC_ENUM_TABLES.PERSONALITY],
    TRAIT: [...STATIC_ENUM_TABLES.TRAIT],
    WEATHER: [...STATIC_ENUM_TABLES.WEATHER],
    SHIFT: [...STATIC_ENUM_TABLES.SHIFT],
    USAGE_TYPE: [...STATIC_ENUM_TABLES.USAGE_TYPE],
    ENVIRONMENT: [...STATIC_ENUM_TABLES.ENVIRONMENT],
    EVENT_CATEGORY: [...STATIC_ENUM_TABLES.EVENT_CATEGORY],
    REGION: [...STATIC_ENUM_TABLES.REGION]
  };

  const primaryKeyByFile: Record<string, string[]> = {};
  let totalIndexedRecords = 0;

  for (const file of files) {
    if (file.is_schema_file) {
      continue;
    }

    // Lấy danh sách phòng chuẩn & địa điểm chuẩn từ vi_VN.json để không bị sót phòng gốc
    if (file.file_name === 'vi_VN.json') {
      const locGroup = file.data.locations as Record<string, unknown> | undefined;
      if (locGroup && typeof locGroup === 'object') {
        for (const [k, v] of Object.entries(locGroup)) {
          if (typeof v === 'string') {
            pushUniqueOption(tables.LOCATION, {
              id: k,
              label_vi: v,
              source_file: file.relative_path
            });
          }
        }
      }
      const subGroup = file.data.sub_nodes as Record<string, unknown> | undefined;
      if (subGroup && typeof subGroup === 'object') {
        for (const [k, v] of Object.entries(subGroup)) {
          if (typeof v === 'string') {
            pushUniqueOption(tables.SUB_NODE, {
              id: k,
              label_vi: v,
              source_file: file.relative_path,
              parent_location_id: k.startsWith('HOME_') ? 'LOC_HOME' : undefined
            });
          }
        }
      }
      continue;
    }

    const filePks: string[] = [];

    // Trường hợp Object Map địa điểm trong map_coordinates_and_transit_fares.json
    if (
      file.data.location_coordinates &&
      typeof file.data.location_coordinates === 'object' &&
      !Array.isArray(file.data.location_coordinates)
    ) {
      for (const locKey of Object.keys(file.data.location_coordinates as Record<string, unknown>)) {
        filePks.push(locKey);
        pushUniqueOption(tables.LOCATION, {
          id: locKey,
          label_vi: viDict[locKey] || locKey,
          source_file: file.relative_path
        });
      }
    }

    // Duyệt toàn bộ mảng bản ghi bên trong file JSON
    for (const colKey of Object.keys(file.data)) {
      const colVal = file.data[colKey];
      if (!Array.isArray(colVal)) {
        continue;
      }

      for (const rawRow of colVal) {
        if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
          continue;
        }
        const row = rawRow as Record<string, unknown>;
        totalIndexedRecords = totalIndexedRecords + 1;

        const pkInfo = extractPrimaryKeyInfo(row);
        if (pkInfo.id) {
          filePks.push(pkInfo.id);
        }

        // [1] Địa điểm & phòng chức năng con (sub_nodes)
        if (typeof row.location_id === 'string' && file.folder_group === 'location') {
          const locId = row.location_id.trim();
          pushUniqueOption(tables.LOCATION, {
            id: locId,
            label_vi: resolveOptionLabelVi(row, viDict, locId),
            source_file: file.relative_path
          });

          if (Array.isArray(row.sub_nodes)) {
            for (const rawNode of row.sub_nodes) {
              if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) continue;
              const nodeObj = rawNode as Record<string, unknown>;
              if (typeof nodeObj.sub_node_id === 'string' && nodeObj.sub_node_id.trim() !== '') {
                const snId = nodeObj.sub_node_id.trim();
                filePks.push(snId);
                pushUniqueOption(tables.SUB_NODE, {
                  id: snId,
                  label_vi: resolveOptionLabelVi(nodeObj, viDict, snId),
                  source_file: file.relative_path,
                  parent_location_id: locId
                });
              }
            }
          }
        }

        // [2] Nội thất (furniture/)
        if (typeof row.furniture_id === 'string' && row.furniture_id.trim() !== '') {
          const fId = row.furniture_id.trim();
          const opt: RelationOption = {
            id: fId,
            label_vi: resolveOptionLabelVi(row, viDict, fId),
            source_file: file.relative_path
          };
          pushUniqueOption(tables.FURNITURE, opt);
          pushUniqueOption(tables.ITEM_ANY, opt);
        }

        // [3] Vật phẩm / Thực phẩm / Trang phục
        const itemId =
          typeof row.item_def_id === 'string'
            ? row.item_def_id.trim()
            : typeof row.item_id === 'string'
              ? row.item_id.trim()
              : '';
        if (itemId !== '') {
          pushUniqueOption(tables.ITEM_ANY, {
            id: itemId,
            label_vi: resolveOptionLabelVi(row, viDict, itemId),
            source_file: file.relative_path
          });
        }

        // [4] Bệnh lý (hospital_clinic/)
        if (typeof row.disease_id === 'string' && row.disease_id.trim() !== '') {
          const dId = row.disease_id.trim();
          pushUniqueOption(tables.DISEASE, {
            id: dId,
            label_vi: resolveOptionLabelVi(row, viDict, dId),
            source_file: file.relative_path
          });
        }

        // [5] Thuốc OTC / Rx
        if (typeof row.medicine_id === 'string' && row.medicine_id.trim() !== '') {
          const mId = row.medicine_id.trim();
          const opt: RelationOption = {
            id: mId,
            label_vi: resolveOptionLabelVi(row, viDict, mId),
            source_file: file.relative_path
          };
          pushUniqueOption(tables.MEDICINE, opt);
          pushUniqueOption(tables.ITEM_ANY, opt);
        }

        // [6] Phương tiện đi lại
        const vehId =
          typeof row.vehicle_def_id === 'string'
            ? row.vehicle_def_id.trim()
            : typeof row.vehicle_id === 'string'
              ? row.vehicle_id.trim()
              : '';
        if (vehId !== '') {
          pushUniqueOption(tables.VEHICLE, {
            id: vehId,
            label_vi: resolveOptionLabelVi(row, viDict, vehId),
            source_file: file.relative_path
          });
        }

        // [7] Nghề nghiệp
        if (typeof row.job_id === 'string' && row.job_id.trim() !== '') {
          const jId = row.job_id.trim();
          pushUniqueOption(tables.JOB, {
            id: jId,
            label_vi: resolveOptionLabelVi(row, viDict, jId),
            source_file: file.relative_path
          });
        }
      }
    }

    primaryKeyByFile[file.relative_path] = filePks;
  }

  // Sắp xếp A-Z cho dễ nhìn trong Dropdown
  for (const tKey of Object.keys(tables) as RelationTableKey[]) {
    tables[tKey].sort((a, b) => a.id.localeCompare(b.id));
  }

  return {
    tables,
    primary_key_by_file: primaryKeyByFile,
    total_indexed_records: totalIndexedRecords
  };
}

/**
 * Lấy danh sách lựa chọn khóa ngoại cho 1 trường cụ thể (tự lọc sub_node theo location_id cha nếu có).
 */
function getForeignKeyOptionsForField(
  fieldName: string,
  index: DynamicRelationIndex,
  parentObject?: Record<string, unknown>,
  collectionKey?: string
): { rule: FieldForeignKeyRule; options: RelationOption[] } | null {
  // Xử lý đặc biệt trường `category` bên trong bảng `events`
  if (fieldName === 'category' && collectionKey === 'events') {
    return {
      rule: { target_table: 'EVENT_CATEGORY', is_multi: false },
      options: index.tables.EVENT_CATEGORY
    };
  }

  const rule = FOREIGN_KEY_FIELD_RULES[fieldName];
  if (!rule) {
    return null;
  }

  let options = index.tables[rule.target_table] || [];

  // Nếu là trường phòng con (sub_node) và cùng object có location_id thì ưu tiên lọc đúng phòng thuộc địa điểm đó
  if (rule.filter_by_sibling_location && parentObject) {
    const siblingLoc =
      typeof parentObject.location_id === 'string'
        ? parentObject.location_id
        : typeof parentObject.placed_in_location_id === 'string'
          ? parentObject.placed_in_location_id
          : '';
    if (siblingLoc !== '') {
      const narrowed = options.filter(
        (opt) => !opt.parent_location_id || opt.parent_location_id === siblingLoc
      );
      if (narrowed.length > 0) {
        options = narrowed;
      }
    }
  }

  return { rule, options };
}

/**
 * Quét đệ quy phẳng tìm mọi nơi đang sử dụng một tập mã ID (dùng cho RESTRICT & Find Usages).
 */
function scanValueForTargetIds(
  value: unknown,
  targetIdSet: Set<string>,
  currentPath: string,
  meta: { source_file: string; collection_key: string; record_id: string },
  outMatches: IncomingReferenceMatch[]
): void {
  if (typeof value === 'string') {
    if (targetIdSet.has(value)) {
      outMatches.push({
        source_file: meta.source_file,
        collection_key: meta.collection_key,
        record_id: meta.record_id,
        field_path: currentPath || '(root)',
        matched_id: value
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanValueForTargetIds(value[i], targetIdSet, `${currentPath}[${i}]`, meta, outMatches);
    }
    return;
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      const nextPath = currentPath === '' ? k : `${currentPath}.${k}`;
      scanValueForTargetIds(obj[k], targetIdSet, nextPath, meta, outMatches);
    }
  }
}

/**
 * Chốt chặn xóa bản ghi kiểu SQL `ON DELETE RESTRICT`.
 */
function checkRecordDeleteGuard(
  files: JsonDbFileEntry[],
  ownerFilePath: string,
  ownerCollectionKey: string,
  ownerRowKey: string,
  primaryId: string,
  rawValue: unknown
): DeleteGuardResult {
  if (!primaryId || primaryId.startsWith('ROW_')) {
    return { can_delete: true, block_reason_vi: '', references: [] };
  }

  const targetIds = new Set<string>([primaryId]);
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    const rec = rawValue as Record<string, unknown>;
    if (Array.isArray(rec.sub_nodes)) {
      for (const sn of rec.sub_nodes) {
        if (sn && typeof sn === 'object' && !Array.isArray(sn)) {
          const snId = (sn as Record<string, unknown>).sub_node_id;
          if (typeof snId === 'string' && snId.trim() !== '') {
            targetIds.add(snId.trim());
          }
        }
      }
    }
  }

  const matches: IncomingReferenceMatch[] = [];

  for (const file of files) {
    // Bỏ qua file schema và từ điển dịch khi soi tham chiếu nghiệp vụ
    if (file.is_schema_file || file.folder_group === 'localization') {
      continue;
    }

    for (const colKey of Object.keys(file.data)) {
      const colVal = file.data[colKey];

      if (Array.isArray(colVal)) {
        for (let i = 0; i < colVal.length; i++) {
          if (
            file.relative_path === ownerFilePath &&
            colKey === ownerCollectionKey &&
            String(i) === ownerRowKey
          ) {
            continue;
          }
          const rawRow = colVal[i];
          if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) continue;
          const rowObj = rawRow as Record<string, unknown>;
          const rowId = extractPrimaryKeyInfo(rowObj).id || `ROW_${i + 1}`;

          scanValueForTargetIds(
            rowObj,
            targetIds,
            '',
            { source_file: file.relative_path, collection_key: colKey, record_id: rowId },
            matches
          );
        }
      } else if (colVal && typeof colVal === 'object') {
        const mapObj = colVal as Record<string, unknown>;
        for (const mapKey of Object.keys(mapObj)) {
          if (
            file.relative_path === ownerFilePath &&
            colKey === ownerCollectionKey &&
            mapKey === ownerRowKey
          ) {
            continue;
          }
          const entryVal = mapObj[mapKey];
          if (entryVal && typeof entryVal === 'object') {
            scanValueForTargetIds(
              entryVal,
              targetIds,
              '',
              { source_file: file.relative_path, collection_key: colKey, record_id: mapKey },
              matches
            );
          }
        }
      }
    }
  }

  // [Chốt chặn RESTRICT]: Còn ít nhất 1 bảng đang tham chiếu tới ID này -> từ chối xóa
  if (matches.length > 0) {
    return {
      can_delete: false,
      block_reason_vi: `Không thể xóa "${primaryId}" vì còn ${matches.length} nơi khác đang tham chiếu khóa ngoại. Hãy gỡ liên kết trước.`,
      references: matches
    };
  }

  return { can_delete: true, block_reason_vi: '', references: [] };
}

/**
 * Chốt chặn xóa cả file JSON (`*_schema.json`, `vi_VN.json`, hoặc file chứa ID đang bị tham chiếu).
 */
function checkFileDeleteGuard(
  files: JsonDbFileEntry[],
  targetFile: JsonDbFileEntry,
  index: DynamicRelationIndex
): DeleteGuardResult {
  if (targetFile.is_schema_file) {
    return {
      can_delete: false,
      block_reason_vi: 'Khóa cứng: Không được phép xóa file cấu trúc chuẩn (*_schema.json).',
      references: []
    };
  }

  if (targetFile.file_name === 'vi_VN.json') {
    return {
      can_delete: false,
      block_reason_vi: 'Khóa cứng: Không được phép xóa từ điển ngôn ngữ chính localization/vi_VN.json.',
      references: []
    };
  }

  const pksInFile = index.primary_key_by_file[targetFile.relative_path] || [];
  if (pksInFile.length === 0) {
    return { can_delete: true, block_reason_vi: '', references: [] };
  }

  const targetIds = new Set<string>(pksInFile);
  const matches: IncomingReferenceMatch[] = [];

  for (const otherFile of files) {
    if (
      otherFile.is_schema_file ||
      otherFile.folder_group === 'localization' ||
      otherFile.relative_path === targetFile.relative_path
    ) {
      continue;
    }

    for (const colKey of Object.keys(otherFile.data)) {
      const colVal = otherFile.data[colKey];
      if (Array.isArray(colVal)) {
        for (let i = 0; i < colVal.length; i++) {
          const rawRow = colVal[i];
          if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) continue;
          const rowObj = rawRow as Record<string, unknown>;
          const rowId = extractPrimaryKeyInfo(rowObj).id || `ROW_${i + 1}`;
          scanValueForTargetIds(
            rowObj,
            targetIds,
            '',
            { source_file: otherFile.relative_path, collection_key: colKey, record_id: rowId },
            matches
          );
        }
      }
    }
  }

  if (matches.length > 0) {
    return {
      can_delete: false,
      block_reason_vi: `Không thể xóa file "${targetFile.file_name}" vì còn ${matches.length} tham chiếu từ các file JSON khác.`,
      references: matches
    };
  }

  return { can_delete: true, block_reason_vi: '', references: [] };
}

/**
 * Thay thế đồng loạt một mã ID cũ sang mã ID mới trên toàn bộ cây JSON (SQL `ON UPDATE CASCADE`).
 */
function replaceIdDeepInValue(
  value: unknown,
  oldId: string,
  newId: string
): { nextValue: unknown; count: number } {
  if (typeof value === 'string') {
    if (value === oldId) {
      return { nextValue: newId, count: 1 };
    }
    return { nextValue: value, count: 0 };
  }

  if (Array.isArray(value)) {
    let total = 0;
    const nextArr = value.map((item) => {
      const r = replaceIdDeepInValue(item, oldId, newId);
      total = total + r.count;
      return r.nextValue;
    });
    return { nextValue: nextArr, count: total };
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const nextObj: Record<string, unknown> = {};
    let total = 0;
    for (const k of Object.keys(obj)) {
      const nextKey = k === oldId ? newId : k;
      if (k === oldId) {
        total = total + 1;
      }
      const r = replaceIdDeepInValue(obj[k], oldId, newId);
      total = total + r.count;
      nextObj[nextKey] = r.nextValue;
    }
    return { nextValue: nextObj, count: total };
  }

  return { nextValue: value, count: 0 };
}

/**
 * Kiểm toán chéo toàn bộ kho JSON dựa trên Chỉ mục Quan hệ Sống (`DynamicRelationIndex`).
 */
function runLiveCrossFileAudit(
  files: JsonDbFileEntry[],
  relationIndex: DynamicRelationIndex,
  viDict: Record<string, string>
): AdminIntegrityIssue[] {
  const issues: AdminIntegrityIssue[] = [];
  let seq = 1;

  const validLocSet = new Set(relationIndex.tables.LOCATION.map((x) => x.id));
  const validSubSet = new Set(relationIndex.tables.SUB_NODE.map((x) => x.id));
  const validPersSet = new Set(relationIndex.tables.PERSONALITY.map((x) => x.id));
  const validTraitSet = new Set(relationIndex.tables.TRAIT.map((x) => x.id));
  const validItemSet = new Set(relationIndex.tables.ITEM_ANY.map((x) => x.id));
  const validMedSet = new Set(relationIndex.tables.MEDICINE.map((x) => x.id));

  for (const file of files) {
    if (file.is_schema_file || file.folder_group === 'localization') {
      continue;
    }

    // [1] Kiểm toán Sự kiện (events_*.json)
    if (Array.isArray(file.data.events)) {
      const events = file.data.events as Array<Record<string, unknown>>;
      for (const evt of events) {
        const evtId = String(evt.event_id || 'UNKNOWN_EVENT');
        const trig = (evt.trigger_conditions || {}) as Record<string, unknown>;
        const pres = (evt.presentation || {}) as Record<string, unknown>;

        if (Array.isArray(trig.allowed_location_ids)) {
          for (const loc of trig.allowed_location_ids as string[]) {
            if (!validLocSet.has(loc)) {
              issues.push({
                id: `ISS_${seq++}`,
                severity: 'ERROR',
                relative_path: file.relative_path,
                collection_key: 'events',
                record_id: evtId,
                message_vi: `Khóa ngoại địa điểm '${loc}' không tồn tại trong chỉ mục bản đồ.`
              });
            }
          }
        }

        const titleKey = String(pres.title_key || '');
        if (titleKey && !titleKey.includes(' ') && !viDict[titleKey]) {
          issues.push({
            id: `ISS_${seq++}`,
            severity: 'WARNING',
            relative_path: file.relative_path,
            collection_key: 'events',
            record_id: evtId,
            message_vi: `Thiếu bản dịch tiếng Việt cho title_key '${titleKey}' trong vi_VN.json.`
          });
        }

        const bodyKey = String(pres.narrative_body_key || '');
        if (bodyKey && !bodyKey.includes(' ') && !viDict[bodyKey]) {
          issues.push({
            id: `ISS_${seq++}`,
            severity: 'WARNING',
            relative_path: file.relative_path,
            collection_key: 'events',
            record_id: evtId,
            message_vi: `Thiếu bản dịch tiếng Việt cho narrative_body_key '${bodyKey}' trong vi_VN.json.`
          });
        }

        if (Array.isArray(evt.choices)) {
          for (const ch of evt.choices as Array<Record<string, unknown>>) {
            const req = (ch.unlock_requirements || {}) as Record<string, unknown>;
            if (
              typeof req.required_personality === 'string' &&
              !validPersSet.has(req.required_personality)
            ) {
              issues.push({
                id: `ISS_${seq++}`,
                severity: 'ERROR',
                relative_path: file.relative_path,
                collection_key: 'events',
                record_id: evtId,
                message_vi: `Sai mã tính cách '${req.required_personality}' (phải dùng chuẩn PERS_*).`
              });
            }
            if (Array.isArray(req.required_innate_traits)) {
              for (const tr of req.required_innate_traits as string[]) {
                if (!validTraitSet.has(tr)) {
                  issues.push({
                    id: `ISS_${seq++}`,
                    severity: 'ERROR',
                    relative_path: file.relative_path,
                    collection_key: 'events',
                    record_id: evtId,
                    message_vi: `Sai mã đặc tính '${tr}' (phải dùng chuẩn TRAIT_*).`
                  });
                }
              }
            }
          }
        }
      }
    }

    // [2] Kiểm toán Nội thất (furniture_items)
    if (Array.isArray(file.data.furniture_items)) {
      const items = file.data.furniture_items as Array<Record<string, unknown>>;
      for (const item of items) {
        const furnId = String(item.furniture_id || 'UNKNOWN_FURN');
        if (item.usage_type !== 'DURABLE_REUSABLE') {
          issues.push({
            id: `ISS_${seq++}`,
            severity: 'ERROR',
            relative_path: file.relative_path,
            collection_key: 'furniture_items',
            record_id: furnId,
            message_vi: `Nội thất bắt buộc phải mang usage_type là 'DURABLE_REUSABLE'.`
          });
        }
        if (
          typeof item.placed_in_sub_node_id === 'string' &&
          !validSubSet.has(item.placed_in_sub_node_id)
        ) {
          issues.push({
            id: `ISS_${seq++}`,
            severity: 'ERROR',
            relative_path: file.relative_path,
            collection_key: 'furniture_items',
            record_id: furnId,
            message_vi: `Phòng đặt '${item.placed_in_sub_node_id}' không tồn tại trong danh sách Sub-Node.`
          });
        }
        if (
          typeof item.consumes_item_id === 'string' &&
          validItemSet.size > 0 &&
          !validItemSet.has(item.consumes_item_id)
        ) {
          issues.push({
            id: `ISS_${seq++}`,
            severity: 'WARNING',
            relative_path: file.relative_path,
            collection_key: 'furniture_items',
            record_id: furnId,
            message_vi: `Vật phẩm tiêu thụ '${item.consumes_item_id}' chưa có trong bảng vật phẩm.`
          });
        }
        if (!item.visual_slot) {
          issues.push({
            id: `ISS_${seq++}`,
            severity: 'WARNING',
            relative_path: file.relative_path,
            collection_key: 'furniture_items',
            record_id: furnId,
            message_vi: `Thiếu tọa độ vẽ xếp lớp 'visual_slot' lên nền phòng trống.`
          });
        }
      }
    }

    // [3] Kiểm toán Bệnh lý -> Thuốc kê đơn
    if (Array.isArray(file.data.diseases)) {
      const diseases = file.data.diseases as Array<Record<string, unknown>>;
      for (const dis of diseases) {
        const disId = String(dis.disease_id || 'UNKNOWN_DIS');
        if (Array.isArray(dis.hospital_recommended_medicine_ids) && validMedSet.size > 0) {
          for (const medId of dis.hospital_recommended_medicine_ids as string[]) {
            if (!validMedSet.has(medId)) {
              issues.push({
                id: `ISS_${seq++}`,
                severity: 'ERROR',
                relative_path: file.relative_path,
                collection_key: 'diseases',
                record_id: disId,
                message_vi: `Thuốc kê đơn '${medId}' không tồn tại trong medicine_and_treatment_catalog.json.`
              });
            }
          }
        }
      }
    }

    // [4] Kiểm toán Nghề nghiệp (job_catalog)
    if (Array.isArray(file.data.job_catalog)) {
      const jobs = file.data.job_catalog as Array<Record<string, unknown>>;
      for (const job of jobs) {
        const jobId = String(job.job_id || 'UNKNOWN_JOB');
        if (typeof job.location_id === 'string' && !validLocSet.has(job.location_id)) {
          issues.push({
            id: `ISS_${seq++}`,
            severity: 'ERROR',
            relative_path: file.relative_path,
            collection_key: 'job_catalog',
            record_id: jobId,
            message_vi: `Địa điểm làm việc '${job.location_id}' chưa khai báo trên bản đồ.`
          });
        }
      }
    }
  }

  return issues;
}

// ============================================================================
// 5. PHÂN TÍCH BẢNG, CHIẾU DÒNG, TẠO MẪU & XUẤT CSV (PHẲNG)
// ============================================================================

function detectCollectionsInJson(data: Record<string, unknown>): DetectedCollection[] {
  const collections: DetectedCollection[] = [];
  const skipMetaKeys = ['$schema', 'metadata', 'title', 'description', 'version', 'locale', 'module_id'];

  for (const key of Object.keys(data)) {
    if (skipMetaKeys.includes(key)) {
      continue;
    }

    const val = data[key];
    if (Array.isArray(val) && (val.length === 0 || (typeof val[0] === 'object' && val[0] !== null))) {
      collections.push({
        collection_key: key,
        label_vi: `${key} (${val.length})`,
        kind: 'ARRAY_OF_OBJECTS',
        row_count: val.length
      });
      continue;
    }

    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const entries = Object.entries(val as Record<string, unknown>);
      if (entries.length === 0) continue;

      const firstVal = entries[0][1];
      if (typeof firstVal === 'string') {
        collections.push({
          collection_key: key,
          label_vi: `${key} (${entries.length} khóa chữ)`,
          kind: 'STRING_DICTIONARY',
          row_count: entries.length
        });
      } else if (typeof firstVal === 'object' && firstVal !== null && !Array.isArray(firstVal)) {
        collections.push({
          collection_key: key,
          label_vi: `${key} (${entries.length} mục)`,
          kind: 'OBJECT_MAP',
          row_count: entries.length
        });
      }
    }
  }

  return collections;
}

function buildTableRowsForCollection(
  data: Record<string, unknown>,
  collection: DetectedCollection,
  viDict: Record<string, string>
): TableRowAdapter[] {
  const rows: TableRowAdapter[] = [];
  const target = data[collection.collection_key];

  if (collection.kind === 'ARRAY_OF_OBJECTS' && Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      const rec = (target[i] || {}) as Record<string, unknown>;
      const pkInfo = extractPrimaryKeyInfo(rec);
      const primaryId = pkInfo.id || String(rec.house_tier ?? `ROW_${i + 1}`);

      const pres = (rec.presentation || {}) as Record<string, unknown>;
      const titleKey = String(pres.title_key || rec.name_key || rec.title_key || rec.label_key || '');
      const displayTitle = viDict[titleKey] || titleKey || '(Chưa có tiêu đề)';

      const trig = (rec.trigger_conditions || {}) as Record<string, unknown>;
      let locSummary = '—';
      if (Array.isArray(trig.allowed_location_ids) && trig.allowed_location_ids.length > 0) {
        locSummary = trig.allowed_location_ids.join(', ');
      } else if (typeof rec.location_id === 'string') {
        locSummary = rec.location_id;
      } else if (typeof rec.placed_in_location_id === 'string') {
        locSummary = `${rec.placed_in_location_id} / ${String(rec.placed_in_sub_node_id || '')}`;
      } else if (Array.isArray(rec.sold_at_location_ids)) {
        locSummary = rec.sold_at_location_ids.join(', ');
      }

      const categoryOrType = String(
        rec.category || rec.usage_type || rec.employer_tier || rec.affected_organ || rec.environment_filter || '—'
      );

      let extraMetric = '—';
      let numericSort = 0;
      if (typeof rec.base_price_vnd === 'number') {
        extraMetric = `${rec.base_price_vnd.toLocaleString('vi-VN')} đ`;
        numericSort = rec.base_price_vnd;
      } else if (typeof rec.base_monthly_salary_vnd === 'number') {
        extraMetric = `${rec.base_monthly_salary_vnd.toLocaleString('vi-VN')} đ/th`;
        numericSort = rec.base_monthly_salary_vnd;
      } else if (typeof rec.base_weight === 'number') {
        extraMetric = `Trọng số: ${rec.base_weight}`;
        numericSort = rec.base_weight;
      } else if (typeof rec.duration_minutes === 'number') {
        extraMetric = `${rec.duration_minutes} phút`;
        numericSort = rec.duration_minutes;
      }

      rows.push({
        row_key: String(i),
        primary_id: primaryId,
        primary_id_field: pkInfo.field,
        display_title: displayTitle,
        location_summary: locSummary,
        category_or_type: categoryOrType,
        extra_metric: extraMetric,
        numeric_sort_value: numericSort,
        raw_value: rec
      });
    }
    return rows;
  }

  if (collection.kind === 'OBJECT_MAP' && typeof target === 'object' && target !== null) {
    for (const [mapKey, mapVal] of Object.entries(target as Record<string, unknown>)) {
      const rec = (mapVal || {}) as Record<string, unknown>;
      const monoKey = String(rec.sensory_monologue_key || rec.name_key || rec.district_zone || '');
      let extraMetric = '—';
      let numericSort = 0;
      if (typeof rec.time_cost_multiplier === 'number') {
        extraMetric = `×${rec.time_cost_multiplier} giờ`;
        numericSort = rec.time_cost_multiplier;
      } else if (typeof rec.map_x_km === 'number') {
        extraMetric = `X=${rec.map_x_km}, Y=${rec.map_y_km}`;
        numericSort = rec.map_x_km;
      }
      rows.push({
        row_key: mapKey,
        primary_id: mapKey,
        primary_id_field: null,
        display_title: viDict[monoKey] || viDict[mapKey] || monoKey || mapKey,
        location_summary: String(rec.district_zone || '—'),
        category_or_type: String(rec.category || 'MAP_ENTRY'),
        extra_metric: extraMetric,
        numeric_sort_value: numericSort,
        raw_value: rec
      });
    }
    return rows;
  }

  if (collection.kind === 'STRING_DICTIONARY' && typeof target === 'object' && target !== null) {
    for (const [dictKey, dictVal] of Object.entries(target as Record<string, unknown>)) {
      const text = String(dictVal || '');
      rows.push({
        row_key: dictKey,
        primary_id: dictKey,
        primary_id_field: null,
        display_title: text,
        location_summary: collection.collection_key,
        category_or_type: 'VI_TEXT',
        extra_metric: `${text.length} ký tự`,
        numeric_sort_value: text.length,
        raw_value: dictVal
      });
    }
  }

  return rows;
}

function buildTemplateForNewRecord(
  collectionKey: string,
  existingRecords: unknown[]
): Record<string, unknown> {
  const stamp = Date.now().toString().slice(-4);
  if (collectionKey === 'events') {
    return {
      event_id: `EVT_NEW_${stamp}`,
      category: 'DAILY_GRAY',
      environment_filter: 'INDOOR',
      is_repeatable: true,
      base_weight: 50,
      trigger_conditions: { age_range: [6, 90], allowed_location_ids: ['LOC_HOME'] },
      presentation: {
        title_key: `evt_new_${stamp}_title`,
        narrative_body_key: `evt_new_${stamp}_body`,
        base_countdown_seconds: 10
      },
      choices: [
        {
          choice_id: 'CHOICE_A',
          label_key: `evt_new_${stamp}_choice_a`,
          is_default_timeout_penalty: true,
          outcomes: { time_elapsed_minutes: 15, money_delta_vnd: 0, happiness_delta: 0 }
        }
      ]
    };
  }

  if (collectionKey === 'furniture_items') {
    return {
      furniture_id: `FURN_NEW_${stamp}`,
      name_key: 'Nội thất mới',
      usage_type: 'DURABLE_REUSABLE',
      size_class: 'MEDIUM_APPLIANCE',
      base_price_vnd: 1500000,
      sold_at_location_ids: ['LOC_TECH_STORE'],
      placed_in_location_id: 'LOC_HOME',
      placed_in_sub_node_id: 'HOME_LIVING_ROOM',
      visual_slot: { asset_id: `sketch_furn_${stamp}`, anchor_x_pct: 50, anchor_y_pct: 50, width_pct: 20, z_index: 2 }
    };
  }

  if (existingRecords.length > 0 && typeof existingRecords[0] === 'object' && existingRecords[0] !== null) {
    const cloned = JSON.parse(JSON.stringify(existingRecords[0])) as Record<string, unknown>;
    const pk = extractPrimaryKeyInfo(cloned);
    if (pk.field && pk.id) {
      cloned[pk.field] = `${pk.id}_NEW_${stamp}`;
    }
    return cloned;
  }

  return { id: `REC_${stamp}`, name_key: 'Bản ghi mới' };
}

function buildLineDiffSummary(
  originalObj: Record<string, unknown> | undefined,
  currentObj: Record<string, unknown>
): Array<{ type: 'SAME' | 'ADD' | 'DEL'; text: string }> {
  const oldLines = JSON.stringify(originalObj || {}, null, 2).split('\n');
  const newLines = JSON.stringify(currentObj, null, 2).split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  const diff: Array<{ type: 'SAME' | 'ADD' | 'DEL'; text: string }> = [];

  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n && o !== undefined) {
      diff.push({ type: 'SAME', text: o });
    } else {
      if (o !== undefined) diff.push({ type: 'DEL', text: o });
      if (n !== undefined) diff.push({ type: 'ADD', text: n });
    }
  }
  return diff;
}

function exportRowsToCsvFile(rows: TableRowAdapter[], fileNamePrefix: string): void {
  const escapeCsv = (val: unknown): string => {
    const str = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  };

  const header = ['primary_id', 'display_title', 'location_summary', 'category_or_type', 'extra_metric', 'raw_json'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        escapeCsv(r.primary_id),
        escapeCsv(r.display_title),
        escapeCsv(r.location_summary),
        escapeCsv(r.category_or_type),
        escapeCsv(r.extra_metric),
        escapeCsv(r.raw_value)
      ].join(',')
    );
  }

  // Thêm BOM \uFEFF để Excel trên Windows hiển thị tiếng Việt có dấu chuẩn 100%
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileNamePrefix}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// 6. COMPONENT PHỤ: MULTI-SELECT CHIPS CÓ Ô LỌC NHANH (DÙNG CHO KHÓA NGOẠI MẢNG)
// ============================================================================

function SearchableFkChips({
  options,
  selectedValues,
  onChange
}: {
  options: RelationOption[];
  selectedValues: string[];
  onChange: (next: string[]) => void;
}) {
  const [filterText, setFilterText] = useState<string>('');
  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.id.toLowerCase().includes(q) || o.label_vi.toLowerCase().includes(q)
    );
  }, [options, filterText]);

  return (
    <div className="space-y-1.5 rounded border border-[#D4C6AE] bg-[#FAF6EE] p-2">
      {options.length > 8 && (
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Lọc nhanh mã ID hoặc tên tiếng Việt..."
          className="w-full rounded border border-[#C8BFA8] bg-white px-2 py-1 text-xs focus:border-[#B8382A] focus:outline-none"
        />
      )}
      <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
        {filtered.map((opt) => {
          const isPicked = selectedValues.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              title={`Nguồn: ${opt.source_file}`}
              onClick={() => {
                const next = isPicked
                  ? selectedValues.filter((v) => v !== opt.id)
                  : [...selectedValues, opt.id];
                onChange(next);
              }}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
                isPicked
                  ? 'border-[#1F1B16] bg-[#1F1B16] text-[#F9F4EA]'
                  : 'border-[#C8BFA8] bg-white text-[#2B241D] hover:bg-[#EAE1D0]'
              }`}
            >
              {isPicked ? '✓ ' : '+ '}
              {opt.label_vi !== opt.id ? `${opt.label_vi} (${opt.id})` : opt.id}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <span className="text-[11px] italic text-[#7A6A53]">Không có khóa nào khớp bộ lọc.</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 7. COMPONENT CHÍNH: TRANG QUẢN TRỊ CSDL JSON NỘI BỘ (FULL RDBMS EDITION)
// ============================================================================

export function JsonDatabaseAdminPanel() {
  const [files, setFiles] = useState<JsonDbFileEntry[]>([]);
  const [originalSnapshotByPath, setOriginalSnapshotByPath] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [connectionMode, setConnectionMode] = useState<
    'LOADING' | 'VITE_DISK_LIVE' | 'SANDBOX_PREVIEW'
  >('LOADING');
  const [dirtyPaths, setDirtyPaths] = useState<Record<string, boolean>>({});

  // Lịch sử Undo / Redo (tối đa 30 bước)
  const [undoStack, setUndoStack] = useState<JsonDbFileEntry[][]>([]);
  const [redoStack, setRedoStack] = useState<JsonDbFileEntry[][]>([]);

  // Điều hướng File / Bảng / Phân trang / Sắp xếp
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [selectedCollectionKey, setSelectedCollectionKey] = useState<string>('');
  const [viewMode, setViewMode] = useState<'TABLE' | 'RAW_FILE'>('TABLE');
  const [fileSearchQuery, setFileSearchQuery] = useState<string>('');
  const [rowSearchQuery, setRowSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('primary_id');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // Giao diện & Hộp thoại
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [confirmDeleteRowKey, setConfirmDeleteRowKey] = useState<string | null>(null);
  const [confirmDeleteFilePath, setConfirmDeleteFilePath] = useState<string | null>(null);

  // Modal Sửa / Thêm Bản Ghi
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editorMode, setEditorMode] = useState<'FORM' | 'JSON'>('FORM');
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingOriginalPk, setEditingOriginalPk] = useState<string>('');
  const [editingMapKeyName, setEditingMapKeyName] = useState<string>('');
  const [editingDraftValue, setEditingDraftValue] = useState<unknown>(null);
  const [editingRawJsonText, setEditingRawJsonText] = useState<string>('');
  const [editingJsonError, setEditingJsonError] = useState<string | null>(null);
  const [quickViKeyTarget, setQuickViKeyTarget] = useState<string | null>(null);
  const [quickViTextInput, setQuickViTextInput] = useState<string>('');

  // Modal JSON Gốc
  const [rawFileDraftText, setRawFileDraftText] = useState<string>('');
  const [rawFileError, setRawFileError] = useState<string | null>(null);

  // Các Modal RDBMS mở rộng: Chặn xóa RESTRICT, Đổi ID CASCADE, Kiểm toán, Toàn cục Ctrl+K, ER Schema, Diff, Sửa hàng loạt, Tạo File
  const [blockedDeleteReport, setBlockedDeleteReport] = useState<DeleteGuardResult | null>(null);
  const [cascadeRenameTarget, setCascadeRenameTarget] = useState<{
    oldId: string;
    newId: string;
  } | null>(null);
  const [usagesModalData, setUsagesModalData] = useState<{
    targetId: string;
    refs: IncomingReferenceMatch[];
  } | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState<boolean>(false);
  const [globalSearchText, setGlobalSearchText] = useState<string>('');
  const [erDiagramModalOpen, setErDiagramModalOpen] = useState<boolean>(false);
  const [diffModalOpen, setDiffModalOpen] = useState<boolean>(false);
  const [batchEditModalOpen, setBatchEditModalOpen] = useState<boolean>(false);
  const [batchFieldKey, setBatchFieldKey] = useState<string>('environment_filter');
  const [batchFieldValue, setBatchFieldValue] = useState<string>('INDOOR');
  const [createFileModalOpen, setCreateFileModalOpen] = useState<boolean>(false);
  const [newFileFolder, setNewFileFolder] = useState<string>('event');
  const [newFileName, setNewFileName] = useState<string>('');
  const [auditModalOpen, setAuditModalOpen] = useState<boolean>(false);

  const fileUploadInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((type: ToastNotice['type'], textVi: string) => {
    setToast({ type, text_vi: textVi });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Nạp toàn bộ kho JSON từ Vite Dev Server (hoặc bộ mẫu khi Preview)
  const loadDatabaseFiles = useCallback(async () => {
    setConnectionMode('LOADING');
    try {
      const response = await fetch('/__admin_db/files');
      if (response.ok) {
        const payload = (await response.json()) as {
          ok?: boolean;
          files?: JsonDbFileEntry[];
        };
        const rawFiles = Array.isArray(payload)
          ? (payload as unknown as JsonDbFileEntry[])
          : Array.isArray(payload.files)
            ? payload.files
            : [];
        if (rawFiles.length > 0) {
          setFiles(rawFiles);
          const snap: Record<string, Record<string, unknown>> = {};
          for (const f of rawFiles) {
            snap[f.relative_path] = JSON.parse(JSON.stringify(f.data));
          }
          setOriginalSnapshotByPath(snap);
          setDirtyPaths({});
          setUndoStack([]);
          setRedoStack([]);
          setConnectionMode('VITE_DISK_LIVE');
          setSelectedPath((prev) =>
            prev && rawFiles.some((f) => f.relative_path === prev)
              ? prev
              : rawFiles[0].relative_path
          );
          showToast('SUCCESS', `Đã nạp trực tiếp ${rawFiles.length} file JSON từ thư mục src/data/.`);
          return;
        }
      }
    } catch {
      // Môi trường Preview không có Vite middleware
    }

    const fallback = buildFallbackEcoLifeFiles();
    const snap: Record<string, Record<string, unknown>> = {};
    for (const f of fallback) {
      snap[f.relative_path] = JSON.parse(JSON.stringify(f.data));
    }
    setFiles(fallback);
    setOriginalSnapshotByPath(snap);
    setDirtyPaths({});
    setUndoStack([]);
    setRedoStack([]);
    setConnectionMode('SANDBOX_PREVIEW');
    setSelectedPath(fallback[0].relative_path);
  }, [showToast]);

  useEffect(() => {
    void loadDatabaseFiles();
  }, [loadDatabaseFiles]);

  // Chỉ mục từ điển & quan hệ khóa ngoại sống
  const viDict = useMemo(() => buildViLookupFromFiles(files), [files]);
  const relationIndex = useMemo(() => buildDynamicRelationIndex(files, viDict), [files, viDict]);
  const auditIssues = useMemo(
    () => runLiveCrossFileAudit(files, relationIndex, viDict),
    [files, relationIndex, viDict]
  );

  const selectedFile = useMemo(
    () => files.find((f) => f.relative_path === selectedPath) || null,
    [files, selectedPath]
  );

  const collectionsInSelectedFile = useMemo(
    () => (selectedFile ? detectCollectionsInJson(selectedFile.data) : []),
    [selectedFile]
  );

  useEffect(() => {
    if (!selectedFile) {
      setSelectedCollectionKey('');
      setRawFileDraftText('');
      return;
    }
    setRawFileDraftText(JSON.stringify(selectedFile.data, null, 2));
    setRawFileError(null);
    setConfirmDeleteRowKey(null);
    setConfirmDeleteFilePath(null);
    setSelectedRowKeys([]);
    setRowSearchQuery('');
    setCategoryFilter('ALL');
    setCurrentPage(1);

    if (collectionsInSelectedFile.length > 0 && !selectedFile.is_schema_file) {
      const stillExists = collectionsInSelectedFile.some(
        (c) => c.collection_key === selectedCollectionKey
      );
      if (!stillExists) {
        setSelectedCollectionKey(collectionsInSelectedFile[0].collection_key);
      }
      setViewMode('TABLE');
    } else {
      setSelectedCollectionKey('');
      setViewMode('RAW_FILE');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);

  const activeCollection = useMemo(
    () => collectionsInSelectedFile.find((c) => c.collection_key === selectedCollectionKey) || null,
    [collectionsInSelectedFile, selectedCollectionKey]
  );

  const allRows = useMemo(() => {
    if (!selectedFile || !activeCollection) return [];
    return buildTableRowsForCollection(selectedFile.data, activeCollection, viDict);
  }, [selectedFile, activeCollection, viDict]);

  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.category_or_type && r.category_or_type !== '—') {
        set.add(r.category_or_type);
      }
    }
    return Array.from(set).sort();
  }, [allRows]);

  const filteredAndSortedRows = useMemo(() => {
    const q = rowSearchQuery.trim().toLowerCase();
    const filtered = allRows.filter((r) => {
      if (categoryFilter !== 'ALL' && r.category_or_type !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        r.primary_id.toLowerCase().includes(q) ||
        r.display_title.toLowerCase().includes(q) ||
        r.location_summary.toLowerCase().includes(q) ||
        r.category_or_type.toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'numeric_sort_value') {
        cmp = a.numeric_sort_value - b.numeric_sort_value;
      } else {
        cmp = a[sortField].localeCompare(b[sortField], 'vi');
      }
      return sortAsc ? cmp : -cmp;
    });

    return sorted;
  }, [allRows, rowSearchQuery, categoryFilter, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, currentPage, pageSize, totalPages]);

  // Gom nhóm Sidebar theo đúng thứ tự 1 -> 12 của Sổ Cái
  const groupedFiles = useMemo(() => {
    const q = fileSearchQuery.trim().toLowerCase();
    const map: Record<string, JsonDbFileEntry[]> = {};
    for (const f of files) {
      if (q && !f.relative_path.toLowerCase().includes(q)) continue;
      if (!map[f.folder_group]) map[f.folder_group] = [];
      map[f.folder_group].push(f);
    }
    const orderedKeys = Object.keys(map).sort((a, b) => {
      const ia = FOLDER_SORT_ORDER.indexOf(a);
      const ib = FOLDER_SORT_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return orderedKeys.map((key) => ({
      folderKey: key,
      label: FOLDER_LABELS_VI[key] || key,
      items: map[key].sort((a, b) => a.file_name.localeCompare(b.file_name))
    }));
  }, [files, fileSearchQuery]);

  // Tìm kiếm toàn cục xuyên toàn bộ CSDL (Ctrl+K)
  const globalSearchHits = useMemo<GlobalSearchHit[]>(() => {
    const q = globalSearchText.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: GlobalSearchHit[] = [];

    for (const file of files) {
      const cols = detectCollectionsInJson(file.data);
      for (const col of cols) {
        const rows = buildTableRowsForCollection(file.data, col, viDict);
        for (const r of rows) {
          const haystack = `${r.primary_id} ${r.display_title} ${JSON.stringify(r.raw_value)}`.toLowerCase();
          if (haystack.includes(q)) {
            hits.push({
              relative_path: file.relative_path,
              collection_key: col.collection_key,
              record_id: r.primary_id,
              snippet_vi: r.display_title
            });
            if (hits.length >= 60) return hits;
          }
        }
      }
    }
    return hits;
  }, [files, globalSearchText, viDict]);

  // Ghi nhận lịch sử Undo trước khi thay đổi dữ liệu
  const pushUndoSnapshot = useCallback((currentFiles: JsonDbFileEntry[]) => {
    const snapshot = JSON.parse(JSON.stringify(currentFiles)) as JsonDbFileEntry[];
    setUndoStack((prev) => [...prev.slice(-29), snapshot]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prevSnapshot = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, JSON.parse(JSON.stringify(files)) as JsonDbFileEntry[]]);
    setUndoStack((u) => u.slice(0, -1));
    setFiles(prevSnapshot);
    showToast('INFO', 'Đã hoàn tác (Undo) thao tác vừa rồi.');
  }, [undoStack, files, showToast]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextSnapshot = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, JSON.parse(JSON.stringify(files)) as JsonDbFileEntry[]]);
    setRedoStack((r) => r.slice(0, -1));
    setFiles(nextSnapshot);
    showToast('INFO', 'Đã làm lại (Redo) thao tác.');
  }, [redoStack, files, showToast]);

  const mutateFileDataInState = useCallback(
    (relativePath: string, nextData: Record<string, unknown>) => {
      pushUndoSnapshot(files);
      const lineCount = JSON.stringify(nextData, null, 2).split('\n').length;
      setFiles((prev) =>
        prev.map((f) =>
          f.relative_path === relativePath ? { ...f, data: nextData, line_count: lineCount } : f
        )
      );
      setDirtyPaths((prev) => ({ ...prev, [relativePath]: true }));
      if (relativePath === selectedPath) {
        setRawFileDraftText(JSON.stringify(nextData, null, 2));
      }
    },
    [files, pushUndoSnapshot, selectedPath]
  );

  // Lưu file xuống ổ cứng (hoặc tải xuống nếu ở Preview)
  const handleSaveCurrentFile = useCallback(
    async (targetFile?: JsonDbFileEntry) => {
      const fileObj = targetFile || selectedFile;
      if (!fileObj) return;

      let dataToSave = fileObj.data;
      if (!targetFile && viewMode === 'RAW_FILE') {
        try {
          const parsed = JSON.parse(rawFileDraftText);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            setRawFileError('JSON gốc của file bắt buộc phải là Object { ... }.');
            return;
          }
          dataToSave = parsed as Record<string, unknown>;
          mutateFileDataInState(fileObj.relative_path, dataToSave);
          setRawFileError(null);
        } catch (err) {
          setRawFileError(`Sai cú pháp JSON: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      }

      if (connectionMode === 'VITE_DISK_LIVE') {
        try {
          const res = await fetch('/__admin_db/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              relative_path: fileObj.relative_path,
              data: dataToSave
            })
          });
          const result = (await res.json()) as { ok?: boolean; message_vi?: string };
          if (res.ok && result.ok !== false) {
            setDirtyPaths((prev) => ({ ...prev, [fileObj.relative_path]: false }));
            setOriginalSnapshotByPath((prev) => ({
              ...prev,
              [fileObj.relative_path]: JSON.parse(JSON.stringify(dataToSave))
            }));
            showToast('SUCCESS', result.message_vi || `Đã ghi thẳng src/data/${fileObj.relative_path}`);
          } else {
            showToast('ERROR', result.message_vi || 'Ghi file thất bại.');
          }
        } catch {
          showToast('ERROR', 'Mất kết nối Vite Dev Server.');
        }
        return;
      }

      const blob = new Blob([`${JSON.stringify(dataToSave, null, 2)}\n`], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileObj.file_name;
      link.click();
      URL.revokeObjectURL(url);
      setDirtyPaths((prev) => ({ ...prev, [fileObj.relative_path]: false }));
      showToast('SUCCESS', `Đã tải xuống '${fileObj.file_name}' (chế độ Preview).`);
    },
    [selectedFile, viewMode, rawFileDraftText, connectionMode, mutateFileDataInState, showToast]
  );

  // Phím tắt chuyên dụng: Ctrl+K (Tìm toàn CSDL), Ctrl+S (Lưu file), Ctrl+Z / Ctrl+Y (Undo/Redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalSearchOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveCurrentFile();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z' &&
        !editorOpen &&
        viewMode === 'TABLE'
      ) {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSaveCurrentFile, handleUndo, handleRedo, editorOpen, viewMode]);

  // ============================================================================
  // 8. THAO TÁC CRUD, RESTRICT, CASCADE RENAME, BATCH UPDATE & BACKUP
  // ============================================================================

  const handleOpenAddRecord = () => {
    if (!selectedFile || !activeCollection) return;
    setEditingRowKey(null);
    setEditingOriginalPk('');
    setEditingJsonError(null);
    setQuickViKeyTarget(null);

    if (activeCollection.kind === 'STRING_DICTIONARY') {
      setEditingMapKeyName(`new_key_${Date.now().toString().slice(-4)}`);
      setEditingDraftValue('Nhập nội dung tiếng Việt...');
      setEditingRawJsonText(JSON.stringify('Nhập nội dung tiếng Việt...', null, 2));
    } else if (activeCollection.kind === 'OBJECT_MAP') {
      const existingObj = (selectedFile.data[activeCollection.collection_key] || {}) as Record<
        string,
        unknown
      >;
      const template = buildTemplateForNewRecord(
        activeCollection.collection_key,
        Object.values(existingObj)
      );
      setEditingMapKeyName(`KEY_${Date.now().toString().slice(-4)}`);
      setEditingDraftValue(template);
      setEditingRawJsonText(JSON.stringify(template, null, 2));
    } else {
      const existingArr = (selectedFile.data[activeCollection.collection_key] || []) as unknown[];
      const template = buildTemplateForNewRecord(activeCollection.collection_key, existingArr);
      setEditingMapKeyName('');
      setEditingDraftValue(template);
      setEditingRawJsonText(JSON.stringify(template, null, 2));
    }

    setEditorMode('FORM');
    setEditorOpen(true);
  };

  const handleOpenEditRecord = (row: TableRowAdapter) => {
    setEditingRowKey(row.row_key);
    setEditingOriginalPk(row.primary_id);
    setEditingMapKeyName(row.row_key);
    const clonedVal = JSON.parse(JSON.stringify(row.raw_value));
    setEditingDraftValue(clonedVal);
    setEditingRawJsonText(JSON.stringify(clonedVal, null, 2));
    setEditingJsonError(null);
    setQuickViKeyTarget(null);
    setEditorMode('FORM');
    setEditorOpen(true);
  };

  const handleDuplicateRecord = (row: TableRowAdapter) => {
    if (!selectedFile || !activeCollection) return;
    const clonedData = JSON.parse(JSON.stringify(selectedFile.data)) as Record<string, unknown>;
    const clonedItem = JSON.parse(JSON.stringify(row.raw_value));

    if (activeCollection.kind === 'ARRAY_OF_OBJECTS') {
      const arr = clonedData[activeCollection.collection_key] as Array<Record<string, unknown>>;
      const rec = clonedItem as Record<string, unknown>;
      const pk = extractPrimaryKeyInfo(rec);
      if (pk.field && pk.id) {
        rec[pk.field] = `${pk.id}_COPY_${Date.now().toString().slice(-3)}`;
      }
      arr.push(rec);
    } else {
      const mapObj = clonedData[activeCollection.collection_key] as Record<string, unknown>;
      mapObj[`${row.row_key}_COPY_${Date.now().toString().slice(-3)}`] = clonedItem;
    }

    mutateFileDataInState(selectedFile.relative_path, clonedData);
    showToast('INFO', `Đã nhân bản '${row.primary_id}'. Bấm Ctrl+S để lưu xuống đĩa.`);
  };

  const handleAttemptDeleteRecord = (row: TableRowAdapter) => {
    if (!selectedFile || !activeCollection) return;

    // [Chốt 1 - SQL ON DELETE RESTRICT]: Kiểm tra có bảng nào đang tham chiếu tới ID này không
    const guard = checkRecordDeleteGuard(
      files,
      selectedFile.relative_path,
      activeCollection.collection_key,
      row.row_key,
      row.primary_id,
      row.raw_value
    );
    if (!guard.can_delete) {
      setBlockedDeleteReport(guard);
      setConfirmDeleteRowKey(null);
      return;
    }

    // [Chốt 2 - Xác nhận 2 bước]: Chống bấm nhầm
    if (confirmDeleteRowKey !== row.row_key) {
      setConfirmDeleteRowKey(row.row_key);
      return;
    }

    const clonedData = JSON.parse(JSON.stringify(selectedFile.data)) as Record<string, unknown>;
    if (activeCollection.kind === 'ARRAY_OF_OBJECTS') {
      const arr = clonedData[activeCollection.collection_key] as unknown[];
      const idx = Number(row.row_key);
      if (!Number.isNaN(idx) && idx >= 0 && idx < arr.length) {
        arr.splice(idx, 1);
      }
    } else {
      const mapObj = clonedData[activeCollection.collection_key] as Record<string, unknown>;
      delete mapObj[row.row_key];
    }

    setConfirmDeleteRowKey(null);
    setSelectedRowKeys((prev) => prev.filter((k) => k !== row.row_key));
    mutateFileDataInState(selectedFile.relative_path, clonedData);
    showToast('INFO', `Đã xóa bản ghi '${row.primary_id}'.`);
  };

  // Xóa hàng loạt các dòng đã tick chọn (vẫn chạy chốt RESTRICT cho từng dòng)
  const handleBulkDeleteSelected = () => {
    if (!selectedFile || !activeCollection || selectedRowKeys.length === 0) return;

    const rowsToDelete = allRows.filter((r) => selectedRowKeys.includes(r.row_key));
    for (const r of rowsToDelete) {
      const guard = checkRecordDeleteGuard(
        files,
        selectedFile.relative_path,
        activeCollection.collection_key,
        r.row_key,
        r.primary_id,
        r.raw_value
      );
      if (!guard.can_delete) {
        setBlockedDeleteReport(guard);
        return;
      }
    }

    const clonedData = JSON.parse(JSON.stringify(selectedFile.data)) as Record<string, unknown>;
    if (activeCollection.kind === 'ARRAY_OF_OBJECTS') {
      const idxSet = new Set(selectedRowKeys.map(Number));
      const arr = clonedData[activeCollection.collection_key] as unknown[];
      clonedData[activeCollection.collection_key] = arr.filter((_, i) => !idxSet.has(i));
    } else {
      const mapObj = clonedData[activeCollection.collection_key] as Record<string, unknown>;
      for (const k of selectedRowKeys) {
        delete mapObj[k];
      }
    }

    const deletedCount = selectedRowKeys.length;
    setSelectedRowKeys([]);
    mutateFileDataInState(selectedFile.relative_path, clonedData);
    showToast('SUCCESS', `Đã xóa hàng loạt ${deletedCount} bản ghi an toàn (0 tham chiếu bị phá vỡ).`);
  };

  // Cập nhật hàng loạt 1 trường cho các dòng đang tick chọn (Batch Update)
  const handleCommitBatchUpdate = () => {
    if (!selectedFile || !activeCollection || selectedRowKeys.length === 0) return;
    if (activeCollection.kind === 'STRING_DICTIONARY') return;

    let parsedVal: unknown = batchFieldValue;
    if (batchFieldValue === 'true') parsedVal = true;
    else if (batchFieldValue === 'false') parsedVal = false;
    else if (batchFieldValue.trim() !== '' && !Number.isNaN(Number(batchFieldValue))) {
      parsedVal = Number(batchFieldValue);
    }

    const clonedData = JSON.parse(JSON.stringify(selectedFile.data)) as Record<string, unknown>;
    if (activeCollection.kind === 'ARRAY_OF_OBJECTS') {
      const arr = clonedData[activeCollection.collection_key] as Array<Record<string, unknown>>;
      for (const k of selectedRowKeys) {
        const idx = Number(k);
        if (arr[idx] && typeof arr[idx] === 'object') {
          arr[idx][batchFieldKey] = parsedVal;
        }
      }
    } else {
      const mapObj = clonedData[activeCollection.collection_key] as Record<string, Record<string, unknown>>;
      for (const k of selectedRowKeys) {
        if (mapObj[k] && typeof mapObj[k] === 'object') {
          mapObj[k][batchFieldKey] = parsedVal;
        }
      }
    }

    mutateFileDataInState(selectedFile.relative_path, clonedData);
    setBatchEditModalOpen(false);
    showToast(
      'SUCCESS',
      `Đã cập nhật đồng loạt trường '${batchFieldKey}' cho ${selectedRowKeys.length} bản ghi.`
    );
  };

  // Đổi mã ID đồng bộ xuyên toàn bộ file JSON (SQL ON UPDATE CASCADE)
  const handleExecuteCascadeRename = () => {
    if (!cascadeRenameTarget) return;
    const oldId = cascadeRenameTarget.oldId.trim();
    const newId = cascadeRenameTarget.newId.trim();

    if (!newId || newId === oldId) {
      showToast('ERROR', 'Mã ID mới phải khác rỗng và khác mã ID cũ.');
      return;
    }

    pushUndoSnapshot(files);
    let totalReplacements = 0;
    const touchedFiles: string[] = [];

    const nextFiles = files.map((file) => {
      if (file.is_schema_file) return file;
      const res = replaceIdDeepInValue(file.data, oldId, newId);
      if (res.count > 0) {
        totalReplacements = totalReplacements + res.count;
        touchedFiles.push(file.relative_path);
        const nextData = res.nextValue as Record<string, unknown>;
        return {
          ...file,
          data: nextData,
          line_count: JSON.stringify(nextData, null, 2).split('\n').length
        };
      }
      return file;
    });

    setFiles(nextFiles);
    setDirtyPaths((prev) => {
      const copy = { ...prev };
      for (const p of touchedFiles) copy[p] = true;
      return copy;
    });
    setCascadeRenameTarget(null);
    setEditorOpen(false);
    showToast(
      'SUCCESS',
      `ON UPDATE CASCADE: Đã đổi '${oldId}' → '${newId}' tại ${totalReplacements} vị trí trên ${touchedFiles.length} file! Bấm "Lưu Tất Cả" để ghi đĩa.`
    );
  };

  const handleCommitRecordEditor = () => {
    if (!selectedFile || !activeCollection) return;

    let finalValueToSave: unknown = editingDraftValue;
    if (editorMode === 'JSON') {
      try {
        finalValueToSave = JSON.parse(editingRawJsonText);
      } catch (err) {
        setEditingJsonError(
          `Sai cú pháp JSON: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }
    }

    const clonedData = JSON.parse(JSON.stringify(selectedFile.data)) as Record<string, unknown>;
    if (activeCollection.kind === 'ARRAY_OF_OBJECTS') {
      const arr = clonedData[activeCollection.collection_key] as unknown[];
      if (editingRowKey === null) {
        arr.push(finalValueToSave);
      } else {
        arr[Number(editingRowKey)] = finalValueToSave;
      }
    } else {
      const cleanKey = editingMapKeyName.trim();
      if (!cleanKey) {
        setEditingJsonError('Mã khóa chính (Key) không được để trống.');
        return;
      }
      const mapObj = clonedData[activeCollection.collection_key] as Record<string, unknown>;
      if (editingRowKey !== null && editingRowKey !== cleanKey) {
        delete mapObj[editingRowKey];
      }
      mapObj[cleanKey] = finalValueToSave;
    }

    mutateFileDataInState(selectedFile.relative_path, clonedData);
    setEditorOpen(false);
    showToast(
      'SUCCESS',
      editingRowKey === null ? 'Đã thêm bản ghi mới vào bảng.' : 'Đã cập nhật bản ghi thành công.'
    );
  };

  const handleQuickAddTranslationToViVn = (translationKey: string) => {
    const cleanText = quickViTextInput.trim();
    if (!cleanText) return;

    const viFile = files.find((f) => f.file_name === 'vi_VN.json');
    if (!viFile) {
      showToast('ERROR', 'Không tìm thấy file localization/vi_VN.json.');
      return;
    }

    const clonedVi = JSON.parse(JSON.stringify(viFile.data)) as Record<string, unknown>;
    let targetGroup = 'ui_system';
    if (translationKey.startsWith('evt_cal_') || translationKey.startsWith('log_cal_')) {
      targetGroup = 'calendar_events';
    } else if (translationKey.startsWith('evt_school_')) {
      targetGroup = 'school_events';
    } else if (translationKey.startsWith('debuff_')) {
      targetGroup = 'overuse_debuffs';
    } else if (translationKey.startsWith('evt_')) {
      targetGroup = 'family_and_lifecycle_events';
    }

    if (!clonedVi[targetGroup] || typeof clonedVi[targetGroup] !== 'object') {
      clonedVi[targetGroup] = {};
    }
    (clonedVi[targetGroup] as Record<string, string>)[translationKey] = cleanText;

    mutateFileDataInState(viFile.relative_path, clonedVi);
    setQuickViKeyTarget(null);
    setQuickViTextInput('');
    showToast('SUCCESS', `Đã thêm khóa '${translationKey}' vào vi_VN.json (${targetGroup}).`);
  };

  const handleSaveAllDirtyFiles = async () => {
    const dirtyList = files.filter((f) => dirtyPaths[f.relative_path]);
    if (dirtyList.length === 0) {
      showToast('INFO', 'Tất cả file đều đã đồng bộ, không có thay đổi chờ lưu.');
      return;
    }
    for (const f of dirtyList) {
      await handleSaveCurrentFile(f);
    }
  };

  const handleAttemptDeleteCurrentFile = async (targetFile: JsonDbFileEntry) => {
    const guard = checkFileDeleteGuard(files, targetFile, relationIndex);
    if (!guard.can_delete) {
      setBlockedDeleteReport(guard);
      setConfirmDeleteFilePath(null);
      return;
    }

    if (confirmDeleteFilePath !== targetFile.relative_path) {
      setConfirmDeleteFilePath(targetFile.relative_path);
      return;
    }

    if (connectionMode === 'VITE_DISK_LIVE') {
      try {
        const res = await fetch('/__admin_db/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relative_path: targetFile.relative_path })
        });
        const result = (await res.json()) as { ok?: boolean; message_vi?: string };
        if (!res.ok || result.ok === false) {
          showToast('ERROR', result.message_vi || 'Xóa file thất bại.');
          return;
        }
      } catch {
        showToast('ERROR', 'Mất kết nối Vite Dev Server.');
        return;
      }
    }

    pushUndoSnapshot(files);
    const remaining = files.filter((f) => f.relative_path !== targetFile.relative_path);
    setFiles(remaining);
    setConfirmDeleteFilePath(null);
    setSelectedPath(remaining.length > 0 ? remaining[0].relative_path : '');
    showToast('INFO', `Đã xóa file src/data/${targetFile.relative_path}.`);
  };

  const handleCreateNewJsonFile = async () => {
    let cleanName = newFileName.trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    if (!cleanName) {
      showToast('ERROR', 'Vui lòng nhập tên file JSON hợp lệ.');
      return;
    }
    if (!cleanName.endsWith('.json')) {
      cleanName = `${cleanName}.json`;
    }

    const relPath = newFileFolder === 'root' ? cleanName : `${newFileFolder}/${cleanName}`;
    if (files.some((f) => f.relative_path === relPath)) {
      showToast('ERROR', `File '${relPath}' đã tồn tại.`);
      return;
    }

    const initialData: Record<string, unknown> =
      newFileFolder === 'event'
        ? {
            $schema: './event_engine_schema.json',
            module_id: `EVT_MOD_${cleanName.replace('.json', '').toUpperCase()}`,
            description: 'Module sự kiện mới tạo từ trang Admin CSDL',
            events: []
          }
        : {
            metadata: {
              version: '2.5.0',
              description: `Dữ liệu mới thuộc nhóm ${newFileFolder}`
            },
            items: []
          };

    if (connectionMode === 'VITE_DISK_LIVE') {
      const res = await fetch('/__admin_db/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_group: newFileFolder,
          file_name: cleanName,
          initial_data: initialData
        })
      });
      const result = (await res.json()) as { ok?: boolean; message_vi?: string };
      if (!res.ok || result.ok === false) {
        showToast('ERROR', result.message_vi || 'Tạo file mới thất bại.');
        return;
      }
    }

    pushUndoSnapshot(files);
    const newEntry: JsonDbFileEntry = {
      relative_path: relPath,
      folder_group: newFileFolder,
      file_name: cleanName,
      is_schema_file: cleanName.endsWith('_schema.json'),
      line_count: JSON.stringify(initialData, null, 2).split('\n').length,
      data: initialData
    };
    setFiles((prev) =>
      [...prev, newEntry].sort((a, b) => a.relative_path.localeCompare(b.relative_path))
    );
    setOriginalSnapshotByPath((prev) => ({
      ...prev,
      [relPath]: JSON.parse(JSON.stringify(initialData))
    }));
    setSelectedPath(relPath);
    setCreateFileModalOpen(false);
    setNewFileName('');
    showToast('SUCCESS', `Đã tạo file mới src/data/${relPath}.`);
  };

  const handleImportJsonFromDisk = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '{}');
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const existing = files.find((f) => f.file_name === uploaded.name);
        if (existing) {
          mutateFileDataInState(existing.relative_path, parsed);
          setSelectedPath(existing.relative_path);
          showToast('SUCCESS', `Đã nạp đè dữ liệu vào '${existing.relative_path}'.`);
        } else {
          pushUndoSnapshot(files);
          const newRel = `imported/${uploaded.name}`;
          const newEntry: JsonDbFileEntry = {
            relative_path: newRel,
            folder_group: 'root',
            file_name: uploaded.name,
            is_schema_file: uploaded.name.endsWith('_schema.json'),
            line_count: text.split('\n').length,
            data: parsed
          };
          setFiles((prev) => [...prev, newEntry]);
          setSelectedPath(newRel);
          showToast('SUCCESS', `Đã nhập file '${uploaded.name}' vào phiên làm việc.`);
        }
      } catch {
        showToast('ERROR', 'File chọn lên sai cú pháp JSON.');
      }
    };
    reader.readAsText(uploaded, 'utf-8');
    e.target.value = '';
  };

  // Sao lưu ảnh chụp toàn bộ CSDL (Backup Snapshot JSON)
  const handleDownloadFullDbBackup = () => {
    const backupPayload = {
      backup_created_at: new Date().toISOString(),
      project: 'Eco-Life (Dòng Đời) V2.5',
      total_files: files.length,
      files: files.map((f) => ({ relative_path: f.relative_path, data: f.data }))
    };
    const blob = new Blob([`${JSON.stringify(backupPayload, null, 2)}\n`], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eco_life_db_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('SUCCESS', `Đã sao lưu toàn bộ ${files.length} file JSON thành 1 file Snapshot.`);
  };

  const jumpToRecord = (relativePath: string, collectionKey: string, recordId: string) => {
    setSelectedPath(relativePath);
    setSelectedCollectionKey(collectionKey);
    setRowSearchQuery(recordId);
    setViewMode('TABLE');
    setCurrentPage(1);
    setAuditModalOpen(false);
    setBlockedDeleteReport(null);
    setUsagesModalData(null);
    setGlobalSearchOpen(false);
  };

  // Hàm đệ quy cập nhật trường theo đường dẫn trong Form Thông Minh
  const updateDraftAtPath = (path: string[], nextVal: unknown) => {
    if (typeof editingDraftValue !== 'object' || editingDraftValue === null) return;
    const cloned = JSON.parse(JSON.stringify(editingDraftValue)) as Record<string, unknown>;
    let cursor: Record<string, unknown> = cloned;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (!cursor[k] || typeof cursor[k] !== 'object' || Array.isArray(cursor[k])) {
        cursor[k] = {};
      }
      cursor = cursor[k] as Record<string, unknown>;
    }
    cursor[path[path.length - 1]] = nextVal;
    setEditingDraftValue(cloned);
    setEditingRawJsonText(JSON.stringify(cloned, null, 2));
  };

  // Đếm nơi tham chiếu cho bản ghi đang mở trong Modal sửa
  const editingIncomingRefs = useMemo(() => {
    if (!editorOpen || !selectedFile || !activeCollection || editingRowKey === null || !editingOriginalPk) {
      return [];
    }
    return checkRecordDeleteGuard(
      files,
      selectedFile.relative_path,
      activeCollection.collection_key,
      editingRowKey,
      editingOriginalPk,
      editingDraftValue
    ).references;
  }, [editorOpen, selectedFile, activeCollection, editingRowKey, editingOriginalPk, editingDraftValue, files]);

  // Render trường Form thông minh tự nhận diện Khóa Ngoại Sống (FK Dropdown / Searchable Chips / visual_slot)
  const renderSmartFormField = (
    fieldKey: string,
    fieldVal: unknown,
    path: string[],
    parentObj: Record<string, unknown>
  ): React.ReactNode => {
    const fullKey = path.join('.');
    const fkInfo = getForeignKeyOptionsForField(
      fieldKey,
      relationIndex,
      parentObj,
      activeCollection?.collection_key
    );

    // [1A] Khóa ngoại Mảng -> Thẻ chọn nhiều có ô lọc nhanh (Searchable Chips)
    if (Array.isArray(fieldVal) && fkInfo?.rule.is_multi) {
      return (
        <div key={fullKey} className="space-y-1.5 rounded border border-[#DDD4C2] bg-white p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-bold text-[#3C3227]">{fieldKey}</span>
            <span className="inline-flex items-center gap-1 rounded bg-[#EFE7D7] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#6E5A41]">
              <Link2 className="h-3 w-3" /> FK → {fkInfo.rule.target_table} ({fieldVal.length})
            </span>
          </div>
          <SearchableFkChips
            options={fkInfo.options}
            selectedValues={fieldVal.map(String)}
            onChange={(nextArr) => updateDraftAtPath(path, nextArr)}
          />
        </div>
      );
    }

    // [1B] Khóa ngoại Đơn -> Select chọn trực tiếp từ dữ liệu sống (kèm tên tiếng Việt)
    if ((typeof fieldVal === 'string' || fieldVal === null) && fkInfo && !fkInfo.rule.is_multi) {
      const currentVal = fieldVal ?? '';
      const isMissingInIndex =
        currentVal !== '' && !fkInfo.options.some((o) => o.id === currentVal);
      return (
        <div key={fullKey} className="space-y-1 rounded border border-[#DDD4C2] bg-white p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-bold text-[#3C3227]">{fieldKey}</span>
            <span className="inline-flex items-center gap-1 rounded bg-[#EFE7D7] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#6E5A41]">
              <Link2 className="h-3 w-3" /> FK → {fkInfo.rule.target_table}
            </span>
          </div>
          <select
            value={currentVal}
            onChange={(e) => updateDraftAtPath(path, e.target.value)}
            className="w-full rounded border border-[#C8BFA8] bg-[#FAF6EE] px-2.5 py-2 font-mono text-xs text-[#1F1B16] focus:border-[#B8382A] focus:outline-none"
          >
            <option value="">-- Chọn {fkInfo.rule.target_table} --</option>
            {isMissingInIndex && (
              <option value={currentVal}>⚠ [Chưa có trong bảng đích] {currentVal}</option>
            )}
            {fkInfo.options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id} {opt.label_vi !== opt.id ? `— ${opt.label_vi}` : ''}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // [2] Object lồng nhau -> Phân rã thành Form con + khung xem trước tọa độ visual_slot
    if (fieldVal && typeof fieldVal === 'object' && !Array.isArray(fieldVal)) {
      const nestedObj = fieldVal as Record<string, unknown>;
      return (
        <div key={fullKey} className="space-y-2 rounded border border-[#D4C6AE] bg-[#F7F2E8] p-3">
          <div className="font-mono text-xs font-bold text-[#3C3227]">{fieldKey}</div>
          <div className="space-y-2 border-l-2 border-[#C8BFA8] pl-3">
            {Object.keys(nestedObj).map((subKey) =>
              renderSmartFormField(subKey, nestedObj[subKey], [...path, subKey], nestedObj)
            )}
          </div>
          {fieldKey === 'visual_slot' && (
            <div className="rounded border border-dashed border-[#B8382A] bg-[#F2ECE0] p-2">
              <div className="mb-1 text-[11px] font-semibold text-[#B8382A]">
                Xem trước vị trí vẽ xếp lớp lên phòng trống (visual_slot):
              </div>
              <div
                className="relative h-28 w-full overflow-hidden rounded border border-[#1F1B16]"
                style={{
                  background:
                    'linear-gradient(180deg, #FAF6EE 0%, #FAF6EE 66%, #DDD2BD 66%, #DDD2BD 100%)'
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.max(0, Math.min(88, Number(nestedObj.anchor_x_pct || 0)))}%`,
                    top: `${Math.max(0, Math.min(72, Number(nestedObj.anchor_y_pct || 0)))}%`,
                    width: `${Math.max(10, Math.min(70, Number(nestedObj.width_pct || 20)))}%`,
                    height: '36%',
                    backgroundColor: 'rgba(184, 56, 42, 0.22)',
                    border: '2px solid #B8382A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#7A1C12'
                  }}
                >
                  {String(nestedObj.asset_id || 'slot')}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // [3] Mảng phức tạp khác (VD: choices, interactable_actions) -> Ô JSON rút gọn
    if (Array.isArray(fieldVal)) {
      return (
        <div key={fullKey} className="space-y-1 rounded border border-[#DDD4C2] bg-white p-3">
          <div className="font-mono text-xs font-bold text-[#3C3227]">{fieldKey} (Mảng JSON)</div>
          <textarea
            rows={Math.min(10, Math.max(3, JSON.stringify(fieldVal, null, 2).split('\n').length))}
            defaultValue={JSON.stringify(fieldVal, null, 2)}
            onBlur={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                if (Array.isArray(parsed)) {
                  updateDraftAtPath(path, parsed);
                  setEditingJsonError(null);
                }
              } catch {
                setEditingJsonError(`Trường '${fullKey}' sai cú pháp mảng JSON.`);
              }
            }}
            spellCheck={false}
            className="w-full rounded border border-[#C8BFA8] bg-[#FAF6EE] p-2 font-mono text-xs focus:border-[#B8382A] focus:outline-none"
          />
        </div>
      );
    }

    // [4] Boolean
    if (typeof fieldVal === 'boolean') {
      return (
        <div key={fullKey} className="rounded border border-[#DDD4C2] bg-white p-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-[#3C3227]">
            <input
              type="checkbox"
              checked={fieldVal}
              onChange={(e) => updateDraftAtPath(path, e.target.checked)}
              className="h-4 w-4 accent-[#B8382A]"
            />
            <span className="font-mono">{fieldKey}</span>
            <span className="font-normal text-[#6E604E]">({fieldVal ? 'Bật' : 'Tắt'})</span>
          </label>
        </div>
      );
    }

    // [5] Số
    if (typeof fieldVal === 'number') {
      return (
        <div key={fullKey} className="space-y-1 rounded border border-[#DDD4C2] bg-white p-3">
          <label className="block font-mono text-xs font-bold text-[#3C3227]">{fieldKey}</label>
          <input
            type="number"
            step="any"
            value={fieldVal}
            onChange={(e) => {
              const n = Number(e.target.value);
              updateDraftAtPath(path, Number.isNaN(n) ? 0 : n);
            }}
            className="w-full rounded border border-[#C8BFA8] bg-[#FAF6EE] px-2.5 py-1.5 font-mono text-xs focus:border-[#B8382A] focus:outline-none"
          />
        </div>
      );
    }

    // [6] Chuỗi thường + Tự động soi bản dịch vi_VN.json cho *_key
    const strVal = fieldVal === null || fieldVal === undefined ? '' : String(fieldVal);
    const isI18nKey = fieldKey.endsWith('_key') && strVal.trim() !== '' && !strVal.includes(' ');
    const isPkField = path.length === 1 && PK_FIELD_CANDIDATES.includes(fieldKey);

    return (
      <div key={fullKey} className="space-y-1.5 rounded border border-[#DDD4C2] bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <label className="font-mono text-xs font-bold text-[#3C3227]">
            {fieldKey} {isPkField && <span className="text-[#B8382A]">(PK)</span>}
          </label>
          {isPkField && editingRowKey !== null && editingOriginalPk && (
            <button
              type="button"
              onClick={() =>
                setCascadeRenameTarget({ oldId: editingOriginalPk, newId: strVal || editingOriginalPk })
              }
              className="inline-flex items-center gap-1 rounded border border-[#B8382A] bg-[#FFF5F3] px-2 py-0.5 text-[11px] font-semibold text-[#B8382A] hover:bg-[#FDE4DF]"
            >
              <KeyRound className="h-3 w-3" /> Đổi ID Đồng Bộ (CASCADE)
            </button>
          )}
        </div>
        <input
          type="text"
          value={strVal}
          onChange={(e) => updateDraftAtPath(path, e.target.value)}
          className="w-full rounded border border-[#C8BFA8] bg-[#FAF6EE] px-2.5 py-1.5 text-xs focus:border-[#B8382A] focus:outline-none"
        />
        {isI18nKey && viDict[strVal] && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900">
            ✓ vi_VN: “{viDict[strVal]}”
          </div>
        )}
        {isI18nKey && !viDict[strVal] && (
          <div className="space-y-1.5 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-950">
            <div className="flex items-center justify-between gap-2">
              <span>⚠ Chưa có khóa “{strVal}” trong vi_VN.json</span>
              <button
                type="button"
                onClick={() => {
                  setQuickViKeyTarget(strVal);
                  setQuickViTextInput('');
                }}
                className="font-bold text-[#B8382A] underline"
              >
                + Thêm ngay
              </button>
            </div>
            {quickViKeyTarget === strVal && (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={quickViTextInput}
                  onChange={(e) => setQuickViTextInput(e.target.value)}
                  placeholder="Nhập câu tiếng Việt hiển thị..."
                  className="flex-1 rounded border border-amber-500 bg-white px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleQuickAddTranslationToViVn(strVal)}
                  className="rounded bg-[#B8382A] px-2.5 py-1 text-xs font-bold text-white"
                >
                  Lưu Dịch
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const dirtyCount = Object.values(dirtyPaths).filter(Boolean).length;
  const errorCount = auditIssues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = auditIssues.filter((i) => i.severity === 'WARNING').length;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // ============================================================================
  // 9. RENDER GIAO DIỆN QUẢN TRỊ CSDL GIẤY DÓ (KHÓA FONT TIẾNG VIỆT & HEADER TỐI)
  // ============================================================================

  return (
    <div
      className="fixed inset-0 z-[9000] flex h-screen w-screen flex-col overflow-hidden bg-[#F2ECE0] text-left text-sm text-[#1F1B16]"
      style={{
        fontFamily: '"Be Vietnam Pro", "Segoe UI", Roboto, Arial, sans-serif',
        fontVariantNumeric: 'lining-nums',
        backgroundColor: '#F2ECE0',
        color: '#1F1B16'
      }}
    >
      {/* === 1. THANH TIÊU ĐỀ TRÊN CÙNG === */}
      <header
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-4 border-[#B8382A] px-4 py-3 shadow-sm"
        style={{ backgroundColor: '#1F1B16', color: '#F9F5EC' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded border border-[#5A5043] bg-[#2D261F] p-2 text-[#F9F5EC] lg:hidden"
            aria-label="Mở danh mục file JSON"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#B8382A] bg-[#B8382A] text-white">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="text-base font-bold tracking-wide sm:text-lg"
                style={{
                  fontFamily: '"Noto Serif", "Times New Roman", serif',
                  color: '#F9F5EC'
                }}
              >
                DÒNG ĐỜI — QUẢN TRỊ CƠ SỞ DỮ LIỆU JSON
              </h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  connectionMode === 'VITE_DISK_LIVE'
                    ? 'border-[#3C8C62] bg-[#1F4D36] text-[#B7F5D0]'
                    : 'border-[#A87B2D] bg-[#5C4318] text-[#FDE3A7]'
                }`}
              >
                ● {connectionMode === 'VITE_DISK_LIVE' ? 'GHI TRỰC TIẾP Ổ CỨNG' : 'PREVIEW / IMPORT'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#B8382A] bg-[#5E221B] px-2 py-0.5 text-[11px] font-semibold text-[#FFD4CE]">
                <Lock className="h-3 w-3" /> CHỈ NỘI BỘ (ẨN KHI BUILD DESKTOP)
              </span>
            </div>
            <p className="hidden text-xs text-[#D6CBB8] sm:block">
              {files.length} file JSON • {relationIndex.total_indexed_records} bản ghi đã lập chỉ mục quan hệ (FK động, RESTRICT, CASCADE, Undo/Redo, Ctrl+K)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Tìm toàn cục Ctrl+K */}
          <button
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#574D40] bg-[#2F2922] px-2.5 py-1.5 text-xs font-semibold text-[#F5EFE4] hover:bg-[#413930]"
            title="Tìm kiếm xuyên toàn bộ các file JSON (Ctrl + K)"
          >
            <Search className="h-3.5 w-3.5 text-[#F4D6B8]" />
            <span className="hidden md:inline">Tìm Toàn CSDL</span>
            <kbd className="rounded bg-[#1F1B16] px-1 text-[10px] text-[#CBBBA3]">Ctrl+K</kbd>
          </button>

          {/* Sơ đồ quan hệ ER */}
          <button
            type="button"
            onClick={() => setErDiagramModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#574D40] bg-[#2F2922] px-2.5 py-1.5 text-xs font-semibold text-[#F5EFE4] hover:bg-[#413930]"
            title="Xem tổng quan các bảng khóa chính & luồng quan hệ khóa ngoại"
          >
            <Network className="h-3.5 w-3.5 text-[#8DC8F5]" />
            <span className="hidden xl:inline">Sơ Đồ Quan Hệ</span>
          </button>

          {/* Undo / Redo */}
          <div className="inline-flex overflow-hidden rounded border border-[#574D40]">
            <button
              type="button"
              disabled={undoStack.length === 0}
              onClick={handleUndo}
              title={`Hoàn tác (Ctrl+Z) — Còn ${undoStack.length} bước`}
              className="bg-[#2F2922] px-2 py-1.5 text-[#F5EFE4] hover:bg-[#413930] disabled:opacity-35"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={redoStack.length === 0}
              onClick={handleRedo}
              title="Làm lại (Ctrl+Shift+Z)"
              className="border-l border-[#574D40] bg-[#2F2922] px-2 py-1.5 text-[#F5EFE4] hover:bg-[#413930] disabled:opacity-35"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Kiểm toán khóa ngoại sống */}
          <button
            type="button"
            onClick={() => setAuditModalOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-semibold ${
              errorCount > 0
                ? 'border-[#E06A5C] bg-[#B8382A] text-white'
                : 'border-[#574D40] bg-[#2F2922] text-[#F5EFE4] hover:bg-[#413930]'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-[#8DE0AF]" />
            <span>
              Kiểm Toán ({errorCount}/{warningCount})
            </span>
          </button>

          {/* Tạo File Mới */}
          <button
            type="button"
            onClick={() => setCreateFileModalOpen(true)}
            className="inline-flex items-center gap-1 rounded border border-[#92281C] bg-[#B8382A] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#9E2D20]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tạo File</span>
          </button>

          {/* Nạp File + Sao lưu Snapshot */}
          <input
            ref={fileUploadInputRef}
            type="file"
            accept=".json"
            onChange={handleImportJsonFromDisk}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileUploadInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded border border-[#574D40] bg-[#2F2922] px-2.5 py-1.5 text-xs font-semibold text-[#F5EFE4] hover:bg-[#413930]"
            title="Nhập file JSON từ máy tính"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDownloadFullDbBackup}
            className="inline-flex items-center gap-1 rounded border border-[#574D40] bg-[#2F2922] px-2.5 py-1.5 text-xs font-semibold text-[#F5EFE4] hover:bg-[#413930]"
            title="Sao lưu toàn bộ CSDL thành 1 file Snapshot .json"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          {dirtyCount > 0 && (
            <button
              type="button"
              onClick={() => void handleSaveAllDirtyFiles()}
              className="inline-flex items-center gap-1.5 rounded border border-[#F0B45A] bg-[#D9821E] px-3 py-1.5 text-xs font-bold text-[#1F1B16] hover:bg-[#E59230]"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Lưu Tất Cả ({dirtyCount})</span>
            </button>
          )}
        </div>
      </header>

      {/* === THÔNG BÁO TOAST (KHÔNG DÙNG ALERT) === */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[9900] flex max-w-md items-center gap-2.5 rounded border-2 border-[#1F1B16] bg-[#FAF6EE] px-4 py-3 text-xs font-semibold shadow-xl">
          {toast.type === 'SUCCESS' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />}
          {toast.type === 'ERROR' && <AlertTriangle className="h-4 w-4 shrink-0 text-[#B8382A]" />}
          {toast.type === 'INFO' && <Database className="h-4 w-4 shrink-0 text-amber-800" />}
          <span>{toast.text_vi}</span>
        </div>
      )}

      {/* === 2. BỐ CỤC CHÍNH 2 CỘT === */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* CỘT TRÁI: CÂY DANH MỤC FILE JSON */}
        <aside
          className={`${
            mobileMenuOpen ? 'fixed inset-y-0 left-0 z-40 flex w-72 shadow-2xl' : 'hidden'
          } w-72 shrink-0 flex-col border-r border-[#C8BFA8] bg-[#EAE2D2] lg:static lg:flex`}
        >
          <div className="space-y-2 border-b border-[#CFC2AA] p-3">
            <div className="flex items-center justify-between text-xs font-bold text-[#3A3126]">
              <span>Danh Mục Bảng (src/data/)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void loadDatabaseFiles()}
                  title="Tải lại toàn bộ từ đĩa"
                  className="rounded border border-[#C6B9A2] bg-[#FAF6EE] p-1 hover:bg-[#DFD4BF]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded p-1 hover:bg-[#DFD4BF] lg:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#7A6A53]" />
              <input
                type="text"
                value={fileSearchQuery}
                onChange={(e) => setFileSearchQuery(e.target.value)}
                placeholder="Tìm tên file JSON..."
                className="w-full rounded border border-[#BFB199] bg-[#FFFCF6] py-1.5 pl-8 pr-2.5 text-xs focus:border-[#B8382A] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-2.5 pb-20">
            {groupedFiles.map(({ folderKey, label, items }) => (
              <div key={folderKey}>
                <div className="mb-1 flex items-center gap-1.5 border-b border-dashed border-[#CBBDA4] px-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#6B5B47]">
                  <Folder className="h-3.5 w-3.5 shrink-0 text-[#B8382A]" />
                  <span className="truncate">{label}</span>
                </div>
                <div className="space-y-0.5">
                  {items.map((file) => {
                    const isSelected = file.relative_path === selectedPath;
                    const isDirty = Boolean(dirtyPaths[file.relative_path]);
                    const issueCount = auditIssues.filter(
                      (i) => i.relative_path === file.relative_path
                    ).length;
                    return (
                      <button
                        key={file.relative_path}
                        type="button"
                        onClick={() => {
                          setSelectedPath(file.relative_path);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-1.5 rounded px-2 py-1.5 text-left text-xs transition ${
                          isSelected
                            ? 'bg-[#1F1B16] font-semibold text-[#F9F4EA]'
                            : 'text-[#2B241D] hover:bg-[#DFD4BF]'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <FileJson className="h-3.5 w-3.5 shrink-0 opacity-75" />
                          <span className="truncate">{file.file_name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {isDirty && (
                            <span
                              className="h-2 w-2 rounded-full bg-amber-500"
                              title="Chưa lưu xuống đĩa"
                            />
                          )}
                          {file.is_schema_file && (
                            <span
                              className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                                isSelected
                                  ? 'bg-[#B8382A] text-white'
                                  : 'bg-[#D6C8AF] text-[#4F4130]'
                              }`}
                            >
                              SCHEMA
                            </span>
                          )}
                          {issueCount > 0 && (
                            <span className="rounded bg-[#B8382A] px-1.5 text-[10px] font-bold text-white">
                              {issueCount}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* CỘT PHẢI: WORKSPACE QUẢN TRỊ BẢNG & DỮ LIỆU */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#F6F1E6]">
          {!selectedFile ? (
            <div className="flex flex-1 items-center justify-center text-sm italic text-[#6B5B47]">
              Chọn một file JSON bên cột trái để bắt đầu thao tác.
            </div>
          ) : (
            <>
              {/* Thanh công cụ của file đang mở */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#D1C3AB] bg-[#EFE7D7] px-4 py-2.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#1F1B16]">
                      src/data/{selectedFile.relative_path}
                    </span>
                    <span className="rounded bg-[#E2D6C1] px-1.5 py-0.5 text-[11px] font-medium text-[#4A3F30]">
                      {selectedFile.line_count} dòng
                    </span>
                    {dirtyPaths[selectedFile.relative_path] && (
                      <span className="rounded-full border border-[#E4A199] bg-[#FDE7E4] px-2 py-0.5 text-[11px] font-bold text-[#B8382A]">
                        ● Chưa lưu
                      </span>
                    )}
                    {selectedFile.is_schema_file && (
                      <span className="rounded bg-[#1F1B16] px-2 py-0.5 text-[10px] font-bold text-[#F9F4EA]">
                        KHÓA BẢO VỆ SCHEMA
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex overflow-hidden rounded border border-[#1F1B16]">
                    <button
                      type="button"
                      disabled={collectionsInSelectedFile.length === 0}
                      onClick={() => setViewMode('TABLE')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold ${
                        viewMode === 'TABLE'
                          ? 'bg-[#1F1B16] text-[#F9F5EC]'
                          : 'bg-[#FAF6EE] text-[#1F1B16] disabled:opacity-40'
                      }`}
                    >
                      <Table className="h-3.5 w-3.5" /> Bảng
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRawFileDraftText(JSON.stringify(selectedFile.data, null, 2));
                        setViewMode('RAW_FILE');
                      }}
                      className={`inline-flex items-center gap-1 border-l border-[#1F1B16] px-2.5 py-1 text-xs font-semibold ${
                        viewMode === 'RAW_FILE'
                          ? 'bg-[#1F1B16] text-[#F9F5EC]'
                          : 'bg-[#FAF6EE] text-[#1F1B16]'
                      }`}
                    >
                      <Code className="h-3.5 w-3.5" /> JSON Gốc
                    </button>
                  </div>

                  {dirtyPaths[selectedFile.relative_path] && (
                    <button
                      type="button"
                      onClick={() => setDiffModalOpen(true)}
                      className="inline-flex items-center gap-1 rounded border border-[#C6B9A2] bg-[#FAF6EE] px-2.5 py-1 text-xs font-semibold hover:bg-[#E5DAC5]"
                      title="So sánh sự khác biệt với bản gốc trên ổ cứng trước khi lưu"
                    >
                      <GitCompare className="h-3.5 w-3.5 text-[#B8382A]" /> So Sánh Diff
                    </button>
                  )}

                  {viewMode === 'TABLE' && activeCollection && (
                    <button
                      type="button"
                      onClick={() =>
                        exportRowsToCsvFile(
                          filteredAndSortedRows,
                          `${selectedFile.file_name.replace('.json', '')}_${activeCollection.collection_key}`
                        )
                      }
                      className="inline-flex items-center gap-1 rounded border border-[#C6B9A2] bg-[#FAF6EE] px-2.5 py-1 text-xs font-semibold hover:bg-[#E5DAC5]"
                      title="Xuất bảng hiện tại ra CSV mở bằng Excel"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" /> Xuất CSV
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleSaveCurrentFile()}
                    className="inline-flex items-center gap-1.5 rounded border border-[#92281C] bg-[#B8382A] px-3 py-1 text-xs font-bold text-white hover:bg-[#9E2D20]"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {connectionMode === 'VITE_DISK_LIVE' ? 'Lưu Đĩa (Ctrl+S)' : 'Tải .JSON'}
                  </button>

                  {!selectedFile.is_schema_file && (
                    <button
                      type="button"
                      onClick={() => void handleAttemptDeleteCurrentFile(selectedFile)}
                      className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-semibold ${
                        confirmDeleteFilePath === selectedFile.relative_path
                          ? 'border-[#1F1B16] bg-[#1F1B16] text-white'
                          : 'border-[#D98276] bg-[#FFF0EE] text-[#9C2418] hover:bg-[#FFD9D4]'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmDeleteFilePath === selectedFile.relative_path
                        ? 'Xác Nhận Xóa File?'
                        : 'Xóa File'}
                    </button>
                  )}
                </div>
              </div>

              {/* Thanh chọn bảng (Collections) bên trong file JSON */}
              {viewMode === 'TABLE' && collectionsInSelectedFile.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[#D8CCB7] bg-[#F2ECE0] px-4 py-2">
                  {collectionsInSelectedFile.map((col) => (
                    <button
                      key={col.collection_key}
                      type="button"
                      onClick={() => {
                        setSelectedCollectionKey(col.collection_key);
                        setSelectedRowKeys([]);
                        setCategoryFilter('ALL');
                        setCurrentPage(1);
                      }}
                      className={`rounded border px-3 py-1 text-xs font-semibold transition ${
                        col.collection_key === selectedCollectionKey
                          ? 'border-[#92281C] bg-[#B8382A] text-white'
                          : 'border-[#CBBDA4] bg-[#FBF7EF] text-[#42372A] hover:bg-[#EBE2D0]'
                      }`}
                    >
                      {col.label_vi}
                    </button>
                  ))}
                </div>
              )}

              {/* === CHẾ ĐỘ BẢNG DỮ LIỆU === */}
              {viewMode === 'TABLE' && activeCollection && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 pb-14">
                  {/* Thanh lọc, phân loại, hành động hàng loạt & thêm mới */}
                  <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#7A6A53]" />
                        <input
                          type="text"
                          value={rowSearchQuery}
                          onChange={(e) => {
                            setRowSearchQuery(e.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder={`Lọc nhanh trong ${activeCollection.collection_key}...`}
                          className="w-64 rounded border border-[#BFB199] bg-[#FFFCF6] py-1.5 pl-8 pr-2.5 text-xs focus:border-[#B8382A] focus:outline-none"
                        />
                      </div>

                      {distinctCategories.length > 1 && (
                        <select
                          value={categoryFilter}
                          onChange={(e) => {
                            setCategoryFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="rounded border border-[#BFB199] bg-[#FFFCF6] px-2.5 py-1.5 text-xs"
                        >
                          <option value="ALL">Tất cả phân loại ({allRows.length})</option>
                          {distinctCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      )}

                      {selectedRowKeys.length > 0 && (
                        <div className="inline-flex items-center gap-1.5 rounded border border-[#B8382A] bg-[#FDECE9] px-2.5 py-1 text-xs font-semibold text-[#7A1C12]">
                          <span>Đã chọn {selectedRowKeys.length} dòng:</span>
                          {activeCollection.kind !== 'STRING_DICTIONARY' && (
                            <button
                              type="button"
                              onClick={() => setBatchEditModalOpen(true)}
                              className="inline-flex items-center gap-1 rounded bg-[#1F1B16] px-2 py-0.5 text-[11px] text-white"
                            >
                              <SlidersHorizontal className="h-3 w-3" /> Sửa Hàng Loạt
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleBulkDeleteSelected}
                            className="inline-flex items-center gap-1 rounded bg-[#B8382A] px-2 py-0.5 text-[11px] text-white"
                          >
                            <Trash2 className="h-3 w-3" /> Xóa Chọn
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenAddRecord}
                      className="inline-flex items-center gap-1.5 rounded bg-[#1F1B16] px-3.5 py-1.5 text-xs font-bold text-[#F9F4EA] hover:bg-[#383027]"
                    >
                      <Plus className="h-3.5 w-3.5" /> Thêm Bản Ghi Mới
                    </button>
                  </div>

                  {/* Bảng dữ liệu có cuộn dọc, sắp xếp & chọn hàng loạt */}
                  <div className="min-h-0 flex-1 overflow-auto rounded border border-[#CFC2AA] bg-[#FFFCF7]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-[#E6DCC8] text-[#2B241C]">
                        <tr>
                          <th className="w-9 border-b border-r border-[#CFC2AA] px-2.5 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={
                                paginatedRows.length > 0 &&
                                paginatedRows.every((r) => selectedRowKeys.includes(r.row_key))
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRowKeys(paginatedRows.map((r) => r.row_key));
                                } else {
                                  setSelectedRowKeys([]);
                                }
                              }}
                              className="accent-[#B8382A]"
                            />
                          </th>
                          <th className="border-b border-r border-[#CFC2AA] px-2.5 py-2 font-bold">
                            <button
                              type="button"
                              onClick={() => toggleSort('primary_id')}
                              className="inline-flex items-center gap-1 hover:text-[#B8382A]"
                            >
                              Mã Định Danh (PK) <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="border-b border-r border-[#CFC2AA] px-2.5 py-2 font-bold">
                            <button
                              type="button"
                              onClick={() => toggleSort('display_title')}
                              className="inline-flex items-center gap-1 hover:text-[#B8382A]"
                            >
                              Tiêu Đề / Nội Dung Tiếng Việt <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="hidden border-b border-r border-[#CFC2AA] px-2.5 py-2 font-bold md:table-cell">
                            Địa Điểm / Quan Hệ
                          </th>
                          <th className="hidden border-b border-r border-[#CFC2AA] px-2.5 py-2 font-bold sm:table-cell">
                            <button
                              type="button"
                              onClick={() => toggleSort('category_or_type')}
                              className="inline-flex items-center gap-1 hover:text-[#B8382A]"
                            >
                              Phân Loại <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="hidden border-b border-r border-[#CFC2AA] px-2.5 py-2 font-bold lg:table-cell">
                            <button
                              type="button"
                              onClick={() => toggleSort('numeric_sort_value')}
                              className="inline-flex items-center gap-1 hover:text-[#B8382A]"
                            >
                              Thông Số <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="border-b border-[#CFC2AA] px-2.5 py-2 text-right font-bold">
                            Thao Tác
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4DAC8]">
                        {paginatedRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center italic text-[#6B5B47]">
                              Không có bản ghi nào khớp điều kiện lọc.
                            </td>
                          </tr>
                        ) : (
                          paginatedRows.map((row) => {
                            const rowIssues = auditIssues.filter(
                              (iss) =>
                                iss.relative_path === selectedFile.relative_path &&
                                iss.record_id === row.primary_id
                            );
                            const isChecked = selectedRowKeys.includes(row.row_key);
                            return (
                              <tr
                                key={row.row_key}
                                className={`transition ${
                                  isChecked ? 'bg-[#F8E7E3]' : 'hover:bg-[#F8F2E5]'
                                }`}
                              >
                                <td className="border-r border-[#ECE3D4] px-2.5 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedRowKeys((p) => [...p, row.row_key]);
                                      } else {
                                        setSelectedRowKeys((p) =>
                                          p.filter((k) => k !== row.row_key)
                                        );
                                      }
                                    }}
                                    className="accent-[#B8382A]"
                                  />
                                </td>
                                <td className="border-r border-[#ECE3D4] px-2.5 py-2 font-mono text-[11px] font-bold">
                                  <div className="flex items-center gap-1.5">
                                    <span>{row.primary_id}</span>
                                    {rowIssues.length > 0 && (
                                      <span
                                        title={rowIssues.map((i) => i.message_vi).join(' | ')}
                                        className="text-[#B8382A]"
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="max-w-md border-r border-[#ECE3D4] px-2.5 py-2">
                                  <div className="line-clamp-2">{row.display_title}</div>
                                  {rowIssues.length > 0 && (
                                    <div className="mt-0.5 text-[11px] text-[#B8382A]">
                                      ⚠ {rowIssues[0].message_vi}
                                    </div>
                                  )}
                                </td>
                                <td className="hidden border-r border-[#ECE3D4] px-2.5 py-2 font-mono text-[11px] text-[#5A5043] md:table-cell">
                                  {row.location_summary}
                                </td>
                                <td className="hidden border-r border-[#ECE3D4] px-2.5 py-2 sm:table-cell">
                                  <span className="rounded border border-[#C8BFA8] bg-[#EAE1D0] px-1.5 py-0.5 font-mono text-[10px]">
                                    {row.category_or_type}
                                  </span>
                                </td>
                                <td className="hidden whitespace-nowrap border-r border-[#ECE3D4] px-2.5 py-2 text-[11px] lg:table-cell">
                                  {row.extra_metric}
                                </td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      title="Soi những nơi đang tham chiếu tới ID này (Find Usages)"
                                      onClick={() => {
                                        const res = checkRecordDeleteGuard(
                                          files,
                                          selectedFile.relative_path,
                                          activeCollection.collection_key,
                                          row.row_key,
                                          row.primary_id,
                                          row.raw_value
                                        );
                                        setUsagesModalData({
                                          targetId: row.primary_id,
                                          refs: res.references
                                        });
                                      }}
                                      className="rounded border border-[#C8BFA8] bg-white p-1 text-[#4A3F30] hover:bg-[#EAE1D0]"
                                    >
                                      <Link2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Sửa bản ghi"
                                      onClick={() => handleOpenEditRecord(row)}
                                      className="rounded border border-[#C8BFA8] bg-white p-1 text-[#1F1B16] hover:bg-[#EAE1D0]"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Nhân bản nhanh"
                                      onClick={() => handleDuplicateRecord(row)}
                                      className="rounded border border-[#C8BFA8] bg-white p-1 text-[#1F1B16] hover:bg-[#EAE1D0]"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Xóa bản ghi (có bảo vệ ON DELETE RESTRICT)"
                                      onClick={() => handleAttemptDeleteRecord(row)}
                                      className={`rounded border px-1.5 py-1 text-[11px] font-semibold ${
                                        confirmDeleteRowKey === row.row_key
                                          ? 'border-[#B8382A] bg-[#B8382A] text-white'
                                          : 'border-[#D98276] bg-[#FFF0EE] text-[#9C2418] hover:bg-[#FFD9D4]'
                                      }`}
                                    >
                                      {confirmDeleteRowKey === row.row_key ? (
                                        'Xóa?'
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Thanh phân trang chuẩn CSDL cho bảng lớn */}
                  <div className="mt-2.5 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-[#5A5043]">
                    <div>
                      Hiển thị <strong>{paginatedRows.length}</strong> /{' '}
                      <strong>{filteredAndSortedRows.length}</strong> bản ghi
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="rounded border border-[#C8BFA8] bg-white px-2 py-1 text-xs"
                      >
                        <option value={25}>25 dòng / trang</option>
                        <option value={50}>50 dòng / trang</option>
                        <option value={100}>100 dòng / trang</option>
                        <option value={9999}>Hiện tất cả</option>
                      </select>
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="rounded border border-[#C8BFA8] bg-white px-2.5 py-1 font-semibold disabled:opacity-40"
                      >
                        ← Trước
                      </button>
                      <span>
                        Trang <strong>{Math.min(currentPage, totalPages)}</strong> / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="rounded border border-[#C8BFA8] bg-white px-2.5 py-1 font-semibold disabled:opacity-40"
                      >
                        Sau →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* === CHẾ ĐỘ JSON GỐC TOÀN FILE === */}
              {viewMode === 'RAW_FILE' && (
                <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 pb-16">
                  {rawFileError && (
                    <div className="rounded border border-[#B8382A] bg-red-50 px-3 py-2 text-xs font-semibold text-[#B8382A]">
                      {rawFileError}
                    </div>
                  )}
                  <textarea
                    value={rawFileDraftText}
                    onChange={(e) => {
                      setRawFileDraftText(e.target.value);
                      setRawFileError(null);
                      setDirtyPaths((prev) => ({ ...prev, [selectedFile.relative_path]: true }));
                    }}
                    spellCheck={false}
                    className="h-full w-full flex-1 resize-none rounded border border-[#C7B9A0] bg-[#1E1B18] p-3 font-mono text-xs leading-relaxed text-[#EFE7D8] focus:border-[#B8382A] focus:outline-none"
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ========================================================================
          MODAL 1: TRÌNH SỬA / THÊM BẢN GHI (FORM KHÓA NGOẠI ĐỘNG + CASCADE)
         ======================================================================== */}
      {editorOpen && activeCollection && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/60 p-3 sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C8BFA8] bg-[#EFE7D7] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-[#B8382A]">
                  {editingRowKey === null ? 'Thêm Bản Ghi Mới' : `Sửa: ${editingOriginalPk}`}
                </h3>
                {editingRowKey !== null && (
                  <button
                    type="button"
                    onClick={() =>
                      setUsagesModalData({ targetId: editingOriginalPk, refs: editingIncomingRefs })
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-[#C8BFA8] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#4A3F30] hover:bg-[#EAE1D0]"
                  >
                    <Link2 className="h-3 w-3 text-[#B8382A]" />
                    Đang được tham chiếu: {editingIncomingRefs.length} nơi
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex overflow-hidden rounded border border-[#1F1B16]">
                  <button
                    type="button"
                    onClick={() => {
                      if (editorMode === 'JSON') {
                        try {
                          setEditingDraftValue(JSON.parse(editingRawJsonText));
                          setEditingJsonError(null);
                          setEditorMode('FORM');
                        } catch {
                          setEditingJsonError('Sửa hết lỗi cú pháp JSON trước khi quay lại Form.');
                        }
                      }
                    }}
                    className={`px-2.5 py-1 text-xs font-semibold ${
                      editorMode === 'FORM' ? 'bg-[#1F1B16] text-white' : 'bg-white'
                    }`}
                  >
                    Form Quan Hệ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRawJsonText(JSON.stringify(editingDraftValue, null, 2));
                      setEditorMode('JSON');
                    }}
                    className={`border-l border-[#1F1B16] px-2.5 py-1 text-xs font-semibold ${
                      editorMode === 'JSON' ? 'bg-[#1F1B16] text-white' : 'bg-white'
                    }`}
                  >
                    JSON Bản Ghi
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="rounded p-1 hover:bg-[#DFD4BF]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {editingJsonError && (
                <div className="rounded border border-[#B8382A] bg-red-50 px-3 py-2 text-xs font-semibold text-[#B8382A]">
                  {editingJsonError}
                </div>
              )}

              {activeCollection.kind !== 'ARRAY_OF_OBJECTS' && (
                <div className="space-y-1 rounded border border-[#DDD4C2] bg-white p-3">
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-xs font-bold text-[#3C3227]">
                      Mã Khóa Chính (Object Key)
                    </label>
                    {editingRowKey !== null && (
                      <button
                        type="button"
                        onClick={() =>
                          setCascadeRenameTarget({
                            oldId: editingRowKey,
                            newId: editingMapKeyName
                          })
                        }
                        className="inline-flex items-center gap-1 rounded border border-[#B8382A] bg-[#FFF5F3] px-2 py-0.5 text-[11px] font-semibold text-[#B8382A]"
                      >
                        <KeyRound className="h-3 w-3" /> Đổi Key Đồng Bộ (CASCADE)
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editingMapKeyName}
                    onChange={(e) => setEditingMapKeyName(e.target.value)}
                    className="w-full rounded border border-[#1F1B16] bg-[#FAF6EE] px-2.5 py-1.5 font-mono text-xs"
                  />
                </div>
              )}

              {editorMode === 'FORM' && activeCollection.kind === 'STRING_DICTIONARY' && (
                <div className="space-y-1 rounded border border-[#DDD4C2] bg-white p-3">
                  <label className="block text-xs font-bold text-[#3C3227]">
                    Nội Dung Hiển Thị Tiếng Việt
                  </label>
                  <textarea
                    rows={4}
                    value={String(editingDraftValue || '')}
                    onChange={(e) => {
                      setEditingDraftValue(e.target.value);
                      setEditingRawJsonText(JSON.stringify(e.target.value, null, 2));
                    }}
                    className="w-full rounded border border-[#C8BFA8] bg-[#FAF6EE] p-2 text-xs"
                  />
                </div>
              )}

              {editorMode === 'FORM' &&
                activeCollection.kind !== 'STRING_DICTIONARY' &&
                typeof editingDraftValue === 'object' &&
                editingDraftValue !== null && (
                  <div className="space-y-2.5">
                    {Object.keys(editingDraftValue as Record<string, unknown>).map((k) =>
                      renderSmartFormField(
                        k,
                        (editingDraftValue as Record<string, unknown>)[k],
                        [k],
                        editingDraftValue as Record<string, unknown>
                      )
                    )}
                  </div>
                )}

              {editorMode === 'JSON' && (
                <textarea
                  value={editingRawJsonText}
                  onChange={(e) => {
                    setEditingRawJsonText(e.target.value);
                    setEditingJsonError(null);
                  }}
                  spellCheck={false}
                  rows={18}
                  className="w-full rounded border border-[#C8BFA8] bg-[#1E1B18] p-3 font-mono text-xs text-[#EFE7D8]"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[#C8BFA8] bg-[#EFE7D7] px-4 py-3">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded border border-[#1F1B16] bg-[#FAF6EE] px-4 py-1.5 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCommitRecordEditor}
                className="rounded bg-[#B8382A] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#9E2D20]"
              >
                Áp Dụng Vào Bảng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 2: CHẶN XÓA KHÓA NGOẠI (SQL ON DELETE RESTRICT)
         ======================================================================== */}
      {blockedDeleteReport && (
        <div className="fixed inset-0 z-[9600] flex items-center justify-center bg-black/65 p-4">
          <div className="flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-md border-2 border-[#B8382A] bg-[#FAF6EE] shadow-2xl">
            <div className="flex items-center justify-between bg-[#B8382A] px-4 py-3 text-xs font-bold text-white sm:text-sm">
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Đã Chặn Xóa — Ràng Buộc Khóa Ngoại (ON DELETE RESTRICT)
              </span>
              <button type="button" onClick={() => setBlockedDeleteReport(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4 text-xs">
              <p className="rounded border border-[#E4A199] bg-[#FDECE9] p-2.5 font-semibold text-[#7A1C12]">
                {blockedDeleteReport.block_reason_vi}
              </p>
              {blockedDeleteReport.references.map((ref, idx) => (
                <div
                  key={`${ref.source_file}-${ref.record_id}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded border border-[#D6C8B0] bg-white p-2.5"
                >
                  <div>
                    <div className="font-mono font-bold text-[#1F1B16]">
                      {ref.source_file} → [{ref.record_id}]
                    </div>
                    <div className="text-[#5C4E3E]">
                      Trường <code>{ref.field_path}</code> đang dùng <code>{ref.matched_id}</code>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => jumpToRecord(ref.source_file, ref.collection_key, ref.record_id)}
                    className="shrink-0 rounded bg-[#1F1B16] px-2.5 py-1 text-[11px] font-bold text-white"
                  >
                    Tới Gỡ Liên Kết
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 3: ĐỔI ID ĐỒNG BỘ TOÀN DỰ ÁN (ON UPDATE CASCADE)
         ======================================================================== */}
      {cascadeRenameTarget && (
        <div className="fixed inset-0 z-[9650] flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl">
            <div className="flex items-center justify-between bg-[#1F1B16] px-4 py-3 text-xs font-bold text-[#F9F5EC]">
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#F3B753]" /> Đổi Khóa Chính Đồng Bộ (ON UPDATE CASCADE)
              </span>
              <button type="button" onClick={() => setCascadeRenameTarget(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-xs">
              <p className="text-[#4A3F30]">
                Hệ thống sẽ tự động đổi mọi tham chiếu từ mã cũ sang mã mới trên toàn bộ các file JSON dữ liệu (bỏ qua file Schema).
              </p>
              <div>
                <label className="mb-1 block font-bold">Mã ID Cũ</label>
                <input
                  type="text"
                  disabled
                  value={cascadeRenameTarget.oldId}
                  className="w-full rounded border border-[#C8BFA8] bg-[#EAE1D0] px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block font-bold">Mã ID Mới (UPPER_SNAKE_CASE)</label>
                <input
                  type="text"
                  value={cascadeRenameTarget.newId}
                  onChange={(e) =>
                    setCascadeRenameTarget({ ...cascadeRenameTarget, newId: e.target.value })
                  }
                  className="w-full rounded border border-[#1F1B16] bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCascadeRenameTarget(null)}
                  className="rounded border border-[#C8BFA8] bg-white px-3 py-1.5 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCascadeRename}
                  className="rounded bg-[#B8382A] px-3 py-1.5 font-bold text-white"
                >
                  Cập Nhật Toàn Bộ CSDL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 4: SOI NƠI ĐANG THAM CHIẾU (FIND USAGES)
         ======================================================================== */}
      {usagesModalData && (
        <div className="fixed inset-0 z-[9600] flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl">
            <div className="flex items-center justify-between bg-[#1F1B16] px-4 py-3 text-xs font-bold text-[#F9F5EC]">
              <span>
                Nơi Đang Tham Chiếu Tới: <code>{usagesModalData.targetId}</code> (
                {usagesModalData.refs.length})
              </span>
              <button type="button" onClick={() => setUsagesModalData(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto p-4 text-xs">
              {usagesModalData.refs.length === 0 ? (
                <div className="py-6 text-center italic text-[#5A5043]">
                  Chưa có file JSON nào khác tham chiếu tới ID này (có thể xóa tự do).
                </div>
              ) : (
                usagesModalData.refs.map((ref, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded border border-[#D6C8B0] bg-white p-2.5"
                  >
                    <div>
                      <div className="font-mono font-bold">
                        {ref.source_file} → [{ref.record_id}]
                      </div>
                      <div className="text-[#5C4E3E]">
                        Trường <code>{ref.field_path}</code>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => jumpToRecord(ref.source_file, ref.collection_key, ref.record_id)}
                      className="rounded bg-[#1F1B16] px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      Đi Tới
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 5: TÌM KIẾM TOÀN CỤC XUYÊN TOÀN BỘ FILE JSON (CTRL + K)
         ======================================================================== */}
      {globalSearchOpen && (
        <div
          className="fixed inset-0 z-[9600] flex items-start justify-center bg-black/60 p-4 pt-16"
          onClick={() => setGlobalSearchOpen(false)}
        >
          <div
            className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[#C8BFA8] bg-white px-4 py-3">
              <Search className="h-4 w-4 text-[#B8382A]" />
              <input
                type="text"
                autoFocus
                value={globalSearchText}
                onChange={(e) => setGlobalSearchText(e.target.value)}
                placeholder="Gõ mã ID, tên địa điểm, món đồ hoặc chữ tiếng Việt để tìm xuyên toàn bộ CSDL..."
                className="flex-1 text-sm focus:outline-none"
              />
              <button type="button" onClick={() => setGlobalSearchOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto p-3 text-xs">
              {globalSearchText.trim().length < 2 ? (
                <div className="py-8 text-center text-[#6B5B47]">
                  Nhập tối thiểu 2 ký tự (VD: <code>LOC_HOSPITAL</code>, <code>ITEM_MEDICAL_REPORT</code>,{' '}
                  <code>Tủ lạnh</code>...)
                </div>
              ) : globalSearchHits.length === 0 ? (
                <div className="py-8 text-center italic text-[#6B5B47]">
                  Không tìm thấy kết quả nào trong {files.length} file JSON.
                </div>
              ) : (
                globalSearchHits.map((hit, idx) => (
                  <button
                    key={`${hit.relative_path}-${hit.record_id}-${idx}`}
                    type="button"
                    onClick={() => jumpToRecord(hit.relative_path, hit.collection_key, hit.record_id)}
                    className="flex w-full items-center justify-between gap-3 rounded border border-[#DFD4BF] bg-white px-3 py-2 text-left hover:border-[#B8382A] hover:bg-[#FFF8F6]"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-[#B8382A]">{hit.record_id}</div>
                      <div className="truncate text-[#2B241D]">{hit.snippet_vi}</div>
                    </div>
                    <span className="shrink-0 rounded bg-[#EFE7D7] px-2 py-0.5 font-mono text-[10px] text-[#5A5043]">
                      {hit.relative_path}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 6: SƠ ĐỒ TỔNG QUAN QUAN HỆ CSDL (ER OVERVIEW)
         ======================================================================== */}
      {erDiagramModalOpen && (
        <div className="fixed inset-0 z-[9550] flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl">
            <div className="flex items-center justify-between bg-[#1F1B16] px-4 py-3 text-xs font-bold text-[#F9F5EC] sm:text-sm">
              <span className="flex items-center gap-2">
                <Network className="h-4 w-4 text-[#8DC8F5]" /> Sơ Đồ Tổng Quan Bảng Khóa Chính & Quan Hệ Khóa Ngoại
              </span>
              <button type="button" onClick={() => setErDiagramModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto p-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {(
                  [
                    ['LOCATION', 'Địa điểm POI'],
                    ['SUB_NODE', 'Phòng chức năng'],
                    ['ITEM_ANY', 'Vật phẩm & Đồ dùng'],
                    ['FURNITURE', 'Nội thất trong nhà'],
                    ['DISEASE', 'Bệnh lý y khoa'],
                    ['MEDICINE', 'Thuốc OTC & Rx'],
                    ['JOB', 'Nghề nghiệp'],
                    ['VEHICLE', 'Phương tiện']
                  ] as Array<[RelationTableKey, string]>
                ).map(([tKey, title]) => (
                  <div
                    key={tKey}
                    className="rounded border border-[#C8BFA8] bg-white p-3 shadow-xs"
                  >
                    <div className="font-mono text-[11px] font-bold text-[#B8382A]">{tKey}</div>
                    <div className="mt-0.5 text-[11px] text-[#5A5043]">{title}</div>
                    <div className="mt-2 text-lg font-bold text-[#1F1B16]">
                      {relationIndex.tables[tKey].length} <span className="text-[11px] font-normal">khóa</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded border border-[#D4C6AE] bg-[#F2ECE0] p-3">
                <div className="mb-2 flex items-center gap-1.5 font-bold text-[#1F1B16]">
                  <Layers className="h-4 w-4 text-[#B8382A]" /> Chuỗi Ràng Buộc Khóa Ngoại Đang Được Bảo Vệ Tự Động:
                </div>
                <ul className="list-disc space-y-1 pl-5 text-[#3C3227]">
                  <li>
                    <code>events_*.json</code> (allowed_location_ids) <strong>→</strong> <code>LOCATION</code> &amp;{' '}
                    <code>vi_VN.json</code> (title_key / narrative_body_key)
                  </li>
                  <li>
                    <code>furniture_and_appliances.json</code> (placed_in_sub_node_id, consumes_item_id, sold_at_location_ids){' '}
                    <strong>→</strong> <code>SUB_NODE</code>, <code>ITEM_ANY</code>, <code>LOCATION</code>
                  </li>
                  <li>
                    <code>disease_catalog.json</code> (hospital_recommended_medicine_ids) <strong>→</strong>{' '}
                    <code>MEDICINE</code> (Rx bắt buộc <code>ITEM_MEDICAL_REPORT</code>)
                  </li>
                  <li>
                    <code>jobs_and_workplaces.json</code> (location_id, available_shifts) <strong>→</strong>{' '}
                    <code>LOCATION</code>, <code>SHIFT</code>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 7: SO SÁNH KHÁC BIỆT TRƯỚC KHI LƯU (DIFF PREVIEW)
         ======================================================================== */}
      {diffModalOpen && selectedFile && (
        <div className="fixed inset-0 z-[9550] flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl">
            <div className="flex items-center justify-between bg-[#1F1B16] px-4 py-3 text-xs font-bold text-[#F9F5EC]">
              <span>So Sánh Thay Đổi (Diff) — src/data/{selectedFile.relative_path}</span>
              <button type="button" onClick={() => setDiffModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-[#1E1B18] p-3 font-mono text-[11px] leading-relaxed">
              {buildLineDiffSummary(
                originalSnapshotByPath[selectedFile.relative_path],
                selectedFile.data
              ).map((line, i) => (
                <div
                  key={i}
                  className={
                    line.type === 'ADD'
                      ? 'bg-emerald-950/80 text-emerald-300'
                      : line.type === 'DEL'
                        ? 'bg-red-950/80 text-red-300'
                        : 'text-[#BDB2A1]'
                  }
                >
                  {line.type === 'ADD' ? '+ ' : line.type === 'DEL' ? '- ' : '  '}
                  {line.text}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#C8BFA8] bg-[#EFE7D7] px-4 py-2.5">
              <button
                type="button"
                onClick={() => setDiffModalOpen(false)}
                className="rounded border border-[#C8BFA8] bg-white px-3 py-1 text-xs font-semibold"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  setDiffModalOpen(false);
                  void handleSaveCurrentFile();
                }}
                className="rounded bg-[#B8382A] px-3 py-1 text-xs font-bold text-white"
              >
                Xác Nhận Lưu Xuống Đĩa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 8: SỬA HÀNG LOẠT (BATCH UPDATE)
         ======================================================================== */}
      {batchEditModalOpen && (
        <div className="fixed inset-0 z-[9550] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl">
            <div className="flex items-center justify-between bg-[#1F1B16] px-4 py-3 text-xs font-bold text-[#F9F5EC]">
              <span>Cập Nhật Hàng Loạt ({selectedRowKeys.length} dòng)</span>
              <button type="button" onClick={() => setBatchEditModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-xs">
              <div>
                <label className="mb-1 block font-bold">Tên trường cần sửa (snake_case)</label>
                <input
                  type="text"
                  value={batchFieldKey}
                  onChange={(e) => setBatchFieldKey(e.target.value)}
                  placeholder="VD: environment_filter, base_weight, usage_type"
                  className="w-full rounded border border-[#1F1B16] bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block font-bold">Giá trị mới (tự ép kiểu số / true / false)</label>
                <input
                  type="text"
                  value={batchFieldValue}
                  onChange={(e) => setBatchFieldValue(e.target.value)}
                  className="w-full rounded border border-[#1F1B16] bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBatchEditModalOpen(false)}
                  className="rounded border border-[#C8BFA8] bg-white px-3 py-1.5 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleCommitBatchUpdate}
                  className="rounded bg-[#B8382A] px-3 py-1.5 font-bold text-white"
                >
                  Áp Dụng Hàng Loạt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 9: KIỂM TOÁN KHÓA NGOẠI CHÉO TOÀN DỰ ÁN
         ======================================================================== */}
      {auditModalOpen && (
        <div className="fixed inset-0 z-[9550] flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl">
            <div className="flex items-center justify-between bg-[#1F1B16] px-4 py-3 text-xs font-bold text-[#F9F5EC] sm:text-sm">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#8DE0AF]" />
                Kiểm Toán Khóa Ngoại Sống ({errorCount} lỗi / {warningCount} cảnh báo)
              </span>
              <button type="button" onClick={() => setAuditModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4 text-xs">
              {auditIssues.length === 0 ? (
                <div className="rounded border border-emerald-600 bg-emerald-50 p-6 text-center text-emerald-900">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-700" />
                  <p className="font-bold">Toàn bộ {files.length} file JSON khớp khóa ngoại 100%!</p>
                </div>
              ) : (
                auditIssues.map((iss) => (
                  <div
                    key={iss.id}
                    className={`flex items-start justify-between gap-3 rounded border p-2.5 ${
                      iss.severity === 'ERROR'
                        ? 'border-[#B8382A] bg-red-50'
                        : 'border-amber-600 bg-amber-50'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-mono font-bold">
                        [{iss.severity}] {iss.relative_path} → {iss.record_id}
                      </div>
                      <div>{iss.message_vi}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => jumpToRecord(iss.relative_path, iss.collection_key, iss.record_id)}
                      className="shrink-0 rounded bg-[#1F1B16] px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      Đi Tới Sửa
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 10: TẠO FILE JSON MỚI
         ======================================================================== */}
      {createFileModalOpen && (
        <div className="fixed inset-0 z-[9550] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-md border-2 border-[#1F1B16] bg-[#FAF6EE] shadow-2xl">
            <div className="flex items-center justify-between bg-[#1F1B16] px-4 py-3 text-xs font-bold text-[#F9F5EC]">
              <span>Tạo File Dữ Liệu JSON Mới</span>
              <button type="button" onClick={() => setCreateFileModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-xs">
              <div>
                <label className="mb-1 block font-bold">Thư Mục Nghiệp Vụ</label>
                <select
                  value={newFileFolder}
                  onChange={(e) => setNewFileFolder(e.target.value)}
                  className="w-full rounded border border-[#1F1B16] bg-white px-2.5 py-2"
                >
                  {Object.entries(FOLDER_LABELS_VI).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-bold">Tên File JSON (snake_case)</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="VD: events_neighborhood.json"
                  className="w-full rounded border border-[#1F1B16] bg-white px-2.5 py-2 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateFileModalOpen(false)}
                  className="rounded border border-[#C8BFA8] bg-white px-3 py-1.5 font-semibold"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateNewJsonFile()}
                  className="rounded bg-[#B8382A] px-3 py-1.5 font-bold text-white"
                >
                  Khởi Tạo File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JsonDatabaseAdminPanel;