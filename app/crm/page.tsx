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

export default function CrmLeadsDashboard() {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const [leads, setLeads] = useState<any[]>([]);
  const [salesTeam, setSalesTeam] = useState<any[]>([]);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // New Lead Form State
  const [brideName, setBrideName] = useState("");
  const [groomName, setGroomName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paxCount, setPaxCount] = useState<number>(300);
  const [resortName, setResortName] = useState("");
  const [familyPocName, setFamilyPocName] = useState("");
  const [familyPocPhone, setFamilyPocPhone] = useState("");
  const [selectedSalesPersonId, setSelectedSalesPersonId] = useState("");
  const [leadStatus, setLeadStatus] = useState("New Inquiry");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const fetchLeadsAndTeam = async () => {
    try {
      // 1. Fetch Leads
      const lQ = query(collection(db, "leads"), orderBy("createdAt", "desc"));
      const lSnap = await getDocs(lQ);
      setLeads(lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      // 2. Fetch Sales Team Members for Dropdown
      const sQ = query(collection(db, "sales_team"), orderBy("name", "asc"));
      const sSnap = await getDocs(sQ);
      setSalesTeam(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading CRM leads:", err);
    }
  };

  useEffect(() => {
    if (user) fetchLeadsAndTeam();
  }, [user]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const selectedSales = salesTeam.find((s) => s.id === selectedSalesPersonId);

      const leadData = {
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
          name: selectedSales?.name || (user?.displayName || "Direct Sales"),
          phone: selectedSales?.phone || "",
          designation: selectedSales?.designation || "Sales Lead",
        },
        status: leadStatus, // "New Inquiry", "Proposal Sent", "In Negotiation", "Deal Closed / Booked", "Lost"
        notes: notes.trim(),
        // Financial & Closure Tracking
        closedDealAmount: 0,
        receivedPayments: [],
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "",
      };

      const docRef = await addDoc(collection(db, "leads"), leadData);
      setShowLeadModal(false);
      router.push(`/crm/${docRef.id}`);
    } catch (err) {
      console.error("Error creating lead:", err);
      alert("Failed to create lead.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLead = async (id: string, title: string) => {
    if (!window.confirm(`Delete lead "${title}"?`)) return;
    try {
      await deleteDoc(doc(db, "leads", id));
      setLeads((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert("Failed to delete lead.");
    }
  };

  const filteredLeads = leads.filter((l) => {
    const matchStatus = statusFilter === "All" || l.status === statusFilter;
    const matchSearch =
      !searchQuery ||
      l.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.resortName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.familyPoc?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.salesLead?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  if (loading) return <div className="p-8 text-center text-xl font-bold">Loading Sales CRM...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-amber-100 text-amber-900 text-xs uppercase font-black px-2.5 py-0.5 rounded border border-amber-300">
                Brajwal Weddings & Events Pvt Ltd
              </span>
              <h1 className="text-3xl font-black text-gray-900">Sales CRM & Client Quotations</h1>
            </div>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Manage client inquiries, generate A4 quotations, and track payment schedules and deal closures.
            </p>
          </div>

          <button
            onClick={() => setShowLeadModal(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-black px-6 py-3 rounded-lg shadow transition flex items-center gap-2"
          >
            + Create New Client Lead
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <input
            placeholder="Search by Bride, Groom, Venue, or Family Contact..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-80 border-2 border-gray-300 p-2.5 rounded-lg text-xs font-bold bg-white"
          />

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-xs font-black text-gray-700 whitespace-nowrap">Status Filter:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto border-2 border-gray-300 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
            >
              <option value="All">All Statuses ({leads.length})</option>
              <option value="New Inquiry">New Inquiry</option>
              <option value="Proposal Sent">Proposal Sent</option>
              <option value="In Negotiation">In Negotiation</option>
              <option value="Deal Closed / Booked">Deal Closed / Booked</option>
              <option value="Lost">Lost</option>
            </select>
          </div>
        </div>

        {/* Leads Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLeads.map((lead) => {
            const statusBadgeColors: any = {
              "New Inquiry": "bg-blue-100 text-blue-900 border-blue-300",
              "Proposal Sent": "bg-purple-100 text-purple-900 border-purple-300",
              "In Negotiation": "bg-amber-100 text-amber-900 border-amber-300",
              "Deal Closed / Booked": "bg-green-100 text-green-900 border-green-400 font-black",
              "Lost": "bg-red-100 text-red-900 border-red-300",
            };

            const totalReceived = (lead.receivedPayments || []).reduce(
              (sum: number, p: any) => sum + (Number(p.amount) || 0),
              0
            );

            return (
              <div
                key={lead.id}
                className="bg-white border-2 border-gray-300 rounded-xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded border ${statusBadgeColors[lead.status] || "bg-gray-100"}`}>
                      {lead.status}
                    </span>
                    <span className="text-xs font-bold text-gray-500">
                      👥 {lead.paxCount} Guests
                    </span>
                  </div>

                  <div>
                    <h2 className="text-2xl font-black text-gray-900 leading-tight">
                      {lead.title}
                    </h2>
                    <p className="text-sm font-bold text-amber-800 mt-0.5">
                      📍 {lead.resortName || "Venue not set"}
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs font-medium space-y-1.5 text-gray-700">
                    <p>📅 <strong>Dates:</strong> {lead.startDate} to {lead.endDate}</p>
                    <p>👨‍👩‍👧 <strong>Family POC:</strong> {lead.familyPoc?.name || "N/A"} ({lead.familyPoc?.phone || "N/A"})</p>
                    <p>💼 <strong>Sales Lead:</strong> {lead.salesLead?.name || "Direct Sales"} - {lead.salesLead?.phone}</p>
                  </div>

                  {/* Financial Snapshot */}
                  {lead.closedDealAmount > 0 && (
                    <div className="bg-green-50 border border-green-300 p-2.5 rounded-lg text-xs flex justify-between items-center">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-green-800 block">Deal Closed At:</span>
                        <strong className="text-green-950 font-mono text-sm">₹{lead.closedDealAmount?.toLocaleString()}</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-green-800 block">Total Received:</span>
                        <strong className="text-blue-800 font-mono text-sm">₹{totalReceived.toLocaleString()}</strong>
                      </div>
                    </div>
                  )}

                  {lead.notes && (
                    <p className="text-xs text-gray-500 italic bg-amber-50/50 p-2 rounded border border-amber-100">
                      <strong>Notes:</strong> {lead.notes}
                    </p>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-5 pt-4 border-t border-gray-200 flex items-center justify-between gap-2">
                  <Link
                    href={`/crm/${lead.id}`}
                    className="flex-1 bg-gray-900 hover:bg-black text-white font-bold py-2 px-3 rounded-lg text-center text-xs transition"
                  >
                    Open Lead & Quotation →
                  </Link>

                  {(isSuperAdmin || role === "admin") && (
                    <button
                      onClick={() => handleDeleteLead(lead.id, lead.title)}
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

        {filteredLeads.length === 0 && (
          <div className="text-center py-16 bg-white border-2 border-dashed border-gray-300 rounded-xl">
            <p className="text-gray-600 font-bold text-lg">No client leads found.</p>
            <p className="text-gray-400 text-xs mt-1">
              Click "+ Create New Client Lead" above to start managing your wedding inquiries.
            </p>
          </div>
        )}

        {/* MODAL: CREATE NEW LEAD */}
        {showLeadModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-xl w-full p-6 max-h-[92vh] overflow-y-auto border-2 border-gray-400 shadow-2xl">
              <h2 className="text-2xl font-black text-gray-900 mb-4 border-b pb-2">
                Register New Client Lead
              </h2>

              <form onSubmit={handleCreateLead} className="space-y-4">
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
                      value={paxCount}
                      onChange={(e) => setPaxCount(Number(e.target.value))}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs text-center bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Resort / Destination Venue *</label>
                  <input
                    required
                    placeholder="e.g. The Oberoi Udaivilas, Udaipur"
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
                      placeholder="e.g. Father / Uncle Name"
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Handling Sales Lead *</label>
                    <select
                      required
                      value={selectedSalesPersonId}
                      onChange={(e) => setSelectedSalesPersonId(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                    >
                      <option value="">-- Choose Sales Member --</option>
                      {salesTeam.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Initial Lead Status</label>
                    <select
                      value={leadStatus}
                      onChange={(e) => setLeadStatus(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                    >
                      <option value="New Inquiry">New Inquiry</option>
                      <option value="Proposal Sent">Proposal Sent</option>
                      <option value="In Negotiation">In Negotiation</option>
                      <option value="Deal Closed / Booked">Deal Closed / Booked</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Sales Notes & Specific Requirements</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Destination wedding, client wants royal heritage decor with heavy floral themes."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setShowLeadModal(false)}
                    className="px-4 py-2 border-2 border-gray-400 font-bold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-lg text-xs shadow"
                  >
                    {submitting ? "Registering Lead..." : "Save Lead & Open Quotation Workspace →"}
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