const RELEASE_TARGETS = {
  staging: {
    supabaseProjectRef: 'zklxeipqxnagcxihpzrp',
    cloudflarePagesProject: 'bookr-staging',
    branch: 'staging',
  },
  production: {
    supabaseProjectRef: 'xfdpcjpjpczqyuqzdqmr',
    cloudflarePagesProject: 'bookr',
    branch: 'main',
  },
}

const environment = process.argv[2]
const target = RELEASE_TARGETS[environment]

if (!target) {
  console.error('請指定 staging 或 production 發佈環境。')
  process.exit(1)
}

const providedSupabaseRef = process.env.BOOKR_SUPABASE_PROJECT_REF
const providedCloudflareProject = process.env.BOOKR_CLOUDFLARE_PAGES_PROJECT

if (!providedSupabaseRef || !providedCloudflareProject) {
  console.error(
    '缺少 BOOKR_SUPABASE_PROJECT_REF 或 BOOKR_CLOUDFLARE_PAGES_PROJECT，拒絕推測發佈目標。',
  )
  process.exit(1)
}

if (providedSupabaseRef !== target.supabaseProjectRef) {
  console.error(`Supabase 目標不符：${environment} 應使用 ${target.supabaseProjectRef}。`)
  process.exit(1)
}

if (providedCloudflareProject !== target.cloudflarePagesProject) {
  console.error(`Cloudflare Pages 目標不符：${environment} 應使用 ${target.cloudflarePagesProject}。`)
  process.exit(1)
}

if (environment === 'production' && process.env.BOOKR_PRODUCTION_RELEASE !== 'CONFIRMED') {
  console.error('正式站發佈需要另外設定 BOOKR_PRODUCTION_RELEASE=CONFIRMED。')
  process.exit(1)
}

console.log(JSON.stringify({ environment, ...target }, null, 2))
