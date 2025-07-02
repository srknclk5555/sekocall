import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { ChevronRight, ChevronDown, Folder, Lock } from 'lucide-react';
import { CLOSED_TICKETS_GROUP_ID, CLOSED_TICKETS_GROUP_NAME, ensureClosedTicketsGroupExists } from '../utils/ticketUtils';

interface Group {
  id: string;
  name: string;
  parentId: string | null;
  children?: Group[];
}

interface TicketCountMap {
  [groupId: string]: number;
}

const buildTree = (groups: Group[]): Group[] => {
    const groupMap: { [key: string]: Group } = {};
    const tree: Group[] = [];

    groups.forEach(group => {
        groupMap[group.id] = { ...group, children: [] };
    });

    groups.forEach(group => {
        if (group.parentId && groupMap[group.parentId]) {
            groupMap[group.parentId].children?.push(groupMap[group.id]);
        } else {
            tree.push(groupMap[group.id]);
        }
    });

    // Her seviyeyi alfabetik olarak sırala
    const sortTree = (nodes: Group[]) => {
        nodes.sort((a, b) => a.name.localeCompare(b.name));
        nodes.forEach(node => {
            if (node.children) sortTree(node.children);
        });
    };
    sortTree(tree);

    return tree;
};

const GroupNode = ({ group, ticketCounts }: { group: Group, ticketCounts: TicketCountMap }) => {
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();
    const hasChildren = group.children && group.children.length > 0;

    const handleNodeClick = () => {
        // Tıklandığında /tickets sayfasına yönlendir ve grup ID'si ile adını parametre olarak ekle
        navigate(`/tickets?groupId=${group.id}&groupName=${encodeURIComponent(group.name)}`);
    };

    return (
        <div className="ml-4">
            <div className="flex items-center p-1 rounded-md">
                <div className="flex items-center cursor-pointer flex-grow" >
                    {hasChildren ? (
                        <button onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} className="mr-1 p-0.5 rounded hover:bg-gray-700">
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    ) : (
                        <span className="w-5 mr-1"></span> // Boşluk
                    )}
                     <Folder size={16} className="text-gray-500 mr-2"/>
                    <span onClick={handleNodeClick} className="hover:underline flex items-center gap-2">
                        {group.name}
                        {group.id === CLOSED_TICKETS_GROUP_ID && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
                                <Lock size={10} className="mr-1" />
                                SİSTEM
                            </span>
                        )}
                    </span>
                </div>
                <span onClick={handleNodeClick} className="text-gray-400 text-sm cursor-pointer hover:underline">
                  ({ticketCounts[group.id] || 0})
                </span>
            </div>
            {hasChildren && isOpen && (
                <div>
                    {group.children?.map(child => <GroupNode key={child.id} group={child} ticketCounts={ticketCounts} />)}
                </div>
            )}
        </div>
    );
}

export default function Scoreboard() {
  const [groupTree, setGroupTree] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ticketCounts, setTicketCounts] = useState<TicketCountMap>({});

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        // Önce kapalı kayıtlar grubunun varlığını kontrol et
        await ensureClosedTicketsGroupExists();
        
        const groupsSnapshot = await getDocs(collection(db, 'workgroups'));
        const groupsList = groupsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Group));
        setGroupTree(buildTree(groupsList));
      } catch (error) {
        console.error("Gruplar çekilirken hata oluştu:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchGroups();
    // Tüm ticketları canlı olarak dinle ve groupId'ye göre sayıları hesapla
    const unsub = onSnapshot(collection(db, 'tickets'), (snapshot) => {
      const counts: TicketCountMap = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.groupId) {
          counts[data.groupId] = (counts[data.groupId] || 0) + 1;
        }
      });
      setTicketCounts(counts);
    });
    return () => unsub();
  }, []);

  // Filtreleme fonksiyonu
  const filterTree = (nodes: Group[]): Group[] => {
    return nodes
      .map(node => {
        const children = node.children ? filterTree(node.children) : [];
        const match = node.name.toLowerCase().includes(search.toLowerCase());
        if (match || children.length > 0) {
          return { ...node, children };
        }
        return null;
      })
      .filter(Boolean) as Group[];
  };

  const displayedTree = search ? filterTree(groupTree) : groupTree;

  if (loading) {
    return <div className="p-4 text-sm text-gray-400">Yükleniyor...</div>;
  }

  return (
    <div className="p-2 text-white">
      <h3 className="font-bold text-lg mb-2 px-2">Havuzlar</h3>
      <input
        type="text"
        className="w-full mb-2 px-3 py-2 rounded bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Havuzlarda ara..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {displayedTree.length > 0 ? (
        displayedTree.map(group => (
          <GroupNode key={group.id} group={group} ticketCounts={ticketCounts} />
        ))
      ) : (
        <div className="text-gray-400 px-2 py-4">Sonuç bulunamadı.</div>
      )}
    </div>
  );
} 