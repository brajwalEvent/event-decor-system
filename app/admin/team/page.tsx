"use client";
import React, { useState, useEffect } from "react";
import { db } from "../../../lib/firebase";
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  query, 
  orderBy 
} from "firebase/firestore";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { useAuth } from "../../../context/AuthContext";
import { useRouter } from "next/navigation";

// Secondary Firebase app instance so Super Admin doesn't get logged out when creating a user
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const secondaryApp = !getApps().some((a) => a.name === "Secondary")
  ? initializeApp(firebaseConfig, "Secondary")
  : getApp("Secondary");
const secondaryAuth = getAuth(secondaryApp);

export default function SuperAdminTeamPage() {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // New Team Member Form
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [assignedRole, setAssignedRole] = useState<"sales" | "production">("sales");

  // Protect page: Only Super Admin / Admin
  useEffect(() => {
    if (!loading && (!user || (!isSuperAdmin && role !== "admin"))) {
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, router]);

  // Fetch Team
  const fetchTeam = async () => {
    try {
      const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setTeamMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching team:", err);
    }
  };

  useEffect(() => {
    if (user && (isSuperAdmin || role === "admin")) fetchTeam();
  }, [user, isSuperAdmin, role]);

  // Handle Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      // 1. Create account via secondary auth (preserves Super Admin session)
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email.trim().toLowerCase(),
        password
      );
      const newUid = userCredential.user.uid;
      await signOut(secondaryAuth); // Sign out the secondary instance

      // 2. Save user profile & role in Firestore
      await setDoc(doc(db, "users", newUid), {
        uid: newUid,
        displayName: name.trim(),
        mobile: mobile.trim(),
        email: email.trim().toLowerCase(),
        role: assignedRole,
        createdAt: new Date().toISOString(),
      });

      // 3. If Sales team, add to sales_team directory for handover dropdown
      if (assignedRole === "sales") {
        await setDoc(doc(db, "sales_team", newUid), {
          id: newUid,
          name: name.trim(),
          phone: mobile.trim(),
          email: email.trim().toLowerCase(),
          designation: "Sales Lead",
          createdAt: new Date().toISOString(),
        });
      }

      // Reset
      setShowModal(false);
      setName("");
      setMobile("");
      setEmail("");
      setPassword("");
      setAssignedRole("sales");
      fetchTeam();
      alert(`✅ Team member ${name} created successfully! They can now log in.`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create team member.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Member
  const handleDeleteMember = async (id: string, memberEmail: string) => {
    if (memberEmail.toLowerCase() === "event.brajwal@gmail.com") {
      alert("Super Admin account cannot be deleted!");
      return;
    }
    if (!window.confirm(`Delete team member ${memberEmail}? They will lose access.`)) return;

    try {
      await deleteDoc(doc(db, "users", id));
      await deleteDoc(doc(db, "sales_team", id)).catch(() => null);
      setTeamMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      alert("Error deleting user.");
    }
  };

  if (loading) return <div className="p-8 text-center text-xl font-bold">Verifying Super Admin...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm mb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-red-600 text-white text-xs uppercase font-black px-2 py-0.5 rounded shadow">
                Super Admin Console
              </span>
              <h1 className="text-3xl font-black text-gray-900">Team & Role Management</h1>
            </div>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Create and manage credentials for the Front Sales Team and Backend Production Team.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="bg-black hover:bg-gray-800 text-white font-black px-6 py-3 rounded-lg shadow transition flex items-center gap-2"
          >
            + Add New Team Member
          </button>
        </div>

        {/* Team Members List */}
        <div className="bg-white border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b bg-gray-100 flex justify-between items-center">
            <h2 className="text-sm font-black uppercase text-gray-700">Active Staff & Credentials ({teamMembers.length})</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[11px]">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Mobile</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Assigned Department</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-medium">
                {teamMembers.map((member) => {
                  const isThisSuperAdmin = member.email?.toLowerCase() === "event.brajwal@gmail.com";

                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="p-4 font-bold text-gray-900">
                        {member.displayName || "N/A"}
                        {isThisSuperAdmin && (
                          <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-black border border-red-300">
                            SUPER ADMIN
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono">{member.mobile || "—"}</td>
                      <td className="p-4 font-mono font-bold text-blue-800">{member.email}</td>
                      <td className="p-4">
                        {member.role === "sales" ? (
                          <span className="bg-purple-100 text-purple-900 border border-purple-300 px-2.5 py-1 rounded-full text-xs font-black">
                            💼 Front Sales Team
                          </span>
                        ) : member.role === "production" ? (
                          <span className="bg-blue-100 text-blue-900 border border-blue-300 px-2.5 py-1 rounded-full text-xs font-black">
                            🛠️ Production Team
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-900 border border-red-300 px-2.5 py-1 rounded-full text-xs font-black">
                            👑 Super Admin
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {!isThisSuperAdmin && (
                          <button
                            onClick={() => handleDeleteMember(member.id, member.email)}
                            className="text-red-600 hover:text-red-800 font-bold text-xs bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded border border-red-200 transition"
                          >
                            Remove User
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Add Team Member Form */}
        {showModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 border-2 border-gray-400 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h2 className="text-xl font-black text-gray-900">Add New Team Member</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-black font-black text-xl">
                  ✕
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-300 text-red-700 p-2.5 rounded text-xs font-bold">
                  {error}
                </div>
              )}

              <form onSubmit={handleAddMember} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Full Name *</label>
                  <input
                    required
                    placeholder="e.g. Vikram Verma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Mobile Number *</label>
                    <input
                      required
                      placeholder="+91 98765 00000"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Work Email (Login ID) *</label>
                    <input
                      type="email"
                      required
                      placeholder="vikram@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Initial Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                  />
                </div>

                {/* Role Assignment */}
                <div className="bg-gray-50 p-3 rounded-lg border-2 border-gray-300 space-y-2">
                  <label className="block text-xs font-black text-gray-900 uppercase">
                    Assign Role & Permissions *
                  </label>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-start gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition ${
                      assignedRole === "sales" 
                        ? "bg-purple-50 border-purple-600 font-black" 
                        : "bg-white border-gray-300"
                    }`}>
                      <input
                        type="radio"
                        name="teamRole"
                        value="sales"
                        checked={assignedRole === "sales"}
                        onChange={() => setAssignedRole("sales")}
                        className="mt-1"
                      />
                      <div>
                        <span className="block text-xs font-black text-purple-950">💼 Sales Team</span>
                        <span className="block text-[11px] text-gray-500 font-medium">
                          Can only access & create Wedding Handovers.
                        </span>
                      </div>
                    </label>

                    <label className={`flex items-start gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition ${
                      assignedRole === "production" 
                        ? "bg-blue-50 border-blue-600 font-black" 
                        : "bg-white border-gray-300"
                    }`}>
                      <input
                        type="radio"
                        name="teamRole"
                        value="production"
                        checked={assignedRole === "production"}
                        onChange={() => setAssignedRole("production")}
                        className="mt-1"
                      />
                      <div>
                        <span className="block text-xs font-black text-blue-950">🛠️ Production Team</span>
                        <span className="block text-[11px] text-gray-500 font-medium">
                          Manages master inventory, components & execution.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border-2 border-gray-400 font-bold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-black text-white font-black rounded-lg text-xs hover:bg-gray-800 shadow"
                  >
                    {submitting ? "Creating Account..." : "Create Team Member"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}