"use client";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, storage } from "../../../../lib/firebase";
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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
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

  // Manual Add Modal
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualAdults, setManualAdults] = useState<number>(2);
  const [manualMinors, setManualMinors] = useState<number>(0);
  const [manualNotes, setManualNotes] = useState("");
  const [savingManualGuest, setSavingManualGuest] = useState(false);

  // ATTENDEE & ID ASSIGNMENT POP-UP
  const [selectedAttendeeGuest, setSelectedAttendeeGuest] = useState<any | null>(null);
  const [newAttendeeName, setNewAttendeeName] = useState("");
  const [newAttendeeAgeGroup, setNewAttendeeAgeGroup] = useState("Adult");
  const [savingAttendees, setSavingAttendees] = useState(false);

  // FULLSCREEN LIVE CHAT
  const [activeChatGuest, setActiveChatGuest] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInputText, setChatInputText] = useState("");
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // ATTACHMENT PREVIEW & CONFIRMATION
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilePreview, setPendingFilePreview] = useState<string | null>(null);
  const [pendingFileCaption, setPendingFileCaption] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // VOICE RECORDER (MP4)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Lightbox / Enlarge Modal
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // PREVIOUS DATA LOAD METHOD
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

  // Real-time listener for the active chat guest's messages
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

    updateDoc(doc(db, "handovers", handoverId, "rsvps", activeChatGuest.id), {
      hasUnreadMessages: false,
    });

    return () => unsubscribe();
  }, [activeChatGuest, handoverId]);

  // Trigger Official Template
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
        }),
      });

      const result = await res.json();
      if (result.success) {
        await addDoc(collection(db, "handovers", handoverId, "rsvps", guest.id, "messages"), {
          direction: "outbound",
          body: result.formattedText,
          sid: result.sid,
          status: "sent",
          timestamp: new Date().toISOString(),
          senderName: "Team Brajwal (ID Request)",
        });

        await updateDoc(doc(db, "handovers", handoverId, "rsvps", guest.id), {
          whatsappSentAt: new Date().toISOString(),
          whatsappStatus: "sent",
          status: guest.status === "Pending Call" ? "ID Requested" : guest.status,
          lastMessage: "Official ID Request Template sent",
          lastMessageAt: new Date().toISOString(),
        });

        loadData();
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (err) {
      alert("Error sending WhatsApp ID Request.");
    } finally {
      setSendingWhatsappId(null);
    }
  };

  // Text message reply
  const handleSendChatReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim() || !activeChatGuest) return;

    const text = chatInputText.trim();
    setChatInputText("");
    setSendingChatMessage(true);

    try {
      const res = await fetch("/api/twilio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handoverId,
          guestId: activeChatGuest.id,
          phone: activeChatGuest.phone,
          message: text,
        }),
      });

      const result = await res.json();
      if (!result.success) {
        alert(`Failed: ${result.error}`);
        setChatInputText(text);
      }
    } catch (err) {
      alert("Error sending message.");
      setChatInputText(text);
    } finally {
      setSendingChatMessage(false);
    }
  };

  // Stage file for confirmation
  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingFile(file);
    setPendingFileCaption("");

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPendingFilePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPendingFilePreview(null);
    }
  };

  const handleCancelAttachment = () => {
    setPendingFile(null);
    setPendingFilePreview(null);
    setPendingFileCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConfirmSendAttachment = async () => {
    if (!pendingFile || !activeChatGuest) return;

    setUploadingAttachment(true);
    try {
      const fileRef = ref(storage, `chat_media/${handoverId}/${activeChatGuest.id}/${Date.now()}_${pendingFile.name}`);
      await uploadBytes(fileRef, pendingFile, { contentType: pendingFile.type });
      const downloadUrl = await getDownloadURL(fileRef);

      const res = await fetch("/api/twilio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handoverId,
          guestId: activeChatGuest.id,
          phone: activeChatGuest.phone,
          message: pendingFileCaption.trim(),
          mediaUrl: downloadUrl,
          fileName: pendingFile.name,
        }),
      });

      const result = await res.json();
      if (!result.success) {
        alert(`Failed to send attachment: ${result.error}`);
      } else {
        handleCancelAttachment();
      }
    } catch (err) {
      alert("Error sending attachment.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  // Voice Note Recording (MP4)
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission denied or not supported.");
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const stopAndSendVoiceRecording = async () => {
    if (!mediaRecorderRef.current || !activeChatGuest) return;

    clearInterval(recordingTimerRef.current);
    setIsRecording(false);

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/mp4" });
      audioChunksRef.current = [];

      setUploadingAttachment(true);
      try {
        const fileRef = ref(storage, `chat_media/${handoverId}/${activeChatGuest.id}/${Date.now()}_voice.mp4`);
        await uploadBytes(fileRef, audioBlob, { contentType: "audio/mp4" });
        const downloadUrl = await getDownloadURL(fileRef);

        await fetch("/api/twilio/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handoverId,
            guestId: activeChatGuest.id,
            phone: activeChatGuest.phone,
            message: "🎤 Voice Message",
            mediaUrl: downloadUrl,
            fileName: "Voice Note.mp4",
          }),
        });
      } catch (e) {
        alert("Failed to send voice recording.");
      } finally {
        setUploadingAttachment(false);
      }
    };

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
  };

  // Delivery & Read Ticks Formatter
  const renderMessageTicks = (status?: string) => {
    switch (status) {
      case "read":
        return <span className="text-[#34B7F1] font-bold text-xs" title="Read (Blue Ticks)">✓✓</span>;
      case "delivered":
        return <span className="text-gray-500 font-bold text-xs" title="Delivered to Phone">✓✓</span>;
      case "sent":
      case "queued":
        return <span className="text-gray-400 font-bold text-xs" title="Sent to Server">✓</span>;
      case "failed":
      case "undelivered":
        return <span className="text-red-600 font-bold text-xs" title="Failed">✕</span>;
      default:
        return <span className="text-gray-400 font-bold text-xs">✓</span>;
    }
  };

  // ATTENDEE & ID ASSIGNMENT
  const handleOpenAttendeeModal = (guest: any) => {
    setSelectedAttendeeGuest(JSON.parse(JSON.stringify(guest)));
    setNewAttendeeName("");
    setNewAttendeeAgeGroup("Adult");
  };

  const handleAddAttendee = () => {
    if (!newAttendeeName.trim() || !selectedAttendeeGuest) return;
    const currentAttendees = selectedAttendeeGuest.attendees || [];
    const newEntry = {
      id: `att_${Date.now()}`,
      name: newAttendeeName.trim(),
      ageGroup: newAttendeeAgeGroup,
      assignedIdUrls: [],
    };
    setSelectedAttendeeGuest({
      ...selectedAttendeeGuest,
      attendees: [...currentAttendees, newEntry],
    });
    setNewAttendeeName("");
  };

  const handleRemoveAttendee = (attId: string) => {
    if (!selectedAttendeeGuest) return;
    setSelectedAttendeeGuest({
      ...selectedAttendeeGuest,
      attendees: (selectedAttendeeGuest.attendees || []).filter((a: any) => a.id !== attId),
    });
  };

  const handleAssignPhotoToAttendee = (attId: string, photoUrl: string) => {
    if (!selectedAttendeeGuest) return;
    const updatedAttendees = (selectedAttendeeGuest.attendees || []).map((att: any) => {
      if (att.id === attId) {
        const exists = (att.assignedIdUrls || []).includes(photoUrl);
        return {
          ...att,
          assignedIdUrls: exists
            ? att.assignedIdUrls.filter((u: string) => u !== photoUrl)
            : [...(att.assignedIdUrls || []), photoUrl],
        };
      }
      return att;
    });

    setSelectedAttendeeGuest({
      ...selectedAttendeeGuest,
      attendees: updatedAttendees,
    });
  };

  // Helper: Find who an image is already assigned to
  const getAssignedAttendeeName = (photoUrl: string) => {
    if (!selectedAttendeeGuest?.attendees) return null;
    const match = selectedAttendeeGuest.attendees.find((a: any) =>
      (a.assignedIdUrls || []).includes(photoUrl)
    );
    return match ? match.name : null;
  };

  const handleSaveAttendees = async () => {
    if (!selectedAttendeeGuest) return;
    setSavingAttendees(true);
    try {
      await updateDoc(doc(db, "handovers", handoverId, "rsvps", selectedAttendeeGuest.id), {
        attendees: selectedAttendeeGuest.attendees || [],
      });

      setGuests((prev) =>
        prev.map((g) =>
          g.id === selectedAttendeeGuest.id
            ? { ...g, attendees: selectedAttendeeGuest.attendees || [] }
            : g
        )
      );

      setSelectedAttendeeGuest(null);
    } catch (err) {
      alert("Failed to save attendees.");
    } finally {
      setSavingAttendees(false);
    }
  };

  // General RSVP update
  const handleUpdateCounts = async (guestId: string, adults: number, minors: number, status: string, notes: string) => {
    const total = Math.max(0, adults) + Math.max(0, minors);
    await updateDoc(doc(db, "handovers", handoverId, "rsvps", guestId), {
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

  const handleManualAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualPhone.trim()) return;

    setSavingManualGuest(true);
    try {
      const total = Number(manualAdults) + Number(manualMinors);
      await addDoc(collection(db, "handovers", handoverId, "rsvps"), {
        name: manualName.trim(),
        phone: manualPhone.trim(),
        invitedPax: total || 2,
        adultsCount: manualAdults,
        minorsCount: manualMinors,
        totalPax: total,
        status: "Pending Call",
        callNotes: manualNotes.trim(),
        idCardUrls: [],
        attendees: [
          {
            id: `att_${Date.now()}`,
            name: manualName.trim(),
            ageGroup: "Adult",
            assignedIdUrls: [],
          },
        ],
        createdAt: new Date().toISOString(),
      });
      setShowManualAddModal(false);
      loadData();
    } finally {
      setSavingManualGuest(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        for (const row of data) {
          const name = row["Name"] || row["Family Head"] || row["Guest Name"] || "";
          const phone = row["Phone"] || row["Mobile"] || "";
          const pax = Number(row["Pax"] || 2);

          if (name && phone) {
            await addDoc(collection(db, "handovers", handoverId, "rsvps"), {
              name: String(name).trim(),
              phone: String(phone).trim(),
              invitedPax: pax,
              adultsCount: pax,
              minorsCount: 0,
              totalPax: pax,
              status: "Pending Call",
              callNotes: "",
              idCardUrls: [],
              attendees: [
                {
                  id: `att_${Date.now()}`,
                  name: String(name).trim(),
                  ageGroup: "Adult",
                  assignedIdUrls: [],
                },
              ],
              createdAt: new Date().toISOString(),
            });
          }
        }
        loadData();
      } catch (err) {
        alert("Failed to parse file.");
      } finally {
        setUploadingExcel(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDeleteGuest = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    await deleteDoc(doc(db, "handovers", handoverId, "rsvps", id));
    setGuests((prev) => prev.filter((g) => g.id !== id));
  };

  const filteredGuests = guests.filter((g) => {
    const matchStatus = statusFilter === "All" || g.status === statusFilter;
    const matchSearch = !searchQuery || g.name?.toLowerCase().includes(searchQuery.toLowerCase()) || g.phone?.includes(searchQuery);
    return matchStatus && matchSearch;
  });

  if (loading || !handover) return <div className="p-12 text-center text-xl font-bold">Loading RSVP Center...</div>;

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 pb-20">
      {/* Top Banner (Hidden in Print) */}
      <div className="bg-white border-b-2 border-gray-300 shadow-sm sticky top-16 z-30 no-print">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <button
              onClick={() => router.push(`/handovers/${handoverId}`)}
              className="text-xs font-bold text-gray-600 hover:text-black flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-md border transition mb-1"
            >
              ← Back to Handover
            </button>
            <h1 className="text-2xl font-black text-gray-900">{handover.title} - Guest & ID Desk</h1>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">
              📍 {handover.resortName} | 📅 {handover.startDate} to {handover.endDate}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow flex items-center gap-1.5"
          >
            🖨️ Export Hotel ID Dossier (PDF)
          </button>
        </div>
      </div>

      {/* PRINT-ONLY DOSSIER (Visible only in print / PDF export) */}
      <div className="hidden print-only p-8 bg-white">
        <div className="border-b-2 border-black pb-4 mb-6">
          <h1 className="text-2xl font-black uppercase tracking-wide">{handover.title} - Official Guest ID Dossier</h1>
          <p className="text-sm font-bold text-gray-700">
            Resort: {handover.resortName} | Event Dates: {handover.startDate} to {handover.endDate}
          </p>
          <p className="text-xs text-gray-500 mt-1">Generated on: {new Date().toLocaleString()}</p>
        </div>

        <div className="space-y-8">
          {guests.map((guest, idx) => (
            <div key={guest.id} className="border-2 border-gray-400 rounded-lg p-5 page-break-inside-avoid">
              <div className="flex justify-between items-start border-b pb-2 mb-4 bg-gray-50 p-2 rounded">
                <div>
                  <h2 className="text-base font-black text-gray-900">
                    {idx + 1}. Family Head: {guest.name}
                  </h2>
                  <p className="text-xs font-bold text-gray-700">Phone: {guest.phone}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black uppercase bg-gray-200 px-2 py-0.5 rounded">
                    Total Pax: {guest.totalPax || 2} ({guest.adultsCount || 2}A + {guest.minorsCount || 0}M)
                  </span>
                  {guest.callNotes && <p className="text-[11px] text-gray-600 italic mt-0.5">Note: {guest.callNotes}</p>}
                </div>
              </div>

              {/* Attendees List with IDs */}
              <div className="space-y-4">
                {(guest.attendees && guest.attendees.length > 0
                  ? guest.attendees
                  : [{ id: "head", name: guest.name, ageGroup: "Adult", assignedIdUrls: guest.idCardUrls || [] }]
                ).map((att: any, aIdx: number) => (
                  <div key={aIdx} className="border p-3 rounded-lg bg-white flex flex-col md:flex-row gap-4 items-start">
                    <div className="w-48 flex-shrink-0">
                      <span className="text-[10px] font-black uppercase text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 block mb-1">
                        Attendee #{aIdx + 1}
                      </span>
                      <strong className="text-sm font-black text-gray-900 block">{att.name}</strong>
                      <span className="text-xs font-semibold text-gray-500">Age: {att.ageGroup || "Adult"}</span>
                    </div>

                    <div className="flex-1">
                      <span className="text-[11px] font-bold text-gray-500 block mb-1">Verified Government Photo ID(s):</span>
                      {att.assignedIdUrls && att.assignedIdUrls.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {att.assignedIdUrls.map((url: string, uIdx: number) => (
                            <div key={uIdx} className="border-2 border-gray-300 rounded overflow-hidden p-1 bg-gray-50">
                              <img
                                src={url}
                                alt="ID Document"
                                className="w-full h-44 object-contain rounded bg-white"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No ID proof assigned yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Screen Body */}
      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-6 no-print">
        {/* Actions & Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-300 shadow-sm">
          <input
            placeholder="Search by Name or Mobile..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-80 border p-2 rounded-lg text-xs font-bold"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowManualAddModal(true)}
              className="bg-purple-700 hover:bg-purple-800 text-white font-black px-3 py-2 rounded-lg text-xs shadow"
            >
              + Add Manually
            </button>
            <label className="bg-gray-100 border hover:bg-gray-200 text-gray-800 font-black px-3 py-2 rounded-lg text-xs cursor-pointer shadow">
              {uploadingExcel ? "Importing..." : "📥 Excel File"}
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Directory Table */}
        <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 font-black uppercase text-[10px] text-gray-700 border-b">
                <tr>
                  <th className="p-3">Guest / Family Head</th>
                  <th className="p-3 text-center">Pax</th>
                  <th className="p-3">Calling Notes</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3">WhatsApp ID Request</th>
                  <th className="p-3">Live Chat</th>
                  <th className="p-3">Attendees & IDs</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredGuests.map((guest) => (
                  <tr key={guest.id} className="hover:bg-gray-50">
                    {/* Clickable Name opens Attendee Assignment Modal */}
                    <td className="p-3">
                      <button
                        onClick={() => handleOpenAttendeeModal(guest)}
                        className="font-black text-sm text-purple-900 hover:underline hover:text-purple-700 text-left block"
                        title="Click to view & assign family members and IDs"
                      >
                        {guest.name} 👤
                      </button>
                      <p className="text-gray-500 font-mono">{guest.phone}</p>
                    </td>

                    <td className="p-3 text-center font-bold">{guest.totalPax || 2}</td>

                    <td className="p-3">
                      <input
                        placeholder="Arrival notes..."
                        value={guest.callNotes || ""}
                        onChange={(e) =>
                          handleUpdateCounts(guest.id, guest.adultsCount || 2, guest.minorsCount || 0, guest.status, e.target.value)
                        }
                        className="w-full border p-1 rounded text-xs"
                      />
                    </td>

                    <td className="p-3 text-center font-bold">
                      <select
                        value={guest.status || "Pending Call"}
                        onChange={(e) =>
                          handleUpdateCounts(guest.id, guest.adultsCount || 2, guest.minorsCount || 0, e.target.value, guest.callNotes)
                        }
                        className="border p-1 rounded text-xs"
                      >
                        <option value="Pending Call">Pending Call</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="IDs Received">IDs Received</option>
                        <option value="Declined">Declined</option>
                      </select>
                    </td>

                    {/* WhatsApp Template Sender with Live Ticks */}
                    <td className="p-3 whitespace-nowrap">
                      <button
                        onClick={() => handleSendWhatsApp(guest)}
                        disabled={sendingWhatsappId === guest.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow"
                      >
                        {sendingWhatsappId === guest.id ? "Sending..." : "📲 Send ID Request"}
                      </button>
                      <div className="flex items-center gap-1 text-[10px] mt-1 text-gray-500">
                        {renderMessageTicks(guest.whatsappStatus)}
                        <span>{guest.whatsappStatus ? `(${guest.whatsappStatus})` : "Not sent"}</span>
                      </div>
                    </td>

                    {/* Chat Modal Trigger */}
                    <td className="p-3">
                      <button
                        onClick={() => setActiveChatGuest(guest)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-black px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow"
                      >
                        💬 Chat
                        {guest.hasUnreadMessages && (
                          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                        )}
                      </button>
                    </td>

                    {/* Attendee Roster Preview */}
                    <td className="p-3">
                      <button
                        onClick={() => handleOpenAttendeeModal(guest)}
                        className="text-xs font-bold text-gray-700 hover:text-purple-700 flex items-center gap-1.5"
                      >
                        <span className="bg-purple-100 text-purple-900 px-2 py-0.5 rounded font-black">
                          {guest.attendees?.length || 1} Person(s)
                        </span>
                        <span className="text-gray-400">|</span>
                        <span className="text-emerald-700 font-bold">
                          {guest.idCardUrls?.length || 0} IDs
                        </span>
                      </button>
                    </td>

                    {/* Delete Action */}
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeleteGuest(guest.id, guest.name)}
                        className="text-red-600 font-bold hover:underline text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* POP-UP: MANAGE ATTENDEES & ASSIGN LARGE ID THUMBNAILS WITH ZOOM & ALREADY ASSIGNED BADGES */}
      {selectedAttendeeGuest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full h-[90vh] flex flex-col overflow-hidden shadow-2xl border-2 border-gray-300">
            {/* Modal Header */}
            <div className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <span className="text-xs uppercase font-black tracking-widest text-emerald-400">
                  Guest Verification & Attendee Roster
                </span>
                <h2 className="text-xl font-black">
                  {selectedAttendeeGuest.name} ({selectedAttendeeGuest.phone})
                </h2>
              </div>
              <button
                onClick={() => setSelectedAttendeeGuest(null)}
                className="text-gray-400 hover:text-white text-2xl font-black"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Add Attendee Bar */}
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                <span className="text-xs font-black text-purple-900 block mb-2">
                  + Add Family Member Attending with {selectedAttendeeGuest.name}:
                </span>
                <div className="flex gap-2">
                  <input
                    placeholder="e.g. Sunita Sharma (Spouse) or Rohan Sharma (Son)"
                    value={newAttendeeName}
                    onChange={(e) => setNewAttendeeName(e.target.value)}
                    className="flex-1 border p-2 rounded-lg text-xs font-bold"
                  />
                  <select
                    value={newAttendeeAgeGroup}
                    onChange={(e) => setNewAttendeeAgeGroup(e.target.value)}
                    className="border p-2 rounded-lg text-xs font-bold bg-white"
                  >
                    <option value="Adult">Adult</option>
                    <option value="Minor">Minor / Child</option>
                    <option value="Senior">Senior Citizen</option>
                  </select>
                  <button
                    onClick={handleAddAttendee}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-black px-4 py-2 rounded-lg text-xs"
                  >
                    Add Attendee
                  </button>
                </div>
              </div>

              {/* Roster & ID Assignment Grid */}
              <div className="space-y-4">
                <h3 className="font-black text-sm text-gray-800 uppercase tracking-wide">
                  Assign Received IDs to Each Individual Attendee
                </h3>

                {(selectedAttendeeGuest.attendees || []).map((att: any, idx: number) => (
                  <div key={att.id} className="border-2 border-gray-300 rounded-xl p-4 bg-slate-50 space-y-3">
                    <div className="flex justify-between items-center border-b pb-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-purple-200 text-purple-950 font-black px-2 py-0.5 rounded text-xs">
                          Person #{idx + 1}
                        </span>
                        <strong className="text-base font-black text-gray-900">{att.name}</strong>
                        <span className="text-xs text-gray-500 font-semibold">({att.ageGroup})</span>
                      </div>
                      <button
                        onClick={() => handleRemoveAttendee(att.id)}
                        className="text-red-600 hover:text-red-800 text-xs font-bold"
                      >
                        Remove
                      </button>
                    </div>

                    {/* ID Selector with Zoom and Already Assigned Indicator */}
                    <div>
                      <span className="text-xs font-bold text-gray-600 block mb-2">
                        Click on any ID photo below to attach/detach it for <strong>{att.name}</strong>:
                      </span>

                      {selectedAttendeeGuest.idCardUrls && selectedAttendeeGuest.idCardUrls.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {selectedAttendeeGuest.idCardUrls.map((url: string, pIdx: number) => {
                            const isSelectedForThisAttendee = (att.assignedIdUrls || []).includes(url);
                            const assignedToName = getAssignedAttendeeName(url);
                            const isAssignedToOther = assignedToName && assignedToName !== att.name;

                            return (
                              <div
                                key={pIdx}
                                className={`relative rounded-xl overflow-hidden border-4 transition shadow-sm bg-white flex flex-col justify-between ${
                                  isSelectedForThisAttendee
                                    ? "border-emerald-600 ring-2 ring-emerald-400"
                                    : isAssignedToOther
                                    ? "border-amber-400 bg-amber-50/40"
                                    : "border-gray-200"
                                }`}
                              >
                                {/* Thumbnail */}
                                <div className="relative group h-32 w-full bg-gray-100 overflow-hidden">
                                  <img
                                    src={url}
                                    alt="ID Thumbnail"
                                    className="w-full h-full object-cover"
                                  />
                                  {/* ENLARGE BUTTON */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveLightboxImg(url);
                                    }}
                                    className="absolute bottom-2 right-2 bg-black/75 hover:bg-black text-white px-2 py-1 rounded-md text-[10px] font-bold shadow flex items-center gap-1"
                                    title="View Full Resolution"
                                  >
                                    🔍 Enlarge ID
                                  </button>
                                </div>

                                {/* Status & Assignment Toggle Bar */}
                                <div className="p-2 border-t flex flex-col justify-between gap-1">
                                  {/* Already Assigned Badges */}
                                  {isSelectedForThisAttendee ? (
                                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-center">
                                      ✓ Assigned to {att.name}
                                    </span>
                                  ) : isAssignedToOther ? (
                                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-center truncate">
                                      Assigned to: {assignedToName}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded text-center">
                                      ⚠ Unassigned
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleAssignPhotoToAttendee(att.id, url)}
                                    className={`w-full py-1 rounded text-[11px] font-black transition ${
                                      isSelectedForThisAttendee
                                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                                    }`}
                                  >
                                    {isSelectedForThisAttendee ? "Remove ID" : "Assign to this Person"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 italic">
                          No ID photos have been received from this guest on WhatsApp yet.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-100 border-t flex justify-end gap-3">
              <button
                onClick={() => setSelectedAttendeeGuest(null)}
                className="px-4 py-2 border font-bold text-xs rounded-xl bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAttendees}
                disabled={savingAttendees}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow"
              >
                {savingAttendees ? "Saving Changes..." : "Save Attendee Roster & IDs"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN LIVE WHATSAPP CHAT MODAL */}
      {activeChatGuest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex flex-col md:p-6 p-0 no-print">
          <div className="bg-white w-full h-full md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-300">
            {/* Header */}
            <div className="bg-[#075E54] text-white px-6 py-3 flex justify-between items-center shadow-md">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveChatGuest(null)}
                  className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1"
                >
                  ← Close
                </button>
                <div>
                  <h3 className="font-black text-base leading-tight flex items-center gap-2">
                    {activeChatGuest.name}
                    <span className="text-[10px] bg-emerald-700 px-2 py-0.5 rounded text-emerald-100 font-normal">
                      WhatsApp Connected
                    </span>
                  </h3>
                  <p className="text-xs text-gray-200 font-mono mt-0.5">
                    {activeChatGuest.phone} • {activeChatGuest.totalPax || 2} Pax • {activeChatGuest.status}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-emerald-100 block">Team Brajwal RSVP Desk</span>
                <span className="text-[10px] text-gray-300 font-mono">{handover.resortName}</span>
              </div>
            </div>

            {/* Chat Body Wallpaper Feed */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#efeae2]">
              {chatMessages.map((msg) => {
                const isOutbound = msg.direction === "outbound";

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-xl rounded-2xl p-3 text-xs shadow-sm space-y-1.5 ${
                        isOutbound
                          ? "bg-[#d9fdd3] text-gray-900 rounded-tr-none border border-emerald-200"
                          : "bg-white text-gray-900 rounded-tl-none border border-gray-200"
                      }`}
                    >
                      <span className="text-[10px] font-bold text-gray-500 block">
                        {isOutbound ? msg.senderName || "Executive" : activeChatGuest.name}
                      </span>

                      {/* Message Text */}
                      {msg.body && (
                        <p className="leading-relaxed whitespace-pre-wrap text-[13px] font-sans">
                          {msg.body}
                        </p>
                      )}

                      {/* Attachments */}
                      {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                        <div className="space-y-2 pt-1">
                          {msg.mediaUrls.map((url: string, idx: number) => {
                            const isAudio = url.includes(".mp4") || url.includes(".m4a") || url.includes("audio");
                            const isPdf = url.includes(".pdf");
                            const isVideo = url.includes("video");

                            if (isAudio) {
                              return (
                                <div key={idx} className="bg-white/80 p-2 rounded-lg border">
                                  <span className="text-[10px] font-bold text-gray-600 block mb-1">
                                    🎤 Voice Note
                                  </span>
                                  <audio controls className="w-64 h-8" src={url} />
                                </div>
                              );
                            }

                            if (isVideo) {
                              return (
                                <video key={idx} controls className="max-w-xs rounded-lg border max-h-60">
                                  <source src={url} />
                                </video>
                              );
                            }

                            if (isPdf) {
                              return (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 bg-white rounded-lg border hover:bg-gray-50 text-blue-700 font-bold"
                                >
                                  📄 View Document (PDF)
                                </a>
                              );
                            }

                            return (
                              <img
                                key={idx}
                                src={url}
                                alt="Attachment"
                                onClick={() => setActiveLightboxImg(url)}
                                className="max-w-xs max-h-64 object-cover rounded-lg border cursor-zoom-in"
                              />
                            );
                          })}
                        </div>
                      )}

                      {/* Timestamp & Real-Time Delivery Ticks */}
                      <div className="flex items-center justify-end gap-1.5 text-[10px] text-gray-400 font-mono">
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {isOutbound && renderMessageTicks(msg.status)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {chatMessages.length === 0 && (
                <div className="py-24 text-center text-gray-500 text-xs italic">
                  No conversation history yet. Send a message below to start chatting.
                </div>
              )}
            </div>

            {/* Input Action Bar */}
            <div className="p-3 bg-[#f0f2f5] border-t flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleSelectFile}
                accept="image/*,video/*,application/pdf,.doc,.docx"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAttachment || isRecording}
                className="p-2 text-gray-600 hover:text-black hover:bg-gray-200 rounded-full transition disabled:opacity-50"
                title="Attach Document / Photo"
              >
                📎
              </button>

              {isRecording ? (
                <div className="flex-1 flex items-center justify-between bg-red-50 border border-red-300 px-4 py-2 rounded-xl">
                  <div className="flex items-center gap-2 text-red-600 font-bold text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
                    Recording ({recordingDuration}s)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelVoiceRecording}
                      className="text-xs font-bold text-gray-600 hover:text-black px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={stopAndSendVoiceRecording}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded-lg text-xs shadow"
                    >
                      Send Audio ➤
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendChatReply} className="flex-1 flex items-center gap-2">
                  <input
                    required
                    placeholder={`Type a message to ${activeChatGuest.name}...`}
                    value={chatInputText}
                    onChange={(e) => setChatInputText(e.target.value)}
                    className="flex-1 border border-gray-300 p-2.5 rounded-xl text-xs bg-white outline-none focus:border-emerald-600"
                  />

                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    disabled={uploadingAttachment}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-200 rounded-full transition"
                    title="Record Voice Note"
                  >
                    🎙️
                  </button>

                  <button
                    type="submit"
                    disabled={sendingChatMessage || uploadingAttachment}
                    className="bg-[#00a884] hover:bg-[#067f65] text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow transition disabled:opacity-50 flex items-center gap-1"
                  >
                    {sendingChatMessage || uploadingAttachment ? "Sending..." : "Send ➤"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION & PREVIEW MODAL FOR ATTACHMENT */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border">
            <h3 className="text-base font-black text-gray-900 border-b pb-2">Confirm Attachment</h3>

            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 bg-gray-50">
              {pendingFilePreview ? (
                <img
                  src={pendingFilePreview}
                  alt="Preview"
                  className="max-h-60 max-w-full object-contain rounded-lg shadow-sm"
                />
              ) : (
                <div className="text-center py-6">
                  <span className="text-4xl block mb-2">📄</span>
                  <p className="font-bold text-xs text-gray-800">{pendingFile.name}</p>
                  <p className="text-[10px] text-gray-500">{(pendingFile.size / 1024).toFixed(1)} KB</p>
                </div>
              )}
            </div>

            <input
              placeholder="Add an optional caption..."
              value={pendingFileCaption}
              onChange={(e) => setPendingFileCaption(e.target.value)}
              className="w-full border p-2 rounded-xl text-xs font-medium"
            />

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={handleCancelAttachment}
                disabled={uploadingAttachment}
                className="px-4 py-2 border font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSendAttachment}
                disabled={uploadingAttachment}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow"
              >
                {uploadingAttachment ? "Sending File..." : "Confirm & Send ➤"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Guest Modal */}
      {showManualAddModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-black text-gray-900 border-b pb-2">Add Guest</h3>
            <form onSubmit={handleManualAddGuest} className="space-y-3 text-xs">
              <input
                required
                placeholder="Family Head Name *"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full border p-2 rounded-lg font-bold"
              />
              <input
                required
                placeholder="WhatsApp Number *"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                className="w-full border p-2 rounded-lg font-bold"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Adults"
                  value={manualAdults}
                  onChange={(e) => setManualAdults(Number(e.target.value))}
                  className="w-full border p-2 rounded-lg text-center"
                />
                <input
                  type="number"
                  placeholder="Minors"
                  value={manualMinors}
                  onChange={(e) => setManualMinors(Number(e.target.value))}
                  className="w-full border p-2 rounded-lg text-center"
                />
              </div>
              <input
                placeholder="Arrival notes..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="w-full border p-2 rounded-lg"
              />
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowManualAddModal(false)} className="px-3 py-1.5 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={savingManualGuest} className="px-4 py-1.5 bg-purple-700 text-white font-bold rounded-lg">
                  {savingManualGuest ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox / Enlarge ID Modal */}
      {activeLightboxImg && (
        <div
          onClick={() => setActiveLightboxImg(null)}
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 cursor-zoom-out no-print"
        >
          <button
            onClick={() => setActiveLightboxImg(null)}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white font-black px-4 py-2 rounded-full text-xs transition"
          >
            ✕ Close Preview
          </button>
          <img
            src={activeLightboxImg}
            alt="ID Document"
            className="max-w-full max-h-[85vh] object-contain rounded-xl bg-white shadow-2xl"
          />
        </div>
      )}

      {/* PRINT-OPTIMIZED CSS */}
      <style jsx global>{`
        @media print {
          body { background: white !important; font-size: 11pt !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .page-break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}