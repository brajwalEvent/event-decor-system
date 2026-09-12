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

export default function ElementsPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  const [elements, setElements] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Categories
  const [categories, setCategories] = useState<string[]>([
    "Props",
    "Furniture",
    "Floral Vessels",
    "Sound / Technical",
    "Counters",
    "Structures & Trussing"
  ]);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");

  // Base Form Fields
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("Props");
  const [stockQuantity, setStockQuantity] = useState(1);
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("ft");
  const [colorModifiable, setColorModifiable] = useState(false);
  const [customizationNotes, setCustomizationNotes] = useState("");

  // Media States
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [existingVideoUrl, setExistingVideoUrl] = useState("");

  const [audioFile, setAudioFile] = useState<File | Blob | null>(null);
  const [existingAudioUrl, setExistingAudioUrl] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Protect route
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Fetch from Firebase
  const fetchElements = async () => {
    try {
      const q = query(collection(db, "elements"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setElements(items);

      const dbCategories = new Set(categories);
      items.forEach((item: any) => {
        if (item.category) dbCategories.add(item.category);
      });
      setCategories(Array.from(dbCategories));
    } catch (err) {
      console.error("Error fetching elements:", err);
    }
  };

  useEffect(() => {
    if (user) fetchElements();
  }, [user]);

  // SKU generator
  const generateSkuCode = (catName: string) => {
    const cleanCat = catName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "ELM";
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${cleanCat}-${randomNum}`;
  };

  // Reset form
  const resetForm = () => {
    setName("");
    setCategory("Props");
    setSku(generateSkuCode("Props"));
    setIsCustomCategory(false);
    setCustomCategoryInput("");
    setStockQuantity(1);
    setLength("");
    setWidth("");
    setHeight("");
    setUnit("ft");
    setColorModifiable(false);
    setCustomizationNotes("");
    setImageFiles([]);
    setExistingImages([]);
    setVideoFile(null);
    setExistingVideoUrl("");
    setAudioFile(null);
    setExistingAudioUrl("");
    setIsRecording(false);
    setRecordingSeconds(0);
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
    setSku(item.sku || generateSkuCode(item.category || "Props"));
    setCategory(item.category || "Props");
    setIsCustomCategory(false);
    setStockQuantity(item.stock?.total || 1);
    setLength(item.dimensions?.length?.toString() || "");
    setWidth(item.dimensions?.width?.toString() || "");
    setHeight(item.dimensions?.height?.toString() || "");
    setUnit(item.dimensions?.unit || "ft");
    setColorModifiable(item.customization?.colorModifiable || false);
    setCustomizationNotes(item.customization?.notes || "");
    
    // Media
    setExistingImages(item.images || (item.imageUrl ? [item.imageUrl] : []));
    setImageFiles([]);
    setExistingVideoUrl(item.videoUrl || "");
    setVideoFile(null);
    setExistingAudioUrl(item.audioUrl || "");
    setAudioFile(null);

    setShowModal(true);
  };

  const handleDelete = async (itemId: string, itemName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${itemName}"?`)) return;
    try {
      await deleteDoc(doc(db, "elements", itemId));
      setElements((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      alert("Failed to delete element.");
    }
  };

  // Video validation: max 25MB
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeBytes = 25 * 1024 * 1024; // 25 Megabytes
    if (file.size > maxSizeBytes) {
      alert("❌ Video file is too large! Maximum limit is 25MB.");
      e.target.value = "";
      setVideoFile(null);
      return;
    }
    setVideoFile(file);
  };

  // Direct Audio Recording in Browser
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioFile(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      const interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      (window as any).recordingInterval = interval;
    } catch (err) {
      alert("Microphone permission denied or not supported on this browser.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval((window as any).recordingInterval);
    }
  };

  // Form Submit
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const finalCategory = isCustomCategory ? customCategoryInput.trim() : category;
      if (isCustomCategory && finalCategory && !categories.includes(finalCategory)) {
        setCategories((prev) => [...prev, finalCategory]);
      }

      // 1. Upload Multiple Images
      let uploadedImageUrls: string[] = [...existingImages];
      for (const file of imageFiles) {
        const fileRef = ref(storage, `elements/images/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        uploadedImageUrls.push(url);
      }

      // 2. Upload Video (if selected)
      let finalVideoUrl = existingVideoUrl;
      if (videoFile) {
        const videoRef = ref(storage, `elements/videos/${Date.now()}_${videoFile.name}`);
        await uploadBytes(videoRef, videoFile);
        finalVideoUrl = await getDownloadURL(videoRef);
      }

      // 3. Upload Audio / Voice Note (if recorded or selected)
      let finalAudioUrl = existingAudioUrl;
      if (audioFile) {
        const audioRef = ref(storage, `elements/audio/${Date.now()}_voicenote.webm`);
        await uploadBytes(audioRef, audioFile);
        finalAudioUrl = await getDownloadURL(audioRef);
      }

      const elementData = {
        name,
        sku,
        category: finalCategory,
        stock: {
          total: Number(stockQuantity),
          available: Number(stockQuantity),
        },
        dimensions: {
          length: Number(length) || 0,
          width: Number(width) || 0,
          height: Number(height) || 0,
          unit,
        },
        customization: {
          colorModifiable,
          notes: customizationNotes,
        },
        images: uploadedImageUrls,
        imageUrl: uploadedImageUrls[0] || "", // fallback compatibility
        videoUrl: finalVideoUrl,
        audioUrl: finalAudioUrl,
        updatedAt: new Date().toISOString(),
      };

      if (isEditing && editId) {
        await updateDoc(doc(db, "elements", editId), elementData);
      } else {
        await addDoc(collection(db, "elements"), {
          ...elementData,
          createdAt: new Date().toISOString(),
        });
      }

      setShowModal(false);
      resetForm();
      fetchElements();
    } catch (error) {
      console.error("Error saving element:", error);
      alert("Failed to save element. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-xl font-bold text-gray-900">Loading elements...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900">Central Elements Library</h1>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              User: <span className="text-gray-900">{user?.email}</span> | Role:{" "}
              <span className="uppercase text-blue-700 font-bold bg-blue-100 px-2 py-0.5 rounded">{role}</span>
            </p>
          </div>
          {role !== "sales" && (
            <button
              onClick={openNewModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-3 rounded-lg shadow transition"
            >
              + Add New Element
            </button>
          )}
        </div>

        {/* Elements Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {elements.map((item) => {
            const allImages = item.images || (item.imageUrl ? [item.imageUrl] : []);
            return (
              <div key={item.id} className="bg-white border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between">
                <div>
                  {/* Image Gallery */}
                  <div className="h-52 bg-gray-200 relative overflow-hidden">
                    {allImages.length > 0 ? (
                      <img src={allImages[0]} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500 font-bold">No Photos</div>
                    )}
                    <span className="absolute top-2 right-2 bg-gray-900 text-white text-xs font-mono font-black px-2 py-1 rounded shadow">
                      {item.sku}
                    </span>
                    {allImages.length > 1 && (
                      <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-0.5 rounded">
                        +{allImages.length - 1} more photos
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    <span className="inline-block bg-slate-100 text-slate-800 text-xs font-black px-2.5 py-1 rounded border border-slate-300 uppercase">
                      {item.category}
                    </span>

                    <h3 className="font-black text-xl text-gray-900 leading-snug">{item.name}</h3>

                    {/* Specifications */}
                    <div className="text-sm font-semibold text-gray-800 space-y-1 bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <p>📦 <strong>Stock:</strong> {item.stock?.total || 0} units</p>
                      <p>
                        📐 <strong>Size:</strong> {item.dimensions?.length} × {item.dimensions?.width} × {item.dimensions?.height} {item.dimensions?.unit}
                      </p>
                      <p>
                        🎨 <strong>Color Change:</strong>{" "}
                        <span className={item.customization?.colorModifiable ? "text-green-700 font-bold" : "text-gray-500 font-bold"}>
                          {item.customization?.colorModifiable ? "Yes" : "No"}
                        </span>
                      </p>
                      {item.customization?.notes && (
                        <p className="text-xs text-amber-800 bg-amber-100 p-1.5 rounded mt-1">
                          <strong>Note:</strong> {item.customization.notes}
                        </p>
                      )}
                    </div>

                    {/* Voice Note Player (if exists) */}
                    {item.audioUrl && (
                      <div className="bg-purple-50 border border-purple-200 p-2.5 rounded-lg">
                        <p className="text-xs font-black text-purple-900 mb-1">🎙️ Voice Note Instructions:</p>
                        <audio controls src={item.audioUrl} className="w-full h-8" />
                      </div>
                    )}

                    {/* Short Video Walkthrough (if exists) */}
                    {item.videoUrl && (
                      <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg">
                        <p className="text-xs font-black text-blue-900 mb-1">📹 Video Walkthrough:</p>
                        <video controls src={item.videoUrl} className="w-full rounded h-36 bg-black" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Edit & Delete Buttons */}
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
            );
          })}
        </div>

        {/* Empty State */}
        {elements.length === 0 && (
          <div className="text-center py-16 bg-white border-2 border-dashed border-gray-300 rounded-xl">
            <p className="text-gray-600 font-bold text-lg">No elements created yet.</p>
            <p className="text-gray-400 text-sm mt-1">Click "+ Add New Element" to begin building your library.</p>
          </div>
        )}

        {/* Modal: Add or Edit */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto border-2 border-gray-400 shadow-2xl">
              <h2 className="text-2xl font-black text-gray-900 mb-4 border-b-2 pb-2">
                {isEditing ? "Edit Element / Prop" : "Add New Element / Prop"}
              </h2>

              <form onSubmit={handleSave} className="space-y-4">
                {/* Element Name */}
                <div>
                  <label className="block text-sm font-black text-gray-800 mb-1">Element Name *</label>
                  <input
                    required
                    placeholder="e.g. Carved Wooden Pillar Prop / Brass Vase"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-2 border-gray-400 bg-white rounded-lg p-2.5 text-gray-900 font-bold placeholder-gray-400 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {/* Category & SKU */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-black text-gray-800 mb-1">Category</label>
                    <select
                      value={isCustomCategory ? "custom" : category}
                      onChange={(e) => {
                        if (e.target.value === "custom") {
                          setIsCustomCategory(true);
                        } else {
                          setIsCustomCategory(false);
                          setCategory(e.target.value);
                          if (!isEditing) setSku(generateSkuCode(e.target.value));
                        }
                      }}
                      className="w-full border-2 border-gray-400 bg-white rounded-lg p-2.5 text-gray-900 font-bold focus:border-blue-600 focus:outline-none"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="custom" className="text-blue-700 font-black">+ Add Custom Category...</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-black text-gray-800">SKU (Auto)</label>
                      <button
                        type="button"
                        onClick={() => setSku(generateSkuCode(isCustomCategory ? customCategoryInput : category))}
                        className="text-xs text-blue-700 font-bold hover:underline"
                      >
                        🔄 Re-generate
                      </button>
                    </div>
                    <input
                      required
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="w-full border-2 border-gray-400 bg-gray-100 font-mono font-bold rounded-lg p-2.5 text-gray-900"
                    />
                  </div>
                </div>

                {/* Custom Category Field */}
                {isCustomCategory && (
                  <div className="bg-blue-50 p-3 rounded-lg border-2 border-blue-300">
                    <label className="block text-sm font-black text-blue-900 mb-1">Custom Category Name *</label>
                    <input
                      required
                      placeholder="e.g. Special SFX, Drapes, Live Counters"
                      value={customCategoryInput}
                      onChange={(e) => {
                        setCustomCategoryInput(e.target.value);
                        if (!isEditing) setSku(generateSkuCode(e.target.value));
                      }}
                      className="w-full border-2 border-blue-400 bg-white rounded-lg p-2 font-bold text-gray-900 focus:outline-none"
                    />
                  </div>
                )}

                {/* Stock Quantity */}
                <div>
                  <label className="block text-sm font-black text-gray-800 mb-1">Warehouse Stock Units *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(Number(e.target.value))}
                    className="w-full border-2 border-gray-400 bg-white rounded-lg p-2.5 text-gray-900 font-bold focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {/* Dimensions */}
                <div>
                  <label className="block text-sm font-black text-gray-800 mb-1">Dimensions (L × W × H)</label>
                  <div className="grid grid-cols-4 gap-2">
                    <input placeholder="L" type="number" value={length} onChange={(e) => setLength(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg text-gray-900 font-bold text-center" />
                    <input placeholder="W" type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg text-gray-900 font-bold text-center" />
                    <input placeholder="H" type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg text-gray-900 font-bold text-center" />
                    <select value={unit} onChange={(e) => setUnit(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg text-gray-900 font-bold">
                      <option value="ft">ft</option>
                      <option value="inch">inch</option>
                      <option value="m">m</option>
                    </select>
                  </div>
                </div>

                {/* Color Customization */}
                <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={colorModifiable}
                      onChange={(e) => setColorModifiable(e.target.checked)}
                      className="h-5 w-5 accent-blue-600 rounded"
                    />
                    <span className="text-sm font-black text-gray-900">Color can be changed / modified</span>
                  </label>
                  {colorModifiable && (
                    <input
                      placeholder="e.g. Can be spray-painted White, Gold or Silver"
                      value={customizationNotes}
                      onChange={(e) => setCustomizationNotes(e.target.value)}
                      className="mt-2 w-full border-2 border-gray-400 bg-white p-2 rounded text-gray-900 text-sm font-medium"
                    />
                  )}
                </div>

                {/* 1. Multiple Images Upload (Optional) */}
                <div className="bg-slate-50 p-3.5 rounded-xl border-2 border-slate-300">
                  <label className="block text-sm font-black text-gray-800 mb-1">
                    📸 Photos (Optional - Select multiple files)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files) {
                        setImageFiles(Array.from(e.target.files));
                      }
                    }}
                    className="block w-full text-sm text-gray-900 border-2 border-dashed border-gray-400 rounded-lg p-2 bg-white cursor-pointer font-semibold"
                  />
                  {existingImages.length > 0 && (
                    <p className="text-xs text-gray-600 font-bold mt-1">
                      {existingImages.length} existing photo(s) saved. Adding more will append to the gallery.
                    </p>
                  )}
                </div>

                {/* 2. Short Video Upload (Optional with 25MB limit) */}
                <div className="bg-slate-50 p-3.5 rounded-xl border-2 border-slate-300">
                  <label className="block text-sm font-black text-gray-800 mb-1">
                    🎥 Short Video Walkthrough (Optional - Max 25MB)
                  </label>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoSelect}
                    className="block w-full text-sm text-gray-900 border-2 border-dashed border-gray-400 rounded-lg p-2 bg-white cursor-pointer font-semibold"
                  />
                  {videoFile && (
                    <p className="text-xs text-green-700 font-bold mt-1">
                      Selected: {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </p>
                  )}
                  {existingVideoUrl && !videoFile && (
                    <p className="text-xs text-blue-700 font-bold mt-1">Has existing video saved.</p>
                  )}
                </div>

                {/* 3. Voice Note Recording or Upload (Optional) */}
                <div className="bg-slate-50 p-3.5 rounded-xl border-2 border-slate-300">
                  <label className="block text-sm font-black text-gray-800 mb-2">
                    🎙️ Voice Note / Audio Instructions (Optional)
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    {!isRecording ? (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="bg-red-600 hover:bg-red-700 text-white font-black px-4 py-2 rounded-lg text-sm flex items-center gap-2 shadow"
                      >
                        🔴 Record Voice Note
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="bg-gray-900 text-white font-black px-4 py-2 rounded-lg text-sm animate-pulse flex items-center gap-2 shadow"
                      >
                        ⏹️ Stop Recording ({recordingSeconds}s)
                      </button>
                    )}

                    <span className="text-xs font-bold text-gray-500">OR Upload audio:</span>

                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => setAudioFile(e.target.files ? e.target.files[0] : null)}
                      className="text-xs font-semibold text-gray-700"
                    />
                  </div>

                  {audioFile && (
                    <p className="text-xs text-green-700 font-bold mt-2">
                      ✅ New voice note ready to be uploaded upon saving.
                    </p>
                  )}
                  {existingAudioUrl && !audioFile && (
                    <p className="text-xs text-blue-700 font-bold mt-1">Has existing voice note saved.</p>
                  )}
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
                    {submitting ? "Uploading media & saving..." : isEditing ? "Update Element" : "Save Element"}
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