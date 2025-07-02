import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, collectionGroup, orderBy, Timestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { BarChart, Calendar, User, Search, FileText } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  groupId: string;
}

interface Activity {
  id: string;
  ticketId: string;
  ticketTitle: string;
  ticketNumber?: string;
  text: string;
  createdAt: Timestamp;
  type: 'log' | 'comment' | 'system' | 'call';
  author: string;
  statusName?: string;
  categoryName?: string;
  assignedTo?: string;
  deleted?: boolean;
  isDeleted?: boolean;
  active?: boolean;
  aktif?: boolean;
  status?: string;
}

interface Group {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
}

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const FILTER_OPTIONS = [
  { key: 'search', label: 'Arama Yapılan Kayıtlar', match: (a: Activity) => a.type === 'call' || (a.type === 'system' && /arama|çağrı|call/i.test(a.text)) },
  { key: 'log', label: 'Log Yapılan Kayıtlar', match: (a: Activity) => a.type === 'log' },
  { key: 'comment', label: 'Yorum Yapılan Kayıtlar', match: (a: Activity) => a.type === 'comment' },
  { key: 'transfer', label: 'Transfer Edilen Kayıtlar', match: (a: Activity) => a.type === 'system' && /transfer|devredildi/i.test(a.text) },
  { key: 'closed', label: 'Kapatılan Kayıtlar', match: (a: Activity) => a.type === 'system' && /kapatıldı|kapalı|çözüldü|closed|resolved/i.test(a.text) },
  { key: 'groupChanged', label: 'Grubu Değiştirilen Kayıtlar', match: (a: Activity) => a.type === 'system' && /grup.*değişti|grubu.*değişti|grup değiştirildi/i.test(a.text) },
];

