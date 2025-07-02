import React, { useState } from 'react';
import { Settings, Tag, Users, Package, Ticket } from 'lucide-react';
import CategoryManagement from './CategoryManagement';
import GroupManagement from './GroupManagement';
import ProductDesign from './ProductDesign';
import TicketStatusManagement from './TicketStatusManagement';

interface SubModule {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  component: React.ComponentType;
}

const subModules: SubModule[] = [
  {
    id: 'category_management',
    name: 'Kategori Yönetimi',
    description: 'Ticket kategorilerini ve alt kategorilerini yönetin',
    icon: <Tag className="h-8 w-8" />,
    component: CategoryManagement
  },
  {
    id: 'group_management',
    name: 'Grup Yönetimi',
    description: 'Kullanıcı gruplarını ve yetkilerini yönetin',
    icon: <Users className="h-8 w-8" />,
    component: GroupManagement
  },
  {
    id: 'product_design',
    name: 'Ürün Tasarım Modülü',
    description: 'Müşterilere sunulan hizmetleri ve paketleri yönetin',
    icon: <Package className="h-8 w-8" />,
    component: ProductDesign
  },
  {
    id: 'ticket_status_management',
    name: 'Ticket Durumları Yönetimi',
    description: 'Ticket durumlarını ve aşamalarını yönetin',
    icon: <Ticket className="h-8 w-8" />,
    component: TicketStatusManagement
  }
];

export default function Tanimlamalar() {
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  const handleModuleClick = (moduleId: string) => {
    setSelectedModule(moduleId);
  };

  const handleBackToMain = () => {
    setSelectedModule(null);
  };

  const selectedSubModule = subModules.find(module => module.id === selectedModule);

  if (selectedModule && selectedSubModule) {
    const Component = selectedSubModule.component;
    return (
      <div className="p-6 bg-gray-900 min-h-screen text-white">
        <div className="flex items-center mb-6">
          <button
            onClick={handleBackToMain}
            className="mr-4 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            <Settings className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">{selectedSubModule.name}</h1>
            <p className="text-gray-400">{selectedSubModule.description}</p>
          </div>
        </div>
        <Component />
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Tanımlamalar</h1>
        <p className="text-gray-400">Sistem ayarları ve yapılandırma modüllerini yönetin</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {subModules.map((module) => (
          <div
            key={module.id}
            onClick={() => handleModuleClick(module.id)}
            className="bg-gray-800 p-6 rounded-lg cursor-pointer hover:bg-gray-700 transition-all duration-200 border border-gray-700 hover:border-gray-600"
          >
            <div className="flex items-center mb-4">
              <div className="text-blue-400 mr-4">
                {module.icon}
              </div>
              <h3 className="text-xl font-semibold">{module.name}</h3>
            </div>
            <p className="text-gray-300 mb-4">{module.description}</p>
            <div className="flex items-center text-blue-400 text-sm">
              <span>Modülü Aç</span>
              <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 