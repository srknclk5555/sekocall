import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, Timestamp, query, where, doc, runTransaction, setDoc, updateDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { isTicketClosed } from '../utils/ticketUtils';

// Kategori tipi
interface Category {
  id: string;
  name: string;
  parentId?: string | null;
  children?: Category[];
}
interface User {
  id: string;
  name: string;
  email?: string;
}
interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  tckn?: string;
  phone1?: string;
  phone2?: string;
}
interface CustomerProduct {
  id: string;
  productId: string;
  productName: string;
  productPrice?: number;
  speed?: number;
  type?: string;
  commitment?: number;
  status?: string;
  circuitNumber?: string;
  address?: string;
  hizmetAdresi?: string;
  hizmet_adresi?: string;
  serviceAddress?: string;
  service_address?: string;
  adres?: string;
}
interface TicketStatus {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
}
interface Group {
  id: string;
  name: string;
  parentId?: string | null;
}

interface Ticket {
  id: string;
  ticketNumber?: string;
  title: string;
  status: string;
  statusName?: string;
  customerId: string;
  customerName: string;
  circuitNumber?: string;
}

const priorities = ['Düşük', 'Orta', 'Yüksek', 'Acil'];

// Kategorileri düzleştir (ağaçtan düz diziye)
function flattenCategories(categories: Category[], prefix = ''): { id: string; name: string }[] {
  let result: { id: string; name: string }[] = [];
  for (const cat of categories) {
    result.push({ id: cat.id, name: prefix ? `${prefix} / ${cat.name}` : cat.name });
    if (cat.children && cat.children.length > 0) {
      result = result.concat(flattenCategories(cat.children, prefix ? `${prefix} / ${cat.name}` : cat.name));
    }
  }
  return result;
}

