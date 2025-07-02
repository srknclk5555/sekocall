import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp, query, orderBy, onSnapshot, limit, startAfter } from 'firebase/firestore';
import { ArrowLeft, Edit, Paperclip, Save, Tag, User, X, GitBranch, ChevronsUpDown, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isTicketClosed, CLOSED_TICKETS_GROUP_ID, CLOSED_TICKETS_GROUP_NAME, ensureClosedTicketsGroupExists } from '../utils/ticketUtils';

// Bu arayüzleri projenizin yapısına göre daha merkezi bir yerden import edebilirsiniz.
interface Ticket {
  id: string;
  title: string;
  description: string;
  customerName: string;
  customerEmail: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  statusId?: string;
  statusName?: string;
  category?: string;
  categoryId?: string;
  categoryName?: string;
  assignedTo: string;
  createdAt: any;
  updatedAt: any;
  ticketNumber: string;
  circuitNumber?: string;
  groupName?: string;
  creatorName?: string;
  phone1?: string;
  altPhone?: string;
  assignedUserId?: string;
}

interface TicketStatus {
  id: string;
  name: string;
}

interface Comment {
  id: string;
  author: string;
  text: string;
  createdAt: any;
  type: 'log' | 'comment' | 'system';
}

interface Group {
  id: string;
  name: string;
}

// Sistem logu eklemek için yardımcı fonksiyon
type SystemLogEvent = {
  event: string;
  details?: string;
  relatedUser?: string;
  oldValue?: string;
  newValue?: string;
};

// Yardımcı: log metnini quote ve normal metin olarak ayırıp render eden fonksiyon
function renderLogText(text: string) {
  const lines = text.split('\n');
  const blocks: { type: 'quote' | 'normal', content: string[] }[] = [];
  let current: { type: 'quote' | 'normal', content: string[] } | null = null;
  lines.forEach(line => {
    if (line.startsWith('>')) {
      if (!current || current.type !== 'quote') {
        if (current) blocks.push(current);
        current = { type: 'quote', content: [] };
      }
      current.content.push(line.replace(/^> ?/, ''));
    } else {
      if (!current || current.type !== 'normal') {
        if (current) blocks.push(current);
        current = { type: 'normal', content: [] };
      }
      current.content.push(line);
    }
  });
  if (current) blocks.push(current);
  return (
    <div>
      {blocks.map((block, i) =>
        block.type === 'quote' ? (
          <div key={i} className="mb-2 p-2 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 rounded">
            <span className="italic whitespace-pre-line">{block.content.join('\n')}</span>
          </div>
        ) : (
          <div key={i} className="whitespace-pre-line">{block.content.join('\n')}</div>
        )
      )}
    </div>
  );
}

