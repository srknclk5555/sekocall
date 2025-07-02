import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, limit } from 'firebase/firestore'
import { 
  Users, 
  Search, 
  Filter,
  Plus,
  MoreHorizontal,
  Phone,
  Mail,
  MapPin,
  Edit,
  Trash2,
  Eye,
  Package,
  ChevronDown,
  ChevronUp,
  Clock
} from 'lucide-react'

// Genişletilmiş Müşteri Arayüzü
interface Customer {
  id: string
  // Kişisel Bilgiler
  firstName: string
  lastName: string
  tckn: string
  birthDate: string
  birthPlace: string
  gender: 'Erkek' | 'Kadın' | 'Diğer'
  fatherName: string
  motherName: string
  nationality: string
  // Kimlik Bilgileri
  idType: 'TC Kimlik Kartı' | 'Sürücü Belgesi' | 'Pasaport' | 'Diğer'
  idNumber: string
  // Diğer Bilgiler
  occupation: string
  education: string
  // İzinler
  dataProcessingConsent: boolean
  communicationConsent: boolean
  // Müşteri Durumu
  status: 'Aktif' | 'Pasif' | 'Yasaklı'
  firstActivationDate: string
  deactivationDate?: string
  // İletişim Bilgileri
  email: string
  phone1: string
  phone2?: string
  backupPhone?: string
  address: string
  city: string
  // Sistem Bilgileri
  createdAt: Date
}

// Ürün/Hizmet Arayüzü
interface Product {
  id: string
  name: string
  speed?: number
  type?: 'Fiber' | 'DSL' | 'VDSL' | 'FTTH'
  commitment?: number
  price: number
  createdAt: Date
}

