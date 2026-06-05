import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  CalendarDays, LayoutGrid, Users, Scissors, BarChart2,
  Settings, LogOut, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'

const navItems = [
  { to: '/admin/bookings', icon: CalendarDays, label: '預約管理' },
  { to: '/admin/clients', icon: Users, label: '客戶管理' },
  { to: '/admin/services', icon: Scissors, label: '課程管理' },
  { to: '/admin/dashboard', icon: BarChart2, label: '數據總覽' },
  { to: '/admin/members', icon: Users, label: '成員管理', adminOnly: true },
  { to: '/admin/settings', icon: Settings, label: '設定', adminOnly: true },
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
    <div className="flex h-screen bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 w-60 bg-white border-r border-slate-200',
        'flex flex-col transition-transform duration-200',
        'lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">✦</span>
            </div>
            <span className="font-semibold text-slate-900 text-sm">預約管理系統</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {visibleItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-indigo-700 text-xs font-semibold">
                {profile?.full_name?.[0] ?? '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{profile?.full_name}</p>
              <p className="text-xs text-slate-500">{isAdmin ? '管理員' : '一般成員'}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="登出"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-700"
          >
            <Menu size={20} />
          </button>
          <span className="ml-3 font-semibold text-slate-900">預約管理系統</span>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
