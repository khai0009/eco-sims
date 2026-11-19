/* ============================================================================
 * BỘ QUẢN LÝ RÀNG BUỘC QUAN HỆ CSDL CHO TRANG ADMIN JSON (CHỈ CHẠY DEV)
 * Nguyên tắc: Thuần vòng lặp + if / else phẳng, đọc trực tiếp từ kho JSON thật
 * ============================================================================ */

export interface JsonDbFileEntry {
  relative_path: string;
  folder_group: string;
  file_name: string;
  is_schema_file: boolean;
  data: Record<string, unknown>;
}

export type RelationTableKey =
  | 'LOCATION'
  | 'SUB_NODE'
  | 'ITEM_ANY'
  | 'DISEASE'
  | 'MEDICINE'
  | 'FURNITURE'
  | 'VEHICLE'
  | 'JOB'
  | 'PERSONALITY'
  | 'TRAIT'
  | 'WEATHER'
  | 'SHIFT'
  | 'USAGE_TYPE'
  | 'ENVIRONMENT';

export interface RelationOption {
  id: string;
  label_vi: string;
  source_file: string;
  parent_location_id?: string;
}

export interface DynamicRelationIndex {
  tables: Record<RelationTableKey, RelationOption[]>;
  primary_key_by_file: Record<string, string[]>;
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

export interface FieldForeignKeyRule {
  target_table: RelationTableKey;
  is_multi: boolean;
  filter_by_sibling_location?: boolean;
}

/* ============================================================================
 * 1. BẢNG ÁNH XẠ KHÓA NGOẠI (FIELD NAME -> BẢNG ĐÍCH TRONG CSDL JSON)
 * ============================================================================ */

export const FOREIGN_KEY_FIELD_RULES: Record<string, FieldForeignKeyRule> = {
  // Nhóm Địa điểm (Location)
  location_id: { target_table: 'LOCATION', is_multi: false },
  placed_in_location_id: { target_table: 'LOCATION', is_multi: false },
  allowed_location_ids: { target_table: 'LOCATION', is_multi: true },
  sold_at_location_ids: { target_table: 'LOCATION', is_multi: true },
  required_locations: { target_table: 'LOCATION', is_multi: true },

  // Nhóm Phòng chức năng (Sub-Node) — tự lọc theo location_id nếu có ở cùng object
  sub_node_id: {
    target_table: 'SUB_NODE',
    is_multi: false,
    filter_by_sibling_location: true,
  },
  placed_in_sub_node_id: {
    target_table: 'SUB_NODE',
    is_multi: false,
    filter_by_sibling_location: true,
  },
  allowed_sub_node_ids: {
    target_table: 'SUB_NODE',
    is_multi: true,
    filter_by_sibling_location: true,
  },
  required_sub_nodes: {
    target_table: 'SUB_NODE',
    is_multi: true,
    filter_by_sibling_location: true,
  },

  // Nhóm Vật phẩm / Thực phẩm / Đồ gia dụng
  consumes_item_id: { target_table: 'ITEM_ANY', is_multi: false },
  required_item_id: { target_table: 'ITEM_ANY', is_multi: false },
  available_item_ids: { target_table: 'ITEM_ANY', is_multi: true },
  required_item_ids: { target_table: 'ITEM_ANY', is_multi: true },
  missing_item_ids: { target_table: 'ITEM_ANY', is_multi: true },
  add_item_ids: { target_table: 'ITEM_ANY', is_multi: true },
  remove_item_ids: { target_table: 'ITEM_ANY', is_multi: true },
  prescribed_item_ids: { target_table: 'ITEM_ANY', is_multi: true },

  // Nhóm Y tế (Bệnh lý & Thuốc)
  disease_id: { target_table: 'DISEASE', is_multi: false },
  cured_disease_ids: { target_table: 'DISEASE', is_multi: true },
  target_disease_ids: { target_table: 'DISEASE', is_multi: true },
  medicine_id: { target_table: 'MEDICINE', is_multi: false },
  hospital_recommended_medicine_ids: { target_table: 'MEDICINE', is_multi: true },

  // Nhóm Nội thất, Phương tiện, Nghề nghiệp
  furniture_id: { target_table: 'FURNITURE', is_multi: false },
  vehicle_id: { target_table: 'VEHICLE', is_multi: false },
  current_job_id: { target_table: 'JOB', is_multi: false },
  job_id: { target_table: 'JOB', is_multi: false },

  // Nhóm Enum chuẩn hệ thống
  locked_personality: { target_table: 'PERSONALITY', is_multi: false },
  required_personalities: { target_table: 'PERSONALITY', is_multi: true },
  required_traits: { target_table: 'TRAIT', is_multi: true },
  innate_traits: { target_table: 'TRAIT', is_multi: true },
  required_weather: { target_table: 'WEATHER', is_multi: true },
  weather_in: { target_table: 'WEATHER', is_multi: true },
  available_shifts: { target_table: 'SHIFT', is_multi: true },
  shift_type: { target_table: 'SHIFT', is_multi: false },
  usage_type: { target_table: 'USAGE_TYPE', is_multi: false },
  environment_filter: { target_table: 'ENVIRONMENT', is_multi: false },
};

const STATIC_ENUM_OPTIONS: Record<
  'PERSONALITY' | 'TRAIT' | 'WEATHER' | 'SHIFT' | 'USAGE_TYPE' | 'ENVIRONMENT',
  RelationOption[]
> = {
  PERSONALITY: [
    { id: 'PERS_INTROVERT', label_vi: 'Hướng nội', source_file: 'enum' },
    { id: 'PERS_EXTROVERT', label_vi: 'Hướng ngoại', source_file: 'enum' },
    { id: 'PERS_DAREDEVIL', label_vi: 'Táo bạo / Mạo hiểm', source_file: 'enum' },
    { id: 'PERS_EMPATHETIC', label_vi: 'Thấu cảm / Nhân hậu', source_file: 'enum' },
    { id: 'PERS_AMBIVERT', label_vi: 'Linh hoạt (Hướng trung)', source_file: 'enum' },
  ],
  TRAIT: [
    { id: 'TRAIT_ADHD', label_vi: 'Tăng động giảm chú ý (ADHD)', source_file: 'enum' },
    { id: 'TRAIT_DYSLEXIA', label_vi: 'Chứng khó đọc (Dyslexia)', source_file: 'enum' },
    { id: 'TRAIT_ASD', label_vi: 'Phổ tự kỷ (ASD)', source_file: 'enum' },
    { id: 'TRAIT_FAST_LEARNER', label_vi: 'Học nhanh', source_file: 'enum' },
    { id: 'TRAIT_SUPERIOR_PHYSIQUE', label_vi: 'Thể chất vượt trội', source_file: 'enum' },
    { id: 'TRAIT_QUICK_REFLEXES', label_vi: 'Phản xạ nhanh', source_file: 'enum' },
  ],
  WEATHER: [
    { id: 'CLEAR', label_vi: 'Trời quang', source_file: 'enum' },
    { id: 'RAIN', label_vi: 'Mưa rào', source_file: 'enum' },
    { id: 'STORM', label_vi: 'Giông bão', source_file: 'enum' },
    { id: 'STORM_FLOOD', label_vi: 'Mưa bão ngập sâu', source_file: 'enum' },
    { id: 'HEATWAVE', label_vi: 'Nắng nóng gay gắt', source_file: 'enum' },
    { id: 'PM25_HIGH', label_vi: 'Ô nhiễm bụi mịn PM2.5 cao', source_file: 'enum' },
  ],
  SHIFT: [
    { id: 'DAY_SHIFT', label_vi: 'Ca sáng / Hành chính', source_file: 'enum' },
    { id: 'EVENING_SHIFT', label_vi: 'Ca chiều / Tối', source_file: 'enum' },
    { id: 'NIGHT_SHIFT', label_vi: 'Ca đêm (+40% lương, +3h nợ ngủ)', source_file: 'enum' },
  ],
  USAGE_TYPE: [
    { id: 'CONSUMABLE', label_vi: 'Tiêu thụ hết thì xóa (max_servings)', source_file: 'enum' },
    { id: 'DURABLE_REUSABLE', label_vi: 'Dùng bền nhiều lần (độ bền 0-100%)', source_file: 'enum' },
  ],
  ENVIRONMENT: [
    { id: 'INDOOR', label_vi: 'Trong nhà (INDOOR)', source_file: 'enum' },
    { id: 'OUTDOOR', label_vi: 'Ngoài trời (OUTDOOR)', source_file: 'enum' },
    { id: 'BOTH', label_vi: 'Cả trong nhà lẫn ngoài trời (BOTH)', source_file: 'enum' },
  ],
};

/* ============================================================================
 * 2. HÀM TIỆN ÍCH RÚT TRÍCH KHÓA CHÍNH & TÊN TIẾNG VIỆT TỪ BẢN GHI
 * ============================================================================ */

export function extractPrimaryKeyFromRecord(record: Record<string, unknown>): string | null {
  const pkCandidates = [
    'event_id',
    'location_id',
    'sub_node_id',
    'item_def_id',
    'item_id',
    'furniture_id',
    'disease_id',
    'medicine_id',
    'vehicle_id',
    'job_id',
    'debuff_id',
    'id',
  ];

  for (const key of pkCandidates) {
    const val = record[key];
    // Chỉ lấy chuỗi khác rỗng làm khóa chính định danh của bản ghi
    if (typeof val === 'string' && val.trim() !== '') {
      return val.trim();
    }
  }
  return null;
}

function resolveOptionLabelVi(
  record: Record<string, unknown>,
  viDict: Record<string, string>,
  fallbackId: string
): string {
  const labelFields = ['name_key', 'location_name_key', 'label_key', 'title_key', 'display_name'];
  for (const f of labelFields) {
    const raw = record[f];
    if (typeof raw === 'string' && raw.trim() !== '') {
      // Nếu giá trị là khóa dịch có trong vi_VN.json thì hiển thị chữ tiếng Việt đã dịch
      if (viDict[raw]) {
        return viDict[raw];
      }
      return raw;
    }
  }
  return fallbackId;
}

function pushUniqueOption(list: RelationOption[], option: RelationOption): void {
  for (const existing of list) {
    if (existing.id === option.id) {
      return;
    }
  }
  list.push(option);
}

/* ============================================================================
 * 3. XÂY DỰNG CHỈ MỤC QUAN HỆ ĐỘNG TỪ TOÀN BỘ FILE JSON ĐANG CÓ TRÊN ĐĨA
 * ============================================================================ */

export function buildDynamicRelationIndex(
  files: JsonDbFileEntry[],
  viDict: Record<string, string>
): DynamicRelationIndex {
  const tables: Record<RelationTableKey, RelationOption[]> = {
    LOCATION: [],
    SUB_NODE: [],
    ITEM_ANY: [],
    DISEASE: [],
    MEDICINE: [],
    FURNITURE: [],
    VEHICLE: [],
    JOB: [],
    PERSONALITY: [...STATIC_ENUM_OPTIONS.PERSONALITY],
    TRAIT: [...STATIC_ENUM_OPTIONS.TRAIT],
    WEATHER: [...STATIC_ENUM_OPTIONS.WEATHER],
    SHIFT: [...STATIC_ENUM_OPTIONS.SHIFT],
    USAGE_TYPE: [...STATIC_ENUM_OPTIONS.USAGE_TYPE],
    ENVIRONMENT: [...STATIC_ENUM_OPTIONS.ENVIRONMENT],
  };

  const primaryKeyByFile: Record<string, string[]> = {};

  for (const file of files) {
    // Bỏ qua file schema và từ điển dịch khi xây chỉ mục khóa chính nghiệp vụ
    if (file.is_schema_file || file.folder_group === 'localization') {
      continue;
    }

    const filePks: string[] = [];

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
        const pk = extractPrimaryKeyFromRecord(row);
        if (pk) {
          filePks.push(pk);
        }

        // [Nhóm 1]: Địa điểm & các phòng chức năng (sub_nodes) lồng bên trong location.json
        if (typeof row.location_id === 'string' && file.folder_group === 'location') {
          const locId = row.location_id.trim();
          pushUniqueOption(tables.LOCATION, {
            id: locId,
            label_vi: resolveOptionLabelVi(row, viDict, locId),
            source_file: file.relative_path,
          });

          if (Array.isArray(row.sub_nodes)) {
            for (const rawNode of row.sub_nodes) {
              if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) {
                continue;
              }
              const nodeObj = rawNode as Record<string, unknown>;
              if (typeof nodeObj.sub_node_id === 'string' && nodeObj.sub_node_id.trim() !== '') {
                const snId = nodeObj.sub_node_id.trim();
                filePks.push(snId);
                pushUniqueOption(tables.SUB_NODE, {
                  id: snId,
                  label_vi: resolveOptionLabelVi(nodeObj, viDict, snId),
                  source_file: file.relative_path,
                  parent_location_id: locId,
                });
              }
            }
          }
        }

        // [Nhóm 2]: Vật phẩm, thực phẩm, quần áo, nội thất đều có thể dùng làm khóa ngoại vật phẩm
        const itemId =
          typeof row.item_def_id === 'string'
            ? row.item_def_id.trim()
            : typeof row.item_id === 'string'
              ? row.item_id.trim()
              : '';
        if (itemId !== '') {
          const opt: RelationOption = {
            id: itemId,
            label_vi: resolveOptionLabelVi(row, viDict, itemId),
            source_file: file.relative_path,
          };
          pushUniqueOption(tables.ITEM_ANY, opt);

          // Nếu nằm trong thư mục furniture/ thì đưa thêm vào bảng nội thất riêng
          if (file.folder_group === 'furniture') {
            pushUniqueOption(tables.FURNITURE, opt);
          }
        }

        // [Nhóm 3]: Bệnh lý trong hospital_clinic/
        if (typeof row.disease_id === 'string' && row.disease_id.trim() !== '') {
          const dId = row.disease_id.trim();
          pushUniqueOption(tables.DISEASE, {
            id: dId,
            label_vi: resolveOptionLabelVi(row, viDict, dId),
            source_file: file.relative_path,
          });
        }

        // [Nhóm 4]: Thuốc điều trị OTC & Rx
        if (typeof row.medicine_id === 'string' && row.medicine_id.trim() !== '') {
          const mId = row.medicine_id.trim();
          pushUniqueOption(tables.MEDICINE, {
            id: mId,
            label_vi: resolveOptionLabelVi(row, viDict, mId),
            source_file: file.relative_path,
          });
        }

        // [Nhóm 5]: Phương tiện đi lại
        if (typeof row.vehicle_id === 'string' && row.vehicle_id.trim() !== '') {
          const vId = row.vehicle_id.trim();
          pushUniqueOption(tables.VEHICLE, {
            id: vId,
            label_vi: resolveOptionLabelVi(row, viDict, vId),
            source_file: file.relative_path,
          });
        }

        // [Nhóm 6]: Nghề nghiệp
        if (typeof row.job_id === 'string' && row.job_id.trim() !== '') {
          const jId = row.job_id.trim();
          pushUniqueOption(tables.JOB, {
            id: jId,
            label_vi: resolveOptionLabelVi(row, viDict, jId),
            source_file: file.relative_path,
          });
        }
      }
    }

    primaryKeyByFile[file.relative_path] = filePks;
  }

  return { tables, primary_key_by_file: primaryKeyByFile };
}

