import { Outlet, useNavigate } from 'react-router-dom'
import {
  CalendarDays, Users, UserCheck, Scissors, BarChart2,
  Settings, LogOut, Menu, X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import SidebarNavItem from '../ui/SidebarNavItem'

const navItems = [
  { to: '/admin/bookings', icon: CalendarDays, label: '預約管理' },
  { to: '/admin/practitioners', icon: UserCheck, label: '從業人員管理' },
  { to: '/admin/clients', icon: Users, label: '客戶管理' },
  { to: '/admin/services', icon: Scissors, label: '課程管理' },
  { to: '/admin/dashboard', icon: BarChart2, label: '數據總覽' },
  { to: '/admin/settings', icon: Settings, label: '設定' },
]

export default function AdminLayout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin)

  return (
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
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">✦</span>
            </div>
            <span className="font-semibold text-text-primary text-sm">預約管理系統</span>
          </div>
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
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-text-secondary hover:text-text-primary"
          >
            <Menu size={20} />
          </button>
          <span className="ml-3 font-semibold text-text-primary">預約管理系統</span>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
