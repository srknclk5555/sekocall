import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Conversation {
  id: number;
  title: string;
  date: string;
  userMessage: string;
  aiResponse: string;
  result: string[];
  status: 'success' | 'warning' | 'error';
  category: 'system' | 'bug' | 'feature' | 'question' | 'test';
}

const KonusmaGecmisi: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('newest');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'warning' | 'error'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'system' | 'bug' | 'feature' | 'question' | 'test'>('all');
  const [messageTypeFilter, setMessageTypeFilter] = useState<'all' | 'user' | 'ai'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Gerçek kayıtları dosyadan oku
  const loadConversationsFromFile = async () => {
    try {
      const response = await fetch('/KONUSMA_GECMISI.md');
      const text = await response.text();
      
      // Markdown dosyasından konuşmaları parse et
      const conversationBlocks = text.split('### Konuşma #');
      const parsedConversations: Conversation[] = [];
      
      conversationBlocks.forEach((block, index) => {
        if (index === 0) return; // İlk blok başlık kısmı
        
        const lines = block.split('\n');
        const idMatch = lines[0].match(/(\d+)/);
        if (!idMatch) return;
        
        const id = parseInt(idMatch[1]);
        const titleMatch = block.match(/\*\*Kullanıcı\*\*: "([^"]+)"/);
        const aiMatch = block.match(/\*\*AI Assistant\*\*: "([^"]+)"/);
        const dateMatch = block.match(/\*\*Tarih\*\*: ([^\n]+)/);
        
        if (titleMatch && aiMatch && dateMatch) {
          const userMessage = titleMatch[1];
          const aiResponse = aiMatch[1];
          const dateStr = dateMatch[1].trim();
          
          // Tarih formatını düzelt
          let date = new Date();
          try {
            if (dateStr.includes('T')) {
              date = new Date(dateStr);
            } else {
              // "29 Haziran 2025, 08:45:00" formatını parse et
              const [datePart, timePart] = dateStr.split(', ');
              const [day, month, year] = datePart.split(' ');
              const [hour, minute] = timePart.split(':');
              date = new Date(parseInt(year), getMonthNumber(month), parseInt(day), parseInt(hour), parseInt(minute));
            }
          } catch (e) {
            console.error('Tarih parse hatası:', e);
          }
          
          // Kategori ve durum belirle
          let category: 'system' | 'bug' | 'feature' | 'question' | 'test' = 'question';
          let status: 'success' | 'warning' | 'error' = 'success';
          
          if (userMessage.toLowerCase().includes('test')) {
            category = 'test';
          } else if (userMessage.toLowerCase().includes('hata') || userMessage.toLowerCase().includes('sorun')) {
            category = 'bug';
          } else if (userMessage.toLowerCase().includes('ekle') || userMessage.toLowerCase().includes('tasarla')) {
            category = 'feature';
          } else if (userMessage.toLowerCase().includes('sistem') || userMessage.toLowerCase().includes('kurulum')) {
            category = 'system';
          }
          
          if (userMessage.toLowerCase().includes('uyarı') || userMessage.toLowerCase().includes('dikkat')) {
            status = 'warning';
          } else if (userMessage.toLowerCase().includes('hata') || userMessage.toLowerCase().includes('başarısız')) {
            status = 'error';
          }
          
          parsedConversations.push({
            id,
            title: `Konuşma #${id}`,
            date: date.toISOString(),
            userMessage,
            aiResponse,
            result: ['✅ Kayıt başarılı'],
            status,
            category
          });
        }
      });
      
      setConversations(parsedConversations);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Kayıt dosyası okuma hatası:', error);
      // Hata durumunda örnek verileri kullan
      setConversations(sampleConversations);
    }
  };

  const getMonthNumber = (monthStr: string): number => {
    const months: { [key: string]: number } = {
      'Ocak': 0, 'Şubat': 1, 'Mart': 2, 'Nisan': 3, 'Mayıs': 4, 'Haziran': 5,
      'Temmuz': 6, 'Ağustos': 7, 'Eylül': 8, 'Ekim': 9, 'Kasım': 10, 'Aralık': 11
    };
    return months[monthStr] || 0;
  };

  // Örnek konuşma verileri (fallback için)
  const sampleConversations: Conversation[] = [
    {
      id: 1,
      title: "Otomatik Kayıt Sistemi Kurulumu",
      date: "2025-06-29T07:40:00",
      userMessage: "Benim yazdığım ve senin buna karşı yazdığın herşey otomatik kayıt edilsin.",
      aiResponse: "Anladım! Otomatik kayıt sistemi kuralım. Bunun için .cursorrules dosyasına yeni bir kural ekleyeceğim ve konuşma geçmişi dosyasını güncelleyeceğim.",
      result: [
        "✅ .cursorrules dosyasına 'Otomatik Kayıt Kuralları' eklendi",
        "✅ KONUSMA_GECMISI.md dosyası güncellendi",
        "✅ Otomatik kayıt sistemi aktif hale getirildi"
      ],
      status: 'success',
      category: 'system'
    }
  ];

  useEffect(() => {
    loadConversationsFromFile();
    
    // Her 30 saniyede bir kayıtları yenile
    const interval = setInterval(loadConversationsFromFile, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Manuel yenileme fonksiyonu
  const refreshConversations = () => {
    loadConversationsFromFile();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'system': return 'bg-blue-100 text-blue-800';
      case 'bug': return 'bg-red-100 text-red-800';
      case 'feature': return 'bg-purple-100 text-purple-800';
      case 'question': return 'bg-orange-100 text-orange-800';
      case 'test': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return 'ℹ️';
    }
  };

  const isInDateRange = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    switch (dateFilter) {
      case 'today':
        return date >= today;
      case 'week':
        return date >= weekAgo;
      case 'month':
        return date >= monthAgo;
      default:
        return true;
    }
  };

  const filteredConversations = conversations
    .filter(conv => {
      // Arama filtresi
      const searchMatch = 
        conv.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conv.userMessage.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conv.aiResponse.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conv.result.some(r => r.toLowerCase().includes(searchTerm.toLowerCase()));

      // Tarih filtresi
      const dateMatch = isInDateRange(conv.date);

      // Durum filtresi
      const statusMatch = statusFilter === 'all' || conv.status === statusFilter;

      // Kategori filtresi
      const categoryMatch = categoryFilter === 'all' || conv.category === categoryFilter;

      // Mesaj tipi filtresi - Yeni mantık
      let messageTypeMatch = true;
      if (messageTypeFilter === 'user') {
        // Sadece kullanıcı mesajlarını göster (AI mesajlarını gizle)
        messageTypeMatch = true; // Tüm konuşmaları göster ama sadece kullanıcı mesajlarında arama yap
      } else if (messageTypeFilter === 'ai') {
        // Sadece AI mesajlarını göster (kullanıcı mesajlarını gizle)
        messageTypeMatch = true; // Tüm konuşmaları göster ama sadece AI mesajlarında arama yap
      }
      // 'all' durumunda tüm mesajlar gösterilir

      return searchMatch && dateMatch && statusMatch && categoryMatch && messageTypeMatch;
    })
    .sort((a, b) => {
      if (sortOrder === 'newest') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      } else {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
    });

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMMM yyyy, HH:mm', { locale: tr });
    } catch {
      return dateString;
    }
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setDateFilter('all');
    setStatusFilter('all');
    setCategoryFilter('all');
    setMessageTypeFilter('all');
  };

  const activeFiltersCount = [
    searchTerm,
    dateFilter !== 'all',
    statusFilter !== 'all',
    categoryFilter !== 'all',
    messageTypeFilter !== 'all'
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                💬 Konuşma Geçmişi
              </h1>
              <p className="text-gray-600">
                Toplam {conversations.length} konuşma, {filteredConversations.length} sonuç
                {activeFiltersCount > 0 && (
                  <span className="ml-2 text-blue-600 font-medium">
                    ({activeFiltersCount} filtre aktif)
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Son güncelleme: {formatDate(lastUpdate.toISOString())}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={refreshConversations}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center space-x-2"
                title="Kayıtları yenile"
              >
                <span>🔄</span>
                <span>Yenile</span>
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2"
              >
                <span>🔍</span>
                <span>Filtreler</span>
                {activeFiltersCount > 0 && (
                  <span className="bg-white text-blue-500 rounded-full px-2 py-1 text-xs font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">Sıralama:</span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'oldest' | 'newest')}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="newest">En Yeni</option>
                  <option value="oldest">En Eski</option>
                </select>
              </div>
            </div>
          </div>

          {/* Gelişmiş Filtreler */}
          {showFilters && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Arama */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🔍 Arama
                  </label>
                  <input
                    type="text"
                    placeholder="Konuşma ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Tarih Filtresi */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📅 Tarih
                  </label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Tümü</option>
                    <option value="today">Bugün</option>
                    <option value="week">Son 7 Gün</option>
                    <option value="month">Son 30 Gün</option>
                  </select>
                </div>

                {/* Durum Filtresi */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📊 Durum
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Tümü</option>
                    <option value="success">✅ Başarılı</option>
                    <option value="warning">⚠️ Uyarı</option>
                    <option value="error">❌ Hata</option>
                  </select>
                </div>

                {/* Kategori Filtresi */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🏷️ Kategori
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Tümü</option>
                    <option value="system">🔧 Sistem</option>
                    <option value="bug">🐛 Hata</option>
                    <option value="feature">✨ Özellik</option>
                    <option value="question">❓ Soru</option>
                    <option value="test">🧪 Test</option>
                  </select>
                </div>

                {/* Mesaj Tipi Filtresi */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    💬 Mesaj Tipi
                  </label>
                  <select
                    value={messageTypeFilter}
                    onChange={(e) => setMessageTypeFilter(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">👥 Tüm Mesajlar</option>
                    <option value="user">👤 Sadece Senin Mesajların</option>
                    <option value="ai">🤖 Sadece AI Mesajları</option>
                  </select>
                </div>
              </div>

              {/* Filtre Temizleme */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={clearAllFilters}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm"
                >
                  🗑️ Tüm Filtreleri Temizle
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sol Panel - Konuşma Listesi */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-4">
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredConversations.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-400 text-6xl mb-4">🔍</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Sonuç Bulunamadı
                    </h3>
                    <p className="text-gray-500">
                      Filtrelerinizi değiştirerek tekrar deneyin
                    </p>
                  </div>
                ) : (
                  filteredConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      onClick={() => setSelectedConversation(conversation)}
                      className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                        selectedConversation?.id === conversation.id
                          ? 'bg-blue-100 border-2 border-blue-300'
                          : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800 text-sm mb-1">
                            {conversation.title}
                          </h3>
                          <p className="text-xs text-gray-600 mb-2">
                            {formatDate(conversation.date)}
                          </p>
                        </div>
                        <div className="ml-2 flex flex-col items-end space-y-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            #{conversation.id}
                          </span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(conversation.status)}`}>
                            {getStatusIcon(conversation.status)}
                          </span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(conversation.category)}`}>
                            {conversation.category}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-700 line-clamp-2">
                        {conversation.userMessage}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sağ Panel - Konuşma Detayı */}
          <div className="lg:col-span-2">
            {selectedConversation ? (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">
                      {selectedConversation.title}
                    </h2>
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        #{selectedConversation.id}
                      </span>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedConversation.status)}`}>
                        {getStatusIcon(selectedConversation.status)} {selectedConversation.status}
                      </span>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getCategoryColor(selectedConversation.category)}`}>
                        {selectedConversation.category}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatDate(selectedConversation.date)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Kullanıcı Mesajı */}
                {(messageTypeFilter === 'all' || messageTypeFilter === 'user') && (
                  <div className="mb-6">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-medium">S</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="bg-blue-50 rounded-lg p-4">
                          <p className="text-gray-800">{selectedConversation.userMessage}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Cevabı */}
                {(messageTypeFilter === 'all' || messageTypeFilter === 'ai') && (
                  <div className="mb-6">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-medium">AI</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="bg-purple-50 rounded-lg p-4">
                          <p className="text-gray-800">{selectedConversation.aiResponse}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sonuçlar */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Sonuçlar</h3>
                  <div className="space-y-2">
                    {selectedConversation.result.map((result, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <span className="text-green-500">✅</span>
                        <span className="text-gray-700">{result}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-6 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Konuşma Seçin
                  </h3>
                  <p className="text-gray-500">
                    Sol panelden bir konuşma seçerek detaylarını görüntüleyin
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KonusmaGecmisi; 