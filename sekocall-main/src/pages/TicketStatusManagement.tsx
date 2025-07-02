import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

interface TicketStatus {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
}

export default function TicketStatusManagement() {
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<TicketStatus | null>(null);
  const [form, setForm] = useState({ name: '', description: '', active: true });

  // Durumları çek
  useEffect(() => {
    async function fetchStatuses() {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDocs(collection(db, 'ticket_statuses'));
        setStatuses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TicketStatus)));
      } catch (err) {
        setError('Durumlar yüklenirken hata oluştu.');
      }
      setLoading(false);
    }
    fetchStatuses();
  }, []);

  const openModal = (status?: TicketStatus) => {
    if (status) {
      setEditingStatus(status);
      setForm({ name: status.name, description: status.description || '', active: status.active !== false });
    } else {
      setEditingStatus(null);
      setForm({ name: '', description: '', active: true });
    }
    setIsModalOpen(true);
  };
  const closeModal = () => setIsModalOpen(false);

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('Durum adı zorunludur.');
      return;
    }
    try {
      if (editingStatus) {
        await updateDoc(doc(db, 'ticket_statuses', editingStatus.id), {
          name: form.name,
          description: form.description,
          active: form.active,
        });
      } else {
        await addDoc(collection(db, 'ticket_statuses'), {
          name: form.name,
          description: form.description,
          active: form.active,
        });
      }
      closeModal();
      // Yeniden yükle
      const snap = await getDocs(collection(db, 'ticket_statuses'));
      setStatuses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TicketStatus)));
    } catch (err) {
      alert('Kayıt işlemi sırasında hata oluştu.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bu durumu silmek istediğinize emin misiniz?')) return;
    try {
      await deleteDoc(doc(db, 'ticket_statuses', id));
      setStatuses(statuses.filter(s => s.id !== id));
    } catch (err) {
      alert('Silme işlemi sırasında hata oluştu.');
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Ticket Durumları Yönetimi</h1>
      <button className="bg-blue-600 text-white px-4 py-2 rounded mb-4" onClick={() => openModal()}>Yeni Durum Ekle</button>
      {loading ? (
        <div className="text-gray-400">Yükleniyor...</div>
      ) : error ? (
        <div className="text-red-500">{error}</div>
      ) : (
        <table className="w-full border mt-2">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="p-2 text-left">Adı</th>
              <th className="p-2 text-left">Açıklama</th>
              <th className="p-2 text-left">Aktif mi?</th>
              <th className="p-2">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map(status => (
              <tr key={status.id} className="border-b">
                <td className="p-2">{status.name}</td>
                <td className="p-2">{status.description}</td>
                <td className="p-2">{status.active !== false ? 'Evet' : 'Hayır'}</td>
                <td className="p-2 flex gap-2">
                  <button className="text-blue-600 underline" onClick={() => openModal(status)}>Düzenle</button>
                  <button className="text-red-600 underline" onClick={() => handleDelete(status.id)}>Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingStatus ? 'Durumu Düzenle' : 'Yeni Durum Ekle'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Adı</label>
                <input type="text" className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block font-medium mb-1">Açıklama</label>
                <input type="text" className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} id="active" />
                <label htmlFor="active">Aktif</label>
              </div>
            </div>
            <div className="flex gap-4 justify-end mt-6">
              <button className="bg-gray-500 text-white px-4 py-2 rounded" onClick={closeModal}>İptal</button>
              <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={handleSave}>{editingStatus ? 'Güncelle' : 'Kaydet'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 