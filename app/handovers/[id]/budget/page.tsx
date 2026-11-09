"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, storage } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../../../../context/AuthContext";

// ==========================================
// INTERFACES
// ==========================================
interface NewPurchaseItem {
  id: string;
  name: string;
  category: string;
  material: string;
  size: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  imageUrl: string;
  notes: string;
}

interface WeddingRentalItem {
  id: string;
  libraryItemId?: string;
  vendorName: string;
  itemName: string;
  size?: string;
  rate: number;
  pricingUnit: string;
  quantity: number;
  days: number;
  isDayApplicable: boolean;
  totalCost: number;
  notes?: string;
}

interface WeddingConsumableItem {
  id: string;
  libraryItemId?: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  quantity: number;
  totalCost: number;
  notes?: string;
}

interface WeddingFlowerItem {
  id: string;
  libraryItemId?: string;
  name: string;
  variety?: string;
  color?: string;
  unit: string;
  unitCost: number;
  quantity: number;
  totalCost: number;
  imageUrl?: string;
  notes?: string;
}

export default function ProductionBudgetPage() {
  const params = useParams();
  const router = useRouter();
  const handoverId = params.id as string;
  const { user, role, isSuperAdmin, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Master Catalogs from Firestore
  const [entertainmentCatalog, setEntertainmentCatalog] = useState<any[]>([]);
  const [rentalsLibrary, setRentalsLibrary] = useState<any[]>([]);
  const [consumablesLibrary, setConsumablesLibrary] = useState<any[]>([]);
  const [flowersLibrary, setFlowersLibrary] = useState<any[]>([]);

  // Wedding-Specific Budget Lists
  const [vendorRentals, setVendorRentals] = useState<WeddingRentalItem[]>([]);
  const [freshConsumables, setFreshConsumables] = useState<WeddingConsumableItem[]>([]);
  const [flowerPurchases, setFlowerPurchases] = useState<WeddingFlowerItem[]>([]);
  const [newPurchases, setNewPurchases] = useState<NewPurchaseItem[]>([]);

  // =========================================================================
  // MODAL STATES FOR ADDING BUDGET ITEMS
  // =========================================================================

  // 1. Rental Modal
  const [showRentalModal, setShowRentalModal] = useState(false);
  const [selectedRentalLibId, setSelectedRentalLibId] = useState("");
  const [rentalVendorName, setRentalVendorName] = useState("");
  const [rentalItemName, setRentalItemName] = useState("");
  const [rentalSize, setRentalSize] = useState("");
  const [rentalRate, setRentalRate] = useState<number | "">("");
  const [rentalUnit, setRentalUnit] = useState("Per Pc");
  const [rentalIsDayApplicable, setRentalIsDayApplicable] = useState(false);
  const [rentalQty, setRentalQty] = useState<number | "">(1);
  const [rentalDays, setRentalDays] = useState<number | "">(1);
  const [rentalNotes, setRentalNotes] = useState("");
  const [submittingRental, setSubmittingRental] = useState(false);

  // 2. Consumable Modal
  const [showConsumableModal, setShowConsumableModal] = useState(false);
  const [selectedConsumableLibId, setSelectedConsumableLibId] = useState("");
  const [consumableName, setConsumableName] = useState("");
  const [consumableCategory, setConsumableCategory] = useState("Flex & Printing");
  const [consumableUnit, setConsumableUnit] = useState("Per Meter");
  const [consumableRate, setConsumableRate] = useState<number | "">("");
  const [consumableQty, setConsumableQty] = useState<number | "">(1);
  const [consumableNotes, setConsumableNotes] = useState("");
  const [submittingConsumable, setSubmittingConsumable] = useState(false);

  // 3. Flower Modal
  const [showFlowerModal, setShowFlowerModal] = useState(false);
  const [selectedFlowerLibId, setSelectedFlowerLibId] = useState("");
  const [flowerName, setFlowerName] = useState("");
  const [flowerVariety, setFlowerVariety] = useState("");
  const [flowerColor, setFlowerColor] = useState("");
  const [flowerUnit, setFlowerUnit] = useState("Per Bunch");
  const [flowerRate, setFlowerRate] = useState<number | "">("");
  const [flowerQty, setFlowerQty] = useState<number | "">(1);
  const [flowerImageUrl, setFlowerImageUrl] = useState("");
  const [flowerNotes, setFlowerNotes] = useState("");
  const [submittingFlower, setSubmittingFlower] = useState(false);

  // 4. Capex New Purchase Modal
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseName, setPurchaseName] = useState("");
  const [purchaseCategory, setPurchaseCategory] = useState("Props & Structures");
  const [purchaseMaterial, setPurchaseMaterial] = useState("");
  const [purchaseSize, setPurchaseSize] = useState("");
  const [purchaseQty, setPurchaseQty] = useState<number>(1);
  const [purchaseCost, setPurchaseCost] = useState<number>(0);
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseImageFile, setPurchaseImageFile] = useState<File | null>(null);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);

  // 5. Dynamic Cost Override Modal (Other Items & SFX)
  const [showEditCostModal, setShowEditCostModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editUnitRate, setEditUnitRate] = useState<number | "">("");
  const [editTotalCost, setEditTotalCost] = useState<number | "">("");
  const [savingOverride, setSavingOverride] = useState(false);
  const rateInputRef = useRef<HTMLInputElement>(null);
  const totalInputRef = useRef<HTMLInputElement>(null);

  // Sales team route guard
  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && role === "sales" && !isSuperAdmin) {
      alert("Unauthorized: Sales team cannot view internal production budgets.");
      router.push(`/handovers/${handoverId}`);
    }
  }, [user, role, isSuperAdmin, loading, router, handoverId]);

  // Load All Data & Master Libraries
  const loadData = async () => {
    if (!handoverId) return;
    try {
      setLoadingData(true);
      const [hSnap, entSnap, rentSnap, consSnap, flowSnap] = await Promise.all([
        getDoc(doc(db, "handovers", handoverId)),
        getDocs(collection(db, "entertainment")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "vendor_rentals_library")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "fresh_consumables_library")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "natural_flowers")).catch(() => ({ docs: [] })),
      ]);

      if (hSnap.exists()) {
        const data = hSnap.data();
        setHandover(data);
        setNewPurchases(data.budgeting?.newPurchases || []);
        setVendorRentals(data.budgeting?.vendorRentals || []);
        setFreshConsumables(data.budgeting?.freshConsumables || []);
        setFlowerPurchases(data.budgeting?.flowerPurchases || []);
      }

      setEntertainmentCatalog(entSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setRentalsLibrary(rentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setConsumablesLibrary(consSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setFlowersLibrary(flowSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading budget data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (handoverId) loadData();
  }, [handoverId]);

  // =========================================================================
  // RESOLVE MASTER BUYING RATE FOR ENTERTAINMENT / OTHER SFX
  // =========================================================================
  const resolveMasterBuyingRate = (item: any): { rate: number; isConfigured: boolean } => {
    const master = entertainmentCatalog.find(
      (m) =>
        m.id === (item.itemId || item.id) ||
        m.name?.toLowerCase().trim() === item.name?.toLowerCase().trim()
    );

    if (master) {
      const hasVariants = master.hasVariants || (master.variants && master.variants.length > 0);
      if (hasVariants && Array.isArray(master.variants)) {
        const matchedVariant = master.variants.find(
          (v: any) =>
            v.id === item.variantId ||
            (item.variantName && v.name?.toLowerCase().trim() === item.variantName?.toLowerCase().trim())
        );
        if (matchedVariant && matchedVariant.internalVendorCost !== undefined && matchedVariant.internalVendorCost !== null) {
          return { rate: Number(matchedVariant.internalVendorCost) || 0, isConfigured: Number(matchedVariant.internalVendorCost) > 0 };
        }
      }
      if (master.internalVendorCost !== undefined && master.internalVendorCost !== null) {
        return { rate: Number(master.internalVendorCost) || 0, isConfigured: Number(master.internalVendorCost) > 0 };
      }
    }

    if (item.internalVendorCost !== undefined && item.internalVendorCost !== null) {
      return { rate: Number(item.internalVendorCost) || 0, isConfigured: Number(item.internalVendorCost) > 0 };
    }

    return { rate: 0, isConfigured: false };
  };

  const getItemKey = (item: any, scopePrefix: string, index: number) => {
    return item.id ? `${item.id}` : `${scopePrefix}_${item.itemId || item.name}_${item.variantName || 'std'}_${index}`;
  };

  // =========================================================================
  // HANDLERS: VENDOR RENTALS
  // =========================================================================
  const handleSelectRentalLibraryItem = (libId: string) => {
    setSelectedRentalLibId(libId);
    const item = rentalsLibrary.find((r) => r.id === libId);
    if (item) {
      setRentalVendorName(item.vendorName || "");
      setRentalItemName(item.itemName || "");
      setRentalSize(item.size || "");
      setRentalRate(item.rate || 0);
      setRentalUnit(item.pricingUnit === "Custom Unit" ? item.customUnit || "Custom" : item.pricingUnit || "Per Pc");
      setRentalIsDayApplicable(Boolean(item.isDayApplicable));
      setRentalNotes(item.remarks || "");
    }
  };

  const handleSaveRental = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentalItemName.trim() || rentalRate === "") return;

    setSubmittingRental(true);
    try {
      const qty = Math.max(1, Number(rentalQty) || 1);
      const days = rentalIsDayApplicable ? Math.max(1, Number(rentalDays) || 1) : 1;
      const rate = Number(rentalRate) || 0;
      const totalCost = rate * qty * days;

      const newItem: WeddingRentalItem = {
        id: Date.now().toString(),
        libraryItemId: selectedRentalLibId || undefined,
        vendorName: rentalVendorName.trim() || "Independent Supplier",
        itemName: rentalItemName.trim(),
        size: rentalSize.trim(),
        rate,
        pricingUnit: rentalUnit,
        quantity: qty,
        days,
        isDayApplicable: rentalIsDayApplicable,
        totalCost,
        notes: rentalNotes.trim(),
      };

      const updated = [...vendorRentals, newItem];
      await updateDoc(doc(db, "handovers", handoverId), {
        "budgeting.vendorRentals": updated,
        updatedAt: new Date().toISOString(),
      });

      setVendorRentals(updated);
      setShowRentalModal(false);
      setSelectedRentalLibId("");
      setRentalItemName("");
      setRentalVendorName("");
      setRentalSize("");
      setRentalRate("");
      setRentalQty(1);
      setRentalDays(1);
      setRentalNotes("");
    } catch (err: any) {
      alert("Failed to save rental item: " + err.message);
    } finally {
      setSubmittingRental(false);
    }
  };

  const handleDeleteRental = async (id: string, name: string) => {
    if (!window.confirm(`Delete rental "${name}" from this wedding?`)) return;
    const updated = vendorRentals.filter((i) => i.id !== id);
    await updateDoc(doc(db, "handovers", handoverId), {
      "budgeting.vendorRentals": updated,
      updatedAt: new Date().toISOString(),
    });
    setVendorRentals(updated);
  };

  // =========================================================================
  // HANDLERS: FRESH CONSUMABLES
  // =========================================================================
  const handleSelectConsumableLibraryItem = (libId: string) => {
    setSelectedConsumableLibId(libId);
    const item = consumablesLibrary.find((c) => c.id === libId);
    if (item) {
      setConsumableName(item.name || "");
      setConsumableCategory(item.category || "Flex & Printing");
      setConsumableUnit(item.unit === "Custom Unit" ? item.customUnit || "Custom" : item.unit || "Per Meter");
      setConsumableRate(item.approxPrice || 0);
      setConsumableNotes(item.remarks || "");
    }
  };

  const handleSaveConsumable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumableName.trim() || consumableRate === "") return;

    setSubmittingConsumable(true);
    try {
      const qty = Math.max(1, Number(consumableQty) || 1);
      const unitCost = Number(consumableRate) || 0;
      const totalCost = unitCost * qty;

      const newItem: WeddingConsumableItem = {
        id: Date.now().toString(),
        libraryItemId: selectedConsumableLibId || undefined,
        name: consumableName.trim(),
        category: consumableCategory,
        unit: consumableUnit,
        unitCost,
        quantity: qty,
        totalCost,
        notes: consumableNotes.trim(),
      };

      const updated = [...freshConsumables, newItem];
      await updateDoc(doc(db, "handovers", handoverId), {
        "budgeting.freshConsumables": updated,
        updatedAt: new Date().toISOString(),
      });

      setFreshConsumables(updated);
      setShowConsumableModal(false);
      setSelectedConsumableLibId("");
      setConsumableName("");
      setConsumableRate("");
      setConsumableQty(1);
      setConsumableNotes("");
    } catch (err: any) {
      alert("Failed to save consumable: " + err.message);
    } finally {
      setSubmittingConsumable(false);
    }
  };

  const handleDeleteConsumable = async (id: string, name: string) => {
    if (!window.confirm(`Delete consumable "${name}" from this wedding?`)) return;
    const updated = freshConsumables.filter((i) => i.id !== id);
    await updateDoc(doc(db, "handovers", handoverId), {
      "budgeting.freshConsumables": updated,
      updatedAt: new Date().toISOString(),
    });
    setFreshConsumables(updated);
  };

  // =========================================================================
  // HANDLERS: NATURAL FLOWERS
  // =========================================================================
  const handleSelectFlowerLibraryItem = (libId: string) => {
    setSelectedFlowerLibId(libId);
    const item = flowersLibrary.find((f) => f.id === libId);
    if (item) {
      setFlowerName(item.name || "");
      setFlowerVariety(item.variety || "");
      setFlowerColor(item.color || "");
      setFlowerUnit(item.unit === "Custom" ? item.customUnit || "Custom" : item.unit || "Per Bunch");
      setFlowerRate(item.approxPrice || 0);
      setFlowerImageUrl(item.imageUrl || "");
      setFlowerNotes(item.notes || "");
    }
  };

  const handleSaveFlower = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flowerName.trim() || flowerRate === "") return;

    setSubmittingFlower(true);
    try {
      const qty = Math.max(1, Number(flowerQty) || 1);
      const unitCost = Number(flowerRate) || 0;
      const totalCost = unitCost * qty;

      const newItem: WeddingFlowerItem = {
        id: Date.now().toString(),
        libraryItemId: selectedFlowerLibId || undefined,
        name: flowerName.trim(),
        variety: flowerVariety.trim(),
        color: flowerColor.trim(),
        unit: flowerUnit,
        unitCost,
        quantity: qty,
        totalCost,
        imageUrl: flowerImageUrl,
        notes: flowerNotes.trim(),
      };

      const updated = [...flowerPurchases, newItem];
      await updateDoc(doc(db, "handovers", handoverId), {
        "budgeting.flowerPurchases": updated,
        updatedAt: new Date().toISOString(),
      });

      setFlowerPurchases(updated);
      setShowFlowerModal(false);
      setSelectedFlowerLibId("");
      setFlowerName("");
      setFlowerVariety("");
      setFlowerColor("");
      setFlowerRate("");
      setFlowerQty(1);
      setFlowerImageUrl("");
      setFlowerNotes("");
    } catch (err: any) {
      alert("Failed to save flower: " + err.message);
    } finally {
      setSubmittingFlower(false);
    }
  };

  const handleDeleteFlower = async (id: string, name: string) => {
    if (!window.confirm(`Delete flower "${name}" from this wedding?`)) return;
    const updated = flowerPurchases.filter((i) => i.id !== id);
    await updateDoc(doc(db, "handovers", handoverId), {
      "budgeting.flowerPurchases": updated,
      updatedAt: new Date().toISOString(),
    });
    setFlowerPurchases(updated);
  };

  // =========================================================================
  // HANDLERS: NEW CAPEX PURCHASES
  // =========================================================================
  const handleAddNewPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingPurchase(true);

    try {
      let imageUrl = "";
      if (purchaseImageFile) {
        const fileRef = ref(storage, `budget_purchases/${Date.now()}_${purchaseImageFile.name}`);
        await uploadBytes(fileRef, purchaseImageFile);
        imageUrl = await getDownloadURL(fileRef);
      }

      const newItem: NewPurchaseItem = {
        id: Date.now().toString(),
        name: purchaseName.trim(),
        category: purchaseCategory,
        material: purchaseMaterial.trim(),
        size: purchaseSize.trim(),
        quantity: Number(purchaseQty) || 1,
        unitCost: Number(purchaseCost) || 0,
        totalCost: (Number(purchaseQty) || 1) * (Number(purchaseCost) || 0),
        imageUrl,
        notes: purchaseNotes.trim(),
      };

      const updatedList = [...newPurchases, newItem];
      await updateDoc(doc(db, "handovers", handoverId), {
        "budgeting.newPurchases": updatedList,
        updatedAt: new Date().toISOString(),
      });

      setNewPurchases(updatedList);
      setShowPurchaseModal(false);
      setPurchaseName("");
      setPurchaseMaterial("");
      setPurchaseSize("");
      setPurchaseQty(1);
      setPurchaseCost(0);
      setPurchaseNotes("");
      setPurchaseImageFile(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save purchase item.");
    } finally {
      setSubmittingPurchase(false);
    }
  };

  const handleDeletePurchase = async (id: string, name: string) => {
    if (!window.confirm(`Delete purchase item "${name}"?`)) return;
    const updatedList = newPurchases.filter((i) => i.id !== id);
    await updateDoc(doc(db, "handovers", handoverId), {
      "budgeting.newPurchases": updatedList,
      updatedAt: new Date().toISOString(),
    });
    setNewPurchases(updatedList);
  };

  // =========================================================================
  // HANDLERS: DYNAMIC COST OVERRIDES (OTHER ITEMS & SFX)
  // =========================================================================
  const openEditCostModal = (item: any, focusField: "rate" | "total") => {
    setEditingItem(item);
    setEditUnitRate(item.buyingRate);
    setEditTotalCost(item.totalCost);
    setShowEditCostModal(true);

    setTimeout(() => {
      if (focusField === "rate") {
        rateInputRef.current?.focus();
        rateInputRef.current?.select();
      } else {
        totalInputRef.current?.focus();
        totalInputRef.current?.select();
      }
    }, 100);
  };

  const handleRateInputChange = (valStr: string) => {
    if (valStr === "") {
      setEditUnitRate("");
      setEditTotalCost("");
      return;
    }
    const rate = Number(valStr);
    setEditUnitRate(rate);
    const multiplier = editingItem?.multiplier || 1;
    setEditTotalCost(Math.round(rate * multiplier));
  };

  const handleTotalInputChange = (valStr: string) => {
    if (valStr === "") {
      setEditTotalCost("");
      setEditUnitRate("");
      return;
    }
    const total = Number(valStr);
    setEditTotalCost(total);
    const multiplier = editingItem?.multiplier || 1;
    const derivedRate = multiplier > 0 ? Math.round((total / multiplier) * 100) / 100 : total;
    setEditUnitRate(derivedRate);
  };

  const handleSaveCostOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !handover) return;

    setSavingOverride(true);
    try {
      const finalUnitRate = Number(editUnitRate) || 0;
      const finalTotalCost = Number(editTotalCost) || 0;

      const currentOverrides = handover.budgeting?.costOverrides || {};
      const updatedOverrides = {
        ...currentOverrides,
        [editingItem.key]: {
          unitCost: finalUnitRate,
          totalCost: finalTotalCost,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || "User",
        },
      };

      await updateDoc(doc(db, "handovers", handoverId), {
        "budgeting.costOverrides": updatedOverrides,
        updatedAt: new Date().toISOString(),
      });

      setHandover({
        ...handover,
        budgeting: {
          ...(handover.budgeting || {}),
          costOverrides: updatedOverrides,
        },
      });

      setShowEditCostModal(false);
    } catch (err: any) {
      console.error(err);
      alert("Failed to save custom cost: " + err.message);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleResetToMasterRate = async () => {
    if (!editingItem || !handover) return;
    if (!window.confirm(`Reset "${editingItem.name}" back to the master catalog rate?`)) return;

    setSavingOverride(true);
    try {
      const currentOverrides = { ...(handover.budgeting?.costOverrides || {}) };
      delete currentOverrides[editingItem.key];

      await updateDoc(doc(db, "handovers", handoverId), {
        "budgeting.costOverrides": currentOverrides,
        updatedAt: new Date().toISOString(),
      });

      setHandover({
        ...handover,
        budgeting: {
          ...(handover.budgeting || {}),
          costOverrides: currentOverrides,
        },
      });

      setShowEditCostModal(false);
    } catch (err: any) {
      console.error(err);
      alert("Failed to reset cost: " + err.message);
    } finally {
      setSavingOverride(false);
    }
  };

  // =========================================================================
  // AGGREGATION & TOTALS
  // =========================================================================
  const totalRentalCost = useMemo(() => {
    return vendorRentals.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0);
  }, [vendorRentals]);

  // ✅ AFTER (Fixed)