const UserActivityReport = () => {
  const { user } = useAuth();
  let reports: { [key: string]: boolean } = {};
  if (user?.permissions?.reports && typeof user.permissions.reports === 'object' && user.permissions.reports !== null && !Array.isArray(user.permissions.reports)) {
    reports = user.permissions.reports as { [key: string]: boolean };
  }
  const hasUserActivityReportPermission = reports.userActivityReport === true;
  if (!hasUserActivityReportPermission) {
    return <div className="text-red-500 text-center mt-10 text-lg font-semibold">Bu rapora erişim yetkiniz yok.</div>;
  }
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [endDate, setEndDate] = useState(getTodayDateString());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [callResultsMap, setCallResultsMap] = useState<Record<string, Activity[]>>({});
  const [filteredActivities, setFilteredActivities] = useState<Activity[]>([]);
  const [selectedTicketAuthor, setSelectedTicketAuthor] = useState<string | null>(null);

  // Kullanıcı ID'sini isme çeviren yardımcı fonksiyon
  const getUserName = (idOrName: string) => {
    if (!idOrName) return '-';
    if (idOrName.includes(' ')) return idOrName;
    const user = users.find(u => u.id === idOrName);
    return user ? user.name : idOrName;
  };

  useEffect(() => {
    const fetchUsersAndGroups = async () => {
      try {
        // Grupları çek
        const groupsCollection = collection(db, 'workgroups');
        const groupsSnapshot = await getDocs(groupsCollection);
        const groupsList = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
        setGroups(groupsList);

        // Kullanıcıları çek
        const usersCollection = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollection);
        const usersList = usersSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            firstName: data.firstName,
            lastName: data.lastName,
            name: `${data.firstName} ${data.lastName}`,
            groupId: data.groupId || '',
          };
        });
        setUsers(usersList);
      } catch (err) {
        console.error("Kullanıcıları veya grupları çekerken hata:", err);
        setError("Kullanıcı veya grup listesi yüklenemedi.");
      }
    };
    fetchUsersAndGroups();
  }, []);

  // Filtreleme fonksiyonu
  const applyDetailFilters = (acts: Activity[]) => {
    if (activeFilters.length === 0) return acts;
    // Eğer sadece 'search' filtresi seçiliyse, sadece type === 'call' olanları göster
    if (activeFilters.length === 1 && activeFilters[0] === 'search') {
      return acts.filter(a => a.type === 'call');
    }
    // Diğer durumlarda, mevcut mantıkla devam et
    return acts.filter(a =>
      FILTER_OPTIONS.filter(f => activeFilters.includes(f.key)).some(f => f.match(a))
    );
  };

  const handleGenerateReport = async () => {
    console.log('Rapor başlatıldı:', { selectedGroupId, selectedUserId, startDate, endDate });
    if (!selectedGroupId || !startDate || !endDate) {
      setError("Lütfen bir grup ve tarih aralığı seçin.");
      return;
    }
    setLoading(true);
    setError(null);
    setActivities([]);

    try {
      let selectedUser: typeof users[0] | undefined = undefined;
      if (selectedUserId) {
        selectedUser = users.find(u => u.id === selectedUserId);
        if (!selectedUser) {
          setError("Seçilen kullanıcı bulunamadı.");
          setLoading(false);
          return;
        }
      }

      const reportStartDate = new Date(`${startDate}T00:00:00`);
      const reportEndDate = new Date(`${endDate}T23:59:59`);
      const startTimestamp = Timestamp.fromDate(reportStartDate);
      const endTimestamp = Timestamp.fromDate(reportEndDate);

      // Helper to convert a Firestore doc to an Activity object with ticketId
      const docToActivity = (doc: any): Activity => {
        const ticketId = doc.ref.parent.parent?.id ?? 'Bilinmiyor';
        return {
          id: doc.id,
          ticketId,
          ...doc.data(),
        } as Activity;
      };

      let allActivities: Activity[] = [];
      let relatedSystemActivities: Activity[] = [];

      if (selectedUser) {
        // Sadece seçili kullanıcı için sorgu
        const directActivitiesQuery = query(
          collectionGroup(db, 'comments'),
          where('author', '==', selectedUser.name),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp)
        );
        const directSnapshot = await getDocs(directActivitiesQuery);
        allActivities = directSnapshot.docs.map(docToActivity);
      } else {
        // Kullanıcı seçilmemişse, tüm aktiviteleri çekip client-side filtrele
        const directActivitiesQuery = query(
          collectionGroup(db, 'comments'),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp)
        );
        const directSnapshot = await getDocs(directActivitiesQuery);
        // Sadece gruptaki kullanıcıların aktiviteleri
        allActivities = directSnapshot.docs.map(docToActivity).filter(a => filteredUserIds.includes(a.author));
      }

      // Sistem loglarını her durumda çek
      const systemActivitiesQuery = query(
        collectionGroup(db, 'comments'),
        where('type', '==', 'system'),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp)
      );
      const systemSnapshot = await getDocs(systemActivitiesQuery);
      relatedSystemActivities = systemSnapshot.docs
        .map(docToActivity)
        .filter(activity => {
          if (selectedUser) {
            return activity.text.includes(selectedUser.name);
          } else {
            // Gruptaki herhangi bir kullanıcı adı geçiyorsa
            return filteredUserIds.some(name => activity.text.includes(name));
          }
        });

      // İki listeyi birleştir ve aynı ID'ye sahip olanları tekilleştir
      const combinedActivities = [...allActivities, ...relatedSystemActivities];
      const uniqueActivities = Array.from(new Map(combinedActivities.map(item => [item.id, item])).values());
      
      // --- AUTHOR DÜZELTME: Sistem loglarında kullanıcıyı metinden çek ---
      const processedActivities = uniqueActivities.map(activity => {
        let author = activity.author;
        if (activity.type === 'system') {
          const match = activity.text.match(/\(Kullanıcı: ([^)]+)\)/);
          if (match && match[1]) {
            author = match[1].trim();
          }
        }
        return { ...activity, author };
      });
      // ---------------------------------------------------------------
      // Bilet başlıklarını getirmek için bilet ID'lerini topla
      const ticketIds = new Set<string>();
      processedActivities.forEach(activity => {
        if (activity.ticketId && activity.ticketId !== 'Bilinmiyor') {
            ticketIds.add(activity.ticketId);
        }
      });
      
      const ticketDetails: Record<string, { title: string, ticketNumber: string, statusName: string, categoryName: string, assignedTo?: string }> = {};
      if(ticketIds.size > 0) {
        const ticketsQuery = query(collection(db, 'tickets'), where('__name__', 'in', Array.from(ticketIds)));
        const ticketsSnapshot = await getDocs(ticketsQuery);
        ticketsSnapshot.forEach(doc => {
            const data = doc.data();
            ticketDetails[doc.id] = {
                title: data.title || 'Başlıksız Bilet',
                ticketNumber: data.ticketNumber || 'Bilinmiyor',
                statusName: data.statusName || data.status || '-',
                categoryName: data.categoryName || data.category || '-',
                assignedTo: data.assignedTo || '',
            };
        });
      }

      // --- callResults çek ---
      const callResultsByTicket: Record<string, Activity[]> = {};
      for (const ticketId of ticketIds) {
        const callResultsRef = collection(db, 'tickets', ticketId, 'callResults');
        const callResultsSnap = await getDocs(callResultsRef);
        callResultsByTicket[ticketId] = callResultsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: `callresult-${doc.id}`,
            ticketId: ticketId || '',
            ticketTitle: ticketDetails[ticketId]?.title || 'Başlıksız Bilet',
            ticketNumber: (ticketDetails[ticketId]?.ticketNumber ?? ''),
            text: `Aranan Numara: ${data.phone || '-'} | Durum: ${data.status === 'ulasildi' ? 'Ulaşıldı' : 'Ulaşılamadı'}${data.failReason ? ' | Neden: ' + data.failReason : ''}`,
            createdAt: data.createdAt || Timestamp.now(),
            type: 'call',
            author: data.user || '-',
            statusName: ticketDetails[ticketId]?.statusName || '-',
            categoryName: ticketDetails[ticketId]?.categoryName || '-',
            assignedTo: ticketDetails[ticketId]?.assignedTo || '',
          } as Activity;
        });
      }
      // ---

      // Aktiviteleri bilet bilgileriyle zenginleştir ve sırala
      let allFinalActivities: Activity[] = processedActivities.map((activity: Activity) => ({
        ...activity,
        ticketTitle: ticketDetails[activity.ticketId]?.title || 'Başlıksız Bilet',
        ticketNumber: ticketDetails[activity.ticketId]?.ticketNumber ?? '',
        statusName: ticketDetails[activity.ticketId]?.statusName || '-',
        categoryName: ticketDetails[activity.ticketId]?.categoryName || '-',
        assignedTo: ticketDetails[activity.ticketId]?.assignedTo || '',
      }));
      // callResults aktivitelerini her zaman ekle
      const callActs: Activity[] = Object.values(callResultsByTicket).flat().map((a: Activity) => ({
        ...a,
        createdAt: a.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt : Timestamp.now(),
      }));
      allFinalActivities = [...allFinalActivities, ...callActs];
      const finalActivities = allFinalActivities.sort((a: Activity, b: Activity) => b.createdAt.toMillis() - a.createdAt.toMillis());

      console.log('allActivities:', allActivities);
      console.log('relatedSystemActivities:', relatedSystemActivities);
      setActivities(finalActivities);
      console.log('finalActivities:', finalActivities);

      let filtered: Activity[] = [];
      if (activeFilters.length === 1 && activeFilters[0] === 'search') {
        if (selectedUserId) {
          // Seçili kullanıcıya ait arama hareketleri
          const selectedUser = users.find(u => u.id === selectedUserId);
          const selectedUserName = selectedUser ? selectedUser.name : '';
          filtered = finalActivities.filter((a: Activity) =>
            a.type === 'call' &&
            a.author === selectedUserName &&
            a.ticketId && a.ticketId !== 'Bilinmiyor' &&
            a.createdAt && a.createdAt.toDate() >= new Date(`${startDate}T00:00:00`) &&
            a.createdAt.toDate() <= new Date(`${endDate}T23:59:59`)
          );
        } else {
          // Gruptaki kullanıcıların arama hareketleri
          const groupUserNames = users.filter(u => u.groupId === selectedGroupId).map(u => u.name);
          filtered = finalActivities.filter((a: Activity) =>
            a.type === 'call' &&
            groupUserNames.includes(a.author) &&
            a.ticketId && a.ticketId !== 'Bilinmiyor' &&
            a.createdAt && a.createdAt.toDate() >= new Date(`${startDate}T00:00:00`) &&
            a.createdAt.toDate() <= new Date(`${endDate}T23:59:59`)
          );
        }
      } else {
        filtered = applyDetailFilters(finalActivities.filter((a: Activity) => a.ticketId && a.ticketId !== 'Bilinmiyor'));
      }
      setFilteredActivities(filtered);

    } catch (err) {
      console.error("Rapor oluşturulurken hata:", err);
      setError("Rapor oluşturulurken bir hata oluştu. Lütfen konsolu kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  const getLogTypePill = (type: string) => {
    switch (type) {
      case 'comment':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full">Yorum</span>;
      case 'log':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-full">Log</span>;
      case 'system':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-full">Sistem</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-100 rounded-full">{type}</span>;
    }
  };

  // Seçili gruba ait kullanıcılar (kullanıcı seçim kutusu için)
  const filteredUsersForSelect = selectedGroupId ? users.filter(u => u.groupId === selectedGroupId) : [];
  const filteredUserIds = filteredUsersForSelect.map(u => u.name);

  // Ticket + Kullanıcı bazında özet oluştur
  const ticketUserSummaryMap = new Map<string, {
    ticketId: string;
    ticketNumber: string;
    ticketTitle: string;
    categoryName: string;
    statusName: string;
    lastUser: string;
    assignedTo: string;
    author: string;
    authorName: string;
    count: number;
    lastActivity: Timestamp;
  }>();
  filteredActivities.forEach((activity: Activity) => {
    const key = activity.ticketId + '|' + activity.author;
    if (!ticketUserSummaryMap.has(key)) {
      ticketUserSummaryMap.set(key, {
        ticketId: String(activity.ticketId),
        ticketNumber: activity.ticketNumber || '',
        ticketTitle: activity.ticketTitle || '',
        categoryName: activity.categoryName || '-',
        statusName: activity.statusName || '-',
        lastUser: activity.assignedTo || activity.author || '-',
        assignedTo: activity.assignedTo || '-',
        author: activity.author,
        authorName: getUserName(activity.author),
        count: 0,
        lastActivity: activity.createdAt,
      });
    }
    const summary = ticketUserSummaryMap.get(key)!;
    summary.count++;
    if (activity.createdAt.toMillis() > summary.lastActivity.toMillis()) {
      summary.lastActivity = activity.createdAt;
    }
  });
  const ticketUserSummaryList = Array.from(ticketUserSummaryMap.values())
    .filter(row => row.ticketNumber && row.ticketNumber !== 'Bilinmiyor')
    .sort((a, b) => b.lastActivity.toMillis() - a.lastActivity.toMillis());

  // Seçili biletin aktiviteleri
  const selectedTicketActivities: Activity[] = selectedTicket && selectedTicketAuthor
    ? filteredActivities.filter((a: Activity) => a.ticketId === (selectedTicket || '') && a.author === selectedTicketAuthor && a.ticketId !== 'Bilinmiyor').sort((a: Activity, b: Activity) => b.createdAt.toMillis() - a.createdAt.toMillis())
    : [];

  // Export fonksiyonları
  type TicketUserSummary = typeof ticketUserSummaryList[0];
  const handleExportSummary = () => {
    const wsData = [
      [
        'Bilet No',
        'Müdahale Sahibi',
        'Son Kullanıcı',
        'Kategori',
        'Son Aktivite',
        'Müdahale Sayısı',
        'Son Durum',
      ],
      ...ticketUserSummaryList.map((row: TicketUserSummary) => [
        row.ticketNumber,
        row.authorName,
        getUserName(row.lastUser),
        row.categoryName,
        row.lastActivity.toDate().toLocaleString('tr-TR'),
        row.count,
        row.statusName,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Özet');
    XLSX.writeFile(wb, 'kullanici-aktivite-ozet.xlsx');
  };

  const handleExportDetail = () => {
    // Her bilet için aktiviteleri grupla
    const ticketMap: Record<string, typeof filteredActivities> = {};
    filteredActivities.forEach(a => {
      if (!ticketMap[a.ticketId]) ticketMap[a.ticketId] = [];
      ticketMap[a.ticketId].push(a);
    });
    const wsData = [
      [
        'Bilet No',
        'Müdahale Sahibi',
        'Kullanıcı',
        'Kategori',
        'Son Durum',
        // Sonraki hücreler: Log1, Log2, ...
      ],
      ...Object.values(ticketMap).map(acts => {
        const first = acts[0];
        const logs = acts
          .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
          .map(a => `${a.createdAt.toDate().toLocaleString('tr-TR')} [${a.type}] (${getUserName(a.author)}): ${a.text}`);
        return [
          first.ticketNumber || '',
          getUserName(first.author), // Müdahale sahibi
          getUserName(first.assignedTo || first.author),
          first.categoryName || '-',
          first.statusName || '-',
          ...logs
        ];
      })
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Başlık satırını kalın yap
    const headerLength = wsData[0].length;
    for (let i = 0; i < headerLength; i++) {
      const col = String.fromCharCode(65 + i); // A, B, C, ...
      if (ws[col + '1']) {
        ws[col + '1'].s = { font: { bold: true } };
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detay');
    XLSX.writeFile(wb, 'kullanici-aktivite-detay.xlsx');
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-800 min-h-screen text-gray-800 dark:text-gray-100">
      <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <BarChart className="mr-3 text-blue-600 dark:text-blue-400" size={32} />
            Kullanıcı Aktivite Raporu
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Belirli bir kullanıcının seçilen tarih aralığındaki bilet aktivitelerini görüntüleyin.
          </p>
        </div>
        <div className="flex gap-4 justify-end">
          <button onClick={handleExportSummary} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded shadow">
            Özet Excel Export
          </button>
          <button onClick={handleExportDetail} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded shadow">
            Detaylı Excel Export
          </button>
        </div>
      </header>

      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-md mb-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
          <div>
            <label htmlFor="group-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Grup Seçin
            </label>
            <select
              id="group-select"
              value={selectedGroupId}
              onChange={e => { setSelectedGroupId(e.target.value || ''); setSelectedUserId(''); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">-- Grup Seçin --</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label htmlFor="user-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <User className="inline-block mr-2" size={16} />
              Kullanıcı Seçin
            </label>
            <select
              id="user-select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              disabled={!selectedGroupId}
            >
              <option value="">-- Temsilci Seçin --</option>
              {filteredUsersForSelect.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Calendar className="inline-block mr-2" size={16} />
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              id="start-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Calendar className="inline-block mr-2" size={16} />
              Bitiş Tarihi
            </label>
            <input
              type="date"
              id="end-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={loading}
            className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-blue-700 disabled:bg-blue-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center justify-center"
          >
            <Search className="mr-2" size={18} />
            {loading ? 'Rapor Oluşturuluyor...' : 'Rapor Oluştur'}
          </button>
        </div>
        {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
        {/* Detaylı Filtre: Rapor Oluştur butonunun hemen altına */}
        <div className="mt-4 mb-2 flex flex-wrap gap-4 items-center">
          <span className="font-semibold">Detaylı Filtre:</span>
          {FILTER_OPTIONS.map(opt => (
            <label key={opt.key} className="flex items-center gap-1 text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={activeFilters.includes(opt.key)}
                onChange={e => {
                  setActiveFilters(f => e.target.checked ? [...f, opt.key] : f.filter(k => k !== opt.key));
                }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-center py-10">
          <div className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full text-blue-600" role="status">
            <span className="visually-hidden">Yükleniyor...</span>
          </div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Veriler yükleniyor...</p>
        </div>
      )}

      {/* Özet Tablo */}
      {!loading && !error && activities.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bilet No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Müdahale Sahibi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Son Kullanıcı</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kategori</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Son Aktivite</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Müdahale Sayısı</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Son Durum</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {ticketUserSummaryList.map(row => (
                <tr
                  key={row.ticketId + '-' + row.author}
                  className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  onClick={() => { setSelectedTicket(row.ticketId); setSelectedTicketAuthor(row.author); setShowModal(true); }}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-700 dark:text-blue-300">{row.ticketNumber}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{row.authorName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{getUserName(row.lastUser)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{row.categoryName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{row.lastActivity.toDate().toLocaleString('tr-TR')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{row.count}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{row.statusName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detay Modalı */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="fixed z-50 inset-0 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="fixed inset-0 bg-black bg-opacity-40" aria-hidden="true" />
          <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl mx-auto p-6 z-10">
            <button onClick={() => setShowModal(false)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <X size={22} />
            </button>
            <Dialog.Title className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">
              {selectedTicketActivities[0]?.ticketNumber} - {selectedTicketActivities[0]?.ticketTitle}
            </Dialog.Title>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedTicketActivities.map(activity => (
                <div key={activity.id} className="border-b border-gray-200 dark:border-gray-700 pb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{activity.createdAt.toDate().toLocaleString('tr-TR')}</span>
                    {getLogTypePill(activity.type)}
                  </div>
                  <div className="text-sm text-gray-800 dark:text-gray-100 break-words">{activity.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      {/* Boş Durum */}
      {!loading && !error && activities.length === 0 && (
         <div className="text-center py-10 bg-white dark:bg-gray-900 rounded-lg shadow-md">
            <FileText className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-200">Veri Bulunamadı</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Lütfen rapor oluşturmak için yukarıdaki filtreleri kullanın.</p>
        </div>
      )}
    </div>
  );
};

export default UserActivityReport; 