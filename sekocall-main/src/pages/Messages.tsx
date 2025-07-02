import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  limit,
  or,
  increment,
  writeBatch,
  runTransaction,
  arrayUnion,
  arrayRemove,
  deleteDoc
} from 'firebase/firestore';
// import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { Send, User as LucideUser, CornerDownLeft, MessageSquare, Search, Users, X, UserCog, UserPlus, UserMinus, Clock, Check, CheckCheck, Trash2, /* Paperclip, */ FileText, Download, Loader } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

// TypeScript arayüzleri
interface IMessage {
  id: string;
  senderId: string;
  senderName?: string;
  senderRole?: string; // Gönderenin rolü
  text?: string; // Metin opsiyonel hale geldi
  createdAt: any;
  readBy?: { [key: string]: any }; // YENİ: Görüldü bilgisi için
  // YENİ: Dosya ekleri için alanlar
  fileURL?: string;
  fileName?: string;
  fileType?: string;
}

interface IParticipant {
  uid: string;
  name: string;
  email?: string | null;
  role?: string; // Katılımcının rolü
}

interface IConversation {
  id: string;
  participants: IParticipant[];
  participantUids: string[];
  lastMessage: IMessage | null;
  type: 'private' | 'group';
  groupName?: string;
  createdBy?: string;
  unreadCounts?: { [key: string]: number };
}

// Tüm kullanıcıların bilgilerini tutmak için
interface User {
  id: string;
  uid: string;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string; // Kullanıcı rolü (opsiyonel)
}

// +++++++++++++ YENİ: Chat Arayüzü Bileşeni +++++++++++++
interface ChatInterfaceProps {
    conversation: IConversation;
    messages: IMessage[];
    currentUser: any;
    newMessage: string;
    onNewMessageChange: (value: string) => void;
    onSendMessage: (text: string) => void;
    onOpenGroupInfo: () => void;
    onBack: () => void;
    messagesEndRef: React.RefObject<HTMLDivElement>;
    isMessageSearchOpen: boolean;
    onToggleMessageSearch: () => void;
    messageSearchTerm: string;
    onMessageSearchChange: (term: string) => void;
    onMessageSearchSubmit: () => void;
    highlightedMessageId: string | null;
    isSearching: boolean;
    searchFilters: { personUid: string; startDate: string; endDate: string; };
    onSearchFilterChange: (filters: { personUid?: string; startDate?: string; endDate?: string; }) => void;
    searchResults: IMessage[];
    currentResultIndex: number | null;
    onNavigateResults: (direction: 'next' | 'prev') => void;
    highlightedMessageRef: React.RefObject<HTMLDivElement>;
    permissions: any; // YENİ
    getConversationName: (conversation: IConversation) => string; // YENİ
}

// +++ YENİ: Mesaj Durum İkonu Bileşeni +++
const MessageStatus = ({ message, conversation, currentUser }: { message: IMessage; conversation: IConversation; currentUser: any }) => {
  if (message.senderId !== currentUser.uid) {
    return null; // Sadece kendi gönderdiğimiz mesajlar için göster
  }

  const readByCount = message.readBy ? Object.values(message.readBy).filter(v => v !== null).length : 0;
  
  // Durum 1: Gönderildi (Sadece gönderen okudu)
  if (readByCount <= 1) {
    return <Check size={16} className="text-gray-400" />;
  }

  // Durum 2: İletildi veya Okundu
  const totalParticipants = conversation.participants.length;
  
  // Herkesin okuyup okumadığını kontrol et
  const isReadAll = totalParticipants > 0 && readByCount >= totalParticipants;

  if (isReadAll) {
    // Herkes okuduysa (grup veya 2 kişilik özel sohbet), mavi tik göster
    return <CheckCheck size={16} className="text-blue-500" />;
  } else {
    // Henüz herkes okumadıysa (sadece gruplarda mümkün), gri çift tik göster
    return <CheckCheck size={16} className="text-gray-400" />; 
  }
};
// +++++++++++++++++++++++++++++++++++++++

