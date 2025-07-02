import React from 'react';
import { X } from 'lucide-react';

interface TabBarProps {
  tabs: { key: string; title: string }[];
  activeTab: string;
  onTabClick: (key: string) => void;
  onTabClose: (key: string) => void;
}

export default function TabBar({ tabs, activeTab, onTabClick, onTabClose }: TabBarProps) {
  return (
    <div className="flex border-b bg-gray-100 dark:bg-gray-800">
      {tabs.map(tab => (
        <div
          key={tab.key}
          className={`flex items-center px-4 py-2 cursor-pointer border-b-2 transition-colors select-none ${
            tab.key === activeTab
              ? 'border-blue-600 bg-white dark:bg-gray-900 text-blue-600 font-bold'
              : 'border-transparent text-gray-600 dark:text-gray-300 hover:text-blue-600'
          }`}
          onClick={() => onTabClick(tab.key)}
        >
          <span className="mr-2 truncate max-w-[160px]">{tab.title}</span>
          <button
            className="ml-1 text-gray-400 hover:text-red-500"
            onClick={e => {
              e.stopPropagation();
              onTabClose(tab.key);
            }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
} 