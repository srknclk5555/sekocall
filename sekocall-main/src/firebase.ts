// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBI-Xccgwj4fUZyLDDNhGQyrmbsuhc5m_8",
  authDomain: "gptberber.firebaseapp.com",
  projectId: "gptberber",
  storageBucket: "gptberber.appspot.com",
  messagingSenderId: "1098390485222",
  appId: "1:1098390485222:web:878f234b0fd10ff1a0e327",
  measurementId: "G-T9KM5FQJR5",
  databaseURL: "https://gptberber-default-rtdb.firebaseio.com/",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app); 