// satır ~110 civarında
const ChatInterface = React.memo(({
    conversation,
    messages,
    currentUser,
    newMessage,
    onNewMessageChange,
    onSendMessage,
    onOpenGroupInfo,
    onBack,
    messagesEndRef,
    isMessageSearchOpen,
    onToggleMessageSearch,
    messageSearchTerm,
    onMessageSearchChange,
    onMessageSearchSubmit,
    highlightedMessageId,
    isSearching,
    searchFilters,
    onSearchFilterChange,
    searchResults,
    currentResultIndex,
    onNavigateResults,
    highlightedMessageRef,
    permissions, // YENİ
    getConversationName, // YENİ
  }: ChatInterfaceProps) => {

  const getConversationAvatar = (conversation: IConversation) => {
    const name = getConversationName(conversation);
    const avatarName = conversation.type === 'group' ? (name || 'G') : (name || '?');
    return (
      <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
        {avatarName.charAt(0).toUpperCase()}
      </div>
    );
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isMessageSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isMessageSearchOpen]);

  const getHighlightedText = (text: string, highlight: string) => {
    if (!highlight.trim()) {
      return <span>{text}</span>;
    }
    const regex = new RegExp(`(${highlight})`, 'gi');
    return (
      <span>
        {text.split(regex).map((part, i) =>
          regex.test(part) ? (
            <strong key={i} className="bg-yellow-400 dark:bg-yellow-600 font-bold">
              {part}
            </strong>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        {!isMessageSearchOpen ? (
          <>
            <div className="flex items-center">
              <button onClick={onBack} className="md:hidden mr-2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                <CornerDownLeft size={20} />
              </button>
              <div className="flex items-center">
                {getConversationAvatar(conversation)}
                <span className="font-semibold ml-2 text-gray-800 dark:text-gray-200">{getConversationName(conversation)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onToggleMessageSearch} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                <Search size={20} />
              </button>
              {conversation.type === 'group' && (
                <button
                  onClick={onOpenGroupInfo}
                  className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                >
                  <Users size={20} />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="w-full flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <form className="w-full flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); onMessageSearchSubmit(); }}>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Aranacak metin..."
                  value={messageSearchTerm}
                  onChange={(e) => onMessageSearchChange(e.target.value)}
                  className="w-full bg-transparent focus:outline-none text-gray-800 dark:text-gray-200"
                />
                 <button type="submit" disabled={isSearching || !messageSearchTerm.trim()} className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">
                   {isSearching ? <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Search size={20} />}
                 </button>
              </form>
              <button type="button" onClick={onToggleMessageSearch} className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <select 
                value={searchFilters.personUid} 
                onChange={(e) => onSearchFilterChange({ personUid: e.target.value })}
                className="input text-xs p-1"
              >
                <option value="">Tüm Kişiler</option>
                {conversation.participants.map(p => <option key={p.uid} value={p.uid}>{p.name}</option>)}
              </select>
              <input type="date" value={searchFilters.startDate} onChange={(e) => onSearchFilterChange({ startDate: e.target.value })} className="input text-xs p-1"/>
              <input type="date" value={searchFilters.endDate} onChange={(e) => onSearchFilterChange({ endDate: e.target.value })} className="input text-xs p-1"/>
            </div>
             {searchResults.length > 0 && currentResultIndex !== null && (
              <div className="flex items-center justify-center gap-4 text-xs">
                <button onClick={() => onNavigateResults('prev')} disabled={currentResultIndex === 0}>Önceki</button>
                <span>{currentResultIndex + 1} / {searchResults.length}</span>
                <button onClick={() => onNavigateResults('next')} disabled={currentResultIndex === searchResults.length - 1}>Sonraki</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mesajlar */}
      <div className="flex-grow p-4 overflow-y-auto space-y-4">
        {/* YENİ: YÜKLEME GÖSTERGESİ */}
        {/* {uploadingFile && (
          <div className="flex justify-end">
              <div className="p-3 rounded-lg bg-blue-200 dark:bg-blue-900/50 text-white w-64">
                  <div className="flex items-center gap-2 mb-2">
                      <Loader size={20} className="animate-spin" />
                      <div className="flex flex-col overflow-hidden">
                         <span className="text-sm font-bold truncate">{uploadingFile.name}</span>
                         <span className="text-xs opacity-80">Yükleniyor...</span>
                      </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                      <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
              </div>
          </div>
        )} */}
        {messages.map((message) => {
          const isHighlighted = message.id === highlightedMessageId;
          return (
            <div 
              key={message.id} 
              ref={isHighlighted ? highlightedMessageRef : null}
              className={`flex items-end gap-2 transition-colors duration-500 ${message.senderId === currentUser?.uid ? 'justify-end' : 'justify-start'} ${isHighlighted ? 'bg-blue-200 dark:bg-blue-800/50 rounded-md p-1' : ''}`}
              >
              {message.senderId !== currentUser?.uid && (
                <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {message.senderName?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className={`flex flex-col ${message.senderId === currentUser?.uid ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg ${message.senderId === currentUser?.uid ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'}`}>
                  {conversation.type === 'group' && message.senderId !== currentUser?.uid && (
                    <p className="text-xs font-bold mb-1 text-indigo-300 dark:text-indigo-400">
                      {message.senderName}
                      {message.senderRole && <span className="font-normal opacity-80 ml-1">({message.senderRole})</span>}
                    </p>
                  )}
                  {/* YENİ: Mesaj içeriği (Metin veya Dosya) */}
                  {message.fileURL ? (
                    <div className="mt-1 p-2 bg-gray-100 dark:bg-gray-600 rounded-md">
                      {message.fileType?.startsWith('image/') ? (
                        <img src={message.fileURL} alt={message.fileName} className="max-w-xs rounded-md cursor-pointer" onClick={() => window.open(message.fileURL, '_blank')} />
                      ) : (
                        <div className="flex items-center gap-2">
                          <FileText size={24} className="text-gray-500 dark:text-gray-300" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{message.fileName}</span>
                            <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                              İndir
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                     <p>{getHighlightedText(message.text || '', messageSearchTerm)}</p>
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center">
                  <Clock size={12} className="mr-1" />
                  {message.createdAt?.toDate && format(message.createdAt.toDate(), 'd MMM yyyy, HH:mm', { locale: tr })}
                  <div className="ml-1.5">
                    <MessageStatus message={message} conversation={conversation} currentUser={currentUser} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Mesaj Yazma Alanı (Yetki Kontrollü) */}
      {((conversation?.type === 'private' && permissions.canSendPrivateMessage) || 
        (conversation?.type === 'group' && permissions.canSendGroupMessage)) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSendMessage(newMessage);
          }}
          className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4"
        >
          {/* YENİ: Dosya Yükleme Butonu */}
          {/* <label htmlFor="file-upload" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
            <Paperclip className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </label>
          <input id="file-upload" type="file" className="hidden" onChange={onFileSelect} /> */}
          
          <input
            type="text"
            value={newMessage}
            onChange={(e) => onNewMessageChange(e.target.value)}
            placeholder="Bir mesaj yazın..."
            className="input flex-grow"
            autoComplete="off"
          />
          <button type="submit" className="bg-blue-500 text-white p-3 rounded-full hover:bg-blue-600 disabled:bg-blue-300" disabled={!newMessage.trim()}>
            <Send className="h-5 w-5" />
          </button>
        </form>
      )}
    </div>
  );
});
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++

interface MessagesProps {
  selectedChatId?: string;
  newChatUser?: any;
}

export default function Messages({ selectedChatId, newChatUser }: MessagesProps) {
  const { currentUser } = useAuth();
  const { id: conversationIdFromUrl } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<IConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<IConversation | null>(null);
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [addMemberMode, setAddMemberMode] = useState(false);
  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState<string[]>([]);
  const [addMemberSearchTerm, setAddMemberSearchTerm] = useState(''); // Üye ekleme için arama
  const [messageSearchTerm, setMessageSearchTerm] = useState(''); // Mesaj arama için
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<IMessage[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState<number | null>(null);
  const [searchFilters, setSearchFilters] = useState({
    personUid: '',
    startDate: '',
    endDate: '',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const highlightedMessageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // YENİ: Dosya inputu için ref

  // +++ YENİ: SOHBET SİLME İÇİN STATE'LER +++
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<IConversation | null>(null);

  // +++ YENİ: DOSYA YÜKLEME İÇİN STATE'LER +++
  // const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  // const [uploadProgress, setUploadProgress] = useState<number>(0);

  // +++ TOPLU MESAJ İÇİN YENİ STATE'LER +++
  const [isBulkMessageModalOpen, setIsBulkMessageModalOpen] = useState(false);
  const [bulkMessageRecipients, setBulkMessageRecipients] = useState<string[]>([]);
  const [bulkMessageContent, setBulkMessageContent] = useState('');
  const [bulkMessageSearchTerm, setBulkMessageSearchTerm] = useState('');
  // +++++++++++++++++++++++++++++++++++++++

  // =================================================================================
  // YENİ: Yetki Kontrolleri
  // =================================================================================
  const permissions = useMemo(() => {
    // Admin her şeye yetkilidir (büyük/küçük harf duyarsız kontrol).
    if (currentUser?.role?.toLowerCase() === 'admin') {
      return {
        canCreateGroup: true,
        canDeleteConversation: true,
        canSendBulkMessage: true,
        canRemoveMember: true,
        canSendPrivateMessage: true,
        canSendGroupMessage: true,
      };
    }
    // 'messages' yetkisi bir nesne ise, alt yetkileri kullan, değilse hiçbir şeye izin verme.
    const msgPerms = currentUser?.permissions?.messages;
    return {
      canCreateGroup: typeof msgPerms === 'object' && msgPerms.canCreateGroup,
      canDeleteConversation: typeof msgPerms === 'object' && msgPerms.canDeleteConversation,
      canSendBulkMessage: typeof msgPerms === 'object' && msgPerms.canSendBulkMessage,
      canRemoveMember: typeof msgPerms === 'object' && msgPerms.canRemoveMember,
      canSendPrivateMessage: typeof msgPerms === 'object' && msgPerms.canSendPrivateMessage,
      canSendGroupMessage: typeof msgPerms === 'object' && msgPerms.canSendGroupMessage,
    };
  }, [currentUser]);
  // =================================================================================

  // =================================================================================
  // YENİDEN YAPILANDIRILMIŞ: Ana Fonksiyonlar (Tepede Tanımlı)
  // =================================================================================
  const getConversationName = useMemo(() => (conversation: IConversation) => {
    if (!currentUser) return "Bilinmeyen";
    if (conversation.type === 'group') {
      return conversation.groupName || 'Grup Sohbeti';
    }
    const otherParticipant = conversation.participants.find(p => p.uid !== currentUser.uid);
    return otherParticipant?.name || "Bilinmeyen Kullanıcı";
  }, [currentUser]);

  const handleSelectChat = useCallback(async (chat: IConversation) => {
    if (selectedConversation?.id === chat.id && !chat.id.startsWith('temp_')) return;
    
    setSelectedConversation(chat);
    if (!chat.id.startsWith('temp_')) {
      navigate(`/mesajlar/${chat.id}`);
    }

    if (currentUser && !chat.id.startsWith('temp_')) {
      const chatRef = doc(db, "conversations", chat.id);
      if (chat.unreadCounts && chat.unreadCounts[currentUser.uid] > 0) {
        await updateDoc(chatRef, { [`unreadCounts.${currentUser.uid}`]: 0 });
      }

      const messagesToMarkAsReadQuery = query(
        collection(db, "conversations", chat.id, "messages"),
        where(`readBy.${currentUser.uid}`, '==', null)
      );
      try {
        const messagesSnapshot = await getDocs(messagesToMarkAsReadQuery);
        if (!messagesSnapshot.empty) {
          const batch = writeBatch(db);
          let updatesMade = 0;
          messagesSnapshot.docs.forEach(messageDoc => {
            if (messageDoc.data().senderId !== currentUser.uid) {
                batch.update(messageDoc.ref, { [`readBy.${currentUser.uid}`]: true });
                updatesMade++;
            }
          });
          if (updatesMade > 0) await batch.commit();
        }
      } catch (error) {
         console.error("Mesajları okundu olarak işaretlerken hata:", error);
      }
    }
  }, [currentUser, navigate, selectedConversation?.id]);
  
  const handleCreateConversation = useCallback((user: User) => {
    if (!currentUser || !users.length) return;
  
    const existingConversation = conversations.find(c =>
      c.type === 'private' && c.participantUids.includes(user.id)
    );
  
    if (existingConversation) {
      handleSelectChat(existingConversation);
      return;
    }
    
    // KESİN ÇÖZÜM: Her iki kullanıcıyı da bu bileşenin kendi `users` listesinden bul
    const currentUserFromList = users.find(u => u.uid === currentUser.uid);
    const targetUserFromList = users.find(u => u.id === user.id); // Gelen `user`'ın sadece ID'sini kullan

    // Her iki kullanıcının da bulunduğundan emin ol
    if (!currentUserFromList || !targetUserFromList) {
        alert("Sohbet oluşturulamadı: Kullanıcı bilgileri bulunamadı veya eksik.");
        return;
    }

    // Sohbeti, bulunan tutarlı verilerle oluştur
    const newConversation: IConversation = {
      id: `temp_${targetUserFromList.id}`,
      participants: [
        { uid: currentUserFromList.uid, name: currentUserFromList.name, email: currentUserFromList.email, role: currentUserFromList.role },
        { uid: targetUserFromList.id, name: targetUserFromList.name, email: targetUserFromList.email, role: targetUserFromList.role }
      ],
      participantUids: [currentUserFromList.uid, targetUserFromList.id],
      type: 'private',
      lastMessage: null,
      unreadCounts: { 
          [currentUserFromList.uid]: 0, 
          [targetUserFromList.id]: 0 
      }
    };
    
    setConversations(prev => [newConversation, ...prev.filter(c => c.id !== newConversation.id)]);
    handleSelectChat(newConversation);
  }, [currentUser, users, conversations, handleSelectChat]);
  // =================================================================================

  // YENİDEN YAPILANDIRILMIŞ: Katılımcı listesini güncel rollerle zenginleştirmek için
  const enrichedParticipants = useMemo(() => {
    if (!selectedConversation || !users.length) return [];

    return selectedConversation.participants.map(p => {
      // Katılımcının ID'sine göre tam kullanıcı verisini `users` listesinden bul
      const fullUser = users.find(u => u.uid === p.uid || u.id === p.uid);
      return {
        ...p,
        // Bulunan kullanıcının rolünü al, yoksa mevcut rolü kullan, o da yoksa "Belirtilmemiş" de
        role: fullUser?.role || p.role || 'Belirtilmemiş',
        // İsim gibi diğer bilgileri de güncelle
        name: fullUser?.name || p.name,
      };
    });
  }, [selectedConversation, users]);

  // +++ TOPLU MESAJ İÇİN YENİ: Alıcı listesini hazırla (Kullanıcılar ve Gruplar) +++
  const bulkMessageRecipientOptions = useMemo(() => {
    // Prefix kullanarak kullanıcı ve grupları ayırt et
    const userOptions = users
      .filter(u => u.uid !== currentUser?.uid)
      .map(u => ({ id: `user_${u.id}`, name: u.name, type: 'Kullanıcı' }));
      
    const groupOptions = conversations
      .filter(c => c.type === 'group')
      .map(c => ({ id: `group_${c.id}`, name: c.groupName || 'İsimsiz Grup', type: 'Grup' }));

    return [...userOptions, ...groupOptions].sort((a, b) => a.name.localeCompare(b.name));
  }, [users, conversations, currentUser]);

  const filteredBulkRecipientOptions = useMemo(() => {
    return bulkMessageRecipientOptions.filter(option => 
      option.name.toLowerCase().includes(bulkMessageSearchTerm.toLowerCase())
    );
  }, [bulkMessageRecipientOptions, bulkMessageSearchTerm]);

  const handleBulkRecipientSelect = (recipientId: string) => {
    setBulkMessageRecipients(prev => 
      prev.includes(recipientId) 
      ? prev.filter(id => id !== recipientId) 
      : [...prev, recipientId]
    );
  };
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

  // Başlangıçta tüm kullanıcıları ve rollerini çek
  useEffect(() => {
    const fetchUsersAndRoles = async () => {
      if (!currentUser) return;
      try {
        // 1. Rolleri bir haritaya çek (ID -> Rol Adı)
        const rolesCollection = collection(db, 'roles');
        const roleSnapshot = await getDocs(rolesCollection);
        const rolesMap = new Map(roleSnapshot.docs.map(doc => [doc.id, doc.data().name]));

        // 2. Tüm kullanıcıları çek
        const usersCollection = collection(db, 'users');
        const userSnapshot = await getDocs(usersCollection);
        
        // 3. Kullanıcı listesini oluştururken rolleri DİREKT olarak Firestore'dan al
        const userList = userSnapshot.docs.map(doc => {
            const data = doc.data();
            const firstName = data.firstName || '';
            const lastName = data.lastName || '';
            const fullName = `${firstName} ${lastName}`.trim();
            
            // AuthContext ile tutarlı olacak şekilde, doğrudan 'role' alanını oku.
            // Eğer 'role' alanı yoksa, eski 'roleId' mantığını yedek olarak kullan.
            const roleName = data.role || (data.roleId ? rolesMap.get(data.roleId) : null) || 'Belirtilmemiş';

            return {
              id: doc.id,
              uid: data.uid || doc.id,
              name: fullName || data.email || 'Bilinmeyen Kullanıcı',
              email: data.email || '',
              firstName: firstName,
              lastName: lastName,
              role: roleName,
            } as User;
          });
        
        // 4. GİRİŞ YAPAN KULLANICIYI LİSTEYE EKLE/GÜNCELLE
        // Bu, `users` listesinin her zaman tam ve tutarlı olmasını sağlar.
        const currentUserIndex = userList.findIndex(u => u.uid === currentUser.uid);
        const currentUserData = {
            id: currentUser.uid, // Genellikle Auth UID'si doküman ID'si ile aynıdır, ama garantiye alalım
            uid: currentUser.uid,
            name: currentUser.name,
            email: currentUser.email,
            firstName: (currentUser as any).firstName || '',
            lastName: (currentUser as any).lastName || '',
            role: currentUser.role || 'Belirtilmemiş'
        };

        if (currentUserIndex > -1) {
            userList[currentUserIndex] = { ...userList[currentUserIndex], ...currentUserData };
        } else {
            userList.push(currentUserData);
        }

        setUsers(userList);
      } catch (error) {
        console.error("Kullanıcıları ve rolleri çekerken hata:", error);
      }
    };
    fetchUsersAndRoles();
  }, [currentUser]);

  useEffect(() => {
    // This effect handles setting the initial chat when coming from a notification.
    // The '!selectedConversation' check is crucial. It prevents this effect
    // from re-selecting the initial chat after the user has clicked on a different one.
    if (selectedChatId && !selectedConversation && conversations.length > 0) {
      const chatToSelect = conversations.find(c => c.id === selectedChatId);
      if (chatToSelect) {
        handleSelectChat(chatToSelect);
      }
    }
  }, [selectedChatId, conversations, selectedConversation, handleSelectChat]);

  // Check for new chat from navigation state
  useEffect(() => {
    // Öncelik: props.newChatUser > props.selectedChatId > location.state.newChatUser
    if (newChatUser && users.length > 0 && conversations.length > 0) {
      handleCreateConversation(newChatUser);
    } else if (location.state?.newChatUser && users.length > 0 && conversations.length > 0) {
      handleCreateConversation(location.state.newChatUser);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [newChatUser, location.state, users, conversations, navigate, handleCreateConversation]);

  // Mevcut kullanıcının sohbetlerini dinle
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    const q = query(collection(db, "conversations"), where("participantUids", "array-contains", currentUser.uid));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const convos: IConversation[] = [];
      querySnapshot.forEach((doc) => {
        convos.push({ id: doc.id, ...doc.data() } as IConversation);
      });
      
      // Güvenli sıralama
      setConversations(convos.sort((a, b) => {
        const timeA = a.lastMessage?.createdAt?.toDate() || 0;
        const timeB = b.lastMessage?.createdAt?.toDate() || 0;
        return timeB - timeA;
      }));
      setLoading(false);
    }, (error) => {
      console.error("Sohbetleri dinlerken hata oluştu: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Seçili sohbetin mesajlarını dinle (Filtreleme mantığıyla güncellendi)
  useEffect(() => {
    if (!selectedConversation || selectedConversation.id.startsWith('temp_')) {
        setMessages([]);
        return;
    }

    // Arama sonucu gösterilmiyorsa (yani canlı dinleme modundaysak)
    if (!highlightedMessageId) {
      const messagesRef = collection(db, "conversations", selectedConversation.id, "messages");
      let messagesQuery;
      
      // Arama paneli açık ve kişi filtresi seçilmişse, sorguyu ona göre düzenle
      if (isMessageSearchOpen && searchFilters.personUid) {
        messagesQuery = query(
            messagesRef,
            where("senderId", "==", searchFilters.personUid),
            orderBy("createdAt", "desc"),
            limit(50)
        );
      } else {
        // Değilse (arama kapalıysa veya kişi seçilmemişse), tüm sohbetin son 50 mesajını getir
        messagesQuery = query(
            messagesRef,
            orderBy("createdAt", "desc"),
            limit(50)
        );
      }
  
      const unsubscribe = onSnapshot(messagesQuery, (querySnapshot) => {
        setMessages(
          querySnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as IMessage))
            .reverse() // Firestore'dan desc geldiği için ters çevirerek ekranda düzgün sırala
        );
      }, (error) => {
        console.error("Mesajları dinlerken hata: ", error);
        if (error.message.includes("requires an index")) {
            alert("Filtreleme için veritabanı index'i gerekiyor. Lütfen bu hatayı geliştiriciye bildirin. Konsolda gerekli olan index linki bulunabilir.");
            console.error("Firestore Index Oluşturma Linki:", error);
        }
      });
  
      return () => unsubscribe();
    }
  }, [selectedConversation, highlightedMessageId, isMessageSearchOpen, searchFilters.personUid]);
  
  // Mesaj gönderildiğinde veya vurgulanan mesaja gidildiğinde kaydır
  useEffect(() => {
    if (highlightedMessageId && highlightedMessageRef.current) {
      highlightedMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, highlightedMessageId]);

  // Sohbet sekmesi değiştiğinde state'leri sıfırla
  useEffect(() => {
    setSelectedConversation(null);
    setMessages([]);
    setNewMessage('');
  }, [selectedChatId, newChatUser]);


  const handleSendMessage = async (text: string, fileInfo: { fileURL: string; fileName: string; fileType: string; } | null = null) => {
    // YENİ KONTROL: Eğer ne metin ne de dosya bilgisi varsa, işlemi durdur.
    if ((!text || !text.trim()) && !fileInfo) return;
    if (!selectedConversation || !currentUser) return;

    let conversationRef;
    let finalConversation = { ...selectedConversation };

    // Handle temporary conversations for the first message
    if (finalConversation.id.startsWith('temp_')) {

      // GÜVENLİ YAKLAŞIM: Firestore'a gönderilecek nesneyi sıfırdan oluştur.
      // Bu, 'undefined' hatasını engeller.
      const newConvData: { [key: string]: any } = {
        participantUids: finalConversation.participantUids,
        participants: finalConversation.participants.map(p => ({
          uid: p.uid,
          name: p.name || 'Bilinmeyen',
          email: p.email || null,
          role: p.role || 'Belirtilmemiş'
        })),
        type: finalConversation.type,
        lastMessage: null,
        unreadCounts: finalConversation.unreadCounts || {},
        createdAt: serverTimestamp(), // Sohbetin oluşturulma zamanını ekle
      };

      // Sadece grup sohbetiyse ilgili alanları ekle
      if (finalConversation.type === 'group') {
        newConvData.groupName = finalConversation.groupName || 'İsimsiz Grup';
        newConvData.createdBy = finalConversation.createdBy || null;
      }
      
      console.log("Firestore'a gönderilecek SON VERİ:", newConvData);

      try {
        const newDocRef = await addDoc(collection(db, 'conversations'), newConvData);
        conversationRef = newDocRef;
        finalConversation.id = newDocRef.id;
        
        // Update the state with the real conversation
        setConversations(prev => prev.map(c => c.id === selectedConversation.id ? { ...c, id: newDocRef.id } : c));
        setSelectedConversation(prev => prev ? { ...prev, id: newDocRef.id } : null);
      } catch (error) {
        console.error("Sohbet oluşturulurken Firestore hatası:", error);
        alert("Sohbet oluşturulamadı. Lütfen tekrar deneyin.");
        return; // Hata durumunda fonksiyonu durdur
      }
    } else {
      conversationRef = doc(db, "conversations", finalConversation.id);
    }
    
    const messageRef = doc(collection(conversationRef, "messages"));

    const message: IMessage = {
      id: messageRef.id,
      text: text || '',
      senderId: currentUser.uid,
      createdAt: serverTimestamp(),
      senderName: currentUser.name || "Bilinmeyen Kullanıcı",
      senderRole: currentUser.role || "Belirtilmemiş",
      readBy: Object.fromEntries(
        finalConversation.participantUids.map(uid => [uid, uid === currentUser.uid ? true : null])
      ),
      ...(fileInfo && { 
        fileURL: fileInfo.fileURL,
        fileName: fileInfo.fileName,
        fileType: fileInfo.fileType,
      })
    };

    try {
        await runTransaction(db, async (transaction) => {
            const conversationDoc = await transaction.get(conversationRef);
            if (!conversationDoc.exists()) {
                throw "Conversation does not exist!";
            }

            const conversationData = conversationDoc.data();
            const updates: { [key: string]: any } = {
                lastMessage: message
            };

            if (conversationData.participants) {
                conversationData.participants.forEach((participant: IParticipant) => {
                    if (participant.uid !== currentUser.uid) {
                        updates[`unreadCounts.${participant.uid}`] = increment(1);
                    }
                });
            }

            transaction.set(messageRef, message);
            transaction.update(conversationRef, updates);
        });

        // Send notifications
        if (finalConversation.type === 'group') {
            const groupMembers = finalConversation.participants.filter(p => p.uid !== currentUser.uid);
            const batch = writeBatch(db);
            groupMembers.forEach(member => {
                if (member.uid) { // Extra check to prevent crash
                  const notificationRef = doc(collection(db, "notifications"));
                  batch.set(notificationRef, {
                      recipientId: member.uid,
                      senderName: currentUser.name || "Bilinmeyen Kullanıcı",
                      message: text, // Sadece mesaj metnini gönder
                      conversationName: finalConversation.groupName || 'İsimsiz Grup', // Grup adını ekle
                      chatId: finalConversation.id,
                      read: false,
                      createdAt: serverTimestamp(),
                  });
                }
            });
            await batch.commit();
        } else {
            const otherUser = finalConversation.participants.find(p => p.uid !== currentUser.uid);
            if (otherUser && otherUser.uid) { // Extra check
                await addDoc(collection(db, "notifications"), {
                    recipientId: otherUser.uid,
                    senderName: currentUser.name || "Bilinmeyen Kullanıcı",
                    message: text, // Sadece mesaj metnini gönder
                    conversationName: currentUser.name || "Bilinmeyen Kullanıcı", // Gönderenin adını sohbet adı olarak ekle
                    chatId: finalConversation.id,
                    read: false,
                    createdAt: serverTimestamp(),
                });
            }
        }
    } catch (error) {
        console.error("Error sending message: ", error);
    }
  };
  
  const getConversationAvatar = (conversation: IConversation) => {
    if (conversation.type === 'group') {
      return `https://ui-avatars.com/api/?name=${conversation.groupName || 'G'}&background=random`;
    }
    // For private chats, we'd ideally have user avatars.
    // For now, let's use the other participant's name for the avatar.
    const otherParticipant = conversation.participants.find(p => p.uid !== currentUser?.uid);
    return `https://ui-avatars.com/api/?name=${otherParticipant?.name || '?'}&background=random`;
  }

  const handleAddMembers = async () => {
    if (!selectedConversation || selectedUsersToAdd.length === 0) return;

    const usersToAddObjects = users.filter(u => selectedUsersToAdd.includes(u.id));
    const newParticipants = usersToAddObjects.map(user => ({
      uid: user.id,
      name: user.name,
      email: user.email || null,
      role: user.role || 'Belirtilmemiş'
    }));
    const newParticipantUids = newParticipants.map(p => p.uid);

    const newUnreadCounts: { [key: string]: any } = {};
    newParticipantUids.forEach(uid => {
      newUnreadCounts[`unreadCounts.${uid}`] = 0;
    });

    try {
      const conversationRef = doc(db, 'conversations', selectedConversation.id);
      await updateDoc(conversationRef, {
        participants: arrayUnion(...newParticipants),
        participantUids: arrayUnion(...newParticipantUids),
        ...newUnreadCounts,
      });

      setSelectedUsersToAdd([]);
      setAddMemberMode(false);
    } catch (error) {
      console.error("Üye eklenirken hata oluştu:", error);
      alert("Üye eklenirken bir hata oluştu.");
    }
  };

  const handleRemoveMember = async (memberUid: string) => {
    if (!selectedConversation) return;

    // Kendini veya grup kurucusunu atmayı engelle
    if (memberUid === currentUser?.uid) {
      alert("Kendinizi gruptan çıkaramazsınız.");
      return;
    }
    // Bu mantığı daha sonra yönetici atama özelliği gelince geliştirebiliriz.
    // Şimdilik sadece kurucuyu koruyalım.
    if (memberUid === selectedConversation.createdBy) {
      alert("Grup kurucusunu atamazsınız.");
      return;
    }

    const memberToRemove = selectedConversation.participants.find(p => p.uid === memberUid);
    if (!memberToRemove) return;

    try {
      const conversationRef = doc(db, 'conversations', selectedConversation.id);
      await updateDoc(conversationRef, {
        participants: arrayRemove(memberToRemove),
        participantUids: arrayRemove(memberUid),
      });

      // State'i de manuel olarak güncelleyerek anında yansıma sağla
      // Not: Bu satır onSnapshot dinleyicisi zaten anlık güncelleme yaptığı için zorunlu değil,
      // ama çok hızlı tepki için eklenebilir. Şimdilik kapalı bırakalım, gerekirse açarız.
      // setSelectedConversation(prev => {
      //   if (!prev) return null;
      //   return {
      //     ...prev,
      //     participants: prev.participants.filter(p => p.uid !== memberUid),
      //     participantUids: prev.participantUids.filter(uid => uid !== memberUid),
      //   };
      // });

    } catch (error) {
      console.error("Üye çıkarılırken hata oluştu:", error);
      alert("Üye çıkarılırken bir hata oluştu.");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedUsers.length === 0 || !currentUser) {
      alert("Grup adı boş olamaz ve en az bir üye seçilmelidir.");
      return;
    }

    // Adım 1: Seçilen ID'lere karşılık gelen tam kullanıcı nesnelerini bul.
    const selectedUserObjects = users.filter(u => selectedUsers.includes(u.id));

    // Adım 2: Katılımcıları oluştur. Kurucu ve seçilen üyeler.
    // DİKKAT: Katılımcının benzersiz kimliği (uid) olarak Firestore doküman ID'sini (user.id) kullanıyoruz.
    const participants: IParticipant[] = [
      { 
        uid: currentUser.uid, // Mevcut kullanıcının Auth uid'si
        name: currentUser.name, 
        email: currentUser.email,
        role: currentUser.role,
      },
      ...selectedUserObjects.map(user => ({
        uid: user.id, // Seçilen kullanıcının Firestore doküman ID'si
        name: user.name,
        email: user.email,
        role: user.role
      }))
    ];

    if (participants.length <= 1) {
      console.error("Katılımcı listesi yetersiz. Oluşturulan liste:", participants);
      alert('Grup oluşturulamadı. Geçerli katılımcı bulunamadı. Lütfen tekrar deneyin.');
      return;
    }

    // Adım 3: Firestore'a kaydedilecek veriyi hazırla.
    const participantUids = participants.map(p => p.uid);
    const groupData = {
      groupName,
      participants,
      participantUids,
      type: 'group' as const,
      createdBy: currentUser.uid,
      lastMessage: null,
      unreadCounts: Object.fromEntries(participantUids.map(uid => [uid, 0])),
    };

    try {
      // Adım 4: Veritabanına kaydet.
      const docRef = await addDoc(collection(db, 'conversations'), groupData);
      
      const newConversation: IConversation = {
        id: docRef.id,
        ...groupData,
      };

      // Adım 5: Arayüzü güncelle.
      // Sohbet listesine ekle ve yeni sohbeti seç.
      setConversations(prev => [newConversation, ...prev]);
      setSelectedConversation(newConversation);
      navigate(`/mesajlar/${docRef.id}`); // Kullanıcıyı yeni grubun sohbet ekranına yönlendir.
      
      // Modalı kapat ve form alanlarını temizle.
      setIsGroupModalOpen(false);
      setGroupName('');
      setSelectedUsers([]);
    } catch (error: any) {
      console.error('Grup oluşturulurken Firestore hatası: ', error);
      alert('Grup oluşturulurken bir hata oluştu: ' + (error?.message || error));
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const filteredConversations = useMemo(() => 
    conversations.filter(convo => 
      getConversationName(convo).toLowerCase().includes(searchTerm.toLowerCase())
    ), [conversations, searchTerm, currentUser]
  );

  const handleMessageSearch = async () => {
    if (!messageSearchTerm.trim() || !selectedConversation) return;

    setIsSearching(true);
    setHighlightedMessageId(null);
    setSearchResults([]);
    setCurrentResultIndex(null);

    try {
      const messagesRef = collection(db, "conversations", selectedConversation.id, "messages");
      let q = query(messagesRef, orderBy("createdAt", "desc"));

      // Filtreleri uygula
      if (searchFilters.personUid) {
        q = query(q, where("senderId", "==", searchFilters.personUid));
      }
      if (searchFilters.startDate) {
        q = query(q, where("createdAt", ">=", new Date(searchFilters.startDate)));
      }
      if (searchFilters.endDate) {
        // Bitiş tarihini gün sonu olarak ayarlıyoruz ki o gün de dahil olsun.
        const endDate = new Date(searchFilters.endDate);
        endDate.setHours(23, 59, 59, 999);
        q = query(q, where("createdAt", "<=", endDate));
      }

      const querySnapshot = await getDocs(q);
      const filteredMessages = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as IMessage))
        .filter(msg => (msg.text || '').toLowerCase().includes(messageSearchTerm.toLowerCase()));

      if (filteredMessages.length > 0) {
        setSearchResults(filteredMessages);
        setCurrentResultIndex(0);
        await focusOnMessage(filteredMessages[0]);
      } else {
        alert("Arama kriterleriyle eşleşen mesaj bulunamadı.");
      }
    } catch (error) {
      console.error("Mesaj aranırken hata oluştu:", error);
      // Firestore'un bileşik dizin (composite index) hatası olup olmadığını kontrol et
      if (error instanceof Error && error.message.includes('requires an index')) {
          alert("Arama yapılamıyor. Geliştiricinin veritabanında bir dizin oluşturması gerekiyor. Lütfen bu hatayı bildirin.");
      } else {
          alert("Arama sırasında bir hata oluştu.");
      }
    } finally {
      setIsSearching(false);
    }
  };

  const focusOnMessage = async (messageToFocus: IMessage) => {
    if (!selectedConversation) return;
    
    // Mesaj zaten yüklü mü diye kontrol et
    if (messages.find(m => m.id === messageToFocus.id)) {
      setHighlightedMessageId(messageToFocus.id);
      return;
    }

    // Değilse, etrafındaki mesajlarla birlikte yükle
    const messagesRef = collection(db, "conversations", selectedConversation.id, "messages");
    const centerTimestamp = messageToFocus.createdAt;

    const beforeQuery = query(
      messagesRef,
      orderBy("createdAt", "desc"),
      where("createdAt", "<", centerTimestamp),
      limit(25)
    );

    const afterQuery = query(
      messagesRef,
      orderBy("createdAt", "asc"),
      where("createdAt", ">", centerTimestamp),
      limit(25)
    );

    const [beforeSnapshot, afterSnapshot] = await Promise.all([
      getDocs(beforeQuery),
      getDocs(afterQuery)
    ]);

    const beforeMessages = beforeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IMessage)).reverse();
    const afterMessages = afterSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IMessage));
    
    const newMessages = [...beforeMessages, messageToFocus, ...afterMessages];
    
    setMessages(newMessages);
    setHighlightedMessageId(messageToFocus.id);
  }

  const handleNavigateResults = async (direction: 'next' | 'prev') => {
    if (currentResultIndex === null) return;
    
    const newIndex = direction === 'next' 
      ? Math.min(currentResultIndex + 1, searchResults.length - 1)
      : Math.max(currentResultIndex - 1, 0);

    if (newIndex !== currentResultIndex) {
      setCurrentResultIndex(newIndex);
      await focusOnMessage(searchResults[newIndex]);
    }
  };

  if (loading) {
      return <div className="p-6">Mesajlar Yükleniyor...</div>
  }

  const handleSendMessageOptimized = (text: string) => {
    handleSendMessage(text);
    setNewMessage('');
  }

  const handleToggleMessageSearch = () => {
    setIsMessageSearchOpen(!isMessageSearchOpen);
    // Aramayı kapatırken arama terimini ve sonuçlarını temizle
    if (isMessageSearchOpen) {
      setMessageSearchTerm('');
      setHighlightedMessageId(null);
      setSearchResults([]);
      setCurrentResultIndex(null);
      setSearchFilters({ personUid: '', startDate: '', endDate: ''});
    }
  };

  const handleSearchFilterChange = (filters: { personUid?: string; startDate?: string; endDate?: string; }) => {
    setSearchFilters(prev => ({...prev, ...filters}));
  };

  const handleSendBulkMessage = async () => {
    if (!bulkMessageContent.trim() || bulkMessageRecipients.length === 0 || !currentUser) {
      alert("Lütfen bir mesaj yazın ve en az bir alıcı seçin.");
      return;
    }

    try {
      const batch = writeBatch(db);

      for (const recipientId of bulkMessageRecipients) {
        const [type, id] = recipientId.split('_');
        let conversationId: string | null = null;
        let finalConversation: IConversation | null = null;

        if (type === 'group') {
          conversationId = id;
          finalConversation = conversations.find(c => c.id === id) || null;
        } else if (type === 'user') {
          const targetUser = users.find(u => u.id === id);
          if (!targetUser) continue;

          // Mevcut özel sohbeti bul
          let privateConv = conversations.find(c => 
            c.type === 'private' && c.participantUids.includes(targetUser.id)
          );

          if (privateConv) {
            conversationId = privateConv.id;
            finalConversation = privateConv;
          } else {
            // Yeni özel sohbet oluştur (ama veritabanına hemen yazma, batch'e ekle)
            const newConvRef = doc(collection(db, 'conversations'));
            const newConversationData: Omit<IConversation, 'id'> = {
              participantUids: [currentUser.uid, targetUser.id],
              participants: [
                { uid: currentUser.uid, name: currentUser.name, email: currentUser.email, role: currentUser.role },
                { uid: targetUser.id, name: targetUser.name, email: targetUser.email, role: targetUser.role }
              ],
              type: 'private',
              lastMessage: null,
              unreadCounts: { [currentUser.uid]: 0, [targetUser.id]: 0 }
            };
            batch.set(newConvRef, newConversationData);
            conversationId = newConvRef.id;
            // Geçici bir finalConversation oluştur
            finalConversation = { id: conversationId, ...newConversationData };
          }
        }

        if (!conversationId || !finalConversation) continue;

        // Mesajı oluştur
        const messageRef = doc(collection(db, "conversations", conversationId, "messages"));
        const messageData: IMessage = {
          id: messageRef.id,
          text: bulkMessageContent,
          senderId: currentUser.uid,
          createdAt: serverTimestamp(),
          senderName: currentUser.name || "Bilinmeyen Kullanıcı",
          senderRole: currentUser.role || "Belirtilmemiş",
          readBy: Object.fromEntries(
            finalConversation.participantUids.map(uid => [uid, uid === currentUser.uid ? true : null])
          ),
        };
        batch.set(messageRef, messageData);

        // Sohbetin son mesajını ve okunmamış sayısını güncelle
        const convRef = doc(db, 'conversations', conversationId);
        const unreadUpdates: { [key: string]: any } = {};
        finalConversation.participants.forEach(p => {
          if (p.uid !== currentUser.uid) {
            unreadUpdates[`unreadCounts.${p.uid}`] = increment(1);
          }
        });
        batch.update(convRef, { lastMessage: messageData, ...unreadUpdates });
      }

      await batch.commit();

      // Başarılı gönderim sonrası modalı kapat ve state'i temizle
      alert("Mesajlar başarıyla gönderildi!");
      setIsBulkMessageModalOpen(false);
      setBulkMessageContent('');
      setBulkMessageRecipients([]);
      setBulkMessageSearchTerm('');

    } catch (error) {
      console.error("Toplu mesaj gönderilirken hata oluştu:", error);
      alert("Mesajlar gönderilirken bir hata oluştu. Lütfen tekrar deneyin.");
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (!conversationId) return;
    
    try {
        // Firestore'da bir dokümanı silmek, alt koleksiyonlarını otomatik olarak silmez.
        // Bu yüzden önce tüm mesajları silmeliyiz.
        const messagesRef = collection(db, 'conversations', conversationId, 'messages');
        const messagesSnapshot = await getDocs(messagesRef);
        
        const batch = writeBatch(db);
        
        // Mesajları silme işlemine ekle
        if (!messagesSnapshot.empty) {
            messagesSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
        }

        // Ana sohbet dokümanını silme işlemine ekle
        const conversationRef = doc(db, 'conversations', conversationId);
        batch.delete(conversationRef);
        
        // Tüm silme işlemlerini tek seferde gerçekleştir
        await batch.commit();

        // Modal'ı kapat ve state'i sıfırla
        setIsDeleteModalOpen(false);
        setConversationToDelete(null);

        // Eğer silinen sohbet o an seçili olan ise, seçimden kaldır
        if (selectedConversation?.id === conversationId) {
            setSelectedConversation(null);
            navigate('/mesajlar');
        }
        
    } catch (error) {
        console.error("Sohbet silinirken hata oluştu: ", error);
        alert("Sohbet silinirken bir hata oluştu.");
        // Hata durumunda da modal'ı kapat
        setIsDeleteModalOpen(false);
        setConversationToDelete(null);
    }
  };

  // YENİ: DOSYA YÜKLEME VE GÖNDERME FONKSİYONU
  /*
  const handleFileUpload = (file: File) => {
    if (!selectedConversation || !currentUser) return;

    const storage = getStorage(); // YENİ: Storage örneğini burada al
    const storageRef = ref(storage, `chat_files/${selectedConversation.id}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    setUploadingFile(file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      }, 
      (error) => {
        console.error("Dosya yükleme hatası:", error);
        alert("Dosya yüklenirken bir hata oluştu.");
        setUploadingFile(null);
        setUploadProgress(0);
      }, 
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          // Dosya mesajını gönder
          handleSendMessage('', {
            fileURL: downloadURL,
            fileName: file.name,
            fileType: file.type,
          });
          // State'i temizle
          setUploadingFile(null);
          setUploadProgress(0);
        });
      }
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Dosya boyutu kontrolü (örn: 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert("Dosya boyutu 10MB'tan büyük olamaz.");
        return;
      }
      handleFileUpload(file);
    }
     // Input'u sıfırla ki aynı dosya tekrar seçilebilsin
    e.target.value = '';
  };
  */

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white dark:bg-gray-900">
      {/* Sol Sütun: Sohbet Listesi */}
      <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-semibold">Sohbetler</h1>
            <div className="flex items-center gap-2">
              {permissions.canSendBulkMessage && (
                <button 
                  onClick={() => setIsBulkMessageModalOpen(true)}
                  className="px-3 py-1 bg-green-500 text-white rounded-md text-sm hover:bg-green-600 flex items-center gap-2"
                  title="Toplu Mesaj Gönder"
                >
                  <MessageSquare size={16} />
                </button>
              )}
              {permissions.canCreateGroup && (
                <button 
                  onClick={() => setIsGroupModalOpen(true)}
                  className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 flex items-center gap-2"
                >
                  <Users size={16} /> Yeni Grup
                </button>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input 
              type="text"
              placeholder="Sohbetlerde ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-md bg-gray-100 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex-grow overflow-y-auto">
          {filteredConversations.map(convo => (
            <div
              key={convo.id}
              className={`group relative p-4 cursor-pointer border-l-4 ${selectedConversation?.id === convo.id ? 'border-blue-500 bg-blue-50 dark:bg-gray-800' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
              onClick={() => handleSelectChat(convo)}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-800 dark:text-gray-200">{getConversationName(convo)}</span>
                {currentUser && convo.unreadCounts && convo.unreadCounts[currentUser.uid] > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                    {convo.unreadCounts[currentUser.uid]}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {convo.lastMessage && (
                  <>
                    {convo.lastMessage.senderId === currentUser?.uid && 'Siz: '}
                    {convo.lastMessage.text}
                  </>
                )}
              </p>
              {permissions.canDeleteConversation && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Üstteki div'in tıklanma olayını engelle
                    setConversationToDelete(convo);
                    setIsDeleteModalOpen(true);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Sohbeti Sil"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sağ Sütun: Mesajlaşma Ekranı */}
      <div className="w-2/3 flex flex-col relative">
        {selectedConversation ? (
          <ChatInterface 
            conversation={selectedConversation}
            messages={messages}
            currentUser={currentUser}
            newMessage={newMessage}
            onNewMessageChange={setNewMessage}
            onSendMessage={handleSendMessageOptimized}
            onOpenGroupInfo={() => setIsGroupInfoOpen(true)}
            onBack={() => setSelectedConversation(null)}
            messagesEndRef={messagesEndRef}
            isMessageSearchOpen={isMessageSearchOpen}
            onToggleMessageSearch={handleToggleMessageSearch}
            messageSearchTerm={messageSearchTerm}
            onMessageSearchChange={setMessageSearchTerm}
            onMessageSearchSubmit={handleMessageSearch}
            highlightedMessageId={highlightedMessageId}
            isSearching={isSearching}
            searchFilters={searchFilters}
            onSearchFilterChange={handleSearchFilterChange}
            searchResults={searchResults}
            currentResultIndex={currentResultIndex}
            onNavigateResults={handleNavigateResults}
            highlightedMessageRef={highlightedMessageRef}
            permissions={permissions} // YENİ
            getConversationName={getConversationName} // YENİ
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <MessageSquare size={48} />
            <p className="mt-4 text-lg">Bir sohbet seçin veya yeni bir sohbet başlatın.</p>
          </div>
        )}
      </div>

      {/* Grup Bilgisi Paneli (Overlay ile) */}
      {isGroupInfoOpen && selectedConversation && selectedConversation.type === 'group' && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 flex justify-end"
          onClick={() => setIsGroupInfoOpen(false)}
          // Başlangıçta görünmez ve sonra kayarak gelir
          style={{ animation: 'fadeIn 0.3s ease-out' }}
        >
          <div
            className="w-full max-w-md h-full bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col"
            onClick={(e) => e.stopPropagation()}
            // isGroupInfoOpen durumuna göre pozisyonu ayarla
            style={{ transform: isGroupInfoOpen ? 'translateX(0)' : 'translateX(100%)' }}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center">
                <UserCog className="mr-2 text-gray-600 dark:text-gray-400" size={24} />
                {selectedConversation.groupName}
              </h2>
              <button
                onClick={() => setIsGroupInfoOpen(false)}
                className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                aria-label="Paneli kapat"
              >
                <X size={20} />
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-grow p-4 overflow-y-auto">
              {/* Üyeler Listesi */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">Üyeler ({enrichedParticipants.length})</h3>
                <ul className="space-y-2">
                  {enrichedParticipants.map(member => (
                    <li key={member.uid} className="flex items-center justify-between p-2 rounded-md bg-gray-50 dark:bg-gray-700/50">
                      <div className="flex items-center">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{member.name}</span>
                        {member.role && member.role !== 'Belirtilmemiş' && <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({member.role})</span>}
                      </div>
                      <div className="flex items-center">
                         {selectedConversation.createdBy === member.uid && (
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 mr-2">(Kurucu)</span>
                        )}
                        {currentUser?.uid === member.uid && (
                            <span className="text-xs font-semibold text-green-600 dark:text-green-400">(Siz)</span>
                        )}
                        {currentUser?.uid === selectedConversation.createdBy && member.uid !== currentUser?.uid && permissions.canRemoveMember && (
                          <button
                            onClick={() => handleRemoveMember(member.uid)}
                            className="p-1 ml-2 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"
                            title="Üyeyi Çıkar"
                          >
                            <UserMinus size={16} />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Üye Ekleme Alanı */}
              {currentUser?.uid === selectedConversation.createdBy && permissions.canCreateGroup && ( // Üye ekleme de grup oluşturma yetkisine bağlı olabilir
                <div>
                  <button
                    onClick={() => setAddMemberMode(!addMemberMode)}
                    className="w-full flex items-center justify-center p-2 mb-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <UserPlus size={16} className="mr-2" />
                    {addMemberMode ? 'İptal' : 'Üye Ekle'}
                  </button>

                  {addMemberMode && (
                    <div className="p-2 border rounded-md bg-gray-50 dark:bg-gray-900 dark:border-gray-700">
                      <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Eklenecek Üyeleri Seçin</h4>
                      <div className="relative mb-2">
                        <input 
                          type="text"
                          placeholder="Kullanıcı ara..."
                          value={addMemberSearchTerm}
                          onChange={(e) => setAddMemberSearchTerm(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-sm border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                        />
                        <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
                        {users
                          .filter(user => 
                              selectedConversation.participantUids &&
                              !selectedConversation.participantUids.includes(user.uid) &&
                              (user.name.toLowerCase().includes(addMemberSearchTerm.toLowerCase()) || 
                               user.email.toLowerCase().includes(addMemberSearchTerm.toLowerCase()))
                          )
                          .map(user => (
                            <label key={user.uid} className="flex items-center p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedUsersToAdd.includes(user.uid)}
                                onChange={() => {
                                  setSelectedUsersToAdd(prev => 
                                    prev.includes(user.uid) 
                                    ? prev.filter(id => id !== user.uid)
                                    : [...prev, user.uid]
                                  );
                                }}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <div className="ml-3">
                                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{user.name}</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">{user.role}</span>
                              </div>
                            </label>
                          ))
                        }
                      </div>
                      <button
                        onClick={handleAddMembers}
                        disabled={selectedUsersToAdd.length === 0}
                        className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        Seçilenleri Ekle
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Yeni Grup Oluşturma Modalı */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Yeni Grup Oluştur</h2>
              <button onClick={() => setIsGroupModalOpen(false)}><X className="h-6 w-6 text-gray-500" /></button>
            </div>
            <form onSubmit={handleCreateGroup}>
              <div className="mb-4">
                <label htmlFor="groupName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grup Adı</label>
                <input
                  type="text"
                  id="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-gray-100 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Üyeleri Seç</p>
                <div className="max-h-60 overflow-y-auto border rounded-md p-2 bg-gray-50 dark:bg-gray-900">
                  {users.filter(u => u.id !== currentUser?.uid).map(user => (
                    <div key={user.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                      <span>{user.firstName} {user.lastName}</span>
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleUserSelect(user.id)}
                        className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-4">
                <button type="button" onClick={() => setIsGroupModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">İptal</button>
                <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">Oluştur</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toplu Mesaj Gönderme Modalı */}
      {isBulkMessageModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Toplu Mesaj Gönder</h2>
              <button onClick={() => setIsBulkMessageModalOpen(false)}><X className="h-6 w-6 text-gray-500" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSendBulkMessage(); }}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Alıcıları Seç (Kullanıcılar ve Gruplar)</label>
                 <input
                  type="text"
                  placeholder="Alıcı ara..."
                  value={bulkMessageSearchTerm}
                  onChange={(e) => setBulkMessageSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 mb-2 border rounded-md bg-gray-100 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="max-h-60 overflow-y-auto border rounded-md p-2 bg-gray-50 dark:bg-gray-900">
                  {filteredBulkRecipientOptions.map(option => (
                    <div key={option.id} className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                      <input
                        type="checkbox"
                        id={option.id}
                        checked={bulkMessageRecipients.includes(option.id)}
                        onChange={() => handleBulkRecipientSelect(option.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor={option.id} className="ml-3 flex justify-between w-full cursor-pointer">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{option.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${option.type === 'Grup' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'}`}>
                          {option.type}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label htmlFor="bulkMessageContent" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mesajınız</label>
                <textarea
                  id="bulkMessageContent"
                  rows={4}
                  value={bulkMessageContent}
                  onChange={(e) => setBulkMessageContent(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md bg-gray-100 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Gönderilecek mesajı buraya yazın..."
                />
              </div>
              <div className="flex justify-end gap-4">
                <button type="button" onClick={() => setIsBulkMessageModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">İptal</button>
                <button type="submit" disabled={!bulkMessageContent.trim() || bulkMessageRecipients.length === 0} className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400">Gönder</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sohbet Silme Onay Modalı */}
      {isDeleteModalOpen && conversationToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-full mb-4">
                  <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Sohbeti Sil</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                "<strong>{getConversationName(conversationToDelete)}</strong>" adlı sohbeti kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
              </p>
            </div>
            <div className="flex justify-center gap-4 mt-6">
              <button 
                  onClick={() => setIsDeleteModalOpen(false)} 
                  className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                  İptal
              </button>
              <button 
                  onClick={() => { if (conversationToDelete) handleDeleteConversation(conversationToDelete.id); }} 
                  className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                  Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}