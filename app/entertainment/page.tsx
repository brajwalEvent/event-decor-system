"use client";
import React, { useState, useEffect, useRef } from "react";
import { db, storage } from "../../lib/firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";

interface Variant {
  id: string;
  name: string;
  price: number;
  pricingUnit: string;
  customUnit?: string;
  notes: string;
  travelCostAdditional: boolean;
  foodCostAdditional: boolean;
  roomsRequired: boolean;
  roomsCount: number;
  customAttributes: string[];
}

export default function EntertainmentPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Categories
  const [categories, setCategories] = useState<string[]>([
    "Sound & Audio",
    "Anchors & Emcees",
    "Special Effects & SFX",
    "Live Artists & Bands",
    "DJs & Musicians",
    "Live Counters & Stalls",
    "Entry Theme Elements"
  ]);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");

  // Base Form Fields
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Sound & Audio");
  const [price, setPrice] = useState<number>(0);
  const [pricingUnit, setPricingUnit] = useState("Per Event");
  const [customUnit, setCustomUnit] = useState("");
  const [writtenNotes, setWrittenNotes] = useState("");

  // Attributes / Riders
  const [travelCostAdditional, setTravelCostAdditional] = useState(false);
  const [foodCostAdditional, setFoodCostAdditional] = useState(false);
  const [roomsRequired, setRoomsRequired] = useState(false);
  const [roomsCount, setRoomsCount] = useState<number>(1);
  const [customAttributes, setCustomAttributes] = useState<string[]>([]);
  const [newAttributeInput, setNewAttributeInput] = useState("");

  // Variants Array
  const [variants, setVariants] = useState<Variant[]>([]);

  // Variant Add Inputs
  const [varName, setVarName] = useState("");
  const [varPrice, setVarPrice] = useState<number>(0);
  const [varUnit, setVarUnit] = useState("Per Event");
  const [varCustomUnit, setVarCustomUnit] = useState("");
  const [varNotes, setVarNotes] = useState("");
  const [varTravel, setVarTravel] = useState(false);
  const [varFood, setVarFood] = useState(false);
  const [varRooms, setVarRooms] = useState(false);
  const [varRoomsCount, setVarRoomsCount] = useState<number>(1);

  // Media
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [existingVideoUrl, setExistingVideoUrl] = useState("");

  // Audio Recording
  const [audioFile, setAudioFile] = useState<File | Blob | null>(null);
  const [existingAudioUrl, setExistingAudioUrl] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auth Guard
  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // Fetch Items from Firestore
  const fetchItems = async () => {
    try {
      const q = query(collection(db, "entertainment"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching entertainment items:", err);
    }
  };

  useEffect(() => {
    if (user) fetchItems();
  }, [user]);

  // Video size limit: 20MB
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const max20MB = 20 * 1024 * 1024;
    if (file.size > max20MB) {
      alert("❌ Video exceeds 20MB limit! Please choose a smaller clip.");
      e.target.value = "";
      setVideoFile(null);
      return;
    }
    setVideoFile(file);
  };

  // Microphone audio recording
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
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioFile(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      (window as any).recordingInterval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval((window as any).recordingInterval);
    }
  };

  // Add Custom Attribute
  const handleAddCustomAttribute = () => {
    if (!newAttributeInput.trim()) return;
    setCustomAttributes([...customAttributes, newAttributeInput.trim()]);
    setNewAttributeInput("");
  };

  // Add Variant (Carries forward options from parent/base)
  const handleAddVariant = () => {
    if (!varName.trim()) {
      alert("Please enter a variant name (e.g. JBL VRX or RCF TT+)");
      return;
    }

    const newVariant: Variant = {
      id: Date.now().toString(),
      name: varName.trim(),
      price: Number(varPrice) || price,
      pricingUnit: varUnit || pricingUnit,
      customUnit: varCustomUnit || customUnit,
      notes: varNotes.trim() || writtenNotes,
      travelCostAdditional: varTravel,
      foodCostAdditional: varFood,
      roomsRequired: varRooms,
      roomsCount: varRoomsCount,
      customAttributes: [...customAttributes],
    };

    setVariants([...variants, newVariant]);
    setVarName("");
    setVarPrice(price);
    setVarNotes("");
  };

  // When opening modal, prefill variant helper with current base values
  const initVariantFormWithBase = () => {
    setVarPrice(price);
    setVarUnit(pricingUnit);
    setVarCustomUnit(customUnit);
    setVarTravel(travelCostAdditional);
    setVarFood(foodCostAdditional);
    setVarRooms(roomsRequired);
    setVarRoomsCount(roomsCount);
  };

  // Reset form
  const resetForm = () => {
    setName("");
    setCategory("Sound & Audio");
    setIsCustomCategory(false);
    setCustomCategoryInput("");
    setPrice(0);
    setPricingUnit("Per Event");
    setCustomUnit("");
    setWrittenNotes("");
    setTravelCostAdditional(false);
    setFoodCostAdditional(false);
    setRoomsRequired(false);
    setRoomsCount(1);
    setCustomAttributes([]);
    setVariants([]);
    setImageFiles([]);
    setExistingImages([]);
    setVideoFile(null);
    setExistingVideoUrl("");
    setAudioFile(null);
    setExistingAudioUrl("");
  };

  const openNewModal = () => {
    setIsEditing(false);
    setEditId(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (item: any) => {
    setIsEditing(true);
    setEditId(item.id);
    setName(item.name || "");
    setCategory(item.category || "Sound & Audio");
    setIsCustomCategory(false);
    setPrice(item.price || 0);
    setPricingUnit(item.pricingUnit || "Per Event");
    setCustomUnit(item.customUnit || "");
    setWrittenNotes(item.writtenNotes || "");
    setTravelCostAdditional(item.attributes?.travelCostAdditional || false);
    setFoodCostAdditional(item.attributes?.foodCostAdditional || false);
    setRoomsRequired(item.attributes?.roomsRequired || false);
    setRoomsCount(item.attributes?.roomsCount || 1);
    setCustomAttributes(item.attributes?.customAttributes || []);
    setVariants(item.variants || []);
    setExistingImages(item.images || []);
    setImageFiles([]);
    setExistingVideoUrl(item.videoUrl || "");
    setVideoFile(null);
    setExistingAudioUrl(item.audioUrl || "");
    setAudioFile(null);
    setShowModal(true);
  };

  const handleDelete = async (id: string, itemName: string) => {
    if (!window.confirm(`Delete "${itemName}"?`)) return;
    try {
      await deleteDoc(doc(db, "entertainment", id));
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      alert("Failed to delete item.");
    }
  };

  // Save Item
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const finalCategory = isCustomCategory ? customCategoryInput.trim() : category;

      // Upload Images
      let uploadedImageUrls: string[] = [...existingImages];
      for (const file of imageFiles) {
        const fileRef = ref(storage, `entertainment/images/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        uploadedImageUrls.push(url);
      }

      // Upload Video
      let finalVideoUrl = existingVideoUrl;
      if (videoFile) {
        const videoRef = ref(storage, `entertainment/videos/${Date.now()}_${videoFile.name}`);
        await uploadBytes(videoRef, videoFile);
        finalVideoUrl = await getDownloadURL(videoRef);
      }

      // Upload Audio
      let finalAudioUrl = existingAudioUrl;
      if (audioFile) {
        const audioRef = ref(storage, `entertainment/audio/${Date.now()}_voice.webm`);
        await uploadBytes(audioRef, audioFile);
        finalAudioUrl = await getDownloadURL(audioRef);
      }

      const itemData = {
        name,
        category: finalCategory,
        price: Number(price) || 0,
        pricingUnit,
        customUnit,
        writtenNotes,
        attributes: {
          travelCostAdditional,
          foodCostAdditional,
          roomsRequired,
          roomsCount: Number(roomsCount) || 1,
          customAttributes,
        },
        variants,
        images: uploadedImageUrls,
        videoUrl: finalVideoUrl,
        audioUrl: finalAudioUrl,
        updatedAt: new Date().toISOString(),
      };

      if (isEditing && editId) {
        await updateDoc(doc(db, "entertainment", editId), itemData);
      } else {
        await addDoc(collection(db, "entertainment"), {
          ...itemData,
          createdAt: new Date().toISOString(),
        });
      }

      setShowModal(false);
      resetForm();
      fetchItems();
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save item.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-xl font-bold">Loading Entertainment Items...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Entertainment, Sound & SFX Library</h1>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Manage non-decor items: Audio gear, Anchors, Color bombs, SFX, Live Stalls & Artists with rider requirements.
            </p>
          </div>
          {role !== "sales" && (
            <button
              onClick={openNewModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-3 rounded-lg shadow transition"
            >
              + Add Entertainment Item
            </button>
          )}
        </div>

        {/* Grid Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between"
            >
              <div>
                {/* Image */}
                <div className="h-52 bg-gray-200 relative overflow-hidden">
                  {item.images && item.images.length > 0 ? (
                    <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 font-bold">No Photos</div>
                  )}
                  <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-black px-2.5 py-1 rounded shadow">
                    ₹{item.price?.toLocaleString()} / {item.pricingUnit === "Custom Unit" ? item.customUnit : item.pricingUnit}
                  </span>
                  {item.images?.length > 1 && (
                    <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-0.5 rounded">
                      +{item.images.length - 1} more photos
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <span className="bg-slate-100 text-slate-800 text-xs font-black px-2.5 py-1 rounded border border-slate-300 uppercase">
                    {item.category}
                  </span>

                  <h3 className="font-black text-xl text-gray-900 leading-snug">{item.name}</h3>

                  {/* Rider Badges */}
                  <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                    {item.attributes?.travelCostAdditional && (
                      <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                        ✈️ Travel Extra
                      </span>
                    )}
                    {item.attributes?.foodCostAdditional && (
                      <span className="bg-orange-100 text-orange-900 px-2 py-0.5 rounded border border-orange-300">
                        🍽️ Food Extra
                      </span>
                    )}
                    {item.attributes?.roomsRequired && (
                      <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded border border-blue-300">
                        🏨 {item.attributes?.roomsCount || 1} Room(s) Required
                      </span>
                    )}
                    {item.attributes?.customAttributes?.map((attr: string, idx: number) => (
                      <span key={idx} className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded border border-gray-300">
                        ⭐ {attr}
                      </span>
                    ))}
                  </div>

                  {/* Written Notes */}
                  {item.writtenNotes && (
                    <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded border border-gray-200">
                      <strong>Notes:</strong> {item.writtenNotes}
                    </p>
                  )}

                  {/* Variants Section */}
                  {item.variants && item.variants.length > 0 && (
                    <div className="bg-slate-50 border border-slate-300 p-2.5 rounded-lg space-y-1.5">
                      <p className="text-xs font-black text-gray-900 uppercase">
                        Available Variants / Brands ({item.variants.length}):
                      </p>
                      <div className="space-y-1">
                        {item.variants.map((v: Variant) => (
                          <div key={v.id} className="text-xs flex justify-between items-center bg-white p-1.5 rounded border">
                            <span className="font-bold text-gray-800">{v.name}</span>
                            <span className="font-black text-blue-700">
                              ₹{v.price.toLocaleString()} / {v.pricingUnit === "Custom Unit" ? v.customUnit : v.pricingUnit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Audio Instruction */}
                  {item.audioUrl && (
                    <div className="bg-purple-50 border border-purple-200 p-2 rounded-lg">
                      <p className="text-xs font-black text-purple-900 mb-1">🎙️ Audio Note:</p>
                      <audio controls src={item.audioUrl} className="w-full h-8" />
                    </div>
                  )}

                  {/* Video Walkthrough (Max 20MB) */}
                  {item.videoUrl && (
                    <div className="bg-blue-50 border border-blue-200 p-2 rounded-lg">
                      <p className="text-xs font-black text-blue-900 mb-1">📹 Video Preview:</p>
                      <video controls src={item.videoUrl} className="w-full rounded h-36 bg-black" />
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {role !== "sales" && (
                <div className="p-4 border-t border-gray-200 grid grid-cols-2 gap-2 bg-gray-50">
                  <button
                    onClick={() => openEditModal(item)}
                    className="w-full bg-white border-2 border-gray-300 hover:bg-gray-100 text-gray-900 font-bold py-2 rounded text-sm transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id, item.name)}
                    className="w-full bg-red-50 border-2 border-red-300 hover:bg-red-100 text-red-700 font-bold py-2 rounded text-sm transition"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <div className="text-center py-16 bg-white border-2 border-dashed border-gray-300 rounded-xl">
            <p className="text-gray-600 font-bold text-lg">No entertainment or SFX items created yet.</p>
            <p className="text-gray-400 text-sm mt-1">
              Click "+ Add Entertainment Item" to add sound setups, anchors, fireworks, color bombs, or live stalls.
            </p>
          </div>
        )}

        {/* Modal: Add or Edit Item */}
        {showModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-3xl w-full p-6 max-h-[92vh] overflow-y-auto border-2 border-gray-400 shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b-2 pb-3">
                <h2 className="text-2xl font-black text-gray-900">
                  {isEditing ? "Edit Entertainment / SFX Item" : "Add Entertainment / SFX Item"}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-500 hover:text-black font-black text-xl"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                {/* 1. General Details */}
                <div className="space-y-4">
                  <h3 className="font-black text-blue-700 text-sm tracking-wide uppercase border-b pb-1">
                    1. Item & Service Details
                  </h3>

                  <div>
                    <label className="block text-sm font-black text-gray-800 mb-1">
                      Item / Service Name *
                    </label>
                    <input
                      required
                      placeholder="e.g. Sound System Setup / Anchor Emcee / Color Smoke Bomb"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2.5 rounded-lg font-bold text-gray-900 outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-black text-gray-800 mb-1">Category</label>
                      <select
                        value={isCustomCategory ? "custom" : category}
                        onChange={(e) => {
                          if (e.target.value === "custom") setIsCustomCategory(true);
                          else {
                            setIsCustomCategory(false);
                            setCategory(e.target.value);
                          }
                        }}
                        className="w-full border-2 border-gray-400 p-2.5 rounded-lg font-bold text-gray-900"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="custom" className="text-blue-700 font-black">+ Add Custom Category...</option>
                      </select>
                    </div>

                    {isCustomCategory && (
                      <div>
                        <label className="block text-sm font-black text-blue-900 mb-1">New Category *</label>
                        <input
                          required
                          placeholder="e.g. Vintage Cars, Dhol Tasha"
                          value={customCategoryInput}
                          onChange={(e) => setCustomCategoryInput(e.target.value)}
                          className="w-full border-2 border-blue-400 bg-white p-2.5 rounded-lg font-bold text-gray-900"
                        />
                      </div>
                    )}
                  </div>

                  {/* Pricing & Units */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-blue-50/50 p-3.5 rounded-xl border-2 border-blue-200">
                    <div>
                      <label className="block text-xs font-black text-gray-800 mb-1">Base Price (₹) *</label>
                      <input
                        type="number"
                        min="0"
                        required
                        placeholder="25000"
                        value={price}
                        onChange={(e) => setPrice(Number(e.target.value))}
                        className="w-full border-2 border-gray-400 bg-white p-2 rounded-lg font-bold text-gray-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-gray-800 mb-1">Pricing Unit *</label>
                      <select
                        value={pricingUnit}
                        onChange={(e) => setPricingUnit(e.target.value)}
                        className="w-full border-2 border-gray-400 bg-white p-2 rounded-lg font-bold text-gray-900"
                      >
                        <option value="Per Event">Per Event</option>
                        <option value="Per Day">Per Day</option>
                        <option value="Per Pc">Per Pc</option>
                        <option value="Per Person">Per Person</option>
                        <option value="Per Wedding">Per Wedding</option>
                        <option value="Custom Unit">Custom Unit...</option>
                      </select>
                    </div>

                    {pricingUnit === "Custom Unit" && (
                      <div>
                        <label className="block text-xs font-black text-blue-900 mb-1">Specify Unit *</label>
                        <input
                          required
                          placeholder="e.g. Per 50 Shots, Per Hour"
                          value={customUnit}
                          onChange={(e) => setCustomUnit(e.target.value)}
                          className="w-full border-2 border-blue-400 bg-white p-2 rounded-lg font-bold text-gray-900"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Riders & Attributes */}
                <div className="space-y-3 bg-amber-50/50 p-4 rounded-xl border-2 border-amber-300">
                  <h3 className="font-black text-amber-900 text-sm tracking-wide uppercase">
                    2. Attributes & Rider Requirements
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={travelCostAdditional}
                        onChange={(e) => setTravelCostAdditional(e.target.checked)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span className="text-xs font-black text-gray-900">✈️ Travel Cost Extra</span>
                    </label>

                    <label className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={foodCostAdditional}
                        onChange={(e) => setFoodCostAdditional(e.target.checked)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span className="text-xs font-black text-gray-900">🍽️ Food Cost Extra</span>
                    </label>

                    <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-300">
                      <input
                        type="checkbox"
                        id="roomCheck"
                        checked={roomsRequired}
                        onChange={(e) => setRoomsRequired(e.target.checked)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <label htmlFor="roomCheck" className="text-xs font-black text-gray-900">
                        🏨 Rooms Needed:
                      </label>
                      {roomsRequired && (
                        <input
                          type="number"
                          min="1"
                          value={roomsCount}
                          onChange={(e) => setRoomsCount(Number(e.target.value))}
                          className="w-14 border rounded p-0.5 text-center font-bold text-xs"
                        />
                      )}
                    </div>
                  </div>

                  {/* Custom Attributes */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Add Custom Attribute / Technical Rider Note
                    </label>
                    <div className="flex gap-2">
                      <input
                        placeholder="e.g. Needs 32-Channel Audio Mixer, Requires green room, 3-Phase power required"
                        value={newAttributeInput}
                        onChange={(e) => setNewAttributeInput(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomAttribute}
                        className="bg-amber-800 text-white font-bold px-3 py-1 rounded-lg text-xs"
                      >
                        + Add
                      </button>
                    </div>

                    {customAttributes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {customAttributes.map((attr, idx) => (
                          <span
                            key={idx}
                            className="bg-white border text-xs font-bold px-2 py-1 rounded flex items-center gap-1"
                          >
                            ⭐ {attr}
                            <button
                              type="button"
                              onClick={() => setCustomAttributes(customAttributes.filter((_, i) => i !== idx))}
                              className="text-red-600 font-bold ml-1"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Variants (e.g. JBL vs RCF, Male vs Female) */}
                <div className="space-y-3 bg-purple-50/50 p-4 rounded-xl border-2 border-purple-300">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-black text-purple-900 text-sm tracking-wide uppercase">
                        3. Variants (e.g. JBL vs RCF, Female vs Male Anchor)
                      </h3>
                      <p className="text-xs text-purple-700">
                        Variants automatically inherit the parent item settings above.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={initVariantFormWithBase}
                      className="text-xs font-bold text-purple-800 underline"
                    >
                      Copy Parent Values
                    </button>
                  </div>

                  {/* Add Variant Form */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-white p-3 rounded-lg border">
                    <div className="md:col-span-4">
                      <label className="block text-xs font-bold text-gray-700">Variant Name *</label>
                      <input
                        placeholder="e.g. JBL VRX System (Up to 300 pax)"
                        value={varName}
                        onChange={(e) => setVarName(e.target.value)}
                        className="w-full border p-1.5 rounded font-bold text-xs"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-gray-700">Price (₹)</label>
                      <input
                        type="number"
                        placeholder="Price"
                        value={varPrice || ""}
                        onChange={(e) => setVarPrice(Number(e.target.value))}
                        className="w-full border p-1.5 rounded font-bold text-xs"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-gray-700">Unit</label>
                      <select
                        value={varUnit}
                        onChange={(e) => setVarUnit(e.target.value)}
                        className="w-full border p-1.5 rounded font-bold text-xs"
                      >
                        <option value="Per Event">Per Event</option>
                        <option value="Per Day">Per Day</option>
                        <option value="Per Pc">Per Pc</option>
                        <option value="Per Person">Per Person</option>
                        <option value="Per Wedding">Per Wedding</option>
                        <option value="Custom Unit">Custom Unit...</option>
                      </select>
                    </div>

                    <div className="md:col-span-2 flex items-end">
                      <button
                        type="button"
                        onClick={handleAddVariant}
                        className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold p-1.5 rounded text-xs"
                      >
                        + Add Variant
                      </button>
                    </div>
                  </div>

                  {/* Added Variants List */}
                  {variants.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {variants.map((v, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded border text-xs">
                          <div>
                            <span className="font-bold text-purple-950 text-sm">{v.name}</span>
                            <span className="ml-2 font-black text-blue-700">
                              ₹{v.price.toLocaleString()} / {v.pricingUnit === "Custom Unit" ? v.customUnit : v.pricingUnit}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setVariants(variants.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Written Notes */}
                <div>
                  <label className="block text-sm font-black text-gray-800 mb-1">
                    Written Instructions / Item Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Sound requires minimum 10kW power generator. Anchors require 2 wireless Shure mics."
                    value={writtenNotes}
                    onChange={(e) => setWrittenNotes(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2.5 rounded-lg text-sm font-medium"
                  />
                </div>

                {/* 5. Media (Images, 20MB Video, Audio) */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border-2 border-slate-300">
                  <h3 className="font-black text-gray-800 text-sm tracking-wide uppercase">
                    4. Media Attachments (Optional)
                  </h3>

                  {/* Photos */}
                  <div>
                    <label className="block text-xs font-black text-gray-700 mb-1">
                      📸 Photos (Select multiple)
                    </label>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files) setImageFiles(Array.from(e.target.files));
                      }}
                      className="block w-full text-xs border border-gray-400 rounded p-1.5 bg-white cursor-pointer"
                    />
                    {existingImages.length > 0 && (
                      <p className="text-xs text-gray-600 mt-1">{existingImages.length} photos saved.</p>
                    )}
                  </div>

                  {/* Video (Max 20MB) */}
                  <div>
                    <label className="block text-xs font-black text-gray-700 mb-1">
                      🎥 Short Video Demo (Max 20MB Limit)
                    </label>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleVideoSelect}
                      className="block w-full text-xs border border-gray-400 rounded p-1.5 bg-white cursor-pointer"
                    />
                    {videoFile && (
                      <p className="text-xs text-green-700 font-bold mt-1">
                        Selected: {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
                      </p>
                    )}
                  </div>

                  {/* Voice Note */}
                  <div>
                    <label className="block text-xs font-black text-gray-700 mb-1">
                      🎙️ Voice Note Instructions
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isRecording ? (
                        <button
                          type="button"
                          onClick={startRecording}
                          className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1 shadow"
                        >
                          🔴 Record Audio
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="bg-gray-900 text-white font-bold px-3 py-1.5 rounded text-xs animate-pulse shadow"
                        >
                          ⏹️ Stop ({recordingSeconds}s)
                        </button>
                      )}
                      <span className="text-xs text-gray-500 font-bold">OR</span>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => setAudioFile(e.target.files ? e.target.files[0] : null)}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t-2 border-gray-300">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 border-2 border-gray-400 text-gray-800 font-black rounded-lg hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 bg-blue-600 text-white font-black rounded-lg hover:bg-blue-700 shadow disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : isEditing ? "Update Item" : "Save Item"}
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