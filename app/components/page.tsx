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

  // FULL SCREEN ELEMENT PICKER MODAL STATES
  const [showElementPickerModal, setShowElementPickerModal] = useState(false);
  const [elementPickerCategory, setElementPickerCategory] = useState("All");
  const [elementPickerSearch, setElementPickerSearch] = useState("");

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
  const [code, setCode] = useState("");
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
    { elementId: string; elementName: string; elementCategory?: string; elementSku?: string; imageUrl?: string; quantity: number; notes: string }[]
  >([]);
  const [currentSelectedElement, setCurrentSelectedElement] = useState<any | null>(null);
  const [currentElemQty, setCurrentElemQty] = useState(1);
  const [currentElemNotes, setCurrentElemNotes] = useState("");

  // 2. Fresh Purchases
  const [freshPurchases, setFreshPurchases] = useState<
    { item: string; qtyDescription: string; estimatedCost: number }[]
  >([]);
  const [freshItemName, setFreshItemName] = useState("");
  const [freshItemQty, setFreshItemQty] = useState("");
  const [freshItemCost, setFreshItemCost] = useState<number>(0);

  // 3. Vendor Rentals
  const [vendorRentals, setVendorRentals] = useState<
    { item: string; quantity: number; size: string; vendorDetails: string; estimatedCost: number }[]
  >([]);
  const [rentalItemName, setRentalItemName] = useState("");
  const [rentalQty, setRentalQty] = useState<number>(1);
  const [rentalSize, setRentalSize] = useState("");
  const [rentalVendorDetails, setRentalVendorDetails] = useState("");
  const [rentalCost, setRentalCost] = useState<number>(0);

  // 4. Instructions
  const [writtenInstructions, setWrittenInstructions] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [stepInput, setStepInput] = useState("");

  // 5. Variations
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

  const generateComponentCode = (catName: string) => {
    const clean = catName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "CMP";
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${clean}-${random}`;
  };

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

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

  const toggleEventTag = (tag: string) => {
    if (selectedEvents.includes(tag)) {
      setSelectedEvents(selectedEvents.filter((t) => t !== tag));
    } else {
      setSelectedEvents([...selectedEvents, tag]);
    }
  };

  // Add Chosen Element to the List
  const handleAddWarehouseElement = () => {
    if (!currentSelectedElement) {
      alert("Please select a prop first using the visual picker.");
      return;
    }

    setSelectedWarehouseElements([
      ...selectedWarehouseElements,
      {
        elementId: currentSelectedElement.id,
        elementName: currentSelectedElement.name,
        elementCategory: currentSelectedElement.category,
        elementSku: currentSelectedElement.sku,
        imageUrl: currentSelectedElement.images?.[0] || currentSelectedElement.imageUrl || "",
        quantity: Number(currentElemQty) || 1,
        notes: currentElemNotes.trim(),
      },
    ]);

    setCurrentSelectedElement(null);
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

  // Add Vendor Rental
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

  const handleAddStep = () => {
    if (!stepInput.trim()) return;
    setSteps([...steps, stepInput.trim()]);
    setStepInput("");
  };

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
    setCurrentSelectedElement(null);
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

  const handleDelete = async (id: string, compName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${compName}"?`)) return;
    try {
      await deleteDoc(doc(db, "components", id));
      setComponentsList((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert("Failed to delete component.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const finalCategory = isCustomCategory ? customCategoryInput.trim() : category;

      let uploadedImageUrls: string[] = [...existingImages];
      for (const file of imageFiles) {
        const fileRef = ref(storage, `components/images/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        uploadedImageUrls.push(url);
      }

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

  // Distinct Element Categories for the Filter
  const elementCategories = ["All", ...Array.from(new Set(warehouseElements.map((e) => e.category).filter(Boolean)))];

  // Filtered Elements for Visual Grid
  const filteredElements = warehouseElements.filter((el) => {
    const matchesCat = elementPickerCategory === "All" || el.category === elementPickerCategory;
    const matchesSearch = !elementPickerSearch || el.name.toLowerCase().includes(elementPickerSearch.toLowerCase()) || el.sku?.toLowerCase().includes(elementPickerSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  if (loading) return <div className="p-8 text-center text-xl font-bold">Loading components...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Components Master Library</h1>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Assemble stages, entry gates, canopies with visual warehouse prop picker, fresh buys & rentals.
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
                <div className="h-56 bg-gray-200 relative overflow-hidden">
                  {comp.images && comp.images.length > 0 ? (
                    <img src={comp.images[0]} alt={comp.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 font-bold">
                      No Component Photos
                    </div>
                  )}

                  <span className="absolute top-2 left-2 bg-gray-900 text-white text-xs font-mono font-black px-2.5 py-1 rounded shadow">
                    {comp.code || "COMP"}
                  </span>

                  <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-black px-2.5 py-1 rounded shadow">
                    ₹{comp.baseCost?.toLocaleString() || "0"}
                  </span>
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

                  <div className="bg-gray-50 border border-gray-200 p-2.5 rounded-lg text-xs font-semibold text-gray-700 space-y-1">
                    <p>📦 <strong>Warehouse Props:</strong> {comp.warehouseElements?.length || 0} items attached</p>
                    <p>🌸 <strong>Fresh Buys:</strong> {comp.freshPurchases?.length || 0} items</p>
                    <p>🚚 <strong>Vendor Rentals:</strong> {comp.vendorRentals?.length || 0} items</p>
                  </div>
                </div>
              </div>

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
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-40">
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
                    <div>
                      <label className="block text-sm font-black text-gray-800 mb-1">Category</label>
                      <select
                        value={isCustomCategory ? "custom" : category}
                        onChange={(e) => {
                          if (e.target.value === "custom") setIsCustomCategory(true);
                          else {
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

                  {/* Dimensions */}
                  <div>
                    <label className="block text-sm font-black text-gray-800 mb-1">Overall Dimensions (L × W × H)</label>
                    <div className="grid grid-cols-4 gap-2">
                      <input placeholder="L" type="number" value={length} onChange={(e) => setLength(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg font-bold text-center" />
                      <input placeholder="W" type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg font-bold text-center" />
                      <input placeholder="H" type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg font-bold text-center" />
                      <select value={unit} onChange={(e) => setUnit(e.target.value)} className="border-2 border-gray-400 p-2.5 rounded-lg font-bold">
                        <option value="ft">ft</option>
                        <option value="inch">inch</option>
                        <option value="m">m</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Photos of the Component */}
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

                {/* 3. VISUAL WAREHOUSE PROPS PICKER */}
                <div className="space-y-3 bg-amber-50/60 p-4 rounded-xl border-2 border-amber-300">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-black text-amber-950 text-sm tracking-wide uppercase">
                        2. Assign Warehouse Elements (Visual Prop Picker)
                      </h3>
                      <p className="text-xs text-amber-800">
                        Pick props visually by browsing actual photos from your inventory.
                      </p>
                    </div>

                    {/* BUTTON TO OPEN FULL SCREEN MODAL */}
                    <button
                      type="button"
                      onClick={() => {
                        setElementPickerCategory("All");
                        setElementPickerSearch("");
                        setShowElementPickerModal(true);
                      }}
                      className="bg-amber-800 hover:bg-amber-900 text-white font-black px-4 py-2 rounded-lg text-xs shadow flex items-center gap-1.5"
                    >
                      🖼️ Browse & Pick Warehouse Props
                    </button>
                  </div>

                  {/* Selected Element Card Preview & Quantity Form */}
                  {currentSelectedElement ? (
                    <div className="bg-white border-2 border-amber-400 p-3 rounded-xl flex flex-col md:flex-row items-center gap-4 shadow-sm">
                      <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden border flex-shrink-0">
                        {currentSelectedElement.images?.[0] || currentSelectedElement.imageUrl ? (
                          <img
                            src={currentSelectedElement.images?.[0] || currentSelectedElement.imageUrl}
                            alt={currentSelectedElement.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-[10px] text-gray-400 text-center pt-5">No Pic</div>
                        )}
                      </div>

                      <div className="flex-1">
                        <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                          {currentSelectedElement.category}
                        </span>
                        <h4 className="font-bold text-gray-900 text-sm">{currentSelectedElement.name}</h4>
                        <p className="text-xs text-gray-500 font-mono">SKU: {currentSelectedElement.sku}</p>
                      </div>

                      <div className="w-24">
                        <label className="block text-[11px] font-black text-gray-700">Quantity *</label>
                        <input
                          type="number"
                          min="1"
                          value={currentElemQty}
                          onChange={(e) => setCurrentElemQty(Number(e.target.value))}
                          className="w-full border-2 border-gray-400 p-1.5 rounded text-center font-bold text-xs"
                        />
                      </div>

                      <div className="flex-1">
                        <label className="block text-[11px] font-black text-gray-700">Placement Notes</label>
                        <input
                          placeholder="e.g. 2 on stage left, 2 on stage right"
                          value={currentElemNotes}
                          onChange={(e) => setCurrentElemNotes(e.target.value)}
                          className="w-full border-2 border-gray-400 p-1.5 rounded font-medium text-xs"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleAddWarehouseElement}
                          className="bg-green-700 hover:bg-green-800 text-white font-black px-4 py-2 rounded text-xs shadow"
                        >
                          + Add Prop
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentSelectedElement(null)}
                          className="text-red-600 font-bold text-xs hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 bg-white/70 border border-dashed border-amber-300 rounded-lg">
                      <p className="text-xs font-bold text-amber-900">
                        No prop currently selected. Click the button above to visually browse and pick from warehouse items.
                      </p>
                    </div>
                  )}

                  {/* Attached Elements List */}
                  {selectedWarehouseElements.length > 0 && (
                    <div className="space-y-1.5 mt-3">
                      <p className="text-xs font-black text-gray-800 uppercase">Attached Props to this Component:</p>
                      {selectedWarehouseElements.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded-lg border text-xs shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden border flex-shrink-0">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.elementName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[9px] text-gray-400 flex items-center justify-center h-full">No Pic</span>
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-gray-900 text-sm">
                                {item.quantity}x {item.elementName}
                              </span>
                              {item.notes && <span className="text-gray-500 italic ml-2">({item.notes})</span>}
                            </div>
                          </div>
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

                {/* 4. Fresh Purchases */}
                <div className="space-y-3 bg-green-50/50 p-4 rounded-xl border-2 border-green-300">
                  <h3 className="font-black text-green-900 text-sm tracking-wide uppercase">
                    3. Fresh Purchases (Flowers, Prints, Consumables)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <input
                      placeholder="Item (e.g. Marigold Garland, Flex)"
                      value={freshItemName}
                      onChange={(e) => setFreshItemName(e.target.value)}
                      className="md:col-span-5 border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                    />
                    <input
                      placeholder="Qty/Description (e.g. 50 kg)"
                      value={freshItemQty}
                      onChange={(e) => setFreshItemQty(e.target.value)}
                      className="md:col-span-3 border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                    />
                    <input
                      type="number"
                      placeholder="Cost (₹)"
                      value={freshItemCost || ""}
                      onChange={(e) => setFreshItemCost(Number(e.target.value))}
                      className="md:col-span-2 border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddFreshItem}
                      className="md:col-span-2 bg-green-700 hover:bg-green-800 text-white font-bold p-2 rounded-lg text-xs"
                    >
                      + Add Buy
                    </button>
                  </div>

                  {freshPurchases.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {freshPurchases.map((fp, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border text-xs">
                          <span>🌸 <strong>{fp.item}</strong> - {fp.qtyDescription} (Est: ₹{fp.estimatedCost})</span>
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

                {/* 5. Vendor Rentals */}
                <div className="space-y-3 bg-indigo-50/50 p-4 rounded-xl border-2 border-indigo-300">
                  <h3 className="font-black text-indigo-900 text-sm tracking-wide uppercase">
                    4. Vendor Rentals (Trussing, LED Wall, Carpets)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <input
                      placeholder="Item Name (e.g. Heavy Truss)"
                      value={rentalItemName}
                      onChange={(e) => setRentalItemName(e.target.value)}
                      className="md:col-span-3 border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={rentalQty}
                      onChange={(e) => setRentalQty(Number(e.target.value))}
                      className="md:col-span-2 border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-center"
                    />
                    <input
                      placeholder="Size (e.g. 24x16 ft)"
                      value={rentalSize}
                      onChange={(e) => setRentalSize(e.target.value)}
                      className="md:col-span-2 border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                    />
                    <input
                      placeholder="Vendor Details"
                      value={rentalVendorDetails}
                      onChange={(e) => setRentalVendorDetails(e.target.value)}
                      className="md:col-span-3 border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                    />
                    <input
                      type="number"
                      placeholder="Cost (₹)"
                      value={rentalCost || ""}
                      onChange={(e) => setRentalCost(Number(e.target.value))}
                      className="md:col-span-2 border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddRental}
                      className="bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-4 py-2 rounded-lg text-xs shadow"
                    >
                      + Add Rental Item
                    </button>
                  </div>

                  {vendorRentals.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {vendorRentals.map((vr, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border text-xs">
                          <span>🚚 <strong>{vr.quantity}x {vr.item}</strong> {vr.size && `(${vr.size})`} | Vendor: {vr.vendorDetails} - ₹{vr.estimatedCost}</span>
                          <button
                            type="button"
                            onClick={() => setVendorRentals(vendorRentals.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. Execution Steps & Notes */}
                <div className="space-y-3">
                  <h3 className="font-black text-gray-800 text-sm tracking-wide uppercase border-b pb-1">
                    5. Execution Steps & Instructions
                  </h3>

                  <div className="flex gap-2">
                    <input
                      placeholder="e.g. Step 1: Lay carpet and level base trussing"
                      value={stepInput}
                      onChange={(e) => setStepInput(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddStep}
                      className="bg-black text-white px-4 py-2 rounded-lg font-bold text-xs"
                    >
                      + Add Step
                    </button>
                  </div>

                  {steps.length > 0 && (
                    <ol className="list-decimal list-inside space-y-1 bg-gray-50 p-3 rounded-lg border text-xs font-semibold">
                      {steps.map((st, idx) => (
                        <li key={idx} className="flex justify-between items-center">
                          <span>{st}</span>
                          <button
                            type="button"
                            onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold text-xs"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}

                  <textarea
                    rows={2}
                    placeholder="General written notes & precautions..."
                    value={writtenInstructions}
                    onChange={(e) => setWrittenInstructions(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2.5 rounded-lg text-xs font-medium"
                  />
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

        {/* FULL SCREEN POPUP: VISUAL WAREHOUSE PROPS PICKER */}
        {showElementPickerModal && (
          <div className="fixed inset-0 z-50 bg-black/85 flex flex-col p-4 md:p-6 backdrop-blur-sm">
            <div className="w-full h-full max-w-7xl mx-auto bg-white rounded-2xl flex flex-col overflow-hidden shadow-2xl border-2 border-gray-400">
              {/* Modal Top Bar */}
              <div className="p-4 md:p-6 border-b-2 border-gray-200 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                    📦 Select Warehouse Prop / Element
                  </h2>
                  <p className="text-xs font-bold text-gray-600">
                    Click any item card below to choose it for this component.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Category Dropdown Filter */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-black text-gray-700">Category:</label>
                    <select
                      value={elementPickerCategory}
                      onChange={(e) => setElementPickerCategory(e.target.value)}
                      className="border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                    >
                      {elementCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat === "All" ? "✨ All Categories" : cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search Bar */}
                  <input
                    placeholder="Search name or SKU..."
                    value={elementPickerSearch}
                    onChange={(e) => setElementPickerSearch(e.target.value)}
                    className="border-2 border-gray-400 p-2 rounded-lg text-xs font-bold bg-white"
                  />

                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={() => setShowElementPickerModal(false)}
                    className="bg-gray-900 hover:bg-black text-white font-black px-4 py-2 rounded-lg text-xs shadow flex items-center gap-1"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              {/* Elements Visual Grid */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredElements.map((el) => {
                  const hasPic = el.images?.[0] || el.imageUrl;
                  return (
                    <div
                      key={el.id}
                      onClick={() => {
                        setCurrentSelectedElement(el);
                        setShowElementPickerModal(false);
                      }}
                      className="bg-white border-2 border-gray-300 hover:border-amber-600 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="h-36 bg-gray-100 relative overflow-hidden">
                          {hasPic ? (
                            <img
                              src={hasPic}
                              alt={el.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs font-bold text-gray-400">
                              No Photo
                            </div>
                          )}
                          <span className="absolute top-1.5 right-1.5 bg-gray-900/90 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                            {el.sku || "PROP"}
                          </span>
                        </div>

                        <div className="p-3">
                          <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            {el.category}
                          </span>
                          <h4 className="font-black text-sm text-gray-900 mt-1 leading-tight group-hover:text-amber-800">
                            {el.name}
                          </h4>
                          <p className="text-[11px] text-gray-500 font-semibold mt-1">
                            📦 Stock: <strong>{el.stock?.total || 0} units</strong>
                          </p>
                          {el.dimensions?.length > 0 && (
                            <p className="text-[10px] text-gray-500">
                              📐 {el.dimensions.length}×{el.dimensions.width}×{el.dimensions.height} {el.dimensions.unit}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="p-2 border-t bg-gray-50">
                        <button
                          type="button"
                          className="w-full bg-amber-700 group-hover:bg-amber-800 text-white font-black py-1.5 rounded text-xs transition"
                        >
                          Select This Prop ✓
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredElements.length === 0 && (
                  <div className="col-span-full py-16 text-center text-gray-500 font-bold">
                    No warehouse elements found for this category or search filter.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}