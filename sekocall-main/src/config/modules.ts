export interface AppModule {
    id: string; // e.g., 'dashboard'
    name: string; // e.g., 'Dashboard'
    path: string; // e.g., '/dashboard'
    subPermissions?: { id: string; name: string; }[]; // YENİ: Alt yetkiler
}

export const APP_MODULES: AppModule[] = [
    { id: 'dashboard', name: 'Dashboard', path: '/dashboard' },
    { id: 'calls', name: 'Çağrılar', path: '/calls' },
    { id: 'customers', name: 'Müşteriler', path: '/customers' },
    { id: 'tickets', name: 'Ticketlar', path: '/tickets' },
    { 
        id: 'reports', 
        name: 'Raporlar', 
        path: '/reports',
        subPermissions: [
            { id: 'userActivityReport', name: 'Kullanıcı Aktivite Raporu' }
        ]
    },
    { 
        id: 'messages', 
        name: 'Mesajlar', 
        path: '/messages',
        subPermissions: [
            { id: 'canCreateGroup', name: 'Yeni Grup Kurabilme' },
            { id: 'canDeleteConversation', name: 'Sohbetleri Silme' },
            { id: 'canSendBulkMessage', name: 'Toplu Mesaj Gönderebilme' },
            { id: 'canRemoveMember', name: 'Gruptan Üye Çıkarma' },
            { id: 'canSendPrivateMessage', name: 'Özel Mesaj Gönderme' },
            { id: 'canSendGroupMessage', name: 'Grup Mesajı Gönderebilme' },
        ]
    },
    { id: 'conversation_history', name: 'Konuşma Geçmişi', path: '/conversation-history' },
    { 
        id: 'user_management', 
        name: 'Kullanıcı Yönetimi', 
        path: '/user-management',
        subPermissions: [
            { id: 'canDeleteUser', name: 'Kullanıcı Silebilme' },
            { id: 'canEditUserInfo', name: 'Kişisel Bilgileri Düzenleyebilme' },
            { id: 'canAssignRole', name: 'Rol Atayabilme' },
            { id: 'canSendMessageToUser', name: 'Mesaj Gönderebilme' },
            { id: 'canAddNewUser', name: 'Yeni Kullanıcı Ekleyebilme' },
        ]
    },
    { 
        id: 'role_management', 
        name: 'Rol Yönetimi', 
        path: '/role-management',
        subPermissions: [
            { id: 'canAddNewRole', name: 'Yeni Rol Ekleyebilme' },
            { id: 'canUpdateRole', name: 'Rol Güncelleyebilme' },
            { id: 'canDeleteRole', name: 'Rol Silme' },
        ]
    },
    { id: 'permission_management', name: 'Yetki Yönetimi', path: '/permission-management' },
    { id: 'quality_control', name: 'Kalite Kontrol / Eğitim', path: '/quality-control' },
    { id: 'detailed_reports', name: 'Detaylı Rapor Analizi', path: '/detailed-reports' },
    { id: 'definitions', name: 'Tanımlamalar', path: '/definitions' },
    { id: 'settings', name: 'Ayarlar', path: '/settings' },
    { id: 'create_ticket', name: 'Ticket Oluştur', path: '/create-ticket' },
    { id: 'time_management', name: 'Zaman Yönetimi', path: '/time-management', subPermissions: [
        { id: 'viewAll', name: 'Tüm Kullanıcıları Görüntüleyebilme' },
        { id: 'viewMissingWorkReport', name: 'Eksik Çalışma Raporunu Görebilme' }
    ] },
    { id: 'vardiya_management', name: 'Vardiya Yönetimi', path: '/vardiya-management', subPermissions: [
        { id: 'createVardiya', name: 'Vardiya Oluşturabilme' },
        { id: 'editVardiya', name: 'Vardiya Düzenleyebilme' },
        { id: 'deleteVardiya', name: 'Vardiya Silebilme' },
        { id: 'assignVardiya', name: 'Vardiya Atayabilme' }
    ] },
]; 