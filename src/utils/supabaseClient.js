import { createClient } from '@supabase/supabase-js';

// Cấu hình đọc từ biến môi trường (xem .env.example). Anon key là khóa public nhưng
// không hardcode trong source để gitleaks không báo và dễ đổi môi trường.
// `import.meta.env` chỉ có khi chạy qua Vite; test chạy bằng Node thì không có.
const env = import.meta.env ?? {};
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Bản build production thiếu cấu hình phải lỗi rõ ràng thay vì chạy với giá trị giả.
  if (env.PROD) {
    throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY khi build. Khai báo trong biến môi trường build.');
  }
  console.warn('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (xem .env.example). Dùng giá trị giả, mọi request Supabase sẽ lỗi.');
}

export const supabase = createClient(
  SUPABASE_URL || 'http://localhost.invalid',
  SUPABASE_ANON_KEY || 'missing-anon-key',
);
