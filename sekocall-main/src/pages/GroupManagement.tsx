import { useState, useEffect, useCallback, MouseEvent } from 'react';
import { db } from '../firebase';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { PlusCircle, Edit, Trash2, ChevronRight, ChevronDown, Plus, FileText, Folder, FolderOpen, Lock } from 'lucide-react';
import { CLOSED_TICKETS_GROUP_ID, CLOSED_TICKETS_GROUP_NAME } from '../utils/ticketUtils';

// Grup verisi için arayüz (interface) tanımı
interface Group {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  children?: Group[];
}

// Grup ağacını oluşturan Node bileşeni
const GroupNode = ({ group, level, onAdd, onEdit, onDelete, onToggle, openNodes }: {
  group: Group;
  level: number;
  onAdd: (parentId: string | null) => void;
  onEdit: (group: Group) => void;
  onDelete: (group: Group) => void;
  onToggle: (id: string) => void;
  openNodes: Set<string>;
}) => {
  const isOpen = openNodes.has(group.id);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  return (
    <li className="text-white select-none" onContextMenu={handleContextMenu}>
      <div
        className="flex items-center p-2 rounded-md hover:bg-gray-700 cursor-pointer"
        style={{ paddingLeft: `${level * 24 + 4}px` }}
        onClick={() => onToggle(group.id)}
      >
        {group.children && group.children.length > 0 ? (
          isOpen ? <ChevronDown size={18} className="mr-2" /> : <ChevronRight size={18} className="mr-2" />
        ) : (
          <FileText size={18} className="mr-2 text-gray-500" />
        )}
        <span className={`mr-2 ${isOpen ? 'text-blue-400' : ''}`}>{isOpen ? <FolderOpen size={20}/> : <Folder size={20} />}</span>
        <span className="font-semibold flex items-center gap-2">
          {group.name}
          {group.id === CLOSED_TICKETS_GROUP_ID && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
              <Lock size={12} className="mr-1" />
              SİSTEM
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center space-x-3 pr-2">
            <button title="Alt grup ekle" onClick={(e) => { e.stopPropagation(); onAdd(group.id); }} className="text-gray-400 hover:text-green-400 opacity-50 hover:opacity-100 transition-opacity">
                <PlusCircle size={18} />
            </button>
            <button title="Düzenle" onClick={(e) => { e.stopPropagation(); onEdit(group); }} className="text-gray-400 hover:text-blue-400 opacity-50 hover:opacity-100 transition-opacity">
                <Edit size={18} />
            </button>
            <button title="Sil" onClick={(e) => { e.stopPropagation(); onDelete(group); }} className="text-gray-400 hover:text-red-500 opacity-50 hover:opacity-100 transition-opacity">
                <Trash2 size={18} />
            </button>
        </div>
      </div>
      {isOpen && group.children && group.children.length > 0 && (
        <ul className="pl-6 border-l border-gray-600">
          {group.children.map(child => (
            <GroupNode key={child.id} group={child} level={level + 1} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} openNodes={openNodes} />
          ))}
        </ul>
      )}
      {contextMenu && (
        <div
          ref={(el) => el && el.focus()}
          onBlur={closeContextMenu}
          tabIndex={-1}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 py-1"
        >
          <button
            onClick={() => { onAdd(group.id); closeContextMenu(); }}
            className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-200 hover:bg-gray-700"
          >
            <Plus size={16} className="mr-2" /> Alt Grup Ekle
          </button>
        </div>
      )}
    </li>
  );
};

