import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Role {
  id: string;
  name: string;
  description: string;
}

export default function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<Partial<Role> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();

  // =================================================================================
  // YENİ: Yetki Kontrolleri
  // =================================================================================
  const permissions = useMemo(() => {
    // Admin her şeye yetkilidir (büyük/küçük harf duyarsız kontrol).
    if (user?.role?.toLowerCase() === 'admin') {
      return {
        canAddNewRole: true,
        canUpdateRole: true,
        canDeleteRole: true,
      };
    }
    // 'role_management' yetkisi bir nesne ise, alt yetkileri kullan, değilse hiçbir şeye izin verme.
    const roleMgmtPerms = user?.permissions?.role_management;
    return {
      canAddNewRole: typeof roleMgmtPerms === 'object' && roleMgmtPerms.canAddNewRole,
      canUpdateRole: typeof roleMgmtPerms === 'object' && roleMgmtPerms.canUpdateRole,
      canDeleteRole: typeof roleMgmtPerms === 'object' && roleMgmtPerms.canDeleteRole,
    };
  }, [user]);
  // =================================================================================

  // Test Firestore connection
  const testFirestoreConnection = async () => {
    try {
      console.log('Testing Firestore connection...');
      const testCollection = collection(db, 'test');
      const testDoc = await addDoc(testCollection, { 
        test: true, 
        timestamp: new Date() 
      });
      console.log('Test document created with ID:', testDoc.id);
      
      // Delete the test document
      await deleteDoc(doc(db, 'test', testDoc.id));
      console.log('Test document deleted successfully');
      
      console.log('Firestore connection test passed!');
      return true;
    } catch (error) {
      console.error('Firestore connection test failed:', error);
      setError(`Firestore bağlantı hatası: ${error}`);
      return false;
    }
  };

  useEffect(() => {
    const initializePage = async () => {
      setIsLoading(true);
      setError(null);
      
      // Test Firestore connection first
      const connectionOk = await testFirestoreConnection();
      if (!connectionOk) {
        setIsLoading(false);
        return;
      }

      try {
        console.log('Fetching roles from Firestore...');
        const rolesCollection = collection(db, 'roles');
        console.log('Collection reference created:', rolesCollection);
        
        const rolesSnapshot = await getDocs(rolesCollection);
        console.log('Snapshot received, docs count:', rolesSnapshot.docs.length);
        
        const rolesList = rolesSnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('Role data:', { id: doc.id, ...data });
          return { id: doc.id, ...data } as Role;
        });
        
        console.log('Final roles list:', rolesList);
        setRoles(rolesList);
      } catch (error) {
        console.error("Error fetching roles: ", error);
        setError(`Roller yüklenirken hata oluştu: ${error}`);
      }
      setIsLoading(false);
    };

    initializePage();
  }, []);

  const handleSaveRole = async () => {
    if (!currentRole || !currentRole.name) {
      setError('Rol adı gereklidir');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (currentRole.id) {
        // Update existing role
        console.log('Updating role:', currentRole);
        const roleDoc = doc(db, 'roles', currentRole.id);
        await updateDoc(roleDoc, { 
          name: currentRole.name, 
          description: currentRole.description || '' 
        });
        console.log('Role updated successfully');
        setRoles(roles.map(r => r.id === currentRole.id ? { ...r, ...currentRole } : r));
      } else {
        // Add new role
        console.log('Adding new role:', currentRole);
        const rolesCollection = collection(db, 'roles');
        const roleData = { 
          name: currentRole.name, 
          description: currentRole.description || '',
          createdAt: new Date()
        };
        console.log('Role data to save:', roleData);
        
        const docRef = await addDoc(rolesCollection, roleData);
        console.log('Role added successfully with ID:', docRef.id);
        
        const newRole = { 
          id: docRef.id, 
          name: currentRole.name, 
          description: currentRole.description || '' 
        };
        setRoles([...roles, newRole]);
      }
    } catch (error) {
      console.error("Error saving role: ", error);
      setError(`Rol kaydedilirken hata oluştu: ${error}`);
    }
    setIsLoading(false);
    setIsModalOpen(false);
    setCurrentRole(null);
  };

  const handleDeleteRole = async (id: string) => {
    if (!window.confirm("Bu rolü silmek istediğinizden emin misiniz?")) return;
    
    setIsLoading(true);
    setError(null);
    try {
      console.log('Deleting role with ID:', id);
      const roleDoc = doc(db, 'roles', id);
      await deleteDoc(roleDoc);
      console.log('Role deleted successfully');
      setRoles(roles.filter(r => r.id !== id));
    } catch (error) {
      console.error("Error deleting role: ", error);
      setError(`Rol silinirken hata oluştu: ${error}`);
    }
    setIsLoading(false);
  };

  const openModal = (role: Partial<Role> | null = null) => {
    setCurrentRole(role ? { ...role } : { name: '', description: '' });
    setIsModalOpen(true);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Rol Yönetimi</h1>
          <p className="text-gray-600 dark:text-gray-300">Sistemdeki kullanıcı rollerini yönetin.</p>
        </div>
        {permissions.canAddNewRole && (
          <button className="btn-primary flex items-center" onClick={() => openModal()}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Rol Ekle
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          {isLoading && roles.length === 0 ? (
            <p className="text-center py-4 dark:text-gray-300">Roller yükleniyor...</p>
          ) : roles.length === 0 ? (
            <p className="text-center py-4 dark:text-gray-300">Henüz rol bulunmuyor. Yeni bir rol ekleyin.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rol Adı</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Açıklama</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlemler</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{role.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{role.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {permissions.canUpdateRole && (
                        <button onClick={() => openModal(role)} className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300">
                          <Edit className="h-4 w-4 inline-block mr-4" />
                        </button>
                      )}
                      {permissions.canDeleteRole && (
                        <button onClick={() => handleDeleteRole(role.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">
                          <Trash2 className="h-4 w-4 inline-block" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen && currentRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">{currentRole.id ? 'Rolü Düzenle' : 'Yeni Rol Ekle'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol Adı *</label>
                <input
                  type="text"
                  value={currentRole.name}
                  onChange={(e) => setCurrentRole({ ...currentRole, name: e.target.value })}
                  className="input-field"
                  placeholder="Örn: Admin, Operatör"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Açıklama</label>
                <textarea
                  value={currentRole.description}
                  onChange={(e) => setCurrentRole({ ...currentRole, description: e.target.value })}
                  className="input-field"
                  rows={3}
                  placeholder="Bu rolün ne işe yaradığını açıklayın."
                />
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>İptal</button>
              <button className="btn-primary" onClick={handleSaveRole} disabled={isLoading || !currentRole.name}>
                {isLoading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 