const totalConsumablesCost = useMemo(() => {
  return freshConsumables.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0);
}, [freshConsumables]);

const totalFlowersCost = useMemo(() => {
  return flowerPurchases.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0);
}, [flowerPurchases]);

  const totalNewPurchasesCost = useMemo(() => {
    return newPurchases.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0);
  }, [newPurchases]);

  // Entertainment / SFX items
  const { weddingWideBudgetItems, eventWiseBudgetGroups, totalOtherItemsCost } = useMemo(() => {
    const costOverrides = handover?.budgeting?.costOverrides || {};
    const wwItems: any[] = [];
    const evGroups: any[] = [];
    let otherTotal = 0;

    if (!handover) return { weddingWideBudgetItems: [], eventWiseBudgetGroups: [], totalOtherItemsCost: 0 };

    // Wedding-Wide Essentials
    (handover.generalWeddingElements || []).forEach((item: any, idx: number) => {
      const itemKey = getItemKey(item, "ww", idx);
      const qty = Math.max(1, Number(item.quantity) || 1);
      const days = item.isDayApplicable ? Math.max(1, Number(item.days) || 1) : 1;
      const multiplier = qty * days;

      const override = costOverrides[itemKey];
      let buyingRate = 0;
      let subtotal = 0;
      let isOverridden = false;
      let isConfigured = false;

      if (override && override.totalCost !== undefined) {
        buyingRate = override.unitCost;
        subtotal = override.totalCost;
        isOverridden = true;
        isConfigured = true;
      } else {
        const masterRes = resolveMasterBuyingRate(item);
        buyingRate = masterRes.rate;
        subtotal = buyingRate * multiplier;
        isConfigured = masterRes.isConfigured;
      }

      otherTotal += subtotal;
      wwItems.push({
        ...item,
        key: itemKey,
        qty,
        days: item.isDayApplicable ? days : null,
        multiplier,
        buyingRate,
        totalCost: subtotal,
        isConfigured,
        isOverridden,
        scopeName: "Wedding-Wide Essentials",
      });
    });

    // Event-Wise
    (handover.days || []).forEach((day: any, dIdx: number) => {
      (day.events || []).forEach((ev: any, eIdx: number) => {
        const eventItems: any[] = [];
        let eventSubtotal = 0;

        (ev.entertainmentElements || []).forEach((item: any, iIdx: number) => {
          const itemKey = getItemKey(item, `ev_${dIdx}_${eIdx}`, iIdx);
          const qty = Math.max(1, Number(item.quantity) || 1);
          const days = item.isDayApplicable ? Math.max(1, Number(item.days) || 1) : 1;
          const multiplier = qty * days;

          const override = costOverrides[itemKey];
          let buyingRate = 0;
          let subtotal = 0;
          let isOverridden = false;
          let isConfigured = false;

          if (override && override.totalCost !== undefined) {
            buyingRate = override.unitCost;
            subtotal = override.totalCost;
            isOverridden = true;
            isConfigured = true;
          } else {
            const masterRes = resolveMasterBuyingRate(item);
            buyingRate = masterRes.rate;
            subtotal = buyingRate * multiplier;
            isConfigured = masterRes.isConfigured;
          }

          otherTotal += subtotal;
          eventSubtotal += subtotal;

          eventItems.push({
            ...item,
            key: itemKey,
            qty,
            days: item.isDayApplicable ? days : null,
            multiplier,
            buyingRate,
            totalCost: subtotal,
            isConfigured,
            isOverridden,
            scopeName: `${day.dayName || day.date} - ${ev.eventName}`,
          });
        });

        if (eventItems.length > 0) {
          evGroups.push({
            dayName: day.dayName || day.date,
            eventName: ev.eventName,
            location: ev.locationInResort,
            items: eventItems,
            subtotal: eventSubtotal,
          });
        }
      });
    });

    return { weddingWideBudgetItems: wwItems, eventWiseBudgetGroups: evGroups, totalOtherItemsCost: otherTotal };
  }, [handover, entertainmentCatalog]);

  // Labor & Operations
  const { totalLaborCost, laborItemsCalculated } = useMemo(() => {
    let laborSum = 0;
    const calculated: any[] = [];

    if (handover?.laborPlanning?.items) {
      const globalMeal = handover.laborPlanning.globalCostPerMeal || 150;
      const globalTravel = handover.laborPlanning.globalTravelCost || 800;

      handover.laborPlanning.items.forEach((item: any) => {
        if (item.headcount > 0) {
          const activeDays = (item.dayShifts || []).filter((d: any) => d.isActive);
          const shifts = item.headcount * activeDays.reduce((sum: number, d: any) => sum + Number(d.shifts || 0), 0);
          const shiftCost = shifts * (Number(item.ratePerShift) || 0);
          const foodCost = item.headcount * activeDays.length * (item.mealsPerDay || 3) * (item.costPerMeal || globalMeal);
          const travelCost = item.headcount * (item.travelCostPerPerson || globalTravel);
          const lineTotal = shiftCost + foodCost + travelCost;

          laborSum += lineTotal;
          calculated.push({
            ...item,
            activeDaysCount: activeDays.length,
            shiftsCount: shifts,
            totalCost: lineTotal,
          });
        }
      });
    }

    return { totalLaborCost: laborSum, laborItemsCalculated: calculated };
  }, [handover]);

  // GRAND TOTAL PRODUCTION BUDGET
  const grandTotalProductionCost =
    totalFlowersCost +
    totalConsumablesCost +
    totalRentalCost +
    totalOtherItemsCost +
    totalLaborCost +
    totalNewPurchasesCost;

  const clientRevenue = Number(handover?.closedDealAmount || handover?.quotation?.finalOfferedPrice) || 0;
  const projectedGrossProfit = clientRevenue - grandTotalProductionCost;
  const projectedMarginPercent = clientRevenue > 0
    ? Math.round((projectedGrossProfit / clientRevenue) * 100)
    : 0;

  // =========================================================================
  // CSV EXPORT UTILITIES (INDIVIDUAL & COMPLETE MASTER LIST)
  // =========================================================================
  const escapeCSV = (value: any) => {
    if (value === null || value === undefined) return '""';
    const stringValue = String(value).replace(/"/g, '""');
    return `"${stringValue}"`;
  };

  const downloadCSV = (filename: string, rows: (string | number)[][]) => {
    const csvContent = "\uFEFF" + rows.map((e) => e.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportFlowersCSV = () => {
    const weddingTitle = handover?.title || "Wedding";
    const rows: (string | number)[][] = [
      ["Wedding / Project", weddingTitle],
      ["Export Type", "Natural Flowers Procurement List"],
      ["Generated At", new Date().toLocaleString()],
      [],
      ["Flower Item", "Variety / Origin", "Color", "Unit", "Quantity", "Unit Rate (₹)", "Total Cost (₹)", "Sourcing Notes"],
    ];

    flowerPurchases.forEach((f) => {
      rows.push([f.name, f.variety || "—", f.color || "—", f.unit, f.quantity, f.unitCost, f.totalCost, f.notes || "—"]);
    });

    rows.push([]);
    rows.push(["", "", "", "", "", "TOTAL FLORALS COST", totalFlowersCost, ""]);
    downloadCSV(`${weddingTitle.replace(/\s+/g, "_")}_Flowers_List.csv`, rows);
  };

  const exportConsumablesCSV = () => {
    const weddingTitle = handover?.title || "Wedding";
    const rows: (string | number)[][] = [
      ["Wedding / Project", weddingTitle],
      ["Export Type", "Raw Materials & Consumables Purchase List"],
      ["Generated At", new Date().toLocaleString()],
      [],
      ["Material / Item Name", "Category", "Unit", "Quantity", "Approx Unit Rate (₹)", "Total Cost (₹)", "Remarks"],
    ];

    freshConsumables.forEach((c) => {
      rows.push([c.name, c.category, c.unit, c.quantity, c.unitCost, c.totalCost, c.notes || "—"]);
    });

    rows.push([]);
    rows.push(["", "", "", "", "TOTAL CONSUMABLES COST", totalConsumablesCost, ""]);
    downloadCSV(`${weddingTitle.replace(/\s+/g, "_")}_Consumables_List.csv`, rows);
  };

  const exportRentalsCSV = () => {
    const weddingTitle = handover?.title || "Wedding";
    const rows: (string | number)[][] = [
      ["Wedding / Project", weddingTitle],
      ["Export Type", "Vendor Rentals & Equipment Hire List"],
      ["Generated At", new Date().toLocaleString()],
      [],
      ["Vendor / Supplier", "Rental Item", "Size / Spec", "Unit", "Qty", "Days", "Daily/Unit Rate (₹)", "Total Rental (₹)", "Remarks"],
    ];

    vendorRentals.forEach((r) => {
      rows.push([
        r.vendorName,
        r.itemName,
        r.size || "Standard",
        r.pricingUnit,
        r.quantity,
        r.isDayApplicable ? r.days : 1,
        r.rate,
        r.totalCost,
        r.notes || "—",
      ]);
    });

    rows.push([]);
    rows.push(["", "", "", "", "", "", "TOTAL RENTALS COST", totalRentalCost, ""]);
    downloadCSV(`${weddingTitle.replace(/\s+/g, "_")}_Vendor_Rentals_List.csv`, rows);
  };

  const exportLaborCSV = () => {
    const weddingTitle = handover?.title || "Wedding";
    const rows: (string | number)[][] = [
      ["Wedding / Project", weddingTitle],
      ["Export Type", "Labor & Manpower Execution Plan"],
      ["Generated At", new Date().toLocaleString()],
      [],
      ["Role / Manpower Category", "Headcount", "Active Days", "Total Shifts", "Rate/Shift (₹)", "Total Calculated Cost (₹) (Shifts+Food+Travel)"],
    ];

    laborItemsCalculated.forEach((l) => {
      rows.push([l.name, l.headcount, l.activeDaysCount, l.shiftsCount, l.ratePerShift, l.totalCost]);
    });

    rows.push([]);
    rows.push(["", "", "", "", "TOTAL LABOR COST", totalLaborCost]);
    downloadCSV(`${weddingTitle.replace(/\s+/g, "_")}_Labor_List.csv`, rows);
  };

  const exportOtherItemsCSV = () => {
    const weddingTitle = handover?.title || "Wedding";
    const rows: (string | number)[][] = [
      ["Wedding / Project", weddingTitle],
      ["Export Type", "Other Items, SFX & Entertainment Procurement"],
      ["Generated At", new Date().toLocaleString()],
      [],
      ["Scope / Event", "Category", "Item Name", "Variant", "Qty", "Days", "Unit Rate (₹)", "Total Buying Cost (₹)"],
    ];

    weddingWideBudgetItems.forEach((it) => {
      rows.push([it.scopeName, it.category, it.name, it.variantName || "—", it.qty, it.days || "—", it.buyingRate, it.totalCost]);
    });

    eventWiseBudgetGroups.forEach((grp) => {
      grp.items.forEach((it: any) => {
        rows.push([`${grp.dayName} - ${grp.eventName}`, it.category, it.name, it.variantName || "—", it.qty, it.days || "—", it.buyingRate, it.totalCost]);
      });
    });

    rows.push([]);
    rows.push(["", "", "", "", "", "", "TOTAL OTHER/SFX COST", totalOtherItemsCost]);
    downloadCSV(`${weddingTitle.replace(/\s+/g, "_")}_SFX_Other_Items_List.csv`, rows);
  };

  const exportNewPurchasesCSV = () => {
    const weddingTitle = handover?.title || "Wedding";
    const rows: (string | number)[][] = [
      ["Wedding / Project", weddingTitle],
      ["Export Type", "New Capex / Wedding-Specific Asset Purchases"],
      ["Generated At", new Date().toLocaleString()],
      [],
      ["Item Name", "Category", "Material", "Size", "Quantity", "Unit Cost (₹)", "Total Cost (₹)", "Sourcing Notes"],
    ];

    newPurchases.forEach((p) => {
      rows.push([p.name, p.category, p.material || "—", p.size || "—", p.quantity, p.unitCost, p.totalCost, p.notes || "—"]);
    });

    rows.push([]);
    rows.push(["", "", "", "", "", "TOTAL CAPEX COST", totalNewPurchasesCost, ""]);
    downloadCSV(`${weddingTitle.replace(/\s+/g, "_")}_New_Purchases_List.csv`, rows);
  };

  // Complete All-in-One Master Budget CSV
  const exportCompleteMasterCSV = () => {
    const weddingTitle = handover?.title || "Wedding";
    const rows: (string | number)[][] = [
      ["================================================================================"],
      ["MASTER PRODUCTION BUDGET & PROCUREMENT SHEET"],
      ["Wedding / Project", weddingTitle],
      ["Client Deal Value", clientRevenue],
      ["Total Production Cost", grandTotalProductionCost],
      ["Projected Margin", `${projectedGrossProfit} (${projectedMarginPercent}%)`],
      ["Export Date", new Date().toLocaleString()],
      ["================================================================================"],
      [],
      ["SECTION", "ITEM / ROLE / SERVICE", "SUPPLIER / DETAILS / SPECS", "QTY", "UNIT / DURATION", "UNIT RATE (₹)", "TOTAL COST (₹)", "NOTES"],
    ];

    // 1. Flowers
    flowerPurchases.forEach((f) => {
      rows.push(["1. Natural Flowers", f.name, `${f.variety || ""} ${f.color ? `(${f.color})` : ""}`.trim(), f.quantity, f.unit, f.unitCost, f.totalCost, f.notes || ""]);
    });

    // 2. Consumables
    freshConsumables.forEach((c) => {
      rows.push(["2. Raw Consumables", c.name, c.category, c.quantity, c.unit, c.unitCost, c.totalCost, c.notes || ""]);
    });

    // 3. Rentals
    vendorRentals.forEach((r) => {
      rows.push([
        "3. Vendor Rentals",
        r.itemName,
        `Vendor: ${r.vendorName} ${r.size ? `| Size: ${r.size}` : ""}`,
        r.quantity,
        r.isDayApplicable ? `${r.days} Days` : r.pricingUnit,
        r.rate,
        r.totalCost,
        r.notes || "",
      ]);
    });

    // 4. Other Items / SFX
    weddingWideBudgetItems.forEach((it) => {
      rows.push(["4. SFX & Entertainment", it.name, `${it.scopeName} (${it.category})`, it.qty, it.days ? `${it.days} Days` : "Unit", it.buyingRate, it.totalCost, ""]);
    });
    eventWiseBudgetGroups.forEach((grp) => {
      grp.items.forEach((it: any) => {
        rows.push(["4. SFX & Entertainment", it.name, `${grp.dayName} - ${grp.eventName}`, it.qty, it.days ? `${it.days} Days` : "Unit", it.buyingRate, it.totalCost, ""]);
      });
    });

    // 5. Labor
    laborItemsCalculated.forEach((l) => {
      rows.push(["5. Labor & Operations", l.name, `${l.headcount} Pax over ${l.activeDaysCount} Days`, l.shiftsCount, "Shifts", l.ratePerShift, l.totalCost, "Includes Shift + Meals + Travel"]);
    });

    // 6. New Purchases
    newPurchases.forEach((p) => {
      rows.push(["6. New Purchases", p.name, `${p.category} | ${p.material || ""} | ${p.size || ""}`, p.quantity, "Pcs", p.unitCost, p.totalCost, p.notes || ""]);
    });

    rows.push([]);
    rows.push(["================================================================================"]);
    rows.push(["SUMMARY", "", "", "", "", "TOTAL PRODUCTION COST", grandTotalProductionCost, ""]);
    rows.push(["SUMMARY", "", "", "", "", "CLIENT CONTRACT VALUE", clientRevenue, ""]);
    rows.push(["SUMMARY", "", "", "", "", "PROJECTED GROSS PROFIT", projectedGrossProfit, `${projectedMarginPercent}% Margin`]);

    downloadCSV(`${weddingTitle.replace(/\s+/g, "_")}_Complete_Master_Budget.csv`, rows);
  };

  if (loading || loadingData || !handover) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center font-mono text-sm font-bold tracking-wider text-gray-500 uppercase">
        Compiling Production Budget & Procurement Lists...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 pb-20 print:bg-white print:p-0">
      
      {/* STICKY HEADER */}
      <div className="bg-white border-b-2 border-gray-300 shadow-sm sticky top-0 z-30 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={() => router.push(`/handovers/${handoverId}`)}
                className="text-xs font-bold text-gray-600 hover:text-black flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-md border transition"
              >
                ← Back to Handover
              </button>
              <span className="bg-blue-100 text-blue-900 text-[10px] font-black px-2 py-0.5 rounded border border-blue-300">
                LIVE PRODUCTION COSTING
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">
              Production Execution Budget
            </h1>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">
              Costing & Vendor Procurement for <strong>{handover.title}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportCompleteMasterCSV}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow transition flex items-center gap-1.5"
              title="Download All-in-One Master Bill of Quantities"
            >
              📥 Complete Master Budget CSV
            </button>
            <button
              onClick={() => window.print()}
              className="bg-gray-800 hover:bg-gray-900 text-white font-black px-4 py-2 rounded-lg text-xs shadow transition flex items-center gap-1.5"
            >
              🖨️ Print / PDF
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 space-y-6">

        {/* 1. FINANCIAL SUMMARY & P&L OVERVIEW */}
        <section className="bg-gray-900 text-white p-6 rounded-2xl shadow-sm print:bg-white print:text-black print:border-2 print:border-gray-900 print:break-inside-avoid">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-700 print:border-gray-300 pb-4 gap-4">
            <div>
              <span className="text-[10px] font-black uppercase text-blue-400 print:text-blue-700 tracking-widest">
                Internal Financial P&L Overview
              </span>
              <h2 className="text-2xl md:text-3xl font-black mt-1">Total Estimated Production Cost</h2>
            </div>
            <div className="text-right">
              <span className="text-3xl md:text-4xl font-mono font-black text-rose-400 print:text-rose-700">
                ₹{grandTotalProductionCost.toLocaleString()}
              </span>
            </div>
          </div>

          {clientRevenue > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4 bg-gray-800/80 p-3.5 rounded-xl border border-gray-700 font-mono text-xs">
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Client Contract Value:</span>
                <span className="text-lg font-black text-emerald-400">₹{clientRevenue.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Estimated Production Cost:</span>
                <span className="text-lg font-black text-rose-400">₹{grandTotalProductionCost.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Projected Gross Margin:</span>
                <span className={`text-lg font-black ${projectedGrossProfit >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                  ₹{projectedGrossProfit.toLocaleString()} ({projectedMarginPercent}%)
                </span>
              </div>
            </div>
          )}

          {/* 6 Cost Buckets Grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4 text-center">
            <div className="bg-gray-800/50 p-2.5 rounded-xl border border-gray-700">
              <p className="text-[10px] uppercase font-bold text-pink-300">Natural Flowers</p>
              <p className="text-base font-mono font-black mt-0.5">₹{totalFlowersCost.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800/50 p-2.5 rounded-xl border border-gray-700">
              <p className="text-[10px] uppercase font-bold text-teal-300">Consumables</p>
              <p className="text-base font-mono font-black mt-0.5">₹{totalConsumablesCost.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800/50 p-2.5 rounded-xl border border-gray-700">
              <p className="text-[10px] uppercase font-bold text-indigo-300">Vendor Rentals</p>
              <p className="text-base font-mono font-black mt-0.5">₹{totalRentalCost.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800/50 p-2.5 rounded-xl border border-gray-700">
              <p className="text-[10px] uppercase font-bold text-purple-300">Other & SFX</p>
              <p className="text-base font-mono font-black mt-0.5 text-purple-400">₹{totalOtherItemsCost.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800/50 p-2.5 rounded-xl border border-gray-700">
              <p className="text-[10px] uppercase font-bold text-amber-300">Labor / Ops</p>
              <p className="text-base font-mono font-black mt-0.5 text-amber-400">₹{totalLaborCost.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800/50 p-2.5 rounded-xl border border-gray-700">
              <p className="text-[10px] uppercase font-bold text-blue-300">New Purchases</p>
              <p className="text-base font-mono font-black mt-0.5 text-blue-400">₹{totalNewPurchasesCost.toLocaleString()}</p>
            </div>
          </div>
        </section>

        {/* 2. NATURAL FLOWERS PROCUREMENT */}
        <section className="bg-white border-2 border-pink-300 rounded-2xl p-6 shadow-sm space-y-4 print-avoid-break">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-pink-200 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase text-pink-700 block tracking-wider">
                Floral Mandi Procurement
              </span>
              <h3 className="text-xl font-black text-gray-900">1. Natural Flowers</h3>
              <p className="text-xs text-gray-500">
                Selected from Natural Flowers Library with live Mandi base rates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-black font-mono text-pink-900 bg-pink-50 border border-pink-200 px-3 py-1.5 rounded-lg">
                Subtotal: ₹{totalFlowersCost.toLocaleString()}
              </span>
              <button
                onClick={exportFlowersCSV}
                className="bg-pink-100 hover:bg-pink-200 text-pink-900 font-bold px-3 py-1.5 rounded-lg text-xs border border-pink-300 transition print:hidden"
              >
                📥 Export Flowers CSV
              </button>
              <button
                onClick={() => setShowFlowerModal(true)}
                className="bg-pink-700 hover:bg-pink-800 text-white font-black px-4 py-1.5 rounded-lg text-xs shadow transition print:hidden"
              >
                + Add Flower
              </button>
            </div>
          </div>

          <div className="border border-pink-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-pink-50 text-[10px] font-black uppercase text-pink-950 border-b border-pink-200">
                <tr>
                  <th className="p-3">Flower & Variety</th>
                  <th className="p-3">Color</th>
                  <th className="p-3 text-center">Quantity & Unit</th>
                  <th className="p-3 text-right">Unit Rate (₹)</th>
                  <th className="p-3 text-right">Total (₹)</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3 text-center print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {flowerPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 font-bold italic">
                      No flowers added for this wedding yet. Click &quot;+ Add Flower&quot; to pick from your flowers catalog.
                    </td>
                  </tr>
                ) : (
                  flowerPurchases.map((fl) => (
                    <tr key={fl.id} className="hover:bg-pink-50/40">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {fl.imageUrl && (
                            <img src={fl.imageUrl} alt={fl.name} className="w-8 h-8 rounded object-cover border" />
                          )}
                          <div>
                            <span className="font-bold text-gray-900 text-sm">🌸 {fl.name}</span>
                            {fl.variety && <span className="text-[10px] text-gray-500 block font-semibold">{fl.variety}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-gray-600 font-semibold">{fl.color || "—"}</td>
                      <td className="p-3 text-center font-bold text-gray-800">
                        {fl.quantity} {fl.unit}
                      </td>
                      <td className="p-3 text-right font-bold text-gray-700">₹{fl.unitCost.toLocaleString()}</td>
                      <td className="p-3 text-right font-black text-pink-950 text-sm">₹{fl.totalCost.toLocaleString()}</td>
                      <td className="p-3 text-gray-500 text-[11px] max-w-xs">{fl.notes || "—"}</td>
                      <td className="p-3 text-center print:hidden">
                        <button
                          onClick={() => handleDeleteFlower(fl.id, fl.name)}
                          className="text-red-600 hover:text-red-800 font-bold hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. FRESH CONSUMABLES & RAW MATERIALS */}
        <section className="bg-white border-2 border-teal-300 rounded-2xl p-6 shadow-sm space-y-4 print-avoid-break">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-teal-200 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase text-teal-700 block tracking-wider">
                Raw Materials & Consumables
              </span>
              <h3 className="text-xl font-black text-gray-900">2. Fresh Consumables</h3>
              <p className="text-xs text-gray-500">
                Selected from Fresh Consumables Library (Flex, Thermocol, Fabrics, Wooden battens).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-black font-mono text-teal-900 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg">
                Subtotal: ₹{totalConsumablesCost.toLocaleString()}
              </span>
              <button
                onClick={exportConsumablesCSV}
                className="bg-teal-100 hover:bg-teal-200 text-teal-900 font-bold px-3 py-1.5 rounded-lg text-xs border border-teal-300 transition print:hidden"
              >
                📥 Export Consumables CSV
              </button>
              <button
                onClick={() => setShowConsumableModal(true)}
                className="bg-teal-700 hover:bg-teal-800 text-white font-black px-4 py-1.5 rounded-lg text-xs shadow transition print:hidden"
              >
                + Add Consumable
              </button>
            </div>
          </div>

          <div className="border border-teal-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-teal-50 text-[10px] font-black uppercase text-teal-950 border-b border-teal-200">
                <tr>
                  <th className="p-3">Category</th>
                  <th className="p-3">Consumable Material</th>
                  <th className="p-3 text-center">Quantity & Unit</th>
                  <th className="p-3 text-right">Approx Rate (₹)</th>
                  <th className="p-3 text-right">Total (₹)</th>
                  <th className="p-3">Sourcing Notes</th>
                  <th className="p-3 text-center print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {freshConsumables.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 font-bold italic">
                      No consumables added yet. Click &quot;+ Add Consumable&quot; to pick from your materials library.
                    </td>
                  </tr>
                ) : (
                  freshConsumables.map((c) => (
                    <tr key={c.id} className="hover:bg-teal-50/40">
                      <td className="p-3">
                        <span className="text-[10px] font-black uppercase bg-teal-100 text-teal-900 px-2 py-0.5 rounded border border-teal-200">
                          {c.category}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-gray-900 text-sm">✨ {c.name}</td>
                      <td className="p-3 text-center font-bold text-gray-800">
                        {c.quantity} {c.unit}
                      </td>
                      <td className="p-3 text-right font-bold text-gray-700">₹{c.unitCost.toLocaleString()}</td>
                      <td className="p-3 text-right font-black text-teal-950 text-sm">₹{c.totalCost.toLocaleString()}</td>
                      <td className="p-3 text-gray-500 text-[11px] max-w-xs">{c.notes || "—"}</td>
                      <td className="p-3 text-center print:hidden">
                        <button
                          onClick={() => handleDeleteConsumable(c.id, c.name)}
                          className="text-red-600 hover:text-red-800 font-bold hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. VENDOR RENTALS & EQUIPMENT HIRE */}
        <section className="bg-white border-2 border-indigo-300 rounded-2xl p-6 shadow-sm space-y-4 print-avoid-break">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-indigo-200 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase text-indigo-700 block tracking-wider">
                External Gear & Structures Hire
              </span>
              <h3 className="text-xl font-black text-gray-900">3. Vendor Rentals</h3>
              <p className="text-xs text-gray-500">
                Selected from Vendor Rentals Library with auto-calculated duration and daily multipliers.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-black font-mono text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg">
                Subtotal: ₹{totalRentalCost.toLocaleString()}
              </span>
              <button
                onClick={exportRentalsCSV}
                className="bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-bold px-3 py-1.5 rounded-lg text-xs border border-indigo-300 transition print:hidden"
              >
                📥 Export Rentals CSV
              </button>
              <button
                onClick={() => setShowRentalModal(true)}
                className="bg-indigo-700 hover:bg-indigo-800 text-white font-black px-4 py-1.5 rounded-lg text-xs shadow transition print:hidden"
              >
                + Add Rental Item
              </button>
            </div>
          </div>

          <div className="border border-indigo-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-indigo-50 text-[10px] font-black uppercase text-indigo-950 border-b border-indigo-200">
                <tr>
                  <th className="p-3">Supplier / Vendor</th>
                  <th className="p-3">Rental Item & Spec</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-center">Duration</th>
                  <th className="p-3 text-right">Rental Rate (₹)</th>
                  <th className="p-3 text-right">Total Rental (₹)</th>
                  <th className="p-3">Remarks</th>
                  <th className="p-3 text-center print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {vendorRentals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-400 font-bold italic">
                      No vendor rental items added yet. Click &quot;+ Add Rental Item&quot; to pick from your suppliers.
                    </td>
                  </tr>
                ) : (
                  vendorRentals.map((r) => (
                    <tr key={r.id} className="hover:bg-indigo-50/40">
                      <td className="p-3 font-bold text-indigo-900">{r.vendorName}</td>
                      <td className="p-3">
                        <span className="font-bold text-gray-900 text-sm">🚚 {r.itemName}</span>
                        {r.size && <span className="text-[10px] text-gray-500 block font-semibold">{r.size}</span>}
                      </td>
                      <td className="p-3 text-center font-bold text-gray-800">
                        {r.quantity} {r.pricingUnit}
                      </td>
                      <td className="p-3 text-center font-bold text-purple-900">
                        {r.isDayApplicable ? `${r.days} Day(s)` : "—"}
                      </td>
                      <td className="p-3 text-right font-bold text-gray-700">₹{r.rate.toLocaleString()}</td>
                      <td className="p-3 text-right font-black text-indigo-950 text-sm">₹{r.totalCost.toLocaleString()}</td>
                      <td className="p-3 text-gray-500 text-[11px] max-w-xs">{r.notes || "—"}</td>
                      <td className="p-3 text-center print:hidden">
                        <button
                          onClick={() => handleDeleteRental(r.id, r.itemName)}
                          className="text-red-600 hover:text-red-800 font-bold hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. OTHER ITEMS & SFX BUYING COST BREAKDOWN */}
        <section className="bg-white border-2 border-purple-300 rounded-2xl p-6 shadow-sm space-y-6 print-avoid-break">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-purple-200 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase text-purple-700 block tracking-wider">
                Internal Entertainment & SFX Buying
              </span>
              <h3 className="text-xl font-black text-gray-900">4. Other Items & SFX Costing</h3>
              <p className="text-xs text-gray-500">
                Default rates fetched from Vendor Costs Master. Click <strong>✎</strong> to override rates for this specific wedding.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black font-mono text-purple-900 bg-purple-100 px-3 py-1.5 rounded-lg">
                Subtotal: ₹{totalOtherItemsCost.toLocaleString()}
              </span>
              <button
                onClick={exportOtherItemsCSV}
                className="bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold px-3 py-1.5 rounded-lg text-xs border border-purple-300 transition print:hidden"
              >
                📥 Export SFX CSV
              </button>
            </div>
          </div>

          {/* Wedding-Wide Items Table */}
          {weddingWideBudgetItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase text-purple-950 flex items-center gap-1.5">
                <span>🌐 Wedding-Wide Essentials Costing</span>
              </h4>
              <div className="border border-purple-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-purple-50 text-[10px] font-black uppercase text-purple-900 border-b border-purple-200">
                    <tr>
                      <th className="p-3">Category</th>
                      <th className="p-3">Item Name & Variant</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-center">Duration</th>
                      <th className="p-3 text-right">Vendor Buying Rate</th>
                      <th className="p-3 text-right">Total Buying Cost</th>
                      <th className="p-3 text-center print:hidden">Adjust Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {weddingWideBudgetItems.map((it) => (
                      <tr key={it.key} className="hover:bg-purple-50/40">
                        <td className="p-3 text-gray-600">{it.category}</td>
                        <td className="p-3">
                          <span className="font-bold text-gray-900">📦 {it.name}</span>
                          {it.variantName && <span className="text-purple-800 ml-1.5 font-bold">({it.variantName})</span>}
                          {it.isOverridden && (
                            <span className="ml-2 bg-purple-100 text-purple-900 border border-purple-300 text-[9px] px-1.5 py-0.5 rounded font-black">
                              🏷️ Custom Deal
                            </span>
                          )}
                          {!it.isConfigured && (
                            <span className="ml-2 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] px-1.5 py-0.5 rounded font-bold">
                              ⚠️ Cost Missing
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center font-bold">
                          {it.qty} {(!it.pricingUnit || it.pricingUnit.toLowerCase().includes("pc")) ? it.name : it.pricingUnit}
                        </td>
                        <td className="p-3 text-center font-bold text-purple-900">
                          {it.isDayApplicable ? `${it.days} Day(s)` : "—"}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-gray-800">
                          <div className="flex items-center justify-end gap-1.5">
                            <span>₹{it.buyingRate.toLocaleString()}</span>
                            <button
                              type="button"
                              onClick={() => openEditCostModal(it, "rate")}
                              className="text-gray-400 hover:text-purple-700 text-xs px-1 hover:bg-purple-100 rounded transition print:hidden"
                              title="Edit Vendor Rate"
                            >
                              ✎
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-purple-950">
                          <div className="flex items-center justify-end gap-1.5">
                            <span>₹{it.totalCost.toLocaleString()}</span>
                            <button
                              type="button"
                              onClick={() => openEditCostModal(it, "total")}
                              className="text-gray-400 hover:text-purple-700 text-xs px-1 hover:bg-purple-100 rounded transition print:hidden"
                              title="Edit Total Cost"
                            >
                              ✎
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() => openEditCostModal(it, "rate")}
                            className="text-[10px] bg-purple-50 hover:bg-purple-200 text-purple-900 font-bold px-2 py-1 rounded border border-purple-200 transition"
                          >
                            Modify
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Event-Wise Items */}
          {eventWiseBudgetGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                <span className="text-xs font-black text-gray-900 uppercase">
                  🗓️ {group.dayName} — {group.eventName} {group.location ? `(${group.location})` : ""}
                </span>
                <span className="text-xs font-black font-mono text-purple-900">
                  Event Total: ₹{group.subtotal.toLocaleString()}
                </span>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-gray-100 text-[10px] font-black uppercase text-gray-700 border-b border-gray-200">
                    <tr>
                      <th className="p-3">Category</th>
                      <th className="p-3">Item Name & Variant</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-center">Duration</th>
                      <th className="p-3 text-right">Vendor Buying Rate</th>
                      <th className="p-3 text-right">Total Buying Cost</th>
                      <th className="p-3 text-center print:hidden">Adjust Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {group.items.map((it: any) => (
                      <tr key={it.key} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-600">{it.category}</td>
                        <td className="p-3">
                          <span className="font-bold text-gray-900">🎤 {it.name}</span>
                          {it.variantName && <span className="text-purple-800 ml-1.5 font-bold">({it.variantName})</span>}
                          {it.isOverridden && (
                            <span className="ml-2 bg-purple-100 text-purple-900 border border-purple-300 text-[9px] px-1.5 py-0.5 rounded font-black">
                              🏷️ Custom Deal
                            </span>
                          )}
                          {!it.isConfigured && (
                            <span className="ml-2 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] px-1.5 py-0.5 rounded font-bold">
                              ⚠️ Cost Missing
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center font-bold">
                          {it.qty} {(!it.pricingUnit || it.pricingUnit.toLowerCase().includes("pc")) ? it.name : it.pricingUnit}
                        </td>
                        <td className="p-3 text-center font-bold text-purple-900">
                          {it.isDayApplicable ? `${it.days} Day(s)` : "—"}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-gray-800">
                          <div className="flex items-center justify-end gap-1.5">
                            <span>₹{it.buyingRate.toLocaleString()}</span>
                            <button
                              type="button"
                              onClick={() => openEditCostModal(it, "rate")}
                              className="text-gray-400 hover:text-purple-700 text-xs px-1 hover:bg-purple-100 rounded transition print:hidden"
                              title="Edit Vendor Rate"
                            >
                              ✎
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-purple-950">
                          <div className="flex items-center justify-end gap-1.5">
                            <span>₹{it.totalCost.toLocaleString()}</span>
                            <button
                              type="button"
                              onClick={() => openEditCostModal(it, "total")}
                              className="text-gray-400 hover:text-purple-700 text-xs px-1 hover:bg-purple-100 rounded transition print:hidden"
                              title="Edit Total Cost"
                            >
                              ✎
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() => openEditCostModal(it, "rate")}
                            className="text-[10px] bg-purple-50 hover:bg-purple-200 text-purple-900 font-bold px-2 py-1 rounded border border-purple-200 transition"
                          >
                            Modify
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {weddingWideBudgetItems.length === 0 && eventWiseBudgetGroups.length === 0 && (
            <p className="text-center py-6 text-gray-400 font-bold text-xs italic">
              No entertainment or other items assigned to this wedding.
            </p>
          )}
        </section>

        {/* 6. LABOR & OPERATIONS BREAKDOWN */}
        <section className="bg-white border-2 border-amber-300 rounded-2xl p-5 shadow-sm print-avoid-break">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-amber-200 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase text-amber-800 block tracking-wider">
                Manpower Execution
              </span>
              <h3 className="text-xl font-black text-amber-950">5. Labor & Operations</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-black text-amber-900 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                Subtotal: ₹{totalLaborCost.toLocaleString()}
              </span>
              <button
                onClick={exportLaborCSV}
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-3 py-1.5 rounded-lg text-xs border border-amber-300 transition print:hidden"
              >
                📥 Export Labor CSV
              </button>
            </div>
          </div>

          <div className="pt-3 space-y-2">
            {laborItemsCalculated.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-xs bg-gray-50 p-2.5 rounded-lg border font-mono">
                <span className="font-bold text-gray-900">
                  👷 {item.headcount}x {item.name} ({item.shiftsCount} total shifts across {item.activeDaysCount} active days)
                </span>
                <span className="font-bold text-amber-900">₹{item.totalCost.toLocaleString()}</span>
              </div>
            ))}
            {laborItemsCalculated.length === 0 && (
              <p className="text-xs text-gray-500 italic">No labor planner configured yet.</p>
            )}
          </div>
        </section>

        {/* 7. NEW PURCHASES (CAPEX ASSETS) */}
        <section className="bg-white border-2 border-blue-300 rounded-2xl p-6 shadow-sm space-y-4 print-avoid-break">
          <div className="flex justify-between items-center border-b border-blue-200 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase text-blue-700 block tracking-wider">
                Capital Expenditure / Asset Procurement
              </span>
              <h2 className="text-xl font-black text-gray-900">
                6. New Purchases Specifically for this Wedding
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black font-mono text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
                Total: ₹{totalNewPurchasesCost.toLocaleString()}
              </span>
              <button
                onClick={exportNewPurchasesCSV}
                className="bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold px-3 py-1.5 rounded-lg text-xs border border-blue-300 transition print:hidden"
              >
                📥 Export Purchases CSV
              </button>
              <button
                onClick={() => setShowPurchaseModal(true)}
                className="bg-blue-700 hover:bg-blue-800 text-white font-black px-4 py-1.5 rounded-lg text-xs shadow print:hidden"
              >
                + Add New Purchase
              </button>
            </div>
          </div>

          {newPurchases.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {newPurchases.map((item) => (
                <div key={item.id} className="border-2 border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="h-40 bg-gray-100 relative">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs font-bold text-gray-400">No Image</div>
                      )}
                      <span className="absolute top-2 left-2 bg-blue-100 text-blue-900 text-[10px] font-black px-2 py-0.5 rounded border border-blue-200">
                        {item.category}
                      </span>
                    </div>

                    <div className="p-3 space-y-1.5">
                      <h4 className="font-black text-sm text-gray-900">{item.name}</h4>
                      <div className="flex flex-wrap gap-1">
                        {item.material && <span className="bg-gray-100 text-gray-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border">🧵 {item.material}</span>}
                        {item.size && <span className="bg-gray-100 text-gray-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border">📐 {item.size}</span>}
                      </div>
                      <p className="text-[11px] text-gray-500 font-semibold pt-1">
                        Cost: ₹{item.unitCost.toLocaleString()} × {item.quantity} = <strong className="text-blue-800">₹{item.totalCost.toLocaleString()}</strong>
                      </p>
                      {item.notes && <p className="text-[10px] text-amber-800 italic mt-1 bg-amber-50 p-1 rounded border border-amber-200">Note: {item.notes}</p>}
                    </div>
                  </div>

                  <div className="p-2 border-t bg-gray-50 text-right print:hidden">
                    <button
                      onClick={() => handleDeletePurchase(item.id, item.name)}
                      className="text-red-600 font-bold hover:underline text-xs"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400 font-bold text-sm bg-gray-50 rounded-xl border border-dashed">
              No new purchases configured for this wedding.
            </div>
          )}
        </section>

      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD RENTAL ITEM FROM LIBRARY */}
      {/* ========================================================================= */}
      {showRentalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border-2 border-indigo-400 shadow-2xl space-y-4 font-sans text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-indigo-950 uppercase">
                Add Vendor Rental Gear
              </h3>
              <button onClick={() => setShowRentalModal(false)} className="text-gray-400 hover:text-black font-black text-lg">✕</button>
            </div>

            <form onSubmit={handleSaveRental} className="space-y-3">
              <div>
                <label className="block font-black text-indigo-950 mb-1 uppercase">
                  ⚡ Pick from Master Rentals Library (Optional)
                </label>
                <select
                  value={selectedRentalLibId}
                  onChange={(e) => handleSelectRentalLibraryItem(e.target.value)}
                  className="w-full border-2 border-indigo-300 p-2 rounded-lg font-bold bg-indigo-50/50"
                >
                  <option value="">-- Choose from catalog or enter manually below --</option>
                  {rentalsLibrary.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.vendorName} → {r.itemName} {r.size ? `(${r.size})` : ""} - ₹{r.rate}/{r.pricingUnit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1">Supplier / Vendor Name *</label>
                  <input
                    required
                    placeholder="e.g. Modern Trussing Co."
                    value={rentalVendorName}
                    onChange={(e) => setRentalVendorName(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="block font-black text-gray-800 mb-1">Rental Item Name *</label>
                  <input
                    required
                    placeholder="e.g. Truss 20x10ft, Ghost Chair"
                    value={rentalItemName}
                    onChange={(e) => setRentalItemName(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1">Size / Dimension Spec</label>
                  <input
                    placeholder="e.g. 20x10 ft, 15kVA"
                    value={rentalSize}
                    onChange={(e) => setRentalSize(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="block font-black text-gray-800 mb-1">Pricing Unit</label>
                  <input
                    placeholder="e.g. Per Pc, Per Event"
                    value={rentalUnit}
                    onChange={(e) => setRentalUnit(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                <div>
                  <label className="block font-black text-indigo-950 mb-1">Rental Rate (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={rentalRate}
                    onChange={(e) => setRentalRate(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border-2 border-indigo-300 p-2 rounded-lg font-black text-right bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-black text-indigo-950 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={rentalQty}
                    onChange={(e) => setRentalQty(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border-2 border-indigo-300 p-2 rounded-lg font-bold text-center bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-black text-indigo-950 mb-1">Days</label>
                  <input
                    type="number"
                    min="1"
                    disabled={!rentalIsDayApplicable}
                    value={rentalIsDayApplicable ? rentalDays : 1}
                    onChange={(e) => setRentalDays(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border-2 border-indigo-300 p-2 rounded-lg font-bold text-center bg-white disabled:bg-gray-100 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rentalDayCheck"
                  checked={rentalIsDayApplicable}
                  onChange={(e) => setRentalIsDayApplicable(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="rentalDayCheck" className="font-bold text-indigo-900 cursor-pointer">
                  Multiply total rate per day?
                </label>
              </div>

              <div>
                <label className="block font-black text-gray-800 mb-1">Remarks / Location Note</label>
                <input
                  placeholder="e.g. Sangeet stage, delivery 1 day before"
                  value={rentalNotes}
                  onChange={(e) => setRentalNotes(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white"
                />
              </div>

              <div className="flex justify-between items-center pt-3 border-t">
                <span className="font-mono font-black text-indigo-950 text-sm">
                  Subtotal: ₹{((Number(rentalRate) || 0) * (Number(rentalQty) || 1) * (rentalIsDayApplicable ? (Number(rentalDays) || 1) : 1)).toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowRentalModal(false)} className="px-4 py-2 border font-bold rounded-lg">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingRental}
                    className="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-black rounded-lg shadow"
                  >
                    {submittingRental ? "Saving..." : "Add Rental"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD CONSUMABLE ITEM FROM LIBRARY */}
      {/* ========================================================================= */}
      {showConsumableModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border-2 border-teal-400 shadow-2xl space-y-4 font-sans text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-teal-950 uppercase">
                Add Fresh Consumable / Raw Material
              </h3>
              <button onClick={() => setShowConsumableModal(false)} className="text-gray-400 hover:text-black font-black text-lg">✕</button>
            </div>

            <form onSubmit={handleSaveConsumable} className="space-y-3">
              <div>
                <label className="block font-black text-teal-950 mb-1 uppercase">
                  ⚡ Pick from Fresh Consumables Library (Optional)
                </label>
                <select
                  value={selectedConsumableLibId}
                  onChange={(e) => handleSelectConsumableLibraryItem(e.target.value)}
                  className="w-full border-2 border-teal-300 p-2 rounded-lg font-bold bg-teal-50/50"
                >
                  <option value="">-- Choose from materials catalog or enter manually --</option>
                  {consumablesLibrary.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.category}] {c.name} - ₹{c.approxPrice}/{c.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-black text-gray-800 mb-1">Item Name *</label>
                <input
                  required
                  placeholder="e.g. Thermocol Sheets 2-inch, Flex 340gsm"
                  value={consumableName}
                  onChange={(e) => setConsumableName(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1">Category</label>
                  <input
                    placeholder="e.g. Flex & Printing, Hardware"
                    value={consumableCategory}
                    onChange={(e) => setConsumableCategory(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="block font-black text-gray-800 mb-1">Pricing Unit</label>
                  <input
                    placeholder="e.g. Per Meter, Per Sheet"
                    value={consumableUnit}
                    onChange={(e) => setConsumableUnit(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-teal-50 p-3 rounded-xl border border-teal-200">
                <div>
                  <label className="block font-black text-teal-950 mb-1">Unit Rate (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={consumableRate}
                    onChange={(e) => setConsumableRate(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border-2 border-teal-300 p-2 rounded-lg font-black text-right bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-black text-teal-950 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={consumableQty}
                    onChange={(e) => setConsumableQty(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border-2 border-teal-300 p-2 rounded-lg font-bold text-center bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-gray-800 mb-1">Sourcing Notes / Vendor Info</label>
                <input
                  placeholder="e.g. Sadar Bazar supplier, order 2 days before"
                  value={consumableNotes}
                  onChange={(e) => setConsumableNotes(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white"
                />
              </div>

              <div className="flex justify-between items-center pt-3 border-t">
                <span className="font-mono font-black text-teal-950 text-sm">
                  Subtotal: ₹{((Number(consumableRate) || 0) * (Number(consumableQty) || 1)).toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowConsumableModal(false)} className="px-4 py-2 border font-bold rounded-lg">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingConsumable}
                    className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white font-black rounded-lg shadow"
                  >
                    {submittingConsumable ? "Saving..." : "Add Consumable"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADD FLOWER ITEM FROM LIBRARY */}
      {/* ========================================================================= */}
      {showFlowerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border-2 border-pink-400 shadow-2xl space-y-4 font-sans text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-pink-950 uppercase">
                Add Natural Flowers for this Wedding
              </h3>
              <button onClick={() => setShowFlowerModal(false)} className="text-gray-400 hover:text-black font-black text-lg">✕</button>
            </div>

            <form onSubmit={handleSaveFlower} className="space-y-3">
              <div>
                <label className="block font-black text-pink-950 mb-1 uppercase">
                  ⚡ Pick from Natural Flowers Library (Optional)
                </label>
                <select
                  value={selectedFlowerLibId}
                  onChange={(e) => handleSelectFlowerLibraryItem(e.target.value)}
                  className="w-full border-2 border-pink-300 p-2 rounded-lg font-bold bg-pink-50/50"
                >
                  <option value="">-- Choose from floral catalog or enter manually --</option>
                  {flowersLibrary.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.variety ? `(${f.variety})` : ""} {f.color ? `[${f.color}]` : ""} - ₹{f.approxPrice}/{f.unit}
                    </option>
                  ))}
                </select>
              </div>

              {flowerImageUrl && (
                <div className="flex items-center gap-3 p-2 bg-pink-50 rounded-xl border border-pink-200">
                  <img src={flowerImageUrl} alt={flowerName} className="w-12 h-12 rounded object-cover border" />
                  <span className="text-[11px] font-bold text-pink-900">Reference Photo Attached from Library</span>
                </div>
              )}

              <div>
                <label className="block font-black text-gray-800 mb-1">Flower Name *</label>
                <input
                  required
                  placeholder="e.g. Dutch Red Rose, Marigold, Carnation"
                  value={flowerName}
                  onChange={(e) => setFlowerName(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1">Variety / Origin</label>
                  <input
                    placeholder="e.g. Dutch, Desi, Imported"
                    value={flowerVariety}
                    onChange={(e) => setFlowerVariety(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="block font-black text-gray-800 mb-1">Color / Shade</label>
                  <input
                    placeholder="e.g. Dark Red, Peach, Yellow"
                    value={flowerColor}
                    onChange={(e) => setFlowerColor(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-pink-50 p-3 rounded-xl border border-pink-200">
                <div>
                  <label className="block font-black text-pink-950 mb-1">Unit</label>
                  <input
                    placeholder="Per Bunch, Per Kg"
                    value={flowerUnit}
                    onChange={(e) => setFlowerUnit(e.target.value)}
                    className="w-full border-2 border-pink-300 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="block font-black text-pink-950 mb-1">Rate (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={flowerRate}
                    onChange={(e) => setFlowerRate(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border-2 border-pink-300 p-2 rounded-lg font-black text-right bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-black text-pink-950 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={flowerQty}
                    onChange={(e) => setFlowerQty(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border-2 border-pink-300 p-2 rounded-lg font-bold text-center bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-gray-800 mb-1">Procurement Notes / Arrangement Scope</label>
                <input
                  placeholder="e.g. For Varmala and Mandap, purchase morning of wedding"
                  value={flowerNotes}
                  onChange={(e) => setFlowerNotes(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white"
                />
              </div>

              <div className="flex justify-between items-center pt-3 border-t">
                <span className="font-mono font-black text-pink-950 text-sm">
                  Subtotal: ₹{((Number(flowerRate) || 0) * (Number(flowerQty) || 1)).toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowFlowerModal(false)} className="px-4 py-2 border font-bold rounded-lg">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingFlower}
                    className="px-5 py-2 bg-pink-700 hover:bg-pink-800 text-white font-black rounded-lg shadow"
                  >
                    {submittingFlower ? "Saving..." : "Add Flowers"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ADD NEW PURCHASE (CAPEX) */}
      {/* ========================================================================= */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border-2 border-blue-400 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-lg font-black text-gray-900">Add New Purchase Item</h3>
              <button onClick={() => setShowPurchaseModal(false)} className="text-gray-500 font-black text-xl hover:text-black">✕</button>
            </div>

            <form onSubmit={handleAddNewPurchase} className="space-y-3 text-xs">
              <div>
                <label className="block font-black text-gray-800 mb-1">Item Name *</label>
                <input required placeholder="e.g. Custom Neon Sign, Velvet Sofa" value={purchaseName} onChange={(e) => setPurchaseName(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1">Category</label>
                  <select value={purchaseCategory} onChange={(e) => setPurchaseCategory(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white">
                    <option value="Props & Structures">Props & Structures</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Fabrics & Drapes">Fabrics & Drapes</option>
                    <option value="Florals & Vases">Florals & Vases</option>
                    <option value="Custom Signages">Custom Signages</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-black text-gray-800 mb-1">Image Reference</label>
                  <input type="file" accept="image/*" onChange={(e) => setPurchaseImageFile(e.target.files ? e.target.files[0] : null)} className="w-full border-2 border-gray-300 p-1.5 rounded-lg font-bold bg-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1">Material</label>
                  <input placeholder="e.g. Wood, Velvet, Acrylic" value={purchaseMaterial} onChange={(e) => setPurchaseMaterial(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white" />
                </div>
                <div>
                  <label className="block font-black text-gray-800 mb-1">Size / Dimensions</label>
                  <input placeholder="e.g. 8x4 ft" value={purchaseSize} onChange={(e) => setPurchaseSize(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-blue-50 p-3 rounded-xl border border-blue-200">
                <div>
                  <label className="block font-black text-blue-950 mb-1">Quantity *</label>
                  <input type="number" min="1" required value={purchaseQty} onChange={(e) => setPurchaseQty(Number(e.target.value))} className="w-full border-2 border-blue-300 p-2 rounded-lg font-bold text-center bg-white" />
                </div>
                <div>
                  <label className="block font-black text-blue-950 mb-1">Unit Cost (₹) *</label>
                  <input type="number" min="0" required value={purchaseCost || ""} onChange={(e) => setPurchaseCost(Number(e.target.value))} className="w-full border-2 border-blue-300 p-2 rounded-lg font-bold text-right bg-white" />
                </div>
              </div>

              <div>
                <label className="block font-black text-gray-800 mb-1">Sourcing Notes / Vendor Info</label>
                <input placeholder="e.g. Buy from Chandni Chowk vendor" value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowPurchaseModal(false)} className="px-4 py-1.5 border font-bold rounded-lg text-xs">Cancel</button>
                <button type="submit" disabled={submittingPurchase} className="px-5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-black rounded-lg shadow disabled:opacity-50">
                  {submittingPurchase ? "Saving..." : "Save Purchase Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: DYNAMIC COST ADJUSTMENT (SFX & OTHER ITEMS) */}
      {/* ========================================================================= */}
      {showEditCostModal && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm font-mono">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-purple-500 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="text-base font-black text-gray-900 uppercase">
                  Modify Costing for this Wedding
                </h3>
                <p className="text-[11px] text-gray-500">
                  {editingItem.name} {editingItem.variantName ? `(${editingItem.variantName})` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditCostModal(false)}
                className="text-gray-400 hover:text-black font-black text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCostOverride} className="space-y-4 text-xs">
              <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 text-purple-950 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold uppercase text-purple-700 block">Scope</span>
                  <span className="font-bold">{editingItem.scopeName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-purple-700 block">Calculation Factor</span>
                  <span className="font-bold">
                    {editingItem.qty} {editingItem.unit || "unit(s)"} {editingItem.days ? `× ${editingItem.days} day(s)` : ""} ={" "}
                    <strong className="text-purple-900">{editingItem.multiplier} Multiplier Unit(s)</strong>
                  </span>
                </div>
              </div>

              <div className="space-y-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">
                    1. Vendor Buying Rate (₹ per unit/day)
                  </label>
                  <input
                    ref={rateInputRef}
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="e.g. 4000"
                    value={editUnitRate}
                    onChange={(e) => handleRateInputChange(e.target.value)}
                    className="w-full border-2 border-purple-400 p-2 rounded-lg font-black text-sm bg-white text-gray-900 outline-none"
                  />
                  <span className="text-[10px] text-gray-500 italic mt-0.5 block">
                    Typing here recalculates Total Cost = (Rate × {editingItem.multiplier}).
                  </span>
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <label className="block font-black text-gray-800 mb-1 uppercase">
                    2. Total Buying Cost for this Wedding (₹)
                  </label>
                  <input
                    ref={totalInputRef}
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="e.g. 8000"
                    value={editTotalCost}
                    onChange={(e) => handleTotalInputChange(e.target.value)}
                    className="w-full border-2 border-purple-400 p-2 rounded-lg font-black text-sm bg-white text-purple-950 outline-none"
                  />
                  <span className="text-[10px] text-gray-500 italic mt-0.5 block">
                    Typing here recalculates Unit Rate = (Total ÷ {editingItem.multiplier}).
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                {editingItem.isOverridden ? (
                  <button
                    type="button"
                    onClick={handleResetToMasterRate}
                    disabled={savingOverride}
                    className="text-red-600 hover:text-red-800 text-[11px] font-bold underline"
                  >
                    Reset to Master Rate
                  </button>
                ) : (
                  <span className="text-[10px] text-gray-400">Master price active</span>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditCostModal(false)}
                    className="px-3.5 py-1.5 border border-gray-300 font-bold rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingOverride}
                    className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-black rounded-lg text-xs shadow disabled:opacity-50"
                  >
                    {savingOverride ? "Saving..." : "Apply Custom Cost"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT-OPTIMIZED STYLES */}
      <style jsx global>{`
        @media print {
          body { background-color: white !important; color: black !important; }
          header, nav, button { display: none !important; }
          .print\\:hidden { display: none !important; }
          .print-avoid-break { page-break-inside: avoid !important; break-inside: avoid !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}