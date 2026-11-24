// Bộ kiểm toán chéo dữ liệu tĩnh JSON cho Eco-Life (Dòng Đời)
// Mục đích: Tự động phát hiện lệch khóa ngoại địa điểm, sai môi trường INDOOR/OUTDOOR,
// thiếu bản dịch tiếng Việt hoặc sai phân loại đồ vật trước khi chạy game.
// Phong cách: Phẳng, tuần tự if / else, tương thích tuyệt đối TypeScript Strict & Vite.

// ============================================================================
// 1. INTERFACE ĐẦU VÀO & ĐẦU RA
// ============================================================================

export interface AuditIssue {
  severity: 'ERROR' | 'WARNING';
  source_file: string;
  record_id: string;
  message_vi: string;
}

export interface ProjectDataSnapshot {
  valid_location_ids: string[];
  valid_sub_node_ids: string[];
  valid_personality_ids: string[];
  valid_trait_ids: string[];
  vi_vn_translation_keys: Set<string>;
  events: Array<{
    source_file: string;
    event_id: string;
    environment_filter: string;
    allowed_location_ids?: string[];
    title_key: string;
    narrative_body_key: string;
    choices: Array<{
      choice_id: string;
      label_key: string;
      journal_log_entry_key?: string | null;
      required_personality?: string | null;
      required_innate_traits?: string[];
    }>;
  }>;
  jobs: Array<{
    job_id: string;
    location_id: string;
  }>;
  furniture: Array<{
    furniture_id: string;
    usage_type: string;
    placed_in_location_id: string;
    placed_in_sub_node_id: string;
  }>;
}

// ============================================================================
// 2. HÀM KIỂM TOÁN CHÉO TOÀN BỘ DỮ LIỆU TĨNH
// ============================================================================

