"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { db } from "../../lib/firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";

export default function HandoversDashboard() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  const [handovers, setHandovers] = useState<any[]>([]);
  const [salesTeam, setSalesTeam] = useState<any[]>([]);
  
  // Modals
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Handover Form State
  const [brideName, setBrideName] = useState("");
  const [groomName, setGroomName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paxCount, setPaxCount] = useState<number>(300);
  const [resortName, setResortName] = useState("");
  const [familyPocName, setFamilyPocName] = useState("");
  const [familyPocPhone, setFamilyPocPhone] = useState("");
  const [selectedSalesPersonId, setSelectedSalesPersonId] = useState("");

  // New Sales Member Form State
  const [salesName, setSalesName] = useState("");
  const [salesPhone, setSalesPhone] = useState("");
  const [salesEmail, setSalesEmail] = useState("");
  const [salesDesignation, setSalesDesignation] = useState("Sales Manager");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // Fetch Handovers and Sales Team Members
  const fetchData = async () => {
    try {
      // 1. Fetch Handovers
      const hQ = query(collection(db, "handovers"), orderBy("createdAt", "desc"));
      const hSnap = await getDocs(hQ);
      setHandovers(hSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      // 2. Fetch Sales Team Members
      const sQ = query(collection(db, "sales_team"), orderBy("name", "asc"));
      const sSnap = await getDocs(sQ);
      setSalesTeam(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading data:", err);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  // Create Sales Member
  const handleCreateSalesMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "sales_team"), {
        name: salesName,
        phone: salesPhone,
        email: salesEmail,
        designation: salesDesignation,
        createdAt: new Date().toISOString(),
      });
      setShowSalesModal(false);
      setSalesName("");
      setSalesPhone("");
      setSalesEmail("");
      fetchData();
    } catch (err) {
      alert("Failed to save sales team member.");
    }
  };

  // Create New Wedding Handover
  const handleCreateHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const selectedSales = salesTeam.find((s) => s.id === selectedSalesPersonId);

      const handoverData = {
        title: `${brideName.trim()} & ${groomName.trim()} Wedding`,
        brideName: brideName.trim(),
        groomName: groomName.trim(),
        startDate,
        endDate,
        paxCount: Number(paxCount) || 0,
        resortName: resortName.trim(),
        familyPoc: {
          name: familyPocName.trim(),
          phone: familyPocPhone.trim(),
        },
        salesLead: {
          id: selectedSales?.id || "",
          name: selectedSales?.name || "Direct Sales",
          phone: selectedSales?.phone || "",
          designation: selectedSales?.designation || "",
        },
        status: "Draft", // Statuses: "Draft", "Submitted to Backend", "In Production", "Completed"
        days: [], // Hierarchical event days will be populated in the builder
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "",
      };

      const docRef = await addDoc(collection(db, "handovers"), handoverData);
      setShowHandoverModal(false);
      router.push(`/handovers/${docRef.id}`);
    } catch (err) {
      console.error("Error creating handover:", err);
      alert("Failed to create handover.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteHandover = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete the handover for "${title}"?`)) return;
    try {
      await deleteDoc(doc(db, "handovers", id));
      setHandovers((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      alert("Failed to delete handover.");
    }
  };

  if (loading) return <div className="p-8 text-center text-xl font-bold">Loading Handovers...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Wedding Handover Center</h1>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Sales-to-Backend project transfers, day-wise decor scopes & execution trail.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowSalesModal(true)}
              className="bg-white border-2 border-gray-400 hover:bg-gray-100 text-gray-900 font-bold px-4 py-2.5 rounded-lg text-sm transition"
            >
              👤 Add Sales Team Member
            </button>
            <button
              onClick={() => setShowHandoverModal(true)}
              className="bg-purple-700 hover:bg-purple-800 text-white font-black px-6 py-2.5 rounded-lg text-sm shadow transition"
            >
              + New Wedding Handover
            </button>
          </div>
        </div>

        {/* Handovers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {handovers.map((h) => {
            const statusColors: any = {
              Draft: "bg-gray-100 text-gray-800 border-gray-300",
              "Submitted to Backend": "bg-amber-100 text-amber-900 border-amber-300 animate-pulse",
              "In Production": "bg-green-100 text-green-900 border-green-300 font-black",
            };

            return (
              <div
                key={h.id}
                className="bg-white border-2 border-gray-300 rounded-xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs uppercase font-black px-2.5 py-1 rounded border ${statusColors[h.status] || "bg-gray-100"}`}>
                      {h.status}
                    </span>
                    <span className="text-xs font-bold text-gray-500">
                      👥 {h.paxCount} Pax
                    </span>
                  </div>

                  <div>
                    <h2 className="text-2xl font-black text-gray-900 leading-tight">
                      {h.title}
                    </h2>
                    <p className="text-sm font-bold text-purple-800 mt-0.5">
                      📍 {h.resortName || "Venue not set"}
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs font-medium space-y-1.5 text-gray-700">
                    <p>
                      📅 <strong>Dates:</strong> {h.startDate} to {h.endDate}
                    </p>
                    <p>
                      👨‍👩‍👧 <strong>Family POC:</strong> {h.familyPoc?.name || "N/A"} ({h.familyPoc?.phone || "N/A"})
                    </p>
                    <p>
                      💼 <strong>Sales Lead:</strong> {h.salesLead?.name || "Direct"} - {h.salesLead?.phone}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
                  {/* Button 1: Open the workspace to edit */}
                  <Link
                    href={`/handovers/${h.id}`}
                    className="flex-1 bg-gray-900 hover:bg-black text-white font-bold py-2 px-3 rounded-lg text-center text-xs transition"
                  >
                    Open Workspace →
                  </Link>

                  {/* Button 2: Direct Presentation Deck & PDF Download */}
                  <Link
                    href={`/handovers/${h.id}/presentation`}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-3 rounded-lg text-center text-xs transition flex items-center gap-1 shadow"
                  >
                    📑 PDF & Deck
                  </Link>

                  {/* Button 3: Admin Delete */}
                  {role === "admin" && (
                    <button
                      onClick={() => handleDeleteHandover(h.id, h.title)}
                      className="text-red-600 hover:bg-red-50 p-2 rounded text-xs font-bold border border-red-200"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {handovers.length === 0 && (
          <div className="text-center py-16 bg-white border-2 border-dashed border-gray-300 rounded-xl">
            <p className="text-gray-600 font-bold text-lg">No wedding handovers created yet.</p>
            <p className="text-gray-400 text-sm mt-1">
              Click "+ New Wedding Handover" to begin planning your first event transfer.
            </p>
          </div>
        )}

        {/* MODAL 1: Create New Wedding Handover */}
        {showHandoverModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-xl w-full p-6 max-h-[92vh] overflow-y-auto border-2 border-gray-400 shadow-2xl">
              <h2 className="text-2xl font-black text-gray-900 mb-4 border-b pb-2">
                Initiate New Wedding Handover
              </h2>

              <form onSubmit={handleCreateHandover} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Bride's Name *</label>
                    <input
                      required
                      placeholder="e.g. Ananya"
                      value={brideName}
                      onChange={(e) => setBrideName(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Groom's Name *</label>
                    <input
                      required
                      placeholder="e.g. Siddharth"
                      value={groomName}
                      onChange={(e) => setGroomName(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Start Date *</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">End Date *</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Guest Count (Pax)</label>
                    <input
                      type="number"
                      required
                      placeholder="300"
                      value={paxCount}
                      onChange={(e) => setPaxCount(Number(e.target.value))}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Resort / Venue Name *</label>
                  <input
                    required
                    placeholder="e.g. Taj Aravali Resort & Spa, Udaipur"
                    value={resortName}
                    onChange={(e) => setResortName(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                  />
                </div>

                {/* Family POC */}
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-300 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-amber-950 mb-1">Family POC Name</label>
                    <input
                      placeholder="e.g. Uncle Rajesh Sharma"
                      value={familyPocName}
                      onChange={(e) => setFamilyPocName(e.target.value)}
                      className="w-full border-2 border-amber-300 p-1.5 rounded font-bold text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-amber-950 mb-1">Family POC Contact</label>
                    <input
                      placeholder="+91 98765 43210"
                      value={familyPocPhone}
                      onChange={(e) => setFamilyPocPhone(e.target.value)}
                      className="w-full border-2 border-amber-300 p-1.5 rounded font-bold text-xs bg-white"
                    />
                  </div>
                </div>

                {/* Sales Person Dropdown */}
                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">
                    Handling Sales Lead *
                  </label>
                  <select
                    required
                    value={selectedSalesPersonId}
                    onChange={(e) => setSelectedSalesPersonId(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                  >
                    <option value="">-- Select Sales Team Member --</option>
                    {salesTeam.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.designation}) - {st.phone}
                      </option>
                    ))}
                  </select>
                  {salesTeam.length === 0 && (
                    <p className="text-[11px] text-red-600 mt-1">
                      No sales members registered yet. Click "Add Sales Team Member" first.
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setShowHandoverModal(false)}
                    className="px-4 py-2 border-2 border-gray-400 font-bold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-purple-700 hover:bg-purple-800 text-white font-black rounded-lg text-xs shadow"
                  >
                    {submitting ? "Creating..." : "Create Handover & Start Scope →"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: Register Sales Team Member */}
        {showSalesModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-md w-full p-6 border-2 border-gray-400 shadow-2xl">
              <h2 className="text-xl font-black text-gray-900 mb-4 border-b pb-2">
                Add Sales Team Member
              </h2>

              <form onSubmit={handleCreateSalesMember} className="space-y-3">
                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Full Name *</label>
                  <input
                    required
                    placeholder="e.g. Priya Kapoor"
                    value={salesName}
                    onChange={(e) => setSalesName(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Phone Number *</label>
                  <input
                    required
                    placeholder="+91 98765 11111"
                    value={salesPhone}
                    onChange={(e) => setSalesPhone(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="priya@decorcompany.com"
                    value={salesEmail}
                    onChange={(e) => setSalesEmail(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Designation</label>
                  <input
                    placeholder="e.g. Senior Sales Manager / Wedding Planner"
                    value={salesDesignation}
                    onChange={(e) => setSalesDesignation(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowSalesModal(false)}
                    className="px-3 py-1.5 border font-bold rounded text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-black text-white font-bold rounded text-xs"
                  >
                    Save Sales Member
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