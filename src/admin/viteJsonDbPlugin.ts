// Plugin Vite cục bộ biến thư mục src/data/**/*.json thành một CSDL có thể Đọc/Thêm/Sửa/Xóa trực tiếp khi chạy `npm run dev`.
// Không cần cài thêm thư viện ngoài (chỉ dùng fs và path có sẵn của Node.js).
// Cách gắn vào vite.config.ts:
//   import { ecoLifeJsonDbAdminPlugin } from './src/admin/viteJsonDbPlugin';
//   export default defineConfig({ plugins: [react(), ecoLifeJsonDbAdminPlugin()] });

import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

// ============================================================================
// 1. INTERFACE ĐẦU VÀO & ĐẦU RA CỦA API CỤC BỘ
// ============================================================================

export interface JsonDbFileEntry {
  relative_path: string; // VD: "event/events_calendar_and_seasons.json"
  folder_group: string; // VD: "event" hoặc "root"
  file_name: string;
  is_schema_file: boolean;
  line_count: number;
  data: Record<string, unknown>;
}

interface SaveJsonRequestBody {
  relative_path: string;
  data: Record<string, unknown>;
}

interface CreateJsonRequestBody {
  folder_group: string;
  file_name: string;
  initial_data: Record<string, unknown>;
}

interface DeleteJsonRequestBody {
  relative_path: string;
}

// ============================================================================
// 2. HÀM TIỆN ÍCH ĐỌC/GHI AN TOÀN TRONG PHẠM VI THƯ MỤC src/data
// ============================================================================

/**
 * Đọc toàn bộ thân request JSON từ trình duyệt gửi lên Vite Dev Server.
 */
function readRequestJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    req.on('data', (chunk: Buffer) => {
      rawBody = rawBody + chunk.toString('utf-8');
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(rawBody || '{}') as T;
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', (err) => reject(err));
  });
}

/**
 * Trả về phản hồi JSON chuẩn cho giao diện Admin.
 */
function sendJsonResponse(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/**
 * Quét phẳng toàn bộ các file .json nằm trong src/data/ (tối đa 2 tầng thư mục).
 */
function scanAllJsonFilesInDataDir(dataRootDir: string): JsonDbFileEntry[] {
  const results: JsonDbFileEntry[] = [];

  if (!fs.existsSync(dataRootDir)) {
    return results;
  }

  const rootEntries = fs.readdirSync(dataRootDir, { withFileTypes: true });

  for (const entry of rootEntries) {
    const fullEntryPath = path.join(dataRootDir, entry.name);

    // Trường hợp 1: File JSON nằm trực tiếp ở thư mục gốc src/data/
    if (entry.isFile() && entry.name.endsWith('.json')) {
      try {
        const rawText = fs.readFileSync(fullEntryPath, 'utf-8');
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        results.push({
          relative_path: entry.name,
          folder_group: 'root',
          file_name: entry.name,
          is_schema_file: entry.name.endsWith('_schema.json'),
          line_count: rawText.split('\n').length,
          data: parsed
        });
      } catch {
        // Bỏ qua file JSON lỗi cú pháp để không làm sập toàn bộ trình quản trị
      }
    } else if (entry.isDirectory()) {
      // Trường hợp 2: Thư mục con nghiệp vụ (character/, event/, location/, ...)
      const subEntries = fs.readdirSync(fullEntryPath, { withFileTypes: true });
      for (const subEntry of subEntries) {
        if (subEntry.isFile() && subEntry.name.endsWith('.json')) {
          const subFullPath = path.join(fullEntryPath, subEntry.name);
          const relPath = `${entry.name}/${subEntry.name}`;
          try {
            const rawText = fs.readFileSync(subFullPath, 'utf-8');
            const parsed = JSON.parse(rawText) as Record<string, unknown>;
            results.push({
              relative_path: relPath,
              folder_group: entry.name,
              file_name: subEntry.name,
              is_schema_file: subEntry.name.endsWith('_schema.json'),
              line_count: rawText.split('\n').length,
              data: parsed
            });
          } catch {
            // Bỏ qua file lỗi cú pháp
          }
        }
      }
    }
  }

  // Sắp xếp theo thư mục rồi theo tên file để khớp thứ tự VSCodium
  results.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  return results;
}

/**
 * Kiểm tra an toàn đường dẫn: Chặn tuyệt đối mọi thao tác ghi/xóa ra ngoài thư mục src/data.
 */
function resolveSafeDataFilePath(dataRootDir: string, relativePath: string): string | null {
  const normalizedRel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedRel.endsWith('.json') || normalizedRel.includes('..')) {
    return null;
  }

  const resolvedTarget = path.resolve(dataRootDir, normalizedRel);
  const resolvedRoot = path.resolve(dataRootDir);

  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    return null;
  }

  return resolvedTarget;
}

// ============================================================================
// 3. PLUGIN VITE CHÍNH (CHỈ CHẠY TRONG MÔI TRƯỜNG DEV)
// ============================================================================