export function auditEcoLifeDataIntegrity(snapshot: ProjectDataSnapshot): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const validEnvironments = ['INDOOR', 'OUTDOOR', 'BOTH'];

  // [1. Kiểm toán toàn bộ Sự kiện ngữ cảnh từ các file events_*.json]
  for (const evt of snapshot.events) {
    // Kiểm tra nhãn môi trường: Đảm bảo sự kiện được gắn đúng INDOOR / OUTDOOR / BOTH
    // để tránh lỗi đời thực như tai nạn giao thông ngoài trời bật lên khi nhân vật đang ngủ trong nhà.
    if (!validEnvironments.includes(evt.environment_filter)) {
      issues.push({
        severity: 'ERROR',
        source_file: evt.source_file,
        record_id: evt.event_id,
        message_vi: `Sai nhãn môi trường '${evt.environment_filter}' (bắt buộc phải là INDOOR, OUTDOOR hoặc BOTH).`
      });
    }

    // Kiểm tra danh sách địa điểm cho phép: Nếu sai location_id, sự kiện sẽ bị kẹt vĩnh viễn
    // không bao giờ kích hoạt được khi nhân vật đi lại trên bản đồ.
    if (evt.allowed_location_ids && evt.allowed_location_ids.length > 0) {
      for (const locId of evt.allowed_location_ids) {
        if (!snapshot.valid_location_ids.includes(locId)) {
          issues.push({
            severity: 'ERROR',
            source_file: evt.source_file,
            record_id: evt.event_id,
            message_vi: `Lệch khóa địa điểm: '${locId}' chưa được khai báo trong bản đồ location.json.`
          });
        }
      }
    }

    // Kiểm tra bản dịch tiêu đề sự kiện: Nếu thiếu trong vi_VN.json, người chơi sẽ bị thấy mã key thô trên Popup.
    if (!snapshot.vi_vn_translation_keys.has(evt.title_key)) {
      issues.push({
        severity: 'WARNING',
        source_file: evt.source_file,
        record_id: evt.event_id,
        message_vi: `Thiếu bản dịch tiếng Việt cho title_key: '${evt.title_key}' trong vi_VN.json.`
      });
    }

    // Kiểm tra bản dịch nội dung sự kiện: Tránh hộp thoại đếm ngược hiện chuỗi kỹ thuật khiến người chơi không kịp đọc.
    if (!snapshot.vi_vn_translation_keys.has(evt.narrative_body_key)) {
      issues.push({
        severity: 'WARNING',
        source_file: evt.source_file,
        record_id: evt.event_id,
        message_vi: `Thiếu bản dịch tiếng Việt cho narrative_body_key: '${evt.narrative_body_key}' trong vi_VN.json.`
      });
    }

    // Kiểm tra từng lựa chọn A/B/C/D bên trong sự kiện
    for (const choice of evt.choices) {
      // Kiểm tra bản dịch nút bấm lựa chọn: Đảm bảo người chơi hiểu rõ hành động sắp chọn trong 3-15 giây.
      if (!snapshot.vi_vn_translation_keys.has(choice.label_key)) {
        issues.push({
          severity: 'WARNING',
          source_file: evt.source_file,
          record_id: `${evt.event_id} -> ${choice.choice_id}`,
          message_vi: `Thiếu bản dịch nút bấm label_key: '${choice.label_key}' trong vi_VN.json.`
        });
      }

      // Kiểm tra bản dịch dòng ghi Nhật ký đời người: Tránh Cuốn Nhật Ký cuối đời in ra mã khóa thô.
      if (
        choice.journal_log_entry_key &&
        !snapshot.vi_vn_translation_keys.has(choice.journal_log_entry_key)
      ) {
        issues.push({
          severity: 'WARNING',
          source_file: evt.source_file,
          record_id: `${evt.event_id} -> ${choice.choice_id}`,
          message_vi: `Thiếu dòng ghi Cuốn Nhật Ký '${choice.journal_log_entry_key}' trong vi_VN.json.`
        });
      }

      // Kiểm tra mã tính cách mở khóa: Phải khớp chuẩn PERS_* để nhân vật đúng tính cách thấy được nhánh rẽ riêng.
      if (
        choice.required_personality &&
        !snapshot.valid_personality_ids.includes(choice.required_personality)
      ) {
        issues.push({
          severity: 'ERROR',
          source_file: evt.source_file,
          record_id: `${evt.event_id} -> ${choice.choice_id}`,
          message_vi: `Sai mã tính cách '${choice.required_personality}' (Phải dùng chuẩn PERS_*).`
        });
      }

      // Kiểm tra đặc tính bẩm sinh yêu cầu: Đảm bảo nhân vật mang đặc tính TRAIT_* có thể mở đúng lựa chọn chuyên biệt.
      if (choice.required_innate_traits && choice.required_innate_traits.length > 0) {
        for (const traitId of choice.required_innate_traits) {
          if (!snapshot.valid_trait_ids.includes(traitId)) {
            issues.push({
              severity: 'ERROR',
              source_file: evt.source_file,
              record_id: `${evt.event_id} -> ${choice.choice_id}`,
              message_vi: `Sai mã đặc tính '${traitId}' (Phải dùng chuẩn TRAIT_* hoặc đặc tính đã khai báo).`
            });
          }
        }
      }
    }
  }

  // [2. Kiểm toán địa điểm làm việc trong jobs_and_workplaces.json]
  for (const job of snapshot.jobs) {
    // Kiểm tra nơi làm việc có tồn tại trên bản đồ không: Nếu lệch mã, nhân vật sẽ không thể di chuyển tới công ty chấm công.
    if (!snapshot.valid_location_ids.includes(job.location_id)) {
      issues.push({
        severity: 'ERROR',
        source_file: 'jobs_and_workplaces.json',
        record_id: job.job_id,
        message_vi: `Nghề nghiệp trỏ tới địa điểm không tồn tại: '${job.location_id}'.`
      });
    }
  }

  // [3. Kiểm toán nội thất & gia dụng trong furniture_and_appliances.json]
  for (const furn of snapshot.furniture) {
    // Kiểm tra phân loại đồ vật: Nội thất dùng nhiều lần bắt buộc phải là DURABLE_REUSABLE để tính độ bền 0-100%,
    // tránh bị hệ thống xóa nhầm như đồ tiêu thụ CONSUMABLE sau 1 lần bấm.
    if (furn.usage_type !== 'DURABLE_REUSABLE') {
      issues.push({
        severity: 'ERROR',
        source_file: 'furniture_and_appliances.json',
        record_id: furn.furniture_id,
        message_vi: `Nội thất bắt buộc phải mang nhãn 'DURABLE_REUSABLE', hiện đang là '${furn.usage_type}'.`
      });
    }

    // Kiểm tra địa điểm đặt nội thất: Đảm bảo món đồ sau khi mua được giao về đúng địa điểm hợp lệ (thường là LOC_HOME).
    if (!snapshot.valid_location_ids.includes(furn.placed_in_location_id)) {
      issues.push({
        severity: 'ERROR',
        source_file: 'furniture_and_appliances.json',
        record_id: furn.furniture_id,
        message_vi: `Địa điểm đặt nội thất '${furn.placed_in_location_id}' chưa tồn tại trên bản đồ.`
      });
    }

    // Kiểm tra phòng đặt nội thất (sub_node_id): Nếu sai mã phòng, Frontend sẽ không thể vẽ xếp lớp visual_slot lên phòng trống.
    if (!snapshot.valid_sub_node_ids.includes(furn.placed_in_sub_node_id)) {
      issues.push({
        severity: 'ERROR',
        source_file: 'furniture_and_appliances.json',
        record_id: furn.furniture_id,
        message_vi: `Phòng đặt nội thất '${furn.placed_in_sub_node_id}' không khớp danh sách phòng trong nhà.`
      });
    }
  }

  return issues;
}