/* ============================================================================
 * 4. LẤY DANH SÁCH LỰA CHỌN CHO MỘT TRƯỜNG KHÓA NGOẠI (CÓ LỌC THEO ĐỊA ĐIỂM CHA)
 * ============================================================================ */

export function getForeignKeyOptionsForField(
  fieldName: string,
  index: DynamicRelationIndex,
  parentObject?: Record<string, unknown>
): RelationOption[] | null {
  const rule = FOREIGN_KEY_FIELD_RULES[fieldName];
  if (!rule) {
    return null;
  }

  const allOptions = index.tables[rule.target_table] || [];

  // Nếu là trường sub_node và cùng bản ghi có khai báo location_id thì lọc phòng thuộc đúng địa điểm đó
  if (rule.filter_by_sibling_location && parentObject) {
    const siblingLoc =
      typeof parentObject.location_id === 'string'
        ? parentObject.location_id
        : typeof parentObject.placed_in_location_id === 'string'
          ? parentObject.placed_in_location_id
          : '';

    if (siblingLoc !== '') {
      const filtered = allOptions.filter(
        (opt) => !opt.parent_location_id || opt.parent_location_id === siblingLoc
      );
      if (filtered.length > 0) {
        return filtered;
      }
    }
  }

  return allOptions;
}

