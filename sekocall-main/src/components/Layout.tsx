import { Fragment, useState, useEffect } from 'react'
import { Menu as HeadlessMenu, Transition } from '@headlessui/react'
import { 
  Home, 
  Phone, 
  Users, 
  Ticket, 
  BarChart3, 
  Menu, 
  X, 
  LogOut,
  UserCog,
  Shield,
  Settings,
  ClipboardCheck,
  LineChart,
  KeyRound,
  Network,
  Package,
  Bell,
  Sun,
  Moon,
  MessageSquare,
  History
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { db } from '../firebase'
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore'
import { APP_MODULES } from '../config/modules'
import Scoreboard from './Scoreboard'
import { useTabManager } from '../contexts/TabManagerContext'
import TabBar from './TabBar'
import Dashboard from '../pages/Dashboard'
import Calls from '../pages/Calls'
import Customers from '../pages/Customers'
import Tickets from '../pages/Tickets'
import Reports from '../pages/Reports'
import UserManagement from '../pages/UserManagement'
import RoleManagement from '../pages/RoleManagement'
import YetkiYonetimi from '../pages/YetkiYonetimi'
import PlaceholderPage from './PlaceholderPage'
import Messages from '../pages/Messages'
import KonusmaGecmisi from '../pages/KonusmaGecmisi'
import CreateTicket from '../pages/CreateTicket'
import Tanimlamalar from '../pages/Tanimlamalar'
import UserActivityReport from '../pages/UserActivityReport'
import TimeManagement from '../pages/TimeManagement'
import VardiyaYonetimi from '../pages/VardiyaYonetimi'
import { ensureClosedTicketsGroupExists, migrateClosedTicketsToGroup } from '../utils/ticketUtils'

interface Notification {
  id: string;
  senderName: string;
  message: string;
  chatId: string;
  conversationName: string;
  read: boolean;
  createdAt: any;
}

interface GroupedNotification {
  chatId: string;
  conversationName: string;
  unreadCount: number;
  lastMessage: string;
  lastSender: string;
  lastCreatedAt: any;
  notificationIds: string[];
}

const VITE_APP_NAME = "Proje Adı"; // Geçici olarak sabit bir değer atandı

const PAGE_COMPONENTS: Record<string, { component: React.ComponentType<any>, props?: any }> = {
  '/dashboard': { component: Dashboard },
  '/calls': { component: Calls },
  '/customers': { component: Customers },
  '/tickets': { component: Tickets },
  '/reports': { component: Reports },
  '/reports/user-activity': { component: UserActivityReport },
  '/user-management': { component: UserManagement },
  '/role-management': { component: RoleManagement },
  '/permission-management': { component: YetkiYonetimi },
  '/quality-control': { component: PlaceholderPage, props: { title: 'Kalite Kontrol / Eğitim' } },
  '/detailed-reports': { component: PlaceholderPage, props: { title: 'Detaylı Rapor Analizi' } },
  '/definitions': { component: Tanimlamalar },
  '/settings': { component: PlaceholderPage, props: { title: 'Settings' } },
  '/messages': { component: Messages },
  '/conversation-history': { component: KonusmaGecmisi },
  '/create-ticket': { component: CreateTicket },
  '/time-management': { component: TimeManagement },
  '/vardiya-management': { component: VardiyaYonetimi },
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { tabs, activeTab, openTab, closeTab, setActiveTab } = useTabManager();
  const [showNotifications, setShowNotifications] = useState(false);
  const [rawNotifications, setRawNotifications] = useState<Notification[]>([])
  const [groupedNotifications, setGroupedNotifications] = useState<GroupedNotification[]>([])

  useEffect(() => {
    if (!user) return

    const q = query(
      collection(db, 'notifications'), 
      where('recipientId', '==', user.uid),
      where('read', '==', false)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification))
      setRawNotifications(notifs)

      // BİLDİRİMLERİ GRUPLAMA
      const groups: { [key: string]: GroupedNotification } = {}

      for (const notif of notifs) {
        if (!groups[notif.chatId]) {
          groups[notif.chatId] = {
            chatId: notif.chatId,
            conversationName: notif.conversationName,
            unreadCount: 0,
            lastMessage: notif.message,
            lastSender: notif.senderName,
            lastCreatedAt: notif.createdAt,
            notificationIds: []
          }
        }
        groups[notif.chatId].unreadCount += 1
        groups[notif.chatId].notificationIds.push(notif.id)
        if (groups[notif.chatId].lastCreatedAt.seconds < notif.createdAt.seconds) {
          groups[notif.chatId].lastCreatedAt = notif.createdAt
          groups[notif.chatId].lastMessage = notif.message
          groups[notif.chatId].lastSender = notif.senderName
        }
      }
      
      const getTime = (val: any) => {
        if (!val) return 0;
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        if (typeof val === 'string') return new Date(val).getTime();
        return 0;
      };
      const sortedGroupedNotifications = Object.values(groups).sort((a, b) => {
         const timeA = getTime(a.lastCreatedAt);
         const timeB = getTime(b.lastCreatedAt);
         return timeB - timeA;
      });

      setGroupedNotifications(sortedGroupedNotifications)

    }, (error) => {
      console.error("Bildirim sorgusu için Firestore dizini eksik olabilir:", error);
    });

    return () => unsubscribe()
  }, [user])

  useEffect(() => {
    if (tabs.length === 0) {
      openTab({ key: '/dashboard', title: 'Dashboard', component: Dashboard });
      setActiveTab('/dashboard');
    }
  }, [tabs, openTab, setActiveTab]);

  // YENİ: Uygulama başlatıldığında kapalı kayıtlar grubunun varlığını kontrol et
  useEffect(() => {
    const initializeClosedTicketsGroup = async () => {
      await ensureClosedTicketsGroupExists();
      // Mevcut kapalı ticket'ları da taşı (sadece bir kez çalıştır)
      await migrateClosedTicketsToGroup();
    };
    
    initializeClosedTicketsGroup();
  }, []);

  const handleNotificationClick = async (group: GroupedNotification) => {
    const deletePromises = group.notificationIds.map(notifId => {
      const notifDoc = doc(db, 'notifications', notifId);
      return deleteDoc(notifDoc);
    });
    await Promise.all(deletePromises);
    openTab({ key: `/mesajlar-chat-${group.chatId}`, title: `Mesajlar`, component: Messages, props: { selectedChatId: group.chatId } });
    setActiveTab(`/mesajlar-chat-${group.chatId}`);
    setShowNotifications(false);
  }

  const unreadCount = groupedNotifications.reduce((acc, group) => acc + group.unreadCount, 0);

  const SidebarContent = () => (
    <div className="flex flex-col flex-grow">
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700 flex-shrink-0">
        <span className="font-bold text-xl">{VITE_APP_NAME}</span>
        <button
          type="button"
          className="lg:hidden p-1 -mr-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <nav className="mt-4 px-2 space-y-1">
          {APP_MODULES.map((module) => {
            // Test için geçici olarak konuşma geçmişi herkese açık
            const hasAccess = module.id === 'konusma_gecmisi' || user?.role?.toLowerCase() === 'admin' || user?.permissions?.[module.id];
            if (!hasAccess) return null;
            const isActive = activeTab === module.path;
            return (
              <button
                key={module.name}
                className={`group flex items-center w-full px-2 py-2 text-sm font-medium rounded-md transition-colors ${isActive ? 'bg-gray-900 text-white' : 'text-gray-800 hover:bg-gray-200 hover:text-black dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'}`}
                onClick={() => {
                  const page = PAGE_COMPONENTS[module.path];
                  if (page) {
                    openTab({
                      key: module.path,
                      title: module.name,
                      component: page.component,
                      props: page.props
                    });
                    setActiveTab(module.path);
                  }
                }}
              >
                {module.name}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-shrink-0 flex border-t border-gray-700 p-4">
        <div className="flex-shrink-0 w-full group block">
          <div className="flex items-center">
            <div>
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs font-medium text-gray-400">{user?.role}</p>
            </div>
            <div className="ml-auto">
              <button onClick={logout} className="p-2 rounded-full hover:bg-gray-700">
                <LogOut className="h-5 w-5 text-gray-400"/>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100 dark:bg-gray-900">
      {/* Mobil Menü */}
      <div className={`fixed inset-0 flex z-40 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)}></div>
        <div className="relative flex-1 flex flex-col max-w-xs w-full bg-gray-800">
          <SidebarContent />
        </div>
        <div className="flex-shrink-0 w-14"></div>
      </div>

      {/* Masaüstü Menü */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <div className="flex flex-col w-56">
          <div className="flex flex-col h-0 flex-1">
            <div className="flex-1 flex flex-col overflow-y-auto">
              <SidebarContent />
            </div>
          </div>
        </div>
      </div>

      <div className="lg:pl-34 flex flex-col flex-1 min-h-0">{/*orta tablonun sol listeye yakınlık ayarı}
        {/* Üstte sadece küçük bir header (isteğe bağlı) */}
        <div className="sticky top-0 z-10 flex-shrink-0 flex h-12 bg-white dark:bg-gray-800 shadow items-center justify-end px-4">
          <button
            type="button"
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
            onClick={toggleTheme}
          >
            <span className="sr-only">Toggle theme</span>
            {theme === 'dark' ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
          </button>
          {/* Bildirim Butonu */}
          <div className="relative ml-4">
            <button
              type="button"
              className="p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              onClick={() => setShowNotifications(v => !v)}
            >
              <Bell className="h-6 w-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {unreadCount}
                </span>
              )}
            </button>
            {/* Bildirim Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 max-h-96 overflow-y-auto">
                <div className="p-3 border-b dark:border-gray-700 font-bold text-gray-800 dark:text-gray-100">Bildirimler</div>
                {groupedNotifications.length === 0 ? (
                  <div className="p-4 text-gray-500 dark:text-gray-300">Okunmamış bildirim yok.</div>
                ) : (
                  groupedNotifications.map(group => (
                    <div key={group.chatId} className="p-3 border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onClick={() => handleNotificationClick(group)}>
                      <div className="font-semibold text-blue-700 dark:text-blue-300">{group.conversationName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">{group.lastSender}: {group.lastMessage}</div>
                      <div className="text-xs text-gray-400 mt-1">{group.unreadCount} yeni mesaj</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          {/* Kullanıcı Butonu */}
          <HeadlessMenu as="div" className="ml-4 relative">
            <div>
              <HeadlessMenu.Button className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                <span className="sr-only">Kullanıcı menüsü</span>
                <UserCog className="h-6 w-6 text-gray-400" />
                <span className="ml-2 text-gray-800 dark:text-gray-200 font-medium">{user?.name}</span>
              </HeadlessMenu.Button>
            </div>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <HeadlessMenu.Items className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                <div className="py-1">
                  <HeadlessMenu.Item>
                    {({ active }) => (
                      <button
                        onClick={logout}
                        className={`w-full text-left px-4 py-2 text-sm ${active ? 'bg-gray-100 dark:bg-gray-700 text-red-600' : 'text-gray-700 dark:text-gray-200'}`}
                      >
                        <LogOut className="inline h-4 w-4 mr-2" /> Çıkış Yap
                      </button>
                    )}
                  </HeadlessMenu.Item>
                </div>
              </HeadlessMenu.Items>
            </Transition>
          </HeadlessMenu>
        </div>
        {/* Sekme barı ve içerik ana panelde */}
        <div className="flex-1 flex flex-col min-h-0 pl-2 pr-16">{}
          <TabBar
            tabs={tabs.map(tab => ({ key: tab.key, title: tab.title }))}
            activeTab={activeTab}
            onTabClick={setActiveTab}
            onTabClose={closeTab}
          />
          <div className="flex-1 overflow-auto min-h-0">
            {tabs.map(tab => (
              <div
                key={tab.key}
                style={{ display: tab.key === activeTab ? 'block' : 'none', height: '100%' }}
                className="h-full"
              >
                <tab.component {...(tab.props || {})} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
} 