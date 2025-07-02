import { useState, useEffect, useMemo } from 'react';
import { db, rtdb } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref as dbRef, onValue, off } from 'firebase/database';
import { Search, Filter, Plus, Edit, Trash2, User, MapPin, Calendar, Hash, Phone, ShieldCheck, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTabManager } from '../contexts/TabManagerContext';
import Messages from './Messages';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string;
  birthDate: string;
  tcNumber: string;
  city: string;
  birthPlace: string;
  callType: 'inbound' | 'outbound' | 'blended';
  createdAt: Date;
  updatedAt: Date;
  groupId?: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
}

interface Group {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
}

interface UserStatus {
  [uid: string]: {
    state: 'online' | 'offline';
    last_changed: number;
  };
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<UserStatus>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<Partial<User> | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [callTypeFilter, setCallTypeFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();
  const { openTab, setActiveTab } = useTabManager();

  const [contextMenu, setContextMenu] = useState<{
    show: boolean;
    x: number;
    y: number;
    userId: string;
  } | null>(null);

  const { user } = useAuth();

  // =================================================================================
  // YENİ: Yetki Kontrolleri
  // =================================================================================
  const permissions = useMemo(() => {
    // Admin her şeye yetkilidir (büyük/küçük harf duyarsız kontrol).
    if (user?.role?.toLowerCase() === 'admin') {
      return {
        canDeleteUser: true,
        canEditUserInfo: true,
        canAssignRole: true,
        canSendMessageToUser: true,
        canAddNewUser: true,
      };
    }
    // 'user_management' yetkisi bir nesne ise, alt yetkileri kullan, değilse hiçbir şeye izin verme.
    const userMgmtPerms = user?.permissions?.user_management;
    return {
      canDeleteUser: typeof userMgmtPerms === 'object' && userMgmtPerms.canDeleteUser,
      canEditUserInfo: typeof userMgmtPerms === 'object' && userMgmtPerms.canEditUserInfo,
      canAssignRole: typeof userMgmtPerms === 'object' && userMgmtPerms.canAssignRole,
      canSendMessageToUser: typeof userMgmtPerms === 'object' && userMgmtPerms.canSendMessageToUser,
      canAddNewUser: typeof userMgmtPerms === 'object' && userMgmtPerms.canAddNewUser,
    };
  }, [user]);
  // =================================================================================

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const rolesCollection = collection(db, 'roles');
        const rolesSnapshot = await getDocs(rolesCollection);
        const rolesList = rolesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Role));
        setRoles(rolesList);

        const usersCollection = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollection);
        const usersList = usersSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date()
          } as User;
        });
        setUsers(usersList);

        // Grupları çek
        const groupsCollection = collection(db, 'workgroups');
        const groupsSnapshot = await getDocs(groupsCollection);
        const groupsList = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
        setGroups(groupsList);
      } catch (error) {
        console.error("Error fetching data: ", error);
        setError(`Veriler yüklenirken hata oluştu: ${error}`);
      }
      setIsLoading(false);
    };

    fetchData();

    const statusRef = dbRef(rtdb, 'status/');
    onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      setOnlineStatus(data || {});
    });

    return () => {
      document.removeEventListener('click', handleClickOutside);
      off(statusRef);
    };
  }, []);

  const handleSaveUser = async () => {
    if (!currentUser || !currentUser.firstName || !currentUser.lastName || !currentUser.email) {
      setError('Ad, soyad ve e-posta alanları gereklidir');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (currentUser.id) {
        const userDoc = doc(db, 'users', currentUser.id);
        await updateDoc(userDoc, { ...currentUser, updatedAt: new Date() });
        setUsers(users.map(u => u.id === currentUser.id ? { ...u, ...currentUser, updatedAt: new Date() } as User : u));
      } else {
        const usersCollection = collection(db, 'users');
        const userData = { ...currentUser, createdAt: new Date(), updatedAt: new Date() };
        const docRef = await addDoc(usersCollection, userData);
        setUsers([...users, { id: docRef.id, ...userData } as User]);
      }
    } catch (error) {
      console.error("Error saving user: ", error);
      setError(`Kullanıcı kaydedilirken hata oluştu: ${error}`);
    }
    setIsLoading(false);
    setIsModalOpen(false);
    setCurrentUser(null);
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm("Bu kullanıcıyı silmek istediğinizden emin misiniz?")) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const userDoc = doc(db, 'users', id);
      await deleteDoc(userDoc);
      setUsers(users.filter(u => u.id !== id));
    } catch (error) {
      console.error("Error deleting user: ", error);
      setError(`Kullanıcı silinirken hata oluştu: ${error}`);
    }
    setIsLoading(false);
  };

  const openModal = (user: Partial<User> | null = null) => {
    setCurrentUser(user ? { ...user } : {
      firstName: '', lastName: '', email: '', role: '', department: '',
      birthDate: '', tcNumber: '', city: '', birthPlace: '', callType: 'inbound', groupId: groups[0]?.id || ''
    });
    setIsModalOpen(true);
    setError(null);
    setContextMenu(null);
  };

  const handleRowClick = (event: React.MouseEvent, userId: string) => {
    event.preventDefault();
    setContextMenu({ show: true, x: event.clientX, y: event.clientY, userId });
  };

  const handleContextMenuClick = (action: string) => {
    if (!contextMenu) return;
    const user = users.find(u => u.id === contextMenu.userId);
    if (user) {
      if (action === 'edit') openModal(user);
      else if (action === 'delete') handleDeleteUser(user.id);
      else if (action === 'assignRole') openRoleModal(user);
      else if (action === 'sendMessage') handleSendMessage(user);
    }
    setContextMenu(null);
  };

  const openRoleModal = (user: User) => {
    setCurrentUser(user);
    setSelectedRole(user.role || '');
    setIsRoleModalOpen(true);
    setContextMenu(null);
  };

  const handleAssignRole = async () => {
    if (!currentUser || !selectedRole) {
      setError('Lütfen bir rol seçin.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const userDoc = doc(db, 'users', currentUser.id!);
      await updateDoc(userDoc, { role: selectedRole, updatedAt: new Date() });
      
      setUsers(users.map(u => 
        u.id === currentUser.id ? { ...u, role: selectedRole, updatedAt: new Date() } as User : u
      ));
      
      setIsRoleModalOpen(false);
      setCurrentUser(null);
    } catch (error) {
      console.error("Error assigning role: ", error);
      setError(`Rol atanırken bir hata oluştu: ${error}`);
    }
    setIsLoading(false);
  };

  const handleSendMessage = (user: User) => {
    openTab({
      key: `/mesajlar-user-${user.id}`,
      title: `Mesajlar (${user.firstName} ${user.lastName})`,
      component: Messages,
      props: { newChatUser: user }
    });
    setActiveTab(`/mesajlar-user-${user.id}`);
  };

  const filteredUsers = users.filter(user => {
    const searchTermLower = searchTerm.toLowerCase();
    return (searchTerm === '' || 
      user.firstName.toLowerCase().includes(searchTermLower) ||
      user.lastName.toLowerCase().includes(searchTermLower) ||
      user.email.toLowerCase().includes(searchTermLower)) &&
      (roleFilter === '' || user.role === roleFilter) &&
      (departmentFilter === '' || user.department === departmentFilter) &&
      (callTypeFilter === '' || user.callType === callTypeFilter);
  });

  const departments = ['Müşteri Hizmetleri', 'Satış', 'Teknik Destek', 'Yönetim', 'İnsan Kaynakları'];
  const callTypes = [
    { value: 'inbound', label: 'Gelen Çağrı' },
    { value: 'outbound', label: 'Giden Çağrı' },
    { value: 'blended', label: 'Karma' }
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="loader"></div>
        <p className="ml-4 text-gray-600 dark:text-gray-300">Kullanıcılar Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Kullanıcı Yönetimi</h1>
          <p className="text-gray-600 dark:text-gray-300">Sistemdeki kullanıcıları yönetin ve rollerini atayın.</p>
        </div>
        {permissions.canAddNewUser && (
          <button className="btn-primary flex items-center" onClick={() => openModal()}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Kullanıcı Ekle
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="card">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Ad, soyad veya e-posta ile ara..."
                className="input pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button className="btn-secondary flex items-center" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            Filtreler
          </button>
        </div>
        
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <select className="input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">Tüm Roller</option>
              {roles.map(role => <option key={role.id} value={role.name}>{role.name}</option>)}
            </select>
            <select className="input" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
              <option value="">Tüm Birimler</option>
              {departments.map(dep => <option key={dep} value={dep}>{dep}</option>)}
            </select>
            <select className="input" value={callTypeFilter} onChange={e => setCallTypeFilter(e.target.value)}>
              <option value="">Tüm Çağrı Tipleri</option>
              {callTypes.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="card p-0">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th scope="col" className="px-6 py-3">Ad Soyad</th>
                <th scope="col" className="px-6 py-3">E-posta</th>
                <th scope="col" className="px-6 py-3">Rol</th>
                <th scope="col" className="px-6 py-3">Çalıştığı Birim</th>
                <th scope="col" className="px-6 py-3">Çağrı Tipi</th>
                <th scope="col" className="px-6 py-3">Şehir</th>
                <th scope="col" className="px-6 py-3">Grup</th>
                <th scope="col" className="px-6 py-3">Durum</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr
                  key={user.id}
                  className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer"
                  onContextMenu={(e) => handleRowClick(e, user.id)}
                >
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-6 py-4">{user.email}</td>
                  <td className="px-6 py-4">{user.role}</td>
                  <td className="px-6 py-4">{user.department}</td>
                  <td className="px-6 py-4">
                     <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                       user.callType === 'inbound' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' :
                       user.callType === 'outbound' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300' :
                       'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
                     }`}>
                       {callTypes.find(c => c.value === user.callType)?.label}
                     </span>
                  </td>
                  <td className="px-6 py-4">{user.city}</td>
                  <td className="px-6 py-4">{groups.find(g => g.id === user.groupId)?.name || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className={`h-2.5 w-2.5 rounded-full mr-2 ${onlineStatus[user.id]?.state === 'online' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      {onlineStatus[user.id]?.state === 'online' ? 'Çevrimiçi' : 'Çevrimdışı'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {contextMenu?.show && (
        <div
          className="absolute z-50 bg-white dark:bg-gray-700 rounded-md shadow-lg border dark:border-gray-600"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <ul className="py-1 text-sm text-gray-700 dark:text-gray-200">
            {permissions.canEditUserInfo && (
              <li>
                <button
                  onClick={() => handleContextMenuClick('edit')}
                  className="w-full text-left flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <User className="h-4 w-4 mr-2" />
                  Kişisel Bilgileri Düzenle
                </button>
              </li>
            )}
            {permissions.canAssignRole && (
              <li>
                <button
                  onClick={() => handleContextMenuClick('assignRole')}
                  className="w-full text-left flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Rol Ata
                </button>
              </li>
            )}
            {permissions.canSendMessageToUser && (
              <li>
                <button
                  onClick={() => handleContextMenuClick('sendMessage')}
                  className="w-full text-left flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Mesaj Gönder
                </button>
              </li>
            )}
            {permissions.canDeleteUser && (
              <li>
                <button
                  onClick={() => handleContextMenuClick('delete')}
                  className="w-full text-left flex items-center px-4 py-2 text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Sil
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card w-full max-w-2xl">
            <h2 className="text-xl font-semibold mb-4">{currentUser?.id ? 'Kişisel Bilgileri Düzenle' : 'Yeni Kullanıcı Ekle'}</h2>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" placeholder="Ad" className="input" value={currentUser?.firstName || ''} onChange={e => setCurrentUser({ ...currentUser, firstName: e.target.value })} />
              <input type="text" placeholder="Soyad" className="input" value={currentUser?.lastName || ''} onChange={e => setCurrentUser({ ...currentUser, lastName: e.target.value })} />
              <input type="date" placeholder="Doğum Tarihi" className="input" value={currentUser?.birthDate || ''} onChange={e => setCurrentUser({ ...currentUser, birthDate: e.target.value })} />
              <input type="text" placeholder="TCKN" className="input" value={currentUser?.tcNumber || ''} onChange={e => setCurrentUser({ ...currentUser, tcNumber: e.target.value })} />
              <input type="text" placeholder="Yaşadığı Şehir" className="input" value={currentUser?.city || ''} onChange={e => setCurrentUser({ ...currentUser, city: e.target.value })} />
              <input type="text" placeholder="Doğum Yeri" className="input" value={currentUser?.birthPlace || ''} onChange={e => setCurrentUser({ ...currentUser, birthPlace: e.target.value })} />
              <select className="input" value={currentUser?.callType || 'inbound'} onChange={e => setCurrentUser({ ...currentUser, callType: e.target.value as any })}>
                {callTypes.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
              </select>
              <select className="input" value={currentUser?.groupId || ''} onChange={e => setCurrentUser({ ...currentUser, groupId: e.target.value })}>
                <option value="">Grup Seçin</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            <div className="mt-6 flex justify-end gap-4">
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>İptal</button>
              <button className="btn-primary" onClick={handleSaveUser} disabled={isLoading}>
                {isLoading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRoleModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Rol Atama</h2>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <p className="mb-4">Kullanıcı: <span className="font-medium">{currentUser.firstName} {currentUser.lastName}</span></p>
            
            <div className="space-y-2">
                <label htmlFor="role-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rol Seçin</label>
                <select 
                  id="role-select"
                  className="input" 
                  value={selectedRole} 
                  onChange={e => setSelectedRole(e.target.value)}
                >
                  <option value="">Rol Seçilmedi</option>
                  {roles.map(role => <option key={role.id} value={role.name}>{role.name}</option>)}
                </select>
            </div>

            <div className="mt-6 flex justify-end gap-4">
              <button className="btn-secondary" onClick={() => { setIsRoleModalOpen(false); setError(null); } }>İptal</button>
              <button className="btn-primary" onClick={handleAssignRole} disabled={isLoading}>
                {isLoading ? 'Kaydediliyor...' : 'Rolü Ata'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 