/* ============================================================================
 * 5. QUÉT THAM CHIẾU NGƯỢC (CHẶN XÓA NHẦM KIỂU SQL ON DELETE RESTRICT)
 * ============================================================================ */

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
        field_path: currentPath,
        matched_id: value,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanValueForTargetIds(
        value[i],
        targetIdSet,
        `${currentPath}[${i}]`,
        meta,
        outMatches
      );
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

export function checkRecordDeleteGuard(
  files: JsonDbFileEntry[],
  ownerFilePath: string,
  ownerCollectionKey: string,
  ownerRowIndex: number,
  record: Record<string, unknown>
): DeleteGuardResult {
  const pk = extractPrimaryKeyFromRecord(record);

  // Bản ghi không có mã định danh khóa chính thì không thể bị bảng khác tham chiếu -> cho phép xóa
  if (!pk) {
    return { can_delete: true, block_reason_vi: '', references: [] };
  }

  const targetIds = new Set<string>([pk]);

  // Nếu là bản ghi Địa điểm có chứa phòng con (sub_nodes), gom luôn mã các phòng con để kiểm tra
  if (Array.isArray(record.sub_nodes)) {
    for (const rawNode of record.sub_nodes) {
      if (rawNode && typeof rawNode === 'object' && !Array.isArray(rawNode)) {
        const snId = (rawNode as Record<string, unknown>).sub_node_id;
        if (typeof snId === 'string' && snId.trim() !== '') {
          targetIds.add(snId.trim());
        }
      }
    }
  }

  const matches: IncomingReferenceMatch[] = [];

  for (const file of files) {
    // Không tính file schema định nghĩa mẫu là tham chiếu dữ liệu thật
    if (file.is_schema_file) {
      continue;
    }

    for (const colKey of Object.keys(file.data)) {
      const arr = file.data[colKey];
      if (!Array.isArray(arr)) {
        continue;
      }

      for (let i = 0; i < arr.length; i++) {
        // Bỏ qua chính bản ghi đang định xóa để không tự chặn chính mình
        if (
          file.relative_path === ownerFilePath &&
          colKey === ownerCollectionKey &&
          i === ownerRowIndex
        ) {
          continue;
        }

        const rawRow = arr[i];
        if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
          continue;
        }
        const rowObj = rawRow as Record<string, unknown>;
        const rowId = extractPrimaryKeyFromRecord(rowObj) || `ROW_${i + 1}`;

        scanValueForTargetIds(
          rowObj,
          targetIds,
          '',
          { source_file: file.relative_path, collection_key: colKey, record_id: rowId },
          matches
        );
      }
    }
  }

  // [Chốt chặn SQL ON DELETE RESTRICT]: Có ít nhất 1 nơi đang dùng ID này -> khóa xóa để tránh hỏng dữ liệu game
  if (matches.length > 0) {
    return {
      can_delete: false,
      block_reason_vi: `Không thể xóa "${pk}" vì đang được ${matches.length} vị trí khác tham chiếu khóa ngoại. Hãy gỡ liên kết trước.`,
      references: matches,
    };
  }

  return { can_delete: true, block_reason_vi: '', references: [] };
}

