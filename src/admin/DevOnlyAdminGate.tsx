// Cổng bảo vệ trang Quản trị CSDL JSON chỉ dành cho nội bộ khi phát triển (Dev Mode).
// Khi chạy `npm run build` hoặc đóng gói Desktop PC qua Tauri (`npm run tauri build`),
// cờ tĩnh `import.meta.env.DEV` sẽ trở thành `false`, Vite/Rollup tự động cắt bỏ hoàn toàn
// mã nguồn `JsonDatabaseAdminPanel` khỏi gói sản phẩm cuối cùng.

import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';

// ============================================================================
// 1. INTERFACE ĐẦU VÀO & ĐẦU RA
// ============================================================================

export interface DevOnlyAdminGateProps {
  /** Nội dung ứng dụng game chính (tùy chọn nếu dùng dạng bọc ngoài App) */
  children?: ReactNode;
  /** Có hiển thị nút nổi mở nhanh ở góc dưới phải khi đang ở chế độ Dev hay không */
  enableFloatingButton?: boolean;
}

// Chỉ nạp lười (lazy-load) trang Admin khi thật sự mở trong chế độ Dev
const LazyJsonDatabaseAdminPanel = lazy(() => import('./JsonDatabaseAdminPanel'));

// ============================================================================
// 2. HÀM KIỂM TRA MÔI TRƯỜNG ĐÓNG GÓI DESKTOP / PRODUCTION
// ============================================================================

/**
 * Kiểm tra xem ứng dụng có đang chạy ở bản phát hành hoặc bản đóng gói Tauri Desktop thật không.
 * Nếu đúng thì bắt buộc khóa tuyệt đối trang Admin nội bộ.
 */
function isBlockedProductionOrDesktopRuntime(): boolean {
  // Kiểm tra cờ biên dịch tĩnh của Vite: nếu không phải DEV -> chặn tuyệt đối
  if (!import.meta.env.DEV) {
    return true;
  }

  // Kiểm tra thêm biến môi trường build production (phòng trường hợp cấu hình tùy biến)
  if (import.meta.env.PROD) {
    return true;
  }

  // Kiểm tra URL: Nếu không chạy trên localhost / 127.0.0.1 / tauri dev cục bộ thì không hiện Admin
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '';
    if (!isLocalHost) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// 3. COMPONENT CỔNG BẢO VỆ (GẮN 1 DÒNG VÀO App.tsx)
// ============================================================================

export default function DevOnlyAdminGate({
  children,
  enableFloatingButton = true
}: DevOnlyAdminGateProps) {
  // [Chốt chặn biên dịch]: Khi chạy `vite build` / `tauri build`, toàn bộ nhánh sau dòng này bị cắt bỏ (tree-shaken)
  if (!import.meta.env.DEV) {
    return <>{children ?? null}</>;
  }

  return (
    <DevOnlyAdminGateInner enableFloatingButton={enableFloatingButton}>
      {children}
    </DevOnlyAdminGateInner>
  );
}

function DevOnlyAdminGateInner({
  children,
  enableFloatingButton
}: {
  children?: ReactNode;
  enableFloatingButton: boolean;
}) {
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(() => {
    // Cho phép mở thẳng trang Admin bằng địa chỉ http://localhost:5173/?admin=1 khi đang dev
    if (typeof window === 'undefined') {
      return false;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === '1';
  });

  // Lắng nghe phím tắt nội bộ Ctrl + Shift + D để bật/tắt nhanh trang Admin CSDL JSON
  useEffect(() => {
    if (isBlockedProductionOrDesktopRuntime()) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setIsAdminOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Kiểm tra runtime lần cuối trước khi vẽ giao diện nội bộ
  if (isBlockedProductionOrDesktopRuntime()) {
    return <>{children ?? null}</>;
  }

  // Khi đang mở trang Admin: phủ toàn màn hình và có nút quay lại game ngay lập tức
  if (isAdminOpen) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, overflowY: 'auto', backgroundColor: '#F2ECE0' }}>
        <div
          style={{
            position: 'fixed',
            bottom: '18px',
            left: '18px',
            zIndex: 10000
          }}
        >
          <button
            type="button"
            onClick={() => setIsAdminOpen(false)}
            style={{
              padding: '9px 14px',
              backgroundColor: '#1F1B16',
              color: '#F2ECE0',
              border: '2px solid #B8382A',
              borderRadius: '6px',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
            }}
          >
            ← Quay Lại Game (Ctrl+Shift+D)
          </button>
        </div>

        <Suspense
          fallback={
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Georgia, serif' }}>
              Đang nạp Trang Quản Trị CSDL JSON nội bộ...
            </div>
          }
        >
          <LazyJsonDatabaseAdminPanel />
        </Suspense>
      </div>
    );
  }

  // Khi đang chơi game bình thường ở môi trường Dev: chỉ hiện 1 nút nổi gọn nhẹ góc dưới phải
  return (
    <>
      {children ?? null}
      {enableFloatingButton && (
        <button
          type="button"
          onClick={() => setIsAdminOpen(true)}
          title="Mở Trang Quản Trị CSDL JSON nội bộ (Tự động ẩn hoàn toàn khi Build Desktop Tauri)"
          style={{
            position: 'fixed',
            bottom: '14px',
            right: '14px',
            zIndex: 9990,
            padding: '7px 12px',
            backgroundColor: '#FAF6EE',
            color: '#B8382A',
            border: '1.5px solid #B8382A',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(31,27,22,0.18)'
          }}
        >
          ⚙ Admin JSON (Dev)
        </button>
      )}
    </>
  );
}