import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Chuyển lỗi Supabase/Postgres sang câu tiếng Việt dễ hiểu */
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e)
  if (/row-level security|permission denied/i.test(m)) return 'Bạn không có quyền làm việc này'
  if (/Invalid login credentials/i.test(m)) return 'Sai email hoặc mật khẩu'
  if (/User already registered/i.test(m)) return 'Email này đã có tài khoản, hãy đăng nhập'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Mất mạng, kiểm tra kết nối rồi thử lại'
  if (/Email not confirmed/i.test(m)) return 'Email chưa xác nhận, hãy mở thư xác nhận trong hộp thư'
  return m
}

/** Gọi Supabase và ném lỗi nếu có */
export async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data
}

/** Tài khoản đăng nhập bằng tên (không có email) được lưu dưới dạng ten@sohaisan.local */
export const LOGIN_DOMAIN = 'sohaisan.local'
export const toLoginEmail = (id: string) => {
  const v = id.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${LOGIN_DOMAIN}`
}
export const showLogin = (email: string | null | undefined) =>
  email && email.endsWith('@' + LOGIN_DOMAIN) ? email.slice(0, -LOGIN_DOMAIN.length - 1) : email || ''