export function ecoLifeJsonDbAdminPlugin(): Plugin {
  return {
    name: 'eco-life-json-db-admin-plugin',
    // Chốt chặn của Vite: `apply: 'serve'` đảm bảo plugin KHÔNG BAO GIỜ chạy khi `vite build` hoặc `tauri build`
    apply: 'serve',
    configureServer(server) {
      // Chốt chặn bổ sung: Nếu môi trường đang ép NODE_ENV=production thì từ chối kích hoạt API đọc/ghi đĩa
      if (process.env.NODE_ENV === 'production') {
        return;
      }

      const dataRootDir = path.resolve(process.cwd(), 'src/data');

      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || '').split('?')[0];

        // Chỉ xử lý các đường dẫn bắt đầu bằng /__admin_db/
        if (!urlPath.startsWith('/__admin_db/')) {
          next();
          return;
        }

        try {
          // [API 1: Lấy danh sách và nội dung toàn bộ file JSON trong src/data/]
          if (req.method === 'GET' && urlPath === '/__admin_db/files') {
            const files = scanAllJsonFilesInDataDir(dataRootDir);
            sendJsonResponse(res, 200, {
              ok: true,
              mode: 'VITE_DISK_LIVE',
              data_dir: 'src/data',
              files
            });
            return;
          }

          // [API 2: Lưu đè nội dung JSON đã chỉnh sửa trực tiếp xuống ổ cứng]
          if (req.method === 'POST' && urlPath === '/__admin_db/save') {
            const body = await readRequestJsonBody<SaveJsonRequestBody>(req);
            const safePath = resolveSafeDataFilePath(dataRootDir, body.relative_path || '');

            if (!safePath) {
              sendJsonResponse(res, 400, {
                ok: false,
                message_vi: 'Đường dẫn file không hợp lệ hoặc nằm ngoài thư mục src/data/.'
              });
              return;
            }

            const formattedJson = `${JSON.stringify(body.data, null, 2)}\n`;
            fs.writeFileSync(safePath, formattedJson, 'utf-8');

            sendJsonResponse(res, 200, {
              ok: true,
              message_vi: `Đã ghi thành công xuống src/data/${body.relative_path}`,
              line_count: formattedJson.split('\n').length
            });
            return;
          }

          // [API 3: Tạo file JSON nghiệp vụ mới trong một thư mục con của src/data/]
          if (req.method === 'POST' && urlPath === '/__admin_db/create') {
            const body = await readRequestJsonBody<CreateJsonRequestBody>(req);
            const cleanFolder = (body.folder_group || '').replace(/[^a-zA-Z0-9_-]/g, '');
            let cleanFileName = (body.file_name || '').replace(/[^a-zA-Z0-9_.-]/g, '');
            if (!cleanFileName.endsWith('.json')) {
              cleanFileName = `${cleanFileName}.json`;
            }

            const relPath =
              cleanFolder && cleanFolder !== 'root'
                ? `${cleanFolder}/${cleanFileName}`
                : cleanFileName;
            const safePath = resolveSafeDataFilePath(dataRootDir, relPath);

            if (!safePath) {
              sendJsonResponse(res, 400, {
                ok: false,
                message_vi: 'Tên thư mục hoặc tên file không hợp lệ.'
              });
              return;
            }

            if (fs.existsSync(safePath)) {
              sendJsonResponse(res, 409, {
                ok: false,
                message_vi: `File src/data/${relPath} đã tồn tại, không thể tạo trùng.`
              });
              return;
            }

            // Tự động tạo thư mục con nếu chưa có
            const parentDir = path.dirname(safePath);
            if (!fs.existsSync(parentDir)) {
              fs.mkdirSync(parentDir, { recursive: true });
            }

            const formattedJson = `${JSON.stringify(body.initial_data || {}, null, 2)}\n`;
            fs.writeFileSync(safePath, formattedJson, 'utf-8');

            sendJsonResponse(res, 200, {
              ok: true,
              relative_path: relPath,
              message_vi: `Đã tạo mới file src/data/${relPath}.`
            });
            return;
          }

          // [API 4: Xóa một file JSON dữ liệu (Cấm xóa các file *_schema.json)]
          if (req.method === 'POST' && urlPath === '/__admin_db/delete') {
            const body = await readRequestJsonBody<DeleteJsonRequestBody>(req);
            const relPath = body.relative_path || '';

            if (relPath.endsWith('_schema.json')) {
              sendJsonResponse(res, 403, {
                ok: false,
                message_vi: 'Không được phép xóa file cấu trúc chuẩn (*_schema.json) từ trang Admin.'
              });
              return;
            }

            const safePath = resolveSafeDataFilePath(dataRootDir, relPath);
            if (!safePath || !fs.existsSync(safePath)) {
              sendJsonResponse(res, 404, {
                ok: false,
                message_vi: 'Không tìm thấy file cần xóa.'
              });
              return;
            }

            fs.unlinkSync(safePath);
            sendJsonResponse(res, 200, {
              ok: true,
              message_vi: `Đã xóa file src/data/${relPath}.`
            });
            return;
          }

          sendJsonResponse(res, 404, { ok: false, message_vi: 'Không tìm thấy endpoint Admin DB.' });
        } catch (err) {
          sendJsonResponse(res, 500, {
            ok: false,
            message_vi: `Lỗi xử lý file trên đĩa: ${err instanceof Error ? err.message : String(err)}`
          });
        }
      });
    }
  };
}