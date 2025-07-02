import { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { db } from '../firebase'
import { collection, query, where, getDocs, onSnapshot, deleteDoc, doc } from 'firebase/firestore'
import { 
  Ticket, 
  Search, 
  Filter,
  Plus,
  MoreHorizontal,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  X
} from 'lucide-react'
import Scoreboard from '../components/Scoreboard'
import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isTicketClosed, getTicketStatusColor, ensureClosedTicketsGroupExists, CLOSED_TICKETS_GROUP_ID } from '../utils/ticketUtils'

interface TicketItem {
  id: string
  title: string
  description: string
  customerName: string
  customerEmail: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'Havuzda'
  category: string
  assignedTo: string
  createdAt: string
  updatedAt: string
  groupId: string
  assignedUserId: string | null
  groupName?: string
  circuitNumber?: string
  productStatus?: string
  product_status?: string
  ticketNumber?: string
  statusName?: string
}

export default function Tickets() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [showAll, setShowAll] = useState(true)
  const [boxPosition, setBoxPosition] = useState({ x: 260, y: 40 })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [productStatusMap, setProductStatusMap] = useState<{ [circuitNumber: string]: string }>({})
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterProductStatus, setFilterProductStatus] = useState('');
  const [filterTicketStatus, setFilterTicketStatus] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [allGroups, setAllGroups] = useState<{id: string, name: string}[]>([]);

  // Ticket silme için yeni state'ler
  const [contextMenu, setContextMenu] = useState<{ show: boolean; x: number; y: number; ticketId: string | null }>({
    show: false,
    x: 0,
    y: 0,
    ticketId: null
  });
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; ticketId: string | null; ticketNumber: string | null }>({
    show: false,
    ticketId: null,
    ticketNumber: null
  });
  const [deleting, setDeleting] = useState(false);

  const { currentUser } = useAuth();

  // Admin kontrolü
  const isAdmin = useMemo(() => {
    return currentUser?.role?.toLowerCase() === 'admin';
  }, [currentUser]);

  useEffect(() => {
    const groupId = searchParams.get('groupId')
    const groupNameParam = searchParams.get('groupName')
    setCurrentGroupId(groupId)
    setGroupName(groupNameParam || '')

    if (groupId && showAll) {
      setShowAll(false)
    }

    setLoading(true)
    let q
    const ticketsCollectionRef = collection(db, 'tickets')
    
    // YENİ: Eğer "Tüm Ticketlar" görünümündeyse (showAll=true) ve kapalı kayıtlar grubu seçili değilse,
    // kapalı ticket'ları hariç tut
    if (showAll || !groupId) {
      // "Tüm Ticketlar" görünümünde kapalı ticket'ları hariç tut
      // Kapalı kayıtlar grubundaki ticket'ları filtrele
      q = query(ticketsCollectionRef, where('groupId', '!=', CLOSED_TICKETS_GROUP_ID))
    } else {
      // Belirli bir grup seçiliyse, o grubun tüm ticket'larını getir
      q = query(ticketsCollectionRef, where('groupId', '==', groupId))
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTickets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as TicketItem))
      setTickets(fetchedTickets)
      setLoading(false)
    }, (error) => {
      console.error("Ticketları çekerken hata: ", error)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [searchParams, showAll])

  // Ticketlar yüklendikten sonra, devre numarası olanlar için ürün durumlarını çek
  useEffect(() => {
    async function fetchProductStatuses() {
      // Tüm devre numaralarını topla
      const circuitNumbers = tickets.map(t => t.circuitNumber).filter(Boolean)
      if (circuitNumbers.length === 0) {
        setProductStatusMap({})
        return
      }
      // Firestore'dan topluca çek
      const q = query(collection(db, 'customer_products'), where('circuitNumber', 'in', circuitNumbers.slice(0, 10))) // Firestore 'in' max 10
      const snap = await getDocs(q)
      const map: { [circuitNumber: string]: string } = {}
      snap.docs.forEach(doc => {
        const data = doc.data()
        if (data.circuitNumber) {
          map[data.circuitNumber] = data.status || '-'
        }
      })
      setProductStatusMap(map)
    }
    fetchProductStatuses()
  }, [tickets])

  useEffect(() => {
    async function fetchGroups() {
      // Önce kapalı kayıtlar grubunun varlığını kontrol et
      await ensureClosedTicketsGroupExists();
      
      const snap = await getDocs(collection(db, 'workgroups'));
      setAllGroups(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    }
    fetchGroups();
  }, []);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'Acil'
      case 'high':
        return 'Yüksek'
      case 'medium':
        return 'Orta'
      case 'low':
        return 'Düşük'
      default:
        return 'Bilinmiyor'
    }
  }

  const getStatusColor = (status: string, statusName?: string) => {
    // Önce statusName'e göre kapalı ticket kontrolü yap
    if (statusName && isTicketClosed(statusName)) {
      return getTicketStatusColor(statusName);
    }
    
    // Eski mantık - geriye dönük uyumluluk için
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
      case 'resolved':
        return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
      case 'closed':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      case 'Havuzda':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return 'Açık'
      case 'in_progress':
        return 'İşlemde'
      case 'resolved':
        return 'Çözüldü'
      case 'closed':
        return 'Kapalı'
      case 'Havuzda':
        return 'Havuzda'
      default:
        return 'Bilinmiyor'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="h-4 w-4 text-blue-500" />
      case 'in_progress':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'closed':
        return <XCircle className="h-4 w-4 text-gray-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setDragging(true)
    const rect = e.currentTarget.getBoundingClientRect()
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
    document.body.style.userSelect = 'none'
  }

  const handleDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return
    setBoxPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    })
  }

  const handleDragEnd = () => {
    setDragging(false)
    document.body.style.userSelect = ''
  }

  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      const search = searchTerm.trim().toLowerCase();
      const matchesSearch = !search ||
        (ticket.customerName && ticket.customerName.toLowerCase().includes(search)) ||
        (ticket.circuitNumber && ticket.circuitNumber.toLowerCase().includes(search)) ||
        (ticket.ticketNumber && ticket.ticketNumber.toLowerCase().includes(search));
      const matchesGroup = !filterGroup || ticket.groupId === filterGroup;
      const prodStatus = ticket.circuitNumber ? (productStatusMap[ticket.circuitNumber] || '') : '';
      const matchesProductStatus = !filterProductStatus || prodStatus === filterProductStatus;
      const matchesTicketStatus = !filterTicketStatus || (ticket.statusName || ticket.status) === filterTicketStatus;
      let matchesDate = true;
      if (filterDateStart) {
        const ticketDate = ticket.createdAt
          ? (typeof ticket.createdAt === 'string'
              ? new Date(ticket.createdAt)
              : (typeof ticket.createdAt === 'object' && typeof (ticket.createdAt as any).toDate === 'function'
                  ? (ticket.createdAt as any).toDate()
                  : null))
          : null;
        if (ticketDate) {
          matchesDate = matchesDate && ticketDate >= new Date(filterDateStart);
        }
      }
      if (filterDateEnd) {
        const ticketDate = ticket.createdAt
          ? (typeof ticket.createdAt === 'string'
              ? new Date(ticket.createdAt)
              : (typeof ticket.createdAt === 'object' && typeof (ticket.createdAt as any).toDate === 'function'
                  ? (ticket.createdAt as any).toDate()
                  : null))
          : null;
        if (ticketDate) {
          const endDate = new Date(filterDateEnd);
          endDate.setHours(23,59,59,999);
          matchesDate = matchesDate && ticketDate <= endDate;
        }
      }
      return matchesSearch && matchesGroup && matchesProductStatus && matchesTicketStatus && matchesDate;
    });
  }, [tickets, searchTerm, filterGroup, filterProductStatus, filterTicketStatus, filterDateStart, filterDateEnd, productStatusMap]);

  // Context menu işleyicileri
  const handleContextMenu = (e: React.MouseEvent, ticketId: string, ticketNumber: string) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      ticketId
    });
  };

  const handleDeleteClick = () => {
    if (!contextMenu.ticketId) return;
    
    const ticket = tickets.find(t => t.id === contextMenu.ticketId);
    setDeleteModal({
      show: true,
      ticketId: contextMenu.ticketId,
      ticketNumber: ticket?.ticketNumber || ticket?.id || null
    });
    setContextMenu({ show: false, x: 0, y: 0, ticketId: null });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.ticketId) return;
    
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'tickets', deleteModal.ticketId));
      setDeleteModal({ show: false, ticketId: null, ticketNumber: null });
    } catch (error) {
      console.error('Ticket silinirken hata:', error);
      alert('Ticket silinirken bir hata oluştu.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModal({ show: false, ticketId: null, ticketNumber: null });
  };

  // Context menu'yu kapatmak için
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu({ show: false, x: 0, y: 0, ticketId: null });
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="flex h-full justify-start items-start gap-0">
      <div
        className="w-80 bg-gray-800 text-white p-4 rounded-l-lg overflow-y-auto ml-[-1px] cursor-move select-none"
        style={{
          position: 'absolute',
          left: boxPosition.x,
          top: boxPosition.y,
          zIndex: 20,
          minWidth: 320,
        }}
        onMouseDown={handleDragStart}
        onMouseMove={handleDrag}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <Scoreboard />
      </div>
      <div className="flex-1 ml-10 max-w-6xl p-6 bg-white dark:bg-gray-900 rounded-r-lg w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {showAll ? 'Tüm Ticketlar' : groupName ? `Havuz: ${groupName}` : 'Havuz Seçin'}
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              {showAll ? 'Sistemdeki tüm ticketlar.' : currentGroupId ? 'Bu havuza ait ticketlar.' : 'Lütfen soldaki menüden bir havuz seçin.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className={`flex items-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg ${showAll ? 'ring-2 ring-blue-500' : ''}`}
              onClick={() => {
                setShowAll(true);
                setSearchParams({});
              }}
            >
              Genel
            </button>
            <button className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
              <Plus className="h-4 w-4 mr-2" />
              Yeni Talep
            </button>
          </div>
        </div>

        {/* Arama ve Filtreler - Tablonun üstünde */}
        <div className="mb-6 w-full max-w-full overflow-x-auto">
          <div className="flex flex-col md:flex-row md:items-end md:gap-4 gap-2 min-w-[700px]">
            <div className="flex flex-col min-w-[180px] max-w-[240px]">
              <label className="text-xs font-medium mb-1">Arama (Müşteri Adı / Devre No)</label>
              <input
                type="text"
                className="p-2 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 min-w-[160px] max-w-[220px]"
                placeholder="Müşteri adı veya devre no..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-col min-w-[120px] max-w-[180px]">
              <label className="text-xs font-medium mb-1">Grup</label>
              <select
                className="p-2 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 min-w-[100px] max-w-[160px]"
                value={filterGroup}
                onChange={e => setFilterGroup(e.target.value)}
              >
                <option value="">Tümü</option>
                {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col min-w-[120px] max-w-[180px]">
              <label className="text-xs font-medium mb-1">Ürün Durumu</label>
              <select
                className="p-2 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 min-w-[100px] max-w-[140px]"
                value={filterProductStatus}
                onChange={e => setFilterProductStatus(e.target.value)}
              >
                <option value="">Tümü</option>
                <option value="Aktif">Aktif</option>
                <option value="Pasif">Pasif</option>
                <option value="İptal">İptal</option>
                <option value="Aktivasyon Beklemede">Aktivasyon Beklemede</option>
                <option value="Deaktivasyon Beklemede">Deaktivasyon Beklemede</option>
                <option value="Askıda">Askıda</option>
              </select>
            </div>
            <div className="flex flex-col min-w-[120px] max-w-[180px]">
              <label className="text-xs font-medium mb-1">Ticket Durumu</label>
              <select
                className="p-2 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 min-w-[100px] max-w-[140px]"
                value={filterTicketStatus}
                onChange={e => setFilterTicketStatus(e.target.value)}
              >
                <option value="">Tümü</option>
                <option value="open">Açık</option>
                <option value="in_progress">İşlemde</option>
                <option value="resolved">Çözüldü</option>
                <option value="closed">Kapalı</option>
                <option value="Havuzda">Havuzda</option>
              </select>
            </div>
            <div className="flex flex-col min-w-[120px] max-w-[160px]">
              <label className="text-xs font-medium mb-1">Başlangıç Tarihi</label>
              <input
                type="date"
                className="p-2 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 min-w-[100px] max-w-[130px]"
                value={filterDateStart}
                onChange={e => setFilterDateStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col min-w-[120px] max-w-[160px]">
              <label className="text-xs font-medium mb-1">Bitiş Tarihi</label>
              <input
                type="date"
                className="p-2 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 min-w-[100px] max-w-[130px]"
                value={filterDateEnd}
                onChange={e => setFilterDateEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading && <p>Yükleniyor...</p>}
        
        {!loading && !showAll && !currentGroupId && (
          <div className="text-center py-10">
            <Ticket className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              Havuz Seçilmedi
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Ticketları görmek için lütfen soldaki listeden bir havuz seçin.
            </p>
          </div>
        )}
        
        {!loading && !showAll && currentGroupId && filteredTickets.length === 0 && (
          <div className="text-center py-10">
            <Ticket className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              Bu havuzda ticket bulunmuyor.
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Bu havuzda hiç ticket yok.
            </p>
          </div>
        )}

        {!loading && showAll && filteredTickets.length === 0 && (
          <div className="text-center py-10">
            <Ticket className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              Ticket bulunmuyor.
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Sistemde hiç ticket yok.
            </p>
          </div>
        )}

        {!loading && filteredTickets.length > 0 && (
          <div className="card">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Ticket No
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Başlık
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Müşteri Adı
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Durum
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Açılış Tarihi
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Grup
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Devre No
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Ürün Durumu
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredTickets.map((ticket) => (
                  <tr 
                    key={ticket.id}
                    onContextMenu={(e) => handleContextMenu(e, ticket.id, ticket.ticketNumber || ticket.id)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      <a
                        href={`/ticket/${ticket.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                      >
                        {ticket.ticketNumber || ticket.id}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status, ticket.statusName)}`}>
                          {ticket.statusName || ticket.status || '-'}
                        </span>
                        {ticket.statusName && isTicketClosed(ticket.statusName) && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
                            KAPALI
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.createdAt
                        ? (typeof ticket.createdAt === 'string'
                            ? new Date(ticket.createdAt).toLocaleString('tr-TR')
                            : (typeof ticket.createdAt === 'object' && typeof (ticket.createdAt as any).toDate === 'function'
                                ? (ticket.createdAt as any).toDate().toLocaleString('tr-TR')
                                : '-'))
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.groupName || ticket.groupId || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.circuitNumber || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {ticket.circuitNumber ? (productStatusMap[ticket.circuitNumber] || '-') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.show && (
        <div 
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1"
          style={{ 
            left: contextMenu.x, 
            top: contextMenu.y,
            minWidth: '150px'
          }}
        >
          <button
            onClick={handleDeleteClick}
            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          >
            <Trash2 size={16} />
            Sil
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Ticket Silme Onayı
              </h3>
              <button
                onClick={handleDeleteCancel}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              <strong>Ticket No: {deleteModal.ticketNumber}</strong> numaralı ticket'ı silmek istediğinizden emin misiniz?
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mb-6">
              Bu işlem geri alınamaz!
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                disabled={deleting}
              >
                İptal
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-md flex items-center gap-2"
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Siliniyor...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Sil
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 