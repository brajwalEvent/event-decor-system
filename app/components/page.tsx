"use client";
import React, { useState, useEffect, useRef } from "react";
import { db, storage } from "../../lib/firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc, 
  setDoc, 
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
  const [naturalFlowersLibrary, setNaturalFlowersLibrary] = useState<any[]>([]);

  // 🌟 2 NEW MASTER LIBRARIES
  const [freshConsumablesLibrary, setFreshConsumablesLibrary] = useState<any[]>([]);
  const [vendorRentalsLibrary, setVendorRentalsLibrary] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // View Component Modal & Lightbox
  const [viewComponentData, setViewComponentData] = useState<any | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // 3-Way Filter States
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterTheme, setFilterTheme] = useState("All");
  const [filterEvent, setFilterEvent] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Element Picker Modal
  const [showElementPickerModal, setShowElementPickerModal] = useState(false);
  const [elementPickerCategory, setElementPickerCategory] = useState("All");
  const [elementPickerSearch, setElementPickerSearch] = useState("");
  const [currentSelectedElement, setCurrentSelectedElement] = useState<any | null>(null);
  const [currentElemQty, setCurrentElemQty] = useState(1);
  const [currentElemNotes, setCurrentElemNotes] = useState("");

  // Quick Add to Library Modals
  const [showAddConsumableModal, setShowAddConsumableModal] = useState(false);
  const [newConsumableName, setNewConsumableName] = useState("");
  const [newConsumableUnit, setNewConsumableUnit] = useState("Per Meter");
  const [newConsumableCustomUnit, setNewConsumableCustomUnit] = useState("");
  const [newConsumablePrice, setNewConsumablePrice] = useState<number | "">("");
  const [newConsumableRemarks, setNewConsumableRemarks] = useState("");

  const [showAddRentalModal, setShowAddRentalModal] = useState(false);
  const [newRentalVendor, setNewRentalVendor] = useState("");
  const [newRentalItemName, setNewRentalItemName] = useState("");
  const [newRentalSize, setNewRentalSize] = useState("");
  const [newRentalRate, setNewRentalRate] = useState<number | "">("");
  const [newRentalUnit, setNewRentalUnit] = useState("Per Pc");
  const [newRentalCustomUnit, setNewRentalCustomUnit] = useState("");
  const [newRentalIsDayApplicable, setNewRentalIsDayApplicable] = useState(false);
  const [newRentalRemarks, setNewRentalRemarks] = useState("");

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

  // Component Form Fields
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("Stages");
  const [theme, setTheme] = useState("");
  const [baseCost, setBaseCost] = useState<number>(0);
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("ft");

  // Events Selection
  const standardEventTypes = ["Haldi", "Mehendi", "Sangeet", "Wedding", "Reception", "Cocktail", "Pool Party", "After Party"];
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [customEventInput, setCustomEventInput] = useState("");

  // 1. Warehouse Elements Assigned
  const [selectedWarehouseElements, setSelectedWarehouseElements] = useState<
    { elementId: string; elementName: string; elementCategory?: string; elementSku?: string; imageUrl?: string; quantity: number; notes: string }[]
  >([]);

  // 2. Natural Flowers Assigned
  const [selectedFlowers, setSelectedFlowers] = useState<
    { flowerId: string; flowerName: string; unit: string; approxPrice: number; quantity: number; notes: string }[]
  >([]);
  const [currentFlowerId, setCurrentFlowerId] = useState("");
  const [currentFlowerQty, setCurrentFlowerQty] = useState<number>(1);
  const [currentFlowerNotes, setCurrentFlowerNotes] = useState("");

  // 3. 🌟 General Fresh Consumables (Dropdown Driven)
  const [freshPurchases, setFreshPurchases] = useState<any[]>([]);
  const [currentConsumableId, setCurrentConsumableId] = useState("");
  const [currentConsumableQty, setCurrentConsumableQty] = useState<number>(1);
  const [currentConsumableNotes, setCurrentConsumableNotes] = useState("");

  // 4. 🌟 Vendor Rentals (Dropdown Driven with Multi-Day Support)
  const [vendorRentals, setVendorRentals] = useState<any[]>([]);
  const [currentRentalCatalogId, setCurrentRentalCatalogId] = useState("");
  const [currentRentalQty, setCurrentRentalQty] = useState<number>(1);
  const [currentRentalDays, setCurrentRentalDays] = useState<number>(1);
  const [currentRentalIsDayApplicable, setCurrentRentalIsDayApplicable] = useState(false);
  const [currentRentalSize, setCurrentRentalSize] = useState("");
  const [currentRentalNotes, setCurrentRentalNotes] = useState("");

  // 5. Instructions & Assembly Steps
  const [writtenInstructions, setWrittenInstructions] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [stepInput, setStepInput] = useState("");

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

  // Load All 4 Libraries + Components Data
  const fetchData = async () => {
    try {
      const [compSnap, elemSnap, flSnap, fcSnap, vrSnap] = await Promise.all([
        getDocs(query(collection(db, "components"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "elements"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "natural_flowers"), orderBy("name", "asc"))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, "fresh_consumables_library"), orderBy("name", "asc"))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, "vendor_rentals_library"), orderBy("itemName", "asc"))).catch(() => ({ docs: [] })),
      ]);

      setComponentsList(compSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setWarehouseElements(elemSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setNaturalFlowersLibrary(flSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setFreshConsumablesLibrary(fcSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setVendorRentalsLibrary(vrSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading component data:", err);
    }

    try {
      const catDoc = await getDoc(doc(db, "metadata", "component_categories"));
      if (catDoc.exists() && catDoc.data().list) {
        setCategories(Array.from(new Set([...categories, ...catDoc.data().list])));
      }
    } catch (e) {
      console.error("Error loading categories:", e);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const getElementWarehouseStock = (elementId: string) => {
    const found = warehouseElements.find((e) => e.id === elementId);
    return Number(found?.stock?.total ?? found?.stockQuantity ?? 0);
  };

  const toggleEvent = (ev: string) => {
    if (selectedEvents.includes(ev)) {
      setSelectedEvents(selectedEvents.filter((item) => item !== ev));
    } else {
      setSelectedEvents([...selectedEvents, ev]);
    }
  };

  const handleAddCustomEvent = () => {
    const trimmed = customEventInput.trim();
    if (!trimmed) return;
    if (!selectedEvents.includes(trimmed)) {
      setSelectedEvents([...selectedEvents, trimmed]);
    }
    setCustomEventInput("");
  };

  // 1. Add Warehouse Prop
  const handleAddWarehouseElement = () => {
    if (!currentSelectedElement) return alert("Please select a prop first.");

    const addedQty = Number(currentElemQty) || 1;
    const existingIndex = selectedWarehouseElements.findIndex(
      (item) => item.elementId === currentSelectedElement.id
    );

    if (existingIndex > -1) {
      const updated = [...selectedWarehouseElements];
      updated[existingIndex].quantity = Number(updated[existingIndex].quantity) + addedQty;
      if (currentElemNotes.trim()) {
        updated[existingIndex].notes = updated[existingIndex].notes
          ? `${updated[existingIndex].notes}; ${currentElemNotes.trim()}`
          : currentElemNotes.trim();
      }
      setSelectedWarehouseElements(updated);
    } else {
      setSelectedWarehouseElements([
        ...selectedWarehouseElements,
        {
          elementId: currentSelectedElement.id,
          elementName: currentSelectedElement.name,
          elementCategory: currentSelectedElement.category,
          elementSku: currentSelectedElement.sku,
          imageUrl: currentSelectedElement.images?.[0] || currentSelectedElement.imageUrl || "",
          quantity: addedQty,
          notes: currentElemNotes.trim(),
        },
      ]);
    }

    setCurrentSelectedElement(null);
    setCurrentElemQty(1);
    setCurrentElemNotes("");
  };

  // 2. Add Natural Flower
  const handleAddNaturalFlower = () => {
    if (!currentFlowerId) return alert("Please select a flower.");

    const flowerObj = naturalFlowersLibrary.find((f) => f.id === currentFlowerId);
    if (!flowerObj) return;

    const qty = Number(currentFlowerQty) || 1;
    const existingIdx = selectedFlowers.findIndex((f) => f.flowerId === currentFlowerId);

    if (existingIdx > -1) {
      const updated = [...selectedFlowers];
      updated[existingIdx].quantity = Number(updated[existingIdx].quantity) + qty;
      if (currentFlowerNotes.trim()) {
        updated[existingIdx].notes = updated[existingIdx].notes
          ? `${updated[existingIdx].notes}; ${currentFlowerNotes.trim()}`
          : currentFlowerNotes.trim();
      }
      setSelectedFlowers(updated);
    } else {
      setSelectedFlowers([
        ...selectedFlowers,
        {
          flowerId: flowerObj.id,
          flowerName: flowerObj.name,
          unit: flowerObj.unit === "Custom" ? flowerObj.customUnit : flowerObj.unit,
          approxPrice: Number(flowerObj.approxPrice) || 0,
          quantity: qty,
          notes: currentFlowerNotes.trim(),
        },
      ]);
    }

    setCurrentFlowerId("");
    setCurrentFlowerQty(1);
    setCurrentFlowerNotes("");
  };

  // 3. 🌟 Add Fresh Consumable from Library
  const handleAddFreshConsumable = () => {
    if (!currentConsumableId) return alert("Please select a consumable item.");

    const itemObj = freshConsumablesLibrary.find((c) => c.id === currentConsumableId);
    if (!itemObj) return;

    const qty = Number(currentConsumableQty) || 1;
    const unitStr = itemObj.unit === "Custom Unit" ? itemObj.customUnit : itemObj.unit;
    const unitPrice = Number(itemObj.approxPrice) || 0;
    const totalCost = unitPrice * qty;

    const existingIdx = freshPurchases.findIndex((fp) => fp.catalogId === currentConsumableId);

    if (existingIdx > -1) {
      const updated = [...freshPurchases];
      updated[existingIdx].quantity += qty;
      updated[existingIdx].estimatedCost += totalCost;
      updated[existingIdx].qtyDescription = `${updated[existingIdx].quantity} ${unitStr}`;
      if (currentConsumableNotes.trim()) {
        updated[existingIdx].notes = updated[existingIdx].notes
          ? `${updated[existingIdx].notes}; ${currentConsumableNotes.trim()}`
          : currentConsumableNotes.trim();
      }
      setFreshPurchases(updated);
    } else {
      setFreshPurchases([
        ...freshPurchases,
        {
          catalogId: itemObj.id,
          item: itemObj.name,
          quantity: qty,
          unit: unitStr,
          unitPrice,
          estimatedCost: totalCost,
          qtyDescription: `${qty} ${unitStr}`,
          notes: currentConsumableNotes.trim(),
        },
      ]);
    }

    setCurrentConsumableId("");
    setCurrentConsumableQty(1);
    setCurrentConsumableNotes("");
  };

  // 4. 🌟 Add Vendor Rental from Library
  const handleAddVendorRental = () => {
    if (!currentRentalCatalogId) return alert("Please select a rental item from the list.");

    const rentalObj = vendorRentalsLibrary.find((r) => r.id === currentRentalCatalogId);
    if (!rentalObj) return;

    const qty = Number(currentRentalQty) || 1;
    const isDay = Boolean(currentRentalIsDayApplicable);
    const days = isDay ? Math.max(1, Number(currentRentalDays) || 1) : 1;
    const rate = Number(rentalObj.rate) || 0;
    const totalCost = rate * qty * days;
    const unitStr = rentalObj.pricingUnit === "Custom Unit" ? rentalObj.customUnit : rentalObj.pricingUnit;

    const existingIdx = vendorRentals.findIndex((vr) => vr.catalogId === currentRentalCatalogId);

    if (existingIdx > -1) {
      const updated = [...vendorRentals];
      updated[existingIdx].quantity += qty;
      updated[existingIdx].estimatedCost += totalCost;
      if (currentRentalNotes.trim()) {
        updated[existingIdx].notes = updated[existingIdx].notes
          ? `${updated[existingIdx].notes}; ${currentRentalNotes.trim()}`
          : currentRentalNotes.trim();
      }
      setVendorRentals(updated);
    } else {
      setVendorRentals([
        ...vendorRentals,
        {
          catalogId: rentalObj.id,
          item: rentalObj.itemName,
          vendorName: rentalObj.vendorName,
          vendorDetails: rentalObj.vendorName, // Backward compatible
          size: currentRentalSize.trim() || rentalObj.size || "",
          quantity: qty,
          unit: unitStr,
          rate,
          isDayApplicable: isDay,
          days: isDay ? days : null,
          estimatedCost: totalCost,
          notes: currentRentalNotes.trim(),
        },
      ]);
    }

    setCurrentRentalCatalogId("");
    setCurrentRentalQty(1);
    setCurrentRentalDays(1);
    setCurrentRentalIsDayApplicable(false);
    setCurrentRentalSize("");
    setCurrentRentalNotes("");
  };

  // 🌟 Quick Save Consumable to Master Catalog
  const handleQuickCreateConsumable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConsumableName.trim() || !newConsumablePrice) return;

    try {
      const newDoc = {
        name: newConsumableName.trim(),
        unit: newConsumableUnit,
        customUnit: newConsumableUnit === "Custom Unit" ? newConsumableCustomUnit.trim() : "",
        approxPrice: Number(newConsumablePrice),
        remarks: newConsumableRemarks.trim(),
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "fresh_consumables_library"), newDoc);
      const createdItem = { id: docRef.id, ...newDoc };

      setFreshConsumablesLibrary((prev) => [...prev, createdItem].sort((a, b) => a.name.localeCompare(b.name)));
      setCurrentConsumableId(docRef.id);
      setShowAddConsumableModal(false);

      setNewConsumableName("");
      setNewConsumablePrice("");
      setNewConsumableRemarks("");
      setNewConsumableCustomUnit("");
    } catch (err: any) {
      alert("Failed to save consumable: " + err.message);
    }
  };

  // 🌟 Quick Save Rental to Master Catalog
  const handleQuickCreateRental = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRentalVendor.trim() || !newRentalItemName.trim() || !newRentalRate) return;

    try {
      const newDoc = {
        vendorName: newRentalVendor.trim(),
        itemName: newRentalItemName.trim(),
        size: newRentalSize.trim(),
        rate: Number(newRentalRate),
        pricingUnit: newRentalUnit,
        customUnit: newRentalUnit === "Custom Unit" ? newRentalCustomUnit.trim() : "",
        isDayApplicable: newRentalIsDayApplicable,
        remarks: newRentalRemarks.trim(),
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "vendor_rentals_library"), newDoc);
      const createdItem = { id: docRef.id, ...newDoc };

      setVendorRentalsLibrary((prev) => [...prev, createdItem].sort((a, b) => a.itemName.localeCompare(b.itemName)));
      setCurrentRentalCatalogId(docRef.id);
      setCurrentRentalIsDayApplicable(newRentalIsDayApplicable);
      setShowAddRentalModal(false);

      setNewRentalVendor("");
      setNewRentalItemName("");
      setNewRentalSize("");
      setNewRentalRate("");
      setNewRentalCustomUnit("");
      setNewRentalRemarks("");
      setNewRentalIsDayApplicable(false);
    } catch (err: any) {
      alert("Failed to save rental item: " + err.message);
    }
  };

  const handleAddStep = () => {
    if (!stepInput.trim()) return;
    setSteps([...steps, stepInput.trim()]);
    setStepInput("");
  };

  const resetForm = () => {
    setName("");
    setCategory("Stages");
    setCode(generateComponentCode("Stages"));
    setTheme("");
    setIsCustomCategory(false);
    setCustomCategoryInput("");
    setBaseCost(0);
    setLength("");
    setWidth("");
    setHeight("");
    setUnit("ft");
    setSelectedEvents([]);
    setSelectedWarehouseElements([]);
    setSelectedFlowers([]);
    setCurrentFlowerId("");
    setCurrentFlowerQty(1);
    setCurrentFlowerNotes("");
    setCurrentSelectedElement(null);
    setFreshPurchases([]);
    setCurrentConsumableId("");
    setCurrentConsumableQty(1);
    setCurrentConsumableNotes("");
    setVendorRentals([]);
    setCurrentRentalCatalogId("");
    setCurrentRentalQty(1);
    setCurrentRentalDays(1);
    setCurrentRentalIsDayApplicable(false);
    setCurrentRentalSize("");
    setCurrentRentalNotes("");
    setWrittenInstructions("");
    setSteps([]);
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
    setTheme(item.theme || "");
    setIsCustomCategory(false);
    setCustomCategoryInput("");
    setBaseCost(item.baseCost || 0);
    setLength(item.dimensions?.length?.toString() || "");
    setWidth(item.dimensions?.width?.toString() || "");
    setHeight(item.dimensions?.height?.toString() || "");
    setUnit(item.dimensions?.unit || "ft");
    setSelectedEvents(item.events || []);

    setSelectedWarehouseElements(item.warehouseElements || []);
    setSelectedFlowers(item.naturalFlowers || []);
    setFreshPurchases(item.freshPurchases || []);
    setVendorRentals(item.vendorRentals || []);

    setWrittenInstructions(item.writtenInstructions || "");
    setSteps(item.steps || []);
    setExistingImages(item.images || []);
    setImageFiles([]);
    setExistingAudioUrl(item.audioUrl || "");
    setAudioFile(null);
    setShowModal(true);
  };

  const handleDelete = async (id: string, compName: string) => {
    if (!window.confirm(`Delete "${compName}"?`)) return;
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
      if (isCustomCategory && finalCategory && !categories.includes(finalCategory)) {
        const updatedCats = [...categories, finalCategory];
        setCategories(updatedCats);
        await setDoc(doc(db, "metadata", "component_categories"), { list: updatedCats }, { merge: true }).catch(() => {});
      }

      let uploadedImageUrls: string[] = [...existingImages];
      for (const file of imageFiles) {
        const fileRef = ref(storage, `components/images/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        uploadedImageUrls.push(url);
      }

      const componentData = {
        name,
        code,
        category: finalCategory,
        theme: theme.trim(),
        events: selectedEvents,
        baseCost: Number(baseCost) || 0,
        dimensions: {
          length: Number(length) || 0,
          width: Number(width) || 0,
          height: Number(height) || 0,
          unit,
        },
        warehouseElements: selectedWarehouseElements,
        naturalFlowers: selectedFlowers,
        freshPurchases,
        vendorRentals,
        writtenInstructions,
        steps,
        images: uploadedImageUrls,
        audioUrl: existingAudioUrl,
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

  const distinctCategories = ["All", ...Array.from(new Set(componentsList.map((c) => c.category).filter(Boolean)))];
  const distinctThemes = ["All", ...Array.from(new Set(componentsList.map((c) => c.theme).filter(Boolean)))];
  const distinctEvents = ["All", "Haldi", "Mehendi", "Sangeet", "Wedding", "Reception", "Cocktail", "Pool Party", "After Party"];

  const filteredComponents = componentsList.filter((comp) => {
    const matchCat = filterCategory === "All" || comp.category === filterCategory;
    const matchTheme = filterTheme === "All" || comp.theme?.toLowerCase() === filterTheme.toLowerCase();
    const matchEvent = filterEvent === "All" || (comp.events && comp.events.includes(filterEvent));
    const matchSearch = !searchQuery || comp.name.toLowerCase().includes(searchQuery.toLowerCase()) || comp.code?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchTheme && matchEvent && matchSearch;
  });

  const elementCategories = ["All", ...Array.from(new Set(warehouseElements.map((e) => e.category).filter(Boolean)))];
  const filteredElements = warehouseElements.filter((el) => {
    const matchesCat = elementPickerCategory === "All" || el.category === elementPickerCategory;
    const matchesSearch = !elementPickerSearch || el.name.toLowerCase().includes(elementPickerSearch.toLowerCase()) || el.sku?.toLowerCase().includes(elementPickerSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const currentFlowerObj = naturalFlowersLibrary.find((f) => f.id === currentFlowerId);
  const currentConsumableObj = freshConsumablesLibrary.find((c) => c.id === currentConsumableId);
  const currentRentalObj = vendorRentalsLibrary.find((r) => r.id === currentRentalCatalogId);

  const totalFloralCost = selectedFlowers.reduce((sum, f) => sum + (Number(f.approxPrice) * Number(f.quantity)), 0);
  const totalFreshCost = freshPurchases.reduce((sum, fp) => sum + Number(fp.estimatedCost || 0), 0);
  const totalRentalCost = vendorRentals.reduce((sum, vr) => sum + Number(vr.estimatedCost || 0), 0);

  const allAvailableEventTags = Array.from(new Set([...standardEventTypes, ...selectedEvents]));

  if (loading) return <div className="p-8 text-center text-xl font-bold font-mono">Loading components...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border-2 border-gray-300 shadow-sm">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Components Master Library</h1>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Structured architecture with master libraries for Props, Natural Flowers, Consumables & Vendor Rentals.
            </p>
          </div>
          {role !== "sales" && (
            <button
              onClick={() => {
                resetForm();
                setIsEditing(false);
                setShowModal(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-3 rounded-lg shadow transition flex items-center gap-1.5"
            >
              + Create New Component
            </button>
          )}
        </div>

        {/* 3-WAY FILTER BAR */}
        <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="font-black uppercase text-gray-700">
              🔍 Multi-Filter Engine ({filteredComponents.length} items found)
            </span>
            {(filterCategory !== "All" || filterTheme !== "All" || filterEvent !== "All" || searchQuery) && (
              <button
                onClick={() => {
                  setFilterCategory("All");
                  setFilterTheme("All");
                  setFilterEvent("All");
                  setSearchQuery("");
                }}
                className="font-bold text-red-600 hover:underline"
              >
                Reset All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block font-black text-gray-700 mb-1">1. Category:</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900"
              >
                {distinctCategories.map((c) => (
                  <option key={c} value={c}>{c === "All" ? "✨ All Categories" : c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-black text-gray-700 mb-1">2. Theme:</label>
              <select
                value={filterTheme}
                onChange={(e) => setFilterTheme(e.target.value)}
                className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-purple-900"
              >
                {distinctThemes.map((t) => (
                  <option key={t} value={t}>{t === "All" ? "🎨 All Themes" : t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-black text-gray-700 mb-1">3. Event:</label>
              <select
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
                className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-blue-900"
              >
                {distinctEvents.map((ev) => (
                  <option key={ev} value={ev}>{ev === "All" ? "🗓️ All Events" : ev}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-black text-gray-700 mb-1">Search Keywords:</label>
              <input
                placeholder="Search name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900"
              />
            </div>
          </div>
        </div>

        {/* Components Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredComponents.map((comp) => (
            <div
              key={comp.id}
              className="bg-white border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition"
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

                  {comp.theme && (
                    <span className="absolute bottom-2 left-2 bg-purple-900/90 text-white text-[11px] font-black px-2.5 py-1 rounded-md shadow">
                      🎨 {comp.theme}
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

                  <div className="bg-gray-50 border border-gray-200 p-2.5 rounded-lg text-xs font-semibold text-gray-700 space-y-1.5 font-mono">
                    <p>📦 <strong>Props:</strong> {comp.warehouseElements?.length || 0} attached</p>
                    <p>🌸 <strong>Flowers:</strong> {comp.naturalFlowers?.length || 0} types</p>
                    <p>✨ <strong>Consumables:</strong> {comp.freshPurchases?.length || 0} items</p>
                    <p>🚚 <strong>Rentals:</strong> {comp.vendorRentals?.length || 0} items</p>
                  </div>
                </div>
              </div>

              {role !== "sales" && (
                <div className="p-4 border-t border-gray-200 grid grid-cols-3 gap-2 bg-gray-50 text-xs font-bold">
                  <button
                    onClick={() => setViewComponentData(comp)}
                    className="bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 py-2 rounded transition"
                  >
                    View
                  </button>
                  <button
                    onClick={() => openEditModal(comp)}
                    className="bg-white border-2 border-gray-300 hover:bg-gray-100 text-gray-900 py-2 rounded transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(comp.id, comp.name)}
                    className="bg-red-50 border-2 border-red-300 hover:bg-red-100 text-red-700 py-2 rounded transition"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* MODAL: CREATE OR EDIT COMPONENT */}
        {showModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-40">
            <div className="bg-white rounded-2xl max-w-4xl w-full p-6 max-h-[92vh] overflow-y-auto border-2 border-gray-400 shadow-2xl space-y-6">
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

              <form onSubmit={handleSave} className="space-y-6 text-xs">
                {/* 1. General Info */}
                <div className="space-y-4">
                  <h3 className="font-black text-blue-700 text-sm tracking-wide uppercase border-b pb-1">
                    1. General Information & Theme
                  </h3>

                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Component Name *</label>
                    <input
                      required
                      placeholder="e.g. Royal Mughal Sangeet Stage 24x16"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2.5 rounded-lg font-bold text-gray-900 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-black text-gray-800 mb-1">Category</label>
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

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-black text-gray-800">Code (Auto)</label>
                        <button
                          type="button"
                          onClick={() => setCode(generateComponentCode(isCustomCategory ? customCategoryInput : category))}
                          className="text-[10px] text-blue-700 font-bold hover:underline"
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
                      <label className="block text-xs font-black text-gray-800 mb-1">Estimated Selling/Base Price (₹)</label>
                      <input
                        type="number"
                        placeholder="85000"
                        value={baseCost || ""}
                        onChange={(e) => setBaseCost(Number(e.target.value))}
                        className="w-full border-2 border-gray-400 p-2.5 rounded-lg font-bold text-gray-900"
                      />
                    </div>
                  </div>

                  {/* Theme */}
                  <div className="bg-purple-50 p-3.5 rounded-xl border-2 border-purple-200">
                    <label className="block text-xs font-black text-purple-950 uppercase mb-1">
                      🎨 Assign Custom Theme *
                    </label>
                    <input
                      placeholder="Type custom theme name (e.g. Lavender Theme, Pastel Chic)..."
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="w-full border-2 border-purple-400 p-2 rounded-lg font-bold text-gray-900 outline-none"
                    />
                  </div>

                  {/* Dimensions */}
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Overall Dimensions (L × W × H)</label>
                    <div className="grid grid-cols-4 gap-2">
                      <input placeholder="L" type="number" value={length} onChange={(e) => setLength(e.target.value)} className="border-2 border-gray-400 p-2 rounded-lg font-bold text-center" />
                      <input placeholder="W" type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="border-2 border-gray-400 p-2 rounded-lg font-bold text-center" />
                      <input placeholder="H" type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="border-2 border-gray-400 p-2 rounded-lg font-bold text-center" />
                      <select value={unit} onChange={(e) => setUnit(e.target.value)} className="border-2 border-gray-400 p-2 rounded-lg font-bold">
                        <option value="ft">ft</option>
                        <option value="inch">inch</option>
                        <option value="m">m</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Warehouse Props */}
                <div className="space-y-3 bg-amber-50/60 p-4 rounded-xl border-2 border-amber-300">
                  <div className="flex justify-between items-center">
                    <h3 className="font-black text-amber-950 text-xs tracking-wide uppercase">
                      2. Warehouse Props / Elements
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowElementPickerModal(true)}
                      className="bg-amber-800 hover:bg-amber-900 text-white font-black px-3.5 py-1.5 rounded-lg text-xs shadow"
                    >
                      🖼️ Browse & Pick Props
                    </button>
                  </div>

                  {selectedWarehouseElements.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {selectedWarehouseElements.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2.5 rounded-lg border bg-white shadow-sm font-mono">
                          <span className="font-bold text-gray-900">{item.quantity}x {item.elementName}</span>
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

                {/* 3. Natural Flowers Requirement */}
                <div className="space-y-3 bg-pink-50/60 p-4 rounded-xl border-2 border-pink-300">
                  <div className="flex justify-between items-center">
                    <h3 className="font-black text-pink-950 text-xs tracking-wide uppercase">
                      3. Natural Flowers Requirement
                    </h3>
                    <span className="text-xs font-bold text-pink-900 bg-white px-2.5 py-1 rounded border border-pink-300 font-mono">
                      Floral Subtotal: ₹{totalFloralCost.toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-white p-3 rounded-xl border border-pink-200">
                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-black text-gray-700 mb-0.5">Select Flower *</label>
                      <select
                        value={currentFlowerId}
                        onChange={(e) => setCurrentFlowerId(e.target.value)}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900"
                      >
                        <option value="">-- Choose Natural Flower --</option>
                        {naturalFlowersLibrary.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} ({f.unit === "Custom" ? f.customUnit : f.unit} - ₹{f.approxPrice})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-black text-gray-700 mb-0.5">
                        Qty {currentFlowerObj ? `(${currentFlowerObj.unit === "Custom" ? currentFlowerObj.customUnit : currentFlowerObj.unit})` : "*"}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={currentFlowerQty}
                        onChange={(e) => setCurrentFlowerQty(Number(e.target.value))}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-center bg-white"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-black text-gray-700 mb-0.5">Placement Notes</label>
                      <input
                        placeholder="e.g. Backdrop border"
                        value={currentFlowerNotes}
                        onChange={(e) => setCurrentFlowerNotes(e.target.value)}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white"
                      />
                    </div>

                    <div className="md:col-span-2 flex items-end">
                      <button
                        type="button"
                        onClick={handleAddNaturalFlower}
                        className="w-full bg-pink-700 hover:bg-pink-800 text-white font-black py-2 rounded-lg shadow"
                      >
                        + Add Flower
                      </button>
                    </div>
                  </div>

                  {selectedFlowers.length > 0 && (
                    <div className="space-y-1.5 mt-2 font-mono">
                      {selectedFlowers.map((f, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-pink-200 shadow-sm">
                          <div>
                            <span className="font-bold text-pink-950">
                              🌸 {f.quantity} {f.unit} of {f.flowerName}
                            </span>
                            <span className="ml-2 font-bold text-gray-500">
                              (₹{f.approxPrice} × {f.quantity} = ₹{(f.approxPrice * f.quantity).toLocaleString()})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedFlowers(selectedFlowers.filter((_, i) => i !== idx))}
                            className="text-red-600 font-bold hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. 🌟 GENERAL CONSUMABLES REQUIREMENT (DROPDOWN + AUTO COST) */}
                <div className="space-y-3 bg-green-50/60 p-4 rounded-xl border-2 border-green-300">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-black text-green-950 text-xs tracking-wide uppercase">
                        4. General Fresh Consumables (Flex, Thermocol, Foam, Candles)
                      </h3>
                      <p className="text-[11px] text-green-800">
                        Select from your master consumables library. Cost automatically aggregates into budget.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-green-900 bg-white px-2.5 py-1 rounded border border-green-300 font-mono">
                        Consumables Total: ₹{totalFreshCost.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddConsumableModal(true)}
                        className="bg-green-800 hover:bg-green-900 text-white font-black px-2.5 py-1 rounded text-[11px] shadow"
                      >
                        + New in Library
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-white p-3 rounded-xl border border-green-200">
                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-black text-gray-700 mb-0.5">Select Consumable *</label>
                      <select
                        value={currentConsumableId}
                        onChange={(e) => setCurrentConsumableId(e.target.value)}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900"
                      >
                        <option value="">-- Choose From Consumables Library --</option>
                        {freshConsumablesLibrary.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (₹{c.approxPrice} / {c.unit === "Custom Unit" ? c.customUnit : c.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-black text-gray-700 mb-0.5">
                        Quantity {currentConsumableObj ? `(${currentConsumableObj.unit === "Custom Unit" ? currentConsumableObj.customUnit : currentConsumableObj.unit})` : "*"}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={currentConsumableQty}
                        onChange={(e) => setCurrentConsumableQty(Number(e.target.value))}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-center bg-white"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-black text-gray-700 mb-0.5">Usage / Placement Notes</label>
                      <input
                        placeholder="e.g. Cut into 4x4 squares"
                        value={currentConsumableNotes}
                        onChange={(e) => setCurrentConsumableNotes(e.target.value)}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white"
                      />
                    </div>

                    <div className="md:col-span-2 flex items-end">
                      <button
                        type="button"
                        onClick={handleAddFreshConsumable}
                        className="w-full bg-green-700 hover:bg-green-800 text-white font-black py-2 rounded-lg shadow"
                      >
                        + Add Item
                      </button>
                    </div>
                  </div>

                  {freshPurchases.length > 0 && (
                    <div className="space-y-1.5 mt-2 font-mono">
                      {freshPurchases.map((fp, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-green-200 shadow-sm">
                          <div>
                            <span className="font-bold text-green-950">
                              ✨ {fp.quantity} {fp.unit} of {fp.item}
                            </span>
                            <span className="ml-2 font-bold text-gray-500">
                              (₹{fp.unitPrice} × {fp.quantity} = ₹{fp.estimatedCost?.toLocaleString()})
                            </span>
                            {fp.notes && <span className="text-gray-400 italic ml-2">Note: {fp.notes}</span>}
                          </div>
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

                {/* 5. 🌟 VENDOR RENTALS REQUIREMENT (DROPDOWN + MULTI-DAY + AUTO COST) */}
                <div className="space-y-3 bg-indigo-50/60 p-4 rounded-xl border-2 border-indigo-300">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-black text-indigo-950 text-xs tracking-wide uppercase">
                        5. Vendor Rentals (Trussing, Sound, Chairs, Generators)
                      </h3>
                      <p className="text-[11px] text-indigo-800">
                        Select from vendor rental catalog with duration & quantity multipliers.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-900 bg-white px-2.5 py-1 rounded border border-indigo-300 font-mono">
                        Rentals Total: ₹{totalRentalCost.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddRentalModal(true)}
                        className="bg-indigo-800 hover:bg-indigo-900 text-white font-black px-2.5 py-1 rounded text-[11px] shadow"
                      >
                        + New in Library
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-white p-3 rounded-xl border border-indigo-200">
                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-black text-gray-700 mb-0.5">Select Rental Item *</label>
                      <select
                        value={currentRentalCatalogId}
                        onChange={(e) => {
                          const rId = e.target.value;
                          setCurrentRentalCatalogId(rId);
                          const obj = vendorRentalsLibrary.find((r) => r.id === rId);
                          if (obj) {
                            setCurrentRentalIsDayApplicable(Boolean(obj.isDayApplicable));
                            if (obj.size) setCurrentRentalSize(obj.size);
                          }
                        }}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900"
                      >
                        <option value="">-- Choose From Rental Catalog --</option>
                        {vendorRentalsLibrary.map((r) => (
                          <option key={r.id} value={r.id}>
                            [{r.vendorName}] {r.itemName} - ₹{r.rate}/{r.pricingUnit === "Custom Unit" ? r.customUnit : r.pricingUnit}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-black text-gray-700 mb-0.5">Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        value={currentRentalQty}
                        onChange={(e) => setCurrentRentalQty(Number(e.target.value))}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-center bg-white"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <div className="flex justify-between items-center mb-0.5">
                        <label className="text-[11px] font-black text-gray-700">Days</label>
                        <label className="text-[9px] font-bold text-indigo-800 flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={currentRentalIsDayApplicable}
                            onChange={(e) => setCurrentRentalIsDayApplicable(e.target.checked)}
                          />
                          Per Day?
                        </label>
                      </div>
                      <input
                        type="number"
                        min="1"
                        disabled={!currentRentalIsDayApplicable}
                        value={currentRentalIsDayApplicable ? currentRentalDays : 1}
                        onChange={(e) => setCurrentRentalDays(Number(e.target.value))}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-center bg-white disabled:bg-gray-100 disabled:text-gray-400"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-black text-gray-700 mb-0.5">Size / Dimensions</label>
                      <input
                        placeholder="e.g. 20x10 ft"
                        value={currentRentalSize}
                        onChange={(e) => setCurrentRentalSize(e.target.value)}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white"
                      />
                    </div>

                    <div className="md:col-span-2 flex items-end">
                      <button
                        type="button"
                        onClick={handleAddVendorRental}
                        className="w-full bg-indigo-700 hover:bg-indigo-800 text-white font-black py-2 rounded-lg shadow"
                      >
                        + Add Rental
                      </button>
                    </div>
                  </div>

                  {vendorRentals.length > 0 && (
                    <div className="space-y-1.5 mt-2 font-mono">
                      {vendorRentals.map((vr, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-indigo-200 shadow-sm">
                          <div>
                            <span className="font-bold text-indigo-950">
                              🚚 {vr.quantity}x {vr.item} {vr.size && `(${vr.size})`}
                            </span>
                            <span className="text-gray-500 ml-2 font-bold">
                              [Supplier: {vr.vendorName || vr.vendorDetails}]
                            </span>
                            <span className="ml-2 font-bold text-indigo-700">
                              (₹{vr.rate} × {vr.quantity} {vr.isDayApplicable ? `× ${vr.days} days` : ""} = ₹{vr.estimatedCost?.toLocaleString()})
                            </span>
                          </div>
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

                {/* 6. Photos */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border-2 border-slate-300">
                  <label className="block text-xs font-black text-gray-900">
                    📸 Reference Photos
                  </label>
                  
                  {existingImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {existingImages.map((imgUrl, idx) => (
                        <div key={idx} className="relative w-20 h-20 border rounded-lg overflow-hidden group">
                          <img src={imgUrl} alt="Saved" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setExistingImages(existingImages.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 bg-red-600 text-white rounded w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files) setImageFiles(Array.from(e.target.files));
                    }}
                    className="block w-full border-2 border-dashed border-gray-400 rounded-lg p-2 bg-white cursor-pointer"
                  />
                </div>

                {/* 7. Steps & Instructions */}
                <div className="space-y-3">
                  <h3 className="font-black text-gray-800 text-xs tracking-wide uppercase border-b pb-1">
                    7. Assembly Instructions & Notes
                  </h3>
                  <div className="flex gap-2">
                    <input
                      placeholder="e.g. Step 1: Secure trussing base with 50kg sandbags"
                      value={stepInput}
                      onChange={(e) => setStepInput(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium bg-white"
                    />
                    <button type="button" onClick={handleAddStep} className="bg-gray-900 text-white px-4 py-2 rounded-lg font-bold">
                      + Add Step
                    </button>
                  </div>
                  {steps.length > 0 && (
                    <ol className="list-decimal list-inside space-y-1 bg-gray-50 p-2 rounded border font-semibold">
                      {steps.map((st, idx) => (
                        <li key={idx} className="flex justify-between items-center">
                          <span>{st}</span>
                          <button type="button" onClick={() => setSteps(steps.filter((_, i) => i !== idx))} className="text-red-600 font-bold">✕</button>
                        </li>
                      ))}
                    </ol>
                  )}
                  <textarea
                    rows={2}
                    placeholder="General on-site precautions and labor notes..."
                    value={writtenInstructions}
                    onChange={(e) => setWrittenInstructions(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium bg-white"
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

        {/* 🌟 MODAL 1: QUICK ADD CONSUMABLE TO MASTER CATALOG */}
        {showAddConsumableModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm font-sans">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-green-500 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="text-base font-black text-green-950 uppercase">
                  Add Fresh Consumable to Catalog
                </h3>
                <button onClick={() => setShowAddConsumableModal(false)} className="text-gray-400 hover:text-black font-black">
                  ✕
                </button>
              </div>

              <form onSubmit={handleQuickCreateConsumable} className="space-y-3 text-xs">
                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Item Name *</label>
                  <input
                    required
                    placeholder="e.g. Thermocol Sheets 2-inch, Flex 340gsm"
                    value={newConsumableName}
                    onChange={(e) => setNewConsumableName(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-800 mb-1 uppercase">Pricing Unit *</label>
                    <select
                      value={newConsumableUnit}
                      onChange={(e) => setNewConsumableUnit(e.target.value)}
                      className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                    >
                      <option value="Per Meter">Per Meter</option>
                      <option value="Per Sheet">Per Sheet</option>
                      <option value="Per Pc">Per Pc</option>
                      <option value="Per Box">Per Box</option>
                      <option value="Per Roll">Per Roll</option>
                      <option value="Custom Unit">Custom Unit...</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-black text-gray-800 mb-1 uppercase">Approx Price (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      placeholder="e.g. 150"
                      value={newConsumablePrice}
                      onChange={(e) => setNewConsumablePrice(Number(e.target.value))}
                      className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-right bg-white font-mono"
                    />
                  </div>
                </div>

                {newConsumableUnit === "Custom Unit" && (
                  <div>
                    <label className="block font-black text-green-950 mb-1 uppercase">Custom Unit Name *</label>
                    <input
                      required
                      placeholder="e.g. Per Bundle, Per 50 Pcs"
                      value={newConsumableCustomUnit}
                      onChange={(e) => setNewConsumableCustomUnit(e.target.value)}
                      className="w-full border-2 border-green-400 p-2 rounded-lg font-bold bg-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Sourcing Notes / Remarks</label>
                  <input
                    placeholder="e.g. Buy from Sadar Bazar hardware vendor"
                    value={newConsumableRemarks}
                    onChange={(e) => setNewConsumableRemarks(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowAddConsumableModal(false)}
                    className="px-4 py-2 border font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-green-700 hover:bg-green-800 text-white font-black rounded-lg shadow"
                  >
                    Save Consumable
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 🌟 MODAL 2: QUICK ADD VENDOR RENTAL TO MASTER CATALOG */}
        {showAddRentalModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm font-sans">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-indigo-500 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="text-base font-black text-indigo-950 uppercase">
                  Add Vendor Rental to Catalog
                </h3>
                <button onClick={() => setShowAddRentalModal(false)} className="text-gray-400 hover:text-black font-black">
                  ✕
                </button>
              </div>

              <form onSubmit={handleQuickCreateRental} className="space-y-3 text-xs">
                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Vendor / Supplier Name *</label>
                  <input
                    required
                    placeholder="e.g. Modern Trussing Co., Sharma Lights"
                    value={newRentalVendor}
                    onChange={(e) => setNewRentalVendor(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>

                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Rental Item Name *</label>
                  <input
                    required
                    placeholder="e.g. Heavy Duty Truss 20x10ft, Ghost Chair"
                    value={newRentalItemName}
                    onChange={(e) => setNewRentalItemName(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-800 mb-1 uppercase">Standard Size / Spec</label>
                    <input
                      placeholder="e.g. 20x10 ft, 15kVA"
                      value={newRentalSize}
                      onChange={(e) => setNewRentalSize(e.target.value)}
                      className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-black text-gray-800 mb-1 uppercase">Rental Rate (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      placeholder="e.g. 4500"
                      value={newRentalRate}
                      onChange={(e) => setNewRentalRate(Number(e.target.value))}
                      className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-right bg-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-800 mb-1 uppercase">Pricing Unit *</label>
                    <select
                      value={newRentalUnit}
                      onChange={(e) => setNewRentalUnit(e.target.value)}
                      className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                    >
                      <option value="Per Pc">Per Pc</option>
                      <option value="Per Event">Per Event</option>
                      <option value="Per Day">Per Day</option>
                      <option value="Per Set">Per Set</option>
                      <option value="Custom Unit">Custom Unit...</option>
                    </select>
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-900">
                      <input
                        type="checkbox"
                        checked={newRentalIsDayApplicable}
                        onChange={(e) => setNewRentalIsDayApplicable(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span>Multi-Day Multiplier?</span>
                    </label>
                  </div>
                </div>

                {newRentalUnit === "Custom Unit" && (
                  <div>
                    <label className="block font-black text-indigo-950 mb-1 uppercase">Custom Unit Name *</label>
                    <input
                      required
                      placeholder="e.g. Per Section, Per Box"
                      value={newRentalCustomUnit}
                      onChange={(e) => setNewRentalCustomUnit(e.target.value)}
                      className="w-full border-2 border-indigo-400 p-2 rounded-lg font-bold bg-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Supplier Contact / Notes</label>
                  <input
                    placeholder="e.g. Ph: 98110..., Requires 3 hours setup notice"
                    value={newRentalRemarks}
                    onChange={(e) => setNewRentalRemarks(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowAddRentalModal(false)}
                    className="px-4 py-2 border font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-black rounded-lg shadow"
                  >
                    Save Rental Item
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ELEMENT PICKER POPUP */}
        {showElementPickerModal && (
          <div className="fixed inset-0 z-50 bg-black/85 flex flex-col p-4 md:p-6 backdrop-blur-sm font-sans">
            <div className="w-full h-full max-w-7xl mx-auto bg-white rounded-2xl flex flex-col overflow-hidden shadow-2xl border-2 border-gray-400">
              <div className="p-4 md:p-6 border-b-2 border-gray-200 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">📦 Select Warehouse Prop / Element</h2>
                  <p className="text-xs font-bold text-gray-600">Click any prop below to assign it to this component.</p>
                </div>
                <div className="flex items-center gap-3">
                  <select value={elementPickerCategory} onChange={(e) => setElementPickerCategory(e.target.value)} className="border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900">
                    {elementCategories.map((cat) => (<option key={cat} value={cat}>{cat === "All" ? "✨ All Categories" : cat}</option>))}
                  </select>
                  <input placeholder="Search name or SKU..." value={elementPickerSearch} onChange={(e) => setElementPickerSearch(e.target.value)} className="border-2 border-gray-400 p-2 rounded-lg text-xs font-bold bg-white text-gray-900" />
                  <button type="button" onClick={() => setShowElementPickerModal(false)} className="bg-gray-900 hover:bg-black text-white font-black px-4 py-2 rounded-lg text-xs">✕ Close</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 content-start">
                {filteredElements.map((el) => {
                  const hasPic = el.images?.[0] || el.imageUrl;
                  const liveStock = Number(el.stock?.total ?? el.stockQuantity ?? 0);

                  return (
                    <div
                      key={el.id}
                      onClick={() => { setCurrentSelectedElement(el); setShowElementPickerModal(false); }}
                      className="bg-white border-2 border-gray-300 hover:border-amber-600 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition cursor-pointer group flex flex-col justify-between h-auto min-h-[340px]"
                    >
                      <div>
                        <div className="h-44 w-full bg-gray-100 relative overflow-hidden flex items-center justify-center flex-shrink-0">
                          {hasPic ? (
                            <img src={hasPic} alt={el.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs font-bold text-gray-400">No Photo</div>
                          )}
                          <span className="absolute top-2 right-2 bg-gray-900/90 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow">{el.sku || "PROP"}</span>
                        </div>

                        <div className="p-3.5 space-y-1">
                          <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">{el.category}</span>
                          <h4 className="font-black text-sm text-gray-900 mt-1 leading-snug group-hover:text-amber-800 line-clamp-2">{el.name}</h4>
                          <p className="text-[11px] text-gray-600 font-bold pt-1 font-mono">
                            Stock: <strong className={liveStock > 0 ? "text-blue-700" : "text-red-600 font-black"}>{liveStock} units</strong>
                          </p>
                        </div>
                      </div>

                      <div className="p-2.5 border-t bg-gray-50">
                        <button type="button" className="w-full bg-amber-700 group-hover:bg-amber-800 text-white font-black py-2 rounded-lg text-xs transition shadow">
                          Select This Prop ✓
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW COMPONENT DETAILS MODAL */}
        {viewComponentData && (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 md:p-6 z-50 backdrop-blur-sm font-sans">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border-2 border-gray-400">
              <div className="p-4 md:p-6 border-b-2 border-gray-200 bg-gray-50 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-black uppercase text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                    {viewComponentData.category}
                  </span>
                  <h2 className="text-2xl font-black text-gray-900 mt-1">{viewComponentData.name}</h2>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">Code: {viewComponentData.code || "COMP"}</p>
                </div>
                <button
                  onClick={() => setViewComponentData(null)}
                  className="bg-gray-900 hover:bg-black text-white font-black px-4 py-2 rounded-lg text-xs shadow"
                >
                  ✕ Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs font-mono">
                {/* Flowers */}
                <div className="space-y-2">
                  <h4 className="font-black text-sm uppercase text-pink-900 border-b pb-1">🌸 Natural Flowers</h4>
                  {viewComponentData.naturalFlowers?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {viewComponentData.naturalFlowers.map((fl: any, idx: number) => (
                        <div key={idx} className="bg-pink-50 border border-pink-200 p-3 rounded-lg shadow-sm">
                          <p className="font-black text-pink-950">{fl.quantity} {fl.unit} of {fl.flowerName}</p>
                          <p className="text-[10px] text-gray-500">₹{fl.approxPrice} × {fl.quantity} = ₹{(fl.approxPrice * fl.quantity).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 italic">No natural flowers assigned.</p>
                  )}
                </div>

                {/* Fresh Consumables */}
                <div className="space-y-2">
                  <h4 className="font-black text-sm uppercase text-green-900 border-b pb-1">✨ General Consumables</h4>
                  {viewComponentData.freshPurchases?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {viewComponentData.freshPurchases.map((fp: any, idx: number) => (
                        <div key={idx} className="bg-green-50 border border-green-200 p-3 rounded-lg shadow-sm">
                          <p className="font-black text-green-950">
                            {fp.quantity ? `${fp.quantity} ${fp.unit} of ` : ""}{fp.item} {fp.qtyDescription && !fp.quantity ? `(${fp.qtyDescription})` : ""}
                          </p>
                          <p className="text-[10px] text-gray-500">Cost: ₹{fp.estimatedCost?.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 italic">No fresh consumables assigned.</p>
                  )}
                </div>

                {/* Vendor Rentals */}
                <div className="space-y-2">
                  <h4 className="font-black text-sm uppercase text-indigo-900 border-b pb-1">🚚 Vendor Rentals</h4>
                  {viewComponentData.vendorRentals?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {viewComponentData.vendorRentals.map((vr: any, idx: number) => (
                        <div key={idx} className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg shadow-sm">
                          <p className="font-black text-indigo-950">{vr.quantity}x {vr.item} {vr.size && `(${vr.size})`}</p>
                          <p className="text-[10px] text-gray-600">Vendor: {vr.vendorName || vr.vendorDetails || "TBD"}</p>
                          <p className="text-[10px] text-indigo-800 font-bold">Estimated Cost: ₹{vr.estimatedCost?.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 italic">No vendor rentals assigned.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}