"use client";
import React, { useState } from "react";
import { auth, db } from "../../lib/firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

const SUPER_ADMIN_EMAIL = "event.brajwal@gmail.com";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isFirstTimeAdminSetup, setIsFirstTimeAdminSetup] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const cleanEmail = email.trim().toLowerCase();
    const isSuperAdminUser = cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase();

    try {
      if (isFirstTimeAdminSetup) {
        if (!isSuperAdminUser) {
          setError(`First time setup is only allowed for the Super Admin (${SUPER_ADMIN_EMAIL}).`);
          setSubmitting(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await setDoc(doc(db, "users", userCredential.user.uid), {
          uid: userCredential.user.uid,
          displayName: "Super Admin",
          email: cleanEmail,
          role: "admin",
          createdAt: new Date().toISOString(),
        });
        router.push("/admin/team");
      } else {
        // Regular Login
        const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
        
        if (isSuperAdminUser) {
          router.push("/admin/team");
        } else {
          // Check role in Firestore
          const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
          const userRole = userDoc.exists() ? userDoc.data().role : "sales";

          if (userRole === "sales") {
            router.push("/handovers");
          } else {
            router.push("/components");
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Invalid credentials. Please contact Super Admin.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-8 border-2 border-gray-300">
        <div className="text-center mb-6">
          <span className="font-black text-3xl tracking-tight text-gray-900">
            🎪 DECOR<span className="text-blue-600">OPS</span>
          </span>
          <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wider">
            {isFirstTimeAdminSetup ? "Super Admin Account Setup" : "Staff & Management Portal"}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-3 rounded-lg mb-4 text-xs font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-800 mb-1">Registered Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-2 border-gray-400 rounded-lg p-2.5 font-bold text-sm bg-white"
              placeholder="you@company.com or event.brajwal@gmail.com"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-gray-800 mb-1">Password *</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-gray-400 rounded-lg p-2.5 font-bold text-sm bg-white"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-lg font-black text-sm shadow transition disabled:opacity-50"
          >
            {submitting ? "Signing In..." : isFirstTimeAdminSetup ? "Set Admin Password & Enter" : "Sign In to Workspace"}
          </button>
        </form>

        {/* First time super admin toggle */}
        <div className="mt-6 pt-4 border-t border-gray-200 text-center">
          <button
            type="button"
            onClick={() => {
              setIsFirstTimeAdminSetup(!isFirstTimeAdminSetup);
              setEmail(isFirstTimeAdminSetup ? "" : SUPER_ADMIN_EMAIL);
              setError("");
            }}
            className="text-[11px] font-bold text-blue-700 hover:underline"
          >
            {isFirstTimeAdminSetup 
              ? "← Return to Regular Team Login" 
              : "First time logging in as Super Admin (event.brajwal@gmail.com)?"}
          </button>
        </div>
      </div>
    </div>
  );
}