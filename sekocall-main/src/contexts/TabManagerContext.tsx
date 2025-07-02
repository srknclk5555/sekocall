import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface Tab {
  key: string;
  title: string;
  component: React.ComponentType<any>;
  props?: any;
}

interface TabManagerContextType {
  tabs: Tab[];
  activeTab: string;
  openTab: (tab: Tab) => void;
  closeTab: (key: string) => void;
  setActiveTab: (key: string) => void;
}

const TabManagerContext = createContext<TabManagerContextType | undefined>(undefined);

export const TabManagerProvider = ({ children }: { children: ReactNode }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');

  const openTab = (tab: Tab) => {
    setTabs(prev => {
      const existingIndex = prev.findIndex(t => t.key === tab.key);
      if (existingIndex !== -1) {
        // Sekme zaten açıksa, props/component güncelle
        const updatedTabs = [...prev];
        updatedTabs[existingIndex] = { ...prev[existingIndex], ...tab };
        return updatedTabs;
      }
      return [...prev, tab];
    });
    setActiveTab(tab.key);
  };

  const closeTab = (key: string) => {
    setTabs(prev => prev.filter(t => t.key !== key));
    setTimeout(() => {
      setTabs(current => {
        if (current.length === 0) {
          setActiveTab('');
        } else if (key === activeTab) {
          setActiveTab(current[current.length - 1].key);
        }
        return current;
      });
    }, 0);
  };

  return (
    <TabManagerContext.Provider value={{ tabs, activeTab, openTab, closeTab, setActiveTab }}>
      {children}
    </TabManagerContext.Provider>
  );
};

export function useTabManager() {
  const ctx = useContext(TabManagerContext);
  if (!ctx) throw new Error('useTabManager must be used within TabManagerProvider');
  return ctx;
} 