export default function CreateTicket() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerProducts, setCustomerProducts] = useState<CustomerProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [categoryId, setCategoryId] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(priorities[1]);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [circuitNumber, setCircuitNumber] = useState('');
  const [ticketStatuses, setTicketStatuses] = useState<TicketStatus[]>([]);
  const [statusId, setStatusId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [createdAtInput, setCreatedAtInput] = useState(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:mm'
  });
  const [phone1, setPhone1] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [address, setAddress] = useState('');
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [ticketLockId, setTicketLockId] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { user } = useAuth();

  // Bilet numarası rezerve et (lock) - ekran açıldığında
  useEffect(() => {
    // Sadece kullanıcı varsa ve henüz bir numara rezerve edilmediyse çalıştır
    if (user && !ticketNumber && !lockError) {
      reserveTicketNumber();
    }

    // Cleanup: bileşen söküldüğünde kilidi serbest bırak.
    // Bu, kullanıcının formu göndermeden sayfadan ayrılması durumunu ele alır.
    const currentTicketLockId = ticketLockId;
    return () => {
      if (currentTicketLockId) {
        releaseTicketNumberLock(currentTicketLockId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Kullanıcı oturum açtığında çalıştır

  // Filtrelenmiş grup listesi
  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    return groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()));
  }, [groups, groupSearch]);

  // Verileri Firestore'dan çek
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Kategoriler
        const catSnap = await getDocs(collection(db, 'ticket_categories'));
        const cats: Category[] = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
        setCategories(cats.length > 0 ? cats : []);
        // Kullanıcılar
        const userSnap = await getDocs(collection(db, 'users'));
        const usrs: User[] = userSnap.docs.map(doc => {
          const d = doc.data();
          return { id: doc.id, name: d.firstName && d.lastName ? `${d.firstName} ${d.lastName}` : d.name || d.email || 'Kullanıcı', email: d.email };
        });
        setUsers(usrs);
        // Müşteriler
        const custSnap = await getDocs(collection(db, 'customers'));
        const custs: Customer[] = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        setCustomers(custs);
        // Ticket durumları
        const statusSnap = await getDocs(collection(db, 'ticket_statuses'));
        const statuses: TicketStatus[] = statusSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TicketStatus));
        const activeStatuses = statuses.filter(s => s.active !== false);
        setTicketStatuses(activeStatuses);
        // Set default statusId to the one with name 'Açık', or fallback to first
        const acikStatus = activeStatuses.find(s => s.name === 'Açık');
        if (acikStatus) {
          setStatusId(acikStatus.id);
        } else if (activeStatuses.length > 0) {
          setStatusId(activeStatuses[0].id);
        }
        // Gruplar
        const groupSnap = await getDocs(collection(db, 'workgroups'));
        const grps: Group[] = groupSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
        setGroups(grps);
      } catch (err) {
        setError('Veriler yüklenirken hata oluştu.');
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  // Düzleştirilmiş ve filtrelenmiş kategori listesi
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return flatCategories;
    return flatCategories.filter(cat => cat.name.toLowerCase().includes(categorySearch.toLowerCase()));
  }, [flatCategories, categorySearch]);
  const selectedCategory = flatCategories.find(cat => cat.id === categoryId);

  // Filtrelenmiş müşteri listesi
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const search = customerSearch.toLowerCase();
    return customers.filter(c => {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const tckn = c.tckn || '';
      const phone = (c.phone1 || '').replace(/\D/g, '');
      return (
        name.includes(search) ||
        email.includes(search) ||
        tckn.includes(search) ||
        phone.includes(search.replace(/\D/g, ''))
      );
    });
  }, [customers, customerSearch]);
  const selectedCustomer = customers.find(c => c.id === customerId);

  // Müşteri seçildiğinde ürünleri çek
  useEffect(() => {
    if (!customerId) {
      setCustomerProducts([]);
      setSelectedProductId('');
      setPhone1('');
      return;
    }
    async function fetchCustomerProducts() {
      try {
        const q = query(collection(db, 'customer_products'), where('customerId', '==', customerId));
        const snap = await getDocs(q);
        const prods: CustomerProduct[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomerProduct));
        setCustomerProducts(prods);
        setSelectedProductId('');
      } catch (err) {
        setCustomerProducts([]);
        setSelectedProductId('');
      }
    }
    fetchCustomerProducts();
    const cust = customers.find(c => c.id === customerId);
    setPhone1(cust?.phone1 || '');
  }, [customerId]);

  // Ürün seçimi için sadece aktif ürünler listelensin
  const activeCustomerProducts = useMemo(() => customerProducts.filter(p => p.status === 'Aktif'), [customerProducts]);

  // Ürün seçildiğinde devre numarasını ve adresi otomatik doldur
  useEffect(() => {
    if (!selectedProductId) {
      setCircuitNumber('');
      setAddress('');
      return;
    }
    const prod = customerProducts.find(p => p.id === selectedProductId);
    setCircuitNumber(prod?.circuitNumber || '');
    setAddress(
      prod?.hizmetAdresi ||
      prod?.hizmet_adresi ||
      prod?.serviceAddress ||
      prod?.service_address ||
      prod?.address ||
      prod?.adres ||
      ''
    );
  }, [selectedProductId, customerProducts]);

  const handleTagAdd = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };
  const handleTagRemove = (tag: string) => setTags(tags.filter(t => t !== tag));
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  async function reserveTicketNumber() {
    if (!user) return;
  
    setLockError(null);
    setTicketNumber(null);
    
    // İşlemi birkaç kez denemek için bir döngü
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const generatedTicketNumber = await runTransaction(db, async (transaction) => {
          const counterRef = doc(db, 'counters', 'ticketNumber');
          const counterDoc = await transaction.get(counterRef);
  
          if (!counterDoc.exists()) {
            throw new Error("Ticket sayacı bulunamadı!");
          }
  
          const currentNumber = counterDoc.data().value;
          const newNumber = currentNumber + 1;
          const year = new Date().getFullYear();
          const formattedTicketNumber = `${year}-${String(newNumber).padStart(6, '0')}`;
          
          // Bu numara için bir kilit oluştur
          const lockRef = doc(db, 'ticket_number_locks', formattedTicketNumber);
          const lockDoc = await transaction.get(lockRef);
          
          if (lockDoc.exists()) {
            // Kilit zaten varsa, bu numara kullanılıyor demektir.
            // Tekrar denemek için işlemi başarısız say.
            throw new Error("Ticket numarası çakışması, yeniden deneniyor.");
          }
          
          // Kilidi oluştur
          transaction.set(lockRef, {
            lockedBy: user.uid,
            createdAt: serverTimestamp(),
            status: 'pending'
          });
          
          // Sayacı güncelle
          transaction.update(counterRef, { value: newNumber });
          
          return formattedTicketNumber;
        });
  
        // Başarılı olursa...
        setTicketNumber(generatedTicketNumber);
        setTicketLockId(generatedTicketNumber);
        
        // Zaman aşımı ayarla
        lockTimeoutRef.current = setTimeout(() => {
          setLockError('Bilet oluşturma süresi doldu. Lütfen tekrar deneyin.');
          releaseTicketNumberLock(generatedTicketNumber, true);
        }, 3 * 60 * 1000); // 3 dakika
        
        return; // Döngüden çık
  
      } catch (error: any) {
        console.warn(`Bilet numarası alma denemesi ${i + 1} başarısız oldu:`, error.message);
        if (i === maxRetries - 1) {
          // Son denemede de başarısız olursa
          setLockError("Yeni bilet numarası alınamadı. Lütfen tekrar deneyin. Sorun devam ederse yöneticiye bildirin.");
        } else {
          // Kısa bir süre bekle ve tekrar dene
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
        }
      }
    }
  }

  // Bilet oluşturma iptal edildiğinde veya tamamlandığında kilidi serbest bırak
  async function releaseTicketNumberLock(lockId: string | null, isTimeout = false) {
    if (!user) return;
  
    try {
      if (lockId) {
        await deleteDoc(doc(db, 'ticket_number_locks', lockId));
      }
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
      setTicketLockId(null);
      setLockError(null);
    } catch (error: any) {
      console.error("Bilet numarası kilidi serbest bırakılırken hata oluştu:", error.message);
      setLockError("Bilet numarası kilidi serbest bırakılırken hata oluştu. Lütfen tekrar deneyin. Sorun devam ederse yöneticiye bildirin.");
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!title.trim() || !description.trim() || !categoryId || !priority || !customerId || !selectedProductId) {
        setError('Lütfen tüm zorunlu alanları doldurun.');
        setSubmitting(false);
        return;
      }
      if (!ticketNumber || !ticketLockId) {
        setError('Ticket numarası rezerve edilemedi. Lütfen sayfayı yenileyin.');
        setSubmitting(false);
        return;
      }
      // Lock kontrolü: sadece kendi lock'unu kullanabilir
      const lockRef = doc(db, 'ticket_number_locks', ticketLockId);
      const lockSnap = await getDoc(lockRef);
      if (!lockSnap.exists() || lockSnap.data().lockedBy !== user?.uid || lockSnap.data().status !== 'pending') {
        setError('Ticket numarası başka bir kullanıcı tarafından kullanılıyor veya süresi doldu. Lütfen sayfayı yenileyin.');
        setSubmitting(false);
        return;
      }

      // Mükerrer ticket kontrolü
      const selectedProduct = customerProducts.find(p => p.id === selectedProductId);
      if (selectedProduct?.circuitNumber) {
        const existingTicketsQuery = query(
          collection(db, 'tickets'),
          where('circuitNumber', '==', selectedProduct.circuitNumber)
        );
        const existingTicketsSnap = await getDocs(existingTicketsQuery);
        
        if (!existingTicketsSnap.empty) {
          const existingTickets = existingTicketsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Ticket));
          
          // Aynı müşteri için açık ticket var mı kontrol et (kapalı olmayanlar)
          const sameCustomerOpenTickets = existingTickets.filter(ticket => 
            ticket.customerId === customerId && 
            !isTicketClosed(ticket.statusName || ticket.status)
          );
          
          if (sameCustomerOpenTickets.length > 0) {
            const ticketList = sameCustomerOpenTickets.map(ticket => 
              `Ticket No: ${ticket.ticketNumber || ticket.id} - ${ticket.title} (${ticket.statusName || ticket.status})`
            ).join('\n');
            
            setError(`Bu müşteri için zaten açık ticket bulunmaktadır!\n\nMevcut ticketlar:\n${ticketList}\n\nLütfen mevcut ticketları kontrol edin ve gerekirse onları kapatın.`);
            setSubmitting(false);
            return;
          }
          
          // Aynı devre numarası için açık ticket var mı kontrol et (kapalı olmayanlar)
          const sameCircuitOpenTickets = existingTickets.filter(ticket => 
            !isTicketClosed(ticket.statusName || ticket.status)
          );
          
          if (sameCircuitOpenTickets.length > 0) {
            const ticketList = sameCircuitOpenTickets.map(ticket => 
              `Ticket No: ${ticket.ticketNumber || ticket.id} - ${ticket.title} (${ticket.statusName || ticket.status}) - Müşteri: ${ticket.customerName}`
            ).join('\n');
            
            setError(`Bu devre numarası (${selectedProduct.circuitNumber}) için zaten açık ticket bulunmaktadır!\n\nMevcut ticketlar:\n${ticketList}\n\nLütfen mevcut ticketları kontrol edin ve gerekirse onları kapatın.`);
            setSubmitting(false);
            return;
          }
        }
      }

      if (selectedProduct?.status !== 'Aktif') {
        setError('Sadece durumu Aktif olan ürünler için ticket açabilirsiniz.');
        setSubmitting(false);
        return;
      }

      const customer = customers.find(c => c.id === customerId);
      const assignee = users.find(u => u.id === assigneeId);
      let createdAtTimestamp: Timestamp;
      if (createdAtInput) {
        const date = new Date(createdAtInput);
        createdAtTimestamp = Timestamp.fromDate(date);
      } else {
        createdAtTimestamp = Timestamp.now();
      }
      const productDetails = selectedProduct
        ? Object.fromEntries(
            Object.entries({
              price: selectedProduct.productPrice,
              speed: selectedProduct.speed,
              type: selectedProduct.type,
              commitment: selectedProduct.commitment,
              status: selectedProduct.status,
              circuitNumber: selectedProduct.circuitNumber,
            }).filter(([_, v]) => v !== undefined)
          )
        : {};

      await addDoc(collection(db, 'tickets'), {
        ticketNumber,
        title,
        description,
        categoryId,
        categoryName: selectedCategory?.name || '',
        priority,
        customerId,
        customerName: customer ? `${customer.firstName} ${customer.lastName}` : '',
        customerEmail: customer?.email || '',
        assigneeId: assigneeId || null,
        assigneeName: assignee?.name || '',
        productId: selectedProduct?.productId || '',
        productName: selectedProduct?.productName || '',
        productDetails,
        circuitNumber: selectedProduct?.circuitNumber || '',
        statusId: ticketStatuses.find(s => s.name === 'Açık')?.id || statusId,
        statusName: 'Açık',
        groupId,
        groupName: groups.find(g => g.id === groupId)?.name || '',
        tags,
        phone1,
        altPhone,
        address,
        createdAt: createdAtTimestamp,
        creatorId: user?.uid,
        creatorName: user?.name,
        status: 'Açık',
      });
      // Lock'u used yap
      await updateDoc(lockRef, { status: 'used', usedAt: Timestamp.now() });
      setTicketNumber(null);
      setTicketLockId(null);
      setTitle('');
      setDescription('');
      setCategoryId('');
      setPriority(priorities[1]);
      setCustomerId('');
      setAssigneeId('');
      setTags([]);
      setTagInput('');
      setFiles([]);
      setSelectedProductId('');
      setCustomerProducts([]);
      setCreatedAtInput(() => {
        const now = new Date();
        now.setSeconds(0, 0);
        return now.toISOString().slice(0, 16);
      });
      setPhone1('');
      setAltPhone('');
      setAddress('');
      setGroupId('');
      setGroupSearch('');
    } catch (err) {
      const error: any = err;
      setError('Ticket kaydedilirken hata oluştu: ' + (error?.message || JSON.stringify(error)));
      console.error('Ticket kaydedilirken hata:', error);
    }
    setSubmitting(false);
  };

  if (loading) return <div className="p-6 text-gray-400">Yükleniyor...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="flex flex-col md:flex-row gap-8 p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Orta Panel: Ticket Formu */}
      <main className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow p-6 mx-auto max-w-4xl overflow-y-auto max-h-[90vh]">
        {ticketNumber && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded text-blue-900 dark:text-blue-200 font-mono text-lg font-bold text-center">
            Ticket Numarası: {ticketNumber} (Rezerve Edildi)
          </div>
        )}
        {lockError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-red-900 dark:text-red-200 font-mono text-lg font-bold text-center">
            {lockError}
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
          <h1 className="text-2xl font-bold flex items-center gap-4">
            Yeni Ticket Oluştur
            {ticketNumber && (
              <span className="ml-4 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded text-blue-900 dark:text-blue-200 font-mono text-base font-bold">
                {ticketNumber} (Rezerve Edildi)
              </span>
            )}
          </h1>
          {/* Durum Seçimi */}
          <div className="flex-shrink-0 min-w-[180px] md:text-right">
            <label className="block font-medium mb-1 md:mb-0 md:mr-2 md:inline-block">Ticket Durumu</label>
            <select
              className="p-2 rounded bg-gray-100 dark:bg-gray-700 md:w-auto w-full"
              value={statusId}
              onChange={e => setStatusId(e.target.value)}
              required
            >
              {ticketStatuses.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* Kategori Seçimi */}
          <div>
            <label className="block font-medium mb-1">Kategori</label>
            <div className="relative">
              <input
                type="text"
                className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700"
                placeholder="Kategori ara..."
                value={categorySearch}
                onChange={e => { setCategorySearch(e.target.value); setCategoryDropdownOpen(true); }}
                onFocus={() => setCategoryDropdownOpen(true)}
                readOnly={!!selectedCategory}
              />
              <button
                type="button"
                className="absolute right-2 top-2 text-gray-500"
                onClick={() => setCategoryDropdownOpen(v => !v)}
                tabIndex={-1}
              >
                {categoryDropdownOpen ? '▲' : '▼'}
              </button>
              {categoryDropdownOpen && (
                <div className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow max-h-60 w-full overflow-y-auto mt-1">
                  {filteredCategories.length === 0 && (
                    <div className="p-2 text-gray-400">Sonuç bulunamadı.</div>
                  )}
                  {filteredCategories.map(cat => (
                    <div
                      key={cat.id}
                      className={`p-2 cursor-pointer hover:bg-blue-100 dark:hover:bg-gray-700 ${cat.id === categoryId ? 'bg-blue-200 dark:bg-blue-800 font-bold' : ''}`}
                      onClick={() => {
                        setCategoryId(cat.id);
                        setCategorySearch(cat.name);
                        setCategoryDropdownOpen(false);
                      }}
                    >
                      {cat.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedCategory && (
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                <span>Seçili: <b>{selectedCategory.name}</b></span>
                <button type="button" className="ml-2 text-xs text-red-500 underline" onClick={() => { setCategoryId(''); setCategorySearch(''); }}>Kaldır</button>
              </div>
            )}
          </div>
          {/* Başlık */}
          <div>
            <label className="block font-medium mb-1">Başlık</label>
            <input type="text" className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          {/* Açıklama */}
          <div>
            <label className="block font-medium mb-1">Açıklama</label>
            <textarea className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" rows={4} value={description} onChange={e => setDescription(e.target.value)} required />
          </div>
          {/* Öncelik, Müşteri, Atanacak, Grup */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block font-medium mb-1">Öncelik</label>
              <select className="p-2 rounded bg-gray-100 dark:bg-gray-700" value={priority} onChange={e => setPriority(e.target.value)}>
                {priorities.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {/* Müşteri Seçimi */}
            <div className="relative">
              <label className="block font-medium mb-1">Müşteri</label>
              <input
                type="text"
                className="p-2 rounded bg-gray-100 dark:bg-gray-700 w-48"
                placeholder="Müşteri ara..."
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setCustomerDropdownOpen(true); }}
                onFocus={() => setCustomerDropdownOpen(true)}
              />
              <button
                type="button"
                className="absolute right-2 top-7 text-gray-500"
                onClick={() => setCustomerDropdownOpen(v => !v)}
                tabIndex={-1}
              >
                {customerDropdownOpen ? '▲' : '▼'}
              </button>
              {customerDropdownOpen && (
                <div className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow max-h-60 w-48 overflow-y-auto mt-1">
                  {filteredCustomers.length === 0 && (
                    <div className="p-2 text-gray-400">Sonuç bulunamadı.</div>
                  )}
                  {filteredCustomers.map(c => (
                    <div
                      key={c.id}
                      className={`p-2 cursor-pointer hover:bg-blue-100 dark:hover:bg-gray-700 ${c.id === customerId ? 'bg-blue-200 dark:bg-blue-800 font-bold' : ''}`}
                      onClick={() => {
                        setCustomerId(c.id);
                        setCustomerSearch(`${c.firstName} ${c.lastName}`);
                        setCustomerDropdownOpen(false);
                      }}
                    >
                      <div className="font-semibold">{c.firstName} {c.lastName}</div>
                      <div className="text-xs text-gray-400">{c.email}</div>
                      {c.tckn && <div className="text-xs text-gray-400">TCKN: {c.tckn}</div>}
                      {c.phone1 && <div className="text-xs text-gray-400">Tel: {c.phone1}</div>}
                    </div>
                  ))}
                </div>
              )}
              {selectedCustomer && (
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-300 flex flex-col gap-1 border rounded p-2 bg-gray-50 dark:bg-gray-900/40">
                  <div><b>{selectedCustomer.firstName} {selectedCustomer.lastName}</b></div>
                  <div className="text-xs">E-posta: {selectedCustomer.email}</div>
                  {selectedCustomer.tckn && <div className="text-xs">TCKN: {selectedCustomer.tckn}</div>}
                  {selectedCustomer.phone1 && <div className="text-xs">Tel: {selectedCustomer.phone1}</div>}
                  <button type="button" className="ml-2 text-xs text-red-500 underline self-start" onClick={() => { setCustomerId(''); setCustomerSearch(''); setCustomerProducts([]); setSelectedProductId(''); }}>Kaldır</button>
                </div>
              )}
            </div>
            {/* Ürün Seçimi */}
            <div>
              <label className="block font-medium mb-1">Ürün</label>
              <select
                className="p-2 rounded bg-gray-100 dark:bg-gray-700 min-w-[180px]"
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                disabled={!customerId || activeCustomerProducts.length === 0}
                required
              >
                <option value="">{!customerId ? 'Önce müşteri seçin' : (activeCustomerProducts.length === 0 ? 'Aktif ürün bulunamadı' : 'Ürün seçin')}</option>
                {activeCustomerProducts.map(prod => (
                  <option key={prod.id} value={prod.id}>
                    {prod.productName} {prod.type ? `- ${prod.type}` : ''} {prod.speed ? `- ${prod.speed} Mbps` : ''}
                  </option>
                ))}
              </select>
              {/* Seçili ürün detayları */}
              {selectedProductId && (
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 border rounded p-2 bg-gray-50 dark:bg-gray-900/40">
                  {(() => {
                    const prod = customerProducts.find(p => p.id === selectedProductId);
                    if (!prod) return null;
                    return <>
                      <div><b>{prod.productName}</b></div>
                      {prod.type && <div>Tür: {prod.type}</div>}
                      {prod.speed && <div>Hız: {prod.speed} Mbps</div>}
                      {prod.productPrice && <div>Fiyat: {prod.productPrice} TL</div>}
                      {prod.commitment && <div>Taahhüt: {prod.commitment} Ay</div>}
                      {prod.status && <div>Durum: {prod.status}</div>}
                      {prod.circuitNumber && <div><b>Devre No:</b> {prod.circuitNumber}</div>}
                    </>;
                  })()}
                </div>
              )}
            </div>
            {/* Devre Numarası */}
            <div>
              <label className="block font-medium mb-1">Devre Numarası</label>
              <input
                type="text"
                className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700"
                value={circuitNumber}
                readOnly
                disabled
                placeholder="Ürün seçildiğinde otomatik dolacak"
              />
            </div>
            {/* Atanacak ve Grup yan yana */}
            <div className="flex gap-4 min-w-[400px]">
              {/* Atanacak */}
              <div className="relative w-40">
                <label className="block font-medium mb-1">Atanacak</label>
                <select className="p-2 rounded bg-gray-100 dark:bg-gray-700 w-full" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                  <option value="">Seçiniz</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              {/* Grup arama ve seçim (müşteri gibi) */}
              <div className="relative w-48">
                <label className="block font-medium mb-1">Grup</label>
                <input
                  type="text"
                  className="p-2 rounded bg-gray-100 dark:bg-gray-700 w-full"
                  placeholder="Grup ara..."
                  value={groupSearch}
                  onChange={e => { setGroupSearch(e.target.value); setGroupDropdownOpen(true); }}
                  onFocus={() => setGroupDropdownOpen(true)}
                />
                <button
                  type="button"
                  className="absolute right-2 top-7 text-gray-500"
                  onClick={() => setGroupDropdownOpen(v => !v)}
                  tabIndex={-1}
                >
                  {groupDropdownOpen ? '▲' : '▼'}
                </button>
                {groupDropdownOpen && (
                  <div className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow max-h-60 w-48 overflow-y-auto mt-1">
                    {filteredGroups.length === 0 && (
                      <div className="p-2 text-gray-400">Sonuç bulunamadı.</div>
                    )}
                    {filteredGroups.map(g => (
                      <div
                        key={g.id}
                        className={`p-2 cursor-pointer hover:bg-blue-100 dark:hover:bg-gray-700 ${g.id === groupId ? 'bg-blue-200 dark:bg-blue-800 font-bold' : ''}`}
                        onClick={() => {
                          setGroupId(g.id);
                          setGroupSearch(g.name);
                          setGroupDropdownOpen(false);
                        }}
                      >
                        {g.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Telefon Bilgileri */}
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block font-medium mb-1">Telefon 1</label>
                <input
                  type="tel"
                  className="p-2 rounded bg-gray-100 dark:bg-gray-700 w-48"
                  value={phone1}
                  onChange={e => setPhone1(e.target.value)}
                  placeholder="Müşteri seçildiğinde otomatik dolar"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Alternatif Telefon</label>
                <input
                  type="tel"
                  className="p-2 rounded bg-gray-100 dark:bg-gray-700 w-48"
                  value={altPhone}
                  onChange={e => setAltPhone(e.target.value)}
                  placeholder="Manuel girilebilir"
                />
              </div>
            </div>
            {/* Adres Bilgisi */}
            <div>
              <label className="block font-medium mb-1">Adres</label>
              <textarea
                className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700"
                rows={2}
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Ürün seçildiğinde otomatik dolar, düzenlenebilir"
              />
            </div>
          </div>
          {/* Etiketler */}
          <div>
            <label className="block font-medium mb-1">Etiketler</label>
            <div className="flex gap-2 mb-2">
              <input type="text" className="p-2 rounded bg-gray-100 dark:bg-gray-700 flex-1" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' ? (e.preventDefault(), handleTagAdd()) : undefined} placeholder="Etiket ekle..." />
              <button type="button" className="bg-blue-500 text-white px-3 py-1 rounded" onClick={handleTagAdd}>Ekle</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span key={tag} className="bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 px-2 py-1 rounded flex items-center">
                  {tag}
                  <button type="button" className="ml-1 text-xs" onClick={() => handleTagRemove(tag)}>×</button>
                </span>
              ))}
            </div>
          </div>
          {/* Dosya Yükle (Demo) */}
          <div>
            <label className="block font-medium mb-1">Dosya Yükle (Demo, kaydedilmez)</label>
            <input type="file" multiple onChange={handleFileChange} className="block" />
            {files.length > 0 && (
              <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {files.map(file => <li key={file.name}>{file.name}</li>)}
              </ul>
            )}
          </div>
          {/* Açılış Tarihi ve Saati */}
          <div>
            <label className="block font-medium mb-1">Açılış Tarihi ve Saati</label>
            <input
              type="datetime-local"
              className="p-2 rounded bg-gray-100 dark:bg-gray-700"
              value={createdAtInput}
              onChange={e => setCreatedAtInput(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-4 justify-end">
            <button type="reset" className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded" disabled={submitting}>İptal</button>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold" disabled={submitting}>{submitting ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
          {error && <div className="text-red-500 mt-2">{error}</div>}
        </form>
      </main>
      {/* Sağ Panel: SSS/Öneriler */}
      <aside className="md:w-1/4 bg-white dark:bg-gray-800 rounded-lg shadow p-4 h-fit">
        <h2 className="font-bold text-lg mb-2">Sıkça Sorulan Sorular</h2>
        <ul className="list-disc ml-5 text-sm text-gray-700 dark:text-gray-300">
          <li>Ticket nedir, nasıl açılır?</li>
          <li>Destek taleplerinde öncelik nasıl belirlenir?</li>
          <li>Ek dosya yüklerken nelere dikkat edilmeli?</li>
        </ul>
        <h2 className="font-bold text-lg mt-6 mb-2">Otomatik Çözüm Önerileri</h2>
        <ul className="list-disc ml-5 text-sm text-gray-700 dark:text-gray-300">
          <li>Yaygın sorunlar için çözüm rehberini inceleyin.</li>
          <li>Kategoriye göre öneriler burada listelenebilir.</li>
        </ul>
      </aside>
    </div>
  );
} 