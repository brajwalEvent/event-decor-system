"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const SUPER_ADMIN_EMAIL = "event.brajwal@gmail.com";

interface AuthContextType {
  user: User | null;
  role: "admin" | "production" | "sales" | null;
  isSuperAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isSuperAdmin: false,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<"admin" | "production" | "sales" | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser && currentUser.email) {
        const emailLower = currentUser.email.toLowerCase();
        
        // Automatic Super Admin check
        if (emailLower === SUPER_ADMIN_EMAIL.toLowerCase()) {
          setIsSuperAdmin(true);
          setRole("admin");
          // Ensure doc in Firestore
          await setDoc(doc(db, "users", currentUser.uid), {
            uid: currentUser.uid,
            email: emailLower,
            displayName: "Super Admin",
            role: "admin",
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } else {
          setIsSuperAdmin(false);
          // Fetch assigned role from Firestore
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role || "sales");
          } else {
            setRole("sales");
          }
        }
      } else {
        setRole(null);
        setIsSuperAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, isSuperAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);