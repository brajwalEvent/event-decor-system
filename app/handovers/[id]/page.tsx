"use client";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, storage } from "../../../lib/firebase";
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../../../context/AuthContext";

export default function HandoverWorkspace() {
  const params = useParams();
  const router = useRouter();
  const handoverId = params.id as string;
  const { user, role, isSuperAdmin, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [componentsLibrary, setComponentsLibrary] = useState<any[]>([]);
  const [entertainmentLibrary, setEntertainmentLibrary] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentTaggedItem, setCommentTaggedItem] = useState("");

  // Tabs: "scope" | "discussion" | "audit"
  const [activeTab, setActiveTab] = useState<"scope" | "discussion" | "audit">("scope");

  // Selection
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [selectedEventIndex, setSelectedEventIndex] = useState<number>(0);
  const [eventScopeTab, setEventScopeTab] = useState<"decor" | "entertainment">("decor");

  // FULL SCREEN COMPONENT PICKER POPUP STATES
  const [showComponentPickerModal, setShowComponentPickerModal] = useState(false);
  const [componentPickerCategory, setComponentPickerCategory] = useState("All");
  const [componentPickerSearch, setComponentPickerSearch] = useState("");
  const [currentSelectedComponent, setCurrentSelectedComponent] = useState<any | null>(null);

  // Day & Event Add States
  const [newDayName, setNewDayName] = useState("Day One");
  const [newEventName, setNewEventName] = useState("Haldi");
  const [isCustomEventName, setIsCustomEventName] = useState(false);
  const [customEventInput, setCustomEventInput] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventReadyTime, setNewEventReadyTime] = useState("");

  // Color Theme
  const [colorHex, setColorHex] = useState("#FFD700");
  const [colorRole, setColorRole] = useState("Major Drapery");

  // Decor Component Add State
  const [compCustomSize, setCompCustomSize] = useState("");
  const [compColorVariation, setCompColorVariation] = useState("");
  const [compPlacement, setCompPlacement] = useState("");
  const [compClientChanges, setCompClientChanges] = useState("");
  const [compAudioFile, setCompAudioFile] = useState<File | Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Entertainment Add State
  const [selectedEntId, setSelectedEntId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [entNotes, setEntNotes] = useState("");

  // Production Remark Modal State
  const [editingRemarkItem, setEditingRemarkItem] = useState<{ type: 'decor' | 'ent', index: number, currentRemark: string } | null>(null);
  const [remarkText, setRemarkText] = useState("");

  const isProductionOrAdmin = isSuperAdmin || role === "production" || role === "admin";
  const isSales = role === "sales";

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const fetchHandoverAndMasterData = async () => {
    try {
      const hSnap = await getDoc(doc(db, "handovers", handoverId));
      if (hSnap.exists()) {
        setHandover(hSnap.data());
      }

      const compsSnap = await import("firebase/firestore").then(async ({ getDocs, collection }) => {
        const snap = await getDocs(collection(db, "components"));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      });
      setComponentsLibrary(compsSnap);

      const entsSnap = await import("firebase/firestore").then(async ({ getDocs, collection }) => {
        const snap = await getDocs(collection(db, "entertainment"));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      });
      setEntertainmentLibrary(entsSnap);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (handoverId) fetchHandoverAndMasterData();
  }, [handoverId]);

  useEffect(() => {
    if (!handoverId) return;
    const q = query(collection(db, "handovers", handoverId, "comments"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [handoverId]);

  const logModification = async (action: string, remark: string) => {
    const logEntry = {
      author: user?.email || "User",
      role: role || "sales",
      action,
      remark: remark || "Updated scope details",
      timestamp: new Date().toISOString(),
    };
    const currentLogs = handover.auditLogs || [];
    const updatedLogs = [logEntry, ...currentLogs];

    await updateDoc(doc(db, "handovers", handoverId), {
      auditLogs: updatedLogs,
      updatedAt: new Date().toISOString(),
    });
    setHandover((prev: any) => ({ ...prev, auditLogs: updatedLogs }));
  };

  const updateHandoverDaysInDb = async (updatedDays: any[], actionText?: string) => {
    try {
      await updateDoc(doc(db, "handovers", handoverId), {
        days: updatedDays,
        updatedAt: new Date().toISOString(),
      });
      setHandover((prev: any) => ({ ...prev, days: updatedDays }));

      if (handover.status !== "Draft" && actionText) {
        const userRemark = prompt(`Audit Log: Please enter a brief remark for this change (${actionText}):`) || "Scope adjustment";
        await logModification(actionText, userRemark);
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save changes.");
    }
  };

  const getAllTaggableItems = () => {
    const list: string[] = [];
    handover?.days?.forEach((day: any) => {
      day.events?.forEach((ev: any) => {
        ev.decorComponents?.forEach((dc: any) => {
          list.push(`${day.dayName} > ${ev.eventName} > [Decor: ${dc.name}]`);
        });
        ev.entertainmentElements?.forEach((ee: any) => {
          list.push(`${day.dayName} > ${ev.eventName} > [SFX: ${ee.name}]`);
        });
      });
    });
    return list;
  };

  // Add Day
  const handleAddDay = async () => {
    const updatedDays = [...(handover.days || [])];
    updatedDays.push({ dayName: newDayName, events: [] });
    await updateHandoverDaysInDb(updatedDays, `Added ${newDayName}`);
    setSelectedDayIndex(updatedDays.length - 1);
  };

  const handleDeleteDay = async (dayIndex: number) => {
    const dayName = handover.days[dayIndex].dayName;
    if (!window.confirm(`Delete "${dayName}" and all its events?`)) return;
    const updatedDays = handover.days.filter((_: any, idx: number) => idx !== dayIndex);
    await updateHandoverDaysInDb(updatedDays, `Deleted ${dayName}`);
    setSelectedDayIndex(0);
    setSelectedEventIndex(0);
  };

  // Add Event
  const handleAddEvent = async () => {
    const finalEventName = isCustomEventName ? customEventInput.trim() : newEventName;
    if (!finalEventName) return;

    const updatedDays = [...handover.days];
    const targetDay = updatedDays[selectedDayIndex];

    targetDay.events.push({
      eventName: finalEventName,
      locationInResort: newEventLocation.trim(),
      setupReadyTime: newEventReadyTime.trim(),
      colorThemes: [],
      decorComponents: [],
      entertainmentElements: [],
    });

    await updateHandoverDaysInDb(updatedDays, `Added Event ${finalEventName} in ${targetDay.dayName}`);
    setSelectedEventIndex(targetDay.events.length - 1);
    setNewEventLocation("");
    setNewEventReadyTime("");
    setIsCustomEventName(false);
    setCustomEventInput("");
  };

  const handleDeleteEvent = async (eventIndex: number) => {
    const eventName = handover.days[selectedDayIndex].events[eventIndex].eventName;
    if (!window.confirm(`Delete "${eventName}"?`)) return;
    const updatedDays = [...handover.days];
    updatedDays[selectedDayIndex].events.splice(eventIndex, 1);
    await updateHandoverDaysInDb(updatedDays, `Deleted Event ${eventName}`);
    setSelectedEventIndex(0);
  };

  // Colors
  const handleAddColorTheme = async () => {
    const updatedDays = [...handover.days];
    const currentEvent = updatedDays[selectedDayIndex]?.events[selectedEventIndex];
    if (!currentEvent) return;
    if (!currentEvent.colorThemes) currentEvent.colorThemes = [];
    currentEvent.colorThemes.push({ hex: colorHex, role: colorRole });
    await updateHandoverDaysInDb(updatedDays);
  };

  const handleDeleteColorTheme = async (idx: number) => {
    const updatedDays = [...handover.days];
    updatedDays[selectedDayIndex].events[selectedEventIndex].colorThemes.splice(idx, 1);
    await updateHandoverDaysInDb(updatedDays);
  };

  // Audio Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setCompAudioFile(blob);
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone permission denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Attach Chosen Decor Component to Event Scope
  const handleAddDecorComponent = async () => {
    if (!currentSelectedComponent) {
      alert("Please choose a component first using the visual picker.");
      return;
    }

    let audioUrl = "";
    if (compAudioFile) {
      const aRef = ref(storage, `handover_notes/${Date.now()}_audio.webm`);
      await uploadBytes(aRef, compAudioFile);
      audioUrl = await getDownloadURL(aRef);
    }

    const updatedDays = [...handover.days];
    const currentEvent = updatedDays[selectedDayIndex].events[selectedEventIndex];
    if (!currentEvent.decorComponents) currentEvent.decorComponents = [];

    currentEvent.decorComponents.push({
      componentId: currentSelectedComponent.id,
      name: currentSelectedComponent.name,
      category: currentSelectedComponent.category,
      code: currentSelectedComponent.code || "COMP",
      imageUrl: currentSelectedComponent.images?.[0] || "",
      customSize: compCustomSize || `${currentSelectedComponent.dimensions?.length}x${currentSelectedComponent.dimensions?.width} ${currentSelectedComponent.dimensions?.unit}`,
      colorVariation: compColorVariation,
      placement: compPlacement,
      clientChanges: compClientChanges,
      productionRemarks: "",
      audioUrl,
    });

    await updateHandoverDaysInDb(updatedDays, `Added Component: ${currentSelectedComponent.name}`);
    setCurrentSelectedComponent(null);
    setCompCustomSize("");
    setCompColorVariation("");
    setCompPlacement("");
    setCompClientChanges("");
    setCompAudioFile(null);
  };

  const handleDeleteDecorComponent = async (compIdx: number) => {
    const compName = handover.days[selectedDayIndex].events[selectedEventIndex].decorComponents[compIdx].name;
    if (!window.confirm(`Remove "${compName}" from this event?`)) return;
    const updatedDays = [...handover.days];
    updatedDays[selectedDayIndex].events[selectedEventIndex].decorComponents.splice(compIdx, 1);
    await updateHandoverDaysInDb(updatedDays, `Removed Component: ${compName}`);
  };

  // Attach Entertainment
  const handleAddEntertainment = async () => {
    if (!selectedEntId) return;
    const master = entertainmentLibrary.find((e) => e.id === selectedEntId);
    if (!master) return;

    let variantName = "";
    let finalPrice = master.price || 0;
    let finalUnit = master.pricingUnit || "";

    if (selectedVariantId) {
      const v = master.variants?.find((item: any) => item.id === selectedVariantId);
      if (v) {
        variantName = v.name;
        finalPrice = v.price;
        finalUnit = v.pricingUnit;
      }
    }

    const updatedDays = [...handover.days];
    const currentEvent = updatedDays[selectedDayIndex].events[selectedEventIndex];
    if (!currentEvent.entertainmentElements) currentEvent.entertainmentElements = [];

    currentEvent.entertainmentElements.push({
      entertainmentId: master.id,
      name: master.name,
      category: master.category,
      variantName,
      price: finalPrice,
      pricingUnit: finalUnit,
      notes: entNotes,
      productionRemarks: "",
    });

    await updateHandoverDaysInDb(updatedDays, `Added Entertainment: ${master.name}`);
    setSelectedEntId("");
    setSelectedVariantId("");
    setEntNotes("");
  };

  const handleDeleteEntertainment = async (entIdx: number) => {
    const entName = handover.days[selectedDayIndex].events[selectedEventIndex].entertainmentElements[entIdx].name;
    if (!window.confirm(`Remove "${entName}"?`)) return;
    const updatedDays = [...handover.days];
    updatedDays[selectedDayIndex].events[selectedEventIndex].entertainmentElements.splice(entIdx, 1);
    await updateHandoverDaysInDb(updatedDays, `Removed Entertainment: ${entName}`);
  };

  // Production Remark Save
  const handleSaveProductionRemark = async () => {
    if (!editingRemarkItem) return;
    const updatedDays = [...handover.days];
    const event = updatedDays[selectedDayIndex].events[selectedEventIndex];

    if (editingRemarkItem.type === "decor") {
      event.decorComponents[editingRemarkItem.index].productionRemarks = remarkText.trim();
    } else {
      event.entertainmentElements[editingRemarkItem.index].productionRemarks = remarkText.trim();
    }

    await updateHandoverDaysInDb(updatedDays);
    await logModification(
      `Added Production Remark on ${editingRemarkItem.type === "decor" ? event.decorComponents[editingRemarkItem.index].name : event.entertainmentElements[editingRemarkItem.index].name}`,
      remarkText.trim()
    );
    setEditingRemarkItem(null);
    setRemarkText("");
  };

  // Submit Handover (Sales)
  const handleSubmitToBackend = async () => {
    if (!window.confirm("Submit this wedding handover to the Backend Production team?")) return;
    await updateDoc(doc(db, "handovers", handoverId), {
      status: "Submitted to Backend",
      submittedAt: new Date().toISOString(),
    });
    setHandover((prev: any) => ({ ...prev, status: "Submitted to Backend" }));

    await logModification("Handover Submitted", "Sales team completed event scope and submitted to Backend Production.");
    await addDoc(collection(db, "handovers", handoverId, "comments"), {
      author: user?.email || "Sales",
      role: role || "sales",
      message: "🚨 Handover submitted for production review. Please verify specs and raise queries if any.",
      createdAt: new Date().toISOString(),
    });
  };

  // Approve Handover (Production)
  const handleApproveHandover = async () => {
    const remark = prompt("Production Approval: Enter any final execution remarks before approving:", "All dimensions and sound specs verified. Approved for setup.") || "Approved for setup";
    await updateDoc(doc(db, "handovers", handoverId), {
      status: "Approved for Production",
      approvedAt: new Date().toISOString(),
      approvedBy: user?.email,
    });
    setHandover((prev: any) => ({ ...prev, status: "Approved for Production" }));

    await logModification("Handover Approved by Production", remark);
    await addDoc(collection(db, "handovers", handoverId, "comments"), {
      author: user?.email || "Production",
      role: role || "production",
      message: `✅ Handover APPROVED for on-site production! Remarks: ${remark}`,
      createdAt: new Date().toISOString(),
    });
  };

  // Send Comment
  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    await addDoc(collection(db, "handovers", handoverId, "comments"), {
      author: user?.email || "User",
      role: role || "sales",
      message: newComment.trim(),
      taggedItem: commentTaggedItem || null,
      createdAt: new Date().toISOString(),
    });
    setNewComment("");
    setCommentTaggedItem("");
  };

  // Distinct Component Categories for the Popup Filter
  const componentCategories = ["All", ...Array.from(new Set(componentsLibrary.map((c) => c.category).filter(Boolean)))];

  // Filtered Components for Popup Grid
  const filteredComponents = componentsLibrary.filter((c) => {
    const matchesCat = componentPickerCategory === "All" || c.category === componentPickerCategory;
    const matchesSearch = !componentPickerSearch || c.name.toLowerCase().includes(componentPickerSearch.toLowerCase()) || c.code?.toLowerCase().includes(componentPickerSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  if (!handover) return <div className="p-8 text-center text-xl font-bold">Loading Handover Workspace...</div>;

  const currentDay = handover.days?.[selectedDayIndex];
  const currentEvent = currentDay?.events?.[selectedEventIndex];
  const taggableItems = getAllTaggableItems();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-16">
      {/* Top Banner */}
      <div className="bg-white border-b-2 border-gray-300 shadow-sm sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-gray-900">{handover.title}</h1>
              <span className={`text-xs uppercase font-black px-2.5 py-1 rounded border ${
                handover.status === "Approved for Production"
                  ? "bg-green-100 text-green-900 border-green-400"
                  : handover.status === "Submitted to Backend" 
                  ? "bg-amber-100 text-amber-900 border-amber-300 animate-pulse"
                  : "bg-purple-100 text-purple-950 border-purple-300"
              }`}>
                {handover.status}
              </span>
            </div>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">
              📍 {handover.resortName} | 📅 {handover.startDate} to {handover.endDate} | 👥 {handover.paxCount} Pax | 💼 Sales: {handover.salesLead?.name} ({handover.salesLead?.phone})
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Main Tabs */}
            <div className="bg-gray-100 p-1 rounded-lg border border-gray-300 flex">
              <button
                onClick={() => setActiveTab("scope")}
                className={`px-3 py-1.5 rounded-md text-xs font-black transition ${
                  activeTab === "scope" ? "bg-white text-gray-900 shadow" : "text-gray-600"
                }`}
              >
                📋 Scope & Setup
              </button>

{/* PRESENTATION DECK & PDF EXPORT BUTTON */}
<button
  onClick={() => router.push(`/handovers/${handoverId}/presentation`)}
  className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2 rounded-lg text-xs shadow transition flex items-center gap-1.5"
>
  📑 Presentation Deck & PDF
</button>

              <button
                onClick={() => setActiveTab("discussion")}
                className={`px-3 py-1.5 rounded-md text-xs font-black transition flex items-center gap-1.5 ${
                  activeTab === "discussion" ? "bg-white text-purple-900 shadow" : "text-gray-600"
                }`}
              >
                💬 Discussion
                {comments.length > 0 && (
                  <span className="bg-purple-700 text-white text-[10px] px-1.5 rounded-full">
                    {comments.length}
                  </span>
                )}
              </button>

              {/* STRICTLY SUPER ADMIN EXCLUSIVE */}
              {isSuperAdmin && (
                <button
                  onClick={() => setActiveTab("audit")}
                  className={`px-3 py-1.5 rounded-md text-xs font-black transition flex items-center gap-1 ${
                    activeTab === "audit" ? "bg-white text-blue-900 shadow" : "text-gray-600"
                  }`}
                >
                  📜 Audit Log ({handover.auditLogs?.length || 0})
                </button>
              )}
            </div>

            {/* Workflow Buttons */}
            {isSales && handover.status === "Draft" && (
              <button
                onClick={handleSubmitToBackend}
                className="bg-purple-700 hover:bg-purple-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow transition flex items-center gap-1.5"
              >
                🚀 Submit to Backend
              </button>
            )}

            {isProductionOrAdmin && handover.status === "Submitted to Backend" && (
              <button
                onClick={handleApproveHandover}
                className="bg-green-700 hover:bg-green-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow transition flex items-center gap-1.5 animate-bounce"
              >
                ✅ Approve for Production
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-6">
        {/* VIEW 1: EVENT SCOPE */}
        {activeTab === "scope" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Days Sidebar */}
            <div className="md:col-span-4 space-y-4">
              <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-black text-sm uppercase text-gray-900">1. Wedding Days</h3>
                  <div className="flex items-center gap-1">
                    <select
                      value={newDayName}
                      onChange={(e) => setNewDayName(e.target.value)}
                      className="border p-1 rounded text-xs font-bold"
                    >
                      <option value="Day Zero">Day Zero</option>
                      <option value="Day One">Day One</option>
                      <option value="Day Two">Day Two</option>
                      <option value="Day Three">Day Three</option>
                      <option value="Day Four">Day Four</option>
                    </select>
                    <button onClick={handleAddDay} className="bg-black text-white px-2.5 py-1 rounded text-xs font-black">+ Add</button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {handover.days?.map((d: any, idx: number) => (
                    <div
                      key={idx}
                      className={`flex justify-between items-center px-3 py-2 rounded-lg border-2 transition ${
                        selectedDayIndex === idx
                          ? "bg-purple-700 text-white border-purple-800 shadow"
                          : "bg-gray-50 text-gray-800 border-gray-200"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setSelectedDayIndex(idx);
                          setSelectedEventIndex(0);
                        }}
                        className="font-black text-xs text-left flex-1"
                      >
                        {d.dayName} ({d.events?.length || 0} events)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDay(idx)}
                        className={`text-xs font-black px-1.5 py-0.5 rounded hover:bg-red-600 hover:text-white ${
                          selectedDayIndex === idx ? "text-purple-200" : "text-red-600"
                        }`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sub-Events */}
              {currentDay && (
                <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm space-y-3">
                  <div className="border-b pb-2">
                    <h3 className="font-black text-sm uppercase text-gray-900">
                      2. Events on {currentDay.dayName}
                    </h3>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg border space-y-2 text-xs">
                    <div className="space-y-1.5">
                      <select
                        value={isCustomEventName ? "custom" : newEventName}
                        onChange={(e) => {
                          if (e.target.value === "custom") setIsCustomEventName(true);
                          else {
                            setIsCustomEventName(false);
                            setNewEventName(e.target.value);
                          }
                        }}
                        className="w-full border-2 border-gray-400 p-1.5 rounded font-bold bg-white"
                      >
                        <option value="Welcome Lunch">Welcome Lunch</option>
                        <option value="Mehendi">Mehendi</option>
                        <option value="Haldi">Haldi</option>
                        <option value="Sangeet">Sangeet</option>
                        <option value="Baraat & Wedding">Baraat & Wedding</option>
                        <option value="Reception">Reception</option>
                        <option value="Pool Party">Pool Party</option>
                        <option value="custom" className="text-purple-700 font-black">+ Custom Event...</option>
                      </select>

                      {isCustomEventName && (
                        <input
                          placeholder="Type Event Name (e.g. Sufi Night, Carnival)"
                          value={customEventInput}
                          onChange={(e) => setCustomEventInput(e.target.value)}
                          className="w-full border-2 border-purple-500 p-1.5 rounded font-bold bg-white"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        placeholder="Location in resort"
                        value={newEventLocation}
                        onChange={(e) => setNewEventLocation(e.target.value)}
                        className="border p-1.5 rounded font-medium bg-white"
                      />
                      <input
                        placeholder="Setup ready by"
                        value={newEventReadyTime}
                        onChange={(e) => setNewEventReadyTime(e.target.value)}
                        className="border p-1.5 rounded font-medium bg-white"
                      />
                    </div>

                    <button
                      onClick={handleAddEvent}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-2 rounded text-xs"
                    >
                      + Add Event to {currentDay.dayName}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {currentDay.events?.map((ev: any, idx: number) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border-2 transition flex justify-between items-center ${
                          selectedEventIndex === idx
                            ? "bg-purple-50 border-purple-600"
                            : "bg-white border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div onClick={() => setSelectedEventIndex(idx)} className="cursor-pointer flex-1">
                          <p className="font-black text-sm text-gray-900">{ev.eventName}</p>
                          <p className="text-[11px] text-gray-500 font-semibold">
                            📍 {ev.locationInResort || "TBD"} | ⏰ {ev.setupReadyTime || "TBD"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(idx)}
                          className="text-red-600 hover:bg-red-50 p-1 rounded font-bold text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Event Scope Main Panel */}
            <div className="md:col-span-8">
              {currentEvent ? (
                <div className="bg-white rounded-xl border-2 border-gray-300 p-6 space-y-6 shadow-sm">
                  {/* Event Top Bar */}
                  <div className="border-b pb-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-black uppercase text-purple-700 tracking-wider">
                        {currentDay.dayName} &gt; {currentEvent.eventName}
                      </span>
                      <h2 className="text-2xl font-black text-gray-900">{currentEvent.eventName} Scope</h2>
                    </div>

                    <div className="flex bg-gray-100 p-1 rounded-lg border">
                      <button
                        onClick={() => setEventScopeTab("decor")}
                        className={`px-3 py-1.5 rounded text-xs font-black transition ${
                          eventScopeTab === "decor" ? "bg-white text-blue-700 shadow" : "text-gray-600"
                        }`}
                      >
                        🏛️ Decor Components ({currentEvent.decorComponents?.length || 0})
                      </button>
                      <button
                        onClick={() => setEventScopeTab("entertainment")}
                        className={`px-3 py-1.5 rounded text-xs font-black transition ${
                          eventScopeTab === "entertainment" ? "bg-white text-purple-700 shadow" : "text-gray-600"
                        }`}
                      >
                        🎤 Entertainment & SFX ({currentEvent.entertainmentElements?.length || 0})
                      </button>
                    </div>
                  </div>

                  {/* Color Palette */}
                  <div className="bg-amber-50/60 p-3.5 rounded-xl border-2 border-amber-200 space-y-2">
                    <p className="text-xs font-black text-amber-950 uppercase">🎨 Event Color Palette:</p>
                    <div className="flex flex-wrap gap-2">
                      {currentEvent.colorThemes?.map((ct: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-full border text-xs font-bold">
                          <span className="w-3.5 h-3.5 rounded-full border" style={{ backgroundColor: ct.hex }} />
                          <span>{ct.role}</span>
                          <button onClick={() => handleDeleteColorTheme(idx)} className="text-red-500 font-bold ml-1">✕</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="h-8 w-10 border rounded bg-white" />
                      <input placeholder="e.g. Major Drapery, Minor Accent" value={colorRole} onChange={(e) => setColorRole(e.target.value)} className="border p-1.5 rounded text-xs font-bold flex-1 bg-white" />
                      <button onClick={handleAddColorTheme} className="bg-amber-800 text-white px-3 py-1.5 rounded text-xs font-bold">+ Add Color</button>
                    </div>
                  </div>

                  {/* TAB 1: DECOR (WITH VISUAL COMPONENT PICKER) */}
                  {eventScopeTab === "decor" && (
                    <div className="space-y-6">
                      {/* Form to Attach Component */}
                      <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-300 space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="font-black text-xs uppercase text-slate-800">
                            + Add Decor Component to {currentEvent.eventName}:
                          </h4>

                          {/* BUTTON TO OPEN FULL SCREEN COMPONENT PICKER */}
                          <button
                            type="button"
                            onClick={() => {
                              setComponentPickerCategory("All");
                              setComponentPickerSearch("");
                              setShowComponentPickerModal(true);
                            }}
                            className="bg-blue-700 hover:bg-blue-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow flex items-center gap-1.5"
                          >
                            🖼️ Browse & Pick Component
                          </button>
                        </div>

                        {/* Selected Component Preview Banner */}
                        {currentSelectedComponent ? (
                          <div className="bg-white border-2 border-blue-400 p-3 rounded-xl flex items-center gap-4 shadow-sm">
                            <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden border flex-shrink-0">
                              {currentSelectedComponent.images?.[0] ? (
                                <img
                                  src={currentSelectedComponent.images[0]}
                                  alt={currentSelectedComponent.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="text-[10px] text-gray-400 text-center pt-5">No Pic</div>
                              )}
                            </div>

                            <div className="flex-1">
                              <span className="text-[10px] font-black uppercase bg-blue-100 text-blue-900 px-2 py-0.5 rounded">
                                {currentSelectedComponent.category}
                              </span>
                              <h4 className="font-bold text-gray-900 text-sm">{currentSelectedComponent.name}</h4>
                              <p className="text-xs text-gray-500 font-mono">Code: {currentSelectedComponent.code}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setShowComponentPickerModal(true)}
                              className="text-blue-700 font-bold text-xs underline"
                            >
                              Change Component
                            </button>
                          </div>
                        ) : (
                          <div className="text-center py-4 bg-white border border-dashed border-gray-300 rounded-lg">
                            <p className="text-xs font-bold text-gray-500">
                              Click "🖼️ Browse & Pick Component" above to visually choose a stage, gate, or canopy.
                            </p>
                          </div>
                        )}

                        {/* Customization Details */}
                        {currentSelectedComponent && (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-black text-gray-700 mb-1">Placement in Venue *</label>
                                <input
                                  placeholder="e.g. Center Lawn Stage, Main Gate"
                                  value={compPlacement}
                                  onChange={(e) => setCompPlacement(e.target.value)}
                                  className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-black text-gray-700 mb-1">Size Modification</label>
                                <input
                                  placeholder={`Default: ${currentSelectedComponent.dimensions?.length}x${currentSelectedComponent.dimensions?.width} ${currentSelectedComponent.dimensions?.unit}`}
                                  value={compCustomSize}
                                  onChange={(e) => setCompCustomSize(e.target.value)}
                                  className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-black text-gray-700 mb-1">Color Variation</label>
                                <input
                                  placeholder="e.g. White & Gold theme"
                                  value={compColorVariation}
                                  onChange={(e) => setCompColorVariation(e.target.value)}
                                  className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-black text-gray-700 mb-1">Client Requests & Changes</label>
                              <textarea
                                rows={2}
                                placeholder="Specific instructions requested by bride/groom..."
                                value={compClientChanges}
                                onChange={(e) => setCompClientChanges(e.target.value)}
                                className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                              />
                            </div>

                            {/* Voice Note */}
                            <div className="flex items-center gap-3 bg-purple-50 p-2 rounded-lg border border-purple-200">
                              <span className="text-xs font-black text-purple-900">🎙️ Voice Note:</span>
                              {!isRecording ? (
                                <button type="button" onClick={startRecording} className="bg-red-600 text-white font-bold px-2.5 py-1 rounded text-xs shadow">🔴 Record</button>
                              ) : (
                                <button type="button" onClick={stopRecording} className="bg-black text-white font-bold px-2.5 py-1 rounded text-xs animate-pulse">⏹️ Stop</button>
                              )}
                              {compAudioFile && <span className="text-xs text-green-700 font-bold">✅ Audio recorded</span>}
                            </div>

                            <button onClick={handleAddDecorComponent} className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2 rounded-lg text-xs shadow">
                              + Attach to Event Scope
                            </button>
                          </>
                        )}
                      </div>

                      {/* Items Cards */}
                      <div className="space-y-4">
                        {currentEvent.decorComponents?.map((item: any, idx: number) => (
                          <div key={idx} className="bg-white border-2 border-gray-300 rounded-xl p-4 space-y-3 shadow-sm">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-3">
                                {item.imageUrl && (
                                  <div className="w-14 h-14 bg-gray-100 rounded-lg overflow-hidden border flex-shrink-0">
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                  </div>
                                )}
                                <div>
                                  <span className="text-xs font-black uppercase bg-slate-100 px-2 py-0.5 rounded border">{item.category}</span>
                                  <h5 className="font-black text-lg text-gray-900 mt-0.5">{item.name}</h5>
                                  <p className="text-xs font-semibold text-purple-800">📍 Placement: {item.placement || "Venue Area"}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold bg-gray-900 text-white px-2 py-1 rounded">{item.code}</span>
                                <button onClick={() => handleDeleteDecorComponent(idx)} className="text-red-600 font-bold text-xs bg-red-50 p-1.5 rounded border border-red-200">Remove</button>
                              </div>
                            </div>

                            <div className="bg-gray-50 p-2.5 rounded-lg border text-xs font-medium space-y-1">
                              {item.customSize && <p>📐 <strong>Size:</strong> {item.customSize}</p>}
                              {item.colorVariation && <p>🎨 <strong>Color Changes:</strong> {item.colorVariation}</p>}
                              {item.clientChanges && <p className="text-amber-900">✏️ <strong>Notes:</strong> {item.clientChanges}</p>}
                            </div>

                            {/* Production Remark Box */}
                            <div className="bg-blue-50/70 border border-blue-200 p-2.5 rounded-lg">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-black text-blue-950">🛠️ Production Execution Remarks:</span>
                                <button
                                  onClick={() => {
                                    setEditingRemarkItem({ type: 'decor', index: idx, currentRemark: item.productionRemarks || "" });
                                    setRemarkText(item.productionRemarks || "");
                                  }}
                                  className="text-[11px] text-blue-700 font-bold hover:underline"
                                >
                                  {item.productionRemarks ? "Edit Remark" : "+ Add Production Remark"}
                                </button>
                              </div>
                              <p className="text-xs font-semibold text-gray-800">
                                {item.productionRemarks || <span className="text-gray-400 italic">No production remarks added yet.</span>}
                              </p>
                            </div>

                            {item.audioUrl && (
                              <audio controls src={item.audioUrl} className="w-full h-8" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: ENTERTAINMENT */}
                  {eventScopeTab === "entertainment" && (
                    <div className="space-y-6">
                      <div className="bg-purple-50/50 p-4 rounded-xl border-2 border-purple-200 space-y-3">
                        <h4 className="font-black text-xs uppercase text-purple-900">+ Attach Entertainment / SFX:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <select
                            value={selectedEntId}
                            onChange={(e) => {
                              setSelectedEntId(e.target.value);
                              setSelectedVariantId("");
                            }}
                            className="border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                          >
                            <option value="">-- Choose Sound, Anchor, SFX, Stall --</option>
                            {entertainmentLibrary.map((ent) => (
                              <option key={ent.id} value={ent.id}>[{ent.category}] {ent.name}</option>
                            ))}
                          </select>

                          {selectedEntId && (
                            <select
                              value={selectedVariantId}
                              onChange={(e) => setSelectedVariantId(e.target.value)}
                              className="border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                            >
                              <option value="">Standard Setup</option>
                              {entertainmentLibrary.find((e) => e.id === selectedEntId)?.variants?.map((v: any) => (
                                <option key={v.id} value={v.id}>{v.name} (₹{v.price} / {v.pricingUnit})</option>
                              ))}
                            </select>
                          )}
                        </div>

                        <input
                          placeholder="Execution notes (e.g. 6 cold pyros during entry)"
                          value={entNotes}
                          onChange={(e) => setEntNotes(e.target.value)}
                          className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                        />

                        <button onClick={handleAddEntertainment} className="bg-purple-700 hover:bg-purple-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow">
                          + Attach Entertainment Element
                        </button>
                      </div>

                      <div className="space-y-3">
                        {currentEvent.entertainmentElements?.map((item: any, idx: number) => (
                          <div key={idx} className="bg-white border-2 border-gray-200 p-3.5 rounded-lg space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-purple-900 text-sm">🎤 {item.name} {item.variantName && `(${item.variantName})`}</span>
                                {item.notes && <p className="text-gray-600 mt-0.5">Note: {item.notes}</p>}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-black text-blue-700">₹{item.price?.toLocaleString()} / {item.pricingUnit}</span>
                                <button onClick={() => handleDeleteEntertainment(idx)} className="text-red-600 font-bold">Remove</button>
                              </div>
                            </div>

                            <div className="bg-blue-50/70 border border-blue-200 p-2 rounded-lg">
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="text-[11px] font-black text-blue-950">🛠️ Production Execution Remarks:</span>
                                <button
                                  onClick={() => {
                                    setEditingRemarkItem({ type: 'ent', index: idx, currentRemark: item.productionRemarks || "" });
                                    setRemarkText(item.productionRemarks || "");
                                  }}
                                  className="text-[10px] text-blue-700 font-bold hover:underline"
                                >
                                  {item.productionRemarks ? "Edit Remark" : "+ Add Remark"}
                                </button>
                              </div>
                              <p className="text-xs font-semibold text-gray-800">
                                {item.productionRemarks || <span className="text-gray-400 italic">No production remarks added yet.</span>}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white p-12 text-center rounded-xl border-2 border-dashed border-gray-300">
                  <p className="text-gray-500 font-bold">Select or add a sub-event on the left to start building its scope.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: DISCUSSION TRAIL */}
        {activeTab === "discussion" && (
          <div className="bg-white rounded-xl border-2 border-gray-300 p-6 shadow-sm max-w-4xl mx-auto space-y-6">
            <div className="border-b pb-3">
              <h3 className="text-xl font-black text-gray-900">Communication & Questions Trail</h3>
              <p className="text-xs font-semibold text-gray-500">
                Production and Sales teams can clarify dimensions, sound riders, and tag specific components for context.
              </p>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto p-2">
              {comments.map((c) => (
                <div key={c.id} className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900">{c.author}</span>
                      <span className={`uppercase text-[10px] font-black px-1.5 py-0.5 rounded ${
                        c.role === "production" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                      }`}>
                        {c.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {c.taggedItem && (
                    <div className="inline-block bg-purple-100 border border-purple-300 text-purple-900 font-bold px-2 py-0.5 rounded text-[11px]">
                      📌 Referencing: {c.taggedItem}
                    </div>
                  )}

                  <p className="text-sm font-medium text-gray-800">{c.message}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendComment} className="space-y-3 border-t pt-4">
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1">
                  Tag a Component or SFX Item in this Question (Optional):
                </label>
                <select
                  value={commentTaggedItem}
                  onChange={(e) => setCommentTaggedItem(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-xs bg-white"
                >
                  <option value="">-- General Question (No specific item tagged) --</option>
                  {taggableItems.map((tag, idx) => (
                    <option key={idx} value={tag}>📌 {tag}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <input
                  required
                  placeholder="Type your message or clarification here..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="flex-1 border-2 border-gray-400 p-2.5 rounded-lg font-medium text-xs bg-white outline-none focus:border-purple-600"
                />
                <button
                  type="submit"
                  className="bg-purple-700 hover:bg-purple-800 text-white font-black px-6 py-2.5 rounded-lg text-xs shadow"
                >
                  Send Message
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 3: SUPER ADMIN EXCLUSIVE AUDIT LOG */}
        {activeTab === "audit" && isSuperAdmin && (
          <div className="bg-white rounded-xl border-2 border-gray-300 p-6 shadow-sm max-w-4xl mx-auto space-y-4">
            <div className="border-b pb-3">
              <h3 className="text-xl font-black text-gray-900">📜 Modification & Audit Trail (Admin Only)</h3>
              <p className="text-xs font-semibold text-gray-500">
                Transparent record of who made changes to this wedding handover, the exact time, and their remark.
              </p>
            </div>

            <div className="space-y-2.5">
              {handover.auditLogs?.map((log: any, idx: number) => (
                <div key={idx} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900">{log.author}</span>
                      <span className="uppercase text-[10px] font-black bg-gray-200 text-gray-700 px-1.5 py-0.2 rounded">
                        {log.role}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="font-bold text-blue-900">Action: {log.action}</p>
                  <p className="text-gray-700 bg-white p-1.5 rounded border border-gray-200">
                    <strong>Remark / Reason:</strong> {log.remark}
                  </p>
                </div>
              ))}

              {(!handover.auditLogs || handover.auditLogs.length === 0) && (
                <p className="text-center text-gray-400 py-12 text-xs italic">
                  No modifications logged yet.
                </p>
              )}
            </div>
          </div>
        )}

        {/* FULL SCREEN COMPONENT PICKER POPUP */}
        {showComponentPickerModal && (
          <div className="fixed inset-0 z-50 bg-black/85 flex flex-col p-4 md:p-6 backdrop-blur-sm">
            <div className="w-full h-full max-w-7xl mx-auto bg-white rounded-2xl flex flex-col overflow-hidden shadow-2xl border-2 border-gray-400">
              {/* Top Bar */}
              <div className="p-4 md:p-6 border-b-2 border-gray-200 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                    🏛️ Select Decor Component
                  </h2>
                  <p className="text-xs font-bold text-gray-600">
                    Click any stage, gate, canopy, or lounge setup to attach it to this event.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Category Filter */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-black text-gray-700">Category:</label>
                    <select
                      value={componentPickerCategory}
                      onChange={(e) => setComponentPickerCategory(e.target.value)}
                      className="border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                    >
                      {componentCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat === "All" ? "✨ All Categories" : cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search Bar */}
                  <input
                    placeholder="Search name or code..."
                    value={componentPickerSearch}
                    onChange={(e) => setComponentPickerSearch(e.target.value)}
                    className="border-2 border-gray-400 p-2 rounded-lg text-xs font-bold bg-white"
                  />

                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={() => setShowComponentPickerModal(false)}
                    className="bg-gray-900 hover:bg-black text-white font-black px-4 py-2 rounded-lg text-xs shadow flex items-center gap-1"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              {/* Components Visual Grid */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredComponents.map((comp) => {
                  const hasPic = comp.images && comp.images.length > 0;
                  return (
                    <div
                      key={comp.id}
                      onClick={() => {
                        setCurrentSelectedComponent(comp);
                        setShowComponentPickerModal(false);
                      }}
                      className="bg-white border-2 border-gray-300 hover:border-blue-600 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="h-44 bg-gray-100 relative overflow-hidden">
                          {hasPic ? (
                            <img
                              src={comp.images[0]}
                              alt={comp.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs font-bold text-gray-400">
                              No Photos
                            </div>
                          )}
                          <span className="absolute top-2 left-2 bg-gray-900/90 text-white text-xs font-mono font-bold px-2 py-0.5 rounded">
                            {comp.code || "COMP"}
                          </span>
                          <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-black px-2 py-0.5 rounded">
                            ₹{comp.baseCost?.toLocaleString() || "0"}
                          </span>
                        </div>

                        <div className="p-3.5 space-y-1">
                          <span className="text-[10px] font-black uppercase text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {comp.category}
                          </span>
                          <h4 className="font-black text-base text-gray-900 mt-1 leading-tight group-hover:text-blue-800">
                            {comp.name}
                          </h4>
                          {comp.dimensions?.length > 0 && (
                            <p className="text-xs text-gray-600 font-semibold">
                              📐 {comp.dimensions.length}×{comp.dimensions.width}×{comp.dimensions.height} {comp.dimensions.unit}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="p-2.5 border-t bg-gray-50">
                        <button
                          type="button"
                          className="w-full bg-blue-600 group-hover:bg-blue-700 text-white font-black py-2 rounded-lg text-xs transition shadow"
                        >
                          Select This Component ✓
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredComponents.length === 0 && (
                  <div className="col-span-full py-16 text-center text-gray-500 font-bold">
                    No components found matching this filter.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PRODUCTION REMARK MODAL */}
        {editingRemarkItem && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-md w-full p-6 border-2 border-gray-400 shadow-2xl space-y-4">
              <h3 className="text-lg font-black text-gray-900">
                Add / Update Production Execution Remark
              </h3>
              <p className="text-xs text-gray-600 font-medium">
                Add specific setup instructions or constraints for site engineers and supervisors.
              </p>

              <textarea
                rows={4}
                placeholder="e.g. Truss setup requires 6 ballast weights. Must be assembled at 10 AM before floral team arrives."
                value={remarkText}
                onChange={(e) => setRemarkText(e.target.value)}
                className="w-full border-2 border-gray-400 p-2.5 rounded-lg text-xs font-semibold bg-white"
              />

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button onClick={() => setEditingRemarkItem(null)} className="px-4 py-1.5 border font-bold rounded text-xs">
                  Cancel
                </button>
                <button onClick={handleSaveProductionRemark} className="px-4 py-1.5 bg-blue-700 text-white font-black rounded text-xs">
                  Save Remark
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}