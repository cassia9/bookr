import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarDays, Users, UserCheck, Scissors, BarChart2,
  Settings, LogOut, X, Gift, House, MoreHorizontal,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import SidebarNavItem from '../ui/SidebarNavItem'
import BookrLogo from '../ui/BookrLogo'
import {
  NotificationBell,
  NotificationCenterProvider,
  NotificationCenterSurface,
} from '../notifications/NotificationCenter'

const navItems = [
  { to: '/admin/today', icon: House, label: '今日工作台' },
  { to: '/admin/bookings', icon: CalendarDays, label: '預約管理' },
  { to: '/admin/practitioners', icon: UserCheck, label: '老師管理' },
  { to: '/admin/clients', icon: Users, label: '客戶管理' },
  { to: '/admin/services', icon: Scissors, label: '課程管理' },
  { to: '/admin/vouchers', icon: Gift, label: '商品券' },
  { to: '/admin/dashboard', icon: BarChart2, label: '數據總覽' },
  { to: '/admin/settings', icon: Settings, label: '設定' },
]

const mobilePrimaryItems = [
  { to: '/admin/today', icon: House, label: '今日' },
  { to: '/admin/bookings', icon: CalendarDays, label: '預約' },
  { to: '/admin/clients', icon: Users, label: '客戶' },
]

export default function AdminLayout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function handleOpenBooking(bookingId: string) {
    navigate(`/admin/bookings?booking=${encodeURIComponent(bookingId)}`)
  }

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin)
  const isMoreActive = !mobilePrimaryItems.some(({ to }) => (
    location.pathname === to || location.pathname.startsWith(`${to}/`)
  ))

  return (
    <NotificationCenterProvider
      userId={profile?.id ?? null}
      storeId={profile?.store_id ?? null}
      onOpenBooking={handleOpenBooking}
    >
      <div className="flex h-screen bg-white">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-slate-100',
        'flex flex-col transition-transform duration-200',
        'lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center shrink-0">
              <BookrLogo size={22} />
            </div>
            <span className="font-bold text-text-primary text-base tracking-tight">Bookr</span>
          </div>
          <NotificationBell className="ml-auto hidden lg:block" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-text-secondary hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5">
          {visibleItems.map(({ to, icon, label }) => (
            <SidebarNavItem
              key={to}
              to={to}
              icon={icon}
              label={label}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-slate-200">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-8 h-8 bg-accent-lightest rounded-full flex items-center justify-center shrink-0">
              <span className="text-accent text-xs font-semibold">
                {profile?.full_name?.[0] ?? '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{profile?.full_name}</p>
              <p className="text-xs text-text-secondary">{isAdmin ? '管理員' : '一般成員'}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="登出"
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="h-16 bg-white border-b border-border flex items-center px-4 lg:hidden">
          <span className="font-bold text-text-primary tracking-tight">Bookr</span>
          <NotificationBell className="ml-auto" />
        </header>

        <main className="flex-1 overflow-auto bg-slate-50 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">
          <Outlet />
        </main>
      </div>
      <NotificationCenterSurface />

      <nav
        aria-label="手機主要導覽"
        className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(4.25rem+env(safe-area-inset-bottom))] grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur lg:hidden"
      >
        {mobilePrimaryItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn(
              'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition-colors',
              isActive ? 'text-violet-600' : 'text-slate-400 active:text-slate-700',
            )}
          >
            {({ isActive }) => (
              <>
                <span className={cn(
                  'absolute top-1.5 h-0.5 w-5 rounded-full bg-violet-600 transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0',
                )} />
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-expanded={sidebarOpen}
          aria-label="更多功能"
          className={cn(
            'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition-colors',
            sidebarOpen || isMoreActive ? 'text-violet-600' : 'text-slate-400 active:text-slate-700',
          )}
        >
          <span className={cn(
            'absolute top-1.5 h-0.5 w-5 rounded-full bg-violet-600 transition-opacity',
            sidebarOpen || isMoreActive ? 'opacity-100' : 'opacity-0',
          )} />
          <MoreHorizontal size={20} strokeWidth={sidebarOpen || isMoreActive ? 2.25 : 1.75} />
          <span>更多</span>
        </button>
      </nav>
      </div>
    </NotificationCenterProvider>
  )
}
