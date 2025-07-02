import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  signOut, 
  createUserWithEmailAndPassword,
  User as FirebaseUser
} from 'firebase/auth';
import { db, rtdb } from '../firebase';
import { doc, getDoc, setDoc, query, collection, getDocs, where } from "firebase/firestore";
import { ref as dbRef, set, onValue, onDisconnect, serverTimestamp } from "firebase/database";

const auth = getAuth();

interface User {
  uid: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
  permissions?: { [key: string]: boolean | { [key: string]: boolean } };
  timestamp: Date;
}

interface UserContextType {
  user: User | null;
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  loading: boolean;
  signup: (email: string, password: string, firstName: string, lastName: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, additionalData: { firstName: string, lastName: string }) => Promise<{ success: boolean; error?: string }>;
}

export const AuthContext = createContext<UserContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const register = async (email: string, password: string, additionalData: { firstName: string, lastName: string }) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      await setDoc(userDocRef, {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        firstName: additionalData.firstName,
        lastName: additionalData.lastName,
        name: `${additionalData.firstName} ${additionalData.lastName}`,
        createdAt: serverTimestamp(),
        roles: ['Operator'], // Default role
      });
      return { success: true };
    } catch (error: any) {
      // Handle errors here
      return { success: false, error: error.message };
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const docSnap = await getDoc(userDocRef);
        
        if (docSnap.exists()) {
          const userData = docSnap.data();
          let userPermissions: { [key: string]: any } = {};

          if (userData.role) {
            const roleQuery = query(collection(db, "roles"), where("name", "==", userData.role));
            const roleSnapshot = await getDocs(roleQuery);
            
            if (!roleSnapshot.empty) {
              const roleData = roleSnapshot.docs[0].data();
              if (roleData.permissions) {
                userPermissions = roleData.permissions;
              }
            }
          }

          setUser({
            uid: firebaseUser.uid,
            name: `${userData.firstName} ${userData.lastName}`,
            email: firebaseUser.email || '',
            avatar: userData.avatar,
            role: userData.role,
            permissions: userPermissions,
            timestamp: new Date(userData.createdAt.toDate()),
          });

          const userStatusDatabaseRef = dbRef(rtdb, '/status/' + firebaseUser.uid);
          const isOfflineForDatabase = { state: 'offline', last_changed: serverTimestamp() };
          const isOnlineForDatabase = { state: 'online', last_changed: serverTimestamp() };
          
          const connectedRef = dbRef(rtdb, '.info/connected');
          onValue(connectedRef, (snapshot) => {
              if (snapshot.val() === false) {
                  return;
              }
              
              onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase).then(() => {
                  set(userStatusDatabaseRef, isOnlineForDatabase);
              });
          });
        } else {
            setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLoading(false);
      return { success: true };
    } catch (error: any) {
      console.error("Firebase login error:", error);
      setLoading(false);
      return { success: false, error: error.message };
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      if (firebaseUser) {
        await setDoc(doc(db, "users", firebaseUser.uid), {
          firstName,
          lastName,
          email: firebaseUser.email,
          role: 'Temsilci',
          department: 'Müşteri Hizmetleri',
          callType: 'blended',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return { success: true };
      }
      setLoading(false);
      return { success: false, error: "User creation failed." };
    } catch (error: any) {
      console.error("Signup error:", error);
      let errorMessage = "Kayıt sırasında bir hata oluştu.";
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "Bu e-posta adresi zaten kullanılıyor.";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "Şifre çok zayıf. Lütfen en az 6 karakterli bir şifre seçin.";
      }
      setLoading(false);
      return { success: false, error: errorMessage };
    }
  }, []);

  const logout = useCallback(async () => {
    if (!auth.currentUser) {
      console.error("Logout attempt without a current user.");
      return;
    }
    try {
      // 1. Get the reference to the user's status in RTDB
      const userStatusDatabaseRef = dbRef(rtdb, '/status/' + auth.currentUser.uid);

      // 2. Define the offline state
      const isOfflineForDatabase = { 
        state: 'offline', 
        last_changed: serverTimestamp() 
      };

      // 3. Explicitly set the status to offline BEFORE signing out
      await set(userStatusDatabaseRef, isOfflineForDatabase);

      // 4. Sign out from Firebase Auth
      await signOut(auth);
      
      // 5. Clear local user state
      setUser(null);

    } catch (error) {
        console.error("Sign out error:", error);
    }
  }, []);

  const value = useMemo(() => ({
    user,
    currentUser: user,
    loading,
    isAuthenticated: !loading && !!user,
    login,
    logout,
    signup,
    register,
  }), [user, loading, login, logout, signup, register]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
