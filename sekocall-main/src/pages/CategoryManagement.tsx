import { useEffect, useState, Fragment } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore';
import { PlusCircle, Search, Edit, Trash2, ChevronRight, ChevronDown, Tag, ClipboardList } from 'lucide-react';

// Hiyerarşik kategori verisi için arayüz tanımı
interface Category {
  id: string;
  name: string;
  parentId: string | null;
  children?: Category[]; // Ağaç yapısı için
}

// Başlangıçta eklenecek yeni hiyerarşik veri yapısı
const seedData = [
    {
        name: 'Otomatik',
        children: [
            { name: 'Biri', children: [] },
            { name: 'FrontOffice', children: [] },
            { name: 'Hotline', children: [] },
            { name: 'İşOrtağım.WebMail', children: [] },
            { name: 'Mailleİptal', children: [] },
            { name: 'sme', children: [] },
            { name: 'TSAT.BinadaAltyapıYok', children: [] },
            { name: 'TSOL', children: [] },
            { name: 'Wholesale nimws@vodafone.net.tr mailden', children: [] },
            { name: 'ÜstYönetimŞikayeti', children: [] },
        ]
    },
    {
        name: 'Sorun',
        children: [
            { name: 'Bireysel', children: [] },
            { name: 'Biri', children: [] },
            { name: 'RedKontrol.Hesapİşlemleri', children: [] },
            { name: 'THK', children: [] },
            { name: 'Takip.Bireysel.ProactiveUzunSüreliArıza', children: [] },
        ]
    },
    {
        name: 'Talep',
        children: []
    }
];


// Düz listeyi ağaç yapısına çeviren yardımcı fonksiyon
const buildTree = (categories: Category[]): Category[] => {
    const categoryMap: { [key: string]: Category } = {};
    const tree: Category[] = [];

    categories.forEach(category => {
        categoryMap[category.id] = { ...category, children: [] };
    });

    categories.forEach(category => {
        if (category.parentId && categoryMap[category.parentId]) {
            categoryMap[category.parentId].children?.push(categoryMap[category.id]);
        } else {
            tree.push(categoryMap[category.id]);
        }
    });

    return tree;
};


