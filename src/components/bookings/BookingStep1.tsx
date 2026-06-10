/**
 * 預約表單 - Step 1: 選擇客戶
 * 支持搜尋既有客戶和新增客戶
 */

import { useState } from 'react'
import { Search, Plus, X } from 'lucide-react'
import * as BookingAPI from '@/lib/bookings/api'
import { Client } from '@/types/booking'

interface BookingStep1Props {
  selectedClient: Client | null
  storeId: string | null
  onChange: (client: Client) => void
}

export default function BookingStep1({
  selectedClient,
  storeId,
  onChange,
}: BookingStep1Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Client[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showNewClientForm, setShowNewClientForm] = useState(false)
  const [newClientData, setNewClientData] = useState({
    name: '',
    phone: '',
    notes: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSearch = async (query: string) => {
    setSearchQuery(query)

    if (!storeId || !query.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const results = await BookingAPI.searchClients(storeId, query)
      setSearchResults(results)
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleAddNewClient = async () => {
    if (!storeId || !newClientData.name.trim()) return

    setIsSubmitting(true)
    try {
      const newClient = await BookingAPI.createClient(storeId, {
        name: newClientData.name,
        phone: newClientData.phone || undefined,
        notes: newClientData.notes || undefined,
      })

      onChange(newClient)
      setShowNewClientForm(false)
      setNewClientData({ name: '', phone: '', notes: '' })
      setSearchQuery('')
      setSearchResults([])
    } catch (err) {
      console.error('Failed to create client:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-3">
          選擇客戶 <span className="text-red-500">*</span>
        </label>

        {/* 已選客戶 */}
        {selectedClient && !showNewClientForm ? (
          <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900">{selectedClient.name}</div>
              {selectedClient.phone && (
                <div className="text-sm text-slate-600">{selectedClient.phone}</div>
              )}
            </div>
            <button
              onClick={() => {
                setSearchQuery('')
                setShowNewClientForm(false)
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <>
            {/* 搜尋框 */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="搜尋客戶（名字或電話）"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-0"
              />
            </div>

            {/* 搜尋結果 */}
            {searchQuery && (
              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {isSearching ? (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-slate-900" />
                    <span className="text-xs text-slate-600 ml-2">搜尋中...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => {
                        onChange(client)
                        setSearchQuery('')
                        setSearchResults([])
                        setShowNewClientForm(false)
                      }}
                      className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-black hover:bg-slate-50 transition-all"
                    >
                      <div className="font-medium text-slate-900">{client.name}</div>
                      {client.phone && (
                        <div className="text-xs text-slate-600">{client.phone}</div>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="text-center py-4 text-sm text-slate-600">
                    找不到符合的客戶
                  </div>
                )}
              </div>
            )}

            {/* 新增客戶按鈕 */}
            {!showNewClientForm && (
              <button
                onClick={() => setShowNewClientForm(true)}
                className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                新增客戶
              </button>
            )}
          </>
        )}
      </div>

      {/* 新增客戶表單 */}
      {showNewClientForm && (
        <div className="space-y-3 p-4 border border-slate-200 rounded-lg bg-slate-50">
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1.5">
              客戶名字 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newClientData.name}
              onChange={(e) => setNewClientData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例：林先生"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1.5">
              電話
            </label>
            <input
              type="tel"
              value={newClientData.phone}
              onChange={(e) => setNewClientData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="例：0912345678"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1.5">
              備註
            </label>
            <textarea
              value={newClientData.notes}
              onChange={(e) => setNewClientData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="例：初次來店"
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => {
                setShowNewClientForm(false)
                setNewClientData({ name: '', phone: '', notes: '' })
              }}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleAddNewClient}
              disabled={!newClientData.name.trim() || isSubmitting}
              className="px-3 py-1.5 text-xs font-medium text-white bg-black rounded hover:bg-slate-900 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? '新增中...' : '新增客戶'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