export function checkFileDeleteGuard(
  files: JsonDbFileEntry[],
  targetFile: JsonDbFileEntry,
  index: DynamicRelationIndex
): DeleteGuardResult {
  // [Chốt bảo vệ 1]: Cấm tuyệt đối việc xóa file định nghĩa cấu trúc chuẩn (*_schema.json)
  if (targetFile.is_schema_file) {
    return {
      can_delete: false,
      block_reason_vi: 'Không được phép xóa file cấu trúc chuẩn (*_schema.json).',
      references: [],
    };
  }

  // [Chốt bảo vệ 2]: Không cho xóa từ điển chính vi_VN.json khi đang dùng hiển thị toàn game
  if (targetFile.relative_path.endsWith('vi_VN.json')) {
    return {
      can_delete: false,
      block_reason_vi: 'Không thể xóa từ điển hiển thị chính localization/vi_VN.json.',
      references: [],
    };
  }

  const pksInFile = index.primary_key_by_file[targetFile.relative_path] || [];
  if (pksInFile.length === 0) {
    return { can_delete: true, block_reason_vi: '', references: [] };
  }

  const targetIds = new Set<string>(pksInFile);
  const matches: IncomingReferenceMatch[] = [];

  for (const otherFile of files) {
    if (otherFile.is_schema_file || otherFile.relative_path === targetFile.relative_path) {
      continue;
    }

    for (const colKey of Object.keys(otherFile.data)) {
      const arr = otherFile.data[colKey];
      if (!Array.isArray(arr)) {
        continue;
      }

      for (let i = 0; i < arr.length; i++) {
        const rawRow = arr[i];
        if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
          continue;
        }
        const rowObj = rawRow as Record<string, unknown>;
        const rowId = extractPrimaryKeyFromRecord(rowObj) || `ROW_${i + 1}`;

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

  // Nếu có file khác đang trỏ khóa ngoại vào bất kỳ ID nào nằm trong file này -> chặn xóa file
  if (matches.length > 0) {
    return {
      can_delete: false,
      block_reason_vi: `Không thể xóa file "${targetFile.file_name}" vì còn ${matches.length} tham chiếu từ các file JSON khác.`,
      references: matches,
    };
  }

  return { can_delete: true, block_reason_vi: '', references: [] };
}