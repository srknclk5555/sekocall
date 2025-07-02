import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Home, 
  Phone, 
  Users, 
  Ticket, 
  BarChart3, 
  UserCog,
  Shield,
  Settings,
  ClipboardCheck,
  LineChart,
  KeyRound,
  Network,
  Package
} from 'lucide-react';

const modules = [
  { name: 'Gelen Çağrılar', href: '/calls', icon: Phone, description: 'Bekleyen çağrıları ve geçmiş kayıtları görüntüleyin.' },
  { name: 'Müşteri Bilgileri', href: '/customers', icon: Users, description: 'Müşteri profillerini yönetin ve güncelleyin.' },
  { name: 'Raporlar', href: '/reports', icon: BarChart3, description: 'Çağrı merkezi performans raporlarını inceleyin.' },
  { name: 'Kullanıcı Yönetimi', href: '/user-management', icon: UserCog, description: 'Kullanıcıları ve rollerini yönetin.' },
  { name: 'Rol Yönetimi', href: '/role-management', icon: Shield, description: 'Sistemdeki rolleri tanımlayın.' },
  { name: 'Ayarlar', href: '/settings', icon: Settings, description: 'Sistem genel ayarlarını yapılandırın.' },
  { name: 'Kalite Kontrol / Eğitim', href: '/quality-control', icon: ClipboardCheck, description: 'Görüşmeleri dinleyin ve geri bildirim verin.' },
  { name: 'Detaylı Rapor Analizi', href: '/detailed-reports', icon: LineChart, description: 'Gelişmiş KPI ve trend analizleri yapın.' },
  { name: 'Yetki Yönetimi', href: '/permissions', icon: KeyRound, description: 'Kullanıcı ve rol yetkilerini yönetin.' },
  { name: 'Grup Yönetimi', href: '/group-management', icon: Network, description: 'Kayıt istasyonlarını (gruplarını) yönetin.' },
  { name: 'Ticketlar', href: '/tickets', icon: Ticket, description: 'Müşteri ticketlarını oluşturun ve takip edin.' },
  { name: 'Ürün Tasarım Modülü', href: '/product-design', icon: Package, description: 'İnternet paketleri ve diğer ürünleri tasarlayın.' },
];

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Çağrı Merkezi Yönetim Paneli</h1>
        <p className="text-gray-600 mt-2 dark:text-gray-300">Hoş geldiniz, {user?.name}! (Rolünüz: {user?.role.toUpperCase()})</p>
        <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Kullanıcı Kimliği: {user?.id}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {modules.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            className="card flex flex-col justify-between p-6 bg-blue-50 hover:bg-blue-100 dark:bg-gray-800 hover:dark:bg-gray-700/50 hover:shadow-lg transition-all duration-300 rounded-xl border border-blue-200 dark:border-gray-700"
          >
            <div>
              <div className="flex items-center gap-4">
                <item.icon className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300">{item.name}</h3>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
} 