const TicketDetail: React.FC = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { currentUser } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [categoryName, setCategoryName] = useState<string>('');
  const [statusDisplayName, setStatusDisplayName] = useState<string>('');
  const [availableStatuses, setAvailableStatuses] = useState<TicketStatus[]>([]);
  const [selectedStatusId, setSelectedStatusId] = useState<string>('');
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [commentType, setCommentType] = useState<'log' | 'comment'>('log');
  const [submitting, setSubmitting] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logs, setLogs] = useState<Comment[]>([]);
  const [logsLastDoc, setLogsLastDoc] = useState<any>(null);
  const [logsTotal, setLogsTotal] = useState(0);
  const LOGS_PER_PAGE = 10;
  const [logFilterType, setLogFilterType] = useState<'all' | 'user' | 'system'>('all');
  const [quotedLog, setQuotedLog] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'log' | 'comment' | 'callresult'>('log');
  const [callResults, setCallResults] = useState<any[]>([]);
  const [callPhone, setCallPhone] = useState(ticket?.phone1 || ticket?.altPhone || '');
  const [callStatus, setCallStatus] = useState<'ulasildi' | 'ulasilamadi'>('ulasildi');
  const [failReason, setFailReason] = useState('');
  const failReasons = ['Cevapsız', 'Meşgul', 'Kapalı', 'Engelli'];

  const handleTakeOwnership = async () => {
    if (!ticketId || !currentUser) return;
    
    // YENİ: Kapalı ticket kontrolü
    if (ticket && isTicketClosed(ticket.statusName || ticket.status)) {
      alert("Bu ticket kapalı durumda olduğu için üzerine alınamaz. Sadece görüntüleyebilirsiniz.");
      return;
    }
    
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      await updateDoc(ticketRef, {
        assignedTo: currentUser.name,
        assignedUserId: currentUser.uid,
      });
      // Lokal state'i de güncelle
      setTicket(prev => prev ? { ...prev, assignedTo: currentUser.name, assignedUserId: currentUser.uid } : null);
      // Sistem logu ekle
      await handleSystemLog({
        event: 'Ticket üzerine alındı',
        details: `${currentUser.name} ticketı üzerine aldı`,
        relatedUser: currentUser.name
      });
    } catch (error) {
      console.error("Ticket üzerine alınırken hata:", error);
      alert("Ticket sahiplenilirken bir hata oluştu.");
    }
  };

  const handleStatusUpdate = async () => {
    if (!selectedStatusId || !ticketId || !ticket) {
      alert("Lütfen bir durum seçin veya sayfanın yüklenmesini bekleyin.");
      return;
    }
    const selectedStatus = availableStatuses.find(s => s.id === selectedStatusId);
    if (!selectedStatus) return;

    // YENİ: Kapalı ticket kontrolü - sadece sahibi durum değiştirebilir
    if (isTicketClosed(ticket.statusName || ticket.status)) {
      alert("Bu ticket kapalı durumda olduğu için durumu değiştirilemez.");
      return;
    }

    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      
      // YENİ: Eğer seçilen durum kapalı ise, otomatik olarak kapalı kayıtlar grubuna transfer et
      const isNewStatusClosed = isTicketClosed(selectedStatus.name);
      const updateData: any = {
        statusId: selectedStatus.id,
        statusName: selectedStatus.name,
        status: ['resolved', 'closed', 'Çözüldü', 'Kapalı'].includes(selectedStatus.name) ? selectedStatus.name.toLowerCase() : ticket.status
      };

      if (isNewStatusClosed) {
        // Kapalı kayıtlar grubunun varlığını kontrol et ve gerekirse oluştur
        await ensureClosedTicketsGroupExists();
        
        // Kapalı duruma geçiyorsa, kapalı kayıtlar grubuna transfer et
        updateData.groupId = CLOSED_TICKETS_GROUP_ID;
        updateData.groupName = CLOSED_TICKETS_GROUP_NAME;
        // Atanan kişiyi de temizle
        updateData.assignedTo = '';
        updateData.assignedUserId = null;
      }

      await updateDoc(ticketRef, updateData);
      
      // Lokal state'i güncelle
      setTicket(prev => prev ? { 
        ...prev, 
        statusId: selectedStatus.id, 
        statusName: selectedStatus.name,
        ...(isNewStatusClosed && {
          groupId: CLOSED_TICKETS_GROUP_ID,
          groupName: CLOSED_TICKETS_GROUP_NAME,
          assignedTo: '',
          assignedUserId: undefined
        })
      } : null);
      
      setStatusDisplayName(selectedStatus.name);
      setIsStatusModalOpen(false);
      
      // Sistem logu: Durum değişikliği
      let logEvent = `Ticket durumu '${selectedStatus.name}' olarak değiştirildi`;
      let logDetails = `Yeni durum: ${selectedStatus.name}`;
      
      if (isNewStatusClosed) {
        logEvent = `Ticket kapalı duruma geçirildi ve '${CLOSED_TICKETS_GROUP_NAME}' grubuna transfer edildi`;
        logDetails = `Yeni durum: ${selectedStatus.name} | Yeni grup: ${CLOSED_TICKETS_GROUP_NAME}`;
      }
      
      await handleSystemLog({
        event: logEvent,
        details: logDetails,
        relatedUser: currentUser?.name
      });
    } catch (error) {
      console.error("Durum güncellenirken hata:", error);
      alert("Durum güncellenirken bir hata oluştu.");
    }
  };

  const handleGroupTransfer = async () => {
    if (!selectedGroupId || !ticketId) {
      alert("Lütfen bir grup seçin.");
      return;
    }
    const selectedGroup = availableGroups.find(g => g.id === selectedGroupId);
    if (!selectedGroup) return;

    // YENİ: Kapalı ticket kontrolü
    if (ticket && isTicketClosed(ticket.statusName || ticket.status)) {
      alert("Bu ticket kapalı durumda olduğu için transfer edilemez.");
      return;
    }

    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const oldGroup = ticket?.groupName || 'Bilinmiyor';
      
      await updateDoc(ticketRef, {
        groupId: selectedGroup.id,
        groupName: selectedGroup.name,
        assignedTo: '', // Grup değişince atama temizleniyor
        assignedUserId: null,
      });

      // Sistem logu ekle
      await handleSystemLog({
        event: 'Ticket başka gruba transfer edildi',
        details: `Ticket, '${oldGroup}' grubundan '${selectedGroup.name}' grubuna transfer edildi.`,
        relatedUser: currentUser?.name
      });

      // Lokal state'i de güncelle
      setTicket(prev => prev ? {
        ...prev,
        groupId: selectedGroup.id,
        groupName: selectedGroup.name,
        assignedTo: '',
        assignedUserId: undefined
      } : null);
      setIsTransferModalOpen(false);
    } catch (error) {
      console.error("Grup transferi sırasında hata:", error);
      alert("Ticket transfer edilirken bir hata oluştu.");
    }
  };

  // Öncelik/Kategori değişikliği için örnek stub fonksiyonlar (gerçek değişiklik fonksiyonunuza entegre edin)
  const handlePriorityChange = async (newPriority: string) => {
    if (!ticketId) return;
    // ... Firestore update işlemi ...
    await handleSystemLog({
      event: `Ticket önceliği '${newPriority}' olarak değiştirildi`,
      details: `Yeni öncelik: ${newPriority}`
    });
  };
  const handleCategoryChange = async (newCategory: string) => {
    if (!ticketId) return;
    // ... Firestore update işlemi ...
    await handleSystemLog({
      event: `Ticket kategorisi '${newCategory}' olarak değiştirildi`,
      details: `Yeni kategori: ${newCategory}`
    });
  };

  // Diğer sistem logu gerektiren işlemler için stub fonksiyonlar:
  const handleFileAdded = async (fileName: string) => {
    await handleSystemLog({
      event: `Ticket'a sistem tarafından dosya eklendi`,
      details: `Eklenen dosya: ${fileName}`
    });
  };
  const handleNotificationSent = async (type: string) => {
    await handleSystemLog({
      event: `Ticket sahibi kullanıcıya ${type} bildirimi gönderildi`,
      details: `Bildirim tipi: ${type}`
    });
  };
  const handleAutoClose = async () => {
    await handleSystemLog({
      event: `Ticket SLA süresi dolduğu için otomatik olarak kapatıldı`,
    });
  };
  const handleSystemNote = async (note: string) => {
    await handleSystemLog({
      event: `Ticket ile ilgili sistemsel açıklama eklendi`,
      details: note
    });
  };
  const handleExternalUpdate = async (source: string) => {
    await handleSystemLog({
      event: `Ticket bilgileri dış sistemden güncellendi`,
      details: `Kaynak: ${source}`
    });
  };

  // Yorum/Logları Firestore'dan çek
  useEffect(() => {
    if (!ticketId) return;
    const commentsRef = collection(db, 'tickets', ticketId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      setComments(items);
    });
    return () => unsubscribe();
  }, [ticketId]);

  // Logları sayfalı çek
  useEffect(() => {
    if (!ticketId || commentType !== 'log') return;
    const fetchLogs = async () => {
      const commentsRef = collection(db, 'tickets', ticketId, 'comments');
      let q = query(commentsRef, orderBy('createdAt', 'desc'), limit(LOGS_PER_PAGE));
      if (logPage > 1 && logsLastDoc) {
        q = query(commentsRef, orderBy('createdAt', 'desc'), startAfter(logsLastDoc), limit(LOGS_PER_PAGE));
      }
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      setLogs(items);
      setLogsLastDoc(snapshot.docs[snapshot.docs.length - 1]);
    };
    fetchLogs();
  }, [ticketId, logPage, commentType]);

  // Log toplamını çek
  useEffect(() => {
    if (!ticketId || commentType !== 'log') return;
    const commentsRef = collection(db, 'tickets', ticketId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));
    getDocs(q).then(snapshot => {
      setLogsTotal(snapshot.docs.filter(doc => doc.data().type === 'log').length);
    });
  }, [ticketId, commentType, newComment]);

  // Arama Sonucu Firestore'dan çek
  useEffect(() => {
    if (!ticketId) return;
    const ref = collection(db, 'tickets', ticketId, 'callResults');
    const unsub = onSnapshot(ref, (snap) => {
      setCallResults(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [ticketId]);

  // Yorum/Log ekle
  const handleAddComment = async () => {
    if (!ticketId || !currentUser || !newComment.trim()) return;
    
    // YENİ: Kapalı ticket kontrolü
    if (ticket && isTicketClosed(ticket.statusName || ticket.status)) {
      alert("Bu ticket kapalı durumda olduğu için yorum veya log eklenemez.");
      return;
    }
    
    setSubmitting(true);
    try {
      const commentsRef = collection(db, 'tickets', ticketId, 'comments');
      await addDoc(commentsRef, {
        author: currentUser.name,
        authorId: currentUser.uid,
        text: (quotedLog ? `> ${quotedLog.replace(/\n/g, '\n> ')}\n\n` : '') + newComment.trim(),
        type: commentType,
        createdAt: serverTimestamp(),
      });
      setNewComment("");
      setQuotedLog(null);
      window.location.reload();
    } catch (error) {
      alert('Yorum/log eklenirken hata oluştu.');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  // Arama Sonucu ekleme fonksiyonu
  const handleAddCallResult = async () => {
    if (!ticketId || !callPhone) return;
    await addDoc(collection(db, 'tickets', ticketId, 'callResults'), {
      phone: callPhone,
      status: callStatus,
      failReason: callStatus === 'ulasilamadi' ? failReason : '',
      createdAt: serverTimestamp(),
      user: currentUser?.name || '',
    });
    setCallPhone(ticket?.phone1 || ticket?.altPhone || '');
    setCallStatus('ulasildi');
    setFailReason('');
  };

  // Sistem logu eklemek için yardımcı fonksiyon
  const handleSystemLog = async (event: SystemLogEvent) => {
    if (!ticketId) return;
    const commentsRef = collection(db, 'tickets', ticketId, 'comments');
    let text = `[SİSTEM] ${event.event}`;
    if (event.details) text += `: ${event.details}`;
    if (event.relatedUser) text += ` (Kullanıcı: ${event.relatedUser})`;
    if (event.oldValue || event.newValue) text += ` [${event.oldValue || ''} → ${event.newValue || ''}]`;
    await addDoc(commentsRef, {
      author: 'SİSTEM',
      authorId: 'system',
      text,
      type: 'system',
      createdAt: serverTimestamp(),
    });
    window.location.reload();
  };

  useEffect(() => {
    const fetchTicketAndRelatedData = async () => {
      if (!ticketId) return;
      setLoading(true);
      try {
        // Durumları Çek
        const statusSnap = await getDocs(collection(db, 'ticket_statuses'));
        const statuses = statusSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TicketStatus));
        setAvailableStatuses(statuses);

        // Grupları Çek
        const groupSnap = await getDocs(collection(db, 'workgroups'));
        const groups = groupSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
        setAvailableGroups(groups);

        // Ticket'ı Çek
        const ticketRef = doc(db, 'tickets', ticketId);
        const ticketSnap = await getDoc(ticketRef);
        if (ticketSnap.exists()) {
          const ticketData = ticketSnap.data() as Omit<Ticket, 'id'>;
          setTicket({ id: ticketSnap.id, ...ticketData });
          
          // Kategori adını belirle
          if (ticketData.categoryName) {
            setCategoryName(ticketData.categoryName);
          } else if (ticketData.category) {
            setCategoryName(ticketData.category);
          } else if (ticketData.categoryId) {
            // Firestore'dan kategori adını çek
            const catRef = doc(db, 'ticket_categories', ticketData.categoryId);
            const catSnap = await getDoc(catRef);
            if (catSnap.exists()) {
              setCategoryName(catSnap.data().name || '');
            } else {
              setCategoryName('');
            }
          } else {
            setCategoryName('');
          }

          // YENİ: Durum adını belirle
          if (ticketData.statusName) {
            setStatusDisplayName(ticketData.statusName);
          } else if (ticketData.statusId) {
            const statusRef = doc(db, 'ticket_statuses', ticketData.statusId);
            const statusSnap = await getDoc(statusRef);
            if (statusSnap.exists()) {
              setStatusDisplayName(statusSnap.data().name || ticketData.status);
            } else {
              setStatusDisplayName(ticketData.status);
            }
          } else {
            setStatusDisplayName(ticketData.status);
          }

          // Kayıt açılış tarihi için sistem logu ekle (sadece ilk açılışta eklenmeli, tekrar tekrar eklenmemeli)
          const commentsRef = collection(db, 'tickets', ticketId, 'comments');
          const commentsSnap = await getDocs(commentsRef);
          const hasOpenLog = commentsSnap.docs.some(doc => doc.data().type === 'system' && String(doc.data().text).includes('Ticket açıldı'));
          if (!hasOpenLog && ticketData.createdAt) {
            await handleSystemLog({
              event: 'Ticket açıldı',
              details: `Kayıt açılış tarihi: ${ticketData.createdAt.toDate ? new Date(ticketData.createdAt.toDate()).toLocaleString() : ''}`
            });
          }
        } else {
          console.error("Ticket bulunamadı!");
        }
      } catch (error) {
        console.error("Veri çekerken hata:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTicketAndRelatedData();
  }, [ticketId]);

  if (loading) {
    return <div className="p-6">Ticket bilgileri yükleniyor...</div>;
  }

  if (!ticket) {
    return <div className="p-6">Ticket bulunamadı.</div>;
  }

  // YENİ: Ticket sahibi kontrolü
  const isOwner = currentUser?.uid === ticket.assignedUserId;
  
  // YENİ: Kapalı ticket kontrolü
  const isClosed = isTicketClosed(ticket.statusName || ticket.status);

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <button 
            onClick={() => window.history.back()} 
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
          >
            <ArrowLeft size={18} />
            Geri Dön
          </button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Ticket #{ticket.ticketNumber}</span>
            {isClosed && (
              <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                KAPALI TICKET
              </span>
            )}
            <button
              onClick={() => setIsTransferModalOpen(true)}
              disabled={!isOwner || isClosed}
              className="p-2 rounded-md bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={16} />
              Transfer
            </button>
            <button
              onClick={() => setIsStatusModalOpen(true)}
              disabled={!isOwner || isClosed}
              className="p-2 rounded-md bg-yellow-500 text-white hover:bg-yellow-600 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronsUpDown size={16} />
              Durum Güncelle
            </button>
            {ticket.assignedTo !== currentUser?.name && !isClosed && (
              <button
                onClick={handleTakeOwnership}
                className="p-2 rounded-md bg-green-600 text-white hover:bg-green-700 flex items-center gap-2 text-sm"
              >
                <GitBranch size={16} />
                Üzerine Al
              </button>
            )}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!isOwner || isClosed}
            >
              {isEditing ? <X size={16}/> : <Edit size={16} />}
              {isEditing ? 'İptal' : 'Düzenle'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sol Sütun: Ticket Detayları kaldırıldı */}
          {/* Sağ Sütun: Ticket Bilgileri */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 h-fit w-full lg:col-span-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">{ticket.title}</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 md:grid-cols-[max-content_1fr_max-content_1fr] gap-x-8 gap-y-2 text-sm">
              <span className="font-medium text-gray-500">Durum:</span>
              <span className="font-semibold text-green-600">{statusDisplayName || ticket.status}</span>
              
              <span className="font-medium text-gray-500">Öncelik:</span>
              <span className="font-semibold text-red-600">{ticket.priority}</span>
              
              <span className="font-medium text-gray-500">Kategori:</span>
              <span>{categoryName || '-'}</span>
              
              <span className="font-medium text-gray-500">Müşteri:</span>
              <span>{ticket.customerName}</span>
              
              <span className="font-medium text-gray-500">Atanan Kişi:</span>
              <span>{ticket.assignedTo}</span>

              <span className="font-medium text-gray-500">Grup:</span>
              <span>{ticket.groupName || '-'}</span>
              
              <span className="font-medium text-gray-500">Devre Numarası:</span>
              <span>{ticket.circuitNumber || '-'}</span>

              <span className="font-medium text-gray-500">Oluşturan:</span>
              <span>{ticket.creatorName || '-'}</span>

              <span className="font-medium text-gray-500">Müşteri Telefon:</span>
              <span>{ticket.phone1 || ticket.altPhone || '-'}</span>
              
              <span className="font-medium text-gray-500">Oluşturulma:</span>
              <span>{new Date(ticket.createdAt?.toDate()).toLocaleString()}</span>
              
              <div className="col-span-1 md:col-span-4 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="font-medium text-gray-500 block mb-1">Açıklama:</span>
                <p className="text-gray-600 dark:text-gray-300 whitespace-pre-line">{ticket.description}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Yorumlar ve Aktivite Akışı */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
           <h3 className="text-lg font-semibold mb-4">Log ve notlar</h3>
           {/* Log/Yorum Tabları */}
           <div className="flex gap-2 mb-4">
             <button
               className={`px-4 py-2 rounded-t-md font-semibold border-b-2 ${activeTab === 'log' ? 'border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent text-gray-500 bg-transparent'}`}
               onClick={() => { setActiveTab('log'); setCommentType('log'); }}
               type="button"
             >
               Log
             </button>
             <button
               className={`px-4 py-2 rounded-t-md font-semibold border-b-2 ${activeTab === 'comment' ? 'border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent text-gray-500 bg-transparent'}`}
               onClick={() => { setActiveTab('comment'); setCommentType('comment'); }}
               type="button"
             >
               Yorum
             </button>
             <button
               className={`px-4 py-2 rounded-t-md font-semibold border-b-2 ${activeTab === 'callresult' ? 'border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent text-gray-500 bg-transparent'}`}
               onClick={() => setActiveTab('callresult')}
               type="button"
             >Arama Sonucu</button>
           </div>
           {/* Log/Yorum Ekleme Formu */}
           <div className="flex items-start gap-4 mb-6">
             <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0"></div>
             <div className="flex-grow">
              <textarea 
                value={quotedLog ? `> ${quotedLog.replace(/\n/g, '\n> ')}\n\n${newComment}` : newComment}
                onChange={(e) => {
                  if (quotedLog) {
                    // quotedLog zaten textarea'da, sadece yeni kısmı güncelle
                    const quoteBlock = `> ${quotedLog.replace(/\n/g, '\n> ')}\n\n`;
                    if (e.target.value.startsWith(quoteBlock)) {
                      setNewComment(e.target.value.slice(quoteBlock.length));
                    } else {
                      setQuotedLog(null);
                      setNewComment(e.target.value);
                    }
                  } else {
                    setNewComment(e.target.value);
                  }
                }}
                placeholder={
                  isClosed 
                    ? 'Bu ticket kapalı durumda olduğu için yorum veya log eklenemez.' 
                    : isOwner 
                      ? (commentType === 'log' ? 'Bir log ekleyin...' : 'Bir yorum ekleyin...') 
                      : 'Yorum veya log eklemek için ticket\'ı üzerinize almalısınız.'
                }
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                rows={3}
                disabled={!isOwner || isClosed}
              />
              <div className="flex justify-end items-center mt-2 gap-4">
                 <button className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isOwner || isClosed}>
                    <Paperclip size={18} />
                 </button>
                 <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isOwner || isClosed || submitting || !newComment.trim()} onClick={handleAddComment}>
                   {submitting ? 'Kaydediliyor...' : (commentType === 'log' ? 'Log Ekle' : 'Yorum Yap')}
                 </button>
                 {quotedLog && (
                   <button
                     className="ml-2 px-2 py-1 text-xs bg-gray-400 text-white rounded shadow hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
                     onClick={() => setQuotedLog(null)}
                   >
                     Alıntıyı Kaldır
                   </button>
                 )}
              </div>
             </div>
           </div>
           {/* Mevcut Loglar/Yorumlar */}
           {activeTab === 'log' ? (
             <div>
               {/* Log Tipi Filtresi */}
               <div className="mb-4 flex gap-2">
                 <button
                   className={`px-3 py-1 rounded ${logFilterType === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                   onClick={() => setLogFilterType('all')}
                 >Tümü</button>
                 <button
                   className={`px-3 py-1 rounded ${logFilterType === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                   onClick={() => setLogFilterType('user')}
                 >Kullanıcı Logları</button>
                 <button
                   className={`px-3 py-1 rounded ${logFilterType === 'system' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                   onClick={() => setLogFilterType('system')}
                 >Sistem Logları</button>
               </div>
               <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                 <thead>
                   <tr>
                     <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tip</th>
                     <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kullanıcı</th>
                     <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tarih</th>
                     <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Log</th>
                   </tr>
                 </thead>
                 <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                   {logs
                     .filter(log => {
                       if (logFilterType === 'all') return true;
                       if (logFilterType === 'system') return log.type === 'system';
                       if (logFilterType === 'user') return log.type === 'log';
                       return true;
                     })
                     .map(log => (
                       <tr key={log.id} className={log.type === 'system' ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}>
                         <td className="px-4 py-2 whitespace-nowrap font-semibold">
                           {log.type === 'system' ? <span title="Sistem Logu" className="text-yellow-600">⚙️ Sistem</span> : 'Kullanıcı'}
                         </td>
                         <td className="px-4 py-2 whitespace-nowrap font-semibold">{log.author}</td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleString() : ''}</td>
                         <td className="px-4 py-2 flex items-center gap-2">{renderLogText(log.text)}
                           <button
                             className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                             title="Alıntıla"
                             onClick={() => setQuotedLog(log.text)}
                           >
                             Alıntıla
                           </button>
                         </td>
                       </tr>
                     ))}
                 </tbody>
               </table>
               {/* Pagination */}
               <div className="flex justify-end gap-2 mt-4">
                 {Array.from({ length: Math.ceil(logsTotal / LOGS_PER_PAGE) }, (_, i) => (
                   <button
                     key={i}
                     className={`px-3 py-1 rounded ${logPage === i + 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                     onClick={() => setLogPage(i + 1)}
                   >
                     {i + 1}
                   </button>
                 ))}
               </div>
             </div>
           ) : activeTab === 'comment' ? (
             <div className="space-y-6">
               {comments.filter(c => c.type === 'comment').map(comment => (
                 <div key={comment.id} className="flex items-start gap-4">
                   <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0"></div>
                   <div className="flex-grow">
                     <div className="flex items-center justify-between">
                       <span className="font-semibold">{comment.author}</span>
                       <span className="text-xs text-gray-500">{comment.createdAt?.toDate ? new Date(comment.createdAt.toDate()).toLocaleString() : ''}</span>
                     </div>
                     <div className="mt-1 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-md">
                       <p>{comment.text}</p>
                     </div>
                   </div>
                 </div>
               ))}
             </div>
           ) : (
             // Arama Sonucu Tabı
             <div>
               <h4 className="font-semibold mb-2">Arama Sonucu Ekle</h4>
               <div className="flex flex-col md:flex-row gap-4 mb-4">
                 <input
                   type="text"
                   className="border p-2 rounded w-full md:w-48 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                   placeholder="Aranan Numara"
                   value={callPhone}
                   onChange={e => setCallPhone(e.target.value)}
                 />
                 <select
                   className="border p-2 rounded w-full md:w-40 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                   value={callStatus}
                   onChange={e => setCallStatus(e.target.value as any)}
                 >
                   <option value="ulasildi">Ulaşıldı</option>
                   <option value="ulasilamadi">Ulaşılamadı</option>
                 </select>
                 {callStatus === 'ulasilamadi' && (
                   <select
                     className="border p-2 rounded w-full md:w-40 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                     value={failReason}
                     onChange={e => setFailReason(e.target.value)}
                   >
                     <option value="">Neden Seçin</option>
                     {failReasons.map(r => <option key={r} value={r}>{r}</option>)}
                   </select>
                 )}
                 <button
                   className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
                   onClick={handleAddCallResult}
                   disabled={!callPhone || (callStatus === 'ulasilamadi' && !failReason)}
                 >Kaydet</button>
               </div>
               <h4 className="font-semibold mb-2">Arama Sonuçları</h4>
               <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                 <thead className="bg-gray-100 dark:bg-gray-700">
                   <tr>
                     <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Tarih</th>
                     <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Numara</th>
                     <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Durum</th>
                     <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Neden</th>
                     <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Kullanıcı</th>
                   </tr>
                 </thead>
                 <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                   {callResults.map(r => (
                     <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                       <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-300">{r.createdAt?.toDate ? new Date(r.createdAt.toDate()).toLocaleString() : ''}</td>
                       <td className="px-4 py-2 whitespace-nowrap dark:text-gray-100">{r.phone}</td>
                       <td className="px-4 py-2 whitespace-nowrap dark:text-gray-100">{r.status === 'ulasildi' ? 'Ulaşıldı' : 'Ulaşılamadı'}</td>
                       <td className="px-4 py-2 whitespace-nowrap dark:text-gray-100">{r.status === 'ulasilamadi' ? r.failReason : '-'}</td>
                       <td className="px-4 py-2 whitespace-nowrap dark:text-gray-100">{r.user}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           )}
        </div>

      </div>

      {/* YENİ: Durum Güncelleme Modalı */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Durumu Güncelle</h3>
            <div className="mb-4">
              <label htmlFor="status-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Yeni Durum Seçin</label>
              <select
                id="status-select"
                value={selectedStatusId}
                onChange={(e) => setSelectedStatusId(e.target.value)}
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="" disabled>-- Bir durum seçin --</option>
                {availableStatuses.map(status => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-4">
              <button onClick={() => setIsStatusModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">İptal</button>
              <button onClick={handleStatusUpdate} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* YENİ: Grup Transfer Modalı */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Ticket'ı Transfer Et</h3>
            <div className="mb-4">
              <label htmlFor="group-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grup Ara</label>
              <input
                type="text"
                id="group-search"
                placeholder="Grup adını yazın..."
                value={groupSearchTerm}
                onChange={(e) => setGroupSearchTerm(e.target.value)}
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 mb-2"
              />
              <div className="max-h-48 overflow-y-auto border rounded-md">
                {availableGroups
                  .filter(group => group.name.toLowerCase().includes(groupSearchTerm.toLowerCase()))
                  .map(group => (
                    <div
                      key={group.id}
                      onClick={() => setSelectedGroupId(group.id)}
                      className={`p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedGroupId === group.id ? 'bg-blue-500 text-white' : ''}`}
                    >
                      {group.name}
                    </div>
                  ))}
              </div>
            </div>
            <div className="flex justify-end gap-4">
              <button onClick={() => setIsTransferModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">İptal</button>
              <button onClick={handleGroupTransfer} className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700">Transfer Et</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDetail; 