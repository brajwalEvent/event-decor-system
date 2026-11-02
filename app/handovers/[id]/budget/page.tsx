"use client";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, storage } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../../../../context/AuthContext";

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

export default function ProductionBudgetPage() {
  const params = useParams();
  const router = useRouter();
  const handoverId = params.id as string;
  const { user, role, isSuperAdmin, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [entertainmentCatalog, setEntertainmentCatalog] = useState<any[]>([]);

  // New Purchases State
  const [newPurchases, setNewPurchases] = useState<NewPurchaseItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields for New Purchases
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("Props & Structures");
  const [itemMaterial, setItemMaterial] = useState("");
  const [itemSize, setItemSize] = useState("");
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemCost, setItemCost] = useState<number>(0);
  const [itemNotes, setItemNotes] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  // =========================================================================
  // DYNAMIC COST OVERRIDE MODAL STATES (WEDDING-SPECIFIC)
  // =========================================================================
  const [showEditCostModal, setShowEditCostModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editUnitRate, setEditUnitRate] = useState<number | "">("");
  const [editTotalCost, setEditTotalCost] = useState<number | "">("");
  const [savingOverride, setSavingOverride] = useState(false);
  const rateInputRef = useRef<HTMLInputElement>(null);
  const totalInputRef = useRef<HTMLInputElement>(null);

  // Restrict Sales Team from seeing internal production budgets
  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && role === "sales" && !isSuperAdmin) {
      alert("Unauthorized: Sales team cannot view internal production budgets.");
      router.push(`/handovers/${handoverId}`);
    }
  }, [user, role, isSuperAdmin, loading, router]);

  const loadData = async () => {
    if (!handoverId) return;
    try {
      const [hSnap, entSnap] = await Promise.all([
        getDoc(doc(db, "handovers", handoverId)),
        getDocs(collection(db, "entertainment")),
      ]);

      if (hSnap.exists()) {
        const data = hSnap.data();
        setHandover(data);
        if (data.budgeting?.newPurchases) {
          setNewPurchases(data.budgeting.newPurchases);
        }
      }

      setEntertainmentCatalog(entSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading budget data:", err);
    }
  };

  useEffect(() => {
    if (handoverId) loadData();
  }, [handoverId]);

  // =========================================================================
  // HELPER: RESOLVE MASTER BUYING RATE
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

  // Deterministic unique key for each item
  const getItemKey = (item: any, scopePrefix: string, index: number) => {
    return item.id ? `${item.id}` : `${scopePrefix}_${item.itemId || item.name}_${item.variantName || 'std'}_${index}`;
  };

  // =========================================================================
  // MODAL TRIGGER & TWO-WAY LINKED CALCULATIONS
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

  // Save specific override for this wedding
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

  // Reset back to master catalog rate
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
  // CALCULATION LOGIC: MERGES SCOPE, OVERRIDES & BUYING RATES
  // =========================================================================
  let totalFreshCost = 0;
  let totalRentalCost = 0;
  let totalLaborCost = 0;

  const weddingWideBudgetItems: any[] = [];
  const eventWiseBudgetGroups: any[] = [];
  let totalOtherItemsCost = 0;

  if (handover) {
    const costOverrides = handover.budgeting?.costOverrides || {};

    // 1. Fresh Purchases & Rentals from Decor Components
    handover.days?.forEach((day: any) => {
      day.events?.forEach((ev: any) => {
        ev.decorComponents?.forEach((comp: any) => {
          comp.freshPurchases?.forEach((fp: any) => {
            totalFreshCost += Number(fp.estimatedCost) || 0;
          });
          comp.vendorRentals?.forEach((vr: any) => {
            totalRentalCost += Number(vr.estimatedCost) || 0;
          });
        });
      });
    });

    // 2. Process Wedding-Wide Essentials
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

      totalOtherItemsCost += subtotal;

      weddingWideBudgetItems.push({
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

    // 3. Process Event-Wise Items
    handover.days?.forEach((day: any, dIdx: number) => {
      day.events?.forEach((ev: any, eIdx: number) => {
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

          totalOtherItemsCost += subtotal;
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
          eventWiseBudgetGroups.push({
            dayName: day.dayName || day.date,
            eventName: ev.eventName,
            location: ev.locationInResort,
            items: eventItems,
            subtotal: eventSubtotal,
          });
        }
      });
    });

    // 4. Labor & Operations
    if (handover.laborPlanning?.items) {
      const globalMeal = handover.laborPlanning.globalCostPerMeal || 150;
      const globalTravel = handover.laborPlanning.globalTravelCost || 800;

      handover.laborPlanning.items.forEach((item: any) => {
        if (item.headcount > 0) {
          const activeDays = item.dayShifts.filter((d: any) => d.isActive);
          const shifts = item.headcount * activeDays.reduce((sum: number, d: any) => sum + Number(d.shifts), 0);
          const shiftCost = shifts * item.ratePerShift;
          const foodCost = item.headcount * activeDays.length * (item.mealsPerDay || 3) * (item.costPerMeal || globalMeal);
          const travelCost = item.headcount * (item.travelCostPerPerson || globalTravel);
          totalLaborCost += (shiftCost + foodCost + travelCost);
        }
      });
    }
  }

  // 5. New Purchases
  const totalNewPurchasesCost = newPurchases.reduce((sum, item) => sum + item.totalCost, 0);

  // GRAND TOTAL PRODUCTION COST
  const grandTotalProductionCost =
    totalFreshCost + totalRentalCost + totalOtherItemsCost + totalLaborCost + totalNewPurchasesCost;

  // Commercial P&L comparison
  const clientRevenue = Number(handover?.closedDealAmount || handover?.quotation?.finalOfferedPrice) || 0;
  const projectedGrossProfit = clientRevenue - grandTotalProductionCost;
  const projectedMarginPercent = clientRevenue > 0
    ? Math.round((projectedGrossProfit / clientRevenue) * 100)
    : 0;

  // Handlers for New Purchases
  const handleAddNewPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let imageUrl = "";
      if (imageFile) {
        const fileRef = ref(storage, `budget_purchases/${Date.now()}_${imageFile.name}`);
        await uploadBytes(fileRef, imageFile);
        imageUrl = await getDownloadURL(fileRef);
      }

      const newItem: NewPurchaseItem = {
        id: Date.now().toString(),
        name: itemName.trim(),
        category: itemCategory,
        material: itemMaterial.trim(),
        size: itemSize.trim(),
        quantity: Number(itemQty) || 1,
        unitCost: Number(itemCost) || 0,
        totalCost: (Number(itemQty) || 1) * (Number(itemCost) || 0),
        imageUrl,
        notes: itemNotes.trim(),
      };

      const updatedList = [...newPurchases, newItem];
      await updateDoc(doc(db, "handovers", handoverId), {
        "budgeting.newPurchases": updatedList,
        updatedAt: new Date().toISOString(),
      });

      setNewPurchases(updatedList);
      setShowModal(false);
      setItemName("");
      setItemMaterial("");
      setItemSize("");
      setItemQty(1);
      setItemCost(0);
      setItemNotes("");
      setImageFile(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save purchase item.");
    } finally {
      setSubmitting(false);
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

  if (loading || !handover) {
    return <div className="p-12 text-center text-xl font-bold font-mono">Compiling Production Budget...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 pb-20 print:bg-white print:p-0">
      {/* HEADER */}
      <div className="bg-white border-b-2 border-gray-300 shadow-sm sticky top-16 z-30 print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={() => router.push(`/handovers/${handoverId}`)}
                className="text-xs font-bold text-gray-600 hover:text-black flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-md border transition"
              >
                ← Back to Handover Workspace
              </button>
            </div>
            <h1 className="text-2xl font-black text-gray-900">Production Execution Budget</h1>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">
              Internal Procurement Costing for <strong>{handover.title}</strong>
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow transition flex items-center gap-1.5"
          >
            🖨️ Export Budget PDF
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-6">

        {/* 1. FINANCIAL SUMMARY & PROFIT MARGIN OVERVIEW */}
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

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 text-center">
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400 print:text-gray-500">Fresh Purchases</p>
              <p className="text-base md:text-lg font-mono font-black mt-0.5">₹{totalFreshCost.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400 print:text-gray-500">Vendor Rentals</p>
              <p className="text-base md:text-lg font-mono font-black mt-0.5">₹{totalRentalCost.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400 print:text-gray-500">Other Items & SFX</p>
              <p className="text-base md:text-lg font-mono font-black mt-0.5 text-purple-400 print:text-purple-700">
                ₹{totalOtherItemsCost.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400 print:text-gray-500">Labor & Operations</p>
              <p className="text-base md:text-lg font-mono font-black mt-0.5 text-amber-400 print:text-amber-700">
                ₹{totalLaborCost.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400 print:text-gray-500">New Assets Bought</p>
              <p className="text-base md:text-lg font-mono font-black mt-0.5 text-blue-400 print:text-blue-700">
                ₹{totalNewPurchasesCost.toLocaleString()}
              </p>
            </div>
          </div>
        </section>

        {/* 2. OTHER ITEMS & SFX BUYING COST BREAKDOWN */}
        <section className="bg-white border-2 border-purple-300 rounded-2xl p-6 shadow-sm space-y-6 print-avoid-break">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-purple-200 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase text-purple-700 block tracking-wider">
                Internal Procurement Breakdown
              </span>
              <h3 className="text-xl font-black text-gray-900">
                Other Items & SFX Costing
              </h3>
              <p className="text-xs text-gray-500">
                Default rates fetched from Vendor Costs Master. Click <strong>✎</strong> to override rates for this specific wedding.
              </p>
            </div>
            <span className="text-lg font-black font-mono text-purple-900 bg-purple-100 px-3 py-1 rounded-lg">
              Subtotal: ₹{totalOtherItemsCost.toLocaleString()}
            </span>
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
                        
                        {/* Buying Rate with Edit Button */}
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

                        {/* Total Cost with Edit Button */}
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

          {/* Event-Wise Items Table */}
          {eventWiseBudgetGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                <span className="text-xs font-black text-gray-900 uppercase">
                  🗓️ {group.dayName} — {group.eventName} {group.location ? `(${group.location})` : ""}
                </span>
                <span className="text-xs font-black font-mono text-purple-900">
                  Event Buying Total: ₹{group.subtotal.toLocaleString()}
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

                        {/* Buying Rate with Edit Button */}
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

                        {/* Total Cost with Edit Button */}
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

        {/* 3. LABOR & OPERATIONS BREAKDOWN */}
        <section className="bg-white border-2 border-amber-300 rounded-2xl p-5 shadow-sm print-avoid-break">
          <h3 className="text-sm font-black text-amber-950 uppercase border-b pb-2 flex justify-between">
            <span>👷 Labor & Operations Breakdown</span>
            <span className="font-mono">Subtotal: ₹{totalLaborCost.toLocaleString()}</span>
          </h3>
          <div className="pt-3 space-y-2">
            {handover.laborPlanning?.items?.filter((i: any) => i.headcount > 0).map((item: any, idx: number) => {
              const activeDays = item.dayShifts.filter((d: any) => d.isActive);
              const shifts = item.headcount * activeDays.reduce((sum: number, d: any) => sum + Number(d.shifts), 0);
              const shiftCost = shifts * item.ratePerShift;
              const foodCost = item.headcount * activeDays.length * (item.mealsPerDay || 3) * (item.costPerMeal || handover.laborPlanning.globalCostPerMeal || 150);
              const travelCost = item.headcount * (item.travelCostPerPerson || handover.laborPlanning.globalTravelCost || 800);

              return (
                <div key={idx} className="flex justify-between items-center text-xs bg-gray-50 p-2.5 rounded-lg border font-mono">
                  <span className="font-bold text-gray-900">{item.headcount}x {item.name}</span>
                  <span className="font-bold text-amber-900">₹{(shiftCost + foodCost + travelCost).toLocaleString()}</span>
                </div>
              );
            })}
            {(!handover.laborPlanning?.items || handover.laborPlanning.items.filter((i: any) => i.headcount > 0).length === 0) && (
              <p className="text-xs text-gray-500 italic">No labor planner configured yet.</p>
            )}
          </div>
        </section>

        {/* 4. NEW PURCHASES (WEDDING SPECIFIC CAPEX) */}
        <section className="bg-white border-2 border-blue-300 rounded-2xl p-6 shadow-sm space-y-4 print-avoid-break">
          <div className="flex justify-between items-center border-b border-blue-200 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase text-blue-700 block tracking-wider">
                Capital Expenditure / Asset Procurement
              </span>
              <h2 className="text-xl font-black text-gray-900">
                New Purchases Specifically for this Wedding
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-lg font-black font-mono text-blue-800">
                Total: ₹{totalNewPurchasesCost.toLocaleString()}
              </span>
              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-700 hover:bg-blue-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow print:hidden"
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

      {/* MODAL 1: DYNAMIC COST ADJUSTMENT (TWO-WAY RATE <-> TOTAL BINDING) */}
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
              {/* Scope & Quantity Indicator */}
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

              {/* Linked Two-Way Inputs */}
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

      {/* MODAL 2: ADD NEW PURCHASE */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border-2 border-blue-400 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-lg font-black text-gray-900">Add New Purchase Item</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 font-black text-xl hover:text-black">✕</button>
            </div>

            <form onSubmit={handleAddNewPurchase} className="space-y-3 text-xs">
              <div>
                <label className="block font-black text-gray-800 mb-1">Item Name *</label>
                <input required placeholder="e.g. Custom Neon Sign, Velvet Sofa" value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1">Category</label>
                  <select value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white">
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
                  <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files ? e.target.files[0] : null)} className="w-full border-2 border-gray-300 p-1.5 rounded-lg font-bold bg-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1">Material</label>
                  <input placeholder="e.g. Wood, Velvet, Acrylic" value={itemMaterial} onChange={(e) => setItemMaterial(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white" />
                </div>
                <div>
                  <label className="block font-black text-gray-800 mb-1">Size / Dimensions</label>
                  <input placeholder="e.g. 8x4 ft" value={itemSize} onChange={(e) => setItemSize(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-blue-50 p-3 rounded-xl border border-blue-200">
                <div>
                  <label className="block font-black text-blue-950 mb-1">Quantity *</label>
                  <input type="number" min="1" required value={itemQty} onChange={(e) => setItemQty(Number(e.target.value))} className="w-full border-2 border-blue-300 p-2 rounded-lg font-bold text-center bg-white" />
                </div>
                <div>
                  <label className="block font-black text-blue-950 mb-1">Unit Cost (₹) *</label>
                  <input type="number" min="0" required value={itemCost || ""} onChange={(e) => setItemCost(Number(e.target.value))} className="w-full border-2 border-blue-300 p-2 rounded-lg font-bold text-right bg-white" />
                </div>
              </div>

              <div>
                <label className="block font-black text-gray-800 mb-1">Sourcing Notes / Vendor Info</label>
                <input placeholder="e.g. Buy from Chandni Chowk vendor" value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-1.5 border font-bold rounded-lg text-xs">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-black rounded-lg shadow disabled:opacity-50">
                  {submitting ? "Saving..." : "Save Purchase Item"}
                </button>
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