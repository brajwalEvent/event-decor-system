"use client";
import React, { useState } from "react";
import { auth, db } from "../../lib/firebase";
import { 
  signInWithEmailAndPassword, 
  updatePassword, 
  sendPasswordResetEmail 
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

const SUPER_ADMIN_EMAIL = "event.brajwal@gmail.com";

export default function LoginPage() {
  const router = useRouter();

  // Login Mode: "team" | "admin"
  const [loginMode, setLoginMode] = useState<"team" | "admin">("team");

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Forgot Password Modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  // First-Time Password Reset Modal
  const [showFirstTimeModal, setShowFirstTimeModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentUserDocId, setCurrentUserDocId] = useState("");
  const [pendingRedirectUrl, setPendingRedirectUrl] = useState("/handovers");

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    const cleanEmail = (loginMode === "admin" ? SUPER_ADMIN_EMAIL : email).trim().toLowerCase();

    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const uid = userCredential.user.uid;

      if (loginMode === "admin" || cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
        router.push("/admin/team");
        return;
      }

      // Check user profile for role & first-time login
      const userDocSnap = await getDoc(doc(db, "users", uid));
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();

        // Check if user is logging in for the first time
        if (userData.isFirstLogin) {
          setCurrentUserDocId(uid);
          setPendingRedirectUrl(userData.role === "sales" ? "/handovers" : "/components");
          setShowFirstTimeModal(true);
          setSubmitting(false);
          return;
        }

        // Direct regular login
        if (userData.role === "sales") {
          router.push("/handovers");
        } else {
          router.push("/components");
        }
      } else {
        router.push("/handovers");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Invalid email or password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle First Time Password Creation
  const handleFirstTimePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match! Please re-enter accurately.");
      return;
    }

    setSubmitting(true);

    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        // Clear the isFirstLogin flag
        await updateDoc(doc(db, "users", currentUserDocId), {
          isFirstLogin: false,
          updatedAt: new Date().toISOString(),
        });
        alert("🎉 Permanent password set successfully! Entering your workspace...");
        router.push(pendingRedirectUrl);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Forgot Password (Sends verification email)
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setForgotSubmitting(true);

    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim().toLowerCase());
      setShowForgotModal(false);
      setMessage(`✅ Password reset link has been sent to ${forgotEmail}. Please check your inbox or spam folder.`);
      setForgotEmail("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to send reset email. Verify the email address.");
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-300">
        <div className="text-center mb-6">
          <span className="font-black text-3xl tracking-tight text-gray-900">
            🎪 DECOR<span className="text-blue-600">OPS</span>
          </span>
          <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wider">
            Event Decor Production & Handover Portal
          </p>
        </div>

        {/* TWO OPTIONS: Team Member Login vs Super Admin Login */}
        <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1.5 rounded-xl border border-gray-300 mb-6">
          <button
            type="button"
            onClick={() => {
              setLoginMode("team");
              setEmail("");
              setPassword("");
              setError("");
              setMessage("");
            }}
            className={`py-2.5 rounded-lg text-xs font-black transition ${
              loginMode === "team"
                ? "bg-white text-gray-900 shadow border border-gray-200"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            👥 Team Member Login
          </button>

          <button
            type="button"
            onClick={() => {
              setLoginMode("admin");
              setEmail(SUPER_ADMIN_EMAIL);
              setPassword("");
              setError("");
              setMessage("");
            }}
            className={`py-2.5 rounded-lg text-xs font-black transition ${
              loginMode === "admin"
                ? "bg-red-600 text-white shadow"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            👑 Super Admin Login
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-3 rounded-lg mb-4 text-xs font-bold">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-300 text-green-800 p-3 rounded-lg mb-4 text-xs font-bold">
            {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-800 mb-1">
              {loginMode === "admin" ? "Super Admin Account" : "Staff Work Email *"}
            </label>
            <input
              type="email"
              required
              disabled={loginMode === "admin"}
              value={loginMode === "admin" ? SUPER_ADMIN_EMAIL : email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full border-2 border-gray-400 rounded-lg p-2.5 font-bold text-sm ${
                loginMode === "admin" ? "bg-gray-100 text-gray-700 cursor-not-allowed" : "bg-white text-gray-900"
              }`}
              placeholder="name@company.com"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-black text-gray-800">Password *</label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(loginMode === "admin" ? SUPER_ADMIN_EMAIL : email);
                  setShowForgotModal(true);
                }}
                className="text-xs font-bold text-blue-700 hover:underline"
              >
                Forgot Password?
              </button>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-gray-400 rounded-lg p-2.5 font-bold text-sm bg-white text-gray-900"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3 rounded-lg font-black text-sm shadow transition disabled:opacity-50 ${
              loginMode === "admin" 
                ? "bg-red-600 hover:bg-red-700 text-white" 
                : "bg-gray-900 hover:bg-black text-white"
            }`}
          >
            {submitting ? "Signing In..." : loginMode === "admin" ? "Sign In as Super Admin" : "Sign In to Team Workspace"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500 font-semibold">
          Accounts are provisioned by management. Contact Super Admin for access.
        </p>

        {/* FORGOT PASSWORD MODAL (EMAIL VERIFICATION) */}
        {showForgotModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-sm w-full p-6 border-2 border-gray-400 shadow-2xl space-y-4">
              <h3 className="text-lg font-black text-gray-900">Reset Your Password</h3>
              <p className="text-xs text-gray-600 font-medium">
                Enter your work email address. We will send an official password reset link directly to your inbox.
              </p>

              <form onSubmit={handleForgotPassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg text-xs font-bold bg-white"
                    placeholder="you@company.com"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-3 py-1.5 border font-bold rounded text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotSubmitting}
                    className="px-4 py-1.5 bg-blue-600 text-white font-black rounded text-xs hover:bg-blue-700"
                  >
                    {forgotSubmitting ? "Sending..." : "Send Reset Email"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* FIRST-TIME LOGIN PASSWORD RESET MODAL */}
        {showFirstTimeModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-purple-500 shadow-2xl space-y-4">
              <div className="border-b pb-2">
                <span className="bg-purple-100 text-purple-900 text-xs uppercase font-black px-2 py-0.5 rounded">
                  First Time Sign-In
                </span>
                <h3 className="text-xl font-black text-gray-900 mt-1">
                  Create Your Permanent Password
                </h3>
                <p className="text-xs text-gray-600 font-semibold mt-0.5">
                  Welcome to the team! For security, please replace the temporary password assigned by management.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-300 text-red-700 p-2.5 rounded text-xs font-bold">
                  {error}
                </div>
              )}

              <form onSubmit={handleFirstTimePasswordReset} className="space-y-3">
                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">New Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2.5 rounded-lg text-sm font-bold bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Re-Enter New Password (Confirm) *</label>
                  <input
                    type="password"
                    required
                    placeholder="Must match the password above"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2.5 rounded-lg text-sm font-bold bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-purple-700 hover:bg-purple-800 text-white font-black py-3 rounded-lg text-sm shadow transition mt-2"
                >
                  {submitting ? "Securing Account..." : "Save Password & Enter Workspace →"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}