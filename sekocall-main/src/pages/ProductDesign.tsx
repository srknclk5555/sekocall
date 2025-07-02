import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, Wifi, Tv, Globe, Router } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

interface InternetPackage {
  id: string;
  name: string;
  speed: number;
  type: 'Fiber' | 'DSL' | 'VDSL' | 'FTTH';
  commitment: number;
  price: number;
  createdAt: Date;
}

interface ServiceCard {
  id: string;
  type: 'internet' | 'tv' | 'static_ip' | 'modem';
  title: string;
  description: string;
  price: number;
  icon: React.ReactNode;
  isActive: boolean;
}

export default function ProductDesign() {
  const [internetPackages, setInternetPackages] = useState<InternetPackage[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPackage, setCurrentPackage] = useState<Partial<InternetPackage> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { user } = useAuth();

  // =================================================================================
  // YENİ: Yetki Kontrolleri
  // =================================================================================
  const permissions = useMemo(() => {
    if (user?.role?.toLowerCase() === 'admin') {
      return {
        canAddProduct: true,
        canEditProduct: true,
        canDeleteProduct: true,
      };
    }
    const perms = user?.permissions?.product_design;
    return {
      canAddProduct: typeof perms === 'object' && perms.canAddProduct,
      canEditProduct: typeof perms === 'object' && perms.canEditProduct,
      canDeleteProduct: typeof perms === 'object' && perms.canDeleteProduct,
    };
  }, [user]);
  // =================================================================================

  // Service types for modal
  const serviceTypes = [
    { id: 'internet', name: 'İnternet Paketi Tanımlama', icon: <Wifi className="h-5 w-5" />, active: true },
    { id: 'static_ip', name: 'Statik IP Tanımlama', icon: <Globe className="h-5 w-5" />, active: false },
    { id: 'tv', name: 'TV Hizmetleri', icon: <Tv className="h-5 w-5" />, active: false },
    { id: 'modem', name: 'Modem Çeşitleri', icon: <Router className="h-5 w-5" />, active: false },
  ];

  // Internet types for combobox
  const internetTypes = ['Fiber', 'DSL', 'VDSL', 'FTTH'];

  useEffect(() => {
    fetchInternetPackages();
  }, []);

  const fetchInternetPackages = async () => {
    try {
      const packagesCollection = collection(db, 'internet_packages');
      const packagesSnapshot = await getDocs(packagesCollection);
      const packagesList = packagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      } as InternetPackage));
      setInternetPackages(packagesList);
    } catch (error) {
      console.error('Error fetching internet packages:', error);
    }
  };

  const handleSavePackage = async () => {
    if (!currentPackage?.name || !currentPackage?.speed || !currentPackage?.type || !currentPackage?.commitment || !currentPackage?.price) {
      alert('Lütfen tüm alanları doldurun.');
      return;
    }

    setIsLoading(true);
    try {
      if (currentPackage.id) {
        // Update existing package
        const packageRef = doc(db, 'internet_packages', currentPackage.id);
        await updateDoc(packageRef, {
          name: currentPackage.name,
          speed: Number(currentPackage.speed),
          type: currentPackage.type,
          commitment: Number(currentPackage.commitment),
          price: Number(currentPackage.price),
        });
      } else {
        // Add new package
        const packagesCollection = collection(db, 'internet_packages');
        await addDoc(packagesCollection, {
          name: currentPackage.name,
          speed: Number(currentPackage.speed),
          type: currentPackage.type,
          commitment: Number(currentPackage.commitment),
          price: Number(currentPackage.price),
          createdAt: new Date(),
        });
      }
      
      await fetchInternetPackages();
      setIsModalOpen(false);
      setCurrentPackage(null);
    } catch (error) {
      console.error('Error saving package:', error);
      alert('Paket kaydedilirken hata oluştu.');
    }
    setIsLoading(false);
  };

  const handleDeletePackage = async (id: string) => {
    if (!window.confirm('Bu paketi silmek istediğinizden emin misiniz?')) return;

    try {
      const packageRef = doc(db, 'internet_packages', id);
      await deleteDoc(packageRef);
      await fetchInternetPackages();
    } catch (error) {
      console.error('Error deleting package:', error);
      alert('Paket silinirken hata oluştu.');
    }
  };

  const openModal = (pkg?: InternetPackage) => {
    setCurrentPackage(pkg ? { ...pkg } : {
      name: '',
      speed: 0,
      type: 'Fiber',
      commitment: 0,
      price: 0,
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Ürün Tasarım Modülü</h1>
          <p className="text-gray-600 dark:text-gray-300">Müşterilere sunulan hizmetleri yönetin</p>
        </div>
        {permissions.canAddProduct && (
          <button 
            className="btn-primary flex items-center"
            onClick={() => openModal()}
          >
            <Plus className="h-4 w-4 mr-2" />
            Ürün Ekle
          </button>
        )}
      </div>

      {/* Service Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Internet Packages */}
        {internetPackages.map((pkg) => (
          <div key={pkg.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{pkg.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{pkg.speed} Mbps - {pkg.type}</p>
              </div>
              <div className="flex items-center gap-2">
                {permissions.canEditProduct && (
                  <button 
                    onClick={() => openModal(pkg)}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                )}
                {permissions.canDeleteProduct && (
                  <button 
                    onClick={() => handleDeletePackage(pkg.id)}
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">Taahhüt:</span>
                <span className="font-medium">{pkg.commitment} Ay</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">Ücret:</span>
                <span className="font-medium text-green-600 dark:text-green-400">{pkg.price} TL</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Oluşturulma: {pkg.createdAt.toLocaleDateString('tr-TR')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {currentPackage?.id ? 'Paketi Düzenle' : 'Yeni İnternet Paketi'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            {/* Service Type Selection */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Hizmet Türü Seçin</h3>
              <div className="grid grid-cols-2 gap-4">
                {serviceTypes.map((service) => (
                  <button
                    key={service.id}
                    disabled={!service.active}
                    className={`p-4 rounded-lg border-2 text-left transition-colors ${
                      service.active 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {service.icon}
                      <span className="font-medium">{service.name}</span>
                    </div>
                    {!service.active && (
                      <p className="text-xs mt-2 text-gray-500">Yakında aktif olacak</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Internet Package Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Paket Adı *
                </label>
                <input
                  type="text"
                  value={currentPackage?.name || ''}
                  onChange={(e) => setCurrentPackage({ ...currentPackage, name: e.target.value })}
                  className="input-field"
                  placeholder="Örn: Fiber 100 Mbps Paketi"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Paket Hızı (Mbps) *
                  </label>
                  <input
                    type="number"
                    value={currentPackage?.speed || ''}
                    onChange={(e) => setCurrentPackage({ ...currentPackage, speed: Number(e.target.value) })}
                    className="input-field"
                    placeholder="100"
                    min="1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    İnternet Türü *
                  </label>
                  <select
                    value={currentPackage?.type || 'Fiber'}
                    onChange={(e) => setCurrentPackage({ ...currentPackage, type: e.target.value as any })}
                    className="input-field"
                    required
                  >
                    {internetTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Taahhüt Süresi (Ay) *
                  </label>
                  <input
                    type="number"
                    value={currentPackage?.commitment || ''}
                    onChange={(e) => setCurrentPackage({ ...currentPackage, commitment: Number(e.target.value) })}
                    className="input-field"
                    placeholder="12"
                    min="1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ücret (TL) *
                  </label>
                  <input
                    type="number"
                    value={currentPackage?.price || ''}
                    onChange={(e) => setCurrentPackage({ ...currentPackage, price: Number(e.target.value) })}
                    className="input-field"
                    placeholder="199.99"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-6">
              <button 
                className="btn-secondary"
                onClick={() => setIsModalOpen(false)}
              >
                İptal
              </button>
              <button 
                className="btn-primary"
                onClick={handleSavePackage}
                disabled={isLoading}
              >
                {isLoading ? 'Kaydediliyor...' : (currentPackage?.id ? 'Güncelle' : 'Kaydet')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 