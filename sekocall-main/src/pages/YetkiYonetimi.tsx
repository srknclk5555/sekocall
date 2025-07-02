import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { APP_MODULES, AppModule } from '../config/modules';
import { X } from 'lucide-react';

// Arayüzler
interface Role {
  id: string;
  name: string;
  permissions?: { [key: string]: boolean | { [key: string]: boolean } };
}

// Modal Bileşeni
const PermissionsModal = ({ role, onClose, onSave }: { role: Role; onClose: () => void; onSave: (roleId: string, permissions: Role['permissions']) => Promise<void> }) => {
  const [permissions, setPermissions] = useState(
    typeof role.permissions === "object" && role.permissions !== null && !Array.isArray(role.permissions)
      ? role.permissions
      : {}
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleParentChange = (module: AppModule, isChecked: boolean) => {
    setPermissions(prev => {
      const safePrev = typeof prev === "object" && prev !== null && !Array.isArray(prev) ? prev : {};
      const newPermissions = { ...safePrev };
      if (isChecked) {
        if (module.subPermissions && module.subPermissions.length > 0) {
          if (typeof newPermissions[module.id] !== 'object' || newPermissions[module.id] === null) {
            newPermissions[module.id] = {};
          }
          module.subPermissions.forEach(sub => {
            (newPermissions[module.id] as { [key: string]: boolean })[sub.id] = true;
          });
        } else {
          newPermissions[module.id] = true;
        }
      } else {
        delete newPermissions[module.id];
      }
      return newPermissions;
    });
  };

  const handleSubPermissionChange = (moduleId: string, subId: string, isChecked: boolean) => {
    setPermissions(prev => {
      const safePrev = typeof prev === "object" && prev !== null && !Array.isArray(prev) ? prev : {};
      const newPermissions = { ...safePrev };
      const modulePermissions = typeof newPermissions[moduleId] === "object" && newPermissions[moduleId] !== null && !Array.isArray(newPermissions[moduleId])
        ? newPermissions[moduleId] as { [key: string]: boolean }
        : {};
      modulePermissions[subId] = isChecked;
      newPermissions[moduleId] = modulePermissions;
      return newPermissions;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(role.id, permissions);
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">"{role.name}" Rolü Yetkilerini Düzenle</h2>
          <button onClick={onClose}><X className="h-6 w-6 text-gray-500" /></button>
        </div>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {APP_MODULES.map(module => (
            <div key={module.id} className="p-3 rounded-md bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!permissions[module.id]}
                  onChange={(e) => handleParentChange(module, e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-3 font-semibold text-gray-800 dark:text-gray-200">{module.name}</span>
              </label>
              
              {/* Alt Yetkiler */}
              {module.subPermissions && permissions[module.id] && (
                <div className="mt-3 pl-8 space-y-2 border-l-2 border-gray-200 dark:border-gray-600 ml-2">
                  {module.subPermissions.map(sub => {
                    const modulePerms = permissions[module.id];
                    const isChecked = typeof modulePerms === 'object' && modulePerms[sub.id] === true;
                    return (
                      <label key={sub.id} className="flex items-center cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleSubPermissionChange(module.id, sub.id, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-500 focus:ring-indigo-400"
                        />
                        <span className="ml-2 text-gray-700 dark:text-gray-300">{sub.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-4 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">İptal</button>
          <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-blue-300">
            {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Ana Sayfa Bileşeni
const YetkiYonetimi = () => {
  const [view, setView] = useState('main'); // 'main' veya 'roles'
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  useEffect(() => {
    if (view === 'roles') {
      const fetchRoles = async () => {
        setLoading(true);
        try {
          const rolesSnapshot = await getDocs(collection(db, 'roles'));
          const rolesList = rolesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Role));
          setRoles(rolesList);
        } catch (error) {
          console.error("Roller çekilirken hata oluştu:", error);
          alert("Roller çekilirken bir hata oluştu.");
        } finally {
          setLoading(false);
        }
      };
      fetchRoles();
    }
  }, [view]);

  const handleEditPermissions = (role: Role) => {
    setSelectedRole(role);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRole(null);
  };

  const handleSavePermissions = async (roleId: string, permissions: Role['permissions']) => {
    try {
      const roleRef = doc(db, 'roles', roleId);
      await updateDoc(roleRef, { permissions });
      // State'i de güncelle
      setRoles(prevRoles => prevRoles.map(r => r.id === roleId ? { ...r, permissions } : r));
      alert("Yetkiler başarıyla güncellendi!");
    } catch (error) {
      console.error("Yetkiler kaydedilirken hata oluştu:", error);
      alert("Yetkiler kaydedilirken bir hata oluştu.");
    }
  };

  const renderMainView = () => (
    <div>
      <h1 className="text-2xl font-bold mb-6">Yetki Yönetimi</h1>
      <div className="flex gap-4">
        <button
          onClick={() => setView('roles')}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Rollere Yetki Ver
        </button>
        <button
          disabled
          className="bg-gray-400 text-white font-bold py-2 px-4 rounded cursor-not-allowed"
        >
          Kullanıcıya Yetki Ver (Yakında)
        </button>
      </div>
    </div>
  );

  const renderRolesView = () => (
    <div>
      <button onClick={() => setView('main')} className="mb-4 text-blue-500 hover:underline">&larr; Geri</button>
      <h1 className="text-2xl font-bold mb-6">Rollere Yetki Ata</h1>
      {loading ? <p>Roller yükleniyor...</p> : (
        <div className="space-y-4">
          {roles.map(role => (
            <div key={role.id} className="p-4 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg flex justify-between items-center shadow-sm">
              <span className="font-semibold text-lg text-gray-800 dark:text-gray-200">{role.name}</span>
              <button
                onClick={() => handleEditPermissions(role)}
                title={role.name.toLowerCase() === 'admin' ? "Admin rolünün yetkileri artık düzenlenebilir." : "Yetkileri Düzenle"}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition-colors duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Yetkileri Düzenle
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
      {view === 'main' ? renderMainView() : renderRolesView()}
      {isModalOpen && selectedRole && (
        <PermissionsModal
          role={selectedRole}
          onClose={handleCloseModal}
          onSave={handleSavePermissions}
        />
      )}
    </div>
  );
};

export default YetkiYonetimi; 