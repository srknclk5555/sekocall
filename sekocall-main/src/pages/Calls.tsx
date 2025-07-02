import { useState } from 'react'
import { 
  Phone, 
  PhoneCall, 
  PhoneOff, 
  Search, 
  Filter,
  Plus,
  MoreHorizontal
} from 'lucide-react'

interface Call {
  id: string
  customerName: string
  phoneNumber: string
  duration: string
  status: 'completed' | 'missed' | 'ongoing' | 'scheduled'
  type: 'incoming' | 'outgoing'
  agent: string
  date: string
  notes?: string
}

export default function Calls() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [calls] = useState<Call[]>([
    {
      id: '1',
      customerName: 'Ahmet Yılmaz',
      phoneNumber: '+90 555 123 4567',
      duration: '5:32',
      status: 'completed',
      type: 'incoming',
      agent: 'Mehmet Demir',
      date: '2024-01-15 14:30',
      notes: 'İnternet hızı sorunu çözüldü'
    },
    {
      id: '2',
      customerName: 'Fatma Demir',
      phoneNumber: '+90 555 987 6543',
      duration: '3:15',
      status: 'completed',
      type: 'outgoing',
      agent: 'Ayşe Kaya',
      date: '2024-01-15 13:45'
    },
    {
      id: '3',
      customerName: 'Mehmet Kaya',
      phoneNumber: '+90 555 456 7890',
      duration: '0:00',
      status: 'missed',
      type: 'incoming',
      agent: '-',
      date: '2024-01-15 12:20'
    },
    {
      id: '4',
      customerName: 'Ayşe Özkan',
      phoneNumber: '+90 555 789 0123',
      duration: '8:45',
      status: 'ongoing',
      type: 'incoming',
      agent: 'Ali Yıldız',
      date: '2024-01-15 15:10'
    },
    {
      id: '5',
      customerName: 'Hasan Yıldırım',
      phoneNumber: '+90 555 321 6540',
      duration: '0:00',
      status: 'scheduled',
      type: 'outgoing',
      agent: 'Zeynep Demir',
      date: '2024-01-16 10:00'
    }
  ])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
      case 'missed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
      case 'ongoing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Tamamlandı'
      case 'missed':
        return 'Cevapsız'
      case 'ongoing':
        return 'Devam ediyor'
      case 'scheduled':
        return 'Planlandı'
      default:
        return 'Bilinmiyor'
    }
  }

  const getTypeIcon = (type: string) => {
    return type === 'incoming' ? 
      <PhoneCall className="h-4 w-4 text-green-500" /> : 
      <PhoneOff className="h-4 w-4 text-blue-500" />
  }

  const filteredCalls = calls.filter(call => {
    const matchesSearch = call.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         call.phoneNumber.includes(searchTerm)
    const matchesStatus = statusFilter === 'all' || call.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Çağrılar</h1>
          <p className="text-gray-600 dark:text-gray-300">Tüm çağrı kayıtları ve yönetimi</p>
        </div>
        <button className="btn-primary flex items-center">
          <Plus className="h-4 w-4 mr-2" />
          Yeni Çağrı
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Müşteri adı veya telefon ara..."
                className="input-field pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              className="input-field"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Tüm Durumlar</option>
              <option value="completed">Tamamlandı</option>
              <option value="missed">Cevapsız</option>
              <option value="ongoing">Devam ediyor</option>
              <option value="scheduled">Planlandı</option>
            </select>
            <button className="btn-secondary flex items-center">
              <Filter className="h-4 w-4 mr-2" />
              Filtrele
            </button>
          </div>
        </div>
      </div>

      {/* Calls Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Müşteri
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Telefon
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tip
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Süre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Durum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Temsilci
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tarih
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredCalls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {call.customerName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {call.phoneNumber}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getTypeIcon(call.type)}
                      <span className="ml-2 text-sm text-gray-900 dark:text-gray-200">
                        {call.type === 'incoming' ? 'Gelen' : 'Giden'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-200">
                      {call.duration}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(call.status)}`}>
                      {getStatusText(call.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-200">
                      {call.agent}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {call.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
} 