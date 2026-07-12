import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc 
} from "firebase/firestore";

// Firebase configuration from firebase-applet-config.json
const firebaseConfig = {
  projectId: "booming-moonlight-cwjrd",
  appId: "1:166840661990:web:c42f76fc7f5aaebf6d0827",
  apiKey: "AIzaSyDFRPlj3EILMqn39HDrNVikBQUWqeDH2Mw",
  authDomain: "booming-moonlight-cwjrd.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-5604c736-ced6-44dc-a8ab-6842a42fea09",
  storageBucket: "booming-moonlight-cwjrd.firebasestorage.app",
  messagingSenderId: "166840661990"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID if provided
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

export { db };

/**
 * 간단한 사용자 정보와 데이터를 Firestore에 암호화하지 않고 저장하여 
 * 다른 기기에서도 로그인 및 불러오기가 가능하게 하는 헬퍼 함수들입니다.
 */

export interface CloudUserData {
  students: any[];
  classes: any[];
  mainSelections: Record<string, any>;
  updatedAt: string;
}

// 1. 회원가입
export async function registerCloudUser(username: string, password: string): Promise<void> {
  const normalizedUsername = username.trim().toLowerCase();
  const userRef = doc(db, "users", normalizedUsername);
  
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    throw new Error("이미 존재하는 아이디입니다.");
  }
  
  await setDoc(userRef, {
    username: username.trim(),
    password: password.trim(),
    createdAt: new Date().toISOString()
  });
}

// 2. 로그인
export async function loginCloudUser(username: string, password: string): Promise<string> {
  const normalizedUsername = username.trim().toLowerCase();
  const userRef = doc(db, "users", normalizedUsername);
  
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    throw new Error("존재하지 않는 아이디입니다.");
  }
  
  const userData = userSnap.data();
  if (userData.password !== password.trim()) {
    throw new Error("비밀번호가 일치하지 않습니다.");
  }
  
  return userData.username; // 원래 대소문자 케이스의 아이디 반환
}

// 3. 사용자 데이터 저장 (클라우드)
export async function saveCloudData(username: string, data: Omit<CloudUserData, "updatedAt">): Promise<void> {
  const normalizedUsername = username.trim().toLowerCase();
  const dataRef = doc(db, "userData", normalizedUsername);
  
  await setDoc(dataRef, {
    ...data,
    updatedAt: new Date().toISOString()
  });
}

// 4. 사용자 데이터 불러오기 (클라우드)
export async function loadCloudData(username: string): Promise<CloudUserData | null> {
  const normalizedUsername = username.trim().toLowerCase();
  const dataRef = doc(db, "userData", normalizedUsername);
  
  const dataSnap = await getDoc(dataRef);
  if (dataSnap.exists()) {
    return dataSnap.data() as CloudUserData;
  }
  return null;
}
