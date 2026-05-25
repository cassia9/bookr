import { BarChart2 } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2 mb-6">
        <BarChart2 size={20} className="text-indigo-600" />
        數據總覽
      </h1>
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        <BarChart2 size={48} className="mx-auto mb-3 text-slate-200" />
        <p className="font-medium">數據總覽開發中</p>
      </div>
    </div>
  )
}
