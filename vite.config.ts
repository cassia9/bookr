import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function validateBuildEnvironment(environment: Record<string, string | undefined>) {
  const supabaseUrl = environment.VITE_SUPABASE_URL?.trim()
  const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('正式建置缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，已停止產生部署檔。')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(supabaseUrl)
  } catch {
    throw new Error('VITE_SUPABASE_URL 不是有效網址，已停止產生部署檔。')
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('VITE_SUPABASE_URL 必須使用 http 或 https，已停止產生部署檔。')
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    validateBuildEnvironment({
      ...loadEnv(mode, __dirname, ''),
      ...process.env,
    })
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
