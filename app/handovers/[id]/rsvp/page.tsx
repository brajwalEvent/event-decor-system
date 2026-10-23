"use client";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  onSnapshot 
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { useAuth } from "../../../../context/AuthContext";

export default function WeddingRsvpPage() {
  const params = useParams();
  const router = useRouter();
  const handoverId = params.id as string;
  const { user, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [sendingWhatsappId, setSendingWhatsappId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Manual Add Guest Modal
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualAdults, setManualAdults] = useState<number>(2);
  const [manualMinors, setManualMinors] = useState<number>(0);
  const [manualNotes, setManualNotes] = useState("");
  const [savingManualGuest, setSavingManualGuest] = useState(false);

  // TWO-WAY LIVE CHAT MODAL
  const [activeChatGuest, setActiveChatGuest] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInputText, setChatInputText] = useState("");
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Lightbox for ID images
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const loadData = async () => {
    if (!handoverId) return;
    try {
      const hSnap = await getDoc(doc(db, "handovers", handoverId));
      if (hSnap.exists()) setHandover(hSnap.data());

      const rSnap = await getDocs(query(collection(db, "handovers", handoverId, "rsvps"), orderBy("name", "asc")));
      setGuests(rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (handoverId) loadData();
  }, [handoverId]);

  // Real-time Chat Messages Listener for the Active Guest
  useEffect(() => {
    if (!activeChatGuest || !handoverId) return;

    const q = query(
      collection(db, "handovers", handoverId, "rsvps", activeChatGuest.id, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChatMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 100);
    });

    // Mark as read in UI
    updateDoc(doc(db, "handovers", handoverId, "rsvps", activeChatGuest.id), {
      hasUnreadMessages: false,
    });

    return () => unsubscribe();
  }, [activeChatGuest, handoverId]);

  // Send Two-Way Chat Reply
  const handleSendChatReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim() || !activeChatGuest) return;

    setSendingChatMessage(true);
    try {
      const res = await fetch("/api/twilio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handoverId,
          guestId: activeChatGuest.id,
          phone: activeChatGuest.phone,
          message: chatInputText.trim(),
        }),
      });

      const result = await res.json();
      if (!result.success) {
        alert(`Failed to send message: ${result.error}`);
      } else {
        setChatInputText("");
      }
    } catch (err) {
      alert("Error sending message.");
    } finally {
      setSendingChatMessage(false);
    }
  };

  // Manual Add Guest
  const handleManualAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualPhone.trim()) return;

    setSavingManualGuest(true);
    try {
      const adults = Math.max(0, Number(manualAdults) || 0);
      const minors = Math.max(0, Number(manualMinors) || 0);
      const total = adults + minors;

      await addDoc(collection(db, "handovers", handoverId, "rsvps"), {
        name: manualName.trim(),
        phone: manualPhone.trim(),
        invitedPax: total || 2,
        adultsCount: adults,
        minorsCount: minors,
        totalPax: total,
        status: "Pending Call",
        callNotes: manualNotes.trim(),
        idCardUrls: [],
        whatsappStatus: null,
        createdAt: new Date().toISOString(),
      });

      setShowManualAddModal(false);
      setManualName("");
      setManualPhone("");
      setManualAdults(2);
      setManualMinors(0);
      setManualNotes("");
      loadData();
    } catch (err) {
      alert("Failed to save guest.");
    } finally {
      setSavingManualGuest(false);
    }
  };

  // Excel Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        let count = 0;
        for (const row of data) {
          const name = row["Name"] || row["Family Head"] || row["Guest Name"] || row["Full Name"] || "";
          const phone = row["Phone"] || row["Mobile"] || row["Contact"] || row["Number"] || "";
          const invitedPax = Number(row["Invited Pax"] || row["Pax"] || 2);

          if (name && phone) {
            await addDoc(collection(db, "handovers", handoverId, "rsvps"), {
              name: String(name).trim(),
              phone: String(phone).trim(),
              invitedPax,
              adultsCount: invitedPax,
              minorsCount: 0,
              totalPax: invitedPax,
              status: "Pending Call",
              callNotes: "",
              idCardUrls: [],
              whatsappStatus: null,
              createdAt: new Date().toISOString(),
            });
            count++;
          }
        }

        alert(`✅ Imported ${count} families from Excel!`);
        loadData();
      } catch (err) {
        alert("Failed to parse Excel file.");
      } finally {
        setUploadingExcel(false);
        e.target.value = "";
      }
    };

    reader.readAsBinaryString(file);
  };

  // Update Guest Counts
  const handleUpdateCounts = async (guestId: string, adults: number, minors: number, status: string, notes: string) => {
    const total = Math.max(0, adults) + Math.max(0, minors);
    const guestRef = doc(db, "handovers", handoverId, "rsvps", guestId);

    await updateDoc(guestRef, {
      adultsCount: Math.max(0, adults),
      minorsCount: Math.max(0, minors),
      totalPax: total,
      status,
      callNotes: notes,
      updatedAt: new Date().toISOString(),
    });

    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, adultsCount: adults, minorsCount: minors, totalPax: total, status, callNotes: notes } : g))
    );
  };

  // Send WhatsApp ID Request via Twilio
  const handleSendWhatsApp = async (guest: any) => {
    setSendingWhatsappId(guest.id);
    try {
      const res = await fetch("/api/twilio/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: guest.phone,
          guestName: guest.name,
          weddingTitle: handover.title,
          resortName: handover.resortName,
          paxCount: guest.totalPax || guest.adultsCount,
        }),
      });

      const result = await res.json();
      if (result.success) {
        await updateDoc(doc(db, "handovers", handoverId, "rsvps", guest.id), {
          whatsappSentAt: new Date().toISOString(),
          whatsappStatus: "sent",
          status: guest.status === "Pending Call" ? "ID Requested" : guest.status,
        });

        // Also add outbound message to conversation history
        await addDoc(collection(db, "handovers", handoverId, "rsvps", guest.id, "messages"), {
          direction: "outbound",
          body: `Official ID Request sent for ${handover.title}.`,
          timestamp: new Date().toISOString(),
          senderName: "System Template",
        });

        loadData();
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (err) {
      alert("Error triggering WhatsApp.");
    } finally {
      setSendingWhatsappId(null);
    }
  };

  const handleDeleteGuest = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    await deleteDoc(doc(db, "handovers", handoverId, "rsvps", id));
    setGuests(guests.filter((g) => g.id !== id));
  };

  // Status Badge Formatter
  const renderDeliveryTicks = (status: string) => {
    switch (status) {
      case "read":
        return <span className="text-blue-600 font-bold" title="Read (Blue Ticks)">✓✓ Read</span>;
      case "delivered":
        return <span className="text-gray-500 font-bold" title="Delivered to Phone">✓✓ Delivered</span>;
      case "sent":
        return <span className="text-gray-400 font-bold" title="Sent to WhatsApp Server">✓ Sent</span>;
      case "failed":
        return <span className="text-red-600 font-bold" title="Delivery Failed">✕ Failed</span>;
      default:
        return null;
    }
  };

  const totalFamilies = guests.length;
  const totalConfirmedAdults = guests.reduce((sum, g) => sum + (Number(g.adultsCount) || 0), 0);
  const totalConfirmedMinors = guests.reduce((sum, g) => sum + (Number(g.minorsCount) || 0), 0);
  const totalConfirmedPax = totalConfirmedAdults + totalConfirmedMinors;
  const totalIdsCollected = guests.reduce((sum, g) => sum + ((g.idCardUrls && g.idCardUrls.length) || 0), 0);

  const filteredGuests = guests.filter((g) => {
    const matchStatus = statusFilter === "All" || g.status === statusFilter;
    const matchSearch = !searchQuery || g.name?.toLowerCase().includes(searchQuery.toLowerCase()) || g.phone?.includes(searchQuery);
    return matchStatus && matchSearch;
  });

  if (loading || !handover) return <div className="p-12 text-center text-xl font-bold">Loading RSVP Center...</div>;

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 pb-20">
      {/* Top Banner */}
      <div className="bg-white border-b-2 border-gray-300 shadow-sm sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => router.push(`/handovers/${handoverId}`)}
                className="text-xs font-bold text-gray-600 hover:text-black flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-md border transition"
              >
                ← Back to Handover Workspace
              </button>
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-gray-900">Guest RSVP & Hotel ID Desk</h1>
              <span className="text-xs font-black uppercase text-purple-900 bg-purple-100 px-2.5 py-0.5 rounded border border-purple-200">
                {handover.title}
              </span>
            </div>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">
              📍 {handover.resortName} | 📅 {handover.startDate} to {handover.endDate}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow transition flex items-center gap-1.5"
            >
              🖨️ Export Hotel ID Dossier (PDF)
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-6">

        {/* 1. KPI COUNTERS & IMPORT BAR */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm">
            <span className="text-[10px] font-black uppercase text-gray-500 block">Total Invited Families</span>
            <strong className="text-2xl font-black text-gray-900 font-mono">{totalFamilies} Families</strong>
          </div>

          <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm">
            <span className="text-[10px] font-black uppercase text-gray-500 block">Confirmed Guests (Pax)</span>
            <strong className="text-2xl font-black text-purple-900 font-mono">
              {totalConfirmedPax} Pax <span className="text-xs font-normal text-gray-500">({totalConfirmedAdults}A + {totalConfirmedMinors}M)</span>
            </strong>
          </div>

          <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm">
            <span className="text-[10px] font-black uppercase text-gray-500 block">ID Cards Collected</span>
            <strong className="text-2xl font-black text-emerald-700 font-mono">{totalIdsCollected} Photo IDs</strong>
          </div>

          {/* DUAL ACTIONS: MANUAL ADD + EXCEL UPLOAD */}
          <div className="bg-purple-50 p-3.5 rounded-xl border-2 border-purple-300 flex flex-col justify-between gap-1.5">
            <span className="text-[10px] font-black uppercase text-purple-900 block">Add Guest Records:</span>
            
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setShowManualAddModal(true)}
                className="bg-purple-700 hover:bg-purple-800 text-white font-black px-2 py-1.5 rounded-lg text-[11px] shadow text-center"
              >
                + Add Manually
              </button>

              <label className="bg-white border-2 border-purple-400 hover:bg-purple-100 text-purple-950 font-black px-2 py-1.5 rounded-lg text-[11px] cursor-pointer text-center shadow">
                {uploadingExcel ? "Importing..." : "📥 Excel File"}
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* 2. SEARCH & FILTER */}
        <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <input
            placeholder="Search by Family Head Name or Mobile..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-80 border-2 border-gray-300 p-2 rounded-lg text-xs font-bold bg-white text-gray-900"
          />

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-xs font-black text-gray-700 whitespace-nowrap">Filter Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border-2 border-gray-300 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
            >
              <option value="All">All Guests ({guests.length})</option>
              <option value="Pending Call">Pending Call</option>
              <option value="Confirmed">Confirmed</option>
              <option value="IDs Received">IDs Received</option>
              <option value="Declined">Declined</option>
            </select>
          </div>
        </div>

        {/* 3. GUEST DIRECTORY TABLE */}
        <div className="bg-white border-2 border-gray-300 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 font-black uppercase text-[10px] text-gray-700 border-b-2">
                <tr>
                  <th className="p-3">Family Head & Contact</th>
                  <th className="p-3 text-center">Adults</th>
                  <th className="p-3 text-center">Minors</th>
                  <th className="p-3 text-center">Total Pax</th>
                  <th className="p-3">Calling Notes & Arrival Details</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3">WhatsApp & Delivery Status</th>
                  <th className="p-3">Live Chat</th>
                  <th className="p-3">Attached ID Proofs</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-medium">
                {filteredGuests.map((guest) => {
                  const hasIds = guest.idCardUrls && guest.idCardUrls.length > 0;

                  return (
                    <tr key={guest.id} className="hover:bg-gray-50">
                      {/* Family Head & Phone */}
                      <td className="p-3">
                        <p className="font-black text-sm text-gray-900">{guest.name}</p>
                        <a href={`tel:${guest.phone}`} className="text-blue-700 font-mono font-bold hover:underline">
                          📞 {guest.phone}
                        </a>
                      </td>

                      {/* Adults Input */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="0"
                          value={guest.adultsCount || 0}
                          onChange={(e) =>
                            handleUpdateCounts(guest.id, Number(e.target.value), guest.minorsCount || 0, guest.status, guest.callNotes)
                          }
                          className="w-14 border-2 border-gray-300 p-1 rounded font-bold text-center bg-white"
                        />
                      </td>

                      {/* Minors Input */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="0"
                          value={guest.minorsCount || 0}
                          onChange={(e) =>
                            handleUpdateCounts(guest.id, guest.adultsCount || 0, Number(e.target.value), guest.status, guest.callNotes)
                          }
                          className="w-14 border-2 border-gray-300 p-1 rounded font-bold text-center bg-white"
                        />
                      </td>

                      {/* Total Pax */}
                      <td className="p-3 text-center font-black text-base font-mono text-purple-900">
                        {guest.totalPax || (guest.adultsCount || 0) + (guest.minorsCount || 0)}
                      </td>

                      {/* Calling Notes */}
                      <td className="p-3">
                        <input
                          placeholder="e.g. Arriving 2 PM, needs extra bed"
                          value={guest.callNotes || ""}
                          onChange={(e) =>
                            handleUpdateCounts(guest.id, guest.adultsCount || 0, guest.minorsCount || 0, guest.status, e.target.value)
                          }
                          className="w-full border p-1.5 rounded text-xs bg-white text-gray-900"
                        />
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        <select
                          value={guest.status || "Pending Call"}
                          onChange={(e) =>
                            handleUpdateCounts(guest.id, guest.adultsCount || 0, guest.minorsCount || 0, e.target.value, guest.callNotes)
                          }
                          className="border p-1 rounded font-bold text-[10px] uppercase bg-white"
                        >
                          <option value="Pending Call">Pending Call</option>
                          <option value="Confirmed">Confirmed</option>
                          <option value="IDs Received">IDs Received</option>
                          <option value="Declined">Declined</option>
                        </select>
                      </td>

                      {/* WhatsApp Trigger Button with Live Delivery Status */}
                      <td className="p-3 whitespace-nowrap space-y-1">
                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(guest)}
                          disabled={sendingWhatsappId === guest.id}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2.5 py-1.5 rounded-lg text-xs shadow flex items-center gap-1 disabled:opacity-50"
                        >
                          {sendingWhatsappId === guest.id ? "Sending..." : "📲 Send ID Request"}
                        </button>

                        {/* LIVE DELIVERY TICKS */}
                        <div className="flex items-center gap-1.5 text-[10px]">
                          {renderDeliveryTicks(guest.whatsappStatus)}
                          {guest.whatsappSentAt && (
                            <span className="text-gray-400 font-mono">
                              ({new Date(guest.whatsappSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* LIVE CHAT DRAWER BUTTON */}
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => setActiveChatGuest(guest)}
                          className="bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 font-black px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow-sm transition"
                        >
                          💬 Chat
                          {guest.hasUnreadMessages && (
                            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                          )}
                        </button>
                        {guest.lastMessage && (
                          <p className="text-[10px] text-gray-500 italic mt-0.5 truncate max-w-[130px]" title={guest.lastMessage}>
                            "{guest.lastMessage}"
                          </p>
                        )}
                      </td>

                      {/* Received ID Photos Gallery */}
                      <td className="p-3">
                        {hasIds ? (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {guest.idCardUrls.map((url: string, iIdx: number) => (
                              <div
                                key={iIdx}
                                onClick={() => setActiveLightboxImg(url)}
                                className="w-10 h-10 rounded border overflow-hidden cursor-zoom-in bg-gray-100 relative group flex-shrink-0"
                              >
                                <img src={url} alt="ID" className="w-full h-full object-cover" />
                              </div>
                            ))}
                            <span className="text-[10px] font-black text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">
                              {guest.idCardUrls.length} IDs
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">No IDs yet</span>
                        )}
                      </td>

                      {/* Delete */}
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteGuest(guest.id, guest.name)}
                          className="text-red-600 font-bold hover:underline text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TWO-WAY LIVE WHATSAPP CHAT MODAL */}
      {activeChatGuest && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full h-[580px] border-2 border-gray-400 shadow-2xl flex flex-col overflow-hidden">
            {/* Chat Header */}
            <div className="bg-gray-900 text-white p-4 flex justify-between items-center border-b">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-400 block tracking-widest">
                  Live WhatsApp Conversation
                </span>
                <h3 className="font-black text-lg text-white leading-tight">
                  {activeChatGuest.name}
                </h3>
                <p className="text-xs text-gray-300 font-mono">
                  {activeChatGuest.phone}
                </p>
              </div>

              <button
                onClick={() => setActiveChatGuest(null)}
                className="text-gray-400 hover:text-white font-black text-xl px-2"
              >
                ✕
              </button>
            </div>

            {/* Chat Messages Feed */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#E5DDD5]/40"
            >
              {chatMessages.map((msg) => {
                const isOutbound = msg.direction === "outbound";

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-3 text-xs shadow-sm space-y-1 ${
                        isOutbound
                          ? "bg-[#DCF8C6] text-gray-900 rounded-tr-none border border-green-200"
                          : "bg-white text-gray-900 rounded-tl-none border border-gray-200"
                      }`}
                    >
                      <span className="text-[9px] font-bold text-gray-500 block">
                        {isOutbound ? "Executive" : activeChatGuest.name}
                      </span>

                      {/* Message Text */}
                      {msg.body && <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>}

                      {/* Attached Media/Images if guest sent photos */}
                      {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {msg.mediaUrls.map((url: string, mIdx: number) => (
                            <img
                              key={mIdx}
                              src={url}
                              alt="Media"
                              onClick={() => setActiveLightboxImg(url)}
                              className="w-24 h-24 object-cover rounded-lg border cursor-zoom-in"
                            />
                          ))}
                        </div>
                      )}

                      <span className="text-[9px] text-gray-400 block text-right font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {chatMessages.length === 0 && (
                <div className="py-16 text-center text-gray-400 text-xs italic">
                  No conversation history yet. Send a message below to start chatting.
                </div>
              )}
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendChatReply} className="p-3 bg-white border-t flex gap-2">
              <input
                required
                placeholder={`Reply to ${activeChatGuest.name} on WhatsApp...`}
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                className="flex-1 border-2 border-gray-300 p-2 rounded-xl text-xs bg-white outline-none focus:border-purple-600"
              />
              <button
                type="submit"
                disabled={sendingChatMessage}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2 rounded-xl text-xs shadow transition disabled:opacity-50"
              >
                {sendingChatMessage ? "Sending..." : "Send ➤"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL ADD GUEST */}
      {showManualAddModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-gray-400 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-lg font-black text-gray-900">Add Family / Guest Record</h3>
              <button onClick={() => setShowManualAddModal(false)} className="text-gray-500 font-black text-xl hover:text-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleManualAddGuest} className="space-y-3 text-xs">
              <div>
                <label className="block font-black text-gray-800 mb-1">Family Head Name *</label>
                <input
                  required
                  placeholder="e.g. Rajesh Sharma"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900"
                />
              </div>

              <div>
                <label className="block font-black text-gray-800 mb-1">Mobile / WhatsApp Number *</label>
                <input
                  required
                  placeholder="e.g. +91 98765 43210"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1">Adults Count</label>
                  <input
                    type="number"
                    min="0"
                    value={manualAdults}
                    onChange={(e) => setManualAdults(Number(e.target.value))}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-center bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block font-black text-gray-800 mb-1">Minors Count</label>
                  <input
                    type="number"
                    min="0"
                    value={manualMinors}
                    onChange={(e) => setManualMinors(Number(e.target.value))}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-center bg-white text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-gray-800 mb-1">Initial Calling / Arrival Notes</label>
                <input
                  placeholder="e.g. Arriving on Day 1 by morning train"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white text-gray-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowManualAddModal(false)}
                  className="px-4 py-2 border font-bold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingManualGuest}
                  className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-black rounded-lg text-xs shadow"
                >
                  {savingManualGuest ? "Saving..." : "Save Guest Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL-SCREEN LIGHTBOX MODAL FOR ID PROOFS */}
      {activeLightboxImg && (
        <div
          onClick={() => setActiveLightboxImg(null)}
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
        >
          <button
            onClick={() => setActiveLightboxImg(null)}
            className="absolute top-4 right-4 bg-white/20 hover:bg-red-600 text-white font-black px-4 py-2 rounded-full text-xs transition"
          >
            ✕ Close
          </button>
          <img
            src={activeLightboxImg}
            alt="Guest ID Proof"
            className="max-w-full max-h-[85vh] object-contain rounded-xl bg-white shadow-2xl"
          />
        </div>
      )}

      {/* PRINT-OPTIMIZED STYLES */}
      <style jsx global>{`
        @media print {
          body { background-color: white !important; }
          header, button, input, select { display: none !important; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td { border: 1px solid #ccc !important; padding: 6px !important; }
          img { max-height: 90px !important; object-fit: contain !important; }
        }
      `}</style>
    </div>
  );
}