// Genişletilmiş Müşteri Ürün Ataması Arayüzü
interface CustomerProduct {
  id: string
  customerId: string
  productId: string
  productName: string
  productPrice: number
  circuitNumber: string // Benzersiz devre numarası
  assignedAt: Date
  activationDate?: Date // YENİ: Aktivasyon Tarihi
  status: 'Aktif' | 'Pasif' | 'İptal' | 'Deaktivasyon Beklemede' | 'Aktivasyon Beklemede' | 'Askıda' // YENİ: Durumlar
  notes?: string
  productAddress?: string // YENİ: Ürüne özel adres
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customerProducts, setCustomerProducts] = useState<CustomerProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [productToUpdate, setProductToUpdate] = useState<CustomerProduct | null>(null)
  const [newStatus, setNewStatus] = useState<CustomerProduct['status']>('Aktif')
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, product: CustomerProduct } | null>(null)
  const [currentCustomer, setCurrentCustomer] = useState<Partial<Customer> | null>(null)
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null)
  const [selectedCustomerForProduct, setSelectedCustomerForProduct] = useState<Customer | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [productNotes, setProductNotes] = useState('')
  const [useCustomAddress, setUseCustomAddress] = useState(false) // YENİ: Adres seçimi state'i
  const [customAddress, setCustomAddress] = useState('') // YENİ: Özel adres state'i
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Detaylı Filtre State'leri
  const [nameSearch, setNameSearch] = useState('')
  const [tcknSearch, setTcknSearch] = useState('')
  const [citySearch, setCitySearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const genderOptions = ['Erkek', 'Kadın', 'Diğer']
  const idTypeOptions = ['TC Kimlik Kartı', 'Sürücü Belgesi', 'Pasaport', 'Diğer']
  const educationOptions = ['İlkokul', 'Ortaokul', 'Lise', 'Üniversite', 'Yüksek Lisans', 'Doktora', 'Diğer']
  const statusOptions = ['Aktif', 'Pasif', 'Yasaklı']
  const productStatusOptions: CustomerProduct['status'][] = ['Aktif', 'Pasif', 'İptal', 'Aktivasyon Beklemede', 'Deaktivasyon Beklemede', 'Askıda']

  useEffect(() => {
    fetchCustomers()
    fetchProducts()
    fetchCustomerProducts()

    // YENİ: Sağ tık menüsünü kapatmak için global tık event'i
    const handleClickOutside = () => setContextMenu(null)
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [])

  const fetchCustomers = async () => {
    setIsLoading(true)
    try {
      // Varsayılan olarak son 10 müşteriyi getir
      const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const customerList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as Customer))
      setCustomers(customerList)
    } catch (err) {
      console.error("Müşterileri çekerken hata:", err)
      setError("Müşteriler yüklenemedi.")
    } finally {
      setIsLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const productsCollection = collection(db, 'internet_packages')
      const snapshot = await getDocs(productsCollection)
      const productsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as Product))
      setProducts(productsList)
    } catch (err) {
      console.error("Ürünleri çekerken hata:", err)
    }
  }

  const fetchCustomerProducts = async () => {
    try {
      const customerProductsCollection = collection(db, 'customer_products')
      const snapshot = await getDocs(customerProductsCollection)
      const customerProductsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        assignedAt: doc.data().assignedAt?.toDate() || new Date(),
      } as CustomerProduct))
      setCustomerProducts(customerProductsList)
    } catch (err) {
      console.error("Müşteri ürünlerini çekerken hata:", err)
    }
  }

  // Benzersiz devre numarası oluşturma fonksiyonu
  const generateCircuitNumber = async (): Promise<string> => {
    const prefix = 'DEV'
    const timestamp = Date.now().toString().slice(-6) // Son 6 hanesi
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const circuitNumber = `${prefix}${timestamp}${random}`
    
    // Bu numaranın daha önce kullanılıp kullanılmadığını kontrol et
    const existingProduct = customerProducts.find(cp => cp.circuitNumber === circuitNumber)
    if (existingProduct) {
      // Eğer varsa, yeni bir numara oluştur
      return generateCircuitNumber()
    }
    
    return circuitNumber
  }

  const handleAssignProduct = async () => {
    if (!selectedCustomerForProduct || !selectedProduct) {
      alert("Lütfen müşteri ve ürün seçin.")
      return
    }

    try {
      const product = products.find(p => p.id === selectedProduct)
      if (!product) {
        alert("Seçilen ürün bulunamadı.")
        return
      }

      const circuitNumber = await generateCircuitNumber()
      
      const addressToSave = useCustomAddress 
        ? customAddress 
        : selectedCustomerForProduct?.address;

      if (!addressToSave) {
        alert("Ürün adresi boş olamaz. Lütfen bir adres seçin veya girin.");
        return;
      }

      const customerProductData = {
        customerId: selectedCustomerForProduct.id,
        productId: selectedProduct,
        productName: product.name,
        productPrice: product.price,
        circuitNumber: circuitNumber,
        assignedAt: new Date(),
        activationDate: new Date(),
        status: 'Aktif' as const,
        notes: productNotes,
        productAddress: addressToSave, // YENİ: Adresi kaydet
      }

      await addDoc(collection(db, 'customer_products'), customerProductData)
      
      // State'leri temizle
      await fetchCustomerProducts()
      setIsProductModalOpen(false)
      setSelectedCustomerForProduct(null)
      setSelectedProduct('')
      setProductNotes('')
      setUseCustomAddress(false) // YENİ
      setCustomAddress('') // YENİ
      
      alert(`Ürün başarıyla atandı. Devre Numarası: ${circuitNumber}`)
    } catch (err) {
      console.error("Ürün atanırken hata:", err)
      alert("Ürün atanırken hata oluştu.")
    }
  }

  // YENİ: Ürün durumunu güncelleme fonksiyonu
  const handleUpdateProductStatus = async () => {
    if (!productToUpdate || !newStatus) return;

    try {
      const productRef = doc(db, 'customer_products', productToUpdate.id);
      await updateDoc(productRef, { status: newStatus });
      
      await fetchCustomerProducts(); // Listeyi yenile
      setIsStatusModalOpen(false);
      setProductToUpdate(null);
      alert('Ürün durumu başarıyla güncellendi.');
    } catch (error) {
      console.error('Error updating product status:', error);
      alert('Durum güncellenirken bir hata oluştu.');
    }
  };

  // YENİ: Sağ tık menüsünü açma fonksiyonu
  const handleContextMenu = (event: React.MouseEvent, product: CustomerProduct) => {
    event.preventDefault();
    setContextMenu({
      x: event.pageX,
      y: event.pageY,
      product: product,
    });
  };

  const openProductModal = (customer: Customer) => {
    setSelectedCustomerForProduct(customer)
    setIsProductModalOpen(true)
    setUseCustomAddress(false) // Modalı her açtığında sıfırla
    setCustomAddress('') // Modalı her açtığında sıfırla
  }

  // Müşterinin ürünlerini getir
  const getCustomerProducts = (customerId: string) => {
    return customerProducts.filter(cp => cp.customerId === customerId)
  }

  const handleSaveCustomer = async () => {
    if (!currentCustomer?.firstName || !currentCustomer?.lastName || !currentCustomer?.email || !currentCustomer?.phone1) {
      alert("Ad, Soyad, E-posta ve Telefon 1 alanları zorunludur.")
      return
    }
    setIsLoading(true)
    try {
      const dataToSave = { ...currentCustomer }
      if (dataToSave.id) {
        const customerRef = doc(db, 'customers', dataToSave.id)
        delete dataToSave.id // ID'yi güncelleme verisinden çıkar
        await updateDoc(customerRef, dataToSave)
      } else {
        await addDoc(collection(db, 'customers'), { ...dataToSave, createdAt: new Date() })
      }
      await fetchCustomers()
      setIsModalOpen(false)
      setCurrentCustomer(null)
    } catch (err) {
      console.error("Müşteri kaydedilirken hata:", err)
      setError("Müşteri kaydedilemedi.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteCustomer = async (id: string) => {
    if (!window.confirm("Bu müşteriyi kalıcı olarak silmek istediğinizden emin misiniz?")) return
    try {
      await deleteDoc(doc(db, 'customers', id))
      await fetchCustomers()
    } catch (err) {
      console.error("Müşteri silinirken hata:", err)
      setError("Müşteri silinemedi.")
    }
  }
  
  const openModal = (customer?: Customer) => {
    setCurrentCustomer(customer ? { ...customer } : {
      firstName: '', lastName: '', tckn: '', birthDate: '', birthPlace: '', gender: 'Diğer', fatherName: '', motherName: '', nationality: 'T.C.',
      idType: 'TC Kimlik Kartı', idNumber: '', occupation: '', education: 'Lise', dataProcessingConsent: false, communicationConsent: false,
      status: 'Aktif', firstActivationDate: new Date().toISOString().split('T')[0], email: '', phone1: '',
      address: '', city: '' // Yeni alanlar için başlangıç değeri
    })
    setIsModalOpen(true)
  }

  const openViewModal = (customer: Customer) => {
    setViewCustomer(customer)
    setIsViewModalOpen(true)
  }
  
  const openStatusModal = (product: CustomerProduct) => {
    setProductToUpdate(product);
    setNewStatus(product.status);
    setIsStatusModalOpen(true);
  };

  const filteredCustomers = useMemo(() => {
    const isFiltering = nameSearch || tcknSearch || citySearch || statusFilter !== 'all'

    let result = customers

    if (isFiltering) {
      result = customers.filter(customer => {
        const nameMatch = nameSearch ? `${customer.firstName} ${customer.lastName}`.toLowerCase().includes(nameSearch.toLowerCase()) : true
        const tcknMatch = tcknSearch ? customer.tckn.includes(tcknSearch) : true
        const cityMatch = citySearch ? customer.city.toLowerCase().includes(citySearch.toLowerCase()) : true
        const statusMatch = statusFilter !== 'all' ? customer.status === statusFilter : true
        return nameMatch && tcknMatch && cityMatch && statusMatch
      })
    } else {
      // Filtreleme yoksa sadece son 10 taneyi göster
      result = customers.slice(0, 10)
    }
    
    return result
  }, [customers, nameSearch, tcknSearch, citySearch, statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Müşteriler</h1>
          <p className="text-gray-600 dark:text-gray-300">Müşteri bilgileri ve yönetimi</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary flex items-center">
          <Plus className="h-4 w-4 mr-2" /> Yeni Müşteri
        </button>
      </div>

      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input type="text" placeholder="Ad Soyad ile Ara..." className="input" value={nameSearch} onChange={e => setNameSearch(e.target.value)} />
          <input type="text" placeholder="TCKN ile Ara..." className="input" value={tcknSearch} onChange={e => setTcknSearch(e.target.value)} />
          <input type="text" placeholder="Şehir ile Ara..." className="input" value={citySearch} onChange={e => setCitySearch(e.target.value)} />
          <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Tüm Durumlar</option>
            {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? <p>Yükleniyor...</p> : filteredCustomers.map((customer) => {
          const customerProductsList = getCustomerProducts(customer.id)
          const isExpanded = expandedCustomerId === customer.id
          
          return (
            <div key={customer.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-medium">{customer.firstName} {customer.lastName}</h3>
                  <p className={`text-sm font-semibold ${customer.status === 'Aktif' ? 'text-green-500' : customer.status === 'Yasaklı' ? 'text-red-500' : 'text-gray-500'}`}>{customer.status}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openViewModal(customer)} className="text-green-500 hover:text-green-700" title="Bilgileri Göster">
                    <Eye size={16}/>
                  </button>
                  <button onClick={() => openProductModal(customer)} className="text-purple-500 hover:text-purple-700" title="Ürün Tanımla">
                    <Package size={16}/>
                  </button>
                  <button onClick={() => openModal(customer)} className="text-blue-500 hover:text-blue-700" title="Düzenle">
                    <Edit size={16}/>
                  </button>
                  <button onClick={() => handleDeleteCustomer(customer.id)} className="text-red-500 hover:text-red-700" title="Sil">
                    <Trash2 size={16}/>
                  </button>
                </div>
              </div>
              
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 mr-2" />
                  {customer.email}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 mr-2" />
                  {customer.phone1}
                </div>
              </div>

              {/* Ürün Listesi */}
              {customerProductsList.length > 0 && (
                <div className="mt-4 border-t border-gray-700 pt-4">
                  <button 
                    onClick={() => setExpandedCustomerId(isExpanded ? null : customer.id)}
                    className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-300 hover:text-white"
                  >
                    <span className="flex items-center">
                      <Package className="h-4 w-4 mr-2" />
                      <span style={{ opacity: 1 }}>Tanımlı Ürünler ({customerProductsList.length})</span>
                    </span>
                    {isExpanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                  </button>
                  
                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      {customerProductsList.map((product) => (
                        <div 
                          key={product.id} 
                          className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 relative"
                          onContextMenu={(e) => handleContextMenu(e, product)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="font-medium text-sm">{product.productName}</h4>
                              <p className="text-xs text-gray-500 mt-1">
                                Devre No: <span className="font-mono font-bold text-blue-600">{product.circuitNumber}</span>
                              </p>
                              <p className="text-xs text-gray-500">
                                Fiyat: {product.productPrice.toLocaleString('tr-TR')} ₺
                              </p>
                              <p className="text-xs text-gray-500">
                                Atanma: {product.assignedAt.toLocaleDateString('tr-TR')}
                              </p>
                              {product.activationDate && (
                                <p className="text-xs text-gray-500 flex items-center">
                                  <Clock className="h-3 w-3 mr-1"/> Aktivasyon: {new Date(product.activationDate).toLocaleDateString('tr-TR')}
                                </p>
                              )}
                              {product.productAddress && (
                                <p className="text-xs text-gray-500 mt-1 flex items-start">
                                  <MapPin className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0"/>
                                  <span className="truncate">Hizmet Adresi: {product.productAddress}</span>
                                </p>
                              )}
                              <span className={`inline-block px-2 py-1 text-xs rounded-full mt-2 ${
                                product.status === 'Aktif' ? 'bg-green-100 text-green-800' : 
                                product.status === 'Pasif' ? 'bg-gray-100 text-gray-800' : 
                                'bg-red-100 text-red-800'
                              }`}>
                                {product.status}
                              </span>
                            </div>
                          </div>
                          {product.notes && (
                            <div className="mt-2 text-xs text-gray-600 bg-white dark:bg-gray-600 p-2 rounded">
                              <strong>Not:</strong> {product.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-6">{currentCustomer?.id ? 'Müşteriyi Düzenle' : 'Yeni Müşteri Oluştur'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Kolon 1 */}
              <div className="space-y-4">
                <input type="text" placeholder="Ad *" value={currentCustomer?.firstName || ''} onChange={e => setCurrentCustomer({...currentCustomer, firstName: e.target.value})} className="input" />
                <input type="text" placeholder="Soyad *" value={currentCustomer?.lastName || ''} onChange={e => setCurrentCustomer({...currentCustomer, lastName: e.target.value})} className="input" />
                <input type="text" placeholder="TCKN" value={currentCustomer?.tckn || ''} onChange={e => setCurrentCustomer({...currentCustomer, tckn: e.target.value})} className="input" />
                <input type="text" placeholder="Baba Adı" value={currentCustomer?.fatherName || ''} onChange={e => setCurrentCustomer({...currentCustomer, fatherName: e.target.value})} className="input" />
                <input type="text" placeholder="Anne Adı" value={currentCustomer?.motherName || ''} onChange={e => setCurrentCustomer({...currentCustomer, motherName: e.target.value})} className="input" />
                <input type="text" placeholder="Doğum Yeri" value={currentCustomer?.birthPlace || ''} onChange={e => setCurrentCustomer({...currentCustomer, birthPlace: e.target.value})} className="input" />
                <input type="text" placeholder="Yaşadığı Şehir" value={currentCustomer?.city || ''} onChange={e => setCurrentCustomer({...currentCustomer, city: e.target.value})} className="input" />
                <label className="text-sm text-gray-500">Doğum Tarihi</label>
                <input type="date" value={currentCustomer?.birthDate || ''} onChange={e => setCurrentCustomer({...currentCustomer, birthDate: e.target.value})} className="input" />
              </div>
              {/* Kolon 2 */}
              <div className="space-y-4">
                <select value={currentCustomer?.gender || 'Diğer'} onChange={e => setCurrentCustomer({...currentCustomer, gender: e.target.value as any})} className="input">
                  {genderOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <input type="text" placeholder="Uyruk" value={currentCustomer?.nationality || ''} onChange={e => setCurrentCustomer({...currentCustomer, nationality: e.target.value})} className="input" />
                <select value={currentCustomer?.idType || 'TC Kimlik Kartı'} onChange={e => setCurrentCustomer({...currentCustomer, idType: e.target.value as any})} className="input">
                  {idTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <input type="text" placeholder="Kimlik Belge No" value={currentCustomer?.idNumber || ''} onChange={e => setCurrentCustomer({...currentCustomer, idNumber: e.target.value})} className="input" />
                <input type="text" placeholder="Meslek" value={currentCustomer?.occupation || ''} onChange={e => setCurrentCustomer({...currentCustomer, occupation: e.target.value})} className="input" />
                 <select value={currentCustomer?.education || 'Lise'} onChange={e => setCurrentCustomer({...currentCustomer, education: e.target.value as any})} className="input">
                  {educationOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <select value={currentCustomer?.status || 'Aktif'} onChange={e => setCurrentCustomer({...currentCustomer, status: e.target.value as any})} className="input">
                  {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              {/* Kolon 3 */}
              <div className="space-y-4">
                <input type="email" placeholder="E-Mail *" value={currentCustomer?.email || ''} onChange={e => setCurrentCustomer({...currentCustomer, email: e.target.value})} className="input" />
                <input type="tel" placeholder="Telefon Numarası 1 *" value={currentCustomer?.phone1 || ''} onChange={e => setCurrentCustomer({...currentCustomer, phone1: e.target.value})} className="input" />
                <input type="tel" placeholder="Telefon Numarası 2" value={currentCustomer?.phone2 || ''} onChange={e => setCurrentCustomer({...currentCustomer, phone2: e.target.value})} className="input" />
                <input type="tel" placeholder="Yedek Telefon Numarası" value={currentCustomer?.backupPhone || ''} onChange={e => setCurrentCustomer({...currentCustomer, backupPhone: e.target.value})} className="input" />
                <label className="text-sm text-gray-500">İlk Aktivasyon Tarihi</label>
                <input type="date" value={currentCustomer?.firstActivationDate || ''} onChange={e => setCurrentCustomer({...currentCustomer, firstActivationDate: e.target.value})} className="input" />
                <label className="text-sm text-gray-500">Deaktivasyon Tarihi (Opsiyonel)</label>
                <input type="date" value={currentCustomer?.deactivationDate || ''} onChange={e => setCurrentCustomer({...currentCustomer, deactivationDate: e.target.value})} className="input" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={currentCustomer?.dataProcessingConsent || false} onChange={e => setCurrentCustomer({...currentCustomer, dataProcessingConsent: e.target.checked})} className="h-4 w-4 rounded" />
                  Kişisel Veri İşleme İzni
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={currentCustomer?.communicationConsent || false} onChange={e => setCurrentCustomer({...currentCustomer, communicationConsent: e.target.checked})} className="h-4 w-4 rounded" />
                  İletişim İzni Onayı
                </label>
                <textarea placeholder="Açık Adres" value={currentCustomer?.address || ''} onChange={e => setCurrentCustomer({...currentCustomer, address: e.target.value})} className="input" rows={3}></textarea>
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-8">
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>İptal</button>
              <button className="btn-primary" onClick={handleSaveCustomer} disabled={isLoading}>{isLoading ? 'Kaydediliyor...' : 'Kaydet'}</button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {isViewModalOpen && viewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Müşteri Detayları</h2>
              <button 
                onClick={() => setIsViewModalOpen(false)} 
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Kişisel Bilgiler */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-blue-600 border-b pb-2">Kişisel Bilgiler</h3>
                <div>
                  <label className="text-sm text-gray-500">Ad Soyad</label>
                  <p className="font-medium">{viewCustomer.firstName} {viewCustomer.lastName}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">TC Kimlik No</label>
                  <p className="font-medium">{viewCustomer.tckn || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Cinsiyet</label>
                  <p className="font-medium">{viewCustomer.gender}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Doğum Tarihi</label>
                  <p className="font-medium">{viewCustomer.birthDate || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Doğum Yeri</label>
                  <p className="font-medium">{viewCustomer.birthPlace || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Baba Adı</label>
                  <p className="font-medium">{viewCustomer.fatherName || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Anne Adı</label>
                  <p className="font-medium">{viewCustomer.motherName || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Uyruk</label>
                  <p className="font-medium">{viewCustomer.nationality || 'Belirtilmemiş'}</p>
                </div>
              </div>

              {/* Kimlik ve İletişim Bilgileri */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-green-600 border-b pb-2">Kimlik ve İletişim</h3>
                <div>
                  <label className="text-sm text-gray-500">Kimlik Türü</label>
                  <p className="font-medium">{viewCustomer.idType}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Kimlik No</label>
                  <p className="font-medium">{viewCustomer.idNumber || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">E-posta</label>
                  <p className="font-medium">{viewCustomer.email}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Telefon 1</label>
                  <p className="font-medium">{viewCustomer.phone1}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Telefon 2</label>
                  <p className="font-medium">{viewCustomer.phone2 || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Yedek Telefon</label>
                  <p className="font-medium">{viewCustomer.backupPhone || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Şehir</label>
                  <p className="font-medium">{viewCustomer.city || 'Belirtilmemiş'}</p>
                </div>
              </div>

              {/* Diğer Bilgiler */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-purple-600 border-b pb-2">Diğer Bilgiler</h3>
                <div>
                  <label className="text-sm text-gray-500">Meslek</label>
                  <p className="font-medium">{viewCustomer.occupation || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Eğitim</label>
                  <p className="font-medium">{viewCustomer.education}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Müşteri Durumu</label>
                  <p className={`font-medium ${viewCustomer.status === 'Aktif' ? 'text-green-500' : viewCustomer.status === 'Yasaklı' ? 'text-red-500' : 'text-gray-500'}`}>
                    {viewCustomer.status}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">İlk Aktivasyon</label>
                  <p className="font-medium">{viewCustomer.firstActivationDate || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Deaktivasyon</label>
                  <p className="font-medium">{viewCustomer.deactivationDate || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Kayıt Tarihi</label>
                  <p className="font-medium">{viewCustomer.createdAt.toLocaleDateString('tr-TR')}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">İzinler</label>
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className={viewCustomer.dataProcessingConsent ? 'text-green-500' : 'text-red-500'}>
                        {viewCustomer.dataProcessingConsent ? '✓' : '✗'}
                      </span> Kişisel Veri İşleme
                    </p>
                    <p className="text-sm">
                      <span className={viewCustomer.communicationConsent ? 'text-green-500' : 'text-red-500'}>
                        {viewCustomer.communicationConsent ? '✓' : '✗'}
                      </span> İletişim İzni
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Açık Adres - Tam Genişlik */}
            {viewCustomer.address && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-orange-600 border-b pb-2 mb-3">Açık Adres</h3>
                <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  {viewCustomer.address}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-4 mt-8">
              <button 
                className="btn-secondary" 
                onClick={() => setIsViewModalOpen(false)}
              >
                Kapat
              </button>
              <button 
                className="btn-primary" 
                onClick={() => {
                  setIsViewModalOpen(false)
                  openModal(viewCustomer)
                }}
              >
                Düzenle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ürün Atama Modal */}
      {isProductModalOpen && selectedCustomerForProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Ürün Atama</h2>
              <button 
                onClick={() => setIsProductModalOpen(false)} 
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Müşteri Bilgileri</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {selectedCustomerForProduct.firstName} {selectedCustomerForProduct.lastName} - {selectedCustomerForProduct.tckn}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Sol Kolon - Ürün ve Adres Seçimi */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Ürün Seçimi</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Mevcut Ürünler
                    </label>
                    <select 
                      value={selectedProduct} 
                      onChange={e => setSelectedProduct(e.target.value)} 
                      className="input w-full"
                    >
                      <option value="">Ürün Seçin</option>
                      {products.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name} - {product.speed}Mbps - {product.price}₺
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Seçilen Ürün Detayları */}
                  {selectedProduct && (() => {
                    const selectedProductData = products.find(p => p.id === selectedProduct)
                    return selectedProductData ? (
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Seçilen Ürün Detayları</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Ürün Adı:</span>
                            <span className="font-medium">{selectedProductData.name}</span>
                          </div>
                          {selectedProductData.speed && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Hız:</span>
                              <span className="font-medium">{selectedProductData.speed} Mbps</span>
                            </div>
                          )}
                          {selectedProductData.type && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Tür:</span>
                              <span className="font-medium">{selectedProductData.type}</span>
                            </div>
                          )}
                          {selectedProductData.commitment && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Taahhüt:</span>
                              <span className="font-medium">{selectedProductData.commitment} Ay</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Fiyat:</span>
                            <span className="font-medium text-green-600">{selectedProductData.price.toLocaleString('tr-TR')} ₺</span>
                          </div>
                        </div>
                      </div>
                    ) : null
                  })()}
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Hizmet Adresi</h3>
                  <div className="space-y-4">
                    <div 
                      onClick={() => setUseCustomAddress(false)}
                      className={`p-4 rounded-lg border cursor-pointer ${!useCustomAddress ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-300 dark:border-gray-600'}`}
                    >
                      <label className="flex items-center">
                        <input 
                          type="radio" 
                          name="addressOption"
                          checked={!useCustomAddress}
                          onChange={() => setUseCustomAddress(false)}
                          className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <div className="ml-3">
                          <span className="block text-sm font-medium">Ana Adresi Kullan</span>
                          <span className="block text-xs text-gray-500 truncate">{selectedCustomerForProduct.address || "Ana adres tanımlanmamış"}</span>
                        </div>
                      </label>
                    </div>
                    <div 
                      onClick={() => setUseCustomAddress(true)}
                      className={`p-4 rounded-lg border cursor-pointer ${useCustomAddress ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-300 dark:border-gray-600'}`}
                    >
                      <label className="flex items-center">
                        <input 
                          type="radio" 
                          name="addressOption"
                          checked={useCustomAddress}
                          onChange={() => setUseCustomAddress(true)}
                          className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="ml-3 block text-sm font-medium">Farklı bir hizmet adresi gir</span>
                      </label>
                      {useCustomAddress && (
                        <div className="mt-4">
                          <textarea 
                            value={customAddress}
                            onChange={(e) => setCustomAddress(e.target.value)}
                            className="input w-full"
                            rows={3}
                            placeholder="Ürünün kurulacağı yeni adresi girin..."
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sağ Kolon - Notlar ve Bilgiler */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Ek Bilgiler</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ürün Notları
                  </label>
                  <textarea 
                    value={productNotes} 
                    onChange={e => setProductNotes(e.target.value)} 
                    className="input w-full" 
                    rows={4} 
                    placeholder="Ürün ile ilgili özel notlar, kurulum bilgileri vb..."
                  ></textarea>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Önemli Bilgiler</h4>
                  <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                    <li>• Ürün atandıktan sonra benzersiz bir devre numarası oluşturulacak</li>
                    <li>• Devre numarası sistem tarafından otomatik oluşturulur</li>
                    <li>• Atanan ürünler müşteri kartında görüntülenebilir</li>
                    <li>• Ürün durumu "Aktif" olarak başlatılır</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-8 pt-6 border-t">
              <button 
                className="btn-secondary" 
                onClick={() => {
                  setIsProductModalOpen(false)
                  setSelectedCustomerForProduct(null)
                  setSelectedProduct('')
                  setProductNotes('')
                }}
              >
                İptal
              </button>
              <button 
                className="btn-primary" 
                onClick={handleAssignProduct}
                disabled={!selectedProduct || (useCustomAddress && !customAddress)}
              >
                Ürün Ata
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YENİ: Sağ Tık Menüsü */}
      {contextMenu && (
        <div 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-2 w-56 border border-gray-200 dark:border-gray-700"
        >
          <div className="px-4 py-2 border-b">
            <p className="text-sm font-medium">{contextMenu.product.productName}</p>
            <p className="text-xs text-gray-500">{contextMenu.product.circuitNumber}</p>
          </div>
          <ul>
            <li>
              <a href="#" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={() => alert('Paket Değişikliği - Henüz Aktif Değil')}>Paket Değişikliği</a>
            </li>
            <li>
              <a href="#" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={() => alert('Devre No/Clid Güncelleme - Henüz Aktif Değil')}>Devre No/Clid Güncelleme</a>
            </li>
            <li>
              <a href="#" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={() => alert('Nakil - Henüz Aktif Değil')}>Nakil</a>
            </li>
            <li>
              <a href="#" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={() => openStatusModal(contextMenu.product)}>Durum Güncelleme</a>
            </li>
          </ul>
        </div>
      )}

      {/* YENİ: Ürün Durumu Güncelleme Modal */}
      {isStatusModalOpen && productToUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Ürün Durumu Güncelleme</h2>
              <button 
                onClick={() => setIsStatusModalOpen(false)} 
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="mb-4">
              <p><span className="font-medium">Müşteri:</span> {customers.find(c => c.id === productToUpdate.customerId)?.firstName} {customers.find(c => c.id === productToUpdate.customerId)?.lastName}</p>
              <p><span className="font-medium">Ürün:</span> {productToUpdate.productName}</p>
              <p><span className="font-medium">Devre No:</span> {productToUpdate.circuitNumber}</p>
            </div>

            <div className="space-y-4">
               <div>
                 <label className="text-sm text-gray-500 mb-1 block">Ürün Durumu</label>
                 <select 
                   value={newStatus} 
                   onChange={e => setNewStatus(e.target.value as CustomerProduct['status'])} 
                   className="input w-full"
                 >
                   {productStatusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                 </select>
               </div>
            </div>

            <div className="flex justify-end gap-4 mt-8 pt-6 border-t">
              <button 
                className="btn-secondary" 
                onClick={() => setIsStatusModalOpen(false)}
              >
                İptal
              </button>
              <button 
                className="btn-primary" 
                onClick={handleUpdateProductStatus}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 