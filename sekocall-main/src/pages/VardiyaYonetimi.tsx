import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit, Trash2, Clock, Users, Check, X, Search } from 'lucide-react';

interface Vardiya {
  id: string;
  name: string;
  startTime: string; // HH:mm formatında
  endTime: string; // HH:mm formatında
  color: string;
  description?: string;
  createdAt: Timestamp;
  createdBy: string;
}

export type VardiyaAtama = {
  id: string;
  userId: string;
  userName: string;
  vardiyaId: string;
  vardiyaName: string;
  startDate: string; // YYYY-MM-DD formatında
  endDate: string; // YYYY-MM-DD formatında
  offDays: string[]; // Tatil günleri (0=Pazar, 1=Pazartesi, ...)
  createdAt: Timestamp;
  createdBy: string;
};

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string;
}

const VardiyaYonetimi: React.FC = () => {
  const { user } = useAuth();
  const [vardiyalar, setVardiyalar] = useState<Vardiya[]>([]);
  const [vardiyaAtamalari, setVardiyaAtamalari] = useState<VardiyaAtama[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVardiya, setEditingVardiya] = useState<Vardiya | null>(null);
  const [isAtamaModalOpen, setIsAtamaModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedVardiyaId, setSelectedVardiyaId] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [selectedOffDays, setSelectedOffDays] = useState<string[]>([]);

  // Form state'leri
  const [formData, setFormData] = useState({
    name: '',
    startTime: '08:00',
    endTime: '16:00',
    color: '#3B82F6',
    description: ''
  });

  // Vardiyaları getir
  const fetchVardiyalar = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'vardiyalar'));
      const vardiyaList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vardiya[];
      setVardiyalar(vardiyaList);
    } catch (error) {
      console.error('Vardiyalar getirilirken hata:', error);
    }
  };

  // Kullanıcıları getir
  const fetchUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const userList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];
      setUsers(userList);
    } catch (error) {
      console.error('Kullanıcılar getirilirken hata:', error);
    }
  };

  // Vardiya atamalarını getir
  const fetchVardiyaAtamalari = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'vardiya_atamalari'));
      const atamaList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VardiyaAtama[];
      setVardiyaAtamalari(atamaList);
    } catch (error) {
      console.error('Vardiya atamaları getirilirken hata:', error);
    }
  };

  useEffect(() => {
    fetchVardiyalar();
    fetchUsers();
    fetchVardiyaAtamalari();
    setLoading(false);
  }, []);

  // Vardiya ekle/güncelle
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingVardiya) {
        // Güncelleme
        await updateDoc(doc(db, 'vardiyalar', editingVardiya.id), {
          ...formData,
          updatedAt: Timestamp.now(),
          updatedBy: user.uid
        });
      } else {
        // Yeni ekleme
        await addDoc(collection(db, 'vardiyalar'), {
          ...formData,
          createdAt: Timestamp.now(),
          createdBy: user.uid
        });
      }
      
      fetchVardiyalar();
      setIsModalOpen(false);
      setEditingVardiya(null);
      setFormData({
        name: '',
        startTime: '08:00',
        endTime: '16:00',
        color: '#3B82F6',
        description: ''
      });
    } catch (error) {
      console.error('Vardiya kaydedilirken hata:', error);
    }
  };

  // Vardiya sil
  const handleDelete = async (vardiyaId: string) => {
    if (!confirm('Bu vardiyayı silmek istediğinizden emin misiniz?')) return;

    try {
      await deleteDoc(doc(db, 'vardiyalar', vardiyaId));
      fetchVardiyalar();
    } catch (error) {
      console.error('Vardiya silinirken hata:', error);
    }
  };

  // Vardiya düzenleme modalını aç
  const handleEdit = (vardiya: Vardiya) => {
    setEditingVardiya(vardiya);
    setFormData({
      name: vardiya.name,
      startTime: vardiya.startTime,
      endTime: vardiya.endTime,
      color: vardiya.color,
      description: vardiya.description || ''
    });
    setIsModalOpen(true);
  };

  // Kullanıcı seçimi
  const handleUserSelect = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId) 
        : [...prev, userId]
    );
  };

  // Tüm kullanıcıları seç/kaldır
  const handleSelectAll = () => {
    const filteredUserIds = filteredUsers.map(u => u.id);
    if (selectedUsers.length === filteredUserIds.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUserIds);
    }
  };

  // Vardiya atama modalını aç
  const handleOpenAtamaModal = () => {
    if (vardiyalar.length === 0) {
      alert('Önce vardiya oluşturmanız gerekiyor.');
      return;
    }
    setSelectedVardiyaId('');
    setSelectedUsers([]);
    setUserSearchTerm('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setSelectedOffDays([]);
    setIsAtamaModalOpen(true);
  };

  // Tatil günü seçimi
  const handleOffDayToggle = (dayIndex: string) => {
    setSelectedOffDays(prev => 
      prev.includes(dayIndex) 
        ? prev.filter(day => day !== dayIndex) 
        : [...prev, dayIndex]
    );
  };

  // Vardiya atama işlemi
  const handleAtamaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedVardiyaId || selectedUsers.length === 0) {
      alert('Lütfen vardiya seçin ve en az bir kullanıcı seçin.');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      alert('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
      return;
    }

    try {
      const selectedVardiya = vardiyalar.find(v => v.id === selectedVardiyaId);
      if (!selectedVardiya) return;

      // Seçili kullanıcılara vardiya ata
      const atamaPromises = selectedUsers.map(userId => {
        const selectedUser = users.find(u => u.id === userId);
        if (!selectedUser) return null;

        return addDoc(collection(db, 'vardiya_atamalari'), {
          userId: userId,
          userName: `${selectedUser.firstName} ${selectedUser.lastName}`,
          vardiyaId: selectedVardiyaId,
          vardiyaName: selectedVardiya.name,
          startDate: startDate,
          endDate: endDate,
          offDays: selectedOffDays,
          createdAt: Timestamp.now(),
          createdBy: user.uid
        });
      });

      await Promise.all(atamaPromises.filter(Boolean));
      
      fetchVardiyaAtamalari();
      setIsAtamaModalOpen(false);
      setSelectedVardiyaId('');
      setSelectedUsers([]);
      setUserSearchTerm('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      setSelectedOffDays([]);
    } catch (error) {
      console.error('Vardiya ataması kaydedilirken hata:', error);
    }
  };

  // Vardiya süresini hesapla
  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffHours}s ${diffMinutes}dk`;
  };

  // Filtrelenmiş kullanıcılar
  const filteredUsers = users.filter(user => 
    `${user.firstName} ${user.lastName}`.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  // Tarih aralığındaki vardiya atamalarını getir
  const getVardiyaAtamalariForDateRange = () => {
    const start = new Date(selectedDate);
    const end = new Date(selectedDate);
    end.setDate(end.getDate() + 6); // 1 haftalık aralık

    return vardiyaAtamalari.filter(atama => {
      const atamaStart = new Date(atama.startDate);
      const atamaEnd = new Date(atama.endDate);
      return atamaStart <= end && atamaEnd >= start;
    });
  };

  // Haftalık tatil günleri
  const weekDays = [
    { value: '0', label: 'Pazar' },
    { value: '1', label: 'Pazartesi' },
    { value: '2', label: 'Salı' },
    { value: '3', label: 'Çarşamba' },
    { value: '4', label: 'Perşembe' },
    { value: '5', label: 'Cuma' },
    { value: '6', label: 'Cumartesi' }
  ];

  if (loading) {
    return <div className="flex justify-center items-center h-64">Yükleniyor...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Vardiya Yönetimi</h1>
        <div className="flex gap-2">
          <button
            onClick={handleOpenAtamaModal}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            Vardiya Ata
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Yeni Vardiya
          </button>
        </div>
      </div>

      {/* Vardiya Listesi */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {vardiyalar.map((vardiya) => (
          <div
            key={vardiya.id}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border-l-4"
            style={{ borderLeftColor: vardiya.color }}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-semibold">{vardiya.name}</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(vardiya)}
                  className="p-1 text-gray-500 hover:text-blue-500"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(vardiya.id)}
                  className="p-1 text-gray-500 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span className="text-sm">
                {vardiya.startTime} - {vardiya.endTime}
              </span>
            </div>
            
            <div className="text-xs text-gray-500 mb-2">
              Süre: {calculateDuration(vardiya.startTime, vardiya.endTime)}
            </div>
            
            {vardiya.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {vardiya.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Vardiya Atamaları */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Vardiya Atamaları</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Hafta Seçin</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border rounded"
          />
          <p className="text-sm text-gray-500 mt-1">
            {new Date(selectedDate).toLocaleDateString('tr-TR')} - {new Date(new Date(selectedDate).getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('tr-TR')}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Kullanıcı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Vardiya
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Tarih Aralığı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Tatil Günleri
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Saatler
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {getVardiyaAtamalariForDateRange().map((atama) => {
                const vardiya = vardiyalar.find(v => v.id === atama.vardiyaId);
                return (
                  <tr key={atama.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {atama.userName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {atama.vardiyaName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(atama.startDate).toLocaleDateString('tr-TR')} - {new Date(atama.endDate).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {atama.offDays && atama.offDays.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {atama.offDays.map(day => (
                            <span key={day} className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                              {weekDays.find(w => w.value === day)?.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">Tatil yok</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {vardiya ? `${vardiya.startTime} - ${vardiya.endTime}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vardiya Ekleme/Düzenleme Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">
              {editingVardiya ? 'Vardiya Düzenle' : 'Yeni Vardiya Ekle'}
            </h2>
            
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Vardiya Adı</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Başlangıç Saati</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                    className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Bitiş Saati</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                    className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                    required
                  />
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Renk</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({...formData, color: e.target.value})}
                  className="w-full h-10 border rounded dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium mb-1">Açıklama</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                  rows={3}
                />
              </div>
              
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  {editingVardiya ? 'Güncelle' : 'Ekle'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingVardiya(null);
                    setFormData({
                      name: '',
                      startTime: '08:00',
                      endTime: '16:00',
                      color: '#3B82F6',
                      description: ''
                    });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  İptal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vardiya Atama Modal */}
      {isAtamaModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Vardiya Ata</h2>
              <button
                onClick={() => setIsAtamaModalOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleAtamaSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Vardiya Seçin</label>
                  <select
                    value={selectedVardiyaId}
                    onChange={(e) => setSelectedVardiyaId(e.target.value)}
                    className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                    required
                  >
                    <option value="">Vardiya Seçin</option>
                    {vardiyalar.map((vardiya) => (
                      <option key={vardiya.id} value={vardiya.id}>
                        {vardiya.name} ({vardiya.startTime} - {vardiya.endTime})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Başlangıç Tarihi</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Bitiş Tarihi</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Haftalık Tatil Günleri</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {weekDays.map((day) => (
                    <label key={day.value} className="flex items-center p-2 border rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedOffDays.includes(day.value)}
                        onChange={() => handleOffDayToggle(day.value)}
                        className="mr-2"
                      />
                      <span className="text-sm">{day.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium">Kullanıcı Seçin</label>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-sm text-blue-500 hover:text-blue-700"
                  >
                    {selectedUsers.length === filteredUsers.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                  </button>
                </div>
                
                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Kullanıcı ara..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                </div>

                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className={`flex items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b last:border-b-0 ${
                        selectedUsers.includes(user.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => handleUserSelect(user.id)}
                    >
                      <div className={`w-5 h-5 border-2 rounded mr-3 flex items-center justify-center ${
                        selectedUsers.includes(user.id) 
                          ? 'bg-blue-500 border-blue-500' 
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {selectedUsers.includes(user.id) && (
                          <Check className="h-3 w-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{user.firstName} {user.lastName}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{user.role} • {user.department}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  disabled={!selectedVardiyaId || selectedUsers.length === 0}
                >
                  {selectedUsers.length} Kullanıcıya Vardiya Ata
                </button>
                <button
                  type="button"
                  onClick={() => setIsAtamaModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  İptal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VardiyaYonetimi; 