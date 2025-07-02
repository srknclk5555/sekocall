import { useState, useEffect } from 'react'
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Phone, 
  Clock,
  Download,
  Calendar,
  UserCheck
} from 'lucide-react'
import { useTabManager } from '../contexts/TabManagerContext';
import UserActivityReport from './UserActivityReport';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

interface ReportData {
  period: string
  totalCalls: number
  resolvedCalls: number
  avgCallDuration: number
  customerSatisfaction: number
}

export default function Reports() {
  const [selectedPeriod, setSelectedPeriod] = useState('week')
  const [reportData] = useState<ReportData[]>([
    {
      period: 'Bu Hafta',
      totalCalls: 156,
      resolvedCalls: 142,
      avgCallDuration: 4.2,
      customerSatisfaction: 4.6
    },
    {
      period: 'Geçen Hafta',
      totalCalls: 143,
      resolvedCalls: 128,
      avgCallDuration: 4.8,
      customerSatisfaction: 4.4
    },
    {
      period: 'Bu Ay',
      totalCalls: 642,
      resolvedCalls: 598,
      avgCallDuration: 4.5,
      customerSatisfaction: 4.5
    }
  ])

  const { openTab, setActiveTab } = useTabManager();

  const handleOpenUserActivityReport = () => {
    const tabId = '/reports/user-activity';
    openTab({
      key: tabId,
      title: 'Kullanıcı Aktivite Raporu',
      component: UserActivityReport,
    });
    setActiveTab(tabId);
  };

  const currentData = reportData[0]

  const stats = [
    {
      title: 'Toplam Çağrı',
      value: currentData.totalCalls,
      change: '+9%',
      changeType: 'positive',
      icon: Phone
    },
    {
      title: 'Çözülen Çağrı',
      value: currentData.resolvedCalls,
      change: '+11%',
      changeType: 'positive',
      icon: TrendingUp
    },
    {
      title: 'Ortalama Süre',
      value: `${currentData.avgCallDuration} dk`,
      change: '-12%',
      changeType: 'negative',
      icon: Clock
    },
    {
      title: 'Müşteri Memnuniyeti',
      value: `${currentData.customerSatisfaction}/5`,
      change: '+4%',
      changeType: 'positive',
      icon: Users
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Reports</h1>
          <p className="text-gray-600 dark:text-gray-300">Çağrı merkezi performans analizi</p>
        </div>
        <div className="flex gap-2">
          <select
            className="input-field"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="week">Bu Hafta</option>
            <option value="month">Bu Ay</option>
            <option value="quarter">Bu Çeyrek</option>
            <option value="year">Bu Yıl</option>
          </select>
          <button className="btn-secondary flex items-center">
            <Download className="h-4 w-4 mr-2" />
            İndir
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.title} className="card">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <stat.icon className="h-8 w-8 text-primary-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {stat.title}
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      {stat.value}
                    </div>
                    <div className={`ml-2 flex items-baseline text-sm font-semibold ${
                      stat.changeType === 'positive' ? 'text-green-600' :
                      stat.changeType === 'negative' ? 'text-red-600' : 'text-gray-500'
                    }`}>
                      {stat.change}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Activity Report Card */}
        <div className="card hover:shadow-lg transition-shadow cursor-pointer" onClick={handleOpenUserActivityReport}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Kullanıcı Aktivite Raporu</h3>
            <UserCheck className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Müşteri temsilcilerinin seçilen tarih aralığındaki performansını ve biletler üzerindeki tüm aktivitelerini detaylı olarak inceleyin.
            </p>
            <div className="text-right">
                <span className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  Raporu Görüntüle &rarr;
                </span>
            </div>
          </div>
        </div>

        {/* Call Volume Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Çağrı Hacmi</h3>
            <Calendar className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="space-y-4">
            {reportData.map((data) => (
              <div key={data.period} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{data.period}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{data.totalCalls} çağrı</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{data.resolvedCalls}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">çözüldü</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Performans Metrikleri</h3>
            <BarChart3 className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">Çözüm Oranı</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {Math.round((currentData.resolvedCalls / currentData.totalCalls) * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full" 
                style={{ width: `${(currentData.resolvedCalls / currentData.totalCalls) * 100}%` }}
              ></div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">Ortalama Çağrı Süresi</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{currentData.avgCallDuration} dk</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full" 
                style={{ width: `${(currentData.avgCallDuration / 10) * 100}%` }}
              ></div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">Müşteri Memnuniyeti</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{currentData.customerSatisfaction}/5</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-yellow-600 h-2 rounded-full" 
                style={{ width: `${(currentData.customerSatisfaction / 5) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Son Aktiviteler</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Yeni müşteri kaydı tamamlandı</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">2 dakika önce</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Teknik sorun çözüldü</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">15 dakika önce</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Yeni talep oluşturuldu</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">1 saat önce</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Acil çağrı alındı</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">2 saat önce</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
} 