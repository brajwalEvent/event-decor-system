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
  const { user, role, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [componentsLibrary, setComponentsLibrary] = useState<any[]>([]);
  const [entertainmentLibrary, setEntertainmentLibrary] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");

  // Tab: "scope" | "discussion"
  const [activeTab, setActiveTab] = useState<"scope" | "discussion">("scope");

  // Selected Day & Event for editing
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [selectedEventIndex, setSelectedEventIndex] = useState<number>(0);

  // Sub-Event Tab: "decor" | "entertainment"
  const [eventScopeTab, setEventScopeTab] = useState<"decor" | "entertainment">("decor");

  // Add Day State
  const [newDayName, setNewDayName] = useState("Day One");

  // Add Event State
  const [newEventName, setNewEventName] = useState("Haldi");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventReadyTime, setNewEventReadyTime] = useState("");
  const [newEventStartTime, setNewEventStartTime] = useState("");

  // Color Theme item
  const [colorHex, setColorHex] = useState("#FFD700");
  const [colorRole, setColorRole] = useState("Major Drapery");

  // Add Decor Component to Event
  const [selectedCompId, setSelectedCompId] = useState("");
  const [compCustomSize, setCompCustomSize] = useState("");
  const [compColorVariation, setCompColorVariation] = useState("");
  const [compPlacement, setCompPlacement] = useState("");
  const [compClientChanges, setCompClientChanges] = useState("");
  const [compAudioFile, setCompAudioFile] = useState<File | Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Add Entertainment to Event
  const [selectedEntId, setSelectedEntId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [entNotes, setEntNotes] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // Fetch Handover & Libraries
  const fetchHandoverAndMasterData = async () => {
    try {
      // Handover Doc
      const hSnap = await getDoc(doc(db, "handovers", handoverId));
      if (hSnap.exists()) {
        const data = hSnap.data();
        setHandover(data);
      }

      // Components
      const cSnap = await getDoc(doc(db, "metadata", "placeholder")).catch(() => null);
      const comps = await import("firebase/firestore").then(async ({ getDocs, collection }) => {
        const snap = await getDocs(collection(db, "components"));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      });
      setComponentsLibrary(comps);

      // Entertainment
      const ents = await import("firebase/firestore").then(async ({ getDocs, collection }) => {
        const snap = await getDocs(collection(db, "entertainment"));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      });
      setEntertainmentLibrary(ents);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (handoverId) fetchHandoverAndMasterData();
  }, [handoverId]);

  // Real-time comments listener
  useEffect(() => {
    if (!handoverId) return;
    const q = query(
      collection(db, "handovers", handoverId, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [handoverId]);

  // Save full handover changes to Firebase
  const updateHandoverDaysInDb = async (updatedDays: any[]) => {
    try {
      await updateDoc(doc(db, "handovers", handoverId), {
        days: updatedDays,
        updatedAt: new Date().toISOString(),
      });
      setHandover((prev: any) => ({ ...prev, days: updatedDays }));
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to update handover.");
    }
  };

  // Add Day
  const handleAddDay = async () => {
    const updatedDays = [...(handover.days || [])];
    updatedDays.push({
      dayName: newDayName,
      events: [],
    });
    await updateHandoverDaysInDb(updatedDays);
    setSelectedDayIndex(updatedDays.length - 1);
  };

  // Add Event to selected Day
  const handleAddEvent = async () => {
    if (!handover.days || handover.days.length === 0) {
      alert("Please add a Day first.");
      return;
    }
    const updatedDays = [...handover.days];
    const targetDay = updatedDays[selectedDayIndex];

    targetDay.events.push({
      eventName: newEventName,
      locationInResort: newEventLocation,
      setupReadyTime: newEventReadyTime,
      eventStartTime: newEventStartTime,
      colorThemes: [],
      decorComponents: [],
      entertainmentElements: [],
    });

    await updateHandoverDaysInDb(updatedDays);
    setSelectedEventIndex(targetDay.events.length - 1);
    setNewEventLocation("");
    setNewEventReadyTime("");
  };

  // Add Color Theme to selected Event
  const handleAddColorTheme = async () => {
    const updatedDays = [...handover.days];
    const currentEvent = updatedDays[selectedDayIndex]?.events[selectedEventIndex];
    if (!currentEvent) return;

    if (!currentEvent.colorThemes) currentEvent.colorThemes = [];
    currentEvent.colorThemes.push({
      hex: colorHex,
      role: colorRole,
    });

    await updateHandoverDaysInDb(updatedDays);
  };

  // Recording Audio
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

  // Add Decor Component to Event
  const handleAddDecorComponent = async () => {
    if (!selectedCompId) return;
    const master = componentsLibrary.find((c) => c.id === selectedCompId);
    if (!master) return;

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
      componentId: master.id,
      name: master.name,
      category: master.category,
      code: master.code || "COMP",
      baseCost: master.baseCost || 0,
      customSize: compCustomSize || `${master.dimensions?.length}x${master.dimensions?.width} ${master.dimensions?.unit}`,
      colorVariation: compColorVariation,
      placement: compPlacement,
      clientChanges: compClientChanges,
      audioUrl,
    });

    await updateHandoverDaysInDb(updatedDays);

    // Reset inputs
    setSelectedCompId("");
    setCompCustomSize("");
    setCompColorVariation("");
    setCompPlacement("");
    setCompClientChanges("");
    setCompAudioFile(null);
  };

  // Add Entertainment item to Event
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
    });

    await updateHandoverDaysInDb(updatedDays);
    setSelectedEntId("");
    setSelectedVariantId("");
    setEntNotes("");
  };

  // Submit Handover to Backend Team
  const handleSubmitToBackend = async () => {
    if (!window.confirm("Submit this wedding handover to the Backend Production team?")) return;
    await updateDoc(doc(db, "handovers", handoverId), {
      status: "Submitted to Backend",
      submittedAt: new Date().toISOString(),
    });
    setHandover((prev: any) => ({ ...prev, status: "Submitted to Backend" }));

    // Auto-post a system comment in the trail
    await addDoc(collection(db, "handovers", handoverId, "comments"), {
      author: user?.email || "Sales",
      role: role || "sales",
      message: "🚨 Handover submitted to Backend Production team for review and execution.",
      createdAt: new Date().toISOString(),
    });
  };

  // Send a comment in the trail
  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    await addDoc(collection(db, "handovers", handoverId, "comments"), {
      author: user?.email || "User",
      role: role || "production",
      message: newComment.trim(),
      createdAt: new Date().toISOString(),
    });
    setNewComment("");
  };

  if (!handover) return <div className="p-8 text-center text-xl font-bold">Loading Workspace...</div>;

  const currentDay = handover.days?.[selectedDayIndex];
  const currentEvent = currentDay?.events?.[selectedEventIndex];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-16">
      {/* Top Banner */}
      <div className="bg-white border-b-2 border-gray-300 shadow-sm sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-gray-900">{handover.title}</h1>
              <span className="text-xs uppercase font-black px-2.5 py-1 rounded border bg-purple-100 text-purple-950 border-purple-300">
                {handover.status}
              </span>
            </div>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">
              📍 {handover.resortName} | 📅 {handover.startDate} to {handover.endDate} | 👥 {handover.paxCount} Pax | 💼 Sales: {handover.salesLead?.name} ({handover.salesLead?.phone})
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab switch */}
            <div className="bg-gray-100 p-1 rounded-lg border border-gray-300 flex">
              <button
                onClick={() => setActiveTab("scope")}
                className={`px-3 py-1.5 rounded-md text-xs font-black transition ${
                  activeTab === "scope" ? "bg-white text-gray-900 shadow" : "text-gray-600"
                }`}
              >
                📋 Event Scope & Setup
              </button>
              <button
                onClick={() => setActiveTab("discussion")}
                className={`px-3 py-1.5 rounded-md text-xs font-black transition flex items-center gap-1.5 ${
                  activeTab === "discussion" ? "bg-white text-purple-900 shadow" : "text-gray-600"
                }`}
              >
                💬 Discussion Trail
                {comments.length > 0 && (
                  <span className="bg-purple-700 text-white text-[10px] px-1.5 py-0.2 rounded-full">
                    {comments.length}
                  </span>
                )}
              </button>
            </div>

            {/* Submit Button */}
            {role !== "production" && handover.status === "Draft" && (
              <button
                onClick={handleSubmitToBackend}
                className="bg-green-700 hover:bg-green-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow transition"
              >
                🚀 Submit to Backend Team
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-6">
        {/* VIEW 1: EVENT SCOPE BUILDER */}
        {activeTab === "scope" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left Sidebar: Days & Sub-Events Navigation */}
            <div className="md:col-span-4 space-y-4">
              {/* Days List */}
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
                    <button
                      onClick={handleAddDay}
                      className="bg-black text-white px-2 py-1 rounded text-xs font-black"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {/* Day Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {handover.days?.map((d: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDayIndex(idx);
                        setSelectedEventIndex(0);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        selectedDayIndex === idx
                          ? "bg-purple-700 text-white border-purple-800 shadow"
                          : "bg-gray-100 text-gray-800 border-gray-300"
                      }`}
                    >
                      {d.dayName} ({d.events?.length || 0})
                    </button>
                  ))}
                </div>
              </div>

              {/* Events under Selected Day */}
              {currentDay && (
                <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm space-y-3">
                  <div className="border-b pb-2">
                    <h3 className="font-black text-sm uppercase text-gray-900">
                      2. Events on {currentDay.dayName}
                    </h3>
                  </div>

                  {/* Add Event Form */}
                  <div className="bg-gray-50 p-3 rounded-lg border space-y-2 text-xs">
                    <p className="font-bold text-gray-700">Add Sub-Event:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={newEventName}
                        onChange={(e) => setNewEventName(e.target.value)}
                        className="border p-1.5 rounded font-bold bg-white"
                      >
                        <option value="Welcome Lunch">Welcome Lunch</option>
                        <option value="Mehendi">Mehendi</option>
                        <option value="Haldi">Haldi</option>
                        <option value="Sangeet">Sangeet</option>
                        <option value="Baraat & Wedding">Baraat & Wedding</option>
                        <option value="Reception">Reception</option>
                        <option value="After Party">After Party</option>
                        <option value="Pool Party">Pool Party</option>
                      </select>
                      <input
                        placeholder="Location in resort"
                        value={newEventLocation}
                        onChange={(e) => setNewEventLocation(e.target.value)}
                        className="border p-1.5 rounded font-medium bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        placeholder="Setup ready by (e.g. 3 PM)"
                        value={newEventReadyTime}
                        onChange={(e) => setNewEventReadyTime(e.target.value)}
                        className="border p-1.5 rounded font-medium bg-white"
                      />
                      <button
                        onClick={handleAddEvent}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded"
                      >
                        + Add Event
                      </button>
                    </div>
                  </div>

                  {/* Events List */}
                  <div className="space-y-1.5">
                    {currentDay.events?.map((ev: any, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedEventIndex(idx)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition flex justify-between items-center ${
                          selectedEventIndex === idx
                            ? "bg-purple-50 border-purple-600"
                            : "bg-white border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div>
                          <p className="font-black text-sm text-gray-900">{ev.eventName}</p>
                          <p className="text-xs text-gray-500 font-semibold">
                            📍 {ev.locationInResort || "No location set"}
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold text-purple-700">
                          {ev.decorComponents?.length || 0} Decor | {ev.entertainmentElements?.length || 0} SFX
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Main Area: Decor & Entertainment Scope for the Selected Event */}
            <div className="md:col-span-8">
              {currentEvent ? (
                <div className="bg-white rounded-xl border-2 border-gray-300 p-6 space-y-6 shadow-sm">
                  {/* Event Top Bar */}
                  <div className="border-b pb-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-black uppercase text-purple-700 tracking-wider">
                        {currentDay.dayName} &gt; {currentEvent.eventName}
                      </span>
                      <h2 className="text-2xl font-black text-gray-900">
                        {currentEvent.eventName} Scope & Specification
                      </h2>
                      <p className="text-xs font-bold text-gray-600 mt-0.5">
                        📍 Venue: <span className="text-black">{currentEvent.locationInResort || "Not specified"}</span> | ⏰ Setup Ready By:{" "}
                        <span className="text-black">{currentEvent.setupReadyTime || "TBD"}</span>
                      </p>
                    </div>

                    {/* Scope Tabs: Decor vs Entertainment */}
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

                  {/* Color Theme Selector Section */}
                  <div className="bg-amber-50/60 p-3.5 rounded-xl border-2 border-amber-200 space-y-2">
                    <p className="text-xs font-black text-amber-950 uppercase">🎨 Event Color Palette & Theme:</p>
                    
                    {/* Selected Colors Badges */}
                    <div className="flex flex-wrap gap-2">
                      {currentEvent.colorThemes?.map((ct: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-full border shadow-sm text-xs font-bold">
                          <span className="w-3.5 h-3.5 rounded-full border" style={{ backgroundColor: ct.hex }} />
                          <span>{ct.role}</span>
                        </div>
                      ))}
                    </div>

                    {/* Color Input */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="color"
                        value={colorHex}
                        onChange={(e) => setColorHex(e.target.value)}
                        className="h-8 w-10 border rounded cursor-pointer p-0.5 bg-white"
                      />
                      <input
                        placeholder="e.g. Major (70% Drapes), Minor (Florals)"
                        value={colorRole}
                        onChange={(e) => setColorRole(e.target.value)}
                        className="border p-1.5 rounded text-xs font-bold flex-1 bg-white"
                      />
                      <button
                        onClick={handleAddColorTheme}
                        className="bg-amber-800 text-white px-3 py-1.5 rounded text-xs font-bold"
                      >
                        + Add Color
                      </button>
                    </div>
                  </div>

                  {/* TAB 1: DECOR COMPONENTS */}
                  {eventScopeTab === "decor" && (
                    <div className="space-y-6">
                      {/* Form: Add Component to Scope */}
                      <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-300 space-y-3">
                        <h4 className="font-black text-xs uppercase text-slate-800">
                          + Add Decor Component to {currentEvent.eventName} Scope:
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-black text-gray-700 mb-1">Select Component *</label>
                            <select
                              value={selectedCompId}
                              onChange={(e) => setSelectedCompId(e.target.value)}
                              className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                            >
                              <option value="">-- Choose Stage, Gate, Canopy, Lounge --</option>
                              {componentsLibrary.map((c) => (
                                <option key={c.id} value={c.id}>
                                  [{c.category}] {c.name} ({c.code || "COMP"})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-black text-gray-700 mb-1">Placement / Location in Venue</label>
                            <input
                              placeholder="e.g. Lawn Stage Center, Main Arch Entrance"
                              value={compPlacement}
                              onChange={(e) => setCompPlacement(e.target.value)}
                              className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-black text-gray-700 mb-1">Size Modification (Optional)</label>
                            <input
                              placeholder="e.g. Increased to 28x16 ft"
                              value={compCustomSize}
                              onChange={(e) => setCompCustomSize(e.target.value)}
                              className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-black text-gray-700 mb-1">Color Variation / Drapery Change</label>
                            <input
                              placeholder="e.g. All White flowers + gold backdrop"
                              value={compColorVariation}
                              onChange={(e) => setCompColorVariation(e.target.value)}
                              className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-black text-gray-700 mb-1">Specific Client Changes / Written Notes</label>
                          <textarea
                            rows={2}
                            placeholder="e.g. Bride requested extra hanging bells from the top arch. Extra lights required on stage left."
                            value={compClientChanges}
                            onChange={(e) => setCompClientChanges(e.target.value)}
                            className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                          />
                        </div>

                        {/* Audio Note for this component */}
                        <div className="flex items-center gap-3 bg-purple-50 p-2.5 rounded-lg border border-purple-200">
                          <span className="text-xs font-black text-purple-900">🎙️ Audio Note:</span>
                          {!isRecording ? (
                            <button
                              type="button"
                              onClick={startRecording}
                              className="bg-red-600 text-white font-bold px-2.5 py-1 rounded text-xs"
                            >
                              🔴 Record
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={stopRecording}
                              className="bg-black text-white font-bold px-2.5 py-1 rounded text-xs animate-pulse"
                            >
                              ⏹️ Stop
                            </button>
                          )}
                          {compAudioFile && <span className="text-xs text-green-700 font-bold">✅ Audio attached</span>}
                        </div>

                        <button
                          type="button"
                          onClick={handleAddDecorComponent}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2 rounded-lg text-xs shadow"
                        >
                          + Add Component to Handover
                        </button>
                      </div>

                      {/* Attached Decor Components List */}
                      <div className="space-y-3">
                        <h4 className="font-black text-sm text-gray-900">
                          Confirmed Decor Items for {currentEvent.eventName} ({currentEvent.decorComponents?.length || 0}):
                        </h4>

                        {currentEvent.decorComponents?.map((item: any, idx: number) => (
                          <div key={idx} className="bg-white border-2 border-gray-300 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-xs font-black uppercase bg-slate-100 px-2 py-0.5 rounded border">
                                  {item.category}
                                </span>
                                <h5 className="font-black text-lg text-gray-900 mt-1">{item.name}</h5>
                                <p className="text-xs font-semibold text-purple-800">
                                  📍 Placement: {item.placement || "Venue Area"}
                                </p>
                              </div>
                              <span className="text-xs font-mono font-bold bg-gray-900 text-white px-2 py-1 rounded">
                                {item.code}
                              </span>
                            </div>

                            <div className="bg-gray-50 p-2.5 rounded-lg border text-xs font-medium space-y-1">
                              {item.customSize && <p>📐 <strong>Size:</strong> {item.customSize}</p>}
                              {item.colorVariation && <p>🎨 <strong>Color Changes:</strong> {item.colorVariation}</p>}
                              {item.clientChanges && <p className="text-amber-900">✏️ <strong>Notes:</strong> {item.clientChanges}</p>}
                            </div>

                            {item.audioUrl && (
                              <div className="pt-1">
                                <p className="text-xs font-black text-purple-900 mb-1">🎙️ Audio Note:</p>
                                <audio controls src={item.audioUrl} className="w-full h-8" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: ENTERTAINMENT & SFX */}
                  {eventScopeTab === "entertainment" && (
                    <div className="space-y-6">
                      {/* Form: Add Entertainment to Scope */}
                      <div className="bg-purple-50/50 p-4 rounded-xl border-2 border-purple-200 space-y-3">
                        <h4 className="font-black text-xs uppercase text-purple-900">
                          + Add Audio / SFX / Entertainment to {currentEvent.eventName}:
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-black text-gray-700 mb-1">Select Item *</label>
                            <select
                              value={selectedEntId}
                              onChange={(e) => {
                                setSelectedEntId(e.target.value);
                                setSelectedVariantId("");
                              }}
                              className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                            >
                              <option value="">-- Choose Sound, Anchor, SFX, Live Stall --</option>
                              {entertainmentLibrary.map((ent) => (
                                <option key={ent.id} value={ent.id}>
                                  [{ent.category}] {ent.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Variant Selector (if item has variants) */}
                          {selectedEntId && (
                            <div>
                              <label className="block text-xs font-black text-gray-700 mb-1">Select Brand / Variant</label>
                              <select
                                value={selectedVariantId}
                                onChange={(e) => setSelectedVariantId(e.target.value)}
                                className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                              >
                                <option value="">Standard Setup</option>
                                {entertainmentLibrary
                                  .find((e) => e.id === selectedEntId)
                                  ?.variants?.map((v: any) => (
                                    <option key={v.id} value={v.id}>
                                      {v.name} (₹{v.price} / {v.pricingUnit})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-black text-gray-700 mb-1">Execution Notes</label>
                          <input
                            placeholder="e.g. Fire 6 cold pyros during couple entry; line array mounted at 45 deg"
                            value={entNotes}
                            onChange={(e) => setEntNotes(e.target.value)}
                            className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleAddEntertainment}
                          className="bg-purple-700 hover:bg-purple-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow"
                        >
                          + Attach Entertainment Element
                        </button>
                      </div>

                      {/* Attached Entertainment List */}
                      <div className="space-y-2">
                        {currentEvent.entertainmentElements?.map((item: any, idx: number) => (
                          <div key={idx} className="bg-white border-2 border-gray-200 p-3 rounded-lg flex justify-between items-center text-xs">
                            <div>
                              <span className="font-bold text-purple-900 text-sm">
                                🎤 {item.name} {item.variantName && `(${item.variantName})`}
                              </span>
                              {item.notes && <p className="text-gray-600 mt-0.5">Note: {item.notes}</p>}
                            </div>
                            <span className="font-black text-blue-700">
                              ₹{item.price?.toLocaleString()} / {item.pricingUnit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white p-12 text-center rounded-xl border-2 border-dashed border-gray-300">
                  <p className="text-gray-500 font-bold">Select or create a sub-event on the left to start building its scope.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: REAL-TIME DISCUSSION & QUESTIONS TRAIL */}
        {activeTab === "discussion" && (
          <div className="bg-white rounded-xl border-2 border-gray-300 p-6 shadow-sm max-w-4xl mx-auto space-y-6">
            <div className="border-b pb-3">
              <h3 className="text-xl font-black text-gray-900">Communication & Questions Trail</h3>
              <p className="text-xs font-semibold text-gray-500">
                Backend team and Sales team can ask questions, clarify sizes, and confirm production details here.
              </p>
            </div>

            {/* Comments Stream */}
            <div className="space-y-4 max-h-[500px] overflow-y-auto p-2">
              {comments.map((c) => (
                <div key={c.id} className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900">{c.author}</span>
                      <span className="uppercase text-[10px] font-black bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                        {c.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-800">{c.message}</p>
                </div>
              ))}

              {comments.length === 0 && (
                <p className="text-center text-gray-400 text-xs py-8">No comments yet. Start the discussion below.</p>
              )}
            </div>

            {/* Comment Form */}
            <form onSubmit={handleSendComment} className="flex gap-2 border-t pt-4">
              <input
                required
                placeholder="Type your question or production note here..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white outline-none focus:border-purple-600"
              />
              <button
                type="submit"
                className="bg-purple-700 hover:bg-purple-800 text-white font-black px-5 py-2 rounded-lg text-xs shadow"
              >
                Send Message
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}