# Çağrı Merkezi Uygulaması

Modern ve kullanıcı dostu internet servis sağlayıcısı çağrı merkezi uygulaması.

## Özellikler

### 🔐 Kullanıcı Yönetimi
- Güvenli giriş sistemi (kullanıcı adı/şifre)
- Oturum yönetimi
- Kullanıcı profil bilgileri

### 📞 Çağrı Yönetimi
- Gelen ve giden çağrı kayıtları
- Çağrı durumu takibi (tamamlandı, cevapsız, devam ediyor, planlandı)
- Çağrı süresi ve notları
- Temsilci atama

### 👥 Müşteri Yönetimi
- Müşteri bilgileri (ad, email, telefon, adres)
- Paket bilgileri ve durumları
- Müşteri geçmişi ve çağrı sayıları
- Müşteri durumu (aktif, pasif, askıya alınmış)

### 🎫 Talep/Şikayet Yönetimi
- Müşteri talepleri ve şikayetleri
- Öncelik seviyeleri (acil, yüksek, orta, düşük)
- Durum takibi (açık, işlemde, çözüldü, kapalı)
- Kategori bazlı sınıflandırma

### 📊 Raporlama ve Analitik
- Çağrı hacmi istatistikleri
- Performans metrikleri
- Müşteri memnuniyeti oranları
- Çözüm oranları ve ortalama süreler

### 🎨 Modern Arayüz
- Responsive tasarım (mobil uyumlu)
- Modern ve sade görünüm
- Kolay navigasyon
- Arama ve filtreleme özellikleri

## Teknolojiler

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Routing**: React Router DOM
- **Build Tool**: Vite

## Kurulum

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. Geliştirme sunucusunu başlatın:
```bash
npm run dev
```

3. Tarayıcınızda `http://localhost:3000` adresini açın

## Demo Giriş

- **Kullanıcı Adı**: `admin`
- **Şifre**: `admin123`

## Kullanım

### Dashboard
- Genel istatistikler ve özet bilgiler
- Son çağrılar listesi
- Hızlı erişim kartları

### Çağrılar
- Tüm çağrı kayıtlarını görüntüleme
- Arama ve filtreleme
- Çağrı detayları ve notları

### Müşteriler
- Müşteri listesi ve detayları
- Müşteri durumu yönetimi
- Paket bilgileri

### Talepler
- Müşteri talepleri ve şikayetleri
- Öncelik ve durum yönetimi
- Atama ve takip

### Raporlar
- Performans analizi
- İstatistiksel veriler
- Grafik ve metrikler

## Geliştirme

### Proje Yapısı
```
src/
├── components/     # Yeniden kullanılabilir bileşenler
├── contexts/       # React context'leri
├── pages/          # Sayfa bileşenleri
├── App.tsx         # Ana uygulama bileşeni
├── main.tsx        # Uygulama giriş noktası
└── index.css       # Global stiller
```

### Yeni Özellik Ekleme
1. İlgili sayfa bileşenini `src/pages/` klasöründe oluşturun
2. Routing'i `src/App.tsx` dosyasında güncelleyin
3. Navigasyon menüsünü `src/components/Layout.tsx` dosyasında güncelleyin

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır. 