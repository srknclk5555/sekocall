import { db } from '../firebase';
import { collection, doc, getDoc, setDoc, query, where, getDocs, updateDoc, writeBatch } from 'firebase/firestore';

// Kapalı ticket durumlarını kontrol eden yardımcı fonksiyon
export const isTicketClosed = (statusName: string): boolean => {
  const closedStatuses = [
    'kapandı',
    'kapalı', 
    'Kapandı - Akış Başlatıldı',
    'Kapandı - Müşteriye Ulaşılamadı',
    'Kapandı - İkna Edildi',
    'Kapandı - Mükerrer',
    'Kapandı - İkna Edilemedi',
    'Kapandı - Eksik Evrak'
  ];
  return closedStatuses.some(closedStatus => 
    statusName.toLowerCase().includes(closedStatus.toLowerCase())
  );
};

// Kapalı ticket'lar için grup ID'si
export const CLOSED_TICKETS_GROUP_ID = 'closed_tickets_group';
export const CLOSED_TICKETS_GROUP_NAME = 'Kapalı Kayıtlar';

// Kapalı kayıtlar grubunun varlığını kontrol eden ve gerekirse oluşturan fonksiyon
export const ensureClosedTicketsGroupExists = async (): Promise<void> => {
  try {
    const groupRef = doc(db, 'workgroups', CLOSED_TICKETS_GROUP_ID);
    const groupSnap = await getDoc(groupRef);
    
    if (!groupSnap.exists()) {
      // Grup yoksa oluştur
      await setDoc(groupRef, {
        name: CLOSED_TICKETS_GROUP_NAME,
        description: 'Kapalı durumdaki ticket\'ların otomatik olarak taşındığı grup',
        createdAt: new Date(),
        isSystemGroup: true // Sistem grubu olduğunu belirt
      });
      console.log('Kapalı Kayıtlar grubu oluşturuldu');
    }
  } catch (error) {
    console.error('Kapalı Kayıtlar grubu oluşturulurken hata:', error);
  }
};

// Ticket durumuna göre renk döndüren fonksiyon
export const getTicketStatusColor = (statusName: string): string => {
  if (isTicketClosed(statusName)) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
  }
  
  switch (statusName?.toLowerCase()) {
    case 'open':
    case 'açık':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
    case 'in_progress':
    case 'işlemde':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
    case 'resolved':
    case 'çözüldü':
      return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
    case 'havuzda':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
};

// Mevcut kapalı ticket'ları kapalı kayıtlar grubuna taşıyan migration fonksiyonu
export const migrateClosedTicketsToGroup = async (): Promise<void> => {
  try {
    // Önce kapalı kayıtlar grubunun varlığını kontrol et
    await ensureClosedTicketsGroupExists();
    
    // Kapalı durumdaki tüm ticket'ları bul
    const ticketsRef = collection(db, 'tickets');
    const ticketsSnap = await getDocs(ticketsRef);
    
    const batch = writeBatch(db);
    let migratedCount = 0;
    
    ticketsSnap.docs.forEach((ticketDoc) => {
      const ticketData = ticketDoc.data();
      const statusName = ticketData.statusName || ticketData.status;
      
      // Eğer ticket kapalı durumda ve henüz kapalı kayıtlar grubunda değilse
      if (isTicketClosed(statusName) && ticketData.groupId !== CLOSED_TICKETS_GROUP_ID) {
        const ticketRef = doc(db, 'tickets', ticketDoc.id);
        batch.update(ticketRef, {
          groupId: CLOSED_TICKETS_GROUP_ID,
          groupName: CLOSED_TICKETS_GROUP_NAME,
          assignedTo: '', // Atanan kişiyi temizle
          assignedUserId: null
        });
        migratedCount++;
      }
    });
    
    if (migratedCount > 0) {
      await batch.commit();
      console.log(`${migratedCount} adet kapalı ticket 'Kapalı Kayıtlar' grubuna taşındı`);
    } else {
      console.log('Taşınacak kapalı ticket bulunamadı');
    }
  } catch (error) {
    console.error('Kapalı ticket\'lar taşınırken hata:', error);
  }
}; 