// Ağaç yapısını render eden reküristik bileşen
const CategoryNode = ({ category, onEdit, onDelete, onContextMenu }: { category: Category; onEdit: (cat: Category) => void; onDelete: (id: string) => void; onContextMenu: (event: React.MouseEvent, categoryId: string) => void; }) => {
    const [isOpen, setIsOpen] = useState(true);
    const hasChildren = category.children && category.children.length > 0;

    return (
        <div className="ml-6">
            <div 
                className="flex items-center justify-between p-2 rounded-md hover:bg-gray-700/50"
                onContextMenu={(e) => onContextMenu(e, category.id)}
            >
                <div className="flex items-center">
                    {hasChildren ? (
                         <button onClick={() => setIsOpen(!isOpen)} className="mr-2 p-1 rounded-full hover:bg-gray-600">
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                    ) : (
                        <span className="mr-2 p-1 w-6 h-6 inline-block"></span>
                    )}
                    <Tag size={16} className="text-gray-500 mr-2"/>
                    <span>{category.name}</span>
                </div>
                <div className="flex items-center space-x-3">
                    <button onClick={() => onEdit(category)} className="text-gray-400 hover:text-blue-400"><Edit size={18} /></button>
                    <button onClick={() => onDelete(category.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={18} /></button>
                </div>
            </div>
            {hasChildren && isOpen && (
                <div>
                    {category.children?.map(child => (
                        <CategoryNode key={child.id} category={child} onEdit={onEdit} onDelete={onDelete} onContextMenu={onContextMenu} />
                    ))}
                </div>
            )}
        </div>
    );
}

// Modal için kategori seçeneklerini üreten fonksiyon
const generateCategoryOptions = (categories: Category[], level = 0): JSX.Element[] => {
    let options: JSX.Element[] = [];
    categories.forEach(category => {
        options.push(
            <option key={category.id} value={category.id}>
                {'—'.repeat(level)} {level > 0 && ' '} {category.name}
            </option>
        );
        if (category.children && category.children.length > 0) {
            options = options.concat(generateCategoryOptions(category.children, level + 1));
        }
    });
    return options;
};


export default function CategoryManagement() {
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [categoryTree, setCategoryTree] = useState<Category[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryParentId, setNewCategoryParentId] = useState<string | null>(null);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    
    // Toplu Ekleme Modal Durumları
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkCategoryNames, setBulkCategoryNames] = useState('');
    const [bulkCategoryParentId, setBulkCategoryParentId] = useState<string | null>(null);

    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, categoryId: null as string | null });
    const categoriesCollectionRef = collection(db, 'ticket_categories');

    const getCategories = async () => {
        const data = await getDocs(query(collection(db, 'ticket_categories')));
        const fetchedCategories = data.docs.map(doc => ({ ...doc.data(), id: doc.id } as Category));
        setAllCategories(fetchedCategories);
        setCategoryTree(buildTree(fetchedCategories));
    };

    const seedDatabase = async () => {
        const snapshot = await getDocs(categoriesCollectionRef);
        if (snapshot.empty) {
            console.log("Veritabanı boş, yeni hiyerarşik yapı (görsele göre) ekleniyor...");

            const addCategoriesRecursive = async (categories: any[], parentId: string | null) => {
                for (const category of categories) {
                    const docRef = await addDoc(categoriesCollectionRef, { 
                        name: category.name, 
                        parentId: parentId 
                    });
                    if (category.children && category.children.length > 0) {
                        await addCategoriesRecursive(category.children, docRef.id);
                    }
                }
            };

            await addCategoriesRecursive(seedData, null);
            getCategories();
        }
    };
    
    useEffect(() => {
        seedDatabase().then(getCategories);
    }, []);

    // Sağ tık menüsünü kapatmak için genel tıklama dinleyicisi
    useEffect(() => {
        const handleClick = () => contextMenu.visible && setContextMenu(prev => ({...prev, visible: false}));
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [contextMenu.visible]);

    const handleSaveCategory = async () => {
        if (!newCategoryName.trim()) {
            alert("Kategori adı boş olamaz.");
            return;
        }

        const data = { name: newCategoryName, parentId: newCategoryParentId };

        if (editingCategory) {
            // Bir kategoriyi kendi altına taşımayı engelle
            if(editingCategory.id === newCategoryParentId) {
                alert("Bir kategori kendi altına taşınamaz.");
                return;
            }
            const categoryDoc = doc(db, 'ticket_categories', editingCategory.id);
            await updateDoc(categoryDoc, data);
        } else {
            await addDoc(categoriesCollectionRef, data);
        }
        closeModal();
        getCategories();
    };
  
    const handleDeleteCategory = async (id: string) => {
        const hasChildren = allCategories.some(cat => cat.parentId === id);
        if(hasChildren) {
            alert("Bu kategorinin alt kategorileri bulunmaktadır. Silmek için önce alt kategorileri silmeniz veya başka bir yere taşımanız gerekir.");
            return;
        }

        if (window.confirm("Bu kategoriyi silmek istediğinizden emin misiniz?")) {
            const categoryDoc = doc(db, 'ticket_categories', id);
            await deleteDoc(categoryDoc);
            getCategories();
        }
    };

    const openModal = (category: Category | null = null) => {
        if (category) {
            setEditingCategory(category);
            setNewCategoryName(category.name);
            setNewCategoryParentId(category.parentId);
        } else {
            setEditingCategory(null);
            setNewCategoryName('');
            setNewCategoryParentId(null);
        }
        setIsModalOpen(true);
    };

    const closeModal = () => setIsModalOpen(false);

    // --- Toplu Ekleme Fonksiyonları ---
    const openBulkModal = () => {
        setBulkCategoryNames('');
        setBulkCategoryParentId(null);
        setIsBulkModalOpen(true);
    };

    const closeBulkModal = () => setIsBulkModalOpen(false);

    const handleBulkSaveCategories = async () => {
        if (!bulkCategoryNames.trim()) {
            alert("Lütfen en az bir kategori adı girin.");
            return;
        }

        const names = bulkCategoryNames.split('\n').map(name => name.trim()).filter(Boolean);
        if (names.length === 0) {
            alert("Geçerli bir kategori adı bulunamadı.");
            return;
        }
        
        try {
            const batch = writeBatch(db);
            names.forEach(name => {
                const docRef = doc(collection(db, 'ticket_categories'));
                batch.set(docRef, { name, parentId: bulkCategoryParentId });
            });
            await batch.commit();

            alert(`${names.length} kategori başarıyla eklendi.`);
            closeBulkModal();
            getCategories();
        } catch (error) {
            console.error("Toplu kategori eklenirken hata:", error);
            alert("Kategoriler eklenirken bir hata oluştu.");
        }
    };
    // ---------------------------------

    const handleContextMenu = (event: React.MouseEvent, categoryId: string) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ visible: true, x: event.clientX, y: event.clientY, categoryId });
    };

    const handleAddSubCategory = () => {
        if (contextMenu.categoryId) {
            openModal(); // Boş modal aç
            setNewCategoryParentId(contextMenu.categoryId); // Üst kategoriyi ayarla
        }
    };

    return (
        <div className="p-6 bg-gray-900 min-h-screen text-white">
            <h1 className="text-2xl font-bold mb-4">Kategori Yönetimi</h1>
      
            <div className="flex justify-between items-center mb-6 bg-gray-800 p-4 rounded-lg">
                <h2 className="text-lg font-semibold">Tüm Kategoriler</h2>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => openModal()}
                        className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
                    >
                        <PlusCircle size={20} className="mr-2" />
                        Yeni Kategori
                    </button>
                    <button
                        onClick={openBulkModal}
                        className="flex items-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
                    >
                        <ClipboardList size={20} className="mr-2" />
                        Toplu Ekle
                    </button>
                </div>
            </div>

            <div className="bg-gray-800 rounded-lg shadow p-4 max-h-[500px] overflow-y-auto">
                {categoryTree.map(category => (
                    <CategoryNode key={category.id} category={category} onEdit={openModal} onDelete={handleDeleteCategory} onContextMenu={handleContextMenu} />
                ))}
            </div>

            {/* Sağ Tık Menüsü */}
            {contextMenu.visible && (
                <div
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute z-50 bg-gray-700 text-white rounded-md shadow-lg p-2 border border-gray-600"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={handleAddSubCategory}
                        className="w-full text-left px-4 py-2 hover:bg-gray-600 rounded-md flex items-center"
                    >
                        <PlusCircle size={16} className="mr-2" />
                        Alt Kategori Ekle
                    </button>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center">
                    <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
                        <h2 className="text-xl font-bold mb-6">{editingCategory ? 'Kategoriyi Düzenle' : 'Yeni Kategori Oluştur'}</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Üst Kategori</label>
                                <select 
                                    value={newCategoryParentId || ""}
                                    onChange={(e) => setNewCategoryParentId(e.target.value || null)}
                                    className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">— Ana Kategori (En Üst Seviye) —</option>
                                    {generateCategoryOptions(categoryTree)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Kategori Adı</label>
                                <input
                                    type="text"
                                    placeholder="Kategori Adını Girin"
                                    className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="mt-8 flex justify-end space-x-4">
                            <button onClick={closeModal} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">İptal</button>
                            <button onClick={handleSaveCategory} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">{editingCategory ? 'Güncelle' : 'Kaydet'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toplu Ekleme Modalı */}
            {isBulkModalOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center">
                    <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
                        <h2 className="text-xl font-bold mb-6">Toplu Kategori Ekle</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Üst Kategori</label>
                                <select 
                                    value={bulkCategoryParentId || ""}
                                    onChange={(e) => setBulkCategoryParentId(e.target.value || null)}
                                    className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">— Ana Kategori (En Üst Seviye) —</option>
                                    {generateCategoryOptions(categoryTree)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Kategori Adları (Her biri yeni bir satırda)</label>
                                <textarea
                                    placeholder="Kategori 1&#10;Kategori 2&#10;Kategori 3"
                                    className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    rows={8}
                                    value={bulkCategoryNames}
                                    onChange={(e) => setBulkCategoryNames(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="mt-8 flex justify-end space-x-4">
                            <button onClick={closeBulkModal} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">İptal</button>
                            <button onClick={handleBulkSaveCategories} className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Tümünü Ekle</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 