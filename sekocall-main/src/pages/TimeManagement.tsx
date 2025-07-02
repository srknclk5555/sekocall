import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, addDoc, getDocs, updateDoc, doc, Timestamp, orderBy, deleteDoc, runTransaction } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { collection as fbCollection, getDocs as fbGetDocs } from 'firebase/firestore';
import type { VardiyaAtama } from './VardiyaYonetimi';

const BREAK_TYPES = [
  { id: 'lunch', label: 'Yemek', max: 60 * 60 }, // 1 saat
  { id: 'break', label: 'Mola', max: 10 * 60 }, // 10dk, hak kaldırıldı
  { id: 'sick', label: 'Hastalık' },
  { id: 'meeting', label: 'Toplantı' },
  { id: 'training', label: 'Eğitim' },
  { id: 'extra', label: 'Extra' },
  { id: 'callback', label: 'Callback' },
  { id: 'logout', label: 'Çıkış' },
];

interface Session {
  id: string;
  userId: string;
  startTime: Timestamp;
  endTime?: Timestamp;
  type: string;
  status: string;
}

const TimeManagement: React.FC = () => {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [activeVardiya, setActiveVardiya] = useState<VardiyaAtama | null>(null);
  const [vardiyaEndResetChecked, setVardiyaEndResetChecked] = useState(false);
  const [excessRest, setExcessRest] = useState(0); // Fazla mola+yemek süresi (saniye)
  const [missingWork, setMissingWork] = useState(0); // Eksik çalışma süresi (saniye)
  const [excessRestHistory, setExcessRestHistory] = useState<{date: string, seconds: number}[]>([]);
  const [missingWorkHistory, setMissingWorkHistory] = useState<{date: string, seconds: number}[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showExcessModal, setShowExcessModal] = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');
  const [filteredHistory, setFilteredHistory] = useState<Session[]>([]);
  const [excessStart, setExcessStart] = useState('');
  const [excessEnd, setExcessEnd] = useState('');
  const [filteredExcess, setFilteredExcess] = useState<{date: string, seconds: number}[]>([]);
  const [missingStart, setMissingStart] = useState('');
  const [missingEnd, setMissingEnd] = useState('');
  const [filteredMissing, setFilteredMissing] = useState<{date: string, seconds: number}[]>([]);
  const [missingReportData, setMissingReportData] = useState<{userId: string, userName: string, total: number, days: number}[]>([]);
  const [showMissingDetailModal, setShowMissingDetailModal] = useState(false);
  const [selectedMissingUserDetail, setSelectedMissingUserDetail] = useState<{date: string, missingSeconds: number}[]>([]);
  const [userList, setUserList] = useState<{id: string, name: string}[]>([]);

  // Kullanıcı yetkisi kontrolü
  const canViewMissingWorkReport = !!user?.permissions?.time_management && typeof user.permissions.time_management === 'object' && user.permissions.time_management.viewMissingWorkReport;

  // Ana oturum (callback) ve diğer aktif session'ları ayır
  const mainSession = sessions.find(s => !s.endTime && s.type === 'callback');
  const otherActiveSession = sessions.find(s => !s.endTime && s.type !== 'callback' && [
    'lunch', 'break', 'sick', 'meeting', 'training', 'extra', 'logout'
  ].includes(s.type));

  // Ana oturumun toplam süresi (gün içindeki tüm callback session'larının toplamı)
  const totalMainSessionDuration = sessions.filter(s => s.type === 'callback').reduce((acc, s) => acc + ((s.endTime ? s.endTime.toDate().getTime() : Date.now()) - s.startTime.toDate().getTime()) / 1000, 0);

  // Ana oturumun canlı süresi (aktif session varsa, onun süresiyle güncellenir)
  const [mainSessionDuration, setMainSessionDuration] = useState(0);
  useEffect(() => {
    if (!mainSession) return;
    const start = mainSession.startTime.toDate().getTime();
    const interval = setInterval(() => {
      setMainSessionDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [mainSession]);

  // Diğer aktif session süresi
  const [otherSessionDuration, setOtherSessionDuration] = useState(0);
  useEffect(() => {
    if (!otherActiveSession) return;
    const start = otherActiveSession.startTime.toDate().getTime();
    const interval = setInterval(() => {
      setOtherSessionDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [otherActiveSession]);

  // Aktif session'ı ve geçmişi Firestore'dan çek
  const fetchSessions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, 'user_sessions'),
      where('userId', '==', user.uid),
      where('startTime', '>=', Timestamp.fromDate(today)),
      orderBy('startTime', 'asc')
    );
    const snapshot = await getDocs(q);
    const allSessions = snapshot.docs.map(docData => ({ id: docData.id, ...(docData.data() as Omit<Session, 'id'>) }));
    setSessions(allSessions);
    // Sadece callback, lunch, break, sick, meeting, training, extra, logout tipleri aktif session olarak kabul edilsin
    const active = allSessions.find(s => !s.endTime && [
      'callback', 'lunch', 'break', 'sick', 'meeting', 'training', 'extra', 'logout'
    ].includes(s.type));
    setActiveSession(active || null);
    setLoading(false);
  }, [user]);

  // Aktif session süresini güncelle
  useEffect(() => {
    if (!activeSession) return;
    const start = activeSession.startTime.toDate().getTime();
    const interval = setInterval(() => {
      setSessionDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  // Sayfa açıldığında sessionları çek
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Vardiya bilgisini çek
  useEffect(() => {
    const fetchVardiya = async () => {
      if (!user) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const vardiyaSnap = await fbGetDocs(fbCollection(db, 'vardiya_atamalari'));
      const vardiyalar = vardiyaSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as VardiyaAtama[];
      // Bugün kullanıcının aktif vardiyasını bul
      const todayStr = today.toISOString().split('T')[0];
      const userVardiya = vardiyalar.find(v => v.userId === user?.uid && new Date(v.startDate) <= today && new Date(v.endDate) >= today && !(v.offDays || []).includes(String(today.getDay())));
      setActiveVardiya(userVardiya || null);
    };
    fetchVardiya();
  }, [user]);

  // Hak ve süre hesaplama
  const totalLunch = sessions.filter(s => s.type === 'lunch').reduce((acc, s) => acc + ((s.endTime ? s.endTime.toDate().getTime() : Date.now()) - s.startTime.toDate().getTime()) / 1000, 0);
  const todayBreaks = sessions.filter(s => s.type === 'break');
  const totalBreak = todayBreaks.reduce((acc, s) => acc + ((s.endTime ? s.endTime.toDate().getTime() : Date.now()) - s.startTime.toDate().getTime()) / 1000, 0);

  // Vardiya bitişinden 3 saat sonra sıfırlama kontrolü
  useEffect(() => {
    if (!activeVardiya || vardiyaEndResetChecked || !user) return;
    const now = new Date();
    // Vardiya bitiş saatini bul
    let vardiyaEnd = new Date(activeVardiya.endDate + 'T18:00');
    if (activeVardiya.vardiyaId && activeVardiya.endDate) {
      // Vardiya tanımını bul
      const vardiyaDef = (window as any).vardiyalarList
        ? (window as any).vardiyalarList.find((v: any) => v.id === activeVardiya.vardiyaId)
        : null;
      if (vardiyaDef && vardiyaDef.endTime) {
        vardiyaEnd = new Date(activeVardiya.endDate + 'T' + vardiyaDef.endTime);
      }
    }
    vardiyaEnd.setSeconds(0, 0);
    const resetTime = new Date(vardiyaEnd.getTime() + 3 * 60 * 60 * 1000);
    if (now > resetTime) {
      // Sıfırlama işlemi: Kullanıcının bugünkü sessionlarını bitir
      const resetSessions = async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const q = query(
          collection(db, 'user_sessions'),
          where('userId', '==', user.uid),
          where('startTime', '>=', Timestamp.fromDate(today)),
          orderBy('startTime', 'asc')
        );
        const snapshot = await getDocs(q);
        const allSessions = snapshot.docs.map(docData => ({ id: docData.id, ...(docData.data() as Omit<Session, 'id'>) }));
        for (const s of allSessions) {
          if (!s.endTime) {
            await updateDoc(doc(db, 'user_sessions', s.id), {
              endTime: Timestamp.now(),
              status: 'ended',
            });
          }
        }
        setVardiyaEndResetChecked(true);
        fetchSessions();
      };
      resetSessions();
    }
  }, [activeVardiya, user, vardiyaEndResetChecked]);

  // Fazla mola+yemek süresi hesaplama ve kaydetme
  useEffect(() => {
    // 1 saat yemek + 30dk mola = 5400 saniye
    const totalRest = totalLunch + totalBreak;
    const excess = Math.max(0, totalRest - 5400);
    setExcessRest(excess);
    // Fazla kullanım varsa Firestore'a kaydet
    const saveExcess = async () => {
      if (!user) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (excess > 0) {
        await addDoc(collection(db, 'user_excess_rest'), {
          userId: user.uid,
          date: today.toISOString().split('T')[0],
          excessSeconds: excess,
          createdAt: Timestamp.now(),
        });
      }
    };
    if (excess > 0) saveExcess();
  }, [totalLunch, totalBreak, user]);

  // Eksik çalışma süresi hesaplama ve kaydetme
  useEffect(() => {
    // 7.5 saat = 450 dakika = 27000 saniye
    const requiredWork = 27000;
    const workSeconds = sessions.filter(s => s.type === 'callback').reduce((acc, s) => acc + ((s.endTime ? s.endTime.toDate().getTime() : Date.now()) - s.startTime.toDate().getTime()) / 1000, 0);
    const missing = Math.max(0, requiredWork - workSeconds);
    setMissingWork(missing);
    // Eksik çalışma varsa Firestore'a kaydet
    const saveMissing = async () => {
      if (!user) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      if (missing > 0 && missing < 8 * 60 * 60) {
        await runTransaction(db, async (transaction) => {
          const q = query(
            collection(db, 'user_missing_work'),
            where('userId', '==', user.uid),
            where('date', '==', todayStr)
          );
          // Transaction snapshot ile alınmalı!
          const snap = await transaction.get(q);
          // Tüm eski kayıtları sil
          snap.forEach(docSnap => {
            transaction.delete(docSnap.ref);
          });
          // Tek kayıt ekle
          const newDocRef = doc(collection(db, 'user_missing_work'));
          transaction.set(newDocRef, {
            userId: user.uid,
            date: todayStr,
            missingSeconds: missing,
            createdAt: Timestamp.now(),
          });
        });
      }
    };
    if (missing > 0) saveMissing();
  }, [sessions, user]);

  // Son 7 günün fazla mola/yemek ve eksik çalışma kayıtlarını çek
  useEffect(() => {
    if (!user) return;
    const fetchHistory = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
      // Fazla dinlenme
      const excessSnap = await getDocs(query(collection(db, 'user_excess_rest'), where('userId', '==', user.uid)));
      const excessList = excessSnap.docs.map(doc => ({
        date: doc.data().date,
        seconds: doc.data().excessSeconds
      })).filter(e => new Date(e.date) >= sevenDaysAgo).sort((a, b) => a.date.localeCompare(b.date));
      setExcessRestHistory(excessList);
      // Eksik çalışma
      const missingSnap = await getDocs(query(collection(db, 'user_missing_work'), where('userId', '==', user.uid)));
      const missingList = missingSnap.docs.map(doc => ({
        date: doc.data().date,
        seconds: doc.data().missingSeconds
      })).filter(e => new Date(e.date) >= sevenDaysAgo).sort((a, b) => a.date.localeCompare(b.date));
      setMissingWorkHistory(missingList);
    };
    fetchHistory();
  }, [user]);

  // Geçmiş durumlar filtreleme
  useEffect(() => {
    if (!showHistoryModal) return;
    if (!historyStart && !historyEnd) {
      setFilteredHistory(sessions);
      return;
    }
    setFilteredHistory(
      sessions.filter(s => {
        const d = s.startTime.toDate();
        if (historyStart && d < new Date(historyStart)) return false;
        if (historyEnd && d > new Date(historyEnd + 'T23:59:59')) return false;
        return true;
      })
    );
  }, [showHistoryModal, historyStart, historyEnd, sessions]);

  // Fazla dinlenme filtreleme
  useEffect(() => {
    if (!showExcessModal) return;
    if (!excessStart && !excessEnd) {
      setFilteredExcess(excessRestHistory);
      return;
    }
    setFilteredExcess(
      excessRestHistory.filter(e => {
        if (excessStart && new Date(e.date) < new Date(excessStart)) return false;
        if (excessEnd && new Date(e.date) > new Date(excessEnd)) return false;
        return true;
      })
    );
  }, [showExcessModal, excessStart, excessEnd, excessRestHistory]);

  // Eksik çalışma filtreleme
  useEffect(() => {
    if (!showMissingModal) return;
    if (!missingStart && !missingEnd) {
      setFilteredMissing(missingWorkHistory);
      return;
    }
    setFilteredMissing(
      missingWorkHistory.filter(e => {
        if (missingStart && new Date(e.date) < new Date(missingStart)) return false;
        if (missingEnd && new Date(e.date) > new Date(missingEnd)) return false;
        return true;
      })
    );
  }, [showMissingModal, missingStart, missingEnd, missingWorkHistory]);

  // handleStart fonksiyonu güncellendi: mola/yemek başlatıldığında aktif callback session'ı bitir
  const handleStart = async (type: string) => {
    if (!user) return;
    if (type === 'callback') {
      if (mainSession) {
        setWarning('Zaten aktif bir ana oturumunuz var.');
        return;
      }
      const newSession = {
        userId: user.uid,
        startTime: Timestamp.now(),
        type: 'callback',
        status: 'active',
      };
      await addDoc(collection(db, 'user_sessions'), newSession);
      fetchSessions();
      setWarning(null);
      return;
    }
    // Diğer durumlar için
    if (otherActiveSession) {
      setWarning('Önce mevcut aktif durumu bitirmelisiniz.');
      return;
    }
    // Mola ve yemek için hak/süre kontrolü
    if (type === 'lunch') {
      const totalLunch = sessions.filter(s => s.type === 'lunch').reduce((acc, s) => acc + ((s.endTime ? s.endTime.toDate().getTime() : Date.now()) - s.startTime.toDate().getTime()) / 1000, 0);
      if (totalLunch >= 60 * 60) {
        setWarning('Günlük yemek süresi hakkınız doldu!');
        return;
      }
    }
    if (type === 'sick') {
      setWarning('Hastalık durumu başlatıldı. Lütfen sistemden çıkış yapınız.');
    }
    // Eğer aktif bir callback session varsa, onu bitir
    if (mainSession) {
      await updateDoc(doc(db, 'user_sessions', mainSession.id), {
        endTime: Timestamp.now(),
        status: 'ended',
      });
    }
    const newSession = {
      userId: user.uid,
      startTime: Timestamp.now(),
      type,
      status: 'active',
    };
    await addDoc(collection(db, 'user_sessions'), newSession);
    fetchSessions();
    setWarning(null);
  };

  // handleEnd fonksiyonu güncellendi: mola/yemek bitirilirse otomatik olarak yeni bir callback session başlat
  const handleEnd = async (type?: string) => {
    if (!user) return;
    if (type === 'callback' && mainSession) {
      await updateDoc(doc(db, 'user_sessions', mainSession.id), {
        endTime: Timestamp.now(),
        status: 'ended',
      });
      fetchSessions();
      setWarning(null);
      return;
    }
    if (otherActiveSession) {
      await updateDoc(doc(db, 'user_sessions', otherActiveSession.id), {
        endTime: Timestamp.now(),
        status: 'ended',
      });
      // Otomatik olarak yeni bir callback session başlat
      const newSession = {
        userId: user.uid,
        startTime: Timestamp.now(),
        type: 'callback',
        status: 'active',
      };
      await addDoc(collection(db, 'user_sessions'), newSession);
      fetchSessions();
      setWarning(null);
      return;
    }
  };

  // Bildirim fonksiyonu
  function sendNotification(title: string, body: string) {
    if (window.Notification && Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (window.Notification && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body });
        }
      });
    }
  }

  // Süre aşımı kontrolü
  useEffect(() => {
    if (activeSession) {
      if (activeSession.type === 'lunch' && sessionDuration > 60 * 60) {
        setWarning('Yemek süresi aşıldı!');
        sendNotification('Yemek Süresi Aşıldı', 'Yemek süresi hakkınızı aştınız. Fazla süre kaydedilecek.');
      } else if (activeSession.type === 'break' && sessionDuration > 10 * 60) {
        setWarning('Mola süresi aşıldı!');
        sendNotification('Mola Süresi Aşıldı', 'Mola süresi hakkınızı aştınız. Fazla süre kaydedilecek.');
      } else {
        setWarning(null);
      }
    } else {
      setWarning(null);
    }
  }, [activeSession, sessionDuration]);

  // UI
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // Kullanıcı listesini çek
  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, 'users'));
      setUserList(snap.docs.map(doc => ({ id: doc.id, name: `${doc.data().firstName || ''} ${doc.data().lastName || ''}`.trim() })));
    };
    fetchUsers();
  }, []);

  // Eksik Çalışma Raporu Tablosu (Yönetici ve yetkili kullanıcılar için)
  useEffect(() => {
    if (!canViewMissingWorkReport) return;
    const fetchMissingReport = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const q = query(collection(db, 'user_missing_work'));
      const snap = await getDocs(q);
      let all = snap.docs.map(doc => doc.data());
      if (missingStart) all = all.filter((d: any) => d.date >= missingStart);
      if (missingEnd) all = all.filter((d: any) => d.date <= missingEnd);
      const grouped: { [userId: string]: { userId: string, userName: string, total: number, days: number, details: any[] } } = {};
      for (const d of all) {
        if (!grouped[d.userId]) grouped[d.userId] = { userId: d.userId, userName: userList.find(u => u.id === d.userId)?.name || d.userId, total: 0, days: 0, details: [] };
        grouped[d.userId].total += d.missingSeconds;
        grouped[d.userId].details.push(d);
      }
      Object.values(grouped).forEach(g => g.days = g.details.length);
      setMissingReportData(Object.values(grouped));
    };
    fetchMissingReport();
  }, [canViewMissingWorkReport, missingStart, missingEnd, userList]);

  const openMissingDetail = (user: {userId: string, userName: string, total: number, days: number, details: any[]}) => {
    setSelectedMissingUserDetail(user.details);
    setShowMissingDetailModal(true);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Zaman Yönetimi</h1>
      {loading ? (
        <div>Yükleniyor...</div>
      ) : (
        <>
          {warning && <div className="mb-4 text-red-600 font-semibold">{warning}</div>}
          {/* Ana oturum (callback) */}
          <div className="mb-4">
            <div className="text-lg font-semibold">Ana Oturum (Callback):</div>
            <div className="text-2xl font-mono">
              {mainSession ? `${formatDuration(mainSessionDuration)}` : 'Başlatılmadı'}
            </div>
            <div className="text-sm text-gray-400">Toplam: {formatDuration(totalMainSessionDuration)}</div>
            <button
              className={`mt-2 px-4 py-2 rounded ${mainSession ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}
              onClick={() => mainSession ? handleEnd('callback') : handleStart('callback')}
            >
              {mainSession ? 'Callback Oturumunu Bitir' : 'Callback (Ana Oturumu Başlat)'}
            </button>
          </div>
          {/* Diğer aktif sessionlar için */}
          {otherActiveSession && (
            <div className="mb-4 text-yellow-700 font-semibold">
              Aktif bir durumunuz var: {BREAK_TYPES.find(b => b.id === otherActiveSession.type)?.label || otherActiveSession.type} - {formatDuration(otherSessionDuration)}
              <button
                className="ml-4 px-4 py-2 rounded bg-red-500 text-white"
                onClick={() => handleEnd()}
              >
                Durumu Bitir
              </button>
            </div>
          )}
          <div className="mb-6">
            <div className="font-semibold mb-2">Durum Seçenekleri:</div>
            <div className="flex flex-wrap gap-2">
              {BREAK_TYPES.filter(b => b.id !== 'callback').map(b => (
                <button
                  key={b.id}
                  className={`px-4 py-2 rounded ${otherActiveSession?.type === b.id ? 'bg-yellow-400 text-black' : 'bg-gray-200 dark:bg-gray-700 dark:text-white'}`}
                  onClick={() => otherActiveSession?.type === b.id ? handleEnd() : handleStart(b.id)}
                  disabled={!!otherActiveSession && otherActiveSession.type !== b.id}
                >
                  {otherActiveSession?.type === b.id ? `${b.label} Bitir` : b.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded">
              <div className="font-semibold">Kalan Yemek Süresi</div>
              <div className={totalLunch >= 60 * 60 ? 'text-red-600' : ''}>{formatDuration(Math.max(0, 60 * 60 - totalLunch))}</div>
            </div>
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded">
              <div className="font-semibold">Kalan Mola Süresi</div>
              <div className={totalBreak >= 30 * 60 ? 'text-red-600' : ''}>Kalan Süre: {formatDuration(Math.max(0, 30 * 60 - totalBreak))}</div>
            </div>
          </div>
          {/* Geçmiş ve rapor butonları */}
          <div className="mb-6 flex flex-wrap gap-2">
            <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={() => setShowHistoryModal(true)}>Geçmiş Durumlar</button>
            <button className="px-4 py-2 bg-purple-500 text-white rounded" onClick={() => setShowExcessModal(true)}>Fazla Dinlenme Geçmişi</button>
            {canViewMissingWorkReport && (
              <button className="px-4 py-2 bg-pink-500 text-white rounded" onClick={() => setShowMissingModal(true)}>Eksik Çalışma Geçmişi</button>
            )}
          </div>
          {/* Fazla kullanım ve eksik çalışma özetleri */}
          <div className="mb-6">
            <div className="font-semibold">Fazla Kullanılan Dinlenme Süresi (Bugün)</div>
            <div className={excessRest > 0 ? 'text-red-600 font-bold' : 'text-gray-700'}>
              {excessRest > 0 ? `${formatDuration(excessRest)} (Fazla kullanım!)` : 'Fazla kullanım yok'}
            </div>
          </div>
          <div className="mb-6">
            <div className="font-semibold">Eksik Tamamlanmamış Çalışma Süresi (Bugün)</div>
            <div className={missingWork > 0 ? 'text-red-600 font-bold' : 'text-gray-700'}>
              {missingWork > 0 ? `${formatDuration(missingWork)} (Eksik çalışma!)` : 'Eksik yok'}
            </div>
          </div>

          {/* Geçmiş Durumlar Modal */}
          {showHistoryModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Geçmiş Durumlar</h2>
                  <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">Kapat</button>
                </div>
                <div className="flex gap-2 mb-4">
                  <input type="date" value={historyStart} onChange={e => setHistoryStart(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                  <span>-</span>
                  <input type="date" value={historyEnd} onChange={e => setHistoryEnd(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                </div>
                <ul className="space-y-1">
                  {filteredHistory.length === 0 && <li className="text-gray-500">Kayıt yok</li>}
                  {filteredHistory.map((s, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-bold">{BREAK_TYPES.find(bt => bt.id === s.type)?.label || s.type}:</span> {s.startTime.toDate().toLocaleDateString()} {s.startTime.toDate().toLocaleTimeString()} - {s.endTime ? s.endTime.toDate().toLocaleTimeString() : 'Devam Ediyor'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Fazla Dinlenme Modal */}
          {showExcessModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Fazla Dinlenme Geçmişi</h2>
                  <button onClick={() => setShowExcessModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">Kapat</button>
                </div>
                <div className="flex gap-2 mb-4">
                  <input type="date" value={excessStart} onChange={e => setExcessStart(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                  <span>-</span>
                  <input type="date" value={excessEnd} onChange={e => setExcessEnd(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                </div>
                <ul className="space-y-1">
                  {filteredExcess.length === 0 && <li className="text-gray-500">Kayıt yok</li>}
                  {filteredExcess.map((e, i) => (
                    <li key={i} className={e.seconds > 0 ? 'text-red-600' : 'text-gray-500'}>
                      {e.date}: {formatDuration(e.seconds)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Eksik Çalışma Modal */}
          {canViewMissingWorkReport && showMissingModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Eksik Çalışma Geçmişi</h2>
                  <button onClick={() => setShowMissingModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">Kapat</button>
                </div>
                <div className="flex gap-2 mb-4">
                  <input type="date" value={missingStart} onChange={e => setMissingStart(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                  <span>-</span>
                  <input type="date" value={missingEnd} onChange={e => setMissingEnd(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                </div>
                <ul className="space-y-1">
                  {filteredMissing.length === 0 && <li className="text-gray-500">Kayıt yok</li>}
                  {filteredMissing.map((e, i) => (
                    <li key={i} className={e.seconds > 0 ? 'text-red-600' : 'text-gray-500'}>
                      {e.date}: {formatDuration(e.seconds)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Eksik Çalışma Raporu Tablosu (Yönetici ve yetkili kullanıcılar için) */}
          {canViewMissingWorkReport && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4">Eksik Çalışma Raporu</h2>
              <div className="mb-6 flex gap-2">
                <input type="date" value={missingStart} onChange={e => setMissingStart(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                <span>-</span>
                <input type="date" value={missingEnd} onChange={e => setMissingEnd(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
              </div>
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Kullanıcı</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Toplam Eksik Süre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Saat</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {missingReportData.length === 0 && <tr><td colSpan={4} className="text-center text-gray-500">Kayıt yok</td></tr>}
                  {missingReportData.map((u, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{u.userName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold">{formatDuration(u.total)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(u.total / 3600).toFixed(2)} saat</td>
                      <td className="px-6 py-4"><button className="text-blue-500 underline" onClick={() => openMissingDetail(u)}>Detay</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Kullanıcı detay modalı */}
              {showMissingDetailModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-semibold">Kullanıcı Detayı</h2>
                      <button onClick={() => setShowMissingDetailModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">Kapat</button>
                    </div>
                    <ul className="space-y-1">
                      {selectedMissingUserDetail.length === 0 && <li className="text-gray-500">Kayıt yok</li>}
                      {Object.entries(selectedMissingUserDetail.reduce((acc, cur) => {
                        if (!acc[cur.date]) acc[cur.date] = 0;
                        acc[cur.date] += cur.missingSeconds;
                        return acc;
                      }, {} as Record<string, number>)).sort(([a], [b]) => a.localeCompare(b)).map(([date, total], i) => (
                        <li key={i} className={total > 0 ? 'text-red-600' : 'text-gray-500'}>
                          {date}: {formatDuration(total)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimeManagement; 