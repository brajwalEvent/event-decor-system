"use client";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, storage } from "../../../../lib/firebase";
import { 
  collection, 
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

  // BULK SELECTION & ACTIONS
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [showBulkTemplateModal, setShowBulkTemplateModal] = useState(false);
  const [customTemplateSid, setCustomTemplateSid] = useState("");
  const [customTemplateVar1, setCustomTemplateVar1] = useState("GuestName");
  const [customTemplateVar2, setCustomTemplateVar2] = useState("ResortName");
  const [customTemplateVar3, setCustomTemplateVar3] = useState("WeddingTitle");

  // BULK DELETE VERIFICATION MODAL
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  // EDIT GUEST MODAL
  const [editingGuest, setEditingGuest] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAdults, setEditAdults] = useState<number>(2);
  const [editMinors, setEditMinors] = useState<number>(0);
  const [editNotes, setEditNotes] = useState("");
  const [savingEditGuest, setSavingEditGuest] = useState(false);

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

  // WHATSAPP WEB STYLE CHAT
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [activeChatGuest, setActiveChatGuest] = useState<any | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInputText, setChatInputText] = useState("");
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Lightbox / Document Preview
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);
  const [activeLightboxDoc, setActiveLightboxDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // REALTIME ON-SNAPSHOT FOR HANDOVER & ALL RSVPS
  useEffect(() => {
    if (!handoverId) return;

    getDoc(doc(db, "handovers", handoverId)).then((snap) => {
      if (snap.exists()) setHandover(snap.data());
    });

    const q = query(collection(db, "handovers", handoverId, "rsvps"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveGuests = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setGuests(liveGuests);

      setActiveChatGuest((prev: any) => {
        if (!prev) return null;
        return liveGuests.find((g) => g.id === prev.id) || prev;
      });

      setSelectedAttendeeGuest((prev: any) => {
        if (!prev) return null;
        return liveGuests.find((g) => g.id === prev.id) || prev;
      });
    });

    return () => unsubscribe();
  }, [handoverId]);

  // AUTO-SCROLL TO BOTTOM FUNCTION
  const scrollToLatestMessage = (smooth = false) => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
      }
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 60);
  };

  // Real-time listener for active chat guest's individual messages
  useEffect(() => {
    if (!activeChatGuest || !handoverId) return;

    const q = query(
      collection(db, "handovers", handoverId, "rsvps", activeChatGuest.id, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChatMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      scrollToLatestMessage(false);
    });

    if (activeChatGuest.hasUnreadMessages) {
      updateDoc(doc(db, "handovers", handoverId, "rsvps", activeChatGuest.id), {
        hasUnreadMessages: false,
      });
    }

    return () => unsubscribe();
  }, [activeChatGuest?.id, handoverId]);

  // Auto-scroll when chat modal opens or active chat switches
  useEffect(() => {
    if (isChatModalOpen && activeChatGuest) {
      scrollToLatestMessage(false);
      // Double check after modal transitions
      setTimeout(() => scrollToLatestMessage(false), 200);
    }
  }, [isChatModalOpen, activeChatGuest?.id]);

  // Smart PDF detection (checks both URL and message filename text)
  const isPdfFile = (url: string, msgBody?: string) => {
    const u = (url || "").toLowerCase();
    const b = (msgBody || "").toLowerCase();
    return (
      u.includes(".pdf") ||
      u.includes("application/pdf") ||
      b.endsWith(".pdf") ||
      b.includes(".pdf")
    );
  };

  const cleanPhoneNumber = (val: any): string => {
    if (!val) return "";
    let s = String(val).replace(/[^0-9]/g, "");
    if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
    return s;
  };

  // WHATSAPP DELIVERY TICKS SVG COMPONENT
  const renderMessageTicks = (status?: string) => {
    switch (status) {
      case "read":
        return (
          <span className="inline-flex items-center text-[#53bdeb] ml-1" title="Read (Blue Ticks)">
            <svg viewBox="0 0 16 15" width="16" height="15" className="fill-current">
              <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.365.365 0 0 1-.516.005l-1.32-1.32a.364.364 0 0 0-.514.006l-.423.433a.364.364 0 0 0 .006.514l2.122 2.122c.143.14.361.125.484-.031l6.568-8.524a.365.365 0 0 0-.063-.508v.002z" />
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879 2.035 7.425a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.031l5.943-7.707a.365.365 0 0 0-.063-.508h-.004z" />
            </svg>
          </span>
        );
      case "delivered":
        return (
          <span className="inline-flex items-center text-gray-500 ml-1" title="Delivered to Phone">
            <svg viewBox="0 0 16 15" width="16" height="15" className="fill-current">
              <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.365.365 0 0 1-.516.005l-1.32-1.32a.364.364 0 0 0-.514.006l-.423.433a.364.364 0 0 0 .006.514l2.122 2.122c.143.14.361.125.484-.031l6.568-8.524a.365.365 0 0 0-.063-.508v.002z" />
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879 2.035 7.425a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.031l5.943-7.707a.365.365 0 0 0-.063-.508h-.004z" />
            </svg>
          </span>
        );
      case "sent":
      case "queued":
        return (
          <span className="inline-flex items-center text-gray-400 ml-1" title="Sent to Server">
            <svg viewBox="0 0 16 15" width="16" height="15" className="fill-current">
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879 2.035 7.425a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.031l5.943-7.707a.365.365 0 0 0-.063-.508h-.004z" />
            </svg>
          </span>
        );
      case "failed":
      case "undelivered":
        return <span className="text-red-600 font-bold text-xs ml-1" title="Failed">✕</span>;
      default:
        return (
          <span className="inline-flex items-center text-gray-400 ml-1">
            <svg viewBox="0 0 16 15" width="16" height="15" className="fill-current">
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879 2.035 7.425a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.031l5.943-7.707a.365.365 0 0 0-.063-.508h-.004z" />
            </svg>
          </span>
        );
    }
  };

  // SEND SINGLE ID REQUEST
  const handleSendWhatsApp = async (guest: any) => {
    setSendingWhatsappId(guest.id);
    try {
      const res = await fetch("/api/twilio/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: guest.phone,
          guestName: guest.name,
          weddingTitle: handover?.title || "the wedding",
          resortName: handover?.resortName || "the resort",
          handoverId,
          guestId: guest.id,
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
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (err) {
      alert("Error sending WhatsApp ID Request.");
    } finally {
      setSendingWhatsappId(null);
    }
  };

  // EDIT CONTACT / PAX MODAL HANDLERS
  const handleOpenEditModal = (guest: any) => {
    setEditingGuest(guest);
    setEditName(guest.name || "");
    setEditPhone(guest.phone || "");
    setEditAdults(guest.adultsCount ?? 2);
    setEditMinors(guest.minorsCount ?? 0);
    setEditNotes(guest.callNotes || "");
  };

  const handleSaveEditedGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGuest || !editName.trim() || !editPhone.trim()) return;

    setSavingEditGuest(true);
    try {
      const cleanPhone = cleanPhoneNumber(editPhone);
      const total = Math.max(0, Number(editAdults)) + Math.max(0, Number(editMinors));

      let updatedAttendees = editingGuest.attendees || [];
      if (updatedAttendees.length > 0 && updatedAttendees[0].name === editingGuest.name) {
        updatedAttendees[0] = { ...updatedAttendees[0], name: editName.trim() };
      }

      await updateDoc(doc(db, "handovers", handoverId, "rsvps", editingGuest.id), {
        name: editName.trim(),
        phone: editPhone.trim(),
        cleanPhone: cleanPhone.slice(-10),
        adultsCount: Math.max(0, Number(editAdults)),
        minorsCount: Math.max(0, Number(editMinors)),
        totalPax: total,
        callNotes: editNotes.trim(),
        attendees: updatedAttendees,
        updatedAt: new Date().toISOString(),
      });

      setEditingGuest(null);
    } catch (err) {
      alert("Failed to update guest details.");
    } finally {
      setSavingEditGuest(false);
    }
  };

  // BULK SELECTION HANDLERS
  const filteredGuests = guests.filter((g) => {
    const matchStatus = statusFilter === "All" || g.status === statusFilter;
    const matchSearch =
      !searchQuery ||
      g.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.phone?.includes(searchQuery);
    return matchStatus && matchSearch;
  });

  const handleToggleSelectGuest = (id: string) => {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedGuestIds(new Set(filteredGuests.map((g) => g.id)));
  };

  const handleDeselectAll = () => {
    setSelectedGuestIds(new Set());
  };

  // BULK DELETE WITH VERIFICATION
  const handleBulkDeleteConfirm = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      alert("Please type 'DELETE' exactly into the box to confirm deletion.");
      return;
    }

    setIsDeletingBulk(true);
    try {
      const idsToDelete = Array.from(selectedGuestIds);
      for (const id of idsToDelete) {
        await deleteDoc(doc(db, "handovers", handoverId, "rsvps", id));
      }
      setSelectedGuestIds(new Set());
      setShowBulkDeleteModal(false);
      setDeleteConfirmText("");
      alert(`Successfully deleted ${idsToDelete.length} contacts.`);
    } catch (err) {
      alert("Error deleting some contacts.");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  // BULK SEND ID REQUEST
  const handleBulkSendIdRequest = async () => {
    if (selectedGuestIds.size === 0) return;
    if (!window.confirm(`Send WhatsApp ID request to ${selectedGuestIds.size} selected guests?`)) return;

    setIsBulkRunning(true);
    const targetGuests = guests.filter((g) => selectedGuestIds.has(g.id));
    setBulkProgress({ current: 0, total: targetGuests.length });

    let sentCount = 0;
    for (let i = 0; i < targetGuests.length; i++) {
      const guest = targetGuests[i];
      setBulkProgress({ current: i + 1, total: targetGuests.length });
      try {
        await handleSendWhatsApp(guest);
        sentCount++;
      } catch (err) {
        console.error(err);
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    setIsBulkRunning(false);
    setBulkProgress(null);
    alert(`Bulk Send Complete! Sent to ${sentCount} of ${targetGuests.length} guests.`);
  };

  // BULK SEND CUSTOM APPROVED TEMPLATE
  const handleBulkSendCustomTemplate = async () => {
    if (!customTemplateSid.trim()) {
      alert("Please enter a valid Twilio Content/Template SID.");
      return;
    }
    const targetGuests = guests.filter((g) => selectedGuestIds.has(g.id));
    if (targetGuests.length === 0) return;

    setIsBulkRunning(true);
    setShowBulkTemplateModal(false);
    setBulkProgress({ current: 0, total: targetGuests.length });

    let sentCount = 0;
    for (let i = 0; i < targetGuests.length; i++) {
      const guest = targetGuests[i];
      setBulkProgress({ current: i + 1, total: targetGuests.length });

      const val1 = customTemplateVar1 === "GuestName" ? guest.name : customTemplateVar1 === "ResortName" ? handover?.resortName : handover?.title;
      const val2 = customTemplateVar2 === "GuestName" ? guest.name : customTemplateVar2 === "ResortName" ? handover?.resortName : handover?.title;
      const val3 = customTemplateVar3 === "GuestName" ? guest.name : customTemplateVar3 === "ResortName" ? handover?.resortName : handover?.title;

      try {
        const res = await fetch("/api/twilio/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: guest.phone,
            guestName: guest.name,
            weddingTitle: handover?.title || "the wedding",
            resortName: handover?.resortName || "the resort",
            templateSid: customTemplateSid.trim(),
            contentVariables: { "1": val1, "2": val2, "3": val3 },
            handoverId,
            guestId: guest.id,
          }),
        });

        const result = await res.json();
        if (result.success) {
          await addDoc(collection(db, "handovers", handoverId, "rsvps", guest.id, "messages"), {
            direction: "outbound",
            body: result.formattedText || `Template [${customTemplateSid.trim()}]`,
            sid: result.sid,
            status: "sent",
            timestamp: new Date().toISOString(),
            senderName: "Team Brajwal (Bulk Template)",
          });

          await updateDoc(doc(db, "handovers", handoverId, "rsvps", guest.id), {
            whatsappSentAt: new Date().toISOString(),
            whatsappStatus: "sent",
            lastMessage: `Template [${customTemplateSid.trim().slice(-6)}] sent`,
            lastMessageAt: new Date().toISOString(),
          });
          sentCount++;
        }
      } catch (e) {
        console.error(e);
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    setIsBulkRunning(false);
    setBulkProgress(null);
    alert(`Bulk Template Sent! Delivered to ${sentCount} of ${targetGuests.length} guests.`);
  };

  // SEND LIVE CHAT MESSAGE
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
      } else {
        scrollToLatestMessage(true);
      }
    } catch (err) {
      alert("Error sending message.");
      setChatInputText(text);
    } finally {
      setSendingChatMessage(false);
    }
  };

  // ATTACHMENT HANDLERS
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
        scrollToLatestMessage(true);
      }
    } catch (err) {
      alert("Error sending attachment.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  // VOICE NOTE RECORDING
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
      alert("Microphone permission denied.");
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
        scrollToLatestMessage(true);
      } catch (e) {
        alert("Failed to send voice recording.");
      } finally {
        setUploadingAttachment(false);
      }
    };

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
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

  const handleAssignPhotoToAttendee = (attId: string, docUrl: string) => {
    if (!selectedAttendeeGuest) return;
    const updatedAttendees = (selectedAttendeeGuest.attendees || []).map((att: any) => {
      if (att.id === attId) {
        const exists = (att.assignedIdUrls || []).includes(docUrl);
        return {
          ...att,
          assignedIdUrls: exists
            ? att.assignedIdUrls.filter((u: string) => u !== docUrl)
            : [...(att.assignedIdUrls || []), docUrl],
        };
      }
      return att;
    });

    setSelectedAttendeeGuest({
      ...selectedAttendeeGuest,
      attendees: updatedAttendees,
    });
  };

  const getAssignedAttendeeName = (docUrl: string) => {
    if (!selectedAttendeeGuest?.attendees) return null;
    const match = selectedAttendeeGuest.attendees.find((a: any) =>
      (a.assignedIdUrls || []).includes(docUrl)
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
      setSelectedAttendeeGuest(null);
    } catch (err) {
      alert("Failed to save attendees.");
    } finally {
      setSavingAttendees(false);
    }
  };

  // QUICK UPDATE STATUS & NOTES
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
  };

  // MANUAL ADD GUEST
  const handleManualAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualPhone.trim()) return;

    setSavingManualGuest(true);
    try {
      const total = Number(manualAdults) + Number(manualMinors);
      const cleanPhone = cleanPhoneNumber(manualPhone);

      await addDoc(collection(db, "handovers", handoverId, "rsvps"), {
        name: manualName.trim(),
        phone: manualPhone.trim(),
        cleanPhone: cleanPhone.slice(-10),
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
      setManualName("");
      setManualPhone("");
      setManualNotes("");
    } finally {
      setSavingManualGuest(false);
    }
  };

  // EXCEL / CSV IMPORT
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary", raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        let addedCount = 0;
        for (const row of data) {
          const keys = Object.keys(row);
          const nameKey = keys.find((k) => /name|family|head|guest/i.test(k));
          const phoneKey = keys.find((k) => /phone|mobile|contact|whatsapp|cell|tel|mob/i.test(k));
          const paxKey = keys.find((k) => /pax|count|total|members/i.test(k));

          const rawName = nameKey ? row[nameKey] : row["Name"] || row["Guest Name"] || "";
          const rawPhone = phoneKey ? row[phoneKey] : row["Phone"] || row["Mobile"] || "";
          const rawPax = paxKey ? row[paxKey] : row["Pax"] || 2;

          let cleanPhoneStr = cleanPhoneNumber(rawPhone);
          const nameStr = String(rawName).trim();
          const paxNum = parseInt(String(rawPax), 10) || 2;

          if (nameStr && cleanPhoneStr) {
            await addDoc(collection(db, "handovers", handoverId, "rsvps"), {
              name: nameStr,
              phone: cleanPhoneStr,
              cleanPhone: cleanPhoneStr.slice(-10),
              invitedPax: paxNum,
              adultsCount: paxNum,
              minorsCount: 0,
              totalPax: paxNum,
              status: "Pending Call",
              callNotes: "",
              idCardUrls: [],
              attendees: [
                {
                  id: `att_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                  name: nameStr,
                  ageGroup: "Adult",
                  assignedIdUrls: [],
                },
              ],
              createdAt: new Date().toISOString(),
            });
            addedCount++;
          }
        }
        alert(`Successfully imported ${addedCount} guests!`);
      } catch (err: any) {
        alert(`Failed to parse file: ${err.message || "Invalid file format"}`);
      } finally {
        setUploadingExcel(false);
        if (e.target) e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDeleteGuest = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    await deleteDoc(doc(db, "handovers", handoverId, "rsvps", id));
  };

  const handleOpenChatModal = (guest: any) => {
    setActiveChatGuest(guest);
    setIsChatModalOpen(true);
    scrollToLatestMessage(false);
  };

  const filteredChatGuests = guests.filter((g) => {
    if (!chatSearchQuery) return true;
    return (
      g.name?.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
      g.phone?.includes(chatSearchQuery)
    );
  });

  if (loading || !handover) return <div className="p-12 text-center text-xl font-bold">Loading RSVP Center...</div>;

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 pb-20">
      {/* Top Banner */}
      <div className="bg-white border-b-2 border-gray-300 shadow-sm sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <button
              onClick={() => router.push(`/handovers/${handoverId}`)}
              className="text-xs font-bold text-gray-600 hover:text-black flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-md border transition mb-1"
            >
              ← Back to Handover
            </button>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              {handover.title} - Guest & ID Desk
              <span className="text-xs bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full border border-emerald-300">
                🟢 Live Sync
              </span>
            </h1>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">
              📍 {handover.resortName} | 📅 {handover.startDate} to {handover.endDate}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveChatGuest(guests[0] || null);
                setIsChatModalOpen(true);
                scrollToLatestMessage(false);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow flex items-center gap-1.5"
            >
              💬 Open WhatsApp Web Desk
            </button>
            <button
              onClick={() => window.print()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow flex items-center gap-1.5"
            >
              🖨️ Export Dossier (PDF)
            </button>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY DOSSIER */}
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
                          {att.assignedIdUrls.map((url: string, uIdx: number) => {
                            const isPdf = isPdfFile(url);
                            return (
                              <div key={uIdx} className="border-2 border-gray-300 rounded overflow-hidden p-2 bg-gray-50 flex flex-col items-center justify-center">
                                {isPdf ? (
                                  <div className="text-center py-4">
                                    <span className="text-3xl block">📄</span>
                                    <strong className="text-[11px] text-blue-700 block">PDF Government ID Proof</strong>
                                    <a href={url} target="_blank" rel="noreferrer" className="text-[9px] underline text-gray-500">
                                      View Attached Document
                                    </a>
                                  </div>
                                ) : (
                                  <img
                                    src={url}
                                    alt="ID Document"
                                    className="w-full h-44 object-contain rounded bg-white"
                                  />
                                )}
                              </div>
                            );
                          })}
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
      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-4 no-print">
        {/* Actions & Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-300 shadow-sm">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input
              placeholder="Search by Name or Mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-72 border p-2 rounded-lg text-xs font-bold"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border p-2 rounded-lg text-xs font-bold bg-white"
            >
              <option value="All">All Statuses</option>
              <option value="Pending Call">Pending Call</option>
              <option value="ID Requested">ID Requested</option>
              <option value="IDs Received">IDs Received</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Declined">Declined</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowManualAddModal(true)}
              className="bg-purple-700 hover:bg-purple-800 text-white font-black px-3 py-2 rounded-lg text-xs shadow"
            >
              + Add Manually
            </button>
            <label className="bg-gray-100 border hover:bg-gray-200 text-gray-800 font-black px-3 py-2 rounded-lg text-xs cursor-pointer shadow">
              {uploadingExcel ? "Importing Excel..." : "📥 Import Excel / CSV"}
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* BULK ACTION BAR WITH DELETE OPTION */}
        {selectedGuestIds.size > 0 && (
          <div className="bg-purple-900 text-white p-3.5 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <span className="bg-emerald-500 text-white text-xs font-black px-2.5 py-1 rounded-full">
                {selectedGuestIds.size} Selected
              </span>
              <button
                onClick={handleDeselectAll}
                className="text-xs text-purple-200 hover:text-white underline font-semibold"
              >
                Deselect All
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isBulkRunning ? (
                <div className="flex items-center gap-2 bg-purple-950 px-4 py-1.5 rounded-lg text-xs font-bold text-yellow-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping"></span>
                  Sending ({bulkProgress?.current} of {bulkProgress?.total})...
                </div>
              ) : (
                <>
                  <button
                    onClick={handleBulkSendIdRequest}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-1.5 rounded-lg text-xs shadow"
                  >
                    📲 Bulk ID Request ({selectedGuestIds.size})
                  </button>
                  <button
                    onClick={() => setShowBulkTemplateModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black px-3 py-1.5 rounded-lg text-xs shadow"
                  >
                    📢 Custom Template
                  </button>
                  <button
                    onClick={() => {
                      setDeleteConfirmText("");
                      setShowBulkDeleteModal(true);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white font-black px-3 py-1.5 rounded-lg text-xs shadow flex items-center gap-1"
                  >
                    🗑️ Delete Selected ({selectedGuestIds.size})
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Directory Table */}
        <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 font-black uppercase text-[10px] text-gray-700 border-b">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredGuests.length > 0 && selectedGuestIds.size === filteredGuests.length}
                      onChange={(e) => (e.target.checked ? handleSelectAll() : handleDeselectAll())}
                      className="cursor-pointer"
                      title="Select / Deselect All Filtered"
                    />
                  </th>
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
                {filteredGuests.map((guest) => {
                  const isChecked = selectedGuestIds.has(guest.id);

                  return (
                    <tr key={guest.id} className={`hover:bg-gray-50 ${isChecked ? "bg-purple-50/60" : ""}`}>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectGuest(guest.id)}
                          className="cursor-pointer"
                        />
                      </td>

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

                      <td className="p-3 text-center font-bold">
                        {guest.totalPax || 2}
                        <span className="text-[10px] text-gray-400 block font-normal">
                          ({guest.adultsCount || 2}A + {guest.minorsCount || 0}M)
                        </span>
                      </td>

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
                          <option value="ID Requested">ID Requested</option>
                          <option value="IDs Received">IDs Received</option>
                          <option value="Confirmed">Confirmed</option>
                          <option value="Declined">Declined</option>
                        </select>
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        <button
                          onClick={() => handleSendWhatsApp(guest)}
                          disabled={sendingWhatsappId === guest.id}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow disabled:opacity-50"
                        >
                          {sendingWhatsappId === guest.id ? "Sending..." : "📲 Send ID Request"}
                        </button>
                        <div className="flex items-center gap-1 text-[10px] mt-1 text-gray-500">
                          {renderMessageTicks(guest.whatsappStatus)}
                          <span>{guest.whatsappStatus ? `(${guest.whatsappStatus})` : "Not sent"}</span>
                        </div>
                      </td>

                      <td className="p-3">
                        <button
                          onClick={() => handleOpenChatModal(guest)}
                          className="bg-purple-600 hover:bg-purple-700 text-white font-black px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow"
                        >
                          💬 Chat
                          {guest.hasUnreadMessages && (
                            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                          )}
                        </button>
                      </td>

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

                      {/* EDIT & DELETE ACTIONS */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEditModal(guest)}
                          className="text-blue-600 hover:text-blue-800 font-bold hover:underline text-xs mr-3"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDeleteGuest(guest.id, guest.name)}
                          className="text-red-600 hover:text-red-800 font-bold hover:underline text-xs"
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

      {/* EDIT GUEST MODAL */}
      {editingGuest && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-gray-900">✏️ Edit Contact: {editingGuest.name}</h3>
              <button onClick={() => setEditingGuest(null)} className="text-gray-400 hover:text-black font-bold text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditedGuest} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Guest / Family Head Name *</label>
                <input
                  required
                  placeholder="e.g. Rajesh Sharma"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border p-2 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">WhatsApp Mobile Number *</label>
                <input
                  required
                  placeholder="e.g. 9876543210 or +919876543210"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full border p-2 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Guest Headcount (Pax)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-gray-500 font-semibold block mb-0.5">Adults:</span>
                    <input
                      type="number"
                      min="0"
                      value={editAdults}
                      onChange={(e) => setEditAdults(Number(e.target.value))}
                      className="w-full border p-2 rounded-lg text-center font-bold"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-semibold block mb-0.5">Minors:</span>
                    <input
                      type="number"
                      min="0"
                      value={editMinors}
                      onChange={(e) => setEditMinors(Number(e.target.value))}
                      className="w-full border p-2 rounded-lg text-center font-bold"
                    />
                  </div>
                </div>
                <p className="text-right text-[11px] font-black text-purple-900 mt-1">
                  Total Pax: {Math.max(0, Number(editAdults)) + Math.max(0, Number(editMinors))}
                </p>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Calling / Arrival Notes</label>
                <input
                  placeholder="Notes about food, flight arrival, etc."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full border p-2 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingGuest(null)}
                  className="px-4 py-2 border font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEditGuest}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow"
                >
                  {savingEditGuest ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK DELETE RECONFIRMATION MODAL */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border-2 border-red-500">
            <div className="flex items-center gap-3 text-red-600 border-b pb-2">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="text-base font-black text-gray-900">Permanently Delete Contacts</h3>
                <span className="text-xs text-red-600 font-bold">{selectedGuestIds.size} guests selected</span>
              </div>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              This action is <strong>irreversible</strong>. It will permanently remove all selected guests, their attendee rosters, chat history, and uploaded government ID cards from the database.
            </p>

            <div className="bg-red-50 border border-red-200 p-3 rounded-xl space-y-1">
              <label className="text-[11px] font-bold text-red-900 block">
                To confirm, type <span className="font-black text-red-600 underline">DELETE</span> below:
              </label>
              <input
                type="text"
                placeholder="Type DELETE to confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full border-2 border-red-300 p-2 rounded-lg font-black text-center text-sm tracking-wider uppercase outline-none focus:border-red-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setDeleteConfirmText("");
                }}
                disabled={isDeletingBulk}
                className="px-4 py-2 border font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                disabled={isDeletingBulk || deleteConfirmText.trim().toUpperCase() !== "DELETE"}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow disabled:opacity-40"
              >
                {isDeletingBulk ? "Deleting..." : `Delete ${selectedGuestIds.size} Guests`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ATTENDEE & ID ASSIGNMENT MODAL */}
      {selectedAttendeeGuest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full h-[90vh] flex flex-col overflow-hidden shadow-2xl border-2 border-gray-300">
            <div className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <span className="text-xs uppercase font-black tracking-widest text-emerald-400">
                  Guest Verification & Attendee Roster
                </span>
                <h2 className="text-xl font-black">
                  {selectedAttendeeGuest.name} ({selectedAttendeeGuest.phone})
                </h2>
              </div>
              <button onClick={() => setSelectedAttendeeGuest(null)} className="text-gray-400 hover:text-white text-2xl font-black">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
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

              <div className="space-y-4">
                <h3 className="font-black text-sm text-gray-800 uppercase tracking-wide">
                  Assign Received IDs (Images or PDFs) to Each Individual Attendee
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
                      <button onClick={() => handleRemoveAttendee(att.id)} className="text-red-600 hover:text-red-800 text-xs font-bold">
                        Remove
                      </button>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-gray-600 block mb-2">
                        Click on any document or photo below to assign/detach it for <strong>{att.name}</strong>:
                      </span>

                      {selectedAttendeeGuest.idCardUrls && selectedAttendeeGuest.idCardUrls.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {selectedAttendeeGuest.idCardUrls.map((url: string, pIdx: number) => {
                            const isSelectedForThisAttendee = (att.assignedIdUrls || []).includes(url);
                            const assignedToName = getAssignedAttendeeName(url);
                            const isAssignedToOther = assignedToName && assignedToName !== att.name;
                            const isPdf = isPdfFile(url);

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
                                <div className="relative group h-32 w-full bg-gray-100 overflow-hidden flex items-center justify-center">
                                  {isPdf ? (
                                    <div className="flex flex-col items-center justify-center p-2 text-center">
                                      <span className="text-4xl">📄</span>
                                      <span className="text-[10px] font-black text-blue-800 mt-1 uppercase">PDF ID Proof</span>
                                      <button
                                        type="button"
                                        onClick={() => setActiveLightboxDoc(url)}
                                        className="text-[10px] text-blue-600 font-bold underline mt-1"
                                      >
                                        🔍 Preview PDF
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <img src={url} alt="ID Thumbnail" className="w-full h-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveLightboxImg(url);
                                        }}
                                        className="absolute bottom-2 right-2 bg-black/75 hover:bg-black text-white px-2 py-1 rounded-md text-[10px] font-bold shadow flex items-center gap-1"
                                      >
                                        🔍 Enlarge
                                      </button>
                                    </>
                                  )}
                                </div>

                                <div className="p-2 border-t flex flex-col justify-between gap-1">
                                  {isSelectedForThisAttendee ? (
                                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-center truncate">
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
                          No ID photos or PDF documents have been received from this guest on WhatsApp yet.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-gray-100 border-t flex justify-end gap-3">
              <button onClick={() => setSelectedAttendeeGuest(null)} className="px-4 py-2 border font-bold text-xs rounded-xl bg-white">
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

      {/* WHATSAPP WEB STYLE REAL UI DUAL-PANE CHAT MODAL */}
      {isChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 no-print">
          <div className="bg-white w-full h-full md:rounded-2xl shadow-2xl flex overflow-hidden border border-gray-300">
            {/* LEFT SIDEBAR: ALL GUEST CHATS */}
            <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-white ${activeChatGuest ? "hidden md:flex" : "flex"}`}>
              <div className="bg-[#075E54] text-white px-4 py-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <span className="font-black text-sm">WhatsApp Chats</span>
                </div>
                <button
                  onClick={() => setIsChatModalOpen(false)}
                  className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-md text-xs font-bold"
                >
                  ✕ Close
                </button>
              </div>

              <div className="p-2 border-b bg-gray-50">
                <input
                  placeholder="Search chats by name or mobile..."
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {filteredChatGuests.map((guest) => {
                  const isActive = activeChatGuest?.id === guest.id;
                  return (
                    <div
                      key={guest.id}
                      onClick={() => {
                        setActiveChatGuest(guest);
                        scrollToLatestMessage(false);
                      }}
                      className={`p-3 cursor-pointer transition flex items-center justify-between ${
                        isActive ? "bg-emerald-50 border-l-4 border-emerald-600" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-purple-700 text-white font-black flex items-center justify-center flex-shrink-0 text-sm">
                          {guest.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-black text-gray-900 truncate">{guest.name}</h4>
                          <p className="text-[11px] text-gray-500 font-mono truncate">{guest.phone}</p>
                          <p className="text-[11px] text-gray-600 truncate mt-0.5">
                            {guest.lastMessage || "No messages yet"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 ml-2">
                        {guest.hasUnreadMessages && (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block ml-auto mb-1"></span>
                        )}
                        <span className="text-[9px] text-gray-400 block font-mono">
                          {guest.lastMessageAt
                            ? new Date(guest.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT PANE: ACTIVE CONVERSATION */}
            {activeChatGuest ? (
              <div className="flex-1 flex flex-col bg-[#efeae2]">
                <div className="bg-[#075E54] text-white px-4 py-3 flex justify-between items-center shadow-md">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveChatGuest(null)}
                      className="md:hidden text-white font-bold text-xs bg-white/20 px-2 py-1 rounded"
                    >
                      ← Back
                    </button>
                    <div>
                      <h3 className="font-black text-sm flex items-center gap-2">
                        {activeChatGuest.name}
                        <span className="text-[10px] bg-emerald-700 px-2 py-0.5 rounded text-emerald-100 font-normal">
                          WhatsApp
                        </span>
                      </h3>
                      <p className="text-[11px] text-emerald-100 font-mono">
                        {activeChatGuest.phone} • {activeChatGuest.totalPax || 2} Pax • {activeChatGuest.status}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <button
                      onClick={() => handleOpenAttendeeModal(activeChatGuest)}
                      className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-xs font-bold"
                    >
                      👤 Attendee & ID Roster ({activeChatGuest.idCardUrls?.length || 0})
                    </button>
                  </div>
                </div>

                {/* Messages Feed (Scroll Area) */}
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
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

                          {msg.body && (
                            <p className="leading-relaxed whitespace-pre-wrap text-[13px] font-sans">
                              {msg.body}
                            </p>
                          )}

                {/* Media / Audio / PDF Attachments */}
  {msg.mediaUrls && msg.mediaUrls.length > 0 && (
    <div className="space-y-2 pt-1">
      {msg.mediaUrls.map((url: string, idx: number) => {
        const isAudio = url.includes(".mp4") || url.includes(".m4a") || url.includes("audio");
        const isPdf = isPdfFile(url, msg.body);
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
          const displayName = msg.body?.toLowerCase().includes(".pdf")
            ? msg.body
            : "Government ID (PDF Document)";

          return (
            <div
              key={idx}
              className="bg-white p-3 rounded-xl border border-gray-300 shadow-sm flex items-center justify-between gap-3 max-w-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-3xl flex-shrink-0">📄</span>
                <div className="min-w-0">
                  <strong className="text-xs text-gray-900 block truncate font-bold">
                    {displayName}
                  </strong>
                  <span className="text-[10px] text-gray-500 font-semibold uppercase">
                    PDF Document
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveLightboxDoc(url)}
                  className="text-xs font-black text-blue-700 hover:bg-blue-100 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition"
                >
                  Preview
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-black text-gray-700 hover:bg-gray-100 bg-gray-50 px-2.5 py-1.5 rounded-lg border transition"
                  title="Open in new tab"
                >
                  ↗
                </a>
              </div>
            </div>
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

                          <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400 font-mono">
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isOutbound && renderMessageTicks(msg.status)}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Scroll Target Div */}
                  <div ref={messagesEndRef} className="h-1" />

                  {chatMessages.length === 0 && (
                    <div className="py-20 text-center text-gray-500 text-xs italic">
                      No conversation history yet. Send a message below to start chatting.
                    </div>
                  )}
                </div>

                {/* Input Bar */}
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
                    className="p-2 text-gray-600 hover:text-black hover:bg-gray-200 rounded-full transition disabled:opacity-50 text-base"
                    title="Attach Document / Photo / PDF"
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
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-200 rounded-full transition text-base"
                        title="Record Voice Note"
                      >
                        🎙️
                      </button>

                      <button
                        type="submit"
                        disabled={sendingChatMessage || uploadingAttachment}
                        className="bg-[#00a884] hover:bg-[#067f65] text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow transition disabled:opacity-50 flex items-center gap-1"
                      >
                        {sendingChatMessage || uploadingAttachment ? "Sending..." : "Send ➤"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 hidden md:flex flex-col items-center justify-center p-10 bg-slate-50 text-gray-400">
                <span className="text-6xl mb-3">💬</span>
                <h3 className="text-base font-black text-gray-700">Select a Guest from the Left</h3>
                <p className="text-xs text-gray-500 mt-1">Open conversation, review received IDs, or reply.</p>
              </div>
            )}
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
                  <span className="text-4xl block mb-2">{pendingFile.type.includes("pdf") ? "📄" : "📁"}</span>
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
                {uploadingAttachment ? "Sending..." : "Confirm & Send ➤"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BULK CUSTOM APPROVED TEMPLATE */}
      {showBulkTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-gray-900">Send Approved Template in Bulk</h3>
              <button onClick={() => setShowBulkTemplateModal(false)} className="text-gray-400 hover:text-black font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Sending to <strong>{selectedGuestIds.size} selected guests</strong>. Enter your Twilio Content/Template SID:
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Approved Template SID:</label>
                <input
                  placeholder="e.g. HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={customTemplateSid}
                  onChange={(e) => setCustomTemplateSid(e.target.value)}
                  className="w-full border p-2.5 rounded-lg font-mono text-xs"
                />
              </div>

              <div className="border p-3 rounded-lg bg-gray-50 space-y-2">
                <span className="font-black text-[11px] text-gray-700 block">Template Variables Mapping:</span>
                <div>
                  <label className="text-[10px] text-gray-500 font-bold">Variable {'{{1}}'}:</label>
                  <select
                    value={customTemplateVar1}
                    onChange={(e) => setCustomTemplateVar1(e.target.value)}
                    className="w-full border p-1.5 rounded bg-white"
                  >
                    <option value="GuestName">Guest Full Name</option>
                    <option value="ResortName">Resort / Venue Name</option>
                    <option value="WeddingTitle">Wedding Title</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-bold">Variable {'{{2}}'}:</label>
                  <select
                    value={customTemplateVar2}
                    onChange={(e) => setCustomTemplateVar2(e.target.value)}
                    className="w-full border p-1.5 rounded bg-white"
                  >
                    <option value="ResortName">Resort / Venue Name</option>
                    <option value="GuestName">Guest Full Name</option>
                    <option value="WeddingTitle">Wedding Title</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-bold">Variable {'{{3}}'}:</label>
                  <select
                    value={customTemplateVar3}
                    onChange={(e) => setCustomTemplateVar3(e.target.value)}
                    className="w-full border p-1.5 rounded bg-white"
                  >
                    <option value="WeddingTitle">Wedding Title</option>
                    <option value="ResortName">Resort / Venue Name</option>
                    <option value="GuestName">Guest Full Name</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowBulkTemplateModal(false)}
                className="px-4 py-2 border font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkSendCustomTemplate}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow"
              >
                Start Bulk Sending ➤
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Guest Modal */}
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
                placeholder="WhatsApp Number (e.g. 9876543210) *"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                className="w-full border p-2 rounded-lg font-bold font-mono"
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

      {/* Lightbox Modal (Images) */}
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

      {/* Lightbox Modal (PDF Viewer) */}
      {activeLightboxDoc && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-gray-900 text-white px-5 py-3 flex justify-between items-center">
              <span className="font-black text-sm">📄 Government ID PDF Preview</span>
              <button onClick={() => setActiveLightboxDoc(null)} className="text-white hover:text-red-400 font-black text-lg">
                ✕
              </button>
            </div>
            <iframe src={activeLightboxDoc} className="w-full flex-1 border-0" title="PDF ID Viewer" />
          </div>
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