export default function GroupManagement() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupTree, setGroupTree] = useState<Group[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', parentId: null as string | null });
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set());
  const groupsCollectionRef = collection(db, 'workgroups');

  const getGroups = useCallback(async () => {
    const data = await getDocs(query(collection(db, 'workgroups')));
    const fetchedGroups: Group[] = [];
    for(const doc of data.docs) {
      const docData = doc.data();
      // Geriye dönük uyumluluk: parentId alanı olmayanlar için null ata
      fetchedGroups.push({ ...docData, id: doc.id, parentId: docData.parentId || null } as Group);
    }
    setGroups(fetchedGroups);
  }, []);

  useEffect(() => {
    getGroups();
  }, [getGroups]);

  const buildTree = (items: Group[], parentId: string | null = null): Group[] => {
    return items
      .filter(item => item.parentId === parentId)
      .map(item => ({
        ...item,
        children: buildTree(items, item.id)
      }));
  };
  
  useEffect(() => {
      setGroupTree(buildTree(groups));
  }, [groups]);

  const handleToggleNode = (id: string) => {
    setOpenNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const openModal = (group: Group | null = null, parentId: string | null = null) => {
    setEditingGroup(group);
    if (group) {
      setFormData({ name: group.name, description: group.description, parentId: group.parentId });
    } else {
      setFormData({ name: '', description: '', parentId });
    }
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingGroup(null);
    setFormData({ name: '', description: '', parentId: null });
  };

  const handleSaveGroup = async () => {
    if (!formData.name) {
      alert("Grup adı boş olamaz.");
      return;
    }
    
    // Kapalı kayıtlar grubunun düzenlenmesini kısıtla
    if (editingGroup && editingGroup.id === CLOSED_TICKETS_GROUP_ID) {
      alert("Kapalı Kayıtlar grubu sistem grubu olduğu için düzenlenemez.");
      return;
    }
  
    if (editingGroup) {
      const groupDoc = doc(db, 'workgroups', editingGroup.id);
      await updateDoc(groupDoc, { ...formData });
    } else {
      await addDoc(groupsCollectionRef, { ...formData });
    }
  
    getGroups();
    closeModal();
  };

  const handleDeleteGroup = async (group: Group) => {
    // Kapalı kayıtlar grubunun silinmesini engelle
    if (group.id === CLOSED_TICKETS_GROUP_ID) {
      alert("Kapalı Kayıtlar grubu sistem grubu olduğu için silinemez.");
      return;
    }
    
    if (group.children && group.children.length > 0) {
      alert("Bu grup alt gruplara sahip olduğu için silinemez. Önce alt grupları silin.");
      return;
    }
    if (window.confirm(`'${group.name}' grubunu silmek istediğinizden emin misiniz?`)) {
      const groupDoc = doc(db, 'workgroups', group.id);
      await deleteDoc(groupDoc);
      getGroups();
    }
  };
  
  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-4">Grup Yönetimi (Hiyerarşik)</h1>
      <div className="flex justify-between items-center mb-4 bg-gray-800 p-4 rounded-lg">
        <div>
           <p className="text-sm text-gray-400">Yeni alt grup eklemek için bir grup üzerine sağ tıklayabilirsiniz.</p>
        </div>
        <button
          onClick={() => openModal(null, null)}
          className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
        >
          <PlusCircle size={20} className="mr-2" />
          Ana Grup Oluştur
        </button>
      </div>
      
      <div className="bg-gray-800 rounded-lg shadow p-4">
        {groupTree.length > 0 ? (
          <ul>
            {groupTree.map(group => (
              <GroupNode key={group.id} group={group} level={0} onAdd={(parentId) => openModal(null, parentId)} onEdit={openModal} onDelete={handleDeleteGroup} onToggle={handleToggleNode} openNodes={openNodes} />
            ))}
          </ul>
        ) : (
          <p className="text-center text-gray-500 py-8">Henüz hiç grup oluşturulmamış.</p>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">{editingGroup ? 'Grubu Düzenle' : 'Yeni Grup Oluştur'}</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Grup Adı"
                className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <textarea
                placeholder="Açıklama"
                className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
              <select
                 className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 value={formData.parentId || ''}
                 onChange={(e) => setFormData({ ...formData, parentId: e.target.value || null })}
              >
                  <option value="">Ana Grup (Üst Seviye)</option>
                  {groups.filter(g => g.id !== editingGroup?.id).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="mt-6 flex justify-end space-x-4">
              <button onClick={closeModal} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">
                İptal
              </button>
              <button onClick={handleSaveGroup} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                {editingGroup ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 