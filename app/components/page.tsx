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

export default function ComponentsPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  const [componentsList, setComponentsList] = useState<any[]>([]);
  const [warehouseElements, setWarehouseElements] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Categories
  const [categories, setCategories] = useState<string[]>([
    "Stages",
    "Gates & Entrances",
    "Selfie Booths & Backdrops",
    "Canopies & Tunnels",
    "Lounge & Seating Clusters",
    "Food & Coconut Counters",
    "DJ & Console Setups"
  ]);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");

  // Base Info
  const [name, setName] = useState("");
  const [code, setCode] = useState(""); // Auto generated component code
  const [category, setCategory] = useState("Stages");
  const [baseCost, setBaseCost] = useState<number>(0);
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("ft");

  // Event Tags
  const availableEventTypes = ["Wedding", "Sangeet", "Haldi", "Reception", "Cocktail", "Mehendi", "Corporate"];
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  // 1. Warehouse Elements Assigned
  const [selectedWarehouseElements, setSelectedWarehouseElements] = useState<
    { elementId: string; elementName: string; quantity: number; notes: string }[]
  >([]);
  const [currentElemId, setCurrentElemId] = useState("");
  const [currentElemQty, setCurrentElemQty] = useState(1);
  const [currentElemNotes, setCurrentElemNotes] = useState("");

  // 2. Fresh Purchases (Consumables bought new)
  const [freshPurchases, setFreshPurchases] = useState<
    { item: string; qtyDescription: string; estimatedCost: number }[]
  >([]);
  const [freshItemName, setFreshItemName] = useState("");
  const [freshItemQty, setFreshItemQty] = useState("");
  const [freshItemCost, setFreshItemCost] = useState<number>(0);

  // 3. Vendor Rentals (Item Name, Quantity, Size, Vendor Details, Cost)
  const [vendorRentals, setVendorRentals] = useState<
    { item: string; quantity: number; size: string; vendorDetails: string; estimatedCost: number }[]
  >([]);
  const [rentalItemName, setRentalItemName] = useState("");
  const [rentalQty, setRentalQty] = useState<number>(1);
  const [rentalSize, setRentalSize] = useState("");
  const [rentalVendorDetails, setRentalVendorDetails] = useState("");
  const [rentalCost, setRentalCost] = useState<number>(0);

  // 4. Instructions & Assembly Steps
  const [writtenInstructions, setWrittenInstructions] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [stepInput, setStepInput] = useState("");

  // 5. Deviations & Variations
  const [variations, setVariations] = useState<
    { name: string; description: string; costAdjustment: number }[]
  >([]);
  const [variationName, setVariationName] = useState("");
  const [variationDesc, setVariationDesc] = useState("");
  const [variationCost, setVariationCost] = useState<number>(0);

  // 6. Media
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [audioFile, setAudioFile] = useState<File | Blob | null>(null);
  const [existingAudioUrl, setExistingAudioUrl] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // SKU / Code generator helper
  const generateComponentCode = (catName: string) => {
    const clean = catName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "CMP";
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${clean}-${random}`;
  };

  // Auth Guard
  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // Fetch Data
  const fetchData = async () => {
    try {
      const compQ = query(collection(db, "components"), orderBy("createdAt", "desc"));
      const compSnap = await getDocs(compQ);
      setComponentsList(compSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const elemQ = query(collection(db, "elements"), orderBy("name", "asc"));
      const elemSnap = await getDocs(elemQ);
      setWarehouseElements(elemSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading data:", err);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  // Event Tag Toggle
  const toggleEventTag = (tag: string) => {
    if (selectedEvents.includes(tag)) {
      setSelectedEvents(selectedEvents.filter((t) => t !== tag));
    } else {
      setSelectedEvents([...selectedEvents, tag]);
    }
  };

  // Add Warehouse Element
  const handleAddWarehouseElement = () => {
    if (!currentElemId) return;
    const found = warehouseElements.find((e) => e.id === currentElemId);
    if (!found) return;

    setSelectedWarehouseElements([
      ...selectedWarehouseElements,
      {
        elementId: currentElemId,
        elementName: found.name,
        quantity: Number(currentElemQty) || 1,
        notes: currentElemNotes.trim(),
      },
    ]);
    setCurrentElemId("");
    setCurrentElemQty(1);
    setCurrentElemNotes("");
  };

  // Add Fresh Purchase
  const handleAddFreshItem = () => {
    if (!freshItemName.trim()) return;
    setFreshPurchases([
      ...freshPurchases,
      {
        item: freshItemName.trim(),
        qtyDescription: freshItemQty.trim(),
        estimatedCost: Number(freshItemCost) || 0,
      },
    ]);
    setFreshItemName("");
    setFreshItemQty("");
    setFreshItemCost(0);
  };

  // Add Vendor Rental (With Qty, Size, Details & Cost)
  const handleAddRental = () => {
    if (!rentalItemName.trim()) return;
    setVendorRentals([
      ...vendorRentals,
      {
        item: rentalItemName.trim(),
        quantity: Number(rentalQty) || 1,
        size: rentalSize.trim(),
        vendorDetails: rentalVendorDetails.trim(),
        estimatedCost: Number(rentalCost) || 0,
      },
    ]);
    setRentalItemName("");
    setRentalQty(1);
    setRentalSize("");
    setRentalVendorDetails("");
    setRentalCost(0);
  };

  // Add Step
  const handleAddStep = () => {
    if (!stepInput.trim()) return;
    setSteps([...steps, stepInput.trim()]);
    setStepInput("");
  };

  // Add Variation
  const handleAddVariation = () => {
    if (!variationName.trim()) return;
    setVariations([
      ...variations,
      {
        name: variationName.trim(),
        description: variationDesc.trim(),
        costAdjustment: Number(variationCost) || 0,
      },
    ]);
    setVariationName("");
    setVariationDesc("");
    setVariationCost(0);
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

  // Reset form
  const resetForm = () => {
    setName("");
    setCategory("Stages");
    setCode(generateComponentCode("Stages"));
    setIsCustomCategory(false);
    setCustomCategoryInput("");
    setBaseCost(0);
    setLength("");
    setWidth("");
    setHeight("");
    setUnit("ft");
    setSelectedEvents([]);
    setSelectedWarehouseElements([]);
    setFreshPurchases([]);
    setVendorRentals([]);
    setRentalItemName("");
    setRentalQty(1);
    setRentalSize("");
    setRentalVendorDetails("");
    setRentalCost(0);
    setWrittenInstructions("");
    setSteps([]);
    setVariations([]);
    setImageFiles([]);
    setExistingImages([]);
    setAudioFile(null);
    setExistingAudioUrl("");
  };

  // Open Edit Modal
  const openEditModal = (item: any) => {
    setIsEditing(true);
    setEditId(item.id);
    setName(item.name || "");
    setCode(item.code || generateComponentCode(item.category || "Stages"));
    setCategory(item.category || "Stages");
    setIsCustomCategory(false);
    setBaseCost(item.baseCost || 0);
    setLength(item.dimensions?.length?.toString() || "");
    setWidth(item.dimensions?.width?.toString() || "");
    setHeight(item.dimensions?.height?.toString() || "");
    setUnit(item.dimensions?.unit || "ft");
    setSelectedEvents(item.events || []);
    setSelectedWarehouseElements(item.warehouseElements || []);
    setFreshPurchases(item.freshPurchases || []);

    // Load rentals with support for older records
    const mappedRentals = (item.vendorRentals || []).map((r: any) => ({
      item: r.item || "",
      quantity: r.quantity || 1,
      size: r.size || "",
      vendorDetails: r.vendorDetails || r.details || "",
      estimatedCost: r.estimatedCost || 0,
    }));
    setVendorRentals(mappedRentals);

    setWrittenInstructions(item.writtenInstructions || "");
    setSteps(item.steps || []);
    setVariations(item.variations || []);
    setExistingImages(item.images || []);
    setImageFiles([]);
    setExistingAudioUrl(item.audioUrl || "");
    setAudioFile(null);
    setShowModal(true);
  };

  // Delete Component
  const handleDelete = async (id: string, compName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${compName}"?`)) return;
    try {
      await deleteDoc(doc(db, "components", id));
      setComponentsList((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert("Failed to delete component.");
    }
  };

  // Save Component
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const finalCategory = isCustomCategory ? customCategoryInput.trim() : category;

      // Upload Images
      let uploadedImageUrls: string[] = [...existingImages];
      for (const file of imageFiles) {
        const fileRef = ref(storage, `components/images/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        uploadedImageUrls.push(url);
      }

      // Upload Voice Note
      let finalAudioUrl = existingAudioUrl;
      if (audioFile) {
        const audioRef = ref(storage, `components/audio/${Date.now()}_instructions.webm`);
        await uploadBytes(audioRef, audioFile);
        finalAudioUrl = await getDownloadURL(audioRef);
      }

      const componentData = {
        name,
        code,
        category: finalCategory,
        baseCost: Number(baseCost) || 0,
        dimensions: {
          length: Number(length) || 0,
          width: Number(width) || 0,
          height: Number(height) || 0,
          unit,
        },
        events: selectedEvents,
        warehouseElements: selectedWarehouseElements,
        freshPurchases,
        vendorRentals,
        writtenInstructions,
        steps,
        variations,
        images: uploadedImageUrls,
        audioUrl: finalAudioUrl,
        updatedAt: new Date().toISOString(),
      };

      if (isEditing && editId) {
        await updateDoc(doc(db, "components", editId), componentData);
      } else {
        await addDoc(collection(db, "components"), {
          ...componentData,
          createdAt: new Date().toISOString(),
        });
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error("Failed to save component:", err);
      alert("Error saving component.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-xl font-bold">Loading components...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Components Master Library</h1>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Assemble stages, entry gates, canopies with warehouse props, fresh buys, rentals & steps.
            </p>
          </div>
          {role !== "sales" && (
            <button
              onClick={() => {
                resetForm();
                setIsEditing(false);
                setShowModal(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-3 rounded-lg shadow transition"
            >
              + Create New Component
            </button>
          )}
        </div>

        {/* Components Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {componentsList.map((comp) => (
            <div
              key={comp.id}
              className="bg-white border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between"
            >
              <div>
                {/* Image Gallery */}
                <div className="h-56 bg-gray-200 relative overflow-hidden">
                  {comp.images && comp.images.length > 0 ? (
                    <img src={comp.images[0]} alt={comp.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 font-bold">
                      No Component Photos
                    </div>
                  )}

                  {/* Component Code Badge */}
                  <span className="absolute top-2 left-2 bg-gray-900 text-white text-xs font-mono font-black px-2.5 py-1 rounded shadow">
                    {comp.code || "COMP"}
                  </span>

                  <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-black px-2.5 py-1 rounded shadow">
                    ₹{comp.baseCost?.toLocaleString() || "0"}
                  </span>

                  {comp.images?.length > 1 && (
                    <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-0.5 rounded">
                      +{comp.images.length - 1} more photos
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-100 text-slate-800 text-xs font-black px-2.5 py-1 rounded border border-slate-300 uppercase">
                      {comp.category}
                    </span>
                    {comp.dimensions?.length > 0 && (
                      <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        📐 {comp.dimensions.length}×{comp.dimensions.width}×{comp.dimensions.height} {comp.dimensions.unit}
                      </span>
                    )}
                  </div>

                  <h3 className="font-black text-xl text-gray-900 leading-snug">{comp.name}</h3>

                  {/* Event Tags */}
                  {comp.events?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {comp.events.map((ev: string) => (
                        <span key={ev} className="text-xs bg-purple-100 text-purple-900 font-bold px-2 py-0.5 rounded">
                          {ev}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Counts Breakdown */}
                  <div className="bg-gray-50 border border-gray-200 p-2.5 rounded-lg text-xs font-semibold text-gray-700 space-y-1">
                    <p>
                      📦 <strong>Warehouse Props:</strong> {comp.warehouseElements?.length || 0} items attached
                    </p>
                    <p>
                      🌸 <strong>Fresh Buys:</strong> {comp.freshPurchases?.length || 0} items
                    </p>
                    <p>
                      🚚 <strong>Vendor Rentals:</strong> {comp.vendorRentals?.length || 0} items
                    </p>
                    <p>
                      🪜 <strong>Setup Steps:</strong> {comp.steps?.length || 0} steps recorded
                    </p>
                  </div>

                  {/* Audio Instruction */}
                  {comp.audioUrl && (
                    <div className="bg-purple-50 border border-purple-200 p-2 rounded-lg">
                      <p className="text-xs font-black text-purple-900 mb-1">🎙️ Supervisor Audio Guide:</p>
                      <audio controls src={comp.audioUrl} className="w-full h-8" />
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {role !== "sales" && (
                <div className="p-4 border-t border-gray-200 grid grid-cols-2 gap-2 bg-gray-50">
                  <button
                    onClick={() => openEditModal(comp)}
                    className="w-full bg-white border-2 border-gray-300 hover:bg-gray-100 text-gray-900 font-bold py-2 rounded text-sm transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(comp.id, comp.name)}
                    className="w-full bg-red-50 border-2 border-red-300 hover:bg-red-100 text-red-700 font-bold py-2 rounded text-sm transition"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Modal: Create or Edit Component */}
        {showModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-3xl w-full p-6 max-h-[92vh] overflow-y-auto border-2 border-gray-400 shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b-2 pb-3">
                <h2 className="text-2xl font-black text-gray-900">
                  {isEditing ? "Edit Component" : "Create New Component"}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-500 hover:text-black font-black text-xl"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                {/* 1. Basics */}
                <div className="space-y-4">
                  <h3 className="font-black text-blue-700 text-sm tracking-wide uppercase border-b pb-1">
                    1. General Information
                  </h3>

                  <div>
                    <label className="block text-sm font-black text-gray-800 mb-1">Component Name *</label>
                    <input
                      required
                      placeholder="e.g. Royal Mughal Sangeet Stage 24x16"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2.5 rounded-lg font-bold text-gray-900 outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Category */}
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
                            if (!isEditing) setCode(generateComponentCode(e.target.value));
                          }
                        }}
                        className="w-full border-2 border-gray-400 p-2.5 rounded-lg font-bold text-gray-900"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="custom" className="text-blue-700 font-black">+ Add Custom...</option>
                      </select>
                    </div>

                    {/* Auto Code */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-sm font-black text-gray-800">Code (Auto)</label>
                        <button
                          type="button"
                          onClick={() => setCode(generateComponentCode(isCustomCategory ? customCategoryInput : category))}
                          className="text-xs text-blue-700 font-bold hover:underline"
                        >
                          🔄 Re-generate
                        </button>
                      </div>
                      <input
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full border-2 border-gray-400 bg-gray-100 p-2.5 rounded-lg font-mono font-bold text-gray-900"
                      />
                    </div>

                    {/* Cost */}
                    <div>
                      <label className="block text-sm font-black text-gray-800 mb-1">Estimated Cost (₹)</label>
                      <input
                        type="number"
                        placeholder="85000"
                        value={baseCost}
                        onChange={(e) => setBaseCost(Number(e.target.value))}
                        className="w-full border-2 border-gray-400 p-2.5 rounded-lg font-bold text-gray-900"
                      />
                    </div>
                  </div>

                  {isCustomCategory && (
                    <div className="bg-blue-50 p-3 rounded-lg border-2 border-blue-300">
                      <label className="block text-sm font-black text-blue-900 mb-1">New Category Name *</label>
                      <input
                        required
                        placeholder="e.g. Photo Booths, Floral Mandaps"
                        value={customCategoryInput}
                        onChange={(e) => {
                          setCustomCategoryInput(e.target.value);
                          if (!isEditing) setCode(generateComponentCode(e.target.value));
                        }}
                        className="w-full border-2 border-blue-400 bg-white p-2 rounded font-bold text-gray-900"
                      />
                    </div>
                  )}

                  {/* Dimensions */}
                  <div>
                    <label className="block text-sm font-black text-gray-800 mb-1">Overall Dimensions (L × W × H)</label>
                    <div className="grid grid-cols-4 gap-2">
                      <input placeholder="Length" type="number" value={length} onChange={(e) => setLength(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg font-bold text-center" />
                      <input placeholder="Width" type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg font-bold text-center" />
                      <input placeholder="Height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg font-bold text-center" />
                      <select value={unit} onChange={(e) => setUnit(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg font-bold">
                        <option value="ft">ft</option>
                        <option value="inch">inch</option>
                        <option value="m">m</option>
                      </select>
                    </div>
                  </div>

                  {/* Events */}
                  <div>
                    <label className="block text-sm font-black text-gray-800 mb-1">Applicable Events (Optional)</label>
                    <div className="flex flex-wrap gap-2">
                      {availableEventTypes.map((ev) => (
                        <button
                          key={ev}
                          type="button"
                          onClick={() => toggleEventTag(ev)}
                          className={`px-3 py-1 rounded-full text-xs font-bold border ${
                            selectedEvents.includes(ev)
                              ? "bg-purple-700 text-white border-purple-700"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                          }`}
                        >
                          {selectedEvents.includes(ev) ? "✓ " : "+ "}
                          {ev}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2. Photos */}
                <div className="space-y-2 bg-slate-50 p-4 rounded-xl border-2 border-slate-300">
                  <label className="block text-sm font-black text-gray-900">
                    📸 Component Reference Photos (Select multiple)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files) setImageFiles(Array.from(e.target.files));
                    }}
                    className="block w-full text-sm border-2 border-dashed border-gray-400 rounded-lg p-2 bg-white cursor-pointer"
                  />
                  {existingImages.length > 0 && (
                    <p className="text-xs text-gray-600 font-bold">{existingImages.length} existing photo(s) saved.</p>
                  )}
                </div>

                {/* 3. Warehouse Props */}
                <div className="space-y-3 bg-amber-50/50 p-4 rounded-xl border-2 border-amber-300">
                  <h3 className="font-black text-amber-900 text-sm tracking-wide uppercase">
                    2. Assign Warehouse Elements (From Your Prop Library)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-5">
                      <select
                        value={currentElemId}
                        onChange={(e) => setCurrentElemId(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                      >
                        <option value="">-- Choose Warehouse Prop --</option>
                        {warehouseElements.map((el) => (
                          <option key={el.id} value={el.id}>
                            {el.name} ({el.category})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={currentElemQty}
                        onChange={(e) => setCurrentElemQty(Number(e.target.value))}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white text-center"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <input
                        placeholder="Placement notes..."
                        value={currentElemNotes}
                        onChange={(e) => setCurrentElemNotes(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-sm bg-white"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddWarehouseElement}
                        className="w-full bg-amber-700 hover:bg-amber-800 text-white font-bold p-2 rounded-lg text-sm"
                      >
                        + Add Prop
                      </button>
                    </div>
                  </div>

                  {selectedWarehouseElements.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {selectedWarehouseElements.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border text-sm">
                          <span>
                            <strong>{item.quantity}x</strong> {item.elementName}
                            {item.notes && <span className="text-gray-500 italic"> ({item.notes})</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedWarehouseElements(selectedWarehouseElements.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Fresh Consumables */}
                <div className="space-y-3 bg-green-50/50 p-4 rounded-xl border-2 border-green-300">
                  <h3 className="font-black text-green-900 text-sm tracking-wide uppercase">
                    3. Fresh Purchases (Flowers, Prints, Consumables)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-5">
                      <input
                        placeholder="Item (e.g. Marigold Garland, Flex Print)"
                        value={freshItemName}
                        onChange={(e) => setFreshItemName(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-sm bg-white"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <input
                        placeholder="Qty/Description (e.g. 50 kg)"
                        value={freshItemQty}
                        onChange={(e) => setFreshItemQty(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-sm bg-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <input
                        type="number"
                        placeholder="Cost (₹)"
                        value={freshItemCost || ""}
                        onChange={(e) => setFreshItemCost(Number(e.target.value))}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddFreshItem}
                        className="w-full bg-green-700 hover:bg-green-800 text-white font-bold p-2 rounded-lg text-sm"
                      >
                        + Add Buy
                      </button>
                    </div>
                  </div>

                  {freshPurchases.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {freshPurchases.map((fp, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border text-sm">
                          <span>
                            🌸 <strong>{fp.item}</strong> - {fp.qtyDescription} (Est: ₹{fp.estimatedCost})
                          </span>
                          <button
                            type="button"
                            onClick={() => setFreshPurchases(freshPurchases.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. Vendor Rentals (NEW: With Qty, Size, Vendor Details & Cost) */}
                <div className="space-y-3 bg-indigo-50/50 p-4 rounded-xl border-2 border-indigo-300">
                  <h3 className="font-black text-indigo-900 text-sm tracking-wide uppercase">
                    4. Vendor Rentals (Trussing, LED Wall, Sound, Carpets)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    {/* Item Name */}
                    <div className="md:col-span-3">
                      <label className="block text-xs font-black text-gray-700 mb-0.5">Item Name *</label>
                      <input
                        placeholder="e.g. Heavy Duty Truss"
                        value={rentalItemName}
                        onChange={(e) => setRentalItemName(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                      />
                    </div>

                    {/* Quantity */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-black text-gray-700 mb-0.5">Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={rentalQty}
                        onChange={(e) => setRentalQty(Number(e.target.value))}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-center"
                      />
                    </div>

                    {/* Size */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-black text-gray-700 mb-0.5">Size (Optional)</label>
                      <input
                        placeholder="e.g. 24x16 ft / 12 inch"
                        value={rentalSize}
                        onChange={(e) => setRentalSize(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                      />
                    </div>

                    {/* Vendor Detail */}
                    <div className="md:col-span-3">
                      <label className="block text-xs font-black text-gray-700 mb-0.5">Vendor Detail / Contact</label>
                      <input
                        placeholder="e.g. Ramesh Sound (+91 98...)"
                        value={rentalVendorDetails}
                        onChange={(e) => setRentalVendorDetails(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                      />
                    </div>

                    {/* Cost */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-black text-gray-700 mb-0.5">Cost (₹)</label>
                      <input
                        type="number"
                        placeholder="Cost"
                        value={rentalCost || ""}
                        onChange={(e) => setRentalCost(Number(e.target.value))}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                      />
                    </div>
                  </div>

                  {/* Add Button */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddRental}
                      className="bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-4 py-2 rounded-lg text-xs shadow"
                    >
                      + Add Rental Item
                    </button>
                  </div>

                  {/* Rental Items List */}
                  {vendorRentals.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {vendorRentals.map((vr, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded-lg border text-xs">
                          <div>
                            <span className="font-bold text-indigo-900 text-sm">
                              🚚 {vr.quantity}x {vr.item}
                            </span>
                            {vr.size && <span className="ml-2 text-gray-600 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">Size: {vr.size}</span>}
                            {vr.vendorDetails && <span className="ml-2 text-gray-700">| Vendor: {vr.vendorDetails}</span>}
                            <span className="ml-2 font-bold text-green-700">₹{vr.estimatedCost}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setVendorRentals(vendorRentals.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold hover:underline ml-2"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. Execution Steps & Written Notes */}
                <div className="space-y-3">
                  <h3 className="font-black text-gray-800 text-sm tracking-wide uppercase border-b pb-1">
                    5. Execution Steps & Production Instructions
                  </h3>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Step-by-step Setup Guide (Add in sequence)
                    </label>
                    <div className="flex gap-2">
                      <input
                        placeholder="e.g. Step 1: Lay carpet and level base trussing"
                        value={stepInput}
                        onChange={(e) => setStepInput(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleAddStep}
                        className="bg-black text-white px-4 py-2 rounded-lg font-bold text-sm"
                      >
                        + Add Step
                      </button>
                    </div>

                    {steps.length > 0 && (
                      <ol className="list-decimal list-inside space-y-1 mt-2 bg-gray-50 p-3 rounded-lg border text-sm font-semibold">
                        {steps.map((st, idx) => (
                          <li key={idx} className="flex justify-between items-center">
                            <span>{st}</span>
                            <button
                              type="button"
                              onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                              className="text-red-600 text-xs font-bold hover:underline ml-2"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      General Written Instructions & Precautions
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Fresh flowers must be mounted only 2 hours before event start."
                      value={writtenInstructions}
                      onChange={(e) => setWrittenInstructions(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2.5 rounded-lg text-sm font-medium"
                    />
                  </div>

                  {/* Audio Recording */}
                  <div className="bg-purple-50 p-3.5 rounded-xl border border-purple-200">
                    <label className="block text-sm font-black text-purple-950 mb-2">
                      🎙️ Audio Instructions for Production Team
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      {!isRecording ? (
                        <button
                          type="button"
                          onClick={startRecording}
                          className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow"
                        >
                          🔴 Record Audio
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="bg-gray-900 text-white font-bold px-3 py-1.5 rounded-lg text-xs animate-pulse shadow"
                        >
                          ⏹️ Stop ({recordingSeconds}s)
                        </button>
                      )}
                      <span className="text-xs font-bold text-gray-500">OR Upload audio:</span>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => setAudioFile(e.target.files ? e.target.files[0] : null)}
                        className="text-xs"
                      />
                    </div>
                    {audioFile && <p className="text-xs text-green-700 font-bold mt-1">✅ New audio ready to upload.</p>}
                  </div>
                </div>

                {/* 7. Deviations & Variations */}
                <div className="space-y-3 bg-gray-100 p-4 rounded-xl border-2 border-gray-300">
                  <h3 className="font-black text-gray-900 text-sm tracking-wide uppercase">
                    6. Allowed Modifications & Price Deviations
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-4">
                      <input
                        placeholder="Variation Name (e.g. Artificial Flower Option)"
                        value={variationName}
                        onChange={(e) => setVariationName(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <input
                        placeholder="Details (e.g. Replaces fresh lilies with silk flowers)"
                        value={variationDesc}
                        onChange={(e) => setVariationDesc(e.target.value)}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-sm bg-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <input
                        type="number"
                        placeholder="+/- Cost"
                        value={variationCost || ""}
                        onChange={(e) => setVariationCost(Number(e.target.value))}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm bg-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddVariation}
                        className="w-full bg-gray-900 hover:bg-black text-white font-bold p-2 rounded-lg text-sm"
                      >
                        + Add Variation
                      </button>
                    </div>
                  </div>

                  {variations.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {variations.map((v, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border text-sm">
                          <span>
                            🔄 <strong>{v.name}</strong> - {v.description} (Adjustment: {v.costAdjustment >= 0 ? "+" : ""}₹{v.costAdjustment})
                          </span>
                          <button
                            type="button"
                            onClick={() => setVariations(variations.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
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
                    {submitting ? "Saving Component..." : isEditing ? "Update Component" : "Save Component"}
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